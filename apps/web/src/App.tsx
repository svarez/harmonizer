import { useState } from 'react';

import type {
  Song,
  SongTrack,
} from '@harmonizer/shared';

import { SongLibraryPage } from './features/library/SongLibraryPage';

import { PracticePage } from './features/practice/PracticePage';

import { SynchronizationPage } from './features/synchronization/SynchronizationPage';
import { LyricsSynchronizationPage } from './features/lyrics/LyricsSynchronizationPage';
import { getDefaultVocalTrack } from './features/vocalTracks';
import {
  clearAdminToken,
  getAdminToken,
  saveAdminToken,
} from './features/adminAccess';

type ActiveView =
  | { name: 'library' }
  | { name: 'practice'; song: Song; track: SongTrack }
  | { name: 'synchronization'; song: Song }
  | { name: 'lyrics'; song: Song };

function App() {
  const [adminToken, setAdminToken] =
    useState<string | undefined>(() => getAdminToken());

  const adminAccess = adminToken !== undefined;

  const [activeView, setActiveView] =
    useState<ActiveView>({
      name: 'library',
    });

  const [libraryNotice, setLibraryNotice] =
    useState<string | null>(null);

  const openPracticeSong = (song: Song): void => {
    const defaultVocalTrack =
      getDefaultVocalTrack(song);

    if (defaultVocalTrack) {
      setActiveView({
        name: 'practice',
        song,
        track: defaultVocalTrack,
      });

      return;
    }

    setActiveView({
      name: 'library',
    });
    setLibraryNotice(
      `"${song.title}" no tiene una pista vocal detectable para practicar.`,
    );
  };

  if (activeView.name === 'library') {
    return (
      <SongLibraryPage
        notice={libraryNotice}
        adminAccess={adminAccess}
        onAdminLogin={(token) => {
          saveAdminToken(token);
          setAdminToken(token.trim());
        }}
        onAdminLogout={() => {
          clearAdminToken();
          setAdminToken(undefined);
          setLibraryNotice(null);
        }}
        onSynchronizeSong={(song) => {
          setLibraryNotice(null);
          setActiveView({
            name: 'synchronization',
            song,
          });
        }}
        onSynchronizeLyrics={(song) => {
          setLibraryNotice(null);
          setActiveView({
            name: 'lyrics',
            song,
          });
        }}
        onSelectSong={(song) => {
          setLibraryNotice(null);
          openPracticeSong(song);
        }}
      />
    );
  }

  if (activeView.name === 'synchronization') {
    if (!adminAccess) {
      return (
        <SongLibraryPage
          notice="La sincronización MP3/MIDI solo está disponible en modo administrador."
          onSelectSong={openPracticeSong}
        />
      );
    }

    return (
      <SynchronizationPage
        song={activeView.song}
        onBack={() => {
          setActiveView({
            name: 'library',
          });
          setLibraryNotice(null);
        }}
      />
    );
  }

  if (activeView.name === 'lyrics') {
    if (!adminAccess) {
      return (
        <SongLibraryPage
          notice="La sincronización de letras solo está disponible en modo administrador."
          onSelectSong={openPracticeSong}
        />
      );
    }

    return (
      <LyricsSynchronizationPage
        song={activeView.song}
        onBack={() => {
          setActiveView({
            name: 'library',
          });
          setLibraryNotice(null);
        }}
      />
    );
  }

  return (
    <PracticePage
      key={`${activeView.song.id}-${activeView.track.id}`}
      song={activeView.song}
      track={activeView.track}
      adminAccess={adminAccess}
      onBack={() => {
        setActiveView({
          name: 'library',
        });
      }}
    />
  );
}

export default App;
