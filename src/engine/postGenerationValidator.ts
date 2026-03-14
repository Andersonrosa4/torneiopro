/**
 * Post-Generation Bracket Validator
 *
 * Executa verificação completa de integridade após qualquer geração de chaveamento.
 * Valida: contagem de partidas, links, auto-confrontos, duplicidades, circularidade,
 * chapéus, e regras do systemRulesGuard.
 *
 * Módulo puro — sem dependências de UI, banco ou React.
 */

import { validateSystemRules, type GuardMatch, type TournamentSnapshot } from './systemRulesGuard';

export interface ValidationMatch {
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
  next_win_match_id?: string | null;
  next_lose_match_id?: string | null;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  stats: {
    totalMatches: number;
    expectedMatches: number | null;
    teamsCount: number;
    brokenLinks: number;
    circularLinks: number;
    selfMatches: number;
    duplicatesInRound: number;
    orphanedMatches: number;
    systemRuleViolations: number;
  };
}

/**
 * Executa validação completa pós-geração de chaveamento.
 */
export function validatePostGeneration(
  matches: ValidationMatch[],
  format: string,
  teamCount: number,
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const matchMap = new Map(matches.map(m => [m.id, m]));

  const isDE = format === 'double_elimination' || matches.some(m => m.bracket_type === 'losers');

  // ── 1. Contagem de partidas (fórmula 2N-3 para DE) ──
  let expectedMatches: number | null = null;
  if (isDE && teamCount >= 2) {
    expectedMatches = 2 * teamCount - 3;
    if (matches.length !== expectedMatches) {
      errors.push(`Contagem de partidas incorreta: ${matches.length} geradas, esperado ${expectedMatches} (fórmula 2N-3 para ${teamCount} equipes)`);
    }
  }

  // ── 2. Auto-confrontos (team1 === team2) ──
  let selfMatches = 0;
  for (const m of matches) {
    if (m.team1_id && m.team2_id && m.team1_id === m.team2_id) {
      selfMatches++;
      errors.push(`Auto-confronto: R${m.round}P${m.position} (${m.bracket_type || 'winners'}) — equipe ${m.team1_id.slice(0, 8)} em ambos os slots`);
    }
  }

  // ── 3. Links quebrados (next_win/next_lose apontam para match inexistente) ──
  let brokenLinks = 0;
  for (const m of matches) {
    if (m.next_win_match_id && !matchMap.has(m.next_win_match_id)) {
      brokenLinks++;
      errors.push(`Link quebrado: R${m.round}P${m.position} next_win → ${m.next_win_match_id.slice(0, 8)} (não encontrado)`);
    }
    if (m.next_lose_match_id && !matchMap.has(m.next_lose_match_id)) {
      brokenLinks++;
      errors.push(`Link quebrado: R${m.round}P${m.position} next_lose → ${m.next_lose_match_id.slice(0, 8)} (não encontrado)`);
    }
  }

  // ── 4. Links circulares ──
  let circularLinks = 0;
  for (const m of matches) {
    // Auto-referência direta
    if (m.next_win_match_id === m.id || m.next_lose_match_id === m.id) {
      circularLinks++;
      errors.push(`Link circular direto: R${m.round}P${m.position} aponta para si mesmo`);
      continue;
    }
    // Ciclo de 2 níveis
    if (m.next_win_match_id) {
      const next = matchMap.get(m.next_win_match_id);
      if (next && (next.next_win_match_id === m.id || next.next_lose_match_id === m.id)) {
        circularLinks++;
        errors.push(`Link circular: R${m.round}P${m.position} ↔ R${next.round}P${next.position}`);
      }
    }
  }

  // ── 5. Equipe duplicada no mesmo round + bracket_type ──
  let duplicatesInRound = 0;
  const roundScopes = new Map<string, string[]>();
  for (const m of matches) {
    const key = `${m.round}|${m.bracket_type ?? 'null'}|${m.modality_id ?? 'null'}`;
    if (!roundScopes.has(key)) roundScopes.set(key, []);
    const teams = roundScopes.get(key)!;
    if (m.team1_id) teams.push(m.team1_id);
    if (m.team2_id) teams.push(m.team2_id);
  }
  for (const [key, teamIds] of roundScopes) {
    const seen = new Set<string>();
    for (const tid of teamIds) {
      if (seen.has(tid)) {
        duplicatesInRound++;
        errors.push(`Equipe ${tid.slice(0, 8)} duplicada no escopo ${key}`);
      }
      seen.add(tid);
    }
  }

  // ── 6. Partidas órfãs (sem link de entrada e não são R1/round 0) ──
  let orphanedMatches = 0;
  const linkedTargets = new Set<string>();
  for (const m of matches) {
    if (m.next_win_match_id) linkedTargets.add(m.next_win_match_id);
    if (m.next_lose_match_id) linkedTargets.add(m.next_lose_match_id);
  }
  for (const m of matches) {
    if (m.round <= 1) continue; // R0 (grupos) e R1 não precisam de feeder
    if (m.bracket_type === 'third_place') continue; // 3º lugar recebe dos semifinalistas
    if (!linkedTargets.has(m.id)) {
      orphanedMatches++;
      warnings.push(`Partida órfã: R${m.round}P${m.position} (${m.bracket_type || 'winners'}) — nenhuma partida anterior aponta para ela`);
    }
  }

  // ── 7. DE: Mirror Crossing — perdedores WA → Losers Lower, WB → Losers Upper ──
  if (isDE) {
    for (const m of matches) {
      if (m.bracket_type !== 'winners' || !m.next_lose_match_id) continue;
      const loseTarget = matchMap.get(m.next_lose_match_id);
      if (!loseTarget || loseTarget.bracket_type !== 'losers') continue;

      if (m.bracket_half === 'upper' && loseTarget.bracket_half !== 'lower') {
        errors.push(`Mirror Crossing violado: Winners Upper R${m.round}P${m.position} → Losers ${loseTarget.bracket_half || '?'} (deveria ser lower)`);
      }
      if (m.bracket_half === 'lower' && loseTarget.bracket_half !== 'upper') {
        errors.push(`Mirror Crossing violado: Winners Lower R${m.round}P${m.position} → Losers ${loseTarget.bracket_half || '?'} (deveria ser upper)`);
      }
    }
  }

  // ── 8. DE: Todas as equipes iniciam na Winners ──
  if (isDE) {
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
        errors.push(`Equipe ${tid.slice(0, 8)} inserida diretamente na Losers R1 sem passar pela Winners`);
      }
    }
  }

  // ── 9. DE: Exatamente 1 partida final ──
  if (isDE) {
    const finals = matches.filter(m => m.bracket_type === 'final');
    if (finals.length !== 1) {
      errors.push(`Número incorreto de finais: ${finals.length} (esperado 1)`);
    }
  }

  // ── 10. DE: Deve ter semifinais ──
  if (isDE && teamCount >= 4) {
    const semis = matches.filter(m => m.bracket_type === 'semi_final');
    if (semis.length === 0) {
      errors.push('Nenhuma semifinal encontrada em chave de Dupla Eliminação');
    }
  }

  // ── 11. SystemRulesGuard completo ──
  const guardMatches: GuardMatch[] = matches.map(m => ({
    id: m.id,
    round: m.round,
    position: m.position,
    status: m.status,
    bracket_type: m.bracket_type,
    bracket_half: m.bracket_half,
    team1_id: m.team1_id,
    team2_id: m.team2_id,
    winner_team_id: m.winner_team_id,
    is_chapeu: m.is_chapeu,
    modality_id: m.modality_id,
  }));
  const snapshot: TournamentSnapshot = { matches: guardMatches, format };
  const violations = validateSystemRules(snapshot);
  for (const v of violations) {
    errors.push(`[Regra ${v.rule}] ${v.message}`);
  }

  const valid = errors.length === 0;

  return {
    valid,
    errors,
    warnings,
    stats: {
      totalMatches: matches.length,
      expectedMatches,
      teamsCount: teamCount,
      brokenLinks,
      circularLinks,
      selfMatches,
      duplicatesInRound,
      orphanedMatches,
      systemRuleViolations: violations.length,
    },
  };
}
