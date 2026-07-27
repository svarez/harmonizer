import path from 'node:path';
import { randomUUID } from 'node:crypto';

import {
  mkdir,
  rename,
  rm,
} from 'node:fs/promises';

import type {
  Song,
  SongSummary,
} from '@harmonizer/shared';

import type {
  Prisma,
} from '../generated/prisma/client.js';

import {
  SONGS_DIRECTORY,
} from '../config/storage.js';

import {
  prisma,
} from '../lib/prisma.js';

import {
  parseMidiFile,
} from './midi.service.js';

import {
  notesFromJson,
  notesToJson,
} from './note-json.service.js';

interface CreateSongInput {
  title: string;
  artist?: string;
  midiOffsetMs: number;
  audioFile: Express.Multer.File;
  midiFile: Express.Multer.File;
}

type SongWithTracks =
  Prisma.SongGetPayload<{
    include: {
      tracks: true;
    };
  }>;

export async function createSong(
  input: CreateSongInput,
): Promise<Song> {
  const songId = randomUUID();

  const songDirectory = path.join(
    SONGS_DIRECTORY,
    songId,
  );

  const audioDestination = path.join(
    songDirectory,
    'audio.mp3',
  );

  const midiDestination = path.join(
    songDirectory,
    'song.mid',
  );

  const audioPath = path.posix.join(
    'songs',
    songId,
    'audio.mp3',
  );

  const midiPath = path.posix.join(
    'songs',
    songId,
    'song.mid',
  );

  await mkdir(songDirectory, {
    recursive: true,
  });

  try {
    /*
     * Se analiza antes de almacenar la canción.
     * Un MIDI inválido no debe generar registros.
     */
    const parsedMidi = await parseMidiFile(
      input.midiFile.path,
    );

    /*
     * Los archivos definitivos se guardan en storage.
     */
    await Promise.all([
      rename(
        input.audioFile.path,
        audioDestination,
      ),

      rename(
        input.midiFile.path,
        midiDestination,
      ),
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

        durationSeconds:
          parsedMidi.durationSeconds,

        midiOffsetMs:
          input.midiOffsetMs,

        tracks: {
          create: parsedMidi.tracks.map(
            (track, position) => ({
              position,
              name: track.name,
              instrument:
                track.instrument,

              minMidi: track.minMidi,
              maxMidi: track.maxMidi,

              notes: notesToJson(
                track.notes,
              ),
            }),
          ),
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
  } catch (error) {
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

export async function listSongs(): Promise<
  SongSummary[]
> {
  const records =
    await prisma.song.findMany({
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
    artist:
      record.artist ?? undefined,

    audioUrl:
      storagePathToPublicUrl(
        record.audioPath,
      ),

    durationSeconds:
      record.durationSeconds,

    midiOffsetMs:
      record.midiOffsetMs,

    trackCount:
      record._count.tracks,

    createdAt:
      record.createdAt.toISOString(),
  }));
}

export async function getSong(
  songId: string,
): Promise<Song | null> {
  const record =
    await prisma.song.findUnique({
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

function databaseSongToSong(
  record: SongWithTracks,
): Song {
  return {
    id: record.id,
    title: record.title,
    artist:
      record.artist ?? undefined,

    audioUrl:
      storagePathToPublicUrl(
        record.audioPath,
      ),

    durationSeconds:
      record.durationSeconds,

    midiOffsetMs:
      record.midiOffsetMs,

    createdAt:
      record.createdAt.toISOString(),

    tracks: record.tracks.map(
      (track) => ({
        id: track.id,
        name: track.name,
        instrument:
          track.instrument ?? undefined,

        minMidi: track.minMidi,
        maxMidi: track.maxMidi,

        notes: notesFromJson(
          track.notes,
        ),
      }),
    ),
  };
}

function storagePathToPublicUrl(
  storagePath: string,
): string {
  const normalizedPath =
    storagePath.replaceAll('\\', '/');

  return `/media/${normalizedPath}`;
}