// Testes de COMPACTAÇÃO/NORMALIZAÇÃO do payload persistido.
//
// Garantem:
// 1. O payload escrito é o formato compacto v2 (chaves curtas + tuplas).
// 2. Round-trip: write → read recompõe o estado canônico.
// 3. Cache de serialização: rolar (mudar apenas scrollY) NÃO re-stringifica
//    o array de linhas (verificado por contagem de chamadas).
// 4. Versões antigas (v1) são descartadas silenciosamente.
// 5. Sanitização: scrollY é forçado a inteiro; tournament_id por linha é
//    sempre o do payload (não confia em valor por linha).

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  writePersisted,
  readPersisted,
  storageKey,
  __INTERNAL,
  type PersistedRow,
} from "@/lib/bugCombatantLogPersistence";

const TID = "11111111-1111-4111-8111-111111111111";
const RID = "22222222-2222-4222-8222-222222222222";

function makeRow(i: number, applied: unknown = ["m1:fix"]): PersistedRow {
  return {
    id: `${i}-${RID}`.slice(0, 36),
    tournament_id: TID,
    scanned: 10 + i,
    fixed: i,
    remaining: 0,
    source: i % 2 === 0 ? "cron" : "manual",
    applied_fixes: applied,
    created_at: `2025-01-0${(i % 9) + 1}T08:00:00.000Z`,
  };
}

beforeEach(() => {
  sessionStorage.clear();
  __INTERNAL.resetRowsCache();
});

describe("compactação do payload (v2)", () => {
  it("escreve o formato compacto com chaves curtas e linhas como tuplas", () => {
    const rows = [makeRow(1), makeRow(2)];
    writePersisted({
      tournament_id: TID,
      source: "all",
      scope: "tournament",
      search: "abc",
      scrollY: 123.7,
      cursor: { created_at: "2025-01-02T08:00:00.000Z", id: RID },
      rows,
      pageIndex: 1,
      hasMore: true,
    });

    const raw = sessionStorage.getItem(storageKey(TID));
    expect(raw).toBeTruthy();
    const parsed = JSON.parse(raw!);

    expect(parsed.v).toBe(__INTERNAL.SCHEMA_VERSION);
    expect(parsed.k).toBe(TID);
    expect(parsed.f).toEqual(["all", "tournament", "abc"]);
    expect(parsed.y).toBe(123); // forçado a inteiro
    expect(parsed.c).toEqual(["2025-01-02T08:00:00.000Z", RID]);
    expect(parsed.p).toBe(1);
    expect(parsed.m).toBe(1);
    expect(typeof parsed.a).toBe("number");
    expect(Array.isArray(parsed.r)).toBe(true);
    expect(parsed.r).toHaveLength(2);
    // Tupla posicional, sem repetir tournament_id por linha.
    const t0 = parsed.r[0];
    expect(t0).toHaveLength(7);
    expect(t0[0]).toBe(rows[0].id);
    expect(t0[1]).toBe(rows[0].scanned);
    expect(t0[5]).toBe(rows[0].created_at);
    // Garante que não há a chave verbose "tournament_id" na linha.
    expect(typeof t0).toBe("object");
    expect((t0 as unknown as Record<string, unknown>).tournament_id).toBeUndefined();
  });

  it("é menor que o equivalente em formato verbose", () => {
    const rows = Array.from({ length: 50 }, (_, i) => makeRow(i));
    writePersisted({
      tournament_id: TID,
      source: "all",
      scope: "tournament",
      search: "",
      scrollY: 0,
      cursor: null,
      rows,
      pageIndex: 0,
      hasMore: true,
    });
    const compactSize = sessionStorage.getItem(storageKey(TID))!.length;
    const verbose = JSON.stringify({ v: 2, tournament_id: TID, rows });
    expect(compactSize).toBeLessThan(verbose.length);
  });

  it("round-trip: write → read recompõe o estado canônico", () => {
    const rows = [makeRow(1), makeRow(2, null)];
    writePersisted({
      tournament_id: TID,
      source: "manual",
      scope: "all",
      search: "foo",
      scrollY: 480,
      cursor: { created_at: "2025-01-02T08:00:00.000Z", id: RID },
      rows,
      pageIndex: 2,
      hasMore: false,
    });

    const out = readPersisted(TID);
    expect(out.v).toBe(__INTERNAL.SCHEMA_VERSION);
    expect(out.tournament_id).toBe(TID);
    expect(out.source).toBe("manual");
    expect(out.scope).toBe("all");
    expect(out.search).toBe("foo");
    expect(out.scrollY).toBe(480);
    expect(out.cursor).toEqual({ created_at: "2025-01-02T08:00:00.000Z", id: RID });
    expect(out.pageIndex).toBe(2);
    expect(out.hasMore).toBe(false);
    expect(out.rows).toHaveLength(2);
    expect(out.rows![0]).toMatchObject({
      id: rows[0].id,
      tournament_id: TID,
      scanned: rows[0].scanned,
      fixed: rows[0].fixed,
      source: rows[0].source,
      created_at: rows[0].created_at,
    });
    expect(out.rows![0].applied_fixes).toEqual(["m1:fix"]);
    expect(out.rows![1].applied_fixes).toBeNull();
  });

  it("cache: rolagem (mesma referência de rows) reaproveita serializeRows", () => {
    const rows = Array.from({ length: 30 }, (_, i) => makeRow(i));
    const spy = vi.spyOn(JSON, "stringify");

    const base = {
      tournament_id: TID,
      source: "all" as const,
      scope: "tournament" as const,
      search: "",
      cursor: null,
      pageIndex: 0,
      hasMore: true,
      rows,
    };

    // 1ª escrita: serializa as linhas (1 stringify do array compacto).
    writePersisted({ ...base, scrollY: 0 });
    const callsAfterFirst = spy.mock.calls.filter((c) => Array.isArray(c[0])).length;
    expect(callsAfterFirst).toBeGreaterThanOrEqual(1);

    // Simula 60 frames de rolagem (mesma referência de rows, scrollY varia).
    for (let i = 1; i <= 60; i++) {
      writePersisted({ ...base, scrollY: i * 17 });
    }

    // Não deve haver MAIS stringify do array de linhas após a 1ª chamada.
    const callsAfterScroll = spy.mock.calls.filter((c) => Array.isArray(c[0])).length;
    expect(callsAfterScroll).toBe(callsAfterFirst);

    spy.mockRestore();

    // O scrollY mais recente foi persistido corretamente.
    const out = readPersisted(TID);
    expect(out.scrollY).toBe(60 * 17);
  });

  it("cache invalida quando a referência de rows muda", () => {
    const rowsA = [makeRow(1)];
    writePersisted({
      tournament_id: TID,
      source: "all",
      scope: "tournament",
      search: "",
      scrollY: 0,
      cursor: null,
      rows: rowsA,
      pageIndex: 0,
      hasMore: true,
    });

    const rowsB = [makeRow(1), makeRow(2)];
    const spy = vi.spyOn(JSON, "stringify");
    writePersisted({
      tournament_id: TID,
      source: "all",
      scope: "tournament",
      search: "",
      scrollY: 0,
      cursor: null,
      rows: rowsB, // nova referência
      pageIndex: 0,
      hasMore: true,
    });
    // Nova referência → re-serializa as linhas pelo menos 1 vez.
    const arrayCalls = spy.mock.calls.filter((c) => Array.isArray(c[0])).length;
    expect(arrayCalls).toBeGreaterThanOrEqual(1);
    spy.mockRestore();

    const out = readPersisted(TID);
    expect(out.rows).toHaveLength(2);
  });

  it("descarta silenciosamente payloads de versão antiga (v1)", () => {
    sessionStorage.setItem(
      storageKey(TID),
      JSON.stringify({
        v: 1,
        tournament_id: TID,
        source: "all",
        scope: "tournament",
        rows: [makeRow(1)],
      }),
    );
    const out = readPersisted(TID);
    expect(out).toEqual({});
  });

  it("aplica cap de MAX_PERSISTED_ROWS na escrita", () => {
    const rows = Array.from({ length: __INTERNAL.MAX_PERSISTED_ROWS + 50 }, (_, i) => makeRow(i));
    writePersisted({
      tournament_id: TID,
      source: "all",
      scope: "tournament",
      search: "",
      scrollY: 0,
      cursor: null,
      rows,
      pageIndex: 0,
      hasMore: true,
    });
    const out = readPersisted(TID);
    expect(out.rows!.length).toBe(__INTERNAL.MAX_PERSISTED_ROWS);
  });

  it("ignora tournament_id repetido por linha (usa sempre o do payload)", () => {
    const rows = [{ ...makeRow(1), tournament_id: "outro-torneio-falsificado" }];
    writePersisted({
      tournament_id: TID,
      source: "all",
      scope: "tournament",
      search: "",
      scrollY: 0,
      cursor: null,
      rows,
      pageIndex: 0,
      hasMore: true,
    });
    const out = readPersisted(TID);
    expect(out.rows![0].tournament_id).toBe(TID);
  });
});
