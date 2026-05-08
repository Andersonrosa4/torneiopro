import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import html2canvas from "html2canvas";

interface BracketExportMeta {
  tournamentName: string;
  sport: string;
  date?: string;
  modalityName?: string;
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

/**
 * Captura um elemento DOM como imagem PNG em alta resolução
 * (escala 2x para permitir zoom no PDF sem perder qualidade).
 */
async function captureElement(el: HTMLElement): Promise<HTMLCanvasElement> {
  // Resolve a real background color from the element/ancestors
  const bg = "#ffffff";
  return html2canvas(el, {
    scale: 2,
    backgroundColor: bg,
    useCORS: true,
    logging: false,
    windowWidth: el.scrollWidth,
    windowHeight: el.scrollHeight,
    width: el.scrollWidth,
    height: el.scrollHeight,
  });
}

/** Adiciona cabeçalho padrão na primeira página do doc. */
function drawHeader(doc: jsPDF, title: string, meta: BracketExportMeta, y = 14) {
  doc.setFontSize(14);
  doc.setTextColor(20, 20, 20);
  doc.text(title, 14, y);
  doc.setFontSize(9);
  doc.setTextColor(80, 80, 80);
  let line = y + 6;
  doc.text(`Torneio: ${meta.tournamentName}`, 14, line);
  line += 5;
  if (meta.modalityName) {
    doc.text(`Modalidade: ${meta.modalityName}`, 14, line);
    line += 5;
  }
  doc.text(`Esporte: ${meta.sport}`, 14, line);
  line += 5;
  if (meta.date) {
    doc.text(`Data do evento: ${meta.date}`, 14, line);
    line += 5;
  }
  const now = new Date();
  const stamp = `${String(now.getDate()).padStart(2, "0")}/${String(now.getMonth() + 1).padStart(2, "0")}/${now.getFullYear()} ${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  doc.text(`Atualizado em: ${stamp}`, 14, line);
  return line + 4;
}

/**
 * Insere a imagem do bracket no PDF. Usa landscape em A3 para caber a
 * árvore completa em alta resolução, permitindo zoom no leitor de PDF.
 */
async function addBracketImageToPdf(doc: jsPDF, canvas: HTMLCanvasElement, startY: number) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 8;

  const availW = pageWidth - margin * 2;
  const availH = pageHeight - startY - margin;

  const imgRatio = canvas.width / canvas.height;
  let drawW = availW;
  let drawH = drawW / imgRatio;

  if (drawH > availH) {
    drawH = availH;
    drawW = drawH * imgRatio;
  }

  const x = (pageWidth - drawW) / 2;
  const dataUrl = canvas.toDataURL("image/png");
  doc.addImage(dataUrl, "PNG", x, startY, drawW, drawH, undefined, "FAST");
}

/** Adiciona a sequência de partidas como tabela (para PDF combinado). */
function addSequenceTable(doc: jsPDF, matches: MatchRow[], startY: number) {
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
  autoTable(doc, {
    head: [headers],
    body: rows,
    startY,
    styles: { fontSize: 7, cellPadding: 1.5 },
    headStyles: { fillColor: [41, 128, 185], textColor: 255 },
    margin: { left: 8, right: 8 },
  });
}

/**
 * Exporta APENAS o chaveamento (árvore) como PDF em alta resolução.
 * O PDF é gerado em A3 paisagem para caber a árvore inteira sem
 * perder qualidade ao dar zoom.
 */
export async function exportBracketPdf(
  el: HTMLElement,
  meta: BracketExportMeta,
) {
  const canvas = await captureElement(el);
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a3" });
  const y = drawHeader(doc, "Chaveamento — Árvore", meta);
  await addBracketImageToPdf(doc, canvas, y);
  const base = sanitizeFileName(`chaveamento_${meta.tournamentName}`);
  doc.save(`${base}.pdf`);
}

/**
 * Exporta APENAS a sequência (tabela) como PDF.
 */
export function exportSequencePdf(matches: MatchRow[], meta: BracketExportMeta) {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const y = drawHeader(doc, "Sequência de Partidas", meta);
  addSequenceTable(doc, matches, y);
  const base = sanitizeFileName(`sequencia_${meta.tournamentName}`);
  doc.save(`${base}.pdf`);
}

/**
 * Exporta CHAVE + SEQUÊNCIA num único PDF.
 * Página 1 (A3 paisagem): árvore. Páginas seguintes: tabela de sequência.
 */
export async function exportBracketAndSequencePdf(
  el: HTMLElement,
  matches: MatchRow[],
  meta: BracketExportMeta,
) {
  const canvas = await captureElement(el);
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a3" });
  const y = drawHeader(doc, "Chaveamento — Árvore", meta);
  await addBracketImageToPdf(doc, canvas, y);

  // Sequence on next page (a3 landscape too — mais espaço)
  doc.addPage("a3", "landscape");
  const y2 = drawHeader(doc, "Sequência de Partidas", meta);
  addSequenceTable(doc, matches, y2);

  const base = sanitizeFileName(`torneio_${meta.tournamentName}`);
  doc.save(`${base}.pdf`);
}

function sanitizeFileName(s: string) {
  return s.replace(/\s+/g, "_").replace(/[^a-zA-Z0-9_\-]/g, "");
}
