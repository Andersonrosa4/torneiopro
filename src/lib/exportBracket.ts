import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { toPng } from "html-to-image";

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

interface CapturedImage {
  dataUrl: string;
  width: number; // CSS px
  height: number; // CSS px
}

/**
 * Captura o elemento DOM como PNG fiel ao layout (usa html-to-image,
 * que serializa SVG e respeita CSS muito melhor que html2canvas).
 * Expande temporariamente containers com overflow/transform para que
 * a imagem contenha a árvore inteira.
 */
async function captureElement(el: HTMLElement): Promise<CapturedImage> {
  const mutated: { node: HTMLElement; prev: Partial<CSSStyleDeclaration> }[] = [];
  const all = [el, ...Array.from(el.querySelectorAll<HTMLElement>("*"))];
  for (const node of all) {
    const cs = window.getComputedStyle(node);
    const clipsX = cs.overflowX === "auto" || cs.overflowX === "scroll" || cs.overflowX === "hidden";
    const clipsY = cs.overflowY === "auto" || cs.overflowY === "scroll" || cs.overflowY === "hidden";
    const hasTransform = cs.transform && cs.transform !== "none";
    if (!clipsX && !clipsY && !hasTransform) continue;
    mutated.push({
      node,
      prev: {
        overflow: node.style.overflow,
        overflowX: node.style.overflowX,
        overflowY: node.style.overflowY,
        maxWidth: node.style.maxWidth,
        maxHeight: node.style.maxHeight,
        width: node.style.width,
        height: node.style.height,
        transform: node.style.transform,
      } as Partial<CSSStyleDeclaration>,
    });
    node.style.overflow = "visible";
    node.style.overflowX = "visible";
    node.style.overflowY = "visible";
    node.style.maxWidth = "none";
    node.style.maxHeight = "none";
    if (clipsX && node.scrollWidth > node.clientWidth) {
      node.style.width = `${node.scrollWidth}px`;
    }
    if (clipsY && node.scrollHeight > node.clientHeight) {
      node.style.height = `${node.scrollHeight}px`;
    }
    if (hasTransform) node.style.transform = "none";
  }

  await new Promise((r) => requestAnimationFrame(() => r(null)));
  await new Promise((r) => requestAnimationFrame(() => r(null)));

  const fullW = el.scrollWidth;
  const fullH = el.scrollHeight;

  try {
    const dataUrl = await toPng(el, {
      pixelRatio: 2,
      backgroundColor: "#ffffff",
      cacheBust: true,
      width: fullW,
      height: fullH,
      style: {
        transform: "none",
        transformOrigin: "top left",
        margin: "0",
      },
    });
    return { dataUrl, width: fullW, height: fullH };
  } finally {
    for (const { node, prev } of mutated) {
      Object.assign(node.style, prev);
    }
  }
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

/** Adiciona a sequência de partidas como tabela. */
function addSequenceTable(doc: jsPDF, matches: MatchRow[], startY: number) {
  const headers = ["#", "Fase", "Grupo/Chave", "Dupla 1", "Dupla 2", "Placar", "Vencedor", "Status"];
  const rows = matches.map((m) => [
    String(m.order), m.round, m.group, m.team1, m.team2, m.score, m.winner, m.status,
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
 * Cria um PDF cuja página tem o tamanho exato da árvore capturada,
 * garantindo que a chave aparece inteira sem corte.
 */
function buildBracketPdf(img: CapturedImage, meta: BracketExportMeta): jsPDF {
  const PX_PER_MM = 3.7795;
  const HEADER_MM = 32;
  const MARGIN_MM = 6;

  const imgWmm = img.width / PX_PER_MM;
  const imgHmm = img.height / PX_PER_MM;

  const pageW = imgWmm + MARGIN_MM * 2;
  const pageH = imgHmm + HEADER_MM + MARGIN_MM;

  const orientation = pageW >= pageH ? "landscape" : "portrait";
  const doc = new jsPDF({ orientation, unit: "mm", format: [pageW, pageH] });

  drawHeader(doc, "Chaveamento — Árvore", meta);
  doc.addImage(img.dataUrl, "PNG", MARGIN_MM, HEADER_MM, imgWmm, imgHmm, undefined, "FAST");
  return doc;
}

export async function exportBracketPdf(el: HTMLElement, meta: BracketExportMeta) {
  const canvas = await captureElement(el);
  const doc = buildBracketPdf(canvas, meta);
  const base = sanitizeFileName(`chaveamento_${meta.tournamentName}`);
  doc.save(`${base}.pdf`);
}

export function exportSequencePdf(matches: MatchRow[], meta: BracketExportMeta) {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const y = drawHeader(doc, "Sequência de Partidas", meta);
  addSequenceTable(doc, matches, y);
  const base = sanitizeFileName(`sequencia_${meta.tournamentName}`);
  doc.save(`${base}.pdf`);
}

/**
 * Exporta CHAVE (página 1, tamanho real) + SEQUÊNCIA (página A3) num PDF.
 */
export async function exportBracketAndSequencePdf(
  el: HTMLElement,
  matches: MatchRow[],
  meta: BracketExportMeta,
) {
  const canvas = await captureElement(el);
  const doc = buildBracketPdf(canvas, meta);
  doc.addPage("a3", "landscape");
  const y2 = drawHeader(doc, "Sequência de Partidas", meta);
  addSequenceTable(doc, matches, y2);
  const base = sanitizeFileName(`torneio_${meta.tournamentName}`);
  doc.save(`${base}.pdf`);
}

function sanitizeFileName(s: string) {
  return s.replace(/\s+/g, "_").replace(/[^a-zA-Z0-9_\-]/g, "");
}
