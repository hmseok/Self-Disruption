'use client'

/**
 * RideOpsPageHeader — _docs/UI-DESIGN-STANDARD.md 준수
 *
 * 디자인 표준 (기준: /finance/settlement):
 *   · Breadcrumb 그룹명 (회사명 X)
 *   · 페이지 제목 fontSize 20
 *   · 큰 헤더 박스 X — 단순 breadcrumb + 제목 + actions
 *
 * 사용:
 *   <RideOpsPageHeader
 *     breadcrumb="관리자 운영"
 *     title="라이드 차량등록"
 *     emoji="🚗"
 *     sub="자체 DB + 카페24 read 통합"
 *     actions={<button>+ 신규 등록</button>}
 *   />
 *
 * PR-6.13.b
 */

import { ReactNode } from 'react'

interface Props {
  breadcrumb: string         // 그룹명 (예: "관리자 운영")
  title: string              // 페이지 제목 (예: "라이드 차량등록")
  emoji?: string             // 제목 좌측 이모지
  sub?: string               // 부연 설명 (작게)
  actions?: ReactNode        // 우측 액션 버튼들
}

export default function RideOpsPageHeader({ breadcrumb, title, emoji, sub, actions }: Props) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'space-between',
        gap: 16,
        marginBottom: 16,
        flexWrap: 'wrap',
      }}
    >
      <div>
        {/* Breadcrumb — 표준: 그룹명 > 페이지명 (회사명 X) */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 12,
            color: '#64748b',
            marginBottom: 4,
          }}
        >
          <span>{breadcrumb}</span>
          <span>›</span>
          <span style={{ color: '#0f2440', fontWeight: 600 }}>{title}</span>
        </div>
        {/* 제목 — 표준: fontSize 20 */}
        <h1
          style={{
            fontSize: 20,
            fontWeight: 700,
            color: '#0f2440',
            margin: 0,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          {emoji && <span>{emoji}</span>} {title}
        </h1>
        {sub && (
          <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>{sub}</div>
        )}
      </div>
      {actions && <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>{actions}</div>}
    </div>
  )
}
