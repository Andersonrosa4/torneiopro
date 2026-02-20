import { createContext, useContext, useState, useEffect, ReactNode, useMemo, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

interface User {
  id: string;
}

interface AuthContextType {
  user: User | null;
  organizerId: string | null;
  userRole: string | null;
  isAuthenticated: boolean;
  isAdmin: boolean;
  loading: boolean;
  login: (session: { access_token: string; refresh_token: string }, organizerId: string, role?: string) => Promise<void>;
  logout: () => void;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  organizerId: null,
  userRole: null,
  isAuthenticated: false,
  isAdmin: false,
  loading: true,
  login: async () => {},
  logout: () => {},
  signOut: async () => {},
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [organizerId, setOrganizerId] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Listen to auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (session?.user) {
        setUser({ id: session.user.id });
        // Fetch organizer details from DB
        const { data: org } = await supabase
          .from("organizers")
          .select("id, role")
          .eq("user_id", session.user.id)
          .maybeSingle();
        if (org) {
          setOrganizerId(org.id);
          setUserRole(org.role);
        }
      } else {
        setUser(null);
        setOrganizerId(null);
        setUserRole(null);
      }
      setLoading(false);
    });

    // Check existing session
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session?.user) {
        setUser({ id: session.user.id });
        const { data: org } = await supabase
          .from("organizers")
          .select("id, role")
          .eq("user_id", session.user.id)
          .maybeSingle();
        if (org) {
          setOrganizerId(org.id);
          setUserRole(org.role);
        }
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const login = useCallback(async (session: { access_token: string; refresh_token: string }, newOrganizerId: string, role?: string) => {
    await supabase.auth.setSession({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
    });
    setOrganizerId(newOrganizerId);
    setUserRole(role || null);
  }, []);

  const logout = useCallback(() => {
    supabase.auth.signOut();
    setOrganizerId(null);
    setUserRole(null);
    setUser(null);
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setOrganizerId(null);
    setUserRole(null);
    setUser(null);
  }, []);

  const value = useMemo(() => ({
    user,
    organizerId,
    userRole,
    isAuthenticated: !!user && !!organizerId,
    isAdmin: userRole === "admin",
    loading,
    login,
    logout,
    signOut,
  }), [user, organizerId, userRole, loading, login, logout, signOut]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};
