// Pure helpers for the Bug Combatant Audit list.
// Garante ordenação estável (created_at desc, id desc) e deduplicação por id.

export interface OrderableLogRow {
  id: string;
  tournament_id: string;
  source: string;
  created_at: string;
  // outros campos podem existir; só usamos os acima para ordenar/filtrar
  [key: string]: unknown;
}

export type LogScope = "tournament" | "all";
export type LogSource = "all" | "cron" | "manual";

export interface LogFilters {
  tournamentId: string;
  scope: LogScope;
  source: LogSource;
}

/** (created_at desc, id desc) — true se `a` vem antes de `b` na lista. */
export function isBefore(a: OrderableLogRow, b: OrderableLogRow): boolean {
  if (a.created_at === b.created_at) return a.id > b.id;
  return a.created_at > b.created_at;
}

/** Ordena uma lista pela mesma chave usada na paginação keyset. */
export function sortDesc<T extends OrderableLogRow>(rows: T[]): T[] {
  return rows.slice().sort((a, b) => {
    if (a.created_at === b.created_at) return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
    return a.created_at < b.created_at ? 1 : -1;
  });
}

/** Remove duplicados por id mantendo a primeira ocorrência. */
export function dedupById<T extends OrderableLogRow>(rows: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const r of rows) {
    if (seen.has(r.id)) continue;
    seen.add(r.id);
    out.push(r);
  }
  return out;
}

/** Faz append de uma página nova removendo qualquer id já presente. */
export function appendPage<T extends OrderableLogRow>(prev: T[], page: T[]): T[] {
  const seen = new Set(prev.map((r) => r.id));
  const next = page.filter((r) => !seen.has(r.id));
  return [...prev, ...next];
}

export function matchesFilters(row: OrderableLogRow, f: LogFilters): boolean {
  if (f.scope === "tournament" && row.tournament_id !== f.tournamentId) return false;
  if (f.source !== "all" && row.source !== f.source) return false;
  return true;
}

/**
 * Insere uma linha vinda do realtime mantendo (created_at desc, id desc) e dedup.
 * Quando `hasMore` é true (ainda há páginas para carregar) e a linha cai além
 * do final da lista carregada, descarta — paginação subsequente a buscará.
 */
export function insertOrdered<T extends OrderableLogRow>(
  prev: T[],
  row: T,
  hasMore: boolean,
): T[] {
  if (prev.some((r) => r.id === row.id)) return prev;
  const idx = prev.findIndex((r) => !isBefore(r, row));
  if (idx === -1) {
    if (hasMore) return prev;
    return [...prev, row];
  }
  const next = prev.slice();
  next.splice(idx, 0, row);
  return next;
}

export type RealtimeEvent<T extends OrderableLogRow> =
  | { type: "INSERT"; row: T }
  | { type: "UPDATE"; row: T }
  | { type: "DELETE"; id: string };

/** Aplica um evento de realtime preservando ordenação, dedup e filtros. */
export function applyRealtimeEvent<T extends OrderableLogRow>(
  prev: T[],
  event: RealtimeEvent<T>,
  filters: LogFilters,
  hasMore: boolean,
): T[] {
  if (event.type === "DELETE") return prev.filter((r) => r.id !== event.id);
  if (event.type === "INSERT") {
    if (!matchesFilters(event.row, filters)) return prev;
    return insertOrdered(prev, event.row, hasMore);
  }
  // UPDATE
  const exists = prev.some((r) => r.id === event.row.id);
  if (!exists) {
    return matchesFilters(event.row, filters)
      ? insertOrdered(prev, event.row, hasMore)
      : prev;
  }
  if (!matchesFilters(event.row, filters)) {
    return prev.filter((r) => r.id !== event.row.id);
  }
  return prev.map((r) => (r.id === event.row.id ? { ...r, ...event.row } : r));
}
