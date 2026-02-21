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
import { motion } from "framer-motion";

type Step = "sport" | "location" | "arena" | "court" | "slots" | "customer" | "confirm" | "done";

interface State { id: string; name: string; uf: string }
interface City { id: string; name: string }
interface Arena { id: string; name: string; address: string | null; phone: string | null }
interface Court { id: string; name: string; sport_type: string; price_per_slot: number; slot_duration_minutes: number; photo_url?: string | null }
interface Slot { id: string; start_time: string; end_time: string }

const sportOptions = [
  {
    id: "beach_tennis",
    name: "Beach Tennis",
    emoji: "🎾",
    gradient: "from-sky-500 to-blue-600",
    glow: "hsl(195 85% 45% / 0.3)",
    border: "hsl(195 85% 50% / 0.4)",
    bg: "hsl(195 85% 45% / 0.08)",
  },
  {
    id: "beach_volleyball",
    name: "Vôlei de Praia",
    emoji: "🏐",
    gradient: "from-amber-500 to-orange-600",
    glow: "hsl(35 85% 55% / 0.3)",
    border: "hsl(35 85% 55% / 0.4)",
    bg: "hsl(35 85% 55% / 0.08)",
  },
  {
    id: "futevolei",
    name: "Futevôlei",
    emoji: "⚽🏐",
    gradient: "from-emerald-500 to-teal-600",
    glow: "hsl(155 55% 40% / 0.3)",
    border: "hsl(155 55% 45% / 0.4)",
    bg: "hsl(155 55% 40% / 0.08)",
  },
  {
    id: "tennis",
    name: "Tênis",
    emoji: "🎾",
    gradient: "from-lime-500 to-green-600",
    glow: "hsl(120 50% 40% / 0.3)",
    border: "hsl(120 50% 45% / 0.4)",
    bg: "hsl(120 50% 40% / 0.08)",
  },
  {
    id: "padel",
    name: "Padel",
    emoji: "🏸",
    gradient: "from-violet-500 to-purple-600",
    glow: "hsl(270 60% 50% / 0.3)",
    border: "hsl(270 60% 55% / 0.4)",
    bg: "hsl(270 60% 50% / 0.08)",
  },
  {
    id: "futsal",
    name: "Futsal",
    emoji: "⚽",
    gradient: "from-red-500 to-rose-600",
    glow: "hsl(0 70% 50% / 0.3)",
    border: "hsl(0 70% 55% / 0.4)",
    bg: "hsl(0 70% 50% / 0.08)",
  },
];

const CourtBooking = () => {
  const [step, setStep] = useState<Step>("sport");
  const [loading, setLoading] = useState(false);
  const [selectedSport, setSelectedSport] = useState<typeof sportOptions[number] | null>(null);

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
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null);

  // Customer
  const [customerName, setCustomerName] = useState("");
  const [customerCpf, setCustomerCpf] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("pix");
  const [customerId, setCustomerId] = useState<string | null>(null);

  // Load states when entering location step
  useEffect(() => {
    if (step === "location" && states.length === 0) {
      bookingApi<State[]>("list_states").then(({ data }) => {
        if (data) setStates(data);
      });
    }
  }, [step]);

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
    // Filter by selected sport
    const filtered = data?.filter(c => !selectedSport || c.sport_type === selectedSport.id) || [];
    setCourts(filtered);
    setStep("court");
    setLoading(false);
  }, [selectedSport]);

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
    const flow: Step[] = ["sport", "location", "arena", "court", "slots", "customer", "confirm"];
    const idx = flow.indexOf(step);
    if (idx > 0) setStep(flow[idx - 1]);
  };

  const formatTime = (t: string) => t?.slice(0, 5) || t;

  const activeSport = selectedSport || sportOptions[0];
  const accentGlow = activeSport.glow;
  const accentBorder = activeSport.border;

  return (
    <div className="min-h-screen relative overflow-hidden">
      {/* Background */}
      <div className="fixed inset-0 bg-gradient-to-b from-[hsl(220_25%_4%)] via-[hsl(15_15%_7%)] to-[hsl(20_20%_6%)]" />
      <div className="fixed inset-0 bg-[radial-gradient(ellipse_at_center,transparent_30%,hsl(220_25%_4%/0.7)_100%)]" />
      {selectedSport && (
        <div
          className="fixed top-[-10%] right-[-10%] w-[500px] h-[500px] rounded-full blur-3xl opacity-40 transition-all duration-700"
          style={{ background: `radial-gradient(circle, ${accentGlow}, transparent 65%)` }}
        />
      )}

      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-[hsl(0_0%_100%/0.1)] bg-[hsl(220_15%_8%/0.9)] backdrop-blur-md relative">
        <div className="container flex h-14 items-center justify-between px-4">
          <Link to="/" className="flex items-center gap-2">
            <LogoImage className="h-8 w-8" />
            <span className="font-bold text-foreground">Agendamentos</span>
          </Link>
          <div className="flex items-center gap-2">
            {step !== "sport" && step !== "done" && (
              <Button variant="ghost" size="sm" onClick={goBack} className="text-foreground hover:bg-[hsl(0_0%_100%/0.1)]">
                <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
              </Button>
            )}
            <Link to="/atleta/login">
              <Button variant="outline" size="sm" className="border-primary/30 text-primary hover:bg-primary/10">
                Entrar
              </Button>
            </Link>
          </div>
        </div>
      </header>

      <main className="relative z-10 container max-w-lg mx-auto px-4 py-6 space-y-4">
        {/* ─── Step: Sport Selection ─── */}
        {step === "sport" && (
          <div className="space-y-4">
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-center"
            >
              <h1 className="text-2xl font-bold text-foreground">Agende sua Quadra</h1>
              <p className="text-sm text-muted-foreground mt-1">Escolha o esporte para encontrar quadras disponíveis</p>
            </motion.div>

            <div className="grid grid-cols-2 gap-3">
              {sportOptions.map((sport, i) => (
                <motion.button
                  key={sport.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.07 }}
                  onClick={() => {
                    setSelectedSport(sport);
                    setStep("location");
                  }}
                  className="group relative overflow-hidden rounded-2xl p-5 text-left transition-all hover:scale-[1.03] active:scale-[0.98]"
                  style={{
                    background: sport.bg,
                    boxShadow: `0 4px 20px ${sport.glow}, inset 0 0 0 1px ${sport.border}`,
                  }}
                >
                  <div className={`absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity bg-gradient-to-br ${sport.gradient} `} style={{ opacity: 0.08 }} />
                  <span className="text-3xl block mb-2">{sport.emoji}</span>
                  <span className="font-bold text-foreground text-sm block">{sport.name}</span>
                </motion.button>
              ))}
            </div>

            <div className="flex flex-col items-center gap-3 pt-4">
              <Link to="/atleta/cadastro" className="text-sm text-primary hover:underline">
                Não tem conta? Cadastre-se
              </Link>
              <Link to="/atleta/login" className="text-sm text-muted-foreground hover:underline">
                Já tem conta? Entrar
              </Link>
            </div>
          </div>
        )}

        {/* ─── Step: Location ─── */}
        {step === "location" && (
          <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}>
            <Card className="border-[hsl(0_0%_100%/0.1)] bg-[hsl(220_15%_10%/0.8)] backdrop-blur-md">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-foreground">
                  <MapPin className="h-5 w-5" style={{ color: `hsl(${activeSport.id === 'beach_tennis' ? '195 85% 50%' : activeSport.id === 'beach_volleyball' ? '35 85% 55%' : activeSport.id === 'futevolei' ? '155 55% 45%' : activeSport.id === 'tennis' ? '120 50% 45%' : activeSport.id === 'padel' ? '270 60% 55%' : '0 70% 55%'})` }} />
                  Localização — {selectedSport?.name}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-foreground">Estado</Label>
                  <Select value={selectedState} onValueChange={(v) => { setSelectedState(v); setSelectedCity(""); }}>
                    <SelectTrigger className="bg-[hsl(220_15%_12%)] border-[hsl(0_0%_100%/0.1)]">
                      <SelectValue placeholder="Selecione o estado" />
                    </SelectTrigger>
                    <SelectContent>
                      {states.map((s) => (
                        <SelectItem key={s.id} value={s.id}>{s.name} ({s.uf})</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {cities.length > 0 && (
                  <div className="space-y-2">
                    <Label className="text-foreground">Cidade</Label>
                    <Select value={selectedCity} onValueChange={setSelectedCity}>
                      <SelectTrigger className="bg-[hsl(220_15%_12%)] border-[hsl(0_0%_100%/0.1)]">
                        <SelectValue placeholder="Selecione a cidade" />
                      </SelectTrigger>
                      <SelectContent>
                        {cities.map((c) => (
                          <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <Button
                  className={`w-full bg-gradient-to-r ${activeSport.gradient} text-white hover:opacity-90`}
                  disabled={!selectedState || loading}
                  onClick={loadArenas}
                >
                  Buscar Arenas <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* ─── Step: Arena ─── */}
        {step === "arena" && (
          <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-3">
            <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
              <span className="text-xl">{selectedSport?.emoji}</span>
              Arenas — {selectedSport?.name}
            </h2>
            {arenas.length === 0 && <p className="text-muted-foreground text-center py-8">Nenhuma arena encontrada nesta localização.</p>}
            {arenas.map((a, i) => (
              <motion.div key={a.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
                <Card
                  className="cursor-pointer border-[hsl(0_0%_100%/0.1)] bg-[hsl(220_15%_10%/0.8)] backdrop-blur-md hover:border-primary/40 transition-all"
                  onClick={() => loadCourts(a)}
                >
                  <CardContent className="p-4 flex items-center justify-between">
                    <div>
                      <p className="font-semibold text-foreground">{a.name}</p>
                      {a.address && <p className="text-sm text-muted-foreground">{a.address}</p>}
                    </div>
                    <ChevronRight className="h-5 w-5 text-muted-foreground" />
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </motion.div>
        )}

        {/* ─── Step: Court ─── */}
        {step === "court" && (
          <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-3">
            <h2 className="text-lg font-semibold text-foreground">Quadras — {selectedArena?.name}</h2>
            {courts.length === 0 && <p className="text-muted-foreground text-center py-8">Nenhuma quadra de {selectedSport?.name} disponível.</p>}
            {courts.map((c, i) => (
              <motion.div key={c.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
                <Card
                  className="cursor-pointer border-[hsl(0_0%_100%/0.1)] bg-[hsl(220_15%_10%/0.8)] backdrop-blur-md hover:border-primary/40 transition-all overflow-hidden"
                  onClick={() => loadSlots(c)}
                >
                  {c.photo_url && (
                    <div className="h-32 overflow-hidden">
                      <img src={c.photo_url} alt={c.name} className="w-full h-full object-cover" />
                    </div>
                  )}
                  <CardContent className="p-4 flex items-center justify-between">
                    <div>
                      <p className="font-semibold text-foreground">{c.name}</p>
                      <div className="flex gap-2 mt-1">
                        <Badge variant="secondary" className="text-xs">{selectedSport?.name}</Badge>
                        <Badge variant="outline" className="text-xs border-primary/30 text-primary">R$ {Number(c.price_per_slot).toFixed(2)}</Badge>
                      </div>
                    </div>
                    <ChevronRight className="h-5 w-5 text-muted-foreground" />
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </motion.div>
        )}

        {/* ─── Step: Slots ─── */}
        {step === "slots" && (
          <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-4">
            <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
              <Calendar className="h-5 w-5 text-primary" />
              Horários — {selectedCourt?.name}
            </h2>
            <Input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="bg-[hsl(220_15%_12%)] border-[hsl(0_0%_100%/0.1)]"
            />
            {loading ? (
              <p className="text-muted-foreground text-center py-4">Carregando...</p>
            ) : slots.length === 0 ? (
              <p className="text-muted-foreground text-center py-4">Nenhum horário disponível para esta data.</p>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {slots.map((s) => (
                  <Button
                    key={s.id}
                    variant={selectedSlot?.id === s.id ? "default" : "outline"}
                    className={`flex items-center gap-1 ${selectedSlot?.id === s.id ? `bg-gradient-to-r ${activeSport.gradient} text-white border-0` : 'border-[hsl(0_0%_100%/0.1)] hover:border-primary/40'}`}
                    onClick={() => setSelectedSlot(s)}
                  >
                    <Clock className="h-3 w-3" />
                    {formatTime(s.start_time)} - {formatTime(s.end_time)}
                  </Button>
                ))}
              </div>
            )}
            {selectedSlot && (
              <Button
                className={`w-full bg-gradient-to-r ${activeSport.gradient} text-white hover:opacity-90`}
                onClick={() => setStep("customer")}
              >
                Continuar <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            )}
          </motion.div>
        )}

        {/* ─── Step: Customer ─── */}
        {step === "customer" && (
          <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}>
            <Card className="border-[hsl(0_0%_100%/0.1)] bg-[hsl(220_15%_10%/0.8)] backdrop-blur-md">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-foreground">
                  <User className="h-5 w-5 text-primary" />
                  Seus Dados
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-foreground">Nome Completo</Label>
                  <Input value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="João da Silva" className="bg-[hsl(220_15%_12%)] border-[hsl(0_0%_100%/0.1)]" />
                </div>
                <div className="space-y-2">
                  <Label className="text-foreground">CPF</Label>
                  <Input value={customerCpf} onChange={(e) => setCustomerCpf(e.target.value)} placeholder="000.000.000-00" maxLength={14} className="bg-[hsl(220_15%_12%)] border-[hsl(0_0%_100%/0.1)]" />
                </div>
                <div className="space-y-2">
                  <Label className="text-foreground">Telefone</Label>
                  <Input value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} placeholder="(00) 00000-0000" className="bg-[hsl(220_15%_12%)] border-[hsl(0_0%_100%/0.1)]" />
                </div>
                <div className="space-y-2">
                  <Label className="text-foreground">Forma de Pagamento</Label>
                  <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                    <SelectTrigger className="bg-[hsl(220_15%_12%)] border-[hsl(0_0%_100%/0.1)]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pix">PIX</SelectItem>
                      <SelectItem value="card">Cartão</SelectItem>
                      <SelectItem value="cash">Dinheiro</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  className={`w-full bg-gradient-to-r ${activeSport.gradient} text-white hover:opacity-90`}
                  onClick={handleCustomerSubmit}
                  disabled={loading}
                >
                  {loading ? "Verificando..." : "Continuar"}
                </Button>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* ─── Step: Confirm ─── */}
        {step === "confirm" && (
          <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}>
            <Card className="border-[hsl(0_0%_100%/0.1)] bg-[hsl(220_15%_10%/0.8)] backdrop-blur-md">
              <CardHeader>
                <CardTitle className="text-foreground">Confirmar Reserva</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-2 text-sm">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <span className="text-lg">{selectedSport?.emoji}</span>
                    <span className="font-semibold text-foreground">{selectedSport?.name}</span>
                  </div>
                  <p className="text-foreground"><strong>Arena:</strong> {selectedArena?.name}</p>
                  <p className="text-foreground"><strong>Quadra:</strong> {selectedCourt?.name}</p>
                  <p className="text-foreground"><strong>Data:</strong> {selectedDate}</p>
                  <p className="text-foreground"><strong>Horário:</strong> {selectedSlot && `${formatTime(selectedSlot.start_time)} - ${formatTime(selectedSlot.end_time)}`}</p>
                  <p className="text-foreground"><strong>Valor:</strong> R$ {Number(selectedCourt?.price_per_slot || 0).toFixed(2)}</p>
                  <p className="text-foreground"><strong>Pagamento:</strong> {paymentMethod.toUpperCase()}</p>
                  <p className="text-foreground"><strong>Cliente:</strong> {customerName}</p>
                </div>
                <Button
                  className={`w-full bg-gradient-to-r ${activeSport.gradient} text-white hover:opacity-90`}
                  onClick={handleConfirmBooking}
                  disabled={loading}
                >
                  <CreditCard className="h-4 w-4 mr-2" />
                  {loading ? "Reservando..." : "Confirmar Reserva"}
                </Button>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* ─── Step: Done ─── */}
        {step === "done" && (
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}>
            <Card className="text-center border-[hsl(0_0%_100%/0.1)] bg-[hsl(220_15%_10%/0.8)] backdrop-blur-md">
              <CardContent className="py-8 space-y-4">
                <CheckCircle className="h-16 w-16 text-green-500 mx-auto" />
                <h2 className="text-2xl font-bold text-foreground">Reserva Confirmada!</h2>
                <p className="text-muted-foreground">
                  Sua reserva foi criada com sucesso. Compareça no horário agendado.
                </p>
                <div className="text-sm space-y-1 text-foreground">
                  <p className="text-lg">{selectedSport?.emoji}</p>
                  <p><strong>{selectedArena?.name}</strong></p>
                  <p>{selectedCourt?.name} - {selectedDate}</p>
                  <p>{selectedSlot && `${formatTime(selectedSlot.start_time)} - ${formatTime(selectedSlot.end_time)}`}</p>
                </div>
                <Button onClick={() => window.location.reload()} className={`mt-4 bg-gradient-to-r ${activeSport.gradient} text-white hover:opacity-90`}>
                  Novo Agendamento
                </Button>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </main>
    </div>
  );
};

export default CourtBooking;
