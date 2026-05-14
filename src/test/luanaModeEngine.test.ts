import { describe, it, expect } from "vitest";
import {
  generateLuanaRepechagePairs,
  getLuanaKnockoutSize,
  getLuanaDirectAdvancingRanks,
  validateLuanaConfig,
} from "@/engine/luanaModeEngine";

describe("luanaModeEngine — Grupos + Repescagem Cruzada", () => {
  describe("getLuanaKnockoutSize", () => {
    it("retorna 8 para quartas", () => {
      expect(getLuanaKnockoutSize({ groupCount: 4, startsAt: "quarters" })).toBe(8);
    });
    it("retorna 16 para oitavas", () => {
      expect(getLuanaKnockoutSize({ groupCount: 4, startsAt: "eighths" })).toBe(16);
    });
  });

  describe("getLuanaDirectAdvancingRanks", () => {
    it("apenas 1º passa direto nas quartas", () => {
      expect(getLuanaDirectAdvancingRanks({ groupCount: 4, startsAt: "quarters" })).toEqual([1]);
    });
    it("1º a 4º passam direto nas oitavas", () => {
      expect(getLuanaDirectAdvancingRanks({ groupCount: 4, startsAt: "eighths" })).toEqual([1, 2, 3, 4]);
    });
  });

  describe("generateLuanaRepechagePairs — quartas", () => {
    it("gera 4 pares cruzados para 4 grupos", () => {
      const pairs = generateLuanaRepechagePairs({ groupCount: 4, startsAt: "quarters" });
      expect(pairs).toHaveLength(4);
    });

    it("respeita cruzamento espelhado A↔D / B↔C", () => {
      const pairs = generateLuanaRepechagePairs({ groupCount: 4, startsAt: "quarters" });
      const sigs = pairs.map(
        (p) =>
          `${p.team1.rank}${String.fromCharCode(65 + p.team1.groupIdx)}x${p.team2.rank}${String.fromCharCode(65 + p.team2.groupIdx)}`,
      );
      expect(sigs).toContain("2Ax3D");
      expect(sigs).toContain("2Dx3A");
      expect(sigs).toContain("2Bx3C");
      expect(sigs).toContain("2Cx3B");
    });

    it("nunca cruza 1º colocados", () => {
      const pairs = generateLuanaRepechagePairs({ groupCount: 4, startsAt: "quarters" });
      for (const p of pairs) {
        expect(p.team1.rank).not.toBe(1);
        expect(p.team2.rank).not.toBe(1);
      }
    });

    it("nunca cruza time consigo mesmo", () => {
      const pairs = generateLuanaRepechagePairs({ groupCount: 4, startsAt: "quarters" });
      for (const p of pairs) {
        expect(`${p.team1.groupIdx}-${p.team1.rank}`).not.toBe(
          `${p.team2.groupIdx}-${p.team2.rank}`,
        );
      }
    });
  });

  describe("generateLuanaRepechagePairs — oitavas", () => {
    it("não gera repescagem (delega ao formato padrão)", () => {
      const pairs = generateLuanaRepechagePairs({ groupCount: 4, startsAt: "eighths" });
      expect(pairs).toHaveLength(0);
    });
  });

  describe("validateLuanaConfig", () => {
    it("aceita 12 duplas em 4 grupos para quartas", () => {
      expect(() => validateLuanaConfig(12, { groupCount: 4, startsAt: "quarters" })).not.toThrow();
    });
    it("rejeita 8 duplas em 4 grupos para quartas (mínimo 12)", () => {
      expect(() => validateLuanaConfig(8, { groupCount: 4, startsAt: "quarters" })).toThrow();
    });
    it("aceita 16 duplas em 4 grupos para oitavas", () => {
      expect(() => validateLuanaConfig(16, { groupCount: 4, startsAt: "eighths" })).not.toThrow();
    });
    it("rejeita 12 duplas em 4 grupos para oitavas (mínimo 16)", () => {
      expect(() => validateLuanaConfig(12, { groupCount: 4, startsAt: "eighths" })).toThrow();
    });
    it("rejeita menos de 2 grupos", () => {
      expect(() => validateLuanaConfig(20, { groupCount: 1, startsAt: "quarters" })).toThrow();
    });
  });
});
