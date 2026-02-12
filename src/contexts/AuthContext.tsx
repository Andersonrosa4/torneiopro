import { createContext, useContext, useState, ReactNode } from "react";

interface User {
  id: string;
}

interface AuthContextType {
  user: User | null;
  organizerId: string | null;
  isAuthenticated: boolean;
  loading: boolean;
  login: (token: string, organizerId: string) => void;
  logout: () => void;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  organizerId: null,
  isAuthenticated: false,
  loading: false,
  login: () => {},
  logout: () => {},
  signOut: async () => {},
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const storedOrganizerId = sessionStorage.getItem("organizer_id");
  const storedToken = sessionStorage.getItem("organizer_token");

  const [organizerId, setOrganizerId] = useState<string | null>(storedOrganizerId);
  const [user, setUser] = useState<User | null>(
    storedOrganizerId ? { id: storedOrganizerId } : null
  );
  const [loading] = useState(false);

  const login = (newToken: string, newOrganizerId: string) => {
    sessionStorage.setItem("organizer_token", newToken);
    sessionStorage.setItem("organizer_id", newOrganizerId);
    setOrganizerId(newOrganizerId);
    setUser({ id: newOrganizerId });
  };

  const logout = () => {
    sessionStorage.removeItem("organizer_token");
    sessionStorage.removeItem("organizer_id");
    setOrganizerId(null);
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
        isAuthenticated: !!storedToken && !!organizerId,
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
