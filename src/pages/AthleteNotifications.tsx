import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "@/hooks/use-toast";
import { Bell, CheckCheck, ArrowLeft, Trophy, Swords, MessageSquare } from "lucide-react";
import LogoImage from "@/components/LogoImage";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

const typeIcons: Record<string, any> = {
  challenge: Swords,
  tournament: Trophy,
  result: Trophy,
  default: MessageSquare,
};

const AthleteNotifications = () => {
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadNotifications();
  }, []);

  const loadNotifications = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { navigate("/atleta/login"); return; }

    setLoading(true);
    const { data } = await supabase.functions.invoke("activity-api", {
      body: { action: "list_notifications", limit: 50 },
    });
    if (Array.isArray(data)) setNotifications(data);
    setLoading(false);
  };

  const markRead = async (id: string) => {
    await supabase.functions.invoke("activity-api", {
      body: { action: "mark_notification_read", notification_id: id },
    });
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
  };

  const markAllRead = async () => {
    await supabase.functions.invoke("activity-api", {
      body: { action: "mark_all_read" },
    });
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    toast({ title: "Todas marcadas como lidas" });
  };

  const unreadCount = notifications.filter(n => !n.read).length;

  return (
    <div className="min-h-screen relative overflow-hidden">
      <div className="fixed inset-0 bg-gradient-to-b from-[hsl(220_25%_4%)] via-[hsl(15_15%_7%)] to-[hsl(20_20%_6%)]" />

      <header className="sticky top-0 z-50 border-b border-[hsl(0_0%_100%/0.1)] bg-[hsl(220_15%_8%/0.9)] backdrop-blur-md relative">
        <div className="container flex h-14 items-center justify-between px-4">
          <Link to="/atleta/home" className="flex items-center gap-2">
            <LogoImage className="h-8 w-8" />
            <span className="font-bold text-foreground">Notificações</span>
          </Link>
          <div className="flex items-center gap-2">
            {unreadCount > 0 && (
              <Button variant="ghost" size="sm" onClick={markAllRead} className="text-xs">
                <CheckCheck className="h-4 w-4 mr-1" /> Marcar todas
              </Button>
            )}
            <Link to="/atleta/home">
              <Button variant="ghost" size="sm"><ArrowLeft className="h-4 w-4 mr-1" /> Voltar</Button>
            </Link>
          </div>
        </div>
      </header>

      <main className="relative z-10 container max-w-lg mx-auto px-4 py-6 space-y-3">
        {loading ? (
          <p className="text-muted-foreground text-center py-8">Carregando...</p>
        ) : notifications.length === 0 ? (
          <div className="text-center py-12">
            <Bell className="h-12 w-12 mx-auto text-muted-foreground/30 mb-3" />
            <p className="text-muted-foreground">Nenhuma notificação</p>
          </div>
        ) : (
          notifications.map((n, i) => {
            const IconComp = typeIcons[n.type] || typeIcons.default;
            return (
              <motion.div key={n.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}>
                <Card
                  className={`cursor-pointer border-[hsl(0_0%_100%/0.1)] transition-all ${
                    n.read ? "bg-[hsl(220_15%_10%/0.4)]" : "bg-[hsl(220_15%_10%/0.8)] border-l-2 border-l-primary"
                  }`}
                  onClick={() => !n.read && markRead(n.id)}
                >
                  <CardContent className="p-4 flex items-start gap-3">
                    <div className={`h-9 w-9 rounded-lg flex items-center justify-center ${n.read ? "bg-[hsl(220_15%_15%)]" : "bg-primary/20"}`}>
                      <IconComp className={`h-4 w-4 ${n.read ? "text-muted-foreground" : "text-primary"}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-semibold ${n.read ? "text-muted-foreground" : "text-foreground"}`}>{n.title}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{n.message}</p>
                      <p className="text-[10px] text-muted-foreground/60 mt-1">
                        {formatDistanceToNow(new Date(n.created_at), { addSuffix: true, locale: ptBR })}
                      </p>
                    </div>
                    {!n.read && <div className="h-2 w-2 rounded-full bg-primary mt-2 shrink-0" />}
                  </CardContent>
                </Card>
              </motion.div>
            );
          })
        )}
      </main>
    </div>
  );
};

export default AthleteNotifications;
