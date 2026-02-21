import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { publicQuery } from "@/lib/organizerApi";
import { formatDateBR } from "@/lib/utils";

// ─── Module-level cache (shared across renders, survives tab switches) ───────
const CACHE_TTL_MS = 5_000; // 5 seconds stale threshold
interface CacheEntry { tournament: any; teams: any[]; matches: any[]; fetchedAt: number; }
const dataCache = new Map<string, CacheEntry>();
// ─────────────────────────────────────────────────────────────────────────────
import { useSportTheme } from "@/contexts/SportContext";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import { Trophy, Users, MapPin, Calendar, ArrowLeft } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import ThemedBackground from "@/components/ThemedBackground";
import FlowAppsBranding from "@/components/FlowAppsBranding";
import PromoPopup from "@/components/PromoPopup";
import ModalityTabs from "@/components/ModalityTabs";
import { useModalities } from "@/hooks/useModalities";

import BracketTreeView from "@/components/BracketTreeView";
import MatchSequenceViewer from "@/components/MatchSequenceViewer";
import ClassificationTab from "@/components/ClassificationTab";
import RankingsTab from "@/components/RankingsTab";
import SportQuiz from "@/components/SportQuiz";
import RallyGame from "@/components/RallyGame";
import VolleyPongGame from "@/components/VolleyPongGame";


const sportLabels: Record<string, string> = {
  beach_volleyball: "Vôlei de Praia",
  futevolei: "Futevôlei",
  beach_tennis: "Beach Tennis",
  tennis: "Tênis",
  padel: "Padel",
  futsal: "Futsal",
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
  const { isAdmin } = useAuth();
  const navigate = useNavigate();
  const { setSelectedSport } = useSportTheme();
  const [tournament, setTournament] = useState<any>(null);
  const [teams, setTeams] = useState<any[]>([]);
  const [matches, setMatches] = useState<any[]>([]);
  const [loading, setLoading] = useState(!dataCache.has(id ?? ""));
  const revalidatingRef = useRef(false);

  const { modalities, selectedModality, setSelectedModality, loading: modalitiesLoading } = useModalities(id);

  // Filtered data by selected modality — STRICT isolation, no fallback
  // While modalities are loading, return empty to prevent unfiltered data flash
  const filteredTeams = useMemo(() =>
    modalitiesLoading ? [] :
    selectedModality ? teams.filter(t => t.modality_id === selectedModality.id) 
      : modalities.length > 0 ? [] : teams,
    [teams, selectedModality, modalities.length, modalitiesLoading]
  );
  const filteredMatches = useMemo(() =>
    modalitiesLoading ? [] :
    selectedModality ? matches.filter(m => m.modality_id === selectedModality.id) 
      : modalities.length > 0 ? [] : matches,
    [matches, selectedModality, modalities.length, modalitiesLoading]
  );

  const fetchData = useCallback(async (background = false) => {
    if (!id) return;

    // Stale-while-revalidate: serve cache instantly if fresh enough
    const cached = dataCache.get(id);
    const now = Date.now();
    if (cached && now - cached.fetchedAt < CACHE_TTL_MS) {
      // Cache is still fresh — apply and skip network request
      setTournament(cached.tournament);
      setSelectedSport(cached.tournament?.sport);
      setTeams(cached.teams);
      setMatches(cached.matches);
      setLoading(false);
      return;
    }

    // Cache is stale or missing — if serving stale data first, show it instantly
    if (cached && !background) {
      setTournament(cached.tournament);
      setSelectedSport(cached.tournament?.sport);
      setTeams(cached.teams);
      setMatches(cached.matches);
      setLoading(false);
    }

    // Prevent concurrent background revalidations
    if (background && revalidatingRef.current) return;
    if (background) revalidatingRef.current = true;

    try {
      const [tRes, teamsRes, mRes] = await Promise.all([
        publicQuery({ table: "tournaments", filters: { id }, single: true }),
        publicQuery({ table: "teams", filters: { tournament_id: id }, order: { column: "seed", ascending: true } }),
        publicQuery({ table: "matches", filters: { tournament_id: id }, order: [{ column: "round", ascending: true }, { column: "position", ascending: true }] }),
      ]);

      const tournament = tRes.data ?? cached?.tournament ?? null;
      const teams = teamsRes.data ?? cached?.teams ?? [];
      const matches = mRes.data ?? cached?.matches ?? [];

      // Update cache
      if (tournament) dataCache.set(id, { tournament, teams, matches, fetchedAt: Date.now() });

      if (tournament) { setTournament(tournament); setSelectedSport(tournament.sport); }
      setTeams(teams);
      setMatches(matches);
      setLoading(false);
    } finally {
      if (background) revalidatingRef.current = false;
    }
  }, [id, setSelectedSport]);

  useEffect(() => {
    const cached = dataCache.get(id ?? "");
    if (cached) {
      // Instantly paint stale data, revalidate in background
      fetchData(true);
    } else {
      fetchData(false);
    }
  }, [fetchData, id]);

  // Real-time updates — debounced + invalidates cache so next fetch is fresh
  useEffect(() => {
    if (!id) return;
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const debouncedFetch = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        // Invalidate cache so Realtime always fetches fresh data
        dataCache.delete(id);
        fetchData(false);
      }, 300);
    };
    const channel = supabase
      .channel(`public-rt-${id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "matches", filter: `tournament_id=eq.${id}` }, debouncedFetch)
      .on("postgres_changes", { event: "*", schema: "public", table: "teams", filter: `tournament_id=eq.${id}` }, debouncedFetch)
      .on("postgres_changes", { event: "*", schema: "public", table: "tournaments" }, (payload) => {
        if ((payload.new as any)?.id === id) debouncedFetch();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "rankings", filter: `tournament_id=eq.${id}` }, debouncedFetch)
      .subscribe();
    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      supabase.removeChannel(channel);
    };
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
      <PromoPopup />
      <div className="container py-4 sm:py-8 px-3 sm:px-6 overflow-x-hidden">
        <Button variant="ghost" size="sm" onClick={() => navigate("/")} className="mb-3 sm:mb-4 gap-2">
          <ArrowLeft className="h-4 w-4" /> <span className="hidden sm:inline">Voltar</span>
        </Button>
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
          <div className="mb-4 sm:mb-6 flex flex-col sm:flex-row sm:flex-wrap sm:items-start sm:justify-between gap-3 sm:gap-4">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
                <h1 className="text-xl sm:text-3xl font-bold tracking-tight break-words">{tournament.name}</h1>
                <Badge variant="outline" className="shrink-0">{statusLabels[tournament.status] || tournament.status}</Badge>
              </div>
              <div className="mt-1.5 sm:mt-2 flex flex-wrap items-center gap-2 sm:gap-4 text-xs sm:text-sm text-muted-foreground">
                <span>{sportLabels[tournament.sport] || tournament.sport}</span>
                {tournament.category && <span>• {tournament.category}</span>}
                {tournament.location && (
                  <span className="flex items-center gap-1"><MapPin className="h-3 w-3 sm:h-3.5 sm:w-3.5" />{tournament.location}</span>
                )}
                {tournament.event_date && (
                  <span className="flex items-center gap-1"><Calendar className="h-3 w-3 sm:h-3.5 sm:w-3.5" />{formatDateBR(tournament.event_date)}</span>
                )}
              </div>
            </div>
            {tournament.tournament_code && (
              <div className="rounded-lg bg-card border border-border px-3 sm:px-4 py-1.5 sm:py-2 text-center self-start">
                <p className="text-[10px] sm:text-xs text-muted-foreground">Código</p>
                <p className="text-lg sm:text-2xl font-mono font-bold tracking-[0.3em] text-primary">{tournament.tournament_code}</p>
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
            <TabsList className="flex flex-wrap gap-1.5 sm:gap-2 mb-1 sm:mb-2 h-auto bg-transparent p-0 w-full">
              <TabsTrigger value="teams" className="flex-1 min-w-[60px] text-center text-xs sm:text-sm font-medium h-8 sm:h-9 rounded-[12px] border border-white/[0.18] bg-white/[0.04] text-muted-foreground data-[state=active]:bg-white/[0.12] data-[state=active]:border-[#ffd700]/60 data-[state=active]:text-foreground data-[state=active]:shadow-sm">Duplas</TabsTrigger>
              <TabsTrigger value="bracket" className="flex-1 min-w-[60px] text-center text-xs sm:text-sm font-medium h-8 sm:h-9 rounded-[12px] border border-white/[0.18] bg-white/[0.04] text-muted-foreground data-[state=active]:bg-white/[0.12] data-[state=active]:border-[#ffd700]/60 data-[state=active]:text-foreground data-[state=active]:shadow-sm">Chave</TabsTrigger>
              <TabsTrigger value="sequence" className="flex-1 min-w-[60px] text-center text-xs sm:text-sm font-medium h-8 sm:h-9 rounded-[12px] border border-white/[0.18] bg-white/[0.04] text-muted-foreground data-[state=active]:bg-white/[0.12] data-[state=active]:border-[#ffd700]/60 data-[state=active]:text-foreground data-[state=active]:shadow-sm">Sequência</TabsTrigger>
              <TabsTrigger value="classification" className="flex-1 min-w-[60px] text-center text-xs sm:text-sm font-medium h-8 sm:h-9 rounded-[12px] border border-white/[0.18] bg-white/[0.04] text-muted-foreground data-[state=active]:bg-white/[0.12] data-[state=active]:border-[#ffd700]/60 data-[state=active]:text-foreground data-[state=active]:shadow-sm">Class.</TabsTrigger>
              <TabsTrigger value="rankings" className="flex-1 min-w-[60px] text-center text-xs sm:text-sm font-medium h-8 sm:h-9 rounded-[12px] border border-white/[0.18] bg-white/[0.04] text-muted-foreground data-[state=active]:bg-white/[0.12] data-[state=active]:border-[#ffd700]/60 data-[state=active]:text-foreground data-[state=active]:shadow-sm">Ranking</TabsTrigger>
            </TabsList>
            {/* Mini-games tabs — full width, highlighted */}
            <TabsList className="flex gap-2 mb-4 sm:mb-5 h-auto bg-transparent p-0 w-full">
              <TabsTrigger value="quiz" className="flex-1 text-xs sm:text-sm font-extrabold h-10 sm:h-11 rounded-[12px] border-2 border-[#ffd700] bg-gradient-to-r from-[#ffd700]/20 via-primary/15 to-[#ffd700]/20 text-[#ffd700] shadow-lg shadow-[#ffd700]/15 data-[state=active]:from-[#ffd700]/30 data-[state=active]:via-primary/25 data-[state=active]:to-[#ffd700]/30 data-[state=active]:border-[#ffd700] data-[state=active]:text-[#ffd700] data-[state=active]:shadow-xl data-[state=active]:shadow-[#ffd700]/25 transition-all duration-300 animate-[quiz-pulse_2.5s_ease-in-out_infinite] data-[state=active]:animate-none">🎮 Quiz</TabsTrigger>
              <TabsTrigger value="rally" className="flex-1 text-xs sm:text-sm font-extrabold h-10 sm:h-11 rounded-[12px] border-2 border-[#00e5ff] bg-gradient-to-r from-[#00e5ff]/20 via-primary/15 to-[#00e5ff]/20 text-[#00e5ff] shadow-lg shadow-[#00e5ff]/15 data-[state=active]:from-[#00e5ff]/30 data-[state=active]:via-primary/25 data-[state=active]:to-[#00e5ff]/30 data-[state=active]:border-[#00e5ff] data-[state=active]:text-[#00e5ff] data-[state=active]:shadow-xl data-[state=active]:shadow-[#00e5ff]/25 transition-all duration-300 animate-[quiz-pulse_2.5s_ease-in-out_infinite] data-[state=active]:animate-none">⚡ Rally Infinito</TabsTrigger>
              <TabsTrigger value="volley" className="flex-1 text-xs sm:text-sm font-extrabold h-10 sm:h-11 rounded-[12px] border-2 border-[#ff6b35] bg-gradient-to-r from-[#ff6b35]/20 via-primary/15 to-[#ff6b35]/20 text-[#ff6b35] shadow-lg shadow-[#ff6b35]/15 data-[state=active]:from-[#ff6b35]/30 data-[state=active]:via-primary/25 data-[state=active]:to-[#ff6b35]/30 data-[state=active]:border-[#ff6b35] data-[state=active]:text-[#ff6b35] data-[state=active]:shadow-xl data-[state=active]:shadow-[#ff6b35]/25 transition-all duration-300 animate-[quiz-pulse_2.5s_ease-in-out_infinite] data-[state=active]:animate-none">🏐 Vôlei 1v1</TabsTrigger>
              
            </TabsList>

            <TabsContent value="teams">
              <section className="rounded-xl border border-border bg-card p-3 sm:p-6 shadow-card">
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
                <section className="overflow-hidden">
                  <h2 className="mb-4 text-xl font-semibold flex items-center gap-2">
                    <Trophy className="h-5 w-5" /> Chaveamento
                  </h2>
                  <BracketTreeView
                      matches={filteredMatches}
                      participants={participants}
                      isOwner={false}
                      onDeclareWinner={() => {}}
                      onUpdateScore={() => {}}
                      tournamentFormat={tournament?.format === 'double_elimination' ? 'double_elimination' : (selectedModality?.game_system || tournament?.format)}
                    />
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
                  <MatchSequenceViewer
                      matches={filteredMatches}
                      teams={filteredTeams}
                      isOwner={false}
                      numSets={tournament?.num_sets || 3}
                      tournamentName={tournament?.name || ""}
                      sport={tournament?.sport || ""}
                      eventDate={tournament?.event_date ? formatDateBR(tournament.event_date) : undefined}
                      tournamentFormat={tournament?.format === 'double_elimination' ? 'double_elimination' : (selectedModality?.game_system || tournament?.format)}
                      onDeclareWinner={() => {}}
                      onUpdateScore={() => {}}
                    />
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
                  <ClassificationTab matches={filteredMatches} teams={filteredTeams} />
                </section>
              ) : (
                <div className="rounded-xl border border-dashed border-border bg-card/50 p-12 text-center">
                  <p className="text-muted-foreground">Classificação disponível após gerar o chaveamento.</p>
                </div>
              )}
            </TabsContent>

            <TabsContent value="rankings">
              <RankingsTab
                  tournamentId={id || ""}
                  isOwner={false}
                  sport={tournament.sport}
                  tournamentName={tournament.name}
                  eventDate={tournament.event_date ? formatDateBR(tournament.event_date) : undefined}
                />
            </TabsContent>

            <TabsContent value="quiz">
              <SportQuiz tournamentId={id || ""} sport={tournament.sport} isAdmin={isAdmin} />
            </TabsContent>

            <TabsContent value="rally">
              <RallyGame tournamentId={id || ""} sport={tournament.sport} isAdmin={isAdmin} />
            </TabsContent>

            <TabsContent value="volley">
              <VolleyPongGame tournamentId={id || ""} sport={tournament.sport} isAdmin={isAdmin} />
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
