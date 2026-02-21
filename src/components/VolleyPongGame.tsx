import { useState, useEffect, useCallback, useRef } from "react";
import { publicQuery } from "@/lib/organizerApi";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "framer-motion";
import { Medal, Zap, RotateCcw, Trash2, Copy, UserPlus, LogIn, Wifi } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";

interface GameScore {
  id: string;
  player_name: string;
  score: number;
  created_at: string;
}

// ═══════ CANVAS & PHYSICS ═══════
const W = 480;
const H = 340;
const GROUND_Y = H - 36;
const NET_X = W / 2;
const NET_H = 60;
const NET_TOP = GROUND_Y - NET_H;
const BALL_R = 9;
const GRAVITY = 0.18;
const SERVE_VX = 2.5;
const SERVE_VY = -5.5;
const MAX_TOUCHES = 3;
const MAX_SCORE = 5;
const MIN_DIFF = 2;

// Alien body
const ALIEN_R = 18;
const JUMP_VY = -5.5;
const MOVE_SPEED = 3.0;
const AI_SPEED = 2.0;
const BALL_SPEED_CAP = 4.5;
const BALL_VY_CAP = 6.5;

type Phase = "start" | "waiting" | "playing" | "gameover";
type GameMode = "solo" | "multi";
type MultiRole = "host" | "guest" | null;
type PowerUpType = "giant" | "fast" | "curve";

interface Player {
  x: number; y: number; vy: number; touches: number;
  attackCooldown: number; expression: string; blinkTimer: number;
}
interface Ball {
  x: number; y: number; vx: number; vy: number; rotation: number;
  sizeMultiplier: number; speedMultiplier: number; curveActive: boolean;
}
interface PowerUp {
  x: number; y: number; type: PowerUpType; timer: number; floatPhase: number;
}
interface Particle {
  x: number; y: number; vx: number; vy: number; life: number;
  color: string; size: number;
}

const createPlayer = (x: number): Player => ({
  x, y: GROUND_Y, vy: 0, touches: 0, attackCooldown: 0,
  expression: "happy", blinkTimer: 120 + Math.random() * 120,
});
const createBall = (x: number, y: number): Ball => ({
  x, y, vx: 0, vy: 0, rotation: 0,
  sizeMultiplier: 1, speedMultiplier: 1, curveActive: false,
});

// ═══════ DRAWING FUNCTIONS ═══════
const drawBackground = (ctx: CanvasRenderingContext2D, frame: number) => {
  // Sky gradient
  const sky = ctx.createLinearGradient(0, 0, 0, H * 0.65);
  sky.addColorStop(0, "#87CEEB");
  sky.addColorStop(0.6, "#B0E0FF");
  sky.addColorStop(1, "#FFE0B2");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);

  // Sun
  const sunX = W * 0.82, sunY = 45;
  const sunGlow = ctx.createRadialGradient(sunX, sunY, 5, sunX, sunY, 50);
  sunGlow.addColorStop(0, "rgba(255,200,50,0.9)");
  sunGlow.addColorStop(0.5, "rgba(255,180,50,0.2)");
  sunGlow.addColorStop(1, "rgba(255,180,50,0)");
  ctx.fillStyle = sunGlow;
  ctx.fillRect(sunX - 50, sunY - 50, 100, 100);
  ctx.beginPath();
  ctx.arc(sunX, sunY, 18, 0, Math.PI * 2);
  ctx.fillStyle = "#FFD93D";
  ctx.fill();

  // Clouds
  const drawCloud = (cx: number, cy: number, s: number) => {
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.beginPath();
    ctx.arc(cx, cy, s * 12, 0, Math.PI * 2);
    ctx.arc(cx - s * 10, cy + s * 3, s * 9, 0, Math.PI * 2);
    ctx.arc(cx + s * 11, cy + s * 2, s * 10, 0, Math.PI * 2);
    ctx.fill();
  };
  const cloudOffset = (frame * 0.15) % (W + 100);
  drawCloud(cloudOffset - 50, 35, 1.2);
  drawCloud((cloudOffset + 200) % (W + 100) - 50, 55, 0.9);
  drawCloud((cloudOffset + 370) % (W + 100) - 50, 28, 1.0);

  // Ocean
  const waterY = GROUND_Y - 6;
  const water = ctx.createLinearGradient(0, waterY, 0, GROUND_Y);
  water.addColorStop(0, "#4FC3F7");
  water.addColorStop(1, "#0288D1");
  ctx.fillStyle = water;
  ctx.fillRect(0, waterY, W, 8);
  // Waves
  ctx.strokeStyle = "rgba(255,255,255,0.3)";
  ctx.lineWidth = 1;
  for (let wx = 0; wx < W; wx += 20) {
    ctx.beginPath();
    ctx.arc(wx + Math.sin(frame * 0.03 + wx * 0.1) * 5, waterY + 3, 8, Math.PI, 0);
    ctx.stroke();
  }

  // Sand
  const sand = ctx.createLinearGradient(0, GROUND_Y - 2, 0, H);
  sand.addColorStop(0, "#F5D98E");
  sand.addColorStop(1, "#E8C860");
  ctx.fillStyle = sand;
  ctx.fillRect(0, GROUND_Y - 2, W, H - GROUND_Y + 2);

  // Palm trees
  const drawPalm = (px: number, h: number) => {
    ctx.strokeStyle = "#8B5E3C";
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(px, GROUND_Y);
    ctx.quadraticCurveTo(px + 5, GROUND_Y - h * 0.5, px + 3, GROUND_Y - h);
    ctx.stroke();
    // Leaves
    const leafTop = GROUND_Y - h;
    ctx.fillStyle = "#4CAF50";
    for (let a = 0; a < 5; a++) {
      const angle = -Math.PI * 0.3 + a * Math.PI * 0.25 + Math.sin(frame * 0.02 + a) * 0.05;
      ctx.beginPath();
      ctx.moveTo(px + 3, leafTop);
      ctx.quadraticCurveTo(
        px + 3 + Math.cos(angle) * 25, leafTop + Math.sin(angle) * 15 - 10,
        px + 3 + Math.cos(angle) * 40, leafTop + Math.sin(angle) * 25
      );
      ctx.quadraticCurveTo(
        px + 3 + Math.cos(angle) * 25, leafTop + Math.sin(angle) * 15 + 3,
        px + 3, leafTop + 3
      );
      ctx.fill();
    }
  };
  drawPalm(30, 120);
  drawPalm(W - 40, 105);
};

const drawNet = (ctx: CanvasRenderingContext2D) => {
  // Net pole
  ctx.fillStyle = "#757575";
  ctx.fillRect(NET_X - 2, NET_TOP - 4, 4, GROUND_Y - NET_TOP + 4);
  // Net mesh
  ctx.strokeStyle = "rgba(255,255,255,0.7)";
  ctx.lineWidth = 0.8;
  for (let ny = NET_TOP; ny < GROUND_Y; ny += 8) {
    ctx.beginPath();
    ctx.moveTo(NET_X - 3, ny);
    ctx.lineTo(NET_X + 3, ny);
    ctx.stroke();
  }
  // Top band
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(NET_X - 4, NET_TOP - 4, 8, 5);
};

const drawAlien = (
  ctx: CanvasRenderingContext2D,
  x: number, y: number, color: string, darkColor: string,
  facingRight: boolean, expression: string, blinking: boolean, frame: number
) => {
  const bodyY = y - ALIEN_R;
  const squash = y >= GROUND_Y - 2 ? 1.0 : 0.93; // Squash when on ground
  const stretch = y >= GROUND_Y - 2 ? 1.0 : 1.08;

  ctx.save();
  ctx.translate(x, bodyY);
  ctx.scale(squash, stretch);

  // Shadow
  ctx.fillStyle = "rgba(0,0,0,0.15)";
  ctx.beginPath();
  ctx.ellipse(0, ALIEN_R + 2, ALIEN_R * 0.8, 4, 0, 0, Math.PI * 2);
  ctx.fill();

  // Body
  const bodyGrad = ctx.createRadialGradient(-4, -4, 2, 0, 0, ALIEN_R);
  bodyGrad.addColorStop(0, color);
  bodyGrad.addColorStop(1, darkColor);
  ctx.fillStyle = bodyGrad;
  ctx.beginPath();
  ctx.arc(0, 0, ALIEN_R, 0, Math.PI * 2);
  ctx.fill();
  // Body outline
  ctx.strokeStyle = darkColor;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Antennae
  const antAngle1 = Math.sin(frame * 0.08) * 0.15;
  const antAngle2 = Math.sin(frame * 0.08 + 1) * 0.15;
  ctx.strokeStyle = darkColor;
  ctx.lineWidth = 2;
  // Left antenna
  ctx.beginPath();
  ctx.moveTo(-6, -ALIEN_R + 2);
  ctx.quadraticCurveTo(-10 + antAngle1 * 10, -ALIEN_R - 12, -8, -ALIEN_R - 14);
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.arc(-8, -ALIEN_R - 14, 3, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = darkColor; ctx.lineWidth = 1; ctx.stroke();
  // Right antenna
  ctx.strokeStyle = darkColor; ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(6, -ALIEN_R + 2);
  ctx.quadraticCurveTo(10 + antAngle2 * 10, -ALIEN_R - 12, 8, -ALIEN_R - 14);
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.arc(8, -ALIEN_R - 14, 3, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = darkColor; ctx.lineWidth = 1; ctx.stroke();

  // Eyes
  const eyeSpacing = 7;
  const eyeY = -3;
  const eyeR = 6;
  const pupilR = 3;

  for (const side of [-1, 1]) {
    const ex = side * eyeSpacing;
    // White
    ctx.fillStyle = "#FFFFFF";
    ctx.beginPath();
    ctx.ellipse(ex, eyeY, eyeR, blinking ? 1 : eyeR * 0.95, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = darkColor;
    ctx.lineWidth = 0.8;
    ctx.stroke();

    if (!blinking) {
      // Pupil - looks toward facing direction
      const px = ex + (facingRight ? 1.5 : -1.5);
      const py = eyeY + (expression === "sad" ? 1 : 0);
      ctx.fillStyle = "#333333";
      ctx.beginPath();
      ctx.arc(px, py, pupilR, 0, Math.PI * 2);
      ctx.fill();
      // Highlight
      ctx.fillStyle = "#FFFFFF";
      ctx.beginPath();
      ctx.arc(px + 1, py - 1.5, 1.2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Blush cheeks
  ctx.fillStyle = "rgba(255,120,120,0.3)";
  ctx.beginPath(); ctx.ellipse(-12, 3, 4, 3, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(12, 3, 4, 3, 0, 0, Math.PI * 2); ctx.fill();

  // Mouth based on expression
  ctx.strokeStyle = darkColor;
  ctx.lineWidth = 1.5;
  ctx.fillStyle = darkColor;
  if (expression === "happy") {
    ctx.beginPath();
    ctx.arc(0, 5, 5, 0.1, Math.PI - 0.1);
    ctx.stroke();
  } else if (expression === "excited") {
    ctx.beginPath();
    ctx.ellipse(0, 7, 4, 3, 0, 0, Math.PI * 2);
    ctx.fillStyle = "#FF6B6B";
    ctx.fill();
    ctx.strokeStyle = darkColor;
    ctx.stroke();
  } else if (expression === "determined") {
    ctx.beginPath();
    ctx.moveTo(-4, 7); ctx.lineTo(4, 6);
    ctx.stroke();
  } else if (expression === "sad") {
    ctx.beginPath();
    ctx.arc(0, 10, 5, Math.PI + 0.3, -0.3);
    ctx.stroke();
  } else if (expression === "surprised") {
    ctx.beginPath();
    ctx.ellipse(0, 7, 3, 4, 0, 0, Math.PI * 2);
    ctx.fillStyle = "#FF6B6B";
    ctx.fill();
    ctx.stroke();
  }

  // Arms
  const armWave = Math.sin(frame * 0.12) * 0.2;
  ctx.strokeStyle = darkColor;
  ctx.lineWidth = 2.5;
  const armDir = facingRight ? 1 : -1;
  // Front arm
  ctx.beginPath();
  ctx.moveTo(armDir * ALIEN_R * 0.7, 0);
  ctx.quadraticCurveTo(armDir * (ALIEN_R + 8), -5 + armWave * 8, armDir * (ALIEN_R + 12), -8);
  ctx.strokeStyle = color; ctx.lineWidth = 3; ctx.stroke();
  ctx.strokeStyle = darkColor; ctx.lineWidth = 2; ctx.stroke();
  // Hand
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.arc(armDir * (ALIEN_R + 12), -8, 3, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = darkColor; ctx.lineWidth = 1; ctx.stroke();
  // Back arm
  ctx.beginPath();
  ctx.moveTo(-armDir * ALIEN_R * 0.6, 2);
  ctx.quadraticCurveTo(-armDir * (ALIEN_R + 5), 5 - armWave * 5, -armDir * (ALIEN_R + 9), 2);
  ctx.strokeStyle = color; ctx.lineWidth = 3; ctx.stroke();
  ctx.strokeStyle = darkColor; ctx.lineWidth = 2; ctx.stroke();
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.arc(-armDir * (ALIEN_R + 9), 2, 3, 0, Math.PI * 2); ctx.fill();

  // Feet
  const footBounce = Math.sin(frame * 0.15) * 2;
  ctx.fillStyle = darkColor;
  ctx.beginPath();
  ctx.ellipse(-5, ALIEN_R - 1 + (y < GROUND_Y ? footBounce : 0), 5, 3, -0.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(5, ALIEN_R - 1 + (y < GROUND_Y ? -footBounce : 0), 5, 3, 0.2, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
};

const drawBall = (ctx: CanvasRenderingContext2D, ball: Ball) => {
  const r = BALL_R * ball.sizeMultiplier;
  ctx.save();
  ctx.translate(ball.x, ball.y);
  ctx.rotate(ball.rotation);

  // Ball shadow on ground
  ctx.restore();
  ctx.save();
  const shadowScale = Math.max(0.3, 1 - (GROUND_Y - ball.y) / 200);
  ctx.fillStyle = `rgba(0,0,0,${0.12 * shadowScale})`;
  ctx.beginPath();
  ctx.ellipse(ball.x, GROUND_Y + 1, r * shadowScale, 3 * shadowScale, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.translate(ball.x, ball.y);
  ctx.rotate(ball.rotation);

  // Main ball
  const ballGrad = ctx.createRadialGradient(-2, -2, 1, 0, 0, r);
  if (ball.curveActive) {
    ballGrad.addColorStop(0, "#AB47BC");
    ballGrad.addColorStop(1, "#7B1FA2");
  } else if (ball.speedMultiplier > 1) {
    ballGrad.addColorStop(0, "#FFD54F");
    ballGrad.addColorStop(1, "#FF8F00");
  } else if (ball.sizeMultiplier > 1) {
    ballGrad.addColorStop(0, "#EF5350");
    ballGrad.addColorStop(1, "#C62828");
  } else {
    ballGrad.addColorStop(0, "#FFFFFF");
    ballGrad.addColorStop(1, "#E0E0E0");
  }
  ctx.fillStyle = ballGrad;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(0,0,0,0.2)";
  ctx.lineWidth = 1;
  ctx.stroke();

  // Volleyball lines
  ctx.strokeStyle = "rgba(0,0,0,0.12)";
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(-r, 0); ctx.lineTo(r, 0);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(0, -r); ctx.lineTo(0, r);
  ctx.stroke();

  ctx.restore();
};

const drawPowerUp = (ctx: CanvasRenderingContext2D, pu: PowerUp, frame: number) => {
  const floatY = pu.y + Math.sin(frame * 0.06 + pu.floatPhase) * 5;
  const glow = 0.5 + Math.sin(frame * 0.1) * 0.3;

  const colors: Record<PowerUpType, { bg: string; icon: string }> = {
    giant: { bg: "#EF5350", icon: "🔴" },
    fast: { bg: "#FFD54F", icon: "⚡" },
    curve: { bg: "#AB47BC", icon: "🌀" },
  };
  const c = colors[pu.type];

  // Glow
  ctx.fillStyle = `rgba(255,255,255,${glow * 0.3})`;
  ctx.beginPath();
  ctx.arc(pu.x, floatY, 16, 0, Math.PI * 2);
  ctx.fill();

  // Circle
  ctx.fillStyle = c.bg;
  ctx.beginPath();
  ctx.arc(pu.x, floatY, 11, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.6)";
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Icon
  ctx.font = "12px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(c.icon, pu.x, floatY);
};

const drawParticles = (ctx: CanvasRenderingContext2D, particles: Particle[]) => {
  for (const p of particles) {
    ctx.globalAlpha = Math.max(0, p.life);
    ctx.fillStyle = p.color;
    if (p.size > 3) {
      // Star particle
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.life * 3);
      ctx.beginPath();
      for (let i = 0; i < 5; i++) {
        const a = (i * Math.PI * 2) / 5 - Math.PI / 2;
        const r1 = p.size;
        const r2 = p.size * 0.4;
        ctx.lineTo(Math.cos(a) * r1, Math.sin(a) * r1);
        const a2 = a + Math.PI / 5;
        ctx.lineTo(Math.cos(a2) * r2, Math.sin(a2) * r2);
      }
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    } else {
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
};

// Safe rounded rect helper
const safeRoundRect = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) => {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
};

const drawHUD = (
  ctx: CanvasRenderingContext2D, pScore: number, aScore: number,
  sets: number[], setNum: number, energy: number, coins: number, _frame: number
) => {
  // Score panel - top center
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  const panelW = 160, panelH = 32, panelX = (W - panelW) / 2, panelY = 6;
  safeRoundRect(ctx, panelX, panelY, panelW, panelH, 10);
  ctx.fill();

  ctx.font = "bold 16px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#64DD17";
  ctx.fillText(String(pScore), panelX + 40, panelY + 16);
  ctx.fillStyle = "rgba(255,255,255,0.5)";
  ctx.font = "12px sans-serif";
  ctx.fillText("×", panelX + panelW / 2, panelY + 16);
  ctx.font = "bold 16px sans-serif";
  ctx.fillStyle = "#FF5252";
  ctx.fillText(String(aScore), panelX + panelW - 40, panelY + 16);

  // Sets
  ctx.font = "9px sans-serif";
  ctx.fillStyle = "rgba(255,255,255,0.5)";
  ctx.fillText(`Set ${setNum} • ${sets[0]}-${sets[1]}`, W / 2, panelY + panelH + 8);

  // Energy bar - bottom left
  const barW = 60, barH = 6, barX = 8, barY = H - 14;
  ctx.fillStyle = "rgba(0,0,0,0.4)";
  safeRoundRect(ctx, barX, barY, barW, barH, 3); ctx.fill();
  if (energy > 0.01) {
    const energyGrad = ctx.createLinearGradient(barX, 0, barX + barW * energy, 0);
    energyGrad.addColorStop(0, "#76FF03");
    energyGrad.addColorStop(1, "#00E676");
    ctx.fillStyle = energyGrad;
    safeRoundRect(ctx, barX, barY, Math.max(3, barW * energy), barH, 3); ctx.fill();
  }
  ctx.font = "7px sans-serif";
  ctx.fillStyle = "rgba(255,255,255,0.6)";
  ctx.textAlign = "left";
  ctx.fillText("⚡ Energia", barX, barY - 3);

  // Coins - top right
  ctx.font = "bold 10px sans-serif";
  ctx.fillStyle = "#FFD700";
  ctx.textAlign = "right";
  ctx.fillText(`🪙 ${coins}`, W - 10, 18);
};

// ═══════ COMPONENT ═══════
const VolleyPongGame = ({
  tournamentId, sport, isAdmin = false,
}: {
  tournamentId: string; sport: string; isAdmin?: boolean;
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
  const [inviteCode, setInviteCode] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [showInvite, setShowInvite] = useState(false);
  const [showJoin, setShowJoin] = useState(false);
  const [gameMode, setGameMode] = useState<GameMode>("solo");
  const [multiRole, setMultiRole] = useState<MultiRole>(null);
  const [opponentName, setOpponentName] = useState("");
  const [opponentConnected, setOpponentConnected] = useState(false);

  // Canvas & game refs
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const playerRef = useRef<Player>(createPlayer(W * 0.25));
  const aiRef = useRef<Player>(createPlayer(W * 0.75));
  const ballRef = useRef<Ball>(createBall(W * 0.25, GROUND_Y - 80));
  const pScoreRef = useRef(0);
  const aScoreRef = useRef(0);
  const setsRef = useRef([0, 0]);
  const setNumRef = useRef(1);
  const phaseRef = useRef<Phase>("start");
  const animRef = useRef(0);
  const keysRef = useRef<Set<string>>(new Set());
  const touchDirRef = useRef(0);
  const touchJumpRef = useRef(false);
  const touchAttackRef = useRef(false);
  const rallyCountRef = useRef(0);
  const pauseRef = useRef(0);
  const frameRef = useRef(0);
  const particlesRef = useRef<Particle[]>([]);
  const powerUpsRef = useRef<PowerUp[]>([]);
  const energyRef = useRef(0);
  const coinsRef = useRef(0);
  const effectsRef = useRef<{ type: PowerUpType; remaining: number }[]>([]);
  const lastPointRef = useRef<string | null>(null);

  // Multiplayer refs
  const gameModeRef = useRef<GameMode>("solo");
  const multiRoleRef = useRef<MultiRole>(null);
  const channelRef = useRef<any>(null);
  const remoteInputRef = useRef({ dir: 0, jump: false, attack: false });
  const broadcastCountRef = useRef(0);
  const audioCtxRef = useRef<AudioContext | null>(null);

  // ── Sound ──
  const getAudioCtx = () => {
    if (!audioCtxRef.current) audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    if (audioCtxRef.current.state === "suspended") audioCtxRef.current.resume();
    return audioCtxRef.current;
  };
  const playSound = (freq: number, dur: number, type: OscillatorType = "triangle", vol = 0.12) => {
    try {
      const ctx = getAudioCtx();
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.connect(g); g.connect(ctx.destination);
      osc.type = type; osc.frequency.setValueAtTime(freq, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(freq * 0.5, ctx.currentTime + dur);
      g.gain.setValueAtTime(vol, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
      osc.start(ctx.currentTime); osc.stop(ctx.currentTime + dur);
    } catch {}
  };
  const playHitSound = () => playSound(500, 0.1, "triangle", 0.15);
  const playSpikeSound = () => playSound(700, 0.12, "square", 0.18);
  const playPointSound = (isPlayer: boolean) => {
    const notes = isPlayer ? [523, 659, 784] : [400, 320, 260];
    notes.forEach((f, i) => setTimeout(() => playSound(f, 0.15, isPlayer ? "sine" : "square", 0.12), i * 100));
  };
  const playWhistle = () => playSound(1000, 0.3, "sine", 0.1);
  const playPowerUpSound = () => { playSound(800, 0.08); setTimeout(() => playSound(1200, 0.12), 80); };

  // ── Spawn particles ──
  const spawnParticles = (x: number, y: number, count: number, colors: string[], star = false) => {
    for (let i = 0; i < count; i++) {
      particlesRef.current.push({
        x, y,
        vx: (Math.random() - 0.5) * 6,
        vy: -Math.random() * 5 - 1,
        life: 1,
        color: colors[Math.floor(Math.random() * colors.length)],
        size: star ? 4 + Math.random() * 3 : 2 + Math.random() * 2,
      });
    }
  };

  // ── Invite code ──
  useEffect(() => { setInviteCode(Math.random().toString(36).substring(2, 8).toUpperCase()); }, []);
  const copyInviteCode = () => {
    navigator.clipboard.writeText(inviteCode);
    toast({ title: "Código copiado!", description: `Envie "${inviteCode}" para seu amigo` });
  };

  // ── Channel management (multiplayer) ──
  const cleanupChannel = useCallback(() => {
    if (channelRef.current) {
      channelRef.current.send({ type: "broadcast", event: "game", payload: { type: "leave" } });
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }
  }, []);

  const createRoom = useCallback(() => {
    if (!playerName.trim()) return;
    cleanupChannel();
    const channel = supabase.channel(`volley-room-${inviteCode}`, { config: { broadcast: { self: false } } });
    channel.on("broadcast", { event: "game" }, ({ payload }) => {
      if (payload.type === "join") {
        setOpponentName(payload.name); setOpponentConnected(true);
        channel.send({ type: "broadcast", event: "game", payload: { type: "host_info", name: playerName.trim() } });
        toast({ title: "Jogador conectado!", description: `${payload.name} entrou na sala` });
      } else if (payload.type === "input" && multiRoleRef.current === "host") {
        remoteInputRef.current = payload.input;
      } else if (payload.type === "leave") {
        setOpponentConnected(false); setOpponentName("");
        toast({ title: "Jogador saiu", variant: "destructive" });
        if (phaseRef.current === "playing") { phaseRef.current = "start"; setPhase("start"); cancelAnimationFrame(animRef.current); }
      }
    });
    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        setGameMode("multi"); setMultiRole("host");
        gameModeRef.current = "multi"; multiRoleRef.current = "host";
        setPhase("waiting"); phaseRef.current = "waiting";
      }
    });
    channelRef.current = channel;
  }, [playerName, inviteCode, cleanupChannel]);

  const joinRoom = useCallback(() => {
    if (!playerName.trim() || !joinCode.trim()) return;
    cleanupChannel();
    const channel = supabase.channel(`volley-room-${joinCode.toUpperCase()}`, { config: { broadcast: { self: false } } });
    channel.on("broadcast", { event: "game" }, ({ payload }) => {
      if (payload.type === "host_info") { setOpponentName(payload.name); setOpponentConnected(true); }
      else if (payload.type === "state" && multiRoleRef.current === "guest") {
        const s = payload;
        playerRef.current = { ...playerRef.current, ...s.p1 };
        aiRef.current = { ...aiRef.current, ...s.p2 };
        ballRef.current = { ...ballRef.current, x: s.ball.x, y: s.ball.y, vx: s.ball.vx, vy: s.ball.vy, rotation: s.ball.rotation };
        pScoreRef.current = s.scores.p; aScoreRef.current = s.scores.a;
        setsRef.current = s.scores.sets; setNumRef.current = s.scores.setNum;
        setPlayerScore(s.scores.p); setAiScore(s.scores.a);
        setSetsWon([...s.scores.sets]); setCurrentSet(s.scores.setNum);
      } else if (payload.type === "start_game") { phaseRef.current = "playing"; setPhase("playing"); }
      else if (payload.type === "game_over") {
        phaseRef.current = "gameover"; setPhase("gameover");
        setPlayerScore(payload.scores.p); setAiScore(payload.scores.a); setSetsWon(payload.scores.sets);
      } else if (payload.type === "point") { setLastPoint(payload.msg); lastPointRef.current = payload.msg; }
      else if (payload.type === "leave") {
        setOpponentConnected(false); setOpponentName("");
        toast({ title: "Host saiu da sala", variant: "destructive" });
        phaseRef.current = "start"; setPhase("start"); cancelAnimationFrame(animRef.current);
      }
    });
    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        setGameMode("multi"); setMultiRole("guest");
        gameModeRef.current = "multi"; multiRoleRef.current = "guest";
        setPhase("waiting"); phaseRef.current = "waiting"; setShowJoin(false);
        channel.send({ type: "broadcast", event: "game", payload: { type: "join", name: playerName.trim() } });
        toast({ title: "Conectado!", description: "Aguardando o host iniciar..." });
      }
    });
    channelRef.current = channel;
  }, [playerName, joinCode, cleanupChannel]);

  // ── Ranking ──
  const fetchRanking = useCallback(async () => {
    setLoadingRanking(true);
    const { data } = await publicQuery<GameScore[]>({
      table: "game_scores",
      filters: { tournament_id: tournamentId, game_type: "volley_pong", sport },
      order: [{ column: "score", ascending: false }, { column: "created_at", ascending: true }],
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
    if (error) toast({ title: "Erro ao excluir", variant: "destructive" });
    else { toast({ title: "Excluído" }); await fetchRanking(); }
    setDeletingId(null);
  };
  const submitScore = async (finalScore: number) => {
    setSubmitting(true);
    await supabase.functions.invoke("organizer-api", {
      body: { table: "game_scores", operation: "insert", data: { tournament_id: tournamentId, game_type: "volley_pong", player_name: playerName.trim(), sport, score: finalScore } },
    });
    await fetchRanking();
    setSubmitting(false);
  };

  const countdownRef = useRef(0); // countdown frames (180 = 3s)
  const countdownTextRef = useRef<string | null>(null);
  const ballFrozenRef = useRef(true); // ball stays above player until countdown ends

  // ── Serve ──
  const serveBall = useCallback((who: "player" | "ai") => {
    rallyCountRef.current = 0;
    const p = who === "player" ? playerRef.current : aiRef.current;
    ballRef.current = {
      x: p.x, y: p.y - ALIEN_R - BALL_R - 25,
      vx: 0, vy: 0, rotation: 0,
      sizeMultiplier: 1, speedMultiplier: 1, curveActive: false,
    };
    p.touches = 0;
    effectsRef.current = [];
    // Start countdown: 180 frames ≈ 3 seconds
    countdownRef.current = 180;
    ballFrozenRef.current = true;
  }, []);

  // Actually launch the ball after countdown
  const launchBall = useCallback((who: "player" | "ai") => {
    const p = who === "player" ? playerRef.current : aiRef.current;
    ballRef.current.x = p.x;
    ballRef.current.y = p.y - ALIEN_R - BALL_R - 15;
    ballRef.current.vx = who === "player" ? SERVE_VX : -SERVE_VX;
    ballRef.current.vy = SERVE_VY;
    p.touches = 1;
    ballFrozenRef.current = false;
    playHitSound();
  }, []);

  // ── Score point ──
  const scorePoint = useCallback((scorer: "player" | "ai") => {
    const isMulti = gameModeRef.current === "multi";
    if (scorer === "player") {
      pScoreRef.current += 1; setPlayerScore(pScoreRef.current);
      coinsRef.current += 5;
      const msg = "Ponto seu! 🏐"; setLastPoint(msg); lastPointRef.current = msg;
      spawnParticles(W * 0.75, GROUND_Y - 40, 15, ["#FFD700", "#FF6B6B", "#64DD17", "#00BCD4"], true);
      if (isMulti && channelRef.current) channelRef.current.send({ type: "broadcast", event: "game", payload: { type: "point", msg } });
    } else {
      aScoreRef.current += 1; setAiScore(aScoreRef.current);
      const msg = isMulti ? `Ponto de ${opponentName || "P2"} 🏐` : "Ponto da IA 🤖"; setLastPoint(msg); lastPointRef.current = msg;
      if (isMulti && channelRef.current) channelRef.current.send({ type: "broadcast", event: "game", payload: { type: "point", msg: "Ponto do adversário 🏐" } });
    }
    pauseRef.current = 80;
    playWhistle();
    playPointSound(scorer === "player");
    playerRef.current.expression = scorer === "player" ? "excited" : "sad";
    aiRef.current.expression = scorer === "player" ? "sad" : "excited";

    const p = pScoreRef.current, a = aScoreRef.current;
    if ((p >= MAX_SCORE || a >= MAX_SCORE) && Math.abs(p - a) >= MIN_DIFF) {
      const winner = p > a ? 0 : 1;
      setsRef.current[winner] += 1; setSetsWon([...setsRef.current]);
      if (setsRef.current[winner] >= 2) {
        const finalScore = setsRef.current[0] * 100 + Math.max(0, pScoreRef.current - aScoreRef.current) + (setsRef.current[0] >= 2 ? 500 : 0);
        phaseRef.current = "gameover"; setPhase("gameover");
        submitScore(finalScore);
        if (isMulti && channelRef.current) channelRef.current.send({ type: "broadcast", event: "game", payload: { type: "game_over", scores: { p: pScoreRef.current, a: aScoreRef.current, sets: [...setsRef.current] } } });
        return;
      }
      setNumRef.current += 1; setCurrentSet(setNumRef.current);
      pScoreRef.current = 0; aScoreRef.current = 0; setPlayerScore(0); setAiScore(0);
    }
    const lastScorer = scorer;
    setTimeout(() => {
      if (phaseRef.current === "playing") {
        playerRef.current = createPlayer(W * 0.25);
        aiRef.current = createPlayer(W * 0.75);
        serveOwnerRef.current = lastScorer;
        serveBall(lastScorer);
      }
    }, 900);
  }, [serveBall, opponentName]);

  // Track who should launch the ball after countdown
  const serveOwnerRef = useRef<"player" | "ai">("player");

  // ── Ball-player collision — ALL HITS = inverted U arc ──
  const checkHit = (p: Player, ball: Ball, isLeft: boolean): boolean => {
    const cx = p.x, cy = p.y - ALIEN_R;
    const dx = ball.x - cx, dy = ball.y - cy;
    const dist = Math.sqrt(dx * dx + dy * dy);
    // HUGE hit radius — any part of body touches = hit
    const hitR = ALIEN_R + BALL_R * ball.sizeMultiplier + 18;
    const dir = isLeft ? 1 : -1;

    if (dist < hitR && p.touches < MAX_TOUCHES) {
      p.touches += 1;
      rallyCountRef.current += 1;
      energyRef.current = Math.min(1, energyRef.current + 0.15);
      const inAir = p.y < GROUND_Y - 12;
      const isSpike = inAir && p.attackCooldown <= 0;

      // ALL hits = HIGH arc that clears the net easily
      if (isSpike) {
        ball.vx = dir * 3.5 * ball.speedMultiplier;
        ball.vy = -6.0;
        p.attackCooldown = 18;
        p.expression = "determined";
        playSpikeSound();
        spawnParticles(ball.x, ball.y, 6, ["#FFD700", "#FF6B6B"], false);
      } else if (inAir) {
        ball.vx = dir * 3.0 * ball.speedMultiplier;
        ball.vy = -6.5;
        p.expression = "happy";
        playHitSound();
      } else if (p.touches === 1) {
        // MANCHETE: very high, reaches other side
        ball.vx = dir * 3.0 * ball.speedMultiplier;
        ball.vy = -7.5;
        p.expression = "surprised";
        playHitSound();
      } else {
        // LEVANTAMENTO: high controlled arc
        ball.vx = dir * 3.2 * ball.speedMultiplier;
        ball.vy = -7.0;
        p.expression = "happy";
        playHitSound();
      }

      // Curve effect
      if (ball.curveActive) ball.vx += dir * 0.8;

      // Clamp
      ball.vx = Math.max(-BALL_SPEED_CAP * ball.speedMultiplier, Math.min(BALL_SPEED_CAP * ball.speedMultiplier, ball.vx));
      ball.vy = Math.max(-BALL_VY_CAP, Math.min(BALL_VY_CAP, ball.vy));

      // Separate ball from player
      const angle = Math.atan2(dy, dx);
      ball.x = cx + (ALIEN_R + BALL_R * ball.sizeMultiplier + 4) * Math.cos(angle);
      ball.y = cy + (ALIEN_R + BALL_R * ball.sizeMultiplier + 4) * Math.sin(angle);

      return true;
    }
    return false;
  };

  // ── Broadcast state (host) ──
  const broadcastState = useCallback(() => {
    if (gameModeRef.current !== "multi" || multiRoleRef.current !== "host" || !channelRef.current) return;
    broadcastCountRef.current++;
    if (broadcastCountRef.current % 2 !== 0) return;
    const p = playerRef.current, a = aiRef.current, b = ballRef.current;
    channelRef.current.send({
      type: "broadcast", event: "game",
      payload: {
        type: "state",
        p1: { x: p.x, y: p.y, vy: p.vy, touches: p.touches, expression: p.expression, attackCooldown: p.attackCooldown, blinkTimer: p.blinkTimer },
        p2: { x: a.x, y: a.y, vy: a.vy, touches: a.touches, expression: a.expression, attackCooldown: a.attackCooldown, blinkTimer: a.blinkTimer },
        ball: { x: b.x, y: b.y, vx: b.vx, vy: b.vy, rotation: b.rotation },
        scores: { p: pScoreRef.current, a: aScoreRef.current, sets: [...setsRef.current], setNum: setNumRef.current },
        rally: rallyCountRef.current, pause: pauseRef.current,
      },
    });
  }, []);

  const sendGuestInput = useCallback(() => {
    if (gameModeRef.current !== "multi" || multiRoleRef.current !== "guest" || !channelRef.current) return;
    const keys = keysRef.current;
    let dir = touchDirRef.current;
    if (keys.has("ArrowLeft") || keys.has("a")) dir = -1;
    if (keys.has("ArrowRight") || keys.has("d")) dir = 1;
    const jump = keys.has("ArrowUp") || keys.has("w") || keys.has(" ") || touchJumpRef.current;
    const attack = keys.has("x") || keys.has("z") || touchAttackRef.current;
    if (jump) touchJumpRef.current = false;
    if (attack) touchAttackRef.current = false;
    channelRef.current.send({ type: "broadcast", event: "game", payload: { type: "input", input: { dir, jump, attack } } });
  }, []);

  // ── GAME LOOP ──
  const gameLoop = useCallback(() => {
    if (phaseRef.current !== "playing") return;
    frameRef.current++;
    const frame = frameRef.current;
    const isGuest = gameModeRef.current === "multi" && multiRoleRef.current === "guest";
    const isHostMulti = gameModeRef.current === "multi" && multiRoleRef.current === "host";

    if (isGuest) { sendGuestInput(); }

    // --- Physics (host/solo only) ---
    if (!isGuest) {
      // Countdown logic
      if (countdownRef.current > 0) {
        countdownRef.current--;
        const sec = Math.ceil(countdownRef.current / 60);
        if (sec > 0) countdownTextRef.current = String(sec);
        else countdownTextRef.current = "GO!";
        
        // Keep ball floating above server during countdown
        if (ballFrozenRef.current) {
          const server = serveOwnerRef.current === "player" ? playerRef.current : aiRef.current;
          ballRef.current.x = server.x;
          ballRef.current.y = server.y - ALIEN_R - BALL_R - 25;
          ballRef.current.vx = 0;
          ballRef.current.vy = 0;
        }
        
        // Allow player movement during countdown
        const player = playerRef.current, ai = aiRef.current;
        const keys = keysRef.current;
        let moveDir = touchDirRef.current;
        if (keys.has("ArrowLeft") || keys.has("a")) moveDir = -1;
        if (keys.has("ArrowRight") || keys.has("d")) moveDir = 1;
        player.x += moveDir * MOVE_SPEED;
        player.x = Math.max(ALIEN_R + 4, Math.min(NET_X - ALIEN_R - 4, player.x));
        
        if (countdownRef.current === 0) {
          countdownTextRef.current = null;
          launchBall(serveOwnerRef.current);
        }
        
        if (isHostMulti) broadcastState();
      }
      else if (pauseRef.current > 0) { pauseRef.current--; if (isHostMulti) broadcastState(); }
      else {
        const player = playerRef.current, ai = aiRef.current, ball = ballRef.current;
        const keys = keysRef.current;

        // Player movement
        let moveDir = touchDirRef.current;
        if (keys.has("ArrowLeft") || keys.has("a")) moveDir = -1;
        if (keys.has("ArrowRight") || keys.has("d")) moveDir = 1;
        player.x += moveDir * MOVE_SPEED;
        player.x = Math.max(ALIEN_R + 4, Math.min(NET_X - ALIEN_R - 4, player.x));

        if ((keys.has("ArrowUp") || keys.has("w") || keys.has(" ") || touchJumpRef.current) && player.y >= GROUND_Y) {
          player.vy = JUMP_VY; touchJumpRef.current = false;
          player.expression = "surprised";
        }
        if ((keys.has("x") || keys.has("z") || touchAttackRef.current) && player.attackCooldown <= 0) {
          player.attackCooldown = 12; touchAttackRef.current = false;
        }

        player.vy += GRAVITY;
        player.y += player.vy;
        if (player.y >= GROUND_Y) { player.y = GROUND_Y; player.vy = 0; }
        player.attackCooldown = Math.max(0, player.attackCooldown - 1);
        player.blinkTimer -= 1;
        if (player.blinkTimer <= 0) player.blinkTimer = 120 + Math.random() * 180;

        // AI / P2 movement
        if (isHostMulti) {
          const ri = remoteInputRef.current;
          ai.x += ri.dir * MOVE_SPEED;
          ai.x = Math.max(NET_X + ALIEN_R + 4, Math.min(W - ALIEN_R - 4, ai.x));
          if (ri.jump && ai.y >= GROUND_Y) { ai.vy = JUMP_VY; remoteInputRef.current = { ...ri, jump: false }; }
          if (ri.attack && ai.attackCooldown <= 0) { ai.attackCooldown = 12; remoteInputRef.current = { ...ri, attack: false }; }
        } else {
          // Solo AI
          const aiSpeed = AI_SPEED + Math.min(rallyCountRef.current * 0.005, 0.3);
          const predictX = () => {
            let sx = ball.x, sy = ball.y, svx = ball.vx, svy = ball.vy;
            for (let i = 0; i < 80; i++) {
              svy += GRAVITY; sx += svx; sy += svy;
              if (sx <= BALL_R) svx = Math.abs(svx) * 0.7;
              if (sx >= W - BALL_R) svx = -Math.abs(svx) * 0.7;
              if (sy + BALL_R > NET_TOP && Math.abs(sx - NET_X) < BALL_R + 5) svx = -svx * 0.5;
              if (sx > NET_X && sy >= GROUND_Y - ALIEN_R * 2 - 15) return sx;
              if (sy >= GROUND_Y) return sx;
            }
            return W * 0.72;
          };

          const ballOnAiSide = ball.x > NET_X - 15;
          const ballComing = ball.vx > 0.3;

          if (ballComing || ballOnAiSide) {
            const targetX = predictX() + (Math.random() - 0.5) * 12;
            const clamped = Math.max(NET_X + ALIEN_R + 8, Math.min(W - ALIEN_R - 4, targetX));
            const diff = clamped - ai.x;
            if (Math.abs(diff) > 3) ai.x += Math.sign(diff) * Math.min(aiSpeed, Math.abs(diff));

            const distBall = Math.sqrt((ball.x - ai.x) ** 2 + (ball.y - (ai.y - ALIEN_R)) ** 2);
            if (ai.y >= GROUND_Y && distBall < 65 && ball.y < GROUND_Y - 30 && ball.vy > -1 && Math.random() > 0.12) {
              ai.vy = JUMP_VY * 0.9;
              ai.expression = "surprised";
            }
            if (ai.y < GROUND_Y - 15 && distBall < 45 && ai.attackCooldown <= 0 && Math.random() > 0.18) {
              ai.attackCooldown = 20;
            }
          } else {
            const homeX = W * 0.72;
            const diff = homeX - ai.x;
            if (Math.abs(diff) > 3) ai.x += Math.sign(diff) * aiSpeed * 0.4;
          }
          ai.x = Math.max(NET_X + ALIEN_R + 4, Math.min(W - ALIEN_R - 4, ai.x));
        }

        ai.vy += GRAVITY;
        ai.y += ai.vy;
        if (ai.y >= GROUND_Y) { ai.y = GROUND_Y; ai.vy = 0; }
        ai.attackCooldown = Math.max(0, ai.attackCooldown - 1);
        ai.blinkTimer -= 1;
        if (ai.blinkTimer <= 0) ai.blinkTimer = 120 + Math.random() * 180;

        // Ball physics
        ball.vy += GRAVITY;
        ball.vx *= 0.998;
        ball.x += ball.vx;
        ball.y += ball.vy;
        ball.rotation += ball.vx * 0.06;

        // Curve drift
        if (ball.curveActive) ball.vx += (ball.vx > 0 ? 0.03 : -0.03);

        // Walls
        if (ball.x - BALL_R * ball.sizeMultiplier <= 0) { ball.x = BALL_R * ball.sizeMultiplier + 1; ball.vx = Math.abs(ball.vx) * 0.7; }
        if (ball.x + BALL_R * ball.sizeMultiplier >= W) { ball.x = W - BALL_R * ball.sizeMultiplier - 1; ball.vx = -Math.abs(ball.vx) * 0.7; }
        if (ball.y - BALL_R * ball.sizeMultiplier <= 0) { ball.y = BALL_R * ball.sizeMultiplier + 1; ball.vy = Math.abs(ball.vy) * 0.6; }

        // Net collision
        const br = BALL_R * ball.sizeMultiplier;
        // Ball only collides with net BELOW the top — if ball is above net, it passes freely
        if (ball.y + br > NET_TOP && ball.y > NET_TOP && ball.y - br < GROUND_Y && Math.abs(ball.x - NET_X) < br + 2) {
          if (ball.x < NET_X) ball.x = NET_X - br - 3;
          else ball.x = NET_X + br + 3;
          ball.vx = -ball.vx * 0.5;
          ball.vy *= 0.8;
        }

        // Player hits
        const playerHit = checkHit(player, ball, true);
        if (playerHit) { player.touches = Math.min(player.touches, MAX_TOUCHES); }
        const aiHit = checkHit(ai, ball, false);
        if (aiHit) { ai.touches = Math.min(ai.touches, MAX_TOUCHES); player.touches = 0; }
        if (playerHit) ai.touches = 0;

        ball.x = Math.max(BALL_R, Math.min(W - BALL_R, ball.x));

        // Ball hits ground — score point and start pause
        if (ball.y + br >= GROUND_Y && pauseRef.current <= 0 && countdownRef.current <= 0) {
          ball.y = GROUND_Y - br; ball.vy = 0; ball.vx = 0;
          spawnParticles(ball.x, GROUND_Y - 5, 8, ["#F5D98E", "#E8C860"], false);
          if (ball.x < NET_X) scorePoint("ai");
          else scorePoint("player");
          if (isHostMulti) broadcastState();
        }

        // Power-up collision
        powerUpsRef.current = powerUpsRef.current.filter(pu => {
          const d = Math.sqrt((ball.x - pu.x) ** 2 + (ball.y - pu.y) ** 2);
          if (d < 18 + br) {
            playPowerUpSound();
            spawnParticles(pu.x, pu.y, 8, ["#FFD700", "#FF6B6B", "#64DD17"], true);
            if (pu.type === "giant") ball.sizeMultiplier = 2;
            else if (pu.type === "fast") ball.speedMultiplier = 1.5;
            else if (pu.type === "curve") ball.curveActive = true;
            effectsRef.current.push({ type: pu.type, remaining: 300 });
            return false;
          }
          return true;
        });

        // Effects countdown
        effectsRef.current = effectsRef.current.filter(e => {
          e.remaining--;
          if (e.remaining <= 0) {
            if (e.type === "giant") ball.sizeMultiplier = 1;
            else if (e.type === "fast") ball.speedMultiplier = 1;
            else if (e.type === "curve") ball.curveActive = false;
            return false;
          }
          return true;
        });

        // Spawn power-ups randomly
        if (frame % 600 === 300 && powerUpsRef.current.length < 1 && rallyCountRef.current > 3) {
          const types: PowerUpType[] = ["giant", "fast", "curve"];
          powerUpsRef.current.push({
            x: NET_X + (Math.random() - 0.5) * 80,
            y: NET_TOP - 20 - Math.random() * 40,
            type: types[Math.floor(Math.random() * types.length)],
            timer: 600, floatPhase: Math.random() * Math.PI * 2,
          });
        }
        // Decay power-ups
        powerUpsRef.current = powerUpsRef.current.filter(pu => { pu.timer--; return pu.timer > 0; });

        // Expression decay
        if (frame % 60 === 0) { player.expression = "happy"; ai.expression = "happy"; }
        // Energy decay
        energyRef.current = Math.max(0, energyRef.current - 0.001);

        if (isHostMulti) broadcastState();
      }
    }

    // Update particles
    particlesRef.current = particlesRef.current.filter(p => {
      p.x += p.vx; p.y += p.vy; p.vy += 0.12; p.life -= 0.025;
      return p.life > 0;
    });

    // ── RENDER ──
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");

    if (canvas && ctx) {
      ctx.clearRect(0, 0, W, H);
      drawBackground(ctx, frame);
      drawNet(ctx);

      // Power-ups
      for (const pu of powerUpsRef.current) drawPowerUp(ctx, pu, frame);

      // Players
      const p2 = playerRef.current, a2 = aiRef.current;
      drawAlien(ctx, p2.x, p2.y, "#64DD17", "#388E3C", true, p2.expression, p2.blinkTimer < 8, frame);
      drawAlien(ctx, a2.x, a2.y, "#CE93D8", "#7B1FA2", false, a2.expression, a2.blinkTimer < 8, frame);

      // Ball
      drawBall(ctx, ballRef.current);

      // Particles
      drawParticles(ctx, particlesRef.current);

      // HUD
      drawHUD(ctx, pScoreRef.current, aScoreRef.current, setsRef.current, setNumRef.current, energyRef.current, coinsRef.current, frame);

      // Countdown overlay
      if (countdownRef.current > 0 && countdownTextRef.current) {
        ctx.fillStyle = "rgba(0,0,0,0.35)";
        ctx.fillRect(0, 0, W, H);
        ctx.font = "bold 52px sans-serif";
        ctx.fillStyle = "#FFFFFF";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.strokeStyle = "rgba(0,0,0,0.5)";
        ctx.lineWidth = 3;
        ctx.strokeText(countdownTextRef.current, W / 2, H * 0.4);
        ctx.fillText(countdownTextRef.current, W / 2, H * 0.4);
        // Sub-text
        ctx.font = "bold 12px sans-serif";
        ctx.fillStyle = "rgba(255,255,255,0.7)";
        ctx.fillText("Prepare-se!", W / 2, H * 0.4 + 35);
      }

      // Pause overlay
      if (pauseRef.current > 0) {
        const pointText = lastPointRef.current;
        if (pointText) {
          ctx.fillStyle = "rgba(0,0,0,0.3)";
          ctx.fillRect(0, H * 0.35, W, 40);
          ctx.font = "bold 16px sans-serif";
          ctx.fillStyle = "#FFFFFF";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(pointText, W / 2, H * 0.35 + 20);
        }
      }
    }

    animRef.current = requestAnimationFrame(gameLoop);
  }, [scorePoint, broadcastState, sendGuestInput, launchBall]);

  // Start render loop
  useEffect(() => {
    if (phase !== "playing") return;
    if (multiRoleRef.current !== "guest") {
      serveOwnerRef.current = "player";
      serveBall("player");
    }
    animRef.current = requestAnimationFrame(gameLoop);
    return () => cancelAnimationFrame(animRef.current);
  }, [phase, serveBall, gameLoop]);

  // Keyboard
  useEffect(() => {
    if (phase !== "playing") return;
    const onDown = (e: KeyboardEvent) => keysRef.current.add(e.key);
    const onUp = (e: KeyboardEvent) => keysRef.current.delete(e.key);
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    return () => { window.removeEventListener("keydown", onDown); window.removeEventListener("keyup", onUp); keysRef.current.clear(); };
  }, [phase]);

  const startGame = (mode: GameMode = "solo") => {
    if (!playerName.trim()) return;
    pScoreRef.current = 0; aScoreRef.current = 0;
    setsRef.current = [0, 0]; setNumRef.current = 1;
    rallyCountRef.current = 0; pauseRef.current = 0;
    frameRef.current = 0; broadcastCountRef.current = 0;
    energyRef.current = 0; coinsRef.current = 0;
    particlesRef.current = []; powerUpsRef.current = []; effectsRef.current = [];
    playerRef.current = createPlayer(W * 0.25);
    aiRef.current = createPlayer(W * 0.75);
    ballRef.current = createBall(W * 0.25, GROUND_Y - 80);
    setPlayerScore(0); setAiScore(0); setSetsWon([0, 0]); setCurrentSet(1); setLastPoint(null); lastPointRef.current = null;
    if (mode === "solo") { gameModeRef.current = "solo"; multiRoleRef.current = null; setGameMode("solo"); setMultiRole(null); }
    phaseRef.current = "playing"; setPhase("playing");
    if (gameModeRef.current === "multi" && multiRoleRef.current === "host" && channelRef.current) {
      channelRef.current.send({ type: "broadcast", event: "game", payload: { type: "start_game" } });
    }
  };

  const resetGame = () => {
    cancelAnimationFrame(animRef.current);
    cleanupChannel();
    gameModeRef.current = "solo"; multiRoleRef.current = null;
    setGameMode("solo"); setMultiRole(null);
    setOpponentName(""); setOpponentConnected(false);
    phaseRef.current = "start"; setPhase("start");
    setPlayerScore(0); setAiScore(0); setSetsWon([0, 0]); setCurrentSet(1);
    setLastPoint(null); lastPointRef.current = null; setShowInvite(false); setShowJoin(false);
  };

  useEffect(() => () => { cancelAnimationFrame(animRef.current); cleanupChannel(); }, [cleanupChannel]);

  const matchWinner = setsWon[0] >= 2 ? "player" : setsWon[1] >= 2 ? "ai" : null;

  return (
    <div className="space-y-6">
      {/* RANKING */}
      <section className="rounded-xl border border-border bg-card p-4 sm:p-6 shadow-card">
        <h3 className="text-lg font-semibold flex items-center gap-2 mb-3">
          <Medal className="h-5 w-5 text-primary" /> Ranking Vôlei Arena
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
              <div key={r.id} className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm ${
                i === 0 ? "bg-primary/15 border border-primary/30 font-bold"
                : i === 1 ? "bg-primary/10 border border-primary/20"
                : i === 2 ? "bg-primary/5 border border-primary/10"
                : "bg-secondary/50 border border-border"
              }`}>
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-muted text-xs font-bold text-muted-foreground shrink-0">
                  {i < 3 ? ["🥇", "🥈", "🥉"][i] : i + 1}
                </span>
                <span className="flex-1 truncate">{r.player_name}</span>
                <span className="font-mono font-bold text-primary">{r.score} pts</span>
                {isAdmin && (
                  <button onClick={() => deleteScore(r.id, r.player_name)} disabled={deletingId === r.id}
                    className="ml-1 p-1 rounded hover:bg-destructive/15 text-muted-foreground hover:text-destructive transition-colors shrink-0 disabled:opacity-50">
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
          <motion.div className="inline-flex items-center gap-2 rounded-full bg-primary/15 border border-primary/30 px-4 py-1.5"
            animate={{ scale: [1, 1.03, 1] }} transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}>
            <span className="text-lg">🏐</span>
            <span className="text-xs font-bold text-primary uppercase tracking-wider">Vôlei Arena</span>
          </motion.div>
        </div>

        <AnimatePresence mode="wait">
          {phase === "start" && (
            <motion.div key="start" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-4 text-center">
              <div className="text-5xl">👾</div>
              <h3 className="text-xl font-bold">Vôlei Arena</h3>
              <p className="text-sm text-muted-foreground max-w-xs mx-auto">
                Jogue contra a IA ou convide um amigo para jogar online!
              </p>
              <div className="text-xs text-muted-foreground max-w-xs mx-auto space-y-1">
                <p>🖥️ <strong>Teclado:</strong> ← → mover | ↑ pular | X atacar</p>
                <p>📱 <strong>Toque:</strong> Botões na tela</p>
              </div>
              <input type="text" placeholder="Digite seu nome" value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && startGame("solo")}
                className="w-full max-w-xs mx-auto rounded-lg border border-border bg-background px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 block"
                maxLength={30} />
              <div className="flex gap-2 justify-center flex-wrap">
                <Button onClick={() => startGame("solo")} disabled={!playerName.trim()} className="gap-2">
                  <Zap className="h-4 w-4" /> Jogar vs IA
                </Button>
              </div>
              <div className="flex gap-2 justify-center flex-wrap pt-2">
                <Button variant="outline" size="sm" onClick={() => {
                  if (!playerName.trim()) { toast({ title: "Digite seu nome primeiro" }); return; }
                  setShowJoin(false);
                  if (showInvite) setShowInvite(false);
                  else { createRoom(); setShowInvite(true); }
                }} className="gap-1.5 text-xs">
                  <UserPlus className="h-3.5 w-3.5" /> Criar sala
                </Button>
                <Button variant="outline" size="sm" onClick={() => { setShowJoin(!showJoin); setShowInvite(false); }} className="gap-1.5 text-xs">
                  <LogIn className="h-3.5 w-3.5" /> Entrar com código
                </Button>
              </div>
              <AnimatePresence>
                {showInvite && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                    <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 max-w-xs mx-auto space-y-2">
                      <p className="text-xs text-muted-foreground">Compartilhe este código com seu amigo:</p>
                      <div className="flex items-center gap-2 justify-center">
                        <span className="font-mono text-lg font-bold tracking-[0.3em] text-primary bg-background px-3 py-1 rounded border border-border">{inviteCode}</span>
                        <Button variant="ghost" size="sm" onClick={copyInviteCode} className="h-8 w-8 p-0"><Copy className="h-4 w-4" /></Button>
                      </div>
                    </div>
                  </motion.div>
                )}
                {showJoin && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                    <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 max-w-xs mx-auto space-y-2">
                      <p className="text-xs text-muted-foreground">Digite o código da sala:</p>
                      <div className="flex items-center gap-2 justify-center">
                        <Input value={joinCode} onChange={(e) => setJoinCode(e.target.value.toUpperCase())} placeholder="EX: A1B2C3" maxLength={6} className="max-w-[140px] text-center font-mono tracking-wider uppercase" />
                        <Button size="sm" onClick={joinRoom} disabled={joinCode.length < 4 || !playerName.trim()}>Entrar</Button>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )}

          {phase === "waiting" && (
            <motion.div key="waiting" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-4 text-center">
              <div className="text-5xl">👾</div>
              <h3 className="text-xl font-bold">Sala Multiplayer</h3>
              {multiRole === "host" && (
                <>
                  <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 max-w-xs mx-auto space-y-3">
                    <p className="text-xs text-muted-foreground">Código da sala:</p>
                    <div className="flex items-center gap-2 justify-center">
                      <span className="font-mono text-2xl font-bold tracking-[0.3em] text-primary">{inviteCode}</span>
                      <Button variant="ghost" size="sm" onClick={copyInviteCode} className="h-8 w-8 p-0"><Copy className="h-4 w-4" /></Button>
                    </div>
                  </div>
                  <div className="flex items-center justify-center gap-2 text-sm">
                    {opponentConnected ? (
                      <><Wifi className="h-4 w-4 text-emerald-500" /><span className="text-emerald-500 font-semibold">{opponentName} conectado!</span></>
                    ) : (
                      <><div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" /><span className="text-muted-foreground">Aguardando jogador...</span></>
                    )}
                  </div>
                  <div className="flex gap-2 justify-center">
                    <Button onClick={() => startGame("multi")} disabled={!opponentConnected} className="gap-2"><Zap className="h-4 w-4" /> Começar partida!</Button>
                    <Button variant="ghost" onClick={resetGame}>Cancelar</Button>
                  </div>
                </>
              )}
              {multiRole === "guest" && (
                <>
                  <div className="flex items-center justify-center gap-2 text-sm">
                    {opponentConnected ? (
                      <><Wifi className="h-4 w-4 text-emerald-500" /><span className="text-emerald-500 font-semibold">Conectado! Host: {opponentName}</span></>
                    ) : (
                      <><div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" /><span className="text-muted-foreground">Conectando à sala...</span></>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">Aguardando o host iniciar a partida...</p>
                  <p className="text-xs text-muted-foreground font-medium">Você controla o alien <span className="text-purple-400">roxo</span> (direita)</p>
                  <Button variant="ghost" onClick={resetGame}>Cancelar</Button>
                </>
              )}
            </motion.div>
          )}

          {phase === "playing" && (
            <motion.div key="playing" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 bg-black flex flex-col">
              {/* Top bar */}
              <div className="w-full flex items-center justify-between px-3 py-1.5 bg-black/80 shrink-0">
                <Button variant="ghost" size="sm" onClick={resetGame} className="text-white/70 text-xs h-7 px-2">← Sair</Button>
                <div className="flex items-center gap-2">
                  {lastPoint && (
                    <motion.p key={lastPoint + pScoreRef.current + aScoreRef.current} initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} className="text-xs font-bold text-yellow-400">{lastPoint}</motion.p>
                  )}
                  {gameMode === "multi" && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                      <Wifi className="h-3 w-3 inline mr-0.5" /> ONLINE
                    </span>
                  )}
                </div>
                <span className="text-white/50 text-[10px]">Set {currentSet}</span>
              </div>

              {/* Canvas */}
              <div className="flex-1 w-full min-h-0 relative flex items-center justify-center bg-[#87CEEB]">
                <canvas ref={canvasRef} width={W} height={H}
                  className="max-w-full max-h-full" style={{ imageRendering: "auto", aspectRatio: `${W}/${H}` }} />
              </div>

              {/* Touch controls */}
              <div className="w-full px-2 pb-3 pt-1.5 bg-black/70 shrink-0">
                <div className="flex items-end justify-between max-w-lg mx-auto">
                  <div className="flex gap-2">
                    <button
                      onTouchStart={(e) => { e.preventDefault(); touchDirRef.current = -1; }}
                      onTouchEnd={(e) => { e.preventDefault(); touchDirRef.current = 0; }}
                      onTouchCancel={() => touchDirRef.current = 0}
                      onMouseDown={() => touchDirRef.current = -1}
                      onMouseUp={() => touchDirRef.current = 0}
                      onMouseLeave={() => touchDirRef.current = 0}
                      className="w-16 h-16 rounded-2xl bg-white/12 border border-white/25 text-white text-2xl font-bold active:bg-white/30 active:scale-95 transition-all select-none touch-none flex items-center justify-center">◀</button>
                    <button
                      onTouchStart={(e) => { e.preventDefault(); touchDirRef.current = 1; }}
                      onTouchEnd={(e) => { e.preventDefault(); touchDirRef.current = 0; }}
                      onTouchCancel={() => touchDirRef.current = 0}
                      onMouseDown={() => touchDirRef.current = 1}
                      onMouseUp={() => touchDirRef.current = 0}
                      onMouseLeave={() => touchDirRef.current = 0}
                      className="w-16 h-16 rounded-2xl bg-white/12 border border-white/25 text-white text-2xl font-bold active:bg-white/30 active:scale-95 transition-all select-none touch-none flex items-center justify-center">▶</button>
                  </div>
                  <div className="flex gap-2 items-end">
                    <button
                      onTouchStart={(e) => { e.preventDefault(); touchJumpRef.current = true; }}
                      onTouchEnd={(e) => { e.preventDefault(); }}
                      onMouseDown={() => { touchJumpRef.current = true; }}
                      className="w-[72px] h-[72px] rounded-full bg-blue-500/25 border-2 border-blue-400/50 text-white font-bold active:bg-blue-500/50 active:scale-95 transition-all select-none touch-none flex flex-col items-center justify-center">
                      <span className="text-2xl">⬆</span>
                      <span className="text-[10px] opacity-70 -mt-0.5">PULAR</span>
                    </button>
                    <button
                      onTouchStart={(e) => { e.preventDefault(); touchAttackRef.current = true; }}
                      onTouchEnd={(e) => { e.preventDefault(); }}
                      onMouseDown={() => { touchAttackRef.current = true; }}
                      className="w-[72px] h-[72px] rounded-full bg-red-500/25 border-2 border-red-400/50 text-white font-bold active:bg-red-500/50 active:scale-95 transition-all select-none touch-none flex flex-col items-center justify-center">
                      <span className="text-2xl">👊</span>
                      <span className="text-[10px] opacity-70 -mt-0.5">CORTE</span>
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {phase === "gameover" && (
            <motion.div key="gameover" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} className="space-y-4 text-center">
              <div className="text-4xl">{matchWinner === "player" ? "🏆" : "😤"}</div>
              <h3 className="text-2xl font-bold">{matchWinner === "player" ? "Vitória!" : "Derrota!"}</h3>
              <p className="text-sm text-muted-foreground">
                Sets: {setsWon[0]} x {setsWon[1]}
                {gameMode === "multi" && opponentName && ` • vs ${opponentName}`}
              </p>
              <p className="text-xs text-muted-foreground">🪙 Moedas ganhas: {coinsRef.current}</p>
              {submitting && <p className="text-xs text-muted-foreground">Salvando pontuação...</p>}
              <div className="flex gap-3 justify-center">
                <Button onClick={() => startGame(gameMode)} className="gap-2"><RotateCcw className="h-4 w-4" /> Jogar de novo</Button>
                <Button variant="ghost" onClick={resetGame}>Voltar</Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </section>
    </div>
  );
};

export default VolleyPongGame;
