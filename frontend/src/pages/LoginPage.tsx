// Layout e campos do LoginPage/LoginForm do ~/loja
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { api, useAuth, type User } from "@/shared/lib/api";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { Navigate } from "react-router-dom";

const inputClass =
  "h-12 rounded-xl border-[#E5E7EB] bg-[#FBFBFC] px-4 text-sm font-medium text-[#1F1F24] placeholder:text-[#8C8C96] focus-visible:ring-[#07A33E]";

export function LoginPage() {
  const { user, setAuth } = useAuth();
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  // depois da senha: pede o código do Google Authenticator (com QR no 1º acesso)
  const [twofa, setTwofa] = useState<{ email: string; password: string; qr?: string; secret?: string } | null>(null);

  // a tela de login é sempre clara, como no ~/loja; o tema volta no painel
  useEffect(() => {
    const root = document.documentElement;
    const previous = root.classList.contains("dark") ? "dark" : "light";
    root.classList.replace("dark", "light");
    return () => {
      root.classList.replace("light", previous);
    };
  }, []);

  if (user) return <Navigate to="/dashboard" replace />;

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const credentials = twofa ?? { email: String(form.get("email")), password: String(form.get("password")) };
    setLoading(true);
    setError("");
    try {
      const res = await api.post<
        { token: string; user: User; twofa?: undefined } | { twofa: "required" | "setup"; qr?: string; secret?: string }
      >("/auth/login", { ...credentials, code: form.get("code") || undefined });
      if (res.twofa) setTwofa({ ...credentials, qr: res.qr, secret: res.secret });
      else setAuth(res.token, res.user);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F7F7FA] text-[#1F1F24] lg:grid lg:grid-cols-[minmax(0,1.08fr)_minmax(440px,0.92fr)]">
      <div className="relative hidden min-h-screen overflow-hidden bg-[#080C0A] lg:block">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(7,163,62,0.45),transparent_55%),radial-gradient(circle_at_80%_80%,rgba(7,163,62,0.25),transparent_50%)]" />
        <div className="absolute left-12 top-10 flex items-center gap-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#07A33E] font-extrabold text-white">LP</div>
          <span className="text-xl font-bold text-white">LotePay</span>
        </div>
        <div className="absolute bottom-12 left-12 max-w-[520px]">
          <h1 className="text-5xl font-bold leading-tight text-white">Pagamentos em lote, com aprovação</h1>
          <p className="mt-5 max-w-[440px] text-base font-medium leading-7 text-white/70">
            Importe sua planilha, acompanhe os lotes e veja cada pagamento executado.
          </p>
        </div>
      </div>

      <div className="flex min-h-screen items-center justify-center px-5 py-10 sm:px-8 lg:px-12">
        <div className="w-full max-w-[460px] animate-fade-in">
          <div className="mb-9">
            <h1 className="text-3xl font-bold leading-tight sm:text-4xl">Faça login</h1>
            <p className="mt-3 text-sm font-medium leading-6 text-[#73737D]">
              Acesse sua conta para continuar.
            </p>
          </div>

          <form
            onSubmit={submit}
            className="space-y-6 rounded-2xl border border-[#E5E7EB] bg-white p-6 shadow-[0_18px_60px_rgba(31,31,36,0.08)] sm:p-8"
          >
            {twofa ? (
              <div className="space-y-4">
                {twofa.qr ? (
                  <>
                    <p className="text-sm font-medium leading-6 text-[#73737D]">
                      Configure a verificação em duas etapas: escaneie o QR code com o <b>Google Authenticator</b> e digite o código gerado.
                    </p>
                    <img src={twofa.qr} alt="QR code do Google Authenticator" className="mx-auto h-48 w-48" />
                    <p className="break-all text-center font-mono text-xs text-[#73737D]">{twofa.secret}</p>
                  </>
                ) : (
                  <p className="text-sm font-medium leading-6 text-[#73737D]">Digite o código do Google Authenticator.</p>
                )}
                <div className="space-y-2">
                  <Label htmlFor="code" className="text-sm font-semibold">Código de verificação</Label>
                  <Input id="code" name="code" required autoFocus inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} placeholder="000000" className={`${inputClass} text-center tracking-[0.5em]`} disabled={loading} />
                </div>
                <button type="button" onClick={() => { setTwofa(null); setError(""); }} className="text-sm font-semibold text-[#07A33E] hover:text-[#058A34]">
                  Voltar
                </button>
              </div>
            ) : (
            <>
            <div className="space-y-2">
              <Label htmlFor="email" className="text-sm font-semibold">E-mail</Label>
              <Input id="email" name="email" type="email" required placeholder="exemplo@gmail.com" className={inputClass} disabled={loading} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="text-sm font-semibold">Senha</Label>
              <div className="relative">
                <Input
                  id="password"
                  name="password"
                  required
                  type={showPassword ? "text" : "password"}
                  placeholder="Digite sua senha"
                  className={`${inputClass} pr-12`}
                  disabled={loading}
                />
                <button
                  type="button"
                  aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-[#07A33E] hover:text-[#058A34]"
                >
                  {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
            </div>
            </>
            )}

            {error && (
              <p className="rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-center text-sm text-destructive">
                {error}
              </p>
            )}

            <Button
              type="submit"
              disabled={loading}
              className="h-12 w-full rounded-xl bg-[#07A33E] text-base font-bold text-white shadow-sm shadow-[#07A33E]/25 hover:bg-[#058A34]"
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Entrando...
                </>
              ) : (
                "Entrar"
              )}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
