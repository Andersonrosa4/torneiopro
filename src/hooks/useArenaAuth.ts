import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

export function useArenaAuth() {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isArenaAdmin, setIsArenaAdmin] = useState(false);
  const [arenaId, setArenaId] = useState<string | null>(null);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      const u = session?.user ?? null;
      setUser(u);
      if (u) {
        const { data } = await supabase.from("arena_admins").select("arena_id").eq("user_id", u.id).maybeSingle();
        setIsArenaAdmin(!!data);
        setArenaId(data?.arena_id ?? null);
      } else {
        setIsArenaAdmin(false);
        setArenaId(null);
      }
      setLoading(false);
    });

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      const u = session?.user ?? null;
      setUser(u);
      if (u) {
        const { data } = await supabase.from("arena_admins").select("arena_id").eq("user_id", u.id).maybeSingle();
        setIsArenaAdmin(!!data);
        setArenaId(data?.arena_id ?? null);
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signIn = async (email: string, password: string) => {
    return supabase.auth.signInWithPassword({ email, password });
  };

  const signUp = async (email: string, password: string, displayName: string) => {
    return supabase.auth.signUp({
      email,
      password,
      options: {
        data: { display_name: displayName },
        emailRedirectTo: window.location.origin,
      },
    });
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setIsArenaAdmin(false);
    setArenaId(null);
  };

  return { user, loading, isArenaAdmin, arenaId, signIn, signUp, signOut };
}
