import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useSportTheme } from "@/contexts/SportContext";
import { useNavigate } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { ArrowLeft } from "lucide-react";
import AppHeader from "@/components/AppHeader";
import ThemedBackground from "@/components/ThemedBackground";
import { organizerQuery, publicQuery } from "@/lib/organizerApi";
import TournamentRulesForm, { TournamentRulesState, getDefaultRules } from "@/components/TournamentRulesForm";

const SPORTS_WITH_RULES = ["tennis", "padel"];

const CreateTournament = () => {
  const { organizerId, user } = useAuth();
  const navigate = useNavigate();
  const { setSelectedSport } = useSportTheme();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    name: "",
    description: "",
    sport: "beach_volleyball",
    format: "single_elimination",
    category: "",
    event_date: "",
    location: "",
    tournament_code: "",
  });

  const [rules, setRules] = useState<TournamentRulesState>(getDefaultRules("tennis"));

  const showRules = SPORTS_WITH_RULES.includes(form.sport);

  const handleSportChange = (sport: string) => {
    setForm({ ...form, sport });
    if (SPORTS_WITH_RULES.includes(sport)) {
      setRules(getDefaultRules(sport));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    const normalizedCode = form.tournament_code.trim().toUpperCase();
    if (!normalizedCode) {
      toast.error("O código do torneio é obrigatório.");
      return;
    }

    setLoading(true);
    setSelectedSport(form.sport as any);

    // Check if code already exists
    const { data: existing } = await publicQuery({
      table: "tournaments",
      select: "id",
      filters: { tournament_code: normalizedCode },
      maybeSingle: true,
    });

    if (existing) {
      toast.error("Já existe um torneio utilizando este código. Escolha outro código.");
      setLoading(false);
      return;
    }

    const { data, error } = await organizerQuery({
      table: "tournaments",
      operation: "insert",
      data: {
        name: form.name,
        description: form.description || null,
        sport: form.sport,
        format: form.format,
        category: form.category || null,
        event_date: form.event_date || null,
        location: form.location || null,
        created_by: organizerId || "",
        status: "draft",
        tournament_code: normalizedCode,
      },
      select: "*",
      single: true,
    });

    if (error) {
      toast.error(error.message);
      setLoading(false);
      return;
    }

    // Save tournament rules for tennis/padel
    if (showRules && data?.id) {
      const { error: rulesError } = await organizerQuery({
        table: "tournament_rules",
        operation: "insert",
        data: {
          tournament_id: data.id,
          ...rules,
        },
      });
      if (rulesError) {
        console.error("Error saving rules:", rulesError);
        // Non-blocking: tournament was created, rules can be set later
      }
    }

    toast.success(`Torneio criado! Código: ${normalizedCode}`);
    navigate(`/tournaments/${data.id}`);
    setLoading(false);
  };

  return (
    <ThemedBackground>
      <AppHeader />
      <main className="container max-w-2xl py-8">
        <Button variant="ghost" onClick={() => navigate("/dashboard")} className="mb-4 gap-2">
          <ArrowLeft className="h-4 w-4" /> Voltar
        </Button>
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="mb-2 text-3xl font-bold tracking-tight">Criar Torneio</h1>
          <p className="mb-8 text-muted-foreground">Preencha os detalhes do torneio</p>

          <form onSubmit={handleSubmit} className="space-y-6 rounded-xl border border-border bg-card p-6 shadow-card">
            <div className="space-y-2">
              <Label htmlFor="name">Nome do Torneio</Label>
              <Input
                id="name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Ex: Campeonato de Verão 2026"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="tournament_code">Código do Torneio</Label>
              <Input
                id="tournament_code"
                value={form.tournament_code}
                onChange={(e) => setForm({ ...form, tournament_code: e.target.value })}
                placeholder="Ex: VERAO2026"
                required
              />
              <p className="text-xs text-muted-foreground">Letras e números. Será convertido para maiúsculas.</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Descrição</Label>
              <Textarea
                id="description"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Detalhes do torneio, regras, premiação..."
                rows={3}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Esporte</Label>
                <Select value={form.sport} onValueChange={handleSportChange}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="beach_volleyball">🏐 Vôlei de Praia</SelectItem>
                    <SelectItem value="futevolei">⚽ Futevôlei</SelectItem>
                    <SelectItem value="beach_tennis">🎾 Beach Tennis</SelectItem>
                    <SelectItem value="tennis">🎾 Tênis</SelectItem>
                    <SelectItem value="padel">🏓 Padel</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="category">Categoria</Label>
                <Input
                  id="category"
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                  placeholder="Ex: Masculino, Feminino, Misto"
                />
              </div>
            </div>

            {/* Rules configuration for tennis/padel */}
            {showRules && (
              <div className="space-y-2">
                <Label className="text-base font-semibold">⚙️ Configurações de Regras</Label>
                <TournamentRulesForm sport={form.sport} rules={rules} onChange={setRules} />
              </div>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="event_date">Data do Evento</Label>
                <Input
                  id="event_date"
                  type="date"
                  value={form.event_date}
                  onChange={(e) => setForm({ ...form, event_date: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="location">Local</Label>
                <Input
                  id="location"
                  value={form.location}
                  onChange={(e) => setForm({ ...form, location: e.target.value })}
                  placeholder="Ex: Praia de Copacabana"
                />
              </div>
            </div>

            <Button type="submit" className="w-full bg-gradient-primary text-primary-foreground hover:opacity-90" disabled={loading}>
              {loading ? "Criando..." : "Criar Torneio"}
            </Button>
          </form>
        </motion.div>
      </main>
    </ThemedBackground>
  );
};

export default CreateTournament;
