import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Trophy, Undo2, RotateCcw, Goal, AlertTriangle, ChevronRight, CircleDot, X as XIcon } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import {
  FutsalLiveScore,
  FutsalRules,
  createInitialFutsalScore,
  addGoal,
  addFoul,
  endPeriod,
  addPenaltyKick,
  undoLastEvent,
  getWinner,
  formatFutsalScore,
  getPeriodLabel,
} from "@/lib/futsalScoringEngine";
import { organizerQuery } from "@/lib/organizerApi";
import { toast } from "sonner";

interface FutsalLiveScoreBoardProps {
  matchId: string;
  tournamentId: string;
  team1Name: string;
  team2Name: string;
  team1Id: string;
  team2Id: string;
  open: boolean;
  onClose: () => void;
  onMatchComplete: (matchId: string, score1: number, score2: number, winnerId: string) => void;
  initialLiveScore?: FutsalLiveScore | null;
  rules: FutsalRules;
}

const FutsalLiveScoreBoard = ({
  matchId,
  team1Name,
  team2Name,
  team1Id,
  team2Id,
  open,
  onClose,
  onMatchComplete,
  initialLiveScore,
  rules,
}: FutsalLiveScoreBoardProps) => {
  const [score, setScore] = useState<FutsalLiveScore>(() =>
    initialLiveScore || createInitialFutsalScore(rules)
  );

  useEffect(() => {
    if (open) {
      setScore(initialLiveScore || createInitialFutsalScore(rules));
    }
  }, [open, initialLiveScore]);

  const persistScore = useCallback(async (newScore: FutsalLiveScore) => {
    await organizerQuery({
      table: "matches",
      operation: "update",
      data: { live_score: newScore },
      filters: { id: matchId },
    });
  }, [matchId]);

  const handleGoal = useCallback(async (team: "A" | "B") => {
    const newScore = addGoal(score, team, rules);
    setScore(newScore);
    await persistScore(newScore);

    if (newScore.period === "COMPLETED") {
      const winner = getWinner(newScore);
      if (winner) {
        const winnerId = winner === "A" ? team1Id : team2Id;
        onMatchComplete(matchId, newScore.teamA_goals, newScore.teamB_goals, winnerId);
        toast.success("⚽ Partida finalizada!");
      }
    }
  }, [score, rules, persistScore, matchId, team1Id, team2Id, onMatchComplete]);

  const handleFoul = useCallback(async (team: "A" | "B") => {
    const newScore = addFoul(score, team);
    setScore(newScore);
    await persistScore(newScore);
  }, [score, persistScore]);

  const handleEndPeriod = useCallback(async () => {
    const newScore = endPeriod(score, rules);
    setScore(newScore);
    await persistScore(newScore);

    if (newScore.period === "COMPLETED") {
      const winner = getWinner(newScore);
      if (winner) {
        const winnerId = winner === "A" ? team1Id : team2Id;
        onMatchComplete(matchId, newScore.teamA_goals, newScore.teamB_goals, winnerId);
        toast.success("⚽ Partida finalizada!");
      } else {
        toast.info("Partida encerrada em empate.");
      }
    }
  }, [score, rules, persistScore, matchId, team1Id, team2Id, onMatchComplete]);

  const handlePenaltyKick = useCallback(async (team: "A" | "B", scored: boolean) => {
    const newScore = addPenaltyKick(score, team, scored, rules);
    setScore(newScore);
    await persistScore(newScore);

    if (newScore.period === "COMPLETED") {
      const winner = getWinner(newScore);
      if (winner) {
        const winnerId = winner === "A" ? team1Id : team2Id;
        onMatchComplete(matchId, newScore.teamA_goals, newScore.teamB_goals, winnerId);
        toast.success("⚽ Partida finalizada nos pênaltis!");
      }
    }
  }, [score, rules, persistScore, matchId, team1Id, team2Id, onMatchComplete]);

  const handleUndo = useCallback(async () => {
    const newScore = undoLastEvent(score, rules);
    setScore(newScore);
    await persistScore(newScore);
  }, [score, rules, persistScore]);

  const handleReset = useCallback(async () => {
    const newScore = createInitialFutsalScore(rules);
    setScore(newScore);
    await persistScore(newScore);
    toast.info("Placar resetado");
  }, [persistScore]);

  const isCompleted = score.period === "COMPLETED";
  const isPenalties = score.period === "PENALTIES";
  const isExtraTime = score.period === "ET1" || score.period === "ET2";
  const winner = getWinner(score);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg p-0 overflow-hidden bg-background border-border">
        <DialogHeader className="px-4 pt-4 pb-2">
          <DialogTitle className="text-center text-lg font-bold">
            ⚽ Placar ao Vivo — Futsal
          </DialogTitle>
        </DialogHeader>

        <div className="px-4 pb-4 space-y-3">
          {/* Period badge */}
          <div className="flex justify-center gap-2">
            <Badge variant="outline" className={`text-xs font-bold ${
              isPenalties ? "border-destructive text-destructive" :
              isExtraTime ? "border-warning text-warning" :
              isCompleted ? "border-success text-success" :
              "border-primary text-primary"
            }`}>
              {getPeriodLabel(score.period)}
            </Badge>
          </div>

          {/* Scoreboard */}
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="grid grid-cols-3 gap-0 p-4 items-center">
              {/* Team A */}
              <div className="text-center space-y-1">
                <div className={`text-sm font-bold truncate ${winner === "A" ? "text-success" : "text-foreground"}`}>
                  {winner === "A" && <Trophy className="h-3 w-3 inline mr-1" />}
                  {team1Name.split(" / ")[0]}
                </div>
                <div className="text-xs text-muted-foreground">{team1Name.includes("/") ? team1Name.split(" / ")[1] : ""}</div>
              </div>

              {/* Score */}
              <div className="text-center">
                <div className="text-4xl font-black tabular-nums text-foreground">
                  {score.teamA_goals} <span className="text-muted-foreground">-</span> {score.teamB_goals}
                </div>
                {isPenalties && (
                  <div className="text-xs font-bold text-destructive mt-1">
                    Pen: {score.penalties.teamA_goals}-{score.penalties.teamB_goals}
                  </div>
                )}
              </div>

              {/* Team B */}
              <div className="text-center space-y-1">
                <div className={`text-sm font-bold truncate ${winner === "B" ? "text-success" : "text-foreground"}`}>
                  {winner === "B" && <Trophy className="h-3 w-3 inline mr-1" />}
                  {team2Name.split(" / ")[0]}
                </div>
                <div className="text-xs text-muted-foreground">{team2Name.includes("/") ? team2Name.split(" / ")[1] : ""}</div>
              </div>
            </div>

            {/* Fouls bar */}
            {!isCompleted && !isPenalties && (
              <div className="border-t border-border/30 px-4 py-1.5 flex justify-between text-[10px] text-muted-foreground">
                <span>Faltas: <span className="font-bold text-foreground">{score.fouls.teamA}</span></span>
                <span>Faltas: <span className="font-bold text-foreground">{score.fouls.teamB}</span></span>
              </div>
            )}
          </div>

          {/* Action buttons */}
          {!isCompleted && !isPenalties && (
            <div className="space-y-2">
              {/* Goal buttons */}
              <div className="grid grid-cols-2 gap-2">
                <Button
                  size="lg"
                  className="h-14 text-sm font-bold bg-success/90 hover:bg-success text-success-foreground flex flex-col gap-0.5"
                  onClick={() => handleGoal("A")}
                >
                  <Goal className="h-4 w-4" />
                  <span className="truncate max-w-full">Gol {team1Name.split(" / ")[0]}</span>
                </Button>
                <Button
                  size="lg"
                  className="h-14 text-sm font-bold bg-success/90 hover:bg-success text-success-foreground flex flex-col gap-0.5"
                  onClick={() => handleGoal("B")}
                >
                  <Goal className="h-4 w-4" />
                  <span className="truncate max-w-full">Gol {team2Name.split(" / ")[0]}</span>
                </Button>
              </div>

              {/* Foul buttons */}
              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1 text-xs border-warning/30 text-warning hover:bg-warning/10"
                  onClick={() => handleFoul("A")}
                >
                  <AlertTriangle className="h-3 w-3" /> Falta {team1Name.split(" / ")[0]}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1 text-xs border-warning/30 text-warning hover:bg-warning/10"
                  onClick={() => handleFoul("B")}
                >
                  <AlertTriangle className="h-3 w-3" /> Falta {team2Name.split(" / ")[0]}
                </Button>
              </div>

              {/* Period & control buttons */}
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 gap-1 text-xs"
                  onClick={handleUndo}
                  disabled={score.history.length === 0}
                >
                  <Undo2 className="h-3 w-3" /> Desfazer
                </Button>
                <Button
                  size="sm"
                  className="flex-1 gap-1 text-xs bg-primary/90 hover:bg-primary"
                  onClick={handleEndPeriod}
                >
                  <ChevronRight className="h-3 w-3" /> Encerrar {getPeriodLabel(score.period)}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1 text-xs border-destructive/30 text-destructive hover:bg-destructive/10"
                  onClick={handleReset}
                >
                  <RotateCcw className="h-3 w-3" />
                </Button>
              </div>
            </div>
          )}

          {/* Penalties UI */}
          {isPenalties && (
            <div className="space-y-2">
              <div className="text-center text-xs font-bold text-muted-foreground">
                Cobranças: {score.penalties.teamA_kicks + score.penalties.teamB_kicks} | Série de {rules.penalties_kicks}
              </div>
              <div className="grid grid-cols-2 gap-2">
                {/* Team A penalty */}
                <div className="space-y-1.5">
                  <div className="text-xs font-bold text-center truncate">{team1Name.split(" / ")[0]}</div>
                  <div className="flex gap-1">
                    <Button size="sm" className="flex-1 h-10 text-xs bg-success/80 hover:bg-success gap-1" onClick={() => handlePenaltyKick("A", true)}>
                      <CircleDot className="h-3 w-3" /> Gol
                    </Button>
                    <Button size="sm" variant="outline" className="flex-1 h-10 text-xs border-destructive/30 text-destructive gap-1" onClick={() => handlePenaltyKick("A", false)}>
                      <XIcon className="h-3 w-3" /> Errou
                    </Button>
                  </div>
                  <div className="text-center text-[10px] text-muted-foreground">
                    {score.penalties.teamA_goals}/{score.penalties.teamA_kicks}
                  </div>
                </div>
                {/* Team B penalty */}
                <div className="space-y-1.5">
                  <div className="text-xs font-bold text-center truncate">{team2Name.split(" / ")[0]}</div>
                  <div className="flex gap-1">
                    <Button size="sm" className="flex-1 h-10 text-xs bg-success/80 hover:bg-success gap-1" onClick={() => handlePenaltyKick("B", true)}>
                      <CircleDot className="h-3 w-3" /> Gol
                    </Button>
                    <Button size="sm" variant="outline" className="flex-1 h-10 text-xs border-destructive/30 text-destructive gap-1" onClick={() => handlePenaltyKick("B", false)}>
                      <XIcon className="h-3 w-3" /> Errou
                    </Button>
                  </div>
                  <div className="text-center text-[10px] text-muted-foreground">
                    {score.penalties.teamB_goals}/{score.penalties.teamB_kicks}
                  </div>
                </div>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="flex-1 gap-1 text-xs" onClick={handleUndo} disabled={score.history.length === 0}>
                  <Undo2 className="h-3 w-3" /> Desfazer
                </Button>
                <Button variant="outline" size="sm" className="gap-1 text-xs border-destructive/30 text-destructive hover:bg-destructive/10" onClick={handleReset}>
                  <RotateCcw className="h-3 w-3" />
                </Button>
              </div>
            </div>
          )}

          {/* Completed state */}
          {isCompleted && (
            <div className="text-center space-y-2">
              <AnimatePresence>
                <motion.div
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className="space-y-1"
                >
                  {winner ? (
                    <div className="flex items-center justify-center gap-2 text-success font-bold text-lg">
                      <Trophy className="h-5 w-5" />
                      {winner === "A" ? team1Name : team2Name}
                    </div>
                  ) : (
                    <div className="text-muted-foreground font-bold text-lg">Empate</div>
                  )}
                  <div className="text-xs text-muted-foreground font-mono">
                    {formatFutsalScore(score)}
                  </div>
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

export default FutsalLiveScoreBoard;
