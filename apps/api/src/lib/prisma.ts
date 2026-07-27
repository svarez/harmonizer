import 'dotenv/config';

import {
  PrismaBetterSqlite3,
} from '@prisma/adapter-better-sqlite3';

import {
  PrismaClient,
} from '../generated/prisma/client.js';

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error(
    'La variable DATABASE_URL no está configurada',
  );
}

const adapter = new PrismaBetterSqlite3({
  url: databaseUrl,
});

export const prisma = new PrismaClient({
  adapter,
});