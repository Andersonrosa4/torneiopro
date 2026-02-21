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

  // Auth client for user context
  const authHeader = req.headers.get("Authorization") || "";
  const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: { user } } = await userClient.auth.getUser();

  const body = await req.json().catch(() => ({}));
  const { action } = body;

  try {
    // ─── LIST COMMUNITIES ───
    if (action === "list_communities") {
      const { data, error } = await adminClient
        .from("ranking_communities")
        .select("*")
        .eq("active", true)
        .order("created_at", { ascending: false });
      if (error) return errorResponse(error.message);
      return jsonResponse(data);
    }

    // ─── GET COMMUNITY DETAIL ───
    if (action === "get_community") {
      const { community_id } = body;
      const { data: community, error } = await adminClient
        .from("ranking_communities")
        .select("*")
        .eq("id", community_id)
        .single();
      if (error) return errorResponse(error.message);

      const { data: members } = await adminClient
        .from("community_members")
        .select("*")
        .eq("community_id", community_id)
        .order("position", { ascending: true });

      return jsonResponse({ community, members: members || [] });
    }

    // ─── CREATE COMMUNITY (organizer) ───
    if (action === "create_community") {
      if (!user) return errorResponse("Não autenticado", 401);
      const { name, sport, challenge_range, scoring_mode, visibility } = body;
      if (!name) return errorResponse("Nome obrigatório");

      const { data, error } = await adminClient
        .from("ranking_communities")
        .insert({ name, sport: sport || "beach_tennis", challenge_range: challenge_range || 5, scoring_mode: scoring_mode || "athlete", created_by: user.id, visibility: visibility || "public" })
        .select()
        .single();
      if (error) return errorResponse(error.message);
      return jsonResponse(data);
    }

    // ─── UPDATE COMMUNITY CONFIG ───
    if (action === "update_community") {
      if (!user) return errorResponse("Não autenticado", 401);
      const { community_id, ...updates } = body;
      delete updates.action;

      // Verify ownership
      const { data: comm } = await adminClient.from("ranking_communities").select("created_by").eq("id", community_id).single();
      if (!comm || comm.created_by !== user.id) return errorResponse("Sem permissão", 403);

      const { data, error } = await adminClient
        .from("ranking_communities")
        .update(updates)
        .eq("id", community_id)
        .select()
        .single();
      if (error) return errorResponse(error.message);
      return jsonResponse(data);
    }

    // ─── ADD MEMBER (organizer searches by CPF/name) ───
    if (action === "add_member") {
      if (!user) return errorResponse("Não autenticado", 401);
      const { community_id, user_id, athlete_name, cpf, phone } = body;
      if (!community_id || !athlete_name) return errorResponse("Dados incompletos");

      // Get current max position
      const { data: members } = await adminClient
        .from("community_members")
        .select("position")
        .eq("community_id", community_id)
        .order("position", { ascending: false })
        .limit(1);
      const nextPos = (members?.[0]?.position || 0) + 1;

      const { data, error } = await adminClient
        .from("community_members")
        .insert({
          community_id,
          user_id: user_id || user.id,
          athlete_name,
          cpf: cpf || null,
          phone: phone || null,
          position: nextPos,
        })
        .select()
        .single();
      if (error) return errorResponse(error.message);
      return jsonResponse(data);
    }

    // ─── SEARCH ATHLETES (by CPF or name) ───
    if (action === "search_athletes") {
      const { query } = body;
      if (!query || query.length < 3) return errorResponse("Mínimo 3 caracteres");

      // Search in community_members across all communities
      const { data: byName } = await adminClient
        .from("community_members")
        .select("*")
        .ilike("athlete_name", `%${query}%`)
        .limit(20);

      const { data: byCpf } = await adminClient
        .from("community_members")
        .select("*")
        .ilike("cpf", `%${query}%`)
        .limit(20);

      // Also search auth users by email
      const merged = new Map();
      [...(byName || []), ...(byCpf || [])].forEach((m) => merged.set(m.id, m));
      return jsonResponse(Array.from(merged.values()));
    }

    // ─── CREATE CHALLENGE ───
    if (action === "create_challenge") {
      if (!user) return errorResponse("Não autenticado", 401);
      const { community_id, challenger_id, challenged_id } = body;
      if (!community_id || !challenger_id || !challenged_id) return errorResponse("Dados incompletos");

      // Get community config
      const { data: comm } = await adminClient.from("ranking_communities").select("*").eq("id", community_id).single();
      if (!comm) return errorResponse("Comunidade não encontrada");

      // Get both members
      const { data: challenger } = await adminClient.from("community_members").select("*").eq("id", challenger_id).single();
      const { data: challenged } = await adminClient.from("community_members").select("*").eq("id", challenged_id).single();
      if (!challenger || !challenged) return errorResponse("Atleta não encontrado");

      // Verify challenger is the authenticated user
      if (challenger.user_id !== user.id) return errorResponse("Você só pode criar desafios como você mesmo");

      // Verify range
      const diff = Math.abs(challenger.position - challenged.position);
      if (diff > comm.challenge_range) {
        return errorResponse(`Fora do alcance permitido (máximo ${comm.challenge_range} posições)`);
      }

      // Check no pending challenge between them
      const { data: existing } = await adminClient
        .from("challenges")
        .select("id")
        .eq("community_id", community_id)
        .in("status", ["pending", "accepted", "score_submitted"])
        .or(`and(challenger_id.eq.${challenger_id},challenged_id.eq.${challenged_id}),and(challenger_id.eq.${challenged_id},challenged_id.eq.${challenger_id})`);
      if (existing && existing.length > 0) return errorResponse("Já existe um desafio pendente entre vocês");

      const { data: challenge, error } = await adminClient
        .from("challenges")
        .insert({ community_id, challenger_id, challenged_id })
        .select()
        .single();
      if (error) return errorResponse(error.message);

      // Create notification for challenged
      await adminClient.from("challenge_notifications").insert({
        user_id: challenged.user_id,
        challenge_id: challenge.id,
        type: "challenge_received",
        message: `${challenger.athlete_name} te desafiou!`,
      });

      return jsonResponse(challenge);
    }

    // ─── RESPOND TO CHALLENGE ───
    if (action === "respond_challenge") {
      if (!user) return errorResponse("Não autenticado", 401);
      const { challenge_id, accept } = body;

      const { data: challenge } = await adminClient.from("challenges").select("*, challenger:challenger_id(*), challenged:challenged_id(*)").eq("id", challenge_id).single();
      if (!challenge) return errorResponse("Desafio não encontrado");
      if (challenge.status !== "pending") return errorResponse("Desafio já respondido");

      // Verify user is the challenged
      if ((challenge.challenged as any).user_id !== user.id) return errorResponse("Sem permissão");

      if (!accept) {
        await adminClient.from("challenges").update({ status: "cancelled" }).eq("id", challenge_id);
        await adminClient.from("challenge_notifications").insert({
          user_id: (challenge.challenger as any).user_id,
          challenge_id,
          type: "challenge_declined",
          message: `${(challenge.challenged as any).athlete_name} recusou seu desafio.`,
        });
        return jsonResponse({ status: "cancelled" });
      }

      await adminClient.from("challenges").update({ status: "accepted" }).eq("id", challenge_id);
      await adminClient.from("challenge_notifications").insert({
        user_id: (challenge.challenger as any).user_id,
        challenge_id,
        type: "challenge_accepted",
        message: `${(challenge.challenged as any).athlete_name} aceitou seu desafio!`,
      });
      return jsonResponse({ status: "accepted" });
    }

    // ─── SUBMIT SCORE ───
    if (action === "submit_score") {
      if (!user) return errorResponse("Não autenticado", 401);
      const { challenge_id, score_data, sets_won_challenger, sets_won_challenged } = body;

      const { data: challenge } = await adminClient.from("challenges").select("*, challenger:challenger_id(*), challenged:challenged_id(*)").eq("id", challenge_id).single();
      if (!challenge) return errorResponse("Desafio não encontrado");
      if (challenge.status !== "accepted" && challenge.status !== "score_submitted") return errorResponse("Desafio não está em andamento");

      const challenger = challenge.challenger as any;
      const challenged = challenge.challenged as any;

      // Check community scoring mode
      const { data: comm } = await adminClient.from("ranking_communities").select("scoring_mode").eq("id", challenge.community_id).single();

      const isChallenger = challenger.user_id === user.id;
      const isChallenged = challenged.user_id === user.id;
      const isOrganizer = comm?.scoring_mode === "organizer";

      if (!isChallenger && !isChallenged && !isOrganizer) return errorResponse("Sem permissão");

      // If organizer mode, finalize immediately
      if (isOrganizer) {
        const winnerId = sets_won_challenger > sets_won_challenged ? challenger.id : challenged.id;
        await adminClient.from("challenges").update({
          score_data,
          sets_won_challenger,
          sets_won_challenged,
          submitted_by: user.id,
          confirmed_by: user.id,
          winner_member_id: winnerId,
          status: "confirmed",
          completed_at: new Date().toISOString(),
        }).eq("id", challenge_id);

        // Update community ranking
        await updateRanking(adminClient, challenge.community_id, winnerId, winnerId === challenger.id ? challenged.id : challenger.id);

        // ELO + Activity + Notifications integration
        const loserId = winnerId === challenger.id ? challenged.id : challenger.id;
        const { data: commFull } = await adminClient.from("ranking_communities").select("sport").eq("id", challenge.community_id).single();
        if (commFull) {
          await logEloAndActivity(adminClient, challenger, challenged, winnerId, loserId, commFull.sport, challenge_id);
        }

        return jsonResponse({ status: "confirmed" });
      }

      // Athlete mode: first submission
      if (challenge.status === "accepted") {
        await adminClient.from("challenges").update({
          score_data,
          sets_won_challenger,
          sets_won_challenged,
          submitted_by: user.id,
          status: "score_submitted",
        }).eq("id", challenge_id);

        // Notify other player
        const otherUserId = isChallenger ? challenged.user_id : challenger.user_id;
        await adminClient.from("challenge_notifications").insert({
          user_id: otherUserId,
          challenge_id,
          type: "score_submitted",
          message: `Placar registrado: ${sets_won_challenger} x ${sets_won_challenged}. Confirme o resultado!`,
        });
        return jsonResponse({ status: "score_submitted" });
      }

      // Second player confirming
      if (challenge.status === "score_submitted") {
        if (challenge.submitted_by === user.id) return errorResponse("Você já registrou o placar. Aguarde a confirmação.");

        const winnerId = challenge.sets_won_challenger > challenge.sets_won_challenged
          ? challenger.id : challenged.id;

        await adminClient.from("challenges").update({
          confirmed_by: user.id,
          winner_member_id: winnerId,
          status: "confirmed",
          completed_at: new Date().toISOString(),
        }).eq("id", challenge_id);

        // Notify both
        const submitterName = challenge.submitted_by === challenger.user_id ? challenger.athlete_name : challenged.athlete_name;
        await adminClient.from("challenge_notifications").insert({
          user_id: challenge.submitted_by,
          challenge_id,
          type: "score_confirmed",
          message: `Placar confirmado! Resultado: ${challenge.sets_won_challenger} x ${challenge.sets_won_challenged}`,
        });

        // Update community ranking
        await updateRanking(adminClient, challenge.community_id, winnerId, winnerId === challenger.id ? challenged.id : challenger.id);

        // ELO + Activity + Notifications integration
        const loserId2 = winnerId === challenger.id ? challenged.id : challenger.id;
        const { data: commFull2 } = await adminClient.from("ranking_communities").select("sport").eq("id", challenge.community_id).single();
        if (commFull2) {
          await logEloAndActivity(adminClient, challenger, challenged, winnerId, loserId2, commFull2.sport, challenge_id);
        }

        return jsonResponse({ status: "confirmed" });
      }

      return errorResponse("Estado inválido");
    }

    // ─── LIST CHALLENGES ───
    if (action === "list_challenges") {
      const { community_id, user_id } = body;
      let query = adminClient.from("challenges")
        .select("*, challenger:challenger_id(*), challenged:challenged_id(*)")
        .order("created_at", { ascending: false });

      if (community_id) query = query.eq("community_id", community_id);
      if (user_id) {
        // Get member ids for this user
        const { data: memberIds } = await adminClient
          .from("community_members")
          .select("id")
          .eq("user_id", user_id);
        const ids = (memberIds || []).map(m => m.id);
        if (ids.length > 0) {
          query = query.or(`challenger_id.in.(${ids.join(",")}),challenged_id.in.(${ids.join(",")})`);
        }
      }

      const { data, error } = await query.limit(50);
      if (error) return errorResponse(error.message);
      return jsonResponse(data);
    }

    // ─── GET NOTIFICATIONS ───
    if (action === "get_notifications") {
      if (!user) return errorResponse("Não autenticado", 401);
      const { data, error } = await adminClient
        .from("challenge_notifications")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(30);
      if (error) return errorResponse(error.message);
      return jsonResponse(data);
    }

    // ─── MARK NOTIFICATION READ ───
    if (action === "mark_notification_read") {
      if (!user) return errorResponse("Não autenticado", 401);
      const { notification_id } = body;
      await adminClient.from("challenge_notifications").update({ read: true }).eq("id", notification_id).eq("user_id", user.id);
      return jsonResponse({ ok: true });
    }

    // ─── UPDATE MEMBER PHOTO ───
    if (action === "update_member_photo") {
      if (!user) return errorResponse("Não autenticado", 401);
      const { member_id, photo_url } = body;
      const { data, error } = await adminClient
        .from("community_members")
        .update({ photo_url })
        .eq("id", member_id)
        .eq("user_id", user.id)
        .select()
        .single();
      if (error) return errorResponse(error.message);
      return jsonResponse(data);
    }

    return errorResponse("Ação desconhecida");
  } catch (e) {
    return errorResponse(e.message || "Erro interno", 500);
  }
});

async function updateRanking(client: any, communityId: string, winnerId: string, loserId: string) {
  // Update wins/losses
  await client.rpc("", {}).catch(() => {});
  const { data: winner } = await client.from("community_members").select("*").eq("id", winnerId).single();
  const { data: loser } = await client.from("community_members").select("*").eq("id", loserId).single();
  if (!winner || !loser) return;

  // Winner gets +10 points, loser -5 (minimum 0)
  const newWinnerPoints = winner.points + 10;
  const newLoserPoints = Math.max(0, loser.points - 5);

  await client.from("community_members").update({
    points: newWinnerPoints,
    wins: winner.wins + 1,
  }).eq("id", winnerId);

  await client.from("community_members").update({
    points: newLoserPoints,
    losses: loser.losses + 1,
  }).eq("id", loserId);

  // Recalculate positions for entire community
  const { data: allMembers } = await client
    .from("community_members")
    .select("id, points")
    .eq("community_id", communityId)
    .order("points", { ascending: false });

  if (allMembers) {
    for (let i = 0; i < allMembers.length; i++) {
      await client.from("community_members").update({ position: i + 1 }).eq("id", allMembers[i].id);
    }
  }
}

async function logEloAndActivity(client: any, challenger: any, challenged: any, winnerId: string, loserId: string, sport: string, challengeId: string) {
  const winnerMember = winnerId === challenger.id ? challenger : challenged;
  const loserMember = loserId === challenger.id ? challenger : challenged;

  // 1. Update ELO ratings
  const K = 32;
  const getOrCreateRanking = async (userId: string) => {
    const { data } = await client.from("athlete_rankings").select("*").eq("user_id", userId).eq("sport", sport).maybeSingle();
    if (data) return data;
    const { data: created } = await client.from("athlete_rankings").insert({ user_id: userId, sport, elo_rating: 1200 }).select().single();
    return created;
  };

  const winnerRank = await getOrCreateRanking(winnerMember.user_id);
  const loserRank = await getOrCreateRanking(loserMember.user_id);

  if (winnerRank && loserRank) {
    const expectedWinner = 1 / (1 + Math.pow(10, (loserRank.elo_rating - winnerRank.elo_rating) / 400));
    const expectedLoser = 1 - expectedWinner;
    const newWinnerElo = Math.round(winnerRank.elo_rating + K * (1 - expectedWinner));
    const newLoserElo = Math.max(100, Math.round(loserRank.elo_rating + K * (0 - expectedLoser)));

    await client.from("athlete_rankings").update({
      elo_rating: newWinnerElo, wins: winnerRank.wins + 1, matches_played: winnerRank.matches_played + 1, points: winnerRank.points + 10, updated_at: new Date().toISOString(),
    }).eq("id", winnerRank.id);

    await client.from("athlete_rankings").update({
      elo_rating: newLoserElo, losses: loserRank.losses + 1, matches_played: loserRank.matches_played + 1, updated_at: new Date().toISOString(),
    }).eq("id", loserRank.id);
  }

  // 2. Log activities
  await client.from("activities").insert([
    { actor_id: winnerMember.user_id, verb: "challenge_won", object_id: challengeId, object_type: "challenge", sport, visibility: "public", metadata: { opponent: loserMember.athlete_name } },
    { actor_id: loserMember.user_id, verb: "challenge_lost", object_id: challengeId, object_type: "challenge", sport, visibility: "public", metadata: { opponent: winnerMember.athlete_name } },
  ]);

  // 3. Notify both
  await client.from("notifications").insert([
    { user_id: winnerMember.user_id, type: "result", title: "Vitória! 🏆", message: `Você venceu o desafio contra ${loserMember.athlete_name}`, reference_id: challengeId, reference_type: "challenge" },
    { user_id: loserMember.user_id, type: "result", title: "Resultado do Desafio", message: `${winnerMember.athlete_name} venceu o desafio`, reference_id: challengeId, reference_type: "challenge" },
  ]);
}
