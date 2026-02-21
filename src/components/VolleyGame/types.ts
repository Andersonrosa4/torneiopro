/**
 * Volleyball 2D Strategic Mini-Game — Types
 * Decision-based, not physics-based.
 */

export type GameScreen = "menu" | "match" | "result";

export type Position = "setter" | "opposite" | "outside_left" | "outside_right" | "middle" | "libero";

export type ServeType = "simple" | "jump";
export type AttackType = "line" | "cross" | "tip";
export type DefenseType = "dig_low" | "dig_high" | "block";

export type ActionCategory = "serve" | "attack" | "defend";
export type ActionSubType = ServeType | AttackType | DefenseType;

export interface PlayerUnit {
  position: Position;
  label: string;
  skill: number; // 0–100
  x: number;
  y: number;
}

export interface TeamState {
  players: PlayerUnit[];
  score: number;
  sets: number;
}

export interface MatchState {
  homeTeam: TeamState;
  awayTeam: TeamState;
  currentSet: number;
  serving: "home" | "away";
  rallyActive: boolean;
  rallyPhase: "waiting" | "serve" | "receive" | "set" | "attack" | "defend" | "resolved";
  lastAction: string | null;
  lastResult: "success" | "fail" | null;
  pointWinner: "home" | "away" | null;
  animationFrame: number;
  ballX: number;
  ballY: number;
  ballTargetX: number;
  ballTargetY: number;
}

export interface PlayerProgress {
  level: number;
  xp: number;
  xpToNext: number;
  wins: number;
  losses: number;
}

export const POSITION_LABELS: Record<Position, string> = {
  setter: "Levantador",
  opposite: "Oposto",
  outside_left: "Ponteiro E",
  outside_right: "Ponteiro D",
  middle: "Central",
  libero: "Líbero",
};

export const ACTION_LABELS: Record<ActionSubType, string> = {
  simple: "Saque Simples",
  jump: "Saque Viagem",
  line: "Paralela",
  cross: "Diagonal",
  tip: "Largada",
  dig_low: "Defesa Baixa",
  dig_high: "Defesa Alta",
  block: "Bloqueio",
};

export const SET_TARGET = 21;
export const MIN_DIFF = 2;
export const SETS_TO_WIN = 2;
export const MAX_SETS = 3;
