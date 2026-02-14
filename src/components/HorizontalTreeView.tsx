import { useMemo, useRef, useEffect, useState, useCallback } from "react";
import { Trophy } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { getSlotFeeders } from "@/lib/feederLabels";
import { getEliminationRoundLabel } from "@/lib/roundLabels";

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
  next_win_match_id?: string | null;
  next_lose_match_id?: string | null;
}

interface HorizontalTreeViewProps {
  matches: Match[];
  getName: (id: string | null) => string;
  matchNumberMap?: Map<string, number>;
}

/* ─── Card height constant for spacing calculations ─── */
const CARD_H = 90; // approx card height in px
const CARD_GAP = 12; // min gap between cards

/* ─── Match Card ─── */
const HTreeMatchCard = ({
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
  const hasBothTeams = match.team1_id && match.team2_id;
  const isWaiting = !hasBothTeams;

  const feeders = allMatches ? getSlotFeeders(match, allMatches, matchNumberMap) : { team1: null, team2: null };

  // DISPLAY SWAP: winner feeder always on top
  const shouldSwap = feeders.team1?.type === 'loser' && feeders.team2?.type === 'winner';

  const topTeamId = shouldSwap ? match.team2_id : match.team1_id;
  const bottomTeamId = shouldSwap ? match.team1_id : match.team2_id;
  const topScore = shouldSwap ? match.score2 : match.score1;
  const bottomScore = shouldSwap ? match.score1 : match.score2;
  const topFeeder = shouldSwap ? feeders.team2 : feeders.team1;
  const bottomFeeder = shouldSwap ? feeders.team1 : feeders.team2;

  const topWin = match.winner_team_id === topTeamId && isCompleted;
  const bottomWin = match.winner_team_id === bottomTeamId && isCompleted;

  const widthClass = {
    small: "w-[150px]",
    normal: "w-[170px]",
    semi: "w-[185px]",
    final: "w-[200px]",
  }[scale];

  const borderClass = (() => {
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
      className={`rounded-lg border bg-card/90 backdrop-blur-sm shrink-0 transition-all text-[11px] ${widthClass} ${borderClass}`}
    >
      {matchNumber != null && (
        <div className="px-2 pt-2 pb-0.5 flex items-center justify-between">
          <span className="inline-flex items-center rounded-sm bg-primary/15 border border-primary/20 px-1.5 py-0.5 text-[10px] font-black text-primary uppercase tracking-tighter leading-none shadow-sm">
            JOGO {matchNumber}
          </span>
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

      <div className="space-y-0.5">
        <div className={`flex items-center justify-between px-2 py-1.5 ${topWin ? "bg-success/10" : ""}`}>
          <span className={`truncate flex-1 ${topWin ? "font-bold text-success" : isWaiting && !topTeamId ? "text-muted-foreground/50 italic" : "team-name"}`}>
            {getName(topTeamId)}
          </span>
          {topScore !== null && isCompleted && (
            <span className={`font-mono ml-1 font-bold ${topWin ? "text-success" : "text-muted-foreground"}`}>
              {topScore}
            </span>
          )}
        </div>
        {topFeeder && (
          <div className="px-2 pb-0.5 text-[7px] text-muted-foreground/60 font-medium">
            ({topFeeder.label})
          </div>
        )}
      </div>

      <div className="border-t border-border/30" />

      <div className="space-y-0.5">
        <div className={`flex items-center justify-between px-2 py-1.5 ${bottomWin ? "bg-success/10" : ""}`}>
          <span className={`truncate flex-1 ${bottomWin ? "font-bold text-success" : isWaiting && !bottomTeamId ? "text-muted-foreground/50 italic" : "team-name"}`}>
            {getName(bottomTeamId)}
          </span>
          {bottomScore !== null && isCompleted && (
            <span className={`font-mono ml-1 font-bold ${bottomWin ? "text-success" : "text-muted-foreground"}`}>
              {bottomScore}
            </span>
          )}
        </div>
        {bottomFeeder && (
          <div className="px-2 pb-0.5 text-[7px] text-muted-foreground/60 font-medium">
            ({bottomFeeder.label})
          </div>
        )}
      </div>

      <div className="flex justify-center border-t border-border/20 px-2 py-1">
        {statusBadge}
      </div>
    </div>
  );

      <div className="flex justify-center border-t border-border/20 px-2 py-1">
        {statusBadge}
      </div>
    </div>
  );
};

/* ─── SVG L-shaped Connectors ─── */
const TreeConnectors = ({
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

    const drawConnection = (srcId: string, dstId: string) => {
      const srcEl = container.querySelector(`[data-match-id="${srcId}"]`);
      const dstEl = container.querySelector(`[data-match-id="${dstId}"]`);
      if (!srcEl || !dstEl) return;

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
      newPaths.push(`M ${x1} ${y1} H ${midX} V ${y2} H ${x2}`);
    };

    for (const m of matches) {
      if (m.next_win_match_id) {
        const next = matches.find(n => n.id === m.next_win_match_id);
        if (next) drawConnection(m.id, next.id);
      }
    }

    setPaths(newPaths);
  }, [containerRef, matches, reversed]);

  useEffect(() => {
    const timer = setTimeout(computePaths, 300);
    window.addEventListener("resize", computePaths);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("resize", computePaths);
    };
  }, [computePaths]);

  if (paths.length === 0) return null;

  return (
    <svg className="absolute inset-0 pointer-events-none" style={{ zIndex: 0, overflow: "visible" }}>
      {paths.map((d, i) => (
        <path
          key={i}
          d={d}
          fill="none"
          stroke="hsl(var(--muted-foreground) / 0.25)"
          strokeWidth="1.5"
        />
      ))}
    </svg>
  );
};

/* ─── Build tree-layout positions with proportional spacing ─── */
function buildTreeLayout(matches: Match[]) {
  // Group by round
  const roundGroups: Record<number, Match[]> = {};
  matches.forEach(m => {
    if (!roundGroups[m.round]) roundGroups[m.round] = [];
    roundGroups[m.round].push(m);
  });
  Object.values(roundGroups).forEach(arr => arr.sort((a, b) => a.position - b.position));

  const rounds = Object.keys(roundGroups).map(Number).sort((a, b) => a - b);
  if (rounds.length === 0) return { rounds: [], roundGroups, positions: new Map<string, number>() };

  // Calculate vertical position for each match
  // First round gets evenly spaced positions
  // Subsequent rounds center between their feeder matches
  const positions = new Map<string, number>();
  const firstRound = rounds[0];
  const firstRoundMatches = roundGroups[firstRound];
  const slotHeight = CARD_H + CARD_GAP;

  // Position first round evenly
  firstRoundMatches.forEach((m, i) => {
    positions.set(m.id, i * slotHeight);
  });

  // For each subsequent round, position each match at the center of its feeders
  for (let ri = 1; ri < rounds.length; ri++) {
    const round = rounds[ri];
    const roundMatches = roundGroups[round];

    for (const match of roundMatches) {
      // Find all matches that feed into this one (via next_win_match_id)
      const feeders = matches.filter(m => m.next_win_match_id === match.id);
      
      if (feeders.length > 0) {
        const feederPositions = feeders
          .map(f => positions.get(f.id))
          .filter((p): p is number => p !== undefined);
        
        if (feederPositions.length > 0) {
          const avg = feederPositions.reduce((a, b) => a + b, 0) / feederPositions.length;
          positions.set(match.id, avg);
          continue;
        }
      }
      
      // Fallback: use position index relative to round
      const idx = roundMatches.indexOf(match);
      const totalHeight = (firstRoundMatches.length - 1) * slotHeight;
      const spacing = roundMatches.length > 1 ? totalHeight / (roundMatches.length - 1) : 0;
      positions.set(match.id, roundMatches.length === 1 ? totalHeight / 2 : idx * spacing);
    }
  }

  return { rounds, roundGroups, positions };
}

/* ─── Render a section (winners/losers/etc) as horizontal tree ─── */
const TreeSection = ({
  label,
  icon,
  sectionMatches,
  allMatches,
  getName,
  matchNumberMap,
  colorClass,
  reversed = false,
}: {
  label: string;
  icon: string;
  sectionMatches: Match[];
  allMatches: Match[];
  getName: (id: string | null) => string;
  matchNumberMap?: Map<string, number>;
  colorClass: string;
  reversed?: boolean;
}) => {
  const sectionRef = useRef<HTMLDivElement>(null);
  if (sectionMatches.length === 0) return null;

  const { rounds, roundGroups, positions } = buildTreeLayout(sectionMatches);
  const maxY = Math.max(0, ...Array.from(positions.values()));
  const totalHeight = maxY + CARD_H + 20;
  const displayRounds = reversed ? [...rounds].reverse() : rounds;
  const totalRounds = rounds.length;

  const matchCountByRound: Record<number, number> = {};
  sectionMatches.forEach(m => { matchCountByRound[m.round] = (matchCountByRound[m.round] || 0) + 1; });

  return (
    <div className={`rounded-xl border ${colorClass} p-3 space-y-2`}>
      <div className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground flex items-center gap-1.5">
        <span>{icon}</span>
        <span>{label}</span>
      </div>
      <div ref={sectionRef} className="relative flex gap-10" style={{ minHeight: totalHeight }}>
        <TreeConnectors containerRef={sectionRef} matches={sectionMatches} reversed={reversed} />
        {displayRounds.map((round, ci) => {
          const roundMatches = roundGroups[round];
          const matchCount = roundMatches.length;
          const origIdx = rounds.indexOf(round);
          const isLast = origIdx === totalRounds - 1;
          const isFinal = matchCount === 1 && isLast;
          const isSemi = matchCount <= 2 && origIdx >= totalRounds - 2 && !isFinal;

          return (
            <div key={round} className="flex flex-col shrink-0 relative" style={{ minWidth: 180 }}>
              <div className={`text-[9px] uppercase font-semibold mb-3 whitespace-nowrap rounded-full px-3 py-0.5 text-center ${
                isFinal || isSemi ? "bg-primary/15 text-primary" : "bg-muted/50 text-muted-foreground"
              }`}>
                Rodada {round}
              </div>
              <div className="relative flex-1">
                {roundMatches.map(match => {
                  const top = positions.get(match.id) ?? 0;
                  const scale = isFinal ? "final" : isSemi ? "semi" : matchCount <= 4 ? "normal" : "small";
                  return (
                    <div key={match.id} className={`absolute ${reversed ? 'right-0' : 'left-0'}`} style={{ top }}>
                      <HTreeMatchCard
                        match={match}
                        getName={getName}
                        scale={scale}
                        allMatches={allMatches}
                        matchNumber={matchNumberMap?.get(match.id)}
                        matchNumberMap={matchNumberMap}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

/* ═══════════════════════════════════════════
   MAIN: Horizontal Tree View
   ═══════════════════════════════════════════ */
const HorizontalTreeView = ({ matches, getName, matchNumberMap }: HorizontalTreeViewProps) => {
  const containerRef = useRef<HTMLDivElement>(null);

  const sections = useMemo(() => {
    const winnersA = matches.filter(m => m.bracket_type === "winners" && m.bracket_half === "upper");
    const winnersB = matches.filter(m => m.bracket_type === "winners" && m.bracket_half === "lower");
    const losersA = matches.filter(m => m.bracket_type === "losers" && m.bracket_half === "upper");
    const losersB = matches.filter(m => m.bracket_type === "losers" && m.bracket_half === "lower");
    const semiFinals = matches.filter(m => m.bracket_type === "semi_final");
    const finalMatches = matches.filter(m => m.bracket_type === "final");
    const isDE = winnersA.length > 0 || winnersB.length > 0 || semiFinals.length > 0;
    return { winnersA, winnersB, losersA, losersB, semiFinals, finalMatches, isDE };
  }, [matches]);

  // For normal knockout: all elimination matches in one tree
  const knockoutMatches = useMemo(() => matches.filter(m => m.round > 0), [matches]);

  const matchCountByRound = useMemo(() => {
    const counts: Record<number, number> = {};
    knockoutMatches.forEach(m => { counts[m.round] = (counts[m.round] || 0) + 1; });
    return counts;
  }, [knockoutMatches]);

  // Normal knockout tree rendering
  const renderNormalKnockout = () => {
    if (knockoutMatches.length === 0) return null;

    const { rounds, roundGroups, positions } = buildTreeLayout(knockoutMatches);
    const maxY = Math.max(0, ...Array.from(positions.values()));
    const totalHeight = maxY + CARD_H + 20;
    const totalRounds = rounds.length;

    return (
      <div className="flex gap-10" style={{ minHeight: totalHeight }}>
        {rounds.map((round, ci) => {
          const roundMatches = roundGroups[round];
          const matchCount = roundMatches.length;
          const isLast = ci === totalRounds - 1;
          const isFinal = matchCount === 1 && isLast;
          const isSemi = matchCount <= 2 && ci >= totalRounds - 2 && !isFinal;
          const roundLabel = getEliminationRoundLabel(round, matchCountByRound[round] || 0);

          return (
            <div key={round} className="flex flex-col shrink-0 relative" style={{ minWidth: 180 }}>
              <div className={`text-[9px] uppercase font-semibold mb-3 whitespace-nowrap rounded-full px-3 py-0.5 text-center ${
                isFinal || isSemi ? "bg-primary/15 text-primary" : "bg-muted/50 text-muted-foreground"
              }`}>
                {roundLabel}
              </div>
              <div className="relative flex-1">
                {roundMatches.map(match => {
                  const top = positions.get(match.id) ?? 0;
                  const scale = isFinal ? "final" : isSemi ? "semi" : "normal";
                  return (
                    <div key={match.id} className="absolute left-0" style={{ top }}>
                      <HTreeMatchCard
                        match={match}
                        getName={getName}
                        scale={scale}
                        allMatches={matches}
                        matchNumber={matchNumberMap?.get(match.id)}
                        matchNumberMap={matchNumberMap}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  const allElimMatches = useMemo(() => matches.filter(m => m.round > 0), [matches]);

  return (
    <div ref={containerRef} className="relative overflow-x-auto pb-4" style={{ WebkitOverflowScrolling: "touch" }}>
      <TreeConnectors containerRef={containerRef} matches={knockoutMatches} />
      <div className="relative space-y-4" style={{ zIndex: 1 }}>
        {sections.isDE ? (
          <>
            {/* Paired layout: Winners side-by-side with Losers */}
            <div className="grid grid-cols-[1fr_1fr] gap-4">
              <TreeSection
                label="Vencedores A" icon="🏆"
                sectionMatches={sections.winnersA}
                allMatches={matches} getName={getName} matchNumberMap={matchNumberMap}
                colorClass="border-primary/20 bg-primary/[0.03]"
              />
              <TreeSection
                label="Perdedores Superiores" icon="⬇"
                sectionMatches={sections.losersA}
                allMatches={matches} getName={getName} matchNumberMap={matchNumberMap}
                colorClass="border-destructive/15 bg-destructive/[0.03]"
                reversed={true}
              />
            </div>
            <div className="grid grid-cols-[1fr_1fr] gap-4">
              <TreeSection
                label="Vencedores B" icon="🏆"
                sectionMatches={sections.winnersB}
                allMatches={matches} getName={getName} matchNumberMap={matchNumberMap}
                colorClass="border-primary/15 bg-primary/[0.02]"
              />
              <TreeSection
                label="Perdedores Inferiores" icon="⬇"
                sectionMatches={sections.losersB}
                allMatches={matches} getName={getName} matchNumberMap={matchNumberMap}
                colorClass="border-destructive/10 bg-destructive/[0.02]"
                reversed={true}
              />
            </div>

            {(sections.semiFinals.length > 0 || sections.finalMatches.length > 0) && (
              <div className="rounded-xl border border-primary/30 bg-primary/[0.04] p-3 space-y-2">
                <div className="text-[10px] font-bold uppercase tracking-[0.15em] text-primary/80 flex items-center gap-1.5">
                  <span>🏆</span>
                  <span>Fase Final</span>
                </div>
                <div className="flex gap-10 items-center">
                  {sections.semiFinals.length > 0 && (
                    <div className="flex flex-col items-center shrink-0" style={{ minWidth: 190 }}>
                      <div className="text-[9px] uppercase font-semibold mb-3 whitespace-nowrap rounded-full px-3 py-0.5 bg-primary/15 text-primary">
                        Semifinais
                      </div>
                      <div className="flex flex-col justify-around gap-4 flex-1">
                        {sections.semiFinals.sort((a, b) => a.position - b.position).map(match => (
                          <HTreeMatchCard
                            key={match.id} match={match} getName={getName} scale="semi"
                            allMatches={matches} matchNumber={matchNumberMap?.get(match.id)} matchNumberMap={matchNumberMap}
                          />
                        ))}
                      </div>
                    </div>
                  )}
                  {sections.finalMatches.length > 0 && (
                    <div className="flex flex-col items-center shrink-0" style={{ minWidth: 200 }}>
                      <div className="text-[9px] uppercase font-semibold mb-3 whitespace-nowrap rounded-full px-3 py-0.5 bg-primary/20 text-primary font-bold">
                        Grande Final
                      </div>
                      <div className="flex flex-col justify-around gap-4 flex-1">
                        {sections.finalMatches.map(match => (
                          <HTreeMatchCard
                            key={match.id} match={match} getName={getName} scale="final"
                            allMatches={matches} matchNumber={matchNumberMap?.get(match.id)} matchNumberMap={matchNumberMap}
                          />
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        ) : (
          renderNormalKnockout()
        )}
      </div>
    </div>
  );
};

export default HorizontalTreeView;
