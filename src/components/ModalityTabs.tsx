import { useState } from "react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Plus, Pencil, Trash2, Check, X } from "lucide-react";
import { toast } from "sonner";
import type { Modality } from "@/hooks/useModalities";

interface ModalityTabsProps {
  modalities: Modality[];
  selectedModality: Modality | null;
  onSelect: (modality: Modality) => void;
  isOwner?: boolean;
  onAddModality?: (name: string) => Promise<{ error: any }>;
  onRenameModality?: (id: string, name: string) => Promise<{ error: any }>;
  onDeleteModality?: (id: string) => Promise<{ error: any }>;
}

const ICONS: Record<string, string> = {
  Masculino: "♂",
  Feminino: "♀",
  Misto: "⚥",
};

const ModalityTabs = ({
  modalities,
  selectedModality,
  onSelect,
  isOwner,
  onAddModality,
  onRenameModality,
  onDeleteModality,
}: ModalityTabsProps) => {
  const [addOpen, setAddOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [adding, setAdding] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  const [deleteTarget, setDeleteTarget] = useState<Modality | null>(null);
  const [confirmStep, setConfirmStep] = useState<1 | 2>(1);
  const handleAdd = async () => {
    const trimmed = newName.trim();
    if (!trimmed) return;
    if (modalities.some(m => m.name.toLowerCase() === trimmed.toLowerCase())) {
      toast.error("Já existe uma categoria com este nome.");
      return;
    }
    setAdding(true);
    const { error } = await onAddModality!(trimmed);
    setAdding(false);
    if (error) {
      toast.error("Erro ao criar categoria.");
    } else {
      toast.success(`Categoria "${trimmed}" criada!`);
      setNewName("");
      setAddOpen(false);
    }
  };

  const handleRename = async (id: string) => {
    const trimmed = editName.trim();
    if (!trimmed) return;
    if (modalities.some(m => m.id !== id && m.name.toLowerCase() === trimmed.toLowerCase())) {
      toast.error("Já existe uma categoria com este nome.");
      return;
    }
    const { error } = await onRenameModality!(id, trimmed);
    if (error) {
      toast.error("Erro ao renomear categoria.");
    } else {
      toast.success("Categoria renomeada!");
    }
    setEditingId(null);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const { error } = await onDeleteModality!(deleteTarget.id);
    if (error) {
      toast.error("Erro ao excluir. Remova as duplas e jogos primeiro.");
    } else {
      toast.success(`Categoria "${deleteTarget.name}" excluída.`);
    }
    setDeleteTarget(null);
  };

  if (modalities.length === 0 && !isOwner) return null;

  return (
    <div className="mb-4 flex items-center gap-2">
      {modalities.length > 0 && (
        <Tabs
          value={selectedModality?.id || ""}
          onValueChange={(val) => {
            const mod = modalities.find(m => m.id === val);
            if (mod) onSelect(mod);
          }}
        >
          <TabsList className="overflow-x-auto max-w-[calc(100vw-6rem)] flex-nowrap justify-start scrollbar-thin">
            {modalities.map(mod => (
              <TabsTrigger key={mod.id} value={mod.id} className="gap-1 group relative">
                {editingId === mod.id ? (
                  <span className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                    <Input
                      value={editName}
                      onChange={e => setEditName(e.target.value)}
                      className="h-6 w-24 text-xs px-1"
                      autoFocus
                      onKeyDown={e => {
                        if (e.key === "Enter") handleRename(mod.id);
                        if (e.key === "Escape") setEditingId(null);
                      }}
                    />
                    <span
                      role="button"
                      tabIndex={0}
                      onClick={(e) => { e.stopPropagation(); handleRename(mod.id); }}
                      onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); handleRename(mod.id); } }}
                      className="text-primary hover:opacity-80 cursor-pointer inline-flex"
                      aria-label="Confirmar"
                    >
                      <Check className="h-3 w-3" />
                    </span>
                    <span
                      role="button"
                      tabIndex={0}
                      onClick={(e) => { e.stopPropagation(); setEditingId(null); }}
                      onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); setEditingId(null); } }}
                      className="text-destructive hover:opacity-80 cursor-pointer inline-flex"
                      aria-label="Cancelar"
                    >
                      <X className="h-3 w-3" />
                    </span>
                  </span>
                ) : (
                  <>
                    {ICONS[mod.name] && <span>{ICONS[mod.name]}</span>}
                    {mod.name}
                    {isOwner && selectedModality?.id === mod.id && (
                      <span className="ml-1 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <span
                          role="button"
                          tabIndex={0}
                          onClick={e => { e.stopPropagation(); setEditingId(mod.id); setEditName(mod.name); }}
                          onKeyDown={e => { if (e.key === "Enter") { e.stopPropagation(); setEditingId(mod.id); setEditName(mod.name); } }}
                          className="text-muted-foreground hover:text-foreground cursor-pointer inline-flex"
                          aria-label="Renomear categoria"
                        >
                          <Pencil className="h-3 w-3" />
                        </span>
                        <span
                          role="button"
                          tabIndex={0}
                          onClick={e => { e.stopPropagation(); setDeleteTarget(mod); setConfirmStep(1); }}
                          onKeyDown={e => { if (e.key === "Enter") { e.stopPropagation(); setDeleteTarget(mod); setConfirmStep(1); } }}
                          className="text-muted-foreground hover:text-destructive cursor-pointer inline-flex"
                          aria-label="Excluir categoria"
                        >
                          <Trash2 className="h-3 w-3" />
                        </span>
                      </span>
                    )}
                  </>
                )}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      )}

      {isOwner && onAddModality && (
        <Button variant="outline" size="sm" className="gap-1 h-8" onClick={() => setAddOpen(true)}>
          <Plus className="h-3.5 w-3.5" /> Categoria
        </Button>
      )}

      {/* Add Dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Nova Categoria</DialogTitle>
          </DialogHeader>
          <Input
            placeholder="Ex: Intermediário, Avançado, Sub-18..."
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleAdd()}
            autoFocus
          />
          <DialogFooter>
            <Button onClick={handleAdd} disabled={adding || !newName.trim()}>
              {adding ? "Criando..." : "Criar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation - Step 1 */}
      <AlertDialog open={!!deleteTarget && confirmStep === 1} onOpenChange={open => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir categoria "{deleteTarget?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              Todas as duplas e jogos desta categoria serão perdidos. Deseja continuar?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDeleteTarget(null)}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => setConfirmStep(2)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Sim, excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Confirmation - Step 2 (final) */}
      <AlertDialog open={!!deleteTarget && confirmStep === 2} onOpenChange={open => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>⚠️ Confirmação final</AlertDialogTitle>
            <AlertDialogDescription>
              Tem CERTEZA ABSOLUTA que deseja excluir a categoria "{deleteTarget?.name}"? Esta ação NÃO pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDeleteTarget(null)}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Sim, tenho certeza — Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default ModalityTabs;
