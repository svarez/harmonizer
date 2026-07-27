import type {
  Song,
  SongSummary,
} from '@harmonizer/shared';

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
    // La respuesta no contiene JSON válido.
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