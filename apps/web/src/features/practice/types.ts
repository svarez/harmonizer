export type MicrophoneStatus =
  | 'idle'
  | 'requesting'
  | 'running'
  | 'error';

export interface PitchSample {
  timestampMs: number;
  frequency: number | null;
  detectedMidi: number | null;
  noteName: string | null;
  clarity: number;
  intensity: number;
  centsFromNearestNote: number | null;
}

export interface ScoringConfig {
  pitchToleranceCents: number;
  minimumClarity: number;
  correctNoteThreshold: number;
  onsetToleranceSeconds: number;
  releaseToleranceSeconds: number;
}

export interface NoteResult {
  noteId: string;
  expectedMidi: number;
  expectedStart: number;
  expectedEnd: number;
  pitchAccuracy: number;
  rhythmAccuracy: number;
  finalAccuracy: number;
  meanAbsoluteCentsError: number | null;
  status: 'correct' | 'incorrect';
}

export interface PracticeSummary {
  globalAccuracy: number;
  pitchAccuracy: number;
  rhythmAccuracy: number;
  correctNotes: number;
  incorrectNotes: number;
  evaluatedNotes: number;
}
