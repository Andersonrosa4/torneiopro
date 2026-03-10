/**
 * Edge Function: simulate-tournament
 * 
 * Gera chaveamento + simula todos os resultados para torneios de teste.
 * Suporta action: 'create_and_simulate' para criar torneios de teste automaticamente.
 * Inclui validação completa contra SYSTEM_RULES.
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

  // Semi 1: Campeão Winners A (upper) vs Campeão Losers B (lower) — CRUZAMENTO
  const semi1 = createMatch(tournamentId, modalityId, semiRound, 1, 'semi_final', 'upper', 5);
  // Semi 2: Campeão Winners B (lower) vs Campeão Losers A (upper) — CRUZAMENTO
  const semi2 = createMatch(tournamentId, modalityId, semiRound, 2, 'semi_final', 'lower', 5);
  const finalMatch = createMatch(tournamentId, modalityId, semiRound + 1, 1, 'final', null, 6);
  // 3º Lugar: perdedores das semifinais
  const thirdPlace = createMatch(tournamentId, modalityId, semiRound + 1, 2, 'third_place', null, 7);

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
  // Perdedores das semis vão para 3º lugar
  semi1.next_lose_match_id = thirdPlace._temp_id;
  semi2.next_lose_match_id = thirdPlace._temp_id;

  // Fórmula: (2N-3) para o bracket principal + 1 para 3º lugar = total
  const allMatches: MatchData[] = [...winnersUpper, ...winnersLower, ...losersUpper, ...losersLower, semi1, semi2, finalMatch, thirdPlace];

  const expectedWithThird = expectedTotal + 1; // +1 para 3º lugar
  if (allMatches.length !== expectedWithThird) {
    return { matches: [], error: `Fórmula violada: geradas ${allMatches.length}, esperado ${expectedWithThird} (2×${teams.length}−3 + 1 para 3º lugar)` };
  }

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
  thirdPlace: string | null;
  fourthPlace: string | null;
  results: Array<{ matchId: string; winner: string; loser: string | null; bracket: string; round: number; position: number }>;
  errors: string[];
  validationErrors: string[];
  finalMatchStates: Map<string, any>;
} {
  const matchMap = new Map<string, any>();
  for (const m of matches) matchMap.set(m.id, { ...m });

  const results: Array<{ matchId: string; winner: string; loser: string | null; bracket: string; round: number; position: number }> = [];
  const errors: string[] = [];
  const validationErrors: string[] = [];
  let champion: string | null = null;
  let runnerUp: string | null = null;
  let thirdPlace: string | null = null;
  let fourthPlace: string | null = null;

  const ordered = [...matchMap.values()].sort((a, b) => {
    const typeOrder: Record<string, number> = { winners: 0, losers: 1, semi_final: 2, third_place: 3, final: 4 };
    const ta = typeOrder[a.bracket_type] ?? 99;
    const tb = typeOrder[b.bracket_type] ?? 99;
    if (ta !== tb) return ta - tb;
    if (a.round !== b.round) return a.round - b.round;
    return a.position - b.position;
  });

  let iteration = 0;
  const maxIterations = matches.length * 10;

  // Track team progression for validation
  const teamLosses = new Map<string, number>();
  const teamBracketHistory = new Map<string, string[]>(); // track which brackets each team has been in

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
    
    // ── VALIDAÇÃO: auto-confronto (regra 6.6) ──
    if (current.team1_id === current.team2_id) {
      validationErrors.push(`[6.6] Auto-confronto: ${current.bracket_type} R${current.round}P${current.position} — mesma equipe nos dois slots`);
      break;
    }

    // Eleição aleatória do vencedor
    const winnerId = Math.random() > 0.5 ? current.team1_id : current.team2_id;
    const loserId = current.team1_id === winnerId ? current.team2_id : current.team1_id;

    // Track losses (excluindo 3º lugar — partida classificatória, não elimina)
    if (loserId && current.bracket_type !== 'third_place') {
      teamLosses.set(loserId, (teamLosses.get(loserId) ?? 0) + 1);
    }

    // Track bracket history
    if (!teamBracketHistory.has(current.team1_id)) teamBracketHistory.set(current.team1_id, []);
    if (!teamBracketHistory.has(current.team2_id)) teamBracketHistory.set(current.team2_id, []);
    teamBracketHistory.get(current.team1_id)!.push(current.bracket_type);
    teamBracketHistory.get(current.team2_id)!.push(current.bracket_type);

    matchMap.set(current.id, { ...current, status: 'completed', winner_team_id: winnerId });
    results.push({
      matchId: current.id,
      winner: winnerId,
      loser: loserId,
      bracket: current.bracket_type,
      round: current.round,
      position: current.position,
    });

    // ── VALIDAÇÃO: vencedor é participante (regra 5.1) ──
    if (winnerId !== current.team1_id && winnerId !== current.team2_id) {
      validationErrors.push(`[5.1] Vencedor ${winnerId.slice(0,8)} não é participante de ${current.bracket_type} R${current.round}P${current.position}`);
    }

    if (current.bracket_type === 'final') {
      champion = winnerId;
      runnerUp = loserId;
    } else if (current.bracket_type === 'third_place') {
      thirdPlace = winnerId;
      fourthPlace = loserId;
    }

    // ── Propagar VENCEDOR ──
    if (current.next_win_match_id) {
      const nextWin = matchMap.get(current.next_win_match_id);
      if (nextWin) {
        const slot = current.position % 2 === 1 ? 'team1_id' : 'team2_id';
        const other = slot === 'team1_id' ? 'team2_id' : 'team1_id';

        if (current.bracket_type === 'winners' && nextWin.bracket_type === 'semi_final') {
          if (!nextWin.team1_id) matchMap.set(nextWin.id, { ...matchMap.get(nextWin.id), team1_id: winnerId });
          else if (!nextWin.team2_id) matchMap.set(nextWin.id, { ...matchMap.get(nextWin.id), team2_id: winnerId });
          else validationErrors.push(`[COLLISION] Semi ${nextWin.position} já cheio ao receber vencedor de Winners`);
        } else if (current.bracket_type === 'losers' && nextWin.bracket_type === 'semi_final') {
          if (!nextWin.team2_id) matchMap.set(nextWin.id, { ...matchMap.get(nextWin.id), team2_id: winnerId });
          else if (!nextWin.team1_id) matchMap.set(nextWin.id, { ...matchMap.get(nextWin.id), team1_id: winnerId });
          else validationErrors.push(`[COLLISION] Semi ${nextWin.position} já cheio ao receber vencedor de Losers`);
        } else if (current.bracket_type === 'semi_final' && nextWin.bracket_type === 'final') {
          const semiSlot = current.position === 1 ? 'team1_id' : 'team2_id';
          matchMap.set(nextWin.id, { ...matchMap.get(nextWin.id), [semiSlot]: winnerId });
        } else {
          const currentNext = matchMap.get(nextWin.id);
          if (!currentNext[slot]) {
            matchMap.set(nextWin.id, { ...currentNext, [slot]: winnerId });
          } else if (!currentNext[other]) {
            matchMap.set(nextWin.id, { ...currentNext, [other]: winnerId });
          } else {
            validationErrors.push(`[COLLISION] Ambos slots preenchidos: ${nextWin.bracket_type} R${nextWin.round}P${nextWin.position}`);
          }
        }
      }
    }

    // ── Propagar PERDEDOR ──
    const isSemiOrFinal = current.bracket_type === 'semi_final' || current.bracket_type === 'final';
    
    if (current.bracket_type === 'semi_final' && loserId && current.next_lose_match_id) {
      // Semi perdedor vai para 3º lugar
      const thirdMatch = matchMap.get(current.next_lose_match_id);
      if (thirdMatch) {
        const semiSlot = current.position === 1 ? 'team1_id' : 'team2_id';
        matchMap.set(thirdMatch.id, { ...matchMap.get(thirdMatch.id), [semiSlot]: loserId });
      }
    } else if (!isSemiOrFinal && loserId && current.next_lose_match_id) {
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
          validationErrors.push(`[LOSER COLLISION] ${nextLose.bracket_type} R${nextLose.round}P${nextLose.position}`);
        }
      }
    }

    // ── VALIDAÇÃO: perdedor de semi/final não desce para losers (regra 4.6) ──
    if (current.bracket_type === 'final' && loserId) {
      // Perdedor da final é eliminado, não desce
      const totalLosses = teamLosses.get(loserId) ?? 0;
      // Regra 4.6: max 2 derrotas em DE
      if (totalLosses > 2) {
        validationErrors.push(`[4.6] Equipe ${loserId.slice(0,8)} tem ${totalLosses} derrotas — máximo permitido é 2`);
      }
    }
  }

  // ── Validações pós-simulação ──

  // 1. Nenhuma equipe com mais de 2 derrotas (regra 4.6)
  for (const [tid, losses] of teamLosses) {
    if (losses > 2) {
      validationErrors.push(`[4.6] Equipe ${tid.slice(0,8)} acumulou ${losses} derrotas`);
    }
  }

  // 2. Verificar duplicidade em mesma rodada (regra 1.4)
  const roundTeams = new Map<string, Set<string>>();
  for (const [, m] of matchMap) {
    const key = `${m.bracket_type}|${m.round}`;
    if (!roundTeams.has(key)) roundTeams.set(key, new Set());
    const s = roundTeams.get(key)!;
    if (m.team1_id) {
      if (s.has(m.team1_id)) validationErrors.push(`[1.4] Equipe ${m.team1_id.slice(0,8)} duplicada em ${key}`);
      s.add(m.team1_id);
    }
    if (m.team2_id) {
      if (s.has(m.team2_id)) validationErrors.push(`[1.4] Equipe ${m.team2_id.slice(0,8)} duplicada em ${key}`);
      s.add(m.team2_id);
    }
  }

  // 3. Nenhuma partida completed sem ambas equipes (regra 1.4 — partida fantasma)
  for (const [, m] of matchMap) {
    if (m.status === 'completed' && (!m.team1_id || !m.team2_id) && !m.is_chapeu) {
      validationErrors.push(`[1.4] Partida fantasma: ${m.bracket_type} R${m.round}P${m.position} completed sem ambas equipes`);
    }
  }

  // 4. Verificar que todas as equipes que estão na losers vieram da winners (regra 4.1)
  const winnersTeamIds = new Set<string>();
  const losersTeamIds = new Set<string>();
  for (const [, m] of matchMap) {
    if (m.bracket_type === 'winners') {
      if (m.team1_id) winnersTeamIds.add(m.team1_id);
      if (m.team2_id) winnersTeamIds.add(m.team2_id);
    }
    if (m.bracket_type === 'losers') {
      if (m.team1_id) losersTeamIds.add(m.team1_id);
      if (m.team2_id) losersTeamIds.add(m.team2_id);
    }
  }
  for (const tid of losersTeamIds) {
    if (!winnersTeamIds.has(tid)) {
      validationErrors.push(`[4.1] Equipe ${tid.slice(0,8)} na Losers sem ter passado pela Winners`);
    }
  }

  // 5. Mirror crossing: Winners A → Losers B, Winners B → Losers A (regra 4.4)
  // Verificar que perdedores de winners upper foram para losers lower e vice-versa
  for (const [, m] of matchMap) {
    if (m.bracket_type === 'winners' && m.next_lose_match_id) {
      const loseMatch = matchMap.get(m.next_lose_match_id);
      if (loseMatch && loseMatch.bracket_type === 'losers') {
        if (m.bracket_half === 'upper' && loseMatch.bracket_half === 'upper') {
          validationErrors.push(`[4.4] Mirror crossing violado: Winners upper → Losers upper em R${m.round}P${m.position}`);
        }
        if (m.bracket_half === 'lower' && loseMatch.bracket_half === 'lower') {
          validationErrors.push(`[4.4] Mirror crossing violado: Winners lower → Losers lower em R${m.round}P${m.position}`);
        }
      }
    }
  }

  return { champion, runnerUp, thirdPlace, fourthPlace, results, errors, validationErrors, finalMatchStates: matchMap };
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

    // ── Ação: criar e simular torneios de teste ──
    if (action === 'create_and_simulate') {
      const organizerId = '7ebde37a-697e-4804-8445-6610fa03ce34';
      const { team_count } = body;
      const teamCounts = team_count ? [team_count] : [24, 32, 40, 35, 28, 30];
      const tournamentNames = teamCounts.map((n: number) => `TESTE DE FUTEVÔLEI ${n} DUPLAS`);
      
      const allResults: any[] = [];

      for (let ti = 0; ti < teamCounts.length; ti++) {
        const numTeams = teamCounts[ti];
        const tournamentName = tournamentNames[ti];
        const tournamentCode = `FV${numTeams}${Date.now().toString(36).slice(-4).toUpperCase()}`;

        // 1. Criar torneio
        const { data: tournament, error: tErr } = await supabase.from('tournaments').insert({
          name: tournamentName,
          sport: 'futevolei',
          format: 'double_elimination',
          max_participants: numTeams * 2,
          created_by: organizerId,
          tournament_code: tournamentCode,
          status: 'in_progress',
          visibility: 'public',
        }).select('id, name').single();

        if (tErr || !tournament) {
          allResults.push({ tournament: tournamentName, error: `Erro ao criar torneio: ${tErr?.message}` });
          continue;
        }

        // 2. Buscar modalidade Masculino (criada automaticamente pelo trigger)
        const { data: modalities } = await supabase.from('modalities').select('id, name').eq('tournament_id', tournament.id);
        if (!modalities || modalities.length === 0) {
          allResults.push({ tournament: tournamentName, error: 'Modalidades não criadas pelo trigger' });
          continue;
        }

        const modality = modalities[0]; // Usar primeira modalidade (Masculino)

        // 3. Criar equipes
        const teamsToInsert = [];
        for (let i = 1; i <= numTeams; i++) {
          teamsToInsert.push({
            tournament_id: tournament.id,
            modality_id: modality.id,
            player1_name: `Jogador ${i}A`,
            player2_name: `Jogador ${i}B`,
            seed: null,
          });
        }

        const { error: teamsErr } = await supabase.from('teams').insert(teamsToInsert);
        if (teamsErr) {
          allResults.push({ tournament: tournamentName, error: `Erro ao criar equipes: ${teamsErr.message}` });
          continue;
        }

        // 4. Buscar equipes criadas
        const { data: teams } = await supabase.from('teams').select('id, player1_name, player2_name, seed').eq('modality_id', modality.id).order('created_at');
        if (!teams || teams.length !== numTeams) {
          allResults.push({ tournament: tournamentName, error: `Esperado ${numTeams} equipes, encontradas ${teams?.length}` });
          continue;
        }

        // 5. Gerar bracket
        const { matches, error: genError } = generateBracket(tournament.id, modality.id, teams);
        if (genError || matches.length === 0) {
          allResults.push({ tournament: tournamentName, duplas: numTeams, error: genError ?? 'Geração falhou' });
          continue;
        }

        // 6. Inserir no banco sem FKs primeiro
        const matchesWithoutFKs = matches.map(({ next_win_match_id, next_lose_match_id, ...rest }: any) => rest);
        const chunkSize = 50;
        let insertError: string | null = null;
        for (let i = 0; i < matchesWithoutFKs.length; i += chunkSize) {
          const chunk = matchesWithoutFKs.slice(i, i + chunkSize);
          const { error: insErr } = await supabase.from('matches').insert(chunk);
          if (insErr) { insertError = insErr.message; break; }
        }
        if (insertError) {
          allResults.push({ tournament: tournamentName, duplas: numTeams, error: `Inserção: ${insertError}` });
          continue;
        }

        // Atualizar FKs
        for (const m of matches) {
          if (m.next_win_match_id || m.next_lose_match_id) {
            const upd: any = {};
            if (m.next_win_match_id) upd.next_win_match_id = m.next_win_match_id;
            if (m.next_lose_match_id) upd.next_lose_match_id = m.next_lose_match_id;
            await supabase.from('matches').update(upd).eq('id', m.id);
          }
        }

        // 7. Simular todos os resultados com validação
        const sim = simulateAllResults(matches);

        // 8. Escrever estado final no banco
        let updateErrors = 0;
        for (const [matchId, finalState] of sim.finalMatchStates.entries()) {
          const payload: Record<string, any> = {
            team1_id: finalState.team1_id ?? null,
            team2_id: finalState.team2_id ?? null,
          };
          if (finalState.winner_team_id) {
            payload.winner_team_id = finalState.winner_team_id;
            payload.status = 'completed';
            payload.score1 = Math.floor(Math.random() * 3) + 1;
            payload.score2 = Math.floor(Math.random() * payload.score1);
          }
          const { error: stateErr } = await supabase.from('matches').update(payload).eq('id', matchId);
          if (stateErr) updateErrors++;
        }

        // 9. Marcar torneio como finalizado
        await supabase.from('tournaments').update({ status: 'completed' }).eq('id', tournament.id);

        // Resolver nomes
        const champTeam = teams.find((t: any) => t.id === sim.champion);
        const ruTeam = teams.find((t: any) => t.id === sim.runnerUp);
        const thirdTeam = teams.find((t: any) => t.id === sim.thirdPlace);
        const fourthTeam = teams.find((t: any) => t.id === sim.fourthPlace);

        const expectedMatches = (2 * numTeams) - 3 + 1; // +1 for 3rd place
        const formulaOk = matches.length === expectedMatches;

        allResults.push({
          tournament: tournamentName,
          tournament_id: tournament.id,
          modality: modality.name,
          duplas: numTeams,
          total_matches: matches.length,
          expected_matches: expectedMatches,
          formula_ok: formulaOk,
          formula_detail: `2×${numTeams}−3 + 1(3º lugar) = ${expectedMatches}`,
          matches_by_bracket: {
            winners: matches.filter((m: any) => m.bracket_type === 'winners').length,
            losers: matches.filter((m: any) => m.bracket_type === 'losers').length,
            semi_final: matches.filter((m: any) => m.bracket_type === 'semi_final').length,
            third_place: matches.filter((m: any) => m.bracket_type === 'third_place').length,
            final: matches.filter((m: any) => m.bracket_type === 'final').length,
          },
          podium: {
            champion: champTeam ? `${champTeam.player1_name} / ${champTeam.player2_name}` : null,
            runner_up: ruTeam ? `${ruTeam.player1_name} / ${ruTeam.player2_name}` : null,
            third_place: thirdTeam ? `${thirdTeam.player1_name} / ${thirdTeam.player2_name}` : null,
            fourth_place: fourthTeam ? `${fourthTeam.player1_name} / ${fourthTeam.player2_name}` : null,
          },
          simulation_errors: sim.errors,
          validation_errors: sim.validationErrors,
          update_errors: updateErrors,
          total_matches_played: sim.results.length,
          ok: formulaOk && sim.errors.length === 0 && sim.validationErrors.length === 0 && !!sim.champion && !!sim.thirdPlace,
        });
      }

      const totalOk = allResults.filter(r => r.ok).length;
      const totalFailed = allResults.filter(r => !r.ok || r.error).length;

      return new Response(JSON.stringify({
        summary: `${totalOk} OK / ${totalFailed} com problemas de ${allResults.length} torneios testados`,
        rules_validated: [
          '1.4 — Sem partidas fantasma',
          '4.1 — Todas equipes começam na Winners',
          '4.4 — Mirror crossing obrigatório',
          '4.6 — Máximo 2 derrotas por equipe',
          '5.1 — Vencedor é participante do match',
          '6.6 — Sem auto-confronto',
        ],
        results: allResults,
      }, null, 2), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // ── Ação padrão: run_all (torneios existentes) ──
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
      let modalQuery = supabase.from('modalities').select('id, name').eq('tournament_id', tournament.id);
      if (modality_id) modalQuery = modalQuery.eq('id', modality_id);
      const { data: modalities } = await modalQuery;
      if (!modalities || modalities.length === 0) { summaryResults.push({ tournament: tournament.name, error: 'Sem modalidades' }); continue; }

      for (const modality of modalities) {
        const { data: existingMatches } = await supabase.from('matches').select('id').eq('modality_id', modality.id);
        if (existingMatches && existingMatches.length > 0) {
          const ids = existingMatches.map((m: any) => m.id);
          await supabase.from('matches').update({ next_win_match_id: null, next_lose_match_id: null }).in('id', ids);
          await supabase.from('matches').update({ next_win_match_id: null }).in('next_win_match_id', ids);
          await supabase.from('matches').update({ next_lose_match_id: null }).in('next_lose_match_id', ids);
          await supabase.from('matches').delete().eq('modality_id', modality.id);
        }

        const { data: teams } = await supabase.from('teams').select('id, player1_name, player2_name, seed').eq('modality_id', modality.id).order('seed');
        if (!teams || teams.length < 4) { summaryResults.push({ tournament: tournament.name, modality: modality.name, error: `Apenas ${teams?.length ?? 0} equipes` }); continue; }

        const { matches, error: genError } = generateBracket(tournament.id, modality.id, teams);
        if (genError || matches.length === 0) { summaryResults.push({ tournament: tournament.name, modality: modality.name, error: genError ?? 'Geração falhou' }); continue; }

        const matchesWithoutFKs = matches.map(({ next_win_match_id, next_lose_match_id, ...rest }: any) => rest);
        const chunkSize = 50;
        let insertError: string | null = null;
        for (let i = 0; i < matchesWithoutFKs.length; i += chunkSize) {
          const chunk = matchesWithoutFKs.slice(i, i + chunkSize);
          const { error: insErr } = await supabase.from('matches').insert(chunk);
          if (insErr) { insertError = insErr.message; break; }
        }
        if (insertError) { summaryResults.push({ tournament: tournament.name, modality: modality.name, error: `Inserção: ${insertError}` }); continue; }

        for (const m of matches) {
          if (m.next_win_match_id || m.next_lose_match_id) {
            const upd: any = {};
            if (m.next_win_match_id) upd.next_win_match_id = m.next_win_match_id;
            if (m.next_lose_match_id) upd.next_lose_match_id = m.next_lose_match_id;
            await supabase.from('matches').update(upd).eq('id', m.id);
          }
        }

        const sim = simulateAllResults(matches);

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

        await supabase.from('tournaments').update({ status: 'completed' }).eq('id', tournament.id);

        const champTeam = teams.find((t: any) => t.id === sim.champion);
        const ruTeam = teams.find((t: any) => t.id === sim.runnerUp);

        summaryResults.push({
          tournament: tournament.name,
          modality: modality.name,
          duplas: teams.length,
          total_matches: matches.length,
          expected_matches: (2 * teams.length) - 3 + 1,
          formula_ok: matches.length === (2 * teams.length) - 3 + 1,
          champion: champTeam ? `${champTeam.player1_name} / ${champTeam.player2_name}` : sim.champion,
          runner_up: ruTeam ? `${ruTeam.player1_name} / ${ruTeam.player2_name}` : sim.runnerUp,
          simulation_errors: sim.errors,
          validation_errors: sim.validationErrors,
          update_errors: updateErrors,
          ok: !sim.champion ? false : sim.errors.length === 0 && sim.validationErrors.length === 0,
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
    return new Response(JSON.stringify({ error: err.message ?? 'Erro interno', stack: err.stack }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
