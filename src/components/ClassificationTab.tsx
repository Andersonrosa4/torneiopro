import { useMemo } from "react";
import { Trophy, Medal, Award } from "lucide-react";
import { motion } from "framer-motion";

interface Match {
  id: string;
  round: number;
  position: number;
  team1_id: string | null;
  team2_id: string | null;
  winner_team_id: string | null;
  status: string;
  bracket_number?: number;
  score1?: number | null;
  score2?: number | null;
  bracket_type?: string | null;
}

interface Team {
  id: string;
  player1_name: string;
  player2_name: string;
}

interface ClassificationTabProps {
  matches: Match[];
  teams: Team[];
}

/**
 * CLASSIFICATION TAB - Rankings based on elimination round position
 * For single/double elimination: Champion > Runner-up > Semi losers > Quarter losers > etc.
 * For round-robin (round 0): uses wins + point differential as tiebreak
 */
const ClassificationTab = ({ matches, teams }: ClassificationTabProps) => {
  const getTeamName = (teamId: string | null) => {
    if (!teamId) return "A definir";
    const team = teams.find((t) => t.id === teamId);
    return team ? `${team.player1_name} / ${team.player2_name}` : "A definir";
  };

  const standings = useMemo(() => {
    if (matches.length === 0) return [];

    // Separate elimination matches (round >= 1) from group/round-robin (round 0)
    const eliminationMatches = matches.filter((m) => m.round >= 1 && m.bracket_type === "winners");
    const groupMatches = matches.filter((m) => m.round === 0);

    // If no elimination matches, fall back to group/round-robin ranking
    if (eliminationMatches.length === 0) {
      return buildGroupRanking(groupMatches);
    }

    return buildEliminationRanking(eliminationMatches, groupMatches);
  }, [matches, teams]);

  /** Build ranking from elimination bracket position */
  function buildEliminationRanking(
    elimMatches: Match[],
    groupMatches: Match[]
  ): { id: string; name: string; position: number; label: string }[] {
    const maxRound = Math.max(...elimMatches.map((m) => m.round));
    const ranked: { id: string; name: string; position: number; label: string }[] = [];
    const placedTeams = new Set<string>();

    // 1. Final match — Champion & Runner-up
    const finalMatches = elimMatches.filter((m) => m.round === maxRound && m.status === "completed");
    finalMatches.forEach((finalMatch) => {
      if (finalMatch.winner_team_id) {
        if (!placedTeams.has(finalMatch.winner_team_id)) {
          ranked.push({
            id: finalMatch.winner_team_id,
            name: getTeamName(finalMatch.winner_team_id),
            position: 1,
            label: "🏆 Campeão",
          });
          placedTeams.add(finalMatch.winner_team_id);
        }

        const loserId =
          finalMatch.team1_id === finalMatch.winner_team_id
            ? finalMatch.team2_id
            : finalMatch.team1_id;
        if (loserId && !placedTeams.has(loserId)) {
          ranked.push({
            id: loserId,
            name: getTeamName(loserId),
            position: 2,
            label: "🥈 Vice-Campeão",
          });
          placedTeams.add(loserId);
        }
      }
    });

    // 2. Walk backward through rounds: losers of each round get placed
    for (let round = maxRound - 1; round >= 1; round--) {
      const roundMatches = elimMatches.filter(
        (m) => m.round === round && m.status === "completed"
      );

      // Position label based on how many remain after this round
      const startPos = ranked.length + 1;
      const losersInRound: { id: string; name: string; pointDiff: number }[] = [];

      roundMatches.forEach((m) => {
        if (m.winner_team_id) {
          const loserId =
            m.team1_id === m.winner_team_id ? m.team2_id : m.team1_id;
          if (loserId && !placedTeams.has(loserId)) {
            const score1 = m.score1 ?? 0;
            const score2 = m.score2 ?? 0;
            const pointDiff =
              m.team1_id === loserId ? score1 - score2 : score2 - score1;
            losersInRound.push({
              id: loserId,
              name: getTeamName(loserId),
              pointDiff,
            });
          }
        }
      });

      // Sort losers within same round by point differential (descending)
      losersInRound.sort((a, b) => b.pointDiff - a.pointDiff);

      const endPos = startPos + losersInRound.length - 1;
      const label =
        losersInRound.length === 1
          ? `${startPos}º lugar`
          : `${startPos}º–${endPos}º lugar`;

      losersInRound.forEach((loser, idx) => {
        ranked.push({
          id: loser.id,
          name: loser.name,
          position: startPos + idx,
          label,
        });
        placedTeams.add(loser.id);
      });
    }

    // 3. Teams eliminated in round 0 (group stage) that never entered elimination
    const groupTeamIds = new Set<string>();
    groupMatches.forEach((m) => {
      if (m.team1_id) groupTeamIds.add(m.team1_id);
      if (m.team2_id) groupTeamIds.add(m.team2_id);
    });

    const unplacedFromGroups: { id: string; name: string; wins: number; pointDiff: number }[] = [];
    groupTeamIds.forEach((teamId) => {
      if (placedTeams.has(teamId)) return;
      let wins = 0;
      let pointsFor = 0;
      let pointsAgainst = 0;
      groupMatches
        .filter((m) => m.status === "completed" && (m.team1_id === teamId || m.team2_id === teamId))
        .forEach((m) => {
          if (m.winner_team_id === teamId) wins++;
          if (m.team1_id === teamId) {
            pointsFor += m.score1 ?? 0;
            pointsAgainst += m.score2 ?? 0;
          } else {
            pointsFor += m.score2 ?? 0;
            pointsAgainst += m.score1 ?? 0;
          }
        });
      unplacedFromGroups.push({
        id: teamId,
        name: getTeamName(teamId),
        wins,
        pointDiff: pointsFor - pointsAgainst,
      });
    });

    unplacedFromGroups.sort((a, b) => b.wins - a.wins || b.pointDiff - a.pointDiff);

    const groupStart = ranked.length + 1;
    unplacedFromGroups.forEach((t, idx) => {
      ranked.push({
        id: t.id,
        name: t.name,
        position: groupStart + idx,
        label: `${groupStart + idx}º lugar`,
      });
      placedTeams.add(t.id);
    });

    return ranked;
  }

  /** Fallback: pure round-robin ranking by wins + point differential */
  function buildGroupRanking(
    groupMatches: Match[]
  ): { id: string; name: string; position: number; label: string }[] {
    const stats: Record<string, { id: string; wins: number; played: number; pf: number; pa: number }> = {};

    groupMatches
      .filter((m) => m.status === "completed")
      .forEach((m) => {
        [m.team1_id, m.team2_id].forEach((tid, i) => {
          if (!tid) return;
          if (!stats[tid]) stats[tid] = { id: tid, wins: 0, played: 0, pf: 0, pa: 0 };
          stats[tid].played++;
          const myScore = i === 0 ? (m.score1 ?? 0) : (m.score2 ?? 0);
          const oppScore = i === 0 ? (m.score2 ?? 0) : (m.score1 ?? 0);
          stats[tid].pf += myScore;
          stats[tid].pa += oppScore;
          if (m.winner_team_id === tid) stats[tid].wins++;
        });
      });

    const sorted = Object.values(stats).sort(
      (a, b) => b.wins - a.wins || (b.pf - b.pa) - (a.pf - a.pa)
    );

    return sorted.map((t, idx) => ({
      id: t.id,
      name: getTeamName(t.id),
      position: idx + 1,
      label: `${idx + 1}º lugar`,
    }));
  }

  if (matches.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-card/50 p-12 text-center">
        <p className="text-muted-foreground">
          Gere o chaveamento primeiro para ver a classificação.
        </p>
      </div>
    );
  }

  if (standings.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-card/50 p-12 text-center">
        <p className="text-muted-foreground">
          Nenhuma dupla completou partidas ainda.
        </p>
      </div>
    );
  }

  const getIcon = (pos: number) => {
    if (pos === 1) return <Trophy className="h-4 w-4 text-yellow-500" />;
    if (pos === 2) return <Medal className="h-4 w-4 text-gray-400" />;
    if (pos === 3) return <Award className="h-4 w-4 text-amber-600" />;
    return null;
  };

  return (
    <section className="space-y-4">
      <div className="rounded-xl border border-border bg-card p-6 shadow-card">
        <h3 className="mb-4 text-lg font-semibold flex items-center gap-2">
          <Trophy className="h-5 w-5" /> Classificação Geral
        </h3>
        <div className="space-y-2">
          {standings.map((team, idx) => (
            <motion.div
              key={team.id}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: idx * 0.05 }}
              className={`flex items-center justify-between rounded-lg border px-4 py-3 ${
                team.position === 1
                  ? "border-yellow-500/50 bg-yellow-500/10"
                  : team.position === 2
                  ? "border-gray-400/50 bg-gray-400/10"
                  : team.position === 3
                  ? "border-amber-600/50 bg-amber-600/10"
                  : "border-border bg-secondary/50"
              }`}
            >
              <div className="flex items-center gap-3 flex-1">
                <span
                  className={`flex h-10 w-10 items-center justify-center rounded-full text-sm font-bold shrink-0 ${
                    team.position === 1
                      ? "bg-yellow-500 text-white"
                      : team.position === 2
                      ? "bg-gray-400 text-white"
                      : team.position === 3
                      ? "bg-amber-600 text-white"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  {team.position}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate team-name font-medium">{team.name}</p>
                  <p className="text-xs text-muted-foreground">{team.label}</p>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0 ml-2">
                {getIcon(team.position)}
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default ClassificationTab;
