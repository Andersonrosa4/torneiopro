import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";

interface ExportMeta {
  tournamentName: string;
  sport: string;
  date?: string;
}

interface RankingRow {
  position: number;
  athlete_name: string;
  points: number;
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

// ── PDF ──
function downloadPDF(filename: string, title: string, meta: ExportMeta, headers: string[], rows: string[][]) {
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
  const headers = ["#", "Atleta", "Pontos"];
  const rows = rankings.map((r) => [String(r.position), r.athlete_name, String(r.points)]);
  const base = `ranking_${meta.tournamentName.replace(/\s+/g, "_")}`;

  switch (format) {
    case "csv":
      downloadCSV(`${base}.csv`, headers, rows);
      break;
    case "xlsx":
      downloadXLSX(`${base}.xlsx`, "Ranking", headers, rows);
      break;
    case "pdf":
      downloadPDF(`${base}.pdf`, "Ranking", meta, headers, rows);
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
      downloadPDF(`${base}.pdf`, "Sequência de Partidas", meta, headers, rows);
      break;
  }
}
