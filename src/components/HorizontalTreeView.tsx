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

/* ─── Horizontal Match Card ─── */
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
  const t1Win = match.winner_team_id === match.team1_id && isCompleted;
  const t2Win = match.winner_team_id === match.team2_id && isCompleted;
  const hasBothTeams = match.team1_id && match.team2_id;
  const isWaiting = !hasBothTeams;

  const feeders = allMatches ? getSlotFeeders(match, allMatches, matchNumberMap) : { team1: null, team2: null };

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

      {/* Team 1 */}
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
          <div className="px-2 pb-0.5 text-[7px] text-muted-foreground/60 font-medium">
            ({feeders.team1.label})
          </div>
        )}
      </div>

      <div className="border-t border-border/30" />

      {/* Team 2 */}
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
          <div className="px-2 pb-0.5 text-[7px] text-muted-foreground/60 font-medium">
            ({feeders.team2.label})
          </div>
        )}
      </div>

      <div className="flex justify-center border-t border-border/20 px-2 py-1">
        {statusBadge}
      </div>
    </div>
  );
};

/* ─── SVG Connectors ─── */
const TreeConnectors = ({
  containerRef,
  matches,
}: {
  containerRef: React.RefObject<HTMLDivElement>;
  matches: Match[];
}) => {
  const [paths, setPaths] = useState<{ d: string; completed: boolean }[]>([]);

  const computePaths = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;

    const containerRect = container.getBoundingClientRect();
    const newPaths: { d: string; completed: boolean }[] = [];

    for (const m of matches) {
      if (!m.next_win_match_id) continue;
      const nextMatch = matches.find(n => n.id === m.next_win_match_id);
      if (!nextMatch) continue;

      const srcEl = container.querySelector(`[data-match-id="${m.id}"]`);
      const dstEl = container.querySelector(`[data-match-id="${nextMatch.id}"]`);
      if (!srcEl || !dstEl) continue;

      const srcR = srcEl.getBoundingClientRect();
      const dstR = dstEl.getBoundingClientRect();

      const x1 = srcR.right - containerRect.left;
      const y1 = srcR.top + srcR.height / 2 - containerRect.top;
      const x2 = dstR.left - containerRect.left;
      const y2 = dstR.top + dstR.height / 2 - containerRect.top;

      const midX = (x1 + x2) / 2;
      const d = `M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`;
      newPaths.push({ d, completed: m.status === "completed" });
    }

    // Also draw lose connections
    for (const m of matches) {
      if (!m.next_lose_match_id) continue;
      const nextMatch = matches.find(n => n.id === m.next_lose_match_id);
      if (!nextMatch) continue;

      const srcEl = container.querySelector(`[data-match-id="${m.id}"]`);
      const dstEl = container.querySelector(`[data-match-id="${nextMatch.id}"]`);
      if (!srcEl || !dstEl) continue;

      const srcR = srcEl.getBoundingClientRect();
      const dstR = dstEl.getBoundingClientRect();

      const x1 = srcR.right - containerRect.left;
      const y1 = srcR.top + srcR.height / 2 - containerRect.top;
      const x2 = dstR.left - containerRect.left;
      const y2 = dstR.top + dstR.height / 2 - containerRect.top;

      const midX = (x1 + x2) / 2;
      const d = `M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`;
      newPaths.push({ d, completed: false });
    }

    setPaths(newPaths);
  }, [containerRef, matches]);

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
    <svg className="absolute inset-0 pointer-events-none" style={{ zIndex: 0 }}>
      {paths.map((p, i) => (
        <path
          key={i}
          d={p.d}
          fill="none"
          stroke={p.completed ? "hsl(var(--success) / 0.4)" : "hsl(var(--primary) / 0.3)"}
          strokeWidth="1.5"
          strokeDasharray={p.completed ? "none" : "4 3"}
        />
      ))}
    </svg>
  );
};

/* ─── Round Column Header Colors ─── */
function getRoundHeaderStyle(bracketType: string | undefined, isLast: boolean, isSemiOrFinal: boolean): string {
  if (isSemiOrFinal) return "bg-primary/15 text-primary";
  if (bracketType === "losers") return "bg-destructive/10 text-destructive/80";
  return "bg-muted/50 text-muted-foreground";
}

/* ═══════════════════════════════════════════
   MAIN COMPONENT: Horizontal Tree View
   ═══════════════════════════════════════════ */
const HorizontalTreeView = ({ matches, getName, matchNumberMap }: HorizontalTreeViewProps) => {
  const containerRef = useRef<HTMLDivElement>(null);

  // Separate matches by bracket section
  const sections = useMemo(() => {
    const winnersA = matches.filter(m => m.bracket_type === "winners" && m.bracket_half === "upper");
    const winnersB = matches.filter(m => m.bracket_type === "winners" && m.bracket_half === "lower");
    const losersA = matches.filter(m => m.bracket_type === "losers" && m.bracket_half === "upper");
    const losersB = matches.filter(m => m.bracket_type === "losers" && m.bracket_half === "lower");
    const semiFinals = matches.filter(m => m.bracket_type === "semi_final");
    const finalMatches = matches.filter(m => m.bracket_type === "final");
    // Normal knockout (no bracket_half)
    const normalKnockout = matches.filter(m => m.round > 0 && !m.bracket_half && m.bracket_type !== "semi_final" && m.bracket_type !== "final");

    const isDE = winnersA.length > 0 || winnersB.length > 0 || semiFinals.length > 0;

    return { winnersA, winnersB, losersA, losersB, semiFinals, finalMatches, normalKnockout, isDE };
  }, [matches]);

  // Build round columns for a set of matches
  const buildRoundColumns = (sectionMatches: Match[]) => {
    const roundGroups: Record<number, Match[]> = {};
    sectionMatches.forEach(m => {
      if (!roundGroups[m.round]) roundGroups[m.round] = [];
      roundGroups[m.round].push(m);
    });
    const rounds = Object.keys(roundGroups).map(Number).sort((a, b) => a - b);
    return rounds.map(r => ({
      round: r,
      matches: roundGroups[r].sort((a, b) => a.position - b.position),
    }));
  };

  const matchCountByRound = useMemo(() => {
    const counts: Record<number, number> = {};
    matches.forEach(m => { counts[m.round] = (counts[m.round] || 0) + 1; });
    return counts;
  }, [matches]);

  const getScale = (round: number, totalRounds: number, roundIdx: number, matchCount: number): "small" | "normal" | "semi" | "final" => {
    if (matchCount === 1 && roundIdx === totalRounds - 1) return "final";
    if (matchCount <= 2 && roundIdx >= totalRounds - 2) return "semi";
    if (matchCount <= 4) return "normal";
    return "small";
  };

  // Render a bracket section as horizontal columns
  const renderSection = (label: string, icon: string, sectionMatches: Match[], colorClass: string) => {
    if (sectionMatches.length === 0) return null;
    const columns = buildRoundColumns(sectionMatches);

    return (
      <div className={`rounded-xl border ${colorClass} p-3 space-y-2`}>
        <div className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground flex items-center gap-1.5">
          <span>{icon}</span>
          <span>{label}</span>
        </div>
        <div className="flex gap-8">
          {columns.map((col, ci) => (
            <div key={col.round} className="flex flex-col items-center shrink-0" style={{ minWidth: 170 }}>
              <div className={`text-[9px] uppercase font-semibold mb-2 whitespace-nowrap rounded-full px-3 py-0.5 ${getRoundHeaderStyle(sectionMatches[0]?.bracket_type, ci === columns.length - 1, false)}`}>
                Rodada {col.round}
              </div>
              <div className="flex flex-col justify-around gap-4 flex-1">
                {col.matches.map(match => (
                  <HTreeMatchCard
                    key={match.id}
                    match={match}
                    getName={getName}
                    scale={getScale(col.round, columns.length, ci, col.matches.length)}
                    allMatches={matches}
                    matchNumber={matchNumberMap?.get(match.id)}
                    matchNumberMap={matchNumberMap}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  // For normal knockout (non-DE), render all in one horizontal flow
  const renderNormalKnockout = () => {
    const knockoutMatches = matches.filter(m => m.round > 0);
    if (knockoutMatches.length === 0) return null;
    const columns = buildRoundColumns(knockoutMatches);

    return (
      <div className="flex gap-8">
        {columns.map((col, ci) => {
          const isLast = ci === columns.length - 1;
          const isSemi = col.matches.length === 2 && ci >= columns.length - 2;
          const isFinal = col.matches.length === 1 && isLast;
          const roundLabel = getEliminationRoundLabel(col.round, matchCountByRound[col.round] || 0);

          return (
            <div key={col.round} className="flex flex-col items-center shrink-0" style={{ minWidth: 180 }}>
              <div className={`text-[9px] uppercase font-semibold mb-3 whitespace-nowrap rounded-full px-3 py-0.5 ${isFinal || isSemi ? "bg-primary/15 text-primary" : "bg-muted/50 text-muted-foreground"}`}>
                {roundLabel}
              </div>
              <div className="flex flex-col justify-around gap-4 flex-1">
                {col.matches.map(match => (
                  <HTreeMatchCard
                    key={match.id}
                    match={match}
                    getName={getName}
                    scale={isFinal ? "final" : isSemi ? "semi" : "normal"}
                    allMatches={matches}
                    matchNumber={matchNumberMap?.get(match.id)}
                    matchNumberMap={matchNumberMap}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  const allElimMatches = matches.filter(m => m.round > 0);

  return (
    <div ref={containerRef} className="relative overflow-x-auto pb-4" style={{ WebkitOverflowScrolling: "touch" }}>
      <TreeConnectors containerRef={containerRef} matches={allElimMatches} />
      <div className="relative space-y-4" style={{ zIndex: 1 }}>
        {sections.isDE ? (
          <>
            {renderSection("Vencedores A", "🏆", sections.winnersA, "border-primary/20 bg-primary/[0.03]")}
            {renderSection("Vencedores B", "🏆", sections.winnersB, "border-primary/15 bg-primary/[0.02]")}
            {renderSection("Perdedores Superiores", "⬇", sections.losersA, "border-destructive/15 bg-destructive/[0.03]")}
            {renderSection("Perdedores Inferiores", "⬇", sections.losersB, "border-destructive/10 bg-destructive/[0.02]")}

            {/* Semis + Final as horizontal columns */}
            {(sections.semiFinals.length > 0 || sections.finalMatches.length > 0) && (
              <div className="rounded-xl border border-primary/30 bg-primary/[0.04] p-3 space-y-2">
                <div className="text-[10px] font-bold uppercase tracking-[0.15em] text-primary/80 flex items-center gap-1.5">
                  <span>🏆</span>
                  <span>Fase Final</span>
                </div>
                <div className="flex gap-8 items-center">
                  {sections.semiFinals.length > 0 && (
                    <div className="flex flex-col items-center shrink-0" style={{ minWidth: 190 }}>
                      <div className="text-[9px] uppercase font-semibold mb-3 whitespace-nowrap rounded-full px-3 py-0.5 bg-primary/15 text-primary">
                        Semifinais
                      </div>
                      <div className="flex flex-col justify-around gap-4 flex-1">
                        {sections.semiFinals.sort((a, b) => a.position - b.position).map(match => (
                          <HTreeMatchCard
                            key={match.id}
                            match={match}
                            getName={getName}
                            scale="semi"
                            allMatches={matches}
                            matchNumber={matchNumberMap?.get(match.id)}
                            matchNumberMap={matchNumberMap}
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
                            key={match.id}
                            match={match}
                            getName={getName}
                            scale="final"
                            allMatches={matches}
                            matchNumber={matchNumberMap?.get(match.id)}
                            matchNumberMap={matchNumberMap}
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
