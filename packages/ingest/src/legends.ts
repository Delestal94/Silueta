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
  { name: 'Ronaldo', searchAs: 'Ronaldo Nazario', position: 'forward', rating: 94, pace: 97, shooting: 94, passing: 81, dribbling: 96, defending: 34, physical: 83 },
  { name: 'Marco van Basten', position: 'forward', rating: 92, pace: 86, shooting: 94, passing: 79, dribbling: 88, defending: 40, physical: 82 },
  { name: 'Alfredo Di Stefano', position: 'forward', rating: 92, pace: 89, shooting: 92, passing: 88, dribbling: 89, defending: 55, physical: 82 },
  { name: 'Romario', position: 'forward', rating: 91, pace: 90, shooting: 93, passing: 76, dribbling: 92, defending: 30, physical: 70 },
  { name: 'Roberto Baggio', position: 'forward', rating: 91, pace: 84, shooting: 91, passing: 87, dribbling: 93, defending: 34, physical: 68 },
  { name: 'Eusebio', position: 'forward', rating: 91, pace: 94, shooting: 93, passing: 78, dribbling: 89, defending: 38, physical: 80 },
  { name: 'Ferenc Puskas', position: 'forward', rating: 91, pace: 82, shooting: 95, passing: 86, dribbling: 89, defending: 35, physical: 72 },
  { name: 'George Best', position: 'forward', rating: 90, pace: 92, shooting: 87, passing: 82, dribbling: 94, defending: 36, physical: 70 },
  { name: 'Gerd Muller', position: 'forward', rating: 90, pace: 82, shooting: 94, passing: 68, dribbling: 82, defending: 34, physical: 80 },
  { name: 'Andriy Shevchenko', position: 'forward', rating: 90, pace: 91, shooting: 92, passing: 76, dribbling: 87, defending: 38, physical: 82 },
  { name: 'Raul', position: 'forward', rating: 89, pace: 85, shooting: 90, passing: 80, dribbling: 87, defending: 38, physical: 71 },
  { name: 'Dennis Bergkamp', position: 'forward', rating: 89, pace: 78, shooting: 88, passing: 88, dribbling: 91, defending: 40, physical: 73 },
  { name: 'Ruud van Nistelrooy', position: 'forward', rating: 89, pace: 82, shooting: 92, passing: 70, dribbling: 82, defending: 34, physical: 82 },
  { name: 'Hristo Stoichkov', position: 'forward', rating: 89, pace: 89, shooting: 91, passing: 82, dribbling: 90, defending: 40, physical: 76 },
  { name: 'Samuel Eto\'o', position: 'forward', rating: 88, pace: 93, shooting: 89, passing: 74, dribbling: 86, defending: 38, physical: 80 },
  { name: 'Alan Shearer', position: 'forward', rating: 88, pace: 80, shooting: 92, passing: 72, dribbling: 79, defending: 42, physical: 88 },
  { name: 'Zlatan Ibrahimovic', position: 'forward', rating: 88, pace: 78, shooting: 91, passing: 80, dribbling: 87, defending: 38, physical: 88 },
  { name: 'Carlos Tevez', position: 'forward', rating: 86, pace: 85, shooting: 86, passing: 78, dribbling: 87, defending: 48, physical: 82 },
  { name: 'Diego Forlan', position: 'forward', rating: 86, pace: 82, shooting: 88, passing: 80, dribbling: 83, defending: 38, physical: 76 },
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
  { name: 'Zico', position: 'midfielder', rating: 92, pace: 86, shooting: 91, passing: 92, dribbling: 92, defending: 44, physical: 70 },
  { name: 'Michel Platini', position: 'midfielder', rating: 92, pace: 78, shooting: 90, passing: 92, dribbling: 89, defending: 52, physical: 72 },
  { name: 'Lothar Matthaus', position: 'midfielder', rating: 90, pace: 82, shooting: 86, passing: 86, dribbling: 84, defending: 80, physical: 86 },
  { name: 'Ruud Gullit', position: 'midfielder', rating: 90, pace: 87, shooting: 87, passing: 87, dribbling: 88, defending: 68, physical: 88 },
  { name: 'Luis Figo', position: 'midfielder', rating: 90, pace: 88, shooting: 82, passing: 88, dribbling: 92, defending: 45, physical: 72 },
  { name: 'Kaka', position: 'midfielder', rating: 89, pace: 92, shooting: 85, passing: 85, dribbling: 90, defending: 40, physical: 74 },
  { name: 'Clarence Seedorf', position: 'midfielder', rating: 88, pace: 79, shooting: 84, passing: 88, dribbling: 85, defending: 66, physical: 80 },
  { name: 'Patrick Vieira', position: 'midfielder', rating: 88, pace: 78, shooting: 76, passing: 82, dribbling: 80, defending: 86, physical: 90 },
  { name: 'Roy Keane', position: 'midfielder', rating: 88, pace: 76, shooting: 78, passing: 83, dribbling: 79, defending: 86, physical: 88 },
  { name: 'Paul Scholes', position: 'midfielder', rating: 88, pace: 68, shooting: 85, passing: 92, dribbling: 83, defending: 62, physical: 72 },
  { name: 'Juan Roman Riquelme', position: 'midfielder', rating: 88, pace: 62, shooting: 82, passing: 93, dribbling: 90, defending: 40, physical: 68 },
  { name: 'Fernando Redondo', position: 'midfielder', rating: 87, pace: 74, shooting: 68, passing: 88, dribbling: 85, defending: 82, physical: 78 },
  { name: 'Michael Ballack', position: 'midfielder', rating: 87, pace: 76, shooting: 86, passing: 84, dribbling: 80, defending: 74, physical: 86 },
  { name: 'Deco', position: 'midfielder', rating: 87, pace: 76, shooting: 79, passing: 89, dribbling: 88, defending: 56, physical: 68 },

  // Defenders
  { name: 'Paolo Maldini', position: 'defender', rating: 93, pace: 83, shooting: 50, passing: 76, dribbling: 76, defending: 93, physical: 85 },
  { name: 'Roberto Carlos', position: 'defender', rating: 90, pace: 95, shooting: 82, passing: 80, dribbling: 84, defending: 82, physical: 87 },
  { name: 'Cafu', position: 'defender', rating: 89, pace: 92, shooting: 62, passing: 79, dribbling: 82, defending: 85, physical: 80 },
  { name: 'Franz Beckenbauer', position: 'defender', rating: 92, pace: 80, shooting: 74, passing: 88, dribbling: 84, defending: 90, physical: 84 },
  { name: 'Franco Baresi', position: 'defender', rating: 91, pace: 78, shooting: 48, passing: 78, dribbling: 74, defending: 93, physical: 82 },
  { name: 'Alessandro Nesta', position: 'defender', rating: 90, pace: 82, shooting: 42, passing: 72, dribbling: 74, defending: 92, physical: 84 },
  { name: 'Fabio Cannavaro', position: 'defender', rating: 90, pace: 84, shooting: 40, passing: 70, dribbling: 72, defending: 92, physical: 82 },
  { name: 'Carles Puyol', position: 'defender', rating: 88, pace: 80, shooting: 44, passing: 68, dribbling: 68, defending: 90, physical: 88 },
  { name: 'Javier Zanetti', position: 'defender', rating: 88, pace: 86, shooting: 60, passing: 80, dribbling: 78, defending: 85, physical: 84 },
  { name: 'Lilian Thuram', position: 'defender', rating: 88, pace: 84, shooting: 44, passing: 70, dribbling: 72, defending: 89, physical: 88 },
  { name: 'Philipp Lahm', position: 'defender', rating: 88, pace: 86, shooting: 62, passing: 84, dribbling: 82, defending: 85, physical: 74 },
  { name: 'Marcel Desailly', position: 'defender', rating: 87, pace: 78, shooting: 46, passing: 70, dribbling: 68, defending: 89, physical: 90 },
  { name: 'Daniel Passarella', position: 'defender', rating: 87, pace: 74, shooting: 76, passing: 76, dribbling: 74, defending: 88, physical: 84 },
  { name: 'Rio Ferdinand', position: 'defender', rating: 87, pace: 80, shooting: 40, passing: 74, dribbling: 72, defending: 89, physical: 84 },
  { name: 'Nemanja Vidic', position: 'defender', rating: 87, pace: 74, shooting: 50, passing: 62, dribbling: 62, defending: 90, physical: 90 },
  { name: 'Ashley Cole', position: 'defender', rating: 86, pace: 89, shooting: 50, passing: 76, dribbling: 80, defending: 85, physical: 76 },
  { name: 'Roberto Ayala', position: 'defender', rating: 86, pace: 76, shooting: 40, passing: 66, dribbling: 66, defending: 88, physical: 82 },
  { name: 'John Terry', position: 'defender', rating: 86, pace: 68, shooting: 52, passing: 68, dribbling: 62, defending: 89, physical: 88 },

  // Goalkeepers — the six slots mean diving, handling, kicking, reflexes,
  // speed and positioning on a keeper's card.
  { name: 'Gianluigi Buffon', position: 'goalkeeper', rating: 91, pace: 88, shooting: 85, passing: 76, dribbling: 92, defending: 52, physical: 89 },
  { name: 'Iker Casillas', position: 'goalkeeper', rating: 90, pace: 88, shooting: 82, passing: 70, dribbling: 93, defending: 48, physical: 87 },
  { name: 'Lev Yashin', position: 'goalkeeper', rating: 91, pace: 89, shooting: 86, passing: 74, dribbling: 92, defending: 50, physical: 88 },
  { name: 'Dino Zoff', position: 'goalkeeper', rating: 90, pace: 87, shooting: 84, passing: 68, dribbling: 91, defending: 46, physical: 86 },
  { name: 'Peter Schmeichel', position: 'goalkeeper', rating: 90, pace: 88, shooting: 84, passing: 72, dribbling: 91, defending: 48, physical: 92 },
  { name: 'Oliver Kahn', position: 'goalkeeper', rating: 90, pace: 87, shooting: 86, passing: 68, dribbling: 92, defending: 46, physical: 90 },
  { name: 'Edwin van der Sar', position: 'goalkeeper', rating: 89, pace: 85, shooting: 84, passing: 80, dribbling: 89, defending: 44, physical: 88 },
  { name: 'Petr Cech', position: 'goalkeeper', rating: 89, pace: 87, shooting: 84, passing: 70, dribbling: 90, defending: 44, physical: 88 },
  { name: 'Jose Luis Chilavert', position: 'goalkeeper', rating: 87, pace: 84, shooting: 88, passing: 84, dribbling: 86, defending: 46, physical: 86 },
  { name: 'Ubaldo Fillol', position: 'goalkeeper', rating: 87, pace: 86, shooting: 82, passing: 64, dribbling: 88, defending: 44, physical: 82 },
];
