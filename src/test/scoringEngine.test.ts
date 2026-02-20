import { describe, it, expect } from "vitest";
import {
  createInitialLiveScore,
  applyPoint,
  undoLastPoint,
  formatPoints,
  formatSetScores,
  getSetsWon,
  getTotalGames,
  LiveScore,
  ScoringRules,
} from "@/lib/scoringEngine";

// ══════════════════════════════════════════════════════════
// Helpers — cada teste cria seu próprio rules/state
// ══════════════════════════════════════════════════════════

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

function scorePoints(s: LiveScore, player: 1 | 2, count: number, rules: ScoringRules): LiveScore {
  for (let i = 0; i < count; i++) s = applyPoint(s, player, rules);
  return s;
}

function winGame(s: LiveScore, player: 1 | 2, rules: ScoringRules): LiveScore {
  return scorePoints(s, player, 4, rules);
}

function winGames(s: LiveScore, player: 1 | 2, count: number, rules: ScoringRules): LiveScore {
  for (let i = 0; i < count; i++) s = winGame(s, player, rules);
  return s;
}

function winSet(s: LiveScore, player: 1 | 2, rules: ScoringRules): LiveScore {
  return winGames(s, player, 6, rules);
}

/** Get to 6-6 (tiebreak position) */
function getTo66(s: LiveScore, rules: ScoringRules): LiveScore {
  for (let i = 0; i < 6; i++) {
    s = winGame(s, 1, rules);
    s = winGame(s, 2, rules);
  }
  return s;
}

// ══════════════════════════════════════════════════════════
// 1. INVARIANTES
// ══════════════════════════════════════════════════════════

describe("Invariants", () => {
  const rules = defaultRules();

  it("score is never negative at any point during a full match", () => {
    let s = createInitialLiveScore(1);
    // Play a full match with alternating points
    for (let i = 0; i < 500 && !s.completed; i++) {
      const player = (i % 3 === 0 ? 1 : 2) as 1 | 2;
      s = applyPoint(s, player, rules);
      expect(s.currentPoints[0]).toBeGreaterThanOrEqual(0);
      expect(s.currentPoints[1]).toBeGreaterThanOrEqual(0);
      expect(s.currentGames[0]).toBeGreaterThanOrEqual(0);
      expect(s.currentGames[1]).toBeGreaterThanOrEqual(0);
      expect(s.tiebreakPoints[0]).toBeGreaterThanOrEqual(0);
      expect(s.tiebreakPoints[1]).toBeGreaterThanOrEqual(0);
      for (const set of s.sets) {
        expect(set[0]).toBeGreaterThanOrEqual(0);
        expect(set[1]).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it("sets never skip numbers (sequential)", () => {
    let s = createInitialLiveScore(1);
    let prevSetsLen = 0;
    for (let i = 0; i < 400 && !s.completed; i++) {
      const player = (i % 5 < 3 ? 1 : 2) as 1 | 2;
      s = applyPoint(s, player, rules);
      expect(s.sets.length).toBeLessThanOrEqual(prevSetsLen + 1);
      prevSetsLen = s.sets.length;
    }
  });

  it("ADV never exists when no_ad=true", () => {
    const noAdRules = defaultRules({ no_ad: true });
    let s = createInitialLiveScore(1);
    for (let i = 0; i < 300 && !s.completed; i++) {
      const player = (i % 2 === 0 ? 1 : 2) as 1 | 2;
      s = applyPoint(s, player, noAdRules);
      const [p1, p2] = formatPoints(s, noAdRules);
      expect(p1).not.toBe("AD");
      expect(p2).not.toBe("AD");
    }
  });

  it("ADV never exists when golden_point=true", () => {
    const gpRules = defaultRules({ golden_point: true });
    let s = createInitialLiveScore(1);
    for (let i = 0; i < 300 && !s.completed; i++) {
      const player = (i % 2 === 0 ? 1 : 2) as 1 | 2;
      s = applyPoint(s, player, gpRules);
      const [p1, p2] = formatPoints(s, gpRules);
      expect(p1).not.toBe("AD");
      expect(p2).not.toBe("AD");
    }
  });

  it("completed match never accepts new points", () => {
    let s = createInitialLiveScore(1);
    s = winSet(s, 1, rules);
    s = winSet(s, 1, rules);
    expect(s.completed).toBe(true);
    const histLen = s.pointHistory.length;
    s = applyPoint(s, 1, rules);
    s = applyPoint(s, 2, rules);
    expect(s.pointHistory.length).toBe(histLen);
  });

  it("undo never mutates the original history array", () => {
    let s = createInitialLiveScore(1);
    s = applyPoint(s, 1, rules);
    s = applyPoint(s, 2, rules);
    const originalHistory = [...s.pointHistory];
    undoLastPoint(s, rules);
    expect(s.pointHistory).toEqual(originalHistory);
  });

  it("tiebreak never activates outside configured tiebreak_at", () => {
    let s = createInitialLiveScore(1);
    // Play to 5-5, then 6-5 — should NOT enter tiebreak
    s = winGames(s, 1, 5, rules);
    s = winGames(s, 2, 5, rules);
    s = winGame(s, 1, rules); // 6-5
    expect(s.isTiebreak).toBe(false);
    expect(s.currentGames).toEqual([6, 5]);
  });

  it("points never regress without undo", () => {
    let s = createInitialLiveScore(1);
    for (let i = 0; i < 100 && !s.completed; i++) {
      const before = s.pointHistory.length;
      s = applyPoint(s, 1, rules);
      expect(s.pointHistory.length).toBe(before + 1);
    }
  });
});

// ══════════════════════════════════════════════════════════
// A) Inicialização
// ══════════════════════════════════════════════════════════

describe("A) Initialization", () => {
  it("creates initial score with server 1", () => {
    const s = createInitialLiveScore(1);
    expect(s.server).toBe(1);
    expect(s.initialServer).toBe(1);
    expect(s.sets).toEqual([]);
    expect(s.currentGames).toEqual([0, 0]);
    expect(s.currentPoints).toEqual([0, 0]);
    expect(s.isTiebreak).toBe(false);
    expect(s.isSuperTiebreak).toBe(false);
    expect(s.completed).toBe(false);
    expect(s.winner).toBeNull();
    expect(s.pointHistory).toEqual([]);
  });

  it("creates initial score with server 2", () => {
    const s = createInitialLiveScore(2);
    expect(s.server).toBe(2);
    expect(s.initialServer).toBe(2);
  });

  it("initial score has no stale data", () => {
    const s = createInitialLiveScore(1);
    expect(s.tiebreakPoints).toEqual([0, 0]);
    expect(s.superTiebreakPoints).toEqual([0, 0]);
  });
});

// ══════════════════════════════════════════════════════════
// B) Game Tradicional
// ══════════════════════════════════════════════════════════

describe("B) Traditional Game scoring", () => {
  const rules = defaultRules();

  it("0→15→30→40→game", () => {
    let s = createInitialLiveScore(1);
    s = applyPoint(s, 1, rules);
    expect(formatPoints(s, rules)[0]).toBe("15");
    s = applyPoint(s, 1, rules);
    expect(formatPoints(s, rules)[0]).toBe("30");
    s = applyPoint(s, 1, rules);
    expect(formatPoints(s, rules)[0]).toBe("40");
    s = applyPoint(s, 1, rules);
    expect(s.currentGames[0]).toBe(1);
    expect(s.currentPoints).toEqual([0, 0]);
  });

  it("Deuce→ADV→game", () => {
    let s = createInitialLiveScore(1);
    s = scorePoints(s, 1, 3, rules);
    s = scorePoints(s, 2, 3, rules); // 40-40
    s = applyPoint(s, 1, rules); // AD P1
    expect(formatPoints(s, rules)).toEqual(["AD", "40"]);
    s = applyPoint(s, 1, rules); // game
    expect(s.currentGames[0]).toBe(1);
  });

  it("ADV→Deuce→ADV→game", () => {
    let s = createInitialLiveScore(1);
    s = scorePoints(s, 1, 3, rules);
    s = scorePoints(s, 2, 3, rules); // deuce
    s = applyPoint(s, 1, rules); // AD P1
    s = applyPoint(s, 2, rules); // back to deuce
    expect(formatPoints(s, rules)).toEqual(["40", "40"]);
    s = applyPoint(s, 2, rules); // AD P2
    expect(formatPoints(s, rules)).toEqual(["40", "AD"]);
    s = applyPoint(s, 2, rules); // game P2
    expect(s.currentGames[1]).toBe(1);
  });

  it("multiple deuces before game won", () => {
    let s = createInitialLiveScore(1);
    s = scorePoints(s, 1, 3, rules);
    s = scorePoints(s, 2, 3, rules); // deuce
    for (let i = 0; i < 5; i++) {
      s = applyPoint(s, 1, rules); // AD
      s = applyPoint(s, 2, rules); // deuce
    }
    s = applyPoint(s, 1, rules); // AD
    s = applyPoint(s, 1, rules); // game
    expect(s.currentGames[0]).toBe(1);
  });
});

// ══════════════════════════════════════════════════════════
// C) No-Ad
// ══════════════════════════════════════════════════════════

describe("C) No-Ad", () => {
  const rules = defaultRules({ no_ad: true });

  it("40-40 → next point wins (P1)", () => {
    let s = createInitialLiveScore(1);
    s = scorePoints(s, 1, 3, rules);
    s = scorePoints(s, 2, 3, rules);
    expect(formatPoints(s, rules)).toEqual(["40", "40"]);
    s = applyPoint(s, 1, rules);
    expect(s.currentGames[0]).toBe(1);
  });

  it("40-40 → next point wins (P2)", () => {
    let s = createInitialLiveScore(1);
    s = scorePoints(s, 1, 3, rules);
    s = scorePoints(s, 2, 3, rules);
    s = applyPoint(s, 2, rules);
    expect(s.currentGames[1]).toBe(1);
  });

  it("never generates ADV during entire match", () => {
    let s = createInitialLiveScore(1);
    for (let i = 0; i < 200 && !s.completed; i++) {
      s = applyPoint(s, (i % 2 + 1) as 1 | 2, rules);
      const [p1, p2] = formatPoints(s, rules);
      expect(p1).not.toBe("AD");
      expect(p2).not.toBe("AD");
    }
  });
});

// ══════════════════════════════════════════════════════════
// D) Golden Point
// ══════════════════════════════════════════════════════════

describe("D) Golden Point", () => {
  const rules = defaultRules({ golden_point: true });

  it("40-40 → next point wins", () => {
    let s = createInitialLiveScore(1);
    s = scorePoints(s, 1, 3, rules);
    s = scorePoints(s, 2, 3, rules);
    s = applyPoint(s, 2, rules);
    expect(s.currentGames[1]).toBe(1);
  });

  it("never generates ADV", () => {
    let s = createInitialLiveScore(1);
    for (let i = 0; i < 200 && !s.completed; i++) {
      s = applyPoint(s, (i % 2 + 1) as 1 | 2, rules);
      const [p1, p2] = formatPoints(s, rules);
      expect(p1).not.toBe("AD");
      expect(p2).not.toBe("AD");
    }
  });

  it("straight game (4-0 points) works normally", () => {
    let s = createInitialLiveScore(1);
    s = scorePoints(s, 1, 4, rules);
    expect(s.currentGames[0]).toBe(1);
  });
});

// ══════════════════════════════════════════════════════════
// E) Tiebreak
// ══════════════════════════════════════════════════════════

describe("E) Tiebreak", () => {
  const rules = defaultRules();

  it("activates at 6-6", () => {
    let s = createInitialLiveScore(1);
    s = getTo66(s, rules);
    expect(s.isTiebreak).toBe(true);
    expect(s.currentGames).toEqual([6, 6]);
  });

  it("does NOT activate at 5-5 or 6-5", () => {
    let s = createInitialLiveScore(1);
    s = winGames(s, 1, 5, rules);
    s = winGames(s, 2, 5, rules);
    expect(s.isTiebreak).toBe(false);
    s = winGame(s, 1, rules); // 6-5
    expect(s.isTiebreak).toBe(false);
  });

  it("wins with diff >= 2 (7-0)", () => {
    let s = createInitialLiveScore(1);
    s = getTo66(s, rules);
    s = scorePoints(s, 1, 7, rules);
    expect(s.isTiebreak).toBe(false);
    expect(s.sets.length).toBe(1);
    expect(s.sets[0]).toEqual([7, 6]);
  });

  it("does NOT win without diff >= 2 (7-6 TB points)", () => {
    let s = createInitialLiveScore(1);
    s = getTo66(s, rules);
    s = scorePoints(s, 1, 6, rules);
    s = scorePoints(s, 2, 6, rules); // 6-6 TB
    s = applyPoint(s, 1, rules); // 7-6
    expect(s.isTiebreak).toBe(true);
  });

  it("wins at 8-6 TB points", () => {
    let s = createInitialLiveScore(1);
    s = getTo66(s, rules);
    s = scorePoints(s, 1, 6, rules);
    s = scorePoints(s, 2, 6, rules);
    s = applyPoint(s, 1, rules); // 7-6
    s = applyPoint(s, 1, rules); // 8-6
    expect(s.isTiebreak).toBe(false);
    expect(s.sets.length).toBe(1);
  });

  it("server rotation: switch after 1st point, then every 2", () => {
    let s = createInitialLiveScore(1);
    s = getTo66(s, rules);
    const initial = s.server;
    s = applyPoint(s, 1, rules); // pt 1 → switch
    expect(s.server).not.toBe(initial);
    const after1 = s.server;
    s = applyPoint(s, 1, rules); // pt 2 → no switch
    expect(s.server).toBe(after1);
    s = applyPoint(s, 1, rules); // pt 3 → switch
    expect(s.server).not.toBe(after1);
  });

  it("does NOT activate when tiebreak_enabled=false", () => {
    const noTBRules = defaultRules({ tiebreak_enabled: false });
    let s = createInitialLiveScore(1);
    s = getTo66(s, noTBRules);
    expect(s.isTiebreak).toBe(false);
    // Game continues with advantage
    s = winGame(s, 1, noTBRules); // 7-6
    expect(s.sets.length).toBe(0); // diff=1, not enough
  });
});

// ══════════════════════════════════════════════════════════
// F) Super Tiebreak
// ══════════════════════════════════════════════════════════

describe("F) Super Tiebreak", () => {
  describe("replace_third_set=true", () => {
    const rules = defaultRules({
      super_tiebreak_enabled: true,
      super_tiebreak_replaces_third_set: true,
      super_tiebreak_points: 10,
    });

    it("enters super tiebreak instead of 3rd set", () => {
      let s = createInitialLiveScore(1);
      s = winSet(s, 1, rules);
      s = winSet(s, 2, rules);
      expect(s.isSuperTiebreak).toBe(true);
    });

    it("wins at 10-0", () => {
      let s = createInitialLiveScore(1);
      s = winSet(s, 1, rules);
      s = winSet(s, 2, rules);
      s = scorePoints(s, 1, 10, rules);
      expect(s.completed).toBe(true);
      expect(s.winner).toBe(1);
    });

    it("requires diff >= 2 (10-9 continues)", () => {
      let s = createInitialLiveScore(1);
      s = winSet(s, 1, rules);
      s = winSet(s, 2, rules);
      s = scorePoints(s, 1, 9, rules);
      s = scorePoints(s, 2, 9, rules);
      s = applyPoint(s, 1, rules); // 10-9
      expect(s.completed).toBe(false);
      s = applyPoint(s, 1, rules); // 11-9
      expect(s.completed).toBe(true);
      expect(s.winner).toBe(1);
    });

    it("does NOT enter before sets are 1-1", () => {
      let s = createInitialLiveScore(1);
      s = winSet(s, 1, rules);
      expect(s.isSuperTiebreak).toBe(false);
    });
  });

  describe("final_set_mode=super_tiebreak", () => {
    const rules = defaultRules({
      super_tiebreak_enabled: true,
      super_tiebreak_replaces_third_set: false,
      final_set_tiebreak_mode: "super_tiebreak",
      super_tiebreak_points: 10,
    });

    it("enters super tiebreak at 6-6 in final set", () => {
      let s = createInitialLiveScore(1);
      s = winSet(s, 1, rules);
      s = winSet(s, 2, rules);
      s = getTo66(s, rules);
      expect(s.isSuperTiebreak).toBe(true);
    });

    it("does NOT enter super tiebreak at 6-6 in non-final set", () => {
      let s = createInitialLiveScore(1);
      s = getTo66(s, rules);
      // Should be regular tiebreak, not super
      expect(s.isTiebreak).toBe(true);
      expect(s.isSuperTiebreak).toBe(false);
    });
  });
});

// ══════════════════════════════════════════════════════════
// G) Set Decisivo Advantage
// ══════════════════════════════════════════════════════════

describe("G) Final set advantage mode", () => {
  const rules = defaultRules({ final_set_tiebreak_mode: "advantage" });

  it("no tiebreak at 6-6 in final set", () => {
    let s = createInitialLiveScore(1);
    s = winSet(s, 1, rules);
    s = winSet(s, 2, rules);
    s = getTo66(s, rules);
    expect(s.isTiebreak).toBe(false);
    expect(s.isSuperTiebreak).toBe(false);
  });

  it("wins only with 2 game difference (8-6)", () => {
    let s = createInitialLiveScore(1);
    s = winSet(s, 1, rules);
    s = winSet(s, 2, rules);
    s = getTo66(s, rules);
    s = winGame(s, 1, rules); // 7-6
    expect(s.completed).toBe(false);
    s = winGame(s, 1, rules); // 8-6
    expect(s.completed).toBe(true);
    expect(s.winner).toBe(1);
  });

  it("7-7 continues (no winner yet)", () => {
    let s = createInitialLiveScore(1);
    s = winSet(s, 1, rules);
    s = winSet(s, 2, rules);
    s = getTo66(s, rules);
    s = winGame(s, 1, rules); // 7-6
    s = winGame(s, 2, rules); // 7-7
    expect(s.completed).toBe(false);
  });

  it("tiebreak works normally in non-final sets", () => {
    let s = createInitialLiveScore(1);
    s = getTo66(s, rules);
    expect(s.isTiebreak).toBe(true);
  });
});

// ══════════════════════════════════════════════════════════
// H) Best Of
// ══════════════════════════════════════════════════════════

describe("H) Best Of", () => {
  it("best_of_3 completes at 2 sets", () => {
    const rules = defaultRules({ sets_format: "best_of_3" });
    let s = createInitialLiveScore(1);
    s = winSet(s, 1, rules);
    expect(s.completed).toBe(false);
    s = winSet(s, 1, rules);
    expect(s.completed).toBe(true);
    expect(s.sets.length).toBe(2);
  });

  it("best_of_5 completes at 3 sets", () => {
    const rules = defaultRules({ sets_format: "best_of_5" });
    let s = createInitialLiveScore(1);
    s = winSet(s, 1, rules);
    s = winSet(s, 1, rules);
    expect(s.completed).toBe(false);
    s = winSet(s, 1, rules);
    expect(s.completed).toBe(true);
    expect(s.sets.length).toBe(3);
  });

  it("best_of_5 can go to 5 sets", () => {
    const rules = defaultRules({ sets_format: "best_of_5" });
    let s = createInitialLiveScore(1);
    s = winSet(s, 1, rules);
    s = winSet(s, 2, rules);
    s = winSet(s, 1, rules);
    s = winSet(s, 2, rules);
    expect(s.completed).toBe(false);
    s = winSet(s, 1, rules);
    expect(s.completed).toBe(true);
    expect(s.winner).toBe(1);
    expect(s.sets.length).toBe(5);
  });
});

// ══════════════════════════════════════════════════════════
// I) Undo
// ══════════════════════════════════════════════════════════

describe("I) Undo", () => {
  const rules = defaultRules();

  it("undo single point", () => {
    let s = createInitialLiveScore(1);
    s = applyPoint(s, 1, rules);
    expect(formatPoints(s, rules)[0]).toBe("15");
    s = undoLastPoint(s, rules);
    expect(formatPoints(s, rules)).toEqual(["0", "0"]);
  });

  it("undo game-winning point", () => {
    let s = createInitialLiveScore(1);
    s = scorePoints(s, 1, 4, rules); // game won
    expect(s.currentGames[0]).toBe(1);
    s = undoLastPoint(s, rules);
    expect(s.currentGames[0]).toBe(0);
    expect(formatPoints(s, rules)[0]).toBe("40");
  });

  it("undo tiebreak point", () => {
    let s = createInitialLiveScore(1);
    s = getTo66(s, rules);
    s = applyPoint(s, 1, rules); // TB 1-0
    s = undoLastPoint(s, rules);
    expect(s.isTiebreak).toBe(true);
    expect(s.tiebreakPoints).toEqual([0, 0]);
  });

  it("undo tiebreak-winning point restores tiebreak", () => {
    let s = createInitialLiveScore(1);
    s = getTo66(s, rules);
    s = scorePoints(s, 1, 7, rules); // TB won, set over
    expect(s.sets.length).toBe(1);
    s = undoLastPoint(s, rules);
    expect(s.isTiebreak).toBe(true);
    expect(s.sets.length).toBe(0);
  });

  it("undo super tiebreak point", () => {
    const stRules = defaultRules({
      super_tiebreak_enabled: true,
      super_tiebreak_replaces_third_set: true,
    });
    let s = createInitialLiveScore(1);
    s = winSet(s, 1, stRules);
    s = winSet(s, 2, stRules);
    s = applyPoint(s, 1, stRules);
    s = undoLastPoint(s, stRules);
    expect(s.isSuperTiebreak).toBe(true);
    expect(s.superTiebreakPoints).toEqual([0, 0]);
  });

  it("undo match-winning point restores incomplete state", () => {
    let s = createInitialLiveScore(1);
    s = winSet(s, 1, rules);
    // Win 5 games of set 2, then win last game
    s = winGames(s, 1, 5, rules);
    s = winGame(s, 1, rules); // match completed
    expect(s.completed).toBe(true);
    s = undoLastPoint(s, rules);
    expect(s.completed).toBe(false);
  });

  it("state is always reconstructed from scratch (immutable)", () => {
    let s = createInitialLiveScore(1);
    s = applyPoint(s, 1, rules);
    const original = structuredClone(s);
    const undone = undoLastPoint(s, rules);
    // Original should be unchanged
    expect(s.pointHistory).toEqual(original.pointHistory);
    expect(s.currentPoints).toEqual(original.currentPoints);
    expect(undone.pointHistory.length).toBe(0);
  });

  it("preserves initialServer through undo", () => {
    let s = createInitialLiveScore(2);
    s = applyPoint(s, 1, rules);
    s = undoLastPoint(s, rules);
    expect(s.initialServer).toBe(2);
    expect(s.server).toBe(2);
  });

  it("returns same reference when no history", () => {
    const s = createInitialLiveScore(1);
    const result = undoLastPoint(s, rules);
    expect(result).toBe(s);
  });

  it("undo no-ad game win", () => {
    const noAdRules = defaultRules({ no_ad: true });
    let s = createInitialLiveScore(1);
    s = scorePoints(s, 1, 3, noAdRules);
    s = scorePoints(s, 2, 3, noAdRules);
    s = applyPoint(s, 1, noAdRules); // game
    expect(s.currentGames[0]).toBe(1);
    s = undoLastPoint(s, noAdRules);
    expect(s.currentGames[0]).toBe(0);
    expect(s.currentPoints).toEqual([3, 3]);
  });
});

// ══════════════════════════════════════════════════════════
// J) Finalização
// ══════════════════════════════════════════════════════════

describe("J) Match completion", () => {
  const rules = defaultRules();

  it("6-0 6-0 → completed, winner=1", () => {
    let s = createInitialLiveScore(1);
    s = winSet(s, 1, rules);
    s = winSet(s, 1, rules);
    expect(s.completed).toBe(true);
    expect(s.winner).toBe(1);
  });

  it("correct setsWon count", () => {
    let s = createInitialLiveScore(1);
    s = winSet(s, 1, rules);
    s = winSet(s, 2, rules);
    s = winSet(s, 1, rules);
    expect(getSetsWon(s)).toEqual([2, 1]);
  });

  it("formatSetScores shows completed sets only when completed", () => {
    let s = createInitialLiveScore(1);
    s = winSet(s, 1, rules);
    s = winSet(s, 1, rules);
    expect(formatSetScores(s)).toBe("6-0  6-0");
  });

  it("formatSetScores shows current set when not completed", () => {
    let s = createInitialLiveScore(1);
    s = winGame(s, 1, rules);
    expect(formatSetScores(s)).toBe("1-0");
  });

  it("getTotalGames counts correctly", () => {
    let s = createInitialLiveScore(1);
    s = winSet(s, 1, rules); // 6-0
    s = winSet(s, 1, rules); // 6-0
    expect(getTotalGames(s)).toEqual([12, 0]);
  });

  it("winner=2 when P2 wins", () => {
    let s = createInitialLiveScore(1);
    s = winSet(s, 2, rules);
    s = winSet(s, 2, rules);
    expect(s.winner).toBe(2);
  });
});

// ══════════════════════════════════════════════════════════
// K) Testes Negativos
// ══════════════════════════════════════════════════════════

describe("K) Negative tests", () => {
  const rules = defaultRules();

  it("cannot score after completed", () => {
    let s = createInitialLiveScore(1);
    s = winSet(s, 1, rules);
    s = winSet(s, 1, rules);
    const before = structuredClone(s);
    s = applyPoint(s, 1, rules);
    expect(s.pointHistory.length).toBe(before.pointHistory.length);
    expect(s.currentPoints).toEqual(before.currentPoints);
  });

  it("cannot score after completed (player 2)", () => {
    let s = createInitialLiveScore(1);
    s = winSet(s, 1, rules);
    s = winSet(s, 1, rules);
    s = applyPoint(s, 2, rules);
    expect(s.completed).toBe(true);
  });
});

// ══════════════════════════════════════════════════════════
// Server rotation
// ══════════════════════════════════════════════════════════

describe("Server rotation", () => {
  const rules = defaultRules();

  it("alternates after each game", () => {
    let s = createInitialLiveScore(1);
    expect(s.server).toBe(1);
    s = winGame(s, 1, rules);
    expect(s.server).toBe(2);
    s = winGame(s, 2, rules);
    expect(s.server).toBe(1);
  });

  it("super tiebreak server rotation: 1st then every 2", () => {
    const stRules = defaultRules({
      super_tiebreak_enabled: true,
      super_tiebreak_replaces_third_set: true,
    });
    let s = createInitialLiveScore(1);
    s = winSet(s, 1, stRules);
    s = winSet(s, 2, stRules);
    const initial = s.server;
    s = applyPoint(s, 1, stRules); // pt 1 → switch
    expect(s.server).not.toBe(initial);
    const after1 = s.server;
    s = applyPoint(s, 1, stRules); // pt 2 → no switch
    expect(s.server).toBe(after1);
    s = applyPoint(s, 1, stRules); // pt 3 → switch
    expect(s.server).not.toBe(after1);
  });
});

// ══════════════════════════════════════════════════════════
// Edge cases
// ══════════════════════════════════════════════════════════

describe("Edge cases", () => {
  it("set won at games_to_win_set with diff (6-4)", () => {
    const rules = defaultRules();
    let s = createInitialLiveScore(1);
    s = winGames(s, 1, 5, rules);
    s = winGames(s, 2, 4, rules);
    s = winGame(s, 1, rules); // 6-4
    expect(s.sets.length).toBe(1);
    expect(s.sets[0]).toEqual([6, 4]);
  });

  it("7-5 win (no tiebreak needed)", () => {
    const rules = defaultRules();
    let s = createInitialLiveScore(1);
    s = winGames(s, 1, 5, rules);
    s = winGames(s, 2, 5, rules);
    s = winGame(s, 1, rules); // 6-5
    expect(s.sets.length).toBe(0); // diff=1
    s = winGame(s, 1, rules); // 7-5
    expect(s.sets.length).toBe(1);
    expect(s.sets[0]).toEqual([7, 5]);
  });

  it("long deuce game tracks all points in history", () => {
    const rules = defaultRules();
    let s = createInitialLiveScore(1);
    s = scorePoints(s, 1, 3, rules);
    s = scorePoints(s, 2, 3, rules);
    // 10 deuce cycles
    for (let i = 0; i < 10; i++) {
      s = applyPoint(s, 1, rules);
      s = applyPoint(s, 2, rules);
    }
    s = applyPoint(s, 1, rules); // AD
    s = applyPoint(s, 1, rules); // game
    expect(s.currentGames[0]).toBe(1);
    expect(s.pointHistory.length).toBe(6 + 20 + 2);
  });

  it("custom tiebreak_at (5-5) works", () => {
    const rules = defaultRules({ tiebreak_at: "5-5", games_to_win_set: 5 });
    let s = createInitialLiveScore(1);
    for (let i = 0; i < 5; i++) {
      s = winGame(s, 1, rules);
      s = winGame(s, 2, rules);
    }
    expect(s.isTiebreak).toBe(true);
  });
});
