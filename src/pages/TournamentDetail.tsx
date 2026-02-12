import { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useSportTheme } from "@/contexts/SportContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { Plus, Trash2, Trophy, Users, Shuffle, Copy, Pencil, Check, X, ArrowLeft, Undo2 } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import AppHeader from "@/components/AppHeader";
import ThemedBackground from "@/components/ThemedBackground";
import BracketView from "@/components/BracketView";
import BracketTreeView from "@/components/BracketTreeView";
import { GenerateBracketDialog } from "@/components/GenerateBracketDialog";
import RankingsTab from "@/components/RankingsTab";
import MatchSequenceTab from "@/components/MatchSequenceTab";
import { rankTeamsInGroup, selectIndexTeams } from "@/lib/tiebreakLogic";
import confetti from "canvas-confetti";

const sportLabels: Record<string, string> = {
  beach_volleyball: "🏐 Vôlei de Praia",
  futevolei: "⚽ Futevôlei",
  beach_tennis: "🎾 Beach Tennis",
};

const statusLabels: Record<string, string> = {
  draft: "Rascunho",
  registration: "Inscrições",
  in_progress: "Em andamento",
  completed: "Finalizado",
  cancelled: "Cancelado",
};

const statusColors: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  registration: "bg-primary/20 text-primary",
  in_progress: "bg-warning/20 text-warning",
  completed: "bg-success/20 text-success",
  cancelled: "bg-destructive/20 text-destructive",
};

interface Team {
  id: string;
  tournament_id: string;
  player1_name: string;
  player2_name: string;
  seed: number | null;
  is_fictitious: boolean;
  payment_status: string;
}

interface Match {
  id: string;
  tournament_id: string;
  round: number;
  position: number;
  participant1_id: string | null;
  participant2_id: string | null;
  score1: number | null;
  score2: number | null;
  winner_id: string | null;
  status: string;
  team1_id: string | null;
  team2_id: string | null;
  winner_team_id: string | null;
  bracket_number: number;
}

const TournamentDetail = () => {
  const { id } = useParams<{ id: string }>();
  const { user, organizerId } = useAuth();
  const navigate = useNavigate();
  const { setSelectedSport } = useSportTheme();
  const [tournament, setTournament] = useState<any>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [player1, setPlayer1] = useState("");
  const [player2, setPlayer2] = useState("");
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<"list" | "tree">("tree");
  const [editingTeamId, setEditingTeamId] = useState<string | null>(null);
  const [editP1, setEditP1] = useState("");
  const [editP2, setEditP2] = useState("");
  const [fictitiousCount, setFictitiousCount] = useState("4");
  const [fictitiousDialogOpen, setFictitiousDialogOpen] = useState(false);

  const isOwner = tournament?.created_by === organizerId;

  const fetchData = useCallback(async () => {
    if (!id) return;
    const [tRes, teamsRes, mRes] = await Promise.all([
      supabase.from("tournaments").select("*").eq("id", id).single(),
      supabase.from("teams").select("*").eq("tournament_id", id).order("seed"),
      supabase.from("matches").select("*").eq("tournament_id", id).order("round").order("position"),
    ]);
    if (tRes.data) {
      setTournament(tRes.data);
      setSelectedSport(tRes.data.sport);
    }
    if (teamsRes.data) setTeams(teamsRes.data);
    if (mRes.data) setMatches(mRes.data);
    setLoading(false);
  }, [id, setSelectedSport]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Real-time subscriptions for matches, teams, rankings
  useEffect(() => {
    if (!id) return;
    const channel = supabase
      .channel(`tournament-rt-${id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "matches", filter: `tournament_id=eq.${id}` }, () => fetchData())
      .on("postgres_changes", { event: "*", schema: "public", table: "teams", filter: `tournament_id=eq.${id}` }, () => fetchData())
      .on("postgres_changes", { event: "*", schema: "public", table: "tournaments" }, (payload) => {
        if ((payload.new as any)?.id === id) fetchData();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [id, fetchData]);

  const addTeam = async () => {
    if (!player1.trim() || !player2.trim() || !id) return;
    const { error } = await supabase.from("teams").insert({
      tournament_id: id,
      player1_name: player1.trim(),
      player2_name: player2.trim(),
      seed: teams.length + 1,
    });
    if (error) { toast.error(error.message); return; }
    setPlayer1("");
    setPlayer2("");
    fetchData();
  };

  const addFictitiousTeams = async () => {
    if (!id) return;
    const count = Number(fictitiousCount);
    if (count < 1 || count > 64) { toast.error("Quantidade inválida"); return; }
    const newTeams = [];
    for (let i = 0; i < count; i++) {
      const num = teams.length + i + 1;
      newTeams.push({
        tournament_id: id,
        player1_name: `Jogador ${num}A`,
        player2_name: `Jogador ${num}B`,
        seed: num,
        is_fictitious: true,
      });
    }
    const { error } = await supabase.from("teams").insert(newTeams);
    if (error) { toast.error(error.message); return; }
    toast.success(`${count} dupla(s) fictícia(s) criada(s)!`);
    setFictitiousDialogOpen(false);
    fetchData();
  };

  const removeTeam = async (tid: string) => {
    await supabase.from("teams").delete().eq("id", tid);
    fetchData();
  };

  const startEdit = (team: Team) => {
    setEditingTeamId(team.id);
    setEditP1(team.player1_name);
    setEditP2(team.player2_name);
  };

  const saveEdit = async () => {
    if (!editingTeamId || !editP1.trim() || !editP2.trim()) return;
    await supabase.from("teams").update({
      player1_name: editP1.trim(),
      player2_name: editP2.trim(),
    }).eq("id", editingTeamId);
    setEditingTeamId(null);
    toast.success("Dupla atualizada!");
    fetchData();
  };

  const cancelEdit = () => { setEditingTeamId(null); };

  const shuffleTeams = async () => {
    if (!id) return;
    const shuffled = [...teams].sort(() => Math.random() - 0.5);
    for (let i = 0; i < shuffled.length; i++) {
      await supabase.from("teams").update({ seed: i + 1 }).eq("id", shuffled[i].id);
    }
    toast.success("Duplas embaralhadas!");
    fetchData();
  };

  const generateBracket = async (config: {
    startRound: number;
    useSeeds: boolean;
    numSets: number;
    gamesPerSet?: number;
    seedTeamIds?: string[];
    useGroupStage: boolean;
    numGroups: number;
    teamsPerGroupAdvancing: number;
    byeTeamIds: string[];
    useIndex: boolean;
    numIndexTeams?: number;
  }) => {

    await supabase.from("matches").delete().eq("tournament_id", id);

    await supabase.from("tournaments").update({
      num_sets: config.numSets,
      games_per_set: config.gamesPerSet || null,
    }).eq("id", id);

    if (config.useGroupStage) {
      // === GROUP STAGE ===
      const nonByeTeams = teams.filter(t => !config.byeTeamIds.includes(t.id));
      let arranged = [...nonByeTeams];
      if (config.useSeeds && config.seedTeamIds && config.seedTeamIds.length > 0) {
        const seeds = arranged.filter(t => config.seedTeamIds!.includes(t.id));
        const nonSeeds = arranged.filter(t => !config.seedTeamIds!.includes(t.id)).sort(() => Math.random() - 0.5);
        arranged = [...seeds, ...nonSeeds];
      } else {
        arranged.sort(() => Math.random() - 0.5);
      }

      // Distribute teams into groups
      const groups: typeof arranged[] = Array.from({ length: config.numGroups }, () => []);
      arranged.forEach((team, i) => {
        groups[i % config.numGroups].push(team);
      });

      const newMatches: any[] = [];

      // Create round-robin matches for each group
      for (let g = 0; g < groups.length; g++) {
        const groupTeams = groups[g];
        let pos = 1;
        for (let i = 0; i < groupTeams.length; i++) {
          for (let j = i + 1; j < groupTeams.length; j++) {
            newMatches.push({
              tournament_id: id,
              round: 0, // Round 0 = group stage
              position: pos++,
              team1_id: groupTeams[i].id,
              team2_id: groupTeams[j].id,
              status: "pending" as const,
              bracket_number: g + 1, // bracket_number = group number
            });
          }
        }
      }

      const { error } = await supabase.from("matches").insert(newMatches);
      if (error) { toast.error(error.message); return; }

      await supabase.from("tournaments").update({ status: "in_progress" as const }).eq("id", id);
      
      // Store index advancement configuration for later use
      if (config.useIndex && config.numIndexTeams && config.numIndexTeams > 0) {
        await supabase.from("tournaments").update({
          num_brackets: config.numIndexTeams,
        }).eq("id", id);
      }
      
      toast.success(`Fase de grupos gerada! ${config.numGroups} grupo(s) criado(s)${config.useIndex ? ` + ${config.numIndexTeams} índice` : ""}.`);
      fetchData();
    } else {
      // === DIRECT KNOCKOUT (existing logic) ===
      const totalSlots = Math.pow(2, Math.ceil(Math.log2(teams.length)));
      const maxRounds = Math.ceil(Math.log2(totalSlots));

      let arranged = [...teams];
      if (config.useSeeds && config.seedTeamIds && config.seedTeamIds.length > 0) {
        const seeds = arranged.filter(t => config.seedTeamIds!.includes(t.id));
        const nonSeeds = arranged.filter(t => !config.seedTeamIds!.includes(t.id)).sort(() => Math.random() - 0.5);
        arranged = [...seeds, ...nonSeeds];
      } else if (config.useSeeds) {
        arranged.sort((a, b) => (a.seed || 0) - (b.seed || 0));
      } else {
        arranged.sort(() => Math.random() - 0.5);
      }

      const newMatches: any[] = [];
      const matchesInFirstRound = totalSlots / 2;
      for (let i = 0; i < matchesInFirstRound; i++) {
        const t1 = arranged[i] || null;
        const t2 = arranged[totalSlots - 1 - i] || null;
        newMatches.push({
          tournament_id: id,
          round: config.startRound,
          position: i + 1,
          team1_id: t1?.id || null,
          team2_id: t2?.id || null,
          status: "pending" as const,
        });
      }

      for (let r = config.startRound + 1; r <= maxRounds; r++) {
        const count = totalSlots / Math.pow(2, r);
        for (let p = 0; p < count; p++) {
          newMatches.push({
            tournament_id: id,
            round: r,
            position: p + 1,
            team1_id: null,
            team2_id: null,
            status: "pending" as const,
          });
        }
      }

      // Auto-advance byes
      for (const m of newMatches) {
        if (m.team1_id && !m.team2_id) {
          m.winner_team_id = m.team1_id;
          m.status = "completed";
        } else if (!m.team1_id && m.team2_id) {
          m.winner_team_id = m.team2_id;
          m.status = "completed";
        }
      }

      const { error } = await supabase.from("matches").insert(newMatches);
      if (error) { toast.error(error.message); return; }

      // Advance bye winners to next round
      const inserted = await supabase.from("matches").select("*").eq("tournament_id", id).order("round").order("position");
      if (inserted.data) {
        for (const m of inserted.data) {
          if (m.winner_team_id && m.status === "completed") {
            const nextRound = m.round + 1;
            const nextPosition = Math.ceil(m.position / 2);
            const isTop = m.position % 2 === 1;
            const nextMatch = inserted.data.find(
              (nm: any) => nm.round === nextRound && nm.position === nextPosition
            );
            if (nextMatch) {
              const update = isTop ? { team1_id: m.winner_team_id } : { team2_id: m.winner_team_id };
              await supabase.from("matches").update(update).eq("id", nextMatch.id);
            }
          }
        }
      }

      await supabase.from("tournaments").update({ status: "in_progress" as const }).eq("id", id);
      toast.success("Chaveamento gerado!");
      fetchData();
    }
  };

  const undoBracket = async () => {
    if (!id) return;
    await supabase.from("matches").delete().eq("tournament_id", id);
    await supabase.from("tournaments").update({ status: "draft" as const }).eq("id", id);
    toast.success("Chaveamento desfeito!");
    fetchData();
  };

  const declareWinner = async (matchId: string, winnerId: string) => {
    const match = matches.find((m) => m.id === matchId);
    if (!match || !id) return;

    confetti({ particleCount: 50, spread: 60, origin: { y: 0.6 } });

    await supabase.from("matches").update({
      winner_team_id: winnerId,
      status: "completed" as const,
    }).eq("id", matchId);

    const nextRound = match.round + 1;
    const nextPosition = Math.ceil(match.position / 2);
    const isTop = match.position % 2 === 1;
    const bracket_number = match.bracket_number || 1;

    const nextMatch = matches.find(
      (m) => m.round === nextRound && m.position === nextPosition && (m.bracket_number || 1) === bracket_number
    );

    if (nextMatch) {
      const update = isTop ? { team1_id: winnerId } : { team2_id: winnerId };
      await supabase.from("matches").update(update).eq("id", nextMatch.id);
      toast.success("Avanço automático realizado!");
    } else {
      await supabase.from("tournaments").update({ status: "completed" as const }).eq("id", id);
      toast.success("Torneio finalizado! 🏆");
      setTimeout(() => {
        for (let i = 0; i < 3; i++) {
          setTimeout(() => {
            confetti({ particleCount: 100, spread: 70, origin: { y: 0.5, x: Math.random() } });
          }, i * 300);
        }
      }, 500);
    }
    fetchData();
  };

  const updateScore = async (matchId: string, score1: number, score2: number) => {
    await supabase.from("matches").update({ score1, score2 }).eq("id", matchId);
  };

  const copyCode = () => {
    if (tournament?.tournament_code) {
      navigator.clipboard.writeText(tournament.tournament_code);
      toast.success("Código copiado!");
    }
  };

  if (loading) {
    return (
      <ThemedBackground>
        <AppHeader />
        <div className="flex justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      </ThemedBackground>
    );
  }

  if (!tournament) {
    return (
      <ThemedBackground>
        <AppHeader />
        <div className="container py-20 text-center">
          <p className="text-muted-foreground">Torneio não encontrado.</p>
          <Button variant="ghost" onClick={() => navigate("/dashboard")} className="mt-4">Voltar ao Painel</Button>
        </div>
      </ThemedBackground>
    );
  }

  const participants = teams.map((t) => ({
    id: t.id,
    name: `${t.player1_name} / ${t.player2_name}`,
    seed: t.seed,
  }));

  return (
    <ThemedBackground>
      <AppHeader />
      <main className="container py-8">
        <Button variant="ghost" onClick={() => navigate("/dashboard")} className="mb-4 gap-2">
          <ArrowLeft className="h-4 w-4" /> Voltar
        </Button>
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
          {/* Header */}
          <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-3xl font-bold tracking-tight">{tournament.name}</h1>
                <Badge className={statusColors[tournament.status] || ""}>
                  {statusLabels[tournament.status] || tournament.status}
                </Badge>
              </div>
              {tournament.description && (
                <p className="mt-2 text-muted-foreground">{tournament.description}</p>
              )}
              <div className="mt-2 flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
                <span>{sportLabels[tournament.sport] || tournament.sport}</span>
                {tournament.category && <span>• {tournament.category}</span>}
                <span className="flex items-center gap-1">
                  <Users className="h-4 w-4" />
                  {teams.length} duplas
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {tournament.tournament_code && (
                <button
                  onClick={copyCode}
                  className="rounded-lg bg-card border border-border px-4 py-2 text-center hover:border-primary/40 transition-colors"
                >
                  <p className="text-xs text-muted-foreground">Código</p>
                  <p className="text-xl font-mono font-bold tracking-[0.3em] text-primary">{tournament.tournament_code}</p>
                </button>
              )}
            </div>
          </div>

          {/* All tabs always visible */}
          <Tabs defaultValue="teams" className="w-full">
            <TabsList className="mb-4 flex-wrap">
              <TabsTrigger value="teams">Duplas</TabsTrigger>
              <TabsTrigger value="bracket">Chaveamento</TabsTrigger>
              <TabsTrigger value="sequence">Sequência</TabsTrigger>
              <TabsTrigger value="classification">Classificação</TabsTrigger>
              <TabsTrigger value="rankings">Ranking</TabsTrigger>
            </TabsList>

            {/* Duplas Tab - always shows team list */}
            <TabsContent value="teams">
              {isOwner && (
                <section className="rounded-xl border border-border bg-card p-6 shadow-card">
                  <h2 className="mb-4 text-xl font-semibold">Cadastrar Dupla</h2>
                  <div className="mb-4 flex flex-col gap-2 sm:flex-row">
                    <Input
                      value={player1}
                      onChange={(e) => setPlayer1(e.target.value)}
                      placeholder="Nome do Jogador 1"
                      onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addTeam())}
                    />
                    <Input
                      value={player2}
                      onChange={(e) => setPlayer2(e.target.value)}
                      placeholder="Nome do Jogador 2"
                      onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addTeam())}
                    />
                    <Button onClick={addTeam} size="sm" className="gap-1 shrink-0">
                      <Plus className="h-4 w-4" /> Adicionar
                    </Button>
                  </div>
                  <div className="flex gap-2 mb-4">
                    <Dialog open={fictitiousDialogOpen} onOpenChange={setFictitiousDialogOpen}>
                      <DialogTrigger asChild>
                        <Button variant="outline" size="sm" className="gap-1">
                          <Plus className="h-4 w-4" /> Duplas Fictícias
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="sm:max-w-sm">
                        <DialogHeader>
                          <DialogTitle>Criar Duplas Fictícias</DialogTitle>
                        </DialogHeader>
                        <div className="space-y-4 py-4">
                          <div className="space-y-2">
                            <label className="text-sm font-medium">Quantas duplas fictícias?</label>
                            <Input
                              type="number"
                              min={1}
                              max={64}
                              value={fictitiousCount}
                              onChange={(e) => setFictitiousCount(e.target.value)}
                            />
                          </div>
                          <Button onClick={addFictitiousTeams} className="w-full bg-gradient-primary text-primary-foreground hover:opacity-90">
                            Criar {fictitiousCount} dupla(s)
                          </Button>
                        </div>
                      </DialogContent>
                    </Dialog>
                    {teams.length >= 2 && (
                      <Button variant="outline" size="sm" onClick={shuffleTeams} className="gap-1">
                        <Shuffle className="h-4 w-4" /> Embaralhar
                      </Button>
                    )}
                  </div>
                </section>
              )}

              {/* Team list always visible */}
              {teams.length === 0 ? (
                <p className="text-sm text-muted-foreground mt-4">Nenhuma dupla cadastrada.</p>
              ) : (
                <section className="mt-4 rounded-xl border border-border bg-card p-6 shadow-card">
                  <h2 className="mb-4 text-xl font-semibold">Duplas ({teams.length})</h2>
                  <div className="space-y-2">
                    {teams.map((t, i) => (
                      <div key={t.id} className="flex items-center justify-between rounded-lg border border-border bg-secondary/50 px-4 py-2">
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-muted text-xs font-bold text-muted-foreground shrink-0">
                            {i + 1}
                          </span>
                          {editingTeamId === t.id ? (
                            <div className="flex items-center gap-2 flex-1">
                              <Input value={editP1} onChange={(e) => setEditP1(e.target.value)} className="h-8 text-sm" placeholder="Jogador 1" />
                              <Input value={editP2} onChange={(e) => setEditP2(e.target.value)} className="h-8 text-sm" placeholder="Jogador 2" />
                              <Button variant="ghost" size="sm" onClick={saveEdit} className="h-7 w-7 p-0">
                                <Check className="h-4 w-4 text-success" />
                              </Button>
                              <Button variant="ghost" size="sm" onClick={cancelEdit} className="h-7 w-7 p-0">
                                <X className="h-4 w-4 text-destructive" />
                              </Button>
                            </div>
                          ) : (
                            <span className="font-medium truncate">
                              {t.player1_name} / {t.player2_name}
                              {t.is_fictitious && <span className="ml-2 text-xs text-muted-foreground">(fictícia)</span>}
                            </span>
                          )}
                        </div>
                        {isOwner && editingTeamId !== t.id && (
                          <div className="flex items-center gap-1 shrink-0">
                            <Button variant="ghost" size="sm" onClick={() => startEdit(t)} className="h-7 w-7 p-0">
                              <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => removeTeam(t.id)} className="h-7 w-7 p-0">
                              <Trash2 className="h-3.5 w-3.5 text-destructive" />
                            </Button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </TabsContent>

            {/* Chaveamento Tab - Generate button lives here */}
            <TabsContent value="bracket">
              {isOwner && matches.length === 0 && teams.length >= 2 && (
                <div className="mb-4">
                  <GenerateBracketDialog
                    onGenerate={generateBracket}
                    teamCount={teams.length}
                    teams={teams}
                    isDisabled={false}
                    sport={tournament.sport}
                  />
                </div>
              )}

              {isOwner && matches.length > 0 && (
                <div className="mb-4 flex items-center justify-between">
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant={viewMode === "tree" ? "default" : "outline"}
                      onClick={() => setViewMode("tree")}
                    >
                      Árvore
                    </Button>
                    <Button
                      size="sm"
                      variant={viewMode === "list" ? "default" : "outline"}
                      onClick={() => setViewMode("list")}
                    >
                      Lista
                    </Button>
                  </div>
                  <Button variant="destructive" size="sm" className="gap-1" onClick={undoBracket}>
                    <Undo2 className="h-4 w-4" /> Desfazer Chaveamento
                  </Button>
                </div>
              )}

              {!isOwner && matches.length > 0 && (
                <div className="mb-4 flex gap-2">
                  <Button size="sm" variant={viewMode === "tree" ? "default" : "outline"} onClick={() => setViewMode("tree")}>Árvore</Button>
                  <Button size="sm" variant={viewMode === "list" ? "default" : "outline"} onClick={() => setViewMode("list")}>Lista</Button>
                </div>
              )}

              {matches.length > 0 ? (
                <section>
                  <h2 className="mb-4 text-xl font-semibold flex items-center gap-2">
                    <Trophy className="h-5 w-5" /> Chaveamento
                  </h2>
                  {viewMode === "tree" ? (
                    <BracketTreeView
                      matches={matches}
                      participants={participants}
                      isOwner={isOwner}
                      onDeclareWinner={declareWinner}
                      onUpdateScore={updateScore}
                    />
                  ) : (
                    <BracketView
                      matches={matches}
                      participants={participants}
                      isOwner={isOwner}
                      onDeclareWinner={declareWinner}
                      onUpdateScore={updateScore}
                    />
                  )}
                </section>
              ) : (
                <div className="rounded-xl border border-dashed border-border bg-card/50 p-12 text-center">
                  <p className="text-muted-foreground">
                    {teams.length < 2
                      ? "Adicione pelo menos 2 duplas para gerar o chaveamento."
                      : "Clique em \"Gerar Chaveamento\" para começar."}
                  </p>
                </div>
              )}
            </TabsContent>

            {/* Sequência Tab */}
            <TabsContent value="sequence">
              {isOwner && matches.length > 0 && (
                <div className="mb-4 flex justify-end">
                  <Button variant="destructive" size="sm" className="gap-1" onClick={undoBracket}>
                    <Undo2 className="h-4 w-4" /> Desfazer Sequência
                  </Button>
                </div>
              )}
              <MatchSequenceTab matches={matches} teams={teams} />
            </TabsContent>

            {/* Classificação Tab */}
            <TabsContent value="classification">
              {matches.length > 0 ? (
                <section>
                  <h2 className="mb-4 text-xl font-semibold flex items-center gap-2">
                    <Trophy className="h-5 w-5" /> Classificação
                  </h2>
                  <BracketTreeView
                    matches={matches}
                    participants={participants}
                    isOwner={isOwner}
                    onDeclareWinner={declareWinner}
                    onUpdateScore={updateScore}
                  />
                </section>
              ) : (
                <div className="rounded-xl border border-dashed border-border bg-card/50 p-12 text-center">
                  <p className="text-muted-foreground">Gere o chaveamento primeiro.</p>
                </div>
              )}
            </TabsContent>

            {/* Ranking Tab */}
            <TabsContent value="rankings">
              <RankingsTab
                tournamentId={id || ""}
                isOwner={isOwner}
                sport={tournament.sport}
              />
            </TabsContent>
          </Tabs>
        </motion.div>
      </main>
    </ThemedBackground>
  );
};

export default TournamentDetail;
