import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, rename, rm, writeFile, } from 'node:fs/promises';
import { SONGS_DIRECTORY } from '../config/storage.js';
import { parseMidiFile } from './midi.service.js';
export async function createSong(input) {
    const songId = randomUUID();
    const songDirectory = path.join(SONGS_DIRECTORY, songId);
    await mkdir(songDirectory, {
        recursive: true,
    });
    const audioDestination = path.join(songDirectory, 'audio.mp3');
    const midiDestination = path.join(songDirectory, 'song.mid');
    try {
        /*
         * Analizamos el MIDI antes de moverlo.
         * Si el archivo es inválido, no se crea la canción.
         */
        const parsedMidi = await parseMidiFile(input.midiFile.path);
        await Promise.all([
            rename(input.audioFile.path, audioDestination),
            rename(input.midiFile.path, midiDestination),
        ]);
        const song = {
            id: songId,
            title: input.title,
            artist: input.artist || undefined,
            audioUrl: `/media/songs/${songId}/audio.mp3`,
            durationSeconds: parsedMidi.durationSeconds,
            detectedMidiInitialSilenceMs: Math.round(parsedMidi.detectedInitialSilenceSeconds * 1000),
            midiOffsetMs: input.midiOffsetMs,
            tracks: parsedMidi.tracks,
            createdAt: new Date().toISOString(),
        };
        await writeFile(path.join(songDirectory, 'song.json'), JSON.stringify(song, null, 2), 'utf8');
        return song;
    }
    catch (error) {
        await Promise.allSettled([
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
    const entries = await readdir(SONGS_DIRECTORY, {
        withFileTypes: true,
    });
    const songs = await Promise.all(entries
        .filter((entry) => entry.isDirectory())
        .map((entry) => readSongFile(entry.name)));
    return songs
        .map(songToSummary)
        .sort((firstSong, secondSong) => {
        return firstSong.title.localeCompare(secondSong.title);
    });
}
export async function getSong(songId) {
    try {
        return await readSongFile(songId);
    }
    catch (error) {
        if (error instanceof Error &&
            'code' in error &&
            error.code === 'ENOENT') {
            return null;
        }
        throw error;
    }
}
async function readSongFile(songId) {
    const metadataPath = path.join(SONGS_DIRECTORY, songId, 'song.json');
    const contents = await readFile(metadataPath, 'utf8');
    return normalizeLegacySongTiming(JSON.parse(contents));
}
function getFirstNoteStartSeconds(notes) {
    return notes.reduce((earliestStartSeconds, note) => Math.min(earliestStartSeconds, note.startSeconds), Number.POSITIVE_INFINITY);
}
function normalizeLegacySongTiming(song) {
    if (song.detectedMidiInitialSilenceMs !==
        undefined ||
        song.midiOffsetMs !== 0) {
        return song;
    }
    const detectedInitialSilenceSeconds = song.tracks.reduce((earliestStartSeconds, track) => Math.min(earliestStartSeconds, getFirstNoteStartSeconds(track.notes)), Number.POSITIVE_INFINITY);
    if (!Number.isFinite(detectedInitialSilenceSeconds) ||
        detectedInitialSilenceSeconds <= 0) {
        return {
            ...song,
            detectedMidiInitialSilenceMs: 0,
        };
    }
    return {
        ...song,
        durationSeconds: Math.max(song.durationSeconds -
            detectedInitialSilenceSeconds, 0),
        detectedMidiInitialSilenceMs: Math.round(detectedInitialSilenceSeconds * 1000),
        tracks: song.tracks.map((track) => ({
            ...track,
            notes: track.notes.map((note) => {
                const startSeconds = Math.max(note.startSeconds -
                    detectedInitialSilenceSeconds, 0);
                return {
                    ...note,
                    startSeconds,
                    endSeconds: startSeconds + note.durationSeconds,
                };
            }),
        })),
    };
}
function songToSummary(song) {
    return {
        id: song.id,
        title: song.title,
        artist: song.artist,
        audioUrl: song.audioUrl,
        durationSeconds: song.durationSeconds,
        detectedMidiInitialSilenceMs: song.detectedMidiInitialSilenceMs,
        midiOffsetMs: song.midiOffsetMs,
        trackCount: song.tracks.length,
        createdAt: song.createdAt,
    };
}
