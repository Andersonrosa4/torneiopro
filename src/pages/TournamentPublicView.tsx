import { useEffect, useState, useCallback, useMemo, lazy, Suspense } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { publicQuery } from "@/lib/organizerApi";
import { useSportTheme } from "@/contexts/SportContext";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import { Trophy, Users, MapPin, Calendar, ArrowLeft } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import ThemedBackground from "@/components/ThemedBackground";
import FlowAppsBranding from "@/components/FlowAppsBranding";
import ModalityTabs from "@/components/ModalityTabs";
import { useModalities } from "@/hooks/useModalities";

// Lazy load heavy components — same as organizer
const BracketTreeView = lazy(() => import("@/components/BracketTreeView"));
const MatchSequenceViewer = lazy(() => import("@/components/MatchSequenceViewer"));
const ClassificationTab = lazy(() => import("@/components/ClassificationTab"));
const RankingsTab = lazy(() => import("@/components/RankingsTab"));

const sportLabels: Record<string, string> = {
  beach_volleyball: "Vôlei de Praia",
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
  const { setSelectedSport } = useSportTheme();
  const [tournament, setTournament] = useState<any>(null);
  const [teams, setTeams] = useState<any[]>([]);
  const [matches, setMatches] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const { modalities, selectedModality, setSelectedModality } = useModalities(id);

  // Filtered data by selected modality — same as organizer
  const filteredTeams = useMemo(() =>
    selectedModality ? teams.filter(t => t.modality_id === selectedModality.id) : teams,
    [teams, selectedModality]
  );
  const filteredMatches = useMemo(() =>
    selectedModality ? matches.filter(m => m.modality_id === selectedModality.id) : matches,
    [matches, selectedModality]
  );

  const fetchData = useCallback(async () => {
    if (!id) return;
    const [tRes, teamsRes, mRes] = await Promise.all([
      publicQuery({ table: "tournaments", filters: { id }, single: true }),
      publicQuery({ table: "teams", filters: { tournament_id: id }, order: { column: "seed", ascending: true } }),
      publicQuery({ table: "matches", filters: { tournament_id: id }, order: [{ column: "round", ascending: true }, { column: "position", ascending: true }] }),
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

  // Real-time updates
  useEffect(() => {
    if (!id) return;
    const channel = supabase
      .channel(`public-rt-${id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "matches", filter: `tournament_id=eq.${id}` }, () => fetchData())
      .on("postgres_changes", { event: "*", schema: "public", table: "teams", filter: `tournament_id=eq.${id}` }, () => fetchData())
      .on("postgres_changes", { event: "*", schema: "public", table: "tournaments" }, (payload) => {
        if ((payload.new as any)?.id === id) fetchData();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "rankings", filter: `tournament_id=eq.${id}` }, () => fetchData())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [id, fetchData]);

  if (loading) {
    return (
      <ThemedBackground>
        <div className="flex items-center justify-center min-h-screen">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      </ThemedBackground>
    );
  }

  if (!tournament) {
    return (
      <ThemedBackground>
        <div className="flex min-h-screen flex-col items-center justify-center gap-4">
          <p className="text-muted-foreground">Torneio não encontrado.</p>
          <Button variant="ghost" onClick={() => navigate("/")}>Voltar</Button>
        </div>
      </ThemedBackground>
    );
  }

  const participants = filteredTeams.map((t) => ({
    id: t.id,
    name: `${t.player1_name} / ${t.player2_name}`,
    seed: t.seed,
  }));

  return (
    <ThemedBackground>
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

          {/* Modality tabs — same as organizer */}
          {modalities.length > 0 && (
            <ModalityTabs
              modalities={modalities}
              selectedModality={selectedModality}
              onSelect={setSelectedModality}
            />
          )}

          {/* All tabs — identical structure to organizer */}
          <Tabs defaultValue="teams" className="w-full">
            <TabsList className="mb-4 flex-wrap">
              <TabsTrigger value="teams">Duplas</TabsTrigger>
              <TabsTrigger value="bracket">Chaveamento</TabsTrigger>
              <TabsTrigger value="sequence">Sequência</TabsTrigger>
              <TabsTrigger value="classification">Classificação</TabsTrigger>
              <TabsTrigger value="rankings">Ranking</TabsTrigger>
            </TabsList>

            <TabsContent value="teams">
              <section className="rounded-xl border border-border bg-card p-6 shadow-card">
                <h2 className="mb-3 text-xl font-semibold flex items-center gap-2">
                  <Users className="h-5 w-5" /> Duplas ({filteredTeams.length})
                </h2>
                {filteredTeams.length === 0 ? (
                  <p className="text-muted-foreground text-sm">Nenhuma dupla inscrita ainda.</p>
                ) : (
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {filteredTeams.map((t, i) => (
                      <div key={t.id} className="flex items-center gap-3 rounded-lg border border-border bg-secondary/50 px-4 py-3">
                        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-muted text-xs font-bold text-muted-foreground">
                          {i + 1}
                        </span>
                        <span className="team-name">{t.player1_name} / {t.player2_name}</span>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </TabsContent>

            {/* Chaveamento — identical to organizer bracket tab */}
            <TabsContent value="bracket">
              {filteredMatches.length > 0 ? (
                <section>
                  <h2 className="mb-4 text-xl font-semibold flex items-center gap-2">
                    <Trophy className="h-5 w-5" /> Chaveamento
                  </h2>
                  <Suspense fallback={<div className="flex justify-center py-12"><div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" /></div>}>
                    <BracketTreeView
                      matches={filteredMatches}
                      participants={participants}
                      isOwner={false}
                      onDeclareWinner={() => {}}
                      onUpdateScore={() => {}}
                      tournamentFormat={selectedModality?.game_system || tournament?.format}
                    />
                  </Suspense>
                </section>
              ) : (
                <div className="rounded-xl border border-dashed border-border bg-card/50 p-12 text-center">
                  <p className="text-muted-foreground">Chaveamento ainda não gerado.</p>
                </div>
              )}
            </TabsContent>

            {/* Sequência — identical to organizer sequence tab */}
            <TabsContent value="sequence">
              {filteredMatches.length > 0 ? (
                <section>
                  <h2 className="mb-4 text-xl font-semibold flex items-center gap-2">
                    <Trophy className="h-5 w-5" /> Sequência de Partidas
                  </h2>
                  <Suspense fallback={<div className="flex justify-center py-12"><div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" /></div>}>
                    <MatchSequenceViewer
                      matches={filteredMatches}
                      teams={filteredTeams}
                      isOwner={false}
                      numSets={tournament?.num_sets || 3}
                      tournamentName={tournament?.name || ""}
                      sport={tournament?.sport || ""}
                      eventDate={tournament?.event_date ? new Date(tournament.event_date).toLocaleDateString("pt-BR") : undefined}
                      tournamentFormat={selectedModality?.game_system || tournament?.format}
                      onDeclareWinner={() => {}}
                      onUpdateScore={() => {}}
                    />
                  </Suspense>
                </section>
              ) : (
                <div className="rounded-xl border border-dashed border-border bg-card/50 p-12 text-center">
                  <p className="text-muted-foreground">Sequência disponível após gerar o chaveamento.</p>
                </div>
              )}
            </TabsContent>

            <TabsContent value="classification">
              {filteredMatches.length > 0 ? (
                <section>
                  <h2 className="mb-3 text-xl font-semibold flex items-center gap-2">
                    <Trophy className="h-5 w-5" /> Classificação
                  </h2>
                  <Suspense fallback={<div className="flex justify-center py-12"><div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" /></div>}>
                    <ClassificationTab matches={filteredMatches} teams={filteredTeams} />
                  </Suspense>
                </section>
              ) : (
                <div className="rounded-xl border border-dashed border-border bg-card/50 p-12 text-center">
                  <p className="text-muted-foreground">Classificação disponível após gerar o chaveamento.</p>
                </div>
              )}
            </TabsContent>

            <TabsContent value="rankings">
              <Suspense fallback={<div className="flex justify-center py-12"><div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" /></div>}>
                <RankingsTab
                  tournamentId={id || ""}
                  isOwner={false}
                  sport={tournament.sport}
                  tournamentName={tournament.name}
                  eventDate={tournament.event_date ? new Date(tournament.event_date).toLocaleDateString("pt-BR") : undefined}
                />
              </Suspense>
            </TabsContent>
          </Tabs>
          <FlowAppsBranding variant="tournament-cta" />
        </motion.div>
        <FlowAppsBranding variant="internal-footer" />
      </div>
    </ThemedBackground>
  );
};

export default TournamentPublicView;
