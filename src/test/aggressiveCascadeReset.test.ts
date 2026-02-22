/**
 * Tests for Aggressive Cascade Reset Logic
 */

import { describe, it, expect } from "vitest";
import { computeAggressiveCascadeReset, computePartialCascadeResetSE } from "@/lib/aggressiveCascadeReset";

interface Match {
  id: string;
  round: number;
  position: number;
  team1_id: string | null;
  team2_id: string | null;
  winner_team_id: string | null;
  status: string;
  bracket_type: string | null;
  bracket_half: string | null;
  bracket_number?: number | null;
  next_win_match_id: string | null;
  next_lose_match_id: string | null;
  modality_id?: string | null;
}

// Mock matches for testing
function createMatch(
  id: string,
  round: number,
  position: number,
  bracketType: string,
  bracketHalf: string | null,
  team1: string | null = null,
  team2: string | null = null,
  winner: string | null = null,
  status: string = "pending"
): Match {
  return {
    id,
    round,
    position,
    team1_id: team1,
    team2_id: team2,
    winner_team_id: winner,
    status,
    bracket_type: bracketType,
    bracket_half: bracketHalf,
    bracket_number: 1,
    next_win_match_id: null,
    next_lose_match_id: null,
  };
}

describe("aggressiveCascadeReset", () => {
  describe("Double Elimination Cascade", () => {
    it("should RESET (not delete) all downstream Winners matches when editing Winners R1", () => {
      const matches: Match[] = [
        // Winners Upper R1
        createMatch("W_U_R1_P1", 1, 1, "winners", "upper", "T1", "T2", "T1", "completed"),
        createMatch("W_U_R1_P2", 1, 2, "winners", "upper", "T3", "T4", "T3", "completed"),
        // Winners Upper R2 (should be RESET, not deleted)
        createMatch("W_U_R2_P1", 2, 1, "winners", "upper", "T1", "T3", "T1", "completed"),
        // Winners Lower (different bracket, should NOT be affected)
        createMatch("W_L_R1_P1", 1, 1, "winners", "lower", "T5", "T6", "T5", "completed"),
        // Losers Upper
        createMatch("LU_R1_P1", 1, 1, "losers", "upper", "T6", null, null, "pending"),
      ];

      const edited = matches[0]; // Edit W_U_R1_P1
      const plan = computeAggressiveCascadeReset(edited, matches);

      // Should NEVER delete any matches
      expect(plan.toDelete.length).toBe(0);
      // Should RESET the R2 Winners match
      expect(plan.toUpdate.some(u => u.matchId === "W_U_R2_P1")).toBe(true);
      // Should NOT affect W_L_R1_P1 (different half)
      expect(plan.toUpdate.some(u => u.matchId === "W_L_R1_P1")).toBe(false);
      // Edited match gets reset
      expect(plan.toUpdate.some(u => u.matchId === "W_U_R1_P1")).toBe(true);
    });

    it("should never delete matches, only reset them", () => {
      const matches: Match[] = [
        createMatch("W_U_R1_P1", 1, 1, "winners", "upper", "T1", "T2", "T1", "completed"),
        createMatch("W_U_R2_P1", 2, 1, "winners", "upper", "T1", null, null, "pending"),
      ];
      matches[0].next_win_match_id = "W_U_R2_P1";

      const edited = matches[0];
      const plan = computeAggressiveCascadeReset(edited, matches);

      // Should NEVER delete
      expect(plan.toDelete.length).toBe(0);
      // Should reset downstream
      expect(plan.toUpdate.some(u => u.matchId === "W_U_R2_P1")).toBe(true);
      // Edited match also reset
      expect(plan.toUpdate.some(u => u.matchId === "W_U_R1_P1")).toBe(true);
    });

    it("should clear scores and status on reset", () => {
      const matches: Match[] = [
        createMatch("M1", 1, 1, "winners", "upper", "T1", "T2", "T1", "completed"),
      ];

      const edited = matches[0];
      const plan = computeAggressiveCascadeReset(edited, matches);

      const resetData = plan.toUpdate.find(u => u.matchId === "M1")?.data;
      expect(resetData?.winner_team_id).toBeNull();
      expect(resetData?.status).toBe("pending");
      expect(resetData?.score1).toBe(0);
      expect(resetData?.score2).toBe(0);
    });
  });

  describe("Single Elimination Partial Reset", () => {
    it("should only reset semifinal and final when editing earlier round", () => {
      const matches: Match[] = [
        // Round 1
        createMatch("R1_P1", 1, 1, "normal", null, "T1", "T2", "T1", "completed"),
        createMatch("R1_P2", 1, 2, "normal", null, "T3", "T4", "T3", "completed"),
        // Round 2 (Quarterfinal/Semifinal)
        createMatch("R2_P1", 2, 1, "normal", null, "T1", "T3", "T1", "completed"),
        // Round 3 (Final)
        createMatch("R3_P1", 3, 1, "normal", null, "T1", null, null, "pending"),
      ];

      const edited = matches[0]; // Edit R1 match
      const plan = computePartialCascadeResetSE(edited, matches);

      // Should RESET (not delete) R2 and R3
      expect(plan.toDelete.length).toBe(0);
      expect(plan.toUpdate.find(u => u.matchId === "R2_P1")).toBeDefined();
      expect(plan.toUpdate.find(u => u.matchId === "R3_P1")).toBeDefined();
    });

    it("should not delete matches when editing semifinal/final", () => {
      const matches: Match[] = [
        createMatch("R1_P1", 1, 1, "normal", null, "T1", "T2", "T1", "completed"),
        createMatch("R2_P1", 2, 1, "normal", null, "T1", "T3", "T1", "completed"),
        createMatch("R3_P1", 3, 1, "normal", null, "T1", null, null, "pending"),
      ];

      const edited = matches[2]; // Edit Final (R3)
      const plan = computePartialCascadeResetSE(edited, matches);

      // Should not delete anything if editing last round
      expect(plan.toDelete.length).toBe(0);
    });
  });
});
