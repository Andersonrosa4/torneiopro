/**
 * Versionamento e migração do schema do sessionStorage.
 *
 * Cobre:
 * 1. Migração v1 → v(atual): preserva tournament_id, filtros, cursor, rows.
 * 2. Auto-clear quando NÃO há caminho de migração (versão futura/desconhecida).
 * 3. Auto-clear quando JSON está corrompido.
 * 4. `sweepIncompatibleKeys` remove apenas chaves `bug-audit:*` incompatíveis,
 *    preserva chaves alheias e atualiza chaves migráveis para a versão atual.
 * 5. `getHydratableState` funciona após migração (não devolve `null` por v).
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  readPersisted,
  storageKey,
  sweepIncompatibleKeys,
  getHydratableState,
  __INTERNAL,
} from "@/lib/bugCombatantLogPersistence";

const TID = "33333333-3333-4333-8333-333333333333";
const TID2 = "44444444-4444-4444-8444-444444444444";
const RID = "55555555-5555-4555-8555-555555555555";

const CURRENT = __INTERNAL.SCHEMA_VERSION;

beforeEach(() => {
  sessionStorage.clear();
  __INTERNAL.resetRowsCache();
});

function v1Payload(tid: string) {
  return {
    v: 1,
    tournament_id: tid,
    source: "manual",
    scope: "tournament",
    search: "abc",
    scrollY: 321,
    cursor: { created_at: "2025-01-02T08:00:00.000Z", id: RID },
    rows: [
      {
        id: RID,
        tournament_id: tid,
        scanned: 7,
        fixed: 2,
        remaining: 1,
        source: "manual",
        applied_fixes: ["m1:fix"],
        created_at: "2025-01-02T08:00:00.000Z",
      },
    ],
    pageIndex: 3,
    hasMore: true,
    savedAt: 1000,
  };
}

describe("schema versioning + migração", () => {
  it("migra v1 → v(atual) preservando dados ao ler", () => {
    sessionStorage.setItem(storageKey(TID), JSON.stringify(v1Payload(TID)));
    const out = readPersisted(TID);
    expect(out.v).toBe(CURRENT);
    expect(out.tournament_id).toBe(TID);
    expect(out.source).toBe("manual");
    expect(out.search).toBe("abc");
    expect(out.scrollY).toBe(321);
    expect(out.pageIndex).toBe(3);
    expect(out.hasMore).toBe(true);
    expect(out.cursor).toEqual({ created_at: "2025-01-02T08:00:00.000Z", id: RID });
    expect(out.rows).toHaveLength(1);
    expect(out.rows![0].id).toBe(RID);
    expect(out.rows![0].applied_fixes).toEqual(["m1:fix"]);
  });

  it("hidratação funciona após migração v1 → atual", () => {
    sessionStorage.setItem(storageKey(TID), JSON.stringify(v1Payload(TID)));
    const hydratable = getHydratableState(TID, "manual", "tournament");
    expect(hydratable).not.toBeNull();
    expect(hydratable!.cursor).toEqual({ created_at: "2025-01-02T08:00:00.000Z", id: RID });
    expect(hydratable!.pageIndex).toBe(3);
  });

  it("após ler v1, a entrada é re-escrita no formato atual (próxima leitura é direta)", () => {
    sessionStorage.setItem(storageKey(TID), JSON.stringify(v1Payload(TID)));
    readPersisted(TID); // dispara migração + write
    const reread = JSON.parse(sessionStorage.getItem(storageKey(TID))!);
    expect(reread.v).toBe(CURRENT);
    // Forma compacta: tem `k` (tournament_id) e `r` (rows como tuplas).
    expect(reread.k).toBe(TID);
    expect(Array.isArray(reread.r)).toBe(true);
  });

  it("auto-clear: versão FUTURA desconhecida → remove a chave", () => {
    sessionStorage.setItem(
      storageKey(TID),
      JSON.stringify({ v: CURRENT + 5, k: TID, f: ["all", "tournament", ""], r: [] }),
    );
    const out = readPersisted(TID);
    expect(out).toEqual({});
    expect(sessionStorage.getItem(storageKey(TID))).toBeNull();
  });

  it("auto-clear: versão antiga SEM migração registrada → remove a chave", () => {
    // Versão 0 não tem migração 0→1 — irreparável.
    sessionStorage.setItem(
      storageKey(TID),
      JSON.stringify({ v: 0, tournament_id: TID, rows: [] }),
    );
    const out = readPersisted(TID);
    expect(out).toEqual({});
    expect(sessionStorage.getItem(storageKey(TID))).toBeNull();
  });

  it("auto-clear: JSON corrompido → remove a chave", () => {
    sessionStorage.setItem(storageKey(TID), "{not valid json");
    const out = readPersisted(TID);
    expect(out).toEqual({});
    expect(sessionStorage.getItem(storageKey(TID))).toBeNull();
  });

  it("auto-clear: payload sem `v` → remove a chave", () => {
    sessionStorage.setItem(storageKey(TID), JSON.stringify({ tournament_id: TID, rows: [] }));
    const out = readPersisted(TID);
    expect(out).toEqual({});
    expect(sessionStorage.getItem(storageKey(TID))).toBeNull();
  });

  it("sweepIncompatibleKeys remove só chaves bug-audit:* incompatíveis", () => {
    // 1) chave alheia — não deve ser tocada
    sessionStorage.setItem("outra-app:state", JSON.stringify({ foo: "bar" }));
    // 2) chave bug-audit válida (versão atual) — preservada
    sessionStorage.setItem(
      storageKey(TID),
      JSON.stringify({
        v: CURRENT,
        k: TID,
        f: ["all", "tournament", ""],
        y: 0,
        c: null,
        p: 0,
        m: 0,
        a: 0,
        r: [],
      }),
    );
    // 3) chave bug-audit migrável (v1) — sobrevive, mas reescrita
    sessionStorage.setItem(storageKey(TID2), JSON.stringify(v1Payload(TID2)));
    // 4) chave bug-audit irreparável — removida
    const badKey = `${__INTERNAL.STORAGE_KEY_PREFIX}corrupted`;
    sessionStorage.setItem(badKey, "::not json::");
    // 5) chave bug-audit com versão futura — removida
    const futureKey = `${__INTERNAL.STORAGE_KEY_PREFIX}future`;
    sessionStorage.setItem(futureKey, JSON.stringify({ v: 999 }));

    const removed = sweepIncompatibleKeys();
    expect(removed).toBe(2);

    expect(sessionStorage.getItem("outra-app:state")).not.toBeNull();
    expect(sessionStorage.getItem(storageKey(TID))).not.toBeNull();
    expect(sessionStorage.getItem(storageKey(TID2))).not.toBeNull();
    // A migrável agora está no schema atual.
    const migrated = JSON.parse(sessionStorage.getItem(storageKey(TID2))!);
    expect(migrated.v).toBe(CURRENT);
    expect(sessionStorage.getItem(badKey)).toBeNull();
    expect(sessionStorage.getItem(futureKey)).toBeNull();
  });

  it("sweepIncompatibleKeys é idempotente", () => {
    sessionStorage.setItem(storageKey(TID), JSON.stringify(v1Payload(TID)));
    expect(sweepIncompatibleKeys()).toBe(0); // migrou em vez de remover
    expect(sweepIncompatibleKeys()).toBe(0); // já está atual
    expect(sessionStorage.getItem(storageKey(TID))).not.toBeNull();
  });

  it("migrateToCurrent retorna null para versão futura", () => {
    expect(__INTERNAL.migrateToCurrent({ v: CURRENT + 1, k: TID })).toBeNull();
  });

  it("migrateToCurrent é no-op quando já está na versão atual", () => {
    const p = { v: CURRENT, k: TID, f: ["all", "tournament", ""], y: 0, c: null, p: 0, m: 0, a: 0, r: [] };
    const out = __INTERNAL.migrateToCurrent({ ...p });
    expect(out).toEqual(p);
  });
});
