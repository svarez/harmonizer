import { rm } from 'node:fs/promises';

export function getUploadedFiles(
  request: Express.Request,
): Express.Multer.File[] {
  const files = request.files;

  if (!files) {
    return [];
  }

  if (Array.isArray(files)) {
    return files;
  }

  return Object.values(files).flat();
}

export async function removeUploadedFiles(
  files: Express.Multer.File[],
): Promise<void> {
  await Promise.allSettled(
    files.map((file) =>
      rm(file.path, {
        force: true,
      }),
    ),
  );
}