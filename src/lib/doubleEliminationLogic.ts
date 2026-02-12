/**
 * Double Elimination Bracket Generation Logic
 * 
 * Rules:
 * - Teams split into Upper Half and Lower Half
 * - Winners bracket: losers drop to Losers bracket
 * - Mirror crossing (anti-shock): Winners Upper losers → Losers Lower, vice versa
 * - Isolation: teams from same block can't meet until 3rd losers round
 * - Semifinal losers in Winners: eliminated or 3rd place (configurable)
 * - Final: Winners champion vs Losers champion
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
  bracket_type: string; // 'winners' | 'losers' | 'final' | 'third_place'
  bracket_half: string | null; // 'upper' | 'lower' | null
  bracket_number: number;
  next_win_match_id?: string | null;
  next_lose_match_id?: string | null;
  winner_team_id?: string | null;
  _temp_id?: string; // for linking before DB insert
}

export interface DoubleEliminationConfig {
  tournamentId: string;
  modalityId: string;
  teams: Team[];
  useSeeds: boolean;
  seedTeamIds?: string[];
  allowThirdPlace: boolean; // if true, semifinal losers go to 3rd place match
}

export interface GeneratedBracket {
  matches: Omit<MatchData, '_temp_id'>[];
}

/**
 * Split teams into upper and lower halves
 */
function splitIntoHalves(teams: Team[]): { upper: Team[]; lower: Team[] } {
  const half = Math.ceil(teams.length / 2);
  return {
    upper: teams.slice(0, half),
    lower: teams.slice(half),
  };
}

/**
 * Generate winners bracket matches for a half
 */
function generateWinnersBracketHalf(
  teams: Team[],
  tournamentId: string,
  modalityId: string,
  half: 'upper' | 'lower',
  bracketNumber: number,
): MatchData[] {
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
      bracket_type: 'winners',
      bracket_half: half,
      bracket_number: bracketNumber,
      _temp_id: `w_${half}_r1_p${i + 1}`,
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
        bracket_type: 'winners',
        bracket_half: half,
        bracket_number: bracketNumber,
        _temp_id: `w_${half}_r${r}_p${p + 1}`,
      });
    }
  }

  return matches;
}

/**
 * Generate losers bracket matches for a half
 * Mirror crossing: losers from Winners Upper → Losers Lower, vice versa
 */
function generateLosersBracketHalf(
  winnersUpperRounds: number,
  winnersLowerRounds: number,
  tournamentId: string,
  modalityId: string,
  half: 'upper' | 'lower',
  bracketNumber: number,
): MatchData[] {
  const matches: MatchData[] = [];
  // Losers bracket has roughly (2 * winnersRounds - 1) rounds
  // But simplified: we create slots that will be filled as losers drop down
  const sourceRounds = half === 'upper' ? winnersLowerRounds : winnersUpperRounds;
  
  // First losers round: first-round losers from opposite Winners half
  // Number of matches = first round matches / 2 (paired up)
  let currentMatchCount = Math.pow(2, sourceRounds - 1) / 2;
  if (currentMatchCount < 1) currentMatchCount = 1;

  let losersRound = 1;
  let position = 1;

  // Generate losers rounds - alternating between:
  // 1. Survivors vs each other
  // 2. Survivors vs new arrivals from Winners
  for (let wr = 1; wr <= sourceRounds; wr++) {
    // Round where losers from winners round wr arrive
    const matchCount = Math.max(Math.pow(2, sourceRounds - wr) / 2, 1);
    
    for (let p = 0; p < matchCount; p++) {
      matches.push({
        tournament_id: tournamentId,
        modality_id: modalityId,
        round: losersRound,
        position: position++,
        team1_id: null,
        team2_id: null,
        status: 'pending',
        bracket_type: 'losers',
        bracket_half: half,
        bracket_number: bracketNumber,
        _temp_id: `l_${half}_r${losersRound}_p${p + 1}`,
      });
    }
    losersRound++;

    // Consolidation round (survivors play each other)
    if (wr < sourceRounds) {
      const consolCount = Math.max(matchCount / 2, 1);
      for (let p = 0; p < consolCount; p++) {
        matches.push({
          tournament_id: tournamentId,
          modality_id: modalityId,
          round: losersRound,
          position: position++,
          team1_id: null,
          team2_id: null,
          status: 'pending',
          bracket_type: 'losers',
          bracket_half: half,
          bracket_number: bracketNumber,
          _temp_id: `l_${half}_r${losersRound}_p${p + 1}`,
        });
      }
      losersRound++;
    }
  }

  return matches;
}

/**
 * Main function: Generate full double elimination bracket
 */
export function generateDoubleEliminationBracket(config: DoubleEliminationConfig): GeneratedBracket {
  const { tournamentId, modalityId, teams, useSeeds, seedTeamIds, allowThirdPlace } = config;

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

  // Generate Winners brackets
  const winnersUpper = generateWinnersBracketHalf(upper, tournamentId, modalityId, 'upper', 1);
  const winnersLower = generateWinnersBracketHalf(lower, tournamentId, modalityId, 'lower', 2);

  const upperRounds = winnersUpper.length > 0 ? Math.max(...winnersUpper.map(m => m.round)) : 0;
  const lowerRounds = winnersLower.length > 0 ? Math.max(...winnersLower.map(m => m.round)) : 0;

  // Generate Losers brackets (with mirror crossing)
  const losersUpper = generateLosersBracketHalf(upperRounds, lowerRounds, tournamentId, modalityId, 'upper', 3);
  const losersLower = generateLosersBracketHalf(upperRounds, lowerRounds, tournamentId, modalityId, 'lower', 4);

  // Winners Final: Upper champion vs Lower champion
  const winnersFinal: MatchData = {
    tournament_id: tournamentId,
    modality_id: modalityId,
    round: Math.max(upperRounds, lowerRounds) + 1,
    position: 1,
    team1_id: null,
    team2_id: null,
    status: 'pending',
    bracket_type: 'winners',
    bracket_half: null,
    bracket_number: 5,
    _temp_id: 'winners_final',
  };

  // Grand Final: Winners champion decides title
  const grandFinal: MatchData = {
    tournament_id: tournamentId,
    modality_id: modalityId,
    round: Math.max(upperRounds, lowerRounds) + 2,
    position: 1,
    team1_id: null,
    team2_id: null,
    status: 'pending',
    bracket_type: 'final',
    bracket_half: null,
    bracket_number: 6,
    _temp_id: 'grand_final',
  };

  const allMatches: MatchData[] = [
    ...winnersUpper,
    ...winnersLower,
    ...losersUpper,
    ...losersLower,
    winnersFinal,
    grandFinal,
  ];

  // Add third place match if configured
  if (allowThirdPlace) {
    allMatches.push({
      tournament_id: tournamentId,
      modality_id: modalityId,
      round: Math.max(upperRounds, lowerRounds) + 1,
      position: 2,
      team1_id: null,
      team2_id: null,
      status: 'pending',
      bracket_type: 'third_place',
      bracket_half: null,
      bracket_number: 7,
      _temp_id: 'third_place',
    });
  }

  // Clean up temp IDs before returning
  const cleanMatches = allMatches.map(({ _temp_id, ...rest }) => rest);

  return { matches: cleanMatches };
}

/**
 * Determine where a loser should go based on mirror crossing rules
 * Winners Upper loser → Losers Lower
 * Winners Lower loser → Losers Upper
 */
export function getMirrorHalf(currentHalf: string): string {
  return currentHalf === 'upper' ? 'lower' : 'upper';
}

/**
 * Check if two teams can meet based on isolation rules
 * Teams from same original block can't meet until 3rd losers round
 */
export function canTeamsMeet(
  team1OriginalHalf: string,
  team2OriginalHalf: string,
  losersRound: number
): boolean {
  if (team1OriginalHalf === team2OriginalHalf && losersRound < 3) {
    return false; // Isolation: same block can't meet in first 2 losers rounds
  }
  return true;
}

/**
 * Process match result for double elimination
 * Returns updates needed for next matches
 */
export function processDoubleEliminationResult(
  match: {
    id: string;
    bracket_type: string;
    bracket_half: string | null;
    round: number;
    position: number;
    bracket_number: number;
    next_win_match_id: string | null;
    next_lose_match_id: string | null;
  },
  winnerId: string,
  loserId: string,
): { nextWinUpdate?: { matchId: string; field: string; teamId: string }; nextLoseUpdate?: { matchId: string; field: string; teamId: string } } {
  const result: any = {};

  // Winner advances
  if (match.next_win_match_id) {
    const isTop = match.position % 2 === 1;
    result.nextWinUpdate = {
      matchId: match.next_win_match_id,
      field: isTop ? 'team1_id' : 'team2_id',
      teamId: winnerId,
    };
  }

  // Loser handling
  if (match.bracket_type === 'winners' && match.next_lose_match_id) {
    // First loss → drop to losers bracket (mirror crossing applied)
    result.nextLoseUpdate = {
      matchId: match.next_lose_match_id,
      field: match.position % 2 === 1 ? 'team1_id' : 'team2_id',
      teamId: loserId,
    };
  }
  // If bracket_type === 'losers', second loss → eliminated (no next_lose_match_id)

  return result;
}
