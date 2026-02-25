/**
 * Motor de Seeding Dinâmico (ELO-based)
 *
 * Ordena equipes por ELO decrescente e atribui seeds sequenciais.
 * Módulo puro — sem dependências de UI, banco ou React.
 */

export interface TeamSeedData {
  id: string;
  elo: number;
}

export function generateSeeds(teams: TeamSeedData[]): { id: string; seed: number }[] {
  return [...teams]
    .sort((a, b) => b.elo - a.elo)
    .map((t, idx) => ({ id: t.id, seed: idx + 1 }));
}
