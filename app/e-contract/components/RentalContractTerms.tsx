'use client'
/**
 * RentalContractTerms — 단기 임대차 계약서 2페이지 (약관 + 동의)
 */

const S = {
  page: { width: '210mm', minHeight: '297mm', background: '#fff', fontFamily: "'Noto Sans KR', 'Malgun Gothic', sans-serif", fontSize: 10, color: '#111', padding: '12mm 14mm', boxSizing: 'border-box' as const, position: 'relative' as const },
  h2: { fontSize: 12, fontWeight: 900, borderBottom: '2px solid #1e3a5f', paddingBottom: 4, marginBottom: 6, marginTop: 14, color: '#1e3a5f' },
  p: { fontSize: 10, lineHeight: 1.7, margin: '3px 0', color: '#374151' },
  table: { width: '100%', borderCollapse: 'collapse' as const, fontSize: 9, marginTop: 6 },
  th: { background: '#f0f4f8', fontWeight: 700, padding: '4px 6px', border: '1px solid #999', textAlign: 'center' as const, fontSize: 9 },
  td: { padding: '4px 6px', border: '1px solid #999', fontSize: 9, verticalAlign: 'top' as const, lineHeight: 1.5 },
}

interface Props {
  companyName?: string
  renterName?: string
  signatureUrl?: string
  forPdf?: boolean
}

export default function RentalContractTerms({ companyName, renterName, signatureUrl, forPdf = false }: Props) {
  return (
    <div id="rental-contract-page2" style={{ ...S.page, ...(forPdf ? { margin: 0 } : { margin: '0 auto', boxShadow: '0 2px 20px rgba(0,0,0,0.1)' }) }}>

      {/* ── 대여약관 및 주요 고지사항 ── */}
      <h2 style={S.h2}>대여약관 및 주요 고지사항에 대한 동의</h2>
      <p style={S.p}>1. 차량 임차기간 동안 발생한 유류비 및 주정차 위반과 교통법규 위반 등으로 인한 과태료와 범칙금 등은 임차인 부담입니다.</p>
      <p style={S.p}>2. 차량 임차 중 사고 발생 시, 약관에 따라 자동차보험 및 자차손해면책제도의 범위 내 손해를 보상받을 수 있습니다.</p>
      <p style={S.p}>3. 차량 임차 중 자차 사고 발생 시 해당 면책금과 휴차 보상료(대여요금의 50%)는 임차인 부담입니다.</p>
      <p style={S.p}>4. 전자계약서 이용 시 서비스 제공(ex.전자계약서)과 함께 서비스 운영과 관련한 각종 정보와 광고를 웹페이지 또는 모바일 애플리케이션 등에 게재할 수 있습니다.</p>
      <p style={S.p}>5. 그 외 계약조건은 자동차대여 표준약관에 따릅니다.</p>

      {/* ── 개인위치정보 동의 ── */}
      <h2 style={S.h2}>개인위치정보 조회 및 이용 동의</h2>
      <p style={S.p}>당사의 차량에는 위치정보를 수집할 수 있는 장치가 부착되어 있으며 도난, 분실, 반납지연의 상황 발생 시 차량 회수를 목적으로 위치정보를 수집, 이용, 제공할 수 있습니다.</p>

      {/* ── 개인정보 수집 및 이용 동의 ── */}
      <h2 style={S.h2}>개인정보 수집 및 이용 동의</h2>
      <p style={S.p}>당사는 이용자(임차인 및 운전자)에 대하여 대여 계약에 필요한 개인정보, 서비스 제공을 위한 개인정보 등 필수 사항을 차량 임대차계약서를 통해 수집하고 렌터카 예약/사용/반납 서비스 제공을 위해 이용하고 있습니다.</p>
      <p style={S.p}>렌터카 예약/사용/반납 서비스 제공이 종료된 이후에는 수집된 개인정보를 원칙적으로 파기합니다. 단, 법령의 규정에 의하여 보존할 필요성이 있는 경우에는 해당 법령에 따르며, 미반환 차량 회수, 이용요금 정산, 교통법규 위반으로 인한 사후처리, 민/형사상 분쟁의 소지가 있을 경우 확인하기 위해서 다음의 정보는 5년간 보존합니다.</p>
      <p style={{ ...S.p, paddingLeft: 12 }}>a. 보존항목 : 이름, 전화번호, 주소, 휴대전화번호, 생년월일, 운전면허 정보, 차량번호</p>
      <p style={{ ...S.p, paddingLeft: 12 }}>b. 보존근거 : 미반환 차량 회수, 이용요금 정산, 주정차 및 교통법규 위반으로 인한 과태료와 범칙금 부과 및 향후 분쟁의 소지가 있을 경우에 이를 확인하기 위함.</p>
      <p style={{ ...S.p, paddingLeft: 12 }}>c. 보존기간 : 5년</p>

      {/* ── 제3자 정보제공 동의 ── */}
      <h2 style={S.h2}>제3자 정보제공 및 조회 동의</h2>
      <p style={S.p}>1. 차량 임대차계약과 관련하여 당사가 이용자(임차인 및 운전자)로부터 취득한 개인정보는 해당 보험사 및 관련 기관에 제공되어 차량 임대차계약 관리 및 교통사고 보상서비스에 사용됩니다.</p>
      <p style={S.p}>2. 당사는 이용자(임차인 및 운전자)에게 동의를 받은 경우에만 원활한 서비스 제공을 위해 아래와 같이 제3자에게 개인정보를 제공합니다.</p>

      <table style={S.table}>
        <thead>
          <tr>
            <th style={{ ...S.th, width: '22%' }}>제공 받는자</th>
            <th style={{ ...S.th, width: '30%' }}>이용목적</th>
            <th style={{ ...S.th, width: '28%' }}>제공정보</th>
            <th style={{ ...S.th, width: '20%' }}>보유 및 이용기간</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style={S.td}>보험사 및 공제조합</td>
            <td style={S.td}>교통사고 보상서비스를 위한 접수 및 청구</td>
            <td style={S.td}>이름, 생년월일, 주소, 휴대전화번호, 전화번호, 운전면허정보, 차량번호</td>
            <td style={S.td}>계약일로부터 5년</td>
          </tr>
          <tr>
            <td style={S.td}>정부 및 공공기관, 지방자치단체</td>
            <td style={S.td}>임차인의 귀책사유로 인한 계약불이행으로 당사에 손해가 발생한 경우 배상청구와 유사피해 방지, 범칙금, 과태료 부과 시 명의변경 신청</td>
            <td style={S.td}>이름, 생년월일, 주소, 휴대전화번호, 전화번호, 운전면허정보</td>
            <td style={S.td}>계약일로부터 5년</td>
          </tr>
          <tr>
            <td style={S.td}>국토교통부</td>
            <td style={S.td}>운전자격확인시스템(대여사업자 운전자격확인 의무)</td>
            <td style={S.td}>차량번호, 대여기간정보</td>
            <td style={S.td}>대여사업자 계정 탈퇴 요청 시까지</td>
          </tr>
          <tr>
            <td style={S.td}>국토교통부, 경찰청, 도로교통공단</td>
            <td style={S.td}>운전자격확인시스템(대여사업자 운전자격확인 의무)</td>
            <td style={S.td}>이름, 운전면허정보</td>
            <td style={S.td}>저장하지 않음</td>
          </tr>
        </tbody>
      </table>

      {/* ── 최종 동의 서명 ── */}
      <div style={{ marginTop: 20, textAlign: 'center', fontSize: 11, fontWeight: 600, color: '#374151' }}>
        상기 내용을 확인하고 동의하는 바 아래와 같이 서명합니다.
      </div>
      <div style={{ marginTop: 12, textAlign: 'right', display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 20 }}>
        {signatureUrl ? (
          <img src={signatureUrl} alt="서명" style={{ height: 40, objectFit: 'contain' }} />
        ) : (
          <span style={{ fontSize: 11, color: '#9ca3af', border: '1px dashed #d1d5db', padding: '8px 24px', borderRadius: 4 }}>서명 또는 (인)</span>
        )}
      </div>

      {/* 하단 */}
      <div style={{ position: 'absolute', bottom: '12mm', left: '14mm', right: '14mm', textAlign: 'center', fontSize: 10, color: '#6b7280' }}>
        2/2
      </div>
    </div>
  )
}
