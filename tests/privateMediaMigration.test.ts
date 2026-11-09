import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const migrationPath = resolve(process.cwd(), 'supabase/bootstrap/20261109000900_private_media.sql')
const readMigration = () => readFileSync(migrationPath, 'utf8')

describe('private media bootstrap migration', () => {
  it('makes registry data and the actor-parameter RPC inaccessible to app callers', () => {
    const migration = readMigration()
    expect(migration).toContain('alter table public.media_objects enable row level security')
    expect(migration).toMatch(/revoke all on public\.media_objects from public, anon, authenticated, service_role/)
    expect(migration).toMatch(/revoke all on function public\.media_broker\(text, uuid, text, text, bigint, text\)\s+from public, anon, authenticated/)
    expect(migration).toMatch(/grant execute on function public\.media_broker\(text, uuid, text, text, bigint, text\) to service_role/)
  })

  it('keeps object keys server-generated and reserves only a real album in the actor space', () => {
    const migration = readMigration()
    expect(migration).toContain("target_couple_id::text || '/' || gen_random_uuid()::text")
    expect(migration).toMatch(/from public\.albums a\s+where a\.id = .* and a\.couple_id = target_couple_id/)
  })

  it('defers physical cleanup beyond upload leases and never recycles logical paths', () => {
    const migration = readMigration()
    expect(migration).toContain('primary key (bucket, path)')
    expect(migration).toContain("upload_until < statement_timestamp() - interval '1 hour'")
    expect(migration).toContain('for update skip locked')
    expect(migration).not.toMatch(/delete from public\.media_objects/i)
  })
})
