import { supabase } from "@/integrations/supabase/client";

const FUNCTION_NAME = "court-booking-api";

export async function bookingApi<T = any>(action: string, params: Record<string, any> = {}, useAuth = false): Promise<{ data: T | null; error: any }> {
  const headers: Record<string, string> = {};

  if (useAuth) {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.access_token) {
      headers["Authorization"] = `Bearer ${session.access_token}`;
    }
  }

  const { data, error } = await supabase.functions.invoke(FUNCTION_NAME, {
    body: { action, ...params },
    headers,
  });

  if (error) return { data: null, error };
  if (data?.error) return { data: null, error: { message: data.error } };
  return { data: data?.data ?? null, error: null };
}
