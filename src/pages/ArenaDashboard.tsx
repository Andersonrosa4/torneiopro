import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { bookingApi } from "@/lib/bookingApi";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/hooks/use-toast";
import { Calendar, Clock, Users, DollarSign, AlertTriangle, CheckCircle, XCircle, LogOut, Plus, Building2 } from "lucide-react";
import ArenaManagement from "@/components/ArenaManagement";
import LogoImage from "@/components/LogoImage";
import { useNavigate } from "react-router-dom";

interface ArenaInfo {
  id: string;
  name: string;
  opening_time: string;
  closing_time: string;
  cancel_policy_hours: number;
}

interface CourtInfo {
  id: string;
  name: string;
  sport_type: string;
  slot_duration_minutes: number;
  price_per_slot: number;
}

interface BookingRow {
  id: string;
  date: string;
  start_time: string;
  end_time: string;
  status: string;
  payment_status: string;
  price: number;
  penalty_value: number;
  customers: { name: string; cpf: string; phone: string } | null;
  courts: { name: string } | null;
  payments: Array<{ id: string; method: string; amount: number; status: string }>;
}

const ArenaDashboard = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [arena, setArena] = useState<ArenaInfo | null>(null);
  const [courts, setCourts] = useState<CourtInfo[]>([]);
  const [bookings, setBookings] = useState<BookingRow[]>([]);
  const [filterDate, setFilterDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [filterStatus, setFilterStatus] = useState("all");

  // Slot creation
  const [selectedCourt, setSelectedCourt] = useState("");
  const [slotDate, setSlotDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [slotStartTime, setSlotStartTime] = useState("08:00");
  const [slotEndTime, setSlotEndTime] = useState("22:00");
  const [slotInterval, setSlotInterval] = useState(60);

  // Check auth on mount
  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    const { data, error } = await bookingApi("arena_login_check", {}, true);
    if (error || !data) {
      navigate("/arena-login");
      return;
    }
    setArena(data.arena);
    loadCourts(data.arena.id);
    setLoading(false);
  };

  const loadCourts = async (arenaId: string) => {
    const { data } = await bookingApi<CourtInfo[]>("list_courts", { arena_id: arenaId });
    if (data) setCourts(data);
  };

  const loadBookings = useCallback(async () => {
    const params: any = {};
    if (filterDate) params.date = filterDate;
    if (filterStatus !== "all") params.status = filterStatus;
    const { data } = await bookingApi<BookingRow[]>("list_bookings", params, true);
    if (data) setBookings(data);
  }, [filterDate, filterStatus]);

  useEffect(() => {
    if (arena) loadBookings();
  }, [arena, filterDate, filterStatus, loadBookings]);

  const handleCreateSlots = async () => {
    if (!selectedCourt || !slotDate) {
      toast({ title: "Selecione quadra e data", variant: "destructive" });
      return;
    }

    const slots: { start_time: string; end_time: string }[] = [];
    let [h, m] = slotStartTime.split(":").map(Number);
    const [endH, endM] = slotEndTime.split(":").map(Number);
    const endMinutes = endH * 60 + endM;

    while (h * 60 + m + slotInterval <= endMinutes) {
      const start = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
      const totalMin = h * 60 + m + slotInterval;
      const eH = Math.floor(totalMin / 60);
      const eM = totalMin % 60;
      const end = `${String(eH).padStart(2, "0")}:${String(eM).padStart(2, "0")}`;
      slots.push({ start_time: start, end_time: end });
      h = eH;
      m = eM;
    }

    if (slots.length === 0) {
      toast({ title: "Nenhum slot gerado com esses parâmetros", variant: "destructive" });
      return;
    }

    const { error } = await bookingApi("create_time_slots", {
      court_id: selectedCourt,
      date: slotDate,
      slots,
    }, true);

    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    } else {
      toast({ title: `${slots.length} horários criados com sucesso!` });
    }
  };

  const handleAction = async (action: string, bookingId: string, extra: Record<string, any> = {}) => {
    const { error } = await bookingApi(action, { booking_id: bookingId, ...extra }, true);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Ação realizada com sucesso!" });
      loadBookings();
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate("/arena-login");
  };

  if (loading) return <div className="flex items-center justify-center min-h-screen"><p>Carregando...</p></div>;

  const statusColors: Record<string, string> = {
    reserved: "bg-blue-500/20 text-blue-400",
    canceled: "bg-red-500/20 text-red-400",
    finished: "bg-green-500/20 text-green-400",
    no_show: "bg-yellow-500/20 text-yellow-400",
  };

  const paymentColors: Record<string, string> = {
    pending: "bg-yellow-500/20 text-yellow-400",
    paid: "bg-green-500/20 text-green-400",
    debt: "bg-red-500/20 text-red-400",
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 border-b border-border bg-card/80 backdrop-blur-md">
        <div className="container flex h-14 items-center justify-between px-4">
          <div className="flex items-center gap-2">
            <LogoImage className="h-8 w-8" />
            <span className="font-bold">{arena?.name || "Arena"}</span>
          </div>
          <Button variant="ghost" size="sm" onClick={handleSignOut}>
            <LogOut className="h-4 w-4 mr-1" /> Sair
          </Button>
        </div>
      </header>

      <main className="container max-w-4xl mx-auto px-4 py-6">
        <Tabs defaultValue="bookings">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="bookings"><Users className="h-4 w-4 mr-1" /> Reservas</TabsTrigger>
            <TabsTrigger value="slots"><Clock className="h-4 w-4 mr-1" /> Horários</TabsTrigger>
            <TabsTrigger value="wallet"><DollarSign className="h-4 w-4 mr-1" /> Financeiro</TabsTrigger>
            <TabsTrigger value="arenas"><Building2 className="h-4 w-4 mr-1" /> Arenas</TabsTrigger>
          </TabsList>

          {/* ─── Tab: Reservas ─── */}
          <TabsContent value="bookings" className="space-y-4">
            <div className="flex gap-2 flex-wrap">
              <Input type="date" value={filterDate} onChange={(e) => setFilterDate(e.target.value)} className="w-40" />
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="reserved">Reservados</SelectItem>
                  <SelectItem value="finished">Finalizados</SelectItem>
                  <SelectItem value="no_show">No-show</SelectItem>
                  <SelectItem value="canceled">Cancelados</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline" size="sm" onClick={loadBookings}>Atualizar</Button>
            </div>

            {bookings.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">Nenhuma reserva encontrada.</p>
            ) : (
              <div className="space-y-3">
                {bookings.map((b) => (
                  <Card key={b.id}>
                    <CardContent className="p-4 space-y-2">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-semibold">{b.customers?.name || "—"}</p>
                          <p className="text-xs text-muted-foreground">{b.customers?.cpf} · {b.customers?.phone}</p>
                        </div>
                        <div className="flex gap-1">
                          <Badge className={statusColors[b.status] || ""}>{b.status}</Badge>
                          <Badge className={paymentColors[b.payment_status] || ""}>{b.payment_status}</Badge>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />{b.date}</span>
                        <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{b.start_time?.slice(0,5)} - {b.end_time?.slice(0,5)}</span>
                        <span>{b.courts?.name}</span>
                        <span className="font-semibold text-foreground">R$ {Number(b.price).toFixed(2)}</span>
                      </div>
                      {b.status === "reserved" && (
                        <div className="flex gap-2 pt-2">
                          <Button size="sm" variant="outline" onClick={() => handleAction("mark_finished", b.id)}>
                            <CheckCircle className="h-3 w-3 mr-1" /> Presença
                          </Button>
                          <Button size="sm" variant="outline" className="text-yellow-500" onClick={() => handleAction("mark_no_show", b.id, { penalty_value: Number(b.price) * 0.5 })}>
                            <AlertTriangle className="h-3 w-3 mr-1" /> No-show
                          </Button>
                          <Button size="sm" variant="outline" className="text-red-500" onClick={() => handleAction("cancel_booking", b.id, { apply_penalty: false })}>
                            <XCircle className="h-3 w-3 mr-1" /> Cancelar
                          </Button>
                          {b.payment_status !== "paid" && (
                            <Button size="sm" onClick={() => handleAction("register_payment", b.id, { method: "cash", amount: b.price })}>
                              <DollarSign className="h-3 w-3 mr-1" /> Pagar
                            </Button>
                          )}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* ─── Tab: Horários ─── */}
          <TabsContent value="slots" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Plus className="h-4 w-4" /> Criar Horários
                </CardTitle>
                <CardDescription>Gere horários em lote para uma quadra</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label>Quadra</Label>
                    <Select value={selectedCourt} onValueChange={setSelectedCourt}>
                      <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                      <SelectContent>
                        {courts.map((c) => (
                          <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label>Data</Label>
                    <Input type="date" value={slotDate} onChange={(e) => setSlotDate(e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <Label>Início</Label>
                    <Input type="time" value={slotStartTime} onChange={(e) => setSlotStartTime(e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <Label>Fim</Label>
                    <Input type="time" value={slotEndTime} onChange={(e) => setSlotEndTime(e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <Label>Intervalo (min)</Label>
                    <Input type="number" value={slotInterval} onChange={(e) => setSlotInterval(Number(e.target.value))} min={15} max={180} step={15} />
                  </div>
                </div>
                <Button className="w-full" onClick={handleCreateSlots}>
                  Gerar Horários
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ─── Tab: Financeiro ─── */}
          <TabsContent value="wallet" className="space-y-4">
            <WalletLookup />
          </TabsContent>

          {/* ─── Tab: Arenas ─── */}
          <TabsContent value="arenas" className="space-y-4">
            <ArenaManagement />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
};

// Sub-component for wallet lookup
const WalletLookup = () => {
  const [cpf, setCpf] = useState("");
  const [walletData, setWalletData] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const search = async () => {
    if (!cpf) return;
    setLoading(true);
    const { data, error } = await bookingApi("get_customer_wallet", { cpf });
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    } else {
      setWalletData(data);
    }
    setLoading(false);
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Consulta de Cliente</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <Input placeholder="CPF do cliente" value={cpf} onChange={(e) => setCpf(e.target.value)} />
            <Button onClick={search} disabled={loading}>Buscar</Button>
          </div>
        </CardContent>
      </Card>

      {walletData && (
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="flex justify-between items-center">
              <div>
                <p className="font-semibold">{walletData.customer.name}</p>
                <p className="text-xs text-muted-foreground">CPF: {walletData.customer.cpf}</p>
              </div>
              <div className={`text-xl font-bold ${walletData.balance < 0 ? "text-red-500" : "text-green-500"}`}>
                R$ {Number(walletData.balance).toFixed(2)}
              </div>
            </div>
            {walletData.transactions?.length > 0 && (
              <div className="space-y-1 mt-3">
                <p className="text-sm font-semibold">Histórico</p>
                {walletData.transactions.map((t: any) => (
                  <div key={t.id} className="flex justify-between text-sm border-b border-border py-1">
                    <span className="text-muted-foreground">{t.description}</span>
                    <span className={t.amount < 0 ? "text-red-500" : "text-green-500"}>
                      R$ {Number(t.amount).toFixed(2)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default ArenaDashboard;
