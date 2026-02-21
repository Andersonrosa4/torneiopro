import { useState, useEffect, useCallback, useRef } from "react";
import { publicQuery } from "@/lib/organizerApi";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "framer-motion";
import { Medal, Zap, RotateCcw, Trash2, Copy, UserPlus, LogIn, Wifi, WifiOff } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import Court3DScene from "@/components/VolleyPong3D/Court3DScene";

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
const GRAVITY = 0.18;
const MAX_TOUCHES = 3;
const SERVE_VX = 2.5;
const SERVE_VY = -5;
const MAX_SCORE = 15;
const MIN_DIFF = 2;

// Player body
const P_W = 22;
const P_H = 52;
const HEAD_R = 9;
const JUMP_VY = -6.2;
const MOVE_SPEED = 3.5;
const AI_SPEED = 2.2;
const ATTACK_BOOST = 1.8;
const BALL_SPEED_CAP = 5.5;
const BALL_VY_CAP = 6.5;

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

// Drawing functions removed — rendering handled by Court3DScene (Three.js)

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
        const baseSpeed = Math.max(speed * 0.7, 3); // dampen incoming speed
        const newSpeed = Math.min(baseSpeed + spikeBoost + 1.5, BALL_SPEED_CAP);

        if (isHead) {
          // Cabeceio: upward arc toward opponent
          ball.vx = targetDir * (newSpeed * 0.55 + 1.5);
          ball.vy = -Math.abs(newSpeed * 0.7) - 2;
        } else if (isSpike) {
          // Corte: downward aggressive hit
          ball.vx = targetDir * Math.abs(Math.cos(angle)) * newSpeed * 0.8 + targetDir * 1.5;
          ball.vy = Math.abs(newSpeed * 0.4) + 0.8;
        } else {
          // Toque normal: smooth upward arc
          ball.vx = targetDir * Math.abs(Math.cos(angle)) * newSpeed * 0.6 + targetDir * 1.2;
          ball.vy = -Math.abs(newSpeed * 0.65) - 1.8;
        }

        // Separate ball from player
        ball.x = centerX + (radius + BALL_R + 3) * Math.cos(angle);
        ball.y = centerY + (radius + BALL_R + 3) * Math.sin(angle);

        if (isSpike) p.attackCooldown = 20;
        playHitSound(isSpike);
        return true;
      }
      return false;
    };

    // Player (isLeft) gets bigger hitbox for easier contact
    const hitBonus = isLeft ? 6 : 0;
    if (applyHit(p.x, headY, HEAD_R + 3 + hitBonus, true)) return true;
    const bodyCenter = shoulderY + (p.y - shoulderY) * 0.4;
    if (applyHit(p.x, bodyCenter, 22 + hitBonus, false)) return true;
    if (p.isAttacking || p.armAngle > 0.3) {
      const dir = isLeft ? 1 : -1;
      const armX = p.x + dir * 22;
      const armY = shoulderY;
      if (applyHit(armX, armY, 12 + hitBonus, false)) return true;
    }
    return false;
  };

  // ─── Broadcast state (host only) ────────────
  const broadcastState = useCallback(() => {
    if (gameModeRef.current !== "multi" || multiRoleRef.current !== "host" || !channelRef.current) return;
    broadcastCountRef.current++;
    if (broadcastCountRef.current % 2 !== 0) return; // Send every 2 frames (~30hz)

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

  // ─── Physics Tick (called by Three.js useFrame) ─────────────────
  const tickPhysics = useCallback(() => {
    frameCountRef.current++;
    const isGuest = gameModeRef.current === "multi" && multiRoleRef.current === "guest";
    const isHostMulti = gameModeRef.current === "multi" && multiRoleRef.current === "host";

    if (isGuest) {
      sendGuestInput();
      return;
    }

    if (pauseRef.current > 0) {
      pauseRef.current--;
      if (isHostMulti) broadcastState();
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
      // Solo: AI logic — simulate real ball trajectory to find landing point
      const ball_ = ballRef.current;
      const aiSpeed = AI_SPEED + Math.min(rallyCountRef.current * 0.01, 0.4);

      // Simulate ball trajectory to predict where it will be at AI's height
      const simulateLanding = () => {
        let sx = ball_.x, sy = ball_.y, svx = ball_.vx, svy = ball_.vy;
        const targetH = GROUND_Y - P_H - HEAD_R; // head height
        for (let i = 0; i < 120; i++) {
          svy += GRAVITY;
          sx += svx;
          sy += svy;
          // Bounce off walls
          if (sx <= BALL_R) { svx = Math.abs(svx) * 0.8; sx = BALL_R; }
          if (sx >= W - BALL_R) { svx = -Math.abs(svx) * 0.8; sx = W - BALL_R; }
          // Net bounce
          if (sy + BALL_R > NET_TOP && Math.abs(sx - NET_X) < BALL_R + 5) {
            svx = -svx * 0.5;
            sx = sx < NET_X ? NET_X - BALL_R - 6 : NET_X + BALL_R + 6;
          }
          // Ball reaches AI head height or ground on AI side
          if (sx > NET_X && sy >= targetH) {
            return { x: sx, y: sy, frames: i, willLand: sy >= GROUND_Y - BALL_R };
          }
          if (sy >= GROUND_Y) {
            return { x: sx, y: GROUND_Y, frames: i, willLand: true };
          }
        }
        return { x: W * 0.72, y: GROUND_Y, frames: 999, willLand: false };
      };

      const prediction = simulateLanding();
      const ballOnAiSide = ball_.x > NET_X - 30;
      const ballComingToAi = ball_.vx > 0;
      const ballDangerous = ballComingToAi || ballOnAiSide;

      if (ballDangerous && prediction.x > NET_X) {
        // Move to predicted landing position with slight offset to be under the ball
        const offsetX = ball_.vx > 0 ? -5 : 5; // position slightly behind for better contact
        const targetX = Math.max(NET_X + P_W / 2 + 10, Math.min(W - 22, prediction.x + offsetX));
        const aiDiff = targetX - ai.x;

        if (Math.abs(aiDiff) > 1.5) {
          const moveAmount = Math.min(aiSpeed, Math.abs(aiDiff));
          ai.x += Math.sign(aiDiff) * moveAmount;
        }
        if (Math.abs(aiDiff) > 1.5 && ai.y >= GROUND_Y) {
          ai.legPhase += 0.35;
        }

        // Smart jump timing — jump when ball is approaching and close enough
        const headY = ai.y - P_H;
        const distX = Math.abs(ball_.x - ai.x);
        const distY = ball_.y - headY;
        const distToBall = Math.sqrt(distX * distX + distY * distY);
        
        // Jump when ball is descending toward AI and within reach
        const shouldJump = ai.y >= GROUND_Y && (
          // Ball close and at good height
          (distToBall < 80 && ball_.y < GROUND_Y - 30 && ball_.y > NET_TOP - 20) ||
          // Ball about to pass overhead, jump to intercept
          (distX < 40 && ball_.vy > 0 && ball_.y < GROUND_Y - 60 && ball_.y > NET_TOP)
        );
        
        if (shouldJump) {
          ai.vy = JUMP_VY * 0.92;
        }

        // Attack when in air and close to ball
        if (ai.y < GROUND_Y - 15 && distToBall < 55 && ai.attackCooldown <= 0) {
          ai.armAngle = 1;
          ai.isAttacking = true;
          ai.attackCooldown = 18;
          setTimeout(() => { ai.isAttacking = false; }, 280);
        }
      } else {
        // Return to ready position
        const homeX = W * 0.73;
        const aiDiff = homeX - ai.x;
        if (Math.abs(aiDiff) > 2) {
          ai.x += Math.sign(aiDiff) * aiSpeed * 0.5;
          if (ai.y >= GROUND_Y) ai.legPhase += 0.2;
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
    // Cap ball speed for realism
    ball.vx = Math.max(-BALL_SPEED_CAP, Math.min(BALL_SPEED_CAP, ball.vx));
    ball.vy = Math.max(-BALL_VY_CAP, Math.min(BALL_VY_CAP, ball.vy));
    // Apply slight air resistance
    ball.vx *= 0.998;
    ball.x += ball.vx;
    ball.y += ball.vy;
    ball.rotation += ball.vx * 0.05;

    if (frameCountRef.current % 2 === 0) {
      ball.trail.push({ x: ball.x, y: ball.y, alpha: 1 });
      if (ball.trail.length > 8) ball.trail.shift();
    }
    for (const t of ball.trail) { t.alpha -= 0.12; }
    ball.trail = ball.trail.filter(t => t.alpha > 0);

    // Wall bounces — full energy so ball returns to court
    if (ball.x <= BALL_R) { ball.vx = Math.abs(ball.vx); ball.x = BALL_R + 1; }
    if (ball.x >= W - BALL_R) { ball.vx = -Math.abs(ball.vx); ball.x = W - BALL_R - 1; }
    if (ball.y <= BALL_R) { ball.vy = Math.abs(ball.vy) * 0.8; ball.y = BALL_R; }

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
      return;
    }

    if (isHostMulti) broadcastState();
  }, [scorePoint, broadcastState, sendGuestInput]);

  // Serve ball when game starts (3D scene handles render loop via useFrame)
  useEffect(() => {
    if (phase !== "playing") return;
    if (multiRoleRef.current !== "guest") {
      serveBall("player");
    }
  }, [phase, serveBall]);

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
              className="fixed inset-0 z-50 bg-black flex flex-col"
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

              {/* 3D Scene + HUD overlay */}
              <div className="flex-1 w-full min-h-0 relative">
                <Court3DScene
                  playerRef={playerRef}
                  aiRef={aiRef}
                  ballRef={ballRef}
                  tickPhysics={tickPhysics}
                />
                {/* Score overlay */}
                <div className="absolute top-2 left-1/2 -translate-x-1/2 pointer-events-none z-10">
                  <div className="bg-black/60 backdrop-blur-sm rounded-lg px-5 py-2 flex items-center gap-4">
                    <span className="text-blue-400 font-bold text-xl tabular-nums">{playerScore}</span>
                    <span className="text-white/40 font-bold">×</span>
                    <span className="text-red-400 font-bold text-xl tabular-nums">{aiScore}</span>
                  </div>
                  <p className="text-white/40 text-[10px] text-center mt-0.5">
                    Set {currentSet} • Sets: {setsWon[0]}-{setsWon[1]}
                  </p>
                </div>
              </div>

              {/* Touch controls — ergonomic layout */}
              <div className="w-full px-2 pb-3 pt-1.5 bg-black/70 shrink-0">
                <div className="flex items-end justify-between max-w-lg mx-auto">
                  {/* Left side: D-pad movement */}
                  <div className="flex gap-2">
                    <button
                      onTouchStart={(e) => { e.preventDefault(); touchDirRef.current = -1; }}
                      onTouchEnd={(e) => { e.preventDefault(); touchDirRef.current = 0; }}
                      onTouchCancel={() => touchDirRef.current = 0}
                      onMouseDown={() => touchDirRef.current = -1}
                      onMouseUp={() => touchDirRef.current = 0}
                      onMouseLeave={() => touchDirRef.current = 0}
                      className="w-16 h-16 rounded-2xl bg-white/12 border border-white/25 text-white text-2xl font-bold active:bg-white/30 active:scale-95 transition-all select-none touch-none flex items-center justify-center"
                    >
                      ◀
                    </button>
                    <button
                      onTouchStart={(e) => { e.preventDefault(); touchDirRef.current = 1; }}
                      onTouchEnd={(e) => { e.preventDefault(); touchDirRef.current = 0; }}
                      onTouchCancel={() => touchDirRef.current = 0}
                      onMouseDown={() => touchDirRef.current = 1}
                      onMouseUp={() => touchDirRef.current = 0}
                      onMouseLeave={() => touchDirRef.current = 0}
                      className="w-16 h-16 rounded-2xl bg-white/12 border border-white/25 text-white text-2xl font-bold active:bg-white/30 active:scale-95 transition-all select-none touch-none flex items-center justify-center"
                    >
                      ▶
                    </button>
                  </div>

                  {/* Right side: action buttons */}
                  <div className="flex gap-2 items-end">
                    {/* Jump */}
                    <button
                      onTouchStart={(e) => { e.preventDefault(); touchJumpRef.current = true; }}
                      onTouchEnd={(e) => { e.preventDefault(); }}
                      onMouseDown={() => { touchJumpRef.current = true; }}
                      className="w-[72px] h-[72px] rounded-full bg-blue-500/25 border-2 border-blue-400/50 text-white font-bold active:bg-blue-500/50 active:scale-95 transition-all select-none touch-none flex flex-col items-center justify-center"
                    >
                      <span className="text-2xl">⬆</span>
                      <span className="text-[10px] opacity-70 -mt-0.5">PULAR</span>
                    </button>
                    {/* Attack */}
                    <button
                      onTouchStart={(e) => { e.preventDefault(); touchAttackRef.current = true; }}
                      onTouchEnd={(e) => { e.preventDefault(); }}
                      onMouseDown={() => { touchAttackRef.current = true; }}
                      className="w-[72px] h-[72px] rounded-full bg-red-500/25 border-2 border-red-400/50 text-white font-bold active:bg-red-500/50 active:scale-95 transition-all select-none touch-none flex flex-col items-center justify-center"
                    >
                      <span className="text-2xl">👊</span>
                      <span className="text-[10px] opacity-70 -mt-0.5">CORTE</span>
                    </button>
                  </div>
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
