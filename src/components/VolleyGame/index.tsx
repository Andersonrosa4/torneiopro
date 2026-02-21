/**
 * Volleyball 2D Strategic Mini-Game
 * Decision-based volleyball with 6v6 teams, rally resolution, and progression.
 * Completely independent module — no impact on existing features.
 */

import { useState, useCallback, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { motion, AnimatePresence } from "framer-motion";
import { Medal, Zap, RotateCcw, ArrowLeft, Trophy, Swords, Target, Shield, Star } from "lucide-react";
import { publicQuery } from "@/lib/organizerApi";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

import type {
  GameScreen,
  MatchState,
  ActionCategory,
  ActionSubType,
  PlayerProgress,
} from "./types";
import { ACTION_LABELS, SET_TARGET, MIN_DIFF, SETS_TO_WIN, MAX_SETS } from "./types";
import {
  createMatch,
  resolveAction,
  resolveDefense,
  aiChooseAction,
  checkSetWin,
  checkMatchWin,
  addXP,
  createProgress,
  getDifficulty,
  getBestAttacker,
  getActionBallTarget,
} from "./engine";
import { playHit, playPoint, playWhistle } from "./sounds";
import CourtCanvas from "./CourtCanvas";

interface GameScore {
  id: string;
  player_name: string;
  score: number;
  created_at: string;
}

interface Props {
  tournamentId: string;
  sport: string;
  isAdmin?: boolean;
}

const VolleyGame = ({ tournamentId, sport, isAdmin = false }: Props) => {
  const [screen, setScreen] = useState<GameScreen>("menu");
  const [match, setMatch] = useState<MatchState>(createMatch());
  const [progress, setProgress] = useState<PlayerProgress>(() => {
    try {
      const saved = localStorage.getItem("volley2d_progress");
      return saved ? JSON.parse(saved) : createProgress();
    } catch { return createProgress(); }
  });
  const [ranking, setRanking] = useState<GameScore[]>([]);
  const [loadingRanking, setLoadingRanking] = useState(true);
  const [showActions, setShowActions] = useState<ActionCategory | null>(null);
  const [resolving, setResolving] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null);
  const [matchResult, setMatchResult] = useState<"win" | "loss" | null>(null);
  const [xpGained, setXpGained] = useState(0);

  const difficulty = getDifficulty(progress.level);
  const resolveTimeoutRef = useRef<number>(0);

  // Save progress
  useEffect(() => {
    localStorage.setItem("volley2d_progress", JSON.stringify(progress));
  }, [progress]);

  // Fetch ranking
  const fetchRanking = useCallback(async () => {
    setLoadingRanking(true);
    const { data } = await publicQuery<GameScore[]>({
      table: "game_scores",
      filters: { tournament_id: tournamentId, game_type: "volley_2d", sport },
      order: [
        { column: "score", ascending: false },
        { column: "created_at", ascending: true },
      ],
    });
    setRanking(data || []);
    setLoadingRanking(false);
  }, [tournamentId, sport]);

  useEffect(() => { fetchRanking(); }, [fetchRanking]);

  // ── Start Match ──
  const startMatch = () => {
    setMatch(createMatch());
    setMatchResult(null);
    setXpGained(0);
    setShowActions(null);
    setFeedbackMsg(null);
    setScreen("match");
  };

  // ── Handle player action ──
  const handleAction = useCallback((category: ActionCategory, sub: ActionSubType) => {
    if (resolving) return;
    setResolving(true);
    setShowActions(null);
    playHit();

    const isServing = match.serving === "home" && match.rallyPhase === "waiting";

    setMatch((prev) => {
      const m = { ...prev, rallyPhase: "resolved" as const };

      // Move ball to target
      const target = getActionBallTarget(sub, true);
      m.ballTargetX = target.x;
      m.ballTargetY = target.y;
      m.ballX = target.x;
      m.ballY = target.y;
      m.lastAction = ACTION_LABELS[sub];

      if (category === "serve") {
        const attacker = getBestAttacker(m.homeTeam);
        const success = resolveAction({
          action: sub,
          category,
          attackerSkill: attacker.skill + progress.level * 2,
          difficulty,
        });

        if (success) {
          // AI tries to defend
          const aiDef = aiChooseAction("defend", difficulty);
          const defended = resolveDefense(aiDef, sub, 70, difficulty);

          if (!defended) {
            m.pointWinner = "home";
            m.lastResult = "success";
          } else {
            // AI counter-attacks
            const aiAtk = aiChooseAction("attack", difficulty);
            const atkSuccess = resolveAction({
              action: aiAtk,
              category: "attack",
              attackerSkill: 65 + difficulty * 5,
              difficulty: 1,
            });
            m.pointWinner = atkSuccess ? "away" : "home";
            m.lastResult = atkSuccess ? "fail" : "success";
          }
        } else {
          m.pointWinner = "away";
          m.lastResult = "fail";
        }
      } else if (category === "attack") {
        const attacker = getBestAttacker(m.homeTeam);
        const success = resolveAction({
          action: sub,
          category,
          attackerSkill: attacker.skill + progress.level * 2,
          difficulty,
        });

        if (success) {
          const aiDef = aiChooseAction("defend", difficulty);
          const defended = resolveDefense(aiDef, sub, 70 + difficulty * 3, difficulty);
          m.pointWinner = defended ? "away" : "home";
          m.lastResult = defended ? "fail" : "success";
        } else {
          m.pointWinner = "away";
          m.lastResult = "fail";
        }
      } else {
        // Defend — AI was attacking
        const aiAtk = aiChooseAction("attack", difficulty);
        const success = resolveDefense(sub, aiAtk, 70 + progress.level * 2, difficulty);

        if (success) {
          // Counter attack
          const counterSuccess = resolveAction({
            action: "cross",
            category: "attack",
            attackerSkill: getBestAttacker(m.homeTeam).skill + progress.level,
            difficulty,
          });
          m.pointWinner = counterSuccess ? "home" : "away";
          m.lastResult = counterSuccess ? "success" : "fail";
        } else {
          m.pointWinner = "away";
          m.lastResult = "fail";
        }
      }

      return m;
    });

    // Resolve point after animation delay
    resolveTimeoutRef.current = window.setTimeout(() => {
      setMatch((prev) => {
        const m = { ...prev };
        const winner = m.pointWinner!;
        const feedback = winner === "home" ? "Ponto! 🏐" : "Ponto adversário 💥";
        setFeedbackMsg(feedback);

        if (winner === "home") {
          m.homeTeam = { ...m.homeTeam, score: m.homeTeam.score + 1 };
          playPoint(true);
        } else {
          m.awayTeam = { ...m.awayTeam, score: m.awayTeam.score + 1 };
          playPoint(false);
        }

        // Check set win
        const hScore = m.homeTeam.score;
        const aScore = m.awayTeam.score;

        if (checkSetWin(hScore, aScore) || checkSetWin(aScore, hScore)) {
          playWhistle();
          const setWinner = hScore > aScore ? "home" : "away";
          if (setWinner === "home") {
            m.homeTeam = { ...m.homeTeam, sets: m.homeTeam.sets + 1, score: 0 };
          } else {
            m.awayTeam = { ...m.awayTeam, sets: m.awayTeam.sets + 1, score: 0 };
          }
          m.awayTeam = { ...m.awayTeam, score: 0 };
          m.homeTeam = { ...m.homeTeam, score: setWinner === "home" ? 0 : m.homeTeam.score };
          if (setWinner === "away") m.homeTeam = { ...m.homeTeam, score: 0 };

          m.currentSet += 1;

          // Check match win
          if (checkMatchWin(m.homeTeam.sets)) {
            const xp = 50 + m.homeTeam.sets * 20;
            setXpGained(xp);
            setProgress((p) => addXP({ ...p, wins: p.wins + 1 }, xp));
            setMatchResult("win");
            submitScore(m.homeTeam.sets * 100 + 500);
            setScreen("result");
            return m;
          }
          if (checkMatchWin(m.awayTeam.sets)) {
            const xp = 10 + m.homeTeam.sets * 10;
            setXpGained(xp);
            setProgress((p) => addXP({ ...p, losses: p.losses + 1 }, xp));
            setMatchResult("loss");
            submitScore(m.homeTeam.sets * 100);
            setScreen("result");
            return m;
          }
        }

        // Next rally
        m.serving = winner === "home" ? "home" : "away";
        m.rallyPhase = "waiting";
        m.pointWinner = null;
        m.lastResult = null;
        m.ballX = m.serving === "home" ? 0.15 : 0.85;
        m.ballY = 0.35;

        return m;
      });

      setTimeout(() => {
        setFeedbackMsg(null);
        setResolving(false);

        // If AI is serving, auto-resolve
        setMatch((prev) => {
          if (prev.serving === "away" && prev.rallyPhase === "waiting") {
            // AI serves, player must defend
            return prev; // Player chooses defense
          }
          return prev;
        });
      }, 800);
    }, 600);
  }, [resolving, match, progress, difficulty]);

  // Submit score
  const submitScore = async (finalScore: number) => {
    const name = localStorage.getItem("volley2d_name") || `Jogador Nv${progress.level}`;
    await supabase.functions.invoke("organizer-api", {
      body: {
        table: "game_scores",
        operation: "insert",
        data: { tournament_id: tournamentId, game_type: "volley_2d", player_name: name, sport, score: finalScore },
      },
    });
    fetchRanking();
  };

  // Get current action prompt
  const getActionPrompt = (): ActionCategory | null => {
    if (resolving || screen !== "match") return null;
    if (match.rallyPhase !== "waiting") return null;
    if (match.serving === "home") return "serve";
    return "defend"; // When AI serves, player defends
  };

  const currentPrompt = getActionPrompt();

  const actionOptions: Record<ActionCategory, { sub: ActionSubType; icon: any; label: string }[]> = {
    serve: [
      { sub: "simple", icon: Target, label: "Saque Simples" },
      { sub: "jump", icon: Zap, label: "Saque Viagem" },
    ],
    attack: [
      { sub: "line", icon: Swords, label: "Paralela" },
      { sub: "cross", icon: Target, label: "Diagonal" },
      { sub: "tip", icon: Star, label: "Largada" },
    ],
    defend: [
      { sub: "dig_low", icon: Shield, label: "Defesa Baixa" },
      { sub: "dig_high", icon: Shield, label: "Defesa Alta" },
      { sub: "block", icon: Swords, label: "Bloqueio" },
    ],
  };

  // ── Cleanup ──
  useEffect(() => () => clearTimeout(resolveTimeoutRef.current), []);

  return (
    <div className="space-y-6">
      {/* RANKING */}
      <section className="rounded-xl border border-border bg-card p-4 sm:p-6 shadow-card">
        <h3 className="text-lg font-semibold flex items-center gap-2 mb-3">
          <Medal className="h-5 w-5 text-primary" /> Ranking Vôlei 2D
        </h3>
        {loadingRanking ? (
          <div className="flex justify-center py-4">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        ) : ranking.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum jogador ainda. Seja o primeiro!</p>
        ) : (
          <div className="space-y-1.5 max-h-[240px] overflow-y-auto">
            {ranking.map((r, i) => (
              <div
                key={r.id}
                className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm ${
                  i === 0 ? "bg-primary/15 border border-primary/30 font-bold"
                    : i < 3 ? "bg-primary/5 border border-primary/10"
                    : "bg-secondary/50 border border-border"
                }`}
              >
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-muted text-xs font-bold shrink-0">
                  {i < 3 ? ["🥇", "🥈", "🥉"][i] : i + 1}
                </span>
                <span className="flex-1 truncate">{r.player_name}</span>
                <span className="font-mono font-bold text-primary">{r.score}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* GAME */}
      <section className="relative rounded-xl border-2 border-primary/40 bg-gradient-to-br from-primary/5 via-card to-primary/5 p-4 sm:p-6 shadow-lg shadow-primary/10 overflow-hidden">
        <AnimatePresence mode="wait">
          {/* ── MENU ── */}
          {screen === "menu" && (
            <motion.div
              key="menu"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-4 text-center"
            >
              <div className="text-5xl">🏐</div>
              <h3 className="text-xl font-bold">Vôlei 2D Estratégico</h3>
              <p className="text-sm text-muted-foreground max-w-xs mx-auto">
                Escolha ações estratégicas e vença os rallies! 6v6 com sistema de decisão.
              </p>

              {/* Player info */}
              <div className="flex items-center justify-center gap-3 flex-wrap">
                <Badge variant="secondary" className="gap-1">
                  <Star className="h-3 w-3" /> Nível {progress.level}
                </Badge>
                <Badge variant="outline" className="gap-1 tabular-nums">
                  XP: {progress.xp}/{progress.xpToNext}
                </Badge>
                <Badge variant="outline" className="gap-1 tabular-nums">
                  {progress.wins}V / {progress.losses}D
                </Badge>
              </div>

              {/* Name input */}
              <input
                type="text"
                placeholder="Seu nome"
                defaultValue={localStorage.getItem("volley2d_name") || ""}
                onChange={(e) => localStorage.setItem("volley2d_name", e.target.value)}
                className="w-full max-w-xs mx-auto rounded-lg border border-border bg-background px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 block"
                maxLength={30}
              />

              <div className="flex gap-2 justify-center flex-wrap">
                <Button onClick={startMatch} className="gap-2">
                  <Zap className="h-4 w-4" /> Jogar
                </Button>
              </div>

              <p className="text-xs text-muted-foreground">
                Dificuldade: {difficulty === 1 ? "Fácil" : difficulty === 2 ? "Médio" : "Difícil"} (baseada no nível)
              </p>
            </motion.div>
          )}

          {/* ── MATCH ── */}
          {screen === "match" && (
            <motion.div
              key="match"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-3"
            >
              {/* Scoreboard */}
              <div className="flex items-center justify-between gap-2">
                <Button variant="ghost" size="sm" onClick={() => setScreen("menu")} className="h-7 px-2 text-xs">
                  <ArrowLeft className="h-3.5 w-3.5 mr-1" /> Sair
                </Button>
                <div className="flex items-center gap-3 text-sm font-bold">
                  <div className="flex items-center gap-1.5">
                    <span className="text-blue-500">Você</span>
                    <Badge variant="secondary" className="tabular-nums text-xs">
                      Sets: {match.homeTeam.sets}
                    </Badge>
                  </div>
                  <span className="text-2xl font-mono tabular-nums">
                    {match.homeTeam.score} — {match.awayTeam.score}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <Badge variant="secondary" className="tabular-nums text-xs">
                      Sets: {match.awayTeam.sets}
                    </Badge>
                    <span className="text-red-500">IA</span>
                  </div>
                </div>
                <Badge variant="outline" className="text-[10px]">Set {match.currentSet}</Badge>
              </div>

              {/* Serve indicator */}
              <div className="text-center">
                <Badge variant={match.serving === "home" ? "default" : "destructive"} className="text-[10px]">
                  {match.serving === "home" ? "📡 Seu saque" : "📡 Saque adversário"}
                </Badge>
              </div>

              {/* Court */}
              <CourtCanvas match={match} />

              {/* Feedback */}
              <AnimatePresence>
                {feedbackMsg && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0 }}
                    className="text-center"
                  >
                    <span className="inline-block rounded-full bg-primary/15 border border-primary/30 px-4 py-1.5 text-sm font-bold text-primary">
                      {feedbackMsg}
                    </span>
                  </motion.div>
                )}
                {match.lastAction && !feedbackMsg && (
                  <motion.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="text-center text-xs text-muted-foreground"
                  >
                    {match.lastAction} — {match.lastResult === "success" ? "✅ Sucesso!" : "❌ Erro!"}
                  </motion.p>
                )}
              </AnimatePresence>

              {/* Action buttons */}
              {currentPrompt && !resolving && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="space-y-2"
                >
                  {!showActions ? (
                    <div className="flex gap-2 justify-center">
                      {currentPrompt === "serve" ? (
                        <>
                          <Button size="sm" onClick={() => setShowActions("serve")} className="gap-1.5">
                            <Target className="h-4 w-4" /> Sacar
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => setShowActions("attack")} className="gap-1.5">
                            <Swords className="h-4 w-4" /> Atacar
                          </Button>
                        </>
                      ) : (
                        <>
                          <Button size="sm" onClick={() => setShowActions("defend")} className="gap-1.5">
                            <Shield className="h-4 w-4" /> Defender
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => setShowActions("attack")} className="gap-1.5">
                            <Swords className="h-4 w-4" /> Atacar
                          </Button>
                        </>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <p className="text-xs text-center text-muted-foreground font-medium">
                        Escolha a ação:
                      </p>
                      <div className="flex gap-2 justify-center flex-wrap">
                        {actionOptions[showActions].map(({ sub, icon: Icon, label }) => (
                          <Button
                            key={sub}
                            size="sm"
                            variant="outline"
                            onClick={() => handleAction(showActions, sub)}
                            className="gap-1.5 text-xs"
                          >
                            <Icon className="h-3.5 w-3.5" /> {label}
                          </Button>
                        ))}
                      </div>
                      <div className="text-center">
                        <Button variant="ghost" size="sm" onClick={() => setShowActions(null)} className="text-xs h-6">
                          ← Voltar
                        </Button>
                      </div>
                    </div>
                  )}
                </motion.div>
              )}

              {resolving && !feedbackMsg && (
                <div className="flex justify-center py-2">
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                </div>
              )}
            </motion.div>
          )}

          {/* ── RESULT ── */}
          {screen === "result" && (
            <motion.div
              key="result"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-4 text-center"
            >
              <div className="text-5xl">
                {matchResult === "win" ? "🏆" : "😤"}
              </div>
              <h3 className="text-2xl font-bold">
                {matchResult === "win" ? "Vitória!" : "Derrota!"}
              </h3>
              <p className="text-sm text-muted-foreground">
                Sets: {match.homeTeam.sets} x {match.awayTeam.sets}
              </p>

              <div className="flex items-center justify-center gap-3 flex-wrap">
                <Badge variant="secondary" className="gap-1">
                  +{xpGained} XP
                </Badge>
                <Badge variant="outline" className="gap-1">
                  <Star className="h-3 w-3" /> Nível {progress.level}
                </Badge>
              </div>

              {/* XP bar */}
              <div className="max-w-xs mx-auto">
                <div className="h-2 rounded-full bg-muted overflow-hidden">
                  <motion.div
                    className="h-full rounded-full bg-primary"
                    initial={{ width: 0 }}
                    animate={{ width: `${(progress.xp / progress.xpToNext) * 100}%` }}
                    transition={{ duration: 0.8, ease: "easeOut" }}
                  />
                </div>
                <p className="text-xs text-muted-foreground mt-1 tabular-nums">
                  {progress.xp} / {progress.xpToNext} XP
                </p>
              </div>

              <div className="flex gap-3 justify-center">
                <Button onClick={startMatch} className="gap-2">
                  <RotateCcw className="h-4 w-4" /> Jogar novamente
                </Button>
                <Button variant="ghost" onClick={() => setScreen("menu")}>
                  Menu
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </section>
    </div>
  );
};

export default VolleyGame;
