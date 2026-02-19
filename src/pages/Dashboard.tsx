import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { motion } from "framer-motion";
import { Plus, Trophy, Users, Calendar, ArrowRight, MapPin, ArrowLeft, Trash2, Stethoscope } from "lucide-react";
import { toast } from "sonner";
import { organizerQuery } from "@/lib/organizerApi";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import AppHeader from "@/components/AppHeader";
import ThemedBackground from "@/components/ThemedBackground";
import UserManagementTab from "@/components/UserManagementTab";
import FlowAppsBranding from "@/components/FlowAppsBranding";
import PromoPopup from "@/components/PromoPopup";

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

const sportLabels: Record<string, string> = {
  beach_volleyball: "🏐 Vôlei de Praia",
  futevolei: "⚽ Futevôlei",
  beach_tennis: "🎾 Beach Tennis",
};

interface Tournament {
  id: string;
  name: string;
  description: string | null;
  status: string;
  format: string;
  max_participants: number;
  created_at: string;
  created_by: string;
  sport: string;
  tournament_code: string | null;
  category: string | null;
  event_date: string | null;
  location: string | null;
}

const Dashboard = () => {
  const navigate = useNavigate();
  const { user, organizerId, isAdmin } = useAuth();
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchTournaments = async () => {
    if (isAdmin) {
      // Admin: fetch all tournaments
      const { data, error } = await organizerQuery<Tournament[]>({
        table: "tournaments",
        operation: "select",
        order: { column: "created_at", ascending: false },
      });
      if (!error && data) setTournaments(data);
    } else {
      // Non-admin: fetch tournaments created by this organizer
      const { data: ownedData } = await organizerQuery<Tournament[]>({
        table: "tournaments",
        operation: "select",
        filters: { created_by: organizerId || "" },
        order: { column: "created_at", ascending: false },
      });

      // Also fetch tournaments associated via tournament_organizers
      const { data: assocData } = await organizerQuery<{ tournament_id: string }[]>({
        table: "tournament_organizers",
        operation: "select",
        select: "tournament_id",
        filters: { organizer_id: organizerId || "" },
      });

      const associatedIds = (assocData ?? []).map((a) => a.tournament_id);
      let associatedTournaments: Tournament[] = [];

      if (associatedIds.length > 0) {
        // Fetch each associated tournament
        const fetches = await Promise.all(
          associatedIds.map((tid) =>
            organizerQuery<Tournament>({
              table: "tournaments",
              operation: "select",
              filters: { id: tid },
              single: true,
            })
          )
        );
        associatedTournaments = fetches
          .filter((r) => !r.error && r.data)
          .map((r) => r.data as Tournament);
      }

      // Merge, deduplicate
      const owned = ownedData ?? [];
      const allIds = new Set(owned.map((t) => t.id));
      const merged = [
        ...owned,
        ...associatedTournaments.filter((t) => !allIds.has(t.id)),
      ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

      setTournaments(merged);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (user) fetchTournaments();
  }, [user, isAdmin, organizerId]);

  // Realtime: tournaments
  useEffect(() => {
    const channel = supabase
      .channel("dashboard-tournaments-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "tournaments" }, () => {
        if (user) fetchTournaments();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, isAdmin, organizerId]);

  const deleteTournament = async (tournamentId: string) => {
    try {
      const token = sessionStorage.getItem("organizer_token");
      const orgId = sessionStorage.getItem("organizer_id");

      if (!token || !orgId) {
        toast.error("Sessão expirada. Faça login novamente.");
        return;
      }

      // 1. Delete rankings
      await organizerQuery({ table: "rankings", operation: "delete", filters: { tournament_id: tournamentId } });

      // 2. Nullify FK refs + delete matches + classificacao_grupos + groups (undo_bracket handles all)
      await supabase.functions.invoke("organizer-api", {
        body: { token, organizerId: orgId, table: "matches", operation: "undo_bracket", tournament_id: tournamentId },
      });

      // 3. Delete participants
      await organizerQuery({ table: "participants", operation: "delete", filters: { tournament_id: tournamentId } });

      // 4. Delete teams
      await organizerQuery({ table: "teams", operation: "delete", filters: { tournament_id: tournamentId } });

      // 5. Delete modalities
      await organizerQuery({ table: "modalities", operation: "delete", filters: { tournament_id: tournamentId } });

      // 6. Delete the tournament itself
      const { error } = await organizerQuery({ table: "tournaments", operation: "delete", filters: { id: tournamentId } });
      if (error) {
        toast.error("Erro ao excluir torneio: " + error.message);
        return;
      }

      setTournaments((prev) => prev.filter((t) => t.id !== tournamentId));
      toast.success("Torneio excluído com sucesso!");
    } catch (err: any) {
      toast.error("Erro ao excluir torneio. Tente novamente.");
    }
  };

  return (
    <ThemedBackground>
      
      <AppHeader />
      <main className="container py-4 sm:py-8 px-3 sm:px-6">
        <Button variant="ghost" size="sm" onClick={() => navigate("/")} className="mb-3 sm:mb-4 gap-2">
          <ArrowLeft className="h-4 w-4" /> <span className="hidden sm:inline">Voltar</span>
        </Button>
        <div className="mb-5 sm:mb-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Painel</h1>
            <p className="mt-0.5 sm:mt-1 text-sm text-muted-foreground">Gerencie seus torneios</p>
          </div>
          <Link to="/tournaments/new">
            <Button className="gap-2 bg-gradient-primary text-primary-foreground hover:opacity-90 w-full sm:w-auto">
              <Plus className="h-4 w-4" />
              Novo Torneio
            </Button>
          </Link>
        </div>

        <Tabs defaultValue="tournaments">
          {isAdmin && (
            <>
              <TabsList className="mb-4">
                <TabsTrigger value="tournaments">Meus Torneios</TabsTrigger>
                <TabsTrigger value="users">Gestão de Usuários</TabsTrigger>
              </TabsList>
              <div className="mb-4">
                <Link to="/diagnostics">
                  <Button variant="outline" size="sm" className="gap-2">
                    <Stethoscope className="h-4 w-4" /> Diagnóstico do Sistema
                  </Button>
                </Link>
              </div>
            </>
          )}

          {isAdmin && (
            <TabsContent value="users">
              <UserManagementTab />
            </TabsContent>
          )}

          <TabsContent value={isAdmin ? "tournaments" : "tournaments"}>
            {loading ? (
              <div className="flex justify-center py-20">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              </div>
            ) : tournaments.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border bg-card/50 p-12 text-center">
                <Trophy className="mx-auto mb-3 h-10 w-10 text-muted-foreground/40" />
                <p className="text-muted-foreground">Você ainda não criou nenhum torneio.</p>
              </div>
            ) : (
              <div className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
                {tournaments.map((t, i) => (
                  <motion.div key={t.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
                    <Link to={`/tournaments/${t.id}`} className="block">
                      <div className="group rounded-xl border border-border bg-card p-5 shadow-card transition-all hover:border-primary/30 hover:shadow-glow">
                        <div className="mb-3 flex items-start justify-between">
                          <h3 className="text-lg font-semibold leading-tight group-hover:text-primary transition-colors">{t.name}</h3>
                          <div className="flex items-center gap-2">
                            <Badge className={statusColors[t.status] || ""}>{statusLabels[t.status] || t.status}</Badge>
                            {(isAdmin || t.created_by === organizerId) && (
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 w-7 p-0"
                                    onClick={(e) => e.preventDefault()}
                                  >
                                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent onClick={(e) => e.stopPropagation()}>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>Excluir torneio "{t.name}"?</AlertDialogTitle>
                                    <AlertDialogDescription>
                                      Esta ação não pode ser desfeita. Todos os dados (duplas, partidas, ranking) serão removidos.
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                    <AlertDialogAction onClick={() => deleteTournament(t.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                                      Excluir
                                    </AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            )}
                          </div>
                        </div>
                        <div className="mb-2 text-sm">{sportLabels[t.sport] || t.sport}</div>
                        {t.description && (
                          <p className="mb-3 line-clamp-2 text-sm text-muted-foreground">{t.description}</p>
                        )}
                        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                          {t.category && (
                            <span className="flex items-center gap-1">
                              <Users className="h-3.5 w-3.5" />
                              {t.category}
                            </span>
                          )}
                          {t.event_date && (
                            <span className="flex items-center gap-1">
                              <Calendar className="h-3.5 w-3.5" />
                              {new Date(t.event_date).toLocaleDateString("pt-BR")}
                            </span>
                          )}
                          {t.location && (
                            <span className="flex items-center gap-1">
                              <MapPin className="h-3.5 w-3.5" />
                              {t.location}
                            </span>
                          )}
                          {t.tournament_code && (
                            <span className="font-mono text-primary">#{t.tournament_code}</span>
                          )}
                        </div>
                        <div className="mt-3 flex items-center gap-1 text-xs font-medium text-primary opacity-0 transition-opacity group-hover:opacity-100">
                          Ver Detalhes <ArrowRight className="h-3 w-3" />
                        </div>
                      </div>
                    </Link>
                  </motion.div>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
        <FlowAppsBranding variant="internal-footer" />
      </main>
    </ThemedBackground>
  );
};

export default Dashboard;
