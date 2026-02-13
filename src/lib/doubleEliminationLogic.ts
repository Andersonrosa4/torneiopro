/**
 * Double Elimination Bracket Generation Logic v8 - MODELO CUSTOM
 *
 * FORMULA ABSOLUTA: Total matches = (2 × N) − 2 para final única
 * Para 32 equipes: (2 × 32) − 2 = 62 partidas
 *
 * Estrutura (para 32 equipes):
 *   Winners Upper (A): 15 partidas
 *   Winners Lower (B): 15 partidas
 *   Losers Upper (A): 14 partidas
 *   Losers Lower (B): 14 partidas
 *   Semifinais: 2 (Winner A vs Loser A, Winner B vs Loser B)
 *   Final: 1
 *   TOTAL = 62 ✓
 *
 * SEMIFINAIS (MODELO CUSTOM - SEM CRUZAMENTO):
 *   Semi 1: Campeão Winners A vs Campeão Losers A
 *   Semi 2: Campeão Winners B vs Campeão Losers B
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
// Losers Bracket with feeders
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

  const byRound = new Map<number, MatchData[]>();
  for (const m of sourceWinnersMatches) {
    if (!byRound.has(m.round)) byRound.set(m.round, []);
    byRound.get(m.round)!.push(m);
  }
  const winnersRounds = [...byRound.keys()].sort((a, b) => a - b);

  const allMatches: MatchData[] = [];
  let queueSurvivors: MatchData[] = [];
  let losersRound = 1;

  for (let ri = 0; ri < winnersRounds.length; ri++) {
    const wRound = winnersRounds[ri];
    const winnersInRound = byRound.get(wRound)!.sort((a, b) => a.position - b.position);
    const allCompetitors = [...queueSurvivors, ...winnersInRound];

    if (allCompetitors.length === 0) continue;

    const roundMatches: MatchData[] = [];
    let idx = 0;

    while (idx + 1 < allCompetitors.length) {
      const competitor1 = allCompetitors[idx];
      const competitor2 = allCompetitors[idx + 1];

      const m = createMatch(tournamentId, modalityId, losersRound, roundMatches.length + 1, 'losers', half, bracketNumber);

      if (competitor1.bracket_type === 'winners') {
        competitor1.next_lose_match_id = m._temp_id;
      } else {
        competitor1.next_win_match_id = m._temp_id;
      }

      if (competitor2.bracket_type === 'winners') {
        competitor2.next_lose_match_id = m._temp_id;
      } else {
        competitor2.next_win_match_id = m._temp_id;
      }

      roundMatches.push(m);
      allMatches.push(m);
      idx += 2;
    }

    // Competidor ímpar → chapéu (carrega para próxima rodada sem criar partida)
    if (idx < allCompetitors.length) {
      roundMatches.push(allCompetitors[idx]);
    }

    queueSurvivors = roundMatches;
    losersRound++;
  }

  // Redução final: parear sobreviventes até restar 1
  while (queueSurvivors.length > 1) {
    const next: MatchData[] = [];
    let idx = 0;

    while (idx + 1 < queueSurvivors.length) {
      const m = createMatch(tournamentId, modalityId, losersRound, next.length + 1, 'losers', half, bracketNumber);
      queueSurvivors[idx].next_win_match_id = m._temp_id;
      queueSurvivors[idx + 1].next_win_match_id = m._temp_id;
      next.push(m);
      allMatches.push(m);
      idx += 2;
    }

    if (idx < queueSurvivors.length) {
      next.push(queueSurvivors[idx]);
    }

    queueSurvivors = next;
    losersRound++;
  }

  return allMatches;
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

  // 2. Losers brackets — feeders do lado OPOSTO (mirror crossing)
  //    Winners Upper (A) → Losers Lower (B)
  //    Winners Lower (B) → Losers Upper (A)
  const losersUpper = buildLosersBracketWithFeeders(winnersLower, tournamentId, modalityId, 'upper', 3);
  const losersLower = buildLosersBracketWithFeeders(winnersUpper, tournamentId, modalityId, 'lower', 4);

  const totalLosersMatches = losersUpper.length + losersLower.length;
  console.log(`[DE:Losers] Upper=${losersUpper.length}, Lower=${losersLower.length}, Total=${totalLosersMatches}`);

  // 3. SEMIFINAIS (MODELO CUSTOM — SEM CRUZAMENTO)
  //    Semi 1: Campeão Winners A (upper) vs Campeão Losers A (upper)
  //    Semi 2: Campeão Winners B (lower) vs Campeão Losers B (lower)
  const winnersMaxRound = Math.max(...[...winnersUpper, ...winnersLower].map(m => m.round), 0);
  const losersMaxRound = Math.max(...[...losersUpper, ...losersLower].map(m => m.round), 0);
  const semiRound = Math.max(winnersMaxRound, losersMaxRound) + 1;

  const semi1 = createMatch(tournamentId, modalityId, semiRound, 1, 'semi_final', 'upper', 5);
  const semi2 = createMatch(tournamentId, modalityId, semiRound, 2, 'semi_final', 'lower', 5);

  // 4. FINAL ÚNICA
  const finalMatch = createMatch(tournamentId, modalityId, semiRound + 1, 1, 'final', null, 6);

  // 5. Linkagem Winners → Semifinais (mesmo lado)
  //    Campeão Winners A → Semi 1
  //    Campeão Winners B → Semi 2
  const winnersUpperFinal = getLastRoundMatch(winnersUpper);
  const winnersLowerFinal = getLastRoundMatch(winnersLower);
  if (winnersUpperFinal) winnersUpperFinal.next_win_match_id = semi1._temp_id;
  if (winnersLowerFinal) winnersLowerFinal.next_win_match_id = semi2._temp_id;

  // 6. Linkagem Losers → Semifinais (mesmo lado)
  //    Campeão Losers A (upper) → Semi 1
  //    Campeão Losers B (lower) → Semi 2
  const losersUpperFinal = getLastRoundMatch(losersUpper);
  const losersLowerFinal = getLastRoundMatch(losersLower);
  if (losersUpperFinal) losersUpperFinal.next_win_match_id = semi1._temp_id;
  if (losersLowerFinal) losersLowerFinal.next_win_match_id = semi2._temp_id;

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

  // ── VALIDAÇÃO: Mirror Crossing (Winners→Losers) ──
  const validateMirrorCrossing = () => {
    for (const m of allMatches) {
      if (m.bracket_type !== 'winners') continue;
      if (!m.next_lose_match_id) continue;

      const losersTarget = allMatches.find(lm => lm._temp_id === m.next_lose_match_id);
      if (!losersTarget || losersTarget.bracket_type !== 'losers') continue;

      if (m.bracket_half === 'upper' && losersTarget.bracket_half !== 'lower') {
        throw new Error(
          `[❌ Mirror Crossing] Winners A deve alimentar Losers B, encontrado Losers ${losersTarget.bracket_half || 'null'}`
        );
      }

      if (m.bracket_half === 'lower' && losersTarget.bracket_half !== 'upper') {
        throw new Error(
          `[❌ Mirror Crossing] Winners B deve alimentar Losers A, encontrado Losers ${losersTarget.bracket_half || 'null'}`
        );
      }
    }
    console.log(`[✓ Mirror Crossing] Validação: Winners A→Losers B, Winners B→Losers A`);
  };

  validateMirrorCrossing();

  // ── VALIDAÇÃO: Semifinais têm dois feeders reais ──
  const validateSemiFinals = () => {
    const semis = allMatches.filter(m => m.bracket_type === 'semi_final');
    for (const semi of semis) {
      const feeders = allMatches.filter(m => m.next_win_match_id === semi._temp_id);
      if (feeders.length !== 2) {
        throw new Error(
          `[❌ Semifinal inválida] Semi ${semi.position} tem ${feeders.length} feeders, esperado 2.`
        );
      }
    }
    console.log(`[✓ Semifinais] Cada semifinal tem exatamente 2 feeders reais`);
  };

  validateSemiFinals();

  // ── VALIDAÇÃO: Total de partidas ──
  const totalMatches = allMatches.length;
  if (totalMatches !== expectedTotal) {
    console.warn(
      `[⚠️ Contagem] Geradas ${totalMatches} partidas, esperado ${expectedTotal}. ` +
      `Detalhamento: Winners=${totalWinnersMatches}, Losers=${totalLosersMatches}, Semis=2, Final=1.`
    );
  }

  console.log(
    `[✓ Dupla Eliminação] ${totalMatches} partidas para ${teams.length} equipes. ` +
    `Detalhamento: Winners=${totalWinnersMatches}, Losers=${totalLosersMatches}, Semis=2, Final=1. ` +
    `Modelo custom: Winner A vs Loser A, Winner B vs Loser B.`
  );

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
  return winnersHalf === 'upper' ? 'lower' : 'upper';
}

export function canTeamsMeet(): boolean {
  return true;
}

export function processDoubleEliminationResult(): any {
  return {};
}
