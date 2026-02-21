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

// Canvas
const W = 320;
const H = 480;
const BALL_R = 10;
const PAD_W = 60;
const PAD_H = 12;
const NET_Y = H / 2;
const PLAYER_Y = H - 32;
const AI_Y = 24;
const SERVE_SPEED = 3.5;
const AI_SPEED_BASE = 2.2;
const MAX_SCORE = 25;
const MIN_DIFF = 2;

type Phase = "start" | "playing" | "gameover";

const VolleyPongGame = ({
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
  const [playerScore, setPlayerScore] = useState(0);
  const [aiScore, setAiScore] = useState(0);
  const [setsWon, setSetsWon] = useState([0, 0]); // [player, ai]
  const [currentSet, setCurrentSet] = useState(1);
  const [ranking, setRanking] = useState<GameScore[]>([]);
  const [loadingRanking, setLoadingRanking] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [lastPoint, setLastPoint] = useState<string | null>(null);

  // Refs
  const ballRef = useRef({ x: W / 2, y: NET_Y + 40, dx: 1.2, dy: 2 });
  const padXRef = useRef(W / 2);
  const aiXRef = useRef(W / 2);
  const pScoreRef = useRef(0);
  const aScoreRef = useRef(0);
  const setsRef = useRef([0, 0]);
  const setNumRef = useRef(1);
  const phaseRef = useRef<Phase>("start");
  const animRef = useRef(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const servingRef = useRef<"player" | "ai">("player");
  const rallyCountRef = useRef(0);
  const flashRef = useRef(0);

  // ─── Ranking ─────────────────────────────────
  const fetchRanking = useCallback(async () => {
    setLoadingRanking(true);
    const { data } = await publicQuery<GameScore[]>({
      table: "game_scores",
      filters: { tournament_id: tournamentId, game_type: "volley_pong", sport },
      order: [
        { column: "score", ascending: false },
        { column: "created_at", ascending: true },
      ],
    });
    setRanking(data || []);
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
        data: { tournament_id: tournamentId, game_type: "volley_pong", player_name: playerName.trim(), sport, score: finalScore },
      },
    });
    await fetchRanking();
    setSubmitting(false);
  };

  // ─── Serve ─────────────────────────────────
  const serveBall = useCallback((who: "player" | "ai") => {
    servingRef.current = who;
    rallyCountRef.current = 0;
    const dx = (Math.random() - 0.5) * 2;
    if (who === "player") {
      ballRef.current = { x: padXRef.current, y: PLAYER_Y - BALL_R - 4, dx, dy: -SERVE_SPEED };
    } else {
      ballRef.current = { x: aiXRef.current, y: AI_Y + PAD_H + BALL_R + 4, dx, dy: SERVE_SPEED };
    }
  }, []);

  // ─── Point scored ─────────────────────────────
  const scorePoint = useCallback((scorer: "player" | "ai") => {
    if (scorer === "player") {
      pScoreRef.current += 1;
      setPlayerScore(pScoreRef.current);
      setLastPoint("Ponto seu! 🏐");
    } else {
      aScoreRef.current += 1;
      setAiScore(aScoreRef.current);
      setLastPoint("Ponto da IA 🤖");
    }
    flashRef.current = 1;

    // Check set win
    const p = pScoreRef.current;
    const a = aScoreRef.current;
    if ((p >= MAX_SCORE || a >= MAX_SCORE) && Math.abs(p - a) >= MIN_DIFF) {
      const winner = p > a ? 0 : 1;
      setsRef.current[winner] += 1;
      setSetsWon([...setsRef.current]);

      // Check match win (best of 3)
      if (setsRef.current[winner] >= 2) {
        // Game over — score = sets won * 100 + total points difference
        const finalScore = setsRef.current[0] * 100 + Math.max(0, pScoreRef.current - aScoreRef.current) + (setsRef.current[0] >= 2 ? 500 : 0);
        phaseRef.current = "gameover";
        setPhase("gameover");
        submitScore(finalScore);
        return;
      }

      // Next set
      setNumRef.current += 1;
      setCurrentSet(setNumRef.current);
      pScoreRef.current = 0;
      aScoreRef.current = 0;
      setPlayerScore(0);
      setAiScore(0);
    }

    // Serve goes to point winner
    setTimeout(() => {
      if (phaseRef.current === "playing") {
        serveBall(scorer);
      }
    }, 600);
  }, [serveBall]);

  // ─── Game Loop ─────────────────────────────────
  const drawGame = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const ball = ballRef.current;
    const padX = padXRef.current;

    // AI movement
    const aiTarget = ball.x;
    const aiSpeed = AI_SPEED_BASE + rallyCountRef.current * 0.05;
    const diff = aiTarget - aiXRef.current;
    if (Math.abs(diff) > 2) {
      aiXRef.current += Math.sign(diff) * Math.min(aiSpeed, Math.abs(diff));
    }
    aiXRef.current = Math.max(PAD_W / 2, Math.min(W - PAD_W / 2, aiXRef.current));

    // Move ball
    ball.x += ball.dx;
    ball.y += ball.dy;

    // Wall bounce
    if (ball.x <= BALL_R) { ball.dx = Math.abs(ball.dx); ball.x = BALL_R; }
    if (ball.x >= W - BALL_R) { ball.dx = -Math.abs(ball.dx); ball.x = W - BALL_R; }

    // Player paddle collision (bottom)
    const pLeft = padX - PAD_W / 2;
    const pRight = padX + PAD_W / 2;
    if (
      ball.dy > 0 &&
      ball.y + BALL_R >= PLAYER_Y &&
      ball.y + BALL_R <= PLAYER_Y + PAD_H + Math.abs(ball.dy) * 2 &&
      ball.x >= pLeft - BALL_R * 0.5 &&
      ball.x <= pRight + BALL_R * 0.5
    ) {
      ball.dy = -Math.abs(ball.dy) * 1.02;
      ball.y = PLAYER_Y - BALL_R;
      const hitPos = (ball.x - padX) / (PAD_W / 2);
      ball.dx = hitPos * 3;
      rallyCountRef.current += 1;
      flashRef.current = 0.6;
    }

    // AI paddle collision (top)
    const aLeft = aiXRef.current - PAD_W / 2;
    const aRight = aiXRef.current + PAD_W / 2;
    if (
      ball.dy < 0 &&
      ball.y - BALL_R <= AI_Y + PAD_H &&
      ball.y - BALL_R >= AI_Y - Math.abs(ball.dy) * 2 &&
      ball.x >= aLeft - BALL_R * 0.5 &&
      ball.x <= aRight + BALL_R * 0.5
    ) {
      ball.dy = Math.abs(ball.dy) * 1.02;
      ball.y = AI_Y + PAD_H + BALL_R;
      const hitPos = (ball.x - aiXRef.current) / (PAD_W / 2);
      ball.dx = hitPos * 3;
      rallyCountRef.current += 1;
    }

    // Ball out top → player scores
    if (ball.y < -BALL_R * 2) {
      scorePoint("player");
      animRef.current = requestAnimationFrame(drawGame);
      return;
    }
    // Ball out bottom → AI scores
    if (ball.y > H + BALL_R * 2) {
      scorePoint("ai");
      animRef.current = requestAnimationFrame(drawGame);
      return;
    }

    // ── Draw ──
    ctx.clearRect(0, 0, W, H);

    // Court
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, "rgba(30, 60, 120, 0.5)");
    grad.addColorStop(0.5, "rgba(20, 45, 90, 0.6)");
    grad.addColorStop(1, "rgba(30, 60, 120, 0.5)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    // Court lines
    ctx.strokeStyle = "rgba(255,255,255,0.08)";
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(20, 0); ctx.lineTo(20, H);
    ctx.moveTo(W - 20, 0); ctx.lineTo(W - 20, H);
    ctx.stroke();
    ctx.setLineDash([]);

    // Net
    ctx.fillStyle = "rgba(255,255,255,0.15)";
    ctx.fillRect(0, NET_Y - 2, W, 4);
    // Net posts
    ctx.fillStyle = "rgba(255,255,255,0.25)";
    ctx.fillRect(0, NET_Y - 8, 4, 16);
    ctx.fillRect(W - 4, NET_Y - 8, 4, 16);
    // Net mesh
    ctx.strokeStyle = "rgba(255,255,255,0.06)";
    ctx.lineWidth = 1;
    for (let i = 10; i < W; i += 15) {
      ctx.beginPath();
      ctx.moveTo(i, NET_Y - 2);
      ctx.lineTo(i, NET_Y + 2);
      ctx.stroke();
    }

    // ── AI paddle (top) ──
    const aiLeft = aiXRef.current - PAD_W / 2;
    const aiGrad = ctx.createLinearGradient(aiLeft, AI_Y, aiLeft, AI_Y + PAD_H);
    aiGrad.addColorStop(0, "rgba(239, 68, 68, 0.9)");
    aiGrad.addColorStop(1, "rgba(185, 28, 28, 0.8)");
    ctx.fillStyle = aiGrad;
    ctx.beginPath();
    ctx.roundRect(aiLeft, AI_Y, PAD_W, PAD_H, 5);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.2)";
    ctx.lineWidth = 1;
    ctx.stroke();

    // ── Player paddle (bottom) ──
    const plLeft = padX - PAD_W / 2;
    const plGrad = ctx.createLinearGradient(plLeft, PLAYER_Y, plLeft, PLAYER_Y + PAD_H);
    if (flashRef.current > 0) {
      plGrad.addColorStop(0, `rgba(74, 222, 128, ${0.8 + flashRef.current * 0.2})`);
      plGrad.addColorStop(1, `rgba(34, 197, 94, ${0.6 + flashRef.current * 0.2})`);
      flashRef.current = Math.max(0, flashRef.current - 0.02);
    } else {
      plGrad.addColorStop(0, "rgba(59, 130, 246, 0.9)");
      plGrad.addColorStop(1, "rgba(29, 78, 216, 0.8)");
    }
    ctx.fillStyle = plGrad;
    ctx.beginPath();
    ctx.roundRect(plLeft, PLAYER_Y, PAD_W, PAD_H, 5);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.25)";
    ctx.lineWidth = 1;
    ctx.stroke();

    // ── Ball shadow ──
    ctx.fillStyle = "rgba(0,0,0,0.25)";
    ctx.beginPath();
    ctx.ellipse(ball.x + 2, ball.y + 3, BALL_R, BALL_R * 0.4, 0, 0, Math.PI * 2);
    ctx.fill();

    // ── Ball ──
    const ballGrad = ctx.createRadialGradient(
      ball.x - BALL_R * 0.3, ball.y - BALL_R * 0.3, BALL_R * 0.1,
      ball.x, ball.y, BALL_R
    );
    ballGrad.addColorStop(0, "#fffde7");
    ballGrad.addColorStop(0.5, "#fdd835");
    ballGrad.addColorStop(1, "#f9a825");
    ctx.fillStyle = ballGrad;
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, BALL_R, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,0.15)";
    ctx.lineWidth = 1;
    ctx.stroke();
    // Ball stripe (volleyball look)
    ctx.strokeStyle = "rgba(0,0,0,0.12)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, BALL_R * 0.7, -0.5, 0.8);
    ctx.stroke();
    // Shine
    ctx.fillStyle = "rgba(255,255,255,0.4)";
    ctx.beginPath();
    ctx.arc(ball.x - BALL_R * 0.25, ball.y - BALL_R * 0.25, BALL_R * 0.28, 0, Math.PI * 2);
    ctx.fill();

    // ── HUD ──
    // Score
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    ctx.font = "bold 14px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(`🤖 ${aScoreRef.current}`, W / 2, NET_Y - 14);
    ctx.fillText(`🏐 ${pScoreRef.current}`, W / 2, NET_Y + 24);

    // Sets
    ctx.fillStyle = "rgba(255,255,255,0.5)";
    ctx.font = "11px system-ui, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(`Set ${setNumRef.current}`, 8, 16);
    ctx.textAlign = "right";
    ctx.fillText(`Sets: ${setsRef.current[0]}-${setsRef.current[1]}`, W - 8, 16);

    // Rally counter
    if (rallyCountRef.current > 2) {
      ctx.fillStyle = "rgba(255,215,0,0.6)";
      ctx.font = "10px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(`Rally: ${rallyCountRef.current}`, W / 2, H - 8);
    }

    animRef.current = requestAnimationFrame(drawGame);
  }, [scorePoint]);

  // Start loop
  useEffect(() => {
    if (phase !== "playing") return;
    const tryStart = () => {
      if (canvasRef.current) {
        serveBall("player");
        animRef.current = requestAnimationFrame(drawGame);
      } else {
        animRef.current = requestAnimationFrame(tryStart);
      }
    };
    tryStart();
    return () => cancelAnimationFrame(animRef.current);
  }, [phase, drawGame, serveBall]);

  // Paddle control
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
    pScoreRef.current = 0;
    aScoreRef.current = 0;
    setsRef.current = [0, 0];
    setNumRef.current = 1;
    rallyCountRef.current = 0;
    flashRef.current = 0;
    padXRef.current = W / 2;
    aiXRef.current = W / 2;
    setPlayerScore(0);
    setAiScore(0);
    setSetsWon([0, 0]);
    setCurrentSet(1);
    setLastPoint(null);
    phaseRef.current = "playing";
    setPhase("playing");
  };

  const resetGame = () => {
    cancelAnimationFrame(animRef.current);
    phaseRef.current = "start";
    setPhase("start");
    setPlayerScore(0);
    setAiScore(0);
    setSetsWon([0, 0]);
    setCurrentSet(1);
    setLastPoint(null);
  };

  useEffect(() => () => cancelAnimationFrame(animRef.current), []);

  const matchWinner = setsWon[0] >= 2 ? "player" : setsWon[1] >= 2 ? "ai" : null;

  return (
    <div className="space-y-6">
      {/* RANKING */}
      <section className="rounded-xl border border-border bg-card p-4 sm:p-6 shadow-card">
        <h3 className="text-lg font-semibold flex items-center gap-2 mb-3">
          <Medal className="h-5 w-5 text-primary" /> Ranking Vôlei 1v1
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
                <span className="font-mono font-bold text-primary">{r.score} pts</span>
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
            <span className="text-xs font-bold text-primary uppercase tracking-wider">Vôlei 1v1</span>
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
              <div className="text-5xl">🏐</div>
              <h3 className="text-xl font-bold">Vôlei 1v1</h3>
              <p className="text-sm text-muted-foreground max-w-xs mx-auto">
                Mova sua raquete para rebater a bola. Vença 2 sets de 25 pontos!
                <br />
                <span className="text-xs">🤖 Quanto mais rallies, mais rápida a IA fica!</span>
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
              {lastPoint && (
                <motion.p
                  key={lastPoint + pScoreRef.current + aScoreRef.current}
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="text-sm font-bold text-primary"
                >
                  {lastPoint}
                </motion.p>
              )}
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
                {matchWinner === "player" ? "🏆" : "😤"}
              </div>
              <h3 className="text-2xl font-bold">
                {matchWinner === "player" ? "Vitória!" : "Derrota!"}
              </h3>
              <p className="text-sm text-muted-foreground">
                Sets: {setsWon[0]} x {setsWon[1]}
              </p>
              {matchWinner === "player" && (
                <motion.p
                  className="text-sm font-bold text-primary"
                  animate={{ scale: [1, 1.1, 1] }}
                  transition={{ duration: 1, repeat: 3 }}
                >
                  🎉 Parabéns, você venceu!
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

export default VolleyPongGame;
