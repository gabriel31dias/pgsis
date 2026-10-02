import { card, StatCard, StatusBadge, Strong } from "@/shared/components/kit";
import { api, brl, formatDate, useAuth, type Status } from "@/shared/lib/api";
import { cn } from "@/shared/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, Clock, Layers, UsersRound, XCircle } from "lucide-react";
import { Link } from "react-router-dom";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

type Totals = { batches: number; payments: number; total: number };
type Dashboard = {
  summary: Record<Status, Totals>;
  series: { day: string; approved: number; pending: number; rejected: number }[];
  recent: { id: number; name: string; user_name: string; status: Status; total: number; count: number; created_at: string }[];
  top_users: { user_name: string; batches: number; total: number }[];
  users: { total: number; blocked: number; admins: number } | null;
};

// cores de status (reservadas para status, mesmas do toast do ~/loja)
const SERIES = [
  { key: "approved", label: "Aprovado", color: "#45BC56" },
  { key: "pending", label: "Pendente", color: "#EAC645" },
  { key: "rejected", label: "Reprovado", color: "#EF4444" },
] as const;

const dayLabel = (day: string) => day.slice(8, 10) + "/" + day.slice(5, 7);

export function DashboardPage() {
  const isAdmin = useAuth((s) => s.user?.role === "admin");
  const { data, isLoading } = useQuery({
    queryKey: ["dashboard"],
    queryFn: () => api.get<Dashboard>("/dashboard"),
  });

  if (isLoading || !data) return <p className="text-sm text-muted-foreground">Carregando...</p>;
  const { summary } = data;
  const totalPayments = summary.pending.payments + summary.approved.payments + summary.rejected.payments;

  return (
    <div className="space-y-5 pb-10 animate-fade-in">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={<Clock className="h-5 w-5" />}
          label="Aguardando aprovação"
          value={brl(summary.pending.total)}
          caption={`${summary.pending.batches} lote(s) · ${summary.pending.payments} pagamento(s)`}
        />
        <StatCard
          icon={<CheckCircle2 className="h-5 w-5" />}
          label="Aprovado"
          value={brl(summary.approved.total)}
          caption={`${summary.approved.batches} lote(s) · ${summary.approved.payments} pagamento(s)`}
        />
        <StatCard
          icon={<XCircle className="h-5 w-5" />}
          label="Reprovado"
          value={brl(summary.rejected.total)}
          caption={`${summary.rejected.batches} lote(s) · ${summary.rejected.payments} pagamento(s)`}
        />
        {data.users ? (
          <StatCard
            icon={<UsersRound className="h-5 w-5" />}
            label="Usuários"
            value={data.users.total}
            caption={`${data.users.admins} admin(s) · ${data.users.blocked} bloqueado(s)`}
          />
        ) : (
          <StatCard icon={<Layers className="h-5 w-5" />} label="Pagamentos importados" value={totalPayments} />
        )}
      </div>

      <div className={cn("grid gap-5", isAdmin && "xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]")}>
        <section className={cn(card, "p-5")}>
          <h2 className="font-bold text-[#1F1F24] dark:text-white">Valor importado por dia</h2>
          <p className="mb-4 text-xs font-medium text-[#73737D] dark:text-muted-foreground">Últimos 30 dias, por status atual do pagamento</p>
          <div className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.series} barCategoryGap={4}>
                <CartesianGrid vertical={false} strokeOpacity={0.15} />
                <XAxis dataKey="day" tickFormatter={dayLabel} tick={{ fontSize: 11, fill: "#8C8C96" }} tickLine={false} axisLine={false} interval={4} />
                <YAxis tickFormatter={(v) => brl(v).replace(",00", "")} tick={{ fontSize: 11, fill: "#8C8C96" }} tickLine={false} axisLine={false} width={90} />
                <Tooltip
                  cursor={{ fill: "rgba(7,163,62,0.08)" }}
                  labelFormatter={(d) => dayLabel(String(d))}
                  formatter={(v: number, name) => [brl(v), name]}
                  contentStyle={{ borderRadius: 12, border: "1px solid #E5E7EB", fontSize: 12 }}
                />
                <Legend
                  iconType="circle"
                  wrapperStyle={{ fontSize: 12 }}
                  formatter={(value) => <span className="text-[#73737D] dark:text-muted-foreground">{value}</span>}
                />
                {SERIES.map((s, i) => (
                  <Bar
                    key={s.key}
                    dataKey={s.key}
                    name={s.label}
                    stackId="a"
                    fill={s.color}
                    stroke="hsl(var(--card))"
                    radius={i === SERIES.length - 1 ? [4, 4, 0, 0] : 0}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>

        {isAdmin && (
          <section className={cn(card, "p-5")}>
            <h2 className="mb-4 font-bold text-[#1F1F24] dark:text-white">Quem mais teve lotes aprovados</h2>
            {data.top_users.length === 0 && <p className="text-sm text-muted-foreground">Nenhum lote aprovado ainda.</p>}
            <ol className="space-y-3">
              {data.top_users.map((u, i) => (
                <li key={u.user_name} className="flex items-center justify-between gap-3 text-sm">
                  <span className="flex min-w-0 items-center gap-3">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#07A33E]/10 text-xs font-bold text-[#07A33E]">{i + 1}</span>
                    <span className="truncate font-semibold text-[#1F1F24] dark:text-white">{u.user_name}</span>
                  </span>
                  <span className="shrink-0 text-right">
                    <Strong>{brl(u.total)}</Strong>
                    <span className="block text-xs text-muted-foreground">{u.batches} lote(s)</span>
                  </span>
                </li>
              ))}
            </ol>
          </section>
        )}
      </div>

      <section className={cn(card, "p-5")}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-bold text-[#1F1F24] dark:text-white">Lotes recentes</h2>
          <Link to={isAdmin ? "/admin/lotes" : "/pagamentos"} className="text-sm font-semibold text-[#07A33E] hover:underline">
            Ver todos
          </Link>
        </div>
        {data.recent.length === 0 && <p className="text-sm text-muted-foreground">Nenhum lote importado ainda.</p>}
        <div className="divide-y divide-[#E5E7EB] dark:divide-border/40">
          {data.recent.map((b) => (
            <div key={b.id} className="grid grid-cols-[70px_minmax(0,1fr)_140px_120px] items-center gap-3 py-3 text-sm">
              <span className="font-bold text-[#07A33E]">#{b.id}</span>
              <span className="min-w-0">
                <span className="block truncate font-semibold text-[#1F1F24] dark:text-white">{b.name}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {isAdmin && `${b.user_name} · `}
                  {b.count} pagamento(s) · {formatDate(b.created_at)}
                </span>
              </span>
              <span className="text-right"><Strong>{brl(b.total)}</Strong></span>
              <span className="text-right"><StatusBadge status={b.status} /></span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
