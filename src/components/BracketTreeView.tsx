import { useMemo } from "react";
import { Trophy } from "lucide-react";
import { motion } from "framer-motion";

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
}

/** Compact match card */
const MatchCard = ({
  match,
  getName,
  reverse,
}: {
  match: Match;
  getName: (id: string | null) => string;
  reverse?: boolean;
}) => {
  const t1Win = match.winner_team_id === match.team1_id;
  const t2Win = match.winner_team_id === match.team2_id;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      className={`rounded border text-[11px] leading-tight transition-all w-full min-w-[130px] max-w-[180px] ${
        match.status === "completed"
          ? "border-success/40 bg-success/5"
          : match.team1_id && match.team2_id
            ? "border-primary/30 bg-primary/5"
            : "border-border bg-secondary/20"
      }`}
    >
      <div className={`flex items-center justify-between px-2 py-1 ${t1Win ? "bg-success/10" : ""}`}>
        <span className={`truncate ${t1Win ? "font-bold text-success" : "text-foreground"}`}>
          {getName(match.team1_id)}
        </span>
        {match.status === "completed" && match.score1 !== null && (
          <span className="font-mono ml-1 text-success font-bold">{match.score1}</span>
        )}
      </div>
      <div className="border-t border-border/50" />
      <div className={`flex items-center justify-between px-2 py-1 ${t2Win ? "bg-success/10" : ""}`}>
        <span className={`truncate ${t2Win ? "font-bold text-success" : "text-foreground"}`}>
          {getName(match.team2_id)}
        </span>
        {match.status === "completed" && match.score2 !== null && (
          <span className="font-mono ml-1 text-success font-bold">{match.score2}</span>
        )}
      </div>
    </motion.div>
  );
};

/**
 * Renders a single bracket half as horizontal rounds (columns).
 * direction="ltr" = round 1 on left, advancing right (Lado A)
 * direction="rtl" = round 1 on right, advancing left (Lado B)
 */
const BracketColumns = ({
  bracketMatches,
  getName,
  direction,
  label,
  colorClass,
}: {
  bracketMatches: Match[];
  getName: (id: string | null) => string;
  direction: "ltr" | "rtl";
  label: string;
  colorClass: string;
}) => {
  const roundGroups: Record<number, Match[]> = {};
  bracketMatches.forEach((m) => {
    if (!roundGroups[m.round]) roundGroups[m.round] = [];
    roundGroups[m.round].push(m);
  });
  let rounds = Object.keys(roundGroups).map(Number).sort((a, b) => a - b);
  if (direction === "rtl") rounds = [...rounds].reverse();

  if (bracketMatches.length === 0) return null;

  return (
    <div className={`rounded-lg border border-border ${colorClass} p-3 flex-1`}>
      <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2">
        {label}
      </div>
      <div className={`flex gap-3 ${direction === "rtl" ? "flex-row-reverse" : ""} overflow-x-auto`}>
        {rounds.map((round) => (
          <div key={round} className="flex flex-col gap-2 items-center justify-center min-w-[140px]">
            <div className="text-[9px] uppercase font-semibold text-muted-foreground/70 whitespace-nowrap">
              R{round}
            </div>
            {roundGroups[round]
              .sort((a, b) => a.position - b.position)
              .map((match) => (
                <MatchCard key={match.id} match={match} getName={getName} />
              ))}
          </div>
        ))}
      </div>
    </div>
  );
};

const BracketTreeView = ({ matches, participants }: BracketTreeViewProps) => {
  const groupMatches = useMemo(() => matches.filter((m) => m.round === 0), [matches]);
  const hasGroupStage = groupMatches.length > 0;
  const hasElimination = useMemo(() => matches.some((m) => m.round > 0), [matches]);

  const getName = (id: string | null) => {
    if (!id) return "A definir";
    return participants.find((p) => p.id === id)?.name || "A definir";
  };

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

  const groupNumbers = Array.from(new Set(groupMatches.map((m) => m.bracket_number || 1))).sort();

  // === MIRRORED BRACKET LAYOUT ===
  const renderMirroredBracket = () => {
    // Lado A = upper (left side, advances left→right toward center)
    // Lado B = lower (right side, advances right→left toward center)
    const winnersA = matches.filter((m) => m.bracket_type === "winners" && m.bracket_half === "upper");
    const winnersB = matches.filter((m) => m.bracket_type === "winners" && m.bracket_half === "lower");
    const losersA = matches.filter((m) => m.bracket_type === "losers" && m.bracket_half === "lower");
    // Losers A = Perdedores que vieram de Vencedores Superior (mirror → losers lower bracket_number=4)
    const losersB = matches.filter((m) => m.bracket_type === "losers" && m.bracket_half === "upper");
    // Losers B = Perdedores que vieram de Vencedores Inferior (mirror → losers upper bracket_number=3)
    const crossSemis = matches.filter((m) => m.bracket_type === "cross_semi");
    const finalMatches = matches.filter((m) => m.bracket_type === "final");

    const hasAnyBracket = winnersA.length > 0 || winnersB.length > 0;
    if (!hasAnyBracket && crossSemis.length === 0 && finalMatches.length === 0) {
      // Fallback for normal knockout (no bracket_type)
      const knockoutMatches = matches.filter((m) => m.round > 0);
      return (
        <BracketColumns
          bracketMatches={knockoutMatches}
          getName={getName}
          direction="ltr"
          label="Eliminatória"
          colorClass="bg-card/50"
        />
      );
    }

    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
        {/* === MAIN MIRRORED LAYOUT === */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto_1fr] gap-0 items-start">
          {/* ====== LADO A (Left) ====== */}
          <div className="space-y-4">
            {/* Vencedores – Lado A (top-left) */}
            <BracketColumns
              bracketMatches={winnersA}
              getName={getName}
              direction="ltr"
              label="🏆 Vencedores — Lado A"
              colorClass="bg-blue-950/20"
            />
            {/* Perdedores – Lado A (bottom-left) */}
            {losersA.length > 0 && (
              <BracketColumns
                bracketMatches={losersA}
                getName={getName}
                direction="ltr"
                label="⬇ Perdedores — Lado A"
                colorClass="bg-orange-950/20"
              />
            )}
          </div>

          {/* ====== EIXO CENTRAL ====== */}
          <div className="hidden lg:flex flex-col items-center justify-center px-2 min-h-[200px]">
            <div className="w-px bg-border flex-1" />

            {/* Cross-Semifinals at center */}
            {crossSemis.length > 0 && (
              <div className="py-3 space-y-2">
                <div className="text-[10px] font-bold uppercase tracking-widest text-primary text-center whitespace-nowrap">
                  Semifinais
                </div>
                {crossSemis
                  .sort((a, b) => a.position - b.position)
                  .map((match) => (
                    <div key={match.id} className="relative">
                      <div className="text-[9px] text-muted-foreground text-center mb-1 whitespace-nowrap">
                        {match.bracket_half === "upper"
                          ? "Camp. Perd. A × Camp. Venc. B"
                          : "Camp. Perd. B × Camp. Venc. A"}
                      </div>
                      <MatchCard match={match} getName={getName} />
                    </div>
                  ))}
              </div>
            )}

            {/* Final at center */}
            {finalMatches.length > 0 && (
              <div className="py-3">
                <div className="text-[10px] font-bold uppercase tracking-widest text-primary text-center flex items-center gap-1 justify-center mb-1">
                  <Trophy className="h-3 w-3" /> Final
                </div>
                {finalMatches.map((match) => (
                  <MatchCard key={match.id} match={match} getName={getName} />
                ))}
              </div>
            )}

            <div className="w-px bg-border flex-1" />
          </div>

          {/* ====== LADO B (Right) ====== */}
          <div className="space-y-4">
            {/* Vencedores – Lado B (top-right) */}
            <BracketColumns
              bracketMatches={winnersB}
              getName={getName}
              direction="rtl"
              label="🏆 Vencedores — Lado B"
              colorClass="bg-cyan-950/20"
            />
            {/* Perdedores – Lado B (bottom-right) */}
            {losersB.length > 0 && (
              <BracketColumns
                bracketMatches={losersB}
                getName={getName}
                direction="rtl"
                label="⬇ Perdedores — Lado B"
                colorClass="bg-red-950/20"
              />
            )}
          </div>
        </div>

        {/* Mobile: show cross-semis + final separately */}
        <div className="lg:hidden space-y-4">
          {crossSemis.length > 0 && (
            <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-2">
              <div className="text-xs font-bold uppercase tracking-wider text-primary">
                Semifinais Cruzadas
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {crossSemis.sort((a, b) => a.position - b.position).map((match) => (
                  <div key={match.id}>
                    <div className="text-[9px] text-muted-foreground mb-1">
                      {match.bracket_half === "upper"
                        ? "Camp. Perdedores A × Camp. Vencedores B"
                        : "Camp. Perdedores B × Camp. Vencedores A"}
                    </div>
                    <MatchCard match={match} getName={getName} />
                  </div>
                ))}
              </div>
            </div>
          )}
          {finalMatches.length > 0 && (
            <div className="rounded-lg border border-primary/30 bg-gradient-to-r from-primary/10 to-accent/10 p-3 space-y-2">
              <div className="text-xs font-bold uppercase tracking-wider text-primary flex items-center gap-1">
                <Trophy className="h-3 w-3" /> Final
              </div>
              {finalMatches.map((match) => (
                <MatchCard key={match.id} match={match} getName={getName} />
              ))}
            </div>
          )}
        </div>

        {/* Legend */}
        <div className="rounded-lg bg-muted/30 border border-border p-3 text-[10px] space-y-1">
          <div className="font-semibold text-muted-foreground mb-1">📍 Regras de Cruzamento:</div>
          <div className="text-muted-foreground">→ Perdedor Vencedores A → Perdedores A (lado oposto invertido)</div>
          <div className="text-muted-foreground">← Perdedor Vencedores B → Perdedores B (lado oposto invertido)</div>
          <div className="text-muted-foreground mt-1">🏆 Semifinais: Campeão Perdedores enfrenta Campeão Vencedores do lado oposto</div>
          <div className="text-muted-foreground">⚠️ Derrota na Chave dos Perdedores = Eliminação definitiva</div>
        </div>
      </motion.div>
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

      {/* Elimination Stage - Mirrored Layout */}
      {hasElimination && renderMirroredBracket()}
    </div>
  );
};

export default BracketTreeView;
