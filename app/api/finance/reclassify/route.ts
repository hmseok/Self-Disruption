import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// ── AI 재분류 API ──
// POST: 이미 저장된 미분류 거래들을 Gemini로 재분류

const GEMINI_API_KEY = process.env.GEMINI_API_KEY

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

const CATEGORY_LIST = [
  '렌트/운송수입', '지입 관리비/수수료', '투자원금 입금', '지입 초기비용/보증금',
  '대출 실행(입금)', '이자/잡이익', '보험금 수령',
  '지입 수익배분금(출금)', '유류비', '정비/수리비', '차량보험료',
  '자동차세/공과금', '차량할부/리스료', '이자비용(대출/투자)', '원금상환',
  '급여(정규직)', '용역비(3.3%)', '4대보험(회사부담)', '세금/공과금',
  '복리후생(식대)', '접대비', '임차료/사무실', '통신/소모품',
]

export async function POST(request: NextRequest) {
  try {
    const { company_id, transaction_ids } = await request.json()

    if (!company_id) {
      return NextResponse.json({ error: 'company_id 필요' }, { status: 400 })
    }
    if (!GEMINI_API_KEY) {
      return NextResponse.json({ error: 'Gemini API 키가 설정되지 않았습니다.' }, { status: 500 })
    }

    const sb = getSupabaseAdmin()

    // 미분류 거래 조회
    let query = sb
      .from('transactions')
      .select('*')
      .eq('company_id', company_id)

    if (transaction_ids && transaction_ids.length > 0) {
      query = query.in('id', transaction_ids)
    } else {
      query = query.or('category.is.null,category.eq.기타,category.eq.미분류,category.eq.')
    }

    const { data: txs, error } = await query.order('created_at', { ascending: false }).limit(200)
    if (error) throw error
    if (!txs || txs.length === 0) {
      return NextResponse.json({ message: '재분류할 거래가 없습니다.', updated: 0 })
    }

    // Gemini 호출 (50건씩 배치)
    const batches: any[][] = []
    for (let i = 0; i < txs.length; i += 50) {
      batches.push(txs.slice(i, i + 50))
    }

    let totalUpdated = 0
    const results: Array<{ id: string; old_category: string; new_category: string; confidence: number }> = []

    for (const batch of batches) {
      const txLines = batch.map((tx, i) =>
        `${i + 1}. [${tx.type === 'income' ? '입금' : '출금'}] ${tx.transaction_date} | ${tx.client_name || '(미상)'} | ${tx.description || ''} | ${Math.abs(tx.amount || 0).toLocaleString()}원 | ${tx.payment_method || '통장'}`
      ).join('\n')

      const prompt = `당신은 한국 법인세무 전문가입니다. 아래 법인 통장/카드 거래내역을 보고 가장 적합한 계정과목(카테고리)을 분류해주세요.

## 사용 가능한 카테고리
${CATEGORY_LIST.map((c, i) => `${i + 1}. ${c}`).join('\n')}

## 분류 규칙
- 입금 거래: 렌트/운송수입, 지입 관리비/수수료, 투자원금 입금, 지입 초기비용/보증금, 대출 실행(입금), 이자/잡이익, 보험금 수령 중 선택
- 출금 거래: 나머지 카테고리 중 선택
- "카드자동집금", "카드대금", "카드결제" → 통신/소모품 또는 가장 적절한 지출 카테고리
- "약정", "대출", "캐피탈", "할부" → 차량할부/리스료 또는 원금상환
- 사람 이름으로 된 입금 → 투자원금 입금 또는 이자/잡이익
- 사람 이름으로 된 출금 → 급여(정규직) 또는 용역비(3.3%)
- "국민연금", "건강보험", "고용보험" → 4대보험(회사부담)
- "원천세", "부가세", "법인세" → 세금/공과금
- "주유", "GS", "SK에너지", "가스", "충전" → 유류비
- "손해보험", "화재보험", "보험료" → 차량보험료
- "정비", "타이어", "수리" → 정비/수리비
- "하이패스", "통행료", "과태료" → 자동차세/공과금
- 확실하지 않으면 confidence를 낮게 (50~65) 설정

## 거래내역
${txLines}

## 응답 형식 (JSON 배열만, 다른 텍스트 없이)
[{"no":1,"category":"유류비","confidence":85},{"no":2,"category":"급여(정규직)","confidence":70}]`

      try {
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts: [{ text: prompt }] }],
              generationConfig: {
                temperature: 0.1,
                maxOutputTokens: 4096,
                responseMimeType: 'application/json',
              },
            }),
          }
        )

        if (!res.ok) {
          console.error('Gemini API error:', res.status, await res.text())
          continue
        }

        const data = await res.json()
        const content = data.candidates?.[0]?.content?.parts?.[0]?.text || ''

        // JSON 파싱 (Gemini는 responseMimeType으로 JSON 직접 반환 가능)
        let parsed: any[]
        try {
          parsed = JSON.parse(content)
        } catch {
          // fallback: JSON 배열 추출
          const jsonMatch = content.match(/\[[\s\S]*\]/)
          if (!jsonMatch) continue
          parsed = JSON.parse(jsonMatch[0])
        }

        for (const item of parsed) {
          const no = item.no - 1
          if (no >= 0 && no < batch.length && CATEGORY_LIST.includes(item.category)) {
            const tx = batch[no]
            const confidence = Math.min(item.confidence || 60, 90)

            // DB 업데이트
            const { error: upErr } = await sb
              .from('transactions')
              .update({ category: item.category })
              .eq('id', tx.id)

            if (!upErr) {
              totalUpdated++
              results.push({
                id: tx.id,
                old_category: tx.category || '미분류',
                new_category: item.category,
                confidence,
              })
            }
          }
        }
      } catch (e) {
        console.error('Gemini reclassify error:', e)
      }
    }

    return NextResponse.json({
      message: `${totalUpdated}건 AI 재분류 완료`,
      updated: totalUpdated,
      total: txs.length,
      results,
    })

  } catch (error: any) {
    console.error('Reclassify API error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
