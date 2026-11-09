import { afterEach, describe, expect, it, vi } from 'vitest'
import { getUploadRecoveryState, retry, runQueuedUpload } from '../app/composables/useMediaUploadQueue'

describe('media upload retries', () => {
  afterEach(() => {
    vi.clearAllTimers()
    vi.useRealTimers()
  })

  it('joins an in-flight upload instead of starting a duplicate write', async () => {
    vi.useFakeTimers()
    const file = new File(['bytes'], 'image.jpg', { type: 'image/jpeg' })
    let resolveUpload: (result: string) => void = () => undefined
    const runner = vi.fn(() => new Promise<string>(resolve => { resolveUpload = resolve }))
    const result = runQueuedUpload(file, file.name, runner)
    await Promise.resolve()

    const job = getUploadRecoveryState().jobs.value.find(item => item.name === file.name)
    expect(job).toBeDefined()
    const second = retry(job!.id)
    await Promise.resolve()
    expect(runner).toHaveBeenCalledTimes(1)
    resolveUpload('saved')
    await expect(result).resolves.toBe('saved')
    await second
  })
})
