import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { Trophy, Plus, Users, Settings, ArrowLeft, Swords } from "lucide-react";
import LogoImage from "@/components/LogoImage";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";

const sportLabels: Record<string, string> = {
  beach_tennis: "Beach Tennis",
  beach_volleyball: "Vôlei de Praia",
  futevolei: "Futevôlei",
  tennis: "Tênis",
  padel: "Padel",
  futsal: "Futsal",
};

const sportEmojis: Record<string, string> = {
  beach_tennis: "🎾",
  beach_volleyball: "🏐",
  futevolei: "⚽🏐",
  tennis: "🎾",
  padel: "🏸",
  futsal: "⚽",
};

interface Community {
  id: string;
  name: string;
  sport: string;
  challenge_range: number;
  scoring_mode: string;
  created_by: string;
  created_at: string;
}

const RankingCommunities = () => {
  const navigate = useNavigate();
  const [communities, setCommunities] = useState<Community[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [user, setUser] = useState<any>(null);

  // Create form
  const [newName, setNewName] = useState("");
  const [newSport, setNewSport] = useState("beach_tennis");
  const [newRange, setNewRange] = useState("5");
  const [newMode, setNewMode] = useState("athlete");

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user));
    loadCommunities();
  }, []);

  const loadCommunities = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("challenge-api", {
        body: { action: "list_communities" },
      });
      console.log("challenge-api response:", { data, error });
      if (error) {
        console.error("challenge-api error:", error);
      } else if (Array.isArray(data)) {
        setCommunities(data);
      } else if (data && !data.error) {
        setCommunities(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      console.error("challenge-api exception:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    if (!newName.trim()) {
      toast({ title: "Nome obrigatório", variant: "destructive" });
      return;
    }
    const { data, error } = await supabase.functions.invoke("challenge-api", {
      body: {
        action: "create_community",
        name: newName,
        sport: newSport,
        challenge_range: parseInt(newRange),
        scoring_mode: newMode,
      },
    });
    if (error || data?.error) {
      toast({ title: "Erro", description: data?.error || "Falha ao criar", variant: "destructive" });
      return;
    }
    toast({ title: "Comunidade criada!" });
    setShowCreate(false);
    setNewName("");
    loadCommunities();
  };

  return (
    <div className="min-h-screen relative overflow-hidden">
      <div className="fixed inset-0 bg-gradient-to-b from-[hsl(220_25%_4%)] via-[hsl(15_15%_7%)] to-[hsl(20_20%_6%)]" />
      <div className="fixed top-[-10%] right-[-10%] w-[500px] h-[500px] rounded-full bg-[radial-gradient(circle,hsl(45_80%_50%/0.12),transparent_65%)] blur-3xl" />

      <header className="sticky top-0 z-50 border-b border-[hsl(0_0%_100%/0.1)] bg-[hsl(220_15%_8%/0.9)] backdrop-blur-md relative">
        <div className="container flex h-14 items-center justify-between px-4">
          <Link to="/" className="flex items-center gap-2">
            <LogoImage className="h-8 w-8" />
            <span className="font-bold text-foreground">Comunidades</span>
          </Link>
          <div className="flex items-center gap-2">
            <Link to="/">
              <Button variant="ghost" size="sm"><ArrowLeft className="h-4 w-4 mr-1" /> Voltar</Button>
            </Link>
          </div>
        </div>
      </header>

      <main className="relative z-10 container max-w-lg mx-auto px-4 py-6 space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
            <Trophy className="h-5 w-5 text-amber-400" />
            Rankings & Desafios
          </h1>
          {user && (
            <Button size="sm" onClick={() => setShowCreate(!showCreate)} className="bg-gradient-to-r from-amber-500 to-orange-600 text-white">
              <Plus className="h-4 w-4 mr-1" /> Criar
            </Button>
          )}
        </div>

        {showCreate && (
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
            <Card className="border-[hsl(0_0%_100%/0.1)] bg-[hsl(220_15%_10%/0.8)] backdrop-blur-md">
              <CardHeader>
                <CardTitle className="text-foreground text-base">Nova Comunidade</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-1">
                  <Label className="text-foreground text-sm">Nome</Label>
                  <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Ex: Ranking BT Salvador" className="bg-[hsl(220_15%_12%)] border-[hsl(0_0%_100%/0.1)]" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-foreground text-sm">Esporte</Label>
                    <Select value={newSport} onValueChange={setNewSport}>
                      <SelectTrigger className="bg-[hsl(220_15%_12%)] border-[hsl(0_0%_100%/0.1)]"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {Object.entries(sportLabels).map(([k, v]) => (
                          <SelectItem key={k} value={k}>{sportEmojis[k]} {v}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-foreground text-sm">Alcance</Label>
                    <Select value={newRange} onValueChange={setNewRange}>
                      <SelectTrigger className="bg-[hsl(220_15%_12%)] border-[hsl(0_0%_100%/0.1)]"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {[3, 5, 6, 8, 10, 15, 20].map((n) => (
                          <SelectItem key={n} value={String(n)}>±{n} posições</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-foreground text-sm">Modo de Pontuação</Label>
                  <Select value={newMode} onValueChange={setNewMode}>
                    <SelectTrigger className="bg-[hsl(220_15%_12%)] border-[hsl(0_0%_100%/0.1)]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="athlete">Atleta marca (com confirmação)</SelectItem>
                      <SelectItem value="organizer">Organizador marca tudo</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button onClick={handleCreate} className="w-full bg-gradient-to-r from-amber-500 to-orange-600 text-white">
                  Criar Comunidade
                </Button>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {loading ? (
          <p className="text-muted-foreground text-center py-8">Carregando...</p>
        ) : communities.length === 0 ? (
          <p className="text-muted-foreground text-center py-8">Nenhuma comunidade encontrada. Crie a primeira!</p>
        ) : (
          <div className="space-y-3">
            {communities.map((c, i) => (
              <motion.div key={c.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
                <Card
                  className="cursor-pointer border-[hsl(0_0%_100%/0.1)] bg-[hsl(220_15%_10%/0.8)] backdrop-blur-md hover:border-amber-500/40 transition-all"
                  onClick={() => navigate(`/comunidade/${c.id}`)}
                >
                  <CardContent className="p-4 flex items-center justify-between">
                    <div>
                      <p className="font-semibold text-foreground flex items-center gap-2">
                        <span className="text-lg">{sportEmojis[c.sport] || "🏆"}</span>
                        {c.name}
                      </p>
                      <div className="flex gap-2 mt-1">
                        <Badge variant="secondary" className="text-xs">{sportLabels[c.sport] || c.sport}</Badge>
                        <Badge variant="outline" className="text-xs border-amber-500/30 text-amber-400">±{c.challenge_range}</Badge>
                        <Badge variant="outline" className="text-xs border-primary/30 text-primary">
                          {c.scoring_mode === "athlete" ? "Atleta marca" : "Organizador marca"}
                        </Badge>
                      </div>
                    </div>
                    <Swords className="h-5 w-5 text-muted-foreground" />
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        )}

        {!user && (
          <div className="text-center pt-4 space-y-2">
            <p className="text-sm text-muted-foreground">Faça login para criar comunidades e desafiar atletas</p>
            <Link to="/atleta/login">
              <Button variant="outline" className="border-primary/30 text-primary">Entrar</Button>
            </Link>
          </div>
        )}
      </main>
    </div>
  );
};

export default RankingCommunities;
