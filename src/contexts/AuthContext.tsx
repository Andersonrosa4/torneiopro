import { createContext, useContext, useState, useEffect, ReactNode, useMemo, useCallback, useRef } from "react";
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
  const loginInProgress = useRef(false);

  const fetchOrganizer = useCallback(async (userId: string) => {
    try {
      const { data: org } = await supabase
        .from("organizers")
        .select("id, role")
        .eq("user_id", userId)
        .maybeSingle();
      if (org) {
        setOrganizerId(org.id);
        setUserRole(org.role);
      }
    } catch (e) {
      console.error("Failed to fetch organizer:", e);
    }
  }, []);

  useEffect(() => {
    // Check existing session first
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session?.user && !loginInProgress.current) {
        setUser({ id: session.user.id });
        await fetchOrganizer(session.user.id);
      }
      setLoading(false);
    });

    // Listen to future auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      // Skip if login() is handling session setup
      if (loginInProgress.current) return;

      if (session?.user) {
        setUser({ id: session.user.id });
        if (event === "SIGNED_IN") {
          await fetchOrganizer(session.user.id);
        }
      } else {
        setUser(null);
        setOrganizerId(null);
        setUserRole(null);
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, [fetchOrganizer]);

  const login = useCallback(async (session: { access_token: string; refresh_token: string }, newOrganizerId: string, role?: string) => {
    // Prevent onAuthStateChange from running duplicate queries
    loginInProgress.current = true;
    
    try {
      await supabase.auth.setSession({
        access_token: session.access_token,
        refresh_token: session.refresh_token,
      });
      
      // Decode user id from access_token directly (no network call needed)
      const payload = JSON.parse(atob(session.access_token.split('.')[1]));
      const userId = payload.sub as string;
      
      setUser({ id: userId });
      setOrganizerId(newOrganizerId);
      setUserRole(role || null);
    } catch (e) {
      console.error("Login error:", e);
    } finally {
      setLoading(false);
      loginInProgress.current = false;
    }
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
