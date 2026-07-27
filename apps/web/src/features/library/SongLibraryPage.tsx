import {
  Alert,
  Button,
  Container,
  Group,
  Loader,
  SimpleGrid,
  Stack,
  Text,
  Title,
} from '@mantine/core';

import {
  useCallback,
  useEffect,
  useState,
} from 'react';

import type {
  Song,
  SongSummary,
} from '@harmonizer/shared';

import {
  getSong,
  getSongs,
} from '../../api/songsApi';

import { SongCard } from './components/SongCard';

interface SongLibraryPageProps {
  onSelectSong: (song: Song) => void;
}

export function SongLibraryPage({
  onSelectSong,
}: SongLibraryPageProps) {
  const [songs, setSongs] = useState<
    SongSummary[]
  >([]);

  const [loading, setLoading] =
    useState(true);

  const [openingSongId, setOpeningSongId] =
    useState<string | null>(null);

  const [error, setError] =
    useState<string | null>(null);

  const loadSongs = useCallback(
    async (): Promise<void> => {
      setLoading(true);
      setError(null);

      try {
        const loadedSongs =
          await getSongs();

        setSongs(loadedSongs);
      } catch (caughtError) {
        setError(
          caughtError instanceof Error
            ? caughtError.message
            : 'No se ha podido cargar la biblioteca',
        );
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    let cancelled = false;

    async function loadInitialSongs() {
      try {
        const loadedSongs =
          await getSongs();

        if (!cancelled) {
          setSongs(loadedSongs);
        }
      } catch (caughtError) {
        if (!cancelled) {
          setError(
            caughtError instanceof Error
              ? caughtError.message
              : 'No se ha podido cargar la biblioteca',
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadInitialSongs();

    return () => {
      cancelled = true;
    };
  }, []);

  const handleOpenSong = async (
    songSummary: SongSummary,
  ): Promise<void> => {
    setOpeningSongId(songSummary.id);
    setError(null);

    try {
      const song = await getSong(
        songSummary.id,
      );

      onSelectSong(song);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : 'No se ha podido abrir la canción',
      );
    } finally {
      setOpeningSongId(null);
    }
  };

  return (
    <Container size="xl" py="xl">
      <Stack gap="xl">
        <div>
          <Text
            size="sm"
            fw={700}
            c="indigo.3"
            tt="uppercase"
          >
            Harmonizer
          </Text>

          <Title order={1}>
            Biblioteca de canciones
          </Title>

          <Text c="dimmed" mt={4}>
            Selecciona una canción para
            elegir la pista que quieres
            practicar.
          </Text>
        </div>

        {error && (
          <Alert
            color="red"
            title="Error"
          >
            <Stack gap="sm">
              <Text>{error}</Text>

              <Button
                variant="light"
                color="red"
                onClick={() => {
                  void loadSongs();
                }}
              >
                Volver a intentar
              </Button>
            </Stack>
          </Alert>
        )}

        {loading ? (
          <Group justify="center" py="xl">
            <Loader />
            <Text>
              Cargando biblioteca...
            </Text>
          </Group>
        ) : songs.length === 0 ? (
          <Alert
            color="blue"
            title="No hay canciones"
          >
            Carga la primera canción mediante
            Postman usando POST /api/songs.
          </Alert>
        ) : (
          <SimpleGrid
            cols={{
              base: 1,
              sm: 2,
              lg: 3,
            }}
          >
            {songs.map((song) => (
              <SongCard
                key={song.id}
                song={song}
                loading={
                  openingSongId === song.id
                }
                onOpen={() => {
                  void handleOpenSong(song);
                }}
              />
            ))}
          </SimpleGrid>
        )}
      </Stack>
    </Container>
  );
}
