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
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Verify caller is admin
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Not authenticated" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Invalid user" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check admin role
    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const { data: roleData } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .maybeSingle();

    if (!roleData) {
      return new Response(JSON.stringify({ error: "Access denied" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { operation } = body;

    if (operation === "list") {
      // Get all users with athlete role
      const { data: athleteRoles } = await adminClient
        .from("user_roles")
        .select("user_id")
        .eq("role", "athlete");

      if (!athleteRoles || athleteRoles.length === 0) {
        return new Response(JSON.stringify({ athletes: [] }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const userIds = athleteRoles.map((r: any) => r.user_id);

      // Get auth user data for each athlete
      const athletes = [];
      for (const uid of userIds) {
        const { data: { user: athleteUser } } = await adminClient.auth.admin.getUserById(uid);
        if (athleteUser) {
          athletes.push({
            id: athleteUser.id,
            email: athleteUser.email,
            display_name: athleteUser.user_metadata?.display_name || "",
            nickname: athleteUser.user_metadata?.nickname || "",
            phone: athleteUser.user_metadata?.phone || "",
            created_at: athleteUser.created_at,
          });
        }
      }

      // Sort by created_at desc
      athletes.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

      return new Response(JSON.stringify({ athletes }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (operation === "update") {
      const { athlete_id, display_name, nickname, phone, email } = body;
      if (!athlete_id) {
        return new Response(JSON.stringify({ error: "athlete_id required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const updatePayload: any = {};
      if (email) updatePayload.email = email;

      const metaUpdate: any = {};
      if (display_name !== undefined) metaUpdate.display_name = display_name;
      if (nickname !== undefined) metaUpdate.nickname = nickname;
      if (phone !== undefined) metaUpdate.phone = phone;

      if (Object.keys(metaUpdate).length > 0) {
        updatePayload.user_metadata = metaUpdate;
      }

      const { data: updated, error: updateError } = await adminClient.auth.admin.updateUserById(
        athlete_id,
        updatePayload
      );

      if (updateError) {
        return new Response(JSON.stringify({ error: updateError.message }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ success: true, user: updated.user }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (operation === "delete") {
      const { athlete_id } = body;
      if (!athlete_id) {
        return new Response(JSON.stringify({ error: "athlete_id required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Remove role first
      await adminClient.from("user_roles").delete().eq("user_id", athlete_id).eq("role", "athlete");
      
      // Delete auth user
      const { error: deleteError } = await adminClient.auth.admin.deleteUser(athlete_id);
      if (deleteError) {
        return new Response(JSON.stringify({ error: deleteError.message }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Invalid operation" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
