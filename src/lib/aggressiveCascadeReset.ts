/**
 * Aggressive Cascade Reset for Double Elimination
 * 
 * When a completed match result is EDITED in Double Elimination:
 * - Regenerate ENTIRE Winners bracket from the edited round onwards
 * - Regenerate ENTIRE Losers bracket from the edited round onwards
 * 
 * This ensures NO orphaned references and preserves bracket integrity.
 */

interface Match {
  id: string;
  round: number;
  position: number;
  team1_id: string | null;
  team2_id: string | null;
  winner_team_id: string | null;
  status: string;
  bracket_type: string | null;
  bracket_half: string | null;
  bracket_number?: number | null;
  next_win_match_id: string | null;
  next_lose_match_id: string | null;
  modality_id?: string | null;
}

export interface CascadeResetPlan {
  /** Matches to DELETE completely */
  toDelete: string[];
  /** Matches to UPDATE (reset scores, status, teams) */
  toUpdate: Array<{ matchId: string; data: Record<string, any> }>;
  /** Diagnostic info */
  log: string[];
}

/**
 * Compute aggressive cascade reset for double elimination.
 * 
 * When match at round R is edited:
 * 1. Find all matches in SAME bracket_type + bracket_half with round >= R
 * 2. For DE: also find corresponding matches in Losers bracket (mirror crossing)
 * 3. Delete ALL downstream matches
 * 4. Reset scores/teams on partially-impacted matches
 */
export function computeAggressiveCascadeReset(
  editedMatch: Match,
  allMatches: Match[],
): CascadeResetPlan {
  const log: string[] = [];
  const toDelete: Set<string> = new Set();
  const toUpdate: Map<string, Record<string, any>> = new Map();

  // ── STEP 1: Identify matches to purge based on bracket type and round ──
  
  // Same bracket type (winners/losers) + same half + same round or later
  const sameBracketMatches = allMatches.filter(m => 
    m.bracket_type === editedMatch.bracket_type &&
    m.bracket_half === editedMatch.bracket_half &&
    m.round >= editedMatch.round &&
    m.id !== editedMatch.id
  );

  // For edited Winners matches, also cascade to opposite Losers (mirror crossing)
  let mirrorLosersMatches: Match[] = [];
  if (editedMatch.bracket_type === 'winners' && editedMatch.bracket_half) {
    const oppositeSide = editedMatch.bracket_half === 'upper' ? 'lower' : 'upper';
    mirrorLosersMatches = allMatches.filter(m =>
      m.bracket_type === 'losers' &&
      m.bracket_half === oppositeSide &&
      m.round >= editedMatch.round
    );
    log.push(`[Mirror] Winners ${editedMatch.bracket_half} R${editedMatch.round} cascades to Losers ${oppositeSide} R${editedMatch.round}+`);
  }

  // Collect all matches to DELETE
  const candidatesToDelete = [...sameBracketMatches, ...mirrorLosersMatches];
  for (const m of candidatesToDelete) {
    toDelete.add(m.id);
    log.push(`[Delete] ${m.bracket_type} ${m.bracket_half} R${m.round}P${m.position} (cascade)`);
  }

  // ── STEP 2: Nullify references to deleted matches ──
  // Any match that links to a deleted match should have that link nullified
  for (const m of allMatches) {
    if (!toDelete.has(m.id)) {
      const updates: Record<string, any> = {};
      if (m.next_win_match_id && toDelete.has(m.next_win_match_id)) {
        updates.next_win_match_id = null;
      }
      if (m.next_lose_match_id && toDelete.has(m.next_lose_match_id)) {
        updates.next_lose_match_id = null;
      }
      if (Object.keys(updates).length > 0) {
        toUpdate.set(m.id, updates);
        log.push(`[Nullify] ${m.bracket_type} ${m.bracket_half} R${m.round}P${m.position} - clear refs to deleted`);
      }
    }
  }

  // ── STEP 3: Reset the edited match itself ──
  toUpdate.set(editedMatch.id, {
    winner_team_id: null,
    status: 'pending',
    score1: 0,
    score2: 0,
    // Also nullify any references to deleted matches
    ...(editedMatch.next_win_match_id && toDelete.has(editedMatch.next_win_match_id) 
      ? { next_win_match_id: null } 
      : {}),
    ...(editedMatch.next_lose_match_id && toDelete.has(editedMatch.next_lose_match_id) 
      ? { next_lose_match_id: null } 
      : {}),
  });
  log.push(`[Reset] Edited match ${editedMatch.id} cleared`);

  return {
    toDelete: Array.from(toDelete),
    toUpdate: Array.from(toUpdate.entries()).map(([matchId, data]) => ({ matchId, data })),
    log,
  };
}

/**
 * Compute aggressive cascade reset for single elimination.
 * 
 * For SE, only semifinal and final are recalculated.
 * Earlier rounds are NEVER reset.
 */
export function computePartialCascadeResetSE(
  editedMatch: Match,
  allMatches: Match[],
): CascadeResetPlan {
  const log: string[] = [];
  const toDelete: Set<string> = new Set();
  const toUpdate: Map<string, Record<string, any>> = new Map();

  // Find the latest round (final) and second-to-last (semifinal)
  const eliminationMatches = allMatches.filter(m => m.round > 0);
  const roundNumbers = new Set(eliminationMatches.map(m => m.round));
  const sortedRounds = Array.from(roundNumbers).sort((a, b) => b - a); // descending
  
  const finalRound = sortedRounds[0];
  const semiRound = sortedRounds[1];

  // Only allow reset if edited match is in round < semifinal
  if (editedMatch.round >= semiRound) {
    log.push(`[SE] Edited match in round ${editedMatch.round}, cannot reset (only semifinal+ resettable)`);
    return { toDelete: [], toUpdate: [], log };
  }

  // Delete all semifinal and final matches
  const toRecalculate = allMatches.filter(m =>
    m.round >= semiRound && m.round !== editedMatch.round
  );

  for (const m of toRecalculate) {
    toDelete.add(m.id);
    log.push(`[Delete-SE] Round ${m.round} Position ${m.position} (recalculate semifinal/final)`);
  }

  // Reset the edited match
  toUpdate.set(editedMatch.id, {
    winner_team_id: null,
    status: 'pending',
    score1: 0,
    score2: 0,
  });

  return {
    toDelete: Array.from(toDelete),
    toUpdate: Array.from(toUpdate.entries()).map(([matchId, data]) => ({ matchId, data })),
    log,
  };
}
