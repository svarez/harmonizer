import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { Midi } = require('@tonejs/midi');
function isPercussionTrack(midiTrack) {
    return (midiTrack.channel === 9 ||
        midiTrack.instrument?.family === 'drums');
}
function getTrimmedName(value) {
    const trimmedValue = value?.trim();
    return trimmedValue || undefined;
}
function isGroupHeaderTrack(midiTrack) {
    return (midiTrack.notes.length === 0 &&
        Boolean(getTrimmedName(midiTrack.name)));
}
function shouldUseHeaderAsInitialGroupName(headerName) {
    return Boolean(headerName?.includes('|'));
}
function buildSongTrack(group, groupIndex) {
    const notes = group.notes
        .sort((firstNote, secondNote) => firstNote.time - secondNote.time)
        .map((midiNote, noteIndex) => {
        const startSeconds = midiNote.time;
        const durationSeconds = midiNote.duration;
        return {
            id: `track-${groupIndex + 1}-note-${noteIndex + 1}`,
            midi: midiNote.midi,
            startSeconds,
            durationSeconds,
            endSeconds: startSeconds + durationSeconds,
            velocity: midiNote.velocity,
        };
    });
    const midiValues = notes.map((note) => note.midi);
    return {
        id: `track-${groupIndex + 1}`,
        name: group.name,
        instrument: group.instrument,
        notes,
        minMidi: midiValues.length > 0
            ? Math.min(...midiValues)
            : 0,
        maxMidi: midiValues.length > 0
            ? Math.max(...midiValues)
            : 0,
    };
}
function parseGroupedTracks(midi) {
    const hasGroupHeaders = midi.tracks.some(isGroupHeaderTrack);
    if (!hasGroupHeaders) {
        return null;
    }
    const groups = [];
    const initialGroupName = getTrimmedName(midi.header.name);
    let currentGroup = shouldUseHeaderAsInitialGroupName(initialGroupName)
        ? {
            name: initialGroupName,
            notes: [],
        }
        : null;
    if (currentGroup) {
        groups.push(currentGroup);
    }
    for (const midiTrack of midi.tracks) {
        if (isGroupHeaderTrack(midiTrack)) {
            currentGroup = {
                name: getTrimmedName(midiTrack.name),
                notes: [],
            };
            groups.push(currentGroup);
            continue;
        }
        if (midiTrack.notes.length === 0 ||
            isPercussionTrack(midiTrack)) {
            continue;
        }
        const instrumentName = getTrimmedName(midiTrack.instrument?.name);
        if (!currentGroup) {
            currentGroup = {
                name: instrumentName ||
                    `Pista ${groups.length + 1}`,
                instrument: instrumentName,
                notes: [],
            };
            groups.push(currentGroup);
        }
        currentGroup.instrument ??= instrumentName;
        currentGroup.notes.push(...midiTrack.notes);
    }
    return groups
        .filter((group) => group.notes.length > 0)
        .map(buildSongTrack);
}
function parsePhysicalTracks(midi) {
    return midi.tracks
        .filter((midiTrack) => !isPercussionTrack(midiTrack))
        .map((midiTrack, trackIndex) => {
        const instrumentName = getTrimmedName(midiTrack.instrument?.name);
        return buildSongTrack({
            name: getTrimmedName(midiTrack.name) ||
                instrumentName ||
                `Pista ${trackIndex + 1}`,
            instrument: instrumentName,
            notes: [...midiTrack.notes],
        }, trackIndex);
    })
        .filter((track) => track.notes.length > 0);
}
function getInitialSilenceSeconds(tracks) {
    const firstNoteStartSeconds = tracks.reduce((earliestStartSeconds, track) => {
        const trackFirstNoteStartSeconds = track.notes[0]?.startSeconds;
        if (trackFirstNoteStartSeconds === undefined) {
            return earliestStartSeconds;
        }
        return Math.min(earliestStartSeconds, trackFirstNoteStartSeconds);
    }, Number.POSITIVE_INFINITY);
    return Number.isFinite(firstNoteStartSeconds)
        ? firstNoteStartSeconds
        : 0;
}
function trimInitialSilence(tracks, initialSilenceSeconds) {
    if (initialSilenceSeconds <= 0) {
        return tracks;
    }
    return tracks.map((track) => ({
        ...track,
        notes: track.notes.map((note) => {
            const startSeconds = Math.max(note.startSeconds - initialSilenceSeconds, 0);
            return {
                ...note,
                startSeconds,
                endSeconds: startSeconds + note.durationSeconds,
            };
        }),
    }));
}
export async function parseMidiFile(filePath) {
    const fileBuffer = await readFile(filePath);
    const midi = new Midi(new Uint8Array(fileBuffer));
    const tracks = parseGroupedTracks(midi) ??
        parsePhysicalTracks(midi);
    if (tracks.length === 0) {
        throw new Error('El archivo MIDI no contiene pistas con notas');
    }
    const detectedInitialSilenceSeconds = getInitialSilenceSeconds(tracks);
    const trimmedTracks = trimInitialSilence(tracks, detectedInitialSilenceSeconds);
    return {
        durationSeconds: Math.max(midi.duration - detectedInitialSilenceSeconds, 0),
        detectedInitialSilenceSeconds,
        tracks: trimmedTracks,
    };
}
