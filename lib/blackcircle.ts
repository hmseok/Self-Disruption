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
    if (brand && spec) out.push({ brand, model: title, spec, factory, member, stock, delivery })
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
      INSERT INTO tire_catalog (id, brand, model, spec, purchase_price, consumer_price, stock_note, delivery_note, scraped_at)
      VALUES ${values.join(',')}
      ON DUPLICATE KEY UPDATE
        purchase_price = VALUES(purchase_price),
        consumer_price = VALUES(consumer_price),
        stock_note = VALUES(stock_note),
        delivery_note = VALUES(delivery_note),
        scraped_at = VALUES(scraped_at)`, ...args)
    values = []; args = []
    return r
  }
  for (const it of seen.values()) {
    const price = it.member ?? it.factory
    values.push('(?, ?, ?, ?, ?, ?, ?, ?, NOW())')
    args.push(randomUUID(), it.brand.slice(0, 30), it.model.slice(0, 100), it.spec.slice(0, 30),
      price > 0 ? price : null, it.factory > 0 ? it.factory : null,
      it.stock?.slice(0, 50) || null, it.delivery?.slice(0, 80) || null)
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
