import type { NoteEvent } from '@harmonizer/shared';

import {
  clamp,
  shiftMidiToClosestOctave,
} from '../musicUtils';

import type {
  NoteResult,
  PitchSample,
  ScoringConfig,
} from '../types';

interface NoteAccumulator {
  expectedSamples: number;
  voicedSamples: number;
  correctPitchSamples: number;

  centsErrorSum: number;
  centsErrorSamples: number;

  firstVoicedTime: number | null;
  lastVoicedTime: number | null;

  finalized: boolean;
}

export class ScoringEngine {
  private readonly notes: NoteEvent[];
  private readonly config: ScoringConfig;

  private accumulators = new Map<
    string,
    NoteAccumulator
  >();

  private results = new Map<string, NoteResult>();

  constructor(
    notes: NoteEvent[],
    config: ScoringConfig,
  ) {
    this.notes = [...notes].sort(
      (firstNote, secondNote) =>
        firstNote.startSeconds -
        secondNote.startSeconds,
    );

    this.config = config;
    this.initializeAccumulators();
  }

  private initializeAccumulators(): void {
    this.accumulators.clear();

    for (const note of this.notes) {
      this.accumulators.set(note.id, {
        expectedSamples: 0,
        voicedSamples: 0,
        correctPitchSamples: 0,

        centsErrorSum: 0,
        centsErrorSamples: 0,

        firstVoicedTime: null,
        lastVoicedTime: null,

        finalized: false,
      });
    }
  }

  recordSample(
    songTime: number,
    sample: PitchSample,
  ): NoteResult[] {
    const newResults: NoteResult[] = [];

    for (const note of this.notes) {
      const accumulator =
        this.accumulators.get(note.id);

      if (!accumulator || accumulator.finalized) {
        continue;
      }

      const finalizeTime =
        note.endSeconds +
        this.config.releaseToleranceSeconds;

      if (songTime > finalizeTime) {
        const result = this.finalizeNote(
          note,
          accumulator,
        );

        newResults.push(result);
        continue;
      }

      const isInsideNote =
        songTime >= note.startSeconds &&
        songTime <= note.endSeconds;

      if (!isInsideNote) {
        continue;
      }

      accumulator.expectedSamples += 1;

      const hasReliablePitch =
        sample.detectedMidi !== null &&
        sample.clarity >=
          this.config.minimumClarity;

      if (!hasReliablePitch) {
        continue;
      }

      accumulator.voicedSamples += 1;

      if (accumulator.firstVoicedTime === null) {
        accumulator.firstVoicedTime = songTime;
      }

      accumulator.lastVoicedTime = songTime;

      const normalizedDetectedMidi =
        shiftMidiToClosestOctave(
          sample.detectedMidi!,
          note.midi,
        );

      const centsError =
        (normalizedDetectedMidi - note.midi) * 100;

      accumulator.centsErrorSum +=
        Math.abs(centsError);

      accumulator.centsErrorSamples += 1;

      if (
        Math.abs(centsError) <=
        this.config.pitchToleranceCents
      ) {
        accumulator.correctPitchSamples += 1;
      }
    }

    return newResults;
  }

  finalizeAll(): NoteResult[] {
    const newResults: NoteResult[] = [];

    for (const note of this.notes) {
      const accumulator =
        this.accumulators.get(note.id);

      if (!accumulator || accumulator.finalized) {
        continue;
      }

      const result = this.finalizeNote(
        note,
        accumulator,
      );

      newResults.push(result);
    }

    return newResults;
  }

  reset(): void {
    this.results.clear();
    this.initializeAccumulators();
  }

  private finalizeNote(
    note: NoteEvent,
    accumulator: NoteAccumulator,
  ): NoteResult {
    accumulator.finalized = true;

    const pitchAccuracy =
      accumulator.voicedSamples > 0
        ? accumulator.correctPitchSamples /
          accumulator.voicedSamples
        : 0;

    const coverageAccuracy =
      accumulator.expectedSamples > 0
        ? clamp(
            accumulator.voicedSamples /
              accumulator.expectedSamples,
            0,
            1,
          )
        : 0;

    const onsetAccuracy =
      accumulator.firstVoicedTime !== null
        ? clamp(
            1 -
              Math.abs(
                accumulator.firstVoicedTime -
                  note.startSeconds,
              ) /
                this.config.onsetToleranceSeconds,
            0,
            1,
          )
        : 0;

    const releaseAccuracy =
      accumulator.lastVoicedTime !== null
        ? clamp(
            1 -
              Math.abs(
                accumulator.lastVoicedTime -
                  note.endSeconds,
              ) /
                this.config.releaseToleranceSeconds,
            0,
            1,
          )
        : 0;

    const rhythmAccuracy =
      coverageAccuracy * 0.6 +
      onsetAccuracy * 0.25 +
      releaseAccuracy * 0.15;

    const finalAccuracy =
      pitchAccuracy * 0.75 +
      rhythmAccuracy * 0.25;

    const meanAbsoluteCentsError =
      accumulator.centsErrorSamples > 0
        ? accumulator.centsErrorSum /
          accumulator.centsErrorSamples
        : null;

    const result: NoteResult = {
      noteId: note.id,
      expectedMidi: note.midi,
      expectedStart: note.startSeconds,
      expectedEnd: note.endSeconds,
      pitchAccuracy,
      rhythmAccuracy,
      finalAccuracy,
      meanAbsoluteCentsError,
      status:
        finalAccuracy >=
        this.config.correctNoteThreshold
          ? 'correct'
          : 'incorrect',
    };

    this.results.set(note.id, result);

    return result;
  }
}
