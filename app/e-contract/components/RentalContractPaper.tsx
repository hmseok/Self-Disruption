'use client'
/**
 * RentalContractPaper — 단기 임대차 계약서 1페이지 (PDF 템플릿)
 * 업로드된 PDF 양식과 동일한 레이아웃으로 HTML 렌더링
 * html-to-image + jsPDF 로 PDF 변환 가능
 */

interface ContractData {
  // 회사
  company_name?: string; company_ceo?: string; company_address?: string
  company_phone?: string; staff_name?: string; staff_phone?: string
  // 임차인
  renter_name?: string; renter_phone?: string; renter_birth?: string
  renter_address?: string; renter_license_no?: string; renter_license_type?: string
  renter_license_date?: string; renter_license_expiry?: string
  // 제2운전자
  driver2_name?: string; driver2_phone?: string; driver2_birth?: string
  driver2_address?: string; driver2_license_no?: string; driver2_license_type?: string
  driver2_license_date?: string; driver2_license_expiry?: string
  // 대차
  car_model?: string; car_number?: string; car_fuel_type?: string
  dispatch_at?: string; return_at?: string
  dispatch_fuel?: string; return_fuel?: string; dispatch_km?: string; return_km?: string
  // 요금
  rental_hours?: string; total_amount?: number
  // 보험
  ins_min_age?: number; ins_own_limit?: string; ins_own_deductible?: string
  ins_person_limit?: string; ins_person_deductible?: string
  ins_property_limit?: string; ins_property_deductible?: string
  ins_injury_limit?: string; ins_death_limit?: string; ins_injury_deductible?: string
  ins_note?: string
  // 기타
  special_terms?: string
  // 서명
  renter_signature_url?: string
}

const S = {
  page: { width: '210mm', minHeight: '297mm', background: '#fff', fontFamily: "'Noto Sans KR', 'Malgun Gothic', sans-serif", fontSize: 11, color: '#111', padding: '12mm 14mm', boxSizing: 'border-box' as const, position: 'relative' as const },
  table: { width: '100%', borderCollapse: 'collapse' as const, fontSize: 11 },
  th: { background: '#f0f4f8', fontWeight: 700, padding: '5px 8px', border: '1px solid #333', textAlign: 'center' as const, fontSize: 11 },
  td: { padding: '5px 8px', border: '1px solid #333', fontSize: 11, verticalAlign: 'middle' as const },
  tdLabel: { padding: '5px 8px', border: '1px solid #333', fontSize: 11, fontWeight: 600, textAlign: 'center' as const, background: '#f8fafc', whiteSpace: 'nowrap' as const, width: 90 },
  sectionTitle: { background: '#1e3a5f', color: '#fff', textAlign: 'center' as const, padding: '6px 0', fontWeight: 800, fontSize: 12, border: '1px solid #333' },
  f: (n?: number) => n != null ? Math.round(n).toLocaleString() : '-',
  dt: (s?: string) => s ? s.replace('T', ' ').slice(0, 16) : '-',
}

export default function RentalContractPaper({ data, forPdf = false }: { data: ContractData; forPdf?: boolean }) {
  const d = data
  return (
    <div id="rental-contract-page1" style={{ ...S.page, ...(forPdf ? { margin: 0 } : { margin: '0 auto', boxShadow: '0 2px 20px rgba(0,0,0,0.1)' }) }}>
      {/* ═══ 헤더 ═══ */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
        <div style={{ border: '2px solid #333', padding: '8px 16px', lineHeight: 1.6 }}>
          <div style={{ fontWeight: 900, fontSize: 13 }}>{d.company_name || '(회사명)'}</div>
          <div style={{ fontSize: 11 }}>{d.company_phone || ''}</div>
        </div>
        <div style={{ textAlign: 'center', flex: 1 }}>
          <h1 style={{ fontSize: 22, fontWeight: 900, letterSpacing: 12, margin: '4px 0' }}>차 량 임 대 계 약 서</h1>
        </div>
        <div style={{ textAlign: 'right', fontSize: 11, lineHeight: 1.8 }}>
          <div>담당자: {d.staff_name || '-'}</div>
          <div>연락처: {d.staff_phone || '-'}</div>
        </div>
      </div>

      {/* ═══ 본문 2컬럼: 좌(임차인+제2운전자+대차) / 우(요금+보험) ═══ */}
      <div style={{ display: 'flex', gap: 0 }}>
        {/* ── 좌측 ── */}
        <div style={{ flex: 1 }}>
          {/* 임차인 정보 */}
          <table style={S.table}>
            <tbody>
              <tr><td colSpan={4} style={S.sectionTitle}>임차인 정보</td></tr>
              <tr>
                <td style={S.tdLabel}>임차인</td>
                <td style={S.td}>{d.renter_name || ''}</td>
                <td style={S.tdLabel}>연락처</td>
                <td style={S.td}>{d.renter_phone || ''}</td>
              </tr>
              <tr>
                <td style={S.tdLabel}>생년월일</td>
                <td colSpan={3} style={S.td}>{d.renter_birth || ''}</td>
              </tr>
              <tr>
                <td style={S.tdLabel}>주소</td>
                <td colSpan={3} style={S.td}>{d.renter_address || ''}</td>
              </tr>
              <tr>
                <td style={S.tdLabel}>운전면허번호</td>
                <td style={S.td}>{d.renter_license_no || ''}</td>
                <td style={S.tdLabel}>면허 취득일</td>
                <td style={S.td}>{d.renter_license_date || ''}</td>
              </tr>
              <tr>
                <td style={S.tdLabel}>면허구분</td>
                <td style={S.td}>{d.renter_license_type || ''}</td>
                <td style={S.tdLabel}>만기일</td>
                <td style={S.td}>{d.renter_license_expiry || ''}</td>
              </tr>
            </tbody>
          </table>

          {/* 제2운전자 정보 */}
          <table style={{ ...S.table, marginTop: -1 }}>
            <tbody>
              <tr><td colSpan={4} style={S.sectionTitle}>제2운전자 정보</td></tr>
              <tr>
                <td style={S.tdLabel}>제2운전자</td>
                <td style={S.td}>{d.driver2_name || ''}</td>
                <td style={S.tdLabel}>연락처</td>
                <td style={S.td}>{d.driver2_phone || ''}</td>
              </tr>
              <tr>
                <td style={S.tdLabel}>생년월일</td>
                <td colSpan={3} style={S.td}>{d.driver2_birth || ''}</td>
              </tr>
              <tr>
                <td style={S.tdLabel}>주소</td>
                <td colSpan={3} style={S.td}>{d.driver2_address || ''}</td>
              </tr>
              <tr>
                <td style={S.tdLabel}>운전면허번호</td>
                <td style={S.td}>{d.driver2_license_no || ''}</td>
                <td style={S.tdLabel}>면허 취득일</td>
                <td style={S.td}>{d.driver2_license_date || ''}</td>
              </tr>
              <tr>
                <td style={S.tdLabel}>면허구분</td>
                <td style={S.td}>{d.driver2_license_type || ''}</td>
                <td style={S.tdLabel}>만기일</td>
                <td style={S.td}>{d.driver2_license_expiry || ''}</td>
              </tr>
            </tbody>
          </table>

          {/* 대차 정보 */}
          <table style={{ ...S.table, marginTop: -1 }}>
            <tbody>
              <tr><td colSpan={4} style={S.sectionTitle}>대차 정보</td></tr>
              <tr>
                <td style={S.tdLabel}>차종</td>
                <td colSpan={3} style={S.td}>{d.car_model || ''}</td>
              </tr>
              <tr>
                <td style={S.tdLabel}>차량번호</td>
                <td style={S.td}>{d.car_number || ''}</td>
                <td style={S.tdLabel}>유종</td>
                <td style={S.td}>{d.car_fuel_type || ''}</td>
              </tr>
              <tr>
                <td style={S.tdLabel}>대여일시</td>
                <td colSpan={3} style={S.td}>{S.dt(d.dispatch_at)}</td>
              </tr>
              <tr>
                <td style={S.tdLabel}>반납예정일</td>
                <td colSpan={3} style={S.td}>{S.dt(d.return_at)}</td>
              </tr>
              <tr>
                <td style={S.tdLabel}>배차 유류량</td>
                <td style={S.td}>{d.dispatch_fuel || '-'}</td>
                <td style={S.tdLabel}>반납 유류량</td>
                <td style={S.td}>{d.return_fuel || '-'}</td>
              </tr>
              <tr>
                <td style={S.tdLabel}>배차 시 km</td>
                <td style={S.td}>{d.dispatch_km || '-'}</td>
                <td style={S.tdLabel}>반납 시 km</td>
                <td style={S.td}>{d.return_km || '-'}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* ── 우측 ── */}
        <div style={{ width: 280, marginLeft: -1 }}>
          {/* 요금 */}
          <table style={S.table}>
            <tbody>
              <tr><td colSpan={2} style={S.sectionTitle}>요금</td></tr>
              <tr>
                <td style={S.tdLabel}>대여시간</td>
                <td style={S.td}>{d.rental_hours || '-'}</td>
              </tr>
              <tr>
                <td style={S.tdLabel}>총 요금</td>
                <td style={{ ...S.td, fontWeight: 900, fontSize: 14, color: '#1e3a5f' }}>{S.f(d.total_amount)}</td>
              </tr>
            </tbody>
          </table>

          {/* 보험가입 및 차량손해 면책 제도 */}
          <table style={{ ...S.table, marginTop: -1 }}>
            <tbody>
              <tr><td colSpan={4} style={S.sectionTitle}>보험가입 및 차량손해 면책 제도</td></tr>
              <tr>
                <td style={S.tdLabel}>보험 가입 연령</td>
                <td colSpan={3} style={S.td}>만 {d.ins_min_age || 26}세 이상</td>
              </tr>
              <tr>
                <td style={S.tdLabel}>자차 한도</td>
                <td style={S.td}>{d.ins_own_limit || '3,000만원'}</td>
                <td style={S.tdLabel}>자차 면책금</td>
                <td style={S.td}>{d.ins_own_deductible || '50만원'}</td>
              </tr>
              <tr>
                <td style={S.tdLabel}>대인 한도</td>
                <td style={S.td}>{d.ins_person_limit || '무한'}</td>
                <td style={{ ...S.tdLabel, fontSize: 10 }}>대인 면책금(인당)</td>
                <td style={S.td}>{d.ins_person_deductible || '없음'}</td>
              </tr>
              <tr>
                <td style={S.tdLabel}>대물 한도</td>
                <td style={S.td}>{d.ins_property_limit || '1억 원'}</td>
                <td style={{ ...S.tdLabel, fontSize: 10 }}>대물 면책금(건당)</td>
                <td style={S.td}>{d.ins_property_deductible || '없음'}</td>
              </tr>
              <tr>
                <td style={{ ...S.tdLabel, fontSize: 10 }}>자손 한도(부상)</td>
                <td style={S.td}>{d.ins_injury_limit || '1,500만원'}</td>
                <td style={{ ...S.tdLabel, fontSize: 10 }}>자손 한도(사망)</td>
                <td style={S.td}>{d.ins_death_limit || '1,500만원'}</td>
              </tr>
              <tr>
                <td style={S.tdLabel}>자손 면책금</td>
                <td colSpan={3} style={S.td}>{d.ins_injury_deductible || '없음'}</td>
              </tr>
              <tr>
                <td colSpan={4} style={{ ...S.td, fontSize: 10, lineHeight: 1.6, color: '#374151' }}>
                  {d.ins_note || `*자기차량 손해의 경우, 고객귀책사유로 인한 사고는 면책금 (${d.ins_own_deductible || '50'})만원, 대인 (${d.ins_person_deductible || '-'})만원 / 대물 (${d.ins_property_deductible || '-'})만원 휴차손해료(1일 대여요금의 50%)는 각각 별도 지불하여야 합니다. 보험가입 현황 및 차량손해 면책제도에 관하여 설명을 들었으며, 차량손해 면책제도 가입에 동의함.`}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* ═══ 기타 계약사항 ═══ */}
      <table style={{ ...S.table, marginTop: -1 }}>
        <tbody>
          <tr><td style={S.sectionTitle}>기타 계약사항</td></tr>
          <tr><td style={{ ...S.td, minHeight: 60, whiteSpace: 'pre-wrap' }}>{d.special_terms || '\u00A0'}</td></tr>
        </tbody>
      </table>

      {/* ═══ 서명란 ═══ */}
      <div style={{ marginTop: 20, display: 'flex', justifyContent: 'space-between', gap: 40 }}>
        {/* 임대인 */}
        <div style={{ flex: 1, border: '1px solid #333', padding: 12 }}>
          <div style={{ fontWeight: 900, fontSize: 13, textAlign: 'center', borderBottom: '1px solid #ccc', paddingBottom: 6, marginBottom: 8 }}>임대인</div>
          <div style={{ fontSize: 11, lineHeight: 1.8 }}>
            <div>{d.company_address || ''}</div>
            <div>{d.company_name || ''} 대표 {d.company_ceo || ''}</div>
          </div>
        </div>
        {/* 임차인 */}
        <div style={{ flex: 1, border: '1px solid #333', padding: 12 }}>
          <div style={{ fontWeight: 900, fontSize: 13, textAlign: 'center', borderBottom: '1px solid #ccc', paddingBottom: 6, marginBottom: 8 }}>임차인</div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
            <div style={{ fontSize: 11 }}>임차인: {d.renter_name || ''}</div>
            <div style={{ textAlign: 'right' }}>
              {d.renter_signature_url ? (
                <img src={d.renter_signature_url} alt="서명" style={{ height: 40, objectFit: 'contain' }} />
              ) : (
                <span style={{ fontSize: 11, color: '#9ca3af' }}>서명 또는 (인)</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 하단 안내 */}
      <div style={{ marginTop: 10, fontSize: 10, color: '#6b7280', textAlign: 'center' }}>
        뒷면에 약관이 있으니 확인해주세요. &nbsp;&nbsp; 1/2
      </div>
    </div>
  )
}
