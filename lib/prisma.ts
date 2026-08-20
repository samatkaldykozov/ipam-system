import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

/**
 * Ensures the Prisma connection URL has the parameters required for
 * Supabase's PgBouncer connection pooler on Vercel serverless functions.
 *
 * `pgbouncer=true` makes Prisma disable prepared statements, which are
 * incompatible with PgBouncer transaction-mode pooling (the cause of
 * PostgreSQL error 26000 "prepared statement does not exist").
 * `connection_limit=1` prevents exhausting the pool across concurrent
 * serverless invocations.
 */
function withPgBouncerParams(url: string | undefined): string | undefined {
  if (!url) return url;

  const hasPgbouncer = /[?&]pgbouncer=true/.test(url);
  const hasConnectionLimit = /[?&]connection_limit=/.test(url);

  let result = url;
  const addParam = (param: string) => {
    result += (result.includes('?') ? '&' : '?') + param;
  };

  if (!hasPgbouncer) addParam('pgbouncer=true');
  if (!hasConnectionLimit) addParam('connection_limit=1');

  return result;
}

const pooledUrl = withPgBouncerParams(process.env.DATABASE_URL);

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    ...(pooledUrl
      ? { datasources: { db: { url: pooledUrl } } }
      : {}),
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
