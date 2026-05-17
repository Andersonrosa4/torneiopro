import { useMemo } from "react";
import { Trophy, Medal, Award } from "lucide-react";
import { motion } from "framer-motion";
import { resolveTie, type TeamStats, type TiebreakCriteria } from "@/engine/tiebreakEngine";

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
  rankingCriteriaOrder?: string;
}

const DB_TO_ENGINE: Record<string, TiebreakCriteria> = {
  WINS: "wins",
  POINT_DIFF: "point_diff",
  POINTS_DIFF: "point_diff",
  SETS_DIFF: "point_diff",
  GAMES_DIFF: "point_diff",
  HEAD_TO_HEAD: "head_to_head",
};

const DEFAULT_CRITERIA: TiebreakCriteria[] = ["wins", "head_to_head", "point_diff"];

function parseCriteriaOrder(raw?: string): TiebreakCriteria[] {
  if (!raw) return DEFAULT_CRITERIA;
  const parsed = raw
    .split(",")
    .map((s) => DB_TO_ENGINE[s.trim().toUpperCase()])
    .filter((c): c is TiebreakCriteria => !!c);
  // Deduplicate preserving order
  return [...new Set(parsed)].length > 0 ? [...new Set(parsed)] : DEFAULT_CRITERIA;
}

const ClassificationTab = ({ matches, teams, rankingCriteriaOrder }: ClassificationTabProps) => {
  const criteriaOrder = useMemo(() => parseCriteriaOrder(rankingCriteriaOrder), [rankingCriteriaOrder]);
  const getTeamName = (teamId: string | null) => {
    if (!teamId) return "A definir";
    const team = teams.find((t) => t.id === teamId);
    return team ? `${team.player1_name} / ${team.player2_name}` : "A definir";
  };

  const standings = useMemo(() => {
    if (matches.length === 0) return [];

    const eliminationMatches = matches.filter((m) => m.round >= 1 && (m.bracket_type === "winners" || m.bracket_type === "third_place" || m.bracket_type === "semi_final" || m.bracket_type === "final"));
    const groupMatches = matches.filter((m) => m.round === 0);

    if (eliminationMatches.length === 0) {
      return buildGroupRanking(groupMatches);
    }

    return buildEliminationRanking(eliminationMatches, groupMatches);
  }, [matches, teams]);

  function buildEliminationRanking(
    elimMatches: Match[],
    groupMatches: Match[]
  ): { id: string; name: string; position: number; label: string }[] {
    const winnersMatches = elimMatches.filter((m) => m.bracket_type === "winners");
    const thirdPlaceMatches = elimMatches.filter((m) => m.bracket_type === "third_place");
    const actualFinalMatches = elimMatches.filter((m) => m.bracket_type === "final");
    const semiMatches = elimMatches.filter((m) => m.bracket_type === "semi_final");
    
    const ranked: { id: string; name: string; position: number; label: string }[] = [];
    const placedTeams = new Set<string>();

    // Helper to place winner + loser from a match
    const placeFromMatch = (m: Match, winPos: number, winLabel: string, losePos: number, loseLabel: string) => {
      if (m.winner_team_id && !placedTeams.has(m.winner_team_id)) {
        ranked.push({ id: m.winner_team_id, name: getTeamName(m.winner_team_id), position: winPos, label: winLabel });
        placedTeams.add(m.winner_team_id);
      }
      const loserId = m.team1_id === m.winner_team_id ? m.team2_id : m.team1_id;
      if (loserId && !placedTeams.has(loserId)) {
        ranked.push({ id: loserId, name: getTeamName(loserId), position: losePos, label: loseLabel });
        placedTeams.add(loserId);
      }
    };

    // 1st and 2nd: from bracket_type "final" (DE) or max round of winners (SE)
    const completedFinals = actualFinalMatches.filter((m) => m.status === "completed" && m.winner_team_id);
    if (completedFinals.length > 0) {
      placeFromMatch(completedFinals[0], 1, "🏆 Campeão", 2, "🥈 Vice-Campeão");
    } else {
      // Fallback for single elimination: use max round of winners
      if (winnersMatches.length > 0) {
        const maxRound = Math.max(...winnersMatches.map((m) => m.round));
        const fallbackFinals = winnersMatches.filter((m) => m.round === maxRound && m.status === "completed");
        if (fallbackFinals.length === 1) {
          placeFromMatch(fallbackFinals[0], 1, "🏆 Campeão", 2, "🥈 Vice-Campeão");
        }
      }
    }

    // 3rd and 4th from third_place match
    const completedTP = thirdPlaceMatches.filter((m) => m.status === "completed" && m.winner_team_id);
    if (completedTP.length > 0) {
      placeFromMatch(completedTP[0], 3, "🥉 3º lugar", 4, "4º lugar");
    }

    // Semi-final losers (if not already placed by third_place)
    semiMatches
      .filter((m) => m.status === "completed" && m.winner_team_id)
      .forEach((m) => {
        const loserId = m.team1_id === m.winner_team_id ? m.team2_id : m.team1_id;
        if (loserId && !placedTeams.has(loserId)) {
          const pos = ranked.length + 1;
          ranked.push({ id: loserId, name: getTeamName(loserId), position: pos, label: `${pos}º lugar` });
          placedTeams.add(loserId);
        }
      });

    // Walk backward through remaining rounds for unplaced losers
    const maxWinnersRound = winnersMatches.length > 0 ? Math.max(...winnersMatches.map((m) => m.round)) : 0;
    for (let round = maxWinnersRound; round >= 1; round--) {
      const roundMatches = winnersMatches.filter(
        (m) => m.round === round && m.status === "completed"
      );
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
            losersInRound.push({ id: loserId, name: getTeamName(loserId), pointDiff });
          }
        }
      });

      // Sort by point diff descending — best loser gets higher position
      losersInRound.sort((a, b) => b.pointDiff - a.pointDiff);

      losersInRound.forEach((loser, idx) => {
        const pos = startPos + idx;
        ranked.push({ id: loser.id, name: loser.name, position: pos, label: `${pos}º lugar` });
        placedTeams.add(loser.id);
      });
    }

    const groupTeamIds = new Set<string>();
    groupMatches.forEach((m) => {
      if (m.team1_id) groupTeamIds.add(m.team1_id);
      if (m.team2_id) groupTeamIds.add(m.team2_id);
    });

    const unplacedFromGroups: { id: string; name: string; wins: number; pointDiff: number }[] = [];
    groupTeamIds.forEach((teamId) => {
      if (placedTeams.has(teamId)) return;
      let wins = 0, pointsFor = 0, pointsAgainst = 0;
      groupMatches
        .filter((m) => m.status === "completed" && (m.team1_id === teamId || m.team2_id === teamId))
        .forEach((m) => {
          if (m.winner_team_id === teamId) wins++;
          if (m.team1_id === teamId) { pointsFor += m.score1 ?? 0; pointsAgainst += m.score2 ?? 0; }
          else { pointsFor += m.score2 ?? 0; pointsAgainst += m.score1 ?? 0; }
        });
      unplacedFromGroups.push({ id: teamId, name: getTeamName(teamId), wins, pointDiff: pointsFor - pointsAgainst });
    });

    unplacedFromGroups.sort((a, b) => b.wins - a.wins || b.pointDiff - a.pointDiff);
    const groupStart = ranked.length + 1;
    unplacedFromGroups.forEach((t, idx) => {
      ranked.push({ id: t.id, name: t.name, position: groupStart + idx, label: `${groupStart + idx}º lugar` });
      placedTeams.add(t.id);
    });

    return ranked;
  }

  function buildGroupRanking(
    groupMatches: Match[]
  ): { id: string; name: string; position: number; label: string }[] {
    const stats: Record<string, { id: string; wins: number; played: number; pf: number; pa: number }> = {};
    const headToHeadMap: Record<string, { winnerId: string; team1Id?: string; team2Id?: string; score1?: number; score2?: number }> = {};

    const completed = groupMatches.filter((m) => m.status === "completed");

    completed.forEach((m) => {
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

      // Montar mapa de confronto direto (com scores para mini-tabela em empates multi-way)
      if (m.team1_id && m.team2_id && m.winner_team_id) {
        const key = `${m.team1_id}_${m.team2_id}`;
        headToHeadMap[key] = {
          winnerId: m.winner_team_id,
          team1Id: m.team1_id,
          team2Id: m.team2_id,
          score1: m.score1 ?? 0,
          score2: m.score2 ?? 0,
        };
      }
    });

    const teamStats: TeamStats[] = Object.values(stats).map((t) => ({
      id: t.id,
      wins: t.wins,
      pointDiff: t.pf - t.pa,
    }));

    const sorted = resolveTie(
      teamStats,
      criteriaOrder,
      headToHeadMap
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
    if (pos === 1) return <Trophy className="h-5 w-5 text-yellow-500 drop-shadow-lg" />;
    if (pos === 2) return <Medal className="h-5 w-5 text-gray-300 drop-shadow-lg" />;
    if (pos === 3) return <Award className="h-5 w-5 text-amber-600 drop-shadow-lg" />;
    return null;
  };

  const getPositionStyle = (pos: number) => {
    if (pos === 1) return "border-yellow-500/60 bg-yellow-500/15";
    if (pos === 2) return "border-gray-400/50 bg-gray-400/10";
    if (pos === 3) return "border-amber-600/50 bg-amber-600/10";
    return "border-border bg-card/60";
  };

  const getBadgeStyle = (pos: number) => {
    if (pos === 1) return "bg-yellow-500 text-black font-black";
    if (pos === 2) return "bg-gray-400 text-black font-black";
    if (pos === 3) return "bg-amber-600 text-black font-black";
    return "bg-muted text-muted-foreground font-bold";
  };

  return (
    <section className="space-y-4">
      <div className="rounded-xl border border-border bg-card p-4 sm:p-6 shadow-card">
        <h3 className="mb-4 text-lg font-semibold flex items-center gap-2">
          <Trophy className="h-5 w-5" /> Classificação Geral
        </h3>
        <div className="space-y-2">
          {standings.map((team, idx) => (
            <motion.div
              key={team.id}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: idx * 0.03 }}
              className={`flex items-center gap-3 rounded-lg border px-3 py-3 sm:px-4 ${getPositionStyle(team.position)}`}
            >
              {/* Position badge */}
              <span
                className={`flex h-10 w-10 min-w-[2.5rem] items-center justify-center rounded-full text-sm shrink-0 ${getBadgeStyle(team.position)}`}
              >
                {team.position}
              </span>

              {/* Divider */}
              <div className="w-px h-10 bg-border/60 shrink-0" />

              {/* Team name — NO truncate, break-words, full visibility */}
              <div className="flex-1 min-w-0">
                <p
                  className="font-black leading-snug break-words"
                  style={{
                    color: "#F5F7FA",
                    textShadow: "0 1px 3px rgba(0,0,0,0.6)",
                  }}
                >
                  {team.name}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">{team.label}</p>
              </div>

              {/* Icon for top 3 */}
              <div className="shrink-0 ml-1">
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
