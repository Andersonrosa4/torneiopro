import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { FileText, Copy, Download } from "lucide-react";
import { toast } from "sonner";
import { resolveTie, type TeamStats } from "@/engine/tiebreakEngine";

interface MatchLite {
  id: string;
  round: number;
  bracket_number?: number | null;
  team1_id: string | null;
  team2_id: string | null;
  winner_team_id: string | null;
  score1?: number | null;
  score2?: number | null;
  status: string;
}

interface TeamLite {
  id: string;
  player1_name: string;
  player2_name: string;
}

interface Props {
  matches: MatchLite[];
  teams: TeamLite[];
  classificationOverrides?: Record<string, string[]> | null;
}

interface Row {
  id: string;
  name: string;
  wins: number;
  losses: number;
  played: number;
  pointDiff: number;
  defeatedBy: Set<string>; // ids of teams that beat this team
}

const MEDAL_BY_POS = ["🥇", "🥈", "🥉", "🏅"];

/**
 * Painel "Relatório por Chave" — gera, em tempo real, uma classificação
 * textual e simples por chave (grupo) da fase classificatória.
 * Mostra mesmo antes do encerramento da fase de grupos.
 */
export default function GroupReportPanel({ matches, teams }: Props) {
  const [open, setOpen] = useState(false);

  const teamName = (id: string | null | undefined) => {
    if (!id) return "A definir";
    const t = teams.find((x) => x.id === id);
    return t ? `${t.player1_name} / ${t.player2_name}` : "A definir";
  };

  const brackets = useMemo(() => {
    const groupMatches = matches.filter((m) => m.round === 0);
    const map = new Map<number, MatchLite[]>();
    groupMatches.forEach((m) => {
      const b = (m.bracket_number ?? 1) as number;
      if (!map.has(b)) map.set(b, []);
      map.get(b)!.push(m);
    });
    return Array.from(map.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([bracket, ms]) => ({ bracket, matches: ms }));
  }, [matches]);

  const report = useMemo(() => {
    if (brackets.length === 0) return "";
    const sections: string[] = [];
    for (const { bracket, matches: ms } of brackets) {
      const teamIds = new Set<string>();
      ms.forEach((m) => {
        if (m.team1_id) teamIds.add(m.team1_id);
        if (m.team2_id) teamIds.add(m.team2_id);
      });
      const rows: Record<string, Row> = {};
      teamIds.forEach((id) => {
        rows[id] = {
          id,
          name: teamName(id),
          wins: 0,
          losses: 0,
          played: 0,
          pointDiff: 0,
          defeatedBy: new Set(),
        };
      });

      const headToHeadMap: Record<string, { winnerId: string; team1Id?: string; team2Id?: string; score1?: number; score2?: number }> = {};

      ms.filter((m) => m.status === "completed" && m.winner_team_id).forEach((m) => {
        const s1 = m.score1 ?? 0;
        const s2 = m.score2 ?? 0;
        if (m.team1_id && rows[m.team1_id]) {
          rows[m.team1_id].played++;
          rows[m.team1_id].pointDiff += s1 - s2;
        }
        if (m.team2_id && rows[m.team2_id]) {
          rows[m.team2_id].played++;
          rows[m.team2_id].pointDiff += s2 - s1;
        }
        const loserId =
          m.team1_id === m.winner_team_id ? m.team2_id : m.team1_id;
        if (m.winner_team_id && rows[m.winner_team_id]) rows[m.winner_team_id].wins++;
        if (loserId && rows[loserId]) {
          rows[loserId].losses++;
          if (m.winner_team_id) rows[loserId].defeatedBy.add(m.winner_team_id);
        }
        if (m.team1_id && m.team2_id && m.winner_team_id) {
          headToHeadMap[`${m.team1_id}_${m.team2_id}`] = {
            winnerId: m.winner_team_id,
            team1Id: m.team1_id,
            team2Id: m.team2_id,
            score1: s1,
            score2: s2,
          };
        }
      });

      // Ordenar via motor de desempate: vitórias → confronto direto (mini-tabela) → saldo geral
      const stats: TeamStats[] = Object.values(rows).map((r) => ({
        id: r.id,
        wins: r.wins,
        pointDiff: r.pointDiff,
      }));
      const sortedIds = resolveTie(stats, ["wins", "head_to_head", "point_diff"], headToHeadMap).map(
        (s) => s.id,
      );
      const ordered = sortedIds
        .map((id) => rows[id])
        .filter(Boolean);

      const totalPlayed = ms.filter((m) => m.status === "completed").length;
      const totalScheduled = ms.length;
      const phaseDone = totalPlayed >= totalScheduled && totalScheduled > 0;

      const letter = String.fromCharCode(64 + bracket);
      const header =
        brackets.length > 1
          ? `📋 Classificação da Chave ${letter}${phaseDone ? " (final)" : " (parcial)"}`
          : `📋 Classificação da Chave${phaseDone ? " (final)" : " (parcial)"}`;
      const lines: string[] = [header, ""];

      ordered.forEach((row, idx) => {
        const pos = idx + 1;
        const isLast = pos === ordered.length && ordered.length > 1;
        const medal = isLast && phaseDone ? "❌" : MEDAL_BY_POS[idx] ?? `${pos}º`;
        const suffix = isLast && phaseDone ? " (eliminados)" : "";
        lines.push(`${medal} ${pos}º Lugar${suffix} — ${row.name}`);
        const winsLabel = `${row.wins} ${row.wins === 1 ? "vitória" : "vitórias"}`;
        const lossesLabel =
          row.losses > 0 ? ` • ${row.losses} ${row.losses === 1 ? "derrota" : "derrotas"}` : "";
        lines.push(`   ${winsLabel}${lossesLabel}`);

        // Notas contextuais
        let note = "";
        if (pos === 1 && row.losses === 0 && row.played > 0) {
          note = "Invicto(s) na chave";
        } else if (row.losses === 1 && row.defeatedBy.size === 1) {
          const onlyLoserToId = Array.from(row.defeatedBy)[0];
          const loserToName = rows[onlyLoserToId]?.name ?? teamName(onlyLoserToId);
          note = `Perdeu apenas para ${loserToName}`;
        } else if (isLast && phaseDone) {
          note = "Eliminados da chave";
        }
        if (note) lines.push(`   ${note}`);
        lines.push("");
      });

      if (!phaseDone) {
        const remaining = totalScheduled - totalPlayed;
        lines.push(
          `⏳ ${remaining} ${remaining === 1 ? "jogo restante" : "jogos restantes"} nesta chave.`,
        );
      }

      sections.push(lines.join("\n"));
    }
    return sections.join("\n\n──────────────\n\n");
  }, [brackets, teams]);

  if (brackets.length === 0) return null;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(report);
      toast.success("Relatório copiado!");
    } catch {
      toast.error("Não foi possível copiar.");
    }
  };

  const handleDownload = () => {
    const blob = new Blob([report], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `classificacao-chaves-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="gap-1.5">
          <FileText className="h-4 w-4" />
          Relatório por Chave
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" /> Classificação por Chave
          </DialogTitle>
        </DialogHeader>
        <div className="max-h-[60vh] overflow-auto rounded-lg border border-border bg-background/60 p-4">
          <pre className="whitespace-pre-wrap font-mono text-xs leading-relaxed text-foreground">
            {report}
          </pre>
        </div>
        <div className="flex flex-wrap justify-end gap-2 pt-2">
          <Button size="sm" variant="outline" onClick={handleDownload} className="gap-1.5">
            <Download className="h-4 w-4" /> Baixar .txt
          </Button>
          <Button size="sm" onClick={handleCopy} className="gap-1.5">
            <Copy className="h-4 w-4" /> Copiar texto
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
