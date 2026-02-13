import { useState, useMemo, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Trophy, Check, Save, Download, FileText, Sheet, Pencil } from "lucide-react";
import { motion } from "framer-motion";
import { exportMatchSequence } from "@/lib/exportUtils";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

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
  tournamentFormat?: string; // 'single_elimination' | 'double_elimination' | 'group_stage'
  onDeclareWinner: (matchId: string, winnerId: string) => void;
  onUpdateScore: (matchId: string, score1: number, score2: number) => void;
  onAutoResult?: (matchId: string, score1: number, score2: number, winnerId: string) => void;
}

/**
 * Generates a match sequence based on tournament format.
 * 
 * DOUBLE ELIMINATION:
 *   - Executa TODOS os jogos de uma chave antes de avançar para outra
 *   - Proibido intercalar partidas entre chaves diferentes
 *   - Dupla em chapéu entra por último na rodada/chave
 * 
 * OTHER FORMATS (group_stage, single_elimination):
 *   - Alterna partidas entre chaves (interleaving)
 *   - Sem obrigatoriedade de concluir chave inteira
 */
function generateSequence(matches: Match[], tournamentFormat: string): Match[] {
  if (matches.length === 0) return [];

  if (tournamentFormat === 'double_elimination') {
    return generateDoubleEliminationSequence(matches);
  }
  return generateInterleavedSequence(matches);
}

/**
 * ELIMINATÓRIA DUPLA: Todos os jogos de uma chave antes de avançar para outra.
 * Ordem das chaves: Vencedores A → Vencedores B → Perdedores A → Perdedores B → Semifinais Cruzadas → Final
 * Dentro de cada chave: por rodada, depois por posição.
 * Chapéu: partidas com apenas 1 equipe definida ficam por último na sua rodada/chave.
 */
function generateDoubleEliminationSequence(matches: Match[]): Match[] {
  // Define a ordem prioritária das chaves
  const bracketOrder: Record<string, number> = {
    'winners_upper': 1,
    'winners_lower': 2,
    'winners_null': 3, // winners sem bracket_half (final dos vencedores)
    'losers_upper': 4,
    'losers_lower': 5,
    'cross_semi_upper': 6,
    'cross_semi_lower': 7,
    'third_place': 8,
    'final': 9,
    'other': 10,
  };

  const getBracketKey = (m: Match): string => {
    const bt = m.bracket_type || 'winners';
    const bh = m.bracket_half || 'null';
    const key = `${bt}_${bh}`;
    return bracketOrder[key] !== undefined ? key : 'other';
  };

  const getBracketPriority = (m: Match): number => {
    return bracketOrder[getBracketKey(m)] ?? 10;
  };

  // Identifica partidas de "chapéu" (apenas 1 equipe definida)
  const isByeMatch = (m: Match): boolean => {
    return (m.team1_id && !m.team2_id) || (!m.team1_id && m.team2_id) ? true : false;
  };

  // Agrupa partidas por chave
  const bracketGroups: Record<string, Match[]> = {};
  for (const m of matches) {
    const key = getBracketKey(m);
    if (!bracketGroups[key]) bracketGroups[key] = [];
    bracketGroups[key].push(m);
  }

  // Ordena as chaves pela prioridade
  const sortedKeys = Object.keys(bracketGroups).sort(
    (a, b) => (bracketOrder[a] ?? 10) - (bracketOrder[b] ?? 10)
  );

  const result: Match[] = [];

  for (const key of sortedKeys) {
    const groupMatches = bracketGroups[key];
    
    // Dentro de cada chave: ordena por rodada, depois por posição
    // Chapéu fica por último na rodada
    const rounds = [...new Set(groupMatches.map((m) => m.round))].sort((a, b) => a - b);
    
    for (const round of rounds) {
      const roundMatches = groupMatches
        .filter((m) => m.round === round)
        .sort((a, b) => a.position - b.position);
      
      // Separa: partidas normais primeiro, chapéu por último
      const normal = roundMatches.filter((m) => !isByeMatch(m));
      const byes = roundMatches.filter((m) => isByeMatch(m));
      
      result.push(...normal, ...byes);
    }
  }

  // Post-process: verificar que dupla em chapéu nunca joga consecutivamente
  return resolveByeConflicts(result);
}

/**
 * FASE DE GRUPOS / MATA-MATA NORMAL: Alternância entre chaves (interleaving).
 */
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

/**
 * Garante que dupla em chapéu nunca jogue duas consecutivas.
 */
function resolveByeConflicts(sequence: Match[]): Match[] {
  const result = [...sequence];
  
  for (let i = 1; i < result.length; i++) {
    if (hasTeamOverlap(result[i - 1], result[i])) {
      // Tenta mover para posição posterior dentro da mesma chave
      const currentBracketType = result[i].bracket_type;
      const currentBracketHalf = result[i].bracket_half;
      
      let swapIdx = -1;
      for (let j = i + 1; j < result.length; j++) {
        // Só troca dentro da mesma chave
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

  const maxRound = matches.length > 0 ? Math.max(...matches.map((m) => m.round)) : 0;

  const getRoundLabel = (round: number) => {
    // Group stage: sempre exibir "Fase de Grupos"
    if (tournamentFormat === 'group_stage') {
      return "Fase de Grupos";
    }
    
    if (round === 0) return "Grupo";
    
    // Knockout phase labeling based on distance from final
    const roundsFromEnd = maxRound - round;
    switch (roundsFromEnd) {
      case 0: return "Final";
      case 1: return "Semifinal";
      case 2: return "Quartas de Final";
      case 3: return "Oitavas de Final";
      default: return `Fase de ${2 ** roundsFromEnd}`;
    }
  };

  // Group sequence into display rounds for headers
  const groupedRounds = useMemo(() => {
    if (sequence.length === 0) return [];

    const groups: { label: string; matches: { match: Match; globalIndex: number }[] }[] = [];
    // For group stage (round === 0), split into sequential "Rodada N" based on position in sequence
    // For knockout, group by actual round value

    const groupStage = sequence.filter((m) => m.round === 0);
    const knockoutStage = sequence.filter((m) => m.round > 0);

    // Split group stage into rounds: figure out how many matches per round
    // by counting unique brackets (groups) — each round has one match per group
    if (groupStage.length > 0) {
      const bracketCount = new Set(groupStage.map((m) => m.bracket_number || 1)).size;
      // Each "round" in the sequence has ~bracketCount matches (one per group)
      // But after conflict resolution order may shift, so we chunk by bracketCount
      const matchesPerRound = Math.max(bracketCount, 1);
      let roundNum = 1;
      for (let i = 0; i < groupStage.length; i += matchesPerRound) {
        const chunk = groupStage.slice(i, i + matchesPerRound);
        groups.push({
          label: `Rodada ${roundNum}`,
          matches: chunk.map((m) => ({ match: m, globalIndex: 0 })),
        });
        roundNum++;
      }
    }

    // Group knockout matches by round
    if (knockoutStage.length > 0) {
      const knockoutRounds = [...new Set(knockoutStage.map((m) => m.round))].sort((a, b) => a - b);
      for (const r of knockoutRounds) {
        const roundMatches = knockoutStage.filter((m) => m.round === r);
        groups.push({
          label: getRoundLabel(r),
          matches: roundMatches.map((m) => ({ match: m, globalIndex: 0 })),
        });
      }
    }

    // Assign global indices
    let idx = 1;
    for (const g of groups) {
      for (const entry of g.matches) {
        entry.globalIndex = idx++;
      }
    }

    return groups;
  }, [sequence, maxRound]);

  const getGroupId = (match: Match & { bracket_type?: string; bracket_half?: string | null }) => {
    if (match.round === 0) return `Grupo ${match.bracket_number || 1}`;
    if (match.bracket_type === 'winners' && match.bracket_half) return `Chave dos Vencedores - ${match.bracket_half === 'upper' ? 'Superior' : 'Inferior'}`;
    if (match.bracket_type === 'winners' && !match.bracket_half) return 'Final dos Vencedores';
    if (match.bracket_type === 'losers') return `Perdedores (${match.bracket_half === 'upper' ? 'Superior' : 'Inferior'})`;
    if (match.bracket_type === 'cross_semi') return `Semifinal Cruzada ${match.bracket_half === 'upper' ? '1' : '2'}`;
    if (match.bracket_type === 'final') return 'Final';
    if (match.bracket_type === 'third_place') return 'Disputa 3º Lugar';
    return `Chave ${match.bracket_number || 1}`;
  };

  if (sequence.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-card/50 p-12 text-center">
        <p className="text-muted-foreground">
          Gere o chaveamento primeiro para ver a sequência de partidas.
        </p>
      </div>
    );
  }

  const handleExport = (format: "pdf" | "xlsx" | "csv") => {
    const meta = { tournamentName, sport, date: eventDate };
    const rows = sequence.map((m, idx) => ({
      order: idx + 1,
      round: getRoundLabel(m.round),
      group: getGroupId(m),
      team1: getTeamName(m.team1_id),
      team2: getTeamName(m.team2_id),
      score: m.status === "completed" ? `${m.score1 ?? 0} × ${m.score2 ?? 0}` : "-",
      winner: m.winner_team_id ? getTeamName(m.winner_team_id) : "-",
      status: m.status === "completed" ? "Finalizado" : "Pendente",
    }));
    exportMatchSequence(format, rows, meta);
  };

  return (
    <section className="space-y-3">
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
      {groupedRounds.map((group) => (
        <div key={group.label} className="space-y-2">
          <h3 className="text-lg font-semibold text-primary mt-4 mb-1 border-b border-border pb-1">
            {group.label}
          </h3>
          {group.matches.map(({ match, globalIndex }) => (
            <MatchCard
              key={match.id}
              match={match}
              index={globalIndex}
              getTeamName={getTeamName}
              getGroupId={getGroupId}
              getRoundLabel={getRoundLabel}
              isOwner={isOwner}
              numSets={numSets}
              onDeclareWinner={onDeclareWinner}
              onUpdateScore={onUpdateScore}
              onAutoResult={onAutoResult}
            />
          ))}
        </div>
      ))}
    </section>
  );
};

interface MatchCardProps {
  match: Match;
  index: number;
  getTeamName: (id: string | null) => string;
  getGroupId: (match: Match) => string;
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
  getGroupId,
  getRoundLabel,
  isOwner,
  numSets,
  onDeclareWinner,
  onUpdateScore,
  onAutoResult,
}: MatchCardProps) => {
  const getBracketColor = (match: Match & { bracket_type?: string }) => {
    if (match.bracket_type === 'winners') return 'bg-blue-500/20 text-blue-700 dark:text-blue-400 border-blue-500/30';
    if (match.bracket_type === 'losers') return 'bg-orange-500/20 text-orange-700 dark:text-orange-400 border-orange-500/30';
    if (match.bracket_type === 'cross_semi') return 'bg-purple-500/20 text-purple-700 dark:text-purple-400 border-purple-500/30';
    if (match.bracket_type === 'final') return 'bg-amber-500/20 text-amber-700 dark:text-amber-400 border-amber-500/30';
    return 'bg-primary/20 text-primary border-primary/30';
  };

  const initSets = () => {
    const sets: { s1: string; s2: string }[] = [];
    for (let i = 0; i < numSets; i++) {
      sets.push({ s1: "0", s2: "0" });
    }
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
  const canScore = isOwner && hasTeams && (!isCompleted || isEditing);

  // Calculate sets won by each team
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

  // Auto-determine winner based on majority of sets
  const autoWinnerId = useMemo(() => {
    const majority = Math.ceil(numSets / 2);
    if (setsWon.t1 >= majority && match.team1_id) return match.team1_id;
    if (setsWon.t2 >= majority && match.team2_id) return match.team2_id;
    return null;
  }, [setsWon, numSets, match.team1_id, match.team2_id]);

  const handleSaveAndFinalize = () => {
    if (!autoWinnerId) return;
    if (onAutoResult) {
      onAutoResult(match.id, totalScore1, totalScore2, autoWinnerId);
    } else {
      onUpdateScore(match.id, totalScore1, totalScore2);
      onDeclareWinner(match.id, autoWinnerId);
    }
    setIsEditing(false);
  };

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

  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: Math.min(index * 0.02, 1) }}
      className={`flex flex-col gap-2 rounded-lg border bg-card px-4 py-3 shadow-card transition-all ${
        isCompleted ? "border-success/30 opacity-80" : hasTeams ? "border-primary/30" : "border-border"
      }`}
    >
      {/* Header */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-xs font-bold text-muted-foreground shrink-0">
          {index}
        </span>
        <Badge variant="outline" className="text-xs shrink-0 font-semibold">
          {getRoundLabel(match.round)}
        </Badge>
        <Badge className={`text-xs shrink-0 font-semibold border ${getBracketColor(match)}`}>
          {getGroupId(match)}
        </Badge>
        {isCompleted && !isEditing && <Trophy className="h-4 w-4 text-success ml-auto shrink-0" />}
      </div>

      {/* Teams */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className={`text-sm font-medium ${isCompleted && !isEditing && match.winner_team_id === match.team1_id ? "text-success font-bold" : ""}`}>
          {team1Name}
        </span>
        <span className="text-xs text-muted-foreground">vs</span>
        <span className={`text-sm font-medium ${isCompleted && !isEditing && match.winner_team_id === match.team2_id ? "text-success font-bold" : ""}`}>
          {team2Name}
        </span>
      </div>

      {/* Score editing with sets */}
      {hasTeams && canScore && (
        <div className="space-y-2 mt-2">
          <div className="flex items-center gap-2 flex-wrap">
            {setScores.map((s, idx) => (
              <div key={idx} className="flex items-center gap-1">
                <span className="text-[10px] text-muted-foreground font-medium">S{idx + 1}</span>
                <Input
                  value={s.s1}
                  onChange={(e) => updateSetScore(idx, "s1", e.target.value)}
                  className="h-7 w-10 text-center text-xs p-0"
                />
                <span className="text-xs text-muted-foreground">×</span>
                <Input
                  value={s.s2}
                  onChange={(e) => updateSetScore(idx, "s2", e.target.value)}
                  className="h-7 w-10 text-center text-xs p-0"
                />
                {idx < setScores.length - 1 && <span className="text-muted-foreground mx-1">|</span>}
              </div>
            ))}
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-muted-foreground">
              Total: {totalScore1} × {totalScore2} | Sets: {setsWon.t1} × {setsWon.t2}
            </span>
            {autoWinnerId ? (
              <Badge className="bg-success/20 text-success border-0 text-xs">
                Vencedor: {getTeamName(autoWinnerId).split(" / ")[0]}...
              </Badge>
            ) : (
              <Badge className="bg-warning/20 text-warning border-0 text-xs">
                Sem vencedor definido
              </Badge>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" className="h-6 px-2 text-xs gap-1" onClick={handleSaveScoreOnly}>
              <Save className="h-3 w-3" /> Salvar Placar
            </Button>
            <Button
              size="sm"
              className="h-6 px-2 text-xs gap-1 bg-success/90 hover:bg-success text-success-foreground"
              onClick={handleSaveAndFinalize}
              disabled={!autoWinnerId}
            >
              <Check className="h-3 w-3" /> Finalizar Partida
            </Button>
            {isEditing && (
              <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={() => setIsEditing(false)}>
                Cancelar
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Completed / Read-only score display */}
      {hasTeams && !canScore && (
        <div className="flex items-center gap-2 flex-wrap mt-2">
          <span className="text-sm font-mono font-bold">
            {match.score1 ?? "-"} × {match.score2 ?? "-"}
          </span>
          {isCompleted && match.winner_team_id && (
            <Badge className="bg-success/20 text-success border-0 text-xs">
              Vencedor: {getTeamName(match.winner_team_id)}
            </Badge>
          )}
          {!isCompleted && (
            <Badge className="bg-warning/20 text-warning border-0 text-xs">Pendente</Badge>
          )}
          {isOwner && isCompleted && (
            <Button size="sm" variant="ghost" className="h-6 px-2 text-xs gap-1" onClick={() => setIsEditing(true)}>
              <Pencil className="h-3 w-3" /> Corrigir
            </Button>
          )}
        </div>
      )}
    </motion.div>
  );
};

export default MatchSequenceViewer;
