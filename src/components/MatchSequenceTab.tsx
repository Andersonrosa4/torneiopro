import { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Trophy, Lock } from "lucide-react";
import { getEliminationRoundLabel } from "@/lib/roundLabels";
import { buildSchedulerBlocks, getSchedulerBlockColor } from "@/lib/roundScheduler";

interface Match {
  id: string;
  round: number;
  position: number;
  team1_id: string | null;
  team2_id: string | null;
  winner_team_id: string | null;
  status: string;
  bracket_number: number;
  score1: number | null;
  score2: number | null;
}

interface Team {
  id: string;
  player1_name: string;
  player2_name: string;
}

interface MatchSequenceTabProps {
  matches: Match[];
  teams: Team[];
  tournamentFormat?: string; // 'single_elimination' | 'double_elimination' | 'group_stage'
}

const MatchSequenceTab = ({ matches, teams, tournamentFormat = 'single_elimination' }: MatchSequenceTabProps) => {
  const getTeamName = (teamId: string | null) => {
    if (!teamId) return "A definir";
    const team = teams.find((t) => t.id === teamId);
    return team ? `${team.player1_name} / ${team.player2_name}` : "A definir";
  };

  const getGroupId = (match: Match & { bracket_type?: string; bracket_half?: string | null }) => {
    if (match.round === 0) return `Grupo ${match.bracket_number || 1}`;
    if ((match as any).bracket_type === 'winners' && (match as any).bracket_half) return `Chave dos Vencedores - ${(match as any).bracket_half === 'upper' ? 'Superior' : 'Inferior'}`;
    if ((match as any).bracket_type === 'winners' && !(match as any).bracket_half) return 'Final dos Vencedores';
    if ((match as any).bracket_type === 'losers') return `Perdedores (${(match as any).bracket_half === 'upper' ? 'Superior' : 'Inferior'})`;
    if ((match as any).bracket_type === 'cross_semi') return `Semifinal Cruzada ${(match as any).bracket_half === 'upper' ? '1' : '2'}`;
    if ((match as any).bracket_type === 'final') return 'Final';
    if ((match as any).bracket_type === 'third_place') return 'Disputa 3º Lugar';
    return `Chave ${match.bracket_number || 1}`;
  };

  const getBracketColor = (match: Match & { bracket_type?: string }) => {
    if ((match as any).bracket_type === 'winners') return 'bg-blue-500/20 text-blue-700 dark:text-blue-400 border-blue-500/30';
    if ((match as any).bracket_type === 'losers') return 'bg-orange-500/20 text-orange-700 dark:text-orange-400 border-orange-500/30';
    if ((match as any).bracket_type === 'cross_semi') return 'bg-purple-500/20 text-purple-700 dark:text-purple-400 border-purple-500/30';
    if ((match as any).bracket_type === 'final') return 'bg-amber-500/20 text-amber-700 dark:text-amber-400 border-amber-500/30';
    return 'bg-primary/20 text-primary border-primary/30';
  };

  // Generate match sequence based on tournament format
  const sequence = useMemo(() => {
    if (matches.length === 0) return [];

    if (tournamentFormat === 'double_elimination') {
      // Group stage first (round 0), then elimination via scheduler
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
      
      const schedulerBlocks = buildSchedulerBlocks(elimination as any);
      const result: Match[] = [...groupInterleaved];
      for (const block of schedulerBlocks) {
        result.push(...(block.matches as Match[]));
      }
      return result;
    }

    // OUTROS FORMATOS: Interleaving entre chaves
    const rounds = [...new Set(matches.map((m) => m.round))].sort((a, b) => a - b);
    const brackets = [...new Set(matches.map((m) => m.bracket_number || 1))].sort((a, b) => a - b);
    const ordered: Match[] = [];
    for (const round of rounds) {
      const roundMatches = matches.filter((m) => m.round === round);
      const byBracket: Record<number, Match[]> = {};
      for (const b of brackets) {
        byBracket[b] = roundMatches.filter((m) => (m.bracket_number || 1) === b).sort((a, b2) => a.position - b2.position);
      }
      const maxLen = Math.max(...Object.values(byBracket).map((a) => a.length));
      for (let i = 0; i < maxLen; i++) {
        for (const b of brackets) {
          if (byBracket[b][i]) ordered.push(byBracket[b][i]);
        }
      }
    }
    return ordered;
  }, [matches, tournamentFormat]);

  // REGRA: só exibir partidas onde AMBOS os times estão definidos
  const displaySequence = useMemo(() => 
    sequence.filter(m => m.team1_id && m.team2_id),
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

  // Group into display rounds
  const groupedRounds = useMemo(() => {
    if (displaySequence.length === 0) return [];

    const groups: { label: string; items: { match: Match; idx: number }[]; blockKey?: string; isUnlocked?: boolean; isCompleted?: boolean }[] = [];

    const groupStage = displaySequence.filter((m) => m.round === 0);
    const knockoutStage = displaySequence.filter((m) => m.round > 0);

    if (groupStage.length > 0) {
      const bracketCount = new Set(groupStage.map((m) => m.bracket_number || 1)).size;
      const perRound = Math.max(bracketCount, 1);
      let roundNum = 1;
      for (let i = 0; i < groupStage.length; i += perRound) {
        const chunk = groupStage.slice(i, i + perRound);
        groups.push({ label: `Rodada ${roundNum}`, items: chunk.map((m) => ({ match: m, idx: 0 })) });
        roundNum++;
      }
    }

    if (knockoutStage.length > 0) {
      if (tournamentFormat === 'double_elimination') {
        // Use round scheduler blocks
        const schedulerBlocks = buildSchedulerBlocks(matches as any);
        for (const sb of schedulerBlocks) {
          const blockMatches = (sb.matches as Match[]).filter(m => m.team1_id && m.team2_id);
          if (blockMatches.length === 0) continue;
          groups.push({
            label: sb.label,
            items: blockMatches.map((m) => ({ match: m, idx: 0 })),
            blockKey: sb.key,
            isUnlocked: sb.isUnlocked,
            isCompleted: sb.isCompleted,
          });
        }
      } else {
        const rounds = [...new Set(knockoutStage.map((m) => m.round))].sort((a, b) => a - b);
        for (const r of rounds) {
          groups.push({
            label: getRoundLabel(r),
            items: knockoutStage.filter((m) => m.round === r).map((m) => ({ match: m, idx: 0 })),
          });
        }
      }
    }

    let counter = 1;
    for (const g of groups) {
      for (const entry of g.items) {
        entry.idx = counter++;
      }
    }
    return groups;
  }, [displaySequence, matches, matchCountByRound, tournamentFormat]);

  if (displaySequence.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-card/50 p-12 text-center">
        <p className="text-muted-foreground">Gere o chaveamento primeiro para ver a sequência de partidas.</p>
      </div>
    );
  }

  return (
    <section className="space-y-3">
      <h2 className="text-xl font-semibold mb-4">Sequência de Partidas</h2>
      {groupedRounds.map((group) => {
        const isDE = tournamentFormat === 'double_elimination';
        const borderColor = isDE && group.blockKey ? `border-l-4 ${getSchedulerBlockColor(group.blockKey)}` : '';
        return (
        <div key={group.label} className={`space-y-2 ${borderColor} ${isDE && group.isUnlocked === false ? 'opacity-50' : ''} ${borderColor ? 'pl-3 rounded-lg' : ''}`}>
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-semibold text-primary mt-4 mb-1 border-b border-border pb-1">
              {group.label}
            </h3>
            {isDE && group.isUnlocked === false && (
              <Badge variant="outline" className="text-[10px] gap-1 text-muted-foreground mt-3">
                <Lock className="h-3 w-3" /> Bloqueado
              </Badge>
            )}
            {isDE && group.isCompleted && (
              <Badge className="bg-success/20 text-success border-0 text-[10px] mt-3">✓ Concluído</Badge>
            )}
          </div>
          {group.items.map(({ match, idx }) => {
            const isCompleted = match.status === "completed";
            const team1Name = getTeamName(match.team1_id);
            const team2Name = getTeamName(match.team2_id);
            const hasTeams = match.team1_id && match.team2_id;

            return (
              <div
                key={match.id}
                className={`flex items-center gap-4 rounded-lg border bg-card px-4 py-3 shadow-card transition-all ${
                  isCompleted ? "border-success/30 opacity-80" : hasTeams ? "border-primary/30" : "border-border"
                }`}
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-xs font-bold text-muted-foreground shrink-0">
                  {idx}
                </span>
                <div className="flex-1 min-w-0">
                 <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="outline" className="text-xs shrink-0 font-semibold">
                      {getRoundLabel(match.round)}
                    </Badge>
                    <Badge className={`text-xs shrink-0 font-semibold border ${getBracketColor(match)}`}>
                      {getGroupId(match)}
                    </Badge>
                    <span className={`text-sm truncate ${team1Name === "A definir" ? "text-muted-foreground" : "team-name"}`}>{team1Name}</span>
                    <span className="text-xs text-muted-foreground">vs</span>
                    <span className={`text-sm truncate ${team2Name === "A definir" ? "text-muted-foreground" : "team-name"}`}>{team2Name}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {isCompleted && (
                    <>
                      <span className="text-sm font-mono font-bold">
                        {match.score1} - {match.score2}
                      </span>
                      <Trophy className="h-4 w-4 text-success" />
                    </>
                  )}
                  {!isCompleted && hasTeams && (
                    <Badge className="bg-warning/20 text-warning border-0">Pendente</Badge>
                  )}
                  {!isCompleted && !hasTeams && (
                    <Badge variant="outline" className="text-muted-foreground">Aguardando</Badge>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )})}
    </section>
  );
};

export default MatchSequenceTab;
