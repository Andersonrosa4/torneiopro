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
  accessToken: string | null;
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
  accessToken: null,
  login: async () => {},
  logout: () => {},
  signOut: async () => {},
});

export const useAuth = () => useContext(AuthContext);

// Módulo-level token store para acesso síncrono fora do React
let _accessToken: string | null = null;
export const getAccessToken = () => _accessToken;

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [organizerId, setOrganizerId] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
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
        _accessToken = session.access_token;
        setAccessToken(session.access_token);
        await fetchOrganizer(session.user.id);
      }
      setLoading(false);
    });

    // Listen to future auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (loginInProgress.current) return;

      if (session?.user) {
        setUser({ id: session.user.id });
        _accessToken = session.access_token;
        setAccessToken(session.access_token);
        if (event === "SIGNED_IN") {
          await fetchOrganizer(session.user.id);
        }
      } else {
        setUser(null);
        setOrganizerId(null);
        setUserRole(null);
        _accessToken = null;
        setAccessToken(null);
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, [fetchOrganizer]);

  const login = useCallback(async (
    session: { access_token: string; refresh_token: string },
    newOrganizerId: string,
    role?: string
  ) => {
    loginInProgress.current = true;

    try {
      // Decode user id from JWT directly (synchronous, no network)
      const payload = JSON.parse(atob(session.access_token.split('.')[1]));
      const userId = payload.sub as string;

      // Store token at module level for immediate access in queries
      _accessToken = session.access_token;

      // Update React state
      setUser({ id: userId });
      setOrganizerId(newOrganizerId);
      setUserRole(role || null);
      setAccessToken(session.access_token);

      // Persist session in Supabase client (non-blocking)
      supabase.auth.setSession({
        access_token: session.access_token,
        refresh_token: session.refresh_token,
      }).catch((e) => console.error("setSession error:", e));

    } catch (e) {
      console.error("Login error:", e);
    } finally {
      setLoading(false);
      setTimeout(() => { loginInProgress.current = false; }, 1000);
    }
  }, []);

  const logout = useCallback(() => {
    supabase.auth.signOut();
    _accessToken = null;
    setAccessToken(null);
    setOrganizerId(null);
    setUserRole(null);
    setUser(null);
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    _accessToken = null;
    setAccessToken(null);
    setOrganizerId(null);
    setUserRole(null);
    setUser(null);
  }, []);

  const value = useMemo(() => ({
    user,
    organizerId,
    userRole,
    accessToken,
    isAuthenticated: !!user && !!organizerId,
    isAdmin: userRole === "admin",
    loading,
    login,
    logout,
    signOut,
  }), [user, organizerId, userRole, accessToken, loading, login, logout, signOut]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};
