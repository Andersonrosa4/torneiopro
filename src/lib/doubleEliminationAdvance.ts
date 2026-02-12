/**
 * Double Elimination Advancement Logic
 * Handles automatic progression for winners and losers with mirror crossing
 */

interface Match {
  id: string;
  bracket_type: string | null;
  bracket_half: string | null;
  round: number;
  position: number;
  bracket_number: number;
  team1_id: string | null;
  team2_id: string | null;
  winner_team_id: string | null;
  next_win_match_id: string | null;
  next_lose_match_id: string | null;
  status: string;
}

/**
 * Get the mirror half for losers bracket placement (anti-shock)
 * Winners Upper loser → Losers Lower
 * Winners Lower loser → Losers Upper
 */
export function getMirrorHalf(winnersHalf: string): string {
  return winnersHalf === 'upper' ? 'lower' : 'upper';
}

/**
 * Find the next match for a winner in the same bracket
 */
export function findNextWinMatch(
  matches: Match[],
  currentMatch: Match,
  winnerId: string
): { matchId: string; field: 'team1_id' | 'team2_id' } | null {
  if (!currentMatch.next_win_match_id) {
    // Fallback: find by round/position logic
    const nextRound = currentMatch.round + 1;
    const nextPosition = Math.ceil(currentMatch.position / 2);
    const isTop = currentMatch.position % 2 === 1;

    let nextMatch: Match | undefined;

    if (currentMatch.bracket_type === 'winners') {
      // Winners bracket: same half
      nextMatch = matches.find(
        (m) =>
          m.bracket_type === 'winners' &&
          m.bracket_half === currentMatch.bracket_half &&
          m.round === nextRound &&
          m.position === nextPosition
      );
    } else if (currentMatch.bracket_type === 'losers') {
      // Losers bracket: same half
      nextMatch = matches.find(
        (m) =>
          m.bracket_type === 'losers' &&
          m.bracket_half === currentMatch.bracket_half &&
          m.round === nextRound &&
          m.position === nextPosition
      );
    } else if (currentMatch.bracket_type === 'final') {
      // Grand final: no next match
      return null;
    }

    if (nextMatch) {
      return {
        matchId: nextMatch.id,
        field: isTop ? 'team1_id' : 'team2_id',
      };
    }
    return null;
  }

  // Use next_win_match_id if available
  const nextMatch = matches.find((m) => m.id === currentMatch.next_win_match_id);
  if (nextMatch) {
    const isTop = currentMatch.position % 2 === 1;
    return {
      matchId: currentMatch.next_win_match_id,
      field: isTop ? 'team1_id' : 'team2_id',
    };
  }

  return null;
}

/**
 * Find the next match for a loser in the losers bracket (mirror crossing)
 */
export function findNextLoseMatch(
  matches: Match[],
  currentMatch: Match,
  loserId: string
): { matchId: string; field: 'team1_id' | 'team2_id'; mirrorHalf: string } | null {
  // Only winners bracket losers drop to losers bracket
  if (currentMatch.bracket_type !== 'winners' || !currentMatch.bracket_half) {
    return null;
  }

  const isFirstRound = currentMatch.round === 1;
  const isTop = currentMatch.position % 2 === 1;
  const mirrorHalf = getMirrorHalf(currentMatch.bracket_half);

  if (!currentMatch.next_lose_match_id) {
    // Fallback: find by logic
    // First round winners losers go directly to first losers bracket round (mirror half)
    if (isFirstRound) {
      // Find first losers bracket match in mirror half
      const firstLosersMatch = matches.find(
        (m) =>
          m.bracket_type === 'losers' &&
          m.bracket_half === mirrorHalf &&
          m.round === 1 &&
          m.position === Math.ceil(currentMatch.position / 2)
      );

      if (firstLosersMatch) {
        return {
          matchId: firstLosersMatch.id,
          field: isTop ? 'team1_id' : 'team2_id',
          mirrorHalf,
        };
      }
    } else {
      // Later round losers: find corresponding losers bracket match
      const losersRound = currentMatch.round + 1;
      const losersPosition = Math.ceil(currentMatch.position / 2);
      const nextLosersMatch = matches.find(
        (m) =>
          m.bracket_type === 'losers' &&
          m.bracket_half === mirrorHalf &&
          m.round === losersRound &&
          m.position === losersPosition
      );

      if (nextLosersMatch) {
        return {
          matchId: nextLosersMatch.id,
          field: isTop ? 'team1_id' : 'team2_id',
          mirrorHalf,
        };
      }
    }

    return null;
  }

  // Use next_lose_match_id if available
  const nextMatch = matches.find((m) => m.id === currentMatch.next_lose_match_id);
  if (nextMatch) {
    return {
      matchId: currentMatch.next_lose_match_id,
      field: isTop ? 'team1_id' : 'team2_id',
      mirrorHalf,
    };
  }

  return null;
}

/**
 * Handle advancement after a match result
 * Returns update operations to perform
 */
export function processDoubleEliminationAdvance(
  matches: Match[],
  currentMatch: Match,
  winnerId: string,
  loserId: string | null
): {
  winnerUpdates: Array<{ matchId: string; data: Record<string, string> }>;
  loserUpdates: Array<{ matchId: string; data: Record<string, string> }>;
  resetFinalNeeded: boolean;
} {
  const result = {
    winnerUpdates: [] as Array<{ matchId: string; data: Record<string, string> }>,
    loserUpdates: [] as Array<{ matchId: string; data: Record<string, string> }>,
    resetFinalNeeded: false,
  };

  // Winner advancement
  const nextWinMatch = findNextWinMatch(matches, currentMatch, winnerId);
  if (nextWinMatch) {
    result.winnerUpdates.push({
      matchId: nextWinMatch.matchId,
      data: { [nextWinMatch.field]: winnerId },
    });
  } else if (currentMatch.bracket_type === 'winners' && !currentMatch.bracket_half) {
    // Winners final: advance to grand final
    const grandFinal = matches.find(
      (m) => m.bracket_type === 'final' && m.bracket_half === null
    );
    if (grandFinal) {
      result.winnerUpdates.push({
        matchId: grandFinal.id,
        data: { team1_id: winnerId },
      });
    }
  } else if (currentMatch.bracket_type === 'losers' && !currentMatch.bracket_half) {
    // Losers final: advance to grand final (as team2)
    const grandFinal = matches.find(
      (m) => m.bracket_type === 'final' && m.bracket_half === null
    );
    if (grandFinal) {
      result.winnerUpdates.push({
        matchId: grandFinal.id,
        data: { team2_id: winnerId },
      });

      // Check if losers champion beat winners champion, if so: reset final needed
      const grandFinalMatch = matches.find(
        (m) => m.bracket_type === 'final' && m.bracket_half === null
      );
      if (grandFinalMatch && grandFinalMatch.team1_id && grandFinalMatch.team2_id) {
        // Grand final is complete, check if losers champion won
        if (grandFinalMatch.winner_team_id === winnerId) {
          result.resetFinalNeeded = true;
        }
      }
    }
  }

  // Loser advancement (mirror crossing)
  if (loserId) {
    const nextLoseMatch = findNextLoseMatch(matches, currentMatch, loserId);
    if (nextLoseMatch) {
      result.loserUpdates.push({
        matchId: nextLoseMatch.matchId,
        data: { [nextLoseMatch.field]: loserId },
      });
    }
  }

  return result;
}

/**
 * Check if a reset final is needed and create it if necessary
 * Reset final: Grand Final rematch if Losers champion defeated Winners champion
 */
export function handleResetFinal(
  matches: Match[],
  grandFinalMatch: Match
): { needsReset: boolean; resetMatchToCreate: Partial<Match> | null } {
  if (!grandFinalMatch || grandFinalMatch.bracket_type !== 'final') {
    return { needsReset: false, resetMatchToCreate: null };
  }

  // If losers champion (team2) beat winners champion (team1), need reset
  if (
    grandFinalMatch.status === 'completed' &&
    grandFinalMatch.winner_team_id === grandFinalMatch.team2_id &&
    grandFinalMatch.team2_id
  ) {
    // Create reset match: winner stays as team1, loser becomes team2
    const resetMatch: Partial<Match> = {
      bracket_type: 'reset_final',
      bracket_half: null,
      round: grandFinalMatch.round + 1,
      position: 1,
      team1_id: grandFinalMatch.team2_id, // Losers champion (previous winner)
      team2_id: grandFinalMatch.team1_id, // Winners champion (previous loser)
      status: 'pending',
    };

    return { needsReset: true, resetMatchToCreate: resetMatch };
  }

  return { needsReset: false, resetMatchToCreate: null };
}
