import { useState, useEffect } from "react";
import { bookingApi } from "@/lib/bookingApi";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/hooks/use-toast";
import { Building2, Plus, Edit2, MapPin, Phone, Clock, Save, X, ChevronDown, ChevronUp } from "lucide-react";

interface StateItem { id: string; name: string; uf: string; }
interface CityItem { id: string; name: string; }
interface ArenaItem {
  id: string; name: string; address: string | null; phone: string | null; whatsapp: string | null;
  opening_time: string; closing_time: string; working_days: string; cancel_policy_hours: number;
  description: string | null; active: boolean; logo_url: string | null;
  state_id: string; city_id: string;
  states?: { name: string; uf: string } | null;
  cities?: { name: string } | null;
}
interface CourtItem {
  id: string; name: string; sport_type: string; surface_type: string | null;
  slot_duration_minutes: number; price_per_slot: number; active: boolean;
}

const SPORT_TYPES = [
  { value: "beach_tennis", label: "Beach Tennis" },
  { value: "beach_volleyball", label: "Vôlei de Praia" },
  { value: "futevolei", label: "Futevôlei" },
  { value: "padel", label: "Padel" },
  { value: "tennis", label: "Tênis" },
  { value: "futsal", label: "Futsal" },
  { value: "society", label: "Society" },
];

const ArenaManagement = () => {
  const [arenas, setArenas] = useState<ArenaItem[]>([]);
  const [states, setStates] = useState<StateItem[]>([]);
  const [cities, setCities] = useState<CityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingArena, setEditingArena] = useState<ArenaItem | null>(null);
  const [expandedArena, setExpandedArena] = useState<string | null>(null);
  const [courts, setCourts] = useState<Record<string, CourtItem[]>>({});

  // Form state
  const [form, setForm] = useState({
    name: "", address: "", phone: "", whatsapp: "",
    state_id: "", city_id: "", opening_time: "08:00", closing_time: "22:00",
    cancel_policy_hours: 2, description: "",
  });

  // Court form
  const [showCourtForm, setShowCourtForm] = useState<string | null>(null);
  const [courtForm, setCourtForm] = useState({
    name: "", sport_type: "beach_tennis", surface_type: "sand",
    slot_duration_minutes: 60, price_per_slot: 0,
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    const [arenasRes, statesRes] = await Promise.all([
      bookingApi<ArenaItem[]>("list_admin_arenas", {}, true),
      bookingApi<StateItem[]>("list_states"),
    ]);
    if (arenasRes.data) setArenas(arenasRes.data);
    if (statesRes.data) setStates(statesRes.data);
    setLoading(false);
  };

  const loadCities = async (stateId: string) => {
    const { data } = await bookingApi<CityItem[]>("list_cities", { state_id: stateId });
    if (data) setCities(data);
  };

  const loadCourts = async (arenaId: string) => {
    const { data } = await bookingApi<CourtItem[]>("list_courts", { arena_id: arenaId });
    if (data) setCourts(prev => ({ ...prev, [arenaId]: data }));
  };

  const handleStateChange = (stateId: string) => {
    setForm(f => ({ ...f, state_id: stateId, city_id: "" }));
    loadCities(stateId);
  };

  const resetForm = () => {
    setForm({ name: "", address: "", phone: "", whatsapp: "", state_id: "", city_id: "", opening_time: "08:00", closing_time: "22:00", cancel_policy_hours: 2, description: "" });
    setEditingArena(null);
    setShowForm(false);
  };

  const startEdit = (arena: ArenaItem) => {
    setForm({
      name: arena.name, address: arena.address || "", phone: arena.phone || "",
      whatsapp: arena.whatsapp || "", state_id: arena.state_id, city_id: arena.city_id,
      opening_time: arena.opening_time?.slice(0, 5) || "08:00",
      closing_time: arena.closing_time?.slice(0, 5) || "22:00",
      cancel_policy_hours: arena.cancel_policy_hours, description: arena.description || "",
    });
    loadCities(arena.state_id);
    setEditingArena(arena);
    setShowForm(true);
  };

  const handleSubmit = async () => {
    if (!form.name || !form.state_id || !form.city_id) {
      toast({ title: "Preencha nome, estado e cidade", variant: "destructive" });
      return;
    }

    if (editingArena) {
      const { error } = await bookingApi("update_arena", { arena_id: editingArena.id, ...form }, true);
      if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
      toast({ title: "Arena atualizada!" });
    } else {
      const { error } = await bookingApi("create_arena", form, true);
      if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
      toast({ title: "Arena criada com sucesso!" });
    }
    resetForm();
    loadData();
  };

  const toggleArenaActive = async (arena: ArenaItem) => {
    const { error } = await bookingApi("update_arena", { arena_id: arena.id, active: !arena.active }, true);
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    toast({ title: arena.active ? "Arena desativada" : "Arena ativada" });
    loadData();
  };

  const toggleExpand = (arenaId: string) => {
    if (expandedArena === arenaId) {
      setExpandedArena(null);
    } else {
      setExpandedArena(arenaId);
      if (!courts[arenaId]) loadCourts(arenaId);
    }
  };

  const handleCreateCourt = async (arenaId: string) => {
    if (!courtForm.name) { toast({ title: "Nome da quadra é obrigatório", variant: "destructive" }); return; }
    const { error } = await bookingApi("create_court", { arena_id: arenaId, ...courtForm }, true);
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Quadra criada!" });
    setShowCourtForm(null);
    setCourtForm({ name: "", sport_type: "beach_tennis", surface_type: "sand", slot_duration_minutes: 60, price_per_slot: 0 });
    loadCourts(arenaId);
  };

  const handleToggleCourtActive = async (court: CourtItem) => {
    const { error } = await bookingApi("update_court", { court_id: court.id, active: !court.active }, true);
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    toast({ title: court.active ? "Quadra desativada" : "Quadra ativada" });
    // Reload courts for the expanded arena
    if (expandedArena) loadCourts(expandedArena);
  };

  if (loading) return <p className="text-center py-8 text-muted-foreground">Carregando...</p>;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold flex items-center gap-2">
          <Building2 className="h-5 w-5" /> Gestão de Arenas
        </h2>
        {!showForm && (
          <Button size="sm" onClick={() => setShowForm(true)}>
            <Plus className="h-4 w-4 mr-1" /> Nova Arena
          </Button>
        )}
      </div>

      {/* Form */}
      {showForm && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{editingArena ? "Editar Arena" : "Nova Arena"}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Nome *</Label>
                <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Nome da arena" />
              </div>
              <div className="space-y-1">
                <Label>Endereço</Label>
                <Input value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} placeholder="Rua, número..." />
              </div>
              <div className="space-y-1">
                <Label>Estado *</Label>
                <Select value={form.state_id} onValueChange={handleStateChange}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    {states.map(s => <SelectItem key={s.id} value={s.id}>{s.name} ({s.uf})</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Cidade *</Label>
                <Select value={form.city_id} onValueChange={v => setForm(f => ({ ...f, city_id: v }))}>
                  <SelectTrigger><SelectValue placeholder="Selecione o estado primeiro" /></SelectTrigger>
                  <SelectContent>
                    {cities.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Telefone</Label>
                <Input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="(11) 99999-9999" />
              </div>
              <div className="space-y-1">
                <Label>WhatsApp</Label>
                <Input value={form.whatsapp} onChange={e => setForm(f => ({ ...f, whatsapp: e.target.value }))} placeholder="(11) 99999-9999" />
              </div>
              <div className="space-y-1">
                <Label>Abertura</Label>
                <Input type="time" value={form.opening_time} onChange={e => setForm(f => ({ ...f, opening_time: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>Fechamento</Label>
                <Input type="time" value={form.closing_time} onChange={e => setForm(f => ({ ...f, closing_time: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>Política de cancelamento (horas)</Label>
                <Input type="number" value={form.cancel_policy_hours} onChange={e => setForm(f => ({ ...f, cancel_policy_hours: Number(e.target.value) }))} min={0} />
              </div>
              <div className="space-y-1">
                <Label>Descrição</Label>
                <Input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Descrição opcional" />
              </div>
            </div>
            <div className="flex gap-2">
              <Button onClick={handleSubmit}><Save className="h-4 w-4 mr-1" /> {editingArena ? "Salvar" : "Criar"}</Button>
              <Button variant="ghost" onClick={resetForm}><X className="h-4 w-4 mr-1" /> Cancelar</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Arena list */}
      {arenas.length === 0 ? (
        <p className="text-center py-8 text-muted-foreground">Nenhuma arena cadastrada.</p>
      ) : (
        <div className="space-y-3">
          {arenas.map(arena => (
            <Card key={arena.id}>
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold">{arena.name}</p>
                      <Badge variant={arena.active ? "default" : "secondary"}>{arena.active ? "Ativa" : "Inativa"}</Badge>
                    </div>
                    <div className="flex items-center gap-3 text-sm text-muted-foreground mt-1">
                      {arena.states && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{arena.cities?.name}, {arena.states.uf}</span>}
                      {arena.phone && <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{arena.phone}</span>}
                      <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{arena.opening_time?.slice(0,5)} - {arena.closing_time?.slice(0,5)}</span>
                    </div>
                    {arena.address && <p className="text-xs text-muted-foreground mt-1">{arena.address}</p>}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="ghost" size="sm" onClick={() => startEdit(arena)}><Edit2 className="h-4 w-4" /></Button>
                    <Switch checked={arena.active} onCheckedChange={() => toggleArenaActive(arena)} />
                    <Button variant="ghost" size="sm" onClick={() => toggleExpand(arena.id)}>
                      {expandedArena === arena.id ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>

                {/* Expanded: Courts */}
                {expandedArena === arena.id && (
                  <div className="border-t border-border pt-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold">Quadras</p>
                      <Button size="sm" variant="outline" onClick={() => setShowCourtForm(showCourtForm === arena.id ? null : arena.id)}>
                        <Plus className="h-3 w-3 mr-1" /> Quadra
                      </Button>
                    </div>

                    {showCourtForm === arena.id && (
                      <Card className="border-dashed">
                        <CardContent className="p-3 space-y-2">
                          <div className="grid grid-cols-2 gap-2">
                            <div className="space-y-1">
                              <Label className="text-xs">Nome *</Label>
                              <Input value={courtForm.name} onChange={e => setCourtForm(f => ({ ...f, name: e.target.value }))} placeholder="Quadra 1" className="h-8 text-sm" />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs">Esporte</Label>
                              <Select value={courtForm.sport_type} onValueChange={v => setCourtForm(f => ({ ...f, sport_type: v }))}>
                                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  {SPORT_TYPES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs">Duração slot (min)</Label>
                              <Input type="number" value={courtForm.slot_duration_minutes} onChange={e => setCourtForm(f => ({ ...f, slot_duration_minutes: Number(e.target.value) }))} className="h-8 text-sm" min={15} step={15} />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs">Preço/slot (R$)</Label>
                              <Input type="number" value={courtForm.price_per_slot} onChange={e => setCourtForm(f => ({ ...f, price_per_slot: Number(e.target.value) }))} className="h-8 text-sm" min={0} step={5} />
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <Button size="sm" onClick={() => handleCreateCourt(arena.id)}>Criar Quadra</Button>
                            <Button size="sm" variant="ghost" onClick={() => setShowCourtForm(null)}>Cancelar</Button>
                          </div>
                        </CardContent>
                      </Card>
                    )}

                    {(courts[arena.id] || []).length === 0 ? (
                      <p className="text-xs text-muted-foreground">Nenhuma quadra cadastrada.</p>
                    ) : (
                      (courts[arena.id] || []).map(court => (
                        <div key={court.id} className="flex items-center justify-between text-sm bg-muted/30 rounded-md px-3 py-2">
                          <div>
                            <span className="font-medium">{court.name}</span>
                            <span className="text-muted-foreground ml-2">
                              {SPORT_TYPES.find(s => s.value === court.sport_type)?.label || court.sport_type} · {court.slot_duration_minutes}min · R$ {Number(court.price_per_slot).toFixed(2)}
                            </span>
                          </div>
                          <Switch checked={court.active} onCheckedChange={() => handleToggleCourtActive(court)} />
                        </div>
                      ))
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

export default ArenaManagement;
