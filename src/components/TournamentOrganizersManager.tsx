import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { organizerQuery } from "@/lib/organizerApi";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { UserPlus, Trash2, Users } from "lucide-react";

interface OrganizerAssociation {
  id: string;
  tournament_id: string;
  organizer_id: string;
  granted_by: string;
  created_at: string;
  organizers: {
    id: string;
    username: string;
    display_name: string | null;
    role: string;
  };
}

interface OrganizerOption {
  id: string;
  username: string;
  display_name: string | null;
  role: string;
}

interface Props {
  tournamentId: string;
  createdBy: string;
}

const TournamentOrganizersManager = ({ tournamentId, createdBy }: Props) => {
  const { organizerId, isAdmin } = useAuth();
  const [associations, setAssociations] = useState<OrganizerAssociation[]>([]);
  const [availableOrganizers, setAvailableOrganizers] = useState<OrganizerOption[]>([]);
  const [selectedOrganizerId, setSelectedOrganizerId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);

  const isCreator = organizerId === createdBy;
  const canManage = isAdmin || isCreator;

  const fetchData = async () => {
    setLoading(true);
    const [assocRes, orgRes] = await Promise.all([
      organizerQuery<OrganizerAssociation[]>({
        table: "tournament_organizers",
        operation: "select",
        filters: { tournament_id: tournamentId },
      }),
      organizerQuery<OrganizerOption[]>({
        table: "organizers",
        operation: "select",
        select: "id, username, display_name, role",
      }),
    ]);

    if (!assocRes.error && assocRes.data) setAssociations(assocRes.data);
    if (!orgRes.error && orgRes.data) {
      // Exclude the tournament creator and already associated organizers
      const alreadyLinked = new Set(assocRes.data?.map((a) => a.organizer_id) ?? []);
      setAvailableOrganizers(
        orgRes.data.filter((o) => o.id !== createdBy && !alreadyLinked.has(o.id))
      );
    }
    setLoading(false);
  };

  useEffect(() => {
    if (canManage) fetchData();
  }, [tournamentId, canManage]);

  const handleAdd = async () => {
    if (!selectedOrganizerId) return;
    setAdding(true);
    const { error } = await organizerQuery({
      table: "tournament_organizers",
      operation: "insert",
      data: {
        tournament_id: tournamentId,
        organizer_id: selectedOrganizerId,
      },
    });
    if (error) {
      toast.error("Erro ao associar organizador: " + error.message);
    } else {
      toast.success("Organizador associado com sucesso!");
      setSelectedOrganizerId("");
      await fetchData();
    }
    setAdding(false);
  };

  const handleRemove = async (associationId: string, organizerName: string) => {
    const { error } = await organizerQuery({
      table: "tournament_organizers",
      operation: "delete",
      filters: { id: associationId },
    });
    if (error) {
      toast.error("Erro ao remover organizador: " + error.message);
    } else {
      toast.success(`${organizerName} removido do torneio.`);
      await fetchData();
    }
  };

  if (!canManage) return null;

  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-card">
      <div className="mb-4 flex items-center gap-2">
        <Users className="h-4 w-4 text-primary" />
        <h3 className="font-semibold">Organizadores Associados</h3>
      </div>

      {loading ? (
        <div className="flex justify-center py-6">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      ) : (
        <>
          {/* Current associations */}
          <div className="mb-4 space-y-2">
            {associations.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum organizador associado além do criador.</p>
            ) : (
              associations.map((assoc) => (
                <div key={assoc.id} className="flex items-center justify-between rounded-lg border border-border/60 bg-muted/30 px-3 py-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">
                      {assoc.organizers?.display_name || assoc.organizers?.username}
                    </span>
                    <Badge variant="secondary" className="text-xs">
                      @{assoc.organizers?.username}
                    </Badge>
                    {assoc.organizers?.role === "admin" && (
                      <Badge className="text-xs bg-primary/20 text-primary">Admin</Badge>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0 hover:text-destructive"
                    onClick={() => handleRemove(assoc.id, assoc.organizers?.username)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))
            )}
          </div>

          {/* Add organizer */}
          <div className="flex gap-2">
            <Select value={selectedOrganizerId} onValueChange={setSelectedOrganizerId}>
              <SelectTrigger className="flex-1">
                <SelectValue placeholder="Selecionar organizador..." />
              </SelectTrigger>
              <SelectContent>
                {availableOrganizers.length === 0 ? (
                  <div className="px-3 py-2 text-sm text-muted-foreground">
                    Nenhum organizador disponível
                  </div>
                ) : (
                  availableOrganizers.map((o) => (
                    <SelectItem key={o.id} value={o.id}>
                      {o.display_name ? `${o.display_name} (@${o.username})` : `@${o.username}`}
                      {o.role === "admin" && " — Admin"}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
            <Button
              onClick={handleAdd}
              disabled={!selectedOrganizerId || adding}
              className="gap-2 bg-gradient-primary text-primary-foreground hover:opacity-90"
            >
              <UserPlus className="h-4 w-4" />
              {adding ? "Adicionando..." : "Associar"}
            </Button>
          </div>
        </>
      )}
    </div>
  );
};

export default TournamentOrganizersManager;
