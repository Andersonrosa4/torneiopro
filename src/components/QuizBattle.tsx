import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { motion, AnimatePresence } from "framer-motion";
import { Swords, Users, Copy, Crown, CheckCircle, XCircle, Trophy, ArrowLeft, Zap, Timer, Flame } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface QuizBattleProps {
  tournamentId: string;
  sport: string;
  onBack: () => void;
}

const sportLabels: Record<string, string> = {
  beach_volleyball: "Vôlei de Praia",
  futevolei: "Futevôlei",
  beach_tennis: "Beach Tennis",
  tennis: "Tênis",
  padel: "Padel",
  futsal: "Futsal",
};

type Phase = "menu" | "lobby" | "playing" | "feedback" | "finished";

const QuizBattle = ({ tournamentId, sport, onBack }: QuizBattleProps) => {
  const [phase, setPhase] = useState<Phase>("menu");
  const [playerName, setPlayerName] = useState("");
  const [roomCode, setRoomCode] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [roomId, setRoomId] = useState("");
  const [playerId, setPlayerId] = useState("");
  const [isHost, setIsHost] = useState(false);
  const [players, setPlayers] = useState<any[]>([]);
  const [questions, setQuestions] = useState<any[]>([]);
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [totalQuestions, setTotalQuestions] = useState(10);
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [showFeedback, setShowFeedback] = useState(false);
  const [correctOption, setCorrectOption] = useState<string | null>(null);
  const [answeredBy, setAnsweredBy] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const feedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── API helper ──
  const callApi = async (action: string, params: Record<string, any>) => {
    const { data, error } = await supabase.functions.invoke("quiz-battle-api", {
      body: { action, ...params },
    });
    if (error) throw error;
    if (data?.error) throw new Error(data.error);
    return data;
  };

  // ── Create Room ──
  const createRoom = async () => {
    if (!playerName.trim()) return;
    setLoading(true);
    try {
      const data = await callApi("create_room", {
        tournament_id: tournamentId,
        sport,
        host_name: playerName.trim(),
      });
      setRoomId(data.room.id);
      setRoomCode(data.room.code);
      setPlayerId(data.player.id);
      setIsHost(true);
      setQuestions(data.room.questions);
      setTotalQuestions(data.room.total_questions);
      setPlayers([data.player]);
      setPhase("lobby");
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    }
    setLoading(false);
  };

  // ── Join Room ──
  const joinRoom = async () => {
    if (!playerName.trim() || !joinCode.trim()) return;
    setLoading(true);
    try {
      const data = await callApi("join_room", {
        code: joinCode.trim().toUpperCase(),
        player_name: playerName.trim(),
      });
      setRoomId(data.room.id);
      setRoomCode(data.room.code);
      setPlayerId(data.player.id);
      setIsHost(false);
      setQuestions(data.room.questions);
      setTotalQuestions(data.room.total_questions);
      setPhase("lobby");
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    }
    setLoading(false);
  };

  // ── Start Game (host only) ──
  const startGame = async () => {
    if (players.length < 2) {
      toast({ title: "Aguarde", description: "Precisa de pelo menos 2 jogadores." });
      return;
    }
    setLoading(true);
    try {
      await callApi("start_game", { room_id: roomId });
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    }
    setLoading(false);
  };

  // ── Submit Answer ──
  const submitAnswer = async (option: string) => {
    if (showFeedback || selectedAnswer) return;
    setSelectedAnswer(option);
    try {
      const data = await callApi("submit_answer", {
        room_id: roomId,
        player_id: playerId,
        answer: option,
        question_index: currentQuestion,
      });
      setCorrectOption(data.correct_option);
      if (data.correct && !data.already_answered) {
        setAnsweredBy(playerId);
      }
      setShowFeedback(true);
    } catch (e: any) {
      // If already advanced, just wait for realtime
      if (!e.message?.includes("already")) {
        toast({ title: "Erro", description: e.message, variant: "destructive" });
      }
      setSelectedAnswer(null);
    }
  };

  // ── Next Question (host) ──
  const nextQuestion = async () => {
    try {
      await callApi("next_question", { room_id: roomId });
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    }
  };

  // ── Realtime: listen to room changes ──
  useEffect(() => {
    if (!roomId) return;

    const channel = supabase
      .channel(`quiz-battle-${roomId}`)
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "quiz_rooms",
        filter: `id=eq.${roomId}`,
      }, (payload) => {
        const room = payload.new as any;
        if (!room) return;

        if (room.status === "playing") {
          setCurrentQuestion(room.current_question);
          setSelectedAnswer(null);
          setShowFeedback(false);
          setCorrectOption(null);
          setAnsweredBy(null);
          setPhase("playing");
        }
        
        if (room.status === "finished") {
          setPhase("finished");
        }

        // Someone answered the current question
        if (room.question_answered_by && room.status === "playing") {
          setAnsweredBy(room.question_answered_by);
          // Show correct answer from questions
          const q = (room.questions as any[])?.[room.current_question];
          if (q) setCorrectOption(q.correct_option);
          setShowFeedback(true);
        }
      })
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "quiz_room_players",
        filter: `room_id=eq.${roomId}`,
      }, async () => {
        // Refresh players list
        const { data } = await supabase
          .from("quiz_room_players")
          .select("*")
          .eq("room_id", roomId)
          .order("created_at", { ascending: true });
        if (data) setPlayers(data);
      })
      .subscribe();

    // Initial fetch of players
    supabase
      .from("quiz_room_players")
      .select("*")
      .eq("room_id", roomId)
      .order("created_at", { ascending: true })
      .then(({ data }) => { if (data) setPlayers(data); });

    return () => { supabase.removeChannel(channel); };
  }, [roomId]);

  // ── Auto-advance after feedback (host only) ──
  useEffect(() => {
    if (!showFeedback || !isHost) return;
    if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
    
    setCountdown(3);
    let c = 3;
    const interval = setInterval(() => {
      c--;
      setCountdown(c);
      if (c <= 0) {
        clearInterval(interval);
        setCountdown(null);
        nextQuestion();
      }
    }, 1000);

    feedbackTimerRef.current = setTimeout(() => {}, 3500);
    return () => { clearInterval(interval); if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current); };
  }, [showFeedback, isHost]);

  const copyCode = () => {
    navigator.clipboard.writeText(roomCode);
    toast({ title: "Copiado!", description: `Código ${roomCode} copiado.` });
  };

  const optionLabels = ["a", "b", "c", "d"] as const;
  const optionKeys: Record<string, string> = { a: "option_a", b: "option_b", c: "option_c", d: "option_d" };

  const currentQ = questions[currentQuestion];
  const myPlayer = players.find(p => p.id === playerId);
  const answeredByPlayer = players.find(p => p.id === answeredBy);
  const sortedPlayers = [...players].sort((a, b) => b.score - a.score);

  return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" onClick={onBack} className="gap-2 mb-2">
        <ArrowLeft className="h-4 w-4" /> Voltar ao Quiz Solo
      </Button>

      <AnimatePresence mode="wait">
        {/* ── MENU: Create or Join ── */}
        {phase === "menu" && (
          <motion.div key="menu" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
            className="space-y-6 text-center"
          >
            <div className="flex justify-center">
              <motion.div className="inline-flex items-center gap-2 rounded-full bg-primary/15 border border-primary/30 px-4 py-1.5"
                animate={{ scale: [1, 1.03, 1] }} transition={{ duration: 2, repeat: Infinity }}
              >
                <Swords className="h-4 w-4 text-primary" />
                <span className="text-xs font-bold text-primary uppercase tracking-wider">Quiz Battle</span>
              </motion.div>
            </div>

            <h3 className="text-xl font-bold">⚔️ Quiz Battle — {sportLabels[sport] || sport}</h3>
            <p className="text-sm text-muted-foreground">
              Quem responder certo primeiro, marca o ponto!
            </p>

            <Input
              placeholder="Seu nome"
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              maxLength={25}
              className="max-w-xs mx-auto"
            />

            <div className="grid gap-3 max-w-sm mx-auto">
              <Button onClick={createRoom} disabled={!playerName.trim() || loading} className="gap-2 h-12">
                <Crown className="h-4 w-4" /> Criar Sala
              </Button>

              <div className="flex items-center gap-2">
                <div className="flex-1 h-px bg-border" />
                <span className="text-xs text-muted-foreground">ou</span>
                <div className="flex-1 h-px bg-border" />
              </div>

              <div className="flex gap-2">
                <Input
                  placeholder="Código da sala"
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                  maxLength={5}
                  className="font-mono tracking-widest text-center uppercase"
                />
                <Button onClick={joinRoom} disabled={!playerName.trim() || !joinCode.trim() || loading} variant="outline" className="gap-2 shrink-0">
                  <Users className="h-4 w-4" /> Entrar
                </Button>
              </div>
            </div>
          </motion.div>
        )}

        {/* ── LOBBY ── */}
        {phase === "lobby" && (
          <motion.div key="lobby" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
            className="space-y-5 text-center"
          >
            <h3 className="text-xl font-bold">Sala de Espera</h3>

            <div className="flex items-center justify-center gap-3">
              <span className="text-3xl font-mono font-bold tracking-[0.4em] text-primary bg-primary/10 px-5 py-2 rounded-xl border border-primary/30">
                {roomCode}
              </span>
              <Button variant="ghost" size="icon" onClick={copyCode}>
                <Copy className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">Compartilhe o código para outros jogadores entrarem</p>

            <div className="space-y-2 max-w-xs mx-auto">
              <h4 className="text-sm font-semibold flex items-center gap-2 justify-center">
                <Users className="h-4 w-4" /> Jogadores ({players.length})
              </h4>
              {players.map((p) => (
                <div key={p.id} className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
                  p.id === playerId ? "border-primary/40 bg-primary/10" : "border-border bg-secondary/50"
                }`}>
                  {p.is_host && <Crown className="h-3.5 w-3.5 text-primary" />}
                  <span className="flex-1">{p.player_name}</span>
                  {p.id === playerId && <span className="text-xs text-muted-foreground">(você)</span>}
                </div>
              ))}

              {players.length < 2 && (
                <motion.p className="text-xs text-muted-foreground mt-2"
                  animate={{ opacity: [0.5, 1, 0.5] }} transition={{ duration: 2, repeat: Infinity }}
                >
                  Aguardando jogadores...
                </motion.p>
              )}
            </div>

            {isHost && (
              <Button onClick={startGame} disabled={players.length < 2 || loading} className="gap-2">
                <Zap className="h-4 w-4" /> Iniciar Partida
              </Button>
            )}
            {!isHost && (
              <p className="text-sm text-muted-foreground">Aguardando o host iniciar...</p>
            )}
          </motion.div>
        )}

        {/* ── PLAYING ── */}
        {phase === "playing" && currentQ && (
          <motion.div key={`q-${currentQuestion}`} initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }}
            className="space-y-4"
          >
            {/* Score bar */}
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Pergunta {currentQuestion + 1}/{totalQuestions}</span>
              <div className="flex gap-3">
                {sortedPlayers.map(p => (
                  <span key={p.id} className={`text-xs font-mono ${p.id === playerId ? "text-primary font-bold" : "text-muted-foreground"}`}>
                    {p.player_name.slice(0, 8)}: {p.score}
                  </span>
                ))}
              </div>
            </div>

            {/* Progress */}
            <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
              <div className="h-full bg-primary rounded-full transition-all duration-300"
                style={{ width: `${((currentQuestion + 1) / totalQuestions) * 100}%` }}
              />
            </div>

            <p className="text-base sm:text-lg font-medium">{currentQ.question}</p>

            <div className="grid gap-2">
              {optionLabels.map((opt) => {
                const isCorrect = correctOption === opt;
                const isSelected = selectedAnswer === opt;
                let cls = "w-full text-left rounded-lg border px-4 py-3 text-sm transition-all ";

                if (showFeedback) {
                  if (isCorrect) cls += "border-green-500 bg-green-500/15 text-green-400 font-semibold";
                  else if (isSelected && !isCorrect) cls += "border-red-500 bg-red-500/15 text-red-400";
                  else cls += "border-border bg-secondary/30 text-muted-foreground opacity-60";
                } else if (selectedAnswer) {
                  cls += "border-border bg-secondary/30 text-muted-foreground opacity-60 cursor-not-allowed";
                } else {
                  cls += "border-border bg-secondary/50 hover:border-primary/50 hover:bg-primary/5 cursor-pointer";
                }

                return (
                  <button key={opt} onClick={() => submitAnswer(opt)} disabled={showFeedback || !!selectedAnswer} className={cls}>
                    <span className="font-bold mr-2 uppercase">{opt})</span>
                    {currentQ[optionKeys[opt]]}
                  </button>
                );
              })}
            </div>

            {/* Feedback overlay */}
            {showFeedback && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-center text-sm"
              >
                {answeredByPlayer ? (
                  <p>
                    <span className="font-bold text-primary">{answeredByPlayer.player_name}</span>
                    {answeredByPlayer.id === playerId ? " (você)" : ""} marcou o ponto! ⚡
                  </p>
                ) : (
                  <p className="text-muted-foreground">Ninguém acertou esta pergunta.</p>
                )}
                {countdown !== null && (
                  <p className="text-xs text-muted-foreground mt-1">
                    <Timer className="inline h-3 w-3 mr-1" />
                    Próxima em {countdown}s...
                  </p>
                )}
              </motion.div>
            )}
          </motion.div>
        )}

        {/* ── FINISHED ── */}
        {phase === "finished" && (
          <motion.div key="finished" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
            className="space-y-5 text-center"
          >
            <Trophy className="h-16 w-16 mx-auto text-primary" />
            <h3 className="text-2xl font-bold">Resultado Final</h3>

            <div className="space-y-2 max-w-sm mx-auto">
              {sortedPlayers.map((p, i) => (
                <motion.div key={p.id}
                  initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.15 }}
                  className={`flex items-center gap-3 rounded-lg px-4 py-3 text-sm ${
                    i === 0 ? "bg-primary/15 border-2 border-primary/40 font-bold" :
                    i === 1 ? "bg-primary/10 border border-primary/20" :
                    "bg-secondary/50 border border-border"
                  }`}
                >
                  <span className="text-lg">{i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}º`}</span>
                  <span className="flex-1">{p.player_name}</span>
                  <span className="font-mono font-bold text-primary text-lg">{p.score}</span>
                  {p.id === playerId && <span className="text-xs text-muted-foreground">(você)</span>}
                </motion.div>
              ))}
            </div>

            {sortedPlayers[0]?.id === playerId && (
              <motion.p className="text-primary font-bold" animate={{ scale: [1, 1.1, 1] }} transition={{ duration: 1, repeat: Infinity }}>
                🏆 Você venceu!
              </motion.p>
            )}

            <Button onClick={onBack} variant="outline" className="gap-2">
              <ArrowLeft className="h-4 w-4" /> Voltar
            </Button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default QuizBattle;
