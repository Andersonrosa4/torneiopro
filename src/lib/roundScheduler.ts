/**
 * Double Elimination Round Scheduler
 * 
 * Enforces strict execution order per round:
 *   W-A R1 → W-B R1 → L-S R1 → L-I R1 → W-A R2 → W-B R2 → L-S R2 → L-I R2 → ... → Semis → Final
 * 
 * Dependencies:
 *   - Losers R only unlocks when Winners A R AND Winners B R are both completed
 *   - Winners R+1 only unlocks when Losers A R AND Losers B R are both completed
 */

interface SchedulerMatch {
  id: string;
  round: number;
  position: number;
  team1_id: string | null;
  team2_id: string | null;
  winner_team_id: string | null;
  status: string;
  bracket_number?: number;
  bracket_type?: string;
  bracket_half?: string | null;
  next_win_match_id?: string | null;
  next_lose_match_id?: string | null;
}

export interface SchedulerBlock {
  key: string;           // e.g. "WA_R1", "LB_R2", "SEMI", "FINAL"
  label: string;         // Display label
  round: number;
  blockOrder: number;    // Global sort order
  matches: SchedulerMatch[];
  isCompleted: boolean;
  isUnlocked: boolean;
  dependencies: string[]; // Keys of blocks that must be completed first
}

type BlockCategory = 'WA' | 'WB' | 'LS' | 'LI' | 'SEMI' | 'FINAL' | 'OTHER';

function categorizeMatch(m: SchedulerMatch): BlockCategory {
  const bt = m.bracket_type || 'winners';
  const bh = m.bracket_half;
  if (bt === 'winners' && bh === 'upper') return 'WA';
  if (bt === 'winners' && bh === 'lower') return 'WB';
  if (bt === 'losers' && bh === 'upper') return 'LS';  // losers upper = Perdedores Superiores (recebe de Winners B)
  if (bt === 'losers' && bh === 'lower') return 'LI';  // losers lower = Perdedores Inferiores (recebe de Winners A)
  if (bt === 'semi_final') return 'SEMI';
  if (bt === 'final') return 'FINAL';
  return 'OTHER';
}

function blockLabel(cat: BlockCategory, round: number): string {
  switch (cat) {
    case 'WA': return `Vencedores A — Rodada ${round}`;
    case 'WB': return `Vencedores B — Rodada ${round}`;
    case 'LS': return `Perdedores Superiores — Rodada ${round}`;
    case 'LI': return `Perdedores Inferiores — Rodada ${round}`;
    case 'SEMI': return 'Semifinais';
    case 'FINAL': return 'Final';
    default: return `Outros — Rodada ${round}`;
  }
}

/**
 * Build the global scheduler blocks in strict round-interleaved order.
 */
/**
 * REST OPTIMIZATION — REGRA DE DESCANSO
 * 
 * Reordena matches DENTRO de cada bloco para evitar que uma dupla jogue
 * dois jogos consecutivos (ex: perde no jogo 44 e já joga o 45).
 * 
 * Algoritmo: Para cada bloco, identifica quais matches recebem feeders
 * de matches "tardios" no bloco anterior. Empurra esses matches para
 * o final do bloco, maximizando a distância de descanso.
 * 
 * SEGURANÇA: Não altera positions nem linkagens — apenas a ORDEM DE DISPLAY
 * dentro de cada bloco do scheduler.
 */
function optimizeBlocksForRest(blocks: SchedulerBlock[], allMatches: SchedulerMatch[]): void {
  // Build feeder map: targetMatchId → list of source match IDs that feed into it
  const feedersOf = new Map<string, string[]>();
  for (const m of allMatches) {
    if (m.next_lose_match_id) {
      if (!feedersOf.has(m.next_lose_match_id)) feedersOf.set(m.next_lose_match_id, []);
      feedersOf.get(m.next_lose_match_id)!.push(m.id);
    }
    if (m.next_win_match_id) {
      if (!feedersOf.has(m.next_win_match_id)) feedersOf.set(m.next_win_match_id, []);
      feedersOf.get(m.next_win_match_id)!.push(m.id);
    }
  }

  // Build global position map from current block order (before optimization)
  const globalPos = new Map<string, number>();
  let gPos = 0;
  for (const block of blocks) {
    for (const m of block.matches) {
      globalPos.set(m.id, gPos++);
    }
  }

  for (let bi = 1; bi < blocks.length; bi++) {
    const block = blocks[bi];
    if (block.matches.length <= 1) continue;

    // For each match in this block, compute the "latest feeder position"
    // = the highest global position among all matches that feed into it
    const latestFeederPos = (matchId: string): number => {
      const feeders = feedersOf.get(matchId) || [];
      if (feeders.length === 0) return -1;
      return Math.max(...feeders.map(fId => globalPos.get(fId) ?? -1));
    };

    // Sort: matches fed by EARLY feeders play FIRST, matches fed by LATE feeders play LAST
    // This ensures maximum rest between a feeder match and its target
    block.matches.sort((a, b) => {
      const aLatest = latestFeederPos(a.id);
      const bLatest = latestFeederPos(b.id);
      // Primary: latest feeder position ascending (early feeders first)
      if (aLatest !== bLatest) return aLatest - bLatest;
      // Secondary: original position ascending (stable sort)
      return a.position - b.position;
    });
  }
}

export function buildSchedulerBlocks(matches: SchedulerMatch[]): SchedulerBlock[] {
  // Group matches by category + round
  const groups = new Map<string, SchedulerMatch[]>();

  for (const m of matches) {
    if (m.round === 0) continue; // skip group stage
    const cat = categorizeMatch(m);
    const key = cat === 'SEMI' || cat === 'FINAL' ? cat : `${cat}_R${m.round}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(m);
  }

  // Determine all rounds used by winners/losers
  const allRounds = new Set<number>();
  for (const m of matches) {
    if (m.round > 0) {
      const cat = categorizeMatch(m);
      if (['WA', 'WB', 'LS', 'LI'].includes(cat)) allRounds.add(m.round);
    }
  }
  const sortedRounds = [...allRounds].sort((a, b) => a - b);

  const blocks: SchedulerBlock[] = [];
  let order = 0;

  // Helper to create a block with dependency calculation
  function createBlock(cat: BlockCategory, r: number) {
    const key = `${cat}_R${r}`;
    const catMatches = groups.get(key) || [];
    if (catMatches.length === 0) return;

    const deps: string[] = [];

    if (cat === 'WA' || cat === 'WB') {
      if (r > sortedRounds[0]) {
        const prevR = sortedRounds[sortedRounds.indexOf(r) - 1];
        if (prevR !== undefined) {
          // Winners R depends on previous round of WINNERS being complete (no circular dep)
          if (groups.has(`WA_R${prevR}`)) deps.push(`WA_R${prevR}`);
          if (groups.has(`WB_R${prevR}`)) deps.push(`WB_R${prevR}`);
        }
      }
    }

    if (cat === 'LS' || cat === 'LI') {
      // Losers R depends only on Winners A R + Winners B R being complete
      if (groups.has(`WA_R${r}`)) deps.push(`WA_R${r}`);
      if (groups.has(`WB_R${r}`)) deps.push(`WB_R${r}`);
    }

    // Within same category pair: WB depends on WA, LI depends on LS
    if (cat === 'WB' && groups.has(`WA_R${r}`)) deps.push(`WA_R${r}`);
    if (cat === 'LI' && groups.has(`LS_R${r}`)) deps.push(`LS_R${r}`);

    const isCompleted = catMatches.every(m => m.status === 'completed');

    blocks.push({
      key,
      label: blockLabel(cat, r),
      round: r,
      blockOrder: order++,
      matches: catMatches.sort((a, b) => a.position - b.position),
      isCompleted,
      isUnlocked: false,
      dependencies: [...new Set(deps)],
    });
  }

  // Emit blocks in strict sequential order:
  // WA R1, WB R1, LS R1, LI R1, WA R2, WB R2, LS R2, LI R2, ... → Semis → Final
  // This ensures match numbering is always sequential without jumps.
  for (const r of sortedRounds) {
    createBlock('WA', r);
    createBlock('WB', r);
    createBlock('LS', r);
    createBlock('LI', r);
  }

  // Semifinals
  const semiMatches = groups.get('SEMI') || [];
  if (semiMatches.length > 0) {
    const lastRound = sortedRounds[sortedRounds.length - 1];
    const semiDeps: string[] = [];
    // Semis depend on all losers blocks of last round
    if (lastRound !== undefined) {
      for (const cat of ['WA', 'WB', 'LS', 'LI'] as BlockCategory[]) {
        const k = `${cat}_R${lastRound}`;
        if (groups.has(k)) semiDeps.push(k);
      }
    }
    blocks.push({
      key: 'SEMI',
      label: 'Semifinais',
      round: 999,
      blockOrder: order++,
      matches: semiMatches.sort((a, b) => a.position - b.position),
      isCompleted: semiMatches.every(m => m.status === 'completed'),
      isUnlocked: false,
      dependencies: semiDeps,
    });
  }

  // Final
  const finalMatches = groups.get('FINAL') || [];
  if (finalMatches.length > 0) {
    blocks.push({
      key: 'FINAL',
      label: 'Final',
      round: 1000,
      blockOrder: order++,
      matches: finalMatches.sort((a, b) => a.position - b.position),
      isCompleted: finalMatches.every(m => m.status === 'completed'),
      isUnlocked: false,
      dependencies: semiMatches.length > 0 ? ['SEMI'] : [],
    });
  }

  // ── REST OPTIMIZATION: reorder matches within blocks to avoid back-to-back ──
  // Rule: A team that loses/wins in game N should NOT play game N+1.
  // Strategy: within each block, push matches fed by late matches in the previous block
  // to the END of the current block, maximizing rest distance.
  optimizeBlocksForRest(blocks, matches);

  // Compute unlock status — based SOLELY on match status
  const blockMap = new Map(blocks.map(b => [b.key, b]));
  for (const block of blocks) {
    block.isUnlocked = block.dependencies.every(dep => {
      const depBlock = blockMap.get(dep);
      if (!depBlock) return true; // no dependency block = unlocked
      // Check EVERY match in the dependency block — ALL must be 'completed'
      return depBlock.matches.every(m => m.status === 'completed');
    });
  }

  return blocks;
}

/**
 * Flatten scheduler blocks into an ordered match array for display.
 */
export function schedulerSequence(matches: SchedulerMatch[]): SchedulerMatch[] {
  const blocks = buildSchedulerBlocks(matches);
  return blocks.flatMap(b => b.matches);
}

/**
 * Check if a match can be started according to the scheduler.
 * Returns null if allowed, or an error message if blocked.
 */
export function validateMatchStart(matchId: string, matches: SchedulerMatch[]): string | null {
  const blocks = buildSchedulerBlocks(matches);

  for (const block of blocks) {
    const matchInBlock = block.matches.find(m => m.id === matchId);
    if (!matchInBlock) continue;

    // For each dependency, check if ANY match has status != 'completed'
    for (const dep of block.dependencies) {
      const depBlock = blocks.find(b => b.key === dep);
      if (!depBlock) continue;

      const pending = depBlock.matches.filter(m => m.status !== 'completed');
      if (pending.length > 0) {
        return `Violação de ordem de rodada detectada. Bloco pendente: ${depBlock.label} (${pending.length} jogo(s) não finalizado(s))`;
      }
    }

    return null;
  }

  return null;
}

/**
 * Get the block color for UI display.
 */
export function getSchedulerBlockColor(key: string): string {
  if (key.startsWith('WA')) return 'border-l-blue-500';
  if (key.startsWith('WB')) return 'border-l-sky-400';
  if (key.startsWith('LS')) return 'border-l-orange-500';
  if (key.startsWith('LI')) return 'border-l-amber-400';
  if (key === 'SEMI') return 'border-l-purple-500';
  if (key === 'FINAL') return 'border-l-yellow-500';
  // Group stage
  if (key.startsWith('GS')) return 'border-l-emerald-500';
  // Knockout rounds — cycle through distinct colors
  if (key.startsWith('KO_R')) {
    const round = parseInt(key.replace('KO_R', ''), 10) || 1;
    const colors = [
      'border-l-cyan-500',
      'border-l-violet-500',
      'border-l-rose-500',
      'border-l-teal-500',
      'border-l-fuchsia-500',
      'border-l-indigo-500',
    ];
    return colors[(round - 1) % colors.length];
  }
  return 'border-l-primary';
}

/**
 * Get badge color for a block key.
 */
export function getSchedulerBadgeColor(key: string): string {
  if (key.startsWith('WA')) return 'bg-blue-500/20 text-blue-600 dark:text-blue-400 border-blue-500/30';
  if (key.startsWith('WB')) return 'bg-sky-400/20 text-sky-600 dark:text-sky-400 border-sky-400/30';
  if (key.startsWith('LS')) return 'bg-orange-500/20 text-orange-600 dark:text-orange-400 border-orange-500/30';
  if (key.startsWith('LI')) return 'bg-amber-400/20 text-amber-600 dark:text-amber-400 border-amber-400/30';
  if (key === 'SEMI') return 'bg-purple-500/20 text-purple-600 dark:text-purple-400 border-purple-500/30';
  if (key === 'FINAL') return 'bg-yellow-500/20 text-yellow-600 dark:text-yellow-400 border-yellow-500/30';
  if (key.startsWith('GS')) return 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border-emerald-500/30';
  if (key.startsWith('KO_R')) {
    const round = parseInt(key.replace('KO_R', ''), 10) || 1;
    const colors = [
      'bg-cyan-500/20 text-cyan-600 dark:text-cyan-400 border-cyan-500/30',
      'bg-violet-500/20 text-violet-600 dark:text-violet-400 border-violet-500/30',
      'bg-rose-500/20 text-rose-600 dark:text-rose-400 border-rose-500/30',
      'bg-teal-500/20 text-teal-600 dark:text-teal-400 border-teal-500/30',
      'bg-fuchsia-500/20 text-fuchsia-600 dark:text-fuchsia-400 border-fuchsia-500/30',
      'bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 border-indigo-500/30',
    ];
    return colors[(round - 1) % colors.length];
  }
  return 'bg-primary/20 text-primary border-primary/30';
}
