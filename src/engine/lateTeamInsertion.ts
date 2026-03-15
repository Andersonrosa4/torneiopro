/**
 * Late Team Insertion Engine
 * 
 * Allows adding a team to an already-generated bracket when:
 * - No matches beyond Round 1 (winners) are completed
 * - The new team is always placed in Winners B (bracket_half = "lower")
 * 
 * Strategy:
 * 1. Check if there's an existing chapéu slot in Winners B to fill
 * 2. If not, create a new preliminary match in Winners B R1,
 *    rerouting an existing R2 team as opponent
 * 
 * Pure engine — no UI, no React, no DB calls.
 */

export interface LateInsertionMatch {
  id: string;
  round: number;
  position: number;
  status: string;
  bracket_type: string | null;
  bracket_half: string | null;
  team1_id: string | null;
  team2_id: string | null;
  winner_team_id: string | null;
  is_chapeu: boolean | null;
  next_win_match_id: string | null;
  next_lose_match_id: string | null;
  modality_id: string | null;
}

export interface InsertionResult {
  allowed: boolean;
  reason: string;
  strategy?: 'fill_chapeu' | 'create_preliminary';
  /** For fill_chapeu: the match to update */
  chapeuMatchId?: string;
  /** For create_preliminary: the R2 match to steal a team from, and which slot */
  targetMatchId?: string;
  targetSlot?: 'team1_id' | 'team2_id';
  /** The team being displaced to become the opponent in the new R1 match */
  displacedTeamId?: string;
  /** For create_preliminary: the new match needs these links */
  newMatchNextWinId?: string;
  /** Copy the next_lose_match_id from the target R2 context */
  newMatchNextLoseId?: string;
  /** Position for the new match */
  newMatchPosition?: number;
  /** Round for the new match */
  newMatchRound?: number;
}

/**
 * Checks if late insertion is allowed and determines the strategy.
 */
export function evaluateLateInsertion(
  matches: LateInsertionMatch[],
  modalityId: string | null,
  format: string
): InsertionResult {
  // Filter to this modality
  const modMatches = modalityId
    ? matches.filter(m => m.modality_id === modalityId)
    : matches;

  if (modMatches.length === 0) {
    return { allowed: false, reason: 'Nenhuma partida encontrada para esta modalidade.' };
  }

  const isDE = format === 'double_elimination' || modMatches.some(m => m.bracket_type === 'losers');

  // Check eligibility: no completed matches beyond R1 in winners
  const winnersMatches = isDE
    ? modMatches.filter(m => m.bracket_type === 'winners')
    : modMatches.filter(m => !m.bracket_type || m.bracket_type === 'winners');

  const completedBeyondR1 = winnersMatches.filter(
    m => m.round > 1 && m.status === 'completed'
  );

  if (completedBeyondR1.length > 0) {
    return { allowed: false, reason: 'Já existem partidas concluídas além da 1ª rodada. Inserção tardia bloqueada.' };
  }

  // Strategy 1: Find existing chapéu in Winners B (for DE) or Winners (for SE)
  const winnersBMatches = isDE
    ? modMatches.filter(m => m.bracket_type === 'winners' && m.bracket_half === 'lower')
    : modMatches;

  const chapeuSlot = winnersBMatches.find(m =>
    m.is_chapeu &&
    m.status === 'pending' &&
    ((m.team1_id && !m.team2_id) || (!m.team1_id && m.team2_id))
  );

  if (chapeuSlot) {
    return {
      allowed: true,
      reason: 'Slot de chapéu disponível na chave B.',
      strategy: 'fill_chapeu',
      chapeuMatchId: chapeuSlot.id,
    };
  }

  // Strategy 2: Create a new preliminary match
  // Find a R2+ match in Winners B that has a directly assigned team (not from a feeder)
  // A "directly assigned" team is one in a slot that isn't fed by any R1 match
  const r1Matches = winnersBMatches.filter(m => m.round === 1);
  const r2Matches = winnersBMatches.filter(m => m.round === 2);

  // Teams that are winners of R1 matches (fed into R2)
  const fedTeamSlots = new Set<string>();
  for (const r1m of r1Matches) {
    if (r1m.next_win_match_id) {
      fedTeamSlots.add(r1m.next_win_match_id);
    }
  }

  // Find R2 match with a team that wasn't fed from R1 (a "chapéu seed" / direct placement)
  let targetMatch: LateInsertionMatch | null = null;
  let targetSlot: 'team1_id' | 'team2_id' | null = null;
  let displacedTeamId: string | null = null;

  for (const r2m of r2Matches) {
    if (r2m.status === 'completed') continue;

    // Check team1: is it a direct placement (not fed from any R1)?
    if (r2m.team1_id) {
      const isFed = r1Matches.some(r1 => r1.next_win_match_id === r2m.id);
      // team1 is in the "upper" slot — check if it's a direct seed
      const isTeam1Fed = r1Matches.some(r1 =>
        r1.next_win_match_id === r2m.id && r1.position % 2 === 1
      );
      if (!isTeam1Fed && r2m.team1_id) {
        targetMatch = r2m;
        targetSlot = 'team1_id';
        displacedTeamId = r2m.team1_id;
        break;
      }
    }

    if (r2m.team2_id) {
      const isTeam2Fed = r1Matches.some(r1 =>
        r1.next_win_match_id === r2m.id && r1.position % 2 === 0
      );
      if (!isTeam2Fed && r2m.team2_id) {
        targetMatch = r2m;
        targetSlot = 'team2_id';
        displacedTeamId = r2m.team2_id;
        break;
      }
    }
  }

  // Fallback: check R1 chapéu matches that already have both teams but one is a "waiting" seed
  // Or simply find any R2+ match with a direct team
  if (!targetMatch) {
    // Try all rounds in winners B for a directly placed team
    const allRounds = [...new Set(winnersBMatches.map(m => m.round))].sort((a, b) => a - b);
    for (const round of allRounds) {
      if (round < 2) continue;
      const roundMatches = winnersBMatches.filter(m => m.round === round && m.status !== 'completed');
      for (const rm of roundMatches) {
        // Check if team1 is directly placed (chapéu-style)
        if (rm.team1_id && rm.is_chapeu) {
          targetMatch = rm;
          targetSlot = 'team1_id';
          displacedTeamId = rm.team1_id;
          break;
        }
        if (rm.team2_id && rm.is_chapeu) {
          targetMatch = rm;
          targetSlot = 'team2_id';
          displacedTeamId = rm.team2_id;
          break;
        }
      }
      if (targetMatch) break;
    }
  }

  if (!targetMatch || !targetSlot || !displacedTeamId) {
    return {
      allowed: false,
      reason: 'Não foi possível encontrar um slot seguro para inserir a nova dupla na chave B dos Vencedores.',
    };
  }

  // Calculate new match position
  const allPositions = modMatches.map(m => m.position);
  const maxPosition = Math.max(...allPositions, 0);
  const newPosition = maxPosition + 1;

  return {
    allowed: true,
    reason: `Nova partida preliminar será criada. ${displacedTeamId.slice(0, 8)} será deslocado para R1 como adversário.`,
    strategy: 'create_preliminary',
    targetMatchId: targetMatch.id,
    targetSlot,
    displacedTeamId,
    newMatchNextWinId: targetMatch.id,
    newMatchNextLoseId: targetMatch.next_lose_match_id,
    newMatchPosition: newPosition,
    newMatchRound: 1,
  };
}
