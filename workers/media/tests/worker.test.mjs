import assert from 'node:assert/strict'
import { createHash, createHmac } from 'node:crypto'
import { test } from 'node:test'
import worker from '../src/index.ts'

const user = '7de5d7ba-34bc-4dfc-8acc-f22ec545cf0d'
const couple = '5acfbce2-f457-489a-bc22-f157a1216a57'
const asset = 'b70b737f-0aca-4de4-8ee2-ec3af665702f'
const bucket = 'memory-photos'
const path = `r2/${couple}/${asset}/original.jpg`
const objectKey = `${couple}/${asset}`
const now = Date.UTC(2026, 10, 9, 12, 0, 0)
const origin = 'https://couple.example'

function createFixture(t, overrides = {}) {
  t.mock.method(Date, 'now', () => now)
  const calls = []
  const deleted = []
  const state = {
    object_key: objectKey,
    status: 'pending',
    byte_size: 1024,
    content_type: 'image/jpeg',
    upload_until: new Date(now + 120_000).toISOString(),
    bucket,
    path,
    ...overrides.state,
  }
  const env = {
    SUPABASE_URL: 'https://supabase.example',
    SUPABASE_PUBLIC_KEY: 'test-public',
    SUPABASE_SERVICE_KEY: 'sb_secret_test-private',
    R2_ACCOUNT_ID: '0123456789abcdef0123456789abcdef',
    R2_BUCKET_NAME: 'private-couple',
    R2_ACCESS_KEY_ID: 'test-s3-access',
    R2_SECRET_ACCESS_KEY: 'test-s3-secret',
    ALLOWED_ORIGINS: `${origin},capacitor://localhost`,
    MEDIA_BUCKET: {
      async head() { return { size: 1024, httpMetadata: { contentType: 'image/jpeg' } } },
      async delete(key) { deleted.push(key) },
      ...overrides.storage,
    },
  }
  t.mock.method(globalThis, 'fetch', async (input, init) => {
    const url = new URL(input)
    const headers = new Headers(init?.headers)
    if (url.pathname === '/auth/v1/user') {
      calls.push({ action: 'auth', headers })
      assert.equal(headers.get('apikey'), env.SUPABASE_PUBLIC_KEY)
      if (headers.get('authorization') !== 'Bearer valid-session') {
        return Response.json({}, { status: 401 })
      }
      return Response.json({ id: user })
    }
    assert.equal(url.pathname, '/rest/v1/rpc/media_broker')
    const args = JSON.parse(init.body)
    calls.push({ action: args.p_action, args, headers })
    assert.equal(headers.get('apikey'), env.SUPABASE_SERVICE_KEY)
    const overridden = overrides.rpc?.(args)
    if (overridden) return overridden
    if (args.p_action === 'health' || args.p_action === 'purged') return Response.json({})
    return Response.json(state)
  })
  return { env, calls, deleted }
}

function send(env, payload, { token = 'valid-session', requestOrigin = origin } = {}) {
  return worker.fetch(new Request('https://worker.example/media', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(requestOrigin ? { origin: requestOrigin } : {}),
    },
    body: JSON.stringify(payload),
  }), env)
}

test('returns a constrained direct PUT signature with an expiry bounded by the SQL lease', async t => {
  const { env, calls } = createFixture(t)
  const response = await send(env, { action: 'reserve', bucket, path, size: 1024, contentType: 'image/jpeg' })
  assert.equal(response.status, 200)
  assert.equal(response.headers.get('access-control-allow-origin'), origin)
  assert.match(response.headers.get('cache-control'), /no-store/)
  const { uploadUrl, headers } = await response.json()
  const url = new URL(uploadUrl)
  assert.equal(url.host, `${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`)
  assert.equal(url.pathname, `/${env.R2_BUCKET_NAME}/${objectKey}`)
  assert.equal(url.searchParams.get('X-Amz-Expires'), '120')
  assert.equal(url.searchParams.get('X-Amz-Date'), '20261109T120000Z')
  assert.equal(url.searchParams.get('X-Amz-SignedHeaders'), 'cache-control;content-length;content-type;host;if-none-match')
  assert.deepEqual(headers, { 'cache-control': 'private, no-store', 'content-type': 'image/jpeg', 'if-none-match': '*' })

  // Compute the expected signature independently with Node HMAC.
  const query = [...url.searchParams].filter(([name]) => name !== 'X-Amz-Signature')
    .map(pair => pair.map(encodeURIComponent).join('=')).sort().join('&')
  const signedHeaders = url.searchParams.get('X-Amz-SignedHeaders')
  const canonicalHeaders = `cache-control:${headers['cache-control']}\ncontent-length:1024\ncontent-type:image/jpeg\nhost:${url.host}\nif-none-match:*\n`
  const canonical = ['PUT', url.pathname, query, canonicalHeaders, signedHeaders, 'UNSIGNED-PAYLOAD'].join('\n')
  const scope = '20261109/auto/s3/aws4_request'
  const stringToSign = ['AWS4-HMAC-SHA256', '20261109T120000Z', scope, createHash('sha256').update(canonical).digest('hex')].join('\n')
  const hmac = (key, value) => createHmac('sha256', key).update(value).digest()
  const key = ['20261109', 'auto', 's3', 'aws4_request'].reduce(hmac, `AWS4${env.R2_SECRET_ACCESS_KEY}`)
  assert.equal(url.searchParams.get('X-Amz-Signature'), createHmac('sha256', key).update(stringToSign).digest('hex'))
  assert.deepEqual(calls[1].args, {
    p_action: 'reserve', p_actor: user, p_bucket: bucket, p_path: path, p_size: 1024, p_content_type: 'image/jpeg',
  })
})

test('does not issue another PUT for a ready reservation and rejects an expired upload lease', async t => {
  const { env } = createFixture(t, { state: { status: 'ready' } })
  const payload = { action: 'reserve', bucket, path, size: 1024, contentType: 'image/jpeg' }
  assert.deepEqual(await (await send(env, payload)).json(), { ready: true })
  globalThis.fetch.mock.restore()
  Date.now.mock.restore()
  const expired = createFixture(t, { state: { upload_until: new Date(now - 1).toISOString() } })
  assert.equal((await send(expired.env, payload)).status, 409)
})

test('authorizes origin and identity before invoking the privileged broker', async t => {
  const { env, calls } = createFixture(t)
  const payload = { action: 'read', bucket, path }
  const blocked = await send(env, payload, { requestOrigin: 'https://foreign.example' })
  assert.equal(blocked.status, 403)
  assert.equal(blocked.headers.get('access-control-allow-origin'), null)
  assert.equal((await send(env, payload, { token: null })).status, 401)
  assert.equal((await send(env, payload, { token: 'invalid-session' })).status, 401)
  assert.deepEqual(calls.map(call => call.action), ['auth'])
})

test('grants CORS preflight only to a listed origin', async t => {
  const { env, calls } = createFixture(t)
  const response = await worker.fetch(new Request('https://worker.example/media', {
    method: 'OPTIONS',
    headers: { origin: 'capacitor://localhost', 'access-control-request-method': 'POST' },
  }), env)
  assert.equal(response.status, 204)
  assert.equal(response.headers.get('access-control-allow-origin'), 'capacitor://localhost')
  assert.match(response.headers.get('access-control-allow-headers'), /authorization/i)
  assert.equal(calls.length, 0)
})

test('rejects oversized streamed JSON and invalid object input without a broker call', async t => {
  const { env, calls } = createFixture(t)
  const big = await send(env, { action: 'read', path: 'a'.repeat(6000), bucket })
  assert.equal(big.status, 413)
  assert.equal((await send(env, { action: 'read', bucket, path: 'r2/../private' })).status, 400)
  assert.equal((await send(env, { action: 'read', bucket, path, actor: user })).status, 400)
  assert.equal((await send(env, { action: 'reserve', bucket, path, size: -1, contentType: 'image/jpeg' })).status, 400)
  assert.equal(calls.length, 0)
})

test('honors cross-account rejection without returning broker details or signing URLs', async t => {
  const { env, calls } = createFixture(t, {
    rpc: () => Response.json({ code: '42501', message: 'internal object location' }, { status: 403 }),
  })
  for (const action of ['reserve', 'read', 'delete', 'commit']) {
    const response = await send(env, { action, bucket, path, ...(action === 'reserve' && { size: 1024, contentType: 'image/jpeg' }) })
    assert.equal(response.status, 403)
    const body = await response.json()
    assert.deepEqual(Object.keys(body), ['error'])
    assert.doesNotMatch(body.error, /internal object/)
  }
  assert.equal(calls.find(call => call.action === 'read').args.p_actor, user)
})

test('checks the R2 binding only after authorizing the health request', async t => {
  const heads = []
  const { env, calls } = createFixture(t, { storage: { async head(key) { heads.push(key); return null } } })
  const result = await send(env, { action: 'health' })
  assert.equal(result.status, 200)
  assert.deepEqual(await result.json(), {})
  assert.deepEqual(calls.map(call => call.action), ['auth', 'health'])
  assert.deepEqual(heads, ['system/media-health'])
})

test('signs a short GET only for a ready object and leaves Range unsigned', async t => {
  const { env, calls } = createFixture(t, { state: { status: 'ready' } })
  const response = await send(env, { action: 'read', bucket, path })
  assert.equal(response.status, 200)
  const { url, expiresAt } = await response.json()
  const parsed = new URL(url)
  assert.equal(parsed.pathname, `/${env.R2_BUCKET_NAME}/${objectKey}`)
  assert.equal(parsed.searchParams.get('X-Amz-SignedHeaders'), 'host')
  assert.equal(parsed.searchParams.get('X-Amz-Expires'), '300')
  assert.equal(expiresAt, now + 300_000)
  assert.equal(calls[1].action, 'read')
})

test('checks exact metadata with R2 HEAD before committing and uses measured values', async t => {
  const { env, calls } = createFixture(t, {
    rpc: args => args.p_action === 'commit' ? Response.json({ status: 'ready' }) : undefined,
  })
  const result = await send(env, { action: 'commit', bucket, path })
  assert.equal(result.status, 200)
  assert.deepEqual(calls.map(call => call.action), ['auth', 'lookup', 'commit'])
  assert.equal(calls[2].args.p_size, 1024)
  assert.equal(calls[2].args.p_content_type, 'image/jpeg')

  for (const wrong of [null, { size: 1023, httpMetadata: { contentType: 'image/jpeg' } }, { size: 1024, httpMetadata: { contentType: 'image/png' } }]) {
    env.MEDIA_BUCKET.head = async () => wrong
    const response = await send(env, { action: 'commit', bucket, path })
    assert.equal(response.status, 409)
  }
  assert.equal(calls.filter(call => call.action === 'commit').length, 1)
})

test('tombstones on delete and physically purges only rows returned by the sweep', async t => {
  const { env, calls, deleted } = createFixture(t, {
    rpc: args => args.p_action === 'sweep'
      ? Response.json([{ object_key: objectKey, bucket, path, status: 'deleted', upload_until: new Date(now - 1000).toISOString() }])
      : undefined,
  })
  assert.equal((await send(env, { action: 'delete', bucket, path })).status, 200)
  assert.deepEqual(deleted, [])
  await worker.scheduled({}, env)
  assert.deepEqual(deleted, [objectKey])
  assert.deepEqual(calls.map(call => call.action), ['auth', 'delete', 'sweep', 'purged'])
  assert.deepEqual(calls.at(-1).args, { p_action: 'purged', p_bucket: bucket, p_path: path })
})
