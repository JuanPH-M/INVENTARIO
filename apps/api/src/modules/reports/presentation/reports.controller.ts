import {
  Controller, Get, NotFoundException, Param, ParseUUIDPipe, Post, Query, Res, UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { RequirePermissions } from '../../../common/decorators/require-permissions.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { PrismaService } from '../../../database/prisma.service';
import { StorageService } from '../../../storage/storage.service';
import { PERMISSIONS } from '@inventario/shared';
import { parsePaginationParams, paginate } from '../../../common/utils/pagination.util';
import type { JwtPayload } from '@inventario/types';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const PDFDocument = require('pdfkit') as typeof import('pdfkit');
import ExcelJS from 'exceljs';

// ─── Types ────────────────────────────────────────────────────────────────────

type ReportRow = Record<string, unknown>;

interface ColDef {
  header: string;
  key: string;
  width: number;
  numeric?: boolean;
}

// ─── Column definitions per report type ───────────────────────────────────────

const COL_DEFS: Record<string, ColDef[]> = {
  sales: [
    { header: 'Número', key: 'Número', width: 60 },
    { header: 'Cliente', key: 'Cliente', width: 110 },
    { header: 'Estado', key: 'Estado', width: 60 },
    { header: 'Descuento', key: 'Descuento', width: 55, numeric: true },
    { header: 'Total', key: 'Total', width: 60, numeric: true },
    { header: 'Fecha', key: 'Fecha', width: 65 },
  ],
  purchases: [
    { header: 'Número', key: 'Número', width: 80 },
    { header: 'Proveedor', key: 'Proveedor', width: 130 },
    { header: 'Estado', key: 'Estado', width: 70 },
    { header: 'Total', key: 'Total', width: 70, numeric: true },
    { header: 'Fecha', key: 'Fecha', width: 75 },
  ],
  inventory: [
    { header: 'Producto', key: 'Producto', width: 110 },
    { header: 'SKU', key: 'SKU', width: 65 },
    { header: 'Sucursal', key: 'Sucursal', width: 80 },
    { header: 'Tipo', key: 'Tipo', width: 65 },
    { header: 'Cantidad', key: 'Cantidad', width: 50, numeric: true },
    { header: 'Antes', key: 'Stock Antes', width: 45, numeric: true },
    { header: 'Después', key: 'Stock Después', width: 50, numeric: true },
    { header: 'Fecha', key: 'Fecha', width: 65 },
  ],
  finance: [
    { header: 'Tipo', key: 'Tipo', width: 70 },
    { header: 'Descripción', key: 'Descripción', width: 150 },
    { header: 'Referencia', key: 'Referencia', width: 80 },
    { header: 'Monto', key: 'Monto', width: 70, numeric: true },
    { header: 'Fecha', key: 'Fecha', width: 65 },
  ],
  clients: [
    { header: 'Nombre', key: 'Nombre', width: 120 },
    { header: 'Email', key: 'Email', width: 130 },
    { header: 'Teléfono', key: 'Teléfono', width: 80 },
    { header: 'Documento', key: 'Documento', width: 80 },
    { header: 'Registro', key: 'Registro', width: 70 },
  ],
  products: [
    { header: 'Nombre', key: 'Nombre', width: 140 },
    { header: 'SKU', key: 'SKU', width: 80 },
    { header: 'Categoría', key: 'Categoría', width: 90 },
    { header: 'P. Venta', key: 'Precio Venta', width: 65, numeric: true },
    { header: 'Costo', key: 'Costo', width: 60, numeric: true },
    { header: 'Estado', key: 'Estado', width: 60 },
  ],
};

const REPORT_TITLES: Record<string, string> = {
  sales: 'Reporte de Ventas',
  purchases: 'Reporte de Compras',
  inventory: 'Reporte de Inventario',
  finance: 'Reporte Financiero',
  clients: 'Reporte de Clientes',
  products: 'Reporte de Productos',
};

// ─────────────────────────────────────────────────────────────────────────────

@ApiTags('Reportes')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('reports')
export class ReportsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storageService: StorageService,
  ) {}

  // ── List history ────────────────────────────────────────────────────────────

  @Get()
  @RequirePermissions(PERMISSIONS.REPORTS_READ)
  @ApiOperation({ summary: 'Historial de reportes generados' })
  async findAll(
    @CurrentUser() user: JwtPayload,
    @Query('page') page?: number,
    @Query('type') type?: string,
    @Query('periodType') periodType?: string,
    @Query('branchId') branchId?: string,
  ) {
    const { page: p, limit: l, skip } = parsePaginationParams(page, 20);
    const effectiveBranchId = user.branchId ?? branchId;
    const where = {
      tenantId: user.tenantId,
      ...(type ? { type } : {}),
      ...(periodType ? { periodType } : {}),
      ...(effectiveBranchId ? { branchId: effectiveBranchId } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.generatedReport.findMany({ where, skip, take: l, orderBy: { generatedAt: 'desc' } }),
      this.prisma.generatedReport.count({ where }),
    ]);
    const itemsWithUrl = await Promise.all(
      items.map(async (r) => ({
        ...r,
        downloadUrl: await this.storageService.getSignedUrl(r.fileUrl.replace('/uploads/', '')),
      })),
    );
    return paginate(itemsWithUrl, total, p, l);
  }

  // ── Get stored daily report ─────────────────────────────────────────────────

  @Get('daily')
  @RequirePermissions(PERMISSIONS.REPORTS_READ)
  @ApiOperation({ summary: 'Obtener reporte diario almacenado por fecha' })
  async getDailyReport(
    @CurrentUser() user: JwtPayload,
    @Query('date') date: string,
    @Query('branchId') branchId?: string,
  ) {
    const targetDate = new Date(date);
    const start = new Date(targetDate);
    start.setHours(0, 0, 0, 0);
    const effectiveBranchId = user.branchId ?? branchId;
    const report = await this.prisma.generatedReport.findFirst({
      where: {
        tenantId: user.tenantId,
        type: 'daily_inventory',
        periodStart: start,
        ...(effectiveBranchId ? { branchId: effectiveBranchId } : {}),
      },
      orderBy: { generatedAt: 'desc' },
    });
    if (!report) throw new NotFoundException('No se encontró reporte para esa fecha');
    return { ...report, downloadUrl: await this.storageService.getSignedUrl(report.fileUrl.replace('/uploads/', '')) };
  }

  // ── Download stored report by ID ────────────────────────────────────────────

  @Get('download/:id')
  @RequirePermissions(PERMISSIONS.REPORTS_READ)
  @ApiOperation({ summary: 'Descargar reporte almacenado por ID' })
  async downloadById(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
    @Res() res: Response,
  ) {
    const report = await this.prisma.generatedReport.findFirst({
      where: { id, tenantId: user.tenantId, ...(user.branchId ? { branchId: user.branchId } : {}) },
    });
    if (!report) throw new NotFoundException('Reporte no encontrado');
    const url = await this.storageService.getSignedUrl(report.fileUrl.replace('/uploads/', ''));
    return res.redirect(url);
  }

  // ── On-demand streaming download (PDF / XLSX / CSV) ────────────────────────

  @Get(':type')
  @RequirePermissions(PERMISSIONS.REPORTS_READ)
  @ApiOperation({ summary: 'Generar y descargar reporte en PDF, XLSX o CSV' })
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  @ApiQuery({ name: 'branchId', required: false })
  @ApiQuery({ name: 'format', required: false, enum: ['pdf', 'xlsx', 'csv'] })
  async generateReport(
    @Param('type') type: string,
    @CurrentUser() user: JwtPayload,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('branchId') branchId?: string,
    @Query('format') format = 'pdf',
    @Res() res?: Response,
  ) {
    const start = from ? new Date(from) : new Date(new Date().setDate(1));
    const end = to ? new Date(to) : new Date();
    end.setHours(23, 59, 59, 999);
    const effectiveBranchId = user.branchId ?? branchId;

    const rows = await this.fetchReportData(type, user.tenantId, start, end, effectiveBranchId);
    const cols = COL_DEFS[type] ?? this.inferCols(rows);
    const title = REPORT_TITLES[type] ?? `Reporte: ${type}`;
    const periodLabel = `${start.toLocaleDateString('es-CO')} — ${end.toLocaleDateString('es-CO')}`;
    const filename = `reporte-${type}-${from ?? 'inicio'}-${to ?? 'fin'}.${format}`;

    if (format === 'csv') {
      const csv = this.buildCsv(rows, cols);
      res!.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res!.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      return res!.send('﻿' + csv);
    }

    if (format === 'xlsx') {
      const buf = await this.buildXlsx(title, periodLabel, rows, cols);
      res!.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res!.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      return res!.send(buf);
    }

    // PDF
    const buf = await this.buildPdf(title, periodLabel, rows, cols);
    res!.setHeader('Content-Type', 'application/pdf');
    res!.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res!.send(buf);
  }

  // ── Periodic report generation (saves PDF to storage + DB record) ───────────

  @Post('generate/:period')
  @RequirePermissions(PERMISSIONS.REPORTS_GENERATE)
  @ApiOperation({ summary: 'Generar y almacenar reporte periódico (daily | weekly | monthly | annual)' })
  async generatePeriodReport(
    @Param('period') period: string,
    @CurrentUser() user: JwtPayload,
    @Query('date') date?: string,
    @Query('branchId') branchId?: string,
    @Query('type') reportType = 'sales',
  ) {
    const validPeriods = ['daily', 'weekly', 'monthly', 'annual'];
    if (!validPeriods.includes(period)) {
      throw new NotFoundException(`Periodo inválido. Use: ${validPeriods.join(', ')}`);
    }

    const effectiveBranchId = user.branchId ?? branchId;
    const { start, end } = this.periodRange(period, date ? new Date(date) : new Date());
    const rows = await this.fetchReportData(reportType, user.tenantId, start, end, effectiveBranchId);
    const cols = COL_DEFS[reportType] ?? this.inferCols(rows);
    const title = REPORT_TITLES[reportType] ?? `Reporte: ${reportType}`;
    const periodLabel = `${start.toLocaleDateString('es-CO')} — ${end.toLocaleDateString('es-CO')}`;
    const periodName = { daily: 'Diario', weekly: 'Semanal', monthly: 'Mensual', annual: 'Anual' }[period] ?? period;

    // Generate PDF buffer
    const buf = await this.buildPdf(title, periodLabel, rows, cols);

    // Persist to storage
    const storagePath = `tenants/${user.tenantId}/reports/${period}/${reportType}_${Date.now()}.pdf`;
    await this.storageService.uploadRaw(buf, storagePath, 'application/pdf');

    // Create DB record
    const record = await this.prisma.generatedReport.create({
      data: {
        tenantId: user.tenantId,
        branchId: effectiveBranchId ?? null,
        type: `${period}_${reportType}`,
        title: `${periodName} — ${title} — ${periodLabel}`,
        periodType: period,
        periodStart: start,
        periodEnd: end,
        fileUrl: `/uploads/${storagePath}`,
        fileSize: buf.length,
        status: 'completed',
        generatedById: user.sub,
        metadata: {
          rowCount: rows.length,
          reportType,
          ...(this.buildMetadata(reportType, rows)),
        },
      },
    });

    return {
      id: record.id,
      title: record.title,
      rowCount: rows.length,
      downloadUrl: await this.storageService.getSignedUrl(storagePath),
    };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Private helpers
  // ─────────────────────────────────────────────────────────────────────────────

  private periodRange(period: string, anchor: Date): { start: Date; end: Date } {
    const start = new Date(anchor);
    const end = new Date(anchor);

    if (period === 'daily') {
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
    } else if (period === 'weekly') {
      const day = start.getDay(); // 0=Sun
      start.setDate(start.getDate() - day);
      start.setHours(0, 0, 0, 0);
      end.setDate(start.getDate() + 6);
      end.setHours(23, 59, 59, 999);
    } else if (period === 'monthly') {
      start.setDate(1);
      start.setHours(0, 0, 0, 0);
      end.setMonth(end.getMonth() + 1, 0);
      end.setHours(23, 59, 59, 999);
    } else if (period === 'annual') {
      start.setMonth(0, 1);
      start.setHours(0, 0, 0, 0);
      end.setMonth(11, 31);
      end.setHours(23, 59, 59, 999);
    }

    return { start, end };
  }

  private buildMetadata(reportType: string, rows: ReportRow[]): Record<string, unknown> {
    if (reportType === 'sales') {
      const total = rows.reduce((s, r) => s + Number(r['Total'] ?? 0), 0);
      return { totalRevenue: total, salesCount: rows.length };
    }
    if (reportType === 'purchases') {
      const total = rows.reduce((s, r) => s + Number(r['Total'] ?? 0), 0);
      return { totalAmount: total, ordersCount: rows.length };
    }
    if (reportType === 'finance') {
      const total = rows.reduce((s, r) => s + Number(r['Monto'] ?? 0), 0);
      return { totalAmount: total, transactionsCount: rows.length };
    }
    return {};
  }

  private inferCols(rows: ReportRow[]): ColDef[] {
    if (rows.length === 0) return [];
    return Object.keys(rows[0]).map((k) => ({ header: k, key: k, width: 80 }));
  }

  // ── PDF builder ─────────────────────────────────────────────────────────────

  private buildPdf(title: string, periodLabel: string, rows: ReportRow[], cols: ColDef[]): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 40, size: 'A4' });
      const chunks: Buffer[] = [];
      doc.on('data', (c: Buffer) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const pageW = doc.page.width;
      const marginL = 40;
      const marginR = 40;
      const contentW = pageW - marginL - marginR;

      // ── Header block ─────────────────────────────────────────────────────────
      doc.rect(marginL, 30, contentW, 50).fill('#1e3a5f');
      doc.fillColor('white').fontSize(16).font('Helvetica-Bold')
        .text(title, marginL + 10, 42, { width: contentW - 20, align: 'left' });
      doc.fontSize(9).font('Helvetica')
        .text(periodLabel, marginL + 10, 62, { width: contentW - 20, align: 'left' });

      doc.fillColor('black').moveDown(0.5);
      doc.y = 95;

      if (rows.length === 0) {
        doc.fontSize(11).text('No hay datos para el período seleccionado.', { align: 'center' });
        doc.end();
        return;
      }

      // ── Compute column widths ─────────────────────────────────────────────────
      const totalDefinedW = cols.reduce((s, c) => s + c.width, 0);
      const scale = contentW / totalDefinedW;
      const widths = cols.map((c) => Math.floor(c.width * scale));
      // Fix rounding
      const diff = contentW - widths.reduce((s, w) => s + w, 0);
      widths[widths.length - 1] += diff;

      const rowH = 16;
      const headerH = 18;

      const drawHeaderRow = (y: number) => {
        doc.rect(marginL, y, contentW, headerH).fill('#2d6a9f');
        doc.fillColor('white').fontSize(7.5).font('Helvetica-Bold');
        let x = marginL;
        cols.forEach((c, i) => {
          doc.text(c.header, x + 3, y + 5, { width: widths[i] - 4, lineBreak: false, ellipsis: true });
          x += widths[i];
        });
        doc.fillColor('black').font('Helvetica').fontSize(7.5);
        return y + headerH;
      };

      let y = drawHeaderRow(doc.y);

      // ── Data rows ─────────────────────────────────────────────────────────────
      rows.forEach((row, idx) => {
        if (y + rowH > doc.page.height - 60) {
          doc.addPage();
          y = drawHeaderRow(40);
        }

        if (idx % 2 === 0) {
          doc.rect(marginL, y, contentW, rowH).fill('#f0f4f8');
        }

        doc.fillColor('#1a1a1a').font('Helvetica').fontSize(7.5);
        let x = marginL;
        cols.forEach((c, i) => {
          const val = row[c.key];
          const text = val == null ? '' : typeof val === 'number' ? val.toLocaleString('es-CO') : String(val);
          const align = c.numeric ? 'right' : 'left';
          const xOffset = c.numeric ? 0 : 3;
          doc.text(text, x + xOffset, y + 4, { width: widths[i] - 4, lineBreak: false, ellipsis: true, align });
          x += widths[i];
        });

        // Row border
        doc.moveTo(marginL, y + rowH).lineTo(marginL + contentW, y + rowH).strokeColor('#d0d7df').lineWidth(0.3).stroke();
        doc.lineWidth(1).strokeColor('black');
        y += rowH;
      });

      // ── Totals row ────────────────────────────────────────────────────────────
      const numericCols = cols.filter((c) => c.numeric);
      if (numericCols.length > 0) {
        if (y + rowH + 5 > doc.page.height - 60) {
          doc.addPage();
          y = 40;
        }
        doc.rect(marginL, y + 3, contentW, rowH + 2).fill('#1e3a5f');
        doc.fillColor('white').font('Helvetica-Bold').fontSize(7.5);
        let x = marginL;
        cols.forEach((c, i) => {
          if (c.key === cols[0].key) {
            doc.text('TOTALES', x + 3, y + 8, { width: widths[i] - 4, lineBreak: false });
          } else if (c.numeric) {
            const sum = rows.reduce((s, r) => s + Number(r[c.key] ?? 0), 0);
            doc.text(sum.toLocaleString('es-CO'), x + 3, y + 8, { width: widths[i] - 4, lineBreak: false, align: 'right' });
          } else {
            doc.text('', x + 3, y + 8, { width: widths[i] - 4, lineBreak: false });
          }
          x += widths[i];
        });
        y += rowH + 5;
      }

      // ── Footer ────────────────────────────────────────────────────────────────
      doc.fillColor('#888888').fontSize(7).font('Helvetica')
        .text(
          `Generado el ${new Date().toLocaleString('es-CO')} — ${rows.length} registros`,
          marginL, doc.page.height - 30,
          { width: contentW, align: 'right' },
        );

      doc.end();
    });
  }

  // ── XLSX builder ─────────────────────────────────────────────────────────────

  private async buildXlsx(title: string, periodLabel: string, rows: ReportRow[], cols: ColDef[]): Promise<Buffer> {
    const wb = new ExcelJS.Workbook();
    wb.creator = 'Sistema Inventario';
    wb.created = new Date();

    const ws = wb.addWorksheet(title.substring(0, 31));

    // Title row
    ws.mergeCells(1, 1, 1, cols.length);
    const titleCell = ws.getCell(1, 1);
    titleCell.value = title;
    titleCell.font = { bold: true, size: 14, color: { argb: 'FFFFFFFF' } };
    titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1e3a5f' } };
    titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
    ws.getRow(1).height = 28;

    // Period row
    ws.mergeCells(2, 1, 2, cols.length);
    const periodCell = ws.getCell(2, 1);
    periodCell.value = periodLabel;
    periodCell.font = { italic: true, size: 10, color: { argb: 'FF444444' } };
    periodCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFe8eef4' } };
    periodCell.alignment = { horizontal: 'center' };
    ws.getRow(2).height = 18;

    // Header row
    const headerRow = ws.getRow(3);
    cols.forEach((c, i) => {
      const cell = headerRow.getCell(i + 1);
      cell.value = c.header;
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2d6a9f' } };
      cell.alignment = { horizontal: c.numeric ? 'right' : 'center', vertical: 'middle' };
      cell.border = {
        bottom: { style: 'medium', color: { argb: 'FF1e3a5f' } },
      };
      ws.getColumn(i + 1).width = Math.max(c.width / 7, 10);
    });
    headerRow.height = 20;

    // Data rows
    rows.forEach((row, idx) => {
      const dataRow = ws.getRow(4 + idx);
      const bg = idx % 2 === 0 ? 'FFf0f4f8' : 'FFFFFFFF';
      cols.forEach((c, i) => {
        const cell = dataRow.getCell(i + 1);
        const val = row[c.key];
        cell.value = c.numeric && val != null ? Number(val) : String(val ?? '');
        if (c.numeric) {
          cell.numFmt = '#,##0.00';
          cell.alignment = { horizontal: 'right' };
        }
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
        cell.border = { bottom: { style: 'hair', color: { argb: 'FFd0d7df' } } };
      });
      dataRow.height = 15;
    });

    // Totals row
    const numericCols = cols.filter((c) => c.numeric);
    if (numericCols.length > 0) {
      const totalsRow = ws.getRow(4 + rows.length);
      cols.forEach((c, i) => {
        const cell = totalsRow.getCell(i + 1);
        if (c.key === cols[0].key) {
          cell.value = 'TOTALES';
          cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        } else if (c.numeric) {
          const sum = rows.reduce((s, r) => s + Number(r[c.key] ?? 0), 0);
          cell.value = sum;
          cell.numFmt = '#,##0.00';
          cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
          cell.alignment = { horizontal: 'right' };
        }
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1e3a5f' } };
      });
      totalsRow.height = 18;
    }

    const arrayBuffer = await wb.xlsx.writeBuffer();
    return Buffer.from(arrayBuffer);
  }

  // ── CSV builder ───────────────────────────────────────────────────────────────

  private buildCsv(rows: ReportRow[], cols: ColDef[]): string {
    if (rows.length === 0) return '';
    const escape = (v: unknown) => {
      const s = String(v ?? '');
      return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const headers = cols.map((c) => c.header);
    const keys = cols.map((c) => c.key);
    return [headers.join(','), ...rows.map((r) => keys.map((k) => escape(r[k])).join(','))].join('\r\n');
  }

  // ── Data fetchers ────────────────────────────────────────────────────────────

  private async fetchReportData(
    type: string,
    tenantId: string,
    start: Date,
    end: Date,
    branchId?: string,
  ): Promise<ReportRow[]> {
    const branchFilter = branchId ? { branchId } : {};

    switch (type) {
      case 'sales': {
        const rows = await this.prisma.sale.findMany({
          where: { tenantId, createdAt: { gte: start, lte: end }, ...branchFilter },
          select: {
            saleNumber: true, status: true, total: true, discount: true, createdAt: true,
            client: { select: { firstName: true, lastName: true } },
          },
          orderBy: { createdAt: 'desc' },
        });
        return rows.map((r) => ({
          'Número': r.saleNumber,
          'Cliente': r.client ? `${r.client.firstName ?? ''} ${r.client.lastName ?? ''}`.trim() : 'Sin cliente',
          'Estado': r.status,
          'Descuento': Number(r.discount),
          'Total': Number(r.total),
          'Fecha': new Date(r.createdAt).toLocaleDateString('es-CO'),
        }));
      }

      case 'purchases': {
        const rows = await this.prisma.purchaseOrder.findMany({
          where: { tenantId, createdAt: { gte: start, lte: end }, ...branchFilter },
          select: { orderNumber: true, status: true, total: true, createdAt: true, supplier: { select: { name: true } } },
          orderBy: { createdAt: 'desc' },
        });
        return rows.map((r) => ({
          'Número': r.orderNumber,
          'Proveedor': r.supplier?.name ?? '-',
          'Estado': r.status,
          'Total': Number(r.total),
          'Fecha': new Date(r.createdAt).toLocaleDateString('es-CO'),
        }));
      }

      case 'inventory': {
        const rows = await this.prisma.inventoryMovement.findMany({
          where: { tenantId, performedAt: { gte: start, lte: end }, ...branchFilter },
          include: {
            product: { select: { name: true, internalCode: true } },
            branch: { select: { name: true } },
          },
          orderBy: { performedAt: 'desc' },
        });
        return rows.map((r) => ({
          'Producto': r.product.name,
          'SKU': r.product.internalCode ?? '',
          'Sucursal': r.branch?.name ?? '',
          'Tipo': r.type,
          'Cantidad': Number(r.quantity),
          'Stock Antes': Number(r.stockBefore),
          'Stock Después': Number(r.stockAfter),
          'Fecha': new Date(r.performedAt).toLocaleDateString('es-CO'),
        }));
      }

      case 'finance': {
        const rows = await this.prisma.financialTransaction.findMany({
          where: { tenantId, transactionDate: { gte: start, lte: end }, ...branchFilter },
          select: { type: true, amount: true, description: true, referenceId: true, transactionDate: true },
          orderBy: { transactionDate: 'desc' },
        });
        return rows.map((r) => ({
          'Tipo': r.type,
          'Descripción': r.description,
          'Referencia': r.referenceId ?? '',
          'Monto': Number(r.amount),
          'Fecha': new Date(r.transactionDate).toLocaleDateString('es-CO'),
        }));
      }

      case 'clients': {
        const rows = await this.prisma.client.findMany({
          where: { tenantId, deletedAt: null },
          select: { firstName: true, lastName: true, email: true, phone: true, idNumber: true, createdAt: true },
          orderBy: { firstName: 'asc' },
        });
        return rows.map((r) => ({
          'Nombre': `${r.firstName ?? ''} ${r.lastName ?? ''}`.trim(),
          'Email': r.email ?? '',
          'Teléfono': r.phone ?? '',
          'Documento': r.idNumber ?? '',
          'Registro': new Date(r.createdAt).toLocaleDateString('es-CO'),
        }));
      }

      case 'products': {
        const rows = await this.prisma.product.findMany({
          where: { tenantId, deletedAt: null },
          select: {
            name: true, internalCode: true, salePrice: true, costPrice: true,
            status: true, category: { select: { name: true } },
          },
          orderBy: { name: 'asc' },
        });
        return rows.map((r) => ({
          'Nombre': r.name,
          'SKU': r.internalCode ?? '',
          'Categoría': r.category?.name ?? '',
          'Precio Venta': Number(r.salePrice),
          'Costo': Number(r.costPrice),
          'Estado': r.status,
        }));
      }

      default:
        return [];
    }
  }
}
