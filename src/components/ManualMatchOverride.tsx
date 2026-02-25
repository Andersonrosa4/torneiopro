/**
 * Manual Match Override
 * Permite ao organizador definir manualmente quem está em cada slot
 * e quem é o vencedor/perdedor — para corrigir erros de propagação.
 *
 * AGORA segue o mesmo pipeline de declareWinner():
 * a) isRoundLocked
 * b) cascade reset (se dupla eliminação)
 * c) repropagação
 * d) validateSystemRules
 * e) BYE recheck pós-cascade
 */

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Wrench, Trophy, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { organizerQuery } from "@/lib/organizerApi";
import { isRoundLocked } from "@/engine/roundLockGuard";
import { computeAggressiveCascadeReset, computePartialCascadeResetSE } from "@/lib/aggressiveCascadeReset";
import { processDoubleEliminationAdvance } from "@/lib/doubleEliminationAdvance";
import { validateSystemRules, type TournamentSnapshot } from "@/engine/systemRulesGuard";

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
  modality_id?: string | null;
  next_win_match_id?: string | null;
  next_lose_match_id?: string | null;
  is_chapeu?: boolean | null;
  score1?: number | null;
  score2?: number | null;
  bracket_number?: number | null;
}

interface ManualMatchOverrideProps {
  match: Match;
  matchNumber: number;
  teams: Team[];
  allMatches: Match[];
  tournamentFormat: string;
  tournamentId: string;
  onSaved: () => void;
}

const NONE = "__none__";

export function ManualMatchOverride({ match, matchNumber, teams, allMatches, tournamentFormat, tournamentId, onSaved }: ManualMatchOverrideProps) {
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

  /** Run systemRulesGuard on a match list */
  const runSystemRulesGuard = (matchList: Match[], label: string): boolean => {
    const snapshot: TournamentSnapshot = {
      matches: matchList.map(m => ({
        id: m.id,
        round: m.round,
        position: m.position,
        status: m.status,
        bracket_type: m.bracket_type ?? null,
        bracket_half: m.bracket_half ?? null,
        team1_id: m.team1_id,
        team2_id: m.team2_id,
        winner_team_id: m.winner_team_id,
        is_chapeu: m.is_chapeu,
        modality_id: m.modality_id,
      })),
      format: tournamentFormat,
    };
    const violations = validateSystemRules(snapshot);
    if (violations.length > 0) {
      console.error(`[ManualOverride:SystemRulesGuard:${label}] ${violations.length} violação(ões):`);
      violations.forEach(v => console.error(`  → [${v.rule}] ${v.message}`));
      toast.error(`⛔ Violação de regra: ${violations[0].message}`);
      return false;
    }
    return true;
  };

  const handleSave = async () => {
    const t1 = team1 === NONE ? null : team1;
    const t2 = team2 === NONE ? null : team2;
    const w = winner === NONE ? null : winner;

    // Aviso suave, mas NÃO bloqueia — o organizador tem liberdade total
    if (t1 && t2 && t1 === t2) {
      toast.warning("⚠️ Atenção: Time 1 e Time 2 são a mesma dupla.");
    }

    setSaving(true);
    try {
      // ══════════════════════════════════════════════════════
      // PIPELINE COMPLETO (mesmo de declareWinner)
      // ══════════════════════════════════════════════════════

      const modalityMatches = match.modality_id
        ? allMatches.filter(m => m.modality_id === match.modality_id)
        : allMatches.filter(m => m.round > 0);

      // ── (a) ROUND LOCK GUARD ──
      // Only check if setting a winner (completing a match)
      if (w) {
        const lockCheck = isRoundLocked(
          { id: match.id, round: match.round, status: match.status, bracket_type: match.bracket_type ?? null, bracket_half: match.bracket_half ?? null, modality_id: match.modality_id },
          modalityMatches.map(m => ({ id: m.id, round: m.round, status: m.status, bracket_type: m.bracket_type ?? null, bracket_half: m.bracket_half ?? null, modality_id: m.modality_id })),
        );
        if (lockCheck.locked) {
          toast.error(lockCheck.reason);
          return;
        }
      }

      // ── PRE-CHECK: System Rules Guard ──
      if (!runSystemRulesGuard(modalityMatches, 'preOverride')) {
        return;
      }

      // ── (b) CASCADE RESET if match was already completed ──
      const isReDeclaration = match.status === 'completed' && match.winner_team_id;
      const isDE = modalityMatches.some(m => m.bracket_type === 'losers');

      if (isReDeclaration) {
        const cascadePlan = isDE
          ? computeAggressiveCascadeReset(match as any, modalityMatches as any)
          : computePartialCascadeResetSE(match as any, modalityMatches as any);

        cascadePlan.log.forEach(msg => console.log(`[ManualOverride] ${msg}`));

        // SAFETY: Never delete matches — convert to resets
        if (cascadePlan.toDelete.length > 0) {
          for (const mid of cascadePlan.toDelete) {
            cascadePlan.toUpdate.push({
              matchId: mid,
              data: { team1_id: null, team2_id: null, winner_team_id: null, status: 'pending', score1: 0, score2: 0 },
            });
          }
          cascadePlan.toDelete = [];
        }

        // Execute cascade resets
        if (cascadePlan.toUpdate.length > 0) {
          try {
            await Promise.all(
              cascadePlan.toUpdate.map(async (reset) => {
                const { error } = await organizerQuery({
                  table: "matches",
                  operation: "update",
                  data: reset.data,
                  filters: { id: reset.matchId },
                });
                if (error) throw new Error(`Cascade reset failed for match ${reset.matchId}: ${error.message}`);
                console.log(`[ManualOverride:CASCADE:OK] Match ${reset.matchId} reset`);
              })
            );
            toast.info(`${cascadePlan.toUpdate.length} partida(s) resetada(s) via cascade.`);
          } catch (cascadeError: any) {
            console.error("[ManualOverride:CASCADE:FAIL]", cascadeError);
            toast.error(`❌ Falha no cascade reset: ${cascadeError.message}. Operação abortada.`);
            return;
          }
        }
      }

      // ── SAVE THE OVERRIDE ──
      const updateData: Record<string, string | null> = {
        team1_id: t1,
        team2_id: t2,
        winner_team_id: w,
      };

      if (w) {
        updateData.status = "completed";
      } else {
        updateData.status = "pending";
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

      // ── (c) REPROPAGATION (DE only, when setting a winner) ──
      if (isDE && w && isReDeclaration) {
        try {
          // Fetch fresh state after cascade + override save
          const { data: postResetData } = await organizerQuery({
            table: "matches",
            operation: "select",
            filters: { tournament_id: tournamentId },
            order: [{ column: "round" }, { column: "position" }],
          });

          if (postResetData) {
            let postResetMatches = match.modality_id
              ? (postResetData as Match[]).filter(m => m.modality_id === match.modality_id)
              : (postResetData as Match[]);

            // Get all completed matches (excluding the one being overridden)
            const completedToReplay = postResetMatches
              .filter(m => m.status === 'completed' && m.winner_team_id && m.id !== match.id)
              .sort((a, b) => a.round - b.round || a.position - b.position);

            console.log(`[ManualOverride:RE-PROPAGATION] ${completedToReplay.length} completed matches to replay`);

            for (const cm of completedToReplay) {
              const currentState = postResetMatches.find(m => m.id === cm.id);
              if (!currentState || !currentState.winner_team_id) continue;

              const cmLoserId = currentState.team1_id === currentState.winner_team_id
                ? currentState.team2_id
                : currentState.team1_id;

              const advResult = processDoubleEliminationAdvance(
                postResetMatches as any,
                currentState as any,
                currentState.winner_team_id,
                cmLoserId,
              );

              const allUpdates = [...advResult.winnerUpdates, ...advResult.loserUpdates];
              for (const upd of allUpdates) {
                const { error: repropError } = await organizerQuery({
                  table: "matches",
                  operation: "update",
                  data: upd.data,
                  filters: { id: upd.matchId },
                });
                if (repropError) {
                  throw new Error(`Repropagation failed for match ${upd.matchId}: ${repropError.message}`);
                }
                // Update local snapshot
                postResetMatches = postResetMatches.map(m =>
                  m.id === upd.matchId ? { ...m, ...upd.data } : m
                );
              }
              if (allUpdates.length > 0) {
                console.log(`[ManualOverride:RE-PROPAGATION] Match ${cm.id} (R${cm.round}P${cm.position}) → ${allUpdates.length} slot(s) filled`);
              }
            }

            // Also propagate the newly overridden match's winner
            const freshOverride = postResetMatches.find(m => m.id === match.id);
            if (freshOverride && w) {
              const overrideLoserId = freshOverride.team1_id === w ? freshOverride.team2_id : freshOverride.team1_id;
              const overrideAdv = processDoubleEliminationAdvance(
                postResetMatches as any,
                { ...freshOverride, winner_team_id: w, status: 'completed' } as any,
                w,
                overrideLoserId,
              );
              for (const upd of [...overrideAdv.winnerUpdates, ...overrideAdv.loserUpdates]) {
                const { error: advError } = await organizerQuery({
                  table: "matches",
                  operation: "update",
                  data: upd.data,
                  filters: { id: upd.matchId },
                });
                if (advError) {
                  throw new Error(`Override propagation failed for match ${upd.matchId}: ${advError.message}`);
                }
                postResetMatches = postResetMatches.map(m =>
                  m.id === upd.matchId ? { ...m, ...upd.data } : m
                );
              }
            }

            // ── (e) BYE RECHECK pós-cascade+repropagação ──
            await recheckBYEs(postResetMatches, match.modality_id);

            // ── (d) SYSTEM RULES GUARD (post-cascade+repropagation) ──
            const postOk = runSystemRulesGuard(postResetMatches, 'postOverrideRepropagation');
            if (!postOk) {
              console.warn('[ManualOverride:SystemRulesGuard] Violations after repropagation — state may need manual review');
            }
          }
        } catch (repropError: any) {
          // ── ROLLBACK: cascade reset the override match on failure ──
          console.error("[ManualOverride:RE-PROPAGATION:FAIL]", repropError);
          toast.error(`❌ Falha na repropagação: ${repropError.message}. Executando rollback...`);

          try {
            const rollbackPlan = computeAggressiveCascadeReset(
              { ...match, winner_team_id: w, status: 'completed' } as any,
              allMatches as any,
            );
            // Reset the override match itself too
            rollbackPlan.toUpdate.push({
              matchId: match.id,
              data: {
                team1_id: match.team1_id,
                team2_id: match.team2_id,
                winner_team_id: match.winner_team_id,
                status: match.status,
                score1: match.score1 ?? 0,
                score2: match.score2 ?? 0,
              },
            });
            await Promise.all(
              rollbackPlan.toUpdate.map(reset =>
                organizerQuery({
                  table: "matches",
                  operation: "update",
                  data: reset.data,
                  filters: { id: reset.matchId },
                })
              )
            );
            toast.info("🔄 Rollback executado. Estado anterior restaurado.");
          } catch (rollbackError) {
            console.error("[ManualOverride:ROLLBACK:FAIL]", rollbackError);
            toast.error("❌ Rollback falhou. Use o botão Desfazer Chaveamento para corrigir.");
          }
          onSaved();
          return;
        }
      } else if (w && !isReDeclaration && isDE) {
        // First-time winner declaration via override — propagate forward
        try {
          const { data: freshData } = await organizerQuery({
            table: "matches",
            operation: "select",
            filters: { tournament_id: tournamentId },
            order: [{ column: "round" }, { column: "position" }],
          });
          if (freshData) {
            let freshMatches = match.modality_id
              ? (freshData as Match[]).filter(m => m.modality_id === match.modality_id)
              : (freshData as Match[]);

            const freshOverride = freshMatches.find(m => m.id === match.id);
            if (freshOverride) {
              const overrideLoserId = freshOverride.team1_id === w ? freshOverride.team2_id : freshOverride.team1_id;
              const advResult = processDoubleEliminationAdvance(
                freshMatches as any,
                { ...freshOverride, winner_team_id: w, status: 'completed' } as any,
                w,
                overrideLoserId,
              );
              for (const upd of [...advResult.winnerUpdates, ...advResult.loserUpdates]) {
                const { error: advError } = await organizerQuery({
                  table: "matches",
                  operation: "update",
                  data: upd.data,
                  filters: { id: upd.matchId },
                });
                if (advError) throw new Error(`Propagation failed: ${advError.message}`);
                freshMatches = freshMatches.map(m =>
                  m.id === upd.matchId ? { ...m, ...upd.data } : m
                );
              }

              // BYE recheck after propagation
              await recheckBYEs(freshMatches, match.modality_id);
            }
          }
        } catch (propError: any) {
          console.error("[ManualOverride:PROPAGATION:FAIL]", propError);
          toast.warning(`⚠️ Propagação falhou: ${propError.message}. Verifique o chaveamento.`);
        }
      }

      toast.success(`✅ Jogo ${matchNumber} corrigido manualmente!`);
      setOpen(false);
      onSaved();
    } finally {
      setSaving(false);
    }
  };

  /** BYE recheck: detect pending matches with 1 team and no feeders */
  const recheckBYEs = async (matchList: Match[], modalityId: string | null | undefined) => {
    const isDoubleElimination = matchList.some(m => m.bracket_type === 'losers');
    let byeProcessed = true;
    while (byeProcessed) {
      byeProcessed = false;
      for (const pm of matchList) {
        if (pm.status !== 'pending') continue;
        const hasTeam1 = !!pm.team1_id;
        const hasTeam2 = !!pm.team2_id;
        if (hasTeam1 === hasTeam2) continue;

        // In DE, only auto-complete chapéu matches
        if (isDoubleElimination && !pm.is_chapeu) continue;

        const pendingFeeders = matchList.filter(
          fm => fm.status !== 'completed' && fm.id !== pm.id &&
            (fm.next_win_match_id === pm.id || fm.next_lose_match_id === pm.id)
        );

        if (pendingFeeders.length === 0) {
          const byeWinner = pm.team1_id || pm.team2_id;
          console.log(`[ManualOverride:BYE] Auto-completing match ${pm.id} (${pm.bracket_type} R${pm.round}P${pm.position}) → winner=${byeWinner}`);

          await organizerQuery({
            table: "matches",
            operation: "update",
            data: { winner_team_id: byeWinner, status: "completed", score1: 0, score2: 0 },
            filters: { id: pm.id },
          });
          pm.status = 'completed' as any;
          pm.winner_team_id = byeWinner;

          // Propagate BYE winner
          if (isDoubleElimination) {
            const byeAdv = processDoubleEliminationAdvance(matchList as any, pm as any, byeWinner!, null);
            for (const upd of [...byeAdv.winnerUpdates, ...byeAdv.loserUpdates]) {
              await organizerQuery({
                table: "matches",
                operation: "update",
                data: upd.data,
                filters: { id: upd.matchId },
              });
              const target = matchList.find(m => m.id === upd.matchId);
              if (target) Object.assign(target, upd.data);
            }
          }
          byeProcessed = true;
        }
      }
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
              Correção com validação automática: round lock, cascade, repropagação e guards.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Aviso */}
            <div className="flex items-start gap-2 rounded-lg bg-warning/10 border border-warning/30 px-3 py-2">
              <AlertTriangle className="h-4 w-4 text-warning shrink-0 mt-0.5" />
              <p className="text-[11px] text-warning/90 leading-snug">
                Esta operação executa o pipeline completo: cascade reset, repropagação e validação de regras.
                Se houver violação, a operação será revertida automaticamente.
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
                  {teams.map(t => (
                    <SelectItem key={t.id} value={t.id} className="text-xs text-success font-medium">
                      🏆 {t.player1_name} / {t.player2_name}
                    </SelectItem>
                  ))}
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
