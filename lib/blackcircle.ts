// ═══════════════════════════════════════════════════════════════
// lib/blackcircle.ts — 블랙서클(blackcircles.co.kr) 연동 (2026-08-07)
// 더범 타이어 매입처 — 서버 자동 로그인 + 전 품목 시세·재고·도착예정 수집
//   자격증명: tire_settings(bc_id / bc_pw) — bc_pw 는 AES-256-GCM 암호화
//   수집: POST /ajax_call/shop/list_more.php (페이지당 5개 HTML 조각)
// ═══════════════════════════════════════════════════════════════

import { prisma } from './prisma'
import { randomUUID, createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto'

const BASE = 'https://blackcircles.co.kr'
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36'

// ── 자격증명 암호화 (키: CRON_SECRET 파생 — dev/prod 공통, DB 공유 환경 대응) ──
//   ※ JWT_SECRET 은 환경별로 달라 복호화 불가 사고 있었음 (2026-08-07)
function encKey(): Buffer {
  const material = process.env.CRON_SECRET || process.env.JWT_SECRET || 'fmi-fallback'
  return scryptSync(material, 'thebum-bc-cred-v1', 32)
}
export function encrypt(plain: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', encKey(), iv)
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  return `enc1:${iv.toString('base64')}:${cipher.getAuthTag().toString('base64')}:${data.toString('base64')}`
}
export function decrypt(stored: string): string {
  const [tag0, iv, authTag, data] = stored.split(':')
  if (tag0 !== 'enc1') throw new Error('unsupported cipher format')
  const decipher = createDecipheriv('aes-256-gcm', encKey(), Buffer.from(iv, 'base64'))
  decipher.setAuthTag(Buffer.from(authTag, 'base64'))
  return Buffer.concat([decipher.update(Buffer.from(data, 'base64')), decipher.final()]).toString('utf8')
}

export async function getSetting(key: string): Promise<string | null> {
  const r = await prisma.$queryRawUnsafe<Array<{ setting_value: string | null }>>(
    `SELECT setting_value FROM tire_settings WHERE setting_key = ?`, key)
  return r[0]?.setting_value ?? null
}
export async function setSetting(key: string, value: string | null) {
  await prisma.$executeRawUnsafe(
    `INSERT INTO tire_settings (setting_key, setting_value) VALUES (?, ?)
     ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)`, key, value)
}

// ── 로그인 → 세션 쿠키 ──
export async function bcLogin(): Promise<string> {
  const id = await getSetting('bc_id')
  const pwEnc = await getSetting('bc_pw')
  if (!id || !pwEnc) throw new Error('블랙서클 아이디/비밀번호가 설정되지 않았습니다')
  const pw = decrypt(pwEnc)

  // 초기 쿠키 수집
  const pre = await fetch(`${BASE}/bbs/login.php`, { headers: { 'User-Agent': UA }, redirect: 'manual' })
  const jar = new Map<string, string>()
  const eat = (res: Response) => {
    for (const c of res.headers.getSetCookie?.() || []) {
      const [kv] = c.split(';')
      const [k, v] = kv.split('=')
      if (k && v !== undefined) jar.set(k.trim(), v.trim())
    }
  }
  eat(pre)
  const cookieStr = () => [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ')

  const res = await fetch(`${BASE}/bbs/login_check.php`, {
    method: 'POST',
    headers: {
      'User-Agent': UA,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Cookie': cookieStr(),
      'Referer': `${BASE}/bbs/login.php`,
    },
    body: new URLSearchParams({ url: `${BASE}/`, mb_id: id, mb_password: pw }).toString(),
    redirect: 'manual',
  })
  eat(res)

  // 로그인 검증 — 마이페이지류 접근 시 로그인 요구 여부
  const check = await fetch(`${BASE}/shop/list.php?srch_type=tire`, {
    headers: { 'User-Agent': UA, 'Cookie': cookieStr() },
  })
  const html = await check.text()
  if (html.includes('로그인을 해주세요') && !html.includes('logout')) {
    // 그누보드는 로그인 성공 시에도 특정 문구가 있을 수 있어 회원 혜택가 존재로 최종 판정
  }
  return cookieStr()
}

export interface BcItem {
  brand: string; model: string; spec: string
  factory: number; member: number | null
  stock: string | null; delivery: string | null
  ioNo: string | null; itId: string | null; caId: string | null   // 발주용 식별자
}

// ── HTML 조각 파싱 (서버 — DOM 없이 정규식) ──
export function parseListHtml(html: string): BcItem[] {
  const out: BcItem[] = []
  const sections = html.split('<section class="product_list_wrap').slice(1)
  for (const sec of sections) {
    const brand = (sec.match(/style="background-color:[^"]*"\s*>([^<]+)<\/div>/) || [])[1]?.trim() || ''
    const title = (sec.match(/<div class="title font-size-20">\s*([^<&\n]+?)\s*(?:&nbsp;|<)/) || [])[1]?.trim() || ''
    const specLine = (sec.match(/<div class="english_title_box[^>]*">\s*<span>([^<]+)<\/span>/) || [])[1]?.trim() || ''
    const spec = specLine.split(' ')[0] || ''
    const factory = Number((sec.match(/data-price="(\d+)"/) || [])[1] || 0)
    const memberRaw = (sec.match(/회원 혜택가[\s\S]{0,400}?<b class="font-size-27 bold">([\d,]+)/) || [])[1]
    const member = memberRaw ? Number(memberRaw.replace(/,/g, '')) : null
    const stock = (sec.match(/총재고<\/span>[\s\S]{0,200}?<b class="red">([^<]+)<\/b>/) || [])[1]?.trim() || null
    const deliveryRaw = (sec.match(/<span class="font-size-17 color-1c6ee8[^>]*">([\s\S]*?)<\/span>\s*<\/b>/) || [])[1]
      || (sec.match(/(내일[^<]{0,20}도착|오늘[^<]{0,20}도착)/) || [])[1]
    const delivery = deliveryRaw ? deliveryRaw.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim() : null
    // 발주용 식별자 (장바구니 담기 파라미터)
    const ioNo = (sec.match(/data-io-no="(\d+)"/) || [])[1] || null
    const itId = (sec.match(/data-it_id="(\d+)"/) || [])[1] || null
    const caId = (sec.match(/data-ca_id="([^"]+)"/) || [])[1] || null
    if (brand && spec) out.push({ brand, model: title, spec, factory, member, stock, delivery, ioNo, itId, caId })
  }
  return out
}

// ── 전 품목 수집 (동시 5요청) → 카탈로그 갱신 ──
export async function bcSyncCatalog(opts?: { maxPages?: number }): Promise<{ pages: number; items: number; updated: number; inserted: number }> {
  const cookie = await bcLogin()
  const maxPages = opts?.maxPages ?? 2000
  const seen = new Map<string, BcItem>()
  let page = 0
  let staleStreak = 0
  let loggedIn = false

  const fetchPage = async (no: number): Promise<BcItem[]> => {
    const res = await fetch(`${BASE}/ajax_call/shop/list_more.php`, {
      method: 'POST',
      headers: {
        'User-Agent': UA, 'Cookie': cookie,
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'X-Requested-With': 'XMLHttpRequest',
        'Referer': `${BASE}/shop/list.php?srch_type=tire`,
      },
      body: `no=${no}&srch_type=tire&stx=&order_by=1&ca_id=&check_type=false&srch_it_name=&srch_delivery=&srch_check_stock=false`,
    })
    return parseListHtml(await res.text())
  }

  while (page < maxPages && staleStreak < 5) {
    const batch = [1, 2, 3, 4, 5].map(i => page + i)
    page += 5
    const results = await Promise.all(batch.map(no => fetchPage(no).catch(() => [] as BcItem[])))
    let freshInBatch = 0
    let emptyAll = true
    for (const items of results) {
      if (items.length > 0) emptyAll = false
      for (const it of items) {
        if (it.member != null) loggedIn = true
        const k = `${it.brand}|${it.model}|${it.spec}`
        const prev = seen.get(k)
        const price = it.member ?? it.factory
        const prevPrice = prev ? (prev.member ?? prev.factory) : Infinity
        if (!prev) { seen.set(k, it); freshInBatch++ }
        else if (price > 0 && price < prevPrice) seen.set(k, it)
      }
    }
    if (emptyAll) break
    staleStreak = freshInBatch === 0 ? staleStreak + 1 : 0
  }

  if (!loggedIn && seen.size > 0) {
    throw new Error('로그인이 안 된 상태로 보입니다 (회원 혜택가 미노출) — 아이디/비밀번호를 확인해주세요')
  }
  if (seen.size === 0) throw new Error('수집 결과가 비어 있습니다 — 사이트 구조 변경 또는 접속 차단 가능성')

  // ── 카탈로그 반영 ──
  let updated = 0, inserted = 0
  let values: string[] = []
  let args: unknown[] = []
  const flush = async () => {
    if (!values.length) return
    const r = await prisma.$executeRawUnsafe(`
      INSERT INTO tire_catalog (id, brand, model, spec, purchase_price, consumer_price, stock_note, delivery_note, io_no, it_id, ca_id, scraped_at)
      VALUES ${values.join(',')}
      ON DUPLICATE KEY UPDATE
        purchase_price = VALUES(purchase_price),
        consumer_price = VALUES(consumer_price),
        stock_note = VALUES(stock_note),
        delivery_note = VALUES(delivery_note),
        io_no = VALUES(io_no), it_id = VALUES(it_id), ca_id = VALUES(ca_id),
        scraped_at = VALUES(scraped_at)`, ...args)
    values = []; args = []
    return r
  }
  for (const it of seen.values()) {
    const price = it.member ?? it.factory
    values.push('(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())')
    args.push(randomUUID(), it.brand.slice(0, 30), it.model.slice(0, 100), it.spec.slice(0, 30),
      price > 0 ? price : null, it.factory > 0 ? it.factory : null,
      it.stock?.slice(0, 50) || null, it.delivery?.slice(0, 80) || null,
      it.ioNo, it.itId, it.caId)
    if (values.length >= 400) await flush()
  }
  await flush()

  const cnt = await prisma.$queryRawUnsafe<any[]>(
    `SELECT SUM(scraped_at >= DATE_SUB(NOW(), INTERVAL 10 MINUTE)) u, COUNT(*) t FROM tire_catalog`)
  updated = Number(cnt[0]?.u) || 0
  inserted = seen.size

  await setSetting('bc_last_sync', new Date().toISOString())
  await setSetting('bc_last_result', `${seen.size} 품목 / ${page} 페이지`)
  return { pages: page, items: seen.size, updated, inserted }
}

// ═══════════════════════════════════════════════════════════════
// 발주 — 배송옵션 조회 + 장바구니 담기
//   결제(최종 주문 확정)는 블랙서클 화면에서 사람이 누름 (오발주 방지)
// ═══════════════════════════════════════════════════════════════

export const DELIVERY_LABEL: Record<string, string> = {
  '1': '모닝배송', '2': '택배', '3': '퀵', '4': '방문수령',
}

export interface BcQuote {
  ioNo: string
  options: Array<{ code: string; label: string; price: number; stock: number; deliveryFee: number }>
}

const V = (html: string, name: string) => {
  const m = html.match(new RegExp(`name="${name}"[^>]*value="([^"]*)"`))
    || html.match(new RegExp(`value="([^"]*)"[^>]*name="${name}"`))
  return m ? m[1] : ''
}

/** 품목 현재 시세·재고·배송옵션 조회 (읽기 전용) */
export async function bcQuote(cookie: string, ioNo: string, itId: string, caId: string): Promise<BcQuote> {
  const res = await fetch(`${BASE}/ajax_call/shop/list_order_ajax.php`, {
    method: 'POST',
    headers: {
      'User-Agent': UA, 'Cookie': cookie,
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'X-Requested-With': 'XMLHttpRequest',
      'Referer': `${BASE}/shop/list.php?srch_type=tire`,
    },
    body: new URLSearchParams({ io_no: ioNo, it_id: itId, ca_id: caId, srch_delivery: '' }).toString(),
  })
  const html = await res.text()
  const n = (s: string) => Number(String(s).replace(/[^0-9]/g, '')) || 0

  const options: BcQuote['options'] = []
  const push = (code: string, price: string, stock: string, fee: number) => {
    const p = n(price), s = n(stock)
    if (p > 0) options.push({ code, label: DELIVERY_LABEL[code] || code, price: p, stock: s, deliveryFee: fee })
  }
  push('1', V(html, 'morning_price'), V(html, 'morning_stock'), 0)
  push('2', V(html, 'io_price'), V(html, 'delivery_stock'), n(V(html, 'delivery_price1')))
  push('3', V(html, 'quick_price'), V(html, 'quick_stock'), n(V(html, 'quick_delivery_price')))
  push('4', V(html, 'visit_price'), V(html, 'visit_stock'), 0)

  return { ioNo, options }
}

/** 장바구니 담기 — 결제 전 단계 */
export async function bcAddToCart(cookie: string, p: {
  ioNo: string; itId: string; caId: string; qty: number; deliverySelect: string; saleDelivery?: string
}): Promise<{ ok: boolean; code: string; message: string }> {
  const res = await fetch(`${BASE}/ajax_call/shop/cart_add_ajax.php`, {
    method: 'POST',
    headers: {
      'User-Agent': UA, 'Cookie': cookie,
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'X-Requested-With': 'XMLHttpRequest',
      'Referer': `${BASE}/shop/list.php?srch_type=tire`,
    },
    body: new URLSearchParams({
      io_no: p.ioNo, it_id: p.itId, ca_id: p.caId,
      ct_qty: String(p.qty), delivery_select: p.deliverySelect,
      sale_delivery: p.saleDelivery || '',
    }).toString(),
  })
  const text = await res.text()
  let json: any = {}
  try { json = JSON.parse(text) } catch { /* HTML 응답 = 세션 만료 등 */ }
  const code = json.result_code || ''
  return {
    ok: code === '0000',
    code,
    message: json.result_message || json.message || (code ? '' : '응답을 해석할 수 없습니다 (로그인 세션 확인 필요)'),
  }
}

// ═══════════════════════════════════════════════════════════════
// 주문내역 조회 · 주문취소
//   목록: /shop/orderinquiry.php?od_status=&fr_date=&to_date=
//   취소: /shop/order_change_status.php?ct_id={ct_id}&act=cancel
// ═══════════════════════════════════════════════════════════════

export interface BcOrder {
  date: string; odId: string; ctId: string | null
  status: string | null; spec: string | null; qty: number; total: number | null
  itemName: string | null
  text: string            // 상품 설명 원문 (카탈로그 매칭용)
}

/** 블랙서클 상태 → ERP 이행상태 */
export const BC_STATUS_TO_FULFILL: Record<string, string> = {
  '입금대기': 'ordered', '결제완료': 'ordered', '상품준비중': 'ordered',
  '배송중': 'shipping', '배송완료': 'done', '구매확정': 'done',
}

export function parseOrdersHtml(html: string): BcOrder[] {
  const flat = html.replace(/\s+/g, ' ')
  const parts = flat.split(/(?=\d{4}-\d{2}-\d{2} \/ \d{14,})/)
  const out: BcOrder[] = []
  for (const p of parts.slice(1)) {
    const head = p.match(/^(\d{4}-\d{2}-\d{2}) \/ (\d{14,})/)
    if (!head) continue
    const n = (s?: string | null) => (s ? Number(s.replace(/[^0-9]/g, '')) : 0)
    const plain = p.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim()
    out.push({
      date: head[1],
      odId: head[2],
      text: plain.slice(head[0].length).replace(/^[\s|]*/, '').slice(0, 160),
      ctId: (p.match(/order_change_status\.php\?ct_id=(\d+)/) || [])[1] || null,
      status: (p.match(/>\s*(입금대기|결제완료|상품준비중|배송중|배송완료|구매확정|취소완료|반품요청|반품완료)\s*</) || [])[1] || null,
      spec: (p.match(/(\d{3}\/\d{2}R\d{2})/) || [])[1] || null,
      qty: n((p.match(/([\d,]+)\s*개/) || [])[1]) || 1,
      total: n((p.match(/최종[\s\S]{0,60}?결제금액[\s\S]{0,300}?([\d,]{4,})/) || [])[1]) || null,
      itemName: (p.match(/<div class="[^"]*title[^"]*"[^>]*>\s*([^<]{2,60}?)\s*</) || [])[1]?.trim() || null,
    })
  }
  return out
}

export async function bcFetchOrders(cookie: string, from: string, to: string): Promise<BcOrder[]> {
  // 목록은 AJAX(orderinquiry_more.php)로 페이지 단위 로드 — 껍데기 HTML 에는 주문이 없음
  const out: BcOrder[] = []
  const seen = new Set<string>()
  for (let pg = 1; pg <= 10; pg++) {
    const res = await fetch(`${BASE}/ajax_call/shop/orderinquiry_more.php`, {
      method: 'POST',
      headers: {
        'User-Agent': UA, 'Cookie': cookie,
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'X-Requested-With': 'XMLHttpRequest',
        'Referer': `${BASE}/shop/orderinquiry.php`,
      },
      body: new URLSearchParams({ pg: String(pg), od_status: '', fr_date: from, to_date: to }).toString(),
    })
    const items = parseOrdersHtml(await res.text())
    let fresh = 0
    for (const it of items) if (!seen.has(it.odId)) { seen.add(it.odId); out.push(it); fresh++ }
    if (fresh === 0) break
  }
  return out
}

/** 주문 취소 — 블랙서클에서 취소 가능한 상태(결제완료/상품준비중)일 때만 ct_id 가 존재 */
export async function bcCancelOrder(cookie: string, ctId: string): Promise<{ ok: boolean; message: string }> {
  const res = await fetch(`${BASE}/shop/order_change_status.php?ct_id=${encodeURIComponent(ctId)}&act=cancel`, {
    headers: { 'User-Agent': UA, 'Cookie': cookie, 'Referer': `${BASE}/shop/orderinquiry.php` },
    redirect: 'follow',
  })
  const text = await res.text()
  const ok = res.ok && !/오류|실패|불가/.test(text.slice(0, 3000))
  const msg = (text.match(/alert\('([^']{2,80})'/) || [])[1] || (ok ? '취소 요청 완료' : '취소에 실패했습니다')
  return { ok, message: msg }
}

export { bcLogin as bcSession }

