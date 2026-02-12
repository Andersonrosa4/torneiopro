import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Trophy, Check } from "lucide-react";
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
}

const BracketTreeView = ({ matches, participants, isOwner, onDeclareWinner, onUpdateScore }: BracketTreeViewProps) => {
  const [selectedBracket, setSelectedBracket] = useState<number>(1);
  
  const bracketMatches = matches.filter(m => (m.bracket_number || 1) === selectedBracket);
  const brackets = Array.from(new Set(matches.map(m => m.bracket_number || 1))).sort();

  const rounds = bracketMatches.length > 0 ? Math.max(...bracketMatches.map((m) => m.round)) : 0;
  const minRound = bracketMatches.length > 0 ? Math.min(...bracketMatches.map((m) => m.round)) : 1;

  const getName = (id: string | null) => {
    if (!id) return "A definir";
    return participants.find((p) => p.id === id)?.name || "A definir";
  };

  const getRoundLabel = (round: number) => {
    if (round === rounds) return "Final";
    if (round === rounds - 1) return "Semifinal";
    if (round === rounds - 2) return "Quartas";
    if (round === rounds - 3) return "Oitavas";
    return `Rodada ${round}`;
  };

  const getMatchesByRound = (round: number) => {
    return bracketMatches.filter(m => m.round === round).sort((a, b) => a.position - b.position);
  };

  return (
    <div className="w-full">
      {brackets.length > 1 && (
        <div className="mb-6 flex gap-2">
          {brackets.map(bracket => (
            <Button
              key={bracket}
              variant={selectedBracket === bracket ? "default" : "outline"}
              onClick={() => setSelectedBracket(bracket)}
              size="sm"
            >
              Chave {bracket}
            </Button>
          ))}
        </div>
      )}

      <div className="overflow-x-auto pb-4">
        <div className="flex gap-8 min-w-max">
          {Array.from({ length: rounds - minRound + 1 }, (_, i) => minRound + i).map((round) => {
            const roundMatches = getMatchesByRound(round);
            return (
              <motion.div
                key={round}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: round * 0.1 }}
                className="flex flex-col"
              >
                <h3 className="mb-6 text-center text-sm font-bold text-primary uppercase tracking-wider">
                  {getRoundLabel(round)}
                </h3>
                <div className="relative flex flex-1 flex-col justify-around gap-8">
                  {roundMatches.map((match) => (
                    <div key={match.id} className="relative">
                      <TreeMatchCard
                        match={match}
                        getName={getName}
                        isOwner={isOwner}
                        onDeclareWinner={onDeclareWinner}
                        onUpdateScore={onUpdateScore}
                        isFinal={round === rounds}
                      />
                    </div>
                  ))}
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

const TreeMatchCard = ({
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
    <motion.div
      initial={{ scale: 0.95, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      className={`relative w-72 rounded-lg border bg-card shadow-card transition-all ${
        isFinal ? "border-primary/60 shadow-lg" : "border-border"
      } ${isCompleted ? "opacity-80" : ""} hover:border-primary/40`}
    >
      {isFinal && (
        <div className="absolute -top-3 left-4 inline-block rounded-full bg-gradient-primary px-3 py-1 text-xs font-bold text-primary-foreground shadow-lg">
          <Trophy className="inline h-3 w-3 mr-1" /> FINAL
        </div>
      )}

      <div className={`flex items-center justify-between gap-3 border-b border-border px-4 py-3 transition-colors ${
        match.winner_team_id === match.team1_id && isCompleted ? "bg-success/15" : ""
      }`}>
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-medium truncate ${
            match.winner_team_id === match.team1_id && isCompleted ? "text-success font-bold" : p1Name === "A definir" ? "text-muted-foreground" : ""
          }`}>
            {p1Name}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {canScore ? (
            <Input value={s1} onChange={(e) => setS1(e.target.value)} onBlur={handleScoreBlur} className="h-8 w-14 text-center text-sm p-1" />
          ) : (
            <span className="text-sm font-bold tabular-nums w-8 text-right">{match.score1 ?? "-"}</span>
          )}
          {canScore && match.team1_id && (
            <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => onDeclareWinner(match.id, match.team1_id!)}>
              <Check className="h-4 w-4 text-success" />
            </Button>
          )}
          {isCompleted && match.winner_team_id === match.team1_id && (
            <Trophy className="h-4 w-4 text-success shrink-0" />
          )}
        </div>
      </div>

      <div className={`flex items-center justify-between gap-3 px-4 py-3 transition-colors ${
        match.winner_team_id === match.team2_id && isCompleted ? "bg-success/15" : ""
      }`}>
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-medium truncate ${
            match.winner_team_id === match.team2_id && isCompleted ? "text-success font-bold" : p2Name === "A definir" ? "text-muted-foreground" : ""
          }`}>
            {p2Name}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {canScore ? (
            <Input value={s2} onChange={(e) => setS2(e.target.value)} onBlur={handleScoreBlur} className="h-8 w-14 text-center text-sm p-1" />
          ) : (
            <span className="text-sm font-bold tabular-nums w-8 text-right">{match.score2 ?? "-"}</span>
          )}
          {canScore && match.team2_id && (
            <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => onDeclareWinner(match.id, match.team2_id!)}>
              <Check className="h-4 w-4 text-success" />
            </Button>
          )}
          {isCompleted && match.winner_team_id === match.team2_id && (
            <Trophy className="h-4 w-4 text-success shrink-0" />
          )}
        </div>
      </div>
    </motion.div>
  );
};

export default BracketTreeView;
