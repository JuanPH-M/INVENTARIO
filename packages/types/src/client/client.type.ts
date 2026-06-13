export enum ClientType {
  INDIVIDUAL = 'individual',
  BUSINESS = 'business',
}

export enum ClientStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  BLACKLISTED = 'blacklisted',
}

export enum IdDocumentType {
  CC = 'cc',
  NIT = 'nit',
  PASSPORT = 'passport',
  CE = 'ce',
  RUC = 'ruc',
  RFC = 'rfc',
  OTHER = 'other',
}

export interface ClientAddressDto {
  id: string;
  clientId: string;
  label: string;
  street: string;
  city: string;
  state: string | null;
  country: string;
  zip: string | null;
  isDefault: boolean;
}

export interface ClientDocumentDto {
  id: string;
  clientId: string;
  type: string;
  number: string;
  issueDate: string | null;
  expiryDate: string | null;
  fileUrl: string | null;
  verifiedAt: string | null;
}

export interface ClientContactDto {
  id: string;
  clientId: string;
  name: string;
  position: string | null;
  email: string | null;
  phone: string | null;
  isPrimary: boolean;
}

export interface ClientNoteDto {
  id: string;
  clientId: string;
  content: string;
  createdBy: string;
  createdByName: string;
  createdAt: string;
}

export interface ClientDto {
  id: string;
  tenantId: string;
  type: ClientType;
  status: ClientStatus;
  firstName: string | null;
  lastName: string | null;
  fullName: string;
  businessName: string | null;
  idType: IdDocumentType;
  idNumber: string;
  email: string | null;
  phone: string | null;
  creditLimit: number;
  creditBalance: number;
  availableCredit: number;
  totalPurchases: number;
  totalSales: number;
  lastActivityAt: string | null;
  addresses: ClientAddressDto[];
  contacts: ClientContactDto[];
  notes: ClientNoteDto[];
  createdAt: string;
  updatedAt: string;
}
