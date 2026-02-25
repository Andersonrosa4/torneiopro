/**
 * System Rules Guard — Conformidade com SYSTEM_RULES.md
 *
 * Valida snapshot de torneio contra regras congeladas.
 * Retorna lista de violações encontradas.
 *
 * Módulo puro — sem dependências de UI, banco ou React.
 */

export interface RuleViolation {
  rule: string;
  message: string;
}

export interface GuardMatch {
  id: string;
  round: number;
  position: number;
  status: string;
  bracket_type: string | null;
  bracket_half: string | null;
  team1_id: string | null;
  team2_id: string | null;
  winner_team_id: string | null;
  is_chapeu?: boolean | null;
  modality_id?: string | null;
}

export interface TournamentSnapshot {
  matches: GuardMatch[];
  format: string; // 'single_elimination' | 'double_elimination' | 'group_stage' etc.
}

export function validateSystemRules(snapshot: TournamentSnapshot): RuleViolation[] {
  const violations: RuleViolation[] = [];
  const { matches, format } = snapshot;
  const isDE = format === 'double_elimination' || matches.some(m => m.bracket_type === 'losers');
  const knockoutMatches = matches.filter(m => m.round > 0);

  // ── 6.1 Nenhum match com vencedor se rodada anterior incompleta ──
  checkRoundOrder(knockoutMatches, violations);

  // ── Nenhum match eliminatório com slot null (exceto chapéu aguardando feeder) ──
  checkNullSlots(knockoutMatches, violations);

  // ── Nenhuma equipe aparece em dois matches da mesma rodada ──
  checkDuplicateInRound(matches, violations);

  // ── Nenhuma equipe avançou sem jogar ──
  checkAdvanceWithoutPlaying(matches, violations);

  if (isDE) {
    // ── 4.1 Todas equipes iniciaram na Winners ──
    checkAllStartInWinners(matches, violations);

    // ── Nenhuma equipe tem mais de 2 derrotas ──
    checkMaxLosses(matches, violations);
  }

  return violations;
}

// ── Helpers ──────────────────────────────────────────────────

function groupKey(m: GuardMatch): string {
  return `${m.bracket_type ?? 'null'}|${m.bracket_half ?? 'null'}|${m.modality_id ?? 'null'}`;
}

function checkRoundOrder(knockoutMatches: GuardMatch[], violations: RuleViolation[]) {
  // Group by bracket scope
  const scopes = new Map<string, GuardMatch[]>();
  for (const m of knockoutMatches) {
    const key = groupKey(m);
    if (!scopes.has(key)) scopes.set(key, []);
    scopes.get(key)!.push(m);
  }

  for (const [scope, scopeMatches] of scopes) {
    const rounds = [...new Set(scopeMatches.map(m => m.round))].sort((a, b) => a - b);
    for (let i = 1; i < rounds.length; i++) {
      const prevRound = rounds[i - 1];
      const currRound = rounds[i];
      const prevMatches = scopeMatches.filter(m => m.round === prevRound);
      const currCompleted = scopeMatches.filter(m => m.round === currRound && m.winner_team_id);

      if (currCompleted.length > 0 && !prevMatches.every(m => m.status === 'completed')) {
        violations.push({
          rule: '6.1',
          message: `Rodada ${currRound} tem resultado lançado mas rodada ${prevRound} está incompleta [${scope}]`,
        });
      }
    }
  }
}

function checkNullSlots(knockoutMatches: GuardMatch[], violations: RuleViolation[]) {
  for (const m of knockoutMatches) {
    if (m.status !== 'completed') continue;
    if (m.is_chapeu) continue; // chapéu pode ter team1 null (aguarda feeder)

    if (!m.team1_id || !m.team2_id) {
      violations.push({
        rule: '1.4',
        message: `Match R${m.round}P${m.position} (${m.bracket_type}) está completed mas tem slot null — possível partida fantasma`,
      });
    }
  }
}

function checkDuplicateInRound(matches: GuardMatch[], violations: RuleViolation[]) {
  const scopes = new Map<string, GuardMatch[]>();
  for (const m of matches) {
    const key = `${m.round}|${m.modality_id ?? 'null'}`;
    if (!scopes.has(key)) scopes.set(key, []);
    scopes.get(key)!.push(m);
  }

  for (const [key, roundMatches] of scopes) {
    const teamIds: string[] = [];
    for (const m of roundMatches) {
      if (m.team1_id) teamIds.push(m.team1_id);
      if (m.team2_id) teamIds.push(m.team2_id);
    }
    const seen = new Set<string>();
    for (const tid of teamIds) {
      if (seen.has(tid)) {
        violations.push({
          rule: '1.4',
          message: `Equipe ${tid.slice(0, 8)} aparece em dois matches na mesma rodada [${key}]`,
        });
      }
      seen.add(tid);
    }
  }
}

function checkAdvanceWithoutPlaying(matches: GuardMatch[], violations: RuleViolation[]) {
  // For each match with a winner, verify the winner actually played in a prior match
  // (or is assigned in the current match as team1/team2)
  for (const m of matches) {
    if (!m.winner_team_id) continue;
    if (m.winner_team_id !== m.team1_id && m.winner_team_id !== m.team2_id) {
      violations.push({
        rule: '5.1',
        message: `Match R${m.round}P${m.position}: vencedor ${m.winner_team_id.slice(0, 8)} não é participante do match`,
      });
    }
  }
}

function checkAllStartInWinners(matches: GuardMatch[], violations: RuleViolation[]) {
  // Collect all teams that appear in round 1 of losers but never in winners
  const winnersTeams = new Set<string>();
  const losersR1Teams = new Set<string>();

  for (const m of matches) {
    if (m.bracket_type === 'winners') {
      if (m.team1_id) winnersTeams.add(m.team1_id);
      if (m.team2_id) winnersTeams.add(m.team2_id);
    }
    if (m.bracket_type === 'losers' && m.round === 1) {
      if (m.team1_id) losersR1Teams.add(m.team1_id);
      if (m.team2_id) losersR1Teams.add(m.team2_id);
    }
  }

  for (const tid of losersR1Teams) {
    if (!winnersTeams.has(tid)) {
      violations.push({
        rule: '4.1',
        message: `Equipe ${tid.slice(0, 8)} aparece na Losers R1 mas nunca na Winners — inserção direta proibida`,
      });
    }
  }
}

function checkMaxLosses(matches: GuardMatch[], violations: RuleViolation[]) {
  // In DE, a team is eliminated after 2 losses max (1 in winners, 1 in losers)
  const lossCount = new Map<string, number>();

  for (const m of matches) {
    if (m.status !== 'completed' || !m.winner_team_id) continue;
    const loserId = m.team1_id === m.winner_team_id ? m.team2_id : m.team1_id;
    if (!loserId) continue;
    lossCount.set(loserId, (lossCount.get(loserId) ?? 0) + 1);
  }

  for (const [tid, losses] of lossCount) {
    if (losses > 2) {
      violations.push({
        rule: '4.6',
        message: `Equipe ${tid.slice(0, 8)} tem ${losses} derrotas — máximo permitido em DE é 2`,
      });
    }
  }
}
