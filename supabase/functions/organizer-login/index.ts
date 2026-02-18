import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function createHmacToken(organizerId: string, role: string, secret: string): Promise<string> {
  const header = btoa(JSON.stringify({ alg: "HS256", typ: "JWT" })).replace(/=/g, "");
  const payload = btoa(JSON.stringify({
    organizerId,
    role,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 86400, // 24 hours
  })).replace(/=/g, "");
  const data = `${header}.${payload}`;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  const sig = btoa(String.fromCharCode(...new Uint8Array(signature))).replace(/=/g, "");
  return `${data}.${sig}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { username, email, password } = await req.json();

    if ((!username && !email) || !password) {
      return new Response(
        JSON.stringify({ success: false, error: "Credenciais são obrigatórias" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Find organizer by email or username
    let query = supabase
      .from("organizers")
      .select("id, username, email, password_hash, role");

    if (email) {
      query = query.eq("email", email.trim().toLowerCase());
    } else {
      query = query.eq("username", username.trim());
    }

    const { data: organizer, error: selectError } = await query.single();

    if (selectError || !organizer) {
      return new Response(
        JSON.stringify({ success: false, error: "Usuário ou senha incorretos" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify password (direct comparison)
    const passwordMatch = password === organizer.password_hash;

    if (!passwordMatch) {
      return new Response(
        JSON.stringify({ success: false, error: "Usuário ou senha incorretos" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create HMAC-signed token
    const token = await createHmacToken(organizer.id, organizer.role, serviceRoleKey);

    // Update last_online_at asynchronously (fire-and-forget)
    supabase
      .from("organizers")
      .update({ last_online_at: new Date().toISOString() })
      .eq("id", organizer.id)
      .then(() => {});

    return new Response(
      JSON.stringify({
        success: true,
        token,
        organizerId: organizer.id,
        role: organizer.role,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ success: false, error: "Erro interno do servidor" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
