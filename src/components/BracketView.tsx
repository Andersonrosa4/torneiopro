import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Trophy, Check } from "lucide-react";

interface Participant {
  id: string;
  name: string;
  seed: number | null;
}

interface Match {
  id: string;
  round: number;
  position: number;
  participant1_id: string | null;
  participant2_id: string | null;
  score1: number | null;
  score2: number | null;
  winner_id: string | null;
  status: string;
}

interface BracketViewProps {
  matches: Match[];
  participants: Participant[];
  isOwner: boolean;
  onDeclareWinner: (matchId: string, winnerId: string) => void;
  onUpdateScore: (matchId: string, score1: number, score2: number) => void;
}

const BracketView = ({ matches, participants, isOwner, onDeclareWinner, onUpdateScore }: BracketViewProps) => {
  const rounds = Math.max(...matches.map((m) => m.round));
  const roundNumbers = Array.from({ length: rounds }, (_, i) => i + 1);

  const getName = (id: string | null) => {
    if (!id) return "TBD";
    return participants.find((p) => p.id === id)?.name || "TBD";
  };

  const getRoundLabel = (round: number) => {
    if (round === rounds) return "Final";
    if (round === rounds - 1) return "Semi-Final";
    if (round === rounds - 2) return "Quarter-Final";
    return `Round ${round}`;
  };

  return (
    <div className="overflow-x-auto pb-4">
      <div className="flex gap-8 min-w-max">
        {roundNumbers.map((round) => {
          const roundMatches = matches.filter((m) => m.round === round).sort((a, b) => a.position - b.position);
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
  match,
  getName,
  isOwner,
  onDeclareWinner,
  onUpdateScore,
  isFinal,
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

  const p1Name = getName(match.participant1_id);
  const p2Name = getName(match.participant2_id);
  const isCompleted = match.status === "completed";
  const canScore = isOwner && !isCompleted && match.participant1_id && match.participant2_id;

  const handleScoreBlur = () => {
    onUpdateScore(match.id, Number(s1) || 0, Number(s2) || 0);
  };

  return (
    <div className={`w-60 rounded-lg border bg-card shadow-card ${isFinal ? "border-primary/40 shadow-glow" : "border-border"} ${isCompleted ? "opacity-80" : ""}`}>
      {isFinal && (
        <div className="flex items-center justify-center gap-1 rounded-t-lg bg-gradient-primary px-2 py-1 text-xs font-bold text-primary-foreground">
          <Trophy className="h-3 w-3" /> FINAL
        </div>
      )}
      {/* Player 1 */}
      <div className={`flex items-center gap-2 border-b border-border px-3 py-2 ${match.winner_id === match.participant1_id ? "bg-success/10" : ""}`}>
        <span className={`flex-1 text-sm font-medium truncate ${match.winner_id === match.participant1_id ? "text-success" : p1Name === "TBD" ? "text-muted-foreground" : ""}`}>
          {p1Name}
        </span>
        {canScore ? (
          <Input
            value={s1}
            onChange={(e) => setS1(e.target.value)}
            onBlur={handleScoreBlur}
            className="h-7 w-12 text-center text-sm p-0"
          />
        ) : (
          <span className="text-sm font-bold tabular-nums">{match.score1 ?? "-"}</span>
        )}
        {canScore && match.participant1_id && (
          <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => onDeclareWinner(match.id, match.participant1_id!)}>
            <Check className="h-3.5 w-3.5 text-success" />
          </Button>
        )}
        {isCompleted && match.winner_id === match.participant1_id && (
          <Trophy className="h-3.5 w-3.5 text-success shrink-0" />
        )}
      </div>
      {/* Player 2 */}
      <div className={`flex items-center gap-2 px-3 py-2 ${match.winner_id === match.participant2_id ? "bg-success/10" : ""}`}>
        <span className={`flex-1 text-sm font-medium truncate ${match.winner_id === match.participant2_id ? "text-success" : p2Name === "TBD" ? "text-muted-foreground" : ""}`}>
          {p2Name}
        </span>
        {canScore ? (
          <Input
            value={s2}
            onChange={(e) => setS2(e.target.value)}
            onBlur={handleScoreBlur}
            className="h-7 w-12 text-center text-sm p-0"
          />
        ) : (
          <span className="text-sm font-bold tabular-nums">{match.score2 ?? "-"}</span>
        )}
        {canScore && match.participant2_id && (
          <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => onDeclareWinner(match.id, match.participant2_id!)}>
            <Check className="h-3.5 w-3.5 text-success" />
          </Button>
        )}
        {isCompleted && match.winner_id === match.participant2_id && (
          <Trophy className="h-3.5 w-3.5 text-success shrink-0" />
        )}
      </div>
    </div>
  );
};

export default BracketView;
