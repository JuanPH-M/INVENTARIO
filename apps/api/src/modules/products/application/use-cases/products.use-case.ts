import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import * as QRCode from 'qrcode';
import { PrismaService } from '../../../../database/prisma.service';
import { StorageService } from '../../../../storage/storage.service';
import { parsePaginationParams, paginate } from '../../../../common/utils/pagination.util';
import type { CreateProductDto, UpdateProductDto, CreateJewelryDetailsDto, GetProductsQueryDto } from '../dtos/product.dto';
import type { PaginatedResponse } from '@inventario/types';
import type { Prisma } from '@prisma/client';

@Injectable()
export class ProductsUseCase {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storageService: StorageService,
  ) {}

  async create(dto: CreateProductDto, tenantId: string, createdById: string) {
    if (dto.internalCode) {
      const existing = await this.prisma.product.findFirst({
        where: { tenantId, internalCode: dto.internalCode, deletedAt: null },
      });
      if (existing) throw new ConflictException('Ya existe un producto con ese código interno');
    }

    await this.checkProductLimit(tenantId);

    const product = await this.prisma.product.create({
      data: {
        tenantId,
        name: dto.name,
        categoryId: dto.categoryId,
        supplierId: dto.supplierId,
        internalCode: dto.internalCode,
        barcode: dto.barcode,
        sku: dto.sku,
        description: dto.description,
        shortDescription: dto.shortDescription,
        brand: dto.brand,
        model: dto.model,
        type: dto.type ?? 'physical',
        status: 'active',
        costPrice: dto.costPrice ?? 0,
        salePrice: dto.salePrice ?? 0,
        minSalePrice: dto.minSalePrice ?? 0,
        unitOfMeasure: dto.unitOfMeasure ?? 'unit',
        trackInventory: dto.trackInventory ?? true,
        minStock: dto.minStock ?? 0,
        maxStock: dto.maxStock,
        reorderPoint: dto.reorderPoint ?? 0,
        taxRate: dto.taxRate ?? 0,
        taxIncluded: dto.taxIncluded ?? false,
        defaultLocation: dto.defaultLocation,
        metadata: (dto.metadata ?? {}) as object,
        createdById,
      },
    });

    await this.prisma.productEvent.create({
      data: {
        productId: product.id,
        tenantId,
        type: 'created',
        description: `Producto "${product.name}" creado`,
        performedById: createdById,
      },
    });

    return product;
  }

  async findMany(tenantId: string, query: GetProductsQueryDto): Promise<PaginatedResponse<unknown>> {
    const { page, limit, skip } = parsePaginationParams(query.page, query.limit);

    const where: Prisma.ProductWhereInput = {
      tenantId,
      deletedAt: null,
      ...(query.status ? { status: query.status } : {}),
      ...(query.type ? { type: query.type } : {}),
      ...(query.categoryId ? { categoryId: query.categoryId } : {}),
      ...(query.supplierId ? { supplierId: query.supplierId } : {}),
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: 'insensitive' } },
              { internalCode: { contains: query.search, mode: 'insensitive' } },
              { barcode: { contains: query.search, mode: 'insensitive' } },
              { sku: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          category: { select: { id: true, name: true } },
          supplier: { select: { id: true, name: true } },
          inventoryStock: { select: { branchId: true, quantity: true, reserved: true } },
        },
      }),
      this.prisma.product.count({ where }),
    ]);

    return paginate(items, total, page, limit);
  }

  async findById(productId: string, tenantId: string) {
    const product = await this.prisma.product.findFirst({
      where: { id: productId, tenantId, deletedAt: null },
      include: {
        category: true,
        supplier: { select: { id: true, name: true, phone: true, email: true } },
        jewelryDetails: true,
        inventoryStock: { include: { branch: { select: { name: true } } } },
      },
    });
    if (!product) throw new NotFoundException('Producto no encontrado');
    return product;
  }

  async update(
    productId: string,
    tenantId: string,
    dto: UpdateProductDto,
    updatedById: string,
  ) {
    const product = await this.prisma.product.findFirst({
      where: { id: productId, tenantId, deletedAt: null },
    });
    if (!product) throw new NotFoundException('Producto no encontrado');

    const changed: Record<string, unknown> = {};
    if (dto.salePrice !== undefined && dto.salePrice !== Number(product.salePrice)) {
      changed['salePriceBefore'] = Number(product.salePrice);
      changed['salePriceAfter'] = dto.salePrice;
    }

    const updated = await this.prisma.product.update({
      where: { id: productId },
      data: dto as Parameters<typeof this.prisma.product.update>[0]['data'],
    });

    if (Object.keys(changed).length > 0) {
      await this.prisma.productEvent.create({
        data: {
          productId,
          tenantId,
          type: 'price_change',
          description: `Precio actualizado de $${changed['salePriceBefore']} a $${changed['salePriceAfter']}`,
          metadata: changed as object,
          performedById: updatedById,
        },
      });
    } else {
      await this.prisma.productEvent.create({
        data: {
          productId,
          tenantId,
          type: 'info_update',
          description: 'Información del producto actualizada',
          performedById: updatedById,
        },
      });
    }

    return updated;
  }

  async delete(productId: string, tenantId: string) {
    const product = await this.prisma.product.findFirst({
      where: { id: productId, tenantId, deletedAt: null },
      include: {
        inventoryStock: { select: { quantity: true } },
      },
    });
    if (!product) throw new NotFoundException();

    const totalStock = product.inventoryStock.reduce(
      (sum, s) => sum + Number(s.quantity),
      0,
    );
    if (totalStock > 0) {
      throw new BadRequestException(
        `No se puede eliminar: el producto tiene ${totalStock} unidades en stock`,
      );
    }

    await this.prisma.product.update({
      where: { id: productId },
      data: { deletedAt: new Date(), status: 'discontinued' },
    });
  }

  async generateQrCode(productId: string, tenantId: string): Promise<string> {
    const product = await this.prisma.product.findFirst({
      where: { id: productId, tenantId },
      select: { id: true, name: true, internalCode: true, barcode: true },
    });
    if (!product) throw new NotFoundException();

    const qrData = JSON.stringify({
      id: product.id,
      code: product.internalCode ?? product.barcode ?? product.id,
      name: product.name,
    });

    const qrDataUrl = await QRCode.toDataURL(qrData, {
      errorCorrectionLevel: 'H',
      type: 'image/png',
      width: 300,
    });

    await this.prisma.product.update({
      where: { id: productId },
      data: { qrCode: qrData },
    });

    return qrDataUrl;
  }

  async upsertJewelryDetails(
    productId: string,
    tenantId: string,
    dto: CreateJewelryDetailsDto,
    updatedById: string,
  ) {
    const product = await this.prisma.product.findFirst({
      where: { id: productId, tenantId },
    });
    if (!product) throw new NotFoundException();
    if (product.type !== 'jewelry') {
      throw new BadRequestException('Solo productos de tipo joyería pueden tener detalles de joyería');
    }

    const details = await this.prisma.productJewelryDetail.upsert({
      where: { productId },
      create: { ...dto, productId, tenantId, stones: (dto.stones ?? []) as Prisma.InputJsonValue },
      update: { ...dto, stones: (dto.stones ?? []) as Prisma.InputJsonValue },
    });

    await this.prisma.productEvent.create({
      data: {
        productId,
        tenantId,
        type: 'jewelry_update',
        description: 'Detalles de joyería actualizados',
        performedById: updatedById,
      },
    });

    return details;
  }

  async getTimeline(productId: string, tenantId: string) {
    const [events, movements, saleItems] = await Promise.all([
      this.prisma.productEvent.findMany({
        where: { productId, tenantId },
        orderBy: { occurredAt: 'desc' },
        take: 100,
      }),
      this.prisma.inventoryMovement.findMany({
        where: { productId, tenantId },
        orderBy: { performedAt: 'desc' },
        take: 50,
        select: {
          id: true,
          type: true,
          quantity: true,
          direction: true,
          stockBefore: true,
          stockAfter: true,
          notes: true,
          performedAt: true,
          performedById: true,
          branch: { select: { name: true } },
        },
      }),
      this.prisma.saleItem.findMany({
        where: { productId, sale: { tenantId, status: 'completed' } },
        orderBy: { createdAt: 'desc' },
        take: 50,
        include: { sale: { select: { saleNumber: true, createdAt: true, total: true } } },
      }),
    ]);

    const timeline = [
      ...events.map((e) => ({
        id: e.id,
        type: e.type,
        description: e.description,
        metadata: e.metadata,
        occurredAt: e.occurredAt,
      })),
      ...movements.map((m) => ({
        id: m.id,
        type: `movement_${m.type}`,
        description: `Movimiento de inventario: ${m.type} — ${m.quantity} unidades en ${m.branch.name}`,
        metadata: { ...m, branchName: m.branch.name },
        occurredAt: m.performedAt,
      })),
      ...saleItems.map((si) => ({
        id: si.id,
        type: 'sale',
        description: `Vendido — ${si.quantity} unidades en venta #${si.sale.saleNumber}`,
        metadata: { saleNumber: si.sale.saleNumber, quantity: si.quantity, total: si.sale.total },
        occurredAt: si.sale.createdAt,
      })),
    ].sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime());

    return timeline;
  }

  private async checkProductLimit(tenantId: string): Promise<void> {
    const [tenant, count] = await Promise.all([
      this.prisma.tenant.findFirst({
        where: { id: tenantId },
        include: { plan: { select: { maxProducts: true } } },
      }),
      this.prisma.product.count({ where: { tenantId, deletedAt: null } }),
    ]);
    if (!tenant) throw new BadRequestException('Empresa no encontrada');
    const maxProducts = tenant.plan?.maxProducts ?? -1;
    if (maxProducts !== -1 && count >= maxProducts) {
      throw new BadRequestException(`Tu plan permite máximo ${maxProducts} productos`);
    }
  }
}
