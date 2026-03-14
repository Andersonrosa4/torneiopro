/**
 * Post-Generation Bracket Validator + Auto-Repair
 *
 * Executa verificação completa de integridade após qualquer geração de chaveamento.
 * Detecta e CORRIGE automaticamente: links quebrados, circulares, auto-confrontos,
 * duplicidades, mirror crossing, e partidas órfãs.
 *
 * Módulo puro — sem dependências de UI, banco ou React.
 * As reparações são retornadas como lista de updates para aplicar no banco.
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

export interface RepairAction {
  matchId: string;
  updates: Record<string, string | null>;
  reason: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  repairs: RepairAction[];
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
    autoRepairs: number;
  };
}

/**
 * Executa validação completa pós-geração com auto-reparação.
 */
export function validatePostGeneration(
  matches: ValidationMatch[],
  format: string,
  teamCount: number,
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const repairs: RepairAction[] = [];
  const matchMap = new Map(matches.map(m => [m.id, m]));

  const isDE = format === 'double_elimination' || matches.some(m => m.bracket_type === 'losers');

  // ── 1. Contagem de partidas (fórmula 2N-3 para DE) ──
  let expectedMatches: number | null = null;
  if (isDE && teamCount >= 2) {
    expectedMatches = 2 * teamCount - 3;
    if (matches.length !== expectedMatches) {
      errors.push(`Contagem de partidas incorreta: ${matches.length} geradas, esperado ${expectedMatches} (fórmula 2N-3 para ${teamCount} equipes)`);
      // Structural — cannot auto-repair match count
    }
  }

  // ── 2. Auto-confrontos (team1 === team2) — AUTO-REPAIR: limpar team2 ──
  let selfMatches = 0;
  for (const m of matches) {
    if (m.team1_id && m.team2_id && m.team1_id === m.team2_id) {
      selfMatches++;
      warnings.push(`Auto-confronto reparado: R${m.round}P${m.position} — team2 limpo`);
      repairs.push({
        matchId: m.id,
        updates: { team2_id: null, winner_team_id: null, status: 'pending' },
        reason: `Auto-confronto: equipe ${m.team1_id.slice(0, 8)} em ambos os slots`,
      });
    }
  }

  // ── 3. Links quebrados — AUTO-REPAIR: remover referência inválida ──
  let brokenLinks = 0;
  for (const m of matches) {
    if (m.next_win_match_id && !matchMap.has(m.next_win_match_id)) {
      brokenLinks++;
      warnings.push(`Link quebrado reparado: R${m.round}P${m.position} next_win removido`);
      repairs.push({
        matchId: m.id,
        updates: { next_win_match_id: null },
        reason: `next_win_match_id aponta para ${m.next_win_match_id.slice(0, 8)} inexistente`,
      });
    }
    if (m.next_lose_match_id && !matchMap.has(m.next_lose_match_id)) {
      brokenLinks++;
      warnings.push(`Link quebrado reparado: R${m.round}P${m.position} next_lose removido`);
      repairs.push({
        matchId: m.id,
        updates: { next_lose_match_id: null },
        reason: `next_lose_match_id aponta para ${m.next_lose_match_id.slice(0, 8)} inexistente`,
      });
    }
  }

  // ── 4. Links circulares — AUTO-REPAIR: remover link circular ──
  let circularLinks = 0;
  for (const m of matches) {
    if (m.next_win_match_id === m.id) {
      circularLinks++;
      warnings.push(`Link circular reparado: R${m.round}P${m.position} next_win apontava para si mesmo`);
      repairs.push({
        matchId: m.id,
        updates: { next_win_match_id: null },
        reason: 'next_win_match_id circular (auto-referência)',
      });
    }
    if (m.next_lose_match_id === m.id) {
      circularLinks++;
      warnings.push(`Link circular reparado: R${m.round}P${m.position} next_lose apontava para si mesmo`);
      repairs.push({
        matchId: m.id,
        updates: { next_lose_match_id: null },
        reason: 'next_lose_match_id circular (auto-referência)',
      });
    }
    // Ciclo de 2 níveis
    if (m.next_win_match_id && m.next_win_match_id !== m.id) {
      const next = matchMap.get(m.next_win_match_id);
      if (next && (next.next_win_match_id === m.id || next.next_lose_match_id === m.id)) {
        circularLinks++;
        warnings.push(`Link circular 2-níveis reparado: R${m.round}P${m.position} ↔ R${next.round}P${next.position}`);
        // Remove the backward link from the next match
        if (next.next_win_match_id === m.id) {
          repairs.push({
            matchId: next.id,
            updates: { next_win_match_id: null },
            reason: `Ciclo 2-níveis: next_win de R${next.round}P${next.position} → R${m.round}P${m.position}`,
          });
        }
        if (next.next_lose_match_id === m.id) {
          repairs.push({
            matchId: next.id,
            updates: { next_lose_match_id: null },
            reason: `Ciclo 2-níveis: next_lose de R${next.round}P${next.position} → R${m.round}P${m.position}`,
          });
        }
      }
    }
  }

  // ── 5. Equipe duplicada no mesmo round + bracket_type — AUTO-REPAIR: limpar duplicata do match posterior ──
  let duplicatesInRound = 0;
  const roundScopeMatches = new Map<string, ValidationMatch[]>();
  for (const m of matches) {
    const key = `${m.round}|${m.bracket_type ?? 'null'}|${m.modality_id ?? 'null'}`;
    if (!roundScopeMatches.has(key)) roundScopeMatches.set(key, []);
    roundScopeMatches.get(key)!.push(m);
  }
  for (const [key, scopeMatches] of roundScopeMatches) {
    const seen = new Map<string, string>(); // teamId → first matchId
    for (const m of scopeMatches) {
      for (const slot of ['team1_id', 'team2_id'] as const) {
        const tid = m[slot];
        if (!tid) continue;
        if (seen.has(tid)) {
          duplicatesInRound++;
          warnings.push(`Duplicata reparada: equipe ${tid.slice(0, 8)} removida de R${m.round}P${m.position} ${slot}`);
          repairs.push({
            matchId: m.id,
            updates: { [slot]: null },
            reason: `Equipe ${tid.slice(0, 8)} já presente em match ${seen.get(tid)!.slice(0, 8)} no escopo ${key}`,
          });
        } else {
          seen.set(tid, m.id);
        }
      }
    }
  }

  // ── 6. Partidas órfãs — AUTO-REPAIR: reconstruir link baseado em round/position ──
  let orphanedMatches = 0;
  const linkedTargets = new Set<string>();
  for (const m of matches) {
    if (m.next_win_match_id) linkedTargets.add(m.next_win_match_id);
    if (m.next_lose_match_id) linkedTargets.add(m.next_lose_match_id);
  }
  for (const m of matches) {
    if (m.round <= 1) continue;
    if (m.bracket_type === 'third_place') continue;
    if (linkedTargets.has(m.id)) continue;

    orphanedMatches++;
    // Try to find potential feeders: matches from round-1 with same bracket_type/half
    const prevRound = m.round - 1;
    const possibleFeeders = matches.filter(fm =>
      fm.round === prevRound &&
      fm.bracket_type === m.bracket_type &&
      fm.bracket_half === m.bracket_half &&
      fm.modality_id === m.modality_id &&
      !fm.next_win_match_id // not already linked
    );
    
    // Standard pairing: positions (2*pos-1) and (2*pos) feed into position pos
    const expectedPositions = [m.position * 2 - 1, m.position * 2];
    for (const feederPos of expectedPositions) {
      const feeder = possibleFeeders.find(f => f.position === feederPos);
      if (feeder) {
        warnings.push(`Link reconstruído: R${feeder.round}P${feeder.position} → R${m.round}P${m.position} (next_win)`);
        repairs.push({
          matchId: feeder.id,
          updates: { next_win_match_id: m.id },
          reason: `Partida órfã R${m.round}P${m.position} — feeder R${feeder.round}P${feeder.position} reconectado`,
        });
        linkedTargets.add(m.id); // mark as linked now
      }
    }
    if (!linkedTargets.has(m.id)) {
      warnings.push(`Partida órfã não reparável: R${m.round}P${m.position} (${m.bracket_type || 'winners'}) — sem feeder compatível`);
    }
  }

  // ── 7. DE: Mirror Crossing — AUTO-REPAIR: redirecionar next_lose para o lado correto ──
  if (isDE) {
    for (const m of matches) {
      if (m.bracket_type !== 'winners' || !m.next_lose_match_id) continue;
      const loseTarget = matchMap.get(m.next_lose_match_id);
      if (!loseTarget || loseTarget.bracket_type !== 'losers') continue;

      const expectedHalf = m.bracket_half === 'upper' ? 'lower' : 'upper';
      if (loseTarget.bracket_half !== expectedHalf) {
        // Find correct target in the losers bracket
        const correctTarget = matches.find(cm =>
          cm.bracket_type === 'losers' &&
          cm.bracket_half === expectedHalf &&
          cm.round === loseTarget.round &&
          cm.modality_id === m.modality_id
        );
        if (correctTarget) {
          warnings.push(`Mirror Crossing reparado: Winners ${m.bracket_half} R${m.round}P${m.position} → Losers ${expectedHalf}`);
          repairs.push({
            matchId: m.id,
            updates: { next_lose_match_id: correctTarget.id },
            reason: `Mirror Crossing: deveria ir para Losers ${expectedHalf}, estava em ${loseTarget.bracket_half}`,
          });
        } else {
          errors.push(`Mirror Crossing violado e não reparável: Winners ${m.bracket_half} R${m.round}P${m.position} → Losers ${loseTarget.bracket_half || '?'}`);
        }
      }
    }
  }

  // ── 8. DE: Equipes na Losers R1 sem passagem pela Winners — WARN only (structural) ──
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
    // These are post-repair violations — only flag if not already addressed by repairs
    errors.push(`[Regra ${v.rule}] ${v.message}`);
  }

  // Errors that have repairs are downgraded to warnings
  const unrepairable = errors.filter(e => {
    // If a repair exists that addresses this category, it's handled
    return true; // keep all errors for logging, repairs run separately
  });

  const valid = errors.length === 0 && repairs.length === 0;

  return {
    valid,
    errors,
    warnings,
    repairs,
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
      autoRepairs: repairs.length,
    },
  };
}
