/**
 * lib/policy-file-extractor.ts
 *
 * Phase 2.3 — 파일 buffer → 텍스트 추출 (officeparser).
 * PPTX / PDF / DOCX / XLSX / TXT 모두 지원.
 *
 * 사용자 통찰 (2026-05-28):
 *   「그냥 파일 등록하면 자동 항목 입력되어야 하는데 사용자 입력 너무 많다」
 *   → 본문 텍스트 paste → 파일 드롭 + 자동 추출 으로 전환.
 *
 * Rule 3 안전망:
 *   - 30초 timeout (큰 PPTX 도 대응)
 *   - graceful — 추출 실패 시 명확한 에러 메시지
 *   - 50MB 크기 제한
 */

// Phase 2.3 hotfix7 (2026-05-28): officeparser 7.x API 근본 변경 발견.
// types.d.ts 확인:
//   parseOffice 는 file path 받음 (Buffer 아님)
//   결과는 OfficeParserAST 객체 — .toText() 로 plain text 추출
//   const ast = await OfficeParser.parseOffice('document.docx', {...})
//   console.log(ast.toText())  // Plain text
//
// 흐름 변경:
//   buffer → /tmp 임시 파일 저장 → parseOffice(path) → ast.toText() → /tmp 삭제
interface OfficeAst {
  toText: () => string
}
type ParseOfficeFn = (input: string | Buffer, config?: Record<string, unknown>) => Promise<OfficeAst | string>
let _parseFn: ParseOfficeFn | null = null

async function getParseOffice(): Promise<ParseOfficeFn> {
  if (_parseFn) return _parseFn
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mod: any = await import('officeparser')
  const fn: unknown = mod.parseOffice || mod.default?.parseOffice
  if (typeof fn !== 'function') {
    const keys = Object.keys(mod || {}).join(',')
    throw new Error(`officeparser parseOffice 함수 인식 실패. mod keys: [${keys}]`)
  }
  _parseFn = fn as ParseOfficeFn
  return _parseFn
}

const MAX_FILE_SIZE = 50 * 1024 * 1024  // 50MB
const TIMEOUT_MS = 60_000  // 60s (Cloud Run + chunk Gemini 여유)

export interface FileExtractionResult {
  text: string
  size_bytes: number
  ext: string
  truncated: boolean
  warnings: string[]
}

export const SUPPORTED_EXTS = ['pptx', 'pdf', 'docx', 'xlsx', 'txt'] as const
type OfficeFileType = 'pptx' | 'pdf' | 'docx' | 'xlsx' | 'txt'

/**
 * 파일명에서 확장자 추출 (소문자).
 */
export function extractExt(fileName: string): string {
  const m = fileName.toLowerCase().match(/\.([a-z0-9]+)$/)
  return m ? m[1] : ''
}

/**
 * Phase 2.3 hotfix6 (2026-05-28) — 견고한 파일 형식 자동 감지.
 * 사용자 통찰: 「무슨 파일이 오던 인식할 수 있어야죠」.
 *
 * 흐름:
 *   1. magic bytes (첫 8바이트) 로 실제 형식 탐지
 *   2. 확장자 와 교차 검증
 *   3. 구버전 (.ppt/.doc/.xls) 은 변환 권장 안내
 *   4. 확장자 없어도 magic bytes 로 추론
 *
 * Magic bytes:
 *   - ZIP (PPTX/DOCX/XLSX 컨테이너):  50 4B 03 04 (PK..)
 *   - PDF:                            25 50 44 46 2D (%PDF-)
 *   - OLE2 (구버전 .ppt/.doc/.xls):   D0 CF 11 E0
 *   - RTF:                            7B 5C 72 74 ({\rt)
 *   - TXT/UTF-8 BOM:                  EF BB BF
 */
export function detectFileType(buffer: Buffer, fileName: string): { fileType: OfficeFileType; warnings: string[]; raw_detection: string } {
  const warnings: string[] = []
  const ext = extractExt(fileName)
  const head4 = buffer.slice(0, 4).toString('hex').toUpperCase()
  const head5 = buffer.slice(0, 5).toString('ascii')

  let magicType: 'zip' | 'pdf' | 'ole2' | 'rtf' | 'text' | 'unknown' = 'unknown'
  if (head4 === '504B0304' || head4 === '504B0506' || head4 === '504B0708') magicType = 'zip'
  else if (head5 === '%PDF-') magicType = 'pdf'
  else if (head4 === 'D0CF11E0') magicType = 'ole2'
  else if (head4.startsWith('7B5C72')) magicType = 'rtf'
  else {
    // text 추정 — 첫 200 바이트가 출력 가능 ASCII/UTF-8 인지
    const sample = buffer.slice(0, 200).toString('utf-8')
    if (/^[\x09\x0A\x0D\x20-\x7E\xA0-￿]+/.test(sample)) magicType = 'text'
  }

  const raw_detection = `ext=.${ext || '?'} / magic=${magicType} (${head4})`

  // 확장자 → fileType 매핑 (구버전 fallback 포함)
  const EXT_MAP: Record<string, OfficeFileType> = {
    pptx: 'pptx', pdf: 'pdf', docx: 'docx', xlsx: 'xlsx', txt: 'txt',
    // 구버전 — 변환 시도 (실패 가능 → warning)
    ppt: 'pptx', doc: 'docx', xls: 'xlsx',
    // 다른 일반 확장자
    csv: 'txt', md: 'txt', json: 'txt', xml: 'txt', log: 'txt', html: 'txt',
  }

  // 1. 확장자 우선 (가장 신뢰)
  if (ext && EXT_MAP[ext]) {
    const ft = EXT_MAP[ext]
    // 구버전 OLE2 경고
    if ((ext === 'ppt' || ext === 'doc' || ext === 'xls') && magicType === 'ole2') {
      warnings.push(`구버전 Office 형식 (.${ext}) 감지 — officeparser 지원 제한적. .${ext}x 로 변환 권장.`)
    }
    // 확장자 ≠ magic 불일치 경고
    if (ft === 'pdf' && magicType !== 'pdf') {
      warnings.push(`확장자 .pdf 인데 magic bytes 는 ${magicType} — 파일 손상 가능성`)
    }
    if ((ft === 'pptx' || ft === 'docx' || ft === 'xlsx') && magicType !== 'zip' && magicType !== 'ole2') {
      warnings.push(`확장자 .${ext} 인데 magic bytes 는 ${magicType} — 파일 손상 가능성`)
    }
    return { fileType: ft, warnings, raw_detection }
  }

  // 2. 확장자 없거나 인식 안 됨 — magic bytes 로 결정
  warnings.push(`확장자 인식 실패 (.${ext || '?'}) — magic bytes (${magicType}) 로 추론`)
  if (magicType === 'pdf')  return { fileType: 'pdf',  warnings, raw_detection }
  if (magicType === 'zip')  return { fileType: 'pptx', warnings: [...warnings, 'ZIP 컨테이너 — PPTX 로 시도 (DOCX/XLSX 가능)'], raw_detection }
  if (magicType === 'text') return { fileType: 'txt',  warnings, raw_detection }
  if (magicType === 'ole2') return { fileType: 'docx', warnings: [...warnings, '구버전 OLE2 — DOCX 로 시도 (실패 가능)'], raw_detection }
  if (magicType === 'rtf')  return { fileType: 'txt',  warnings: [...warnings, 'RTF 형식 — 단순 텍스트 추출만 가능'], raw_detection }

  throw new Error(
    `파일 형식 인식 실패. ${raw_detection}. ` +
    `지원 형식: PPTX/PDF/DOCX/XLSX/TXT (구버전 .ppt/.doc/.xls 는 .${ext}x 로 변환 권장).`
  )
}

/**
 * Buffer → 텍스트 추출. officeparser 가 PPTX/PDF/DOCX/XLSX 모두 처리.
 * TXT 는 단순 UTF-8 디코딩.
 */
export async function extractTextFromBuffer(
  buffer: Buffer,
  fileName: string
): Promise<FileExtractionResult> {
  if (buffer.length > MAX_FILE_SIZE) {
    throw new Error(`파일 크기 초과 (${(buffer.length / 1024 / 1024).toFixed(1)}MB > ${MAX_FILE_SIZE / 1024 / 1024}MB)`)
  }

  // Phase 2.3 hotfix6 — 견고한 파일 형식 자동 감지 (magic bytes + 확장자 교차)
  const detection = detectFileType(buffer, fileName)
  const fileType = detection.fileType
  const warnings: string[] = [...detection.warnings]
  const ext = fileType  // officeparser fileType 으로 사용

  console.log(`[policy-file-extractor] ${fileName} — ${detection.raw_detection} → fileType=${fileType}`)

  // TXT 는 단순 UTF-8 (BOM 제거)
  if (fileType === 'txt') {
    let text = buffer.toString('utf-8')
    if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1)  // BOM 제거
    return {
      text,
      size_bytes: buffer.length,
      ext,
      truncated: false,
      warnings,
    }
  }

  // officeparser dynamic load (named export parseOffice)
  let parseOffice: ParseOfficeFn
  try {
    parseOffice = await getParseOffice()
  } catch (loadErr) {
    const lm = loadErr instanceof Error ? loadErr.message : String(loadErr)
    throw new Error(`officeparser 모듈 로드 실패: ${lm}`)
  }

  // Phase 2.3 hotfix7 (2026-05-28): buffer → /tmp 임시 파일 → file path 전달 → AST.toText().
  // officeparser 7.x API: parseOffice(path, config) → OfficeParserAST.
  const { writeFile, unlink } = await import('fs/promises')
  const { join } = await import('path')
  const { randomUUID } = await import('crypto')

  const tmpFileName = `${randomUUID()}.${ext}`
  const tmpPath = join('/tmp', tmpFileName)

  let extractedText: string
  try {
    await writeFile(tmpPath, buffer)
    console.log(`[policy-file-extractor] 임시 파일 저장: ${tmpPath} (${buffer.length} bytes)`)

    const result = await Promise.race([
      parseOffice(tmpPath, {
        extractAttachments: false,
        includeRawContent: false,
        ocr: false,
      }).catch((err: unknown) => {
        const em = err instanceof Error
          ? `${err.message}${err.stack ? ' | stack: ' + err.stack.split('\n').slice(0, 3).join(' / ') : ''}`
          : String(err)
        console.error(`[policy-file-extractor] officeparser .${ext} 실패:`, err)
        throw new Error(`officeparser 추출 실패 (.${ext}): ${em}`)
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`텍스트 추출 timeout (${TIMEOUT_MS / 1000}초)`)), TIMEOUT_MS)
      ),
    ])

    // AST 객체 또는 string — 둘 다 처리
    if (typeof result === 'string') {
      extractedText = result
    } else if (result && typeof (result as OfficeAst).toText === 'function') {
      extractedText = (result as OfficeAst).toText()
    } else {
      // 모르는 형태 — JSON 직렬화 fallback
      extractedText = JSON.stringify(result).substring(0, 1_000_000)
      warnings.push(`AST 객체 toText() 메서드 없음 — JSON 직렬화 fallback (${extractedText.length} chars)`)
    }
    console.log(`[policy-file-extractor] 추출 완료: ${extractedText.length} chars`)
  } finally {
    // 임시 파일 삭제 (실패해도 무시)
    await unlink(tmpPath).catch(() => { /* graceful */ })
  }

  const extracted = extractedText

  if (!extracted || extracted.trim().length < 50) {
    warnings.push('추출된 텍스트가 매우 짧음 — 파일이 이미지/스캔본일 가능성')
  }

  return {
    text: extracted || '',
    size_bytes: buffer.length,
    ext,
    truncated: false,
    warnings,
  }
}
