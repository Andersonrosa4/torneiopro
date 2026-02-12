import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useNavigate, useLocation } from "react-router-dom";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { Trophy, Lock, User, ArrowLeft, Mail } from "lucide-react";
import { useSportTheme } from "@/contexts/SportContext";
import { useAuth } from "@/contexts/AuthContext";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const Auth = () => {
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [redirecting, setRedirecting] = useState(false);
  const [loginType, setLoginType] = useState<"admin" | "organizer">("admin");
  const navigate = useNavigate();
  const location = useLocation();
  const { setSelectedSport } = useSportTheme();
  const { login, isAuthenticated } = useAuth();
  const sport = (location.state as any)?.sport || null;

  useEffect(() => {
    if (sport) {
      setSelectedSport(sport);
    }
  }, [sport, setSelectedSport]);

  useEffect(() => {
    if (isAuthenticated) {
      navigate("/dashboard", { replace: true });
    }
  }, [isAuthenticated, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const body = loginType === "admin"
        ? { email: email.trim(), password }
        : { username: username.trim(), password };

      const { data, error } = await supabase.functions.invoke("organizer-login", {
        body,
      });

      if (error || !data?.success) {
        throw new Error(data?.error || "Falha na autenticação");
      }

      login(data.token, data.organizerId, data.role);
      setRedirecting(true);
      toast.success("Bem-vindo!");
      navigate("/dashboard", { replace: true });
    } catch (error: any) {
      toast.error(error.message || "Credenciais incorretas");
    } finally {
      setLoading(false);
    }
  };

  const sportBgMap: Record<string, string> = {
    beach_volleyball: "from-[hsl(35_20%_10%)] via-[hsl(35_15%_14%)] to-[hsl(48_20%_12%)]",
    futevolei: "from-[hsl(155_20%_10%)] via-[hsl(195_15%_14%)] to-[hsl(155_20%_12%)]",
    beach_tennis: "from-[hsl(180_20%_10%)] via-[hsl(195_15%_14%)] to-[hsl(22_20%_12%)]",
  };

  const sportBg = sport ? sportBgMap[sport] : "from-[hsl(220_15%_10%)] via-[hsl(220_12%_14%)] to-[hsl(25_15%_12%)]";

  if (redirecting) {
    return (
      <div className={`flex min-h-screen items-center justify-center bg-gradient-to-b ${sportBg}`}>
        <div className="text-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent mx-auto mb-4" />
          <p className="text-muted-foreground">Redirecionando...</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex min-h-screen items-center justify-center bg-gradient-to-b ${sportBg} px-4 relative overflow-hidden`}>
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/4 w-32 h-full bg-gradient-to-b from-[hsl(var(--primary))_0.08] to-transparent rotate-12 animate-light-beam" />
        <div className="absolute top-0 right-1/3 w-24 h-full bg-gradient-to-b from-[hsl(var(--accent))_0.06] to-transparent -rotate-6 animate-light-beam" style={{ animationDelay: "2s" }} />
      </div>

      <div className="absolute inset-0 sand-texture pointer-events-none" />

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
            Entre para gerenciar seus torneios
          </p>
        </div>

        <div className="rounded-xl border border-border bg-card p-6 shadow-card">
          <Tabs value={loginType} onValueChange={(v) => setLoginType(v as "admin" | "organizer")} className="mb-4">
            <TabsList className="w-full">
              <TabsTrigger value="admin" className="flex-1">Admin</TabsTrigger>
              <TabsTrigger value="organizer" className="flex-1">Organizador</TabsTrigger>
            </TabsList>
          </Tabs>

          <form onSubmit={handleSubmit} className="space-y-4">
            {loginType === "admin" ? (
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="seu@email.com"
                    className="pl-10"
                    required
                  />
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <Label htmlFor="username">Usuário</Label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="username"
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="Seu usuário"
                    className="pl-10"
                    required
                  />
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="password">Senha</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Sua senha"
                  className="pl-10"
                  required
                />
              </div>
            </div>

            <Button
              type="submit"
              disabled={loading}
              className="w-full bg-gradient-primary text-primary-foreground hover:opacity-90"
            >
              {loading ? "Autenticando..." : "Entrar"}
            </Button>
          </form>

          <div className="mt-6 text-center">
            <p className="text-xs text-muted-foreground">
              Solicite ao Administrador para criar sua conta
            </p>
          </div>
        </div>

        <div className="mt-4 text-center">
          <button
            onClick={() => navigate("/")}
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-primary transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Voltar para Seleção de Esporte
          </button>
        </div>
      </motion.div>
    </div>
  );
};

export default Auth;
