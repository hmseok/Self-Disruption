// ════════════════════════════════════════════════════════════════════
// 롯데렌터카 단기 공식 요금표 (2025.02.10 기준, 내륙 · 전체 차종)
//
// PR-N7 (2026-05-24) — operations 청구관리의 청구금액 산출에 사용.
// 출처: app/quotes/short-term/ShortTermReplacementBuilder.tsx 의 LOTTE_DEFAULT_DATA
//   (단기 견적 계산기). 차종군 × 기간구간 일요금. 추후 계산기도 본 모듈로 통일 권장.
//
// 산식 (계산기 qcResult 발췌):
//   · 일수 → 구간: 1~3일 / 4일 / 5~6일 / 7일+  (길수록 일요금 저렴)
//   · 금액 = 구간 일요금 × 일수
//   · 롯데 요금은 VAT 포함가 → 공급가 = 금액 / 1.1
// ════════════════════════════════════════════════════════════════════

export type LotteShortTermRate = {
  category: string        // 차종군
  vehicle_names: string   // 해당 차종 목록
  rate_1_3days: number    // 1~3일 일요금
  rate_4days: number      // 4일 일요금
  rate_5_6days: number    // 5~6일 일요금
  rate_7plus_days: number // 7일+ 일요금
}

export const LOTTE_SHORT_TERM_RATES: LotteShortTermRate[] = [
  { category: '경차', vehicle_names: '스파크(G) ~22년식, 모닝(G) ~24년식', rate_1_3days: 115000, rate_4days: 103500, rate_5_6days: 97800, rate_7plus_days: 92000 },
  { category: '경차', vehicle_names: '레이(G) ~23년식', rate_1_3days: 120000, rate_4days: 108000, rate_5_6days: 102000, rate_7plus_days: 96000 },
  { category: '경차', vehicle_names: '캐스퍼(G) ~24년식', rate_1_3days: 130000, rate_4days: 117000, rate_5_6days: 110500, rate_7plus_days: 104000 },
  { category: '소형', vehicle_names: '아반떼(G) 24년식', rate_1_3days: 143000, rate_4days: 128700, rate_5_6days: 121600, rate_7plus_days: 114400 },
  { category: '소형', vehicle_names: '아반떼(H) 24년식', rate_1_3days: 175000, rate_4days: 157500, rate_5_6days: 148800, rate_7plus_days: 140000 },
  { category: '중형', vehicle_names: '쏘나타(G) 24년식, K5(G) 24년식', rate_1_3days: 197000, rate_4days: 177300, rate_5_6days: 167500, rate_7plus_days: 157600 },
  { category: '중형', vehicle_names: '쏘나타(H) 24년식', rate_1_3days: 233000, rate_4days: 209700, rate_5_6days: 193800, rate_7plus_days: 177700 },
  { category: '중형', vehicle_names: 'G70 2.0(G) ~23년식', rate_1_3days: 360000, rate_4days: 324000, rate_5_6days: 306000, rate_7plus_days: 288000 },
  { category: '준대형', vehicle_names: 'K8 2.5(G) ~24년식', rate_1_3days: 324000, rate_4days: 291600, rate_5_6days: 275400, rate_7plus_days: 259200 },
  { category: '준대형', vehicle_names: '그랜저 2.5(G) ~24년식, K8 1.6(H) ~24년식', rate_1_3days: 340000, rate_4days: 306000, rate_5_6days: 289000, rate_7plus_days: 272000 },
  { category: '준대형', vehicle_names: 'G70 2.5(G) 24년식', rate_1_3days: 360000, rate_4days: 324000, rate_5_6days: 306000, rate_7plus_days: 288000 },
  { category: '준대형', vehicle_names: '그랜저 3.5(G) ~23년식, 그랜저 3.5(L) ~23년식', rate_1_3days: 380000, rate_4days: 342000, rate_5_6days: 323000, rate_7plus_days: 304000 },
  { category: '대형', vehicle_names: 'G80 2.5(G) ~25년식, K9 3.3(G) ~22년식', rate_1_3days: 449000, rate_4days: 404100, rate_5_6days: 381700, rate_7plus_days: 359200 },
  { category: '대형', vehicle_names: 'G80 3.5(G) ~24년식, K9 3.8(G) ~24년식', rate_1_3days: 502000, rate_4days: 451800, rate_5_6days: 426700, rate_7plus_days: 401600 },
  { category: '대형', vehicle_names: 'G90 3.5(G) ~24년식', rate_1_3days: 537000, rate_4days: 483300, rate_5_6days: 456500, rate_7plus_days: 429600 },
  { category: '대형', vehicle_names: 'G90 5.0(G) ~21년식', rate_1_3days: 654000, rate_4days: 588600, rate_5_6days: 555900, rate_7plus_days: 523200 },
  { category: '대형', vehicle_names: 'G90 3.5(G) 롱휠베이스 ~23년식', rate_1_3days: 710000, rate_4days: 639000, rate_5_6days: 603500, rate_7plus_days: 568000 },
  { category: '승합', vehicle_names: '스타렉스 11·12인승(D) ~21년식', rate_1_3days: 276000, rate_4days: 248000, rate_5_6days: 229600, rate_7plus_days: 210400 },
  { category: '승합', vehicle_names: '스타리아 11인승(D) ~24년식', rate_1_3days: 313000, rate_4days: 281700, rate_5_6days: 260400, rate_7plus_days: 238700 },
  { category: '승합', vehicle_names: '카니발 9인승(D) ~24년식', rate_1_3days: 336000, rate_4days: 302300, rate_5_6days: 279600, rate_7plus_days: 256300 },
  { category: '승합', vehicle_names: '스타리아 11인승(H) 24년식', rate_1_3days: 339000, rate_4days: 305100, rate_5_6days: 288200, rate_7plus_days: 271200 },
  { category: '승합', vehicle_names: '카니발 9인승(H) 24년식', rate_1_3days: 363000, rate_4days: 326700, rate_5_6days: 308600, rate_7plus_days: 290400 },
  { category: '승합', vehicle_names: '스타리아 9인승(H) 24년식', rate_1_3days: 368000, rate_4days: 331200, rate_5_6days: 312800, rate_7plus_days: 294400 },
  { category: '승합', vehicle_names: '카니발 9인승 하이리무진(D) ~23년식', rate_1_3days: 457000, rate_4days: 411300, rate_5_6days: 380200, rate_7plus_days: 348570 },
  { category: '승합', vehicle_names: '카니발 9인승 하이리무진(H) 24년식', rate_1_3days: 529000, rate_4days: 476100, rate_5_6days: 449700, rate_7plus_days: 423200 },
  { category: '승합', vehicle_names: '쏠라티 15인승(D) ~23년식', rate_1_3days: 648000, rate_4days: 583200, rate_5_6days: 550800, rate_7plus_days: 518400 },
  { category: 'SUV·RV(소형)', vehicle_names: '코나(G) ~24년식, 니로(H) ~24년식, 셀토스(G) ~24년식', rate_1_3days: 217000, rate_4days: 195300, rate_5_6days: 184500, rate_7plus_days: 173600 },
  { category: 'SUV·RV(중형)', vehicle_names: '스포티지(D,G,H) ~24년식, 투싼(G,H) ~23년식', rate_1_3days: 262000, rate_4days: 235800, rate_5_6days: 222700, rate_7plus_days: 209600 },
  { category: 'SUV·RV(중형)', vehicle_names: '쏘렌토(D,G,H) ~23년식, 토레스(G) ~24년식', rate_1_3days: 293000, rate_4days: 263700, rate_5_6days: 249100, rate_7plus_days: 234400 },
  { category: 'SUV·RV(중형)', vehicle_names: '싼타페(G,H) 24년식, 쏘렌토(G,H) 24년식', rate_1_3days: 330000, rate_4days: 297000, rate_5_6days: 280500, rate_7plus_days: 264000 },
  { category: 'SUV·RV(중형)', vehicle_names: '팰리세이드(D) ~23년식', rate_1_3days: 402000, rate_4days: 361800, rate_5_6days: 341700, rate_7plus_days: 321600 },
  { category: 'SUV·RV(중형)', vehicle_names: 'GV70(D,G) ~24년식', rate_1_3days: 469000, rate_4days: 422100, rate_5_6days: 398700, rate_7plus_days: 375200 },
  { category: 'SUV·RV(중형)', vehicle_names: 'GV80(D,G) ~24년식', rate_1_3days: 529000, rate_4days: 476100, rate_5_6days: 449700, rate_7plus_days: 423200 },
  { category: '수입차', vehicle_names: 'MINI COOPER, BENZ A220, JEEP RENEGADE', rate_1_3days: 395000, rate_4days: 355500, rate_5_6days: 335800, rate_7plus_days: 316000 },
  { category: '수입차', vehicle_names: 'MINI COOPER S, VOLKSWAGEN TIGUAN', rate_1_3days: 422000, rate_4days: 379800, rate_5_6days: 358700, rate_7plus_days: 337600 },
  { category: '수입차', vehicle_names: 'AUDI Q3, BMW 320D, BENZ EQA·C200, FORD EXPLORER', rate_1_3days: 505000, rate_4days: 454500, rate_5_6days: 429300, rate_7plus_days: 404000 },
  { category: '수입차', vehicle_names: 'AUDI A6, BMW 520D·523D·520I·530I, BENZ C300·E200·E220·E250·E300, LEXUS ES300H, VOLVO XC60', rate_1_3days: 575000, rate_4days: 517500, rate_5_6days: 488800, rate_7plus_days: 460000 },
  { category: '수입차', vehicle_names: 'AUDI A5 CABRIOLET·A7, BENZ CLE200 CABRIOLET', rate_1_3days: 590000, rate_4days: 531000, rate_5_6days: 501500, rate_7plus_days: 472000 },
  { category: '수입차', vehicle_names: 'BENZ E350, GLE300D', rate_1_3days: 631500, rate_4days: 568400, rate_5_6days: 536800, rate_7plus_days: 505200 },
  { category: '수입차', vehicle_names: 'BMW 550I, M3', rate_1_3days: 660000, rate_4days: 594000, rate_5_6days: 561000, rate_7plus_days: 528000 },
  { category: '수입차', vehicle_names: 'BENZ GLC300·GLC220D, BMW X3·X4', rate_1_3days: 665400, rate_4days: 598900, rate_5_6days: 565600, rate_7plus_days: 532300 },
  { category: '수입차', vehicle_names: 'BENZ CLS 300·CLS 450', rate_1_3days: 688000, rate_4days: 619200, rate_5_6days: 584800, rate_7plus_days: 550400 },
  { category: '수입차', vehicle_names: 'BMW X5·X6, RANGE ROVER VELAR', rate_1_3days: 703000, rate_4days: 632700, rate_5_6days: 597600, rate_7plus_days: 562400 },
  { category: '수입차', vehicle_names: 'BMW X7, BENZ GLE450·GLS400D', rate_1_3days: 766000, rate_4days: 689400, rate_5_6days: 651100, rate_7plus_days: 612800 },
  { category: '수입차', vehicle_names: 'AUDI Q7, BENZ SPRINTER', rate_1_3days: 810000, rate_4days: 729000, rate_5_6days: 688500, rate_7plus_days: 648000 },
  { category: '수입차', vehicle_names: 'BENZ S500', rate_1_3days: 1027000, rate_4days: 924300, rate_5_6days: 873000, rate_7plus_days: 821600 },
  { category: '전기차', vehicle_names: '코나EV ~24년식, 니로EV ~24년식', rate_1_3days: 208000, rate_4days: 187200, rate_5_6days: 176800, rate_7plus_days: 166400 },
  { category: '전기차', vehicle_names: '아이오닉5 2WD ~23년식, EV6 2WD ~23년식', rate_1_3days: 230000, rate_4days: 207000, rate_5_6days: 195500, rate_7plus_days: 184000 },
  { category: '전기차', vehicle_names: 'EV6 4WD ~23년식, 아이오닉5 4WD ~23년식', rate_1_3days: 310000, rate_4days: 279000, rate_5_6days: 263500, rate_7plus_days: 248000 },
  { category: '전기차', vehicle_names: '아이오닉6 ~23년식', rate_1_3days: 350000, rate_4days: 315000, rate_5_6days: 297500, rate_7plus_days: 280000 },
  { category: '전기차', vehicle_names: 'GV60 ~22년식', rate_1_3days: 448000, rate_4days: 403200, rate_5_6days: 380800, rate_7plus_days: 358400 },
  { category: '전기차', vehicle_names: 'GV70EV 22년식, EV9 24년식, TESLA MODEL 3', rate_1_3days: 472000, rate_4days: 424800, rate_5_6days: 401200, rate_7plus_days: 377600 },
  { category: '전기차', vehicle_names: 'G80EV ~24년식, TESLA MODEL Y', rate_1_3days: 527000, rate_4days: 474300, rate_5_6days: 448000, rate_7plus_days: 421600 },
  { category: '전기차', vehicle_names: 'TESLA MODEL X', rate_1_3days: 766000, rate_4days: 689400, rate_5_6days: 651100, rate_7plus_days: 612800 },
]

type DayRateField = 'rate_1_3days' | 'rate_4days' | 'rate_5_6days' | 'rate_7plus_days'

// 일수 → 요율 구간
export function lotteDayTier(days: number): { field: DayRateField; label: string } {
  if (days >= 7) return { field: 'rate_7plus_days', label: '7일+' }
  if (days >= 5) return { field: 'rate_5_6days', label: '5~6일' }
  if (days === 4) return { field: 'rate_4days', label: '4일' }
  return { field: 'rate_1_3days', label: '1~3일' }
}

export type LotteClaimResult = {
  days: number
  tierLabel: string
  dailyRate: number
  total: number   // VAT 포함 청구금액
  supply: number  // 공급가액
  vat: number
}

// 청구금액 산출 — 차종 요율 + 일수 → VAT 포함 금액
export function computeLotteClaim(rate: LotteShortTermRate, daysInput: number): LotteClaimResult {
  const days = Math.max(1, Math.floor(daysInput || 0))
  const tier = lotteDayTier(days)
  const dailyRate = rate[tier.field]
  const total = dailyRate * days
  const supply = Math.round(total / 1.1)
  return { days, tierLabel: tier.label, dailyRate, total, supply, vat: total - supply }
}
