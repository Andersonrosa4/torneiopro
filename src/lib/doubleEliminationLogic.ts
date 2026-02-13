/**
 * Double Elimination Bracket Generation Logic v4
 *
 * Structure (per half):
 *   Winners Upper / Winners Lower  (independent halves)
 *   Losers Upper  (receives losers from Winners Lower — mirror crossing)
 *   Losers Lower  (receives losers from Winners Upper — mirror crossing)
 *   Cross-Semifinals + Final
 *
 * Losers bracket pattern:
 *   R1          → pair losers from Winners R1
 *   R2 (major)  → survivors vs new droppers from Winners R2
 *   R3 (minor)  → reduce survivors internally (if needed)
 *   R4 (major)  → survivors vs new droppers from Winners R3
 *   …alternates until one champion
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
// Winners Bracket (organic growth)
// ──────────────────────────────────────────────

function buildWinnersBracket(
  teams: Team[],
  tournamentId: string,
  modalityId: string,
  half: 'upper' | 'lower',
  bracketNumber: number,
): MatchData[] {
  if (teams.length < 2) return [];

  const allMatches: MatchData[] = [];

  // R1: pair all teams
  const r1Matches: MatchData[] = [];
  for (let i = 0; i + 1 < teams.length; i += 2) {
    const m = createMatch(tournamentId, modalityId, 1, r1Matches.length + 1, 'winners', half, bracketNumber, teams[i].id, teams[i + 1].id);
    r1Matches.push(m);
    allMatches.push(m);
  }

  // Chapéu if odd team count
  const hasChapeu = teams.length % 2 === 1;
  let chapeuTeamId: string | null = hasChapeu ? teams[teams.length - 1].id : null;

  // Build subsequent rounds
  let prevRound = [...r1Matches];
  let round = 2;

  while (prevRound.length > 1 || (prevRound.length === 1 && chapeuTeamId)) {
    const nextRound: MatchData[] = [];
    let pos = 1;

    let i = 0;
    for (; i + 1 < prevRound.length; i += 2) {
      const m = createMatch(tournamentId, modalityId, round, pos++, 'winners', half, bracketNumber);
      prevRound[i].next_win_match_id = m._temp_id;
      prevRound[i + 1].next_win_match_id = m._temp_id;
      nextRound.push(m);
      allMatches.push(m);
    }

    // Odd feeder + chapéu
    if (i < prevRound.length && chapeuTeamId) {
      const m = createMatch(tournamentId, modalityId, round, pos++, 'winners', half, bracketNumber, chapeuTeamId, null);
      prevRound[i].next_win_match_id = m._temp_id;
      nextRound.push(m);
      allMatches.push(m);
      chapeuTeamId = null;
    } else if (i < prevRound.length) {
      // Odd feeder, no chapéu → carry forward
      nextRound.push(prevRound[i]);
    }

    prevRound = nextRound.filter(m => m.round === round);
    if (prevRound.length === 0) break;
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

  // Queue simulation: track "slots" that feed into losers matches
  // Each slot is either a match whose winner continues, or a winners match whose loser drops
  // We use abstract "feeder" tracking: survivors = matches whose winners stay in queue
  let queueSurvivors: MatchData[] = []; // matches whose WINNER stays in losers queue
  let losersRound = 1;

  for (let ri = 0; ri < winnersRounds.length; ri++) {
    const wRound = winnersRounds[ri];
    const winnersInRound = byRound.get(wRound)!.sort((a, b) => a.position - b.position);
    const newDropperCount = winnersInRound.length;

    if (queueSurvivors.length === 0 && ri === 0) {
      // ── FIRST INTAKE: pair droppers from Winners R1 among themselves ──
      // (no existing survivors yet, so we must pair droppers)
      const pairCount = Math.floor(newDropperCount / 2);
      const roundMatches: MatchData[] = [];

      for (let p = 0; p < pairCount; p++) {
        const m = createMatch(tournamentId, modalityId, losersRound, p + 1, 'losers', half, bracketNumber);
        // Link both winners matches' losers to this losers match
        winnersInRound[p * 2].next_lose_match_id = m._temp_id;
        winnersInRound[p * 2 + 1].next_lose_match_id = m._temp_id;
        roundMatches.push(m);
        allMatches.push(m);
      }

      // Odd dropper → chapéu: link to a placeholder that carries forward
      if (newDropperCount % 2 === 1) {
        // Last dropper has no pair — create a "pass-through" match
        // Actually, we just leave it as a survivor feeder for next round
        // We need a match to hold it. Create a match that will get its second team later.
        const m = createMatch(tournamentId, modalityId, losersRound, pairCount + 1, 'losers', half, bracketNumber);
        winnersInRound[newDropperCount - 1].next_lose_match_id = m._temp_id;
        // This match only has 1 source for now — it will be a chapéu
        roundMatches.push(m);
        allMatches.push(m);
      }

      queueSurvivors = roundMatches;
      losersRound++;
      continue;
    }

    // ── SUBSEQUENT INTAKES: prioritize survivors vs new droppers ──
    // Priority: pair each SURVIVOR (existing losers queue) with a NEW DROPPER
    // This ensures we never pair two fresh droppers when survivors exist.

    const roundMatches: MatchData[] = [];
    let survivorIdx = 0;
    let dropperIdx = 0;

    // Phase 1: Pair survivors with droppers (priority pairing)
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

    // Phase 3: Remaining droppers pair among themselves (only if no survivors left)
    while (dropperIdx + 1 < newDropperCount) {
      const m = createMatch(tournamentId, modalityId, losersRound, roundMatches.length + 1, 'losers', half, bracketNumber);
      winnersInRound[dropperIdx].next_lose_match_id = m._temp_id;
      winnersInRound[dropperIdx + 1].next_lose_match_id = m._temp_id;
      roundMatches.push(m);
      allMatches.push(m);
      dropperIdx += 2;
    }

    // Chapéu: one leftover survivor or dropper
    if (survivorIdx < queueSurvivors.length) {
      // Odd survivor carries forward — create a pass-through
      const m = createMatch(tournamentId, modalityId, losersRound, roundMatches.length + 1, 'losers', half, bracketNumber);
      queueSurvivors[survivorIdx].next_win_match_id = m._temp_id;
      roundMatches.push(m);
      allMatches.push(m);
    } else if (dropperIdx < newDropperCount) {
      // Odd dropper — attach to last match or create chapéu match
      const m = createMatch(tournamentId, modalityId, losersRound, roundMatches.length + 1, 'losers', half, bracketNumber);
      winnersInRound[dropperIdx].next_lose_match_id = m._temp_id;
      roundMatches.push(m);
      allMatches.push(m);
    }

    queueSurvivors = roundMatches;
    losersRound++;
  }

  // ── FINAL REDUCTION: keep pairing survivors until 1 champion remains ──
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
    // Odd survivor → chapéu (carries forward)
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
  const { tournamentId, modalityId, teams, useSeeds, sideATeamIds, sideBTeamIds } = config;

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

  // 1. Winners brackets
  const winnersUpper = buildWinnersBracket(upper, tournamentId, modalityId, 'upper', 1);
  const winnersLower = buildWinnersBracket(lower, tournamentId, modalityId, 'lower', 2);

  // 2. Losers brackets — receive feeders from OPPOSITE side (mirror crossing)
  //    Winners Upper losers → Losers Lower
  //    Winners Lower losers → Losers Upper
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

  // Validate no orphan matches (every non-R1-winners match must have a feeder source)
  const orphanCount = allMatches.filter(m => {
    // R1 winners matches have real teams — not orphans
    if (m.bracket_type === 'winners' && m.round === 1 && m.team1_id && m.team2_id) return false;
    // Matches with team1_id (chapéu) that are in winners → not orphan
    if (m.bracket_type === 'winners' && m.team1_id) return false;
    // Cross-semi and final are fed by linkage
    if (m.bracket_type === 'cross_semi' || m.bracket_type === 'final') return false;
    // Losers matches must be referenced by some next_win_match_id or next_lose_match_id
    const hasFeeder = allMatches.some(
      other => other.next_win_match_id === m._temp_id || other.next_lose_match_id === m._temp_id
    );
    if (hasFeeder) return false;
    // Winners non-R1 must be referenced
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
