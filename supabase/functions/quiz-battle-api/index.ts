import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function generateCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 5; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    const { action, ...params } = await req.json();

    // ─── CREATE ROOM ───
    if (action === "create_room") {
      const { tournament_id, sport, host_name } = params;
      
      // Fetch questions for this sport
      const { data: questions } = await supabase
        .from("quiz_questions")
        .select("*")
        .eq("sport", sport);

      if (!questions || questions.length < 5) {
        return new Response(JSON.stringify({ error: "Perguntas insuficientes para este esporte." }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Shuffle and pick 10 (or fewer)
      const shuffled = questions.sort(() => Math.random() - 0.5);
      const selected = shuffled.slice(0, Math.min(10, shuffled.length));

      // Generate unique code
      let code = generateCode();
      let attempts = 0;
      while (attempts < 10) {
        const { data: existing } = await supabase
          .from("quiz_rooms")
          .select("id")
          .eq("code", code)
          .eq("status", "waiting")
          .maybeSingle();
        if (!existing) break;
        code = generateCode();
        attempts++;
      }

      // Create room
      const { data: room, error: roomErr } = await supabase
        .from("quiz_rooms")
        .insert({
          code,
          tournament_id,
          sport,
          host_name,
          questions: selected,
          total_questions: selected.length,
        })
        .select()
        .single();

      if (roomErr) throw roomErr;

      // Add host as player
      const { data: player } = await supabase
        .from("quiz_room_players")
        .insert({ room_id: room.id, player_name: host_name, is_host: true })
        .select()
        .single();

      return new Response(JSON.stringify({ room, player }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── JOIN ROOM ───
    if (action === "join_room") {
      const { code, player_name } = params;

      const { data: room } = await supabase
        .from("quiz_rooms")
        .select("*")
        .eq("code", code.toUpperCase())
        .eq("status", "waiting")
        .maybeSingle();

      if (!room) {
        return new Response(JSON.stringify({ error: "Sala não encontrada ou já iniciada." }), {
          status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Check if name already taken in this room
      const { data: existing } = await supabase
        .from("quiz_room_players")
        .select("id")
        .eq("room_id", room.id)
        .eq("player_name", player_name)
        .maybeSingle();

      if (existing) {
        return new Response(JSON.stringify({ error: "Já existe um jogador com esse nome na sala." }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: player } = await supabase
        .from("quiz_room_players")
        .insert({ room_id: room.id, player_name, is_host: false })
        .select()
        .single();

      return new Response(JSON.stringify({ room, player }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── START GAME ───
    if (action === "start_game") {
      const { room_id } = params;

      await supabase
        .from("quiz_rooms")
        .update({ status: "playing", current_question: 0, question_answered_by: null })
        .eq("id", room_id);

      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── SUBMIT ANSWER ───
    if (action === "submit_answer") {
      const { room_id, player_id, answer, question_index } = params;

      // Get room
      const { data: room } = await supabase
        .from("quiz_rooms")
        .select("*")
        .eq("id", room_id)
        .single();

      if (!room || room.status !== "playing") {
        return new Response(JSON.stringify({ error: "Sala não está jogando." }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (room.current_question !== question_index) {
        return new Response(JSON.stringify({ error: "Pergunta já avançou.", already_advanced: true }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const questions = room.questions as any[];
      const currentQ = questions[question_index];
      const isCorrect = answer === currentQ.correct_option;

      // Check if someone already answered this question correctly
      if (room.question_answered_by) {
        return new Response(JSON.stringify({ 
          correct: isCorrect, 
          already_answered: true, 
          answered_by: room.question_answered_by,
          correct_option: currentQ.correct_option,
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (isCorrect) {
        // First correct answer! Award point
        const { data: player } = await supabase
          .from("quiz_room_players")
          .select("*")
          .eq("id", player_id)
          .single();

        if (player) {
          await supabase
            .from("quiz_room_players")
            .update({ score: player.score + 1 })
            .eq("id", player_id);
        }

        // Mark question as answered
        await supabase
          .from("quiz_rooms")
          .update({ question_answered_by: player_id })
          .eq("id", room_id)
          .eq("current_question", question_index); // Optimistic lock
      }

      return new Response(JSON.stringify({ 
        correct: isCorrect, 
        already_answered: false,
        correct_option: currentQ.correct_option,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── NEXT QUESTION ───
    if (action === "next_question") {
      const { room_id } = params;

      const { data: room } = await supabase
        .from("quiz_rooms")
        .select("*")
        .eq("id", room_id)
        .single();

      if (!room) throw new Error("Room not found");

      const nextQ = room.current_question + 1;
      
      if (nextQ >= room.total_questions) {
        // Game over
        await supabase
          .from("quiz_rooms")
          .update({ status: "finished", current_question: nextQ, question_answered_by: null })
          .eq("id", room_id);
      } else {
        await supabase
          .from("quiz_rooms")
          .update({ current_question: nextQ, question_answered_by: null })
          .eq("id", room_id);
      }

      return new Response(JSON.stringify({ ok: true, finished: nextQ >= room.total_questions }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
