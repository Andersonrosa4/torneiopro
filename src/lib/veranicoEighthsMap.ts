/**
 * VERANICO EIGHTHS PAIRING — SINGLE SOURCE OF TRUTH
 *
 * Mirrored Extremes (A↔D, B↔C) for 4 grupos × 4 vagas = 8 oitavas.
 * Tanto o engine (TournamentDetail.generateBracket) quanto a visualização
 * (MatchSequenceViewer) DEVEM importar deste módulo. Não duplique.
 *
 * Convenção: groupIdx 0=A, 1=B, 2=C, 3=D. rankIdx 0=1º, 1=2º, 2=3º, 3=4º.
 */

export interface EighthsPairing {
  /** position do match (1..8) na rodada das oitavas */
  pos: number;
  /** [groupIdx, rankIdx] do team1 */
  t1: [number, number];
  /** [groupIdx, rankIdx] do team2 */
  t2: [number, number];
}

const A = 0, B = 1, C = 2, D = 3;

export const VERANICO_EIGHTHS_MAP: EighthsPairing[] = [
  { pos: 1, t1: [A, 0], t2: [D, 3] }, // 1A × 4D
  { pos: 2, t1: [B, 0], t2: [C, 3] }, // 1B × 4C
  { pos: 3, t1: [C, 0], t2: [B, 3] }, // 1C × 4B
  { pos: 4, t1: [D, 0], t2: [A, 3] }, // 1D × 4A
  { pos: 5, t1: [A, 1], t2: [D, 2] }, // 2A × 3D
  { pos: 6, t1: [B, 1], t2: [C, 2] }, // 2B × 3C
  { pos: 7, t1: [C, 1], t2: [B, 2] }, // 2C × 3B
  { pos: 8, t1: [D, 1], t2: [A, 2] }, // 2D × 3A
];

const RANK_LABEL = ["1º", "2º", "3º", "4º"];
const GROUP_LETTER = ["A", "B", "C", "D"];

/** Retorna labels visuais ["1º A", "4º D"] para a posição da oitava. */
export function getVeranicoEighthsLabels(pos: number): [string, string] | null {
  const meta = VERANICO_EIGHTHS_MAP.find((m) => m.pos === pos);
  if (!meta) return null;
  return [
    `${RANK_LABEL[meta.t1[1]]} ${GROUP_LETTER[meta.t1[0]]}`,
    `${RANK_LABEL[meta.t2[1]]} ${GROUP_LETTER[meta.t2[0]]}`,
  ];
}
