import {
  Alert,
  Button,
  Checkbox,
  Container,
  Group,
  NumberInput,
  Paper,
  ScrollArea,
  Slider,
  Stack,
  Text,
  Textarea,
  TextInput,
  Title,
} from '@mantine/core';

import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { PointerEvent } from 'react';

import type {
  NoteEvent,
  Song,
  SongTrack,
  SyncedLyricWord,
} from '@harmonizer/shared';

import { updateSongLyrics } from '../../api/songsApi';
import { formatTime } from '../practice/musicUtils';

interface LyricsSynchronizationPageProps {
  song: Song;
  onBack: (song: Song) => void;
}

interface LyricsTimelineProps {
  currentTime: number;
  durationSeconds: number;
  lyrics: SyncedLyricWord[];
  midiOffsetMs: number;
  midiTimeScale: number;
  pixelsPerSecond: number;
  selectedLineId: string | null;
  vocalTracks: SongTrack[];
  onMoveLine: (
    lineId: string,
    startSeconds: number,
  ) => void;
  onSelectLine: (lineId: string) => void;
}

const PLAYHEAD_POSITION = 0.36;
const TIME_MARK_INTERVAL_SECONDS = 5;

function clamp(
  value: number,
  min: number,
  max: number,
): number {
  return Math.min(Math.max(value, min), max);
}

function parseLrcTimestamp(
  timestamp: string,
): number | null {
  const match = timestamp.match(
    /^(\d{1,2}):(\d{2})(?:[.:](\d{1,3}))?$/,
  );

  if (!match) {
    return null;
  }

  const minutes = Number(match[1]);
  const seconds = Number(match[2]);
  const fraction = match[3] ?? '0';

  if (seconds >= 60) {
    return null;
  }

  return (
    minutes * 60 +
    seconds +
    Number(fraction.padEnd(3, '0').slice(0, 3)) / 1000
  );
}

function wordsFromDraft(
  draft: string,
  notes: NoteEvent[],
  durationSeconds: number,
): SyncedLyricWord[] {
  const words = draft
    .replace(/\[[^\]]+\]/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  return fitWordsToNotes(
    words,
    notes,
    durationSeconds,
  );
}

function fitWordsToNotes(
  words: string[],
  notes: NoteEvent[],
  durationSeconds: number,
): SyncedLyricWord[] {
  const orderedNotes = notes
    .filter((note) => note.durationSeconds > 0)
    .sort(
      (firstNote, secondNote) =>
        firstNote.startSeconds - secondNote.startSeconds,
  );
  const firstNote = orderedNotes[0];
  const fallbackDuration = Math.max(durationSeconds, 1);

  if (words.length === 0) {
    return [];
  }

  if (!firstNote) {
    const step = fallbackDuration / words.length;

    return words.map((word, wordIndex) => ({
      id: `word-${wordIndex}-${word.slice(0, 18)}`,
      startSeconds: Number((wordIndex * step).toFixed(3)),
      durationSeconds: Number(
        Math.max(step * 0.85, 0.12).toFixed(3),
      ),
      text: word,
    }));
  }

  return distributeWordsAcrossNotes(words, orderedNotes);
}

function distributeWordsAcrossNotes(
  words: string[],
  notes: NoteEvent[],
): SyncedLyricWord[] {
  const orderedNotes = notes
    .filter((note) => note.durationSeconds > 0)
    .sort(
      (firstNote, secondNote) =>
        firstNote.startSeconds - secondNote.startSeconds,
    );

  if (words.length === 0) {
    return [];
  }

  if (orderedNotes.length === 0) {
    return words.map((word, wordIndex) => ({
      id: `word-${wordIndex}-${word.slice(0, 18)}`,
      startSeconds: wordIndex * 0.45,
      durationSeconds: 0.35,
      text: word,
    }));
  }

  const noteWordGroups = new Map<number, number[]>();

  words.forEach((_word, wordIndex) => {
    const noteIndex =
      words.length === 1
        ? 0
        : Math.round(
            (wordIndex * (orderedNotes.length - 1)) /
              (words.length - 1),
          );
    const group = noteWordGroups.get(noteIndex) ?? [];

    group.push(wordIndex);
    noteWordGroups.set(noteIndex, group);
  });

  return words.map((word, wordIndex) => {
    const noteIndex =
      words.length === 1
        ? 0
        : Math.round(
            (wordIndex * (orderedNotes.length - 1)) /
              (words.length - 1),
          );
    const note = orderedNotes[noteIndex];
    const group = noteWordGroups.get(noteIndex) ?? [wordIndex];
    const positionInNote = Math.max(group.indexOf(wordIndex), 0);
    const wordDuration = note.durationSeconds / group.length;

    return {
      id: `word-${wordIndex}-${word.slice(0, 18)}`,
      startSeconds: Number(
        (note.startSeconds + positionInNote * wordDuration).toFixed(3),
      ),
      durationSeconds: Number(
        Math.max(wordDuration * 0.9, 0.05).toFixed(3),
      ),
      noteId: note.id,
      text: word,
    };
  });
}

function wordsFromCurrentLyrics(
  lyrics: SyncedLyricWord[],
): string[] {
  return lyrics.map((word) => word.text);
}

function lrcTimestampFromDraft(
  draft: string,
): number | null {
  const timestamp = draft.match(/\[([0-9:.]+)\]/);

  return timestamp ? parseLrcTimestamp(timestamp[1]) : null;
}

function applyInitialTimestamp(
  lyrics: SyncedLyricWord[],
  startSeconds: number | null,
): SyncedLyricWord[] {
  if (startSeconds === null || lyrics.length === 0) {
    return lyrics;
  }

  const deltaSeconds =
    startSeconds - lyrics[0].startSeconds;

  return lyrics.map((word) => ({
    ...word,
    startSeconds: Number(
      Math.max(word.startSeconds + deltaSeconds, 0).toFixed(3),
    ),
  }));
}

function wordsFromDraftWithOptionalTimestamp(
  draft: string,
  notes: NoteEvent[],
  durationSeconds: number,
): SyncedLyricWord[] {
  return applyInitialTimestamp(
    wordsFromDraft(draft, notes, durationSeconds),
    lrcTimestampFromDraft(draft),
  ).sort(
    (firstLine, secondLine) =>
      firstLine.startSeconds - secondLine.startSeconds,
  );
}

function fitExistingLyricsToNotes(
  lyrics: SyncedLyricWord[],
  notes: NoteEvent[],
  durationSeconds: number,
): SyncedLyricWord[] {
  const fittedWords = fitWordsToNotes(
    wordsFromCurrentLyrics(lyrics),
    notes,
    durationSeconds,
  );

  return fittedWords.map((word, wordIndex) => {
    const existingWord = lyrics[wordIndex];

    if (!existingWord) {
      return {
        ...word,
      };
    }

    return {
      ...word,
      id: existingWord.id,
      text: existingWord.text,
    };
  });
}

function getNearestNoteIndex(
  notes: NoteEvent[],
  startSeconds: number,
): number {
  return notes.reduce(
    (nearestIndex, note, noteIndex) => {
      const nearestDistance = Math.abs(
        notes[nearestIndex].startSeconds - startSeconds,
      );
      const noteDistance = Math.abs(
        note.startSeconds - startSeconds,
      );

      return noteDistance < nearestDistance
        ? noteIndex
        : nearestIndex;
    },
    0,
  );
}

function fitLyricsToNotesWithAnchor(
  lyrics: SyncedLyricWord[],
  notes: NoteEvent[],
  anchorWordId: string,
  targetStartSeconds: number,
): SyncedLyricWord[] {
  const orderedNotes = notes
    .filter((note) => note.durationSeconds > 0)
    .sort(
      (firstNote, secondNote) =>
        firstNote.startSeconds - secondNote.startSeconds,
    );
  const anchorWordIndex = lyrics.findIndex(
    (word) => word.id === anchorWordId,
  );

  if (orderedNotes.length === 0 || anchorWordIndex === -1) {
    return lyrics.map((word) =>
      word.id === anchorWordId
        ? {
            ...word,
            startSeconds: targetStartSeconds,
            noteId: undefined,
          }
        : word,
    );
  }

  const anchorNoteIndex = getNearestNoteIndex(
    orderedNotes,
    targetStartSeconds,
  );
  const noteIndexes = lyrics.map((word, wordIndex) => {
    if (wordIndex < anchorWordIndex) {
      const existingNoteIndex =
        word.noteId
          ? orderedNotes.findIndex(
              (note) => note.id === word.noteId,
            )
          : -1;

      return Math.max(existingNoteIndex, 0);
    }

    const remainingWordCount =
      lyrics.length - anchorWordIndex - 1;
    const remainingNoteCount =
      orderedNotes.length - anchorNoteIndex - 1;

    return remainingWordCount === 0
      ? anchorNoteIndex
      : anchorNoteIndex +
          Math.round(
            ((wordIndex - anchorWordIndex) *
              remainingNoteCount) /
              remainingWordCount,
          );
  });
  const noteGroups = new Map<number, number[]>();

  noteIndexes.forEach((noteIndex, wordIndex) => {
    if (wordIndex < anchorWordIndex) {
      return;
    }

    const group = noteGroups.get(noteIndex) ?? [];

    group.push(wordIndex);
    noteGroups.set(noteIndex, group);
  });

  return lyrics.map((word, wordIndex) => {
      if (wordIndex < anchorWordIndex) {
        return word;
      }

      const noteIndex = noteIndexes[wordIndex];
      const note = orderedNotes[noteIndex];
      const group = noteGroups.get(noteIndex) ?? [wordIndex];
      const positionInNote = Math.max(group.indexOf(wordIndex), 0);
      const wordDuration = note.durationSeconds / group.length;

      return {
        ...word,
        startSeconds: Number(
          (note.startSeconds + positionInNote * wordDuration).toFixed(3),
        ),
        durationSeconds: Number(
          Math.max(wordDuration * 0.9, 0.05).toFixed(3),
        ),
        noteId: note.id,
      };
    });
}

function extendLyricsThroughEmptyNotes(
  lyrics: SyncedLyricWord[],
  notes: NoteEvent[],
): SyncedLyricWord[] {
  const orderedLyrics = [...lyrics].sort(
    (firstWord, secondWord) =>
      firstWord.startSeconds - secondWord.startSeconds,
  );
  const orderedNotes = notes
    .filter((note) => note.durationSeconds > 0)
    .sort(
      (firstNote, secondNote) =>
        firstNote.startSeconds - secondNote.startSeconds,
    );
  const lastNoteEnd = orderedNotes.at(-1)?.endSeconds;

  if (orderedLyrics.length === 0 || !lastNoteEnd) {
    return lyrics;
  }

  return orderedLyrics.map((word, wordIndex) => {
    const nextWord = orderedLyrics[wordIndex + 1];
    const endSeconds =
      nextWord?.startSeconds ?? lastNoteEnd;

    if (endSeconds <= word.startSeconds) {
      return word;
    }

    return {
      ...word,
      durationSeconds: Number(
        Math.max(endSeconds - word.startSeconds, 0.05).toFixed(3),
      ),
    };
  });
}

function getActiveLineIndex(
  lyrics: SyncedLyricWord[],
  currentTime: number,
): number {
  const activeIndex = lyrics.findLastIndex(
    (line) => currentTime >= line.startSeconds,
  );

  return activeIndex >= 0 ? activeIndex : 0;
}

function isLikelyVocalTrack(
  track: SongTrack,
): boolean {
  const description = `${track.name} ${track.instrument ?? ''}`
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '');

  return [
    'voice',
    'vocal',
    'vox',
    'lead',
    'melody',
    'melodia',
    'singer',
    'sing',
    'choir',
    'coro',
    'voz',
  ].some((term) => description.includes(term));
}

function getVocalTracks(song: Song): SongTrack[] {
  const vocalTracks = song.tracks.filter(isLikelyVocalTrack);

  if (vocalTracks.length > 0) {
    return vocalTracks;
  }

  return song.tracks
    .filter((track) => track.notes.length > 0)
    .slice(0, 2);
}

function getTrackNotes(
  tracks: SongTrack[],
): NoteEvent[] {
  return tracks.flatMap((track) => track.notes);
}

function getAdjustedTrackNotes(
  tracks: SongTrack[],
  song: Song,
): NoteEvent[] {
  const offsetSeconds = song.midiOffsetMs / 1000;

  return getTrackNotes(tracks).map((note) => {
    const startSeconds =
      note.startSeconds * song.midiTimeScale +
      offsetSeconds;
    const durationSeconds =
      note.durationSeconds * song.midiTimeScale;

    return {
      ...note,
      startSeconds,
      durationSeconds,
      endSeconds: startSeconds + durationSeconds,
    };
  });
}

function LyricsTimeline({
  currentTime,
  durationSeconds,
  lyrics,
  midiOffsetMs,
  midiTimeScale,
  pixelsPerSecond,
  selectedLineId,
  vocalTracks,
  onMoveLine,
  onSelectLine,
}: LyricsTimelineProps) {
  const canvasRef =
    useRef<HTMLCanvasElement | null>(null);
  const dragRef = useRef<{
    lineId: string;
    pointerStartX: number;
    lineStartSeconds: number;
  } | null>(null);
  const layoutRef = useRef<{
    blocks: Array<{
      lineId: string;
      x: number;
      y: number;
      width: number;
      height: number;
      startSeconds: number;
    }>;
  }>({
    blocks: [],
  });

  useEffect(() => {
    const canvas = canvasRef.current;

    if (!canvas) {
      return;
    }

    const context = canvas.getContext('2d');

    if (!context) {
      return;
    }

    let animationFrameId = 0;
    let canvasWidth = 0;
    let canvasHeight = 0;

    const resizeCanvas = () => {
      const bounds = canvas.getBoundingClientRect();
      const pixelRatio = window.devicePixelRatio || 1;

      canvasWidth = bounds.width;
      canvasHeight = bounds.height;
      canvas.width = Math.floor(bounds.width * pixelRatio);
      canvas.height = Math.floor(bounds.height * pixelRatio);

      context.setTransform(
        pixelRatio,
        0,
        0,
        pixelRatio,
        0,
        0,
      );
    };

    const resizeObserver = new ResizeObserver(resizeCanvas);
    resizeObserver.observe(canvas);
    resizeCanvas();

    const draw = () => {
      context.clearRect(0, 0, canvasWidth, canvasHeight);
      context.fillStyle = '#101114';
      context.fillRect(0, 0, canvasWidth, canvasHeight);

      const playheadX = canvasWidth * PLAYHEAD_POSITION;
      const firstVisibleTime =
        currentTime - playheadX / pixelsPerSecond;
      const lastVisibleTime =
        currentTime +
        (canvasWidth - playheadX) / pixelsPerSecond;

      const firstMark =
        Math.ceil(
          firstVisibleTime / TIME_MARK_INTERVAL_SECONDS,
        ) * TIME_MARK_INTERVAL_SECONDS;

      context.font = '11px Inter, sans-serif';
      context.textBaseline = 'top';

      for (
        let time = firstMark;
        time <= lastVisibleTime;
        time += TIME_MARK_INTERVAL_SECONDS
      ) {
        if (time < 0) {
          continue;
        }

        const x =
          playheadX +
          (time - currentTime) * pixelsPerSecond;

        context.strokeStyle = '#31343b';
        context.lineWidth = 1;
        context.beginPath();
        context.moveTo(x, 0);
        context.lineTo(x, canvasHeight);
        context.stroke();

        context.fillStyle = '#92939a';
        context.fillText(formatTime(time), x + 6, 10);
      }

      const midiTop = 48;
      const midiHeight = 132;

      context.fillStyle = '#0f1116';
      context.fillRect(0, midiTop, canvasWidth, midiHeight);
      context.fillStyle = '#d4d4d8';
      context.font = '12px Inter, sans-serif';
      context.fillText('MIDI VOCAL', 18, midiTop + 12);

      context.fillStyle = '#92939a';
      context.font = '11px Inter, sans-serif';
      context.fillText(
        vocalTracks.length > 0
          ? vocalTracks
              .map((track) => track.name)
              .slice(0, 3)
              .join(' / ')
          : 'Selecciona una pista vocal abajo',
        104,
        midiTop + 12,
        260,
      );

      const vocalNotes = getTrackNotes(vocalTracks);
      const minMidi = Math.min(
        ...vocalNotes.map((note) => note.midi),
        48,
      );
      const maxMidi = Math.max(
        ...vocalNotes.map((note) => note.midi),
        72,
      );
      const pitchCount = Math.max(maxMidi - minMidi + 1, 1);
      const noteTop = midiTop + 40;
      const noteHeight = Math.max(midiHeight - 54, 24);

      context.strokeStyle = '#27272a';
      context.lineWidth = 1;

      for (
        let midi = minMidi;
        midi <= maxMidi;
        midi += 12
      ) {
        const y =
          noteTop +
          ((maxMidi - midi) / pitchCount) * noteHeight;

        context.beginPath();
        context.moveTo(0, y);
        context.lineTo(canvasWidth, y);
        context.stroke();
      }

      vocalTracks.forEach((track, trackIndex) => {
        const trackColor =
          trackIndex % 2 === 0 ? '#a78bfa' : '#22c1c8';

        track.notes.forEach((note) => {
          const adjustedStartSeconds =
            note.startSeconds * midiTimeScale +
            midiOffsetMs / 1000;
          const adjustedDurationSeconds =
            note.durationSeconds * midiTimeScale;
          const x =
            playheadX +
            (adjustedStartSeconds - currentTime) *
              pixelsPerSecond;
          const width = Math.max(
            adjustedDurationSeconds * pixelsPerSecond,
            3,
          );

          if (x + width < 0 || x > canvasWidth) {
            return;
          }

          const y =
            noteTop +
            ((maxMidi - note.midi) / pitchCount) *
              noteHeight;

          context.fillStyle = trackColor;
          context.globalAlpha = 0.78;
          context.beginPath();
          context.roundRect(x, y, width, 7, 3);
          context.fill();
          context.globalAlpha = 1;
        });
      });

      const lyricTop = 206;
      const lyricHeight = 78;
      const blocks: typeof layoutRef.current.blocks = [];

      context.fillStyle = '#18191e';
      context.fillRect(0, lyricTop, canvasWidth, lyricHeight);
      context.fillStyle = '#d4d4d8';
      context.font = '12px Inter, sans-serif';
      context.fillText('LETRAS', 18, lyricTop + 10);

      lyrics.forEach((line, index) => {
        const nextLine = lyrics[index + 1];
        const blockEnd =
          line.durationSeconds
            ? line.startSeconds + line.durationSeconds
            : nextLine?.startSeconds ??
              Math.min(line.startSeconds + 0.45, durationSeconds);
        const x =
          playheadX +
          (line.startSeconds - currentTime) *
            pixelsPerSecond;
        const width = Math.max(
          (blockEnd - line.startSeconds) *
            pixelsPerSecond,
          14,
        );

        if (x + width < 0 || x > canvasWidth) {
          return;
        }

        const y = lyricTop + 28;
        const height = 38;
        const selected = line.id === selectedLineId;
        context.fillStyle = selected
          ? '#315df7'
          : '#2a2d35';
        context.beginPath();
        context.roundRect(x, y, width, height, 6);
        context.fill();

        blocks.push({
          lineId: line.id,
          x,
          y,
          width,
          height,
          startSeconds: line.startSeconds,
        });

        context.fillStyle = '#f6f7fb';
        context.font = selected
          ? '700 13px Inter, sans-serif'
          : '12px Inter, sans-serif';
        context.fillText(
          line.text,
          x + 10,
          y + 12,
          Math.max(width - 18, 12),
        );
      });

      layoutRef.current = {
        blocks,
      };

      context.strokeStyle = '#facc15';
      context.lineWidth = 3;
      context.beginPath();
      context.moveTo(playheadX, 0);
      context.lineTo(playheadX, canvasHeight);
      context.stroke();

      context.fillStyle = '#facc15';
      context.font = '12px Inter, sans-serif';
      context.fillText(
        formatTime(currentTime),
        playheadX + 10,
        midiTop + 42,
      );

      animationFrameId = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      cancelAnimationFrame(animationFrameId);
      resizeObserver.disconnect();
    };
  }, [
    currentTime,
    durationSeconds,
    lyrics,
    midiOffsetMs,
    midiTimeScale,
    pixelsPerSecond,
    selectedLineId,
    vocalTracks,
  ]);

  const getCanvasX = (
    event: PointerEvent<HTMLCanvasElement>,
  ): number => {
    const canvas = canvasRef.current;

    if (!canvas) {
      return 0;
    }

    const bounds = canvas.getBoundingClientRect();

    return event.clientX - bounds.left;
  };

  const handlePointerDown = (
    event: PointerEvent<HTMLCanvasElement>,
  ): void => {
    const canvas = canvasRef.current;

    if (!canvas) {
      return;
    }

    const bounds = canvas.getBoundingClientRect();
    const x = event.clientX - bounds.left;
    const y = event.clientY - bounds.top;
    const block = [...layoutRef.current.blocks]
      .reverse()
      .find(
        (candidate) =>
          x >= candidate.x &&
          x <= candidate.x + candidate.width &&
          y >= candidate.y &&
          y <= candidate.y + candidate.height,
      );

    if (!block) {
      return;
    }

    canvas.setPointerCapture(event.pointerId);
    onSelectLine(block.lineId);
    dragRef.current = {
      lineId: block.lineId,
      pointerStartX: x,
      lineStartSeconds: block.startSeconds,
    };
  };

  const handlePointerMove = (
    event: PointerEvent<HTMLCanvasElement>,
  ): void => {
    const drag = dragRef.current;

    if (!drag) {
      return;
    }

    const deltaSeconds =
      (getCanvasX(event) - drag.pointerStartX) /
      pixelsPerSecond;

    onMoveLine(
      drag.lineId,
      Number(
        clamp(
          drag.lineStartSeconds + deltaSeconds,
          0,
          durationSeconds,
        ).toFixed(3),
      ),
    );
  };

  const handlePointerUp = (
    event: PointerEvent<HTMLCanvasElement>,
  ): void => {
    canvasRef.current?.releasePointerCapture(
      event.pointerId,
    );
    dragRef.current = null;
  };

  return (
    <canvas
      ref={canvasRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      style={{
        display: 'block',
        width: '100%',
        height: 310,
        cursor: 'grab',
        touchAction: 'none',
      }}
    />
  );
}

export function LyricsSynchronizationPage({
  song,
  onBack,
}: LyricsSynchronizationPageProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [savedSong, setSavedSong] = useState(song);
  const [lyrics, setLyrics] = useState<
    SyncedLyricWord[]
  >(song.lyrics ?? []);
  const [draft, setDraft] = useState('');
  const [selectedLineId, setSelectedLineId] = useState<
    string | null
  >(song.lyrics?.[0]?.id ?? null);
  const [currentTime, setCurrentTime] = useState(0);
  const [audioDuration, setAudioDuration] = useState(
    song.durationSeconds,
  );
  const [isPlaying, setIsPlaying] = useState(false);
  const [zoom, setZoom] = useState(110);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedVocalTrackId, setSelectedVocalTrackId] =
    useState<string | null>(
      () => getVocalTracks(song)[0]?.id ?? null,
    );

  const selectedLineIndex = lyrics.findIndex(
    (line) => line.id === selectedLineId,
  );
  const activeLineIndex = useMemo(
    () => getActiveLineIndex(lyrics, currentTime),
    [
      currentTime,
      lyrics,
    ],
  );
  const vocalTracks = useMemo(
    () =>
      song.tracks.filter(
        (track) => track.id === selectedVocalTrackId,
      ),
    [
      selectedVocalTrackId,
      song.tracks,
    ],
  );
  const vocalNotes = useMemo(
    () =>
      getAdjustedTrackNotes(vocalTracks, song).sort(
        (firstNote, secondNote) =>
          firstNote.startSeconds -
          secondNote.startSeconds,
      ),
    [song, vocalTracks],
  );

  const hasUnsavedChanges =
    JSON.stringify(lyrics) !==
    JSON.stringify(savedSong.lyrics ?? []);

  const updateLine = (
    lineId: string,
    update: Partial<SyncedLyricWord>,
  ): void => {
    setLyrics((currentLyrics) =>
      currentLyrics
        .map((line) =>
          line.id === lineId
            ? {
                ...line,
                ...update,
              }
            : line,
        )
        .sort(
          (firstLine, secondLine) =>
            firstLine.startSeconds -
            secondLine.startSeconds,
        ),
    );
  };

  const handleLoadDraft = (): void => {
    const nextLyrics = wordsFromDraftWithOptionalTimestamp(
      draft,
      vocalNotes,
      audioDuration,
    );

    setLyrics(nextLyrics);
    setSelectedLineId(nextLyrics[0]?.id ?? null);
  };

  const handleFitWordsToMidi = (): void => {
    setLyrics((currentLyrics) =>
      fitExistingLyricsToNotes(
        currentLyrics,
        vocalNotes,
        audioDuration,
      ),
    );
  };

  const handleMarkSelected = (): void => {
    const selectedLine =
      lyrics[selectedLineIndex] ??
      lyrics[activeLineIndex];

    if (!selectedLine) {
      return;
    }

    setLyrics((currentLyrics) =>
      fitLyricsToNotesWithAnchor(
        currentLyrics,
        vocalNotes,
        selectedLine.id,
        Number(currentTime.toFixed(3)),
      ),
    );

    const nextLine =
      lyrics[selectedLineIndex + 1] ??
      lyrics[activeLineIndex + 1];

    if (nextLine) {
      setSelectedLineId(nextLine.id);
    }
  };

  const handleNudgeSelected = (
    deltaSeconds: number,
  ): void => {
    const selectedLine =
      lyrics[selectedLineIndex] ??
      lyrics[activeLineIndex];

    if (!selectedLine) {
      return;
    }

    setLyrics((currentLyrics) =>
      fitLyricsToNotesWithAnchor(
        currentLyrics,
        vocalNotes,
        selectedLine.id,
        Number(
          clamp(
            selectedLine.startSeconds + deltaSeconds,
            0,
            audioDuration,
          ).toFixed(3),
        ),
      ),
    );
    setSelectedLineId(selectedLine.id);
  };

  const handlePlayPause =
    async (): Promise<void> => {
      const audio = audioRef.current;

      if (!audio) {
        return;
      }

      if (audio.paused) {
        await audio.play();
      } else {
        audio.pause();
      }
    };

  const handleSave = async (): Promise<void> => {
    setSaving(true);
    setError(null);

    try {
      const lyricsToSave = extendLyricsThroughEmptyNotes(
        lyrics,
        vocalNotes,
      );
      const updatedSong = await updateSongLyrics(
        song.id,
        {
          lyrics: lyricsToSave,
        },
      );

      setSavedSong(updatedSong);
      setLyrics(updatedSong.lyrics);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : 'No se han podido guardar las letras',
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Container size="xl" py="xl">
      <Stack gap="lg">
        <Group justify="space-between" align="center">
          <div>
            <Button
              variant="subtle"
              onClick={() => {
                onBack(savedSong);
              }}
              mb="md"
            >
              ← Biblioteca
            </Button>

            <Text
              size="sm"
              fw={700}
              c="indigo.3"
              tt="uppercase"
            >
              Sincronizar letras
            </Text>

            <Title order={1}>
              {song.title}
            </Title>
          </div>

          <Button
            loading={saving}
            disabled={!hasUnsavedChanges}
            onClick={() => {
              void handleSave();
            }}
          >
            Guardar
          </Button>
        </Group>

        {error && (
          <Alert color="red" title="Error">
            {error}
          </Alert>
        )}

        <Paper withBorder radius="md" p={0} style={{ overflow: 'hidden' }}>
          <LyricsTimeline
            currentTime={currentTime}
            durationSeconds={audioDuration}
            lyrics={lyrics}
            midiOffsetMs={song.midiOffsetMs}
            midiTimeScale={song.midiTimeScale}
            pixelsPerSecond={zoom}
            selectedLineId={selectedLineId}
            vocalTracks={vocalTracks}
            onMoveLine={(lineId, startSeconds) => {
              setLyrics((currentLyrics) =>
                fitLyricsToNotesWithAnchor(
                  currentLyrics,
                  vocalNotes,
                  lineId,
                  startSeconds,
                ),
              );
            }}
            onSelectLine={setSelectedLineId}
          />
        </Paper>

        <Paper withBorder radius="md" p="md">
          <Stack gap="sm">
            <Slider
              aria-label="Posición de reproducción"
              value={currentTime}
              min={0}
              max={Math.max(audioDuration, 0)}
              step={0.01}
              label={formatTime}
              onChange={(value) => {
                const audio = audioRef.current;

                if (audio) {
                  audio.currentTime = value;
                }

                setCurrentTime(value);
              }}
            />

            <Group justify="space-between">
              <Group>
                <Button
                  variant="default"
                  onClick={() => {
                    const audio = audioRef.current;

                    if (audio) {
                      audio.currentTime = 0;
                    }

                    setCurrentTime(0);
                  }}
                >
                  Reiniciar
                </Button>

                <Button
                  onClick={() => {
                    void handlePlayPause();
                  }}
                >
                  {isPlaying ? 'Pausar' : 'Reproducir'}
                </Button>

                <Button
                  variant="light"
                  disabled={lyrics.length === 0}
                  onClick={handleMarkSelected}
                >
                  Marcar palabra aquí
                </Button>
              </Group>

              <Text ff="monospace">
                {formatTime(currentTime)} / {formatTime(audioDuration)}
              </Text>
            </Group>

            <Group gap="xs">
              {[-0.25, -0.05, 0.05, 0.25].map((delta) => (
                <Button
                  key={delta}
                  variant="default"
                  size="xs"
                  disabled={lyrics.length === 0}
                  onClick={() => {
                    handleNudgeSelected(delta);
                  }}
                >
                  {delta > 0 ? '+' : ''}
                  {Math.round(delta * 1000)} ms
                </Button>
              ))}

              <Text size="xs" c="dimmed">
                También puedes arrastrar cada palabra en la línea de tiempo.
              </Text>
            </Group>
          </Stack>
        </Paper>

        <div className="lyrics-sync-grid">
          <Paper withBorder radius="md" p="lg">
            <Stack gap="md">
              <Title order={4}>Texto</Title>

              <Textarea
                minRows={6}
                placeholder={
                  'Pega la letra completa. Se separará por palabras y se encajará con las notas MIDI vocales.'
                }
                value={draft}
                onChange={(event) => {
                  setDraft(event.currentTarget.value);
                }}
              />

              <Group grow>
                <Button
                  variant="default"
                  onClick={handleLoadDraft}
                >
                  Separar y encajar
                </Button>

                <Button
                  variant="light"
                  disabled={lyrics.length === 0}
                  onClick={handleFitWordsToMidi}
                >
                  Encajar con MIDI
                </Button>
              </Group>

              <Group grow>
                <Button
                  variant="light"
                  onClick={() => {
                    setDraft(
                      lyrics
                        .map((line) => line.text)
                        .join(' '),
                    );
                  }}
                >
                  Editar texto actual
                </Button>
              </Group>

              <Group justify="space-between">
                <Text c="dimmed">Zoom</Text>
                <Slider
                  aria-label="Zoom"
                  value={zoom}
                  onChange={setZoom}
                  min={45}
                  max={260}
                  step={5}
                  w={220}
                />
              </Group>

              <Stack gap="xs">
                <Text fw={650} size="sm">
                  Pista MIDI vocal
                </Text>

                <Text size="xs" c="dimmed">
                  {lyrics.length} palabras · {vocalNotes.length} notas
                </Text>

                {song.tracks.map((track) => (
                  <Checkbox
                    key={track.id}
                    checked={selectedVocalTrackId === track.id}
                    label={
                      track.instrument
                        ? `${track.name} · ${track.instrument}`
                        : track.name
                    }
                    onChange={(event) => {
                      setSelectedVocalTrackId(
                        event.currentTarget.checked
                          ? track.id
                          : null,
                      );
                    }}
                  />
                ))}
              </Stack>
            </Stack>
          </Paper>

          <Paper withBorder radius="md" p="lg">
            <Stack gap="md">
              <Title order={4}>Palabras sincronizadas</Title>

              <ScrollArea h={360}>
                <Stack gap="xs">
                  {lyrics.map((line, index) => (
                    <div
                      className={
                        line.id === selectedLineId
                          ? 'lyrics-sync-line lyrics-sync-line--selected'
                          : 'lyrics-sync-line'
                      }
                      key={line.id}
                    >
                      <Text size="xs" ff="monospace">
                        {index + 1}
                      </Text>

                      <NumberInput
                        aria-label="Tiempo de la palabra"
                        value={line.startSeconds}
                        min={0}
                        max={Math.max(audioDuration, 0)}
                        step={0.05}
                        decimalScale={2}
                        w={104}
                        onChange={(value) => {
                          setSelectedLineId(line.id);
                          updateLine(line.id, {
                            startSeconds:
                              Number(value) || 0,
                            noteId: undefined,
                          });
                        }}
                      />

                      <TextInput
                        aria-label="Texto de la palabra"
                        value={line.text}
                        onFocus={() => {
                          setSelectedLineId(line.id);
                        }}
                        onChange={(event) => {
                          updateLine(line.id, {
                            text: event.currentTarget.value,
                          });
                        }}
                      />
                    </div>
                  ))}
                </Stack>
              </ScrollArea>
            </Stack>
          </Paper>
        </div>

        <audio
          ref={audioRef}
          src={song.audioUrl}
          preload="auto"
          onLoadedMetadata={(event) => {
            const nextDuration =
              event.currentTarget.duration;

            if (Number.isFinite(nextDuration)) {
              setAudioDuration(nextDuration);
            }
          }}
          onTimeUpdate={(event) => {
            setCurrentTime(
              event.currentTarget.currentTime,
            );
          }}
          onPlay={() => {
            setIsPlaying(true);
          }}
          onPause={() => {
            setIsPlaying(false);
          }}
          onEnded={() => {
            setIsPlaying(false);
          }}
        />
      </Stack>
    </Container>
  );
}
