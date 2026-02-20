/**
 * Futsal Scoring Engine
 * Pure logic — no side effects, no database calls.
 * 100% driven by FutsalRules from tournament_rules.
 * Completely separate from the sets-based scoring engine.
 */

export interface FutsalRules {
  halves_count: number;          // default 2
  half_duration_minutes: number; // default 20
  halftime_interval_minutes: number; // default 10
  allow_draw: boolean;
  use_extra_time: boolean;
  extra_time_halves: number;     // default 2
  extra_time_minutes: number;    // default 5
  use_penalties: boolean;
  penalties_kicks: number;       // default 5
  golden_goal_extra_time: boolean;
  stop_clock_last_minutes: number; // default 5
  wo_enabled: boolean;
}

export type FutsalPeriod = "H1" | "H2" | "ET1" | "ET2" | "PENALTIES" | "COMPLETED";

export interface FutsalHistoryEvent {
  type: "GOAL" | "FOUL" | "PERIOD_START" | "PERIOD_END" | "PENALTY_SCORED" | "PENALTY_MISSED";
  team: "A" | "B";
  period: FutsalPeriod;
}

export interface FutsalLiveScore {
  period: FutsalPeriod;
  clock_minutes: number;
  clock_seconds: number;
  teamA_goals: number;
  teamB_goals: number;
  fouls: {
    teamA: number;
    teamB: number;
  };
  penalties: {
    active: boolean;
    teamA_goals: number;
    teamB_goals: number;
    teamA_kicks: number;
    teamB_kicks: number;
  };
  history: FutsalHistoryEvent[];
}

const REQUIRED_FUTSAL_KEYS: (keyof FutsalRules)[] = [
  "halves_count",
  "half_duration_minutes",
  "halftime_interval_minutes",
  "allow_draw",
  "use_extra_time",
  "extra_time_halves",
  "extra_time_minutes",
  "use_penalties",
  "penalties_kicks",
  "golden_goal_extra_time",
  "stop_clock_last_minutes",
  "wo_enabled",
];

/**
 * Validates that ALL required futsal rule fields are present and non-null.
 * Throws if any field is missing — no internal defaults are ever used.
 */
export function validateFutsalRules(rules: unknown): asserts rules is FutsalRules {
  if (!rules || typeof rules !== "object") {
    throw new Error("FutsalRules inválidas: objeto de regras ausente ou nulo.");
  }
  const missing: string[] = [];
  for (const key of REQUIRED_FUTSAL_KEYS) {
    if ((rules as Record<string, unknown>)[key] === undefined || (rules as Record<string, unknown>)[key] === null) {
      missing.push(key);
    }
  }
  if (missing.length > 0) {
    throw new Error(`FutsalRules inválidas: campos obrigatórios ausentes — ${missing.join(", ")}`);
  }
}

/**
 * Create initial score. Rules MUST be validated first — this function
 * does NOT apply any defaults.
 */
export function createInitialFutsalScore(rules: FutsalRules): FutsalLiveScore {
  validateFutsalRules(rules);
  return {
    period: "H1",
    clock_minutes: 0,
    clock_seconds: 0,
    teamA_goals: 0,
    teamB_goals: 0,
    fouls: { teamA: 0, teamB: 0 },
    penalties: {
      active: false,
      teamA_goals: 0,
      teamB_goals: 0,
      teamA_kicks: 0,
      teamB_kicks: 0,
    },
    history: [],
  };
}

function clone(s: FutsalLiveScore): FutsalLiveScore {
  return structuredClone(s);
}

/**
 * Replay the entire history to rebuild state.
 * This is the ONLY way to rebuild state — manual editing is forbidden.
 */
export function replayHistory(history: FutsalHistoryEvent[], rules: FutsalRules): FutsalLiveScore {
  let s = createInitialFutsalScore(rules);
  for (const event of history) {
    switch (event.type) {
      case "GOAL":
        s = applyGoalInternal(s, event.team, event.period, rules);
        break;
      case "FOUL":
        s = applyFoulInternal(s, event.team, event.period);
        break;
      case "PERIOD_END":
        s = applyPeriodEndInternal(s, event.period, rules);
        break;
      case "PENALTY_SCORED":
        s = applyPenaltyInternal(s, event.team, true, rules);
        break;
      case "PENALTY_MISSED":
        s = applyPenaltyInternal(s, event.team, false, rules);
        break;
      case "PERIOD_START":
        break;
    }
  }
  return s;
}

function applyGoalInternal(s: FutsalLiveScore, team: "A" | "B", period: FutsalPeriod, rules: FutsalRules): FutsalLiveScore {
  if (team === "A") s.teamA_goals++;
  else s.teamB_goals++;

  // Golden goal in extra time
  if (rules.golden_goal_extra_time && (period === "ET1" || period === "ET2")) {
    if (s.teamA_goals !== s.teamB_goals) {
      s.period = "COMPLETED";
    }
  }

  return s;
}

function applyFoulInternal(s: FutsalLiveScore, team: "A" | "B", _period: FutsalPeriod): FutsalLiveScore {
  if (team === "A") s.fouls.teamA++;
  else s.fouls.teamB++;
  return s;
}

function getNextPeriod(currentPeriod: FutsalPeriod, rules: FutsalRules, isDraw: boolean): FutsalPeriod {
  if (currentPeriod === "H1") return "H2";
  
  if (currentPeriod === "H2") {
    if (!isDraw || rules.allow_draw) return "COMPLETED";
    if (rules.use_extra_time) return "ET1";
    if (rules.use_penalties) return "PENALTIES";
    return "COMPLETED"; // forced draw
  }

  if (currentPeriod === "ET1") return "ET2";

  if (currentPeriod === "ET2") {
    if (!isDraw) return "COMPLETED";
    if (rules.use_penalties) return "PENALTIES";
    return "COMPLETED";
  }

  return "COMPLETED";
}

function applyPeriodEndInternal(s: FutsalLiveScore, _period: FutsalPeriod, rules: FutsalRules): FutsalLiveScore {
  const isDraw = s.teamA_goals === s.teamB_goals;
  s.period = getNextPeriod(s.period, rules, isDraw);
  if (s.period === "ET1") {
    s.fouls = { teamA: 0, teamB: 0 };
  }
  return s;
}

function applyPenaltyInternal(s: FutsalLiveScore, team: "A" | "B", scored: boolean, rules: FutsalRules): FutsalLiveScore {
  if (team === "A") {
    s.penalties.teamA_kicks++;
    if (scored) s.penalties.teamA_goals++;
  } else {
    s.penalties.teamB_kicks++;
    if (scored) s.penalties.teamB_goals++;
  }
  s.penalties.active = true;

  const totalKicks = rules.penalties_kicks;
  const aKicks = s.penalties.teamA_kicks;
  const bKicks = s.penalties.teamB_kicks;
  const aGoals = s.penalties.teamA_goals;
  const bGoals = s.penalties.teamB_goals;

  if (aKicks <= totalKicks && bKicks <= totalKicks) {
    const aRemaining = totalKicks - aKicks;
    const bRemaining = totalKicks - bKicks;
    if (aGoals > bGoals + bRemaining && aKicks >= bKicks) s.period = "COMPLETED";
    else if (bGoals > aGoals + aRemaining && bKicks >= aKicks) s.period = "COMPLETED";
    else if (aKicks >= totalKicks && bKicks >= totalKicks && aGoals !== bGoals) s.period = "COMPLETED";
  } else {
    if (aKicks === bKicks && aGoals !== bGoals) s.period = "COMPLETED";
  }

  return s;
}

// ── Public API ──────────────────────────────────────────

/**
 * Register a goal. Returns a NEW FutsalLiveScore (immutable).
 */
export function addGoal(score: FutsalLiveScore, team: "A" | "B", rules: FutsalRules): FutsalLiveScore {
  if (score.period === "COMPLETED" || score.period === "PENALTIES") return score;

  const s = clone(score);
  s.history.push({ type: "GOAL", team, period: s.period });
  
  if (team === "A") s.teamA_goals++;
  else s.teamB_goals++;

  // Golden goal in extra time
  if (rules.golden_goal_extra_time && (s.period === "ET1" || s.period === "ET2")) {
    if (s.teamA_goals !== s.teamB_goals) {
      s.period = "COMPLETED";
    }
  }

  return s;
}

/**
 * Register a foul. Returns a NEW FutsalLiveScore.
 */
export function addFoul(score: FutsalLiveScore, team: "A" | "B"): FutsalLiveScore {
  if (score.period === "COMPLETED" || score.period === "PENALTIES") return score;

  const s = clone(score);
  s.history.push({ type: "FOUL", team, period: s.period });
  
  if (team === "A") s.fouls.teamA++;
  else s.fouls.teamB++;

  return s;
}

/**
 * End the current period. Advances to next period or completes match.
 */
export function endPeriod(score: FutsalLiveScore, rules: FutsalRules): FutsalLiveScore {
  if (score.period === "COMPLETED" || score.period === "PENALTIES") return score;

  const s = clone(score);
  s.history.push({ type: "PERIOD_END", team: "A", period: s.period });

  const isDraw = s.teamA_goals === s.teamB_goals;
  s.period = getNextPeriod(s.period, rules, isDraw);

  if (s.period === "ET1") {
    s.fouls = { teamA: 0, teamB: 0 };
  }

  return s;
}

/**
 * Register a penalty kick. Returns a NEW FutsalLiveScore.
 */
export function addPenaltyKick(score: FutsalLiveScore, team: "A" | "B", scored: boolean, rules: FutsalRules): FutsalLiveScore {
  if (score.period !== "PENALTIES") return score;

  const s = clone(score);
  s.history.push({ type: scored ? "PENALTY_SCORED" : "PENALTY_MISSED", team, period: s.period });

  return applyPenaltyInternal(s, team, scored, rules);
}

/**
 * Undo the last event. Replays entire history from scratch.
 */
export function undoLastEvent(score: FutsalLiveScore, rules: FutsalRules): FutsalLiveScore {
  if (score.history.length === 0) return score;

  const newHistory = score.history.slice(0, -1);
  return replayHistory(newHistory, rules);
}

/**
 * Get the match winner (null if not completed or draw).
 */
export function getWinner(score: FutsalLiveScore): "A" | "B" | null {
  if (score.period !== "COMPLETED") return null;

  // Check penalties first
  if (score.penalties.active) {
    if (score.penalties.teamA_goals > score.penalties.teamB_goals) return "A";
    if (score.penalties.teamB_goals > score.penalties.teamA_goals) return "B";
  }

  if (score.teamA_goals > score.teamB_goals) return "A";
  if (score.teamB_goals > score.teamA_goals) return "B";
  return null; // draw
}

/**
 * Format the final score string.
 * e.g. "3-2" or "2-2 (4-3 pen)"
 */
export function formatFutsalScore(score: FutsalLiveScore): string {
  let result = `${score.teamA_goals}-${score.teamB_goals}`;
  if (score.penalties.active && (score.penalties.teamA_kicks > 0 || score.penalties.teamB_kicks > 0)) {
    result += ` (${score.penalties.teamA_goals}-${score.penalties.teamB_goals} pen)`;
  }
  return result;
}

/**
 * Get period display label.
 */
export function getPeriodLabel(period: FutsalPeriod): string {
  const labels: Record<FutsalPeriod, string> = {
    H1: "1º Tempo",
    H2: "2º Tempo",
    ET1: "Prorrogação 1",
    ET2: "Prorrogação 2",
    PENALTIES: "Pênaltis",
    COMPLETED: "Encerrado",
  };
  return labels[period];
}
