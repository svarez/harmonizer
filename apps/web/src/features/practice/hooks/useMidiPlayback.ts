import {
  useCallback,
  useEffect,
  useRef,
} from 'react';

import type { NoteEvent } from '@harmonizer/shared';

import { midiToFrequency } from '../musicUtils';

export interface MidiPlaybackNote extends NoteEvent {
  playbackId?: string;
  volume?: number;
}

interface UseMidiPlaybackOptions {
  enabled: boolean;
  isPlaying: boolean;
  notes: MidiPlaybackNote[];
  getCurrentTime: () => number;
  midiOffsetMs: number;
  midiTimeScale: number;
  playbackRate: number;
}

const LOOKAHEAD_SECONDS = 0.25;
const SCHEDULER_INTERVAL_MS = 40;
const SEEK_RESET_THRESHOLD_SECONDS = 0.35;
const NOTE_VOLUME = 0.08;

export function useMidiPlayback({
  enabled,
  isPlaying,
  notes,
  getCurrentTime,
  midiOffsetMs,
  midiTimeScale,
  playbackRate,
}: UseMidiPlaybackOptions) {
  const audioContextRef =
    useRef<AudioContext | null>(null);
  const scheduledNoteIdsRef = useRef<Set<string>>(
    new Set(),
  );
  const activeSourcesRef = useRef<
    Set<OscillatorNode>
  >(new Set());
  const previousSongTimeRef = useRef<number | null>(
    null,
  );

  const stopActiveSources = useCallback(() => {
    for (const source of activeSourcesRef.current) {
      source.stop();
      source.disconnect();
    }

    activeSourcesRef.current.clear();
  }, []);

  const prepare = useCallback(async () => {
    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContext();
    }

    if (audioContextRef.current.state !== 'running') {
      await audioContextRef.current.resume();
    }
  }, []);

  const resetScheduler = useCallback(() => {
    scheduledNoteIdsRef.current.clear();
    previousSongTimeRef.current = null;
    stopActiveSources();
  }, [stopActiveSources]);

  useEffect(() => {
    resetScheduler();
  }, [notes, midiOffsetMs, midiTimeScale, resetScheduler]);

  useEffect(() => {
    if (!enabled || !isPlaying) {
      resetScheduler();
      return undefined;
    }

    let intervalId = 0;
    let cancelled = false;

    const schedule = () => {
      const audioContext = audioContextRef.current;

      if (!audioContext || audioContext.state !== 'running') {
        return;
      }

      const songTime = getCurrentTime();
      const previousSongTime = previousSongTimeRef.current;

      if (
        previousSongTime !== null &&
        Math.abs(songTime - previousSongTime) >
          SEEK_RESET_THRESHOLD_SECONDS
      ) {
        scheduledNoteIdsRef.current.clear();
        stopActiveSources();
      }

      previousSongTimeRef.current = songTime;

      const visibleEndTime =
        songTime + LOOKAHEAD_SECONDS * playbackRate;
      const offsetSeconds = midiOffsetMs / 1000;

      for (const note of notes) {
        const audibleStart =
          note.startSeconds * midiTimeScale + offsetSeconds;
        const audibleEnd =
          note.endSeconds * midiTimeScale + offsetSeconds;

        const playbackId = note.playbackId ?? note.id;

        if (
          audibleEnd < songTime ||
          audibleStart > visibleEndTime ||
          scheduledNoteIdsRef.current.has(playbackId)
        ) {
          continue;
        }

        scheduledNoteIdsRef.current.add(playbackId);

        const startDelay = Math.max(
          (audibleStart - songTime) / playbackRate,
          0,
        );
        const startTime =
          audioContext.currentTime + startDelay;
        const duration = Math.max(
          (audibleEnd - Math.max(songTime, audibleStart)) /
            playbackRate,
          0.04,
        );
        const stopTime = startTime + duration;

        const noteVolume = note.volume ?? NOTE_VOLUME;
        const oscillator =
          audioContext.createOscillator();
        const gain = audioContext.createGain();

        oscillator.type = 'triangle';
        oscillator.frequency.setValueAtTime(
          midiToFrequency(note.midi),
          startTime,
        );

        gain.gain.setValueAtTime(0, startTime);
        gain.gain.linearRampToValueAtTime(
          noteVolume,
          startTime + 0.01,
        );
        gain.gain.setValueAtTime(
          noteVolume,
          Math.max(startTime + 0.01, stopTime - 0.03),
        );
        gain.gain.linearRampToValueAtTime(0, stopTime);

        oscillator.connect(gain);
        gain.connect(audioContext.destination);

        oscillator.start(startTime);
        oscillator.stop(stopTime + 0.02);
        activeSourcesRef.current.add(oscillator);

        oscillator.addEventListener('ended', () => {
          activeSourcesRef.current.delete(oscillator);
          oscillator.disconnect();
          gain.disconnect();
        });
      }
    };

    void prepare().then(() => {
      if (cancelled) {
        return;
      }

      schedule();
      intervalId = window.setInterval(
        schedule,
        SCHEDULER_INTERVAL_MS,
      );
    });

    return () => {
      cancelled = true;

      if (intervalId) {
        window.clearInterval(intervalId);
      }

      resetScheduler();
    };
  }, [
    enabled,
    getCurrentTime,
    isPlaying,
    midiOffsetMs,
    midiTimeScale,
    notes,
    playbackRate,
    prepare,
    resetScheduler,
    stopActiveSources,
  ]);

  useEffect(() => {
    return () => {
      resetScheduler();
      void audioContextRef.current?.close();
      audioContextRef.current = null;
    };
  }, [resetScheduler]);

  return {
    prepare,
    reset: resetScheduler,
  };
}
