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
 * GRANULAR POLICY: 
 * - Winners edits → cascade within Winners AND to opposite-side Losers (mirror crossing)
 * - Losers edits → cascade ONLY within Losers, NEVER affect Winners
 * 
 * When match at round R is edited:
 * 1. Find all matches in SAME bracket_type + bracket_half with round >= R
 * 2. For DE: Winners edits cascade to opposite Losers (mirror crossing)
 * 3. Losers edits are isolated (no cascade to Winners)
 * 4. Delete ALL downstream matches in affected bracket
 * 5. Reset scores/teams on partially-impacted matches
 */
export function computeAggressiveCascadeReset(
  editedMatch: Match,
  allMatches: Match[],
): CascadeResetPlan {
  const log: string[] = [];
  const toUpdate: Map<string, Record<string, any>> = new Map();

  // ── STEP 1: Identify downstream matches to RESET (never delete!) ──

  // Same bracket type (winners/losers) + same half + later rounds
  const sameBracketMatches = allMatches.filter(m => 
    m.bracket_type === editedMatch.bracket_type &&
    m.bracket_half === editedMatch.bracket_half &&
    m.round > editedMatch.round &&
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
  } else if (editedMatch.bracket_type === 'losers') {
    log.push(`[Isolation] Losers ${editedMatch.bracket_half} R${editedMatch.round} edit isolated - NO cascade to Winners`);
  }

  // RESET all downstream matches (clear teams, scores, status) — NEVER delete
  const candidatesToReset = [...sameBracketMatches, ...mirrorLosersMatches];
  for (const m of candidatesToReset) {
    toUpdate.set(m.id, {
      team1_id: null,
      team2_id: null,
      winner_team_id: null,
      status: 'pending',
      score1: 0,
      score2: 0,
    });
    log.push(`[Reset] ${m.bracket_type} ${m.bracket_half} R${m.round}P${m.position} (cascade reset, preserved)`);
  }

  // ── STEP 2: Reset the edited match itself ──
  toUpdate.set(editedMatch.id, {
    winner_team_id: null,
    status: 'pending',
    score1: 0,
    score2: 0,
  });
  log.push(`[Reset] Edited match ${editedMatch.id} cleared`);

  return {
    toDelete: [], // NEVER delete matches — always preserve bracket structure
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
  const toUpdate: Map<string, Record<string, any>> = new Map();

  // Find the latest round (final) and second-to-last (semifinal)
  const eliminationMatches = allMatches.filter(m => m.round > 0);
  const roundNumbers = new Set(eliminationMatches.map(m => m.round));
  const sortedRounds = Array.from(roundNumbers).sort((a, b) => b - a); // descending
  
  const semiRound = sortedRounds[1];

  // Only allow reset if edited match is in round < semifinal
  if (editedMatch.round >= semiRound) {
    log.push(`[SE] Edited match in round ${editedMatch.round}, cannot reset (only semifinal+ resettable)`);
    return { toDelete: [], toUpdate: [], log };
  }

  // RESET (not delete!) all semifinal, final, and third_place matches
  const toRecalculate = allMatches.filter(m =>
    m.round >= semiRound && m.id !== editedMatch.id
  );

  for (const m of toRecalculate) {
    toUpdate.set(m.id, {
      team1_id: null,
      team2_id: null,
      winner_team_id: null,
      status: 'pending',
      score1: 0,
      score2: 0,
    });
    log.push(`[Reset-SE] Round ${m.round} Position ${m.position} ${m.bracket_type || 'winners'} (reset semifinal/final/3rd)`);
  }

  // Reset the edited match
  toUpdate.set(editedMatch.id, {
    winner_team_id: null,
    status: 'pending',
    score1: 0,
    score2: 0,
  });

  return {
    toDelete: [],
    toUpdate: Array.from(toUpdate.entries()).map(([matchId, data]) => ({ matchId, data })),
    log,
  };
}
