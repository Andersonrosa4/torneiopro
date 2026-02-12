import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Trophy, ChevronRight } from "lucide-react";
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

/**
 * BRACKET TAB (CHAVEAMENTO) - STRUCTURAL VIEW
 * Shows groups OR winners/losers brackets with team names and visual structure
 */
const BracketTreeView = ({ matches, participants }: BracketTreeViewProps) => {
  const groupMatches = useMemo(() => matches.filter(m => m.round === 0), [matches]);
  const hasGroupStage = groupMatches.length > 0;
  const hasElimination = useMemo(() => matches.some(m => m.round > 0), [matches]);

  const getName = (id: string | null) => {
    if (!id) return "A definir";
    return participants.find((p) => p.id === id)?.name || "A definir";
  };

  // Group standings
  const getGroupStandings = (groupNum: number) => {
    const gMatches = groupMatches.filter(m => (m.bracket_number || 1) === groupNum);
    const teamIds = new Set<string>();
    gMatches.forEach(m => {
      if (m.team1_id) teamIds.add(m.team1_id);
      if (m.team2_id) teamIds.add(m.team2_id);
    });

    const standings = Array.from(teamIds).map(tid => {
      const wins = gMatches.filter(m => m.winner_team_id === tid).length;
      const played = gMatches.filter(m => (m.team1_id === tid || m.team2_id === tid) && m.status === "completed").length;
      return { id: tid, name: getName(tid), wins, played };
    });

    return standings.sort((a, b) => b.wins - a.wins);
  };

  const groupNumbers = Array.from(new Set(groupMatches.map(m => m.bracket_number || 1))).sort();

  // Double elimination bracket visualization
  const renderDoubleEliminationBrackets = () => {
    const winnersMatches = matches.filter(m => m.bracket_type === 'winners');
    const losersMatches = matches.filter(m => m.bracket_type === 'losers');
    const finalMatches = matches.filter(m => m.bracket_type === 'final' || m.bracket_type === 'third_place');
    const resetFinalMatches = matches.filter(m => m.bracket_type === 'reset_final');

    const winnersUpper = winnersMatches.filter(m => m.bracket_half === 'upper');
    const winnersLower = winnersMatches.filter(m => m.bracket_half === 'lower');
    const losersUpper = losersMatches.filter(m => m.bracket_half === 'upper');
    const losersLower = losersMatches.filter(m => m.bracket_half === 'lower');

    const groupByRound = (bracketMatches: typeof matches) => {
      const groups: Record<number, typeof matches> = {};
      bracketMatches.forEach(m => {
        if (!groups[m.round]) groups[m.round] = [];
        groups[m.round].push(m);
      });
      return groups;
    };

    const renderBracketColumn = (title: string, bracketMatches: typeof matches, bgColor: string) => {
      const roundGroups = groupByRound(bracketMatches);
      const rounds = Object.keys(roundGroups).map(Number).sort((a, b) => a - b);

      return (
        <div className={`flex-1 ${bgColor} rounded-lg p-4 border border-border`}>
          <h4 className="text-sm font-bold text-primary mb-3 uppercase tracking-wider">{title}</h4>
          <div className="space-y-4">
            {rounds.map(round => (
              <div key={round} className="space-y-2">
                <div className="text-xs font-semibold text-muted-foreground uppercase">Rodada {round}</div>
                {roundGroups[round].map(match => (
                  <motion.div
                    key={match.id}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`text-xs rounded border p-2 transition-all ${
                      match.status === 'completed'
                        ? 'border-success/30 bg-success/5'
                        : match.team1_id && match.team2_id
                          ? 'border-primary/30 bg-primary/5'
                          : 'border-border bg-secondary/30'
                    }`}
                  >
                    <div className="font-medium truncate">{getName(match.team1_id)}</div>
                    {match.status === 'completed' && match.score1 !== null && (
                      <div className="text-xs font-mono text-success">{match.score1}</div>
                    )}
                    <div className="border-t border-border my-1" />
                    <div className="font-medium truncate">{getName(match.team2_id)}</div>
                    {match.status === 'completed' && match.score2 !== null && (
                      <div className="text-xs font-mono text-success">{match.score2}</div>
                    )}
                  </motion.div>
                ))}
              </div>
            ))}
          </div>
        </div>
      );
    };

    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="space-y-6"
      >
        {/* Winners Bracket */}
        {winnersMatches.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Trophy className="h-5 w-5 text-primary" />
              <h3 className="text-lg font-bold text-primary">Chave dos Vencedores</h3>
            </div>
            <div className="grid grid-cols-2 gap-4">
              {winnersUpper.length > 0 && renderBracketColumn('Vencedores - Metade Superior', winnersUpper, 'bg-blue-950/20')}
              {winnersLower.length > 0 && renderBracketColumn('Vencedores - Metade Inferior', winnersLower, 'bg-cyan-950/20')}
            </div>
            {winnersMatches.filter(m => !m.bracket_half).length > 0 && (
              <div>
                {renderBracketColumn('Final dos Vencedores', winnersMatches.filter(m => !m.bracket_half), 'bg-primary/10')}
              </div>
            )}
          </div>
        )}

        {/* Losers Bracket */}
        {losersMatches.length > 0 && (
          <div className="space-y-3">
            <h3 className="text-lg font-bold text-accent">Chave dos Perdedores</h3>
            <div className="grid grid-cols-2 gap-4">
              {losersUpper.length > 0 && renderBracketColumn('Perdedores Inferior ↓ (de Vencedores Superior)', losersUpper, 'bg-orange-950/20')}
              {losersLower.length > 0 && renderBracketColumn('Perdedores Superior ↑ (de Vencedores Inferior)', losersLower, 'bg-red-950/20')}
            </div>
          </div>
        )}

        {/* Grand Final */}
        {finalMatches.length > 0 && (
          <div className="space-y-3">
            <h3 className="text-lg font-bold text-primary flex items-center gap-2">
              <Trophy className="h-5 w-5" /> Grande Final
            </h3>
            <div className="bg-gradient-to-r from-primary/10 to-accent/10 rounded-lg p-4 border border-primary/30">
              {finalMatches.map(match => (
                <div key={match.id} className="space-y-2">
                  <div className="font-medium text-foreground">{getName(match.team1_id)}</div>
                  {match.status === 'completed' && match.score1 !== null && (
                    <div className="text-sm font-mono font-bold text-success">{match.score1} - {match.score2}</div>
                  )}
                  <div className="border-t border-border my-2" />
                  <div className="font-medium text-foreground">{getName(match.team2_id)}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Reset Final (Extra) */}
        {resetFinalMatches.length > 0 && (
          <div className="space-y-3">
            <h3 className="text-lg font-bold text-warning flex items-center gap-2">
              <Trophy className="h-5 w-5" /> Final Extra (Reset)
            </h3>
            <div className="bg-gradient-to-r from-warning/10 to-accent/10 rounded-lg p-4 border border-warning/30">
              {resetFinalMatches.map(match => (
                <div key={match.id} className="space-y-2">
                  <div className="text-xs text-muted-foreground mb-2">Campeão dos Perdedores vs Campeão</div>
                  <div className="font-medium text-foreground">{getName(match.team1_id)}</div>
                  {match.status === 'completed' && match.score1 !== null && (
                    <div className="text-sm font-mono font-bold text-success">{match.score1} - {match.score2}</div>
                  )}
                  <div className="border-t border-border my-2" />
                  <div className="font-medium text-foreground">{getName(match.team2_id)}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Mirror Crossing Legend */}
        <div className="rounded-lg bg-muted/30 border border-border p-3 text-xs space-y-1">
          <div className="font-semibold text-muted-foreground mb-2">📍 Cruzamento Espelhado (Anti-Choque):</div>
          <div className="text-muted-foreground">→ Perdedor Vencedores Superior → Perdedores Inferior</div>
          <div className="text-muted-foreground">← Perdedor Vencedores Inferior → Perdedores Superior</div>
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
            {groupNumbers.map(gNum => {
              const gMatches = groupMatches.filter(m => (m.bracket_number || 1) === gNum);
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
                          <span className="font-medium text-foreground">{s.name}</span>
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
      )}

      {/* Elimination Stage */}
      {hasElimination && renderDoubleEliminationBrackets()}
    </div>
  );
};

export default BracketTreeView;
