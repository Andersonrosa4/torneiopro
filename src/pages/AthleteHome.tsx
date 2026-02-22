import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { Trophy, Bell, Activity, Calendar, ArrowLeft, Star, Handshake } from "lucide-react";
import LogoImage from "@/components/LogoImage";
import NotificationBell from "@/components/NotificationBell";
import SystemAdsBanner from "@/components/SystemAdsBanner";
import AmbassadorFunnel from "@/components/AmbassadorFunnel";
import MiniGameRankings from "@/components/MiniGameRankings";
import { Link, useNavigate } from "react-router-dom";
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

const AthleteHome = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState<any>(null);
  const [selectedSport, setSelectedSport] = useState("beach_tennis");
  const [feed, setFeed] = useState<any[]>([]);
  const [tournaments, setTournaments] = useState<any[]>([]);
  const [ranking, setRanking] = useState<any>(null);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAmbassadorFunnel, setShowAmbassadorFunnel] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) {
        navigate("/atleta/login");
        return;
      }
      setUser(data.user);
    });
  }, [navigate]);

  useEffect(() => {
    if (!user) return;
    loadData();
  }, [user, selectedSport]);

  const loadData = async () => {
    setLoading(true);
    const [feedRes, tournamentsRes, rankingRes, notifRes] = await Promise.all([
      supabase.functions.invoke("activity-api", { body: { action: "list_feed", sport: selectedSport, limit: 10 } }),
      supabase.functions.invoke("activity-api", { body: { action: "list_public_tournaments", sport: selectedSport, limit: 5 } }),
      supabase.functions.invoke("activity-api", { body: { action: "get_athlete_ranking", user_id: user.id, sport: selectedSport } }),
      supabase.functions.invoke("activity-api", { body: { action: "list_notifications", limit: 3 } }),
    ]);

    if (Array.isArray(feedRes.data)) setFeed(feedRes.data);
    else if (feedRes.data && !feedRes.data.error) setFeed(feedRes.data);

    if (Array.isArray(tournamentsRes.data)) setTournaments(tournamentsRes.data);
    else if (tournamentsRes.data && !tournamentsRes.data.error) setTournaments(tournamentsRes.data);

    if (rankingRes.data && !rankingRes.data.error) setRanking(rankingRes.data);
    if (Array.isArray(notifRes.data)) setNotifications(notifRes.data);

    setLoading(false);
  };

  const gradient = sportColors[selectedSport] || "from-sky-500 to-blue-600";

  return (
    <div className="min-h-screen relative overflow-hidden">
      <div className="fixed inset-0 bg-gradient-to-b from-[hsl(220_25%_4%)] via-[hsl(15_15%_7%)] to-[hsl(20_20%_6%)]" />
      <AmbassadorFunnel onClose={() => setShowAmbassadorFunnel(false)} />
      {showAmbassadorFunnel && <AmbassadorFunnel forceOpen onClose={() => setShowAmbassadorFunnel(false)} />}

      <header className="sticky top-0 z-50 border-b border-[hsl(0_0%_100%/0.1)] bg-[hsl(220_15%_8%/0.9)] backdrop-blur-md relative">
        <div className="container flex h-14 items-center justify-between px-4">
          <Link to="/" className="flex items-center gap-2">
            <LogoImage className="h-8 w-8" />
            <span className="font-bold text-foreground">Hub do Atleta</span>
          </Link>
          <div className="flex items-center gap-2">
            <NotificationBell />
            <Link to="/">
              <Button variant="ghost" size="sm"><ArrowLeft className="h-4 w-4 mr-1" /> Voltar</Button>
            </Link>
          </div>
        </div>
      </header>

      <main className="relative z-10 container max-w-lg mx-auto px-4 py-6 space-y-5">
        {/* Sport filter chips */}
        <div className="flex flex-wrap gap-2">
          {Object.entries(sportLabels).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setSelectedSport(key)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
                selectedSport === key
                  ? `bg-gradient-to-r ${sportColors[key]} text-white shadow-lg`
                  : "bg-[hsl(220_15%_12%)] text-muted-foreground border border-[hsl(0_0%_100%/0.1)] hover:border-[hsl(0_0%_100%/0.2)]"
              }`}
            >
              {sportEmojis[key]} {label}
            </button>
          ))}
        </div>

        {/* Meu Ranking ELO */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <Card className="border-[hsl(0_0%_100%/0.1)] bg-[hsl(220_15%_10%/0.8)] backdrop-blur-md overflow-hidden">
            <div className={`h-1.5 bg-gradient-to-r ${gradient}`} />
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`h-12 w-12 rounded-xl bg-gradient-to-br ${gradient} flex items-center justify-center`}>
                    <Star className="h-6 w-6 text-white" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Meu Ranking ELO</p>
                    <p className="text-2xl font-bold text-foreground">{ranking?.elo_rating || 1200}</p>
                  </div>
                </div>
                <div className="text-right text-sm">
                  <p className="text-emerald-400">V {ranking?.wins || 0}</p>
                  <p className="text-red-400">D {ranking?.losses || 0}</p>
                  <p className="text-muted-foreground">{ranking?.matches_played || 0} jogos</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Torneios Públicos */}
        <div>
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
            <Calendar className="h-4 w-4" /> Torneios Públicos
          </h2>
          {tournaments.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">Nenhum torneio público neste esporte</p>
          ) : (
            <div className="space-y-2">
              {tournaments.map((t: any) => (
                <Card key={t.id} className="cursor-pointer border-[hsl(0_0%_100%/0.1)] bg-[hsl(220_15%_10%/0.8)] hover:border-amber-500/40 transition-all" onClick={() => navigate(`/tournament-view/${t.id}`)}>
                  <CardContent className="p-3 flex items-center justify-between">
                    <div>
                      <p className="font-semibold text-foreground text-sm">{t.name}</p>
                      <div className="flex gap-1.5 mt-1">
                        <Badge variant="secondary" className="text-[10px]">{sportLabels[t.sport] || t.sport}</Badge>
                        {t.event_date && <Badge variant="outline" className="text-[10px]">{t.event_date}</Badge>}
                        {t.status && <Badge variant="outline" className="text-[10px] border-emerald-500/30 text-emerald-400">{t.status}</Badge>}
                      </div>
                    </div>
                    <Trophy className="h-4 w-4 text-amber-400" />
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>

        {/* Feed de Atividades */}
        <div>
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
            <Activity className="h-4 w-4" /> Feed de Atividades
          </h2>
          {feed.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">Nenhuma atividade recente</p>
          ) : (
            <div className="space-y-2">
              {feed.map((a: any) => (
                <Card key={a.id} className="border-[hsl(0_0%_100%/0.1)] bg-[hsl(220_15%_10%/0.6)]">
                  <CardContent className="p-3 flex items-center gap-3">
                    <div className="h-8 w-8 rounded-full bg-[hsl(220_15%_18%)] flex items-center justify-center text-sm">
                      {a.actor_profile?.display_name?.[0]?.toUpperCase() || "?"}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-foreground truncate">
                        <span className="font-semibold">{a.actor_profile?.display_name || "Atleta"}</span>{" "}
                        <span className="text-muted-foreground">{verbLabels[a.verb] || a.verb}</span>
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        {formatDistanceToNow(new Date(a.created_at), { addSuffix: true, locale: ptBR })}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>

        {/* Rankings Mini-Games */}
        <MiniGameRankings sport={selectedSport} />

        {/* Seja nosso Embaixador */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
          <button
            onClick={() => setShowAmbassadorFunnel(true)}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-400 text-sm font-semibold hover:bg-amber-500/20 transition-all active:scale-[0.98]"
          >
            <Handshake className="h-4 w-4" /> Seja nosso Embaixador
          </button>
        </motion.div>

        {/* Anúncios do Sistema */}
        <SystemAdsBanner />

        {/* Notificações recentes */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
              <Bell className="h-4 w-4" /> Notificações
            </h2>
            <Button variant="ghost" size="sm" className="text-xs text-primary" onClick={() => navigate("/atleta/notificacoes")}>
              Ver todas
            </Button>
          </div>
          {notifications.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">Sem notificações</p>
          ) : (
            <div className="space-y-2">
              {notifications.map((n: any) => (
                <Card key={n.id} className={`border-[hsl(0_0%_100%/0.1)] ${n.read ? "bg-[hsl(220_15%_10%/0.4)]" : "bg-[hsl(220_15%_10%/0.8)] border-l-2 border-l-primary"}`}>
                  <CardContent className="p-3">
                    <p className="text-sm font-semibold text-foreground">{n.title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{n.message}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default AthleteHome;
