import { card, fieldClass, primaryButton, secondaryButton } from "@/shared/components/kit";
import { api, ApiError, brl } from "@/shared/lib/api";
import { toast } from "@/shared/lib/toast";
import { cn } from "@/shared/lib/utils";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Download, FileSpreadsheet, Loader2, Upload } from "lucide-react";
import { useRef, useState, type FormEvent } from "react";
import type { Batch } from "./BatchDialog";
import { BatchesList } from "./LotesPage";

const COLUMNS = [
  ["nome", "Nome do favorecido"],
  ["cpf", "CPF (com ou sem pontuação)"],
  ["chave_pix", "Chave Pix (ou preencha banco, agência e conta)"],
  ["banco", "Código do banco, 3 dígitos, ex.: 001"],
  ["agencia", "Agência, ex.: 1234"],
  ["conta", "Conta com dígito, ex.: 12345-6"],
  ["valor", "Valor em reais, ex.: 1.250,00"],
  ["descricao", "Opcional"],
];

export function ImportarPage() {
  const queryClient = useQueryClient();
  const formRef = useRef<HTMLFormElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [errors, setErrors] = useState<{ line: number; message: string }[]>([]);

  const upload = useMutation({
    mutationFn: (form: FormData) => api.post<{ data: Batch }>("/batches/import", form),
    onSuccess: ({ data }) => {
      toast.success(`Lote #${data.id} enviado para aprovação`, {
        description: `${data.count} pagamento(s) · ${brl(data.total)}`,
      });
      formRef.current?.reset();
      setFile(null);
      setErrors([]);
      queryClient.invalidateQueries();
    },
    onError: (e: Error) => {
      setErrors(e instanceof ApiError ? (e.body?.errors ?? []) : []);
      toast.error("Importação recusada", { description: e.message });
    },
  });

  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!file) return toast.error("Selecione a planilha");
    upload.mutate(new FormData(e.currentTarget));
  };

  return (
    <div className="space-y-5 pb-10 animate-fade-in">
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <form ref={formRef} onSubmit={submit} className={cn(card, "space-y-4 p-5")}>
          <div>
            <h2 className="font-bold text-[#1F1F24] dark:text-white">Importar planilha de pagamentos</h2>
            <p className="text-xs font-medium text-muted-foreground">
              Arquivo .xlsx ou .csv de até 5 MB. O lote entra como pendente até o administrador aprovar.
            </p>
          </div>

          <label
            className={cn(
              "relative flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-[#07A33E]/30 px-6 py-10 text-center transition-colors hover:border-[#07A33E] hover:bg-[#07A33E]/5",
              file && "border-[#07A33E] bg-[#07A33E]/5",
            )}
          >
            <FileSpreadsheet className="h-8 w-8 text-[#07A33E]" />
            <span className="text-sm font-semibold text-[#1F1F24] dark:text-white">
              {file ? file.name : "Clique para escolher a planilha"}
            </span>
            <span className="text-xs text-muted-foreground">
              {file ? `${(file.size / 1024).toFixed(0)} KB` : "ou arraste o arquivo aqui"}
            </span>
            <input
              type="file"
              name="file"
              accept=".xlsx,.csv"
              // input transparente por cima da área: clique e arrastar-soltar nativos
              className="absolute inset-0 cursor-pointer opacity-0"
              onChange={(e) => {
                setFile(e.target.files?.[0] ?? null);
                setErrors([]);
              }}
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-muted-foreground">Nome do lote (opcional)</span>
            <input name="name" maxLength={120} placeholder="Ex.: Comissões setembro" className={fieldClass} />
          </label>

          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" className={secondaryButton} onClick={() => api.download("/batches/template", "modelo-pagamentos.xlsx")}>
              <Download className="h-4 w-4 text-[#07A33E]" /> Baixar modelo
            </button>
            <button type="submit" disabled={upload.isPending} className={primaryButton}>
              {upload.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              Enviar para aprovação
            </button>
          </div>

          {errors.length > 0 && (
            <div className="rounded-xl border border-destructive/20 bg-destructive/10 p-4">
              <p className="mb-2 flex items-center gap-2 text-sm font-bold text-destructive">
                <AlertTriangle className="h-4 w-4" /> Corrija a planilha — nada foi importado
              </p>
              <ul className="max-h-48 space-y-1 overflow-y-auto text-sm text-destructive">
                {errors.map((err, i) => (
                  <li key={i}>{err.line > 0 ? `Linha ${err.line}: ` : ""}{err.message}</li>
                ))}
              </ul>
            </div>
          )}
        </form>

        <div className={cn(card, "p-5")}>
          <h2 className="mb-1 font-bold text-[#1F1F24] dark:text-white">Modelo da planilha</h2>
          <p className="mb-4 text-xs font-medium text-muted-foreground">
            A primeira linha precisa ter exatamente estes cabeçalhos. Baixe o modelo para começar com o formato certo.
          </p>
          <div className="divide-y divide-[#E5E7EB] text-sm dark:divide-border/40">
            {COLUMNS.map(([col, hint]) => (
              <div key={col} className="flex items-center justify-between gap-3 py-2">
                <code className="rounded-md bg-[#07A33E]/10 px-2 py-0.5 text-xs font-bold text-[#07A33E]">{col}</code>
                <span className="text-right text-muted-foreground">{hint}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <h2 className="pt-2 text-lg font-bold text-[#1F1F24] dark:text-white">Meus lotes</h2>
      <BatchesList admin={false} />
    </div>
  );
}
