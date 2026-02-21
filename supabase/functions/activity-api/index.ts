import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

function errorResponse(msg: string, status = 400) {
  return jsonResponse({ error: msg }, status);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const adminClient = createClient(supabaseUrl, serviceKey);

  const authHeader = req.headers.get("Authorization") || "";
  const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: { user } } = await userClient.auth.getUser();

  const body = await req.json().catch(() => ({}));
  const { action } = body;

  try {
    // ─── LIST FEED (public) ───
    if (action === "list_feed") {
      const { sport, limit = 30, offset = 0 } = body;
      let query = adminClient
        .from("activities")
        .select("*")
        .eq("visibility", "public")
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);

      if (sport) query = query.eq("sport", sport);

      const { data, error } = await query;
      if (error) return errorResponse(error.message);

      // Enrich with profile data
      const actorIds = [...new Set((data || []).map((a: any) => a.actor_id))];
      const { data: profiles } = await adminClient
        .from("profiles")
        .select("user_id, display_name, avatar_url")
        .in("user_id", actorIds);

      const profileMap = new Map((profiles || []).map((p: any) => [p.user_id, p]));
      const enriched = (data || []).map((a: any) => ({
        ...a,
        actor_profile: profileMap.get(a.actor_id) || null,
      }));

      return jsonResponse(enriched);
    }

    // ─── LOG ACTIVITY ───
    if (action === "log_activity") {
      const { actor_id, verb, object_id, object_type, metadata, visibility, sport } = body;
      if (!actor_id || !verb) return errorResponse("actor_id e verb são obrigatórios");

      const { data, error } = await adminClient
        .from("activities")
        .insert({
          actor_id,
          verb,
          object_id: object_id || null,
          object_type: object_type || null,
          metadata: metadata || {},
          visibility: visibility || "public",
          sport: sport || null,
        })
        .select()
        .single();
      if (error) return errorResponse(error.message);
      return jsonResponse(data);
    }

    // ─── LIST NOTIFICATIONS ───
    if (action === "list_notifications") {
      if (!user) return errorResponse("Não autenticado", 401);
      const { limit = 30 } = body;

      const { data, error } = await adminClient
        .from("notifications")
        .select("*")
        .eq("user_id", user.id)
        .order("read", { ascending: true })
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) return errorResponse(error.message);
      return jsonResponse(data);
    }

    // ─── MARK NOTIFICATION READ ───
    if (action === "mark_notification_read") {
      if (!user) return errorResponse("Não autenticado", 401);
      const { notification_id } = body;
      await adminClient
        .from("notifications")
        .update({ read: true })
        .eq("id", notification_id)
        .eq("user_id", user.id);
      return jsonResponse({ ok: true });
    }

    // ─── MARK ALL READ ───
    if (action === "mark_all_read") {
      if (!user) return errorResponse("Não autenticado", 401);
      await adminClient
        .from("notifications")
        .update({ read: true })
        .eq("user_id", user.id)
        .eq("read", false);
      return jsonResponse({ ok: true });
    }

    // ─── GET ATHLETE RANKING ───
    if (action === "get_athlete_ranking") {
      const { user_id, sport } = body;
      if (!user_id || !sport) return errorResponse("user_id e sport são obrigatórios");

      const { data, error } = await adminClient
        .from("athlete_rankings")
        .select("*")
        .eq("user_id", user_id)
        .eq("sport", sport)
        .maybeSingle();
      if (error) return errorResponse(error.message);
      return jsonResponse(data || { elo_rating: 1200, points: 0, wins: 0, losses: 0, matches_played: 0 });
    }

    // ─── GET LEADERBOARD ───
    if (action === "get_leaderboard") {
      const { sport, limit = 50 } = body;
      if (!sport) return errorResponse("sport é obrigatório");

      const { data, error } = await adminClient
        .from("athlete_rankings")
        .select("*")
        .eq("sport", sport)
        .order("elo_rating", { ascending: false })
        .limit(limit);
      if (error) return errorResponse(error.message);

      // Enrich with profiles
      const userIds = (data || []).map((r: any) => r.user_id);
      const { data: profiles } = await adminClient
        .from("profiles")
        .select("user_id, display_name, avatar_url")
        .in("user_id", userIds);

      const profileMap = new Map((profiles || []).map((p: any) => [p.user_id, p]));
      const enriched = (data || []).map((r: any) => ({
        ...r,
        profile: profileMap.get(r.user_id) || null,
      }));

      return jsonResponse(enriched);
    }

    // ─── UPDATE ELO (internal, service role) ───
    if (action === "update_elo") {
      const { winner_id, loser_id, sport } = body;
      if (!winner_id || !loser_id || !sport) return errorResponse("winner_id, loser_id e sport são obrigatórios");

      // Get or create rankings
      const getOrCreate = async (uid: string) => {
        const { data } = await adminClient
          .from("athlete_rankings")
          .select("*")
          .eq("user_id", uid)
          .eq("sport", sport)
          .maybeSingle();
        if (data) return data;
        const { data: created } = await adminClient
          .from("athlete_rankings")
          .insert({ user_id: uid, sport, elo_rating: 1200 })
          .select()
          .single();
        return created;
      };

      const winnerRank = await getOrCreate(winner_id);
      const loserRank = await getOrCreate(loser_id);
      if (!winnerRank || !loserRank) return errorResponse("Erro ao buscar rankings");

      const K = 32;
      const expectedWinner = 1 / (1 + Math.pow(10, (loserRank.elo_rating - winnerRank.elo_rating) / 400));
      const expectedLoser = 1 - expectedWinner;

      const newWinnerElo = Math.round(winnerRank.elo_rating + K * (1 - expectedWinner));
      const newLoserElo = Math.round(loserRank.elo_rating + K * (0 - expectedLoser));

      await adminClient.from("athlete_rankings").update({
        elo_rating: newWinnerElo,
        wins: winnerRank.wins + 1,
        matches_played: winnerRank.matches_played + 1,
        points: winnerRank.points + 10,
        updated_at: new Date().toISOString(),
      }).eq("id", winnerRank.id);

      await adminClient.from("athlete_rankings").update({
        elo_rating: Math.max(100, newLoserElo),
        losses: loserRank.losses + 1,
        matches_played: loserRank.matches_played + 1,
        updated_at: new Date().toISOString(),
      }).eq("id", loserRank.id);

      return jsonResponse({
        winner: { old_elo: winnerRank.elo_rating, new_elo: newWinnerElo },
        loser: { old_elo: loserRank.elo_rating, new_elo: Math.max(100, newLoserElo) },
      });
    }

    // ─── LIST PUBLIC TOURNAMENTS ───
    if (action === "list_public_tournaments") {
      const { sport, limit = 20 } = body;
      let query = adminClient
        .from("tournaments")
        .select("id, name, sport, category, event_date, location, status, visibility, tournament_code")
        .or("visibility.eq.public,visibility.is.null")
        .order("created_at", { ascending: false })
        .limit(limit);
      if (sport) query = query.eq("sport", sport);
      const { data, error } = await query;
      if (error) return errorResponse(error.message);
      return jsonResponse(data);
    }

    return errorResponse("Ação desconhecida");
  } catch (e) {
    return errorResponse(e.message || "Erro interno", 500);
  }
});
