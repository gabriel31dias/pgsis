import { Layout } from "@/shared/components/Layout";
import { TooltipProvider } from "@/shared/components/ui/tooltip";
import { useAuth } from "@/shared/lib/api";
import { useThemeStore } from "@/shared/stores/theme.store";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Toaster } from "sonner";
import { AuditoriaPage } from "./pages/AuditoriaPage";
import { DashboardPage } from "./pages/DashboardPage";
import { ImportarPage } from "./pages/ImportarPage";
import { LoginPage } from "./pages/LoginPage";
import { LotesPage } from "./pages/LotesPage";
import { PagamentosPage } from "./pages/PagamentosPage";
import { UsuariosPage } from "./pages/UsuariosPage";

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
});

function Private({ children, admin }: { children: ReactNode; admin?: boolean }) {
  const user = useAuth((s) => s.user);
  if (!user) return <Navigate to="/login" replace />;
  if (admin && user.role !== "admin") return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}

export default function App() {
  const theme = useThemeStore((s) => s.theme);
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route element={<Private><Layout /></Private>}>
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/pagamentos" element={<ImportarPage />} />
              <Route path="/pagamentos/lista" element={<PagamentosPage />} />
              <Route path="/admin/lotes" element={<Private admin><LotesPage /></Private>} />
              <Route path="/admin/pagamentos" element={<Private admin><PagamentosPage /></Private>} />
              <Route path="/admin/usuarios" element={<Private admin><UsuariosPage /></Private>} />
              <Route path="/admin/auditoria" element={<Private admin><AuditoriaPage /></Private>} />
            </Route>
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </BrowserRouter>
        {/* cores do toast do ~/loja (ui/sonner.tsx), sem next-themes */}
        <Toaster
          theme={theme}
          position="bottom-right"
          toastOptions={{
            classNames: {
              toast: "!w-[var(--toast-width)] !min-h-[var(--toast-min-height)] !rounded-[var(--toast-radius)] !border-none !shadow-lg font-sans",
              title: "!text-sm !font-semibold",
              description: "!text-xs !opacity-90",
              success: "!bg-toast-success !text-white",
              error: "!bg-toast-error !text-white",
            },
          }}
        />
      </TooltipProvider>
    </QueryClientProvider>
  );
}
