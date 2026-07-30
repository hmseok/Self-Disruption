'use client'

// ═══════════════════════════════════════════════════════════════
// 매핑 관리 탭 — 카드/통장/구분 설정
// 2026-07-30 개편 2단계 — page.tsx 에서 분리. 데이터·액션은 부모가 소유.
// ═══════════════════════════════════════════════════════════════

import { COLORS, GLASS, BTN } from '@/app/utils/ui-tokens'
import { fetchWithAuth } from '@/app/utils/finance-upload'
import { ISSUER_LABEL, ISSUER_COLOR } from './_shared'

export type MappingSub = 'card' | 'bank' | 'domain'

export interface ManageDomain {
  id: string
  code: string
  label: string
  color: string | null
  target_page: string | null
  sort_order: number
  is_active: number
}

interface MappingTabProps {
  sub: MappingSub
  onSub: (s: MappingSub) => void
  cards: any[]
  banks: any[]
  domains: ManageDomain[]
  smsAliases: any[]
  onEdit: (mapping: any) => void
  onDelete: (id: string, type: string) => void
  reloadMappings: () => void
  reloadDomains: () => void
}

export default function MappingTab({
  sub, onSub, cards, banks, domains, smsAliases,
  onEdit, onDelete, reloadMappings, reloadDomains,
}: MappingTabProps) {
  return (
    <>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <button onClick={() => onSub('card')} style={{
          padding: '8px 18px', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer',
          border: `1px solid ${sub === 'card' ? 'rgba(59,110,181,0.4)' : 'rgba(0,0,0,0.06)'}`,
          background: sub === 'card' ? 'rgba(191,219,254,0.6)' : 'rgba(255,255,255,0.72)',
          color: sub === 'card' ? '#1e40af' : '#475569',
        }}>💳 카드 매핑 ({cards.length})</button>
        <button onClick={() => onSub('bank')} style={{
          padding: '8px 18px', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer',
          border: `1px solid ${sub === 'bank' ? 'rgba(5,150,105,0.4)' : 'rgba(0,0,0,0.06)'}`,
          background: sub === 'bank' ? 'rgba(167,243,208,0.4)' : 'rgba(255,255,255,0.72)',
          color: sub === 'bank' ? '#065f46' : '#475569',
        }}>🏦 통장 매핑 ({banks.length})</button>
        <button onClick={() => onSub('domain')} style={{
          padding: '8px 18px', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer',
          border: `1px solid ${sub === 'domain' ? 'rgba(124,58,237,0.4)' : 'rgba(0,0,0,0.06)'}`,
          background: sub === 'domain' ? COLORS.bgViolet : GLASS.L4.background,
          color: sub === 'domain' ? '#6d28d9' : '#475569',
        }}>🗂 구분 설정 ({domains.length})</button>
        <span style={{ flex: 1 }} />
        <button onClick={() => onEdit(sub === 'card' ? { type: 'card' } : { type: 'bank' })} style={{
          padding: '8px 14px', borderRadius: 10, fontSize: 12, fontWeight: 700, cursor: 'pointer',
          background: 'rgba(167,243,208,0.5)', color: '#065f46', border: '1px solid rgba(5,150,105,0.3)',
        }}>+ 추가</button>
        <label style={{
          padding: '8px 14px', borderRadius: 10, fontSize: 12, fontWeight: 700, cursor: 'pointer',
          background: 'rgba(251,191,36,0.2)', color: '#92400e', border: '1px solid rgba(251,191,36,0.4)',
          display: 'inline-flex', alignItems: 'center', gap: 4,
        }}>
          📤 엑셀 업로드
          <input type="file" accept=".xlsx,.xls,.csv" style={{ display: 'none' }} onChange={async (e) => {
            const file = e.target.files?.[0]
            if (!file) return
            e.target.value = '' // reset
            try {
              const XLSX = await import('xlsx')
              const buf = await file.arrayBuffer()
              const wb = XLSX.read(buf, { type: 'array' })
              const ws = wb.Sheets[wb.SheetNames[0]]
              const rows: any[] = XLSX.utils.sheet_to_json(ws, { defval: '' })
              if (rows.length === 0) { alert('데이터가 없습니다.'); return }

              // 컬럼 자동 감지
              const keys = Object.keys(rows[0])
              const isCard = sub === 'card'

              // 카드: 카드번호/별칭, 카드사, 소지자
              // 통장: 계좌번호/별칭, 은행, 예금주, 용도
              const findCol = (patterns: string[]) => keys.find(k => patterns.some(p => k.includes(p))) || ''

              let items: any[] = []
              if (isCard) {
                const aliasCol = findCol(['카드번호', '카드', '별칭', 'card', 'number'])
                const issuerCol = findCol(['카드사', '발급사', 'issuer', '사'])
                const holderCol = findCol(['소지자', '이름', '성명', 'holder', '사용자'])
                if (!aliasCol) { alert(`카드번호/별칭 컬럼을 찾을 수 없습니다.\n컬럼: ${keys.join(', ')}`); return }
                items = rows.filter(r => r[aliasCol]).map(r => ({
                  type: 'card',
                  card_alias: String(r[aliasCol]).trim(),
                  card_issuer: issuerCol ? String(r[issuerCol]).trim() : '',
                  holder_name: holderCol ? String(r[holderCol]).trim() : '',
                }))
              } else {
                const aliasCol = findCol(['계좌번호', '계좌', '별칭', 'account', 'number'])
                const bankCol = findCol(['은행', 'bank', '은행명'])
                const holderCol = findCol(['예금주', '이름', '성명', 'holder', '소유자'])
                const purposeCol = findCol(['용도', 'purpose', '구분'])
                if (!aliasCol) { alert(`계좌번호/별칭 컬럼을 찾을 수 없습니다.\n컬럼: ${keys.join(', ')}`); return }
                items = rows.filter(r => r[aliasCol]).map(r => ({
                  type: 'bank',
                  account_alias: String(r[aliasCol]).trim(),
                  bank_issuer: bankCol ? String(r[bankCol]).trim() : '',
                  bank_name: bankCol ? String(r[bankCol]).trim() : '',
                  account_holder: holderCol ? String(r[holderCol]).trim() : '',
                  purpose: purposeCol ? String(r[purposeCol]).trim() : '',
                }))
              }

              if (items.length === 0) { alert('유효한 데이터가 없습니다.'); return }
              if (!confirm(`${isCard ? '카드' : '통장'} ${items.length}건을 등록하시겠습니까?\n\n예시: ${JSON.stringify(items[0]).slice(0, 120)}...`)) return

              let ok = 0, fail = 0
              for (const item of items) {
                try {
                  await fetchWithAuth('/api/finance/mappings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(item) })
                  ok++
                } catch { fail++ }
              }
              alert(`등록 완료: 성공 ${ok}건${fail > 0 ? `, 실패 ${fail}건` : ''}`)
              reloadMappings()
            } catch (err: any) {
              alert('엑셀 파싱 오류: ' + err.message)
            }
          }} />
        </label>
      </div>

      {/* SMS에서 감지됐지만 미등록된 카드/계좌 알림 */}
      {/*   ※ 매칭 기준: card_alias 정확 일치 + last4 일치 OR previous_card_number 일치 */}
      {(() => {
        // 등록된 카드/계좌의 last4 추출 (card_number, card_alias, previous_card_number 모두)
        const extractLast4 = (s: string | null | undefined): string | null => {
          if (!s) return null
          const d = String(s).replace(/\D/g, '')
          return d.length >= 4 ? d.slice(-4) : null
        }
        const registeredLast4 = new Set<string>()
        const registeredAliases = new Set<string>()
        for (const c of cards) {
          if (c.card_alias) registeredAliases.add(c.card_alias)
          const l1 = extractLast4(c.card_number); if (l1) registeredLast4.add(l1)
          const l2 = extractLast4(c.card_alias);  if (l2) registeredLast4.add(l2)
          const l3 = extractLast4(c.previous_card_number); if (l3) registeredLast4.add(l3)
        }
        for (const b of banks) {
          if (b.account_alias) registeredAliases.add(b.account_alias)
          const l = extractLast4(b.account_alias); if (l) registeredLast4.add(l)
        }

        // 미등록 = 별칭 정확 일치도 안 되고 last4 도 안 맞는 것
        const unregistered = smsAliases.filter((s: any) => {
          if (registeredAliases.has(s.card_alias)) return false
          const last4 = extractLast4(s.card_alias)
          if (last4 && registeredLast4.has(last4)) return false
          return true
        })
        if (unregistered.length === 0) return null
        return (
          <div style={{
            padding: '10px 14px', marginBottom: 12, borderRadius: 10,
            background: 'rgba(251,191,36,0.12)', border: '1px solid rgba(251,191,36,0.3)',
            fontSize: 12, color: '#92400e',
          }}>
            ⚠ SMS에서 감지되었지만 미등록된 카드/계좌가 {unregistered.length}건 있습니다:
            {unregistered.map((u: any) => (
              <button key={u.card_alias} onClick={() => {
                const isBank = (u.card_issuer || '').includes('BANK')
                onSub(isBank ? 'bank' : 'card')
                onEdit(isBank
                  ? { type: 'bank', account_alias: u.card_alias, bank_issuer: u.card_issuer }
                  : { type: 'card', card_alias: u.card_alias, card_issuer: u.card_issuer })
              }} style={{
                marginLeft: 6, padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700,
                background: '#fff', border: '1px solid rgba(251,191,36,0.5)', cursor: 'pointer', color: '#92400e',
              }}>{u.card_alias}</button>
            ))}
          </div>
        )
      })()}

      {/* 관리 구분 설정 (V11, 2026-07-10 사용자 명시 「사용자가 셋팅하여 구현」) */}
      {sub === 'domain' && (
        <div style={{ ...GLASS.L4, borderRadius: 14, padding: 16 }}>
          <div style={{ fontSize: 12, color: COLORS.textSecondary, marginBottom: 12 }}>
            통장·카드 거래에 붙이는 「구분」 목록입니다. 구분은 소관 페이지만 정하고, 상세 연결(누구·어느 건)은 그 페이지에서 합니다.
          </div>
          {domains.length === 0 && (
            <div style={{ padding: '14px 12px', borderRadius: 10, background: COLORS.bgAmber, fontSize: 12, color: '#92400e' }}>
              구분 목록이 비어있습니다 — 준비 작업(V11)을 먼저 적용해 주세요.
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {domains.map((d) => (
              <div key={d.id} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '8px 10px', borderRadius: 10, border: `1px solid ${COLORS.borderSubtle}`, opacity: d.is_active ? 1 : 0.45 }}>
                <input type="color" value={d.color || '#64748b'}
                  onChange={async (e) => { await fetchWithAuth('/api/finance/manage-domains', { method: 'PATCH', body: { id: d.id, color: e.target.value } }); reloadDomains() }}
                  style={{ width: 26, height: 26, border: 'none', background: 'none', cursor: 'pointer', padding: 0 }} />
                <input defaultValue={d.label}
                  onBlur={async (e) => { if (e.target.value.trim() && e.target.value !== d.label) { await fetchWithAuth('/api/finance/manage-domains', { method: 'PATCH', body: { id: d.id, label: e.target.value.trim() } }); reloadDomains() } }}
                  style={{ ...GLASS.L1, width: 110, padding: '5px 8px', borderRadius: 8, fontSize: 13, fontWeight: 700, outline: 'none' }} />
                <input defaultValue={d.target_page || ''} placeholder="담당 페이지 주소 (예: /jiip)"
                  onBlur={async (e) => { if ((e.target.value || null) !== (d.target_page || null)) { await fetchWithAuth('/api/finance/manage-domains', { method: 'PATCH', body: { id: d.id, target_page: e.target.value.trim() || null } }); reloadDomains() } }}
                  style={{ ...GLASS.L1, flex: 1, padding: '5px 8px', borderRadius: 8, fontSize: 12, outline: 'none' }} />
                <button onClick={async () => { await fetchWithAuth('/api/finance/manage-domains', { method: 'PATCH', body: { id: d.id, is_active: !d.is_active } }); reloadDomains() }}
                  style={{ ...BTN.sm, background: '#fff', color: d.is_active ? COLORS.danger : COLORS.success, border: `1px solid ${COLORS.borderSubtle}`, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                  {d.is_active ? '숨김' : '사용'}
                </button>
              </div>
            ))}
          </div>
          <button onClick={async () => {
            const label = prompt('새 구분 이름을 입력하세요 (예: 차량구입)')
            if (!label || !label.trim()) return
            const { json } = await fetchWithAuth('/api/finance/manage-domains', { method: 'POST', body: { label: label.trim() } })
            if (json?.error) alert(json.error)
            reloadDomains()
          }} style={{ ...BTN.md, marginTop: 12, background: COLORS.primary, color: '#fff', border: 'none', cursor: 'pointer' }}>+ 구분 추가</button>
        </div>
      )}

      {/* 카드 매핑 테이블 */}
      {sub === 'card' && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '2px solid rgba(0,0,0,0.08)' }}>
                <th style={{ padding: '10px 12px', textAlign: 'left', fontSize: 11, fontWeight: 700 }}>카드 별칭</th>
                <th style={{ padding: '10px 12px', textAlign: 'left', fontSize: 11, fontWeight: 700 }}>카드사</th>
                <th style={{ padding: '10px 12px', textAlign: 'center', fontSize: 11, fontWeight: 700 }}>상태</th>
                <th style={{ padding: '10px 12px', textAlign: 'center', fontSize: 11, fontWeight: 700 }}>종류</th>
                <th style={{ padding: '10px 12px', textAlign: 'left', fontSize: 11, fontWeight: 700 }}>소지자/부서</th>
                <th style={{ padding: '10px 12px', textAlign: 'right', fontSize: 11, fontWeight: 700 }}>한도</th>
                <th style={{ padding: '10px 12px', textAlign: 'center', fontSize: 11, fontWeight: 700 }}>결제일</th>
                <th style={{ padding: '10px 12px', textAlign: 'left', fontSize: 11, fontWeight: 700 }}>배정 차량</th>
                <th style={{ padding: '10px 12px', textAlign: 'center', fontSize: 11, fontWeight: 700 }}>관리</th>
              </tr>
            </thead>
            <tbody>
              {cards.map((c: any) => {
                const statusBadge = c.status === 'canceled' ? { bg: 'rgba(239,68,68,0.12)', fg: '#b91c1c', text: '🚫 해지' }
                                  : c.status === 'suspended' ? { bg: 'rgba(245,158,11,0.12)', fg: '#b45309', text: '⏸ 정지' }
                                  : { bg: 'rgba(34,197,94,0.12)', fg: '#15803d', text: '✓ 사용중' }
                const typeColors: Record<string, string> = {
                  '법인신용': '#3b82f6', '법인체크': '#8b5cf6',
                  '하이패스': '#f59e0b', '주유': '#ef4444', '기타': '#94a3b8',
                }
                const typeColor = typeColors[c.card_type || '법인신용'] || '#94a3b8'
                return (
                <tr key={c.id} style={{ borderBottom: '1px solid rgba(0,0,0,0.05)', opacity: c.status === 'canceled' ? 0.6 : 1 }}>
                  <td style={{ padding: '10px 12px', fontWeight: 600 }}>
                    {c.card_alias || c.card_number || '—'}
                    {c.card_holder_type === '기명' && <span style={{ marginLeft: 4, fontSize: 10, color: '#7c3aed' }}>(기명)</span>}
                  </td>
                  <td style={{ padding: '10px 12px' }}>
                    {c.card_issuer && <span style={{ padding: '2px 8px', borderRadius: 6, background: `${ISSUER_COLOR[c.card_issuer] || '#94a3b8'}22`, color: ISSUER_COLOR[c.card_issuer] || '#94a3b8', fontWeight: 700, fontSize: 11 }}>{ISSUER_LABEL[c.card_issuer] || c.card_issuer}</span>}
                  </td>
                  <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                    <span style={{ padding: '2px 8px', borderRadius: 6, background: statusBadge.bg, color: statusBadge.fg, fontWeight: 700, fontSize: 11 }}>{statusBadge.text}</span>
                  </td>
                  <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                    {c.card_type && <span style={{ padding: '2px 8px', borderRadius: 6, background: `${typeColor}22`, color: typeColor, fontWeight: 700, fontSize: 11 }}>{c.card_type}</span>}
                  </td>
                  <td style={{ padding: '10px 12px', fontSize: 12 }}>
                    {c.holder_name || '—'}
                    {c.department && <div style={{ fontSize: 10, color: '#64748b', marginTop: 1 }}>{c.department}</div>}
                  </td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', fontSize: 12, fontFamily: 'monospace' }}>
                    {c.monthly_limit ? `${Number(c.monthly_limit).toLocaleString()}원` : <span style={{ color: '#cbd5e1' }}>—</span>}
                  </td>
                  <td style={{ padding: '10px 12px', textAlign: 'center', fontSize: 12 }}>
                    {c.payment_day ? `${c.payment_day}일` : <span style={{ color: '#cbd5e1' }}>—</span>}
                  </td>
                  <td style={{ padding: '10px 12px' }}>
                    {c.car_number ? <span style={{ padding: '2px 8px', borderRadius: 6, background: 'rgba(59,130,246,0.1)', color: '#1d4ed8', fontWeight: 600, fontSize: 11 }}>🚗 {c.car_number}</span> : <span style={{ color: '#94a3b8' }}>공용</span>}
                  </td>
                  <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                    <button onClick={() => onEdit({
                      type: 'card', id: c.id,
                      card_number: c.card_number,
                      card_alias: c.card_alias, card_issuer: c.card_issuer,
                      holder_name: c.holder_name, assigned_car_id: c.assigned_car_id,
                      assigned_employee_id: c.assigned_employee_id,
                      status: c.status || 'active',
                      card_type: c.card_type || '법인신용',
                      card_holder_type: c.card_holder_type || '무기명',
                      valid_thru: c.valid_thru || '',
                      issued_at: c.issued_at ? String(c.issued_at).slice(0,10) : '',
                      expires_at: c.expires_at ? String(c.expires_at).slice(0,10) : '',
                      payment_bank: c.payment_bank || '',
                      payment_account: c.payment_account || '',
                      payment_day: c.payment_day || '',
                      monthly_limit: c.monthly_limit || '',
                      previous_card_number: c.previous_card_number || '',
                      department: c.department || '',
                      memo: c.memo || '',
                    })} style={{ padding: '3px 8px', borderRadius: 6, fontSize: 11, cursor: 'pointer', background: 'rgba(191,219,254,0.5)', border: '1px solid rgba(59,130,246,0.2)', color: '#1e40af', marginRight: 4 }}>수정</button>
                    <button onClick={() => onDelete(c.id, 'card')} style={{ padding: '3px 8px', borderRadius: 6, fontSize: 11, cursor: 'pointer', background: 'rgba(254,202,202,0.5)', border: '1px solid rgba(239,68,68,0.2)', color: '#b91c1c' }}>삭제</button>
                  </td>
                </tr>
                )
              })}
              {cards.length === 0 && <tr><td colSpan={9} style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>등록된 카드가 없습니다</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {/* 통장 매핑 테이블 */}
      {sub === 'bank' && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '2px solid rgba(0,0,0,0.08)' }}>
                <th style={{ padding: '10px 12px', textAlign: 'left', fontSize: 11, fontWeight: 700 }}>계좌 별칭</th>
                <th style={{ padding: '10px 12px', textAlign: 'left', fontSize: 11, fontWeight: 700 }}>은행</th>
                <th style={{ padding: '10px 12px', textAlign: 'left', fontSize: 11, fontWeight: 700 }}>예금주</th>
                <th style={{ padding: '10px 12px', textAlign: 'left', fontSize: 11, fontWeight: 700 }}>배정 차량</th>
                <th style={{ padding: '10px 12px', textAlign: 'left', fontSize: 11, fontWeight: 700 }}>용도</th>
                <th style={{ padding: '10px 12px', textAlign: 'center', fontSize: 11, fontWeight: 700 }}>관리</th>
              </tr>
            </thead>
            <tbody>
              {banks.map((b: any) => (
                <tr key={b.id} style={{ borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
                  <td style={{ padding: '10px 12px', fontWeight: 600 }}>{b.account_alias}</td>
                  <td style={{ padding: '10px 12px' }}>
                    <span style={{ padding: '2px 8px', borderRadius: 6, background: `${ISSUER_COLOR[b.bank_issuer] || '#059669'}22`, color: ISSUER_COLOR[b.bank_issuer] || '#059669', fontWeight: 700, fontSize: 11 }}>{ISSUER_LABEL[b.bank_issuer] || b.bank_name || b.bank_issuer}</span>
                  </td>
                  <td style={{ padding: '10px 12px' }}>{b.account_holder || '—'}</td>
                  <td style={{ padding: '10px 12px' }}>
                    {b.car_number ? <span style={{ padding: '2px 8px', borderRadius: 6, background: 'rgba(59,130,246,0.1)', color: '#1d4ed8', fontWeight: 600, fontSize: 11 }}>🚗 {b.car_number}</span> : <span style={{ color: '#94a3b8' }}>공용</span>}
                  </td>
                  <td style={{ padding: '10px 12px', fontSize: 11 }}>{b.purpose || '—'}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                    <button onClick={() => onEdit({
                      type: 'bank', id: b.id,
                      account_alias: b.account_alias,
                      account_number: b.account_number || '',
                      branch: b.branch || '',
                      bank_issuer: b.bank_issuer,
                      bank_name: b.bank_name,
                      account_holder: b.account_holder,
                      account_holder_phone: b.account_holder_phone || '',
                      assigned_car_id: b.assigned_car_id,
                      purpose: b.purpose,
                      memo: b.memo,
                    })} style={{ padding: '3px 8px', borderRadius: 6, fontSize: 11, cursor: 'pointer', background: 'rgba(167,243,208,0.5)', border: '1px solid rgba(5,150,105,0.2)', color: '#065f46', marginRight: 4 }}>수정</button>
                    <button onClick={() => onDelete(b.id, 'bank')} style={{ padding: '3px 8px', borderRadius: 6, fontSize: 11, cursor: 'pointer', background: 'rgba(254,202,202,0.5)', border: '1px solid rgba(239,68,68,0.2)', color: '#b91c1c' }}>삭제</button>
                  </td>
                </tr>
              ))}
              {banks.length === 0 && <tr><td colSpan={6} style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>등록된 통장이 없습니다</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}
