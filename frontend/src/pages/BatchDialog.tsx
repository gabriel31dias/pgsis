import { card, DataTable, PayoutBadge, type PayoutStatus, fieldClass, primaryButton, secondaryButton, StatusBadge, Strong, type Column } from "@/shared/components/kit";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/shared/components/ui/dialog";
import { api, brl, formatCpf, formatDate, useAuth, type Page, type Status } from "@/shared/lib/api";
import { toast } from "@/shared/lib/toast";
import { cn } from "@/shared/lib/utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, X } from "lucide-react";
import { useState } from "react";

export interface Batch {
  id: number;
  name: string;
  file_name: string;
  user_name: string;
  status: Status;
  total: number;
  count: number;
  reviewed_by_name: string | null;
  reviewed_at: string | null;
  review_note: string | null;
  created_at: string;
}

export interface Payment {
  id: number;
  batch_id: number;
  user_name: string;
  name: string;
  cpf: string;
  pix_key: string | null;
  bank_code: string | null;
  agency: string | null;
  account: string | null;
  amount: number;
  description: string | null;
  status: Status;
  payout_status: PayoutStatus | null;
  payout_error: string | null;
  executed_at: string | null;
  created_at: string;
}

/** chave Pix e/ou "Banco 001 · Ag 1234 · CC 12345-6" */
export const destino = (p: Payment) =>
  [p.pix_key && `Pix ${p.pix_key}`, p.bank_code && `Banco ${p.bank_code} · Ag ${p.agency} · CC ${p.account}`]
    .filter(Boolean)
    .join(" | ") || "—";

const columns: Column<Payment>[] = [
  { header: "Nome", width: "minmax(0,1.4fr)", cell: (p) => <Strong>{p.name}</Strong> },
  { header: "CPF", width: "130px", cell: (p) => formatCpf(p.cpf) },
  { header: "Destino", width: "minmax(0,1.2fr)", cell: destino },
  { header: "Descrição", width: "minmax(0,1fr)", cell: (p) => p.description ?? "—" },
  { header: "Valor", width: "120px", className: "text-right", cell: (p) => <Strong>{brl(p.amount)}</Strong> },
  { header: "Pix", width: "110px", cell: (p) => <PayoutBadge status={p.payout_status} error={p.payout_error} /> },
];

export function BatchDialog({ batch, onClose }: { batch: Batch | null; onClose: () => void }) {
  const isAdmin = useAuth((s) => s.user?.role === "admin");
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [note, setNote] = useState("");
  const [code, setCode] = useState("");

  const payments = useQuery({
    queryKey: ["batch-payments", batch?.id, page],
    queryFn: () => api.get<Page<Payment>>("/payments", { batch_id: batch!.id, page, order_by: "oldest" }),
    enabled: !!batch,
    placeholderData: (previous) => previous,
  });

  const review = useMutation({
    mutationFn: (action: "approve" | "reject") => api.post(`/batches/${batch!.id}/${action}`, { note: note || undefined, ...(action === "approve" && { code }) }),
    onSuccess: (_, action) => {
      toast.success(action === "approve" ? `Lote #${batch!.id} aprovado` : `Lote #${batch!.id} reprovado`);
      queryClient.invalidateQueries();
      close();
    },
    onError: (e: Error) => {
      setCode("");
      toast.error("Não foi possível revisar", { description: e.message });
    },
  });

  const close = () => {
    setPage(1);
    setNote("");
    setCode("");
    onClose();
  };

  return (
    <Dialog open={!!batch} onOpenChange={(open) => !open && close()}>
      <DialogContent className="max-h-[90vh] max-w-5xl overflow-y-auto">
        {batch && (
          <>
            <DialogHeader>
              <DialogTitle className="flex flex-wrap items-center gap-3">
                Lote #{batch.id} — {batch.name}
                <StatusBadge status={batch.status} />
              </DialogTitle>
            </DialogHeader>

            <div className="grid gap-3 text-sm sm:grid-cols-4">
              {[
                ["Importado por", batch.user_name],
                ["Data", formatDate(batch.created_at)],
                ["Pagamentos", String(batch.count)],
                ["Total", brl(batch.total)],
              ].map(([label, value]) => (
                <div key={label} className={cn(card, "p-3")}>
                  <p className="text-xs font-medium text-muted-foreground">{label}</p>
                  <p className="truncate font-bold text-[#1F1F24] dark:text-white">{value}</p>
                </div>
              ))}
            </div>

            {batch.reviewed_by_name && (
              <p className="text-sm text-muted-foreground">
                {batch.status === "approved" ? "Aprovado" : "Reprovado"} por <Strong>{batch.reviewed_by_name}</Strong> em{" "}
                {formatDate(batch.reviewed_at)}
                {batch.review_note && <> — “{batch.review_note}”</>}
              </p>
            )}

            <DataTable
              columns={columns}
              page={payments.data}
              isLoading={payments.isLoading}
              isError={payments.isError}
              onPageChange={setPage}
              minWidth={880}
            />

            {isAdmin && batch.status === "pending" && (
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                <label className="flex flex-1 flex-col gap-1.5">
                  <span className="text-xs font-semibold text-muted-foreground">Observação (obrigatória para reprovar)</span>
                  <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} className={fieldClass} />
                </label>
                <button
                  type="button"
                  disabled={review.isPending || note.trim().length < 3}
                  onClick={() => review.mutate("reject")}
                  className={cn(secondaryButton, "hover:border-destructive/40 hover:text-destructive")}
                >
                  <X className="h-4 w-4" /> Reprovar
                </button>
                <label className="flex flex-col gap-1.5 sm:w-36">
                  <span className="text-xs font-semibold text-muted-foreground">Código 2FA</span>
                  <input
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    placeholder="000000"
                    aria-label="Código do Google Authenticator"
                    className={cn(fieldClass, "text-center tracking-[0.3em]")}
                  />
                </label>
                <button type="button" disabled={review.isPending || code.length !== 6} onClick={() => review.mutate("approve")} className={primaryButton}>
                  <Check className="h-4 w-4" /> Aprovar lote
                </button>
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** colunas da lista de lotes, usadas na tela do usuário e na do admin */
export const batchColumns = (showUser: boolean): Column<Batch>[] => [
  { header: "Lote", width: "70px", cell: (b) => <span className="font-bold text-[#07A33E]">#{b.id}</span> },
  { header: "Nome", width: "minmax(0,1.4fr)", cell: (b) => <Strong>{b.name}</Strong> },
  ...(showUser ? [{ header: "Importado por", width: "minmax(0,1fr)", cell: (b: Batch) => b.user_name }] : []),
  { header: "Data", width: "130px", cell: (b) => formatDate(b.created_at) },
  { header: "Qtd.", width: "60px", className: "text-center", cell: (b) => b.count },
  { header: "Total", width: "130px", className: "text-right", cell: (b) => <Strong>{brl(b.total)}</Strong> },
  { header: "Status", width: "120px", cell: (b) => <StatusBadge status={b.status} /> },
  { header: "Revisado por", width: "minmax(0,1fr)", cell: (b) => b.reviewed_by_name ?? "—" },
];
