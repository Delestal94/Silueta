import { z } from 'zod';

export const createRoomSchema = z.object({
  displayName: z.string().trim().min(1).max(24),
  startingBudget: z.number().int().min(50).max(1000).default(200),
  roundSeconds: z.number().int().min(5).max(120).default(10),
  genderFilter: z.enum(['men', 'women', 'any']).default('any'),
  pool: z.enum(['famous', 'all']).default('famous'),
});

export const joinRoomSchema = z.object({
  code: z.string().trim().min(3).max(10),
  displayName: z.string().trim().min(1).max(24),
});

export type CreateRoomInput = z.infer<typeof createRoomSchema>;
export type JoinRoomInput = z.infer<typeof joinRoomSchema>;
