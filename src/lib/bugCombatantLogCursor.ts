// Cursor padronizado para paginação keyset de bug_combatant_log.
// Formato canônico: { created_at: ISO-8601 UTC string, id: UUID v4 lowercase }.
//
// Por que validar?
// - O cursor é interpolado em filtros PostgREST `.or(...)`. Caracteres como
//   vírgula, parênteses ou aspas quebram a expressão. Validamos o formato
//   antes de qualquer requisição.
// - O cursor de paginação NÃO deve mudar quando o realtime injeta linhas
//   novas no topo da lista. Mantemos uma referência estável baseada apenas
//   no que veio do servidor.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface KeysetCursor {
  created_at: string; // ISO-8601 UTC: 2025-01-02T03:04:05.678Z
  id: string;         // UUID lowercase
}

export interface CursorCandidate {
  created_at?: unknown;
  id?: unknown;
}

export class CursorFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CursorFormatError";
  }
}

/** Normaliza um timestamp para ISO-8601 UTC. Retorna null se inválido. */
export function normalizeTimestamp(value: unknown): string | null {
  if (typeof value !== "string" && !(value instanceof Date)) return null;
  const d = value instanceof Date ? value : new Date(value);
  const t = d.getTime();
  if (!Number.isFinite(t)) return null;
  return d.toISOString();
}

/** Normaliza um id de partida (UUID). Retorna null se inválido. */
export function normalizeId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const v = value.trim().toLowerCase();
  return UUID_RE.test(v) ? v : null;
}

/** Tenta construir um cursor canônico a partir de uma linha qualquer. */
export function toCursor(candidate: CursorCandidate | null | undefined): KeysetCursor | null {
  if (!candidate) return null;
  const created_at = normalizeTimestamp(candidate.created_at);
  const id = normalizeId(candidate.id);
  if (!created_at || !id) return null;
  return { created_at, id };
}

/** Lança se o cursor não bate o formato canônico. Use antes de interpolar. */
export function assertCursor(cursor: KeysetCursor): void {
  if (!cursor || typeof cursor !== "object") {
    throw new CursorFormatError("cursor: objeto ausente");
  }
  if (normalizeTimestamp(cursor.created_at) !== cursor.created_at) {
    throw new CursorFormatError(`cursor.created_at inválido: ${String(cursor.created_at)}`);
  }
  if (normalizeId(cursor.id) !== cursor.id) {
    throw new CursorFormatError(`cursor.id inválido: ${String(cursor.id)}`);
  }
}

/**
 * Serializa o cursor como expressão para `.or(...)` do PostgREST,
 * representando `(created_at, id) < (cursor.created_at, cursor.id)` em ordem desc.
 *
 * Bordas tratadas:
 * - Valida o cursor antes de serializar (evita injeção em `or()`).
 * - Garante ISO-8601 sem caracteres que quebrem o filtro.
 */
export function cursorToOrFilter(cursor: KeysetCursor): string {
  assertCursor(cursor);
  return `created_at.lt.${cursor.created_at},and(created_at.eq.${cursor.created_at},id.lt.${cursor.id})`;
}

/**
 * Calcula o próximo cursor a partir da última página vinda do servidor.
 *
 * Regras:
 * - Se a página estiver vazia, retorna o cursor anterior (não há para onde avançar).
 * - Caso contrário, usa a ÚLTIMA linha (pelo critério desc) — não a primeira da resposta —
 *   para sermos resilientes a respostas desordenadas.
 * - Se o cursor anterior for "menor" (em ordem desc) que a última linha, mantemos o
 *   anterior — evita "voltar" no tempo se uma resposta inconsistente chegar.
 */
export function nextCursorFromPage<T extends CursorCandidate>(
  page: T[],
  previous: KeysetCursor | null,
): KeysetCursor | null {
  if (!Array.isArray(page) || page.length === 0) return previous;
  let candidate: KeysetCursor | null = null;
  for (const row of page) {
    const c = toCursor(row);
    if (!c) continue;
    if (!candidate || compareDesc(c, candidate) > 0) candidate = c;
    // queremos a MAIS ANTIGA (último na ordenação desc) para avançar; inverte:
  }
  // Achar a mais antiga (mínima em ordem desc -> máxima na invertida).
  // Reescreve de forma explícita para evitar confusão:
  candidate = null;
  for (const row of page) {
    const c = toCursor(row);
    if (!c) continue;
    if (!candidate || compareDesc(c, candidate) < 0) candidate = c;
  }
  if (!candidate) return previous;
  if (previous && compareDesc(candidate, previous) >= 0) {
    // candidate não é estritamente mais antigo que previous — não avançar.
    return previous;
  }
  return candidate;
}

/**
 * Compara dois cursors em ordem (created_at desc, id desc).
 * Retorna >0 se `a` vem antes de `b`, <0 se depois, 0 se iguais.
 */
export function compareDesc(a: KeysetCursor, b: KeysetCursor): number {
  if (a.created_at !== b.created_at) return a.created_at > b.created_at ? 1 : -1;
  if (a.id !== b.id) return a.id > b.id ? 1 : -1;
  return 0;
}
