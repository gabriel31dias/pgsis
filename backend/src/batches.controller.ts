import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Res,
  UnprocessableEntityException,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { InjectRepository } from '@nestjs/typeorm';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsNumber, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import ExcelJS from 'exceljs';
import type { Response } from 'express';
import { extname } from 'path';
import { Readable } from 'stream';
import { DataSource, Repository, SelectQueryBuilder } from 'typeorm';
import { AdminOnly, checkTotp, CurrentUser, TOTP_CODE } from './auth';
import { applyPeriod, onlyDigits, PageQuery, paginate, toReais } from './common';
import { audit, Batch, Payment, Status, User } from './entities';
import { IMPORT_COLUMNS, IMPORT_EXAMPLE_ROWS, REQUIRED_COLUMNS, TEXT_COLUMNS, validateRows } from './import';
import { PAYOUT_STATUSES, type PayoutStatus } from './gatebox';

const STATUSES = ['pending', 'approved', 'rejected'];

const batchToApi = (b: Batch) => ({
  id: b.id,
  name: b.name,
  file_name: b.fileName,
  user_id: b.userId,
  user_name: b.userName,
  status: b.status,
  total: toReais(b.totalCents),
  count: b.count,
  reviewed_by_name: b.reviewedByName,
  reviewed_at: b.reviewedAt,
  review_note: b.reviewNote,
  created_at: b.createdAt,
});

const paymentToApi = (p: Payment) => ({
  id: p.id,
  batch_id: p.batchId,
  user_name: p.userName,
  name: p.name,
  cpf: p.cpf,
  pix_key: p.pixKey,
  bank_code: p.bankCode,
  agency: p.agency,
  account: p.account,
  amount: toReais(p.amountCents),
  description: p.description,
  status: p.status,
  payout_status: p.payoutStatus,
  payout_error: p.payoutError,
  executed_at: p.executedAt,
  created_at: p.createdAt,
});

/** usuário comum só enxerga o que ele mesmo importou */
const scope = <T extends Batch | Payment>(qb: SelectQueryBuilder<T>, user: User) =>
  user.role === 'admin' ? qb : qb.andWhere(`${qb.alias}.userId = :uid`, { uid: user.id });

async function readSheet(file: Express.Multer.File) {
  const wb = new ExcelJS.Workbook();
  const ext = extname(file.originalname).toLowerCase();
  const ws =
    ext === '.csv'
      ? await wb.csv.read(Readable.from(file.buffer), { parserOptions: { delimiter: detectDelimiter(file.buffer) } })
      : (await wb.xlsx.load(file.buffer as any), wb.worksheets[0]);
  if (!ws) throw new BadRequestException('Planilha vazia');

  const cellText = (cell: ExcelJS.Cell) =>
    typeof cell.value === 'object' && cell.value !== null ? cell.text : String(cell.value ?? '');
  const header = (ws.getRow(1).values as unknown[]).map((v) =>
    String(v ?? '').trim().toLowerCase(),
  );
  const missing = REQUIRED_COLUMNS.filter((c) => !header.includes(c));
  if (missing.length)
    throw new BadRequestException(`Colunas ausentes: ${missing.join(', ')}. Use o modelo.`);

  const rows: Record<string, string>[] = [];
  ws.eachRow((row, n) => {
    if (n === 1) return;
    const record: Record<string, string> = {};
    header.forEach((col, i) => col && (record[col] = cellText(row.getCell(i)).trim()));
    if (Object.values(record).some(Boolean)) rows.push(record);
  });
  return rows;
}

// Excel em pt-BR salva CSV com ";"
const detectDelimiter = (buffer: Buffer) => {
  const firstLine = buffer.toString('utf8').split(/\r?\n/)[0];
  return firstLine.split(';').length > firstLine.split(',').length ? ';' : ',';
};

class ListBatchesQuery extends PageQuery {
  @IsOptional() @IsIn(STATUSES) status?: Status;
  @IsOptional() @IsString() search?: string;
  @IsOptional() @IsString() user_name?: string;
}

class ImportDto {
  @IsOptional() @IsString() @MaxLength(120) name?: string;
}

class ApproveDto {
  @IsOptional() @IsString() @MaxLength(500) note?: string;
  @Matches(TOTP_CODE, { message: 'Informe o código de 6 dígitos do autenticador' }) code: string;
}

class RejectDto {
  @IsString() @MinLength(3) @MaxLength(500) note: string;
}

class ListPaymentsQuery extends PageQuery {
  @IsOptional() @Type(() => Number) @IsInt() batch_id?: number;
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() cpf?: string;
  @IsOptional() @IsString() pix_key?: string;
  @IsOptional() @IsString() user_name?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsIn(STATUSES) status?: Status;
  @IsOptional() @IsIn(PAYOUT_STATUSES) payout_status?: PayoutStatus;
  @IsOptional() @Type(() => Number) @IsNumber() min_amount?: number;
  @IsOptional() @Type(() => Number) @IsNumber() max_amount?: number;
  @IsOptional() @IsIn(['created', 'executed']) date_field?: string;
}

@Controller('batches')
export class BatchesController {
  constructor(
    private readonly db: DataSource,
    @InjectRepository(Batch) private readonly batches: Repository<Batch>,
    @InjectRepository(Payment) private readonly payments: Repository<Payment>,
    @InjectRepository(User) private readonly users: Repository<User>,
  ) {}

  @Get('template')
  async template(@Res() res: Response) {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('pagamentos');
    ws.addRow([...IMPORT_COLUMNS]).font = { bold: true };
    IMPORT_EXAMPLE_ROWS.forEach((r) => ws.addRow(r));
    ws.columns.forEach((c) => (c.width = 24));
    TEXT_COLUMNS.forEach((c) => (ws.getColumn(IMPORT_COLUMNS.indexOf(c as never) + 1).numFmt = '@'));

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="modelo-pagamentos.xlsx"');
    res.end(Buffer.from(await wb.xlsx.writeBuffer()));
  }

  @Post('import')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024 } }))
  async import(
    @CurrentUser() user: User,
    @UploadedFile() file: Express.Multer.File,
    @Body() body: ImportDto,
  ) {
    if (!file) throw new BadRequestException('Envie a planilha no campo "file"');
    if (!['.xlsx', '.csv'].includes(extname(file.originalname).toLowerCase()))
      throw new BadRequestException('Formato aceito: .xlsx ou .csv');

    let rows: Record<string, string>[];
    try {
      rows = await readSheet(file);
    } catch (e) {
      if (e instanceof BadRequestException) throw e;
      throw new BadRequestException('Não foi possível ler a planilha');
    }

    const { payments, errors } = validateRows(rows);
    if (errors.length)
      throw new UnprocessableEntityException({ message: 'Planilha com erros, nada foi importado', errors });

    const batch = await this.db.transaction(async (m) => {
      const saved = await m.save(
        m.create(Batch, {
          name: body.name?.trim() || file.originalname,
          fileName: file.originalname,
          userId: user.id,
          userName: user.name,
          totalCents: payments.reduce((sum, p) => sum + p.amountCents, 0),
          count: payments.length,
        }),
      );
      // ponytail: insert em blocos de 200 (limite de variáveis do SQLite)
      for (let i = 0; i < payments.length; i += 200)
        await m.insert(
          Payment,
          payments.slice(i, i + 200).map((p) => ({ ...p, batchId: saved.id, userId: user.id, userName: user.name })),
        );
      await audit(m, user, 'batch.import', 'batch', saved.id,
        `Importou o lote #${saved.id} "${saved.name}" com ${saved.count} pagamento(s)`);
      return saved;
    });
    return { success: true, data: batchToApi(batch) };
  }

  @Get()
  async list(@CurrentUser() user: User, @Query() q: ListBatchesQuery) {
    const qb = scope(this.batches.createQueryBuilder('b'), user);
    if (q.status) qb.andWhere('b.status = :status', { status: q.status });
    if (q.search)
      qb.andWhere('(b.name LIKE :s OR b.fileName LIKE :s OR CAST(b.id AS TEXT) = :id)', {
        s: `%${q.search}%`,
        id: q.search.replace('#', ''),
      });
    if (q.user_name) qb.andWhere('b.userName LIKE :u', { u: `%${q.user_name}%` });
    const page = await paginate(applyPeriod(qb, q), q);

    const summary = await scope(this.batches.createQueryBuilder('b'), user)
      .select('b.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .addSelect('SUM(b.totalCents)', 'total')
      .groupBy('b.status')
      .getRawMany<{ status: Status; count: number; total: number }>();

    return {
      ...page,
      data: page.data.map(batchToApi),
      summary: Object.fromEntries(
        STATUSES.map((s) => {
          const row = summary.find((r) => r.status === s);
          return [s, { count: Number(row?.count ?? 0), total: toReais(Number(row?.total ?? 0)) }];
        }),
      ),
    };
  }

  @Get(':id')
  async get(@CurrentUser() user: User, @Param('id', ParseIntPipe) id: number) {
    const batch = await scope(this.batches.createQueryBuilder('b'), user)
      .andWhere('b.id = :id', { id })
      .getOne();
    if (!batch) throw new NotFoundException();
    return batchToApi(batch);
  }

  @AdminOnly()
  @Post(':id/approve')
  async approve(@CurrentUser() admin: User, @Param('id', ParseIntPipe) id: number, @Body() body: ApproveDto) {
    await checkTotp(this.users, admin, body.code);
    return this.review(admin, id, 'approved', body.note);
  }

  @AdminOnly()
  @Post(':id/reject')
  reject(@CurrentUser() admin: User, @Param('id', ParseIntPipe) id: number, @Body() body: RejectDto) {
    return this.review(admin, id, 'rejected', body.note);
  }

  private async review(admin: User, id: number, status: Status, note?: string) {
    const batch = await this.db.transaction(async (m) => {
      const now = new Date();
      // update condicional: dois admins aprovando ao mesmo tempo, só um vence
      const { affected } = await m.update(
        Batch,
        { id, status: 'pending' },
        { status, reviewedById: admin.id, reviewedByName: admin.name, reviewedAt: now, reviewNote: note?.trim() || null },
      );
      if (!affected) {
        if (!(await m.existsBy(Batch, { id }))) throw new NotFoundException();
        throw new ConflictException('Lote já foi revisado');
      }
      // aprovado entra na fila do PayoutWorker; executedAt só quando a Gatebox confirmar
      await m.update(Payment, { batchId: id }, { status, payoutStatus: status === 'approved' ? 'queued' : null });
      const saved = await m.findOneByOrFail(Batch, { id });
      await audit(m, admin, status === 'approved' ? 'batch.approve' : 'batch.reject', 'batch', id,
        `${status === 'approved' ? 'Aprovou' : 'Reprovou'} o lote #${id} "${saved.name}" de ${saved.userName}` +
          (note ? ` — ${note}` : ''));
      return saved;
    });
    return { success: true, data: batchToApi(batch) };
  }
}

@Controller('payments')
export class PaymentsController {
  constructor(@InjectRepository(Payment) private readonly payments: Repository<Payment>) {}

  @Get()
  async list(@CurrentUser() user: User, @Query() q: ListPaymentsQuery) {
    const qb = scope(this.payments.createQueryBuilder('p'), user);
    const like = (column: string, value?: string) =>
      value && qb.andWhere(`${column} LIKE :${column.slice(2)}`, { [column.slice(2)]: `%${value}%` });

    if (q.batch_id) qb.andWhere('p.batchId = :batchId', { batchId: q.batch_id });
    if (q.status) qb.andWhere('p.status = :status', { status: q.status });
    if (q.payout_status) qb.andWhere('p.payoutStatus = :ps', { ps: q.payout_status });
    if (q.cpf) qb.andWhere('p.cpf LIKE :cpf', { cpf: `%${onlyDigits(q.cpf)}%` });
    like('p.name', q.name);
    like('p.pixKey', q.pix_key);
    like('p.userName', q.user_name);
    like('p.description', q.description);
    if (q.min_amount != null) qb.andWhere('p.amountCents >= :min', { min: Math.round(q.min_amount * 100) });
    if (q.max_amount != null) qb.andWhere('p.amountCents <= :max', { max: Math.round(q.max_amount * 100) });

    applyPeriod(qb, q, q.date_field === 'executed' ? 'p.executedAt' : 'p.createdAt');
    qb.addOrderBy('p.id', q.order_by === 'oldest' ? 'ASC' : 'DESC');

    // total da busca inteira, não só da página
    const totals = await qb
      .clone()
      .orderBy()
      .select('COUNT(*)', 'count')
      .addSelect('COALESCE(SUM(p.amountCents), 0)', 'total')
      .getRawOne<{ count: number; total: number }>();

    const page = await paginate(qb, q);
    return {
      ...page,
      data: page.data.map(paymentToApi),
      summary: { count: Number(totals?.count ?? 0), total: toReais(Number(totals?.total ?? 0)) },
    };
  }
}
