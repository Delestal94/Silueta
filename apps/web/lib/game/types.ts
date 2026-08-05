export type PositionType = 'goalkeeper' | 'defender' | 'midfielder' | 'forward';

export const POSITION_ORDER: PositionType[] = [
  'goalkeeper',
  'defender',
  'midfielder',
  'forward',
];

export const POSITION_LABELS: Record<PositionType, string> = {
  goalkeeper: 'Arquero',
  defender: 'Defensa',
  midfielder: 'Mediocampo',
  forward: 'Delantero',
};

export const POSITION_SHORT: Record<PositionType, string> = {
  goalkeeper: 'ARQ',
  defender: 'DEF',
  midfielder: 'MED',
  forward: 'DEL',
};

export interface CatalogPlayer {
  id: string;
  name?: string;
  team?: string | null;
  league?: string | null;
  position?: string | null;
  position_type: PositionType;
  nationality?: string | null;
  birth_date?: string | null;
  shirt_number?: string | null;
  height?: string | null;
  weight?: string | null;
  foot?: string | null;
  description?: string | null;
  photo_url?: string | null;
  silhouette_url: string | null;
  ea_overall?: number | null;
  ea_pace?: number | null;
  ea_shooting?: number | null;
  ea_passing?: number | null;
  ea_dribbling?: number | null;
  ea_defending?: number | null;
  ea_physical?: number | null;
  ea_card_url?: string | null;
  /** The very pose the silhouette was cut from, in colour. */
  colour_url?: string | null;
}

export interface TeamSigning {
  purchase_price: number;
  rating: number | null;
  season_year: number | null;
  era_label: string | null;
  players: CatalogPlayer;
}

export interface Participant {
  id: string;
  display_name: string;
  is_host: boolean;
  remaining_budget: number;
  passes_used: number;
  /** Voted to start the next round. */
  is_ready: boolean;
  /** One pass per position, so spending it early no longer costs the game. */
  position_passes: { position_type: PositionType }[];
  team_players: TeamSigning[];
}

export function hasPass(participant: Participant, position: PositionType): boolean {
  return !(participant.position_passes || []).some((p) => p.position_type === position);
}

export interface Room {
  id: string;
  code: string;
  status: 'lobby' | 'active' | 'finished';
  starting_budget: number;
  round_number: number;
  current_position: PositionType | null;
  round_seconds: number;
  /** 'open' es la subasta de siempre; 'sealed', a sobre cerrado. */
  auction_mode: 'open' | 'sealed';
  /** Si entran las leyendas retiradas al sorteo de jugadores. */
  include_legends: boolean;
  gender_filter: 'men' | 'women' | 'any';
  pool: 'famous' | 'all' | 'balanced';
  requirements: Record<PositionType, number>;
  room_participants: Participant[];
}

export interface CurrentRound {
  id: string;
  player_id: string;
  status: 'active' | 'sold' | 'unsold' | 'pending';
  current_bid: number | null;
  current_bid_by: string | null;
  starts_at: string;
  ends_at: string;
  position_type: PositionType;
  round_number: number;
  season_year: number | null;
  era_rating: number | null;
  era_label: string | null;
  revealed: boolean;
  player: CatalogPlayer;
  /** Sabotage aimed at the viewer this round, if any. */
  myHex: { power: string } | null;
  /** Set when the round hides the silhouette from everyone. */
  mystery?: boolean;
  envelope: {
    nationality: string | null;
    honours: { honour: string; season: string | null; team: string | null }[];
  } | null;
  /** Clue this viewer paid for with "soplo". */
  tip: { nationality: string | null; team: string | null } | null;

  /** Sealed-bid round. The fields below only mean anything when this is true. */
  sealed?: boolean;
  /** What this viewer put in, and only this viewer. */
  myEnvelope?: number | null;
  envelopesIn?: number;
  envelopesExpected?: number;
  /** Everybody's envelope — present only once the round has closed. */
  envelopes?: { participant_id: string; display_name: string; amount: number }[] | null;
}

export interface PowerEffect {
  id: string;
  power: string;
  caster_id: string;
  target_id: string;
  status: 'pending' | 'active' | 'consumed';
}

export interface GameState {
  room: Room;
  currentRound: CurrentRound | null;
  me: {
    id: string;
    display_name: string;
    is_host: boolean;
    remaining_budget: number;
    passes_used: number;
  } | null;
  effects: PowerEffect[];
  /** Server clock at the moment the state was read. */
  serverTime: string;
}

export function countByPosition(
  participant: Participant
): Record<PositionType, number> {
  const counts: Record<PositionType, number> = {
    goalkeeper: 0,
    defender: 0,
    midfielder: 0,
    forward: 0,
  };
  for (const signing of participant.team_players || []) {
    const pos = signing.players?.position_type;
    if (pos) counts[pos]++;
  }
  return counts;
}

export function isTeamComplete(
  participant: Participant,
  requirements: Record<PositionType, number>
): boolean {
  const counts = countByPosition(participant);
  return POSITION_ORDER.every((pos) => counts[pos] >= (requirements[pos] ?? 0));
}

export function totalPoints(participant: Participant): number {
  return (participant.team_players || []).reduce((sum, s) => sum + (s.rating ?? 0), 0);
}

export function totalSpent(participant: Participant): number {
  return (participant.team_players || []).reduce((sum, s) => sum + s.purchase_price, 0);
}

/**
 * Ranking: most rating points wins. A tie goes to whoever spent less, so
 * getting the same squad cheaper is rewarded.
 */
export function rankParticipants(participants: Participant[]): Participant[] {
  return [...participants].sort((a, b) => {
    const points = totalPoints(b) - totalPoints(a);
    if (points !== 0) return points;
    return totalSpent(a) - totalSpent(b);
  });
}
