/**
 * Double Elimination Advancement Logic v2
 * 
 * REGRAS:
 * - Usa next_win_match_id e next_lose_match_id para resolução automática de slots
 * - Após término de um jogo, preenche automaticamente team1_id/team2_id do próximo match
 * - Winners: vencedor avança dentro da mesma sub-chave
 * - Losers: perdedor dos Vencedores cai para Perdedores (mirror crossing)
 * - Perdedor nos Perdedores = ELIMINADO
 * - Semifinais: perdedor eliminado, nunca cai para perdedores
 * - Anti-repetição: evita rematches nas rodadas iniciais dos perdedores
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
  // STRICT: losers side MUST be opposite of winners side
  if (winnersHalf === 'upper') return 'lower';
  if (winnersHalf === 'lower') return 'upper';
  return winnersHalf === 'upper' ? 'lower' : 'upper';
}

function oppositeSide(side: string): string {
  return side === 'upper' ? 'lower' : 'upper';
}

/**
 * Check if two teams have already played each other
 */
function haveTeamsPlayedBefore(matches: Match[], teamA: string, teamB: string): boolean {
  return matches.some(
    m =>
      m.status === 'completed' &&
      m.winner_team_id &&
      ((m.team1_id === teamA && m.team2_id === teamB) ||
       (m.team1_id === teamB && m.team2_id === teamA))
  );
}

/**
 * Determine which slot (team1_id or team2_id) to place a team in the next match.
 * Uses position-based logic: odd positions → team1, even → team2
 */
function determineSlotInNextMatch(
  currentMatch: Match,
  nextMatch: Match,
  isWinner: boolean,
): 'team1_id' | 'team2_id' {
  // For winners advancing within same bracket type
  if (isWinner && currentMatch.bracket_type === nextMatch.bracket_type) {
    return currentMatch.position % 2 === 1 ? 'team1_id' : 'team2_id';
  }

  // For losers dropping to losers bracket
  if (!isWinner && currentMatch.bracket_type === 'winners' && nextMatch.bracket_type === 'losers') {
    // Sequential: positions 1,2 → match 1 (team1, team2); 3,4 → match 2
    return (currentMatch.position - 1) % 2 === 0 ? 'team1_id' : 'team2_id';
  }

  // Winners final → semi_final (mesmo lado)
  if (isWinner && currentMatch.bracket_type === 'winners' && nextMatch.bracket_type === 'semi_final') {
    return 'team1_id'; // Campeão Winners entra como team1 na semifinal
  }

  // Losers final → semi_final (mesmo lado)
  if (isWinner && currentMatch.bracket_type === 'losers' && nextMatch.bracket_type === 'semi_final') {
    return 'team2_id'; // Campeão Losers entra como team2 na semifinal
  }

  // Semi → final
  if (isWinner && currentMatch.bracket_type === 'semi_final' && nextMatch.bracket_type === 'final') {
    return currentMatch.position === 1 ? 'team1_id' : 'team2_id';
  }

  // Fallback: first empty slot
  if (!nextMatch.team1_id) return 'team1_id';
  return 'team2_id';
}

/**
 * Process advancement after declaring a winner.
 * Uses linkage fields (next_win_match_id, next_lose_match_id) for automatic resolution.
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

  // ── WINNER ADVANCEMENT ──
  if (currentMatch.next_win_match_id) {
    const nextWinMatch = matches.find(m => m.id === currentMatch.next_win_match_id);
    if (nextWinMatch) {
      const slot = determineSlotInNextMatch(currentMatch, nextWinMatch, true);
      result.winnerUpdates.push({
        matchId: nextWinMatch.id,
        data: { [slot]: winnerId },
      });
    }
  }

  // ── LOSER PLACEMENT — MIRROR CROSSING ENFORCED ──
  if (loserId && currentMatch.next_lose_match_id) {
    const nextLoseMatch = matches.find(m => m.id === currentMatch.next_lose_match_id);
    if (nextLoseMatch) {
      // VALIDATE: If current match is winners, losers target MUST be opposite side
      if (currentMatch.bracket_type === 'winners' && currentMatch.bracket_half && nextLoseMatch.bracket_half) {
        const expectedSide = oppositeSide(currentMatch.bracket_half);
        if (nextLoseMatch.bracket_half !== expectedSide) {
          console.error(
            `[❌ MIRROR VIOLATION at runtime] Winners ${currentMatch.bracket_half} R${currentMatch.round}P${currentMatch.position} ` +
            `→ Losers ${nextLoseMatch.bracket_half} (expected ${expectedSide}). Blocking placement.`
          );
          return result; // Block invalid placement
        }
        console.log(
          `[✓ Mirror Route] Winners ${currentMatch.bracket_half} → Losers ${nextLoseMatch.bracket_half} (correct)`
        );
      }

      let slot = determineSlotInNextMatch(currentMatch, nextLoseMatch, false);

      // Anti-repetition check for losers bracket R1-R2
      if (nextLoseMatch.bracket_type === 'losers' && nextLoseMatch.round <= 2) {
        const oppositeSlot = slot === 'team1_id' ? 'team2_id' : 'team1_id';
        const existingOpponent = nextLoseMatch[oppositeSlot];

        if (existingOpponent && haveTeamsPlayedBefore(matches, loserId, existingOpponent)) {
          const altSlot = findAntiRepetitionAlternative(
            matches, nextLoseMatch, loserId, slot
          );
          if (altSlot) {
            result.loserUpdates.push({
              matchId: altSlot.matchId,
              data: { [altSlot.field]: loserId },
            });
            return result;
          }
        }
      }

      result.loserUpdates.push({
        matchId: nextLoseMatch.id,
        data: { [slot]: loserId },
      });
    }
  }

  // ── FALLBACK: Legacy support without linkage ──
  if (!currentMatch.next_win_match_id && !currentMatch.next_lose_match_id) {
    // Use position-based logic as fallback
    const fallbackResult = processLegacyAdvancement(matches, currentMatch, winnerId, loserId);
    result.winnerUpdates.push(...fallbackResult.winnerUpdates);
    result.loserUpdates.push(...fallbackResult.loserUpdates);
  }

  return result;
}

/**
 * Find an alternative match slot to avoid anti-repetition conflict
 */
function findAntiRepetitionAlternative(
  matches: Match[],
  originalMatch: Match,
  loserId: string,
  originalSlot: 'team1_id' | 'team2_id',
): { matchId: string; field: 'team1_id' | 'team2_id' } | null {
  const sameRoundMatches = matches.filter(
    m =>
      m.bracket_type === originalMatch.bracket_type &&
      m.bracket_half === originalMatch.bracket_half &&
      m.bracket_number === originalMatch.bracket_number &&
      m.round === originalMatch.round &&
      m.id !== originalMatch.id
  ).sort((a, b) => a.position - b.position);

  for (const m of sameRoundMatches) {
    if (!m.team1_id) {
      if (!m.team2_id || !haveTeamsPlayedBefore(matches, loserId, m.team2_id)) {
        return { matchId: m.id, field: 'team1_id' };
      }
    }
    if (!m.team2_id) {
      if (!m.team1_id || !haveTeamsPlayedBefore(matches, loserId, m.team1_id)) {
        return { matchId: m.id, field: 'team2_id' };
      }
    }
  }

  return null;
}

/**
 * Legacy fallback for brackets without linkage fields
 */
function processLegacyAdvancement(
  matches: Match[],
  currentMatch: Match,
  winnerId: string,
  loserId: string | null,
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

  // Find next match by position
  const findNextInSameBracket = (): Match | null => {
    const nextRound = currentMatch.round + 1;
    const nextPosition = Math.ceil(currentMatch.position / 2);
    return matches.find(
      m =>
        m.bracket_type === bt &&
        m.bracket_half === bh &&
        m.bracket_number === currentMatch.bracket_number &&
        m.round === nextRound &&
        m.position === nextPosition
    ) || null;
  };

  const isFinalOfHalf = (): boolean => {
    const sameHalf = matches.filter(
      m => m.bracket_type === bt && m.bracket_half === bh && m.bracket_number === currentMatch.bracket_number
    );
    const maxRound = Math.max(...sameHalf.map(m => m.round));
    return currentMatch.round === maxRound;
  };

  if (bt === 'winners' && bh) {
    const nextMatch = findNextInSameBracket();
    if (nextMatch) {
      const field = currentMatch.position % 2 === 1 ? 'team1_id' : 'team2_id';
      result.winnerUpdates.push({ matchId: nextMatch.id, data: { [field]: winnerId } });
    } else if (isFinalOfHalf()) {
      // Campeão Winners → semifinal CRUZADA
      // Winners A (upper) → Semi 1 (upper), Winners B (lower) → Semi 2 (lower)
      const semis = matches.filter(m => m.bracket_type === 'semi_final');
      const targetSemi = semis.find(m => m.bracket_half === bh);
      if (targetSemi) {
        result.winnerUpdates.push({ matchId: targetSemi.id, data: { team1_id: winnerId } });
      }
    }

    // Loser → mirror losers bracket (STRICT: oppositeSide)
    if (loserId && bh) {
      const mirrorHalf = oppositeSide(bh);
      const mirrorBN = bh === 'upper' ? 4 : 3; // upper→4(losers lower), lower→3(losers upper)
      const losersInMirror = matches.filter(m => m.bracket_type === 'losers' && m.bracket_number === mirrorBN);
      
      // Validate mirror routing
      if (losersInMirror.length > 0 && losersInMirror[0].bracket_half !== mirrorHalf) {
        console.error(`[❌ Legacy Mirror] Expected losers half=${mirrorHalf}, found=${losersInMirror[0].bracket_half}`);
      }
      
      const targetRound = currentMatch.round === 1 ? 1 : currentMatch.round;
      const targetMatches = losersInMirror.filter(m => m.round === targetRound).sort((a, b) => a.position - b.position);

      const targetIdx = Math.floor((currentMatch.position - 1) / 2);
      const isFirst = (currentMatch.position - 1) % 2 === 0;

      if (targetIdx < targetMatches.length) {
        const field = isFirst ? 'team1_id' : 'team2_id';
        result.loserUpdates.push({ matchId: targetMatches[targetIdx].id, data: { [field]: loserId } });
      }
    }
  }

  if (bt === 'losers' && bh) {
    const nextMatch = findNextInSameBracket();
    if (nextMatch) {
      const field = currentMatch.position % 2 === 1 ? 'team1_id' : 'team2_id';
      result.winnerUpdates.push({ matchId: nextMatch.id, data: { [field]: winnerId } });
    } else if (isFinalOfHalf()) {
      // Campeão Losers → semifinal CRUZADA (lado oposto)
      // Losers A (upper) → Semi 2 (lower), Losers B (lower) → Semi 1 (upper)
      const semis = matches.filter(m => m.bracket_type === 'semi_final');
      const crossHalf = oppositeSide(bh);
      const targetSemi = semis.find(m => m.bracket_half === crossHalf);
      if (targetSemi) {
        result.winnerUpdates.push({ matchId: targetSemi.id, data: { team2_id: winnerId } });
      }
    }
  }

  if (bt === 'semi_final') {
    const finalMatch = matches.find(m => m.bracket_type === 'final');
    if (finalMatch) {
      const field = currentMatch.position === 1 ? 'team1_id' : 'team2_id';
      result.winnerUpdates.push({ matchId: finalMatch.id, data: { [field]: winnerId } });
    }
  }

  return result;
}

// Legacy compatibility exports
export function handleResetFinal(
  _matches: Match[],
  _grandFinalMatch: Match
): { needsReset: boolean; resetMatchToCreate: null } {
  return { needsReset: false, resetMatchToCreate: null };
}

export function findNextWinMatch() { return null; }
export function findNextLoseMatch() { return null; }
