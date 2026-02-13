/**
 * Double Elimination Advancement Logic (NEW MODEL)
 * 
 * Structure:
 * - Winners Upper/Lower: teams play within their half only
 * - Losers Upper: receives losers from Winners LOWER (mirror)
 * - Losers Lower: receives losers from Winners UPPER (mirror)
 * - Cross-Semifinals: Losers champ vs opposite Winners champ
 * - Final: winners of cross-semifinals
 * 
 * Any loss in Losers bracket = eliminated
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

/**
 * Get the mirror half for losers bracket placement
 * Winners Upper loser → Losers LOWER (bracket_number=4)
 * Winners Lower loser → Losers UPPER (bracket_number=3)
 */
export function getMirrorHalf(winnersHalf: string): string {
  return winnersHalf === 'upper' ? 'lower' : 'upper';
}

function getMirrorBracketNumber(winnersHalf: string): number {
  // Winners Upper (bn=1) losers → Losers Lower (bn=4)
  // Winners Lower (bn=2) losers → Losers Upper (bn=3)
  return winnersHalf === 'upper' ? 4 : 3;
}

/**
 * Find the next match for a winner within the same bracket/half
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

/**
 * Check if a match is the final match of its bracket half
 */
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
 * Find the first available slot in losers bracket for a dropping team
 */
function findLosersSlot(
  matches: Match[],
  losersBracketNumber: number,
  losersHalf: string,
  winnersRound: number,
  winnersPosition: number,
): { matchId: string; field: 'team1_id' | 'team2_id' } | null {
  // Find losers bracket matches for this half
  const losersMatches = matches.filter(
    m => m.bracket_type === 'losers' && m.bracket_number === losersBracketNumber
  );
  
  if (losersMatches.length === 0) return null;

  // First round losers: map to losers bracket round 1
  // Position mapping: winners position → losers position
  const round1Matches = losersMatches.filter(m => m.round === 1).sort((a, b) => a.position - b.position);
  
  if (winnersRound === 1) {
    // First round: pair up losers
    const targetIdx = Math.floor((winnersPosition - 1) / 2);
    const isTop = (winnersPosition - 1) % 2 === 0;
    const targetMatch = round1Matches[targetIdx];
    
    if (targetMatch) {
      return { matchId: targetMatch.id, field: isTop ? 'team1_id' : 'team2_id' };
    }
  } else {
    // Later round losers: find a match in the appropriate losers round
    // They enter at a later losers round
    const laterMatches = losersMatches
      .filter(m => m.round === winnersRound)
      .sort((a, b) => a.position - b.position);
    
    if (laterMatches.length > 0) {
      const targetIdx = Math.min(winnersPosition - 1, laterMatches.length - 1);
      const targetMatch = laterMatches[targetIdx];
      // Find an empty slot
      if (targetMatch) {
        if (!targetMatch.team1_id) return { matchId: targetMatch.id, field: 'team1_id' };
        if (!targetMatch.team2_id) return { matchId: targetMatch.id, field: 'team2_id' };
      }
    }

    // Fallback: find any empty slot in losers bracket
    for (const m of losersMatches.sort((a, b) => a.round - b.round || a.position - b.position)) {
      if (!m.team1_id) return { matchId: m.id, field: 'team1_id' };
      if (!m.team2_id) return { matchId: m.id, field: 'team2_id' };
    }
  }

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
    // Winner advances within same Winners half
    const nextWin = findNextWinnerMatch(matches, currentMatch);
    if (nextWin) {
      result.winnerUpdates.push({
        matchId: nextWin.matchId,
        data: { [nextWin.field]: winnerId },
      });
    } else if (isFinalOfHalf(matches, currentMatch)) {
      // Champion of Winners half → goes to cross-semifinal
      // Winners Upper champion → cross_semi position 2 (as team2 in cross_semi lower)
      // Winners Lower champion → cross_semi position 1 (as team2 in cross_semi upper)
      const crossSemis = matches.filter(m => m.bracket_type === 'cross_semi');
      if (bh === 'upper') {
        // Winners Upper champ → cross_semi_2 (lower) as team2
        const semi = crossSemis.find(m => m.bracket_half === 'lower');
        if (semi) {
          result.winnerUpdates.push({ matchId: semi.id, data: { team2_id: winnerId } });
        }
      } else {
        // Winners Lower champ → cross_semi_1 (upper) as team2
        const semi = crossSemis.find(m => m.bracket_half === 'upper');
        if (semi) {
          result.winnerUpdates.push({ matchId: semi.id, data: { team2_id: winnerId } });
        }
      }
    }

    // Loser drops to Losers bracket (mirror crossing)
    if (loserId && bh) {
      const mirrorBN = getMirrorBracketNumber(bh);
      const mirrorHalf = getMirrorHalf(bh);
      const slot = findLosersSlot(matches, mirrorBN, mirrorHalf, currentMatch.round, currentMatch.position);
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
    // Winner advances within same Losers half
    const nextWin = findNextWinnerMatch(matches, currentMatch);
    if (nextWin) {
      result.winnerUpdates.push({
        matchId: nextWin.matchId,
        data: { [nextWin.field]: winnerId },
      });
    } else if (isFinalOfHalf(matches, currentMatch)) {
      // Champion of Losers half → goes to cross-semifinal
      // Losers Upper champion → cross_semi_1 (upper) as team1
      // Losers Lower champion → cross_semi_2 (lower) as team1
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
    // Loser in losers bracket = eliminated, no updates needed
  }

  // === CROSS-SEMIFINAL ===
  if (bt === 'cross_semi') {
    // Winner advances to Final
    const finalMatch = matches.find(m => m.bracket_type === 'final');
    if (finalMatch) {
      const field = currentMatch.position === 1 ? 'team1_id' : 'team2_id';
      result.winnerUpdates.push({
        matchId: finalMatch.id,
        data: { [field]: winnerId },
      });
    }
    // Loser is eliminated
  }

  // === FINAL ===
  // No advancement needed from final - winner is champion

  return result;
}

/**
 * Legacy compatibility - no longer used but kept to avoid import errors
 */
export function handleResetFinal(
  _matches: Match[],
  _grandFinalMatch: Match
): { needsReset: boolean; resetMatchToCreate: null } {
  return { needsReset: false, resetMatchToCreate: null };
}

export function findNextWinMatch() { return null; }
export function findNextLoseMatch() { return null; }
