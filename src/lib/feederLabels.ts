/**
 * Feeder Label Calculation for Double Elimination Bracket
 * 
 * Computes which match feeds each slot (V = winner, P = loser)
 * Labels use the global match sequence number (matchNumber), NOT position/index.
 */

interface Match {
  id: string;
  round: number;
  position: number;
  team1_id: string | null;
  team2_id: string | null;
  winner_team_id: string | null;
  status: string;
  bracket_type?: string;
  bracket_half?: string | null;
  next_win_match_id?: string | null;
  next_lose_match_id?: string | null;
}

export interface FeederInfo {
  label: string; // e.g. "V40", "P12"
  type: 'winner' | 'loser' | 'seed';
  matchNumber: string;
}

/**
 * Find all matches that feed INTO the given match.
 * matchNumberMap maps match.id → global sequential number (from scheduler).
 */
export function getSlotFeeders(
  targetMatch: Match,
  allMatches: Match[],
  matchNumberMap?: Map<string, number>
): { team1: FeederInfo | null; team2: FeederInfo | null } {
  const feeders: { team1: FeederInfo | null; team2: FeederInfo | null } = {
    team1: null,
    team2: null,
  };

  const feedingMatches = allMatches.filter(
    (m) =>
      m.next_win_match_id === targetMatch.id ||
      m.next_lose_match_id === targetMatch.id
  );

  for (const feeder of feedingMatches) {
    const isWinnerFeeder = feeder.next_win_match_id === targetMatch.id;
    const type = isWinnerFeeder ? 'winner' : 'loser';
    const prefix = isWinnerFeeder ? 'Venc.' : 'Perd.';
    const num = matchNumberMap?.get(feeder.id) ?? feeder.position;

    const feederLabel: FeederInfo = {
      label: `${prefix}${num}`,
      type,
      matchNumber: feeder.id,
    };

    // Determine which slot this feeder ACTUALLY fills
    let slot: 'team1' | 'team2' | null = null;

    if (isWinnerFeeder && feeder.winner_team_id) {
      // Winner feeder: check where the winner ended up
      if (feeder.winner_team_id === targetMatch.team1_id) slot = 'team1';
      else if (feeder.winner_team_id === targetMatch.team2_id) slot = 'team2';
    } else if (!isWinnerFeeder && feeder.winner_team_id) {
      // Loser feeder: the loser is the OTHER team
      const loserId = feeder.team1_id === feeder.winner_team_id ? feeder.team2_id : feeder.team1_id;
      if (loserId && loserId === targetMatch.team1_id) slot = 'team1';
      else if (loserId && loserId === targetMatch.team2_id) slot = 'team2';
    }

    // Fallback when match not yet played: use slot convention rules
    if (!slot) {
      if (isWinnerFeeder && feeder.bracket_type === 'losers' && targetMatch.bracket_type === 'losers') {
        // Position-based: two losers matches may feed the same next match
        slot = feeder.position % 2 === 1 ? 'team1' : 'team2';
      } else if (!isWinnerFeeder && feeder.bracket_type === 'winners' && targetMatch.bracket_type === 'losers') {
        // MUST match doubleEliminationAdvance.ts: position-based slot for droppers
        slot = feeder.position % 2 === 1 ? 'team1' : 'team2';
      } else if (isWinnerFeeder && feeder.bracket_type === 'winners' && targetMatch.bracket_type === 'winners') {
        slot = feeder.position % 2 === 1 ? 'team1' : 'team2';
      } else {
        slot = !feeders.team1 ? 'team1' : 'team2';
      }
    }

    // Assign to correct slot, with collision fallback
    if (slot === 'team1' && !feeders.team1) {
      feeders.team1 = feederLabel;
    } else if (slot === 'team2' && !feeders.team2) {
      feeders.team2 = feederLabel;
    } else if (!feeders.team1) {
      feeders.team1 = feederLabel;
    } else if (!feeders.team2) {
      feeders.team2 = feederLabel;
    }
  }

  // Round 1 matches have no feeders — leave null (no labels shown)

  return feeders;
}

/**
 * Compute feeders for the entire bracket.
 */
export function computeAllFeeders(
  allMatches: Match[],
  matchNumberMap?: Map<string, number>
): Map<string, ReturnType<typeof getSlotFeeders>> {
  const feederMap = new Map<string, ReturnType<typeof getSlotFeeders>>();

  for (const match of allMatches) {
    if (match.round === 0) continue;
    feederMap.set(match.id, getSlotFeeders(match, allMatches, matchNumberMap));
  }

  return feederMap;
}
