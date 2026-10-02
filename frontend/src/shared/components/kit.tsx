// Peças repetidas nas telas, no visual do ~/loja (ClientesPage, StatCard).
import { cn } from "@/shared/lib/utils";
import { api, type Page, type Status } from "@/shared/lib/api";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import { CheckCircle2, Clock, SlidersHorizontal, XCircle } from "lucide-react";
import type { FormEvent, ReactNode } from "react";
import { Pagination } from "./Pagination";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "./ui/sheet";

export const fieldClass =
  "h-10 w-full rounded-xl border border-[#E5E7EB] bg-white px-3 text-sm font-medium text-[#1F1F24] outline-none transition-colors placeholder:text-[#8C8C96] hover:border-[#07A33E]/40 focus:border-[#07A33E] dark:border-border/40 dark:bg-[#0E1411] dark:text-white dark:placeholder:text-muted-foreground";

export const primaryButton =
  "inline-flex h-10 items-center justify-center gap-2 rounded-2xl bg-[#07A33E] px-4 text-sm font-semibold text-white shadow-sm shadow-[#07A33E]/20 transition-colors hover:bg-[#058A34] disabled:opacity-60";

export const secondaryButton =
  "inline-flex h-10 items-center justify-center gap-2 rounded-2xl border border-[#E5E7EB] bg-white px-4 text-sm font-semibold text-[#2C2C33] transition-colors hover:border-[#07A33E]/40 hover:text-[#07A33E] disabled:opacity-60 dark:border-border/40 dark:bg-white/[0.03] dark:text-white dark:hover:bg-primary/10";

export const card =
  "rounded-2xl border border-[#E5E7EB] bg-white dark:border-border/40 dark:bg-white/[0.03]";

const STATUS: Record<Status, { label: string; className: string; icon: typeof Clock }> = {
  pending: { label: "Pendente", className: "bg-warning/15 text-[#B76E00] dark:text-warning", icon: Clock },
  approved: { label: "Aprovado", className: "bg-success/15 text-success", icon: CheckCircle2 },
  rejected: { label: "Reprovado", className: "bg-destructive/15 text-destructive", icon: XCircle },
};

export const statusLabel = (s: Status) => STATUS[s].label;

export type PayoutStatus = "queued" | "sending" | "processing" | "paid" | "failed";

export const PAYOUT: Record<PayoutStatus, { label: string; className: string }> = {
  queued: { label: "Na fila", className: "bg-warning/15 text-[#B76E00] dark:text-warning" },
  sending: { label: "Enviando", className: "bg-warning/15 text-[#B76E00] dark:text-warning" },
  processing: { label: "Processando", className: "bg-warning/15 text-[#B76E00] dark:text-warning" },
  paid: { label: "Pago", className: "bg-success/15 text-success" },
  failed: { label: "Falhou", className: "bg-destructive/15 text-destructive" },
};

/** status do Pix na Gatebox; o erro aparece no hover */
export function PayoutBadge({ status, error }: { status: PayoutStatus | null; error?: string | null }) {
  if (!status) return <>—</>;
  return (
    <span title={error ?? undefined} className={cn("rounded-full px-3 py-1 text-xs font-bold", PAYOUT[status].className)}>
      {PAYOUT[status].label}
    </span>
  );
}

export function StatusBadge({ status }: { status: Status }) {
  const { label, className, icon: Icon } = STATUS[status];
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold", className)}>
      <Icon className="h-3.5 w-3.5" />
      {label}
    </span>
  );
}

export function StatCard({
  icon,
  label,
  value,
  caption,
}: {
  icon: ReactNode;
  label: string;
  value: string | number;
  caption?: string;
}) {
  return (
    <div className={cn(card, "flex items-center gap-3 p-4")}>
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#07A33E]/10 text-[#07A33E]">
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-sm font-medium text-[#73737D] dark:text-muted-foreground">{label}</p>
        <p className="truncate text-xl font-bold text-[#1F1F24] dark:text-white">{value}</p>
        {caption && <p className="text-xs font-medium text-[#8C8C96] dark:text-muted-foreground">{caption}</p>}
      </div>
    </div>
  );
}

export type Filters = Record<string, string>;

/**
 * Filtros num painel flutuante que desliza da lateral direita (padrão de
 * todas as telas). Os campos são inputs nativos com `name`: "Aplicar" lê o
 * form inteiro, "Limpar" volta aos defaultValue.
 */
export function FilterPanel({
  children,
  onApply,
}: {
  children: ReactNode;
  onApply: (filters: Filters) => void;
}) {
  const [open, setOpen] = useState(false);
  // o Sheet desmonta o form ao fechar: guarda o que foi aplicado pra repor
  const [applied, setApplied] = useState<Filters | null>(null);
  const active = applied ? Object.keys(applied).filter((k) => k !== "order_by").length : 0;

  const read = (form: HTMLFormElement) =>
    Object.fromEntries(
      [...new FormData(form)].filter(([, v]) => String(v).trim() !== "").map(([k, v]) => [k, String(v).trim()]),
    );

  const apply = (filters: Filters) => {
    setApplied(filters);
    onApply(filters);
    setOpen(false);
  };

  // useCallback: ref novo a cada render reescreveria o que o usuário digitou
  const restore = useCallback(
    (form: HTMLFormElement | null) => {
      if (!form || !applied) return;
      for (const el of form.elements as unknown as (HTMLInputElement | HTMLSelectElement)[])
        if (el.name) el.value = applied[el.name] ?? "";
    },
    [applied],
  );

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button type="button" className={secondaryButton}>
          <SlidersHorizontal className="h-4 w-4 text-[#07A33E]" />
          Filtros
          {active > 0 && (
            <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-[#07A33E] px-1.5 text-[11px] font-bold text-white">
              {active}
            </span>
          )}
        </button>
      </SheetTrigger>
      <SheetContent className="flex w-full flex-col gap-0 border-[#E5E7EB] bg-white p-0 dark:border-border/40 dark:bg-[#0E1411] sm:max-w-[380px]">
        <SheetHeader className="border-b border-[#E5E7EB] px-6 py-5 dark:border-border/40">
          <SheetTitle className="flex items-center gap-2 text-base font-bold text-[#1F1F24] dark:text-white">
            <SlidersHorizontal className="h-4 w-4 text-[#07A33E]" />
            Filtros
          </SheetTitle>
        </SheetHeader>
        <form
          ref={restore}
          onSubmit={(e: FormEvent<HTMLFormElement>) => {
            e.preventDefault();
            apply(read(e.currentTarget));
          }}
          // reset dispara antes dos campos voltarem: lê no próximo tick
          onReset={(e) => {
            const form = e.currentTarget;
            setTimeout(() => apply(read(form)));
          }}
          className="flex min-h-0 flex-1 flex-col"
        >
          <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-6 py-5">{children}</div>
          <div className="grid grid-cols-2 gap-2 border-t border-[#E5E7EB] px-6 py-4 dark:border-border/40">
            <button type="reset" className={secondaryButton}>
              Limpar
            </button>
            <button type="submit" className={primaryButton}>
              Aplicar
            </button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-semibold text-[#73737D] dark:text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

export function PeriodFields() {
  return (
    <div className="grid gap-2">
      <Field label="De">
        <input type="date" name="date_from" className={fieldClass} />
      </Field>
      <Field label="Até">
        <input type="date" name="date_to" className={fieldClass} />
      </Field>
    </div>
  );
}

/** botão de filtros acima do conteúdo; o painel abre flutuando na lateral */
export function WithFilters({ filters, children }: { filters: ReactNode; children: ReactNode }) {
  return (
    <div className="space-y-5">
      <div className="flex justify-end">{filters}</div>
      {children}
    </div>
  );
}

export type Column<T> = {
  header: string;
  width: string;
  cell: (row: T) => ReactNode;
  className?: string;
};

export function DataTable<T extends { id: string | number }>({
  columns,
  page,
  isLoading,
  isError,
  onPageChange,
  onRowClick,
  empty = "Nenhum registro encontrado.",
  minWidth = 900,
}: {
  columns: Column<T>[];
  page?: Page<T, unknown>;
  isLoading: boolean;
  isError: boolean;
  onPageChange: (page: number) => void;
  onRowClick?: (row: T) => void;
  empty?: string;
  minWidth?: number;
}) {
  const rows = page?.data ?? [];
  const template = columns.map((c) => c.width).join(" ");

  return (
    <div className={cn(card, "overflow-hidden")}>
      <div className="overflow-x-auto">
        <div style={{ minWidth }}>
          <div
            style={{ gridTemplateColumns: template }}
            className="grid items-center gap-3 border-b border-[#E5E7EB] bg-[#FBFBFC] px-4 py-4 text-xs font-bold uppercase tracking-wide text-[#73737D] dark:border-border/40 dark:bg-white/[0.02] dark:text-muted-foreground"
          >
            {columns.map((c) => (
              <div key={c.header} className={c.className}>
                {c.header}
              </div>
            ))}
          </div>
          <div className="divide-y divide-[#E5E7EB] dark:divide-border/40">
            {rows.map((row) => (
              <div
                key={row.id}
                style={{ gridTemplateColumns: template }}
                onClick={onRowClick && (() => onRowClick(row))}
                className={cn(
                  "grid items-center gap-3 px-4 py-4 text-sm font-medium text-[#73737D] transition-colors hover:bg-[#07A33E]/5 dark:text-muted-foreground dark:hover:bg-primary/10",
                  onRowClick && "cursor-pointer",
                )}
              >
                {columns.map((c) => (
                  <div key={c.header} className={cn("min-w-0 truncate", c.className)}>
                    {c.cell(row)}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>

      {rows.length === 0 && (
        <p className="px-6 py-16 text-center text-sm font-semibold text-[#73737D] dark:text-muted-foreground">
          {isLoading ? "Carregando..." : isError ? "Não foi possível carregar." : empty}
        </p>
      )}

      {page && page.pagination.total > 0 && (
        <div className="flex items-center justify-between gap-4 border-t border-[#E5E7EB] px-4 py-1 dark:border-border/40">
          <span className="text-xs font-medium text-[#73737D] dark:text-muted-foreground">
            {page.pagination.total} registro(s)
          </span>
          {page.pagination.lastPage > 1 && (
            <Pagination
              currentPage={page.pagination.page}
              totalPages={page.pagination.lastPage}
              onPageChange={onPageChange}
            />
          )}
        </div>
      )}
    </div>
  );
}

/** célula de destaque (nome, valor) */
export const Strong = ({ children }: { children: ReactNode }) => (
  <span className="font-bold text-[#1F1F24] dark:text-white">{children}</span>
);

/** estado padrão de listagem: filtros + página, paginação no servidor */
export function useList<T, S = unknown>(key: string, path: string, defaults: Filters = {}) {
  const [filters, setFiltersState] = useState<Filters>(defaults);
  const [pageNumber, setPage] = useState(1);
  const query = useQuery({
    queryKey: [key, filters, pageNumber],
    queryFn: () => api.get<Page<T, S>>(path, { ...filters, page: pageNumber, per_page: 20 }),
    placeholderData: (previous) => previous,
  });
  const setFilters = (f: Filters) => {
    setFiltersState(f);
    setPage(1);
  };
  return { filters, setFilters, setPage, ...query };
}
