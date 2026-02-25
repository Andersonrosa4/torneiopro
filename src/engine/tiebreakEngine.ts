/**
 * Motor de Desempate Configurável
 *
 * Ordena equipes aplicando critérios em cascata:
 * só avança para o próximo critério quando há empate no anterior.
 *
 * Módulo puro — sem dependências de UI, banco ou React.
 */

// ── Tipos ────────────────────────────────────────────────────

export type TiebreakCriteria = "wins" | "point_diff" | "head_to_head" | "elo";

export interface TeamStats {
  id: string;
  wins: number;
  pointDiff: number;
  elo?: number;
}

// ── Comparadores por critério ────────────────────────────────

type Comparator = (a: TeamStats, b: TeamStats) => number;

function byWins(a: TeamStats, b: TeamStats): number {
  return b.wins - a.wins;
}

function byPointDiff(a: TeamStats, b: TeamStats): number {
  return b.pointDiff - a.pointDiff;
}

function byElo(a: TeamStats, b: TeamStats): number {
  return (b.elo ?? 0) - (a.elo ?? 0);
}

function byHeadToHead(
  headToHeadMap: Record<string, { winnerId: string }>
): Comparator {
  return (a: TeamStats, b: TeamStats): number => {
    const key1 = `${a.id}_${b.id}`;
    const key2 = `${b.id}_${a.id}`;
    const match = headToHeadMap[key1] ?? headToHeadMap[key2];
    if (!match) return 0;
    if (match.winnerId === a.id) return -1;
    if (match.winnerId === b.id) return 1;
    return 0;
  };
}

function getComparator(
  criteria: TiebreakCriteria,
  headToHeadMap?: Record<string, { winnerId: string }>
): Comparator {
  switch (criteria) {
    case "wins":
      return byWins;
    case "point_diff":
      return byPointDiff;
    case "elo":
      return byElo;
    case "head_to_head":
      return byHeadToHead(headToHeadMap ?? {});
  }
}

// ── Motor principal ──────────────────────────────────────────

/**
 * Ordena `teams` aplicando `criteriaOrder` em cascata.
 *
 * Dentro de cada grupo empatado pelo critério N,
 * aplica o critério N+1 apenas aos membros desse sub-grupo.
 */
export function resolveTie(
  teams: TeamStats[],
  criteriaOrder: TiebreakCriteria[],
  headToHeadMap?: Record<string, { winnerId: string }>
): TeamStats[] {
  if (teams.length <= 1 || criteriaOrder.length === 0) {
    return [...teams];
  }

  const [current, ...remaining] = criteriaOrder;
  const comparator = getComparator(current, headToHeadMap);

  // Ordenar pelo critério atual
  const sorted = [...teams].sort(comparator);

  // Agrupar empates (comparator retorna 0)
  const groups: TeamStats[][] = [];
  let currentGroup: TeamStats[] = [sorted[0]];

  for (let i = 1; i < sorted.length; i++) {
    if (comparator(currentGroup[0], sorted[i]) === 0) {
      currentGroup.push(sorted[i]);
    } else {
      groups.push(currentGroup);
      currentGroup = [sorted[i]];
    }
  }
  groups.push(currentGroup);

  // Recursivamente desempatar sub-grupos com critérios restantes
  const result: TeamStats[] = [];
  for (const group of groups) {
    if (group.length === 1 || remaining.length === 0) {
      result.push(...group);
    } else {
      result.push(...resolveTie(group, remaining, headToHeadMap));
    }
  }

  return result;
}
