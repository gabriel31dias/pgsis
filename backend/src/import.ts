// Colunas da planilha de pagamentos. Fonte da verdade: o modelo baixado no
// front (GET /api/batches/template) é gerado daqui.
// Destino: chave_pix OU banco + agencia + conta (pode ter os dois).
export const IMPORT_COLUMNS = ['nome', 'cpf', 'chave_pix', 'banco', 'agencia', 'conta', 'valor', 'descricao'] as const;
export const REQUIRED_COLUMNS = ['nome', 'cpf', 'valor'];
export const TEXT_COLUMNS = ['cpf', 'banco', 'agencia', 'conta']; // Excel não come zero à esquerda

export const IMPORT_EXAMPLE_ROWS = [
  ['Maria da Silva', '529.982.247-25', 'maria@email.com', '', '', '', '1.250,00', 'Comissão setembro'],
  ['João Pereira', '111.444.777-35', '', '001', '1234', '12345-6', '380,50', 'Reembolso'],
];

export const MAX_ROWS = 5000;

export type ParsedPayment = {
  name: string;
  cpf: string;
  pixKey: string | null;
  bankCode: string | null;
  agency: string | null;
  account: string | null;
  amountCents: number;
  description: string | null;
};

export type ImportError = { line: number; message: string };

export function isValidCpf(value: string) {
  const cpf = value.replace(/\D/g, '');
  if (cpf.length !== 11 || /^(\d)\1+$/.test(cpf)) return false;
  for (const size of [9, 10]) {
    let sum = 0;
    for (let i = 0; i < size; i++) sum += Number(cpf[i]) * (size + 1 - i);
    const digit = ((sum * 10) % 11) % 10;
    if (digit !== Number(cpf[size])) return false;
  }
  return true;
}

// aceita "1.250,00", "R$ 1250,5", "1250.50" e número vindo do Excel
export function parseAmountCents(value: string): number | null {
  const clean = value.replace(/[^\d,.-]/g, '');
  if (!clean) return null;
  const lastComma = clean.lastIndexOf(',');
  const lastDot = clean.lastIndexOf('.');
  const normalized =
    lastComma > lastDot
      ? clean.replace(/\./g, '').replace(',', '.')
      : clean.replace(/,/g, '');
  const number = Number(normalized);
  return Number.isFinite(number) ? Math.round(number * 100) : null;
}

/**
 * Valida as linhas da planilha. Linha 1 é o cabeçalho, então a primeira
 * linha de dados é a 2 — o número bate com o que o usuário vê no Excel.
 * Tudo ou nada: com qualquer erro o lote não é gravado.
 */
export function validateRows(rows: Record<string, string>[]) {
  const payments: ParsedPayment[] = [];
  const errors: ImportError[] = [];

  if (!rows.length) errors.push({ line: 0, message: 'Planilha sem linhas de pagamento' });
  if (rows.length > MAX_ROWS)
    errors.push({ line: 0, message: `Máximo de ${MAX_ROWS} pagamentos por lote` });

  rows.forEach((row, index) => {
    const line = index + 2;
    const fail = (message: string) => errors.push({ line, message });
    const name = row.nome?.trim();
    const cpf = (row.cpf ?? '').replace(/\D/g, '').padStart(11, '0');
    const pixKey = row.chave_pix?.trim() || null;
    const rawBank = row.banco?.replace(/\D/g, '');
    const bankCode = rawBank ? rawBank.padStart(3, '0') : null;
    const agency = row.agencia?.replace(/\s/g, '').toUpperCase() || null;
    const account = row.conta?.replace(/\s/g, '').toUpperCase() || null;
    const hasBank = !!(bankCode || agency || account);
    const amountCents = parseAmountCents(row.valor ?? '');

    if (!name) return fail('Nome obrigatório');
    if (!isValidCpf(cpf)) return fail(`CPF inválido: ${row.cpf ?? ''}`);
    if (!pixKey && !hasBank) return fail('Informe a chave Pix ou banco, agência e conta');
    if (hasBank) {
      if (!bankCode || bankCode.length !== 3) return fail(`Código do banco inválido (3 dígitos): ${row.banco ?? ''}`);
      if (!agency || !/^\d{1,5}(-?[\dX])?$/.test(agency)) return fail(`Agência inválida: ${row.agencia ?? ''}`);
      if (!account || !/^\d{1,20}-?[\dX]$/.test(account)) return fail(`Conta inválida (com dígito): ${row.conta ?? ''}`);
    }
    if (amountCents === null || amountCents <= 0) return fail(`Valor inválido: ${row.valor ?? ''}`);

    payments.push({
      name,
      cpf,
      pixKey,
      bankCode,
      agency,
      account,
      amountCents,
      description: row.descricao?.trim() || null,
    });
  });

  return { payments, errors };
}
