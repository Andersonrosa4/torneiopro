import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { ArrowLeft, Check } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface Props {
  arenaId: string;
  arenaName: string;
  userId: string;
  onBack: () => void;
}

export default function CourtBooking({ arenaId, arenaName, userId, onBack }: Props) {
  const [courts, setCourts] = useState<any[]>([]);
  const [arena, setArena] = useState<any>(null);
  const [courtId, setCourtId] = useState("");
  const [date, setDate] = useState<Date | undefined>(new Date());
  const [slots, setSlots] = useState<{ time: string; available: boolean }[]>([]);
  const [selectedSlot, setSelectedSlot] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("later");
  const [booking, setBooking] = useState(false);
  const [hasDebt, setHasDebt] = useState(false);

  useEffect(() => {
    supabase.from("arenas").select("*").eq("id", arenaId).single().then(({ data }) => setArena(data));
    supabase.from("courts").select("*").eq("arena_id", arenaId).eq("active", true).order("name").then(({ data }) => setCourts(data || []));
    supabase.from("user_debts").select("id").eq("user_id", userId).eq("status", "open").limit(1).then(({ data }) => setHasDebt((data?.length || 0) > 0));
  }, [arenaId, userId]);

  useEffect(() => {
    if (!courtId || !date || !arena) { setSlots([]); return; }
    const court = courts.find((c) => c.id === courtId);
    if (!court) return;

    const dateStr = format(date, "yyyy-MM-dd");
    const dur = court.slot_duration_minutes;
    const [oh, om] = (arena.opening_time as string).split(":").map(Number);
    const [ch, cm] = (arena.closing_time as string).split(":").map(Number);
    const openMin = oh * 60 + om;
    const closeMin = ch * 60 + cm;

    const allSlots: string[] = [];
    for (let m = openMin; m + dur <= closeMin; m += dur) {
      const h = String(Math.floor(m / 60)).padStart(2, "0");
      const mi = String(m % 60).padStart(2, "0");
      allSlots.push(`${h}:${mi}`);
    }

    supabase
      .from("bookings")
      .select("start_time")
      .eq("court_id", courtId)
      .eq("booking_date", dateStr)
      .in("status", ["confirmed", "blocked"])
      .then(({ data: booked }) => {
        const bookedTimes = new Set((booked || []).map((b) => (b.start_time as string).slice(0, 5)));
        const now = new Date();
        const todayStr = format(now, "yyyy-MM-dd");

        setSlots(
          allSlots.map((t) => {
            let available = !bookedTimes.has(t);
            if (dateStr === todayStr) {
              const [sh, sm] = t.split(":").map(Number);
              if (sh * 60 + sm <= now.getHours() * 60 + now.getMinutes()) available = false;
            }
            if (dateStr < todayStr) available = false;
            return { time: t, available };
          })
        );
      });
  }, [courtId, date, arena, courts]);

  // Realtime subscription
  useEffect(() => {
    if (!courtId) return;
    const channel = supabase
      .channel(`bookings-${courtId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "bookings", filter: `court_id=eq.${courtId}` }, () => {
        // Re-trigger slot calculation
        setDate((d) => d ? new Date(d) : d);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [courtId]);

  const handleBook = async () => {
    if (hasDebt) { toast.error("Você possui débitos pendentes. Quite antes de reservar."); return; }
    if (!selectedSlot || !courtId || !date) return;

    const court = courts.find((c) => c.id === courtId);
    if (!court) return;

    const [sh, sm] = selectedSlot.split(":").map(Number);
    const endMin = sh * 60 + sm + court.slot_duration_minutes;
    const endTime = `${String(Math.floor(endMin / 60)).padStart(2, "0")}:${String(endMin % 60).padStart(2, "0")}`;

    setBooking(true);
    const { error } = await supabase.from("bookings").insert({
      arena_id: arenaId,
      court_id: courtId,
      user_id: userId,
      booking_date: format(date, "yyyy-MM-dd"),
      start_time: selectedSlot + ":00",
      end_time: endTime + ":00",
      status: "confirmed",
      payment_method: paymentMethod,
      payment_status: paymentMethod === "later" ? "pending" : "pending",
    });
    setBooking(false);

    if (error) {
      if (error.code === "23505") toast.error("Horário já reservado!");
      else toast.error("Erro ao reservar: " + error.message);
      return;
    }
    toast.success("Reserva confirmada!");
    setSelectedSlot("");
  };

  return (
    <div className="space-y-4">
      <Button variant="ghost" onClick={onBack} className="mb-2"><ArrowLeft className="h-4 w-4 mr-1" /> Voltar</Button>
      <h2 className="text-xl font-bold">{arenaName}</h2>

      {hasDebt && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          ⚠️ Você possui débitos pendentes. Quite na aba "Débitos" antes de realizar novas reservas.
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-[1fr_1fr]">
        <div className="space-y-3">
          <Select value={courtId} onValueChange={(v) => { setCourtId(v); setSelectedSlot(""); }}>
            <SelectTrigger><SelectValue placeholder="Selecione a Quadra" /></SelectTrigger>
            <SelectContent>
              {courts.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name} - {c.sport_type} (R$ {Number(c.price_per_slot).toFixed(2)})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Calendar
            mode="single"
            selected={date}
            onSelect={(d) => { setDate(d); setSelectedSlot(""); }}
            locale={ptBR}
            disabled={(d) => d < new Date(new Date().setHours(0, 0, 0, 0))}
            className="rounded-md border"
          />
        </div>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">
              {date ? format(date, "dd/MM/yyyy (EEEE)", { locale: ptBR }) : "Selecione uma data"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!courtId && <p className="text-sm text-muted-foreground">Selecione uma quadra primeiro.</p>}
            {courtId && slots.length === 0 && <p className="text-sm text-muted-foreground">Nenhum horário disponível.</p>}
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 mt-2">
              {slots.map((s) => (
                <Button
                  key={s.time}
                  size="sm"
                  variant={selectedSlot === s.time ? "default" : s.available ? "outline" : "ghost"}
                  disabled={!s.available}
                  className={!s.available ? "opacity-40 line-through" : ""}
                  onClick={() => setSelectedSlot(s.time)}
                >
                  {s.time}
                </Button>
              ))}
            </div>

            {selectedSlot && (
              <div className="mt-4 space-y-3 border-t pt-3">
                <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pix">PIX</SelectItem>
                    <SelectItem value="cash">Dinheiro</SelectItem>
                    <SelectItem value="card">Cartão</SelectItem>
                    <SelectItem value="later">Pagar na arena</SelectItem>
                  </SelectContent>
                </Select>
                <Button className="w-full" onClick={handleBook} disabled={booking || hasDebt}>
                  <Check className="h-4 w-4 mr-1" /> Confirmar Reserva
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
