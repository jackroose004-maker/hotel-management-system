/**
 * Prisma uses prepared statements by default. PgBouncer (and similar poolers in
 * transaction mode) reuse connections without clearing them, which causes:
 *   prepared statement "s0" already exists  (Postgres 42P05)
 *
 * Set DATABASE_USE_PGBOUNCER=true on Render when using a pooled DATABASE_URL,
 * or use a direct Postgres URL (not the pooler port) for long-running servers.
 */
export function resolveDatabaseUrl(raw = process.env.DATABASE_URL): string {
  if (!raw) throw new Error('DATABASE_URL is not set')

  if (process.env.DATABASE_USE_PGBOUNCER === 'false') return raw
  if (raw.includes('pgbouncer=true')) return raw

  const forcePgBouncer = process.env.DATABASE_USE_PGBOUNCER === 'true'
  const looksPooled =
    /pooler|pgbouncer/i.test(raw) ||
    /:6543\//.test(raw) ||
    /[-.]pooler\./i.test(raw)

  if (!forcePgBouncer && !looksPooled) return raw

  const sep = raw.includes('?') ? '&' : '?'
  return `${raw}${sep}pgbouncer=true`
}
