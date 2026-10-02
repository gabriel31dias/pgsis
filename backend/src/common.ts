import { Type } from 'class-transformer';
import { IsDateString, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { ObjectLiteral, SelectQueryBuilder } from 'typeorm';

export class PageQuery {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) per_page = 20;
  @IsOptional() @IsDateString() date_from?: string;
  @IsOptional() @IsDateString() date_to?: string;
  @IsOptional() @IsString() order_by?: 'recent' | 'oldest';
}

export async function paginate<T extends ObjectLiteral>(
  qb: SelectQueryBuilder<T>,
  q: PageQuery,
) {
  const [data, total] = await qb
    .skip((q.page - 1) * q.per_page)
    .take(q.per_page)
    .getManyAndCount();
  return {
    data,
    pagination: {
      page: q.page,
      perPage: q.per_page,
      total,
      lastPage: Math.max(1, Math.ceil(total / q.per_page)),
    },
  };
}

/** createdAt entre date_from e date_to (inclusive, dia inteiro) + ordenação */
export function applyPeriod<T extends ObjectLiteral>(
  qb: SelectQueryBuilder<T>,
  q: PageQuery,
  column = `${qb.alias}.createdAt`,
) {
  if (q.date_from) qb.andWhere(`${column} >= :date_from`, { date_from: q.date_from.slice(0, 10) });
  if (q.date_to)
    qb.andWhere(`${column} < date(:date_to, '+1 day')`, { date_to: q.date_to.slice(0, 10) });
  qb.orderBy(column, q.order_by === 'oldest' ? 'ASC' : 'DESC');
  return qb;
}

export const onlyDigits = (value?: string | null) => (value ?? '').replace(/\D/g, '');
export const toReais = (cents: number) => Math.round(cents) / 100;
