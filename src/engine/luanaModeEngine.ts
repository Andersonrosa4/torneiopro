/**
 * Modo Luana — Grupos + Repescagem Cruzada (Vôlei de Praia)
 *
 * Engine puro — sem dependências de UI, banco ou React.
 *
 * REGRA DE FORMATO:
 *   • Grupos via Snake (já existente no projeto).
 *   • 1º colocado de cada grupo passa DIRETO para a próxima fase eliminatória.
 *   • 2º e 3º disputam vagas remanescentes em CRUZAMENTO ESPELHADO entre chaves:
 *       - 2A × 3D  (extremos)
 *       - 2D × 3A
 *       - 2B × 3C  (centrais)
 *       - 2C × 3B
 *   • Quando o torneio inicia em OITAVAS (16 vagas), o sistema delega ao
 *     fluxo padrão "passa N primeiros" sem repescagem cruzada — esta engine
 *     só cuida do caminho QUARTAS-com-repescagem.
 */

export type LuanaStartsAt = "quarters" | "eighths";

export interface LuanaPairInput {
  /** Quantidade de grupos (mínimo 2). Padrão Luana = 4. */
  groupCount: number;
  /** Onde a fase eliminatória começa. */
  startsAt: LuanaStartsAt;
}

export interface LuanaPair {
  team1: { groupIdx: number; rank: number };
  team2: { groupIdx: number; rank: number };
}

/**
 * Retorna a quantidade de vagas da primeira rodada eliminatória.
 */
export function getLuanaKnockoutSize(input: LuanaPairInput): number {
  return input.startsAt === "quarters" ? 8 : 16;
}

/**
 * Retorna os ranks (posição no grupo) que passam DIRETO para a fase eliminatória.
 *   • Quartas: apenas 1º (4 vagas diretas + 4 da repescagem = 8)
 *   • Oitavas: 1º a 4º (16 vagas, sem repescagem cruzada)
 */
export function getLuanaDirectAdvancingRanks(input: LuanaPairInput): number[] {
  return input.startsAt === "quarters" ? [1] : [1, 2, 3, 4];
}

/**
 * Gera os pares de REPESCAGEM CRUZADA (round 1) no formato Luana.
 *
 * Para `startsAt='quarters'`:
 *   • 4 grupos → 4 pares: (2A×3D, 2D×3A, 2B×3C, 2C×3B)
 *
 * Para `startsAt='eighths'`:
 *   • Sem repescagem — vagas das oitavas são preenchidas direto pelos
 *     1º-4º colocados. Retorna lista vazia.
 */
export function generateLuanaRepechagePairs(input: LuanaPairInput): LuanaPair[] {
  const { groupCount, startsAt } = input;
  if (groupCount < 2) return [];
  if (startsAt === "eighths") return [];

  const pairs: LuanaPair[] = [];

  // Cruzamento espelhado: chave i (esquerda) com chave (groupCount-1-i) (direita)
  for (let i = 0; i < Math.floor(groupCount / 2); i++) {
    const left = i;
    const right = groupCount - 1 - i;
    if (left === right) continue;

    // 2L × 3R
    pairs.push({
      team1: { groupIdx: left, rank: 2 },
      team2: { groupIdx: right, rank: 3 },
    });
    // 2R × 3L
    pairs.push({
      team1: { groupIdx: right, rank: 2 },
      team2: { groupIdx: left, rank: 3 },
    });
  }

  return pairs;
}

/**
 * Calcula em qual posição da rodada eliminatória seguinte (quartas) o vencedor
 * de cada match de repescagem deve cair.
 *
 * Pareamento atualizado das quartas (4 matches, posições 1-4):
 *   Pos 1 (Jogo 29): 1A vs Vencedor(2D × 3A)   ← pair index 1
 *   Pos 2 (Jogo 30): 1B vs Vencedor(2B × 3C)   ← pair index 2
 *   Pos 3 (Jogo 31): 1C vs Vencedor(2A × 3D)   ← pair index 0
 *   Pos 4 (Jogo 32): 1D vs Vencedor(2C × 3B)   ← pair index 3
 *
 * Retorna a posição da quartas em que o vencedor do match `repechagePairIdx`
 * deve ser inserido (slot team2_id).
 */
export function getLuanaRepechageWinnerSlot(
  repechagePairIdx: number,
  pairs: LuanaPair[],
  groupCount: number,
): { quarterPosition: number; slot: "team2" } {
  const pair = pairs[repechagePairIdx];
  if (!pair) {
    throw new Error(`[LuanaEngine] Par de repescagem ${repechagePairIdx} inexistente`);
  }
  // Mapa fixo (groupCount=4): pair index → quarterPosition
  //   0 (2A×3D) → Q3 ; 1 (2D×3A) → Q1 ; 2 (2B×3C) → Q2 ; 3 (2C×3B) → Q4
  const idxToQuarter: Record<number, number> = { 0: 3, 1: 1, 2: 2, 3: 4 };
  const quarterPosition = idxToQuarter[repechagePairIdx];
  if (!quarterPosition || quarterPosition < 1 || quarterPosition > groupCount) {
    throw new Error(
      `[LuanaEngine] Posição da quartas (${quarterPosition}) fora do intervalo válido [1..${groupCount}]`,
    );
  }
  return { quarterPosition, slot: "team2" };
}


/**
 * Validação rápida pré-geração para garantir invariantes do Modo Luana.
 *
 * Lança erro descritivo quando configuração é inválida.
 */
export function validateLuanaConfig(
  teamCount: number,
  input: LuanaPairInput,
): void {
  if (input.groupCount < 2) {
    throw new Error("[LuanaEngine] Mínimo de 2 grupos.");
  }
  if (input.startsAt === "quarters") {
    // Cada grupo precisa de pelo menos 3 times (1º direto + 2º+3º para cruzamento)
    const minTeams = input.groupCount * 3;
    if (teamCount < minTeams) {
      throw new Error(
        `[LuanaEngine] Para iniciar nas Quartas com ${input.groupCount} chaves, são necessárias ao menos ${minTeams} duplas (3 por grupo).`,
      );
    }
  } else {
    // Oitavas: cada grupo precisa pelo menos 4 times (passam 4)
    const minTeams = input.groupCount * 4;
    if (teamCount < minTeams) {
      throw new Error(
        `[LuanaEngine] Para iniciar nas Oitavas com ${input.groupCount} chaves, são necessárias ao menos ${minTeams} duplas (4 por grupo).`,
      );
    }
  }
}
