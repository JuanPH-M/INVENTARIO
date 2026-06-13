import { Module } from '@nestjs/common';
import { CreateUserUseCase } from './application/use-cases/create-user.use-case';
import { GetUsersUseCase } from './application/use-cases/get-users.use-case';
import { UpdateUserUseCase } from './application/use-cases/update-user.use-case';
import { UsersController } from './presentation/users.controller';

@Module({
  controllers: [UsersController],
  providers: [CreateUserUseCase, GetUsersUseCase, UpdateUserUseCase],
  exports: [GetUsersUseCase],
})
export class UsersModule {}
