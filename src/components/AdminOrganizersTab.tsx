import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { Plus, Trash2, Pencil, Check, X, Users, Eye, EyeOff } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

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

  const fetchOrganizers = async () => {
    const { data, error } = await supabase
      .from("organizers")
      .select("id, username, display_name, created_at")
      .order("created_at", { ascending: false });
    if (!error && data) setOrganizers(data);
    setLoading(false);
  };

  useEffect(() => {
    fetchOrganizers();
  }, []);

  const createOrganizer = async () => {
    if (!username.trim() || !password.trim()) {
      toast.error("Usuário e senha são obrigatórios");
      return;
    }
    if (password.length < 6) {
      toast.error("Senha deve ter pelo menos 6 caracteres");
      return;
    }

    const { error } = await supabase.from("organizers").insert({
      username: username.trim(),
      password_hash: password, // In production, hash on server side
      display_name: displayName.trim() || null,
      created_by: organizerId || "",
    });

    if (error) {
      if (error.code === "23505") {
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

    const { error } = await supabase
      .from("organizers")
      .update(updates)
      .eq("id", editingId);

    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success("Organizador atualizado!");
    setEditingId(null);
    fetchOrganizers();
  };

  const deleteOrganizer = async (id: string) => {
    const { error } = await supabase.from("organizers").delete().eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Organizador removido!");
    fetchOrganizers();
  };

  return (
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
  );
};

export default AdminOrganizersTab;
