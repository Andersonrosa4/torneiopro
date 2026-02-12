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

    // Validate auth
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

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

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

    // Allowed tables
    const allowedTables = ["tournaments", "teams", "matches", "participants", "rankings", "organizers", "user_roles", "modalities"];
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
