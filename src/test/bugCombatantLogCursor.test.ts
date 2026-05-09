import { describe, it, expect } from "vitest";
import {
  CursorFormatError,
  assertCursor,
  compareDesc,
  cursorToOrFilter,
  nextCursorFromPage,
  normalizeId,
  normalizeTimestamp,
  toCursor,
  type KeysetCursor,
} from "@/lib/bugCombatantLogCursor";

const UUID_A = "11111111-1111-4111-8111-111111111111";
const UUID_B = "22222222-2222-4222-8222-222222222222";
const UUID_C = "33333333-3333-4333-8333-333333333333";

describe("bugCombatantLogCursor", () => {
  describe("normalizeTimestamp", () => {
    it("aceita ISO-8601 e converte para UTC canônico", () => {
      expect(normalizeTimestamp("2025-01-02T03:04:05Z")).toBe("2025-01-02T03:04:05.000Z");
      expect(normalizeTimestamp("2025-01-02T03:04:05+00:00")).toBe("2025-01-02T03:04:05.000Z");
    });
    it("aceita Date", () => {
      expect(normalizeTimestamp(new Date("2025-01-02T00:00:00Z"))).toBe(
        "2025-01-02T00:00:00.000Z",
      );
    });
    it("rejeita lixo", () => {
      expect(normalizeTimestamp("não-data")).toBeNull();
      expect(normalizeTimestamp(null)).toBeNull();
      expect(normalizeTimestamp(undefined)).toBeNull();
      expect(normalizeTimestamp(123)).toBeNull();
    });
  });

  describe("normalizeId", () => {
    it("aceita UUID em qualquer caixa, normaliza p/ minúsculo", () => {
      expect(normalizeId(UUID_A.toUpperCase())).toBe(UUID_A);
    });
    it("rejeita não-UUID", () => {
      expect(normalizeId("abc")).toBeNull();
      expect(normalizeId("' OR 1=1 --")).toBeNull();
      expect(normalizeId(null)).toBeNull();
      expect(normalizeId(123)).toBeNull();
    });
  });

  describe("toCursor / assertCursor", () => {
    it("constrói cursor canônico", () => {
      const c = toCursor({ created_at: "2025-01-02T03:04:05Z", id: UUID_A });
      expect(c).toEqual({ created_at: "2025-01-02T03:04:05.000Z", id: UUID_A });
    });
    it("retorna null para entrada inválida", () => {
      expect(toCursor({ created_at: "x", id: UUID_A })).toBeNull();
      expect(toCursor({ created_at: "2025-01-02T00:00:00Z", id: "not-uuid" })).toBeNull();
      expect(toCursor(null)).toBeNull();
      expect(toCursor(undefined)).toBeNull();
    });
    it("assertCursor lança em formato fora do canônico", () => {
      expect(() =>
        assertCursor({ created_at: "2025-01-02T00:00:00Z", id: UUID_A } as KeysetCursor),
      ).toThrow(CursorFormatError);
      expect(() =>
        assertCursor({ created_at: "2025-01-02T00:00:00.000Z", id: "X" } as KeysetCursor),
      ).toThrow(CursorFormatError);
    });
  });

  describe("cursorToOrFilter", () => {
    it("gera expressão keyset segura", () => {
      const c = toCursor({ created_at: "2025-01-02T03:04:05Z", id: UUID_A })!;
      expect(cursorToOrFilter(c)).toBe(
        `created_at.lt.2025-01-02T03:04:05.000Z,and(created_at.eq.2025-01-02T03:04:05.000Z,id.lt.${UUID_A})`,
      );
    });
    it("recusa cursor com caracteres perigosos antes de interpolar", () => {
      const evil = { created_at: "2025-01-02), evil(", id: UUID_A } as KeysetCursor;
      expect(() => cursorToOrFilter(evil)).toThrow(CursorFormatError);
    });
  });

  describe("compareDesc", () => {
    it("ordena por created_at desc, id desc", () => {
      const older = toCursor({ created_at: "2025-01-01T00:00:00Z", id: UUID_A })!;
      const newer = toCursor({ created_at: "2025-01-02T00:00:00Z", id: UUID_A })!;
      expect(compareDesc(newer, older)).toBeGreaterThan(0);
      expect(compareDesc(older, newer)).toBeLessThan(0);
      expect(compareDesc(newer, newer)).toBe(0);
    });
    it("desempata por id quando created_at empata", () => {
      const a = toCursor({ created_at: "2025-01-02T00:00:00Z", id: UUID_A })!;
      const b = toCursor({ created_at: "2025-01-02T00:00:00Z", id: UUID_B })!;
      expect(compareDesc(b, a)).toBeGreaterThan(0);
    });
  });

  describe("nextCursorFromPage", () => {
    const r = (id: string, ts: string) => ({ id, created_at: ts });

    it("retorna o cursor anterior quando a página está vazia", () => {
      const prev = toCursor({ created_at: "2025-01-02T00:00:00Z", id: UUID_A })!;
      expect(nextCursorFromPage([], prev)).toBe(prev);
      expect(nextCursorFromPage([], null)).toBeNull();
    });

    it("avança para a linha mais antiga (último na ordem desc), independentemente da ordem da resposta", () => {
      const page = [
        r(UUID_A, "2025-01-03T00:00:00Z"),
        r(UUID_C, "2025-01-01T00:00:00Z"), // mais antiga
        r(UUID_B, "2025-01-02T00:00:00Z"),
      ];
      const next = nextCursorFromPage(page, null);
      expect(next).toEqual({ created_at: "2025-01-01T00:00:00.000Z", id: UUID_C });
    });

    it("não retrocede se a página vier inconsistente (mais nova que o cursor anterior)", () => {
      const prev = toCursor({ created_at: "2025-01-01T00:00:00Z", id: UUID_C })!;
      // Página retorna apenas linhas mais novas que prev — não devemos voltar.
      const page = [r(UUID_A, "2025-01-05T00:00:00Z"), r(UUID_B, "2025-01-04T00:00:00Z")];
      const next = nextCursorFromPage(page, prev);
      expect(next).toBe(prev);
    });

    it("ignora linhas inválidas dentro da página", () => {
      const page = [
        r("not-uuid", "2025-01-01T00:00:00Z"),
        r(UUID_B, "data-ruim"),
        r(UUID_A, "2025-01-02T00:00:00Z"),
      ];
      const next = nextCursorFromPage(page, null);
      expect(next).toEqual({ created_at: "2025-01-02T00:00:00.000Z", id: UUID_A });
    });
  });

  describe("borda: novas linhas chegam entre loadMore", () => {
    it("o cursor estável só avança com respostas do servidor — INSERTs no topo não deslocam", () => {
      // Página 1 do servidor (3 linhas mais novas → mais antigas)
      const page1 = [
        { id: UUID_A, created_at: "2025-01-10T00:00:00Z" },
        { id: UUID_B, created_at: "2025-01-09T00:00:00Z" },
        { id: UUID_C, created_at: "2025-01-08T00:00:00Z" },
      ];
      let cursor = nextCursorFromPage(page1, null);
      expect(cursor).toEqual({ created_at: "2025-01-08T00:00:00.000Z", id: UUID_C });

      // Realtime injeta linhas novas no topo da lista (NÃO mexe no cursor).
      // Próximo loadMore continua de C, sem pular nem repetir.
      const filter = cursorToOrFilter(cursor!);
      expect(filter).toContain("created_at.lt.2025-01-08T00:00:00.000Z");
      expect(filter).toContain(`id.lt.${UUID_C}`);

      // Página 2 (mais antigas que C) — cursor deve avançar para a mais antiga.
      const page2 = [
        { id: UUID_B, created_at: "2025-01-07T00:00:00Z" },
        { id: UUID_A, created_at: "2025-01-06T00:00:00Z" },
      ];
      cursor = nextCursorFromPage(page2, cursor);
      expect(cursor).toEqual({ created_at: "2025-01-06T00:00:00.000Z", id: UUID_A });

      // Página 3 vazia — não retrocede.
      const page3: typeof page2 = [];
      const final = nextCursorFromPage(page3, cursor);
      expect(final).toBe(cursor);
    });
  });
});
