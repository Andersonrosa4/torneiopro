import { useState, useEffect } from "react";
import { publicQuery } from "@/lib/organizerApi";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Gamepad2 } from "lucide-react";

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

const MiniGameRankings = ({ sport }: MiniGameRankingsProps) => {
  const [quizScores, setQuizScores] = useState<QuizScore[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAll = async () => {
      setLoading(true);
      const quizRes = await publicQuery<QuizScore[]>({
        table: "quiz_scores",
        filters: { sport },
        order: [{ column: "score", ascending: false }, { column: "created_at", ascending: true }],
      });
      setQuizScores(quizRes.data || []);
      setLoading(false);
    };
    fetchAll();
  }, [sport]);

  const medalColors = ["text-amber-400", "text-slate-300", "text-orange-400"];

  if (loading) {
    return (
      <Card className="border-[hsl(0_0%_100%/0.1)] bg-[hsl(220_15%_10%/0.8)]">
        <CardContent className="p-4 flex justify-center">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div>
      <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
        <Gamepad2 className="h-4 w-4" /> Ranking Quiz
      </h2>
      <Card className="border-[hsl(0_0%_100%/0.1)] bg-[hsl(220_15%_10%/0.8)] backdrop-blur-md">
        <CardContent className="p-3">
          {quizScores.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              Nenhum registro ainda. Seja o primeiro! 🎮
            </p>
          ) : (
            <div className="space-y-1.5">
              {quizScores.map((item, i) => (
                <div
                  key={item.id}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2 ${
                    i < 3 ? "bg-[hsl(220_15%_12%)] border border-[hsl(0_0%_100%/0.1)]" : "bg-[hsl(220_15%_10%/0.5)]"
                  }`}
                >
                  <span className={`text-sm font-bold w-6 text-center ${i < 3 ? medalColors[i] : "text-muted-foreground"}`}>
                    {i < 3 ? ["🥇", "🥈", "🥉"][i] : `${i + 1}º`}
                  </span>
                  <span className="flex-1 text-sm font-medium text-foreground truncate">{item.player_name}</span>
                  <Badge variant="secondary" className="text-xs font-bold">
                    {item.score} pts
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default MiniGameRankings;

