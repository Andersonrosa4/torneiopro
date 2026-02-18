/**
 * repair-brackets — Edge Function de Reparo da Dupla Eliminação
 *
 * Varre todos os torneios de dupla eliminação e corrige slots não propagados:
 * - Winners que não avançaram para a próxima partida
 * - Perdedores que não caíram para a chave de perdedores
 * - Sobreviventes da losers que não avançaram para a próxima rodada
 *
 * Proteção: usa SQL direto via service_role, bypassa RLS para acesso total.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  try {
    const body = await req.json().catch(() => ({}));
    const targetTournamentId: string | null = body.tournament_id ?? null;
    const targetModalityId: string | null = body.modality_id ?? null;
    const dryRun: boolean = body.dry_run === true;

    // 1. Buscar todos os torneios de dupla eliminação (ou apenas o especificado)
    let tourneysQuery = supabase.from("tournaments").select("id, name, format");
    if (targetTournamentId) {
      tourneysQuery = tourneysQuery.eq("id", targetTournamentId);
    } else {
      tourneysQuery = tourneysQuery.eq("format", "double_elimination");
    }
    const { data: tournaments, error: tErr } = await tourneysQuery;
    if (tErr) throw new Error(`Erro ao buscar torneios: ${tErr.message}`);

    const allTournaments = (tournaments ?? []).filter((t: any) => t.format === "double_elimination" || targetTournamentId);

    const report: any[] = [];
    let totalFixed = 0;
    let totalErrors = 0;

    for (const tournament of allTournaments) {
      // 2. Buscar modalidades
      let modQuery = supabase.from("modalities").select("id, name").eq("tournament_id", tournament.id);
      if (targetModalityId) modQuery = modQuery.eq("id", targetModalityId);
      const { data: modalities } = await modQuery;

      for (const modality of (modalities ?? [])) {
        // 3. Buscar TODAS as partidas desta modalidade (com estado atual)
        const { data: allMatches, error: mErr } = await supabase
          .from("matches")
          .select("*")
          .eq("modality_id", modality.id)
          .order("round", { ascending: true })
          .order("position", { ascending: true });

        if (mErr || !allMatches) {
          report.push({ tournament: tournament.name, modality: modality.name, error: mErr?.message ?? "sem partidas" });
          continue;
        }

        const matchMap = new Map<string, any>(allMatches.map((m: any) => [m.id, { ...m }]));
        const fixes: Array<{ matchId: string; field: string; value: string; reason: string }> = [];

        // 4. Para cada partida CONCLUÍDA com propagação definida, verificar se o destino foi preenchido
        for (const m of allMatches) {
          if (m.status !== "completed" || !m.winner_team_id) continue;

          // Calcular loser: o time que perdeu
          const loserId = m.team1_id === m.winner_team_id ? m.team2_id : m.team1_id;

          // Regra de slot por posição (mesma lógica do frontend)
          const winnerSlot: "team1_id" | "team2_id" = m.position % 2 === 1 ? "team1_id" : "team2_id";
          const loserSlot: "team1_id" | "team2_id" = m.position % 2 === 1 ? "team1_id" : "team2_id";

          // ── WINNER PROPAGATION ──
          if (m.next_win_match_id) {
            const dest = matchMap.get(m.next_win_match_id);
            if (dest && dest.status !== "completed") {
              // Determinar slot correto baseado no tipo de progressão
              let targetSlot: "team1_id" | "team2_id";

              if (m.bracket_type === "winners" && dest.bracket_type === "winners") {
                targetSlot = m.position % 2 === 1 ? "team1_id" : "team2_id";
              } else if (m.bracket_type === "losers" && dest.bracket_type === "losers") {
                targetSlot = m.position % 2 === 1 ? "team1_id" : "team2_id";
              } else if (m.bracket_type === "winners" && dest.bracket_type === "semi_final") {
                targetSlot = "team1_id";
              } else if (m.bracket_type === "losers" && dest.bracket_type === "semi_final") {
                targetSlot = "team2_id";
              } else if (m.bracket_type === "semi_final" && dest.bracket_type === "final") {
                targetSlot = m.position === 1 ? "team1_id" : "team2_id";
              } else {
                targetSlot = !dest.team1_id ? "team1_id" : "team2_id";
              }

              // Verificar se o winner já está no slot correto
              if (dest[targetSlot] === m.winner_team_id) continue; // já OK

              // Verificar se está no outro slot (erro de posição) — não sobrescrever
              const otherSlot = targetSlot === "team1_id" ? "team2_id" : "team1_id";
              if (dest[otherSlot] === m.winner_team_id) continue; // já está, posição diferente mas OK

              // Se o slot está vazio, preencher
              if (!dest[targetSlot]) {
                fixes.push({
                  matchId: dest.id,
                  field: targetSlot,
                  value: m.winner_team_id,
                  reason: `Winner de ${m.bracket_type} R${m.round}P${m.position} → ${dest.bracket_type} R${dest.round}P${dest.position}`,
                });
                // Atualizar mapa em memória para evitar sobrescritas
                matchMap.set(dest.id, { ...dest, [targetSlot]: m.winner_team_id });
              }
            }
          }

          // ── LOSER PROPAGATION (não se aplica a semi_final/final) ──
          const isSemiOrFinal = m.bracket_type === "semi_final" || m.bracket_type === "final";
          if (!isSemiOrFinal && m.next_lose_match_id && loserId) {
            const dest = matchMap.get(m.next_lose_match_id);
            if (dest && dest.status !== "completed") {
              // Slot baseado em posição de origem
              let targetSlot: "team1_id" | "team2_id";

              if (m.bracket_type === "winners" && dest.bracket_type === "losers") {
                targetSlot = m.position % 2 === 1 ? "team1_id" : "team2_id";
              } else if (m.bracket_type === "losers" && dest.bracket_type === "losers") {
                // Losers survivor → próxima rodada losers
                targetSlot = m.position % 2 === 1 ? "team1_id" : "team2_id";
              } else {
                targetSlot = !dest.team1_id ? "team1_id" : "team2_id";
              }

              // Verificar se o loser já está em algum slot
              if (dest.team1_id === loserId || dest.team2_id === loserId) continue; // já OK

              // Se o slot está vazio, preencher
              if (!dest[targetSlot]) {
                fixes.push({
                  matchId: dest.id,
                  field: targetSlot,
                  value: loserId,
                  reason: `Loser de ${m.bracket_type} R${m.round}P${m.position} → ${dest.bracket_type} R${dest.round}P${dest.position}`,
                });
                matchMap.set(dest.id, { ...dest, [targetSlot]: loserId });
              } else {
                // Slot preferido ocupado por outro time — tentar o outro slot
                const otherSlot = targetSlot === "team1_id" ? "team2_id" : "team1_id";
                if (!dest[otherSlot]) {
                  // Verificar se o outro slot não tem o mesmo time
                  if (dest[targetSlot] !== loserId) {
                    fixes.push({
                      matchId: dest.id,
                      field: otherSlot,
                      value: loserId,
                      reason: `Loser (fallback slot) de ${m.bracket_type} R${m.round}P${m.position} → ${dest.bracket_type} R${dest.round}P${dest.position}`,
                    });
                    matchMap.set(dest.id, { ...dest, [otherSlot]: loserId });
                  }
                }
              }
            }
          }
        }

        // 5. Aplicar correções (ou apenas reportar em dry_run)
        const modalityReport: any = {
          tournament: tournament.name,
          modality: modality.name,
          total_matches: allMatches.length,
          completed: allMatches.filter((m: any) => m.status === "completed").length,
          fixes_needed: fixes.length,
          fixes_applied: 0,
          errors: [] as string[],
          details: fixes.map(f => f.reason),
        };

        if (!dryRun && fixes.length > 0) {
          // Agrupar por matchId para fazer um update por partida
          const byMatch = new Map<string, Record<string, string>>();
          for (const fix of fixes) {
            if (!byMatch.has(fix.matchId)) byMatch.set(fix.matchId, {});
            byMatch.get(fix.matchId)![fix.field] = fix.value;
          }

          for (const [matchId, updateData] of byMatch.entries()) {
            const { error: upErr } = await supabase
              .from("matches")
              .update(updateData)
              .eq("id", matchId);

            if (upErr) {
              modalityReport.errors.push(`Match ${matchId}: ${upErr.message}`);
              totalErrors++;
            } else {
              modalityReport.fixes_applied++;
              totalFixed++;
            }
          }
        } else if (dryRun) {
          totalFixed += fixes.length;
        }

        report.push(modalityReport);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        dry_run: dryRun,
        total_fixed: totalFixed,
        total_errors: totalErrors,
        tournaments_scanned: allTournaments.length,
        report,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ success: false, error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
