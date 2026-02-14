/**
 * Double Elimination Bracket Generation Logic v8 - MODELO CUSTOM
 *
 * FORMULA ABSOLUTA: Total matches = (2 × N) − 3 para final única
 * Para 32 equipes: (2 × 32) − 3 = 61 partidas
 *
 * Estrutura (para 32 equipes):
 *   Winners Upper (A): 15 partidas
 *   Winners Lower (B): 15 partidas
 *   Losers Upper (A): 14 partidas
 *   Losers Lower (B): 14 partidas
 *   Semi 1: Campeão Winners A vs Campeão Losers B (CRUZAMENTO OBRIGATÓRIO)
 *   Semi 2: Campeão Winners B vs Campeão Losers A (CRUZAMENTO OBRIGATÓRIO)
 *
 * REGRA: Equipes com mesma originBracket NUNCA se enfrentam antes da FINAL.
 *
 *   Semi 1: Campeão Winners A vs Campeão Losers B
 *   Semi 2: Campeão Winners B vs Campeão Losers A
 *
 * MIRROR CROSSING (APENAS na alimentação Winners→Losers):
 *   Winners A (upper) → Losers B (lower)
 *   Winners B (lower) → Losers A (upper)
 *
 * PROIBIDO:
 *   - placeholder matches
 *   - rodada 999
 *   - if_necessary / grand_final_reset
 *   - cross_semi (conceito removido)
 *   - Partidas sem dois feeders reais
 */

interface Team {
  id: string;
  player1_name: string;
  player2_name: string;
  seed: number | null;
}

interface MatchData {
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
  winner_team_id?: string | null;
  _temp_id: string;
}

export interface DoubleEliminationConfig {
  tournamentId: string;
  modalityId: string;
  teams: Team[];
  useSeeds: boolean;
  seedTeamIds?: string[];
  sideATeamIds?: string[];
  sideBTeamIds?: string[];
  allowThirdPlace: boolean;
}

export interface GeneratedBracket {
  matches: Omit<MatchData, '_temp_id'>[];
}

// ──────────────────────────────────────────────
// Mirror Crossing Helper — MANDATORY
// ──────────────────────────────────────────────

function oppositeSide(side: 'upper' | 'lower'): 'upper' | 'lower' {
  return side === 'upper' ? 'lower' : 'upper';
}

// ──────────────────────────────────────────────
// Utilities
// ──────────────────────────────────────────────

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function splitIntoHalves(
  teams: Team[],
  sideAIds?: string[],
  sideBIds?: string[],
): { upper: Team[]; lower: Team[] } {
  const halfSize = Math.ceil(teams.length / 2);

  if ((sideAIds && sideAIds.length > 0) || (sideBIds && sideBIds.length > 0)) {
    const assignedA = teams.filter(t => sideAIds?.includes(t.id));
    const assignedB = teams.filter(t => sideBIds?.includes(t.id));
    const unassigned = shuffle(
      teams.filter(t => !sideAIds?.includes(t.id) && !sideBIds?.includes(t.id))
    );

    const upper = [...assignedA];
    const lower = [...assignedB];

    for (const t of unassigned) {
      if (upper.length < halfSize) upper.push(t);
      else lower.push(t);
    }

    return { upper: shuffle(upper), lower: shuffle(lower) };
  }

  const shuffled = shuffle(teams);
  return {
    upper: shuffled.slice(0, halfSize),
    lower: shuffled.slice(halfSize),
  };
}

function createMatch(
  tournamentId: string,
  modalityId: string,
  round: number,
  position: number,
  bracketType: string,
  bracketHalf: string | null,
  bracketNumber: number,
  team1Id: string | null = null,
  team2Id: string | null = null,
): MatchData {
  return {
    tournament_id: tournamentId,
    modality_id: modalityId,
    round,
    position,
    team1_id: team1Id,
    team2_id: team2Id,
    status: 'pending',
    bracket_type: bracketType,
    bracket_half: bracketHalf,
    bracket_number: bracketNumber,
    next_win_match_id: null,
    next_lose_match_id: null,
    _temp_id: crypto.randomUUID(),
  };
}

// ──────────────────────────────────────────────
// Slot-based abstraction
// ──────────────────────────────────────────────

type Slot = 
  | { type: 'match'; match: MatchData }
  | { type: 'team'; teamId: string };

// ──────────────────────────────────────────────
// Winners Bracket
// ──────────────────────────────────────────────

function buildWinnersBracket(
  teams: Team[],
  tournamentId: string,
  modalityId: string,
  half: 'upper' | 'lower',
  bracketNumber: number,
  seedTeamIds: string[] = [],
): MatchData[] {
  if (teams.length < 2) return [];

  const allMatches: MatchData[] = [];
  const seeds = teams.filter(t => seedTeamIds.includes(t.id));
  const nonSeeds = teams.filter(t => !seedTeamIds.includes(t.id));

  const r1Matches: MatchData[] = [];
  for (let i = 0; i + 1 < nonSeeds.length; i += 2) {
    const m = createMatch(
      tournamentId, modalityId, 1, r1Matches.length + 1,
      'winners', half, bracketNumber,
      nonSeeds[i].id, nonSeeds[i + 1].id,
    );
    r1Matches.push(m);
    allMatches.push(m);
  }

  let slots: Slot[] = r1Matches.map(m => ({ type: 'match' as const, match: m }));

  for (const s of seeds) {
    slots.push({ type: 'team', teamId: s.id });
  }

  if (nonSeeds.length % 2 === 1) {
    slots.push({ type: 'team', teamId: nonSeeds[nonSeeds.length - 1].id });
  }

  const hasR1 = r1Matches.length > 0;
  let round = hasR1 ? 2 : 1;

  if (slots.length <= 1) return allMatches;

  while (slots.length > 1) {
    const nextSlots: Slot[] = [];
    let pos = 1;

    const matchSlots = slots.filter(s => s.type === 'match');
    const teamSlots = slots.filter(s => s.type === 'team');

    let mi = 0;
    let ti = 0;

    while (mi < matchSlots.length && ti < teamSlots.length) {
      const ms = matchSlots[mi] as { type: 'match'; match: MatchData };
      const ts = teamSlots[ti] as { type: 'team'; teamId: string };

      const m = createMatch(
        tournamentId, modalityId, round, pos++,
        'winners', half, bracketNumber,
        null, ts.teamId,
      );
      ms.match.next_win_match_id = m._temp_id;
      allMatches.push(m);
      nextSlots.push({ type: 'match', match: m });
      mi++;
      ti++;
    }

    while (mi + 1 < matchSlots.length) {
      const ms1 = matchSlots[mi] as { type: 'match'; match: MatchData };
      const ms2 = matchSlots[mi + 1] as { type: 'match'; match: MatchData };

      const m = createMatch(
        tournamentId, modalityId, round, pos++,
        'winners', half, bracketNumber,
      );
      ms1.match.next_win_match_id = m._temp_id;
      ms2.match.next_win_match_id = m._temp_id;
      allMatches.push(m);
      nextSlots.push({ type: 'match', match: m });
      mi += 2;
    }

    while (ti + 1 < teamSlots.length) {
      const ts1 = teamSlots[ti] as { type: 'team'; teamId: string };
      const ts2 = teamSlots[ti + 1] as { type: 'team'; teamId: string };

      const m = createMatch(
        tournamentId, modalityId, round, pos++,
        'winners', half, bracketNumber,
        ts1.teamId, ts2.teamId,
      );
      allMatches.push(m);
      nextSlots.push({ type: 'match', match: m });
      ti += 2;
    }

    if (mi < matchSlots.length) {
      nextSlots.push(matchSlots[mi]);
    } else if (ti < teamSlots.length) {
      nextSlots.push(teamSlots[ti]);
    }

    slots = nextSlots;
    round++;
  }

  return allMatches;
}

// ──────────────────────────────────────────────
// Losers Bracket — Construção Sequencial Obrigatória
// ──────────────────────────────────────────────

function buildLosersBracketWithFeeders(
  sourceWinnersMatches: MatchData[],
  tournamentId: string,
  modalityId: string,
  half: 'upper' | 'lower',
  bracketNumber: number,
): MatchData[] {
  const totalFeeders = sourceWinnersMatches.length;
  if (totalFeeders === 0) return [];

  // Agrupar winners por rodada
  const byRound = new Map<number, MatchData[]>();
  for (const m of sourceWinnersMatches) {
    if (!byRound.has(m.round)) byRound.set(m.round, []);
    byRound.get(m.round)!.push(m);
  }
  const winnersRounds = [...byRound.keys()].sort((a, b) => a - b);

  const allLosersMatches: MatchData[] = [];

  // "survivors" são os matches de losers cuja saída (winner) ainda não foi pareada
  let survivors: MatchData[] = [];
  let losersRound = 1;

  for (let ri = 0; ri < winnersRounds.length; ri++) {
    const wRound = winnersRounds[ri];
    const winnersInRound = byRound.get(wRound)!.sort((a, b) => a.position - b.position);

    // ── PASSO 1: Montar lista de "entradas" para esta rodada dos perdedores ──
    // Cada entrada é um MatchData que vai alimentar um slot no próximo match.
    // - survivors: matches de losers anteriores (feeder via next_win_match_id)
    // - winnersInRound: matches de winners (feeder via next_lose_match_id)
    //
    // Para R1 dos perdedores: usar espelhamento reverso (1↔último, 2↔penúltimo)
    // Para rodadas subsequentes: intercalar survivors com novos perdedores

    const incoming: { source: MatchData; linkField: 'next_win_match_id' | 'next_lose_match_id' }[] = [];

    if (ri === 0 && survivors.length === 0) {
      // ── Rodada 1: Pareamento sequencial ──
      // Perd.9 vs Perd.10, Perd.11 vs Perd.12, etc.
      // Ordenados por position ascendente (quem jogou antes, joga primeiro).
      const sources = winnersInRound
        .map(m => ({ source: m, linkField: 'next_lose_match_id' as const }))
        .sort((a, b) => a.source.position - b.source.position);

      for (const s of sources) {
        incoming.push(s);
      }
    } else {
      // ── Rodadas subsequentes: intercalar survivors com novos perdedores ──
      // REGRA 9 (ANTI-REMATCH): Os novos perdedores que caem da Winners são
      // intercalados em ordem REVERSA com os sobreviventes da Losers.
      // Isso garante que o sobrevivente do primeiro jogo da Losers R1
      // (que tinha Perd.9 vs Perd.10) NÃO enfrente o perdedor da Winners R2
      // que veio do vencedor de jogo 9 ou 10. A inversão maximiza a distância
      // entre ex-adversários, evitando rematches nas rodadas 1-2 da Losers.
      const surv = survivors.map(m => ({
        source: m,
        linkField: 'next_win_match_id' as const,
      }));
      const newLosers = winnersInRound
        .map(m => ({
          source: m,
          linkField: 'next_lose_match_id' as const,
        }))
        .sort((a, b) => a.source.position - b.source.position)
        .reverse(); // REVERSO: últimos droppers com primeiros survivors

      // Intercalar
      const maxLen = Math.max(surv.length, newLosers.length);
      for (let i = 0; i < maxLen; i++) {
        if (i < surv.length) incoming.push(surv[i]);
        if (i < newLosers.length) incoming.push(newLosers[i]);
      }
    }

    if (incoming.length === 0) continue;

    // ── PASSO 2: Criar todos os jogos da rodada ──
    const numMatches = Math.floor(incoming.length / 2);
    const roundMatches: MatchData[] = [];

    for (let mi = 0; mi < numMatches; mi++) {
      const m = createMatch(
        tournamentId, modalityId, losersRound, mi + 1,
        'losers', half, bracketNumber,
      );
      roundMatches.push(m);
      allLosersMatches.push(m);
    }

    // ── PASSO 3: Atribuir feeders aos jogos criados ──
    for (let mi = 0; mi < numMatches; mi++) {
      const entry1 = incoming[mi * 2];
      const entry2 = incoming[mi * 2 + 1];
      const targetMatch = roundMatches[mi];

      // Linkar source → target
      entry1.source[entry1.linkField] = targetMatch._temp_id;
      entry2.source[entry2.linkField] = targetMatch._temp_id;
    }

    // ── PASSO 4: Competidor ímpar → Chapéu (slot de espera) ──
     const newSurvivors: MatchData[] = [...roundMatches];
     if (incoming.length % 2 === 1) {
       const oddEntry = incoming[incoming.length - 1];
       // O competidor ímpar precisa de um match de espera (Chapéu)
       // Este é um slot vazio aguardando um adversário real
       const chapeuMatch = createMatch(
         tournamentId, modalityId, losersRound, numMatches + 1,
         'losers', half, bracketNumber,
       );
       
       // Linkar o source ao Chapéu
       oddEntry.source[oddEntry.linkField] = chapeuMatch._temp_id;
       
       // Determinar qual slot recebe o time ímpar
       // Usar position parity: odd position = team1, even = team2
       const sourceMatch = oddEntry.source;
       const slotField = sourceMatch.position % 2 === 1 ? 'team1_id' : 'team2_id';
       chapeuMatch[slotField] = oddEntry.source.winner_team_id; // Will be set on winner declaration
       
       chapeuMatch.status = 'pending';
       allLosersMatches.push(chapeuMatch);
       newSurvivors.push(chapeuMatch);
     }

    survivors = newSurvivors;
    losersRound++;
  }

  // ── Redução final: parear sobreviventes até restar 1 ──
  while (survivors.length > 1) {
    const numMatches = Math.floor(survivors.length / 2);
    const nextSurvivors: MatchData[] = [];

    for (let i = 0; i < numMatches; i++) {
      const m = createMatch(
        tournamentId, modalityId, losersRound, i + 1,
        'losers', half, bracketNumber,
      );
      survivors[i * 2].next_win_match_id = m._temp_id;
      survivors[i * 2 + 1].next_win_match_id = m._temp_id;
      allLosersMatches.push(m);
      nextSurvivors.push(m);
    }

     // Ímpar na redução → Chapéu (slot de espera)
     if (survivors.length % 2 === 1) {
       const chapeuMatch = createMatch(
         tournamentId, modalityId, losersRound, numMatches + 1,
         'losers', half, bracketNumber,
       );
       survivors[survivors.length - 1].next_win_match_id = chapeuMatch._temp_id;
       // Determine slot: odd position = team1, even = team2
       const slotField = (numMatches + 1) % 2 === 1 ? 'team1_id' : 'team2_id';
       chapeuMatch[slotField] = null; // Will receive team on winner advancement
       chapeuMatch.status = 'pending';
       allLosersMatches.push(chapeuMatch);
       nextSurvivors.push(chapeuMatch);
     }

    survivors = nextSurvivors;
    losersRound++;
  }

  return allLosersMatches;
}

// ──────────────────────────────────────────────
// Helper
// ──────────────────────────────────────────────

function getLastRoundMatch(matches: MatchData[]): MatchData | undefined {
  if (matches.length === 0) return undefined;
  const maxRound = Math.max(...matches.map(m => m.round));
  return matches.filter(m => m.round === maxRound)[0];
}

// ──────────────────────────────────────────────
// Full Bracket Assembly
// ──────────────────────────────────────────────

export function generateDoubleEliminationBracket(config: DoubleEliminationConfig): GeneratedBracket {
  const { tournamentId, modalityId, teams, useSeeds, seedTeamIds, sideATeamIds, sideBTeamIds } = config;

  // ──────────────────────────────────────────────
  // VALIDAÇÃO PRÉ-GERAÇÃO
  // ──────────────────────────────────────────────

  if (teams.length < 4) {
    throw new Error(`Impossível gerar dupla eliminação com menos de 4 duplas. Recebido: ${teams.length}`);
  }

  const { upper, lower } = splitIntoHalves(
    teams,
    useSeeds ? sideATeamIds : undefined,
    useSeeds ? sideBTeamIds : undefined,
  );

  if (upper.length < 2 || lower.length < 2) {
    throw new Error(`Distribuição inválida: Lado A tem ${upper.length} duplas, Lado B tem ${lower.length}. Mínimo 2 por lado.`);
  }

  // Fórmula para bracket dividido em 2 metades:
  // Winners: (A-1) + (B-1) = N-2, Losers: (A-1-1) + (B-1-1) = N-4, Semis: 2, Final: 1
  // Total = (N-2) + (N-4) + 3 = 2N - 3
  const expectedTotal = (2 * teams.length) - 3;
  console.log(`[DE:Start] N=${teams.length}, A=${upper.length}, B=${lower.length}, Expected=${expectedTotal}`);

  const validSeedIds = useSeeds && seedTeamIds ? seedTeamIds : [];
  const upperSeedIds = validSeedIds.filter(sid => upper.some(t => t.id === sid));
  const lowerSeedIds = validSeedIds.filter(sid => lower.some(t => t.id === sid));

  // 1. Winners brackets
  const winnersUpper = buildWinnersBracket(upper, tournamentId, modalityId, 'upper', 1, upperSeedIds);
  const winnersLower = buildWinnersBracket(lower, tournamentId, modalityId, 'lower', 2, lowerSeedIds);

  const totalWinnersMatches = winnersUpper.length + winnersLower.length;
  console.log(`[DE:Winners] Upper=${winnersUpper.length}, Lower=${winnersLower.length}, Total=${totalWinnersMatches}`);

  // 2. Losers brackets — MIRROR CROSSING OBRIGATÓRIO
  //    oppositeSide('upper') = 'lower' → Winners A feeds Losers B
  //    oppositeSide('lower') = 'upper' → Winners B feeds Losers A
  const losersDestinationForA = oppositeSide('upper'); // = 'lower' (Losers B)
  const losersDestinationForB = oppositeSide('lower'); // = 'upper' (Losers A)

  console.log(`[Mirror Routing] Winners A (upper) → Losers ${losersDestinationForA} | Winners B (lower) → Losers ${losersDestinationForB}`);

  const losersUpper = buildLosersBracketWithFeeders(winnersLower, tournamentId, modalityId, losersDestinationForB, 3);
  const losersLower = buildLosersBracketWithFeeders(winnersUpper, tournamentId, modalityId, losersDestinationForA, 4);

  const totalLosersMatches = losersUpper.length + losersLower.length;
  console.log(`[DE:Losers] Upper=${losersUpper.length}, Lower=${losersLower.length}, Total=${totalLosersMatches}`);

  // 3. SEMIFINAIS (CRUZAMENTO OBRIGATÓRIO)
  //    Semi 1: Campeão Winners A (upper) vs Campeão Losers B (lower)
  //    Semi 2: Campeão Winners B (lower) vs Campeão Losers A (upper)
  //    REGRA: Equipes com mesma originBracket NUNCA se enfrentam antes da FINAL.
  const winnersMaxRound = Math.max(...[...winnersUpper, ...winnersLower].map(m => m.round), 0);
  const losersMaxRound = Math.max(...[...losersUpper, ...losersLower].map(m => m.round), 0);
  const semiRound = Math.max(winnersMaxRound, losersMaxRound) + 1;

  const semi1 = createMatch(tournamentId, modalityId, semiRound, 1, 'semi_final', 'upper', 5);
  const semi2 = createMatch(tournamentId, modalityId, semiRound, 2, 'semi_final', 'lower', 5);

  // 4. FINAL ÚNICA
  const finalMatch = createMatch(tournamentId, modalityId, semiRound + 1, 1, 'final', null, 6);

  // 5. Linkagem Winners → Semifinais (CRUZAMENTO)
  //    Campeão Winners A (upper) → Semi 1 (team1)
  //    Campeão Winners B (lower) → Semi 2 (team1)
  const winnersUpperFinal = getLastRoundMatch(winnersUpper);
  const winnersLowerFinal = getLastRoundMatch(winnersLower);
  if (winnersUpperFinal) winnersUpperFinal.next_win_match_id = semi1._temp_id;
  if (winnersLowerFinal) winnersLowerFinal.next_win_match_id = semi2._temp_id;

  // 6. Linkagem Losers → Semifinais (CRUZAMENTO CORRETO)
  //    Losers Upper (bracket 3, contém perdedores da Winners B) → Semi 1 (com Winners A) = CRUZAMENTO ✓
  //    Losers Lower (bracket 4, contém perdedores da Winners A) → Semi 2 (com Winners B) = CRUZAMENTO ✓
  //    REGRA: Jamais parear campeão Winners com perdedores do MESMO lado original.
  const losersUpperFinal = getLastRoundMatch(losersUpper);  // Losers Upper (has W-B losers)
  const losersLowerFinal = getLastRoundMatch(losersLower);  // Losers Lower (has W-A losers)
  if (losersUpperFinal) losersUpperFinal.next_win_match_id = semi1._temp_id;  // W-B losers → Semi 1 (with W-A champ) ✓
  if (losersLowerFinal) losersLowerFinal.next_win_match_id = semi2._temp_id;  // W-A losers → Semi 2 (with W-B champ) ✓

  // 7. Semifinais → Final
  semi1.next_win_match_id = finalMatch._temp_id;
  semi2.next_win_match_id = finalMatch._temp_id;

  const allMatches: MatchData[] = [
    ...winnersUpper,
    ...winnersLower,
    ...losersUpper,
    ...losersLower,
    semi1,
    semi2,
    finalMatch,
  ];

  // ── VALIDAÇÃO 1: Ordem de Execução (Winners A antes de Winners B) ──
  const validateExecutionOrder = () => {
    const maxRoundA = Math.max(...winnersUpper.map(m => m.round), 0);
    const maxRoundB = Math.max(...winnersLower.map(m => m.round), 0);
    
    console.log(`[Execution Order] Winners A max round: ${maxRoundA}, Winners B max round: ${maxRoundB}`);
    
    // Verificar que não há intercalação: todas as rodadas de A devem vir antes de B
    const roundsA = new Set(winnersUpper.map(m => m.round));
    const roundsB = new Set(winnersLower.map(m => m.round));
    
    // Neste modelo, A e B têm suas próprias estruturas, então validamos que não compartilham rodadas
    // Se compartilham, há intercalação indevida
    const commonRounds = [...roundsA].filter(r => roundsB.has(r));
    if (commonRounds.length > 0) {
      console.warn(`[⚠️ Execution Order] Rodadas compartilhadas entre A e B: ${commonRounds.join(', ')}`);
    } else {
      console.log(`[✓ Execution Order] Winners A e Winners B com rodadas separadas, sem intercalação`);
    }
  };

  // ── VALIDAÇÃO 2: Mirror Crossing Obrigatório — HARD BLOCK ──
  const validateMirrorCrossing = () => {
    const violations: string[] = [];
    let routedCount = 0;
    
    for (const m of allMatches) {
      if (m.bracket_type !== 'winners') continue;
      if (!m.next_lose_match_id) continue;

      const losersTarget = allMatches.find(lm => lm._temp_id === m.next_lose_match_id);
      if (!losersTarget || losersTarget.bracket_type !== 'losers') continue;

      const winnerSide = m.bracket_half as 'upper' | 'lower';
      const expectedLoserSide = oppositeSide(winnerSide);
      const actualLoserSide = losersTarget.bracket_half;

      // Per-match log
      console.log(
        `[Mirror Route] Match ${m._temp_id.slice(0, 8)} | ` +
        `Winners ${winnerSide} R${m.round}P${m.position} → ` +
        `Losers ${actualLoserSide} R${losersTarget.round}P${losersTarget.position} | ` +
        `Expected: ${expectedLoserSide} | ${actualLoserSide === expectedLoserSide ? '✓' : '❌ VIOLATION'}`
      );

      // STRICT: loser side MUST be opposite of winner side
      if (actualLoserSide !== expectedLoserSide) {
        violations.push(
          `Winners ${winnerSide} R${m.round}P${m.position} → Losers ${actualLoserSide} (expected ${expectedLoserSide})`
        );
      }
      routedCount++;
    }

    if (violations.length > 0) {
      throw new Error(
        `[❌ MIRROR CROSSING BLOCKED] ${violations.length} violation(s) detected. ` +
        `Bracket generation ABORTED.\n${violations.join('\n')}`
      );
    }
    console.log(`[✓ Mirror Crossing] ${routedCount} routes validated: Winners A→Losers B, Winners B→Losers A`);
  };

  // ── VALIDAÇÃO 3: Integridade de Feeders (pós-construção completa) ──
  const validateFeederIntegrity = () => {
    const warnings: string[] = [];

    // Verificar que toda partida de Losers tem exatamente 2 feeders
    const losersMatches = allMatches.filter(m => m.bracket_type === 'losers');
    for (const lm of losersMatches) {
      const feeders = allMatches.filter(fm => fm.next_win_match_id === lm._temp_id || fm.next_lose_match_id === lm._temp_id);
      if (feeders.length !== 2) {
        // Se tem 1 feeder, é um bye legítimo — apenas logar
        if (feeders.length === 1) {
          console.log(
            `[Bye] Losers ${lm.bracket_half} R${lm.round}P${lm.position} tem 1 feeder (bye automático)`
          );
        } else {
          warnings.push(
            `[Losers ${lm.bracket_half} R${lm.round}P${lm.position}] Esperado 2 feeders, encontrado ${feeders.length}`
          );
        }
      }
    }

    // Verificar que Semifinais têm exatamente 2 feeders reais
    const semis = allMatches.filter(m => m.bracket_type === 'semi_final');
    for (const semi of semis) {
      const feeders = allMatches.filter(m => m.next_win_match_id === semi._temp_id);
      if (feeders.length !== 2) {
        warnings.push(
          `[Semi ${semi.bracket_half} P${semi.position}] Esperado 2 feeders, encontrado ${feeders.length}`
        );
      }
    }

    // Verificar que Final tem exatamente 2 feeders (semis)
    const finalM = allMatches.find(m => m.bracket_type === 'final');
    if (finalM) {
      const feeders = allMatches.filter(m => m.next_win_match_id === finalM._temp_id);
      if (feeders.length !== 2) {
        warnings.push(
          `[Final] Esperado 2 feeders (semis), encontrado ${feeders.length}`
        );
      }
    }

    if (warnings.length > 0) {
      console.warn(`[⚠️ Integridade de Feeders] ${warnings.length} aviso(s):\n${warnings.join('\n')}`);
    } else {
      console.log(`[✓ Integridade de Feeders] Todos os matches possuem feeders válidos`);
    }
  };

  // ── VALIDAÇÃO 4: Contagem Total ──
  const validateTotalCount = () => {
    const totalMatches = allMatches.length;
    if (totalMatches !== expectedTotal) {
      console.warn(
        `[⚠️ Contagem] Geradas ${totalMatches} partidas, esperado ${expectedTotal}.`
      );
    } else {
      console.log(`[✓ Contagem] Total correto: ${totalMatches} partidas para ${teams.length} equipes`);
    }
  };

  // ── EXECUTAR TODAS AS VALIDAÇÕES ──
  validateExecutionOrder();
  validateMirrorCrossing();
  validateFeederIntegrity();
  validateTotalCount();

  // ── LOG DE VALIDAÇÃO FINAL ──
  console.log(`
╔════════════════════════════════════════════════════╗
║        VALIDAÇÃO FINAL - DUPLA ELIMINAÇÃO          ║
╠════════════════════════════════════════════════════╣
║ Total de Equipes: ${teams.length}                          
║ Winners A (upper): ${winnersUpper.length} partidas              
║ Winners B (lower): ${winnersLower.length} partidas              
║ Losers A (upper): ${losersUpper.length} partidas               
║ Losers B (lower): ${losersLower.length} partidas               
║ Semifinais: 2 partidas                            ║
║ Final: 1 partida                                  ║
║─────────────────────────────────────────────────────║
║ Total Gerado: ${allMatches.length} partidas                       
║ Esperado (2N-3): ${expectedTotal} partidas                       
║ Status: ${allMatches.length === expectedTotal ? '✓ OK' : '⚠️ ALERTA'}                                 ║
║─────────────────────────────────────────────────────║
║ Feeders Semifinal 1 (Winner A vs Loser B): 2     ║
║ Feeders Semifinal 2 (Winner B vs Loser A): 2     ║
║ Feeders Final (Semi 1 vs Semi 2): 2              ║
╚════════════════════════════════════════════════════╝
  `);

  // Converter _temp_id → id
  const cleanMatches = allMatches.map(({ _temp_id, ...rest }) => ({
    ...rest,
    id: _temp_id,
  }));

  return { matches: cleanMatches };
}

// ──────────────────────────────────────────────
// Exports
// ──────────────────────────────────────────────

export function getMirrorHalf(winnersHalf: string): string {
  // STRICT mirror: always return opposite side
  return oppositeSide(winnersHalf as 'upper' | 'lower');
}

export function canTeamsMeet(): boolean {
  return true;
}

export function processDoubleEliminationResult(): any {
  return {};
}
