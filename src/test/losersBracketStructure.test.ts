import { describe, it, expect } from "vitest";
import { generateDoubleEliminationBracket } from "@/lib/doubleEliminationLogic";

function makeTeams(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    id: `t${i + 1}`,
    name: `T${i + 1}`,
    seed: i + 1,
    player1_name: `P${i + 1}A`,
    player2_name: `P${i + 1}B`,
  }));
}

describe("Losers bracket — rodada de consolidação (REGRESSÃO bug jogo #26)", () => {
  for (const N of [4, 8, 16]) {
    it(`gera ${N} duplas com total correto (2N-3)`, () => {
      const result = generateDoubleEliminationBracket({
        tournamentId: "x",
        modalityId: "y",
        teams: makeTeams(N) as any,
        useSeeds: false,
      } as any);
      expect(result.matches.length).toBe(2 * N - 3);
    });
  }

  it("N=8: derrotado de cada lado da Winners NUNCA pula rodada nos perdedores", () => {
    const result = generateDoubleEliminationBracket({
      tournamentId: "x", modalityId: "y",
      teams: makeTeams(8) as any, useSeeds: false,
    } as any);

    // Cada lado do losers tem 2 matches (R1, R2). Nenhum vencedor de R1 pode
    // pular R2 (caso aconteceria via reduction loop sem consolidação).
    for (const half of ["upper", "lower"] as const) {
      const losersR1 = result.matches.filter(
        (m: any) => m.bracket_type === "losers" && m.bracket_half === half && m.round === 1,
      );
      for (const r1 of losersR1) {
        const target = result.matches.find((m: any) => m.id === r1.next_win_match_id);
        expect(target, `L ${half} R1 deve ter destino`).toBeTruthy();
        expect(target!.round).toBe(2); // sempre R2, nunca pular para R3+
      }
    }
  });

  it("N=16: derrotado da semifinal dos vencedores cai na rodada APÓS a consolidação", () => {
    const result = generateDoubleEliminationBracket({
      tournamentId: "x", modalityId: "y",
      teams: makeTeams(16) as any, useSeeds: false,
    } as any);

    const wSemis = result.matches.filter(
      (m: any) => m.bracket_type === "winners" && m.round === 3,
    );

    for (const ws of wSemis) {
      const losersTarget = result.matches.find((m: any) => m.id === ws.next_lose_match_id);
      expect(losersTarget, `Winners semi (R3) deve ter destino nos perdedores`).toBeTruthy();
      // Antes do fix: caía em L R3 (errado, pulava consolidação).
      // Depois do fix: cai em L R4, depois da rodada de consolidação.
      expect(losersTarget!.round).toBeGreaterThanOrEqual(4);
    }

    // Verificar que existe rodada de consolidação em L R3 (sem droppers da W)
    for (const half of ["upper", "lower"] as const) {
      const lR3 = result.matches.filter(
        (m: any) => m.bracket_type === "losers" && m.bracket_half === half && m.round === 3,
      );
      expect(lR3.length, `L ${half} R3 deve existir como consolidação`).toBe(1);
      // Nenhum match da W deve apontar para L R3 via next_lose_match_id
      const droppersToR3 = result.matches.filter(
        (m: any) => m.bracket_type === "winners" && m.next_lose_match_id === (lR3[0] as any).id,
      );
      expect(droppersToR3.length, `L ${half} R3 não deve receber derrotados (é consolidação)`).toBe(0);
    }
  });
});
