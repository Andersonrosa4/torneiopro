/**
 * Double Elimination Bracket Generation Logic
 * 
 * Structure:
 * 1. Vencedores (Superior / Lado A) - Winners Upper Half
 * 2. Vencedores (Inferior / Lado B) - Winners Lower Half
 * 3. Perdedores (Superior) - receives losers from Winners LOWER (mirror)
 * 4. Perdedores (Inferior) - receives losers from Winners UPPER (mirror)
 * 5. Semifinais Cruzadas
 * 6. Final
 * 
 * Rules:
 * - Random draw for initial placement
 * - Optional seeding: organizer assigns teams to Side A or B
 * - Chapéu (odd teams): team waits, NO auto-advance, NO auto-win
 * - Sequential pairing for losers (L1 vs L2, L3 vs L4)
 * - Anti-repetition for losers R1-R2
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
  bracket_type: string;
  bracket_half: string | null;
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
  /** For DE seeding: teams assigned to Side A */
  sideATeamIds?: string[];
  /** For DE seeding: teams assigned to Side B */
  sideBTeamIds?: string[];
  allowThirdPlace: boolean;
}

export interface GeneratedBracket {
  matches: Omit<MatchData, '_temp_id'>[];
}

/**
 * Shuffle array using Fisher-Yates
 */
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Split teams into Side A (upper) and Side B (lower).
 * Respects manual side assignments. Odd → upper gets one extra.
 */
function splitIntoHalves(
  teams: Team[],
  sideAIds?: string[],
  sideBIds?: string[],
): { upper: Team[]; lower: Team[] } {
  const halfSize = Math.ceil(teams.length / 2);

  // If manual side assignment
  if ((sideAIds && sideAIds.length > 0) || (sideBIds && sideBIds.length > 0)) {
    const assignedA = teams.filter(t => sideAIds?.includes(t.id));
    const assignedB = teams.filter(t => sideBIds?.includes(t.id));
    const unassigned = shuffle(
      teams.filter(t => !sideAIds?.includes(t.id) && !sideBIds?.includes(t.id))
    );

    const upper = [...assignedA];
    const lower = [...assignedB];

    // Fill remaining spots
    for (const t of unassigned) {
      if (upper.length < halfSize) {
        upper.push(t);
      } else {
        lower.push(t);
      }
    }

    return { upper: shuffle(upper), lower: shuffle(lower) };
  }

  // Pure random
  const shuffled = shuffle(teams);
  return {
    upper: shuffled.slice(0, halfSize),
    lower: shuffled.slice(halfSize),
  };
}

/**
 * Generate bracket matches for one half of winners.
 * Chapéu rule: matches with only 1 team stay PENDING (no auto-advance).
 * The lone team waits for an opponent.
 */
function generateWinnersHalfBracket(
  teams: Team[],
  tournamentId: string,
  modalityId: string,
  half: 'upper' | 'lower',
  bracketNumber: number,
): MatchData[] {
  if (teams.length < 1) return [];

  const totalSlots = Math.pow(2, Math.ceil(Math.log2(Math.max(teams.length, 2))));
  const maxRounds = Math.ceil(Math.log2(totalSlots));
  const matches: MatchData[] = [];

  // First round - sequential matchups (T1 vs T2, T3 vs T4, etc.)
  const matchesInFirstRound = totalSlots / 2;
  for (let i = 0; i < matchesInFirstRound; i++) {
    const t1Idx = i * 2;
    const t2Idx = i * 2 + 1;
    const t1 = teams[t1Idx] || null;
    const t2 = teams[t2Idx] || null;

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

    // CHAPÉU RULE: NO auto-advance for byes
    // Team with no opponent stays pending and waits
    // Only skip completely empty matches
    if (!match.team1_id && !match.team2_id) {
      // Empty match - still create for bracket structure
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

  // Post-process: propagate chapéu teams to next round
  // A chapéu team (alone in a match) goes to the next round match slot
  // but does NOT get a win - they wait for an opponent there
  const firstRoundMatches = matches.filter(m => m.round === 1);
  for (const m of firstRoundMatches) {
    const hasOneTeam = (m.team1_id && !m.team2_id) || (!m.team1_id && m.team2_id);
    const hasNoTeams = !m.team1_id && !m.team2_id;

    if (hasOneTeam) {
      // Chapéu: propagate to next round without marking as won
      const chapeuTeamId = m.team1_id || m.team2_id;
      const nextRound = 2;
      const nextPosition = Math.ceil(m.position / 2);
      const isTop = m.position % 2 === 1;
      const field = isTop ? 'team1_id' : 'team2_id';

      const nextMatch = matches.find(
        nm => nm.round === nextRound && nm.position === nextPosition &&
          nm.bracket_type === 'winners' && nm.bracket_half === half
      );
      if (nextMatch) {
        (nextMatch as any)[field] = chapeuTeamId;
      }

      // Mark the bye match as completed but with no winner (chapéu indicator)
      m.status = 'completed';
      // No winner_team_id set - this indicates it was a chapéu, not a win
    } else if (hasNoTeams) {
      // Empty match - mark as completed (structural placeholder)
      m.status = 'completed';
    }
  }

  return matches;
}

/**
 * Main function: Generate full double elimination bracket
 */
export function generateDoubleEliminationBracket(config: DoubleEliminationConfig): GeneratedBracket {
  const { tournamentId, modalityId, teams, useSeeds, seedTeamIds, sideATeamIds, sideBTeamIds } = config;

  // Split into halves (with optional side assignment)
  const { upper, lower } = splitIntoHalves(
    teams,
    useSeeds ? sideATeamIds : undefined,
    useSeeds ? sideBTeamIds : undefined,
  );

  // 1. Winners Upper / Lado A (bracket_number=1)
  const winnersUpper = generateWinnersHalfBracket(upper, tournamentId, modalityId, 'upper', 1);
  // 2. Winners Lower / Lado B (bracket_number=2)
  const winnersLower = generateWinnersHalfBracket(lower, tournamentId, modalityId, 'lower', 2);

  // Losers brackets: initially empty, teams placed as they lose
  // 3. Losers Upper (receives losers from Winners LOWER - mirror) (bracket_number=3)
  // 4. Losers Lower (receives losers from Winners UPPER - mirror) (bracket_number=4)
  const upperSlots = Math.pow(2, Math.ceil(Math.log2(Math.max(upper.length, 2))));
  const lowerSlots = Math.pow(2, Math.ceil(Math.log2(Math.max(lower.length, 2))));

  const losersUpperTeamCount = lowerSlots / 2;
  const losersLowerTeamCount = upperSlots / 2;

  const losersUpperMatches = generateLosersBracketStructure(
    losersUpperTeamCount, tournamentId, modalityId, 'upper', 3
  );
  const losersLowerMatches = generateLosersBracketStructure(
    losersLowerTeamCount, tournamentId, modalityId, 'lower', 4
  );

  // Calculate cross-semi round
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
  const crossSemi1: MatchData = {
    tournament_id: tournamentId,
    modality_id: modalityId,
    round: crossSemiRound,
    position: 1,
    team1_id: null,
    team2_id: null,
    status: 'pending',
    bracket_type: 'cross_semi',
    bracket_half: 'upper',
    bracket_number: 5,
    _temp_id: 'cross_semi_1',
  };

  const crossSemi2: MatchData = {
    tournament_id: tournamentId,
    modality_id: modalityId,
    round: crossSemiRound,
    position: 2,
    team1_id: null,
    team2_id: null,
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

  // Clean up temp IDs
  const cleanMatches = allMatches.map(({ _temp_id, ...rest }) => rest);

  return { matches: cleanMatches };
}

/**
 * Generate empty losers bracket structure for sequential pairing
 * Losers pair sequentially: L(J1) vs L(J2), L(J3) vs L(J4), etc.
 */
function generateLosersBracketStructure(
  teamCount: number,
  tournamentId: string,
  modalityId: string,
  half: 'upper' | 'lower',
  bracketNumber: number,
): MatchData[] {
  if (teamCount < 2) return [];

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
 */
export function getMirrorHalf(winnersHalf: string): string {
  return winnersHalf === 'upper' ? 'lower' : 'upper';
}

export function canTeamsMeet(): boolean {
  return true;
}

export function processDoubleEliminationResult(): any {
  return {};
}
