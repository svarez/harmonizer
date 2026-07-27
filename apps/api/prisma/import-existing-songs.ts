import path from 'node:path';

import {
  readFile,
  readdir,
} from 'node:fs/promises';

import type {
  Song,
} from '@harmonizer/shared';

import {
  SONGS_DIRECTORY,
} from '../src/config/storage.js';

import {
  prisma,
} from '../src/lib/prisma.js';

import {
  notesToJson,
} from '../src/services/note-json.service.js';

async function importExistingSongs(): Promise<void> {
  const entries = await readdir(
    SONGS_DIRECTORY,
    {
      withFileTypes: true,
    },
  );

  let importedSongs = 0;
  let skippedSongs = 0;

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const metadataPath = path.join(
      SONGS_DIRECTORY,
      entry.name,
      'song.json',
    );

    let song: Song;

    try {
      const contents = await readFile(
        metadataPath,
        'utf8',
      );

      song = JSON.parse(contents) as Song;
    } catch {
      console.log(
        `Ignorada ${entry.name}: no contiene song.json`,
      );

      skippedSongs += 1;
      continue;
    }

    const songId = song.id || entry.name;

    const existingSong =
      await prisma.song.findUnique({
        where: {
          id: songId,
        },

        select: {
          id: true,
        },
      });

    if (existingSong) {
      console.log(
        `Ignorada ${song.title}: ya existe en Prisma`,
      );

      skippedSongs += 1;
      continue;
    }

    const createdAt =
      song.createdAt &&
      !Number.isNaN(
        Date.parse(song.createdAt),
      )
        ? new Date(song.createdAt)
        : new Date();

    await prisma.song.create({
      data: {
        id: songId,
        title: song.title,
        artist: song.artist,

        audioPath: path.posix.join(
          'songs',
          entry.name,
          'audio.mp3',
        ),

        midiPath: path.posix.join(
          'songs',
          entry.name,
          'song.mid',
        ),

        durationSeconds:
          song.durationSeconds,

        midiOffsetMs:
          song.midiOffsetMs,

        createdAt,

        tracks: {
          create: song.tracks.map(
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
    });

    importedSongs += 1;

    console.log(
      `Importada: ${song.title}`,
    );
  }

  console.log('');
  console.log(
    `Importación terminada: ${importedSongs} importadas, ${skippedSongs} ignoradas`,
  );
}

importExistingSongs()
  .catch((error: unknown) => {
    console.error(
      'Error importando canciones',
      error,
    );

    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });