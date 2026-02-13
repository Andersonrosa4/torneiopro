import { supabase } from "@/integrations/supabase/client";

interface QueryOptions {
  table: string;
  operation: "select" | "insert" | "update" | "delete" | "undo_bracket" | "reset_results";
  data?: any;
  filters?: Record<string, any>;
  select?: string;
  order?: Array<{ column: string; ascending?: boolean }> | { column: string; ascending?: boolean };
  single?: boolean;
  maybeSingle?: boolean;
}

export async function organizerQuery<T = any>(options: QueryOptions): Promise<{ data: T | null; error: any }> {
  const token = sessionStorage.getItem("organizer_token");
  const organizerId = sessionStorage.getItem("organizer_id");

  if (!token || !organizerId) {
    return { data: null, error: { message: "Não autenticado" } };
  }

  const { data, error } = await supabase.functions.invoke("organizer-api", {
    body: { token, organizerId, ...options },
  });

  if (error) {
    return { data: null, error };
  }

  if (data?.error) {
    return { data: null, error: { message: data.error } };
  }

  return { data: data?.data ?? null, error: null };
}
