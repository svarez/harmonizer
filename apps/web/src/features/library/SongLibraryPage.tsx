import {
  Alert,
  Button,
  Container,
  Group,
  Loader,
  Modal,
  PasswordInput,
  SimpleGrid,
  Stack,
  Text,
  Title,
} from '@mantine/core';

import {
  type FormEvent,
  useCallback,
  useEffect,
  useState,
} from 'react';

import type {
  Song,
  SongSummary,
} from '@harmonizer/shared';

import {
  deleteSong,
  getSong,
  getSongs,
  updateSongCover,
} from '../../api/songsApi';

import { SongCard } from './components/SongCard';

interface SongLibraryPageProps {
  notice?: string | null;
  adminAccess?: boolean;
  onAdminLogin?: (token: string) => void;
  onAdminLogout?: () => void;
  onSelectSong: (song: Song) => void;
  onSynchronizeSong?: (song: Song) => void;
  onSynchronizeLyrics?: (song: Song) => void;
}

export function SongLibraryPage({
  notice,
  adminAccess = false,
  onAdminLogin,
  onAdminLogout,
  onSelectSong,
  onSynchronizeSong,
  onSynchronizeLyrics,
}: SongLibraryPageProps) {
  const [songs, setSongs] = useState<
    SongSummary[]
  >([]);

  const [loading, setLoading] =
    useState(true);

  const [openingSongId, setOpeningSongId] =
    useState<string | null>(null);

  const [deletingSongId, setDeletingSongId] =
    useState<string | null>(null);

  const [updatingCoverSongId, setUpdatingCoverSongId] =
    useState<string | null>(null);

  const [error, setError] =
    useState<string | null>(null);

  const [adminModalOpened, setAdminModalOpened] =
    useState(false);

  const [adminTokenInput, setAdminTokenInput] =
    useState('');

  const [adminTokenError, setAdminTokenError] =
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
            : 'Could not load the library',
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
              : 'Could not load the library',
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
    onOpenSong: (song: Song) => void,
  ): Promise<void> => {
    setOpeningSongId(songSummary.id);
    setError(null);

    try {
      const song = await getSong(
        songSummary.id,
      );

      onOpenSong(song);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : 'Could not open the song',
      );
    } finally {
      setOpeningSongId(null);
    }
  };

  const handleDeleteSong = async (
    songSummary: SongSummary,
  ): Promise<void> => {
    const confirmed = window.confirm(
      `Delete "${songSummary.title}" from the library? This will also remove its MP3 and MIDI files.`,
    );

    if (!confirmed) {
      return;
    }

    setDeletingSongId(songSummary.id);
    setError(null);

    try {
      await deleteSong(songSummary.id);

      setSongs((currentSongs) =>
        currentSongs.filter(
          (song) => song.id !== songSummary.id,
        ),
      );
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : 'Could not delete the song',
      );
    } finally {
      setDeletingSongId(null);
    }
  };

  const handleUpdateCover = async (
    songSummary: SongSummary,
    coverImage: File,
  ): Promise<void> => {
    setUpdatingCoverSongId(songSummary.id);
    setError(null);

    try {
      const updatedSong = await updateSongCover(
        songSummary.id,
        coverImage,
      );

      setSongs((currentSongs) =>
        currentSongs.map((song) =>
          song.id === updatedSong.id
            ? {
                ...song,
                coverUrl:
                  updatedSong.coverUrl,
              }
            : song,
        ),
      );
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : 'Could not update the cover',
      );
    } finally {
      setUpdatingCoverSongId(null);
    }
  };

  const handleAdminSubmit = (
    event: FormEvent<HTMLFormElement>,
  ): void => {
    event.preventDefault();

    const token = adminTokenInput.trim();

    if (!token) {
      setAdminTokenError(
        'Enter the admin password',
      );

      return;
    }

    onAdminLogin?.(token);
    setAdminModalOpened(false);
    setAdminTokenInput('');
    setAdminTokenError(null);
  };

  return (
    <div className="library-page">
      <Container className="library-shell" size="xl">
        <Stack gap="xl">
          <Group
            className="library-header"
            justify="space-between"
            align="flex-start"
          >
            <div>
              <Text
                className="library-kicker"
                size="sm"
                fw={700}
                c="indigo.3"
                tt="uppercase"
              >
                Harmonizer
              </Text>

              <Title className="library-title" order={1}>
                Songs
              </Title>

              <Text className="library-subtitle" mt={4}>
                Select a song to start singing.
              </Text>
            </div>

            {adminAccess ? (
              <Button
                className="library-admin-button"
                variant="light"
                onClick={onAdminLogout}
              >
                Log out admin
              </Button>
            ) : (
              <Button
                className="library-admin-button"
                variant="default"
                onClick={() => {
                  setAdminModalOpened(true);
                }}
              >
                Admin
              </Button>
            )}
          </Group>

          <Modal
            opened={adminModalOpened}
            onClose={() => {
              setAdminModalOpened(false);
              setAdminTokenError(null);
            }}
            title="Admin access"
            centered
          >
            <form onSubmit={handleAdminSubmit}>
              <Stack gap="md">
                <PasswordInput
                  label="Password"
                  value={adminTokenInput}
                  error={adminTokenError}
                  autoFocus
                  onChange={(event) => {
                    setAdminTokenInput(
                      event.currentTarget.value,
                    );
                    setAdminTokenError(null);
                  }}
                />

                <Group justify="flex-end">
                  <Button
                    variant="default"
                    onClick={() => {
                      setAdminModalOpened(false);
                      setAdminTokenError(null);
                    }}
                  >
                    Cancel
                  </Button>

                  <Button type="submit">
                    Enter
                  </Button>
                </Group>
              </Stack>
            </form>
          </Modal>

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
                Try again
              </Button>
            </Stack>
          </Alert>
        )}

        {notice && !error && (
          <Alert color="yellow" title="Song unavailable">
            {notice}
          </Alert>
        )}

        {loading ? (
          <Group justify="center" py="xl">
            <Loader />
            <Text>
              Loading library...
            </Text>
          </Group>
        ) : songs.length === 0 ? (
          <Alert
            color="blue"
            title="No songs yet"
          >
            Upload the first song with Postman using
            POST /api/songs.
          </Alert>
        ) : (
          <SimpleGrid
            className="library-grid"
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
                  openingSongId === song.id ||
                  updatingCoverSongId === song.id
                }
                deleting={
                  deletingSongId === song.id
                }
                onOpen={() => {
                  void handleOpenSong(
                    song,
                    onSelectSong,
                  );
                }}
                onDelete={() => {
                  void handleDeleteSong(song);
                }}
                onUpdateCover={(coverImage) => {
                  void handleUpdateCover(
                    song,
                    coverImage,
                  );
                }}
                adminAccess={adminAccess}
                onSynchronize={() => {
                  if (onSynchronizeSong) {
                    void handleOpenSong(
                      song,
                      onSynchronizeSong,
                    );
                  }
                }}
                onSynchronizeLyrics={() => {
                  if (onSynchronizeLyrics) {
                    void handleOpenSong(
                      song,
                      onSynchronizeLyrics,
                    );
                  }
                }}
              />
            ))}
          </SimpleGrid>
        )}
      </Stack>
      </Container>
    </div>
  );
}
