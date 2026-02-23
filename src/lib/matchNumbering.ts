/**
 * Shared Match Numbering Utility
 * 
 * REGRA CRÍTICA: A numeração dos jogos DEVE ser idêntica entre a
 * aba Sequência (MatchSequenceViewer) e a árvore (BracketTreeView).
 * 
 * A sequência visual é a FONTE DA VERDADE — o que o organizador vê
 * na sequência é exatamente o que acontece no chaveamento.
 */

import { buildSchedulerBlocks, schedulerSequence } from "@/lib/roundScheduler";

interface NumberingMatch {
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

// ─── Round-Robin circle method (same as MatchSequenceViewer) ───
function buildRoundRobinRounds(groupMatches: NumberingMatch[]): NumberingMatch[][] {
  const teamIds = new Set<string>();
  for (const m of groupMatches) {
    if (m.team1_id) teamIds.add(m.team1_id);
    if (m.team2_id) teamIds.add(m.team2_id);
  }
  const teams = [...teamIds];
  const n = teams.length;
  if (n <= 1) return groupMatches.map(m => [m]);

  const matchByPair = new Map<string, NumberingMatch>();
  for (const m of groupMatches) {
    if (m.team1_id && m.team2_id) {
      const key = [m.team1_id, m.team2_id].sort().join('|');
      matchByPair.set(key, m);
    }
  }

  const list = [...teams];
  const BYE = '__BYE__';
  if (n % 2 !== 0) list.splice(1, 0, BYE);
  const total = list.length;
  const numRounds = total - 1;

  const ordered: NumberingMatch[] = [];
  const assigned = new Set<string>();

  for (let r = 0; r < numRounds; r++) {
    for (let i = 0; i < total / 2; i++) {
      const a = list[i];
      const b = list[total - 1 - i];
      if (a === BYE || b === BYE) continue;
      const key = [a, b].sort().join('|');
      const match = matchByPair.get(key);
      if (match && !assigned.has(match.id)) {
        ordered.push(match);
        assigned.add(match.id);
      }
    }
    const last = list.pop()!;
    list.splice(1, 0, last);
  }

  const remaining = groupMatches.filter(m => !assigned.has(m.id));
  ordered.push(...remaining);
  return ordered.map(m => [m]);
}

// ─── Group stage interleaved (same as MatchSequenceViewer) ───
function buildGroupStageInterleaved(groupMatches: NumberingMatch[]): NumberingMatch[] {
  const brackets = [...new Set(groupMatches.map(m => m.bracket_number || 1))].sort((a, b) => a - b);

  const rrByBracket: Record<number, NumberingMatch[][]> = {};
  for (const b of brackets) {
    const bMatches = groupMatches.filter(m => (m.bracket_number || 1) === b);
    rrByBracket[b] = buildRoundRobinRounds(bMatches);
  }

  const maxRRRounds = Math.max(...Object.values(rrByBracket).map(rr => rr.length), 0);
  const sequence: NumberingMatch[] = [];

  for (let ri = 0; ri < maxRRRounds; ri++) {
    const matchesPerBracket = brackets.map(b => rrByBracket[b]?.[ri] || []);
    const maxPerBracket = Math.max(...matchesPerBracket.map(m => m.length), 0);
    for (let mi = 0; mi < maxPerBracket; mi++) {
      for (let bi = 0; bi < brackets.length; bi++) {
        if (matchesPerBracket[bi]?.[mi]) {
          sequence.push(matchesPerBracket[bi][mi]);
        }
      }
    }
  }

  return sequence;
}

// ─── Conflict resolution (same as MatchSequenceViewer) ───
function hasTeamOverlap(a: NumberingMatch, b: NumberingMatch): boolean {
  const teamsA = [a.team1_id, a.team2_id].filter(Boolean);
  const teamsB = [b.team1_id, b.team2_id].filter(Boolean);
  return teamsA.some(t => teamsB.includes(t));
}

function resolveConsecutiveConflicts(sequence: NumberingMatch[]): NumberingMatch[] {
  const result = [...sequence];
  const maxPasses = result.length * 2;
  for (let pass = 0; pass < maxPasses; pass++) {
    let swapped = false;
    for (let i = 1; i < result.length; i++) {
      if (hasTeamOverlap(result[i - 1], result[i])) {
        let swapIdx = -1;
        for (let j = i + 1; j < result.length; j++) {
          if (
            !hasTeamOverlap(result[i - 1], result[j]) &&
            (i + 1 >= result.length || !hasTeamOverlap(result[j], result[i + 1]))
          ) {
            swapIdx = j;
            break;
          }
        }
        if (swapIdx !== -1) {
          [result[i], result[swapIdx]] = [result[swapIdx], result[i]];
          swapped = true;
        }
      }
    }
    if (!swapped) break;
  }
  return result;
}

// ─── Normal elimination interleaved sequence (same as MatchSequenceViewer) ───
function generateInterleavedSequence(matches: NumberingMatch[]): NumberingMatch[] {
  const groupStage = matches.filter(m => m.round === 0);
  const knockout = matches.filter(m => m.round > 0);

  const groupSequence = groupStage.length > 0
    ? buildGroupStageInterleaved(groupStage)
    : [];

  // Knockout: group paired matches (same next_win_match_id) together
  const kRounds = [...new Set(knockout.map(m => m.round))].sort((a, b) => a - b);
  const knockoutInterleaved: NumberingMatch[] = [];
  for (const round of kRounds) {
    const roundMatches = knockout.filter(m => m.round === round);
    const byNextMatch = new Map<string, NumberingMatch[]>();
    for (const m of roundMatches) {
      const key = m.next_win_match_id || `solo_${m.id}`;
      if (!byNextMatch.has(key)) byNextMatch.set(key, []);
      byNextMatch.get(key)!.push(m);
    }
    const groups = [...byNextMatch.values()].map(g => g.sort((a, b) => a.position - b.position));
    groups.sort((a, b) => a[0].position - b[0].position);
    for (const group of groups) {
      knockoutInterleaved.push(...group);
    }
  }

  const resolvedGroups = resolveConsecutiveConflicts(groupSequence);
  return [...resolvedGroups, ...knockoutInterleaved];
}

// ─── Filter phantom matches (same as MatchSequenceViewer) ───
function filterPhantomMatches(matches: NumberingMatch[], tournamentFormat: string): NumberingMatch[] {
  if (tournamentFormat === 'double_elimination') return matches;
  
  const knockoutWithTeams = matches.filter(m => m.round > 0 && m.bracket_type !== 'third_place' && m.team1_id && m.team2_id);
  const roundCounts: Record<number, number> = {};
  knockoutWithTeams.forEach(m => { roundCounts[m.round] = (roundCounts[m.round] || 0) + 1; });
  const sortedRounds = Object.keys(roundCounts).map(Number).sort((a, b) => a - b);
  let finalRound = -1;
  for (const r of sortedRounds) {
    if (roundCounts[r] === 1) { finalRound = r; break; }
  }
  if (finalRound > 0) {
    const thirdPlaceWithTeams = matches.filter(m => m.bracket_type === 'third_place' && m.team1_id && m.team2_id);
    const realThirdPlaceIds = new Set(
      thirdPlaceWithTeams.length > 0
        ? [thirdPlaceWithTeams.reduce((earliest, m) => m.round < earliest.round ? m : earliest, thirdPlaceWithTeams[0]).id]
        : []
    );
    return matches.filter(m => {
      if (m.round === 0) return true;
      if (m.bracket_type === 'third_place') return realThirdPlaceIds.has(m.id);
      if (m.round > finalRound) return false;
      return true;
    });
  }
  return matches;
}

/**
 * Build the canonical match number map.
 * This is the SINGLE SOURCE OF TRUTH for match numbering across all views.
 */
export function buildMatchNumberMap(matches: NumberingMatch[], tournamentFormat: string): Map<string, number> {
  const cleanMatches = filterPhantomMatches(matches, tournamentFormat);
  const map = new Map<string, number>();
  let num = 1;

  if (tournamentFormat !== 'double_elimination') {
    // Chaveamento Normal: use conflict-resolved displaySequence for numbering
    const displaySequence = generateInterleavedSequence(cleanMatches);

    // First: all non-final non-third_place matches
    for (const m of displaySequence) {
      if (!map.has(m.id) && m.bracket_type !== 'third_place') {
        const isInFinalRound = displaySequence.filter(x => x.bracket_type !== 'third_place' && x.round > 0);
        const maxRound = isInFinalRound.length > 0 ? Math.max(...isInFinalRound.map(x => x.round)) : -1;
        if (m.round === maxRound && m.round > 0) continue; // defer final
        map.set(m.id, num++);
      }
    }
    // Then: 3rd place matches
    for (const m of cleanMatches) {
      if (!map.has(m.id) && m.bracket_type === 'third_place') {
        map.set(m.id, num++);
      }
    }
    // Then: final matches
    for (const m of displaySequence) {
      if (!map.has(m.id)) {
        map.set(m.id, num++);
      }
    }
    // Safety net
    for (const m of matches) {
      if (!map.has(m.id)) map.set(m.id, num++);
    }
    return map;
  }

  // Dupla Eliminação: scheduler-based numbering
  const groupMatches = cleanMatches.filter(m => m.round === 0);
  if (groupMatches.length > 0) {
    const gsSeq = buildGroupStageInterleaved(groupMatches);
    for (const m of gsSeq) {
      map.set(m.id, num++);
    }
  }
  const seq = schedulerSequence(cleanMatches as any);
  for (const m of seq) {
    if (!map.has(m.id)) {
      map.set(m.id, num++);
    }
  }
  // Safety net
  for (const m of matches) {
    if (!map.has(m.id)) map.set(m.id, num++);
  }
  return map;
}
