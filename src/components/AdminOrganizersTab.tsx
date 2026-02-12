import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { Plus, Trash2, Pencil, Check, X, Users, Eye, EyeOff, Lock } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { organizerQuery } from "@/lib/organizerApi";

interface Organizer {
  id: string;
  username: string;
  display_name: string | null;
  created_at: string;
}

const AdminOrganizersTab = () => {
  const { user, organizerId } = useAuth();
  const [organizers, setOrganizers] = useState<Organizer[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  // Form state
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");

  // Edit state
  const [editUsername, setEditUsername] = useState("");
  const [editDisplayName, setEditDisplayName] = useState("");
  const [editPassword, setEditPassword] = useState("");

  // Admin credential edit state
  const [adminCredOpen, setAdminCredOpen] = useState(false);
  const [adminNewUsername, setAdminNewUsername] = useState("");
  const [adminNewPassword, setAdminNewPassword] = useState("");
  const [adminShowPassword, setAdminShowPassword] = useState(false);

  const fetchOrganizers = async () => {
    const { data, error } = await organizerQuery({
      table: "organizers",
      operation: "select",
      select: "id, username, display_name, created_at",
      order: { column: "created_at", ascending: false },
    });
    if (!error && data) setOrganizers(data);
    setLoading(false);
  };

  useEffect(() => {
    fetchOrganizers();
  }, []);

  const saveAdminCredentials = async () => {
    const updates: any = {};
    if (adminNewUsername.trim()) updates.username = adminNewUsername.trim();
    if (adminNewPassword.trim()) {
      if (adminNewPassword.length < 6) {
        toast.error("Senha deve ter pelo menos 6 caracteres");
        return;
      }
      updates.password_hash = adminNewPassword;
    }
    if (Object.keys(updates).length === 0) {
      toast.error("Nenhuma alteração informada");
      return;
    }
    // Find admin organizer
    const { data: adminOrg } = await organizerQuery({
      table: "organizers",
      operation: "select",
      select: "id",
      filters: { id: organizerId || "" },
      maybeSingle: true,
    });
    if (!adminOrg) {
      toast.error("Admin não encontrado");
      return;
    }
    const { error } = await organizerQuery({
      table: "organizers",
      operation: "update",
      data: updates,
      filters: { id: adminOrg.id },
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Credenciais do Admin atualizadas!");
    setAdminNewUsername("");
    setAdminNewPassword("");
    setAdminCredOpen(false);
  };


  const createOrganizer = async () => {
    if (!username.trim() || !password.trim()) {
      toast.error("Usuário e senha são obrigatórios");
      return;
    }
    if (password.length < 6) {
      toast.error("Senha deve ter pelo menos 6 caracteres");
      return;
    }

    const { error } = await organizerQuery({
      table: "organizers",
      operation: "insert",
      data: {
        username: username.trim(),
        password_hash: password,
        display_name: displayName.trim() || null,
        created_by: organizerId || "",
      },
    });

    if (error) {
      if (error.message?.includes("23505") || error.message?.includes("duplicate")) {
        toast.error("Usuário já existe");
      } else {
        toast.error(error.message);
      }
      return;
    }

    toast.success("Organizador criado com sucesso!");
    setUsername("");
    setPassword("");
    setDisplayName("");
    setDialogOpen(false);
    fetchOrganizers();
  };

  const startEdit = (org: Organizer) => {
    setEditingId(org.id);
    setEditUsername(org.username);
    setEditDisplayName(org.display_name || "");
    setEditPassword("");
  };

  const saveEdit = async () => {
    if (!editingId || !editUsername.trim()) return;

    const updates: any = {
      username: editUsername.trim(),
      display_name: editDisplayName.trim() || null,
    };
    if (editPassword.trim()) {
      if (editPassword.length < 6) {
        toast.error("Senha deve ter pelo menos 6 caracteres");
        return;
      }
      updates.password_hash = editPassword;
    }

    const { error } = await organizerQuery({
      table: "organizers",
      operation: "update",
      data: updates,
      filters: { id: editingId },
    });

    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success("Organizador atualizado!");
    setEditingId(null);
    fetchOrganizers();
  };

  const deleteOrganizer = async (id: string) => {
    const { error } = await organizerQuery({
      table: "organizers",
      operation: "delete",
      filters: { id },
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Organizador removido!");
    fetchOrganizers();
  };

  return (
    <div className="space-y-6">
      {/* Admin Credentials Section */}
      <section className="rounded-xl border border-border bg-card p-6 shadow-card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <Lock className="h-5 w-5" /> Credenciais do Admin
          </h2>
          <Dialog open={adminCredOpen} onOpenChange={setAdminCredOpen}>
            <DialogTrigger asChild>
              <Button size="sm" variant="outline" className="gap-1">
                <Pencil className="h-4 w-4" /> Alterar
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Alterar Credenciais do Admin</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>Novo usuário (login)</Label>
                  <Input
                    value={adminNewUsername}
                    onChange={(e) => setAdminNewUsername(e.target.value)}
                    placeholder="Deixe vazio para manter"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Nova senha</Label>
                  <div className="relative">
                    <Input
                      type={adminShowPassword ? "text" : "password"}
                      value={adminNewPassword}
                      onChange={(e) => setAdminNewPassword(e.target.value)}
                      placeholder="Deixe vazio para manter"
                    />
                    <button
                      type="button"
                      onClick={() => setAdminShowPassword(!adminShowPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {adminShowPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                <Button onClick={saveAdminCredentials} className="w-full bg-gradient-primary text-primary-foreground hover:opacity-90">
                  Salvar Alterações
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
        <p className="text-sm text-muted-foreground">Apenas o Admin pode alterar suas próprias credenciais de acesso.</p>
      </section>

      {/* Organizers Management Section */}
      <section className="rounded-xl border border-border bg-card p-6 shadow-card">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-xl font-semibold flex items-center gap-2">
          <Users className="h-5 w-5" /> Gestão de Organizadores
        </h2>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-1 bg-gradient-primary text-primary-foreground hover:opacity-90">
              <Plus className="h-4 w-4" /> Novo Organizador
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Criar Organizador</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Nome de exibição</Label>
                <Input
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Nome do organizador"
                />
              </div>
              <div className="space-y-2">
                <Label>Usuário (login)</Label>
                <Input
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="usuario_login"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>Senha</Label>
                <div className="relative">
                  <Input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Mínimo 6 caracteres"
                    required
                    minLength={6}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <Button onClick={createOrganizer} className="w-full bg-gradient-primary text-primary-foreground hover:opacity-90">
                Criar Organizador
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {loading ? (
        <div className="flex justify-center py-8">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      ) : organizers.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-muted/50 p-8 text-center">
          <Users className="mx-auto mb-2 h-8 w-8 text-muted-foreground/40" />
          <p className="text-muted-foreground text-sm">Nenhum organizador cadastrado.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {organizers.map((org, i) => (
            <motion.div
              key={org.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04 }}
              className="flex items-center justify-between rounded-lg border border-border bg-secondary/50 px-4 py-3"
            >
              {editingId === org.id ? (
                <div className="flex items-center gap-2 flex-1 flex-wrap">
                  <Input
                    value={editDisplayName}
                    onChange={(e) => setEditDisplayName(e.target.value)}
                    className="h-8 text-sm w-36"
                    placeholder="Nome"
                  />
                  <Input
                    value={editUsername}
                    onChange={(e) => setEditUsername(e.target.value)}
                    className="h-8 text-sm w-36"
                    placeholder="Usuário"
                  />
                  <Input
                    type="password"
                    value={editPassword}
                    onChange={(e) => setEditPassword(e.target.value)}
                    className="h-8 text-sm w-36"
                    placeholder="Nova senha (opcional)"
                  />
                  <Button variant="ghost" size="sm" onClick={saveEdit} className="h-7 w-7 p-0">
                    <Check className="h-4 w-4 text-success" />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setEditingId(null)} className="h-7 w-7 p-0">
                    <X className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              ) : (
                <>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">
                      {org.display_name || org.username}
                    </p>
                    <p className="text-xs text-muted-foreground">@{org.username}</p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button variant="ghost" size="sm" onClick={() => startEdit(org)} className="h-7 w-7 p-0">
                      <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => deleteOrganizer(org.id)} className="h-7 w-7 p-0">
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  </div>
                </>
              )}
            </motion.div>
          ))}
        </div>
      )}
    </section>
    </div>
  );
};

export default AdminOrganizersTab;
