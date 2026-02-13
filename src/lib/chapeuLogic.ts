/**
 * Chapéu (Hat/Bye Replacement) Logic
 * 
 * A "Chapéu" is a slot that:
 * - Does NOT auto-advance when opponent is missing
 * - Does NOT count as a match (empty vs team doesn't count)
 * - Displays as a gray card with "Chapéu" text
 * - Team must play a REAL match (against real opponent) before advancing
 * 
 * Implementation:
 * - A match with only team1_id or team2_id (but not both) is a "waiting slot"
 * - Status remains 'pending' until both slots have real teams
 * - No automatic completion on winner declaration
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
  bracket_half?: string | null;
  bracket_number?: number | null;
}

/**
 * Check if a match is a "Chapéu" (waiting slot).
 * 
 * Criteria:
 * - One team is assigned (team1_id XOR team2_id is not null)
 * - Other team is null
 * - Status is 'pending'
 */
export function isChapeu(match: Match): boolean {
  const hasTeam1 = match.team1_id !== null;
  const hasTeam2 = match.team2_id !== null;
  
  // XOR: exactly one team present
  const isWaitingSlot = (hasTeam1 && !hasTeam2) || (!hasTeam1 && hasTeam2);
  
  return isWaitingSlot && match.status === 'pending';
}

/**
 * Check if a match is a "real match" (both teams present).
 */
export function isRealMatch(match: Match): boolean {
  return match.team1_id !== null && match.team2_id !== null;
}

/**
 * Get the team occupying a Chapéu slot (if any).
 */
export function getChapeuTeam(match: Match): string | null {
  if (!isChapeu(match)) return null;
  return match.team1_id || match.team2_id;
}

/**
 * Format Chapéu display text for UI.
 */
export function formatChapeuDisplay(): string {
  return "Chapéu";
}

/**
 * Validate that a team can advance from a match.
 * 
 * Rules:
 * - Team must have played in a REAL match (not just Chapéu slot)
 * - Team must have won that real match
 * 
 * This prevents Chapéu teams from advancing without playing.
 */
export function canTeamAdvance(
  teamId: string,
  matchId: string,
  allMatches: Match[]
): boolean {
  const match = allMatches.find(m => m.id === matchId);
  if (!match) return false;

  // Must be a real match (both teams present)
  if (!isRealMatch(match)) {
    return false; // Cannot advance from Chapéu slot
  }

  // Team must have won
  return match.winner_team_id === teamId;
}

/**
 * Find all "orphaned" Chapéu slots (team waiting but no upcoming real opponent).
 * 
 * This is used for validation/reporting only — helps identify stalled matches.
 */
export function findOrphanedChapeus(allMatches: Match[]): Match[] {
  const orphaned: Match[] = [];

  for (const match of allMatches) {
    if (!isChapeu(match)) continue;

    const team = getChapeuTeam(match);
    if (!team) continue;

    // Check if team has a feeder (next match to go to)
    // In our model, no automatic advancement = no feeder link created
    // So Chapéus waiting for opponent are essentially "orphaned" by design

    orphaned.push(match);
  }

  return orphaned;
}
