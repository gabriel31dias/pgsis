import { create } from "zustand";
import { persist } from "zustand/middleware";

export type Role = "admin" | "user";
export type Status = "pending" | "approved" | "rejected";

export interface User {
  id: string;
  name: string;
  email: string;
  cpf: string | null;
  role: Role;
  blocked: boolean;
  twofa_enabled: boolean;
  created_at: string;
}

export interface Page<T, S = unknown> {
  data: T[];
  pagination: { page: number; perPage: number; total: number; lastPage: number };
  summary?: S;
}

interface AuthState {
  token: string | null;
  user: User | null;
  setAuth: (token: string, user: User) => void;
  logout: () => void;
}

export const useAuth = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      setAuth: (token, user) => set({ token, user }),
      logout: () => set({ token: null, user: null }),
    }),
    { name: "lotepay-auth" },
  ),
);

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public body: { errors?: { line: number; message: string }[] } | null,
  ) {
    super(message);
  }
}

type Query = Record<string, string | number | undefined | null>;

const qs = (query?: Query) => {
  const params = new URLSearchParams();
  Object.entries(query ?? {}).forEach(
    ([k, v]) => v !== undefined && v !== null && v !== "" && params.set(k, String(v)),
  );
  const s = params.toString();
  return s ? `?${s}` : "";
};

async function request(path: string, init: RequestInit & { query?: Query } = {}) {
  const { token } = useAuth.getState();
  const isForm = init.body instanceof FormData;
  const res = await fetch(`/api${path}${qs(init.query)}`, {
    ...init,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.body && !isForm ? { "Content-Type": "application/json" } : {}),
    },
  });

  // sessão expirada, usuário bloqueado ou removido: volta pro login
  if (res.status === 401 && token) {
    useAuth.getState().logout();
    location.href = "/login";
  }
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    const message = Array.isArray(body?.message) ? body.message.join(", ") : body?.message;
    throw new ApiError(message || `Erro ${res.status}`, res.status, body);
  }
  return res;
}

export const api = {
  get: <T>(path: string, query?: Query) => request(path, { query }).then((r) => r.json() as Promise<T>),
  post: <T>(path: string, body?: unknown) =>
    request(path, {
      method: "POST",
      body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
    }).then((r) => r.json() as Promise<T>),
  patch: <T>(path: string, body: unknown) =>
    request(path, { method: "PATCH", body: JSON.stringify(body) }).then((r) => r.json() as Promise<T>),
  delete: (path: string) => request(path, { method: "DELETE" }),
  download: async (path: string, filename: string) => {
    const blob = await (await request(path)).blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  },
};

export const brl = (value: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);

export const formatCpf = (cpf?: string | null) =>
  cpf ? cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4") : "—";

// o SQLite devolve "2026-10-01 20:26:51" (UTC, sem fuso)
export const formatDate = (value?: string | null) =>
  value
    ? new Date(value.includes("T") ? value : `${value.replace(" ", "T")}Z`).toLocaleString("pt-BR", {
        dateStyle: "short",
        timeStyle: "short",
      })
    : "—";
