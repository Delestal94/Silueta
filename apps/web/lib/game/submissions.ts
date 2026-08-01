import { z } from 'zod';

export const POSITION_TYPES = ['goalkeeper', 'defender', 'midfielder', 'forward'] as const;

/**
 * Only an https URL to an image host is accepted, and the image is never
 * fetched by the browser from here — the ingest pass downloads it, turns it
 * into a silhouette and uploads that to our own storage. Nothing a stranger
 * links to is ever served directly to players.
 */
const imageUrl = z
  .string()
  .trim()
  .url('Tiene que ser una URL completa')
  .refine((u) => u.startsWith('https://'), 'La URL tiene que ser https')
  .refine(
    (u) => /\.(png|jpe?g|webp)(\?|$)/i.test(u),
    'La URL tiene que apuntar a una imagen .png, .jpg o .webp'
  );

const stat = z.number().int().min(1).max(99);

/**
 * Every field the catalog needs, because a player row is complete or it does
 * not exist (see migration 0026). Nothing here is optional: a half-filled
 * entry would be rejected by the database anyway, so it is better to ask for
 * it up front than to accept a proposal that can never be approved.
 */
export const newPlayerSchema = z.object({
  name: z.string().trim().min(2).max(80),
  positionType: z.enum(POSITION_TYPES),
  gender: z.enum(['men', 'women']),
  nationality: z.string().trim().min(2).max(60),
  team: z.string().trim().min(2).max(80),
  birthDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato AAAA-MM-DD')
    .refine((d) => {
      const year = Number(d.slice(0, 4));
      return year >= 1900 && year <= new Date().getFullYear() - 15;
    }, 'Fecha de nacimiento poco plausible'),
  rating: z.number().int().min(40).max(99),
  pace: stat,
  shooting: stat,
  passing: stat,
  dribbling: stat,
  defending: stat,
  physical: stat,
  imageUrl,
  // A transparent cut-out is what makes a readable silhouette; a flat photo
  // produces a blob. The submitter is asked to confirm.
  imageIsTransparent: z.literal(true, {
    errorMap: () => ({ message: 'La imagen tiene que tener fondo transparente' }),
  }),
  submittedBy: z.string().trim().min(1).max(40),
});

export const editPlayerSchema = z.object({
  targetPlayerId: z.string().uuid(),
  positionType: z.enum(POSITION_TYPES).optional(),
  nationality: z.string().trim().min(2).max(60).optional(),
  team: z.string().trim().min(2).max(80).optional(),
  birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  rating: z.number().int().min(40).max(99).optional(),
  reason: z.string().trim().min(5).max(300),
  submittedBy: z.string().trim().min(1).max(40),
});

export type NewPlayerInput = z.infer<typeof newPlayerSchema>;
export type EditPlayerInput = z.infer<typeof editPlayerSchema>;

export const POSITION_LABELS_ES: Record<(typeof POSITION_TYPES)[number], string> = {
  goalkeeper: 'Arquero',
  defender: 'Defensa',
  midfielder: 'Mediocampista',
  forward: 'Delantero',
};
