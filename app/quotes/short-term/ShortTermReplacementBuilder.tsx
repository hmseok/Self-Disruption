'use client'
import { supabase } from '../../utils/supabase'
import { useApp } from '../../context/AppContext'
import React, { useEffect, useState, useMemo, useCallback } from 'react'

// ─── 타입 ───
interface LotteRate {
  id?: string
  lotte_category: string
  vehicle_names: string
  rate_6hrs: number
  rate_10hrs: number
  rate_12hrs: number
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
  { lotte_category: '경차', vehicle_names: '스파크(G) ~22년식, 모닝(G) ~24년식', rate_6hrs: 69000, rate_10hrs: 92000, rate_12hrs: 104000, rate_1_3days: 115000, rate_4days: 103500, rate_5_6days: 97800, rate_7plus_days: 92000, service_group: '1군', sort_order: 1 },
  { lotte_category: '경차', vehicle_names: '레이(G) ~23년식', rate_6hrs: 72000, rate_10hrs: 96000, rate_12hrs: 108000, rate_1_3days: 120000, rate_4days: 108000, rate_5_6days: 102000, rate_7plus_days: 96000, service_group: '1군', sort_order: 2 },
  { lotte_category: '경차', vehicle_names: '캐스퍼(G) ~24년식', rate_6hrs: 78000, rate_10hrs: 104000, rate_12hrs: 117000, rate_1_3days: 130000, rate_4days: 117000, rate_5_6days: 110500, rate_7plus_days: 104000, service_group: '1군', sort_order: 3 },

  // 소형 (2군)
  { lotte_category: '소형', vehicle_names: '아반떼(G) 24년식', rate_6hrs: 86000, rate_10hrs: 114000, rate_12hrs: 129000, rate_1_3days: 143000, rate_4days: 128700, rate_5_6days: 121600, rate_7plus_days: 114400, service_group: '2군', sort_order: 4 },
  { lotte_category: '소형', vehicle_names: '아반떼(H) 24년식', rate_6hrs: 105000, rate_10hrs: 140000, rate_12hrs: 158000, rate_1_3days: 175000, rate_4days: 157500, rate_5_6days: 148800, rate_7plus_days: 140000, service_group: '2군', sort_order: 5 },

  // 중형 (3군)
  { lotte_category: '중형', vehicle_names: '쏘나타(G) 24년식, K5(G) 24년식', rate_6hrs: 118000, rate_10hrs: 158000, rate_12hrs: 178000, rate_1_3days: 197000, rate_4days: 177300, rate_5_6days: 167500, rate_7plus_days: 157600, service_group: '3군', sort_order: 6 },
  { lotte_category: '중형', vehicle_names: '쏘나타(H) 24년식', rate_6hrs: 140000, rate_10hrs: 186000, rate_12hrs: 210000, rate_1_3days: 233000, rate_4days: 209700, rate_5_6days: 193800, rate_7plus_days: 177700, service_group: '3군', sort_order: 7 },
  { lotte_category: '중형', vehicle_names: 'G70 2.0(G) ~23년식', rate_6hrs: 216000, rate_10hrs: 288000, rate_12hrs: 324000, rate_1_3days: 360000, rate_4days: 324000, rate_5_6days: 306000, rate_7plus_days: 288000, service_group: '3군', sort_order: 8 },

  // 준대형 (4군)
  { lotte_category: '준대형', vehicle_names: 'K8 2.5(G) ~24년식', rate_6hrs: 194000, rate_10hrs: 259000, rate_12hrs: 292000, rate_1_3days: 324000, rate_4days: 291600, rate_5_6days: 275400, rate_7plus_days: 259200, service_group: '4군', sort_order: 9 },
  { lotte_category: '준대형', vehicle_names: '그랜저 2.5(G) ~24년식, K8 1.6(H) ~24년식', rate_6hrs: 204000, rate_10hrs: 272000, rate_12hrs: 306000, rate_1_3days: 340000, rate_4days: 306000, rate_5_6days: 289000, rate_7plus_days: 272000, service_group: '4군', sort_order: 10 },
  { lotte_category: '준대형', vehicle_names: 'G70 2.5(G) 24년식', rate_6hrs: 216000, rate_10hrs: 288000, rate_12hrs: 324000, rate_1_3days: 360000, rate_4days: 324000, rate_5_6days: 306000, rate_7plus_days: 288000, service_group: '4군', sort_order: 11 },
  { lotte_category: '준대형', vehicle_names: '그랜저 3.5(G) ~23년식, 그랜저 3.5(L) ~23년식', rate_6hrs: 228000, rate_10hrs: 304000, rate_12hrs: 342000, rate_1_3days: 380000, rate_4days: 342000, rate_5_6days: 323000, rate_7plus_days: 304000, service_group: '4군', sort_order: 12 },

  // 대형 (5군, 6군)
  { lotte_category: '대형', vehicle_names: 'G80 2.5(G) ~25년식, K9 3.3(G) ~22년식', rate_6hrs: 269000, rate_10hrs: 359000, rate_12hrs: 404000, rate_1_3days: 449000, rate_4days: 404100, rate_5_6days: 381700, rate_7plus_days: 359200, service_group: '5군', sort_order: 13 },
  { lotte_category: '대형', vehicle_names: 'G80 3.5(G) ~24년식, K9 3.8(G) ~24년식', rate_6hrs: 301000, rate_10hrs: 402000, rate_12hrs: 452000, rate_1_3days: 502000, rate_4days: 451800, rate_5_6days: 426700, rate_7plus_days: 401600, service_group: '5군', sort_order: 14 },
  { lotte_category: '대형', vehicle_names: 'G90 3.5(G) ~24년식', rate_6hrs: 322000, rate_10hrs: 430000, rate_12hrs: 484000, rate_1_3days: 537000, rate_4days: 483300, rate_5_6days: 456500, rate_7plus_days: 429600, service_group: '6군', sort_order: 15 },
  { lotte_category: '대형', vehicle_names: 'G90 5.0(G) ~21년식', rate_6hrs: 392000, rate_10hrs: 523000, rate_12hrs: 589000, rate_1_3days: 654000, rate_4days: 588600, rate_5_6days: 555900, rate_7plus_days: 523200, service_group: '6군', sort_order: 16 },
  { lotte_category: '대형', vehicle_names: 'G90 3.5(G) 롱휠베이스 ~23년식', rate_6hrs: 426000, rate_10hrs: 568000, rate_12hrs: 639000, rate_1_3days: 710000, rate_4days: 639000, rate_5_6days: 603500, rate_7plus_days: 568000, service_group: '6군', sort_order: 17 },

  // 승합 (9군)
  { lotte_category: '승합', vehicle_names: '스타렉스 11·12인승(D) ~21년식', rate_6hrs: 166000, rate_10hrs: 221000, rate_12hrs: 249000, rate_1_3days: 276000, rate_4days: 248000, rate_5_6days: 229600, rate_7plus_days: 210400, service_group: '9군', sort_order: 18 },
  { lotte_category: '승합', vehicle_names: '스타리아 11인승(D) ~24년식', rate_6hrs: 188000, rate_10hrs: 250000, rate_12hrs: 282000, rate_1_3days: 313000, rate_4days: 281700, rate_5_6days: 260400, rate_7plus_days: 238700, service_group: '9군', sort_order: 19 },
  { lotte_category: '승합', vehicle_names: '카니발 9인승(D) ~24년식', rate_6hrs: 202000, rate_10hrs: 269000, rate_12hrs: 303000, rate_1_3days: 336000, rate_4days: 302300, rate_5_6days: 279600, rate_7plus_days: 256300, service_group: '9군', sort_order: 20 },
  { lotte_category: '승합', vehicle_names: '스타리아 11인승(H) 24년식', rate_6hrs: 203000, rate_10hrs: 271000, rate_12hrs: 305000, rate_1_3days: 339000, rate_4days: 305100, rate_5_6days: 288200, rate_7plus_days: 271200, service_group: '9군', sort_order: 21 },
  { lotte_category: '승합', vehicle_names: '카니발 9인승(H) 24년식', rate_6hrs: 218000, rate_10hrs: 290000, rate_12hrs: 327000, rate_1_3days: 363000, rate_4days: 326700, rate_5_6days: 308600, rate_7plus_days: 290400, service_group: '9군', sort_order: 22 },
  { lotte_category: '승합', vehicle_names: '스타리아 9인승(H) 24년식', rate_6hrs: 221000, rate_10hrs: 294000, rate_12hrs: 331000, rate_1_3days: 368000, rate_4days: 331200, rate_5_6days: 312800, rate_7plus_days: 294400, service_group: '9군', sort_order: 23 },
  { lotte_category: '승합', vehicle_names: '카니발 9인승 하이리무진(D) ~23년식', rate_6hrs: 274000, rate_10hrs: 366000, rate_12hrs: 412000, rate_1_3days: 457000, rate_4days: 411300, rate_5_6days: 380200, rate_7plus_days: 348570, service_group: '9군', sort_order: 24 },
  { lotte_category: '승합', vehicle_names: '카니발 9인승 하이리무진(H) 24년식', rate_6hrs: 317000, rate_10hrs: 423000, rate_12hrs: 476000, rate_1_3days: 529000, rate_4days: 476100, rate_5_6days: 449700, rate_7plus_days: 423200, service_group: '9군', sort_order: 25 },
  { lotte_category: '승합', vehicle_names: '쏠라티 15인승(D) ~23년식', rate_6hrs: 389000, rate_10hrs: 518000, rate_12hrs: 583000, rate_1_3days: 648000, rate_4days: 583200, rate_5_6days: 550800, rate_7plus_days: 518400, service_group: '9군', sort_order: 26 },

  // SUV·RV 소형 (8군)
  { lotte_category: 'SUV·RV(소형)', vehicle_names: '코나(G) ~24년식, 니로(H) ~24년식, 셀토스(G) ~24년식', rate_6hrs: 130000, rate_10hrs: 174000, rate_12hrs: 196000, rate_1_3days: 217000, rate_4days: 195300, rate_5_6days: 184500, rate_7plus_days: 173600, service_group: '8군', sort_order: 27 },

  // SUV·RV 중형 (8군~10군)
  { lotte_category: 'SUV·RV(중형)', vehicle_names: '스포티지(D,G,H) ~24년식, 투싼(G,H) ~23년식', rate_6hrs: 157000, rate_10hrs: 210000, rate_12hrs: 236000, rate_1_3days: 262000, rate_4days: 235800, rate_5_6days: 222700, rate_7plus_days: 209600, service_group: '8군', sort_order: 28 },
  { lotte_category: 'SUV·RV(중형)', vehicle_names: '쏘렌토(D,G,H) ~23년식, 토레스(G) ~24년식', rate_6hrs: 176000, rate_10hrs: 234000, rate_12hrs: 264000, rate_1_3days: 293000, rate_4days: 263700, rate_5_6days: 249100, rate_7plus_days: 234400, service_group: '9군', sort_order: 29 },
  { lotte_category: 'SUV·RV(중형)', vehicle_names: '싼타페(G,H) 24년식, 쏘렌토(G,H) 24년식', rate_6hrs: 198000, rate_10hrs: 264000, rate_12hrs: 297000, rate_1_3days: 330000, rate_4days: 297000, rate_5_6days: 280500, rate_7plus_days: 264000, service_group: '9군', sort_order: 30 },
  { lotte_category: 'SUV·RV(중형)', vehicle_names: '팰리세이드(D) ~23년식', rate_6hrs: 241000, rate_10hrs: 322000, rate_12hrs: 362000, rate_1_3days: 402000, rate_4days: 361800, rate_5_6days: 341700, rate_7plus_days: 321600, service_group: '10군', sort_order: 31 },
  { lotte_category: 'SUV·RV(중형)', vehicle_names: 'GV70(D,G) ~24년식', rate_6hrs: 281000, rate_10hrs: 375000, rate_12hrs: 422000, rate_1_3days: 469000, rate_4days: 422100, rate_5_6days: 398700, rate_7plus_days: 375200, service_group: '10군', sort_order: 32 },
  { lotte_category: 'SUV·RV(중형)', vehicle_names: 'GV80(D,G) ~24년식', rate_6hrs: 317000, rate_10hrs: 423000, rate_12hrs: 476000, rate_1_3days: 529000, rate_4days: 476100, rate_5_6days: 449700, rate_7plus_days: 423200, service_group: '10군', sort_order: 33 },

  // 수입차 (10군)
  { lotte_category: '수입차', vehicle_names: 'MINI COOPER, BENZ A220, JEEP RENEGADE', rate_6hrs: 237000, rate_10hrs: 316000, rate_12hrs: 356000, rate_1_3days: 395000, rate_4days: 355500, rate_5_6days: 335800, rate_7plus_days: 316000, service_group: '10군', sort_order: 34 },
  { lotte_category: '수입차', vehicle_names: 'MINI COOPER S, VOLKSWAGEN TIGUAN', rate_6hrs: 253000, rate_10hrs: 338000, rate_12hrs: 380000, rate_1_3days: 422000, rate_4days: 379800, rate_5_6days: 358700, rate_7plus_days: 337600, service_group: '10군', sort_order: 35 },
  { lotte_category: '수입차', vehicle_names: 'AUDI Q3, BMW 320D, BENZ EQA·C200, FORD EXPLORER', rate_6hrs: 303000, rate_10hrs: 404000, rate_12hrs: 455000, rate_1_3days: 505000, rate_4days: 454500, rate_5_6days: 429300, rate_7plus_days: 404000, service_group: '10군', sort_order: 36 },
  { lotte_category: '수입차', vehicle_names: 'AUDI A6, BMW 520D·523D·520I·530I, BENZ C300·E200·E220·E250·E300, LEXUS ES300H, VOLVO XC60', rate_6hrs: 345000, rate_10hrs: 460000, rate_12hrs: 518000, rate_1_3days: 575000, rate_4days: 517500, rate_5_6days: 488800, rate_7plus_days: 460000, service_group: '10군', sort_order: 37 },
  { lotte_category: '수입차', vehicle_names: 'AUDI A5 CABRIOLET·A7, BENZ CLE200 CABRIOLET', rate_6hrs: 354000, rate_10hrs: 472000, rate_12hrs: 531000, rate_1_3days: 590000, rate_4days: 531000, rate_5_6days: 501500, rate_7plus_days: 472000, service_group: '10군', sort_order: 38 },
  { lotte_category: '수입차', vehicle_names: 'BENZ E350, GLE300D', rate_6hrs: 379000, rate_10hrs: 505000, rate_12hrs: 568000, rate_1_3days: 631500, rate_4days: 568400, rate_5_6days: 536800, rate_7plus_days: 505200, service_group: '10군', sort_order: 39 },
  { lotte_category: '수입차', vehicle_names: 'BMW 550I, M3', rate_6hrs: 396000, rate_10hrs: 528000, rate_12hrs: 594000, rate_1_3days: 660000, rate_4days: 594000, rate_5_6days: 561000, rate_7plus_days: 528000, service_group: '10군', sort_order: 40 },
  { lotte_category: '수입차', vehicle_names: 'BENZ GLC300·GLC220D, BMW X3·X4', rate_6hrs: 399000, rate_10hrs: 532000, rate_12hrs: 599000, rate_1_3days: 665400, rate_4days: 598900, rate_5_6days: 565600, rate_7plus_days: 532300, service_group: '10군', sort_order: 41 },
  { lotte_category: '수입차', vehicle_names: 'BENZ CLS 300·CLS 450', rate_6hrs: 413000, rate_10hrs: 550000, rate_12hrs: 619000, rate_1_3days: 688000, rate_4days: 619200, rate_5_6days: 584800, rate_7plus_days: 550400, service_group: '10군', sort_order: 42 },
  { lotte_category: '수입차', vehicle_names: 'BMW X5·X6, RANGE ROVER VELAR', rate_6hrs: 422000, rate_10hrs: 562000, rate_12hrs: 633000, rate_1_3days: 703000, rate_4days: 632700, rate_5_6days: 597600, rate_7plus_days: 562400, service_group: '10군', sort_order: 43 },
  { lotte_category: '수입차', vehicle_names: 'BMW X7, BENZ GLE450·GLS400D', rate_6hrs: 460000, rate_10hrs: 613000, rate_12hrs: 690000, rate_1_3days: 766000, rate_4days: 689400, rate_5_6days: 651100, rate_7plus_days: 612800, service_group: '10군', sort_order: 44 },
  { lotte_category: '수입차', vehicle_names: 'AUDI Q7, BENZ SPRINTER', rate_6hrs: 486000, rate_10hrs: 648000, rate_12hrs: 729000, rate_1_3days: 810000, rate_4days: 729000, rate_5_6days: 688500, rate_7plus_days: 648000, service_group: '10군', sort_order: 45 },
  { lotte_category: '수입차', vehicle_names: 'BENZ S500', rate_6hrs: 616000, rate_10hrs: 822000, rate_12hrs: 925000, rate_1_3days: 1027000, rate_4days: 924300, rate_5_6days: 873000, rate_7plus_days: 821600, service_group: '10군', sort_order: 46 },

  // 전기차 (급별 매핑)
  { lotte_category: '전기차', vehicle_names: '코나EV ~24년식, 니로EV ~24년식', rate_6hrs: 125000, rate_10hrs: 166000, rate_12hrs: 187000, rate_1_3days: 208000, rate_4days: 187200, rate_5_6days: 176800, rate_7plus_days: 166400, service_group: '1군', sort_order: 47 },
  { lotte_category: '전기차', vehicle_names: '아이오닉5 2WD ~23년식, EV6 2WD ~23년식', rate_6hrs: 138000, rate_10hrs: 184000, rate_12hrs: 207000, rate_1_3days: 230000, rate_4days: 207000, rate_5_6days: 195500, rate_7plus_days: 184000, service_group: '2군', sort_order: 48 },
  { lotte_category: '전기차', vehicle_names: 'EV6 4WD ~23년식, 아이오닉5 4WD ~23년식', rate_6hrs: 186000, rate_10hrs: 248000, rate_12hrs: 279000, rate_1_3days: 310000, rate_4days: 279000, rate_5_6days: 263500, rate_7plus_days: 248000, service_group: '3군', sort_order: 49 },
  { lotte_category: '전기차', vehicle_names: '아이오닉6 ~23년식', rate_6hrs: 210000, rate_10hrs: 280000, rate_12hrs: 315000, rate_1_3days: 350000, rate_4days: 315000, rate_5_6days: 297500, rate_7plus_days: 280000, service_group: '3군', sort_order: 50 },
  { lotte_category: '전기차', vehicle_names: 'GV60 ~22년식', rate_6hrs: 269000, rate_10hrs: 358000, rate_12hrs: 403000, rate_1_3days: 448000, rate_4days: 403200, rate_5_6days: 380800, rate_7plus_days: 358400, service_group: '5군', sort_order: 51 },
  { lotte_category: '전기차', vehicle_names: 'GV70EV 22년식, EV9 24년식, TESLA MODEL 3', rate_6hrs: 283000, rate_10hrs: 378000, rate_12hrs: 425000, rate_1_3days: 472000, rate_4days: 424800, rate_5_6days: 401200, rate_7plus_days: 377600, service_group: '5군', sort_order: 52 },
  { lotte_category: '전기차', vehicle_names: 'G80EV ~24년식, TESLA MODEL Y', rate_6hrs: 316000, rate_10hrs: 422000, rate_12hrs: 475000, rate_1_3days: 527000, rate_4days: 474300, rate_5_6days: 448000, rate_7plus_days: 421600, service_group: '6군', sort_order: 53 },
  { lotte_category: '전기차', vehicle_names: 'TESLA MODEL X', rate_6hrs: 460000, rate_10hrs: 613000, rate_12hrs: 690000, rate_1_3days: 766000, rate_4days: 689400, rate_5_6days: 651100, rate_7plus_days: 612800, service_group: '10군', sort_order: 54 },
]

// ─── 기본 정비군 (롯데 기준 매핑) — 10군 체계 (7군 없음), 전기차 제외 평균 ───
const DEFAULT_GROUPS: Omit<RateRow, 'id'>[] = [
  { service_group: '1군', vehicle_class: '경차', displacement_range: '1,000cc 이하', daily_rate: 0, lotte_base_rate: 122000, discount_percent: 40, calc_method: 'auto', sort_order: 1, is_active: true },
  { service_group: '2군', vehicle_class: '소형 승용', displacement_range: '1,600cc 이하', daily_rate: 0, lotte_base_rate: 159000, discount_percent: 40, calc_method: 'auto', sort_order: 2, is_active: true },
  { service_group: '3군', vehicle_class: '중형 승용', displacement_range: '2,000cc 이하', daily_rate: 0, lotte_base_rate: 263000, discount_percent: 40, calc_method: 'auto', sort_order: 3, is_active: true },
  { service_group: '4군', vehicle_class: '준대형 승용', displacement_range: '3,500cc 이하', daily_rate: 0, lotte_base_rate: 351000, discount_percent: 40, calc_method: 'auto', sort_order: 4, is_active: true },
  { service_group: '5군', vehicle_class: '대형 승용', displacement_range: '3,800cc 이하', daily_rate: 0, lotte_base_rate: 476000, discount_percent: 40, calc_method: 'auto', sort_order: 5, is_active: true },
  { service_group: '6군', vehicle_class: '초대형 승용', displacement_range: '5,000cc 이하', daily_rate: 0, lotte_base_rate: 634000, discount_percent: 40, calc_method: 'auto', sort_order: 6, is_active: true },
  { service_group: '8군', vehicle_class: 'RV·SUV·승합 (소형)', displacement_range: '2,000cc 미만', daily_rate: 0, lotte_base_rate: 240000, discount_percent: 40, calc_method: 'auto', sort_order: 8, is_active: true },
  { service_group: '9군', vehicle_class: 'RV·SUV·승합 (중대형)', displacement_range: '2,000cc 이상', daily_rate: 0, lotte_base_rate: 387000, discount_percent: 40, calc_method: 'auto', sort_order: 9, is_active: true },
  { service_group: '10군', vehicle_class: 'RV·SUV·승합 (프리미엄)', displacement_range: '프리미엄', daily_rate: 0, lotte_base_rate: 615000, discount_percent: 40, calc_method: 'auto', sort_order: 10, is_active: true },
]

const ALL_GROUPS = ['1군', '2군', '3군', '4군', '5군', '6군', '8군', '9군', '10군']

const DAY_PRESETS = [5, 10, 15, 20]
const SUB_TABS = [
  { key: 'settings', label: '요금 조회', icon: '🔍' },
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
  const [customerCompany, setCustomerCompany] = useState('')
  const [contractPeriod, setContractPeriod] = useState('1년')
  const [contractStart, setContractStart] = useState('')
  const [vehicleCount, setVehicleCount] = useState<number>(0)
  const [contractMemo, setContractMemo] = useState('')
  const [showPreview, setShowPreview] = useState(false)
  const [showPriceCard, setShowPriceCard] = useState(false)
  const [quoteSaving, setQuoteSaving] = useState(false)

  // 수익성 시뮬레이션
  const [simAccidentRate, setSimAccidentRate] = useState(0.75) // 100대당 연간 사고건수
  const [simBreakdownRate, setSimBreakdownRate] = useState(2.0) // 100대당 연간 고장건수
  const [simAvgRepairDays, setSimAvgRepairDays] = useState(7)  // 평균 수리일수
  const [simAvgBreakdownDays, setSimAvgBreakdownDays] = useState(4) // 평균 고장수리일수

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

  // ─── 롯데 요금 자동 업데이트 (크롤링) ───
  const fetchLotteRatesAuto = async () => {
    setLotteUpdating(true)
    try {
      const res = await fetch('/api/fetch-lotte-rates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ region: 'inland' }),
      })
      const result = await res.json()
      if (result.success && result.data?.length > 0) {
        const newRates = result.data.map((d: any, i: number) => ({ ...d, id: `lotte_auto_${i}` }))
        setLotteRates(newRates)
        setLotteUpdateDate(new Date().toLocaleDateString('ko-KR'))
        alert(`롯데렌터카 요금 ${result.count}건을 자동으로 가져왔습니다!\n가져온 시각: ${new Date().toLocaleString('ko-KR')}\n\n확인 후 [저장] 버튼을 눌러 DB에 반영하세요.`)
        setLotteEditMode(true) // 확인할 수 있도록 편집모드 활성화
      } else {
        alert('자동 업데이트 실패: ' + (result.error || '알 수 없는 오류') + '\n\n수동 업데이트를 이용해주세요.')
      }
    } catch (e: any) {
      alert('자동 업데이트 실패: ' + e.message + '\n\n수동 업데이트를 이용해주세요.')
    }
    setLotteUpdating(false)
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
    // 롯데 요금은 VAT 포함가 → 역산: 공급가액 = total / 1.1
    const supplyPrice = Math.round(total / 1.1)
    const vat = total - supplyPrice
    return { items, total, supplyPrice, vat, totalWithVat: total }
  }, [selectedPkgs, rates])

  // ─── 수익성 시뮬레이션 ───
  const simResult = useMemo(() => {
    if (vehicleCount <= 0 || selectedPkgs.length === 0) return null
    const n = vehicleCount
    // 사고 대차 예상
    const accidentCases = Math.round(n * simAccidentRate / 100 * 10) / 10
    const accidentDays = Math.round(accidentCases * simAvgRepairDays * 10) / 10
    // 고장 대차 예상
    const breakdownCases = Math.round(n * simBreakdownRate / 100 * 10) / 10
    const breakdownDays = Math.round(breakdownCases * simAvgBreakdownDays * 10) / 10
    // 총 예상 대차일수
    const totalExpectedDays = Math.round((accidentDays + breakdownDays) * 10) / 10
    // 계약 제공일수 (선택한 패키지 중 최대 days 기준)
    const contractDays = selectedPkgs.reduce((max, p) => Math.max(max, p.days), 0)
    // 여유 일수
    const surplusDays = contractDays - totalExpectedDays
    // 평균 1일 단가
    const avgDailyRate = quoteTotals.items.length > 0
      ? Math.round(quoteTotals.items.reduce((s: number, it: any) => s + (it?.dailyRate || 0), 0) / quoteTotals.items.length)
      : 0
    // 수익/손실 금액
    const surplusAmount = Math.round(surplusDays * avgDailyRate)
    // 소진율
    const usageRate = contractDays > 0 ? Math.round(totalExpectedDays / contractDays * 100 * 10) / 10 : 0
    return {
      accidentCases, accidentDays, breakdownCases, breakdownDays,
      totalExpectedDays, contractDays, surplusDays, surplusAmount,
      avgDailyRate, usageRate,
    }
  }, [vehicleCount, selectedPkgs, simAccidentRate, simBreakdownRate, simAvgRepairDays, simAvgBreakdownDays, quoteTotals])

  // ─── 엑셀 다운로드 ───
  const exportExcel = async () => {
    const XLSX = (await import('xlsx')).default
    const wb = XLSX.utils.book_new()

    for (const days of customDays) {
      const data: any[][] = []
      data.push(['단기대차 서비스 표준 단가표'])
      data.push([`할인율: 롯데 대비 ${globalDiscount}%`, '', '', '', `기준일: ${new Date().toLocaleDateString('ko-KR')}`])
      data.push([])
      data.push(['구분', '차종', '배기량', '정비군', '롯데 단가', '턴키 단가', `연 ${days}일 금액`])

      // 승용
      const sedan = rates.filter(r => ['1군', '2군', '3군', '4군', '5군', '6군'].includes(r.service_group))
      sedan.forEach((r, i) => {
        const dr = r.calc_method === 'auto' ? calcRate(r.lotte_base_rate, r.discount_percent) : r.daily_rate
        data.push([i === 0 ? '승용' : '', r.vehicle_class, r.displacement_range, r.service_group, r.lotte_base_rate, dr, dr * days])
      })

      // RV·SUV·승합
      const rv = rates.filter(r => ['8군', '9군', '10군'].includes(r.service_group))
      rv.forEach((r, i) => {
        const dr = r.calc_method === 'auto' ? calcRate(r.lotte_base_rate, r.discount_percent) : r.daily_rate
        data.push([i === 0 ? 'RV·SUV·승합' : '', r.vehicle_class, r.displacement_range, r.service_group, r.lotte_base_rate, dr, dr * days])
      })

      data.push([])
      data.push(['※ 상기 단가는 VAT 포함 기준이며, 계약 조건에 따라 변동될 수 있습니다.'])

      const ws = XLSX.utils.aoa_to_sheet(data)
      ws['!cols'] = [{ wch: 14 }, { wch: 20 }, { wch: 14 }, { wch: 8 }, { wch: 12 }, { wch: 12 }, { wch: 16 }]
      XLSX.utils.book_append_sheet(wb, ws, `연 ${days}일`)
    }

    // 수익성 시뮬레이션 시트
    if (simResult) {
      const simData = [
        ['수익성 시뮬레이션'],
        [],
        ['항목', '값', '단위'],
        ['보유 차량수', vehicleCount, '대'],
        ['사고율 (100대당)', simAccidentRate, '건/년'],
        ['고장율 (100대당)', simBreakdownRate, '건/년'],
        ['평균 사고수리 일수', simAvgRepairDays, '일'],
        ['평균 고장수리 일수', simAvgBreakdownDays, '일'],
        [],
        ['예상 사고 대차 건수', simResult.accidentCases, '건/년'],
        ['예상 사고 대차 일수', simResult.accidentDays, '일/년'],
        ['예상 고장 대차 건수', simResult.breakdownCases, '건/년'],
        ['예상 고장 대차 일수', simResult.breakdownDays, '일/년'],
        ['총 예상 대차일수', simResult.totalExpectedDays, '일/년'],
        [],
        ['계약 제공일수', simResult.contractDays, '일'],
        ['여유 일수', simResult.surplusDays, '일'],
        ['소진율', `${simResult.usageRate}%`, ''],
        ['예상 수익/손실', simResult.surplusAmount, '원'],
      ]
      const simWs = XLSX.utils.aoa_to_sheet(simData)
      simWs['!cols'] = [{ wch: 22 }, { wch: 14 }, { wch: 8 }]
      XLSX.utils.book_append_sheet(wb, simWs, '수익성 분석')
    }

    XLSX.writeFile(wb, `턴키렌터_단가표_${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

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

  // ─── 빠른 견적 계산기 상태 ───
  const [qcCategory, setQcCategory] = useState<string>('')
  const [qcVehicle, setQcVehicle] = useState<string>('')
  const [qcDateMode, setQcDateMode] = useState<'days' | 'range'>('days')
  const [qcDays, setQcDays] = useState<number>(1)
  const [qcHours, setQcHours] = useState<number>(0)
  const [qcStartDate, setQcStartDate] = useState<string>('')
  const [qcStartTime, setQcStartTime] = useState<string>('09:00')
  const [qcEndDate, setQcEndDate] = useState<string>('')
  const [qcEndTime, setQcEndTime] = useState<string>('18:00')

  // 사고 과실비율
  const [qcFaultEnabled, setQcFaultEnabled] = useState<boolean>(false)
  const [qcFaultPercent, setQcFaultPercent] = useState<number>(100)  // 자차과실 %
  const [qcServiceSupport, setQcServiceSupport] = useState<number>(0) // 서비스과실지원 %

  const RATE_FIELD_LABEL: Record<string, string> = { rate_6hrs: '6시간', rate_10hrs: '10시간', rate_12hrs: '12시간', rate_1_3days: '1~3일', rate_4days: '4일', rate_5_6days: '5~6일', rate_7plus_days: '7일+' }

  // 빠른 견적용 카테고리 목록
  const qcCategories = useMemo(() => [...new Set(lotteRates.map(r => r.lotte_category))], [lotteRates])
  const qcVehicles = useMemo(() => {
    if (!qcCategory) return []
    return lotteRates.filter(r => r.lotte_category === qcCategory)
  }, [lotteRates, qcCategory])
  const qcSelectedRate = useMemo(() => {
    if (!qcVehicle) return null
    return lotteRates.find(r => r.vehicle_names === qcVehicle) || null
  }, [lotteRates, qcVehicle])

  // 총 시간 계산 (일+시간 또는 날짜+시간 범위)
  const qcTotalHours = useMemo(() => {
    if (qcDateMode === 'days') return qcDays * 24 + qcHours
    if (qcStartDate && qcEndDate) {
      const s = new Date(`${qcStartDate}T${qcStartTime || '09:00'}`)
      const e = new Date(`${qcEndDate}T${qcEndTime || '18:00'}`)
      const diffMs = e.getTime() - s.getTime()
      return diffMs > 0 ? diffMs / (1000 * 60 * 60) : 0
    }
    return 0
  }, [qcDateMode, qcDays, qcHours, qcStartDate, qcStartTime, qcEndDate, qcEndTime])

  // 일수 → 요율 필드 매핑 헬퍼
  const getDayRateField = (days: number): string => {
    if (days >= 7) return 'rate_7plus_days'
    if (days >= 5) return 'rate_5_6days'
    if (days === 4) return 'rate_4days'
    return 'rate_1_3days'
  }
  const getHourRateField = (hours: number): string => {
    if (hours <= 6) return 'rate_6hrs'
    if (hours <= 10) return 'rate_10hrs'
    if (hours <= 12) return 'rate_12hrs'
    return 'rate_1_3days' // 12시간 초과 → 1일 요금
  }

  // 복합 요율 계산: 일수 + 잔여시간 분리 계산
  // 예) 3일 6시간 = 1~3일 요율 ×3 + 6시간 요율 ×1
  // 12시간 초과 잔여 시간 → 1일 추가로 올림
  const qcCalcBreakdown = useMemo(() => {
    let days = qcDateMode === 'days' ? qcDays : (qcStartDate && qcEndDate ? Math.floor(qcTotalHours / 24) : 0)
    let remainHours = qcDateMode === 'days' ? qcHours : (qcTotalHours > 0 ? Math.round(qcTotalHours % 24) : 0)

    // 12시간 초과 잔여시간은 1일로 올림
    if (remainHours > 12) {
      days += 1
      remainHours = 0
    }

    if (days <= 0 && remainHours <= 0) return { parts: [], label: '' }

    const parts: { field: string; qty: number; label: string; isHour?: boolean }[] = []
    // 일수 파트
    if (days > 0) {
      const dayField = getDayRateField(days)
      parts.push({ field: dayField, qty: days, label: `${RATE_FIELD_LABEL[dayField]} ×${days}일` })
    }
    // 잔여 시간 파트 (12시간 이하)
    if (remainHours > 0) {
      const hourField = getHourRateField(remainHours)
      parts.push({ field: hourField, qty: 1, label: `${RATE_FIELD_LABEL[hourField]} ×1`, isHour: true })
    }
    const label = parts.map(p => p.label).join(' + ')
    return { parts, label }
  }, [qcDateMode, qcDays, qcHours, qcTotalHours, qcStartDate, qcEndDate])

  // 빠른 견적 금액 계산 (복합 요율) — 영수증 형태 상세 내역
  const qcResult = useMemo(() => {
    if (!qcSelectedRate || qcCalcBreakdown.parts.length === 0) return null
    let totalBase = 0, totalDisc = 0
    const lines: { label: string; rateType: string; unitBase: number; unitDisc: number; qty: number; subtotalBase: number; subtotalDisc: number }[] = []
    for (const part of qcCalcBreakdown.parts) {
      const base = (qcSelectedRate as any)[part.field] || 0
      const disc = calcRate(base, globalDiscount)
      const sub = disc * part.qty
      totalBase += base * part.qty
      totalDisc += sub
      lines.push({
        label: RATE_FIELD_LABEL[part.field],
        rateType: part.field,
        unitBase: base,
        unitDisc: disc,
        qty: part.qty,
        subtotalBase: base * part.qty,
        subtotalDisc: sub,
      })
    }
    const discountAmount = totalBase - totalDisc

    // 과실비율 적용 — 모두 전체 금액(할인적용가) 대비 %
    // 자차과실부담금 = 할인적용가 × (자차과실% / 100)
    // 서비스지원금 = 할인적용가 × (서비스지원% / 100)
    // 최종부담금 = 자차과실부담금 - 서비스지원금 (최소 0)
    const faultActive = qcFaultEnabled && qcFaultPercent < 100
    const faultAmount = faultActive ? Math.round(totalDisc * qcFaultPercent / 100) : totalDisc
    const supportAmount = faultActive && qcServiceSupport > 0 ? Math.round(totalDisc * qcServiceSupport / 100) : 0
    const finalAmount = faultActive ? Math.max(0, faultAmount - supportAmount) : totalDisc

    // 롯데 요금은 VAT 포함가이므로, 할인 적용가도 VAT 포함
    // 역산: 공급가액 = 최종금액 / 1.1, VAT = 최종금액 - 공급가액
    const supplyPrice = Math.round(finalAmount / 1.1)
    const vat = finalAmount - supplyPrice
    return {
      lines, totalBase, totalDisc, discountAmount,
      faultActive, faultPercent: qcFaultPercent, faultAmount, serviceSupport: qcServiceSupport, supportAmount, finalAmount,
      supplyPrice, vat, totalWithVat: finalAmount,
    }
  }, [qcSelectedRate, qcCalcBreakdown, globalDiscount, qcFaultEnabled, qcFaultPercent, qcServiceSupport])

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
      {/* 탭 1: 요금 조회 (빠른 계산기 + 매핑 + 롯데 요금표) */}
      {/* ═════════════════════════════════════════════ */}
      {subTab === 'settings' && (
        <div className="space-y-4">

          {/* ─── 빠른 견적 계산기 (고객 응대용) + 할인율 통합 ─── */}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="bg-gradient-to-r from-steel-50 to-purple-50/30 border-b border-gray-100 px-5 py-3 flex items-center justify-between">
              <span className="font-bold text-gray-800 text-sm">빠른 견적 계산기 <span className="text-xs text-gray-400 font-medium ml-1">차종 선택 → 기간 입력 → 예상금액</span></span>
            </div>
            <div className="p-5 space-y-4">
              {/* 할인율 슬라이더 (인라인) */}
              <div className="flex items-center gap-3 bg-purple-50/50 rounded-xl px-4 py-2.5">
                <span className="text-sm font-bold text-purple-700 shrink-0">할인율</span>
                <input type="range" min={10} max={100} step={5} value={globalDiscount}
                  onChange={e => applyGlobalDiscount(Number(e.target.value))}
                  className="flex-1 h-2 bg-purple-200 rounded-lg appearance-none cursor-pointer accent-purple-600" />
                <div className="flex items-center gap-1">
                  <input type="number" min={1} max={100} value={globalDiscount}
                    onChange={e => applyGlobalDiscount(Number(e.target.value))}
                    className="w-14 border border-purple-200 px-2 py-1 rounded-lg text-center font-bold text-purple-700 text-sm focus:border-purple-500 outline-none bg-white" />
                  <span className="text-sm font-bold text-purple-400">%</span>
                </div>
                <span className="text-xs text-purple-400 font-bold shrink-0">롯데 대비</span>
              </div>

              {/* 1행: 카테고리 + 차종 선택 */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-500 mb-1.5">카테고리</label>
                  <select value={qcCategory} onChange={e => { setQcCategory(e.target.value); setQcVehicle('') }}
                    className="w-full border border-gray-200 px-3 py-2 rounded-lg font-bold text-sm focus:border-steel-500 outline-none bg-white">
                    <option value="">선택하세요</option>
                    {qcCategories.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 mb-1.5">차종</label>
                  <select value={qcVehicle} onChange={e => setQcVehicle(e.target.value)}
                    className="w-full border border-gray-200 px-3 py-2 rounded-lg font-bold text-sm focus:border-steel-500 outline-none bg-white" disabled={!qcCategory}>
                    <option value="">선택하세요</option>
                    {qcVehicles.map((v, i) => <option key={i} value={v.vehicle_names}>{v.vehicle_names} ({v.service_group})</option>)}
                  </select>
                </div>
              </div>

              {/* 2행: 사용 기간 (일+시간 또는 날짜+시간) — 요율은 자동 결정 */}
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <label className="text-xs font-bold text-gray-500">사용 기간</label>
                  <div className="flex gap-1">
                    <button onClick={() => setQcDateMode('days')}
                      className={`text-xs px-2.5 py-1 rounded-lg font-bold transition-colors ${qcDateMode === 'days' ? 'bg-steel-600 text-white' : 'bg-gray-100 text-gray-400'}`}>일/시간 입력</button>
                    <button onClick={() => setQcDateMode('range')}
                      className={`text-xs px-2.5 py-1 rounded-lg font-bold transition-colors ${qcDateMode === 'range' ? 'bg-steel-600 text-white' : 'bg-gray-100 text-gray-400'}`}>날짜/시간 선택</button>
                  </div>
                  {qcCalcBreakdown.parts.length > 0 && (
                    <span className="text-xs font-bold text-steel-500 bg-steel-50 px-2 py-0.5 rounded-lg ml-auto">자동 적용: {qcCalcBreakdown.label}</span>
                  )}
                </div>
                {qcDateMode === 'days' ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <input type="number" min={0} max={365} value={qcDays} onChange={e => setQcDays(Number(e.target.value))}
                        className="w-20 border border-gray-200 px-3 py-2 rounded-lg font-bold text-sm text-center focus:border-steel-500 outline-none" />
                      <span className="text-sm font-bold text-gray-500">일</span>
                      <input type="number" min={0} max={23} value={qcHours} onChange={e => setQcHours(Number(e.target.value))}
                        className="w-20 border border-gray-200 px-3 py-2 rounded-lg font-bold text-sm text-center focus:border-steel-500 outline-none" />
                      <span className="text-sm font-bold text-gray-500">시간</span>
                      <span className="text-xs text-gray-400 ml-1">= 총 {qcTotalHours > 0 ? (qcTotalHours < 24 ? `${qcTotalHours}시간` : `${Math.floor(qcTotalHours / 24)}일 ${Math.round(qcTotalHours % 24)}시간`) : '0'}</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {/* 시간 단위 */}
                      {[
                        { d: 0, h: 6, label: '6시간' }, { d: 0, h: 10, label: '10시간' }, { d: 0, h: 12, label: '12시간' },
                      ].map((p, i) => (
                        <button key={`h${i}`} onClick={() => { setQcDays(p.d); setQcHours(p.h) }}
                          className={`text-xs px-2.5 py-1 rounded-lg font-bold transition-colors ${qcDays === p.d && qcHours === p.h ? 'bg-orange-500 text-white' : 'bg-orange-50 text-orange-500 hover:bg-orange-100'}`}>
                          {p.label}
                        </button>
                      ))}
                      <span className="text-gray-300 mx-0.5">|</span>
                      {/* 단기 (1~3일) */}
                      {[
                        { d: 1, h: 0, label: '1일' }, { d: 2, h: 0, label: '2일' }, { d: 3, h: 0, label: '3일' },
                      ].map((p, i) => (
                        <button key={`s${i}`} onClick={() => { setQcDays(p.d); setQcHours(p.h) }}
                          className={`text-xs px-2.5 py-1 rounded-lg font-bold transition-colors ${qcDays === p.d && qcHours === p.h ? 'bg-steel-600 text-white' : 'bg-gray-100 text-gray-500 hover:bg-steel-100 hover:text-steel-700'}`}>
                          {p.label}
                        </button>
                      ))}
                      <span className="text-gray-300 mx-0.5">|</span>
                      {/* 중기 (4~7일) */}
                      {[
                        { d: 4, h: 0, label: '4일' }, { d: 5, h: 0, label: '5일' }, { d: 7, h: 0, label: '7일' },
                      ].map((p, i) => (
                        <button key={`m${i}`} onClick={() => { setQcDays(p.d); setQcHours(p.h) }}
                          className={`text-xs px-2.5 py-1 rounded-lg font-bold transition-colors ${qcDays === p.d && qcHours === p.h ? 'bg-steel-600 text-white' : 'bg-gray-100 text-gray-500 hover:bg-steel-100 hover:text-steel-700'}`}>
                          {p.label}
                        </button>
                      ))}
                      <span className="text-gray-300 mx-0.5">|</span>
                      {/* 장기 (14일+) */}
                      {[
                        { d: 14, h: 0, label: '14일' }, { d: 30, h: 0, label: '30일' },
                      ].map((p, i) => (
                        <button key={`l${i}`} onClick={() => { setQcDays(p.d); setQcHours(p.h) }}
                          className={`text-xs px-2.5 py-1 rounded-lg font-bold transition-colors ${qcDays === p.d && qcHours === p.h ? 'bg-steel-600 text-white' : 'bg-gray-100 text-gray-500 hover:bg-steel-100 hover:text-steel-700'}`}>
                          {p.label}
                        </button>
                      ))}
                      <span className="text-gray-300 mx-0.5">|</span>
                      {/* 복합 (일+시간) */}
                      {[
                        { d: 3, h: 6, label: '3일+6h' }, { d: 5, h: 10, label: '5일+10h' }, { d: 7, h: 6, label: '7일+6h' },
                      ].map((p, i) => (
                        <button key={`c${i}`} onClick={() => { setQcDays(p.d); setQcHours(p.h) }}
                          className={`text-xs px-2.5 py-1 rounded-lg font-bold transition-colors ${qcDays === p.d && qcHours === p.h ? 'bg-purple-600 text-white' : 'bg-purple-50 text-purple-500 hover:bg-purple-100'}`}>
                          {p.label}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 flex-wrap">
                    <input type="date" value={qcStartDate} onChange={e => setQcStartDate(e.target.value)}
                      className="border border-gray-200 px-3 py-2 rounded-lg font-bold text-sm focus:border-steel-500 outline-none" />
                    <input type="time" value={qcStartTime} onChange={e => setQcStartTime(e.target.value)}
                      className="w-28 border border-gray-200 px-3 py-2 rounded-lg font-bold text-sm focus:border-steel-500 outline-none" />
                    <span className="text-sm text-gray-400 font-bold">~</span>
                    <input type="date" value={qcEndDate} onChange={e => setQcEndDate(e.target.value)}
                      className="border border-gray-200 px-3 py-2 rounded-lg font-bold text-sm focus:border-steel-500 outline-none" />
                    <input type="time" value={qcEndTime} onChange={e => setQcEndTime(e.target.value)}
                      className="w-28 border border-gray-200 px-3 py-2 rounded-lg font-bold text-sm focus:border-steel-500 outline-none" />
                    {qcTotalHours > 0 && (
                      <span className="text-xs text-gray-400 font-bold ml-1">= 총 {qcTotalHours < 24 ? `${Math.round(qcTotalHours)}시간` : `${Math.floor(qcTotalHours / 24)}일 ${Math.round(qcTotalHours % 24)}시간`}</span>
                    )}
                  </div>
                )}
              </div>

              {/* 3행: 사고 과실비율 (한 줄) */}
              <div className="flex items-center gap-3 flex-wrap">
                <label className="text-xs font-bold text-gray-500 shrink-0">사고 과실</label>
                <button onClick={() => setQcFaultEnabled(!qcFaultEnabled)}
                  className={`relative w-9 h-5 rounded-full transition-colors shrink-0 ${qcFaultEnabled ? 'bg-orange-500' : 'bg-gray-200'}`}>
                  <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${qcFaultEnabled ? 'left-[18px]' : 'left-0.5'}`} />
                </button>
                {qcFaultEnabled ? (
                  <>
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-bold text-orange-700 shrink-0">자차과실</span>
                      <input type="number" min={0} max={100} step={5} value={qcFaultPercent}
                        onChange={e => setQcFaultPercent(Math.min(100, Math.max(0, Number(e.target.value))))}
                        className="w-14 border border-orange-200 px-1.5 py-1.5 rounded-lg font-bold text-sm text-center focus:border-orange-500 outline-none" />
                      <span className="text-sm font-bold text-orange-400">%</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-bold text-green-700 shrink-0">서비스지원</span>
                      <input type="number" min={0} max={100} step={5} value={qcServiceSupport}
                        onChange={e => setQcServiceSupport(Math.min(100, Math.max(0, Number(e.target.value))))}
                        className="w-14 border border-green-200 px-1.5 py-1.5 rounded-lg font-bold text-sm text-center focus:border-green-500 outline-none" />
                      <span className="text-sm font-bold text-green-400">%</span>
                    </div>
                    <span className="text-xs text-gray-400 ml-auto shrink-0">실부담 = {qcFaultPercent}% − {qcServiceSupport}% = {Math.max(0, qcFaultPercent - qcServiceSupport)}%</span>
                  </>
                ) : (
                  <span className="text-xs text-gray-400">미적용 (100% 부담)</span>
                )}
              </div>

              {/* 결과 표시 — 영수증 스타일 */}
              {qcResult && qcSelectedRate && (
                <div className="bg-gradient-to-r from-steel-50 to-purple-50/30 rounded-xl border border-steel-200/50 overflow-hidden">
                  {/* 차종 정보 */}
                  <div className="px-4 py-2.5 border-b border-steel-200/30 bg-white/40">
                    <div className="text-sm text-gray-600">
                      <span className="font-bold text-gray-800">{qcSelectedRate.lotte_category}</span>
                      <span className="mx-1.5 text-gray-300">|</span>
                      <span>{qcSelectedRate.vehicle_names.length > 40 ? qcSelectedRate.vehicle_names.slice(0, 40) + '...' : qcSelectedRate.vehicle_names}</span>
                      <span className="ml-2 bg-steel-100 text-steel-700 text-xs font-bold px-1.5 py-0.5 rounded">{qcSelectedRate.service_group}</span>
                    </div>
                  </div>

                  {/* 상세 내역 테이블 */}
                  <div className="px-4 py-3">
                    <table className="w-full">
                      <thead>
                        <tr className="text-xs text-gray-400 font-bold">
                          <th className="text-left pb-1.5">적용 항목</th>
                          <th className="text-right pb-1.5">롯데 단가</th>
                          <th className="text-right pb-1.5">할인 단가</th>
                          <th className="text-center pb-1.5">수량</th>
                          <th className="text-right pb-1.5">소계</th>
                        </tr>
                      </thead>
                      <tbody>
                        {qcResult.lines.map((line, li) => (
                          <tr key={li} className="text-sm border-t border-gray-200/50">
                            <td className="py-1.5 font-bold text-gray-700">{line.label} 요율</td>
                            <td className="py-1.5 text-right text-red-400 line-through">{f(line.unitBase)}원</td>
                            <td className="py-1.5 text-right font-bold text-purple-600">{f(line.unitDisc)}원</td>
                            <td className="py-1.5 text-center text-gray-500">×{line.qty}{line.qty > 1 ? '일' : ''}</td>
                            <td className="py-1.5 text-right font-bold text-gray-800">{f(line.subtotalDisc)}원</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* 합계 영역 */}
                  <div className="px-4 py-3 border-t border-steel-200/50 bg-white/30 space-y-1.5">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-400">롯데 정상가 합계</span>
                      <span className="text-red-400 line-through">{f(qcResult.totalBase)}원</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-purple-500 font-bold">할인 ({globalDiscount}%) 적용</span>
                      <span className="text-purple-600 font-bold">-{f(qcResult.discountAmount)}원</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">할인 적용가</span>
                      <span className="font-bold text-gray-700">{f(qcResult.totalDisc)}원</span>
                    </div>
                    {qcResult.faultActive && (
                      <>
                        <div className="flex justify-between text-sm border-t border-orange-200/50 pt-1.5">
                          <span className="text-orange-600 font-bold">자차과실 ({qcResult.faultPercent}%)</span>
                          <span className="text-orange-600 font-bold">{f(qcResult.faultAmount)}원</span>
                        </div>
                        {qcResult.supportAmount > 0 && (
                          <div className="flex justify-between text-sm">
                            <span className="text-green-600 font-bold">서비스지원 (-{qcResult.serviceSupport}%)</span>
                            <span className="text-green-600 font-bold">-{f(qcResult.supportAmount)}원</span>
                          </div>
                        )}
                        <div className="flex justify-between text-sm">
                          <span className="text-orange-800 font-bold">고객 실부담금</span>
                          <span className="font-black text-orange-800">{f(qcResult.finalAmount)}원</span>
                        </div>
                      </>
                    )}
                    <div className="flex justify-between text-sm border-t border-gray-200/50 pt-1.5">
                      <span className="text-gray-500 font-bold">공급가액</span>
                      <span className="font-black text-gray-800">{f(qcResult.supplyPrice)}원</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-400">VAT (10%)</span>
                      <span className="text-gray-500">{f(qcResult.vat)}원</span>
                    </div>
                  </div>

                  {/* 최종 금액 */}
                  <div className="px-4 py-3 bg-steel-600 flex justify-between items-center">
                    <span className="text-sm font-bold text-steel-200">최종 금액 (VAT 포함)</span>
                    <span className="text-xl font-black text-white">{f(qcResult.totalWithVat)}원</span>
                  </div>
                </div>
              )}
              {!qcSelectedRate && (
                <div className="text-center py-3 text-sm text-gray-300 font-bold">카테고리와 차종을 선택하면 예상금액이 표시됩니다</div>
              )}
            </div>
          </div>

          {/* ─── 할인율 + 정비군 매핑 ─── */}

          {/* 정비군별 요율 매핑 */}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="bg-gray-50/50 border-b border-gray-100 px-5 py-3 flex items-center justify-between">
              <span className="font-bold text-gray-800 text-sm">정비군별 요율 매핑 <span className="text-xs text-gray-400 font-medium ml-1">롯데 기준가 × {globalDiscount}% = 턴키 단가</span></span>
              <div className="flex gap-1.5">
                {rateEditMode ? (
                  <>
                    <button onClick={() => { setRateEditMode(false); loadRates() }} className="py-1 px-3 text-sm rounded-lg border border-gray-200 font-bold text-gray-500 hover:bg-gray-50 transition-colors">취소</button>
                    <button onClick={saveRates} disabled={saving} className="py-1 px-3 text-sm rounded-lg bg-steel-600 text-white font-bold hover:bg-steel-700 disabled:opacity-50 transition-colors">{saving ? '저장 중...' : '저장'}</button>
                  </>
                ) : (
                  <button onClick={() => setRateEditMode(true)} className="py-1 px-3 text-sm rounded-lg border border-gray-200 font-bold text-gray-500 hover:bg-gray-50 transition-colors">편집</button>
                )}
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead><tr className="text-gray-400 whitespace-nowrap">
                  <th className="py-2 px-3 pl-4 text-left text-sm font-bold">정비군</th>
                  <th className="py-2 px-3 text-left text-sm font-bold">차종 분류</th>
                  <th className="py-2 px-3 text-left text-sm font-bold">배기량</th>
                  <th className="py-2 pr-3 text-right text-sm font-bold text-red-400">롯데 기준</th>
                  <th className="py-2 px-3 text-center text-sm font-bold text-purple-500">할인율</th>
                  <th className="py-2 px-3 text-center text-sm font-bold">방식</th>
                  <th className="py-2 pr-4 text-right text-sm font-bold text-steel-600">턴키 1일</th>
                </tr></thead>
                <tbody>
                  {rates.map((r, i) => {
                    const computed = r.calc_method === 'auto' ? calcRate(r.lotte_base_rate, r.discount_percent) : r.daily_rate
                    const isRvStart = r.service_group === '8군' && (i === 0 || rates[i - 1]?.service_group !== '8군')
                    return (
                      <React.Fragment key={r.id || `rate-${i}`}>{isRvStart && (
                        <tr className="bg-amber-50/50">
                          <td colSpan={7} className="px-4 py-1.5 text-sm font-bold text-amber-600">RV · SUV · 승합</td>
                        </tr>
                      )}
                      <tr className="border-t border-gray-100 hover:bg-steel-50/30 whitespace-nowrap">
                        <td className="py-2 px-3 pl-4"><span className="bg-steel-100 text-steel-700 text-sm font-bold px-2 py-0.5 rounded">{r.service_group}</span></td>
                        <td className="py-2 px-3">
                          {rateEditMode ? (
                            <input className="border border-gray-200 px-2 py-1 rounded text-sm w-full" value={r.vehicle_class}
                              onChange={e => { const n = [...rates]; n[i] = { ...n[i], vehicle_class: e.target.value }; setRates(n) }} />
                          ) : (
                            <span className="text-sm font-bold text-gray-800">{r.vehicle_class}</span>
                          )}
                        </td>
                        <td className="py-1.5 px-3">
                          {rateEditMode ? (
                            <input className="border border-gray-200 px-2 py-1 rounded text-sm w-28" value={r.displacement_range}
                              onChange={e => { const n = [...rates]; n[i] = { ...n[i], displacement_range: e.target.value }; setRates(n) }} />
                          ) : (
                            <span className="text-sm text-gray-500 font-bold">{r.displacement_range}</span>
                          )}
                        </td>
                        <td className="py-2 pr-3 text-right">
                          {rateEditMode ? (
                            <input className="w-24 border border-gray-200 px-2 py-1 rounded text-sm font-bold text-right" value={f(r.lotte_base_rate)}
                              onChange={e => {
                                const base = Number(e.target.value.replace(/,/g, ''))
                                const n = [...rates]; n[i] = { ...n[i], lotte_base_rate: base, daily_rate: r.calc_method === 'auto' ? calcRate(base, r.discount_percent) : r.daily_rate }; setRates(n)
                              }} />
                          ) : (
                            <span className="text-sm font-bold text-red-600">{f(r.lotte_base_rate)}</span>
                          )}
                        </td>
                        <td className="py-2 px-3 text-center">
                          {rateEditMode ? (
                            <input type="number" className="w-14 border border-gray-200 px-1.5 py-1 rounded text-sm font-bold text-center" value={r.discount_percent}
                              onChange={e => { const pct = Number(e.target.value); const n = [...rates]; n[i] = { ...n[i], discount_percent: pct, daily_rate: r.calc_method === 'auto' ? calcRate(r.lotte_base_rate, pct) : r.daily_rate }; setRates(n) }} />
                          ) : (
                            <span className="text-sm font-bold text-purple-600">{r.discount_percent}%</span>
                          )}
                        </td>
                        <td className="py-2 px-3 text-center">
                          {rateEditMode ? (
                            <select className="border border-gray-200 px-1.5 py-1 rounded text-sm font-bold" value={r.calc_method}
                              onChange={e => { const n = [...rates]; n[i] = { ...n[i], calc_method: e.target.value }; setRates(n) }}>
                              <option value="auto">자동</option><option value="manual">수동</option>
                            </select>
                          ) : (
                            <span className={`text-sm font-bold ${r.calc_method === 'auto' ? 'text-green-600' : 'text-orange-600'}`}>
                              {r.calc_method === 'auto' ? '자동' : '수동'}
                            </span>
                          )}
                        </td>
                        <td className="py-2 pr-4 text-right">
                          {rateEditMode && r.calc_method === 'manual' ? (
                            <input className="w-28 border border-gray-200 px-2 py-1 rounded text-sm font-bold text-right" value={f(r.daily_rate)}
                              onChange={e => { const n = [...rates]; n[i] = { ...n[i], daily_rate: Number(e.target.value.replace(/,/g, '')) }; setRates(n) }} />
                          ) : (
                            <span className="text-base font-black text-steel-700">{f(computed)}원</span>
                          )}
                        </td>
                      </tr>
                      </React.Fragment>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* ─── 롯데 참고 자료 (하단, 접이식) ─── */}

          {/* 정비군 분류 기준표 */}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
            <button onClick={() => setLotteOpen(!lotteOpen)} className="w-full bg-gray-50/50 border-b border-gray-100 px-5 py-3 flex items-center justify-between hover:bg-gray-100/50 transition-colors">
              <span className="font-bold text-gray-800 text-sm flex items-center gap-2">롯데렌터카 공식 요금표 <span className="text-xs text-gray-400 font-medium">{lotteUpdateDate} 기준 · 내륙</span></span>
              <span className={`text-gray-400 text-xs transition-transform ${lotteOpen ? 'rotate-180' : ''}`}>▼</span>
            </button>
          {lotteOpen && (<>

        {/* 롯데 기준 요금 */}
        <div>
          <div className="bg-gray-50/30 border-b border-gray-100 px-5 py-2.5 flex items-center justify-between">
            <span className="font-bold text-gray-800 text-sm flex items-center gap-2">
              롯데렌터카 공식 단기렌트 요금
              <span className="text-xs text-gray-400 font-medium">{lotteUpdateDate} 기준 · 내륙</span>
              <span className="w-2 h-2 rounded-full bg-green-400 inline-block"></span>
            </span>
            <div className="flex items-center gap-2">
              {lotteEditMode ? (
                <>
                  <button onClick={() => { setLotteEditMode(false); loadLotteRates() }} className="py-1 px-3 text-sm rounded-lg border border-gray-200 font-bold text-gray-500 hover:bg-gray-50 transition-colors">취소</button>
                  <button onClick={saveLotteRates} disabled={saving} className="py-1 px-3 text-sm rounded-lg bg-red-500 text-white font-bold hover:bg-red-600 disabled:opacity-50 transition-colors">{saving ? '저장 중...' : '저장'}</button>
                </>
              ) : (
                <div className="flex gap-1.5">
                  <button onClick={fetchLotteRatesAuto} disabled={lotteUpdating}
                    className="py-1 px-3 text-sm rounded-lg bg-blue-500 text-white font-bold hover:bg-blue-600 disabled:opacity-50 transition-colors">
                    {lotteUpdating ? '가져오는 중...' : '자동 업데이트'}
                  </button>
                  <button onClick={() => setLotteEditMode(true)} className="py-1 px-3 text-sm rounded-lg border border-gray-200 font-bold text-gray-500 hover:bg-gray-50 transition-colors">수동 편집</button>
                </div>
              )}
            </div>
          </div>

          {/* 카테고리 필터 */}
          <div className="px-4 py-2.5 border-b border-gray-100 flex items-center gap-1.5 overflow-x-auto">
            {lotteCategories.map(cat => {
              const cnt = cat === '전체' ? lotteRates.length : lotteRates.filter(r => r.lotte_category === cat).length
              return (
                <button key={cat} onClick={() => setLotteCatFilter(cat)}
                  className={`py-1 px-3 text-sm rounded-lg border font-bold transition-colors whitespace-nowrap ${
                    lotteCatFilter === cat ? 'bg-red-500 text-white border-red-500' : 'border-gray-200 text-gray-500 hover:bg-gray-50'
                  }`}>
                  {cat} <span className={`ml-0.5 ${lotteCatFilter === cat ? 'text-red-200' : 'text-gray-300'}`}>{cnt}</span>
                </button>
              )
            })}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead><tr className="text-gray-400 whitespace-nowrap">
                <th className="py-2 px-3 pl-4 text-left text-sm font-bold">카테고리</th>
                <th className="py-2 px-3 text-left text-sm font-bold">차종</th>
                <th className="py-2 pr-3 text-right text-sm font-bold text-orange-400">6시간</th>
                <th className="py-2 pr-3 text-right text-sm font-bold text-orange-400">10시간</th>
                <th className="py-2 pr-3 text-right text-sm font-bold text-orange-500">12시간</th>
                <th className="py-2 pr-3 text-right text-sm font-bold text-red-400">1~3일</th>
                <th className="py-2 pr-3 text-right text-sm font-bold">4일</th>
                <th className="py-2 pr-3 text-right text-sm font-bold">5~6일</th>
                <th className="py-2 pr-3 text-right text-sm font-bold">7일+</th>
                <th className="py-2 pr-3 text-right text-sm font-bold text-purple-500">할인율({globalDiscount}%)</th>
                <th className="py-2 px-3 pr-4 text-center text-sm font-bold text-steel-600">매핑</th>
                {lotteEditMode && <th className="py-2 px-2 pr-4 text-center text-sm font-bold"></th>}
              </tr></thead>
              <tbody>
                {filteredLotteRates.map((lr, i) => {
                  const realIdx = lotteRates.findIndex(r => r.id === lr.id || (r.lotte_category === lr.lotte_category && r.vehicle_names === lr.vehicle_names))
                  return (
                    <tr key={lr.id || i} className="border-t border-gray-100 hover:bg-gray-50/50">
                      <td className="py-2 px-3 pl-4 whitespace-nowrap">
                        {lotteEditMode ? (
                          <select className="border border-gray-200 px-2 py-1 rounded text-sm font-bold w-full" value={lr.lotte_category}
                            onChange={e => { const n = [...lotteRates]; n[realIdx] = { ...n[realIdx], lotte_category: e.target.value }; setLotteRates(n) }}>
                            {['경차','소형','중형','준대형','대형','승합','SUV·RV(소형)','SUV·RV(중형)','수입차','전기차'].map(c => <option key={c}>{c}</option>)}
                          </select>
                        ) : (
                          <span className="bg-red-50 text-red-600 text-sm font-bold px-2 py-0.5 rounded">{lr.lotte_category}</span>
                        )}
                      </td>
                      <td className="py-2 px-3 overflow-hidden text-ellipsis">
                        {lotteEditMode ? (
                          <input className="border border-gray-200 px-2 py-1 rounded text-sm w-full" value={lr.vehicle_names}
                            onChange={e => { const n = [...lotteRates]; n[realIdx] = { ...n[realIdx], vehicle_names: e.target.value }; setLotteRates(n) }} />
                        ) : (
                          <span className="text-sm text-gray-600">{lr.vehicle_names}</span>
                        )}
                      </td>
                      {(['rate_6hrs', 'rate_10hrs', 'rate_12hrs', 'rate_1_3days', 'rate_4days', 'rate_5_6days', 'rate_7plus_days'] as const).map((field, fi) => (
                        <td key={field} className="py-2 pr-3 text-right whitespace-nowrap">
                          {lotteEditMode ? (
                            <input className="w-20 border border-gray-200 px-2 py-1 rounded text-sm font-bold text-right"
                              value={f((lr as any)[field])}
                              onChange={e => { const n = [...lotteRates]; (n[realIdx] as any)[field] = Number(e.target.value.replace(/,/g, '')); setLotteRates(n) }} />
                          ) : (
                            <span className={`text-sm font-bold ${fi <= 2 ? 'text-orange-500' : fi === 3 ? 'text-red-600' : 'text-gray-600'}`}>{f((lr as any)[field])}</span>
                          )}
                        </td>
                      ))}
                      <td className="py-2 pr-3 text-right whitespace-nowrap">
                        <span className="text-sm font-black text-purple-600">{f(calcRate(lr.rate_1_3days, globalDiscount))}</span>
                      </td>
                      <td className="py-2 px-3 pr-4 text-center whitespace-nowrap">
                        {lotteEditMode ? (
                          <select className="border border-gray-200 px-2 py-1 rounded text-sm font-bold" value={lr.service_group}
                            onChange={e => { const n = [...lotteRates]; n[realIdx] = { ...n[realIdx], service_group: e.target.value }; setLotteRates(n) }}>
                            {ALL_GROUPS.map(g => <option key={g}>{g}</option>)}
                          </select>
                        ) : (
                          <span className="bg-steel-100 text-steel-700 text-sm font-bold px-2 py-0.5 rounded">{lr.service_group}</span>
                        )}
                      </td>
                      {lotteEditMode && (
                        <td className="py-1.5 px-2 pr-4 text-center">
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

          <div className="px-4 py-2 bg-gray-50/50 border-t border-gray-100 text-xs text-gray-400 flex items-center justify-between">
            <span>출처: <a href="https://www.lotterentacar.net/hp/kor/reservation/shortInfo/pay.do" target="_blank" rel="noopener" className="text-steel-600 hover:underline">롯데렌터카 공식</a> · 내륙 · 비회원가</span>
            <div className="flex items-center gap-2">
              {lotteEditMode && (
                <button onClick={() => {
                  const lastCat = lotteRates.length > 0 ? lotteRates[lotteRates.length - 1].lotte_category : '소형'
                  const lastGroup = lotteRates.length > 0 ? lotteRates[lotteRates.length - 1].service_group : '1군'
                  setLotteRates(prev => [...prev, { id: `new_${Date.now()}`, lotte_category: lastCat, vehicle_names: '(새 차종)', rate_6hrs: 0, rate_10hrs: 0, rate_12hrs: 0, rate_1_3days: 0, rate_4days: 0, rate_5_6days: 0, rate_7plus_days: 0, service_group: lastGroup, sort_order: prev.length + 1 }])
                }} className="text-xs font-bold text-steel-600 bg-steel-50 px-2 py-0.5 rounded-lg hover:bg-steel-100">+ 차종 추가</button>
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
      {/* 탭 2: 견적 작성 — 단계별 흐름 */}
      {/* ═════════════════════════════════════════════ */}
      {subTab === 'quote' && (() => {
        // 선택된 일수 (견적 작성 탭용 단일 선택)
        const selectedDays = customDays[0] || 10

        // 전체 정비군 요율 자동 계산
        const quoteLines = rates.map(r => {
          const dr = r.calc_method === 'auto' ? calcRate(r.lotte_base_rate, r.discount_percent) : r.daily_rate
          const annualAmount = dr * selectedDays
          const monthlyAmount = Math.round(annualAmount / 12)
          const supplyPrice = Math.round(annualAmount / 1.1)
          const vat = annualAmount - supplyPrice
          return { ...r, dailyRate: dr, annualAmount, monthlyAmount, supplyPrice, vat }
        })

        const totalAnnual = quoteLines.reduce((s, l) => s + l.annualAmount, 0)
        const totalMonthly = Math.round(totalAnnual / 12)
        const totalSupply = Math.round(totalAnnual / 1.1)
        const totalVat = totalAnnual - totalSupply

        // 시장 표준 데이터 (전문가 수집)
        const MARKET_DATA = [
          { label: '100대당 연간 사고 발생률', value: '0.75건', source: '도로교통공단 2023 교통사고 통계', detail: '198,296건 / 26,298천 등록대수' },
          { label: '사고 평균 수리일수', value: '6.8일', source: '보험개발원 대차료 인정 기준', detail: '보험사 인정범위 3~25일, 실제 평균 6.8일' },
          { label: '100대당 연간 고장 발생률', value: '2.0~3.0건', source: '업계 추정치 (한국자동차정비사업조합)', detail: '공식 통계 미확보, 차령·주행거리에 따라 편차' },
          { label: '고장 평균 수리일수', value: '4~7일', source: '정비업계 평균', detail: '경정비 1~2일, 사고수리 7~14일' },
          { label: '연간 표준 대차일수', value: '5~15일', source: '메리츠·삼성·DB 캐피탈 계약 기준', detail: '업체 규모 및 차량 연식에 따라 차등' },
          { label: '대차 서비스 시장 할인율', value: '30~50%', source: '렌터카 업계 B2B 실거래', detail: '롯데·SK·쏘카 공시요금 대비 할인율' },
        ]

        return (
        <div className="space-y-4">

          {/* ① 계약 조건 설정 */}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="bg-gray-50/50 border-b border-gray-100 px-5 py-3">
              <span className="font-bold text-gray-800 text-sm">① 계약 조건 설정</span>
            </div>
            <div className="p-5">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {/* 계약기간 */}
                <div>
                  <label className="block text-xs font-bold text-gray-500 mb-2">계약 기간</label>
                  <div className="flex gap-1.5">
                    {['1년', '2년', '3년'].map(p => (
                      <button key={p} onClick={() => setContractPeriod(p)}
                        className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-all ${
                          contractPeriod === p ? 'bg-steel-600 text-white shadow-sm' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                        }`}>{p}</button>
                    ))}
                  </div>
                </div>
                {/* 연간 대차일수 */}
                <div>
                  <label className="block text-xs font-bold text-gray-500 mb-2">연간 대차일수</label>
                  <div className="flex gap-1.5">
                    {DAY_PRESETS.map(d => (
                      <button key={d} onClick={() => setCustomDays([d])}
                        className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-all ${
                          selectedDays === d ? 'bg-steel-600 text-white shadow-sm' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                        }`}>{d}일</button>
                    ))}
                  </div>
                </div>
                {/* 할인율 */}
                <div>
                  <label className="block text-xs font-bold text-gray-500 mb-2">할인율 <span className="text-gray-400 font-medium">(롯데 대비)</span></label>
                  <div className="flex items-center gap-3">
                    <input type="range" min={10} max={100} step={5} value={globalDiscount}
                      onChange={e => setGlobalDiscount(Number(e.target.value))}
                      className="flex-1 h-2 accent-purple-600 rounded-full" />
                    <span className="text-lg font-black text-purple-600 w-14 text-right">{globalDiscount}%</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ② 요율표 자동 산출 */}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="bg-gray-50/50 border-b border-gray-100 px-5 py-3 flex items-center justify-between">
              <div>
                <span className="font-bold text-gray-800 text-sm">② 요율표</span>
                <span className="text-xs text-gray-400 ml-2">{contractPeriod} 계약 · 연 {selectedDays}일 · 롯데 {globalDiscount}%</span>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={exportExcel}
                  className="flex items-center gap-1.5 py-1.5 px-3 bg-green-600 text-white rounded-lg text-xs font-bold hover:bg-green-700 transition-colors">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                  엑셀
                </button>
                <button onClick={() => window.print()}
                  className="flex items-center gap-1.5 py-1.5 px-3 bg-steel-600 text-white rounded-lg text-xs font-bold hover:bg-steel-700 transition-colors">
                  인쇄
                </button>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead><tr className="bg-steel-700 text-white text-xs">
                  <th className="py-2.5 px-3 pl-4 text-left font-bold w-16">정비군</th>
                  <th className="py-2.5 px-3 text-left font-bold">차종</th>
                  <th className="py-2.5 px-3 text-left font-bold w-28">배기량</th>
                  <th className="py-2.5 pr-3 text-right font-bold w-24 text-red-300">롯데 단가</th>
                  <th className="py-2.5 pr-3 text-right font-bold w-24">적용 단가</th>
                  <th className="py-2.5 pr-3 text-right font-bold w-28">연 {selectedDays}일</th>
                  <th className="py-2.5 pr-4 text-right font-bold w-24 text-yellow-300">월 금액</th>
                </tr></thead>
                <tbody>
                  {quoteLines.map((r, i) => {
                    const isRvStart = r.service_group === '8군' && (i === 0 || quoteLines[i - 1]?.service_group !== '8군')
                    return (
                      <React.Fragment key={r.id || `ql-${i}`}>
                        {isRvStart && (
                          <tr className="bg-amber-50/70">
                            <td colSpan={7} className="px-4 py-1.5 text-xs font-bold text-amber-600">RV · SUV · 승합</td>
                          </tr>
                        )}
                        <tr className="border-t border-gray-100 hover:bg-steel-50/30">
                          <td className="py-2 px-3 pl-4">
                            <span className="bg-steel-100 text-steel-700 text-xs font-bold px-1.5 py-0.5 rounded">{r.service_group}</span>
                          </td>
                          <td className="py-2 px-3 text-sm font-bold text-gray-800">{r.vehicle_class}</td>
                          <td className="py-2 px-3 text-xs text-gray-500">{r.displacement_range}</td>
                          <td className="py-2 pr-3 text-right text-sm text-red-400 line-through">{f(r.lotte_base_rate)}</td>
                          <td className="py-2 pr-3 text-right text-sm font-bold text-steel-700">{f(r.dailyRate)}원</td>
                          <td className="py-2 pr-3 text-right text-sm font-black text-gray-900">{f(r.annualAmount)}원</td>
                          <td className="py-2 pr-4 text-right text-sm font-black text-steel-600">{f(r.monthlyAmount)}원</td>
                        </tr>
                      </React.Fragment>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-gray-300 bg-gray-50/50">
                    <td colSpan={5} className="py-2 pr-3 text-right text-sm font-bold text-gray-600">공급가액 합계</td>
                    <td className="py-2 pr-3 text-right font-bold text-gray-700 text-sm">{f(totalSupply)}원</td>
                    <td className="py-2 pr-4 text-right font-bold text-gray-500 text-sm">{f(Math.round(totalSupply / 12))}원</td>
                  </tr>
                  <tr className="bg-gray-50/50">
                    <td colSpan={5} className="py-1.5 pr-3 text-right text-xs font-bold text-gray-400">VAT (10%)</td>
                    <td className="py-1.5 pr-3 text-right text-sm text-gray-500">{f(totalVat)}원</td>
                    <td className="py-1.5 pr-4 text-right text-sm text-gray-400">{f(Math.round(totalVat / 12))}원</td>
                  </tr>
                  <tr className="bg-steel-700 text-white">
                    <td colSpan={5} className="py-3 pr-3 text-right text-sm font-bold">합계 (VAT 포함)</td>
                    <td className="py-3 pr-3 text-right font-black text-lg">{f(totalAnnual)}원</td>
                    <td className="py-3 pr-4 text-right font-black text-lg text-yellow-300">{f(totalMonthly)}원/월</td>
                  </tr>
                </tfoot>
              </table>
            </div>
            <div className="px-5 py-2.5 bg-gray-50/50 border-t border-gray-100 text-xs text-gray-400 flex justify-between">
              <span>※ 롯데렌터카 공식 단기렌트 요금 대비 {globalDiscount}% 적용 · VAT 포함 기준</span>
              <span>{new Date().toLocaleDateString('ko-KR')} 기준</span>
            </div>
          </div>

          {/* ③ 시장 표준 참고 데이터 (전문가 수집) */}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="bg-gray-50/50 border-b border-gray-100 px-5 py-3">
              <span className="font-bold text-gray-800 text-sm">③ 시장 표준 참고 데이터</span>
              <span className="text-xs text-gray-400 ml-2">전문가 수집 · 업계 벤치마크</span>
            </div>
            <div className="divide-y divide-gray-100">
              {MARKET_DATA.map((item, i) => (
                <div key={i} className="px-5 py-3 flex items-start gap-4 hover:bg-gray-50/30">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-gray-800">{item.label}</span>
                      <span className="text-sm font-black text-steel-600">{item.value}</span>
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">{item.detail}</p>
                  </div>
                  <span className="text-xs text-gray-300 shrink-0 max-w-40 text-right">{item.source}</span>
                </div>
              ))}
            </div>
            <div className="px-5 py-2.5 bg-amber-50/50 border-t border-amber-100 text-xs text-amber-600">
              ※ 상기 데이터는 참고용이며, 실제 계약 조건은 업체 규모·차량 연식·지역에 따라 달라질 수 있습니다.
            </div>
          </div>

          {/* ④ 고객 정보 + 견적 저장 */}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="bg-gray-50/50 border-b border-gray-100 px-5 py-3">
              <span className="font-bold text-gray-800 text-sm">④ 견적서 작성 및 저장</span>
            </div>
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-500 mb-1.5">업체명 / 고객명</label>
                  <input className="w-full border border-gray-200 px-3 py-2 rounded-lg font-bold text-sm focus:border-steel-500 outline-none"
                    placeholder="업체명" value={customerCompany || customerName}
                    onChange={e => { setCustomerCompany(e.target.value); if (!customerName) setCustomerName(e.target.value) }} />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 mb-1.5">담당자명</label>
                  <input className="w-full border border-gray-200 px-3 py-2 rounded-lg font-bold text-sm focus:border-steel-500 outline-none"
                    placeholder="담당자명" value={customerName} onChange={e => setCustomerName(e.target.value)} />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 mb-1.5">연락처</label>
                  <input className="w-full border border-gray-200 px-3 py-2 rounded-lg font-bold text-sm focus:border-steel-500 outline-none"
                    placeholder="010-0000-0000" value={customerPhone} onChange={e => setCustomerPhone(e.target.value)} />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 mb-1.5">보유 차량수</label>
                  <input type="number" min={0} className="w-full border border-gray-200 px-3 py-2 rounded-lg font-bold text-sm text-center focus:border-steel-500 outline-none"
                    placeholder="대" value={vehicleCount || ''} onChange={e => setVehicleCount(Number(e.target.value))} />
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1.5">특이사항 / 메모</label>
                <input className="w-full border border-gray-200 px-3 py-2 rounded-lg text-sm focus:border-steel-500 outline-none"
                  placeholder="특약사항, 서비스 조건 등" value={contractMemo} onChange={e => setContractMemo(e.target.value)} />
              </div>
              {/* 요약 + 버튼 */}
              <div className="bg-steel-50 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-6 text-sm">
                  <div>
                    <span className="text-gray-500 text-xs font-bold">연간 합계</span>
                    <span className="ml-2 font-black text-steel-800 text-lg">{f(totalAnnual)}원</span>
                  </div>
                  <div>
                    <span className="text-gray-500 text-xs font-bold">월 환산</span>
                    <span className="ml-2 font-black text-steel-600 text-lg">{f(totalMonthly)}원</span>
                  </div>
                  {vehicleCount > 0 && (
                    <div>
                      <span className="text-gray-500 text-xs font-bold">대당 연간</span>
                      <span className="ml-2 font-black text-gray-700">{f(Math.round(totalAnnual / vehicleCount))}원</span>
                    </div>
                  )}
                </div>
                <div className="flex gap-2">
                  <button onClick={saveQuote} disabled={quoteSaving}
                    className="py-2.5 px-5 bg-steel-700 text-white rounded-lg text-sm font-bold hover:bg-steel-800 shadow-sm transition-all disabled:opacity-50">
                    {quoteSaving ? '저장 중...' : 'DB 저장'}
                  </button>
                  <button onClick={exportExcel}
                    className="py-2.5 px-5 bg-green-600 text-white rounded-lg text-sm font-bold hover:bg-green-700 shadow-sm transition-all">
                    엑셀 다운로드
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
        )
      })()}

      {/* ═════════════════════════════════════════════ */}
      {/* 탭 4: 견적 관리 */}
      {/* ═════════════════════════════════════════════ */}
      {subTab === 'manage' && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="bg-gray-50/50 border-b border-gray-100 px-4 py-2.5 flex justify-between items-center">
            <span className="font-bold text-gray-800 text-xs">견적서 관리 <span className="text-xs text-gray-400 font-medium ml-1">단기대차 견적 목록</span></span>
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
              <p className="text-xs mt-1">[견적 작성] 탭에서 새 견적을 만들어보세요</p>
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
                        <td className="py-1.5 px-3 text-center text-xs text-gray-500">{q.contract_period}</td>
                        <td className="py-1.5 px-3 text-center">
                          <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${st.color}`}>{st.label}</span>
                          {expired && q.status === 'draft' && <span className="ml-1 text-red-500 text-xs font-bold">만료</span>}
                        </td>
                        <td className="py-1.5 px-3 text-center text-xs text-gray-400">
                          {q.expires_at ? new Date(q.expires_at).toLocaleDateString('ko-KR') : '-'}
                        </td>
                        <td className="py-1.5 px-3 text-center">
                          <div className="flex gap-1 justify-center">
                            {q.status === 'draft' && (
                              <button onClick={() => updateQuoteStatus(q.id, 'sent')} className="text-xs bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded font-bold hover:bg-blue-100">발송</button>
                            )}
                            {q.status === 'sent' && (
                              <button onClick={() => updateQuoteStatus(q.id, 'accepted')} className="text-xs bg-green-50 text-green-600 px-1.5 py-0.5 rounded font-bold hover:bg-green-100">수락</button>
                            )}
                            {q.status === 'accepted' && (
                              <button onClick={() => updateQuoteStatus(q.id, 'contracted')} className="text-xs bg-purple-50 text-purple-600 px-1.5 py-0.5 rounded font-bold hover:bg-purple-100">계약</button>
                            )}
                            {q.status !== 'cancelled' && q.status !== 'contracted' && (
                              <button onClick={() => updateQuoteStatus(q.id, 'cancelled')} className="text-xs bg-gray-50 text-gray-400 px-1.5 py-0.5 rounded font-bold hover:bg-gray-100">취소</button>
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
