import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Trophy } from "lucide-react";
import { motion } from "framer-motion";

interface Participant {
  id: string;
  name: string;
  seed: number | null;
}

interface Match {
  id: string;
  round: number;
  position: number;
  team1_id: string | null;
  team2_id: string | null;
  score1: number | null;
  score2: number | null;
  winner_team_id: string | null;
  status: string;
  bracket_number?: number;
}

interface BracketTreeViewProps {
  matches: Match[];
  participants: Participant[];
  isOwner: boolean;
  onDeclareWinner: (matchId: string, winnerId: string) => void;
  onUpdateScore: (matchId: string, score1: number, score2: number) => void;
  structuralOnly?: boolean;
}

/**
 * BRACKET TAB (CHAVEAMENTO) - STRUCTURAL VIEW ONLY
 * Shows ONLY groups/brackets and team names
 * No match sequence, no scores, no results
 */
const BracketTreeView = ({ matches, participants }: BracketTreeViewProps) => {
  const [selectedBracket, setSelectedBracket] = useState<number>(1);

  const groupMatches = matches.filter(m => m.round === 0);
  const hasGroupStage = groupMatches.length > 0;

  // Group standings
  const getGroupStandings = (groupNum: number) => {
    const gMatches = groupMatches.filter(m => (m.bracket_number || 1) === groupNum);
    const teamIds = new Set<string>();
    gMatches.forEach(m => {
      if (m.team1_id) teamIds.add(m.team1_id);
      if (m.team2_id) teamIds.add(m.team2_id);
    });

    const getName = (id: string | null) => {
      if (!id) return "A definir";
      return participants.find((p) => p.id === id)?.name || "A definir";
    };

    const standings = Array.from(teamIds).map(tid => {
      const wins = gMatches.filter(m => m.winner_team_id === tid).length;
      const played = gMatches.filter(m => (m.team1_id === tid || m.team2_id === tid) && m.status === "completed").length;
      return { id: tid, name: getName(tid), wins, played };
    });

    return standings.sort((a, b) => b.wins - a.wins);
  };

  const groupNumbers = Array.from(new Set(groupMatches.map(m => m.bracket_number || 1))).sort();

  if (!hasGroupStage) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-card/50 p-12 text-center">
        <p className="text-muted-foreground">Nenhuma estrutura de grupos gerada.</p>
      </div>
    );
  }

  return (
    <div className="w-full space-y-6">
      {/* Group Stage Structure */}
      {hasGroupStage && groupNumbers.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-lg font-bold text-primary flex items-center gap-2">
            <Trophy className="h-5 w-5" /> Fase de Grupos
          </h3>
          <div className="grid gap-4 sm:grid-cols-2">
            {groupNumbers.map(gNum => {
              const gMatches = groupMatches.filter(m => (m.bracket_number || 1) === gNum);
              const standings = getGroupStandings(gNum);
              return (
                <div key={gNum} className="rounded-xl border border-border bg-card p-4 shadow-card">
                  <h4 className="mb-3 text-sm font-bold text-primary uppercase tracking-wider">
                    Grupo {gNum}
                  </h4>
                  {/* Standings - Teams in group only */}
                  <div className="space-y-1">
                    {standings.map((s, i) => (
                      <div key={s.id} className="flex items-center justify-between rounded-md bg-secondary/50 px-3 py-1.5 text-xs">
                        <span className="flex items-center gap-2">
                          <span className="font-bold text-muted-foreground">{i + 1}.</span>
                          <span className="font-medium text-foreground">{s.name}</span>
                        </span>
                        <span className="font-bold text-primary">{s.wins}V / {s.played}J</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default BracketTreeView;
