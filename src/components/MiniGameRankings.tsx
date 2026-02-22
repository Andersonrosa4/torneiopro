import { useState, useEffect } from "react";
import { publicQuery } from "@/lib/organizerApi";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Trophy, Gamepad2 } from "lucide-react";

interface MiniGameRankingsProps {
  sport: string;
}

interface QuizScore {
  id: string;
  player_name: string;
  score: number;
  total_questions: number;
  sport: string;
  tournament_id: string;
  created_at: string;
}

interface GameScore {
  id: string;
  player_name: string;
  score: number;
  game_type: string;
  sport: string;
  tournament_id: string;
  created_at: string;
}

const MiniGameRankings = ({ sport }: MiniGameRankingsProps) => {
  const [quizScores, setQuizScores] = useState<QuizScore[]>([]);
  const [rallyScores, setRallyScores] = useState<GameScore[]>([]);
  const [volleyScores, setVolleyScores] = useState<GameScore[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAll = async () => {
      setLoading(true);
      const [quizRes, rallyRes, volleyRes] = await Promise.all([
        publicQuery<QuizScore[]>({
          table: "quiz_scores",
          filters: { sport },
          order: [{ column: "score", ascending: false }, { column: "created_at", ascending: true }],
        }),
        publicQuery<GameScore[]>({
          table: "game_scores",
          filters: { sport, game_type: "rally" },
          order: [{ column: "score", ascending: false }, { column: "created_at", ascending: true }],
        }),
        publicQuery<GameScore[]>({
          table: "game_scores",
          filters: { sport, game_type: "volley_pong" },
          order: [{ column: "score", ascending: false }, { column: "created_at", ascending: true }],
        }),
      ]);
      setQuizScores(quizRes.data || []);
      setRallyScores(rallyRes.data || []);
      setVolleyScores(volleyRes.data || []);
      setLoading(false);
    };
    fetchAll();
  }, [sport]);

  const medalColors = ["text-amber-400", "text-slate-300", "text-orange-400"];

  const renderList = (items: { player_name: string; score: number }[], suffix = "pts") => {
    if (items.length === 0) {
      return <p className="text-sm text-muted-foreground text-center py-4">Nenhum registro ainda. Seja o primeiro! 🎮</p>;
    }
    return (
      <div className="space-y-1.5">
        {items.map((item, i) => (
          <div
            key={i}
            className={`flex items-center gap-3 rounded-lg px-3 py-2 ${
              i < 3 ? "bg-[hsl(220_15%_12%)] border border-[hsl(0_0%_100%/0.1)]" : "bg-[hsl(220_15%_10%/0.5)]"
            }`}
          >
            <span className={`text-sm font-bold w-6 text-center ${i < 3 ? medalColors[i] : "text-muted-foreground"}`}>
              {i < 3 ? ["🥇", "🥈", "🥉"][i] : `${i + 1}º`}
            </span>
            <span className="flex-1 text-sm font-medium text-foreground truncate">{item.player_name}</span>
            <Badge variant="secondary" className="text-xs font-bold">
              {item.score} {suffix}
            </Badge>
          </div>
        ))}
      </div>
    );
  };

  if (loading) {
    return (
      <Card className="border-[hsl(0_0%_100%/0.1)] bg-[hsl(220_15%_10%/0.8)]">
        <CardContent className="p-4 flex justify-center">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </CardContent>
      </Card>
    );
  }

  const hasAny = quizScores.length > 0 || rallyScores.length > 0 || volleyScores.length > 0;

  return (
    <div>
      <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
        <Gamepad2 className="h-4 w-4" /> Rankings Mini-Games
      </h2>
      <Card className="border-[hsl(0_0%_100%/0.1)] bg-[hsl(220_15%_10%/0.8)] backdrop-blur-md">
        <CardContent className="p-3">
          {!hasAny ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              Nenhum ranking de mini-games ainda. Jogue nos torneios para aparecer aqui! 🎮
            </p>
          ) : (
            <Tabs defaultValue={quizScores.length > 0 ? "quiz" : rallyScores.length > 0 ? "rally" : "volley"}>
              <TabsList className="w-full bg-[hsl(220_15%_14%)] mb-3">
                <TabsTrigger value="quiz" className="flex-1 text-xs">🎮 Quiz</TabsTrigger>
                <TabsTrigger value="rally" className="flex-1 text-xs">⚡ Rally</TabsTrigger>
                <TabsTrigger value="volley" className="flex-1 text-xs">🏐 Vôlei</TabsTrigger>
              </TabsList>
              <TabsContent value="quiz">{renderList(quizScores, "pts")}</TabsContent>
              <TabsContent value="rally">{renderList(rallyScores, "pts")}</TabsContent>
              <TabsContent value="volley">{renderList(volleyScores, "pts")}</TabsContent>
            </Tabs>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default MiniGameRankings;
