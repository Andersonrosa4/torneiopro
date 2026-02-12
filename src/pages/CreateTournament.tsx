import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
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

const CreateTournament = () => {
  const { user } = useAuth();
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
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setLoading(true);
    setSelectedSport(form.sport as any);

    const { data, error } = await supabase
      .from("tournaments")
      .insert({
        name: form.name,
        description: form.description || null,
        sport: form.sport as any,
        format: form.format,
        category: form.category || null,
        event_date: form.event_date || null,
        location: form.location || null,
        created_by: user.id,
        status: "draft" as const,
      })
      .select()
      .single();

    if (error) {
      toast.error(error.message);
    } else {
      toast.success(`Torneio criado! Código: ${data.tournament_code}`);
      navigate(`/tournaments/${data.id}`);
    }
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
                <Select value={form.sport} onValueChange={(v) => setForm({ ...form, sport: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="beach_volleyball">🏐 Vôlei de Praia</SelectItem>
                    <SelectItem value="futevolei">⚽ Futevôlei</SelectItem>
                    <SelectItem value="beach_tennis">🎾 Beach Tennis</SelectItem>
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
