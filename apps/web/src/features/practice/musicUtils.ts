const NOTE_NAMES = [
  'C',
  'C♯',
  'D',
  'D♯',
  'E',
  'F',
  'F♯',
  'G',
  'G♯',
  'A',
  'A♯',
  'B',
];

export const MIN_RELIABLE_PITCH_CLARITY = 0.85;

export function frequencyToMidi(frequency: number): number {
  return 69 + 12 * Math.log2(frequency / 440);
}

export function midiToFrequency(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12);
}

export function midiToNoteName(midi: number): string {
  const roundedMidi = Math.round(midi);
  const noteIndex = ((roundedMidi % 12) + 12) % 12;
  const octave = Math.floor(roundedMidi / 12) - 1;

  return `${NOTE_NAMES[noteIndex]}${octave}`;
}

export function shiftMidiToClosestOctave(
  midi: number,
  referenceMidi: number,
): number {
  if (
    !Number.isFinite(midi) ||
    !Number.isFinite(referenceMidi)
  ) {
    return midi;
  }

  const octaveShift = Math.round(
    (referenceMidi - midi) / 12,
  );

  return midi + octaveShift * 12;
}

export function centsFromNearestMidiNote(midi: number): number {
  return (midi - Math.round(midi)) * 100;
}

export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) {
    return '00:00';
  }

  const totalSeconds = Math.floor(seconds);
  const minutes = Math.floor(totalSeconds / 60);
  const remainingSeconds = totalSeconds % 60;

  return `${String(minutes).padStart(2, '0')}:${String(
    remainingSeconds,
  ).padStart(2, '0')}`;
}

export function clamp(
  value: number,
  minimum: number,
  maximum: number,
): number {
  return Math.min(Math.max(value, minimum), maximum);
}
