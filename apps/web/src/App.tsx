import { useState } from 'react';

import type {
  Song,
  SongTrack,
} from '@harmonizer/shared';

import { SongLibraryPage } from './features/library/SongLibraryPage';

import { TrackSelectionPage } from './features/track-selection/TrackSelectionPage';

import { PracticePage } from './features/practice/PracticePage';

function App() {
  const [selectedSong, setSelectedSong] =
    useState<Song | null>(null);

  const [selectedTrack, setSelectedTrack] =
    useState<SongTrack | null>(null);

  if (!selectedSong) {
    return (
      <SongLibraryPage
        onSelectSong={(song) => {
          setSelectedSong(song);
          setSelectedTrack(null);
        }}
      />
    );
  }

  if (!selectedTrack) {
    return (
      <TrackSelectionPage
        song={selectedSong}
        onBack={() => {
          setSelectedSong(null);
        }}
        onSelectTrack={(track) => {
          setSelectedTrack(track);
        }}
      />
    );
  }

  return (
    <PracticePage
      key={`${selectedSong.id}-${selectedTrack.id}`}
      song={selectedSong}
      track={selectedTrack}
      onBack={() => {
        setSelectedTrack(null);
      }}
    />
  );
}

export default App;