import { useMemo, useRef, useEffect, useState, useCallback } from "react";
import { Trophy, ChevronRight, ChevronLeft, LayoutGrid, List, GitBranch } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getSlotFeeders } from "@/lib/feederLabels";
import { schedulerSequence } from "@/lib/roundScheduler";
import { useIsMobile } from "@/hooks/use-mobile";
import { getEliminationRoundLabel } from "@/lib/roundLabels";
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
   Match Card — compact, status-aware, with feeder labels
   ──────────────────────────────────────────────────── */
const MatchCard = ({
  match,
  getName,
  scale = "normal",
  allMatches,
  matchNumber,
  matchNumberMap,
}: {
  match: Match;
  getName: (id: string | null) => string;
  scale?: "small" | "normal" | "semi" | "final";
  allMatches?: Match[];
  matchNumber?: number;
  matchNumberMap?: Map<string, number>;
}) => {
  const isCompleted = match.status === "completed";
  const t1Win = match.winner_team_id === match.team1_id && isCompleted;
  const t2Win = match.winner_team_id === match.team2_id && isCompleted;
  const hasBothTeams = match.team1_id && match.team2_id;
  const isWaiting = !hasBothTeams;

  // Compute feeders from actual feeder mapping with real match numbers
  const feeders = allMatches ? getSlotFeeders(match, allMatches, matchNumberMap) : { team1: null, team2: null };

  const sizeClasses = {
    small: "w-[140px] text-[10px]",
    normal: "w-[160px] text-[11px]",
    semi: "w-[175px] text-xs",
    final: "w-[190px] text-xs",
  };

  const borderClasses = (() => {
    if (scale === "final") return "border-primary/60 shadow-[0_0_16px_hsl(var(--primary)/0.3)] ring-1 ring-primary/20";
    if (scale === "semi") return "border-primary/40 shadow-[0_0_10px_hsl(var(--primary)/0.15)]";
    if (isCompleted) return "border-success/40";
    if (hasBothTeams) return "border-primary/25";
    return "border-border/60";
  })();

  const statusBadge = (() => {
    if (isCompleted) return <Badge className="bg-success/20 text-success border-0 text-[8px] px-1.5 py-0 leading-tight">Finalizado</Badge>;
    if (hasBothTeams) return <Badge className="bg-warning/20 text-warning border-0 text-[8px] px-1.5 py-0 leading-tight">Pendente</Badge>;
    return <Badge variant="outline" className="text-muted-foreground text-[8px] px-1.5 py-0 leading-tight border-border/40">Aguardando</Badge>;
  })();

  return (
    <div
      data-match-id={match.id}
      className={`rounded-lg border bg-card/90 backdrop-blur-sm shrink-0 transition-all ${sizeClasses[scale]} ${borderClasses}`}
    >
      {/* Match number label */}
      {matchNumber != null && (
        <div className="px-2 pt-1 text-[8px] font-semibold text-muted-foreground/70 leading-none">
          Jogo {matchNumber}
        </div>
      )}
      {scale === "final" && (
        <div className="flex items-center justify-center gap-1 rounded-t-lg bg-gradient-primary px-2 py-0.5 text-[9px] font-bold text-primary-foreground tracking-wider">
          <Trophy className="h-2.5 w-2.5" /> GRANDE FINAL
        </div>
      )}
      {scale === "semi" && (
        <div className="flex items-center justify-center gap-1 rounded-t-lg bg-primary/15 px-2 py-0.5 text-[9px] font-semibold text-primary tracking-wider">
          SEMIFINAL
        </div>
      )}

      {/* Team 1 + Feeder */}
      <div className="space-y-0.5">
        <div className={`flex items-center justify-between px-2 py-1.5 ${t1Win ? "bg-success/10" : ""}`}>
          <span className={`truncate flex-1 ${t1Win ? "font-bold text-success" : isWaiting && !match.team1_id ? "text-muted-foreground/50 italic" : "team-name"}`}>
            {getName(match.team1_id)}
          </span>
          {match.score1 !== null && isCompleted && (
            <span className={`font-mono ml-1 font-bold ${t1Win ? "text-success" : "text-muted-foreground"}`}>
              {match.score1}
            </span>
          )}
        </div>
        {feeders.team1 && (
          <div className="px-2 pb-1 text-[7px] text-muted-foreground/60 font-medium">
            ({feeders.team1.label})
          </div>
        )}
      </div>

      <div className="border-t border-border/30" />

      {/* Team 2 + Feeder */}
      <div className="space-y-0.5">
        <div className={`flex items-center justify-between px-2 py-1.5 ${t2Win ? "bg-success/10" : ""}`}>
          <span className={`truncate flex-1 ${t2Win ? "font-bold text-success" : isWaiting && !match.team2_id ? "text-muted-foreground/50 italic" : "team-name"}`}>
            {getName(match.team2_id)}
          </span>
          {match.score2 !== null && isCompleted && (
            <span className={`font-mono ml-1 font-bold ${t2Win ? "text-success" : "text-muted-foreground"}`}>
              {match.score2}
            </span>
          )}
        </div>
        {feeders.team2 && (
          <div className="px-2 pb-1 text-[7px] text-muted-foreground/60 font-medium">
            ({feeders.team2.label})
          </div>
        )}
      </div>

      {/* Status */}
      <div className="flex justify-center border-t border-border/20 px-2 py-1">
        {statusBadge}
      </div>
    </div>
  );
};

/* ────────────────────────────────────────────────────
   SVG Connectors between rounds
   ──────────────────────────────────────────────────── */
const BracketConnectors = ({
  containerRef,
  matches,
  reversed,
}: {
  containerRef: React.RefObject<HTMLDivElement>;
  matches: Match[];
  reversed?: boolean;
}) => {
  const [paths, setPaths] = useState<string[]>([]);

  const computePaths = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;

    const containerRect = container.getBoundingClientRect();
    const newPaths: string[] = [];

    // Find matches that feed into other matches
    for (const m of matches) {
      if (!m.next_win_match_id) continue;
      const nextMatch = matches.find(n => n.id === m.next_win_match_id);
      if (!nextMatch) continue;

      const srcEl = container.querySelector(`[data-match-id="${m.id}"]`);
      const dstEl = container.querySelector(`[data-match-id="${nextMatch.id}"]`);
      if (!srcEl || !dstEl) continue;

      const srcR = srcEl.getBoundingClientRect();
      const dstR = dstEl.getBoundingClientRect();

      let x1: number, y1: number, x2: number, y2: number;

      if (reversed) {
        x1 = srcR.left - containerRect.left;
        y1 = srcR.top + srcR.height / 2 - containerRect.top;
        x2 = dstR.right - containerRect.left;
        y2 = dstR.top + dstR.height / 2 - containerRect.top;
      } else {
        x1 = srcR.right - containerRect.left;
        y1 = srcR.top + srcR.height / 2 - containerRect.top;
        x2 = dstR.left - containerRect.left;
        y2 = dstR.top + dstR.height / 2 - containerRect.top;
      }

      const midX = (x1 + x2) / 2;
      newPaths.push(`M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`);
    }

    setPaths(newPaths);
  }, [containerRef, matches, reversed]);

  useEffect(() => {
    const timer = setTimeout(computePaths, 250);
    window.addEventListener("resize", computePaths);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("resize", computePaths);
    };
  }, [computePaths]);

  if (paths.length === 0) return null;

  return (
    <svg className="absolute inset-0 pointer-events-none" style={{ zIndex: 0 }}>
      {paths.map((d, i) => (
        <path key={i} d={d} fill="none" stroke="hsl(var(--primary) / 0.35)" strokeWidth="1.5" strokeDasharray="4 3" />
      ))}
    </svg>
  );
};

/* ────────────────────────────────────────────────────
   Bracket Column — renders rounds for a bracket half
   ──────────────────────────────────────────────────── */
const BracketColumn = ({
  bracketMatches,
  getName,
  label,
  icon,
  colorAccent,
  reversed,
  allMatches,
  matchNumberMap,
}: {
  bracketMatches: Match[];
  getName: (id: string | null) => string;
  label: string;
  icon: string;
  colorAccent: string;
  reversed?: boolean;
  allMatches: Match[];
  matchNumberMap?: Map<string, number>;
}) => {
  const containerRef = useRef<HTMLDivElement>(null);

  if (bracketMatches.length === 0) return null;

  const roundGroups: Record<number, Match[]> = {};
  bracketMatches.forEach((m) => {
    if (!roundGroups[m.round]) roundGroups[m.round] = [];
    roundGroups[m.round].push(m);
  });
  const rounds = Object.keys(roundGroups).map(Number).sort((a, b) => a - b);
  const displayRounds = reversed ? [...rounds].reverse() : rounds;
  const maxRound = Math.max(...rounds);

  const getScale = (round: number): "small" | "normal" => {
    if (round === maxRound) return "normal";
    return "small";
  };

  return (
    <div className={`rounded-xl border ${colorAccent} p-3 space-y-2`}>
      <div className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground flex items-center gap-1.5">
        <span>{icon}</span>
        <span>{label}</span>
        {reversed ? <ChevronLeft className="h-3 w-3 ml-auto opacity-50" /> : <ChevronRight className="h-3 w-3 ml-auto opacity-50" />}
      </div>
      <div ref={containerRef} className="relative overflow-x-auto pb-2">
        <BracketConnectors containerRef={containerRef} matches={bracketMatches} reversed={reversed} />
        <div className="flex gap-6 relative" style={{ zIndex: 1 }}>
          {displayRounds.map((round) => {
            const roundMatches = roundGroups[round].sort((a, b) => a.position - b.position);
            return (
              <div key={round} className="flex flex-col items-center shrink-0" style={{ minWidth: 150 }}>
                <div className="text-[9px] uppercase font-semibold text-muted-foreground/60 mb-2 whitespace-nowrap">
                  Rodada {round}
                </div>
                <div className="flex flex-col justify-around gap-3 flex-1">
                   {roundMatches.map((match) => (
                     <MatchCard key={match.id} match={match} getName={getName} scale={getScale(round)} allMatches={allMatches} matchNumber={matchNumberMap?.get(match.id)} matchNumberMap={matchNumberMap} />
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
   Center Column — Semifinals + Final
   ──────────────────────────────────────────────────── */
const CenterColumn = ({
  crossSemis,
  finalMatches,
  getName,
  allMatches,
  matchNumberMap,
}: {
  crossSemis: Match[];
  finalMatches: Match[];
  getName: (id: string | null) => string;
  allMatches: Match[];
  matchNumberMap?: Map<string, number>;
}) => {
  if (crossSemis.length === 0 && finalMatches.length === 0) return null;

  return (
    <div className="flex flex-col items-center justify-center gap-6 px-2">
      {/* Semifinals */}
      {crossSemis.length > 0 && (
        <div className="space-y-4">
          <div className="text-[10px] font-bold uppercase tracking-[0.15em] text-center text-primary/80">
            Semifinais
          </div>
          {crossSemis
            .sort((a, b) => a.position - b.position)
            .map((m, i) => (
              <div key={m.id} className="space-y-1">
                <div className="text-[9px] text-center text-muted-foreground/60 font-medium">
                  Semi {i + 1}
                </div>
                <MatchCard match={m} getName={getName} scale="semi" allMatches={allMatches} matchNumber={matchNumberMap?.get(m.id)} matchNumberMap={matchNumberMap} />
              </div>
            ))}
        </div>
      )}

      {/* Connector between semis and final */}
      {crossSemis.length > 0 && finalMatches.length > 0 && (
        <div className="w-px h-6 bg-gradient-to-b from-primary/30 to-primary/10" />
      )}

      {/* Final */}
      {finalMatches.map((m) => (
        <MatchCard key={m.id} match={m} getName={getName} scale="final" allMatches={allMatches} matchNumber={matchNumberMap?.get(m.id)} matchNumberMap={matchNumberMap} />
      ))}
    </div>
  );
};

/* ────────────────────────────────────────────────────
   Group Stage View (preserved for non-DE formats)
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
   Normal Knockout (non-DE fallback)
   ──────────────────────────────────────────────────── */
const NormalKnockout = ({
  matches,
  getName,
  matchNumberMap,
}: {
  matches: Match[];
  getName: (id: string | null) => string;
  matchNumberMap?: Map<string, number>;
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const knockoutMatches = matches.filter((m) => m.round > 0);

  if (knockoutMatches.length === 0) return null;

  const roundGroups: Record<number, Match[]> = {};
  knockoutMatches.forEach((m) => {
    if (!roundGroups[m.round]) roundGroups[m.round] = [];
    roundGroups[m.round].push(m);
  });
  const rounds = Object.keys(roundGroups).map(Number).sort((a, b) => a - b);
  const maxRound = Math.max(...rounds);

  return (
    <div className="rounded-xl border border-border bg-card/50 p-4">
      <div className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground mb-3">
        🏆 Eliminatória
      </div>
      <div ref={containerRef} className="relative overflow-x-auto">
        <BracketConnectors containerRef={containerRef} matches={knockoutMatches} />
        <div className="flex gap-8 relative" style={{ zIndex: 1 }}>
          {rounds.map((round) => {
            const roundMatches = roundGroups[round].sort((a, b) => a.position - b.position);
            const scale = round === maxRound && roundMatches.length === 1 ? "final" : round === maxRound - 1 ? "semi" : "normal";
            return (
              <div key={round} className="flex flex-col items-center shrink-0" style={{ minWidth: 170 }}>
                <div className="text-[9px] uppercase font-semibold text-muted-foreground/60 mb-2">
                  R{round}
                </div>
                <div className="flex flex-col justify-around gap-3 flex-1">
                   {roundMatches.map((match) => (
                     <MatchCard key={match.id} match={match} getName={getName} scale={scale as any} allMatches={matches} matchNumber={matchNumberMap?.get(match.id)} matchNumberMap={matchNumberMap} />
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
  const [viewMode, setViewMode] = useState<'bracket' | 'list' | 'tree'>(() => {
    try {
      return (localStorage.getItem('bracket-view-mode') as 'bracket' | 'list' | 'tree') || 'bracket';
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

  // Categorize matches for DE layout
  const { winnersA, winnersB, losersA, losersB, semiFinals, finalMatches, isDoubleElimination } = useMemo(() => {
    const wA = matches.filter((m) => m.bracket_type === "winners" && m.bracket_half === "upper");
    const wB = matches.filter((m) => m.bracket_type === "winners" && m.bracket_half === "lower");
    // Perdedores Superiores = losers upper (recebe de Winners B)
    // Perdedores Inferiores = losers lower (recebe de Winners A)
    const losersSuperiores = matches.filter((m) => m.bracket_type === "losers" && m.bracket_half === "upper");
    const losersInferiores = matches.filter((m) => m.bracket_type === "losers" && m.bracket_half === "lower");
    const sf = matches.filter((m) => m.bracket_type === "semi_final");
    const f = matches.filter((m) => m.bracket_type === "final");
    const isDE = wA.length > 0 || wB.length > 0 || sf.length > 0;

    return { winnersA: wA, winnersB: wB, losersA: losersSuperiores, losersB: losersInferiores, semiFinals: sf, finalMatches: f, isDoubleElimination: isDE };
  }, [matches]);

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
      {hasElimination && (
        <div className="flex items-center justify-center gap-1 bg-muted/50 rounded-lg p-1">
          <Button
            variant={viewMode === 'bracket' ? 'default' : 'ghost'}
            size="sm"
            className="h-7 text-xs gap-1.5 flex-1"
            onClick={() => setViewMode('bracket')}
          >
            <LayoutGrid className="h-3.5 w-3.5" /> Modo Atual
          </Button>
          <Button
            variant={viewMode === 'tree' ? 'default' : 'ghost'}
            size="sm"
            className="h-7 text-xs gap-1.5 flex-1"
            onClick={() => setViewMode('tree')}
          >
            <GitBranch className="h-3.5 w-3.5" /> Modo Árvore
          </Button>
          {isMobile && (
            <Button
              variant={viewMode === 'list' ? 'default' : 'ghost'}
              size="sm"
              className="h-7 text-xs gap-1.5 flex-1"
              onClick={() => setViewMode('list')}
            >
              <List className="h-3.5 w-3.5" /> Modo Lista
            </Button>
          )}
        </div>
      )}

      {/* Group Stage */}
      {hasGroupStage && <GroupStageView groupMatches={groupMatches} getName={getName} />}

      {/* Mobile List Mode */}
      {isMobile && viewMode === 'list' && hasElimination && (
        <MobileListView matches={matches} getName={getName} matchNumberMap={matchNumberMap} />
      )}

      {/* Horizontal Tree Mode */}
      {viewMode === 'tree' && hasElimination && (
        <div
          className="overflow-x-auto overflow-y-hidden pb-4"
          style={{ touchAction: "pan-x pinch-zoom", WebkitOverflowScrolling: "touch" }}
        >
          <div style={isMobile ? { transform: `scale(${mobileZoom})`, transformOrigin: 'top left', width: `${100 / mobileZoom}%` } : undefined}>
            <HorizontalTreeView matches={matches} getName={getName} matchNumberMap={matchNumberMap} />
          </div>
        </div>
      )}

      {/* Double Elimination — 3-column layout (original mode) */}
      {viewMode === 'bracket' && isDoubleElimination && (
        <div
          ref={zoomContainerRef}
          className="overflow-x-auto overflow-y-hidden pb-4"
          style={{ touchAction: "pan-x pinch-zoom", WebkitOverflowScrolling: "touch" }}
        >
          <div
            style={isMobile ? { transform: `scale(${mobileZoom})`, transformOrigin: 'top left', width: `${100 / mobileZoom}%` } : undefined}
          >
            <div className="min-w-[900px] grid grid-cols-[1fr_auto_1fr] gap-4 items-start">
              {/* ── LEFT: Winners (L → R) ── */}
              <div className="space-y-4">
                <div className="text-center">
                  <span className="inline-block text-[10px] font-bold uppercase tracking-[0.2em] text-primary/70 border-b border-primary/20 pb-1 px-4">
                    Chave dos Vencedores →
                  </span>
                </div>
                <BracketColumn
                  bracketMatches={winnersA}
                  getName={getName}
                  label="Vencedores A"
                  icon="🏆"
                  colorAccent="border-primary/20 bg-primary/[0.03]"
                  reversed={false}
                  allMatches={matches}
                  matchNumberMap={matchNumberMap}
                />
                <BracketColumn
                  bracketMatches={winnersB}
                  getName={getName}
                  label="Vencedores B"
                  icon="🏆"
                  colorAccent="border-primary/15 bg-primary/[0.02]"
                  reversed={false}
                  allMatches={matches}
                  matchNumberMap={matchNumberMap}
                />
              </div>

              {/* ── CENTER: Semifinals + Final ── */}
              <div className="flex flex-col items-center justify-center min-w-[200px] pt-8">
                <div className="mb-4">
                  <span className="inline-block text-[10px] font-bold uppercase tracking-[0.2em] text-accent/80 border-b border-accent/20 pb-1 px-4">
                    Fase Final
                  </span>
                </div>
                <CenterColumn crossSemis={semiFinals} finalMatches={finalMatches} getName={getName} allMatches={matches} matchNumberMap={matchNumberMap} />
              </div>

              {/* ── RIGHT: Losers (R → L) ── */}
              <div className="space-y-4">
                <div className="text-center">
                  <span className="inline-block text-[10px] font-bold uppercase tracking-[0.2em] text-destructive/60 border-b border-destructive/20 pb-1 px-4">
                    ← Chave dos Perdedores
                  </span>
                </div>
                <BracketColumn
                  bracketMatches={losersA}
                  getName={getName}
                  label="Perdedores Superiores"
                  icon="⬇"
                  colorAccent="border-destructive/15 bg-destructive/[0.03]"
                  reversed={true}
                  allMatches={matches}
                  matchNumberMap={matchNumberMap}
                />
                <BracketColumn
                  bracketMatches={losersB}
                  getName={getName}
                  label="Perdedores Inferiores"
                  icon="⬇"
                  colorAccent="border-destructive/10 bg-destructive/[0.02]"
                  reversed={true}
                  allMatches={matches}
                  matchNumberMap={matchNumberMap}
                />
              </div>
            </div>

            {/* Legend */}
            <div className="mt-4 rounded-lg bg-card/50 border border-border/50 p-3 text-[10px] flex flex-wrap gap-x-6 gap-y-1 justify-center text-muted-foreground/70">
              <span>← <strong className="text-primary/70">Vencedores</strong> crescem para o centro</span>
              <span><strong className="text-destructive/70">Perdedores</strong> crescem para o centro →</span>
              <span>🏆 <strong className="text-accent/70">Semifinais + Final</strong> no centro</span>
              <span>⚠️ Derrota no Perdedores = Eliminação</span>
            </div>
          </div>
        </div>
      )}

      {/* Normal Knockout (non-DE, original mode) */}
      {viewMode === 'bracket' && !isDoubleElimination && hasElimination && (
        <div
          ref={!isDoubleElimination ? zoomContainerRef : undefined}
          className={isMobile ? "overflow-x-auto overflow-y-hidden" : ""}
          style={isMobile ? { touchAction: "pan-x pinch-zoom", WebkitOverflowScrolling: "touch" } : undefined}
        >
          <div style={isMobile ? { transform: `scale(${mobileZoom})`, transformOrigin: 'top left', width: `${100 / mobileZoom}%` } : undefined}>
            <NormalKnockout matches={matches.filter(m => m.round > 0)} getName={getName} matchNumberMap={matchNumberMap} />
          </div>
        </div>
      )}
    </div>
  );
};

export default BracketTreeView;
