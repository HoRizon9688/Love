export type Album = { id: string; name: string; description: string; coverUrl: string; createdAt: string; photoCount: number }
export type GalleryPhoto = { id: string; path: string; thumbPath?: string; mediumPath?: string; originalPath?: string; videoPosterPath?: string; videoPosterUrl?: string; url: string; originalUrl?: string; loadState?: 'pending'|'ready'|'error'; takenDate: string; albumId: string; albumName: string; source: 'album' | 'memory'; caption: string; mediaType:'image'|'video'; uploadedBy:string; uploaderName:string; legacy:boolean }
import { createMediaSignedUrl, createMediaSignedUrls, createVideoPoster, isR2MediaUploadEnabled, mediaUploadPath, prepareImageVariants, prepareVideoForUpload, removeMediaObjects, uploadMediaResumable } from './useMediaUrls'
import { runQueuedUpload } from './useMediaUploadQueue'

const albums = ref<Album[]>([])
const albumPhotos = ref<GalleryPhoto[]>([])
const albumsLoading = ref(false);const albumPhotosLoadingMore = ref(false);const albumPhotosHasMore = ref(true);let oldestAlbumPhotoDate=''
const albumsLoaded = ref(false)
const ALBUM_PAGE_SIZE = 20
let albumRealtimeChannel: any = null

export function useAlbums() {
  const { $supabase } = useNuxtApp()
  const { profile, demoMode } = useCoupleAuth()
  const { memories, loadMemories } = useMemories()

  function demoLoad() {
    albums.value = JSON.parse(localStorage.getItem('couple-space-albums') || '[]')
    albumPhotos.value = JSON.parse(localStorage.getItem('couple-space-album-photos') || '[]')
  }
  function demoSave() { localStorage.setItem('couple-space-albums', JSON.stringify(albums.value)); localStorage.setItem('couple-space-album-photos', JSON.stringify(albumPhotos.value)) }
  function isAlbumPath(path: string) { return path.includes('/album-media/') || path.startsWith('album-media/') }
  const galleryImageTransform = { width: 640, height: 640, resize: 'contain' as const, quality: 68 }
  async function signedUrl(path: string, legacy = false, mediaType: 'image' | 'video' = 'image') { return createMediaSignedUrl($supabase, path, legacy && !isAlbumPath(path) ? 'memory-photos' : 'album-media', mediaType === 'image' ? galleryImageTransform : undefined) }


  function mapAlbumPhotoRows(rows: any[]) {
    return rows.map((row: any) => { const path = row.path || row.original_path || ''; const legacy=!path.includes('/album-media/'); const mediaType=row.media_type||'image'; return { id: row.id, path, thumbPath: row.thumb_path || '', mediumPath: row.medium_path || '', originalPath: row.original_path || path, videoPosterPath: row.video_poster_path || '', videoPosterUrl: '', url: '', loadState: 'pending' as const, takenDate: row.taken_date, albumId: row.album_id, albumName: row.albums?.name || '', source: 'album' as const, caption: row.caption || '', mediaType, uploadedBy: row.uploaded_by, uploaderName: row.profiles?.display_name||'情侣成员', legacy } })
  }
  // Video tiles should request the lightweight poster, never the original movie.
  // The original path is loaded only when the lightbox is opened.
  function displayPath(photo: GalleryPhoto) { return photo.mediaType === 'image' ? (photo.thumbPath || photo.path) : (photo.videoPosterPath || '') }
  function originalPath(photo: GalleryPhoto) { return photo.originalPath || photo.path }
  function photoNeedsTransform(photo: GalleryPhoto) { return photo.mediaType === 'image' && !photo.thumbPath }
  const albumPhotoSelect = 'id, path, thumb_path, medium_path, original_path, video_poster_path, taken_date, album_id, caption, media_type, uploaded_by, albums(name), profiles!album_photos_uploaded_by_fkey(display_name)'
  const legacyOptimizationAttempted = new Set<string>()
  async function fetchAlbumPhotoPage(build: (select: string) => any) {
    const first = await build(albumPhotoSelect)
    if (!first.error) return first
    // The app remains usable while a deployed project is waiting for 014_media_variants.sql.
    const status = Number(first.error?.status || first.error?.statusCode || 0)
    const code = String(first.error?.code || '')
    const message = String(first.error?.message || '').toLowerCase()
    const missingColumn = code === '42703' || code === 'PGRST204' || status === 400 || message.includes('column') || message.includes('video_poster_path')
    if (!missingColumn) return first
    return build('id, path, taken_date, album_id, caption, media_type, uploaded_by, albums(name), profiles!album_photos_uploaded_by_fkey(display_name)')
  }
  async function hydrateAlbumPhotoUrls(items: GalleryPhoto[]) {
    const imageTransform = galleryImageTransform
    // Resolve the first viewport independently so a slow item later in the
    // page cannot hold every gallery tile in a loading state.
    const chunks: GalleryPhoto[][] = []
    for (let start = 0; start < items.length; start += 12) chunks.push(items.slice(start, start + 12))
    let nextChunk = 0
    const hydrateWorker = async () => {
      while (nextChunk < chunks.length) {
        const chunk = chunks[nextChunk++]!
        try {
          const requests = chunk.map(photo => ({ photo, path: displayPath(photo), bucket: photo.legacy ? 'memory-photos' : 'album-media' }))
          const urls = await createMediaSignedUrls($supabase, requests.map(item => ({ path: item.path, bucket: item.bucket, transform: photoNeedsTransform(item.photo) ? imageTransform : undefined })))
          chunk.forEach(photo => { const path = displayPath(photo); photo.url = path ? (urls.get(`${photo.legacy ? 'memory-photos' : 'album-media'}:${path}`) || '') : ''; photo.videoPosterUrl = photo.mediaType === 'video' && photo.videoPosterPath ? photo.url : ''; photo.loadState = photo.url || (photo.mediaType === 'video' && !photo.videoPosterPath) ? 'ready' : 'error' })
        } catch {
          // Never leave a tile in the infinite pending state when a batch
          // request fails unexpectedly. The tile can be retried individually.
          chunk.forEach(photo => { photo.url = ''; photo.loadState = 'error' })
        }
      }
    }
    await Promise.all(Array.from({ length: Math.min(3, chunks.length) }, () => hydrateWorker()))
    // Upgrade old rows after their existing image has rendered. This is
    // deliberately detached from the first paint and is safe to retry later.
    for (const photo of items) if (photo.url && photo.mediaType === 'image' && !photo.thumbPath && !legacyOptimizationAttempted.has(photo.path)) {
      legacyOptimizationAttempted.add(photo.path)
      void optimizeLegacyPhoto(photo)
    }
  }
  async function optimizeLegacyPhoto(photo: GalleryPhoto) {
    if (!$supabase || demoMode.value || isR2MediaUploadEnabled() || photo.path.startsWith('r2/') || !photo.url || photo.thumbPath || photo.mediaType !== 'image') return
    const bucket = photo.legacy ? 'memory-photos' : 'album-media'
    const base = photo.path.replace(/\.[^.]+$/, '')
    const paths = { thumb: `${base}/thumb.jpg`, medium: `${base}/medium.jpg` }
    try {
      const response = await fetch(photo.url)
      if (!response.ok) return
      const file = new File([await response.blob()], 'legacy-photo.jpg', { type: 'image/jpeg' })
      const variants = await prepareImageVariants(file)
      const results = await Promise.all([
        uploadMediaResumable($supabase, bucket, paths.thumb, variants.thumb, undefined, true),
        uploadMediaResumable($supabase, bucket, paths.medium, variants.medium, undefined, true),
      ])
      const failed = results.find(item => item.error)
      if (failed?.error) throw failed.error
      const { error } = await $supabase.from('album_photos').update({ thumb_path: paths.thumb, medium_path: paths.medium, original_path: photo.path }).eq('id', photo.id)
      if (error) throw error
      photo.thumbPath = paths.thumb; photo.mediumPath = paths.medium; photo.originalPath = photo.path
      photo.url = await createMediaSignedUrl($supabase, paths.thumb, bucket)
    } catch {
      await removeMediaObjects($supabase, bucket, [paths.thumb, paths.medium]).catch(() => undefined)
    }
  }
  async function retryPhoto(photo: GalleryPhoto) {
    if (!photo.path) return
    photo.loadState = 'pending'
    const path = displayPath(photo)
    if (!path && photo.mediaType === 'video') { photo.loadState = 'ready'; return }
    const transform = photoNeedsTransform(photo) ? galleryImageTransform : undefined
    photo.url = await createMediaSignedUrl($supabase, path, photo.legacy ? 'memory-photos' : 'album-media', transform)
    photo.loadState = photo.url ? 'ready' : 'error'
  }
  async function loadAlbums(force = false) {
    if (!import.meta.client || albumsLoading.value || (albumsLoaded.value && !force)) return
    albumsLoading.value = true
    try {
      // The timeline and album query are independent; do not make the gallery wait for both.
      void loadMemories().catch(() => undefined)
      if (!$supabase || demoMode.value) { demoLoad(); albumsLoaded.value = true; return }
      const [{ data: albumRows, error: albumError }, { data: photoRows, error: photoError }] = await Promise.all([
        $supabase.from('albums').select('id, name, description, cover_path, created_at').order('created_at', { ascending: false }),
        fetchAlbumPhotoPage(select => $supabase.from('album_photos').select(select).order('taken_date', { ascending: false }).limit(ALBUM_PAGE_SIZE)),
      ])
      if (albumError) throw albumError; if (photoError) throw photoError
      albumPhotos.value = mapAlbumPhotoRows(photoRows || [])
      void hydrateAlbumPhotoUrls(albumPhotos.value).catch(() => undefined)
      oldestAlbumPhotoDate = albumPhotos.value[albumPhotos.value.length - 1]?.takenDate || ''
      albumPhotosHasMore.value = (photoRows || []).length === ALBUM_PAGE_SIZE
      const imageTransform = galleryImageTransform
      albums.value = (albumRows || []).map((row: any) => ({ id: row.id, name: row.name, description: row.description || '', coverUrl: '', createdAt: row.created_at, photoCount: albumPhotos.value.filter(photo => photo.albumId === row.id).length }))
      void (async () => {
        const imageTransform = galleryImageTransform
        const coverItems = (albumRows || []).filter((row: any) => row.cover_path).map((row: any) => ({ path: row.cover_path, bucket: 'album-media', transform: imageTransform }))
        const coverUrls = await createMediaSignedUrls($supabase, coverItems)
        const countEntries = await Promise.all((albumRows || []).map(async (row: any) => { const { count } = await $supabase.from('album_photos').select('id', { count: 'exact', head: true }).eq('album_id', row.id); return [row.id, count || 0] as const }))
        const photoCounts = new Map(countEntries)
        albums.value = albums.value.map(album => { const row = (albumRows || []).find((item: any) => item.id === album.id); return { ...album, coverUrl: row?.cover_path ? coverUrls.get(`album-media:${row.cover_path}`) || '' : '', photoCount: photoCounts.get(album.id) || 0 } })
      })().catch(() => undefined)
      albumsLoaded.value = true
    } finally { albumsLoading.value = false }
  }

  async function loadMorePhotos() {
    if (!$supabase || demoMode.value || albumPhotosLoadingMore.value || !albumPhotosHasMore.value || !oldestAlbumPhotoDate) return
    albumPhotosLoadingMore.value = true
    try {
      const { data, error } = await fetchAlbumPhotoPage(select => $supabase.from('album_photos').select(select).lt('taken_date', oldestAlbumPhotoDate).order('taken_date', { ascending: false }).limit(ALBUM_PAGE_SIZE))
      if (error) throw error
      const page = mapAlbumPhotoRows(data || [])
      albumPhotos.value = [...albumPhotos.value, ...page]
      void hydrateAlbumPhotoUrls(page).catch(() => undefined)
      oldestAlbumPhotoDate = page[page.length - 1]?.takenDate || oldestAlbumPhotoDate
      albumPhotosHasMore.value = page.length === ALBUM_PAGE_SIZE
    } finally { albumPhotosLoadingMore.value = false }
  }

  function adjustAlbumPhotoCount(albumId: string, delta: number) {
    albums.value = albums.value.map(album => album.id === albumId
      ? { ...album, photoCount: Math.max(0, album.photoCount + delta) }
      : album)
  }

  async function subscribeAlbumPhotos() {
    if (!$supabase || demoMode.value || albumRealtimeChannel || !profile.value?.coupleId) return
    const coupleId = profile.value.coupleId
    albumRealtimeChannel = $supabase.channel(`album-photos:${coupleId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'album_photos' }, (payload: any) => {
        const row = payload.eventType === 'DELETE' ? payload.old : payload.new
        const id = String(row?.id || '')
        if (!id) return
        if (payload.eventType === 'DELETE') {
          const existing = albumPhotos.value.find(photo => photo.id === id)
          albumPhotos.value = albumPhotos.value.filter(photo => photo.id !== id)
          if (existing) adjustAlbumPhotoCount(existing.albumId, -1)
          return
        }
        // Re-query joined album/profile fields so both clients receive the same card metadata.
        void loadAlbums(true).catch(() => undefined)
      })
      .subscribe()
  }

  async function disconnectAlbumPhotos() {
    if (albumRealtimeChannel && $supabase) await $supabase.removeChannel(albumRealtimeChannel)
    albumRealtimeChannel = null
  }

  const memoryPhotos = computed<GalleryPhoto[]>(() => memories.value.flatMap(memory => memory.photos.map((photo, index) => ({ id: `${memory.id}-${index}`, path: photo.path, thumbPath: photo.thumbPath, mediumPath: photo.mediumPath, originalPath: photo.originalPath, url: photo.url, originalUrl: photo.originalUrl, loadState: photo.loadState, takenDate: memory.memoryDate, albumId: 'memories', albumName: '时光轴', source: 'memory' as const, caption: memory.content,mediaType:'image',uploadedBy:memory.authorId,uploaderName:memory.authorName||'情侣成员',legacy:!isAlbumPath(photo.path) }))))
  const allPhotos = computed(() => [...albumPhotos.value, ...memoryPhotos.value].sort((a, b) => b.takenDate.localeCompare(a.takenDate)))

  async function createAlbum(name: string, description: string) {
    if (!$supabase || demoMode.value) { albums.value.unshift({ id: crypto.randomUUID(), name, description, coverUrl: '', createdAt: new Date().toISOString(), photoCount: 0 }); demoSave(); return }
    const { error } = await $supabase.from('albums').insert({ couple_id: profile.value!.coupleId, created_by: profile.value!.id, name, description: description || null })
    if (error) throw error; await loadAlbums(true)
  }

  async function uploadToAlbum(albumId: string, files: File[], takenDate: string) {
    const album = albums.value.find(item => item.id === albumId)
    if (!album) throw new Error('找不到相册')
    const readLocally = !$supabase || demoMode.value
    const actor = profile.value
    const coupleId = actor?.coupleId
    const actorId = actor?.id
    try {
      for (const sourceFile of files) {
        if (readLocally) {
          const url = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result as string); reader.onerror = reject; reader.readAsDataURL(sourceFile) })
          albumPhotos.value.unshift({ id: crypto.randomUUID(), path: '', url, takenDate, albumId, albumName: album.name, source: 'album', caption: '', mediaType: sourceFile.type.startsWith('video/') ? 'video' : 'image', uploadedBy: actorId || 'demo-user', uploaderName: actor?.displayName || '我', legacy: false })
          continue
        }
        if (!$supabase || !coupleId || !actorId) throw new Error('请先进入情侣空间')
        const ensureScope = () => {
          if (profile.value?.id !== actorId || profile.value?.coupleId !== coupleId) throw new Error('空间已切换，请重新选择文件')
        }
        const base = mediaUploadPath(`${coupleId}/album-media/${albumId}/${crypto.randomUUID()}`)
        const isVideo = sourceFile.type.startsWith('video/')
        const r2 = base.startsWith('r2/')
        type Upload = { path: string; file: File }
        type PhotoRow = { path: string; original_path: string; thumb_path?: string; medium_path?: string; video_poster_path?: string | null; media_type: 'image' | 'video' }
        async function prepare(): Promise<{ uploads: Upload[]; row: PhotoRow; coverPath: string }> {
          if (isVideo) {
            const file = r2 ? sourceFile : await prepareVideoForUpload(sourceFile)
            const mime = file.type.split(';', 1)[0]
            const knownExtension = mime === 'video/mp4' ? 'mp4' : mime === 'video/quicktime' ? 'mov' : mime === 'video/webm' ? 'webm' : ''
            if (r2 && !knownExtension) throw new Error('请上传 MP4、WebM 或 MOV 视频')
            const extension = knownExtension || file.name.match(/\.([a-z0-9]{1,8})$/i)?.[1]?.toLowerCase() || 'webm'
            const path = `${base}.${extension}`
            const poster = await createVideoPoster(file)
            const posterPath = poster ? `${base}/poster.jpg` : null
            const uploads = [{ path, file }]
            if (poster && posterPath) uploads.push({ path: posterPath, file: poster })
            return { uploads, row: { path, original_path: path, video_poster_path: posterPath, media_type: 'video' }, coverPath: posterPath || path }
          }
          const variants = await prepareImageVariants(sourceFile)
          const path = `${base}/original.jpg`
          const thumb = `${base}/thumb.jpg`
          const medium = `${base}/medium.jpg`
          return {
            uploads: [{ path: thumb, file: variants.thumb }, { path: medium, file: variants.medium }, { path, file: variants.original }],
            row: { path, original_path: path, thumb_path: thumb, medium_path: medium, media_type: 'image' },
            coverPath: thumb,
          }
        }
        let preparation: ReturnType<typeof prepare> | undefined
        const completedPaths = new Set<string>()
        await runQueuedUpload(sourceFile, `相册 · ${sourceFile.name}`, async setProgress => {
          ensureScope()
          const { uploads, row, coverPath } = await (preparation ??= prepare())
          ensureScope()
          const progress = uploads.map(() => 0)
          const outcomes = await Promise.allSettled(uploads.map(async ({ path, file }, index) => {
            if (completedPaths.has(path)) { progress[index] = 100; return }
            const { error } = await uploadMediaResumable($supabase, 'album-media', path, file, percent => {
              progress[index] = percent
              setProgress(25 + Math.round(progress.reduce((sum, value) => sum + value, 0) * .5 / uploads.length))
            })
            if (error) throw error
            completedPaths.add(path)
          }))
          const failure = outcomes.find(outcome => outcome.status === 'rejected')
          if (failure?.status === 'rejected') throw failure.reason
          ensureScope()
          setProgress(78)
          const { error } = await $supabase.from('album_photos').insert({ ...row, album_id: albumId, uploaded_by: actorId, taken_date: takenDate })
          if (error) {
            // A lost response can leave the original insert committed before a retry.
            if (error.code !== '23505') throw error
            const { data } = await $supabase.from('album_photos').select('id').eq('path', row.path).eq('album_id', albumId).eq('uploaded_by', actorId).maybeSingle()
            if (!data) throw error
          }
          if (!album.coverUrl) await $supabase.from('albums').update({ cover_path: coverPath }).eq('id', albumId)
          await loadAlbums(true).catch(() => undefined)
        }, { kind: 'album', coupleId, albumId, takenDate, mediaType: sourceFile.type })
      }
    } finally {
      if (readLocally) {
        album.photoCount = albumPhotos.value.filter(photo => photo.albumId === albumId).length
        album.coverUrl ||= albumPhotos.value.find(photo => photo.albumId === albumId)?.url || ''
        demoSave()
      }
    }
  }

  async function deletePhoto(photo: GalleryPhoto) {
    if (photo.source === 'memory') throw new Error('时光轴照片请在对应回忆中编辑')
    if (!$supabase || demoMode.value) { albumPhotos.value = albumPhotos.value.filter(item => item.id !== photo.id); demoSave(); return }
    const paths = [...new Set([photo.path, photo.thumbPath, photo.mediumPath, photo.originalPath, photo.videoPosterPath].filter(Boolean))]
    if (paths.length) {
      const { error: storageError } = await removeMediaObjects($supabase, photo.legacy ? 'memory-photos' : 'album-media', paths)
      if (storageError) throw storageError
    }
    const { error } = await $supabase.from('album_photos').delete().eq('id', photo.id); if (error) throw error
    albumPhotos.value = albumPhotos.value.filter(item => item.id !== photo.id)
    adjustAlbumPhotoCount(photo.albumId, -1)
    await loadAlbums(true)
  }

  return { albums, allPhotos, albumsLoading, albumPhotosLoadingMore, albumPhotosHasMore, loadAlbums, loadMorePhotos, subscribeAlbumPhotos, disconnectAlbumPhotos, retryPhoto, createAlbum, uploadToAlbum, deletePhoto }
}
