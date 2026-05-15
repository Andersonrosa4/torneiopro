import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { MapPin, Save, Trash2 } from "lucide-react";
import { organizerQuery } from "@/lib/organizerApi";
import { getEliminationRoundLabel } from "@/lib/roundLabels";

interface MatchLite {
  id: string;
  bracket_number?: number | null;
  court_number?: number | null;
  modality_id?: string | null;
  round?: number | null;
  position?: number | null;
  bracket_type?: string | null;
}

interface Props {
  tournamentId: string;
  modalityId: string | null;
  matches: MatchLite[];
  canEdit: boolean;
  onUpdated?: () => void;
}

/**
 * Painel "Quadras" — duas seções:
 *  1) Quadras por Chave (fase de grupos / chaves): aplica court_number a TODAS
 *     as partidas da chave (bracket_number).
 *  2) Quadras por Fase Eliminatória (oitavas, quartas, semi, final): permite
 *     definir quantas quadras serão usadas naquela fase e a partir de qual
 *     número. As partidas da fase são distribuídas ciclicamente entre as
 *     quadras (court = inicial + (idx % nQuadras)).
 *
 * Não interfere no chaveamento — apenas grava `court_number`.
 */
export default function CourtAssignmentPanel({
  tournamentId,
  modalityId,
  matches,
  canEdit,
  onUpdated,
}: Props) {
  // ─── Seção 1: Chaves (bracket_number) ───
  const brackets = useMemo(() => {
    const set = new Set<number>();
    matches.forEach((m) => {
      const b = (m.bracket_number ?? 1) as number;
      if (b > 0) set.add(b);
    });
    return Array.from(set).sort((a, b) => a - b);
  }, [matches]);

  const initialBracketMap = useMemo(() => {
    const counters: Record<number, Record<number, number>> = {};
    matches.forEach((m) => {
      const b = (m.bracket_number ?? 1) as number;
      if (m.court_number == null) return;
      // Considera apenas grupos (round 0) para sugerir valor da chave
      if ((m.round ?? 0) !== 0) return;
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

  const [bracketValues, setBracketValues] = useState<Record<number, string>>(initialBracketMap);

  useEffect(() => {
    setBracketValues(initialBracketMap);
  }, [initialBracketMap]);

  // ─── Seção 2: Fases Eliminatórias (round > 0) ───
  // Agrupa winners-bracket (ou null/single elim). Ignora losers/grand final.
  const eliminationRounds = useMemo(() => {
    const byRound: Record<number, MatchLite[]> = {};
    matches.forEach((m) => {
      const r = m.round ?? 0;
      if (r <= 0) return;
      const bt = (m.bracket_type ?? "winners").toLowerCase();
      if (bt !== "winners") return; // limita a chave principal
      byRound[r] = byRound[r] || [];
      byRound[r].push(m);
    });
    return Object.keys(byRound)
      .map(Number)
      .sort((a, b) => a - b)
      .map((round) => {
        const list = byRound[round].slice().sort((a, b) => {
          const ba = (a.bracket_number ?? 1) - (b.bracket_number ?? 1);
          if (ba !== 0) return ba;
          return (a.position ?? 0) - (b.position ?? 0);
        });
        return {
          round,
          matches: list,
          label: getEliminationRoundLabel(round, list.length),
        };
      });
  }, [matches]);

  // Valor sugerido por fase: detecta nº de quadras distintas e a quadra inicial.
  const initialPhaseMap = useMemo(() => {
    const out: Record<number, { count: string; start: string }> = {};
    eliminationRounds.forEach(({ round, matches: list }) => {
      const courts = list.map((m) => m.court_number).filter((c): c is number => c != null && c > 0);
      const unique = Array.from(new Set(courts)).sort((a, b) => a - b);
      out[round] = {
        count: unique.length > 0 ? String(unique.length) : "",
        start: unique.length > 0 ? String(unique[0]) : "",
      };
    });
    return out;
  }, [eliminationRounds]);

  const [phaseValues, setPhaseValues] = useState<Record<number, { count: string; start: string }>>(initialPhaseMap);

  useEffect(() => {
    setPhaseValues(initialPhaseMap);
  }, [initialPhaseMap]);

  const [saving, setSaving] = useState(false);

  if (!modalityId || (brackets.length === 0 && eliminationRounds.length === 0)) return null;

  const letterFor = (n: number) => String.fromCharCode(64 + n);

  const handleSave = async () => {
    if (!canEdit) return;
    setSaving(true);
    try {
      const updates: Promise<any>[] = [];
      let touched = 0;

      // ─── Salva quadras por chave (afeta apenas round 0 = grupos) ───
      for (const b of brackets) {
        const raw = bracketValues[b]?.trim();
        const parsed = raw === "" || raw == null ? null : Number(raw);
        if (parsed != null && (!Number.isFinite(parsed) || parsed < 1 || parsed > 99)) {
          toast.error(`Quadra inválida para Chave ${letterFor(b)}: use de 1 a 99 (ou vazio).`);
          setSaving(false);
          return;
        }
        // Atualiza somente partidas da fase de grupos (round = 0) dessa chave.
        // Assim, a configuração por fase eliminatória não é sobrescrita.
        const groupMatchIds = matches
          .filter((m) => (m.bracket_number ?? 1) === b && (m.round ?? 0) === 0)
          .map((m) => m.id);
        if (groupMatchIds.length === 0) continue;
        for (const mid of groupMatchIds) {
          updates.push(
            organizerQuery({
              table: "matches",
              operation: "update",
              data: { court_number: parsed },
              filters: { id: mid },
            }),
          );
        }
        touched++;
      }

      // ─── Salva quadras por fase eliminatória ───
      for (const phase of eliminationRounds) {
        const cfg = phaseValues[phase.round];
        if (!cfg) continue;
        const countRaw = cfg.count?.trim();
        const startRaw = cfg.start?.trim();
        // Vazio = limpa as quadras dessa fase
        if (!countRaw && !startRaw) {
          for (const m of phase.matches) {
            updates.push(
              organizerQuery({
                table: "matches",
                operation: "update",
                data: { court_number: null },
                filters: { id: m.id },
              }),
            );
          }
          touched++;
          continue;
        }
        const count = Number(countRaw);
        const start = Number(startRaw);
        if (!Number.isFinite(count) || count < 1 || count > 99) {
          toast.error(`Nº de quadras inválido em ${phase.label}: use 1 a 99.`);
          setSaving(false);
          return;
        }
        if (!Number.isFinite(start) || start < 1 || start > 99) {
          toast.error(`Quadra inicial inválida em ${phase.label}: use 1 a 99.`);
          setSaving(false);
          return;
        }
        phase.matches.forEach((m, idx) => {
          const court = start + (idx % count);
          updates.push(
            organizerQuery({
              table: "matches",
              operation: "update",
              data: { court_number: court > 99 ? 99 : court },
              filters: { id: m.id },
            }),
          );
        });
        touched++;
      }

      const results = await Promise.all(updates);
      const firstError = results.find((r: any) => r?.error);
      if (firstError?.error) {
        toast.error(`Falha ao salvar quadras: ${firstError.error.message || firstError.error}`);
      } else {
        toast.success(`Quadras atualizadas em ${touched} grupo(s) de partidas.`);
        onUpdated?.();
      }
    } catch (e: any) {
      toast.error(`Erro ao salvar quadras: ${e?.message || e}`);
    } finally {
      setSaving(false);
    }
  };

  const handleClearAll = async () => {
    if (!canEdit) return;
    if (!confirm("Remover o número da quadra de TODAS as partidas desta modalidade?")) return;
    setSaving(true);
    try {
      const { error } = await organizerQuery({
        table: "matches",
        operation: "update",
        data: { court_number: null },
        filters: { tournament_id: tournamentId, modality_id: modalityId },
      });
      if (error) {
        toast.error(`Falha ao limpar quadras: ${error.message || error}`);
      } else {
        setBracketValues({});
        setPhaseValues({});
        toast.success("Quadras removidas de todas as partidas.");
        onUpdated?.();
      }
    } catch (e: any) {
      toast.error(`Erro ao limpar quadras: ${e?.message || e}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mb-4 rounded-xl border border-border bg-card/50 p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <MapPin className="h-4 w-4 text-primary" /> Quadras
        </h3>
        <span className="text-[11px] text-muted-foreground">
          O número da quadra aparece no card de cada jogo dos atletas.
        </span>
      </div>

      {/* Seção 1: Chaves (Fase de Grupos) */}
      {brackets.length > 0 && (
        <div className="mb-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Por Chave (Fase de Grupos)
          </p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {brackets.map((b) => (
              <div key={b} className="rounded-lg border border-border/60 bg-background/40 p-3">
                <Label htmlFor={`court-${b}`} className="mb-1.5 block text-xs font-semibold text-muted-foreground">
                  Chave {letterFor(b)}
                </Label>
                <div className="flex items-center gap-1.5">
                  <Input
                    id={`court-${b}`}
                    type="number"
                    min={1}
                    max={99}
                    inputMode="numeric"
                    placeholder="Nº da quadra"
                    disabled={!canEdit || saving}
                    value={bracketValues[b] ?? ""}
                    onChange={(e) => setBracketValues((prev) => ({ ...prev, [b]: e.target.value }))}
                    className="h-9"
                  />
                  {canEdit && (bracketValues[b] ?? "") !== "" && (
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="h-9 w-9 shrink-0 text-muted-foreground hover:text-destructive"
                      title={`Limpar quadra da Chave ${letterFor(b)}`}
                      disabled={saving}
                      onClick={() => setBracketValues((prev) => ({ ...prev, [b]: "" }))}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Seção 2: Fases Eliminatórias */}
      {eliminationRounds.length > 0 && (
        <div className="mb-2">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Por Fase Eliminatória
          </p>
          <p className="mb-2 text-[11px] text-muted-foreground">
            Defina quantas quadras serão usadas em cada fase e a partir de qual número. As partidas
            da fase são distribuídas em rodízio entre as quadras.
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {eliminationRounds.map((phase) => {
              const cfg = phaseValues[phase.round] ?? { count: "", start: "" };
              return (
                <div key={phase.round} className="rounded-lg border border-border/60 bg-background/40 p-3">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <Label className="text-xs font-semibold text-foreground">
                      {phase.label}
                    </Label>
                    <span className="text-[10px] text-muted-foreground">
                      {phase.matches.length} jogo(s)
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label htmlFor={`phase-count-${phase.round}`} className="mb-1 block text-[10px] text-muted-foreground">
                        Nº de quadras
                      </Label>
                      <Input
                        id={`phase-count-${phase.round}`}
                        type="number"
                        min={1}
                        max={99}
                        inputMode="numeric"
                        placeholder="Ex: 2"
                        disabled={!canEdit || saving}
                        value={cfg.count}
                        onChange={(e) =>
                          setPhaseValues((prev) => ({
                            ...prev,
                            [phase.round]: { ...(prev[phase.round] ?? { count: "", start: "" }), count: e.target.value },
                          }))
                        }
                        className="h-9"
                      />
                    </div>
                    <div>
                      <Label htmlFor={`phase-start-${phase.round}`} className="mb-1 block text-[10px] text-muted-foreground">
                        Quadra inicial
                      </Label>
                      <Input
                        id={`phase-start-${phase.round}`}
                        type="number"
                        min={1}
                        max={99}
                        inputMode="numeric"
                        placeholder="Ex: 1"
                        disabled={!canEdit || saving}
                        value={cfg.start}
                        onChange={(e) =>
                          setPhaseValues((prev) => ({
                            ...prev,
                            [phase.round]: { ...(prev[phase.round] ?? { count: "", start: "" }), start: e.target.value },
                          }))
                        }
                        className="h-9"
                      />
                    </div>
                  </div>
                  {canEdit && (cfg.count !== "" || cfg.start !== "") && (
                    <div className="mt-2 flex justify-end">
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-7 gap-1 text-[11px] text-muted-foreground hover:text-destructive"
                        disabled={saving}
                        onClick={() =>
                          setPhaseValues((prev) => ({ ...prev, [phase.round]: { count: "", start: "" } }))
                        }
                      >
                        <Trash2 className="h-3 w-3" /> Limpar fase
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {canEdit && (
        <div className="mt-3 flex flex-wrap justify-end gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={handleClearAll}
            disabled={saving}
            className="gap-1.5 text-destructive hover:text-destructive"
          >
            <Trash2 className="h-4 w-4" />
            Excluir Quadras
          </Button>
          <Button size="sm" onClick={handleSave} disabled={saving} className="gap-1.5">
            <Save className="h-4 w-4" />
            {saving ? "Salvando..." : "Salvar Quadras"}
          </Button>
        </div>
      )}
    </div>
  );
}
