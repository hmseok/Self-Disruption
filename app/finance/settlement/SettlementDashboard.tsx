'use client'
import { auth } from '@/lib/auth-client'

import { useApp } from '../../context/AppContext'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import * as XLSX from 'xlsx'
import ContractsTab from './ContractsTab'
import ExecuteTab from './ExecuteTab'
import DcStatStrip, { StatItem } from '../../components/DcStatStrip'
import DcToolbar from '../../components/DcToolbar'

// Import types
import type {
  Transaction, SettlementItem, JiipContract, InvestContract, LoanContract,
  SettlementSettings, SmsRecipient, TransferRow, ClassifiedItem
} from './lib/types'

// Import utilities
import { N, nf, nfSign, categorizeAmount } from './lib/utils'
import { INCOME_GROUPS, EXPENSE_GROUPS } from './lib/types'

// Import hook
import { useSettlementData } from './hooks/useSettlementData'
import dynamic from 'next/dynamic'

const CollectionsTab = dynamic(() => import('../collections/CollectionsTab'), { ssr: false })

async function getAuthHeader(): Promise<Record<string, string>> {
  try {
    const { auth } = await import('@/lib/auth-client')
    const user = auth.currentUser
    if (!user) return {}
    const token = await user.getIdToken(false)
    return { Authorization: `Bearer ${token}` }
  } catch {
    return {}
  }
}

// ============================================
// 메인 컴포넌트
// ============================================
export default function SettlementDashboard() {
  const router = useRouter()
  const { company, role } = useApp()
  const effectiveCompanyId = company?.id

  // 상태
  const [activeTab, setActiveTab] = useState<'contracts' | 'revenue' | 'settlement' | 'pnl' | 'execute' | 'collections'>('contracts')
  const [filterDate, setFilterDate] = useState(new Date().toISOString().slice(0, 7))

  // useSettlementData hook 사용
  const {
    transactions, jiips, investors, loans, classifiedItems, carTxHistory,
    investDepositHistory, investDeposits, shareHistory, setShareHistory,
    allJiipContracts, allInvestContracts, contractsSettleTxs, allPaidShares,
    settlementItems, summary, settlementSummary, revenueBySource, expenseByGroup,
    loading, refresh
  } = useSettlementData(filterDate, effectiveCompanyId, role)

  // 정산 실행 상태
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [executing, setExecuting] = useState(false)
  const [sendingNotify, setSendingNotify] = useState(false)
  const [notifyChannel, setNotifyChannel] = useState<'sms' | 'email'>('sms')
  const [notifyStep, setNotifyStep] = useState(1) // 스텝 상태를 부모에서 관리
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null)

  // SMS 발송 확인 모달 — 수신자별 1건 통합
  const [smsModal, setSmsModal] = useState<{
    open: boolean
    recipients: SmsRecipient[]
    customNote: string    // 사용자 추가 메시지
    loading: boolean
  }>({ open: false, recipients: [], customNote: '', loading: false })

  // 이체 미리보기 상태
  const [transferPreview, setTransferPreview] = useState<TransferRow[]>([])
  const [showTransferPreview, setShowTransferPreview] = useState(false)

  // 정산 설정 (Step 1에서 설정)
  const [settlementSettings, setSettlementSettings] = useState<SettlementSettings>({
    settlementMonth: filterDate,
    paymentDate: new Date().toISOString().slice(0, 10),
    memo: '',
  })

  // filterDate 변경 시 정산월 동기화
  useEffect(() => {
    setSettlementSettings(prev => ({ ...prev, settlementMonth: filterDate }))
  }, [filterDate])

  const showToast = (msg: string, type: 'success' | 'error') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  // shareHistory가 로드되면: 정산월 자동 감지 + 이체 미리보기 빌드 (execute 탭일 때만)
  useEffect(() => {
    if (shareHistory.length > 0 && !loading) {
      // 가장 최근 발송 이력의 정산월이 현재 filterDate와 다르면 자동 전환
      const latestMonth = shareHistory[0]?.settlement_month
      if (latestMonth && latestMonth !== filterDate) {
        setFilterDate(latestMonth)
        // filterDate 변경 시 useEffect에서 refresh가 다시 호출되므로 여기서는 빌드 안 함
        return
      }
      // execute 탭일 때만 자동 빌드 (silent=true로 alert 방지)
      if (activeTab === 'execute' && transferPreview.length === 0) {
        handleBuildTransferPreview(true)
      }
    }
  }, [shareHistory, loading, activeTab])

  // ============================================
  // 정산 실행
  // ============================================
  const handleSettlementExecute = async () => {
    if (selectedIds.size === 0) return alert('정산할 항목을 선택해주세요.')
    if (!effectiveCompanyId) return alert('⚠️ 회사를 선택해주세요.')
    if (!confirm(`${selectedIds.size}건의 정산을 실행하시겠습니까?`)) return

    setExecuting(true)
    try {
      const selected = settlementItems.filter(i => selectedIds.has(i.id) && i.status === 'pending')
      const newTxs = selected.map(item => {
        const relatedType = item.type === 'jiip' ? 'jiip_share' : item.type
        const category = item.type === 'jiip' ? '지입 수익배분금(출금)'
          : item.type === 'invest' ? '투자이자'
          : item.type === 'loan' ? '대출원리금'
          : '기타'

        // 정산일 = 해당 월의 납부일 (이월분도 원래 납부일 기준)
        const txDate = item.dueDate

        return {
          transaction_date: txDate,
          type: 'expense' as const,
          status: 'completed' as const,
          category,
          client_name: item.name + (item.carNumber ? ` (${item.carNumber})` : ''),
          description: `${item.monthLabel || ''}월 ${item.detail}${item.isOverdue ? ' (이월)' : ''}`,
          amount: item.amount,
          payment_method: '통장',
          related_type: relatedType,
          related_id: String(item.relatedId),

        }
      })

      if (newTxs.length === 0) {
        alert('이미 처리된 항목이거나 처리할 항목이 없습니다.')
        setExecuting(false)
        return
      }

      const headers = await getAuthHeader()
      const res = await fetch('/api/transactions', { method: 'POST', headers, body: JSON.stringify({ transactions: newTxs }) })
      if (!res.ok) {
        const json = await res.json()
        throw new Error(json.error || '거래 등록 실패')
      }

      alert(`✅ ${newTxs.length}건 정산 완료!`)
      setSelectedIds(new Set())
      refresh()
    } catch (e: any) {
      alert('정산 실행 실패: ' + e.message)
    }
    setExecuting(false)
  }

  // ============================================
  // 다계좌이체 Excel 파일 생성 (우리은행 양식)
  // 열: 입금은행 | 계좌번호 | 이체금액 | 보내는분표시 | 받는분표시 | CMS번호
  // ============================================
  const handleDownloadBulkTransfer = async () => {
    const selected = settlementItems.filter(i => selectedIds.has(i.id) && i.status === 'pending')
    if (selected.length === 0) return alert('이체할 항목을 선택해주세요.')

    try {
      // 수신자별 은행정보 조회
      const bankMap: Record<string, { bank: string; account: string; holder: string }> = {}

      for (const item of selected) {
        const key = `${item.type}_${item.relatedId}`
        if (bankMap[key]) continue

        if (item.type === 'jiip') {
          // 지입: cars.owner_bank 우선 → jiip_contracts.bank_name fallback
          const jiip = jiips.find(j => String(j.id) === String(item.relatedId))
          const carBank = (jiip?.cars as any)?.owner_bank || ''
          const carAccount = (jiip?.cars as any)?.owner_account || ''
          const carHolder = (jiip?.cars as any)?.owner_account_holder || ''
          const jcBank = (jiip as any)?.bank_name || ''
          const jcAccount = (jiip as any)?.account_number || ''
          const jcHolder = (jiip as any)?.account_holder || ''
          bankMap[key] = {
            bank: carBank || jcBank || '',
            account: carAccount || jcAccount || '',
            holder: carHolder || jcHolder || item.name,
          }
        } else if (item.type === 'invest') {
          // 투자: investors의 은행정보
          const inv = investors.find(i => String(i.id) === String(item.relatedId))
          if (inv) {
            const headers = await getAuthHeader()
            const res = await fetch(`/api/investments/${item.relatedId}`, { headers })
            const json = await res.json()
            const invDetail = json.data ?? json ?? null
            if (invDetail) {
              bankMap[key] = {
                bank: invDetail.bank_name || '',
                account: invDetail.account_number || '',
                holder: invDetail.account_holder || item.name,
              }
            }
          }
        } else if (item.type === 'loan') {
          // 대출: 금융사 정보 (loans 테이블에 은행정보 없을 수 있음)
          const loan = loans.find(l => String(l.id) === String(item.relatedId))
          bankMap[key] = {
            bank: loan?.finance_name || '',
            account: '',
            holder: loan?.finance_name || '',
          }
        }

        if (!bankMap[key]) {
          bankMap[key] = { bank: '', account: '', holder: item.name }
        }
      }

      // 수신자별 합산 (같은 사람에게 여러 건이면 합산)
      const recipientMap: Record<string, { bank: string; account: string; holder: string; amount: number; memo: string; senderLabel: string }> = {}
      selected.forEach(item => {
        const bankKey = `${item.type}_${item.relatedId}`
        const bi = bankMap[bankKey] || { bank: '', account: '', holder: item.name }
        const recipKey = `${bi.bank}_${bi.account}`

        if (!recipientMap[recipKey]) {
          recipientMap[recipKey] = {
            bank: bi.bank,
            account: bi.account,
            holder: bi.holder,
            amount: 0,
            memo: '',
            senderLabel: '',
          }
        }
        recipientMap[recipKey].amount += item.amount
        // 메모에 항목 정보 추가
        const monthNum = item.monthLabel?.slice(5) || ''
        const typeLabel = item.type === 'jiip' ? '수익배분' : item.type === 'invest' ? '투자이자' : '대출상환'
        const itemMemo = `${monthNum}월 ${typeLabel}`
        if (recipientMap[recipKey].memo) recipientMap[recipKey].memo += '/'
        recipientMap[recipKey].memo += itemMemo
        // 보내는분 통장표시: "2월정산 에프엠아이" (정산설정월 기준, 구분 없이)
        if (!recipientMap[recipKey].senderLabel) {
          const companyShort = (company?.name || '정산').replace('주식회사', '').replace('(주)', '').trim()
          const settMonth = parseInt(settlementSettings.settlementMonth.slice(5), 10) || parseInt(monthNum, 10) || 0
          recipientMap[recipKey].senderLabel = `${settMonth}월정산 ${companyShort}`.slice(0, 14)
        }
      })

      const companyName = company?.name || '정산'
      const rows = Object.values(recipientMap).filter(r => r.amount > 0)

      if (rows.length === 0) return alert('이체 가능한 항목이 없습니다.')

      // 은행정보 누락 체크
      const missingBank = rows.filter(r => !r.bank || !r.account)
      if (missingBank.length > 0) {
        const names = missingBank.map(r => r.holder).join(', ')
        if (!confirm(`⚠️ ${names}의 은행정보가 누락되어 있습니다.\n계속 진행하시겠습니까? (누락 항목은 빈칸으로 생성됩니다)`)) return
      }

      // 우리은행 다계좌이체 양식 (.xls)
      // 헤더 없이 데이터만, 각 열: 입금은행 | 계좌번호 | 이체금액 | 보내는분표시 | 받는분표시 | CMS번호
      const wsData: (string | number)[][] = rows.map(r => {
        const bankShort = r.bank.replace('은행', '').replace('뱅크', '')
        return [
          bankShort,           // 1열: 입금은행
          r.account,           // 2열: 계좌번호 (원본 유지)
          r.amount,            // 3열: 이체금액
          r.senderLabel || companyName,  // 4열: 보내는분 통장표시 (월+구분+회사명)
          r.holder,            // 5열: 받는분 통장표시 (예금주명)
          '',                  // 6열: CMS번호
        ]
      })

      const ws = XLSX.utils.aoa_to_sheet(wsData)
      // 열 너비 설정
      ws['!cols'] = [
        { wch: 10 }, // 은행
        { wch: 20 }, // 계좌번호
        { wch: 15 }, // 금액
        { wch: 15 }, // 보내는분
        { wch: 15 }, // 받는분
        { wch: 15 }, // CMS
      ]
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Sheet1')
      XLSX.writeFile(wb, `다계좌이체_${filterDate}_${new Date().toISOString().slice(0, 10)}.xls`, { bookType: 'biff8' })

      showToast(`✅ ${rows.length}건 다계좌이체 파일 다운로드 완료`, 'success')
    } catch (e: any) {
      alert('다계좌이체 파일 생성 실패: ' + e.message)
    }
  }

  // ============================================
  // 이체 미리보기 빌드 (발송 이력 기준)
  // ============================================
  const handleBuildTransferPreview = async (silent = false) => {
    // 미지급 share history 기준으로 이체 목록 생성
    const unpaidShares = shareHistory.filter(s => !s.paid_at)
    if (unpaidShares.length === 0) {
      if (!silent) alert('이체 대기 중인 항목이 없습니다.\n정산서를 먼저 발송해주세요.')
      return
    }

    try {
      // 미지급 share의 수신자 이름으로 매칭되는 settlement items 찾기
      const matchedItems = settlementItems.filter(item => {
        return unpaidShares.some(sh =>
          sh.recipient_name === item.name &&
          (item.type === 'jiip' || item.type === 'invest')
        )
      })

      if (matchedItems.length === 0) {
        if (!silent) alert('매칭되는 정산 항목이 없습니다.')
        return
      }

      // 은행정보 조회 (handleDownloadBulkTransfer와 동일 로직)
      const bankMap: Record<string, { bank: string; account: string; holder: string }> = {}
      for (const item of matchedItems) {
        const key = `${item.type}_${item.relatedId}`
        if (bankMap[key]) continue

        if (item.type === 'jiip') {
          const jiip = jiips.find(j => String(j.id) === String(item.relatedId))
          const carBank = (jiip?.cars as any)?.owner_bank || ''
          const carAccount = (jiip?.cars as any)?.owner_account || ''
          const carHolder = (jiip?.cars as any)?.owner_account_holder || ''
          const jcBank = (jiip as any)?.bank_name || ''
          const jcAccount = (jiip as any)?.account_number || ''
          const jcHolder = (jiip as any)?.account_holder || ''
          bankMap[key] = {
            bank: carBank || jcBank || '',
            account: carAccount || jcAccount || '',
            holder: carHolder || jcHolder || item.name,
          }
        } else if (item.type === 'invest') {
          const inv = investors.find(i => String(i.id) === String(item.relatedId))
          if (inv) {
            const headers = await getAuthHeader()
            const res = await fetch(`/api/investments/${item.relatedId}`, { headers })
            const json = await res.json()
            const invDetail = json.data ?? json ?? null
            if (invDetail) {
              bankMap[key] = {
                bank: invDetail.bank_name || '',
                account: invDetail.account_number || '',
                holder: invDetail.account_holder || item.name,
              }
            }
          }
        }

        if (!bankMap[key]) {
          bankMap[key] = { bank: '', account: '', holder: item.name }
        }
      }

      // 수신자별 합산
      const recipientMap: Record<string, { bank: string; account: string; holder: string; amount: number; memo: string; senderLabel: string; type: string; name: string }> = {}
      matchedItems.forEach(item => {
        const bankKey = `${item.type}_${item.relatedId}`
        const bi = bankMap[bankKey] || { bank: '', account: '', holder: item.name }
        const recipKey = `${bi.bank}_${bi.account}`

        if (!recipientMap[recipKey]) {
          recipientMap[recipKey] = {
            bank: bi.bank,
            account: bi.account,
            holder: bi.holder,
            amount: 0,
            memo: '',
            senderLabel: '',
            type: item.type,
            name: item.name,
          }
        }
        recipientMap[recipKey].amount += item.amount
        const monthNum = item.monthLabel?.slice(5) || ''
        const typeLabel = item.type === 'jiip' ? '수익배분' : item.type === 'invest' ? '투자이자' : '대출상환'
        const itemMemo = `${monthNum}월 ${typeLabel}`
        if (recipientMap[recipKey].memo) recipientMap[recipKey].memo += '/'
        recipientMap[recipKey].memo += itemMemo
      })

      const preview = Object.values(recipientMap).filter(r => r.amount > 0) as TransferRow[]
      setTransferPreview(preview)
      setShowTransferPreview(true)

      if (!silent) showToast(`✅ 이체 대기 ${preview.length}건 로드됨`, 'success')
    } catch (e: any) {
      if (!silent) alert('미리보기 빌드 실패: ' + e.message)
    }
  }

  // ============================================
  // 미리보기에서 다운로드
  // ============================================
  const handleDownloadFromPreview = async () => {
    if (transferPreview.length === 0) return alert('다운로드할 항목이 없습니다.')

    try {
      const companyName = company?.name || '정산'
      const wsData: (string | number)[][] = transferPreview.map(r => {
        const bankShort = r.bank.replace('은행', '').replace('뱅크', '')
        return [
          bankShort,
          r.account,
          r.amount,
          r.senderLabel || companyName,
          r.holder,
          '',
        ]
      })

      const ws = XLSX.utils.aoa_to_sheet(wsData)
      ws['!cols'] = [
        { wch: 10 }, { wch: 20 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 15 },
      ]
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Sheet1')
      XLSX.writeFile(wb, `이체미리보기_${filterDate}_${new Date().toISOString().slice(0, 10)}.xls`, { bookType: 'biff8' })

      showToast('✅ 파일 다운로드 완료', 'success')
    } catch (e: any) {
      alert('다운로드 실패: ' + e.message)
    }
  }

  // ============================================
  // 정산 취소
  // ============================================
  const handleCancelSettlement = async (ids: string[]) => {
    if (!confirm(`${ids.length}건의 정산을 취소하시겠습니까?\n이미 지급된 거래도 함께 삭제됩니다.`)) return

    try {
      const headers = await getAuthHeader()
      const res = await fetch('/api/settlement/cancel', {
        method: 'POST',
        headers,
        body: JSON.stringify({ transactionIds: ids })
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || '취소 실패')
      }
      alert(`✅ ${ids.length}건 정산 취소 완료!`)
      refresh()
    } catch (e: any) {
      alert('정산 취소 실패: ' + e.message)
    }
  }

  // ============================================
  // 정산서 메시지 생성
  // ============================================
  const buildRecipientMessage = (
    recipientName: string,
    items: SmsRecipient['items'],
    shareUrl?: string,
    customNote?: string
  ): string => {
    const lines: string[] = []
    lines.push(`[${company?.name || '에프엠아이'}]`)
    lines.push(`${recipientName}님 안녕하세요.`)
    lines.push('')

    // 항목별 금액 요약
    const totalAmount = items.reduce((s, i) => s + i.amount, 0)
    items.forEach(item => {
      const amountStr = nf(item.amount)
      lines.push(`• ${item.monthLabel} ${item.type === 'jiip' ? '수익배분' : '투자이자'}: ${amountStr}원`)
    })

    lines.push('')
    lines.push(`총액: ${nf(totalAmount)}원`)
    lines.push('')

    if (shareUrl) {
      lines.push(`📄 상세내역: ${shareUrl}`)
      lines.push('')
    }

    if (customNote) {
      lines.push(customNote)
      lines.push('')
    }

    lines.push('정산관리 문의: 문의처')
    return lines.join('\n')
  }

  // ============================================
  // SMS/이메일 발송
  // ============================================
  const handleSendNotify = async (itemsToSend?: SettlementItem[]) => {
    const items = itemsToSend || []
    if (items.length === 0) return alert('발송할 항목을 선택해주세요.')

    setSmsModal(prev => ({ ...prev, loading: true }))

    try {
      // 수신자별로 그룹핑
      const recipientMap: Record<string, SmsRecipient> = {}

      for (const item of items) {
        const key = item.relatedId
        let contactInfo: { phone?: string; email?: string; bank?: any } = {}

        // 연락처 조회
        if (item.type === 'jiip') {
          const jiip = jiips.find(j => String(j.id) === String(item.relatedId))
          contactInfo = {
            phone: jiip?.investor_phone,
            email: jiip?.investor_email,
            bank: {
              bank_name: (jiip?.cars as any)?.owner_bank || jiip?.bank_name || '',
              account_number: (jiip?.cars as any)?.owner_account || jiip?.account_number || '',
              account_holder: (jiip?.cars as any)?.owner_account_holder || jiip?.account_holder || item.name,
            }
          }
        } else if (item.type === 'invest') {
          const inv = investors.find(i => String(i.id) === String(item.relatedId))
          contactInfo = {
            phone: inv?.investor_phone,
            email: inv?.investor_email,
            bank: {
              bank_name: inv?.bank_name || '',
              account_number: inv?.account_number || '',
              account_holder: inv?.account_holder || item.name,
            }
          }
        }

        if (!recipientMap[key]) {
          recipientMap[key] = {
            key,
            name: item.name,
            phone: contactInfo.phone || '',
            email: contactInfo.email || '',
            totalAmount: 0,
            items: [],
            message: '',
            bankInfo: contactInfo.bank,
          }
        }

        recipientMap[key].items.push({
          type: item.type as 'jiip' | 'invest',
          monthLabel: item.monthLabel || '',
          amount: item.amount,
          detail: item.detail,
          relatedId: item.relatedId,
          dueDate: item.dueDate,
          carNumber: item.carNumber,
          carModel: item.carModel,
          carId: item.carId,
          breakdown: item.breakdown,
        })
        recipientMap[key].totalAmount += item.amount
      }

      // 메시지 생성
      const recipients = Object.values(recipientMap).map(r => ({
        ...r,
        message: buildRecipientMessage(r.name, r.items, undefined, smsModal.customNote),
      }))

      setSmsModal(prev => ({ ...prev, recipients, loading: false, open: true }))
    } catch (e: any) {
      alert('연락처 조회 실패: ' + e.message)
      setSmsModal(prev => ({ ...prev, loading: false }))
    }
  }

  // ============================================
  // 발송 확정
  // ============================================
  const handleConfirmSend = async () => {
    if (smsModal.recipients.length === 0) return alert('발송할 수신자가 없습니다.')

    const missingContact = smsModal.recipients.filter(r => {
      const contact = notifyChannel === 'sms' ? r.phone : r.email
      return !contact
    })

    if (missingContact.length > 0) {
      const names = missingContact.map(r => r.name).join(', ')
      if (!confirm(`⚠️ ${names}의 ${notifyChannel === 'sms' ? '전화번호' : '이메일'}이 없습니다.\n계속 진행하시겠습니까?`)) return
    }

    setSmsModal(prev => ({ ...prev, loading: true }))

    try {
      const headers = await getAuthHeader()
      const res = await fetch('/api/settlement/notify', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          recipients: smsModal.recipients,
          channel: notifyChannel,
          customNote: smsModal.customNote,
        })
      })

      if (res.ok) {
        const result = await res.json()
        alert(`✅ ${smsModal.recipients.length}명에게 발송 완료!`)
        setSmsModal({ open: false, recipients: [], customNote: '', loading: false })
        refresh()

        // 지급완료 알림 발송
        const now = new Date()
        shareHistory.forEach(share => {
          if (!share.paid_at && smsModal.recipients.some(r => r.name === share.recipient_name)) {
            const companyName = company?.name || ''
            let paidMsg = `[정산 지급 확인]\n${share.recipient_name}님께서 수령하신 ${share.total_amount.toLocaleString()}원이 지급되었습니다.\n\n지급일: ${now.toLocaleDateString('ko-KR')}`
            if (companyName) paidMsg += `\n회사: ${companyName}`
            if (company?.business_number) paidMsg += ` (${company.business_number})`

            fetch('/api/settlement/notify', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${headers.Authorization?.slice(7) || ''}` },
              body: JSON.stringify({
                recipients: [{ name: share.recipient_name, phone: share.recipient_phone, message: paidMsg, totalAmount: share.total_amount, items: [] }],
                channel: 'sms',

              }),
            }).catch(() => {})
          }
        })
      } else {
        const err = await res.json()
        showToast(err.error || '발송 실패', 'error')
      }
    } catch (e: any) {
      showToast(`오류: ${e.message}`, 'error')
    } finally {
      setSmsModal(prev => ({ ...prev, loading: false }))
    }
  }

  // ============================================
  // 지급 완료 토글
  // ============================================
  const handleTogglePaid = async (shareId: string) => {
    try {
      const headers = await getAuthHeader()
      const res = await fetch(`/api/settlement/shares/${shareId}/paid`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({})
      })
      if (res.ok) {
        // 로컬 상태 즉시 업데이트
        setShareHistory(prev => prev.map(s =>
          s.id === shareId
            ? { ...s, paid_at: s.paid_at ? null : new Date().toISOString() }
            : s
        ))
        showToast('✅ 상태 업데이트 완료', 'success')
      } else {
        const err = await res.json()
        showToast(err.error || '업데이트 실패', 'error')
      }
    } catch (e: any) {
      showToast(`오류: ${e.message}`, 'error')
    }
  }

  // ============================================
  // 일괄 지급 완료
  // ============================================
  const handleBulkPaid = async (shareIds: string[]) => {
    if (shareIds.length === 0) return alert('항목을 선택해주세요.')
    if (!confirm(`${shareIds.length}건을 지급완료로 표시하시겠습니까?`)) return

    try {
      const headers = await getAuthHeader()
      const res = await fetch('/api/settlement/shares/bulk-paid', {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ ids: shareIds })
      })
      if (res.ok) {
        setShareHistory(prev => prev.map(s =>
          shareIds.includes(s.id)
            ? { ...s, paid_at: s.paid_at ? null : new Date().toISOString() }
            : s
        ))
        showToast(`✅ ${shareIds.length}건 업데이트 완료`, 'success')
      } else {
        const err = await res.json()
        showToast(err.error || '업데이트 실패', 'error')
      }
    } catch (e: any) {
      showToast(`오류: ${e.message}`, 'error')
    }
  }

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleSelectAll = () => {
    const pending = settlementItems.filter(i => i.status === 'pending')
    if (selectedIds.size === pending.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(pending.map(i => i.id)))
    }
  }

  // ============================================
  // 탭별 그룹 카운트 뱃지
  // ============================================
  const pendingBadge = settlementSummary.pendingCount > 0
    ? <span className="ml-1.5 bg-red-500/50 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">{settlementSummary.pendingCount}</span>
    : null

  // ============================================
  // 렌더링
  // ============================================
  if (!company) {
    return (
      <div className="page-bg">
        <div className="p-12 md:p-20 text-center text-slate-500 text-sm bg-white rounded-2xl">
          <span className="text-4xl block mb-3">🏢</span>
          <p className="font-bold text-slate-600">좌측 상단에서 회사를 먼저 선택해주세요</p>
        </div>
      </div>
    )
  }

  if (!effectiveCompanyId && !loading) {
    return (
      <div className="page-bg">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', marginBottom: '1.5rem' }}>
          <div style={{ textAlign: 'left' }}>
            <h1 style={{ fontSize: 24, fontWeight: 900, color: '#1e293b', letterSpacing: '-0.025em', margin: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
              <svg style={{ width: 28, height: 28, color: '#2563eb' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>
              매출 회계 정산
            </h1>
            <p className="text-slate-400 text-sm mt-1">매출 분석, 정산 현황, 손익계산서를 한눈에 관리합니다.</p>
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-black/[0.06] shadow-sm text-center py-20">
          <p className="text-4xl mb-3">🏢</p>
          <p className="font-semibold text-sm text-slate-400">좌측 상단에서 회사를 먼저 선택해주세요</p>
          <p className="text-xs text-slate-500 mt-1">회사 선택 후 매출 정산을 이용할 수 있습니다</p>
        </div>
      </div>
    )
  }

  return (
    <div className="page-bg">
      <div className="max-w-[1400px] mx-auto py-4 px-4 md:py-5 md:px-6">

      {/* ═══ 통합 KPI 카드 ═══ */}
      <DcStatStrip
        stats={[
          {
            label: '총 매출',
            value: N(summary.income).toLocaleString(),
            unit: '원',
          },
          {
            label: '총 지출',
            value: N(summary.expense).toLocaleString(),
            unit: '원',
          },
          {
            label: '영업이익',
            value: N(summary.profit).toLocaleString(),
            unit: '원',
          },
          {
            label: '미정산',
            value: settlementSummary.pendingCount,
            unit: '건',
          },
          {
            label: '미정산액',
            value: N(settlementSummary.pendingAmount).toLocaleString(),
            unit: '원',
          },
        ] as StatItem[]}
        fullWidth
      />

      {/* ═══ Toolbar with tabs ═══ */}
      <DcToolbar
        search=""
        onSearchChange={() => {}}
        placeholder=""
        filters={[
          { key: 'contracts', label: '📋 계약 현황' },
          { key: 'revenue', label: '📈 매출 분석' },
          { key: 'settlement', label: '💳 지급 관리', count: settlementSummary.pendingCount > 0 ? settlementSummary.pendingCount : undefined },
          { key: 'pnl', label: '📊 손익계산서' },
          { key: 'execute', label: '⚡ 정산 실행', count: settlementSummary.pendingCount > 0 ? settlementSummary.pendingCount : undefined },
          { key: 'collections', label: '💰 수금/회수' },
        ]}
        activeFilter={activeTab}
        onFilterChange={(key) => setActiveTab(key as any)}
        trailing={
          <div style={{ display: 'flex', gap: 6, flexShrink: 0, marginLeft: 'auto', alignItems: 'center' }}>
            <input type="month" value={filterDate} onChange={e => setFilterDate(e.target.value)}
              style={{ padding: '5px 10px', fontSize: 12, fontWeight: 700, borderRadius: 8, border: '1px solid rgba(0,0,0,0.06)', background: 'rgba(255,255,255,0.6)', color: '#334155', cursor: 'pointer' }} />
            <button onClick={() => router.push('/finance')}
              style={{ padding: '5px 12px', fontSize: 11, fontWeight: 600, borderRadius: 8, border: '1px solid rgba(0,0,0,0.06)', background: 'rgba(255,255,255,0.6)', color: '#334155', cursor: 'pointer', whiteSpace: 'nowrap' }}>
              📚 장부
            </button>
            <button onClick={() => router.push('/finance/upload')}
              style={{ padding: '5px 12px', fontSize: 11, fontWeight: 700, borderRadius: 8, border: 'none', background: 'linear-gradient(135deg, #3b6eb5, #5a8fd4)', color: '#fff', cursor: 'pointer', whiteSpace: 'nowrap' }}>
              📂 엑셀
            </button>
          </div>
        }
      />

      {/* ═══ 탭 콘텐츠 ═══ */}
      <div style={{ background: 'rgba(255,255,255,0.72)', borderRadius: 16, border: '1px solid rgba(0,0,0,0.05)', boxShadow: '6px 6px 16px rgba(140,170,210,0.12), -4px -4px 12px rgba(255,255,255,0.5)' }}>
        {loading ? (
          <div style={{ padding: 80, textAlign: 'center', color: '#94a3b8', fontWeight: 700 }}>데이터를 불러오는 중...</div>
        ) : (
          <>
            {activeTab === 'contracts' && <ContractsTab jiipList={allJiipContracts} investList={allInvestContracts} settleTxs={contractsSettleTxs} shareHistory={allPaidShares} loading={loading} />}
            {activeTab === 'revenue' && <RevenueTab revenueBySource={revenueBySource} totalIncome={summary.income} transactions={transactions} />}
            {activeTab === 'settlement' && <SettlementTab items={settlementItems} summary={settlementSummary} carTxHistory={carTxHistory} investDepositHistory={investDepositHistory} />}
            {activeTab === 'pnl' && <PnLTab revenueBySource={revenueBySource} expenseByGroup={expenseByGroup} summary={summary} filterDate={filterDate} />}
            {activeTab === 'execute' && (
              <ExecuteTab
                items={settlementItems}
                selectedIds={selectedIds}
                toggleSelect={toggleSelect}
                toggleSelectAll={toggleSelectAll}
                onSendNotify={handleSendNotify}
                sendingNotify={sendingNotify}
                notifyChannel={notifyChannel}
                setNotifyChannel={setNotifyChannel}
                shareHistory={shareHistory}
                onTogglePaid={handleTogglePaid}
                onCancelSettlement={handleCancelSettlement}
                onDownloadBulkTransfer={handleDownloadBulkTransfer}
                transferPreview={transferPreview}
                showTransferPreview={showTransferPreview}
                onBuildTransferPreview={handleBuildTransferPreview}
                onDownloadFromPreview={handleDownloadFromPreview}
                onCloseTransferPreview={() => { setShowTransferPreview(false); setTransferPreview([]) }}
                settlementSettings={settlementSettings}
                setSettlementSettings={setSettlementSettings}
                onSendIndividual={(item: SettlementItem) => handleSendNotify([item])}
                companyName={company?.name || '정산'}
                onBulkPaid={handleBulkPaid}
              />
            )}
            {activeTab === 'collections' && <CollectionsTab />}
          </>
        )}
      </div>

      {/* ═══ SMS 발송 확인 모달 ═══ */}
      {smsModal.open && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 100,
          background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 16,
        }}>
          <div style={{
            background: '#fff', borderRadius: 16, width: '100%', maxWidth: 680,
            maxHeight: '85vh', display: 'flex', flexDirection: 'column',
            boxShadow: '0 25px 50px rgba(0,0,0,0.25)', border: '1px solid rgba(0,0,0,0.06)',
          }}>
            {/* 모달 헤더 */}
            <div style={{
              padding: '16px 24px', borderBottom: '1px solid rgba(0,0,0,0.06)',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 900, color: '#1e293b' }}>
                  {notifyChannel === 'sms' ? '📱 SMS' : '📧 이메일'} 발송 확인
                </h3>
                <p style={{ margin: '4px 0 0', fontSize: 12, color: '#94a3b8' }}>
                  발송 전 수신자 정보와 메시지 내용을 확인하세요.
                </p>
              </div>
              <button
                onClick={() => setSmsModal(prev => ({ ...prev, open: false }))}
                style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#64748b', padding: 4 }}
              >
                ✕
              </button>
            </div>

            {smsModal.loading ? (
              <div style={{ padding: 60, textAlign: 'center', color: '#94a3b8' }}>
                <div style={{ fontSize: 28, marginBottom: 12 }}>⏳</div>
                <p style={{ fontWeight: 700 }}>연락처 조회 중...</p>
              </div>
            ) : (
              <>
                {/* 추가 메시지 & 안내 */}
                <div style={{ padding: '14px 24px', borderBottom: '1px solid rgba(0,0,0,0.06)', background: 'rgba(0,0,0,0.02)' }}>
                  <label style={{ fontSize: 12, fontWeight: 800, color: '#334155', display: 'block', marginBottom: 6 }}>
                    추가 메시지 <span style={{ fontWeight: 500, color: '#94a3b8' }}>(선택사항 — 모든 수신자에게 공통 표시)</span>
                  </label>
                  <textarea
                    value={smsModal.customNote}
                    onChange={e => setSmsModal(prev => ({ ...prev, customNote: e.target.value }))}
                    placeholder="계좌 안내, 문의처, 공지사항 등을 자유롭게 입력하세요..."
                    rows={2}
                    style={{
                      width: '100%', padding: '8px 12px', border: '1px solid rgba(0,0,0,0.08)',
                      borderRadius: 8, fontSize: 13, lineHeight: 1.5, resize: 'vertical',
                      fontFamily: 'inherit', outline: 'none', color: '#1e293b', background: 'rgba(0,0,0,0.04)',
                    }}
                  />
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
                    <span style={{ fontSize: 11, color: '#94a3b8' }}>
                      발송 시 상세 정산 내역 링크가 자동 포함됩니다.
                    </span>
                    {smsModal.customNote && (
                      <button
                        onClick={() => {
                          // 추가 메시지를 모든 수신자 메시지에 반영
                          setSmsModal(prev => ({
                            ...prev,
                            recipients: prev.recipients.map(r => ({
                              ...r,
                              message: buildRecipientMessage(r.name, r.items, r.shareUrl, smsModal.customNote),
                            })),
                          }))
                        }}
                        style={{
                          padding: '3px 10px', borderRadius: 4, fontSize: 11, fontWeight: 700,
                          cursor: 'pointer', background: '#60a5fa', color: '#fff', border: 'none',
                        }}
                      >
                        메시지 미리보기 갱신
                      </button>
                    )}
                  </div>
                </div>

                {/* 수신자 목록 */}
                <div style={{ flex: 1, overflow: 'auto' }}>
                  <div style={{ padding: '8px 24px', background: 'rgba(0,0,0,0.02)', borderBottom: '1px solid rgba(0,0,0,0.04)', display: 'flex', gap: 8, alignItems: 'center' }}>
                    <span style={{ fontSize: 12, fontWeight: 800, color: '#334155' }}>
                      수신자 {smsModal.recipients.length}명
                    </span>
                    <span style={{ width: 1, height: 14, background: 'rgba(0,0,0,0.1)' }} />
                    <span style={{ fontSize: 12, color: '#64748b' }}>
                      총 항목 {smsModal.recipients.reduce((s, r) => s + r.items.length, 0)}건
                    </span>
                    <span style={{ width: 1, height: 14, background: 'rgba(0,0,0,0.1)' }} />
                    {smsModal.recipients.filter(r => notifyChannel === 'sms' ? !r.phone : !r.email).length > 0 && (
                      <span style={{ fontSize: 11, color: '#f87171', fontWeight: 700 }}>
                        연락처 미등록 {smsModal.recipients.filter(r => notifyChannel === 'sms' ? !r.phone : !r.email).length}명
                      </span>
                    )}
                  </div>

                  {smsModal.recipients.map((r, idx) => {
                    const contact = notifyChannel === 'sms' ? r.phone : r.email
                    const hasContact = !!contact
                    const typeSet = [...new Set(r.items.map(i => i.type))]
                    return (
                      <div
                        key={r.key}
                        style={{
                          padding: '16px 24px', borderBottom: '1px solid rgba(0,0,0,0.04)',
                          background: hasContact ? '#f8fafc' : 'rgba(248, 113, 113, 0.08)',
                          opacity: hasContact ? 1 : 0.8,
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
                          <div style={{ flex: 1 }}>
                            <p style={{ margin: '0 0 6px', fontSize: 13, fontWeight: 900, color: '#1e293b' }}>{r.name}</p>
                            <p style={{ margin: 0, fontSize: 12, color: '#64748b' }}>
                              {notifyChannel === 'sms' ? (
                                <>📞 {contact || '(미등록)'}</>
                              ) : (
                                <>📧 {contact || '(미등록)'}</>
                              )}
                            </p>
                            <p style={{ margin: '4px 0 0', fontSize: 11, color: '#94a3b8' }}>
                              {typeSet.join(', ')} × {r.items.length}건
                            </p>
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            <p style={{ margin: 0, fontSize: 14, fontWeight: 900, color: '#2563eb' }}>{nf(r.totalAmount)}</p>
                            <p style={{ margin: '2px 0 0', fontSize: 11, color: '#94a3b8' }}>원</p>
                          </div>
                        </div>
                        <div style={{ marginTop: 10, padding: '8px 12px', background: '#f1f5f9', borderRadius: 8, fontSize: 11, color: '#475569', lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                          {r.message}
                        </div>
                      </div>
                    )
                  })}
                </div>

                {/* 푸터 버튼 */}
                <div style={{ padding: '16px 24px', borderTop: '1px solid rgba(0,0,0,0.06)', display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                  <button
                    onClick={() => setSmsModal(prev => ({ ...prev, open: false }))}
                    style={{
                      padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 700,
                      background: 'rgba(0,0,0,0.08)', border: 'none', cursor: 'pointer', color: '#334155',
                    }}
                  >
                    취소
                  </button>
                  <button
                    onClick={handleConfirmSend}
                    disabled={smsModal.loading}
                    style={{
                      padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 700,
                      background: '#2563eb', border: 'none', cursor: 'pointer', color: '#fff',
                      opacity: smsModal.loading ? 0.6 : 1,
                    }}
                  >
                    {notifyChannel === 'sms' ? '📱 SMS' : '📧 이메일'} 발송
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ═══ 토스트 메시지 ═══ */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: 24, right: 24, zIndex: 50,
          padding: '12px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600,
          background: toast.type === 'success' ? '#10b981' : '#ef4444',
          color: '#fff', boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
        }}>
          {toast.msg}
        </div>
      )}
      </div>
    </div>
  )
}

// ============================================
// 타입 정의 (로컬 인라인 컴포넌트용)
// ============================================

// ============================================
// KPI 카드 컴포넌트 (인라인)
// ============================================
interface KPICardProps {
  label: string
  value: string | number
  unit: string
  variant?: 'default' | 'success' | 'warning' | 'error'
}

const KPICard = ({ label, value, unit, variant = 'default' }: KPICardProps) => {
  const variantStyles = {
    default: { bg: 'rgba(226, 232, 240, 0.5)', border: 'rgba(148, 163, 184, 0.3)' },
    success: { bg: 'rgba(220, 252, 231, 0.5)', border: 'rgba(16, 185, 129, 0.3)' },
    warning: { bg: 'rgba(254, 243, 199, 0.5)', border: 'rgba(245, 158, 11, 0.3)' },
    error: { bg: 'rgba(254, 226, 226, 0.5)', border: 'rgba(239, 68, 68, 0.3)' },
  }
  const style = variantStyles[variant]
  return (
    <div style={{
      background: style.bg, border: `1px solid ${style.border}`, borderRadius: 12, padding: '16px', minWidth: 200,
    }}>
      <p style={{ margin: 0, fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</p>
      <p style={{ margin: '8px 0 0', fontSize: 18, fontWeight: 900, color: '#1e293b' }}>
        {value}<span style={{ fontSize: 12, color: '#94a3b8', marginLeft: 4 }}>{unit}</span>
      </p>
    </div>
  )
}

// ============================================
// 매출 분석 탭
// ============================================
const RevenueTab = ({
  revenueBySource, totalIncome, transactions
}: {
  revenueBySource: [string, { total: number; count: number; items: Transaction[] }][]
  totalIncome: number
  transactions: Transaction[]
}) => (
  <div style={{ padding: 24 }}>
    <h2 style={{ margin: '0 0 20px', fontSize: 16, fontWeight: 900, color: '#1e293b' }}>📈 매출 분석</h2>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16, marginBottom: 24 }}>
      {revenueBySource.map(([group, data]) => (
        <div key={group} style={{
          background: 'rgba(255,255,255,0.5)', border: '1px solid rgba(0,0,0,0.06)', borderRadius: 12, padding: 16,
        }}>
          <p style={{ margin: 0, fontSize: 12, fontWeight: 800, color: '#64748b', marginBottom: 8 }}>{group}</p>
          <p style={{ margin: 0, fontSize: 18, fontWeight: 900, color: '#2563eb' }}>{nf(data.total)}</p>
          <p style={{ margin: '4px 0 0', fontSize: 11, color: '#94a3b8' }}>{data.count}건 • {((data.total / totalIncome) * 100).toFixed(1)}%</p>
        </div>
      ))}
    </div>
    <div style={{
      background: 'rgba(255,255,255,0.5)', border: '1px solid rgba(0,0,0,0.06)', borderRadius: 12, padding: 16,
    }}>
      <h3 style={{ margin: '0 0 12px', fontSize: 13, fontWeight: 800, color: '#334155' }}>최근 거래</h3>
      <div style={{ maxHeight: 300, overflow: 'auto' }}>
        {transactions.filter(t => t.type === 'income' && t.status === 'completed').slice(0, 10).map(t => (
          <div key={t.id} style={{
            padding: '8px 0', borderBottom: '1px solid rgba(0,0,0,0.04)', display: 'flex', justifyContent: 'space-between',
          }}>
            <div>
              <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: '#1e293b' }}>{t.client_name}</p>
              <p style={{ margin: '2px 0 0', fontSize: 11, color: '#94a3b8' }}>{t.category}</p>
            </div>
            <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: '#059669' }}>{nf(t.amount)}</p>
          </div>
        ))}
      </div>
    </div>
  </div>
)

// ============================================
// 지급 관리 탭
// ============================================
const SettlementTab = ({
  items, summary, carTxHistory, investDepositHistory
}: {
  items: SettlementItem[]
  summary: { totalItems: number; pendingCount: number; pendingAmount: number; paidCount: number; paidAmount: number }
  carTxHistory: Transaction[]
  investDepositHistory: Transaction[]
}) => (
  <div style={{ padding: 24 }}>
    <h2 style={{ margin: '0 0 20px', fontSize: 16, fontWeight: 900, color: '#1e293b' }}>💳 지급 관리</h2>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 24 }}>
      <KPICard label="총 정산 항목" value={summary.totalItems} unit="건" />
      <KPICard label="미지급" value={nf(summary.pendingAmount)} unit="원" variant="warning" />
      <KPICard label="지급완료" value={nf(summary.paidAmount)} unit="원" variant="success" />
    </div>
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
      <div style={{
        background: 'rgba(255,255,255,0.5)', border: '1px solid rgba(0,0,0,0.06)', borderRadius: 12, padding: 16,
      }}>
        <h3 style={{ margin: '0 0 12px', fontSize: 13, fontWeight: 800, color: '#334155' }}>미지급 항목 ({summary.pendingCount}건)</h3>
        <div style={{ maxHeight: 300, overflow: 'auto' }}>
          {items.filter(i => i.status === 'pending').map(item => (
            <div key={item.id} style={{
              padding: '8px 0', borderBottom: '1px solid rgba(0,0,0,0.04)', display: 'flex', justifyContent: 'space-between',
            }}>
              <div>
                <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: '#1e293b' }}>{item.name}</p>
                <p style={{ margin: '2px 0 0', fontSize: 11, color: '#94a3b8' }}>{item.monthLabel} {item.type}</p>
              </div>
              <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: '#ef4444' }}>{nf(item.amount)}</p>
            </div>
          ))}
        </div>
      </div>
      <div style={{
        background: 'rgba(255,255,255,0.5)', border: '1px solid rgba(0,0,0,0.06)', borderRadius: 12, padding: 16,
      }}>
        <h3 style={{ margin: '0 0 12px', fontSize: 13, fontWeight: 800, color: '#334155' }}>지급완료 항목 ({summary.paidCount}건)</h3>
        <div style={{ maxHeight: 300, overflow: 'auto' }}>
          {items.filter(i => i.status === 'paid').map(item => (
            <div key={item.id} style={{
              padding: '8px 0', borderBottom: '1px solid rgba(0,0,0,0.04)', display: 'flex', justifyContent: 'space-between',
            }}>
              <div>
                <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: '#1e293b' }}>{item.name}</p>
                <p style={{ margin: '2px 0 0', fontSize: 11, color: '#94a3b8' }}>{item.monthLabel} {item.type}</p>
              </div>
              <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: '#059669' }}>{nf(item.amount)}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  </div>
)

// ============================================
// 손익계산서 탭
// ============================================
const PnLTab = ({
  revenueBySource, expenseByGroup, summary, filterDate
}: {
  revenueBySource: [string, { total: number; count: number; items: Transaction[] }][]
  expenseByGroup: [string, { total: number; count: number; items: Transaction[] }][]
  summary: { income: number; expense: number; profit: number; pending: number }
  filterDate: string
}) => (
  <div style={{ padding: 24 }}>
    <h2 style={{ margin: '0 0 20px', fontSize: 16, fontWeight: 900, color: '#1e293b' }}>📊 {filterDate} 손익계산서</h2>
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
      <div style={{
        background: 'linear-gradient(135deg, rgba(34, 197, 94, 0.1), rgba(34, 197, 94, 0.05))',
        border: '1px solid rgba(34, 197, 94, 0.2)', borderRadius: 12, padding: 16,
      }}>
        <p style={{ margin: 0, fontSize: 11, fontWeight: 800, color: '#059669', textTransform: 'uppercase' }}>수입</p>
        <p style={{ margin: '8px 0 0', fontSize: 24, fontWeight: 900, color: '#059669' }}>{nf(summary.income)}</p>
      </div>
      <div style={{
        background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.1), rgba(239, 68, 68, 0.05))',
        border: '1px solid rgba(239, 68, 68, 0.2)', borderRadius: 12, padding: 16,
      }}>
        <p style={{ margin: 0, fontSize: 11, fontWeight: 800, color: '#dc2626', textTransform: 'uppercase' }}>지출</p>
        <p style={{ margin: '8px 0 0', fontSize: 24, fontWeight: 900, color: '#dc2626' }}>{nf(summary.expense)}</p>
      </div>
    </div>
    <div style={{
      background: 'linear-gradient(135deg, rgba(37, 99, 235, 0.1), rgba(37, 99, 235, 0.05))',
      border: '1px solid rgba(37, 99, 235, 0.2)', borderRadius: 12, padding: 16, marginBottom: 24,
    }}>
      <p style={{ margin: 0, fontSize: 11, fontWeight: 800, color: '#2563eb', textTransform: 'uppercase' }}>순이익</p>
      <p style={{ margin: '8px 0 0', fontSize: 28, fontWeight: 900, color: '#2563eb' }}>{nfSign(summary.profit)}</p>
    </div>
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
      <div style={{
        background: 'rgba(255,255,255,0.5)', border: '1px solid rgba(0,0,0,0.06)', borderRadius: 12, padding: 16,
      }}>
        <h3 style={{ margin: '0 0 12px', fontSize: 13, fontWeight: 800, color: '#334155' }}>수입 분석</h3>
        {revenueBySource.map(([group, data]) => (
          <div key={group} style={{
            padding: '8px 0', borderBottom: '1px solid rgba(0,0,0,0.04)', display: 'flex', justifyContent: 'space-between',
          }}>
            <p style={{ margin: 0, fontSize: 12, color: '#475569' }}>{group}</p>
            <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: '#059669' }}>{nf(data.total)}</p>
          </div>
        ))}
      </div>
      <div style={{
        background: 'rgba(255,255,255,0.5)', border: '1px solid rgba(0,0,0,0.06)', borderRadius: 12, padding: 16,
      }}>
        <h3 style={{ margin: '0 0 12px', fontSize: 13, fontWeight: 800, color: '#334155' }}>지출 분석</h3>
        {expenseByGroup.map(([group, data]) => (
          <div key={group} style={{
            padding: '8px 0', borderBottom: '1px solid rgba(0,0,0,0.04)', display: 'flex', justifyContent: 'space-between',
          }}>
            <p style={{ margin: 0, fontSize: 12, color: '#475569' }}>{group}</p>
            <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: '#dc2626' }}>{nf(data.total)}</p>
          </div>
        ))}
      </div>
    </div>
  </div>
)

// ============================================
// 분류 관리 탭 (미사용이지만 구조상 필요)
// ============================================
const ClassifyTab = () => (
  <div style={{ padding: 24 }}>
    <p style={{ textAlign: 'center', color: '#94a3b8' }}>분류 기능 준비 중...</p>
  </div>
)
