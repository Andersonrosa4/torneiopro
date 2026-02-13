/**
 * Cascade Reset Logic for Double Elimination
 * 
 * When a completed match result is edited, this module clears all downstream
 * matches that were populated by the original result, allowing re-propagation.
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
  next_win_match_id: string | null;
  next_lose_match_id: string | null;
  modality_id?: string | null;
}

interface ResetUpdate {
  matchId: string;
  data: Record<string, any>;
}

/**
 * Find all downstream matches that need to be reset when a match result changes.
 * Walks the next_win_match_id and next_lose_match_id links recursively.
 */
export function computeCascadeResets(
  editedMatch: Match,
  allMatches: Match[],
  oldWinnerId: string | null,
  oldLoserId: string | null,
): ResetUpdate[] {
  const updates: ResetUpdate[] = [];
  const visited = new Set<string>();

  function clearDownstream(matchId: string, teamIdToRemove: string) {
    if (visited.has(`${matchId}:${teamIdToRemove}`)) return;
    visited.add(`${matchId}:${teamIdToRemove}`);

    const target = allMatches.find(m => m.id === matchId);
    if (!target) return;

    const resetData: Record<string, any> = {};

    // Determine which slot this team is in
    if (target.team1_id === teamIdToRemove) {
      resetData.team1_id = null;
    } else if (target.team2_id === teamIdToRemove) {
      resetData.team2_id = null;
    } else {
      return; // Team not in this match, no need to continue
    }

    // If match was completed by this team winning, reset the whole match
    if (target.winner_team_id === teamIdToRemove) {
      resetData.winner_team_id = null;
      resetData.status = 'pending';
      resetData.score1 = 0;
      resetData.score2 = 0;

      // Also need to clear winner downstream
      if (target.next_win_match_id) {
        clearDownstream(target.next_win_match_id, teamIdToRemove);
      }
    } else if (target.status === 'completed' && target.winner_team_id) {
      // Match was completed but this team LOST — still need to reset
      // because the opponent that won might no longer be valid
      const otherTeam = target.team1_id === teamIdToRemove ? target.team2_id : target.team1_id;
      
      resetData.winner_team_id = null;
      resetData.status = 'pending';
      resetData.score1 = 0;
      resetData.score2 = 0;

      // Clear the winner of this match from its downstream
      if (target.next_win_match_id && otherTeam) {
        clearDownstream(target.next_win_match_id, otherTeam);
      }
      // Clear the loser of this match from downstream (if it was in losers bracket)
      if (target.next_lose_match_id && teamIdToRemove) {
        // The team that lost this match went to losers bracket
        // But since we're resetting, that path is invalidated too
      }
    }

    updates.push({ matchId: target.id, data: resetData });
  }

  // Clear old winner from win path
  if (oldWinnerId && editedMatch.next_win_match_id) {
    clearDownstream(editedMatch.next_win_match_id, oldWinnerId);
  }

  // Clear old loser from lose path
  if (oldLoserId && editedMatch.next_lose_match_id) {
    clearDownstream(editedMatch.next_lose_match_id, oldLoserId);
  }

  return updates;
}

/**
 * Check if a match has been completed and has downstream effects.
 */
export function hasDownstreamEffects(match: Match, allMatches: Match[]): boolean {
  if (!match.winner_team_id) return false;
  
  // Check if winner was placed in a next match
  if (match.next_win_match_id) {
    const nextWin = allMatches.find(m => m.id === match.next_win_match_id);
    if (nextWin && (nextWin.team1_id === match.winner_team_id || nextWin.team2_id === match.winner_team_id)) {
      return true;
    }
  }

  // Check if loser was placed in a next match
  if (match.next_lose_match_id) {
    const loserId = match.team1_id === match.winner_team_id ? match.team2_id : match.team1_id;
    const nextLose = allMatches.find(m => m.id === match.next_lose_match_id);
    if (loserId && nextLose && (nextLose.team1_id === loserId || nextLose.team2_id === loserId)) {
      return true;
    }
  }

  return false;
}
