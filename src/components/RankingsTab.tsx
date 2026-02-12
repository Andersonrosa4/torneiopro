import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Plus, Trash2, TrendingUp } from "lucide-react";
import { motion } from "framer-motion";

interface RankingEntry {
  id: string;
  athlete_name: string;
  points: number;
  sport: string;
  tournament_id: string;
  created_by: string;
}

interface RankingsTabProps {
  tournamentId: string;
  isOwner: boolean;
  sport: string;
}

const RankingsTab = ({ tournamentId, isOwner, sport }: RankingsTabProps) => {
  const { user, organizerId } = useAuth();
  const [rankings, setRankings] = useState<RankingEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [athleteName, setAthleteName] = useState("");
  const [points, setPoints] = useState("");

  const fetchRankings = async () => {
    const { data, error } = await supabase
      .from("rankings")
      .select("*")
      .eq("tournament_id", tournamentId)
      .order("points", { ascending: false });

    if (error) {
      toast.error("Erro ao carregar rankings");
      return;
    }

    setRankings(data || []);
    setLoading(false);
  };

  useEffect(() => {
    fetchRankings();

    const channel = supabase
      .channel(`rankings-${tournamentId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "rankings",
          filter: `tournament_id=eq.${tournamentId}`,
        },
        () => fetchRankings()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [tournamentId]);

  const addAthletePoints = async () => {
    if (!athleteName.trim() || !points || Number(points) < 0) {
      toast.error("Preencha o nome e os pontos (≥ 0)");
      return;
    }
    if (!user) {
      toast.error("Você precisa estar logado");
      return;
    }

    const { error } = await supabase.from("rankings").insert({
      athlete_name: athleteName.trim(),
      points: Number(points),
      sport: sport as any,
      tournament_id: tournamentId,
      created_by: organizerId || "",
    });

    if (error) {
      toast.error(error.message || "Erro ao adicionar pontos");
      return;
    }

    toast.success("Pontos adicionados!");
    setAthleteName("");
    setPoints("");
  };

  const updatePoints = async (id: string, newPoints: number) => {
    if (newPoints < 0) {
      toast.error("Pontos não podem ser negativos");
      return;
    }

    const { error } = await supabase
      .from("rankings")
      .update({ points: newPoints })
      .eq("id", id);

    if (error) {
      toast.error("Erro ao atualizar pontos");
      return;
    }
  };

  const deleteRanking = async (id: string) => {
    const { error } = await supabase.from("rankings").delete().eq("id", id);

    if (error) {
      toast.error("Erro ao remover ranking");
      return;
    }

    toast.success("Ranking removido!");
  };

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
            <Input
              placeholder="Nome do atleta"
              value={athleteName}
              onChange={(e) => setAthleteName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addAthletePoints()}
            />
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
        </motion.section>
      )}

      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="rounded-xl border border-border bg-card p-6 shadow-card"
      >
        <h2 className="mb-4 text-xl font-semibold">Classificação Geral</h2>

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
                transition={{ delay: idx * 0.05 }}
                className="flex items-center justify-between rounded-lg border border-border bg-secondary/50 px-4 py-3 hover:border-primary/40 transition-colors"
              >
                <div className="flex items-center gap-4 flex-1">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-primary text-sm font-bold text-primary-foreground">
                    {idx + 1}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium truncate">{ranking.athlete_name}</p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <Badge variant="secondary" className="text-base font-bold tabular-nums">
                    {ranking.points} pts
                  </Badge>

                  {isOwner && (
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => updatePoints(ranking.id, ranking.points + 1)}
                        className="h-8 px-2"
                      >
                        +1
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          updatePoints(ranking.id, Math.max(0, ranking.points - 1))
                        }
                        className="h-8 px-2"
                      >
                        -1
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => deleteRanking(ranking.id)}
                        className="h-8 w-8 p-0"
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  )}
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </motion.section>

      {rankings.length > 0 && (
        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="rounded-xl border border-border bg-gradient-to-b from-primary/10 to-transparent p-6"
        >
          <h3 className="mb-4 text-lg font-semibold">Pódio</h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {rankings[1] && (
              <div className="flex flex-col items-center rounded-lg border border-border bg-card p-4 shadow-card order-first sm:order-none">
                <div className="mb-2 text-3xl font-bold text-secondary">🥈</div>
                <p className="text-sm font-medium text-center truncate">{rankings[1].athlete_name}</p>
                <p className="text-lg font-bold text-primary">{rankings[1].points} pts</p>
              </div>
            )}
            {rankings[0] && (
              <div className="flex flex-col items-center rounded-lg border-2 border-primary bg-gradient-primary p-4 shadow-lg order-none sm:order-first">
                <div className="mb-2 text-4xl font-bold">🥇</div>
                <p className="text-sm font-medium text-center text-primary-foreground truncate">{rankings[0].athlete_name}</p>
                <p className="text-xl font-bold text-primary-foreground">{rankings[0].points} pts</p>
              </div>
            )}
            {rankings[2] && (
              <div className="flex flex-col items-center rounded-lg border border-border bg-card p-4 shadow-card order-last">
                <div className="mb-2 text-3xl font-bold text-muted">🥉</div>
                <p className="text-sm font-medium text-center truncate">{rankings[2].athlete_name}</p>
                <p className="text-lg font-bold text-primary">{rankings[2].points} pts</p>
              </div>
            )}
          </div>
        </motion.section>
      )}
    </div>
  );
};

export default RankingsTab;
