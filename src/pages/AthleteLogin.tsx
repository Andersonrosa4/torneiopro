import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { Trophy, Hash } from "lucide-react";

const AthleteLogin = () => {
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (code.length !== 5) {
      toast.error("O código deve ter 5 dígitos");
      return;
    }
    setLoading(true);

    const { data, error } = await supabase
      .from("tournaments")
      .select("id, name")
      .eq("tournament_code", code)
      .single();

    if (error || !data) {
      toast.error("Código de torneio não encontrado");
    } else {
      toast.success(`Torneio encontrado: ${data.name}`);
      navigate(`/tournament-view/${data.id}`);
    }
    setLoading(false);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-sm"
      >
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-primary shadow-glow">
            <Trophy className="h-8 w-8 text-primary-foreground" />
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
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 5))}
                  placeholder="00000"
                  className="pl-10 text-center text-2xl tracking-[0.5em] font-mono"
                  maxLength={5}
                  inputMode="numeric"
                  required
                />
              </div>
            </div>
            <Button
              type="submit"
              className="w-full bg-gradient-primary text-primary-foreground hover:opacity-90"
              disabled={loading || code.length !== 5}
            >
              {loading ? "Buscando..." : "Entrar no Torneio"}
            </Button>
          </form>
        </div>

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
