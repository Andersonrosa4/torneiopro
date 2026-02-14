import { useState, useMemo, useEffect, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Trophy, Save, Download, FileText, Sheet, Pencil, Lock, CheckCircle2, Clock, AlertCircle, ListOrdered } from "lucide-react";
import { exportMatchSequence } from "@/lib/exportUtils";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { getEliminationRoundLabel, getEliminationRoundShortLabel } from "@/lib/roundLabels";
import { buildSchedulerBlocks, schedulerSequence, getSchedulerBlockColor, getSchedulerBadgeColor, type SchedulerBlock } from "@/lib/roundScheduler";

/* Helper: Convert number to letter (1→A, 2→B, etc) */
const numberToLetter = (num: number): string => {
  return String.fromCharCode(64 + num);
};

interface Match {
  id: string;
  round: number;
  position: number;
  team1_id: string | null;
  team2_id: string | null;
  score1: number | null;
  score2: number | null;
  winner_team_id: string | null;
  status: string;
  bracket_number?: number;
  bracket_type?: string;
  bracket_half?: string | null;
}

interface Team {
  id: string;
  player1_name: string;
  player2_name: string;
}

interface MatchSequenceViewerProps {
  matches: Match[];
  teams: Team[];
  isOwner: boolean;
  numSets: number;
  tournamentName?: string;
  sport?: string;
  eventDate?: string;
  tournamentFormat?: string;
  onDeclareWinner: (matchId: string, winnerId: string) => void;
  onUpdateScore: (matchId: string, score1: number, score2: number) => void;
  onAutoResult?: (matchId: string, score1: number, score2: number, winnerId: string) => void;
}

// ─── Sequence Generation Logic ───────────────────────────────

function generateSequence(matches: Match[], tournamentFormat: string): Match[] {
  if (matches.length === 0) return [];
  if (tournamentFormat === 'double_elimination') {
    return generateDoubleEliminationSequence(matches);
  }
  return generateInterleavedSequence(matches);
}

function generateDoubleEliminationSequence(matches: Match[]): Match[] {
  const groupStage = matches.filter(m => m.round === 0);
  const elimination = matches.filter(m => m.round > 0);

  const groupInterleaved: Match[] = [];
  if (groupStage.length > 0) {
    const brackets = [...new Set(groupStage.map(m => m.bracket_number || 1))].sort((a, b) => a - b);
    const positions = [...new Set(groupStage.map(m => m.position))].sort((a, b) => a - b);
    for (const pos of positions) {
      for (const b of brackets) {
        const match = groupStage.find(m => (m.bracket_number || 1) === b && m.position === pos);
        if (match) groupInterleaved.push(match);
      }
    }
  }

  // Always use scheduler blocks for double elimination to enforce WA → WB → LS → LI order
  const blocks = buildSchedulerBlocks(elimination as any);
  if (blocks.length > 0) {
    return [...groupInterleaved, ...blocks.flatMap(b => b.matches as Match[])];
  }

  // Fallback: sort by bracket_half (upper/WA first, then lower/WB) within each round
  const sorted = [...elimination].sort((a, b) => {
    if (a.round !== b.round) return a.round - b.round;
    const halfOrder = (h: string | null | undefined) => h === 'upper' ? 0 : h === 'lower' ? 1 : 2;
    const ha = halfOrder(a.bracket_half);
    const hb = halfOrder(b.bracket_half);
    if (ha !== hb) return ha - hb;
    return a.position - b.position;
  });
  return [...groupInterleaved, ...sorted];
}

function resolveByeConflicts(sequence: Match[]): Match[] {
  const result = [...sequence];
  for (let i = 1; i < result.length; i++) {
    if (hasTeamOverlap(result[i - 1], result[i])) {
      const currentBracketType = result[i].bracket_type;
      const currentBracketHalf = result[i].bracket_half;
      let swapIdx = -1;
      for (let j = i + 1; j < result.length; j++) {
        if (result[j].bracket_type !== currentBracketType || result[j].bracket_half !== currentBracketHalf) break;
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
      }
    }
  }
  return result;
}

function generateInterleavedSequence(matches: Match[]): Match[] {
  const rounds = [...new Set(matches.map((m) => m.round))].sort((a, b) => a - b);
  const brackets = [...new Set(matches.map((m) => m.bracket_number || 1))].sort((a, b) => a - b);
  const interleaved: Match[] = [];
  for (const round of rounds) {
    const roundMatches = matches.filter((m) => m.round === round);
    const byBracket: Record<number, Match[]> = {};
    for (const b of brackets) {
      byBracket[b] = roundMatches
        .filter((m) => (m.bracket_number || 1) === b)
        .sort((a, b2) => a.position - b2.position);
    }
    const maxLen = Math.max(...Object.values(byBracket).map((a) => a.length), 0);
    for (let i = 0; i < maxLen; i++) {
      for (const b of brackets) {
        if (byBracket[b]?.[i]) interleaved.push(byBracket[b][i]);
      }
    }
  }
  return resolveConsecutiveConflicts(interleaved);
}

function resolveConsecutiveConflicts(sequence: Match[]): Match[] {
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

function hasTeamOverlap(a: Match, b: Match): boolean {
  const teamsA = [a.team1_id, a.team2_id].filter(Boolean);
  const teamsB = [b.team1_id, b.team2_id].filter(Boolean);
  return teamsA.some((t) => teamsB.includes(t));
}

// ─── Helpers ─────────────────────────────────────

function getMatchGroupId(match: Match): string {
  if (match.round === 0) return `Grupo ${numberToLetter(match.bracket_number || 1)}`;
  if (match.bracket_type === 'winners' && match.bracket_half) return `Vencedores ${match.bracket_half === 'upper' ? 'A' : 'B'}`;
  if (match.bracket_type === 'losers') return `Perdedores ${match.bracket_half === 'upper' ? 'Sup.' : 'Inf.'}`;
  if (match.bracket_type === 'semi_final') return `Semifinal`;
  if (match.bracket_type === 'final') return 'Final';
  return `Chave ${match.bracket_number || 1}`;
}

function getRoundShortLabel(round: number, matchCountInRound: number): string {
  return getEliminationRoundShortLabel(round, matchCountInRound);
}

/* ═══════════════════════════════════════════
   Progress Summary
   ═══════════════════════════════════════════ */
const ProgressSummary = ({ total, completed, pending }: { total: number; completed: number; pending: number }) => {
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
  return (
    <div className="rounded-xl border border-border bg-card/80 backdrop-blur-sm p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ListOrdered className="h-4 w-4 text-primary" />
          <span className="text-sm font-bold text-foreground">Progresso do Torneio</span>
        </div>
        <span className="text-xs font-mono font-bold text-primary">{pct}%</span>
      </div>
      <div className="h-2 rounded-full bg-muted overflow-hidden">
        <div
          className="h-full rounded-full bg-gradient-to-r from-primary to-accent transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="flex items-center gap-4 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1"><CheckCircle2 className="h-3 w-3 text-success" /> {completed} finalizadas</span>
        <span className="flex items-center gap-1"><Clock className="h-3 w-3 text-warning" /> {pending} pendentes</span>
        <span className="flex items-center gap-1"><AlertCircle className="h-3 w-3 text-muted-foreground/50" /> {total - completed - pending} aguardando</span>
      </div>
    </div>
  );
};

/* ═══════════════════════════════════════════
   Match Card (with admin controls)
   ═══════════════════════════════════════════ */
interface MatchCardProps {
  match: Match;
  index: number;
  getTeamName: (id: string | null) => string;
  getRoundLabel: (round: number) => string;
  isOwner: boolean;
  numSets: number;
  onDeclareWinner: (matchId: string, winnerId: string) => void;
  onUpdateScore: (matchId: string, score1: number, score2: number) => void;
  onAutoResult?: (matchId: string, score1: number, score2: number, winnerId: string) => void;
}

const MatchCard = ({
  match,
  index,
  getTeamName,
  getRoundLabel,
  isOwner,
  numSets,
  onDeclareWinner,
  onUpdateScore,
  onAutoResult,
}: MatchCardProps) => {
  const initSets = () => {
    const sets: { s1: string; s2: string }[] = [];
    for (let i = 0; i < numSets; i++) sets.push({ s1: "0", s2: "0" });
    return sets;
  };

  const [setScores, setSetScores] = useState(initSets);
  const [isEditing, setIsEditing] = useState(false);

  useEffect(() => {
    setSetScores(initSets());
  }, [numSets, match.id]);

  const isCompleted = match.status === "completed";
  const team1Name = getTeamName(match.team1_id);
  const team2Name = getTeamName(match.team2_id);
  const hasTeams = match.team1_id && match.team2_id;
  const hasOneTeam = (match.team1_id && !match.team2_id) || (!match.team1_id && match.team2_id);
  const canScore = isOwner && hasTeams && (!isCompleted || isEditing);
  const t1Win = match.winner_team_id === match.team1_id && isCompleted;
  const t2Win = match.winner_team_id === match.team2_id && isCompleted;

  const setsWon = useMemo(() => {
    let t1 = 0, t2 = 0;
    for (const s of setScores) {
      const s1 = Number(s.s1) || 0;
      const s2 = Number(s.s2) || 0;
      if (s1 > s2) t1++;
      else if (s2 > s1) t2++;
    }
    return { t1, t2 };
  }, [setScores]);

  const totalScore1 = setScores.reduce((sum, s) => sum + (Number(s.s1) || 0), 0);
  const totalScore2 = setScores.reduce((sum, s) => sum + (Number(s.s2) || 0), 0);

  const autoWinnerId = useMemo(() => {
    const majority = Math.ceil(numSets / 2);
    if (setsWon.t1 >= majority && match.team1_id) return match.team1_id;
    if (setsWon.t2 >= majority && match.team2_id) return match.team2_id;
    return null;
  }, [setsWon, numSets, match.team1_id, match.team2_id]);

  const handleSaveScoreOnly = () => {
    onUpdateScore(match.id, totalScore1, totalScore2);
  };

  const updateSetScore = (setIdx: number, field: "s1" | "s2", value: string) => {
    setSetScores((prev) => {
      const copy = [...prev];
      copy[setIdx] = { ...copy[setIdx], [field]: value };
      return copy;
    });
  };

  const handleDeclareTeamWinner = (winnerId: string) => {
    if (totalScore1 > 0 || totalScore2 > 0) {
      if (onAutoResult) {
        onAutoResult(match.id, totalScore1, totalScore2, winnerId);
      } else {
        onUpdateScore(match.id, totalScore1, totalScore2);
        onDeclareWinner(match.id, winnerId);
      }
    } else {
      if (onAutoResult) {
        onAutoResult(match.id, 0, 0, winnerId);
      } else {
        onUpdateScore(match.id, 0, 0);
        onDeclareWinner(match.id, winnerId);
      }
    }
    setIsEditing(false);
  };

  return (
    <div
      className={`group relative flex items-stretch rounded-lg border bg-card transition-all hover:shadow-md ${
        isCompleted
          ? "border-success/25"
          : hasTeams
          ? "border-primary/20 hover:border-primary/40"
          : "border-border/60"
      }`}
    >
      {/* Number column */}
      <div className={`flex flex-col items-center justify-center w-11 shrink-0 rounded-l-lg ${
        isCompleted ? "bg-success/10 text-success" : hasTeams ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
      }`}>
        <span className="text-[7px] uppercase font-black leading-none mb-0.5 opacity-70">Jogo</span>
        <span className="text-sm font-black tabular-nums leading-none">{index}</span>
      </div>

      {/* Main content */}
      <div className="flex-1 min-w-0 px-3 py-1.5 space-y-0.5">
        {/* Header: round badge + status */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <Badge variant="outline" className="text-[9px] shrink-0 font-semibold px-1.5 py-0 border-border/50">
            {getRoundLabel(match.round)}
          </Badge>
          {hasOneTeam && <Badge className="bg-muted text-muted-foreground border-border text-[9px] px-1.5 py-0">Chapéu</Badge>}
          {isCompleted && !isEditing && <Trophy className="h-3 w-3 text-success ml-auto shrink-0" />}
          {!isCompleted && hasTeams && (
            <Badge className="bg-warning/15 text-warning border-0 text-[9px] px-1.5 py-0 ml-auto">Pendente</Badge>
          )}
        </div>

        {/* Teams */}
        <div className="flex flex-col gap-0">
          <div className="flex items-center gap-1.5 min-h-[22px]">
            <span className={`text-xs flex-1 truncate ${t1Win ? "text-success font-bold" : match.team1_id === null ? "text-muted-foreground italic" : "text-foreground"}`}>
              {match.team1_id ? team1Name : "Chapéu"}
            </span>
            {isOwner && hasTeams && !isCompleted && match.team1_id && (
              <Button size="sm" variant="ghost" className="h-5 px-1.5 text-[10px] gap-0.5 text-primary hover:bg-primary/10 shrink-0"
                onClick={() => handleDeclareTeamWinner(match.team1_id!)}>
                <Trophy className="h-3 w-3" /> Vencedor
              </Button>
            )}
          </div>
          <span className="text-[10px] text-muted-foreground/50 pl-0.5">vs</span>
          <div className="flex items-center gap-1.5 min-h-[22px]">
            <span className={`text-xs flex-1 truncate ${t2Win ? "text-success font-bold" : match.team2_id === null ? "text-muted-foreground italic" : "text-foreground"}`}>
              {match.team2_id ? team2Name : "Chapéu"}
            </span>
            {isOwner && hasTeams && !isCompleted && match.team2_id && (
              <Button size="sm" variant="ghost" className="h-5 px-1.5 text-[10px] gap-0.5 text-primary hover:bg-primary/10 shrink-0"
                onClick={() => handleDeclareTeamWinner(match.team2_id!)}>
                <Trophy className="h-3 w-3" /> Vencedor
              </Button>
            )}
          </div>
        </div>

        {/* Score editing with sets */}
        {hasTeams && canScore && (
          <div className="space-y-1 mt-0.5 pt-1 border-t border-border/30">
            <div className="flex items-center gap-1.5 flex-wrap">
              {setScores.map((s, idx) => (
                <div key={idx} className="flex items-center gap-0.5">
                  <span className="text-[9px] text-muted-foreground font-medium">S{idx + 1}</span>
                  <Input value={s.s1} onChange={(e) => updateSetScore(idx, "s1", e.target.value)} className="h-6 w-9 text-center text-[11px] p-0" />
                  <span className="text-[10px] text-muted-foreground">×</span>
                  <Input value={s.s2} onChange={(e) => updateSetScore(idx, "s2", e.target.value)} className="h-6 w-9 text-center text-[11px] p-0" />
                  {idx < setScores.length - 1 && <span className="text-muted-foreground/40 mx-0.5">|</span>}
                </div>
              ))}
            </div>
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[10px] text-muted-foreground tabular-nums">
                {totalScore1}×{totalScore2} | Sets: {setsWon.t1}×{setsWon.t2}
              </span>
              {autoWinnerId && (
                <Badge className="bg-success/15 text-success border-0 text-[9px] px-1.5 py-0">
                  Vencedor: {getTeamName(autoWinnerId).split(" / ")[0]}
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-1.5 flex-wrap">
              <Button size="sm" variant="outline" className="h-5 px-2 text-[10px] gap-0.5" onClick={handleSaveScoreOnly}>
                <Save className="h-3 w-3" /> Salvar
              </Button>
              {isEditing && (
                <Button size="sm" variant="ghost" className="h-5 px-2 text-[10px]" onClick={() => setIsEditing(false)}>
                  Cancelar
                </Button>
              )}
            </div>
          </div>
        )}

        {/* Completed score display */}
        {hasTeams && !canScore && (
          <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
            <span className="text-sm font-mono font-bold tabular-nums">
              {match.score1 ?? "-"} <span className="text-muted-foreground/40">×</span> {match.score2 ?? "-"}
            </span>
            {isCompleted && match.winner_team_id && (
              <Badge className="bg-success/15 text-success border-0 text-[9px] px-1.5 py-0">
                {getTeamName(match.winner_team_id)}
              </Badge>
            )}
            {isOwner && isCompleted && (
              <Button size="sm" variant="ghost" className="h-5 px-1.5 text-[10px] gap-0.5 ml-auto" onClick={() => setIsEditing(true)}>
                <Pencil className="h-3 w-3" /> Corrigir
              </Button>
            )}
          </div>
        )}

        {/* Chapéu slot */}
        {hasOneTeam && (
          <div className="flex items-center gap-1.5 px-0.5 py-0.5 rounded bg-muted/20">
            <span className="text-[10px] text-muted-foreground italic">Aguardando adversário...</span>
          </div>
        )}
      </div>
    </div>
  );
};

/* ═══════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════ */
const MatchSequenceViewer = ({
  matches,
  teams,
  isOwner,
  numSets,
  tournamentName = "",
  sport = "",
  eventDate,
  tournamentFormat = 'single_elimination',
  onDeclareWinner,
  onUpdateScore,
  onAutoResult,
}: MatchSequenceViewerProps) => {
  const getTeamName = (teamId: string | null) => {
    if (!teamId) return "A definir";
    const team = teams.find((t) => t.id === teamId);
    return team ? `${team.player1_name} / ${team.player2_name}` : "A definir";
  };

  const sequence = useMemo(() => generateSequence(matches, tournamentFormat), [matches, tournamentFormat]);
  const displaySequence = useMemo(() => sequence, [sequence]);

  // Build match number map from scheduler (same as bracket view) for consistent numbering
  const matchNumberMap = useMemo(() => {
    const seq = schedulerSequence(matches as any);
    const map = new Map<string, number>();
    seq.forEach((m, i) => map.set(m.id, i + 1));
    // Also number group stage and other matches not in scheduler
    let next = map.size + 1;
    for (const m of matches) {
      if (!map.has(m.id)) map.set(m.id, next++);
    }
    return map;
  }, [matches]);

  const matchCountByRound = useMemo(() => {
    const counts: Record<number, number> = {};
    matches.forEach(m => { counts[m.round] = (counts[m.round] || 0) + 1; });
    return counts;
  }, [matches]);

  const getRoundLabel = (round: number) => {
    return getEliminationRoundLabel(round, matchCountByRound[round] || 0);
  };

  // Build bracket blocks
  const bracketBlocks = useMemo(() => {
    if (displaySequence.length === 0) return [];

    if (tournamentFormat === 'double_elimination') {
      const blocks: { label: string; matches: { match: Match; globalIndex: number }[]; blockKey: string; isUnlocked: boolean; isCompleted: boolean }[] = [];

      const groupStage = displaySequence.filter(m => m.round === 0);
      if (groupStage.length > 0) {
        const bracketCount = new Set(groupStage.map(m => m.bracket_number || 1)).size;
        const matchesPerRound = Math.max(bracketCount, 1);
        let roundNum = 1;
        for (let i = 0; i < groupStage.length; i += matchesPerRound) {
          const chunk = groupStage.slice(i, i + matchesPerRound);
          blocks.push({
            label: `Fase de Grupos — Rodada ${roundNum}`,
            matches: chunk.map(m => ({ match: m, globalIndex: matchNumberMap.get(m.id) ?? 0 })),
            blockKey: `GS_R${roundNum}`,
            isUnlocked: true,
            isCompleted: chunk.every(m => m.status === 'completed'),
          });
          roundNum++;
        }
      }

      const eliminationMatches = matches.filter(m => m.round > 0);
      const hasDoubleElimStructure = eliminationMatches.some(m => m.bracket_half) || tournamentFormat === 'double_elimination';
      if (hasDoubleElimStructure) {
        const schedulerBlocks = buildSchedulerBlocks(eliminationMatches);
        for (const sb of schedulerBlocks) {
          const blockMatches = sb.matches.filter(m => m.team1_id && m.team2_id);
          if (blockMatches.length === 0) continue;
          const mappedMatches = blockMatches
            .map(m => ({ match: m as Match, globalIndex: matchNumberMap.get(m.id) ?? 0 }))
            .sort((a, b) => a.globalIndex - b.globalIndex);
          blocks.push({
            label: sb.label,
            matches: mappedMatches,
            blockKey: sb.key,
            isUnlocked: sb.isUnlocked,
            isCompleted: sb.isCompleted,
          });
        }
      } else {
        const knockoutDisplay = displaySequence.filter(m => m.round > 0);
        const knockoutRounds = [...new Set(knockoutDisplay.map(m => m.round))].sort((a, b) => a - b);
        for (const r of knockoutRounds) {
          const roundMatches = knockoutDisplay.filter(m => m.round === r);
          blocks.push({
            label: getEliminationRoundLabel(r, matchCountByRound[r] || 0),
            matches: roundMatches.map(m => ({ match: m, globalIndex: matchNumberMap.get(m.id) ?? 0 })),
            blockKey: `KO_R${r}`,
            isUnlocked: true,
            isCompleted: roundMatches.every(m => m.status === 'completed'),
          });
        }
      }
      return blocks;
    }

    // Non-DE
    const groups: { label: string; matches: { match: Match; globalIndex: number }[]; blockKey?: string; isCompleted?: boolean }[] = [];
    const groupStage = displaySequence.filter(m => m.round === 0);
    const knockoutStage = displaySequence.filter(m => m.round > 0);

    if (groupStage.length > 0) {
      const bracketCount = new Set(groupStage.map(m => m.bracket_number || 1)).size;
      const matchesPerRound = Math.max(bracketCount, 1);
      let roundNum = 1;
      for (let i = 0; i < groupStage.length; i += matchesPerRound) {
        const chunk = groupStage.slice(i, i + matchesPerRound);
        groups.push({
          label: `Fase de Grupos — Rodada ${roundNum}`,
          matches: chunk.map(m => ({ match: m, globalIndex: matchNumberMap.get(m.id) ?? 0 })),
          blockKey: `GS_R${roundNum}`,
          isCompleted: chunk.every(m => m.status === 'completed'),
        });
        roundNum++;
      }
    }

    if (knockoutStage.length > 0) {
      const knockoutRounds = [...new Set(knockoutStage.map(m => m.round))].sort((a, b) => a - b);
      for (const r of knockoutRounds) {
        const roundMatches = knockoutStage.filter(m => m.round === r);
        groups.push({
          label: getRoundLabel(r),
          matches: roundMatches.map(m => ({ match: m, globalIndex: matchNumberMap.get(m.id) ?? 0 })),
          blockKey: `KO_R${r}`,
          isCompleted: roundMatches.every(m => m.status === 'completed'),
        });
      }
    }

    // Sort matches within each block by their matchNumberMap order
    for (const g of groups) {
      g.matches.sort((a, b) => a.globalIndex - b.globalIndex);
    }
    return groups;
  }, [displaySequence, matches, matchCountByRound, matchNumberMap, tournamentFormat]);

  // Stats
  const realMatches = useMemo(() => matches.filter(m => m.team1_id && m.team2_id), [matches]);
  const completedCount = useMemo(() => realMatches.filter(m => m.status === "completed").length, [realMatches]);
  const pendingCount = useMemo(() => realMatches.filter(m => m.status !== "completed").length, [realMatches]);

  if (displaySequence.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-card/50 p-12 text-center">
        <p className="text-muted-foreground">Gere o chaveamento primeiro para ver a sequência de partidas.</p>
      </div>
    );
  }

  const handleExport = (format: "pdf" | "xlsx" | "csv") => {
    const meta = { tournamentName, sport, date: eventDate };
    const rows = sequence.map((m, idx) => ({
      order: idx + 1,
      round: getRoundLabel(m.round),
      group: getMatchGroupId(m),
      team1: getTeamName(m.team1_id),
      team2: getTeamName(m.team2_id),
      score: m.status === "completed" ? `${m.score1 ?? 0} × ${m.score2 ?? 0}` : "-",
      winner: m.winner_team_id ? getTeamName(m.winner_team_id) : "-",
      status: m.status === "completed" ? "Finalizado" : "Pendente",
    }));
    exportMatchSequence(format, rows, meta);
  };

  const isDoubleElim = tournamentFormat === 'double_elimination';

  return (
    <section className="space-y-4">
      {/* Header with export */}
      <div className="flex items-center justify-between">
        <ProgressSummary total={realMatches.length} completed={completedCount} pending={pendingCount} />
      </div>

      {/* Export button */}
      <div className="flex justify-end">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="gap-1.5 text-xs">
              <Download className="h-3.5 w-3.5" /> Exportar
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem onClick={() => handleExport("pdf")}>
              <FileText className="h-4 w-4 mr-2" /> PDF
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleExport("xlsx")}>
              <Sheet className="h-4 w-4 mr-2" /> Excel (.xlsx)
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleExport("csv")}>
              <FileText className="h-4 w-4 mr-2" /> CSV
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Blocks */}
      {bracketBlocks.map((block) => {
        const blockKey = (block as any).blockKey || '';
        const isUnlocked = (block as any).isUnlocked ?? true;
        const isBlockCompleted = (block as any).isCompleted ?? false;
        const borderColor = getSchedulerBlockColor(blockKey);
        const badgeColor = getSchedulerBadgeColor(blockKey);
        const completedInBlock = block.matches.filter(e => e.match.status === "completed").length;
        const totalInBlock = block.matches.length;
        const blockPct = totalInBlock > 0 ? Math.round((completedInBlock / totalInBlock) * 100) : 0;

        return (
          <div
            key={block.label}
            className={`rounded-xl border bg-card/30 overflow-hidden border-l-4 ${borderColor} ${!isUnlocked && isDoubleElim ? 'opacity-40' : ''}`}
          >
            {/* Block header — highly visible */}
            <div className={`px-4 py-3 border-b border-border/50 ${badgeColor.split(' ').filter(c => c.startsWith('bg-'))[0] || 'bg-muted/20'}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <h3 className={`text-sm font-black tracking-tight drop-shadow-[0_0_8px_rgba(255,255,255,0.4)] ${badgeColor.split(' ').filter(c => c.startsWith('text-') || c.startsWith('dark:text-')).join(' ') || 'text-foreground'}`} style={{ textShadow: '0 0 10px currentColor, 0 1px 3px rgba(0,0,0,0.8)' }}>
                    {block.label}
                  </h3>
                  {isDoubleElim && !isUnlocked && (
                    <Badge variant="outline" className="text-[9px] gap-0.5 text-muted-foreground border-border/50 px-1.5 py-0">
                      <Lock className="h-2.5 w-2.5" /> Bloqueado
                    </Badge>
                  )}
                  {isBlockCompleted && (
                    <Badge className="bg-success/15 text-success border-0 text-[9px] px-1.5 py-0">
                      <CheckCircle2 className="h-2.5 w-2.5 mr-0.5" /> Concluído
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-muted-foreground tabular-nums">{completedInBlock}/{totalInBlock}</span>
                  <div className="w-16 h-1.5 rounded-full bg-muted overflow-hidden">
                    <div className="h-full rounded-full bg-success transition-all duration-300" style={{ width: `${blockPct}%` }} />
                  </div>
                </div>
              </div>
            </div>

            {/* Match cards */}
            <div className="p-2 grid gap-1.5 grid-cols-1 sm:grid-cols-2 lg:grid-cols-[repeat(auto-fill,minmax(280px,1fr))]">
              {block.matches.map(({ match, globalIndex }) => (
                <MatchCard
                  key={match.id}
                  match={match}
                  index={globalIndex}
                  getTeamName={getTeamName}
                  getRoundLabel={(r) => getRoundShortLabel(r, matchCountByRound[r] || 0)}
                  isOwner={isOwner}
                  numSets={numSets}
                  onDeclareWinner={onDeclareWinner}
                  onUpdateScore={onUpdateScore}
                  onAutoResult={onAutoResult}
                />
              ))}
            </div>
          </div>
        );
      })}
    </section>
  );
};

export default MatchSequenceViewer;
