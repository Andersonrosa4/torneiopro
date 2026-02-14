import { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Trophy, Lock, CheckCircle2, Clock, AlertCircle, ListOrdered } from "lucide-react";
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
}: {
  match: Match;
  idx: number;
  getTeamName: (id: string | null) => string;
  getRoundLabel: (round: number) => string;
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
          <div className="flex-1 min-w-0 flex items-center gap-1.5">
            <span className={`text-xs font-black truncate ${
              t1Win ? "text-success" : match.team1_id ? "text-foreground" : "text-muted-foreground italic font-normal"
            }`}>
              {team1Name}
            </span>
            <span className="text-[10px] text-muted-foreground/60 shrink-0 font-bold">vs</span>
            <span className={`text-xs font-black truncate ${
              t2Win ? "text-success" : match.team2_id ? "text-foreground" : "text-muted-foreground italic font-normal"
            }`}>
              {team2Name}
            </span>
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
}: {
  label: string;
  items: { match: Match; idx: number }[];
  blockKey?: string;
  isUnlocked?: boolean;
  isCompleted?: boolean;
  isDE: boolean;
  getTeamName: (id: string | null) => string;
  getRoundLabel: (round: number) => string;
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
            <h3 className={`text-sm font-black uppercase tracking-widest ${isDE && blockKey ? getSchedulerBadgeColor(blockKey).split(' ').filter(c => c.startsWith('text-')).join(' ') : 'text-foreground'}`} style={{ textShadow: '1px 1px 0 #000, -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 0 0 15px rgba(255,255,255,0.8)' }}>{label}</h3>
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
  const getTeamName = (teamId: string | null) => {
    if (!teamId) return "A definir";
    const team = teams.find((t) => t.id === teamId);
    return team ? `${team.player1_name} / ${team.player2_name}` : "A definir";
  };

  const matchCountByRound = useMemo(() => {
    const counts: Record<number, number> = {};
    matches.forEach(m => { counts[m.round] = (counts[m.round] || 0) + 1; });
    return counts;
  }, [matches]);

  const getRoundLabel = (round: number) => {
    return getEliminationRoundLabel(round, matchCountByRound[round] || 0);
  };

  // Build grouped blocks
  const groupedRounds = useMemo(() => {
    if (matches.length === 0) return [];

    const displayMatches = matches.filter(m => m.team1_id && m.team2_id);
    if (displayMatches.length === 0) return [];

    const groups: { label: string; items: { match: Match; idx: number }[]; blockKey?: string; isUnlocked?: boolean; isCompleted?: boolean }[] = [];

    const groupStage = displayMatches.filter(m => m.round === 0);
    const knockoutStage = displayMatches.filter(m => m.round > 0);

    // Group stage: split into interleaved rounds
    if (groupStage.length > 0) {
      const brackets = [...new Set(groupStage.map(m => m.bracket_number || 1))].sort((a, b) => a - b);
      const positions = [...new Set(groupStage.map(m => m.position))].sort((a, b) => a - b);

      const interleaved: Match[] = [];
      for (const pos of positions) {
        for (const b of brackets) {
          const match = groupStage.find(m => (m.bracket_number || 1) === b && m.position === pos);
          if (match) interleaved.push(match);
        }
      }

      const perRound = Math.max(brackets.length, 1);
      let roundNum = 1;
      for (let i = 0; i < interleaved.length; i += perRound) {
        const chunk = interleaved.slice(i, i + perRound);
        groups.push({
          label: `Fase de Grupos — Rodada ${roundNum}`,
          items: chunk.map(m => ({ match: m, idx: 0 })),
          blockKey: `GS_R${roundNum}`,
          isUnlocked: true,
          isCompleted: chunk.every(m => m.status === "completed"),
        });
        roundNum++;
      }
    }

    // Knockout
    if (knockoutStage.length > 0) {
      const hasDoubleElimStructure = matches.some(m => m.round > 0 && (m as any).bracket_half);
      if (tournamentFormat === "double_elimination" && hasDoubleElimStructure) {
        const eliminationOnly = matches.filter(m => m.round > 0);
        const schedulerBlocks = buildSchedulerBlocks(eliminationOnly as any);
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
        const rounds = [...new Set(knockoutStage.map(m => m.round))].sort((a, b) => a - b);
        for (const r of rounds) {
          const rMatches = knockoutStage.filter(m => m.round === r);
          groups.push({
            label: getRoundLabel(r),
            items: rMatches.map(m => ({ match: m, idx: 0 })),
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
  }, [matches, tournamentFormat, matchCountByRound]);

  // Stats
  const displayMatches = useMemo(() => matches.filter(m => m.team1_id && m.team2_id), [matches]);
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
      {/* Progress */}
      <ProgressSummary total={displayMatches.length} completed={completedCount} pending={pendingCount} />

      {/* Blocks */}
      {groupedRounds.map((group) => (
        <BlockSection
          key={group.label}
          label={group.label}
          items={group.items}
          blockKey={group.blockKey}
          isUnlocked={group.isUnlocked}
          isCompleted={group.isCompleted}
          isDE={isDE}
          getTeamName={getTeamName}
          getRoundLabel={getRoundLabel}
        />
      ))}
    </section>
  );
};

export default MatchSequenceTab;
