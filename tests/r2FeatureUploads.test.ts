import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { useAlbums } from '../app/composables/useAlbums'

const media = vi.hoisted(() => ({
  uploadMediaResumable: vi.fn(),
  removeMediaObjects: vi.fn(),
  prepareImageVariants: vi.fn(),
  runQueuedUpload: vi.fn(),
}))

vi.mock('../app/composables/useMediaUrls', () => ({
  ...media,
  createMediaSignedUrl: vi.fn(),
  createMediaSignedUrls: vi.fn(),
  createVideoPoster: vi.fn(),
  prepareVideoForUpload: vi.fn(),
  isR2MediaUploadEnabled: () => true,
  mediaUploadPath: (path: string) => `r2/${path}`,
}))
vi.mock('../app/composables/useMediaUploadQueue', () => ({ runQueuedUpload: media.runQueuedUpload }))

describe('album media storage integration', () => {
  const insert = vi.fn()
  const profile = ref({ id: 'member', coupleId: 'space' })

  beforeEach(() => {
    vi.resetAllMocks()
    vi.stubGlobal('useCoupleAuth', () => ({ profile, demoMode: ref(false) }))
    vi.stubGlobal('useMemories', () => ({ memories: ref([]), loadMemories: vi.fn() }))
    vi.stubGlobal('useNuxtApp', () => ({ $supabase: {
      from: vi.fn(() => ({ insert })),
      storage: { from: vi.fn(() => ({ remove: media.removeMediaObjects })) },
    } }))
    media.prepareImageVariants.mockImplementation(async (file: File) => ({ thumb: file, medium: file, original: file }))
    media.uploadMediaResumable.mockResolvedValue({ error: null })
    insert.mockResolvedValue({ error: null })
  })

  afterEach(() => vi.unstubAllGlobals())

  function album() {
    const api = useAlbums()
    api.albums.value = [{ id: 'album', name: '相册', description: '', coverUrl: 'cover', createdAt: '', photoCount: 0 }]
    return api
  }

  it('keeps the same object paths and processed files across a queue retry', async () => {
    media.uploadMediaResumable.mockResolvedValueOnce({ error: new Error('断网') })
    media.runQueuedUpload.mockImplementation(async (_file, _label, runner) => {
      await expect(runner(vi.fn())).rejects.toThrow('断网')
      return runner(vi.fn())
    })
    await album().uploadToAlbum('album', [new File(['image'], 'a.jpg', { type: 'image/jpeg' })], '2026-11-09')

    const paths = media.uploadMediaResumable.mock.calls.map(call => call[2])
    expect(paths).toHaveLength(4)
    expect(paths[0]).toMatch(/^r2\/space\/album-media\/album\//)
    expect(paths[3]).toBe(paths[0])
    expect(media.prepareImageVariants).toHaveBeenCalledTimes(1)
    expect(insert).toHaveBeenCalledTimes(1)
    expect(insert.mock.calls[0]?.[0].path).toBe(paths[2])
  })

  it('keeps earlier attached objects when a later file fails', async () => {
    media.runQueuedUpload.mockImplementation(async (_file, _label, runner) => runner(vi.fn()))
    media.uploadMediaResumable.mockImplementation(async (_client, _bucket, _path, file: File) => ({
      error: file.name === 'bad.jpg' ? new Error('上传失败') : null,
    }))
    await expect(album().uploadToAlbum('album', [
      new File(['image'], 'good.jpg', { type: 'image/jpeg' }),
      new File(['image'], 'bad.jpg', { type: 'image/jpeg' }),
    ], '2026-11-09')).rejects.toThrow('上传失败')

    expect(insert).toHaveBeenCalledTimes(1)
    expect(media.removeMediaObjects).not.toHaveBeenCalled()
  })
})
