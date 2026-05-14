import { describe, it, expect } from "vitest";
import {
  eighthsToQuartersPosition,
  quartersToSemisPosition,
} from "../bracketCrossings";

describe("eighthsToQuartersPosition (Modo Veranico — Oitavas)", () => {
  it("Q1 recebe vencedores de O1 e O6", () => {
    expect(eighthsToQuartersPosition(1)).toBe(1);
    expect(eighthsToQuartersPosition(6)).toBe(1);
  });

  it("Q2 recebe vencedores de O3 e O8", () => {
    expect(eighthsToQuartersPosition(3)).toBe(2);
    expect(eighthsToQuartersPosition(8)).toBe(2);
  });

  it("Q3 recebe vencedores de O2 e O5", () => {
    expect(eighthsToQuartersPosition(2)).toBe(3);
    expect(eighthsToQuartersPosition(5)).toBe(3);
  });

  it("Q4 recebe vencedores de O4 e O7", () => {
    expect(eighthsToQuartersPosition(4)).toBe(4);
    expect(eighthsToQuartersPosition(7)).toBe(4);
  });

  it("cobre todas as 8 oitavas, exatamente 2 por quarta", () => {
    const counts: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };
    for (let pos = 1; pos <= 8; pos++) {
      counts[eighthsToQuartersPosition(pos)]++;
    }
    expect(counts).toEqual({ 1: 2, 2: 2, 3: 2, 4: 2 });
  });

  it("garante que oitavas da mesma metade não se reencontram nas quartas", () => {
    // O1, O2, O3, O4 = metade superior do bracket (chaves A/B/C/D 1º colocados)
    // O5..O8 = metade inferior (2º colocados)
    // Cada quarta deve juntar exatamente 1 da metade superior e 1 da inferior.
    for (let q = 1; q <= 4; q++) {
      const sources = [1, 2, 3, 4, 5, 6, 7, 8].filter(
        (o) => eighthsToQuartersPosition(o) === q,
      );
      expect(sources).toHaveLength(2);
      const upper = sources.filter((o) => o <= 4).length;
      const lower = sources.filter((o) => o >= 5).length;
      expect(upper).toBe(1);
      expect(lower).toBe(1);
    }
  });

  it("rejeita posições fora do intervalo 1..8", () => {
    expect(() => eighthsToQuartersPosition(0)).toThrow();
    expect(() => eighthsToQuartersPosition(9)).toThrow();
    expect(() => eighthsToQuartersPosition(-1)).toThrow();
  });
});

describe("quartersToSemisPosition (Mirrored Extremes)", () => {
  it("S1 recebe Q1 e Q4", () => {
    expect(quartersToSemisPosition(1)).toBe(1);
    expect(quartersToSemisPosition(4)).toBe(1);
  });

  it("S2 recebe Q2 e Q3", () => {
    expect(quartersToSemisPosition(2)).toBe(2);
    expect(quartersToSemisPosition(3)).toBe(2);
  });

  it("rejeita posições fora do intervalo 1..4", () => {
    expect(() => quartersToSemisPosition(0)).toThrow();
    expect(() => quartersToSemisPosition(5)).toThrow();
  });
});
