import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// POST: expense_receipts 테이블에 memo 컬럼 추가
export async function POST(request: NextRequest) {
  const supabase = getSupabaseAdmin()

  // memo 컬럼 존재 여부 테스트: 빈 업데이트 시도
  const { error: testErr } = await supabase
    .from('expense_receipts')
    .update({ memo: '' })
    .eq('id', '00000000-0000-0000-0000-000000000000') // 존재하지 않는 ID

  if (testErr && (testErr.message?.includes('memo') || testErr.message?.includes('column'))) {
    // memo 컬럼이 없음 → RPC로 추가 시도
    const { error: rpcErr } = await supabase.rpc('exec_sql', {
      query: `ALTER TABLE expense_receipts ADD COLUMN IF NOT EXISTS memo text DEFAULT '';`
    })

    if (rpcErr) {
      // RPC가 없으면 직접 REST API로 시도
      try {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY!
        const res = await fetch(`${url}/rest/v1/rpc/exec_sql`, {
          method: 'POST',
          headers: {
            'apikey': key,
            'Authorization': `Bearer ${key}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            query: `ALTER TABLE expense_receipts ADD COLUMN IF NOT EXISTS memo text DEFAULT '';`
          }),
        })
        if (!res.ok) {
          return NextResponse.json({
            success: false,
            error: 'memo 컬럼 추가 실패. Supabase 대시보드에서 직접 추가해주세요.',
            instructions: 'Supabase Dashboard → SQL Editor → 아래 쿼리 실행:\nALTER TABLE expense_receipts ADD COLUMN IF NOT EXISTS memo text DEFAULT \'\';',
            rpcError: rpcErr.message,
          }, { status: 500 })
        }
      } catch (fetchErr: any) {
        return NextResponse.json({
          success: false,
          error: 'memo 컬럼 추가 실패',
          instructions: 'Supabase Dashboard → SQL Editor → 아래 쿼리 실행:\nALTER TABLE expense_receipts ADD COLUMN IF NOT EXISTS memo text DEFAULT \'\';',
          detail: fetchErr.message,
        }, { status: 500 })
      }
    }

    return NextResponse.json({ success: true, message: 'memo 컬럼이 추가되었습니다.' })
  }

  return NextResponse.json({ success: true, message: 'memo 컬럼이 이미 존재합니다.' })
}
