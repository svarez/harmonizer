import { Router } from 'express';
import { z } from 'zod';

import { uploadSongFiles } from '../config/upload.js';

import {
  createSong,
  deleteSong,
  getSong,
  listSongs,
  updateSongLyrics,
  updateSongSynchronization,
} from '../services/song.service.js';

import {
  getUploadedFiles,
  removeUploadedFiles,
} from '../services/upload-cleanup.service.js';

export const songsRouter = Router();

const createSongSchema = z.object({
  title: z.string().trim().min(1).max(200),

  artist: z
    .string()
    .trim()
    .max(200)
    .optional()
    .transform((value) => {
      return value || undefined;
    }),

  midiOffsetMs: z.coerce
    .number()
    .int()
    .min(-5000)
    .max(5000)
    .default(0),
});

const songIdSchema = z.uuid();

const updateSongSynchronizationSchema = z.object({
  midiOffsetMs: z.coerce
    .number()
    .int()
    .min(-30000)
    .max(30000),

  midiTimeScale: z.coerce
    .number()
    .min(0.95)
    .max(1.05),
});

const syncedLyricWordSchema = z.object({
  id: z.string().trim().min(1).max(80),
  startSeconds: z.number().min(0).max(60 * 60 * 6),
  durationSeconds: z.number().min(0.02).max(30).optional(),
  noteId: z.string().trim().min(1).max(120).optional(),
  text: z.string().trim().min(1).max(120),
});

const updateSongLyricsSchema = z.object({
  lyrics: z
    .array(syncedLyricWordSchema)
    .max(5000)
    .transform((lyrics) =>
      lyrics
        .map((line) => ({
          ...line,
          text: line.text.trim(),
        }))
        .sort(
          (firstLine, secondLine) =>
            firstLine.startSeconds - secondLine.startSeconds,
        ),
    ),
  lyricsByTrackId: z
    .record(
      z.string().trim().min(1).max(120),
      z
        .array(syncedLyricWordSchema)
        .max(5000)
        .transform((lyrics) =>
          lyrics
            .map((line) => ({
              ...line,
              text: line.text.trim(),
            }))
            .sort(
              (firstLine, secondLine) =>
                firstLine.startSeconds - secondLine.startSeconds,
            ),
        ),
    )
    .optional(),
});

songsRouter.get(
  '/',
  async (_request, response) => {
    const songs = await listSongs();

    response.json(songs);
  },
);

songsRouter.get(
  '/:songId',
  async (request, response) => {
    const songId = songIdSchema.parse(
      request.params.songId,
    );

    const song = await getSong(songId);

    if (!song) {
      response.status(404).json({
        message: 'Canción no encontrada',
      });

      return;
    }

    response.json(song);
  },
);

songsRouter.post(
  '/',
  uploadSongFiles,

  async (request, response, next) => {
    const uploadedFiles =
      getUploadedFiles(request);

    try {
      const body = createSongSchema.parse(
        request.body,
      );

      const files = request.files as
        | Record<
            string,
            Express.Multer.File[]
          >
        | undefined;

      const audioFile =
        files?.audioFile?.[0];

      const midiFile =
        files?.midiFile?.[0];

      if (!audioFile || !midiFile) {
        await removeUploadedFiles(
          uploadedFiles,
        );

        response.status(400).json({
          message:
            'Debes adjuntar audioFile y midiFile',
        });

        return;
      }

      const song = await createSong({
        title: body.title,
        artist: body.artist,
        midiOffsetMs: body.midiOffsetMs,
        audioFile,
        midiFile,
      });

      response.status(201).json(song);
    } catch (error) {
      await removeUploadedFiles(
        uploadedFiles,
      );

      next(error);
    }
  },
);

songsRouter.delete(
  '/:songId',
  async (request, response, next) => {
    try {
      const songId = songIdSchema.parse(
        request.params.songId,
      );

      const deleted = await deleteSong(songId);

      if (!deleted) {
        response.status(404).json({
          message: 'Canción no encontrada',
        });

        return;
      }

      response.status(204).send();
    } catch (error) {
      next(error);
    }
  },
);

songsRouter.patch(
  '/:songId/synchronization',
  async (request, response, next) => {
    try {
      const songId = songIdSchema.parse(
        request.params.songId,
      );

      const body =
        updateSongSynchronizationSchema.parse(
          request.body,
        );

      const song =
        await updateSongSynchronization(
          songId,
          body,
        );

      if (!song) {
        response.status(404).json({
          message: 'Canción no encontrada',
        });

        return;
      }

      response.json(song);
    } catch (error) {
      next(error);
    }
  },
);

songsRouter.patch(
  '/:songId/lyrics',
  async (request, response, next) => {
    try {
      const songId = songIdSchema.parse(
        request.params.songId,
      );

      const body = updateSongLyricsSchema.parse(
        request.body,
      );

      const song = await updateSongLyrics(
        songId,
        body,
      );

      if (!song) {
        response.status(404).json({
          message: 'Canción no encontrada',
        });

        return;
      }

      response.json(song);
    } catch (error) {
      next(error);
    }
  },
);
