import { createContext, useContext, useState, ReactNode } from "react";

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
  login: (token: string, organizerId: string, role?: string) => void;
  logout: () => void;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  organizerId: null,
  userRole: null,
  isAuthenticated: false,
  isAdmin: false,
  loading: false,
  login: () => {},
  logout: () => {},
  signOut: async () => {},
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const storedOrganizerId = sessionStorage.getItem("organizer_id");
  const storedToken = sessionStorage.getItem("organizer_token");
  const storedRole = sessionStorage.getItem("organizer_role");

  const [organizerId, setOrganizerId] = useState<string | null>(storedOrganizerId);
  const [userRole, setUserRole] = useState<string | null>(storedRole);
  const [user, setUser] = useState<User | null>(
    storedOrganizerId ? { id: storedOrganizerId } : null
  );
  const [loading] = useState(false);

  const login = (newToken: string, newOrganizerId: string, role?: string) => {
    sessionStorage.setItem("organizer_token", newToken);
    sessionStorage.setItem("organizer_id", newOrganizerId);
    if (role) sessionStorage.setItem("organizer_role", role);
    setOrganizerId(newOrganizerId);
    setUserRole(role || null);
    setUser({ id: newOrganizerId });
  };

  const logout = () => {
    sessionStorage.removeItem("organizer_token");
    sessionStorage.removeItem("organizer_id");
    sessionStorage.removeItem("organizer_role");
    setOrganizerId(null);
    setUserRole(null);
    setUser(null);
  };

  const signOut = async () => {
    logout();
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        organizerId,
        userRole,
        isAuthenticated: !!storedToken && !!organizerId,
        isAdmin: userRole === "admin",
        loading,
        login,
        logout,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
