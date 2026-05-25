import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";

interface ExportMeta {
  tournamentName: string;
  sport: string;
  date?: string;
  stageName?: string;
  modalityName?: string;
}

interface RankingRow {
  position: number;
  athlete_name: string;
  points: number;
  badge?: string | null;
  category?: string | null;
}

interface MatchRow {
  order: number;
  round: string;
  group: string;
  team1: string;
  team2: string;
  score: string;
  winner: string;
  status: string;
}

// ── CSV ──
function downloadCSV(filename: string, headers: string[], rows: string[][]) {
  const csv = [headers, ...rows].map((r) => r.map((c) => `"${c}"`).join(",")).join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  triggerDownload(blob, filename);
}

// ── XLSX ──
function downloadXLSX(filename: string, sheetName: string, headers: string[], rows: string[][]) {
  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  const buf = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  triggerDownload(blob, filename);
}

// ── Badge labels (sem emojis: fontes PDF padrão não suportam) ──
const BADGE_INFO: Record<string, { label: string; fill: [number, number, number]; text: [number, number, number] }> = {
  destaque: { label: "DESTAQUE", fill: [251, 191, 36], text: [69, 26, 3] },   // âmbar
  doacao:   { label: "DOAÇÃO",   fill: [244, 114, 182], text: [80, 7, 36] },  // rosa
  mvp:      { label: "CRAQUE",   fill: [56, 189, 248], text: [8, 47, 73] },   // azul
};

const CATEGORY_PT: Record<string, string> = {
  male: "Masculino",
  female: "Feminino",
  mixed: "Misto",
  misto: "Misto",
  masculino: "Masculino",
  feminino: "Feminino",
  pair: "Dupla",
  individual: "Individual",
};
const translateCategory = (c?: string | null) => {
  if (!c) return "-";
  return CATEGORY_PT[c.toLowerCase()] ?? c;
};

// ── PDF de Ranking ──
function downloadRankingPDF(filename: string, meta: ExportMeta, rankings: RankingRow[]) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();

  // Header band
  doc.setFillColor(15, 23, 42); // slate-900
  doc.rect(0, 0, pageW, 32, "F");
  doc.setFillColor(245, 158, 11); // amber accent
  doc.rect(0, 32, pageW, 1.2, "F");

  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text("RANKING DO TORNEIO", 14, 14);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.text(meta.tournamentName, 14, 22);

  doc.setFontSize(9);
  doc.setTextColor(203, 213, 225); // slate-300
  const metaLine = [
    meta.modalityName ? `Modalidade: ${meta.modalityName}` : null,
    meta.stageName ? `Etapa: ${meta.stageName}` : null,
    meta.sport ? `Esporte: ${meta.sport}` : null,
    meta.date ? `Data: ${meta.date}` : null,
  ].filter(Boolean).join("   |   ");
  if (metaLine) doc.text(metaLine, 14, 28);

  const hasBadges = rankings.some((r) => r.badge);
  const hasCategory = rankings.some((r) => r.category);

  const headers: string[] = ["#", "Atleta"];
  if (hasCategory) headers.push("Categoria");
  if (hasBadges) headers.push("Destaque");
  headers.push("Pontos");

  const badgeColIdx = hasBadges ? headers.indexOf("Destaque") : -1;
  const pointsColIdx = headers.length - 1;

  const body = rankings.map((r) => {
    const row: any[] = [
      { content: String(r.position), styles: { halign: "center", fontStyle: "bold" } },
      r.athlete_name,
    ];
    if (hasCategory) row.push(translateCategory(r.category));
    if (hasBadges) {
      const info = r.badge ? BADGE_INFO[r.badge] : null;
      row.push(info ? info.label : "");
    }
    row.push({ content: String(r.points), styles: { halign: "right", fontStyle: "bold" } });
    return row;
  });

  autoTable(doc, {
    head: [headers],
    body,
    startY: 40,
    margin: { left: 12, right: 12, bottom: 18 },
    styles: {
      font: "helvetica",
      fontSize: 10,
      cellPadding: 3,
      lineColor: [226, 232, 240],
      lineWidth: 0.2,
      textColor: [30, 41, 59],
    },
    headStyles: {
      fillColor: [30, 41, 59],
      textColor: [255, 255, 255],
      fontStyle: "bold",
      fontSize: 10,
      halign: "center",
    },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: {
      0: { cellWidth: 12, halign: "center" },
    },
    didParseCell: (data) => {
      if (data.section !== "body") return;
      const r = rankings[data.row.index];
      if (!r) return;

      // Podium colors for top 3 (apply only if cell is not the badge cell)
      const isBadgeCell = badgeColIdx >= 0 && data.column.index === badgeColIdx;
      if (!isBadgeCell) {
        if (r.position === 1) {
          data.cell.styles.fillColor = [254, 243, 199];
          data.cell.styles.textColor = [120, 53, 15];
        } else if (r.position === 2) {
          data.cell.styles.fillColor = [241, 245, 249];
          data.cell.styles.textColor = [51, 65, 85];
        } else if (r.position === 3) {
          data.cell.styles.fillColor = [254, 226, 226];
          data.cell.styles.textColor = [124, 45, 18];
        }
      }

      // Badge cell coloring overrides podium
      if (isBadgeCell && r.badge) {
        const info = BADGE_INFO[r.badge];
        if (info) {
          data.cell.styles.fillColor = info.fill;
          data.cell.styles.textColor = info.text;
          data.cell.styles.fontStyle = "bold";
          data.cell.styles.halign = "center";
        }
      }

      // Highlight points cell
      if (data.column.index === pointsColIdx) {
        data.cell.styles.halign = "right";
        data.cell.styles.fontStyle = "bold";
      }
    },
    didDrawPage: () => {
      const pageNumber = (doc as any).internal.getNumberOfPages
        ? (doc as any).internal.getNumberOfPages()
        : doc.getNumberOfPages();
      doc.setFontSize(8);
      doc.setTextColor(148, 163, 184);
      doc.setFont("helvetica", "normal");
      const footerY = pageH - 8;
      doc.text(`Gerado em ${new Date().toLocaleString("pt-BR")}`, 12, footerY);
      doc.text(`Página ${pageNumber}`, pageW - 12, footerY, { align: "right" });
      doc.text("torneio.pro", pageW / 2, footerY, { align: "center" });
    },
  });

  // Legend (if badges present)
  if (hasBadges) {
    const finalY = (doc as any).lastAutoTable?.finalY ?? 40;
    let y = finalY + 6;
    if (y > pageH - 20) {
      doc.addPage();
      y = 20;
    }
    doc.setFontSize(8);
    doc.setTextColor(71, 85, 105);
    doc.setFont("helvetica", "bold");
    doc.text("Legenda de Destaques:", 14, y);
    let x = 50;
    Object.entries(BADGE_INFO).forEach(([, info]) => {
      doc.setFillColor(...info.fill);
      doc.roundedRect(x, y - 3.5, 22, 5, 1, 1, "F");
      doc.setTextColor(...info.text);
      doc.text(info.label, x + 11, y, { align: "center", baseline: "middle" } as any);
      x += 28;
    });
  }

  doc.save(filename);
}

// ── PDF genérico (sequência de partidas) ──
function downloadGenericPDF(filename: string, title: string, meta: ExportMeta, headers: string[], rows: string[][]) {
  const doc = new jsPDF();
  doc.setFontSize(16);
  doc.text(title, 14, 20);
  doc.setFontSize(10);
  doc.text(`Torneio: ${meta.tournamentName}`, 14, 28);
  doc.text(`Esporte: ${meta.sport}`, 14, 34);
  if (meta.date) doc.text(`Data: ${meta.date}`, 14, 40);

  autoTable(doc, {
    head: [headers],
    body: rows,
    startY: meta.date ? 46 : 40,
    styles: { fontSize: 8 },
    headStyles: { fillColor: [41, 128, 185] },
  });

  doc.save(filename);
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ── Public API ──

export function exportRankings(
  format: "pdf" | "xlsx" | "csv",
  rankings: RankingRow[],
  meta: ExportMeta
) {
  const hasBadges = rankings.some((r) => r.badge);
  const hasCategory = rankings.some((r) => r.category);
  const badgeLabel = (b?: string | null) =>
    b ? (BADGE_INFO[b]?.label ?? b.toUpperCase()) : "";

  const headers = ["#", "Atleta"];
  if (hasCategory) headers.push("Categoria");
  if (hasBadges) headers.push("Destaque");
  headers.push("Pontos");

  const rows = rankings.map((r) => {
    const row = [String(r.position), r.athlete_name];
    if (hasCategory) row.push(translateCategory(r.category));
    if (hasBadges) row.push(badgeLabel(r.badge));
    row.push(String(r.points));
    return row;
  });

  const base = `ranking_${meta.tournamentName.replace(/\s+/g, "_")}`;

  switch (format) {
    case "csv":
      downloadCSV(`${base}.csv`, headers, rows);
      break;
    case "xlsx":
      downloadXLSX(`${base}.xlsx`, "Ranking", headers, rows);
      break;
    case "pdf":
      downloadRankingPDF(`${base}.pdf`, meta, rankings);
      break;
  }
}

export function exportMatchSequence(
  format: "pdf" | "xlsx" | "csv",
  matches: MatchRow[],
  meta: ExportMeta
) {
  const headers = ["#", "Fase", "Grupo/Chave", "Dupla 1", "Dupla 2", "Placar", "Vencedor", "Status"];
  const rows = matches.map((m) => [
    String(m.order),
    m.round,
    m.group,
    m.team1,
    m.team2,
    m.score,
    m.winner,
    m.status,
  ]);
  const base = `sequencia_${meta.tournamentName.replace(/\s+/g, "_")}`;

  switch (format) {
    case "csv":
      downloadCSV(`${base}.csv`, headers, rows);
      break;
    case "xlsx":
      downloadXLSX(`${base}.xlsx`, "Sequência", headers, rows);
      break;
    case "pdf":
      downloadGenericPDF(`${base}.pdf`, "Sequência de Partidas", meta, headers, rows);
      break;
  }
}
