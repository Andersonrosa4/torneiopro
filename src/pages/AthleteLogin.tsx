import { useState } from "react";
import { publicQuery } from "@/lib/organizerApi";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { Hash } from "lucide-react";
import logoImg from "@/assets/logo-torneio-pro.png";
import ThemedBackground from "@/components/ThemedBackground";
import FlowAppsBranding from "@/components/FlowAppsBranding";

const AthleteLogin = () => {
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const normalizedCode = code.trim().toUpperCase();
    if (!normalizedCode) {
      toast.error("Digite o código do torneio");
      return;
    }
    setLoading(true);

    const { data, error } = await publicQuery<{ id: string; name: string }>({
      table: "tournaments",
      select: "id, name",
      filters: { tournament_code: normalizedCode },
      maybeSingle: true,
    });

    if (error || !data) {
      toast.error("Código de torneio não encontrado");
    } else {
      toast.success(`Torneio encontrado: ${data.name}`);
      navigate(`/tournament-view/${data.id}`);
    }
    setLoading(false);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-[hsl(220_15%_10%)] via-[hsl(220_12%_14%)] to-[hsl(25_15%_12%)] px-4 relative overflow-hidden">
      {/* Sand texture */}
      <div className="absolute inset-0 sand-texture pointer-events-none" />
      {/* Light beams */}
      <div className="absolute top-0 left-1/4 w-32 h-full bg-gradient-to-b from-[hsl(195_80%_60%/0.08)] to-transparent rotate-12 animate-light-beam" />
      <div className="absolute top-0 right-1/3 w-24 h-full bg-gradient-to-b from-[hsl(35_80%_60%/0.06)] to-transparent -rotate-6 animate-light-beam" style={{ animationDelay: "2s" }} />
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-sm"
      >
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-32 w-32 items-center justify-center">
            <img src={logoImg} alt="Torneio Pro" className="h-32 w-32 object-contain" style={{ mixBlendMode: 'darken' }} />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Acesso do Atleta
          </h1>
          <p className="mt-2 text-muted-foreground">
            Digite o código do seu torneio
          </p>
        </div>

        <div className="rounded-xl border border-border bg-card p-6 shadow-card">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="code">Código do Torneio</Label>
              <div className="relative">
                <Hash className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="code"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="Ex: VERAO2026"
                  className="pl-10 text-center text-2xl tracking-[0.3em] font-mono uppercase"
                  required
                />
              </div>
            </div>
            <Button
              type="submit"
              className="w-full bg-gradient-primary text-primary-foreground hover:opacity-90"
              disabled={loading || code.trim().length === 0}
            >
              {loading ? "Buscando..." : "Entrar no Torneio"}
            </Button>
          </form>
        </div>

        <FlowAppsBranding variant="login-cta" />

        <div className="mt-4 text-center">
          <button
            onClick={() => navigate("/")}
            className="text-sm text-muted-foreground hover:text-primary transition-colors"
          >
            ← Voltar ao início
          </button>
        </div>
      </motion.div>
    </div>
  );
};

export default AthleteLogin;
