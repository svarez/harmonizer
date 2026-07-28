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
  weightedMidiSum: number;
  weightedMidiSamples: number;
  pitchBuckets: Map<number, PitchBucket>;

  firstVoicedTime: number | null;
  lastVoicedTime: number | null;

  finalized: boolean;
}

interface PitchBucket {
  totalSamples: number;
  weightedMidiSum: number;
  weightedMidiSamples: number;
  midiCounts: Map<number, number>;
}

const PITCH_BUCKET_SECONDS = 0.1;
const PITCH_BUCKET_DOMINANCE = 0.55;

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
        weightedMidiSum: 0,
        weightedMidiSamples: 0,
        pitchBuckets: new Map(),

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
      const sampleWeight = Math.max(
        sample.clarity,
        0.001,
      );

      const centsError =
        (normalizedDetectedMidi - note.midi) * 100;

      accumulator.weightedMidiSum +=
        normalizedDetectedMidi * sampleWeight;
      accumulator.weightedMidiSamples += sampleWeight;
      const bucketIndex = Math.floor(
        (songTime - note.startSeconds) /
          PITCH_BUCKET_SECONDS,
      );
      const roundedMidi = Math.round(normalizedDetectedMidi);
      const bucket =
        accumulator.pitchBuckets.get(bucketIndex) ?? {
          totalSamples: 0,
          weightedMidiSum: 0,
          weightedMidiSamples: 0,
          midiCounts: new Map<number, number>(),
        };

      bucket.totalSamples += 1;
      bucket.weightedMidiSum +=
        normalizedDetectedMidi * sampleWeight;
      bucket.weightedMidiSamples += sampleWeight;
      bucket.midiCounts.set(
        roundedMidi,
        (bucket.midiCounts.get(roundedMidi) ?? 0) + 1,
      );
      accumulator.pitchBuckets.set(bucketIndex, bucket);

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

    const samplePitchAccuracy =
      accumulator.voicedSamples > 0
        ? accumulator.correctPitchSamples /
          accumulator.voicedSamples
        : 0;

    const meanDetectedMidi =
      accumulator.weightedMidiSamples > 0
        ? accumulator.weightedMidiSum /
          accumulator.weightedMidiSamples
        : null;

    const meanCentsError =
      meanDetectedMidi !== null
        ? (meanDetectedMidi - note.midi) * 100
        : null;

    const meanPitchAccuracy =
      meanCentsError !== null
        ? clamp(
            1 -
              Math.abs(meanCentsError) /
                (this.config.pitchToleranceCents * 1.8),
            0,
            1,
          )
        : 0;

    const pitchBucketResults = [
      ...accumulator.pitchBuckets.values(),
    ].map((bucket) => {
      const dominantEntry = [
        ...bucket.midiCounts.entries(),
      ].sort(
        ([, firstCount], [, secondCount]) =>
          secondCount - firstCount,
      )[0];
      const dominantShare = dominantEntry
        ? dominantEntry[1] / bucket.totalSamples
        : 0;

      if (
        dominantEntry &&
        dominantShare >= PITCH_BUCKET_DOMINANCE
      ) {
        return dominantEntry[0];
      }

      return bucket.weightedMidiSamples > 0
        ? bucket.weightedMidiSum / bucket.weightedMidiSamples
        : null;
    });

    const evaluatedPitchBuckets =
      pitchBucketResults.filter(
        (bucketMidi): bucketMidi is number =>
          bucketMidi !== null,
      );
    const correctPitchBuckets =
      evaluatedPitchBuckets.filter(
        (bucketMidi) =>
          Math.abs((bucketMidi - note.midi) * 100) <=
          this.config.pitchToleranceCents,
      );
    const bucketPitchAccuracy =
      evaluatedPitchBuckets.length > 0
        ? correctPitchBuckets.length /
          evaluatedPitchBuckets.length
        : 0;

    const pitchAccuracy = Math.max(
      samplePitchAccuracy,
      bucketPitchAccuracy,
      meanPitchAccuracy,
    );

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
      meanCentsError !== null
        ? Math.abs(meanCentsError)
        : accumulator.centsErrorSamples > 0
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
