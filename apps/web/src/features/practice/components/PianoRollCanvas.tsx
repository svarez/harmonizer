import {
  useEffect,
  useRef,
} from 'react';

import type { NoteEvent } from '@harmonizer/shared';

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
  minMidi: number;
  maxMidi: number;
  getAudioCurrentTime: () => number;
  resultsByNoteId: Record<string, NoteResult>;
  midiOffsetMs: number;
  livePitchSample: PitchSample | null;
}

const PIXELS_PER_SECOND = 180;
const PLAYHEAD_POSITION = 0.3;
const TIME_MARK_INTERVAL_SECONDS = 1;
const VOICE_TRAIL_SECONDS = 5;
const VOICE_SAMPLE_MIN_GAP_SECONDS = 0.04;
const LIVE_SAMPLE_MAX_AGE_MS = 300;

interface VoiceTrailPoint {
  songTime: number;
  midi: number;
  clarity: number;
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

export function PianoRollCanvas({
  notes,
  minMidi,
  maxMidi,
  getAudioCurrentTime,
  resultsByNoteId,
  midiOffsetMs,
  livePitchSample,
}: PianoRollCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const livePitchSampleRef =
    useRef<PitchSample | null>(livePitchSample);
  const voiceTrailRef = useRef<VoiceTrailPoint[]>([]);
  const lastTrailSongTimeRef = useRef<number | null>(null);
  const previousAudioTimeRef = useRef<number | null>(null);

  useEffect(() => {
    livePitchSampleRef.current = livePitchSample;
  }, [livePitchSample]);

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

      context.fillStyle = '#111113';
      context.fillRect(0, 0, canvasWidth, canvasHeight);

      const pitchSample = livePitchSampleRef.current;
      const detectedMidi = pitchSample?.detectedMidi;
      const hasDetectedPitch =
        detectedMidi !== null && detectedMidi !== undefined;

      const pitchCount = Math.max(
        maxMidi - minMidi + 1,
        1,
      );
      const noteRowHeight = canvasHeight / pitchCount;
      const playheadX = canvasWidth * PLAYHEAD_POSITION;

      const audioTime = getAudioCurrentTime();

      /*
       * Un offset positivo retrasa las notas MIDI respecto al MP3.
       * Ejemplo: offset 200 ms significa que una nota MIDI situada
       * en 1 segundo debe coincidir con el segundo 1,2 del MP3.
       */
      const midiTime = audioTime - midiOffsetMs / 1000;

      const previousAudioTime = previousAudioTimeRef.current;

      if (
        previousAudioTime !== null &&
        Math.abs(audioTime - previousAudioTime) > 0.5
      ) {
        voiceTrailRef.current = [];
        lastTrailSongTimeRef.current = null;
      }

      previousAudioTimeRef.current = audioTime;

      const firstVisibleAudioTime =
        audioTime - playheadX / PIXELS_PER_SECOND;
      const lastVisibleAudioTime =
        audioTime +
        (canvasWidth - playheadX) / PIXELS_PER_SECOND;
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
          (time - audioTime) * PIXELS_PER_SECOND;
        const isMeasureMark = Math.round(time) % 5 === 0;

        context.beginPath();
        context.moveTo(x, 0);
        context.lineTo(x, canvasHeight);
        context.strokeStyle = isMeasureMark
          ? '#3f3f46'
          : '#27272a';
        context.lineWidth = isMeasureMark ? 1 : 0.5;
        context.stroke();

        if (isMeasureMark) {
          context.fillStyle = '#a1a1aa';
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
        context.strokeStyle = isC ? '#3f3f46' : '#27272a';
        context.lineWidth = isC ? 1.5 : 1;
        context.stroke();
      }

      for (const note of notes) {
        const x =
          playheadX +
          (note.startSeconds - midiTime) *
            PIXELS_PER_SECOND;

        const width = Math.max(
          note.durationSeconds * PIXELS_PER_SECOND,
          4,
        );

        if (x + width < 0 || x > canvasWidth) {
          continue;
        }

        const rowIndex = maxMidi - note.midi;
        const y = rowIndex * noteRowHeight + 2;
        const height = Math.max(noteRowHeight - 4, 4);

        const result = resultsByNoteId[note.id];

        if (result?.status === 'correct') {
          context.fillStyle = '#22c55e';
        } else if (result?.status === 'incorrect') {
          context.fillStyle = '#ef4444';
        } else {
          context.fillStyle = '#71717a';
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
        ? performance.now() - pitchSample.timestampMs
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
        const lastTrailSongTime = lastTrailSongTimeRef.current;

        if (
          lastTrailSongTime === null ||
          Math.abs(midiTime - lastTrailSongTime) >=
            VOICE_SAMPLE_MIN_GAP_SECONDS
        ) {
          voiceTrailRef.current = [
            ...voiceTrailRef.current,
            {
              songTime: midiTime,
              midi: displayMidi,
              clarity: pitchSample.clarity,
            },
          ];

          lastTrailSongTimeRef.current = midiTime;
        }
      }

      voiceTrailRef.current = voiceTrailRef.current.filter(
        (point) =>
          point.songTime >= midiTime - VOICE_TRAIL_SECONDS &&
          point.songTime <= midiTime + 0.25,
      );

      const visibleTrailPoints = voiceTrailRef.current
        .map((point) => ({
          ...point,
          x:
            playheadX +
            (point.songTime - midiTime) * PIXELS_PER_SECOND,
          y: midiToY(
            point.midi,
            minMidi,
            maxMidi,
            noteRowHeight,
          ),
        }))
        .filter(
          (point) =>
            point.x >= -20 && point.x <= canvasWidth + 20,
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
          const ageSeconds = Math.max(
            midiTime - point.songTime,
            0,
          );
          const opacity = Math.max(
            1 - ageSeconds / VOICE_TRAIL_SECONDS,
            0.2,
          );

          context.beginPath();
          context.moveTo(previousPoint.x, previousPoint.y);
          context.lineTo(point.x, point.y);
          context.strokeStyle =
            point.clarity >= MIN_RELIABLE_PITCH_CLARITY
              ? `rgba(34, 211, 238, ${opacity})`
              : `rgba(245, 158, 11, ${opacity})`;
          context.lineWidth = 5;
          context.stroke();
        }

        context.restore();
      }

      for (const point of visibleTrailPoints) {
        const ageSeconds = Math.max(
          midiTime - point.songTime,
          0,
        );
        const opacity = Math.max(
          1 - ageSeconds / VOICE_TRAIL_SECONDS,
          0.15,
        );

        context.beginPath();
        context.arc(point.x, point.y, 3.5, 0, Math.PI * 2);
        context.fillStyle =
          point.clarity >= MIN_RELIABLE_PITCH_CLARITY
            ? `rgba(34, 211, 238, ${opacity})`
            : `rgba(245, 158, 11, ${opacity})`;
        context.fill();
      }

      if (hasFreshDetectedPitch) {
        const displayMidi =
          voiceTrailRef.current.at(-1)?.midi ??
          shiftMidiToClosestOctave(
            detectedMidi,
            findReferenceMidi(
              notes,
              midiTime,
              (minMidi + maxMidi) / 2,
            ),
          );
        const isInsideVisibleRange =
          displayMidi >= minMidi &&
          displayMidi <= maxMidi;

        const pitchY =
          midiToY(displayMidi, minMidi, maxMidi, noteRowHeight);
        const pitchColor =
          pitchSample.clarity >= MIN_RELIABLE_PITCH_CLARITY
            ? '#22d3ee'
            : '#f59e0b';

        context.save();
        context.beginPath();
        context.arc(playheadX, pitchY, 11, 0, Math.PI * 2);
        context.fillStyle = `${pitchColor}33`;
        context.fill();

        context.beginPath();
        context.arc(playheadX, pitchY, 6, 0, Math.PI * 2);
        context.fillStyle = pitchColor;
        context.fill();
        context.lineWidth = 2;
        context.strokeStyle = '#ffffff';
        context.stroke();

        context.fillStyle = pitchColor;
        context.font = '12px Inter, sans-serif';
        context.textBaseline = 'middle';
        context.fillText(
          pitchSample.noteName ?? midiToNoteName(detectedMidi),
          playheadX + 14,
          pitchY,
        );

        if (!isInsideVisibleRange) {
          context.fillStyle = '#fca5a5';
          context.font = '11px Inter, sans-serif';
          context.fillText(
            displayMidi > maxMidi
              ? 'por encima'
              : 'por debajo',
            playheadX + 14,
            pitchY + 16,
          );
        }

        context.restore();
      }

      context.beginPath();
      context.moveTo(playheadX, 0);
      context.lineTo(playheadX, canvasHeight);
      context.strokeStyle = '#facc15';
      context.lineWidth = 3;
      context.stroke();

      context.fillStyle = '#facc15';
      context.beginPath();
      context.moveTo(playheadX - 7, 0);
      context.lineTo(playheadX + 7, 0);
      context.lineTo(playheadX, 11);
      context.closePath();
      context.fill();

      context.fillStyle = '#facc15';
      context.font = '12px Inter, sans-serif';
      context.textBaseline = 'top';
      context.fillText(
        `${formatTime(audioTime)} MP3`,
        playheadX + 10,
        7,
      );

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
    getAudioCurrentTime,
    maxMidi,
    midiOffsetMs,
    minMidi,
    notes,
    resultsByNoteId,
  ]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        display: 'block',
        width: '100%',
        height: 420,
        borderRadius: 12,
        border: '1px solid #2f2f33',
      }}
    />
  );
}
