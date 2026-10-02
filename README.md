# LotePay — pagamentos em lote

- `backend/` — NestJS + TypeORM + SQLite (`data.sqlite`)
- `frontend/` — React + Vite + Tailwind, design/componentes copiados do `~/loja`

## Rodar

```bash
cd backend && cp .env.example .env && npm install && npm run start:dev   # :8000
cd frontend && npm install && npm run dev                               # :8080 (proxy /api)
```

No primeiro boot é criado o admin do `.env` (`admin@admin.com` / `admin123`). Troque a senha.

## Perfis

**Usuário**: dashboard, importar planilha (.xlsx/.csv, modelo em "Baixar modelo"), meus lotes, meus pagamentos.
**Admin**: dashboard geral, aprovação de lotes, pagamentos executados (filtros por lote, nome, CPF, chave Pix,
descrição, quem importou, status, valor, período), usuários (cadastrar, editar, bloquear, remover), auditoria.

## Regras

- Planilha: colunas `nome, cpf, chave_pix, banco, agencia, conta, valor, descricao` (`backend/src/import.ts`).
  CPF validado pelo dígito. Destino: chave Pix **ou** banco (3 dígitos) + agência + conta com dígito.
  Qualquer linha inválida recusa o arquivo inteiro e devolve `{ errors: [{ line, message }] }`.
- Dinheiro em centavos no banco, reais na API.
- Bloquear/remover usuário derruba a sessão na próxima requisição.
- 2FA (Google Authenticator) obrigatório: no 1º login aparece o QR pra cadastrar; depois o login pede o código.
  Aprovar lote exige um código novo do admin. Celular perdido: admin reseta o 2FA em Usuários.
- Aprovação é atômica: dois admins no mesmo lote → o segundo recebe 409.
- Toda importação, aprovação, reprovação e mudança de usuário vai para `audit_logs`.
- Pix out pela Gatebox (`backend/src/gatebox.ts` + `payout.ts`): ao aprovar, os pagamentos entram na fila e um
  worker em segundo plano (no próprio backend, a cada `PAYOUT_INTERVAL_MS`) envia e acompanha até Pago/Falhou.
  Idempotente pelo `externalId` (`lotepay-payment-<id>`): nunca paga duas vezes. Configure `GATEBOX_*` no `.env`
  (sem credenciais o worker não roda). A Gatebox só paga por **chave Pix**: linha só com agência/conta falha.

Teste: `cd backend && npm test`.
