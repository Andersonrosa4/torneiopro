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
  // Track whether login() already set state, so onAuthStateChange doesn't overwrite
  const loginDone = useRef(false);

  const fetchOrganizer = useCallback(async (userId: string, token?: string): Promise<{ id: string; role: string } | null> => {
    try {
      const headers: Record<string, string> = {};
      const tok = token || _accessToken;
      if (tok) headers["Authorization"] = `Bearer ${tok}`;

      const { data: org } = await supabase
        .from("organizers")
        .select("id, role")
        .eq("user_id", userId)
        .maybeSingle();
      return org ?? null;
    } catch (e) {
      console.error("Failed to fetch organizer:", e);
      return null;
    }
  }, []);

  useEffect(() => {
    // Safety timeout: ensure loading ALWAYS becomes false within 5s
    const safetyTimer = setTimeout(() => {
      setLoading(prev => {
        if (prev) console.warn("Auth loading safety timeout triggered");
        return false;
      });
    }, 2000);

    // On mount: restore existing Supabase session
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (loginDone.current) {
        // login() already ran, state is set — just clear loading
        setLoading(false);
        return;
      }
      if (session?.user) {
        _accessToken = session.access_token;
        setAccessToken(session.access_token);
        setUser({ id: session.user.id });
        try {
          const org = await fetchOrganizer(session.user.id, session.access_token);
          if (org) {
            setOrganizerId(org.id);
            setUserRole(org.role);
          }
        } catch (e) {
          console.error("Error fetching organizer on init:", e);
        }
      }
      setLoading(false);
    }).catch((e) => {
      console.error("getSession failed:", e);
      setLoading(false);
    });

    // Listen to future auth state changes (SIGNED_OUT, TOKEN_REFRESHED, etc.)
    // IMPORTANT: callback must NOT be async to avoid blocking signInWithPassword
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      // If login() already handled setup, ignore SIGNED_IN events to avoid race
      if (loginDone.current && event === "SIGNED_IN") return;

      if (session?.user) {
        _accessToken = session.access_token;
        setAccessToken(session.access_token);
        setUser({ id: session.user.id });
        if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") {
          // Fire-and-forget: don't block the auth state change callback
          fetchOrganizer(session.user.id, session.access_token).then(org => {
            if (org) {
              setOrganizerId(org.id);
              setUserRole(org.role);
            }
          }).catch(e => console.error("fetchOrganizer error:", e));
        }
      } else if (event === "SIGNED_OUT") {
        setUser(null);
        setOrganizerId(null);
        setUserRole(null);
        _accessToken = null;
        setAccessToken(null);
      }
      setLoading(false);
    });

    return () => {
      clearTimeout(safetyTimer);
      subscription.unsubscribe();
    };
  }, [fetchOrganizer]);

  const login = useCallback(async (
    session: { access_token: string; refresh_token: string },
    newOrganizerId: string,
    role?: string
  ) => {
    try {
      // Decode user id from JWT directly (synchronous, no network)
      const payload = JSON.parse(atob(session.access_token.split('.')[1]));
      const userId = payload.sub as string;

      // Store token at module level for immediate access in queries
      _accessToken = session.access_token;

      // Mark as done BEFORE setting state so onAuthStateChange ignores the setSession event
      loginDone.current = true;

      // Update React state immediately
      setUser({ id: userId });
      setOrganizerId(newOrganizerId);
      setUserRole(role || null);
      setAccessToken(session.access_token);
      setLoading(false);

      // Persist session in Supabase client (non-blocking, runs after state is set)
      supabase.auth.setSession({
        access_token: session.access_token,
        refresh_token: session.refresh_token,
      }).catch((e) => console.error("setSession error:", e));

      // Allow onAuthStateChange to work again after 2s (for token refresh etc.)
      setTimeout(() => { loginDone.current = false; }, 2000);

    } catch (e) {
      console.error("Login error:", e);
      setLoading(false);
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
