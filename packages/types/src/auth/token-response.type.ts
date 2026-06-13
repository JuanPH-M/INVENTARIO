export interface TokenResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  tokenType: 'Bearer';
}

export interface MfaRequiredResponse {
  requiresMfa: true;
  mfaToken: string;
}

export type LoginResponse = TokenResponse | MfaRequiredResponse;

export function isMfaRequired(response: LoginResponse): response is MfaRequiredResponse {
  return 'requiresMfa' in response && response.requiresMfa === true;
}
