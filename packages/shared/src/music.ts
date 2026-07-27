export interface NoteEvent {
  id: string;
  midi: number;
  startSeconds: number;
  durationSeconds: number;
  endSeconds: number;
  velocity?: number;
}

export interface SongTrack {
  id: string;
  name: string;
  instrument?: string;
  notes: NoteEvent[];
  minMidi: number;
  maxMidi: number;
}

export interface Song {
  id: string;
  title: string;
  artist?: string;
  audioUrl: string;
  durationSeconds: number;
  detectedMidiInitialSilenceMs?: number;
  midiOffsetMs: number;
  tracks: SongTrack[];
  createdAt?: string;
}

export interface SongSummary {
  id: string;
  title: string;
  artist?: string;
  audioUrl: string;
  durationSeconds: number;
  detectedMidiInitialSilenceMs?: number;
  midiOffsetMs: number;
  trackCount: number;
  createdAt?: string;
}
