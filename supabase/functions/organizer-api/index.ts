import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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

    // Public SELECT: no auth required
    const isPublicSelect = operation === "select" && !token && !organizerId;

    if (!isPublicSelect) {
      // Validate auth for all non-public operations
      if (!token || !organizerId) {
        return new Response(
          JSON.stringify({ error: "Autenticação necessária" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Validate token format
      try {
        const decoded = atob(token);
        const [tokenOrgId] = decoded.split(":");
        if (tokenOrgId !== organizerId) {
          throw new Error("Token inválido");
        }
      } catch {
        return new Response(
          JSON.stringify({ error: "Token inválido" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Verify organizer exists
      const { data: organizer, error: orgError } = await supabase
        .from("organizers")
        .select("id")
        .eq("id", organizerId)
        .single();

      if (orgError || !organizer) {
        return new Response(
          JSON.stringify({ error: "Organizador não encontrado" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Update last_online_at asynchronously (fire-and-forget, non-blocking)
      supabase
        .from("organizers")
        .update({ last_online_at: new Date().toISOString() })
        .eq("id", organizerId)
        .then(() => {});
    }

    // Custom bulk operations (checked BEFORE table validation)
    if (operation === "undo_bracket") {
      const { tournament_id, modality_id } = body;
      if (!tournament_id) {
        return new Response(
          JSON.stringify({ error: "tournament_id é obrigatório" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      let updateQuery = supabase.from("matches").update({ next_win_match_id: null, next_lose_match_id: null }).eq("tournament_id", tournament_id);
      if (modality_id) updateQuery = updateQuery.eq("modality_id", modality_id);
      const { error: updateErr } = await updateQuery;
      if (updateErr) {
        return new Response(JSON.stringify({ error: updateErr.message }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      let deleteQuery = supabase.from("matches").delete().eq("tournament_id", tournament_id);
      if (modality_id) deleteQuery = deleteQuery.eq("modality_id", modality_id);
      const { error: deleteErr } = await deleteQuery;
      if (deleteErr) {
        return new Response(JSON.stringify({ error: deleteErr.message }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // Also clean up groups and classificacao_grupos for this tournament
      const { error: classDelErr } = await supabase.from("classificacao_grupos").delete().eq("tournament_id", tournament_id);
      if (classDelErr) {
        return new Response(JSON.stringify({ error: classDelErr.message }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const { error: groupDelErr } = await supabase.from("groups").delete().eq("tournament_id", tournament_id);
      if (groupDelErr) {
        return new Response(JSON.stringify({ error: groupDelErr.message }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      return new Response(JSON.stringify({ data: null }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (operation === "reset_results") {
      const { tournament_id, modality_id } = body;
      if (!tournament_id) {
        return new Response(
          JSON.stringify({ error: "tournament_id é obrigatório" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      let resetQuery = supabase.from("matches").update({
        score1: 0, score2: 0, winner_team_id: null, winner_id: null, status: "pending",
      }).eq("tournament_id", tournament_id);
      if (modality_id) resetQuery = resetQuery.eq("modality_id", modality_id);
      const { error: resetErr } = await resetQuery;
      if (resetErr) {
        return new Response(JSON.stringify({ error: resetErr.message }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      return new Response(JSON.stringify({ data: null }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Allowed tables
    const allowedTables = ["tournaments", "teams", "matches", "participants", "rankings", "organizers", "user_roles", "modalities", "groups", "classificacao_grupos"];
    if (!allowedTables.includes(table)) {
      return new Response(
        JSON.stringify({ error: `Tabela '${table}' não permitida` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let query: any;

    switch (operation) {
      case "select": {
        query = supabase.from(table).select(select || "*");
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
        query = supabase.from(table).insert(data);
        if (select) query = query.select(select);
        if (single) query = query.single();
        break;
      }
      case "update": {
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
        // For matches: clear FK references before deleting to avoid constraint violations
        if (table === "matches" && filters) {
          // Build list of match IDs to delete
          let selectQuery = supabase.from("matches").select("id");
          for (const [key, value] of Object.entries(filters)) {
            selectQuery = selectQuery.eq(key, value as any);
          }
          const { data: matchesToDelete } = await selectQuery;
          if (matchesToDelete && matchesToDelete.length > 0) {
            const idsToDelete = matchesToDelete.map((m: any) => m.id);
            // Clear next_win_match_id and next_lose_match_id that point to these matches
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
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
