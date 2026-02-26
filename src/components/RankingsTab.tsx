import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { organizerQuery, publicQuery } from "@/lib/organizerApi";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Plus, Trash2, TrendingUp, Download, FileText, Sheet, Pencil, Check, X, Zap, Users, User, Star, Heart, Award, History, ChevronDown, ChevronUp } from "lucide-react";
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
  entry_type: string;
  badge: string | null;
}

interface PointsHistoryEntry {
  id: string;
  ranking_id: string;
  athlete_name: string;
  points_added: number;
  badge: string | null;
  reason: string | null;
  created_at: string;
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
  modalityName?: string;
}

const RankingsTab = ({ tournamentId, isOwner, sport, tournamentName = "", eventDate, modalityId, modalityName }: RankingsTabProps) => {
  const { user, organizerId } = useAuth();
  const [rankings, setRankings] = useState<RankingEntry[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedAthlete, setSelectedAthlete] = useState("");
  const [points, setPoints] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editPoints, setEditPoints] = useState("");
  const [editBadge, setEditBadge] = useState<string | null>(null);

  const BADGE_OPTIONS = [
    { value: "", label: "Nenhum", icon: null },
    { value: "destaque", label: "Destaque", icon: <Star className="h-4 w-4 text-amber-400" /> },
    { value: "doacao", label: "Doação de Alimentos", icon: <Heart className="h-4 w-4 text-rose-400" /> },
    { value: "mvp", label: "MVP", icon: <Award className="h-4 w-4 text-sky-400" /> },
  ];

  const getBadgeIcon = (badge: string | null) => {
    if (!badge) return null;
    if (badge === "destaque") return <Star className="h-4 w-4 text-amber-400 shrink-0" />;
    if (badge === "doacao") return <Heart className="h-4 w-4 text-rose-400 shrink-0" />;
    if (badge === "mvp") return <Award className="h-4 w-4 text-sky-400 shrink-0" />;
    return null;
  };

  const getBadgeLabel = (badge: string | null) => {
    if (!badge) return null;
    if (badge === "destaque") return "Destaque";
    if (badge === "doacao") return "Doação de Alimentos";
    if (badge === "mvp") return "MVP";
    return null;
  };
  const [viewFilter, setViewFilter] = useState<"all" | "individual" | "pair" | "male" | "female">("individual");
  const [pointsHistory, setPointsHistory] = useState<PointsHistoryEntry[]>([]);
  const [expandedHistoryId, setExpandedHistoryId] = useState<string | null>(null);

  const fetchRankings = async () => {
    const filters: Record<string, any> = { tournament_id: tournamentId };
    if (modalityId) filters.modality_id = modalityId;

    const { data, error } = await publicQuery<RankingEntry[]>({
      table: "rankings",
      filters,
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

  const fetchHistory = async () => {
    const { data } = await publicQuery<PointsHistoryEntry[]>({
      table: "ranking_points_history",
      filters: { tournament_id: tournamentId, ...(modalityId ? { modality_id: modalityId } : {}) },
      order: { column: "created_at", ascending: false },
    });
    setPointsHistory(data || []);
  };

  useEffect(() => {
    setViewFilter("individual");
    fetchRankings();
    fetchTeams();
    fetchHistory();

    const channel = supabase
      .channel(`rankings-${tournamentId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "rankings", filter: `tournament_id=eq.${tournamentId}` }, () => { fetchRankings(); fetchHistory(); })
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
        entry_type: selectedAthlete.includes(" / ") ? "pair" : "individual",
        ...(modalityId ? { modality_id: modalityId } : {}),
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

  const updatePoints = async (id: string, newPoints: number, badge: string | null) => {
    if (newPoints < 0) {
      toast.error("Pontos não podem ser negativos");
      return;
    }

    const currentRanking = rankings.find((r) => r.id === id);
    const oldPoints = currentRanking?.points || 0;
    const pointsDiff = newPoints - oldPoints;

    const { error } = await organizerQuery({ table: "rankings", operation: "update", data: { points: newPoints, badge: badge || null }, filters: { id } });

    if (error) {
      toast.error("Erro ao atualizar pontos");
    } else {
      // Log history entry if points changed
      if (pointsDiff !== 0 && currentRanking) {
        const createdBy = organizerId || user?.id || "";
        await organizerQuery({
          table: "ranking_points_history",
          operation: "insert",
          data: {
            ranking_id: id,
            athlete_name: currentRanking.athlete_name,
            points_added: pointsDiff,
            badge: badge || null,
            tournament_id: tournamentId,
            ...(modalityId ? { modality_id: modalityId } : {}),
            created_by: createdBy,
          },
        });
      }
      setEditingId(null);
      fetchRankings();
      fetchHistory();
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
      const winnersMatches = matchesData.filter((m: any) => m.round >= 1 && m.bracket_type === "winners");
      const thirdPlaceMatches = matchesData.filter((m: any) => m.round >= 1 && m.bracket_type === "third_place");
      const groupMatches = matchesData.filter((m: any) => m.round === 0);

      if (winnersMatches.length === 0) {
        toast.error("Nenhuma fase eliminatória encontrada");
        setGenerating(false);
        return;
      }

      const maxRound = Math.max(...winnersMatches.map((m: any) => m.round));
      const ranked: { teamId: string; position: number }[] = [];
      const placedTeams = new Set<string>();

      // Final — 1st and 2nd
      const finalMatches = winnersMatches.filter((m: any) => m.round === maxRound && m.status === "completed");
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

      // 3rd place match — use actual result if completed
      const completedThirdPlace = thirdPlaceMatches.filter((m: any) => m.status === "completed" && m.winner_team_id);
      if (completedThirdPlace.length > 0) {
        completedThirdPlace.forEach((m: any) => {
          if (m.winner_team_id && !placedTeams.has(m.winner_team_id)) {
            ranked.push({ teamId: m.winner_team_id, position: ranked.length + 1 });
            placedTeams.add(m.winner_team_id);
          }
          const loserId = m.team1_id === m.winner_team_id ? m.team2_id : m.team1_id;
          if (loserId && !placedTeams.has(loserId)) {
            ranked.push({ teamId: loserId, position: ranked.length + 1 });
            placedTeams.add(loserId);
          }
        });
      }

      // Walk backward through remaining rounds for unplaced losers
      for (let round = maxRound - 1; round >= 1; round--) {
        const roundMatches = winnersMatches.filter((m: any) => m.round === round && m.status === "completed");
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
      // First delete existing rankings for this tournament + modality
      const delFilters: Record<string, any> = { tournament_id: tournamentId };
      if (modalityId) delFilters.modality_id = modalityId;

      const { data: existingRankings } = await publicQuery<any[]>({
        table: "rankings",
        filters: delFilters,
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
        const isMisto = modalityName?.toLowerCase().includes("misto");
        
        // For Misto: detect gender by name patterns instead of assuming player1=male
        const detectGender = (name: string): "male" | "female" => {
          const first = name.trim().split(/\s+/)[0].toLowerCase();
          // Common feminine endings in Portuguese
          if (/^(ana|ane|aline|adriane|andressa|bianca|camila|carina|cláudia|claudia|danielly|deisi|dejanira|eduarda|elisandra|francieli|gabrielle|gabrielly|helen|helena|isadora|jaqueline|jessica|joana|julia|juliana|keyla|kethelin|laura|lillian|luana|luiza|maria|mariana|manoella|michele|nicoly|nicole|olga|paola|patrícia|rafaela|raquel|roshane|sabrina|samira|scheila|sheila|stefany|taicline|tauane|thais|vanessa|veronica|veronilce)$/i.test(first)) {
            return "female";
          }
          // Common feminine name endings
          if (/[aeiã]$/.test(first) && !/^(davi|edu|kairã|timóteo|simeão|juliano|mário|eydrian|halan|márcio|allyson|wallace|vinicius|leonardo|lucas|leandro|guilherme|pedro|arthur|renan|felipe|fernando|rafael|gabriel|luis|oswaldo|pietro|ian|daniel|joão|vitor|carlos|dirceu|silmar|dilamar)$/i.test(first)) {
            return "female";
          }
          return "male";
        };

        const p1Gender = isMisto ? detectGender(team.player1_name) : "individual" as any;
        const p2Gender = isMisto ? (p1Gender === "male" ? "female" : "male") : "individual" as any;

        const entries = [
          { name: team.player1_name, type: isMisto ? p1Gender : "individual" },
          { name: team.player2_name, type: isMisto ? p2Gender : "individual" },
          { name: `${team.player1_name} / ${team.player2_name}`, type: "pair" },
        ];
        for (const e of entries) {
          await organizerQuery({
            table: "rankings",
            operation: "insert",
            data: {
              athlete_name: e.name,
              points: pts,
              sport: sport as any,
              tournament_id: tournamentId,
              created_by: createdBy,
              entry_type: e.type,
              ...(modalityId ? { modality_id: modalityId } : {}),
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

  const isMisto = modalityName?.toLowerCase().includes("misto");

  const sortedRankings = useMemo(() => {
    let filtered = [...rankings];
    if (viewFilter === "individual") {
      filtered = filtered.filter((r) => r.entry_type !== "pair");
    } else if (viewFilter === "pair") {
      filtered = filtered.filter((r) => r.entry_type === "pair");
    } else if (viewFilter === "male") {
      filtered = filtered.filter((r) => r.entry_type === "male");
    } else if (viewFilter === "female") {
      filtered = filtered.filter((r) => r.entry_type === "female");
    }
    return filtered.sort((a, b) => b.points - a.points);
  }, [rankings, viewFilter]);

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
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-4">
          <h2 className="text-xl font-semibold">
            Classificação Geral{modalityName ? ` — ${modalityName}` : ""}
          </h2>
          <div className="flex flex-wrap gap-1.5 rounded-lg border border-border p-1 bg-secondary/30">
            {isMisto ? (
              <>
                <Button
                  size="sm"
                  variant={viewFilter === "male" ? "default" : "ghost"}
                  onClick={() => setViewFilter("male")}
                  className="h-8 text-xs px-4 gap-1.5 rounded-md"
                >
                  <User className="h-3.5 w-3.5" /> Masculino
                </Button>
                <Button
                  size="sm"
                  variant={viewFilter === "female" ? "default" : "ghost"}
                  onClick={() => setViewFilter("female")}
                  className="h-8 text-xs px-4 gap-1.5 rounded-md"
                >
                  <User className="h-3.5 w-3.5" /> Feminino
                </Button>
              </>
            ) : (
              <Button
                size="sm"
                variant={viewFilter === "individual" ? "default" : "ghost"}
                onClick={() => setViewFilter("individual")}
                className="h-8 text-xs px-4 gap-1.5 rounded-md"
              >
                <User className="h-3.5 w-3.5" /> Individual
              </Button>
            )}
            <Button
              size="sm"
              variant={viewFilter === "pair" ? "default" : "ghost"}
              onClick={() => setViewFilter("pair")}
              className="h-8 text-xs px-4 gap-1.5 rounded-md"
            >
              <Users className="h-3.5 w-3.5" /> Dupla
            </Button>
          </div>
        </div>

        {/* Removed "Todos" split view - now using Individual/Dupla filters only */}

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
                  transition={{ delay: Math.min(idx * 0.03, 0.5) }}
                  className="rounded-xl border border-border bg-secondary/50 px-4 py-3 hover:border-primary/40 transition-colors"
                >
                  <div className="flex items-start gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-primary text-sm font-bold text-primary-foreground mt-0.5">
                      {idx + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className="text-sm font-black leading-snug break-words" style={{ color: '#F5F7FA', textShadow: '0 1px 2px rgba(0,0,0,0.5)' }}>
                          {ranking.athlete_name}
                        </p>
                        {getBadgeIcon(ranking.badge)}
                      </div>
                      {ranking.badge && (
                        <span className="text-[10px] text-muted-foreground">{getBadgeLabel(ranking.badge)}</span>
                      )}
                      <div className="flex items-center justify-between mt-1.5">
                        <Badge variant="secondary" className="text-xs font-bold tabular-nums whitespace-nowrap">
                          {ranking.points} pts
                        </Badge>
                        {editingId === ranking.id ? (
                          <div className="flex flex-col gap-1.5">
                            <div className="flex items-center gap-1">
                              <Input
                                type="number"
                                value={editPoints}
                                onChange={(e) => setEditPoints(e.target.value)}
                                className="h-7 w-16 text-center text-xs"
                                min="0"
                                autoFocus
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") updatePoints(ranking.id, Number(editPoints) || 0, editBadge);
                                  if (e.key === "Escape") setEditingId(null);
                                }}
                              />
                              <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => updatePoints(ranking.id, Number(editPoints) || 0, editBadge)}>
                                <Check className="h-4 w-4 text-success" />
                              </Button>
                              <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setEditingId(null)}>
                                <X className="h-4 w-4 text-destructive" />
                              </Button>
                            </div>
                            <Select value={editBadge || "__none"} onValueChange={(v) => setEditBadge(v === "__none" ? null : v)}>
                              <SelectTrigger className="h-7 text-xs">
                                <SelectValue placeholder="Ícone (opcional)" />
                              </SelectTrigger>
                              <SelectContent>
                                {BADGE_OPTIONS.map((opt) => (
                                  <SelectItem key={opt.value} value={opt.value || "__none"}>
                                    <span className="flex items-center gap-2">
                                      {opt.icon} {opt.label}
                                    </span>
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        ) : isOwner ? (
                          <div className="flex gap-1">
                            <Button size="sm" variant="ghost" onClick={() => { setEditingId(ranking.id); setEditPoints(String(ranking.points)); setEditBadge(ranking.badge || null); }} className="h-7 w-7 p-0">
                              <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => deleteRanking(ranking.id)} className="h-7 w-7 p-0">
                              <Trash2 className="h-3.5 w-3.5 text-destructive" />
                            </Button>
                          </div>
                        ) : null}
                      </div>
                      {/* History toggle */}
                      {(() => {
                        const athleteHistory = pointsHistory.filter((h) => h.ranking_id === ranking.id);
                        if (athleteHistory.length === 0) return null;
                        const isExpanded = expandedHistoryId === ranking.id;
                        return (
                          <div className="mt-2">
                            <button
                              onClick={() => setExpandedHistoryId(isExpanded ? null : ranking.id)}
                              className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
                            >
                              <History className="h-3 w-3" />
                              Histórico ({athleteHistory.length})
                              {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                            </button>
                            {isExpanded && (
                              <div className="mt-1.5 space-y-1 pl-1 border-l-2 border-border ml-1">
                                {athleteHistory.map((h) => (
                                  <div key={h.id} className="flex items-center gap-2 text-[11px] py-0.5 pl-2">
                                    {getBadgeIcon(h.badge)}
                                    <span className={h.points_added >= 0 ? "text-emerald-400 font-bold" : "text-destructive font-bold"}>
                                      {h.points_added >= 0 ? `+${h.points_added}` : h.points_added} pts
                                    </span>
                                    {h.badge && (
                                      <span className="text-muted-foreground">
                                        — {getBadgeLabel(h.badge)}
                                      </span>
                                    )}
                                    {!h.badge && (
                                      <span className="text-muted-foreground">— Classificação</span>
                                    )}
                                    <span className="text-muted-foreground/60 ml-auto text-[10px]">
                                      {new Date(h.created_at).toLocaleDateString("pt-BR")}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </>
        )}
      </motion.section>

    </div>
  );
};

export default RankingsTab;
