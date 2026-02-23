import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { organizerQuery, publicQuery } from "@/lib/organizerApi";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Plus, Trash2, TrendingUp, Download, FileText, Sheet, Pencil, Check, X, Zap } from "lucide-react";
import { motion } from "framer-motion";

import { exportRankings } from "@/lib/exportUtils";

/** Points table based on classification position */
const getPointsForPosition = (position: number): number => {
  if (position === 1) return 20;
  if (position === 2) return 18;
  if (position === 3) return 16;
  if (position === 4) return 14;
  if (position >= 5 && position <= 8) return 10;
  if (position >= 9 && position <= 16) return 8;
  if (position >= 17 && position <= 24) return 6;
  if (position >= 25 && position <= 32) return 4;
  return 2;
};
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface RankingEntry {
  id: string;
  athlete_name: string;
  points: number;
  sport: string;
  tournament_id: string;
  created_by: string;
}

interface Team {
  id: string;
  player1_name: string;
  player2_name: string;
}

interface RankingsTabProps {
  tournamentId: string;
  isOwner: boolean;
  sport: string;
  tournamentName?: string;
  eventDate?: string;
  modalityId?: string | null;
}

const RankingsTab = ({ tournamentId, isOwner, sport, tournamentName = "", eventDate, modalityId }: RankingsTabProps) => {
  const { user, organizerId } = useAuth();
  const [rankings, setRankings] = useState<RankingEntry[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedAthlete, setSelectedAthlete] = useState("");
  const [points, setPoints] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editPoints, setEditPoints] = useState("");

  const fetchRankings = async () => {
    const { data, error } = await publicQuery<RankingEntry[]>({
      table: "rankings",
      filters: { tournament_id: tournamentId },
      order: { column: "points", ascending: false },
    });

    if (error) {
      toast.error("Erro ao carregar rankings");
      return;
    }
    setRankings(data || []);
    setLoading(false);
  };

  const fetchTeams = async () => {
    const filters: Record<string, any> = { tournament_id: tournamentId };
    if (modalityId) {
      filters.modality_id = modalityId;
    }
    const { data } = await publicQuery<Team[]>({
      table: "teams",
      filters,
      order: { column: "seed", ascending: true },
    });
    if (data) setTeams(data);
  };

  useEffect(() => {
    fetchRankings();
    fetchTeams();

    const channel = supabase
      .channel(`rankings-${tournamentId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "rankings", filter: `tournament_id=eq.${tournamentId}` }, () => fetchRankings())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [tournamentId, modalityId]);

  // Build athlete options from teams (individual player names)
  const athleteOptions = useMemo(() => {
    const names = new Set<string>();
    for (const t of teams) {
      names.add(t.player1_name);
      names.add(t.player2_name);
    }
    // Also add team pair names
    for (const t of teams) {
      names.add(`${t.player1_name} / ${t.player2_name}`);
    }
    return [...names].sort();
  }, [teams]);

  // Already added athletes
  const addedAthletes = useMemo(() => new Set(rankings.map((r) => r.athlete_name)), [rankings]);

  // Filter out already-added athletes
  const availableAthletes = useMemo(
    () => athleteOptions.filter((name) => !addedAthletes.has(name)),
    [athleteOptions, addedAthletes]
  );

  const addAthletePoints = async () => {
    if (!selectedAthlete || !points || Number(points) < 0) {
      toast.error("Selecione o atleta e insira os pontos (≥ 0)");
      return;
    }

    const createdBy = organizerId || user?.id || "";
    if (!createdBy) {
      toast.error("Você precisa estar logado");
      return;
    }

    const { error } = await organizerQuery({
      table: "rankings",
      operation: "insert",
      data: {
        athlete_name: selectedAthlete,
        points: Number(points),
        sport: sport as "beach_volleyball" | "futevolei" | "beach_tennis",
        tournament_id: tournamentId,
        created_by: createdBy,
      },
    });

    if (error) {
      toast.error(error.message || "Erro ao adicionar pontos");
      return;
    }

    toast.success("Pontos adicionados!");
    setSelectedAthlete("");
    setPoints("");
    fetchRankings();
  };

  const updatePoints = async (id: string, newPoints: number) => {
    if (newPoints < 0) {
      toast.error("Pontos não podem ser negativos");
      return;
    }

    const { error } = await organizerQuery({ table: "rankings", operation: "update", data: { points: newPoints }, filters: { id } });

    if (error) {
      toast.error("Erro ao atualizar pontos");
    } else {
      setEditingId(null);
      fetchRankings();
    }
  };

  const deleteRanking = async (id: string) => {
    const { error } = await organizerQuery({ table: "rankings", operation: "delete", filters: { id } });

    if (error) {
      toast.error("Erro ao remover ranking");
      return;
    }
    toast.success("Ranking removido!");
    fetchRankings();
  };

  const [generating, setGenerating] = useState(false);

  /** Auto-generate ranking from classification positions */
  const generateAutoRanking = async () => {
    const createdBy = organizerId || user?.id || "";
    if (!createdBy) {
      toast.error("Você precisa estar logado");
      return;
    }

    setGenerating(true);
    try {
      // Fetch matches for this tournament/modality
      const matchFilters: Record<string, any> = { tournament_id: tournamentId };
      if (modalityId) matchFilters.modality_id = modalityId;

      const { data: matchesData } = await publicQuery<any[]>({
        table: "matches",
        filters: matchFilters,
        order: { column: "round", ascending: true },
      });

      if (!matchesData || matchesData.length === 0) {
        toast.error("Nenhuma partida encontrada para gerar o ranking");
        setGenerating(false);
        return;
      }

      // Build elimination ranking (same logic as ClassificationTab)
      const elimMatches = matchesData.filter((m: any) => m.round >= 1 && m.bracket_type === "winners");
      const groupMatches = matchesData.filter((m: any) => m.round === 0);

      if (elimMatches.length === 0) {
        toast.error("Nenhuma fase eliminatória encontrada");
        setGenerating(false);
        return;
      }

      const maxRound = Math.max(...elimMatches.map((m: any) => m.round));
      const ranked: { teamId: string; position: number }[] = [];
      const placedTeams = new Set<string>();

      // Final
      const finalMatches = elimMatches.filter((m: any) => m.round === maxRound && m.status === "completed");
      finalMatches.forEach((f: any) => {
        if (f.winner_team_id && !placedTeams.has(f.winner_team_id)) {
          ranked.push({ teamId: f.winner_team_id, position: 1 });
          placedTeams.add(f.winner_team_id);
        }
        const loserId = f.team1_id === f.winner_team_id ? f.team2_id : f.team1_id;
        if (loserId && !placedTeams.has(loserId)) {
          ranked.push({ teamId: loserId, position: 2 });
          placedTeams.add(loserId);
        }
      });

      // Walk backward through rounds
      for (let round = maxRound - 1; round >= 1; round--) {
        const roundMatches = elimMatches.filter((m: any) => m.round === round && m.status === "completed");
        const startPos = ranked.length + 1;
        const losers: { teamId: string; pointDiff: number }[] = [];

        roundMatches.forEach((m: any) => {
          if (m.winner_team_id) {
            const loserId = m.team1_id === m.winner_team_id ? m.team2_id : m.team1_id;
            if (loserId && !placedTeams.has(loserId)) {
              const s1 = m.score1 ?? 0;
              const s2 = m.score2 ?? 0;
              const diff = m.team1_id === loserId ? s1 - s2 : s2 - s1;
              losers.push({ teamId: loserId, pointDiff: diff });
            }
          }
        });

        losers.sort((a, b) => b.pointDiff - a.pointDiff);
        losers.forEach((l, idx) => {
          ranked.push({ teamId: l.teamId, position: startPos + idx });
          placedTeams.add(l.teamId);
        });
      }

      // Group stage unplaced teams
      const groupTeamIds = new Set<string>();
      groupMatches.forEach((m: any) => {
        if (m.team1_id) groupTeamIds.add(m.team1_id);
        if (m.team2_id) groupTeamIds.add(m.team2_id);
      });

      const unplaced: { teamId: string; wins: number; diff: number }[] = [];
      groupTeamIds.forEach((tid) => {
        if (placedTeams.has(tid)) return;
        let wins = 0, pf = 0, pa = 0;
        groupMatches.filter((m: any) => m.status === "completed" && (m.team1_id === tid || m.team2_id === tid))
          .forEach((m: any) => {
            if (m.winner_team_id === tid) wins++;
            if (m.team1_id === tid) { pf += m.score1 ?? 0; pa += m.score2 ?? 0; }
            else { pf += m.score2 ?? 0; pa += m.score1 ?? 0; }
          });
        unplaced.push({ teamId: tid, wins, diff: pf - pa });
      });
      unplaced.sort((a, b) => b.wins - a.wins || b.diff - a.diff);
      const gStart = ranked.length + 1;
      unplaced.forEach((t, idx) => {
        ranked.push({ teamId: t.teamId, position: gStart + idx });
        placedTeams.add(t.teamId);
      });

      // Now create ranking entries for each individual player
      // First delete existing rankings for this tournament
      const { data: existingRankings } = await publicQuery<any[]>({
        table: "rankings",
        filters: { tournament_id: tournamentId },
      });

      if (existingRankings && existingRankings.length > 0) {
        for (const r of existingRankings) {
          await organizerQuery({ table: "rankings", operation: "delete", filters: { id: r.id } });
        }
      }

      // Build team map
      const teamMap = new Map<string, Team>();
      teams.forEach((t) => teamMap.set(t.id, t));

      // Insert individual player rankings
      let inserted = 0;
      for (const entry of ranked) {
        const team = teamMap.get(entry.teamId);
        if (!team) continue;
        const pts = getPointsForPosition(entry.position);

        // Insert for each player AND for the pair
        const names = [team.player1_name, team.player2_name, `${team.player1_name} / ${team.player2_name}`];
        for (const name of names) {
          await organizerQuery({
            table: "rankings",
            operation: "insert",
            data: {
              athlete_name: name,
              points: pts,
              sport: sport as any,
              tournament_id: tournamentId,
              created_by: createdBy,
            },
          });
          inserted++;
        }
      }

      toast.success(`Ranking gerado! ${inserted} entradas criadas.`);
      fetchRankings();
    } catch (e: any) {
      toast.error(e.message || "Erro ao gerar ranking");
    } finally {
      setGenerating(false);
    }
  };

  // Rankings are already sorted by points desc from the query
  const sortedRankings = useMemo(
    () => [...rankings].sort((a, b) => b.points - a.points),
    [rankings]
  );

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {isOwner && (
        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-xl border border-border bg-card p-6 shadow-card"
        >
          <h2 className="mb-4 text-xl font-semibold flex items-center gap-2">
            <TrendingUp className="h-5 w-5" /> Atribuir Pontos
          </h2>
          <div className="flex flex-col gap-4 sm:flex-row">
            <Select value={selectedAthlete} onValueChange={setSelectedAthlete}>
              <SelectTrigger className="flex-1">
                <SelectValue placeholder="Selecione o atleta/dupla" />
              </SelectTrigger>
              <SelectContent>
                {availableAthletes.length === 0 ? (
                  <SelectItem value="__none" disabled>Todos os atletas já foram adicionados</SelectItem>
                ) : (
                  availableAthletes.map((name) => (
                    <SelectItem key={name} value={name}>{name}</SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
            <Input
              type="number"
              placeholder="Pontos"
              value={points}
              onChange={(e) => setPoints(e.target.value)}
              min="0"
              onKeyDown={(e) => e.key === "Enter" && addAthletePoints()}
              className="w-24"
            />
            <Button onClick={addAthletePoints} className="gap-1 shrink-0">
              <Plus className="h-4 w-4" /> Adicionar
            </Button>
          </div>

          <div className="mt-4 pt-4 border-t border-border">
            <Button
              onClick={generateAutoRanking}
              disabled={generating}
              variant="outline"
              className="w-full gap-2"
            >
              <Zap className="h-4 w-4" />
              {generating ? "Gerando..." : "Gerar Ranking Automático pela Classificação"}
            </Button>
            <p className="text-xs text-muted-foreground mt-2 text-center">
              1º=20pts · 2º=18pts · 3º=16pts · 4º=14pts · 5º–8º=10pts · 9º–16º=8pts · 17º–24º=6pts · 25º–32º=4pts
            </p>
          </div>
        </motion.section>
      )}

      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="rounded-xl border border-border bg-card p-6 shadow-card"
      >
        <h2 className="mb-4 text-xl font-semibold">Classificação Geral</h2>

        {sortedRankings.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            Nenhum atleta no ranking ainda.
          </p>
        ) : (
          <>
            <div className="flex justify-end mb-3">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-1">
                    <Download className="h-4 w-4" /> Exportar
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuItem onClick={() => {
                    const rows = sortedRankings.map((r, i) => ({ position: i + 1, athlete_name: r.athlete_name, points: r.points }));
                    exportRankings("pdf", rows, { tournamentName, sport, date: eventDate });
                  }}>
                    <FileText className="h-4 w-4 mr-2" /> PDF
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => {
                    const rows = sortedRankings.map((r, i) => ({ position: i + 1, athlete_name: r.athlete_name, points: r.points }));
                    exportRankings("xlsx", rows, { tournamentName, sport, date: eventDate });
                  }}>
                    <Sheet className="h-4 w-4 mr-2" /> Excel (.xlsx)
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => {
                    const rows = sortedRankings.map((r, i) => ({ position: i + 1, athlete_name: r.athlete_name, points: r.points }));
                    exportRankings("csv", rows, { tournamentName, sport, date: eventDate });
                  }}>
                    <FileText className="h-4 w-4 mr-2" /> CSV
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            <div className="space-y-2">
              {sortedRankings.map((ranking, idx) => (
                <motion.div
                  key={ranking.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: idx * 0.05 }}
                  className="flex items-center justify-between rounded-lg border border-border bg-secondary/50 px-4 py-3 hover:border-primary/40 transition-colors"
                >
                  <div className="flex items-center gap-4 flex-1">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-primary text-sm font-bold text-primary-foreground">
                      {idx + 1}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate team-name">{ranking.athlete_name}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    {editingId === ranking.id ? (
                      <div className="flex items-center gap-1">
                        <Input
                          type="number"
                          value={editPoints}
                          onChange={(e) => setEditPoints(e.target.value)}
                          className="h-8 w-20 text-center text-sm"
                          min="0"
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === "Enter") updatePoints(ranking.id, Number(editPoints) || 0);
                            if (e.key === "Escape") setEditingId(null);
                          }}
                        />
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => updatePoints(ranking.id, Number(editPoints) || 0)}>
                          <Check className="h-4 w-4 text-success" />
                        </Button>
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setEditingId(null)}>
                          <X className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    ) : (
                      <Badge variant="secondary" className="text-base font-bold tabular-nums">
                        {ranking.points} pts
                      </Badge>
                    )}

                    {isOwner && editingId !== ranking.id && (
                      <div className="flex gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => { setEditingId(ranking.id); setEditPoints(String(ranking.points)); }}
                          className="h-8 w-8 p-0"
                        >
                          <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => deleteRanking(ranking.id)}
                          className="h-8 w-8 p-0"
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    )}
                  </div>
                </motion.div>
              ))}
            </div>
          </>
        )}
      </motion.section>

      {sortedRankings.length > 0 && (
        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="rounded-xl border border-border bg-gradient-to-b from-primary/10 to-transparent p-6"
        >
          <h3 className="mb-4 text-lg font-semibold">Pódio</h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {sortedRankings[1] && (
              <div className="flex flex-col items-center rounded-lg border border-border bg-card p-4 shadow-card order-first sm:order-none">
                <div className="mb-2 text-3xl font-bold text-secondary">🥈</div>
                <p className="text-sm text-center truncate team-name">{sortedRankings[1].athlete_name}</p>
                <p className="text-lg font-bold text-primary">{sortedRankings[1].points} pts</p>
              </div>
            )}
            {sortedRankings[0] && (
              <div className="flex flex-col items-center rounded-lg border-2 border-primary bg-gradient-primary p-4 shadow-lg order-none sm:order-first">
                <div className="mb-2 text-4xl font-bold">🥇</div>
                <p className="text-sm text-center truncate team-name">{sortedRankings[0].athlete_name}</p>
                <p className="text-xl font-bold text-primary-foreground">{sortedRankings[0].points} pts</p>
              </div>
            )}
            {sortedRankings[2] && (
              <div className="flex flex-col items-center rounded-lg border border-border bg-card p-4 shadow-card order-last">
                <div className="mb-2 text-3xl font-bold text-muted">🥉</div>
                <p className="text-sm text-center truncate team-name">{sortedRankings[2].athlete_name}</p>
                <p className="text-lg font-bold text-primary">{sortedRankings[2].points} pts</p>
              </div>
            )}
          </div>
        </motion.section>
      )}
    </div>
  );
};

export default RankingsTab;
