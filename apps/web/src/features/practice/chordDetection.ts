import type {
  NoteEvent,
  SongTrack,
} from '@harmonizer/shared';

import type { ChordSegment } from './types';

const NOTE_NAMES = [
  'C',
  'C#',
  'D',
  'Eb',
  'E',
  'F',
  'F#',
  'G',
  'Ab',
  'A',
  'Bb',
  'B',
];

const WINDOW_SECONDS = 1.05;
const HOP_SECONDS = 0.5;
const MIN_SEGMENT_SECONDS = 1.35;
const MIN_TOTAL_WEIGHT = 0.12;
const MIN_CONFIDENCE = 0.58;
const MAX_SOURCE_TRACKS = 1;

interface ChordTemplate {
  suffix: string;
  intervals: number[];
}

const CHORD_TEMPLATES: ChordTemplate[] = [
  { suffix: '', intervals: [0, 4, 7] },
  { suffix: 'm', intervals: [0, 3, 7] },
];

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '');
}

export function isLikelyGuitarTrack(
  track: SongTrack,
): boolean {
  const description = normalizeText(
    `${track.name} ${track.instrument ?? ''}`,
  );

  return /\b(guitar|guitarra|acoustic guitar|electric guitar|nylon|steel)\b/.test(
    description,
  );
}

function getTrackClarityScore(track: SongTrack): number {
  const description = normalizeText(
    `${track.name} ${track.instrument ?? ''}`,
  );
  const noteCount = Math.max(track.notes.length, 1);
  const averageDuration =
    track.notes.reduce(
      (sum, note) => sum + note.durationSeconds,
      0,
    ) / noteCount;
  const chordToneStarts = new Map<number, Set<number>>();

  for (const note of track.notes) {
    const startBucket = Math.round(note.startSeconds * 4);
    const pitchClasses =
      chordToneStarts.get(startBucket) ?? new Set<number>();

    pitchClasses.add(getPitchClass(note.midi));
    chordToneStarts.set(startBucket, pitchClasses);
  }

  const polyphonicShare =
    [...chordToneStarts.values()].filter(
      (pitchClasses) => pitchClasses.size >= 2,
    ).length / Math.max(chordToneStarts.size, 1);
  const nameScore =
    (/\b(rhythm|ritmica|ritmo|strum)\b/.test(description)
      ? 4
      : 0) +
    (/\b(acoustic|steel|nylon)\b/.test(description) ? 2 : 0) -
    (/\b(lead|solo)\b/.test(description) ? 1.2 : 0);

  return (
    nameScore +
    Math.min(averageDuration, 1.2) * 1.7 +
    polyphonicShare * 5
  );
}

export function getChordSourceTracks(
  tracks: SongTrack[],
): SongTrack[] {
  const guitarTracks = tracks.filter(isLikelyGuitarTrack);

  if (guitarTracks.length === 0) {
    return [];
  }

  const rankedGuitarTracks = [...guitarTracks].sort(
    (firstTrack, secondTrack) =>
      getTrackClarityScore(secondTrack) -
      getTrackClarityScore(firstTrack),
  );

  return rankedGuitarTracks.slice(0, MAX_SOURCE_TRACKS);
}

function getPitchClass(midi: number): number {
  return ((Math.round(midi) % 12) + 12) % 12;
}

function getOverlappingNotes(
  notes: NoteEvent[],
  startSeconds: number,
  endSeconds: number,
): NoteEvent[] {
  return notes.filter(
    (note) =>
      note.startSeconds < endSeconds &&
      note.endSeconds > startSeconds,
  );
}

function buildChroma(
  notes: NoteEvent[],
  startSeconds: number,
  endSeconds: number,
): number[] {
  const chroma = Array.from({ length: 12 }, () => 0);

  for (const note of notes) {
    const overlapSeconds = Math.max(
      Math.min(note.endSeconds, endSeconds) -
        Math.max(note.startSeconds, startSeconds),
      0,
    );

    if (overlapSeconds <= 0) {
      continue;
    }

    const velocityWeight =
      note.velocity === undefined
        ? 1
        : note.velocity <= 1
          ? Math.max(note.velocity, 0.18)
          : Math.max(note.velocity, 12) / 127;
    const octaveWeight =
      note.midi < 45 ? 1.35 : note.midi > 76 ? 0.58 : 1;
    const durationWeight = Math.min(
      Math.max(note.durationSeconds, 0.08),
      1.8,
    );

    chroma[getPitchClass(note.midi)] +=
      overlapSeconds *
      velocityWeight *
      octaveWeight *
      durationWeight;
  }

  return chroma;
}

function scoreTemplate(
  chroma: number[],
  root: number,
  template: ChordTemplate,
): number {
  const total = chroma.reduce(
    (sum, value) => sum + value,
    0,
  );

  if (total < MIN_TOTAL_WEIGHT) {
    return 0;
  }

  const templateClasses = new Set(
    template.intervals.map(
      (interval) => (root + interval) % 12,
    ),
  );
  const chordWeight = [...templateClasses].reduce(
    (sum, pitchClass) => sum + chroma[pitchClass],
    0,
  );
  const coverage =
    template.intervals.filter(
      (interval) => chroma[(root + interval) % 12] > total * 0.05,
    ).length / template.intervals.length;
  const rootPresence = chroma[root] > total * 0.08 ? 0.12 : -0.08;
  const thirdIntervals = template.suffix === 'm' ? [3] : [4];
  const thirdPresence =
    thirdIntervals.some(
      (interval) => chroma[(root + interval) % 12] > total * 0.06,
    )
      ? 0.06
      : -0.16;
  const nonChordPenalty = Math.max(
    (total - chordWeight) / total,
    0,
  );

  return (
    (chordWeight / total) * 0.68 +
    coverage * 0.32 +
    rootPresence +
    thirdPresence -
    nonChordPenalty * 0.2
  );
}

function detectChord(chroma: number[]): {
  chord: string;
  confidence: number;
} | null {
  let bestChord: string | null = null;
  let bestScore = 0;

  for (let root = 0; root < 12; root += 1) {
    for (const template of CHORD_TEMPLATES) {
      const score = scoreTemplate(chroma, root, template);

      if (score > bestScore) {
        bestScore = score;
        bestChord = `${NOTE_NAMES[root]}${template.suffix}`;
      }
    }
  }

  if (!bestChord || bestScore < MIN_CONFIDENCE) {
    return null;
  }

  return {
    chord: bestChord,
    confidence: Math.min(bestScore, 1),
  };
}

function mergeSegments(
  segments: ChordSegment[],
): ChordSegment[] {
  const merged: ChordSegment[] = [];

  for (const segment of segments) {
    const previous = merged.at(-1);

    if (
      previous &&
      previous.chord === segment.chord &&
      segment.startSeconds - previous.endSeconds <= HOP_SECONDS * 1.5
    ) {
      previous.endSeconds = segment.endSeconds;
      previous.confidence =
        (previous.confidence + segment.confidence) / 2;
      continue;
    }

    merged.push({ ...segment });
  }

  return merged;
}

function simplifySegments(
  segments: ChordSegment[],
): ChordSegment[] {
  const mergedSegments = mergeSegments(segments);

  for (let index = 0; index < mergedSegments.length; index += 1) {
    const segment = mergedSegments[index];
    const durationSeconds =
      segment.endSeconds - segment.startSeconds;

    if (durationSeconds >= MIN_SEGMENT_SECONDS) {
      continue;
    }

    const previous = mergedSegments[index - 1];
    const next = mergedSegments[index + 1];

    if (previous && next && previous.chord === next.chord) {
      segment.chord = previous.chord;
      segment.confidence =
        (previous.confidence + next.confidence) / 2;
    } else if (
      previous &&
      previous.confidence >= segment.confidence
    ) {
      segment.chord = previous.chord;
      segment.confidence = previous.confidence;
    } else if (next) {
      segment.chord = next.chord;
      segment.confidence = next.confidence;
    }
  }

  return mergeSegments(mergedSegments).filter(
    (segment) =>
      segment.endSeconds - segment.startSeconds >=
      MIN_SEGMENT_SECONDS,
  );
}

export function detectChordSegmentsFromTracks(
  tracks: SongTrack[],
): ChordSegment[] {
  const notes = tracks
    .flatMap((track) => track.notes)
    .filter((note) => note.durationSeconds > 0)
    .sort(
      (firstNote, secondNote) =>
        firstNote.startSeconds - secondNote.startSeconds,
    );

  const lastNoteEnd = notes.reduce(
    (latestEnd, note) => Math.max(latestEnd, note.endSeconds),
    0,
  );

  if (notes.length === 0 || lastNoteEnd <= 0) {
    return [];
  }

  const frameSegments: ChordSegment[] = [];

  for (
    let startSeconds = 0;
    startSeconds < lastNoteEnd;
    startSeconds += HOP_SECONDS
  ) {
    const endSeconds = Math.min(
      startSeconds + WINDOW_SECONDS,
      lastNoteEnd,
    );
    const overlappingNotes = getOverlappingNotes(
      notes,
      startSeconds,
      endSeconds,
    );
    const detectedChord = detectChord(
      buildChroma(overlappingNotes, startSeconds, endSeconds),
    );

    if (!detectedChord) {
      continue;
    }

    frameSegments.push({
      startSeconds,
      endSeconds: Math.min(startSeconds + HOP_SECONDS, lastNoteEnd),
      chord: detectedChord.chord,
      confidence: detectedChord.confidence,
    });
  }

  return simplifySegments(frameSegments);
}
