import { supabase } from "@/integrations/supabase/client";

/** Retorna o cliente Supabase singleton */
function getClient() {
  return supabase;
}

interface QueryOptions {
  table: string;
  operation: "select" | "insert" | "update" | "delete" | "undo_bracket" | "reset_results";
  data?: any;
  filters?: Record<string, any>;
  select?: string;
  order?: Array<{ column: string; ascending?: boolean }> | { column: string; ascending?: boolean };
  single?: boolean;
  maybeSingle?: boolean;
  tournament_id?: string;
  modality_id?: string;
  stage_id?: string | null;
}

/**
 * Authenticated query — uses Supabase client directly (RLS enforces authorization).
 */
export async function organizerQuery<T = any>(options: QueryOptions): Promise<{ data: T | null; error: any }> {
  const { table, operation, data, filters, select: selectStr, order, single, maybeSingle } = options;

  try {
    if (operation === "undo_bracket") {
      const hasStageFilter = Object.prototype.hasOwnProperty.call(options, "stage_id") || Object.prototype.hasOwnProperty.call(options.filters ?? {}, "stage_id");
      const stageId = Object.prototype.hasOwnProperty.call(options, "stage_id") ? options.stage_id : options.filters?.stage_id;
      return await undoBracket(options.tournament_id || options.filters?.tournament_id, options.modality_id || options.filters?.modality_id, hasStageFilter ? stageId : undefined) as any;
    }
    if (operation === "reset_results") {
      return await resetResults(options.tournament_id || options.filters?.tournament_id, options.modality_id || options.filters?.modality_id) as any;
    }

    const db = getClient();
    let query: any;

    switch (operation) {
      case "select": {
        query = (db.from as any)(table).select(selectStr || "*");
        if (filters) {
          for (const [key, value] of Object.entries(filters)) {
            query = value === null ? query.is(key, null) : query.eq(key, value);
          }
        }
        if (order) {
          const orders = Array.isArray(order) ? order : [order];
          for (const o of orders) {
            query = query.order(o.column, { ascending: o.ascending ?? true });
          }
        }
        if (single) query = query.single();
        if (maybeSingle) query = query.maybeSingle();
        break;
      }
      case "insert": {
        query = (db.from as any)(table).insert(data);
        if (selectStr) query = query.select(selectStr);
        if (single) query = query.single();
        break;
      }
      case "update": {
        query = (db.from as any)(table).update(data);
        if (filters) {
          for (const [key, value] of Object.entries(filters)) {
            query = value === null ? query.is(key, null) : query.eq(key, value);
          }
        }
        if (selectStr) query = query.select(selectStr);
        if (single) query = query.single();
        break;
      }
      case "delete": {
        query = (db.from as any)(table).delete();
        if (filters) {
          for (const [key, value] of Object.entries(filters)) {
            query = value === null ? query.is(key, null) : query.eq(key, value);
          }
        }
        break;
      }
      default:
        return { data: null, error: { message: "Operação não suportada" } };
    }

    const { data: result, error } = await query;
    if (error) return { data: null, error: { message: error.message } };
    return { data: (result ?? null) as T | null, error: null };
  } catch (err: any) {
    return { data: null, error: { message: err.message || "Erro desconhecido" } };
  }
}

/**
 * Public query — no authentication required.
 */
export async function publicQuery<T = any>(options: Omit<QueryOptions, "operation" | "data"> & { operation?: "select" }): Promise<{ data: T | null; error: any }> {
  const { table, filters, select: selectStr, order, single, maybeSingle } = options;

  try {
    const db = getClient();
    let query: any = (db.from as any)(table).select(selectStr || "*");

    if (filters) {
      for (const [key, value] of Object.entries(filters)) {
        query = value === null ? query.is(key, null) : query.eq(key, value);
      }
    }
    if (order) {
      const orders = Array.isArray(order) ? order : [order];
      for (const o of orders) {
        query = query.order(o.column, { ascending: o.ascending ?? true });
      }
    }
    if (single) query = query.single();
    if (maybeSingle) query = query.maybeSingle();

    const { data: result, error } = await query;
    if (error) return { data: null, error: { message: error.message } };
    return { data: (result ?? null) as T | null, error: null };
  } catch (err: any) {
    return { data: null, error: { message: err.message || "Erro desconhecido" } };
  }
}

async function undoBracket(tournamentId?: string, modalityId?: string, stageId?: string | null): Promise<{ data: any; error: any }> {
  if (!tournamentId) return { data: null, error: { message: "tournament_id é obrigatório" } };

  const db = getClient();

  // ═══ PROTEÇÃO 1: snapshot pré-destruição ═══
  // Buscar EXATAMENTE o conjunto que será apagado para backup.
  let scopeQuery: any = db.from("matches").select("*").eq("tournament_id", tournamentId);
  if (modalityId) scopeQuery = scopeQuery.eq("modality_id", modalityId);
  if (stageId !== undefined) scopeQuery = stageId === null ? scopeQuery.is("stage_id", null) : scopeQuery.eq("stage_id", stageId);
  const { data: scopeMatches, error: scopeErr } = await scopeQuery;
  if (scopeErr) return { data: null, error: { message: `Falha ao ler escopo: ${scopeErr.message}` } };

  // ═══ PROTEÇÃO 2: guard de escopo cruzado ═══
  // Se foi passado modality_id ou stage_id, garantir que NENHUMA partida fora desse escopo seja afetada.
  if (modalityId || stageId !== undefined) {
    const ids = (scopeMatches || []).map((m: any) => m.id);
    const { data: allTournamentMatches } = await db.from("matches").select("id, modality_id, stage_id").eq("tournament_id", tournamentId);
    const outOfScope = (allTournamentMatches || []).filter((m: any) =>
      !ids.includes(m.id) && (
        (modalityId && m.modality_id === modalityId && (stageId === undefined || m.stage_id === stageId)) ||
        false
      )
    );
    if (outOfScope.length > 0) {
      return { data: null, error: { message: `[GUARD] Operação bloqueada: ${outOfScope.length} partidas fora do escopo seriam afetadas.` } };
    }
  }

  // Snapshot dos grupos/classificacao só quando o escopo é amplo (sem modality/stage), pois essas tabelas não têm essas colunas.
  const isWideScope = !modalityId && stageId === undefined;
  let groupsSnap: any = null;
  let classSnap: any = null;
  if (isWideScope) {
    const { data: g } = await db.from("groups").select("*").eq("tournament_id", tournamentId);
    const { data: c } = await db.from("classificacao_grupos").select("*").eq("tournament_id", tournamentId);
    groupsSnap = g;
    classSnap = c;
  }

  // Persiste backup ANTES de qualquer delete.
  if ((scopeMatches?.length ?? 0) > 0 || isWideScope) {
    const { error: backupErr } = await db.from("bracket_backups").insert({
      tournament_id: tournamentId,
      modality_id: modalityId ?? null,
      stage_id: stageId ?? null,
      reason: "undo_bracket",
      matches_snapshot: scopeMatches ?? [],
      groups_snapshot: groupsSnap,
      classificacao_snapshot: classSnap,
      match_count: scopeMatches?.length ?? 0,
    });
    if (backupErr) {
      console.warn("[BACKUP] Falha ao salvar snapshot:", backupErr.message);
      return { data: null, error: { message: `Backup obrigatório falhou: ${backupErr.message}. Operação abortada para proteger seus dados.` } };
    }
  }

  // Limpa referências de avanço para evitar FK violation.
  let updateQuery: any = db.from("matches").update({ next_win_match_id: null, next_lose_match_id: null }).eq("tournament_id", tournamentId);
  if (modalityId) updateQuery = updateQuery.eq("modality_id", modalityId);
  if (stageId !== undefined) updateQuery = stageId === null ? updateQuery.is("stage_id", null) : updateQuery.eq("stage_id", stageId);
  const { error: updateErr } = await updateQuery;
  if (updateErr) return { data: null, error: { message: updateErr.message } };

  let deleteQuery: any = db.from("matches").delete().eq("tournament_id", tournamentId);
  if (modalityId) deleteQuery = deleteQuery.eq("modality_id", modalityId);
  if (stageId !== undefined) deleteQuery = stageId === null ? deleteQuery.is("stage_id", null) : deleteQuery.eq("stage_id", stageId);
  const { error: deleteErr } = await deleteQuery;
  if (deleteErr) return { data: null, error: { message: deleteErr.message } };

  // ═══ PROTEÇÃO 3: groups/classificacao só são apagados em escopo amplo ═══
  // (tabelas não têm modality_id/stage_id, então deletar com escopo limitado destruiria dados de outras modalidades/etapas).
  if (isWideScope) {
    const { error: classErr } = await db.from("classificacao_grupos").delete().eq("tournament_id", tournamentId);
    if (classErr) return { data: null, error: { message: classErr.message } };
    const { error: groupErr } = await db.from("groups").delete().eq("tournament_id", tournamentId);
    if (groupErr) return { data: null, error: { message: groupErr.message } };
  }

  return { data: { backed_up: scopeMatches?.length ?? 0 }, error: null };
}

async function resetResults(tournamentId?: string, modalityId?: string): Promise<{ data: any; error: any }> {
  if (!tournamentId) return { data: null, error: { message: "tournament_id é obrigatório" } };

  const db = getClient();
  let query: any = db.from("matches").update({
    score1: 0, score2: 0, winner_team_id: null, winner_id: null, status: "pending" as const,
  }).eq("tournament_id", tournamentId);
  if (modalityId) query = query.eq("modality_id", modalityId);

  const { error } = await query;
  if (error) return { data: null, error: { message: error.message } };
  return { data: null, error: null };
}
