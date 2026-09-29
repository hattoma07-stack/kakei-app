/**
 * ───────────────────────────────────────────────────────────
 * 家計簿アプリ 認証プロキシ（Cloudflare Worker）＝自社バックエンド
 *
 * 【役割】
 *  ・ブラウザは「合言葉(GASの秘密)」を一切持たない。ここ(Worker)だけが持つ。
 *  ・ブラウザは /login でパスワードを送り、短命セッションを受け取る。
 *  ・以降は /pull・/flush にセッションを付けて呼ぶ。Workerが合言葉を付けてGASへ中継する。
 *  ・秘密はすべて Cloudflare の「シークレット(環境変数)」に置く。コードには書かない。
 *
 * 【必要なシークレット（Cloudflareダッシュボードで登録）】
 *   APP_PASSWORD   … アプリのログインパスワード（ブラウザで入力する側）
 *   SESSION_SECRET … セッション署名用のランダムな長い文字列（推測不可能なもの）
 *   GAS_URL        … Apps Script のウェブアプリURL（.../exec）
 *   GAS_TOKEN      … GAS側スクリプトプロパティ TOKEN と同じ合言葉
 *   （任意）ALLOW_ORIGIN … 許可する公開元。既定は「*」。厳しくするなら
 *                          https://hattoma07-stack.github.io を設定
 *
 * ※ APP_PASSWORD と GAS_TOKEN は別物にできる（今回は「同じ値」にする方針）。
 * ───────────────────────────────────────────────────────────
 */

export default {
  async fetch(request, env) {
    const cors = {
      'Access-Control-Allow-Origin': env.ALLOW_ORIGIN || '*',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400',
    }
    if (request.method === 'OPTIONS') return new Response(null, { headers: cors })

    const url = new URL(request.url)
    const path = url.pathname.replace(/\/+$/, '')
    try {
      if (request.method === 'POST' && path.endsWith('/login')) return await handleLogin(request, env, cors)
      if (request.method === 'GET' && path.endsWith('/pull')) return await handlePull(request, env, cors)
      if (request.method === 'POST' && path.endsWith('/flush')) return await handleFlush(request, env, cors)
      // 稼働確認
      return json({ ok: true, message: 'kakei worker running' }, 200, cors)
    } catch (e) {
      return json({ error: String(e) }, 500, cors)
    }
  },
}

// ── レスポンス ──
function json(obj, status, cors) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: { 'Content-Type': 'application/json', ...cors },
  })
}

// ── HMAC / base64url ──
function b64url(buf) {
  const bytes = new Uint8Array(buf)
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
async function hmac(secret, message) {
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message))
  return b64url(sig)
}

// ── セッション（合言葉ではない・短命・失効可能） ──
async function makeSession(env) {
  const payloadObj = { exp: Date.now() + 30 * 24 * 60 * 60 * 1000 } // 30日
  const payload = b64url(new TextEncoder().encode(JSON.stringify(payloadObj)))
  const sig = await hmac(env.SESSION_SECRET, payload)
  return payload + '.' + sig
}
async function verifySession(env, token) {
  if (!token || !env.SESSION_SECRET) return false
  const i = token.lastIndexOf('.')
  if (i < 0) return false
  const payload = token.slice(0, i)
  const sig = token.slice(i + 1)
  const expected = await hmac(env.SESSION_SECRET, payload)
  if (expected !== sig) return false
  try {
    const jsonStr = new TextDecoder().decode(
      Uint8Array.from(atob(payload.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0)),
    )
    const obj = JSON.parse(jsonStr)
    return !!obj.exp && Date.now() < obj.exp
  } catch (e) {
    return false
  }
}
function bearer(request) {
  const h = request.headers.get('Authorization') || ''
  return h.indexOf('Bearer ') === 0 ? h.slice(7) : ''
}

// ── GAS 中継（合言葉はここでだけ使う） ──
async function gasPull(env) {
  const ts = String(Date.now())
  const sig = await hmac(env.GAS_TOKEN, 'pull:' + ts)
  const u = env.GAS_URL + '?action=pull&ts=' + ts + '&sig=' + encodeURIComponent(sig)
  const res = await fetch(u, { method: 'GET', redirect: 'follow' })
  return await res.json()
}
async function gasFlush(env, ops) {
  const ts = String(Date.now())
  const sig = await hmac(env.GAS_TOKEN, 'flush:' + ts)
  const res = await fetch(env.GAS_URL, {
    method: 'POST',
    redirect: 'follow',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ ts, sig, ops }),
  })
  return await res.json().catch(() => ({ ok: true }))
}

// ── ハンドラ ──
async function handleLogin(request, env, cors) {
  const body = await request.json().catch(() => ({}))
  if (!env.APP_PASSWORD || body.password !== env.APP_PASSWORD) {
    return json({ error: 'パスワードが違います' }, 401, cors)
  }
  const session = await makeSession(env)
  return json({ session }, 200, cors)
}
async function handlePull(request, env, cors) {
  if (!(await verifySession(env, bearer(request)))) return json({ error: 'unauthorized' }, 401, cors)
  const data = await gasPull(env)
  return json(data, 200, cors)
}
async function handleFlush(request, env, cors) {
  if (!(await verifySession(env, bearer(request)))) return json({ error: 'unauthorized' }, 401, cors)
  const body = await request.json().catch(() => ({}))
  const result = await gasFlush(env, body.ops || [])
  return json(result, 200, cors)
}
