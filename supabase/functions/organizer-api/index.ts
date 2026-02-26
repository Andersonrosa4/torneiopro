import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import * as bcrypt from "https://deno.land/x/bcrypt@v0.4.1/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function verifyHmacToken(
  token: string,
  secret: string
): Promise<{ organizerId: string; role: string } | null> {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const [header, payload, sig] = parts;
    const data = `${header}.${payload}`;

    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"]
    );

    // Pad base64url back to standard base64
    const padded = sig.replace(/-/g, "+").replace(/_/g, "/") + "==".slice((sig.length * 3) % 4);
    const sigBuffer = Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
    const valid = await crypto.subtle.verify("HMAC", key, sigBuffer, new TextEncoder().encode(data));
    if (!valid) return null;

    // Decode payload
    const paddedPayload = payload + "==".slice((payload.length * 3) % 4);
    const claims = JSON.parse(atob(paddedPayload));

    // Check expiry
    if (claims.exp && claims.exp < Math.floor(Date.now() / 1000)) return null;

    return { organizerId: claims.organizerId, role: claims.role };
  } catch {
    return null;
  }
}

// Tables that are freely readable without auth (public data)
const PUBLIC_READ_TABLES = new Set([
  "tournaments", "teams", "matches", "participants", "modalities",
  "groups", "classificacao_grupos", "quiz_questions", "quiz_scores", "rankings",
  "tournament_rules", "ranking_points_history",
]);

// Tables that require admin role for any write
const ADMIN_ONLY_TABLES = new Set(["organizers", "user_roles"]);

// Tables that are linked to a tournament (ownership checked via tournament)
const TOURNAMENT_TABLES = new Set([
  "teams", "matches", "participants", "modalities", "groups", "classificacao_grupos",
  "tournament_rules",
]);

async function getOrganizer(supabase: any, organizerId: string) {
  // Retry up to 2 times to handle transient DB issues under concurrent load
  for (let attempt = 0; attempt < 3; attempt++) {
    const { data, error } = await supabase
      .from("organizers")
      .select("id, role")
      .eq("id", organizerId)
      .single();
    if (data) return data;
    if (attempt < 2) await new Promise((r) => setTimeout(r, 100 * (attempt + 1)));
  }
  return null;
}

async function getTournamentOwner(supabase: any, tournamentId: string): Promise<string | null> {
  const { data } = await supabase
    .from("tournaments")
    .select("created_by")
    .eq("id", tournamentId)
    .single();
  return data?.created_by ?? null;
}

/**
 * Check if an organizer has access to a tournament:
 * - either they are the creator (created_by)
 * - or they have been explicitly associated via tournament_organizers table
 */
async function hasAccessToTournament(
  supabase: any,
  organizerId: string,
  tournamentId: string
): Promise<boolean> {
  const owner = await getTournamentOwner(supabase, tournamentId);
  if (owner === organizerId) return true;

  const { data } = await supabase
    .from("tournament_organizers")
    .select("id")
    .eq("tournament_id", tournamentId)
    .eq("organizer_id", organizerId)
    .maybeSingle();

  return !!data;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { token, organizerId, table, operation, data, filters, select, order, single, maybeSingle } = body;

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Public operations: SELECT without auth, or INSERT to quiz_scores without auth
    const isPublicSelect = operation === "select" && !token && !organizerId;
    const isPublicQuizInsert = operation === "insert" && table === "quiz_scores" && !token && !organizerId;

    let authenticatedOrganizer: { id: string; role: string } | null = null;

    if (!isPublicSelect && !isPublicQuizInsert) {
      // Require token and organizerId
      if (!token || !organizerId) {
        return new Response(
          JSON.stringify({ error: "Autenticação necessária" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Verify HMAC-signed token
      const claims = await verifyHmacToken(token, serviceRoleKey);
      if (!claims || claims.organizerId !== organizerId) {
        return new Response(
          JSON.stringify({ error: "Token inválido ou expirado" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Verify organizer exists in DB
      const organizer = await getOrganizer(supabase, organizerId);
      if (!organizer) {
        return new Response(
          JSON.stringify({ error: "Organizador não encontrado" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      authenticatedOrganizer = { id: organizer.id, role: organizer.role };

      // Update last_online_at asynchronously (fire-and-forget, non-blocking)
      supabase
        .from("organizers")
        .update({ last_online_at: new Date().toISOString() })
        .eq("id", organizerId)
        .then(() => {});
    }

    const isAdmin = authenticatedOrganizer?.role === "admin";

    // ══════════════════════════════════════════════════════
    // TOURNAMENT_ORGANIZERS special operations
    // ══════════════════════════════════════════════════════
    if (table === "tournament_organizers") {
      if (!authenticatedOrganizer) {
        return new Response(JSON.stringify({ error: "Autenticação necessária" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      if (operation === "select") {
        let q = supabase.from("tournament_organizers").select(select || "*, organizers!organizer_id(id, username, display_name, role)");
        if (filters) {
          for (const [key, value] of Object.entries(filters)) {
            q = q.eq(key, value as any);
          }
        }
        const { data: result, error } = await q;
        if (error) return new Response(JSON.stringify({ error: error.message }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        return new Response(JSON.stringify({ data: result }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // Only admin or tournament creator can manage associations
      if (operation === "insert") {
        const tournamentId = data?.tournament_id;
        if (!tournamentId) return new Response(JSON.stringify({ error: "tournament_id obrigatório" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

        const owner = await getTournamentOwner(supabase, tournamentId);
        if (!isAdmin && owner !== authenticatedOrganizer!.id) {
          return new Response(JSON.stringify({ error: "Apenas o criador ou admin pode associar organizadores" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        const insertData = { ...data, granted_by: authenticatedOrganizer!.id };
        const { data: result, error } = await supabase.from("tournament_organizers").insert(insertData).select("*, organizers!organizer_id(id, username, display_name, role)").single();
        if (error) return new Response(JSON.stringify({ error: error.message }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        return new Response(JSON.stringify({ data: result }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      if (operation === "delete") {
        const associationId = filters?.id;
        const tournamentId = filters?.tournament_id;
        if (!associationId && !tournamentId) return new Response(JSON.stringify({ error: "id ou tournament_id obrigatório" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

        // Admin can always delete; creator can delete for their own tournament
        if (!isAdmin && tournamentId) {
          const owner = await getTournamentOwner(supabase, tournamentId);
          if (owner !== authenticatedOrganizer!.id) {
            return new Response(JSON.stringify({ error: "Acesso negado" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
          }
        }

        let q = supabase.from("tournament_organizers").delete();
        if (filters) {
          for (const [key, value] of Object.entries(filters)) {
            q = q.eq(key, value as any);
          }
        }
        const { error } = await q;
        if (error) return new Response(JSON.stringify({ error: error.message }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        return new Response(JSON.stringify({ data: null }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      return new Response(JSON.stringify({ error: "Operação não suportada para tournament_organizers" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Custom bulk operations (checked BEFORE table validation)
    if (operation === "undo_bracket") {
      if (!authenticatedOrganizer) {
        return new Response(JSON.stringify({ error: "Autenticação necessária" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const { tournament_id, modality_id } = body;
      if (!tournament_id) {
        return new Response(JSON.stringify({ error: "tournament_id é obrigatório" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // Ownership check (creator OR associated organizer)
      if (!isAdmin) {
        const hasAccess = await hasAccessToTournament(supabase, authenticatedOrganizer!.id, tournament_id);
        if (!hasAccess) {
          return new Response(JSON.stringify({ error: "Acesso negado" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
      }

      let updateQuery = supabase.from("matches").update({ next_win_match_id: null, next_lose_match_id: null }).eq("tournament_id", tournament_id);
      if (modality_id) updateQuery = updateQuery.eq("modality_id", modality_id);
      const { error: updateErr } = await updateQuery;
      if (updateErr) return new Response(JSON.stringify({ error: updateErr.message }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

      let deleteQuery = supabase.from("matches").delete().eq("tournament_id", tournament_id);
      if (modality_id) deleteQuery = deleteQuery.eq("modality_id", modality_id);
      const { error: deleteErr } = await deleteQuery;
      if (deleteErr) return new Response(JSON.stringify({ error: deleteErr.message }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

      const { error: classDelErr } = await supabase.from("classificacao_grupos").delete().eq("tournament_id", tournament_id);
      if (classDelErr) return new Response(JSON.stringify({ error: classDelErr.message }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

      const { error: groupDelErr } = await supabase.from("groups").delete().eq("tournament_id", tournament_id);
      if (groupDelErr) return new Response(JSON.stringify({ error: groupDelErr.message }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

      return new Response(JSON.stringify({ data: null }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (operation === "reset_results") {
      if (!authenticatedOrganizer) {
        return new Response(JSON.stringify({ error: "Autenticação necessária" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const { tournament_id, modality_id } = body;
      if (!tournament_id) {
        return new Response(JSON.stringify({ error: "tournament_id é obrigatório" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // Ownership check (creator OR associated organizer)
      if (!isAdmin) {
        const hasAccess = await hasAccessToTournament(supabase, authenticatedOrganizer!.id, tournament_id);
        if (!hasAccess) {
          return new Response(JSON.stringify({ error: "Acesso negado" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
      }

      let resetQuery = supabase.from("matches").update({
        score1: 0, score2: 0, winner_team_id: null, winner_id: null, status: "pending",
      }).eq("tournament_id", tournament_id);
      if (modality_id) resetQuery = resetQuery.eq("modality_id", modality_id);
      const { error: resetErr } = await resetQuery;
      if (resetErr) return new Response(JSON.stringify({ error: resetErr.message }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

      return new Response(JSON.stringify({ data: null }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Allowed tables
    const allowedTables = ["tournaments", "teams", "matches", "participants", "rankings", "organizers", "user_roles", "modalities", "groups", "classificacao_grupos", "quiz_questions", "quiz_scores", "tournament_organizers", "tournament_rules"];
    if (!allowedTables.includes(table)) {
      return new Response(
        JSON.stringify({ error: `Tabela '${table}' não permitida` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ══════════════════════════════════════════════════════
    // SERVER-SIDE AUTHORIZATION ENFORCEMENT
    // Prevent cross-tenant data access for non-admin organizers
    // ══════════════════════════════════════════════════════

    // Admin-only tables: only admins can write
    if (ADMIN_ONLY_TABLES.has(table) && operation !== "select") {
      if (!isAdmin) {
        return new Response(
          JSON.stringify({ error: "Permissão negada: apenas administradores" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // For write operations on tournament-related tables, enforce ownership OR association
    if (authenticatedOrganizer && !isAdmin && operation !== "select") {
      if (table === "tournaments") {
        // For UPDATE/DELETE on tournaments, verify access
        if ((operation === "update" || operation === "delete") && filters?.id) {
          const hasAccess = await hasAccessToTournament(supabase, authenticatedOrganizer.id, filters.id);
          if (!hasAccess) {
            return new Response(
              JSON.stringify({ error: "Acesso negado: torneio pertence a outro organizador" }),
              { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }
        }
        // For INSERT, force created_by to be this organizer
        if (operation === "insert" && data) {
          data.created_by = authenticatedOrganizer.id;
        }
      }

      if (TOURNAMENT_TABLES.has(table)) {
        // Determine tournament_id from filters or data
        const tournamentId = filters?.tournament_id ?? data?.tournament_id;
        if (tournamentId) {
          const hasAccess = await hasAccessToTournament(supabase, authenticatedOrganizer.id, tournamentId);
          if (!hasAccess) {
            return new Response(
              JSON.stringify({ error: "Acesso negado: torneio pertence a outro organizador" }),
              { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }
        }
      }

      // quiz_scores: only admins can delete
      if (table === "quiz_scores" && operation === "delete") {
        if (!isAdmin) {
          return new Response(
            JSON.stringify({ error: "Permissão negada: apenas administradores podem excluir pontuações do quiz" }),
            { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }

      if (table === "rankings" && operation !== "select") {
        const tournamentId = filters?.tournament_id ?? data?.tournament_id;
        if (tournamentId) {
          const hasAccess = await hasAccessToTournament(supabase, authenticatedOrganizer.id, tournamentId);
          if (!hasAccess) {
            return new Response(
              JSON.stringify({ error: "Acesso negado: ranking pertence a outro torneio" }),
              { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }
        }
        // Force created_by on insert
        if (operation === "insert" && data) {
          data.created_by = authenticatedOrganizer.id;
        }
      }
    }

    // For non-admin organizers doing SELECT on tournaments, filter to only accessible tournaments
    // (tournaments they created OR are associated with)
    let query: any;

    switch (operation) {
      case "select": {
        query = supabase.from(table).select(select || "*");

        // For tournaments table with authenticated non-admin: also return associated tournaments
        // We don't restrict SELECT here — all tournaments are public read, but Dashboard filters by created_by
        // The Dashboard will pass created_by filter itself for non-admins

        if (filters) {
          for (const [key, value] of Object.entries(filters)) {
            query = query.eq(key, value as any);
          }
        }
        if (order) {
          const orders = Array.isArray(order) ? order : [order];
          for (const o of orders) {
            query = query.order(o.column, { ascending: o.ascending ?? true });
          }
        }
        if (single) query = query.single();
        if (maybeSingle) query = query.maybeSingle();
        break;
      }
      case "insert": {
        // Hash password if inserting into organizers table
        if (table === "organizers" && data?.password_hash) {
          data.password_hash = await bcrypt.hash(data.password_hash);
        }
        query = supabase.from(table).insert(data);
        if (select) query = query.select(select);
        if (single) query = query.single();
        break;
      }
      case "update": {
        // Hash password if updating organizers table
        if (table === "organizers" && data?.password_hash) {
          data.password_hash = await bcrypt.hash(data.password_hash);
        }
        query = supabase.from(table).update(data);
        if (filters) {
          for (const [key, value] of Object.entries(filters)) {
            query = query.eq(key, value as any);
          }
        }
        if (select) query = query.select(select);
        if (single) query = query.single();
        break;
      }
      case "delete": {
        // For teams: clear FK references in matches before deleting to avoid constraint violations
        if (table === "teams" && filters) {
          let selectQuery = supabase.from("teams").select("id");
          for (const [key, value] of Object.entries(filters)) {
            selectQuery = selectQuery.eq(key, value as any);
          }
          const { data: teamsToDelete } = await selectQuery;
          if (teamsToDelete && teamsToDelete.length > 0) {
            const idsToDelete = teamsToDelete.map((t: any) => t.id);
            await supabase.from("matches").update({ team1_id: null, winner_team_id: null }).in("team1_id", idsToDelete);
            await supabase.from("matches").update({ team2_id: null, winner_team_id: null }).in("team2_id", idsToDelete);
          }
        }

        // For matches: clear FK references before deleting to avoid constraint violations
        if (table === "matches" && filters) {
          let selectQuery = supabase.from("matches").select("id");
          for (const [key, value] of Object.entries(filters)) {
            selectQuery = selectQuery.eq(key, value as any);
          }
          const { data: matchesToDelete } = await selectQuery;
          if (matchesToDelete && matchesToDelete.length > 0) {
            const idsToDelete = matchesToDelete.map((m: any) => m.id);
            await supabase.from("matches").update({ next_win_match_id: null }).in("next_win_match_id", idsToDelete);
            await supabase.from("matches").update({ next_lose_match_id: null }).in("next_lose_match_id", idsToDelete);
          }
        }
        query = supabase.from(table).delete();
        if (filters) {
          for (const [key, value] of Object.entries(filters)) {
            query = query.eq(key, value as any);
          }
        }
        break;
      }
      default:
        return new Response(
          JSON.stringify({ error: "Operação não suportada" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }

    const { data: result, error } = await query;

    if (error) {
      return new Response(
        JSON.stringify({ error: error.message }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ data: result }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: "Erro interno do servidor" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
