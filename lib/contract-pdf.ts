/**
 * 계약서 PDF 생성 유틸리티
 * html2canvas + jsPDF 조합으로 클라이언트에서 한글 지원 PDF 생성
 */

import { jsPDF } from 'jspdf'
import html2canvas from 'html2canvas'

export interface ContractPdfData {
  // 계약 정보
  contractId: string
  contractNumber?: string        // 표시용 계약번호
  signedAt: string               // 서명 일시 ISO
  // 회사(임대인) 정보
  company: {
    name: string
    business_number?: string
    representative?: string
    address?: string
    phone?: string
    logo_url?: string
  }
  // 고객(임차인) 정보
  customer: {
    name: string
    phone?: string
    email?: string
    address?: string
  }
  // 차량 정보
  car: {
    brand: string
    model: string
    trim?: string
    year?: number
    fuel_type?: string
    number?: string             // 차량번호
    factory_price?: number
    engine_cc?: number
  }
  // 계약 조건
  terms: {
    contractType: 'return' | 'buyout'
    termMonths: number
    startDate: string
    endDate: string
    monthlyRent: number
    deposit: number
    prepayment: number
    annualMileage: number         // 만km
    excessMileageRate?: number    // 원/km
    maintPackage: string
    driverAgeGroup?: string
    deductible?: number           // 자차 면책금
    buyoutPrice?: number          // 인수가 (인수형)
  }
  // 서명 데이터
  signatureData?: string          // base64 PNG
  signatureIp?: string
  // 납부 스케줄 (선택)
  paymentSchedule?: Array<{
    round: number
    dueDate: string
    amount: number
    vat: number
  }>
  // 메모/특약사항
  specialTerms?: string
}

const f = (n: number | undefined | null) => (n ?? 0).toLocaleString('ko-KR')

/**
 * 계약서 HTML을 생성하는 함수 (PDF 변환 전 단계)
 * 숨겨진 div에 렌더링한 후 html2canvas로 캡처
 */
export function buildContractHtml(data: ContractPdfData): string {
  const { company, customer, car, terms, signatureData, signatureIp, paymentSchedule, specialTerms } = data
  const contractDate = new Date(data.signedAt)
  const dateStr = `${contractDate.getFullYear()}년 ${contractDate.getMonth() + 1}월 ${contractDate.getDate()}일`
  const contractNum = data.contractNumber || `SD-${contractDate.getFullYear()}${String(contractDate.getMonth() + 1).padStart(2, '0')}-${data.contractId.toString().slice(-4).padStart(4, '0')}`
  const totalMileage = terms.annualMileage * 10000 * (terms.termMonths / 12)
  const rentVAT = Math.round(terms.monthlyRent * 0.1)

  return `
<div style="font-family:'Pretendard','Noto Sans KR','맑은 고딕','Malgun Gothic',sans-serif;color:#111;font-size:11px;line-height:1.6;width:700px;padding:40px 50px;background:#fff;">

  <!-- ====== 1페이지: 표지 ====== -->
  <div style="text-align:center;padding:60px 0 40px;">
    ${company.logo_url ? `<img src="${company.logo_url}" style="max-height:48px;margin-bottom:16px;" />` : ''}
    <h1 style="font-size:22px;font-weight:900;margin:0 0 4px;letter-spacing:2px;">자동차 장기대여(렌트) 계약서</h1>
    <p style="font-size:11px;color:#888;margin:0;">Long-term Vehicle Lease Agreement</p>
    <div style="margin-top:24px;font-size:12px;color:#555;">
      <span style="font-weight:700;">계약번호</span> ${contractNum}
      &nbsp;&nbsp;|&nbsp;&nbsp;
      <span style="font-weight:700;">계약일자</span> ${dateStr}
    </div>
  </div>

  <!-- 당사자 정보 -->
  <table style="width:100%;border-collapse:collapse;margin:16px 0 24px;border:1.5px solid #333;">
    <tr style="background:#f8f9fa;">
      <td style="padding:10px 14px;font-weight:800;width:80px;border:1px solid #ddd;font-size:11px;text-align:center;background:#f1f3f5;">구 분</td>
      <td style="padding:10px 14px;font-weight:800;border:1px solid #ddd;font-size:11px;text-align:center;background:#f1f3f5;">상호(성명)</td>
      <td style="padding:10px 14px;font-weight:800;border:1px solid #ddd;font-size:11px;text-align:center;background:#f1f3f5;">사업자번호</td>
      <td style="padding:10px 14px;font-weight:800;border:1px solid #ddd;font-size:11px;text-align:center;background:#f1f3f5;">연락처</td>
      <td style="padding:10px 14px;font-weight:800;border:1px solid #ddd;font-size:11px;text-align:center;background:#f1f3f5;">주소</td>
    </tr>
    <tr>
      <td style="padding:8px 14px;font-weight:700;text-align:center;border:1px solid #ddd;background:#fafafa;">임대인</td>
      <td style="padding:8px 14px;border:1px solid #ddd;">${company.name}</td>
      <td style="padding:8px 14px;border:1px solid #ddd;">${company.business_number || '-'}</td>
      <td style="padding:8px 14px;border:1px solid #ddd;">${company.phone || '-'}</td>
      <td style="padding:8px 14px;border:1px solid #ddd;">${company.address || '-'}</td>
    </tr>
    <tr>
      <td style="padding:8px 14px;font-weight:700;text-align:center;border:1px solid #ddd;background:#fafafa;">임차인</td>
      <td style="padding:8px 14px;border:1px solid #ddd;">${customer.name}</td>
      <td style="padding:8px 14px;border:1px solid #ddd;">-</td>
      <td style="padding:8px 14px;border:1px solid #ddd;">${customer.phone || '-'}</td>
      <td style="padding:8px 14px;border:1px solid #ddd;">${customer.address || '-'}</td>
    </tr>
  </table>

  <!-- ====== 2페이지: 차량·계약 정보 ====== -->
  <h2 style="font-size:13px;font-weight:900;margin:28px 0 10px;padding-bottom:6px;border-bottom:2px solid #333;">1. 대여 차량 정보</h2>
  <table style="width:100%;border-collapse:collapse;border:1px solid #ddd;">
    <tr>
      <td style="padding:7px 12px;font-weight:700;width:120px;background:#f8f9fa;border:1px solid #ddd;">차 종</td>
      <td style="padding:7px 12px;border:1px solid #ddd;">${car.brand} ${car.model}${car.trim ? ` ${car.trim}` : ''}</td>
      <td style="padding:7px 12px;font-weight:700;width:120px;background:#f8f9fa;border:1px solid #ddd;">연 식</td>
      <td style="padding:7px 12px;border:1px solid #ddd;">${car.year || '-'}년</td>
    </tr>
    <tr>
      <td style="padding:7px 12px;font-weight:700;background:#f8f9fa;border:1px solid #ddd;">차량번호</td>
      <td style="padding:7px 12px;border:1px solid #ddd;">${car.number || '배정 예정'}</td>
      <td style="padding:7px 12px;font-weight:700;background:#f8f9fa;border:1px solid #ddd;">연 료</td>
      <td style="padding:7px 12px;border:1px solid #ddd;">${car.fuel_type || '-'}</td>
    </tr>
    <tr>
      <td style="padding:7px 12px;font-weight:700;background:#f8f9fa;border:1px solid #ddd;">출고가격</td>
      <td style="padding:7px 12px;border:1px solid #ddd;" colspan="3">${f(car.factory_price)}원</td>
    </tr>
  </table>

  <h2 style="font-size:13px;font-weight:900;margin:24px 0 10px;padding-bottom:6px;border-bottom:2px solid #333;">2. 계약 조건</h2>
  <table style="width:100%;border-collapse:collapse;border:1px solid #ddd;">
    <tr>
      <td style="padding:7px 12px;font-weight:700;width:120px;background:#f8f9fa;border:1px solid #ddd;">계약유형</td>
      <td style="padding:7px 12px;border:1px solid #ddd;font-weight:700;">${terms.contractType === 'buyout' ? '인수형 장기렌트' : '반납형 장기렌트'}</td>
      <td style="padding:7px 12px;font-weight:700;width:120px;background:#f8f9fa;border:1px solid #ddd;">계약기간</td>
      <td style="padding:7px 12px;border:1px solid #ddd;">${terms.termMonths}개월 (${terms.startDate} ~ ${terms.endDate})</td>
    </tr>
    <tr>
      <td style="padding:7px 12px;font-weight:700;background:#f8f9fa;border:1px solid #ddd;">월 렌탈료</td>
      <td style="padding:7px 12px;border:1px solid #ddd;"><strong style="font-size:13px;">${f(terms.monthlyRent)}원</strong> <span style="color:#888;">(VAT 별도 ${f(rentVAT)}원, 합계 ${f(terms.monthlyRent + rentVAT)}원)</span></td>
      <td style="padding:7px 12px;font-weight:700;background:#f8f9fa;border:1px solid #ddd;">보증금</td>
      <td style="padding:7px 12px;border:1px solid #ddd;">${terms.deposit > 0 ? f(terms.deposit) + '원' : '없음'}</td>
    </tr>
    <tr>
      <td style="padding:7px 12px;font-weight:700;background:#f8f9fa;border:1px solid #ddd;">선납금</td>
      <td style="padding:7px 12px;border:1px solid #ddd;">${terms.prepayment > 0 ? f(terms.prepayment) + '원' : '없음'}</td>
      <td style="padding:7px 12px;font-weight:700;background:#f8f9fa;border:1px solid #ddd;">약정주행</td>
      <td style="padding:7px 12px;border:1px solid #ddd;">연 ${f(terms.annualMileage * 10000)}km (총 ${f(Math.round(totalMileage))}km)</td>
    </tr>
    <tr>
      <td style="padding:7px 12px;font-weight:700;background:#f8f9fa;border:1px solid #ddd;">초과주행단가</td>
      <td style="padding:7px 12px;border:1px solid #ddd;">${terms.excessMileageRate ? f(terms.excessMileageRate) + '원/km' : '별도 협의'}</td>
      <td style="padding:7px 12px;font-weight:700;background:#f8f9fa;border:1px solid #ddd;">정비상품</td>
      <td style="padding:7px 12px;border:1px solid #ddd;">${{'self':'자가정비','oil_only':'오일류만','basic':'기본정비','full':'완전정비'}[terms.maintPackage] || terms.maintPackage}</td>
    </tr>
    ${terms.contractType === 'buyout' && terms.buyoutPrice ? `
    <tr>
      <td style="padding:7px 12px;font-weight:700;background:#f8f9fa;border:1px solid #ddd;">만기 인수가격</td>
      <td style="padding:7px 12px;border:1px solid #ddd;" colspan="3"><strong>${f(terms.buyoutPrice)}원</strong> (VAT 별도)</td>
    </tr>` : ''}
    ${terms.deductible !== undefined ? `
    <tr>
      <td style="padding:7px 12px;font-weight:700;background:#f8f9fa;border:1px solid #ddd;">자차 면책금</td>
      <td style="padding:7px 12px;border:1px solid #ddd;" colspan="3">${terms.deductible === 0 ? '완전자차 (면책금 0원)' : f(terms.deductible) + '원'}</td>
    </tr>` : ''}
  </table>

  <!-- ====== 3페이지: 약관 ====== -->
  <div style="page-break-before:always;"></div>
  <h2 style="font-size:13px;font-weight:900;margin:8px 0 10px;padding-bottom:6px;border-bottom:2px solid #333;">3. 자동차 장기대여 약관</h2>
  <div id="terms-section" style="font-size:9.5px;line-height:1.55;color:#333;">
    <!-- 약관은 별도 렌더링 -->
  </div>

  <!-- ====== 4페이지: 특약 + 서명 ====== -->
  <div style="page-break-before:always;"></div>
  <h2 style="font-size:13px;font-weight:900;margin:8px 0 10px;padding-bottom:6px;border-bottom:2px solid #333;">4. 특약사항</h2>
  <div style="min-height:60px;padding:10px 14px;border:1px solid #ddd;border-radius:4px;font-size:10px;color:#555;margin-bottom:24px;">
    ${specialTerms || (terms.contractType === 'buyout'
      ? '본 계약은 인수형 장기렌트 계약으로, 계약 만기 시 고객은 상기 명시된 인수가격을 납부하고 차량 소유권을 이전받을 수 있습니다.'
      : '본 계약은 반납형 장기렌트 계약으로, 계약 만기 시 차량을 회사에 반납하여야 합니다.'
    )}
  </div>

  <h2 style="font-size:13px;font-weight:900;margin:24px 0 10px;padding-bottom:6px;border-bottom:2px solid #333;">5. 계약 당사자 서명</h2>
  <p style="font-size:10px;color:#555;margin-bottom:16px;">
    위 계약 내용을 충분히 확인하였으며, 약관 및 개인정보 수집·이용에 동의합니다.
  </p>

  <table style="width:100%;border-collapse:collapse;">
    <tr>
      <td style="width:50%;vertical-align:top;padding-right:20px;">
        <div style="border:1px solid #ddd;border-radius:8px;padding:16px;min-height:120px;">
          <p style="font-size:10px;font-weight:700;color:#888;margin:0 0 8px;">임대인 (회사)</p>
          <p style="font-size:12px;font-weight:800;margin:0 0 4px;">${company.name}</p>
          <p style="font-size:10px;color:#888;margin:0;">${company.representative ? `대표이사 ${company.representative}` : ''}</p>
          <div style="text-align:center;margin-top:12px;">
            <span style="font-size:10px;color:#ccc;">(직인)</span>
          </div>
        </div>
      </td>
      <td style="width:50%;vertical-align:top;">
        <div style="border:1px solid #ddd;border-radius:8px;padding:16px;min-height:120px;">
          <p style="font-size:10px;font-weight:700;color:#888;margin:0 0 8px;">임차인 (고객)</p>
          <p style="font-size:12px;font-weight:800;margin:0 0 4px;">${customer.name}</p>
          <p style="font-size:10px;color:#888;margin:0;">${customer.phone || ''}</p>
          ${signatureData ? `
            <div style="text-align:center;margin-top:8px;">
              <img src="${signatureData}" style="max-width:200px;max-height:60px;" />
            </div>
          ` : '<div style="text-align:center;margin-top:12px;"><span style="font-size:10px;color:#ccc;">(전자서명)</span></div>'}
        </div>
      </td>
    </tr>
  </table>

  <div style="margin-top:16px;padding:10px 14px;background:#f8f9fa;border-radius:6px;font-size:9px;color:#888;line-height:1.5;">
    <p style="margin:0;">본 전자계약서는 전자서명법 제3조 및 전자문서 및 전자거래 기본법에 의거하여 자필서명과 동일한 법적 효력을 가집니다.</p>
    <p style="margin:4px 0 0;">서명 일시: ${new Date(data.signedAt).toLocaleString('ko-KR')}${signatureIp ? ` | IP: ${signatureIp}` : ''}</p>
  </div>

  ${paymentSchedule && paymentSchedule.length > 0 ? `
  <!-- ====== 5페이지: 납부 스케줄 ====== -->
  <h2 style="font-size:13px;font-weight:900;margin:28px 0 10px;padding-bottom:6px;border-bottom:2px solid #333;page-break-before:always;">6. 납부 스케줄</h2>
  <table style="width:100%;border-collapse:collapse;border:1px solid #ddd;font-size:9.5px;">
    <tr style="background:#f1f3f5;">
      <th style="padding:6px 8px;border:1px solid #ddd;font-weight:700;text-align:center;">회차</th>
      <th style="padding:6px 8px;border:1px solid #ddd;font-weight:700;text-align:center;">납부일</th>
      <th style="padding:6px 8px;border:1px solid #ddd;font-weight:700;text-align:right;">렌탈료</th>
      <th style="padding:6px 8px;border:1px solid #ddd;font-weight:700;text-align:right;">VAT</th>
      <th style="padding:6px 8px;border:1px solid #ddd;font-weight:700;text-align:right;">합계</th>
    </tr>
    ${paymentSchedule.map(p => `
    <tr>
      <td style="padding:5px 8px;border:1px solid #eee;text-align:center;">${p.round === 0 ? '보증금' : p.round + '회'}</td>
      <td style="padding:5px 8px;border:1px solid #eee;text-align:center;">${p.dueDate}</td>
      <td style="padding:5px 8px;border:1px solid #eee;text-align:right;">${f(p.amount - p.vat)}</td>
      <td style="padding:5px 8px;border:1px solid #eee;text-align:right;">${f(p.vat)}</td>
      <td style="padding:5px 8px;border:1px solid #eee;text-align:right;font-weight:700;">${f(p.amount)}</td>
    </tr>`).join('')}
  </table>
  ` : ''}

  <!-- 푸터 -->
  <div style="margin-top:40px;padding-top:12px;border-top:1px solid #eee;text-align:center;font-size:8px;color:#bbb;">
    ${company.name}${company.business_number ? ` | 사업자번호 ${company.business_number}` : ''}${company.address ? ` | ${company.address}` : ''}
  </div>
</div>
`
}


/**
 * HTML 요소를 PDF로 변환
 * @param element - 렌더링된 DOM 요소
 * @param filename - 다운로드 파일명
 */
export async function generatePdfFromElement(element: HTMLElement, filename: string): Promise<Blob> {
  // 1. HTML → Canvas
  const canvas = await html2canvas(element, {
    scale: 2,                    // 고해상도
    useCORS: true,               // 외부 이미지(로고) 허용
    allowTaint: true,
    backgroundColor: '#ffffff',
    width: element.scrollWidth,
    height: element.scrollHeight,
    logging: false,
  })

  // 2. Canvas → PDF (A4)
  const imgData = canvas.toDataURL('image/png')
  const pdf = new jsPDF('p', 'mm', 'a4')
  const pdfW = pdf.internal.pageSize.getWidth()
  const pdfH = pdf.internal.pageSize.getHeight()

  const imgW = pdfW
  const imgH = (canvas.height * imgW) / canvas.width

  // 여러 페이지 분할 (페이지 간 1px 오버랩으로 경계선 제거)
  const totalPages = Math.ceil(imgH / pdfH)

  for (let page = 0; page < totalPages; page++) {
    if (page > 0) pdf.addPage()

    // 각 페이지의 캔버스 영역을 별도 잘라서 추가 (경계 아티팩트 방지)
    const srcY = (page * pdfH * canvas.width) / imgW
    const srcH = Math.min((pdfH * canvas.width) / imgW, canvas.height - srcY)
    if (srcH <= 0) break

    const pageCanvas = document.createElement('canvas')
    pageCanvas.width = canvas.width
    pageCanvas.height = Math.ceil(srcH)
    const ctx = pageCanvas.getContext('2d')!
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, pageCanvas.width, pageCanvas.height)
    ctx.drawImage(canvas, 0, srcY, canvas.width, srcH, 0, 0, canvas.width, srcH)

    const pageImgData = pageCanvas.toDataURL('image/png')
    const pageImgH = (srcH * imgW) / canvas.width
    pdf.addImage(pageImgData, 'PNG', 0, 0, imgW, pageImgH)
  }

  return pdf.output('blob')
}

/**
 * 계약서 PDF 생성 → Blob 반환 (다운로드 또는 이메일 첨부용)
 */
export async function generateContractPdf(
  data: ContractPdfData,
  termsHtml: string,
): Promise<{ blob: Blob; filename: string }> {
  // 1. 숨겨진 컨테이너 생성
  const container = document.createElement('div')
  container.style.position = 'fixed'
  container.style.left = '-9999px'
  container.style.top = '0'
  container.style.zIndex = '-1'
  document.body.appendChild(container)

  try {
    // 2. HTML 렌더링
    container.innerHTML = buildContractHtml(data)

    // 3. 약관 섹션 채우기
    const termsSection = container.querySelector('#terms-section')
    if (termsSection) {
      termsSection.innerHTML = termsHtml
    }

    // 4. 렌더링 대기
    await new Promise(resolve => setTimeout(resolve, 500))

    // 5. PDF 생성
    const firstChild = container.firstElementChild as HTMLElement
    const blob = await generatePdfFromElement(firstChild, '')

    const contractDate = new Date(data.signedAt)
    const datePrefix = `${contractDate.getFullYear()}${String(contractDate.getMonth() + 1).padStart(2, '0')}${String(contractDate.getDate()).padStart(2, '0')}`
    const filename = `계약서_${data.customer.name}_${data.car.brand}${data.car.model}_${datePrefix}.pdf`

    return { blob, filename }
  } finally {
    document.body.removeChild(container)
  }
}

/**
 * 약관 조항 배열 → HTML 문자열
 */
export function renderTermsHtml(
  terms: Array<{ title: string; content: string }>,
  addendum?: string,
  esignNotice?: string,
): string {
  let html = terms
    .map(
      t =>
        `<div style="margin-bottom:8px;page-break-inside:avoid;break-inside:avoid;">
          <p style="font-weight:700;margin:0 0 2px;font-size:10px;">${t.title}</p>
          <p style="margin:0;white-space:pre-line;">${t.content}</p>
        </div>`,
    )
    .join('')

  if (addendum) {
    html += `<div style="margin-top:12px;padding:8px 12px;background:#fffbe6;border:1px solid #ffe58f;border-radius:4px;font-size:9.5px;">
      <p style="font-weight:700;margin:0 0 2px;">부속 약관 (계약유형별)</p>
      <p style="margin:0;">${addendum}</p>
    </div>`
  }

  if (esignNotice) {
    html += `<div style="margin-top:8px;padding:8px 12px;background:#f0f5ff;border:1px solid #adc6ff;border-radius:4px;font-size:9px;color:#555;">
      <p style="margin:0;">${esignNotice}</p>
    </div>`
  }

  return html
}
