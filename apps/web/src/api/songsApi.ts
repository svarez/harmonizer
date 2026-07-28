import type {
  Song,
  SongLyricsUpdate,
  SongSynchronization,
  SongSummary,
} from '@harmonizer/shared';

import { getAdminHeaders } from '../features/adminAccess';

interface ApiErrorResponse {
  message?: string;
}

async function parseResponse<T>(
  response: Response,
): Promise<T> {
  if (response.ok) {
    return (await response.json()) as T;
  }

  let message = `Error HTTP ${response.status}`;

  try {
    const body =
      (await response.json()) as ApiErrorResponse;

    if (body.message) {
      message = body.message;
    }
  } catch {
    // The response does not contain valid JSON.
  }

  throw new Error(message);
}

export async function getSongs(): Promise<
  SongSummary[]
> {
  const response = await fetch('/api/songs');

  return parseResponse<SongSummary[]>(
    response,
  );
}

export async function getSong(
  songId: string,
): Promise<Song> {
  const response = await fetch(
    `/api/songs/${encodeURIComponent(songId)}`,
  );

  return parseResponse<Song>(response);
}

export async function updateSongSynchronization(
  songId: string,
  synchronization: SongSynchronization,
): Promise<Song> {
  const response = await fetch(
    `/api/songs/${encodeURIComponent(songId)}/synchronization`,
    {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...getAdminHeaders(),
      },
      body: JSON.stringify(synchronization),
    },
  );

  return parseResponse<Song>(response);
}

export async function updateSongLyrics(
  songId: string,
  lyricsUpdate: SongLyricsUpdate,
): Promise<Song> {
  const response = await fetch(
    `/api/songs/${encodeURIComponent(songId)}/lyrics`,
    {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...getAdminHeaders(),
      },
      body: JSON.stringify(lyricsUpdate),
    },
  );

  return parseResponse<Song>(response);
}

export async function updateSongCover(
  songId: string,
  coverImage: File,
): Promise<Song> {
  const formData = new FormData();
  formData.append('coverImage', coverImage);

  const response = await fetch(
    `/api/songs/${encodeURIComponent(songId)}/cover`,
    {
      method: 'PATCH',
      headers: getAdminHeaders(),
      body: formData,
    },
  );

  return parseResponse<Song>(response);
}

export async function deleteSong(
  songId: string,
): Promise<void> {
  const response = await fetch(
    `/api/songs/${encodeURIComponent(songId)}`,
    {
      method: 'DELETE',
      headers: getAdminHeaders(),
    },
  );

  if (response.status === 204) {
    return;
  }

  await parseResponse<never>(response);
}
