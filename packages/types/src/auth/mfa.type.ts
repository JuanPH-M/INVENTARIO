export interface MfaSetupResponse {
  secret: string;
  qrCodeUrl: string;
  backupCodes: string[];
}

export interface MfaVerifyRequest {
  code: string;
  mfaToken?: string;
}

export enum MfaMethod {
  TOTP = 'totp',
  BACKUP_CODE = 'backup_code',
}
