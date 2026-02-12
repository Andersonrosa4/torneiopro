import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { TrendingUp } from "lucide-react";
import { motion } from "framer-motion";
import AppHeader from "@/components/AppHeader";
import ThemedBackground from "@/components/ThemedBackground";

interface RankingEntry {
  id: string;
  athlete_name: string;
  points: number;
  sport: string;
  tournament_id: string;
}

interface Tournament {
  id: string;
  name: string;
  sport: string;
}

const PublicRankingsView = () => {
  const { code } = useParams<{ code: string }>();
  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [rankings, setRankings] = useState<RankingEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      if (!code) {
        toast.error("Código do torneio inválido");
        setLoading(false);
        return;
      }

      // Busca torneio pelo código
      const { data: tourData } = await supabase
        .from("tournaments")
        .select("id, name, sport")
        .eq("tournament_code", code)
        .single();

      if (!tourData) {
        toast.error("Torneio não encontrado");
        setLoading(false);
        return;
      }

      setTournament(tourData);

      // Busca rankings
      const { data: rankData } = await supabase
        .from("rankings")
        .select("*")
        .eq("tournament_id", tourData.id)
        .order("points", { ascending: false });

      setRankings(rankData || []);
      setLoading(false);
    };

    fetchData();

    // Real-time subscription
    if (code) {
      const channel = supabase
        .channel(`public-rankings-${code}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "rankings",
          },
          () => fetchData()
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [code]);

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
        </div>
      </ThemedBackground>
    );
  }

  return (
    <ThemedBackground>
      <AppHeader />
      <main className="container py-8">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
          {/* Header */}
          <div className="mb-8">
            <h1 className="text-3xl font-bold tracking-tight">{tournament.name}</h1>
            <p className="mt-2 text-muted-foreground flex items-center gap-2">
              <TrendingUp className="h-4 w-4" /> Ranking de Atletas
            </p>
          </div>

          {/* Pódio */}
          {rankings.length > 0 && (
            <motion.section
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="mb-8 rounded-xl border border-border bg-gradient-to-b from-primary/10 to-transparent p-8"
            >
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
                {/* 2º lugar */}
                {rankings[1] && (
                  <div className="flex flex-col items-center rounded-lg border border-border bg-card p-6 shadow-card order-first sm:order-none hover:shadow-lg transition-shadow">
                    <div className="mb-3 text-4xl font-bold">
                      🥈
                    </div>
                    <p className="text-sm font-medium text-center text-muted-foreground mb-2">
                      2º Lugar
                    </p>
                    <p className="text-lg font-bold text-center">
                      {rankings[1].athlete_name}
                    </p>
                    <Badge variant="secondary" className="mt-3 text-base font-bold">
                      {rankings[1].points} pts
                    </Badge>
                  </div>
                )}

                {/* 1º lugar */}
                {rankings[0] && (
                  <div className="flex flex-col items-center rounded-lg border-2 border-primary bg-gradient-primary p-8 shadow-lg order-none sm:order-first hover:shadow-xl transition-shadow">
                    <div className="mb-3 text-5xl font-bold">🥇</div>
                    <p className="text-sm font-medium text-center text-primary-foreground/80 mb-2">
                      1º Lugar
                    </p>
                    <p className="text-xl font-bold text-center text-primary-foreground">
                      {rankings[0].athlete_name}
                    </p>
                    <Badge className="mt-3 text-base font-bold bg-primary-foreground text-primary">
                      {rankings[0].points} pts
                    </Badge>
                  </div>
                )}

                {/* 3º lugar */}
                {rankings[2] && (
                  <div className="flex flex-col items-center rounded-lg border border-border bg-card p-6 shadow-card order-last hover:shadow-lg transition-shadow">
                    <div className="mb-3 text-4xl font-bold">
                      🥉
                    </div>
                    <p className="text-sm font-medium text-center text-muted-foreground mb-2">
                      3º Lugar
                    </p>
                    <p className="text-lg font-bold text-center">
                      {rankings[2].athlete_name}
                    </p>
                    <Badge variant="secondary" className="mt-3 text-base font-bold">
                      {rankings[2].points} pts
                    </Badge>
                  </div>
                )}
              </div>
            </motion.section>
          )}

          {/* Classificação Completa */}
          <motion.section
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="rounded-xl border border-border bg-card p-6 shadow-card"
          >
            <h2 className="mb-4 text-xl font-semibold">Classificação Completa</h2>

            {rankings.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                Nenhum atleta no ranking ainda.
              </p>
            ) : (
              <div className="space-y-2">
                {rankings.map((ranking, idx) => (
                  <motion.div
                    key={ranking.id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: idx * 0.03 }}
                    className="flex items-center justify-between rounded-lg border border-border bg-secondary/50 px-4 py-3"
                  >
                    <div className="flex items-center gap-4 flex-1">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-sm font-bold">
                        {idx + 1}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-medium truncate">
                          {ranking.athlete_name}
                        </p>
                      </div>
                    </div>
                    <Badge variant="secondary" className="font-bold tabular-nums">
                      {ranking.points} pts
                    </Badge>
                  </motion.div>
                ))}
              </div>
            )}
          </motion.section>
        </motion.div>
      </main>
    </ThemedBackground>
  );
};

export default PublicRankingsView;
