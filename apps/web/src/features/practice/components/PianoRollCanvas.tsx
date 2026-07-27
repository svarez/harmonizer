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
const LYRICS_LANE_HEIGHT = 70;
const LYRIC_COLLISION_PADDING = 8;
const MIN_LYRIC_SCALE_GAP_SECONDS = 0.24;
const MAX_LYRIC_PIXELS_PER_SECOND = 275;
const VOICE_HISTORY_SECONDS = 240;
const MAX_VOICE_TRAIL_POINTS = 1200;
const VOICE_SAMPLE_MIN_GAP_MS = 110;
const LIVE_SAMPLE_MAX_AGE_MS = 160;
const LIVE_POINT_HOLD_MS = 1800;
const VOICE_TRAIL_FADE_MS = 4500;
const VOICE_HISTORY_BASE_OPACITY = 0.035;
const VOICE_HISTORY_RECENT_OPACITY = 0.18;
const VOICE_SEGMENT_MAX_GAP_SECONDS = 0.8;
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
  radius: number;
  timestampMs: number;
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

function intensityToRadius(intensity: number): number {
  const clampedIntensity = Math.min(
    Math.max(intensity, 0),
    1,
  );

  return 4 + clampedIntensity * 9;
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
    0.32,
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

      const lyricsLaneHeight =
        lyrics.length > 0 ? LYRICS_LANE_HEIGHT : 0;
      const pixelsPerSecond = getLyricAwarePixelsPerSecond(
        context,
        lyrics,
      );
      const notesCanvasHeight =
        canvasHeight - lyricsLaneHeight;
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
          const radius = intensityToRadius(
            pitchSample.intensity,
          );

          voiceTrailRef.current = [
            ...voiceTrailRef.current,
            {
              songTime: midiTime,
              midi: displayMidi,
              clarity: pitchSample.clarity,
              intensity: pitchSample.intensity,
              radius,
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

      if (visibleTrailPoints.length > 1) {
        context.save();
        context.lineCap = 'round';
        context.lineJoin = 'round';

        for (
          let index = 1;
          index < visibleTrailPoints.length;
          index += 1
        ) {
          const previousPoint = visibleTrailPoints[index - 1];
          const point = visibleTrailPoints[index];
          const segmentGapSeconds =
            point.songTime - previousPoint.songTime;

          if (
            segmentGapSeconds <= 0 ||
            segmentGapSeconds > VOICE_SEGMENT_MAX_GAP_SECONDS
          ) {
            continue;
          }

          const songDistanceSeconds = Math.max(
            midiTime - point.songTime,
            0,
          );
          const opacity = getHistoryOpacity(
            point.ageMs,
            songDistanceSeconds,
          );

          if (opacity <= 0.01) {
            continue;
          }

          context.beginPath();
          context.moveTo(previousPoint.x, previousPoint.y);
          context.lineTo(point.x, point.y);
          context.strokeStyle =
            point.clarity >= MIN_RELIABLE_PITCH_CLARITY
              ? `rgba(34, 211, 238, ${opacity})`
              : `rgba(245, 158, 11, ${opacity})`;
          context.lineWidth = Math.max(
            Math.min(
              (previousPoint.radius + point.radius) * 0.28,
              4,
            ),
            1.2,
          );
          context.stroke();
        }

        context.restore();
      }

      for (const point of visibleTrailPoints) {
        const isRecentPoint =
          point.ageMs <= LIVE_POINT_HOLD_MS;

        if (!isRecentPoint) {
          continue;
        }

        const opacity = Math.max(
          1 - point.ageMs / LIVE_POINT_HOLD_MS,
          0,
        );

        context.beginPath();
        context.arc(
          point.x,
          point.y,
          point.radius * 0.75,
          0,
          Math.PI * 2,
        );
        context.fillStyle =
          point.clarity >= MIN_RELIABLE_PITCH_CLARITY
            ? `rgba(34, 211, 238, ${opacity * 0.55})`
            : `rgba(245, 158, 11, ${opacity * 0.55})`;
        context.fill();
      }

      const latestVisiblePoint = visibleTrailPoints.at(-1);
      const shouldDrawLivePoint =
        latestVisiblePoint &&
        latestVisiblePoint.ageMs <= LIVE_POINT_HOLD_MS;

      if (shouldDrawLivePoint && latestVisiblePoint) {
        const liveOpacity = Math.max(
          1 -
            latestVisiblePoint.ageMs / LIVE_POINT_HOLD_MS,
          0,
        );
        const displayMidi = latestVisiblePoint.midi;
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
        const liveRadius = latestVisiblePoint.radius;

        context.save();
        context.beginPath();
        context.arc(
          latestVisiblePoint.x,
          pitchY,
          liveRadius + 6,
          0,
          Math.PI * 2,
        );
        context.fillStyle =
          pitchColor === '#22d3ee'
            ? `rgba(34, 211, 238, ${liveOpacity * 0.2})`
            : `rgba(245, 158, 11, ${liveOpacity * 0.2})`;
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
            ? `rgba(34, 211, 238, ${liveOpacity})`
            : `rgba(245, 158, 11, ${liveOpacity})`;
        context.fill();
        context.lineWidth = 2;
        context.strokeStyle = `rgba(255, 255, 255, ${liveOpacity})`;
        context.stroke();

        context.fillStyle = pitchColor;
        context.font = '12px Inter, sans-serif';
        context.textBaseline = 'middle';

        if (liveOpacity > 0.35) {
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
              ? 'por encima'
              : 'por debajo',
            latestVisiblePoint.x + liveRadius + 8,
            pitchY + 16,
          );
        }

        context.restore();
      }

      if (lyrics.length > 0) {
        const lyricsTop = notesCanvasHeight;
        const activeWordIndex = lyrics.findLastIndex((word) => {
          const endSeconds =
            word.startSeconds + (word.durationSeconds ?? 0.35);

          return audioTime >= word.startSeconds && audioTime < endSeconds;
        });

        context.fillStyle = 'rgba(9, 10, 13, 0.96)';
        context.fillRect(0, lyricsTop, canvasWidth, lyricsLaneHeight);
        context.strokeStyle = 'rgba(80, 84, 96, 0.56)';
        context.lineWidth = 1;
        context.beginPath();
        context.moveTo(0, lyricsTop + 0.5);
        context.lineTo(canvasWidth, lyricsTop + 0.5);
        context.stroke();

        const midiByNoteId = new Map(
          notes.map((note) => [note.id, note.midi]),
        );
        const pitchSpan = Math.max(maxMidi - minMidi, 1);
        lyrics.forEach((word, wordIndex) => {
          const x =
            playheadX +
            (word.startSeconds - audioTime) * pixelsPerSecond;
          const width = Math.max(
            (word.durationSeconds ?? 0.35) * pixelsPerSecond,
            22,
          );

          if (x + width < 0 || x > canvasWidth) {
            return;
          }

          const isActive = wordIndex === activeWordIndex;
          const wordMidi = word.noteId
            ? midiByNoteId.get(word.noteId)
            : undefined;
          const normalizedPitch =
            wordMidi === undefined
              ? 0.5
              : (wordMidi - minMidi) / pitchSpan;
          const pitchOffset =
            (0.5 - Math.min(Math.max(normalizedPitch, 0), 1)) *
            18;
          const textLeft = x + 4;
          const y = lyricsTop + (isActive ? 21 : 27) + pitchOffset;

          context.fillStyle = isActive ? '#f6f7fb' : '#8f929b';
          context.font = isActive
            ? '800 28px Inter, sans-serif'
            : '700 20px Inter, sans-serif';
          context.textBaseline = 'top';
          context.shadowColor = isActive
            ? 'rgba(49, 93, 247, 0.55)'
            : 'transparent';
          context.shadowBlur = isActive ? 16 : 0;
          context.fillText(word.text, textLeft, y);
          context.shadowBlur = 0;
        });
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

      const labelX = playheadX + 18;
      const labelY = 8;

      context.beginPath();
      context.roundRect(labelX, labelY, 92, 50, 8);
      context.fillStyle = 'rgba(13, 15, 20, 0.88)';
      context.fill();
      context.strokeStyle = 'rgba(80, 84, 96, 0.72)';
      context.lineWidth = 1;
      context.stroke();

      context.fillStyle = '#facc15';
      context.font = '700 13px Inter, sans-serif';
      context.textBaseline = 'top';
      context.fillText(formatTime(audioTime), labelX + 12, labelY + 10);

      context.fillStyle = '#f2f3f7';
      context.font = '12px Inter, sans-serif';
      context.fillText('MP3', labelX + 12, labelY + 29);

      if (midiOffsetMs !== 0) {
        const offsetLabel =
          midiOffsetMs > 0
            ? `MIDI +${midiOffsetMs} ms`
            : `MIDI ${midiOffsetMs} ms`;

        context.fillStyle = '#d4d4d8';
        context.fillText(offsetLabel, playheadX + 10, 24);
      }

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
    lyrics,
    minMidi,
    notes,
    supportingTracks,
  ]);

  return (
    <canvas
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
