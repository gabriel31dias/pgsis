import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcryptjs';
import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import { DataSource, Repository } from 'typeorm';
import { AdminOnly, CurrentUser, toApiUser } from './auth';
import { applyPeriod, onlyDigits, PageQuery, paginate } from './common';
import { audit, Role, User } from './entities';
import { isValidCpf } from './import';

class ListUsersQuery extends PageQuery {
  @IsOptional() @IsString() search?: string;
  @IsOptional() @IsIn(['admin', 'user']) role?: Role;
  @IsOptional() @IsIn(['active', 'blocked']) status?: string;
}

class CreateUserDto {
  @IsString() @MinLength(2) name: string;
  @IsEmail() email: string;
  @IsOptional() @IsString() cpf?: string;
  @IsString() @MinLength(6) password: string;
  @IsIn(['admin', 'user']) role: Role;
}

class UpdateUserDto {
  @IsOptional() @IsString() @MinLength(2) name?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() cpf?: string;
  @IsOptional() @IsString() @MinLength(6) password?: string;
  @IsOptional() @IsIn(['admin', 'user']) role?: Role;
  @IsOptional() @IsBoolean() blocked?: boolean;
  /** celular perdido: o usuário recadastra o autenticador no próximo login */
  @IsOptional() @IsBoolean() reset_2fa?: boolean;
}

const checkCpf = (cpf?: string) => {
  const digits = onlyDigits(cpf);
  if (digits && !isValidCpf(digits)) throw new BadRequestException('CPF inválido');
  return digits || null;
};

@AdminOnly()
@Controller('users')
export class UsersController {
  constructor(
    private readonly db: DataSource,
    @InjectRepository(User) private readonly users: Repository<User>,
  ) {}

  @Get()
  async list(@Query() q: ListUsersQuery) {
    const qb = this.users.createQueryBuilder('u');
    if (q.search)
      qb.andWhere('(u.name LIKE :s OR u.email LIKE :s OR u.cpf LIKE :d)', {
        s: `%${q.search}%`,
        d: `%${onlyDigits(q.search) || q.search}%`,
      });
    if (q.role) qb.andWhere('u.role = :role', { role: q.role });
    if (q.status) qb.andWhere('u.blocked = :b', { b: q.status === 'blocked' });
    const page = await paginate(applyPeriod(qb, q), q);
    return { ...page, data: page.data.map(toApiUser) };
  }

  @Post()
  async create(@CurrentUser() actor: User, @Body() body: CreateUserDto) {
    const email = body.email.toLowerCase().trim();
    if (await this.users.existsBy({ email })) throw new ConflictException('E-mail já cadastrado');

    const user = await this.db.transaction(async (m) => {
      const created = await m.save(
        m.create(User, {
          name: body.name.trim(),
          email,
          cpf: checkCpf(body.cpf),
          role: body.role,
          passwordHash: await bcrypt.hash(body.password, 10),
        }),
      );
      await audit(m, actor, 'user.create', 'user', created.id, `Cadastrou ${created.name} (${created.role})`);
      return created;
    });
    return { success: true, data: toApiUser(user) };
  }

  @Patch(':id')
  async update(@CurrentUser() actor: User, @Param('id') id: string, @Body() body: UpdateUserDto) {
    const user = await this.users.findOneBy({ id });
    if (!user) throw new NotFoundException();
    if (user.id === actor.id && (body.blocked || body.role === 'user'))
      throw new BadRequestException('Você não pode bloquear ou rebaixar a si mesmo');

    if (body.email) {
      const email = body.email.toLowerCase().trim();
      if (email !== user.email && (await this.users.existsBy({ email })))
        throw new ConflictException('E-mail já cadastrado');
      user.email = email;
    }
    if (body.name) user.name = body.name.trim();
    if (body.cpf !== undefined) user.cpf = checkCpf(body.cpf);
    if (body.role) user.role = body.role;
    if (body.password) user.passwordHash = await bcrypt.hash(body.password, 10);
    if (body.reset_2fa) Object.assign(user, { totpSecret: null, totpEnabled: false, totpLastStep: null });

    const blockChanged = body.blocked !== undefined && body.blocked !== user.blocked;
    if (body.blocked !== undefined) user.blocked = body.blocked;

    await this.db.transaction(async (m) => {
      await m.save(user);
      if (blockChanged)
        await audit(m, actor, user.blocked ? 'user.block' : 'user.unblock', 'user', user.id,
          `${user.blocked ? 'Bloqueou' : 'Desbloqueou'} ${user.name}`);
      const edited = Object.keys(body).filter((k) => k !== 'blocked' && k !== 'password' && k !== 'reset_2fa');
      if (body.reset_2fa) await audit(m, actor, 'user.reset_2fa', 'user', user.id, `Resetou o 2FA de ${user.name}`);
      if (edited.length || body.password)
        await audit(m, actor, 'user.update', 'user', user.id,
          `Editou ${user.name}: ${[...edited, ...(body.password ? ['senha'] : [])].join(', ')}`);
    });
    return { success: true, data: toApiUser(user) };
  }

  @Delete(':id')
  async remove(@CurrentUser() actor: User, @Param('id') id: string) {
    if (id === actor.id) throw new BadRequestException('Você não pode remover a si mesmo');
    const user = await this.users.findOneBy({ id });
    if (!user) throw new NotFoundException();
    await this.db.transaction(async (m) => {
      await m.delete(User, { id });
      await audit(m, actor, 'user.delete', 'user', id, `Removeu ${user.name} (${user.email})`);
    });
    return { success: true };
  }
}
