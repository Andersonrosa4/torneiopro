import { useState, useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Trophy, Check } from "lucide-react";
import { motion } from "framer-motion";

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

interface Team {
  id: string;
  player1_name: string;
  player2_name: string;
}

interface MatchSequenceViewerProps {
  matches: Match[];
  teams: Team[];
  isOwner: boolean;
  onDeclareWinner: (matchId: string, winnerId: string) => void;
  onUpdateScore: (matchId: string, score1: number, score2: number) => void;
}

const MatchSequenceViewer = ({
  matches,
  teams,
  isOwner,
  onDeclareWinner,
  onUpdateScore,
}: MatchSequenceViewerProps) => {
  const getTeamName = (teamId: string | null) => {
    if (!teamId) return "A definir";
    const team = teams.find((t) => t.id === teamId);
    return team ? `${team.player1_name} / ${team.player2_name}` : "A definir";
  };

  // Generate match sequence
  const sequence = useMemo(() => {
    if (matches.length === 0) return [];
    const rounds = [...new Set(matches.map((m) => m.round))].sort((a, b) => a - b);
    const brackets = [...new Set(matches.map((m) => m.bracket_number || 1))].sort(
      (a, b) => a - b
    );

    const ordered: Match[] = [];
    for (const round of rounds) {
      const roundMatches = matches.filter((m) => m.round === round);
      const byBracket: Record<number, Match[]> = {};
      for (const b of brackets) {
        byBracket[b] = roundMatches
          .filter((m) => (m.bracket_number || 1) === b)
          .sort((a, b2) => a.position - b2.position);
      }
      const maxLen = Math.max(...Object.values(byBracket).map((a) => a.length));
      for (let i = 0; i < maxLen; i++) {
        for (const b of brackets) {
          if (byBracket[b][i]) ordered.push(byBracket[b][i]);
        }
      }
    }
    return ordered;
  }, [matches]);

  const maxRound = matches.length > 0 ? Math.max(...matches.map((m) => m.round)) : 0;

  const getRoundLabel = (round: number) => {
    if (round === 0) return "Grupo";
    if (round === maxRound) return "Final";
    if (round === maxRound - 1) return "Semifinal";
    if (round === maxRound - 2) return "Quartas";
    return `Rodada ${round}`;
  };

  const getGroupId = (match: Match) => {
    if (match.round === 0) return `Grupo ${match.bracket_number || 1}`;
    return `Chave ${match.bracket_number || 1}`;
  };

  if (sequence.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-card/50 p-12 text-center">
        <p className="text-muted-foreground">
          Gere o chaveamento primeiro para ver a sequência de partidas.
        </p>
      </div>
    );
  }

  return (
    <section className="space-y-3">
      {sequence.map((match, idx) => (
        <MatchCard
          key={match.id}
          match={match}
          index={idx + 1}
          getTeamName={getTeamName}
          getGroupId={getGroupId}
          getRoundLabel={getRoundLabel}
          isOwner={isOwner}
          onDeclareWinner={onDeclareWinner}
          onUpdateScore={onUpdateScore}
        />
      ))}
    </section>
  );
};

interface MatchCardProps {
  match: Match;
  index: number;
  getTeamName: (id: string | null) => string;
  getGroupId: (match: Match) => string;
  getRoundLabel: (round: number) => string;
  isOwner: boolean;
  onDeclareWinner: (matchId: string, winnerId: string) => void;
  onUpdateScore: (matchId: string, score1: number, score2: number) => void;
}

const MatchCard = ({
  match,
  index,
  getTeamName,
  getGroupId,
  getRoundLabel,
  isOwner,
  onDeclareWinner,
  onUpdateScore,
}: MatchCardProps) => {
  const [s1, setS1] = useState(match.score1?.toString() || "0");
  const [s2, setS2] = useState(match.score2?.toString() || "0");

  const isCompleted = match.status === "completed";
  const team1Name = getTeamName(match.team1_id);
  const team2Name = getTeamName(match.team2_id);
  const hasTeams = match.team1_id && match.team2_id;
  const canScore = isOwner && !isCompleted && hasTeams;

  const handleScoreBlur = () => {
    onUpdateScore(match.id, Number(s1) || 0, Number(s2) || 0);
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.02 }}
      className={`flex flex-col gap-2 rounded-lg border bg-card px-4 py-3 shadow-card transition-all ${
        isCompleted ? "border-success/30 opacity-80" : hasTeams ? "border-primary/30" : "border-border"
      }`}
    >
      {/* Header: Number, Round, Group */}
      <div className="flex items-center gap-3">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-xs font-bold text-muted-foreground shrink-0">
          {index}
        </span>
        <Badge variant="outline" className="text-xs shrink-0">
          {getRoundLabel(match.round)}
        </Badge>
        <Badge className="bg-primary/20 text-primary border-0 text-xs shrink-0">
          {getGroupId(match)}
        </Badge>
        {isCompleted && <Trophy className="h-4 w-4 text-success ml-auto shrink-0" />}
      </div>

      {/* Teams and Scores */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm font-medium">{team1Name}</span>
        <span className="text-xs text-muted-foreground">vs</span>
        <span className="text-sm font-medium">{team2Name}</span>
      </div>

      {/* Scores and Winner Selection */}
      {hasTeams && (
        <div className="flex items-center gap-2 flex-wrap mt-2">
          {canScore ? (
            <>
              <Input
                value={s1}
                onChange={(e) => setS1(e.target.value)}
                onBlur={handleScoreBlur}
                className="h-7 w-12 text-center text-xs p-1"
                placeholder="0"
              />
              <span className="text-xs font-medium">-</span>
              <Input
                value={s2}
                onChange={(e) => setS2(e.target.value)}
                onBlur={handleScoreBlur}
                className="h-7 w-12 text-center text-xs p-1"
                placeholder="0"
              />
              {match.team1_id && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 px-2 text-xs"
                  onClick={() => onDeclareWinner(match.id, match.team1_id!)}
                >
                  <Check className="h-3 w-3 text-success mr-1" /> {getTeamName(match.team1_id).split(" / ")[0]}
                </Button>
              )}
              {match.team2_id && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 px-2 text-xs"
                  onClick={() => onDeclareWinner(match.id, match.team2_id!)}
                >
                  <Check className="h-3 w-3 text-success mr-1" /> {getTeamName(match.team2_id).split(" / ")[0]}
                </Button>
              )}
            </>
          ) : (
            <>
              <span className="text-sm font-mono font-bold">
                {match.score1 ?? "-"} - {match.score2 ?? "-"}
              </span>
              {isCompleted && match.winner_team_id && (
                <Badge className="bg-success/20 text-success border-0 text-xs">
                  Vencedor: {getTeamName(match.winner_team_id)}
                </Badge>
              )}
              {!isCompleted && (
                <Badge className="bg-warning/20 text-warning border-0 text-xs">Pendente</Badge>
              )}
            </>
          )}
        </div>
      )}
    </motion.div>
  );
};

export default MatchSequenceViewer;
