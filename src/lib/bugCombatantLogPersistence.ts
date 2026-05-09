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
  return `${STORAGE_KEY_PREFIX}${tournamentId}`;
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
 * Constrói o JSON compacto com OPÇÕES de degradação.
 *
 * - `rowsLimit`: corta o array a esse tamanho (default = MAX_PERSISTED_ROWS).
 * - `stripAppliedFixes`: substitui `applied_fixes` por `null` em cada linha
 *   (campo de tamanho variável e potencialmente grande — o maior offender).
 * - `dropCursor`: força `c=null`, sem cursor de retomada.
 *
 * O cache de serialização de linhas é reaproveitado APENAS no caminho
 * default (sem `stripAppliedFixes` e com `rowsLimit >= rows.length`).
 * Os caminhos de fallback são raros (perto da quota) e podem pagar o
 * custo extra sem prejuízo de performance no caminho quente.
 */
export interface BuildOptions {
  rowsLimit?: number;
  stripAppliedFixes?: boolean;
  dropCursor?: boolean;
}

export function buildCompactJson(
  state: Omit<PersistedState, "v" | "savedAt">,
  opts: BuildOptions = {},
): string {
  const limit = Math.max(0, opts.rowsLimit ?? MAX_PERSISTED_ROWS);
  const cappedRows = state.rows.length <= limit
    ? state.rows
    : state.rows.slice(0, limit);

  let rowsJson: string;
  if (limit === 0) {
    rowsJson = "[]";
  } else if (opts.stripAppliedFixes) {
    // Não usa cache: o output difere do canônico.
    rowsJson = JSON.stringify(
      cappedRows.map((r) => {
        const t = compactRow(r);
        t[6] = null; // applied_fixes
        return t;
      }),
    );
  } else {
    rowsJson = serializeRows(cappedRows);
  }

  const cursorJson = !opts.dropCursor && state.cursor
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


// ───── Migrações de schema ─────────────────────────────────────────────
//
// Cada migração leva um payload da versão N para a versão N+1, ou retorna
// `null` se o payload for irreparável. O loop em `migrateToCurrent` aplica
// as migrações em sequência até bater na `SCHEMA_VERSION`.
//
// Mantemos migrações ATIVAS aqui mesmo após a versão atual subir, para
// preservar progresso de usuários que ainda têm sessões antigas abertas.

type AnyPayload = Record<string, unknown> & { v?: unknown };
type Migration = (input: AnyPayload) => AnyPayload | null;

/**
 * v1 (verbose) → v2 (compacto).
 *
 * Formato v1:
 *   { v:1, tournament_id, source, scope, search, scrollY, cursor:{created_at,id}|null,
 *     rows:[{id, tournament_id, scanned, fixed, remaining, source, applied_fixes, created_at}],
 *     pageIndex, hasMore, savedAt }
 */
const MIGRATION_V1_TO_V2: Migration = (p) => {
  if (typeof p.tournament_id !== "string") return null;
  const rowsRaw = Array.isArray((p as { rows?: unknown }).rows) ? (p as { rows: unknown[] }).rows : [];
  const compactRows: unknown[] = [];
  for (const r of rowsRaw) {
    if (!r || typeof r !== "object") continue;
    const row = r as Record<string, unknown>;
    if (typeof row.id !== "string") continue;
    compactRows.push([
      row.id,
      Number(row.scanned) | 0,
      Number(row.fixed) | 0,
      Number(row.remaining) | 0,
      typeof row.source === "string" ? row.source : "manual",
      typeof row.created_at === "string" ? row.created_at : "",
      row.applied_fixes ?? null,
    ]);
  }
  const cursor =
    p.cursor && typeof p.cursor === "object"
      ? (p.cursor as { created_at?: unknown; id?: unknown })
      : null;
  return {
    v: 2,
    k: p.tournament_id,
    f: [
      typeof p.source === "string" ? p.source : "all",
      typeof p.scope === "string" ? p.scope : "tournament",
      typeof p.search === "string" ? p.search : "",
    ],
    y: typeof p.scrollY === "number" ? (p.scrollY as number) | 0 : 0,
    c:
      cursor && typeof cursor.created_at === "string" && typeof cursor.id === "string"
        ? [cursor.created_at, cursor.id]
        : null,
    p: typeof p.pageIndex === "number" ? p.pageIndex : 0,
    m: p.hasMore === true ? 1 : 0,
    a: typeof p.savedAt === "number" ? p.savedAt : Date.now(),
    r: compactRows,
  };
};

const MIGRATIONS: Record<number, Migration> = {
  1: MIGRATION_V1_TO_V2,
  // próximas: 2: MIGRATION_V2_TO_V3, ...
};

/** Sobe `payload` da versão dele até `SCHEMA_VERSION`. `null` = irreparável. */
function migrateToCurrent(payload: AnyPayload): AnyPayload | null {
  let cur: AnyPayload | null = payload;
  let safety = 16; // hard cap defensivo contra loops em registries quebrados
  while (cur && cur.v !== SCHEMA_VERSION) {
    if (typeof cur.v !== "number") return null;
    if (cur.v > SCHEMA_VERSION) return null; // versão FUTURA → não tentamos rebaixar
    const step = MIGRATIONS[cur.v];
    if (!step) return null;
    cur = step(cur);
    if (--safety <= 0) return null;
  }
  return cur;
}

/**
 * Lê o estado bruto do sessionStorage e expande para o formato canônico.
 * Se a entrada estiver em uma versão antiga, tenta migrar; se não puder,
 * REMOVE a chave (auto-clear) para evitar hidratar com dados incompatíveis
 * em chamadas futuras.
 */
export function readPersisted(tournamentId: string): RawPersisted {
  if (typeof sessionStorage === "undefined") return {};
  const key = storageKey(tournamentId);
  let raw: string | null = null;
  try {
    raw = sessionStorage.getItem(key);
  } catch { return {}; }
  if (!raw) return {};
  let parsed: AnyPayload | null = null;
  try {
    const j = JSON.parse(raw);
    if (j && typeof j === "object" && !Array.isArray(j)) parsed = j as AnyPayload;
  } catch { /* json corrompido */ }
  if (!parsed) {
    // JSON inválido → não conseguimos nem ler a versão; descarta.
    safeRemove(key);
    return {};
  }
  if (parsed.v !== SCHEMA_VERSION) {
    const migrated = migrateToCurrent(parsed);
    if (!migrated) {
      // Incompatível e sem caminho de migração → auto-clear.
      safeRemove(key);
      return {};
    }
    parsed = migrated;
    // Persiste a versão migrada para que próximas leituras sejam diretas.
    try { sessionStorage.setItem(key, JSON.stringify(parsed)); } catch { /* ignore */ }
  }
  return expandPayload(parsed as unknown as CompactPayload);
}

function safeRemove(key: string): void {
  try { sessionStorage.removeItem(key); } catch { /* ignore */ }
}

function expandPayload(p: CompactPayload): RawPersisted {
  if (p.v !== SCHEMA_VERSION) return {};
  const tournamentId = typeof p.k === "string" ? p.k : "";
  const filters = Array.isArray(p.f) ? p.f : [];
  const rowsRaw = Array.isArray(p.r) ? p.r : [];
  const rows = rowsRaw
    .map((t) => expandRow(t as CompactRow, tournamentId))
    .filter((x): x is PersistedRow => x !== null);
  const cursor = Array.isArray(p.c) && p.c.length === 2
    ? { created_at: String(p.c[0]), id: String(p.c[1]) }
    : null;
  return {
    v: p.v,
    tournament_id: tournamentId,
    source: (filters[0] as Source) ?? "all",
    scope: (filters[1] as Scope) ?? "tournament",
    search: typeof filters[2] === "string" ? (filters[2] as string) : "",
    scrollY: typeof p.y === "number" ? p.y : 0,
    cursor,
    rows,
    pageIndex: typeof p.p === "number" ? p.p : 0,
    hasMore: p.m === 1,
  };
}

/**
 * Varre TODAS as chaves `bug-audit:*` no sessionStorage e descarta entradas
 * incompatíveis (versão futura, JSON corrompido, ou sem caminho de migração).
 * Idempotente. Retorna o número de chaves removidas (útil para diagnóstico).
 */
export function sweepIncompatibleKeys(): number {
  if (typeof sessionStorage === "undefined") return 0;
  let removed = 0;
  const toRemove: string[] = [];
  try {
    for (let i = 0; i < sessionStorage.length; i++) {
      const k = sessionStorage.key(i);
      if (!k || !k.startsWith(STORAGE_KEY_PREFIX)) continue;
      let raw: string | null = null;
      try { raw = sessionStorage.getItem(k); } catch { toRemove.push(k); continue; }
      if (!raw) continue;
      let parsed: AnyPayload | null = null;
      try {
        const j = JSON.parse(raw);
        if (j && typeof j === "object" && !Array.isArray(j)) parsed = j as AnyPayload;
      } catch { /* json corrompido */ }
      if (!parsed) { toRemove.push(k); continue; }
      if (parsed.v === SCHEMA_VERSION) continue; // ok
      // Tenta migrar; se não puder, remove.
      const migrated = migrateToCurrent(parsed);
      if (!migrated) { toRemove.push(k); continue; }
      // Persiste versão migrada (não conta como remoção).
      try { sessionStorage.setItem(k, JSON.stringify(migrated)); } catch { /* ignore */ }
    }
  } catch { /* iteração falhou — best-effort */ }
  for (const k of toRemove) {
    safeRemove(k);
    removed++;
  }
  return removed;
}

// Sweep best-effort no carregamento do módulo. Idempotente — seguro chamar
// novamente em testes via __INTERNAL.
try { sweepIncompatibleKeys(); } catch { /* ignore */ }



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
  STORAGE_KEY_PREFIX,
  resetRowsCache,
  serializeRows,
  buildCompactJson,
  migrateToCurrent,
  MIGRATIONS,
};

