import {
  Badge,
  Button,
  Card,
  Container,
  Group,
  SimpleGrid,
  Stack,
  Text,
  Title,
} from '@mantine/core';

import type {
  Song,
  SongTrack,
} from '@harmonizer/shared';

import { midiToNoteName } from '../practice/musicUtils';

interface TrackSelectionPageProps {
  song: Song;
  onSelectTrack: (track: SongTrack) => void;
  onBack: () => void;
}

export function TrackSelectionPage({
  song,
  onSelectTrack,
  onBack,
}: TrackSelectionPageProps) {
  return (
    <Container size="xl" py="xl">
      <Stack gap="xl">
        <div>
          <Button
            variant="subtle"
            onClick={onBack}
            mb="md"
          >
            ← Volver a la biblioteca
          </Button>

          <Text
            size="sm"
            fw={700}
            c="indigo.3"
            tt="uppercase"
          >
            Selección de pista
          </Text>

          <Title order={1}>
            {song.title}
          </Title>

          <Text c="dimmed">
            {song.artist || 'Artista desconocido'}
          </Text>
        </div>

        <Text>
          Selecciona la voz o instrumento que
          quieres practicar.
        </Text>

        <SimpleGrid
          cols={{
            base: 1,
            sm: 2,
            lg: 3,
          }}
        >
          {song.tracks.map((track) => (
            <Card
              key={track.id}
              withBorder
              radius="lg"
              padding="lg"
            >
              <Stack gap="md">
                <div>
                  <Title order={3}>
                    {track.name}
                  </Title>

                  <Text c="dimmed">
                    {track.instrument ||
                      'Instrumento no especificado'}
                  </Text>
                </div>

                <Group>
                  <Badge variant="light">
                    {track.notes.length}{' '}
                    {track.notes.length === 1
                      ? 'nota'
                      : 'notas'}
                  </Badge>

                  <Badge
                    variant="light"
                    color="gray"
                  >
                    {midiToNoteName(
                      track.minMidi,
                    )}
                    {' – '}
                    {midiToNoteName(
                      track.maxMidi,
                    )}
                  </Badge>
                </Group>

                <Button
                  onClick={() => {
                    onSelectTrack(track);
                  }}
                >
                  Practicar esta pista
                </Button>
              </Stack>
            </Card>
          ))}
        </SimpleGrid>
      </Stack>
    </Container>
  );
}