import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { MapPin, Save } from "lucide-react";
import { organizerQuery } from "@/lib/organizerApi";

interface MatchLite {
  id: string;
  bracket_number?: number | null;
  court_number?: number | null;
  modality_id?: string | null;
}

interface Props {
  tournamentId: string;
  modalityId: string | null;
  matches: MatchLite[];
  canEdit: boolean;
  onUpdated?: () => void;
}

/**
 * Painel "Quadras por Chave" — permite atribuir um número de quadra fixo
 * para cada chave (bracket_number) da modalidade atual. Aplica a TODAS as
 * partidas (grupos + mata-mata) que possuam o mesmo bracket_number.
 *
 * Não interfere no chaveamento — apenas grava `court_number` em cada partida.
 */
export default function CourtAssignmentPanel({
  tournamentId,
  modalityId,
  matches,
  canEdit,
  onUpdated,
}: Props) {
  // Lista única de chaves presentes na modalidade
  const brackets = useMemo(() => {
    const set = new Set<number>();
    matches.forEach((m) => {
      const b = (m.bracket_number ?? 1) as number;
      if (b > 0) set.add(b);
    });
    return Array.from(set).sort((a, b) => a - b);
  }, [matches]);

  // Quadra atual mais frequente por chave (para sugerir o valor inicial)
  const initialMap = useMemo(() => {
    const counters: Record<number, Record<number, number>> = {};
    matches.forEach((m) => {
      const b = (m.bracket_number ?? 1) as number;
      if (m.court_number == null) return;
      counters[b] = counters[b] || {};
      counters[b][m.court_number] = (counters[b][m.court_number] || 0) + 1;
    });
    const out: Record<number, string> = {};
    for (const [b, byCourt] of Object.entries(counters)) {
      let bestCourt = 0;
      let bestCount = -1;
      for (const [c, n] of Object.entries(byCourt)) {
        if (n > bestCount) { bestCount = n; bestCourt = Number(c); }
      }
      if (bestCourt > 0) out[Number(b)] = String(bestCourt);
    }
    return out;
  }, [matches]);

  const [values, setValues] = useState<Record<number, string>>(initialMap);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setValues(initialMap);
  }, [initialMap]);

  if (!modalityId || brackets.length === 0) return null;

  const letterFor = (n: number) => String.fromCharCode(64 + n);

  const handleSave = async () => {
    if (!canEdit) return;
    setSaving(true);
    try {
      const updates: Promise<any>[] = [];
      let touched = 0;
      for (const b of brackets) {
        const raw = values[b]?.trim();
        const parsed = raw === "" || raw == null ? null : Number(raw);
        if (parsed != null && (!Number.isFinite(parsed) || parsed < 1 || parsed > 99)) {
          toast.error(`Quadra inválida para Chave ${letterFor(b)}: use de 1 a 99 (ou vazio).`);
          setSaving(false);
          return;
        }
        updates.push(
          organizerQuery({
            table: "matches",
            operation: "update",
            data: { court_number: parsed },
            filters: { tournament_id: tournamentId, modality_id: modalityId, bracket_number: b },
          }),
        );
        touched++;
      }
      const results = await Promise.all(updates);
      const firstError = results.find((r: any) => r?.error);
      if (firstError?.error) {
        toast.error(`Falha ao salvar quadras: ${firstError.error.message || firstError.error}`);
      } else {
        toast.success(`Quadras atribuídas em ${touched} chave(s).`);
        onUpdated?.();
      }
    } catch (e: any) {
      toast.error(`Erro ao salvar quadras: ${e?.message || e}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mb-4 rounded-xl border border-border bg-card/50 p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <MapPin className="h-4 w-4 text-primary" /> Quadras por Chave
        </h3>
        <span className="text-[11px] text-muted-foreground">
          O número da quadra aparece no card de cada jogo dos atletas.
        </span>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
        {brackets.map((b) => (
          <div key={b} className="rounded-lg border border-border/60 bg-background/40 p-3">
            <Label htmlFor={`court-${b}`} className="mb-1.5 block text-xs font-semibold text-muted-foreground">
              Chave {letterFor(b)}
            </Label>
            <Input
              id={`court-${b}`}
              type="number"
              min={1}
              max={99}
              inputMode="numeric"
              placeholder="Nº da quadra"
              disabled={!canEdit || saving}
              value={values[b] ?? ""}
              onChange={(e) => setValues((prev) => ({ ...prev, [b]: e.target.value }))}
              className="h-9"
            />
          </div>
        ))}
      </div>
      {canEdit && (
        <div className="mt-3 flex justify-end">
          <Button size="sm" onClick={handleSave} disabled={saving} className="gap-1.5">
            <Save className="h-4 w-4" />
            {saving ? "Salvando..." : "Salvar Quadras"}
          </Button>
        </div>
      )}
    </div>
  );
}
