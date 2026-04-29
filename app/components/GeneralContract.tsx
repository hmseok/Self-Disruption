import React from 'react'

// ★ Decimal 안전 캐스팅
const nf = (n: any) => (Number(n) || 0).toLocaleString()

export default function GeneralContract({ data, signatureUrl, mode = 'print' }: { data: any, signatureUrl?: string, mode?: 'print' | 'mobile' }) {
  const today = new Date()
  const isMobile = mode === 'mobile'

  const styles = {
    container: {
      backgroundColor: '#ffffff',
      color: '#222',
      fontFamily: '"Pretendard", sans-serif',
      width: isMobile ? '100%' : '210mm',
      minHeight: isMobile ? 'auto' : '297mm',
      padding: isMobile ? '20px' : '20mm',
      fontSize: isMobile ? '15px' : '12px',
      lineHeight: '1.6',
      margin: '0 auto',
      position: 'relative' as const,
      boxSizing: 'border-box' as const,
    },
    title: {
      fontSize: isMobile ? '22px' : '28px',
      fontWeight: '900',
      textAlign: 'center' as const,
      borderBottom: '3px solid #000',
      paddingBottom: '15px',
      marginBottom: '30px',
      wordBreak: 'keep-all' as const
    },
    section: { marginBottom: '20px' },
    subTitle: { fontSize: isMobile ? '17px' : '14px', fontWeight: 'bold', borderBottom: '1px solid #ddd', marginBottom: '8px', paddingBottom: '4px' },
    row: { display: 'flex', marginBottom: '6px' },
    label: { width: '90px', fontWeight: 'bold', color: '#555', flexShrink: 0 },
    value: { flex: 1, fontWeight: '600', wordBreak: 'keep-all' as const },
    content: { textAlign: 'justify' as const, marginBottom: '20px', wordBreak: 'keep-all' as const },
    footer: { marginTop: '50px', textAlign: 'center' as const },

    // 👇 [수정] 도장/서명 크기 확대 (현실감 Up)
    sealWrapper: {
        position: 'relative' as const,
        display: 'inline-block',
        marginLeft: '5px',
        width: '40px', // 글자 공간 확보
        textAlign: 'center' as const
    },
    sealImage: {
        position: 'absolute' as const,
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        // 📏 실제 도장(2.5~3cm) 느낌으로 키움
        height: '95px',
        width: 'auto',
        objectFit: 'contain' as const,
        opacity: 0.85,
        mixBlendMode: 'multiply' as const,
        pointerEvents: 'none' as const
    },
    signImage: {
        position: 'absolute' as const,
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        // ✍️ 서명도 시원하게 키움
        height: '70px',
        width: 'auto',
        objectFit: 'contain' as const,
        mixBlendMode: 'multiply' as const
    },
    dateText: {
        fontSize: '18px',
        fontWeight: 'bold',
        marginBottom: '40px',
        wordBreak: 'keep-all' as const,
        whiteSpace: 'nowrap' as const
    }
  }

  return (
    <div id="printable-area" style={styles.container}>
      <h1 style={styles.title}>표준 투자 계약서</h1>

      {/* 1. 당사자 표시 */}
      <div style={styles.section}>
        <div style={styles.subTitle}>1. 투자자 (갑)</div>
        <div style={styles.row}><span style={styles.label}>성명/상호</span> <span style={styles.value}>{data.investor_name}</span></div>
        <div style={styles.row}><span style={styles.label}>연락처</span> <span style={styles.value}>{data.investor_phone}</span></div>
        <div style={styles.row}><span style={styles.label}>주소</span> <span style={styles.value}>{data.investor_address}</span></div>
      </div>

      <div style={styles.section}>
        <div style={styles.subTitle}>2. 피투자자 (을)</div>
        <div style={styles.row}><span style={styles.label}>상호</span> <span style={styles.value}>(주)에프엠아이</span></div>
        <div style={styles.row}><span style={styles.label}>대표이사</span> <span style={styles.value}>박진숙</span></div>
        <div style={styles.row}><span style={styles.label}>주소</span> <span style={styles.value}>경기도 연천군 백동로236번길 190</span></div>
      </div>

      <p style={styles.content}>
        '갑'은 '을'의 사업 운영 및 확장을 위하여 자금을 투자하고, '을'은 이를 성실히 운용하여 원금과 약정된 수익금을 '갑'에게 지급할 것을 확약하며 다음과 같이 계약을 체결한다.
      </p>

      {/* 2. 계약 조건 */}
      <div style={styles.section}>
        <div style={styles.subTitle}>제1조 (투자금 및 기간)</div>
        <p>1. 투자 원금: <b>일금 {data.invest_amount ?  new Intl.NumberFormat('ko-KR', { style: 'currency', currency: 'KRW' }).format(data.invest_amount) : 0} 정</b></p>
        <p>2. 계약 기간: <b>{data.contract_start_date} ~ {data.contract_end_date}</b></p>
        <p style={{marginTop: '4px', color: '#666', fontSize: '0.9em'}}>
           ※ 본 계약은 1년 단위를 원칙으로 하며, 만기 시 당사자 간의 협의에 따라 연장할 수 있다.
        </p>
      </div>

      <div style={styles.section}>
        <div style={styles.subTitle}>제2조 (수익금 지급 및 상환)</div>
        <p>1. 수익률: 연 <b>{data.interest_rate}%</b> (월 지급식)</p>
        <p>2. 지급일: 매월 <b>{data.payment_day}일</b> (휴일인 경우 익영업일)</p>
        <p>3. 원금 상환: 계약 만기일에 전액 일시 상환한다.</p>
        <p style={{fontSize: '11px', color:'#666', marginTop:'5px'}}>└ 입금계좌: {data.bank_name} {data.account_number} ({data.account_holder})</p>
      </div>

      <div style={styles.section}>
        <div style={styles.subTitle}>제3조 (기한의 이익 상실)</div>
        <p>'을'이 수익금 지급을 2회 이상 연체하거나 파산 등의 사유가 발생한 경우, '갑'은 즉시 원리금 전액의 상환을 청구할 수 있다.</p>
      </div>

      {/* 3. 서명란 */}
      <div style={styles.footer}>
        <p style={{marginBottom: '30px'}}>위 계약을 증명하기 위하여 본 계약서를 작성하여 기명날인한다.</p>

        <p style={styles.dateText}>
            {today.getFullYear()}년 {today.getMonth() + 1}월 {today.getDate()}일
        </p>

        <div style={{display: 'flex', justifyContent: 'space-between', padding: isMobile ? '0' : '0 20px', gap: '20px'}}>

            {/* 갑: 투자자 */}
            <div style={{textAlign: 'left', width: isMobile ? '48%' : '45%'}}>
                <p style={{fontWeight:'bold', borderBottom:'1px solid #000', paddingBottom:'5px', marginBottom:'10px'}}>(갑) 투자자</p>
                <div style={{position:'relative', height:'60px', display:'flex', alignItems:'center'}}>
                    <span style={{marginRight:'5px', wordBreak:'keep-all'}}>{data.investor_name}</span>
                    <span style={styles.sealWrapper}>
                        (인)
                        {/* 서명 이미지 */}
                        {signatureUrl && <img src={signatureUrl} style={styles.signImage} alt="서명" />}
                    </span>
                </div>
            </div>

            {/* 을: 운용사 */}
            <div style={{textAlign: 'left', width: isMobile ? '48%' : '45%'}}>
                <p style={{fontWeight:'bold', borderBottom:'1px solid #000', paddingBottom:'5px', marginBottom:'10px'}}>(을) 피투자자</p>
                <div style={{position:'relative', height:'60px', display:'flex', alignItems:'center'}}>
                    <span style={{marginRight:'5px', wordBreak:'keep-all'}}>(주)에프엠아이 대표 박진숙</span>
                    <span style={styles.sealWrapper}>
                        (인)
                        {/* 회사 도장 이미지 */}
                        <img src="/stamp.png" style={styles.sealImage} alt="직인" />
                    </span>
                </div>
            </div>
        </div>
      </div>
    </div>
  )
}