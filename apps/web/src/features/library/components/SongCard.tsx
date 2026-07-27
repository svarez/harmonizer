import {
  Badge,
  Button,
  Card,
  Group,
  Stack,
  Text,
  Title,
} from '@mantine/core';

import type { SongSummary } from '@harmonizer/shared';

import { formatTime } from '../../practice/musicUtils';

interface SongCardProps {
  song: SongSummary;
  loading: boolean;
  deleting: boolean;
  onOpen: () => void;
  onDelete: () => void;
}

export function SongCard({
  song,
  loading,
  deleting,
  onOpen,
  onDelete,
}: SongCardProps) {
  return (
    <Card
      withBorder
      radius="lg"
      padding="lg"
    >
      <Stack gap="md">
        <div>
          <Title order={3}>
            {song.title}
          </Title>

          <Text c="dimmed">
            {song.artist || 'Artista desconocido'}
          </Text>
        </div>

        <Group>
          <Badge variant="light">
            {song.trackCount}{' '}
            {song.trackCount === 1
              ? 'pista'
              : 'pistas'}
          </Badge>

          <Badge
            variant="light"
            color="gray"
          >
            {formatTime(song.durationSeconds)}
          </Badge>
        </Group>

        <Group grow>
          <Button
            loading={loading}
            disabled={deleting}
            onClick={onOpen}
          >
            Seleccionar canción
          </Button>

          <Button
            variant="light"
            color="red"
            loading={deleting}
            disabled={loading}
            onClick={onDelete}
          >
            Eliminar
          </Button>
        </Group>
      </Stack>
    </Card>
  );
}
