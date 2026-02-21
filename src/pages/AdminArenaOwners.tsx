import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { bookingApi } from "@/lib/bookingApi";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/hooks/use-toast";
import { Shield, Plus, UserCog, Building2, LogOut } from "lucide-react";
import LogoImage from "@/components/LogoImage";
import { useNavigate, Link } from "react-router-dom";

interface ArenaOwner {
  id: string;
  user_id: string;
  arena_id: string;
  created_at: string;
  user_email?: string;
  arena_name?: string;
}

interface ArenaItem {
  id: string;
  name: string;
}

const AdminArenaOwners = () => {
  const navigate = useNavigate();
  const [owners, setOwners] = useState<ArenaOwner[]>([]);
  const [arenas, setArenas] = useState<ArenaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newArenaId, setNewArenaId] = useState("");

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) {
      navigate("/arena-login");
      return;
    }
    // Check if admin
    const { data: isAdmin } = await supabase.rpc("has_role", {
      _user_id: session.user.id,
      _role: "admin" as any,
    });
    if (!isAdmin) {
      toast({ title: "Acesso negado", description: "Apenas ADMIN_MASTER pode acessar.", variant: "destructive" });
      navigate("/arena-login");
      return;
    }
    loadData();
  };

  const loadData = async () => {
    setLoading(true);
    const [ownersRes, arenasRes] = await Promise.all([
      bookingApi<ArenaOwner[]>("list_arena_owners", {}, true),
      bookingApi<ArenaItem[]>("list_admin_arenas", {}, true),
    ]);
    if (ownersRes.data) setOwners(ownersRes.data);
    if (arenasRes.data) setArenas(arenasRes.data);
    setLoading(false);
  };

  const handleCreateOwner = async () => {
    if (!newEmail || !newPassword || !newArenaId) {
      toast({ title: "Preencha todos os campos", variant: "destructive" });
      return;
    }
    if (newPassword.length < 6) {
      toast({ title: "Senha deve ter no mínimo 6 caracteres", variant: "destructive" });
      return;
    }

    const { data, error } = await bookingApi("create_arena_owner", {
      email: newEmail,
      password: newPassword,
      arena_id: newArenaId,
    }, true);

    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
      return;
    }

    toast({ title: "Dono de arena criado com sucesso!" });
    setShowForm(false);
    setNewEmail("");
    setNewPassword("");
    setNewArenaId("");
    loadData();
  };

  const handleRemoveOwner = async (ownerId: string) => {
    const { error } = await bookingApi("remove_arena_owner", { owner_id: ownerId }, true);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Dono de arena removido." });
    loadData();
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate("/arena-login");
  };

  if (loading) return <div className="flex items-center justify-center min-h-screen"><p>Carregando...</p></div>;

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 border-b border-border bg-card/80 backdrop-blur-md">
        <div className="container flex h-14 items-center justify-between px-4">
          <div className="flex items-center gap-2">
            <LogoImage className="h-8 w-8" />
            <span className="font-bold">Painel ADMIN</span>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link to="/arena-dashboard">Painel Arena</Link>
            </Button>
            <Button variant="ghost" size="sm" onClick={handleSignOut}>
              <LogOut className="h-4 w-4 mr-1" /> Sair
            </Button>
          </div>
        </div>
      </header>

      <main className="container max-w-2xl mx-auto px-4 py-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold flex items-center gap-2">
            <Shield className="h-5 w-5" /> Gestão de Donos de Arena
          </h2>
          {!showForm && (
            <Button size="sm" onClick={() => setShowForm(true)}>
              <Plus className="h-4 w-4 mr-1" /> Novo Dono
            </Button>
          )}
        </div>

        {showForm && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Criar Dono de Arena</CardTitle>
              <CardDescription>Cadastre um novo usuário como dono de arena</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-2">
                <Label>Email</Label>
                <Input type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="dono@arena.com" />
              </div>
              <div className="space-y-2">
                <Label>Senha</Label>
                <Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="Mínimo 6 caracteres" />
              </div>
              <div className="space-y-2">
                <Label>Arena</Label>
                <Select value={newArenaId} onValueChange={setNewArenaId}>
                  <SelectTrigger><SelectValue placeholder="Selecione a arena" /></SelectTrigger>
                  <SelectContent>
                    {arenas.map((a) => (
                      <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex gap-2">
                <Button onClick={handleCreateOwner}>Criar</Button>
                <Button variant="ghost" onClick={() => setShowForm(false)}>Cancelar</Button>
              </div>
            </CardContent>
          </Card>
        )}

        {owners.length === 0 ? (
          <p className="text-center py-8 text-muted-foreground">Nenhum dono de arena cadastrado.</p>
        ) : (
          <div className="space-y-3">
            {owners.map((o) => (
              <Card key={o.id}>
                <CardContent className="p-4 flex items-center justify-between">
                  <div>
                    <p className="font-semibold flex items-center gap-2">
                      <UserCog className="h-4 w-4" /> {o.user_email || o.user_id}
                    </p>
                    <p className="text-sm text-muted-foreground flex items-center gap-1">
                      <Building2 className="h-3 w-3" /> {o.arena_name || o.arena_id}
                    </p>
                  </div>
                  <Button variant="outline" size="sm" className="text-red-500" onClick={() => handleRemoveOwner(o.id)}>
                    Remover
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  );
};

export default AdminArenaOwners;
