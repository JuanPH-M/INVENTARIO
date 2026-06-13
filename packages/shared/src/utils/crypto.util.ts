export function generateSlug(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

export function generateCode(prefix: string, sequence: number, padLength = 6): string {
  return `${prefix}${String(sequence).padStart(padLength, '0')}`;
}

export function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!local || !domain) return email;
  const masked =
    local.length <= 3
      ? local[0] + '*'.repeat(local.length - 1)
      : local.substring(0, 2) + '*'.repeat(local.length - 2);
  return `${masked}@${domain}`;
}

export function maskPhone(phone: string): string {
  if (phone.length <= 4) return '*'.repeat(phone.length);
  return '*'.repeat(phone.length - 4) + phone.slice(-4);
}
