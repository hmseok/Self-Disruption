/**
 * GET    /api/ride-compliance/disposal/[id]    — 결재 상세 + items
 * PATCH  /api/ride-compliance/disposal/[id]    — 액션 (approve / reject / confirm)
 *
 * body (PATCH):
 *   { action: 'approve' | 'reject' | 'confirm', note?: string, reason?: string }
 */

import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'
import { randomUUID } from 'crypto'
import { buildDestructionCertPdf, type DestructionCertItem } from '@/lib/destruction-cert-pdf'
import { uploadToGCS } from '@/lib/gcs'

type Row = { [k: string]: any }

// P30-A — 파기확인서 자동 발급 (confirm 후 호출)
//   1) review + items + 책임자 이름 수집
//   2) PDF 생성 (pdf-lib + 나눔고딕)
//   3) GCS 업로드
//   4) ride_compliance_deliverables INSERT (category=destruction_cert)
//   5) ride_compliance_disposal_reviews.deliverable_id 채움
async function issueDestructionCertificate(reviewId: string, user: { id: string; email?: string }): Promise<{
  id: string
  file_url: string
  file_name: string
}> {
  // 1) review 상세
  const reviewRows = await prisma.$queryRaw<Row[]>`
    SELECT external_approval_id, external_request_at, external_request_by,
           external_approval_doc_id, external_approval_at, external_confirmed_by,
           external_confirmed_at, reviewer_id, reviewed_at, review_note
      FROM ride_compliance_disposal_reviews
     WHERE id = ${reviewId} LIMIT 1
  `
  if (reviewRows.length === 0) throw new Error('review row 없음')
  const r = reviewRows[0]

  // 2) items + 통계
  const items = await prisma.$queryRaw<Row[]>`
    SELECT data_type, custname, carsnums, carsodnm, imagkind_label, imagonam
      FROM ride_compliance_disposal_items
     WHERE review_id = ${reviewId}
     ORDER BY data_type, custname
     LIMIT 20
  `
  const totalRow = await prisma.$queryRaw<Row[]>`
    SELECT
      COUNT(*)                                              AS total_count,
      SUM(CASE WHEN data_type = 'CONTRACT' THEN 1 ELSE 0 END) AS contract_count,
      SUM(CASE WHEN data_type = 'FILE'     THEN 1 ELSE 0 END) AS file_count
    FROM ride_compliance_disposal_items
    WHERE review_id = ${reviewId}
  `
  const total = totalRow[0] || {}

  // 3) 책임자 이름 — 본 ERP profiles (또는 ride_compliance_officers)
  let reviewerName: string | null = null
  if (r.reviewer_id) {
    try {
      const p = await prisma.$queryRaw<Row[]>`
        SELECT COALESCE(name, email) AS name FROM profiles WHERE id = ${r.reviewer_id} LIMIT 1
      `
      reviewerName = p[0]?.name || null
    } catch {}
  }
  // 매뉴얼 명시 CPO: 임성민 이사 (fallback)
  const confirmerName = reviewerName || '임성민 이사'

  // 4) PDF 생성
  const sample: DestructionCertItem[] = items.map(it => ({
    data_type: (it.data_type as 'CONTRACT' | 'FILE'),
    custname: it.custname || null,
    carsnums: it.carsnums || null,
    carsodnm: it.carsodnm || null,
    imagkind_label: it.imagkind_label || null,
    imagonam: it.imagonam || null,
  }))
  const { pdfBuffer, fileName } = await buildDestructionCertPdf({
    approval_id: Number(r.external_approval_id || 0),
    approval_doc_id: r.external_approval_doc_id || null,
    request_at: fmtDate(r.external_request_at),
    request_by: r.external_request_by || null,
    approval_request_at: fmtDate(r.external_approval_at),
    reviewed_at: fmtDate(r.reviewed_at),
    confirmed_at: fmtDate(r.external_confirmed_at),
    reviewer_name: reviewerName,
    confirmer_name: confirmerName,
    total_count: Number(total.total_count || 0),
    contract_count: Number(total.contract_count || 0),
    file_count: Number(total.file_count || 0),
    sample_items: sample,
    company_name: '라이드 주식회사',
    data_source: '메리츠 캐피탈',
    issued_at: new Date().toISOString(),
    issued_by: (user as any).name || user.email,
  })

  // 5) GCS 업로드
  const gcsPath = `ride-compliance/destruction-certs/${fileName}`
  const fileUrl = await uploadToGCS(gcsPath, pdfBuffer, 'application/pdf', true)

  // 6) deliverable INSERT — Phase 1.5 스키마 (deliverable_code + gcs_object_path)
  const deliverableId = randomUUID()
  const deliverableCode = `DST-${Number(r.external_approval_id || 0)}-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}`
  const title = `파기확인서 — 결재 #${Number(r.external_approval_id || 0)} (${new Date().toISOString().slice(0, 10)})`
  const summary = `결재 #${Number(r.external_approval_id || 0)} 파기확인서 (총 ${Number(total.total_count || 0)}건 — 계약 ${Number(total.contract_count || 0)} · 파일 ${Number(total.file_count || 0)})`
  try {
    await prisma.$executeRaw`
      INSERT INTO ride_compliance_deliverables
        (id, deliverable_code, category, title, gcs_object_path,
         content_md, source_article, prepared_by, created_at)
      VALUES
        (${deliverableId}, ${deliverableCode}, 'destruction_cert', ${title},
         ${fileUrl}, ${summary}, '제11조 (개인정보 파기)', ${user.id}, NOW())
    `
  } catch (e: any) {
    // 최소 컬럼만 (Phase 1.5 본래 컬럼만)
    console.warn('[issueDestructionCertificate] full INSERT failed, retry minimal:', e?.message)
    await prisma.$executeRaw`
      INSERT INTO ride_compliance_deliverables
        (id, deliverable_code, category, title, gcs_object_path, created_at)
      VALUES
        (${deliverableId}, ${deliverableCode}, 'destruction_cert', ${title}, ${fileUrl}, NOW())
    `
  }

  // 7) review 에 deliverable_id 연결
  await prisma.$executeRaw`
    UPDATE ride_compliance_disposal_reviews
       SET deliverable_id        = ${deliverableId},
           deliverable_issued_at = NOW()
     WHERE id = ${reviewId}
  `

  // 8) audit
  await prisma.$executeRaw`
    INSERT INTO ride_compliance_disposal_audit
      (id, review_id, action, actor_id, actor_name, note)
    VALUES
      (${randomUUID()}, ${reviewId}, 'deliverable_issued', ${user.id}, ${(user as any).name || user.email || null},
       ${`파기확인서 자동 발급 — ${fileName}`})
  `

  return { id: deliverableId, file_url: fileUrl, file_name: fileName }
}

function fmtDate(d: Date | null | undefined) {
  if (!d) return null
  return d.toISOString().slice(0, 19).replace('T', ' ')
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await verifyUser(req)
    if (!user) return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 })

    const { id } = await ctx.params

    const rows = await prisma.$queryRaw<Row[]>`
      SELECT * FROM ride_compliance_disposal_reviews WHERE id = ${id} LIMIT 1
    `
    if (rows.length === 0) {
      return NextResponse.json({ success: false, error: '결재 row 없음' }, { status: 404 })
    }
    const r = rows[0]

    const items = await prisma.$queryRaw<Row[]>`
      SELECT id, external_item_id, data_type, data_id, custname,
             carsnums, carsodnm, imagkind_label, imagonam, external_deleted_at
        FROM ride_compliance_disposal_items WHERE review_id = ${id}
        ORDER BY custname, data_type, data_id
    `

    // P30-B — 매뉴얼 임명자 매핑 (매뉴얼 통합본 5.17 제6조 + 임명장 명시)
    //   officers 테이블 user_id 가 profiles 에 없거나 「(미확인)」 이어서 이름 안 나오는 경우 대비.
    //   매뉴얼 명시 인원으로 무조건 박음 (사용자 결정 2026-05-29).
    const cpo = {
      role: 'cpo',
      name: '임성민 이사',
      display_title: '라이드케어 개인정보보호 책임자 (CPO)',
    }
    const manager1 = {
      role: 'manager',
      name: '석호민 부장',
      display_title: '라이드케어 개인정보보호 담당자',
    }
    const manager2 = {
      role: 'manager',
      name: '양재희 부장',
      display_title: '라이드케어 정보보안 담당자',
    }

    // reviewer_name (profiles JOIN)
    let reviewerName: string | null = null
    if (r.reviewer_id) {
      try {
        const p = await prisma.$queryRaw<Row[]>`
          SELECT COALESCE(name, email) AS name FROM profiles WHERE id = ${r.reviewer_id} LIMIT 1
        `
        reviewerName = p[0]?.name || null
      } catch {}
    }

    // P30-A — 파기확인서 (deliverable) 메타
    let deliverable: { id: string; file_url: string; file_name: string | null; title: string | null } | null = null
    if (r.deliverable_id) {
      try {
        const drows = await prisma.$queryRaw<Row[]>`
          SELECT id, file_url, file_name, title
            FROM ride_compliance_deliverables WHERE id = ${r.deliverable_id} LIMIT 1
        `
        if (drows[0]) {
          deliverable = {
            id: drows[0].id,
            file_url: drows[0].file_url,
            file_name: drows[0].file_name || null,
            title: drows[0].title || null,
          }
        }
      } catch (e) {
        console.warn('[GET disposal/:id] deliverable 조회 실패:', e)
      }
    }

    const audits = await prisma.$queryRaw<Row[]>`
      SELECT id, action, actor_id, actor_name, action_at, note
        FROM ride_compliance_disposal_audit WHERE review_id = ${id}
        ORDER BY action_at DESC
        LIMIT 50
    `

    return NextResponse.json({
      success: true,
      data: {
        review: {
          id: r.id,
          external_approval_id: r.external_approval_id != null ? Number(r.external_approval_id) : null,
          external_request_at: fmtDate(r.external_request_at),
          external_request_by: r.external_request_by,
          external_expired_count: r.external_expired_count != null ? Number(r.external_expired_count) : null,
          external_approval_doc_id: r.external_approval_doc_id,
          external_approval_at: fmtDate(r.external_approval_at),
          external_deleted_at: fmtDate(r.external_deleted_at),
          external_deleted_by: r.external_deleted_by,
          external_confirmed_at: fmtDate(r.external_confirmed_at),
          external_confirmed_by: r.external_confirmed_by,
          review_status: r.review_status,
          reviewer_id: r.reviewer_id,
          reviewed_at: fmtDate(r.reviewed_at),
          review_note: r.review_note,
          review_reason: r.review_reason,
          deliverable_id: r.deliverable_id,
          deliverable_issued_at: fmtDate(r.deliverable_issued_at),
          last_sync_at: fmtDate(r.last_sync_at),
          sync_source: r.sync_source,
          created_at: fmtDate(r.created_at),
          updated_at: fmtDate(r.updated_at),
        },
        items: items.map(it => ({
          id: it.id,
          external_item_id: it.external_item_id != null ? Number(it.external_item_id) : null,
          data_type: it.data_type,
          data_id: it.data_id,
          custname: it.custname,
          carsnums: it.carsnums,
          carsodnm: it.carsodnm,
          imagkind_label: it.imagkind_label,
          imagonam: it.imagonam,
          external_deleted_at: fmtDate(it.external_deleted_at),
        })),
        audits: audits.map(a => ({
          id: a.id,
          action: a.action,
          actor_id: a.actor_id,
          actor_name: a.actor_name,
          action_at: fmtDate(a.action_at),
          note: a.note,
        })),
        deliverable,
        officers: {
          cpo:      cpo      ? { name: cpo.name,      display_title: cpo.display_title } : null,
          manager1: manager1 ? { name: manager1.name, display_title: manager1.display_title } : null,
          manager2: manager2 ? { name: manager2.name, display_title: manager2.display_title } : null,
        },
        reviewer_name: reviewerName,
      },
    })
  } catch (e: any) {
    console.error('[GET /disposal/:id] error:', e)
    return NextResponse.json({ success: false, error: String(e?.message || e) }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await verifyUser(req)
    if (!user) return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 })

    const { id } = await ctx.params
    const body = await req.json().catch(() => ({}))
    const action = String(body?.action || '')
    const note = body?.note ? String(body.note) : null
    const reason = body?.reason ? String(body.reason) : null

    const rows = await prisma.$queryRaw<Row[]>`
      SELECT id, review_status FROM ride_compliance_disposal_reviews WHERE id = ${id} LIMIT 1
    `
    if (rows.length === 0) {
      return NextResponse.json({ success: false, error: '결재 row 없음' }, { status: 404 })
    }
    const current = rows[0]

    let nextStatus = current.review_status

    if (action === 'approve') {
      if (current.review_status !== 'pending') {
        return NextResponse.json({ success: false, error: `현재 상태 ${current.review_status} — pending 만 승인 가능` }, { status: 400 })
      }
      nextStatus = 'approved'
      await prisma.$executeRaw`
        UPDATE ride_compliance_disposal_reviews
           SET review_status = 'approved',
               reviewer_id   = ${user.id},
               reviewed_at   = NOW(),
               review_note   = ${note}
         WHERE id = ${id}
      `
    } else if (action === 'reject') {
      if (current.review_status !== 'pending') {
        return NextResponse.json({ success: false, error: `현재 상태 ${current.review_status} — pending 만 반려 가능` }, { status: 400 })
      }
      if (!reason) {
        return NextResponse.json({ success: false, error: '반려 사유 (reason) 필수' }, { status: 400 })
      }
      nextStatus = 'rejected'
      await prisma.$executeRaw`
        UPDATE ride_compliance_disposal_reviews
           SET review_status = 'rejected',
               reviewer_id   = ${user.id},
               reviewed_at   = NOW(),
               review_note   = ${note},
               review_reason = ${reason}
         WHERE id = ${id}
      `
    } else if (action === 'confirm') {
      // executed → confirmed (외부 삭제 실행 후 본 시스템 최종 확인)
      if (current.review_status !== 'executed' && current.review_status !== 'approved') {
        return NextResponse.json({ success: false, error: `현재 상태 ${current.review_status} — executed/approved 만 confirm 가능` }, { status: 400 })
      }
      nextStatus = 'confirmed'
      await prisma.$executeRaw`
        UPDATE ride_compliance_disposal_reviews
           SET review_status = 'confirmed',
               reviewed_at   = NOW(),
               review_note   = ${note}
         WHERE id = ${id}
      `
    } else {
      return NextResponse.json({ success: false, error: `미지원 action: ${action}` }, { status: 400 })
    }

    // audit
    await prisma.$executeRaw`
      INSERT INTO ride_compliance_disposal_audit
        (id, review_id, action, actor_id, actor_name, note)
      VALUES
        (${randomUUID()}, ${id}, ${action}, ${user.id}, ${(user as any).name || user.email || null}, ${note || reason || null})
    `

    // ── P30-A: confirm → 파기확인서 자동 발급 ────────────────
    let deliverable: { id: string; file_url: string; file_name: string } | null = null
    if (action === 'confirm') {
      try {
        deliverable = await issueDestructionCertificate(id, user)
      } catch (e: any) {
        // 발급 실패해도 confirm 자체는 성공 — 오류만 audit + 응답에 포함
        console.error('[disposal/:id confirm] 파기확인서 발급 실패:', e)
        await prisma.$executeRaw`
          INSERT INTO ride_compliance_disposal_audit
            (id, review_id, action, actor_id, actor_name, note)
          VALUES
            (${randomUUID()}, ${id}, 'deliverable_failed', ${user.id}, ${(user as any).name || user.email || null}, ${String(e?.message || e)})
        `
      }
    }

    return NextResponse.json({ success: true, data: { id, review_status: nextStatus, deliverable } })
  } catch (e: any) {
    console.error('[PATCH /disposal/:id] error:', e)
    return NextResponse.json({ success: false, error: String(e?.message || e) }, { status: 500 })
  }
}
