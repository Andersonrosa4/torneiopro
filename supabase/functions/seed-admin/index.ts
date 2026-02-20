import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import * as bcrypt from "https://deno.land/x/bcrypt@v0.4.1/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // Require a secret header to prevent unauthorized access
  const adminSetupSecret = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const authHeader = req.headers.get("Authorization");

  if (!authHeader || authHeader !== `Bearer ${adminSetupSecret}`) {
    return new Response(
      JSON.stringify({ error: "Não autorizado" }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Read credentials from environment secrets only
    const adminEmail = Deno.env.get("ADMIN_EMAIL");
    const adminPassword = Deno.env.get("ADMIN_PASSWORD");

    if (!adminEmail || !adminPassword) {
      return new Response(
        JSON.stringify({ error: "Credenciais de admin não configuradas (ADMIN_EMAIL / ADMIN_PASSWORD)" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // One-time-use guard: if any admin role already exists, refuse to run
    const { data: existingAdmin } = await supabase
      .from("user_roles")
      .select("id")
      .eq("role", "admin")
      .maybeSingle();

    if (existingAdmin) {
      return new Response(
        JSON.stringify({ success: false, message: "Admin já existe. Função desabilitada." }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if admin already exists in auth
    const { data: existingUsers } = await supabase.auth.admin.listUsers();
    const existing = existingUsers?.users?.find((u) => u.email === adminEmail);

    let userId: string;

    if (existing) {
      userId = existing.id;
      await supabase.auth.admin.updateUserById(userId, {
        password: adminPassword,
        email_confirm: true,
      });
    } else {
      const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
        email: adminEmail,
        password: adminPassword,
        email_confirm: true,
        user_metadata: { display_name: "Admin" },
      });

      if (createError) {
        return new Response(JSON.stringify({ error: createError.message }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      userId = newUser.user.id;
    }

    // Ensure admin role exists
    await supabase.from("user_roles").insert({ user_id: userId, role: "admin" });

    // Ensure profile exists
    const { data: existingProfile } = await supabase
      .from("profiles")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();

    if (!existingProfile) {
      await supabase.from("profiles").insert({
        user_id: userId,
        display_name: "Admin",
      });
    }

    // Ensure admin organizer exists in organizers table
    const { data: existingOrganizer } = await supabase
      .from("organizers")
      .select("id")
      .eq("username", "admin")
      .maybeSingle();

    if (!existingOrganizer) {
      const hashedPassword = await bcrypt.hash(adminPassword);
      await supabase.from("organizers").insert({
        username: "admin",
        password_hash: hashedPassword,
        display_name: "Admin",
        created_by: userId,
      });
    }

    return new Response(
      JSON.stringify({ success: true, message: "Admin account ready", userId }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: "Erro interno do servidor" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
