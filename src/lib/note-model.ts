import { z } from "zod";

export const noteInputSchema = z.object({
  title: z
    .string()
    .trim()
    .max(120)
    .default("")
    .describe("A short label for the note, for example Refund limit"),
  body: z
    .string()
    .trim()
    .min(1)
    .max(10_000)
    .describe("The full text to remember"),
});

export type NoteInput = z.infer<typeof noteInputSchema>;

export const noteSchema = noteInputSchema.extend({
  id: z.uuid(),
  createdAt: z.iso.datetime(),
});

export type Note = z.infer<typeof noteSchema>;
