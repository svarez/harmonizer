import path from 'node:path';

import multer from 'multer';

import { TEMP_DIRECTORY } from './storage.js';

function fileFilter(
  _request: Express.Request,
  file: Express.Multer.File,
  callback: multer.FileFilterCallback,
): void {
  const extension = path
    .extname(file.originalname)
    .toLowerCase();

  if (
    file.fieldname === 'audioFile' &&
    extension !== '.mp3'
  ) {
    callback(
      new Error(
        'audioFile debe ser un archivo MP3',
      ),
    );

    return;
  }

  if (
    file.fieldname === 'midiFile' &&
    extension !== '.mid' &&
    extension !== '.midi'
  ) {
    callback(
      new Error(
        'midiFile debe ser un archivo MID o MIDI',
      ),
    );

    return;
  }

  if (file.fieldname === 'coverImage') {
    const validCoverExtensions = [
      '.jpg',
      '.jpeg',
      '.png',
      '.webp',
    ];

    if (!validCoverExtensions.includes(extension)) {
      callback(
        new Error(
          'coverImage debe ser un archivo JPG, PNG o WEBP',
        ),
      );

      return;
    }
  }

  callback(null, true);
}

export const uploadSongFiles = multer({
  dest: TEMP_DIRECTORY,

  fileFilter,

  limits: {
    fileSize: 150 * 1024 * 1024,
    files: 3,
    fields: 5,
    parts: 8,
  },
}).fields([
  {
    name: 'audioFile',
    maxCount: 1,
  },
  {
    name: 'midiFile',
    maxCount: 1,
  },
  {
    name: 'coverImage',
    maxCount: 1,
  },
]);
