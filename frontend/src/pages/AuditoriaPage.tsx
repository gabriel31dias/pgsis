import { DataTable, Field, fieldClass, FilterPanel, PeriodFields, Strong, useList, WithFilters, type Column } from "@/shared/components/kit";
import { formatDate } from "@/shared/lib/api";
import { cn } from "@/shared/lib/utils";

interface AuditLog {
  id: number;
  action: string;
  actor_name: string;
  target_type: string;
  target_id: string;
  description: string;
  created_at: string;
}

const ACTIONS: Record<string, { label: string; className: string }> = {
  "batch.import": { label: "Importação", className: "bg-info/15 text-info" },
  "batch.approve": { label: "Aprovação", className: "bg-success/15 text-success" },
  "batch.reject": { label: "Reprovação", className: "bg-destructive/15 text-destructive" },
  "user.create": { label: "Cadastro", className: "bg-[#07A33E]/15 text-[#07A33E]" },
  "user.update": { label: "Edição", className: "bg-[#07A33E]/15 text-[#07A33E]" },
  "user.block": { label: "Bloqueio", className: "bg-warning/15 text-[#B76E00] dark:text-warning" },
  "user.unblock": { label: "Desbloqueio", className: "bg-success/15 text-success" },
  "user.delete": { label: "Remoção", className: "bg-destructive/15 text-destructive" },
};

const columns: Column<AuditLog>[] = [
  { header: "Data", width: "140px", cell: (a) => formatDate(a.created_at) },
  {
    header: "Ação",
    width: "130px",
    cell: (a) => {
      const action = ACTIONS[a.action] ?? { label: a.action, className: "bg-muted text-muted-foreground" };
      return <span className={cn("rounded-full px-3 py-1 text-xs font-bold", action.className)}>{action.label}</span>;
    },
  },
  { header: "Quem", width: "minmax(0,1fr)", cell: (a) => <Strong>{a.actor_name}</Strong> },
  { header: "Detalhe", width: "minmax(0,3fr)", cell: (a) => <span title={a.description}>{a.description}</span> },
];

export function AuditoriaPage() {
  const list = useList<AuditLog>("audit", "/audit");

  return (
    <div className="space-y-5 pb-10 animate-fade-in">
      <WithFilters
        filters={
          <FilterPanel onApply={list.setFilters}>
            <Field label="Ação">
              <select name="action" className={fieldClass}>
                <option value="">Todas</option>
                {Object.entries(ACTIONS).map(([value, { label }]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Sobre">
              <select name="target_type" className={fieldClass}>
                <option value="">Tudo</option>
                <option value="batch">Lotes</option>
                <option value="user">Usuários</option>
              </select>
            </Field>
            <Field label="Quem fez">
              <input name="actor" placeholder="Nome do usuário" className={fieldClass} />
            </Field>
            <Field label="Busca no detalhe">
              <input name="search" placeholder="Nº do lote, nome..." className={fieldClass} />
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
        <DataTable columns={columns} page={list.data} isLoading={list.isLoading} isError={list.isError} onPageChange={list.setPage} />
      </WithFilters>
    </div>
  );
}
