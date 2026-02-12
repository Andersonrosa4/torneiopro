import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { motion } from "framer-motion";
import { Plus, Trophy, Users, Calendar, ArrowRight, MapPin, ArrowLeft } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import AppHeader from "@/components/AppHeader";
import ThemedBackground from "@/components/ThemedBackground";
import AdminOrganizersTab from "@/components/AdminOrganizersTab";

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
  const { user, organizerId } = useAuth();
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    const fetchTournaments = async () => {
      const { data, error } = await supabase
        .from("tournaments")
        .select("*")
        .eq("created_by", organizerId || "")
        .order("created_at", { ascending: false });

      if (!error && data) setTournaments(data);
      setLoading(false);
    };
    const checkAdmin = async () => {
      if (!user) return;
      const { data } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", organizerId || "")
        .eq("role", "admin")
        .maybeSingle();
      setIsAdmin(!!data);
    };
    if (user) {
      fetchTournaments();
      checkAdmin();
    }
  }, [user]);

  return (
    <ThemedBackground>
      <AppHeader />
      <main className="container py-8">
        <Button variant="ghost" onClick={() => navigate("/")} className="mb-4 gap-2">
          <ArrowLeft className="h-4 w-4" /> Voltar
        </Button>
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Painel</h1>
            <p className="mt-1 text-muted-foreground">Gerencie seus torneios</p>
          </div>
          <Link to="/tournaments/new">
            <Button className="gap-2 bg-gradient-primary text-primary-foreground hover:opacity-90">
              <Plus className="h-4 w-4" />
              Novo Torneio
            </Button>
          </Link>
        </div>

        <Tabs defaultValue={isAdmin ? "organizers" : "tournaments"}>
          {isAdmin && (
            <TabsList className="mb-4">
              <TabsTrigger value="organizers">Gestão de Organizadores</TabsTrigger>
              <TabsTrigger value="tournaments">Meus Torneios</TabsTrigger>
            </TabsList>
          )}

          {isAdmin && (
            <TabsContent value="organizers">
              <AdminOrganizersTab />
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
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {tournaments.map((t, i) => (
                  <motion.div key={t.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
                    <Link to={`/tournaments/${t.id}`}>
                      <div className="group rounded-xl border border-border bg-card p-5 shadow-card transition-all hover:border-primary/30 hover:shadow-glow">
                        <div className="mb-3 flex items-start justify-between">
                          <h3 className="text-lg font-semibold leading-tight group-hover:text-primary transition-colors">{t.name}</h3>
                          <Badge className={statusColors[t.status] || ""}>{statusLabels[t.status] || t.status}</Badge>
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
      </main>
    </ThemedBackground>
  );
};

export default Dashboard;
