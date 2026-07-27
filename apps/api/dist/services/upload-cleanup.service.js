import { rm } from 'node:fs/promises';
export function getUploadedFiles(request) {
    const files = request.files;
    if (!files) {
        return [];
    }
    if (Array.isArray(files)) {
        return files;
    }
    return Object.values(files).flat();
}
export async function removeUploadedFiles(files) {
    await Promise.allSettled(files.map((file) => rm(file.path, {
        force: true,
    })));
}
