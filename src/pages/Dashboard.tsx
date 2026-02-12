import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { motion } from "framer-motion";
import { Plus, Trophy, Users, Calendar, ArrowRight } from "lucide-react";
import AppHeader from "@/components/AppHeader";

interface Tournament {
  id: string;
  name: string;
  description: string | null;
  status: string;
  format: string;
  max_participants: number;
  created_at: string;
  created_by: string;
}

const statusColors: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  registration: "bg-primary/20 text-primary",
  in_progress: "bg-warning/20 text-warning",
  completed: "bg-success/20 text-success",
  cancelled: "bg-destructive/20 text-destructive",
};

const Dashboard = () => {
  const { user } = useAuth();
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchTournaments = async () => {
      const { data, error } = await supabase
        .from("tournaments")
        .select("*")
        .order("created_at", { ascending: false });

      if (!error && data) setTournaments(data);
      setLoading(false);
    };
    fetchTournaments();
  }, []);

  const myTournaments = tournaments.filter((t) => t.created_by === user?.id);
  const otherTournaments = tournaments.filter((t) => t.created_by !== user?.id);

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="container py-8">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
            <p className="mt-1 text-muted-foreground">Manage and track your tournaments</p>
          </div>
          <Link to="/tournaments/new">
            <Button className="gap-2 bg-gradient-primary text-primary-foreground hover:opacity-90">
              <Plus className="h-4 w-4" />
              New Tournament
            </Button>
          </Link>
        </div>

        {loading ? (
          <div className="flex justify-center py-20">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        ) : (
          <>
            <Section title="My Tournaments" tournaments={myTournaments} emptyText="You haven't created any tournaments yet." />
            {otherTournaments.length > 0 && (
              <Section title="All Tournaments" tournaments={otherTournaments} />
            )}
          </>
        )}
      </main>
    </div>
  );
};

const Section = ({ title, tournaments, emptyText }: { title: string; tournaments: Tournament[]; emptyText?: string }) => (
  <section className="mb-10">
    <h2 className="mb-4 text-xl font-semibold">{title}</h2>
    {tournaments.length === 0 ? (
      <div className="rounded-xl border border-dashed border-border bg-card/50 p-12 text-center">
        <Trophy className="mx-auto mb-3 h-10 w-10 text-muted-foreground/40" />
        <p className="text-muted-foreground">{emptyText || "No tournaments found."}</p>
      </div>
    ) : (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {tournaments.map((t, i) => (
          <motion.div key={t.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
            <Link to={`/tournaments/${t.id}`}>
              <div className="group rounded-xl border border-border bg-card p-5 shadow-card transition-all hover:border-primary/30 hover:shadow-glow">
                <div className="mb-3 flex items-start justify-between">
                  <h3 className="text-lg font-semibold leading-tight group-hover:text-primary transition-colors">{t.name}</h3>
                  <Badge className={statusColors[t.status] || ""}>{t.status.replace("_", " ")}</Badge>
                </div>
                {t.description && (
                  <p className="mb-3 line-clamp-2 text-sm text-muted-foreground">{t.description}</p>
                )}
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Users className="h-3.5 w-3.5" />
                    Max {t.max_participants}
                  </span>
                  <span className="flex items-center gap-1">
                    <Calendar className="h-3.5 w-3.5" />
                    {new Date(t.created_at).toLocaleDateString()}
                  </span>
                </div>
                <div className="mt-3 flex items-center gap-1 text-xs font-medium text-primary opacity-0 transition-opacity group-hover:opacity-100">
                  View Details <ArrowRight className="h-3 w-3" />
                </div>
              </div>
            </Link>
          </motion.div>
        ))}
      </div>
    )}
  </section>
);

export default Dashboard;
