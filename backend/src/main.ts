import 'dotenv/config';
import { Logger, Module, ValidationPipe } from '@nestjs/common';
import { APP_GUARD, NestFactory } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import * as bcrypt from 'bcryptjs';
import { DataSource } from 'typeorm';
import { AuthController, AuthGuard } from './auth';
import { BatchesController, PaymentsController } from './batches.controller';
import { AuditController, DashboardController } from './dashboard.controller';
import { ENTITIES, User } from './entities';
import { PayoutWorker } from './payout';
import { UsersController } from './users.controller';

if (!process.env.JWT_SECRET) throw new Error('Defina JWT_SECRET no .env');

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'better-sqlite3',
      database: process.env.DB_PATH ?? 'data.sqlite',
      entities: ENTITIES,
      // ponytail: synchronize no lugar de migrations; trocar por migrations
      // antes de ter dado de produção que não pode ser perdido
      synchronize: true,
    }),
    TypeOrmModule.forFeature(ENTITIES),
    JwtModule.register({ secret: process.env.JWT_SECRET, signOptions: { expiresIn: '12h' } }),
  ],
  controllers: [
    AuthController,
    UsersController,
    BatchesController,
    PaymentsController,
    DashboardController,
    AuditController,
  ],
  providers: [{ provide: APP_GUARD, useClass: AuthGuard }, PayoutWorker],
})
class AppModule {}

/** primeiro boot: sem admin nenhum, cria um a partir do .env */
async function seedAdmin(db: DataSource) {
  const users = db.getRepository(User);
  if (await users.existsBy({ role: 'admin' })) return;
  const email = (process.env.ADMIN_EMAIL ?? 'admin@admin.com').toLowerCase();
  await users.save(
    users.create({
      name: 'Administrador',
      email,
      role: 'admin',
      passwordHash: await bcrypt.hash(process.env.ADMIN_PASSWORD ?? 'admin123', 10),
    }),
  );
  new Logger('Seed').warn(`Admin criado: ${email} — troque a senha no primeiro acesso`);
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api');
  app.enableCors({ origin: process.env.CORS_ORIGIN?.split(',') ?? true });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  await seedAdmin(app.get(DataSource));
  app.enableShutdownHooks();
  await app.listen(process.env.PORT ?? 8000);
}
void bootstrap();
