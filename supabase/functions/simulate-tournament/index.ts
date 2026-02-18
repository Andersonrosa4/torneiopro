/**
 * Edge Function: simulate-tournament
 * 
 * Gera chaveamento + simula todos os resultados para torneios de teste.
 * Usa a mesma lógica de doubleEliminationLogic.ts (portada para Deno).
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ──────────────────────────────────────────────
// Bracket Generation Logic (portada do frontend)
// ──────────────────────────────────────────────

interface MatchData {
  _temp_id: string;
  tournament_id: string;
  modality_id: string;
  round: number;
  position: number;
  team1_id: string | null;
  team2_id: string | null;
  status: string;
  bracket_type: string;
  bracket_half: string | null;
  bracket_number: number;
  next_win_match_id: string | null;
  next_lose_match_id: string | null;
  winner_team_id: string | null;
  is_chapeu: boolean;
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function oppositeSide(side: string): string {
  return side === 'upper' ? 'lower' : 'upper';
}

function createMatch(
  tournamentId: string, modalityId: string, round: number, position: number,
  bracketType: string, bracketHalf: string | null, bracketNumber: number,
  team1Id: string | null = null, team2Id: string | null = null, isChapeu = false
): MatchData {
  return {
    _temp_id: crypto.randomUUID(),
    tournament_id: tournamentId,
    modality_id: modalityId,
    round, position,
    team1_id: team1Id, team2_id: team2Id,
    status: 'pending',
    bracket_type: bracketType,
    bracket_half: bracketHalf,
    bracket_number: bracketNumber,
    next_win_match_id: null,
    next_lose_match_id: null,
    winner_team_id: null,
    is_chapeu: isChapeu,
  };
}

function getBaseBracketSize(n: number): number {
  if (n <= 1) return 1;
  if ((n & (n - 1)) === 0) return n;
  const lower = Math.pow(2, Math.floor(Math.log2(n)));
  const upper = lower * 2;
  return (n - lower) <= (upper - n) ? lower : upper;
}

function buildPow2Bracket(teams: any[], tournamentId: string, modalityId: string, half: string, bracketNumber: number): MatchData[] {
  const allMatches: MatchData[] = [];
  const r1Matches: MatchData[] = [];
  for (let i = 0; i < teams.length; i += 2) {
    const m = createMatch(tournamentId, modalityId, 1, r1Matches.length + 1, 'winners', half, bracketNumber, teams[i].id, teams[i + 1].id);
    r1Matches.push(m); allMatches.push(m);
  }
  let currentMatches = r1Matches;
  let round = 2;
  while (currentMatches.length > 1) {
    const nextMatches: MatchData[] = [];
    for (let i = 0; i < currentMatches.length; i += 2) {
      const m = createMatch(tournamentId, modalityId, round, nextMatches.length + 1, 'winners', half, bracketNumber);
      currentMatches[i].next_win_match_id = m._temp_id;
      currentMatches[i + 1].next_win_match_id = m._temp_id;
      nextMatches.push(m); allMatches.push(m);
    }
    currentMatches = nextMatches; round++;
  }
  return allMatches;
}

function buildWinnersBracket(teams: any[], tournamentId: string, modalityId: string, half: string, bracketNumber: number): MatchData[] {
  const N = teams.length;
  if (N < 2) return [];
  const allMatches: MatchData[] = [];
  const base = getBaseBracketSize(N);
  const shuffled = shuffle(teams);

  if (N === base) return buildPow2Bracket(shuffled, tournamentId, modalityId, half, bracketNumber);

  let baseRoundMatches: MatchData[] = [];
  let nextRound: number;

  if (N > base) {
    const extras = N - base;
    const r0Teams = shuffled.slice(0, 2 * extras);
    const directTeams = shuffled.slice(2 * extras);
    const r0Matches: MatchData[] = [];
    for (let i = 0; i < extras; i++) {
      const m = createMatch(tournamentId, modalityId, 1, i + 1, 'winners', half, bracketNumber, r0Teams[i * 2].id, r0Teams[i * 2 + 1].id);
      r0Matches.push(m); allMatches.push(m);
    }
    const r1Matches: MatchData[] = [];
    let dIdx = 0;
    for (let i = 0; i < r0Matches.length && dIdx < directTeams.length; i++) {
      const m = createMatch(tournamentId, modalityId, 2, r1Matches.length + 1, 'winners', half, bracketNumber, null, directTeams[dIdx].id, true);
      r0Matches[i].next_win_match_id = m._temp_id;
      r1Matches.push(m); allMatches.push(m); dIdx++;
    }
    while (dIdx + 1 < directTeams.length) {
      const m = createMatch(tournamentId, modalityId, 2, r1Matches.length + 1, 'winners', half, bracketNumber, directTeams[dIdx].id, directTeams[dIdx + 1].id);
      r1Matches.push(m); allMatches.push(m); dIdx += 2;
    }
    for (let i = directTeams.length; i < r0Matches.length; i += 2) {
      if (i + 1 < r0Matches.length) {
        const m = createMatch(tournamentId, modalityId, 2, r1Matches.length + 1, 'winners', half, bracketNumber);
        r0Matches[i].next_win_match_id = m._temp_id;
        r0Matches[i + 1].next_win_match_id = m._temp_id;
        r1Matches.push(m); allMatches.push(m);
      }
    }
    baseRoundMatches = r1Matches; nextRound = 3;
  } else {
    const r1RealCount = N - base / 2;
    const playingTeams = shuffled.slice(0, 2 * r1RealCount);
    const chapeuTeams = shuffled.slice(2 * r1RealCount);
    const r1Matches: MatchData[] = [];
    for (let i = 0; i < r1RealCount; i++) {
      const m = createMatch(tournamentId, modalityId, 1, r1Matches.length + 1, 'winners', half, bracketNumber, playingTeams[i * 2].id, playingTeams[i * 2 + 1].id);
      r1Matches.push(m); allMatches.push(m);
    }
    const r2Matches: MatchData[] = [];
    let cIdx = 0;
    for (let i = 0; i < r1Matches.length && cIdx < chapeuTeams.length; i++) {
      const m = createMatch(tournamentId, modalityId, 2, r2Matches.length + 1, 'winners', half, bracketNumber, null, chapeuTeams[cIdx].id, true);
      r1Matches[i].next_win_match_id = m._temp_id;
      r2Matches.push(m); allMatches.push(m); cIdx++;
    }
    const remainingR1 = r1Matches.slice(Math.min(r1Matches.length, chapeuTeams.length));
    for (let i = 0; i < remainingR1.length; i += 2) {
      const m = createMatch(tournamentId, modalityId, 2, r2Matches.length + 1, 'winners', half, bracketNumber);
      remainingR1[i].next_win_match_id = m._temp_id;
      if (i + 1 < remainingR1.length) remainingR1[i + 1].next_win_match_id = m._temp_id;
      r2Matches.push(m); allMatches.push(m);
    }
    while (cIdx + 1 < chapeuTeams.length) {
      const m = createMatch(tournamentId, modalityId, 2, r2Matches.length + 1, 'winners', half, bracketNumber, chapeuTeams[cIdx].id, chapeuTeams[cIdx + 1].id);
      r2Matches.push(m); allMatches.push(m); cIdx += 2;
    }
    baseRoundMatches = r2Matches; nextRound = 3;
  }

  let currentMatches = baseRoundMatches;
  let round = nextRound;
  while (currentMatches.length > 1) {
    const nextMatches: MatchData[] = [];
    for (let i = 0; i < currentMatches.length; i += 2) {
      const m = createMatch(tournamentId, modalityId, round, nextMatches.length + 1, 'winners', half, bracketNumber);
      currentMatches[i].next_win_match_id = m._temp_id;
      if (i + 1 < currentMatches.length) currentMatches[i + 1].next_win_match_id = m._temp_id;
      nextMatches.push(m); allMatches.push(m);
    }
    currentMatches = nextMatches; round++;
  }
  return allMatches;
}

function buildLosersBracket(sourceWinners: MatchData[], tournamentId: string, modalityId: string, half: string, bracketNumber: number): MatchData[] {
  if (sourceWinners.length === 0) return [];
  type Entry = { source: MatchData; linkField: 'next_win_match_id' | 'next_lose_match_id' };
  const byRound = new Map<number, MatchData[]>();
  for (const m of sourceWinners) {
    if (!byRound.has(m.round)) byRound.set(m.round, []);
    byRound.get(m.round)!.push(m);
  }
  const winnersRounds = [...byRound.keys()].sort((a, b) => a - b);
  const allLosersMatches: MatchData[] = [];
  let losersRound = 1;
  let pendingBye: Entry | null = null;
  let survivorEntries: Entry[] = [];

  for (let ri = 0; ri < winnersRounds.length; ri++) {
    const wRound = winnersRounds[ri];
    const winnersInRound = byRound.get(wRound)!.sort((a, b) => a.position - b.position);
    let incoming: Entry[] = [];

    if (ri === 0) {
      const droppers = winnersInRound.map(m => ({ source: m, linkField: 'next_lose_match_id' as const }));
      incoming = pendingBye ? [pendingBye, ...droppers] : droppers;
    } else {
      const surv: Entry[] = survivorEntries;
      const newLosers: Entry[] = winnersInRound.map(m => ({ source: m, linkField: 'next_lose_match_id' as const })).sort((a, b) => a.source.position - b.source.position).reverse();
      const maxLen = Math.max(surv.length, newLosers.length);
      const interleaved: Entry[] = [];
      for (let i = 0; i < maxLen; i++) {
        if (i < surv.length) interleaved.push(surv[i]);
        if (i < newLosers.length) interleaved.push(newLosers[i]);
      }
      incoming = pendingBye ? [pendingBye, ...interleaved] : interleaved;
    }

    pendingBye = null;
    if (incoming.length === 0) continue;
    const numMatches = Math.floor(incoming.length / 2);
    if (numMatches === 0) { pendingBye = incoming[0]; continue; }

    const roundMatches: MatchData[] = [];
    for (let mi = 0; mi < numMatches; mi++) {
      const m = createMatch(tournamentId, modalityId, losersRound, mi + 1, 'losers', half, bracketNumber);
      incoming[mi * 2].source[incoming[mi * 2].linkField] = m._temp_id;
      incoming[mi * 2 + 1].source[incoming[mi * 2 + 1].linkField] = m._temp_id;
      roundMatches.push(m); allLosersMatches.push(m);
    }
    if (incoming.length % 2 === 1) pendingBye = incoming[incoming.length - 1];
    survivorEntries = roundMatches.map(m => ({ source: m, linkField: 'next_win_match_id' as const }));
    losersRound++;
  }

  let remaining: Entry[] = pendingBye ? [pendingBye, ...survivorEntries] : [...survivorEntries];
  while (remaining.length > 1) {
    const numMatches = Math.floor(remaining.length / 2);
    const nextRemaining: Entry[] = [];
    for (let i = 0; i < numMatches; i++) {
      const m = createMatch(tournamentId, modalityId, losersRound, i + 1, 'losers', half, bracketNumber);
      remaining[i * 2].source[remaining[i * 2].linkField] = m._temp_id;
      remaining[i * 2 + 1].source[remaining[i * 2 + 1].linkField] = m._temp_id;
      allLosersMatches.push(m);
      nextRemaining.push({ source: m, linkField: 'next_win_match_id' });
    }
    if (remaining.length % 2 === 1) nextRemaining.push(remaining[remaining.length - 1]);
    remaining = nextRemaining; losersRound++;
  }
  return allLosersMatches;
}

function getLastRoundMatch(matches: MatchData[]): MatchData | undefined {
  if (matches.length === 0) return undefined;
  const maxRound = Math.max(...matches.map(m => m.round));
  return matches.filter(m => m.round === maxRound)[0];
}

function generateBracket(tournamentId: string, modalityId: string, teams: any[]): { matches: any[]; error?: string } {
  if (teams.length < 4) return { matches: [], error: `Menos de 4 duplas (${teams.length})` };

  const halfSize = Math.ceil(teams.length / 2);
  const shuffled = shuffle(teams);
  const upper = shuffled.slice(0, halfSize);
  const lower = shuffled.slice(halfSize);

  const expectedTotal = (2 * teams.length) - 3;

  const winnersUpper = buildWinnersBracket(upper, tournamentId, modalityId, 'upper', 1);
  const winnersLower = buildWinnersBracket(lower, tournamentId, modalityId, 'lower', 2);
  const losersUpper = buildLosersBracket(winnersLower, tournamentId, modalityId, oppositeSide('lower'), 3);
  const losersLower = buildLosersBracket(winnersUpper, tournamentId, modalityId, oppositeSide('upper'), 4);

  const winnersMaxRound = Math.max(...[...winnersUpper, ...winnersLower].map(m => m.round), 0);
  const losersMaxRound = Math.max(...[...losersUpper, ...losersLower].map(m => m.round), 0);
  const semiRound = Math.max(winnersMaxRound, losersMaxRound) + 1;

  const semi1 = createMatch(tournamentId, modalityId, semiRound, 1, 'semi_final', 'upper', 5);
  const semi2 = createMatch(tournamentId, modalityId, semiRound, 2, 'semi_final', 'lower', 5);
  const finalMatch = createMatch(tournamentId, modalityId, semiRound + 1, 1, 'final', null, 6);

  const winnersUpperFinal = getLastRoundMatch(winnersUpper);
  const winnersLowerFinal = getLastRoundMatch(winnersLower);
  if (winnersUpperFinal) winnersUpperFinal.next_win_match_id = semi1._temp_id;
  if (winnersLowerFinal) winnersLowerFinal.next_win_match_id = semi2._temp_id;

  const losersUpperFinal = getLastRoundMatch(losersUpper);
  const losersLowerFinal = getLastRoundMatch(losersLower);
  if (losersUpperFinal) losersUpperFinal.next_win_match_id = semi1._temp_id;
  if (losersLowerFinal) losersLowerFinal.next_win_match_id = semi2._temp_id;

  semi1.next_win_match_id = finalMatch._temp_id;
  semi2.next_win_match_id = finalMatch._temp_id;

  const allMatches: MatchData[] = [...winnersUpper, ...winnersLower, ...losersUpper, ...losersLower, semi1, semi2, finalMatch];

  if (allMatches.length !== expectedTotal) {
    return { matches: [], error: `Fórmula violada: geradas ${allMatches.length}, esperado ${expectedTotal} (2×${teams.length}−3)` };
  }

  // Converter _temp_id → id (substituição nas referências)
  const tempToReal = new Map<string, string>();
  for (const m of allMatches) tempToReal.set(m._temp_id, m._temp_id);

  return {
    matches: allMatches.map(({ _temp_id, ...rest }) => ({
      ...rest,
      id: _temp_id,
      next_win_match_id: rest.next_win_match_id,
      next_lose_match_id: rest.next_lose_match_id,
    }))
  };
}

// ──────────────────────────────────────────────
// Simulation: propaga resultados automaticamente
// ──────────────────────────────────────────────

function simulateAllResults(matches: any[]): {
  champion: string | null;
  runnerUp: string | null;
  results: Array<{ matchId: string; winner: string; loser: string | null }>;
  errors: string[];
  finalMatchStates: Map<string, any>; // estado final em memória de TODOS os matches
} {
  // Trabalha com cópia mutável — NUNCA recomputar slot na hora do write no banco!
  // A resolução de colisão (dois matches ímpares → mesmo next match) é feita aqui
  // em memória. O estado final do matchMap é a fonte de verdade para DB writes.
  const matchMap = new Map<string, any>();
  for (const m of matches) matchMap.set(m.id, { ...m });

  const results: Array<{ matchId: string; winner: string; loser: string | null }> = [];
  const errors: string[] = [];
  let champion: string | null = null;
  let runnerUp: string | null = null;

  // Processar em ordem topológica (winners → losers → semi → final, depois por round/position)
  const ordered = [...matchMap.values()].sort((a, b) => {
    const typeOrder: Record<string, number> = { winners: 0, losers: 1, semi_final: 2, final: 3 };
    const ta = typeOrder[a.bracket_type] ?? 99;
    const tb = typeOrder[b.bracket_type] ?? 99;
    if (ta !== tb) return ta - tb;
    if (a.round !== b.round) return a.round - b.round;
    return a.position - b.position;
  });

  let iteration = 0;
  const maxIterations = matches.length * 10;

  while (true) {
    if (iteration++ > maxIterations) {
      errors.push('Loop de simulação excedeu limite máximo');
      break;
    }

    const playable = ordered.find(m => {
      const current = matchMap.get(m.id);
      return current && current.status === 'pending' && current.team1_id && current.team2_id;
    });

    if (!playable) {
      const pendingWithoutTeams = ordered.filter(m => {
        const current = matchMap.get(m.id);
        return current && current.status === 'pending' && (!current.team1_id || !current.team2_id);
      });
      if (pendingWithoutTeams.length > 0) {
        errors.push(`${pendingWithoutTeams.length} partida(s) pendente(s) sem equipes: ${pendingWithoutTeams.map(m => `${m.bracket_type} R${m.round}P${m.position}`).join(', ')}`);
      }
      break;
    }

    const current = matchMap.get(playable.id)!;
    const winnerId = current.team1_id; // team1 sempre vence
    const loserId = current.team2_id;

    matchMap.set(current.id, { ...current, status: 'completed', winner_team_id: winnerId });
    results.push({ matchId: current.id, winner: winnerId, loser: loserId });

    if (current.bracket_type === 'final') {
      champion = winnerId;
      runnerUp = loserId;
    }

    // ── Propagar VENCEDOR (com fallback de slot para colisão) ──
    if (current.next_win_match_id) {
      const nextWin = matchMap.get(current.next_win_match_id);
      if (nextWin) {
        const slot = current.position % 2 === 1 ? 'team1_id' : 'team2_id';
        const other = slot === 'team1_id' ? 'team2_id' : 'team1_id';

        if (current.bracket_type === 'winners' && nextWin.bracket_type === 'semi_final') {
          if (!nextWin.team1_id) matchMap.set(nextWin.id, { ...matchMap.get(nextWin.id), team1_id: winnerId });
        } else if (current.bracket_type === 'losers' && nextWin.bracket_type === 'semi_final') {
          if (!nextWin.team2_id) matchMap.set(nextWin.id, { ...matchMap.get(nextWin.id), team2_id: winnerId });
        } else if (current.bracket_type === 'semi_final' && nextWin.bracket_type === 'final') {
          const semiSlot = current.position === 1 ? 'team1_id' : 'team2_id';
          matchMap.set(nextWin.id, { ...matchMap.get(nextWin.id), [semiSlot]: winnerId });
        } else {
          // ── SLOT COLLISION GUARD: se slot preferido ocupado, usa o outro ──
          const currentNext = matchMap.get(nextWin.id);
          if (!currentNext[slot]) {
            matchMap.set(nextWin.id, { ...currentNext, [slot]: winnerId });
          } else if (!currentNext[other]) {
            matchMap.set(nextWin.id, { ...currentNext, [other]: winnerId });
          } else {
            errors.push(`[COLLISION] Ambos slots preenchidos: ${nextWin.bracket_type} R${nextWin.round}P${nextWin.position}`);
          }
        }
      }
    }

    // ── Propagar PERDEDOR (exceto semi/final) ──
    const isSemiOrFinal = current.bracket_type === 'semi_final' || current.bracket_type === 'final';
    if (!isSemiOrFinal && loserId && current.next_lose_match_id) {
      const nextLose = matchMap.get(current.next_lose_match_id);
      if (nextLose) {
        const slot = current.position % 2 === 1 ? 'team1_id' : 'team2_id';
        const other = slot === 'team1_id' ? 'team2_id' : 'team1_id';
        const currentNext = matchMap.get(nextLose.id);
        if (!currentNext[slot]) {
          matchMap.set(nextLose.id, { ...currentNext, [slot]: loserId });
        } else if (!currentNext[other]) {
          matchMap.set(nextLose.id, { ...currentNext, [other]: loserId });
        } else {
          errors.push(`[LOSER COLLISION] ${nextLose.bracket_type} R${nextLose.round}P${nextLose.position}`);
        }
      }
    }
  }

  return { champion, runnerUp, results, errors, finalMatchStates: matchMap };
}

// ──────────────────────────────────────────────
// Main Handler
// ──────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const body = await req.json().catch(() => ({}));
    const { action = 'run_all', tournament_id, modality_id } = body;

    // ── Buscar torneios de teste ──
    let tournamentsQuery = supabase
      .from('tournaments')
      .select('id, name, sport, max_participants, format')
      .like('name', 'TESTE DE %')
      .eq('format', 'double_elimination')
      .order('name');

    if (tournament_id) tournamentsQuery = tournamentsQuery.eq('id', tournament_id);

    const { data: tournaments, error: tErr } = await tournamentsQuery;
    if (tErr) return new Response(JSON.stringify({ error: tErr.message }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    if (!tournaments || tournaments.length === 0) return new Response(JSON.stringify({ error: 'Nenhum torneio de teste encontrado (TESTE DE %)' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const summaryResults: any[] = [];

    for (const tournament of tournaments) {
      // Buscar modalidades
      let modalQuery = supabase.from('modalities').select('id, name').eq('tournament_id', tournament.id);
      if (modality_id) modalQuery = modalQuery.eq('id', modality_id);
      const { data: modalities } = await modalQuery;
      if (!modalities || modalities.length === 0) { summaryResults.push({ tournament: tournament.name, error: 'Sem modalidades' }); continue; }

      for (const modality of modalities) {
        // 1. Limpar chaveamento anterior desta modalidade
        const { data: existingMatches } = await supabase.from('matches').select('id').eq('modality_id', modality.id);
        if (existingMatches && existingMatches.length > 0) {
          const ids = existingMatches.map((m: any) => m.id);
          await supabase.from('matches').update({ next_win_match_id: null, next_lose_match_id: null }).in('id', ids);
          await supabase.from('matches').delete().eq('modality_id', modality.id);
        }

        // 2. Buscar equipes
        const { data: teams } = await supabase.from('teams').select('id, player1_name, player2_name, seed').eq('modality_id', modality.id).order('seed');
        if (!teams || teams.length < 4) { summaryResults.push({ tournament: tournament.name, modality: modality.name, error: `Apenas ${teams?.length ?? 0} equipes` }); continue; }

        // 3. Gerar bracket
        const { matches, error: genError } = generateBracket(tournament.id, modality.id, teams);
        if (genError || matches.length === 0) { summaryResults.push({ tournament: tournament.name, modality: modality.name, error: genError ?? 'Geração falhou' }); continue; }

        // 4. Inserir no banco em chunks de 50
        const chunkSize = 50;
        let insertError: string | null = null;
        for (let i = 0; i < matches.length; i += chunkSize) {
          const chunk = matches.slice(i, i + chunkSize);
          const { error: insErr } = await supabase.from('matches').insert(chunk);
          if (insErr) { insertError = insErr.message; break; }
        }
        if (insertError) { summaryResults.push({ tournament: tournament.name, modality: modality.name, error: `Inserção: ${insertError}` }); continue; }

        // 5. Simular todos os resultados em memória
        // finalMatchStates contém o estado CORRETO de cada match após colisões resolvidas
        const sim = simulateAllResults(matches);

        // 6. Escrever estado final no banco — direto do finalMatchStates
        // NÃO recomputar slots aqui: a simulação já resolveu colisões (dois matches
        // de posição ímpar → mesmo next_match → slot fallback correto em memória).
        let updateErrors = 0;
        for (const [matchId, finalState] of sim.finalMatchStates.entries()) {
          const payload: Record<string, any> = {
            team1_id: finalState.team1_id ?? null,
            team2_id: finalState.team2_id ?? null,
          };
          if (finalState.winner_team_id) {
            payload.winner_team_id = finalState.winner_team_id;
            payload.status = 'completed';
            payload.score1 = 2;
            payload.score2 = 0;
          }
          const { error: stateErr } = await supabase.from('matches').update(payload).eq('id', matchId);
          if (stateErr) updateErrors++;
        }

        // 7. Atualizar status do torneio para completed
        await supabase.from('tournaments').update({ status: 'completed' }).eq('id', tournament.id);

        // Resolver nomes das equipes
        const champTeam = teams.find((t: any) => t.id === sim.champion);
        const ruTeam = teams.find((t: any) => t.id === sim.runnerUp);

        summaryResults.push({
          tournament: tournament.name,
          modality: modality.name,
          duplas: teams.length,
          total_matches: matches.length,
          expected_matches: (2 * teams.length) - 3,
          formula_ok: matches.length === (2 * teams.length) - 3,
          champion: champTeam ? `${champTeam.player1_name} / ${champTeam.player2_name}` : sim.champion,
          runner_up: ruTeam ? `${ruTeam.player1_name} / ${ruTeam.player2_name}` : sim.runnerUp,
          simulation_errors: sim.errors,
          update_errors: updateErrors,
          ok: !sim.champion ? false : sim.errors.length === 0,
        });
      }
    }

    const totalOk = summaryResults.filter(r => r.ok).length;
    const totalFailed = summaryResults.filter(r => !r.ok || r.error).length;

    return new Response(JSON.stringify({
      summary: `${totalOk} OK / ${totalFailed} com erros de ${summaryResults.length} modalidades testadas`,
      results: summaryResults,
    }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message ?? 'Erro interno' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
