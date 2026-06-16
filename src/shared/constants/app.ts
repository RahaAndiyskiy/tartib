export const APP_ROUTES = {
  home: '/',
  login: '/login',
  onboarding: '/onboarding',
  dashboard: '/dashboard'
} as const;

export const APP_CURRENCY_SYMBOL = '₺';

export function formatMoney(amount: number, fractionDigits = 2): string {
  return `${Number(amount).toFixed(fractionDigits)} ${APP_CURRENCY_SYMBOL}`;
}
