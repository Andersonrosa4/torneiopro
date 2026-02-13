/**
 * Double Elimination Bracket Generation Logic (NEW MODEL)
 * 
 * Structure:
 * 1. Vencedores (Superior) - Winners Upper Half
 * 2. Vencedores (Inferior) - Winners Lower Half
 * 3. Perdedores (Superior) - receives losers from Winners LOWER (mirror)
 * 4. Perdedores (Inferior) - receives losers from Winners UPPER (mirror)
 * 5. Semifinais Cruzadas:
 *    - Campeão Perdedores Superior vs Campeão Vencedores Inferior
 *    - Campeão Perdedores Inferior vs Campeão Vencedores Superior
 * 6. Final: winners of cross-semifinals
 */

interface Team {
  id: string;
  player1_name: string;
  player2_name: string;
  seed: number | null;
}

interface MatchData {
  tournament_id: string;
  modality_id: string;
  round: number;
  position: number;
  team1_id: string | null;
  team2_id: string | null;
  status: string;
  bracket_type: string; // 'winners' | 'losers' | 'cross_semi' | 'final'
  bracket_half: string | null; // 'upper' | 'lower' | null
  bracket_number: number;
  next_win_match_id?: string | null;
  next_lose_match_id?: string | null;
  winner_team_id?: string | null;
  _temp_id?: string;
}

export interface DoubleEliminationConfig {
  tournamentId: string;
  modalityId: string;
  teams: Team[];
  useSeeds: boolean;
  seedTeamIds?: string[];
  allowThirdPlace: boolean;
}

export interface GeneratedBracket {
  matches: Omit<MatchData, '_temp_id'>[];
}

/**
 * Split teams into upper and lower halves.
 * Odd number: upper gets one extra.
 */
function splitIntoHalves(teams: Team[]): { upper: Team[]; lower: Team[] } {
  const half = Math.ceil(teams.length / 2);
  return {
    upper: teams.slice(0, half),
    lower: teams.slice(half),
  };
}

/**
 * Generate bracket matches for one half (winners or losers).
 */
function generateHalfBracket(
  teams: Team[],
  tournamentId: string,
  modalityId: string,
  bracketType: 'winners' | 'losers',
  half: 'upper' | 'lower',
  bracketNumber: number,
): MatchData[] {
  if (teams.length < 1) return [];
  
  const totalSlots = Math.pow(2, Math.ceil(Math.log2(Math.max(teams.length, 2))));
  const maxRounds = Math.ceil(Math.log2(totalSlots));
  const matches: MatchData[] = [];

  // First round
  const matchesInFirstRound = totalSlots / 2;
  for (let i = 0; i < matchesInFirstRound; i++) {
    const t1 = teams[i] || null;
    const t2 = teams[totalSlots - 1 - i] || null;

    const match: MatchData = {
      tournament_id: tournamentId,
      modality_id: modalityId,
      round: 1,
      position: i + 1,
      team1_id: t1?.id || null,
      team2_id: t2?.id || null,
      status: 'pending',
      bracket_type: bracketType,
      bracket_half: half,
      bracket_number: bracketNumber,
      _temp_id: `${bracketType[0]}_${half}_r1_p${i + 1}`,
    };

    // Auto-advance byes
    if (match.team1_id && !match.team2_id) {
      match.winner_team_id = match.team1_id;
      match.status = 'completed';
    } else if (!match.team1_id && match.team2_id) {
      match.winner_team_id = match.team2_id;
      match.status = 'completed';
    }

    matches.push(match);
  }

  // Subsequent rounds
  for (let r = 2; r <= maxRounds; r++) {
    const count = totalSlots / Math.pow(2, r);
    for (let p = 0; p < count; p++) {
      matches.push({
        tournament_id: tournamentId,
        modality_id: modalityId,
        round: r,
        position: p + 1,
        team1_id: null,
        team2_id: null,
        status: 'pending',
        bracket_type: bracketType,
        bracket_half: half,
        bracket_number: bracketNumber,
        _temp_id: `${bracketType[0]}_${half}_r${r}_p${p + 1}`,
      });
    }
  }

  return matches;
}

/**
 * Main function: Generate full double elimination bracket with cross-semifinals
 */
export function generateDoubleEliminationBracket(config: DoubleEliminationConfig): GeneratedBracket {
  const { tournamentId, modalityId, teams, useSeeds, seedTeamIds } = config;

  // Arrange teams
  let arranged = [...teams];
  if (useSeeds && seedTeamIds && seedTeamIds.length > 0) {
    const seeds = arranged.filter(t => seedTeamIds.includes(t.id));
    const nonSeeds = arranged.filter(t => !seedTeamIds.includes(t.id)).sort(() => Math.random() - 0.5);
    arranged = [...seeds, ...nonSeeds];
  } else {
    arranged.sort(() => Math.random() - 0.5);
  }

  // Split into halves
  const { upper, lower } = splitIntoHalves(arranged);

  // 1. Winners Upper (bracket_number=1)
  const winnersUpper = generateHalfBracket(upper, tournamentId, modalityId, 'winners', 'upper', 1);
  // 2. Winners Lower (bracket_number=2)
  const winnersLower = generateHalfBracket(lower, tournamentId, modalityId, 'winners', 'lower', 2);

  // Losers brackets: initially empty, teams will be placed as they lose in Winners
  // 3. Losers Upper (receives losers from Winners LOWER - mirror) (bracket_number=3)
  // 4. Losers Lower (receives losers from Winners UPPER - mirror) (bracket_number=4)
  
  // Calculate how many losers will arrive from each Winners half
  const upperSlots = Math.pow(2, Math.ceil(Math.log2(Math.max(upper.length, 2))));
  const lowerSlots = Math.pow(2, Math.ceil(Math.log2(Math.max(lower.length, 2))));
  
  // Losers Upper gets teams from Winners Lower (mirror)
  const losersUpperTeamCount = lowerSlots / 2; // first round losers count
  // Losers Lower gets teams from Winners Upper (mirror)  
  const losersLowerTeamCount = upperSlots / 2;

  // Generate losers bracket structure (single elimination within each half)
  const losersUpperDummy = Array.from({ length: losersUpperTeamCount }, (_, i) => ({ 
    id: `__placeholder_lu_${i}`, player1_name: '', player2_name: '', seed: null 
  }));
  const losersLowerDummy = Array.from({ length: losersLowerTeamCount }, (_, i) => ({ 
    id: `__placeholder_ll_${i}`, player1_name: '', player2_name: '', seed: null 
  }));

  const losersUpper = generateHalfBracket([], tournamentId, modalityId, 'losers', 'upper', 3);
  const losersLower = generateHalfBracket([], tournamentId, modalityId, 'losers', 'lower', 4);

  // Instead of using dummy teams, create empty bracket structure for losers
  const losersUpperMatches = generateLosersBracketStructure(
    losersUpperTeamCount, tournamentId, modalityId, 'upper', 3
  );
  const losersLowerMatches = generateLosersBracketStructure(
    losersLowerTeamCount, tournamentId, modalityId, 'lower', 4
  );

  // Calculate max round across all brackets for positioning cross-semis and final
  const winnersMaxRound = Math.max(
    ...winnersUpper.map(m => m.round),
    ...winnersLower.map(m => m.round),
    0
  );
  const losersMaxRound = Math.max(
    ...losersUpperMatches.map(m => m.round),
    ...losersLowerMatches.map(m => m.round),
    0
  );
  const crossSemiRound = Math.max(winnersMaxRound, losersMaxRound) + 1;

  // 5. Cross-Semifinals (bracket_number=5)
  // Semi 1: Campeão Perdedores Superior vs Campeão Vencedores Inferior
  const crossSemi1: MatchData = {
    tournament_id: tournamentId,
    modality_id: modalityId,
    round: crossSemiRound,
    position: 1,
    team1_id: null, // Will be filled: Losers Upper champion
    team2_id: null, // Will be filled: Winners Lower champion
    status: 'pending',
    bracket_type: 'cross_semi',
    bracket_half: 'upper',
    bracket_number: 5,
    _temp_id: 'cross_semi_1',
  };

  // Semi 2: Campeão Perdedores Inferior vs Campeão Vencedores Superior
  const crossSemi2: MatchData = {
    tournament_id: tournamentId,
    modality_id: modalityId,
    round: crossSemiRound,
    position: 2,
    team1_id: null, // Will be filled: Losers Lower champion
    team2_id: null, // Will be filled: Winners Upper champion
    status: 'pending',
    bracket_type: 'cross_semi',
    bracket_half: 'lower',
    bracket_number: 5,
    _temp_id: 'cross_semi_2',
  };

  // 6. Final (bracket_number=6)
  const finalMatch: MatchData = {
    tournament_id: tournamentId,
    modality_id: modalityId,
    round: crossSemiRound + 1,
    position: 1,
    team1_id: null,
    team2_id: null,
    status: 'pending',
    bracket_type: 'final',
    bracket_half: null,
    bracket_number: 6,
    _temp_id: 'final',
  };

  const allMatches: MatchData[] = [
    ...winnersUpper,
    ...winnersLower,
    ...losersUpperMatches,
    ...losersLowerMatches,
    crossSemi1,
    crossSemi2,
    finalMatch,
  ];

  // Clean up temp IDs and placeholders
  const cleanMatches = allMatches.map(({ _temp_id, ...rest }) => ({
    ...rest,
    team1_id: rest.team1_id?.startsWith('__placeholder') ? null : rest.team1_id,
    team2_id: rest.team2_id?.startsWith('__placeholder') ? null : rest.team2_id,
  }));

  return { matches: cleanMatches };
}

/**
 * Generate single-elimination bracket structure for losers half (all empty)
 */
function generateLosersBracketStructure(
  teamCount: number,
  tournamentId: string,
  modalityId: string,
  half: 'upper' | 'lower',
  bracketNumber: number,
): MatchData[] {
  if (teamCount < 2) {
    // Only 1 team will come - no matches needed, they auto-advance
    return [];
  }

  const totalSlots = Math.pow(2, Math.ceil(Math.log2(teamCount)));
  const maxRounds = Math.ceil(Math.log2(totalSlots));
  const matches: MatchData[] = [];

  for (let r = 1; r <= maxRounds; r++) {
    const count = totalSlots / Math.pow(2, r);
    for (let p = 0; p < count; p++) {
      matches.push({
        tournament_id: tournamentId,
        modality_id: modalityId,
        round: r,
        position: p + 1,
        team1_id: null,
        team2_id: null,
        status: 'pending',
        bracket_type: 'losers',
        bracket_half: half,
        bracket_number: bracketNumber,
        _temp_id: `l_${half}_r${r}_p${p + 1}`,
      });
    }
  }

  return matches;
}

/**
 * Get mirror half for losers bracket placement
 * Winners Upper loser → Losers LOWER
 * Winners Lower loser → Losers UPPER
 */
export function getMirrorHalf(winnersHalf: string): string {
  return winnersHalf === 'upper' ? 'lower' : 'upper';
}

/**
 * Unused legacy - kept for compatibility
 */
export function canTeamsMeet(): boolean {
  return true;
}

export function processDoubleEliminationResult(): any {
  return {};
}
