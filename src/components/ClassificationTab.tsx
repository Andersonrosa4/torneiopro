import { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Trophy } from "lucide-react";
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
 * CLASSIFICATION TAB - READ-ONLY STANDINGS VIEW
 * Shows only rankings/standings of teams
 * No match sequence, no match tree, no editing
 */
const ClassificationTab = ({ matches, teams }: ClassificationTabProps) => {
  const getTeamName = (teamId: string | null) => {
    if (!teamId) return "A definir";
    const team = teams.find((t) => t.id === teamId);
    return team ? `${team.player1_name} / ${team.player2_name}` : "A definir";
  };

  // Calculate standings from all matches
  const standings = useMemo(() => {
    const teamStats: Record<
      string,
      { id: string; name: string; wins: number; played: number }
    > = {};

    matches.forEach((match) => {
      if (match.status === "completed") {
        if (match.team1_id) {
          if (!teamStats[match.team1_id]) {
            teamStats[match.team1_id] = {
              id: match.team1_id,
              name: getTeamName(match.team1_id),
              wins: 0,
              played: 0,
            };
          }
          teamStats[match.team1_id].played += 1;
          if (match.winner_team_id === match.team1_id) {
            teamStats[match.team1_id].wins += 1;
          }
        }

        if (match.team2_id) {
          if (!teamStats[match.team2_id]) {
            teamStats[match.team2_id] = {
              id: match.team2_id,
              name: getTeamName(match.team2_id),
              wins: 0,
              played: 0,
            };
          }
          teamStats[match.team2_id].played += 1;
          if (match.winner_team_id === match.team2_id) {
            teamStats[match.team2_id].wins += 1;
          }
        }
      }
    });

    return Object.values(teamStats).sort(
      (a, b) => b.wins - a.wins || b.played - a.played
    );
  }, [matches, teams]);

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
                idx === 0
                  ? "border-primary/50 bg-gradient-primary/10"
                  : "border-border bg-secondary/50"
              }`}
            >
              <div className="flex items-center gap-3 flex-1">
                <span
                  className={`flex h-10 w-10 items-center justify-center rounded-full text-sm font-bold shrink-0 ${
                    idx === 0
                      ? "bg-gradient-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  {idx + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate team-name">{team.name}</p>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0 ml-2">
                <Badge variant="outline" className="text-xs">
                  {team.wins}V / {team.played}J
                </Badge>
                {idx === 0 && <Trophy className="h-4 w-4 text-primary" />}
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default ClassificationTab;
