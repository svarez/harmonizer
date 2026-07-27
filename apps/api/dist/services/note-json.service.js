import { z } from 'zod';
const noteEventSchema = z.object({
    id: z.string().min(1),
    midi: z
        .number()
        .int()
        .min(0)
        .max(127),
    startSeconds: z
        .number()
        .nonnegative(),
    durationSeconds: z
        .number()
        .nonnegative(),
    endSeconds: z
        .number()
        .nonnegative(),
    velocity: z
        .number()
        .min(0)
        .max(1)
        .optional(),
});
const noteEventArraySchema = z.array(noteEventSchema);
export function notesToJson(notes) {
    return notes.map((note) => {
        return {
            id: note.id,
            midi: note.midi,
            startSeconds: note.startSeconds,
            durationSeconds: note.durationSeconds,
            endSeconds: note.endSeconds,
            ...(note.velocity !== undefined
                ? {
                    velocity: note.velocity,
                }
                : {}),
        };
    });
}
export function notesFromJson(value) {
    const result = noteEventArraySchema.safeParse(value);
    if (!result.success) {
        throw new Error('La pista contiene un formato de notas inválido');
    }
    return result.data;
}
