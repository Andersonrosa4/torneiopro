import { useMemo, useRef, useEffect, useState } from "react";
import { Trophy } from "lucide-react";

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
}

interface BracketTreeViewProps {
  matches: Match[];
  participants: Participant[];
  isOwner: boolean;
  onDeclareWinner: (matchId: string, winnerId: string) => void;
  onUpdateScore: (matchId: string, score1: number, score2: number) => void;
  structuralOnly?: boolean;
  tournamentFormat?: string; // 'single_elimination' | 'double_elimination' | 'group_stage'
}

/* ── Compact Match Card ── */
const MatchCard = ({
  match,
  getName,
  isFinal,
}: {
  match: Match;
  getName: (id: string | null) => string;
  isFinal?: boolean;
}) => {
  const t1Win = match.winner_team_id === match.team1_id && match.status === "completed";
  const t2Win = match.winner_team_id === match.team2_id && match.status === "completed";

  return (
    <div
      data-match-id={match.id}
      className={`rounded-lg border text-[11px] leading-tight w-[160px] shrink-0 ${
        isFinal
          ? "border-primary/50 shadow-glow"
          : match.status === "completed"
            ? "border-success/40 bg-success/5"
            : match.team1_id && match.team2_id
              ? "border-primary/30 bg-primary/5"
              : "border-border bg-card"
      }`}
    >
      {isFinal && (
        <div className="flex items-center justify-center gap-1 rounded-t-lg bg-gradient-primary px-2 py-0.5 text-[9px] font-bold text-primary-foreground">
          <Trophy className="h-2.5 w-2.5" /> FINAL
        </div>
      )}
      <div className={`flex items-center justify-between px-2 py-1.5 ${t1Win ? "bg-success/10" : ""}`}>
        <span className={`truncate max-w-[110px] ${t1Win ? "font-bold text-success" : "text-foreground"}`}>
          {getName(match.team1_id)}
        </span>
        {match.score1 !== null && (
          <span className={`font-mono ml-1 font-bold ${t1Win ? "text-success" : "text-muted-foreground"}`}>
            {match.score1}
          </span>
        )}
      </div>
      <div className="border-t border-border/50" />
      <div className={`flex items-center justify-between px-2 py-1.5 ${t2Win ? "bg-success/10" : ""}`}>
        <span className={`truncate max-w-[110px] ${t2Win ? "font-bold text-success" : "text-foreground"}`}>
          {getName(match.team2_id)}
        </span>
        {match.score2 !== null && (
          <span className={`font-mono ml-1 font-bold ${t2Win ? "text-success" : "text-muted-foreground"}`}>
            {match.score2}
          </span>
        )}
      </div>
    </div>
  );
};

/* ── SVG Connector Lines ── */
const ConnectorLines = ({
  containerRef,
  matches,
  roundNumbers,
}: {
  containerRef: React.RefObject<HTMLDivElement>;
  matches: Match[];
  roundNumbers: number[];
}) => {
  const [lines, setLines] = useState<Array<{ x1: number; y1: number; x2: number; y2: number }>>([]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const timer = setTimeout(() => {
      const containerRect = container.getBoundingClientRect();
      const newLines: typeof lines = [];

      for (let i = 0; i < roundNumbers.length - 1; i++) {
        const currentRound = roundNumbers[i];
        const nextRound = roundNumbers[i + 1];

        const currentMatches = matches
          .filter((m) => m.round === currentRound)
          .sort((a, b) => a.position - b.position);

        for (let j = 0; j < currentMatches.length; j += 2) {
          const m1 = currentMatches[j];
          const m2 = currentMatches[j + 1];

          const nextPos = Math.ceil((j / 2) + 1);
          const nextMatch = matches.find(
            (m) => m.round === nextRound && m.position === nextPos
          );

          if (!nextMatch) continue;

          const el1 = container.querySelector(`[data-match-id="${m1.id}"]`);
          const el2 = m2 ? container.querySelector(`[data-match-id="${m2.id}"]`) : null;
          const elNext = container.querySelector(`[data-match-id="${nextMatch.id}"]`);

          if (!el1 || !elNext) continue;

          const r1 = el1.getBoundingClientRect();
          const rNext = elNext.getBoundingClientRect();

          const x1 = r1.right - containerRect.left;
          const y1 = r1.top + r1.height / 2 - containerRect.top;
          const x2 = rNext.left - containerRect.left;
          const yNext = rNext.top + rNext.height / 2 - containerRect.top;

          newLines.push({ x1, y1, x2, y2: yNext });

          if (el2) {
            const r2 = el2.getBoundingClientRect();
            const y2 = r2.top + r2.height / 2 - containerRect.top;
            newLines.push({ x1: r2.right - containerRect.left, y1: y2, x2, y2: yNext });
          }
        }
      }

      setLines(newLines);
    }, 200);

    return () => clearTimeout(timer);
  }, [containerRef, matches, roundNumbers]);

  if (lines.length === 0) return null;

  return (
    <svg className="absolute inset-0 pointer-events-none" style={{ zIndex: 0 }}>
      {lines.map((l, i) => {
        const midX = (l.x1 + l.x2) / 2;
        return (
          <path
            key={i}
            d={`M ${l.x1} ${l.y1} C ${midX} ${l.y1}, ${midX} ${l.y2}, ${l.x2} ${l.y2}`}
            fill="none"
            stroke="hsl(var(--border))"
            strokeWidth="1.5"
            opacity="0.6"
          />
        );
      })}
    </svg>
  );
};

/* ── Horizontal Bracket Section ── */
const HorizontalBracket = ({
  bracketMatches,
  getName,
  label,
  colorClass,
  maxRoundGlobal,
}: {
  bracketMatches: Match[];
  getName: (id: string | null) => string;
  label: string;
  colorClass: string;
  maxRoundGlobal: number;
}) => {
  const containerRef = useRef<HTMLDivElement>(null);

  const roundGroups: Record<number, Match[]> = {};
  bracketMatches.forEach((m) => {
    if (!roundGroups[m.round]) roundGroups[m.round] = [];
    roundGroups[m.round].push(m);
  });
  const rounds = Object.keys(roundGroups).map(Number).sort((a, b) => a - b);

  if (bracketMatches.length === 0) return null;

  return (
    <div className={`rounded-lg border border-border ${colorClass} p-3`}>
      <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-3">
        {label}
      </div>
      <div ref={containerRef} className="relative overflow-x-auto">
        <ConnectorLines containerRef={containerRef} matches={bracketMatches} roundNumbers={rounds} />
        <div className="flex gap-8 relative" style={{ zIndex: 1 }}>
          {rounds.map((round) => (
            <div key={round} className="flex flex-col items-center shrink-0" style={{ minWidth: 170 }}>
              <div className="text-[9px] uppercase font-semibold text-muted-foreground/70 mb-2 whitespace-nowrap">
                R{round}
              </div>
              <div className="flex flex-col justify-around gap-3 flex-1">
                {roundGroups[round]
                  .sort((a, b) => a.position - b.position)
                  .map((match) => (
                    <MatchCard key={match.id} match={match} getName={getName} />
                  ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

/* ── Main Component ── */
const BracketTreeView = ({ matches, participants }: BracketTreeViewProps) => {
  const containerRef = useRef<HTMLDivElement>(null);

  const getName = (id: string | null) => {
    if (!id) return "A definir";
    return participants.find((p) => p.id === id)?.name || "A definir";
  };

  const groupMatches = useMemo(() => matches.filter((m) => m.round === 0), [matches]);
  const hasGroupStage = groupMatches.length > 0;
  const hasElimination = useMemo(() => matches.some((m) => m.round > 0), [matches]);

  const groupNumbers = Array.from(new Set(groupMatches.map((m) => m.bracket_number || 1))).sort();

  const getGroupStandings = (groupNum: number) => {
    const gMatches = groupMatches.filter((m) => (m.bracket_number || 1) === groupNum);
    const teamIds = new Set<string>();
    gMatches.forEach((m) => {
      if (m.team1_id) teamIds.add(m.team1_id);
      if (m.team2_id) teamIds.add(m.team2_id);
    });
    const standings = Array.from(teamIds).map((tid) => {
      const wins = gMatches.filter((m) => m.winner_team_id === tid).length;
      const played = gMatches.filter(
        (m) => (m.team1_id === tid || m.team2_id === tid) && m.status === "completed"
      ).length;
      return { id: tid, name: getName(tid), wins, played };
    });
    return standings.sort((a, b) => b.wins - a.wins);
  };

  /* ── Build full horizontal tree ── */
  const renderHorizontalTree = () => {
    const winnersA = matches.filter((m) => m.bracket_type === "winners" && m.bracket_half === "upper");
    const winnersB = matches.filter((m) => m.bracket_type === "winners" && m.bracket_half === "lower");
    const losersA = matches.filter((m) => m.bracket_type === "losers" && m.bracket_half === "lower");
    const losersB = matches.filter((m) => m.bracket_type === "losers" && m.bracket_half === "upper");
    const crossSemis = matches.filter((m) => m.bracket_type === "cross_semi");
    const finalMatches = matches.filter((m) => m.bracket_type === "final");

    const hasAnyBracket = winnersA.length > 0 || winnersB.length > 0;

    // Fallback: normal knockout (no bracket_type) — render as single horizontal tree
    if (!hasAnyBracket && crossSemis.length === 0 && finalMatches.length === 0) {
      const knockoutMatches = matches.filter((m) => m.round > 0);
      const maxRound = Math.max(...knockoutMatches.map((m) => m.round), 0);
      return (
        <HorizontalBracket
          bracketMatches={knockoutMatches}
          getName={getName}
          label="Eliminatória"
          colorClass="bg-card/50"
          maxRoundGlobal={maxRound}
        />
      );
    }

    const allBracketMatches = [...winnersA, ...winnersB, ...losersA, ...losersB];
    const maxRound = Math.max(
      ...allBracketMatches.map((m) => m.round),
      ...crossSemis.map((m) => m.round),
      ...finalMatches.map((m) => m.round),
      0
    );

    // Combine cross-semis and final into a unified horizontal flow
    const centralMatches = [...crossSemis, ...finalMatches];

    return (
      <div className="space-y-6">
        {/* Winners A */}
        <HorizontalBracket
          bracketMatches={winnersA}
          getName={getName}
          label="🏆 Vencedores — Lado A"
          colorClass="bg-blue-950/20"
          maxRoundGlobal={maxRound}
        />

        {/* Winners B */}
        <HorizontalBracket
          bracketMatches={winnersB}
          getName={getName}
          label="🏆 Vencedores — Lado B"
          colorClass="bg-cyan-950/20"
          maxRoundGlobal={maxRound}
        />

        {/* Losers A */}
        {losersA.length > 0 && (
          <HorizontalBracket
            bracketMatches={losersA}
            getName={getName}
            label="⬇ Perdedores — Lado A"
            colorClass="bg-orange-950/20"
            maxRoundGlobal={maxRound}
          />
        )}

        {/* Losers B */}
        {losersB.length > 0 && (
          <HorizontalBracket
            bracketMatches={losersB}
            getName={getName}
            label="⬇ Perdedores — Lado B"
            colorClass="bg-red-950/20"
            maxRoundGlobal={maxRound}
          />
        )}

        {/* Cross-Semis + Final as horizontal flow */}
        {centralMatches.length > 0 && (
          <HorizontalBracket
            bracketMatches={centralMatches}
            getName={getName}
            label="🏆 Semifinais Cruzadas → Final"
            colorClass="bg-primary/5"
            maxRoundGlobal={maxRound}
          />
        )}

        {/* Legend */}
        <div className="rounded-lg bg-muted/30 border border-border p-3 text-[10px] space-y-1">
          <div className="font-semibold text-muted-foreground mb-1">📍 Regras de Cruzamento:</div>
          <div className="text-muted-foreground">→ Perdedor Vencedores A → Perdedores A (lado oposto invertido)</div>
          <div className="text-muted-foreground">← Perdedor Vencedores B → Perdedores B (lado oposto invertido)</div>
          <div className="text-muted-foreground mt-1">🏆 Semifinais: Campeão Perdedores × Campeão Vencedores do lado oposto</div>
          <div className="text-muted-foreground">⚠️ Derrota na Chave dos Perdedores = Eliminação definitiva</div>
        </div>
      </div>
    );
  };

  if (!hasGroupStage && !hasElimination) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-card/50 p-12 text-center">
        <p className="text-muted-foreground">Nenhuma estrutura de chaveamento gerada.</p>
      </div>
    );
  }

  return (
    <div className="w-full space-y-6">
      {/* Group Stage */}
      {hasGroupStage && groupNumbers.length > 0 && (
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
                      <div
                        key={s.id}
                        className="flex items-center justify-between rounded-md bg-secondary/50 px-3 py-1.5 text-xs"
                      >
                        <span className="flex items-center gap-2">
                          <span className="font-bold text-muted-foreground">{i + 1}.</span>
                          <span className="font-medium text-foreground">{s.name}</span>
                        </span>
                        <span className="font-bold text-primary">
                          {s.wins}V / {s.played}J
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Elimination — Horizontal Tree */}
      {hasElimination && renderHorizontalTree()}
    </div>
  );
};

export default BracketTreeView;
