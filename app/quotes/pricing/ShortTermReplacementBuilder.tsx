'use client'
import { supabase } from '../../utils/supabase'
import { useApp } from '../../context/AppContext'
import { useEffect, useState, useMemo, useCallback } from 'react'

// ─── 타입 ───
interface LotteRate {
  id?: string
  lotte_category: string
  vehicle_names: string
  rate_6hrs: number
  rate_10hrs: number
  rate_1_3days: number
  rate_4days: number
  rate_5_6days: number
  rate_7plus_days: number
  service_group: string
  sort_order: number
  effective_date?: string
  updated_at?: string
}

interface RateRow {
  id?: string
  service_group: string
  vehicle_class: string
  displacement_range: string
  daily_rate: number
  lotte_base_rate: number
  discount_percent: number
  calc_method: string
  sort_order: number
  is_active: boolean
}

interface QuoteRow {
  id: string
  quote_number: string
  customer_name: string
  customer_phone: string
  quote_detail: any
  contract_period: string
  discount_percent: number
  status: string
  expires_at: string
  created_at: string
}

// ─── 롯데렌터카 공식 요금 (2025.02.10 기준, 내륙 · 전체 차종) ───
const LOTTE_DEFAULT_DATA: Omit<LotteRate, 'id'>[] = [
  // 경차 (1군)
  { lotte_category: '경차', vehicle_names: '스파크(G) ~22년식, 모닝(G) ~24년식', rate_6hrs: 69000, rate_10hrs: 92000, rate_1_3days: 115000, rate_4days: 103500, rate_5_6days: 97800, rate_7plus_days: 92000, service_group: '1군', sort_order: 1 },
  { lotte_category: '경차', vehicle_names: '레이(G) ~23년식', rate_6hrs: 72000, rate_10hrs: 96000, rate_1_3days: 120000, rate_4days: 108000, rate_5_6days: 102000, rate_7plus_days: 96000, service_group: '1군', sort_order: 2 },
  { lotte_category: '경차', vehicle_names: '캐스퍼(G) ~24년식', rate_6hrs: 78000, rate_10hrs: 104000, rate_1_3days: 130000, rate_4days: 117000, rate_5_6days: 110500, rate_7plus_days: 104000, service_group: '1군', sort_order: 3 },

  // 소형 (2군)
  { lotte_category: '소형', vehicle_names: '아반떼(G) 24년식', rate_6hrs: 86000, rate_10hrs: 114000, rate_1_3days: 143000, rate_4days: 128700, rate_5_6days: 121600, rate_7plus_days: 114400, service_group: '2군', sort_order: 4 },
  { lotte_category: '소형', vehicle_names: '아반떼(H) 24년식', rate_6hrs: 105000, rate_10hrs: 140000, rate_1_3days: 175000, rate_4days: 157500, rate_5_6days: 148800, rate_7plus_days: 140000, service_group: '2군', sort_order: 5 },

  // 중형 (3군)
  { lotte_category: '중형', vehicle_names: '쏘나타(G) 24년식, K5(G) 24년식', rate_6hrs: 118000, rate_10hrs: 158000, rate_1_3days: 197000, rate_4days: 177300, rate_5_6days: 167500, rate_7plus_days: 157600, service_group: '3군', sort_order: 6 },
  { lotte_category: '중형', vehicle_names: '쏘나타(H) 24년식', rate_6hrs: 140000, rate_10hrs: 186000, rate_1_3days: 233000, rate_4days: 209700, rate_5_6days: 193800, rate_7plus_days: 177700, service_group: '3군', sort_order: 7 },
  { lotte_category: '중형', vehicle_names: 'G70 2.0(G) ~23년식', rate_6hrs: 216000, rate_10hrs: 288000, rate_1_3days: 360000, rate_4days: 324000, rate_5_6days: 306000, rate_7plus_days: 288000, service_group: '3군', sort_order: 8 },

  // 준대형 (4군)
  { lotte_category: '준대형', vehicle_names: 'K8 2.5(G) ~24년식', rate_6hrs: 194000, rate_10hrs: 259000, rate_1_3days: 324000, rate_4days: 291600, rate_5_6days: 275400, rate_7plus_days: 259200, service_group: '4군', sort_order: 9 },
  { lotte_category: '준대형', vehicle_names: '그랜저 2.5(G) ~24년식, K8 1.6(H) ~24년식', rate_6hrs: 204000, rate_10hrs: 272000, rate_1_3days: 340000, rate_4days: 306000, rate_5_6days: 289000, rate_7plus_days: 272000, service_group: '4군', sort_order: 10 },
  { lotte_category: '준대형', vehicle_names: 'G70 2.5(G) 24년식', rate_6hrs: 216000, rate_10hrs: 288000, rate_1_3days: 360000, rate_4days: 324000, rate_5_6days: 306000, rate_7plus_days: 288000, service_group: '4군', sort_order: 11 },
  { lotte_category: '준대형', vehicle_names: '그랜저 3.5(G) ~23년식, 그랜저 3.5(L) ~23년식', rate_6hrs: 228000, rate_10hrs: 304000, rate_1_3days: 380000, rate_4days: 342000, rate_5_6days: 323000, rate_7plus_days: 304000, service_group: '4군', sort_order: 12 },

  // 대형 (5군, 6군)
  { lotte_category: '대형', vehicle_names: 'G80 2.5(G) ~25년식, K9 3.3(G) ~22년식', rate_6hrs: 269000, rate_10hrs: 359000, rate_1_3days: 449000, rate_4days: 404100, rate_5_6days: 381700, rate_7plus_days: 359200, service_group: '5군', sort_order: 13 },
  { lotte_category: '대형', vehicle_names: 'G80 3.5(G) ~24년식, K9 3.8(G) ~24년식', rate_6hrs: 301000, rate_10hrs: 402000, rate_1_3days: 502000, rate_4days: 451800, rate_5_6days: 426700, rate_7plus_days: 401600, service_group: '5군', sort_order: 14 },
  { lotte_category: '대형', vehicle_names: 'G90 3.5(G) ~24년식', rate_6hrs: 322000, rate_10hrs: 430000, rate_1_3days: 537000, rate_4days: 483300, rate_5_6days: 456500, rate_7plus_days: 429600, service_group: '6군', sort_order: 15 },
  { lotte_category: '대형', vehicle_names: 'G90 5.0(G) ~21년식', rate_6hrs: 392000, rate_10hrs: 523000, rate_1_3days: 654000, rate_4days: 588600, rate_5_6days: 555900, rate_7plus_days: 523200, service_group: '6군', sort_order: 16 },
  { lotte_category: '대형', vehicle_names: 'G90 3.5(G) 롱휠베이스 ~23년식', rate_6hrs: 426000, rate_10hrs: 568000, rate_1_3days: 710000, rate_4days: 639000, rate_5_6days: 603500, rate_7plus_days: 568000, service_group: '6군', sort_order: 17 },

  // 승합 (9군)
  { lotte_category: '승합', vehicle_names: '스타렉스 11·12인승(D) ~21년식', rate_6hrs: 166000, rate_10hrs: 221000, rate_1_3days: 276000, rate_4days: 248000, rate_5_6days: 229600, rate_7plus_days: 210400, service_group: '9군', sort_order: 18 },
  { lotte_category: '승합', vehicle_names: '스타리아 11인승(D) ~24년식', rate_6hrs: 188000, rate_10hrs: 250000, rate_1_3days: 313000, rate_4days: 281700, rate_5_6days: 260400, rate_7plus_days: 238700, service_group: '9군', sort_order: 19 },
  { lotte_category: '승합', vehicle_names: '카니발 9인승(D) ~24년식', rate_6hrs: 202000, rate_10hrs: 269000, rate_1_3days: 336000, rate_4days: 302300, rate_5_6days: 279600, rate_7plus_days: 256300, service_group: '9군', sort_order: 20 },
  { lotte_category: '승합', vehicle_names: '스타리아 11인승(H) 24년식', rate_6hrs: 203000, rate_10hrs: 271000, rate_1_3days: 339000, rate_4days: 305100, rate_5_6days: 288200, rate_7plus_days: 271200, service_group: '9군', sort_order: 21 },
  { lotte_category: '승합', vehicle_names: '카니발 9인승(H) 24년식', rate_6hrs: 218000, rate_10hrs: 290000, rate_1_3days: 363000, rate_4days: 326700, rate_5_6days: 308600, rate_7plus_days: 290400, service_group: '9군', sort_order: 22 },
  { lotte_category: '승합', vehicle_names: '스타리아 9인승(H) 24년식', rate_6hrs: 221000, rate_10hrs: 294000, rate_1_3days: 368000, rate_4days: 331200, rate_5_6days: 312800, rate_7plus_days: 294400, service_group: '9군', sort_order: 23 },
  { lotte_category: '승합', vehicle_names: '카니발 9인승 하이리무진(D) ~23년식', rate_6hrs: 274000, rate_10hrs: 366000, rate_1_3days: 457000, rate_4days: 411300, rate_5_6days: 380200, rate_7plus_days: 348570, service_group: '9군', sort_order: 24 },
  { lotte_category: '승합', vehicle_names: '카니발 9인승 하이리무진(H) 24년식', rate_6hrs: 317000, rate_10hrs: 423000, rate_1_3days: 529000, rate_4days: 476100, rate_5_6days: 449700, rate_7plus_days: 423200, service_group: '9군', sort_order: 25 },
  { lotte_category: '승합', vehicle_names: '쏠라티 15인승(D) ~23년식', rate_6hrs: 389000, rate_10hrs: 518000, rate_1_3days: 648000, rate_4days: 583200, rate_5_6days: 550800, rate_7plus_days: 518400, service_group: '9군', sort_order: 26 },

  // SUV·RV 소형 (8군)
  { lotte_category: 'SUV·RV(소형)', vehicle_names: '코나(G) ~24년식, 니로(H) ~24년식, 셀토스(G) ~24년식', rate_6hrs: 130000, rate_10hrs: 174000, rate_1_3days: 217000, rate_4days: 195300, rate_5_6days: 184500, rate_7plus_days: 173600, service_group: '8군', sort_order: 27 },

  // SUV·RV 중형 (8군~10군)
  { lotte_category: 'SUV·RV(중형)', vehicle_names: '스포티지(D,G,H) ~24년식, 투싼(G,H) ~23년식', rate_6hrs: 157000, rate_10hrs: 210000, rate_1_3days: 262000, rate_4days: 235800, rate_5_6days: 222700, rate_7plus_days: 209600, service_group: '8군', sort_order: 28 },
  { lotte_category: 'SUV·RV(중형)', vehicle_names: '쏘렌토(D,G,H) ~23년식, 토레스(G) ~24년식', rate_6hrs: 176000, rate_10hrs: 234000, rate_1_3days: 293000, rate_4days: 263700, rate_5_6days: 249100, rate_7plus_days: 234400, service_group: '9군', sort_order: 29 },
  { lotte_category: 'SUV·RV(중형)', vehicle_names: '싼타페(G,H) 24년식, 쏘렌토(G,H) 24년식', rate_6hrs: 198000, rate_10hrs: 264000, rate_1_3days: 330000, rate_4days: 297000, rate_5_6days: 280500, rate_7plus_days: 264000, service_group: '9군', sort_order: 30 },
  { lotte_category: 'SUV·RV(중형)', vehicle_names: '팰리세이드(D) ~23년식', rate_6hrs: 241000, rate_10hrs: 322000, rate_1_3days: 402000, rate_4days: 361800, rate_5_6days: 341700, rate_7plus_days: 321600, service_group: '10군', sort_order: 31 },
  { lotte_category: 'SUV·RV(중형)', vehicle_names: 'GV70(D,G) ~24년식', rate_6hrs: 281000, rate_10hrs: 375000, rate_1_3days: 469000, rate_4days: 422100, rate_5_6days: 398700, rate_7plus_days: 375200, service_group: '10군', sort_order: 32 },
  { lotte_category: 'SUV·RV(중형)', vehicle_names: 'GV80(D,G) ~24년식', rate_6hrs: 317000, rate_10hrs: 423000, rate_1_3days: 529000, rate_4days: 476100, rate_5_6days: 449700, rate_7plus_days: 423200, service_group: '10군', sort_order: 33 },

  // 수입차 (10군)
  { lotte_category: '수입차', vehicle_names: 'MINI COOPER, BENZ A220, JEEP RENEGADE', rate_6hrs: 237000, rate_10hrs: 316000, rate_1_3days: 395000, rate_4days: 355500, rate_5_6days: 335800, rate_7plus_days: 316000, service_group: '10군', sort_order: 34 },
  { lotte_category: '수입차', vehicle_names: 'MINI COOPER S, VOLKSWAGEN TIGUAN', rate_6hrs: 253000, rate_10hrs: 338000, rate_1_3days: 422000, rate_4days: 379800, rate_5_6days: 358700, rate_7plus_days: 337600, service_group: '10군', sort_order: 35 },
  { lotte_category: '수입차', vehicle_names: 'AUDI Q3, BMW 320D, BENZ EQA·C200, FORD EXPLORER', rate_6hrs: 303000, rate_10hrs: 404000, rate_1_3days: 505000, rate_4days: 454500, rate_5_6days: 429300, rate_7plus_days: 404000, service_group: '10군', sort_order: 36 },
  { lotte_category: '수입차', vehicle_names: 'AUDI A6, BMW 520D·523D·520I·530I, BENZ C300·E200·E220·E250·E300, LEXUS ES300H, VOLVO XC60', rate_6hrs: 345000, rate_10hrs: 460000, rate_1_3days: 575000, rate_4days: 517500, rate_5_6days: 488800, rate_7plus_days: 460000, service_group: '10군', sort_order: 37 },
  { lotte_category: '수입차', vehicle_names: 'AUDI A5 CABRIOLET·A7, BENZ CLE200 CABRIOLET', rate_6hrs: 354000, rate_10hrs: 472000, rate_1_3days: 590000, rate_4days: 531000, rate_5_6days: 501500, rate_7plus_days: 472000, service_group: '10군', sort_order: 38 },
  { lotte_category: '수입차', vehicle_names: 'BENZ E350, GLE300D', rate_6hrs: 379000, rate_10hrs: 505000, rate_1_3days: 631500, rate_4days: 568400, rate_5_6days: 536800, rate_7plus_days: 505200, service_group: '10군', sort_order: 39 },
  { lotte_category: '수입차', vehicle_names: 'BMW 550I, M3', rate_6hrs: 396000, rate_10hrs: 528000, rate_1_3days: 660000, rate_4days: 594000, rate_5_6days: 561000, rate_7plus_days: 528000, service_group: '10군', sort_order: 40 },
  { lotte_category: '수입차', vehicle_names: 'BENZ GLC300·GLC220D, BMW X3·X4', rate_6hrs: 399000, rate_10hrs: 532000, rate_1_3days: 665400, rate_4days: 598900, rate_5_6days: 565600, rate_7plus_days: 532300, service_group: '10군', sort_order: 41 },
  { lotte_category: '수입차', vehicle_names: 'BENZ CLS 300·CLS 450', rate_6hrs: 413000, rate_10hrs: 550000, rate_1_3days: 688000, rate_4days: 619200, rate_5_6days: 584800, rate_7plus_days: 550400, service_group: '10군', sort_order: 42 },
  { lotte_category: '수입차', vehicle_names: 'BMW X5·X6, RANGE ROVER VELAR', rate_6hrs: 422000, rate_10hrs: 562000, rate_1_3days: 703000, rate_4days: 632700, rate_5_6days: 597600, rate_7plus_days: 562400, service_group: '10군', sort_order: 43 },
  { lotte_category: '수입차', vehicle_names: 'BMW X7, BENZ GLE450·GLS400D', rate_6hrs: 460000, rate_10hrs: 613000, rate_1_3days: 766000, rate_4days: 689400, rate_5_6days: 651100, rate_7plus_days: 612800, service_group: '10군', sort_order: 44 },
  { lotte_category: '수입차', vehicle_names: 'AUDI Q7, BENZ SPRINTER', rate_6hrs: 486000, rate_10hrs: 648000, rate_1_3days: 810000, rate_4days: 729000, rate_5_6days: 688500, rate_7plus_days: 648000, service_group: '10군', sort_order: 45 },
  { lotte_category: '수입차', vehicle_names: 'BENZ S500', rate_6hrs: 616000, rate_10hrs: 822000, rate_1_3days: 1027000, rate_4days: 924300, rate_5_6days: 873000, rate_7plus_days: 821600, service_group: '10군', sort_order: 46 },

  // 전기차 (급별 매핑)
  { lotte_category: '전기차', vehicle_names: '코나EV ~24년식, 니로EV ~24년식', rate_6hrs: 125000, rate_10hrs: 166000, rate_1_3days: 208000, rate_4days: 187200, rate_5_6days: 176800, rate_7plus_days: 166400, service_group: '1군', sort_order: 47 },
  { lotte_category: '전기차', vehicle_names: '아이오닉5 2WD ~23년식, EV6 2WD ~23년식', rate_6hrs: 138000, rate_10hrs: 184000, rate_1_3days: 230000, rate_4days: 207000, rate_5_6days: 195500, rate_7plus_days: 184000, service_group: '2군', sort_order: 48 },
  { lotte_category: '전기차', vehicle_names: 'EV6 4WD ~23년식, 아이오닉5 4WD ~23년식', rate_6hrs: 186000, rate_10hrs: 248000, rate_1_3days: 310000, rate_4days: 279000, rate_5_6days: 263500, rate_7plus_days: 248000, service_group: '3군', sort_order: 49 },
  { lotte_category: '전기차', vehicle_names: '아이오닉6 ~23년식', rate_6hrs: 210000, rate_10hrs: 280000, rate_1_3days: 350000, rate_4days: 315000, rate_5_6days: 297500, rate_7plus_days: 280000, service_group: '3군', sort_order: 50 },
  { lotte_category: '전기차', vehicle_names: 'GV60 ~22년식', rate_6hrs: 269000, rate_10hrs: 358000, rate_1_3days: 448000, rate_4days: 403200, rate_5_6days: 380800, rate_7plus_days: 358400, service_group: '5군', sort_order: 51 },
  { lotte_category: '전기차', vehicle_names: 'GV70EV 22년식, EV9 24년식, TESLA MODEL 3', rate_6hrs: 283000, rate_10hrs: 378000, rate_1_3days: 472000, rate_4days: 424800, rate_5_6days: 401200, rate_7plus_days: 377600, service_group: '5군', sort_order: 52 },
  { lotte_category: '전기차', vehicle_names: 'G80EV ~24년식, TESLA MODEL Y', rate_6hrs: 316000, rate_10hrs: 422000, rate_1_3days: 527000, rate_4days: 474300, rate_5_6days: 448000, rate_7plus_days: 421600, service_group: '6군', sort_order: 53 },
  { lotte_category: '전기차', vehicle_names: 'TESLA MODEL X', rate_6hrs: 460000, rate_10hrs: 613000, rate_1_3days: 766000, rate_4days: 689400, rate_5_6days: 651100, rate_7plus_days: 612800, service_group: '10군', sort_order: 54 },
]

// ─── 정비군 분류 기준 (거래처 공통 기준) ───
const SERVICE_GROUP_DEFS = [
  { group: '1군', type: '승용', displacement: '1,000cc 이하', desc: '경차 (스파크, 모닝 등)' },
  { group: '2군', type: '승용', displacement: '1,600cc 이하', desc: '소형 (아반떼 등)' },
  { group: '3군', type: '승용', displacement: '2,000cc 이하', desc: '중형 (쏘나타, K5 등)' },
  { group: '4군', type: '승용', displacement: '3,500cc 이하', desc: '준대형 (그랜저, K8 등)' },
  { group: '5군', type: '승용', displacement: '3,800cc 이하', desc: '대형 (G80, K9 등)' },
  { group: '6군', type: '승용', displacement: '5,000cc 이하', desc: '초대형 (G90, 에쿠스 등)' },
  { group: '8군', type: 'RV·SUV·승합', displacement: '2,000cc 미만', desc: '소형SUV (투싼, 코나, 셀토스 등)' },
  { group: '9군', type: 'RV·SUV·승합', displacement: '2,000cc 이상', desc: '중대형SUV/승합 (쏘렌토, 카니발 등)' },
  { group: '10군', type: 'RV·SUV·승합', displacement: '프리미엄', desc: '프리미엄SUV (팰리세이드, GV80 등)' },
]

// ─── 기본 정비군 (롯데 기준 매핑) — 10군 체계 (7군 없음) ───
const DEFAULT_GROUPS: Omit<RateRow, 'id'>[] = [
  { service_group: '1군', vehicle_class: '경차', displacement_range: '1,000cc 이하', daily_rate: 0, lotte_base_rate: 122000, discount_percent: 40, calc_method: 'auto', sort_order: 1, is_active: true },
  { service_group: '2군', vehicle_class: '소형 승용', displacement_range: '1,600cc 이하', daily_rate: 0, lotte_base_rate: 159000, discount_percent: 40, calc_method: 'auto', sort_order: 2, is_active: true },
  { service_group: '3군', vehicle_class: '중형 승용', displacement_range: '2,000cc 이하', daily_rate: 0, lotte_base_rate: 263000, discount_percent: 40, calc_method: 'auto', sort_order: 3, is_active: true },
  { service_group: '4군', vehicle_class: '준대형 승용', displacement_range: '3,500cc 이하', daily_rate: 0, lotte_base_rate: 351000, discount_percent: 40, calc_method: 'auto', sort_order: 4, is_active: true },
  { service_group: '5군', vehicle_class: '대형 승용', displacement_range: '3,800cc 이하', daily_rate: 0, lotte_base_rate: 449000, discount_percent: 40, calc_method: 'auto', sort_order: 5, is_active: true },
  { service_group: '6군', vehicle_class: '초대형 승용', displacement_range: '5,000cc 이하', daily_rate: 0, lotte_base_rate: 570000, discount_percent: 40, calc_method: 'auto', sort_order: 6, is_active: true },
  { service_group: '8군', vehicle_class: 'RV·SUV·승합 (소형)', displacement_range: '2,000cc 미만', daily_rate: 0, lotte_base_rate: 240000, discount_percent: 40, calc_method: 'auto', sort_order: 8, is_active: true },
  { service_group: '9군', vehicle_class: 'RV·SUV·승합 (중대형)', displacement_range: '2,000cc 이상', daily_rate: 0, lotte_base_rate: 405000, discount_percent: 40, calc_method: 'auto', sort_order: 9, is_active: true },
  { service_group: '10군', vehicle_class: 'RV·SUV·승합 (프리미엄)', displacement_range: '프리미엄', daily_rate: 0, lotte_base_rate: 575000, discount_percent: 40, calc_method: 'auto', sort_order: 10, is_active: true },
]

const ALL_GROUPS = ['1군', '2군', '3군', '4군', '5군', '6군', '8군', '9군', '10군']

const DAY_PRESETS = [5, 10, 15, 20]
const SUB_TABS = [
  { key: 'settings', label: '요율 설정', icon: '⚙️' },
  { key: 'quote', label: '견적 작성', icon: '📝' },
  { key: 'manage', label: '견적 관리', icon: '📋' },
] as const
type SubTab = typeof SUB_TABS[number]['key']

// ─── 헬퍼 ───
const f = (n: number) => (n || 0).toLocaleString()
const calcRate = (base: number, pct: number) => Math.round(base * pct / 100)

// ═══════════════════════════════════════════════════
// 메인 컴포넌트
// ═══════════════════════════════════════════════════
export default function ShortTermReplacementBuilder() {
  const { company, role, adminSelectedCompanyId } = useApp()
  const cid = role === 'god_admin' ? adminSelectedCompanyId : company?.id

  const [subTab, setSubTab] = useState<SubTab>('settings')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  // 롯데 기준 요율 — 초기값으로 기본 데이터 세팅
  const [lotteRates, setLotteRates] = useState<LotteRate[]>(
    LOTTE_DEFAULT_DATA.map((d, i) => ({ ...d, id: `lotte_${i}` }))
  )
  const [lotteEditMode, setLotteEditMode] = useState(false)
  const [lotteUpdateDate, setLotteUpdateDate] = useState<string>('2025.02.10')
  const [lotteUpdating, setLotteUpdating] = useState(false)
  const [lotteCatFilter, setLotteCatFilter] = useState<string>('전체')
  const [lotteOpen, setLotteOpen] = useState(true)

  // 정비군 요율 — 초기값으로 기본 데이터 세팅
  const [rates, setRates] = useState<RateRow[]>(
    DEFAULT_GROUPS.map((g, i) => ({ ...g, id: `temp_${i}`, daily_rate: calcRate(g.lotte_base_rate, 40) }))
  )
  const [globalDiscount, setGlobalDiscount] = useState(40)
  const [rateEditMode, setRateEditMode] = useState(false)

  // 견적 작성
  const [customDays, setCustomDays] = useState<number[]>(DAY_PRESETS)
  const [showDayInput, setShowDayInput] = useState(false)
  const [newDayVal, setNewDayVal] = useState('')
  const [selectedPkgs, setSelectedPkgs] = useState<{ group: string; days: number }[]>([])
  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [contractPeriod, setContractPeriod] = useState('1년')
  const [showPreview, setShowPreview] = useState(false)
  const [quoteSaving, setQuoteSaving] = useState(false)

  // 견적 관리
  const [quotes, setQuotes] = useState<QuoteRow[]>([])
  const [quotesLoading, setQuotesLoading] = useState(false)
  const [quoteFilter, setQuoteFilter] = useState('all')

  // ─── 데이터 로드 ───
  useEffect(() => { if (cid) loadAll() }, [cid])

  const loadAll = async () => {
    try {
      await Promise.all([loadLotteRates(), loadRates()])
    } catch (e) {
      console.warn('단기대차 데이터 로드 실패 (기본값 유지):', e)
    }
  }

  const loadLotteRates = async () => {
    if (!cid) return
    try {
      const { data, error } = await supabase.from('lotte_reference_rates').select('*').eq('company_id', cid).eq('is_active', true).order('sort_order')
      if (!error && data && data.length > 0) {
        setLotteRates(data)
        const latestDate = data[0]?.effective_date || data[0]?.updated_at
        if (latestDate) setLotteUpdateDate(new Date(latestDate).toLocaleDateString('ko-KR'))
        return
      }
    } catch { /* 테이블 미존재 — 기본값 사용 */ }
    setLotteRates(LOTTE_DEFAULT_DATA.map((d, i) => ({ ...d, id: `lotte_${i}` })))
  }

  const loadRates = async () => {
    if (!cid) return
    try {
      const { data, error } = await supabase.from('short_term_rates').select('*').eq('company_id', cid).eq('is_active', true).order('sort_order')
      if (!error && data && data.length > 0) {
        setRates(data)
        if (data[0]?.discount_percent) setGlobalDiscount(data[0].discount_percent)
        return
      }
    } catch { /* 테이블 미존재 — 기본값 사용 */ }
    const mapped = DEFAULT_GROUPS.map((g, i) => ({ ...g, id: `temp_${i}`, daily_rate: calcRate(g.lotte_base_rate, 40) }))
    setRates(mapped)
  }

  const loadQuotes = useCallback(async () => {
    if (!cid) return
    setQuotesLoading(true)
    try {
      let q = supabase.from('short_term_quotes').select('*').eq('company_id', cid).order('created_at', { ascending: false })
      if (quoteFilter !== 'all') q = q.eq('status', quoteFilter)
      const { data } = await q
      setQuotes(data || [])
    } catch { setQuotes([]) }
    setQuotesLoading(false)
  }, [cid, quoteFilter])

  useEffect(() => { if (subTab === 'manage') loadQuotes() }, [subTab, loadQuotes])

  // ─── 롯데 요율 저장 ───
  const saveLotteRates = async () => {
    if (!cid) return
    setSaving(true)
    try {
      await supabase.from('lotte_reference_rates').delete().eq('company_id', cid)
      const today = new Date().toISOString().split('T')[0]
      const payload = lotteRates.map((r, i) => ({
        company_id: cid, lotte_category: r.lotte_category, vehicle_names: r.vehicle_names,
        rate_6hrs: r.rate_6hrs || 0, rate_10hrs: r.rate_10hrs || 0,
        rate_1_3days: r.rate_1_3days, rate_4days: r.rate_4days, rate_5_6days: r.rate_5_6days,
        rate_7plus_days: r.rate_7plus_days, service_group: r.service_group,
        effective_date: today, sort_order: i + 1, is_active: true,
      }))
      const { error } = await supabase.from('lotte_reference_rates').insert(payload)
      if (error) throw error
      setLotteUpdateDate(new Date().toLocaleDateString('ko-KR'))
      alert('롯데 기준요율이 저장되었습니다!')
      setLotteEditMode(false)
      loadLotteRates()
    } catch (e: any) { alert('저장 실패: ' + e.message) }
    setSaving(false)
  }

  // ─── 정비군 요율 저장 ───
  const saveRates = async () => {
    if (!cid) return
    setSaving(true)
    try {
      await supabase.from('short_term_rates').delete().eq('company_id', cid)
      const payload = rates.map((r, i) => ({
        company_id: cid, service_group: r.service_group, vehicle_class: r.vehicle_class,
        displacement_range: r.displacement_range, daily_rate: r.calc_method === 'auto' ? calcRate(r.lotte_base_rate, r.discount_percent) : r.daily_rate,
        lotte_base_rate: r.lotte_base_rate, discount_percent: r.discount_percent,
        calc_method: r.calc_method, sort_order: i + 1, is_active: true,
      }))
      const { error } = await supabase.from('short_term_rates').insert(payload)
      if (error) throw error
      alert('요율표가 저장되었습니다!')
      setRateEditMode(false)
      loadRates()
    } catch (e: any) { alert('저장 실패: ' + e.message) }
    setSaving(false)
  }

  // ─── 할인율 일괄 변경 ───
  const applyGlobalDiscount = (pct: number) => {
    setGlobalDiscount(pct)
    setRates(prev => prev.map(r => r.calc_method === 'auto'
      ? { ...r, discount_percent: pct, daily_rate: calcRate(r.lotte_base_rate, pct) }
      : r
    ))
  }

  // ─── 견적 패키지 토글 ───
  const togglePkg = (group: string, days: number) => {
    setSelectedPkgs(prev => {
      const exists = prev.find(p => p.group === group && p.days === days)
      return exists ? prev.filter(p => !(p.group === group && p.days === days)) : [...prev, { group, days }]
    })
  }
  const isPkgSel = (g: string, d: number) => selectedPkgs.some(p => p.group === g && p.days === d)

  // ─── 견적 합계 ───
  const quoteTotals = useMemo(() => {
    let total = 0
    const items = selectedPkgs.map(pkg => {
      const rate = rates.find(r => r.service_group === pkg.group)
      if (!rate) return null
      const dr = rate.calc_method === 'auto' ? calcRate(rate.lotte_base_rate, rate.discount_percent) : rate.daily_rate
      const amount = dr * pkg.days
      total += amount
      return { ...pkg, dailyRate: dr, lotteRate: rate.lotte_base_rate, discount: rate.discount_percent, amount, vehicleClass: rate.vehicle_class }
    }).filter(Boolean)
    return { items, total, vat: Math.round(total * 0.1), totalWithVat: Math.round(total * 1.1) }
  }, [selectedPkgs, rates])

  // ─── 견적 저장 ───
  const saveQuote = async () => {
    if (!cid || !customerName || selectedPkgs.length === 0) { alert('고객명과 견적 항목을 입력해주세요.'); return }
    setQuoteSaving(true)
    try {
      const now = new Date()
      const num = `STQ-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-${String(Math.floor(Math.random() * 999) + 1).padStart(3, '0')}`
      const detail = { items: quoteTotals.items, total: quoteTotals.total, vat: quoteTotals.vat, totalWithVat: quoteTotals.totalWithVat, globalDiscount }
      const { error } = await supabase.from('short_term_quotes').insert({
        company_id: cid, quote_number: num, customer_name: customerName, customer_phone: customerPhone,
        quote_detail: detail, contract_period: contractPeriod, discount_percent: globalDiscount, status: 'draft',
      })
      if (error) throw error
      alert(`견적서 ${num} 이 생성되었습니다!`)
      setSelectedPkgs([]); setCustomerName(''); setCustomerPhone(''); setShowPreview(false)
      setSubTab('manage')
    } catch (e: any) { alert('견적 저장 실패: ' + e.message) }
    setQuoteSaving(false)
  }

  // ─── 제공일수 관리 ───
  const addDay = () => { const v = parseInt(newDayVal); if (v > 0 && !customDays.includes(v)) { setCustomDays(prev => [...prev, v].sort((a, b) => a - b)); setNewDayVal(''); setShowDayInput(false) } }
  const rmDay = (d: number) => { if (customDays.length > 1) setCustomDays(prev => prev.filter(x => x !== d)) }

  // ─── 견적 상태 변경 ───
  const updateQuoteStatus = async (id: string, status: string) => {
    await supabase.from('short_term_quotes').update({ status, updated_at: new Date().toISOString() }).eq('id', id)
    loadQuotes()
  }

  // ─── 롯데 카테고리 필터 ───
  const lotteCategories = useMemo(() => {
    const cats = [...new Set(lotteRates.map(r => r.lotte_category))]
    return ['전체', ...cats]
  }, [lotteRates])

  const filteredLotteRates = useMemo(() => {
    if (lotteCatFilter === '전체') return lotteRates
    return lotteRates.filter(r => r.lotte_category === lotteCatFilter)
  }, [lotteRates, lotteCatFilter])

  // loading 게이트 제거 — 기본 데이터로 즉시 렌더링, DB 데이터는 백그라운드 갱신

  // ═══════════════════════════════════════════════════
  // 렌더링
  // ═══════════════════════════════════════════════════
  return (
    <div className="max-w-7xl mx-auto py-6 px-4 md:py-8 md:px-6">

      {/* ─── 서브탭 ─── */}
      <div className="flex gap-2 mb-4 overflow-x-auto">
        {SUB_TABS.map(t => (
          <button key={t.key} onClick={() => setSubTab(t.key)}
            className={`py-2 px-4 border rounded-xl font-bold text-xs transition-colors whitespace-nowrap ${
              subTab === t.key ? 'border-steel-500 bg-steel-50 text-steel-700 shadow-sm' : 'border-gray-200 bg-white text-gray-500 hover:border-steel-300'
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ═════════════════════════════════════════════ */}
      {/* 탭 1: 요율 설정 (할인율 + 매핑 + 롯데 참고) */}
      {/* ═════════════════════════════════════════════ */}
      {subTab === 'settings' && (
        <div className="space-y-4">

          {/* ─── 할인율 + 정비군 매핑 (상단) ─── */}

          {/* 글로벌 할인율 설정 */}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="bg-gray-50/50 border-b border-gray-100 px-4 py-2.5">
              <span className="font-bold text-gray-800 text-xs">할인율 설정 <span className="text-[11px] text-gray-400 font-medium ml-1">롯데렌터카 대비 적용 비율</span></span>
            </div>
            <div className="p-4">
              <div className="flex items-center gap-4">
                <span className="text-xs font-bold text-gray-600 shrink-0">롯데 대비</span>
                <input type="range" min={10} max={100} step={5} value={globalDiscount}
                  onChange={e => applyGlobalDiscount(Number(e.target.value))}
                  className="flex-1 h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-purple-600" />
                <div className="flex items-center gap-1">
                  <input type="number" min={1} max={100} value={globalDiscount}
                    onChange={e => applyGlobalDiscount(Number(e.target.value))}
                    className="w-14 border border-gray-200 px-2 py-1 rounded-lg text-center font-bold text-purple-700 text-sm focus:border-purple-500 outline-none" />
                  <span className="text-sm font-bold text-gray-400">%</span>
                </div>
              </div>
              <p className="text-[11px] text-gray-400 mt-2">
                예시: 롯데 1일 10만원 → 턴키 <span className="font-bold text-purple-600">{f(calcRate(100000, globalDiscount))}원</span>/일
              </p>
            </div>
          </div>

          {/* 정비군별 요율 매핑 */}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="bg-gray-50/50 border-b border-gray-100 px-4 py-2.5 flex items-center justify-between">
              <span className="font-bold text-gray-800 text-xs">정비군별 요율 매핑 <span className="text-[11px] text-gray-400 font-medium ml-1">롯데 기준가 × {globalDiscount}% = 턴키 단가</span></span>
              <div className="flex gap-1.5">
                {rateEditMode ? (
                  <>
                    <button onClick={() => { setRateEditMode(false); loadRates() }} className="py-0.5 px-2.5 text-xs rounded-lg border border-gray-200 font-bold text-gray-500 hover:bg-gray-50 transition-colors">취소</button>
                    <button onClick={saveRates} disabled={saving} className="py-0.5 px-2.5 text-xs rounded-lg bg-steel-600 text-white font-bold hover:bg-steel-700 disabled:opacity-50 transition-colors">{saving ? '저장 중...' : '저장'}</button>
                  </>
                ) : (
                  <button onClick={() => setRateEditMode(true)} className="py-0.5 px-2.5 text-xs rounded-lg border border-gray-200 font-bold text-gray-500 hover:bg-gray-50 transition-colors">편집</button>
                )}
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead><tr className="text-gray-400 whitespace-nowrap">
                  <th className="py-1.5 px-3 pl-4 text-left text-xs font-bold">정비군</th>
                  <th className="py-1.5 px-3 text-left text-xs font-bold">차종 분류</th>
                  <th className="py-1.5 px-3 text-left text-xs font-bold">배기량</th>
                  <th className="py-1.5 pr-3 text-right text-xs font-bold text-red-400">롯데 기준</th>
                  <th className="py-1.5 px-3 text-center text-xs font-bold text-purple-500">할인율</th>
                  <th className="py-1.5 px-3 text-center text-xs font-bold">방식</th>
                  <th className="py-1.5 pr-4 text-right text-xs font-bold text-steel-600">턴키 1일</th>
                </tr></thead>
                <tbody>
                  {rates.map((r, i) => {
                    const computed = r.calc_method === 'auto' ? calcRate(r.lotte_base_rate, r.discount_percent) : r.daily_rate
                    const isRvStart = r.service_group === '8군' && (i === 0 || rates[i - 1]?.service_group !== '8군')
                    return (
                      <>{isRvStart && (
                        <tr key="rv-divider" className="bg-amber-50/50">
                          <td colSpan={7} className="px-4 py-1 text-xs font-bold text-amber-600">RV · SUV · 승합</td>
                        </tr>
                      )}
                      <tr key={r.id || i} className="border-t border-gray-100 hover:bg-steel-50/30 whitespace-nowrap">
                        <td className="py-1.5 px-3 pl-4"><span className="bg-steel-100 text-steel-700 text-xs font-bold px-1.5 py-0.5 rounded">{r.service_group}</span></td>
                        <td className="py-1.5 px-3">
                          {rateEditMode ? (
                            <input className="border border-gray-200 px-1.5 py-0.5 rounded text-xs w-full" value={r.vehicle_class}
                              onChange={e => { const n = [...rates]; n[i] = { ...n[i], vehicle_class: e.target.value }; setRates(n) }} />
                          ) : (
                            <span className="text-xs font-bold text-gray-800">{r.vehicle_class}</span>
                          )}
                        </td>
                        <td className="py-1.5 px-3">
                          {rateEditMode ? (
                            <input className="border border-gray-200 px-1.5 py-0.5 rounded text-xs w-28" value={r.displacement_range}
                              onChange={e => { const n = [...rates]; n[i] = { ...n[i], displacement_range: e.target.value }; setRates(n) }} />
                          ) : (
                            <span className="text-xs text-gray-500 font-bold">{r.displacement_range}</span>
                          )}
                        </td>
                        <td className="py-1.5 pr-3 text-right">
                          {rateEditMode ? (
                            <input className="w-20 border border-gray-200 px-1.5 py-0.5 rounded text-xs font-bold text-right" value={f(r.lotte_base_rate)}
                              onChange={e => {
                                const base = Number(e.target.value.replace(/,/g, ''))
                                const n = [...rates]; n[i] = { ...n[i], lotte_base_rate: base, daily_rate: r.calc_method === 'auto' ? calcRate(base, r.discount_percent) : r.daily_rate }; setRates(n)
                              }} />
                          ) : (
                            <span className="text-xs font-bold text-red-600">{f(r.lotte_base_rate)}</span>
                          )}
                        </td>
                        <td className="py-1.5 px-3 text-center">
                          {rateEditMode ? (
                            <input type="number" className="w-12 border border-gray-200 px-1 py-0.5 rounded text-xs font-bold text-center" value={r.discount_percent}
                              onChange={e => { const pct = Number(e.target.value); const n = [...rates]; n[i] = { ...n[i], discount_percent: pct, daily_rate: r.calc_method === 'auto' ? calcRate(r.lotte_base_rate, pct) : r.daily_rate }; setRates(n) }} />
                          ) : (
                            <span className="text-xs font-bold text-purple-600">{r.discount_percent}%</span>
                          )}
                        </td>
                        <td className="py-1.5 px-3 text-center">
                          {rateEditMode ? (
                            <select className="border border-gray-200 px-1 py-0.5 rounded text-xs font-bold" value={r.calc_method}
                              onChange={e => { const n = [...rates]; n[i] = { ...n[i], calc_method: e.target.value }; setRates(n) }}>
                              <option value="auto">자동</option><option value="manual">수동</option>
                            </select>
                          ) : (
                            <span className={`text-xs font-bold ${r.calc_method === 'auto' ? 'text-green-600' : 'text-orange-600'}`}>
                              {r.calc_method === 'auto' ? '자동' : '수동'}
                            </span>
                          )}
                        </td>
                        <td className="py-1.5 pr-4 text-right">
                          {rateEditMode && r.calc_method === 'manual' ? (
                            <input className="w-24 border border-gray-200 px-1.5 py-0.5 rounded text-xs font-bold text-right" value={f(r.daily_rate)}
                              onChange={e => { const n = [...rates]; n[i] = { ...n[i], daily_rate: Number(e.target.value.replace(/,/g, '')) }; setRates(n) }} />
                          ) : (
                            <span className="text-sm font-black text-steel-700">{f(computed)}원</span>
                          )}
                        </td>
                      </tr>
                      </>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* ─── 롯데 참고 자료 (하단, 접이식) ─── */}

          {/* 정비군 분류 기준표 */}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
            <button onClick={() => setLotteOpen(!lotteOpen)} className="w-full bg-gray-50/50 border-b border-gray-100 px-4 py-2.5 flex items-center justify-between hover:bg-gray-100/50 transition-colors">
              <span className="font-bold text-gray-800 text-xs flex items-center gap-2">롯데렌터카 참고 자료 <span className="text-[11px] text-gray-400 font-medium">정비군 기준 + 공식 요금표</span></span>
              <span className={`text-gray-400 text-xs transition-transform ${lotteOpen ? 'rotate-180' : ''}`}>▼</span>
            </button>
          {lotteOpen && (<>

        {/* 정비군 분류 기준표 */}
        <div className="border-b border-gray-100">
          <div className="bg-gray-50/30 px-4 py-2 border-b border-gray-100">
            <span className="font-bold text-gray-600 text-xs">정비군 분류 기준 <span className="text-[11px] text-gray-400 font-medium">10군 체계 · 7군 없음</span></span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead><tr className="text-gray-400 whitespace-nowrap">
                <th className="py-1.5 px-3 pl-4 text-left text-xs font-bold">정비군</th>
                <th className="py-1.5 px-3 text-left text-xs font-bold">구분</th>
                <th className="py-1.5 px-3 text-left text-xs font-bold">배기량</th>
                <th className="py-1.5 px-3 text-left text-xs font-bold">대표 차종</th>
              </tr></thead>
              <tbody>
                {SERVICE_GROUP_DEFS.map(g => (
                  <tr key={g.group} className="border-t border-gray-100 whitespace-nowrap">
                    <td className="py-1.5 px-3 pl-4"><span className="bg-steel-100 text-steel-700 text-xs font-bold px-1.5 py-0.5 rounded">{g.group}</span></td>
                    <td className="py-1.5 px-3"><span className={`text-xs font-bold px-1.5 py-0.5 rounded ${g.type === '승용' ? 'bg-blue-50 text-blue-600' : 'bg-amber-50 text-amber-600'}`}>{g.type}</span></td>
                    <td className="py-1.5 px-3 text-xs font-bold text-gray-600">{g.displacement}</td>
                    <td className="py-1.5 px-3 text-xs text-gray-400">{g.desc}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* 롯데 기준 요금 */}
        <div>
          <div className="bg-gray-50/30 border-b border-gray-100 px-4 py-2 flex items-center justify-between">
            <span className="font-bold text-gray-800 text-xs flex items-center gap-2">
              롯데렌터카 공식 단기렌트 요금
              <span className="text-[11px] text-gray-400 font-medium">{lotteUpdateDate} 기준 · 내륙</span>
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 inline-block"></span>
            </span>
            <div className="flex items-center gap-2">
              {lotteEditMode ? (
                <>
                  <button onClick={() => { setLotteEditMode(false); loadLotteRates() }} className="py-0.5 px-2.5 text-xs rounded-lg border border-gray-200 font-bold text-gray-500 hover:bg-gray-50 transition-colors">취소</button>
                  <button onClick={saveLotteRates} disabled={saving} className="py-0.5 px-2.5 text-xs rounded-lg bg-red-500 text-white font-bold hover:bg-red-600 disabled:opacity-50 transition-colors">{saving ? '저장 중...' : '저장'}</button>
                </>
              ) : (
                <button onClick={() => setLotteEditMode(true)} className="py-0.5 px-2.5 text-xs rounded-lg border border-gray-200 font-bold text-gray-500 hover:bg-gray-50 transition-colors">수동 업데이트</button>
              )}
            </div>
          </div>

          {/* 카테고리 필터 */}
          <div className="px-4 py-2 border-b border-gray-100 flex items-center gap-1.5 overflow-x-auto">
            {lotteCategories.map(cat => {
              const cnt = cat === '전체' ? lotteRates.length : lotteRates.filter(r => r.lotte_category === cat).length
              return (
                <button key={cat} onClick={() => setLotteCatFilter(cat)}
                  className={`py-0.5 px-2.5 text-xs rounded-lg border font-bold transition-colors whitespace-nowrap ${
                    lotteCatFilter === cat ? 'bg-red-500 text-white border-red-500' : 'border-gray-200 text-gray-500 hover:bg-gray-50'
                  }`}>
                  {cat} <span className={`ml-0.5 ${lotteCatFilter === cat ? 'text-red-200' : 'text-gray-300'}`}>{cnt}</span>
                </button>
              )
            })}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full table-fixed">
              <thead><tr className="text-gray-400 whitespace-nowrap">
                <th className="py-1.5 px-3 pl-4 text-left text-xs font-bold" style={{width:80}}>카테고리</th>
                <th className="py-1.5 px-3 text-left text-xs font-bold" style={{width:'auto'}}>차종</th>
                <th className="py-1.5 pr-3 text-right text-xs font-bold text-orange-400" style={{width:72}}>6시간</th>
                <th className="py-1.5 pr-3 text-right text-xs font-bold text-orange-400" style={{width:72}}>10시간</th>
                <th className="py-1.5 pr-3 text-right text-xs font-bold text-red-400" style={{width:80}}>1~3일</th>
                <th className="py-1.5 pr-3 text-right text-xs font-bold" style={{width:72}}>4일</th>
                <th className="py-1.5 pr-3 text-right text-xs font-bold" style={{width:72}}>5~6일</th>
                <th className="py-1.5 pr-3 text-right text-xs font-bold" style={{width:72}}>7일+</th>
                <th className="py-1.5 pr-3 text-right text-xs font-bold text-purple-500" style={{width:80}}>턴키({globalDiscount}%)</th>
                <th className="py-1.5 px-3 text-center text-xs font-bold text-steel-600" style={{width:56}}>매핑</th>
                {lotteEditMode && <th className="py-1.5 px-2 text-center text-xs font-bold" style={{width:32}}></th>}
              </tr></thead>
              <tbody>
                {filteredLotteRates.map((lr, i) => {
                  const realIdx = lotteRates.findIndex(r => r.id === lr.id || (r.lotte_category === lr.lotte_category && r.vehicle_names === lr.vehicle_names))
                  return (
                    <tr key={lr.id || i} className="border-t border-gray-100 hover:bg-gray-50/50 whitespace-nowrap">
                      <td className="py-1.5 px-3 pl-4">
                        {lotteEditMode ? (
                          <select className="border border-gray-200 px-1 py-0.5 rounded text-xs font-bold w-full" value={lr.lotte_category}
                            onChange={e => { const n = [...lotteRates]; n[realIdx] = { ...n[realIdx], lotte_category: e.target.value }; setLotteRates(n) }}>
                            {['경차','소형','중형','준대형','대형','승합','SUV·RV(소형)','SUV·RV(중형)','수입차','전기차'].map(c => <option key={c}>{c}</option>)}
                          </select>
                        ) : (
                          <span className="bg-red-50 text-red-600 text-xs font-bold px-1.5 py-0.5 rounded">{lr.lotte_category}</span>
                        )}
                      </td>
                      <td className="py-1.5 px-3 overflow-hidden text-ellipsis">
                        {lotteEditMode ? (
                          <input className="border border-gray-200 px-1.5 py-0.5 rounded text-xs w-full" value={lr.vehicle_names}
                            onChange={e => { const n = [...lotteRates]; n[realIdx] = { ...n[realIdx], vehicle_names: e.target.value }; setLotteRates(n) }} />
                        ) : (
                          <span className="text-xs text-gray-600">{lr.vehicle_names}</span>
                        )}
                      </td>
                      {(['rate_6hrs', 'rate_10hrs', 'rate_1_3days', 'rate_4days', 'rate_5_6days', 'rate_7plus_days'] as const).map((field, fi) => (
                        <td key={field} className="py-1.5 pr-3 text-right">
                          {lotteEditMode ? (
                            <input className="w-16 border border-gray-200 px-1.5 py-0.5 rounded text-xs font-bold text-right"
                              value={f((lr as any)[field])}
                              onChange={e => { const n = [...lotteRates]; (n[realIdx] as any)[field] = Number(e.target.value.replace(/,/g, '')); setLotteRates(n) }} />
                          ) : (
                            <span className={`text-xs font-bold ${fi <= 1 ? 'text-orange-500' : fi === 2 ? 'text-red-600' : 'text-gray-600'}`}>{f((lr as any)[field])}</span>
                          )}
                        </td>
                      ))}
                      <td className="py-1.5 pr-3 text-right">
                        <span className="text-xs font-black text-purple-600">{f(calcRate(lr.rate_1_3days, globalDiscount))}</span>
                      </td>
                      <td className="py-1.5 px-3 text-center">
                        {lotteEditMode ? (
                          <select className="border border-gray-200 px-1 py-0.5 rounded text-xs font-bold" value={lr.service_group}
                            onChange={e => { const n = [...lotteRates]; n[realIdx] = { ...n[realIdx], service_group: e.target.value }; setLotteRates(n) }}>
                            {ALL_GROUPS.map(g => <option key={g}>{g}</option>)}
                          </select>
                        ) : (
                          <span className="bg-steel-100 text-steel-700 text-xs font-bold px-1.5 py-0.5 rounded">{lr.service_group}</span>
                        )}
                      </td>
                      {lotteEditMode && (
                        <td className="py-1.5 px-2 text-center">
                          <button onClick={() => { const n = [...lotteRates]; n.splice(realIdx, 1); setLotteRates(n) }}
                            className="text-gray-300 hover:text-red-500 text-sm">&times;</button>
                        </td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <div className="px-4 py-2 bg-gray-50/50 border-t border-gray-100 text-[11px] text-gray-400 flex items-center justify-between">
            <span>출처: <a href="https://www.lotterentacar.net/hp/kor/reservation/shortInfo/pay.do" target="_blank" rel="noopener" className="text-steel-600 hover:underline">롯데렌터카 공식</a> · 내륙 · 비회원가</span>
            <div className="flex items-center gap-2">
              {lotteEditMode && (
                <button onClick={() => {
                  const lastCat = lotteRates.length > 0 ? lotteRates[lotteRates.length - 1].lotte_category : '소형'
                  const lastGroup = lotteRates.length > 0 ? lotteRates[lotteRates.length - 1].service_group : '1군'
                  setLotteRates(prev => [...prev, { id: `new_${Date.now()}`, lotte_category: lastCat, vehicle_names: '(새 차종)', rate_6hrs: 0, rate_10hrs: 0, rate_1_3days: 0, rate_4days: 0, rate_5_6days: 0, rate_7plus_days: 0, service_group: lastGroup, sort_order: prev.length + 1 }])
                }} className="text-[11px] font-bold text-steel-600 bg-steel-50 px-2 py-0.5 rounded-lg hover:bg-steel-100">+ 차종 추가</button>
              )}
              <span>{filteredLotteRates.length}개 차종</span>
            </div>
          </div>
        </div>

          </>)}
          </div>

        </div>
      )}

      {/* ═════════════════════════════════════════════ */}
      {/* 탭 2: 견적 작성 */}
      {/* ═════════════════════════════════════════════ */}
      {subTab === 'quote' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">

          {/* 좌측: 요율 그리드 */}
          <div className="lg:col-span-8 space-y-4">
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="bg-gray-50/50 border-b border-gray-100 px-4 py-2.5 flex items-center justify-between">
                <span className="font-bold text-gray-800 text-xs">단기대차 요율표 <span className="text-[11px] text-gray-400 font-medium ml-1">롯데 대비 {globalDiscount}%</span></span>
              </div>

              {/* 제공일수 */}
              <div className="px-4 py-2 border-b border-gray-100 flex items-center gap-1.5 flex-wrap">
                <span className="text-xs font-bold text-gray-400 mr-1">제공일수:</span>
                {customDays.map(d => (
                  <span key={d} className="inline-flex items-center gap-1 bg-white border border-gray-200 px-2 py-0.5 rounded-lg text-xs font-bold text-gray-700">
                    연 {d}일
                    {customDays.length > 1 && <button onClick={() => rmDay(d)} className="text-gray-300 hover:text-red-500 ml-0.5">&times;</button>}
                  </span>
                ))}
                {showDayInput ? (
                  <div className="inline-flex items-center gap-1">
                    <input autoFocus type="number" className="w-14 border border-gray-200 px-1.5 py-0.5 rounded-lg text-xs font-bold text-center focus:border-steel-500 outline-none"
                      placeholder="일수" value={newDayVal} onChange={e => setNewDayVal(e.target.value)} onKeyDown={e => e.key === 'Enter' && addDay()} />
                    <button onClick={addDay} className="text-xs text-steel-600 font-bold">확인</button>
                    <button onClick={() => setShowDayInput(false)} className="text-xs text-gray-400 font-bold">취소</button>
                  </div>
                ) : (
                  <button onClick={() => setShowDayInput(true)} className="text-xs text-steel-600 font-bold bg-steel-50 px-2 py-0.5 rounded-lg hover:bg-steel-100">+ 추가</button>
                )}
              </div>

              {/* 요율 테이블 */}
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead><tr className="text-gray-400">
                    <th className="py-1.5 px-3 pl-4 text-left text-xs font-bold w-16">정비군</th>
                    <th className="py-1.5 px-3 text-left text-xs font-bold">차종</th>
                    <th className="py-1.5 pr-3 text-right text-xs font-bold text-red-400 w-20">롯데</th>
                    <th className="py-1.5 pr-3 text-right text-xs font-bold text-steel-600 w-24">1일 단가</th>
                    {customDays.map(d => (
                      <th key={d} className="py-1.5 pr-3 text-right text-xs font-bold text-steel-600 w-28">연 {d}일</th>
                    ))}
                  </tr></thead>
                  <tbody>
                    {rates.map((r, i) => {
                      const dr = r.calc_method === 'auto' ? calcRate(r.lotte_base_rate, r.discount_percent) : r.daily_rate
                      const isRvStart = r.service_group === '8군' && (i === 0 || rates[i - 1]?.service_group !== '8군')
                      return (
                        <>{isRvStart && (
                          <tr key="rv-sep" className="bg-amber-50/50">
                            <td colSpan={4 + customDays.length} className="px-4 py-1 text-[11px] font-bold text-amber-600">RV · SUV · 승합</td>
                          </tr>
                        )}
                        <tr key={r.id || i} className="border-t border-gray-100 hover:bg-steel-50/30">
                          <td className="py-1.5 px-3 pl-4">
                            <span className="bg-steel-100 text-steel-700 text-xs font-bold px-1.5 py-0.5 rounded">{r.service_group}</span>
                          </td>
                          <td className="py-1.5 px-3">
                            <span className="text-xs font-bold text-gray-800">{r.vehicle_class}</span>
                            <span className="text-[11px] text-gray-400 ml-1">{r.displacement_range}</span>
                          </td>
                          <td className="py-1.5 pr-3 text-right">
                            <span className="text-[11px] text-red-400 line-through">{f(r.lotte_base_rate)}</span>
                          </td>
                          <td className="py-1.5 pr-3 text-right">
                            <span className="text-xs font-bold text-steel-700">{f(dr)}원</span>
                          </td>
                          {customDays.map(d => {
                            const pkg = dr * d
                            const sel = isPkgSel(r.service_group, d)
                            return (
                              <td key={d} className="py-1.5 pr-3 text-right">
                                <button onClick={() => togglePkg(r.service_group, d)}
                                  className={`text-right w-full px-1.5 py-0.5 rounded-lg transition-all text-xs font-bold ${
                                    sel ? 'bg-steel-600 text-white shadow-sm' : 'hover:bg-steel-50 text-gray-700'
                                  }`}>
                                  {f(pkg)}원
                                </button>
                              </td>
                            )
                          })}
                        </tr>
                        </>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              <div className="px-4 py-2 bg-gray-50/50 border-t border-gray-100 text-[11px] text-gray-400 text-center">
                금액을 클릭하여 견적에 추가 · 할인율 변경은 [요율 설정] 탭
              </div>
            </div>

            {/* 견적서 프리뷰 */}
            {showPreview && selectedPkgs.length > 0 && (
              <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden" id="quote-print">
                <div className="bg-gray-50/50 border-b border-gray-100 px-4 py-2.5 text-center">
                  <span className="font-bold text-gray-800 text-xs">단기대차 서비스 견적서</span>
                  <span className="text-[11px] text-gray-400 ml-2">{new Date().toLocaleDateString('ko-KR')}</span>
                </div>
                {customerName && (
                  <div className="px-4 py-2 border-b border-gray-100">
                    <div className="flex gap-6 text-xs">
                      <span><span className="text-gray-400 font-bold">고객명:</span> <span className="font-bold text-gray-800 ml-1">{customerName}</span></span>
                      {customerPhone && <span><span className="text-gray-400 font-bold">연락처:</span> <span className="font-bold text-gray-800 ml-1">{customerPhone}</span></span>}
                      <span><span className="text-gray-400 font-bold">계약기간:</span> <span className="font-bold text-gray-800 ml-1">{contractPeriod}</span></span>
                    </div>
                  </div>
                )}
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead><tr className="text-gray-400">
                      <th className="py-1.5 px-3 pl-4 text-left text-xs font-bold">정비군</th>
                      <th className="py-1.5 px-3 text-left text-xs font-bold">차종</th>
                      <th className="py-1.5 pr-3 text-right text-xs font-bold text-red-400">롯데</th>
                      <th className="py-1.5 pr-3 text-right text-xs font-bold">1일 단가</th>
                      <th className="py-1.5 px-3 text-center text-xs font-bold">일수</th>
                      <th className="py-1.5 pr-4 text-right text-xs font-bold">연간 금액</th>
                    </tr></thead>
                    <tbody>
                      {quoteTotals.items.map((item: any, i: number) => (
                        <tr key={i} className="border-t border-gray-100">
                          <td className="py-1.5 px-3 pl-4"><span className="bg-steel-100 text-steel-700 text-xs font-bold px-1.5 py-0.5 rounded">{item.group}</span></td>
                          <td className="py-1.5 px-3 text-xs text-gray-600">{item.vehicleClass}</td>
                          <td className="py-1.5 pr-3 text-right text-[11px] text-red-400 line-through">{f(item.lotteRate)}</td>
                          <td className="py-1.5 pr-3 text-right text-xs text-gray-700 font-bold">{f(item.dailyRate)}원 <span className="text-[11px] text-purple-500">({item.discount}%)</span></td>
                          <td className="py-1.5 px-3 text-center text-xs text-gray-700 font-bold">{item.days}일</td>
                          <td className="py-1.5 pr-4 text-right text-xs font-black text-gray-900">{f(item.amount)}원</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-gray-300">
                        <td colSpan={5} className="py-1.5 pr-3 text-right text-xs font-bold text-gray-600">합계 (VAT 별도)</td>
                        <td className="py-1.5 pr-4 text-right font-black text-gray-900 text-sm">{f(quoteTotals.total)}원</td>
                      </tr>
                      <tr>
                        <td colSpan={5} className="py-1.5 pr-3 text-right text-xs font-bold text-gray-400">VAT (10%)</td>
                        <td className="py-1.5 pr-4 text-right text-xs font-bold text-gray-500">{f(quoteTotals.vat)}원</td>
                      </tr>
                      <tr className="bg-steel-50">
                        <td colSpan={5} className="py-2 pr-3 text-right text-xs font-black text-steel-800">합계 (VAT 포함)</td>
                        <td className="py-2 pr-4 text-right font-black text-steel-900 text-base">{f(quoteTotals.totalWithVat)}원</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
                <div className="px-4 py-2 border-t border-gray-100 text-[11px] text-gray-400 space-y-0.5">
                  <p>* 상기 금액은 연간 기준이며, 계약 조건에 따라 변동될 수 있습니다.</p>
                  <p>* 대차 차량은 동급 이상 차량으로 제공됩니다.</p>
                  <p>* 기준: 롯데렌터카 공식 단기렌트 요금 대비 {globalDiscount}% 적용</p>
                </div>
              </div>
            )}
          </div>

          {/* 우측: 견적 사이드바 */}
          <div className="lg:col-span-4 space-y-4">
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 sticky top-14 overflow-hidden">
              <div className="bg-gray-50/50 border-b border-gray-100 px-4 py-2.5">
                <span className="font-bold text-gray-800 text-xs">견적 구성</span>
              </div>

              {/* 고객 정보 */}
              <div className="px-4 py-3 border-b border-gray-100 space-y-2">
                <div>
                  <label className="block text-[11px] font-bold text-gray-400 mb-1">고객명</label>
                  <input className="w-full border border-gray-200 px-2.5 py-1.5 rounded-lg font-bold text-xs focus:border-steel-500 outline-none"
                    placeholder="고객명 입력" value={customerName} onChange={e => setCustomerName(e.target.value)} />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-gray-400 mb-1">연락처</label>
                  <input className="w-full border border-gray-200 px-2.5 py-1.5 rounded-lg font-bold text-xs focus:border-steel-500 outline-none"
                    placeholder="010-0000-0000" value={customerPhone} onChange={e => setCustomerPhone(e.target.value)} />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-gray-400 mb-1">계약 기간</label>
                  <div className="flex gap-1.5">
                    {['1년', '2년', '3년'].map(p => (
                      <button key={p} onClick={() => setContractPeriod(p)}
                        className={`flex-1 py-1 rounded-lg text-xs font-bold transition-all ${
                          contractPeriod === p ? 'bg-steel-600 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                        }`}>{p}</button>
                    ))}
                  </div>
                </div>
              </div>

              {/* 선택 항목 */}
              <div className="px-4 py-3">
                {selectedPkgs.length === 0 ? (
                  <div className="text-center py-4 text-gray-400">
                    <p className="text-xs font-bold">요율표에서 금액을 클릭하여</p>
                    <p className="text-[11px]">견적 항목을 추가하세요</p>
                  </div>
                ) : (
                  <div className="space-y-1 mb-3">
                    {quoteTotals.items.map((item: any, i: number) => (
                      <div key={i} className="flex justify-between items-center py-1 border-b border-gray-100 last:border-0">
                        <div>
                          <span className="text-[11px] font-bold text-steel-700 bg-steel-50 px-1.5 py-0.5 rounded">{item.group}</span>
                          <span className="text-[11px] text-gray-400 ml-1">연 {item.days}일</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-bold text-gray-800">{f(item.amount)}원</span>
                          <button onClick={() => togglePkg(item.group, item.days)} className="text-gray-300 hover:text-red-500">
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {selectedPkgs.length > 0 && (
                  <div className="space-y-1.5 pt-3 border-t border-gray-200">
                    <div className="flex justify-between items-center">
                      <span className="text-[11px] font-bold text-gray-400">합계 (VAT 별도)</span>
                      <span className="text-xs font-bold text-gray-700">{f(quoteTotals.total)}원</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-[11px] font-bold text-gray-400">VAT</span>
                      <span className="text-xs font-bold text-gray-500">{f(quoteTotals.vat)}원</span>
                    </div>
                    <div className="flex justify-between items-center py-1.5 bg-steel-50 -mx-4 px-4">
                      <span className="text-xs font-bold text-steel-800">연간 총액 (VAT 포함)</span>
                      <span className="text-base font-black text-steel-900">{f(quoteTotals.totalWithVat)}원</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-[11px] font-bold text-gray-400">월 환산</span>
                      <span className="text-xs font-bold text-gray-600">{f(Math.round(quoteTotals.totalWithVat / 12))}원/월</span>
                    </div>
                  </div>
                )}
              </div>

              {/* 액션 */}
              {selectedPkgs.length > 0 && (
                <div className="px-4 py-3 border-t border-gray-100 space-y-1.5">
                  <button onClick={() => setShowPreview(!showPreview)}
                    className="w-full py-2 bg-white border border-gray-200 text-gray-700 rounded-lg text-xs font-bold hover:bg-gray-50 transition-all">
                    {showPreview ? '프리뷰 닫기' : '견적서 미리보기'}
                  </button>
                  <button onClick={saveQuote} disabled={quoteSaving}
                    className="w-full py-2 bg-steel-700 text-white rounded-lg text-xs font-bold hover:bg-steel-800 shadow-sm transition-all disabled:opacity-50">
                    {quoteSaving ? '저장 중...' : '견적서 생성 (DB 저장)'}
                  </button>
                  {showPreview && (
                    <button onClick={() => window.print()}
                      className="w-full py-2 bg-white border border-gray-200 text-gray-700 rounded-lg text-xs font-bold hover:bg-gray-50 transition-all">인쇄</button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ═════════════════════════════════════════════ */}
      {/* 탭 4: 견적 관리 */}
      {/* ═════════════════════════════════════════════ */}
      {subTab === 'manage' && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="bg-gray-50/50 border-b border-gray-100 px-4 py-2.5 flex justify-between items-center">
            <span className="font-bold text-gray-800 text-xs">견적서 관리 <span className="text-[11px] text-gray-400 font-medium ml-1">단기대차 견적 목록</span></span>
            <button onClick={() => setSubTab('quote')} className="py-0.5 px-2.5 text-xs rounded-lg bg-steel-600 text-white font-bold hover:bg-steel-700 transition-colors">+ 새 견적</button>
          </div>

          {/* 상태 필터 */}
          <div className="px-4 py-2 border-b border-gray-100 flex gap-1.5 flex-wrap">
            {[
              { key: 'all', label: '전체' },
              { key: 'draft', label: '작성중' },
              { key: 'sent', label: '발송됨' },
              { key: 'accepted', label: '수락됨' },
              { key: 'contracted', label: '계약완료' },
              { key: 'cancelled', label: '취소' },
            ].map(st => (
              <button key={st.key} onClick={() => setQuoteFilter(st.key)}
                className={`py-0.5 px-2.5 rounded-lg text-xs font-bold transition-colors ${
                  quoteFilter === st.key ? 'bg-steel-600 text-white' : 'border border-gray-200 text-gray-500 hover:bg-gray-50'
                }`}>{st.label}</button>
            ))}
          </div>

          {quotesLoading ? (
            <div className="p-8 text-center text-gray-400 text-xs font-bold">로딩 중...</div>
          ) : quotes.length === 0 ? (
            <div className="p-8 text-center text-gray-400">
              <p className="text-xs font-bold">아직 생성된 견적서가 없습니다</p>
              <p className="text-[11px] mt-1">[견적 작성] 탭에서 새 견적을 만들어보세요</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead><tr className="text-gray-400">
                  <th className="py-1.5 px-3 pl-4 text-left text-xs font-bold">견적번호</th>
                  <th className="py-1.5 px-3 text-left text-xs font-bold">고객명</th>
                  <th className="py-1.5 pr-3 text-right text-xs font-bold">합계</th>
                  <th className="py-1.5 px-3 text-center text-xs font-bold">기간</th>
                  <th className="py-1.5 px-3 text-center text-xs font-bold">상태</th>
                  <th className="py-1.5 px-3 text-center text-xs font-bold">유효기간</th>
                  <th className="py-1.5 px-3 text-center text-xs font-bold w-28">액션</th>
                </tr></thead>
                <tbody>
                  {quotes.map(q => {
                    const detail = q.quote_detail || {}
                    const total = detail.totalWithVat || detail.total || 0
                    const expired = new Date(q.expires_at) < new Date()
                    const statusMap: Record<string, { label: string; color: string }> = {
                      draft: { label: '작성중', color: 'bg-gray-100 text-gray-600' },
                      sent: { label: '발송됨', color: 'bg-blue-100 text-blue-700' },
                      accepted: { label: '수락됨', color: 'bg-green-100 text-green-700' },
                      contracted: { label: '계약완료', color: 'bg-purple-100 text-purple-700' },
                      cancelled: { label: '취소', color: 'bg-red-100 text-red-600' },
                    }
                    const st = statusMap[q.status] || statusMap.draft
                    return (
                      <tr key={q.id} className="border-t border-gray-100 hover:bg-gray-50/50">
                        <td className="py-1.5 px-3 pl-4 text-xs font-bold text-steel-700">{q.quote_number || '-'}</td>
                        <td className="py-1.5 px-3 text-xs font-bold text-gray-800">{q.customer_name}</td>
                        <td className="py-1.5 pr-3 text-right text-xs font-bold text-gray-900">{f(total)}원</td>
                        <td className="py-1.5 px-3 text-center text-[11px] text-gray-500">{q.contract_period}</td>
                        <td className="py-1.5 px-3 text-center">
                          <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded ${st.color}`}>{st.label}</span>
                          {expired && q.status === 'draft' && <span className="ml-1 text-red-500 text-[11px] font-bold">만료</span>}
                        </td>
                        <td className="py-1.5 px-3 text-center text-[11px] text-gray-400">
                          {q.expires_at ? new Date(q.expires_at).toLocaleDateString('ko-KR') : '-'}
                        </td>
                        <td className="py-1.5 px-3 text-center">
                          <div className="flex gap-1 justify-center">
                            {q.status === 'draft' && (
                              <button onClick={() => updateQuoteStatus(q.id, 'sent')} className="text-[11px] bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded font-bold hover:bg-blue-100">발송</button>
                            )}
                            {q.status === 'sent' && (
                              <button onClick={() => updateQuoteStatus(q.id, 'accepted')} className="text-[11px] bg-green-50 text-green-600 px-1.5 py-0.5 rounded font-bold hover:bg-green-100">수락</button>
                            )}
                            {q.status === 'accepted' && (
                              <button onClick={() => updateQuoteStatus(q.id, 'contracted')} className="text-[11px] bg-purple-50 text-purple-600 px-1.5 py-0.5 rounded font-bold hover:bg-purple-100">계약</button>
                            )}
                            {q.status !== 'cancelled' && q.status !== 'contracted' && (
                              <button onClick={() => updateQuoteStatus(q.id, 'cancelled')} className="text-[11px] bg-gray-50 text-gray-400 px-1.5 py-0.5 rounded font-bold hover:bg-gray-100">취소</button>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
