/**
 * Retired greats, curated by hand.
 *
 * EA has no ratings for anyone retired — they exist only as Ultimate Team
 * Icons, outside the public feed — so the rating and the six stats are ours,
 * on the same 0-99 scale, pitched at each player's peak. The era curve in
 * `next_round` does the rest: Maradona in 1986 and Maradona in 1996 are the
 * same entry and very different buys.
 *
 * `name` is spelled the way TheSportsDB spells it, because that is what the
 * render lookup searches for. `position` is stated here because TheSportsDB
 * reports a player's *current* role, and half of these are managers now.
 */
export type LegendPosition = 'goalkeeper' | 'defender' | 'midfielder' | 'forward';

export interface Legend {
  name: string;
  /**
   * What to type into TheSportsDB when the display name does not find them.
   * Searching "Pelé" returns a different, living player; his record is only
   * reachable under his full name.
   */
  searchAs?: string;
  position: LegendPosition;
  rating: number;
  pace: number;
  shooting: number;
  passing: number;
  dribbling: number;
  defending: number;
  physical: number;
}

export const LEGENDS: Legend[] = [
  // Forwards
  { name: 'Diego Maradona', position: 'forward', rating: 95, pace: 89, shooting: 90, passing: 91, dribbling: 97, defending: 40, physical: 75 },
  { name: 'Pelé', searchAs: 'Edson Arantes do Nascimento', position: 'forward', rating: 95, pace: 95, shooting: 96, passing: 92, dribbling: 96, defending: 60, physical: 76 },
  { name: 'Johan Cruyff', position: 'forward', rating: 93, pace: 91, shooting: 89, passing: 91, dribbling: 94, defending: 55, physical: 68 },
  { name: 'Ronaldinho', position: 'forward', rating: 92, pace: 90, shooting: 88, passing: 90, dribbling: 95, defending: 39, physical: 73 },
  { name: 'Thierry Henry', position: 'forward', rating: 92, pace: 95, shooting: 92, passing: 82, dribbling: 92, defending: 44, physical: 79 },
  { name: 'Francesco Totti', position: 'forward', rating: 90, pace: 78, shooting: 90, passing: 89, dribbling: 90, defending: 43, physical: 76 },
  { name: 'Alessandro Del Piero', position: 'forward', rating: 90, pace: 82, shooting: 90, passing: 85, dribbling: 89, defending: 36, physical: 68 },
  { name: 'Didier Drogba', position: 'forward', rating: 89, pace: 84, shooting: 90, passing: 74, dribbling: 83, defending: 45, physical: 92 },
  { name: 'Gabriel Batistuta', position: 'forward', rating: 89, pace: 84, shooting: 93, passing: 71, dribbling: 82, defending: 36, physical: 85 },
  { name: 'Michael Owen', position: 'forward', rating: 87, pace: 95, shooting: 88, passing: 72, dribbling: 85, defending: 32, physical: 68 },
  { name: 'Fernando Torres', position: 'forward', rating: 87, pace: 91, shooting: 87, passing: 74, dribbling: 85, defending: 35, physical: 76 },
  { name: 'Hernán Crespo', position: 'forward', rating: 87, pace: 82, shooting: 89, passing: 72, dribbling: 80, defending: 33, physical: 79 },
  { name: 'David Beckham', position: 'forward', rating: 89, pace: 76, shooting: 84, passing: 94, dribbling: 82, defending: 60, physical: 74 },
  { name: 'Ryan Giggs', position: 'forward', rating: 88, pace: 88, shooting: 79, passing: 87, dribbling: 89, defending: 52, physical: 68 },

  // Midfielders
  { name: 'Zinedine Zidane', position: 'midfielder', rating: 94, pace: 79, shooting: 86, passing: 93, dribbling: 95, defending: 63, physical: 83 },
  { name: 'Xavi', position: 'midfielder', rating: 91, pace: 68, shooting: 76, passing: 96, dribbling: 90, defending: 68, physical: 65 },
  { name: 'Andres Iniesta', position: 'midfielder', rating: 91, pace: 76, shooting: 76, passing: 92, dribbling: 94, defending: 63, physical: 63 },
  { name: 'Rivaldo', position: 'midfielder', rating: 91, pace: 82, shooting: 91, passing: 88, dribbling: 91, defending: 40, physical: 74 },
  { name: 'Andrea Pirlo', position: 'midfielder', rating: 89, pace: 60, shooting: 82, passing: 94, dribbling: 84, defending: 64, physical: 65 },
  { name: 'Steven Gerrard', position: 'midfielder', rating: 89, pace: 76, shooting: 88, passing: 89, dribbling: 82, defending: 74, physical: 84 },
  { name: 'Frank Lampard', position: 'midfielder', rating: 88, pace: 72, shooting: 89, passing: 85, dribbling: 80, defending: 69, physical: 80 },

  // Defenders
  { name: 'Paolo Maldini', position: 'defender', rating: 93, pace: 83, shooting: 50, passing: 76, dribbling: 76, defending: 93, physical: 85 },
  { name: 'Roberto Carlos', position: 'defender', rating: 90, pace: 95, shooting: 82, passing: 80, dribbling: 84, defending: 82, physical: 87 },
  { name: 'Cafu', position: 'defender', rating: 89, pace: 92, shooting: 62, passing: 79, dribbling: 82, defending: 85, physical: 80 },

  // Goalkeepers — the six slots mean diving, handling, kicking, reflexes,
  // speed and positioning on a keeper's card.
  { name: 'Gianluigi Buffon', position: 'goalkeeper', rating: 91, pace: 88, shooting: 85, passing: 76, dribbling: 92, defending: 52, physical: 89 },
  { name: 'Iker Casillas', position: 'goalkeeper', rating: 90, pace: 88, shooting: 82, passing: 70, dribbling: 93, defending: 48, physical: 87 },
];
