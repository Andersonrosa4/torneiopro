/**
 * Tests for Chapéu Distribution Logic
 */
import { describe, it, expect } from "vitest";
import { distributeChapeus, getChapeuTeams, getRealTeams, getNextPowerOf2, isPowerOf2 } from "@/lib/chapeuDistribution";

describe("chapeuDistribution", () => {
  describe("getNextPowerOf2", () => {
    it("returns 1 for 0 or 1", () => {
      expect(getNextPowerOf2(0)).toBe(1);
      expect(getNextPowerOf2(1)).toBe(1);
    });

    it("returns same number for powers of 2", () => {
      expect(getNextPowerOf2(2)).toBe(2);
      expect(getNextPowerOf2(4)).toBe(4);
      expect(getNextPowerOf2(8)).toBe(8);
      expect(getNextPowerOf2(16)).toBe(16);
    });

    it("returns next power of 2 for non-powers", () => {
      expect(getNextPowerOf2(3)).toBe(4);
      expect(getNextPowerOf2(5)).toBe(8);
      expect(getNextPowerOf2(6)).toBe(8);
      expect(getNextPowerOf2(7)).toBe(8);
      expect(getNextPowerOf2(9)).toBe(16);
      expect(getNextPowerOf2(10)).toBe(16);
      expect(getNextPowerOf2(12)).toBe(16);
    });
  });

  describe("isPowerOf2", () => {
    it("returns true for powers of 2", () => {
      expect(isPowerOf2(1)).toBe(true);
      expect(isPowerOf2(2)).toBe(true);
      expect(isPowerOf2(4)).toBe(true);
      expect(isPowerOf2(8)).toBe(true);
      expect(isPowerOf2(16)).toBe(true);
    });

    it("returns false for non-powers", () => {
      expect(isPowerOf2(0)).toBe(false);
      expect(isPowerOf2(3)).toBe(false);
      expect(isPowerOf2(6)).toBe(false);
      expect(isPowerOf2(10)).toBe(false);
      expect(isPowerOf2(12)).toBe(false);
    });
  });

  describe("distributeChapeus", () => {
    it("no chapéus for 8 teams (power of 2)", () => {
      const groupRankings = {
        "1": [{ teamId: "A1", rank: 1, pointDifferential: 5 }, { teamId: "A2", rank: 2, pointDifferential: 2 }],
        "2": [{ teamId: "B1", rank: 1, pointDifferential: 3 }, { teamId: "B2", rank: 2, pointDifferential: 1 }],
        "3": [{ teamId: "C1", rank: 1, pointDifferential: 4 }, { teamId: "C2", rank: 2, pointDifferential: 0 }],
        "4": [{ teamId: "D1", rank: 1, pointDifferential: 6 }, { teamId: "D2", rank: 2, pointDifferential: -1 }],
      };
      const allTeams = ["A1", "A2", "B1", "B2", "C1", "C2", "D1", "D2"];
      const result = distributeChapeus(allTeams, groupRankings);
      
      expect(getChapeuTeams(result)).toHaveLength(0);
      expect(getRealTeams(result)).toHaveLength(8);
    });

    it("2 chapéus for 6 teams (3 groups × 2 advancing)", () => {
      const groupRankings = {
        "1": [{ teamId: "A1", rank: 1, pointDifferential: 5 }, { teamId: "A2", rank: 2, pointDifferential: 2 }],
        "2": [{ teamId: "B1", rank: 1, pointDifferential: 3 }, { teamId: "B2", rank: 2, pointDifferential: 1 }],
        "3": [{ teamId: "C1", rank: 1, pointDifferential: 4 }, { teamId: "C2", rank: 2, pointDifferential: 0 }],
      };
      const allTeams = ["A1", "A2", "B1", "B2", "C1", "C2"];
      const result = distributeChapeus(allTeams, groupRankings);
      
      const chapeus = getChapeuTeams(result);
      expect(chapeus).toHaveLength(2);
      // Should be 1st place teams with best point differential
      // A1 has PD=5, C1 has PD=4, B1 has PD=3
      expect(chapeus).toContain("A1");
      expect(chapeus).toContain("C1");
    });

    it("4 chapéus for 12 teams (next power = 16)", () => {
      const groupRankings: Record<string, { teamId: string; rank: number; pointDifferential: number }[]> = {};
      const allTeams: string[] = [];
      for (let g = 1; g <= 6; g++) {
        groupRankings[String(g)] = [
          { teamId: `G${g}_1`, rank: 1, pointDifferential: 10 - g },
          { teamId: `G${g}_2`, rank: 2, pointDifferential: 5 - g },
        ];
        allTeams.push(`G${g}_1`, `G${g}_2`);
      }
      
      const result = distributeChapeus(allTeams, groupRankings);
      const chapeus = getChapeuTeams(result);
      expect(chapeus).toHaveLength(4); // 16 - 12 = 4
      // All chapéus should be 1st place teams
      chapeus.forEach(c => expect(c).toMatch(/_1$/));
    });

    it("1 chapéu for 7 teams (next power = 8)", () => {
      const groupRankings = {
        "1": [{ teamId: "A1", rank: 1, pointDifferential: 10 }],
        "2": [{ teamId: "B1", rank: 1, pointDifferential: 8 }],
        "3": [{ teamId: "C1", rank: 1, pointDifferential: 6 }],
      };
      const allTeams = ["A1", "B1", "C1", "T4", "T5", "T6", "T7"];
      const result = distributeChapeus(allTeams, groupRankings);
      
      const chapeus = getChapeuTeams(result);
      expect(chapeus).toHaveLength(1);
      expect(chapeus[0]).toBe("A1"); // Best PD
    });
  });
});
