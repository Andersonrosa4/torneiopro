import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useNavigate, useLocation } from "react-router-dom";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { Lock, User, ArrowLeft, Mail, Shield, Users } from "lucide-react";
import LogoImage from "@/components/LogoImage";
import FlowAppsBranding from "@/components/FlowAppsBranding";
import { useSportTheme } from "@/contexts/SportContext";
import { useAuth } from "@/contexts/AuthContext";

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
    <div className={`flex min-h-screen items-center justify-center bg-gradient-to-b ${sportBg} px-4 py-8 relative overflow-hidden`}>
      {/* Ambient glow orbs */}
      <div className="absolute top-[-20%] left-[-10%] w-[500px] h-[500px] rounded-full bg-[radial-gradient(circle,hsl(var(--primary)/0.15),transparent_70%)] blur-3xl pointer-events-none" />
      <div className="absolute bottom-[-20%] right-[-10%] w-[400px] h-[400px] rounded-full bg-[radial-gradient(circle,hsl(var(--accent)/0.12),transparent_70%)] blur-3xl pointer-events-none" />

      {/* Subtle grid pattern */}
      <div
        className="absolute inset-0 pointer-events-none opacity-[0.03]"
        style={{
          backgroundImage: `linear-gradient(hsl(var(--foreground)) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--foreground)) 1px, transparent 1px)`,
          backgroundSize: "60px 60px",
        }}
      />

      {/* Light beams */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/4 w-32 h-full bg-gradient-to-b from-[hsl(var(--primary)/0.06)] to-transparent rotate-12 animate-light-beam" />
        <div className="absolute top-0 right-1/3 w-24 h-full bg-gradient-to-b from-[hsl(var(--accent)/0.04)] to-transparent -rotate-6 animate-light-beam" style={{ animationDelay: "2s" }} />
      </div>

      <div className="absolute inset-0 sand-texture pointer-events-none" />

      <motion.div
        initial={{ opacity: 0, y: 24, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="w-full max-w-md relative z-10"
      >
        {/* Logo & title */}
        <div className="mb-10 text-center">
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.1, type: "spring", stiffness: 150 }}
            className="mx-auto mb-5 flex h-28 w-28 items-center justify-center relative"
          >
            <div className="absolute inset-0 rounded-full bg-[radial-gradient(circle,hsl(var(--primary)/0.2),transparent_70%)] blur-xl" />
            <LogoImage className="h-28 w-28 relative z-10" />
          </motion.div>
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
            className="text-sm text-muted-foreground tracking-wide uppercase"
          >
            Painel de Gestão
          </motion.p>
        </div>

        {/* Login type toggle */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="mb-6"
        >
          <div className="flex rounded-xl p-1 bg-[hsl(var(--muted)/0.5)] border border-border/50 backdrop-blur-sm">
            <button
              type="button"
              onClick={() => setLoginType("admin")}
              className={`flex-1 flex items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-medium transition-all duration-300 ${
                loginType === "admin"
                  ? "bg-gradient-primary text-primary-foreground shadow-glow"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Shield className="h-4 w-4" />
              Admin
            </button>
            <button
              type="button"
              onClick={() => setLoginType("organizer")}
              className={`flex-1 flex items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-medium transition-all duration-300 ${
                loginType === "organizer"
                  ? "bg-gradient-primary text-primary-foreground shadow-glow"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Users className="h-4 w-4" />
              Organizador
            </button>
          </div>
        </motion.div>

        {/* Glass card */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
          className="rounded-2xl border border-[hsl(var(--border)/0.6)] bg-[hsl(var(--card)/0.6)] backdrop-blur-xl p-7 shadow-card relative overflow-hidden"
        >
          {/* Inner glow line at top */}
          <div className="absolute top-0 left-4 right-4 h-px bg-gradient-to-r from-transparent via-[hsl(var(--primary)/0.4)] to-transparent" />

          <form onSubmit={handleSubmit} className="space-y-5">
            {loginType === "admin" ? (
              <div className="space-y-2">
                <Label htmlFor="email" className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
                  Email
                </Label>
                <div className="relative group">
                  <Mail className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground group-focus-within:text-primary transition-colors" />
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="seu@email.com"
                    className="pl-11 h-12 rounded-xl bg-[hsl(var(--muted)/0.4)] border-[hsl(var(--border)/0.5)] focus:border-primary/50 focus:bg-[hsl(var(--muted)/0.6)] transition-all placeholder:text-muted-foreground/50"
                    required
                  />
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <Label htmlFor="username" className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
                  Usuário
                </Label>
                <div className="relative group">
                  <User className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground group-focus-within:text-primary transition-colors" />
                  <Input
                    id="username"
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="Seu usuário"
                    className="pl-11 h-12 rounded-xl bg-[hsl(var(--muted)/0.4)] border-[hsl(var(--border)/0.5)] focus:border-primary/50 focus:bg-[hsl(var(--muted)/0.6)] transition-all placeholder:text-muted-foreground/50"
                    required
                  />
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="password" className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
                Senha
              </Label>
              <div className="relative group">
                <Lock className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground group-focus-within:text-primary transition-colors" />
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="pl-11 h-12 rounded-xl bg-[hsl(var(--muted)/0.4)] border-[hsl(var(--border)/0.5)] focus:border-primary/50 focus:bg-[hsl(var(--muted)/0.6)] transition-all placeholder:text-muted-foreground/50"
                  required
                />
              </div>
            </div>

            <Button
              type="submit"
              disabled={loading}
              className="w-full h-12 rounded-xl bg-gradient-primary text-primary-foreground font-semibold text-base shadow-glow hover:opacity-90 transition-all active:scale-[0.98]"
            >
              {loading ? (
                <div className="flex items-center gap-2">
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />
                  Autenticando...
                </div>
              ) : (
                "Entrar"
              )}
            </Button>
          </form>

          <div className="mt-5 pt-4 border-t border-border/30 text-center">
            <p className="text-xs text-muted-foreground/70">
              Solicite ao Administrador para criar sua conta
            </p>
          </div>
        </motion.div>

        <FlowAppsBranding variant="login-cta" />

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="mt-5 text-center"
        >
          <button
            onClick={() => navigate("/")}
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-primary transition-all group"
          >
            <ArrowLeft className="h-4 w-4 group-hover:-translate-x-1 transition-transform" />
            Voltar para Seleção de Esporte
          </button>
        </motion.div>
      </motion.div>
    </div>
  );
};

export default Auth;
