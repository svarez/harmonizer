import { Router } from 'express';
import { z } from 'zod';
import { uploadSongFiles } from '../config/upload.js';
import { createSong, getSong, listSongs, } from '../services/song.service.js';
import { getUploadedFiles, removeUploadedFiles, } from '../services/upload-cleanup.service.js';
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
songsRouter.get('/', async (_request, response) => {
    const songs = await listSongs();
    response.json(songs);
});
songsRouter.get('/:songId', async (request, response) => {
    const songId = songIdSchema.parse(request.params.songId);
    const song = await getSong(songId);
    if (!song) {
        response.status(404).json({
            message: 'Canción no encontrada',
        });
        return;
    }
    response.json(song);
});
songsRouter.post('/', uploadSongFiles, async (request, response, next) => {
    const uploadedFiles = getUploadedFiles(request);
    try {
        const body = createSongSchema.parse(request.body);
        const files = request.files;
        const audioFile = files?.audioFile?.[0];
        const midiFile = files?.midiFile?.[0];
        if (!audioFile || !midiFile) {
            await removeUploadedFiles(uploadedFiles);
            response.status(400).json({
                message: 'Debes adjuntar audioFile y midiFile',
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
    }
    catch (error) {
        await removeUploadedFiles(uploadedFiles);
        next(error);
    }
});
