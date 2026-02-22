import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Trophy, Lock, CheckCircle2, Clock, AlertCircle, ListOrdered, Filter } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getEliminationRoundLabel } from "@/lib/roundLabels";
import { buildSchedulerBlocks, getSchedulerBlockColor, getSchedulerBadgeColor } from "@/lib/roundScheduler";

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
  winner_team_id: string | null;
  status: string;
  bracket_number: number;
  score1: number | null;
  score2: number | null;
  bracket_type?: string;
  bracket_half?: string | null;
}

interface Team {
  id: string;
  player1_name: string;
  player2_name: string;
}

interface MatchSequenceTabProps {
  matches: Match[];
  teams: Team[];
  tournamentFormat?: string;
}

/* ─── Progress Bar ─── */
const ProgressSummary = ({ total, completed, pending }: { total: number; completed: number; pending: number }) => {
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
  return (
    <div className="rounded-xl border border-border bg-card backdrop-blur-sm p-4 space-y-3">
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

/* ─── Match Row ─── */
const MatchRow = ({
  match,
  idx,
  getTeamName,
  getRoundLabel,
  teamGroupMap,
}: {
  match: Match;
  idx: number;
  getTeamName: (id: string | null) => string;
  getRoundLabel: (round: number) => string;
  teamGroupMap: Record<string, { group: string; pos: number }>;
}) => {
  const isCompleted = match.status === "completed";
  const team1Name = getTeamName(match.team1_id);
  const team2Name = getTeamName(match.team2_id);
  const t1Win = match.winner_team_id === match.team1_id && isCompleted;
  const t2Win = match.winner_team_id === match.team2_id && isCompleted;
  const hasTeams = match.team1_id && match.team2_id;

  return (
    <div
      className={`group relative flex items-stretch rounded-lg border-2 bg-secondary/60 transition-all hover:shadow-md ${
        isCompleted
          ? "border-success/40"
          : hasTeams
          ? "border-black/20 hover:border-primary/40 shadow-sm"
          : "border-border/60"
      }`}
    >
      {/* Number */}
      <div className={`flex items-center justify-center w-10 shrink-0 rounded-l-lg text-xs font-black border-r border-black/10 ${
        isCompleted ? "bg-success/20 text-success" : hasTeams ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"
      }`}>
        {idx}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 px-3 py-2 space-y-1">
        {/* Teams */}
        <div className="flex items-center gap-2">
          <div className="flex-1 min-w-0 flex items-center gap-1.5 flex-wrap">
            <span className={`text-xs font-black truncate ${
              t1Win ? "text-success" : match.team1_id ? "text-foreground" : "text-muted-foreground italic font-normal"
            }`}>
              {team1Name}
            </span>
            {match.team1_id && match.bracket_number && match.round === 0 && (
              <span className="text-[8px] font-bold text-cyan-300 bg-cyan-500/20 border border-cyan-400/40 rounded px-1 py-0 leading-tight shrink-0">
                {`Grupo ${String.fromCharCode(64 + (match.bracket_number || 1))}`}
              </span>
            )}
            {match.team1_id && match.round > 0 && teamGroupMap[match.team1_id] && (
              <span className="text-[8px] font-bold text-cyan-300 bg-cyan-500/20 border border-cyan-400/40 rounded px-1 py-0 leading-tight shrink-0">
                {`${teamGroupMap[match.team1_id].pos}º Grupo ${teamGroupMap[match.team1_id].group}`}
              </span>
            )}
            <span className="text-[10px] text-muted-foreground/60 shrink-0 font-bold">vs</span>
            <span className={`text-xs font-black truncate ${
              t2Win ? "text-success" : match.team2_id ? "text-foreground" : "text-muted-foreground italic font-normal"
            }`}>
              {team2Name}
            </span>
            {match.team2_id && match.bracket_number && match.round === 0 && (
              <span className="text-[8px] font-bold text-cyan-300 bg-cyan-500/20 border border-cyan-400/40 rounded px-1 py-0 leading-tight shrink-0">
                {`Grupo ${String.fromCharCode(64 + (match.bracket_number || 1))}`}
              </span>
            )}
            {match.team2_id && match.round > 0 && teamGroupMap[match.team2_id] && (
              <span className="text-[8px] font-bold text-cyan-300 bg-cyan-500/20 border border-cyan-400/40 rounded px-1 py-0 leading-tight shrink-0">
                {`${teamGroupMap[match.team2_id].pos}º Grupo ${teamGroupMap[match.team2_id].group}`}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Score / Status */}
      <div className="flex items-center gap-2 px-3 shrink-0">
        {isCompleted && (
          <>
            <span className="text-sm font-mono font-bold text-foreground tabular-nums">
              {match.score1} <span className="text-muted-foreground/50">×</span> {match.score2}
            </span>
            <Trophy className="h-3.5 w-3.5 text-success" />
          </>
        )}
        {!isCompleted && hasTeams && (
          <Badge className="bg-warning/15 text-warning border-0 text-[10px] px-2">Pendente</Badge>
        )}
        {!isCompleted && !hasTeams && (
          <Badge variant="outline" className="text-muted-foreground/60 text-[10px] px-2 border-border/40">Aguardando</Badge>
        )}
      </div>
    </div>
  );
};

/* ─── Draw Banner ─── */
const DrawBanner = ({ itemCount }: { itemCount: number }) => (
  <div className="rounded-xl border border-primary/30 bg-gradient-to-r from-primary/10 via-accent/10 to-primary/10 px-4 py-3 flex items-center gap-3">
    <span className="text-2xl">🎲</span>
    <div className="flex-1">
      <p className="text-sm font-black text-primary tracking-wide uppercase">Resultado do Sorteio</p>
      <p className="text-xs text-muted-foreground mt-0.5">
        {itemCount} confronto{itemCount !== 1 ? "s" : ""} definido{itemCount !== 1 ? "s" : ""} aleatoriamente — 1ª rodada
      </p>
    </div>
    <div className="flex items-center gap-1.5 text-xs text-muted-foreground bg-background/60 border border-border/50 rounded-lg px-2.5 py-1.5">
      <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse inline-block" />
      Sorteio concluído
    </div>
  </div>
);

/* ─── Block Section ─── */
const BlockSection = ({
  label,
  items,
  blockKey,
  isUnlocked,
  isCompleted,
  isDE,
  getTeamName,
  getRoundLabel,
  teamGroupMap,
}: {
  label: string;
  items: { match: Match; idx: number }[];
  blockKey?: string;
  isUnlocked?: boolean;
  isCompleted?: boolean;
  isDE: boolean;
  getTeamName: (id: string | null) => string;
  getRoundLabel: (round: number) => string;
  teamGroupMap: Record<string, { group: string; pos: number }>;
}) => {
  const completedCount = items.filter(i => i.match.status === "completed").length;
  const totalCount = items.length;
  const pct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  const borderColor = isDE && blockKey ? getSchedulerBlockColor(blockKey) : "border-l-primary";
  const locked = isDE && isUnlocked === false;

  return (
    <div className={`rounded-xl border bg-card/60 overflow-hidden border-l-4 ${borderColor} ${locked ? "opacity-40" : ""}`}>
      {/* Header */}
      <div className={`px-4 py-3 border-b border-black/20 bg-muted/20 ${isDE && blockKey ? getSchedulerBadgeColor(blockKey).split(' ').filter(c => c.startsWith('bg-'))[0] : ''}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h3 className={`text-sm font-black uppercase tracking-widest ${isDE && blockKey ? getSchedulerBadgeColor(blockKey).split(' ').filter(c => c.startsWith('text-')).join(' ') : 'text-foreground'}`} style={{ textShadow: '0 0 20px rgba(255,255,255,1), 0 0 40px rgba(255,255,255,0.9), 0 0 60px rgba(255,255,255,0.6), 1px 1px 0 #000, -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000' }}>{label}</h3>
            {locked && (
              <Badge variant="outline" className="text-[9px] gap-0.5 text-muted-foreground border-border/50 px-1.5 py-0">
                <Lock className="h-2.5 w-2.5" /> Bloqueado
              </Badge>
            )}
            {isDE && isCompleted && (
              <Badge className="bg-success/15 text-success border-0 text-[9px] px-1.5 py-0">
                <CheckCircle2 className="h-2.5 w-2.5 mr-0.5" /> Concluído
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-muted-foreground tabular-nums">{completedCount}/{totalCount}</span>
            <div className="w-16 h-1.5 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full bg-success transition-all duration-300"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Match List */}
      <div className="p-2 space-y-1.5">
        {items.map(({ match, idx }) => (
          <MatchRow
            key={match.id}
            match={match}
            idx={idx}
            getTeamName={getTeamName}
            getRoundLabel={getRoundLabel}
            teamGroupMap={teamGroupMap}
          />
        ))}
      </div>
    </div>
  );
};

/* ═══════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════ */
const MatchSequenceTab = ({ matches, teams, tournamentFormat = 'single_elimination' }: MatchSequenceTabProps) => {
  const [selectedBracket, setSelectedBracket] = useState<string>("all");

  const getTeamName = (teamId: string | null) => {
    if (!teamId) return "A definir";
    const team = teams.find((t) => t.id === teamId);
    return team ? `${team.player1_name} / ${team.player2_name}` : "A definir";
  };

  // Build team -> group info map from group-stage matches (letter + position)
  const teamGroupMap = useMemo(() => {
    const map: Record<string, { group: string; pos: number }> = {};
    const groupTeams: Record<number, Set<string>> = {};
    const teamWins: Record<string, number> = {};
    const teamPoints: Record<string, number> = {};
    const teamPointsFor: Record<string, number> = {};
    const teamPointsAgainst: Record<string, number> = {};
    for (const m of matches) {
      if (m.round === 0 && m.bracket_number) {
        if (!groupTeams[m.bracket_number]) groupTeams[m.bracket_number] = new Set();
        if (m.team1_id) { groupTeams[m.bracket_number].add(m.team1_id); teamWins[m.team1_id] = teamWins[m.team1_id] || 0; teamPoints[m.team1_id] = teamPoints[m.team1_id] || 0; teamPointsFor[m.team1_id] = teamPointsFor[m.team1_id] || 0; teamPointsAgainst[m.team1_id] = teamPointsAgainst[m.team1_id] || 0; }
        if (m.team2_id) { groupTeams[m.bracket_number].add(m.team2_id); teamWins[m.team2_id] = teamWins[m.team2_id] || 0; teamPoints[m.team2_id] = teamPoints[m.team2_id] || 0; teamPointsFor[m.team2_id] = teamPointsFor[m.team2_id] || 0; teamPointsAgainst[m.team2_id] = teamPointsAgainst[m.team2_id] || 0; }
        if (m.status === 'completed') {
          if (m.winner_team_id) {
            teamWins[m.winner_team_id] = (teamWins[m.winner_team_id] || 0) + 1;
            teamPoints[m.winner_team_id] = (teamPoints[m.winner_team_id] || 0) + 3;
          }
          if (m.team1_id && m.score1 != null && m.score2 != null) {
            teamPointsFor[m.team1_id] = (teamPointsFor[m.team1_id] || 0) + m.score1;
            teamPointsAgainst[m.team1_id] = (teamPointsAgainst[m.team1_id] || 0) + m.score2;
          }
          if (m.team2_id && m.score1 != null && m.score2 != null) {
            teamPointsFor[m.team2_id] = (teamPointsFor[m.team2_id] || 0) + m.score2;
            teamPointsAgainst[m.team2_id] = (teamPointsAgainst[m.team2_id] || 0) + m.score1;
          }
        }
      }
    }
    for (const [bn, teamSet] of Object.entries(groupTeams)) {
      const letter = String.fromCharCode(64 + Number(bn));
      const sorted = [...teamSet].sort((a, b) => {
        const ptDiff = (teamPoints[b] || 0) - (teamPoints[a] || 0);
        if (ptDiff !== 0) return ptDiff;
        const diffA = (teamPointsFor[a] || 0) - (teamPointsAgainst[a] || 0);
        const diffB = (teamPointsFor[b] || 0) - (teamPointsAgainst[b] || 0);
        return diffB - diffA;
      });
      sorted.forEach((tid, idx) => { map[tid] = { group: letter, pos: idx + 1 }; });
    }
    return map;
  }, [matches]);

  // Available brackets for filter
  const availableBrackets = useMemo(() => {
    const brackets = [...new Set(matches.map(m => m.bracket_number).filter(Boolean))].sort((a, b) => (a || 0) - (b || 0));
    return brackets as number[];
  }, [matches]);

  // Filter matches by selected bracket
  const filteredMatches = useMemo(() => {
    if (selectedBracket === "all") return matches;
    const bracketNum = parseInt(selectedBracket);
    return matches.filter(m => m.bracket_number === bracketNum);
  }, [matches, selectedBracket]);

  const matchCountByRound = useMemo(() => {
    const counts: Record<number, number> = {};
    filteredMatches.filter(m => (m as any).bracket_type !== 'third_place').forEach(m => { counts[m.round] = (counts[m.round] || 0) + 1; });
    return counts;
  }, [filteredMatches]);

  const getRoundLabel = (round: number) => {
    return getEliminationRoundLabel(round, matchCountByRound[round] || 0);
  };

  // Build grouped blocks
  const groupedRounds = useMemo(() => {
    if (filteredMatches.length === 0) return [];

    // Pass ALL matches to the scheduler (including chapéu with only 1 team)
    // so it can correctly compute isUnlocked based on full match status
    const allEliminationMatches = filteredMatches.filter(m => m.round > 0);
    const displayMatches = filteredMatches.filter(m => m.team1_id && m.team2_id);
    if (displayMatches.length === 0) return [];

    const groups: { label: string; items: { match: Match; idx: number }[]; blockKey?: string; isUnlocked?: boolean; isCompleted?: boolean }[] = [];

    const groupStage = displayMatches.filter(m => m.round === 0);
    const knockoutStage = displayMatches.filter(m => m.round > 0);

    // Group stage: proper round-robin rounds
    if (groupStage.length > 0) {
      // Build round-robin rounds per bracket
      const brackets = [...new Set(groupStage.map(m => m.bracket_number || 1))].sort((a, b) => a - b);
      const rrByBracket: Record<number, Match[][]> = {};
      for (const b of brackets) {
        const bMatches = groupStage.filter(m => (m.bracket_number || 1) === b);
        // Greedy round-robin: no team plays twice per round
        const remaining = [...bMatches];
        const rounds: Match[][] = [];
        while (remaining.length > 0) {
          const round: Match[] = [];
          const used = new Set<string>();
          for (let i = 0; i < remaining.length; i++) {
            const m = remaining[i];
            if (m.team1_id && m.team2_id && !used.has(m.team1_id) && !used.has(m.team2_id)) {
              round.push(m);
              used.add(m.team1_id);
              used.add(m.team2_id);
              remaining.splice(i, 1);
              i--;
            }
          }
          if (round.length === 0 && remaining.length > 0) {
            rounds.push([remaining.shift()!]);
          } else {
            rounds.push(round);
          }
        }
        rrByBracket[b] = rounds;
      }

      const maxRRRounds = Math.max(...Object.values(rrByBracket).map(rr => rr.length), 0);
      for (let ri = 0; ri < maxRRRounds; ri++) {
        const chunk: Match[] = [];
        const matchesPerBracket = brackets.map(b => rrByBracket[b]?.[ri] || []);
        const maxPerBracket = Math.max(...matchesPerBracket.map(m => m.length), 0);
        for (let mi = 0; mi < maxPerBracket; mi++) {
          for (let bi = 0; bi < brackets.length; bi++) {
            if (matchesPerBracket[bi]?.[mi]) chunk.push(matchesPerBracket[bi][mi]);
          }
        }
        if (chunk.length === 0) continue;
        groups.push({
          label: `Fase de Grupos — Rodada ${ri + 1}`,
          items: chunk.map(m => ({ match: m, idx: 0 })),
          blockKey: `GS_R${ri + 1}`,
          isUnlocked: true,
          isCompleted: chunk.every(m => m.status === "completed"),
        });
      }
    }

    // Knockout (excluding third_place)
    if (knockoutStage.length > 0) {
      const knockoutNormal = knockoutStage.filter(m => (m as any).bracket_type !== 'third_place');
      const thirdPlaceMatches = knockoutStage.filter(m => (m as any).bracket_type === 'third_place');
      const hasDoubleElimStructure = matches.some(m => m.round > 0 && (m as any).bracket_half);
      if (tournamentFormat === "double_elimination" && hasDoubleElimStructure) {
        const schedulerBlocks = buildSchedulerBlocks(allEliminationMatches as any);
        for (const sb of schedulerBlocks) {
          const blockMatches = (sb.matches as Match[]).filter(m => m.team1_id && m.team2_id);
          if (blockMatches.length === 0) continue;
          groups.push({
            label: sb.label,
            items: blockMatches.map(m => ({ match: m, idx: 0 })),
            blockKey: sb.key,
            isUnlocked: sb.isUnlocked,
            isCompleted: sb.isCompleted,
          });
        }
      } else {
        const rounds = [...new Set(knockoutNormal.map(m => m.round))].sort((a, b) => a - b);
        const finalRound = rounds.length > 0 ? rounds[rounds.length - 1] : -1;
        for (const r of rounds) {
          // Insert 3rd place block right before the final round
          if (r === finalRound && thirdPlaceMatches.length > 0) {
            groups.push({
              label: "🥉 Disputa de 3º Lugar",
              items: thirdPlaceMatches.map(m => ({ match: m, idx: 0 })),
              blockKey: "THIRD_PLACE",
              isUnlocked: true,
              isCompleted: thirdPlaceMatches.every(m => m.status === "completed"),
            });
          }
          const rMatches = knockoutNormal.filter(m => m.round === r);
          // Group paired matches (same next_win_match_id) together for bracket order
          const byNextMatch = new Map<string, Match[]>();
          for (const m of rMatches) {
            const key = (m as any).next_win_match_id || `solo_${m.id}`;
            if (!byNextMatch.has(key)) byNextMatch.set(key, []);
            byNextMatch.get(key)!.push(m);
          }
          const pairedGroups = [...byNextMatch.values()].map(g => g.sort((a, b) => a.position - b.position));
          pairedGroups.sort((a, b) => a[0].position - b[0].position);
          const orderedMatches = pairedGroups.flat();
          groups.push({
            label: getRoundLabel(r),
            items: orderedMatches.map(m => ({ match: m, idx: 0 })),
          });
        }
      }
    }

    // Number all items globally
    let counter = 1;
    for (const g of groups) {
      for (const entry of g.items) {
        entry.idx = counter++;
      }
    }
    return groups;
  }, [filteredMatches, tournamentFormat, matchCountByRound]);

  // Stats
  const displayMatches = useMemo(() => filteredMatches.filter(m => m.team1_id && m.team2_id), [filteredMatches]);
  const completedCount = useMemo(() => displayMatches.filter(m => m.status === "completed").length, [displayMatches]);
  const pendingCount = useMemo(() => displayMatches.filter(m => m.status !== "completed" && m.team1_id && m.team2_id).length, [displayMatches]);

  if (displayMatches.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-card/50 p-12 text-center">
        <p className="text-muted-foreground">Gere o chaveamento primeiro para ver a sequência de partidas.</p>
      </div>
    );
  }

  const isDE = tournamentFormat === "double_elimination";

  return (
    <section className="space-y-4">
      {/* Bracket Filter */}
      {availableBrackets.length > 1 && (
        <div className="flex items-center gap-3 rounded-xl border border-border bg-card backdrop-blur-sm p-3">
          <Filter className="h-4 w-4 text-primary shrink-0" />
          <span className="text-sm font-bold text-foreground shrink-0">Filtrar por Chave:</span>
          <Select value={selectedBracket} onValueChange={setSelectedBracket}>
            <SelectTrigger className="w-[180px] h-9 text-sm">
              <SelectValue placeholder="Todas as chaves" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as chaves</SelectItem>
              {availableBrackets.map(b => (
                <SelectItem key={b} value={String(b)}>
                  Chave {String.fromCharCode(64 + b)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {selectedBracket !== "all" && (
            <button
              onClick={() => setSelectedBracket("all")}
              className="text-xs text-muted-foreground hover:text-foreground underline"
            >
              Limpar filtro
            </button>
          )}
        </div>
      )}

      {/* Progress */}
      <ProgressSummary total={displayMatches.length} completed={completedCount} pending={pendingCount} />

      {/* Blocks */}
      {groupedRounds.map((group, groupIdx) => (
        <div key={group.label} className="space-y-2">
          {groupIdx === 0 && <DrawBanner itemCount={group.items.length} />}
          <BlockSection
            label={group.label}
            items={group.items}
            blockKey={group.blockKey}
            isUnlocked={group.isUnlocked}
            isCompleted={group.isCompleted}
            isDE={isDE}
            getTeamName={getTeamName}
            getRoundLabel={getRoundLabel}
            teamGroupMap={teamGroupMap}
          />
        </div>
      ))}
    </section>
  );
};

export default MatchSequenceTab;
