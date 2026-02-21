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

// ── Canvas & physics ──
const W = 360;
const H = 400;
const GROUND_Y = H - 40;
const NET_X = W / 2;
const NET_H = 90;
const NET_TOP = GROUND_Y - NET_H;
const BALL_R = 9;
const GRAVITY = 0.18;
const BOUNCE = -0.65;
const MAX_TOUCHES = 3;
const SERVE_VX = 2.5;
const SERVE_VY = -5;
const MAX_SCORE = 15;
const MIN_DIFF = 2;

// Player body
const P_W = 18;
const P_H = 44;
const HEAD_R = 8;
const JUMP_VY = -6.5;
const MOVE_SPEED = 2.8;
const AI_SPEED = 2.4;

type Phase = "start" | "playing" | "gameover";

interface Player {
  x: number;
  y: number; // feet Y (ground = GROUND_Y)
  vy: number;
  armAngle: number; // 0-1 for attack animation
  touches: number;
}

interface Ball {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

// ── Draw helpers ──
const drawStickPlayer = (
  ctx: CanvasRenderingContext2D,
  p: Player,
  faceRight: boolean,
  shirtColor: string,
  shortColor: string,
) => {
  const dir = faceRight ? 1 : -1;
  const feetY = p.y;
  const hipY = feetY - 14;
  const shoulderY = feetY - P_H + HEAD_R + 2;
  const headY = feetY - P_H - HEAD_R + 2;
  const isJumping = p.y < GROUND_Y;
  const kneeSpread = isJumping ? 8 : 5;

  // Shadow on ground
  ctx.fillStyle = "rgba(0,0,0,0.15)";
  ctx.beginPath();
  ctx.ellipse(p.x, GROUND_Y + 2, 12, 3, 0, 0, Math.PI * 2);
  ctx.fill();

  // Legs (skin)
  ctx.strokeStyle = "#c8956c";
  ctx.lineWidth = 3;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(p.x - kneeSpread, feetY);
  ctx.lineTo(p.x - 3, hipY + 4);
  ctx.lineTo(p.x, hipY);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(p.x + kneeSpread, feetY);
  ctx.lineTo(p.x + 3, hipY + 4);
  ctx.lineTo(p.x, hipY);
  ctx.stroke();

  // Shorts
  ctx.fillStyle = shortColor;
  ctx.beginPath();
  ctx.roundRect(p.x - 7, hipY - 2, 14, 10, 3);
  ctx.fill();

  // Torso (shirt)
  ctx.fillStyle = shirtColor;
  ctx.beginPath();
  ctx.roundRect(p.x - 8, shoulderY, 16, hipY - shoulderY, 3);
  ctx.fill();
  // Number on shirt
  ctx.fillStyle = "rgba(255,255,255,0.6)";
  ctx.font = "bold 8px system-ui";
  ctx.textAlign = "center";
  ctx.fillText(faceRight ? "1" : "2", p.x, shoulderY + 14);

  // Arms
  const armBase = shoulderY + 4;
  ctx.strokeStyle = "#c8956c";
  ctx.lineWidth = 3;
  
  // Attack arm (hitting side)
  const attackAngle = p.armAngle;
  if (attackAngle > 0) {
    // Raised arm for attack
    const armEndX = p.x + dir * (10 + attackAngle * 8);
    const armEndY = armBase - attackAngle * 22;
    ctx.beginPath();
    ctx.moveTo(p.x + dir * 6, armBase);
    ctx.lineTo(armEndX, armEndY);
    ctx.stroke();
    // Hand/fist
    ctx.fillStyle = "#c8956c";
    ctx.beginPath();
    ctx.arc(armEndX, armEndY, 3, 0, Math.PI * 2);
    ctx.fill();
  } else {
    // Resting arms
    ctx.beginPath();
    ctx.moveTo(p.x + dir * 6, armBase);
    ctx.lineTo(p.x + dir * 12, armBase + 14);
    ctx.stroke();
  }
  // Other arm (always relaxed)
  ctx.beginPath();
  ctx.moveTo(p.x - dir * 6, armBase);
  ctx.lineTo(p.x - dir * 10, armBase + 12);
  ctx.stroke();

  // Head
  ctx.fillStyle = "#d4a574";
  ctx.beginPath();
  ctx.arc(p.x, headY, HEAD_R, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(0,0,0,0.1)";
  ctx.lineWidth = 1;
  ctx.stroke();

  // Hair
  ctx.fillStyle = faceRight ? "#3b2507" : "#1a1a2e";
  ctx.beginPath();
  ctx.arc(p.x, headY - 2, HEAD_R, Math.PI, 2 * Math.PI);
  ctx.fill();

  // Eyes
  ctx.fillStyle = "#1a1a1a";
  const eyeX = p.x + dir * 3;
  ctx.beginPath();
  ctx.arc(eyeX, headY - 1, 1.5, 0, Math.PI * 2);
  ctx.fill();
};

const drawNet = (ctx: CanvasRenderingContext2D) => {
  // Posts
  ctx.fillStyle = "#8B8B8B";
  ctx.fillRect(NET_X - 3, NET_TOP - 6, 6, NET_H + 6);
  // Post caps
  ctx.fillStyle = "#aaa";
  ctx.beginPath();
  ctx.arc(NET_X, NET_TOP - 6, 5, 0, Math.PI * 2);
  ctx.fill();

  // Net mesh
  const meshTop = NET_TOP;
  const meshBot = GROUND_Y;
  const spacing = 8;

  ctx.strokeStyle = "rgba(255,255,255,0.3)";
  ctx.lineWidth = 0.8;
  // Horizontal lines
  for (let y = meshTop; y <= meshBot; y += spacing) {
    ctx.beginPath();
    ctx.moveTo(NET_X - 3, y);
    ctx.lineTo(NET_X + 3, y);
    ctx.stroke();
  }
  // Top band (white tape)
  ctx.fillStyle = "rgba(255,255,255,0.7)";
  ctx.fillRect(NET_X - 4, meshTop - 2, 8, 5);

  // Antenna markers (red/white)
  ctx.fillStyle = "#ef4444";
  ctx.fillRect(NET_X - 1, meshTop - 14, 2, 8);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(NET_X - 1, meshTop - 22, 2, 8);
};

const drawCourt = (ctx: CanvasRenderingContext2D) => {
  // Sky gradient
  const sky = ctx.createLinearGradient(0, 0, 0, GROUND_Y);
  sky.addColorStop(0, "#1a3a5c");
  sky.addColorStop(0.6, "#2d5a7b");
  sky.addColorStop(1, "#3a7ca5");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, GROUND_Y);

  // Sand/court floor
  const sand = ctx.createLinearGradient(0, GROUND_Y, 0, H);
  sand.addColorStop(0, "#c2956a");
  sand.addColorStop(0.3, "#d4a574");
  sand.addColorStop(1, "#b8885c");
  ctx.fillStyle = sand;
  ctx.fillRect(0, GROUND_Y, W, H - GROUND_Y);

  // Court boundary lines
  ctx.strokeStyle = "rgba(255,255,255,0.5)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(16, GROUND_Y);
  ctx.lineTo(W - 16, GROUND_Y);
  ctx.stroke();

  // Side lines
  ctx.strokeStyle = "rgba(255,255,255,0.25)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(16, GROUND_Y);
  ctx.lineTo(16, GROUND_Y + 30);
  ctx.moveTo(W - 16, GROUND_Y);
  ctx.lineTo(W - 16, GROUND_Y + 30);
  ctx.stroke();

  // Attack lines (3m)
  ctx.setLineDash([3, 3]);
  ctx.strokeStyle = "rgba(255,255,255,0.15)";
  ctx.beginPath();
  ctx.moveTo(NET_X - 60, GROUND_Y + 2);
  ctx.lineTo(NET_X - 60, GROUND_Y + 28);
  ctx.moveTo(NET_X + 60, GROUND_Y + 2);
  ctx.lineTo(NET_X + 60, GROUND_Y + 28);
  ctx.stroke();
  ctx.setLineDash([]);

  // Sand texture dots
  ctx.fillStyle = "rgba(0,0,0,0.04)";
  for (let i = 0; i < 40; i++) {
    const sx = (i * 73 + 17) % W;
    const sy = GROUND_Y + 5 + ((i * 31) % 30);
    ctx.beginPath();
    ctx.arc(sx, sy, 1, 0, Math.PI * 2);
    ctx.fill();
  }
};

const drawBall = (ctx: CanvasRenderingContext2D, ball: Ball) => {
  // Shadow
  ctx.fillStyle = "rgba(0,0,0,0.15)";
  ctx.beginPath();
  ctx.ellipse(ball.x, GROUND_Y + 2, 8, 2.5, 0, 0, Math.PI * 2);
  ctx.fill();

  // Ball body
  const g = ctx.createRadialGradient(
    ball.x - 2, ball.y - 2, 1,
    ball.x, ball.y, BALL_R
  );
  g.addColorStop(0, "#ffffff");
  g.addColorStop(0.5, "#f5f0e0");
  g.addColorStop(1, "#ddd5c0");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(ball.x, ball.y, BALL_R, 0, Math.PI * 2);
  ctx.fill();

  // Panel lines (volleyball look)
  ctx.strokeStyle = "rgba(0,0,0,0.18)";
  ctx.lineWidth = 1;
  // Vertical seam
  ctx.beginPath();
  ctx.arc(ball.x, ball.y, BALL_R * 0.85, -1.2, 1.2);
  ctx.stroke();
  // Horizontal seam
  ctx.beginPath();
  ctx.arc(ball.x, ball.y, BALL_R * 0.85, 0.4 + Math.PI / 2, 2.7 + Math.PI / 2);
  ctx.stroke();
  // Curved seam
  ctx.beginPath();
  ctx.arc(ball.x + 3, ball.y - 2, BALL_R * 0.6, -2, -0.5);
  ctx.stroke();

  // Shine
  ctx.fillStyle = "rgba(255,255,255,0.5)";
  ctx.beginPath();
  ctx.arc(ball.x - 3, ball.y - 3, 3, 0, Math.PI * 2);
  ctx.fill();

  // Outline
  ctx.strokeStyle = "rgba(0,0,0,0.12)";
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.arc(ball.x, ball.y, BALL_R, 0, Math.PI * 2);
  ctx.stroke();
};

// ── Component ──
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
  const [setsWon, setSetsWon] = useState([0, 0]);
  const [currentSet, setCurrentSet] = useState(1);
  const [ranking, setRanking] = useState<GameScore[]>([]);
  const [loadingRanking, setLoadingRanking] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [lastPoint, setLastPoint] = useState<string | null>(null);

  // Game state refs
  const playerRef = useRef<Player>({ x: W * 0.25, y: GROUND_Y, vy: 0, armAngle: 0, touches: 0 });
  const aiRef = useRef<Player>({ x: W * 0.75, y: GROUND_Y, vy: 0, armAngle: 0, touches: 0 });
  const ballRef = useRef<Ball>({ x: W * 0.25, y: GROUND_Y - 80, vx: 0, vy: 0 });
  const pScoreRef = useRef(0);
  const aScoreRef = useRef(0);
  const setsRef = useRef([0, 0]);
  const setNumRef = useRef(1);
  const phaseRef = useRef<Phase>("start");
  const animRef = useRef(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const keysRef = useRef<Set<string>>(new Set());
  const touchDirRef = useRef(0); // -1 left, 0 none, 1 right for touch
  const touchJumpRef = useRef(false);
  const rallyCountRef = useRef(0);
  const pauseRef = useRef(0); // frames to pause after point

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
    rallyCountRef.current = 0;
    const p = who === "player" ? playerRef.current : aiRef.current;
    ballRef.current = {
      x: p.x,
      y: GROUND_Y - P_H - BALL_R - 10,
      vx: who === "player" ? SERVE_VX : -SERVE_VX,
      vy: SERVE_VY,
    };
    p.touches = 1;
    p.armAngle = 1;
  }, []);

  // ─── Score point ─────────────────────────────
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
    pauseRef.current = 60; // ~1 second pause

    const p = pScoreRef.current;
    const a = aScoreRef.current;
    if ((p >= MAX_SCORE || a >= MAX_SCORE) && Math.abs(p - a) >= MIN_DIFF) {
      const winner = p > a ? 0 : 1;
      setsRef.current[winner] += 1;
      setSetsWon([...setsRef.current]);

      if (setsRef.current[winner] >= 2) {
        const finalScore = setsRef.current[0] * 100 + Math.max(0, pScoreRef.current - aScoreRef.current) + (setsRef.current[0] >= 2 ? 500 : 0);
        phaseRef.current = "gameover";
        setPhase("gameover");
        submitScore(finalScore);
        return;
      }

      setNumRef.current += 1;
      setCurrentSet(setNumRef.current);
      pScoreRef.current = 0;
      aScoreRef.current = 0;
      setPlayerScore(0);
      setAiScore(0);
    }

    setTimeout(() => {
      if (phaseRef.current === "playing") {
        // Reset positions
        playerRef.current.x = W * 0.25;
        playerRef.current.y = GROUND_Y;
        playerRef.current.vy = 0;
        playerRef.current.touches = 0;
        aiRef.current.x = W * 0.75;
        aiRef.current.y = GROUND_Y;
        aiRef.current.vy = 0;
        aiRef.current.touches = 0;
        serveBall(scorer);
      }
    }, 1000);
  }, [serveBall]);

  // ─── Ball-player collision ─────────────────
  const checkPlayerBallHit = (p: Player, ball: Ball, isLeft: boolean): boolean => {
    const headY = p.y - P_H - HEAD_R + 2;
    const bodyTop = headY - HEAD_R;
    // Check collision with upper body / arms area
    const dx = ball.x - p.x;
    const dy = ball.y - (bodyTop + 10);
    const dist = Math.sqrt(dx * dx + dy * dy);
    const hitRadius = 22;

    if (dist < hitRadius + BALL_R && p.touches < MAX_TOUCHES) {
      p.touches += 1;
      p.armAngle = 1;
      rallyCountRef.current += 1;

      // Reflect ball based on hit position
      const angle = Math.atan2(dy, dx);
      const speed = Math.sqrt(ball.vx * ball.vx + ball.vy * ball.vy);
      const newSpeed = Math.max(speed, 3.5);
      // Always send ball toward opposite side
      const targetDir = isLeft ? 1 : -1;
      ball.vx = targetDir * Math.abs(Math.cos(angle)) * newSpeed * 0.8 + targetDir * 1.5;
      ball.vy = -Math.abs(newSpeed * 0.7) - 1.5;
      // Push ball out of collision
      ball.x = p.x + (hitRadius + BALL_R + 2) * Math.cos(angle);
      ball.y = (bodyTop + 10) + (hitRadius + BALL_R + 2) * Math.sin(angle);

      return true;
    }
    return false;
  };

  // ─── Game Loop ─────────────────────────────────
  const drawGame = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    if (pauseRef.current > 0) {
      pauseRef.current--;
      // Still draw but don't update physics
      ctx.clearRect(0, 0, W, H);
      drawCourt(ctx);
      drawNet(ctx);
      drawStickPlayer(ctx, aiRef.current, false, "#ef4444", "#1e293b");
      drawStickPlayer(ctx, playerRef.current, true, "#3b82f6", "#f8f8f8");
      drawBall(ctx, ballRef.current);
      // HUD
      ctx.fillStyle = "rgba(255,255,255,0.95)";
      ctx.font = "bold 18px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(`${pScoreRef.current} - ${aScoreRef.current}`, W / 2, 28);
      ctx.font = "11px system-ui, sans-serif";
      ctx.fillStyle = "rgba(255,255,255,0.5)";
      ctx.fillText(`Set ${setNumRef.current} | Sets: ${setsRef.current[0]}-${setsRef.current[1]}`, W / 2, 44);
      animRef.current = requestAnimationFrame(drawGame);
      return;
    }

    const player = playerRef.current;
    const ai = aiRef.current;
    const ball = ballRef.current;
    const keys = keysRef.current;

    // ── Player movement (left side of court) ──
    let moveDir = touchDirRef.current;
    if (keys.has("ArrowLeft") || keys.has("a")) moveDir = -1;
    if (keys.has("ArrowRight") || keys.has("d")) moveDir = 1;
    
    player.x += moveDir * MOVE_SPEED;
    player.x = Math.max(20, Math.min(NET_X - P_W / 2 - 4, player.x));

    // Jump
    if ((keys.has("ArrowUp") || keys.has("w") || keys.has(" ") || touchJumpRef.current) && player.y >= GROUND_Y) {
      player.vy = JUMP_VY;
      touchJumpRef.current = false;
    }
    player.vy += GRAVITY;
    player.y += player.vy;
    if (player.y >= GROUND_Y) {
      player.y = GROUND_Y;
      player.vy = 0;
    }

    // Arm decay
    player.armAngle = Math.max(0, player.armAngle - 0.06);

    // ── AI movement ──
    // Simple AI: move toward ball when it's on AI's side, jump to hit
    const ballOnAiSide = ball.x > NET_X;
    if (ballOnAiSide) {
      const aiDiff = ball.x - ai.x;
      if (Math.abs(aiDiff) > 5) {
        ai.x += Math.sign(aiDiff) * Math.min(AI_SPEED + rallyCountRef.current * 0.02, Math.abs(aiDiff));
      }
      // Jump when ball is close and coming down or at good height
      const distToBall = Math.sqrt((ball.x - ai.x) ** 2 + (ball.y - (ai.y - P_H)) ** 2);
      if (distToBall < 50 && ball.y < GROUND_Y - 30 && ai.y >= GROUND_Y) {
        ai.vy = JUMP_VY * 0.9;
      }
    } else {
      // Return to center of AI's side
      const homeX = W * 0.75;
      const aiDiff = homeX - ai.x;
      if (Math.abs(aiDiff) > 3) {
        ai.x += Math.sign(aiDiff) * AI_SPEED * 0.5;
      }
    }
    ai.x = Math.max(NET_X + P_W / 2 + 4, Math.min(W - 20, ai.x));
    ai.vy += GRAVITY;
    ai.y += ai.vy;
    if (ai.y >= GROUND_Y) {
      ai.y = GROUND_Y;
      ai.vy = 0;
    }
    ai.armAngle = Math.max(0, ai.armAngle - 0.06);

    // ── Ball physics ──
    ball.vy += GRAVITY;
    ball.x += ball.vx;
    ball.y += ball.vy;

    // Wall bounces
    if (ball.x <= BALL_R) { ball.vx = Math.abs(ball.vx) * 0.8; ball.x = BALL_R; }
    if (ball.x >= W - BALL_R) { ball.vx = -Math.abs(ball.vx) * 0.8; ball.x = W - BALL_R; }
    // Ceiling
    if (ball.y <= BALL_R) { ball.vy = Math.abs(ball.vy) * 0.5; ball.y = BALL_R; }

    // Net collision
    if (
      ball.y + BALL_R > NET_TOP &&
      ball.y - BALL_R < GROUND_Y &&
      Math.abs(ball.x - NET_X) < BALL_R + 4
    ) {
      ball.vx = -ball.vx * 0.6;
      ball.x = ball.x < NET_X ? NET_X - BALL_R - 5 : NET_X + BALL_R + 5;
    }

    // Player-ball collisions
    const playerHit = checkPlayerBallHit(player, ball, true);
    if (playerHit) player.touches = Math.min(player.touches, MAX_TOUCHES);
    
    const aiHit = checkPlayerBallHit(ai, ball, false);
    if (aiHit) {
      ai.touches = Math.min(ai.touches, MAX_TOUCHES);
      // Reset player touches when ball crosses
      player.touches = 0;
    }
    if (playerHit) ai.touches = 0;

    // Ball hits ground
    if (ball.y + BALL_R >= GROUND_Y) {
      ball.y = GROUND_Y - BALL_R;
      ball.vy = 0;
      ball.vx = 0;
      // Who scores?
      if (ball.x < NET_X) {
        scorePoint("ai"); // ball on player's side = AI scores
      } else {
        scorePoint("player"); // ball on AI's side = player scores
      }
      animRef.current = requestAnimationFrame(drawGame);
      return;
    }

    // ── Draw ──
    ctx.clearRect(0, 0, W, H);
    drawCourt(ctx);
    drawNet(ctx);
    
    // Players
    drawStickPlayer(ctx, ai, false, "#ef4444", "#1e293b");
    drawStickPlayer(ctx, player, true, "#3b82f6", "#f8f8f8");
    
    // Ball
    drawBall(ctx, ball);

    // ── HUD ──
    ctx.fillStyle = "rgba(255,255,255,0.95)";
    ctx.font = "bold 18px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(`${pScoreRef.current} - ${aScoreRef.current}`, W / 2, 28);

    ctx.font = "11px system-ui, sans-serif";
    ctx.fillStyle = "rgba(255,255,255,0.5)";
    ctx.fillText(`Set ${setNumRef.current} | Sets: ${setsRef.current[0]}-${setsRef.current[1]}`, W / 2, 44);

    // Touch labels
    ctx.fillStyle = "rgba(255,255,255,0.3)";
    ctx.font = "9px system-ui, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(`Toques: ${player.touches}/${MAX_TOUCHES}`, 8, H - 6);
    ctx.textAlign = "right";
    ctx.fillText(`IA: ${ai.touches}/${MAX_TOUCHES}`, W - 8, H - 6);

    if (rallyCountRef.current > 3) {
      ctx.fillStyle = "rgba(255,215,0,0.5)";
      ctx.font = "10px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(`Rally: ${rallyCountRef.current}`, W / 2, H - 6);
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

  // Keyboard controls
  useEffect(() => {
    if (phase !== "playing") return;
    const onDown = (e: KeyboardEvent) => { keysRef.current.add(e.key); };
    const onUp = (e: KeyboardEvent) => { keysRef.current.delete(e.key); };
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
      keysRef.current.clear();
    };
  }, [phase]);

  // Touch controls
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const touch = e.touches[0];
    if (!touch) return;
    const tx = (touch.clientX - rect.left) / rect.width;
    const ty = (touch.clientY - rect.top) / rect.height;
    
    // Top half = jump, bottom-left = move left, bottom-right = move right
    if (ty < 0.5) {
      touchJumpRef.current = true;
    } else {
      touchDirRef.current = tx < 0.5 ? -1 : 1;
    }
  }, []);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    touchDirRef.current = 0;
    touchJumpRef.current = false;
  }, []);

  const startGame = () => {
    if (!playerName.trim()) return;
    pScoreRef.current = 0;
    aScoreRef.current = 0;
    setsRef.current = [0, 0];
    setNumRef.current = 1;
    rallyCountRef.current = 0;
    pauseRef.current = 0;
    playerRef.current = { x: W * 0.25, y: GROUND_Y, vy: 0, armAngle: 0, touches: 0 };
    aiRef.current = { x: W * 0.75, y: GROUND_Y, vy: 0, armAngle: 0, touches: 0 };
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
                Controle seu jogador para rebater a bola por cima da rede!
              </p>
              <div className="text-xs text-muted-foreground max-w-xs mx-auto space-y-1">
                <p>🖥️ <strong>Teclado:</strong> ← → para mover, ↑ ou Espaço para pular</p>
                <p>📱 <strong>Toque:</strong> Parte inferior = mover, parte superior = pular</p>
              </div>
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
                onTouchStart={handleTouchStart}
                onTouchEnd={handleTouchEnd}
                onTouchMove={(e) => e.preventDefault()}
                className="rounded-xl border border-border/50 touch-none select-none"
                style={{ maxWidth: "100%", cursor: "default" }}
              />
              <p className="text-xs text-muted-foreground">← → mover | ↑ pular | Toque para controlar</p>
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
