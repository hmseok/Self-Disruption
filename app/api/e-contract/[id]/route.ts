import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = createRouteHandlerClient({ cookies })
  const { id } = await params
  const { data, error } = await supabase
    .from('short_term_rental_contracts')
    .select('*')
    .eq('id', id)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 404 })
  return NextResponse.json(data)
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = createRouteHandlerClient({ cookies })
  const { id } = await params
  const body = await req.json()

  const { data, error } = await supabase
    .from('short_term_rental_contracts')
    .update(body)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
