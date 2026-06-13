import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { JwtPayload } from '@inventario/types';

export const CurrentUser = createParamDecorator(
  (_data: keyof JwtPayload | undefined, ctx: ExecutionContext): JwtPayload | JwtPayload[keyof JwtPayload] => {
    const request = ctx.switchToHttp().getRequest<{ user: JwtPayload }>();
    const user = request.user;
    return _data ? user[_data] : user;
  },
);
