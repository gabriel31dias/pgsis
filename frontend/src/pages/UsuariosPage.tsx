import { DataTable, Field, fieldClass, FilterPanel, PeriodFields, primaryButton, secondaryButton, Strong, useList, WithFilters, type Column } from "@/shared/components/kit";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/shared/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/shared/components/ui/dialog";
import { api, formatCpf, formatDate, useAuth, type User } from "@/shared/lib/api";
import { toast } from "@/shared/lib/toast";
import { cn } from "@/shared/lib/utils";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { KeyRound, Lock, LockOpen, Pencil, Plus, Trash2 } from "lucide-react";
import { useState, type FormEvent } from "react";

const iconButton =
  "inline-flex h-9 w-9 items-center justify-center rounded-xl text-[#1F1F24] transition-colors hover:bg-[#07A33E]/10 hover:text-[#07A33E] disabled:opacity-30 dark:text-white";

export function UsuariosPage() {
  const me = useAuth((s) => s.user);
  const queryClient = useQueryClient();
  const list = useList<User>("users", "/users");
  const [editing, setEditing] = useState<User | "new" | null>(null);
  const [removing, setRemoving] = useState<User | null>(null);

  const done = (message: string) => {
    toast.success(message);
    queryClient.invalidateQueries();
  };
  const fail = (e: Error) => toast.error("Não foi possível salvar", { description: e.message });

  const save = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      editing === "new" ? api.post("/users", body) : api.patch(`/users/${(editing as User).id}`, body),
    onSuccess: () => {
      done(editing === "new" ? "Usuário cadastrado" : "Usuário atualizado");
      setEditing(null);
    },
    onError: fail,
  });

  const toggleBlock = useMutation({
    mutationFn: (u: User) => api.patch(`/users/${u.id}`, { blocked: !u.blocked }),
    onSuccess: (_, u) => done(u.blocked ? `${u.name} desbloqueado` : `${u.name} bloqueado`),
    onError: fail,
  });

  const reset2fa = useMutation({
    mutationFn: (u: User) => api.patch(`/users/${u.id}`, { reset_2fa: true }),
    onSuccess: (_, u) => done(`2FA de ${u.name} resetado: novo cadastro do autenticador no próximo login`),
    onError: fail,
  });

  const remove = useMutation({
    mutationFn: (u: User) => api.delete(`/users/${u.id}`),
    onSuccess: (_, u) => {
      done(`${u.name} removido`);
      setRemoving(null);
    },
    onError: fail,
  });

  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const body = Object.fromEntries(new FormData(e.currentTarget));
    if (!body.password) delete body.password; // edição sem trocar senha
    save.mutate(body);
  };

  const columns: Column<User>[] = [
    { header: "Nome", width: "minmax(0,1.2fr)", cell: (u) => <Strong>{u.name}</Strong> },
    { header: "E-mail", width: "minmax(0,1.4fr)", cell: (u) => u.email },
    { header: "CPF", width: "130px", cell: (u) => formatCpf(u.cpf) },
    {
      header: "Perfil",
      width: "100px",
      cell: (u) => (
        <span className={cn("rounded-full px-3 py-1 text-xs font-bold", u.role === "admin" ? "bg-[#07A33E] text-white" : "bg-[#07A33E]/15 text-[#07A33E]")}>
          {u.role === "admin" ? "Admin" : "Usuário"}
        </span>
      ),
    },
    {
      header: "Acesso",
      width: "110px",
      cell: (u) => (
        <span className={cn("rounded-full px-3 py-1 text-xs font-bold", u.blocked ? "bg-destructive/15 text-destructive" : "bg-success/15 text-success")}>
          {u.blocked ? "Bloqueado" : "Ativo"}
        </span>
      ),
    },
    { header: "2FA", width: "90px", cell: (u) => (u.twofa_enabled ? "Ativo" : "Pendente") },
    { header: "Cadastro", width: "130px", cell: (u) => formatDate(u.created_at) },
    {
      header: "",
      width: "160px",
      className: "flex justify-end gap-1",
      cell: (u) => {
        const self = u.id === me?.id;
        return (
          <>
            <button type="button" title="Editar" aria-label={`Editar ${u.name}`} className={iconButton} onClick={() => setEditing(u)}>
              <Pencil className="h-4 w-4" />
            </button>
            <button
              type="button"
              disabled={self}
              title={u.blocked ? "Desbloquear acesso" : "Bloquear acesso"}
              aria-label={`${u.blocked ? "Desbloquear" : "Bloquear"} ${u.name}`}
              className={iconButton}
              onClick={() => toggleBlock.mutate(u)}
            >
              {u.blocked ? <LockOpen className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
            </button>
            <button
              type="button"
              disabled={!u.twofa_enabled || reset2fa.isPending}
              title="Resetar 2FA (celular perdido)"
              aria-label={`Resetar 2FA de ${u.name}`}
              className={iconButton}
              onClick={() => confirm(`Resetar o 2FA de ${u.name}? O autenticador será cadastrado de novo no próximo login.`) && reset2fa.mutate(u)}
            >
              <KeyRound className="h-4 w-4" />
            </button>
            <button
              type="button"
              disabled={self}
              title="Remover"
              aria-label={`Remover ${u.name}`}
              className={cn(iconButton, "hover:bg-destructive/10 hover:text-destructive")}
              onClick={() => setRemoving(u)}
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </>
        );
      },
    },
  ];

  const current = editing === "new" ? null : editing;

  return (
    <div className="space-y-5 pb-10 animate-fade-in">
      <div className="flex justify-end">
        <button type="button" onClick={() => setEditing("new")} className={primaryButton}>
          <Plus className="h-4 w-4" /> Novo usuário
        </button>
      </div>

      <WithFilters
        filters={
          <FilterPanel onApply={list.setFilters}>
            <Field label="Busca">
              <input name="search" placeholder="Nome, e-mail ou CPF" className={fieldClass} />
            </Field>
            <Field label="Perfil">
              <select name="role" className={fieldClass}>
                <option value="">Todos</option>
                <option value="admin">Admin</option>
                <option value="user">Usuário</option>
              </select>
            </Field>
            <Field label="Acesso">
              <select name="status" className={fieldClass}>
                <option value="">Todos</option>
                <option value="active">Ativo</option>
                <option value="blocked">Bloqueado</option>
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
        <DataTable columns={columns} page={list.data} isLoading={list.isLoading} isError={list.isError} onPageChange={list.setPage} minWidth={1100} />
      </WithFilters>

      <Dialog open={!!editing} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{current ? `Editar ${current.name}` : "Novo usuário"}</DialogTitle>
          </DialogHeader>
          {/* key: remonta o form ao trocar de usuário, resetando os defaultValue */}
          <form key={current?.id ?? "new"} onSubmit={submit} className="space-y-4">
            <Field label="Nome">
              <input name="name" required minLength={2} defaultValue={current?.name} className={fieldClass} />
            </Field>
            <Field label="E-mail">
              <input name="email" type="email" required defaultValue={current?.email} className={fieldClass} />
            </Field>
            <Field label="CPF (opcional)">
              <input name="cpf" inputMode="numeric" defaultValue={current?.cpf ? formatCpf(current.cpf) : ""} className={fieldClass} />
            </Field>
            <Field label={current ? "Nova senha (deixe em branco para manter)" : "Senha"}>
              <input name="password" type="password" minLength={6} required={!current} autoComplete="new-password" className={fieldClass} />
            </Field>
            <Field label="Perfil">
              <select name="role" defaultValue={current?.role ?? "user"} disabled={current?.id === me?.id} className={fieldClass}>
                <option value="user">Usuário</option>
                <option value="admin">Admin</option>
              </select>
            </Field>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" className={secondaryButton} onClick={() => setEditing(null)}>
                Cancelar
              </button>
              <button type="submit" disabled={save.isPending} className={primaryButton}>
                Salvar
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!removing} onOpenChange={(open) => !open && setRemoving(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover {removing?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              O acesso é excluído na hora. Lotes e pagamentos importados por ele continuam no histórico.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive hover:bg-destructive/90" onClick={() => removing && remove.mutate(removing)}>
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
