import { useState, useEffect, useCallback, useRef } from "react";
import { publicQuery } from "@/lib/organizerApi";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "framer-motion";
import { Medal, Zap, RotateCcw, Trash2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface GameScore {
  id: string;
  player_name: string;
  score: number;
  created_at: string;
}

const sportLabels: Record<string, string> = {
  beach_volleyball: "Vôlei de Praia",
  futevolei: "Futevôlei",
  beach_tennis: "Beach Tennis",
  tennis: "Tênis",
  padel: "Padel",
  futsal: "Futsal",
};

const sportEmoji: Record<string, string> = {
  beach_volleyball: "🏐",
  futevolei: "⚽",
  beach_tennis: "🎾",
  tennis: "🎾",
  padel: "🏓",
  futsal: "⚽",
};

// Game constants
const W = 320;
const H = 480;
const BALL_R = 11;
const PAD_W = 72;
const PAD_H = 14;
const PAD_Y = H - 36;
const INIT_SPEED = 3;
const SPEED_INC = 0.12;
const MAX_SPEED = 10;

// Block constants
const BLOCK_ROWS = 4;
const BLOCK_COLS = 6;
const BLOCK_W = (W - 20) / BLOCK_COLS; // with margin
const BLOCK_H = 16;
const BLOCK_PAD = 3;
const BLOCK_TOP = 40;
const BLOCK_LEFT = 10;
const BLOCK_POINTS = [4, 3, 2, 1]; // points per row (top=more)

const blockRowColors = [
  ["#ef4444", "#dc2626"], // red
  ["#f59e0b", "#d97706"], // amber
  ["#22c55e", "#16a34a"], // green
  ["#3b82f6", "#2563eb"], // blue
];

interface Block { row: number; col: number; alive: boolean; }

const createBlocks = (): Block[] => {
  const blocks: Block[] = [];
  for (let r = 0; r < BLOCK_ROWS; r++) {
    for (let c = 0; c < BLOCK_COLS; c++) {
      blocks.push({ row: r, col: c, alive: true });
    }
  }
  return blocks;
};

// Ball colors per sport
const ballColors: Record<string, [string, string, string]> = {
  beach_volleyball: ["#fff9c4", "#fdd835", "#f9a825"],
  futevolei: ["#ffffff", "#e0e0e0", "#9e9e9e"],
  beach_tennis: ["#c8e6c9", "#66bb6a", "#2e7d32"],
  tennis: ["#c8e6c9", "#66bb6a", "#2e7d32"],
  padel: ["#bbdefb", "#42a5f5", "#1565c0"],
  futsal: ["#ffffff", "#e0e0e0", "#9e9e9e"],
};

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

  // Game refs
  const ballRef = useRef({ x: W / 2, y: 60, dx: 1.5, dy: 1 });
  const padXRef = useRef(W / 2); // paddle center X
  const speedRef = useRef(INIT_SPEED);
  const scoreRef = useRef(0);
  const phaseRef = useRef<Phase>("start");
  const animRef = useRef(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const flashRef = useRef(0);
  const blocksRef = useRef<Block[]>(createBlocks());

  const emoji = sportEmoji[sport] || "🏐";

  // ─── Ranking ─────────────────────────────────
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

  useEffect(() => { fetchRanking(); }, [fetchRanking]);

  const deleteScore = async (scoreId: string, name: string) => {
    if (!confirm(`Excluir a pontuação de "${name}" do ranking?`)) return;
    setDeletingId(scoreId);
    const token = sessionStorage.getItem("organizer_token");
    const organizerId = sessionStorage.getItem("organizer_id");
    const { error } = await supabase.functions.invoke("organizer-api", {
      body: { token, organizerId, table: "game_scores", operation: "delete", filters: { id: scoreId } },
    });
    if (error) {
      toast({ title: "Erro ao excluir", variant: "destructive" });
    } else {
      toast({ title: "Excluído", description: `Pontuação de "${name}" removida.` });
      await fetchRanking();
    }
    setDeletingId(null);
  };

  const submitScore = async (finalScore: number) => {
    setSubmitting(true);
    await supabase.functions.invoke("organizer-api", {
      body: {
        table: "game_scores",
        operation: "insert",
        data: { tournament_id: tournamentId, game_type: "rally", player_name: playerName.trim(), sport, score: finalScore },
      },
    });
    await fetchRanking();
    setSubmitting(false);
  };

  // ─── Game Loop ─────────────────────────────────
  const drawGame = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const ball = ballRef.current;
    const speed = speedRef.current;
    const padX = padXRef.current;

    // Move ball
    ball.x += ball.dx * speed;
    ball.y += ball.dy * speed;

    // Bounce off left/right walls
    if (ball.x <= BALL_R) { ball.dx = Math.abs(ball.dx); ball.x = BALL_R; }
    if (ball.x >= W - BALL_R) { ball.dx = -Math.abs(ball.dx); ball.x = W - BALL_R; }
    // Bounce off top
    if (ball.y <= BALL_R) { ball.dy = Math.abs(ball.dy); ball.y = BALL_R; }

    // Block collision
    const blocks = blocksRef.current;
    for (const block of blocks) {
      if (!block.alive) continue;
      const bx = BLOCK_LEFT + block.col * (BLOCK_W + BLOCK_PAD);
      const by = BLOCK_TOP + block.row * (BLOCK_H + BLOCK_PAD);
      if (
        ball.x + BALL_R > bx &&
        ball.x - BALL_R < bx + BLOCK_W &&
        ball.y + BALL_R > by &&
        ball.y - BALL_R < by + BLOCK_H
      ) {
        block.alive = false;
        ball.dy = -ball.dy;
        const pts = BLOCK_POINTS[block.row] || 1;
        scoreRef.current += pts;
        setScore(scoreRef.current);
        flashRef.current = 1;
        // Respawn all blocks if all destroyed
        if (blocks.every(b => !b.alive)) {
          blocksRef.current = createBlocks();
          speedRef.current = Math.min(MAX_SPEED, speedRef.current + 0.5);
        }
        break;
      }
    }

    // Paddle collision
    const padLeft = padX - PAD_W / 2;
    const padRight = padX + PAD_W / 2;
    if (
      ball.dy > 0 &&
      ball.y + BALL_R >= PAD_Y &&
      ball.y + BALL_R <= PAD_Y + PAD_H + speed * 2 &&
      ball.x >= padLeft - BALL_R * 0.5 &&
      ball.x <= padRight + BALL_R * 0.5
    ) {
      // Hit!
      ball.dy = -Math.abs(ball.dy);
      ball.y = PAD_Y - BALL_R;
      // Angle based on where it hit the paddle
      const hitPos = (ball.x - padX) / (PAD_W / 2); // -1 to 1
      ball.dx = hitPos * 2.5;
      scoreRef.current += 1;
      setScore(scoreRef.current);
      speedRef.current = Math.min(MAX_SPEED, speedRef.current + SPEED_INC);
      flashRef.current = 1;
    }

    // Ball fell past paddle — game over
    if (ball.y > H + BALL_R) {
      phaseRef.current = "gameover";
      setPhase("gameover");
      setScore(scoreRef.current);
      submitScore(scoreRef.current);
      return;
    }

    // ── Draw ──
    ctx.clearRect(0, 0, W, H);

    // Court background
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, "rgba(20, 45, 35, 0.4)");
    grad.addColorStop(1, "rgba(15, 30, 25, 0.6)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    // Court lines
    ctx.strokeStyle = "rgba(255,255,255,0.06)";
    ctx.lineWidth = 1;
    ctx.setLineDash([6, 6]);
    ctx.beginPath();
    ctx.moveTo(W / 2, 0);
    ctx.lineTo(W / 2, H);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, H / 2);
    ctx.lineTo(W, H / 2);
    ctx.stroke();
    ctx.setLineDash([]);

    // Net line
    ctx.strokeStyle = "rgba(255,255,255,0.12)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, H / 2);
    ctx.lineTo(W, H / 2);
    ctx.stroke();

    // ── Blocks ──
    for (const block of blocksRef.current) {
      if (!block.alive) continue;
      const bx = BLOCK_LEFT + block.col * (BLOCK_W + BLOCK_PAD);
      const by = BLOCK_TOP + block.row * (BLOCK_H + BLOCK_PAD);
      const [bc1, bc2] = blockRowColors[block.row] || blockRowColors[0];
      const bg = ctx.createLinearGradient(bx, by, bx, by + BLOCK_H);
      bg.addColorStop(0, bc1);
      bg.addColorStop(1, bc2);
      ctx.fillStyle = bg;
      ctx.beginPath();
      ctx.roundRect(bx, by, BLOCK_W, BLOCK_H, 3);
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.15)";
      ctx.lineWidth = 0.5;
      ctx.stroke();
    }

    // ── Paddle ──
    const padGrad = ctx.createLinearGradient(padLeft, PAD_Y, padLeft, PAD_Y + PAD_H);
    if (flashRef.current > 0) {
      padGrad.addColorStop(0, `rgba(74, 222, 128, ${0.8 + flashRef.current * 0.2})`);
      padGrad.addColorStop(1, `rgba(34, 197, 94, ${0.6 + flashRef.current * 0.2})`);
      flashRef.current = Math.max(0, flashRef.current - 0.03);
    } else {
      padGrad.addColorStop(0, "rgba(255, 215, 0, 0.9)");
      padGrad.addColorStop(1, "rgba(245, 158, 11, 0.8)");
    }
    ctx.fillStyle = padGrad;
    ctx.beginPath();
    ctx.roundRect(padLeft, PAD_Y, PAD_W, PAD_H, 6);
    ctx.fill();
    // Paddle border
    ctx.strokeStyle = "rgba(255,255,255,0.3)";
    ctx.lineWidth = 1;
    ctx.stroke();
    // Paddle shine
    ctx.fillStyle = "rgba(255,255,255,0.2)";
    ctx.beginPath();
    ctx.roundRect(padLeft + 4, PAD_Y + 2, PAD_W - 8, 4, 2);
    ctx.fill();

    // ── Ball shadow ──
    ctx.fillStyle = "rgba(0,0,0,0.3)";
    ctx.beginPath();
    ctx.ellipse(ball.x + 2, ball.y + 3, BALL_R, BALL_R * 0.4, 0, 0, Math.PI * 2);
    ctx.fill();

    // ── Ball ──
    const [c1, c2, c3] = ballColors[sport] || ballColors.beach_volleyball;
    const ballGrad = ctx.createRadialGradient(
      ball.x - BALL_R * 0.3, ball.y - BALL_R * 0.3, BALL_R * 0.1,
      ball.x, ball.y, BALL_R
    );
    ballGrad.addColorStop(0, c1);
    ballGrad.addColorStop(0.6, c2);
    ballGrad.addColorStop(1, c3);
    ctx.fillStyle = ballGrad;
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, BALL_R, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,0.15)";
    ctx.lineWidth = 1;
    ctx.stroke();
    // Ball shine
    ctx.fillStyle = "rgba(255,255,255,0.45)";
    ctx.beginPath();
    ctx.arc(ball.x - BALL_R * 0.25, ball.y - BALL_R * 0.25, BALL_R * 0.3, 0, Math.PI * 2);
    ctx.fill();

    // ── HUD ──
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    ctx.font = "bold 16px system-ui, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(`Rally: ${scoreRef.current}`, 12, 28);

    ctx.fillStyle = "rgba(255,215,0,0.7)";
    ctx.font = "11px system-ui, sans-serif";
    ctx.textAlign = "right";
    ctx.fillText(`⚡ x${(speedRef.current / INIT_SPEED).toFixed(1)}`, W - 12, 28);

    animRef.current = requestAnimationFrame(drawGame);
  }, [sport]);

  // Start loop when phase is playing and canvas is ready
  useEffect(() => {
    if (phase !== "playing") return;
    const tryStart = () => {
      if (canvasRef.current) {
        animRef.current = requestAnimationFrame(drawGame);
      } else {
        animRef.current = requestAnimationFrame(tryStart);
      }
    };
    tryStart();
    return () => cancelAnimationFrame(animRef.current);
  }, [phase, drawGame]);

  // ─── Paddle control via touch/mouse ─────────
  const getCanvasX = (clientX: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return W / 2;
    const rect = canvas.getBoundingClientRect();
    const scaleX = W / rect.width;
    return Math.max(PAD_W / 2, Math.min(W - PAD_W / 2, (clientX - rect.left) * scaleX));
  };

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (phaseRef.current !== "playing") return;
    padXRef.current = getCanvasX(e.clientX);
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (phaseRef.current !== "playing") return;
    e.preventDefault();
    const touch = e.touches[0];
    if (touch) padXRef.current = getCanvasX(touch.clientX);
  }, []);

  const startGame = () => {
    if (!playerName.trim()) return;
    scoreRef.current = 0;
    speedRef.current = INIT_SPEED;
    padXRef.current = W / 2;
    ballRef.current = {
      x: W / 2,
      y: H / 2,
      dx: (Math.random() > 0.5 ? 1 : -1) * 1.2,
      dy: 1,
    };
    flashRef.current = 0;
    blocksRef.current = createBlocks();
    setScore(0);
    phaseRef.current = "playing";
    setPhase("playing");
  };

  const resetGame = () => {
    cancelAnimationFrame(animRef.current);
    phaseRef.current = "start";
    setPhase("start");
    setScore(0);
  };

  // Cleanup
  useEffect(() => () => cancelAnimationFrame(animRef.current), []);

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
                  i === 0 ? "bg-primary/15 border border-primary/30 font-bold"
                    : i === 1 ? "bg-primary/10 border border-primary/20"
                    : i === 2 ? "bg-primary/5 border border-primary/10"
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
                Arraste a raquete para rebater a bola e não deixe ela cair!
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
              className="flex flex-col items-center gap-2"
            >
              <canvas
                ref={canvasRef}
                width={W}
                height={H}
                onPointerMove={handlePointerMove}
                onTouchMove={handleTouchMove}
                onTouchStart={(e) => {
                  e.preventDefault();
                  const touch = e.touches[0];
                  if (touch) padXRef.current = getCanvasX(touch.clientX);
                }}
                className="rounded-xl border border-border/50 touch-none select-none"
                style={{
                  maxWidth: "100%",
                  cursor: "none",
                  background: "linear-gradient(180deg, hsl(var(--card)) 0%, hsl(var(--muted)) 100%)",
                }}
              />
              <p className="text-xs text-muted-foreground">Arraste o dedo / mouse para mover a raquete</p>
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
