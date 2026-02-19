import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Trophy, Undo2, RotateCcw, Zap } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import {
  LiveScore,
  ScoringRules,
  createInitialLiveScore,
  applyPoint,
  undoLastPoint,
  formatPoints,
  formatSetScores,
  getSetsWon,
  getTotalGames,
} from "@/lib/scoringEngine";
import { organizerQuery, publicQuery } from "@/lib/organizerApi";
import { toast } from "sonner";

interface LiveScoreBoardProps {
  matchId: string;
  tournamentId: string;
  team1Name: string;
  team2Name: string;
  team1Id: string;
  team2Id: string;
  open: boolean;
  onClose: () => void;
  onMatchComplete: (matchId: string, score1: number, score2: number, winnerId: string) => void;
  initialLiveScore?: LiveScore | null;
  rules: ScoringRules;
}

const LiveScoreBoard = ({
  matchId,
  tournamentId,
  team1Name,
  team2Name,
  team1Id,
  team2Id,
  open,
  onClose,
  onMatchComplete,
  initialLiveScore,
  rules,
}: LiveScoreBoardProps) => {
  const [score, setScore] = useState<LiveScore>(() =>
    initialLiveScore || createInitialLiveScore(1)
  );
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open && initialLiveScore) {
      setScore(initialLiveScore);
    } else if (open && !initialLiveScore) {
      setScore(createInitialLiveScore(1));
    }
  }, [open, initialLiveScore]);

  const persistScore = useCallback(async (newScore: LiveScore) => {
    await organizerQuery({
      table: "matches",
      operation: "update",
      data: { live_score: newScore },
      filters: { id: matchId },
    });
  }, [matchId]);

  const handlePoint = useCallback(async (player: 1 | 2) => {
    const newScore = applyPoint(score, player, rules);
    setScore(newScore);

    // Persist every point
    await persistScore(newScore);

    // If match completed, auto-save final result
    if (newScore.completed && newScore.winner) {
      const winnerId = newScore.winner === 1 ? team1Id : team2Id;
      const [g1, g2] = getSetsWon(newScore);
      onMatchComplete(matchId, g1, g2, winnerId);
      toast.success("🏆 Partida finalizada!");
    }
  }, [score, rules, persistScore, matchId, team1Id, team2Id, onMatchComplete]);

  const handleUndo = useCallback(async () => {
    const newScore = undoLastPoint(score, rules);
    setScore(newScore);
    await persistScore(newScore);
  }, [score, rules, persistScore]);

  const handleReset = useCallback(async () => {
    const newScore = createInitialLiveScore(1);
    setScore(newScore);
    await persistScore(newScore);
    toast.info("Placar resetado");
  }, [persistScore]);

  const [pts1, pts2] = formatPoints(score, rules);
  const [setsWon1, setsWon2] = getSetsWon(score);
  const isDeuce = !score.isTiebreak && !score.isSuperTiebreak &&
    score.currentPoints[0] >= 3 && score.currentPoints[1] >= 3 &&
    score.currentPoints[0] === score.currentPoints[1];

  const currentMode = score.isSuperTiebreak
    ? "Super Tiebreak"
    : score.isTiebreak
    ? "Tiebreak"
    : isDeuce
    ? "Deuce"
    : "Game";

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg p-0 overflow-hidden bg-background border-border">
        <DialogHeader className="px-4 pt-4 pb-2">
          <DialogTitle className="text-center text-lg font-bold">
            🎾 Placar ao Vivo
          </DialogTitle>
        </DialogHeader>

        <div className="px-4 pb-4 space-y-3">
          {/* Mode badge */}
          <div className="flex justify-center">
            <Badge variant="outline" className={`text-xs font-bold ${
              score.isSuperTiebreak ? "border-destructive text-destructive" :
              score.isTiebreak ? "border-warning text-warning" :
              isDeuce ? "border-primary text-primary" :
              "border-muted-foreground text-muted-foreground"
            }`}>
              {currentMode}
              {score.isTiebreak && ` (${score.tiebreakPoints[0]}-${score.tiebreakPoints[1]})`}
              {score.isSuperTiebreak && ` (${score.superTiebreakPoints[0]}-${score.superTiebreakPoints[1]})`}
            </Badge>
          </div>

          {/* Scoreboard */}
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            {/* Header */}
            <div className="grid grid-cols-[1fr_repeat(var(--sets),48px)_56px] gap-0 text-[10px] font-bold text-muted-foreground uppercase tracking-wider px-3 py-1.5 bg-muted/50 border-b border-border/50"
              style={{ "--sets": Math.max(score.sets.length + 1, 3) } as any}
            >
              <span>Equipe</span>
              {score.sets.map((_, i) => (
                <span key={i} className="text-center">S{i + 1}</span>
              ))}
              {!score.completed && <span className="text-center">S{score.sets.length + 1}</span>}
              {/* Pad empty set columns if fewer than 3 */}
              {Array.from({ length: Math.max(0, 2 - score.sets.length) }).map((_, i) => (
                <span key={`pad-${i}`} className="text-center" />
              ))}
              <span className="text-center">Pts</span>
            </div>

            {/* Player 1 row */}
            <PlayerRow
              name={team1Name}
              sets={score.sets.map(s => s[0])}
              currentGames={score.currentGames[0]}
              points={pts1}
              setsWon={setsWon1}
              isServing={score.server === 1}
              isWinner={score.winner === 1}
              completed={score.completed}
              totalSetsPlayed={score.sets.length}
            />

            {/* Divider */}
            <div className="border-t border-border/30" />

            {/* Player 2 row */}
            <PlayerRow
              name={team2Name}
              sets={score.sets.map(s => s[1])}
              currentGames={score.currentGames[1]}
              points={pts2}
              setsWon={setsWon2}
              isServing={score.server === 2}
              isWinner={score.winner === 2}
              completed={score.completed}
              totalSetsPlayed={score.sets.length}
            />
          </div>

          {/* Set summary */}
          <div className="text-center">
            <span className="text-xs text-muted-foreground font-mono">
              {formatSetScores(score)}
            </span>
          </div>

          {/* Action buttons */}
          {!score.completed ? (
            <div className="space-y-2">
              {/* Point buttons */}
              <div className="grid grid-cols-2 gap-2">
                <Button
                  size="lg"
                  className="h-16 text-sm font-bold bg-primary/90 hover:bg-primary text-primary-foreground flex flex-col gap-0.5"
                  onClick={() => handlePoint(1)}
                >
                  <Zap className="h-4 w-4" />
                  <span className="truncate max-w-full">{team1Name.split(" / ")[0]}</span>
                  <span className="text-[10px] opacity-70">Ponto</span>
                </Button>
                <Button
                  size="lg"
                  className="h-16 text-sm font-bold bg-accent hover:bg-accent/90 text-accent-foreground flex flex-col gap-0.5"
                  onClick={() => handlePoint(2)}
                >
                  <Zap className="h-4 w-4" />
                  <span className="truncate max-w-full">{team2Name.split(" / ")[0]}</span>
                  <span className="text-[10px] opacity-70">Ponto</span>
                </Button>
              </div>

              {/* Control buttons */}
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 gap-1 text-xs"
                  onClick={handleUndo}
                  disabled={score.pointHistory.length === 0}
                >
                  <Undo2 className="h-3 w-3" /> Desfazer
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 gap-1 text-xs border-destructive/30 text-destructive hover:bg-destructive/10"
                  onClick={handleReset}
                >
                  <RotateCcw className="h-3 w-3" /> Resetar
                </Button>
              </div>
            </div>
          ) : (
            <div className="text-center space-y-2">
              <AnimatePresence>
                <motion.div
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className="flex items-center justify-center gap-2 text-success font-bold text-lg"
                >
                  <Trophy className="h-5 w-5" />
                  {score.winner === 1 ? team1Name : team2Name}
                </motion.div>
              </AnimatePresence>
              <Button variant="outline" size="sm" onClick={onClose}>
                Fechar
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

interface PlayerRowProps {
  name: string;
  sets: number[];
  currentGames: number;
  points: string;
  setsWon: number;
  isServing: boolean;
  isWinner: boolean;
  completed: boolean;
  totalSetsPlayed: number;
}

const PlayerRow = ({ name, sets, currentGames, points, setsWon, isServing, isWinner, completed, totalSetsPlayed }: PlayerRowProps) => (
  <div className={`grid gap-0 px-3 py-2 items-center ${isWinner ? "bg-success/10" : ""}`}
    style={{
      gridTemplateColumns: `1fr repeat(${Math.max(totalSetsPlayed + (completed ? 0 : 1), 3)}, 48px) 56px`
    }}
  >
    <div className="flex items-center gap-1.5 min-w-0">
      {isServing && !completed && (
        <span className="h-2 w-2 rounded-full bg-primary shrink-0 animate-pulse" />
      )}
      {isWinner && <Trophy className="h-3 w-3 text-success shrink-0" />}
      <span className={`text-sm font-bold truncate ${isWinner ? "text-success" : "text-foreground"}`}>
        {name.split(" / ")[0]}
      </span>
    </div>
    {sets.map((g, i) => (
      <span key={i} className="text-center text-sm font-mono font-bold text-foreground">
        {g}
      </span>
    ))}
    {!completed && (
      <span className="text-center text-sm font-mono font-bold text-primary">
        {currentGames}
      </span>
    )}
    {/* Pad */}
    {Array.from({ length: Math.max(0, 2 - totalSetsPlayed) }).map((_, i) => (
      <span key={`p-${i}`} />
    ))}
    <span className={`text-center text-lg font-black ${
      completed ? "text-muted-foreground" : "text-primary"
    }`}>
      {completed ? setsWon : points}
    </span>
  </div>
);

export default LiveScoreBoard;
