import { useState, useEffect, useCallback } from "react";
import { publicQuery } from "@/lib/organizerApi";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "framer-motion";
import { Trophy, CheckCircle, XCircle, Gamepad2, RotateCcw, Medal, Star, Flame, Crown, Trash2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface QuizQuestion {
  id: string;
  question: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  correct_option: string;
}

interface QuizScore {
  id: string;
  player_name: string;
  score: number;
  total_questions: number;
  created_at: string;
}

const sportLabels: Record<string, string> = {
  beach_volleyball: "Vôlei de Praia",
  futevolei: "Futevôlei",
  beach_tennis: "Beach Tennis",
};

const QUIZ_SIZE = 10;

const SportQuiz = ({ tournamentId, sport, isAdmin = false }: { tournamentId: string; sport: string; isAdmin?: boolean }) => {
  const [phase, setPhase] = useState<"start" | "playing" | "bonus" | "result">("start");
  const [playerName, setPlayerName] = useState("");
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [allQuestions, setAllQuestions] = useState<QuizQuestion[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [showFeedback, setShowFeedback] = useState(false);
  const [correctCount, setCorrectCount] = useState(0);
  const [wrongCount, setWrongCount] = useState(0);
  const [bonusCount, setBonusCount] = useState(0);
  const [bonusQuestion, setBonusQuestion] = useState<QuizQuestion | null>(null);
  const [bonusUsed, setBonusUsed] = useState<Set<string>>(new Set());
  const [ranking, setRanking] = useState<QuizScore[]>([]);
  const [loadingRanking, setLoadingRanking] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const deleteScore = async (scoreId: string, playerName: string) => {
    if (!confirm(`Excluir a pontuação de "${playerName}" do ranking?`)) return;
    setDeletingId(scoreId);
    const token = sessionStorage.getItem("organizer_token");
    const organizerId = sessionStorage.getItem("organizer_id");
    const { error } = await supabase.functions.invoke("organizer-api", {
      body: { token, organizerId, table: "quiz_scores", operation: "delete", filters: { id: scoreId } },
    });
    if (error) {
      toast({ title: "Erro ao excluir", description: "Não foi possível excluir a pontuação.", variant: "destructive" });
    } else {
      toast({ title: "Excluído", description: `Pontuação de "${playerName}" removida.` });
      await fetchRanking();
    }
    setDeletingId(null);
  };

  const fetchRanking = useCallback(async () => {
    setLoadingRanking(true);
    const { data } = await publicQuery<QuizScore[]>({
      table: "quiz_scores",
      filters: { tournament_id: tournamentId, sport },
      order: [{ column: "score", ascending: false }, { column: "created_at", ascending: true }],
    });
    setRanking(data || []);
    setLoadingRanking(false);
  }, [tournamentId, sport]);

  useEffect(() => {
    fetchRanking();
  }, [fetchRanking]);

  const startQuiz = async () => {
    if (!playerName.trim()) return;
    const { data } = await publicQuery<QuizQuestion[]>({
      table: "quiz_questions",
      filters: { sport },
    });
    if (data && data.length > 0) {
      const shuffled = data.sort(() => Math.random() - 0.5);
      const selected = shuffled.slice(0, QUIZ_SIZE);
      setAllQuestions(shuffled);
      setQuestions(selected);
      setCurrentIndex(0);
      setCorrectCount(0);
      setWrongCount(0);
      setBonusCount(0);
      setBonusQuestion(null);
      setBonusUsed(new Set(selected.map(q => q.id)));
      setSelectedAnswer(null);
      setShowFeedback(false);
      setPhase("playing");
    }
  };

  const handleAnswer = (option: string) => {
    if (showFeedback) return;
    setSelectedAnswer(option);
    setShowFeedback(true);
    const isCorrect = option === questions[currentIndex].correct_option;
    if (isCorrect) setCorrectCount((c) => c + 1);
    else setWrongCount((c) => c + 1);

    setTimeout(() => {
      if (currentIndex + 1 < questions.length) {
        setCurrentIndex((i) => i + 1);
        setSelectedAnswer(null);
        setShowFeedback(false);
      } else {
        const finalCorrect = isCorrect ? correctCount + 1 : correctCount;
        if (finalCorrect === QUIZ_SIZE) {
          // Perfect score — enter bonus round
          startBonusRound();
        } else {
          finishQuizFn(finalCorrect, 0);
        }
      }
    }, 1200);
  };

  const startBonusRound = () => {
    const remaining = allQuestions.filter(q => !bonusUsed.has(q.id));
    if (remaining.length === 0) {
      finishQuizFn(QUIZ_SIZE, 0);
      return;
    }
    const next = remaining[Math.floor(Math.random() * remaining.length)];
    setBonusUsed(prev => new Set(prev).add(next.id));
    setBonusQuestion(next);
    setBonusCount(0);
    setSelectedAnswer(null);
    setShowFeedback(false);
    setPhase("bonus");
  };

  const handleBonusAnswer = (option: string) => {
    if (showFeedback || !bonusQuestion) return;
    setSelectedAnswer(option);
    setShowFeedback(true);
    const isCorrect = option === bonusQuestion.correct_option;

    setTimeout(() => {
      if (isCorrect) {
        const newBonusCount = bonusCount + 1;
        setBonusCount(newBonusCount);
        // Get next bonus question
        const remaining = allQuestions.filter(q => !bonusUsed.has(q.id));
        if (remaining.length === 0) {
          finishQuizFn(QUIZ_SIZE, newBonusCount);
          return;
        }
        const next = remaining[Math.floor(Math.random() * remaining.length)];
        setBonusUsed(prev => new Set(prev).add(next.id));
        setBonusQuestion(next);
        setSelectedAnswer(null);
        setShowFeedback(false);
      } else {
        finishQuizFn(QUIZ_SIZE, bonusCount);
      }
    }, 1200);
  };

  const finishQuizFn = async (finalScore: number, bonus: number) => {
    setSubmitting(true);
    setBonusCount(bonus);
    setPhase("result");
    const totalAnswered = QUIZ_SIZE + bonus;
    const totalCorrect = finalScore + bonus;
    await supabase.functions.invoke("organizer-api", {
      body: {
        table: "quiz_scores",
        operation: "insert",
        data: {
          tournament_id: tournamentId,
          player_name: playerName.trim(),
          sport,
          score: totalCorrect,
          total_questions: totalAnswered,
        },
      },
    });
    await fetchRanking();
    setSubmitting(false);
  };

  const resetQuiz = () => {
    setPhase("start");
    setPlayerName("");
    setQuestions([]);
    setAllQuestions([]);
    setCurrentIndex(0);
    setSelectedAnswer(null);
    setShowFeedback(false);
    setCorrectCount(0);
    setWrongCount(0);
    setBonusCount(0);
    setBonusQuestion(null);
    setBonusUsed(new Set());
  };

  const optionLabels = ["a", "b", "c", "d"] as const;
  const optionKeys: Record<string, keyof QuizQuestion> = {
    a: "option_a",
    b: "option_b",
    c: "option_c",
    d: "option_d",
  };

  return (
    <div className="space-y-6">
      {/* RANKING */}
      <section className="rounded-xl border border-border bg-card p-4 sm:p-6 shadow-card">
        <h3 className="text-lg font-semibold flex items-center gap-2 mb-3">
          <Medal className="h-5 w-5 text-primary" /> Ranking do Quiz — {sportLabels[sport] || sport}
        </h3>
        {loadingRanking ? (
          <div className="flex justify-center py-4">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        ) : ranking.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum jogador ainda. Seja o primeiro!</p>
        ) : (
          <div className="space-y-1.5 max-h-[300px] overflow-y-auto">
            {ranking.map((r, i) => (
              <div
                key={r.id}
                className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm ${
                  i === 0
                    ? "bg-primary/15 border border-primary/30 font-bold"
                    : i === 1
                    ? "bg-primary/10 border border-primary/20"
                    : i === 2
                    ? "bg-primary/5 border border-primary/10"
                    : "bg-secondary/50 border border-border"
                }`}
              >
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-muted text-xs font-bold text-muted-foreground shrink-0">
                  {i < 3 ? ["🥇", "🥈", "🥉"][i] : i + 1}
                </span>
                <span className="flex-1 truncate">{r.player_name}</span>
                <span className="font-mono font-bold text-primary">
                  {r.score}/{r.total_questions}
                </span>
                {isAdmin && (
                  <button
                    onClick={() => deleteScore(r.id, r.player_name)}
                    disabled={deletingId === r.id}
                    className="ml-1 p-1 rounded hover:bg-destructive/15 text-muted-foreground hover:text-destructive transition-colors shrink-0 disabled:opacity-50"
                    title={`Excluir ${r.player_name}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* QUIZ AREA */}
      <section className="relative rounded-xl border-2 border-primary/40 bg-gradient-to-br from-primary/5 via-card to-primary/5 p-4 sm:p-6 shadow-lg shadow-primary/10 overflow-hidden">
        {/* Animated border glow */}
        <motion.div
          className="absolute inset-0 rounded-xl border-2 border-primary/20 pointer-events-none"
          animate={{ opacity: [0.3, 0.7, 0.3] }}
          transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
        />
        {/* Header badge */}
        <div className="flex justify-center mb-4">
          <motion.div
            className="inline-flex items-center gap-2 rounded-full bg-primary/15 border border-primary/30 px-4 py-1.5"
            animate={{ scale: [1, 1.03, 1] }}
            transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
          >
            <Gamepad2 className="h-4 w-4 text-primary" />
            <span className="text-xs font-bold text-primary uppercase tracking-wider">Mini Game</span>
          </motion.div>
        </div>
        <AnimatePresence mode="wait">
          {phase === "start" && (
            <motion.div
              key="start"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-4 text-center"
            >
              <Gamepad2 className="h-12 w-12 mx-auto text-primary" />
              <h3 className="text-xl font-bold">Quiz {sportLabels[sport] || sport}</h3>
              <p className="text-sm text-muted-foreground">
                Teste seus conhecimentos! {QUIZ_SIZE} perguntas aleatórias.
                <br />
                <span className="text-xs">🔥 Acertou tudo? Rodada bônus para disputar o 1º lugar!</span>
              </p>
              <input
                type="text"
                placeholder="Digite seu nome"
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && startQuiz()}
                className="w-full max-w-xs mx-auto rounded-lg border border-border bg-background px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                maxLength={30}
              />
              <div>
                <Button
                  onClick={startQuiz}
                  disabled={!playerName.trim()}
                  className="gap-2"
                >
                  <Gamepad2 className="h-4 w-4" /> Começar Quiz
                </Button>
              </div>
            </motion.div>
          )}

          {phase === "playing" && questions[currentIndex] && (
            <motion.div
              key={`q-${currentIndex}`}
              initial={{ opacity: 0, x: 30 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -30 }}
              className="space-y-4"
            >
              <div className="flex items-center justify-between text-sm text-muted-foreground">
                <span>Pergunta {currentIndex + 1}/{questions.length}</span>
                <span className="flex items-center gap-3">
                  <span className="text-green-500 flex items-center gap-1">
                    <CheckCircle className="h-3.5 w-3.5" /> {correctCount}
                  </span>
                  <span className="text-red-500 flex items-center gap-1">
                    <XCircle className="h-3.5 w-3.5" /> {wrongCount}
                  </span>
                </span>
              </div>

              {/* Progress bar */}
              <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-all duration-300"
                  style={{ width: `${((currentIndex + 1) / questions.length) * 100}%` }}
                />
              </div>

              <p className="text-base sm:text-lg font-medium">{questions[currentIndex].question}</p>

              <div className="grid gap-2">
                {optionLabels.map((opt) => {
                  const isCorrect = questions[currentIndex].correct_option === opt;
                  const isSelected = selectedAnswer === opt;
                  let className =
                    "w-full text-left rounded-lg border px-4 py-3 text-sm transition-all ";

                  if (showFeedback) {
                    if (isCorrect)
                      className += "border-green-500 bg-green-500/15 text-green-400 font-semibold";
                    else if (isSelected)
                      className += "border-red-500 bg-red-500/15 text-red-400";
                    else className += "border-border bg-secondary/30 text-muted-foreground opacity-60";
                  } else {
                    className +=
                      "border-border bg-secondary/50 hover:border-primary/50 hover:bg-primary/5 cursor-pointer";
                  }

                  return (
                    <button
                      key={opt}
                      onClick={() => handleAnswer(opt)}
                      disabled={showFeedback}
                      className={className}
                    >
                      <span className="font-bold mr-2 uppercase">{opt})</span>
                      {questions[currentIndex][optionKeys[opt]] as string}
                    </button>
                  );
                })}
              </div>
            </motion.div>
          )}

          {phase === "bonus" && bonusQuestion && (
            <motion.div
              key={`bonus-${bonusCount}`}
              initial={{ opacity: 0, x: 30 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -30 }}
              className="space-y-4"
            >
              <div className="flex items-center justify-between text-sm">
                <motion.span
                  className="inline-flex items-center gap-1.5 rounded-full bg-primary/15 border border-primary/30 px-3 py-1 text-xs font-bold text-primary uppercase"
                  animate={{ scale: [1, 1.05, 1] }}
                  transition={{ duration: 1.5, repeat: Infinity }}
                >
                  <Flame className="h-3.5 w-3.5" /> Rodada Bônus
                </motion.span>
                <span className="text-muted-foreground">
                  +{bonusCount} bônus
                </span>
              </div>

              <p className="text-xs text-muted-foreground text-center">
                🔥 10/10! Continue acertando para subir no ranking. Um erro encerra a rodada bônus.
              </p>

              <p className="text-base sm:text-lg font-medium">{bonusQuestion.question}</p>

              <div className="grid gap-2">
                {optionLabels.map((opt) => {
                  const isCorrect = bonusQuestion.correct_option === opt;
                  const isSelected = selectedAnswer === opt;
                  let cls = "w-full text-left rounded-lg border px-4 py-3 text-sm transition-all ";

                  if (showFeedback) {
                    if (isCorrect) cls += "border-green-500 bg-green-500/15 text-green-400 font-semibold";
                    else if (isSelected) cls += "border-red-500 bg-red-500/15 text-red-400";
                    else cls += "border-border bg-secondary/30 text-muted-foreground opacity-60";
                  } else {
                    cls += "border-primary/30 bg-primary/5 hover:border-primary/50 hover:bg-primary/10 cursor-pointer";
                  }

                  return (
                    <button key={opt} onClick={() => handleBonusAnswer(opt)} disabled={showFeedback} className={cls}>
                      <span className="font-bold mr-2 uppercase">{opt})</span>
                      {bonusQuestion[optionKeys[opt]] as string}
                    </button>
                  );
                })}
              </div>
            </motion.div>
          )}

          {phase === "result" && (
            <motion.div
              key="result"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-5 text-center relative overflow-hidden"
            >
              {(correctCount + bonusCount) >= 8 && (
                <>
                  <motion.div
                    className="absolute inset-0 -z-10 rounded-xl"
                    initial={{ opacity: 0 }}
                    animate={{
                      opacity: [0, 0.15, 0.08, 0.15],
                      background: [
                        "radial-gradient(circle, hsl(var(--primary) / 0.3) 0%, transparent 70%)",
                        "radial-gradient(circle, hsl(var(--primary) / 0.5) 0%, transparent 70%)",
                        "radial-gradient(circle, hsl(var(--primary) / 0.3) 0%, transparent 70%)",
                      ],
                    }}
                    transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                  />
                  {[...Array(8)].map((_, i) => (
                    <motion.div
                      key={i}
                      className="absolute text-primary/40"
                      initial={{ x: `${10 + Math.random() * 80}%`, y: "100%", opacity: 0, scale: 0.5 + Math.random() * 0.5, rotate: 0 }}
                      animate={{ y: "-20%", opacity: [0, 0.8, 0], rotate: 360 }}
                      transition={{ duration: 2.5 + Math.random() * 2, delay: i * 0.3, repeat: Infinity, ease: "easeOut" }}
                    >
                      <Star className="h-4 w-4 fill-current" />
                    </motion.div>
                  ))}
                </>
              )}

              {/* Icon */}
              {bonusCount > 0 ? (
                <motion.div
                  initial={{ scale: 0, rotate: -180 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{ type: "spring", stiffness: 200, damping: 12, delay: 0.2 }}
                >
                  <div className="relative mx-auto w-fit">
                    <Crown className="h-16 w-16 text-primary mx-auto" />
                    <motion.div animate={{ scale: [1, 1.2, 1] }} transition={{ duration: 1.5, repeat: Infinity }} className="absolute -top-1 -right-1">
                      <Flame className="h-6 w-6 text-primary" />
                    </motion.div>
                  </div>
                </motion.div>
              ) : correctCount >= 8 ? (
                <motion.div initial={{ scale: 0, rotate: -180 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: "spring", stiffness: 200, damping: 12, delay: 0.2 }}>
                  {correctCount === QUIZ_SIZE ? (
                    <div className="relative mx-auto w-fit">
                      <Crown className="h-16 w-16 text-primary mx-auto" />
                      <motion.div animate={{ scale: [1, 1.2, 1] }} transition={{ duration: 1.5, repeat: Infinity }} className="absolute -top-1 -right-1">
                        <Flame className="h-6 w-6 text-primary" />
                      </motion.div>
                    </div>
                  ) : (
                    <Trophy className="h-16 w-16 text-primary mx-auto" />
                  )}
                </motion.div>
              ) : (
                <Trophy className="h-14 w-14 mx-auto text-primary" />
              )}

              {/* Title */}
              {bonusCount > 0 ? (
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}>
                  <h3 className="text-2xl font-bold bg-gradient-to-r from-primary via-primary/80 to-primary bg-clip-text text-transparent">
                    🔥 LENDÁRIO! 🔥
                  </h3>
                  <p className="text-xs text-muted-foreground mt-1">
                    10/10 + {bonusCount} bônus! Você é imparável!
                  </p>
                </motion.div>
              ) : correctCount >= 8 ? (
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}>
                  <h3 className="text-2xl font-bold bg-gradient-to-r from-primary via-primary/80 to-primary bg-clip-text text-transparent">
                    {correctCount === QUIZ_SIZE ? "🔥 PERFEITO! 🔥" : correctCount === 9 ? "⭐ INCRÍVEL!" : "🏆 EXCELENTE!"}
                  </h3>
                  <p className="text-xs text-muted-foreground mt-1">
                    {correctCount === QUIZ_SIZE ? "Você é um verdadeiro especialista!" : correctCount === 9 ? "Quase perfeito! Impressionante!" : "Você manda muito bem!"}
                  </p>
                </motion.div>
              ) : (
                <h3 className="text-2xl font-bold">Resultado</h3>
              )}

              <motion.p className="text-lg" initial={(correctCount + bonusCount) >= 8 ? { opacity: 0, y: 10 } : {}} animate={{ opacity: 1, y: 0 }} transition={{ delay: (correctCount + bonusCount) >= 8 ? 0.6 : 0 }}>
                <span className="font-semibold">{playerName}</span>, você acertou{" "}
                <motion.span className="text-primary font-bold text-xl" animate={(correctCount + bonusCount) >= 8 ? { scale: [1, 1.3, 1] } : {}} transition={{ duration: 0.5, delay: 0.8 }}>
                  {correctCount + bonusCount}
                </motion.span>{" "}
                de <span className="font-bold">{QUIZ_SIZE + bonusCount + (correctCount === QUIZ_SIZE && bonusCount === 0 ? 0 : correctCount === QUIZ_SIZE ? 1 : 0)}</span> perguntas!
              </motion.p>

              {bonusCount > 0 && (
                <p className="text-xs text-muted-foreground">
                  ✨ {QUIZ_SIZE}/{QUIZ_SIZE} base + {bonusCount} bônus
                </p>
              )}

              <div className="flex justify-center gap-6 text-sm">
                <span className="flex items-center gap-1.5 text-primary">
                  <CheckCircle className="h-5 w-5" /> {correctCount + bonusCount} acertos
                </span>
                <span className="flex items-center gap-1.5 text-destructive">
                  <XCircle className="h-5 w-5" /> {wrongCount + (correctCount === QUIZ_SIZE ? 1 : 0)} erros
                </span>
              </div>
              {submitting ? (
                <p className="text-sm text-muted-foreground">Salvando pontuação...</p>
              ) : (
                <Button onClick={resetQuiz} variant="outline" className="gap-2">
                  <RotateCcw className="h-4 w-4" /> Jogar Novamente
                </Button>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </section>
    </div>
  );
};

export default SportQuiz;
