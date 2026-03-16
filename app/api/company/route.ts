import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

// GET /api/company?id=xxx — 회사 정보 조회
// GET /api/company?columns=true — 컬럼명 조회 (디버그)
export async function GET(req: NextRequest) {
  try {
    const companyId = req.nextUrl.searchParams.get('id')
    if (!companyId) {
      return NextResponse.json({ error: '회사 ID가 필요합니다.' }, { status: 400 })
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey)
    const { data, error } = await supabase
      .from('companies')
      .select('*')
      .eq('id', companyId)
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json(data)
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// PATCH /api/company — 회사 정보 수정 (존재하는 컬럼만 동적 업데이트)
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json()
    const { id, ...fields } = body

    if (!id) {
      return NextResponse.json({ error: '회사 ID가 필요합니다.' }, { status: 400 })
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // 먼저 현재 데이터를 조회하여 실제 존재하는 컬럼만 업데이트
    const { data: current, error: fetchErr } = await supabase
      .from('companies')
      .select('*')
      .eq('id', id)
      .single()

    if (fetchErr || !current) {
      return NextResponse.json({ error: fetchErr?.message || '회사를 찾을 수 없습니다.' }, { status: 500 })
    }

    // 실제 테이블에 존재하는 컬럼만 필터링
    const existingColumns = Object.keys(current)
    const updatePayload: Record<string, any> = {}
    for (const [key, value] of Object.entries(fields)) {
      if (existingColumns.includes(key)) {
        updatePayload[key] = value
      }
    }

    // 없는 컬럼은 ALTER TABLE로 추가 시도
    const missingColumns = Object.keys(fields).filter(k => !existingColumns.includes(k))
    for (const col of missingColumns) {
      try {
        await supabase.rpc('exec_sql', {
          sql: `ALTER TABLE companies ADD COLUMN IF NOT EXISTS ${col} TEXT DEFAULT ''`
        }).throwOnError()
        updatePayload[col] = fields[col]
      } catch {
        // rpc 없으면 스킵 — 나중에 수동으로 추가 필요
        console.warn(`[company PATCH] 컬럼 ${col} 추가 실패 (수동 추가 필요)`)
      }
    }

    if (Object.keys(updatePayload).length === 0) {
      return NextResponse.json({ error: '업데이트할 필드가 없습니다.', missingColumns }, { status: 400 })
    }

    const { error } = await supabase
      .from('companies')
      .update(updatePayload)
      .eq('id', id)

    if (error) {
      return NextResponse.json({ error: error.message, columns: existingColumns, missingColumns }, { status: 500 })
    }

    return NextResponse.json({ success: true, updated: Object.keys(updatePayload), missingColumns })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
