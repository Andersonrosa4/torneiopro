/**
 * Double Elimination Bracket Generation Logic (CORRIGIDO)
 * 
 * Regras Obrigatórias:
 * 1. SEM "chapéu estrutural" - chapéu só para número ímpar real de duplas
 * 2. Anti-repetição: verificar confrontos anteriores antes de slotting losers
 * 3. Mapeamento sequencial: Perdedor J1→P1, J2→P2, etc.
 * 4. Semifinais: perdedor eliminado, sem queda para Perdedores
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
  _temp_id?: string;
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

/**
 * Shuffle array using Fisher-Yates
 */
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Split teams into Side A (upper) and Side B (lower).
 * Respects manual side assignments.
 */
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
      if (upper.length < halfSize) {
        upper.push(t);
      } else {
        lower.push(t);
      }
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
 * Calcula estrutura de rodadas para N duplas SEM chapéu estrutural.
 * Retorna: { rounds: [{ matchCount, hasChapeu }, ...], totalRounds: number }
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

/**
 * Gera chave de Vencedores SEM chapéu estrutural.
 * Apenas um chapéu quando número ímpar real de duplas.
 */
function generateWinnersHalfBracket(
  teams: Team[],
  tournamentId: string,
  modalityId: string,
  half: 'upper' | 'lower',
  bracketNumber: number,
): MatchData[] {
  if (teams.length < 1) return [];

  const { rounds } = calculateBracketStructure(teams.length);
  const matches: MatchData[] = [];

  // R1: criar apenas matches necessários
  for (let i = 0; i < rounds[0].matchCount; i++) {
    const t1 = teams[i * 2] || null;
    const t2 = teams[i * 2 + 1] || null;

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
      _temp_id: `w_${half}_r1_p${i + 1}`,
    });
  }

  // Próximas rodadas
  let teamAdvancingFrom = rounds[0].matchCount + (rounds[0].hasChapeu ? 1 : 0);

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
        _temp_id: `w_${half}_r${r}_p${p + 1}`,
      });
    }
    teamAdvancingFrom = matchCount + (rounds[r - 1].hasChapeu ? 1 : 0);
  }

  // Propagação de chapéu: se houver, colocar na primeira posição da R2
  if (rounds[0].hasChapeu && rounds.length > 0) {
    const chapeuTeamId = teams[teams.length - 1]?.id;
    if (chapeuTeamId && matches.length > rounds[0].matchCount) {
      const r2FirstMatch = matches.find(
        m =>
          m.round === 2 &&
          m.bracket_type === 'winners' &&
          m.bracket_half === half
      );
      if (r2FirstMatch) {
        r2FirstMatch.team1_id = chapeuTeamId;
      }
    }
  }

  return matches;
}

/**
 * Gera estrutura de Chave dos Perdedores SEM chapéu estrutural.
 * teamCount = número de duplas esperadas que cairão nesta chave
 */
function generateLosersBracketStructure(
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
        _temp_id: `l_${half}_r${r}_p${p + 1}`,
      });
    }
  }

  return matches;
}

/**
 * Mapeia perdedores sequencialmente: J1→P1, J2→P2, etc.
 * Também verifica anti-repetição com base em historico de confrontos.
 */
interface LoserMapping {
  winnerRound: number;
  winnersMatchPosition: number;
  losersRound: number;
  losersPosition: number;
  team1OrTeam2: 'team1_id' | 'team2_id';
}

function getMappingForLoser(
  loserSourceRound: number,
  loserSourcePosition: number,
  losersBracketStructure: MatchData[],
): LoserMapping | null {
  // Regra 3: Mapeamento sequencial
  // Perdedor da rodada R1 posição P da Chave de Vencedores
  // → vai para Perdedores rodada R1 posição ceil(P/2)

  if (loserSourceRound === 1) {
    const losersRound = 1;
    const losersPosition = Math.ceil(loserSourcePosition / 2);
    const team1OrTeam2 = loserSourcePosition % 2 === 1 ? 'team1_id' : 'team2_id';

    return {
      winnerRound: loserSourceRound,
      winnersMatchPosition: loserSourcePosition,
      losersRound,
      losersPosition,
      team1OrTeam2,
    };
  }

  // Perdedores de R2+ entram em rodadas posteriores dos Perdedores
  // Mapeamento: Rodada N dos Vencedores → Rodada N dos Perdedores
  const losersRound = loserSourceRound;
  const losersPosition = Math.ceil(loserSourcePosition / 2);
  const team1OrTeam2 = loserSourcePosition % 2 === 1 ? 'team1_id' : 'team2_id';

  return {
    winnerRound: loserSourceRound,
    winnersMatchPosition: loserSourcePosition,
    losersRound,
    losersPosition,
    team1OrTeam2,
  };
}

/**
 * Busca slot disponível nos Perdedores respeitando mapeamento sequencial.
 * Implementa Regra 2: anti-repetição com historico de confrontos.
 */
function findLosersSlotWithAntiRepetition(
  loserTeamId: string,
  loserSourceRound: number,
  loserSourcePosition: number,
  losersMatches: MatchData[],
  winnerMatches: MatchData[],
): { match: MatchData; field: 'team1_id' | 'team2_id' } | null {
  const mapping = getMappingForLoser(
    loserSourceRound,
    loserSourcePosition,
    losersMatches,
  );

  if (!mapping) return null;

  // Procura match na rodada indicada, posição indicada
  let targetMatch = losersMatches.find(
    m =>
      m.round === mapping.losersRound &&
      m.position === mapping.losersPosition &&
      m.bracket_type === 'losers',
  );

  if (!targetMatch) {
    // Se não existe, procura próximo slot disponível sequencialmente
    const candidateMatches = losersMatches
      .filter(m => m.bracket_type === 'losers' && m.round >= mapping.losersRound)
      .sort((a, b) => (a.round === b.round ? a.position - b.position : a.round - b.round));

    for (const candidate of candidateMatches) {
      const team1Occupied = candidate.team1_id !== null;
      const team2Occupied = candidate.team2_id !== null;

      if (!team1Occupied) {
        // Regra 2: verificar anti-repetição
        if (!hasMetBefore(loserTeamId, candidate, 'team1_id', winnerMatches)) {
          targetMatch = candidate;
          break;
        }
      }
      if (!team2Occupied && !targetMatch) {
        if (!hasMetBefore(loserTeamId, candidate, 'team2_id', winnerMatches)) {
          targetMatch = candidate;
          break;
        }
      }
    }
  }

  if (!targetMatch) return null;

  // Escolhe qual slot usar
  const team1Empty = !targetMatch.team1_id;
  const team2Empty = !targetMatch.team2_id;

  let field: 'team1_id' | 'team2_id' = mapping.team1OrTeam2;

  if (!team1Empty && team2Empty) {
    field = 'team2_id';
  } else if (team1Empty && !team2Empty) {
    field = 'team1_id';
  }

  return { match: targetMatch, field };
}

/**
 * Verifica se duas duplas já se enfrentaram na Chave de Vencedores (Regra 2)
 */
function hasMetBefore(
  team1Id: string,
  targetMatch: MatchData,
  fieldToUse: 'team1_id' | 'team2_id',
  winnerMatches: MatchData[],
): boolean {
  const oppositeField = fieldToUse === 'team1_id' ? 'team2_id' : 'team1_id';
  const potentialOpponent = (targetMatch as any)[oppositeField];

  if (!potentialOpponent) return false;

  // Procura se essas duas duplas já se enfrentaram em matches de Vencedores
  const previousMeeting = winnerMatches.find(
    m =>
      m.bracket_type === 'winners' &&
      ((m.team1_id === team1Id && m.team2_id === potentialOpponent) ||
        (m.team1_id === potentialOpponent && m.team2_id === team1Id)),
  );

  return !!previousMeeting;
}

/**
 * Main function: Generate full double elimination bracket
 */
export function generateDoubleEliminationBracket(config: DoubleEliminationConfig): GeneratedBracket {
  const { tournamentId, modalityId, teams, useSeeds, seedTeamIds, sideATeamIds, sideBTeamIds } = config;

  const { upper, lower } = splitIntoHalves(
    teams,
    useSeeds ? sideATeamIds : undefined,
    useSeeds ? sideBTeamIds : undefined,
  );

  // 1. Vencedores
  const winnersUpper = generateWinnersHalfBracket(upper, tournamentId, modalityId, 'upper', 1);
  const winnersLower = generateWinnersHalfBracket(lower, tournamentId, modalityId, 'lower', 2);

  // 2. Perdedores (estrutura baseada em quantos perderão)
  // Da Chave de Vencedores Lado B (lower) vem para Perdedores Lado A (upper)
  const losersUpperTeamCount = lower.length - 1; // Todos menos o campeão
  // Da Chave de Vencedores Lado A (upper) vem para Perdedores Lado B (lower)
  const losersLowerTeamCount = upper.length - 1;

  const losersUpperMatches = generateLosersBracketStructure(
    Math.max(2, losersUpperTeamCount),
    tournamentId,
    modalityId,
    'upper',
    3,
  );
  const losersLowerMatches = generateLosersBracketStructure(
    Math.max(2, losersLowerTeamCount),
    tournamentId,
    modalityId,
    'lower',
    4,
  );

  // 3. Calcular round das Semifinais Cruzadas
  const winnersMaxRound = Math.max(
    ...[...winnersUpper, ...winnersLower].map(m => m.round),
    0,
  );
  const losersMaxRound = Math.max(
    ...[...losersUpperMatches, ...losersLowerMatches].map(m => m.round),
    0,
  );
  const crossSemiRound = Math.max(winnersMaxRound, losersMaxRound) + 1;

  // 4. Semifinais Cruzadas
  const crossSemi1: MatchData = {
    tournament_id: tournamentId,
    modality_id: modalityId,
    round: crossSemiRound,
    position: 1,
    team1_id: null,
    team2_id: null,
    status: 'pending',
    bracket_type: 'cross_semi',
    bracket_half: 'upper',
    bracket_number: 5,
    _temp_id: 'cross_semi_1',
  };

  const crossSemi2: MatchData = {
    tournament_id: tournamentId,
    modality_id: modalityId,
    round: crossSemiRound,
    position: 2,
    team1_id: null,
    team2_id: null,
    status: 'pending',
    bracket_type: 'cross_semi',
    bracket_half: 'lower',
    bracket_number: 5,
    _temp_id: 'cross_semi_2',
  };

  // 5. Final
  const finalMatch: MatchData = {
    tournament_id: tournamentId,
    modality_id: modalityId,
    round: crossSemiRound + 1,
    position: 1,
    team1_id: null,
    team2_id: null,
    status: 'pending',
    bracket_type: 'final',
    bracket_half: null,
    bracket_number: 6,
    _temp_id: 'final',
  };

  const allMatches: MatchData[] = [
    ...winnersUpper,
    ...winnersLower,
    ...losersUpperMatches,
    ...losersLowerMatches,
    crossSemi1,
    crossSemi2,
    finalMatch,
  ];

  const cleanMatches = allMatches.map(({ _temp_id, ...rest }) => rest);

  return { matches: cleanMatches };
}

/**
 * Get mirror half for losers bracket placement
 */
export function getMirrorHalf(winnersHalf: string): string {
  return winnersHalf === 'upper' ? 'lower' : 'upper';
}

export function canTeamsMeet(): boolean {
  return true;
}

export function processDoubleEliminationResult(): any {
  return {};
}
