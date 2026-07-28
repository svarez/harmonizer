import {
  type RefObject,
  useEffect,
  useRef,
} from 'react';

import type {
  NoteEvent,
  SyncedLyricWord,
} from '@harmonizer/shared';

import type {
  NoteResult,
  ChordSegment,
  PitchSample,
} from '../types';
import {
  formatTime,
  MIN_RELIABLE_PITCH_CLARITY,
  midiToNoteName,
  shiftMidiToClosestOctave,
} from '../musicUtils';

interface PianoRollCanvasProps {
  notes: NoteEvent[];
  supportingTracks?: PianoRollSupportingTrack[];
  minMidi: number;
  maxMidi: number;
  getAudioCurrentTime: () => number;
  resultsByNoteId: Record<string, NoteResult>;
  midiOffsetMs: number;
  midiTimeScale: number;
  mainTrackColor?: string;
  chordSegments?: ChordSegment[];
  lyrics?: SyncedLyricWord[];
  livePitchSample: PitchSample | null;
  livePitchSampleRef?: RefObject<PitchSample | null>;
}

interface PianoRollSupportingTrack {
  id: string;
  name: string;
  color?: string;
  notes: NoteEvent[];
}

const PIXELS_PER_SECOND = 190;
const PLAYHEAD_POSITION = 0.3;
const TIME_MARK_INTERVAL_SECONDS = 1;
const LYRIC_COLLISION_PADDING = 8;
const MIN_LYRIC_SCALE_GAP_SECONDS = 0.24;
const MAX_LYRIC_PIXELS_PER_SECOND = 275;
const LYRIC_LABEL_HEIGHT = 24;
const LYRIC_LABEL_GAP = 5;
const CHORD_LANE_HEIGHT = 34;
const CHORD_BOUNDARY_COLOR = 'rgba(20, 184, 166, 0.42)';
const CHORD_ACTIVE_COLOR = '#5eead4';
const VOICE_HISTORY_SECONDS = 240;
const MAX_VOICE_TRAIL_POINTS = 1200;
const VOICE_SAMPLE_MIN_GAP_MS = 70;
const LIVE_SAMPLE_MAX_AGE_MS = 160;
const VOICE_TRAIL_FADE_MS = 4500;
const VOICE_HISTORY_BASE_OPACITY = 0.12;
const VOICE_HISTORY_RECENT_OPACITY = 0.42;
const VOICE_BUCKET_SECONDS = 0.1;
const VOICE_BUCKET_DOMINANCE = 0.55;
const SUPPORTING_TRACK_COLORS = [
  '#8b5cf6',
  '#22c1c8',
  '#78c943',
  '#f59e0b',
  '#ec4899',
];

interface VoiceTrailPoint {
  songTime: number;
  midi: number;
  clarity: number;
  intensity: number;
  timestampMs: number;
}

interface VoiceTrailBucket {
  bucketIndex: number;
  startSongTime: number;
  endSongTime: number;
  midi: number;
  clarity: number;
  intensity: number;
  ageMs: number;
}

interface NoteLayout {
  x: number;
  y: number;
  width: number;
  height: number;
}

function findReferenceMidi(
  notes: NoteEvent[],
  songTime: number,
  fallbackMidi: number,
): number {
  const activeNote = notes.find(
    (note) =>
      songTime >= note.startSeconds &&
      songTime <= note.endSeconds,
  );

  if (activeNote) {
    return activeNote.midi;
  }

  const nearestNote = notes.reduce<NoteEvent | null>(
    (nearest, note) => {
      if (!nearest) {
        return note;
      }

      return Math.abs(note.startSeconds - songTime) <
        Math.abs(nearest.startSeconds - songTime)
        ? note
        : nearest;
    },
    null,
  );

  return nearestNote?.midi ?? fallbackMidi;
}

function findReferenceNoteId(
  notes: NoteEvent[],
  songTime: number,
): string {
  const activeNote = notes.find(
    (note) =>
      songTime >= note.startSeconds &&
      songTime <= note.endSeconds,
  );

  if (activeNote) {
    return activeNote.id;
  }

  const nearestNote = notes.reduce<NoteEvent | null>(
    (nearest, note) => {
      if (!nearest) {
        return note;
      }

      return Math.abs(note.startSeconds - songTime) <
        Math.abs(nearest.startSeconds - songTime)
        ? note
        : nearest;
    },
    null,
  );

  return nearestNote?.id ?? '';
}

function midiToY(
  midi: number,
  minMidi: number,
  maxMidi: number,
  noteRowHeight: number,
): number {
  const clampedMidi = Math.min(
    Math.max(midi, minMidi),
    maxMidi,
  );

  return (maxMidi - clampedMidi + 0.5) * noteRowHeight;
}

function getHistoryOpacity(
  ageMs: number,
  songDistanceSeconds: number,
): number {
  const ageOpacity = Math.max(
    1 - ageMs / VOICE_TRAIL_FADE_MS,
    0,
  );

  const distanceOpacity = Math.max(
    1 -
      songDistanceSeconds /
        Math.max(VOICE_HISTORY_SECONDS, 1),
    0,
  );

  return Math.min(
    VOICE_HISTORY_BASE_OPACITY +
      distanceOpacity * VOICE_HISTORY_BASE_OPACITY +
      ageOpacity * VOICE_HISTORY_RECENT_OPACITY,
    0.72,
  );
}

function getLyricAwarePixelsPerSecond(
  context: CanvasRenderingContext2D,
  lyrics: SyncedLyricWord[],
): number {
  if (lyrics.length < 2) {
    return PIXELS_PER_SECOND;
  }

  context.font = '700 20px Inter, sans-serif';

  const scaleCandidates = lyrics.reduce<number[]>(
    (candidates, word, index) => {
      const nextWord = lyrics[index + 1];

      if (!nextWord) {
        return candidates;
      }

      const distanceSeconds =
        nextWord.startSeconds - word.startSeconds;

      if (distanceSeconds < MIN_LYRIC_SCALE_GAP_SECONDS) {
        return candidates;
      }

      const requiredScaleForWord =
        (context.measureText(word.text).width +
          LYRIC_COLLISION_PADDING) /
        distanceSeconds;

      if (requiredScaleForWord > PIXELS_PER_SECOND) {
        candidates.push(requiredScaleForWord);
      }

      return candidates;
    },
    [],
  );

  if (scaleCandidates.length === 0) {
    return PIXELS_PER_SECOND;
  }

  scaleCandidates.sort(
    (firstScale, secondScale) => firstScale - secondScale,
  );

  const representativeScale =
    scaleCandidates[
      Math.min(
        Math.floor(scaleCandidates.length * 0.85),
        scaleCandidates.length - 1,
      )
    ];

  return Math.min(
    Math.max(representativeScale, PIXELS_PER_SECOND),
    MAX_LYRIC_PIXELS_PER_SECOND,
  );
}

export function PianoRollCanvas({
  notes,
  supportingTracks = [],
  minMidi,
  maxMidi,
  getAudioCurrentTime,
  resultsByNoteId,
  midiOffsetMs,
  midiTimeScale,
  mainTrackColor = '#2f7cff',
  chordSegments = [],
  lyrics = [],
  livePitchSample,
  livePitchSampleRef: externalLivePitchSampleRef,
}: PianoRollCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const livePitchSampleRef =
    useRef<PitchSample | null>(livePitchSample);
  const resultsByNoteIdRef = useRef(resultsByNoteId);
  const voiceTrailRef = useRef<VoiceTrailPoint[]>([]);
  const lastTrailTimestampMsRef = useRef<number | null>(null);

  useEffect(() => {
    livePitchSampleRef.current = livePitchSample;
  }, [livePitchSample]);

  useEffect(() => {
    resultsByNoteIdRef.current = resultsByNoteId;
  }, [resultsByNoteId]);

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
      const nextCanvasWidth = Math.floor(bounds.width * pixelRatio);
      const nextCanvasHeight = Math.floor(bounds.height * pixelRatio);

      if (
        canvas.width === nextCanvasWidth &&
        canvas.height === nextCanvasHeight
      ) {
        canvasWidth = bounds.width;
        canvasHeight = bounds.height;
        return;
      }

      canvasWidth = bounds.width;
      canvasHeight = bounds.height;

      canvas.width = nextCanvasWidth;
      canvas.height = nextCanvasHeight;

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

      context.fillStyle = '#0b0c10';
      context.fillRect(0, 0, canvasWidth, canvasHeight);

      const nowMs = performance.now();
      const pitchSample =
        externalLivePitchSampleRef?.current ??
        livePitchSampleRef.current;
      const detectedMidi = pitchSample?.detectedMidi;
      const hasDetectedPitch =
        detectedMidi !== null && detectedMidi !== undefined;

      const pixelsPerSecond = getLyricAwarePixelsPerSecond(
        context,
        lyrics,
      );
      const notesCanvasHeight = canvasHeight;
      const pitchCount = Math.max(
        maxMidi - minMidi + 1,
        1,
      );
      const noteRowHeight =
        notesCanvasHeight / pitchCount;
      const playheadX = canvasWidth * PLAYHEAD_POSITION;

      const audioTime = getAudioCurrentTime();

      /*
       * Un offset positivo retrasa las notas MIDI respecto al MP3.
       * Ejemplo: offset 200 ms significa que una nota MIDI situada
       * en 1 segundo debe coincidir con el segundo 1,2 del MP3.
       */
      const offsetSeconds = midiOffsetMs / 1000;
      const midiTime =
        (audioTime - offsetSeconds) / midiTimeScale;

      const firstVisibleAudioTime =
        audioTime - playheadX / pixelsPerSecond;
      const lastVisibleAudioTime =
        audioTime +
        (canvasWidth - playheadX) / pixelsPerSecond;
      const firstTimeMark =
        Math.ceil(
          firstVisibleAudioTime / TIME_MARK_INTERVAL_SECONDS,
        ) * TIME_MARK_INTERVAL_SECONDS;

      context.textBaseline = 'top';
      context.font = '11px Inter, sans-serif';

      for (
        let time = firstTimeMark;
        time <= lastVisibleAudioTime;
        time += TIME_MARK_INTERVAL_SECONDS
      ) {
        if (time < 0) {
          continue;
        }

        const x =
          playheadX +
          (time - audioTime) * pixelsPerSecond;
        const isMeasureMark = Math.round(time) % 5 === 0;

        context.beginPath();
        context.moveTo(x, 0);
        context.lineTo(x, notesCanvasHeight);
        context.strokeStyle = isMeasureMark
          ? 'rgba(70, 74, 86, 0.46)'
          : 'rgba(56, 59, 68, 0.24)';
        context.lineWidth = isMeasureMark ? 1 : 0.5;
        context.stroke();

        if (isMeasureMark) {
          context.fillStyle = '#a9abb5';
          context.fillText(formatTime(time), x + 5, 7);
        }
      }

      if (chordSegments.length > 0) {
        context.save();

        context.fillStyle = 'rgba(6, 8, 12, 0.72)';
        context.fillRect(0, 0, canvasWidth, CHORD_LANE_HEIGHT);

        for (const segment of chordSegments) {
          const adjustedStart =
            segment.startSeconds * midiTimeScale +
            offsetSeconds;
          const adjustedEnd =
            segment.endSeconds * midiTimeScale +
            offsetSeconds;
          const x =
            playheadX +
            (adjustedStart - audioTime) *
              pixelsPerSecond;
          const endX =
            playheadX +
            (adjustedEnd - audioTime) *
              pixelsPerSecond;

          if (endX < 0 || x > canvasWidth) {
            continue;
          }

          const isActive =
            audioTime >= adjustedStart && audioTime < adjustedEnd;
          const visibleStartX = Math.max(x, 0);
          const visibleEndX = Math.min(endX, canvasWidth);
          const labelText = segment.chord;

          if (x >= 0 && x <= canvasWidth) {
            context.beginPath();
            context.moveTo(x, 0);
            context.lineTo(x, canvasHeight);
            context.strokeStyle = isActive
              ? 'rgba(94, 234, 212, 0.78)'
              : CHORD_BOUNDARY_COLOR;
            context.lineWidth = isActive ? 1.7 : 1;
            context.stroke();
          }

          context.font = isActive
            ? '800 13px Inter, sans-serif'
            : '750 12px Inter, sans-serif';
          context.textBaseline = 'top';

          const labelWidth = Math.ceil(
            context.measureText(labelText).width + 18,
          );
          const labelX = Math.min(
            Math.max(
              visibleStartX + 6,
              6,
            ),
            Math.max(visibleEndX - labelWidth - 6, 6),
          );

          if (
            labelX + labelWidth < 0 ||
            labelX > canvasWidth ||
            visibleEndX - visibleStartX < 18
          ) {
            continue;
          }

          context.beginPath();
          context.roundRect(labelX, 6, labelWidth, 22, 6);
          context.fillStyle = isActive
            ? 'rgba(20, 184, 166, 0.92)'
            : 'rgba(12, 18, 25, 0.88)';
          context.fill();
          context.strokeStyle = isActive
            ? 'rgba(153, 246, 228, 0.78)'
            : 'rgba(94, 234, 212, 0.24)';
          context.lineWidth = 1;
          context.stroke();

          context.fillStyle = isActive
            ? '#f8fffd'
            : CHORD_ACTIVE_COLOR;
          context.fillText(labelText, labelX + 9, 10);
        }

        context.beginPath();
        context.moveTo(0, CHORD_LANE_HEIGHT);
        context.lineTo(canvasWidth, CHORD_LANE_HEIGHT);
        context.strokeStyle = 'rgba(94, 234, 212, 0.18)';
        context.lineWidth = 1;
        context.stroke();

        context.restore();
      }

      for (
        let midi = minMidi;
        midi <= maxMidi;
        midi += 1
      ) {
        const rowIndex = maxMidi - midi;
        const y = rowIndex * noteRowHeight;

        const isC = midi % 12 === 0;

        context.beginPath();
        context.moveTo(0, y);
        context.lineTo(canvasWidth, y);
        context.strokeStyle = isC
          ? 'rgba(104, 109, 126, 0.54)'
          : 'rgba(67, 71, 82, 0.36)';
        context.lineWidth = isC ? 1.4 : 0.9;
        context.stroke();
      }

      supportingTracks.forEach((supportingTrack, trackIndex) => {
        const trackOpacity = trackIndex === 0 ? 0.42 : 0.28;
        const trackColor =
          supportingTrack.color ??
          SUPPORTING_TRACK_COLORS[
            trackIndex % SUPPORTING_TRACK_COLORS.length
          ];

        for (const note of supportingTrack.notes) {
          const adjustedStart =
            note.startSeconds * midiTimeScale +
            offsetSeconds;
          const adjustedDuration =
            note.durationSeconds * midiTimeScale;
          const x =
            playheadX +
            (adjustedStart - audioTime) *
              pixelsPerSecond;

          const width = Math.max(
            adjustedDuration * pixelsPerSecond,
            3,
          );

          if (x + width < 0 || x > canvasWidth) {
            continue;
          }

          const rowIndex = maxMidi - note.midi;
          const y = rowIndex * noteRowHeight + 3;
          const height = Math.max(noteRowHeight - 6, 3);

          context.beginPath();
          context.roundRect(x, y, width, height, 3);
          context.fillStyle = trackColor;
          context.globalAlpha = trackOpacity;
          context.fill();
          context.globalAlpha = 1;

          if (height >= 14 && width >= 46) {
            context.fillStyle = `rgba(245, 247, 255, ${trackOpacity + 0.18})`;
            context.font = '10px Inter, sans-serif';
            context.textBaseline = 'middle';
            context.fillText(
              midiToNoteName(note.midi),
              x + 6,
              y + height / 2,
            );
          }
        }
      });

      const noteLayoutById = new Map<string, NoteLayout>();

      for (const note of notes) {
        const adjustedStart =
          note.startSeconds * midiTimeScale +
          offsetSeconds;
        const adjustedDuration =
          note.durationSeconds * midiTimeScale;
        const x =
          playheadX +
          (adjustedStart - audioTime) *
            pixelsPerSecond;

        const width = Math.max(
          adjustedDuration * pixelsPerSecond,
          4,
        );

        if (x + width < 0 || x > canvasWidth) {
          continue;
        }

        const rowIndex = maxMidi - note.midi;
        const y = rowIndex * noteRowHeight + 2;
        const height = Math.max(noteRowHeight - 4, 4);

        noteLayoutById.set(note.id, {
          x,
          y,
          width,
          height,
        });

        const result = resultsByNoteIdRef.current[note.id];

        if (result?.status === 'correct') {
          context.fillStyle = '#22c55e';
        } else if (result?.status === 'incorrect') {
          context.fillStyle = '#ef4444';
        } else {
          context.fillStyle = mainTrackColor;
        }

        context.beginPath();
        context.roundRect(x, y, width, height, 4);
        context.fill();

        if (height >= 17 && width >= 34) {
          context.fillStyle = '#ffffff';
          context.font = '11px Inter, sans-serif';
          context.textBaseline = 'middle';

          context.fillText(
            midiToNoteName(note.midi),
            x + 7,
            y + height / 2,
          );
        }
      }

      const sampleAgeMs = pitchSample
        ? nowMs - pitchSample.timestampMs
        : Number.POSITIVE_INFINITY;
      const hasFreshDetectedPitch =
        pitchSample &&
        hasDetectedPitch &&
        pitchSample.clarity >= MIN_RELIABLE_PITCH_CLARITY &&
        sampleAgeMs <= LIVE_SAMPLE_MAX_AGE_MS;

      if (hasFreshDetectedPitch) {
        const referenceMidi = findReferenceMidi(
          notes,
          midiTime,
          (minMidi + maxMidi) / 2,
        );
        const displayMidi = shiftMidiToClosestOctave(
          detectedMidi,
          referenceMidi,
        );
        const lastTrailTimestampMs =
          lastTrailTimestampMsRef.current;

        if (
          lastTrailTimestampMs === null ||
          pitchSample.timestampMs - lastTrailTimestampMs >=
            VOICE_SAMPLE_MIN_GAP_MS
        ) {
          voiceTrailRef.current = [
            ...voiceTrailRef.current,
            {
              songTime: midiTime,
              midi: displayMidi,
              clarity: pitchSample.clarity,
              intensity: pitchSample.intensity,
              timestampMs: pitchSample.timestampMs,
            },
          ];

          lastTrailTimestampMsRef.current =
            pitchSample.timestampMs;
        }
      }

      if (
        voiceTrailRef.current.length >
        MAX_VOICE_TRAIL_POINTS
      ) {
        voiceTrailRef.current =
          voiceTrailRef.current.slice(-MAX_VOICE_TRAIL_POINTS);
      }

      const visibleTrailPoints = voiceTrailRef.current
        .map((point) => ({
          ...point,
          ageMs: Math.max(nowMs - point.timestampMs, 0),
          x:
            playheadX +
            (point.songTime * midiTimeScale +
              offsetSeconds -
              audioTime) *
              pixelsPerSecond,
          y: midiToY(
            point.midi,
            minMidi,
            maxMidi,
            noteRowHeight,
          ),
        }))
        .filter(
          (point) =>
            point.x >= -40 && point.x <= canvasWidth + 40,
        );

      const visibleTrailBuckets = [
        ...visibleTrailPoints
          .reduce((buckets, point) => {
            const bucketIndex = Math.floor(
              point.songTime / VOICE_BUCKET_SECONDS,
            );
            const bucket = buckets.get(bucketIndex) ?? {
              points: [] as typeof visibleTrailPoints,
            };

            bucket.points.push(point);
            buckets.set(bucketIndex, bucket);

            return buckets;
          }, new Map<number, { points: typeof visibleTrailPoints }>())
          .entries(),
      ]
        .map<VoiceTrailBucket | null>(
          ([bucketIndex, bucket]) => {
            const points = bucket.points;

            if (points.length === 0) {
              return null;
            }

            const midiCounts = new Map<number, number>();
            let weightedMidiSum = 0;
            let weightedMidiSamples = 0;
            let claritySum = 0;
            let intensitySum = 0;
            let youngestAgeMs = Number.POSITIVE_INFINITY;

            for (const point of points) {
              const roundedMidi = Math.round(point.midi);
              const weight = Math.max(point.clarity, 0.001);

              midiCounts.set(
                roundedMidi,
                (midiCounts.get(roundedMidi) ?? 0) + 1,
              );
              weightedMidiSum += point.midi * weight;
              weightedMidiSamples += weight;
              claritySum += point.clarity;
              intensitySum += point.intensity;
              youngestAgeMs = Math.min(
                youngestAgeMs,
                point.ageMs,
              );
            }

            const dominantEntry = [
              ...midiCounts.entries(),
            ].sort(
              ([, firstCount], [, secondCount]) =>
                secondCount - firstCount,
            )[0];
            const dominantShare = dominantEntry
              ? dominantEntry[1] / points.length
              : 0;
            const midi =
              dominantEntry &&
              dominantShare >= VOICE_BUCKET_DOMINANCE
                ? dominantEntry[0]
                : weightedMidiSum / weightedMidiSamples;

            return {
              bucketIndex,
              startSongTime:
                bucketIndex * VOICE_BUCKET_SECONDS,
              endSongTime:
                (bucketIndex + 1) * VOICE_BUCKET_SECONDS,
              midi,
              clarity: claritySum / points.length,
              intensity: intensitySum / points.length,
              ageMs: youngestAgeMs,
            };
          },
        )
        .filter(
          (bucket): bucket is VoiceTrailBucket =>
            bucket !== null,
        )
        .sort(
          (firstBucket, secondBucket) =>
            firstBucket.bucketIndex -
            secondBucket.bucketIndex,
        );

      if (visibleTrailBuckets.length > 0) {
        context.save();

        for (const bucket of visibleTrailBuckets) {
          const songDistanceSeconds = Math.max(
            midiTime - bucket.endSongTime,
            0,
          );
          const opacity = getHistoryOpacity(
            bucket.ageMs,
            songDistanceSeconds,
          );

          if (opacity <= 0.01) {
            continue;
          }

          const segmentX =
            playheadX +
            (bucket.startSongTime * midiTimeScale +
              offsetSeconds -
              audioTime) *
              pixelsPerSecond;
          const segmentWidth = Math.max(
            VOICE_BUCKET_SECONDS *
              midiTimeScale *
              pixelsPerSecond -
              2,
            7,
          );
          const segmentY =
            midiToY(
              Math.round(bucket.midi),
              minMidi,
              maxMidi,
              noteRowHeight,
            ) -
            Math.max(Math.min(noteRowHeight - 5, 8), 4) / 2;
          const segmentHeight = Math.max(
            Math.min(noteRowHeight - 5, 8),
            4,
          );
          const reliableSegment =
            bucket.clarity >= MIN_RELIABLE_PITCH_CLARITY;
          const segmentColor = reliableSegment
            ? mainTrackColor
            : '#f59e0b';

          context.beginPath();
          context.roundRect(
            segmentX,
            segmentY,
            segmentWidth,
            segmentHeight,
            4,
          );
          context.globalAlpha =
            segmentColor === mainTrackColor
              ? opacity
              : opacity * 0.8;
          context.fillStyle = segmentColor;
          context.fill();
          context.globalAlpha = 1;
        }

        context.restore();
      }

      const latestVisiblePoint = visibleTrailPoints.at(-1);
      const shouldDrawLivePoint =
        latestVisiblePoint &&
        latestVisiblePoint.ageMs <= VOICE_TRAIL_FADE_MS;

      if (shouldDrawLivePoint && latestVisiblePoint) {
        const liveOpacity = Math.max(
          1 -
            latestVisiblePoint.ageMs / VOICE_TRAIL_FADE_MS,
          0,
        );
        const displayMidi = Math.round(
          latestVisiblePoint.midi,
        );
        const isInsideVisibleRange =
          displayMidi >= minMidi &&
          displayMidi <= maxMidi;

        const pitchY =
          midiToY(displayMidi, minMidi, maxMidi, noteRowHeight);
        const pitchColor =
          latestVisiblePoint.clarity >=
          MIN_RELIABLE_PITCH_CLARITY
            ? '#22d3ee'
            : '#f59e0b';
        const liveRadius =
          5 + latestVisiblePoint.intensity * 7;

        context.save();
        context.beginPath();
        context.arc(
          latestVisiblePoint.x,
          pitchY,
          liveRadius + 5,
          0,
          Math.PI * 2,
        );
        context.fillStyle =
          pitchColor === '#22d3ee'
            ? `rgba(34, 211, 238, ${liveOpacity * 0.18})`
            : `rgba(245, 158, 11, ${liveOpacity * 0.16})`;
        context.fill();

        context.beginPath();
        context.arc(
          latestVisiblePoint.x,
          pitchY,
          liveRadius,
          0,
          Math.PI * 2,
        );
        context.fillStyle =
          pitchColor === '#22d3ee'
            ? `rgba(34, 211, 238, ${liveOpacity * 0.96})`
            : `rgba(245, 158, 11, ${liveOpacity * 0.86})`;
        context.fill();
        context.lineWidth = 2;
        context.strokeStyle = `rgba(255, 255, 255, ${liveOpacity * 0.86})`;
        context.stroke();

        context.fillStyle = pitchColor;
        context.font = '11px Inter, sans-serif';
        context.textBaseline = 'middle';

        if (liveOpacity > 0.55) {
          context.fillText(
            midiToNoteName(displayMidi),
            latestVisiblePoint.x + liveRadius + 8,
            pitchY,
          );
        }

        if (!isInsideVisibleRange) {
          context.fillStyle = '#fca5a5';
          context.font = '11px Inter, sans-serif';
          context.fillText(
            displayMidi > maxMidi
              ? 'above'
              : 'below',
            latestVisiblePoint.x + liveRadius + 8,
            pitchY + 16,
          );
        }

        context.restore();
      }

      if (lyrics.length > 0) {
        const activeWordIndex = lyrics.findLastIndex((word) => {
          const endSeconds =
            word.startSeconds + (word.durationSeconds ?? 0.35);

          return audioTime >= word.startSeconds && audioTime < endSeconds;
        });

        context.save();
        context.textBaseline = 'top';

        lyrics.forEach((word, wordIndex) => {
          const noteLayout =
            (word.noteId
              ? noteLayoutById.get(word.noteId)
              : undefined) ??
            noteLayoutById.get(
              findReferenceNoteId(notes, word.startSeconds),
            );

          if (!noteLayout) {
            return;
          }

          const isActive = wordIndex === activeWordIndex;
          context.font = isActive
            ? '800 19px Inter, sans-serif'
            : '750 15px Inter, sans-serif';

          const labelWidth = Math.max(
            context.measureText(word.text).width + 14,
            28,
          );
          const x =
            playheadX +
            (word.startSeconds - audioTime) * pixelsPerSecond;
          const labelX = Math.min(
            Math.max(
              Math.max(x, noteLayout.x),
              4,
            ),
            Math.max(canvasWidth - labelWidth - 4, 4),
          );
          const preferredY =
            noteLayout.y + noteLayout.height + LYRIC_LABEL_GAP;
          const labelY =
            preferredY + LYRIC_LABEL_HEIGHT <= canvasHeight - 6
              ? preferredY
              : Math.max(
                  noteLayout.y -
                    LYRIC_LABEL_HEIGHT -
                    LYRIC_LABEL_GAP,
                  6,
                );

          if (
            labelX + labelWidth < 0 ||
            labelX > canvasWidth
          ) {
            return;
          }

          context.beginPath();
          context.roundRect(
            labelX,
            labelY,
            labelWidth,
            LYRIC_LABEL_HEIGHT,
            6,
          );
          context.fillStyle = isActive
            ? 'rgba(49, 93, 247, 0.92)'
            : 'rgba(9, 10, 13, 0.82)';
          context.fill();

          context.strokeStyle = isActive
            ? 'rgba(177, 196, 255, 0.78)'
            : 'rgba(90, 94, 108, 0.58)';
          context.lineWidth = 1;
          context.stroke();

          context.fillStyle = isActive ? '#f6f7fb' : '#8f929b';
          context.shadowColor = isActive
            ? 'rgba(49, 93, 247, 0.55)'
            : 'transparent';
          context.shadowBlur = isActive ? 10 : 0;
          context.fillText(word.text, labelX + 7, labelY + 3);
          context.shadowBlur = 0;
        });

        context.restore();
      }

      if (chordSegments.length > 0) {
        context.save();

        for (const segment of chordSegments) {
          const adjustedStart =
            segment.startSeconds * midiTimeScale +
            offsetSeconds;
          const adjustedEnd =
            segment.endSeconds * midiTimeScale +
            offsetSeconds;
          const x =
            playheadX +
            (adjustedStart - audioTime) *
              pixelsPerSecond;

          if (
            x < 0 ||
            x > canvasWidth
          ) {
            continue;
          }

          const isActive =
            audioTime >= adjustedStart && audioTime < adjustedEnd;

          context.beginPath();
          context.moveTo(x, 0);
          context.lineTo(x, canvasHeight);
          context.strokeStyle = isActive
            ? 'rgba(94, 234, 212, 0.88)'
            : CHORD_BOUNDARY_COLOR;
          context.lineWidth = isActive ? 1.8 : 1;
          context.stroke();
        }

        context.restore();
      }

      context.save();
      context.shadowBlur = 10;
      context.shadowColor = 'rgba(250, 204, 21, 0.45)';
      context.beginPath();
      context.moveTo(playheadX, 0);
      context.lineTo(playheadX, canvasHeight);
      context.strokeStyle = '#facc15';
      context.lineWidth = 2;
      context.stroke();
      context.restore();

      context.fillStyle = '#facc15';
      context.beginPath();
      context.moveTo(playheadX - 7, 0);
      context.lineTo(playheadX + 7, 0);
      context.lineTo(playheadX, 11);
      context.closePath();
      context.fill();

      const playheadLabel = formatTime(audioTime);
      context.font = '700 12px Inter, sans-serif';
      const labelWidth = Math.ceil(
        context.measureText(playheadLabel).width + 24,
      );
      const labelHeight = 28;
      const labelGap = 12;
      const labelX =
        playheadX + labelGap + labelWidth <= canvasWidth - 8
          ? playheadX + labelGap
          : Math.max(playheadX - labelGap - labelWidth, 8);
      const labelY =
        chordSegments.length > 0 ? CHORD_LANE_HEIGHT + 8 : 8;

      context.beginPath();
      context.roundRect(
        labelX,
        labelY,
        labelWidth,
        labelHeight,
        8,
      );
      context.fillStyle = '#0d1017';
      context.fill();
      context.strokeStyle = 'rgba(99, 104, 121, 0.82)';
      context.lineWidth = 1;
      context.stroke();

      context.fillStyle = '#facc15';
      context.textBaseline = 'top';
      context.fillText(playheadLabel, labelX + 12, labelY + 7);

      animationFrameId = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      cancelAnimationFrame(animationFrameId);
      resizeObserver.disconnect();
    };
  }, [
    externalLivePitchSampleRef,
    getAudioCurrentTime,
    maxMidi,
    midiOffsetMs,
    midiTimeScale,
    mainTrackColor,
    chordSegments,
    lyrics,
    minMidi,
    notes,
    supportingTracks,
  ]);

  return (
    <canvas
      className="practice-piano-roll-canvas"
      ref={canvasRef}
      style={{
        display: 'block',
        width: '100%',
        height: 330,
        borderRadius: 12,
      }}
    />
  );
}
