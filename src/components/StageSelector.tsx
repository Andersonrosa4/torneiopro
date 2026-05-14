import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { organizerQuery, publicQuery } from "@/lib/organizerApi";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Plus, Calendar, Layers, Trash2, Pencil } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

interface Stage {
  id: string;
  tournament_id: string;
  name: string;
  stage_number: number;
  status: string;
  event_date: string | null;
  created_at: string;
}

interface StageSelectorProps {
  tournamentId: string;
  isOwner: boolean;
  selectedStageId: string | null;
  onSelectStage: (stageId: string | null) => void;
}

const StageSelector = ({ tournamentId, isOwner, selectedStageId, onSelectStage }: StageSelectorProps) => {
  const [stages, setStages] = useState<Stage[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newStageName, setNewStageName] = useState("");
  const [newStageDate, setNewStageDate] = useState("");
  const [creating, setCreating] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Stage | null>(null);
  const [editTarget, setEditTarget] = useState<Stage | null>(null);
  const [editName, setEditName] = useState("");
  const [editDate, setEditDate] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  const fetchStages = useCallback(async () => {
    const { data } = await publicQuery<Stage[]>({
      table: "tournament_stages",
      filters: { tournament_id: tournamentId },
      order: { column: "stage_number", ascending: true },
    });
    setStages(data || []);
  }, [tournamentId]);

  useEffect(() => {
    fetchStages();
    const channel = supabase
      .channel(`stages-${tournamentId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "tournament_stages", filter: `tournament_id=eq.${tournamentId}` }, () => fetchStages())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [tournamentId, fetchStages]);

  const createStage = async () => {
    if (!newStageName.trim()) {
      toast.error("Nome da etapa é obrigatório");
      return;
    }
    setCreating(true);
    const nextNumber = stages.length + 1;
    const { error } = await organizerQuery({
      table: "tournament_stages",
      operation: "insert",
      data: {
        tournament_id: tournamentId,
        name: newStageName.trim(),
        stage_number: nextNumber,
        event_date: newStageDate || null,
        status: "draft",
      },
    });
    setCreating(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`Etapa "${newStageName.trim()}" criada!`);
    setNewStageName("");
    setNewStageDate("");
    setDialogOpen(false);
    fetchStages();
  };

  const openEdit = (stage: Stage) => {
    setEditTarget(stage);
    setEditName(stage.name);
    setEditDate(stage.event_date || "");
  };

  const saveEdit = async () => {
    if (!editTarget) return;
    if (!editName.trim()) {
      toast.error("Nome da etapa é obrigatório");
      return;
    }
    setSavingEdit(true);
    const { error } = await organizerQuery({
      table: "tournament_stages",
      operation: "update",
      data: { name: editName.trim(), event_date: editDate || null },
      filters: { id: editTarget.id },
    });
    setSavingEdit(false);
    if (error) {
      toast.error("Erro ao salvar: " + error.message);
      return;
    }
    toast.success("Etapa atualizada!");
    setEditTarget(null);
    fetchStages();
  };

  const deleteStage = async () => {
    if (!deleteTarget) return;

    // Delete matches, teams, and related data for this stage first
    const { error: matchErr } = await organizerQuery({
      table: "matches",
      operation: "delete",
      filters: { tournament_id: tournamentId, stage_id: deleteTarget.id },
    });
    if (matchErr) {
      toast.error("Erro ao excluir jogos da etapa: " + matchErr.message);
      setDeleteTarget(null);
      return;
    }

    const { error: teamErr } = await organizerQuery({
      table: "teams",
      operation: "delete",
      filters: { tournament_id: tournamentId, stage_id: deleteTarget.id },
    });
    if (teamErr) {
      toast.error("Erro ao excluir duplas da etapa: " + teamErr.message);
      setDeleteTarget(null);
      return;
    }

    const { error } = await organizerQuery({
      table: "tournament_stages",
      operation: "delete",
      filters: { id: deleteTarget.id },
    });

    if (error) {
      toast.error("Erro ao excluir etapa: " + error.message);
    } else {
      toast.success(`Etapa "${deleteTarget.name}" excluída.`);
      if (selectedStageId === deleteTarget.id) {
        onSelectStage(null);
      }
      fetchStages();
    }
    setDeleteTarget(null);
  };

  if (stages.length === 0 && !isOwner) return null;

  return (
    <div className="mb-4">
      <div className="flex items-center gap-2 mb-2">
        <Layers className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-semibold text-muted-foreground">Etapas</span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant={selectedStageId === null ? "default" : "outline"}
          onClick={() => onSelectStage(null)}
          className="h-8 text-xs rounded-lg"
        >
          1ª Etapa
        </Button>
        {stages.map((stage) => (
          <div key={stage.id} className="flex items-center gap-0.5 group">
            <Button
              size="sm"
              variant={selectedStageId === stage.id ? "default" : "outline"}
              onClick={() => onSelectStage(stage.id)}
              className="h-8 text-xs rounded-lg gap-1.5"
            >
              {stage.name}
              {stage.event_date && (
                <span className="text-[10px] text-muted-foreground/70">
                  {new Date(stage.event_date + "T12:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}
                </span>
              )}
            </Button>
            {isOwner && (
              <>
                <button
                  onClick={() => openEdit(stage)}
                  className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-primary p-1"
                  title="Editar etapa"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => setDeleteTarget(stage)}
                  className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive p-1"
                  title="Excluir etapa"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </>
            )}
          </div>
        ))}
        {isOwner && (
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm" variant="ghost" className="h-8 text-xs gap-1 text-primary">
                <Plus className="h-3.5 w-3.5" /> Nova Etapa
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-sm">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Calendar className="h-5 w-5 text-primary" />
                  Criar Nova Etapa
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Nome da Etapa</label>
                  <Input
                    value={newStageName}
                    onChange={(e) => setNewStageName(e.target.value)}
                    placeholder={`Ex: Etapa ${stages.length + 1}`}
                    onKeyDown={(e) => e.key === "Enter" && createStage()}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Data (opcional)</label>
                  <Input
                    type="date"
                    value={newStageDate}
                    onChange={(e) => setNewStageDate(e.target.value)}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
                <Button onClick={createStage} disabled={creating} className="gap-1">
                  {creating ? "Criando..." : "Criar Etapa"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {/* Edit Dialog */}
      <Dialog open={!!editTarget} onOpenChange={(open) => !open && setEditTarget(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="h-5 w-5 text-primary" />
              Editar Etapa
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Nome da Etapa</label>
              <Input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && saveEdit()}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Data (opcional)</label>
              <Input
                type="date"
                value={editDate}
                onChange={(e) => setEditDate(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditTarget(null)}>Cancelar</Button>
            <Button onClick={saveEdit} disabled={savingEdit} className="gap-1">
              {savingEdit ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir etapa "{deleteTarget?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              Todos os jogos e duplas desta etapa serão excluídos permanentemente. Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={deleteStage} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default StageSelector;
