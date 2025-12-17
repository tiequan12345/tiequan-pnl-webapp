import fs from 'node:fs';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

function findProjectRoot(): string {
  let current = path.resolve(process.cwd());

  while (true) {
    if (fs.existsSync(path.join(current, 'package.json'))) {
      return current;
    }

    const parent = path.dirname(current);
    if (parent === current) {
      break;
    }

    current = parent;
  }

  return process.cwd();
}

function normalizeSqliteUrl(url: string): string {
  const prefix = 'file:';
  if (!url.startsWith(prefix)) {
    return url;
  }

  const rawPath = url.slice(prefix.length);
  const decodedPath = decodeURIComponent(rawPath);
  const effectivePath = decodedPath.startsWith('/')
    ? decodedPath.replace(/^\/+/g, '/')
    : decodedPath;

  const absolutePath = path.isAbsolute(effectivePath)
    ? effectivePath
    : path.resolve(findProjectRoot(), effectivePath);

  return `${prefix}${absolutePath}`;
}

const normalizedDatabaseUrl = process.env.DATABASE_URL
  ? normalizeSqliteUrl(process.env.DATABASE_URL)
  : undefined;

if (normalizedDatabaseUrl) {
  process.env.DATABASE_URL = normalizedDatabaseUrl;
}

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    datasources: normalizedDatabaseUrl
      ? {
          db: {
            url: normalizedDatabaseUrl,
          },
        }
      : undefined,
    log:
      process.env.NODE_ENV === 'development'
        ? ['query', 'error', 'warn']
        : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}