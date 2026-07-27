import type {
  Song,
  SongTrack,
} from '@harmonizer/shared';

export function isLikelyVocalTrack(
  track: SongTrack,
): boolean {
  const description = `${track.name} ${track.instrument ?? ''}`
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '');

  return /\b(voice|voices|vocal|vocals|vox|singer|choir|coro|voz|voces)\b/.test(
    description,
  );
}

export function getVocalTracks(
  song: Song,
): SongTrack[] {
  return song.tracks.filter(isLikelyVocalTrack);
}

export function getDefaultVocalTrack(
  song: Song,
): SongTrack | null {
  return getVocalTracks(song)[0] ?? null;
}
