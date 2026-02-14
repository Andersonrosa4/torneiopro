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
  /**
   * IRON RULE — SLOT CONVENTION (never change):
   *   • Losers bracket survivor advancing within losers  → ALWAYS team1_id
   *   • Winners bracket loser dropping INTO losers        → ALWAYS team2_id
   * This guarantees zero collisions between the two flows.
   */

  let preferredSlot: 'team1_id' | 'team2_id';

  // ─── RULE 1: Losers survivor → team1_id (IMMUTABLE) ───
  if (isWinner && currentMatch.bracket_type === 'losers' && nextMatch.bracket_type === 'losers') {
    preferredSlot = 'team1_id';
  }
  // ─── RULE 2: Winners loser dropping to losers → team2_id (IMMUTABLE) ───
  else if (!isWinner && currentMatch.bracket_type === 'winners' && nextMatch.bracket_type === 'losers') {
    preferredSlot = 'team2_id';
  }
  // ─── Winners advancing within winners ───
  else if (isWinner && currentMatch.bracket_type === 'winners' && nextMatch.bracket_type === 'winners') {
    preferredSlot = currentMatch.position % 2 === 1 ? 'team1_id' : 'team2_id';
  }
  // ─── Winners final → semi_final ───
  else if (isWinner && currentMatch.bracket_type === 'winners' && nextMatch.bracket_type === 'semi_final') {
    preferredSlot = 'team1_id';
  }
  // ─── Losers final → semi_final ───
  else if (isWinner && currentMatch.bracket_type === 'losers' && nextMatch.bracket_type === 'semi_final') {
    preferredSlot = 'team2_id';
  }
  // ─── Semi → final ───
  else if (isWinner && currentMatch.bracket_type === 'semi_final' && nextMatch.bracket_type === 'final') {
    preferredSlot = currentMatch.position === 1 ? 'team1_id' : 'team2_id';
  }
  // ─── Fallback ───
  else {
    preferredSlot = !nextMatch.team1_id ? 'team1_id' : 'team2_id';
  }

  // SAFETY NET: If preferred slot is already occupied, use the other slot
  // But WARN loudly — this should never happen if rules above are correct
  if (nextMatch[preferredSlot]) {
    const otherSlot = preferredSlot === 'team1_id' ? 'team2_id' : 'team1_id';
    if (!nextMatch[otherSlot]) {
      console.error(
        `[🚨 SLOT COLLISION] Match ${nextMatch.id} (${nextMatch.bracket_type} R${nextMatch.round}P${nextMatch.position}): ` +
        `preferred ${preferredSlot} already occupied. Falling back to ${otherSlot}. ` +
        `Source: ${currentMatch.bracket_type} R${currentMatch.round}P${currentMatch.position} isWinner=${isWinner}`
      );
      return otherSlot;
    }
    // Both slots occupied — critical error
    console.error(
      `[💀 BOTH SLOTS FULL] Match ${nextMatch.id}: CANNOT place team. ` +
      `Source: ${currentMatch.bracket_type} R${currentMatch.round}P${currentMatch.position}`
    );
  }

  return preferredSlot;
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
  // GUARD: Semifinal/Final losers are IMMEDIATELY ELIMINATED
  const isSemiFinalOrFinal = currentMatch.bracket_type === 'semi_final' || currentMatch.bracket_type === 'final';
  if (loserId && currentMatch.next_lose_match_id && !isSemiFinalOrFinal) {
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
    // IRON RULE: Winners losers ALWAYS go to team2_id in losers bracket
    if (loserId && bh) {
      const mirrorHalf = oppositeSide(bh);
      const mirrorBN = bh === 'upper' ? 4 : 3;
      const losersInMirror = matches.filter(m => m.bracket_type === 'losers' && m.bracket_number === mirrorBN);
      
      if (losersInMirror.length > 0 && losersInMirror[0].bracket_half !== mirrorHalf) {
        console.error(`[❌ Legacy Mirror] Expected losers half=${mirrorHalf}, found=${losersInMirror[0].bracket_half}`);
      }
      
      const targetRound = currentMatch.round === 1 ? 1 : currentMatch.round;
      const targetMatches = losersInMirror.filter(m => m.round === targetRound).sort((a, b) => a.position - b.position);

      const targetIdx = Math.floor((currentMatch.position - 1) / 2);

      if (targetIdx < targetMatches.length) {
        // ALWAYS team2_id for winners bracket losers dropping down
        result.loserUpdates.push({ matchId: targetMatches[targetIdx].id, data: { team2_id: loserId } });
      }
    }
  }

  if (bt === 'losers' && bh) {
    const nextMatch = findNextInSameBracket();
    if (nextMatch) {
      // IRON RULE: Losers survivors ALWAYS go to team1_id
      result.winnerUpdates.push({ matchId: nextMatch.id, data: { team1_id: winnerId } });
    } else if (isFinalOfHalf()) {
      // Campeão Losers → semifinal com CRUZAMENTO CORRETO
      // Losers Upper (has W-B losers) → Semi upper (Semi 1, with W-A champ) = SAME half
      // Losers Lower (has W-A losers) → Semi lower (Semi 2, with W-B champ) = SAME half
      // REGRA: Losers champion goes to semi of SAME bracket_half (not opposite!)
      // because mirror routing already crossed the sides when losers entered.
      const semis = matches.filter(m => m.bracket_type === 'semi_final');
      const targetSemi = semis.find(m => m.bracket_half === bh);
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
