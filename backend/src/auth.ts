import {
  Body,
  CanActivate,
  Controller,
  createParamDecorator,
  ExecutionContext,
  BadRequestException,
  ForbiddenException,
  Get,
  HttpCode,
  Injectable,
  Post,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcryptjs';
import { IsEmail, IsOptional, IsString, Matches } from 'class-validator';
import QRCode from 'qrcode';
import { Repository } from 'typeorm';
import { User } from './entities';
import { newSecret, otpauthUri, verifyTotp } from './totp';

const PUBLIC = 'public';
const ADMIN = 'admin';
export const Public = () => SetMetadata(PUBLIC, true);
export const AdminOnly = () => SetMetadata(ADMIN, true);
export const CurrentUser = createParamDecorator(
  (_: unknown, ctx: ExecutionContext) => ctx.switchToHttp().getRequest().user as User,
);

export const toApiUser = (u: User) => ({
  id: u.id,
  name: u.name,
  email: u.email,
  cpf: u.cpf,
  role: u.role,
  blocked: u.blocked,
  twofa_enabled: u.totpEnabled,
  created_at: u.createdAt,
});

/**
 * Guard global: toda rota exige login, exceto @Public(). Recarrega o usuário
 * a cada request, então bloquear/remover derruba a sessão na hora.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly reflector: Reflector,
    @InjectRepository(User) private readonly users: Repository<User>,
  ) {}

  async canActivate(ctx: ExecutionContext) {
    const targets = [ctx.getHandler(), ctx.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(PUBLIC, targets)) return true;

    const req = ctx.switchToHttp().getRequest();
    const token = req.headers.authorization?.replace(/^Bearer /, '');
    if (!token) throw new UnauthorizedException();

    let sub: string;
    try {
      ({ sub } = await this.jwt.verifyAsync<{ sub: string }>(token));
    } catch {
      throw new UnauthorizedException();
    }

    const user = await this.users.findOneBy({ id: sub });
    if (!user) throw new UnauthorizedException();
    if (user.blocked) throw new UnauthorizedException('Acesso bloqueado');
    if (this.reflector.getAllAndOverride<boolean>(ADMIN, targets) && user.role !== 'admin')
      throw new ForbiddenException('Acesso restrito a administradores');

    req.user = user;
    return true;
  }
}

export const TOTP_CODE = /^\d{6}$/;

/**
 * Valida o código do Google Authenticator e ativa o 2FA se ainda estava em setup.
 * Update condicional: o mesmo código não passa duas vezes (nem em paralelo).
 * 400 e não 401, pra não derrubar a sessão do admin que errou o código.
 */
export async function checkTotp(users: Repository<User>, user: User, code?: string) {
  const step = user.totpSecret && code ? verifyTotp(user.totpSecret, code, user.totpLastStep) : null;
  const ok =
    step != null &&
    (
      await users
        .createQueryBuilder()
        .update()
        .set({ totpLastStep: step, totpEnabled: true })
        .where('id = :id AND (totpLastStep IS NULL OR totpLastStep < :step)', { id: user.id, step })
        .execute()
    ).affected;
  if (!ok) throw new BadRequestException('Código de verificação inválido');
}

class LoginDto {
  @IsEmail() email: string;
  @IsString() password: string;
  @IsOptional() @Matches(TOTP_CODE, { message: 'Código deve ter 6 dígitos' }) code?: string;
}

@Controller('auth')
export class AuthController {
  constructor(
    private readonly jwt: JwtService,
    @InjectRepository(User) private readonly users: Repository<User>,
  ) {}

  @Public()
  @Post('login')
  @HttpCode(200)
  async login(@Body() body: LoginDto) {
    const user = await this.users.findOneBy({ email: body.email.toLowerCase().trim() });
    if (!user || !(await bcrypt.compare(body.password, user.passwordHash)))
      throw new UnauthorizedException('E-mail ou senha inválidos');
    if (user.blocked) throw new ForbiddenException('Seu acesso está bloqueado. Fale com o administrador.');

    // 2FA obrigatório: sem código, pede o código ou (1º acesso) mostra o QR pra cadastrar no app
    if (!body.code) {
      if (user.totpEnabled) return { twofa: 'required' };
      if (!user.totpSecret) await this.users.update(user.id, { totpSecret: (user.totpSecret = newSecret()) });
      return {
        twofa: 'setup',
        secret: user.totpSecret,
        qr: await QRCode.toDataURL(otpauthUri(user.email, user.totpSecret)),
      };
    }
    await checkTotp(this.users, user, body.code);
    user.totpEnabled = true;

    return { token: await this.jwt.signAsync({ sub: user.id }), user: toApiUser(user) };
  }

  @Get('me')
  me(@CurrentUser() user: User) {
    return toApiUser(user);
  }
}
