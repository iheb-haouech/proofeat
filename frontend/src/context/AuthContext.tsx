import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { api } from "../api";

type User = {
  id: number;
  email: string;
  name?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  phone?: string | null;
  avatarUrl?: string | null;
  role: "SUPERADMIN" | "ADMIN" | "CLIENT";
};

type AuthResponse = {
  token: string;
  user: User;
};

type AuthContextValue = {
  user: User | null;
  token: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<AuthResponse>;
  register: (email: string, password: string) => Promise<AuthResponse>;
  logout: () => void;
};

export const AuthContext = createContext<AuthContextValue | null>(null);

const TOKEN_KEY = "token";
const USER_KEY = "user";

function normalizeUser(user: User): User {
  return {
    ...user,
    role: String(user.role || "CLIENT").toUpperCase() as User["role"],
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const t = localStorage.getItem(TOKEN_KEY);
    const u = localStorage.getItem(USER_KEY);

    if (t && u) {
      setToken(t);
      try {
        setUser(normalizeUser(JSON.parse(u)));
      } catch {
        localStorage.removeItem(USER_KEY);
      }
    }

    setLoading(false);
  }, []);

  const persist = useCallback((t: string, u: User) => {
    const normalized = normalizeUser(u);
    localStorage.setItem(TOKEN_KEY, t);
    localStorage.setItem(USER_KEY, JSON.stringify(normalized));
    setToken(t);
    setUser(normalized);
  }, []);

  const login = useCallback(async (email: string, password: string): Promise<AuthResponse> => {
    const res = await api.post("/auth/login", { email, password });
    persist(res.data.token, res.data.user);
    return res.data;
  }, [persist]);

  const register = useCallback(async (email: string, password: string): Promise<AuthResponse> => {
    const res = await api.post("/auth/register", { email, password });
    persist(res.data.token, res.data.user);
    return res.data;
  }, [persist]);

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    setToken(null);
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ user, token, loading, login, register, logout }),
    [user, token, loading, login, register, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}