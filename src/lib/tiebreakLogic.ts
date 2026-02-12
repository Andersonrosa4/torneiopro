/**
 * Tiebreak logic for determining index advancement
 * Used when multiple teams have the same performance in group stage
 */

interface TeamStats {
  teamId: string;
  teamName: string;
  wins: number;
  gamesPlayed: number;
  pointsFor: number;
  pointsAgainst: number;
  pointDifferential: number;
}

interface Match {
  team1_id: string | null;
  team2_id: string | null;
  score1: number | null;
  score2: number | null;
  status: string;
  winner_team_id: string | null;
}

/**
 * Calculate point differential for a team
 * (points scored - points conceded)
 */
export const calculatePointDifferential = (
  pointsFor: number,
  pointsAgainst: number
): number => {
  return pointsFor - pointsAgainst;
};

/**
 * Resolve tiebreak between two teams
 * 1. Head-to-head result
 * 2. Point differential
 * 3. Random draw
 */
export const resolveTwoTeamTie = (
  team1: TeamStats,
  team2: TeamStats,
  groupMatches: Match[]
): TeamStats => {
  // 1. Check head-to-head
  const h2hMatch = groupMatches.find(
    (m) =>
      ((m.team1_id === team1.teamId && m.team2_id === team2.teamId) ||
        (m.team1_id === team2.teamId && m.team2_id === team1.teamId)) &&
      m.status === "completed"
  );

  if (h2hMatch) {
    if (h2hMatch.team1_id === team1.teamId && h2hMatch.winner_team_id === team1.teamId) {
      return team1;
    }
    if (h2hMatch.team2_id === team1.teamId && h2hMatch.winner_team_id === team1.teamId) {
      return team1;
    }
    if (h2hMatch.winner_team_id === team2.teamId) {
      return team2;
    }
  }

  // 2. Point differential
  if (team1.pointDifferential !== team2.pointDifferential) {
    return team1.pointDifferential > team2.pointDifferential ? team1 : team2;
  }

  // 3. Random draw
  return Math.random() > 0.5 ? team1 : team2;
};

/**
 * Resolve tiebreak for 3+ teams
 * 1. Point differential
 * 2. If still tied, use head-to-head among tied teams
 * 3. If still tied, random draw
 */
export const resolveMultipleTeamsTie = (
  tiedTeams: TeamStats[],
  groupMatches: Match[]
): TeamStats[] => {
  // Sort by point differential (descending)
  const sorted = [...tiedTeams].sort(
    (a, b) => b.pointDifferential - a.pointDifferential
  );

  // If point differential resolved the tie, return
  if (sorted[0].pointDifferential !== sorted[sorted.length - 1].pointDifferential) {
    return sorted;
  }

  // Still tied on differential - check head-to-head among tied teams
  const tiedIds = sorted.map((t) => t.teamId);
  const h2hMatches = groupMatches.filter(
    (m) =>
      tiedIds.includes(m.team1_id || "") &&
      tiedIds.includes(m.team2_id || "") &&
      m.status === "completed"
  );

  // Calculate wins among tied teams only
  const h2hWins: Record<string, number> = {};
  tiedIds.forEach((id) => {
    h2hWins[id] = 0;
  });

  h2hMatches.forEach((match) => {
    if (match.winner_team_id && h2hWins.hasOwnProperty(match.winner_team_id)) {
      h2hWins[match.winner_team_id]++;
    }
  });

  // Sort by h2h wins
  const byH2H = sorted.sort(
    (a, b) => (h2hWins[b.teamId] || 0) - (h2hWins[a.teamId] || 0)
  );

  // If h2h resolved it, return
  if (byH2H[0].teamId && byH2H[0].teamId !== byH2H[byH2H.length - 1].teamId) {
    // Check if there's still a tie at the top
    const topTeamId = byH2H[0].teamId;
    const topWins = h2hWins[topTeamId] || 0;
    const stillTied = byH2H.filter((t) => (h2hWins[t.teamId] || 0) === topWins);

    if (stillTied.length === 1) {
      return byH2H;
    }
  }

  // Still tied - randomize remaining tied teams
  const random = byH2H.sort(() => Math.random() - 0.5);
  return random;
};

/**
 * Rank teams in a group and return ordered list
 * Handles tiebreaks automatically
 */
export const rankTeamsInGroup = (
  teamIds: string[],
  teamNames: Record<string, string>,
  groupMatches: Match[]
): { teamId: string; rank: number; pointDifferential: number }[] => {
  const stats: Record<string, TeamStats> = {};

  // Initialize stats
  teamIds.forEach((id) => {
    stats[id] = {
      teamId: id,
      teamName: teamNames[id] || id,
      wins: 0,
      gamesPlayed: 0,
      pointsFor: 0,
      pointsAgainst: 0,
      pointDifferential: 0,
    };
  });

  // Calculate stats from matches
  groupMatches
    .filter((m) => m.status === "completed")
    .forEach((match) => {
      const team1 = match.team1_id;
      const team2 = match.team2_id;

      if (team1 && stats[team1]) {
        stats[team1].gamesPlayed++;
        stats[team1].pointsFor += match.score1 || 0;
        stats[team1].pointsAgainst += match.score2 || 0;

        if (match.winner_team_id === team1) {
          stats[team1].wins++;
        }
      }

      if (team2 && stats[team2]) {
        stats[team2].gamesPlayed++;
        stats[team2].pointsFor += match.score2 || 0;
        stats[team2].pointsAgainst += match.score1 || 0;

        if (match.winner_team_id === team2) {
          stats[team2].wins++;
        }
      }
    });

  // Calculate point differentials
  Object.values(stats).forEach((stat) => {
    stat.pointDifferential = calculatePointDifferential(
      stat.pointsFor,
      stat.pointsAgainst
    );
  });

  // Sort by wins first
  const sorted = Object.values(stats).sort((a, b) => b.wins - a.wins);

  // Handle ties
  const ranked: TeamStats[] = [];
  let i = 0;
  while (i < sorted.length) {
    const currentWins = sorted[i].wins;
    const tiedTeams = sorted.filter((t) => t.wins === currentWins);

    if (tiedTeams.length === 1) {
      ranked.push(tiedTeams[0]);
      i++;
    } else if (tiedTeams.length === 2) {
      const resolved = resolveTwoTeamTie(tiedTeams[0], tiedTeams[1], groupMatches);
      const other = tiedTeams[0].teamId === resolved.teamId ? tiedTeams[1] : tiedTeams[0];
      ranked.push(resolved);
      ranked.push(other);
      i += 2;
    } else {
      const resolved = resolveMultipleTeamsTie(tiedTeams, groupMatches);
      ranked.push(...resolved);
      i += tiedTeams.length;
    }
  }

  // Return with rank and point differential
  return ranked.map((team, idx) => ({
    teamId: team.teamId,
    rank: idx + 1,
    pointDifferential: team.pointDifferential,
  }));
};

/**
 * Select best performing teams across all groups for index advancement
 */
export const selectIndexTeams = (
  groupRankings: Record<string, { teamId: string; rank: number; pointDifferential: number }[]>,
  numIndexTeams: number,
  teamsPerGroupAdvancing: number
): string[] => {
  // Collect all teams that finished 2nd (or lower if needed) in their groups
  const indexCandidates: {
    teamId: string;
    groupId: string;
    rank: number;
    pointDifferential: number;
  }[] = [];

  Object.entries(groupRankings).forEach(([groupId, ranking]) => {
    ranking.forEach((team) => {
      // Include teams that rank after the automatic advancers
      if (team.rank > teamsPerGroupAdvancing) {
        indexCandidates.push({
          teamId: team.teamId,
          groupId,
          rank: team.rank,
          pointDifferential: team.pointDifferential,
        });
      }
    });
  });

  // Sort by point differential (descending), then by rank
  indexCandidates.sort((a, b) => {
    if (b.pointDifferential !== a.pointDifferential) {
      return b.pointDifferential - a.pointDifferential;
    }
    return a.rank - b.rank;
  });

  // Return top numIndexTeams
  return indexCandidates.slice(0, numIndexTeams).map((t) => t.teamId);
};
