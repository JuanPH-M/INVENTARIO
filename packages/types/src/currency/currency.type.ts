export interface CurrencyDto {
  id: string;
  code: string;
  name: string;
  symbol: string;
  decimalPlaces: number;
  isBase: boolean;
  isActive: boolean;
}

export interface ExchangeRateDto {
  id: string;
  tenantId: string;
  fromCurrencyId: string;
  fromCurrencyCode: string;
  toCurrencyId: string;
  toCurrencyCode: string;
  rate: number;
  inverseRate: number;
  source: string;
  effectiveDate: string;
  createdAt: string;
}

export interface ConvertAmountResult {
  originalAmount: number;
  convertedAmount: number;
  fromCurrency: string;
  toCurrency: string;
  rate: number;
  rateDate: string;
}
