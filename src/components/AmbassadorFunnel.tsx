import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { motion, AnimatePresence } from "framer-motion";
import { Handshake, Send, ChevronRight, Sparkles } from "lucide-react";
import { toast } from "@/hooks/use-toast";

const FUNNEL_STORAGE_KEY = "ambassador_funnel_completed";
const FUNNEL_LOGIN_TS_KEY = "ambassador_funnel_login_ts";
const FUNNEL_TRIGGERS_KEY = "ambassador_funnel_triggers"; // tracks which triggers fired

interface AmbassadorFunnelProps {
  /** If true, show funnel immediately (manual trigger from button) */
  forceOpen?: boolean;
  onClose?: () => void;
}

const questions = [
  {
    id: 1,
    text: "Você já organizou algum campeonato desse esporte antes?",
    options: ["SIM", "NÃO"],
  },
  {
    id: 2,
    text: "Você sabia que organizadores de campeonatos conseguem gerar lucro com eventos locais?",
    options: ["SIM", "NÃO"],
  },
  {
    id: 3,
    text: "Se você tivesse um sistema pronto, com suporte e sem custo inicial, você organizaria um torneio?",
    options: ["SIM", "NÃO"],
  },
];

const AmbassadorFunnel = ({ forceOpen = false, onClose }: AmbassadorFunnelProps) => {
  const [visible, setVisible] = useState(false);
  const [step, setStep] = useState(0); // 0-2 = questions, 3 = offer, 4 = interest form
  const [answers, setAnswers] = useState<(boolean | null)[]>([null, null, null]);
  const [showInterestForm, setShowInterestForm] = useState(false);
  const [playerName, setPlayerName] = useState("");
  const [city, setCity] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  // Initialize login timestamp & check timing triggers
  useEffect(() => {
    if (forceOpen) {
      setVisible(true);
      loadUserData();
      return;
    }

    // Record login timestamp if not set
    const existing = localStorage.getItem(FUNNEL_LOGIN_TS_KEY);
    if (!existing) {
      localStorage.setItem(FUNNEL_LOGIN_TS_KEY, Date.now().toString());
    }

    // Check if already completed today
    const completed = localStorage.getItem(FUNNEL_STORAGE_KEY);
    if (completed) {
      const completedDate = new Date(parseInt(completed));
      const now = new Date();
      // If completed today, don't show again
      if (completedDate.toDateString() === now.toDateString()) {
        return;
      }
    }

    // Set up interval to check timing triggers
    const checkTrigger = () => {
      const loginTs = parseInt(localStorage.getItem(FUNNEL_LOGIN_TS_KEY) || "0");
      if (!loginTs) return;

      const elapsed = Date.now() - loginTs;
      const triggersStr = localStorage.getItem(FUNNEL_TRIGGERS_KEY) || "{}";
      const triggers = JSON.parse(triggersStr);

      const HOUR = 60 * 60 * 1000;
      const triggerTimes = [
        { key: "1h", ms: 1 * HOUR },
        { key: "3h", ms: 3 * HOUR },
        { key: "6h", ms: 6 * HOUR },
      ];

      for (const t of triggerTimes) {
        if (elapsed >= t.ms && !triggers[t.key]) {
          triggers[t.key] = true;
          localStorage.setItem(FUNNEL_TRIGGERS_KEY, JSON.stringify(triggers));
          setVisible(true);
          loadUserData();
          break;
        }
      }
    };

    checkTrigger();
    const interval = setInterval(checkTrigger, 30000); // check every 30s
    return () => clearInterval(interval);
  }, [forceOpen]);

  const loadUserData = async () => {
    const { data } = await supabase.auth.getUser();
    if (data.user) {
      setUserId(data.user.id);
      setPlayerName(
        data.user.user_metadata?.display_name ||
        data.user.user_metadata?.name ||
        data.user.user_metadata?.full_name ||
        ""
      );
    }
  };

  const handleAnswer = (questionIndex: number, answer: boolean) => {
    const newAnswers = [...answers];
    newAnswers[questionIndex] = answer;
    setAnswers(newAnswers);
    setStep(questionIndex + 1);
  };

  const handleFinalAction = async (action: "interested" | "maybe_later") => {
    if (action === "interested") {
      setShowInterestForm(true);
      setStep(4);
    } else {
      await saveAndClose("maybe_later");
    }
  };

  const saveAndClose = async (finalAction: string) => {
    if (userId) {
      await supabase.from("ambassador_interests").insert({
        user_id: userId,
        player_name: playerName || "Atleta",
        whatsapp: city || null,
        answer_1: answers[0],
        answer_2: answers[1],
        answer_3: answers[2],
        final_action: finalAction,
      });
    }
    localStorage.setItem(FUNNEL_STORAGE_KEY, Date.now().toString());
    setVisible(false);
    setStep(0);
    setAnswers([null, null, null]);
    setShowInterestForm(false);
    onClose?.();
  };

  const handleSubmitInterest = async () => {
    if (!playerName.trim()) {
      toast({ title: "Digite seu nome", variant: "destructive" });
      return;
    }
    if (!city.trim()) {
      toast({ title: "Digite sua cidade", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    await saveAndClose("interested");

    // Redirect to WhatsApp with pre-filled message
    const msg = encodeURIComponent(
      `Olá! Meu nome é ${playerName.trim()} e tenho interesse em criar um torneio na cidade de ${city.trim()}. Vim pelo app TorneioPro!`
    );
    window.open(`https://wa.me/5565993379751?text=${msg}`, "_blank");

    toast({
      title: "Interesse enviado! 🎉",
      description: "Você será redirecionado para o WhatsApp.",
    });
    setSubmitting(false);
  };

  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <AnimatePresence mode="wait">
        {/* CARDS 1-3: Questions */}
        {step < 3 && (
          <motion.div
            key={`question-${step}`}
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: -20 }}
            transition={{ duration: 0.35, ease: "easeOut" }}
            className="w-[90%] max-w-md mx-auto"
          >
            <div className="rounded-2xl border border-[hsl(var(--primary)/0.3)] bg-[hsl(var(--card)/0.95)] backdrop-blur-xl p-8 shadow-2xl relative overflow-hidden">
              {/* Decorative top bar */}
              <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-primary via-accent to-primary" />

              {/* Progress dots */}
              <div className="flex justify-center gap-2 mb-6">
                {[0, 1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className={`h-2 rounded-full transition-all duration-300 ${
                      i === step
                        ? "w-8 bg-primary"
                        : i < step
                        ? "w-2 bg-primary/60"
                        : "w-2 bg-muted"
                    }`}
                  />
                ))}
              </div>

              <div className="flex justify-center mb-5">
                <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-primary/20 to-accent/20 border border-primary/20 flex items-center justify-center">
                  <Handshake className="h-7 w-7 text-primary" />
                </div>
              </div>

              <p className="text-center text-lg font-semibold text-foreground leading-relaxed mb-8">
                {questions[step].text}
              </p>

              <div className="flex gap-3">
                {questions[step].options.map((opt) => (
                  <Button
                    key={opt}
                    onClick={() => handleAnswer(step, opt === "SIM")}
                    className={`flex-1 h-14 rounded-xl text-base font-bold transition-all active:scale-[0.97] ${
                      opt === "SIM"
                        ? "bg-gradient-to-r from-primary to-primary/80 text-primary-foreground shadow-glow hover:opacity-90"
                        : "bg-muted/80 text-foreground border border-border hover:bg-muted"
                    }`}
                  >
                    {opt}
                  </Button>
                ))}
              </div>

              <p className="text-center text-[10px] text-muted-foreground mt-4">
                Card {step + 1} de 4
              </p>
            </div>
          </motion.div>
        )}

        {/* CARD 4: Offer */}
        {step === 3 && !showInterestForm && (
          <motion.div
            key="offer"
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: -20 }}
            transition={{ duration: 0.35, ease: "easeOut" }}
            className="w-[90%] max-w-md mx-auto"
          >
            <div className="rounded-2xl border border-primary/40 bg-[hsl(var(--card)/0.95)] backdrop-blur-xl p-8 shadow-2xl relative overflow-hidden">
              <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-amber-400 via-primary to-amber-400" />

              <div className="flex justify-center gap-2 mb-6">
                {[0, 1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className={`h-2 rounded-full transition-all duration-300 ${
                      i === 3 ? "w-8 bg-primary" : "w-2 bg-primary/60"
                    }`}
                  />
                ))}
              </div>

              <div className="flex justify-center mb-5">
                <motion.div
                  className="h-16 w-16 rounded-2xl bg-gradient-to-br from-amber-400/30 to-primary/30 border border-amber-400/30 flex items-center justify-center"
                  animate={{ scale: [1, 1.05, 1] }}
                  transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                >
                  <Sparkles className="h-8 w-8 text-amber-400" />
                </motion.div>
              </div>

              <div className="space-y-3 text-center mb-8">
                <p className="text-lg font-bold text-foreground">
                  Você não paga nada agora.
                </p>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Queremos te dar a chance de testar nosso sistema.
                </p>
                <p className="text-sm text-foreground font-medium leading-relaxed">
                  Quando estiver pronto, você ganha{" "}
                  <span className="text-primary font-bold text-base">50% de desconto</span>{" "}
                  no seu primeiro torneio como organizador.
                </p>
              </div>

              <div className="space-y-3">
                <Button
                  onClick={() => handleFinalAction("interested")}
                  className="w-full h-14 rounded-xl bg-gradient-to-r from-amber-500 to-primary text-primary-foreground font-bold text-base shadow-glow hover:opacity-90 transition-all active:scale-[0.97]"
                >
                  <ChevronRight className="h-5 w-5 mr-1" /> QUERO SABER MAIS
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => handleFinalAction("maybe_later")}
                  className="w-full h-12 rounded-xl text-muted-foreground hover:text-foreground text-sm"
                >
                  TALVEZ DEPOIS
                </Button>
              </div>

              <p className="text-center text-[10px] text-muted-foreground mt-4">
                Card 4 de 4
              </p>
            </div>
          </motion.div>
        )}

        {/* INTEREST FORM */}
        {step === 4 && showInterestForm && (
          <motion.div
            key="form"
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: -20 }}
            transition={{ duration: 0.35, ease: "easeOut" }}
            className="w-[90%] max-w-md mx-auto"
          >
            <div className="rounded-2xl border border-primary/40 bg-[hsl(var(--card)/0.95)] backdrop-blur-xl p-8 shadow-2xl relative overflow-hidden">
              <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-emerald-400 via-primary to-emerald-400" />

              <div className="flex justify-center mb-5">
                <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-emerald-400/20 to-primary/20 border border-emerald-400/20 flex items-center justify-center">
                  <Send className="h-7 w-7 text-emerald-400" />
                </div>
              </div>

              <h3 className="text-center text-lg font-bold text-foreground mb-1">
                Quase lá! 🎉
              </h3>
              <p className="text-center text-sm text-muted-foreground mb-6">
                Confirme seus dados para registrar seu interesse
              </p>

              <div className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
                    Nome
                  </Label>
                  <Input
                    value={playerName}
                    onChange={(e) => setPlayerName(e.target.value)}
                    placeholder="Seu nome completo"
                    className="h-12 rounded-xl bg-muted/40 border-border/50"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
                    Em qual cidade você tem interesse em criar um torneio?
                  </Label>
                  <Input
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    placeholder="Ex: Cuiabá - MT"
                    className="h-12 rounded-xl bg-muted/40 border-border/50"
                  />
                </div>

                <Button
                  onClick={handleSubmitInterest}
                  disabled={submitting}
                  className="w-full h-14 rounded-xl bg-gradient-to-r from-emerald-500 to-primary text-primary-foreground font-bold text-base shadow-glow hover:opacity-90 transition-all active:scale-[0.97]"
                >
                  {submitting ? (
                    <div className="flex items-center gap-2">
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />
                      Enviando...
                    </div>
                  ) : (
                    <>
                      <Send className="h-4 w-4 mr-2" /> ENVIAR INTERESSE
                    </>
                  )}
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default AmbassadorFunnel;
