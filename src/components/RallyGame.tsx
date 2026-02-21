import { useState, useEffect, useCallback, useRef } from "react";
import { publicQuery } from "@/lib/organizerApi";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "framer-motion";
import { Trophy, Medal, Zap, RotateCcw, Trash2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface GameScore {
  id: string;
  player_name: string;
  score: number;
  created_at: string;
}

const sportEmoji: Record<string, string> = {
  beach_volleyball: "🏐",
  futevolei: "⚽",
  beach_tennis: "🎾",
  tennis: "🎾",
  padel: "🏓",
  futsal: "⚽",
};

const sportLabels: Record<string, string> = {
  beach_volleyball: "Vôlei de Praia",
  futevolei: "Futevôlei",
  beach_tennis: "Beach Tennis",
  tennis: "Tênis",
  padel: "Padel",
  futsal: "Futsal",
};

// Game constants
const COURT_WIDTH = 320;
const COURT_HEIGHT = 420;
const BALL_SIZE = 36;
const SWEET_ZONE_HEIGHT = 60;
const SWEET_ZONE_Y = COURT_HEIGHT - 90;
const INITIAL_SPEED = 2.5;
const SPEED_INCREMENT = 0.15;
const MAX_SPEED = 12;

type Phase = "start" | "playing" | "gameover";

const RallyGame = ({
  tournamentId,
  sport,
  isAdmin = false,
}: {
  tournamentId: string;
  sport: string;
  isAdmin?: boolean;
}) => {
  const [phase, setPhase] = useState<Phase>("start");
  const [playerName, setPlayerName] = useState("");
  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState(0);
  const [ranking, setRanking] = useState<GameScore[]>([]);
  const [loadingRanking, setLoadingRanking] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Game state refs (for animation loop)
  const ballRef = useRef({ x: COURT_WIDTH / 2, y: 60, dx: 1.8, dy: 1 });
  const speedRef = useRef(INITIAL_SPEED);
  const scoreRef = useRef(0);
  const phaseRef = useRef<Phase>("start");
  const animFrameRef = useRef<number>(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const lastHitRef = useRef(false);
  const flashRef = useRef(0);
  const missFlashRef = useRef(0);

  const emoji = sportEmoji[sport] || "🏐";

  const fetchRanking = useCallback(async () => {
    setLoadingRanking(true);
    const { data } = await publicQuery<GameScore[]>({
      table: "game_scores",
      filters: { tournament_id: tournamentId, game_type: "rally", sport },
      order: [
        { column: "score", ascending: false },
        { column: "created_at", ascending: true },
      ],
    });
    setRanking(data || []);
    if (data && data.length > 0) setHighScore(data[0].score);
    setLoadingRanking(false);
  }, [tournamentId, sport]);

  useEffect(() => {
    fetchRanking();
  }, [fetchRanking]);

  const deleteScore = async (scoreId: string, name: string) => {
    if (!confirm(`Excluir a pontuação de "${name}" do ranking?`)) return;
    setDeletingId(scoreId);
    const token = sessionStorage.getItem("organizer_token");
    const organizerId = sessionStorage.getItem("organizer_id");
    const { error } = await supabase.functions.invoke("organizer-api", {
      body: {
        token,
        organizerId,
        table: "game_scores",
        operation: "delete",
        filters: { id: scoreId },
      },
    });
    if (error) {
      toast({ title: "Erro ao excluir", variant: "destructive" });
    } else {
      toast({ title: "Excluído", description: `Pontuação de "${name}" removida.` });
      await fetchRanking();
    }
    setDeletingId(null);
  };

  // ─── Game Loop ─────────────────────────────────
  const drawGame = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const ball = ballRef.current;
    const speed = speedRef.current;

    // Move ball
    ball.x += ball.dx * speed;
    ball.y += ball.dy * speed;

    // Bounce off walls
    if (ball.x <= BALL_SIZE / 2 || ball.x >= COURT_WIDTH - BALL_SIZE / 2) {
      ball.dx *= -1;
      ball.x = Math.max(BALL_SIZE / 2, Math.min(COURT_WIDTH - BALL_SIZE / 2, ball.x));
    }
    // Bounce off top
    if (ball.y <= BALL_SIZE / 2) {
      ball.dy = Math.abs(ball.dy);
      ball.y = BALL_SIZE / 2;
    }

    // Ball passed the sweet zone — game over
    if (ball.y >= COURT_HEIGHT - 10) {
      phaseRef.current = "gameover";
      setPhase("gameover");
      setScore(scoreRef.current);
      submitScore(scoreRef.current);
      return;
    }

    // Clear
    ctx.clearRect(0, 0, COURT_WIDTH, COURT_HEIGHT);

    // Draw court background
    const grad = ctx.createLinearGradient(0, 0, 0, COURT_HEIGHT);
    grad.addColorStop(0, "rgba(30, 60, 40, 0.3)");
    grad.addColorStop(1, "rgba(20, 40, 30, 0.5)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, COURT_WIDTH, COURT_HEIGHT);

    // Court lines
    ctx.strokeStyle = "rgba(255,255,255,0.08)";
    ctx.lineWidth = 1;
    ctx.setLineDash([8, 8]);
    // Center line
    ctx.beginPath();
    ctx.moveTo(0, COURT_HEIGHT / 2);
    ctx.lineTo(COURT_WIDTH, COURT_HEIGHT / 2);
    ctx.stroke();
    // Net
    ctx.strokeStyle = "rgba(255,255,255,0.15)";
    ctx.lineWidth = 2;
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(0, COURT_HEIGHT / 2 - 2);
    ctx.lineTo(COURT_WIDTH, COURT_HEIGHT / 2 - 2);
    ctx.stroke();

    // Sweet zone (hit area)
    if (flashRef.current > 0) {
      ctx.fillStyle = `rgba(74, 222, 128, ${0.15 + flashRef.current * 0.1})`;
      flashRef.current -= 0.02;
    } else if (missFlashRef.current > 0) {
      ctx.fillStyle = `rgba(248, 113, 113, ${0.15 + missFlashRef.current * 0.1})`;
      missFlashRef.current -= 0.03;
    } else {
      ctx.fillStyle = "rgba(255, 215, 0, 0.08)";
    }
    ctx.fillRect(0, SWEET_ZONE_Y, COURT_WIDTH, SWEET_ZONE_HEIGHT);
    
    // Sweet zone borders
    ctx.strokeStyle = "rgba(255, 215, 0, 0.25)";
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(0, SWEET_ZONE_Y);
    ctx.lineTo(COURT_WIDTH, SWEET_ZONE_Y);
    ctx.moveTo(0, SWEET_ZONE_Y + SWEET_ZONE_HEIGHT);
    ctx.lineTo(COURT_WIDTH, SWEET_ZONE_Y + SWEET_ZONE_HEIGHT);
    ctx.stroke();
    ctx.setLineDash([]);

    // Draw ball shadow
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.beginPath();
    ctx.ellipse(ball.x + 3, ball.y + 4, BALL_SIZE / 2.2, BALL_SIZE / 4, 0, 0, Math.PI * 2);
    ctx.fill();

    // Draw ball (gradient sphere)
    const ballRadius = BALL_SIZE / 2;
    const ballGrad = ctx.createRadialGradient(
      ball.x - ballRadius * 0.3, ball.y - ballRadius * 0.3, ballRadius * 0.1,
      ball.x, ball.y, ballRadius
    );
    // Sport-specific ball colors
    const ballColors: Record<string, [string, string, string]> = {
      beach_volleyball: ["#fff9c4", "#fdd835", "#f9a825"],
      futevolei: ["#ffffff", "#e0e0e0", "#9e9e9e"],
      beach_tennis: ["#c8e6c9", "#66bb6a", "#2e7d32"],
      tennis: ["#c8e6c9", "#66bb6a", "#2e7d32"],
      padel: ["#bbdefb", "#42a5f5", "#1565c0"],
      futsal: ["#ffffff", "#e0e0e0", "#9e9e9e"],
    };
    const [c1, c2, c3] = ballColors[sport] || ballColors.beach_volleyball;
    ballGrad.addColorStop(0, c1);
    ballGrad.addColorStop(0.6, c2);
    ballGrad.addColorStop(1, c3);
    ctx.fillStyle = ballGrad;
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, ballRadius, 0, Math.PI * 2);
    ctx.fill();

    // Ball outline
    ctx.strokeStyle = "rgba(0,0,0,0.2)";
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Ball highlight (shine)
    ctx.fillStyle = "rgba(255,255,255,0.5)";
    ctx.beginPath();
    ctx.arc(ball.x - ballRadius * 0.25, ball.y - ballRadius * 0.25, ballRadius * 0.25, 0, Math.PI * 2);
    ctx.fill();

    // Score display on canvas
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    ctx.font = "bold 16px system-ui, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(`Rally: ${scoreRef.current}`, 12, 28);

    // Speed indicator
    const speedLevel = Math.floor((speedRef.current - INITIAL_SPEED) / SPEED_INCREMENT);
    ctx.fillStyle = "rgba(255,215,0,0.7)";
    ctx.font = "11px system-ui, sans-serif";
    ctx.textAlign = "right";
    ctx.fillText(`⚡ x${(speedRef.current / INITIAL_SPEED).toFixed(1)}`, COURT_WIDTH - 12, 28);

    // "TOQUE!" hint text
    ctx.fillStyle = "rgba(255,215,0,0.3)";
    ctx.font = "bold 11px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("TOQUE AQUI ↓", COURT_WIDTH / 2, SWEET_ZONE_Y - 8);

    animFrameRef.current = requestAnimationFrame(drawGame);
  }, [emoji]);

  const startGame = () => {
    if (!playerName.trim()) return;
    scoreRef.current = 0;
    speedRef.current = INITIAL_SPEED;
    ballRef.current = {
      x: COURT_WIDTH / 2,
      y: 60,
      dx: (Math.random() > 0.5 ? 1 : -1) * 1.5,
      dy: 1,
    };
    lastHitRef.current = false;
    flashRef.current = 0;
    missFlashRef.current = 0;
    setScore(0);
    phaseRef.current = "playing";
    setPhase("playing");
    animFrameRef.current = requestAnimationFrame(drawGame);
  };

  const handleTap = () => {
    if (phaseRef.current !== "playing") return;
    const ball = ballRef.current;

    // Check if ball is in the sweet zone
    if (
      ball.y >= SWEET_ZONE_Y - BALL_SIZE / 2 &&
      ball.y <= SWEET_ZONE_Y + SWEET_ZONE_HEIGHT + BALL_SIZE / 2
    ) {
      // Successful hit!
      scoreRef.current += 1;
      setScore(scoreRef.current);
      ball.dy = -Math.abs(ball.dy); // Send ball back up
      // Randomize horizontal direction slightly
      ball.dx = (Math.random() - 0.5) * 3;
      // Increase speed
      speedRef.current = Math.min(MAX_SPEED, speedRef.current + SPEED_INCREMENT);
      flashRef.current = 1;
      lastHitRef.current = true;
    } else {
      // Missed — visual feedback but no penalty (ball just keeps going)
      missFlashRef.current = 1;
    }
  };

  const submitScore = async (finalScore: number) => {
    setSubmitting(true);
    await supabase.functions.invoke("organizer-api", {
      body: {
        table: "game_scores",
        operation: "insert",
        data: {
          tournament_id: tournamentId,
          game_type: "rally",
          player_name: playerName.trim(),
          sport,
          score: finalScore,
        },
      },
    });
    await fetchRanking();
    setSubmitting(false);
  };

  const resetGame = () => {
    cancelAnimationFrame(animFrameRef.current);
    phaseRef.current = "start";
    setPhase("start");
    setScore(0);
  };

  // Cleanup
  useEffect(() => {
    return () => cancelAnimationFrame(animFrameRef.current);
  }, []);

  return (
    <div className="space-y-6">
      {/* RANKING */}
      <section className="rounded-xl border border-border bg-card p-4 sm:p-6 shadow-card">
        <h3 className="text-lg font-semibold flex items-center gap-2 mb-3">
          <Medal className="h-5 w-5 text-primary" /> Ranking Rally Infinito — {sportLabels[sport] || sport}
        </h3>
        {loadingRanking ? (
          <div className="flex justify-center py-4">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        ) : ranking.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum jogador ainda. Seja o primeiro!</p>
        ) : (
          <div className="space-y-1.5 max-h-[300px] overflow-y-auto">
            {ranking.map((r, i) => (
              <div
                key={r.id}
                className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm ${
                  i === 0
                    ? "bg-primary/15 border border-primary/30 font-bold"
                    : i === 1
                    ? "bg-primary/10 border border-primary/20"
                    : i === 2
                    ? "bg-primary/5 border border-primary/10"
                    : "bg-secondary/50 border border-border"
                }`}
              >
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-muted text-xs font-bold text-muted-foreground shrink-0">
                  {i < 3 ? ["🥇", "🥈", "🥉"][i] : i + 1}
                </span>
                <span className="flex-1 truncate">{r.player_name}</span>
                <span className="font-mono font-bold text-primary">{r.score} rallies</span>
                {isAdmin && (
                  <button
                    onClick={() => deleteScore(r.id, r.player_name)}
                    disabled={deletingId === r.id}
                    className="ml-1 p-1 rounded hover:bg-destructive/15 text-muted-foreground hover:text-destructive transition-colors shrink-0 disabled:opacity-50"
                    title={`Excluir ${r.player_name}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* GAME AREA */}
      <section className="relative rounded-xl border-2 border-primary/40 bg-gradient-to-br from-primary/5 via-card to-primary/5 p-4 sm:p-6 shadow-lg shadow-primary/10 overflow-hidden">
        <motion.div
          className="absolute inset-0 rounded-xl border-2 border-primary/20 pointer-events-none"
          animate={{ opacity: [0.3, 0.7, 0.3] }}
          transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
        />
        <div className="flex justify-center mb-4">
          <motion.div
            className="inline-flex items-center gap-2 rounded-full bg-primary/15 border border-primary/30 px-4 py-1.5"
            animate={{ scale: [1, 1.03, 1] }}
            transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
          >
            <Zap className="h-4 w-4 text-primary" />
            <span className="text-xs font-bold text-primary uppercase tracking-wider">Rally Infinito</span>
          </motion.div>
        </div>

        <AnimatePresence mode="wait">
          {phase === "start" && (
            <motion.div
              key="start"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-4 text-center"
            >
              <div className="text-5xl">{emoji}</div>
              <h3 className="text-xl font-bold">Rally Infinito</h3>
              <p className="text-sm text-muted-foreground max-w-xs mx-auto">
                A bola vem na sua direção! Toque na zona dourada no momento certo para rebater.
                <br />
                <span className="text-xs">⚡ A cada rally a velocidade aumenta!</span>
              </p>
              <input
                type="text"
                placeholder="Digite seu nome"
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && startGame()}
                className="w-full max-w-xs mx-auto rounded-lg border border-border bg-background px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 block"
                maxLength={30}
              />
              <div>
                <Button onClick={startGame} disabled={!playerName.trim()} className="gap-2">
                  <Zap className="h-4 w-4" /> Jogar!
                </Button>
              </div>
            </motion.div>
          )}

          {phase === "playing" && (
            <motion.div
              key="playing"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-center gap-3"
            >
              <canvas
                ref={canvasRef}
                width={COURT_WIDTH}
                height={COURT_HEIGHT}
                onClick={handleTap}
                onTouchStart={(e) => {
                  e.preventDefault();
                  handleTap();
                }}
                className="rounded-xl border border-border/50 cursor-pointer touch-none select-none"
                style={{
                  maxWidth: "100%",
                  background: "linear-gradient(180deg, hsl(var(--card)) 0%, hsl(var(--muted)) 100%)",
                }}
              />
              <p className="text-xs text-muted-foreground">Toque/clique na zona dourada quando a bola chegar!</p>
            </motion.div>
          )}

          {phase === "gameover" && (
            <motion.div
              key="gameover"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-4 text-center"
            >
              <div className="text-4xl">
                {score >= 30 ? "🏆" : score >= 15 ? "🔥" : score >= 5 ? "👏" : "😅"}
              </div>
              <h3 className="text-2xl font-bold">
                {score >= 30 ? "Lendário!" : score >= 15 ? "Incrível!" : score >= 5 ? "Bom jogo!" : "Tente de novo!"}
              </h3>
              <div className="flex items-center justify-center gap-6">
                <div className="text-center">
                  <p className="text-3xl font-mono font-bold text-primary">{score}</p>
                  <p className="text-xs text-muted-foreground">Rallies</p>
                </div>
                <div className="text-center">
                  <p className="text-3xl font-mono font-bold text-muted-foreground">{highScore}</p>
                  <p className="text-xs text-muted-foreground">Recorde</p>
                </div>
              </div>
              {score > 0 && score >= highScore && (
                <motion.p
                  className="text-sm font-bold text-primary"
                  animate={{ scale: [1, 1.1, 1] }}
                  transition={{ duration: 1, repeat: Infinity }}
                >
                  🎉 Novo recorde!
                </motion.p>
              )}
              {submitting && (
                <p className="text-xs text-muted-foreground">Salvando pontuação...</p>
              )}
              <div className="flex gap-3 justify-center">
                <Button onClick={startGame} className="gap-2">
                  <RotateCcw className="h-4 w-4" /> Jogar de novo
                </Button>
                <Button variant="ghost" onClick={resetGame}>
                  Voltar
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </section>
    </div>
  );
};

export default RallyGame;
