import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET() {
  try {
    // 1. contract_terms 전체 조회
    const allTerms = await prisma.$queryRaw<any[]>`
      SELECT id, version, title, contract_category, status, created_at
      FROM contract_terms
      ORDER BY created_at DESC
      LIMIT 20
    `

    // 2. companies 목록
    const companies = await prisma.$queryRaw<any[]>`
      SELECT id, name
      FROM companies
      LIMIT 10
    `

    // 3. contract_term_articles 수
    const articleCountResult = await prisma.$queryRaw<[{ count: bigint }]>`
      SELECT COUNT(*) as count FROM contract_term_articles
    `
    const articleCount = Number(articleCountResult[0]?.count || 0)

    // 4. contract_special_terms 수
    const specialCountResult = await prisma.$queryRaw<[{ count: bigint }]>`
      SELECT COUNT(*) as count FROM contract_special_terms
    `
    const specialCount = Number(specialCountResult[0]?.count || 0)

    return NextResponse.json({
      contract_terms: { data: allTerms, error: null },
      companies: { data: companies, error: null },
      article_count: { count: articleCount, error: null },
      special_terms_count: { count: specialCount, error: null },
    })
  } catch (error: any) {
    return NextResponse.json({
      contract_terms: { data: null, error: error.message },
      companies: { data: null, error: error.message },
      article_count: { count: 0, error: error.message },
      special_terms_count: { count: 0, error: error.message },
    })
  }
}
