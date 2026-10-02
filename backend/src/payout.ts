// Worker em segundo plano do Pix out: aprovado → queued → sending → processing → paid | failed.
import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { DataSource, IsNull, LessThan } from 'typeorm';
import { Payment } from './entities';
import { Gatebox, GateboxError, mapStatus, type PayoutStatus } from './gatebox';

const NO_PIX_KEY = 'Sem chave Pix: a Gatebox só envia Pix por chave, não por agência/conta';

/**
 * ponytail: worker no mesmo processo, setInterval + SQLite como fila. Serve pra 1 instância;
 * com várias, os claims condicionais já evitam pagamento duplo, mas aí vale BullMQ/Redis.
 * Status por polling; webhook PIX_PAY_OUT entra quando houver URL pública.
 */
@Injectable()
export class PayoutWorker implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly log = new Logger('Payout');
  private timer?: NodeJS.Timeout;
  private running = false;
  gatebox = new Gatebox();

  constructor(private readonly db: DataSource) {}

  onApplicationBootstrap() {
    if (!this.gatebox.configured)
      return this.log.warn('GATEBOX_CLIENT_ID/SECRET ausentes: pagamentos aprovados ficam na fila');
    this.timer = setInterval(() => void this.tick(), Number(process.env.PAYOUT_INTERVAL_MS ?? 10_000));
  }

  onModuleDestroy() {
    clearInterval(this.timer);
  }

  async tick() {
    if (this.running) return;
    this.running = true;
    try {
      await this.send();
      await this.reconcile();
      await this.poll();
    } catch (e) {
      this.log.error(`tick: ${(e as Error).message}`);
    } finally {
      this.running = false;
    }
  }

  private get repo() {
    return this.db.getRepository(Payment);
  }

  private set(p: Payment, payoutStatus: PayoutStatus, extra: Partial<Payment> = {}) {
    return this.repo.update(p.id, {
      payoutStatus,
      payoutUpdatedAt: new Date(),
      ...(payoutStatus === 'paid' && { executedAt: new Date() }),
      ...extra,
    });
  }

  private async send() {
    await this.repo.update({ payoutStatus: 'queued', pixKey: IsNull() },
      { payoutStatus: 'failed', payoutError: NO_PIX_KEY, payoutUpdatedAt: new Date() });

    const queued = await this.repo.find({ where: { payoutStatus: 'queued' }, order: { id: 'ASC' }, take: 20 });
    for (const p of queued) {
      // claim: só quem muda queued → sending envia (nunca dois saques do mesmo pagamento)
      const { affected } = await this.repo.update({ id: p.id, payoutStatus: 'queued' },
        { payoutStatus: 'sending', payoutUpdatedAt: new Date() });
      if (!affected) continue;
      try {
        const tx = await this.gatebox.withdraw(p);
        await this.set(p, mapStatus(tx.data?.status), { gateboxTxId: tx.transactionId ?? null });
      } catch (e) {
        // 400 (saldo, chave inválida, externalId duplicado): confere se o saque existe antes de falhar.
        // Rede/5xx/403: resultado incerto, fica "sending" e o reconcile decide.
        if (e instanceof GateboxError && e.status === 400) {
          const tx = await this.gatebox.find(p);
          if (tx) await this.set(p, mapStatus(tx.data?.status), { gateboxTxId: tx.transactionId ?? null });
          else await this.set(p, 'failed', { payoutError: e.message });
        } else this.log.warn(`pagamento #${p.id}: ${(e as Error).message}`);
      }
    }
  }

  /** "sending" parado há 2 min: o saque chegou na Gatebox? sim → acompanha; não → volta pra fila */
  private async reconcile() {
    const stuck = await this.repo.find({
      where: { payoutStatus: 'sending', payoutUpdatedAt: LessThan(new Date(Date.now() - 120_000)) },
      take: 20,
    });
    for (const p of stuck) {
      const tx = await this.gatebox.find(p);
      if (tx) await this.set(p, mapStatus(tx.data?.status), { gateboxTxId: tx.transactionId ?? null });
      else await this.set(p, 'queued');
    }
  }

  private async poll() {
    const open = await this.repo.find({
      where: { payoutStatus: 'processing' },
      order: { payoutUpdatedAt: 'ASC' },
      take: 50,
    });
    for (const p of open) {
      const tx = await this.gatebox.find(p);
      const status = mapStatus(tx?.data?.status);
      if (status === 'processing') await this.set(p, 'processing'); // vai pro fim da fila do polling
      else await this.set(p, status, status === 'failed' ? { payoutError: `Gatebox: ${tx?.data?.status}` } : {});
    }
  }
}
