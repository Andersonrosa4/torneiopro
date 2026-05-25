import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { RotateCcw, Trash2, Archive, RefreshCw } from "lucide-react";
import { formatDateBR } from "@/lib/utils";

interface DeletedRecord {
  id: string;
  table_name: string;
  record_id: string | null;
  record_snapshot: any;
  deleted_at: string;
  restored_at: string | null;
  expires_at: string;
  reason: string | null;
}

const TABLE_LABELS: Record<string, string> = {
  tournaments: "Torneio",
  tournament_stages: "Etapa",
  modalities: "Modalidade",
  teams: "Dupla",
  matches: "Partida",
  groups: "Grupo",
  classificacao_grupos: "Classificação de Grupo",
  rankings: "Ranking",
  ranking_points_history: "Histórico de Pontos",
  participants: "Participante",
  bookings: "Reserva",
  court_bookings: "Reserva de Quadra",
  community_members: "Membro de Comunidade",
  ranking_communities: "Comunidade",
  challenges: "Desafio",
  arenas: "Arena",
  courts: "Quadra",
  tournament_organizers: "Organizador do Torneio",
};

function describeRecord(r: DeletedRecord): string {
  const s = r.record_snapshot || {};
  if (r.table_name === "teams") return `${s.player1_name ?? "?"} / ${s.player2_name ?? "?"}`;
  if (r.table_name === "rankings" || r.table_name === "ranking_points_history") return s.athlete_name ?? "";
  if (r.table_name === "tournaments" || r.table_name === "modalities" || r.table_name === "tournament_stages" || r.table_name === "ranking_communities" || r.table_name === "arenas" || r.table_name === "courts") return s.name ?? "";
  if (r.table_name === "matches") return `Rodada ${s.round} — pos ${s.position}`;
  if (r.table_name === "groups") return s.name ?? "";
  return r.record_id ?? "—";
}

export default function RecycleBinTab({ tournamentId }: { tournamentId: string }) {
  const [items, setItems] = useState<DeletedRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<string>("all");

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("deleted_records" as any)
      .select("*")
      .eq("tournament_id", tournamentId)
      .is("restored_at", null)
      .order("deleted_at", { ascending: false })
      .limit(500);
    if (error) toast.error("Erro ao carregar lixeira: " + error.message);
    setItems((data as any) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, [tournamentId]);

  const restore = async (id: string) => {
    const { data, error } = await supabase.rpc("restore_deleted_record" as any, { _id: id });
    if (error) return toast.error("Falha ao restaurar: " + error.message);
    toast.success("Registro restaurado");
    load();
  };

  const purge = async (id: string) => {
    if (!confirm("Apagar definitivamente? Esta ação não pode ser desfeita.")) return;
    const { error } = await supabase.from("deleted_records" as any).delete().eq("id", id);
    if (error) return toast.error("Falha ao apagar: " + error.message);
    toast.success("Removido da lixeira");
    load();
  };

  const tables = Array.from(new Set(items.map((i) => i.table_name)));
  const filtered = filter === "all" ? items : items.filter((i) => i.table_name === filter);

  return (
    <section className="rounded-xl border border-border bg-card p-3 sm:p-6 shadow-card">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Archive className="h-5 w-5 text-amber-400" />
          <h2 className="text-lg sm:text-xl font-semibold">Lixeira</h2>
          <Badge variant="secondary">{items.length}</Badge>
        </div>
        <Button size="sm" variant="ghost" onClick={load} disabled={loading}>
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </div>

      <p className="text-xs text-muted-foreground mb-3">
        Tudo que for apagado fica aqui por 30 dias. Restaure ou apague definitivamente.
      </p>

      <div className="flex flex-wrap gap-1 mb-4">
        <Button size="sm" variant={filter === "all" ? "default" : "outline"} onClick={() => setFilter("all")}>
          Todos
        </Button>
        {tables.map((t) => (
          <Button key={t} size="sm" variant={filter === t ? "default" : "outline"} onClick={() => setFilter(t)}>
            {TABLE_LABELS[t] ?? t}
          </Button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">Lixeira vazia.</p>
      ) : (
        <div className="space-y-2">
          {filtered.map((r) => (
            <Card key={r.id} className="p-3 flex items-center justify-between gap-2 flex-wrap">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <Badge variant="outline" className="text-[10px]">{TABLE_LABELS[r.table_name] ?? r.table_name}</Badge>
                  <span className="text-xs text-muted-foreground">{formatDateBR(r.deleted_at)}</span>
                </div>
                <p className="text-sm font-medium truncate">{describeRecord(r)}</p>
                {r.reason && <p className="text-[11px] text-muted-foreground">Motivo: {r.reason}</p>}
              </div>
              <div className="flex gap-1">
                <Button size="sm" variant="outline" onClick={() => restore(r.id)}>
                  <RotateCcw className="h-3.5 w-3.5 mr-1" /> Restaurar
                </Button>
                <Button size="sm" variant="ghost" onClick={() => purge(r.id)} className="text-destructive">
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </section>
  );
}
