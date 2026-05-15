/**
 * Logs auditáveis do MODO VERANICO.
 *
 * Cada etapa crítica da geração (criação de shells, classificação dos
 * grupos, linking entre rodadas, preenchimento de slots) grava uma
 * linha em `bracket_audit_log` com `action` prefixado por `veranico.`
 * e `detail` jsonb contendo contagens, IDs envolvidos e qualquer
 * inconsistência detectada. Permite rastrear *exatamente* onde a
 * geração quebra quando um bug ocorrer.
 *
 * Lê-se via:
 *   SELECT created_at, action, detail
 *     FROM bracket_audit_log
 *    WHERE tournament_id = '<id>'
 *      AND action LIKE 'veranico.%'
 *    ORDER BY created_at DESC;
 */
import { organizerQuery } from "./organizerApi";

export type VeranicoAuditAction =
  | "veranico.quarters.shells_created"
  | "veranico.quarters.links_written"
  | "veranico.quarters.links_verified"
  | "veranico.quarters.fill_classification"
  | "veranico.eighths.fill_classification"
  | "veranico.error";

export interface VeranicoAuditPayload {
  tournament_id: string;
  modality_id?: string | null;
  stage_id?: string | null;
  action: VeranicoAuditAction;
  detail: Record<string, any>;
}

/**
 * Insere uma linha na tabela bracket_audit_log. Falhas de log nunca
 * derrubam o fluxo principal — apenas geram um console.warn.
 */
export async function logVeranico(payload: VeranicoAuditPayload): Promise<void> {
  try {
    const { error } = await organizerQuery({
      table: "bracket_audit_log",
      operation: "insert",
      data: {
        tournament_id: payload.tournament_id,
        modality_id: payload.modality_id ?? null,
        stage_id: payload.stage_id ?? null,
        action: payload.action,
        detail: {
          ...payload.detail,
          ts_client: new Date().toISOString(),
        },
      },
    });
    if (error) {
      console.warn("[veranicoAudit] falha ao gravar log:", payload.action, error);
    }
  } catch (e) {
    console.warn("[veranicoAudit] exceção ao gravar log:", payload.action, e);
  }
}
