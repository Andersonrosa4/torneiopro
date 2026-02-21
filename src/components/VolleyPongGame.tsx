import { useState, useEffect, useCallback, useRef } from "react";
import { publicQuery } from "@/lib/organizerApi";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "framer-motion";
import { Medal, Zap, RotateCcw, Trash2, Copy, UserPlus, LogIn, Wifi, WifiOff } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";

interface GameScore {
  id: string;
  player_name: string;
  score: number;
  created_at: string;
}

// ── Canvas & physics ──
const W = 480;
const H = 360;
const GROUND_Y = H - 50;
const NET_X = W / 2;
const NET_H = 100;
const NET_TOP = GROUND_Y - NET_H;
const BALL_R = 10;
const GRAVITY = 0.22;
const MAX_TOUCHES = 3;
const SERVE_VX = 3;
const SERVE_VY = -6;
const MAX_SCORE = 15;
const MIN_DIFF = 2;

// Player body
const P_W = 22;
const P_H = 52;
const HEAD_R = 9;
const JUMP_VY = -7.2;
const MOVE_SPEED = 3.2;
const AI_SPEED = 2.8;
const ATTACK_BOOST = 2.5;

type Phase = "start" | "waiting" | "playing" | "gameover";
type GameMode = "solo" | "multi";
type MultiRole = "host" | "guest" | null;

interface Player {
  x: number;
  y: number;
  vy: number;
  armAngle: number;
  touches: number;
  isAttacking: boolean;
  attackCooldown: number;
  legPhase: number;
}

interface Ball {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rotation: number;
  trail: { x: number; y: number; alpha: number }[];
}

const createPlayer = (x: number): Player => ({
  x, y: GROUND_Y, vy: 0, armAngle: 0, touches: 0,
  isAttacking: false, attackCooldown: 0, legPhase: 0,
});

const createBall = (x: number, y: number): Ball => ({
  x, y, vx: 0, vy: 0, rotation: 0, trail: [],
});

// ── Draw helpers ──

const drawSky = (ctx: CanvasRenderingContext2D) => {
  const sky = ctx.createLinearGradient(0, 0, 0, GROUND_Y);
  sky.addColorStop(0, "#0f2b4a");
  sky.addColorStop(0.3, "#1a4570");
  sky.addColorStop(0.6, "#2a6a9e");
  sky.addColorStop(1, "#4a9dd4");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, GROUND_Y);

  // Clouds
  ctx.fillStyle = "rgba(255,255,255,0.06)";
  ctx.beginPath();
  ctx.ellipse(80, 40, 50, 15, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(350, 55, 40, 12, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(220, 30, 35, 10, 0, 0, Math.PI * 2);
  ctx.fill();
};

const drawCourt = (ctx: CanvasRenderingContext2D) => {
  drawSky(ctx);

  // Sand with texture
  const sand = ctx.createLinearGradient(0, GROUND_Y, 0, H);
  sand.addColorStop(0, "#d4a96a");
  sand.addColorStop(0.15, "#c89e5f");
  sand.addColorStop(0.5, "#b88d4f");
  sand.addColorStop(1, "#a07940");
  ctx.fillStyle = sand;
  ctx.fillRect(0, GROUND_Y, W, H - GROUND_Y);

  // Sand grain texture
  ctx.fillStyle = "rgba(0,0,0,0.03)";
  for (let i = 0; i < 100; i++) {
    const sx = (i * 47 + 13) % W;
    const sy = GROUND_Y + 3 + ((i * 29) % (H - GROUND_Y - 6));
    ctx.beginPath();
    ctx.arc(sx, sy, 0.8 + (i % 3) * 0.3, 0, Math.PI * 2);
    ctx.fill();
  }
  // Light sand highlights
  ctx.fillStyle = "rgba(255,255,200,0.04)";
  for (let i = 0; i < 30; i++) {
    const sx = (i * 71 + 5) % W;
    const sy = GROUND_Y + 5 + ((i * 37) % (H - GROUND_Y - 10));
    ctx.beginPath();
    ctx.arc(sx, sy, 1.5, 0, Math.PI * 2);
    ctx.fill();
  }

  // Court boundary lines (white tape in sand)
  ctx.strokeStyle = "rgba(255,255,255,0.5)";
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(20, GROUND_Y + 1);
  ctx.lineTo(W - 20, GROUND_Y + 1);
  ctx.stroke();

  // Side lines
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(20, GROUND_Y);
  ctx.lineTo(20, H - 8);
  ctx.moveTo(W - 20, GROUND_Y);
  ctx.lineTo(W - 20, H - 8);
  ctx.stroke();

  // Bottom line
  ctx.beginPath();
  ctx.moveTo(20, H - 8);
  ctx.lineTo(W - 20, H - 8);
  ctx.stroke();
};

const drawNet = (ctx: CanvasRenderingContext2D) => {
  // Post shadow
  ctx.fillStyle = "rgba(0,0,0,0.1)";
  ctx.fillRect(NET_X + 2, NET_TOP - 8, 5, NET_H + 10);

  // Post (metallic gradient)
  const postGrad = ctx.createLinearGradient(NET_X - 3, 0, NET_X + 3, 0);
  postGrad.addColorStop(0, "#999");
  postGrad.addColorStop(0.3, "#ddd");
  postGrad.addColorStop(0.7, "#bbb");
  postGrad.addColorStop(1, "#888");
  ctx.fillStyle = postGrad;
  ctx.fillRect(NET_X - 3, NET_TOP - 10, 6, NET_H + 12);

  // Post cap (sphere)
  const capGrad = ctx.createRadialGradient(NET_X - 1, NET_TOP - 12, 1, NET_X, NET_TOP - 10, 6);
  capGrad.addColorStop(0, "#eee");
  capGrad.addColorStop(1, "#888");
  ctx.fillStyle = capGrad;
  ctx.beginPath();
  ctx.arc(NET_X, NET_TOP - 10, 6, 0, Math.PI * 2);
  ctx.fill();

  // Net mesh
  const meshSpacingH = 10;
  const meshSpacingV = 10;
  ctx.strokeStyle = "rgba(255,255,255,0.18)";
  ctx.lineWidth = 0.6;

  // Horizontal ropes
  for (let y = NET_TOP; y <= GROUND_Y; y += meshSpacingH) {
    ctx.beginPath();
    const sag = Math.sin(((y - NET_TOP) / (GROUND_Y - NET_TOP)) * Math.PI) * 3;
    ctx.moveTo(NET_X - 20, y);
    ctx.quadraticCurveTo(NET_X, y + sag, NET_X + 20, y);
    ctx.stroke();
  }
  // Vertical ropes
  for (let x = NET_X - 18; x <= NET_X + 18; x += meshSpacingV) {
    ctx.beginPath();
    ctx.moveTo(x, NET_TOP);
    ctx.lineTo(x, GROUND_Y);
    ctx.stroke();
  }

  // Top tape (white band)
  const tapeGrad = ctx.createLinearGradient(0, NET_TOP - 4, 0, NET_TOP + 4);
  tapeGrad.addColorStop(0, "rgba(255,255,255,0.9)");
  tapeGrad.addColorStop(1, "rgba(220,220,220,0.8)");
  ctx.fillStyle = tapeGrad;
  ctx.beginPath();
  ctx.roundRect(NET_X - 22, NET_TOP - 4, 44, 7, 2);
  ctx.fill();

  // Antenna markers (red/white stripes)
  for (let i = 0; i < 4; i++) {
    ctx.fillStyle = i % 2 === 0 ? "#e63946" : "#ffffff";
    ctx.fillRect(NET_X - 22, NET_TOP - 4 - (i + 1) * 6, 2.5, 6);
    ctx.fillRect(NET_X + 20, NET_TOP - 4 - (i + 1) * 6, 2.5, 6);
  }
};

const drawPlayer = (
  ctx: CanvasRenderingContext2D,
  p: Player,
  faceRight: boolean,
  shirtColor: string,
  shortColor: string,
  skinTone: string,
  hairColor: string,
  number: string,
) => {
  const dir = faceRight ? 1 : -1;
  const feetY = p.y;
  const hipY = feetY - 18;
  const shoulderY = feetY - P_H + HEAD_R + 4;
  const headY = feetY - P_H - HEAD_R + 4;
  const isJumping = p.y < GROUND_Y;
  const isMoving = Math.abs(p.legPhase) > 0.1;

  // Dynamic shadow on ground (smaller when jumping)
  const shadowScale = isJumping ? Math.max(0.3, 1 - (GROUND_Y - p.y) / 150) : 1;
  ctx.fillStyle = `rgba(0,0,0,${0.15 * shadowScale})`;
  ctx.beginPath();
  ctx.ellipse(p.x, GROUND_Y + 3, 14 * shadowScale, 4 * shadowScale, 0, 0, Math.PI * 2);
  ctx.fill();

  // Legs with running animation
  ctx.strokeStyle = skinTone;
  ctx.lineWidth = 3.5;
  ctx.lineCap = "round";

  const legAnim = isMoving && !isJumping ? Math.sin(p.legPhase) * 8 : 0;
  const jumpSpread = isJumping ? 10 : 6;

  // Left leg
  const lFootX = p.x - jumpSpread + legAnim;
  const lKneeX = p.x - 4 + legAnim * 0.3;
  const lKneeY = hipY + (hipY < feetY ? (feetY - hipY) * 0.55 : 0);
  ctx.beginPath();
  ctx.moveTo(lFootX, feetY);
  ctx.quadraticCurveTo(lKneeX, lKneeY, p.x - 2, hipY);
  ctx.stroke();

  // Right leg
  const rFootX = p.x + jumpSpread - legAnim;
  const rKneeX = p.x + 4 - legAnim * 0.3;
  ctx.beginPath();
  ctx.moveTo(rFootX, feetY);
  ctx.quadraticCurveTo(rKneeX, lKneeY, p.x + 2, hipY);
  ctx.stroke();

  // Shoes
  ctx.fillStyle = "#1a1a2e";
  ctx.beginPath();
  ctx.ellipse(lFootX, feetY + 1, 5, 2.5, dir * 0.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(rFootX, feetY + 1, 5, 2.5, dir * 0.2, 0, Math.PI * 2);
  ctx.fill();

  // Shorts
  ctx.fillStyle = shortColor;
  ctx.beginPath();
  ctx.roundRect(p.x - 9, hipY - 3, 18, 12, 4);
  ctx.fill();
  // Shorts stripe
  ctx.fillStyle = "rgba(255,255,255,0.15)";
  ctx.fillRect(p.x - 9 + (faceRight ? 14 : 0), hipY - 1, 3, 10);

  // Torso (shirt with gradient)
  const shirtGrad = ctx.createLinearGradient(p.x - 10, shoulderY, p.x + 10, hipY);
  shirtGrad.addColorStop(0, shirtColor);
  shirtGrad.addColorStop(1, adjustColor(shirtColor, -20));
  ctx.fillStyle = shirtGrad;
  ctx.beginPath();
  ctx.roundRect(p.x - 10, shoulderY, 20, hipY - shoulderY + 2, 4);
  ctx.fill();

  // Shirt number
  ctx.fillStyle = "rgba(255,255,255,0.7)";
  ctx.font = "bold 10px 'Segoe UI', system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(number, p.x, shoulderY + 16);

  // Collar
  ctx.strokeStyle = "rgba(255,255,255,0.3)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(p.x, shoulderY + 2, 5, Math.PI * 0.1, Math.PI * 0.9);
  ctx.stroke();

  // Arms
  ctx.strokeStyle = skinTone;
  ctx.lineWidth = 3.5;
  ctx.lineCap = "round";
  const armBaseY = shoulderY + 6;

  if (p.isAttacking || p.armAngle > 0.3) {
    // ATTACK ARM - raised high and swinging
    const attackProgress = p.armAngle;
    const swingAngle = -Math.PI * 0.4 - attackProgress * Math.PI * 0.5;
    const armLen = 20;
    const elbowX = p.x + dir * 8;
    const elbowY = armBaseY - 6;
    const handX = elbowX + Math.cos(swingAngle) * armLen * dir;
    const handY = elbowY + Math.sin(swingAngle) * armLen;

    // Upper arm
    ctx.beginPath();
    ctx.moveTo(p.x + dir * 8, armBaseY);
    ctx.lineTo(elbowX, elbowY);
    ctx.stroke();
    // Forearm
    ctx.beginPath();
    ctx.moveTo(elbowX, elbowY);
    ctx.lineTo(handX, handY);
    ctx.stroke();

    // Fist (closed hand)
    ctx.fillStyle = skinTone;
    ctx.beginPath();
    ctx.arc(handX, handY, 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = adjustColor(skinTone, -30);
    ctx.lineWidth = 1;
    ctx.stroke();

    // Motion lines for attack
    if (attackProgress > 0.5) {
      ctx.strokeStyle = "rgba(255,255,255,0.3)";
      ctx.lineWidth = 1;
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.moveTo(handX - dir * (8 + i * 5), handY - 3 + i * 3);
        ctx.lineTo(handX - dir * (14 + i * 5), handY - 1 + i * 3);
        ctx.stroke();
      }
    }
  } else {
    // Relaxed arms - ready position (forearms forward like a volleyball player)
    // Front arm
    ctx.beginPath();
    ctx.moveTo(p.x + dir * 8, armBaseY);
    ctx.quadraticCurveTo(p.x + dir * 14, armBaseY + 4, p.x + dir * 16, armBaseY + 12);
    ctx.stroke();
    // Back arm
    ctx.beginPath();
    ctx.moveTo(p.x - dir * 7, armBaseY);
    ctx.quadraticCurveTo(p.x - dir * 10, armBaseY + 6, p.x - dir * 8, armBaseY + 14);
    ctx.stroke();
  }

  // Neck
  ctx.strokeStyle = skinTone;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(p.x, shoulderY);
  ctx.lineTo(p.x, headY + HEAD_R);
  ctx.stroke();

  // Head
  const headGrad = ctx.createRadialGradient(p.x - 1, headY - 2, 1, p.x, headY, HEAD_R);
  headGrad.addColorStop(0, lightenColor(skinTone, 10));
  headGrad.addColorStop(1, skinTone);
  ctx.fillStyle = headGrad;
  ctx.beginPath();
  ctx.arc(p.x, headY, HEAD_R, 0, Math.PI * 2);
  ctx.fill();

  // Hair
  ctx.fillStyle = hairColor;
  ctx.beginPath();
  ctx.arc(p.x, headY - 1, HEAD_R + 0.5, Math.PI * 1.1, Math.PI * 1.9, false);
  ctx.arc(p.x, headY - 3, HEAD_R - 1, Math.PI * 1.9, Math.PI * 1.1, true);
  ctx.fill();

  // Eyes
  ctx.fillStyle = "#1a1a1a";
  const eyeX = p.x + dir * 3.5;
  ctx.beginPath();
  ctx.ellipse(eyeX, headY - 1, 1.8, 2, 0, 0, Math.PI * 2);
  ctx.fill();
  // Eye highlight
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.arc(eyeX + 0.5, headY - 2, 0.7, 0, Math.PI * 2);
  ctx.fill();

  // Eyebrow
  ctx.strokeStyle = hairColor;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(eyeX - 3, headY - 4);
  ctx.lineTo(eyeX + 2, headY - 4.5);
  ctx.stroke();

  // Mouth
  ctx.strokeStyle = adjustColor(skinTone, -40);
  ctx.lineWidth = 1;
  ctx.beginPath();
  if (p.isAttacking) {
    // Open mouth when attacking
    ctx.arc(p.x + dir * 2, headY + 3, 2, 0, Math.PI);
  } else {
    ctx.moveTo(p.x + dir * 1, headY + 3);
    ctx.lineTo(p.x + dir * 4, headY + 2.5);
  }
  ctx.stroke();

  // Sweatband
  ctx.strokeStyle = "rgba(255,255,255,0.6)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(p.x, headY, HEAD_R + 0.5, Math.PI * 0.85, Math.PI * 0.15, true);
  ctx.stroke();
};

const drawBall = (ctx: CanvasRenderingContext2D, ball: Ball) => {
  // Trail
  for (const t of ball.trail) {
    ctx.fillStyle = `rgba(255,255,230,${t.alpha * 0.3})`;
    ctx.beginPath();
    ctx.arc(t.x, t.y, BALL_R * t.alpha * 0.6, 0, Math.PI * 2);
    ctx.fill();
  }

  // Dynamic shadow
  const shadowDist = Math.max(0, GROUND_Y - ball.y);
  const shadowScale = Math.max(0.2, 1 - shadowDist / 250);
  ctx.fillStyle = `rgba(0,0,0,${0.12 * shadowScale})`;
  ctx.beginPath();
  ctx.ellipse(ball.x + shadowDist * 0.05, GROUND_Y + 3, 10 * shadowScale, 3 * shadowScale, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.save();
  ctx.translate(ball.x, ball.y);
  ctx.rotate(ball.rotation);

  // Ball body with gradient
  const g = ctx.createRadialGradient(-2, -3, 1, 0, 0, BALL_R);
  g.addColorStop(0, "#fffef5");
  g.addColorStop(0.3, "#f8f3e0");
  g.addColorStop(0.7, "#e8dcc0");
  g.addColorStop(1, "#d5c8a5");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, BALL_R, 0, Math.PI * 2);
  ctx.fill();

  // Volleyball panel lines
  ctx.strokeStyle = "rgba(0,0,0,0.2)";
  ctx.lineWidth = 1.2;

  // Three curved seams
  ctx.beginPath();
  ctx.arc(0, 0, BALL_R * 0.8, -1.3, 1.3);
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(0, 0, BALL_R * 0.8, Math.PI / 2 - 1.1, Math.PI / 2 + 1.1);
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(3, -2, BALL_R * 0.55, -2.2, -0.3);
  ctx.stroke();

  // Color panels (Mikasa-style blue/yellow)
  ctx.fillStyle = "rgba(59,130,246,0.12)";
  ctx.beginPath();
  ctx.arc(-3, -2, BALL_R * 0.4, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "rgba(234,179,8,0.1)";
  ctx.beginPath();
  ctx.arc(4, 3, BALL_R * 0.35, 0, Math.PI * 2);
  ctx.fill();

  // Shine highlight
  ctx.fillStyle = "rgba(255,255,255,0.55)";
  ctx.beginPath();
  ctx.ellipse(-3, -4, 3.5, 2, -0.3, 0, Math.PI * 2);
  ctx.fill();

  // Outline
  ctx.strokeStyle = "rgba(0,0,0,0.15)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(0, 0, BALL_R, 0, Math.PI * 2);
  ctx.stroke();

  ctx.restore();
};

const drawHUD = (
  ctx: CanvasRenderingContext2D,
  pScore: number, aScore: number,
  setNum: number, sets: number[],
  pTouches: number, aTouches: number,
  rallyCount: number,
) => {
  // Scoreboard background
  ctx.fillStyle = "rgba(0,0,0,0.5)";
  ctx.beginPath();
  ctx.roundRect(W / 2 - 80, 6, 160, 40, 8);
  ctx.fill();

  // Backdrop glow
  ctx.fillStyle = "rgba(255,255,255,0.03)";
  ctx.beginPath();
  ctx.roundRect(W / 2 - 82, 4, 164, 44, 10);
  ctx.fill();

  // Player score
  ctx.fillStyle = "#3b82f6";
  ctx.font = "bold 22px 'Segoe UI', system-ui";
  ctx.textAlign = "right";
  ctx.fillText(String(pScore), W / 2 - 12, 34);

  // Separator
  ctx.fillStyle = "rgba(255,255,255,0.5)";
  ctx.font = "bold 18px system-ui";
  ctx.textAlign = "center";
  ctx.fillText("×", W / 2, 33);

  // AI score
  ctx.fillStyle = "#ef4444";
  ctx.font = "bold 22px 'Segoe UI', system-ui";
  ctx.textAlign = "left";
  ctx.fillText(String(aScore), W / 2 + 12, 34);

  // Set info
  ctx.fillStyle = "rgba(255,255,255,0.6)";
  ctx.font = "10px system-ui";
  ctx.textAlign = "center";
  ctx.fillText(`Set ${setNum} • Sets: ${sets[0]}-${sets[1]}`, W / 2, 20);

  // Touches display
  ctx.fillStyle = "rgba(255,255,255,0.4)";
  ctx.font = "9px system-ui";
  ctx.textAlign = "left";
  ctx.fillText(`Toques: ${pTouches}/${MAX_TOUCHES}`, 10, H - 8);
  ctx.textAlign = "right";
  ctx.fillText(`IA: ${aTouches}/${MAX_TOUCHES}`, W - 10, H - 8);

  // Rally counter
  if (rallyCount > 3) {
    ctx.fillStyle = "rgba(255,215,0,0.7)";
    ctx.font = "bold 11px system-ui";
    ctx.textAlign = "center";
    ctx.fillText(`🔥 Rally: ${rallyCount}`, W / 2, H - 8);
  }
};

// Color utility helpers
function adjustColor(hex: string, amount: number): string {
  const c = hex.replace("#", "");
  const num = parseInt(c, 16);
  const r = Math.min(255, Math.max(0, ((num >> 16) & 0xff) + amount));
  const g = Math.min(255, Math.max(0, ((num >> 8) & 0xff) + amount));
  const b = Math.min(255, Math.max(0, (num & 0xff) + amount));
  return `rgb(${r},${g},${b})`;
}

function lightenColor(hex: string, amount: number): string {
  return adjustColor(hex, amount);
}

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
  const [inviteCode, setInviteCode] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [showInvite, setShowInvite] = useState(false);
  const [showJoin, setShowJoin] = useState(false);

  // ── Multiplayer state ──
  const [gameMode, setGameMode] = useState<GameMode>("solo");
  const [multiRole, setMultiRole] = useState<MultiRole>(null);
  const [opponentName, setOpponentName] = useState("");
  const [opponentConnected, setOpponentConnected] = useState(false);

  // Game state refs
  const playerRef = useRef<Player>(createPlayer(W * 0.25));
  const aiRef = useRef<Player>(createPlayer(W * 0.75));
  const ballRef = useRef<Ball>(createBall(W * 0.25, GROUND_Y - 80));
  const pScoreRef = useRef(0);
  const aScoreRef = useRef(0);
  const setsRef = useRef([0, 0]);
  const setNumRef = useRef(1);
  const phaseRef = useRef<Phase>("start");
  const animRef = useRef(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const keysRef = useRef<Set<string>>(new Set());
  const touchDirRef = useRef(0);
  const touchJumpRef = useRef(false);
  const touchAttackRef = useRef(false);
  const rallyCountRef = useRef(0);
  const pauseRef = useRef(0);
  const frameCountRef = useRef(0);

  // Multiplayer refs
  const gameModeRef = useRef<GameMode>("solo");
  const multiRoleRef = useRef<MultiRole>(null);
  const channelRef = useRef<any>(null);
  const remoteInputRef = useRef({ dir: 0, jump: false, attack: false });
  const broadcastCountRef = useRef(0);
  const audioCtxRef = useRef<AudioContext | null>(null);

  // ── Sound Engine (Web Audio API) ──
  const getAudioCtx = () => {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    if (audioCtxRef.current.state === "suspended") {
      audioCtxRef.current.resume();
    }
    return audioCtxRef.current;
  };

  const playHitSound = (isSpike = false) => {
    try {
      const ctx = getAudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = "triangle";
      osc.frequency.setValueAtTime(isSpike ? 600 : 400, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(isSpike ? 200 : 150, ctx.currentTime + 0.12);
      gain.gain.setValueAtTime(isSpike ? 0.25 : 0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.15);
      // Add a "thud" layer
      const noise = ctx.createOscillator();
      const ng = ctx.createGain();
      noise.connect(ng);
      ng.connect(ctx.destination);
      noise.type = "sine";
      noise.frequency.setValueAtTime(isSpike ? 180 : 120, ctx.currentTime);
      noise.frequency.exponentialRampToValueAtTime(60, ctx.currentTime + 0.08);
      ng.gain.setValueAtTime(0.2, ctx.currentTime);
      ng.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);
      noise.start(ctx.currentTime);
      noise.stop(ctx.currentTime + 0.1);
    } catch {}
  };

  const playScoreSound = (isPlayerPoint: boolean) => {
    try {
      const ctx = getAudioCtx();
      const notes = isPlayerPoint ? [523, 659, 784] : [400, 320, 260];
      notes.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = isPlayerPoint ? "sine" : "square";
        osc.frequency.setValueAtTime(freq, ctx.currentTime + i * 0.12);
        gain.gain.setValueAtTime(0.15, ctx.currentTime + i * 0.12);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.12 + 0.2);
        osc.start(ctx.currentTime + i * 0.12);
        osc.stop(ctx.currentTime + i * 0.12 + 0.2);
      });
    } catch {}
  };

  const playCrowdSound = () => {
    try {
      const ctx = getAudioCtx();
      // Simulate crowd noise with multiple detuned oscillators
      for (let i = 0; i < 6; i++) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const filter = ctx.createBiquadFilter();
        osc.connect(filter);
        filter.connect(gain);
        gain.connect(ctx.destination);
        osc.type = "sawtooth";
        osc.frequency.setValueAtTime(200 + Math.random() * 400, ctx.currentTime);
        osc.detune.setValueAtTime(Math.random() * 100 - 50, ctx.currentTime);
        filter.type = "bandpass";
        filter.frequency.setValueAtTime(800 + Math.random() * 600, ctx.currentTime);
        filter.Q.setValueAtTime(0.5, ctx.currentTime);
        const delay = Math.random() * 0.1;
        gain.gain.setValueAtTime(0, ctx.currentTime + delay);
        gain.gain.linearRampToValueAtTime(0.03, ctx.currentTime + delay + 0.15);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + 0.6);
        osc.start(ctx.currentTime + delay);
        osc.stop(ctx.currentTime + delay + 0.6);
      }
    } catch {}
  };

  const playWhistle = () => {
    try {
      const ctx = getAudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = "sine";
      osc.frequency.setValueAtTime(900, ctx.currentTime);
      osc.frequency.setValueAtTime(1200, ctx.currentTime + 0.1);
      osc.frequency.setValueAtTime(900, ctx.currentTime + 0.2);
      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      gain.gain.setValueAtTime(0.15, ctx.currentTime + 0.1);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.35);
    } catch {}
  };

  // Generate invite code
  useEffect(() => {
    const code = Math.random().toString(36).substring(2, 8).toUpperCase();
    setInviteCode(code);
  }, []);

  const copyInviteCode = () => {
    navigator.clipboard.writeText(inviteCode);
    toast({ title: "Código copiado!", description: `Envie "${inviteCode}" para seu amigo` });
  };

  // ── Channel management ──
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

    const channel = supabase.channel(`volley-room-${inviteCode}`, {
      config: { broadcast: { self: false } },
    });

    channel.on("broadcast", { event: "game" }, ({ payload }) => {
      if (payload.type === "join") {
        setOpponentName(payload.name);
        setOpponentConnected(true);
        // Send back host info
        channel.send({
          type: "broadcast",
          event: "game",
          payload: { type: "host_info", name: playerName.trim() },
        });
        toast({ title: "Jogador conectado!", description: `${payload.name} entrou na sala` });
      } else if (payload.type === "input" && multiRoleRef.current === "host") {
        remoteInputRef.current = payload.input;
      } else if (payload.type === "leave") {
        setOpponentConnected(false);
        setOpponentName("");
        toast({ title: "Jogador saiu", variant: "destructive" });
        if (phaseRef.current === "playing") {
          phaseRef.current = "start";
          setPhase("start");
          cancelAnimationFrame(animRef.current);
        }
      }
    });

    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        setGameMode("multi");
        setMultiRole("host");
        gameModeRef.current = "multi";
        multiRoleRef.current = "host";
        setPhase("waiting");
        phaseRef.current = "waiting";
      }
    });

    channelRef.current = channel;
  }, [playerName, inviteCode, cleanupChannel]);

  const joinRoom = useCallback(() => {
    if (!playerName.trim() || !joinCode.trim()) return;
    cleanupChannel();

    const channel = supabase.channel(`volley-room-${joinCode.toUpperCase()}`, {
      config: { broadcast: { self: false } },
    });

    channel.on("broadcast", { event: "game" }, ({ payload }) => {
      if (payload.type === "host_info") {
        setOpponentName(payload.name);
        setOpponentConnected(true);
      } else if (payload.type === "state" && multiRoleRef.current === "guest") {
        // Apply received state from host
        const s = payload;
        playerRef.current = { ...playerRef.current, ...s.p1 };
        aiRef.current = { ...aiRef.current, ...s.p2 };
        ballRef.current = { ...ballRef.current, x: s.ball.x, y: s.ball.y, vx: s.ball.vx, vy: s.ball.vy, rotation: s.ball.rotation };
        pScoreRef.current = s.scores.p;
        aScoreRef.current = s.scores.a;
        setsRef.current = s.scores.sets;
        setNumRef.current = s.scores.setNum;
        rallyCountRef.current = s.rally;
        pauseRef.current = s.pause;
        setPlayerScore(s.scores.p);
        setAiScore(s.scores.a);
        setSetsWon([...s.scores.sets]);
        setCurrentSet(s.scores.setNum);
      } else if (payload.type === "start_game") {
        phaseRef.current = "playing";
        setPhase("playing");
      } else if (payload.type === "game_over") {
        phaseRef.current = "gameover";
        setPhase("gameover");
        setPlayerScore(payload.scores.p);
        setAiScore(payload.scores.a);
        setSetsWon(payload.scores.sets);
      } else if (payload.type === "point") {
        setLastPoint(payload.msg);
      } else if (payload.type === "leave") {
        setOpponentConnected(false);
        setOpponentName("");
        toast({ title: "Host saiu da sala", variant: "destructive" });
        phaseRef.current = "start";
        setPhase("start");
        cancelAnimationFrame(animRef.current);
      }
    });

    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        setGameMode("multi");
        setMultiRole("guest");
        gameModeRef.current = "multi";
        multiRoleRef.current = "guest";
        setPhase("waiting");
        phaseRef.current = "waiting";
        setShowJoin(false);
        // Announce join
        channel.send({
          type: "broadcast",
          event: "game",
          payload: { type: "join", name: playerName.trim() },
        });
        toast({ title: "Conectado!", description: "Aguardando o host iniciar..." });
      }
    });

    channelRef.current = channel;
  }, [playerName, joinCode, cleanupChannel]);

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
      y: GROUND_Y - P_H - BALL_R - 14,
      vx: who === "player" ? SERVE_VX : -SERVE_VX,
      vy: SERVE_VY,
      rotation: 0,
      trail: [],
    };
    p.touches = 1;
    p.armAngle = 1;
    p.isAttacking = true;
    setTimeout(() => { p.isAttacking = false; }, 200);
  }, []);

  // ─── Score point ─────────────────────────────
  const scorePoint = useCallback((scorer: "player" | "ai") => {
    const isMulti = gameModeRef.current === "multi";
    if (scorer === "player") {
      pScoreRef.current += 1;
      setPlayerScore(pScoreRef.current);
      const msg = "Ponto seu! 🏐";
      setLastPoint(msg);
      if (isMulti && channelRef.current) {
        channelRef.current.send({ type: "broadcast", event: "game", payload: { type: "point", msg } });
      }
    } else {
      aScoreRef.current += 1;
      setAiScore(aScoreRef.current);
      const msg = isMulti ? `Ponto de ${opponentName || "P2"} 🏐` : "Ponto da IA 🤖";
      setLastPoint(msg);
      if (isMulti && channelRef.current) {
        channelRef.current.send({ type: "broadcast", event: "game", payload: { type: "point", msg: `Ponto do adversário 🏐` } });
      }
    }
    pauseRef.current = 60;
    playWhistle();
    playScoreSound(scorer === "player");
    setTimeout(() => playCrowdSound(), 300);

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
        if (isMulti && channelRef.current) {
          channelRef.current.send({
            type: "broadcast", event: "game",
            payload: { type: "game_over", scores: { p: pScoreRef.current, a: aScoreRef.current, sets: [...setsRef.current] } },
          });
        }
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
        playerRef.current = createPlayer(W * 0.25);
        aiRef.current = createPlayer(W * 0.75);
        serveBall(scorer);
      }
    }, 1000);
  }, [serveBall, opponentName]);

  // ─── Ball-player collision ─────────────────
  const checkPlayerBallHit = (p: Player, ball: Ball, isLeft: boolean): boolean => {
    const headY = p.y - P_H - HEAD_R + 4;
    const shoulderY = p.y - P_H + HEAD_R + 4;
    const targetDir = isLeft ? 1 : -1;

    const applyHit = (centerX: number, centerY: number, radius: number, isHead: boolean) => {
      const dx = ball.x - centerX;
      const dy = ball.y - centerY;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < radius + BALL_R && p.touches < MAX_TOUCHES) {
        p.touches += 1;
        p.armAngle = 1;
        p.isAttacking = true;
        setTimeout(() => { p.isAttacking = false; }, 250);
        rallyCountRef.current += 1;

        const angle = Math.atan2(dy, dx);
        const speed = Math.sqrt(ball.vx * ball.vx + ball.vy * ball.vy);
        const isSpike = p.y < GROUND_Y - 20 && p.attackCooldown <= 0;
        const spikeBoost = isSpike ? ATTACK_BOOST : 0;
        const newSpeed = Math.max(speed, 4) + spikeBoost;

        if (isHead) {
          ball.vx = targetDir * (newSpeed * 0.6 + 2);
          ball.vy = -Math.abs(newSpeed * 0.8) - 3;
        } else if (isSpike) {
          ball.vx = targetDir * Math.abs(Math.cos(angle)) * newSpeed * 0.85 + targetDir * 2;
          ball.vy = Math.abs(newSpeed * 0.5) + 1;
        } else {
          ball.vx = targetDir * Math.abs(Math.cos(angle)) * newSpeed * 0.85 + targetDir * 2;
          ball.vy = -Math.abs(newSpeed * 0.7) - 2;
        }

        ball.x = centerX + (radius + BALL_R + 3) * Math.cos(angle);
        ball.y = centerY + (radius + BALL_R + 3) * Math.sin(angle);

        if (isSpike) p.attackCooldown = 20;
        playHitSound(isSpike);
        return true;
      }
      return false;
    };

    if (applyHit(p.x, headY, HEAD_R + 3, true)) return true;
    const bodyCenter = shoulderY + (p.y - shoulderY) * 0.4;
    if (applyHit(p.x, bodyCenter, 22, false)) return true;
    if (p.isAttacking || p.armAngle > 0.3) {
      const dir = isLeft ? 1 : -1;
      const armX = p.x + dir * 22;
      const armY = shoulderY;
      if (applyHit(armX, armY, 12, false)) return true;
    }
    return false;
  };

  // ─── Broadcast state (host only) ────────────
  const broadcastState = useCallback(() => {
    if (gameModeRef.current !== "multi" || multiRoleRef.current !== "host" || !channelRef.current) return;
    broadcastCountRef.current++;
    if (broadcastCountRef.current % 3 !== 0) return; // Send every 3 frames (~20hz)

    const p = playerRef.current;
    const a = aiRef.current;
    const b = ballRef.current;
    channelRef.current.send({
      type: "broadcast",
      event: "game",
      payload: {
        type: "state",
        p1: { x: p.x, y: p.y, vy: p.vy, armAngle: p.armAngle, isAttacking: p.isAttacking, legPhase: p.legPhase, touches: p.touches, attackCooldown: p.attackCooldown },
        p2: { x: a.x, y: a.y, vy: a.vy, armAngle: a.armAngle, isAttacking: a.isAttacking, legPhase: a.legPhase, touches: a.touches, attackCooldown: a.attackCooldown },
        ball: { x: b.x, y: b.y, vx: b.vx, vy: b.vy, rotation: b.rotation },
        scores: { p: pScoreRef.current, a: aScoreRef.current, sets: [...setsRef.current], setNum: setNumRef.current },
        rally: rallyCountRef.current,
        pause: pauseRef.current,
      },
    });
  }, []);

  // ─── Send guest input ────────────────────────
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

    channelRef.current.send({
      type: "broadcast",
      event: "game",
      payload: { type: "input", input: { dir, jump, attack } },
    });
  }, []);

  // ─── Game Loop ─────────────────────────────────
  const drawGame = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    frameCountRef.current++;
    const isGuest = gameModeRef.current === "multi" && multiRoleRef.current === "guest";
    const isHostMulti = gameModeRef.current === "multi" && multiRoleRef.current === "host";

    // Guest: just render received state + send inputs
    if (isGuest) {
      sendGuestInput();
      ctx.clearRect(0, 0, W, H);
      drawCourt(ctx);
      drawNet(ctx);
      drawPlayer(ctx, aiRef.current, false, "#dc2626", "#1e293b", "#8B6914", "#1a1a2e", "2");
      drawPlayer(ctx, playerRef.current, true, "#2563eb", "#f0f0f0", "#c8956c", "#3b2507", "1");
      drawBall(ctx, ballRef.current);
      drawHUD(ctx, pScoreRef.current, aScoreRef.current, setNumRef.current, setsRef.current,
        playerRef.current.touches, aiRef.current.touches, rallyCountRef.current);
      animRef.current = requestAnimationFrame(drawGame);
      return;
    }

    // Host or Solo: run full physics
    if (pauseRef.current > 0) {
      pauseRef.current--;
      ctx.clearRect(0, 0, W, H);
      drawCourt(ctx);
      drawNet(ctx);
      drawPlayer(ctx, aiRef.current, false, "#dc2626", "#1e293b", "#8B6914", "#1a1a2e", "2");
      drawPlayer(ctx, playerRef.current, true, "#2563eb", "#f0f0f0", "#c8956c", "#3b2507", "1");
      drawBall(ctx, ballRef.current);
      drawHUD(ctx, pScoreRef.current, aScoreRef.current, setNumRef.current, setsRef.current,
        playerRef.current.touches, aiRef.current.touches, rallyCountRef.current);
      if (isHostMulti) broadcastState();
      animRef.current = requestAnimationFrame(drawGame);
      return;
    }

    const player = playerRef.current;
    const ai = aiRef.current;
    const ball = ballRef.current;
    const keys = keysRef.current;

    // ── Player 1 movement (local) ──
    let moveDir = touchDirRef.current;
    if (keys.has("ArrowLeft") || keys.has("a")) moveDir = -1;
    if (keys.has("ArrowRight") || keys.has("d")) moveDir = 1;

    player.x += moveDir * MOVE_SPEED;
    player.x = Math.max(22, Math.min(NET_X - P_W / 2 - 6, player.x));

    if (Math.abs(moveDir) > 0 && player.y >= GROUND_Y) {
      player.legPhase += 0.4;
    } else {
      player.legPhase *= 0.8;
    }

    if ((keys.has("ArrowUp") || keys.has("w") || keys.has(" ") || touchJumpRef.current) && player.y >= GROUND_Y) {
      player.vy = JUMP_VY;
      touchJumpRef.current = false;
    }

    if ((keys.has("x") || keys.has("z") || touchAttackRef.current) && player.attackCooldown <= 0) {
      player.armAngle = 1;
      player.isAttacking = true;
      player.attackCooldown = 15;
      touchAttackRef.current = false;
      setTimeout(() => { player.isAttacking = false; }, 300);
    }

    player.vy += GRAVITY;
    player.y += player.vy;
    if (player.y >= GROUND_Y) { player.y = GROUND_Y; player.vy = 0; }
    player.armAngle = Math.max(0, player.armAngle - 0.05);
    player.attackCooldown = Math.max(0, player.attackCooldown - 1);

    // ── Player 2 / AI movement ──
    if (isHostMulti) {
      // Multiplayer: apply remote guest inputs
      const ri = remoteInputRef.current;
      ai.x += ri.dir * MOVE_SPEED;
      ai.x = Math.max(NET_X + P_W / 2 + 6, Math.min(W - 22, ai.x));

      if (Math.abs(ri.dir) > 0 && ai.y >= GROUND_Y) {
        ai.legPhase += 0.4;
      } else {
        ai.legPhase *= 0.8;
      }

      if (ri.jump && ai.y >= GROUND_Y) {
        ai.vy = JUMP_VY;
        remoteInputRef.current = { ...ri, jump: false };
      }

      if (ri.attack && ai.attackCooldown <= 0) {
        ai.armAngle = 1;
        ai.isAttacking = true;
        ai.attackCooldown = 15;
        remoteInputRef.current = { ...ri, attack: false };
        setTimeout(() => { ai.isAttacking = false; }, 300);
      }
    } else {
      // Solo: AI logic
      const ballOnAiSide = ball.x > NET_X;
      if (ballOnAiSide) {
        const targetX = ball.x + ball.vx * 5;
        const aiDiff = targetX - ai.x;
        if (Math.abs(aiDiff) > 4) {
          ai.x += Math.sign(aiDiff) * Math.min(AI_SPEED + rallyCountRef.current * 0.015, Math.abs(aiDiff));
        }
        if (Math.abs(aiDiff) > 4 && ai.y >= GROUND_Y) {
          ai.legPhase += 0.35;
        }
        const distToBall = Math.sqrt((ball.x - ai.x) ** 2 + (ball.y - (ai.y - P_H)) ** 2);
        if (distToBall < 55 && ball.y < GROUND_Y - 25 && ai.y >= GROUND_Y) {
          ai.vy = JUMP_VY * 0.85;
        }
      } else {
        const homeX = W * 0.75;
        const aiDiff = homeX - ai.x;
        if (Math.abs(aiDiff) > 3) {
          ai.x += Math.sign(aiDiff) * AI_SPEED * 0.4;
          if (ai.y >= GROUND_Y) ai.legPhase += 0.25;
        }
        ai.legPhase *= 0.9;
      }
      ai.x = Math.max(NET_X + P_W / 2 + 6, Math.min(W - 22, ai.x));
    }

    ai.vy += GRAVITY;
    ai.y += ai.vy;
    if (ai.y >= GROUND_Y) { ai.y = GROUND_Y; ai.vy = 0; }
    ai.armAngle = Math.max(0, ai.armAngle - 0.05);
    ai.attackCooldown = Math.max(0, ai.attackCooldown - 1);

    // ── Ball physics ──
    ball.vy += GRAVITY;
    ball.x += ball.vx;
    ball.y += ball.vy;
    ball.rotation += ball.vx * 0.06;

    if (frameCountRef.current % 2 === 0) {
      ball.trail.push({ x: ball.x, y: ball.y, alpha: 1 });
      if (ball.trail.length > 8) ball.trail.shift();
    }
    for (const t of ball.trail) { t.alpha -= 0.12; }
    ball.trail = ball.trail.filter(t => t.alpha > 0);

    if (ball.x <= BALL_R) { ball.vx = Math.abs(ball.vx) * 0.8; ball.x = BALL_R; }
    if (ball.x >= W - BALL_R) { ball.vx = -Math.abs(ball.vx) * 0.8; ball.x = W - BALL_R; }
    if (ball.y <= BALL_R) { ball.vy = Math.abs(ball.vy) * 0.5; ball.y = BALL_R; }

    // Net collision
    if (
      ball.y + BALL_R > NET_TOP &&
      ball.y - BALL_R < GROUND_Y &&
      Math.abs(ball.x - NET_X) < BALL_R + 5
    ) {
      ball.vx = -ball.vx * 0.5;
      ball.x = ball.x < NET_X ? NET_X - BALL_R - 6 : NET_X + BALL_R + 6;
    }

    // Player-ball collisions
    const playerHit = checkPlayerBallHit(player, ball, true);
    if (playerHit) { player.touches = Math.min(player.touches, MAX_TOUCHES); }

    const aiHit = checkPlayerBallHit(ai, ball, false);
    if (aiHit) { ai.touches = Math.min(ai.touches, MAX_TOUCHES); player.touches = 0; }
    if (playerHit) ai.touches = 0;

    // Ball hits ground
    if (ball.y + BALL_R >= GROUND_Y) {
      ball.y = GROUND_Y - BALL_R;
      ball.vy = 0;
      ball.vx = 0;
      if (ball.x < NET_X) {
        scorePoint("ai");
      } else {
        scorePoint("player");
      }
      if (isHostMulti) broadcastState();
      animRef.current = requestAnimationFrame(drawGame);
      return;
    }

    // ── Draw ──
    ctx.clearRect(0, 0, W, H);
    drawCourt(ctx);
    drawNet(ctx);
    drawPlayer(ctx, ai, false, "#dc2626", "#1e293b", "#8B6914", "#1a1a2e", "2");
    drawPlayer(ctx, player, true, "#2563eb", "#f0f0f0", "#c8956c", "#3b2507", "1");
    drawBall(ctx, ball);
    drawHUD(ctx, pScoreRef.current, aScoreRef.current, setNumRef.current, setsRef.current,
      player.touches, ai.touches, rallyCountRef.current);

    if (isHostMulti) broadcastState();

    animRef.current = requestAnimationFrame(drawGame);
  }, [scorePoint, broadcastState, sendGuestInput]);

  // Start loop
  useEffect(() => {
    if (phase !== "playing") return;
    const tryStart = () => {
      if (canvasRef.current) {
        if (multiRoleRef.current !== "guest") {
          serveBall("player");
        }
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

  // Touch controls handled by visible buttons below

  const startGame = (mode: GameMode = "solo") => {
    if (!playerName.trim()) return;
    pScoreRef.current = 0;
    aScoreRef.current = 0;
    setsRef.current = [0, 0];
    setNumRef.current = 1;
    rallyCountRef.current = 0;
    pauseRef.current = 0;
    frameCountRef.current = 0;
    broadcastCountRef.current = 0;
    playerRef.current = createPlayer(W * 0.25);
    aiRef.current = createPlayer(W * 0.75);
    setPlayerScore(0);
    setAiScore(0);
    setSetsWon([0, 0]);
    setCurrentSet(1);
    setLastPoint(null);

    if (mode === "solo") {
      gameModeRef.current = "solo";
      multiRoleRef.current = null;
      setGameMode("solo");
      setMultiRole(null);
    }

    phaseRef.current = "playing";
    setPhase("playing");

    // Notify guest to start
    if (gameModeRef.current === "multi" && multiRoleRef.current === "host" && channelRef.current) {
      channelRef.current.send({
        type: "broadcast",
        event: "game",
        payload: { type: "start_game" },
      });
    }
  };

  const resetGame = () => {
    cancelAnimationFrame(animRef.current);
    cleanupChannel();
    gameModeRef.current = "solo";
    multiRoleRef.current = null;
    setGameMode("solo");
    setMultiRole(null);
    setOpponentName("");
    setOpponentConnected(false);
    phaseRef.current = "start";
    setPhase("start");
    setPlayerScore(0);
    setAiScore(0);
    setSetsWon([0, 0]);
    setCurrentSet(1);
    setLastPoint(null);
    setShowInvite(false);
    setShowJoin(false);
  };

  useEffect(() => () => {
    cancelAnimationFrame(animRef.current);
    cleanupChannel();
  }, [cleanupChannel]);

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
                Jogue contra a IA ou convide um amigo para jogar online!
              </p>
              <div className="text-xs text-muted-foreground max-w-xs mx-auto space-y-1">
                <p>🖥️ <strong>Teclado:</strong> ← → mover | ↑ pular | X atacar</p>
                <p>📱 <strong>Toque:</strong> Botões na tela</p>
              </div>
              <input
                type="text"
                placeholder="Digite seu nome"
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && startGame("solo")}
                className="w-full max-w-xs mx-auto rounded-lg border border-border bg-background px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 block"
                maxLength={30}
              />
              <div className="flex gap-2 justify-center flex-wrap">
                <Button onClick={() => startGame("solo")} disabled={!playerName.trim()} className="gap-2">
                  <Zap className="h-4 w-4" /> Jogar vs IA
                </Button>
              </div>

              {/* Multiplayer buttons */}
              <div className="flex gap-2 justify-center flex-wrap pt-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    if (!playerName.trim()) {
                      toast({ title: "Digite seu nome primeiro" });
                      return;
                    }
                    setShowJoin(false);
                    if (showInvite) {
                      setShowInvite(false);
                    } else {
                      createRoom();
                      setShowInvite(true);
                    }
                  }}
                  className="gap-1.5 text-xs"
                >
                  <UserPlus className="h-3.5 w-3.5" /> Criar sala
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => { setShowJoin(!showJoin); setShowInvite(false); }}
                  className="gap-1.5 text-xs"
                >
                  <LogIn className="h-3.5 w-3.5" /> Entrar com código
                </Button>
              </div>

              <AnimatePresence>
                {showInvite && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 max-w-xs mx-auto space-y-2">
                      <p className="text-xs text-muted-foreground">Compartilhe este código com seu amigo:</p>
                      <div className="flex items-center gap-2 justify-center">
                        <span className="font-mono text-lg font-bold tracking-[0.3em] text-primary bg-background px-3 py-1 rounded border border-border">
                          {inviteCode}
                        </span>
                        <Button variant="ghost" size="sm" onClick={copyInviteCode} className="h-8 w-8 p-0">
                          <Copy className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </motion.div>
                )}

                {showJoin && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 max-w-xs mx-auto space-y-2">
                      <p className="text-xs text-muted-foreground">Digite o código da sala:</p>
                      <div className="flex items-center gap-2 justify-center">
                        <Input
                          value={joinCode}
                          onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                          placeholder="EX: A1B2C3"
                          maxLength={6}
                          className="max-w-[140px] text-center font-mono tracking-wider uppercase"
                        />
                        <Button size="sm" onClick={joinRoom} disabled={joinCode.length < 4 || !playerName.trim()}>
                          Entrar
                        </Button>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )}

          {/* WAITING LOBBY */}
          {phase === "waiting" && (
            <motion.div
              key="waiting"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-4 text-center"
            >
              <div className="text-5xl">🏐</div>
              <h3 className="text-xl font-bold">Sala Multiplayer</h3>

              {multiRole === "host" && (
                <>
                  <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 max-w-xs mx-auto space-y-3">
                    <p className="text-xs text-muted-foreground">Código da sala:</p>
                    <div className="flex items-center gap-2 justify-center">
                      <span className="font-mono text-2xl font-bold tracking-[0.3em] text-primary">
                        {inviteCode}
                      </span>
                      <Button variant="ghost" size="sm" onClick={copyInviteCode} className="h-8 w-8 p-0">
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  <div className="flex items-center justify-center gap-2 text-sm">
                    {opponentConnected ? (
                      <>
                        <Wifi className="h-4 w-4 text-green-500" />
                        <span className="text-green-500 font-semibold">{opponentName} conectado!</span>
                      </>
                    ) : (
                      <>
                        <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                        <span className="text-muted-foreground">Aguardando jogador...</span>
                      </>
                    )}
                  </div>

                  <div className="flex gap-2 justify-center">
                    <Button
                      onClick={() => startGame("multi")}
                      disabled={!opponentConnected}
                      className="gap-2"
                    >
                      <Zap className="h-4 w-4" /> Começar partida!
                    </Button>
                    <Button variant="ghost" onClick={resetGame}>
                      Cancelar
                    </Button>
                  </div>
                </>
              )}

              {multiRole === "guest" && (
                <>
                  <div className="flex items-center justify-center gap-2 text-sm">
                    {opponentConnected ? (
                      <>
                        <Wifi className="h-4 w-4 text-green-500" />
                        <span className="text-green-500 font-semibold">Conectado! Host: {opponentName}</span>
                      </>
                    ) : (
                      <>
                        <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                        <span className="text-muted-foreground">Conectando à sala...</span>
                      </>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">Aguardando o host iniciar a partida...</p>
                  <p className="text-xs text-muted-foreground font-medium">Você controla o jogador da <span className="text-red-400">direita</span> (vermelho)</p>
                  <Button variant="ghost" onClick={resetGame}>
                    Cancelar
                  </Button>
                </>
              )}
            </motion.div>
          )}

          {phase === "playing" && (
            <motion.div
              key="playing"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 bg-black flex flex-col items-center justify-center"
            >
              {/* Top bar */}
              <div className="w-full flex items-center justify-between px-3 py-1.5 bg-black/80 shrink-0">
                <Button variant="ghost" size="sm" onClick={resetGame} className="text-white/70 text-xs h-7 px-2">
                  ← Sair
                </Button>
                <div className="flex items-center gap-2">
                  {lastPoint && (
                    <motion.p
                      key={lastPoint + pScoreRef.current + aScoreRef.current}
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="text-xs font-bold text-yellow-400"
                    >
                      {lastPoint}
                    </motion.p>
                  )}
                  {gameMode === "multi" && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-500/20 text-green-400 border border-green-500/30">
                      <Wifi className="h-3 w-3 inline mr-0.5" /> ONLINE
                    </span>
                  )}
                </div>
                <span className="text-white/50 text-[10px]">Set {currentSet}</span>
              </div>

              {/* Canvas */}
              <div className="flex-1 flex items-center justify-center w-full px-1 min-h-0">
                <canvas
                  ref={canvasRef}
                  width={W}
                  height={H}
                  className="rounded-lg border border-white/10 touch-none select-none"
                  style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain", imageRendering: "auto" }}
                />
              </div>

              {/* Visible control buttons */}
              <div className="w-full px-3 pb-4 pt-2 bg-black/80 shrink-0">
                <div className="flex items-center justify-between gap-2 max-w-md mx-auto">
                  {/* Left: movement */}
                  <div className="flex gap-1.5">
                    <button
                      onTouchStart={(e) => { e.preventDefault(); touchDirRef.current = -1; }}
                      onTouchEnd={(e) => { e.preventDefault(); touchDirRef.current = 0; }}
                      onMouseDown={() => touchDirRef.current = -1}
                      onMouseUp={() => touchDirRef.current = 0}
                      onMouseLeave={() => touchDirRef.current = 0}
                      className="w-14 h-14 rounded-xl bg-white/10 border border-white/20 text-white text-xl font-bold active:bg-white/25 active:scale-95 transition-all select-none touch-none flex items-center justify-center"
                    >
                      ◀
                    </button>
                    <button
                      onTouchStart={(e) => { e.preventDefault(); touchDirRef.current = 1; }}
                      onTouchEnd={(e) => { e.preventDefault(); touchDirRef.current = 0; }}
                      onMouseDown={() => touchDirRef.current = 1}
                      onMouseUp={() => touchDirRef.current = 0}
                      onMouseLeave={() => touchDirRef.current = 0}
                      className="w-14 h-14 rounded-xl bg-white/10 border border-white/20 text-white text-xl font-bold active:bg-white/25 active:scale-95 transition-all select-none touch-none flex items-center justify-center"
                    >
                      ▶
                    </button>
                  </div>

                  {/* Center: jump */}
                  <button
                    onTouchStart={(e) => { e.preventDefault(); touchJumpRef.current = true; }}
                    onTouchEnd={(e) => { e.preventDefault(); }}
                    onMouseDown={() => { touchJumpRef.current = true; }}
                    className="w-16 h-16 rounded-full bg-blue-500/30 border-2 border-blue-400/50 text-white text-sm font-bold active:bg-blue-500/50 active:scale-95 transition-all select-none touch-none flex flex-col items-center justify-center gap-0.5"
                  >
                    <span className="text-lg">⬆</span>
                    <span className="text-[9px] opacity-70">PULAR</span>
                  </button>

                  {/* Right: attack */}
                  <button
                    onTouchStart={(e) => { e.preventDefault(); touchAttackRef.current = true; }}
                    onTouchEnd={(e) => { e.preventDefault(); }}
                    onMouseDown={() => { touchAttackRef.current = true; }}
                    className="w-16 h-16 rounded-full bg-red-500/30 border-2 border-red-400/50 text-white text-sm font-bold active:bg-red-500/50 active:scale-95 transition-all select-none touch-none flex flex-col items-center justify-center gap-0.5"
                  >
                    <span className="text-lg">👊</span>
                    <span className="text-[9px] opacity-70">ATACAR</span>
                  </button>
                </div>
              </div>
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
                {gameMode === "multi" && opponentName && ` • vs ${opponentName}`}
              </p>
              {submitting && (
                <p className="text-xs text-muted-foreground">Salvando pontuação...</p>
              )}
              <div className="flex gap-3 justify-center">
                <Button onClick={() => startGame(gameMode)} className="gap-2">
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
