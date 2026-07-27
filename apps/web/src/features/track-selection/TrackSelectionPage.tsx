import {
  Alert,
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
import { getVocalTracks } from '../vocalTracks';

interface TrackSelectionPageProps {
  song: Song;
  onSelectTrack: (track: SongTrack) => void;
  onSynchronize: () => void;
  onSynchronizeLyrics: () => void;
  onBack: () => void;
}

export function TrackSelectionPage({
  song,
  onSelectTrack,
  onSynchronize,
  onSynchronizeLyrics,
  onBack,
}: TrackSelectionPageProps) {
  const vocalTracks = getVocalTracks(song);

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

          <Button
            variant="light"
            onClick={onSynchronize}
            mb="md"
            ml="sm"
          >
            Sincronizar MP3/MIDI
          </Button>

          <Button
            variant="light"
            onClick={onSynchronizeLyrics}
            mb="md"
            ml="sm"
          >
            Sincronizar letras
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
          Selecciona la pista vocal que quieres practicar.
        </Text>

        {vocalTracks.length === 0 ? (
          <Alert color="yellow" title="Sin pistas vocales">
            No se ha detectado ninguna pista vocal en esta canción.
          </Alert>
        ) : (
          <SimpleGrid
            cols={{
              base: 1,
              sm: 2,
              lg: 3,
            }}
          >
            {vocalTracks.map((track) => (
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
                      {track.instrument || 'Voz'}
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
        )}
      </Stack>
    </Container>
  );
}
