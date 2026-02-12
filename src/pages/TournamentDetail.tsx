import { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { Plus, Trash2, Play, Trophy, Users, Shuffle, Copy, DollarSign } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import AppHeader from "@/components/AppHeader";
import BracketView from "@/components/BracketView";

const sportLabels: Record<string, string> = {
  beach_volleyball: "🏐 Beach Volley",
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
  const { user } = useAuth();
  const navigate = useNavigate();
  const [tournament, setTournament] = useState<any>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [player1, setPlayer1] = useState("");
  const [player2, setPlayer2] = useState("");
  const [loading, setLoading] = useState(true);

  const isOwner = tournament?.created_by === user?.id;

  const fetchData = useCallback(async () => {
    if (!id) return;
    const [tRes, teamsRes, mRes] = await Promise.all([
      supabase.from("tournaments").select("*").eq("id", id).single(),
      supabase.from("teams").select("*").eq("tournament_id", id).order("seed"),
      supabase.from("matches").select("*").eq("tournament_id", id).order("round").order("position"),
    ]);
    if (tRes.data) setTournament(tRes.data);
    if (teamsRes.data) setTeams(teamsRes.data);
    if (mRes.data) setMatches(mRes.data);
    setLoading(false);
  }, [id]);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    if (!id) return;
    const channel = supabase
      .channel(`matches-${id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "matches", filter: `tournament_id=eq.${id}` }, () => fetchData())
      .on("postgres_changes", { event: "*", schema: "public", table: "teams", filter: `tournament_id=eq.${id}` }, () => fetchData())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [id, fetchData]);

  const addTeam = async () => {
    if (!player1.trim() || !player2.trim() || !id) return;
    if (teams.length >= (tournament?.max_participants || 0)) {
      toast.error("Máximo de duplas atingido");
      return;
    }
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

  const addFictitiousTeam = async () => {
    if (!id) return;
    const num = teams.length + 1;
    const { error } = await supabase.from("teams").insert({
      tournament_id: id,
      player1_name: `Jogador ${num}A`,
      player2_name: `Jogador ${num}B`,
      seed: num,
      is_fictitious: true,
    });
    if (error) { toast.error(error.message); return; }
    fetchData();
  };

  const removeTeam = async (tid: string) => {
    await supabase.from("teams").delete().eq("id", tid);
    fetchData();
  };

  const shuffleTeams = async () => {
    if (!id) return;
    const shuffled = [...teams].sort(() => Math.random() - 0.5);
    for (let i = 0; i < shuffled.length; i++) {
      await supabase.from("teams").update({ seed: i + 1 }).eq("id", shuffled[i].id);
    }
    toast.success("Duplas embaralhadas!");
    fetchData();
  };

  const togglePayment = async (teamId: string, current: string) => {
    const next = current === "paid" ? "pending" : "paid";
    await supabase.from("teams").update({ payment_status: next }).eq("id", teamId);
    fetchData();
  };

  const generateBracket = async () => {
    if (!id || !tournament) return;
    if (teams.length < 2) { toast.error("Precisa de pelo menos 2 duplas"); return; }

    await supabase.from("matches").delete().eq("tournament_id", id);

    const totalSlots = Math.pow(2, Math.ceil(Math.log2(teams.length)));
    const rounds = Math.ceil(Math.log2(totalSlots));
    const seeded = [...teams].sort((a, b) => (a.seed || 0) - (b.seed || 0));
    const matchesPerRound1 = totalSlots / 2;

    const newMatches: any[] = [];

    for (let i = 0; i < matchesPerRound1; i++) {
      const t1 = seeded[i] || null;
      const t2 = seeded[totalSlots - 1 - i] || null;
      newMatches.push({
        tournament_id: id,
        round: 1,
        position: i + 1,
        participant1_id: t1?.id || null,
        participant2_id: t2?.id || null,
        team1_id: t1?.id || null,
        team2_id: t2?.id || null,
        status: "pending" as const,
      });
    }

    for (let r = 2; r <= rounds; r++) {
      const count = totalSlots / Math.pow(2, r);
      for (let p = 0; p < count; p++) {
        newMatches.push({
          tournament_id: id,
          round: r,
          position: p + 1,
          participant1_id: null,
          participant2_id: null,
          team1_id: null,
          team2_id: null,
          status: "pending" as const,
        });
      }
    }

    const { error } = await supabase.from("matches").insert(newMatches);
    if (error) { toast.error(error.message); return; }
    await supabase.from("tournaments").update({ status: "in_progress" as const }).eq("id", id);
    toast.success("Chaveamento gerado!");
    fetchData();
  };

  const declareWinner = async (matchId: string, winnerId: string) => {
    const match = matches.find((m) => m.id === matchId);
    if (!match || !id) return;

    await supabase.from("matches").update({
      winner_id: winnerId,
      winner_team_id: winnerId,
      status: "completed" as const,
    }).eq("id", matchId);

    const nextRound = match.round + 1;
    const nextPosition = Math.ceil(match.position / 2);
    const isTop = match.position % 2 === 1;

    const nextMatch = matches.find((m) => m.round === nextRound && m.position === nextPosition);
    if (nextMatch) {
      const update = isTop
        ? { participant1_id: winnerId, team1_id: winnerId }
        : { participant2_id: winnerId, team2_id: winnerId };
      await supabase.from("matches").update(update).eq("id", nextMatch.id);
    } else {
      await supabase.from("tournaments").update({ status: "completed" as const }).eq("id", id);
      toast.success("Torneio finalizado! 🏆");
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
      <div className="min-h-screen bg-background">
        <AppHeader />
        <div className="flex justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      </div>
    );
  }

  if (!tournament) {
    return (
      <div className="min-h-screen bg-background">
        <AppHeader />
        <div className="container py-20 text-center">
          <p className="text-muted-foreground">Torneio não encontrado.</p>
          <Button variant="ghost" onClick={() => navigate("/dashboard")} className="mt-4">Voltar ao Painel</Button>
        </div>
      </div>
    );
  }

  const participants = teams.map((t) => ({
    id: t.id,
    name: `${t.player1_name} / ${t.player2_name}`,
    seed: t.seed,
  }));

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="container py-8">
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
                  {teams.length} / {tournament.max_participants} duplas
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
              {isOwner && tournament.status === "draft" && teams.length >= 2 && (
                <Button onClick={generateBracket} className="gap-2 bg-gradient-primary text-primary-foreground hover:opacity-90">
                  <Play className="h-4 w-4" />
                  Gerar Chaveamento
                </Button>
              )}
            </div>
          </div>

          <Tabs defaultValue="teams" className="w-full">
            <TabsList className="mb-4">
              <TabsTrigger value="teams">Duplas</TabsTrigger>
              <TabsTrigger value="registrations">Inscrições</TabsTrigger>
              <TabsTrigger value="bracket" disabled={matches.length === 0}>Chaveamento</TabsTrigger>
            </TabsList>

            {/* Duplas Tab */}
            <TabsContent value="teams">
              {isOwner && (tournament.status === "draft" || tournament.status === "registration") && (
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
                    <Button variant="outline" size="sm" onClick={addFictitiousTeam} className="gap-1">
                      <Plus className="h-4 w-4" /> Dupla Fictícia
                    </Button>
                    {teams.length >= 2 && (
                      <Button variant="outline" size="sm" onClick={shuffleTeams} className="gap-1">
                        <Shuffle className="h-4 w-4" /> Embaralhar
                      </Button>
                    )}
                  </div>

                  {teams.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Nenhuma dupla cadastrada. Adicione duplas acima.</p>
                  ) : (
                    <div className="space-y-2">
                      {teams.map((t, i) => (
                        <div key={t.id} className="flex items-center justify-between rounded-lg border border-border bg-secondary/50 px-4 py-2">
                          <div className="flex items-center gap-3">
                            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-muted text-xs font-bold text-muted-foreground">
                              {i + 1}
                            </span>
                            <span className="font-medium">
                              {t.player1_name} / {t.player2_name}
                              {t.is_fictitious && <span className="ml-2 text-xs text-muted-foreground">(fictícia)</span>}
                            </span>
                          </div>
                          <Button variant="ghost" size="sm" onClick={() => removeTeam(t.id)}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              )}
            </TabsContent>

            {/* Inscrições Tab */}
            <TabsContent value="registrations">
              <section className="rounded-xl border border-border bg-card p-6 shadow-card">
                <h2 className="mb-4 text-xl font-semibold">Inscrições</h2>
                {teams.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nenhuma dupla inscrita.</p>
                ) : (
                  <div className="space-y-2">
                    {teams.map((t, i) => (
                      <div key={t.id} className="flex items-center justify-between rounded-lg border border-border bg-secondary/50 px-4 py-3">
                        <div className="flex items-center gap-3">
                          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-muted text-xs font-bold text-muted-foreground">
                            {i + 1}
                          </span>
                          <span className="font-medium">{t.player1_name} / {t.player2_name}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          {isOwner ? (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => togglePayment(t.id, t.payment_status)}
                              className={`gap-1 ${t.payment_status === "paid" ? "border-success text-success" : "border-warning text-warning"}`}
                            >
                              <DollarSign className="h-3.5 w-3.5" />
                              {t.payment_status === "paid" ? "Pago" : "Pendente"}
                            </Button>
                          ) : (
                            <Badge variant={t.payment_status === "paid" ? "default" : "outline"}>
                              {t.payment_status === "paid" ? "Pago" : "Pendente"}
                            </Badge>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </TabsContent>

            {/* Chaveamento Tab */}
            <TabsContent value="bracket">
              {matches.length > 0 && (
                <section>
                  <h2 className="mb-4 text-xl font-semibold flex items-center gap-2">
                    <Trophy className="h-5 w-5" /> Chaveamento
                  </h2>
                  <BracketView
                    matches={matches}
                    participants={participants}
                    isOwner={isOwner}
                    onDeclareWinner={declareWinner}
                    onUpdateScore={updateScore}
                  />
                </section>
              )}
            </TabsContent>
          </Tabs>
        </motion.div>
      </main>
    </div>
  );
};

export default TournamentDetail;
