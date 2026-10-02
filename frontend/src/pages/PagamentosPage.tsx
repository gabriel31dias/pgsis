import { DataTable, Field, PAYOUT, PayoutBadge, fieldClass, FilterPanel, PeriodFields, StatCard, StatusBadge, Strong, useList, WithFilters, type Column, type Filters } from "@/shared/components/kit";
import { api, brl, formatCpf, formatDate, useAuth } from "@/shared/lib/api";
import { Hash, Wallet } from "lucide-react";
import { useState } from "react";
import { BatchDialog, destino, type Batch, type Payment } from "./BatchDialog";

/** pagamento por pagamento; admin abre em "executados", usuário vê só os dele */
export function PagamentosPage() {
  const isAdmin = useAuth((s) => s.user?.role === "admin");
  const defaults: Filters = isAdmin ? { status: "approved" } : {};
  const list = useList<Payment, { count: number; total: number }>("payments", "/payments", defaults);
  const [batch, setBatch] = useState<Batch | null>(null);

  const openBatch = async (id: number) => setBatch(await api.get<Batch>(`/batches/${id}`));

  const columns: Column<Payment>[] = [
    {
      header: "Lote",
      width: "70px",
      cell: (p) => (
        <button type="button" onClick={() => openBatch(p.batch_id)} className="font-bold text-[#07A33E] hover:underline">
          #{p.batch_id}
        </button>
      ),
    },
    { header: "Favorecido", width: "minmax(0,1.3fr)", cell: (p) => <Strong>{p.name}</Strong> },
    { header: "CPF", width: "130px", cell: (p) => formatCpf(p.cpf) },
    { header: "Destino", width: "minmax(0,1.2fr)", cell: destino },
    { header: "Descrição", width: "minmax(0,1fr)", cell: (p) => p.description ?? "—" },
    ...(isAdmin ? [{ header: "Importado por", width: "minmax(0,1fr)", cell: (p: Payment) => p.user_name }] : []),
    { header: "Valor", width: "120px", className: "text-right", cell: (p) => <Strong>{brl(p.amount)}</Strong> },
    { header: "Status", width: "120px", cell: (p) => <StatusBadge status={p.status} /> },
    { header: "Pix", width: "110px", cell: (p) => <PayoutBadge status={p.payout_status} error={p.payout_error} /> },
    { header: "Pago em", width: "130px", cell: (p) => formatDate(p.executed_at) },
  ];

  return (
    <div className="space-y-5 pb-10 animate-fade-in">
      <WithFilters
        filters={
          <FilterPanel onApply={list.setFilters}>
            <Field label="Nº do lote">
              <input name="batch_id" type="number" min={1} placeholder="Ex.: 12" className={fieldClass} />
            </Field>
            <Field label="Nome do favorecido">
              <input name="name" className={fieldClass} />
            </Field>
            <Field label="CPF">
              <input name="cpf" inputMode="numeric" placeholder="Parte ou todo o CPF" className={fieldClass} />
            </Field>
            <Field label="Chave Pix">
              <input name="pix_key" className={fieldClass} />
            </Field>
            <Field label="Descrição">
              <input name="description" className={fieldClass} />
            </Field>
            {isAdmin && (
              <Field label="Importado por">
                <input name="user_name" className={fieldClass} />
              </Field>
            )}
            <Field label="Status">
              <select name="status" defaultValue={defaults.status ?? ""} className={fieldClass}>
                <option value="">Todos</option>
                <option value="approved">Aprovado</option>
                <option value="pending">Pendente</option>
                <option value="rejected">Reprovado</option>
              </select>
            </Field>
            <Field label="Pix (Gatebox)">
              <select name="payout_status" className={fieldClass}>
                <option value="">Todos</option>
                {Object.entries(PAYOUT).map(([value, { label }]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Valor mín.">
                <input name="min_amount" type="number" min={0} step="0.01" className={fieldClass} />
              </Field>
              <Field label="Valor máx.">
                <input name="max_amount" type="number" min={0} step="0.01" className={fieldClass} />
              </Field>
            </div>
            <Field label="Período por">
              <select name="date_field" className={fieldClass}>
                <option value="created">Data de importação</option>
                <option value="executed">Data do pagamento</option>
              </select>
            </Field>
            <PeriodFields />
            <Field label="Ordenar">
              <select name="order_by" className={fieldClass}>
                <option value="recent">Mais recentes</option>
                <option value="oldest">Mais antigos</option>
              </select>
            </Field>
          </FilterPanel>
        }
      >
        <div className="grid gap-3 md:grid-cols-2">
          <StatCard icon={<Hash className="h-5 w-5" />} label="Pagamentos no filtro" value={list.data?.summary?.count ?? 0} />
          <StatCard icon={<Wallet className="h-5 w-5" />} label="Valor total no filtro" value={brl(list.data?.summary?.total ?? 0)} />
        </div>
        <DataTable
          columns={columns}
          page={list.data}
          isLoading={list.isLoading}
          isError={list.isError}
          onPageChange={list.setPage}
          minWidth={1260}
          empty="Nenhum pagamento encontrado."
        />
      </WithFilters>

      <BatchDialog batch={batch} onClose={() => setBatch(null)} />
    </div>
  );
}
