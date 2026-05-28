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

const officeParser = require('officeparser') as {
  parseOfficeAsync: (buffer: Buffer, config?: Record<string, unknown>) => Promise<string>
}

const MAX_FILE_SIZE = 50 * 1024 * 1024  // 50MB
const TIMEOUT_MS = 30_000

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

  // officeparser timeout race
  const extracted = await Promise.race([
    officeParser.parseOfficeAsync(buffer, {
      newlineDelimiter: '\n',
      ignoreNotes: false,
      putNotesAtLast: true,
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
