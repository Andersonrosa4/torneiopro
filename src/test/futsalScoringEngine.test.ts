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
  FutsalRules,
} from "@/lib/futsalScoringEngine";

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

// ── Validation ──────────────────────────────────────────

describe("Futsal Engine — Rules validation", () => {
  it("should throw when rules is null", () => {
    expect(() => validateFutsalRules(null)).toThrow("objeto de regras ausente");
  });

  it("should throw when rules is undefined", () => {
    expect(() => validateFutsalRules(undefined)).toThrow("objeto de regras ausente");
  });

  it("should throw when rules is empty object", () => {
    expect(() => validateFutsalRules({})).toThrow("campos obrigatórios ausentes");
  });

  it("should list all missing fields", () => {
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

  it("should throw when a single required field is missing", () => {
    const incomplete = { ...defaultRules() } as any;
    delete incomplete.penalties_kicks;
    expect(() => validateFutsalRules(incomplete)).toThrow("penalties_kicks");
  });

  it("should throw when a field is null", () => {
    const withNull = { ...defaultRules(), use_extra_time: null } as any;
    expect(() => validateFutsalRules(withNull)).toThrow("use_extra_time");
  });

  it("should NOT throw with complete valid rules", () => {
    expect(() => validateFutsalRules(defaultRules())).not.toThrow();
  });

  it("createInitialFutsalScore should throw with incomplete rules", () => {
    expect(() => createInitialFutsalScore({} as any)).toThrow("campos obrigatórios ausentes");
  });

  it("createInitialFutsalScore should throw with null rules", () => {
    expect(() => createInitialFutsalScore(null as any)).toThrow("objeto de regras ausente");
  });
});

// ── Normal time ─────────────────────────────────────────

describe("Futsal Engine — Normal time victory", () => {
  const rules = defaultRules();

  it("should start at H1 with 0-0", () => {
    const s = createInitialFutsalScore(rules);
    expect(s.period).toBe("H1");
    expect(s.teamA_goals).toBe(0);
    expect(s.teamB_goals).toBe(0);
  });

  it("should register goals correctly", () => {
    let s = createInitialFutsalScore(rules);
    s = addGoal(s, "A", rules);
    s = addGoal(s, "A", rules);
    s = addGoal(s, "B", rules);
    expect(s.teamA_goals).toBe(2);
    expect(s.teamB_goals).toBe(1);
  });

  it("should complete match after H2 when not drawn", () => {
    let s = createInitialFutsalScore(rules);
    s = addGoal(s, "A", rules);
    s = endPeriod(s, rules);
    expect(s.period).toBe("H2");
    s = endPeriod(s, rules);
    expect(s.period).toBe("COMPLETED");
    expect(getWinner(s)).toBe("A");
  });

  it("should format score correctly", () => {
    let s = createInitialFutsalScore(rules);
    s = addGoal(s, "A", rules);
    s = addGoal(s, "A", rules);
    s = addGoal(s, "B", rules);
    expect(formatFutsalScore(s)).toBe("2-1");
  });
});

describe("Futsal Engine — Draw allowed", () => {
  const rules = defaultRules({ allow_draw: true });

  it("should complete as draw when allow_draw = true", () => {
    let s = createInitialFutsalScore(rules);
    s = addGoal(s, "A", rules);
    s = addGoal(s, "B", rules);
    s = endPeriod(s, rules);
    s = endPeriod(s, rules);
    expect(s.period).toBe("COMPLETED");
    expect(getWinner(s)).toBeNull();
  });
});

describe("Futsal Engine — Extra time", () => {
  const rules = defaultRules({ use_extra_time: true, use_penalties: true });

  it("should go to extra time on draw", () => {
    let s = createInitialFutsalScore(rules);
    s = addGoal(s, "A", rules);
    s = addGoal(s, "B", rules);
    s = endPeriod(s, rules);
    s = endPeriod(s, rules);
    expect(s.period).toBe("ET1");
  });

  it("should complete after ET2 if not draw", () => {
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

  it("should go to penalties after ET2 draw", () => {
    let s = createInitialFutsalScore(rules);
    s = addGoal(s, "A", rules);
    s = addGoal(s, "B", rules);
    s = endPeriod(s, rules);
    s = endPeriod(s, rules);
    s = endPeriod(s, rules);
    s = endPeriod(s, rules);
    expect(s.period).toBe("PENALTIES");
  });

  it("should reset fouls when entering extra time", () => {
    let s = createInitialFutsalScore(rules);
    s = addFoul(s, "A");
    s = addFoul(s, "A");
    s = addGoal(s, "A", rules);
    s = addGoal(s, "B", rules);
    s = endPeriod(s, rules);
    s = endPeriod(s, rules);
    expect(s.fouls.teamA).toBe(0);
  });
});

describe("Futsal Engine — Golden goal", () => {
  const rules = defaultRules({ use_extra_time: true, golden_goal_extra_time: true });

  it("should end match immediately on extra time goal", () => {
    let s = createInitialFutsalScore(rules);
    s = addGoal(s, "A", rules);
    s = addGoal(s, "B", rules);
    s = endPeriod(s, rules);
    s = endPeriod(s, rules);
    s = addGoal(s, "B", rules);
    expect(s.period).toBe("COMPLETED");
    expect(getWinner(s)).toBe("B");
  });

  it("should NOT trigger golden goal in normal time", () => {
    let s = createInitialFutsalScore(rules);
    s = addGoal(s, "A", rules);
    expect(s.period).toBe("H1");
  });
});

describe("Futsal Engine — Penalties", () => {
  const rules = defaultRules({ use_penalties: true });

  it("should go directly to penalties when no extra time", () => {
    let s = createInitialFutsalScore(rules);
    s = endPeriod(s, rules);
    s = endPeriod(s, rules);
    expect(s.period).toBe("PENALTIES");
  });

  it("should win penalties 3-1 after 5 kicks", () => {
    let s = createInitialFutsalScore(rules);
    s = endPeriod(s, rules);
    s = endPeriod(s, rules);
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

  it("should enter sudden death when tied after initial kicks", () => {
    let s = createInitialFutsalScore(rules);
    s = endPeriod(s, rules);
    s = endPeriod(s, rules);
    for (let i = 0; i < 5; i++) {
      s = addPenaltyKick(s, "A", true, rules);
      s = addPenaltyKick(s, "B", true, rules);
    }
    expect(s.period).toBe("PENALTIES");
    s = addPenaltyKick(s, "A", true, rules);
    expect(s.period).toBe("PENALTIES");
    s = addPenaltyKick(s, "B", false, rules);
    expect(s.period).toBe("COMPLETED");
    expect(getWinner(s)).toBe("A");
  });
});

describe("Futsal Engine — Fouls", () => {
  const rules = defaultRules();

  it("should track fouls per team", () => {
    let s = createInitialFutsalScore(rules);
    s = addFoul(s, "A");
    s = addFoul(s, "A");
    s = addFoul(s, "B");
    expect(s.fouls.teamA).toBe(2);
    expect(s.fouls.teamB).toBe(1);
  });

  it("should not add fouls when completed", () => {
    let s = createInitialFutsalScore(rules);
    s = addGoal(s, "A", rules);
    s = endPeriod(s, rules);
    s = endPeriod(s, rules);
    s = addFoul(s, "A");
    expect(s.fouls.teamA).toBe(0);
  });
});

describe("Futsal Engine — Undo", () => {
  const rules = defaultRules();

  it("should undo a goal", () => {
    let s = createInitialFutsalScore(rules);
    s = addGoal(s, "A", rules);
    expect(s.teamA_goals).toBe(1);
    s = undoLastEvent(s, rules);
    expect(s.teamA_goals).toBe(0);
  });

  it("should undo a foul", () => {
    let s = createInitialFutsalScore(rules);
    s = addFoul(s, "B");
    s = undoLastEvent(s, rules);
    expect(s.fouls.teamB).toBe(0);
  });

  it("should undo period end", () => {
    let s = createInitialFutsalScore(rules);
    s = endPeriod(s, rules);
    expect(s.period).toBe("H2");
    s = undoLastEvent(s, rules);
    expect(s.period).toBe("H1");
  });

  it("should undo golden goal", () => {
    const goldenRules = defaultRules({ use_extra_time: true, golden_goal_extra_time: true });
    let s = createInitialFutsalScore(goldenRules);
    s = addGoal(s, "A", goldenRules);
    s = addGoal(s, "B", goldenRules);
    s = endPeriod(s, goldenRules);
    s = endPeriod(s, goldenRules);
    s = addGoal(s, "A", goldenRules);
    expect(s.period).toBe("COMPLETED");
    s = undoLastEvent(s, goldenRules);
    expect(s.period).toBe("ET1");
    expect(s.teamA_goals).toBe(1);
  });

  it("should return same state when no history", () => {
    const s = createInitialFutsalScore(rules);
    const result = undoLastEvent(s, rules);
    expect(result).toBe(s);
  });

  it("should undo penalty kick", () => {
    let s = createInitialFutsalScore(rules);
    s = endPeriod(s, rules);
    s = endPeriod(s, rules);
    s = addPenaltyKick(s, "A", true, rules);
    expect(s.penalties.teamA_goals).toBe(1);
    s = undoLastEvent(s, rules);
    expect(s.penalties.teamA_goals).toBe(0);
    expect(s.period).toBe("PENALTIES");
  });
});

describe("Futsal Engine — No goals allowed after completion", () => {
  const rules = defaultRules();

  it("should not register goals after match completed", () => {
    let s = createInitialFutsalScore(rules);
    s = addGoal(s, "A", rules);
    s = endPeriod(s, rules);
    s = endPeriod(s, rules);
    expect(s.period).toBe("COMPLETED");
    s = addGoal(s, "A", rules);
    expect(s.teamA_goals).toBe(1);
  });
});

describe("Futsal Engine — Cards", () => {
  const rules = defaultRules();

  it("should track yellow cards per team", () => {
    let s = createInitialFutsalScore(rules);
    s = addCard(s, "A", "yellow");
    s = addCard(s, "A", "yellow");
    s = addCard(s, "B", "yellow");
    expect(s.cards.teamA_yellow).toBe(2);
    expect(s.cards.teamB_yellow).toBe(1);
    expect(s.cards.teamA_red).toBe(0);
  });

  it("should track red cards per team", () => {
    let s = createInitialFutsalScore(rules);
    s = addCard(s, "B", "red");
    expect(s.cards.teamB_red).toBe(1);
    expect(s.cards.teamB_yellow).toBe(0);
  });

  it("should track mixed cards", () => {
    let s = createInitialFutsalScore(rules);
    s = addCard(s, "A", "yellow");
    s = addCard(s, "A", "red");
    s = addCard(s, "B", "yellow");
    s = addCard(s, "B", "yellow");
    s = addCard(s, "B", "red");
    expect(s.cards.teamA_yellow).toBe(1);
    expect(s.cards.teamA_red).toBe(1);
    expect(s.cards.teamB_yellow).toBe(2);
    expect(s.cards.teamB_red).toBe(1);
  });

  it("should not add cards after match completed", () => {
    let s = createInitialFutsalScore(rules);
    s = addGoal(s, "A", rules);
    s = endPeriod(s, rules);
    s = endPeriod(s, rules);
    expect(s.period).toBe("COMPLETED");
    s = addCard(s, "A", "yellow");
    expect(s.cards.teamA_yellow).toBe(0);
  });

  it("should record cards in history", () => {
    let s = createInitialFutsalScore(rules);
    s = addCard(s, "A", "yellow");
    s = addCard(s, "B", "red");
    expect(s.history).toHaveLength(2);
    expect(s.history[0].type).toBe("YELLOW_CARD");
    expect(s.history[1].type).toBe("RED_CARD");
  });

  it("should undo yellow card", () => {
    let s = createInitialFutsalScore(rules);
    s = addCard(s, "A", "yellow");
    expect(s.cards.teamA_yellow).toBe(1);
    s = undoLastEvent(s, rules);
    expect(s.cards.teamA_yellow).toBe(0);
  });

  it("should undo red card", () => {
    let s = createInitialFutsalScore(rules);
    s = addCard(s, "B", "red");
    expect(s.cards.teamB_red).toBe(1);
    s = undoLastEvent(s, rules);
    expect(s.cards.teamB_red).toBe(0);
  });
});
