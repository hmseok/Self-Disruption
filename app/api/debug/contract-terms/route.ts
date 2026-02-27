import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function GET() {
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // 1. contract_terms 전체 조회 (service role = RLS 무시)
  const { data: allTerms, error: e1 } = await sb
    .from('contract_terms')
    .select('id, company_id, version, title, contract_category, status, created_at')
    .order('created_at', { ascending: false })
    .limit(20)

  // 2. companies 목록
  const { data: companies, error: e2 } = await sb
    .from('companies')
    .select('id, name')
    .limit(10)

  // 3. contract_term_articles 수
  const { count: articleCount, error: e3 } = await sb
    .from('contract_term_articles')
    .select('id', { count: 'exact', head: true })

  // 4. contract_special_terms 수
  const { count: specialCount, error: e4 } = await sb
    .from('contract_special_terms')
    .select('id', { count: 'exact', head: true })

  return NextResponse.json({
    contract_terms: { data: allTerms, error: e1?.message },
    companies: { data: companies, error: e2?.message },
    article_count: { count: articleCount, error: e3?.message },
    special_terms_count: { count: specialCount, error: e4?.message },
  })
}
