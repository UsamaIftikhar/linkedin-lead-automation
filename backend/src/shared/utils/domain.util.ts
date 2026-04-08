function normalizeUrl(value: string): string {
  if (/^https?:\/\//i.test(value)) {
    return value;
  }

  return `https://${value}`;
}

export function extractDomain(url?: string | null): string | null {
  if (!url) {
    return null;
  }

  const trimmedValue = url.trim();

  if (!trimmedValue) {
    return null;
  }

  try {
    const hostname = new URL(normalizeUrl(trimmedValue)).hostname.toLowerCase();

    return hostname.replace(/^www\./, '') || null;
  } catch {
    return null;
  }
}
