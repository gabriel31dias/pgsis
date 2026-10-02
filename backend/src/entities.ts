import {
  Column,
  CreateDateColumn,
  Entity,
  EntityManager,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';
import type { PayoutStatus } from './gatebox';

export type Role = 'admin' | 'user';
export type Status = 'pending' | 'approved' | 'rejected';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column() name: string;
  @Index({ unique: true }) @Column() email: string;
  @Column({ type: 'varchar', nullable: true }) cpf: string | null;
  @Column() passwordHash: string;
  @Column({ type: 'varchar', default: 'user' }) role: Role;
  @Column({ default: false }) blocked: boolean;
  // 2FA (Google Authenticator): secret gerado no 1º login, ativo após confirmar um código
  @Column({ type: 'varchar', nullable: true }) totpSecret: string | null;
  @Column({ default: false }) totpEnabled: boolean;
  @Column({ type: 'integer', nullable: true }) totpLastStep: number | null;
  @CreateDateColumn() createdAt: Date;
}

// ponytail: sem FKs. Lote/pagamento guardam id + nome de quem importou/aprovou,
// então remover usuário não apaga nem quebra o histórico.
@Entity('batches')
export class Batch {
  @PrimaryGeneratedColumn() id: number;
  @Column() name: string;
  @Column() fileName: string;
  @Index() @Column() userId: string;
  @Column() userName: string;
  @Index() @Column({ type: 'varchar', default: 'pending' }) status: Status;
  @Column({ type: 'integer' }) totalCents: number;
  @Column({ type: 'integer' }) count: number;
  @Column({ type: 'varchar', nullable: true }) reviewedById: string | null;
  @Column({ type: 'varchar', nullable: true }) reviewedByName: string | null;
  @Column({ type: 'datetime', nullable: true }) reviewedAt: Date | null;
  @Column({ type: 'varchar', nullable: true }) reviewNote: string | null;
  @Index() @CreateDateColumn() createdAt: Date;
}

@Entity('payments')
export class Payment {
  @PrimaryGeneratedColumn() id: number;
  @Index() @Column() batchId: number;
  @Index() @Column() userId: string;
  @Column() userName: string;
  @Column() name: string;
  @Index() @Column() cpf: string;
  @Column({ type: 'varchar', nullable: true }) pixKey: string | null;
  @Column({ type: 'varchar', nullable: true }) bankCode: string | null;
  @Column({ type: 'varchar', nullable: true }) agency: string | null;
  @Column({ type: 'varchar', nullable: true }) account: string | null;
  @Column({ type: 'integer' }) amountCents: number;
  @Column({ type: 'varchar', nullable: true }) description: string | null;
  @Index() @Column({ type: 'varchar', default: 'pending' }) status: Status;
  // Pix out pela Gatebox (payout.ts). executedAt = quando a Gatebox confirmou (COMPLETED).
  @Index() @Column({ type: 'varchar', nullable: true }) payoutStatus: PayoutStatus | null;
  @Column({ type: 'varchar', nullable: true }) payoutError: string | null;
  @Column({ type: 'varchar', nullable: true }) gateboxTxId: string | null;
  @Column({ type: 'datetime', nullable: true }) payoutUpdatedAt: Date | null;
  @Column({ type: 'datetime', nullable: true }) executedAt: Date | null;
  @Index() @CreateDateColumn() createdAt: Date;
}

@Entity('audit_logs')
export class AuditLog {
  @PrimaryGeneratedColumn() id: number;
  @Index() @Column() action: string;
  @Column() actorId: string;
  @Column() actorName: string;
  @Column() targetType: string;
  @Column() targetId: string;
  @Column() description: string;
  @Index() @CreateDateColumn() createdAt: Date;
}

export const ENTITIES = [User, Batch, Payment, AuditLog];

export const audit = (
  manager: EntityManager,
  actor: User,
  action: string,
  targetType: string,
  targetId: string | number,
  description: string,
) =>
  manager.insert(AuditLog, {
    action,
    actorId: actor.id,
    actorName: actor.name,
    targetType,
    targetId: String(targetId),
    description,
  });
