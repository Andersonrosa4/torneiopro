import { useState, useEffect, useCallback } from "react";
import { bookingApi } from "@/lib/bookingApi";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { MapPin, Calendar, Clock, User, Phone, CreditCard, ChevronRight, ArrowLeft, CheckCircle } from "lucide-react";
import LogoImage from "@/components/LogoImage";
import { Link } from "react-router-dom";

type Step = "location" | "arena" | "court" | "slots" | "customer" | "confirm" | "done";

interface State { id: string; name: string; uf: string }
interface City { id: string; name: string }
interface Arena { id: string; name: string; address: string | null; phone: string | null }
interface Court { id: string; name: string; sport_type: string; price_per_slot: number; slot_duration_minutes: number }
interface Slot { id: string; start_time: string; end_time: string }

const CourtBooking = () => {
  const [step, setStep] = useState<Step>("location");
  const [loading, setLoading] = useState(false);

  // Location
  const [states, setStates] = useState<State[]>([]);
  const [cities, setCities] = useState<City[]>([]);
  const [selectedState, setSelectedState] = useState("");
  const [selectedCity, setSelectedCity] = useState("");

  // Arena & Court
  const [arenas, setArenas] = useState<Arena[]>([]);
  const [selectedArena, setSelectedArena] = useState<Arena | null>(null);
  const [courts, setCourts] = useState<Court[]>([]);
  const [selectedCourt, setSelectedCourt] = useState<Court | null>(null);

  // Slots
  const [selectedDate, setSelectedDate] = useState(() => {
    const d = new Date();
    return d.toISOString().split("T")[0];
  });
  const [slots, setSlots] = useState<Slot[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null);

  // Customer
  const [customerName, setCustomerName] = useState("");
  const [customerCpf, setCustomerCpf] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("pix");
  const [customerId, setCustomerId] = useState<string | null>(null);

  // Load states on mount
  useEffect(() => {
    bookingApi<State[]>("list_states").then(({ data }) => {
      if (data) setStates(data);
    });
  }, []);

  // Load cities when state changes
  useEffect(() => {
    if (!selectedState) { setCities([]); return; }
    bookingApi<City[]>("list_cities", { state_id: selectedState }).then(({ data }) => {
      if (data) setCities(data);
    });
  }, [selectedState]);

  const loadArenas = useCallback(async () => {
    setLoading(true);
    const { data } = await bookingApi<Arena[]>("list_arenas", {
      state_id: selectedState,
      city_id: selectedCity || undefined,
    });
    if (data) setArenas(data);
    setStep("arena");
    setLoading(false);
  }, [selectedState, selectedCity]);

  const loadCourts = useCallback(async (arena: Arena) => {
    setSelectedArena(arena);
    setLoading(true);
    const { data } = await bookingApi<Court[]>("list_courts", { arena_id: arena.id });
    if (data) setCourts(data);
    setStep("court");
    setLoading(false);
  }, []);

  const loadSlots = useCallback(async (court: Court) => {
    setSelectedCourt(court);
    setLoading(true);
    const { data } = await bookingApi<Slot[]>("list_available_slots", {
      court_id: court.id,
      date: selectedDate,
    });
    if (data) setSlots(data);
    setStep("slots");
    setLoading(false);
  }, [selectedDate]);

  const reloadSlots = useCallback(async () => {
    if (!selectedCourt) return;
    setLoading(true);
    const { data } = await bookingApi<Slot[]>("list_available_slots", {
      court_id: selectedCourt.id,
      date: selectedDate,
    });
    if (data) setSlots(data);
    setLoading(false);
  }, [selectedCourt, selectedDate]);

  useEffect(() => {
    if (step === "slots" && selectedCourt) reloadSlots();
  }, [selectedDate]);

  const handleCustomerSubmit = async () => {
    if (!customerName || !customerCpf || !customerPhone) {
      toast({ title: "Preencha todos os campos", variant: "destructive" });
      return;
    }
    setLoading(true);
    const { data, error } = await bookingApi("find_or_create_customer", {
      name: customerName,
      cpf: customerCpf,
      phone: customerPhone,
      state_id: selectedState || undefined,
      city_id: selectedCity || undefined,
    });
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
      setLoading(false);
      return;
    }
    setCustomerId(data.id);
    setStep("confirm");
    setLoading(false);
  };

  const handleConfirmBooking = async () => {
    if (!selectedArena || !selectedCourt || !selectedSlot || !customerId) return;
    setLoading(true);
    const { data, error } = await bookingApi("create_booking", {
      arena_id: selectedArena.id,
      court_id: selectedCourt.id,
      customer_id: customerId,
      date: selectedDate,
      start_time: selectedSlot.start_time,
      end_time: selectedSlot.end_time,
      payment_method: paymentMethod,
      price: selectedCourt.price_per_slot,
    });
    if (error) {
      toast({ title: "Erro ao reservar", description: error.message, variant: "destructive" });
      setLoading(false);
      return;
    }
    setStep("done");
    setLoading(false);
  };

  const goBack = () => {
    const flow: Step[] = ["location", "arena", "court", "slots", "customer", "confirm"];
    const idx = flow.indexOf(step);
    if (idx > 0) setStep(flow[idx - 1]);
  };

  const formatTime = (t: string) => t?.slice(0, 5) || t;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-border bg-card/80 backdrop-blur-md">
        <div className="container flex h-14 items-center justify-between px-4">
          <Link to="/" className="flex items-center gap-2">
            <LogoImage className="h-8 w-8" />
            <span className="font-bold text-foreground">Agendamentos</span>
          </Link>
          {step !== "location" && step !== "done" && (
            <Button variant="ghost" size="sm" onClick={goBack}>
              <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
            </Button>
          )}
        </div>
      </header>

      <main className="container max-w-lg mx-auto px-4 py-6 space-y-4">
        {/* ─── Step: Location ─── */}
        {step === "location" && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MapPin className="h-5 w-5 text-primary" />
                Escolha a Localização
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Estado</Label>
                <Select value={selectedState} onValueChange={(v) => { setSelectedState(v); setSelectedCity(""); }}>
                  <SelectTrigger><SelectValue placeholder="Selecione o estado" /></SelectTrigger>
                  <SelectContent>
                    {states.map((s) => (
                      <SelectItem key={s.id} value={s.id}>{s.name} ({s.uf})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {cities.length > 0 && (
                <div className="space-y-2">
                  <Label>Cidade</Label>
                  <Select value={selectedCity} onValueChange={setSelectedCity}>
                    <SelectTrigger><SelectValue placeholder="Selecione a cidade" /></SelectTrigger>
                    <SelectContent>
                      {cities.map((c) => (
                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <Button className="w-full" disabled={!selectedState || loading} onClick={loadArenas}>
                Buscar Arenas <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </CardContent>
          </Card>
        )}

        {/* ─── Step: Arena ─── */}
        {step === "arena" && (
          <div className="space-y-3">
            <h2 className="text-lg font-semibold">Arenas Disponíveis</h2>
            {arenas.length === 0 && <p className="text-muted-foreground">Nenhuma arena encontrada nesta localização.</p>}
            {arenas.map((a) => (
              <Card key={a.id} className="cursor-pointer hover:border-primary transition-colors" onClick={() => loadCourts(a)}>
                <CardContent className="p-4 flex items-center justify-between">
                  <div>
                    <p className="font-semibold">{a.name}</p>
                    {a.address && <p className="text-sm text-muted-foreground">{a.address}</p>}
                  </div>
                  <ChevronRight className="h-5 w-5 text-muted-foreground" />
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* ─── Step: Court ─── */}
        {step === "court" && (
          <div className="space-y-3">
            <h2 className="text-lg font-semibold">Quadras - {selectedArena?.name}</h2>
            {courts.length === 0 && <p className="text-muted-foreground">Nenhuma quadra disponível.</p>}
            {courts.map((c) => (
              <Card key={c.id} className="cursor-pointer hover:border-primary transition-colors" onClick={() => loadSlots(c)}>
                <CardContent className="p-4 flex items-center justify-between">
                  <div>
                    <p className="font-semibold">{c.name}</p>
                    <div className="flex gap-2 mt-1">
                      <Badge variant="secondary">{c.sport_type}</Badge>
                      <Badge variant="outline">R$ {Number(c.price_per_slot).toFixed(2)}</Badge>
                    </div>
                  </div>
                  <ChevronRight className="h-5 w-5 text-muted-foreground" />
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* ─── Step: Slots ─── */}
        {step === "slots" && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Calendar className="h-5 w-5 text-primary" />
              Horários - {selectedCourt?.name}
            </h2>
            <Input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} />
            {loading ? (
              <p className="text-muted-foreground">Carregando...</p>
            ) : slots.length === 0 ? (
              <p className="text-muted-foreground">Nenhum horário disponível para esta data.</p>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {slots.map((s) => (
                  <Button
                    key={s.id}
                    variant={selectedSlot?.id === s.id ? "default" : "outline"}
                    className="flex items-center gap-1"
                    onClick={() => setSelectedSlot(s)}
                  >
                    <Clock className="h-3 w-3" />
                    {formatTime(s.start_time)} - {formatTime(s.end_time)}
                  </Button>
                ))}
              </div>
            )}
            {selectedSlot && (
              <Button className="w-full" onClick={() => setStep("customer")}>
                Continuar <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            )}
          </div>
        )}

        {/* ─── Step: Customer ─── */}
        {step === "customer" && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="h-5 w-5 text-primary" />
                Seus Dados
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Nome Completo</Label>
                <Input value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="João da Silva" />
              </div>
              <div className="space-y-2">
                <Label>CPF</Label>
                <Input value={customerCpf} onChange={(e) => setCustomerCpf(e.target.value)} placeholder="000.000.000-00" maxLength={14} />
              </div>
              <div className="space-y-2">
                <Label>Telefone</Label>
                <Input value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} placeholder="(00) 00000-0000" />
              </div>
              <div className="space-y-2">
                <Label>Forma de Pagamento</Label>
                <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pix">PIX</SelectItem>
                    <SelectItem value="card">Cartão</SelectItem>
                    <SelectItem value="cash">Dinheiro</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button className="w-full" onClick={handleCustomerSubmit} disabled={loading}>
                {loading ? "Verificando..." : "Continuar"}
              </Button>
            </CardContent>
          </Card>
        )}

        {/* ─── Step: Confirm ─── */}
        {step === "confirm" && (
          <Card>
            <CardHeader>
              <CardTitle>Confirmar Reserva</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1 text-sm">
                <p><strong>Arena:</strong> {selectedArena?.name}</p>
                <p><strong>Quadra:</strong> {selectedCourt?.name}</p>
                <p><strong>Data:</strong> {selectedDate}</p>
                <p><strong>Horário:</strong> {selectedSlot && `${formatTime(selectedSlot.start_time)} - ${formatTime(selectedSlot.end_time)}`}</p>
                <p><strong>Valor:</strong> R$ {Number(selectedCourt?.price_per_slot || 0).toFixed(2)}</p>
                <p><strong>Pagamento:</strong> {paymentMethod.toUpperCase()}</p>
                <p><strong>Cliente:</strong> {customerName}</p>
              </div>
              <Button className="w-full" onClick={handleConfirmBooking} disabled={loading}>
                <CreditCard className="h-4 w-4 mr-2" />
                {loading ? "Reservando..." : "Confirmar Reserva"}
              </Button>
            </CardContent>
          </Card>
        )}

        {/* ─── Step: Done ─── */}
        {step === "done" && (
          <Card className="text-center">
            <CardContent className="py-8 space-y-4">
              <CheckCircle className="h-16 w-16 text-green-500 mx-auto" />
              <h2 className="text-2xl font-bold">Reserva Confirmada!</h2>
              <p className="text-muted-foreground">
                Sua reserva foi criada com sucesso. Compareça no horário agendado.
              </p>
              <div className="text-sm space-y-1">
                <p><strong>{selectedArena?.name}</strong></p>
                <p>{selectedCourt?.name} - {selectedDate}</p>
                <p>{selectedSlot && `${formatTime(selectedSlot.start_time)} - ${formatTime(selectedSlot.end_time)}`}</p>
              </div>
              <Button onClick={() => window.location.reload()} className="mt-4">
                Novo Agendamento
              </Button>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
};

export default CourtBooking;
