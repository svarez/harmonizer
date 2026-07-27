-- Add midi time scaling metadata without rewriting note timings.
ALTER TABLE "Song" ADD COLUMN "midiTimeScale" REAL NOT NULL DEFAULT 1.0;
