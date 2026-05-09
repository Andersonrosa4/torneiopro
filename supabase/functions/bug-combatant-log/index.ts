// Edge function: validação server-side do cursor de paginação keyset
// para `bug_combatant_log`. Aplica filtros (tournament_id, source) e ordena
// por (created_at desc, id desc). Retorna erro controlado quando o cursor
// não está no formato canônico (ISO-8601 UTC + UUID v4 lowercase).
//
// Códigos de erro JSON:
//   - INVALID_CURSOR     400  → cursor fora do formato canônico
//   - INVALID_FILTER     400  → tournament_id/source inválidos
//   - UNAUTHORIZED       401  → sem token / token inválido
//   - INTERNAL           500  → falha inesperada do banco
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const ISO_RE =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z$/;

const ALLOWED_SOURCES = new Set(["all", "cron", "manual"]);
const PAGE_SIZE_DEFAULT = 25;
const PAGE_SIZE_MAX = 100;

interface CursorInput {
  created_at: unknown;
  id: unknown;
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function errorResponse(code: string, message: string, status: number, extra: Record<string, unknown> = {}) {
  return jsonResponse({ error: { code, message, ...extra } }, status);
}

/**
 * Valida o cursor no formato canônico.
 * - created_at: string ISO-8601 UTC com sufixo "Z" (round-trip via Date.toISOString)
 * - id: UUID v4 lowercase
 * Retorna { ok: true, cursor } ou { ok: false, reason }.
 */
function validateCursor(raw: unknown):
  | { ok: true; cursor: { created_at: string; id: string } }
  | { ok: false; reason: string } {
  if (raw === null || raw === undefined) return { ok: true, cursor: null as any };
  if (typeof raw !== "object") return { ok: false, reason: "cursor deve ser objeto" };
  const c = raw as CursorInput;
  if (typeof c.created_at !== "string") return { ok: false, reason: "cursor.created_at ausente" };
  if (typeof c.id !== "string") return { ok: false, reason: "cursor.id ausente" };
  if (!ISO_RE.test(c.created_at)) {
    return { ok: false, reason: `cursor.created_at não é ISO-8601 UTC: ${c.created_at}` };
  }
  // Round-trip: garante que o timestamp é válido e canônico.
  const d = new Date(c.created_at);
  if (!Number.isFinite(d.getTime()) || d.toISOString() !== c.created_at) {
    return { ok: false, reason: `cursor.created_at não canônico: ${c.created_at}` };
  }
  const idLc = c.id.toLowerCase();
  if (idLc !== c.id || !UUID_RE.test(idLc)) {
    return { ok: false, reason: `cursor.id não é UUID v4 lowercase: ${c.id}` };
  }
  return { ok: true, cursor: { created_at: c.created_at, id: idLc } };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return errorResponse("METHOD_NOT_ALLOWED", "Use POST", 405);
  }

  // Auth: usa o token do usuário e delega RLS (admin-only) ao banco.
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) {
    return errorResponse("UNAUTHORIZED", "Authorization Bearer obrigatório", 401);
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return errorResponse("INVALID_FILTER", "JSON inválido", 400);
  }

  // Validação de filtros.
  const scope = body?.scope === "all" ? "all" : "tournament";
  const tournamentId = body?.tournament_id;
  if (scope === "tournament") {
    if (typeof tournamentId !== "string" || !UUID_RE.test(tournamentId.toLowerCase())) {
      return errorResponse("INVALID_FILTER", "tournament_id inválido", 400, {
        field: "tournament_id",
      });
    }
  }

  const source = typeof body?.source === "string" ? body.source : "all";
  if (!ALLOWED_SOURCES.has(source)) {
    return errorResponse("INVALID_FILTER", `source inválido: ${source}`, 400, {
      field: "source",
      allowed: Array.from(ALLOWED_SOURCES),
    });
  }

  const limitRaw = Number(body?.limit ?? PAGE_SIZE_DEFAULT);
  const limit =
    Number.isFinite(limitRaw) && limitRaw > 0
      ? Math.min(Math.floor(limitRaw), PAGE_SIZE_MAX)
      : PAGE_SIZE_DEFAULT;

  // Validação do cursor (server-side, antes de montar filtros).
  const cv = validateCursor(body?.cursor ?? null);
  if (!cv.ok) {
    return errorResponse("INVALID_CURSOR", cv.reason, 400, {
      field: "cursor",
      expected: {
        created_at: "ISO-8601 UTC com Z (ex.: 2025-01-02T03:04:05.678Z)",
        id: "UUID v4 lowercase",
      },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const supabase = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  let q = supabase
    .from("bug_combatant_log")
    .select(
      "id,tournament_id,scanned,fixed,remaining,source,applied_fixes,created_at",
    )
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit);

  if (scope === "tournament") q = q.eq("tournament_id", tournamentId);
  if (source !== "all") q = q.eq("source", source);

  if (cv.cursor) {
    const { created_at, id } = cv.cursor;
    // (created_at, id) < (cursor.created_at, cursor.id) em ordem desc.
    // Cursor já validado: created_at é ISO sem caracteres que quebrem o filtro.
    q = q.or(
      `created_at.lt.${created_at},and(created_at.eq.${created_at},id.lt.${id})`,
    );
  }

  const { data, error } = await q;
  if (error) {
    // RLS rejeita acesso → 401/403; demais → 500.
    const status =
      error.code === "PGRST301" || /permission denied|JWT/i.test(error.message)
        ? 401
        : 500;
    return errorResponse(
      status === 401 ? "UNAUTHORIZED" : "INTERNAL",
      error.message,
      status,
    );
  }

  return jsonResponse({
    rows: data ?? [],
    cursor: cv.cursor,
    limit,
    count: data?.length ?? 0,
  });
});
