import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { KeyRound } from "lucide-react";
import LogoImage from "@/components/LogoImage";
import { Link } from "react-router-dom";

const AtletaRecuperarSenha = () => {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) {
      toast({ title: "Informe seu email", variant: "destructive" });
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });

    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    } else {
      setSent(true);
      toast({ title: "Email enviado!", description: "Verifique sua caixa de entrada." });
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-2">
            <LogoImage className="h-12 w-12" />
          </div>
          <CardTitle className="flex items-center justify-center gap-2">
            <KeyRound className="h-5 w-5" /> Recuperar Senha
          </CardTitle>
          <CardDescription>
            {sent
              ? "Enviamos um link de recuperação para seu email."
              : "Informe seu email para redefinir sua senha."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!sent ? (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label>Email</Label>
                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="joao@email.com" />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Enviando..." : "Enviar Link de Recuperação"}
              </Button>
            </form>
          ) : (
            <div className="text-center space-y-4">
              <p className="text-sm text-muted-foreground">
                O link expira em 15 minutos. Verifique também a pasta de spam.
              </p>
              <Button variant="outline" onClick={() => setSent(false)} className="w-full">
                Reenviar
              </Button>
            </div>
          )}
          <div className="mt-4 text-center">
            <Link to="/atleta/login" className="text-sm text-primary hover:underline">
              ← Voltar para login
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default AtletaRecuperarSenha;
