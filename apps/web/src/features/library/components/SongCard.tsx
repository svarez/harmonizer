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
  onOpen: () => void;
}

export function SongCard({
  song,
  loading,
  onOpen,
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

        <Button
          loading={loading}
          onClick={onOpen}
        >
          Seleccionar canción
        </Button>
      </Stack>
    </Card>
  );
}