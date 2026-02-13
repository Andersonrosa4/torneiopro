import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { motion } from "framer-motion";
import {
  Plus, Trash2, Pencil, Check, X, Users, Eye, EyeOff,
  ShieldCheck, UserCog, Mail, User, Clock,
} from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { organizerQuery } from "@/lib/organizerApi";

interface OrganizerUser {
  id: string;
  username: string;
  email: string | null;
  display_name: string | null;
  role: string;
  created_at: string;
  last_online_at: string | null;
}

function formatLastOnline(lastOnline: string | null): string {
  if (!lastOnline) return "Nunca acessou";

  const date = new Date(lastOnline);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);

  if (diffMin < 5) return "Online agora";

  const isToday =
    date.getDate() === now.getDate() &&
    date.getMonth() === now.getMonth() &&
    date.getFullYear() === now.getFullYear();

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday =
    date.getDate() === yesterday.getDate() &&
    date.getMonth() === yesterday.getMonth() &&
    date.getFullYear() === yesterday.getFullYear();

  const time = date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

  if (isToday) return `Hoje às ${time}`;
  if (isYesterday) return `Ontem às ${time}`;

  return date.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }) + ` ${time}`;
}

const UserManagementTab = () => {
  const { organizerId } = useAuth();
  const [users, setUsers] = useState<OrganizerUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [createType, setCreateType] = useState<"admin" | "organizer">("organizer");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  // Create form
  const [formEmail, setFormEmail] = useState("");
  const [formUsername, setFormUsername] = useState("");
  const [formPassword, setFormPassword] = useState("");
  const [formDisplayName, setFormDisplayName] = useState("");

  // Edit form
  const [editEmail, setEditEmail] = useState("");
  const [editUsername, setEditUsername] = useState("");
  const [editDisplayName, setEditDisplayName] = useState("");
  const [editPassword, setEditPassword] = useState("");
  const [editRole, setEditRole] = useState("");

  const fetchUsers = async () => {
    const { data, error } = await organizerQuery({
      table: "organizers",
      operation: "select",
      select: "id, username, email, display_name, role, created_at, last_online_at",
      order: [
        { column: "role", ascending: true },
        { column: "created_at", ascending: false },
      ],
    });
    if (!error && data) setUsers(data);
    setLoading(false);
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const createUser = async () => {
    if (createType === "admin") {
      if (!formEmail.trim() || !formPassword.trim()) {
        toast.error("Email e senha são obrigatórios para Admin");
        return;
      }
    } else {
      if (!formUsername.trim() || !formPassword.trim()) {
        toast.error("Usuário e senha são obrigatórios para Organizador");
        return;
      }
    }
    if (formPassword.length < 6) {
      toast.error("Senha deve ter pelo menos 6 caracteres");
      return;
    }

    const insertData: any = {
      password_hash: formPassword,
      display_name: formDisplayName.trim() || null,
      created_by: organizerId || "",
      role: createType,
    };

    if (createType === "admin") {
      insertData.email = formEmail.trim().toLowerCase();
      insertData.username = formEmail.trim().toLowerCase(); // use email as username too
    } else {
      insertData.username = formUsername.trim();
    }

    const { error } = await organizerQuery({
      table: "organizers",
      operation: "insert",
      data: insertData,
    });

    if (error) {
      if (error.message?.includes("23505") || error.message?.includes("duplicate")) {
        toast.error("Usuário ou email já existe");
      } else {
        toast.error(error.message);
      }
      return;
    }

    toast.success(`${createType === "admin" ? "Admin" : "Organizador"} criado com sucesso!`);
    setFormEmail("");
    setFormUsername("");
    setFormPassword("");
    setFormDisplayName("");
    setDialogOpen(false);
    fetchUsers();
  };

  const startEdit = (u: OrganizerUser) => {
    setEditingId(u.id);
    setEditEmail(u.email || "");
    setEditUsername(u.username);
    setEditDisplayName(u.display_name || "");
    setEditPassword("");
    setEditRole(u.role);
  };

  const saveEdit = async () => {
    if (!editingId) return;

    const updates: any = {
      display_name: editDisplayName.trim() || null,
      role: editRole,
    };

    if (editRole === "admin") {
      if (!editEmail.trim()) {
        toast.error("Email é obrigatório para Admin");
        return;
      }
      updates.email = editEmail.trim().toLowerCase();
      updates.username = editEmail.trim().toLowerCase();
    } else {
      if (!editUsername.trim()) {
        toast.error("Usuário é obrigatório para Organizador");
        return;
      }
      updates.username = editUsername.trim();
      updates.email = null;
    }

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

    toast.success("Usuário atualizado!");
    setEditingId(null);
    fetchUsers();
  };

  const deleteUser = async (id: string) => {
    if (id === organizerId) {
      toast.error("Você não pode excluir a si mesmo");
      return;
    }

    // Also remove from user_roles
    await organizerQuery({
      table: "user_roles",
      operation: "delete",
      filters: { user_id: id },
    });

    const { error } = await organizerQuery({
      table: "organizers",
      operation: "delete",
      filters: { id },
    });

    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success("Usuário removido!");
    fetchUsers();
  };

  const admins = users.filter((u) => u.role === "admin");
  const organizers = users.filter((u) => u.role === "organizer");

  const renderUserRow = (u: OrganizerUser, index: number) => {
    const isEditing = editingId === u.id;
    const isSelf = u.id === organizerId;

    return (
      <motion.div
        key={u.id}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: index * 0.04 }}
        className="flex items-center justify-between rounded-lg border border-border bg-secondary/50 px-4 py-3"
      >
        {isEditing ? (
          <div className="flex items-center gap-2 flex-1 flex-wrap">
            <Input
              value={editDisplayName}
              onChange={(e) => setEditDisplayName(e.target.value)}
              className="h-8 text-sm w-32"
              placeholder="Nome"
            />
            {editRole === "admin" ? (
              <Input
                type="email"
                value={editEmail}
                onChange={(e) => setEditEmail(e.target.value)}
                className="h-8 text-sm w-44"
                placeholder="Email"
              />
            ) : (
              <Input
                value={editUsername}
                onChange={(e) => setEditUsername(e.target.value)}
                className="h-8 text-sm w-36"
                placeholder="Usuário"
              />
            )}
            <Input
              type="password"
              value={editPassword}
              onChange={(e) => setEditPassword(e.target.value)}
              className="h-8 text-sm w-36"
              placeholder="Nova senha (opcional)"
            />
            <select
              value={editRole}
              onChange={(e) => setEditRole(e.target.value)}
              className="h-8 rounded-md border border-border bg-background px-2 text-sm"
            >
              <option value="admin">Admin</option>
              <option value="organizer">Organizador</option>
            </select>
            <Button variant="ghost" size="sm" onClick={saveEdit} className="h-7 w-7 p-0">
              <Check className="h-4 w-4 text-primary" />
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setEditingId(null)} className="h-7 w-7 p-0">
              <X className="h-4 w-4 text-destructive" />
            </Button>
          </div>
        ) : (
          <>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="font-medium truncate">
                  {u.display_name || u.username}
                </p>
                {isSelf && (
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                    Você
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                {u.role === "admin" ? (
                  <span className="flex items-center gap-1">
                    <Mail className="h-3 w-3" /> {u.email || u.username}
                  </span>
                ) : (
                  <span className="flex items-center gap-1">
                    <User className="h-3 w-3" /> @{u.username}
                  </span>
                )}
              </p>
              <p className="text-[11px] text-muted-foreground/70 flex items-center gap-1 mt-0.5">
                <Clock className="h-3 w-3" />
                <span className={formatLastOnline(u.last_online_at) === "Online agora" ? "text-green-500 font-medium" : ""}>
                  {formatLastOnline(u.last_online_at)}
                </span>
              </p>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <Button variant="ghost" size="sm" onClick={() => startEdit(u)} className="h-7 w-7 p-0">
                <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
              </Button>
              {!isSelf && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
                      <AlertDialogDescription>
                        Tem certeza que deseja remover "{u.display_name || u.username}"? O acesso será removido imediatamente.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancelar</AlertDialogCancel>
                      <AlertDialogAction onClick={() => deleteUser(u.id)} className="bg-destructive text-destructive-foreground">
                        Excluir
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
            </div>
          </>
        )}
      </motion.div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header with create button */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold flex items-center gap-2">
          <UserCog className="h-5 w-5" /> Gestão de Usuários
        </h2>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-1 bg-gradient-primary text-primary-foreground hover:opacity-90">
              <Plus className="h-4 w-4" /> Novo Usuário
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Criar Usuário</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              {/* Type selector */}
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant={createType === "admin" ? "default" : "outline"}
                  onClick={() => setCreateType("admin")}
                  className="flex-1 gap-1"
                  size="sm"
                >
                  <ShieldCheck className="h-4 w-4" /> Admin
                </Button>
                <Button
                  type="button"
                  variant={createType === "organizer" ? "default" : "outline"}
                  onClick={() => setCreateType("organizer")}
                  className="flex-1 gap-1"
                  size="sm"
                >
                  <Users className="h-4 w-4" /> Organizador
                </Button>
              </div>

              <div className="space-y-2">
                <Label>Nome de exibição</Label>
                <Input
                  value={formDisplayName}
                  onChange={(e) => setFormDisplayName(e.target.value)}
                  placeholder="Nome do usuário"
                />
              </div>

              {createType === "admin" ? (
                <div className="space-y-2">
                  <Label>Email</Label>
                  <Input
                    type="email"
                    value={formEmail}
                    onChange={(e) => setFormEmail(e.target.value)}
                    placeholder="admin@email.com"
                    required
                  />
                </div>
              ) : (
                <div className="space-y-2">
                  <Label>Usuário (login)</Label>
                  <Input
                    value={formUsername}
                    onChange={(e) => setFormUsername(e.target.value)}
                    placeholder="usuario_login"
                    required
                  />
                </div>
              )}

              <div className="space-y-2">
                <Label>Senha</Label>
                <div className="relative">
                  <Input
                    type={showPassword ? "text" : "password"}
                    value={formPassword}
                    onChange={(e) => setFormPassword(e.target.value)}
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

              <Button onClick={createUser} className="w-full bg-gradient-primary text-primary-foreground hover:opacity-90">
                Criar {createType === "admin" ? "Admin" : "Organizador"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {loading ? (
        <div className="flex justify-center py-8">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      ) : (
        <>
          {/* Admins Section */}
          <section className="rounded-xl border border-border bg-card p-5 shadow-card">
            <h3 className="text-base font-semibold flex items-center gap-2 mb-3">
              <ShieldCheck className="h-4 w-4 text-primary" /> Administradores
              <Badge variant="secondary" className="ml-auto">{admins.length}</Badge>
            </h3>
            {admins.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">Nenhum admin cadastrado.</p>
            ) : (
              <div className="space-y-2">
                {admins.map((u, i) => renderUserRow(u, i))}
              </div>
            )}
          </section>

          {/* Organizers Section */}
          <section className="rounded-xl border border-border bg-card p-5 shadow-card">
            <h3 className="text-base font-semibold flex items-center gap-2 mb-3">
              <Users className="h-4 w-4 text-primary" /> Organizadores
              <Badge variant="secondary" className="ml-auto">{organizers.length}</Badge>
            </h3>
            {organizers.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">Nenhum organizador cadastrado.</p>
            ) : (
              <div className="space-y-2">
                {organizers.map((u, i) => renderUserRow(u, i))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
};

export default UserManagementTab;
