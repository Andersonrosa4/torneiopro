/**
 * Chapéu Distribution Logic
 * 
 * When advancing teams from group stage to knockout don't form a power of 2,
 * this module distributes "Chapéu" (waiting slots) to prioritized teams.
 */

interface Team {
  teamId: string;
  rank: number;
  pointDifferential: number;
}

interface GroupRanking {
  [groupId: string]: Team[];
}

/**
 * Calculate the next power of 2 greater than or equal to n
 */
export function getNextPowerOf2(n: number): number {
  if (n <= 1) return 1;
  if ((n & (n - 1)) === 0) return n; // Already a power of 2
  return Math.pow(2, Math.ceil(Math.log2(n)));
}

/**
 * Check if a number is a power of 2
 */
export function isPowerOf2(n: number): boolean {
  return n > 0 && (n & (n - 1)) === 0;
}

/**
 * Distribute Chapéu slots to 1st place finishers
 * 
 * Returns an object mapping team IDs to their slot type:
 * - 'real': Team has a real opponent
 * - 'chapeu': Team is in a Chapéu (waiting) slot
 */
export function distributeChapeus(
  advancingTeamIds: string[],
  groupRankings: GroupRanking
): { [teamId: string]: 'real' | 'chapeu' } {
  const totalTeams = advancingTeamIds.length;
  const targetSlots = getNextPowerOf2(totalTeams);
  const numChapeus = targetSlots - totalTeams;

  const result: { [teamId: string]: 'real' | 'chapeu' } = {};
  
  // Initially mark all as 'real'
  advancingTeamIds.forEach(teamId => {
    result[teamId] = 'real';
  });

  if (numChapeus === 0) {
    // Perfect power of 2, no Chapéus needed
    return result;
  }

  // Find all 1st place finishers (rank 1 teams)
  const firstPlaceTeams: { teamId: string; groupId: string }[] = [];
  Object.entries(groupRankings).forEach(([groupId, ranking]) => {
    if (ranking.length > 0 && ranking[0]) {
      firstPlaceTeams.push({
        teamId: ranking[0].teamId,
        groupId,
      });
    }
  });

  // Sort 1st place teams by point differential (descending) for tie-breaking
  firstPlaceTeams.sort((a, b) => {
    const aTeam = groupRankings[a.groupId]?.[0];
    const bTeam = groupRankings[b.groupId]?.[0];
    const aDiff = aTeam?.pointDifferential ?? 0;
    const bDiff = bTeam?.pointDifferential ?? 0;
    return bDiff - aDiff;
  });

  // Assign Chapéu to the first numChapeus teams from the sorted 1st place list
  for (let i = 0; i < Math.min(numChapeus, firstPlaceTeams.length); i++) {
    result[firstPlaceTeams[i].teamId] = 'chapeu';
  }

  return result;
}

/**
 * Get Chapéu teams from distribution
 */
export function getChapeuTeams(
  distribution: { [teamId: string]: 'real' | 'chapeu' }
): string[] {
  return Object.entries(distribution)
    .filter(([, slotType]) => slotType === 'chapeu')
    .map(([teamId]) => teamId);
}

/**
 * Get real opponent teams (those not in Chapéu slots)
 */
export function getRealTeams(
  distribution: { [teamId: string]: 'real' | 'chapeu' }
): string[] {
  return Object.entries(distribution)
    .filter(([, slotType]) => slotType === 'real')
    .map(([teamId]) => teamId);
}
