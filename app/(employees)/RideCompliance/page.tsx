'use client'

/**
 * /RideCompliance — 라이드 정보보안 메인 대시보드
 *
 * Phase 1.1 (코어 운영 데이터): 대시보드 / 정보자산 / 침해사고 / 조직 매핑
 * Phase 1.2 (자료·운영 + 추가 통찰): 규정 문서 관리 / 연간 운영 / 서식 작성 + 대시보드 위젯 3개
 *
 * 단일 진실 원본: 라이드케어 「개인정보보호 내부관리계획서 (통합본)」 V1.0
 *                 RIDE-PMP-2026-001 (시행 2026.05.20).
 *
 * 사용자 통찰 (2026-05-18):
 *   추가-A: 운영자가 매뉴얼대로 진행 체크 (전사 진행률)
 *   추가-B: D-7/D-3/D-day 임박 알림 (다가오는 일정 위젯 + 색상)
 *   추가-C: 원본 검수 단계 분리 (규정 문서 관리의 is_master_verified 플래그 + CPO 검수 UI)
 *
 * 디자인 규칙:
 *  · Rule 14 — RideVehicleRegistry 동형 (NavTabs + DcStatStrip + NeuDataTable)
 *  · Rule 18 — NeuDataTable 모든 컬럼 sortBy 의무
 *  · Rule 19 — 줄바꿈 최소화 (prose)
 *  · Rule 20 — 결과는 글래스 패널 (alert 최소화)
 *  · Rule 23 — _migration_pending banner graceful fallback
 */

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { getStoredToken, getStoredUser } from '@/lib/auth-client'
import { usePermission } from '@/app/hooks/usePermission'
import NeuDataTable, { type TableColumn } from '@/app/components/NeuDataTable'
import DcStatStrip, { type StatItem } from '@/app/components/DcStatStrip'
import DcToolbar, { type FilterItem } from '@/app/components/DcToolbar'
import NeuFilterTabs, { type FilterTab } from '@/app/components/NeuFilterTabs'
import { COLORS, GLASS, BTN } from '@/app/utils/ui-tokens'

// ── 버튼 스타일 (BTN 은 size 만 — variant 는 인라인) ──────────────
const btnPrimary: React.CSSProperties = {
  ...BTN.md, border: `1px solid ${COLORS.borderSubtle}`,
  background: COLORS.bgBlue, color: COLORS.primary, cursor: 'pointer',
}
const btnSecondary: React.CSSProperties = {
  ...BTN.md, border: `1px solid ${COLORS.borderSubtle}`,
  background: COLORS.bgGray, color: COLORS.textSecondary, cursor: 'pointer',
}
const btnDanger: React.CSSProperties = {
  ...BTN.md, border: `1px solid ${COLORS.borderSubtle}`,
  background: COLORS.bgRed, color: COLORS.danger, cursor: 'pointer',
}
const btnSuccess: React.CSSProperties = {
  ...BTN.md, border: `1px solid ${COLORS.borderSubtle}`,
  background: COLORS.bgGreen, color: COLORS.success, cursor: 'pointer',
}

type TabKey = 'dashboard' | 'guide' | 'policies_master' | 'deliverables_tracker' | 'assets' | 'incidents' | 'officers' | 'documents' | 'annual_ops' | 'submissions'

// P17-C/D — 모듈 main 탭 통합. policies/page.tsx + deliverables/page.tsx 컴포넌트 import.
import PoliciesPage from './policies/page'
import DeliverablesPage from './deliverables/page'

// ════════════════════════════════════════════════════════════════
// PR-RC-X (2026-05-28) — 글래스 패널 알림 + 확인 다이얼로그
//   Rule 20 — alert / confirm 금지. 결과 메시지는 React state + GLASS.
// ════════════════════════════════════════════════════════════════
type NoticeTone = 'success' | 'danger' | 'info'
interface Notice { tone: NoticeTone; title: string; body?: string }

function NoticeBanner({ notice, onClose }: { notice: Notice | null; onClose: () => void }) {
  if (!notice) return null
  const color = notice.tone === 'success' ? COLORS.success : notice.tone === 'danger' ? COLORS.danger : COLORS.primary
  const bg    = notice.tone === 'success' ? COLORS.bgGreen   : notice.tone === 'danger' ? COLORS.bgRed     : COLORS.bgBlue
  return (
    <div style={{ ...GLASS.L4, padding: '12px 16px', borderRadius: 10, marginBottom: 12, borderLeft: `4px solid ${color}`, background: bg, display: 'flex', alignItems: 'flex-start', gap: 12 }}>
      <div style={{ flex: 1, color: COLORS.textPrimary, fontSize: 13, whiteSpace: 'pre-line' }}>
        <strong style={{ color }}>{notice.title}</strong>
        {notice.body && <div style={{ marginTop: 4, color: COLORS.textSecondary }}>{notice.body}</div>}
      </div>
      <button onClick={onClose} style={{ ...BTN.sm, border: `1px solid ${COLORS.borderSubtle}`, background: 'transparent', color: COLORS.textSecondary, cursor: 'pointer' }}>× 닫기</button>
    </div>
  )
}

interface ConfirmRequest {
  title: string
  body: string
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
  onConfirm: () => void
}

function GlassConfirmDialog({ request, onClose }: { request: ConfirmRequest | null; onClose: () => void }) {
  if (!request) return null
  const danger = request.danger ?? false
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'rgba(0,0,0,0.40)', backdropFilter: 'blur(6px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
    }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        ...GLASS.L5, padding: 24, borderRadius: 14, maxWidth: 480, width: '100%',
        borderLeft: `4px solid ${danger ? COLORS.danger : COLORS.primary}`,
      }}>
        <h3 style={{ margin: 0, fontSize: 16, color: COLORS.textPrimary }}>{request.title}</h3>
        <div style={{ marginTop: 12, fontSize: 13, color: COLORS.textSecondary, whiteSpace: 'pre-line', lineHeight: 1.6 }}>{request.body}</div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20 }}>
          <button onClick={onClose} style={btnSecondary}>{request.cancelLabel || '취소'}</button>
          <button onClick={() => { request.onConfirm(); onClose() }} style={danger ? btnDanger : btnPrimary}>
            {request.confirmLabel || '확인'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════
// Phase 1.3-F — 운영 가이드 Step Playbook (9 단계)
// 매뉴얼 통합본 5.17 9장 27조 + 별첨 7 RIDE-PLAN-2026 기반
// 사용자 통찰 (2026-05-19): "step-by-step 으로 진행하면 정보보안을 규정에 맞게 확립하고 놓치지 않고 진행"
// ════════════════════════════════════════════════════════════════
interface PlaybookStep {
  num: number
  title: string
  emoji: string
  purpose: string      // 왜?
  legal: string        // 법적 근거
  frequency: string    // 빈도
  responsible: string  // 책임자
  output: string       // 산출물
  detail: string       // 상세 설명 (2-3줄)
  links: { label: string; href: string; tab?: TabKey }[]
  months: number[]     // 별첨 7 12개월 캘린더 매핑
  statusKey: 'officers' | 'documents' | 'assets' | 'plan' | 'education' | 'inspection' | 'audit' | 'processor' | 'incident'
}

const PLAYBOOK_STEPS: PlaybookStep[] = [
  {
    num: 1, title: '조직 임명', emoji: '👔',
    purpose: '책임·권한 매트릭스의 출발점 — 모든 다음 단계가 이 역할에 의존',
    legal: '매뉴얼 제6조 (책임자 지정) · 제9조 (취급자 범위) / 개인정보보호법 제31조',
    frequency: '최초 1회 + 인사 변동 시',
    responsible: '대표이사 임명 · 시스템 관리자 등록',
    output: 'ride_compliance_officers row (CPO 1명 + 관리자 N명 + 취급자 다수)',
    detail: '라이드케어 「개인정보보호 내부관리계획서」 제6조는 책임자(CPO)·관리자·취급자 3-tier 매핑을 의무화. 임명 없이는 검수·승인·결재 흐름 작동 불가.',
    links: [{ label: '조직 매핑 탭', href: '#', tab: 'officers' }],
    months: [], // 상시
    statusKey: 'officers',
  },
  {
    num: 2, title: '자료(매뉴얼·서식) 등록·검수', emoji: '📚',
    purpose: '운영의 원본 무결성 — 검수 안 된 매뉴얼·서식은 작성·결재 불가',
    legal: '사용자 추가-C 통찰 + KISA 권고 / 매뉴얼 제·개정 이력 관리',
    frequency: '매뉴얼 등록 시 + 개정 시',
    responsible: '관리자(URL 입력) → CPO(검수 완료)',
    output: 'documents.is_master_verified = 1 + document_versions row',
    detail: '매뉴얼 7건 + 서식 18건 + 정책 1건 = 26건 모두 file_url 입력 후 CPO 검수 완료해야 운영 task 의 related_form 으로 연결 가능. 미검수 서식은 작성 차단.',
    links: [{ label: '규정 문서 관리 탭', href: '#', tab: 'documents' }],
    months: [],
    statusKey: 'documents',
  },
  {
    num: 3, title: '정보자산 등록', emoji: '📦',
    purpose: '기술적·관리적 보호조치 대상 식별 — 무엇을 어떤 등급으로 보호할지 명시',
    legal: '매뉴얼 제10조(물리적) · 제12조(접근권한) · 제13조(암호화) · 제14조(접근통제) · 제17조(CCTV) · 제18조(스마트기기)',
    frequency: '자산 도입 시 + 분기 점검',
    responsible: '관리자(석호민 부장 등)',
    output: 'ride_compliance_assets row (9 type · 3 classification · PII flag)',
    detail: '서버 / PC / 문서 / 저장매체 / CCTV / 스마트기기 / 소프트웨어 / 네트워크 등 9 유형, 공개·내부·대외비 3 등급. 개인정보 포함 자산은 제13조 암호화 의무.',
    links: [{ label: '정보자산 탭', href: '#', tab: 'assets' }],
    months: [],
    statusKey: 'assets',
  },
  {
    num: 4, title: '연간 계획 수립', emoji: '📅',
    purpose: '법정 의무를 12개월 운영 캘린더로 — 누락 방지',
    legal: '개인정보보호법 제29조 + 시행령 제30조',
    frequency: '매년 1월',
    responsible: '관리자 작성 · CPO 승인',
    output: 'annual_plans 1행 + tasks 12행 (월별) + F-06 연간 교육계획서',
    detail: 'RIDE-PLAN-2026 별첨 7 의 12개월 일람표가 곧 task carousel. 마이그 적용 시 자동 12 task 생성. 매월 D-7/D-3/D-day 알림.',
    links: [{ label: '연간 운영 탭', href: '#', tab: 'annual_ops' }],
    months: [1],
    statusKey: 'plan',
  },
  {
    num: 5, title: '교육 실시', emoji: '🎓',
    purpose: '취급자의 인식 제고 + 법적 의무 (미실시 시 과태료)',
    legal: '매뉴얼 제22~23조 / 개인정보보호법 제29조 + 시행령 제30조',
    frequency: '연 2회 (2월·7월) + 신규 입사자 + 미참석자 보충',
    responsible: 'CPO 계획 · 관리자 실시',
    output: 'F-07 교육 이수 확인서 (3년 보존) · tasks completion',
    detail: '전 임·직원 + 개인정보취급자 + 신규 + 수탁업체 대상. 집체·인터넷·그룹웨어·외부위탁 가능. 출장/휴가 미참석자 별도 시행.',
    links: [{ label: '연간 운영 탭 (2월·7월)', href: '#', tab: 'annual_ops' }],
    months: [2, 7],
    statusKey: 'education',
  },
  {
    num: 6, title: '정기 점검 · 파기', emoji: '🔍',
    purpose: '안전성 확보조치 의무 + 보유기간 경과 정보 안전 처리',
    legal: '매뉴얼 제20조(자체감사) + 제28~33조(파기) / 안전성 확보조치 기준 제5조',
    frequency: '분기 1회 (3·6·9·12월)',
    responsible: '관리자 실시 · CPO 승인',
    output: 'F-M05-01 파기 신청서 + F-M05-02 파기 대장(3년 보존) + F-M05-03 완료 확인서',
    detail: '분기마다 정보보안 점검 (체크리스트) + 개인정보 파기 + CPO 승인. 접근권한 반기 점검 (3·6·9·10월). 백업 복구 테스트 분기 1회.',
    links: [{ label: '연간 운영 탭 (3/6/9/12월)', href: '#', tab: 'annual_ops' }],
    months: [3, 6, 9, 12],
    statusKey: 'inspection',
  },
  {
    num: 7, title: '자체 감사', emoji: '🔎',
    purpose: '개인정보 처리 실태 점검 + CPO 정기 보고',
    legal: '매뉴얼 제20~21조 / 개인정보보호법 제31조',
    frequency: '반기 1회 (5월·10월)',
    responsible: 'CPO 책임 · 감사자 실시',
    output: '감사 결과보고서 (3년 보존) + 개선사항 조치계획',
    detail: '상·하반기 1회씩 자체감사 실시. 감사 대상·절차·방법 계획 수립 후 진행. CPO 보고 + 조치계획 + 차년도 반영.',
    links: [{ label: '연간 운영 탭 (5/10월)', href: '#', tab: 'annual_ops' }],
    months: [5, 10],
    statusKey: 'audit',
  },
  {
    num: 8, title: '수탁사 관리', emoji: '🤝',
    purpose: '제3자 위탁 시 위탁자(라이드)의 감독 책임',
    legal: '매뉴얼 제24조 / 개인정보보호법 제26조',
    frequency: '반기 1회 (4월·9월)',
    responsible: '관리자',
    output: '수탁사 현황 + 계약서 검토 + 보안교육 이수 + 점검 기록',
    detail: '수탁업체 현황 점검 + 계약서 검토·갱신 + 수탁업체 개인정보취급자 보안교육·점검. 위탁 업무·수탁자 공개 의무.',
    links: [{ label: '연간 운영 탭 (4/9월)', href: '#', tab: 'annual_ops' }],
    months: [4, 9],
    statusKey: 'processor',
  },
  {
    num: 9, title: '침해사고 대응', emoji: '🚨',
    purpose: '24시간 통지 의무 + 정보주체 피해 최소화',
    legal: '매뉴얼 제25~27조 + 유출대응 매뉴얼 RIDE-M01 / 개인정보보호법 제34조',
    frequency: '사고 발생 즉시',
    responsible: '취급자 신고 → 관리팀 일선 → 관리자·CPO',
    output: 'incidents row + F-M01-01~06 (6 서식 — 접수보고서/통지서/대응일지 등) + 24h SLA',
    detail: '제27조 "즉시 모든 직원은 관리팀에 사고 접수". 24시간 이내 정보주체 통지 (5개 항목 — 항목/시점/피해최소화/대응조치/연락처). 긴급조치 우선 시 단서 적용.',
    links: [{ label: '침해사고 탭', href: '#', tab: 'incidents' }],
    months: [], // 상시
    statusKey: 'incident',
  },
]

// ────────── Phase 1.1 인터페이스 ──────────
interface Officer {
  id: string
  user_id: string
  role: string
  display_title: string | null
  business_unit: string | null
  appointed_at: string
  released_at: string | null
  is_active: number
  notes: string | null
  user_name: string | null
  created_at: string
  updated_at: string
}

interface Asset {
  id: string
  asset_code: string
  name: string
  asset_type: string
  classification: string
  owner_user_id: string | null
  owner_user_name: string | null
  responsible_user_id: string | null
  responsible_user_name: string | null
  location: string | null
  os_or_spec: string | null
  contains_pii: number
  access_control: string | null
  encryption_status: string
  acquired_at: string | null
  decommissioned_at: string | null
  status: string
  notes: string | null
  created_at: string
  updated_at: string
}

interface Incident {
  id: string
  incident_code: string
  title: string
  incident_type: string
  severity: string
  occurred_at: string | null
  detected_at: string
  notified_at: string | null
  resolved_at: string | null
  reporter_user_id: string | null
  reporter_user_name: string | null
  assignee_user_id: string | null
  assignee_user_name: string | null
  affected_subjects_count: number | null
  cause_summary: string | null
  containment_actions: string | null
  related_asset_id: string | null
  related_asset_code: string | null
  related_asset_name: string | null
  status: string
  retention_until: string | null
  created_at: string
  updated_at: string
}

// ────────── Phase 1.2 인터페이스 ──────────
interface ComplianceDocument {
  id: string
  doc_code: string
  doc_type: string
  title: string
  parent_manual_code: string | null
  description: string | null
  current_version_no: string | null
  effective_date: string | null
  retention_years: number
  classification: string
  is_master_verified: number
  verified_by_user_id: string | null
  verified_by_user_name: string | null
  verified_by_cpo_at: string | null
  verification_note: string | null
  file_url: string | null
  status: string
  sort_order: number
  notes: string | null
  created_at: string
  updated_at: string
}

interface AnnualPlan {
  id: string
  plan_year: number
  plan_code: string
  title: string
  prepared_by_user_name: string | null
  approved_by_user_name: string | null
  approved_at: string | null
  effective_date: string
  scope: string | null
  legal_basis: string | null
  status: string
}

interface ComplianceTask {
  id: string
  annual_plan_id: string
  task_code: string
  scheduled_month: number
  category: string
  title: string
  description: string | null
  legal_reference: string | null
  related_form_codes: string | null
  assignee_user_id: string | null
  assignee_user_name: string | null
  due_date: string
  reminder_d7_sent: number
  reminder_d3_sent: number
  reminder_dday_sent: number
  status: string
  completed_at: string | null
  completed_by_user_id: string | null
  completed_by_user_name: string | null
  evidence_notes: string | null
  cpo_reviewed_at: string | null
  cpo_review_note: string | null
  plan_code: string | null
}

interface FormSubmission {
  id: string
  submission_code: string
  document_id: string
  document_code: string
  document_title: string | null
  task_id: string | null
  task_code: string | null
  title: string | null
  submitted_by_user_id: string
  submitted_by_user_name: string | null
  submitted_at: string
  file_url: string | null
  retention_until: string
  reviewed_by_user_name: string | null
  reviewed_at: string | null
  review_status: string
  review_note: string | null
  notes: string | null
}

// ────────── 라벨 매핑 ──────────
const ROLE_LABEL: Record<string, { label: string; emoji: string; color: string }> = {
  cpo:           { label: '책임자 (CPO)',     emoji: '👔', color: COLORS.primary },
  manager:       { label: '관리자',           emoji: '🛡️', color: COLORS.info },
  handler:       { label: '취급자',           emoji: '👥', color: COLORS.textSecondary },
  incident_team: { label: '관리팀(사고일선)', emoji: '🚨', color: COLORS.warning },
}

const ASSET_TYPE_LABEL: Record<string, { label: string; emoji: string }> = {
  server:   { label: '서버',         emoji: '🖥️' },
  pc:       { label: 'PC/노트북',    emoji: '💻' },
  document: { label: '문서',         emoji: '📄' },
  storage:  { label: '저장매체',     emoji: '💾' },
  cctv:     { label: 'CCTV',         emoji: '📹' },
  mobile:   { label: '스마트기기',   emoji: '📱' },
  software: { label: '소프트웨어',   emoji: '🧩' },
  network:  { label: '네트워크장비', emoji: '🛜' },
  other:    { label: '기타',         emoji: '📦' },
}

const CLASSIFICATION_LABEL: Record<string, { label: string; color: string }> = {
  public:       { label: '공개',   color: COLORS.success },
  internal:     { label: '내부',   color: COLORS.info },
  confidential: { label: '대외비', color: COLORS.danger },
}

const INCIDENT_TYPE_LABEL: Record<string, { label: string; emoji: string }> = {
  external_hacking:          { label: '외부해킹·악성코드',    emoji: '🦠' },
  internal_leak:             { label: '내부 유출',             emoji: '🚪' },
  unauthorized_modification: { label: '임의 변조·도난·분실',  emoji: '🔧' },
  compliance_violation:      { label: '법규 위반·클레임',      emoji: '⚖️' },
  device_loss:               { label: '단말기 분실',           emoji: '📵' },
  other:                     { label: '기타',                  emoji: '❓' },
}

const SEVERITY_LABEL: Record<string, { label: string; color: string }> = {
  low:      { label: '낮음', color: COLORS.success },
  medium:   { label: '보통', color: COLORS.info },
  high:     { label: '높음', color: COLORS.warning },
  critical: { label: '심각', color: COLORS.danger },
}

const INCIDENT_STATUS_LABEL: Record<string, { label: string; color: string }> = {
  reported:      { label: '접수',         color: COLORS.warning },
  triaging:      { label: '1차 분류',     color: COLORS.info },
  containing:    { label: '긴급조치',     color: COLORS.info },
  notifying:     { label: '정보주체 통지', color: COLORS.warning },
  investigating: { label: '조사 중',      color: COLORS.info },
  resolved:      { label: '종결',         color: COLORS.success },
  closed:        { label: '보존 시작',    color: COLORS.textSecondary },
}

const ASSET_STATUS_LABEL: Record<string, { label: string; color: string }> = {
  active:   { label: '운영중', color: COLORS.success },
  repair:   { label: '정비',   color: COLORS.warning },
  disposed: { label: '폐기',   color: COLORS.textSecondary },
  lost:     { label: '분실',   color: COLORS.danger },
}

const DOC_TYPE_LABEL: Record<string, { label: string; emoji: string }> = {
  manual: { label: '매뉴얼', emoji: '📘' },
  form:   { label: '서식',   emoji: '📝' },
  policy: { label: '정책',   emoji: '📜' },
}

const DOC_STATUS_LABEL: Record<string, { label: string; color: string }> = {
  pending:    { label: '검수 대기', color: COLORS.warning },
  active:     { label: '활성',     color: COLORS.success },
  superseded: { label: '대체됨',   color: COLORS.textSecondary },
  retired:    { label: '폐기',     color: COLORS.textMuted },
}

const TASK_CATEGORY_LABEL: Record<string, { label: string; emoji: string; color: string }> = {
  plan:          { label: '계획',     emoji: '📋', color: COLORS.primary },
  education:     { label: '교육',     emoji: '🎓', color: COLORS.info },
  inspection:    { label: '점검',     emoji: '🔍', color: COLORS.info },
  destruction:   { label: '파기',     emoji: '🗑️', color: COLORS.warning },
  audit:         { label: '감사',     emoji: '🔎', color: COLORS.primary },
  processor:     { label: '수탁사',   emoji: '🤝', color: COLORS.info },
  drill:         { label: '훈련',     emoji: '🎯', color: COLORS.warning },
  access_review: { label: '권한검토', emoji: '🔑', color: COLORS.info },
  backup_test:   { label: '백업복구', emoji: '💾', color: COLORS.info },
  closing:       { label: '결산',     emoji: '🏁', color: COLORS.primary },
}

const TASK_STATUS_LABEL: Record<string, { label: string; color: string }> = {
  pending:     { label: '예정',   color: COLORS.textSecondary },
  in_progress: { label: '진행 중', color: COLORS.info },
  done:        { label: '완료',   color: COLORS.success },
  overdue:     { label: '지연',   color: COLORS.danger },
  skipped:     { label: '건너뜀', color: COLORS.textMuted },
}

const REVIEW_STATUS_LABEL: Record<string, { label: string; color: string }> = {
  submitted: { label: '제출됨', color: COLORS.warning },
  approved:  { label: '승인',   color: COLORS.success },
  rejected:  { label: '반려',   color: COLORS.danger },
  archived:  { label: '보관',   color: COLORS.textSecondary },
}

// ────────── 헬퍼 함수 ──────────
function fmtDate(d: string | null | undefined): string {
  if (!d) return ''
  const dt = new Date(d)
  if (isNaN(dt.getTime())) return ''
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
}

function fmtDateTime(d: string | null | undefined): string {
  if (!d) return ''
  const dt = new Date(d)
  if (isNaN(dt.getTime())) return ''
  return `${fmtDate(d)} ${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}`
}

/** 24h SLA 잔여 — 침해사고 통지 의무 (제25조 ①) */
function slaRemainHours(detectedAt: string, notifiedAt: string | null): number | null {
  if (notifiedAt) return null
  const detected = new Date(detectedAt).getTime()
  if (isNaN(detected)) return null
  const elapsed = (Date.now() - detected) / (60 * 60 * 1000)
  return 24 - elapsed
}

/** task due_date 잔여 일수 (음수 = overdue) — 사용자 추가-B 통찰 */
function daysUntilDue(dueDate: string): number {
  const due = new Date(dueDate).getTime()
  if (isNaN(due)) return 999
  const now = Date.now()
  return Math.ceil((due - now) / (24 * 60 * 60 * 1000))
}

/** D-7/D-3/D-day 색상 결정 — 사용자 추가-B 통찰 */
function urgencyColor(days: number): { color: string; bg: string; label: string } {
  if (days < 0) return { color: COLORS.danger, bg: COLORS.bgRed, label: `${Math.abs(days)}일 초과` }
  if (days === 0) return { color: COLORS.danger, bg: COLORS.bgRed, label: '오늘 마감' }
  if (days <= 3) return { color: COLORS.danger, bg: COLORS.bgRed, label: `D-${days}` }
  if (days <= 7) return { color: COLORS.warning, bg: COLORS.bgAmber, label: `D-${days}` }
  if (days <= 14) return { color: COLORS.info, bg: COLORS.bgBlue, label: `D-${days}` }
  return { color: COLORS.textSecondary, bg: COLORS.bgGray, label: `D-${days}` }
}

/** related_form_codes JSON 파싱 (안전) */
function parseFormCodes(json: string | null): string[] {
  if (!json) return []
  try {
    const arr = JSON.parse(json)
    return Array.isArray(arr) ? arr.filter((x): x is string => typeof x === 'string') : []
  } catch { return [] }
}

// ════════════════════════════════════════════════════════════════
// 메인 컴포넌트
// ════════════════════════════════════════════════════════════════
export default function RideCompliancePage() {
  const [user, setUser] = useState<{ id?: string; role?: string; name?: string } | null>(null)
  const [authChecked, setAuthChecked] = useState(false)
  const { hasPageAccess } = usePermission()
  const canAccess = user?.role === 'admin' || hasPageAccess('/RideCompliance')

  // URL query ?tab=documents 로 진입 시 자동 탭 설정 (사용자 추가 통찰 — 뒤로가기 UX)
  const searchParams = useSearchParams()
  const initialTab = (searchParams?.get('tab') as TabKey) || 'dashboard'
  const [tab, setTab] = useState<TabKey>(initialTab)

  // Phase 1.1 데이터
  const [officers, setOfficers] = useState<Officer[]>([])
  const [assets, setAssets] = useState<Asset[]>([])
  const [incidents, setIncidents] = useState<Incident[]>([])
  // Phase 1.2 데이터
  const [documents, setDocuments] = useState<ComplianceDocument[]>([])
  const [annualPlan, setAnnualPlan] = useState<AnnualPlan | null>(null)
  const [tasks, setTasks] = useState<ComplianceTask[]>([])
  const [submissions, setSubmissions] = useState<FormSubmission[]>([])

  const [migrationPending, setMigrationPending] = useState<{ p11: boolean; p12: boolean }>({ p11: false, p12: false })
  const [loadError, setLoadError] = useState<string | null>(null)
  const [myRole, setMyRole] = useState<string | null>(null)

  // Phase 1.1 필터
  const [assetTypeFilter, setAssetTypeFilter] = useState('')
  const [assetClassFilter, setAssetClassFilter] = useState('')
  const [assetStatusFilter, setAssetStatusFilter] = useState('')
  const [assetQuery, setAssetQuery] = useState('')
  const [incidentTypeFilter, setIncidentTypeFilter] = useState('')
  const [incidentSeverityFilter, setIncidentSeverityFilter] = useState('')
  const [incidentStatusFilter, setIncidentStatusFilter] = useState('')
  const [incidentQuery, setIncidentQuery] = useState('')

  // Phase 1.2 필터
  const [docTypeFilter, setDocTypeFilter] = useState('')
  const [docStatusFilter, setDocStatusFilter] = useState('')
  const [docVerifiedFilter, setDocVerifiedFilter] = useState('')
  const [docQuery, setDocQuery] = useState('')
  const [taskCategoryFilter, setTaskCategoryFilter] = useState('')
  const [taskStatusFilter, setTaskStatusFilter] = useState('')
  const [taskMonthFilter, setTaskMonthFilter] = useState('')
  const [subDocFilter, setSubDocFilter] = useState('')
  const [subStatusFilter, setSubStatusFilter] = useState('')

  // 모달
  const [assetModalOpen, setAssetModalOpen] = useState(false)
  const [incidentModalOpen, setIncidentModalOpen] = useState(false)
  const [officerModalOpen, setOfficerModalOpen] = useState(false)
  const [docFileUrlModal, setDocFileUrlModal] = useState<ComplianceDocument | null>(null)
  const [verifyModal, setVerifyModal] = useState<ComplianceDocument | null>(null)
  const [taskActionModal, setTaskActionModal] = useState<ComplianceTask | null>(null)
  const [submitFormModal, setSubmitFormModal] = useState<{ doc: ComplianceDocument; task?: ComplianceTask } | null>(null)
  // Phase 1.4-fix13 — 규정 문서 관리 신규 등록 모달
  const [newDocModalOpen, setNewDocModalOpen] = useState(false)

  useEffect(() => {
    setUser(getStoredUser())
    setAuthChecked(true)
  }, [])

  const fetchAll = useMemo(() => async () => {
    if (!canAccess) return
    const token = getStoredToken()
    const headers = token ? { Authorization: `Bearer ${token}` } : {}
    try {
      const [ofRes, asRes, inRes, docRes, planRes, taskRes, subRes] = await Promise.all([
        fetch('/api/ride-compliance/officers', { headers, cache: 'no-store' }),
        fetch('/api/ride-compliance/assets', { headers, cache: 'no-store' }),
        fetch('/api/ride-compliance/incidents', { headers, cache: 'no-store' }),
        fetch('/api/ride-compliance/documents', { headers, cache: 'no-store' }),
        fetch('/api/ride-compliance/annual-plans?year=2026', { headers, cache: 'no-store' }),
        fetch('/api/ride-compliance/tasks?plan_year=2026', { headers, cache: 'no-store' }),
        fetch('/api/ride-compliance/form-submissions', { headers, cache: 'no-store' }),
      ])
      const [ofJ, asJ, inJ, docJ, planJ, taskJ, subJ] = await Promise.all([
        ofRes.json(), asRes.json(), inRes.json(), docRes.json(), planRes.json(), taskRes.json(), subRes.json(),
      ])
      setOfficers(ofJ.data || [])
      setAssets(asJ.data || [])
      setIncidents(inJ.data || [])
      setDocuments(docJ.data || [])
      setAnnualPlan((planJ.data || [])[0] || null)
      setTasks(taskJ.data || [])
      setSubmissions(subJ.data || [])
      setMyRole(ofJ.meta?.my_role || null)
      // _migration_pending 구분: phase11 (officers/assets/incidents) vs phase12 (documents/tasks 등)
      const p11Pending = !!(ofJ.meta?._migration_pending === true)
      const p12Pending = !!(docJ.meta?._migration_pending === 'phase12' || taskJ.meta?._migration_pending === 'phase12')
      setMigrationPending({ p11: p11Pending, p12: p12Pending })
      setLoadError(null)
    } catch (e) {
      setLoadError(String(e))
    }
  }, [canAccess])

  useEffect(() => {
    if (authChecked && canAccess) fetchAll()
  }, [authChecked, canAccess, fetchAll])

  // ────────── 필터링 ──────────
  const filteredAssets = useMemo(() => assets.filter(a => {
    if (assetTypeFilter && a.asset_type !== assetTypeFilter) return false
    if (assetClassFilter && a.classification !== assetClassFilter) return false
    if (assetStatusFilter && a.status !== assetStatusFilter) return false
    if (assetQuery && !(`${a.name} ${a.asset_code} ${a.location || ''}`).toLowerCase().includes(assetQuery.toLowerCase())) return false
    return true
  }), [assets, assetTypeFilter, assetClassFilter, assetStatusFilter, assetQuery])

  const filteredIncidents = useMemo(() => incidents.filter(i => {
    if (incidentTypeFilter && i.incident_type !== incidentTypeFilter) return false
    if (incidentSeverityFilter && i.severity !== incidentSeverityFilter) return false
    if (incidentStatusFilter && i.status !== incidentStatusFilter) return false
    if (incidentQuery && !(`${i.title} ${i.incident_code} ${i.cause_summary || ''}`).toLowerCase().includes(incidentQuery.toLowerCase())) return false
    return true
  }), [incidents, incidentTypeFilter, incidentSeverityFilter, incidentStatusFilter, incidentQuery])

  const filteredDocs = useMemo(() => documents.filter(d => {
    if (docTypeFilter && d.doc_type !== docTypeFilter) return false
    if (docStatusFilter && d.status !== docStatusFilter) return false
    if (docVerifiedFilter === '1' && d.is_master_verified !== 1) return false
    if (docVerifiedFilter === '0' && d.is_master_verified !== 0) return false
    if (docQuery && !(`${d.title} ${d.doc_code} ${d.description || ''}`).toLowerCase().includes(docQuery.toLowerCase())) return false
    return true
  }), [documents, docTypeFilter, docStatusFilter, docVerifiedFilter, docQuery])

  const filteredTasks = useMemo(() => tasks.filter(t => {
    if (taskCategoryFilter && t.category !== taskCategoryFilter) return false
    if (taskStatusFilter && t.status !== taskStatusFilter) return false
    if (taskMonthFilter && t.scheduled_month !== parseInt(taskMonthFilter, 10)) return false
    return true
  }), [tasks, taskCategoryFilter, taskStatusFilter, taskMonthFilter])

  const filteredSubmissions = useMemo(() => submissions.filter(s => {
    if (subDocFilter && s.document_code !== subDocFilter) return false
    if (subStatusFilter && s.review_status !== subStatusFilter) return false
    return true
  }), [submissions, subDocFilter, subStatusFilter])

  // ────────── 대시보드 통계 ──────────
  const stats: StatItem[] = useMemo(() => {
    const totalAssets = assets.length
    const piiAssets = assets.filter(a => a.contains_pii === 1).length
    const openIncidents = incidents.filter(i => i.status !== 'resolved' && i.status !== 'closed').length
    const slaWarn = incidents.filter(i => {
      const r = slaRemainHours(i.detected_at, i.notified_at); return r !== null && r < 6
    }).length
    const activeCpoMgr = officers.filter(o => o.is_active === 1 && (o.role === 'cpo' || o.role === 'manager')).length

    // Phase 1.2 stat
    const totalDocs = documents.length
    const verifiedDocs = documents.filter(d => d.is_master_verified === 1).length
    const pendingVerify = documents.filter(d => d.is_master_verified === 0).length

    const doneTasks = tasks.filter(t => t.status === 'done').length
    const totalTasks = tasks.length
    const overdueTasks = tasks.filter(t => {
      if (t.status === 'done' || t.status === 'skipped') return false
      return daysUntilDue(t.due_date) < 0
    }).length

    return [
      { label: '미해결 사고', value: openIncidents, unit: '건', icon: '🚨', subValue: slaWarn > 0 ? `⚠ SLA임박 ${slaWarn}건` : '', subTone: slaWarn > 0 ? 'down' : 'neutral', tint: openIncidents > 0 ? 'red' : 'green' },
      { label: '정보자산', value: totalAssets, unit: '건', icon: '📦', subValue: `PII ${piiAssets}건`, tint: 'blue' },
      { label: '매뉴얼·서식', value: `${verifiedDocs}/${totalDocs}`, icon: '📚', subValue: pendingVerify > 0 ? `검수대기 ${pendingVerify}` : '전체 검수완료', subTone: pendingVerify > 0 ? 'down' : 'up', tint: pendingVerify > 0 ? 'amber' : 'green' },
      { label: '연간 task 진행', value: `${doneTasks}/${totalTasks}`, icon: '📅', subValue: overdueTasks > 0 ? `⚠ 지연 ${overdueTasks}건` : '', subTone: overdueTasks > 0 ? 'down' : 'neutral', tint: overdueTasks > 0 ? 'red' : 'blue' },
      { label: 'CPO·관리자', value: activeCpoMgr, unit: '명', icon: '👔', tint: 'purple' },
    ]
  }, [assets, incidents, officers, documents, tasks])

  // ────────── 다가오는 일정 (D-14 이내, status pending/in_progress) ──────────
  const upcomingTasks = useMemo(() => {
    return tasks
      .filter(t => t.status === 'pending' || t.status === 'in_progress')
      .map(t => ({ task: t, days: daysUntilDue(t.due_date) }))
      .filter(x => x.days <= 14)
      .sort((a, b) => a.days - b.days)
      .slice(0, 8)
  }, [tasks])

  // ────────── 검수 대기 매뉴얼·서식 ──────────
  const pendingVerifyDocs = useMemo(() => {
    return documents.filter(d => d.is_master_verified === 0 && d.status === 'pending').sort((a, b) => a.sort_order - b.sort_order)
  }, [documents])

  // ────────── 카테고리별 진행률 ──────────
  const progressByCategory = useMemo(() => {
    const cats = Object.keys(TASK_CATEGORY_LABEL)
    return cats.map(cat => {
      const catTasks = tasks.filter(t => t.category === cat)
      const total = catTasks.length
      const done = catTasks.filter(t => t.status === 'done').length
      const overdue = catTasks.filter(t => t.status !== 'done' && t.status !== 'skipped' && daysUntilDue(t.due_date) < 0).length
      return { cat, total, done, overdue }
    }).filter(x => x.total > 0)
  }, [tasks])

  if (!authChecked) return null

  if (!canAccess) {
    return (
      <div style={{ padding: 40, maxWidth: 720 }}>
        <div style={{ ...GLASS.L3, padding: 24, borderRadius: 12 }}>
          <h2 style={{ margin: 0, color: COLORS.danger }}>🔒 정보보안 모듈 접근 제한</h2>
          <p style={{ marginTop: 12, color: COLORS.textSecondary }}>
            본 모듈은 CPO·개인정보보호 관리자·관리팀(사고일선)·시스템 관리자에게만 접근 권한이 부여됩니다.
            취급자(일반 직원)는 별도 진입점(홈 대시보드 카드)을 통해 본인 교육 이수 + 사고 보고만 가능합니다.
            권한 부여 문의: CPO 또는 시스템 관리자.
          </p>
        </div>
      </div>
    )
  }

  const isCpoLike = myRole === 'cpo'
  const isMgrLike = myRole === 'cpo' || myRole === 'manager'

  return (
    <div style={{ padding: '24px 32px'}}>
      {/* 헤더 */}
      <div style={{ marginBottom: 16 }}>
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>🔒 라이드 정보보안</h1>
        <p style={{ margin: '4px 0 0', fontSize: 13, color: COLORS.textSecondary }}>
          라이드케어 「개인정보보호 내부관리계획서」 V1.0 (RIDE-PMP-2026-001, 시행 2026.05.20) 기반 운영 모듈
          {annualPlan && ` · 연간계획 ${annualPlan.plan_code}`}
          {myRole && ` · 내 역할: ${ROLE_LABEL[myRole]?.label || myRole}`}
        </p>
      </div>

      {/* 마이그 미적용 배너 */}
      {migrationPending.p12 && (
        <div style={{
          ...GLASS.L3, padding: '12px 16px', borderRadius: 10, marginBottom: 16,
          borderLeft: `4px solid ${COLORS.warning}`, color: COLORS.textPrimary, fontSize: 13,
        }}>
          ⚠ Phase 1.2 마이그레이션 미적용 — <code style={{ fontSize: 12 }}>migrations/2026-05-18_ride_compliance_phase12.sql</code> 적용 후 새로고침. 규정 문서 관리·연간운영·서식작성 탭은 마이그 적용 후 활성화됩니다.
        </div>
      )}
      {loadError && (
        <div style={{ ...GLASS.L3, padding: '12px 16px', borderRadius: 10, marginBottom: 16, borderLeft: `4px solid ${COLORS.danger}`, color: COLORS.danger, fontSize: 13 }}>
          ❌ 로드 오류: {loadError}
        </div>
      )}

      {/* P29 + PR-RC-X — 3 카테고리 그룹화 (규정/운영/산출) + NeuFilterTabs 공용 컴포넌트 */}
      <div style={{ ...GLASS.L5, padding: '8px 12px', borderRadius: 10, marginBottom: 16, display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        {([
          { group: '📜 규정', tabs: [
            { key: 'policies_master', label: '📜 내규 마스터' },
            { key: 'documents',       label: '📚 규정 문서' },
          ] },
          { group: '⚙ 운영', tabs: [
            { key: 'dashboard',  label: '📊 대시보드' },
            { key: 'guide',      label: '📖 운영 가이드' },
            { key: 'officers',   label: '👔 조직 매핑' },
            { key: 'assets',     label: '📦 정보자산' },
            { key: 'incidents',  label: '🚨 침해사고' },
            { key: 'annual_ops', label: '📅 연간 운영' },
          ] },
          { group: '📤 산출', tabs: [
            { key: 'deliverables_tracker', label: '📤 산출물 트래커' },
            { key: 'submissions',          label: '📝 서식 작성' },
          ] },
        ] as { group: string; tabs: FilterTab[] }[]).map((g, gi) => (
          <div key={g.group} style={{
            display: 'flex', alignItems: 'center', gap: 8,
            borderLeft: gi > 0 ? `1px solid ${COLORS.borderSubtle}` : 'none',
            paddingLeft: gi > 0 ? 12 : 0,
          }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: COLORS.textMuted, whiteSpace: 'nowrap' }}>{g.group}</span>
            <div style={{ marginBottom: -12 }}>
              <NeuFilterTabs
                tabs={g.tabs}
                activeKey={tab}
                onSelect={k => setTab(k as TabKey)}
                compact
              />
            </div>
          </div>
        ))}
      </div>

      {/* P12-C — 데이터 폐기 결재 quick link (별도 페이지) */}
      <div style={{ ...GLASS.L3, padding: '10px 14px', borderRadius: 10, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 12, color: COLORS.textSecondary }}>
          🗑 외부 카페24 폐기 결재 — CPO 검토 + 파기확인서 자동 발급
        </span>
        <Link href="/RideCompliance/data-disposal"
          style={{ marginLeft: 'auto', ...BTN.sm, border: `1px solid ${COLORS.borderSubtle}`, background: COLORS.bgBlue, color: COLORS.primary, textDecoration: 'none', fontWeight: 600 }}>
          데이터 폐기 결재 →
        </Link>
      </div>

      {/* P17-C/D — 내규 마스터 + 산출물 트래커 메인 탭 (페이지 컴포넌트 임베드) */}
      {tab === 'policies_master' && <PoliciesPage />}
      {tab === 'deliverables_tracker' && <DeliverablesPage />}

      {/* 대시보드 탭 */}
      {tab === 'dashboard' && (
        <>
          <DcStatStrip stats={stats} fullWidth />

          {/* 위젯 행 1: 다가오는 일정 + 검수 대기 */}
          <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 16, marginTop: 16 }}>
            {/* 📌 다가오는 일정 — 사용자 추가-B 통찰 */}
            <div style={{ ...GLASS.L3, padding: 18, borderRadius: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
                <h3 style={{ margin: 0, fontSize: 14 }}>📌 다가오는 일정 (D-14 이내)</h3>
                <span style={{ marginLeft: 'auto', fontSize: 11, color: COLORS.textMuted }}>총 {upcomingTasks.length}건</span>
              </div>
              {upcomingTasks.length === 0 ? (
                <div style={{ padding: 24, textAlign: 'center', fontSize: 13, color: COLORS.textSecondary }}>
                  📭 다가오는 task 없음 — 모두 완료됐거나 14일 이후 일정
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {upcomingTasks.map(({ task, days }) => {
                    const u = urgencyColor(days)
                    const cat = TASK_CATEGORY_LABEL[task.category]
                    return (
                      <div key={task.id}
                        onClick={() => setTaskActionModal(task)}
                        style={{
                          display: 'grid', gridTemplateColumns: '70px 1fr auto',
                          alignItems: 'center', gap: 12, padding: '10px 12px',
                          borderRadius: 8, border: `1px solid ${COLORS.borderSubtle}`,
                          background: u.bg, cursor: 'pointer',
                        }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: u.color }}>{u.label}</span>
                        <span style={{ fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {cat?.emoji} <strong>{task.scheduled_month}월</strong> {task.title}
                        </span>
                        <span style={{ fontSize: 11, color: COLORS.textMuted }}>{fmtDate(task.due_date)}</span>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* 🔴 검수 대기 매뉴얼·서식 — 사용자 추가-C 통찰 */}
            <div style={{ ...GLASS.L3, padding: 18, borderRadius: 12, borderLeft: `4px solid ${pendingVerifyDocs.length > 0 ? COLORS.warning : COLORS.success}` }}>
              <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
                <h3 style={{ margin: 0, fontSize: 14 }}>🔴 검수 대기 매뉴얼·서식</h3>
                <span style={{ marginLeft: 'auto', fontSize: 11, color: COLORS.textMuted }}>총 {pendingVerifyDocs.length}건</span>
              </div>
              {pendingVerifyDocs.length === 0 ? (
                <div style={{ padding: 24, textAlign: 'center', fontSize: 13, color: COLORS.success }}>
                  ✅ 모든 매뉴얼·서식 검수 완료
                </div>
              ) : (
                <>
                  <div style={{ maxHeight: 200, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {pendingVerifyDocs.slice(0, 8).map(d => (
                      <div key={d.id}
                        onClick={() => isCpoLike ? setVerifyModal(d) : setDocFileUrlModal(d)}
                        style={{ padding: '8px 10px', fontSize: 12, borderRadius: 6, border: `1px solid ${COLORS.borderSubtle}`, background: COLORS.bgGray, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span>{DOC_TYPE_LABEL[d.doc_type]?.emoji}</span>
                        <strong style={{ color: COLORS.textPrimary }}>{d.doc_code}</strong>
                        <span style={{ color: COLORS.textSecondary, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.title}</span>
                        <span style={{ marginLeft: 'auto', fontSize: 10, color: d.file_url ? COLORS.warning : COLORS.danger }}>
                          {d.file_url ? '📎 검수대기' : '⚠ URL미입력'}
                        </span>
                      </div>
                    ))}
                  </div>
                  <p style={{ marginTop: 10, marginBottom: 0, fontSize: 11, color: COLORS.textMuted }}>
                    {isCpoLike ? 'CPO 권한 — 클릭 시 검수 처리' : '클릭 시 file_url 입력 모달'}
                  </p>
                </>
              )}
            </div>
          </div>

          {/* 위젯 행 2: 연간 진행률 (사용자 추가-A 통찰) */}
          <div style={{ ...GLASS.L3, padding: 18, borderRadius: 12, marginTop: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
              <h3 style={{ margin: 0, fontSize: 14 }}>📈 연간 운영 진행률 (RIDE-PLAN-2026)</h3>
              <span style={{ marginLeft: 'auto', fontSize: 11, color: COLORS.textMuted }}>
                전체 {tasks.filter(t => t.status === 'done').length}/{tasks.length} 완료
              </span>
            </div>
            {progressByCategory.length === 0 ? (
              <div style={{ padding: 24, textAlign: 'center', fontSize: 13, color: COLORS.textSecondary }}>
                연간 task 미생성 — Phase 1.2 마이그 적용 필요
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10 }}>
                {progressByCategory.map(({ cat, total, done, overdue }) => {
                  const c = TASK_CATEGORY_LABEL[cat]
                  const pct = total > 0 ? Math.round((done / total) * 100) : 0
                  return (
                    <div key={cat} style={{ padding: 10, borderRadius: 8, border: `1px solid ${COLORS.borderSubtle}`, background: COLORS.bgGray }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                        <span style={{ fontSize: 12, fontWeight: 600, color: c?.color }}>{c?.emoji} {c?.label}</span>
                        <span style={{ fontSize: 11, color: COLORS.textMuted }}>{done}/{total}</span>
                      </div>
                      <div style={{ height: 6, background: COLORS.bgGray, borderRadius: 3, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${pct}%`, background: overdue > 0 ? COLORS.danger : COLORS.success }} />
                      </div>
                      {overdue > 0 && (
                        <span style={{ fontSize: 10, color: COLORS.danger, marginTop: 2, display: 'block' }}>⚠ 지연 {overdue}건</span>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* 위젯 행 3: 매뉴얼 안내 */}
          <div style={{ ...GLASS.L3, padding: 18, borderRadius: 12, marginTop: 16 }}>
            <h3 style={{ margin: '0 0 8px', fontSize: 14 }}>📋 운영 안내 (매뉴얼 통합본 5.17)</h3>
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, lineHeight: 1.8, color: COLORS.textSecondary }}>
              <li>침해사고: 발견 즉시 「침해사고」 탭 신고 — 매뉴얼 제27조. 정보주체 통지는 24h 이내 (제25조 ①).</li>
              <li>매뉴얼·서식: 「규정 문서 관리」 탭에서 원본 등록 → CPO 검수 → 활성화. 검수 미완료 서식은 작성 불가.</li>
              <li>연간 운영: 「연간 운영」 탭에서 월별 task 진행 추적. D-7/D-3/D-day 임박 시 색상 변경.</li>
              <li>서식 작성: 「서식 작성」 탭에서 인스턴스 list + 보존만료 추적 (3년).</li>
            </ul>
          </div>
        </>
      )}

      {/* Phase 1.1 탭들 */}
      {/* 운영 가이드 탭 (Phase 1.3-F) — 사용자 통찰 "step-by-step 으로 규정에 맞게 확립" */}
      {tab === 'guide' && (
        <OperationGuideTabContent
          officers={officers} documents={documents} assets={assets}
          tasks={tasks} incidents={incidents} annualPlan={annualPlan}
          onTabChange={setTab}
        />
      )}

      {tab === 'assets' && (
        <AssetsTabContent
          rows={filteredAssets} allRows={assets}
          query={assetQuery} setQuery={setAssetQuery}
          typeFilter={assetTypeFilter} setTypeFilter={setAssetTypeFilter}
          classFilter={assetClassFilter} setClassFilter={setAssetClassFilter}
          statusFilter={assetStatusFilter} setStatusFilter={setAssetStatusFilter}
          onCreate={() => setAssetModalOpen(true)} canEdit={isMgrLike}
        />
      )}
      {tab === 'incidents' && (
        <IncidentsTabContent
          rows={filteredIncidents}
          query={incidentQuery} setQuery={setIncidentQuery}
          typeFilter={incidentTypeFilter} setTypeFilter={setIncidentTypeFilter}
          severityFilter={incidentSeverityFilter} setSeverityFilter={setIncidentSeverityFilter}
          statusFilter={incidentStatusFilter} setStatusFilter={setIncidentStatusFilter}
          onCreate={() => setIncidentModalOpen(true)}
        />
      )}
      {tab === 'officers' && (
        <OfficersTabContent rows={officers} onCreate={() => setOfficerModalOpen(true)} userRole={user?.role} />
      )}

      {/* Phase 1.2 탭들 */}
      {tab === 'documents' && (
        <DocumentsTabContent
          rows={filteredDocs} allRows={documents}
          query={docQuery} setQuery={setDocQuery}
          typeFilter={docTypeFilter} setTypeFilter={setDocTypeFilter}
          statusFilter={docStatusFilter} setStatusFilter={setDocStatusFilter}
          verifiedFilter={docVerifiedFilter} setVerifiedFilter={setDocVerifiedFilter}
          onFileUrlClick={(d) => setDocFileUrlModal(d)}
          onVerifyClick={(d) => setVerifyModal(d)}
          onCreate={() => setNewDocModalOpen(true)}
          onChanged={fetchAll}
          isCpo={isCpoLike} isMgr={isMgrLike}
        />
      )}
      {tab === 'annual_ops' && (
        <AnnualOpsTabContent
          plan={annualPlan}
          rows={filteredTasks} allRows={tasks}
          categoryFilter={taskCategoryFilter} setCategoryFilter={setTaskCategoryFilter}
          statusFilter={taskStatusFilter} setStatusFilter={setTaskStatusFilter}
          monthFilter={taskMonthFilter} setMonthFilter={setTaskMonthFilter}
          documents={documents}
          onTaskClick={(t) => setTaskActionModal(t)}
          onSubmitForm={(doc, task) => setSubmitFormModal({ doc, task })}
        />
      )}
      {tab === 'submissions' && (
        <SubmissionsTabContent
          rows={filteredSubmissions} allRows={submissions}
          docFilter={subDocFilter} setDocFilter={setSubDocFilter}
          statusFilter={subStatusFilter} setStatusFilter={setSubStatusFilter}
          documents={documents}
          onCreate={(doc) => setSubmitFormModal({ doc })}
        />
      )}

      {/* 모달들 — Phase 1.1 */}
      {assetModalOpen && <AssetModal onClose={() => setAssetModalOpen(false)} onSaved={() => { setAssetModalOpen(false); fetchAll() }} />}
      {incidentModalOpen && <IncidentModal assets={assets} onClose={() => setIncidentModalOpen(false)} onSaved={() => { setIncidentModalOpen(false); fetchAll() }} />}
      {officerModalOpen && <OfficerModal onClose={() => setOfficerModalOpen(false)} onSaved={() => { setOfficerModalOpen(false); fetchAll() }} />}
      {/* 모달들 — Phase 1.2 */}
      {docFileUrlModal && <DocFileUrlModal doc={docFileUrlModal} onClose={() => setDocFileUrlModal(null)} onSaved={() => { setDocFileUrlModal(null); fetchAll() }} />}
      {/* Phase 1.4-fix13 — 규정 문서 신규 등록 */}
      {newDocModalOpen && <NewDocumentModal onClose={() => setNewDocModalOpen(false)} onSaved={() => { setNewDocModalOpen(false); fetchAll() }} />}
      {verifyModal && <VerifyModal doc={verifyModal} onClose={() => setVerifyModal(null)} onSaved={() => { setVerifyModal(null); fetchAll() }} />}
      {taskActionModal && <TaskActionModal task={taskActionModal} canCpoReview={isCpoLike} canManager={isMgrLike} onClose={() => setTaskActionModal(null)} onSaved={() => { setTaskActionModal(null); fetchAll() }} />}
      {submitFormModal && <SubmitFormModal doc={submitFormModal.doc} task={submitFormModal.task} onClose={() => setSubmitFormModal(null)} onSaved={() => { setSubmitFormModal(null); fetchAll() }} />}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════
// Phase 1.3-F — 운영 가이드 탭 (Step Playbook)
// 매뉴얼 통합본 5.17 9장 + 별첨 7 RIDE-PLAN-2026 기반 9 step
// 사용자 통찰: "step-by-step 으로 진행하면 정보보안을 규정에 맞게 확립하고 놓치지 않고 진행"
// ════════════════════════════════════════════════════════════════
function OperationGuideTabContent(props: {
  officers: Officer[]
  documents: ComplianceDocument[]
  assets: Asset[]
  tasks: ComplianceTask[]
  incidents: Incident[]
  annualPlan: AnnualPlan | null
  onTabChange: (key: TabKey) => void
}) {
  // Phase 2.1 — 확정 내규 (status='active') 연동 안내.
  // user_confirmed playbook_step sections 가 있으면 「현재 코드 const 9 step」 과 비교 표시.
  // 향후 Phase 2.1-B 에서 const 대체 (steps 데이터 풍부화 후).
  const [activePolicy, setActivePolicy] = useState<{ policy_title: string; policy_id: string; steps_count: number } | null>(null)
  useEffect(() => {
    const token = getStoredToken()
    fetch('/api/ride-compliance/playbook-active', {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    }).then(r => r.json()).then(j => {
      if (j?.success && j?.data?.active) {
        setActivePolicy({
          policy_title: String(j.data.policy_title || ''),
          policy_id: String(j.data.policy_id || ''),
          steps_count: Array.isArray(j.data.steps) ? j.data.steps.length : 0,
        })
      }
    }).catch(() => { /* graceful */ })
  }, [])

  // 각 step 의 진행 상태 자동 계산
  const stepStatus = useMemo(() => {
    const officersActive = props.officers.filter(o => o.is_active === 1)
    const cpoCount = officersActive.filter(o => o.role === 'cpo').length
    const mgrCount = officersActive.filter(o => o.role === 'manager').length

    const docsTotal = props.documents.length
    const docsVerified = props.documents.filter(d => d.is_master_verified === 1).length
    const docsPending = props.documents.filter(d => d.is_master_verified === 0).length

    const assetsTotal = props.assets.length

    const planExists = !!props.annualPlan
    const planTasks = props.tasks.length

    const eduTasks = props.tasks.filter(t => t.category === 'education')
    const eduDone = eduTasks.filter(t => t.status === 'done').length

    const inspTasks = props.tasks.filter(t => t.category === 'inspection' || t.category === 'destruction')
    const inspDone = inspTasks.filter(t => t.status === 'done').length

    const auditTasks = props.tasks.filter(t => t.category === 'audit')
    const auditDone = auditTasks.filter(t => t.status === 'done').length

    const procTasks = props.tasks.filter(t => t.category === 'processor')
    const procDone = procTasks.filter(t => t.status === 'done').length

    const incidentsOpen = props.incidents.filter(i => i.status !== 'resolved' && i.status !== 'closed').length
    const incidentsTotal = props.incidents.length

    return {
      officers: { done: cpoCount >= 1 && mgrCount >= 1, summary: `CPO ${cpoCount}명 · 관리자 ${mgrCount}명`, total: officersActive.length },
      documents: { done: docsTotal > 0 && docsPending === 0, summary: `검수 ${docsVerified}/${docsTotal}`, pending: docsPending },
      assets: { done: assetsTotal > 0, summary: `등록 ${assetsTotal}건`, total: assetsTotal },
      plan: { done: planExists && planTasks >= 12, summary: planExists ? `${props.annualPlan?.plan_code} · task ${planTasks}/12` : '미수립', total: planTasks },
      education: { done: eduTasks.length > 0 && eduDone >= 2, summary: `${eduDone}/${eduTasks.length} 회 완료`, total: eduTasks.length },
      inspection: { done: inspTasks.length > 0 && inspDone >= 4, summary: `${inspDone}/${inspTasks.length} 회 완료`, total: inspTasks.length },
      audit: { done: auditTasks.length > 0 && auditDone >= 2, summary: `${auditDone}/${auditTasks.length} 회 완료`, total: auditTasks.length },
      processor: { done: procTasks.length > 0 && procDone >= 2, summary: `${procDone}/${procTasks.length} 회 완료`, total: procTasks.length },
      incident: { done: true, summary: incidentsOpen > 0 ? `⚠ 미해결 ${incidentsOpen}건` : `누적 ${incidentsTotal}건 모두 종결`, total: incidentsTotal },
    }
  }, [props.officers, props.documents, props.assets, props.tasks, props.incidents, props.annualPlan])

  // 다음 우선 step 자동 식별 (가장 빠른 미완료 step)
  const nextStep = useMemo(() => {
    for (const step of PLAYBOOK_STEPS) {
      const st = stepStatus[step.statusKey]
      if (!st.done) return step.num
    }
    return null
  }, [stepStatus])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Phase 2.1 — 확정 내규 연동 배너 (없으면 안내) */}
      {activePolicy ? (
        <div style={{
          ...GLASS.L3, padding: 14, borderRadius: 10,
          border: '1px solid rgba(16,185,129,0.30)', background: 'rgba(220,252,231,0.40)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap',
        }}>
          <div style={{ fontSize: 13, color: '#047857' }}>
            <strong>📚 활성 내규 연동</strong> — {activePolicy.policy_title}{' '}
            <span style={{ marginLeft: 6, fontSize: 11, color: COLORS.textMuted }}>
              · 확정 Playbook {activePolicy.steps_count} 단계 / 코드 const {`9`} 단계
            </span>
          </div>
          <Link href="/RideCompliance/policies" style={{
            ...GLASS.L1, fontSize: 12, color: COLORS.primary, textDecoration: 'none',
            padding: '4px 10px', borderRadius: 6,
          }}>내규 관리 →</Link>
        </div>
      ) : (
        <div style={{
          ...GLASS.L3, padding: 14, borderRadius: 10,
          border: '1px solid rgba(245,158,11,0.30)', background: 'rgba(254,243,199,0.40)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap',
        }}>
          <div style={{ fontSize: 13, color: '#b45309' }}>
            <strong>⚠ 확정 내규 없음</strong>{' '}
            <span style={{ marginLeft: 6, fontSize: 11, color: COLORS.textMuted }}>
              아래 9 단계는 코드 const 기본값입니다. 내규 등록 + 확정 시 활성 Playbook 연동.
            </span>
          </div>
          <Link href="/RideCompliance/policies" style={{
            ...GLASS.L1, fontSize: 12, color: COLORS.primary, textDecoration: 'none',
            padding: '4px 10px', borderRadius: 6,
          }}>+ 내규 등록 →</Link>
        </div>
      )}

      {/* 안내 패널 */}
      <div style={{ ...GLASS.L3, padding: 18, borderRadius: 12, borderLeft: `4px solid ${COLORS.primary}` }}>
        <h2 style={{ margin: '0 0 8px', fontSize: 16, color: COLORS.textPrimary }}>📖 정보보안 운영 9 step — 규정에 맞게 단계별로 확립</h2>
        <p style={{ margin: 0, fontSize: 13, color: COLORS.textSecondary, lineHeight: 1.7 }}>
          라이드케어 「개인정보보호 내부관리계획서」 V1.0 (RIDE-PMP-2026-001) 의 9장 27조 + 별첨 7 RIDE-PLAN-2026 을 9개 운영 step 으로 재구성했습니다.
          각 step 카드의 <strong>목적·법적 근거·빈도·산출물</strong> 을 확인하고, 「바로가기」 로 해당 탭에서 작업할 수 있습니다.
          {nextStep && (
            <span style={{ display: 'block', marginTop: 8, padding: '8px 12px', background: COLORS.bgAmber, color: COLORS.warning, borderRadius: 6, fontWeight: 600 }}>
              👉 다음 우선 step: <strong>Step {nextStep}. {PLAYBOOK_STEPS[nextStep - 1].title}</strong> {PLAYBOOK_STEPS[nextStep - 1].emoji}
            </span>
          )}
          {!nextStep && (
            <span style={{ display: 'block', marginTop: 8, padding: '8px 12px', background: COLORS.bgGreen, color: COLORS.success, borderRadius: 6, fontWeight: 600 }}>
              ✅ 모든 step 진행 중 — 연간 캘린더 기반 정상 운영
            </span>
          )}
        </p>
      </div>

      {/* 9 Step 컴팩트 list — 사용자 통찰 (2026-05-19): "카드 grid 가 보기 편하지 않다" → 옵션 2 list 형식 */}
      <div style={{ ...GLASS.L3, padding: 0, borderRadius: 12, overflow: 'hidden' }}>
        <PlaybookStepList
          steps={PLAYBOOK_STEPS} stepStatus={stepStatus} nextStep={nextStep}
          onTabChange={props.onTabChange}
        />
      </div>

      {/* 매뉴얼 간 정합성 검사 — 사용자 통찰 (2026-05-19): "각 매뉴얼간의 오류체크도 가능해야합니다" */}
      <ConsistencyCheckWidget />


      {/* 12개월 캘린더 (별첨 7 RIDE-PLAN-2026 시각화) */}
      <div style={{ ...GLASS.L3, padding: 18, borderRadius: 12 }}>
        <h3 style={{ margin: '0 0 12px', fontSize: 14, color: COLORS.textPrimary }}>📅 12개월 운영 캘린더 (별첨 7 RIDE-PLAN-2026)</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: 4 }}>
          {[1,2,3,4,5,6,7,8,9,10,11,12].map(m => {
            const stepsInMonth = PLAYBOOK_STEPS.filter(s => s.months.includes(m))
            const monthTasks = props.tasks.filter(t => t.scheduled_month === m)
            const tasksDone = monthTasks.filter(t => t.status === 'done').length
            return (
              <div key={m} style={{
                padding: 8, borderRadius: 6, border: `1px solid ${COLORS.borderSubtle}`,
                background: stepsInMonth.length > 0 ? COLORS.bgBlue : COLORS.bgGray,
                minHeight: 80,
              }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.textPrimary, textAlign: 'center', marginBottom: 6 }}>{m}월</div>
                {stepsInMonth.map(s => (
                  <div key={s.num} style={{ fontSize: 10, color: COLORS.primary, marginBottom: 2 }}>{s.emoji}</div>
                ))}
                {monthTasks.length > 0 && (
                  <div style={{ fontSize: 9, color: COLORS.textMuted, textAlign: 'center', marginTop: 4 }}>
                    {tasksDone}/{monthTasks.length}
                  </div>
                )}
              </div>
            )
          })}
        </div>
        <p style={{ margin: '10px 0 0', fontSize: 11, color: COLORS.textMuted }}>
          색칠된 월은 별첨 7 의 정기 task 가 배정된 달. 숫자는 task 완료/전체.
          상시 step (1번 조직 임명, 2번 자료 검수, 9번 침해사고) 은 캘린더 외 — 카드 grid 참조.
        </p>
      </div>

      {/* 매뉴얼 인용 안내 */}
      <div style={{ ...GLASS.L3, padding: 14, borderRadius: 10, fontSize: 11, color: COLORS.textMuted, lineHeight: 1.6 }}>
        💡 본 가이드는 「개인정보보호 내부관리계획서」 V1.0 (RIDE-PMP-2026-001) 및 별첨 7 RIDE-PLAN-2026 의 모든 조항을 9 step 으로 재구성한 것입니다.
        원본 매뉴얼 내용은 「규정 문서 관리」 탭의 각 매뉴얼 페이지에서 확인할 수 있습니다.
      </div>
    </div>
  )
}

function MetaLine(props: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', gap: 6, marginBottom: 2 }}>
      <span style={{ color: COLORS.textMuted, flexShrink: 0, minWidth: 50 }}>{props.label}</span>
      <span style={{ color: COLORS.textPrimary, lineHeight: 1.5 }}>{props.value}</span>
    </div>
  )
}

// ────────── 운영 가이드 컴팩트 list (옵션 2) ──────────
// 각 행: [번호] emoji 제목 + 진행상태 배지 + 요약 + 「→ 바로가기」 + 「상세 ▾」
// 「상세 ▾」 클릭 시 펼침 — 목적/근거/빈도/책임/산출
function PlaybookStepList(props: {
  steps: PlaybookStep[]
  stepStatus: Record<string, { done: boolean; summary: string }>
  nextStep: number | null
  onTabChange: (key: TabKey) => void
}) {
  const [expanded, setExpanded] = useState<number | null>(null)

  return (
    <div>
      {props.steps.map((step, idx) => {
        const st = props.stepStatus[step.statusKey]
        const isDone = st.done
        const isNext = props.nextStep === step.num
        const isExpanded = expanded === step.num
        const isLast = idx === props.steps.length - 1

        // 상태별 색상
        const badgeBg = isDone ? COLORS.bgGreen : isNext ? COLORS.bgAmber : COLORS.bgGray
        const badgeColor = isDone ? COLORS.success : isNext ? COLORS.warning : COLORS.textMuted
        const badgeLabel = isDone ? '✓ 완료' : isNext ? '👉 다음' : '대기'
        const numBg = isDone ? COLORS.success : isNext ? COLORS.warning : COLORS.textMuted

        return (
          <div key={step.num} style={{
            borderBottom: isLast ? 'none' : `1px solid ${COLORS.borderSubtle}`,
            background: isNext ? `${COLORS.warning}08` : 'transparent',
          }}>
            {/* 메인 행 */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: '36px 1fr auto auto',
              gap: 12, alignItems: 'center',
              padding: '12px 16px',
              cursor: 'pointer',
            }} onClick={() => setExpanded(isExpanded ? null : step.num)}>
              {/* 번호 배지 */}
              <div style={{
                width: 28, height: 28, borderRadius: '50%',
                background: numBg, color: '#fff',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 12, fontWeight: 700,
              }}>
                {isDone ? '✓' : step.num}
              </div>

              {/* 제목 + 요약 */}
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.textPrimary, marginBottom: 2 }}>
                  {step.emoji} {step.title}
                  {step.months.length > 0 && (
                    <span style={{ marginLeft: 8, fontSize: 10, color: COLORS.textMuted, fontWeight: 500 }}>
                      ({step.months.join('·')}월)
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 11, color: COLORS.textSecondary }}>
                  <span style={{
                    display: 'inline-block', padding: '1px 6px', borderRadius: 8,
                    background: badgeBg, color: badgeColor,
                    fontSize: 10, fontWeight: 600, marginRight: 6,
                  }}>{badgeLabel}</span>
                  {st.summary}
                </div>
              </div>

              {/* 바로가기 버튼 (첫 번째 link 만 표시 — 추가 link 는 펼침 영역에) */}
              <div style={{ display: 'flex', gap: 4 }} onClick={e => e.stopPropagation()}>
                {step.links.slice(0, 1).map((link, i) => (
                  link.tab ? (
                    <button key={i} onClick={() => props.onTabChange(link.tab!)}
                      style={{ ...BTN.sm, border: 'none', background: COLORS.bgBlue, color: COLORS.primary, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                      → {link.label}
                    </button>
                  ) : (
                    <Link key={i} href={link.href} style={{ ...BTN.sm, border: 'none', background: COLORS.bgBlue, color: COLORS.primary, textDecoration: 'none', display: 'inline-block', whiteSpace: 'nowrap' }}>
                      → {link.label}
                    </Link>
                  )
                ))}
              </div>

              {/* 펼침 토글 */}
              <span style={{ fontSize: 12, color: COLORS.textMuted, width: 20, textAlign: 'center' }}>
                {isExpanded ? '▾' : '▸'}
              </span>
            </div>

            {/* 펼침 영역 — 목적/근거/빈도/책임/산출 + 상세 설명 */}
            {isExpanded && (
              <div style={{
                padding: '0 16px 14px 64px',
                fontSize: 12, color: COLORS.textSecondary, lineHeight: 1.7,
              }}>
                <p style={{ margin: '0 0 10px', color: COLORS.textPrimary }}>
                  {step.detail}
                </p>
                <div style={{ background: COLORS.bgGray, padding: 10, borderRadius: 6, fontSize: 11, lineHeight: 1.8 }}>
                  <MetaLine label="🎯 목적" value={step.purpose} />
                  <MetaLine label="📜 근거" value={step.legal} />
                  <MetaLine label="📅 빈도" value={step.frequency + (step.months.length > 0 ? ` (${step.months.join('·')}월)` : '')} />
                  <MetaLine label="👤 책임" value={step.responsible} />
                  <MetaLine label="📝 산출" value={step.output} />
                </div>
                {/* 추가 link (첫 번째 제외) */}
                {step.links.length > 1 && (
                  <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                    {step.links.slice(1).map((link, i) => (
                      link.tab ? (
                        <button key={i} onClick={() => props.onTabChange(link.tab!)}
                          style={{ ...BTN.sm, border: 'none', background: COLORS.bgBlue, color: COLORS.primary, cursor: 'pointer' }}>
                          → {link.label}
                        </button>
                      ) : (
                        <Link key={i} href={link.href} style={{ ...BTN.sm, border: 'none', background: COLORS.bgBlue, color: COLORS.primary, textDecoration: 'none', display: 'inline-block' }}>
                          → {link.label}
                        </Link>
                      )
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ────────── 매뉴얼 간 정합성 검사 위젯 (Phase 1.3-H 통합) ──────────
// 사용자 통찰: "각 매뉴얼간의 오류체크도 가능해야합니다"
// 7 카테고리 (people/forms/clauses/dates/frequency/orphans/coverage) 자동 검증
function ConsistencyCheckWidget() {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{
    issues: Array<{ severity: string; category: string; message: string; doc_codes: string[]; detail?: string }>
    stats: { total_docs?: number; manuals?: number; forms?: number; with_content?: number; verified?: number; error?: number; warning?: number; info?: number; score?: number }
  } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState(false)

  const runCheck = async () => {
    setLoading(true); setError(null)
    try {
      const token = getStoredToken()
      const res = await fetch('/api/ride-compliance/consistency-check', {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        cache: 'no-store',
      })
      const json = await res.json()
      if (!res.ok || !json.success) { setError(json.error || `HTTP ${res.status}`); return }
      setResult(json.data)
      setExpanded(true)
    } catch (e) { setError(String(e)) } finally { setLoading(false) }
  }

  const issuesByCategory = useMemo(() => {
    if (!result) return {} as Record<string, typeof result.issues>
    const map: Record<string, typeof result.issues> = {}
    for (const issue of result.issues) {
      if (!map[issue.category]) map[issue.category] = []
      map[issue.category].push(issue)
    }
    return map
  }, [result])

  const CATEGORY_LABEL: Record<string, string> = {
    people: '👥 인명·직책',
    forms: '📝 서식 참조',
    clauses: '📜 조항 번호',
    dates: '📅 시행일',
    frequency: '🔁 빈도 표기',
    orphans: '⚠ 검수·본문 정합',
    coverage: '🔗 매뉴얼 참조',
  }

  const scoreColor = (result?.stats.score ?? 100) >= 90 ? COLORS.success
                   : (result?.stats.score ?? 0) >= 70 ? COLORS.warning : COLORS.danger

  return (
    <div style={{ ...GLASS.L3, padding: 18, borderRadius: 12, borderLeft: `4px solid ${COLORS.info}` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <h3 style={{ margin: 0, fontSize: 14, color: COLORS.textPrimary }}>🔍 매뉴얼 간 정합성 검사</h3>
        {result && (
          <span style={{ padding: '2px 10px', borderRadius: 10, background: `${scoreColor}18`, color: scoreColor, fontSize: 12, fontWeight: 700 }}>
            정합성 점수 {result.stats.score}/100
          </span>
        )}
        <button onClick={runCheck} disabled={loading} style={{ ...btnPrimary, marginLeft: 'auto' }}>
          {loading ? '검사 중…' : result ? '🔄 재검사' : '🔍 검사 시작'}
        </button>
      </div>
      <p style={{ margin: '0 0 12px', fontSize: 12, color: COLORS.textSecondary, lineHeight: 1.6 }}>
        매뉴얼·서식 26건의 cross-reference 자동 검증 — 인명 일관성 / 서식 참조 / 조항 번호 / 시행일 / 빈도 / 본문 정합 / 매뉴얼 참조 7 카테고리.
      </p>

      {error && (
        <div style={{ padding: '8px 12px', borderRadius: 6, background: `${COLORS.danger}18`, color: COLORS.danger, fontSize: 13, marginBottom: 12 }}>
          ❌ {error}
        </div>
      )}

      {result && (
        <>
          {/* 통계 row */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 8, marginBottom: 14 }}>
            <StatBlock label="총 문서" value={result.stats.total_docs ?? 0} color={COLORS.info} />
            <StatBlock label="본문 있음" value={result.stats.with_content ?? 0} color={COLORS.success} />
            <StatBlock label="검수 완료" value={result.stats.verified ?? 0} color={COLORS.success} />
            <StatBlock label="🔴 error" value={result.stats.error ?? 0} color={COLORS.danger} />
            <StatBlock label="🟡 warning" value={result.stats.warning ?? 0} color={COLORS.warning} />
            <StatBlock label="🔵 info" value={result.stats.info ?? 0} color={COLORS.info} />
          </div>

          {/* 결과 펼침 */}
          {expanded && result.issues.length === 0 && (
            <div style={{ padding: 16, textAlign: 'center', background: COLORS.bgGreen, borderRadius: 8, color: COLORS.success, fontSize: 14 }}>
              ✅ 정합성 이슈 없음 — 모든 매뉴얼·서식이 일관성 있게 등록·검수됐습니다.
            </div>
          )}

          {expanded && result.issues.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {Object.entries(issuesByCategory).map(([cat, issues]) => (
                <div key={cat} style={{ border: `1px solid ${COLORS.borderSubtle}`, borderRadius: 8, overflow: 'hidden' }}>
                  <div style={{ padding: '8px 14px', background: COLORS.bgGray, fontSize: 12, fontWeight: 700, color: COLORS.textPrimary }}>
                    {CATEGORY_LABEL[cat] || cat} <span style={{ marginLeft: 6, color: COLORS.textMuted, fontWeight: 500 }}>({issues.length}건)</span>
                  </div>
                  {issues.map((issue, i) => {
                    const sevColor = issue.severity === 'error' ? COLORS.danger : issue.severity === 'warning' ? COLORS.warning : COLORS.info
                    const sevBg = issue.severity === 'error' ? COLORS.bgRed : issue.severity === 'warning' ? COLORS.bgAmber : COLORS.bgBlue
                    return (
                      <div key={i} style={{ padding: '10px 14px', borderTop: i > 0 ? `1px solid ${COLORS.borderSubtle}` : 'none' }}>
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 4 }}>
                          <span style={{ padding: '1px 6px', borderRadius: 4, background: sevBg, color: sevColor, fontSize: 10, fontWeight: 700, flexShrink: 0 }}>
                            {issue.severity.toUpperCase()}
                          </span>
                          <span style={{ fontSize: 12, color: COLORS.textPrimary, fontWeight: 600 }}>{issue.message}</span>
                        </div>
                        {issue.detail && (
                          <div style={{ marginLeft: 56, fontSize: 11, color: COLORS.textSecondary, lineHeight: 1.6 }}>
                            {issue.detail}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              ))}
            </div>
          )}

          {expanded && (
            <button onClick={() => setExpanded(false)} style={{ ...btnSecondary, marginTop: 12, fontSize: 11 }}>
              ▴ 결과 접기
            </button>
          )}
          {!expanded && (
            <button onClick={() => setExpanded(true)} style={{ ...btnSecondary, marginTop: 8, fontSize: 11 }}>
              ▾ {result.issues.length} 건 결과 펼치기
            </button>
          )}
        </>
      )}
    </div>
  )
}

function StatBlock(props: { label: string; value: number; color: string }) {
  return (
    <div style={{ padding: '8px 10px', borderRadius: 6, background: COLORS.bgGray, textAlign: 'center' }}>
      <div style={{ fontSize: 10, color: COLORS.textMuted, marginBottom: 2 }}>{props.label}</div>
      <div style={{ fontSize: 16, fontWeight: 700, color: props.color }}>{props.value}</div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════
// Phase 1.1 탭 컴포넌트들 (기존 유지)
// ════════════════════════════════════════════════════════════════
function AssetsTabContent(props: {
  rows: Asset[]; allRows: Asset[]
  query: string; setQuery: (v: string) => void
  typeFilter: string; setTypeFilter: (v: string) => void
  classFilter: string; setClassFilter: (v: string) => void
  statusFilter: string; setStatusFilter: (v: string) => void
  onCreate: () => void; canEdit: boolean
}) {
  const cols: TableColumn<Asset>[] = [
    { key: 'asset_code', label: '자산코드', sortBy: r => r.asset_code, render: r => (
      <Link href={`/RideCompliance/assets/${r.id}`} style={{ color: COLORS.primary, fontWeight: 600 }}>{r.asset_code}</Link>
    ) },
    { key: 'name', label: '자산명', sortBy: r => r.name, render: r => r.name },
    { key: 'asset_type', label: '유형', sortBy: r => r.asset_type, render: r => {
      const t = ASSET_TYPE_LABEL[r.asset_type]; return <span>{t?.emoji} {t?.label || r.asset_type}</span>
    } },
    { key: 'classification', label: '등급', sortBy: r => r.classification, render: r => {
      const c = CLASSIFICATION_LABEL[r.classification]; return <span style={{ color: c?.color, fontWeight: 600 }}>{c?.label || r.classification}</span>
    } },
    { key: 'contains_pii', label: 'PII', sortBy: r => r.contains_pii, render: r => r.contains_pii === 1 ? '🔐' : '' },
    { key: 'encryption_status', label: '암호화', sortBy: r => r.encryption_status, render: r => r.encryption_status },
    { key: 'owner_user_name', label: '보유자', sortBy: r => r.owner_user_name || '', render: r => r.owner_user_name || '—' },
    { key: 'location', label: '위치', sortBy: r => r.location || '', render: r => r.location || '—' },
    { key: 'status', label: '상태', sortBy: r => r.status, render: r => {
      const s = ASSET_STATUS_LABEL[r.status]; return <span style={{ color: s?.color, fontWeight: 600 }}>{s?.label || r.status}</span>
    } },
    { key: 'created_at', label: '등록일', sortBy: r => r.created_at, render: r => fmtDate(r.created_at) },
  ]
  return (
    <div style={{ ...GLASS.L3, padding: 20, borderRadius: 12 }}>
      <DcToolbar
        search={props.query}
        onSearchChange={props.setQuery}
        placeholder="자산명·코드·위치 검색"
        trailing={
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <select value={props.typeFilter} onChange={e => props.setTypeFilter(e.target.value)} style={selStyle()}>
              <option value="">유형: 전체</option>
              {Object.entries(ASSET_TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v.emoji} {v.label}</option>)}
            </select>
            <select value={props.classFilter} onChange={e => props.setClassFilter(e.target.value)} style={selStyle()}>
              <option value="">등급: 전체</option>
              {Object.entries(CLASSIFICATION_LABEL).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
            <select value={props.statusFilter} onChange={e => props.setStatusFilter(e.target.value)} style={selStyle()}>
              <option value="">상태: 전체</option>
              {Object.entries(ASSET_STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
            {props.canEdit && <button onClick={props.onCreate} style={btnPrimary}>＋ 자산 등록</button>}
          </div>
        }
      />
      <div style={{ marginBottom: 8, fontSize: 12, color: COLORS.textSecondary }}>총 {props.allRows.length}건 중 {props.rows.length}건 표시</div>
      <NeuDataTable columns={cols} data={props.rows} rowKey={r => r.id} />
    </div>
  )
}

function IncidentsTabContent(props: {
  rows: Incident[]
  query: string; setQuery: (v: string) => void
  typeFilter: string; setTypeFilter: (v: string) => void
  severityFilter: string; setSeverityFilter: (v: string) => void
  statusFilter: string; setStatusFilter: (v: string) => void
  onCreate: () => void
}) {
  const cols: TableColumn<Incident>[] = [
    { key: 'incident_code', label: '사고번호', sortBy: r => r.incident_code, render: r => (
      <Link href={`/RideCompliance/incidents/${r.id}`} style={{ color: COLORS.primary, fontWeight: 600 }}>{r.incident_code}</Link>
    ) },
    { key: 'title', label: '제목', sortBy: r => r.title, render: r => r.title },
    { key: 'incident_type', label: '유형', sortBy: r => r.incident_type, render: r => {
      const t = INCIDENT_TYPE_LABEL[r.incident_type]; return <span>{t?.emoji} {t?.label || r.incident_type}</span>
    } },
    { key: 'severity', label: '심각도', sortBy: r => r.severity, render: r => {
      const s = SEVERITY_LABEL[r.severity]; return <span style={{ color: s?.color, fontWeight: 600 }}>{s?.label || r.severity}</span>
    } },
    { key: 'status', label: '상태', sortBy: r => r.status, render: r => {
      const s = INCIDENT_STATUS_LABEL[r.status]; return <span style={{ color: s?.color, fontWeight: 600 }}>{s?.label || r.status}</span>
    } },
    { key: 'sla', label: '24h SLA', sortBy: r => slaRemainHours(r.detected_at, r.notified_at) ?? 9999, render: r => {
      if (r.notified_at) return <span style={{ color: COLORS.success }}>✓ 통지완료</span>
      if (r.status === 'resolved' || r.status === 'closed') return '—'
      const h = slaRemainHours(r.detected_at, r.notified_at)
      if (h === null) return '—'
      if (h < 0) return <span style={{ color: COLORS.danger, fontWeight: 700 }}>⚠ 초과</span>
      if (h < 6) return <span style={{ color: COLORS.danger, fontWeight: 700 }}>⏰ {Math.floor(h)}h</span>
      if (h < 12) return <span style={{ color: COLORS.warning }}>{Math.floor(h)}h</span>
      return <span style={{ color: COLORS.textSecondary }}>{Math.floor(h)}h</span>
    } },
    { key: 'reporter_user_name', label: '신고자', sortBy: r => r.reporter_user_name || '', render: r => r.reporter_user_name || '—' },
    { key: 'detected_at', label: '감지일시', sortBy: r => r.detected_at, render: r => fmtDateTime(r.detected_at) },
    { key: 'affected_subjects_count', label: '영향(명)', sortBy: r => r.affected_subjects_count ?? 0, render: r => r.affected_subjects_count ?? '—' },
  ]
  return (
    <div style={{ ...GLASS.L3, padding: 20, borderRadius: 12 }}>
      <DcToolbar
        search={props.query}
        onSearchChange={props.setQuery}
        placeholder="제목·번호·경위 검색"
        trailing={
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <select value={props.typeFilter} onChange={e => props.setTypeFilter(e.target.value)} style={selStyle()}>
              <option value="">유형: 전체</option>
              {Object.entries(INCIDENT_TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v.emoji} {v.label}</option>)}
            </select>
            <select value={props.severityFilter} onChange={e => props.setSeverityFilter(e.target.value)} style={selStyle()}>
              <option value="">심각도: 전체</option>
              {Object.entries(SEVERITY_LABEL).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
            <select value={props.statusFilter} onChange={e => props.setStatusFilter(e.target.value)} style={selStyle()}>
              <option value="">상태: 전체</option>
              {Object.entries(INCIDENT_STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
            <button onClick={props.onCreate} style={btnDanger}>🚨 사고 신고</button>
          </div>
        }
      />
      <NeuDataTable columns={cols} data={props.rows} rowKey={r => r.id} />
    </div>
  )
}

function OfficersTabContent(props: { rows: Officer[]; onCreate: () => void; userRole?: string }) {
  const cols: TableColumn<Officer>[] = [
    { key: 'role', label: '역할', sortBy: r => r.role, render: r => {
      const t = ROLE_LABEL[r.role]; return <span style={{ color: t?.color, fontWeight: 700 }}>{t?.emoji} {t?.label || r.role}</span>
    } },
    { key: 'user_name', label: '성명', sortBy: r => r.user_name || '', render: r => r.user_name || '(미확인)' },
    { key: 'display_title', label: '직책', sortBy: r => r.display_title || '', render: r => r.display_title || '—' },
    { key: 'business_unit', label: '사업부', sortBy: r => r.business_unit || '', render: r => r.business_unit || '—' },
    { key: 'appointed_at', label: '임명일', sortBy: r => r.appointed_at, render: r => fmtDate(r.appointed_at) },
    { key: 'released_at', label: '해임일', sortBy: r => r.released_at || '', render: r => r.released_at ? fmtDate(r.released_at) : '—' },
    { key: 'is_active', label: '상태', sortBy: r => r.is_active, render: r => r.is_active === 1 ? <span style={{ color: COLORS.success }}>현직</span> : <span style={{ color: COLORS.textSecondary }}>해임</span> },
    { key: 'notes', label: '비고', sortBy: r => r.notes || '', render: r => r.notes || '—' },
  ]
  const canEdit = props.userRole === 'admin'
  return (
    <div style={{ ...GLASS.L3, padding: 20, borderRadius: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 16, gap: 12 }}>
        <div style={{ fontSize: 13, color: COLORS.textSecondary }}>
          매뉴얼 통합본 5.17 제6조·제9조 기반 3-tier 조직 매핑. 임명은 CPO·시스템관리자가 등록.
        </div>
        {canEdit && <button onClick={props.onCreate} style={{ ...btnPrimary, marginLeft: 'auto' }}>＋ 임명 등록</button>}
      </div>
      {props.rows.length === 0 ? (
        <div style={{ padding: 32, textAlign: 'center', color: COLORS.textSecondary, fontSize: 13 }}>
          등록된 임명 기록이 없습니다. 매뉴얼 통합본 5.17 제6조 명시 인원 (임성민 이사 CPO / 석호민·양재희 부장 관리자) 을 먼저 등록하시기 바랍니다.
        </div>
      ) : (
        <NeuDataTable columns={cols} data={props.rows} rowKey={r => r.id} />
      )}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════
// Phase 1.2 탭 컴포넌트들
// ════════════════════════════════════════════════════════════════
function DocumentsTabContent(props: {
  rows: ComplianceDocument[]; allRows: ComplianceDocument[]
  query: string; setQuery: (v: string) => void
  typeFilter: string; setTypeFilter: (v: string) => void
  statusFilter: string; setStatusFilter: (v: string) => void
  verifiedFilter: string; setVerifiedFilter: (v: string) => void
  onFileUrlClick: (d: ComplianceDocument) => void
  onVerifyClick: (d: ComplianceDocument) => void
  onCreate: () => void
  onChanged: () => void
  isCpo: boolean; isMgr: boolean
}) {
  // Phase 1.4-fix13 — 검수 리셋 / 삭제 (CRUD 완성)
  const [busyId, setBusyId] = useState<string | null>(null)
  // Phase 1.4-fix15 — 체크박스 선택 (id Set)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  // PR-RC-X — 글래스 알림 + 확인 다이얼로그 (Rule 20)
  const [notice, setNotice] = useState<Notice | null>(null)
  const [confirmReq, setConfirmReq] = useState<ConfirmRequest | null>(null)

  // 시드 문서 판별 — 통합본 5.17 「파생서류 목차」 25건 (RIDE-* / F-*)
  const isSeedDoc = (code: string) => /^(RIDE-|F-)/.test(code)

  // Phase 1.4-fix15 — 체크박스 토글
  const toggleSelect = (id: string, checked: boolean) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (checked) next.add(id); else next.delete(id)
      return next
    })
  }
  const selectAllVisible = () => {
    setSelectedIds(new Set(props.rows.map(r => r.id)))
  }
  const clearSelection = () => {
    setSelectedIds(new Set())
  }

  // PR-RC-X — alert/confirm 제거 → 글래스 패널 (Rule 20)
  const handleReset = (d: ComplianceDocument) => {
    setConfirmReq({
      title: `검수 상태 리셋 — ${d.doc_code}`,
      body: `「${d.doc_code} ${d.title}」 검수 상태를 리셋합니다.\n\n검수 완료 → 검수 대기(pending) 로 되돌립니다.\n본문·PDF·버전은 유지됩니다.\n재검토 → 승인 흐름을 다시 실행할 수 있습니다.`,
      confirmLabel: '리셋',
      onConfirm: async () => {
        setBusyId(d.id)
        try {
          const token = getStoredToken()
          const res = await fetch(`/api/ride-compliance/documents/${d.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
            body: JSON.stringify({ action: 'reset' }),
          })
          const json = await res.json()
          if (!res.ok || !json.success) { setNotice({ tone: 'danger', title: '리셋 실패', body: String(json.error || res.status) }); return }
          setNotice({ tone: 'success', title: '✅ 검수 리셋 완료', body: `${d.doc_code} ${d.title}` })
          props.onChanged()
        } catch (e) { setNotice({ tone: 'danger', title: '리셋 오류', body: String(e) }) } finally { setBusyId(null) }
      },
    })
  }

  const handleDelete = (d: ComplianceDocument) => {
    const seedWarn = isSeedDoc(d.doc_code)
      ? '\n\n⚠ 이 문서는 통합본 5.17 「파생서류 목차」 근거 문서입니다.\n삭제 대신 「🔄 리셋」 을 권장합니다.'
      : ''
    setConfirmReq({
      title: `문서 삭제 — ${d.doc_code}`,
      body: `「${d.doc_code} ${d.title}」 을(를) 삭제합니다.\n\n· 버전 이력 + 서식 제출 인스턴스 함께 삭제\n· GCS 원본 파일도 삭제\n· 연결된 task 는 보존 (출처만 분리)${seedWarn}\n\n되돌릴 수 없습니다.`,
      confirmLabel: '영구 삭제',
      danger: true,
      onConfirm: async () => {
        setBusyId(d.id)
        try {
          const token = getStoredToken()
          const res = await fetch(`/api/ride-compliance/documents/${d.id}`, {
            method: 'DELETE',
            headers: token ? { Authorization: `Bearer ${token}` } : {},
          })
          const json = await res.json()
          if (!res.ok || !json.success) { setNotice({ tone: 'danger', title: '삭제 실패', body: String(json.error || res.status) }); return }
          const c = json.data?.cascade
          setNotice({
            tone: 'success',
            title: `✅ 삭제 완료 — ${d.doc_code}`,
            body: `버전 ${c?.versions ?? 0} · 서식제출 ${c?.submissions ?? 0} · task 분리 ${c?.detached_tasks ?? 0}${json.data?.gcs?.deleted ? ' · GCS 파일 삭제' : ''}`,
          })
          props.onChanged()
        } catch (e) { setNotice({ tone: 'danger', title: '삭제 오류', body: String(e) }) } finally { setBusyId(null) }
      },
    })
  }

  // Phase 1.4-fix15 — 체크박스 선택 삭제 (fix14 의 필터단위 일괄 삭제 대체)
  const handleBulkDelete = () => {
    const ids = Array.from(selectedIds)
    if (ids.length === 0) { setNotice({ tone: 'info', title: '선택된 문서가 없습니다.' }); return }
    const selectedRows = props.rows.filter(r => selectedIds.has(r.id))
    const seedRows = selectedRows.filter(r => isSeedDoc(r.doc_code))
    const seedNote = seedRows.length > 0 ? ` (⚠ 시드 ${seedRows.length}개 포함)` : ''
    // 1차 확인 — cascade 안내 + 시드 강조
    setConfirmReq({
      title: `선택한 ${ids.length}건${seedNote} 삭제`,
      body: `· 버전 이력 + 서식 제출 인스턴스 함께 삭제\n· GCS 원본 파일도 삭제\n· 연결된 task 는 보존 (출처만 분리)\n\n다음 단계에서 한 번 더 확인합니다.`,
      confirmLabel: '다음',
      danger: true,
      onConfirm: () => {
        // 2차 확인 — 되돌릴 수 없음
        setConfirmReq({
          title: '되돌릴 수 없습니다',
          body: `정말 ${ids.length}건 삭제하시겠어요?`,
          confirmLabel: '영구 삭제',
          danger: true,
          onConfirm: async () => {
            setBusyId('__bulk__')
            try {
              const token = getStoredToken()
              const res = await fetch('/api/ride-compliance/documents/bulk-delete', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
                body: JSON.stringify({ ids }),
              })
              const json = await res.json()
              if (!res.ok || !json.success) { setNotice({ tone: 'danger', title: '선택 삭제 실패', body: String(json.error || res.status) }); return }
              const d = json.data
              const gcsLine = d.gcs?.failures?.length
                ? `· GCS 파일 ${d.gcs.deleted}건 · 실패 ${d.gcs.failures.length}`
                : `· GCS 파일 ${d.gcs?.deleted ?? 0}건`
              setNotice({
                tone: 'success',
                title: '✅ 선택 삭제 완료',
                body: `· 문서 ${d.deleted}건 (요청 ${d.requested})\n· 버전 ${d.cascade?.versions ?? 0} · 서식제출 ${d.cascade?.submissions ?? 0} · task 분리 ${d.cascade?.detached_tasks ?? 0}\n${gcsLine}`,
              })
              clearSelection()
              props.onChanged()
            } catch (e) { setNotice({ tone: 'danger', title: '선택 삭제 오류', body: String(e) }) } finally { setBusyId(null) }
          },
        })
      },
    })
  }

  const cols: TableColumn<ComplianceDocument>[] = [
    // Phase 1.4-fix15 — 체크박스 선택 컬럼 (manager+ 만 의미, 그 외에도 표시 시 disabled)
    { key: 'select', label: '☐', render: r => (
      <input
        type="checkbox"
        style={{ width: 18, height: 18, accentColor: '#3b6eb5', cursor: props.isMgr ? 'pointer' : 'not-allowed' }}
        checked={selectedIds.has(r.id)}
        onChange={e => toggleSelect(r.id, e.target.checked)}
        disabled={!props.isMgr}
        title={props.isMgr ? '선택' : '관리자(manager+) 만 선택 가능'}
        onClick={e => e.stopPropagation()}
      />
    ) },
    { key: 'doc_code', label: '코드', sortBy: r => r.doc_code, render: r => {
      // Phase 1.3 — 매뉴얼·서식별 페이지로 deep-link
      const href = r.doc_type === 'manual'
        ? `/RideCompliance/manuals/${r.doc_code}`
        : r.doc_type === 'form'
          ? `/RideCompliance/forms/${r.doc_code}`
          : null
      return href
        ? <Link href={href} style={{ color: COLORS.primary, fontWeight: 600 }}>{r.doc_code}</Link>
        : <strong style={{ color: COLORS.textPrimary }}>{r.doc_code}</strong>
    } },
    { key: 'doc_type', label: '유형', sortBy: r => r.doc_type, render: r => {
      const t = DOC_TYPE_LABEL[r.doc_type]; return <span>{t?.emoji} {t?.label || r.doc_type}</span>
    } },
    { key: 'title', label: '제목', sortBy: r => r.title, render: r => r.title },
    { key: 'parent_manual_code', label: '소속', sortBy: r => r.parent_manual_code || '', render: r => r.parent_manual_code || '—' },
    { key: 'current_version_no', label: '버전', sortBy: r => r.current_version_no || 'V1.0', render: r => r.current_version_no || 'V1.0' },
    { key: 'effective_date', label: '시행일', sortBy: r => r.effective_date || '', render: r => r.effective_date ? fmtDate(r.effective_date) : '—' },
    { key: 'retention_years', label: '보존(년)', sortBy: r => r.retention_years, render: r => `${r.retention_years}년` },
    { key: 'classification', label: '등급', sortBy: r => r.classification, render: r => {
      const c = CLASSIFICATION_LABEL[r.classification]; return <span style={{ color: c?.color, fontWeight: 600 }}>{c?.label || r.classification}</span>
    } },
    { key: 'file_url', label: '원본', sortBy: r => r.file_url ? 1 : 0, render: r => r.file_url ? (
      <a href={r.file_url} target="_blank" rel="noopener" style={{ color: COLORS.primary, fontSize: 12 }}>📎 열기</a>
    ) : <span style={{ color: COLORS.textMuted, fontSize: 11 }}>미입력</span> },
    { key: 'status', label: '상태', sortBy: r => r.status, render: r => {
      const s = DOC_STATUS_LABEL[r.status]
      const verified = r.is_master_verified === 1
      return <span style={{ color: s?.color, fontWeight: 600 }}>{verified ? '✓ ' : ''}{s?.label || r.status}</span>
    } },
    { key: 'actions', label: '액션', render: r => (
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        {props.isMgr && !r.file_url && <button onClick={() => props.onFileUrlClick(r)} style={{ ...BTN.sm, border: 'none', background: COLORS.bgAmber, color: COLORS.warning, cursor: 'pointer' }}>📎 URL입력</button>}
        {props.isMgr && r.file_url && r.is_master_verified === 0 && !props.isCpo && <span style={{ fontSize: 11, color: COLORS.warning }}>CPO 검수 대기</span>}
        {props.isCpo && r.file_url && r.is_master_verified === 0 && <button onClick={() => props.onVerifyClick(r)} style={{ ...BTN.sm, border: 'none', background: COLORS.bgGreen, color: COLORS.success, cursor: 'pointer' }}>✓ 검수</button>}
        {props.isCpo && r.is_master_verified === 1 && <button onClick={() => props.onVerifyClick(r)} style={{ ...BTN.sm, border: 'none', background: COLORS.bgGray, color: COLORS.textSecondary, cursor: 'pointer' }}>↩ 재검수</button>}
        {props.isMgr && r.file_url && <button onClick={() => props.onFileUrlClick(r)} style={{ ...BTN.sm, border: 'none', background: COLORS.bgGray, color: COLORS.textSecondary, cursor: 'pointer' }}>✎</button>}
        {/* Phase 1.4-fix13 — 검수 리셋 (검수 완료 문서만) + 삭제 */}
        {props.isMgr && r.is_master_verified === 1 && (
          <button onClick={() => handleReset(r)} disabled={busyId === r.id}
            title="검수 상태를 pending 으로 리셋 — 재검토·승인 흐름 재실행"
            style={{ ...BTN.sm, border: 'none', background: COLORS.bgBlue, color: COLORS.primary, cursor: 'pointer' }}>🔄 리셋</button>
        )}
        {props.isMgr && (
          <button onClick={() => handleDelete(r)} disabled={busyId === r.id}
            title="문서 삭제 (버전·서식제출·GCS 함께)"
            style={{ ...BTN.sm, border: 'none', background: COLORS.bgRed, color: COLORS.danger, cursor: 'pointer' }}>🗑 삭제</button>
        )}
      </div>
    ) },
  ]
  return (
    <div style={{ ...GLASS.L3, padding: 20, borderRadius: 12 }}>
      {/* PR-RC-X — 글래스 알림 + 확인 다이얼로그 (Rule 20) */}
      <NoticeBanner notice={notice} onClose={() => setNotice(null)} />
      <GlassConfirmDialog request={confirmReq} onClose={() => setConfirmReq(null)} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <div style={{ flex: 1, padding: '10px 14px', borderRadius: 8, background: COLORS.bgBlue, fontSize: 12, color: COLORS.textSecondary, borderLeft: `4px solid ${COLORS.info}` }}>
          💡 매뉴얼·서식 카탈로그 — 관리자가 원본 등록 → CPO 검수 완료 → 활성화. 「🔄 리셋」 으로 검수 흐름 재실행, 「🗑 삭제」 / 「전체 삭제」 로 문서 제거.
        </div>
        {props.isMgr && (
          <button onClick={props.onCreate}
            style={{ ...BTN.md, border: 'none', background: COLORS.primary, color: '#fff', cursor: 'pointer', fontWeight: 600, whiteSpace: 'nowrap', flexShrink: 0 }}>
            + 신규 문서 등록
          </button>
        )}
        {/* Phase 1.4-fix15 — 체크박스 선택 삭제 (fix14 의 필터단위 일괄 삭제 대체) */}
        {props.isMgr && props.rows.length > 0 && (
          <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexShrink: 0 }}>
            <button onClick={selectAllVisible}
              title={`표시된 ${props.rows.length}건 모두 선택`}
              style={{ ...BTN.sm, border: `1px solid ${COLORS.borderSubtle}`, background: COLORS.bgGray, color: COLORS.textSecondary, cursor: 'pointer', whiteSpace: 'nowrap' }}>
              ☑ 전체 선택 ({props.rows.length})
            </button>
            <button onClick={clearSelection} disabled={selectedIds.size === 0}
              style={{ ...BTN.sm, border: `1px solid ${COLORS.borderSubtle}`, background: COLORS.bgGray, color: COLORS.textSecondary, cursor: selectedIds.size === 0 ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap', opacity: selectedIds.size === 0 ? 0.5 : 1 }}>
              ☐ 해제
            </button>
            <button onClick={handleBulkDelete} disabled={selectedIds.size === 0 || busyId === '__bulk__'}
              title={selectedIds.size === 0 ? '체크박스로 삭제할 문서를 선택하세요' : `선택한 ${selectedIds.size}건 삭제`}
              style={{ ...BTN.md, border: `1px solid ${COLORS.danger}`, background: COLORS.bgRed, color: COLORS.danger, cursor: selectedIds.size === 0 ? 'not-allowed' : 'pointer', fontWeight: 600, whiteSpace: 'nowrap', opacity: selectedIds.size === 0 ? 0.5 : 1 }}>
              🗑 선택 삭제 ({selectedIds.size})
            </button>
          </div>
        )}
      </div>
      <DcToolbar
        search={props.query}
        onSearchChange={props.setQuery}
        placeholder="제목·코드·설명 검색"
        trailing={
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <select value={props.typeFilter} onChange={e => props.setTypeFilter(e.target.value)} style={selStyle()}>
              <option value="">유형: 전체</option>
              {Object.entries(DOC_TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v.emoji} {v.label}</option>)}
            </select>
            <select value={props.statusFilter} onChange={e => props.setStatusFilter(e.target.value)} style={selStyle()}>
              <option value="">상태: 전체</option>
              {Object.entries(DOC_STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
            <select value={props.verifiedFilter} onChange={e => props.setVerifiedFilter(e.target.value)} style={selStyle()}>
              <option value="">검수: 전체</option>
              <option value="1">✓ 검수완료</option>
              <option value="0">⚠ 미검수</option>
            </select>
          </div>
        }
      />
      <div style={{ marginBottom: 8, fontSize: 12, color: COLORS.textSecondary }}>총 {props.allRows.length}건 중 {props.rows.length}건 표시</div>
      <NeuDataTable columns={cols} data={props.rows} rowKey={r => r.id} />
    </div>
  )
}

function AnnualOpsTabContent(props: {
  plan: AnnualPlan | null
  rows: ComplianceTask[]; allRows: ComplianceTask[]
  categoryFilter: string; setCategoryFilter: (v: string) => void
  statusFilter: string; setStatusFilter: (v: string) => void
  monthFilter: string; setMonthFilter: (v: string) => void
  documents: ComplianceDocument[]
  onTaskClick: (t: ComplianceTask) => void
  onSubmitForm: (doc: ComplianceDocument, task: ComplianceTask) => void
}) {
  const cols: TableColumn<ComplianceTask>[] = [
    { key: 'scheduled_month', label: '월', sortBy: r => r.scheduled_month, render: r => `${r.scheduled_month}월` },
    { key: 'task_code', label: 'task코드', sortBy: r => r.task_code, render: r => <span style={{ fontSize: 11, color: COLORS.textMuted }}>{r.task_code}</span> },
    { key: 'category', label: '구분', sortBy: r => r.category, render: r => {
      const c = TASK_CATEGORY_LABEL[r.category]; return <span style={{ color: c?.color, fontWeight: 600 }}>{c?.emoji} {c?.label || r.category}</span>
    } },
    { key: 'title', label: '제목', sortBy: r => r.title, render: r => (
      <span onClick={() => props.onTaskClick(r)} style={{ cursor: 'pointer', color: COLORS.primary }}>{r.title}</span>
    ) },
    { key: 'due_date', label: '기한', sortBy: r => r.due_date, render: r => fmtDate(r.due_date) },
    { key: 'days', label: 'D-day', sortBy: r => daysUntilDue(r.due_date), render: r => {
      if (r.status === 'done' || r.status === 'skipped') return '—'
      const days = daysUntilDue(r.due_date); const u = urgencyColor(days)
      return <span style={{ color: u.color, fontWeight: 700, fontSize: 12 }}>{u.label}</span>
    } },
    { key: 'related_form_codes', label: '관련 서식', sortBy: r => r.related_form_codes || '', render: r => {
      const codes = parseFormCodes(r.related_form_codes); if (codes.length === 0) return <span style={{ color: COLORS.textMuted }}>—</span>
      return (
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {codes.map(code => {
            const doc = props.documents.find(d => d.doc_code === code)
            const verified = doc?.is_master_verified === 1
            return (
              <button key={code} onClick={() => doc && props.onSubmitForm(doc, r)}
                disabled={!verified}
                title={verified ? `${doc?.title} 작성` : `${code} 원본 미검수 — 규정 문서 관리에서 검수 필요`}
                style={{ ...BTN.sm, border: 'none',
                  background: verified ? COLORS.bgGreen : COLORS.bgRed,
                  color: verified ? COLORS.success : COLORS.danger,
                  cursor: verified ? 'pointer' : 'not-allowed', opacity: verified ? 1 : 0.6 }}>
                {verified ? '✓' : '⚠'} {code}
              </button>
            )
          })}
        </div>
      )
    } },
    { key: 'status', label: '상태', sortBy: r => r.status, render: r => {
      const s = TASK_STATUS_LABEL[r.status]; return <span style={{ color: s?.color, fontWeight: 600 }}>{s?.label || r.status}</span>
    } },
    { key: 'assignee_user_name', label: '담당', sortBy: r => r.assignee_user_name || '', render: r => r.assignee_user_name || '—' },
    { key: 'completed_at', label: '완료', sortBy: r => r.completed_at || '', render: r => r.completed_at ? fmtDate(r.completed_at) : '—' },
  ]
  // P30-F 게이트: annual_plan 없고 task 도 0이면 「내규 확정 → 스케줄 자동 생성」 안내
  const isEmpty = !props.plan && props.allRows.length === 0
  return (
    <div style={{ ...GLASS.L3, padding: 20, borderRadius: 12 }}>
      {isEmpty && (
        <div style={{ ...GLASS.L4, padding: 24, borderRadius: 12, marginBottom: 16, borderLeft: `4px solid ${COLORS.warning}`, textAlign: 'center' }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: COLORS.textPrimary, marginBottom: 8 }}>
            연간 운영 계획이 없습니다.
          </div>
          <div style={{ fontSize: 13, color: COLORS.textSecondary, lineHeight: 1.6, marginBottom: 14 }}>
            연간 task 는 내규의 「연간 운영」 조항 기반으로 자동 생성됩니다.<br />
            먼저 「📜 내규 마스터」 탭에서 내규를 등록·검수·확정한 후,<br />
            검수 페이지의 「스케줄 자동 생성」 액션을 실행해주세요.
          </div>
          <div style={{ display: 'inline-flex', gap: 8, fontSize: 11, color: COLORS.textMuted, padding: '8px 14px', borderRadius: 8, background: 'rgba(245,158,11,0.08)' }}>
            <span>① 내규 등록</span><span>→</span>
            <span>② AI 추출·검수</span><span>→</span>
            <span>③ 확정 (active)</span><span>→</span>
            <span>④ 스케줄 자동 생성</span>
          </div>
        </div>
      )}
      {props.plan && (
        <div style={{ marginBottom: 16, padding: '14px 18px', borderRadius: 8, background: COLORS.bgBlue, borderLeft: `4px solid ${COLORS.primary}` }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: COLORS.textPrimary }}>📅 {props.plan.title}</div>
          <div style={{ fontSize: 12, color: COLORS.textSecondary, marginTop: 4 }}>
            {props.plan.plan_code} · 시행 {fmtDate(props.plan.effective_date)} · {props.plan.scope}
          </div>
          <div style={{ fontSize: 11, color: COLORS.textMuted, marginTop: 4 }}>{props.plan.legal_basis}</div>
        </div>
      )}
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginBottom: 16 }}>
        <select value={props.monthFilter} onChange={e => props.setMonthFilter(e.target.value)} style={selStyle()}>
          <option value="">월: 전체</option>
          {[1,2,3,4,5,6,7,8,9,10,11,12].map(m => <option key={m} value={m}>{m}월</option>)}
        </select>
        <select value={props.categoryFilter} onChange={e => props.setCategoryFilter(e.target.value)} style={selStyle()}>
          <option value="">구분: 전체</option>
          {Object.entries(TASK_CATEGORY_LABEL).map(([k, v]) => <option key={k} value={k}>{v.emoji} {v.label}</option>)}
        </select>
        <select value={props.statusFilter} onChange={e => props.setStatusFilter(e.target.value)} style={selStyle()}>
          <option value="">상태: 전체</option>
          {Object.entries(TASK_STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <span style={{ marginLeft: 'auto', fontSize: 12, color: COLORS.textSecondary }}>총 {props.allRows.length}건 중 {props.rows.length}건</span>
      </div>
      <NeuDataTable columns={cols} data={props.rows} rowKey={r => r.id} />
    </div>
  )
}

function SubmissionsTabContent(props: {
  rows: FormSubmission[]; allRows: FormSubmission[]
  docFilter: string; setDocFilter: (v: string) => void
  statusFilter: string; setStatusFilter: (v: string) => void
  documents: ComplianceDocument[]
  onCreate: (doc: ComplianceDocument) => void
}) {
  const cols: TableColumn<FormSubmission>[] = [
    { key: 'submission_code', label: '제출번호', sortBy: r => r.submission_code, render: r => <strong style={{ color: COLORS.primary }}>{r.submission_code}</strong> },
    { key: 'document_code', label: '서식', sortBy: r => r.document_code, render: r => <span>{r.document_code}</span> },
    { key: 'document_title', label: '서식명', sortBy: r => r.document_title || '', render: r => r.document_title || '—' },
    { key: 'title', label: '제목', sortBy: r => r.title || '', render: r => r.title || '—' },
    { key: 'task_code', label: '연계 task', sortBy: r => r.task_code || '', render: r => r.task_code ? <span style={{ fontSize: 11, color: COLORS.textMuted }}>{r.task_code}</span> : '—' },
    { key: 'submitted_by_user_name', label: '작성자', sortBy: r => r.submitted_by_user_name || '', render: r => r.submitted_by_user_name || '—' },
    { key: 'submitted_at', label: '작성일', sortBy: r => r.submitted_at, render: r => fmtDate(r.submitted_at) },
    { key: 'file_url', label: '첨부', sortBy: r => r.file_url ? 1 : 0, render: r => r.file_url ? <a href={r.file_url} target="_blank" rel="noopener" style={{ color: COLORS.primary, fontSize: 12 }}>📎</a> : '—' },
    { key: 'retention_until', label: '보존만료', sortBy: r => r.retention_until, render: r => {
      const days = daysUntilDue(r.retention_until)
      if (days < 90 && days >= 0) return <span style={{ color: COLORS.warning, fontWeight: 600 }}>⚠ {fmtDate(r.retention_until)}</span>
      if (days < 0) return <span style={{ color: COLORS.danger, fontWeight: 700 }}>만료 {Math.abs(days)}일</span>
      return fmtDate(r.retention_until)
    } },
    { key: 'review_status', label: '검토상태', sortBy: r => r.review_status, render: r => {
      const s = REVIEW_STATUS_LABEL[r.review_status]; return <span style={{ color: s?.color, fontWeight: 600 }}>{s?.label || r.review_status}</span>
    } },
  ]
  // 검수 완료 서식만 작성 가능
  const verifiedForms = props.documents.filter(d => d.doc_type === 'form' && d.is_master_verified === 1)
  return (
    <div style={{ ...GLASS.L3, padding: 20, borderRadius: 12 }}>
      <div style={{ marginBottom: 12, padding: '10px 14px', borderRadius: 8, background: COLORS.bgAmber, fontSize: 12, color: COLORS.textSecondary, borderLeft: `4px solid ${COLORS.warning}` }}>
        💡 서식 작성 인스턴스 — 매뉴얼 보존 기간 (3년) 자동 추적. 검수 완료된 서식만 작성 가능 (검수 미완료는 규정 문서 관리에서 먼저 처리).
      </div>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginBottom: 16 }}>
        <select value={props.docFilter} onChange={e => props.setDocFilter(e.target.value)} style={selStyle()}>
          <option value="">서식: 전체</option>
          {verifiedForms.map(d => <option key={d.id} value={d.doc_code}>{d.doc_code} {d.title}</option>)}
        </select>
        <select value={props.statusFilter} onChange={e => props.setStatusFilter(e.target.value)} style={selStyle()}>
          <option value="">상태: 전체</option>
          {Object.entries(REVIEW_STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <span style={{ marginLeft: 'auto', fontSize: 12, color: COLORS.textSecondary }}>총 {props.allRows.length}건 중 {props.rows.length}건</span>
      </div>
      {verifiedForms.length > 0 && (
        <div style={{ marginBottom: 16, padding: '12px 14px', borderRadius: 8, background: COLORS.bgGray, border: `1px solid ${COLORS.borderSubtle}` }}>
          <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8, color: COLORS.textSecondary }}>✓ 활성 서식 — 클릭하여 작성:</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {verifiedForms.map(d => (
              <button key={d.id} onClick={() => props.onCreate(d)}
                style={{ ...BTN.sm, border: 'none', background: COLORS.bgGreen, color: COLORS.success, cursor: 'pointer' }}>
                📝 {d.doc_code}
              </button>
            ))}
          </div>
        </div>
      )}
      <NeuDataTable columns={cols} data={props.rows} rowKey={r => r.id} />
    </div>
  )
}

// ════════════════════════════════════════════════════════════════
// 모달들 — Phase 1.1 (기존 유지)
// ════════════════════════════════════════════════════════════════
function AssetModal(props: { onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    name: '', asset_type: 'pc', classification: 'internal', location: '', os_or_spec: '',
    contains_pii: false, access_control: '', encryption_status: 'none', acquired_at: '', notes: '',
  })
  const [saving, setSaving] = useState(false); const [error, setError] = useState<string | null>(null)
  const save = async () => {
    if (!form.name.trim()) { setError('자산명을 입력하세요'); return }
    setSaving(true); setError(null)
    try {
      const token = getStoredToken()
      const res = await fetch('/api/ride-compliance/assets', { method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify(form) })
      const json = await res.json()
      if (!res.ok || !json.success) { setError(json.error || `HTTP ${res.status}`); return }
      props.onSaved()
    } catch (e) { setError(String(e)) } finally { setSaving(false) }
  }
  // P26 — 매뉴얼 명시 자산 5종 (출처 + 추론 + 확정 3단계 — P25 패턴)
  const MANUAL_ASSETS = [
    {
      btn: '🏢 본사 서버실', name: '본사 3F 서버실', asset_type: 'facility', classification: 'confidential',
      location: '본사 3F', os_or_spec: '', contains_pii: false, access_control: '출입통제 + 잠금장치', encryption_status: 'none',
      notes: '매뉴얼 제10조 — 보호구역 지정',
      source_article: '제10조',
      source_excerpt: '개인정보보호책임자는 개인정보와 개인정보처리시스템 등을 보관하는 물리적 장소를 보호구역으로 지정하고 이에 대해 출입통제 절차 수립 및 적용, 물리적 잠금장치 등 보호조치를 취하여야 한다.',
    },
    {
      btn: '🗄 고객 DB', name: '고객 개인정보 DB', asset_type: 'database', classification: 'confidential',
      location: 'GCP Cloud SQL', os_or_spec: 'MySQL 8.0', contains_pii: true, access_control: '2FA + IP 화이트리스트', encryption_status: 'full',
      notes: '매뉴얼 제13조 — 주민번호·신용카드·계좌번호 암호화',
      source_article: '제13조',
      source_excerpt: '주민등록번호, 신용카드번호, 계좌번호는 안전한 암호 알고리즘을 적용하여 저장한다. 비밀번호는 일방향 암호화하여 복호화할 수 없도록 저장한다. 전송 시 안전한 보안서버 구축 등의 조치를 통해 암호화한다.',
    },
    {
      btn: '📷 CCTV', name: '본사 출입구 CCTV', asset_type: 'cctv', classification: 'internal',
      location: '본사 1F 출입구', os_or_spec: '', contains_pii: true, access_control: 'CCTV 관리책임자만', encryption_status: 'none',
      notes: '매뉴얼 제17조 — 안내판 부착 + 보관기간 운영',
      source_article: '제17조',
      source_excerpt: 'CCTV 안내판은 촬영범위 내에서 정보주체가 인지하기 쉬운 곳에 부착하며 설치 목적·장소·촬영 범위·시간·관리책임자 성명을 포함해야 한다. 수집된 영상정보는 보유기간 만료 시 즉시 삭제하여야 한다.',
    },
    {
      btn: '💻 직원 PC', name: '직원 업무 PC', asset_type: 'pc', classification: 'internal',
      location: '본사', os_or_spec: 'Windows 11 + 백신', contains_pii: false, access_control: '비밀번호 8자+, 백신', encryption_status: 'partial',
      notes: '매뉴얼 제16조 — 보안프로그램 + 제14조 패스워드 정책',
      source_article: '제16조',
      source_excerpt: '개인정보보호책임자는 개인용 컴퓨터(PC) 등을 이용하여 개인정보를 취급하는 경우 개인정보가 분실·도난·누출·변조 또는 훼손되지 아니하도록 안전성 확보를 위해 보안패치, 공유폴더 제한 등 보호조치와 백신 프로그램 등 보안프로그램 설치 운영을 하여야 한다.',
    },
    {
      btn: '🆔 인사 DB', name: '인사 정보 DB (주민번호)', asset_type: 'database', classification: 'confidential',
      location: 'GCP Cloud SQL', os_or_spec: 'MySQL 8.0', contains_pii: true, access_control: '인사팀만 2FA', encryption_status: 'full',
      notes: '매뉴얼 제19조 — 주민등록번호 처리 제한',
      source_article: '제19조',
      source_excerpt: '개인정보처리자는 법령에서 구체적으로 주민등록번호의 처리를 요구하거나 허용한 경우 등을 제외하고는 주민등록번호를 처리할 수 없다. 처리하는 경우에도 회원 가입 단계에서는 주민등록번호를 사용하지 아니하고도 가입할 수 있는 방법을 제공하여야 한다.',
    },
  ] as const

  type ManualAsset = typeof MANUAL_ASSETS[number]
  const [selectedAsset, setSelectedAsset] = useState<ManualAsset | null>(null)
  const selectAsset = (m: ManualAsset) => {
    setSelectedAsset(m)
    setForm({
      name: m.name, asset_type: m.asset_type, classification: m.classification,
      location: m.location, os_or_spec: m.os_or_spec, contains_pii: m.contains_pii,
      access_control: m.access_control, encryption_status: m.encryption_status,
      acquired_at: form.acquired_at, notes: m.notes,
    })
  }
  const clearAsset = () => setSelectedAsset(null)

  return (
    <Modal title="📦 정보자산 등록" onClose={props.onClose}>
      <div style={{ marginBottom: 8, fontSize: 12, color: COLORS.textSecondary }}>
        📜 매뉴얼 규정 자산 5종 — 선택 후 출처·추론·확정 단계별 진행
      </div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
        {MANUAL_ASSETS.map((m) => (
          <button key={m.btn} onClick={() => selectAsset(m)}
            style={{
              ...GLASS.L2, padding: '6px 12px', borderRadius: 6, cursor: 'pointer',
              border: selectedAsset?.btn === m.btn ? `2px solid ${COLORS.primary}` : `1px solid ${COLORS.borderSubtle}`,
              fontSize: 12, color: COLORS.textPrimary, whiteSpace: 'nowrap',
            }}>{m.btn}</button>
        ))}
      </div>

      {/* P26 — 선택된 자산의 「출처 + 추론」 표시 */}
      {selectedAsset && (
        <div style={{
          ...GLASS.L3, padding: 14, borderRadius: 10, marginBottom: 14,
          borderLeft: `4px solid ${COLORS.primary}`,
        }}>
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.textSecondary, marginBottom: 6 }}>
              📜 1단계 — 매뉴얼 원본 ({selectedAsset.source_article})
            </div>
            <div style={{
              padding: 10, borderRadius: 6, background: 'rgba(0,0,0,0.03)',
              fontSize: 12, color: COLORS.textPrimary, lineHeight: 1.6, fontStyle: 'italic',
            }}>「{selectedAsset.source_excerpt}」</div>
          </div>
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.textSecondary, marginBottom: 6 }}>
              🤖 2단계 — AI 추론 액션
            </div>
            <div style={{ fontSize: 12, color: COLORS.textPrimary, lineHeight: 1.7 }}>
              · 자산명: <strong>{selectedAsset.name}</strong><br/>
              · 위치: <strong>{selectedAsset.location}</strong> {selectedAsset.os_or_spec && `· ${selectedAsset.os_or_spec}`}<br/>
              · 접근통제: <strong>{selectedAsset.access_control}</strong><br/>
              · 암호화: <strong>{selectedAsset.encryption_status === 'full' ? '전체' : selectedAsset.encryption_status === 'partial' ? '부분' : '없음'}</strong>{selectedAsset.contains_pii && <span style={{ color: COLORS.warning }}> · 개인정보 포함 (제19조 적용)</span>}<br/>
              · 비고: <span style={{ color: COLORS.textSecondary }}>{selectedAsset.notes}</span>
            </div>
          </div>
          <div style={{ fontSize: 12, color: COLORS.textMuted }}>
            ✅ 3단계 — 아래 폼에서 추가 보완 후 「등록」 클릭 시 위 데이터로 확정
            <button onClick={clearAsset}
              style={{ marginLeft: 8, fontSize: 11, padding: '2px 8px', background: 'transparent',
                border: `1px solid ${COLORS.borderSubtle}`, borderRadius: 4, cursor: 'pointer', color: COLORS.textSecondary }}>
              ✕ 직접 입력
            </button>
          </div>
        </div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <Field label="자산명 *"><input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} style={inpStyle()} /></Field>
        <Field label="유형 *"><select value={form.asset_type} onChange={e => setForm({ ...form, asset_type: e.target.value })} style={inpStyle()}>
          {Object.entries(ASSET_TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v.emoji} {v.label}</option>)}
        </select></Field>
        <Field label="등급 *"><select value={form.classification} onChange={e => setForm({ ...form, classification: e.target.value })} style={inpStyle()}>
          {Object.entries(CLASSIFICATION_LABEL).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select></Field>
        <Field label="암호화 (제13조)"><select value={form.encryption_status} onChange={e => setForm({ ...form, encryption_status: e.target.value })} style={inpStyle()}>
          <option value="none">없음</option><option value="partial">부분</option><option value="full">전체</option>
        </select></Field>
        <Field label="위치"><input value={form.location} onChange={e => setForm({ ...form, location: e.target.value })} placeholder="예: 본사 3F 서버실" style={inpStyle()} /></Field>
        <Field label="사양/OS"><input value={form.os_or_spec} onChange={e => setForm({ ...form, os_or_spec: e.target.value })} placeholder="예: Ubuntu 24.04 / 32GB" style={inpStyle()} /></Field>
        <Field label="접근통제 (제12·14조)"><input value={form.access_control} onChange={e => setForm({ ...form, access_control: e.target.value })} placeholder="예: 2FA + IP 화이트리스트" style={inpStyle()} /></Field>
        <Field label="취득일"><input type="date" value={form.acquired_at} onChange={e => setForm({ ...form, acquired_at: e.target.value })} style={inpStyle()} /></Field>
        <Field label="개인정보 포함" full><label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
          <input type="checkbox" checked={form.contains_pii} onChange={e => setForm({ ...form, contains_pii: e.target.checked })} style={{ width: 18, height: 18, accentColor: '#3b6eb5' }} />
          <span style={{ fontSize: 13 }}>이 자산은 개인정보를 포함합니다 (제19조 적용)</span>
        </label></Field>
        <Field label="비고" full><textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} rows={3} style={{ ...inpStyle(), resize: 'vertical' }} /></Field>
      </div>
      {error && <ErrorBox text={error} />}
      <ModalActions onClose={props.onClose} onSave={save} saving={saving} />
    </Modal>
  )
}

function IncidentModal(props: { assets: Asset[]; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    title: '', incident_type: 'internal_leak', severity: 'medium', occurred_at: '',
    affected_pii_items: '', affected_subjects_count: '', cause_summary: '', containment_actions: '', related_asset_id: '',
  })
  const [saving, setSaving] = useState(false); const [error, setError] = useState<string | null>(null)
  const save = async () => {
    if (!form.title.trim()) { setError('제목을 입력하세요'); return }
    setSaving(true); setError(null)
    try {
      const token = getStoredToken()
      const payload = { ...form,
        affected_subjects_count: form.affected_subjects_count ? parseInt(form.affected_subjects_count, 10) : null,
        related_asset_id: form.related_asset_id || null,
      }
      const res = await fetch('/api/ride-compliance/incidents', { method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify(payload) })
      const json = await res.json()
      if (!res.ok || !json.success) { setError(json.error || `HTTP ${res.status}`); return }
      props.onSaved()
    } catch (e) { setError(String(e)) } finally { setSaving(false) }
  }
  // P27 — 매뉴얼 명시 침해 4 유형 (출처 + 추론 + 확정 — P25 패턴)
  const MANUAL_INCIDENTS = [
    {
      btn: '👤 내부 유출', incident_type: 'internal_leak', severity: 'high',
      title: '내부 직원에 의한 개인정보 유출 의심',
      cause_summary: '내부 임직원이 업무 범위 외 개인정보를 외부 반출한 것으로 의심.',
      containment_actions: '제25조 ① 단서 — 즉시 접속 차단 + 권한 회수 + 유출 데이터 식별·삭제. 제26조 관리팀 즉시 대응.',
      source_article: '제25조 + 제26조',
      source_excerpt: '개인정보보호책임자는 개인정보가 유출되었음을 알게 되었을 때에는 서면 등의 방법으로 24시간 이내에 해당 정보주체에게 (...) 알려야 한다. 다만, 접속경로의 차단, 취약점 점검·보완, 유출된 개인정보의 삭제 등 긴급한 조치가 필요한 경우에는 그 조치를 한 후 지체 없이 정보주체에게 알릴 수 있다.',
    },
    {
      btn: '🌐 외부 해킹', incident_type: 'external_hack', severity: 'critical',
      title: '외부 해킹 시도 또는 침입 감지',
      cause_summary: '비인가 IP 의 접근 / SQL Injection / 권한 상승 시도 감지.',
      containment_actions: '제25조 ① 단서 — 접속경로 차단 + 취약점 점검·보완 + KISA 신고 검토. 제16조 보안프로그램 긴급 패치.',
      source_article: '제25조 + 제16조',
      source_excerpt: '개인정보보호책임자는 (...) 보안패치, 공유폴더 제한 등 보호조치와 백신 프로그램 등 보안프로그램 설치 운영을 하여야 한다. 유출 시 접속경로의 차단, 취약점 점검·보완 등 긴급한 조치 후 정보주체 통지.',
    },
    {
      btn: '🦠 바이러스', incident_type: 'virus', severity: 'medium',
      title: '바이러스·랜섬웨어 감염',
      cause_summary: '직원 PC 의 바이러스 감염 또는 랜섬웨어 의심 파일 실행.',
      containment_actions: '제16조 보안프로그램 즉시 실행 + 감염 PC 네트워크 격리 + 백업 복원.',
      source_article: '제16조',
      source_excerpt: '개인정보보호책임자는 개인용 컴퓨터(PC) 등을 이용하여 개인정보를 취급하는 경우 개인정보가 분실·도난·누출·변조 또는 훼손되지 아니하도록 안전성 확보를 위해 백신 프로그램 등 보안프로그램 설치 운영을 하여야 한다.',
    },
    {
      btn: '🤝 수탁사 유출', incident_type: 'vendor_leak', severity: 'high',
      title: '수탁업체 측 개인정보 유출',
      cause_summary: '제24조 수탁사가 위탁받은 개인정보를 분실·유출·오남용한 것으로 보고됨.',
      containment_actions: '제24조 ④ — 수탁자 즉시 교육 + 처리현황 점검 + 위탁 계약 위반 시 시정 요구. 정보주체 통지 절차 동시 진행.',
      source_article: '제24조 ④ + 제25조',
      source_excerpt: '업무 위탁으로 인하여 개인정보가 분실·도난·유출·변조 또는 훼손되지 아니하도록 수탁자를 교육하고, 처리 현황 점검 등 대통령령으로 정하는 바에 따라 감독하여야 한다.',
    },
  ] as const

  type ManualIncident = typeof MANUAL_INCIDENTS[number]
  const [selectedIncident, setSelectedIncident] = useState<ManualIncident | null>(null)
  const selectIncident = (m: ManualIncident) => {
    setSelectedIncident(m)
    setForm({
      ...form,
      title: m.title, incident_type: m.incident_type, severity: m.severity,
      cause_summary: m.cause_summary, containment_actions: m.containment_actions,
    })
  }
  const clearIncident = () => setSelectedIncident(null)

  return (
    <Modal title="🚨 침해사고 신고 (제27조)" onClose={props.onClose}>
      <div style={{ marginBottom: 8, fontSize: 12, color: COLORS.textSecondary }}>
        📜 매뉴얼 명시 4 유형 — 선택 후 출처·추론·확정 단계별. <strong style={{ color: COLORS.warning }}>⏰ 제25조 ① 24h 이내 통지 의무</strong>
      </div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
        {MANUAL_INCIDENTS.map((m) => (
          <button key={m.btn} onClick={() => selectIncident(m)}
            style={{
              ...GLASS.L2, padding: '6px 12px', borderRadius: 6, cursor: 'pointer',
              border: selectedIncident?.btn === m.btn ? `2px solid ${COLORS.primary}` : `1px solid ${COLORS.borderSubtle}`,
              fontSize: 12, color: COLORS.textPrimary, whiteSpace: 'nowrap',
            }}>{m.btn}</button>
        ))}
      </div>

      {/* P27 — 선택된 유형의 「출처 + 추론」 */}
      {selectedIncident && (
        <div style={{
          ...GLASS.L3, padding: 14, borderRadius: 10, marginBottom: 14,
          borderLeft: `4px solid ${COLORS.danger}`,
        }}>
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.textSecondary, marginBottom: 6 }}>
              📜 1단계 — 매뉴얼 원본 ({selectedIncident.source_article})
            </div>
            <div style={{
              padding: 10, borderRadius: 6, background: 'rgba(0,0,0,0.03)',
              fontSize: 12, color: COLORS.textPrimary, lineHeight: 1.6, fontStyle: 'italic',
            }}>「{selectedIncident.source_excerpt}」</div>
          </div>
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.textSecondary, marginBottom: 6 }}>
              🤖 2단계 — AI 추론 액션 (사고 신고 양식)
            </div>
            <div style={{ fontSize: 12, color: COLORS.textPrimary, lineHeight: 1.7 }}>
              · 제목: <strong>{selectedIncident.title}</strong><br/>
              · 유형: <strong>{INCIDENT_TYPE_LABEL[selectedIncident.incident_type as keyof typeof INCIDENT_TYPE_LABEL]?.emoji} {INCIDENT_TYPE_LABEL[selectedIncident.incident_type as keyof typeof INCIDENT_TYPE_LABEL]?.label}</strong> · 심각도: <strong>{SEVERITY_LABEL[selectedIncident.severity as keyof typeof SEVERITY_LABEL]?.label}</strong><br/>
              · 원인: <span style={{ color: COLORS.textSecondary }}>{selectedIncident.cause_summary}</span><br/>
              · 긴급조치: <span style={{ color: COLORS.textSecondary }}>{selectedIncident.containment_actions}</span>
            </div>
          </div>
          <div style={{ fontSize: 12, color: COLORS.textMuted }}>
            ✅ 3단계 — 발생시점·유출항목·피해자 수 등 추가 입력 후 「🚨 신고」 클릭
            <button onClick={clearIncident}
              style={{ marginLeft: 8, fontSize: 11, padding: '2px 8px', background: 'transparent',
                border: `1px solid ${COLORS.borderSubtle}`, borderRadius: 4, cursor: 'pointer', color: COLORS.textSecondary }}>
              ✕ 직접 입력
            </button>
          </div>
        </div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <Field label="사고 제목 *" full><input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} style={inpStyle()} /></Field>
        <Field label="유형 *"><select value={form.incident_type} onChange={e => setForm({ ...form, incident_type: e.target.value })} style={inpStyle()}>
          {Object.entries(INCIDENT_TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v.emoji} {v.label}</option>)}
        </select></Field>
        <Field label="심각도 *"><select value={form.severity} onChange={e => setForm({ ...form, severity: e.target.value })} style={inpStyle()}>
          {Object.entries(SEVERITY_LABEL).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select></Field>
        <Field label="발생 시점 (추정)"><input type="datetime-local" value={form.occurred_at} onChange={e => setForm({ ...form, occurred_at: e.target.value })} style={inpStyle()} /></Field>
        <Field label="관련 자산 (선택)"><select value={form.related_asset_id} onChange={e => setForm({ ...form, related_asset_id: e.target.value })} style={inpStyle()}>
          <option value="">(없음)</option>
          {props.assets.map(a => <option key={a.id} value={a.id}>{a.asset_code} · {a.name}</option>)}
        </select></Field>
        <Field label="유출 개인정보 항목 (제25조 ①-1)" full><textarea value={form.affected_pii_items} onChange={e => setForm({ ...form, affected_pii_items: e.target.value })} rows={2} placeholder="예: 이름, 휴대폰번호, 차량번호" style={{ ...inpStyle(), resize: 'vertical' }} /></Field>
        <Field label="영향 정보주체 수 (추정)"><input type="number" min={0} value={form.affected_subjects_count} onChange={e => setForm({ ...form, affected_subjects_count: e.target.value })} style={inpStyle()} /></Field>
        <Field label="시점과 경위 (제25조 ①-2)" full><textarea value={form.cause_summary} onChange={e => setForm({ ...form, cause_summary: e.target.value })} rows={3} style={{ ...inpStyle(), resize: 'vertical' }} /></Field>
        <Field label="긴급조치 내역 (제25조 ① 단서)" full><textarea value={form.containment_actions} onChange={e => setForm({ ...form, containment_actions: e.target.value })} rows={3} placeholder="예: 접속경로 차단·취약점 점검·유출 데이터 삭제" style={{ ...inpStyle(), resize: 'vertical' }} /></Field>
      </div>
      {error && <ErrorBox text={error} />}
      <ModalActions onClose={props.onClose} onSave={save} saving={saving} saveLabel="🚨 신고" saveStyle={btnDanger} />
    </Modal>
  )
}

function OfficerModal(props: { onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    user_id: '', role: 'manager', display_title: '', business_unit: '라이드케어',
    appointed_at: new Date().toISOString().slice(0, 10), notes: '',
  })
  const [saving, setSaving] = useState(false); const [error, setError] = useState<string | null>(null)
  const save = async () => {
    if (!form.user_id.trim()) { setError('user_id (cuid) 를 입력하세요'); return }
    setSaving(true); setError(null)
    try {
      const token = getStoredToken()
      const res = await fetch('/api/ride-compliance/officers', { method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify(form) })
      const json = await res.json()
      if (!res.ok || !json.success) { setError(json.error || `HTTP ${res.status}`); return }
      props.onSaved()
    } catch (e) { setError(String(e)) } finally { setSaving(false) }
  }
  // P25/P28 — 출처 인용 → AI 추론 → 확정 3단계 (임명장 slide 23 정보 반영)
  // 매뉴얼 시행일/임명일자/직책 모두 매뉴얼 원본에서 가이드
  const MANUAL_APPOINTED_AT = '2026-05-20'  // 임명장 명시일 + 매뉴얼 시행일
  const MANUAL_OFFICERS = [
    {
      name: '임성민 이사', role: 'cpo',
      display_title: '라이드케어 개인정보보호 책임자 (CPO)',
      notes: '매뉴얼 통합본 V1.0 제6조 + 임명장 명시 — 임명일자 2026.05.20 (개인정보보호법 제31조 + 내부관리계획 의거)',
      source_article: '제6조 + 임명장',
      source_excerpt: '회사는 다음 각 호의 어느 하나에 해당하는 지위에 있는 자 중에서 개인정보보호책임자로 임명한다. — 라이드케어 개인정보보호 책임자 (직책: 이사 / 성명: 임성민) | 임명장: "위 사람은 (...) 개인정보보호 및 정보보안 관리 업무를 전문적이고 체계적으로 수행하며 (...) 임명한다. 임명 일자: 2026년 05월 20일 / 임명 근거: 개인정보보호법 제31조 및 내부관리계획에 의거"',
    },
    {
      name: '석호민 부장', role: 'manager',
      display_title: '라이드케어 개인정보보호 담당자',
      notes: '매뉴얼 통합본 V1.0 제6조 + 임명장 명시 — 임명일자 2026.05.20',
      source_article: '제6조 + 임명장',
      source_excerpt: '제6조: 라이드케어 개인정보보호 관리자 (직책: 부장 / 성명: 석호민). | 임명장: "개인정보보호 담당자: 석 호 민 부장". 단, 필요 시 개인정보보호책임자가 개인정보보호관리자 겸임 가능.',
    },
    {
      name: '양재희 부장', role: 'manager',
      display_title: '라이드케어 정보보안 담당자',
      notes: '매뉴얼 통합본 V1.0 제6조 + 임명장 명시 — 임명일자 2026.05.20 (2023.07.10 수정: 관리자 양재희 추가)',
      source_article: '제6조 + 임명장',
      source_excerpt: '제6조: 라이드케어 개인정보보호 관리자 (직책: 부장 / 성명: 양재희). | 임명장: "정보보안 담당자: 양 재 희 부장". | 제·개정 이력 2023.07.10 — 제6조에 관리자 양재희 차장(현 부장) 추가.',
    },
  ] as const

  type ManualOfficer = typeof MANUAL_OFFICERS[number]
  const [selectedManual, setSelectedManual] = useState<ManualOfficer | null>(null)
  const selectManual = (m: ManualOfficer) => {
    setSelectedManual(m)
    setForm({ ...form, role: m.role, display_title: m.display_title, notes: m.notes, appointed_at: MANUAL_APPOINTED_AT })
  }
  const clearManual = () => setSelectedManual(null)

  return (
    <Modal title="👔 임명 등록" onClose={props.onClose}>
      <div style={{ marginBottom: 10, fontSize: 12, color: COLORS.textSecondary }}>
        📜 매뉴얼 명시 인원 (제6조) — 선택 후 출처·추론·확정 단계별 진행
      </div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
        {MANUAL_OFFICERS.map((m) => (
          <button key={m.name} onClick={() => selectManual(m)}
            style={{
              ...GLASS.L2, padding: '10px 14px', borderRadius: 8, cursor: 'pointer',
              border: selectedManual?.name === m.name ? `2px solid ${COLORS.primary}` : `1px solid ${COLORS.borderSubtle}`,
              fontSize: 12, color: COLORS.textPrimary, textAlign: 'left',
            }}>
            <div style={{ fontWeight: 700 }}>📋 {m.name}</div>
            <div style={{ fontSize: 11, color: COLORS.textMuted }}>
              {m.role === 'cpo' ? '🛡 CPO' : '👤 관리자'}
            </div>
          </button>
        ))}
      </div>

      {/* P25 — 선택된 매뉴얼 인원의 「출처 + 추론」 표시 */}
      {selectedManual && (
        <div style={{
          ...GLASS.L3, padding: 14, borderRadius: 10, marginBottom: 14,
          borderLeft: `4px solid ${COLORS.primary}`,
        }}>
          {/* 1단계 — 매뉴얼 원본 인용 */}
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.textSecondary, marginBottom: 6 }}>
              📜 1단계 — 매뉴얼 원본 ({selectedManual.source_article})
            </div>
            <div style={{
              padding: 10, borderRadius: 6, background: 'rgba(0,0,0,0.03)',
              fontSize: 12, color: COLORS.textPrimary, lineHeight: 1.6, fontStyle: 'italic',
            }}>「{selectedManual.source_excerpt}」</div>
          </div>
          {/* 2단계 — AI 추론 액션 */}
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.textSecondary, marginBottom: 6 }}>
              🤖 2단계 — AI 추론 액션
            </div>
            <div style={{ fontSize: 12, color: COLORS.textPrimary, lineHeight: 1.7 }}>
              · 역할: <strong>{selectedManual.role === 'cpo' ? '🛡 책임자 (CPO)' : '👤 관리자'}</strong><br/>
              · 직책: <strong>{selectedManual.display_title}</strong><br/>
              · 비고: <span style={{ color: COLORS.textSecondary }}>{selectedManual.notes}</span><br/>
              · <span style={{ color: COLORS.warning }}>⚠ user_id 만 추가 입력 — profiles 에서 「{selectedManual.name.split(' ')[0]}」 검색</span>
            </div>
          </div>
          {/* 3단계 — 확정 안내 */}
          <div style={{ fontSize: 12, color: COLORS.textMuted }}>
            ✅ 3단계 — 아래 user_id 입력 후 「등록」 클릭 시 위 데이터로 확정됩니다.
            <button onClick={clearManual}
              style={{ marginLeft: 8, fontSize: 11, padding: '2px 8px', background: 'transparent',
                border: `1px solid ${COLORS.borderSubtle}`, borderRadius: 4, cursor: 'pointer', color: COLORS.textSecondary }}>
              ✕ 직접 입력
            </button>
          </div>
        </div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <Field label="user_id (cuid) *" full><input value={form.user_id} onChange={e => setForm({ ...form, user_id: e.target.value })} placeholder="profiles.id (cuid — 사용자 검색은 추후)" style={inpStyle()} /></Field>
        <Field label="역할 *"><select value={form.role} onChange={e => setForm({ ...form, role: e.target.value })} style={inpStyle()}>
          {Object.entries(ROLE_LABEL).map(([k, v]) => <option key={k} value={k}>{v.emoji} {v.label}</option>)}
        </select></Field>
        <Field label="임명일 *"><input type="date" value={form.appointed_at} onChange={e => setForm({ ...form, appointed_at: e.target.value })} style={inpStyle()} /></Field>
        <Field label="직책"><input value={form.display_title} onChange={e => setForm({ ...form, display_title: e.target.value })} placeholder="예: 라이드케어 개인정보보호 책임자" style={inpStyle()} /></Field>
        <Field label="사업부"><input value={form.business_unit} onChange={e => setForm({ ...form, business_unit: e.target.value })} style={inpStyle()} /></Field>
        <Field label="비고" full><input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="예: 매뉴얼 통합본 5.17 제6조 명시" style={inpStyle()} /></Field>
      </div>
      {error && <ErrorBox text={error} />}
      <ModalActions onClose={props.onClose} onSave={save} saving={saving} />
    </Modal>
  )
}

// ════════════════════════════════════════════════════════════════
// 모달들 — Phase 1.2
// ════════════════════════════════════════════════════════════════
function DocFileUrlModal(props: { doc: ComplianceDocument; onClose: () => void; onSaved: () => void }) {
  const [fileUrl, setFileUrl] = useState(props.doc.file_url || '')
  const [saving, setSaving] = useState(false); const [error, setError] = useState<string | null>(null)
  const save = async () => {
    setSaving(true); setError(null)
    try {
      const token = getStoredToken()
      const res = await fetch('/api/ride-compliance/documents', { method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ doc_code: props.doc.doc_code, file_url: fileUrl, update_file_url_only: true }) })
      const json = await res.json()
      if (!res.ok || !json.success) { setError(json.error || `HTTP ${res.status}`); return }
      props.onSaved()
    } catch (e) { setError(String(e)) } finally { setSaving(false) }
  }
  return (
    <Modal title={`📎 원본 파일 URL — ${props.doc.doc_code}`} onClose={props.onClose}>
      <NoticeBox color={COLORS.info} text={`${props.doc.title} 의 원본 파일 URL 을 입력합니다. GCS signed URL / GDrive / Notion 등 외부 link 가능. URL 입력 후 CPO 검수 단계 진입.`} />
      <Field label="원본 파일 URL *">
        <input value={fileUrl} onChange={e => setFileUrl(e.target.value)} placeholder="https://..." style={inpStyle()} />
      </Field>
      <div style={{ marginTop: 8, fontSize: 11, color: COLORS.textMuted }}>
        Phase 1.2.0: 외부 URL paste / Phase 1.2.1 (다음 PR): GCS 자동 업로드 통합 예정
      </div>
      {error && <ErrorBox text={error} />}
      <ModalActions onClose={props.onClose} onSave={save} saving={saving} saveLabel="저장" />
    </Modal>
  )
}

// Phase 1.4-fix13 — 규정 문서 신규 등록 모달
function NewDocumentModal(props: { onClose: () => void; onSaved: () => void }) {
  const [docCode, setDocCode] = useState('')
  const [docType, setDocType] = useState<'manual' | 'form' | 'policy'>('manual')
  const [title, setTitle] = useState('')
  const [parentCode, setParentCode] = useState('')
  const [retentionYears, setRetentionYears] = useState('3')
  const [classification, setClassification] = useState('internal')
  const [description, setDescription] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const save = async () => {
    if (!docCode.trim()) { setError('문서 코드 필수'); return }
    if (!title.trim()) { setError('제목 필수'); return }
    setSaving(true); setError(null)
    try {
      const token = getStoredToken()
      const res = await fetch('/api/ride-compliance/documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({
          doc_code: docCode.trim(),
          doc_type: docType,
          title: title.trim(),
          parent_manual_code: parentCode.trim() || null,
          retention_years: parseInt(retentionYears, 10) || 3,
          classification,
          description: description.trim() || null,
        }),
      })
      const json = await res.json()
      if (!res.ok || !json.success) { setError(json.error || `HTTP ${res.status}`); return }
      props.onSaved()
    } catch (e) { setError(String(e)) } finally { setSaving(false) }
  }

  return (
    <Modal title="+ 규정 문서 신규 등록" onClose={props.onClose}>
      <NoticeBox color={COLORS.info} text="신규 문서를 등록합니다. 등록 직후 status=pending (검수 대기) — 원본 파일 등록 → CPO 검수 → 활성화 흐름을 따릅니다." />
      <Field label="문서 코드 * (예: RIDE-M07, F-M01-07, TEST-01)">
        <input value={docCode} onChange={e => setDocCode(e.target.value)} placeholder="고유 코드" style={inpStyle()} />
      </Field>
      <Field label="유형 *">
        <select value={docType} onChange={e => setDocType(e.target.value as 'manual' | 'form' | 'policy')} style={selStyle()}>
          {Object.entries(DOC_TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v.emoji} {v.label}</option>)}
        </select>
      </Field>
      <Field label="제목 *">
        <input value={title} onChange={e => setTitle(e.target.value)} placeholder="문서 제목" style={inpStyle()} />
      </Field>
      <Field label="소속 매뉴얼 코드 (서식인 경우 — 옵션)">
        <input value={parentCode} onChange={e => setParentCode(e.target.value)} placeholder="예: RIDE-M01 (없으면 비움)" style={inpStyle()} />
      </Field>
      <div style={{ display: 'flex', gap: 10 }}>
        <Field label="보존 연수">
          <input type="number" value={retentionYears} onChange={e => setRetentionYears(e.target.value)} min={1} max={30} style={inpStyle()} />
        </Field>
        <Field label="분류 등급">
          <select value={classification} onChange={e => setClassification(e.target.value)} style={selStyle()}>
            {Object.entries(CLASSIFICATION_LABEL).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </Field>
      </div>
      <Field label="설명 (옵션)">
        <textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="문서 설명"
          style={{ ...inpStyle(), height: 60, resize: 'vertical', fontFamily: 'inherit' }} />
      </Field>
      {error && <ErrorBox text={error} />}
      <ModalActions onClose={props.onClose} onSave={save} saving={saving} saveLabel="등록" />
    </Modal>
  )
}

function VerifyModal(props: { doc: ComplianceDocument; onClose: () => void; onSaved: () => void }) {
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false); const [error, setError] = useState<string | null>(null)
  const alreadyVerified = props.doc.is_master_verified === 1

  const submit = async (revoke: boolean) => {
    setSaving(true); setError(null)
    try {
      const token = getStoredToken()
      const res = await fetch(`/api/ride-compliance/documents/${props.doc.id}/verify`, { method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ verification_note: note, revoke }) })
      const json = await res.json()
      if (!res.ok || !json.success) { setError(json.error || `HTTP ${res.status}`); return }
      props.onSaved()
    } catch (e) { setError(String(e)) } finally { setSaving(false) }
  }
  return (
    <Modal title={`${alreadyVerified ? '↩ 재검수' : '✓ CPO 원본 검수'} — ${props.doc.doc_code}`} onClose={props.onClose}>
      <NoticeBox color={alreadyVerified ? COLORS.warning : COLORS.success}
        text={alreadyVerified
          ? `이미 검수 완료된 ${props.doc.title}. 재검수 시 status='pending' 으로 되돌립니다 (개정·오류 발견 시).`
          : `${props.doc.title} 원본 파일 (${props.doc.file_url || '미입력'}) 을 검수합니다. 검수 완료 시 운영 task의 related_form 으로 연결 가능.`} />
      {!alreadyVerified && !props.doc.file_url && (
        <ErrorBox text="file_url 미입력 — 관리자가 URL 등록 후 검수 가능합니다" />
      )}
      <Field label="검수 코멘트 (선택)" full>
        <textarea value={note} onChange={e => setNote(e.target.value)} rows={3} style={{ ...inpStyle(), resize: 'vertical' }} placeholder="예: 매뉴얼 통합본 5.17 본문과 일치 확인" />
      </Field>
      {error && <ErrorBox text={error} />}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
        <button onClick={props.onClose} style={btnSecondary}>취소</button>
        {alreadyVerified ? (
          <button onClick={() => submit(true)} disabled={saving} style={btnDanger}>{saving ? '처리 중...' : '↩ 재검수 (pending 으로)'}</button>
        ) : (
          <button onClick={() => submit(false)} disabled={saving || !props.doc.file_url} style={btnSuccess}>{saving ? '검수 중...' : '✓ 검수 완료'}</button>
        )}
      </div>
    </Modal>
  )
}

function TaskActionModal(props: { task: ComplianceTask; canCpoReview: boolean; canManager: boolean; onClose: () => void; onSaved: () => void }) {
  const [evidenceNotes, setEvidenceNotes] = useState(props.task.evidence_notes || '')
  const [cpoNote, setCpoNote] = useState(props.task.cpo_review_note || '')
  const [saving, setSaving] = useState(false); const [error, setError] = useState<string | null>(null)
  const cat = TASK_CATEGORY_LABEL[props.task.category]
  const formCodes = parseFormCodes(props.task.related_form_codes)
  const days = daysUntilDue(props.task.due_date)
  const u = urgencyColor(days)

  const submit = async (action: string) => {
    setSaving(true); setError(null)
    try {
      const token = getStoredToken()
      const res = await fetch(`/api/ride-compliance/tasks/${props.task.id}/complete`, { method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ action, evidence_notes: evidenceNotes, cpo_review_note: cpoNote }) })
      const json = await res.json()
      if (!res.ok || !json.success) { setError(json.error || `HTTP ${res.status}`); return }
      props.onSaved()
    } catch (e) { setError(String(e)) } finally { setSaving(false) }
  }
  return (
    <Modal title={`${cat?.emoji} ${props.task.task_code} — ${props.task.title}`} onClose={props.onClose}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
        <div style={{ padding: '10px 14px', borderRadius: 8, background: u.bg, borderLeft: `4px solid ${u.color}` }}>
          <div style={{ fontSize: 11, color: COLORS.textMuted }}>기한 · {props.task.scheduled_month}월</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: u.color }}>{fmtDate(props.task.due_date)} ({u.label})</div>
        </div>
        <div style={{ padding: '10px 14px', borderRadius: 8, background: COLORS.bgGray, border: `1px solid ${COLORS.borderSubtle}` }}>
          <div style={{ fontSize: 11, color: COLORS.textMuted }}>현재 상태</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: TASK_STATUS_LABEL[props.task.status]?.color }}>
            {TASK_STATUS_LABEL[props.task.status]?.label || props.task.status}
          </div>
        </div>
      </div>
      <div style={{ marginBottom: 12, padding: '10px 14px', borderRadius: 8, background: COLORS.bgGray, border: `1px solid ${COLORS.borderSubtle}`, fontSize: 13, color: COLORS.textSecondary, whiteSpace: 'pre-wrap' }}>
        {props.task.description || '—'}
      </div>
      {props.task.legal_reference && (
        <div style={{ marginBottom: 12, fontSize: 12, color: COLORS.textMuted }}>📜 근거: {props.task.legal_reference}</div>
      )}
      {formCodes.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: COLORS.textSecondary, marginBottom: 6 }}>📝 관련 서식:</div>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {formCodes.map(code => (
              <span key={code} style={{ ...BTN.sm, background: COLORS.bgBlue, color: COLORS.primary, border: 'none' }}>{code}</span>
            ))}
          </div>
        </div>
      )}
      <Field label="증빙 메모 (완료 시 기록)" full>
        <textarea value={evidenceNotes} onChange={e => setEvidenceNotes(e.target.value)} rows={3} placeholder="예: 1차 교육 32명 이수, F-07 32건 작성 보관" style={{ ...inpStyle(), resize: 'vertical' }} />
      </Field>
      {props.canCpoReview && (
        <Field label="CPO 검토 코멘트 (CPO 만 작성)" full>
          <textarea value={cpoNote} onChange={e => setCpoNote(e.target.value)} rows={2} placeholder="CPO 의견" style={{ ...inpStyle(), resize: 'vertical' }} />
        </Field>
      )}
      {error && <ErrorBox text={error} />}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16, flexWrap: 'wrap' }}>
        <button onClick={props.onClose} style={btnSecondary}>닫기</button>
        {props.task.status === 'pending' && <button onClick={() => submit('start')} disabled={saving} style={btnPrimary}>▶ 진행 시작</button>}
        {props.task.status !== 'done' && props.task.status !== 'skipped' && <button onClick={() => submit('complete')} disabled={saving} style={btnSuccess}>✓ 완료 처리</button>}
        {props.canCpoReview && props.task.status === 'done' && <button onClick={() => submit('cpo_review')} disabled={saving} style={btnPrimary}>👔 CPO 검토 기록</button>}
        {props.canManager && (props.task.status === 'done' || props.task.status === 'skipped') && <button onClick={() => submit('reopen')} disabled={saving} style={btnSecondary}>↩ 재오픈</button>}
        {props.canManager && props.task.status === 'pending' && <button onClick={() => submit('skip')} disabled={saving} style={btnDanger}>⊘ 건너뛰기</button>}
      </div>
    </Modal>
  )
}

function SubmitFormModal(props: { doc: ComplianceDocument; task?: ComplianceTask; onClose: () => void; onSaved: () => void }) {
  const [title, setTitle] = useState(props.task ? `${props.task.scheduled_month}월 ${props.task.title}` : '')
  const [fileUrl, setFileUrl] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false); const [error, setError] = useState<string | null>(null)
  const save = async () => {
    setSaving(true); setError(null)
    try {
      const token = getStoredToken()
      const res = await fetch('/api/ride-compliance/form-submissions', { method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({
          document_code: props.doc.doc_code,
          task_id: props.task?.id || null,
          title,
          file_url: fileUrl || null,
          notes: notes || null,
        }) })
      const json = await res.json()
      if (!res.ok || !json.success) { setError(json.error || `HTTP ${res.status}`); return }
      props.onSaved()
    } catch (e) { setError(String(e)) } finally { setSaving(false) }
  }
  return (
    <Modal title={`📝 서식 작성 — ${props.doc.doc_code} ${props.doc.title}`} onClose={props.onClose}>
      {props.doc.is_master_verified !== 1 && (
        <ErrorBox text="원본 미검수 서식 — 규정 문서 관리 탭에서 CPO 검수 완료 후 작성 가능합니다 (추가-C 통찰)" />
      )}
      <NoticeBox color={COLORS.success}
        text={`보존기간 ${props.doc.retention_years}년 자동 설정 (작성일 + ${props.doc.retention_years}년 후 보존만료). ${props.task ? `연계 task: ${props.task.task_code}` : '연계 task 없음 (수시 작성)'}.`} />
      <Field label="작성 제목 *" full>
        <input value={title} onChange={e => setTitle(e.target.value)} placeholder="예: 2026년 2월 1차 교육 이수 확인서" style={inpStyle()} />
      </Field>
      <Field label="첨부 파일 URL (선택)" full>
        <input value={fileUrl} onChange={e => setFileUrl(e.target.value)} placeholder="https://... (작성된 PDF/DOCX URL)" style={inpStyle()} />
      </Field>
      <Field label="메모 (선택)" full>
        <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} style={{ ...inpStyle(), resize: 'vertical' }} />
      </Field>
      {error && <ErrorBox text={error} />}
      <ModalActions onClose={props.onClose} onSave={save} saving={saving} saveLabel="📝 작성 완료" saveStyle={btnSuccess} disabled={props.doc.is_master_verified !== 1} />
    </Modal>
  )
}

// ════════════════════════════════════════════════════════════════
// 공용 UI 헬퍼
// ════════════════════════════════════════════════════════════════
function Modal(props: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div onClick={props.onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm animate-fade-in px-4"
    >
      <div onClick={e => e.stopPropagation()} style={{
        ...GLASS.L4, padding: 24, borderRadius: 16,
        maxWidth: 760, width: '100%', maxHeight: '92vh', overflowY: 'auto',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ margin: 0, fontSize: 17 }}>{props.title}</h2>
          <button onClick={props.onClose} style={{ marginLeft: 'auto', background: 'transparent', border: 'none', fontSize: 20, cursor: 'pointer', color: COLORS.textSecondary }}>✕</button>
        </div>
        {props.children}
      </div>
    </div>
  )
}

function Field(props: { label: string; full?: boolean; children: React.ReactNode }) {
  return (
    <div style={{ gridColumn: props.full ? '1 / -1' : 'auto', marginBottom: 12 }}>
      <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: COLORS.textSecondary, marginBottom: 4 }}>{props.label}</label>
      {props.children}
    </div>
  )
}

function NoticeBox(props: { color: string; text: string }) {
  return (
    <div style={{ marginBottom: 12, padding: '8px 12px', borderRadius: 6, background: `${props.color}15`, fontSize: 12, color: COLORS.textSecondary, borderLeft: `3px solid ${props.color}` }}>
      💡 {props.text}
    </div>
  )
}

function ErrorBox(props: { text: string }) {
  return (
    <div style={{ marginTop: 12, marginBottom: 8, padding: '8px 12px', borderRadius: 6, background: `${COLORS.danger}18`, color: COLORS.danger, fontSize: 13 }}>
      ❌ {props.text}
    </div>
  )
}

function ModalActions(props: { onClose: () => void; onSave: () => void; saving: boolean; saveLabel?: string; saveStyle?: React.CSSProperties; disabled?: boolean }) {
  return (
    <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
      <button onClick={props.onClose} style={btnSecondary}>취소</button>
      <button onClick={props.onSave} disabled={props.saving || props.disabled} style={props.saveStyle || btnPrimary}>
        {props.saving ? '저장 중...' : (props.saveLabel || '등록')}
      </button>
    </div>
  )
}

function inpStyle(): React.CSSProperties {
  return { width: '100%', padding: '8px 12px', border: `1px solid ${COLORS.borderSubtle}`, borderRadius: 6, fontSize: 13, background: 'transparent' }
}

function selStyle(): React.CSSProperties {
  return { padding: '8px 12px', border: `1px solid ${COLORS.borderSubtle}`, borderRadius: 6, fontSize: 13, background: 'transparent' }
}
