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

// Phase 2.3 hotfix2 (2026-05-28): officeparser ESM/CJS export 구조 다양성 대응.
// 사용자 진단: "k.parseOfficeAsync is not a function" — root 에 함수 없음.
type ParseOfficeAsyncFn = (buffer: Buffer, config?: Record<string, unknown>) => Promise<string>
let _parseFn: ParseOfficeAsyncFn | null = null

async function getParseOfficeAsync(): Promise<ParseOfficeAsyncFn> {
  if (_parseFn) return _parseFn
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mod: any = await import('officeparser')
  // 가능한 모든 export 경로 시도:
  const candidates: Array<unknown> = [
    mod.parseOfficeAsync,
    mod.default?.parseOfficeAsync,
    mod.default,
    mod,
  ]
  const fn = candidates.find((c) => typeof c === 'function') as ParseOfficeAsyncFn | undefined
  if (!fn) {
    const keys = Object.keys(mod || {}).join(',')
    const defKeys = mod?.default ? Object.keys(mod.default).join(',') : '(no default)'
    throw new Error(`officeparser parseOfficeAsync 함수 인식 실패. mod keys: [${keys}] / default keys: [${defKeys}]`)
  }
  _parseFn = fn
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

/**
 * 파일명에서 확장자 추출 (소문자).
 */
export function extractExt(fileName: string): string {
  const m = fileName.toLowerCase().match(/\.([a-z0-9]+)$/)
  return m ? m[1] : ''
}

/**
 * Buffer → 텍스트 추출. officeparser 가 PPTX/PDF/DOCX/XLSX 모두 처리.
 * TXT 는 단순 UTF-8 디코딩.
 */
export async function extractTextFromBuffer(
  buffer: Buffer,
  fileName: string
): Promise<FileExtractionResult> {
  const warnings: string[] = []
  const ext = extractExt(fileName)

  if (buffer.length > MAX_FILE_SIZE) {
    throw new Error(`파일 크기 초과 (${(buffer.length / 1024 / 1024).toFixed(1)}MB > ${MAX_FILE_SIZE / 1024 / 1024}MB)`)
  }

  if (!SUPPORTED_EXTS.includes(ext as typeof SUPPORTED_EXTS[number])) {
    throw new Error(`지원 안 되는 형식: .${ext} — PPTX/PDF/DOCX/XLSX/TXT 만 가능`)
  }

  // TXT 는 단순 UTF-8
  if (ext === 'txt') {
    const text = buffer.toString('utf-8')
    return {
      text,
      size_bytes: buffer.length,
      ext,
      truncated: false,
      warnings,
    }
  }

  // officeparser dynamic load + export 구조 자동 탐지
  let parseOfficeAsync: ParseOfficeAsyncFn
  try {
    parseOfficeAsync = await getParseOfficeAsync()
  } catch (loadErr) {
    const lm = loadErr instanceof Error ? loadErr.message : String(loadErr)
    throw new Error(`officeparser 모듈 로드 실패: ${lm}`)
  }

  // officeparser timeout race
  const extracted = await Promise.race([
    parseOfficeAsync(buffer, {
      newlineDelimiter: '\n',
      ignoreNotes: false,
      putNotesAtLast: true,
    }).catch((err: unknown) => {
      const em = err instanceof Error ? err.message : String(err)
      throw new Error(`officeparser 추출 실패 (.${ext}): ${em}`)
    }),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`텍스트 추출 timeout (${TIMEOUT_MS / 1000}초)`)), TIMEOUT_MS)
    ),
  ])

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
