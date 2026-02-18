/**
 * Manual Match Override
 * Permite ao organizador definir manualmente quem está em cada slot
 * e quem é o vencedor/perdedor — para corrigir erros de propagação.
 */

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Wrench, Trophy, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { organizerQuery } from "@/lib/organizerApi";

interface Team {
  id: string;
  player1_name: string;
  player2_name: string;
}

interface Match {
  id: string;
  round: number;
  position: number;
  team1_id: string | null;
  team2_id: string | null;
  winner_team_id: string | null;
  status: string;
  bracket_type?: string | null;
  bracket_half?: string | null;
}

interface ManualMatchOverrideProps {
  match: Match;
  matchNumber: number;
  teams: Team[];
  onSaved: () => void;
}

const NONE = "__none__";

export function ManualMatchOverride({ match, matchNumber, teams, onSaved }: ManualMatchOverrideProps) {
  const [open, setOpen] = useState(false);
  const [team1, setTeam1] = useState<string>(match.team1_id ?? NONE);
  const [team2, setTeam2] = useState<string>(match.team2_id ?? NONE);
  const [winner, setWinner] = useState<string>(match.winner_team_id ?? NONE);
  const [saving, setSaving] = useState(false);

  const teamName = (id: string) => {
    const t = teams.find(t => t.id === id);
    return t ? `${t.player1_name} / ${t.player2_name}` : id;
  };

  const handleOpen = () => {
    setTeam1(match.team1_id ?? NONE);
    setTeam2(match.team2_id ?? NONE);
    setWinner(match.winner_team_id ?? NONE);
    setOpen(true);
  };

  const handleSave = async () => {
    const t1 = team1 === NONE ? null : team1;
    const t2 = team2 === NONE ? null : team2;
    const w = winner === NONE ? null : winner;

    // Validações básicas
    if (t1 && t2 && t1 === t2) {
      toast.error("❌ Time 1 e Time 2 não podem ser a mesma dupla.");
      return;
    }
    if (w && w !== t1 && w !== t2) {
      toast.error("❌ O vencedor precisa ser um dos dois times da partida.");
      return;
    }

    setSaving(true);
    try {
      const updateData: Record<string, string | null> = {
        team1_id: t1,
        team2_id: t2,
      };

      if (w) {
        updateData.winner_team_id = w;
        updateData.status = "completed";
      } else {
        // Se não há vencedor, resetar para pendente
        updateData.winner_team_id = null;
        if (!t1 || !t2) {
          updateData.status = "pending";
        } else {
          updateData.status = "pending";
        }
      }

      const { error } = await organizerQuery({
        table: "matches",
        operation: "update",
        data: updateData,
        filters: { id: match.id },
      });

      if (error) {
        toast.error(`❌ Erro ao salvar: ${error.message}`);
        return;
      }

      toast.success(`✅ Jogo ${matchNumber} corrigido manualmente!`);
      setOpen(false);
      onSaved();
    } finally {
      setSaving(false);
    }
  };

  const bracketLabel = (() => {
    if (!match.bracket_type) return "";
    const typeMap: Record<string, string> = {
      winners: "Vencedores",
      losers: "Perdedores",
      semi_final: "Semifinal",
      final: "Final",
    };
    const halfMap: Record<string, string> = { upper: "A", lower: "B" };
    const type = typeMap[match.bracket_type] ?? match.bracket_type;
    const half = match.bracket_half ? ` ${halfMap[match.bracket_half] ?? match.bracket_half}` : "";
    return `${type}${half} — R${match.round}P${match.position}`;
  })();

  return (
    <>
      <Button
        size="sm"
        variant="ghost"
        className="h-5 px-1.5 text-[9px] gap-0.5 ml-auto text-warning/70 hover:text-warning hover:bg-warning/10"
        onClick={handleOpen}
        title="Corrigir manualmente os slots e/ou vencedor desta partida"
      >
        <Wrench className="h-2.5 w-2.5" />
        <span>Override</span>
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Wrench className="h-4 w-4 text-warning" />
              Correção Manual — Jogo {matchNumber}
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              {bracketLabel && <Badge variant="outline" className="text-[9px] mr-2">{bracketLabel}</Badge>}
              Use somente para corrigir erros de propagação automática.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Aviso */}
            <div className="flex items-start gap-2 rounded-lg bg-warning/10 border border-warning/30 px-3 py-2">
              <AlertTriangle className="h-4 w-4 text-warning shrink-0 mt-0.5" />
              <p className="text-[11px] text-warning/90 leading-snug">
                Esta operação altera diretamente o banco de dados. A propagação automática <strong>não será</strong> reexecutada — apenas os slots desta partida serão corrigidos.
              </p>
            </div>

            {/* Time 1 */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">Slot 1 (Time da esquerda / cima)</label>
              <Select value={team1} onValueChange={setTeam1}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Selecionar dupla..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE} className="text-xs text-muted-foreground italic">— Vazio (A definir) —</SelectItem>
                  {teams.map(t => (
                    <SelectItem key={t.id} value={t.id} className="text-xs">
                      {t.player1_name} / {t.player2_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Time 2 */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">Slot 2 (Time da direita / baixo)</label>
              <Select value={team2} onValueChange={setTeam2}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Selecionar dupla..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE} className="text-xs text-muted-foreground italic">— Vazio (A definir) —</SelectItem>
                  {teams.map(t => (
                    <SelectItem key={t.id} value={t.id} className="text-xs">
                      {t.player1_name} / {t.player2_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Vencedor */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground flex items-center gap-1">
                <Trophy className="h-3 w-3 text-success" />
                Vencedor (opcional — define a partida como finalizada)
              </label>
              <Select value={winner} onValueChange={setWinner}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Nenhum (partida pendente)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE} className="text-xs text-muted-foreground italic">— Sem vencedor (partida pendente) —</SelectItem>
                  {team1 !== NONE && (
                    <SelectItem value={team1} className="text-xs text-success font-medium">
                      🏆 {teamName(team1)} (Slot 1)
                    </SelectItem>
                  )}
                  {team2 !== NONE && (
                    <SelectItem value={team2} className="text-xs text-success font-medium">
                      🏆 {teamName(team2)} (Slot 2)
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="ghost" size="sm" onClick={() => setOpen(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button
              variant="default"
              size="sm"
              onClick={handleSave}
              disabled={saving}
              className="gap-1.5 bg-warning text-warning-foreground hover:bg-warning/90"
            >
              <Wrench className="h-3.5 w-3.5" />
              {saving ? "Salvando..." : "Aplicar Correção"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
