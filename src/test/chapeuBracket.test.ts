/**
 * Tests for Chapéu (Waiting Slot) Bracket Generation
 * Verifies nearest-power-of-2 logic and is_chapeu marking
 */

import { describe, it, expect } from "vitest";
import { generateDoubleEliminationBracket, DoubleEliminationConfig, getBaseBracketSize } from "@/lib/doubleEliminationLogic";

function makeTeams(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    id: `team-${i + 1}`,
    player1_name: `P1-${i + 1}`,
    player2_name: `P2-${i + 1}`,
    seed: null,
  }));
}

function makeConfig(n: number): DoubleEliminationConfig {
  return {
    tournamentId: 'test-tournament',
    modalityId: 'test-modality',
    teams: makeTeams(n),
    useSeeds: false,
    allowThirdPlace: true,
  };
}

describe("getBaseBracketSize", () => {
  it("returns same value for powers of 2", () => {
    expect(getBaseBracketSize(2)).toBe(2);
    expect(getBaseBracketSize(4)).toBe(4);
    expect(getBaseBracketSize(8)).toBe(8);
    expect(getBaseBracketSize(16)).toBe(16);
    expect(getBaseBracketSize(32)).toBe(32);
  });

  it("returns nearest power of 2 (prefers lower on tie)", () => {
    // Ties → prefer lower
    expect(getBaseBracketSize(3)).toBe(2);   // 2(d=1) vs 4(d=1) → lower
    expect(getBaseBracketSize(6)).toBe(4);   // 4(d=2) vs 8(d=2) → lower
    expect(getBaseBracketSize(12)).toBe(8);  // 8(d=4) vs 16(d=4) → lower
    expect(getBaseBracketSize(24)).toBe(16); // 16(d=8) vs 32(d=8) → lower

    // Clear nearest
    expect(getBaseBracketSize(5)).toBe(4);   // 4(d=1) vs 8(d=3) → 4
    expect(getBaseBracketSize(7)).toBe(8);   // 4(d=3) vs 8(d=1) → 8
    expect(getBaseBracketSize(9)).toBe(8);   // 8(d=1) vs 16(d=7) → 8
    expect(getBaseBracketSize(11)).toBe(8);  // 8(d=3) vs 16(d=5) → 8
    expect(getBaseBracketSize(13)).toBe(16); // 8(d=5) vs 16(d=3) → 16
    expect(getBaseBracketSize(15)).toBe(16); // 8(d=7) vs 16(d=1) → 16
    expect(getBaseBracketSize(17)).toBe(16); // 16(d=1) vs 32(d=15) → 16
    expect(getBaseBracketSize(20)).toBe(16); // 16(d=4) vs 32(d=12) → 16
    expect(getBaseBracketSize(25)).toBe(32); // 16(d=9) vs 32(d=7) → 32
  });
});

describe("Chapéu Bracket Generation", () => {
  // Verify match count is at least (2N-3) — split-bracket may add losers chapéu overhead
  it("should have at least (2N-3) matches for standard sizes", () => {
    for (const n of [8, 16, 32]) {
      const config = makeConfig(n);
      const { matches } = generateDoubleEliminationBracket(config);
      const minimum = 2 * n - 3;
      expect(matches.length, `N=${n}: should have >= ${minimum} matches`).toBeGreaterThanOrEqual(minimum);
    }
  });

  it("should generate brackets without errors for all sizes", () => {
    for (const n of [4, 5, 6, 7, 8, 10, 13, 15, 16, 17, 20, 22, 25, 26, 30, 32, 35, 36, 40]) {
      expect(() => {
        const config = makeConfig(n);
        generateDoubleEliminationBracket(config);
      }).not.toThrow();
    }
  });

  it("should mark chapéu matches with is_chapeu=true for non-pow2", () => {
    for (const n of [5, 7, 10, 13, 17, 22]) {
      const config = makeConfig(n);
      const { matches } = generateDoubleEliminationBracket(config);
      const chapeuWinners = matches.filter((m: any) => m.is_chapeu && m.bracket_type === 'winners');
      expect(chapeuWinners.length, `N=${n} should have winners chapéu matches`).toBeGreaterThan(0);
    }
  });

  it("should have no winners chapéu matches for power-of-2 team counts", () => {
    for (const n of [8, 16, 32]) {
      const config = makeConfig(n);
      const { matches } = generateDoubleEliminationBracket(config);
      const chapeuWinners = matches.filter((m: any) => m.is_chapeu && m.bracket_type === 'winners');
      expect(chapeuWinners.length, `N=${n} should have 0 winners chapéu`).toBe(0);
    }
  });

  it("should not have any team playing itself", () => {
    for (const n of [5, 7, 10, 13, 17, 22, 25, 30, 32]) {
      const config = makeConfig(n);
      const { matches } = generateDoubleEliminationBracket(config);
      for (const m of matches) {
        if (m.team1_id && m.team2_id) {
          expect(m.team1_id, `N=${n}: self-match detected`).not.toBe(m.team2_id);
        }
      }
    }
  });

  it("chapéu winners matches should have exactly one team pre-assigned", () => {
    for (const n of [13, 17, 22]) {
      const config = makeConfig(n);
      const { matches } = generateDoubleEliminationBracket(config);
      const chapeuWinners = matches.filter((m: any) => m.is_chapeu && m.bracket_type === 'winners');
      for (const m of chapeuWinners) {
        const hasTeam1 = m.team1_id !== null;
        const hasTeam2 = m.team2_id !== null;
        expect(hasTeam1 !== hasTeam2, `N=${n}: Chapéu match should have exactly 1 team`).toBe(true);
      }
    }
  });

  it("winners bracket per side should have (sideN - 1) matches", () => {
    const config = makeConfig(13);
    const { matches } = generateDoubleEliminationBracket(config);
    const winnersUpper = matches.filter(m => m.bracket_type === 'winners' && m.bracket_half === 'upper');
    const winnersLower = matches.filter(m => m.bracket_type === 'winners' && m.bracket_half === 'lower');
    // 13 teams → 7+6 split. Each side: N_side - 1 matches
    expect(winnersUpper.length + winnersLower.length).toBe(13 - 2); // N - 2 total winners
  });
});
