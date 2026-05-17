/**
 * Motor de Desempate Configurável
 *
 * Ordena equipes aplicando critérios em cascata:
 * só avança para o próximo critério quando há empate no anterior.
 *
 * Módulo puro — sem dependências de UI, banco ou React.
 */

// ── Tipos ────────────────────────────────────────────────────

export type TiebreakCriteria = "wins" | "point_diff" | "head_to_head";

export interface TeamStats {
  id: string;
  wins: number;
  pointDiff: number;
}

/**
 * Entrada do mapa de confronto direto.
 * Chave do mapa: `${team1Id}_${team2Id}` (formato match-based, não ordenado).
 * Inclui scores quando disponíveis para permitir mini-tabela em empates
 * multi-way (3+ equipes empatadas em ciclo).
 */
export interface HeadToHeadEntry {
  winnerId: string;
  team1Id?: string;
  team2Id?: string;
  score1?: number;
  score2?: number;
}

// ── Comparadores por critério ────────────────────────────────

type Comparator = (a: TeamStats, b: TeamStats) => number;

function byWins(a: TeamStats, b: TeamStats): number {
  return b.wins - a.wins;
}

function byPointDiff(a: TeamStats, b: TeamStats): number {
  return b.pointDiff - a.pointDiff;
}

/**
 * Ordena um grupo empatado pelo critério de confronto direto via MINI-TABELA.
 *
 * Regra (padrão CBV/FIVB para empate em N equipes):
 *   1. Filtra apenas as partidas entre as equipes empatadas.
 *   2. Recalcula vitórias e saldo de pontos restritos a esse sub-grupo.
 *   3. Ordena por vitórias-mini desc → saldo-mini desc.
 *
 * Funciona corretamente para 2-way (par direto) e N-way (resolve ciclos
 * como A>B, B>C, C>A onde a comparação par-a-par é inconclusiva).
 */
function sortByHeadToHeadMiniTable(
  group: TeamStats[],
  headToHeadMap: Record<string, HeadToHeadEntry>
): TeamStats[] {
  if (group.length <= 1) return [...group];

  const memberIds = new Set(group.map((t) => t.id));
  const miniStats: Record<string, { wins: number; pf: number; pa: number }> = {};
  group.forEach((t) => {
    miniStats[t.id] = { wins: 0, pf: 0, pa: 0 };
  });

  // Coletar partidas onde AMBOS os times pertencem ao sub-grupo.
  // Iterar entradas únicas evita contagem dobrada quando o mapa tem ambas as direções.
  const seen = new Set<string>();
  Object.values(headToHeadMap).forEach((entry) => {
    const t1 = entry.team1Id;
    const t2 = entry.team2Id;
    if (!t1 || !t2) return;
    if (!memberIds.has(t1) || !memberIds.has(t2)) return;
    const canon = t1 < t2 ? `${t1}|${t2}` : `${t2}|${t1}`;
    if (seen.has(canon)) return;
    seen.add(canon);

    const s1 = entry.score1 ?? 0;
    const s2 = entry.score2 ?? 0;
    miniStats[t1].pf += s1;
    miniStats[t1].pa += s2;
    miniStats[t2].pf += s2;
    miniStats[t2].pa += s1;
    if (entry.winnerId === t1) miniStats[t1].wins++;
    else if (entry.winnerId === t2) miniStats[t2].wins++;
  });

  return [...group].sort((a, b) => {
    const sa = miniStats[a.id];
    const sb = miniStats[b.id];
    if (sb.wins !== sa.wins) return sb.wins - sa.wins;
    const diffA = sa.pf - sa.pa;
    const diffB = sb.pf - sb.pa;
    return diffB - diffA;
  });
}

function groupByEquality(
  sorted: TeamStats[],
  equal: (a: TeamStats, b: TeamStats) => boolean
): TeamStats[][] {
  const groups: TeamStats[][] = [];
  if (sorted.length === 0) return groups;
  let current: TeamStats[] = [sorted[0]];
  for (let i = 1; i < sorted.length; i++) {
    if (equal(current[0], sorted[i])) current.push(sorted[i]);
    else {
      groups.push(current);
      current = [sorted[i]];
    }
  }
  groups.push(current);
  return groups;
}

// ── Motor principal ──────────────────────────────────────────

/**
 * Ordena `teams` aplicando `criteriaOrder` em cascata.
 *
 * Dentro de cada grupo empatado pelo critério N,
 * aplica o critério N+1 apenas aos membros desse sub-grupo.
 *
 * O critério `head_to_head` usa MINI-TABELA (vitórias + saldo restritos
 * às partidas entre as equipes empatadas), resolvendo ciclos N-way.
 */
export function resolveTie(
  teams: TeamStats[],
  criteriaOrder: TiebreakCriteria[],
  headToHeadMap?: Record<string, HeadToHeadEntry>
): TeamStats[] {
  if (teams.length <= 1 || criteriaOrder.length === 0) {
    return [...teams];
  }

  const [current, ...remaining] = criteriaOrder;
  const map = headToHeadMap ?? {};

  // 1) Ordenar pelo critério atual
  let sorted: TeamStats[];
  let groups: TeamStats[][];

  if (current === "head_to_head") {
    sorted = sortByHeadToHeadMiniTable(teams, map);
    // Reagrupar empates pelo critério: mesmas vitórias-mini E mesmo saldo-mini
    const memberIds = new Set(sorted.map((t) => t.id));
    const miniStats: Record<string, { wins: number; pf: number; pa: number }> = {};
    sorted.forEach((t) => (miniStats[t.id] = { wins: 0, pf: 0, pa: 0 }));
    const seen = new Set<string>();
    Object.values(map).forEach((entry) => {
      const t1 = entry.team1Id;
      const t2 = entry.team2Id;
      if (!t1 || !t2 || !memberIds.has(t1) || !memberIds.has(t2)) return;
      const canon = t1 < t2 ? `${t1}|${t2}` : `${t2}|${t1}`;
      if (seen.has(canon)) return;
      seen.add(canon);
      const s1 = entry.score1 ?? 0;
      const s2 = entry.score2 ?? 0;
      miniStats[t1].pf += s1;
      miniStats[t1].pa += s2;
      miniStats[t2].pf += s2;
      miniStats[t2].pa += s1;
      if (entry.winnerId === t1) miniStats[t1].wins++;
      else if (entry.winnerId === t2) miniStats[t2].wins++;
    });
    groups = groupByEquality(sorted, (a, b) => {
      const sa = miniStats[a.id];
      const sb = miniStats[b.id];
      return sa.wins === sb.wins && sa.pf - sa.pa === sb.pf - sb.pa;
    });
  } else {
    const comparator: Comparator = current === "wins" ? byWins : byPointDiff;
    sorted = [...teams].sort(comparator);
    groups = groupByEquality(sorted, (a, b) => comparator(a, b) === 0);
  }

  // 2) Recursivamente desempatar sub-grupos com critérios restantes
  const result: TeamStats[] = [];
  for (const group of groups) {
    if (group.length === 1 || remaining.length === 0) {
      result.push(...group);
    } else {
      result.push(...resolveTie(group, remaining, map));
    }
  }

  return result;
}
