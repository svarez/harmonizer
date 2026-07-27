import { useState } from 'react';

import type {
  Song,
  SongTrack,
} from '@harmonizer/shared';

import { SongLibraryPage } from './features/library/SongLibraryPage';

import { TrackSelectionPage } from './features/track-selection/TrackSelectionPage';

import { PracticePage } from './features/practice/PracticePage';

import { SynchronizationPage } from './features/synchronization/SynchronizationPage';
import { LyricsSynchronizationPage } from './features/lyrics/LyricsSynchronizationPage';
import { getDefaultVocalTrack } from './features/vocalTracks';

type ActiveView =
  | { name: 'library' }
  | { name: 'tracks'; song: Song }
  | { name: 'practice'; song: Song; track: SongTrack }
  | { name: 'synchronization'; song: Song }
  | { name: 'lyrics'; song: Song };

function App() {
  const [activeView, setActiveView] =
    useState<ActiveView>({
      name: 'library',
    });

  if (activeView.name === 'library') {
    return (
      <SongLibraryPage
        onSelectSong={(song) => {
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
            name: 'tracks',
            song,
          });
        }}
      />
    );
  }

  if (activeView.name === 'tracks') {
    return (
      <TrackSelectionPage
        song={activeView.song}
        onBack={() => {
          setActiveView({
            name: 'library',
          });
        }}
        onSynchronize={() => {
          setActiveView({
            name: 'synchronization',
            song: activeView.song,
          });
        }}
        onSynchronizeLyrics={() => {
          setActiveView({
            name: 'lyrics',
            song: activeView.song,
          });
        }}
        onSelectTrack={(track) => {
          setActiveView({
            name: 'practice',
            song: activeView.song,
            track,
          });
        }}
      />
    );
  }

  if (activeView.name === 'synchronization') {
    return (
      <SynchronizationPage
        song={activeView.song}
        onBack={(song) => {
          setActiveView({
            name: 'tracks',
            song,
          });
        }}
      />
    );
  }

  if (activeView.name === 'lyrics') {
    return (
      <LyricsSynchronizationPage
        song={activeView.song}
        onBack={(song) => {
          setActiveView({
            name: 'tracks',
            song,
          });
        }}
      />
    );
  }

  return (
    <PracticePage
      key={`${activeView.song.id}-${activeView.track.id}`}
      song={activeView.song}
      track={activeView.track}
      onBack={() => {
        setActiveView({
          name: 'tracks',
          song: activeView.song,
        });
      }}
    />
  );
}

export default App;
