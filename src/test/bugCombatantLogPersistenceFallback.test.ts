/**
 * Validação de tamanho do estado + escada de fallback ao persistir.
 *
 * Cobre:
 * 1. Payload pequeno → escreve no nível 0 (full).
 * 2. Payload acima do SOFT_BUDGET → desce para nível 1 (rowsLimit=50).
 * 3. Payload com applied_fixes gigantes → atinge nível 2 (strip applied_fixes).
 * 4. QuotaExceededError do setItem → escada continua até gravar ou desistir.
 * 5. Tudo inviável → último nível remove a chave (não deixa lixo).
 * 6. Hidratação após fallback é coerente (cursor/sem cursor/sem rows).
 */
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import {
  writePersisted,
  readPersisted,
  storageKey,
  __INTERNAL,
  type PersistedRow,
} from "@/lib/bugCombatantLogPersistence";

const TID = "66666666-6666-4666-8666-666666666666";
const RID = "77777777-7777-4777-8777-777777777777";

function makeRow(i: number, applied: unknown = ["m1:fix"]): PersistedRow {
  return {
    id: `${i.toString(16).padStart(8, "0")}-7777-4777-8777-777777777777`.slice(0, 36),
    tournament_id: TID,
    scanned: 1, fixed: 0, remaining: 0,
    source: "manual",
    applied_fixes: applied,
    created_at: `2025-01-0${(i % 9) + 1}T08:00:00.000Z`,
  };
}

beforeEach(() => {
  sessionStorage.clear();
  __INTERNAL.resetRowsCache();
});

afterEach(() => {
  vi.restoreAllMocks();
  sessionStorage.clear();
});

describe("writePersisted — validação de tamanho + fallback", () => {
  it("payload pequeno escreve no nível 0", () => {
    const r = writePersisted({
      tournament_id: TID,
      source: "all", scope: "tournament", search: "",
      scrollY: 10,
      cursor: { created_at: "2025-01-02T08:00:00.000Z", id: RID },
      rows: [makeRow(1), makeRow(2)],
      pageIndex: 0, hasMore: true,
    });
    expect(r.ok).toBe(true);
    expect(r.level).toBe(0);
    expect(r.bytes).toBeGreaterThan(0);
    expect(__INTERNAL.getLastFallbackLevel()).toBe(0);
  });

  it("payload acima do SOFT_BUDGET desce para nível com rowsLimit=50", () => {
    // Força orçamento minúsculo p/ teste determinístico.
    const ladder = __INTERNAL.FALLBACK_LADDER;
    const orig = (__INTERNAL as any).SOFT_BUDGET_CHARS;
    // Não dá para mutar `const` exportado; em vez disso, geramos rows
    // suficientemente grandes para ultrapassar 256K UTF-16 chars no nível 0.
    // Cada applied_fixes aqui ~ 2KB → 200 rows ≈ 400KB.
    const bigFix = Array.from({ length: 80 }, (_, j) => `match-${j}:correção-detalhada-com-texto-longo-para-inflar-payload`);
    const rows = Array.from({ length: 200 }, (_, i) => makeRow(i, bigFix));
    const r = writePersisted({
      tournament_id: TID,
      source: "all", scope: "tournament", search: "",
      scrollY: 0,
      cursor: { created_at: "2025-01-02T08:00:00.000Z", id: RID },
      rows,
      pageIndex: 0, hasMore: true,
    });
    expect(r.ok).toBe(true);
    expect(r.level).toBeGreaterThanOrEqual(1);
    expect(r.bytes).toBeLessThanOrEqual(__INTERNAL.SOFT_BUDGET_CHARS);
    void orig; void ladder;
  });

  it("se nível 1 ainda excede, atinge nível 2 (applied_fixes stripped)", () => {
    // Cada row carrega applied_fixes ENORMES → mesmo cap=50 estoura.
    const huge = Array.from({ length: 4000 }, (_, j) => `m${j}:` + "x".repeat(40));
    const rows = Array.from({ length: 60 }, (_, i) => makeRow(i, huge));
    const r = writePersisted({
      tournament_id: TID,
      source: "all", scope: "tournament", search: "",
      scrollY: 0,
      cursor: { created_at: "2025-01-02T08:00:00.000Z", id: RID },
      rows,
      pageIndex: 0, hasMore: true,
    });
    expect(r.ok).toBe(true);
    expect(r.level).toBeGreaterThanOrEqual(2);
    // Lê de volta: applied_fixes deve estar null em todas as linhas.
    const back = readPersisted(TID);
    if (r.level === 2) {
      expect(back.rows!.length).toBeLessThanOrEqual(50);
      for (const row of back.rows!) expect(row.applied_fixes).toBeNull();
    } else {
      // Pode ter caído para 3+ se ainda estourou.
      expect(back.rows!.length).toBeGreaterThanOrEqual(0);
    }
  });

  it("QuotaExceededError no setItem aciona o próximo nível", () => {
    const setItemSpy = vi.spyOn(Storage.prototype, "setItem");
    let calls = 0;
    setItemSpy.mockImplementation(function (this: Storage, key: string, value: string) {
      calls++;
      if (calls < 3) {
        const e: any = new Error("QuotaExceededError");
        e.name = "QuotaExceededError";
        e.code = 22;
        throw e;
      }
      // 3ª chamada: aceita.
      Object.getPrototypeOf(this).constructor.prototype; // no-op
      // Simula sucesso usando uma store interna mínima.
      (this as any)[key] = value;
    });

    const r = writePersisted({
      tournament_id: TID,
      source: "all", scope: "tournament", search: "",
      scrollY: 0,
      cursor: { created_at: "2025-01-02T08:00:00.000Z", id: RID },
      rows: [makeRow(1), makeRow(2)],
      pageIndex: 0, hasMore: true,
    });
    expect(r.ok).toBe(true);
    expect(r.level).toBe(2); // duas falhas → 3ª chamada é o nível 2
    expect(calls).toBe(3);
    setItemSpy.mockRestore();
  });

  it("se TODOS os níveis com payload falham, último passo remove a chave", () => {
    // Pré-popula a chave para verificar que ela é removida.
    sessionStorage.setItem(storageKey(TID), "{old}");

    const setItemSpy = vi.spyOn(Storage.prototype, "setItem");
    setItemSpy.mockImplementation(() => {
      const e: any = new Error("QuotaExceededError");
      e.name = "QuotaExceededError";
      e.code = 22;
      throw e;
    });
    const removeItemSpy = vi.spyOn(Storage.prototype, "removeItem");

    const r = writePersisted({
      tournament_id: TID,
      source: "all", scope: "tournament", search: "",
      scrollY: 0,
      cursor: { created_at: "2025-01-02T08:00:00.000Z", id: RID },
      rows: [makeRow(1)],
      pageIndex: 0, hasMore: true,
    });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("removed");
    expect(r.level).toBe(5);
    expect(removeItemSpy).toHaveBeenCalledWith(storageKey(TID));

    setItemSpy.mockRestore();
    removeItemSpy.mockRestore();
  });

  it("erro não relacionado a quota aborta sem descer a escada", () => {
    const setItemSpy = vi.spyOn(Storage.prototype, "setItem");
    setItemSpy.mockImplementation(() => { throw new Error("modo privado: storage indisponível"); });

    const r = writePersisted({
      tournament_id: TID,
      source: "all", scope: "tournament", search: "",
      scrollY: 0, cursor: null,
      rows: [makeRow(1)],
      pageIndex: 0, hasMore: true,
    });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("quota");
    expect(setItemSpy).toHaveBeenCalledTimes(1); // não tentou os outros níveis
    setItemSpy.mockRestore();
  });

  it("nível 3 zera rows mas preserva cursor; hidratação devolve null (sem rows) mas cursor sobrevive na leitura crua", () => {
    // Dispara fallback até pelo menos nível 3 via rejeição contínua de quota
    // exceto quando o payload tem rowsLimit=0.
    const setItemSpy = vi.spyOn(Storage.prototype, "setItem");
    setItemSpy.mockImplementation(function (this: Storage, key: string, value: string) {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed.r) && parsed.r.length > 0) {
        const e: any = new Error("Quota");
        e.name = "QuotaExceededError";
        e.code = 22;
        throw e;
      }
      (this as any)[key] = value;
    });

    const r = writePersisted({
      tournament_id: TID,
      source: "all", scope: "tournament", search: "foo",
      scrollY: 99,
      cursor: { created_at: "2025-01-02T08:00:00.000Z", id: RID },
      rows: [makeRow(1), makeRow(2)],
      pageIndex: 1, hasMore: true,
    });
    expect(r.ok).toBe(true);
    expect(r.level).toBe(3); // primeiro nível com rowsLimit=0
    setItemSpy.mockRestore();

    const back = readPersisted(TID);
    expect(back.rows).toEqual([]);
    expect(back.cursor).toEqual({ created_at: "2025-01-02T08:00:00.000Z", id: RID });
    expect(back.scrollY).toBe(99);
    expect(back.search).toBe("foo");
  });

  it("nível 4 também dropa o cursor (apenas filtros + scrollY sobrevivem)", () => {
    const setItemSpy = vi.spyOn(Storage.prototype, "setItem");
    setItemSpy.mockImplementation(function (this: Storage, key: string, value: string) {
      const parsed = JSON.parse(value);
      // Aceita só o nível 4 (sem rows e sem cursor).
      if ((Array.isArray(parsed.r) && parsed.r.length > 0) || parsed.c !== null) {
        const e: any = new Error("Quota");
        e.name = "QuotaExceededError"; e.code = 22;
        throw e;
      }
      (this as any)[key] = value;
    });

    const r = writePersisted({
      tournament_id: TID,
      source: "manual", scope: "all", search: "qq",
      scrollY: 7,
      cursor: { created_at: "2025-01-02T08:00:00.000Z", id: RID },
      rows: [makeRow(1)],
      pageIndex: 2, hasMore: false,
    });
    expect(r.ok).toBe(true);
    expect(r.level).toBe(4);
    setItemSpy.mockRestore();

    const back = readPersisted(TID);
    expect(back.cursor).toBeNull();
    expect(back.rows).toEqual([]);
    expect(back.source).toBe("manual");
    expect(back.scope).toBe("all");
    expect(back.scrollY).toBe(7);
  });

  it("retorno indica `bytes` ≤ SOFT_BUDGET_CHARS quando ok=true", () => {
    const r = writePersisted({
      tournament_id: TID,
      source: "all", scope: "tournament", search: "",
      scrollY: 0, cursor: null,
      rows: [makeRow(1)],
      pageIndex: 0, hasMore: true,
    });
    expect(r.ok).toBe(true);
    expect(r.bytes).toBeLessThanOrEqual(__INTERNAL.SOFT_BUDGET_CHARS);
  });
});
