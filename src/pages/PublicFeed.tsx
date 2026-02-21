import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Activity, ArrowLeft } from "lucide-react";
import LogoImage from "@/components/LogoImage";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

const sportLabels: Record<string, string> = {
  beach_tennis: "Beach Tennis",
  beach_volleyball: "Vôlei de Praia",
  futevolei: "Futevôlei",
  tennis: "Tênis",
  padel: "Padel",
  futsal: "Futsal",
};

const sportEmojis: Record<string, string> = {
  beach_tennis: "🎾",
  beach_volleyball: "🏐",
  futevolei: "⚽🏐",
  tennis: "🎾",
  padel: "🏸",
  futsal: "⚽",
};

const sportColors: Record<string, string> = {
  beach_tennis: "from-sky-500 to-blue-600",
  beach_volleyball: "from-amber-500 to-orange-600",
  futevolei: "from-emerald-500 to-teal-600",
  tennis: "from-lime-500 to-green-600",
  padel: "from-violet-500 to-purple-600",
  futsal: "from-red-500 to-rose-600",
};

const verbLabels: Record<string, string> = {
  won_match: "venceu uma partida",
  lost_match: "perdeu uma partida",
  joined_tournament: "entrou em um torneio",
  created_tournament: "criou um torneio",
  challenge_won: "venceu um desafio",
  challenge_lost: "perdeu um desafio",
};

const PublicFeed = () => {
  const [selectedSport, setSelectedSport] = useState<string | null>(null);
  const [feed, setFeed] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadFeed();
  }, [selectedSport]);

  const loadFeed = async () => {
    setLoading(true);
    const { data } = await supabase.functions.invoke("activity-api", {
      body: { action: "list_feed", sport: selectedSport || undefined, limit: 30 },
    });
    if (Array.isArray(data)) setFeed(data);
    setLoading(false);
  };

  return (
    <div className="min-h-screen relative overflow-hidden">
      <div className="fixed inset-0 bg-gradient-to-b from-[hsl(220_25%_4%)] via-[hsl(15_15%_7%)] to-[hsl(20_20%_6%)]" />

      <header className="sticky top-0 z-50 border-b border-[hsl(0_0%_100%/0.1)] bg-[hsl(220_15%_8%/0.9)] backdrop-blur-md relative">
        <div className="container flex h-14 items-center justify-between px-4">
          <div className="flex items-center gap-2">
            <LogoImage className="h-8 w-8" />
            <span className="font-bold text-foreground flex items-center gap-1.5">
              <Activity className="h-4 w-4" /> Feed
            </span>
          </div>
          <Link to="/">
            <Button variant="ghost" size="sm"><ArrowLeft className="h-4 w-4 mr-1" /> Voltar</Button>
          </Link>
        </div>
      </header>

      <main className="relative z-10 container max-w-lg mx-auto px-4 py-6 space-y-5">
        {/* Sport filter */}
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setSelectedSport(null)}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
              !selectedSport
                ? "bg-primary text-primary-foreground"
                : "bg-[hsl(220_15%_12%)] text-muted-foreground border border-[hsl(0_0%_100%/0.1)]"
            }`}
          >
            Todos
          </button>
          {Object.entries(sportLabels).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setSelectedSport(key)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
                selectedSport === key
                  ? `bg-gradient-to-r ${sportColors[key]} text-white`
                  : "bg-[hsl(220_15%_12%)] text-muted-foreground border border-[hsl(0_0%_100%/0.1)]"
              }`}
            >
              {sportEmojis[key]} {label}
            </button>
          ))}
        </div>

        {loading ? (
          <p className="text-muted-foreground text-center py-8">Carregando...</p>
        ) : feed.length === 0 ? (
          <div className="text-center py-12">
            <Activity className="h-12 w-12 mx-auto text-muted-foreground/30 mb-3" />
            <p className="text-muted-foreground">Nenhuma atividade encontrada</p>
          </div>
        ) : (
          <div className="space-y-2">
            {feed.map((a: any, i: number) => (
              <motion.div key={a.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}>
                <Card className="border-[hsl(0_0%_100%/0.1)] bg-[hsl(220_15%_10%/0.6)]">
                  <CardContent className="p-3 flex items-center gap-3">
                    {a.actor_profile?.avatar_url ? (
                      <img src={a.actor_profile.avatar_url} alt="" className="h-9 w-9 rounded-full object-cover" />
                    ) : (
                      <div className="h-9 w-9 rounded-full bg-[hsl(220_15%_18%)] flex items-center justify-center text-sm font-semibold text-foreground">
                        {a.actor_profile?.display_name?.[0]?.toUpperCase() || "?"}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-foreground truncate">
                        <span className="font-semibold">{a.actor_profile?.display_name || "Atleta"}</span>{" "}
                        <span className="text-muted-foreground">{verbLabels[a.verb] || a.verb}</span>
                      </p>
                      <div className="flex items-center gap-2 mt-0.5">
                        {a.sport && <span className="text-[10px] text-muted-foreground">{sportEmojis[a.sport]} {sportLabels[a.sport]}</span>}
                        <span className="text-[10px] text-muted-foreground/60">
                          {formatDistanceToNow(new Date(a.created_at), { addSuffix: true, locale: ptBR })}
                        </span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
};

export default PublicFeed;
