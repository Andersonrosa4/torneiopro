/**
 * Double Elimination Bracket Generation Logic v3 — Organic Growth
 * 
 * REGRAS:
 * 1. Partidas só existem se houver 2 feeders reais
 * 2. Número de rodadas calculado dinamicamente
 * 3. Sem potência de 2, sem rodadas fixas
 * 4. Árvore cresce organicamente conforme partidas existirem
 * 5. Perdedores dos Vencedores vão para Perdedores do lado oposto (cruzamento)
 * 6. Semifinais cruzadas + Final
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
// Organic Winners Bracket: pairs teams, then pairs winners
// Only creates a next-round match if there are 2 feeders
// ──────────────────────────────────────────────

function buildWinnersBracketOrganically(
  teams: Team[],
  tournamentId: string,
  modalityId: string,
  half: 'upper' | 'lower',
  bracketNumber: number,
): MatchData[] {
  if (teams.length < 2) return [];

  const allMatches: MatchData[] = [];

  // Round 1: pair all teams. If odd count, last team waits as a "pending feeder"
  const r1Matches: MatchData[] = [];
  let pos = 1;
  for (let i = 0; i + 1 < teams.length; i += 2) {
    const m = createMatch(tournamentId, modalityId, 1, pos++, 'winners', half, bracketNumber, teams[i].id, teams[i + 1].id);
    r1Matches.push(m);
    allMatches.push(m);
  }

  // If odd team count, the last team is a "chapéu" — it becomes a pending feeder for round 2
  const hasChapeu = teams.length % 2 === 1;
  const chapeuTeamId = hasChapeu ? teams[teams.length - 1].id : null;

  // Build subsequent rounds organically
  let currentRoundMatches = [...r1Matches];
  let chapeuPending = chapeuTeamId; // team waiting from odd split
  let round = 2;

  while (currentRoundMatches.length > 1 || (currentRoundMatches.length === 1 && chapeuPending)) {
    const nextRoundMatches: MatchData[] = [];
    let nextPos = 1;

    // Collect feeders: winners from current round
    const feeders: MatchData[] = [...currentRoundMatches];

    // Pair feeders into next round matches
    let i = 0;
    for (; i + 1 < feeders.length; i += 2) {
      const m = createMatch(tournamentId, modalityId, round, nextPos++, 'winners', half, bracketNumber);
      // Link feeders to this match
      feeders[i].next_win_match_id = m._temp_id;
      feeders[i + 1].next_win_match_id = m._temp_id;
      nextRoundMatches.push(m);
      allMatches.push(m);
    }

    // If odd feeder + chapéu pending, create match with chapéu team
    if (i < feeders.length && chapeuPending) {
      const m = createMatch(tournamentId, modalityId, round, nextPos++, 'winners', half, bracketNumber, chapeuPending, null);
      feeders[i].next_win_match_id = m._temp_id;
      nextRoundMatches.push(m);
      allMatches.push(m);
      chapeuPending = null;
    } else if (i < feeders.length) {
      // Odd feeder without chapéu — this feeder becomes the new chapéu
      chapeuPending = null; // The feeder match itself becomes a pending element
      // Just carry it forward
      nextRoundMatches.push(feeders[i]);
      // Don't add to allMatches again, it's already there
    } else if (chapeuPending && feeders.length === 0) {
      break; // Only chapéu left, nothing to pair
    }

    // If we only paired chapéu, and there's still only 1 match, add chapéu to it
    if (nextRoundMatches.length === 1 && chapeuPending) {
      nextRoundMatches[0].team1_id = chapeuPending;
      chapeuPending = null;
    }

    currentRoundMatches = nextRoundMatches.filter(m => m.round === round);
    if (currentRoundMatches.length === 0) break;
    round++;
  }

  return allMatches;
}

// ──────────────────────────────────────────────
// Organic Losers Bracket: receives losers from winners,
// pairs them dynamically. Only creates matches with 2 feeders.
// ──────────────────────────────────────────────

function buildLosersBracketOrganically(
  winnersR1MatchCount: number,
  tournamentId: string,
  modalityId: string,
  half: 'upper' | 'lower',
  bracketNumber: number,
): MatchData[] {
  // The losers bracket receives losers from the opposite winners bracket
  // R1 of losers: pairs losers from winners R1
  // Each subsequent round: pairs winners of previous losers round,
  // potentially with new losers dropping from higher winners rounds

  if (winnersR1MatchCount < 2) {
    // Only 1 match in winners = only 1 loser, not enough for a losers bracket
    // Create a single placeholder that will receive the loser
    const m = createMatch(tournamentId, modalityId, 1, 1, 'losers', half, bracketNumber);
    return [m];
  }

  const allMatches: MatchData[] = [];

  // R1: pair losers from winners R1 (winnersR1MatchCount losers available)
  const r1MatchCount = Math.floor(winnersR1MatchCount / 2);
  const r1Matches: MatchData[] = [];
  for (let p = 0; p < r1MatchCount; p++) {
    const m = createMatch(tournamentId, modalityId, 1, p + 1, 'losers', half, bracketNumber);
    r1Matches.push(m);
    allMatches.push(m);
  }

  // Build subsequent rounds organically
  let currentRoundMatches = [...r1Matches];
  let round = 2;

  while (currentRoundMatches.length > 1) {
    const nextCount = Math.floor(currentRoundMatches.length / 2);
    const nextMatches: MatchData[] = [];

    for (let i = 0; i < nextCount; i++) {
      const m = createMatch(tournamentId, modalityId, round, i + 1, 'losers', half, bracketNumber);
      currentRoundMatches[i * 2].next_win_match_id = m._temp_id;
      currentRoundMatches[i * 2 + 1].next_win_match_id = m._temp_id;
      nextMatches.push(m);
      allMatches.push(m);
    }

    // Odd match: carry forward (its winner advances alone next round)
    if (currentRoundMatches.length % 2 === 1) {
      nextMatches.push(currentRoundMatches[currentRoundMatches.length - 1]);
    }

    currentRoundMatches = nextMatches.filter(m => m.round === round);
    if (currentRoundMatches.length === 0) break;
    round++;
  }

  return allMatches;
}

// ──────────────────────────────────────────────
// Full Bracket Assembly
// ──────────────────────────────────────────────

export function generateDoubleEliminationBracket(config: DoubleEliminationConfig): GeneratedBracket {
  const { tournamentId, modalityId, teams, useSeeds, sideATeamIds, sideBTeamIds } = config;

  if (teams.length < 4) {
    throw new Error(`Impossível gerar chaveamento de dupla eliminação com menos de 4 duplas. Recebido: ${teams.length}`);
  }

  const { upper, lower } = splitIntoHalves(
    teams,
    useSeeds ? sideATeamIds : undefined,
    useSeeds ? sideBTeamIds : undefined,
  );

  if (upper.length < 2 || lower.length < 2) {
    throw new Error(`Distribuição inválida: Lado A tem ${upper.length} duplas, Lado B tem ${lower.length}. Mínimo 2 por lado.`);
  }

  // 1. Winners brackets — organic growth
  const winnersUpper = buildWinnersBracketOrganically(upper, tournamentId, modalityId, 'upper', 1);
  const winnersLower = buildWinnersBracketOrganically(lower, tournamentId, modalityId, 'lower', 2);

  // 2. Losers brackets — organic growth based on number of R1 winners matches
  const winnersUpperR1Count = winnersUpper.filter(m => m.round === 1).length;
  const winnersLowerR1Count = winnersLower.filter(m => m.round === 1).length;

  // Mirror crossing: Winners Upper losers → Losers Lower, Winners Lower losers → Losers Upper
  const losersUpper = buildLosersBracketOrganically(winnersLowerR1Count, tournamentId, modalityId, 'upper', 3);
  const losersLower = buildLosersBracketOrganically(winnersUpperR1Count, tournamentId, modalityId, 'lower', 4);

  // 3. Link Winners R1 losers → Losers R1 (mirror crossing)
  linkWinnersLosersToLosersBracket(winnersUpper, losersLower);
  linkWinnersLosersToLosersBracket(winnersLower, losersUpper);

  // 4. Cross-Semifinals
  const winnersMaxRound = Math.max(...[...winnersUpper, ...winnersLower].map(m => m.round), 0);
  const losersMaxRound = Math.max(...[...losersUpper, ...losersLower].map(m => m.round), 0);
  const crossSemiRound = Math.max(winnersMaxRound, losersMaxRound) + 1;

  const crossSemi1 = createMatch(tournamentId, modalityId, crossSemiRound, 1, 'cross_semi', 'upper', 5);
  const crossSemi2 = createMatch(tournamentId, modalityId, crossSemiRound, 2, 'cross_semi', 'lower', 5);

  // 5. Final
  const finalMatch = createMatch(tournamentId, modalityId, crossSemiRound + 1, 1, 'final', null, 6);

  // 6. Link winners finals → cross-semis (crossing)
  const winnersUpperFinal = getLastRoundMatch(winnersUpper);
  const winnersLowerFinal = getLastRoundMatch(winnersLower);
  if (winnersUpperFinal) winnersUpperFinal.next_win_match_id = crossSemi2._temp_id;
  if (winnersLowerFinal) winnersLowerFinal.next_win_match_id = crossSemi1._temp_id;

  // 7. Link losers finals → cross-semis
  const losersUpperFinal = getLastRoundMatch(losersUpper);
  const losersLowerFinal = getLastRoundMatch(losersLower);
  if (losersUpperFinal) losersUpperFinal.next_win_match_id = crossSemi1._temp_id;
  if (losersLowerFinal) losersLowerFinal.next_win_match_id = crossSemi2._temp_id;

  // 8. Link cross-semis → final
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

  // Convert _temp_id to id
  const cleanMatches = allMatches.map(({ _temp_id, ...rest }) => ({
    ...rest,
    id: _temp_id,
  }));

  console.log(`[Double Elimination] Generated ${cleanMatches.length} matches for ${teams.length} teams`);

  return { matches: cleanMatches };
}

// ──────────────────────────────────────────────
// Linkage: Winners losers → Losers bracket (sequential mapping)
// ──────────────────────────────────────────────

function linkWinnersLosersToLosersBracket(
  winnersMatches: MatchData[],
  losersMatches: MatchData[],
): void {
  const winnersR1 = winnersMatches
    .filter(m => m.round === 1)
    .sort((a, b) => a.position - b.position);

  const losersR1 = losersMatches
    .filter(m => m.round === 1)
    .sort((a, b) => a.position - b.position);

  // Sequential: winners pos 1,2 → losers match 1; pos 3,4 → losers match 2
  for (let i = 0; i < winnersR1.length; i++) {
    const losersIdx = Math.floor(i / 2);
    if (losersIdx < losersR1.length) {
      winnersR1[i].next_lose_match_id = losersR1[losersIdx]._temp_id;
    }
  }
}

function getLastRoundMatch(matches: MatchData[]): MatchData | undefined {
  if (matches.length === 0) return undefined;
  const maxRound = Math.max(...matches.map(m => m.round));
  const lastRoundMatches = matches.filter(m => m.round === maxRound);
  return lastRoundMatches[0];
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
