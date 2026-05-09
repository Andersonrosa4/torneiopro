// 🛡️ Auto-Healer — server-side bug combatant
// Roda via cron a cada 5 min. Varre todos os torneios `in_progress` e aplica
// correções estruturais idempotentes nos matches. Registra cada execução em
// `bug_combatant_log`.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type MatchRow = {
  id: string;
  tournament_id: string;
  team1_id: string | null;
  team2_id: string | null;
  winner_team_id: string | null;
  next_win_match_id: string | null;
  next_lose_match_id: string | null;
  score1: number | null;
  score2: number | null;
  status: string | null;
};

function buildPatches(matches: MatchRow[]) {
  const idSet = new Set(matches.map((m) => m.id));
  const patches = new Map<string, Record<string, unknown>>();
  const fixes: string[] = [];
  const add = (id: string, p: Record<string, unknown>, label: string) => {
    patches.set(id, { ...(patches.get(id) ?? {}), ...p });
    fixes.push(`${id.slice(0, 8)}: ${label}`);
  };

  for (const m of matches) {
    if (m.next_win_match_id && m.next_win_match_id === m.id) add(m.id, { next_win_match_id: null }, "auto-ref vencedor");
    if (m.next_lose_match_id && m.next_lose_match_id === m.id) add(m.id, { next_lose_match_id: null }, "auto-ref perdedor");
    if (m.next_win_match_id && !idSet.has(m.next_win_match_id)) add(m.id, { next_win_match_id: null }, "link vencedor inexistente");
    if (m.next_lose_match_id && !idSet.has(m.next_lose_match_id)) add(m.id, { next_lose_match_id: null }, "link perdedor inexistente");
    if ((m.score1 ?? 0) < 0 || (m.score2 ?? 0) < 0) add(m.id, { score1: 0, score2: 0 }, "placar negativo");
    if (m.team1_id && m.team2_id && m.team1_id === m.team2_id)
      add(m.id, { team2_id: null, winner_team_id: null, status: "pending" }, "auto-confronto");
    if (m.winner_team_id && m.team1_id && m.team2_id && m.winner_team_id !== m.team1_id && m.winner_team_id !== m.team2_id)
      add(m.id, { winner_team_id: null, status: "pending" }, "vencedor inválido");
    if (m.status === "completed" && !m.winner_team_id && m.team1_id && m.team2_id)
      add(m.id, { status: "pending" }, "concluída sem vencedor");
  }
  return { patches, fixes };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const url = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });

  const summary: Array<{ tournamentId: string; scanned: number; fixed: number }> = [];

  try {
    // Optional: scan single tournament if requested
    let body: { tournamentId?: string } = {};
    try { body = await req.json(); } catch { /* cron sem body */ }

    let tournamentIds: string[] = [];
    if (body.tournamentId) {
      tournamentIds = [body.tournamentId];
    } else {
      const { data: tours, error } = await supabase
        .from("tournaments")
        .select("id")
        .in("status", ["in_progress", "scheduled"]);
      if (error) throw error;
      tournamentIds = (tours ?? []).map((t: { id: string }) => t.id);
    }

    for (const tid of tournamentIds) {
      const { data: matches, error: mErr } = await supabase
        .from("matches")
        .select("id,tournament_id,team1_id,team2_id,winner_team_id,next_win_match_id,next_lose_match_id,score1,score2,status")
        .eq("tournament_id", tid);
      if (mErr) {
        console.error(`[auto-healer] erro buscando matches do torneio ${tid}:`, mErr);
        continue;
      }
      const list = (matches ?? []) as MatchRow[];
      const { patches, fixes } = buildPatches(list);
      let fixed = 0;
      for (const [matchId, patch] of patches) {
        const { error } = await supabase.from("matches").update(patch).eq("id", matchId);
        if (!error) fixed++;
      }
      if (fixed > 0) {
        await supabase.from("bug_combatant_log").insert({
          tournament_id: tid,
          scanned: list.length,
          fixed,
          remaining: patches.size - fixed,
          applied_fixes: fixes,
          source: body.tournamentId ? "manual" : "cron",
        });
        console.info(`[auto-healer] torneio ${tid}: ${fixed}/${patches.size} correções aplicadas`);
      }
      summary.push({ tournamentId: tid, scanned: list.length, fixed });
    }

    return new Response(JSON.stringify({ ok: true, processed: summary.length, summary }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[auto-healer] erro:", e);
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
