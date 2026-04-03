#!/usr/bin/env node
/**
 * 누락 행 진단 스크립트
 *
 * Supabase에서 ID 목록을 가져온 후, 각 ID로 개별 조회하여
 * 어떤 행이 select('*')에서 누락되는지 파악합니다.
 *
 * 실행: node 07_debug_missing.js corporate_cards
 *       node 07_debug_missing.js business_rules
 */

const { createClient } = require('@supabase/supabase-js')

const SUPABASE_URL = 'https://uiyiwgkpchnvuvpsjfxv.supabase.co'
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVpeWl3Z2twY2hudnV2cHNqZnh2Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2OTY2OTA0OCwiZXhwIjoyMDg1MjQ1MDQ4fQ.wrYL2q5Mvcna6ZGlmAOHELWMMNWGoVyGztITMeF83lA'

const table = process.argv[2]
if (!table) {
  console.error('사용법: node 07_debug_missing.js 테이블명')
  process.exit(1)
}

async function main() {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false }
  })

  console.log(`\n🔍 [${table}] 누락 행 진단\n`)

  // 1. ID 목록 전체 수집
  const { data: idRows, error: idErr } = await supabase
    .from(table)
    .select('id')

  if (idErr) { console.error('ID 조회 실패:', idErr.message); process.exit(1) }
  console.log(`ID 조회 결과: ${idRows.length}건`)

  const nullIds = idRows.filter(r => r.id == null)
  const validIds = idRows.filter(r => r.id != null).map(r => r.id)
  console.log(`  유효 ID: ${validIds.length}개, NULL ID: ${nullIds.length}개`)

  // 2. select('*') 전체 조회
  const { data: allRows, error: allErr } = await supabase
    .from(table)
    .select('*')

  if (allErr) { console.error('전체 조회 실패:', allErr.message); process.exit(1) }
  console.log(`select('*') 결과: ${allRows.length}건`)

  const fetchedIds = new Set(allRows.map(r => r.id).filter(Boolean))
  const missingIds = validIds.filter(id => !fetchedIds.has(id))

  console.log(`\n누락된 ID (${missingIds.length}개):`)
  if (missingIds.length === 0) {
    console.log('  없음 — 모든 행이 select("*")에서 반환됨')
  } else {
    missingIds.forEach(id => console.log(`  - ${id}`))
  }

  // 3. 누락된 ID 개별 조회 시도
  if (missingIds.length > 0) {
    console.log('\n개별 조회 시도:')
    for (const id of missingIds.slice(0, 5)) {  // 최대 5개만
      const { data, error } = await supabase
        .from(table)
        .select('*')
        .eq('id', id)

      if (error) {
        console.log(`  ❌ id=${id}: 오류 — ${error.message}`)
      } else if (!data || data.length === 0) {
        console.log(`  ⬜ id=${id}: 빈 결과 (존재하지만 필터됨)`)
      } else {
        const row = data[0]
        const problematicCols = Object.entries(row)
          .filter(([k, v]) => v !== null && typeof v === 'string' && v.length > 10000)
          .map(([k, v]) => `${k}(${v.length}자)`)

        if (problematicCols.length > 0) {
          console.log(`  ⚠  id=${id}: 대용량 컬럼 발견 — ${problematicCols.join(', ')}`)
        } else {
          console.log(`  ✅ id=${id}: 개별 조회 성공 (컬럼 수: ${Object.keys(row).length})`)
        }
      }
    }
  }

  // 4. NULL ID 행 조회 시도
  if (nullIds.length > 0) {
    console.log(`\nNULL ID 행 (${nullIds.length}개) 조회 시도:`)
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .is('id', null)

    if (error) {
      console.log(`  ❌ 오류: ${error.message}`)
    } else {
      console.log(`  결과: ${data?.length ?? 0}건`)
      if (data && data[0]) {
        console.log(`  첫 행 컬럼: ${Object.keys(data[0]).join(', ')}`)
      }
    }
  }

  // 5. 컬럼 목록 확인
  if (allRows.length > 0) {
    const cols = Object.keys(allRows[0])
    console.log(`\n컬럼 목록 (${cols.length}개): ${cols.join(', ')}`)
  }
}

main().catch(err => {
  console.error('오류:', err.message)
  process.exit(1)
})
