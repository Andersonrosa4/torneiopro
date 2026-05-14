/**
 * Mapeamentos de cruzamento entre fases do chaveamento eliminatório.
 *
 * IMPORTANTE: estas funções são a "fonte da verdade" para o cruzamento
 * Oitavas → Quartas → Semis no Modo Veranico (Oitavas, 4 chaves × 4 vagas)
 * e no fluxo padrão de pré-geração de chaves quando aplicável.
 *
 * Qualquer alteração aqui DEVE quebrar os testes em
 * `src/lib/__tests__/bracketCrossings.test.ts` para evitar regressões.
 */

/**
 * Cruzamento Oitavas (8 jogos) → Quartas (4 jogos).
 *
 * Pareamentos definidos pelo organizador:
 *   Q1: O1 × O6
 *   Q2: O3 × O8
 *   Q3: O2 × O5
 *   Q4: O4 × O7
 *
 * @param oitavasPosition posição da partida nas oitavas (1..8)
 * @returns posição (1..4) da partida das quartas que recebe o vencedor
 */
export function eighthsToQuartersPosition(oitavasPosition: number): number {
  const map: Record<number, number> = {
    1: 1, 6: 1,
    3: 2, 8: 2,
    2: 3, 5: 3,
    4: 4, 7: 4,
  };
  const next = map[oitavasPosition];
  if (!next) {
    throw new Error(`Posição inválida nas oitavas: ${oitavasPosition} (esperado 1..8)`);
  }
  return next;
}

/**
 * Cruzamento Quartas (4 jogos) → Semis (2 jogos) — "Mirrored Extremes".
 *   S1: Q1 × Q4
 *   S2: Q2 × Q3
 */
export function quartersToSemisPosition(quartersPosition: number): number {
  const map: Record<number, number> = { 1: 1, 4: 1, 2: 2, 3: 2 };
  const next = map[quartersPosition];
  if (!next) {
    throw new Error(`Posição inválida nas quartas: ${quartersPosition} (esperado 1..4)`);
  }
  return next;
}
