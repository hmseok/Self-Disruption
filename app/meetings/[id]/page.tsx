'use client'
import { use } from 'react'
import MeetingsLayoutV2 from '../_components/MeetingsLayoutV2'

// ═══════════════════════════════════════════════════════════════
// /meetings/[id] — V2 회의 풀페이지 (PR-V2-A)
//   · Split view: sidebar + 본문 (탭: 본문/참석자/액션/V1 legacy)
//   · 자동 저장 + 권한 + Tiptap 에디터
// ═══════════════════════════════════════════════════════════════

interface PageProps {
  params: Promise<{ id: string }>
}

export default function MeetingDetailPage({ params }: PageProps) {
  const { id } = use(params)
  return <MeetingsLayoutV2 meetingId={id} initialTab="body" />
}
