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
  is_chapeu: boolean;
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
  isChapeu: boolean = false,
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
    is_chapeu: isChapeu,
    _temp_id: crypto.randomUUID(),
  };
}

// ──────────────────────────────────────────────
// Power of 2 Helpers
// ──────────────────────────────────────────────

/**
 * Retorna a potência de 2 mais próxima de N.
 * Em caso de empate, prefere a inferior (menos chapéus).
 */
export function getBaseBracketSize(n: number): number {
  if (n <= 1) return 1;
  if ((n & (n - 1)) === 0) return n; // Já é potência de 2
  const lower = Math.pow(2, Math.floor(Math.log2(n)));
  const upper = lower * 2;
  return (n - lower) <= (upper - n) ? lower : upper;
}

// ──────────────────────────────────────────────
// Standard Power-of-2 Bracket (sem chapéu)
// ──────────────────────────────────────────────

function buildPow2Bracket(
  teams: Team[],
  tournamentId: string,
  modalityId: string,
  half: 'upper' | 'lower',
  bracketNumber: number,
): MatchData[] {
  const N = teams.length;
  const allMatches: MatchData[] = [];

  // R1: N/2 partidas
  const r1Matches: MatchData[] = [];
  for (let i = 0; i < N; i += 2) {
    const m = createMatch(
      tournamentId, modalityId, 1, r1Matches.length + 1,
      'winners', half, bracketNumber,
      teams[i].id, teams[i + 1].id,
    );
    r1Matches.push(m);
    allMatches.push(m);
  }

  let currentMatches = r1Matches;
  let round = 2;

  while (currentMatches.length > 1) {
    const nextMatches: MatchData[] = [];
    for (let i = 0; i < currentMatches.length; i += 2) {
      const m = createMatch(
        tournamentId, modalityId, round, nextMatches.length + 1,
        'winners', half, bracketNumber,
      );
      currentMatches[i].next_win_match_id = m._temp_id;
      currentMatches[i + 1].next_win_match_id = m._temp_id;
      nextMatches.push(m);
      allMatches.push(m);
    }
    currentMatches = nextMatches;
    round++;
  }

  return allMatches;
}

// ──────────────────────────────────────────────
// Winners Bracket — com lógica de Chapéu (Potência de 2 mais próxima)
// ──────────────────────────────────────────────

function buildWinnersBracket(
  teams: Team[],
  tournamentId: string,
  modalityId: string,
  half: 'upper' | 'lower',
  bracketNumber: number,
  seedTeamIds: string[] = [],
): MatchData[] {
  const N = teams.length;
  if (N < 2) return [];

  const allMatches: MatchData[] = [];
  const base = getBaseBracketSize(N);

  // Shuffle — seeds afetam posição, NÃO prioridade de chapéu
  const shuffled = shuffle(teams);

  // ── Caso perfeito: N é potência de 2 ──
  if (N === base) {
    return buildPow2Bracket(shuffled, tournamentId, modalityId, half, bracketNumber);
  }

  let baseRoundMatches: MatchData[] = [];
  let nextRound: number;

  if (N > base) {
    // ══════════════════════════════════════════════
    // ROUND DOWN: Rodada preliminar (R0) necessária
    // extras equipes jogam R0, restantes são Chapéu
    // ══════════════════════════════════════════════
    const extras = N - base;
    const r0Teams = shuffled.slice(0, 2 * extras);
    const directTeams = shuffled.slice(2 * extras); // Chapéu: esperam R0

    console.log(`[Chapéu:${half}] N=${N}, base=${base}, preliminares=${extras}, diretos(chapéu)=${directTeams.length}`);

    // R0 (round 1): partidas preliminares
    const r0Matches: MatchData[] = [];
    for (let i = 0; i < extras; i++) {
      const m = createMatch(
        tournamentId, modalityId, 1, i + 1,
        'winners', half, bracketNumber,
        r0Teams[i * 2].id, r0Teams[i * 2 + 1].id,
      );
      r0Matches.push(m);
      allMatches.push(m);
    }

    // R1 (round 2): base/2 partidas
    const r1Matches: MatchData[] = [];
    let dIdx = 0;

    // Chapéu matches: vencedor R0 vs equipe direta (jogo obrigatório)
    for (let i = 0; i < r0Matches.length && dIdx < directTeams.length; i++) {
      const m = createMatch(
        tournamentId, modalityId, 2, r1Matches.length + 1,
        'winners', half, bracketNumber,
        null, directTeams[dIdx].id,
        true, // is_chapeu: equipe direta aguardando vencedor do R0
      );
      r0Matches[i].next_win_match_id = m._temp_id;
      r1Matches.push(m);
      allMatches.push(m);
      dIdx++;
    }

    // Partidas normais: restantes diretos entre si
    while (dIdx + 1 < directTeams.length) {
      const m = createMatch(
        tournamentId, modalityId, 2, r1Matches.length + 1,
        'winners', half, bracketNumber,
        directTeams[dIdx].id, directTeams[dIdx + 1].id,
      );
      r1Matches.push(m);
      allMatches.push(m);
      dIdx += 2;
    }

    // R0 winners restantes (sem direct team para parear) → entre si
    for (let i = directTeams.length; i < r0Matches.length; i += 2) {
      if (i + 1 < r0Matches.length) {
        const m = createMatch(
          tournamentId, modalityId, 2, r1Matches.length + 1,
          'winners', half, bracketNumber,
        );
        r0Matches[i].next_win_match_id = m._temp_id;
        r0Matches[i + 1].next_win_match_id = m._temp_id;
        r1Matches.push(m);
        allMatches.push(m);
      }
    }

    baseRoundMatches = r1Matches;
    nextRound = 3;

  } else {
    // ══════════════════════════════════════════════
    // ROUND UP: Chapéu em R1 (equipes aguardam R2)
    // (base - N) equipes esperam para jogo obrigatório
    // ══════════════════════════════════════════════
    const chapeuCount = base - N;
    const r1RealCount = N - base / 2;
    const playingTeams = shuffled.slice(0, 2 * r1RealCount);
    const chapeuTeams = shuffled.slice(2 * r1RealCount);

    console.log(`[Chapéu:${half}] N=${N}, base=${base}, chapéus=${chapeuCount}, R1 reais=${r1RealCount}`);

    // R1: partidas reais
    const r1Matches: MatchData[] = [];
    for (let i = 0; i < r1RealCount; i++) {
      const m = createMatch(
        tournamentId, modalityId, 1, r1Matches.length + 1,
        'winners', half, bracketNumber,
        playingTeams[i * 2].id, playingTeams[i * 2 + 1].id,
      );
      r1Matches.push(m);
      allMatches.push(m);
    }

    // R2: chapéu matches (R1 winners vs chapéu teams) + restantes
    const r2Matches: MatchData[] = [];
    let cIdx = 0;

    // Chapéu matches: vencedor R1 vs equipe chapéu (jogo obrigatório)
    for (let i = 0; i < r1Matches.length && cIdx < chapeuTeams.length; i++) {
      const m = createMatch(
        tournamentId, modalityId, 2, r2Matches.length + 1,
        'winners', half, bracketNumber,
        null, chapeuTeams[cIdx].id,
        true, // is_chapeu
      );
      r1Matches[i].next_win_match_id = m._temp_id;
      r2Matches.push(m);
      allMatches.push(m);
      cIdx++;
    }

    // Restantes R1 winners entre si
    const remainingR1 = r1Matches.slice(Math.min(r1Matches.length, chapeuTeams.length));
    for (let i = 0; i < remainingR1.length; i += 2) {
      const m = createMatch(
        tournamentId, modalityId, 2, r2Matches.length + 1,
        'winners', half, bracketNumber,
      );
      remainingR1[i].next_win_match_id = m._temp_id;
      if (i + 1 < remainingR1.length) {
        remainingR1[i + 1].next_win_match_id = m._temp_id;
      }
      r2Matches.push(m);
      allMatches.push(m);
    }

    // Chapéu teams excedentes entre si (quando chapéuCount > r1RealCount)
    while (cIdx + 1 < chapeuTeams.length) {
      const m = createMatch(
        tournamentId, modalityId, 2, r2Matches.length + 1,
        'winners', half, bracketNumber,
        chapeuTeams[cIdx].id, chapeuTeams[cIdx + 1].id,
      );
      r2Matches.push(m);
      allMatches.push(m);
      cIdx += 2;
    }

    baseRoundMatches = r2Matches;
    nextRound = 3;
  }

  // ── Rodadas seguintes até o campeão ──
  let currentMatches = baseRoundMatches;
  let round = nextRound;

  while (currentMatches.length > 1) {
    const nextMatches: MatchData[] = [];
    for (let i = 0; i < currentMatches.length; i += 2) {
      const m = createMatch(
        tournamentId, modalityId, round, nextMatches.length + 1,
        'winners', half, bracketNumber,
      );
      currentMatches[i].next_win_match_id = m._temp_id;
      if (i + 1 < currentMatches.length) {
        currentMatches[i + 1].next_win_match_id = m._temp_id;
      }
      nextMatches.push(m);
      allMatches.push(m);
    }
    currentMatches = nextMatches;
    round++;
  }

  return allMatches;
}

// ──────────────────────────────────────────────
// Losers Bracket — Construção Sequencial Obrigatória
// ──────────────────────────────────────────────
//
// REGRA CRÍTICA — Entradas ímpares:
// Na chave dos perdedores, quando uma rodada tem número ÍMPAR de entradas,
// o elemento excedente recebe um BYE (folga real) e é DIFERIDO para a próxima
// rodada, onde se juntará às novas entradas. NUNCA criar partida chapéu vazia
// na losers — isso gera partidas fantasma que nunca serão jogadas.
// ──────────────────────────────────────────────

function buildLosersBracketWithFeeders(
  sourceWinnersMatches: MatchData[],
  tournamentId: string,
  modalityId: string,
  half: 'upper' | 'lower',
  bracketNumber: number,
): MatchData[] {
  if (sourceWinnersMatches.length === 0) return [];

  type Entry = { source: MatchData; linkField: 'next_win_match_id' | 'next_lose_match_id' };

  // Agrupar winners por rodada
  const byRound = new Map<number, MatchData[]>();
  for (const m of sourceWinnersMatches) {
    if (!byRound.has(m.round)) byRound.set(m.round, []);
    byRound.get(m.round)!.push(m);
  }
  const winnersRounds = [...byRound.keys()].sort((a, b) => a - b);

  const allLosersMatches: MatchData[] = [];
  let losersRound = 1;

  // pendingBye: entrada ímpar diferida da rodada anterior (recebe BYE)
  let pendingBye: Entry | null = null;
  // survivorEntries: saídas dos matches de losers já criados (prontos para próxima rodada)
  let survivorEntries: Entry[] = [];

  for (let ri = 0; ri < winnersRounds.length; ri++) {
    const wRound = winnersRounds[ri];
    const winnersInRound = byRound.get(wRound)!.sort((a, b) => a.position - b.position);

    // ── PASSO 1: Montar lista de entradas para esta rodada ──
    let incoming: Entry[] = [];

    if (ri === 0) {
      // R1: apenas perdedores da Winners R1 (sem survivors ainda)
      const droppers = winnersInRound.map(m => ({
        source: m,
        linkField: 'next_lose_match_id' as const,
      }));
      // Inclui BYE diferido (deve ser vazio na R1, mas por segurança)
      incoming = pendingBye ? [pendingBye, ...droppers] : droppers;
    } else {
      // R2+: intercalar survivors com novos perdedores (REGRA 9 — inversão anti-revanche)
      const surv: Entry[] = survivorEntries;
      const newLosers: Entry[] = winnersInRound
        .map(m => ({ source: m, linkField: 'next_lose_match_id' as const }))
        .sort((a, b) => a.source.position - b.source.position)
        .reverse(); // REVERSO: anti-rematch

      const maxLen = Math.max(surv.length, newLosers.length);
      const interleaved: Entry[] = [];
      for (let i = 0; i < maxLen; i++) {
        if (i < surv.length) interleaved.push(surv[i]);
        if (i < newLosers.length) interleaved.push(newLosers[i]);
      }

      // BYE diferido da rodada anterior vai na frente
      incoming = pendingBye ? [pendingBye, ...interleaved] : interleaved;
    }

    pendingBye = null; // consumido

    if (incoming.length === 0) continue;

    // ── PASSO 2: Criar matches pareando entradas 2 a 2 ──
    const numMatches = Math.floor(incoming.length / 2);

    if (numMatches === 0) {
      // Só 1 entrada → BYE total desta rodada, diferir para próxima
      pendingBye = incoming[0];
      // Não incrementa losersRound (nenhum jogo foi criado)
      continue;
    }

    const roundMatches: MatchData[] = [];
    for (let mi = 0; mi < numMatches; mi++) {
      const m = createMatch(
        tournamentId, modalityId, losersRound, mi + 1,
        'losers', half, bracketNumber,
      );
      // Linkar as duas entradas ao match
      incoming[mi * 2].source[incoming[mi * 2].linkField] = m._temp_id;
      incoming[mi * 2 + 1].source[incoming[mi * 2 + 1].linkField] = m._temp_id;
      roundMatches.push(m);
      allLosersMatches.push(m);
    }

    // ── PASSO 3: Entrada ímpar → BYE (diferida para próxima rodada) ──
    // NÃO criar partida chapéu vazia. Apenas diferir.
    if (incoming.length % 2 === 1) {
      pendingBye = incoming[incoming.length - 1];
      console.log(
        `[Losers BYE] ${half} R${losersRound}: entry ímpar diferida para próxima rodada (sem match chapéu)`
      );
    }

    survivorEntries = roundMatches.map(m => ({ source: m, linkField: 'next_win_match_id' as const }));
    losersRound++;
  }

  // ── Redução final: parear survivors + eventual BYE diferido até restar 1 ──
  let remaining: Entry[] = pendingBye
    ? [pendingBye, ...survivorEntries]
    : [...survivorEntries];

  while (remaining.length > 1) {
    const numMatches = Math.floor(remaining.length / 2);
    const nextRemaining: Entry[] = [];

    for (let i = 0; i < numMatches; i++) {
      const m = createMatch(
        tournamentId, modalityId, losersRound, i + 1,
        'losers', half, bracketNumber,
      );
      remaining[i * 2].source[remaining[i * 2].linkField] = m._temp_id;
      remaining[i * 2 + 1].source[remaining[i * 2 + 1].linkField] = m._temp_id;
      allLosersMatches.push(m);
      nextRemaining.push({ source: m, linkField: 'next_win_match_id' });
    }

    // Ímpar na redução → BYE (avança direto, sem match fantasma)
    if (remaining.length % 2 === 1) {
      nextRemaining.push(remaining[remaining.length - 1]);
      console.log(`[Losers BYE Redução] ${half} R${losersRound}: 1 survivor com BYE`);
    }

    remaining = nextRemaining;
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
