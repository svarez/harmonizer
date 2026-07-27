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
    const audioPath = path.posix.join('songs', songId, 'audio.mp3');
    const midiPath = path.posix.join('songs', songId, 'song.mid');
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
export async function updateSongSynchronization(songId, input) {
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
            midiOffsetMs: input.midiOffsetMs,
            midiTimeScale: input.midiTimeScale,
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
        durationSeconds: record.durationSeconds,
        midiOffsetMs: record.midiOffsetMs,
        midiTimeScale: record.midiTimeScale,
        lyrics: lyricsFromJson(record.lyrics),
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
function storagePathToPublicUrl(storagePath) {
    const normalizedPath = storagePath.replaceAll('\\', '/');
    return `/media/${normalizedPath}`;
}
