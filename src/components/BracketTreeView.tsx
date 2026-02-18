import { useMemo, useRef, useEffect, useState, useCallback } from "react";
import { Trophy, ChevronRight, ChevronLeft } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getSlotFeeders } from "@/lib/feederLabels";
import { schedulerSequence } from "@/lib/roundScheduler";
import { useIsMobile } from "@/hooks/use-mobile";
import { getEliminationRoundLabel } from "@/lib/roundLabels";


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
   Helper: Convert number to letter (1→A, 2→B, etc)
   ──────────────────────────────────────────────────── */
const numberToLetter = (num: number): string => {
  return String.fromCharCode(64 + num);
};

/* ════════════════════════════════════════════════════
   SISTEMA DE CONECTORES SVG UNIFICADO
   Baseado 100% em coordenadas reais de tela via getBoundingClientRect()
   ════════════════════════════════════════════════════ */

/**
 * Calcula o mapa de slots: para cada match, determina se o vencedor
 * vai para o slot "A" (top, 25%) ou "B" (bottom, 75%) do próximo match.
 * Determinado pela ordem de posição dos feeders.
 */
function buildSlotMap(matches: Match[]): Map<string, "A" | "B"> {
  const map = new Map<string, "A" | "B">();
  const destGroups = new Map<string, Match[]>();

  for (const m of matches) {
    if (!m.next_win_match_id) continue;
    if (!destGroups.has(m.next_win_match_id)) destGroups.set(m.next_win_match_id, []);
    destGroups.get(m.next_win_match_id)!.push(m);
  }

  for (const [, feeders] of destGroups) {
    // Ordena por posição para determinar qual vai para slot A (top) e B (bottom)
    feeders.sort((a, b) => a.position - b.position);
    feeders.forEach((f, i) => map.set(f.id, i === 0 ? "A" : "B"));
  }

  return map;
}

/**
 * Componente SVG unificado de conectores.
 * Usa getBoundingClientRect() real para calcular coordenadas.
 * Redesenha ao redimensionar, ao zoom mudar, e quando matches mudam.
 */
const SVGConnectors = ({
  containerRef,
  matches,
  slotMap,
}: {
  containerRef: React.RefObject<HTMLDivElement>;
  matches: Match[];
  slotMap: Map<string, "A" | "B">;
}) => {
  const [lines, setLines] = useState<{ x1: number; y1: number; x2: number; y2: number }[]>([]);
  const [svgDims, setSvgDims] = useState({ w: 0, h: 0 });

  const compute = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;

    const cr = container.getBoundingClientRect();
    const scrollLeft = container.scrollLeft;
    const scrollTop = container.scrollTop;

    const newLines: { x1: number; y1: number; x2: number; y2: number }[] = [];

    for (const m of matches) {
      if (!m.next_win_match_id) continue;

      // Busca os elementos pelo id real do match
      const srcEl = document.getElementById(m.id);
      const dstEl = document.getElementById(m.next_win_match_id);
      if (!srcEl || !dstEl) continue;

      const srcRect = srcEl.getBoundingClientRect();
      const dstRect = dstEl.getBoundingClientRect();

      // Ponto de saída: centro vertical da borda direita do match de origem
      const x1 = srcRect.right - cr.left + scrollLeft;
      const y1 = srcRect.top - cr.top + scrollTop + srcRect.height / 2;

      // Ponto de entrada: borda esquerda do match de destino, no slot correto
      const slot = slotMap.get(m.id) ?? "A";
      const x2 = dstRect.left - cr.left + scrollLeft;
      const y2 = dstRect.top - cr.top + scrollTop + (slot === "A" ? dstRect.height * 0.25 : dstRect.height * 0.75);

      newLines.push({ x1, y1, x2, y2 });
    }

    setLines(newLines);
    setSvgDims({ w: container.scrollWidth, h: container.scrollHeight });
  }, [containerRef, matches, slotMap]);

  useEffect(() => {
    // Aguarda render antes de calcular
    const t1 = setTimeout(compute, 80);
    const t2 = setTimeout(compute, 300);
    window.addEventListener("resize", compute);
    // Observa mudanças de tamanho no container
    const ro = new ResizeObserver(compute);
    if (containerRef.current) ro.observe(containerRef.current);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      window.removeEventListener("resize", compute);
      ro.disconnect();
    };
  }, [compute]);

  if (lines.length === 0) return null;

  return (
    <svg
      className="absolute top-0 left-0 pointer-events-none"
      style={{ zIndex: 0, overflow: "visible", width: svgDims.w, height: svgDims.h }}
    >
      {lines.map((l, i) => (
        <line
          key={i}
          x1={l.x1}
          y1={l.y1}
          x2={l.x2}
          y2={l.y2}
          stroke="hsl(var(--muted-foreground) / 0.35)"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      ))}
    </svg>
  );
};

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
  const hasBothTeams = match.team1_id && match.team2_id;
  const isWaiting = !hasBothTeams;

  const feeders = allMatches ? getSlotFeeders(match, allMatches, matchNumberMap) : { team1: null, team2: null };

  const shouldSwap = (() => {
    if (feeders.team1 && feeders.team2) {
      return feeders.team1.type === 'loser' && feeders.team2.type === 'winner';
    }
    if (feeders.team1?.type === 'winner' && !feeders.team2) return false;
    if (!feeders.team1 && feeders.team2?.type === 'winner') return true;
    return false;
  })();

  const topTeamId = shouldSwap ? match.team2_id : match.team1_id;
  const bottomTeamId = shouldSwap ? match.team1_id : match.team2_id;
  const topScore = shouldSwap ? match.score2 : match.score1;
  const bottomScore = shouldSwap ? match.score1 : match.score2;
  const topFeeder = shouldSwap ? feeders.team2 : feeders.team1;
  const bottomFeeder = shouldSwap ? feeders.team1 : feeders.team2;

  const topWin = match.winner_team_id === topTeamId && isCompleted;
  const bottomWin = match.winner_team_id === bottomTeamId && isCompleted;

  const sizeClasses = {
    small: "w-[130px] text-[9px]",
    normal: "w-[130px] text-[9px]",
    semi: "w-[130px] text-[9px]",
    final: "w-[140px] text-[10px]",
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
      id={match.id}
      data-match-id={match.id}
      className={`rounded-lg border bg-card/90 backdrop-blur-sm shrink-0 transition-all ${sizeClasses[scale]} ${borderClasses}`}
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
          <div className="px-2 pb-1 text-[7px] text-muted-foreground/60 font-medium">
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
          <div className="px-2 pb-1 text-[7px] text-muted-foreground/60 font-medium">
            ({bottomFeeder.label})
          </div>
        )}
      </div>

      <div className="flex justify-center border-t border-border/20 px-2 py-1">
        {statusBadge}
      </div>
    </div>
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
      <div className="relative overflow-x-auto pb-2">
        <div className="flex gap-6 relative" style={{ zIndex: 1 }}>
          {displayRounds.map((round) => {
            // Ordena pelo número global do jogo (sequência do scheduler) para exibição correta top→bottom
            const roundMatches = roundGroups[round].sort((a, b) => {
              const aNum = matchNumberMap?.get(a.id) ?? a.position;
              const bNum = matchNumberMap?.get(b.id) ?? b.position;
              return aNum - bNum;
            });
            return (
              <div key={round} className="flex flex-col items-center shrink-0" style={{ minWidth: 150 }}>
                <div className="text-[9px] uppercase font-semibold text-muted-foreground/60 mb-2 whitespace-nowrap">
                  Rodada {round}
                </div>
                <div className="flex flex-col justify-around gap-3 flex-1">
                  {roundMatches.map((match) => (
                    <MatchCard
                      key={match.id}
                      match={match}
                      getName={getName}
                      scale={getScale(round)}
                      allMatches={allMatches}
                      matchNumber={matchNumberMap?.get(match.id)}
                      matchNumberMap={matchNumberMap}
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

      {crossSemis.length > 0 && finalMatches.length > 0 && (
        <div className="w-px h-6 bg-gradient-to-b from-primary/30 to-primary/10" />
      )}

      {finalMatches.map((m) => (
        <MatchCard key={m.id} match={m} getName={getName} scale="final" allMatches={allMatches} matchNumber={matchNumberMap?.get(m.id)} matchNumberMap={matchNumberMap} />
      ))}
    </div>
  );
};

/* ────────────────────────────────────────────────────
   Group Stage View
   ──────────────────────────────────────────────────── */
const GROUP_CARD_H = 76;
const GROUP_CARD_GAP = 8;

const PlaceholderMatchCard = ({
  id,
  label1,
  label2,
  scale = "normal",
}: {
  id: string;
  label1: string;
  label2: string;
  scale?: "normal" | "semi" | "final";
  roundLabel?: string;
}) => {
  const sizeClasses = {
    normal: "w-[130px] text-[9px]",
    semi: "w-[130px] text-[9px]",
    final: "w-[140px] text-[10px]",
  };
  const borderClasses = {
    normal: "border-border/60",
    semi: "border-primary/40 shadow-[0_0_10px_hsl(var(--primary)/0.15)]",
    final: "border-primary/60 shadow-[0_0_16px_hsl(var(--primary)/0.3)] ring-1 ring-primary/20",
  };

  return (
    <div
      id={id}
      data-match-id={id}
      className={`rounded-lg border bg-card/60 backdrop-blur-sm shrink-0 ${sizeClasses[scale]} ${borderClasses[scale]}`}
    >
      {scale === "final" && (
        <div className="flex items-center justify-center gap-1 rounded-t-lg bg-gradient-primary px-2 py-0.5 text-[9px] font-bold text-primary-foreground tracking-wider">
          <Trophy className="h-2.5 w-2.5" /> FINAL
        </div>
      )}
      {scale === "semi" && (
        <div className="flex items-center justify-center gap-1 rounded-t-lg bg-primary/15 px-2 py-0.5 text-[9px] font-semibold text-primary tracking-wider">
          SEMIFINAL
        </div>
      )}
      <div className="flex items-center justify-between px-2 py-1.5">
        <span className="truncate flex-1 text-muted-foreground/60 italic">{label1}</span>
      </div>
      <div className="border-t border-border/30" />
      <div className="flex items-center justify-between px-2 py-1.5">
        <span className="truncate flex-1 text-muted-foreground/60 italic">{label2}</span>
      </div>
      <div className="flex justify-center border-t border-border/20 px-2 py-1">
        <Badge variant="outline" className="text-muted-foreground text-[8px] px-1.5 py-0 leading-tight border-border/40">Aguardando</Badge>
      </div>
    </div>
  );
};

function buildGroupKnockoutPreview(groupNumbers: number[]) {
  const numGroups = groupNumbers.length;
  const advancingPerGroup = 2;
  const totalAdvancing = numGroups * advancingPerGroup;

  const rounds: { label: string; matchCount: number; scale: "normal" | "semi" | "final" }[] = [];
  let remaining = totalAdvancing;

  while (remaining > 1) {
    const matchCount = Math.floor(remaining / 2);
    remaining = matchCount;
    if (remaining === 1) {
      rounds.push({ label: "Final", matchCount, scale: "final" });
    } else if (matchCount <= 2) {
      rounds.push({ label: matchCount === 2 ? "Semifinais" : "Rodada", matchCount, scale: "semi" });
    } else {
      const labels: Record<number, string> = { 4: "Quartas de Final", 8: "Oitavas", 2: "Semifinais" };
      rounds.push({ label: labels[matchCount] || `Rodada (${matchCount} jogos)`, matchCount, scale: "normal" });
    }
  }

  type PlaceholderMatch = { id: string; label1: string; label2: string; scale: "normal" | "semi" | "final" };
  const knockoutRounds: PlaceholderMatch[][] = [];
  const connections: { srcId: string; dstId: string }[] = [];

  if (rounds.length > 0) {
    const firstRound: PlaceholderMatch[] = [];
    const firstRoundCount = rounds[0].matchCount;
    const pairings: { g1: number; seed1: number; g2: number; seed2: number }[] = [];

    for (let i = 0; i < numGroups; i++) {
      const rightIdx = numGroups - 1 - i;
      if (rightIdx < i) break;
      pairings.push({ g1: groupNumbers[i], seed1: 1, g2: groupNumbers[rightIdx], seed2: 2 });
      pairings.push({ g1: groupNumbers[i], seed1: 2, g2: groupNumbers[rightIdx], seed2: 1 });
    }

    if (numGroups % 2 === 1) {
      const midIdx = Math.floor(numGroups / 2);
      pairings.push({ g1: groupNumbers[midIdx], seed1: 1, g2: groupNumbers[midIdx], seed2: 2 });
    }

    for (let i = 0; i < firstRoundCount; i++) {
      if (i < pairings.length) {
        const p = pairings[i];
        firstRound.push({
          id: `knockout-0-${i}`,
          label1: `${p.seed1}º Grupo ${numberToLetter(p.g1)}`,
          label2: `${p.seed2}º Grupo ${numberToLetter(p.g2)}`,
          scale: rounds[0].scale,
        });
      } else {
        firstRound.push({ id: `knockout-0-${i}`, label1: "A definir", label2: "A definir", scale: rounds[0].scale });
      }
    }
    knockoutRounds.push(firstRound);

    for (let ri = 1; ri < rounds.length; ri++) {
      const prevRound = knockoutRounds[ri - 1];
      const currentRound: PlaceholderMatch[] = [];
      const count = rounds[ri].matchCount;

      for (let i = 0; i < count; i++) {
        const id = `knockout-${ri}-${i}`;
        const src1Idx = i * 2;
        const src2Idx = i * 2 + 1;
        const label1 = src1Idx < prevRound.length ? `V Jogo ${src1Idx + 1}` : "A definir";
        const label2 = src2Idx < prevRound.length ? `V Jogo ${src2Idx + 1}` : "A definir";
        currentRound.push({ id, label1, label2, scale: rounds[ri].scale });
        if (src1Idx < prevRound.length) connections.push({ srcId: prevRound[src1Idx].id, dstId: id });
        if (src2Idx < prevRound.length) connections.push({ srcId: prevRound[src2Idx].id, dstId: id });
      }
      knockoutRounds.push(currentRound);
    }
  }

  return { knockoutRounds, rounds, connections };
}

const GroupStageView = ({
  groupMatches,
  getName,
  allMatches,
  matchNumberMap,
}: {
  groupMatches: Match[];
  getName: (id: string | null) => string;
  allMatches: Match[];
  matchNumberMap?: Map<string, number>;
}) => {
  const groupNumbers = Array.from(new Set(groupMatches.map((m) => m.bracket_number || 1))).sort();
  const hasKnockout = allMatches.some(m => m.round > 0);

  const { knockoutRounds, rounds: knockoutRoundLabels } = useMemo(
    () => hasKnockout ? { knockoutRounds: [], rounds: [] } : buildGroupKnockoutPreview(groupNumbers),
    [groupNumbers, hasKnockout]
  );

  const groupMatchesByGroup = useMemo(() => {
    const map: Record<number, Match[]> = {};
    groupNumbers.forEach(gNum => {
      map[gNum] = groupMatches
        .filter(m => (m.bracket_number || 1) === gNum)
        .sort((a, b) => a.position - b.position);
    });
    return map;
  }, [groupMatches, groupNumbers]);

  const teamsByGroup = useMemo(() => {
    const map: Record<number, string[]> = {};
    groupNumbers.forEach(gNum => {
      const gMatches = groupMatchesByGroup[gNum] || [];
      const teamIds = new Set<string>();
      gMatches.forEach(m => {
        if (m.team1_id) teamIds.add(m.team1_id);
        if (m.team2_id) teamIds.add(m.team2_id);
      });
      map[gNum] = Array.from(teamIds);
    });
    return map;
  }, [groupNumbers, groupMatchesByGroup]);

  return (
    <div className="space-y-4">
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {groupNumbers.map((gNum) => {
          const teamIds = teamsByGroup[gNum] || [];
          return (
            <div key={gNum} className="rounded-xl border border-primary/30 bg-gradient-to-r from-primary/15 to-accent/10 p-4 space-y-3">
              <div className="text-xs font-bold uppercase tracking-[0.2em] bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent flex items-center gap-2 pb-1">
                <span className="text-primary">⚽</span>
                <span>Grupo {numberToLetter(gNum)}</span>
                <span className="ml-auto text-[10px] text-muted-foreground font-normal normal-case tracking-normal">{teamIds.length} duplas</span>
              </div>
              <div className="space-y-1.5">
                {teamIds.map((teamId, idx) => (
                  <div key={teamId} className="flex items-center gap-2 rounded-lg border border-border/50 bg-card/80 px-3 py-2">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/15 text-[10px] font-bold text-primary shrink-0">
                      {idx + 1}
                    </span>
                    <span className="text-sm team-name truncate">{getName(teamId)}</span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {!hasKnockout && knockoutRounds.length > 0 && (
        <div className="relative overflow-x-auto pb-4 rounded-xl border border-border bg-card/50 p-4">
          <div className="flex gap-10 relative" style={{ zIndex: 1 }}>
            {knockoutRounds.map((roundMatches, ri) => {
              const roundLabel = knockoutRoundLabels[ri]?.label || `Rodada ${ri + 1}`;
              return (
                <div key={`ko-${ri}`} className="flex flex-col shrink-0" style={{ minWidth: 135 }}>
                  <div className={`text-[9px] uppercase font-semibold mb-3 whitespace-nowrap rounded-full px-3 py-0.5 text-center ${
                    roundMatches[0]?.scale === "final" || roundMatches[0]?.scale === "semi"
                      ? "bg-primary/15 text-primary"
                      : "bg-muted/50 text-muted-foreground"
                  }`}>
                    {roundLabel}
                  </div>
                  <div className="flex flex-col justify-around gap-4 flex-1">
                    {roundMatches.map((pm) => (
                      <PlaceholderMatchCard key={pm.id} id={pm.id} label1={pm.label1} label2={pm.label2} scale={pm.scale} />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

/* ────────────────────────────────────────────────────
   Normal Knockout — bracket tree com conectores SVG reais
   ──────────────────────────────────────────────────── */
const KNOCKOUT_CARD_H = 94;
const KNOCKOUT_CARD_GAP = 16;

function buildKnockoutTreePositions(knockoutMatches: Match[]) {
  const roundGroups: Record<number, Match[]> = {};
  knockoutMatches.forEach(m => {
    if (!roundGroups[m.round]) roundGroups[m.round] = [];
    roundGroups[m.round].push(m);
  });
  Object.values(roundGroups).forEach(arr => arr.sort((a, b) => a.position - b.position));
  const rounds = Object.keys(roundGroups).map(Number).sort((a, b) => a - b);
  if (rounds.length === 0) return { rounds: [], roundGroups, positions: new Map<string, number>() };

  const positions = new Map<string, number>();
  const slotH = KNOCKOUT_CARD_H + KNOCKOUT_CARD_GAP;
  const firstRound = rounds[0];
  roundGroups[firstRound].forEach((m, i) => { positions.set(m.id, i * slotH); });

  const hasExplicitLinks = knockoutMatches.some(m => m.next_win_match_id);

  for (let ri = 1; ri < rounds.length; ri++) {
    const round = rounds[ri];
    const roundMatches = roundGroups[round];
    const prevRound = roundGroups[rounds[ri - 1]];

    for (let mi = 0; mi < roundMatches.length; mi++) {
      const match = roundMatches[mi];
      let feederPositions: number[] = [];

      if (hasExplicitLinks) {
        const feeders = knockoutMatches.filter(m => m.next_win_match_id === match.id);
        feederPositions = feeders.map(f => positions.get(f.id)).filter((p): p is number => p !== undefined);
      }

      if (feederPositions.length === 0 && prevRound) {
        const idx1 = mi * 2;
        const idx2 = mi * 2 + 1;
        if (idx1 < prevRound.length) { const p = positions.get(prevRound[idx1].id); if (p !== undefined) feederPositions.push(p); }
        if (idx2 < prevRound.length) { const p = positions.get(prevRound[idx2].id); if (p !== undefined) feederPositions.push(p); }
      }

      if (feederPositions.length > 0) {
        positions.set(match.id, feederPositions.reduce((a, b) => a + b, 0) / feederPositions.length);
      } else {
        positions.set(match.id, mi * slotH);
      }
    }
  }

  return { rounds, roundGroups, positions };
}

const NormalKnockout = ({
  matches,
  getName,
  matchNumberMap,
  slotMap,
}: {
  matches: Match[];
  getName: (id: string | null) => string;
  matchNumberMap?: Map<string, number>;
  slotMap: Map<string, "A" | "B">;
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const knockoutMatches = matches.filter((m) => m.round > 0);

  if (knockoutMatches.length === 0) return null;

  const { rounds, roundGroups, positions } = buildKnockoutTreePositions(knockoutMatches);
  const maxY = Math.max(0, ...Array.from(positions.values()));
  const totalHeight = maxY + KNOCKOUT_CARD_H + 60;
  const maxRound = Math.max(...rounds);

  const matchCountByRound: Record<number, number> = {};
  knockoutMatches.forEach(m => { matchCountByRound[m.round] = (matchCountByRound[m.round] || 0) + 1; });

  return (
    <div className="rounded-xl border border-border bg-card/50 p-4">
      <div ref={containerRef} className="relative overflow-x-auto overflow-y-hidden pb-6" style={{ WebkitOverflowScrolling: "touch" }}>
        <div className="flex gap-10 relative" style={{ zIndex: 1, minHeight: totalHeight }}>
          {rounds.map((round) => {
            const roundMatches = roundGroups[round];
            const matchCount = roundMatches.length;
            const isFinal = matchCount === 1 && round === maxRound;
            const isSemi = matchCount <= 2 && round === maxRound - 1 && !isFinal;
            const roundLabel = getEliminationRoundLabel(round, matchCountByRound[round] || 0);
            const scale = isFinal ? "final" : isSemi ? "semi" : "normal";

            return (
              <div key={round} className="flex flex-col shrink-0 relative" style={{ minWidth: 135 }}>
                <div className={`text-[9px] uppercase font-semibold mb-3 rounded-full px-3 py-0.5 text-center truncate ${
                  isFinal || isSemi ? "bg-primary/15 text-primary" : "bg-muted/50 text-muted-foreground"
                }`}>
                  {roundLabel}
                </div>
                <div className="relative flex-1">
                  {roundMatches.map((match) => {
                    const top = positions.get(match.id) ?? 0;
                    return (
                      <div key={match.id} className="absolute left-0" style={{ top }}>
                        <MatchCard
                          match={match}
                          getName={getName}
                          scale={scale as any}
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
      </div>
    </div>
  );
};

/* ────────────────────────────────────────────────────
   DE Bracket Layout — 3-column layout com SVG conectores reais
   ──────────────────────────────────────────────────── */
const DEBracketLayout = ({
  zoomContainerRef,
  isMobile,
  mobileZoom,
  winnersA,
  winnersB,
  losersA,
  losersB,
  semiFinals,
  finalMatches,
  getName,
  allMatches,
  matchNumberMap,
  slotMap,
}: {
  zoomContainerRef: React.RefObject<HTMLDivElement>;
  isMobile: boolean;
  mobileZoom: number;
  winnersA: Match[];
  winnersB: Match[];
  losersA: Match[];
  losersB: Match[];
  semiFinals: Match[];
  finalMatches: Match[];
  getName: (id: string | null) => string;
  allMatches: Match[];
  matchNumberMap?: Map<string, number>;
  slotMap: Map<string, "A" | "B">;
}) => {
  // Ref interno que envolve todo o layout DE para o SVG de conectores globais
  const globalRef = useRef<HTMLDivElement>(null);
  const eliminationMatches = allMatches.filter(m => m.round > 0);

  return (
    <div
      ref={zoomContainerRef}
      className="overflow-x-auto pb-4"
      style={{ touchAction: "pan-x pinch-zoom", WebkitOverflowScrolling: "touch" }}
    >
      <div
        style={isMobile ? { transform: `scale(${mobileZoom})`, transformOrigin: 'top left', width: `${100 / mobileZoom}%` } : undefined}
      >
        <div ref={globalRef} className="relative min-w-[900px]">
          <div className="grid grid-cols-[1fr_auto_1fr] gap-4 items-start relative" style={{ zIndex: 1 }}>
            {/* ── LEFT: Winners (L → R) ── */}
            <div className="space-y-4">
              <div className="text-center">
                <span className="inline-block text-[10px] font-bold uppercase tracking-[0.2em] text-primary/80 border-b border-primary/40 pb-1 px-4">
                  Chave dos Vencedores →
                </span>
              </div>
              <BracketColumn bracketMatches={winnersA} getName={getName} label="Vencedores A" icon="🏆" colorAccent="border-primary/40 bg-primary/[0.1]" reversed={false} allMatches={allMatches} matchNumberMap={matchNumberMap} />
              <BracketColumn bracketMatches={winnersB} getName={getName} label="Vencedores B" icon="🏆" colorAccent="border-primary/30 bg-primary/[0.08]" reversed={false} allMatches={allMatches} matchNumberMap={matchNumberMap} />
            </div>

            {/* ── CENTER: Semifinals + Final ── */}
            <div className="flex flex-col items-center justify-center min-w-[200px] pt-8">
              <div className="mb-4">
                <span className="inline-block text-[10px] font-bold uppercase tracking-[0.2em] text-accent/90 border-b border-accent/40 pb-1 px-4">
                  Fase Final
                </span>
              </div>
              <CenterColumn crossSemis={semiFinals} finalMatches={finalMatches} getName={getName} allMatches={allMatches} matchNumberMap={matchNumberMap} />
            </div>

            {/* ── RIGHT: Losers (R → L) ── */}
            <div className="space-y-4">
              <div className="text-center">
                <span className="inline-block text-[10px] font-bold uppercase tracking-[0.2em] text-destructive/80 border-b border-destructive/40 pb-1 px-4">
                  ← Chave dos Perdedores
                </span>
              </div>
              <BracketColumn bracketMatches={losersA} getName={getName} label="Perdedores Superiores" icon="⬇" colorAccent="border-destructive/40 bg-destructive/[0.1]" reversed={true} allMatches={allMatches} matchNumberMap={matchNumberMap} />
              <BracketColumn bracketMatches={losersB} getName={getName} label="Perdedores Inferiores" icon="⬇" colorAccent="border-destructive/30 bg-destructive/[0.08]" reversed={true} allMatches={allMatches} matchNumberMap={matchNumberMap} />
            </div>
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
  );
};


/* ════════════════════════════════════════════════════
   MAIN COMPONENT
   ════════════════════════════════════════════════════ */
const BracketTreeView = ({ matches, participants }: BracketTreeViewProps) => {
  const isMobile = useIsMobile();
  const zoomContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isMobile && zoomContainerRef.current) {
      const el = zoomContainerRef.current;
      requestAnimationFrame(() => {
        el.scrollLeft = (el.scrollWidth - el.clientWidth) / 2;
      });
    }
  }, [isMobile, matches.length]);

  const getName = (id: string | null) => {
    if (!id) return "A definir";
    return participants.find((p) => p.id === id)?.name || "A definir";
  };

  // Numeração global dos jogos pela sequência do scheduler
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

  // Mapa de slots: determina se cada match vai para slot A (top) ou B (bottom) do próximo
  const slotMap = useMemo(() => buildSlotMap(matches), [matches]);

  const groupMatches = useMemo(() => matches.filter((m) => m.round === 0), [matches]);
  const hasGroupStage = groupMatches.length > 0;
  const hasElimination = useMemo(() => matches.some((m) => m.round > 0), [matches]);

  const { winnersA, winnersB, losersA, losersB, semiFinals, finalMatches, isDoubleElimination } = useMemo(() => {
    const wA = matches.filter((m) => m.bracket_type === "winners" && m.bracket_half === "upper");
    const wB = matches.filter((m) => m.bracket_type === "winners" && m.bracket_half === "lower");
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
      {hasGroupStage && (
        <GroupStageView groupMatches={groupMatches} getName={getName} allMatches={matches} matchNumberMap={matchNumberMap} />
      )}

      {/* Double Elimination */}
      {isDoubleElimination && (
        <DEBracketLayout
          zoomContainerRef={zoomContainerRef}
          isMobile={isMobile}
          mobileZoom={mobileZoom}
          winnersA={winnersA}
          winnersB={winnersB}
          losersA={losersA}
          losersB={losersB}
          semiFinals={semiFinals}
          finalMatches={finalMatches}
          getName={getName}
          allMatches={matches}
          matchNumberMap={matchNumberMap}
          slotMap={slotMap}
        />
      )}

      {/* Normal Knockout */}
      {!isDoubleElimination && hasElimination && (
        <div
          ref={zoomContainerRef}
          className="overflow-x-auto"
          style={{ touchAction: "pan-x pinch-zoom", WebkitOverflowScrolling: "touch" }}
        >
          <NormalKnockout matches={matches} getName={getName} matchNumberMap={matchNumberMap} slotMap={slotMap} />
        </div>
      )}
    </div>
  );
};

export default BracketTreeView;
