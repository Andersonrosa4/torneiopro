import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useNavigate, useLocation } from "react-router-dom";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { Trophy, Mail, Lock, User } from "lucide-react";
import { useSportTheme } from "@/contexts/SportContext";

const Auth = () => {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { setSelectedSport } = useSportTheme();
  const sport = (location.state as any)?.sport || null;

  useEffect(() => {
    if (sport) {
      setSelectedSport(sport);
    }
  }, [sport, setSelectedSport]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (isLogin) {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast.success("Bem-vindo de volta!");
        navigate("/dashboard");
      } else {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { display_name: displayName },
            emailRedirectTo: window.location.origin,
          },
        });
        if (error) throw error;
        toast.success("Verifique seu email para confirmar sua conta!");
      }
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  const sportBgMap: Record<string, string> = {
    beach_volleyball: "from-[hsl(35_40%_20%)] via-[hsl(35_35%_25%)] to-[hsl(48_50%_30%)]",
    futevolei: "from-[hsl(155_40%_20%)] via-[hsl(195_35%_25%)] to-[hsl(155_50%_30%)]",
    beach_tennis: "from-[hsl(180_40%_20%)] via-[hsl(195_35%_25%)] to-[hsl(22_50%_30%)]",
  };

  const sportBg = sport ? sportBgMap[sport] : "from-[hsl(35_40%_20%)] via-[hsl(195_35%_25%)] to-[hsl(22_50%_30%)]";

  return (
    <div className={`flex min-h-screen items-center justify-center bg-gradient-to-b ${sportBg} px-4 relative overflow-hidden`}>
      {/* Animated light beams - sport themed */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/4 w-32 h-full bg-gradient-to-b from-[hsl(var(--primary))_0.08] to-transparent rotate-12 animate-light-beam" />
        <div className="absolute top-0 right-1/3 w-24 h-full bg-gradient-to-b from-[hsl(var(--accent))_0.06] to-transparent -rotate-6 animate-light-beam" style={{ animationDelay: "2s" }} />
      </div>

      {/* Sand texture overlay */}
      <div className="absolute inset-0 sand-texture pointer-events-none" />

      {/* Content */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md relative z-10"
      >
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-primary shadow-glow">
            <Trophy className="h-8 w-8 text-primary-foreground" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            Gestão Pro
          </h1>
          <p className="mt-2 text-muted-foreground">
            {isLogin ? "Entre para gerenciar seus torneios" : "Crie sua conta"}
          </p>
        </div>

        <div className="rounded-xl border border-border bg-card p-6 shadow-card">
          <form onSubmit={handleSubmit} className="space-y-4">
            {!isLogin && (
              <div className="space-y-2">
                <Label htmlFor="displayName">Nome</Label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="displayName"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="Seu nome"
                    className="pl-10"
                    required={!isLogin}
                  />
                </div>
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="voce@exemplo.com"
                  className="pl-10"
                  required
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Senha</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="pl-10"
                  required
                  minLength={6}
                />
              </div>
            </div>
            <Button type="submit" className="w-full bg-gradient-primary text-primary-foreground hover:opacity-90" disabled={loading}>
              {loading ? "Carregando..." : isLogin ? "Entrar" : "Criar Conta"}
            </Button>
          </form>

          <div className="mt-4 text-center">
            <button
              type="button"
              onClick={() => setIsLogin(!isLogin)}
              className="text-sm text-primary hover:underline"
            >
              {isLogin ? "Não tem conta? Cadastre-se" : "Já tem conta? Entre"}
            </button>
          </div>
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

export default Auth;
