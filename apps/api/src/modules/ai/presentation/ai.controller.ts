import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { RequirePermissions } from '../../../common/decorators/require-permissions.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { PrismaService } from '../../../database/prisma.service';
import { AiEngineService } from '../application/ai-engine.service';
import { PERMISSIONS } from '@inventario/shared';
import type { JwtPayload } from '@inventario/types';

class ChatMessageDto {
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(2000) message!: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() conversationId?: string;
}

@ApiTags('Inteligencia Artificial')
@ApiBearerAuth()
@UseGuards(PermissionsGuard)
@Controller('ai')
export class AiController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly engine: AiEngineService,
  ) {}

  @Get('status')
  @RequirePermissions(PERMISSIONS.AI_READ)
  @ApiOperation({ summary: 'Estado del motor de IA (asistente con Claude o por reglas)' })
  status() {
    return { llmEnabled: this.engine.llmEnabled };
  }

  @Get('predictions/stock')
  @RequirePermissions(PERMISSIONS.AI_PREDICTIONS)
  @ApiOperation({ summary: 'Pronóstico de agotamiento y cantidad sugerida de reposición' })
  async getStockPredictions(@CurrentUser() user: JwtPayload, @Query('branchId') branchId?: string) {
    return this.engine.stockForecast(user.tenantId, branchId || undefined);
  }

  @Get('insights')
  @RequirePermissions(PERMISSIONS.AI_READ)
  @ApiOperation({ summary: 'Insights automáticos del negocio' })
  async getInsights(@CurrentUser() user: JwtPayload) {
    return this.engine.insights(user.tenantId);
  }

  @Post('chat')
  @RequirePermissions(PERMISSIONS.AI_CHAT)
  @ApiOperation({ summary: 'Asistente conversacional sobre los datos del negocio' })
  async chat(@Body() dto: ChatMessageDto, @CurrentUser() user: JwtPayload) {
    let conversation = dto.conversationId
      ? await this.prisma.aiConversation.findFirst({
          where: { id: dto.conversationId, tenantId: user.tenantId, userId: user.sub },
          include: { messages: { orderBy: { createdAt: 'asc' }, take: 20 } },
        })
      : null;

    if (!conversation) {
      conversation = await this.prisma.aiConversation.create({
        data: { tenantId: user.tenantId, userId: user.sub, title: dto.message.substring(0, 50) },
        include: { messages: true },
      });
    }

    const history = conversation.messages.map((m) => ({ role: m.role, content: m.content }));
    await this.prisma.aiMessage.create({
      data: { conversationId: conversation.id, role: 'user', content: dto.message },
    });

    const reply = await this.engine.answer(user.tenantId, dto.message, history);

    const aiMessage = await this.prisma.aiMessage.create({
      data: {
        conversationId: conversation.id,
        role: 'assistant',
        content: reply.content,
        tokensUsed: reply.tokens,
      },
    });
    await this.prisma.aiConversation.update({
      where: { id: conversation.id },
      data: { updatedAt: new Date() },
    });

    return {
      conversationId: conversation.id,
      message: reply.content,
      messageId: aiMessage.id,
      source: reply.source,
    };
  }

  @Get('conversations')
  @RequirePermissions(PERMISSIONS.AI_CHAT)
  @ApiOperation({ summary: 'Conversaciones del usuario' })
  async getConversations(@CurrentUser() user: JwtPayload) {
    return this.prisma.aiConversation.findMany({
      where: { tenantId: user.tenantId, userId: user.sub },
      orderBy: { updatedAt: 'desc' },
      take: 20,
      include: { _count: { select: { messages: true } } },
    });
  }

  @Get('conversations/:id')
  @RequirePermissions(PERMISSIONS.AI_CHAT)
  @ApiOperation({ summary: 'Mensajes de una conversación' })
  async getConversation(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: JwtPayload) {
    return this.prisma.aiConversation.findFirst({
      where: { id, tenantId: user.tenantId, userId: user.sub },
      include: { messages: { orderBy: { createdAt: 'asc' } } },
    });
  }
}
