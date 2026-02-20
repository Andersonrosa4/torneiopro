import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Trophy, Check } from "lucide-react";
import { getEliminationRoundLabel } from "@/lib/roundLabels";

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
  court_number?: number | null;
}

interface BracketViewProps {
  matches: Match[];
  participants: Participant[];
  isOwner: boolean;
  onDeclareWinner: (matchId: string, winnerId: string) => void;
  onUpdateScore: (matchId: string, score1: number, score2: number) => void;
  tournamentFormat?: string; // 'single_elimination' | 'double_elimination' | 'group_stage'
}

const BracketView = ({ matches, participants, isOwner, onDeclareWinner, onUpdateScore, tournamentFormat = 'single_elimination' }: BracketViewProps) => {
  const rounds = matches.length > 0 ? Math.max(...matches.map((m) => m.round)) : 0;
  const minRound = matches.length > 0 ? Math.min(...matches.map((m) => m.round)) : 1;
  const roundNumbers = Array.from({ length: rounds - minRound + 1 }, (_, i) => i + minRound);

  const getName = (id: string | null) => {
    if (!id) return "A definir";
    return participants.find((p) => p.id === id)?.name || "A definir";
  };

  const matchCountByRound = useMemo(() => {
    const counts: Record<number, number> = {};
    matches.forEach(m => { counts[m.round] = (counts[m.round] || 0) + 1; });
    return counts;
  }, [matches]);

  const getRoundLabel = (round: number) => {
    return getEliminationRoundLabel(round, matchCountByRound[round] || 0);
  };

  return (
    <div className="overflow-x-auto pb-4">
      <div className="flex gap-8 min-w-max">
        {roundNumbers.map((round) => {
          const roundMatches = matches.filter((m) => m.round === round).sort((a, b) => a.position - b.position);
          // Rule 29: Bracket mostra todas as partidas futuras
          return (
            <div key={round} className="flex flex-col">
              <h3 className="mb-3 text-center text-sm font-semibold text-primary">
                {getRoundLabel(round)}
              </h3>
              <div className="flex flex-1 flex-col justify-around gap-4">
                {roundMatches.map((match) => (
                  <MatchCard
                    key={match.id}
                    match={match}
                    getName={getName}
                    isOwner={isOwner}
                    onDeclareWinner={onDeclareWinner}
                    onUpdateScore={onUpdateScore}
                    isFinal={round === rounds}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

const MatchCard = ({
  match, getName, isOwner, onDeclareWinner, onUpdateScore, isFinal,
}: {
  match: Match;
  getName: (id: string | null) => string;
  isOwner: boolean;
  onDeclareWinner: (matchId: string, winnerId: string) => void;
  onUpdateScore: (matchId: string, score1: number, score2: number) => void;
  isFinal: boolean;
}) => {
  const [s1, setS1] = useState(match.score1?.toString() || "0");
  const [s2, setS2] = useState(match.score2?.toString() || "0");

  const p1Name = getName(match.team1_id);
  const p2Name = getName(match.team2_id);
  const isCompleted = match.status === "completed";
  const canScore = isOwner && !isCompleted && match.team1_id && match.team2_id;

  const handleScoreBlur = () => {
    onUpdateScore(match.id, Number(s1) || 0, Number(s2) || 0);
  };

  return (
    <div className={`w-64 rounded-lg border bg-card shadow-card ${isFinal ? "border-primary/40 shadow-glow" : "border-border"} ${isCompleted ? "opacity-80" : ""}`}>
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-border/50">
        <span className="text-[10px] font-black text-primary uppercase tracking-wider">
          JOGO {match.position}
        </span>
        <div className="flex items-center gap-1.5">
          {match.court_number != null && (
          <span className="text-[9px] font-bold text-cyan-300 bg-cyan-500/20 border border-cyan-400/40 rounded px-1.5 py-0.5">
              Quadra {match.court_number}
            </span>
          )}
          {isFinal && (
            <div className="flex items-center gap-1 rounded-full bg-gradient-primary px-2 py-0.5 text-[10px] font-bold text-primary-foreground">
              <Trophy className="h-2.5 w-2.5" /> FINAL
            </div>
          )}
        </div>
      </div>
      <div className={`flex items-center gap-2 border-b border-border px-3 py-2 ${match.winner_team_id === match.team1_id && isCompleted ? "bg-success/10" : ""}`}>
        <span className={`flex-1 text-sm truncate ${match.winner_team_id === match.team1_id && isCompleted ? "text-success font-bold" : p1Name === "A definir" ? "text-muted-foreground" : "team-name"}`}>
          {p1Name}
        </span>
        {canScore ? (
          <Input value={s1} onChange={(e) => setS1(e.target.value)} onBlur={handleScoreBlur} className="h-7 w-12 text-center text-sm p-0" />
        ) : (
          <span className="text-sm font-bold tabular-nums">{match.score1 ?? "-"}</span>
        )}
        {canScore && match.team1_id && (
          <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => onDeclareWinner(match.id, match.team1_id!)}>
            <Check className="h-3.5 w-3.5 text-success" />
          </Button>
        )}
        {isCompleted && match.winner_team_id === match.team1_id && (
          <Trophy className="h-3.5 w-3.5 text-success shrink-0" />
        )}
      </div>
      <div className={`flex items-center gap-2 px-3 py-2 ${match.winner_team_id === match.team2_id && isCompleted ? "bg-success/10" : ""}`}>
        <span className={`flex-1 text-sm truncate ${match.winner_team_id === match.team2_id && isCompleted ? "text-success font-bold" : p2Name === "A definir" ? "text-muted-foreground" : "team-name"}`}>
          {p2Name}
        </span>
        {canScore ? (
          <Input value={s2} onChange={(e) => setS2(e.target.value)} onBlur={handleScoreBlur} className="h-7 w-12 text-center text-sm p-0" />
        ) : (
          <span className="text-sm font-bold tabular-nums">{match.score2 ?? "-"}</span>
        )}
        {canScore && match.team2_id && (
          <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => onDeclareWinner(match.id, match.team2_id!)}>
            <Check className="h-3.5 w-3.5 text-success" />
          </Button>
        )}
        {isCompleted && match.winner_team_id === match.team2_id && (
          <Trophy className="h-3.5 w-3.5 text-success shrink-0" />
        )}
      </div>
    </div>
  );
};

export default BracketView;
