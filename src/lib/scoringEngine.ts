/**
 * Tennis/Padel Scoring Engine
 * Pure logic — no side effects, no database calls.
 * 100% driven by ScoringRules from tournament_rules.
 */

export interface ScoringRules {
  sets_format: string; // best_of_3 | best_of_5
  games_to_win_set: number;
  min_difference: number;
  tiebreak_enabled: boolean;
  tiebreak_at: string; // e.g. "6-6"
  tiebreak_points: number;
  final_set_tiebreak_mode: string; // normal | super_tiebreak | advantage
  super_tiebreak_enabled: boolean;
  super_tiebreak_points: number;
  super_tiebreak_replaces_third_set: boolean;
  no_ad: boolean;
  golden_point: boolean;
  points_sequence: string; // "0,15,30,40,ADV"
}

export interface LiveScore {
  sets: [number, number][]; // completed sets: [[6,4],[3,6]]
  currentGames: [number, number]; // games in current set
  currentPoints: [number, number]; // raw point counters
  isTiebreak: boolean;
  tiebreakPoints: [number, number];
  isSuperTiebreak: boolean;
  superTiebreakPoints: [number, number];
  server: 1 | 2;
  initialServer: 1 | 2;
  completed: boolean;
  winner: 1 | 2 | null;
  pointHistory: string[]; // "P1" or "P2" for each point
}

export function createInitialLiveScore(server: 1 | 2 = 1): LiveScore {
  return {
    sets: [],
    currentGames: [0, 0],
    currentPoints: [0, 0],
    isTiebreak: false,
    tiebreakPoints: [0, 0],
    isSuperTiebreak: false,
    superTiebreakPoints: [0, 0],
    server,
    initialServer: server,
    completed: false,
    winner: null,
    pointHistory: [],
  };
}

function getTotalSetsToWin(rules: ScoringRules): number {
  return rules.sets_format === "best_of_5" ? 3 : 2;
}

function parseTiebreakAt(tiebreakAt: string): [number, number] {
  const parts = tiebreakAt.split("-").map(Number);
  return [parts[0] || 6, parts[1] || 6];
}

function getPointsSeq(rules: ScoringRules): string[] {
  return rules.points_sequence.split(",").map(s => s.trim());
}

/**
 * Format current point display for a player.
 * ADV is NEVER shown when no_ad or golden_point is true.
 */
export function formatPoints(score: LiveScore, rules: ScoringRules): [string, string] {
  if (score.isSuperTiebreak) {
    return [String(score.superTiebreakPoints[0]), String(score.superTiebreakPoints[1])];
  }
  if (score.isTiebreak) {
    return [String(score.tiebreakPoints[0]), String(score.tiebreakPoints[1])];
  }

  const seq = getPointsSeq(rules);
  const p1 = score.currentPoints[0];
  const p2 = score.currentPoints[1];

  // Both at 40+ (deuce territory)
  if (p1 >= 3 && p2 >= 3) {
    // No-Ad or Golden Point: always show "40" - "40", never ADV
    if (rules.no_ad || rules.golden_point) {
      return ["40", "40"];
    }
    // Traditional deuce/advantage
    if (p1 === p2) return ["40", "40"]; // Deuce
    if (p1 > p2) return ["AD", "40"];
    return ["40", "AD"];
  }

  return [
    seq[Math.min(p1, seq.length - 1)] || String(p1),
    seq[Math.min(p2, seq.length - 1)] || String(p2),
  ];
}

/**
 * Get set score summary string, e.g. "6-4 3-6 7-5"
 */
export function formatSetScores(score: LiveScore): string {
  const parts = score.sets.map(s => `${s[0]}-${s[1]}`);
  if (!score.completed) {
    parts.push(`${score.currentGames[0]}-${score.currentGames[1]}`);
  }
  return parts.join("  ");
}

/**
 * Apply a point to the scoring state. Returns a NEW LiveScore (immutable).
 * @param player 1 or 2
 */
export function applyPoint(score: LiveScore, player: 1 | 2, rules: ScoringRules): LiveScore {
  if (score.completed) return score;

  const s = structuredClone(score) as LiveScore;
  const idx = player - 1;
  const otherIdx = 1 - idx;
  s.pointHistory.push(player === 1 ? "P1" : "P2");

  // Super tiebreak
  if (s.isSuperTiebreak) {
    s.superTiebreakPoints[idx]++;
    const p = s.superTiebreakPoints;
    const target = rules.super_tiebreak_points;
    if (p[idx] >= target && (p[idx] - p[otherIdx]) >= 2) {
      // Super tiebreak won — record as a set
      s.sets.push([...s.superTiebreakPoints] as [number, number]);
      finishMatch(s, player);
    } else {
      // Server change: after 1st point, then every 2 points (same as regular tiebreak)
      const totalPts = p[0] + p[1];
      if (totalPts === 1 || (totalPts > 1 && (totalPts - 1) % 2 === 0)) {
        s.server = s.server === 1 ? 2 : 1;
      }
    }
    return s;
  }

  // Regular tiebreak
  if (s.isTiebreak) {
    s.tiebreakPoints[idx]++;
    const p = s.tiebreakPoints;
    const target = rules.tiebreak_points;
    if (p[idx] >= target && (p[idx] - p[otherIdx]) >= 2) {
      // Tiebreak won → set won
      const games: [number, number] = [...s.currentGames] as [number, number];
      games[idx]++;
      s.sets.push(games);
      s.isTiebreak = false;
      s.tiebreakPoints = [0, 0];
      s.currentGames = [0, 0];
      s.currentPoints = [0, 0];
      checkMatchEnd(s, rules);
    } else {
      // Server change: after 1st point, then every 2
      const totalPts = p[0] + p[1];
      if (totalPts === 1 || (totalPts > 1 && (totalPts - 1) % 2 === 0)) {
        s.server = s.server === 1 ? 2 : 1;
      }
    }
    return s;
  }

  // Regular game point
  s.currentPoints[idx]++;
  const p1 = s.currentPoints[0];
  const p2 = s.currentPoints[1];

  let gameWon = false;

  if (rules.no_ad || rules.golden_point) {
    // No-Ad / Golden Point: need 4 points to win. At deuce (40-40),
    // next point wins — no advantage exists.
    if (s.currentPoints[idx] >= 4) {
      gameWon = true;
    }
  } else {
    // Standard scoring with advantage: need 4+ points AND 2 point lead
    if (s.currentPoints[idx] >= 4 && (s.currentPoints[idx] - s.currentPoints[otherIdx]) >= 2) {
      gameWon = true;
    }
  }

  if (gameWon) {
    s.currentGames[idx]++;
    s.currentPoints = [0, 0];
    // Switch server after each game
    s.server = s.server === 1 ? 2 : 1;

    // Check if set is won
    const g = s.currentGames;
    const gTarget = rules.games_to_win_set;
    const [tbAt1, tbAt2] = parseTiebreakAt(rules.tiebreak_at);

    if (g[idx] >= gTarget && (g[idx] - g[otherIdx]) >= rules.min_difference) {
      // Set won
      s.sets.push([...s.currentGames] as [number, number]);
      s.currentGames = [0, 0];
      checkMatchEnd(s, rules);
    } else if (rules.tiebreak_enabled && g[0] === tbAt1 && g[1] === tbAt2) {
      // Enter tiebreak — check final set mode
      const setsToWin = getTotalSetsToWin(rules);
      const isFinalSet = s.sets.length === (setsToWin * 2 - 2);

      if (isFinalSet && rules.final_set_tiebreak_mode === "advantage") {
        // No tiebreak in final set — keep playing with advantage
      } else if (isFinalSet && rules.final_set_tiebreak_mode === "super_tiebreak" && rules.super_tiebreak_enabled) {
        s.isSuperTiebreak = true;
        s.superTiebreakPoints = [0, 0];
      } else {
        s.isTiebreak = true;
        s.tiebreakPoints = [0, 0];
      }
    }
  }

  return s;
}

function checkMatchEnd(s: LiveScore, rules: ScoringRules) {
  const setsToWin = getTotalSetsToWin(rules);
  let s1 = 0, s2 = 0;
  for (const set of s.sets) {
    if (set[0] > set[1]) s1++;
    else if (set[1] > set[0]) s2++;
  }

  // Check if super tiebreak should start instead of playing a full final set
  if (!s.completed && !s.isSuperTiebreak) {
    const isFinalSetPosition = s.sets.length === (setsToWin * 2 - 2);
    if (isFinalSetPosition && rules.super_tiebreak_enabled && rules.super_tiebreak_replaces_third_set) {
      s.isSuperTiebreak = true;
      s.superTiebreakPoints = [0, 0];
      return;
    }
  }

  if (s1 >= setsToWin) finishMatch(s, 1);
  else if (s2 >= setsToWin) finishMatch(s, 2);
}

function finishMatch(s: LiveScore, winner: 1 | 2) {
  s.completed = true;
  s.winner = winner;
}

/**
 * Undo the last point. Returns a NEW LiveScore.
 * Replays the entire history minus the last event from scratch.
 */
export function undoLastPoint(score: LiveScore, rules: ScoringRules): LiveScore {
  if (score.pointHistory.length === 0) return score;

  // Replay all points except the last one, using the original initial server
  const history = score.pointHistory.slice(0, -1);
  let s = createInitialLiveScore(score.initialServer);

  for (const p of history) {
    const player = p === "P1" ? 1 : 2;
    s = applyPoint(s, player as 1 | 2, rules);
  }

  return s;
}

/**
 * Calculate total sets won by each side.
 */
export function getSetsWon(score: LiveScore): [number, number] {
  let s1 = 0, s2 = 0;
  for (const set of score.sets) {
    if (set[0] > set[1]) s1++;
    else if (set[1] > set[0]) s2++;
  }
  return [s1, s2];
}

/**
 * Calculate total games for match summary.
 */
export function getTotalGames(score: LiveScore): [number, number] {
  let g1 = 0, g2 = 0;
  for (const set of score.sets) {
    g1 += set[0];
    g2 += set[1];
  }
  return [g1, g2];
}
