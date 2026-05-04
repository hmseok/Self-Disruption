import { NextResponse } from 'next/server'
import accidents from '../../_data/accidents.json'

export const dynamic = 'force-dynamic'

// /api/accidents?from=YYYYMMDD&to=YYYYMMDD&status=&factcode=
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const from = searchParams.get('from') || ''
  const to = searchParams.get('to') || ''
  const status = searchParams.get('status') || ''
  const factcode = searchParams.get('factcode') || ''

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let list = accidents as any[]
  if (from) list = list.filter(a => a.accidentDate >= from)
  if (to) list = list.filter(a => a.accidentDate <= to)
  if (status) list = list.filter(a => a.status === status)
  if (factcode) list = list.filter(a => a.factcode === factcode)

  return NextResponse.json({ success: true, data: list })
}
