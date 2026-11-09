import { AwsClient } from 'aws4fetch'

type MediaEnv = Env & {
  SUPABASE_SERVICE_KEY: string
  R2_ACCESS_KEY_ID: string
  R2_SECRET_ACCESS_KEY: string
}

type Reference = { bucket: string; path: string }
type Upload = { size: number; contentType: string }
type MediaRequest =
  | { action: 'health' }
  | ({ action: 'reserve' } & Reference & Upload)
  | ({ action: 'commit' | 'read' | 'delete' } & Reference)
type ObjectRow = {
  object_key: string
  status: 'pending' | 'ready'
  byte_size: number
  content_type: string
  upload_until: string
}
type BrokerAction = MediaRequest['action'] | 'lookup' | 'sweep' | 'purged'

const buckets = new Set(['album-media', 'memory-photos', 'message-media', 'avatars'])
const uuidPattern = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i
const keyPattern = /^(?:[a-z0-9_-]+\/)+[a-z0-9_-]+(?:\.[a-z0-9_-]+)?$/i
const contentTypePattern = /^(?:image|audio|video)\/[a-z0-9][a-z0-9.+-]{0,49}$/
const maxJsonBytes = 4096
const maxUploadBytes = 1024 ** 3
const readTtl = 300
const uploadTtl = 900
const purgeBatchSize = 20

class MediaError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isReference(value: Record<string, unknown>): value is Record<string, unknown> & Reference {
  return typeof value.bucket === 'string' && buckets.has(value.bucket) &&
    typeof value.path === 'string' && value.path.length <= 256 &&
    value.path.startsWith('r2/') && keyPattern.test(value.path)
}

function isObjectKey(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 256 && keyPattern.test(value)
}

function objectRow(value: unknown, reference: Reference): ObjectRow {
  if (!isRecord(value) || !isObjectKey(value.object_key) ||
    value.bucket !== reference.bucket || value.path !== reference.path ||
    (value.status !== 'pending' && value.status !== 'ready') ||
    typeof value.byte_size !== 'number' || !Number.isSafeInteger(value.byte_size) ||
    value.byte_size < 1 || value.byte_size > maxUploadBytes ||
    typeof value.content_type !== 'string' || !contentTypePattern.test(value.content_type) ||
    typeof value.upload_until !== 'string') {
    throw new MediaError(502, 'Media authorization returned invalid metadata.')
  }
  return {
    object_key: value.object_key, status: value.status, byte_size: value.byte_size,
    content_type: value.content_type, upload_until: value.upload_until,
  }
}

async function parseRequest(request: Request): Promise<MediaRequest> {
  if (request.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() !== 'application/json') {
    throw new MediaError(415, 'Expected application/json.')
  }
  if (Number(request.headers.get('content-length')) > maxJsonBytes) {
    throw new MediaError(413, 'Media request is too large.')
  }
  const reader = request.body?.getReader()
  if (!reader) throw new MediaError(400, 'Missing media request.')

  const bytes = new Uint8Array(maxJsonBytes)
  let size = 0
  try {
    while (true) {
      const chunk = await reader.read()
      if (chunk.done) break
      if (size + chunk.value.length > maxJsonBytes) {
        await reader.cancel().catch(() => undefined)
        throw new MediaError(413, 'Media request is too large.')
      }
      bytes.set(chunk.value, size)
      size += chunk.value.length
    }
  } finally {
    reader.releaseLock()
  }

  let body: unknown
  try {
    body = JSON.parse(new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(bytes.subarray(0, size)))
  } catch {
    throw new MediaError(400, 'Invalid media request JSON.')
  }
  if (!isRecord(body)) throw new MediaError(400, 'Invalid media request.')
  const { action } = body
  if (action === 'health' && Object.keys(body).length === 1) return { action }
  if (!isReference(body)) throw new MediaError(400, 'Invalid media reference.')
  const { bucket, path } = body
  const fields = Object.keys(body)
  if (action === 'reserve' && fields.every(field => ['action', 'bucket', 'path', 'size', 'contentType'].includes(field))) {
    const contentType = typeof body.contentType === 'string' ? body.contentType.split(';')[0]?.trim().toLowerCase() : ''
    if (typeof body.size === 'number' && Number.isSafeInteger(body.size) && body.size > 0 &&
      body.size <= maxUploadBytes && contentType && contentTypePattern.test(contentType)) {
      return { action, bucket, path, size: body.size, contentType }
    }
  }
  if ((action === 'read' || action === 'commit' || action === 'delete') && fields.length === 3) {
    return { action, bucket, path }
  }
  throw new MediaError(400, 'Invalid media action or parameters.')
}

function jsonHeaders(origin: string | null) {
  const headers = new Headers({
    'cache-control': 'private, no-store',
    'referrer-policy': 'no-referrer',
    'x-content-type-options': 'nosniff',
    vary: 'Origin',
  })
  if (origin) headers.set('access-control-allow-origin', origin)
  return headers
}

async function requestSupabase(env: MediaEnv, endpoint: string, init: RequestInit) {
  const url = new URL(endpoint, env.SUPABASE_URL)
  const localHttp = url.protocol === 'http:' && ['127.0.0.1', '[::1]', 'localhost'].includes(url.hostname)
  if ((url.protocol !== 'https:' && !localHttp) || url.username || url.password) {
    throw new MediaError(502, 'Media authentication is unavailable.')
  }
  return fetch(url, {
    ...init, redirect: 'error', signal: AbortSignal.timeout(8000),
  })
}

async function authenticatedUser(env: MediaEnv, request: Request) {
  const authorization = request.headers.get('authorization')
  if (!authorization || !/^Bearer [A-Za-z0-9._~-]{1,8192}$/i.test(authorization)) {
    throw new MediaError(401, 'Sign in to access private media.')
  }
  const result = await requestSupabase(env, '/auth/v1/user', {
    headers: { apikey: env.SUPABASE_PUBLIC_KEY, authorization },
  })
  if (result.status === 401 || result.status === 403) {
    throw new MediaError(401, 'Sign in to access private media.')
  }
  if (!result.ok) throw new MediaError(502, 'Media authentication is unavailable.')
  const user: unknown = await result.json()
  if (!isRecord(user) || typeof user.id !== 'string' || !uuidPattern.test(user.id)) {
    throw new MediaError(401, 'Sign in to access private media.')
  }
  return user.id
}

async function broker(env: MediaEnv, action: BrokerAction, actor?: string, reference?: Reference, upload?: Upload): Promise<unknown> {
  const headers = new Headers({ apikey: env.SUPABASE_SERVICE_KEY, 'content-type': 'application/json' })
  // The newer sb_secret key is exchanged by the Supabase gateway from apikey.
  // A local or legacy JWT service-role key also needs its Authorization header.
  if (!env.SUPABASE_SERVICE_KEY.startsWith('sb_secret_')) {
    headers.set('authorization', `Bearer ${env.SUPABASE_SERVICE_KEY}`)
  }
  const result = await requestSupabase(env, '/rest/v1/rpc/media_broker', {
    method: 'POST', headers,
    body: JSON.stringify({
      p_action: action,
      p_actor: actor,
      p_bucket: reference?.bucket,
      p_path: reference?.path,
      p_size: upload?.size,
      p_content_type: upload?.contentType,
    }),
  })
  const value: unknown = await result.json().catch(() => undefined)
  if (result.ok) return value
  const code = isRecord(value) ? value.code : undefined
  if (code === '42501') throw new MediaError(403, 'Media access denied.')
  if (code === '22023') throw new MediaError(400, 'Invalid media reference or upload.')
  if (code === '23505' || code === 'P0001') throw new MediaError(409, 'Media state has changed. Retry the operation.')
  throw new MediaError(502, 'Media authorization is unavailable.')
}

function checkSigningConfig(env: MediaEnv) {
  if (!/^[a-f0-9]{32}$/i.test(env.R2_ACCOUNT_ID) ||
    !/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(env.R2_BUCKET_NAME) ||
    !env.R2_ACCESS_KEY_ID || !env.R2_SECRET_ACCESS_KEY) {
    throw new MediaError(502, 'Media storage is unavailable.')
  }
}

async function sign(env: MediaEnv, key: string, method: 'GET' | 'PUT', ttl: number, now: number, headers?: HeadersInit) {
  checkSigningConfig(env)
  const url = new URL(`https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${env.R2_BUCKET_NAME}/${key}`)
  url.searchParams.set('X-Amz-Expires', String(ttl))
  const signer = new AwsClient({
    accessKeyId: env.R2_ACCESS_KEY_ID, secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    service: 's3', region: 'auto',
  })
  const signed = await signer.sign(url.toString(), {
    method, headers,
    aws: {
      signQuery: true, allHeaders: method === 'PUT',
      datetime: new Date(now).toISOString().replace(/[:-]|\.\d{3}/g, ''),
    },
  })
  return signed.url
}

async function handleMedia(env: MediaEnv, actor: string, request: MediaRequest) {
  if (request.action === 'health') {
    await broker(env, 'health', actor)
    checkSigningConfig(env)
    await env.MEDIA_BUCKET.head('system/media-health')
    return {}
  }
  if (request.action === 'delete') {
    // An outstanding conditional PUT may still succeed until its lease ends.
    // Block new reads immediately, then purge the key after the replay window.
    await broker(env, 'delete', actor, request)
    return {}
  }
  if (request.action === 'reserve') {
    const row = objectRow(await broker(env, 'reserve', actor, request, request), request)
    if (row.status === 'ready') return { ready: true }
    const now = Date.now()
    const deadline = Date.parse(row.upload_until)
    const ttl = Math.min(uploadTtl, Math.floor((deadline - now) / 1000))
    if (!Number.isFinite(ttl) || ttl < 1) throw new MediaError(409, 'The upload reservation expired. Retry the upload.')
    const headers = {
      'content-type': row.content_type,
      'cache-control': 'private, no-store',
      'if-none-match': '*',
    }
    const uploadUrl = await sign(env, row.object_key, 'PUT', ttl, now, {
      ...headers, 'content-length': String(row.byte_size),
    })
    return { uploadUrl, headers }
  }
  if (request.action === 'read') {
    const row = objectRow(await broker(env, 'read', actor, request), request)
    if (row.status !== 'ready') throw new MediaError(403, 'Media access denied.')
    const now = Math.floor(Date.now() / 1000) * 1000
    return { url: await sign(env, row.object_key, 'GET', readTtl, now), expiresAt: now + readTtl * 1000 }
  }
  const row = objectRow(await broker(env, 'lookup', actor, request), request)
  if (row.status === 'ready') return {}
  const uploaded = await env.MEDIA_BUCKET.head(row.object_key)
  const contentType = uploaded?.httpMetadata?.contentType
  if (!uploaded || uploaded.size !== row.byte_size || contentType !== row.content_type) {
    throw new MediaError(409, 'Upload is missing or does not match its reservation.')
  }
  await broker(env, 'commit', actor, request, { size: uploaded.size, contentType })
  return {}
}

export default {
  async fetch(request: Request, env: MediaEnv): Promise<Response> {
    const origin = request.headers.get('origin')
    if (origin && (origin === 'null' || !env.ALLOWED_ORIGINS.split(',').some(value => value.trim() === origin))) {
      return Response.json({ error: 'Origin is not allowed.' }, { status: 403, headers: jsonHeaders(null) })
    }
    const headers = jsonHeaders(origin)
    try {
      if (new URL(request.url).pathname !== '/media') throw new MediaError(404, 'Media route not found.')
      if (request.method === 'OPTIONS' && origin) {
        if (request.headers.get('access-control-request-method') !== 'POST') {
          throw new MediaError(405, 'Use POST for media operations.')
        }
        headers.set('access-control-allow-methods', 'POST')
        headers.set('access-control-allow-headers', 'Authorization, Content-Type')
        headers.set('access-control-max-age', '600')
        return new Response(null, { status: 204, headers })
      }
      if (request.method !== 'POST') throw new MediaError(405, 'Use POST for media operations.')
      const payload = await parseRequest(request)
      const actor = await authenticatedUser(env, request)
      return Response.json(await handleMedia(env, actor, payload), { headers })
    } catch (cause) {
      if (cause instanceof MediaError) return Response.json({ error: cause.message }, { status: cause.status, headers })
      return Response.json({ error: 'Media service is unavailable.' }, { status: 502, headers })
    }
  },

  async scheduled(_event: ScheduledController, env: MediaEnv) {
    const rows = await broker(env, 'sweep')
    if (!Array.isArray(rows)) throw new Error('Media cleanup returned an invalid batch.')
    let failed = false
    for (const row of rows.slice(0, purgeBatchSize)) {
      try {
        if (!isRecord(row) || !isReference(row) || !isObjectKey(row.object_key) || row.status !== 'deleted' ||
          typeof row.upload_until !== 'string' || !(Date.parse(row.upload_until) < Date.now())) {
          throw new Error('Invalid cleanup record.')
        }
        await env.MEDIA_BUCKET.delete(row.object_key)
        await broker(env, 'purged', undefined, row)
      } catch {
        failed = true
      }
    }
    if (failed) throw new Error('Some expired media objects could not be purged.')
  },
} satisfies ExportedHandler<MediaEnv>
