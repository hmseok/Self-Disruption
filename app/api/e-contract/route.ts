import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

// GET: list contracts for a company
export async function GET(req: Request) {
  const supabase = createRouteHandlerClient({ cookies })
  const { searchParams } = new URL(req.url)
  const company_id = searchParams.get('company_id')
  const status = searchParams.get('status')

  if (!company_id) return NextResponse.json({ error: 'company_id required' }, { status: 400 })

  let query = supabase
    .from('short_term_rental_contracts')
    .select('*')
    .order('created_at', { ascending: false })

  if (status && status !== 'all') query = query.eq('status', status)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ items: data })
}

// POST: create new contract
export async function POST(req: Request) {
  const supabase = createRouteHandlerClient({ cookies })
  const body = await req.json()

  const { data, error } = await supabase
    .from('short_term_rental_contracts')
    .insert(body)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
