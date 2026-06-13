export enum ProductType {
  PHYSICAL = 'physical',
  SERVICE = 'service',
  DIGITAL = 'digital',
  JEWELRY = 'jewelry',
  ASSET = 'asset',
}

export enum ProductStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  DISCONTINUED = 'discontinued',
  DRAFT = 'draft',
}

export interface ProductImage {
  url: string;
  order: number;
  isPrimary: boolean;
  caption?: string;
}

export interface ProductDocument {
  url: string;
  name: string;
  type: string;
  size: number;
  uploadedAt: string;
}

export interface ProductDimensions {
  length: number;
  width: number;
  height: number;
  unit: 'cm' | 'in' | 'm';
}

export interface ProductDto {
  id: string;
  tenantId: string;
  categoryId: string | null;
  categoryName: string | null;
  supplierId: string | null;
  supplierName: string | null;
  internalCode: string | null;
  barcode: string | null;
  qrCode: string | null;
  sku: string | null;
  name: string;
  description: string | null;
  shortDescription: string | null;
  brand: string | null;
  model: string | null;
  type: ProductType;
  status: ProductStatus;
  costPrice: number;
  salePrice: number;
  minSalePrice: number;
  unitOfMeasure: string;
  trackInventory: boolean;
  minStock: number;
  maxStock: number | null;
  reorderPoint: number;
  weight: number | null;
  dimensions: ProductDimensions | null;
  taxRate: number;
  taxIncluded: boolean;
  images: ProductImage[];
  documents: ProductDocument[];
  metadata: Record<string, unknown>;
  defaultLocation: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface JewelryStone {
  type: string;
  carat: number;
  clarity?: string;
  color?: string;
  cut?: string;
}

export interface JewelryDetailsDto {
  id: string;
  productId: string;
  material: string | null;
  karat: number | null;
  weightGrams: number | null;
  weightTroyOz: number | null;
  stones: JewelryStone[];
  certificateNumber: string | null;
  certificateType: string | null;
  certificateUrl: string | null;
  appraisedValue: number | null;
  appraisedAt: string | null;
  appraiserName: string | null;
  appraisalDocument: string | null;
  provenance: string | null;
  hallmarks: string | null;
}
