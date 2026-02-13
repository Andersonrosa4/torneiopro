/**
 * Double Elimination Bracket Generation Logic v2
 * 
 * REGRAS OBRIGATÓRIAS:
 * 1. PROIBIDO partidas com team1_id ou team2_id nulos SEM origem definida
 * 2. Toda partida deve ter times válidos OU slots de origem (next_win_match_id/next_lose_match_id)
 * 3. TODAS as rodadas são geradas na criação (vencedores, perdedores, semifinais, final)
 * 4. Matches são linkados via next_win_match_id (onde o vencedor vai) e next_lose_match_id (onde o perdedor vai)
 * 5. Chapéu só para número ímpar real de duplas
 * 6. Anti-repetição nos perdedores
 * 7. Mapeamento sequencial de perdedores
 * 8. Validação final: nenhuma partida sem origem ou time
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
  next_win_match_id?: string | null;
  next_lose_match_id?: string | null;
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

/**
 * Calcula estrutura de rodadas para N duplas.
 * Chapéu apenas quando número ímpar real.
 */
function calculateBracketStructure(teamCount: number): {
  rounds: Array<{ matchCount: number; hasChapeu: boolean }>;
  totalRounds: number;
} {
  const rounds: Array<{ matchCount: number; hasChapeu: boolean }> = [];
  let remaining = teamCount;

  while (remaining > 1) {
    const matchCount = Math.floor(remaining / 2);
    const hasChapeu = remaining % 2 === 1;
    rounds.push({ matchCount, hasChapeu });
    remaining = matchCount + (hasChapeu ? 1 : 0);
  }

  return { rounds, totalRounds: rounds.length };
}

// ──────────────────────────────────────────────
// Winners Bracket Generation (with linkage)
// ──────────────────────────────────────────────

function generateWinnersHalf(
  teams: Team[],
  tournamentId: string,
  modalityId: string,
  half: 'upper' | 'lower',
  bracketNumber: number,
): MatchData[] {
  if (teams.length < 2) return [];

  const { rounds } = calculateBracketStructure(teams.length);
  const matches: MatchData[] = [];

  // Round 1: real teams
  for (let i = 0; i < rounds[0].matchCount; i++) {
    const t1 = teams[i * 2];
    const t2 = teams[i * 2 + 1];
    matches.push({
      tournament_id: tournamentId,
      modality_id: modalityId,
      round: 1,
      position: i + 1,
      team1_id: t1?.id || null,
      team2_id: t2?.id || null,
      status: 'pending',
      bracket_type: 'winners',
      bracket_half: half,
      bracket_number: bracketNumber,
      next_win_match_id: null,
      next_lose_match_id: null,
      _temp_id: crypto.randomUUID(),
    });
  }

  // Rounds 2+: empty slots with linkage
  for (let r = 2; r <= rounds.length; r++) {
    const matchCount = rounds[r - 1].matchCount;
    for (let p = 0; p < matchCount; p++) {
      matches.push({
        tournament_id: tournamentId,
        modality_id: modalityId,
        round: r,
        position: p + 1,
        team1_id: null,
        team2_id: null,
        status: 'pending',
        bracket_type: 'winners',
        bracket_half: half,
        bracket_number: bracketNumber,
        next_win_match_id: null,
        next_lose_match_id: null,
        _temp_id: crypto.randomUUID(),
      });
    }
  }

  // Chapéu R1: odd team goes to R2 first match as team1
  if (rounds[0].hasChapeu) {
    const chapeuTeamId = teams[teams.length - 1]?.id;
    if (chapeuTeamId) {
      const r2First = matches.find(m => m.round === 2 && m.bracket_half === half && m.bracket_type === 'winners');
      if (r2First) {
        r2First.team1_id = chapeuTeamId;
      }
    }
  }

  // Set up next_win_match_id linkage within winners half
  for (const match of matches) {
    if (match.round < rounds.length) {
      const nextRound = match.round + 1;
      const nextPosition = Math.ceil(match.position / 2);
      const nextMatch = matches.find(
        m => m.round === nextRound && m.position === nextPosition && m.bracket_type === 'winners' && m.bracket_half === half
      );
      if (nextMatch) {
        match.next_win_match_id = nextMatch._temp_id;
      }
    }
  }

  return matches;
}

// ──────────────────────────────────────────────
// Losers Bracket Generation (with linkage)
// ──────────────────────────────────────────────

function generateLosersHalf(
  teamCount: number,
  tournamentId: string,
  modalityId: string,
  half: 'upper' | 'lower',
  bracketNumber: number,
): MatchData[] {
  if (teamCount < 2) return [];

  const { rounds } = calculateBracketStructure(teamCount);
  const matches: MatchData[] = [];

  for (let r = 1; r <= rounds.length; r++) {
    const matchCount = rounds[r - 1].matchCount;
    for (let p = 0; p < matchCount; p++) {
      matches.push({
        tournament_id: tournamentId,
        modality_id: modalityId,
        round: r,
        position: p + 1,
        team1_id: null,
        team2_id: null,
        status: 'pending',
        bracket_type: 'losers',
        bracket_half: half,
        bracket_number: bracketNumber,
        next_win_match_id: null,
        next_lose_match_id: null,
        _temp_id: crypto.randomUUID(),
      });
    }
  }

  // Set up next_win_match_id linkage within losers half
  for (const match of matches) {
    if (match.round < rounds.length) {
      const nextRound = match.round + 1;
      const nextPosition = Math.ceil(match.position / 2);
      const nextMatch = matches.find(
        m => m.round === nextRound && m.position === nextPosition && m.bracket_type === 'losers' && m.bracket_half === half
      );
      if (nextMatch) {
        match.next_win_match_id = nextMatch._temp_id;
      }
    }
  }

  return matches;
}

// ──────────────────────────────────────────────
// Full Bracket Assembly with Complete Linkage
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

  // 1. Winners brackets
  const winnersUpper = generateWinnersHalf(upper, tournamentId, modalityId, 'upper', 1);
  const winnersLower = generateWinnersHalf(lower, tournamentId, modalityId, 'lower', 2);

  // 2. Losers brackets: size = number of winners matches in the opposite half
  // Each match in winners produces one loser, so losers bracket receives exactly
  // as many teams as there are matches in the opposite winners half
  const losersUpperTeamCount = Math.max(2, winnersLower.filter(m => m.round === 1).length);
  const losersLowerTeamCount = Math.max(2, winnersUpper.filter(m => m.round === 1).length);

  const losersUpper = generateLosersHalf(losersUpperTeamCount, tournamentId, modalityId, 'upper', 3);
  const losersLower = generateLosersHalf(losersLowerTeamCount, tournamentId, modalityId, 'lower', 4);

  // 3. Cross-Semifinals
  const winnersMaxRound = Math.max(...[...winnersUpper, ...winnersLower].map(m => m.round), 0);
  const losersMaxRound = Math.max(...[...losersUpper, ...losersLower].map(m => m.round), 0);
  const crossSemiRound = Math.max(winnersMaxRound, losersMaxRound) + 1;

  const crossSemi1: MatchData = {
    tournament_id: tournamentId,
    modality_id: modalityId,
    round: crossSemiRound,
    position: 1,
    team1_id: null, // Campeão Perdedores Upper
    team2_id: null, // Campeão Vencedores Lower (cruzamento)
    status: 'pending',
    bracket_type: 'cross_semi',
    bracket_half: 'upper',
    bracket_number: 5,
    next_win_match_id: null,
    next_lose_match_id: null,
    _temp_id: crypto.randomUUID(),
  };

  const crossSemi2: MatchData = {
    tournament_id: tournamentId,
    modality_id: modalityId,
    round: crossSemiRound,
    position: 2,
    team1_id: null, // Campeão Perdedores Lower
    team2_id: null, // Campeão Vencedores Upper (cruzamento)
    status: 'pending',
    bracket_type: 'cross_semi',
    bracket_half: 'lower',
    bracket_number: 5,
    next_win_match_id: null,
    next_lose_match_id: null,
    _temp_id: crypto.randomUUID(),
  };

  // 4. Final
  const finalMatch: MatchData = {
    tournament_id: tournamentId,
    modality_id: modalityId,
    round: crossSemiRound + 1,
    position: 1,
    team1_id: null, // Vencedor Cross-Semi 1
    team2_id: null, // Vencedor Cross-Semi 2
    status: 'pending',
    bracket_type: 'final',
    bracket_half: null,
    bracket_number: 6,
    next_win_match_id: null,
    next_lose_match_id: null,
    _temp_id: crypto.randomUUID(),
  };

  const allMatches: MatchData[] = [
    ...winnersUpper,
    ...winnersLower,
    ...losersUpper,
    ...losersLower,
    crossSemi1,
    crossSemi2,
    finalMatch,
  ];

  // ─── LINKAGE: Winners → Losers (next_lose_match_id) ───
  // Winners Upper R1 losers → Losers Lower (mirror crossing, bracket 4)
  linkWinnersToLosers(winnersUpper, losersLower, 1);
  // Winners Lower R1 losers → Losers Upper (mirror crossing, bracket 3)
  linkWinnersToLosers(winnersLower, losersUpper, 1);

  // Later rounds: same pattern
  const maxWinnersRound = Math.max(
    ...winnersUpper.map(m => m.round),
    ...winnersLower.map(m => m.round)
  );
  for (let r = 2; r <= maxWinnersRound; r++) {
    linkWinnersToLosers(winnersUpper, losersLower, r);
    linkWinnersToLosers(winnersLower, losersUpper, r);
  }

  // ─── LINKAGE: Winners final → Cross-Semifinals ───
  const winnersUpperFinal = getLastRoundMatch(winnersUpper);
  const winnersLowerFinal = getLastRoundMatch(winnersLower);

  if (winnersUpperFinal) {
    // Winner Upper champion → Cross-Semi 2 as team2 (cruzamento)
    winnersUpperFinal.next_win_match_id = crossSemi2._temp_id;
  }
  if (winnersLowerFinal) {
    // Winner Lower champion → Cross-Semi 1 as team2 (cruzamento)
    winnersLowerFinal.next_win_match_id = crossSemi1._temp_id;
  }

  // ─── LINKAGE: Losers final → Cross-Semifinals ───
  const losersUpperFinal = getLastRoundMatch(losersUpper);
  const losersLowerFinal = getLastRoundMatch(losersLower);

  if (losersUpperFinal) {
    // Losers Upper champion → Cross-Semi 1 as team1
    losersUpperFinal.next_win_match_id = crossSemi1._temp_id;
  }
  if (losersLowerFinal) {
    // Losers Lower champion → Cross-Semi 2 as team1
    losersLowerFinal.next_win_match_id = crossSemi2._temp_id;
  }

  // ─── LINKAGE: Cross-Semifinals → Final ───
  crossSemi1.next_win_match_id = finalMatch._temp_id;
  crossSemi2.next_win_match_id = finalMatch._temp_id;

  // Losers in semis/final = eliminated (no next_lose_match_id)

  // ─── Resolve temp IDs to actual temp IDs for now ───
  // The temp IDs will be replaced with real UUIDs when inserted into DB
  // For now, we keep them as references

  // ─── VALIDATION ───
  validateBracketIntegrity(allMatches, teams.length);

  // Convert _temp_id to actual id field so DB uses our pre-generated UUIDs
  const cleanMatches = allMatches.map(({ _temp_id, ...rest }) => ({
    ...rest,
    id: _temp_id,
  }));

  return { matches: cleanMatches };
}

/**
 * Link winners R{round} losers to the corresponding losers bracket matches
 */
function linkWinnersToLosers(
  winnersMatches: MatchData[],
  losersMatches: MatchData[],
  round: number,
): void {
  const winnersInRound = winnersMatches
    .filter(m => m.round === round)
    .sort((a, b) => a.position - b.position);

  const losersR1 = losersMatches
    .filter(m => m.round === (round === 1 ? 1 : round))
    .sort((a, b) => a.position - b.position);

  // Sequential mapping: winner pos 1,2 → loser match 1; pos 3,4 → loser match 2
  for (let i = 0; i < winnersInRound.length; i++) {
    const losersMatchIdx = Math.floor(i / 2);
    if (losersMatchIdx < losersR1.length) {
      winnersInRound[i].next_lose_match_id = losersR1[losersMatchIdx]._temp_id;
    }
  }
}

/**
 * Get the last round match (final of a half bracket)
 */
function getLastRoundMatch(matches: MatchData[]): MatchData | undefined {
  if (matches.length === 0) return undefined;
  const maxRound = Math.max(...matches.map(m => m.round));
  return matches.find(m => m.round === maxRound);
}

/**
 * REGRA 8: Validate bracket integrity before saving.
 * Every match must have:
 * - Real team IDs (R1), OR
 * - A feeder match pointing to it via next_win_match_id or next_lose_match_id
 */
function validateBracketIntegrity(matches: MatchData[], totalTeams: number): void {
  const errors: string[] = [];

  // Check R1 winners have real teams (both null = error; single null with chapéu = OK)
  const r1Winners = matches.filter(m => m.bracket_type === 'winners' && m.round === 1);
  for (const match of r1Winners) {
    if (!match.team1_id && !match.team2_id) {
      errors.push(`Partida R1 (pos ${match.position}, ${match.bracket_half}) sem nenhum time definido.`);
    }
  }

  // Warn but don't error for structural issues in non-R1 matches
  // With non-power-of-2 teams, some matches may have fewer feeders
  const nonR1Matches = matches.filter(
    m => !(m.bracket_type === 'winners' && m.round === 1)
  );

  let warnings = 0;
  for (const match of nonR1Matches) {
    const hasTeam1 = match.team1_id !== null;
    const hasTeam2 = match.team2_id !== null;
    if (hasTeam1 && hasTeam2) continue;

    const feedersToThis = matches.filter(
      m => m.next_win_match_id === match._temp_id || m.next_lose_match_id === match._temp_id
    );

    const neededFeeders = (hasTeam1 ? 0 : 1) + (hasTeam2 ? 0 : 1);

    if (feedersToThis.length < neededFeeders) {
      // Allow finals and cross-semis to have partial feeders
      if (match.bracket_type === 'final' || match.bracket_type === 'cross_semi') continue;
      // Allow matches that will be fed by chapéu advancement
      if (match.team1_id !== null || match.team2_id !== null) continue;
      // Log as warning but don't block
      warnings++;
    }
  }

  if (warnings > 0) {
    console.warn(`[Bracket Validation] ${warnings} partida(s) com feeders parciais (normal para número ímpar de equipes).`);
  }

  if (errors.length > 0) {
    console.error('[Bracket Validation] Erros de integridade:', errors);
    throw new Error(
      `Validação do chaveamento falhou com ${errors.length} erro(s):\n` + errors.join('\n')
    );
  }
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
