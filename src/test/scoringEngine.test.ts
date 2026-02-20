import { describe, it, expect } from "vitest";
import {
  createInitialLiveScore,
  applyPoint,
  undoLastPoint,
  formatPoints,
  formatSetScores,
  getSetsWon,
  LiveScore,
  ScoringRules,
} from "@/lib/scoringEngine";

// ── Helpers ──────────────────────────────────────────────

function defaultRules(overrides: Partial<ScoringRules> = {}): ScoringRules {
  return {
    sets_format: "best_of_3",
    games_to_win_set: 6,
    min_difference: 2,
    tiebreak_enabled: true,
    tiebreak_at: "6-6",
    tiebreak_points: 7,
    final_set_tiebreak_mode: "normal",
    super_tiebreak_enabled: false,
    super_tiebreak_points: 10,
    super_tiebreak_replaces_third_set: false,
    no_ad: false,
    golden_point: false,
    points_sequence: "0,15,30,40,ADV",
    ...overrides,
  };
}

/** Score N points for a player */
function scorePoints(s: LiveScore, player: 1 | 2, count: number, rules: ScoringRules): LiveScore {
  for (let i = 0; i < count; i++) s = applyPoint(s, player, rules);
  return s;
}

/** Win a game for a player (4 points with no opposition) */
function winGame(s: LiveScore, player: 1 | 2, rules: ScoringRules): LiveScore {
  return scorePoints(s, player, 4, rules);
}

/** Win N games for a player */
function winGames(s: LiveScore, player: 1 | 2, count: number, rules: ScoringRules): LiveScore {
  for (let i = 0; i < count; i++) s = winGame(s, player, rules);
  return s;
}

/** Win a set 6-0 */
function winSet(s: LiveScore, player: 1 | 2, rules: ScoringRules): LiveScore {
  return winGames(s, player, 6, rules);
}

// ── Tests ────────────────────────────────────────────────

describe("Scoring Engine — Deuce / Advantage (traditional)", () => {
  const rules = defaultRules();

  it("should reach deuce at 40-40", () => {
    let s = createInitialLiveScore(1);
    s = scorePoints(s, 1, 3, rules); // 40-0
    s = scorePoints(s, 2, 3, rules); // 40-40
    const [p1, p2] = formatPoints(s, rules);
    expect(p1).toBe("40");
    expect(p2).toBe("40");
  });

  it("should show AD for player 1 after deuce + point", () => {
    let s = createInitialLiveScore(1);
    s = scorePoints(s, 1, 3, rules);
    s = scorePoints(s, 2, 3, rules); // deuce
    s = applyPoint(s, 1, rules); // AD P1
    const [p1, p2] = formatPoints(s, rules);
    expect(p1).toBe("AD");
    expect(p2).toBe("40");
  });

  it("should return to deuce when AD player loses point", () => {
    let s = createInitialLiveScore(1);
    s = scorePoints(s, 1, 3, rules);
    s = scorePoints(s, 2, 3, rules); // deuce
    s = applyPoint(s, 1, rules); // AD P1
    s = applyPoint(s, 2, rules); // back to deuce
    const [p1, p2] = formatPoints(s, rules);
    expect(p1).toBe("40");
    expect(p2).toBe("40");
  });

  it("should win game after AD + point", () => {
    let s = createInitialLiveScore(1);
    s = scorePoints(s, 1, 3, rules);
    s = scorePoints(s, 2, 3, rules); // deuce
    s = applyPoint(s, 1, rules); // AD
    s = applyPoint(s, 1, rules); // game
    expect(s.currentGames[0]).toBe(1);
    expect(s.currentPoints).toEqual([0, 0]);
  });
});

describe("Scoring Engine — No-Ad", () => {
  const rules = defaultRules({ no_ad: true });

  it("should NEVER show ADV", () => {
    let s = createInitialLiveScore(1);
    s = scorePoints(s, 1, 3, rules);
    s = scorePoints(s, 2, 3, rules); // 40-40
    const [p1, p2] = formatPoints(s, rules);
    expect(p1).toBe("40");
    expect(p2).toBe("40");
    // No ADV possible
    expect(p1).not.toBe("AD");
    expect(p2).not.toBe("AD");
  });

  it("should win game on next point after 40-40", () => {
    let s = createInitialLiveScore(1);
    s = scorePoints(s, 1, 3, rules);
    s = scorePoints(s, 2, 3, rules); // 40-40
    s = applyPoint(s, 1, rules); // P1 wins game
    expect(s.currentGames[0]).toBe(1);
    expect(s.currentPoints).toEqual([0, 0]);
  });
});

describe("Scoring Engine — Golden Point", () => {
  const rules = defaultRules({ golden_point: true });

  it("should NEVER show ADV", () => {
    let s = createInitialLiveScore(1);
    s = scorePoints(s, 1, 3, rules);
    s = scorePoints(s, 2, 3, rules);
    const [p1, p2] = formatPoints(s, rules);
    expect(p1).toBe("40");
    expect(p2).toBe("40");
  });

  it("should end game at 40-40 with next point", () => {
    let s = createInitialLiveScore(1);
    s = scorePoints(s, 1, 3, rules);
    s = scorePoints(s, 2, 3, rules);
    s = applyPoint(s, 2, rules);
    expect(s.currentGames[1]).toBe(1);
  });
});

describe("Scoring Engine — Tiebreak", () => {
  const rules = defaultRules();

  it("should enter tiebreak at 6-6", () => {
    let s = createInitialLiveScore(1);
    // Get to 6-6
    for (let i = 0; i < 6; i++) {
      s = winGame(s, 1, rules);
      s = winGame(s, 2, rules);
    }
    expect(s.currentGames).toEqual([6, 6]);
    expect(s.isTiebreak).toBe(true);
  });

  it("should win tiebreak at 7-0", () => {
    let s = createInitialLiveScore(1);
    for (let i = 0; i < 6; i++) {
      s = winGame(s, 1, rules);
      s = winGame(s, 2, rules);
    }
    // Score 7 tiebreak points for P1
    s = scorePoints(s, 1, 7, rules);
    expect(s.isTiebreak).toBe(false);
    expect(s.sets.length).toBe(1);
    expect(s.sets[0][0]).toBe(7); // 7 games
    expect(s.sets[0][1]).toBe(6);
  });

  it("should require 2 point difference in tiebreak", () => {
    let s = createInitialLiveScore(1);
    for (let i = 0; i < 6; i++) {
      s = winGame(s, 1, rules);
      s = winGame(s, 2, rules);
    }
    // Reach 6-6 in tiebreak
    s = scorePoints(s, 1, 6, rules);
    s = scorePoints(s, 2, 6, rules);
    expect(s.isTiebreak).toBe(true); // still in tiebreak
    s = applyPoint(s, 1, rules); // 7-6 — not won yet
    expect(s.isTiebreak).toBe(true);
    s = applyPoint(s, 1, rules); // 8-6 — won
    expect(s.isTiebreak).toBe(false);
    expect(s.sets.length).toBe(1);
  });

  it("should switch server after 1st point then every 2", () => {
    let s = createInitialLiveScore(1);
    for (let i = 0; i < 6; i++) {
      s = winGame(s, 1, rules);
      s = winGame(s, 2, rules);
    }
    const serverBeforeTB = s.server;
    // Point 1: switch
    s = applyPoint(s, 1, rules);
    expect(s.server).not.toBe(serverBeforeTB);
    const serverAfter1 = s.server;
    // Point 2: no switch
    s = applyPoint(s, 1, rules);
    expect(s.server).toBe(serverAfter1);
    // Point 3: switch
    s = applyPoint(s, 1, rules);
    expect(s.server).not.toBe(serverAfter1);
  });
});

describe("Scoring Engine — Super Tiebreak (replaces 3rd set)", () => {
  const rules = defaultRules({
    super_tiebreak_enabled: true,
    super_tiebreak_replaces_third_set: true,
    super_tiebreak_points: 10,
  });

  it("should enter super tiebreak instead of 3rd set", () => {
    let s = createInitialLiveScore(1);
    s = winSet(s, 1, rules); // P1 wins set 1
    s = winSet(s, 2, rules); // P2 wins set 2
    // Now should be in super tiebreak
    expect(s.isSuperTiebreak).toBe(true);
  });

  it("should win super tiebreak at 10-0", () => {
    let s = createInitialLiveScore(1);
    s = winSet(s, 1, rules);
    s = winSet(s, 2, rules);
    s = scorePoints(s, 1, 10, rules);
    expect(s.completed).toBe(true);
    expect(s.winner).toBe(1);
  });

  it("should require 2 point diff in super tiebreak", () => {
    let s = createInitialLiveScore(1);
    s = winSet(s, 1, rules);
    s = winSet(s, 2, rules);
    // Reach 9-9
    s = scorePoints(s, 1, 9, rules);
    s = scorePoints(s, 2, 9, rules);
    expect(s.isSuperTiebreak).toBe(true);
    s = applyPoint(s, 1, rules); // 10-9
    expect(s.completed).toBe(false);
    s = applyPoint(s, 1, rules); // 11-9
    expect(s.completed).toBe(true);
    expect(s.winner).toBe(1);
  });
});

describe("Scoring Engine — Super Tiebreak (final set mode)", () => {
  const rules = defaultRules({
    super_tiebreak_enabled: true,
    super_tiebreak_replaces_third_set: false,
    final_set_tiebreak_mode: "super_tiebreak",
    super_tiebreak_points: 10,
  });

  it("should enter super tiebreak at 6-6 in final set", () => {
    let s = createInitialLiveScore(1);
    s = winSet(s, 1, rules); // set 1
    s = winSet(s, 2, rules); // set 2
    // Now in 3rd set, get to 6-6
    for (let i = 0; i < 6; i++) {
      s = winGame(s, 1, rules);
      s = winGame(s, 2, rules);
    }
    expect(s.isSuperTiebreak).toBe(true);
  });
});

describe("Scoring Engine — Final set advantage mode", () => {
  const rules = defaultRules({
    final_set_tiebreak_mode: "advantage",
  });

  it("should NOT enter tiebreak at 6-6 in final set", () => {
    let s = createInitialLiveScore(1);
    s = winSet(s, 1, rules);
    s = winSet(s, 2, rules);
    // 3rd set: get to 6-6
    for (let i = 0; i < 6; i++) {
      s = winGame(s, 1, rules);
      s = winGame(s, 2, rules);
    }
    expect(s.isTiebreak).toBe(false);
    expect(s.isSuperTiebreak).toBe(false);
    expect(s.currentGames).toEqual([6, 6]);
  });

  it("should win final set with 2 game advantage (8-6)", () => {
    let s = createInitialLiveScore(1);
    s = winSet(s, 1, rules);
    s = winSet(s, 2, rules);
    for (let i = 0; i < 6; i++) {
      s = winGame(s, 1, rules);
      s = winGame(s, 2, rules);
    }
    // 6-6, no TB. Win 2 more for P1 → 8-6
    s = winGame(s, 1, rules); // 7-6
    expect(s.sets.length).toBe(2); // not won yet (diff=1)
    s = winGame(s, 1, rules); // 8-6
    expect(s.sets.length).toBe(3);
    expect(s.completed).toBe(true);
    expect(s.winner).toBe(1);
  });
});

describe("Scoring Engine — Best of 5", () => {
  const rules = defaultRules({ sets_format: "best_of_5" });

  it("should require 3 sets to win", () => {
    let s = createInitialLiveScore(1);
    s = winSet(s, 1, rules);
    s = winSet(s, 1, rules);
    expect(s.completed).toBe(false);
    s = winSet(s, 1, rules);
    expect(s.completed).toBe(true);
    expect(s.winner).toBe(1);
    expect(s.sets.length).toBe(3);
  });
});

describe("Scoring Engine — Undo", () => {
  const rules = defaultRules();

  it("should undo last point correctly", () => {
    let s = createInitialLiveScore(1);
    s = applyPoint(s, 1, rules); // 15-0
    s = applyPoint(s, 1, rules); // 30-0
    s = undoLastPoint(s, rules); // back to 15-0
    const [p1, p2] = formatPoints(s, rules);
    expect(p1).toBe("15");
    expect(p2).toBe("0");
  });

  it("should preserve initial server through undo", () => {
    let s = createInitialLiveScore(2);
    s = applyPoint(s, 1, rules);
    s = undoLastPoint(s, rules);
    expect(s.server).toBe(2);
    expect(s.initialServer).toBe(2);
  });

  it("should undo from deuce correctly", () => {
    let s = createInitialLiveScore(1);
    s = scorePoints(s, 1, 3, rules);
    s = scorePoints(s, 2, 3, rules); // deuce
    s = applyPoint(s, 1, rules); // AD P1
    s = undoLastPoint(s, rules); // back to deuce
    const [p1, p2] = formatPoints(s, rules);
    expect(p1).toBe("40");
    expect(p2).toBe("40");
  });

  it("should undo no-ad game win correctly", () => {
    const noAdRules = defaultRules({ no_ad: true });
    let s = createInitialLiveScore(1);
    s = scorePoints(s, 1, 3, noAdRules);
    s = scorePoints(s, 2, 3, noAdRules); // 40-40
    s = applyPoint(s, 1, noAdRules); // game won
    expect(s.currentGames[0]).toBe(1);
    s = undoLastPoint(s, noAdRules); // back to 40-40
    expect(s.currentGames[0]).toBe(0);
    expect(s.currentPoints).toEqual([3, 3]);
  });

  it("should undo across tiebreak correctly", () => {
    let s = createInitialLiveScore(1);
    for (let i = 0; i < 6; i++) {
      s = winGame(s, 1, rules);
      s = winGame(s, 2, rules);
    }
    expect(s.isTiebreak).toBe(true);
    s = applyPoint(s, 1, rules); // TB 1-0
    s = undoLastPoint(s, rules);
    expect(s.isTiebreak).toBe(true);
    expect(s.tiebreakPoints).toEqual([0, 0]);
  });

  it("should undo super tiebreak point correctly", () => {
    const stRules = defaultRules({
      super_tiebreak_enabled: true,
      super_tiebreak_replaces_third_set: true,
    });
    let s = createInitialLiveScore(1);
    s = winSet(s, 1, stRules);
    s = winSet(s, 2, stRules);
    expect(s.isSuperTiebreak).toBe(true);
    s = applyPoint(s, 1, stRules); // ST 1-0
    s = undoLastPoint(s, stRules);
    expect(s.isSuperTiebreak).toBe(true);
    expect(s.superTiebreakPoints).toEqual([0, 0]);
  });

  it("should return same state when no history", () => {
    const s = createInitialLiveScore(1);
    const result = undoLastPoint(s, rules);
    expect(result).toBe(s); // same reference
  });
});

describe("Scoring Engine — Full match completion", () => {
  const rules = defaultRules();

  it("should complete a 6-0 6-0 match", () => {
    let s = createInitialLiveScore(1);
    s = winSet(s, 1, rules);
    s = winSet(s, 1, rules);
    expect(s.completed).toBe(true);
    expect(s.winner).toBe(1);
    expect(getSetsWon(s)).toEqual([2, 0]);
    expect(formatSetScores(s)).toBe("6-0  6-0");
  });

  it("should not allow points after match completed", () => {
    let s = createInitialLiveScore(1);
    s = winSet(s, 1, rules);
    s = winSet(s, 1, rules);
    const before = structuredClone(s);
    s = applyPoint(s, 2, rules); // should be no-op
    expect(s.pointHistory.length).toBe(before.pointHistory.length);
  });
});

describe("Scoring Engine — Server rotation", () => {
  const rules = defaultRules();

  it("should alternate server after each game", () => {
    let s = createInitialLiveScore(1);
    expect(s.server).toBe(1);
    s = winGame(s, 1, rules); // game 1 → server switches
    expect(s.server).toBe(2);
    s = winGame(s, 2, rules); // game 2 → server switches
    expect(s.server).toBe(1);
  });
});
