import {
  useCallback,
  useMemo,
  useState,
} from 'react';

import type { NoteEvent } from '@harmonizer/shared';

import { usePitchDetection } from './usePitchDetection';
import { ScoringEngine } from '../scoring/ScoringEngine';

import type {
  NoteResult,
  PitchSample,
  PracticeSummary,
  ScoringConfig,
} from '../types';

interface UsePracticeSessionOptions {
  getAudioElement: () => HTMLAudioElement | null;
  notes: NoteEvent[];
  scoringConfig: ScoringConfig;
  midiOffsetMs: number;
  midiTimeScale: number;
  latencyCompensationMs: number;
  onVisualPitchSample?: (sample: PitchSample) => void;
}

const EMPTY_RESULTS: NoteResult[] = [];

function mergeResults(
  currentResults: NoteResult[],
  newResults: NoteResult[],
): NoteResult[] {
  const resultsMap = new Map(
    currentResults.map((result) => [
      result.noteId,
      result,
    ]),
  );

  for (const result of newResults) {
    resultsMap.set(result.noteId, result);
  }

  return [...resultsMap.values()].sort(
    (firstResult, secondResult) =>
      firstResult.expectedStart -
      secondResult.expectedStart,
  );
}

function calculateSummary(
  notes: NoteEvent[],
  results: NoteResult[],
): PracticeSummary {
  if (results.length === 0) {
    return {
      globalAccuracy: 0,
      pitchAccuracy: 0,
      rhythmAccuracy: 0,
      correctNotes: 0,
      incorrectNotes: 0,
      evaluatedNotes: 0,
    };
  }

  const notesById = new Map(
    notes.map((note) => [note.id, note]),
  );

  let totalDuration = 0;
  let weightedGlobalAccuracy = 0;
  let weightedPitchAccuracy = 0;
  let weightedRhythmAccuracy = 0;

  let correctNotes = 0;
  let incorrectNotes = 0;

  for (const result of results) {
    const note = notesById.get(result.noteId);
    const duration =
      note?.durationSeconds ??
      result.expectedEnd - result.expectedStart;

    totalDuration += duration;

    weightedGlobalAccuracy +=
      result.finalAccuracy * duration;

    weightedPitchAccuracy +=
      result.pitchAccuracy * duration;

    weightedRhythmAccuracy +=
      result.rhythmAccuracy * duration;

    if (result.status === 'correct') {
      correctNotes += 1;
    } else {
      incorrectNotes += 1;
    }
  }

  return {
    globalAccuracy:
      totalDuration > 0
        ? weightedGlobalAccuracy / totalDuration
        : 0,

    pitchAccuracy:
      totalDuration > 0
        ? weightedPitchAccuracy / totalDuration
        : 0,

    rhythmAccuracy:
      totalDuration > 0
        ? weightedRhythmAccuracy / totalDuration
        : 0,

    correctNotes,
    incorrectNotes,
    evaluatedNotes: results.length,
  };
}

export function usePracticeSession({
  getAudioElement,
  notes,
  scoringConfig,
  midiOffsetMs,
  midiTimeScale,
  latencyCompensationMs,
  onVisualPitchSample,
}: UsePracticeSessionOptions) {
  const scoringEngine = useMemo(
    () =>
      new ScoringEngine(
        notes,
        scoringConfig,
      ),
    [notes, scoringConfig],
  );

  const sessionKey = useMemo(
    () => ({ notes, scoringConfig }),
    [notes, scoringConfig],
  );

  const [resultState, setResultState] =
    useState(() => ({
      sessionKey,
      results: EMPTY_RESULTS,
    }));

  const results =
    resultState.sessionKey === sessionKey
      ? resultState.results
      : EMPTY_RESULTS;

  const handlePitchSample = useCallback(
    (sample: PitchSample) => {
      const audio = getAudioElement();

      if (
        !audio ||
        audio.paused ||
        audio.ended
      ) {
        return;
      }

      /*
       * Offset positivo:
       * retrasa las notas MIDI respecto al MP3.
       *
       * Latencia:
       * retrocede el instante de evaluación para compensar
       * el retardo del micrófono y del procesamiento.
       */
      const evaluationTime =
        (audio.currentTime -
          midiOffsetMs / 1000 -
          latencyCompensationMs / 1000) /
        midiTimeScale;

      const newResults = scoringEngine.recordSample(
        evaluationTime,
        sample,
      );

      if (newResults.length > 0) {
        setResultState((currentState) => ({
          sessionKey,
          results: mergeResults(
            currentState.sessionKey === sessionKey
              ? currentState.results
              : EMPTY_RESULTS,
            newResults,
          ),
        }));
      }
    },
    [
      getAudioElement,
      latencyCompensationMs,
      midiOffsetMs,
      midiTimeScale,
      scoringEngine,
      sessionKey,
    ],
  );

  const pitchDetection =
    usePitchDetection(handlePitchSample, {
      onVisualSample: onVisualPitchSample,
    });

  const finish = useCallback(() => {
    const remainingResults =
      scoringEngine.finalizeAll();

    if (remainingResults.length > 0) {
      setResultState((currentState) => ({
        sessionKey,
        results: mergeResults(
          currentState.sessionKey === sessionKey
            ? currentState.results
            : EMPTY_RESULTS,
          remainingResults,
        ),
      }));
    }
  }, [scoringEngine, sessionKey]);

  const reset = useCallback(() => {
    scoringEngine.reset();
    setResultState({
      sessionKey,
      results: EMPTY_RESULTS,
    });
  }, [scoringEngine, sessionKey]);

  const resultsByNoteId = useMemo(() => {
    return Object.fromEntries(
      results.map((result) => [
        result.noteId,
        result,
      ]),
    );
  }, [results]);

  const summary = useMemo(() => {
    return calculateSummary(notes, results);
  }, [notes, results]);

  return {
    results,
    resultsByNoteId,
    summary,
    isFinished:
      notes.length > 0 &&
      results.length === notes.length,

    finish,
    reset,

    microphoneStatus: pitchDetection.status,
    pitchSample: pitchDetection.sample,
    microphoneError: pitchDetection.error,
    startMicrophone: pitchDetection.start,
    stopMicrophone: pitchDetection.stop,
  };
}
