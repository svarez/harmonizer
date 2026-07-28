import {
  useRef,
} from 'react';

import {
  Button,
  Card,
  Stack,
  Text,
  Title,
} from '@mantine/core';

import type { SongSummary } from '@harmonizer/shared';

interface SongCardProps {
  song: SongSummary;
  loading: boolean;
  deleting: boolean;
  adminAccess?: boolean;
  onOpen: () => void;
  onDelete: () => void;
  onUpdateCover?: (coverImage: File) => void;
  onSynchronize?: () => void;
  onSynchronizeLyrics?: () => void;
}

export function SongCard({
  song,
  loading,
  deleting,
  adminAccess = false,
  onOpen,
  onDelete,
  onUpdateCover,
  onSynchronize,
  onSynchronizeLyrics,
}: SongCardProps) {
  const coverInputRef =
    useRef<HTMLInputElement | null>(null);
  const hasCover = Boolean(song.coverUrl);
  const selectionDisabled = loading || deleting;

  const handleSelect = (): void => {
    if (!selectionDisabled) {
      onOpen();
    }
  };

  return (
    <Card
      className="library-song-card"
      radius="md"
      padding={0}
      role="button"
      tabIndex={selectionDisabled ? -1 : 0}
      aria-disabled={selectionDisabled}
      onClick={handleSelect}
      onKeyDown={(event) => {
        if (
          event.key === 'Enter' ||
          event.key === ' '
        ) {
          event.preventDefault();
          handleSelect();
        }
      }}
    >
      <Stack gap="lg">
        <div className="library-song-cover-frame">
          {hasCover ? (
            <img
              className="library-song-cover"
              src={song.coverUrl}
              alt=""
            />
          ) : (
            <div className="library-song-cover library-song-cover--fallback" />
          )}

          <div className="library-song-copy">

            <Text className="library-song-artist">
              {song.artist || 'Artista desconocido'}
            </Text>
            
            <Title className="library-song-title" order={3}>
              {song.title}
            </Title>
          </div>
        </div>

        {adminAccess && (
          <Stack
            gap="sm"
            onClick={(event) => {
              event.stopPropagation();
            }}
            onKeyDown={(event) => {
              event.stopPropagation();
            }}
          >
            <Button
              className="library-song-danger"
              variant="light"
              color="red"
              loading={deleting}
              disabled={loading}
              onClick={() => {
                onDelete();
              }}
            >
              Eliminar
            </Button>

            <input
              ref={coverInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              hidden
              onClick={(event) => {
                event.stopPropagation();
              }}
              onChange={(event) => {
                const coverImage =
                  event.currentTarget.files?.[0];

                if (coverImage) {
                  onUpdateCover?.(coverImage);
                }

                event.currentTarget.value = '';
              }}
            />

            <Button
              className="library-song-secondary"
              variant="light"
              loading={loading}
              disabled={deleting}
              onClick={() => {
                coverInputRef.current?.click();
              }}
            >
              Cambiar portada
            </Button>

            <Button
              className="library-song-secondary"
              variant="light"
              loading={loading}
              disabled={deleting}
              onClick={() => {
                onSynchronize?.();
              }}
            >
              Sincronizar MP3/MIDI
            </Button>

            <Button
              className="library-song-secondary"
              variant="light"
              loading={loading}
              disabled={deleting}
              onClick={() => {
                onSynchronizeLyrics?.();
              }}
            >
              Sincronizar letras
            </Button>
          </Stack>
        )}
      </Stack>
    </Card>
  );
}
