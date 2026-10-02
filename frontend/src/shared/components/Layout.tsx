// Sidebar e Header no visual do ~/loja (Layout/Sidebar.tsx e Layout/Header.tsx)
import { ThemeToggle } from "@/shared/components/ThemeToggle/ThemeToggle";
import { Avatar, AvatarFallback } from "@/shared/components/ui/avatar";
import { Button } from "@/shared/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";
import { useAuth } from "@/shared/lib/api";
import { cn } from "@/shared/lib/utils";
import {
  ChevronDown,
  ClipboardCheck,
  FileUp,
  Grid2X2,
  History,
  LogOut,
  PanelLeft,
  ReceiptText,
  UsersRound,
  Wallet,
} from "lucide-react";
import { useState } from "react";
import { Link, Outlet, useLocation } from "react-router-dom";

const USER_MENU = [
  {
    label: "Visão geral",
    items: [{ icon: Grid2X2, label: "Dashboard", path: "/dashboard" }],
  },
  {
    label: "Pagamentos",
    items: [
      { icon: FileUp, label: "Importar pagamentos", path: "/pagamentos" },
      { icon: ReceiptText, label: "Meus pagamentos", path: "/pagamentos/lista" },
    ],
  },
];

const ADMIN_MENU = [
  {
    label: "Visão geral",
    items: [{ icon: Grid2X2, label: "Dashboard", path: "/dashboard" }],
  },
  {
    label: "Pagamentos",
    items: [
      { icon: ClipboardCheck, label: "Aprovação de lotes", path: "/admin/lotes" },
      { icon: Wallet, label: "Pagamentos executados", path: "/admin/pagamentos" },
    ],
  },
  {
    label: "Administração",
    items: [
      { icon: UsersRound, label: "Usuários", path: "/admin/usuarios" },
      { icon: History, label: "Auditoria", path: "/admin/auditoria" },
    ],
  },
];

const ALL_ITEMS = [...USER_MENU, ...ADMIN_MENU].flatMap((s) => s.items);

function Logo({ collapsed }: { collapsed: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#07A33E] text-sm font-extrabold text-white shadow-[0_0_18px_rgba(7,163,62,0.35)]">
        LP
      </div>
      {!collapsed && <span className="text-lg font-bold text-white">LotePay</span>}
    </div>
  );
}

function Sidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const location = useLocation();
  const { user, logout } = useAuth();
  const sections = user?.role === "admin" ? ADMIN_MENU : USER_MENU;

  return (
    <aside
      className={cn(
        "dark fixed left-0 top-0 z-40 flex h-screen flex-col overflow-y-auto border-r border-sidebar-border bg-[#080C0A] transition-all duration-300",
        collapsed ? "w-16" : "w-[268px]",
      )}
    >
      <div className={cn("flex h-16 items-center px-4", collapsed ? "justify-center" : "justify-between")}>
        {!collapsed && <Logo collapsed={collapsed} />}
        <Button variant="ghost" size="icon" onClick={onToggle} className="text-[#07A33E] hover:bg-primary/10">
          <PanelLeft className="h-5 w-5" />
        </Button>
      </div>

      <nav className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
        {sections.map((section, i) => (
          <div key={section.label} className={cn("space-y-2 pb-4", i > 0 && "border-t border-[#1A221D] pt-4")}>
            {!collapsed && (
              <span className="px-3 text-[11px] font-semibold uppercase tracking-wider text-[#07A33E]">
                {section.label}
              </span>
            )}
            <div className="space-y-1">
              {section.items.map((item) => {
                const active = location.pathname === item.path;
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    title={collapsed ? item.label : undefined}
                    className={cn(
                      "relative flex h-9 items-center gap-[10px] overflow-hidden rounded-lg px-3 text-[#A2A5B3] transition-all duration-200 hover:bg-primary/10",
                      collapsed && "h-10 justify-center px-0",
                      active && "border border-[#1A221D] bg-[#0F1512] text-white shadow-[0_0_18px_rgba(7,163,62,0.12)]",
                    )}
                  >
                    {active && (
                      <span className="pointer-events-none absolute inset-y-0 right-0 w-16 bg-gradient-to-l from-[#07A33E] via-[#07A33E]/25 to-transparent" />
                    )}
                    <item.icon color="#07A33E" size={20} className="relative z-10 shrink-0" />
                    {!collapsed && (
                      <span className={cn("relative z-10 truncate text-[13px] font-medium", active ? "text-white" : "text-[#A2A5B3]")}>
                        {item.label}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="mt-auto border-t border-sidebar-border p-4">
        <button
          onClick={logout}
          className={cn(
            "flex w-full items-center gap-3 rounded-xl px-4 py-3 transition-colors hover:bg-destructive/10",
            collapsed && "justify-center px-0",
          )}
        >
          <LogOut className="h-5 w-5 text-[#07A33E]" />
          {!collapsed && <span className="text-lg font-medium text-muted-foreground">Sair</span>}
        </button>
      </div>
    </aside>
  );
}

function Header() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const current = ALL_ITEMS.find((i) => i.path === location.pathname) ?? ALL_ITEMS[0];
  const title =
    current.path === "/dashboard" && user?.role === "admin" ? "Dashboard Administrativo" : current.label;

  return (
    <header className="flex h-12 items-center justify-between">
      <div className="flex items-center gap-3">
        <current.icon color="#07A33E" />
        <span className="text-2xl font-bold leading-none text-[#1F1F24] dark:text-white">{title}</span>
      </div>

      <div className="flex items-center gap-4">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button className="flex items-center gap-2 rounded-full bg-white px-3 py-2 hover:bg-white focus-visible:ring-0 dark:bg-[rgba(255,255,255,0.03)]">
              <Avatar className="h-9 w-9">
                <AvatarFallback className="bg-primary/10 text-base font-medium text-[#1F1F24] dark:text-white">
                  {user?.name?.charAt(0) ?? "U"}
                </AvatarFallback>
              </Avatar>
              <span className="text-primary dark:text-white">{user?.name}</span>
              <span className="rounded-full bg-[#07A33E]/15 px-2 py-0.5 text-[11px] font-bold uppercase text-[#07A33E]">
                {user?.role === "admin" ? "Admin" : "Usuário"}
              </span>
              <ChevronDown className="h-4 w-4 text-[#07A33E]" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className="w-[201px] rounded-[15px] border-0 bg-white p-4 shadow-[0px_4px_55px_rgba(0,0,0,0.08)] dark:bg-[#080C0A] dark:shadow-[0px_4px_55px_rgba(0,0,0,0.5)]"
          >
            <DropdownMenuItem
              onClick={logout}
              className="flex cursor-pointer items-center gap-3 rounded-lg px-4 py-3 text-[16px] text-[rgba(31,31,36,0.6)] focus:bg-[rgba(7,163,62,0.08)] dark:text-[rgba(255,255,255,0.6)]"
            >
              <LogOut className="h-5 w-5 text-[#07A33E]" />
              Sair
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <ThemeToggle />
      </div>
    </header>
  );
}

export function Layout() {
  const [collapsed, setCollapsed] = useState(false);
  return (
    <div
      className={cn(
        "grid h-screen transition-all duration-300",
        // minmax(0,1fr): tabela larga rola dentro dela, não a tela
        collapsed ? "grid-cols-[64px_minmax(0,1fr)]" : "grid-cols-[268px_minmax(0,1fr)]",
      )}
    >
      <Sidebar collapsed={collapsed} onToggle={() => setCollapsed(!collapsed)} />
      <div className="col-start-2 flex h-screen flex-col gap-8 overflow-y-auto p-8">
        <Header />
        <main className="flex-1 pb-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
