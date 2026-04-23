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
    const { username, email, password } = await req.json();

    if ((!username && !email) || !password) {
      return new Response(
        JSON.stringify({ success: false, error: "Credenciais são obrigatórias" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Verify credentials via Postgres pgcrypto (avoids unreliable Deno bcrypt lib)
    const { data: verifyData, error: verifyError } = await adminClient.rpc(
      "verify_organizer_password",
      {
        _username: username ?? null,
        _email: email ?? null,
        _password: password,
      }
    );

    if (verifyError) {
      console.error("verify_organizer_password error:", verifyError);
      return new Response(
        JSON.stringify({ success: false, error: "Erro ao verificar credenciais" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const organizer = Array.isArray(verifyData) ? verifyData[0] : verifyData;

    if (!organizer || !organizer.password_valid) {
      return new Response(
        JSON.stringify({ success: false, error: "Usuário ou senha incorretos" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ON-DEMAND MIGRATION: Create Supabase Auth account
    const authEmail = organizer.email || `${organizer.username.toLowerCase().replace(/[^a-z0-9]/g, "")}@organizer.torneiopro.local`;
    let authUserId = organizer.user_id;

    if (!authUserId) {
      const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
        email: authEmail,
        password,
        email_confirm: true,
        user_metadata: { organizer_id: organizer.id, role: organizer.role },
      });

      if (createError) {
        const anonTry = createClient(supabaseUrl, anonKey, {
          auth: { autoRefreshToken: false, persistSession: false },
        });
        const { data: trySign } = await anonTry.auth.signInWithPassword({ email: authEmail, password });
        if (trySign?.session) {
          authUserId = trySign.session.user.id;
        } else {
          const { data: listData } = await adminClient.auth.admin.listUsers({ perPage: 1000 });
          const existing = listData?.users?.find((u: any) => u.email === authEmail);
          if (existing) {
            await adminClient.auth.admin.updateUserById(existing.id, { password });
            authUserId = existing.id;
          } else {
            return new Response(
              JSON.stringify({ success: false, error: "Erro ao criar conta de autenticação" }),
              { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }
        }
      } else {
        authUserId = newUser.user.id;
      }

      const updateData: any = { user_id: authUserId };
      if (!organizer.email) updateData.email = authEmail;
      await adminClient.from("organizers").update(updateData).eq("id", organizer.id);
    }

    // Sign in via Supabase Auth to get session tokens
    const anonClient = createClient(supabaseUrl, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    let session = null;

    const { data: signInData, error: signInError } = await anonClient.auth.signInWithPassword({
      email: authEmail,
      password,
    });

    if (signInError || !signInData?.session) {
      await adminClient.auth.admin.updateUserById(authUserId!, { password });
      const { data: retryData, error: retryError } = await anonClient.auth.signInWithPassword({
        email: authEmail,
        password,
      });
      if (retryError || !retryData?.session) {
        return new Response(
          JSON.stringify({ success: false, error: "Erro ao iniciar sessão" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      session = retryData.session;
    } else {
      session = signInData.session;
    }

    // Update last_online_at (fire-and-forget)
    adminClient
      .from("organizers")
      .update({ last_online_at: new Date().toISOString() })
      .eq("id", organizer.id)
      .then(() => {});

    return new Response(
      JSON.stringify({
        success: true,
        session: {
          access_token: session.access_token,
          refresh_token: session.refresh_token,
        },
        organizerId: organizer.id,
        role: organizer.role,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("organizer-login error:", error);
    return new Response(
      JSON.stringify({ success: false, error: "Erro interno: " + (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
