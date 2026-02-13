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

  const sortedFeeders = feedingMatches.sort(
    (a, b) => a.position - b.position
  );

  sortedFeeders.forEach((feeder, idx) => {
    const isWinnerFeeder = feeder.next_win_match_id === targetMatch.id;
    const type = isWinnerFeeder ? 'winner' : 'loser';
    const prefix = isWinnerFeeder ? 'V' : 'P';
    
    // Use matchNumberMap for the real sequence number
    const num = matchNumberMap?.get(feeder.id) ?? feeder.position;
    
    const feederLabel: FeederInfo = {
      label: `${prefix}${num}`,
      type,
      matchNumber: feeder.id,
    };

    if (idx === 0) {
      feeders.team1 = feederLabel;
    } else if (idx === 1) {
      feeders.team2 = feederLabel;
    }
  });

  if (feeders.team1 === null && feeders.team2 === null) {
    if (targetMatch.round === 1) {
      feeders.team1 = { label: 'Seed 1', type: 'seed', matchNumber: '' };
      feeders.team2 = { label: 'Seed 2', type: 'seed', matchNumber: '' };
    }
  }

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
