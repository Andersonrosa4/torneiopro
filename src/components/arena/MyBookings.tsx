import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { format, parseISO, isBefore, subHours } from "date-fns";
import { ptBR } from "date-fns/locale";
import { X } from "lucide-react";

interface Props {
  userId: string;
}

const statusLabels: Record<string, string> = {
  confirmed: "Confirmado",
  cancelled: "Cancelado",
  blocked: "Bloqueado",
  no_show: "Não compareceu",
};

const statusColors: Record<string, string> = {
  confirmed: "bg-green-500/20 text-green-400 border-green-500/30",
  cancelled: "bg-muted text-muted-foreground",
  no_show: "bg-destructive/20 text-destructive border-destructive/30",
  blocked: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
};

export default function MyBookings({ userId }: Props) {
  const [bookings, setBookings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchBookings = async () => {
    const { data } = await supabase
      .from("bookings")
      .select("*, arenas(name, cancel_policy_hours), courts(name)")
      .eq("user_id", userId)
      .order("booking_date", { ascending: false })
      .order("start_time", { ascending: false })
      .limit(50);
    setBookings(data || []);
    setLoading(false);
  };

  useEffect(() => { fetchBookings(); }, [userId]);

  // Realtime
  useEffect(() => {
    const channel = supabase
      .channel("my-bookings")
      .on("postgres_changes", { event: "*", schema: "public", table: "bookings", filter: `user_id=eq.${userId}` }, () => fetchBookings())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [userId]);

  const handleCancel = async (booking: any) => {
    const policyHours = booking.arenas?.cancel_policy_hours || 2;
    const bookingDateTime = new Date(`${booking.booking_date}T${booking.start_time}`);
    const deadline = subHours(bookingDateTime, policyHours);

    if (isBefore(new Date(), deadline)) {
      const { error } = await supabase.from("bookings").update({ status: "cancelled" }).eq("id", booking.id);
      if (error) toast.error("Erro ao cancelar");
      else toast.success("Reserva cancelada");
    } else {
      toast.error(`Cancelamento permitido apenas ${policyHours}h antes do horário.`);
    }
  };

  if (loading) return <p className="text-center py-8 text-muted-foreground">Carregando...</p>;
  if (bookings.length === 0) return <p className="text-center py-8 text-muted-foreground">Nenhuma reserva encontrada.</p>;

  return (
    <div className="space-y-3">
      {bookings.map((b) => (
        <Card key={b.id}>
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="font-semibold">{(b.arenas as any)?.name} - {(b.courts as any)?.name}</p>
              <p className="text-sm text-muted-foreground">
                {format(parseISO(b.booking_date), "dd/MM/yyyy (EEEE)", { locale: ptBR })} · {(b.start_time as string).slice(0, 5)} - {(b.end_time as string).slice(0, 5)}
              </p>
              <div className="flex gap-2 mt-1">
                <Badge variant="outline" className={statusColors[b.status]}>{statusLabels[b.status]}</Badge>
                <Badge variant="outline">{b.payment_status === "paid" ? "Pago" : "Pendente"}</Badge>
              </div>
            </div>
            {b.status === "confirmed" && (
              <Button size="sm" variant="ghost" className="text-destructive" onClick={() => handleCancel(b)}>
                <X className="h-4 w-4" />
              </Button>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
