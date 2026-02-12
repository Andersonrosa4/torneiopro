import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import { Trophy, Users, MapPin, Calendar, ArrowLeft } from "lucide-react";
import BracketView from "@/components/BracketView";

const sportLabels: Record<string, string> = {
  beach_volleyball: "Beach Volley",
  futevolei: "Futevôlei",
  beach_tennis: "Beach Tennis",
};

const statusLabels: Record<string, string> = {
  draft: "Rascunho",
  registration: "Inscrições",
  in_progress: "Em andamento",
  completed: "Finalizado",
  cancelled: "Cancelado",
};

const TournamentPublicView = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [tournament, setTournament] = useState<any>(null);
  const [teams, setTeams] = useState<any[]>([]);
  const [matches, setMatches] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    const fetchData = async () => {
      const [tRes, teamsRes, mRes] = await Promise.all([
        supabase.from("tournaments").select("*").eq("id", id).single(),
        supabase.from("teams").select("*").eq("tournament_id", id).order("seed"),
        supabase.from("matches").select("*").eq("tournament_id", id).order("round").order("position"),
      ]);
      if (tRes.data) setTournament(tRes.data);
      if (teamsRes.data) setTeams(teamsRes.data);
      if (mRes.data) setMatches(mRes.data);
      setLoading(false);
    };
    fetchData();
  }, [id]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!tournament) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background gap-4">
        <p className="text-muted-foreground">Torneio não encontrado.</p>
        <Button variant="ghost" onClick={() => navigate("/")}>Voltar</Button>
      </div>
    );
  }

  // Map teams to participants format for BracketView
  const participants = teams.map((t) => ({
    id: t.id,
    name: `${t.player1_name} / ${t.player2_name}`,
    seed: t.seed,
  }));

  return (
    <div className="min-h-screen bg-background">
      <div className="container py-8">
        <Button variant="ghost" onClick={() => navigate("/")} className="mb-4 gap-2">
          <ArrowLeft className="h-4 w-4" /> Voltar
        </Button>
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
          <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-3xl font-bold tracking-tight">{tournament.name}</h1>
                <Badge variant="outline">{statusLabels[tournament.status] || tournament.status}</Badge>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
                <span>{sportLabels[tournament.sport] || tournament.sport}</span>
                {tournament.category && <span>• {tournament.category}</span>}
                {tournament.location && (
                  <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{tournament.location}</span>
                )}
                {tournament.event_date && (
                  <span className="flex items-center gap-1"><Calendar className="h-3.5 w-3.5" />{new Date(tournament.event_date).toLocaleDateString("pt-BR")}</span>
                )}
              </div>
            </div>
            {tournament.tournament_code && (
              <div className="rounded-lg bg-card border border-border px-4 py-2 text-center">
                <p className="text-xs text-muted-foreground">Código</p>
                <p className="text-2xl font-mono font-bold tracking-[0.3em] text-primary">{tournament.tournament_code}</p>
              </div>
            )}
          </div>

          {/* Duplas */}
          <section className="mb-8">
            <h2 className="mb-3 text-xl font-semibold flex items-center gap-2">
              <Users className="h-5 w-5" /> Duplas ({teams.length})
            </h2>
            {teams.length === 0 ? (
              <p className="text-muted-foreground text-sm">Nenhuma dupla inscrita ainda.</p>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {teams.map((t, i) => (
                  <div key={t.id} className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3">
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-muted text-xs font-bold text-muted-foreground">
                      {i + 1}
                    </span>
                    <span className="font-medium">{t.player1_name} / {t.player2_name}</span>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Chaveamento */}
          {matches.length > 0 && (
            <section>
              <h2 className="mb-3 text-xl font-semibold flex items-center gap-2">
                <Trophy className="h-5 w-5" /> Chaveamento
              </h2>
              <BracketView
                matches={matches}
                participants={participants}
                isOwner={false}
                onDeclareWinner={() => {}}
                onUpdateScore={() => {}}
              />
            </section>
          )}
        </motion.div>
      </div>
    </div>
  );
};

export default TournamentPublicView;
