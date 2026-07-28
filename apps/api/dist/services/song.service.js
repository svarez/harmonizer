import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { mkdir, rename, rm, } from 'node:fs/promises';
import { SONGS_DIRECTORY, } from '../config/storage.js';
import { prisma, } from '../lib/prisma.js';
import { parseMidiFile, } from './midi.service.js';
import { notesFromJson, notesToJson, } from './note-json.service.js';
export async function createSong(input) {
    const songId = randomUUID();
    const songDirectory = path.join(SONGS_DIRECTORY, songId);
    const audioDestination = path.join(songDirectory, 'audio.mp3');
    const midiDestination = path.join(songDirectory, 'song.mid');
    const coverExtension = input.coverFile
        ? path.extname(input.coverFile.originalname).toLowerCase()
        : undefined;
    const coverFileName = coverExtension
        ? `cover${coverExtension}`
        : undefined;
    const coverDestination = coverFileName
        ? path.join(songDirectory, coverFileName)
        : undefined;
    const audioPath = path.posix.join('songs', songId, 'audio.mp3');
    const midiPath = path.posix.join('songs', songId, 'song.mid');
    const coverPath = coverFileName
        ? path.posix.join('songs', songId, coverFileName)
        : undefined;
    await mkdir(songDirectory, {
        recursive: true,
    });
    try {
        /*
         * Se analiza antes de almacenar la canción.
         * Un MIDI inválido no debe generar registros.
         */
        const parsedMidi = await parseMidiFile(input.midiFile.path);
        /*
         * Los archivos definitivos se guardan en storage.
         */
        await Promise.all([
            rename(input.audioFile.path, audioDestination),
            rename(input.midiFile.path, midiDestination),
            ...(input.coverFile && coverDestination
                ? [
                    rename(input.coverFile.path, coverDestination),
                ]
                : []),
        ]);
        /*
         * Metadatos y pistas se guardan en una única
         * operación anidada de Prisma.
         */
        const record = await prisma.song.create({
            data: {
                id: songId,
                title: input.title,
                artist: input.artist,
                audioPath,
                midiPath,
                coverPath,
                durationSeconds: parsedMidi.durationSeconds,
                midiOffsetMs: input.midiOffsetMs,
                midiTimeScale: 1,
                lyrics: [],
                tracks: {
                    create: parsedMidi.tracks.map((track, position) => ({
                        position,
                        name: track.name,
                        instrument: track.instrument,
                        minMidi: track.minMidi,
                        maxMidi: track.maxMidi,
                        notes: notesToJson(track.notes),
                    })),
                },
            },
            include: {
                tracks: {
                    orderBy: {
                        position: 'asc',
                    },
                },
            },
        });
        return databaseSongToSong(record);
    }
    catch (error) {
        /*
         * Si falla Prisma después de mover los archivos,
         * eliminamos tanto el posible registro como la carpeta.
         */
        await Promise.allSettled([
            prisma.song.delete({
                where: {
                    id: songId,
                },
            }),
            rm(songDirectory, {
                recursive: true,
                force: true,
            }),
            rm(input.audioFile.path, {
                force: true,
            }),
            rm(input.midiFile.path, {
                force: true,
            }),
            ...(input.coverFile
                ? [
                    rm(input.coverFile.path, {
                        force: true,
                    }),
                ]
                : []),
        ]);
        throw error;
    }
}
export async function listSongs() {
    const records = await prisma.song.findMany({
        orderBy: {
            title: 'asc',
        },
        select: {
            id: true,
            title: true,
            artist: true,
            audioPath: true,
            coverPath: true,
            durationSeconds: true,
            midiOffsetMs: true,
            midiTimeScale: true,
            createdAt: true,
            _count: {
                select: {
                    tracks: true,
                },
            },
        },
    });
    return records.map((record) => ({
        id: record.id,
        title: record.title,
        artist: record.artist ?? undefined,
        audioUrl: storagePathToPublicUrl(record.audioPath),
        coverUrl: record.coverPath
            ? storagePathToPublicUrl(record.coverPath)
            : undefined,
        durationSeconds: record.durationSeconds,
        midiOffsetMs: record.midiOffsetMs,
        midiTimeScale: record.midiTimeScale,
        trackCount: record._count.tracks,
        createdAt: record.createdAt.toISOString(),
    }));
}
export async function getSong(songId) {
    const record = await prisma.song.findUnique({
        where: {
            id: songId,
        },
        include: {
            tracks: {
                orderBy: {
                    position: 'asc',
                },
            },
        },
    });
    if (!record) {
        return null;
    }
    return databaseSongToSong(record);
}
export async function deleteSong(songId) {
    const existingSong = await prisma.song.findUnique({
        where: {
            id: songId,
        },
        select: {
            id: true,
        },
    });
    if (!existingSong) {
        return false;
    }
    await prisma.song.delete({
        where: {
            id: songId,
        },
    });
    await rm(path.join(SONGS_DIRECTORY, songId), {
        recursive: true,
        force: true,
    });
    return true;
}
export async function updateSongCover(songId, coverFile) {
    const existingSong = await prisma.song.findUnique({
        where: {
            id: songId,
        },
        select: {
            id: true,
            coverPath: true,
        },
    });
    if (!existingSong) {
        await rm(coverFile.path, {
            force: true,
        });
        return null;
    }
    const coverExtension = path
        .extname(coverFile.originalname)
        .toLowerCase();
    const coverFileName = `cover-${randomUUID()}${coverExtension}`;
    const songDirectory = path.join(SONGS_DIRECTORY, songId);
    const coverDestination = path.join(songDirectory, coverFileName);
    const coverPath = path.posix.join('songs', songId, coverFileName);
    await rename(coverFile.path, coverDestination);
    if (existingSong.coverPath &&
        existingSong.coverPath !== coverPath) {
        await rm(path.join(SONGS_DIRECTORY, '..', existingSong.coverPath), {
            force: true,
        });
    }
    const record = await prisma.song.update({
        where: {
            id: songId,
        },
        data: {
            coverPath,
        },
        include: {
            tracks: {
                orderBy: {
                    position: 'asc',
                },
            },
        },
    });
    return databaseSongToSong(record);
}
export async function updateSongSynchronization(songId, input) {
    const existingSong = await prisma.song.findUnique({
        where: {
            id: songId,
        },
        include: {
            tracks: {
                orderBy: {
                    position: 'asc',
                },
            },
        },
    });
    if (!existingSong) {
        return null;
    }
    const lyrics = resynchronizeLyrics(lyricsFromJson(existingSong.lyrics), {
        previousOffsetMs: existingSong.midiOffsetMs,
        previousTimeScale: existingSong.midiTimeScale,
        nextOffsetMs: input.midiOffsetMs,
        nextTimeScale: input.midiTimeScale,
    }, existingSong.tracks.flatMap((track) => notesFromJson(track.notes)));
    const lyricsByTrackId = Object.fromEntries(Object.entries(lyricsByTrackIdFromJson(existingSong.lyricsByTrackId)).map(([trackId, trackLyrics]) => [
        trackId,
        resynchronizeLyrics(trackLyrics, {
            previousOffsetMs: existingSong.midiOffsetMs,
            previousTimeScale: existingSong.midiTimeScale,
            nextOffsetMs: input.midiOffsetMs,
            nextTimeScale: input.midiTimeScale,
        }, notesFromJson(existingSong.tracks.find((track) => track.id === trackId)?.notes ?? [])),
    ]));
    const record = await prisma.song.update({
        where: {
            id: songId,
        },
        data: {
            midiOffsetMs: input.midiOffsetMs,
            midiTimeScale: input.midiTimeScale,
            lyrics: lyricsToJson(lyrics),
            lyricsByTrackId: lyricsByTrackIdToJson(lyricsByTrackId),
        },
        include: {
            tracks: {
                orderBy: {
                    position: 'asc',
                },
            },
        },
    });
    return databaseSongToSong(record);
}
export async function updateSongLyrics(songId, input) {
    const existingSong = await prisma.song.findUnique({
        where: {
            id: songId,
        },
        select: {
            id: true,
        },
    });
    if (!existingSong) {
        return null;
    }
    const record = await prisma.song.update({
        where: {
            id: songId,
        },
        data: {
            lyrics: lyricsToJson(input.lyrics),
            lyricsByTrackId: lyricsByTrackIdToJson(input.lyricsByTrackId ?? {}),
        },
        include: {
            tracks: {
                orderBy: {
                    position: 'asc',
                },
            },
        },
    });
    return databaseSongToSong(record);
}
function databaseSongToSong(record) {
    return {
        id: record.id,
        title: record.title,
        artist: record.artist ?? undefined,
        audioUrl: storagePathToPublicUrl(record.audioPath),
        coverUrl: record.coverPath
            ? storagePathToPublicUrl(record.coverPath)
            : undefined,
        durationSeconds: record.durationSeconds,
        midiOffsetMs: record.midiOffsetMs,
        midiTimeScale: record.midiTimeScale,
        lyrics: lyricsFromJson(record.lyrics),
        lyricsByTrackId: lyricsByTrackIdFromJson(record.lyricsByTrackId),
        createdAt: record.createdAt.toISOString(),
        tracks: record.tracks.map((track) => ({
            id: track.id,
            name: track.name,
            instrument: track.instrument ?? undefined,
            minMidi: track.minMidi,
            maxMidi: track.maxMidi,
            notes: notesFromJson(track.notes),
        })),
    };
}
function lyricsToJson(lyrics) {
    return lyrics.map((line) => ({
        id: line.id,
        startSeconds: line.startSeconds,
        durationSeconds: line.durationSeconds,
        noteId: line.noteId,
        text: line.text,
    }));
}
function roundSeconds(seconds) {
    return Number(seconds.toFixed(3));
}
function resynchronizeLyrics(lyrics, change, notes = []) {
    if (lyrics.length === 0 ||
        change.previousOffsetMs === change.nextOffsetMs &&
            change.previousTimeScale === change.nextTimeScale) {
        return lyrics;
    }
    const previousOffsetSeconds = change.previousOffsetMs / 1000;
    const nextOffsetSeconds = change.nextOffsetMs / 1000;
    const previousTimeScale = change.previousTimeScale || 1;
    const durationScale = change.nextTimeScale / previousTimeScale;
    const notesById = new Map(notes.map((note) => [note.id, note]));
    return lyrics
        .map((line) => {
        const note = line.noteId
            ? notesById.get(line.noteId)
            : undefined;
        const oldNoteStartSeconds = note
            ? note.startSeconds * previousTimeScale +
                previousOffsetSeconds
            : undefined;
        const oldNoteDurationSeconds = note
            ? note.durationSeconds * previousTimeScale
            : undefined;
        const newNoteStartSeconds = note
            ? note.startSeconds * change.nextTimeScale +
                nextOffsetSeconds
            : undefined;
        const startSeconds = note &&
            oldNoteStartSeconds !== undefined &&
            oldNoteDurationSeconds !== undefined &&
            oldNoteDurationSeconds > 0 &&
            newNoteStartSeconds !== undefined
            ? roundSeconds(Math.max(newNoteStartSeconds +
                (line.startSeconds - oldNoteStartSeconds) *
                    durationScale, 0))
            : roundSeconds(Math.max(((line.startSeconds - previousOffsetSeconds) /
                previousTimeScale) *
                change.nextTimeScale +
                nextOffsetSeconds, 0));
        return {
            ...line,
            startSeconds,
            durationSeconds: line.durationSeconds === undefined
                ? undefined
                : roundSeconds(Math.max(line.durationSeconds * durationScale, 0.02)),
        };
    })
        .sort((firstLine, secondLine) => firstLine.startSeconds - secondLine.startSeconds);
}
function lyricsByTrackIdToJson(lyricsByTrackId) {
    return Object.fromEntries(Object.entries(lyricsByTrackId).map(([trackId, lyrics]) => [
        trackId,
        lyricsToJson(lyrics),
    ]));
}
function lyricsFromJson(lyrics) {
    if (!Array.isArray(lyrics)) {
        return [];
    }
    return lyrics
        .map((line, index) => {
        if (!line ||
            typeof line !== 'object' ||
            Array.isArray(line)) {
            return null;
        }
        const value = line;
        const startSeconds = Number(value.startSeconds);
        const text = typeof value.text === 'string'
            ? value.text.trim()
            : '';
        const durationSeconds = Number(value.durationSeconds);
        if (!Number.isFinite(startSeconds) || !text) {
            return null;
        }
        const lyricWord = {
            id: typeof value.id === 'string' && value.id
                ? value.id
                : `lyric-${index}`,
            startSeconds,
            text,
        };
        if (Number.isFinite(durationSeconds)) {
            lyricWord.durationSeconds = durationSeconds;
        }
        if (typeof value.noteId === 'string' &&
            value.noteId) {
            lyricWord.noteId = value.noteId;
        }
        return lyricWord;
    })
        .filter((line) => Boolean(line))
        .sort((firstLine, secondLine) => firstLine.startSeconds - secondLine.startSeconds);
}
function lyricsByTrackIdFromJson(lyricsByTrackId) {
    if (!lyricsByTrackId ||
        typeof lyricsByTrackId !== 'object' ||
        Array.isArray(lyricsByTrackId)) {
        return {};
    }
    return Object.fromEntries(Object.entries(lyricsByTrackId)
        .flatMap(([trackId, lyrics]) => {
        const syncedLyrics = lyricsFromJson(lyrics);
        return syncedLyrics.length > 0
            ? [[trackId, syncedLyrics]]
            : [];
    }));
}
function storagePathToPublicUrl(storagePath) {
    const normalizedPath = storagePath.replaceAll('\\', '/');
    return `/media/${normalizedPath}`;
}
