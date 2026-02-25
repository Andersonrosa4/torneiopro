/**
 * Motor de Seeding por Seed Manual
 *
 * Ordena equipes pelo seed existente (menor = melhor).
 * Equipes sem seed ficam ao final.
 * Módulo puro — sem dependências de UI, banco ou React.
 */

export interface TeamSeedData {
  id: string;
  seed: number;
}

export function generateSeeds(teams: TeamSeedData[]): { id: string; seed: number }[] {
  return [...teams]
    .sort((a, b) => {
      // Teams with seed 0 or no seed go last
      const aSeed = a.seed || Infinity;
      const bSeed = b.seed || Infinity;
      return aSeed - bSeed;
    })
    .map((t, idx) => ({ id: t.id, seed: idx + 1 }));
}
