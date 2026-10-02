// Cliente Gatebox, Pix out (https://api.gatebox.com.br/v1/docs). Sem decorators:
// carrega no node --test.
import { createHash, createHmac, randomBytes } from 'crypto';
import type { Payment } from './entities';

export type PayoutStatus = 'queued' | 'sending' | 'processing' | 'paid' | 'failed';
export const PAYOUT_STATUSES: PayoutStatus[] = ['queued', 'sending', 'processing', 'paid', 'failed'];

const FAILED = ['ERROR', 'FAILED', 'REFUNDED', 'CANCEL', 'DROP'];
export const mapStatus = (s?: string): PayoutStatus =>
  s === 'COMPLETED' ? 'paid' : FAILED.includes(s ?? '') ? 'failed' : 'processing';

export const externalId = (p: Pick<Payment, 'id'>) => `lotepay-payment-${p.id}`;

/** headers X-Gatebox-* (HMAC), exigidos no saque quando o IP não está na allowlist */
export function signHeaders(secret: string, method: string, pathAndQuery: string, body: string,
  now = Date.now(), nonce = randomBytes(24).toString('base64url')) {
  const timestamp = String(Math.floor(now / 1000));
  const bodyHash = createHash('sha256').update(body, 'utf8').digest('hex');
  const canonical = ['v1', timestamp, nonce, method, pathAndQuery, bodyHash].join('\n');
  return {
    'X-Gatebox-Timestamp': timestamp,
    'X-Gatebox-Nonce': nonce,
    'X-Gatebox-Signature': `v1=sha256=${createHmac('sha256', secret).update(canonical, 'utf8').digest('hex')}`,
  };
}

export class GateboxError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

type Tx = { transactionId?: string; data?: { status?: string } };

export class Gatebox {
  private token?: { value: string; until: number };
  private readonly cfg = {
    url: process.env.GATEBOX_URL ?? 'https://api.gatebox.com.br',
    clientId: process.env.GATEBOX_CLIENT_ID ?? '',
    clientSecret: process.env.GATEBOX_CLIENT_SECRET ?? '',
    signingSecret: process.env.GATEBOX_SIGNING_SECRET ?? '',
  };

  get configured() {
    return !!(this.cfg.clientId && this.cfg.clientSecret);
  }

  private async call(method: string, path: string, body?: unknown, auth = true): Promise<any> {
    const raw = body === undefined ? '' : JSON.stringify(body); // assina os mesmos bytes que envia
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (auth) headers.Authorization = `Bearer ${await this.accessToken()}`;
    if (auth && method === 'POST' && this.cfg.signingSecret)
      Object.assign(headers, signHeaders(this.cfg.signingSecret, method, path, raw));

    const res = await fetch(this.cfg.url + path, {
      method,
      headers,
      body: raw || undefined,
      signal: AbortSignal.timeout(30_000),
    });
    const json = await res.json().catch(() => null);
    if (res.status === 401) this.token = undefined;
    if (!res.ok) {
      const msg = Array.isArray(json?.message) ? json.message.join(', ') : json?.message;
      throw new GateboxError(res.status, msg || `Gatebox HTTP ${res.status}`);
    }
    return json;
  }

  private async accessToken() {
    if (this.token && this.token.until > Date.now()) return this.token.value;
    const r = await this.call('POST', '/v1/customers/auth/token',
      { client_id: this.cfg.clientId, client_secret: this.cfg.clientSecret }, false);
    this.token = { value: r.access_token, until: Date.now() + (r.expires_in - 60) * 1000 };
    return this.token.value;
  }

  withdraw(p: Payment): Promise<Tx> {
    return this.call('POST', '/v1/customers/pix/withdraw', {
      amount: p.amountCents / 100,
      key: p.pixKey,
      name: p.name,
      documentNumber: p.cpf,
      externalId: externalId(p),
      ...(p.description && { description: p.description }),
    });
  }

  /** null = a Gatebox não conhece esse externalId */
  async find(p: Payment): Promise<Tx | null> {
    try {
      return await this.call('GET', `/v1/customers/pix/transaction?externalId=${encodeURIComponent(externalId(p))}`);
    } catch (e) {
      if (e instanceof GateboxError && e.status === 404) return null;
      throw e;
    }
  }
}
