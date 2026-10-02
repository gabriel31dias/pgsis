import { Controller, Get, Query } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsIn, IsOptional, IsString } from 'class-validator';
import { DataSource, Repository } from 'typeorm';
import { AdminOnly, CurrentUser } from './auth';
import { applyPeriod, PageQuery, paginate, toReais } from './common';
import { AuditLog, User } from './entities';

const DAYS = 30;

@Controller('dashboard')
export class DashboardController {
  constructor(private readonly db: DataSource) {}

  /** mesmo endpoint para os dois perfis: admin vê tudo, usuário só o que importou */
  @Get()
  async get(@CurrentUser() user: User) {
    const isAdmin = user.role === 'admin';
    const where = isAdmin ? '1 = 1' : 'userId = ?';
    const params = isAdmin ? [] : [user.id];
    const q = <T>(sql: string, extra: unknown[] = []): Promise<T[]> =>
      this.db.query(sql.replaceAll('$WHERE', where), [...params, ...extra]);

    const [byStatus, daily, recent, topUsers, users] = await Promise.all([
      q<{ status: string; batches: number; payments: number; total: number }>(
        `SELECT status, COUNT(*) batches, SUM(count) payments, SUM(totalCents) total
           FROM batches WHERE $WHERE GROUP BY status`,
      ),
      q<{ day: string; status: string; total: number }>(
        `SELECT date(createdAt) day, status, SUM(amountCents) total
           FROM payments WHERE $WHERE AND createdAt >= date('now', ?)
          GROUP BY day, status ORDER BY day`,
        [`-${DAYS - 1} days`],
      ),
      q<Record<string, unknown>>(
        `SELECT id, name, userName user_name, status, totalCents, count, createdAt created_at
           FROM batches WHERE $WHERE ORDER BY id DESC LIMIT 6`,
      ),
      isAdmin
        ? q<{ user_name: string; batches: number; total: number }>(
            `SELECT userName user_name, COUNT(*) batches, SUM(totalCents) total
               FROM batches WHERE status = 'approved' GROUP BY userId ORDER BY total DESC LIMIT 5`,
          )
        : Promise.resolve([]),
      isAdmin
        ? q<{ total: number; blocked: number; admins: number }>(
            `SELECT COUNT(*) total, SUM(blocked) blocked, SUM(role = 'admin') admins FROM users`,
          )
        : Promise.resolve([]),
    ]);

    const status = (s: string) => {
      const row = byStatus.find((r) => r.status === s);
      return {
        batches: Number(row?.batches ?? 0),
        payments: Number(row?.payments ?? 0),
        total: toReais(Number(row?.total ?? 0)),
      };
    };

    // série contínua: dia sem movimento aparece como zero no gráfico
    const series = Array.from({ length: DAYS }, (_, i) => {
      const day = new Date(Date.now() - (DAYS - 1 - i) * 86_400_000).toISOString().slice(0, 10);
      const sum = (s: string) =>
        toReais(Number(daily.find((d) => d.day === day && d.status === s)?.total ?? 0));
      return { day, approved: sum('approved'), pending: sum('pending'), rejected: sum('rejected') };
    });

    return {
      summary: { pending: status('pending'), approved: status('approved'), rejected: status('rejected') },
      series,
      recent: recent.map(({ totalCents, ...b }) => ({ ...b, total: toReais(Number(totalCents)) })),
      top_users: topUsers.map((u) => ({ ...u, total: toReais(Number(u.total)) })),
      users: isAdmin
        ? {
            total: Number(users[0]?.total ?? 0),
            blocked: Number(users[0]?.blocked ?? 0),
            admins: Number(users[0]?.admins ?? 0),
          }
        : null,
    };
  }
}

class ListAuditQuery extends PageQuery {
  @IsOptional() @IsString() action?: string;
  @IsOptional() @IsString() actor?: string;
  @IsOptional() @IsString() search?: string;
  @IsOptional() @IsIn(['batch', 'user']) target_type?: string;
}

@AdminOnly()
@Controller('audit')
export class AuditController {
  constructor(@InjectRepository(AuditLog) private readonly logs: Repository<AuditLog>) {}

  @Get()
  async list(@Query() q: ListAuditQuery) {
    const qb = this.logs.createQueryBuilder('a');
    if (q.action) qb.andWhere('a.action = :action', { action: q.action });
    if (q.target_type) qb.andWhere('a.targetType = :t', { t: q.target_type });
    if (q.actor) qb.andWhere('a.actorName LIKE :actor', { actor: `%${q.actor}%` });
    if (q.search) qb.andWhere('(a.description LIKE :s OR a.targetId = :id)', { s: `%${q.search}%`, id: q.search.replace('#', '') });
    applyPeriod(qb, q).addOrderBy('a.id', q.order_by === 'oldest' ? 'ASC' : 'DESC');
    const page = await paginate(qb, q);
    return {
      ...page,
      data: page.data.map((a) => ({
        id: a.id,
        action: a.action,
        actor_name: a.actorName,
        target_type: a.targetType,
        target_id: a.targetId,
        description: a.description,
        created_at: a.createdAt,
      })),
    };
  }
}
