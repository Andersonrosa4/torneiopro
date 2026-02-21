import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { Lock, Building2, ArrowLeft } from "lucide-react";
import LogoImage from "@/components/LogoImage";
import { useNavigate, Link } from "react-router-dom";
import { motion } from "framer-motion";

const ArenaLogin = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      toast({ title: "Preencha todos os campos", variant: "destructive" });
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      toast({ title: "Erro ao entrar", description: error.message, variant: "destructive" });
      setLoading(false);
      return;
    }
    navigate("/arena-dashboard");
  };

  return (
    <div className="min-h-screen relative overflow-hidden flex items-center justify-center p-4">
      {/* Background */}
      <div className="fixed inset-0 bg-gradient-to-b from-[hsl(220_25%_4%)] via-[hsl(15_15%_7%)] to-[hsl(20_20%_6%)]" />
      <div className="fixed top-[-15%] left-[-15%] w-[500px] h-[500px] rounded-full bg-[radial-gradient(circle,hsl(35_80%_45%/0.12),transparent_65%)] blur-3xl" />
      <div className="fixed bottom-[-10%] right-[-10%] w-[400px] h-[400px] rounded-full bg-[radial-gradient(circle,hsl(195_70%_40%/0.08),transparent_60%)] blur-3xl" />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative z-10 w-full max-w-sm"
      >
        <Card className="border-[hsl(0_0%_100%/0.1)] bg-[hsl(220_15%_10%/0.9)] backdrop-blur-md">
          <CardHeader className="text-center">
            <div className="flex justify-center mb-3">
              <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-amber-500/20 to-orange-600/20 flex items-center justify-center border border-amber-500/30">
                <Building2 className="h-8 w-8 text-amber-400" />
              </div>
            </div>
            <CardTitle className="text-foreground text-xl">Login da Arena</CardTitle>
            <CardDescription>Acesso exclusivo para administradores de arena</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-2">
                <Label className="text-foreground">Email</Label>
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@arena.com"
                  className="bg-[hsl(220_15%_12%)] border-[hsl(0_0%_100%/0.1)]"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-foreground">Senha</Label>
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="bg-[hsl(220_15%_12%)] border-[hsl(0_0%_100%/0.1)]"
                />
              </div>
              <Button
                type="submit"
                className="w-full bg-gradient-to-r from-amber-500 to-orange-600 text-white hover:opacity-90"
                disabled={loading}
              >
                <Lock className="h-4 w-4 mr-2" />
                {loading ? "Entrando..." : "Entrar"}
              </Button>
            </form>
            <div className="mt-4 text-center">
              <Link to="/" className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
                <ArrowLeft className="h-3 w-3" /> Voltar ao início
              </Link>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
};

export default ArenaLogin;
