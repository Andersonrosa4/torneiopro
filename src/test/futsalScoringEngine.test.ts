import { describe, it, expect } from "vitest";
import {
  createInitialFutsalScore,
  addGoal,
  addFoul,
  endPeriod,
  addPenaltyKick,
  undoLastEvent,
  getWinner,
  formatFutsalScore,
  FutsalRules,
  FutsalLiveScore,
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

describe("Futsal Engine — Normal time victory", () => {
  const rules = defaultRules();

  it("should start at H1 with 0-0", () => {
    const s = createInitialFutsalScore();
    expect(s.period).toBe("H1");
    expect(s.teamA_goals).toBe(0);
    expect(s.teamB_goals).toBe(0);
  });

  it("should register goals correctly", () => {
    let s = createInitialFutsalScore();
    s = addGoal(s, "A", rules);
    s = addGoal(s, "A", rules);
    s = addGoal(s, "B", rules);
    expect(s.teamA_goals).toBe(2);
    expect(s.teamB_goals).toBe(1);
  });

  it("should complete match after H2 when not drawn", () => {
    let s = createInitialFutsalScore();
    s = addGoal(s, "A", rules);
    s = endPeriod(s, rules); // H1 → H2
    expect(s.period).toBe("H2");
    s = endPeriod(s, rules); // H2 → COMPLETED (1-0, not draw)
    expect(s.period).toBe("COMPLETED");
    expect(getWinner(s)).toBe("A");
  });

  it("should format score correctly", () => {
    let s = createInitialFutsalScore();
    s = addGoal(s, "A", rules);
    s = addGoal(s, "A", rules);
    s = addGoal(s, "B", rules);
    expect(formatFutsalScore(s)).toBe("2-1");
  });
});

describe("Futsal Engine — Draw allowed", () => {
  const rules = defaultRules({ allow_draw: true });

  it("should complete as draw when allow_draw = true", () => {
    let s = createInitialFutsalScore();
    s = addGoal(s, "A", rules);
    s = addGoal(s, "B", rules);
    s = endPeriod(s, rules); // H1 → H2
    s = endPeriod(s, rules); // H2 → COMPLETED (1-1, draw allowed)
    expect(s.period).toBe("COMPLETED");
    expect(getWinner(s)).toBeNull();
  });
});

describe("Futsal Engine — Extra time", () => {
  const rules = defaultRules({ use_extra_time: true, use_penalties: true });

  it("should go to extra time on draw", () => {
    let s = createInitialFutsalScore();
    s = addGoal(s, "A", rules);
    s = addGoal(s, "B", rules);
    s = endPeriod(s, rules); // H1 → H2
    s = endPeriod(s, rules); // H2 → ET1
    expect(s.period).toBe("ET1");
  });

  it("should complete after ET2 if not draw", () => {
    let s = createInitialFutsalScore();
    s = addGoal(s, "A", rules);
    s = addGoal(s, "B", rules);
    s = endPeriod(s, rules); // → H2
    s = endPeriod(s, rules); // → ET1
    s = addGoal(s, "A", rules); // 2-1
    s = endPeriod(s, rules); // → ET2
    s = endPeriod(s, rules); // → COMPLETED
    expect(s.period).toBe("COMPLETED");
    expect(getWinner(s)).toBe("A");
  });

  it("should go to penalties after ET2 draw", () => {
    let s = createInitialFutsalScore();
    s = addGoal(s, "A", rules);
    s = addGoal(s, "B", rules);
    s = endPeriod(s, rules); // → H2
    s = endPeriod(s, rules); // → ET1
    s = endPeriod(s, rules); // → ET2
    s = endPeriod(s, rules); // → PENALTIES
    expect(s.period).toBe("PENALTIES");
  });

  it("should reset fouls when entering extra time", () => {
    let s = createInitialFutsalScore();
    s = addFoul(s, "A");
    s = addFoul(s, "A");
    s = addGoal(s, "A", rules);
    s = addGoal(s, "B", rules);
    s = endPeriod(s, rules); // → H2
    s = endPeriod(s, rules); // → ET1
    expect(s.fouls.teamA).toBe(0);
  });
});

describe("Futsal Engine — Golden goal", () => {
  const rules = defaultRules({ use_extra_time: true, golden_goal_extra_time: true });

  it("should end match immediately on extra time goal", () => {
    let s = createInitialFutsalScore();
    s = addGoal(s, "A", rules);
    s = addGoal(s, "B", rules);
    s = endPeriod(s, rules); // → H2
    s = endPeriod(s, rules); // → ET1
    s = addGoal(s, "B", rules); // Golden goal! 1-2
    expect(s.period).toBe("COMPLETED");
    expect(getWinner(s)).toBe("B");
  });

  it("should NOT trigger golden goal in normal time", () => {
    let s = createInitialFutsalScore();
    s = addGoal(s, "A", rules); // 1-0 in H1
    expect(s.period).toBe("H1"); // still in H1
  });
});

describe("Futsal Engine — Penalties", () => {
  const rules = defaultRules({ use_penalties: true });

  it("should go directly to penalties when no extra time", () => {
    let s = createInitialFutsalScore();
    s = endPeriod(s, rules); // → H2
    s = endPeriod(s, rules); // → PENALTIES (0-0 draw, no ET)
    expect(s.period).toBe("PENALTIES");
  });

  it("should win penalties 3-1 after 5 kicks", () => {
    let s = createInitialFutsalScore();
    s = endPeriod(s, rules);
    s = endPeriod(s, rules); // → PENALTIES

    // A scores, B misses — alternating
    s = addPenaltyKick(s, "A", true, rules);  // A: 1/1
    s = addPenaltyKick(s, "B", false, rules); // B: 0/1
    s = addPenaltyKick(s, "A", true, rules);  // A: 2/2
    s = addPenaltyKick(s, "B", false, rules); // B: 0/2
    s = addPenaltyKick(s, "A", true, rules);  // A: 3/3
    s = addPenaltyKick(s, "B", true, rules);  // B: 1/3
    // A leads 3-1, B has max 2 remaining, can only reach 3. But A has 3.
    // B needs to score remaining 2 to tie (3-3). Still possible. Continue.
    s = addPenaltyKick(s, "A", false, rules); // A: 3/4
    s = addPenaltyKick(s, "B", false, rules); // B: 1/4 — now B can max reach 2, A has 3 → decided
    expect(s.period).toBe("COMPLETED");
    expect(getWinner(s)).toBe("A");
    expect(formatFutsalScore(s)).toBe("0-0 (3-1 pen)");
  });

  it("should enter sudden death when tied after initial kicks", () => {
    let s = createInitialFutsalScore();
    s = endPeriod(s, rules);
    s = endPeriod(s, rules); // → PENALTIES

    // Both score all 5
    for (let i = 0; i < 5; i++) {
      s = addPenaltyKick(s, "A", true, rules);
      s = addPenaltyKick(s, "B", true, rules);
    }
    expect(s.period).toBe("PENALTIES"); // still tied 5-5

    // Sudden death: A scores, B misses
    s = addPenaltyKick(s, "A", true, rules); // 6-5 but B hasn't kicked
    expect(s.period).toBe("PENALTIES");
    s = addPenaltyKick(s, "B", false, rules); // 6-5, both kicked 6 → decided
    expect(s.period).toBe("COMPLETED");
    expect(getWinner(s)).toBe("A");
  });
});

describe("Futsal Engine — Fouls", () => {
  const rules = defaultRules();

  it("should track fouls per team", () => {
    let s = createInitialFutsalScore();
    s = addFoul(s, "A");
    s = addFoul(s, "A");
    s = addFoul(s, "B");
    expect(s.fouls.teamA).toBe(2);
    expect(s.fouls.teamB).toBe(1);
  });

  it("should not add fouls when completed", () => {
    let s = createInitialFutsalScore();
    s = addGoal(s, "A", rules);
    s = endPeriod(s, rules);
    s = endPeriod(s, rules); // COMPLETED
    s = addFoul(s, "A");
    expect(s.fouls.teamA).toBe(0);
  });
});

describe("Futsal Engine — Undo", () => {
  const rules = defaultRules();

  it("should undo a goal", () => {
    let s = createInitialFutsalScore();
    s = addGoal(s, "A", rules);
    expect(s.teamA_goals).toBe(1);
    s = undoLastEvent(s, rules);
    expect(s.teamA_goals).toBe(0);
  });

  it("should undo a foul", () => {
    let s = createInitialFutsalScore();
    s = addFoul(s, "B");
    s = undoLastEvent(s, rules);
    expect(s.fouls.teamB).toBe(0);
  });

  it("should undo period end", () => {
    let s = createInitialFutsalScore();
    s = endPeriod(s, rules); // H1 → H2
    expect(s.period).toBe("H2");
    s = undoLastEvent(s, rules);
    expect(s.period).toBe("H1");
  });

  it("should undo golden goal", () => {
    const goldenRules = defaultRules({ use_extra_time: true, golden_goal_extra_time: true });
    let s = createInitialFutsalScore();
    s = addGoal(s, "A", goldenRules);
    s = addGoal(s, "B", goldenRules);
    s = endPeriod(s, goldenRules); // → H2
    s = endPeriod(s, goldenRules); // → ET1
    s = addGoal(s, "A", goldenRules); // golden goal → COMPLETED
    expect(s.period).toBe("COMPLETED");
    s = undoLastEvent(s, goldenRules);
    expect(s.period).toBe("ET1");
    expect(s.teamA_goals).toBe(1);
  });

  it("should return same state when no history", () => {
    const s = createInitialFutsalScore();
    const result = undoLastEvent(s, rules);
    expect(result).toBe(s);
  });

  it("should undo penalty kick", () => {
    let s = createInitialFutsalScore();
    s = endPeriod(s, rules);
    s = endPeriod(s, rules); // → PENALTIES
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
    let s = createInitialFutsalScore();
    s = addGoal(s, "A", rules);
    s = endPeriod(s, rules);
    s = endPeriod(s, rules);
    expect(s.period).toBe("COMPLETED");
    s = addGoal(s, "A", rules);
    expect(s.teamA_goals).toBe(1); // unchanged
  });
});
