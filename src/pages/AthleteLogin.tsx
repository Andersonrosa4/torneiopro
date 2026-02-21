import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { publicQuery } from "@/lib/organizerApi";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { Hash, ArrowLeft, Trophy, LogIn, UserPlus, Lock } from "lucide-react";
import LogoImage from "@/components/LogoImage";
import FlowAppsBranding from "@/components/FlowAppsBranding";
import PromoPopup from "@/components/PromoPopup";
import { Link } from "react-router-dom";

const AthleteLogin = () => {
  const navigate = useNavigate();
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);

  // Login state
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [loginLoading, setLoginLoading] = useState(false);

  // Tournament code state
  const [code, setCode] = useState("");
  const [codeLoading, setCodeLoading] = useState(false);

  useEffect(() => {
    // Load saved email if "remember me" was used
    const savedEmail = localStorage.getItem("athlete_remembered_email");
    if (savedEmail) {
      setEmail(savedEmail);
      setRememberMe(true);
    }

    supabase.auth.getUser().then(async ({ data }) => {
      if (data.user) {
        // Check if user has athlete role
        const { data: roleData } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", data.user.id)
          .eq("role", "athlete")
          .maybeSingle();
        if (roleData) {
          setIsLoggedIn(true);
        }
      }
      setCheckingAuth(false);
    });
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      toast.error("Preencha todos os campos");
      return;
    }
    setLoginLoading(true);

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      toast.error(error.message.includes("Invalid") ? "Email ou senha incorretos" : error.message);
      setLoginLoading(false);
      return;
    }

    if (rememberMe) {
      localStorage.setItem("athlete_remembered_email", email);
    } else {
      localStorage.removeItem("athlete_remembered_email");
    }

    setIsLoggedIn(true);
    toast.success("Login realizado com sucesso!");
    setLoginLoading(false);
  };

  const handleTournamentCode = async (e: React.FormEvent) => {
    e.preventDefault();
    const normalizedCode = code.trim().toUpperCase();
    if (!normalizedCode) {
      toast.error("Digite o código do torneio");
      return;
    }
    setCodeLoading(true);

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
    setCodeLoading(false);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setIsLoggedIn(false);
  };

  if (checkingAuth) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-[hsl(220_15%_10%)] via-[hsl(220_12%_14%)] to-[hsl(25_15%_12%)]">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-[hsl(220_15%_10%)] via-[hsl(220_12%_14%)] to-[hsl(25_15%_12%)] px-4 relative overflow-hidden">
      <PromoPopup />
      {/* Ambient glow orbs */}
      <div className="absolute top-[-20%] left-[-10%] w-[500px] h-[500px] rounded-full bg-[radial-gradient(circle,hsl(var(--primary)/0.12),transparent_70%)] blur-3xl pointer-events-none" />
      <div className="absolute bottom-[-15%] right-[-10%] w-[400px] h-[400px] rounded-full bg-[radial-gradient(circle,hsl(var(--accent)/0.1),transparent_70%)] blur-3xl pointer-events-none" />

      {/* Subtle grid */}
      <div
        className="absolute inset-0 pointer-events-none opacity-[0.03]"
        style={{
          backgroundImage: `linear-gradient(hsl(var(--foreground)) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--foreground)) 1px, transparent 1px)`,
          backgroundSize: "60px 60px",
        }}
      />

      {/* Sand texture */}
      <div className="absolute inset-0 sand-texture pointer-events-none" />

      {/* Light beams */}
      <div className="absolute top-0 left-1/4 w-32 h-full bg-gradient-to-b from-[hsl(195_80%_60%/0.06)] to-transparent rotate-12 animate-light-beam pointer-events-none" />
      <div className="absolute top-0 right-1/3 w-24 h-full bg-gradient-to-b from-[hsl(35_80%_60%/0.04)] to-transparent -rotate-6 animate-light-beam pointer-events-none" style={{ animationDelay: "2s" }} />

      <motion.div
        initial={{ opacity: 0, y: 24, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="w-full max-w-sm relative z-10"
      >
        {/* Logo & title */}
        <div className="mb-8 text-center">
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.1, type: "spring", stiffness: 150 }}
            className="mx-auto mb-5 flex h-28 w-28 items-center justify-center relative"
          >
            <div className="absolute inset-0 rounded-full bg-[radial-gradient(circle,hsl(var(--primary)/0.2),transparent_70%)] blur-xl" />
            <LogoImage className="h-28 w-28 relative z-10" />
          </motion.div>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }}>
            <div className="inline-flex items-center gap-2 mb-2 px-3 py-1 rounded-full bg-[hsl(var(--primary)/0.1)] border border-[hsl(var(--primary)/0.2)]">
              <Trophy className="h-3.5 w-3.5 text-primary" />
              <span className="text-xs font-medium text-primary uppercase tracking-wider">Área do Atleta</span>
            </div>
          </motion.div>
        </div>

        {/* Glass card */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
          className="rounded-2xl border border-[hsl(var(--border)/0.6)] bg-[hsl(var(--card)/0.6)] backdrop-blur-xl p-7 shadow-card relative overflow-hidden"
        >
          {/* Inner glow line at top */}
          <div className="absolute top-0 left-4 right-4 h-px bg-gradient-to-r from-transparent via-[hsl(var(--primary)/0.4)] to-transparent" />

          {!isLoggedIn ? (
            /* ===== LOGIN FORM ===== */
            <>
              <p className="text-center text-sm text-muted-foreground mb-5">
                <Lock className="inline h-3.5 w-3.5 mr-1" />
                Faça login para acessar seus torneios
              </p>
              <form onSubmit={handleLogin} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email" className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
                    Email
                  </Label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="seu@email.com"
                    className="h-12 rounded-xl bg-[hsl(var(--muted)/0.4)] border-[hsl(var(--border)/0.5)] focus:border-primary/50"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password" className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
                    Senha
                  </Label>
                  <Input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="h-12 rounded-xl bg-[hsl(var(--muted)/0.4)] border-[hsl(var(--border)/0.5)] focus:border-primary/50"
                    required
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="remember"
                      checked={rememberMe}
                      onCheckedChange={(checked) => setRememberMe(checked === true)}
                    />
                    <label htmlFor="remember" className="text-xs text-muted-foreground cursor-pointer">
                      Lembrar meu email
                    </label>
                  </div>
                  <Link to="/atleta/recuperar-senha" className="text-xs text-primary hover:underline">
                    Esqueci a senha
                  </Link>
                </div>

                <Button
                  type="submit"
                  className="w-full h-12 rounded-xl bg-gradient-primary text-primary-foreground font-semibold text-base shadow-glow hover:opacity-90 transition-all active:scale-[0.98]"
                  disabled={loginLoading}
                >
                  {loginLoading ? (
                    <div className="flex items-center gap-2">
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />
                      Entrando...
                    </div>
                  ) : (
                    <span className="flex items-center gap-2"><LogIn className="h-4 w-4" /> Entrar</span>
                  )}
                </Button>
              </form>

              <div className="mt-4 text-center">
                <Link to="/atleta/cadastro" className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline">
                  <UserPlus className="h-3.5 w-3.5" /> Não tem conta? Cadastre-se
                </Link>
              </div>
            </>
          ) : (
            /* ===== TOURNAMENT CODE (after login) ===== */
            <>
              <p className="text-center text-sm text-muted-foreground mb-5">
                Digite o código do seu torneio para acessar
              </p>
              <form onSubmit={handleTournamentCode} className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="code" className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
                    Código do Torneio
                  </Label>
                  <div className="relative group">
                    <Hash className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground group-focus-within:text-primary transition-colors" />
                    <Input
                      id="code"
                      value={code}
                      onChange={(e) => setCode(e.target.value)}
                      placeholder="EX: VERAO2026"
                      className="pl-11 h-14 rounded-xl bg-[hsl(var(--muted)/0.4)] border-[hsl(var(--border)/0.5)] focus:border-primary/50 focus:bg-[hsl(var(--muted)/0.6)] transition-all text-center text-xl tracking-[0.3em] font-mono uppercase placeholder:text-muted-foreground/40 placeholder:text-sm placeholder:tracking-normal placeholder:font-sans placeholder:normal-case"
                      required
                    />
                  </div>
                </div>
                <Button
                  type="submit"
                  className="w-full h-12 rounded-xl bg-gradient-primary text-primary-foreground font-semibold text-base shadow-glow hover:opacity-90 transition-all active:scale-[0.98]"
                  disabled={codeLoading || code.trim().length === 0}
                >
                  {codeLoading ? (
                    <div className="flex items-center gap-2">
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />
                      Buscando...
                    </div>
                  ) : (
                    "Entrar no Torneio"
                  )}
                </Button>
              </form>

              <div className="mt-4 flex items-center justify-between">
                <Button variant="ghost" size="sm" className="text-xs text-primary" onClick={() => navigate("/atleta/home")}>
                  Meu Painel
                </Button>
                <Button variant="ghost" size="sm" className="text-xs text-muted-foreground" onClick={handleLogout}>
                  Sair
                </Button>
              </div>
            </>
          )}
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
            Voltar ao início
          </button>
        </motion.div>
      </motion.div>
    </div>
  );
};

export default AthleteLogin;
