const FREE_EMAIL_DOMAINS = new Set([
  'gmail.com',
  'googlemail.com',
  'hotmail.com',
  'icloud.com',
  'live.com',
  'me.com',
  'outlook.com',
  'proton.me',
  'protonmail.com',
  'yahoo.com',
  'yandex.com',
  'zoho.com',
]);

function domainsMatch(actualDomain: string, expectedDomain: string): boolean {
  return (
    actualDomain === expectedDomain ||
    actualDomain.endsWith(`.${expectedDomain}`) ||
    expectedDomain.endsWith(`.${actualDomain}`)
  );
}

export function isBusinessEmail(
  email: string,
  expectedDomain?: string | null,
): boolean {
  const normalizedEmail = email.trim().toLowerCase();

  if (!normalizedEmail.includes('@')) {
    return false;
  }

  const domain = normalizedEmail.split('@')[1];

  if (!domain || FREE_EMAIL_DOMAINS.has(domain)) {
    return false;
  }

  if (!expectedDomain) {
    return true;
  }

  return domainsMatch(domain, expectedDomain.toLowerCase());
}
