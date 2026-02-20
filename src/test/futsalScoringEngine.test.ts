import { describe, it, expect } from "vitest";
import {
  createInitialFutsalScore,
  validateFutsalRules,
  addGoal,
  addFoul,
  addCard,
  endPeriod,
  addPenaltyKick,
  undoLastEvent,
  getWinner,
  formatFutsalScore,
  getPeriodLabel,
  replayHistory,
  FutsalRules,
  FutsalLiveScore,
} from "@/lib/futsalScoringEngine";

// ══════════════════════════════════════════════════════════
// Helpers — cada teste cria seu próprio rules/state
// ══════════════════════════════════════════════════════════

function defaultRules(overrides: Partial<FutsalRules> = {}): FutsalRules {
  return {
    halves_count: 2,
    half_duration_minutes: 20,
    halftime_interval_minutes: 10,
    allow_draw: false,
    use_extra_time: false,
    extra_time_halves: 2,
    extra_time_minutes: 5,
    use_penalties: true,
    penalties_kicks: 5,
    golden_goal_extra_time: false,
    stop_clock_last_minutes: 5,
    wo_enabled: true,
    ...overrides,
  };
}

/** Advance to H2 */
function advanceToH2(s: FutsalLiveScore, rules: FutsalRules): FutsalLiveScore {
  return endPeriod(s, rules);
}

/** Advance to penalties (0-0 draw, no ET) */
function advanceToPenalties(rules: FutsalRules): FutsalLiveScore {
  let s = createInitialFutsalScore(rules);
  s = endPeriod(s, rules); // H1→H2
  s = endPeriod(s, rules); // H2→PENALTIES
  return s;
}

// ══════════════════════════════════════════════════════════
// 1. INVARIANTES
// ══════════════════════════════════════════════════════════

describe("Futsal Invariants", () => {
  it("score is never negative", () => {
    const rules = defaultRules();
    let s = createInitialFutsalScore(rules);
    s = addGoal(s, "A", rules);
    s = addGoal(s, "B", rules);
    s = addFoul(s, "A");
    s = addFoul(s, "B");
    expect(s.teamA_goals).toBeGreaterThanOrEqual(0);
    expect(s.teamB_goals).toBeGreaterThanOrEqual(0);
    expect(s.fouls.teamA).toBeGreaterThanOrEqual(0);
    expect(s.fouls.teamB).toBeGreaterThanOrEqual(0);
  });

  it("COMPLETED match never accepts goals", () => {
    const rules = defaultRules();
    let s = createInitialFutsalScore(rules);
    s = addGoal(s, "A", rules);
    s = endPeriod(s, rules);
    s = endPeriod(s, rules);
    expect(s.period).toBe("COMPLETED");
    const before = s.teamA_goals;
    s = addGoal(s, "A", rules);
    expect(s.teamA_goals).toBe(before);
  });

  it("COMPLETED match never accepts fouls", () => {
    const rules = defaultRules();
    let s = createInitialFutsalScore(rules);
    s = addGoal(s, "A", rules);
    s = endPeriod(s, rules);
    s = endPeriod(s, rules);
    s = addFoul(s, "A");
    expect(s.fouls.teamA).toBe(0);
  });

  it("COMPLETED match never accepts cards", () => {
    const rules = defaultRules();
    let s = createInitialFutsalScore(rules);
    s = addGoal(s, "A", rules);
    s = endPeriod(s, rules);
    s = endPeriod(s, rules);
    s = addCard(s, "A", "yellow", 10);
    expect(s.cards.teamA_yellow).toBe(0);
  });

  it("undo never mutates original history", () => {
    const rules = defaultRules();
    let s = createInitialFutsalScore(rules);
    s = addGoal(s, "A", rules);
    s = addGoal(s, "B", rules);
    const originalHistory = [...s.history];
    undoLastEvent(s, rules);
    expect(s.history).toEqual(originalHistory);
  });

  it("penalties never accepted outside PENALTIES period", () => {
    const rules = defaultRules();
    let s = createInitialFutsalScore(rules);
    s = addPenaltyKick(s, "A", true, rules);
    expect(s.penalties.teamA_kicks).toBe(0);
  });
});

// ══════════════════════════════════════════════════════════
// A) Inicialização / Validação de Rules
// ══════════════════════════════════════════════════════════

describe("A) Initialization & Rules validation", () => {
  it("starts at H1 with 0-0", () => {
    const rules = defaultRules();
    const s = createInitialFutsalScore(rules);
    expect(s.period).toBe("H1");
    expect(s.teamA_goals).toBe(0);
    expect(s.teamB_goals).toBe(0);
    expect(s.fouls).toEqual({ teamA: 0, teamB: 0 });
    expect(s.cards).toEqual({ teamA_yellow: 0, teamA_red: 0, teamB_yellow: 0, teamB_red: 0 });
    expect(s.playerCards).toEqual([]);
    expect(s.penalties.active).toBe(false);
    expect(s.history).toEqual([]);
  });

  it("throws when rules is null", () => {
    expect(() => validateFutsalRules(null)).toThrow("objeto de regras ausente");
  });

  it("throws when rules is undefined", () => {
    expect(() => validateFutsalRules(undefined)).toThrow("objeto de regras ausente");
  });

  it("throws when rules is empty object", () => {
    expect(() => validateFutsalRules({})).toThrow("campos obrigatórios ausentes");
  });

  it("lists all missing fields", () => {
    try {
      validateFutsalRules({});
      expect.unreachable("should have thrown");
    } catch (e: any) {
      expect(e.message).toContain("halves_count");
      expect(e.message).toContain("half_duration_minutes");
      expect(e.message).toContain("allow_draw");
      expect(e.message).toContain("use_penalties");
      expect(e.message).toContain("golden_goal_extra_time");
      expect(e.message).toContain("wo_enabled");
    }
  });

  it("throws when single field is missing", () => {
    const incomplete = { ...defaultRules() } as any;
    delete incomplete.penalties_kicks;
    expect(() => validateFutsalRules(incomplete)).toThrow("penalties_kicks");
  });

  it("throws when a field is null", () => {
    const withNull = { ...defaultRules(), use_extra_time: null } as any;
    expect(() => validateFutsalRules(withNull)).toThrow("use_extra_time");
  });

  it("does NOT throw with complete rules", () => {
    expect(() => validateFutsalRules(defaultRules())).not.toThrow();
  });

  it("createInitialFutsalScore throws with incomplete rules", () => {
    expect(() => createInitialFutsalScore({} as any)).toThrow("campos obrigatórios ausentes");
  });

  it("createInitialFutsalScore throws with null", () => {
    expect(() => createInitialFutsalScore(null as any)).toThrow("objeto de regras ausente");
  });
});

// ══════════════════════════════════════════════════════════
// B) Vitória em Tempo Normal
// ══════════════════════════════════════════════════════════

describe("B) Normal time victory", () => {
  it("H1→H2→COMPLETED when not draw", () => {
    const rules = defaultRules();
    let s = createInitialFutsalScore(rules);
    s = addGoal(s, "A", rules);
    s = endPeriod(s, rules); // H1→H2
    expect(s.period).toBe("H2");
    s = endPeriod(s, rules); // H2→COMPLETED (1-0)
    expect(s.period).toBe("COMPLETED");
    expect(getWinner(s)).toBe("A");
  });

  it("registers goals correctly", () => {
    const rules = defaultRules();
    let s = createInitialFutsalScore(rules);
    s = addGoal(s, "A", rules);
    s = addGoal(s, "A", rules);
    s = addGoal(s, "B", rules);
    expect(s.teamA_goals).toBe(2);
    expect(s.teamB_goals).toBe(1);
  });

  it("formatFutsalScore correct", () => {
    const rules = defaultRules();
    let s = createInitialFutsalScore(rules);
    s = addGoal(s, "A", rules);
    s = addGoal(s, "A", rules);
    s = addGoal(s, "B", rules);
    expect(formatFutsalScore(s)).toBe("2-1");
  });

  it("winner B when B has more goals", () => {
    const rules = defaultRules();
    let s = createInitialFutsalScore(rules);
    s = addGoal(s, "B", rules);
    s = endPeriod(s, rules);
    s = endPeriod(s, rules);
    expect(getWinner(s)).toBe("B");
  });
});

// ══════════════════════════════════════════════════════════
// C) Empate com allow_draw
// ══════════════════════════════════════════════════════════

describe("C) Draw with allow_draw", () => {
  it("completes as draw when allow_draw=true", () => {
    const rules = defaultRules({ allow_draw: true });
    let s = createInitialFutsalScore(rules);
    s = addGoal(s, "A", rules);
    s = addGoal(s, "B", rules);
    s = endPeriod(s, rules);
    s = endPeriod(s, rules);
    expect(s.period).toBe("COMPLETED");
    expect(getWinner(s)).toBeNull();
  });

  it("0-0 draw when allow_draw=true", () => {
    const rules = defaultRules({ allow_draw: true });
    let s = createInitialFutsalScore(rules);
    s = endPeriod(s, rules);
    s = endPeriod(s, rules);
    expect(s.period).toBe("COMPLETED");
    expect(getWinner(s)).toBeNull();
  });
});

// ══════════════════════════════════════════════════════════
// D) Prorrogação (Extra Time)
// ══════════════════════════════════════════════════════════

describe("D) Extra time", () => {
  const rules = defaultRules({ use_extra_time: true, use_penalties: true });

  it("goes to ET1 on draw after H2", () => {
    let s = createInitialFutsalScore(rules);
    s = addGoal(s, "A", rules);
    s = addGoal(s, "B", rules);
    s = endPeriod(s, rules); // H1→H2
    s = endPeriod(s, rules); // H2→ET1
    expect(s.period).toBe("ET1");
  });

  it("ET1→ET2", () => {
    let s = createInitialFutsalScore(rules);
    s = addGoal(s, "A", rules);
    s = addGoal(s, "B", rules);
    s = endPeriod(s, rules);
    s = endPeriod(s, rules); // ET1
    s = endPeriod(s, rules); // ET1→ET2
    expect(s.period).toBe("ET2");
  });

  it("completes after ET2 if not draw", () => {
    let s = createInitialFutsalScore(rules);
    s = addGoal(s, "A", rules);
    s = addGoal(s, "B", rules);
    s = endPeriod(s, rules);
    s = endPeriod(s, rules);
    s = addGoal(s, "A", rules);
    s = endPeriod(s, rules);
    s = endPeriod(s, rules);
    expect(s.period).toBe("COMPLETED");
    expect(getWinner(s)).toBe("A");
  });

  it("goes to penalties after ET2 draw", () => {
    let s = createInitialFutsalScore(rules);
    s = addGoal(s, "A", rules);
    s = addGoal(s, "B", rules);
    s = endPeriod(s, rules);
    s = endPeriod(s, rules);
    s = endPeriod(s, rules);
    s = endPeriod(s, rules);
    expect(s.period).toBe("PENALTIES");
  });

  it("resets fouls when entering ET1", () => {
    let s = createInitialFutsalScore(rules);
    s = addFoul(s, "A");
    s = addFoul(s, "A");
    s = addFoul(s, "B");
    s = addGoal(s, "A", rules);
    s = addGoal(s, "B", rules);
    s = endPeriod(s, rules);
    s = endPeriod(s, rules); // ET1
    expect(s.fouls.teamA).toBe(0);
    expect(s.fouls.teamB).toBe(0);
  });
});

// ══════════════════════════════════════════════════════════
// E) Gol de Ouro (Golden Goal)
// ══════════════════════════════════════════════════════════

describe("E) Golden Goal", () => {
  const rules = defaultRules({ use_extra_time: true, golden_goal_extra_time: true });

  it("goal in ET ends match immediately", () => {
    let s = createInitialFutsalScore(rules);
    s = addGoal(s, "A", rules);
    s = addGoal(s, "B", rules);
    s = endPeriod(s, rules);
    s = endPeriod(s, rules); // ET1
    s = addGoal(s, "B", rules);
    expect(s.period).toBe("COMPLETED");
    expect(getWinner(s)).toBe("B");
  });

  it("goal in ET2 ends match", () => {
    let s = createInitialFutsalScore(rules);
    s = addGoal(s, "A", rules);
    s = addGoal(s, "B", rules);
    s = endPeriod(s, rules);
    s = endPeriod(s, rules); // ET1
    s = endPeriod(s, rules); // ET2
    s = addGoal(s, "A", rules);
    expect(s.period).toBe("COMPLETED");
    expect(getWinner(s)).toBe("A");
  });

  it("does NOT trigger in normal time H1", () => {
    let s = createInitialFutsalScore(rules);
    s = addGoal(s, "A", rules);
    expect(s.period).toBe("H1");
  });

  it("does NOT trigger in normal time H2", () => {
    let s = createInitialFutsalScore(rules);
    s = endPeriod(s, rules); // H2
    s = addGoal(s, "A", rules);
    expect(s.period).toBe("H2");
  });

  it("equalizing goal in ET does NOT end match", () => {
    let s = createInitialFutsalScore(rules);
    s = addGoal(s, "A", rules); // 1-0
    s = endPeriod(s, rules);
    s = addGoal(s, "B", rules); // 1-1
    s = endPeriod(s, rules); // ET1
    s = addGoal(s, "A", rules); // 2-1 → COMPLETED
    expect(s.period).toBe("COMPLETED");
  });
});

// ══════════════════════════════════════════════════════════
// F) Pênaltis
// ══════════════════════════════════════════════════════════

describe("F) Penalties", () => {
  it("goes directly to penalties when no ET", () => {
    const rules = defaultRules({ use_penalties: true });
    let s = advanceToPenalties(rules);
    expect(s.period).toBe("PENALTIES");
  });

  it("3-1 in initial series", () => {
    const rules = defaultRules({ use_penalties: true });
    let s = advanceToPenalties(rules);
    s = addPenaltyKick(s, "A", true, rules);
    s = addPenaltyKick(s, "B", false, rules);
    s = addPenaltyKick(s, "A", true, rules);
    s = addPenaltyKick(s, "B", false, rules);
    s = addPenaltyKick(s, "A", true, rules);
    s = addPenaltyKick(s, "B", true, rules);
    s = addPenaltyKick(s, "A", false, rules);
    s = addPenaltyKick(s, "B", false, rules);
    expect(s.period).toBe("COMPLETED");
    expect(getWinner(s)).toBe("A");
    expect(formatFutsalScore(s)).toBe("0-0 (3-1 pen)");
  });

  it("early termination when mathematically decided", () => {
    const rules = defaultRules({ use_penalties: true });
    let s = advanceToPenalties(rules);
    // A scores 3, B misses 3 → A wins early (B can't catch up)
    s = addPenaltyKick(s, "A", true, rules);
    s = addPenaltyKick(s, "B", false, rules);
    s = addPenaltyKick(s, "A", true, rules);
    s = addPenaltyKick(s, "B", false, rules);
    s = addPenaltyKick(s, "A", true, rules);
    s = addPenaltyKick(s, "B", false, rules);
    expect(s.period).toBe("COMPLETED");
    expect(getWinner(s)).toBe("A");
  });

  it("sudden death after 5-5", () => {
    const rules = defaultRules({ use_penalties: true });
    let s = advanceToPenalties(rules);
    for (let i = 0; i < 5; i++) {
      s = addPenaltyKick(s, "A", true, rules);
      s = addPenaltyKick(s, "B", true, rules);
    }
    expect(s.period).toBe("PENALTIES"); // still going
    s = addPenaltyKick(s, "A", true, rules);
    expect(s.period).toBe("PENALTIES"); // wait for B
    s = addPenaltyKick(s, "B", false, rules);
    expect(s.period).toBe("COMPLETED");
    expect(getWinner(s)).toBe("A");
  });

  it("sudden death continues when both score", () => {
    const rules = defaultRules({ use_penalties: true });
    let s = advanceToPenalties(rules);
    for (let i = 0; i < 5; i++) {
      s = addPenaltyKick(s, "A", true, rules);
      s = addPenaltyKick(s, "B", true, rules);
    }
    // Both score again
    s = addPenaltyKick(s, "A", true, rules);
    s = addPenaltyKick(s, "B", true, rules);
    expect(s.period).toBe("PENALTIES"); // still going
  });

  it("penalty kick not accepted outside PENALTIES", () => {
    const rules = defaultRules();
    let s = createInitialFutsalScore(rules);
    s = addPenaltyKick(s, "A", true, rules);
    expect(s.penalties.teamA_kicks).toBe(0);
  });

  it("custom penalties_kicks (3)", () => {
    const rules = defaultRules({ use_penalties: true, penalties_kicks: 3 });
    let s = advanceToPenalties(rules);
    s = addPenaltyKick(s, "A", true, rules);
    s = addPenaltyKick(s, "B", false, rules);
    s = addPenaltyKick(s, "A", true, rules);
    s = addPenaltyKick(s, "B", false, rules);
    // A has 2, B has 0 with 1 kick remaining for each. B can't catch up.
    // Actually B has 2 kicks done, 1 remaining. A has 2 goals. B max = 1. 2 > 1 → complete.
    expect(s.period).toBe("COMPLETED");
    expect(getWinner(s)).toBe("A");
  });
});

// ══════════════════════════════════════════════════════════
// G) Faltas
// ══════════════════════════════════════════════════════════

describe("G) Fouls", () => {
  it("tracks fouls per team", () => {
    const rules = defaultRules();
    let s = createInitialFutsalScore(rules);
    s = addFoul(s, "A");
    s = addFoul(s, "A");
    s = addFoul(s, "B");
    expect(s.fouls.teamA).toBe(2);
    expect(s.fouls.teamB).toBe(1);
  });

  it("does not add fouls when completed", () => {
    const rules = defaultRules();
    let s = createInitialFutsalScore(rules);
    s = addGoal(s, "A", rules);
    s = endPeriod(s, rules);
    s = endPeriod(s, rules);
    s = addFoul(s, "A");
    expect(s.fouls.teamA).toBe(0);
  });

  it("does not add fouls during penalties", () => {
    const rules = defaultRules();
    let s = advanceToPenalties(rules);
    s = addFoul(s, "A");
    expect(s.fouls.teamA).toBe(0);
  });

  it("records fouls in history", () => {
    const rules = defaultRules();
    let s = createInitialFutsalScore(rules);
    s = addFoul(s, "A");
    expect(s.history.length).toBe(1);
    expect(s.history[0].type).toBe("FOUL");
    expect(s.history[0].team).toBe("A");
  });
});

// ══════════════════════════════════════════════════════════
// Cards with jersey number
// ══════════════════════════════════════════════════════════

describe("Cards with jersey number", () => {
  it("tracks yellow cards per team", () => {
    const rules = defaultRules();
    let s = createInitialFutsalScore(rules);
    s = addCard(s, "A", "yellow", 10);
    s = addCard(s, "A", "yellow", 7);
    s = addCard(s, "B", "yellow", 5);
    expect(s.cards.teamA_yellow).toBe(2);
    expect(s.cards.teamB_yellow).toBe(1);
  });

  it("tracks red cards per team", () => {
    const rules = defaultRules();
    let s = createInitialFutsalScore(rules);
    s = addCard(s, "B", "red", 9);
    expect(s.cards.teamB_red).toBe(1);
    expect(s.playerCards[0].jerseyNumber).toBe(9);
    expect(s.playerCards[0].cardType).toBe("red");
  });

  it("2nd yellow → auto red", () => {
    const rules = defaultRules();
    let s = createInitialFutsalScore(rules);
    s = addCard(s, "A", "yellow", 10);
    expect(s.cards.teamA_red).toBe(0);
    s = addCard(s, "A", "yellow", 10);
    expect(s.cards.teamA_yellow).toBe(2);
    expect(s.cards.teamA_red).toBe(1);
    const autoReds = s.history.filter((e) => e.autoRed);
    expect(autoReds.length).toBe(1);
    expect(autoReds[0].jerseyNumber).toBe(10);
  });

  it("no auto red for different players", () => {
    const rules = defaultRules();
    let s = createInitialFutsalScore(rules);
    s = addCard(s, "A", "yellow", 10);
    s = addCard(s, "A", "yellow", 7);
    expect(s.cards.teamA_red).toBe(0);
  });

  it("no cards after COMPLETED", () => {
    const rules = defaultRules();
    let s = createInitialFutsalScore(rules);
    s = addGoal(s, "A", rules);
    s = endPeriod(s, rules);
    s = endPeriod(s, rules);
    s = addCard(s, "A", "yellow", 10);
    expect(s.cards.teamA_yellow).toBe(0);
  });

  it("records jersey in history", () => {
    const rules = defaultRules();
    let s = createInitialFutsalScore(rules);
    s = addCard(s, "A", "yellow", 10);
    s = addCard(s, "B", "red", 3);
    expect(s.history[0].jerseyNumber).toBe(10);
    expect(s.history[1].jerseyNumber).toBe(3);
  });
});

// ══════════════════════════════════════════════════════════
// H) Undo
// ══════════════════════════════════════════════════════════

describe("H) Undo", () => {
  it("undo goal", () => {
    const rules = defaultRules();
    let s = createInitialFutsalScore(rules);
    s = addGoal(s, "A", rules);
    expect(s.teamA_goals).toBe(1);
    s = undoLastEvent(s, rules);
    expect(s.teamA_goals).toBe(0);
  });

  it("undo foul", () => {
    const rules = defaultRules();
    let s = createInitialFutsalScore(rules);
    s = addFoul(s, "B");
    s = undoLastEvent(s, rules);
    expect(s.fouls.teamB).toBe(0);
  });

  it("undo period end", () => {
    const rules = defaultRules();
    let s = createInitialFutsalScore(rules);
    s = endPeriod(s, rules);
    expect(s.period).toBe("H2");
    s = undoLastEvent(s, rules);
    expect(s.period).toBe("H1");
  });

  it("undo penalty kick", () => {
    const rules = defaultRules();
    let s = advanceToPenalties(rules);
    s = addPenaltyKick(s, "A", true, rules);
    expect(s.penalties.teamA_goals).toBe(1);
    s = undoLastEvent(s, rules);
    expect(s.penalties.teamA_goals).toBe(0);
    expect(s.period).toBe("PENALTIES");
  });

  it("undo golden goal restores ET", () => {
    const rules = defaultRules({ use_extra_time: true, golden_goal_extra_time: true });
    let s = createInitialFutsalScore(rules);
    s = addGoal(s, "A", rules);
    s = addGoal(s, "B", rules);
    s = endPeriod(s, rules);
    s = endPeriod(s, rules); // ET1
    s = addGoal(s, "A", rules);
    expect(s.period).toBe("COMPLETED");
    s = undoLastEvent(s, rules);
    expect(s.period).toBe("ET1");
    expect(s.teamA_goals).toBe(1);
  });

  it("returns same state when no history", () => {
    const rules = defaultRules();
    const s = createInitialFutsalScore(rules);
    const result = undoLastEvent(s, rules);
    expect(result).toBe(s);
  });

  it("undo yellow card", () => {
    const rules = defaultRules();
    let s = createInitialFutsalScore(rules);
    s = addCard(s, "A", "yellow", 10);
    s = undoLastEvent(s, rules);
    expect(s.cards.teamA_yellow).toBe(0);
    expect(s.playerCards).toHaveLength(0);
  });

  it("undo auto-red from 2nd yellow", () => {
    const rules = defaultRules();
    let s = createInitialFutsalScore(rules);
    s = addCard(s, "A", "yellow", 10);
    s = addCard(s, "A", "yellow", 10); // triggers auto red
    expect(s.cards.teamA_red).toBe(1);
    // 3 undos: auto-red, 2nd yellow, 1st yellow
    s = undoLastEvent(s, rules); // remove auto RED
    s = undoLastEvent(s, rules); // remove 2nd YELLOW
    expect(s.cards.teamA_yellow).toBe(1);
    expect(s.cards.teamA_red).toBe(0);
  });

  it("multiple undos reconstruct correctly", () => {
    const rules = defaultRules();
    let s = createInitialFutsalScore(rules);
    s = addGoal(s, "A", rules);
    s = addFoul(s, "B");
    s = addGoal(s, "B", rules);
    s = undoLastEvent(s, rules);
    s = undoLastEvent(s, rules);
    s = undoLastEvent(s, rules);
    expect(s.teamA_goals).toBe(0);
    expect(s.teamB_goals).toBe(0);
    expect(s.fouls.teamB).toBe(0);
  });
});

// ══════════════════════════════════════════════════════════
// I) Bloqueios
// ══════════════════════════════════════════════════════════

describe("I) Blocking after completion", () => {
  it("goal blocked after COMPLETED", () => {
    const rules = defaultRules();
    let s = createInitialFutsalScore(rules);
    s = addGoal(s, "A", rules);
    s = endPeriod(s, rules);
    s = endPeriod(s, rules);
    s = addGoal(s, "A", rules);
    expect(s.teamA_goals).toBe(1);
  });

  it("foul blocked after COMPLETED", () => {
    const rules = defaultRules();
    let s = createInitialFutsalScore(rules);
    s = addGoal(s, "A", rules);
    s = endPeriod(s, rules);
    s = endPeriod(s, rules);
    s = addFoul(s, "B");
    expect(s.fouls.teamB).toBe(0);
  });

  it("endPeriod blocked after COMPLETED", () => {
    const rules = defaultRules();
    let s = createInitialFutsalScore(rules);
    s = addGoal(s, "A", rules);
    s = endPeriod(s, rules);
    s = endPeriod(s, rules);
    expect(s.period).toBe("COMPLETED");
    s = endPeriod(s, rules);
    expect(s.period).toBe("COMPLETED");
  });

  it("goal blocked during PENALTIES period", () => {
    const rules = defaultRules();
    let s = advanceToPenalties(rules);
    s = addGoal(s, "A", rules);
    expect(s.teamA_goals).toBe(0);
  });

  it("endPeriod blocked during PENALTIES", () => {
    const rules = defaultRules();
    let s = advanceToPenalties(rules);
    s = endPeriod(s, rules);
    expect(s.period).toBe("PENALTIES");
  });
});

// ══════════════════════════════════════════════════════════
// J) Testes Negativos
// ══════════════════════════════════════════════════════════

describe("J) Negative tests", () => {
  it("cannot init without rules", () => {
    expect(() => createInitialFutsalScore(null as any)).toThrow();
    expect(() => createInitialFutsalScore(undefined as any)).toThrow();
  });

  it("replayHistory with empty array returns initial state", () => {
    const rules = defaultRules();
    const s = replayHistory([], rules);
    expect(s.period).toBe("H1");
    expect(s.teamA_goals).toBe(0);
    expect(s.teamB_goals).toBe(0);
  });

  it("replayHistory with invalid rules throws", () => {
    expect(() => replayHistory([], {} as any)).toThrow();
  });
});

// ══════════════════════════════════════════════════════════
// Period labels & formatting
// ══════════════════════════════════════════════════════════

describe("Period labels & formatting", () => {
  it("all period labels", () => {
    expect(getPeriodLabel("H1")).toBe("1º Tempo");
    expect(getPeriodLabel("H2")).toBe("2º Tempo");
    expect(getPeriodLabel("ET1")).toBe("Prorrogação 1");
    expect(getPeriodLabel("ET2")).toBe("Prorrogação 2");
    expect(getPeriodLabel("PENALTIES")).toBe("Pênaltis");
    expect(getPeriodLabel("COMPLETED")).toBe("Encerrado");
  });

  it("formatFutsalScore with penalties", () => {
    const rules = defaultRules();
    let s = advanceToPenalties(rules);
    s = addPenaltyKick(s, "A", true, rules);
    s = addPenaltyKick(s, "B", false, rules);
    s = addPenaltyKick(s, "A", true, rules);
    s = addPenaltyKick(s, "B", false, rules);
    s = addPenaltyKick(s, "A", true, rules);
    s = addPenaltyKick(s, "B", false, rules);
    expect(formatFutsalScore(s)).toBe("0-0 (3-0 pen)");
  });

  it("formatFutsalScore without penalties", () => {
    const rules = defaultRules();
    let s = createInitialFutsalScore(rules);
    s = addGoal(s, "A", rules);
    expect(formatFutsalScore(s)).toBe("1-0");
  });
});

// ══════════════════════════════════════════════════════════
// Flow edge cases
// ══════════════════════════════════════════════════════════

describe("Flow edge cases", () => {
  it("draw without ET or penalties → forced COMPLETED", () => {
    const rules = defaultRules({
      allow_draw: false,
      use_extra_time: false,
      use_penalties: false,
    });
    let s = createInitialFutsalScore(rules);
    s = endPeriod(s, rules); // H2
    s = endPeriod(s, rules); // forced COMPLETED (no option)
    expect(s.period).toBe("COMPLETED");
    expect(getWinner(s)).toBeNull();
  });

  it("winner via penalties", () => {
    const rules = defaultRules({ use_extra_time: true, use_penalties: true });
    let s = createInitialFutsalScore(rules);
    s = endPeriod(s, rules);
    s = endPeriod(s, rules); // ET1
    s = endPeriod(s, rules); // ET2
    s = endPeriod(s, rules); // PENALTIES
    s = addPenaltyKick(s, "A", true, rules);
    s = addPenaltyKick(s, "B", false, rules);
    s = addPenaltyKick(s, "A", true, rules);
    s = addPenaltyKick(s, "B", false, rules);
    s = addPenaltyKick(s, "A", true, rules);
    s = addPenaltyKick(s, "B", false, rules);
    expect(s.period).toBe("COMPLETED");
    expect(getWinner(s)).toBe("A");
  });

  it("immutability: original state unchanged after operations", () => {
    const rules = defaultRules();
    const s1 = createInitialFutsalScore(rules);
    const s2 = addGoal(s1, "A", rules);
    expect(s1.teamA_goals).toBe(0);
    expect(s2.teamA_goals).toBe(1);
  });
});
