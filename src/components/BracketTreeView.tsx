import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Trophy, Check } from "lucide-react";
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
}

interface BracketTreeViewProps {
  matches: Match[];
  participants: Participant[];
  isOwner: boolean;
  onDeclareWinner: (matchId: string, winnerId: string) => void;
  onUpdateScore: (matchId: string, score1: number, score2: number) => void;
}

const BracketTreeView = ({ matches, participants, isOwner, onDeclareWinner, onUpdateScore }: BracketTreeViewProps) => {
  const [selectedBracket, setSelectedBracket] = useState<number>(1);

  const hasGroupStage = matches.some(m => m.round === 0);
  const knockoutMatches = matches.filter(m => m.round > 0);
  const groupMatches = matches.filter(m => m.round === 0);

  // For knockout view
  const bracketMatches = knockoutMatches.filter(m => (m.bracket_number || 1) === selectedBracket);
  const brackets = Array.from(new Set(knockoutMatches.map(m => m.bracket_number || 1))).sort();

  const rounds = bracketMatches.length > 0 ? Math.max(...bracketMatches.map((m) => m.round)) : 0;
  const minRound = bracketMatches.length > 0 ? Math.min(...bracketMatches.map((m) => m.round)) : 1;

  // Group stage data
  const groupNumbers = Array.from(new Set(groupMatches.map(m => m.bracket_number || 1))).sort();

  const getName = (id: string | null) => {
    if (!id) return "A definir";
    return participants.find((p) => p.id === id)?.name || "A definir";
  };

  const getShortName = (id: string | null) => {
    const full = getName(id);
    if (full === "A definir") return "TBD";
    const parts = full.split(" / ");
    if (parts.length === 2) {
      return parts.map(p => p.split(" ")[0]).join(" / ");
    }
    return full.length > 16 ? full.slice(0, 14) + "…" : full;
  };

  const getRoundLabel = (round: number) => {
    if (round === 0) return "Grupos";
    if (round === rounds) return "Final";
    if (round === rounds - 1) return "Semi";
    if (round === rounds - 2) return "Quartas";
    if (round === rounds - 3) return "Oitavas";
    return `R${round}`;
  };

  const getMatchesByRound = (round: number) => {
    return bracketMatches.filter(m => m.round === round).sort((a, b) => a.position - b.position);
  };

  const totalRounds = rounds - minRound + 1;

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
      return { id: tid, name: getShortName(tid), wins, played };
    });

    return standings.sort((a, b) => b.wins - a.wins);
  };

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
                  {/* Standings */}
                  <div className="mb-3 space-y-1">
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
                  {/* Group matches */}
                  <div className="space-y-1.5">
                    {gMatches.map(match => (
                      <CompactMatchCard
                        key={match.id}
                        match={match}
                        getName={getShortName}
                        getFullName={getName}
                        isOwner={isOwner}
                        onDeclareWinner={onDeclareWinner}
                        onUpdateScore={onUpdateScore}
                        isFinal={false}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Knockout Phase */}
      {knockoutMatches.length > 0 && (
        <div>
          {hasGroupStage && (
            <h3 className="mb-3 text-lg font-bold text-primary flex items-center gap-2">
              <Trophy className="h-5 w-5" /> Fase Eliminatória
            </h3>
          )}
          {brackets.length > 1 && (
            <div className="mb-4 flex gap-2 flex-wrap">
              {brackets.map(bracket => (
                <Button
                  key={bracket}
                  variant={selectedBracket === bracket ? "default" : "outline"}
                  onClick={() => setSelectedBracket(bracket)}
                  size="sm"
                >
                  Chave {bracket}
                </Button>
              ))}
            </div>
          )}

          <div className="w-full overflow-x-auto">
            <div
              className="flex gap-2 sm:gap-4 min-w-0"
              style={{ minWidth: `${Math.max(totalRounds * 160, 320)}px` }}
            >
              {Array.from({ length: totalRounds }, (_, i) => minRound + i).map((round) => {
                const roundMatches = getMatchesByRound(round);
                return (
                  <div key={round} className="flex flex-col flex-1 min-w-[140px] max-w-[220px]">
                    <h3 className="mb-3 text-center text-xs font-bold text-primary uppercase tracking-wider">
                      {getRoundLabel(round)}
                    </h3>
                    <div className="flex flex-1 flex-col justify-around gap-2">
                      {roundMatches.map((match) => (
                        <CompactMatchCard
                          key={match.id}
                          match={match}
                          getName={getShortName}
                          getFullName={getName}
                          isOwner={isOwner}
                          onDeclareWinner={onDeclareWinner}
                          onUpdateScore={onUpdateScore}
                          isFinal={round === rounds}
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {knockoutMatches.length === 0 && !hasGroupStage && (
        <p className="text-muted-foreground text-center py-8">Nenhuma partida gerada.</p>
      )}
    </div>
  );
};

const CompactMatchCard = ({
  match, getName, getFullName, isOwner, onDeclareWinner, onUpdateScore, isFinal,
}: {
  match: Match;
  getName: (id: string | null) => string;
  getFullName: (id: string | null) => string;
  isOwner: boolean;
  onDeclareWinner: (matchId: string, winnerId: string) => void;
  onUpdateScore: (matchId: string, score1: number, score2: number) => void;
  isFinal: boolean;
}) => {
  const [s1, setS1] = useState(match.score1?.toString() || "0");
  const [s2, setS2] = useState(match.score2?.toString() || "0");

  const p1Name = getName(match.team1_id);
  const p2Name = getName(match.team2_id);
  const isCompleted = match.status === "completed";
  const canScore = isOwner && !isCompleted && match.team1_id && match.team2_id;

  const handleScoreBlur = () => {
    onUpdateScore(match.id, Number(s1) || 0, Number(s2) || 0);
  };

  return (
    <motion.div
      initial={{ scale: 0.95, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      title={`${getFullName(match.team1_id)} vs ${getFullName(match.team2_id)}`}
      className={`relative rounded-md border bg-card shadow-sm transition-all text-xs ${
        isFinal ? "border-primary/60 shadow-glow" : "border-border"
      } ${isCompleted ? "opacity-80" : ""}`}
    >
      {isFinal && (
        <div className="flex items-center justify-center gap-1 rounded-t-md bg-gradient-primary px-2 py-0.5 text-[10px] font-bold text-primary-foreground">
          <Trophy className="h-2.5 w-2.5" /> FINAL
        </div>
      )}

      {/* Team 1 */}
      <div className={`flex items-center gap-1 border-b border-border px-2 py-1.5 ${
        match.winner_team_id === match.team1_id && isCompleted ? "bg-success/15" : ""
      }`}>
        <span className={`flex-1 truncate text-xs font-medium ${
          match.winner_team_id === match.team1_id && isCompleted ? "text-success font-bold" : p1Name === "TBD" ? "text-muted-foreground" : ""
        }`}>
          {p1Name}
        </span>
        <div className="flex items-center gap-1 shrink-0">
          {canScore ? (
            <Input value={s1} onChange={(e) => setS1(e.target.value)} onBlur={handleScoreBlur} className="h-6 w-10 text-center text-xs p-0" />
          ) : (
            <span className="text-xs font-bold tabular-nums w-5 text-right">{match.score1 ?? "-"}</span>
          )}
          {canScore && match.team1_id && (
            <Button size="sm" variant="ghost" className="h-5 w-5 p-0" onClick={() => onDeclareWinner(match.id, match.team1_id!)}>
              <Check className="h-3 w-3 text-success" />
            </Button>
          )}
          {isCompleted && match.winner_team_id === match.team1_id && (
            <Trophy className="h-3 w-3 text-success shrink-0" />
          )}
        </div>
      </div>

      {/* Team 2 */}
      <div className={`flex items-center gap-1 px-2 py-1.5 ${
        match.winner_team_id === match.team2_id && isCompleted ? "bg-success/15" : ""
      }`}>
        <span className={`flex-1 truncate text-xs font-medium ${
          match.winner_team_id === match.team2_id && isCompleted ? "text-success font-bold" : p2Name === "TBD" ? "text-muted-foreground" : ""
        }`}>
          {p2Name}
        </span>
        <div className="flex items-center gap-1 shrink-0">
          {canScore ? (
            <Input value={s2} onChange={(e) => setS2(e.target.value)} onBlur={handleScoreBlur} className="h-6 w-10 text-center text-xs p-0" />
          ) : (
            <span className="text-xs font-bold tabular-nums w-5 text-right">{match.score2 ?? "-"}</span>
          )}
          {canScore && match.team2_id && (
            <Button size="sm" variant="ghost" className="h-5 w-5 p-0" onClick={() => onDeclareWinner(match.id, match.team2_id!)}>
              <Check className="h-3 w-3 text-success" />
            </Button>
          )}
          {isCompleted && match.winner_team_id === match.team2_id && (
            <Trophy className="h-3 w-3 text-success shrink-0" />
          )}
        </div>
      </div>
    </motion.div>
  );
};

export default BracketTreeView;
