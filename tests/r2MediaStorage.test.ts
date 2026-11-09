import { afterEach, describe, expect, it, vi } from 'vitest'
import { createR2MediaStorageProvider, isR2MediaPath } from '../app/utils/r2MediaStorage'

const path = 'r2/couple/example/thumb.jpg'
const workerUrl = 'https://media.example.test'
const uploadUrl = 'https://bucket.example.test/object?signature=test'
const file = new File(['image bytes'], 'test.jpg', { type: 'image/jpeg' })

function reply(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

function setup(responses: Response[], putStatus = 200) {
  const fetch = vi.fn()
  for (const response of responses) fetch.mockResolvedValueOnce(response)
  vi.stubGlobal('fetch', fetch)
  const put = vi.fn()
  const open = vi.fn()
  const setRequestHeader = vi.fn()
  class MockXhr {
    upload = { onprogress: undefined }
    status = putStatus
    open = open
    setRequestHeader = setRequestHeader
    onload?: () => void
    send(body: File) { put(body); this.onload?.() }
  }
  vi.stubGlobal('XMLHttpRequest', MockXhr)
  return { fetch, put, open, setRequestHeader }
}

afterEach(() => vi.unstubAllGlobals())

describe('private R2 media provider', () => {
  it('sends only media bytes and signed headers to the R2 upload URL', async () => {
    const { fetch, put, open, setRequestHeader } = setup([
      reply({ uploadUrl, headers: { 'Content-Type': 'image/jpeg', 'If-None-Match': '*' } }),
      reply({}),
    ])
    const provider = createR2MediaStorageProvider(workerUrl, async () => 'test-session')
    await provider.upload('album-media', path, file)
    expect(open).toHaveBeenCalledWith('PUT', uploadUrl)
    expect(put).toHaveBeenCalledWith(file)
    expect(setRequestHeader.mock.calls).toEqual([['Content-Type', 'image/jpeg'], ['If-None-Match', '*']])
    expect(fetch.mock.calls.map(([, options]) => JSON.parse(options.body).action)).toEqual(['reserve', 'commit'])
    expect(fetch.mock.calls[0]?.[1].headers.Authorization).toBe('Bearer test-session')
    expect(JSON.parse(fetch.mock.calls[0]?.[1].body)).toMatchObject({ size: file.size, contentType: 'image/jpeg', path })
  })

  it('commits an already uploaded object after the direct retry receives a conflict', async () => {
    const { fetch } = setup([reply({ uploadUrl, headers: {} }), reply({})], 412)
    await createR2MediaStorageProvider(workerUrl, async () => 'test-session').upload('album-media', path, file)
    expect(JSON.parse(fetch.mock.calls[1]?.[1].body)).toMatchObject({ action: 'commit', path })
  })

  it('skips retransmitting an already committed reservation', async () => {
    const { put, fetch } = setup([reply({ ready: true })])
    await createR2MediaStorageProvider(workerUrl, async () => 'test-session').upload('album-media', path, file)
    expect(put).not.toHaveBeenCalled()
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('never sends unauthenticated requests and surfaces cross-space denials', async () => {
    const { fetch } = setup([reply({ error: 'Forbidden' }, 403)])
    await expect(createR2MediaStorageProvider(workerUrl, async () => '').read('album-media', path)).rejects.toThrow('登录')
    expect(fetch).not.toHaveBeenCalled()
    await expect(createR2MediaStorageProvider(workerUrl, async () => 'test-session').read('album-media', path)).rejects.toMatchObject({ status: 403 })
  })

  it('rejects expired read URLs and distinguishes the existing storage paths', async () => {
    setup([reply({ url: uploadUrl, expiresAt: Date.now() - 1000 })])
    await expect(createR2MediaStorageProvider(workerUrl, async () => 'test-session').read('album-media', path)).rejects.toThrow('授权')
    expect(isR2MediaPath(path)).toBe(true)
    expect(isR2MediaPath('couple/album-media/photo.jpg')).toBe(false)
  })
})
