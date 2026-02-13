import { useMemo, useRef, useEffect, useState } from "react";
import { Trophy, LayoutGrid, List } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { schedulerSequence } from "@/lib/roundScheduler";
import { useIsMobile } from "@/hooks/use-mobile";
import HorizontalTreeView from "@/components/HorizontalTreeView";

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
   Mobile List View — partidas em lista vertical agrupadas por rodada
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

  const matchCountByRound: Record<number, number> = {};
  eliminationMatches.forEach(m => { matchCountByRound[m.round] = (matchCountByRound[m.round] || 0) + 1; });

  // Group by bracket_type + round for better organization
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
  const zoomContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try { localStorage.setItem('bracket-view-mode', viewMode); } catch {}
  }, [viewMode]);

  // Auto-scroll to center on mobile bracket mode
  useEffect(() => {
    if (isMobile && viewMode === 'bracket' && zoomContainerRef.current) {
      const el = zoomContainerRef.current;
      requestAnimationFrame(() => {
        el.scrollLeft = (el.scrollWidth - el.clientWidth) / 2;
      });
    }
  }, [isMobile, viewMode, matches.length]);

  const getName = (id: string | null) => {
    if (!id) return "A definir";
    return participants.find((p) => p.id === id)?.name || "A definir";
  };

  // Build global match numbering from scheduler sequence
  const matchNumberMap = useMemo(() => {
    const seq = schedulerSequence(matches);
    const map = new Map<string, number>();
    seq.forEach((m, i) => map.set(m.id, i + 1));
    // Also number group stage matches not in scheduler
    let next = map.size + 1;
    for (const m of matches) {
      if (!map.has(m.id)) map.set(m.id, next++);
    }
    return map;
  }, [matches]);

  const groupMatches = useMemo(() => matches.filter((m) => m.round === 0), [matches]);
  const hasGroupStage = groupMatches.length > 0;
  const hasElimination = useMemo(() => matches.some((m) => m.round > 0), [matches]);


  if (!hasGroupStage && !hasElimination) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-card/50 p-12 text-center">
        <p className="text-muted-foreground">Nenhuma estrutura de chaveamento gerada.</p>
      </div>
    );
  }

  const mobileZoom = 0.7;

  return (
    <div className="w-full space-y-4">
      {/* View mode toggle */}
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

      {/* Bracket Mode — unified view using HorizontalTreeView for both DE and Normal */}
      {viewMode === 'bracket' && hasElimination && (
        <div
          ref={zoomContainerRef}
          className="overflow-x-auto overflow-y-hidden pb-4"
          style={{ touchAction: "pan-x pinch-zoom", WebkitOverflowScrolling: "touch" }}
        >
          <div style={isMobile ? { transform: `scale(${mobileZoom})`, transformOrigin: 'top left', width: `${100 / mobileZoom}%` } : undefined}>
            <HorizontalTreeView matches={matches} getName={getName} matchNumberMap={matchNumberMap} />
          </div>
        </div>
      )}
    </div>
  );
};

export default BracketTreeView;
