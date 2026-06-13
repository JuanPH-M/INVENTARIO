export enum DocumentType {
  CONTRACT = 'contract',
  INVOICE = 'invoice',
  WARRANTY = 'warranty',
  CERTIFICATE = 'certificate',
  EVIDENCE = 'evidence',
  ATTACHMENT = 'attachment',
  PURCHASE_ORDER = 'purchase_order',
  RECEIPT = 'receipt',
  APPRAISAL = 'appraisal',
  ID_DOCUMENT = 'id_document',
  OTHER = 'other',
}

export enum DocumentStatus {
  DRAFT = 'draft',
  PENDING_SIGNATURE = 'pending_signature',
  SIGNED = 'signed',
  ACTIVE = 'active',
  EXPIRED = 'expired',
  CANCELLED = 'cancelled',
  ARCHIVED = 'archived',
}

export interface DocumentSignatoryDto {
  id: string;
  documentId: string;
  name: string;
  email: string | null;
  signedAt: string | null;
  signatureUrl: string | null;
  order: number;
}

export interface DocumentVersionDto {
  id: string;
  documentId: string;
  version: number;
  fileUrl: string;
  fileSize: number;
  mimeType: string;
  checksum: string;
  uploadedBy: string;
  uploadedByName: string;
  uploadedAt: string;
  notes: string | null;
}

export interface DocumentDto {
  id: string;
  tenantId: string;
  branchId: string | null;
  type: DocumentType;
  status: DocumentStatus;
  title: string;
  description: string | null;
  fileUrl: string;
  fileSize: number;
  mimeType: string;
  checksum: string;
  referenceType: string | null;
  referenceId: string | null;
  clientId: string | null;
  clientName: string | null;
  expiresAt: string | null;
  metadata: Record<string, unknown>;
  signatories: DocumentSignatoryDto[];
  versions: DocumentVersionDto[];
  currentVersion: number;
  uploadedBy: string;
  uploadedByName: string;
  createdAt: string;
  updatedAt: string;
}
