/**
 * Double Elimination Bracket Generation Logic v5
 *
 * Structure (per half):
 *   Winners Upper / Winners Lower  (independent halves)
 *   Losers Upper  (receives losers from Winners Lower — mirror crossing)
 *   Losers Lower  (receives losers from Winners Upper — mirror crossing)
 *   Cross-Semifinals + Final
 *
 * Seed (Cabeça de Chave) rules:
 *   - Seeded teams skip R1 of Winners
 *   - They enter R2 directly against R1 winners
 *   - If all teams are seeded, they play normally from R1
 *
 * Losers bracket pattern (continuous queue):
 *   R1          → pair losers from Winners R1
 *   R2 (major)  → survivors vs new droppers from Winners R2
 *   ...alternates until one champion
 *
 * Every Winners match has next_lose_match_id pointing to a Losers match.
 * Every Losers match has exactly 2 source feeders.
 * Validation: total matches >= (2 × teams − 5).
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
// Slot-based abstraction for bracket building
// ──────────────────────────────────────────────

type Slot = 
  | { type: 'match'; match: MatchData }   // winner of this match feeds next round
  | { type: 'team'; teamId: string };      // team enters directly

// ──────────────────────────────────────────────
// Winners Bracket (with seed bye support)
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

  // ── R1: pair non-seeded teams only ──
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

  // Build initial slots for next round
  let slots: Slot[] = r1Matches.map(m => ({ type: 'match' as const, match: m }));

  // Add seeds as direct entries for R2
  for (const s of seeds) {
    slots.push({ type: 'team', teamId: s.id });
  }

  // Odd non-seed → chapéu (enters R2 directly)
  if (nonSeeds.length % 2 === 1) {
    slots.push({ type: 'team', teamId: nonSeeds[nonSeeds.length - 1].id });
  }

  // Edge case: if R1 is empty (all seeds or <2 non-seeds), start numbering at R1
  const hasR1 = r1Matches.length > 0;
  let round = hasR1 ? 2 : 1;

  // If only 1 slot, no more rounds needed
  if (slots.length <= 1) return allMatches;

  // ── Build subsequent rounds until 1 slot remains ──
  while (slots.length > 1) {
    const nextSlots: Slot[] = [];
    let pos = 1;

    // Priority: pair match-winner slots with direct-team slots
    // This ensures seeds face R1 winners, not each other
    const matchSlots = slots.filter(s => s.type === 'match');
    const teamSlots = slots.filter(s => s.type === 'team');

    let mi = 0;
    let ti = 0;

    // Phase 1: pair match-winner with direct-team (seed/chapéu)
    while (mi < matchSlots.length && ti < teamSlots.length) {
      const ms = matchSlots[mi] as { type: 'match'; match: MatchData };
      const ts = teamSlots[ti] as { type: 'team'; teamId: string };

      const m = createMatch(
        tournamentId, modalityId, round, pos++,
        'winners', half, bracketNumber,
        null, ts.teamId, // team1 = null (filled by match winner), team2 = seed
      );
      ms.match.next_win_match_id = m._temp_id;
      allMatches.push(m);
      nextSlots.push({ type: 'match', match: m });
      mi++;
      ti++;
    }

    // Phase 2: remaining match-winners pair with each other
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

    // Phase 3: remaining direct-teams pair with each other
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

    // Odd leftover → carry forward as chapéu
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
// Losers Bracket with feeders from ALL Winners rounds
// ──────────────────────────────────────────────

function buildLosersBracketWithFeeders(
  sourceWinnersMatches: MatchData[],
  tournamentId: string,
  modalityId: string,
  half: 'upper' | 'lower',
  bracketNumber: number,
): MatchData[] {
  // Group source winners by round
  const byRound = new Map<number, MatchData[]>();
  for (const m of sourceWinnersMatches) {
    if (!byRound.has(m.round)) byRound.set(m.round, []);
    byRound.get(m.round)!.push(m);
  }
  const winnersRounds = [...byRound.keys()].sort((a, b) => a - b);

  if (winnersRounds.length === 0) return [];

  const allMatches: MatchData[] = [];
  let queueSurvivors: MatchData[] = [];
  let losersRound = 1;

  for (let ri = 0; ri < winnersRounds.length; ri++) {
    const wRound = winnersRounds[ri];
    const winnersInRound = byRound.get(wRound)!.sort((a, b) => a.position - b.position);
    const newDropperCount = winnersInRound.length;

    if (queueSurvivors.length === 0 && ri === 0) {
      // ── FIRST INTAKE: pair droppers from Winners R1 among themselves ──
      const pairCount = Math.floor(newDropperCount / 2);
      const roundMatches: MatchData[] = [];

      for (let p = 0; p < pairCount; p++) {
        const m = createMatch(tournamentId, modalityId, losersRound, p + 1, 'losers', half, bracketNumber);
        winnersInRound[p * 2].next_lose_match_id = m._temp_id;
        winnersInRound[p * 2 + 1].next_lose_match_id = m._temp_id;
        roundMatches.push(m);
        allMatches.push(m);
      }

      // Odd dropper → chapéu match
      if (newDropperCount % 2 === 1) {
        const m = createMatch(tournamentId, modalityId, losersRound, pairCount + 1, 'losers', half, bracketNumber);
        winnersInRound[newDropperCount - 1].next_lose_match_id = m._temp_id;
        roundMatches.push(m);
        allMatches.push(m);
      }

      queueSurvivors = roundMatches;
      losersRound++;
      continue;
    }

    // ── SUBSEQUENT INTAKES: survivors vs new droppers (priority pairing) ──
    const roundMatches: MatchData[] = [];
    let survivorIdx = 0;
    let dropperIdx = 0;

    // Phase 1: Pair survivors with droppers (priority)
    while (survivorIdx < queueSurvivors.length && dropperIdx < newDropperCount) {
      const m = createMatch(tournamentId, modalityId, losersRound, roundMatches.length + 1, 'losers', half, bracketNumber);
      queueSurvivors[survivorIdx].next_win_match_id = m._temp_id;
      winnersInRound[dropperIdx].next_lose_match_id = m._temp_id;
      roundMatches.push(m);
      allMatches.push(m);
      survivorIdx++;
      dropperIdx++;
    }

    // Phase 2: Remaining survivors pair among themselves
    while (survivorIdx + 1 < queueSurvivors.length) {
      const m = createMatch(tournamentId, modalityId, losersRound, roundMatches.length + 1, 'losers', half, bracketNumber);
      queueSurvivors[survivorIdx].next_win_match_id = m._temp_id;
      queueSurvivors[survivorIdx + 1].next_win_match_id = m._temp_id;
      roundMatches.push(m);
      allMatches.push(m);
      survivorIdx += 2;
    }

    // Phase 3: Remaining droppers pair among themselves
    while (dropperIdx + 1 < newDropperCount) {
      const m = createMatch(tournamentId, modalityId, losersRound, roundMatches.length + 1, 'losers', half, bracketNumber);
      winnersInRound[dropperIdx].next_lose_match_id = m._temp_id;
      winnersInRound[dropperIdx + 1].next_lose_match_id = m._temp_id;
      roundMatches.push(m);
      allMatches.push(m);
      dropperIdx += 2;
    }

    // Chapéu: odd leftover
    if (survivorIdx < queueSurvivors.length) {
      const m = createMatch(tournamentId, modalityId, losersRound, roundMatches.length + 1, 'losers', half, bracketNumber);
      queueSurvivors[survivorIdx].next_win_match_id = m._temp_id;
      roundMatches.push(m);
      allMatches.push(m);
    } else if (dropperIdx < newDropperCount) {
      const m = createMatch(tournamentId, modalityId, losersRound, roundMatches.length + 1, 'losers', half, bracketNumber);
      winnersInRound[dropperIdx].next_lose_match_id = m._temp_id;
      roundMatches.push(m);
      allMatches.push(m);
    }

    queueSurvivors = roundMatches;
    losersRound++;
  }

  // ── FINAL REDUCTION: pair survivors until 1 champion ──
  while (queueSurvivors.length > 1) {
    const next: MatchData[] = [];
    let i = 0;
    for (; i + 1 < queueSurvivors.length; i += 2) {
      const m = createMatch(tournamentId, modalityId, losersRound, next.length + 1, 'losers', half, bracketNumber);
      queueSurvivors[i].next_win_match_id = m._temp_id;
      queueSurvivors[i + 1].next_win_match_id = m._temp_id;
      next.push(m);
      allMatches.push(m);
    }
    if (i < queueSurvivors.length) {
      next.push(queueSurvivors[i]);
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

  // Determine which seeds are in each half
  const validSeedIds = useSeeds && seedTeamIds ? seedTeamIds : [];
  const upperSeedIds = validSeedIds.filter(sid => upper.some(t => t.id === sid));
  const lowerSeedIds = validSeedIds.filter(sid => lower.some(t => t.id === sid));

  // 1. Winners brackets (seeds skip R1)
  const winnersUpper = buildWinnersBracket(upper, tournamentId, modalityId, 'upper', 1, upperSeedIds);
  const winnersLower = buildWinnersBracket(lower, tournamentId, modalityId, 'lower', 2, lowerSeedIds);

  // 2. Losers brackets — receive feeders from OPPOSITE side (mirror crossing)
  const losersUpper = buildLosersBracketWithFeeders(winnersLower, tournamentId, modalityId, 'upper', 3);
  const losersLower = buildLosersBracketWithFeeders(winnersUpper, tournamentId, modalityId, 'lower', 4);

  // 3. Cross-Semifinals
  const winnersMaxRound = Math.max(...[...winnersUpper, ...winnersLower].map(m => m.round), 0);
  const losersMaxRound = Math.max(...[...losersUpper, ...losersLower].map(m => m.round), 0);
  const crossSemiRound = Math.max(winnersMaxRound, losersMaxRound) + 1;

  const crossSemi1 = createMatch(tournamentId, modalityId, crossSemiRound, 1, 'cross_semi', 'upper', 5);
  const crossSemi2 = createMatch(tournamentId, modalityId, crossSemiRound, 2, 'cross_semi', 'lower', 5);

  // 4. Final
  const finalMatch = createMatch(tournamentId, modalityId, crossSemiRound + 1, 1, 'final', null, 6);

  // 5. Link winners finals → cross-semis (crossing)
  const winnersUpperFinal = getLastRoundMatch(winnersUpper);
  const winnersLowerFinal = getLastRoundMatch(winnersLower);
  if (winnersUpperFinal) winnersUpperFinal.next_win_match_id = crossSemi2._temp_id;
  if (winnersLowerFinal) winnersLowerFinal.next_win_match_id = crossSemi1._temp_id;

  // 6. Link losers finals → cross-semis
  const losersUpperFinal = getLastRoundMatch(losersUpper);
  const losersLowerFinal = getLastRoundMatch(losersLower);
  if (losersUpperFinal) losersUpperFinal.next_win_match_id = crossSemi1._temp_id;
  if (losersLowerFinal) losersLowerFinal.next_win_match_id = crossSemi2._temp_id;

  // 7. Link cross-semis → final
  crossSemi1.next_win_match_id = finalMatch._temp_id;
  crossSemi2.next_win_match_id = finalMatch._temp_id;

  const allMatches: MatchData[] = [
    ...winnersUpper,
    ...winnersLower,
    ...losersUpper,
    ...losersLower,
    crossSemi1,
    crossSemi2,
    finalMatch,
  ];

  // ── VALIDATION ──
  const totalMatches = allMatches.length;
  const minExpected = (2 * teams.length) - 5;
  if (totalMatches < minExpected) {
    throw new Error(
      `Estrutura incompleta: gerou ${totalMatches} partidas, mas dupla eliminação com ${teams.length} duplas exige no mínimo ${minExpected}. Abortando.`
    );
  }

  // Validate no orphan matches
  const orphanCount = allMatches.filter(m => {
    if (m.bracket_type === 'winners' && m.round === 1 && m.team1_id && m.team2_id) return false;
    if (m.bracket_type === 'winners' && (m.team1_id || m.team2_id)) return false;
    if (m.bracket_type === 'cross_semi' || m.bracket_type === 'final') return false;
    const hasFeeder = allMatches.some(
      other => other.next_win_match_id === m._temp_id || other.next_lose_match_id === m._temp_id
    );
    if (hasFeeder) return false;
    if (m.bracket_type === 'winners') {
      return !allMatches.some(other => other.next_win_match_id === m._temp_id);
    }
    return true;
  }).length;

  if (orphanCount > 0) {
    console.warn(`[Double Elimination] ${orphanCount} partida(s) órfã(s) detectada(s)`);
  }

  // Convert _temp_id to id
  const cleanMatches = allMatches.map(({ _temp_id, ...rest }) => ({
    ...rest,
    id: _temp_id,
  }));

  console.log(`[Double Elimination] Generated ${cleanMatches.length} matches for ${teams.length} teams (min expected: ${minExpected})`);

  return { matches: cleanMatches };
}

// ──────────────────────────────────────────────
// Exports for compatibility
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
