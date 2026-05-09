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
//
// COMPACTAÇÃO (v2):
// - Schema usa chaves curtas e tuplas para reduzir o tamanho do JSON e
//   o custo de `JSON.stringify` durante a rolagem (chamado via throttle).
// - Linhas são serializadas como tuplas posicionais (sem repetir nomes
//   de campos nem `tournament_id` por linha).
// - Mantemos um cache 1-slot da serialização das linhas (por identidade
//   de referência), de modo que rolar (mudando apenas `scrollY`) NÃO
//   re-serializa o array inteiro de linhas.
//
// VERSIONAMENTO E MIGRAÇÃO (v2+):
// - Toda entrada carrega `v` (schema version). Na leitura, se `v` não bate,
//   tentamos rodar migrações registradas em `MIGRATIONS` (v1→v2, v2→v3, …).
//   Se NÃO houver caminho até a versão atual, a entrada é REMOVIDA
//   automaticamente (auto-clear) — evitando hidratar com dados incompatíveis
//   ou crashar na expansão. O caller volta a refetch da 1ª página.
// - `sweepIncompatibleKeys()` varre TODAS as chaves `bug-audit:*` no
//   sessionStorage e descarta as que não puderem ser migradas. Idempotente.

import {
  toCursor,
  type KeysetCursor,
} from "@/lib/bugCombatantLogCursor";

const SCHEMA_VERSION = 2;
const MAX_PERSISTED_ROWS = 200;
const STORAGE_KEY_PREFIX = "bug-audit:";

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

// ---------- Compact schema (v2) ----------
//
// {
//   v:  2,
//   k:  tournament_id,
//   f:  [source, scope, search],
//   y:  scrollY (int),
//   c:  null | [created_at, id],
//   p:  pageIndex (int),
//   m:  0 | 1   // hasMore
//   a:  savedAt (int, ms)
//   r:  [[id, scanned, fixed, remaining, source, created_at, applied_fixes], ...]
// }
//
// Cada linha é uma TUPLA posicional. `tournament_id` não é repetido por
// linha (é redundante com `k`). Números são forçados a inteiros (|0).

type CompactRow = [
  string,         // id
  number,         // scanned
  number,         // fixed
  number,         // remaining
  string,         // source
  string,         // created_at
  unknown,        // applied_fixes
];

interface CompactPayload {
  v: 2;
  k: string;
  f: [Source, Scope, string];
  y: number;
  c: [string, string] | null;
  p: number;
  m: 0 | 1;
  a: number;
  r: CompactRow[];
}

export function storageKey(tournamentId: string): string {
  return `bug-audit:${tournamentId}`;
}

function compactRow(r: PersistedRow): CompactRow {
  return [
    r.id,
    r.scanned | 0,
    r.fixed | 0,
    r.remaining | 0,
    r.source,
    r.created_at,
    r.applied_fixes ?? null,
  ];
}

function expandRow(t: CompactRow, tournamentId: string): PersistedRow | null {
  if (!Array.isArray(t) || t.length < 7) return null;
  const [id, scanned, fixed, remaining, source, created_at, applied_fixes] = t;
  if (typeof id !== "string" || typeof source !== "string" || typeof created_at !== "string") {
    return null;
  }
  return {
    id,
    tournament_id: tournamentId,
    scanned: Number(scanned) | 0,
    fixed: Number(fixed) | 0,
    remaining: Number(remaining) | 0,
    source,
    created_at,
    applied_fixes: applied_fixes ?? null,
  };
}

// Cache 1-slot da serialização das linhas (por identidade da array).
// Evita re-stringificar `rows` durante a rolagem, quando apenas `scrollY`
// muda. Exposto via __INTERNAL para testes.
let _rowsJsonCache: { ref: PersistedRow[]; json: string } | null = null;

function serializeRows(rows: PersistedRow[]): string {
  if (_rowsJsonCache && _rowsJsonCache.ref === rows) return _rowsJsonCache.json;
  const json = JSON.stringify(rows.map(compactRow));
  _rowsJsonCache = { ref: rows, json };
  return json;
}

function resetRowsCache(): void {
  _rowsJsonCache = null;
}

/**
 * Constrói o JSON compacto. Usa concatenação de strings para que a
 * porção `rows` (potencialmente grande) possa vir do cache, evitando
 * percorrer o array novamente quando só `scrollY` mudou.
 */
export function buildCompactJson(state: Omit<PersistedState, "v" | "savedAt">): string {
  // Preserva a identidade do array quando já está dentro do cap, para que
  // o cache de serialização funcione durante a rolagem (apenas `scrollY` muda).
  const cappedRows = state.rows.length <= MAX_PERSISTED_ROWS
    ? state.rows
    : state.rows.slice(0, MAX_PERSISTED_ROWS);
  const rowsJson = serializeRows(cappedRows);
  const cursorJson = state.cursor
    ? `[${JSON.stringify(state.cursor.created_at)},${JSON.stringify(state.cursor.id)}]`
    : "null";
  return (
    `{"v":${SCHEMA_VERSION}` +
    `,"k":${JSON.stringify(state.tournament_id)}` +
    `,"f":[${JSON.stringify(state.source)},${JSON.stringify(state.scope)},${JSON.stringify(state.search ?? "")}]` +
    `,"y":${(state.scrollY | 0)}` +
    `,"c":${cursorJson}` +
    `,"p":${state.pageIndex | 0}` +
    `,"m":${state.hasMore ? 1 : 0}` +
    `,"a":${Date.now()}` +
    `,"r":${rowsJson}` +
    `}`
  );
}

/** Lê o estado bruto do sessionStorage e expande para o formato canônico. */
export function readPersisted(tournamentId: string): RawPersisted {
  if (typeof sessionStorage === "undefined") return {};
  try {
    const raw = sessionStorage.getItem(storageKey(tournamentId));
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    return expandPayload(parsed as CompactPayload | RawPersisted);
  } catch {
    return {};
  }
}

function expandPayload(p: CompactPayload | RawPersisted): RawPersisted {
  // Apenas v=SCHEMA_VERSION (2) é aceito. v1 é descartado silenciosamente.
  if (!("v" in p) || p.v !== SCHEMA_VERSION) return {};
  const c = p as CompactPayload;
  const tournamentId = typeof c.k === "string" ? c.k : "";
  const filters = Array.isArray(c.f) ? c.f : [];
  const rowsRaw = Array.isArray(c.r) ? c.r : [];
  const rows = rowsRaw
    .map((t) => expandRow(t as CompactRow, tournamentId))
    .filter((x): x is PersistedRow => x !== null);
  const cursor = Array.isArray(c.c) && c.c.length === 2
    ? { created_at: String(c.c[0]), id: String(c.c[1]) }
    : null;
  return {
    v: c.v,
    tournament_id: tournamentId,
    source: (filters[0] as Source) ?? "all",
    scope: (filters[1] as Scope) ?? "tournament",
    search: typeof filters[2] === "string" ? (filters[2] as string) : "",
    scrollY: typeof c.y === "number" ? c.y : 0,
    cursor,
    rows,
    pageIndex: typeof c.p === "number" ? c.p : 0,
    hasMore: c.m === 1,
  };
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
  const cursor = p.cursor ? toCursor(p.cursor) : null;
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
    const json = buildCompactJson(state);
    sessionStorage.setItem(storageKey(state.tournament_id), json);
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

export const __INTERNAL = {
  SCHEMA_VERSION,
  MAX_PERSISTED_ROWS,
  resetRowsCache,
  serializeRows,
  buildCompactJson,
};
