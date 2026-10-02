import { DataTable, Field, fieldClass, FilterPanel, PeriodFields, StatCard, useList, WithFilters, type Filters } from "@/shared/components/kit";
import { brl, type Status } from "@/shared/lib/api";
import { CheckCircle2, Clock, XCircle } from "lucide-react";
import { useState } from "react";
import { BatchDialog, batchColumns, type Batch } from "./BatchDialog";

type Summary = Record<Status, { count: number; total: number }>;

/** lista de lotes com filtros laterais; admin vê todos e revisa no dialog */
export function BatchesList({ admin }: { admin: boolean }) {
  const defaults: Filters = admin ? { status: "pending" } : {};
  const list = useList<Batch, Summary>("batches", "/batches", defaults);
  const [open, setOpen] = useState<Batch | null>(null);
  const summary = list.data?.summary;

  return (
    <>
      {summary && (
        <div className="grid gap-3 md:grid-cols-3">
          <StatCard icon={<Clock className="h-5 w-5" />} label="Pendentes" value={summary.pending.count} caption={brl(summary.pending.total)} />
          <StatCard icon={<CheckCircle2 className="h-5 w-5" />} label="Aprovados" value={summary.approved.count} caption={brl(summary.approved.total)} />
          <StatCard icon={<XCircle className="h-5 w-5" />} label="Reprovados" value={summary.rejected.count} caption={brl(summary.rejected.total)} />
        </div>
      )}

      <WithFilters
        filters={
          <FilterPanel onApply={list.setFilters}>
            <Field label="Lote (nº ou nome)">
              <input name="search" placeholder="#12 ou nome do arquivo" className={fieldClass} />
            </Field>
            {admin && (
              <Field label="Importado por">
                <input name="user_name" placeholder="Nome do usuário" className={fieldClass} />
              </Field>
            )}
            <Field label="Status">
              <select name="status" defaultValue={defaults.status ?? ""} className={fieldClass}>
                <option value="">Todos</option>
                <option value="pending">Pendente</option>
                <option value="approved">Aprovado</option>
                <option value="rejected">Reprovado</option>
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
        <DataTable
          columns={batchColumns(admin)}
          page={list.data}
          isLoading={list.isLoading}
          isError={list.isError}
          onPageChange={list.setPage}
          onRowClick={setOpen}
          empty="Nenhum lote encontrado."
        />
      </WithFilters>

      <BatchDialog batch={open} onClose={() => setOpen(null)} />
    </>
  );
}

export function LotesPage() {
  return (
    <div className="space-y-5 pb-10 animate-fade-in">
      <BatchesList admin />
    </div>
  );
}
