import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Users, Search, Pencil, Trash2, X, Check, RefreshCw } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface Athlete {
  id: string;
  email: string;
  display_name: string;
  nickname: string;
  phone: string;
  created_at: string;
}

const AthleteManagementTab = () => {
  const [athletes, setAthletes] = useState<Athlete[]>([]);
  const [filtered, setFiltered] = useState<Athlete[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  // Edit state
  const [editAthlete, setEditAthlete] = useState<Athlete | null>(null);
  const [editForm, setEditForm] = useState({ display_name: "", nickname: "", phone: "", email: "" });
  const [saving, setSaving] = useState(false);

  // Delete state
  const [deleteAthlete, setDeleteAthlete] = useState<Athlete | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchAthletes = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.functions.invoke("athlete-admin", {
      body: { operation: "list" },
    });
    if (error) {
      toast.error("Erro ao carregar atletas");
    } else {
      setAthletes(data.athletes || []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchAthletes();
  }, [fetchAthletes]);

  useEffect(() => {
    if (!search.trim()) {
      setFiltered(athletes);
      return;
    }
    const q = search.toLowerCase();
    setFiltered(
      athletes.filter(
        (a) =>
          a.display_name?.toLowerCase().includes(q) ||
          a.nickname?.toLowerCase().includes(q) ||
          a.email?.toLowerCase().includes(q) ||
          a.phone?.includes(q)
      )
    );
  }, [search, athletes]);

  const openEdit = (a: Athlete) => {
    setEditAthlete(a);
    setEditForm({
      display_name: a.display_name || "",
      nickname: a.nickname || "",
      phone: a.phone || "",
      email: a.email || "",
    });
  };

  const handleSave = async () => {
    if (!editAthlete) return;
    setSaving(true);
    const { data, error } = await supabase.functions.invoke("athlete-admin", {
      body: {
        operation: "update",
        athlete_id: editAthlete.id,
        ...editForm,
      },
    });
    if (error || data?.error) {
      toast.error(data?.error || "Erro ao salvar");
    } else {
      toast.success("Atleta atualizado!");
      setEditAthlete(null);
      fetchAthletes();
    }
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!deleteAthlete) return;
    setDeleting(true);
    const { data, error } = await supabase.functions.invoke("athlete-admin", {
      body: { operation: "delete", athlete_id: deleteAthlete.id },
    });
    if (error || data?.error) {
      toast.error(data?.error || "Erro ao excluir");
    } else {
      toast.success("Atleta excluído!");
      setDeleteAthlete(null);
      fetchAthletes();
    }
    setDeleting(false);
  };

  const formatDate = (d: string) => {
    try {
      return new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
    } catch {
      return d;
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <Users className="h-5 w-5 text-primary" /> Atletas Cadastrados
          <span className="text-sm font-normal text-muted-foreground">({athletes.length})</span>
        </h3>
        <div className="flex gap-2 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nome, email, telefone..."
              className="pl-9"
            />
          </div>
          <Button variant="outline" size="icon" onClick={fetchAthletes} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card/50 p-8 text-center">
          <Users className="mx-auto mb-2 h-8 w-8 text-muted-foreground/40" />
          <p className="text-muted-foreground text-sm">
            {search ? "Nenhum atleta encontrado para esta busca." : "Nenhum atleta cadastrado ainda."}
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-border overflow-hidden">
          {/* Desktop table */}
          <div className="hidden sm:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/50 border-b border-border">
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Nome</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Nickname</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Email</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Telefone</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Cadastro</th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground">Ações</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((a) => (
                  <tr key={a.id} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3 font-medium">{a.display_name || "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground">{a.nickname || "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground">{a.email}</td>
                    <td className="px-4 py-3 text-muted-foreground">{a.phone || "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground">{formatDate(a.created_at)}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="sm" onClick={() => openEdit(a)} className="h-8 w-8 p-0">
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => setDeleteAthlete(a)} className="h-8 w-8 p-0 text-destructive hover:text-destructive">
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="sm:hidden divide-y divide-border">
            {filtered.map((a) => (
              <div key={a.id} className="p-4 space-y-2">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-medium">{a.display_name || "—"}</p>
                    {a.nickname && <p className="text-xs text-muted-foreground">@{a.nickname}</p>}
                  </div>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="sm" onClick={() => openEdit(a)} className="h-7 w-7 p-0">
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setDeleteAthlete(a)} className="h-7 w-7 p-0 text-destructive">
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
                <div className="text-xs text-muted-foreground space-y-0.5">
                  <p>📧 {a.email}</p>
                  {a.phone && <p>📱 {a.phone}</p>}
                  <p>📅 {formatDate(a.created_at)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Edit Dialog */}
      <Dialog open={!!editAthlete} onOpenChange={(open) => !open && setEditAthlete(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Editar Atleta</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Nome Completo</Label>
              <Input value={editForm.display_name} onChange={(e) => setEditForm((f) => ({ ...f, display_name: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Nickname</Label>
              <Input value={editForm.nickname} onChange={(e) => setEditForm((f) => ({ ...f, nickname: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input type="email" value={editForm.email} onChange={(e) => setEditForm((f) => ({ ...f, email: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Telefone</Label>
              <Input value={editForm.phone} onChange={(e) => setEditForm((f) => ({ ...f, phone: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditAthlete(null)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteAthlete} onOpenChange={(open) => !open && setDeleteAthlete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir atleta "{deleteAthlete?.display_name || deleteAthlete?.email}"?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação é irreversível. A conta do atleta será removida permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={deleting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {deleting ? "Excluindo..." : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default AthleteManagementTab;
