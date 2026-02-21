/**
 * Volleyball 2D — Game Engine
 * Pure logic for rally resolution, AI decisions, and progression.
 */

import {
  type MatchState,
  type TeamState,
  type PlayerUnit,
  type ActionCategory,
  type ActionSubType,
  type PlayerProgress,
  type Position,
  SET_TARGET,
  MIN_DIFF,
  SETS_TO_WIN,
} from "./types";

// ── Team Factory ──

const POSITIONS: { pos: Position; label: string; skill: number; x: number; y: number }[] = [
  { pos: "setter", label: "Lev", skill: 75, x: 0.35, y: 0.45 },
  { pos: "opposite", label: "Opo", skill: 80, x: 0.15, y: 0.25 },
  { pos: "outside_left", label: "PE", skill: 78, x: 0.1, y: 0.55 },
  { pos: "outside_right", label: "PD", skill: 78, x: 0.4, y: 0.2 },
  { pos: "middle", label: "Cen", skill: 72, x: 0.35, y: 0.35 },
  { pos: "libero", label: "Lib", skill: 82, x: 0.2, y: 0.65 },
];

export function createTeam(isHome: boolean): TeamState {
  const mirror = isHome ? 0 : 1;
  return {
    players: POSITIONS.map((p) => ({
      position: p.pos,
      label: p.label,
      skill: p.skill,
      x: isHome ? p.x : 1 - p.x,
      y: p.y,
    })),
    score: 0,
    sets: 0,
  };
}

export function createMatch(): MatchState {
  return {
    homeTeam: createTeam(true),
    awayTeam: createTeam(false),
    currentSet: 1,
    serving: "home",
    rallyActive: false,
    rallyPhase: "waiting",
    lastAction: null,
    lastResult: null,
    pointWinner: null,
    animationFrame: 0,
    ballX: 0.25,
    ballY: 0.4,
    ballTargetX: 0.25,
    ballTargetY: 0.4,
  };
}

// ── Rally Resolution ──

interface ResolveParams {
  action: ActionSubType;
  category: ActionCategory;
  attackerSkill: number;
  difficulty: number; // AI level 1-3
}

const ACTION_BASE_CHANCE: Record<ActionSubType, number> = {
  simple: 85,
  jump: 60,
  line: 65,
  cross: 70,
  tip: 75,
  dig_low: 70,
  dig_high: 60,
  block: 50,
};

// Counter matrix: which defense beats which attack
const COUNTER_BONUS: Partial<Record<ActionSubType, Partial<Record<ActionSubType, number>>>> = {
  block: { line: 20, cross: 5, tip: -10 },
  dig_low: { tip: 25, cross: 15, line: 5 },
  dig_high: { cross: 20, line: 10, tip: -5 },
};

export function resolveAction(params: ResolveParams): boolean {
  const base = ACTION_BASE_CHANCE[params.action] ?? 65;
  const skillBonus = (params.attackerSkill - 60) * 0.5;
  const difficultyPenalty = (params.difficulty - 1) * 8;
  const chance = Math.min(95, Math.max(10, base + skillBonus - difficultyPenalty));
  return Math.random() * 100 <= chance;
}

export function resolveDefense(
  defenseAction: ActionSubType,
  attackAction: ActionSubType,
  defenderSkill: number,
  difficulty: number
): boolean {
  const base = ACTION_BASE_CHANCE[defenseAction] ?? 60;
  const counter = COUNTER_BONUS[defenseAction]?.[attackAction] ?? 0;
  const skillBonus = (defenderSkill - 60) * 0.4;
  const diffPenalty = (difficulty - 1) * 6;
  const chance = Math.min(90, Math.max(15, base + counter + skillBonus - diffPenalty));
  return Math.random() * 100 <= chance;
}

// ── AI Decision ──

export function aiChooseAction(
  category: ActionCategory,
  difficulty: number
): ActionSubType {
  const options: Record<ActionCategory, ActionSubType[]> = {
    serve: ["simple", "jump"],
    attack: ["line", "cross", "tip"],
    defend: ["dig_low", "dig_high", "block"],
  };

  const choices = options[category];
  if (difficulty <= 1) {
    // Random
    return choices[Math.floor(Math.random() * choices.length)];
  }
  if (difficulty === 2) {
    // Semi-strategic: prefer higher base chance
    const weighted = choices.map((c) => ({ c, w: ACTION_BASE_CHANCE[c] + Math.random() * 20 }));
    weighted.sort((a, b) => b.w - a.w);
    return weighted[0].c;
  }
  // High: best option with minor randomness
  const weighted = choices.map((c) => ({ c, w: ACTION_BASE_CHANCE[c] + Math.random() * 8 }));
  weighted.sort((a, b) => b.w - a.w);
  return weighted[0].c;
}

// ── Scoring ──

export function checkSetWin(score: number, opponentScore: number): boolean {
  return score >= SET_TARGET && score - opponentScore >= MIN_DIFF;
}

export function checkMatchWin(sets: number): boolean {
  return sets >= SETS_TO_WIN;
}

// ── Progression ──

export function createProgress(): PlayerProgress {
  return { level: 1, xp: 0, xpToNext: 100, wins: 0, losses: 0 };
}

export function addXP(progress: PlayerProgress, points: number): PlayerProgress {
  const p = { ...progress };
  p.xp += points;
  while (p.xp >= p.xpToNext) {
    p.xp -= p.xpToNext;
    p.level += 1;
    p.xpToNext = Math.floor(p.xpToNext * 1.3);
  }
  return p;
}

export function getDifficulty(level: number): number {
  if (level <= 3) return 1;
  if (level <= 7) return 2;
  return 3;
}

// ── Best attacker for setter ──

export function getBestAttacker(team: TeamState): PlayerUnit {
  const attackers = team.players.filter(
    (p) => p.position !== "setter" && p.position !== "libero"
  );
  attackers.sort((a, b) => b.skill - a.skill);
  return attackers[0] || team.players[0];
}

// ── Ball target positions ──

export function getActionBallTarget(
  action: ActionSubType,
  isHome: boolean
): { x: number; y: number } {
  const side = isHome ? 0.7 : 0.3; // Target opposite side
  switch (action) {
    case "simple": return { x: side, y: 0.5 };
    case "jump": return { x: side, y: 0.3 };
    case "line": return { x: side, y: 0.2 };
    case "cross": return { x: side, y: 0.7 };
    case "tip": return { x: isHome ? 0.55 : 0.45, y: 0.4 };
    case "dig_low": return { x: isHome ? 0.3 : 0.7, y: 0.6 };
    case "dig_high": return { x: isHome ? 0.25 : 0.75, y: 0.3 };
    case "block": return { x: 0.5, y: 0.3 };
    default: return { x: 0.5, y: 0.5 };
  }
}
