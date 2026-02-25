import { describe, it, expect } from 'vitest';
import { validateSystemRules, type GuardMatch, type TournamentSnapshot } from '@/engine/systemRulesGuard';

// ── Helpers ──

const mkMatch = (overrides: Partial<GuardMatch> & { id: string; round: number; position: number }): GuardMatch => ({
  status: 'pending',
  bracket_type: null,
  bracket_half: null,
  team1_id: null,
  team2_id: null,
  winner_team_id: null,
  is_chapeu: false,
  modality_id: 'mod1',
  ...overrides,
});

const snap = (matches: GuardMatch[], format = 'single_elimination'): TournamentSnapshot => ({ matches, format });

// ══════════════════════════════════════════════════════════════
// 6.1 — Round order: resultado em R(N+1) com R(N) incompleta
// ══════════════════════════════════════════════════════════════
describe('Rule 6.1 — Round order', () => {
  it('viola quando R2 tem vencedor mas R1 não está completa', () => {
    const matches: GuardMatch[] = [
      mkMatch({ id: 'r1p1', round: 1, position: 0, status: 'pending', team1_id: 'a', team2_id: 'b' }),
      mkMatch({ id: 'r1p2', round: 1, position: 1, status: 'completed', team1_id: 'c', team2_id: 'd', winner_team_id: 'c' }),
      mkMatch({ id: 'r2p1', round: 2, position: 0, status: 'completed', team1_id: 'c', team2_id: 'e', winner_team_id: 'c' }),
    ];
    const violations = validateSystemRules(snap(matches));
    expect(violations.some(v => v.rule === '6.1')).toBe(true);
  });

  it('não viola quando todas as rodadas anteriores estão completas', () => {
    const matches: GuardMatch[] = [
      mkMatch({ id: 'r1p1', round: 1, position: 0, status: 'completed', team1_id: 'a', team2_id: 'b', winner_team_id: 'a' }),
      mkMatch({ id: 'r1p2', round: 1, position: 1, status: 'completed', team1_id: 'c', team2_id: 'd', winner_team_id: 'c' }),
      mkMatch({ id: 'r2p1', round: 2, position: 0, status: 'completed', team1_id: 'a', team2_id: 'c', winner_team_id: 'a' }),
    ];
    const violations = validateSystemRules(snap(matches));
    expect(violations.some(v => v.rule === '6.1')).toBe(false);
  });

  it('respeita escopo de bracket_type/bracket_half', () => {
    // Winners upper R2 completa, Losers lower R1 incompleta — NÃO viola (escopos diferentes)
    const matches: GuardMatch[] = [
      mkMatch({ id: 'w1', round: 1, position: 0, status: 'completed', bracket_type: 'winners', bracket_half: 'upper', team1_id: 'a', team2_id: 'b', winner_team_id: 'a' }),
      mkMatch({ id: 'w2', round: 2, position: 0, status: 'completed', bracket_type: 'winners', bracket_half: 'upper', team1_id: 'a', team2_id: 'c', winner_team_id: 'a' }),
      mkMatch({ id: 'l1', round: 1, position: 0, status: 'pending', bracket_type: 'losers', bracket_half: 'lower', team1_id: 'd', team2_id: 'e' }),
    ];
    const violations = validateSystemRules(snap(matches, 'double_elimination'));
    expect(violations.some(v => v.rule === '6.1')).toBe(false);
  });
});

// ══════════════════════════════════════════════════════════════
// 1.4 — Partida fantasma (completed com slot null)
// ══════════════════════════════════════════════════════════════
describe('Rule 1.4 — Null slots in completed match', () => {
  it('viola quando match completed tem team2_id null', () => {
    const matches: GuardMatch[] = [
      mkMatch({ id: 'm1', round: 1, position: 0, status: 'completed', team1_id: 'a', team2_id: null, winner_team_id: 'a' }),
    ];
    const violations = validateSystemRules(snap(matches));
    expect(violations.some(v => v.rule === '1.4' && v.message.includes('slot null'))).toBe(true);
  });

  it('não viola para chapéu (is_chapeu = true)', () => {
    const matches: GuardMatch[] = [
      mkMatch({ id: 'm1', round: 1, position: 0, status: 'completed', team1_id: 'a', team2_id: null, winner_team_id: 'a', is_chapeu: true }),
    ];
    const violations = validateSystemRules(snap(matches));
    expect(violations.some(v => v.rule === '1.4' && v.message.includes('slot null'))).toBe(false);
  });

  it('não viola quando ambos os slots estão preenchidos', () => {
    const matches: GuardMatch[] = [
      mkMatch({ id: 'm1', round: 1, position: 0, status: 'completed', team1_id: 'a', team2_id: 'b', winner_team_id: 'a' }),
    ];
    const violations = validateSystemRules(snap(matches));
    expect(violations.some(v => v.rule === '1.4' && v.message.includes('slot null'))).toBe(false);
  });
});

// ══════════════════════════════════════════════════════════════
// 1.4 — Equipe duplicada na mesma rodada
// ══════════════════════════════════════════════════════════════
describe('Rule 1.4 — Duplicate team in same round', () => {
  it('viola quando mesma equipe aparece em dois matches da mesma rodada', () => {
    const matches: GuardMatch[] = [
      mkMatch({ id: 'm1', round: 1, position: 0, team1_id: 'a', team2_id: 'b' }),
      mkMatch({ id: 'm2', round: 1, position: 1, team1_id: 'a', team2_id: 'c' }),
    ];
    const violations = validateSystemRules(snap(matches));
    expect(violations.some(v => v.rule === '1.4' && v.message.includes('dois matches'))).toBe(true);
  });

  it('não viola quando equipes são únicas na rodada', () => {
    const matches: GuardMatch[] = [
      mkMatch({ id: 'm1', round: 1, position: 0, team1_id: 'a', team2_id: 'b' }),
      mkMatch({ id: 'm2', round: 1, position: 1, team1_id: 'c', team2_id: 'd' }),
    ];
    const violations = validateSystemRules(snap(matches));
    expect(violations.some(v => v.rule === '1.4' && v.message.includes('dois matches'))).toBe(false);
  });
});

// ══════════════════════════════════════════════════════════════
// 5.1 — Vencedor não é participante do match
// ══════════════════════════════════════════════════════════════
describe('Rule 5.1 — Winner not a participant', () => {
  it('viola quando winner_team_id não é team1 nem team2', () => {
    const matches: GuardMatch[] = [
      mkMatch({ id: 'm1', round: 1, position: 0, status: 'completed', team1_id: 'a', team2_id: 'b', winner_team_id: 'x' }),
    ];
    const violations = validateSystemRules(snap(matches));
    expect(violations.some(v => v.rule === '5.1')).toBe(true);
  });

  it('não viola quando winner é team1', () => {
    const matches: GuardMatch[] = [
      mkMatch({ id: 'm1', round: 1, position: 0, status: 'completed', team1_id: 'a', team2_id: 'b', winner_team_id: 'a' }),
    ];
    const violations = validateSystemRules(snap(matches));
    expect(violations.some(v => v.rule === '5.1')).toBe(false);
  });

  it('não viola quando winner é team2', () => {
    const matches: GuardMatch[] = [
      mkMatch({ id: 'm1', round: 1, position: 0, status: 'completed', team1_id: 'a', team2_id: 'b', winner_team_id: 'b' }),
    ];
    const violations = validateSystemRules(snap(matches));
    expect(violations.some(v => v.rule === '5.1')).toBe(false);
  });
});

// ══════════════════════════════════════════════════════════════
// 4.1 — Equipe inserida diretamente na Losers (DE only)
// ══════════════════════════════════════════════════════════════
describe('Rule 4.1 — Direct insertion into Losers', () => {
  it('viola quando equipe está na Losers R1 mas nunca na Winners', () => {
    const matches: GuardMatch[] = [
      mkMatch({ id: 'w1', round: 1, position: 0, bracket_type: 'winners', team1_id: 'a', team2_id: 'b' }),
      mkMatch({ id: 'l1', round: 1, position: 0, bracket_type: 'losers', team1_id: 'x', team2_id: 'y' }),
    ];
    const violations = validateSystemRules(snap(matches, 'double_elimination'));
    expect(violations.some(v => v.rule === '4.1')).toBe(true);
  });

  it('não viola quando equipe da Losers R1 também aparece na Winners', () => {
    const matches: GuardMatch[] = [
      mkMatch({ id: 'w1', round: 1, position: 0, bracket_type: 'winners', team1_id: 'a', team2_id: 'b' }),
      mkMatch({ id: 'l1', round: 1, position: 0, bracket_type: 'losers', team1_id: 'a', team2_id: 'b' }),
    ];
    const violations = validateSystemRules(snap(matches, 'double_elimination'));
    expect(violations.some(v => v.rule === '4.1')).toBe(false);
  });

  it('não roda em SE', () => {
    const matches: GuardMatch[] = [
      mkMatch({ id: 'm1', round: 1, position: 0, team1_id: 'a', team2_id: 'b' }),
    ];
    const violations = validateSystemRules(snap(matches, 'single_elimination'));
    expect(violations.some(v => v.rule === '4.1')).toBe(false);
  });
});

// ══════════════════════════════════════════════════════════════
// 4.6 — Mais de 2 derrotas em DE
// ══════════════════════════════════════════════════════════════
describe('Rule 4.6 — Max losses in DE', () => {
  it('viola quando equipe tem 3 derrotas', () => {
    const matches: GuardMatch[] = [
      mkMatch({ id: 'm1', round: 1, position: 0, bracket_type: 'winners', status: 'completed', team1_id: 'a', team2_id: 'loser', winner_team_id: 'a' }),
      mkMatch({ id: 'm2', round: 1, position: 1, bracket_type: 'losers', status: 'completed', team1_id: 'loser', team2_id: 'b', winner_team_id: 'b' }),
      mkMatch({ id: 'm3', round: 2, position: 0, bracket_type: 'losers', status: 'completed', team1_id: 'loser', team2_id: 'c', winner_team_id: 'c' }),
    ];
    const violations = validateSystemRules(snap(matches, 'double_elimination'));
    expect(violations.some(v => v.rule === '4.6')).toBe(true);
  });

  it('não viola com exatamente 2 derrotas', () => {
    const matches: GuardMatch[] = [
      mkMatch({ id: 'm1', round: 1, position: 0, bracket_type: 'winners', status: 'completed', team1_id: 'a', team2_id: 'loser', winner_team_id: 'a' }),
      mkMatch({ id: 'm2', round: 1, position: 0, bracket_type: 'losers', status: 'completed', team1_id: 'loser', team2_id: 'b', winner_team_id: 'b' }),
    ];
    const violations = validateSystemRules(snap(matches, 'double_elimination'));
    expect(violations.some(v => v.rule === '4.6')).toBe(false);
  });
});

// ══════════════════════════════════════════════════════════════
// Cenário limpo — zero violações
// ══════════════════════════════════════════════════════════════
describe('Clean tournament — no violations', () => {
  it('retorna array vazio para torneio SE válido', () => {
    const matches: GuardMatch[] = [
      mkMatch({ id: 'r1p1', round: 1, position: 0, status: 'completed', team1_id: 'a', team2_id: 'b', winner_team_id: 'a' }),
      mkMatch({ id: 'r1p2', round: 1, position: 1, status: 'completed', team1_id: 'c', team2_id: 'd', winner_team_id: 'd' }),
      mkMatch({ id: 'r2p1', round: 2, position: 0, status: 'completed', team1_id: 'a', team2_id: 'd', winner_team_id: 'a' }),
    ];
    expect(validateSystemRules(snap(matches))).toEqual([]);
  });

  it('retorna array vazio para torneio DE válido', () => {
    const matches: GuardMatch[] = [
      mkMatch({ id: 'w1', round: 1, position: 0, bracket_type: 'winners', status: 'completed', team1_id: 'a', team2_id: 'b', winner_team_id: 'a' }),
      mkMatch({ id: 'w2', round: 1, position: 1, bracket_type: 'winners', status: 'completed', team1_id: 'c', team2_id: 'd', winner_team_id: 'c' }),
      mkMatch({ id: 'l1', round: 2, position: 0, bracket_type: 'losers', status: 'completed', team1_id: 'b', team2_id: 'd', winner_team_id: 'b' }),
    ];
    expect(validateSystemRules(snap(matches, 'double_elimination'))).toEqual([]);
  });
});
