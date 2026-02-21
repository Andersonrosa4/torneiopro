import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { bookingApi } from "@/lib/bookingApi";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { Calendar, Clock, MapPin, XCircle, LogOut, Plus } from "lucide-react";
import LogoImage from "@/components/LogoImage";
import { Link, useNavigate } from "react-router-dom";

interface BookingItem {
  id: string;
  date: string;
  start_time: string;
  end_time: string;
  status: string;
  price: number;
  court_name: string;
  arena_name: string;
}

const MeusAgendamentos = () => {
  const navigate = useNavigate();
  const [bookings, setBookings] = useState<BookingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) {
      navigate("/atleta/login");
      return;
    }
    setUserId(session.user.id);
    loadBookings(session.user.id);
  };

  const loadBookings = useCallback(async (uid: string) => {
    setLoading(true);
    const { data, error } = await bookingApi<BookingItem[]>("list_athlete_bookings", { user_id: uid }, true);
    if (data) setBookings(data);
    if (error) toast({ title: "Erro ao carregar agendamentos", description: error.message, variant: "destructive" });
    setLoading(false);
  }, []);

  const handleCancel = async (bookingId: string) => {
    const { error } = await bookingApi("cancel_athlete_booking", { booking_id: bookingId }, true);
    if (error) {
      toast({ title: "Erro ao cancelar", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Reserva cancelada com sucesso!" });
    if (userId) loadBookings(userId);
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate("/atleta/login");
  };

  const formatTime = (t: string) => t?.slice(0, 5) || t;

  const statusLabels: Record<string, string> = {
    reserved: "Confirmado",
    canceled: "Cancelado",
    finished: "Finalizado",
    no_show: "Ausente",
  };

  const statusColors: Record<string, string> = {
    reserved: "bg-blue-500/20 text-blue-400",
    canceled: "bg-red-500/20 text-red-400",
    finished: "bg-green-500/20 text-green-400",
    no_show: "bg-yellow-500/20 text-yellow-400",
  };

  const canCancel = (booking: BookingItem) => {
    if (booking.status !== "reserved") return false;
    const now = new Date();
    const bookingDateTime = new Date(`${booking.date}T${booking.start_time}`);
    const diffMs = bookingDateTime.getTime() - now.getTime();
    const diffHours = diffMs / (1000 * 60 * 60);
    return diffHours > 2;
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 border-b border-border bg-card/80 backdrop-blur-md">
        <div className="container flex h-14 items-center justify-between px-4">
          <Link to="/" className="flex items-center gap-2">
            <LogoImage className="h-8 w-8" />
            <span className="font-bold text-foreground">Meus Agendamentos</span>
          </Link>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link to="/agendamentos"><Plus className="h-4 w-4 mr-1" /> Novo</Link>
            </Button>
            <Button variant="ghost" size="sm" onClick={handleSignOut}>
              <LogOut className="h-4 w-4 mr-1" /> Sair
            </Button>
          </div>
        </div>
      </header>

      <main className="container max-w-lg mx-auto px-4 py-6 space-y-4">
        {loading ? (
          <p className="text-center text-muted-foreground py-8">Carregando...</p>
        ) : bookings.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center space-y-4">
              <p className="text-muted-foreground">Você não possui agendamentos.</p>
              <Button asChild>
                <Link to="/agendamentos">Agendar Quadra</Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          bookings.map((b) => (
            <Card key={b.id}>
              <CardContent className="p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold">{b.arena_name}</p>
                    <p className="text-sm text-muted-foreground">{b.court_name}</p>
                  </div>
                  <Badge className={statusColors[b.status] || ""}>
                    {statusLabels[b.status] || b.status}
                  </Badge>
                </div>
                <div className="flex items-center gap-3 text-sm text-muted-foreground">
                  <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />{b.date}</span>
                  <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{formatTime(b.start_time)} - {formatTime(b.end_time)}</span>
                  <span className="font-semibold text-foreground">R$ {Number(b.price).toFixed(2)}</span>
                </div>
                {canCancel(b) && (
                  <Button size="sm" variant="outline" className="text-red-500 mt-2" onClick={() => handleCancel(b.id)}>
                    <XCircle className="h-3 w-3 mr-1" /> Cancelar Reserva
                  </Button>
                )}
                {b.status === "reserved" && !canCancel(b) && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Cancelamento indisponível (menos de 2 horas para o início)
                  </p>
                )}
              </CardContent>
            </Card>
          ))
        )}
      </main>
    </div>
  );
};

export default MeusAgendamentos;
