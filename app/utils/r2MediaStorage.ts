export type MediaStorageProvider = {
  upload: (bucket: string, path: string, file: File, onProgress?: (percent: number) => void) => Promise<void>
  read: (bucket: string, path: string) => Promise<{ url: string; expiresAt: number }>
  remove: (bucket: string, path: string) => Promise<void>
  check: () => Promise<void>
}

type UploadReservation = { ready?: boolean; uploadUrl?: string; headers?: Record<string, string> }

export function isR2MediaPath(path: string) {
  return path.startsWith('r2/')
}

function trustedTransportUrl(value: string) {
  const url = new URL(value)
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
  if (url.username || url.password || (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback))) {
    throw new Error('媒体服务必须使用 HTTPS')
  }
  return url
}

class MediaRequestError extends Error {
  constructor(message: string, readonly status: number) { super(message) }
}

function putFile(url: string, headers: Record<string, string>, file: File, onProgress?: (percent: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const request = new XMLHttpRequest()
    request.open('PUT', trustedTransportUrl(url).href)
    for (const [name, value] of Object.entries(headers)) {
      if (['content-type', 'if-none-match', 'cache-control'].includes(name.toLowerCase())) {
        request.setRequestHeader(name, value)
      }
    }
    request.upload.onprogress = event => {
      if (event.lengthComputable) onProgress?.(Math.min(98, Math.round(event.loaded / event.total * 100)))
    }
    request.timeout = 45 * 60 * 1000
    request.onerror = () => reject(new Error('媒体直传失败，请检查网络后重试'))
    request.ontimeout = () => reject(new Error('媒体直传超时，请重试'))
    request.onabort = () => reject(new Error('媒体直传已中断'))
    request.onload = () => {
      // A previous attempt may have reached R2 before the client lost its response.
      // Commit still verifies that the existing object matches the reservation.
      if ((request.status >= 200 && request.status < 300) || request.status === 412) resolve()
      else reject(new MediaRequestError('媒体直传失败，请重试', request.status))
    }
    request.send(file)
  })
}

export function createR2MediaStorageProvider(baseUrl: string, getAccessToken: () => Promise<string>): MediaStorageProvider {
  async function request<T>(payload: Record<string, string | number>) {
    const token = await getAccessToken()
    if (!token) throw new Error('请重新登录后访问私密媒体')
    if (!baseUrl) throw new Error('私密媒体服务尚未配置')
    const endpoint = new URL('media', trustedTransportUrl(baseUrl.replace(/\/+$/, '') + '/'))
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      credentials: 'omit',
      cache: 'no-store',
      referrerPolicy: 'no-referrer',
      signal: AbortSignal.timeout(15000),
    })
    if (!response.ok) {
      const denied = response.status === 401 || response.status === 403 || response.status === 404
      const invalid = response.status === 400 || response.status === 413 || response.status === 415
      throw new MediaRequestError(denied ? '当前账户无权访问此媒体' : invalid ? '媒体格式、大小或上传参数不受支持' : '私密媒体服务暂不可用，请重试', response.status)
    }
    return await response.json() as T
  }

  return {
    async upload(bucket, path, file, onProgress) {
      const contentType = file.type.split(';')[0]?.trim().toLowerCase() || 'application/octet-stream'
      const reservation = await request<UploadReservation>({ action: 'reserve', bucket, path, size: file.size, contentType })
      if (!reservation.ready) {
        if (!reservation.uploadUrl || !reservation.headers) throw new Error('媒体服务未返回上传授权')
        await putFile(reservation.uploadUrl, reservation.headers, file, onProgress)
        await request({ action: 'commit', bucket, path })
      }
      onProgress?.(100)
    },
    async read(bucket, path) {
      const result = await request<{ url: string; expiresAt: number }>({ action: 'read', bucket, path })
      if (typeof result.url !== 'string' || !Number.isFinite(result.expiresAt) || result.expiresAt <= Date.now()) {
        throw new Error('媒体授权已过期或无效')
      }
      return { url: trustedTransportUrl(result.url).href, expiresAt: result.expiresAt }
    },
    async remove(bucket, path) { await request({ action: 'delete', bucket, path }) },
    async check() { await request({ action: 'health' }) },
  }
}
