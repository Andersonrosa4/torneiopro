import { useMemo, useRef, useEffect, useState } from "react";
import { Trophy, LayoutGrid, List } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { schedulerSequence } from "@/lib/roundScheduler";
import { getEliminationRoundLabel } from "@/lib/roundLabels";
import { useIsMobile } from "@/hooks/use-mobile";

interface Participant {
  id: string;
  name: string;
  seed: number | null;
}

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
  modality_id?: string;
  next_win_match_id?: string | null;
  next_lose_match_id?: string | null;
}

interface BracketTreeViewProps {
  matches: Match[];
  participants: Participant[];
  isOwner: boolean;
  onDeclareWinner: (matchId: string, winnerId: string) => void;
  onUpdateScore: (matchId: string, score1: number, score2: number) => void;
  structuralOnly?: boolean;
  tournamentFormat?: string;
}

/* ────────────────────────────────────────────────────
   Match Card — compact card for bracket column view
   ──────────────────────────────────────────────────── */
const MatchCard = ({
  match,
  getName,
  isFinal,
  matchNumber,
}: {
  match: Match;
  getName: (id: string | null) => string;
  isFinal?: boolean;
  matchNumber?: number;
}) => {
  const p1Name = getName(match.team1_id);
  const p2Name = getName(match.team2_id);
  const isCompleted = match.status === "completed";
  const t1Win = match.winner_team_id === match.team1_id && isCompleted;
  const t2Win = match.winner_team_id === match.team2_id && isCompleted;

  return (
    <div className={`w-56 rounded-lg border bg-card shadow-card ${isFinal ? "border-primary/40 shadow-glow" : isCompleted ? "border-success/30" : "border-border"} ${isCompleted ? "opacity-90" : ""}`}>
      {isFinal && (
        <div className="flex items-center justify-center gap-1 rounded-t-lg bg-gradient-primary px-2 py-1 text-xs font-bold text-primary-foreground">
          <Trophy className="h-3 w-3" /> FINAL
        </div>
      )}
      {matchNumber != null && (
        <div className="px-2 pt-1 text-[9px] font-semibold text-muted-foreground/70">
          Jogo {matchNumber}
        </div>
      )}
      <div className={`flex items-center gap-2 border-b border-border px-3 py-2 ${t1Win ? "bg-success/10" : ""}`}>
        <span className={`flex-1 text-sm truncate ${t1Win ? "text-success font-bold" : p1Name === "A definir" ? "text-muted-foreground" : "team-name"}`}>
          {p1Name}
        </span>
        <span className="text-sm font-bold tabular-nums">{match.score1 ?? "-"}</span>
        {isCompleted && t1Win && <Trophy className="h-3.5 w-3.5 text-success shrink-0" />}
      </div>
      <div className={`flex items-center gap-2 px-3 py-2 ${t2Win ? "bg-success/10" : ""}`}>
        <span className={`flex-1 text-sm truncate ${t2Win ? "text-success font-bold" : p2Name === "A definir" ? "text-muted-foreground" : "team-name"}`}>
          {p2Name}
        </span>
        <span className="text-sm font-bold tabular-nums">{match.score2 ?? "-"}</span>
        {isCompleted && t2Win && <Trophy className="h-3.5 w-3.5 text-success shrink-0" />}
      </div>
    </div>
  );
};

/* ────────────────────────────────────────────────────
   Column Bracket — renders rounds as side-by-side columns
   ──────────────────────────────────────────────────── */
const ColumnBracket = ({
  sectionMatches,
  getName,
  matchNumberMap,
  label,
  icon,
  colorClass,
}: {
  sectionMatches: Match[];
  getName: (id: string | null) => string;
  matchNumberMap?: Map<string, number>;
  label?: string;
  icon?: string;
  colorClass?: string;
}) => {
  if (sectionMatches.length === 0) return null;

  const rounds = [...new Set(sectionMatches.map(m => m.round))].sort((a, b) => a - b);
  const matchCountByRound: Record<number, number> = {};
  sectionMatches.forEach(m => { matchCountByRound[m.round] = (matchCountByRound[m.round] || 0) + 1; });

  const maxRound = rounds[rounds.length - 1];

  return (
    <div className={`rounded-xl border p-3 space-y-2 ${colorClass || "border-border/50 bg-card/30"}`}>
      {label && (
        <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
          {icon && <span>{icon}</span>}
          <span>{label}</span>
        </div>
      )}
      <div className="overflow-x-auto">
        <div className="flex gap-8 min-w-max">
          {rounds.map(round => {
            const roundMatches = sectionMatches.filter(m => m.round === round).sort((a, b) => a.position - b.position);
            const matchCount = matchCountByRound[round] || 0;
            const roundLabel = getEliminationRoundLabel(round, matchCount);
            const isFinalRound = round === maxRound && matchCount === 1;

            return (
              <div key={round} className="flex flex-col">
                <h3 className="mb-3 text-center text-sm font-semibold text-primary">
                  {roundLabel}
                </h3>
                <div className="flex flex-1 flex-col justify-around gap-4">
                  {roundMatches.map(match => (
                    <MatchCard
                      key={match.id}
                      match={match}
                      getName={getName}
                      isFinal={isFinalRound}
                      matchNumber={matchNumberMap?.get(match.id)}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

/* ────────────────────────────────────────────────────
   Group Stage View
   ──────────────────────────────────────────────────── */
const GroupStageView = ({
  groupMatches,
  getName,
}: {
  groupMatches: Match[];
  getName: (id: string | null) => string;
}) => {
  const groupNumbers = Array.from(new Set(groupMatches.map((m) => m.bracket_number || 1))).sort();

  const getGroupStandings = (groupNum: number) => {
    const gMatches = groupMatches.filter((m) => (m.bracket_number || 1) === groupNum);
    const teamIds = new Set<string>();
    gMatches.forEach((m) => {
      if (m.team1_id) teamIds.add(m.team1_id);
      if (m.team2_id) teamIds.add(m.team2_id);
    });
    return Array.from(teamIds)
      .map((tid) => {
        const wins = gMatches.filter((m) => m.winner_team_id === tid).length;
        const played = gMatches.filter(
          (m) => (m.team1_id === tid || m.team2_id === tid) && m.status === "completed"
        ).length;
        return { id: tid, name: getName(tid), wins, played };
      })
      .sort((a, b) => b.wins - a.wins);
  };

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-bold text-primary flex items-center gap-2">
        <Trophy className="h-5 w-5" /> Fase de Grupos
      </h3>
      <div className="grid gap-4 sm:grid-cols-2">
        {groupNumbers.map((gNum) => {
          const standings = getGroupStandings(gNum);
          return (
            <div key={gNum} className="rounded-xl border border-border bg-card p-4 shadow-card">
              <h4 className="mb-3 text-sm font-bold text-primary uppercase tracking-wider">
                Grupo {gNum}
              </h4>
              <div className="space-y-1">
                {standings.map((s, i) => (
                  <div key={s.id} className="flex items-center justify-between rounded-md bg-secondary/50 px-3 py-1.5 text-xs">
                    <span className="flex items-center gap-2">
                      <span className="font-bold text-muted-foreground">{i + 1}.</span>
                      <span className="team-name">{s.name}</span>
                    </span>
                    <span className="font-bold text-primary">{s.wins}V / {s.played}J</span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

/* ────────────────────────────────────────────────────
   Mobile List View
   ──────────────────────────────────────────────────── */
const MobileListView = ({
  matches,
  getName,
  matchNumberMap,
}: {
  matches: Match[];
  getName: (id: string | null) => string;
  matchNumberMap?: Map<string, number>;
}) => {
  const eliminationMatches = matches.filter(m => m.round > 0);
  if (eliminationMatches.length === 0) return null;

  const blocks: { label: string; matches: Match[] }[] = [];
  const bracketTypes = ['winners', 'losers', 'semi_final', 'final'];
  
  for (const bt of bracketTypes) {
    const btMatches = eliminationMatches.filter(m => (m.bracket_type || 'winners') === bt);
    if (btMatches.length === 0) continue;
    
    const rounds = [...new Set(btMatches.map(m => m.round))].sort((a, b) => a - b);
    for (const r of rounds) {
      const roundMatches = btMatches.filter(m => m.round === r).sort((a, b) => a.position - b.position);
      let label = '';
      if (bt === 'winners') {
        const halves = [...new Set(roundMatches.map(m => m.bracket_half))];
        label = halves.length === 1 
          ? `Vencedores ${halves[0] === 'upper' ? 'A' : 'B'} – Rodada ${r}`
          : `Vencedores – Rodada ${r}`;
      } else if (bt === 'losers') {
        const halves = [...new Set(roundMatches.map(m => m.bracket_half))];
        label = halves.length === 1
          ? `Perdedores ${halves[0] === 'upper' ? 'Superiores' : 'Inferiores'} – Rodada ${r}`
          : `Perdedores – Rodada ${r}`;
      } else if (bt === 'semi_final') {
        label = 'Semifinais';
      } else if (bt === 'final') {
        label = 'Grande Final';
      }
      blocks.push({ label, matches: roundMatches });
    }
  }

  return (
    <div className="space-y-3">
      {blocks.map((block, bi) => (
        <div key={bi} className="rounded-lg border border-border bg-card/30 overflow-hidden">
          <div className="px-3 py-2 border-b border-border bg-muted/30">
            <h4 className="text-xs font-bold text-foreground">{block.label}</h4>
            <span className="text-[10px] text-muted-foreground">{block.matches.length} {block.matches.length === 1 ? 'partida' : 'partidas'}</span>
          </div>
          <div className="p-2 space-y-2">
            {block.matches.map(match => {
              const isCompleted = match.status === 'completed';
              const t1Win = match.winner_team_id === match.team1_id && isCompleted;
              const t2Win = match.winner_team_id === match.team2_id && isCompleted;
              const hasBoth = match.team1_id && match.team2_id;
              const num = matchNumberMap?.get(match.id);

              return (
                <div key={match.id} className={`rounded-lg border bg-card px-3 py-2 ${isCompleted ? 'border-success/30' : hasBoth ? 'border-primary/20' : 'border-border'}`}>
                  <div className="flex items-center gap-2 mb-1.5">
                    {num != null && (
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-muted text-[10px] font-bold text-muted-foreground shrink-0">
                        {num}
                      </span>
                    )}
                    {isCompleted ? (
                      <Badge className="bg-success/20 text-success border-0 text-[10px]">Finalizado</Badge>
                    ) : hasBoth ? (
                      <Badge className="bg-warning/20 text-warning border-0 text-[10px]">Pendente</Badge>
                    ) : (
                      <Badge variant="outline" className="text-muted-foreground text-[10px]">Aguardando</Badge>
                    )}
                    {isCompleted && <Trophy className="h-3.5 w-3.5 text-success ml-auto" />}
                  </div>
                  <div className="space-y-0.5">
                    <div className="flex items-center justify-between">
                      <span className={`text-sm truncate ${t1Win ? 'text-success font-bold' : 'team-name'}`}>
                        {getName(match.team1_id)}
                      </span>
                      {isCompleted && <span className={`font-mono text-sm font-bold ${t1Win ? 'text-success' : 'text-muted-foreground'}`}>{match.score1}</span>}
                    </div>
                    <span className="text-[10px] text-muted-foreground">vs</span>
                    <div className="flex items-center justify-between">
                      <span className={`text-sm truncate ${t2Win ? 'text-success font-bold' : 'team-name'}`}>
                        {getName(match.team2_id)}
                      </span>
                      {isCompleted && <span className={`font-mono text-sm font-bold ${t2Win ? 'text-success' : 'text-muted-foreground'}`}>{match.score2}</span>}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
};

/* ════════════════════════════════════════════════════
   MAIN COMPONENT
   ════════════════════════════════════════════════════ */
const BracketTreeView = ({ matches, participants }: BracketTreeViewProps) => {
  const isMobile = useIsMobile();
  const [viewMode, setViewMode] = useState<'bracket' | 'list'>(() => {
    try {
      const saved = localStorage.getItem('bracket-view-mode');
      if (saved === 'list') return 'list';
      return 'bracket';
    } catch { return 'bracket'; }
  });

  useEffect(() => {
    try { localStorage.setItem('bracket-view-mode', viewMode); } catch {}
  }, [viewMode]);

  const getName = (id: string | null) => {
    if (!id) return "A definir";
    return participants.find((p) => p.id === id)?.name || "A definir";
  };

  const matchNumberMap = useMemo(() => {
    const seq = schedulerSequence(matches);
    const map = new Map<string, number>();
    seq.forEach((m, i) => map.set(m.id, i + 1));
    let next = map.size + 1;
    for (const m of matches) {
      if (!map.has(m.id)) map.set(m.id, next++);
    }
    return map;
  }, [matches]);

  const groupMatches = useMemo(() => matches.filter((m) => m.round === 0), [matches]);
  const hasGroupStage = groupMatches.length > 0;
  const hasElimination = useMemo(() => matches.some((m) => m.round > 0), [matches]);

  // Detect double elimination
  const isDE = useMemo(() => {
    return matches.some(m => m.bracket_type === 'losers' || m.bracket_type === 'final' || m.bracket_type === 'semi_final');
  }, [matches]);

  // DE sections
  const deSections = useMemo(() => {
    if (!isDE) return null;
    const winnersA = matches.filter(m => m.round > 0 && m.bracket_type === "winners" && m.bracket_half === "upper");
    const winnersB = matches.filter(m => m.round > 0 && m.bracket_type === "winners" && m.bracket_half === "lower");
    const losersA = matches.filter(m => m.round > 0 && m.bracket_type === "losers" && m.bracket_half === "upper");
    const losersB = matches.filter(m => m.round > 0 && m.bracket_type === "losers" && m.bracket_half === "lower");
    const semiFinals = matches.filter(m => m.bracket_type === "semi_final");
    const finalMatches = matches.filter(m => m.bracket_type === "final");
    return { winnersA, winnersB, losersA, losersB, semiFinals, finalMatches };
  }, [matches, isDE]);

  // Normal knockout matches
  const knockoutMatches = useMemo(() => matches.filter(m => m.round > 0), [matches]);

  if (!hasGroupStage && !hasElimination) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-card/50 p-12 text-center">
        <p className="text-muted-foreground">Nenhuma estrutura de chaveamento gerada.</p>
      </div>
    );
  }

  return (
    <div className="w-full space-y-4">
      {/* View mode toggle — mobile only */}
      {hasElimination && isMobile && (
        <div className="flex items-center justify-center gap-1 bg-muted/50 rounded-lg p-1">
          <Button
            variant={viewMode === 'bracket' ? 'default' : 'ghost'}
            size="sm"
            className="h-7 text-xs gap-1.5 flex-1"
            onClick={() => setViewMode('bracket')}
          >
            <LayoutGrid className="h-3.5 w-3.5" /> Modo Chave
          </Button>
          <Button
            variant={viewMode === 'list' ? 'default' : 'ghost'}
            size="sm"
            className="h-7 text-xs gap-1.5 flex-1"
            onClick={() => setViewMode('list')}
          >
            <List className="h-3.5 w-3.5" /> Modo Lista
          </Button>
        </div>
      )}

      {/* Group Stage */}
      {hasGroupStage && <GroupStageView groupMatches={groupMatches} getName={getName} />}

      {/* Mobile List Mode */}
      {isMobile && viewMode === 'list' && hasElimination && (
        <MobileListView matches={matches} getName={getName} matchNumberMap={matchNumberMap} />
      )}

      {/* Bracket Column Mode */}
      {viewMode === 'bracket' && hasElimination && (
        <div className="overflow-x-auto pb-4" style={{ WebkitOverflowScrolling: "touch" }}>
          {isDE && deSections ? (
            <div className="space-y-4">
              <ColumnBracket
                sectionMatches={deSections.winnersA}
                getName={getName}
                matchNumberMap={matchNumberMap}
                label="Vencedores A"
                icon="🏆"
                colorClass="border-primary/20 bg-primary/[0.03]"
              />
              <ColumnBracket
                sectionMatches={deSections.winnersB}
                getName={getName}
                matchNumberMap={matchNumberMap}
                label="Vencedores B"
                icon="🏆"
                colorClass="border-primary/15 bg-primary/[0.02]"
              />
              <ColumnBracket
                sectionMatches={deSections.losersA}
                getName={getName}
                matchNumberMap={matchNumberMap}
                label="Perdedores Superiores"
                icon="⬇"
                colorClass="border-destructive/15 bg-destructive/[0.03]"
              />
              <ColumnBracket
                sectionMatches={deSections.losersB}
                getName={getName}
                matchNumberMap={matchNumberMap}
                label="Perdedores Inferiores"
                icon="⬇"
                colorClass="border-destructive/10 bg-destructive/[0.02]"
              />
              {(deSections.semiFinals.length > 0 || deSections.finalMatches.length > 0) && (
                <ColumnBracket
                  sectionMatches={[...deSections.semiFinals, ...deSections.finalMatches]}
                  getName={getName}
                  matchNumberMap={matchNumberMap}
                  label="Fase Final"
                  icon="🏆"
                  colorClass="border-primary/30 bg-primary/[0.04]"
                />
              )}
            </div>
          ) : (
            <ColumnBracket
              sectionMatches={knockoutMatches}
              getName={getName}
              matchNumberMap={matchNumberMap}
            />
          )}
        </div>
      )}
    </div>
  );
};

export default BracketTreeView;
