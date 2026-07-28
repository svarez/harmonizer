import path from 'node:path';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const currentFilePath = fileURLToPath(import.meta.url);
const currentDirectory = path.dirname(currentFilePath);

export const PROJECT_ROOT = path.resolve(
  currentDirectory,
  '../../../..',
);

export const STORAGE_ROOT = process.env.STORAGE_ROOT ?? path.join(
  PROJECT_ROOT,
  'storage',
);

export const SONGS_DIRECTORY = path.join(
  STORAGE_ROOT,
  'songs',
);

export const TEMP_DIRECTORY = path.join(
  STORAGE_ROOT,
  'tmp',
);

export async function ensureStorage(): Promise<void> {
  await Promise.all([
    mkdir(SONGS_DIRECTORY, {
      recursive: true,
    }),

    mkdir(TEMP_DIRECTORY, {
      recursive: true,
    }),
  ]);
}
