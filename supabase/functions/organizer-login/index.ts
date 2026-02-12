import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Simple string hash function (not cryptographically secure, for demo only)
const hashPassword = (password: string): string => {
  let hash = 0;
  for (let i = 0; i < password.length; i++) {
    const char = password.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return hash.toString();
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { username, password } = await req.json();

    if (!username || !password) {
      return new Response(
        JSON.stringify({ success: false, error: "Username e password são obrigatórios" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Find organizer by username
    const { data: organizers, error: selectError } = await supabase
      .from("organizers")
      .select("id, username, password_hash")
      .eq("username", username)
      .single();

    if (selectError || !organizers) {
      return new Response(
        JSON.stringify({ success: false, error: "Usuário ou senha incorretos" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify password (simple string comparison - assumes password_hash stores plain text or matches)
    const passwordHash = hashPassword(password);
    const storedHash = organizers.password_hash;

    // Try both: direct comparison (if stored as plain) and hash comparison
    const passwordMatch = password === storedHash || passwordHash === storedHash;

    if (!passwordMatch) {
      return new Response(
        JSON.stringify({ success: false, error: "Usuário ou senha incorretos" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create a simple token
    const token = btoa(`${organizers.id}:${Date.now()}`);

    return new Response(
      JSON.stringify({
        success: true,
        token,
        organizerId: organizers.id,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
