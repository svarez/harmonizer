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

export interface SyncedLyricWord {
  id: string;
  startSeconds: number;
  durationSeconds?: number;
  noteId?: string;
  text: string;
}

export interface Song {
  id: string;
  title: string;
  artist?: string;
  audioUrl: string;
  coverUrl?: string;
  durationSeconds: number;
  detectedMidiInitialSilenceMs?: number;
  midiOffsetMs: number;
  midiTimeScale: number;
  lyrics: SyncedLyricWord[];
  lyricsByTrackId?: Record<string, SyncedLyricWord[]>;
  tracks: SongTrack[];
  createdAt?: string;
}

export interface SongSummary {
  id: string;
  title: string;
  artist?: string;
  audioUrl: string;
  coverUrl?: string;
  durationSeconds: number;
  detectedMidiInitialSilenceMs?: number;
  midiOffsetMs: number;
  midiTimeScale: number;
  trackCount: number;
  createdAt?: string;
}

export interface SongSynchronization {
  midiOffsetMs: number;
  midiTimeScale: number;
}

export interface SongLyricsUpdate {
  lyrics: SyncedLyricWord[];
  lyricsByTrackId?: Record<string, SyncedLyricWord[]>;
}
