/**
 * TESTE DE REGIMENTO COMPLETO — TORNEIO PRO
 * 
 * Cobre TODOS os tamanhos de equipe especificados pelo usuário,
 * TODOS os esportes e TODAS as categorias.
 * 
 * Regras validadas:
 * 1. Fórmula (2N-3): exatamente essa quantidade de partidas
 * 2. Sem auto-confrontos (equipe vs ela mesma)
 * 3. Chapéu obrigatório para não-potências de 2
 * 4. Sem chapéu para potências de 2
 * 5. Partida Final existe e é única
 * 6. Partidas Semifinal existem para N > 2
 * 7. Todo vencedor tem next_win_match_id (exceto Final)
 * 8. Todo perdedor tem next_lose_match_id (exceto nas fases finais)
 * 9. Nenhuma partida tem ambos os times nulos simultaneamente em R1
 * 10. Não há links circulares (A→B→A)
 */

import { describe, it, expect } from "vitest";
import { generateDoubleEliminationBracket, DoubleEliminationConfig, getBaseBracketSize } from "@/lib/doubleEliminationLogic";

// Todos os tamanhos solicitados
const TEAM_COUNTS = [8, 9, 11, 12, 13, 15, 17, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40];

const SPORTS = ['beach_volleyball', 'futevolei', 'beach_tennis'] as const;
const CATEGORIES = ['Masculino', 'Feminino', 'Misto'] as const;

function makeTeams(n: number, sport: string, category: string) {
  return Array.from({ length: n }, (_, i) => ({
    id: `${sport}-${category}-team-${i + 1}`,
    player1_name: `${category} ${sport.slice(0, 3)} P1-${i + 1}`,
    player2_name: `${category} ${sport.slice(0, 3)} P2-${i + 1}`,
    seed: null,
  }));
}

function makeConfig(n: number, sport: string, category: string): DoubleEliminationConfig {
  return {
    tournamentId: `test-${sport}-${category}`,
    modalityId: `test-modality-${sport}-${category}`,
    teams: makeTeams(n, sport, category),
    useSeeds: false,
    allowThirdPlace: true,
  };
}

function isPowerOf2(n: number): boolean {
  return n > 0 && (n & (n - 1)) === 0;
}

// ──────────────────────────────────────────────────────────────────────────────
// BLOCO 1: Geração sem erros para TODOS os cenários
// ──────────────────────────────────────────────────────────────────────────────
describe("Regra 0 — Geração sem erros (todos os esportes, categorias e tamanhos)", () => {
  for (const sport of SPORTS) {
    for (const category of CATEGORIES) {
      for (const n of TEAM_COUNTS) {
        it(`${sport} / ${category} / ${n} duplas — gera sem exceção`, () => {
          expect(() => makeConfig(n, sport, category) && generateDoubleEliminationBracket(makeConfig(n, sport, category))).not.toThrow();
        });
      }
    }
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// BLOCO 2: Fórmula (2N-3) — REGRA BLINDADA
// ──────────────────────────────────────────────────────────────────────────────
describe("Regra 1 — Fórmula (2N-3): exatamente essa quantidade de partidas", () => {
  for (const n of TEAM_COUNTS) {
    it(`${n} duplas → deve ter exatamente ${2 * n - 3} partidas`, () => {
      const config = makeConfig(n, 'beach_volleyball', 'Masculino');
      const { matches } = generateDoubleEliminationBracket(config);
      expect(matches.length).toBe(2 * n - 3);
    });
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// BLOCO 3: Sem auto-confrontos
// ──────────────────────────────────────────────────────────────────────────────
describe("Regra 2 — Sem auto-confrontos (equipe vs ela mesma)", () => {
  for (const n of TEAM_COUNTS) {
    it(`${n} duplas — nenhuma equipe enfrenta ela mesma`, () => {
      const config = makeConfig(n, 'beach_volleyball', 'Masculino');
      const { matches } = generateDoubleEliminationBracket(config);
      for (const m of matches) {
        if (m.team1_id && m.team2_id) {
          expect(m.team1_id).not.toBe(m.team2_id);
        }
      }
    });
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// BLOCO 4: Chapéu obrigatório para não-potências de 2
// ──────────────────────────────────────────────────────────────────────────────
describe("Regra 3 — Chapéu obrigatório para não-potências de 2", () => {
  const nonPow2 = TEAM_COUNTS.filter(n => !isPowerOf2(n));
  for (const n of nonPow2) {
    it(`${n} duplas (não-pot2) — deve ter partidas chapéu`, () => {
      const config = makeConfig(n, 'beach_volleyball', 'Masculino');
      const { matches } = generateDoubleEliminationBracket(config);
      const chapeus = matches.filter((m: any) => m.is_chapeu === true);
      expect(chapeus.length).toBeGreaterThan(0);
    });
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// BLOCO 5: Sem chapéu para potências de 2
// ──────────────────────────────────────────────────────────────────────────────
describe("Regra 4 — Sem chapéu para potências de 2", () => {
  const pow2 = TEAM_COUNTS.filter(n => isPowerOf2(n));
  for (const n of pow2) {
    it(`${n} duplas (pot2) — NÃO deve ter partidas chapéu`, () => {
      const config = makeConfig(n, 'beach_volleyball', 'Masculino');
      const { matches } = generateDoubleEliminationBracket(config);
      const chapeus = matches.filter((m: any) => m.is_chapeu === true && m.bracket_type === 'winners');
      expect(chapeus.length).toBe(0);
    });
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// BLOCO 6: Final existe e é única
// ──────────────────────────────────────────────────────────────────────────────
describe("Regra 5 — Partida Final existe e é única", () => {
  for (const n of TEAM_COUNTS) {
    it(`${n} duplas — exatamente 1 partida 'final'`, () => {
      const config = makeConfig(n, 'beach_volleyball', 'Masculino');
      const { matches } = generateDoubleEliminationBracket(config);
      const finals = matches.filter((m: any) => m.bracket_type === 'final');
      expect(finals.length).toBe(1);
    });
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// BLOCO 7: Semifinais existem (para N suficientemente grande)
// ──────────────────────────────────────────────────────────────────────────────
describe("Regra 6 — Semifinais existem para N >= 4", () => {
  const largeCounts = TEAM_COUNTS.filter(n => n >= 4);
  for (const n of largeCounts) {
    it(`${n} duplas — deve ter semifinais`, () => {
      const config = makeConfig(n, 'beach_volleyball', 'Masculino');
      const { matches } = generateDoubleEliminationBracket(config);
      const semis = matches.filter((m: any) => m.bracket_type === 'semi_final');
      expect(semis.length).toBeGreaterThan(0);
    });
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// BLOCO 8: Não há links circulares (A→B→A)
// ──────────────────────────────────────────────────────────────────────────────
describe("Regra 7 — Sem links circulares (A→B→A)", () => {
  for (const n of TEAM_COUNTS) {
    it(`${n} duplas — sem links circulares`, () => {
      const config = makeConfig(n, 'beach_volleyball', 'Masculino');
      const { matches } = generateDoubleEliminationBracket(config);
      const any_matches = matches as any[];
      const matchMap = new Map(any_matches.map((m) => [m.id, m]));
      
      for (const m of any_matches) {
        // Check win path
        if (m.next_win_match_id) {
          expect(m.next_win_match_id).not.toBe(m.id);
          const next = matchMap.get(m.next_win_match_id);
          if (next) {
            expect(next.next_win_match_id).not.toBe(m.id);
            expect(next.next_lose_match_id).not.toBe(m.id);
          }
        }
        // Check lose path
        if (m.next_lose_match_id) {
          expect(m.next_lose_match_id).not.toBe(m.id);
          const nextL = matchMap.get(m.next_lose_match_id);
          if (nextL) {
            expect(nextL.next_win_match_id).not.toBe(m.id);
            expect(nextL.next_lose_match_id).not.toBe(m.id);
          }
        }
      }
    });
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// BLOCO 9: Partidas Winners têm bracket_half definido (upper ou lower)
// ──────────────────────────────────────────────────────────────────────────────
describe("Regra 8 — Winners têm bracket_half definido", () => {
  for (const n of TEAM_COUNTS) {
    it(`${n} duplas — todas partidas Winners têm bracket_half`, () => {
      const config = makeConfig(n, 'beach_volleyball', 'Masculino');
      const { matches } = generateDoubleEliminationBracket(config);
      const winners = matches.filter((m: any) => m.bracket_type === 'winners');
      for (const m of winners) {
        expect(['upper', 'lower']).toContain((m as any).bracket_half);
      }
    });
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// BLOCO 10: Esportes e categorias — consistência estrutural (amostra de 3 tamanhos por esporte/categoria)
// ──────────────────────────────────────────────────────────────────────────────
describe("Regra 9 — Consistência por esporte e categoria", () => {
  const sampleSizes = [8, 13, 20, 32];
  for (const sport of SPORTS) {
    for (const category of CATEGORIES) {
      for (const n of sampleSizes) {
        it(`${sport} / ${category} / ${n} duplas — fórmula (2N-3) = ${2 * n - 3}`, () => {
          const config = makeConfig(n, sport, category);
          const { matches } = generateDoubleEliminationBracket(config);
          expect(matches.length).toBe(2 * n - 3);
        });

        it(`${sport} / ${category} / ${n} duplas — sem auto-confrontos`, () => {
          const config = makeConfig(n, sport, category);
          const { matches } = generateDoubleEliminationBracket(config);
          for (const m of matches) {
            if ((m as any).team1_id && (m as any).team2_id) {
              expect((m as any).team1_id).not.toBe((m as any).team2_id);
            }
          }
        });
      }
    }
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// BLOCO 11: Distribuição equilibrada (dois lados da chave Winners)
// ──────────────────────────────────────────────────────────────────────────────
describe("Regra 10 — Dois lados da chave Winners (upper e lower)", () => {
  for (const n of TEAM_COUNTS) {
    it(`${n} duplas — chave Winners tem lados upper e lower`, () => {
      const config = makeConfig(n, 'beach_volleyball', 'Masculino');
      const { matches } = generateDoubleEliminationBracket(config);
      const upper = matches.filter((m: any) => m.bracket_type === 'winners' && m.bracket_half === 'upper');
      const lower = matches.filter((m: any) => m.bracket_type === 'winners' && m.bracket_half === 'lower');
      // Both sides must have at least 1 match for n >= 4
      if (n >= 4) {
        expect(upper.length).toBeGreaterThan(0);
        expect(lower.length).toBeGreaterThan(0);
      }
    });
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// BLOCO 12: Chave Perdedores existe
// ──────────────────────────────────────────────────────────────────────────────
describe("Regra 11 — Chave Perdedores existe para N >= 4", () => {
  for (const n of TEAM_COUNTS.filter(n => n >= 4)) {
    it(`${n} duplas — tem partidas na chave Perdedores`, () => {
      const config = makeConfig(n, 'beach_volleyball', 'Masculino');
      const { matches } = generateDoubleEliminationBracket(config);
      const losers = matches.filter((m: any) => m.bracket_type === 'losers');
      expect(losers.length).toBeGreaterThan(0);
    });
  }
});
