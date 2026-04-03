'use client'
import { auth } from '@/lib/firebase'
import { useApp } from '../../context/AppContext'
import { useRouter } from 'next/navigation'
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

async function getAuthHeader(): Promise<Record<string, string>> {
  try {
    const { auth } = await import('@/lib/firebase')
    const user = auth.currentUser
    if (!user) return {}
    const token = await user.getIdToken(false)
    return { Authorization: `Bearer ${token}` }
  } catch {
    return {}
  }
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
  { key: 'quote', label: '대차 상품', icon: '📋' },
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
  const router = useRouter()
  const cid = role === 'admin' ? adminSelectedCompanyId : company?.id

  const [subTab, setSubTab] = useState<SubTab>('settings')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [qcSaving, setQcSaving] = useState(false)

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
      const headers = await getAuthHeader()
      const res = await fetch('/api/short-term-rates?is_active=true', { headers })
      const json = await res.json()
      const data = json.data
      if (data && data.length > 0) {
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
      const headers = await getAuthHeader()
      const res = await fetch('/api/short-term-rates?is_active=true', { headers })
      const json = await res.json()
      const data = json.data
      if (data && data.length > 0) {
        setRates(data)
        if (data[0]?.discount_percent) setGlobalDiscount(data[0].discount_percent)
        return
      }
    } catch { /* 테이블 미존재 — 기본값 사용 */ }
    const mapped = DEFAULT_GROUPS.map((g, i) => ({ ...g, id: `temp_${i}`, daily_rate: calcRate(g.lotte_base_rate, 40) }))
    setRates(mapped)
  }

  // 견적 관리는 /quotes 통합 페이지로 이동됨

  // ─── 롯데 요율 저장 ───
  const saveLotteRates = async () => {
    if (!cid) return
    setSaving(true)
    try {
      const today = new Date().toISOString().split('T')[0]
      const payload = lotteRates.map((r, i) => ({
        lotte_category: r.lotte_category, vehicle_names: r.vehicle_names,
        rate_6hrs: r.rate_6hrs || 0, rate_10hrs: r.rate_10hrs || 0,
        rate_1_3days: r.rate_1_3days, rate_4days: r.rate_4days, rate_5_6days: r.rate_5_6days,
        rate_7plus_days: r.rate_7plus_days, service_group: r.service_group,
        effective_date: today, sort_order: i + 1, is_active: true,
      }))
      const headers = await getAuthHeader()
      const res = await fetch('/api/short-term-rates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify(payload)
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || '저장 실패')
      setLotteUpdateDate(new Date().toLocaleDateString('ko-KR'))
      alert('롯데 기준요율이 저장되었습니다!')
      setLotteEditMode(false)
      await loadLotteRates()
    } catch (e: any) { alert('저장 실패: ' + e.message) }
    setSaving(false)
  }

  // ─── 정비군 요율 저장 ───
  const saveRates = async () => {
    if (!cid) return
    setSaving(true)
    try {
      const payload = rates.map((r, i) => ({
        service_group: r.service_group, vehicle_class: r.vehicle_class,
        displacement_range: r.displacement_range, daily_rate: r.calc_method === 'auto' ? calcRate(r.lotte_base_rate, r.discount_percent) : r.daily_rate,
        lotte_base_rate: r.lotte_base_rate, discount_percent: r.discount_percent,
        calc_method: r.calc_method, sort_order: i + 1, is_active: true,
      }))
      const headers = await getAuthHeader()
      const res = await fetch('/api/short-term-rates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify(payload)
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || '저장 실패')
      alert('요율표가 저장되었습니다!')
      setRateEditMode(false)
      await loadRates()
    } catch (e: any) { alert('저장 실패: ' + e.message) }
    setSaving(false)
  }

  // ─── 롯데 요금 자동 업데이트 (크롤링) ───
  const fetchLotteRatesAuto = async () => {
    setLotteUpdating(true)
    try {
      // Firebase: token via auth.currentUser.getIdToken()
      const _tk = auth.currentUser ? await auth.currentUser.getIdToken() : null
      const res = await fetch('/api/fetch-lotte-rates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(_tk ? { 'Authorization': `Bearer ${_tk}` } : {}) },
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
    const XLSX = await import('xlsx')
    const wb = XLSX.utils.book_new()

    const accRisk = (simAccidentRate / 100) * simAvgRepairDays
    const brkRisk = (simBreakdownRate / 100) * simAvgBreakdownDays
    const risk = accRisk + brkRisk
    const daysList = [...customDays].sort((a, b) => a - b)
    const comma = (n: number) => n.toLocaleString('ko-KR')

    const data: any[][] = []
    data.push(['단기대차 견적 요율표 (1대당)'])
    data.push([`기준일: ${new Date().toLocaleDateString('ko-KR')}`, '', '', '', `부가세 별도`])
    data.push([])
    data.push(['정비군', '차종', '배기량', '일단가', ...daysList.map(d => `${d}일/월`)])

    const addRows = (list: typeof rates) => {
      list.forEach(r => {
        const dr = r.calc_method === 'auto' ? calcRate(r.lotte_base_rate, globalDiscount) : r.daily_rate
        data.push([r.service_group, r.vehicle_class, r.displacement_range, comma(dr), ...daysList.map(d => comma(Math.round(dr * risk * d / 12)))])
      })
    }

    addRows(rates.filter(r => ['1군', '2군', '3군', '4군', '5군', '6군'].includes(r.service_group)))
    data.push(['RV · SUV · 승합'])
    addRows(rates.filter(r => ['8군', '9군', '10군'].includes(r.service_group)))

    data.push([])
    data.push(['※ 부가세 별도 · 1대당 월 기준'])

    const ws = XLSX.utils.aoa_to_sheet(data)
    ws['!cols'] = [{ wch: 10 }, { wch: 22 }, { wch: 14 }, { wch: 14 }, ...daysList.map(() => ({ wch: 14 }))]
    XLSX.utils.book_append_sheet(wb, ws, '견적 요율표')

    const now = new Date()
    const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`
    XLSX.writeFile(wb, `대차서비스_단가_${dateStr}.xlsx`)
  }

  // ─── 견적 저장 ───
  const saveQuote = async () => {
    if (!customerName && !customerCompany) { alert('업체명 또는 담당자명을 입력해주세요.'); return }
    if (rates.length === 0) { alert('요율 데이터가 없습니다.'); return }
    setQuoteSaving(true)
    try {
      const now = new Date()
      const num = `STQ-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-${String(Math.floor(Math.random() * 999) + 1).padStart(3, '0')}`
      // 현재 요율표 기반 저장 데이터 생성
      const accRisk = (simAccidentRate / 100) * simAvgRepairDays
      const brkRisk = (simBreakdownRate / 100) * simAvgBreakdownDays
      const risk = accRisk + brkRisk
      const daysList = [...customDays].sort((a, b) => a - b)
      const items = rates.map(r => {
        const dr = r.calc_method === 'auto' ? calcRate(r.lotte_base_rate, globalDiscount) : r.daily_rate
        const byDays: Record<number, number> = {}
        for (const d of daysList) { byDays[d] = Math.round(dr * risk * d) }
        return { group: r.service_group, vehicleClass: r.vehicle_class, dailyRate: dr, lotteRate: r.lotte_base_rate, byDays }
      })
      const detail = {
        items, daysList, globalDiscount,
        riskFactors: { accidentRate: simAccidentRate, repairDays: simAvgRepairDays, breakdownRate: simBreakdownRate, breakdownDays: simAvgBreakdownDays, totalRisk: risk },
        memo: contractMemo,
      }
      const headers = await getAuthHeader()
      const res = await fetch('/api/short-term-quotes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({
          quote_number: num, customer_name: customerName || customerCompany, customer_phone: customerPhone,
          quote_detail: detail, discount_percent: globalDiscount, status: 'draft',
        })
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || '저장 실패')
      alert(`견적서 ${num} 이 생성되었습니다!`)
      setCustomerName(''); setCustomerCompany(''); setCustomerPhone(''); setContractMemo('')
      router.push('/quotes?tab=short_term')
    } catch (e: any) { alert('견적 저장 실패: ' + e.message) }
    setQuoteSaving(false)
  }

  // ─── 제공일수 관리 ───
  const addDay = () => { const v = parseInt(newDayVal); if (v > 0 && !customDays.includes(v)) { setCustomDays(prev => [...prev, v].sort((a, b) => a - b)); setNewDayVal(''); setShowDayInput(false) } }
  const rmDay = (d: number) => { if (customDays.length > 1) setCustomDays(prev => prev.filter(x => x !== d)) }

  // 견적 상태 변경은 /quotes 통합 페이지에서 처리

  // ─── 빠른 견적 계산기 상태 ───
  const [qcCategory, setQcCategory] = useState<string>('')
  const [qcVehicle, setQcVehicle] = useState<string>('')
  const [qcSearch, setQcSearch] = useState<string>('')
  const [qcSearchOpen, setQcSearchOpen] = useState<boolean>(false)
  const qcSearchRef = React.useRef<HTMLDivElement>(null)
  const [qcDateMode, setQcDateMode] = useState<'days' | 'range'>('days')
  const [qcDays, setQcDays] = useState<number>(0)
  const [qcHours, setQcHours] = useState<number>(0)
  const [qcStartDate, setQcStartDate] = useState<string>(() => { const d = new Date(); return d.toISOString().split('T')[0] })
  const [qcStartTime, setQcStartTime] = useState<string>('09:00')
  const [qcEndDate, setQcEndDate] = useState<string>(() => { const d = new Date(); return d.toISOString().split('T')[0] })
  const [qcEndTime, setQcEndTime] = useState<string>('09:00')

  // 예상탁송비
  const [qcDeliveryFee, setQcDeliveryFee] = useState<number>(0)

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

  // 검색 필터링: 차종명, 카테고리, 군 모두 매칭
  const qcSearchResults = useMemo(() => {
    if (!qcSearch.trim()) return lotteRates
    const q = qcSearch.trim().toLowerCase()
    return lotteRates.filter(r =>
      r.vehicle_names.toLowerCase().includes(q) ||
      r.lotte_category.toLowerCase().includes(q) ||
      r.service_group.toLowerCase().includes(q)
    )
  }, [lotteRates, qcSearch])

  // 외부 클릭 시 검색 드롭다운 닫기
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (qcSearchRef.current && !qcSearchRef.current.contains(e.target as Node)) {
        setQcSearchOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

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

    // 예상탁송비 추가
    const grandTotal = finalAmount + qcDeliveryFee

    // 롯데 요금은 VAT 포함가이므로, 할인 적용가도 VAT 포함
    // 역산: 공급가액 = 최종금액 / 1.1, VAT = 최종금액 - 공급가액
    const supplyPrice = Math.round(grandTotal / 1.1)
    const vat = grandTotal - supplyPrice
    return {
      lines, totalBase, totalDisc, discountAmount,
      faultActive, faultPercent: qcFaultPercent, faultAmount, serviceSupport: qcServiceSupport, supportAmount, finalAmount,
      deliveryFee: qcDeliveryFee, grandTotal,
      supplyPrice, vat, totalWithVat: grandTotal,
    }
  }, [qcSelectedRate, qcCalcBreakdown, globalDiscount, qcFaultEnabled, qcFaultPercent, qcServiceSupport, qcDeliveryFee])

  // ─── 빠른 계산기 → 단기 탭 임시저장 ───
  const handleQcSave = useCallback(async () => {
    if (!cid) return alert('회사 정보를 찾을 수 없습니다.')
    if (!qcResult || !qcSelectedRate) return alert('차종을 선택하고 금액이 계산된 상태에서 저장해주세요.')

    setQcSaving(true)
    try {
      const d = qcDateMode === 'days' ? qcDays : Math.floor(qcTotalHours / 24)
      const h = qcDateMode === 'days' ? qcHours : Math.round(qcTotalHours % 24)
      const periodParts: string[] = []
      if (d > 0) periodParts.push(`${d}일`)
      if (h > 0) periodParts.push(`${h}시간`)
      const periodStr = periodParts.join(' ') || '0시간'

      const carInfo = `${qcSelectedRate.lotte_category} · ${qcSelectedRate.vehicle_names}`
      const memoText = [
        `[청구서] ${carInfo}`,
        `기간: ${periodStr}`,
        `할인율: ${globalDiscount}%`,
        qcResult.faultActive ? `자차과실: ${qcResult.faultPercent}%` : '',
        qcResult.supportAmount > 0 ? `서비스지원: ${qcResult.serviceSupport}%` : '',
        qcResult.deliveryFee > 0 ? `탁송비: ${f(qcResult.deliveryFee)}원` : '',
      ].filter(Boolean).join(' | ')

      const invoiceDetail = {
        tenant_name: '',
        rental_car: carInfo,
        rental_plate: '',
        fuel_type: '',
        rental_start: qcDateMode === 'range' && qcStartDate ? `${qcStartDate}T${qcStartTime || '09:00'}` : '',
        return_datetime: qcDateMode === 'range' && qcEndDate ? `${qcEndDate}T${qcEndTime || '18:00'}` : '',
        total_amount: qcResult.totalWithVat,
        type: 'invoice',
        // 계산기 메타 정보
        calc_meta: {
          lotte_category: qcSelectedRate.lotte_category,
          vehicle_names: qcSelectedRate.vehicle_names,
          service_group: qcSelectedRate.service_group,
          discount_percent: globalDiscount,
          days: d, hours: h,
          fault_enabled: qcResult.faultActive,
          fault_percent: qcResult.faultPercent,
          service_support: qcResult.serviceSupport,
          delivery_fee: qcResult.deliveryFee,
          breakdown: qcResult.lines,
        },
      }

      const authHeaders = await getAuthHeader();
      const quotePayload = {
        customer_name: '',
        rent_fee: qcResult.totalWithVat,
        deposit: 0,
        memo: memoText,
        status: 'draft',
        rental_type: '청구서',
        quote_detail: invoiceDetail,
      };
      const res = await fetch('/api/quotes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify(quotePayload)
      })
      const { error } = await res.json()
      if (error) throw new Error(error)
      alert('단기 탭에 임시저장 되었습니다.')
      router.push('/quotes?tab=short_term')
    } catch (err: any) {
      alert(`저장 실패: ${err?.message || JSON.stringify(err)}`)
    } finally {
      setQcSaving(false)
    }
  }, [cid, qcResult, qcSelectedRate, qcDateMode, qcDays, qcHours, qcTotalHours, qcStartDate, qcStartTime, qcEndDate, qcEndTime, globalDiscount, router])

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
    <div>

      {/* ─── 서브탭 (칩 필터 스타일 — 단기/장기 탭과 동일 간격) ─── */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
          {SUB_TABS.map(t => (
            <button key={t.key} onClick={() => setSubTab(t.key)}
              style={{
                padding: '6px 16px', borderRadius: 20, border: 'none', fontSize: 13, fontWeight: 600,
                cursor: 'pointer', transition: 'all 0.15s', whiteSpace: 'nowrap',
                background: subTab === t.key ? '#2d5fa8' : '#f3f4f6',
                color: subTab === t.key ? '#fff' : '#6b7280',
              }}>
              {subTab === t.key && '● '}{t.icon} {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* ═════════════════════════════════════════════ */}
      {/* 탭 1: 요금 조회 (빠른 계산기 + 매핑 + 롯데 요금표) */}
      {/* ═════════════════════════════════════════════ */}
      {subTab === 'settings' && (
        <div className="space-y-4">

          {/* ─── 빠른 견적 계산기 ─── */}
          <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e5e7eb', overflow: 'hidden' }}>
            {/* 할인율 */}
            <div style={{ padding: '14px 20px', borderBottom: '1px solid #f3f4f6' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: '#374151', whiteSpace: 'nowrap' }}>롯데 기준 할인율</span>
                <input type="range" min={10} max={100} step={5} value={globalDiscount}
                  onChange={e => applyGlobalDiscount(Number(e.target.value))}
                  style={{ flex: 1, accentColor: '#2d5fa8' }} />
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <input type="number" min={1} max={100} value={globalDiscount}
                    onChange={e => applyGlobalDiscount(Number(e.target.value))}
                    style={{ width: 52, textAlign: 'center', border: '1px solid #e5e7eb', borderRadius: 8, padding: '6px 4px', fontSize: 14, fontWeight: 800, color: '#2d5fa8' }} />
                  <span style={{ fontSize: 13, color: '#6b7280', fontWeight: 700 }}>%</span>
                </div>
              </div>
            </div>
            {/* 카테고리 + 차종 드롭다운 */}
            <div ref={qcSearchRef} style={{ padding: '10px 20px', borderBottom: '1px solid #f3f4f6', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <select value={qcCategory} onChange={e => { setQcCategory(e.target.value); setQcVehicle(''); setQcSearch('') }}
                style={{ padding: '8px 12px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13, fontWeight: 600 }}>
                <option value="">카테고리</option>
                {qcCategories.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              {qcCategory ? (
                <select value={qcVehicle} onChange={e => setQcVehicle(e.target.value)}
                  style={{ flex: 1, minWidth: 200, padding: '8px 12px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13, fontWeight: 600 }}>
                  <option value="">차종 선택</option>
                  {qcVehicles.map((v, i) => <option key={i} value={v.vehicle_names}>{v.vehicle_names} ({v.service_group})</option>)}
                </select>
              ) : (
                <div style={{ flex: 1, position: 'relative', minWidth: 200 }}>
                  <input type="text" value={qcSearch} placeholder="차종명으로 검색 (예: 쏘나타, G80, 카니발)"
                    onChange={e => { setQcSearch(e.target.value); setQcSearchOpen(true) }}
                    onFocus={() => { if (qcSearch.trim()) setQcSearchOpen(true) }}
                    style={{ width: '100%', padding: '8px 12px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13, outline: 'none' }} />
                  {qcSearchOpen && qcSearch.trim() && (
                    <div style={{ position: 'absolute', zIndex: 50, left: 0, right: 0, marginTop: 4, background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', maxHeight: 256, overflowY: 'auto' }}>
                      {qcSearchResults.length === 0 ? (
                        <div style={{ padding: '24px 16px', textAlign: 'center', fontSize: 13, color: '#9ca3af' }}>검색 결과가 없습니다</div>
                      ) : qcSearchResults.map((r, i) => (
                        <button key={r.id || i}
                          onClick={() => { setQcCategory(r.lotte_category); setQcVehicle(r.vehicle_names); setQcSearch(''); setQcSearchOpen(false) }}
                          style={{ width: '100%', textAlign: 'left', padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 8, border: 'none', borderBottom: '1px solid #f9fafb', background: 'transparent', cursor: 'pointer', fontSize: 13 }}>
                          <span style={{ background: '#fef2f2', color: '#dc2626', fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4 }}>{r.lotte_category}</span>
                          <span style={{ background: '#f3f4f6', color: '#6b7280', fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4 }}>{r.service_group}</span>
                          <span style={{ color: '#374151', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.vehicle_names}</span>
                          <span style={{ marginLeft: 'auto', fontSize: 12, color: '#9ca3af' }}>{f(calcRate(r.rate_1_3days, globalDiscount))}원/일</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
              {qcSelectedRate && (
                <button onClick={() => { setQcCategory(''); setQcVehicle(''); setQcSearch('') }}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', fontSize: 16, lineHeight: 1, padding: 4 }}>✕</button>
              )}
            </div>
            {/* 선택 완료 표시 */}
            {qcSelectedRate && (
              <div style={{ padding: '10px 20px', borderBottom: '1px solid #f3f4f6', display: 'flex', alignItems: 'center', gap: 8, background: '#eff6ff' }}>
                <span style={{ background: '#fef2f2', color: '#dc2626', fontSize: 11, fontWeight: 700, padding: '2px 6px', borderRadius: 4 }}>{qcSelectedRate.lotte_category}</span>
                <span style={{ background: '#e0e7ff', color: '#2d5fa8', fontSize: 11, fontWeight: 700, padding: '2px 6px', borderRadius: 4 }}>{qcSelectedRate.service_group}</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: '#111827', flex: 1 }}>{qcSelectedRate.vehicle_names}</span>
                <span style={{ fontSize: 13, color: '#2d5fa8', fontWeight: 800 }}>{f(calcRate(qcSelectedRate.rate_1_3days, globalDiscount))}원/일</span>
              </div>
            )}
            {/* Stepper + 결과 카드 (2열, 모바일 1열) */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0 }} className="qc-calc-grid">
              <style>{`@media (max-width: 768px) { .qc-calc-grid { grid-template-columns: 1fr !important; } .qc-calc-left { border-right: none !important; border-bottom: 1px solid #f3f4f6 !important; } }`}</style>
              {/* 왼쪽: Stepper 설정 */}
              <div style={{ padding: '12px 20px', borderRight: '1px solid #f3f4f6' }} className="qc-calc-left">
                {/* 기간 모드 전환 */}
                <div style={{ display: 'flex', gap: 4, marginBottom: 10 }}>
                  <button onClick={() => { if (qcDateMode !== 'days') { setQcDateMode('days'); setQcDays(0); setQcHours(0); setQcDeliveryFee(0); setQcFaultEnabled(false); setQcFaultPercent(100); setQcServiceSupport(0) } }}
                    style={{ flex: 1, padding: '6px 0', border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer', background: qcDateMode === 'days' ? '#2d5fa8' : '#f3f4f6', color: qcDateMode === 'days' ? '#fff' : '#9ca3af' }}>일/시간 입력</button>
                  <button onClick={() => { if (qcDateMode !== 'range') { setQcDateMode('range'); const today = new Date(); setQcStartDate(today.toISOString().split('T')[0]); setQcStartTime('09:00'); setQcEndDate(today.toISOString().split('T')[0]); setQcEndTime('09:00'); setQcDeliveryFee(0); setQcFaultEnabled(false); setQcFaultPercent(100); setQcServiceSupport(0) } }}
                    style={{ flex: 1, padding: '6px 0', border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer', background: qcDateMode === 'range' ? '#2d5fa8' : '#f3f4f6', color: qcDateMode === 'range' ? '#fff' : '#9ca3af' }}>날짜/시간 선택</button>
                </div>
                {qcDateMode === 'days' ? (
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid #f1f5f9' }}>
                      <span style={{ fontSize: 14, fontWeight: 600, color: '#475569' }}>일수</span>
                      <div style={{ display: 'flex', alignItems: 'center', background: '#f1f5f9', borderRadius: 8, overflow: 'hidden' }}>
                        <button onClick={() => setQcDays(Math.max(0, qcDays - 1))} style={{ width: 32, height: 32, border: 'none', background: 'transparent', cursor: 'pointer', fontWeight: 700, fontSize: 16, color: '#64748b' }}>−</button>
                        <span style={{ minWidth: 36, textAlign: 'center', fontWeight: 900, fontSize: 16, color: '#0f172a' }}>{qcDays}</span>
                        <button onClick={() => setQcDays(Math.min(365, qcDays + 1))} style={{ width: 32, height: 32, border: 'none', background: 'transparent', cursor: 'pointer', fontWeight: 700, fontSize: 16, color: '#64748b' }}>+</button>
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid #f1f5f9' }}>
                      <span style={{ fontSize: 14, fontWeight: 600, color: '#475569' }}>시간</span>
                      <div style={{ display: 'flex', alignItems: 'center', background: '#f1f5f9', borderRadius: 8, overflow: 'hidden' }}>
                        <button onClick={() => setQcHours(Math.max(0, qcHours - 1))} style={{ width: 32, height: 32, border: 'none', background: 'transparent', cursor: 'pointer', fontWeight: 700, fontSize: 16, color: '#64748b' }}>−</button>
                        <span style={{ minWidth: 36, textAlign: 'center', fontWeight: 900, fontSize: 16, color: '#0f172a' }}>{qcHours}</span>
                        <button onClick={() => setQcHours(Math.min(23, qcHours + 1))} style={{ width: 32, height: 32, border: 'none', background: 'transparent', cursor: 'pointer', fontWeight: 700, fontSize: 16, color: '#64748b' }}>+</button>
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid #f1f5f9' }}>
                      <span style={{ fontSize: 14, fontWeight: 600, color: '#475569' }}>사고과실</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        {qcFaultEnabled && <span style={{ fontSize: 13, fontWeight: 800, color: '#ea580c' }}>{qcFaultPercent}%</span>}
                        <button onClick={() => setQcFaultEnabled(!qcFaultEnabled)}
                          style={{ padding: '5px 12px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 700, background: qcFaultEnabled ? '#ea580c' : '#e2e8f0', color: qcFaultEnabled ? '#fff' : '#94a3b8' }}>
                          {qcFaultEnabled ? 'ON' : 'OFF'}
                        </button>
                      </div>
                    </div>
                    {qcFaultEnabled && (<>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #f1f5f9' }}>
                        <span style={{ fontSize: 13, color: '#c2410c', paddingLeft: 10 }}>↳ 자차과실</span>
                        <div style={{ display: 'flex', alignItems: 'center', background: '#f1f5f9', borderRadius: 8, overflow: 'hidden' }}>
                          <button onClick={() => setQcFaultPercent(Math.max(0, qcFaultPercent - 5))} style={{ width: 28, height: 28, border: 'none', background: 'transparent', cursor: 'pointer', fontWeight: 700, color: '#64748b' }}>−</button>
                          <span style={{ minWidth: 38, textAlign: 'center', fontWeight: 900, fontSize: 14, color: '#0f172a' }}>{qcFaultPercent}%</span>
                          <button onClick={() => setQcFaultPercent(Math.min(100, qcFaultPercent + 5))} style={{ width: 28, height: 28, border: 'none', background: 'transparent', cursor: 'pointer', fontWeight: 700, color: '#64748b' }}>+</button>
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #f1f5f9' }}>
                        <span style={{ fontSize: 13, color: '#15803d', paddingLeft: 10 }}>↳ 서비스지원</span>
                        <div style={{ display: 'flex', alignItems: 'center', background: '#f1f5f9', borderRadius: 8, overflow: 'hidden' }}>
                          <button onClick={() => setQcServiceSupport(Math.max(0, qcServiceSupport - 5))} style={{ width: 28, height: 28, border: 'none', background: 'transparent', cursor: 'pointer', fontWeight: 700, color: '#64748b' }}>−</button>
                          <span style={{ minWidth: 38, textAlign: 'center', fontWeight: 900, fontSize: 14, color: '#0f172a' }}>{qcServiceSupport}%</span>
                          <button onClick={() => setQcServiceSupport(Math.min(100, qcServiceSupport + 5))} style={{ width: 28, height: 28, border: 'none', background: 'transparent', cursor: 'pointer', fontWeight: 700, color: '#64748b' }}>+</button>
                        </div>
                      </div>
                    </>)}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0' }}>
                      <span style={{ fontSize: 14, fontWeight: 600, color: '#475569' }}>탁송비</span>
                      <div style={{ display: 'flex', alignItems: 'center', background: '#f1f5f9', borderRadius: 8, overflow: 'hidden' }}>
                        <button onClick={() => setQcDeliveryFee(Math.max(0, qcDeliveryFee - 10000))} style={{ width: 32, height: 32, border: 'none', background: 'transparent', cursor: 'pointer', fontWeight: 700, fontSize: 16, color: '#64748b' }}>−</button>
                        <span style={{ minWidth: 40, textAlign: 'center', fontWeight: 900, fontSize: 14, color: '#0f172a' }}>{Math.round(qcDeliveryFee / 10000)}<span style={{ fontSize: 11, color: '#94a3b8', marginLeft: 1 }}>만</span></span>
                        <button onClick={() => setQcDeliveryFee(qcDeliveryFee + 10000)} style={{ width: 32, height: 32, border: 'none', background: 'transparent', cursor: 'pointer', fontWeight: 700, fontSize: 16, color: '#64748b' }}>+</button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div>
                      <label style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', display: 'block', marginBottom: 4 }}>대여 시작</label>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <input type="date" value={qcStartDate} onChange={e => setQcStartDate(e.target.value)} style={{ flex: 3, minWidth: 0, padding: '7px 10px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13, fontWeight: 600, outline: 'none' }} />
                        <input type="time" value={qcStartTime} onChange={e => setQcStartTime(e.target.value)} style={{ flex: 2, minWidth: 0, padding: '7px 10px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13, fontWeight: 600, outline: 'none' }} />
                      </div>
                    </div>
                    <div>
                      <label style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', display: 'block', marginBottom: 4 }}>반납 예정</label>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <input type="date" value={qcEndDate} onChange={e => setQcEndDate(e.target.value)} style={{ flex: 3, minWidth: 0, padding: '7px 10px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13, fontWeight: 600, outline: 'none' }} />
                        <input type="time" value={qcEndTime} onChange={e => setQcEndTime(e.target.value)} style={{ flex: 2, minWidth: 0, padding: '7px 10px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13, fontWeight: 600, outline: 'none' }} />
                      </div>
                    </div>
                    {qcTotalHours > 0 && (
                      <div style={{ fontSize: 12, color: '#6b7280', fontWeight: 600, textAlign: 'center', padding: '4px 0' }}>
                        = 총 {qcTotalHours < 24 ? `${Math.round(qcTotalHours)}시간` : `${Math.floor(qcTotalHours / 24)}일 ${Math.round(qcTotalHours % 24)}시간`}
                      </div>
                    )}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderTop: '1px solid #f1f5f9' }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: '#475569' }}>사고과실</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        {qcFaultEnabled && <span style={{ fontSize: 13, fontWeight: 800, color: '#ea580c' }}>{qcFaultPercent}%</span>}
                        <button onClick={() => setQcFaultEnabled(!qcFaultEnabled)}
                          style={{ padding: '4px 10px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 700, background: qcFaultEnabled ? '#ea580c' : '#e2e8f0', color: qcFaultEnabled ? '#fff' : '#94a3b8' }}>
                          {qcFaultEnabled ? 'ON' : 'OFF'}
                        </button>
                      </div>
                    </div>
                    {qcFaultEnabled && (<>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderTop: '1px solid #f1f5f9' }}>
                        <span style={{ fontSize: 13, color: '#c2410c', paddingLeft: 10 }}>↳ 자차과실</span>
                        <div style={{ display: 'flex', alignItems: 'center', background: '#f1f5f9', borderRadius: 8, overflow: 'hidden' }}>
                          <button onClick={() => setQcFaultPercent(Math.max(0, qcFaultPercent - 5))} style={{ width: 28, height: 28, border: 'none', background: 'transparent', cursor: 'pointer', fontWeight: 700, color: '#64748b' }}>−</button>
                          <span style={{ minWidth: 38, textAlign: 'center', fontWeight: 900, fontSize: 14, color: '#0f172a' }}>{qcFaultPercent}%</span>
                          <button onClick={() => setQcFaultPercent(Math.min(100, qcFaultPercent + 5))} style={{ width: 28, height: 28, border: 'none', background: 'transparent', cursor: 'pointer', fontWeight: 700, color: '#64748b' }}>+</button>
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderTop: '1px solid #f1f5f9' }}>
                        <span style={{ fontSize: 13, color: '#15803d', paddingLeft: 10 }}>↳ 서비스지원</span>
                        <div style={{ display: 'flex', alignItems: 'center', background: '#f1f5f9', borderRadius: 8, overflow: 'hidden' }}>
                          <button onClick={() => setQcServiceSupport(Math.max(0, qcServiceSupport - 5))} style={{ width: 28, height: 28, border: 'none', background: 'transparent', cursor: 'pointer', fontWeight: 700, color: '#64748b' }}>−</button>
                          <span style={{ minWidth: 38, textAlign: 'center', fontWeight: 900, fontSize: 14, color: '#0f172a' }}>{qcServiceSupport}%</span>
                          <button onClick={() => setQcServiceSupport(Math.min(100, qcServiceSupport + 5))} style={{ width: 28, height: 28, border: 'none', background: 'transparent', cursor: 'pointer', fontWeight: 700, color: '#64748b' }}>+</button>
                        </div>
                      </div>
                    </>)}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderTop: '1px solid #f1f5f9' }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: '#475569' }}>탁송비</span>
                      <div style={{ display: 'flex', alignItems: 'center', background: '#f1f5f9', borderRadius: 8, overflow: 'hidden' }}>
                        <button onClick={() => setQcDeliveryFee(Math.max(0, qcDeliveryFee - 10000))} style={{ width: 28, height: 28, border: 'none', background: 'transparent', cursor: 'pointer', fontWeight: 700, color: '#64748b' }}>−</button>
                        <span style={{ minWidth: 36, textAlign: 'center', fontWeight: 900, fontSize: 13, color: '#0f172a' }}>{Math.round(qcDeliveryFee / 10000)}<span style={{ fontSize: 11, color: '#94a3b8', marginLeft: 1 }}>만</span></span>
                        <button onClick={() => setQcDeliveryFee(qcDeliveryFee + 10000)} style={{ width: 28, height: 28, border: 'none', background: 'transparent', cursor: 'pointer', fontWeight: 700, color: '#64748b' }}>+</button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
              {/* 오른쪽: 결과 카드 */}
              <div style={{ padding: '12px 20px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                <div style={{ background: 'linear-gradient(135deg, #0f172a, #1e293b)', borderRadius: 10, padding: 18, textAlign: 'center' }}>
                  {qcResult && qcSelectedRate ? (<>
                    <div style={{ fontSize: 12, color: '#64748b', marginBottom: 2 }}>
                      {qcSelectedRate.lotte_category} · {qcSelectedRate.vehicle_names.length > 20 ? qcSelectedRate.vehicle_names.slice(0, 20) + '…' : qcSelectedRate.vehicle_names} · {(() => { const d = qcDateMode === 'days' ? qcDays : Math.floor(qcTotalHours / 24); const h = qcDateMode === 'days' ? qcHours : Math.round(qcTotalHours % 24); const p: string[] = []; if (d > 0) p.push(`${d}일`); if (h > 0) p.push(`${h}시간`); return p.join(' ') || '0시간' })()}
                    </div>
                    <div style={{ fontSize: 36, fontWeight: 900, color: '#fff', letterSpacing: -1 }}>
                      {f(qcResult.totalWithVat)}<span style={{ fontSize: 14, color: '#475569', marginLeft: 2 }}>원</span>
                    </div>
                    {(() => { const d = qcDateMode === 'days' ? qcDays : Math.floor(qcTotalHours / 24); return d > 0 ? <div style={{ fontSize: 13, color: '#60a5fa', marginTop: 2 }}>하루 {f(Math.round(qcResult.totalWithVat / d))}원</div> : null })()}
                    <div style={{ display: 'flex', justifyContent: 'center', gap: 12, marginTop: 6, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 11, color: '#94a3b8' }}>렌트 {f(qcResult.totalDisc)}</span>
                      {qcResult.faultActive && <span style={{ fontSize: 11, color: '#fb923c' }}>과실 {qcResult.faultPercent}%</span>}
                      {qcResult.supportAmount > 0 && <span style={{ fontSize: 11, color: '#4ade80' }}>지원 -{qcResult.serviceSupport}%</span>}
                      {qcResult.deliveryFee > 0 && <span style={{ fontSize: 11, color: '#94a3b8' }}>탁송 {f(qcResult.deliveryFee)}</span>}
                    </div>
                    <div style={{ borderTop: '1px solid #334155', paddingTop: 10, marginTop: 10, textAlign: 'left' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 3 }}>
                        <span style={{ color: '#94a3b8' }}>렌트비 (할인 {globalDiscount}%)</span>
                        <span style={{ color: '#94a3b8', fontWeight: 600 }}>{f(qcResult.totalDisc)}원</span>
                      </div>
                      {qcResult.faultActive && (<>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 3 }}>
                          <span style={{ color: '#fb923c' }}>자차과실 ({qcResult.faultPercent}%)</span>
                          <span style={{ color: '#fb923c', fontWeight: 600 }}>{f(qcResult.faultAmount)}원</span>
                        </div>
                        {qcResult.supportAmount > 0 && (
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 3 }}>
                            <span style={{ color: '#4ade80' }}>서비스지원 (-{qcResult.serviceSupport}%)</span>
                            <span style={{ color: '#4ade80', fontWeight: 600 }}>-{f(qcResult.supportAmount)}원</span>
                          </div>
                        )}
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 3, borderTop: '1px solid #334155', paddingTop: 4, marginTop: 2 }}>
                          <span style={{ color: '#fff', fontWeight: 900 }}>실부담금</span>
                          <span style={{ color: '#fff', fontWeight: 900 }}>{f(qcResult.finalAmount)}원</span>
                        </div>
                      </>)}
                      {qcResult.deliveryFee > 0 && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 3 }}>
                          <span style={{ color: '#94a3b8' }}>탁송비</span>
                          <span style={{ color: '#94a3b8', fontWeight: 600 }}>{f(qcResult.deliveryFee)}원</span>
                        </div>
                      )}
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 2, borderTop: '1px solid #334155', paddingTop: 4, marginTop: 2 }}>
                        <span style={{ color: '#94a3b8' }}>공급가액</span>
                        <span style={{ color: '#94a3b8', fontWeight: 600 }}>{f(qcResult.supplyPrice)}원</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                        <span style={{ color: '#64748b' }}>VAT (10%)</span>
                        <span style={{ color: '#64748b' }}>{f(qcResult.vat)}원</span>
                      </div>
                    </div>
                  </>) : (
                    <p style={{ fontSize: 13, color: '#fb923c', margin: 0, fontWeight: 600 }}>{!qcSelectedRate ? '차량을 먼저 선택해주세요' : '렌터카 이용기간을 설정해주세요'}</p>
                  )}
                </div>
                {/* 임시저장 버튼 */}
                {qcResult && qcSelectedRate && (
                  <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                    <button
                      onClick={handleQcSave}
                      disabled={qcSaving}
                      style={{
                        flex: 1, padding: '10px 0', border: 'none', borderRadius: 8, cursor: 'pointer',
                        background: 'linear-gradient(135deg, #2d5fa8, #1e40af)', color: '#fff',
                        fontWeight: 800, fontSize: 13, boxShadow: '0 4px 14px rgba(45,95,168,0.3)',
                        opacity: qcSaving ? 0.5 : 1, transition: 'opacity 0.15s',
                      }}
                    >
                      {qcSaving ? '저장 중...' : '💾 임시저장'}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
          {/* ─── 할인율 + 정비군 매핑 ─── */}

          {/* 정비군별 요율 매핑 */}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-steel-500" />
                <h3 className="font-black text-gray-800 text-sm">정비군별 요율 매핑</h3>
                <span className="text-xs text-gray-400 font-medium">롯데 기준가 × {globalDiscount}% = 턴키 단가</span>
              </div>
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
            {/* 데스크톱: 테이블 */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full">
                <thead><tr className="text-gray-400 whitespace-nowrap">
                  <th className="py-2 px-3 pl-4 text-left text-sm font-bold">정비군</th>
                  <th className="py-2 px-3 text-left text-sm font-bold">차종 분류</th>
                  <th className="py-2 px-3 text-left text-sm font-bold">배기량</th>
                  <th className="py-2 pr-3 text-right text-sm font-bold text-red-400">롯데 기준</th>
                  <th className="py-2 px-3 text-center text-sm font-bold text-steel-500">롯데 할인율</th>
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
                            <span className="text-sm font-bold text-steel-600">{r.discount_percent}%</span>
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
            {/* 모바일: 카드형 */}
            <div className="md:hidden">
              {rates.map((r, i) => {
                const computed = r.calc_method === 'auto' ? calcRate(r.lotte_base_rate, r.discount_percent) : r.daily_rate
                return (
                  <div key={r.id || `rate-m-${i}`} style={{ padding: '10px 14px', borderBottom: '1px solid #f3f4f6' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                      <span className="bg-steel-100 text-steel-700 text-[11px] font-bold px-2 py-0.5 rounded">{r.service_group}</span>
                      <span style={{ fontSize: 13, fontWeight: 700, color: '#111827' }}>{r.vehicle_class}</span>
                      <span style={{ fontSize: 11, color: '#9ca3af' }}>{r.displacement_range}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ display: 'flex', gap: 10, fontSize: 11, color: '#6b7280' }}>
                        <span>롯데 <span style={{ color: '#dc2626', fontWeight: 700 }}>{f(r.lotte_base_rate)}</span></span>
                        <span>할인 <span style={{ fontWeight: 700 }}>{r.discount_percent}%</span></span>
                        <span className={r.calc_method === 'auto' ? 'text-green-600' : 'text-orange-600'}>{r.calc_method === 'auto' ? '자동' : '수동'}</span>
                      </div>
                      <span style={{ fontSize: 14, fontWeight: 900, color: '#2d5fa8' }}>{f(computed)}원</span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* ─── 롯데 참고 자료 (하단, 접이식) ─── */}

          {/* 정비군 분류 기준표 */}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm">
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
                  <button onClick={saveLotteRates} disabled={saving} className="py-1 px-3 text-sm rounded-lg bg-steel-600 text-white font-bold hover:bg-steel-700 disabled:opacity-50 transition-colors">{saving ? '저장 중...' : '저장'}</button>
                </>
              ) : (
                <div className="flex gap-1.5">
                  <button onClick={fetchLotteRatesAuto} disabled={lotteUpdating}
                    className="py-1 px-3 text-sm rounded-lg bg-steel-600 text-white font-bold hover:bg-steel-700 disabled:opacity-50 transition-colors">
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

          {/* 테이블 (반응형 스크롤) */}
          <div className="hidden md:block" style={{ overflowX: 'auto' }}>
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
                <th className="py-2 pr-3 text-right text-sm font-bold text-steel-500">롯데 할인({globalDiscount}%)</th>
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
                        <span className="text-sm font-black text-steel-600">{f(calcRate(lr.rate_1_3days, globalDiscount))}</span>
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
          {/* 모바일: 카드형 */}
          <div className="md:hidden">
            {filteredLotteRates.map((lr, i) => (
              <div key={lr.id || i} style={{ padding: '10px 14px', borderBottom: '1px solid #f3f4f6' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                  <span className="bg-red-50 text-red-600 text-[10px] font-bold px-1.5 py-0.5 rounded">{lr.lotte_category}</span>
                  <span className="bg-steel-100 text-steel-700 text-[10px] font-bold px-1.5 py-0.5 rounded">{lr.service_group}</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#111827', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{lr.vehicle_names}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11 }}>
                  <div style={{ display: 'flex', gap: 6, color: '#9ca3af' }}>
                    <span>1~3일 <span style={{ color: '#dc2626', fontWeight: 700 }}>{f(lr.rate_1_3days)}</span></span>
                    <span>7일+ <span style={{ fontWeight: 700, color: '#374151' }}>{f(lr.rate_7plus_days)}</span></span>
                  </div>
                  <span style={{ fontSize: 13, fontWeight: 900, color: '#2d5fa8' }}>{f(calcRate(lr.rate_1_3days, globalDiscount))}원<span style={{ fontSize: 10, color: '#9ca3af', fontWeight: 400 }}>/일</span></span>
                </div>
              </div>
            ))}
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
        const vc = vehicleCount || 1  // 차량수 미입력 시 1대 기준

        // ── 리스크 계수 산출 ──
        // 사고 리스크: (사고발생율/100) × 사고수리일수
        // 고장 리스크: (고장발생율/100) × 고장수리일수
        const accidentRisk = (simAccidentRate / 100) * simAvgRepairDays
        const breakdownRisk = (simBreakdownRate / 100) * simAvgBreakdownDays
        const totalRisk = accidentRisk + breakdownRisk

        // ── 요율표 컬럼: 수동 선택 (5일, 10일, 15일 등) ──
        const selectedDaysList = [...customDays].sort((a, b) => a - b)

        // 전체 정비군 요율 자동 계산
        // 공식: 일단가 × (사고리스크 + 고장리스크) × 대차일수 = 1대당 연간 금액
        const quoteLines = rates.map(r => {
          const dr = r.calc_method === 'auto' ? calcRate(r.lotte_base_rate, globalDiscount) : r.daily_rate
          const byDays: Record<number, { annual: number; monthly: number }> = {}
          for (const d of selectedDaysList) {
            const annual = Math.round(dr * totalRisk * d)  // 일단가 × 리스크계수 × 대차일수
            byDays[d] = { annual, monthly: Math.round(annual / 12) }
          }
          return { ...r, dailyRate: dr, byDays }
        })

        // 일수별 합계 — 1대당 월 금액 + fleet 합계 (× 차량수)
        const totalsByDays: Record<number, {
          annual: number; monthly: number; monthlySupply: number; monthlyVat: number
          fleetMonthly: number; fleetMonthlySupply: number; fleetMonthlyVat: number
        }> = {}
        for (const d of selectedDaysList) {
          const annual = quoteLines.reduce((s, l) => s + l.byDays[d].annual, 0)
          const monthly = Math.round(annual / 12)
          const monthlySupply = Math.round(monthly / 1.1)
          const fleetMonthly = monthly * vc
          const fleetMonthlySupply = Math.round(fleetMonthly / 1.1)
          totalsByDays[d] = {
            annual, monthly, monthlySupply, monthlyVat: monthly - monthlySupply,
            fleetMonthly, fleetMonthlySupply, fleetMonthlyVat: fleetMonthly - fleetMonthlySupply
          }
        }
        const colCount = 4 + selectedDaysList.length

        return (
        <div className="space-y-4">

          {/* ① 시장 표준 요율 설정 + 계약 조건 */}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm">
            <div className="px-6 py-4 border-b border-gray-100 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <span className="w-2 h-2 rounded-full bg-steel-500" />
                <h3 className="font-black text-gray-800 text-sm whitespace-nowrap">시장 표준 요율 설정</h3>
                <span className="text-[11px] text-gray-400 hidden sm:inline">전문가 수집 데이터 기반</span>
              </div>
            </div>
            <div className="p-4 space-y-4">

              {/* 시장 데이터 입력 */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div>
                  <label className="block text-[11px] font-bold text-gray-500 mb-1">사고 발생률</label>
                  <input type="number" step={0.1} min={0} value={simAccidentRate}
                    onChange={e => setSimAccidentRate(Number(e.target.value))}
                    className="w-full border border-gray-200 px-2 py-1.5 rounded-lg font-bold text-xs text-center focus:border-steel-500 outline-none" />
                  <span className="text-[10px] text-gray-400 mt-0.5 block">건/100대·년</span>
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-gray-500 mb-1">사고 수리일수</label>
                  <input type="number" step={0.5} min={1} value={simAvgRepairDays}
                    onChange={e => setSimAvgRepairDays(Number(e.target.value))}
                    className="w-full border border-gray-200 px-2 py-1.5 rounded-lg font-bold text-xs text-center focus:border-steel-500 outline-none" />
                  <span className="text-[10px] text-gray-400 mt-0.5 block">평균일</span>
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-gray-500 mb-1">고장 발생률</label>
                  <input type="number" step={0.1} min={0} value={simBreakdownRate}
                    onChange={e => setSimBreakdownRate(Number(e.target.value))}
                    className="w-full border border-gray-200 px-2 py-1.5 rounded-lg font-bold text-xs text-center focus:border-steel-500 outline-none" />
                  <span className="text-[10px] text-gray-400 mt-0.5 block">건/100대·년</span>
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-gray-500 mb-1">고장 수리일수</label>
                  <input type="number" step={0.5} min={1} value={simAvgBreakdownDays}
                    onChange={e => setSimAvgBreakdownDays(Number(e.target.value))}
                    className="w-full border border-gray-200 px-2 py-1.5 rounded-lg font-bold text-xs text-center focus:border-steel-500 outline-none" />
                  <span className="text-[10px] text-gray-400 mt-0.5 block">평균일</span>
                </div>
              </div>

              {/* 기본 데이터 출처 */}
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-gray-400 px-1">
                <span className="font-bold text-gray-500">기준 데이터</span>
                <span>사고발생률·수리일수: 보험개발원 자동차보험 통계 (2024)</span>
                <span className="text-gray-300">|</span>
                <span>고장발생률·수리일수: 한국교통안전공단 자동차검사 통계 (2024)</span>
                <span className="text-gray-300">|</span>
                <span>확인일: 2025.01.15</span>
              </div>

              {/* 적용 공식 + 산출 결과 */}
              <div className="bg-gray-50 rounded-xl px-4 py-2.5 space-y-1">
                <div className="text-[11px] text-gray-400">공식: 일단가 × ((사고발생율÷100 × 사고수리일수) + (고장발생율÷100 × 고장수리일수)) × 대차일수</div>
                <div className="text-[11px] text-gray-500">리스크 계수: <span className="font-bold text-steel-600">{accidentRisk.toFixed(4)}</span><span className="text-gray-300"> (사고)</span> + <span className="font-bold text-steel-600">{breakdownRisk.toFixed(4)}</span><span className="text-gray-300"> (고장)</span> = <span className="font-black text-steel-700">{totalRisk.toFixed(4)}</span></div>
              </div>

              {/* 구분선 */}
              <div className="border-t border-gray-200" />

              {/* 대차일수 + 할인율 */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-gray-500 mb-1.5">대차일수 <span className="text-gray-400 font-normal">(복수선택)</span></label>
                  <div className="flex gap-1">
                    {DAY_PRESETS.map(d => {
                      const isSelected = customDays.includes(d)
                      return (
                        <button key={d} onClick={() => {
                          if (isSelected) {
                            if (customDays.length > 1) setCustomDays(prev => prev.filter(x => x !== d))
                          } else {
                            setCustomDays(prev => [...prev, d].sort((a,b) => a-b))
                          }
                        }}
                          className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${
                            isSelected ? 'bg-steel-600 text-white shadow-sm' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                          }`}>{d}일</button>
                      )
                    })}
                  </div>
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-gray-500 mb-1.5">롯데 기준 할인율</label>
                  <div className="flex items-center gap-2">
                    <input type="range" min={10} max={100} step={5} value={globalDiscount}
                      onChange={e => applyGlobalDiscount(Number(e.target.value))}
                      className="flex-1 h-1.5 accent-steel-600 rounded-full" />
                    <span className="text-sm font-black text-steel-600 w-12 text-right">{globalDiscount}%</span>
                  </div>
                  <span className="text-[10px] text-gray-400 mt-0.5 block">시장 30~50%</span>
                </div>
              </div>
            </div>
          </div>

          {/* ② 요율표 자동 산출 */}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm">
            <div className="px-6 py-4 border-b border-gray-100 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <span className="w-2 h-2 rounded-full bg-steel-500" />
                <h3 className="font-black text-gray-800 text-sm whitespace-nowrap">견적 요율표</h3>
                <span className="text-[10px] font-medium text-gray-400">(1대당 · 롯데 {globalDiscount}%)</span>
              </div>
              <div className="flex items-center gap-1.5">
                <button onClick={exportExcel}
                  className="flex items-center gap-1 py-1 px-2.5 bg-green-600 text-white rounded-lg text-[11px] font-bold hover:bg-green-700 transition-colors">
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                  엑셀
                </button>
                <button onClick={() => window.print()}
                  className="flex items-center gap-1 py-1 px-2.5 bg-steel-600 text-white rounded-lg text-[11px] font-bold hover:bg-steel-700 transition-colors">
                  인쇄
                </button>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse" style={{ tableLayout: 'fixed' }}>
                <colgroup>
                  <col style={{ width: '56px' }} />
                  <col />
                  <col style={{ width: '100px' }} />
                  <col style={{ width: '86px' }} />
                  {selectedDaysList.map(d => (
                    <col key={d} style={{ width: '88px' }} />
                  ))}
                </colgroup>
                <thead>
                  <tr className="bg-steel-900 text-white text-sm">
                    <th className="py-2.5 px-2 text-center font-bold whitespace-nowrap border-r border-steel-800">등급</th>
                    <th className="py-2.5 px-2 text-left font-bold border-r border-steel-800">차종</th>
                    <th className="py-2.5 px-2 text-center font-bold whitespace-nowrap border-r border-steel-800">배기량</th>
                    <th className="py-2.5 px-2 text-right font-bold whitespace-nowrap border-r border-steel-800">일단가</th>
                    {selectedDaysList.map((d, idx) => (
                      <th key={d} className={`py-2.5 px-2 text-right font-bold text-yellow-300 whitespace-nowrap ${idx < selectedDaysList.length - 1 ? 'border-r border-steel-800' : ''}`}>
                        {d}일<span className="text-xs font-medium text-white/50 ml-0.5">/월</span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {quoteLines.map((r, i) => {
                    const isRvStart = r.service_group === '8군' && (i === 0 || quoteLines[i - 1]?.service_group !== '8군')
                    const isEven = i % 2 === 0
                    return (
                      <React.Fragment key={r.id || `ql-${i}`}>
                        {isRvStart && (
                          <tr className="bg-amber-50/80 border-t-2 border-amber-200">
                            <td colSpan={colCount} className="px-3 py-1.5 text-sm font-bold text-amber-700">RV · SUV · 승합</td>
                          </tr>
                        )}
                        <tr className={`border-t border-gray-100 hover:bg-steel-50/40 ${isEven ? 'bg-white' : 'bg-gray-50/30'}`}>
                          <td className="py-2 px-1 text-center border-r border-gray-100">
                            <span className="bg-steel-100 text-steel-700 text-xs font-bold px-1 py-0.5 rounded whitespace-nowrap">{r.service_group}</span>
                          </td>
                          <td className="py-2 px-2 font-bold text-gray-800 truncate border-r border-gray-100" title={r.vehicle_class}>{r.vehicle_class}</td>
                          <td className="py-2 px-2 text-center text-gray-500 font-bold truncate border-r border-gray-100">{r.displacement_range}</td>
                          <td className="py-2 px-2 text-right font-bold text-steel-700 whitespace-nowrap tabular-nums border-r border-gray-100">{f(r.dailyRate)}</td>
                          {selectedDaysList.map((d, idx) => (
                            <td key={d} className={`py-2 px-2 text-right font-black text-steel-600 whitespace-nowrap tabular-nums ${idx < selectedDaysList.length - 1 ? 'border-r border-gray-100' : ''}`}>{f(r.byDays[d].monthly)}</td>
                          ))}
                        </tr>
                      </React.Fragment>
                    )
                  })}
                </tbody>
                <tfoot></tfoot>
              </table>
            </div>
            <div className="px-4 py-2 bg-gray-50/50 border-t border-gray-100 text-[10px] text-gray-400 flex justify-between">
              <span>※ 롯데렌터카 대비 {globalDiscount}% · 부가세 별도 · 1대당 월 기준</span>
              <span>{new Date().toLocaleDateString('ko-KR')} 기준</span>
            </div>
          </div>

          {/* ③ 고객 정보 + 견적 저장 */}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm">
            <div className="px-6 py-4 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-steel-500" />
                <h3 className="font-black text-gray-800 text-sm">고객 정보 및 저장</h3>
              </div>
            </div>
            <div className="p-6 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-gray-500 mb-1">업체명</label>
                  <input className="w-full border border-gray-200 px-2.5 py-1.5 rounded-lg font-bold text-xs focus:border-steel-500 outline-none"
                    placeholder="업체명" value={customerCompany}
                    onChange={e => setCustomerCompany(e.target.value)} />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-gray-500 mb-1">담당자</label>
                  <input className="w-full border border-gray-200 px-2.5 py-1.5 rounded-lg font-bold text-xs focus:border-steel-500 outline-none"
                    placeholder="담당자명" value={customerName} onChange={e => setCustomerName(e.target.value)} />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-gray-500 mb-1">연락처</label>
                  <input className="w-full border border-gray-200 px-2.5 py-1.5 rounded-lg font-bold text-xs focus:border-steel-500 outline-none"
                    placeholder="010-0000-0000" value={customerPhone} onChange={e => setCustomerPhone(e.target.value)} />
                </div>
              </div>
              <div>
                <label className="block text-[11px] font-bold text-gray-500 mb-1">메모</label>
                <input className="w-full border border-gray-200 px-2.5 py-1.5 rounded-lg text-xs focus:border-steel-500 outline-none"
                  placeholder="특약사항, 서비스 조건 등" value={contractMemo} onChange={e => setContractMemo(e.target.value)} />
              </div>
              {/* 버튼 */}
              <div className="flex items-center justify-end gap-2 pt-1">
                <button onClick={saveQuote} disabled={quoteSaving}
                  className="py-2.5 px-6 bg-steel-900 text-white rounded-xl text-sm font-black hover:bg-steel-800 shadow-sm transition-all disabled:opacity-50">
                  {quoteSaving ? '저장 중...' : '견적 저장'}
                </button>
                <button onClick={exportExcel}
                  className="py-2.5 px-6 bg-steel-600 text-white rounded-xl text-sm font-bold hover:bg-steel-700 shadow-sm transition-all">
                  엑셀 다운로드
                </button>
              </div>
            </div>
          </div>
        </div>
        )
      })()}

      {/* 견적 관리는 /quotes 통합 페이지에서 관리 */}
    </div>
  )
}
