import { describe, it, expect } from "vitest";

// Replica a lógica de validação da edge function `bug-combatant-log` para
// garantir que mudanças no formato canônico do cursor sejam pegas em CI.
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const ISO_RE =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z$/;

function validateCursor(raw: unknown):
  | { ok: true; cursor: { created_at: string; id: string } | null }
  | { ok: false; reason: string } {
  if (raw === null || raw === undefined) return { ok: true, cursor: null };
  if (typeof raw !== "object") return { ok: false, reason: "cursor deve ser objeto" };
  const c = raw as { created_at?: unknown; id?: unknown };
  if (typeof c.created_at !== "string") return { ok: false, reason: "cursor.created_at ausente" };
  if (typeof c.id !== "string") return { ok: false, reason: "cursor.id ausente" };
  if (!ISO_RE.test(c.created_at)) return { ok: false, reason: "iso" };
  const d = new Date(c.created_at);
  if (!Number.isFinite(d.getTime()) || d.toISOString() !== c.created_at) {
    return { ok: false, reason: "non-canonical" };
  }
  const idLc = c.id.toLowerCase();
  if (idLc !== c.id || !UUID_RE.test(idLc)) return { ok: false, reason: "uuid" };
  return { ok: true, cursor: { created_at: c.created_at, id: idLc } };
}

describe("bug-combatant-log: validateCursor (server-side)", () => {
  const validId = "1a2b3c4d-1111-4222-8333-abcdef012345";
  const validIso = "2025-01-02T03:04:05.678Z";

  it("aceita cursor canônico", () => {
    const r = validateCursor({ created_at: validIso, id: validId });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.cursor).toEqual({ created_at: validIso, id: validId });
  });

  it("aceita null/undefined (1ª página)", () => {
    expect(validateCursor(null)).toEqual({ ok: true, cursor: null });
    expect(validateCursor(undefined)).toEqual({ ok: true, cursor: null });
  });

  it("rejeita created_at sem Z", () => {
    expect(validateCursor({ created_at: "2025-01-02T03:04:05.678", id: validId }).ok).toBe(false);
  });

  it("rejeita created_at com timezone offset", () => {
    expect(validateCursor({ created_at: "2025-01-02T03:04:05.678+00:00", id: validId }).ok).toBe(false);
  });

  it("rejeita created_at não canônico (round-trip falha)", () => {
    // Date inexistente normaliza para outra string.
    expect(validateCursor({ created_at: "2025-02-30T00:00:00.000Z", id: validId }).ok).toBe(false);
  });

  it("rejeita id em maiúsculas", () => {
    expect(validateCursor({ created_at: validIso, id: validId.toUpperCase() }).ok).toBe(false);
  });

  it("rejeita id não-UUID", () => {
    expect(validateCursor({ created_at: validIso, id: "not-a-uuid" }).ok).toBe(false);
  });

  it("rejeita tentativas de injeção PostgREST", () => {
    const inject = `${validIso},and(id.eq.${validId})`;
    expect(validateCursor({ created_at: inject, id: validId }).ok).toBe(false);
  });

  it("rejeita campos ausentes", () => {
    expect(validateCursor({ created_at: validIso }).ok).toBe(false);
    expect(validateCursor({ id: validId }).ok).toBe(false);
    expect(validateCursor("string").ok).toBe(false);
  });
});
