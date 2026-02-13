import { useState, useMemo, useEffect, memo, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Trophy, Save, Download, FileText, Sheet, Pencil, Lock } from "lucide-react";
import { motion } from "framer-motion";
import { exportMatchSequence } from "@/lib/exportUtils";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { getEliminationRoundLabel, getEliminationRoundShortLabel } from "@/lib/roundLabels";
import { buildSchedulerBlocks, getSchedulerBlockColor, getSchedulerBadgeColor, type SchedulerBlock } from "@/lib/roundScheduler";

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
  // Group stage matches (round 0) come first, interleaved by bracket
  const groupStage = matches.filter(m => m.round === 0);
  const elimination = matches.filter(m => m.round > 0);
  
  // Interleave group stage by bracket_number
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
  
  // Check if elimination matches have bracket_half (true double elimination structure)
  const hasDoubleElimStructure = elimination.some(m => m.bracket_half);
  
  if (hasDoubleElimStructure) {
    // Use round scheduler for strict ordering
    const blocks = buildSchedulerBlocks(elimination as any);
    return [...groupInterleaved, ...blocks.flatMap(b => b.matches as Match[])];
  } else {
    // Fallback: interleave by round/bracket (e.g. group stage → single elim knockout)
    const interleavedElim = generateInterleavedSequence(elimination);
    return [...groupInterleaved, ...interleavedElim];
  }
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

// ─── Block Label Helpers ─────────────────────────────────────

function getBracketBlockLabel(match: Match): string {
  const bt = match.bracket_type || 'winners';
  const bh = match.bracket_half;
  if (bt === 'winners' && bh === 'upper') return 'Vencedores – Chave A';
  if (bt === 'winners' && bh === 'lower') return 'Vencedores – Chave B';
  if (bt === 'winners' && !bh) return 'Final dos Vencedores';
  if (bt === 'losers' && bh === 'upper') return 'Perdedores – Chave A';
  if (bt === 'losers' && bh === 'lower') return 'Perdedores – Chave B';
  if (bt === 'semi_final') return 'Semifinais';
  if (bt === 'final') return 'Final';
  if (bt === 'third_place') return 'Disputa 3º Lugar';
  return 'Outros';
}

function getBracketBlockColor(blockLabel: string): string {
  if (blockLabel.startsWith('Vencedores')) return 'border-l-blue-500';
  if (blockLabel.startsWith('Perdedores')) return 'border-l-orange-500';
  if (blockLabel.startsWith('Semifinais')) return 'border-l-purple-500';
  if (blockLabel === 'Final' || blockLabel === 'Final dos Vencedores') return 'border-l-amber-500';
  if (blockLabel === 'Disputa 3º Lugar') return 'border-l-emerald-500';
  return 'border-l-primary';
}

function getMatchGroupId(match: Match): string {
  if (match.round === 0) return `Grupo ${numberToLetter(match.bracket_number || 1)}`;
  if (match.bracket_type === 'winners' && match.bracket_half) return `Chave dos Vencedores - ${match.bracket_half === 'upper' ? 'Superior' : 'Inferior'}`;
  if (match.bracket_type === 'winners' && !match.bracket_half) return 'Final dos Vencedores';
  if (match.bracket_type === 'losers') return `Perdedores (${match.bracket_half === 'upper' ? 'Superior' : 'Inferior'})`;
  if (match.bracket_type === 'semi_final') return `Semifinal ${match.bracket_half === 'upper' ? '1' : '2'}`;
  if (match.bracket_type === 'final') return 'Final';
  if (match.bracket_type === 'third_place') return 'Disputa 3º Lugar';
  return `Chave ${match.bracket_number || 1}`;
}

function getRoundShortLabel(round: number, matchCountInRound: number): string {
  return getEliminationRoundShortLabel(round, matchCountInRound);
}

// ─── Main Component ──────────────────────────────────────────

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
  // RULE: Exibir TODAS as partidas (inclusive slots de espera/Chapéu com apenas um time)
  // Chapéus serão renderizados como cards cinza com rótulo especial
  const displaySequence = useMemo(() => 
    sequence, // Mostrar todos (tanto matches reais quanto Chapéus)
    [sequence]
  );

  const matchCountByRound = useMemo(() => {
    const counts: Record<number, number> = {};
    matches.forEach(m => { counts[m.round] = (counts[m.round] || 0) + 1; });
    return counts;
  }, [matches]);

  const getRoundLabel = (round: number) => {
    return getEliminationRoundLabel(round, matchCountByRound[round] || 0);
  };

  // Group by bracket blocks for double elimination, or by round for others
  const bracketBlocks = useMemo(() => {
    if (displaySequence.length === 0) return [];

    if (tournamentFormat === 'double_elimination') {
      const blocks: { label: string; matches: { match: Match; globalIndex: number }[]; blockKey: string; isUnlocked: boolean; isCompleted: boolean }[] = [];
      let idx = 1;

      // Group stage matches (round 0) first
      const groupStage = displaySequence.filter(m => m.round === 0);
      if (groupStage.length > 0) {
        const bracketCount = new Set(groupStage.map(m => m.bracket_number || 1)).size;
        const matchesPerRound = Math.max(bracketCount, 1);
        let roundNum = 1;
        for (let i = 0; i < groupStage.length; i += matchesPerRound) {
          const chunk = groupStage.slice(i, i + matchesPerRound);
          blocks.push({
            label: `Fase de Grupos — Rodada ${roundNum}`,
            matches: chunk.map(m => ({ match: m, globalIndex: idx++ })),
            blockKey: `GS_R${roundNum}`,
            isUnlocked: true,
            isCompleted: chunk.every(m => m.status === 'completed'),
          });
          roundNum++;
        }
      }

      // Elimination matches
      const eliminationMatches = matches.filter(m => m.round > 0);
      const hasDoubleElimStructure = eliminationMatches.some(m => m.bracket_half);
      
      if (hasDoubleElimStructure) {
        // Use round scheduler for true double elimination
        const schedulerBlocks = buildSchedulerBlocks(eliminationMatches);
        for (const sb of schedulerBlocks) {
          const blockMatches = sb.matches.filter(m => m.team1_id && m.team2_id);
          if (blockMatches.length === 0) continue;
          const entries = blockMatches.map(m => ({ match: m as Match, globalIndex: idx++ }));
          blocks.push({ 
            label: sb.label, 
            matches: entries, 
            blockKey: sb.key, 
            isUnlocked: sb.isUnlocked, 
            isCompleted: sb.isCompleted 
          });
        }
      } else {
        // Fallback: group knockout by round (group stage → single elim)
        const knockoutDisplay = displaySequence.filter(m => m.round > 0);
        const knockoutRounds = [...new Set(knockoutDisplay.map(m => m.round))].sort((a, b) => a - b);
        for (const r of knockoutRounds) {
          const roundMatches = knockoutDisplay.filter(m => m.round === r);
          blocks.push({
            label: getEliminationRoundLabel(r, matchCountByRound[r] || 0),
            matches: roundMatches.map(m => ({ match: m, globalIndex: idx++ })),
            blockKey: `KO_R${r}`,
            isUnlocked: true,
            isCompleted: roundMatches.every(m => m.status === 'completed'),
          });
        }
      }
      return blocks;
    }

    // Non-double-elimination: group by round
    const groups: { label: string; matches: { match: Match; globalIndex: number }[] }[] = [];
    const groupStage = displaySequence.filter((m) => m.round === 0);
    const knockoutStage = displaySequence.filter((m) => m.round > 0);

    if (groupStage.length > 0) {
      const bracketCount = new Set(groupStage.map((m) => m.bracket_number || 1)).size;
      const matchesPerRound = Math.max(bracketCount, 1);
      let roundNum = 1;
      for (let i = 0; i < groupStage.length; i += matchesPerRound) {
        const chunk = groupStage.slice(i, i + matchesPerRound);
        groups.push({ label: `Rodada ${roundNum}`, matches: chunk.map((m) => ({ match: m, globalIndex: 0 })) });
        roundNum++;
      }
    }

    if (knockoutStage.length > 0) {
      const knockoutRounds = [...new Set(knockoutStage.map((m) => m.round))].sort((a, b) => a - b);
      for (const r of knockoutRounds) {
        const roundMatches = knockoutStage.filter((m) => m.round === r);
        groups.push({ label: getRoundLabel(r), matches: roundMatches.map((m) => ({ match: m, globalIndex: 0 })) });
      }
    }

    let idx = 1;
    for (const g of groups) {
      for (const entry of g.matches) {
        entry.globalIndex = idx++;
      }
    }
    return groups;
  }, [displaySequence, matchCountByRound, tournamentFormat]);

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
      <div className="flex justify-end">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="gap-1">
              <Download className="h-4 w-4" /> Exportar
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

      {bracketBlocks.map((block) => {
        const blockKey = (block as any).blockKey;
        const isUnlocked = (block as any).isUnlocked ?? true;
        const isBlockCompleted = (block as any).isCompleted ?? false;
        const borderColor = isDoubleElim && blockKey ? getSchedulerBlockColor(blockKey) : getBracketBlockColor(block.label);
        
        return (
        <div
          key={block.label}
          className={`rounded-lg border bg-card/30 overflow-hidden ${isDoubleElim ? `border-l-4 ${borderColor}` : ''} ${!isUnlocked && isDoubleElim ? 'opacity-50' : ''}`}
        >
          <div className="px-4 py-3 border-b border-border bg-muted/30">
            <div className="flex items-center gap-2">
              <h3 className="text-base font-bold text-foreground tracking-tight">
                {block.label}
              </h3>
              {isDoubleElim && !isUnlocked && (
                <Badge variant="outline" className="text-[10px] gap-1 text-muted-foreground">
                  <Lock className="h-3 w-3" /> Bloqueado
                </Badge>
              )}
              {isDoubleElim && isBlockCompleted && (
                <Badge className="bg-success/20 text-success border-0 text-[10px]">✓ Concluído</Badge>
              )}
            </div>
            <span className="text-xs text-muted-foreground">
              {block.matches.length} {block.matches.length === 1 ? 'partida' : 'partidas'}
            </span>
          </div>
          <div className="p-2 space-y-2">
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
      )})}
    </section>
  );
};

// ─── Match Card ──────────────────────────────────────────────

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
  const hasOneTeam = (match.team1_id && !match.team2_id) || (!match.team1_id && match.team2_id); // Chapéu
  const canScore = isOwner && hasTeams && (!isCompleted || isEditing);

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

  const getStatusBadge = () => {
    if (hasOneTeam) return <Badge className="bg-muted text-muted-foreground border-border text-[10px]">Chapéu</Badge>;
    if (isCompleted) return <Badge className="bg-success/20 text-success border-0 text-[10px]">Finalizado</Badge>;
    if (hasTeams) return <Badge className="bg-warning/20 text-warning border-0 text-[10px]">Aguardando</Badge>;
    return <Badge variant="outline" className="text-muted-foreground text-[10px]">A definir</Badge>;
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
      className={`flex flex-col gap-1 rounded-lg border bg-card px-3 py-1.5 transition-colors ${
        isCompleted ? "border-success/30 opacity-80" : hasTeams ? "border-primary/20" : "border-border"
      }`}
    >
      {/* Header row */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-muted text-[10px] font-bold text-muted-foreground shrink-0">
          {index}
        </span>
        <Badge variant="outline" className="text-[9px] shrink-0 font-semibold px-1.5 py-0">
          {getRoundLabel(match.round)}
        </Badge>
        {getStatusBadge()}
        {isCompleted && !isEditing && <Trophy className="h-3.5 w-3.5 text-success ml-auto shrink-0" />}
      </div>

      {/* Teams with inline declare winner buttons */}
       <div className="flex flex-col gap-0.5">
         {/* Team 1 */}
         <div className="flex items-center gap-1.5 min-h-[24px]">
           <span className={`text-xs flex-1 truncate ${isCompleted && !isEditing && match.winner_team_id === match.team1_id ? "text-success font-bold" : match.team1_id === null ? "text-muted-foreground italic" : "team-name"}`}>
             {match.team1_id ? team1Name : "Chapéu"}
           </span>
           {isOwner && hasTeams && !isCompleted && match.team1_id && (
             <Button
               size="sm"
               variant="ghost"
               className="h-5 px-1.5 text-[10px] gap-0.5 text-primary hover:bg-primary/10 shrink-0"
               onClick={() => handleDeclareTeamWinner(match.team1_id!)}
             >
               <Trophy className="h-3 w-3" /> Vencedor
             </Button>
           )}
         </div>
         <span className="text-[10px] text-muted-foreground pl-0.5">vs</span>
         {/* Team 2 */}
         <div className="flex items-center gap-1.5 min-h-[24px]">
           <span className={`text-xs flex-1 truncate ${isCompleted && !isEditing && match.winner_team_id === match.team2_id ? "text-success font-bold" : match.team2_id === null ? "text-muted-foreground italic" : "team-name"}`}>
             {match.team2_id ? team2Name : "Chapéu"}
           </span>
           {isOwner && hasTeams && !isCompleted && match.team2_id && (
             <Button
               size="sm"
               variant="ghost"
               className="h-5 px-1.5 text-[10px] gap-0.5 text-primary hover:bg-primary/10 shrink-0"
               onClick={() => handleDeclareTeamWinner(match.team2_id!)}
             >
               <Trophy className="h-3 w-3" /> Vencedor
             </Button>
           )}
         </div>
       </div>

      {/* Score editing with sets — ONLY for real matches (both teams present) */}
       {hasTeams && canScore && (
         <div className="space-y-1 mt-0.5">
           <div className="flex items-center gap-1.5 flex-wrap">
             {setScores.map((s, idx) => (
               <div key={idx} className="flex items-center gap-0.5">
                 <span className="text-[9px] text-muted-foreground font-medium">S{idx + 1}</span>
                 <Input value={s.s1} onChange={(e) => updateSetScore(idx, "s1", e.target.value)} className="h-6 w-9 text-center text-[11px] p-0" />
                 <span className="text-[10px] text-muted-foreground">×</span>
                 <Input value={s.s2} onChange={(e) => updateSetScore(idx, "s2", e.target.value)} className="h-6 w-9 text-center text-[11px] p-0" />
                 {idx < setScores.length - 1 && <span className="text-muted-foreground mx-0.5">|</span>}
               </div>
             ))}
           </div>

           <div className="flex items-center gap-1.5 flex-wrap">
             <span className="text-[10px] text-muted-foreground">
               {totalScore1}×{totalScore2} | Sets: {setsWon.t1}×{setsWon.t2}
             </span>
             {autoWinnerId && (
               <Badge className="bg-success/20 text-success border-0 text-[10px] px-1.5 py-0">
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

       {/* Completed / Read-only score display */}
       {hasTeams && !canScore && (
         <div className="flex items-center gap-1.5 flex-wrap">
           <span className="text-xs font-mono font-bold">
             {match.score1 ?? "-"} × {match.score2 ?? "-"}
           </span>
           {isCompleted && match.winner_team_id && (
             <Badge className="bg-success/20 text-success border-0 text-[10px] px-1.5 py-0">
               {getTeamName(match.winner_team_id)}
             </Badge>
           )}
           {isOwner && isCompleted && (
             <Button size="sm" variant="ghost" className="h-5 px-1.5 text-[10px] gap-0.5" onClick={() => setIsEditing(true)}>
               <Pencil className="h-3 w-3" /> Corrigir
             </Button>
           )}
         </div>
       )}

       {/* Chapéu slot — show waiting message */}
       {hasOneTeam && (
         <div className="flex items-center gap-1.5 flex-wrap px-0.5 py-1 rounded bg-muted/30">
           <span className="text-xs text-muted-foreground italic">Aguardando adversário real...</span>
         </div>
       )}
    </div>
  );
};

export default MatchSequenceViewer;
