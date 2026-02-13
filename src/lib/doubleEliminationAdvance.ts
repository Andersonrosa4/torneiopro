/**
 * Double Elimination Advancement Logic
 * 
 * Rules:
 * - Winners: teams play within their half only
 * - Losers: mirror crossing (Winners Upper losers → Losers Lower, vice versa)
 * - Sequential pairing: L(J1) vs L(J2), L(J3) vs L(J4)
 * - Anti-repetition: rounds 1-2 of losers, no rematches from winners
 * - Chapéu: odd team waits, no auto-win
 * - Any loss in Losers = eliminated
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
  modality_id?: string | null;
}

export function getMirrorHalf(winnersHalf: string): string {
  return winnersHalf === 'upper' ? 'lower' : 'upper';
}

function getMirrorBracketNumber(winnersHalf: string): number {
  return winnersHalf === 'upper' ? 4 : 3;
}

/**
 * Find next match for winner within same bracket/half
 */
function findNextWinnerMatch(
  matches: Match[],
  currentMatch: Match,
): { matchId: string; field: 'team1_id' | 'team2_id' } | null {
  const nextRound = currentMatch.round + 1;
  const nextPosition = Math.ceil(currentMatch.position / 2);
  const isTop = currentMatch.position % 2 === 1;

  const nextMatch = matches.find(
    m =>
      m.bracket_type === currentMatch.bracket_type &&
      m.bracket_half === currentMatch.bracket_half &&
      m.bracket_number === currentMatch.bracket_number &&
      m.round === nextRound &&
      m.position === nextPosition
  );

  if (nextMatch) {
    return { matchId: nextMatch.id, field: isTop ? 'team1_id' : 'team2_id' };
  }
  return null;
}

function isFinalOfHalf(matches: Match[], match: Match): boolean {
  const sameHalfMatches = matches.filter(
    m =>
      m.bracket_type === match.bracket_type &&
      m.bracket_half === match.bracket_half &&
      m.bracket_number === match.bracket_number
  );
  const maxRound = Math.max(...sameHalfMatches.map(m => m.round));
  return match.round === maxRound;
}

/**
 * Check if two teams have already played each other in any completed match
 */
function haveTeamsPlayedBefore(matches: Match[], teamA: string, teamB: string): boolean {
  return matches.some(
    m =>
      m.status === 'completed' &&
      m.winner_team_id && // has a real result (not chapéu)
      ((m.team1_id === teamA && m.team2_id === teamB) ||
       (m.team1_id === teamB && m.team2_id === teamA))
  );
}

/**
 * Find losers bracket slot using sequential pairing.
 * Losers from consecutive winners matches pair up:
 * L(J1) vs L(J2), L(J3) vs L(J4), etc.
 * 
 * Anti-repetition: in rounds 1-2 of losers, avoid rematches.
 */
function findLosersSlot(
  matches: Match[],
  losersBracketNumber: number,
  winnersRound: number,
  winnersPosition: number,
  loserId: string,
): { matchId: string; field: 'team1_id' | 'team2_id' } | null {
  const losersMatches = matches.filter(
    m => m.bracket_type === 'losers' && m.bracket_number === losersBracketNumber
  );

  if (losersMatches.length === 0) return null;

  if (winnersRound === 1) {
    // Sequential pairing: positions 1,2 → losers match 1; positions 3,4 → losers match 2
    const round1Matches = losersMatches
      .filter(m => m.round === 1)
      .sort((a, b) => a.position - b.position);

    const targetIdx = Math.floor((winnersPosition - 1) / 2);
    const isFirst = (winnersPosition - 1) % 2 === 0;
    let targetMatch = round1Matches[targetIdx];
    let field: 'team1_id' | 'team2_id' = isFirst ? 'team1_id' : 'team2_id';

    if (targetMatch) {
      // Anti-repetition check for round 1
      const existingTeamId = isFirst ? targetMatch.team2_id : targetMatch.team1_id;
      if (existingTeamId && haveTeamsPlayedBefore(matches, loserId, existingTeamId)) {
        // Try to swap with adjacent match
        const swapResult = findAntiRepetitionSwap(
          round1Matches, targetIdx, field, loserId, matches
        );
        if (swapResult) return swapResult;
      }

      return { matchId: targetMatch.id, field };
    }

    // Chapéu: odd number of losers, no match available
    // Find any empty slot in round 1 or create waiting position
    for (const m of round1Matches) {
      if (!m.team1_id) return { matchId: m.id, field: 'team1_id' };
      if (!m.team2_id) return { matchId: m.id, field: 'team2_id' };
    }

    // If all round 1 matches are full, place in round 2 as chapéu (waiting)
    const round2Matches = losersMatches
      .filter(m => m.round === 2)
      .sort((a, b) => a.position - b.position);
    for (const m of round2Matches) {
      if (!m.team1_id) return { matchId: m.id, field: 'team1_id' };
      if (!m.team2_id) return { matchId: m.id, field: 'team2_id' };
    }
  } else {
    // Later round losers from winners
    const targetRound = winnersRound;
    const laterMatches = losersMatches
      .filter(m => m.round === targetRound)
      .sort((a, b) => a.position - b.position);

    if (laterMatches.length > 0) {
      const targetIdx = Math.min(winnersPosition - 1, laterMatches.length - 1);
      const targetMatch = laterMatches[targetIdx];
      if (targetMatch) {
        if (!targetMatch.team1_id) {
          // Anti-repetition check for round 2
          if (targetRound <= 2 && targetMatch.team2_id &&
            haveTeamsPlayedBefore(matches, loserId, targetMatch.team2_id)) {
            const swap = findAntiRepetitionSwap(laterMatches, targetIdx, 'team1_id', loserId, matches);
            if (swap) return swap;
          }
          return { matchId: targetMatch.id, field: 'team1_id' };
        }
        if (!targetMatch.team2_id) {
          if (targetRound <= 2 && targetMatch.team1_id &&
            haveTeamsPlayedBefore(matches, loserId, targetMatch.team1_id)) {
            const swap = findAntiRepetitionSwap(laterMatches, targetIdx, 'team2_id', loserId, matches);
            if (swap) return swap;
          }
          return { matchId: targetMatch.id, field: 'team2_id' };
        }
      }
    }

    // Fallback: any empty slot
    for (const m of losersMatches.sort((a, b) => a.round - b.round || a.position - b.position)) {
      if (!m.team1_id) return { matchId: m.id, field: 'team1_id' };
      if (!m.team2_id) return { matchId: m.id, field: 'team2_id' };
    }
  }

  return null;
}

/**
 * Try to find an alternative match to avoid anti-repetition conflict.
 * Swaps with adjacent matches in the same round.
 */
function findAntiRepetitionSwap(
  roundMatches: Match[],
  originalIdx: number,
  originalField: 'team1_id' | 'team2_id',
  loserId: string,
  allMatches: Match[],
): { matchId: string; field: 'team1_id' | 'team2_id' } | null {
  // Try adjacent matches
  const tryOrder = [];
  for (let offset = 1; offset < roundMatches.length; offset++) {
    if (originalIdx + offset < roundMatches.length) tryOrder.push(originalIdx + offset);
    if (originalIdx - offset >= 0) tryOrder.push(originalIdx - offset);
  }

  for (const idx of tryOrder) {
    const m = roundMatches[idx];
    // Check team1 slot
    if (!m.team1_id) {
      const opponent = m.team2_id;
      if (!opponent || !haveTeamsPlayedBefore(allMatches, loserId, opponent)) {
        return { matchId: m.id, field: 'team1_id' };
      }
    }
    // Check team2 slot
    if (!m.team2_id) {
      const opponent = m.team1_id;
      if (!opponent || !haveTeamsPlayedBefore(allMatches, loserId, opponent)) {
        return { matchId: m.id, field: 'team2_id' };
      }
    }
  }

  // No swap found - allow the original placement (conflict unavoidable)
  return null;
}

/**
 * Process advancement after declaring a winner
 */
export function processDoubleEliminationAdvance(
  matches: Match[],
  currentMatch: Match,
  winnerId: string,
  loserId: string | null
): {
  winnerUpdates: Array<{ matchId: string; data: Record<string, string> }>;
  loserUpdates: Array<{ matchId: string; data: Record<string, string> }>;
} {
  const result = {
    winnerUpdates: [] as Array<{ matchId: string; data: Record<string, string> }>,
    loserUpdates: [] as Array<{ matchId: string; data: Record<string, string> }>,
  };

  const bt = currentMatch.bracket_type;
  const bh = currentMatch.bracket_half;

  // === WINNERS BRACKET ===
  if (bt === 'winners' && bh) {
    const nextWin = findNextWinnerMatch(matches, currentMatch);
    if (nextWin) {
      result.winnerUpdates.push({
        matchId: nextWin.matchId,
        data: { [nextWin.field]: winnerId },
      });
    } else if (isFinalOfHalf(matches, currentMatch)) {
      // Champion → cross-semifinal
      const crossSemis = matches.filter(m => m.bracket_type === 'cross_semi');
      if (bh === 'upper') {
        const semi = crossSemis.find(m => m.bracket_half === 'lower');
        if (semi) {
          result.winnerUpdates.push({ matchId: semi.id, data: { team2_id: winnerId } });
        }
      } else {
        const semi = crossSemis.find(m => m.bracket_half === 'upper');
        if (semi) {
          result.winnerUpdates.push({ matchId: semi.id, data: { team2_id: winnerId } });
        }
      }
    }

    // Loser drops to Losers bracket (mirror crossing) with sequential pairing
    if (loserId && bh) {
      const mirrorBN = getMirrorBracketNumber(bh);
      const slot = findLosersSlot(
        matches, mirrorBN, currentMatch.round, currentMatch.position, loserId
      );
      if (slot) {
        result.loserUpdates.push({
          matchId: slot.matchId,
          data: { [slot.field]: loserId },
        });
      }
    }
  }

  // === LOSERS BRACKET ===
  if (bt === 'losers' && bh) {
    const nextWin = findNextWinnerMatch(matches, currentMatch);
    if (nextWin) {
      result.winnerUpdates.push({
        matchId: nextWin.matchId,
        data: { [nextWin.field]: winnerId },
      });
    } else if (isFinalOfHalf(matches, currentMatch)) {
      // Champion → cross-semifinal
      const crossSemis = matches.filter(m => m.bracket_type === 'cross_semi');
      if (bh === 'upper') {
        const semi = crossSemis.find(m => m.bracket_half === 'upper');
        if (semi) {
          result.winnerUpdates.push({ matchId: semi.id, data: { team1_id: winnerId } });
        }
      } else {
        const semi = crossSemis.find(m => m.bracket_half === 'lower');
        if (semi) {
          result.winnerUpdates.push({ matchId: semi.id, data: { team1_id: winnerId } });
        }
      }
    }
    // Loser in losers = eliminated
  }

  // === CROSS-SEMIFINAL ===
  if (bt === 'cross_semi') {
    const finalMatch = matches.find(m => m.bracket_type === 'final');
    if (finalMatch) {
      const field = currentMatch.position === 1 ? 'team1_id' : 'team2_id';
      result.winnerUpdates.push({
        matchId: finalMatch.id,
        data: { [field]: winnerId },
      });
    }
  }

  return result;
}

// Legacy compatibility
export function handleResetFinal(
  _matches: Match[],
  _grandFinalMatch: Match
): { needsReset: boolean; resetMatchToCreate: null } {
  return { needsReset: false, resetMatchToCreate: null };
}

export function findNextWinMatch() { return null; }
export function findNextLoseMatch() { return null; }
