import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { UserPlus } from "lucide-react";
import LogoImage from "@/components/LogoImage";
import { Link, useNavigate } from "react-router-dom";

const AtletaCadastro = () => {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [nickname, setNickname] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const formatPhone = (value: string) => {
    const digits = value.replace(/\D/g, "").slice(0, 11);
    if (digits.length <= 2) return digits;
    if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim() || !nickname.trim() || !email.trim() || !phone.trim()) {
      toast({ title: "Preencha todos os campos", variant: "destructive" });
      return;
    }
    const cleanPhone = phone.replace(/\D/g, "");
    if (cleanPhone.length < 10) {
      toast({ title: "WhatsApp inválido", description: "Informe DDD + número", variant: "destructive" });
      return;
    }
    if (password.length < 6) {
      toast({ title: "Senha deve ter no mínimo 6 caracteres", variant: "destructive" });
      return;
    }
    if (password !== confirmPassword) {
      toast({ title: "Senhas não conferem", variant: "destructive" });
      return;
    }

    setLoading(true);

    // Create auth user
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        emailRedirectTo: window.location.origin,
        data: {
          display_name: name.trim(),
          nickname: nickname.trim(),
          phone: cleanPhone,
        },
      },
    });

    if (authError) {
      const msg = authError.message.includes("already registered")
        ? "Este email já está cadastrado."
        : authError.message;
      toast({ title: "Erro no cadastro", description: msg, variant: "destructive" });
      setLoading(false);
      return;
    }

    // Create customer record
    if (authData.user) {
      await supabase.from("customers").insert({
        name: name.trim(),
        nickname: nickname.trim(),
        cpf: "",
        phone: cleanPhone,
      });

      // Assign athlete role
      await supabase.from("user_roles").insert({
        user_id: authData.user.id,
        role: "athlete" as any,
      });
    }

    toast({
      title: "Cadastro realizado!",
      description: "Verifique seu email para confirmar a conta. Você também receberá uma mensagem no WhatsApp.",
    });
    navigate("/atleta/login");
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-2">
            <LogoImage className="h-12 w-12" />
          </div>
          <CardTitle className="flex items-center justify-center gap-2">
            <UserPlus className="h-5 w-5" /> Cadastro de Atleta
          </CardTitle>
          <CardDescription>Crie sua conta para acessar torneios e agendamentos</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>Nome Completo *</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="João da Silva" required />
            </div>
            <div className="space-y-2">
              <Label>Nome de Jogador (Nickname) *</Label>
              <Input value={nickname} onChange={(e) => setNickname(e.target.value)} placeholder="JoãoBT" required />
              <p className="text-xs text-muted-foreground">Este nome será exibido nas tabelas dos torneios</p>
            </div>
            <div className="space-y-2">
              <Label>WhatsApp (com DDD) *</Label>
              <Input value={phone} onChange={(e) => setPhone(formatPhone(e.target.value))} placeholder="(00) 00000-0000" maxLength={15} required />
            </div>
            <div className="space-y-2">
              <Label>Email *</Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="joao@email.com" required />
            </div>
            <div className="space-y-2">
              <Label>Senha *</Label>
              <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Mínimo 6 caracteres" required />
            </div>
            <div className="space-y-2">
              <Label>Confirmar Senha *</Label>
              <Input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Repita a senha" required />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Cadastrando..." : "Criar Conta"}
            </Button>
          </form>
          <div className="mt-4 text-center space-y-2">
            <Link to="/atleta/login" className="text-sm text-primary hover:underline block">
              Já tem uma conta? Entrar
            </Link>
            <Link to="/" className="text-sm text-muted-foreground hover:underline block">
              ← Voltar ao início
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default AtletaCadastro;
