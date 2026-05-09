// Persistência (sessionStorage) do estado da aba "Auditoria do Combatedor".
// Permite retomar a paginação após refresh sem quebrar a ordem keyset.
//
// Princípios:
// - Versionada (campo `v`) para invalidar formatos antigos sem crashar.
// - Cursor é validado contra o formato canônico ANTES de ser reutilizado;
//   se inválido, descartamos e voltamos para refetch da 1ª página.
// - Filtros (tournamentId/source/scope) são parte da chave lógica:
//   ao mudarem, a lista hidratada é descartada (porque cursor + rows
//   só fazem sentido para a mesma combinação).
// - Cap de linhas para não estourar quota do sessionStorage.

import {
  toCursor,
  type KeysetCursor,
} from "@/lib/bugCombatantLogCursor";

const SCHEMA_VERSION = 1;
const MAX_PERSISTED_ROWS = 200;

export type Source = "all" | "cron" | "manual";
export type Scope = "tournament" | "all";

export interface PersistedRow {
  id: string;
  tournament_id: string;
  scanned: number;
  fixed: number;
  remaining: number;
  source: string;
  applied_fixes: unknown;
  created_at: string;
}

export interface PersistedState {
  v: number;
  tournament_id: string;
  source: Source;
  scope: Scope;
  search: string;
  scrollY: number;
  cursor: KeysetCursor | null;
  rows: PersistedRow[];
  pageIndex: number;
  hasMore: boolean;
  savedAt: number;
}

export interface RawPersisted {
  source?: Source;
  scope?: Scope;
  search?: string;
  scrollY?: number;
  cursor?: KeysetCursor | null;
  rows?: PersistedRow[];
  pageIndex?: number;
  hasMore?: boolean;
  v?: number;
  tournament_id?: string;
}

export function storageKey(tournamentId: string): string {
  return `bug-audit:${tournamentId}`;
}

/** Lê o estado bruto do sessionStorage. Sempre seguro. */
export function readPersisted(tournamentId: string): RawPersisted {
  if (typeof sessionStorage === "undefined") return {};
  try {
    const raw = sessionStorage.getItem(storageKey(tournamentId));
    if (!raw) return {};
    const parsed = JSON.parse(raw) as RawPersisted;
    if (!parsed || typeof parsed !== "object") return {};
    return parsed;
  } catch {
    return {};
  }
}

/**
 * Valida o estado persistido para HIDRATAÇÃO de paginação.
 * Retorna `null` se algo não bate (versão antiga, torneio diferente,
 * filtros diferentes, cursor inválido, etc.) — caller deve fazer refetch.
 */
export function getHydratableState(
  tournamentId: string,
  source: Source,
  scope: Scope,
): {
  rows: PersistedRow[];
  cursor: KeysetCursor | null;
  pageIndex: number;
  hasMore: boolean;
} | null {
  const p = readPersisted(tournamentId);
  if (p.v !== SCHEMA_VERSION) return null;
  if (p.tournament_id !== tournamentId) return null;
  if (p.source !== source || p.scope !== scope) return null;
  const rows = Array.isArray(p.rows) ? p.rows : [];
  if (rows.length === 0) return null;
  // Cursor: valida formato antes de entregar
  const cursor = p.cursor ? toCursor(p.cursor) : null;
  // Se havia cursor persistido mas é inválido → descarta tudo (estado corrompido)
  if (p.cursor && !cursor) return null;
  return {
    rows,
    cursor,
    pageIndex: typeof p.pageIndex === "number" ? p.pageIndex : 0,
    hasMore: typeof p.hasMore === "boolean" ? p.hasMore : true,
  };
}

export function writePersisted(state: Omit<PersistedState, "v" | "savedAt">): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    const payload: PersistedState = {
      v: SCHEMA_VERSION,
      savedAt: Date.now(),
      ...state,
      rows: state.rows.slice(0, MAX_PERSISTED_ROWS),
    };
    sessionStorage.setItem(storageKey(state.tournament_id), JSON.stringify(payload));
  } catch {
    // quota / modo privado / serialização: ignora.
  }
}

export function clearPersisted(tournamentId: string): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.removeItem(storageKey(tournamentId));
  } catch { /* ignore */ }
}

export const __INTERNAL = { SCHEMA_VERSION, MAX_PERSISTED_ROWS };
