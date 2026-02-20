import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Ban, UserX, DollarSign, Plus } from "lucide-react";

interface Props {
  arenaId: string;
}

const statusLabels: Record<string, string> = {
  confirmed: "Confirmado",
  cancelled: "Cancelado",
  blocked: "Bloqueado",
  no_show: "Não compareceu",
};

const statusColors: Record<string, string> = {
  confirmed: "bg-green-500/20 text-green-400",
  cancelled: "bg-muted text-muted-foreground",
  no_show: "bg-destructive/20 text-destructive",
  blocked: "bg-yellow-500/20 text-yellow-400",
};

export default function ArenaSchedule({ arenaId }: Props) {
  const [courts, setCourts] = useState<any[]>([]);
  const [arena, setArena] = useState<any>(null);
  const [courtId, setCourtId] = useState("");
  const [date, setDate] = useState<Date>(new Date());
  const [bookings, setBookings] = useState<any[]>([]);
  const [debts, setDebts] = useState<any[]>([]);
  const [manualEmail, setManualEmail] = useState("");
  const [manualSlot, setManualSlot] = useState("");
  const [showManual, setShowManual] = useState(false);

  useEffect(() => {
    supabase.from("arenas").select("*").eq("id", arenaId).single().then(({ data }) => setArena(data));
    supabase.from("courts").select("*").eq("arena_id", arenaId).order("name").then(({ data }) => {
      setCourts(data || []);
      if (data && data.length > 0) setCourtId(data[0].id);
    });
  }, [arenaId]);

  const fetchBookings = useCallback(async () => {
    if (!courtId || !date) return;
    const dateStr = format(date, "yyyy-MM-dd");
    const { data } = await supabase
      .from("bookings")
      .select("*")
      .eq("court_id", courtId)
      .eq("booking_date", dateStr)
      .neq("status", "cancelled")
      .order("start_time");
    setBookings(data || []);
  }, [courtId, date]);

  useEffect(() => { fetchBookings(); }, [fetchBookings]);

  // Fetch debts for this arena
  useEffect(() => {
    supabase
      .from("user_debts")
      .select("*, bookings!inner(arena_id)")
      .eq("bookings.arena_id", arenaId)
      .eq("status", "open")
      .then(({ data }) => setDebts(data || []));
  }, [arenaId]);

  // Realtime
  useEffect(() => {
    if (!courtId) return;
    const channel = supabase
      .channel(`arena-schedule-${courtId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "bookings", filter: `court_id=eq.${courtId}` }, () => fetchBookings())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [courtId, fetchBookings]);

  const handleBlock = async (time: string) => {
    const court = courts.find((c) => c.id === courtId);
    if (!court) return;
    const [sh, sm] = time.split(":").map(Number);
    const endMin = sh * 60 + sm + court.slot_duration_minutes;
    const endTime = `${String(Math.floor(endMin / 60)).padStart(2, "0")}:${String(endMin % 60).padStart(2, "0")}`;

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { error } = await supabase.from("bookings").insert({
      arena_id: arenaId,
      court_id: courtId,
      user_id: user.id,
      booking_date: format(date, "yyyy-MM-dd"),
      start_time: time + ":00",
      end_time: endTime + ":00",
      status: "blocked",
      payment_method: "later",
      payment_status: "pending",
    });
    if (error) toast.error("Erro: " + error.message);
    else toast.success("Horário bloqueado");
  };

  const handleNoShow = async (bookingId: string) => {
    const booking = bookings.find((b) => b.id === bookingId);
    if (!booking) return;

    const { error } = await supabase.from("bookings").update({ status: "no_show" }).eq("id", bookingId);
    if (error) { toast.error("Erro: " + error.message); return; }

    const court = courts.find((c) => c.id === booking.court_id);
    await supabase.from("user_debts").insert({
      user_id: booking.user_id,
      amount: court?.price_per_slot || 0,
      reason: `Não comparecimento - ${format(date, "dd/MM")} ${(booking.start_time as string).slice(0, 5)}`,
      booking_id: bookingId,
      status: "open",
    });
    toast.success("Marcado como no-show e dívida gerada");
  };

  const handlePayDebt = async (debtId: string) => {
    const { error } = await supabase.from("user_debts").update({ status: "paid" }).eq("id", debtId);
    if (error) toast.error("Erro");
    else {
      toast.success("Dívida quitada");
      setDebts((d) => d.filter((x) => x.id !== debtId));
    }
  };

  // Generate available slots
  const getSlots = () => {
    if (!arena || !courtId) return [];
    const court = courts.find((c) => c.id === courtId);
    if (!court) return [];
    const dur = court.slot_duration_minutes;
    const [oh, om] = (arena.opening_time as string).split(":").map(Number);
    const [ch, cm] = (arena.closing_time as string).split(":").map(Number);
    const openMin = oh * 60 + om;
    const closeMin = ch * 60 + cm;
    const all: string[] = [];
    for (let m = openMin; m + dur <= closeMin; m += dur) {
      all.push(`${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`);
    }
    return all;
  };

  const allSlots = getSlots();
  const bookedMap = new Map(bookings.map((b) => [(b.start_time as string).slice(0, 5), b]));

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3 items-start">
        <Select value={courtId} onValueChange={setCourtId}>
          <SelectTrigger className="w-[200px]"><SelectValue placeholder="Quadra" /></SelectTrigger>
          <SelectContent>
            {courts.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Calendar mode="single" selected={date} onSelect={(d) => d && setDate(d)} locale={ptBR} className="rounded-md border" />
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex justify-between">
            Agenda - {format(date, "dd/MM/yyyy (EEEE)", { locale: ptBR })}
            <Button size="sm" variant="outline" onClick={() => setShowManual(!showManual)}>
              <Plus className="h-4 w-4 mr-1" /> Manual
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {allSlots.map((time) => {
            const b = bookedMap.get(time);
            return (
              <div key={time} className="flex items-center justify-between py-2 border-b last:border-0">
                <div className="flex items-center gap-3">
                  <span className="font-mono text-sm w-12">{time}</span>
                  {b ? (
                    <Badge variant="outline" className={statusColors[b.status]}>{statusLabels[b.status]}</Badge>
                  ) : (
                    <span className="text-sm text-green-400">Livre</span>
                  )}
                </div>
                <div className="flex gap-1">
                  {!b && (
                    <Button size="sm" variant="ghost" onClick={() => handleBlock(time)} title="Bloquear">
                      <Ban className="h-4 w-4" />
                    </Button>
                  )}
                  {b && b.status === "confirmed" && (
                    <Button size="sm" variant="ghost" className="text-destructive" onClick={() => handleNoShow(b.id)} title="No-show">
                      <UserX className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {debts.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base text-destructive">Débitos em aberto</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {debts.map((d) => (
              <div key={d.id} className="flex items-center justify-between py-2 border-b last:border-0">
                <div>
                  <p className="text-sm font-medium">R$ {Number(d.amount).toFixed(2)}</p>
                  <p className="text-xs text-muted-foreground">{d.reason}</p>
                </div>
                <Button size="sm" variant="outline" onClick={() => handlePayDebt(d.id)}>
                  <DollarSign className="h-4 w-4 mr-1" /> Quitar
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
