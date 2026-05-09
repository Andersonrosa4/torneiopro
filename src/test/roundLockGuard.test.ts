import { describe, expect, it } from 'vitest';
import { isRoundLocked, type RoundLockMatch } from '@/engine/roundLockGuard';

const match = (overrides: Partial<RoundLockMatch> & { id: string; round: number }): RoundLockMatch => ({
  id: overrides.id,
  round: overrides.round,
  status: 'pending',
  bracket_type: 'winners',
  bracket_half: 'upper',
  modality_id: 'mod-1',
  stage_id: 'stage-convidados',
  next_win_match_id: null,
  next_lose_match_id: null,
  ...overrides,
});

describe('roundLockGuard', () => {
  it('não bloqueia por pendências de outra etapa da mesma modalidade', () => {
    const target = match({ id: 'w-r2-p1', round: 2 });
    const result = isRoundLocked(target, [
      match({ id: 'w-r1-p1', round: 1, status: 'completed', next_win_match_id: target.id }),
      match({ id: 'w-r1-p2', round: 1, status: 'completed', next_win_match_id: target.id }),
      match({ id: 'ab-r1-p1', round: 1, status: 'pending', stage_id: 'stage-a-b' }),
      target,
    ]);

    expect(result.locked).toBe(false);
  });

  it('bloqueia somente quando feeder direto da mesma etapa está pendente', () => {
    const target = match({ id: 'w-r2-p1', round: 2 });
    const result = isRoundLocked(target, [
      match({ id: 'w-r1-p1', round: 1, status: 'completed', next_win_match_id: target.id }),
      match({ id: 'w-r1-p2', round: 1, status: 'pending', next_win_match_id: target.id }),
      target,
    ]);

    expect(result.locked).toBe(true);
    expect(result.reason).not.toContain('Finalize a rodada anterior');
  });
});
