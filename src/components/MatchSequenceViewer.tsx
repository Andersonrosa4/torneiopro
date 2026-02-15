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
  const groupStage = matches.filter(m => m.round === 0);
  const knockout = matches.filter(m => m.round > 0);

  // Group stage: use proper round-robin rounds (no team plays twice per round)
  const groupSequence = groupStage.length > 0
    ? buildGroupStageInterleaved(groupStage).sequence
    : [];

  // Knockout: original interleaving by bracket
  const kRounds = [...new Set(knockout.map(m => m.round))].sort((a, b) => a - b);
  const kBrackets = [...new Set(knockout.map(m => m.bracket_number || 1))].sort((a, b) => a - b);
  const knockoutInterleaved: Match[] = [];
  for (const round of kRounds) {
    const roundMatches = knockout.filter(m => m.round === round);
    const byBracket: Record<number, Match[]> = {};
    for (const b of kBrackets) {
      byBracket[b] = roundMatches
        .filter(m => (m.bracket_number || 1) === b)
        .sort((a, b2) => a.position - b2.position);
    }
    const maxLen = Math.max(...Object.values(byBracket).map(a => a.length), 0);
    for (let i = 0; i < maxLen; i++) {
      for (const b of kBrackets) {
        if (byBracket[b]?.[i]) knockoutInterleaved.push(byBracket[b][i]);
      }
    }
  }

  return [...groupSequence, ...resolveConsecutiveConflicts(knockoutInterleaved)];
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

/** Organize group matches into rounds: 1 match per group per rodada.
 *  Each position = one rodada. Sorted by position so the interleaving
 *  produces Rodada 1 = pos 1 of each group, Rodada 2 = pos 2, etc. */
function buildRoundRobinRounds(groupMatches: Match[]): Match[][] {
  return groupMatches
    .sort((a, b) => a.position - b.position)
    .map(m => [m]);
}

/** Build interleaved group stage sequence with proper round-robin rounds across brackets */
function buildGroupStageInterleaved(groupMatches: Match[]): { sequence: Match[]; roundBoundaries: number[] } {
  const brackets = [...new Set(groupMatches.map(m => m.bracket_number || 1))].sort((a, b) => a - b);

  const rrByBracket: Record<number, Match[][]> = {};
  for (const b of brackets) {
    const bMatches = groupMatches.filter(m => (m.bracket_number || 1) === b);
    rrByBracket[b] = buildRoundRobinRounds(bMatches);
  }

  const maxRRRounds = Math.max(...Object.values(rrByBracket).map(rr => rr.length), 0);
  const sequence: Match[] = [];
  const roundBoundaries: number[] = [];

  for (let ri = 0; ri < maxRRRounds; ri++) {
    roundBoundaries.push(sequence.length);
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

  return { sequence, roundBoundaries };
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

/** For DE tournaments, return a bracket-aware label instead of count-based "Quartas/Oitavas" */
function getDERoundBadgeLabel(match: Match): string {
  if (match.round === 0) return 'Fase de Grupos';
  if (match.bracket_type === 'final') return 'Grande Final';
  if (match.bracket_type === 'semi_final') return 'Semifinal';
  if (match.bracket_type === 'winners') {
    const half = match.bracket_half === 'upper' ? 'A' : 'B';
    return `Venc. ${half} — R${match.round}`;
  }
  if (match.bracket_type === 'losers') {
    const half = match.bracket_half === 'upper' ? 'Sup.' : 'Inf.';
    return `Perd. ${half} — R${match.round}`;
  }
  return `R${match.round}`;
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
  tournamentFormat: string;
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
  tournamentFormat,
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
      className={`group relative rounded-lg border bg-card/95 backdrop-blur-sm transition-all ${
        isCompleted
          ? "border-success/40 shadow-[0_0_8px_rgba(34,197,94,0.12)]"
          : hasTeams
          ? "border-primary/25 hover:border-primary/40"
          : "border-border/30 opacity-75"
      }`}
    >
      {/* Top bar: JOGO N + badge + status */}
      <div className="flex items-center justify-between px-2.5 py-1 border-b border-border/15 bg-muted/10">
        <div className="flex items-center gap-2">
          <span className={`text-[10px] font-black uppercase tracking-wider ${isCompleted ? "text-success" : hasTeams ? "text-primary" : "text-muted-foreground"}`}>
            Jogo {index}
          </span>
          <Badge variant="outline" className="text-[8px] font-semibold px-1 py-0 border-border/30 bg-transparent leading-none">
            {tournamentFormat === 'double_elimination' ? getDERoundBadgeLabel(match) : getRoundLabel(match.round)}
          </Badge>
          {hasOneTeam && <Badge className="bg-muted text-muted-foreground border-border text-[8px] px-1 py-0">Chapéu</Badge>}
        </div>
        {isCompleted && !isEditing && (
          <Badge className="bg-success/20 text-success border-0 text-[8px] px-1.5 py-0 font-bold leading-tight">Finalizado</Badge>
        )}
        {!isCompleted && hasTeams && (
          <Badge className="bg-warning/20 text-warning border-0 text-[8px] px-1.5 py-0 font-bold leading-tight">Pendente</Badge>
        )}
        {!isCompleted && !hasTeams && !hasOneTeam && (
          <Badge variant="outline" className="text-muted-foreground/50 text-[8px] px-1.5 py-0 border-border/20 leading-tight">Aguardando</Badge>
        )}
      </div>

      {/* Teams row */}
      <div className="px-2.5 py-1.5 space-y-0.5">
        {/* Team 1 */}
        <div className={`flex items-center gap-1.5 rounded px-1.5 py-0.5 -mx-1 ${t1Win ? "bg-success/10 ring-1 ring-success/30" : ""}`}>
          {t1Win && <Trophy className="h-3 w-3 text-success shrink-0" />}
          <span className={`text-xs truncate font-bold leading-tight ${t1Win ? "text-success" : !match.team1_id ? "text-muted-foreground/40 italic font-normal" : "text-foreground"}`}>
            {match.team1_id ? team1Name : "A definir"}
          </span>
          {isOwner && hasTeams && !isCompleted && !isEditing && match.team1_id && (
            <Button size="sm" variant="ghost" className="h-5 w-5 p-0 ml-auto shrink-0 text-primary/60 hover:text-primary hover:bg-primary/10"
              onClick={() => handleDeclareTeamWinner(match.team1_id!)}>
              <Trophy className="h-2.5 w-2.5" />
            </Button>
          )}
        </div>
        <span className="text-[9px] text-muted-foreground/30 font-medium leading-none pl-1">vs</span>
        {/* Team 2 */}
        <div className={`flex items-center gap-1.5 rounded px-1.5 py-0.5 -mx-1 ${t2Win ? "bg-success/10 ring-1 ring-success/30" : ""}`}>
          {t2Win && <Trophy className="h-3 w-3 text-success shrink-0" />}
          <span className={`text-xs truncate font-bold leading-tight ${t2Win ? "text-success" : !match.team2_id ? "text-muted-foreground/40 italic font-normal" : "text-foreground"}`}>
            {match.team2_id ? team2Name : "A definir"}
          </span>
          {isOwner && hasTeams && !isCompleted && !isEditing && match.team2_id && (
            <Button size="sm" variant="ghost" className="h-5 w-5 p-0 ml-auto shrink-0 text-primary/60 hover:text-primary hover:bg-primary/10"
              onClick={() => handleDeclareTeamWinner(match.team2_id!)}>
              <Trophy className="h-2.5 w-2.5" />
            </Button>
          )}
          {isCompleted && !t1Win && !t2Win && <span className="text-muted-foreground/30 text-[9px] ml-auto">Empate</span>}
        </div>
      </div>

      {/* Score editing with sets — compact */}
      {hasTeams && canScore && (
        <div className="px-2.5 pb-2 pt-0.5 space-y-1 border-t border-border/15">
          <div className="flex items-center gap-1.5 flex-wrap">
            {setScores.map((s, idx) => (
              <div key={idx} className="flex items-center gap-0.5">
                <span className="text-[8px] text-muted-foreground font-bold">S{idx + 1}</span>
                <Input value={s.s1} onChange={(e) => updateSetScore(idx, "s1", e.target.value)} className="h-6 w-8 text-center text-[11px] p-0 font-bold bg-background/50" />
                <span className="text-[9px] text-muted-foreground">×</span>
                <Input value={s.s2} onChange={(e) => updateSetScore(idx, "s2", e.target.value)} className="h-6 w-8 text-center text-[11px] p-0 font-bold bg-background/50" />
                {idx < setScores.length - 1 && <span className="text-muted-foreground/20 text-sm">|</span>}
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[9px] text-muted-foreground tabular-nums">
              {totalScore1}×{totalScore2} | Sets: {setsWon.t1}×{setsWon.t2}
              {autoWinnerId && <span className="text-success ml-1">► {getTeamName(autoWinnerId).split(" / ")[0]}</span>}
            </span>
            <div className="flex items-center gap-1">
              <Button size="sm" variant="outline" className="h-5 px-2 text-[9px] gap-0.5 border-border/30" onClick={handleSaveScoreOnly}>
                <Save className="h-2.5 w-2.5" /> Salvar
              </Button>
              {isEditing && (
                <>
                  {match.team1_id && (
                    <Button size="sm" variant="outline" className="h-5 px-1.5 text-[9px] gap-0.5 border-success/30 text-success hover:bg-success/10"
                      onClick={() => handleDeclareTeamWinner(match.team1_id!)}>
                      <Trophy className="h-2.5 w-2.5" /> {team1Name.split(" / ")[0]}
                    </Button>
                  )}
                  {match.team2_id && (
                    <Button size="sm" variant="outline" className="h-5 px-1.5 text-[9px] gap-0.5 border-success/30 text-success hover:bg-success/10"
                      onClick={() => handleDeclareTeamWinner(match.team2_id!)}>
                      <Trophy className="h-2.5 w-2.5" /> {team2Name.split(" / ")[0]}
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" className="h-5 px-1.5 text-[9px]" onClick={() => setIsEditing(false)}>
                    Cancelar
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Completed score display — compact */}
      {hasTeams && !canScore && (
        <div className="flex items-center gap-1.5 px-2.5 pb-1.5 pt-0.5 border-t border-border/15">
          <span className="text-sm font-mono font-black tabular-nums">
            {match.score1 ?? "-"} <span className="text-muted-foreground/30">×</span> {match.score2 ?? "-"}
          </span>
          {isCompleted && match.winner_team_id && (
            <Badge className="bg-success/10 text-success border-0 text-[8px] px-1 py-0 truncate max-w-[120px]">
              {getTeamName(match.winner_team_id)}
            </Badge>
          )}
          {isOwner && isCompleted && (
            <Button size="sm" variant="ghost" className="h-5 px-1.5 text-[9px] gap-0.5 ml-auto" onClick={() => setIsEditing(true)}>
              <Pencil className="h-2.5 w-2.5" /> Corrigir
            </Button>
          )}
        </div>
      )}

      {/* Chapéu slot */}
      {hasOneTeam && (
        <div className="px-2.5 pb-1.5">
          <span className="text-[9px] text-muted-foreground/50 italic">Aguardando adversário...</span>
        </div>
      )}
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

  // ╔══════════════════════════════════════════════════════════════════════╗
  // ║  BLINDAGEM: NUMERAÇÃO SEQUENCIAL ESTRITA (REGRA 12 — IMUTÁVEL)    ║
  // ║                                                                      ║
  // ║  TODOS os jogos são numerados na ordem do scheduler, sem exceção.   ║
  // ║  ⛔ PROIBIDO: filtrar por team1_id/team2_id antes de numerar.      ║
  // ║  ⛔ PROIBIDO: numerar jogos com equipes primeiro e sem equipes     ║
  // ║     depois — isso CAUSA SALTOS na numeração (bug histórico).       ║
  // ║  ⛔ PROIBIDO: usar a ordem do banco de dados (matches array)       ║
  // ║     para numerar — SEMPRE usar schedulerSequence().                  ║
  // ║                                                                      ║
  // ║  A numeração é: Grupos (round 0) → Eliminação (scheduler order).   ║
  // ║  Resultado: 1, 2, 3, 4... sem saltos, SEMPRE.                      ║
  // ╚══════════════════════════════════════════════════════════════════════╝
  const matchNumberMap = useMemo(() => {
    const map = new Map<string, number>();
    let num = 1;
    // Fase de grupos (round 0) — round-robin interleaved order
    const groupMatches = matches.filter(m => m.round === 0);
    if (groupMatches.length > 0) {
      const { sequence: gsSeq } = buildGroupStageInterleaved(groupMatches);
      for (const m of gsSeq) {
        map.set(m.id, num++);
      }
    }
    // Eliminação — TODOS os jogos na ordem do scheduler, SEM filtro de equipes
    const seq = schedulerSequence(matches as any);
    for (const m of seq) {
      if (!map.has(m.id)) {
        map.set(m.id, num++);
      }
    }
    // Safety net: qualquer jogo não coberto
    for (const m of matches) {
      if (!map.has(m.id)) map.set(m.id, num++);
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

      const groupStage = matches.filter(m => m.round === 0);
      if (groupStage.length > 0) {
        const { sequence: gsSeq, roundBoundaries } = buildGroupStageInterleaved(groupStage);
        for (let ri = 0; ri < roundBoundaries.length; ri++) {
          const start = roundBoundaries[ri];
          const end = ri + 1 < roundBoundaries.length ? roundBoundaries[ri + 1] : gsSeq.length;
          const chunk = gsSeq.slice(start, end);
          if (chunk.length === 0) continue;
          blocks.push({
            label: `Fase de Grupos — Rodada ${ri + 1}`,
            matches: chunk.map(m => ({ match: m, globalIndex: matchNumberMap.get(m.id) ?? 0 })),
            blockKey: `GS_R${ri + 1}`,
            isUnlocked: true,
            isCompleted: chunk.every(m => m.status === 'completed'),
          });
        }
      }

      const eliminationMatches = matches.filter(m => m.round > 0);
      const hasDoubleElimStructure = eliminationMatches.some(m => m.bracket_half) || tournamentFormat === 'double_elimination';
      if (hasDoubleElimStructure) {
        const schedulerBlocks = buildSchedulerBlocks(eliminationMatches);
        // Group by round + bracket type: "Xª Rodada — Vencedores" / "Xª Rodada — Perdedores"
        const mergedGroups: { key: string; label: string; matches: { match: Match; globalIndex: number }[]; isCompleted: boolean; isUnlocked: boolean }[] = [];
        
        for (const sb of schedulerBlocks) {
          // Show ALL matches — including those waiting for teams (Chapéu/A definir)
          const blockMatches = sb.matches;
          if (blockMatches.length === 0) continue;
          const mappedMatches = blockMatches
            .map(m => ({ match: m as Match, globalIndex: matchNumberMap.get(m.id) ?? 0 }))
            .sort((a, b) => a.globalIndex - b.globalIndex);

          if (sb.key === 'SEMI' || sb.key === 'FINAL') {
            mergedGroups.push({ key: sb.key, label: sb.label, matches: mappedMatches, isCompleted: sb.isCompleted, isUnlocked: sb.isUnlocked });
            continue;
          }

          const isWinners = sb.key.startsWith('WA') || sb.key.startsWith('WB');
          const isLosers = sb.key.startsWith('LS') || sb.key.startsWith('LI');
          const mergeKey = isWinners ? `W_R${sb.round}` : isLosers ? `L_R${sb.round}` : sb.key;
          const mergeLabel = isWinners
            ? `${sb.round}ª Rodada — Vencedores`
            : isLosers
            ? `${sb.round}ª Rodada — Perdedores`
            : sb.label;

          const existing = mergedGroups.find(g => g.key === mergeKey);
          if (existing) {
            existing.matches.push(...mappedMatches);
            existing.matches.sort((a, b) => a.globalIndex - b.globalIndex);
            if (!sb.isCompleted) existing.isCompleted = false;
          } else {
            mergedGroups.push({ key: mergeKey, label: mergeLabel, matches: [...mappedMatches], isCompleted: sb.isCompleted, isUnlocked: sb.isUnlocked });
          }
        }
        
        for (const mg of mergedGroups) {
          blocks.push({ label: mg.label, matches: mg.matches, blockKey: mg.key, isUnlocked: mg.isUnlocked, isCompleted: mg.isCompleted });
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
      const allGroupMatches = matches.filter(m => m.round === 0);
      const { sequence: gsSeq, roundBoundaries } = buildGroupStageInterleaved(allGroupMatches);
      for (let ri = 0; ri < roundBoundaries.length; ri++) {
        const start = roundBoundaries[ri];
        const end = ri + 1 < roundBoundaries.length ? roundBoundaries[ri + 1] : gsSeq.length;
        const chunk = gsSeq.slice(start, end);
        if (chunk.length === 0) continue;
        groups.push({
          label: `Fase de Grupos — Rodada ${ri + 1}`,
          matches: chunk.map(m => ({ match: m, globalIndex: matchNumberMap.get(m.id) ?? 0 })),
          blockKey: `GS_R${ri + 1}`,
          isCompleted: chunk.every(m => m.status === 'completed'),
        });
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
            key={blockKey || block.label}
            className={`rounded-xl border border-primary/25 bg-card/20 backdrop-blur-sm overflow-hidden shadow-[0_0_15px_hsl(var(--primary)/0.08)] ${!isUnlocked && isDoubleElim ? 'opacity-40' : ''}`}
          >
            {/* Block header — gradient bar */}
            <div className="px-5 py-3 border-b border-primary/15 bg-gradient-to-r from-primary/10 via-primary/5 to-transparent">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <h3 className="text-sm font-black uppercase tracking-[0.15em] text-primary" style={{ textShadow: '0 0 20px rgba(255,255,255,1), 0 0 40px rgba(255,255,255,0.9), 0 0 60px rgba(255,255,255,0.6), 1px 1px 0 #000, -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000' }}>
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
                <div className="flex items-center gap-2.5">
                  <span className="text-xs text-muted-foreground tabular-nums font-bold">{completedInBlock} / {totalInBlock}</span>
                  <div className="w-20 h-2 rounded-full bg-muted/40 overflow-hidden">
                    <div className="h-full rounded-full bg-gradient-to-r from-primary to-accent transition-all duration-500" style={{ width: `${blockPct}%` }} />
                  </div>
                </div>
              </div>
            </div>

            {/* Match cards — 2 col grid */}
            <div className="p-2 sm:p-2.5 grid gap-2 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {block.matches.map(({ match, globalIndex }) => (
                <MatchCard
                  key={match.id}
                  match={match}
                  index={globalIndex}
                  getTeamName={getTeamName}
                  getRoundLabel={(r) => {
                    if (isDoubleElim) {
                      const m = match;
                      if (m.bracket_type === 'semi_final') return 'Semifinal';
                      if (m.bracket_type === 'final') return 'Final';
                      if (m.bracket_type === 'losers') return 'Perdedores';
                      return 'Vencedores';
                    }
                    return getRoundShortLabel(r, matchCountByRound[r] || 0);
                  }}
                  isOwner={isOwner}
                  numSets={numSets}
                  tournamentFormat={tournamentFormat}
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
