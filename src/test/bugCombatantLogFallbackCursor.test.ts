import { describe, it, expect } from "vitest";
import { deriveFallbackCursor } from "@/lib/bugCombatantLogCursor";

const ID_A = "11111111-1111-4111-8111-111111111111";
const ID_B = "22222222-2222-4222-8222-222222222222";
const ID_C = "33333333-3333-4333-8333-333333333333";

describe("deriveFallbackCursor", () => {
  it("desabilita paginação quando rows está vazio", () => {
    const r = deriveFallbackCursor([]);
    expect(r.ok).toBe(false);
  });

  it("desabilita paginação quando todas as linhas têm cursor inválido", () => {
    const r = deriveFallbackCursor([
      { id: "not-uuid", created_at: "amanhã" },
      { id: null, created_at: 123 },
    ]);
    expect(r.ok).toBe(false);
    if (r.ok === false) expect(r.reason).toMatch(/canônico/);
  });

  it("escolhe a linha MAIS ANTIGA mesmo se a ordem da fonte estiver embaralhada", () => {
    const rows = [
      { id: ID_B, created_at: "2025-01-02T10:00:00.000Z" }, // meio
      { id: ID_A, created_at: "2025-01-02T12:00:00.000Z" }, // mais novo
      { id: ID_C, created_at: "2025-01-02T08:00:00.000Z" }, // mais antigo
    ];
    const r = deriveFallbackCursor(rows);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.cursor.id).toBe(ID_C);
      expect(r.cursor.created_at).toBe("2025-01-02T08:00:00.000Z");
    }
  });

  it("desempata por id quando created_at é igual (id menor é mais antigo em desc)", () => {
    const ts = "2025-01-02T08:00:00.000Z";
    const r = deriveFallbackCursor([
      { id: ID_A, created_at: ts },
      { id: ID_C, created_at: ts },
      { id: ID_B, created_at: ts },
    ]);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.cursor.id).toBe(ID_A);
  });

  it("ignora linhas inválidas e usa as válidas restantes", () => {
    const r = deriveFallbackCursor([
      { id: "garbage", created_at: "garbage" },
      { id: ID_A, created_at: "2025-01-02T12:00:00.000Z" },
      { id: ID_B, created_at: "2025-01-02T08:00:00.000Z" },
    ]);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.cursor.id).toBe(ID_B);
  });

  it("rejeita rows não-array", () => {
    expect(deriveFallbackCursor(null).ok).toBe(false);
    expect(deriveFallbackCursor(undefined).ok).toBe(false);
  });
});
