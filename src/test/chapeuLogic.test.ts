/**
 * Tests for Chapéu (Waiting Slot) Logic
 */

import { describe, it, expect } from "vitest";
import { isChapeu, isRealMatch, getChapeuTeam, canTeamAdvance } from "@/lib/chapeuLogic";

interface Match {
  id: string;
  round: number;
  position: number;
  team1_id: string | null;
  team2_id: string | null;
  winner_team_id: string | null;
  status: string;
  bracket_type: string | null;
  bracket_half?: string | null;
  bracket_number?: number | null;
}

function createMatch(
  id: string,
  team1: string | null,
  team2: string | null,
  winner: string | null = null,
  status: string = "pending"
): Match {
  return {
    id,
    round: 1,
    position: 1,
    team1_id: team1,
    team2_id: team2,
    winner_team_id: winner,
    status,
    bracket_type: "losers",
    bracket_half: "upper",
  };
}

describe("chapeuLogic", () => {
  describe("isChapeu", () => {
    it("should detect Chapéu when only team1 is present", () => {
      const match = createMatch("M1", "T1", null);
      expect(isChapeu(match)).toBe(true);
    });

    it("should detect Chapéu when only team2 is present", () => {
      const match = createMatch("M1", null, "T2");
      expect(isChapeu(match)).toBe(true);
    });

    it("should NOT be Chapéu when both teams are present", () => {
      const match = createMatch("M1", "T1", "T2");
      expect(isChapeu(match)).toBe(false);
    });

    it("should NOT be Chapéu when no teams are present", () => {
      const match = createMatch("M1", null, null);
      expect(isChapeu(match)).toBe(false);
    });

    it("should NOT be Chapéu when status is completed", () => {
      const match = createMatch("M1", "T1", null, "T1", "completed");
      expect(isChapeu(match)).toBe(false);
    });
  });

  describe("isRealMatch", () => {
    it("should identify real match when both teams present", () => {
      const match = createMatch("M1", "T1", "T2");
      expect(isRealMatch(match)).toBe(true);
    });

    it("should NOT identify Chapéu as real match", () => {
      const match = createMatch("M1", "T1", null);
      expect(isRealMatch(match)).toBe(false);
    });

    it("should NOT identify empty match as real", () => {
      const match = createMatch("M1", null, null);
      expect(isRealMatch(match)).toBe(false);
    });
  });

  describe("getChapeuTeam", () => {
    it("should return team when Chapéu has one team", () => {
      const match = createMatch("M1", "T1", null);
      expect(getChapeuTeam(match)).toBe("T1");
    });

    it("should return null when not a Chapéu", () => {
      const match = createMatch("M1", "T1", "T2");
      expect(getChapeuTeam(match)).toBeNull();
    });
  });

  describe("canTeamAdvance", () => {
    it("should prevent advancement from Chapéu slot", () => {
      const matches: Match[] = [
        createMatch("M1", "T1", null), // Chapéu
      ];
      expect(canTeamAdvance("T1", "M1", matches)).toBe(false);
    });

    it("should allow advancement when team won real match", () => {
      const matches: Match[] = [
        createMatch("M1", "T1", "T2", "T1", "completed"), // Real match, T1 won
      ];
      expect(canTeamAdvance("T1", "M1", matches)).toBe(true);
    });

    it("should prevent advancement when team lost", () => {
      const matches: Match[] = [
        createMatch("M1", "T1", "T2", "T2", "completed"), // Real match, T2 won
      ];
      expect(canTeamAdvance("T1", "M1", matches)).toBe(false);
    });

    it("should return false for missing match", () => {
      const matches: Match[] = [];
      expect(canTeamAdvance("T1", "M1", matches)).toBe(false);
    });
  });
});
