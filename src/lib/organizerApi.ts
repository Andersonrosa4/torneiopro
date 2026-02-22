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
}

/**
 * Authenticated query — uses Supabase client directly (RLS enforces authorization).
 */
export async function organizerQuery<T = any>(options: QueryOptions): Promise<{ data: T | null; error: any }> {
  const { table, operation, data, filters, select: selectStr, order, single, maybeSingle } = options;

  try {
    if (operation === "undo_bracket") {
      return await undoBracket(options.tournament_id || options.filters?.tournament_id, options.modality_id || options.filters?.modality_id) as any;
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
            query = query.eq(key, value);
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
            query = query.eq(key, value);
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
            query = query.eq(key, value);
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
        query = query.eq(key, value);
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

async function undoBracket(tournamentId?: string, modalityId?: string): Promise<{ data: any; error: any }> {
  if (!tournamentId) return { data: null, error: { message: "tournament_id é obrigatório" } };

  const db = getClient();
  let updateQuery: any = db.from("matches").update({ next_win_match_id: null, next_lose_match_id: null }).eq("tournament_id", tournamentId);
  if (modalityId) updateQuery = updateQuery.eq("modality_id", modalityId);
  const { error: updateErr } = await updateQuery;
  if (updateErr) return { data: null, error: { message: updateErr.message } };

  let deleteQuery: any = db.from("matches").delete().eq("tournament_id", tournamentId);
  if (modalityId) deleteQuery = deleteQuery.eq("modality_id", modalityId);
  const { error: deleteErr } = await deleteQuery;
  if (deleteErr) return { data: null, error: { message: deleteErr.message } };

  const { error: classErr } = await db.from("classificacao_grupos").delete().eq("tournament_id", tournamentId);
  if (classErr) return { data: null, error: { message: classErr.message } };

  const { error: groupErr } = await db.from("groups").delete().eq("tournament_id", tournamentId);
  if (groupErr) return { data: null, error: { message: groupErr.message } };

  return { data: null, error: null };
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
