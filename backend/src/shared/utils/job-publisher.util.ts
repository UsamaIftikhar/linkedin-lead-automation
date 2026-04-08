/** Infer job board from apply URL (JSearch apply links often point at the source site). */
export function inferPublisherFromApplyLink(applyLink: string): string | null {
  const raw = applyLink.trim().toLowerCase();
  if (!raw) {
    return null;
  }

  if (raw.includes('linkedin.com') || raw.includes('linkedin.')) {
    return 'LinkedIn';
  }
  if (
    raw.includes('indeed.com') ||
    raw.includes('indeed.') ||
    raw.includes('//indeed')
  ) {
    return 'Indeed';
  }
  if (raw.includes('glassdoor.')) {
    return 'Glassdoor';
  }
  if (raw.includes('ziprecruiter.')) {
    return 'ZipRecruiter';
  }
  if (raw.includes('monster.')) {
    return 'Monster';
  }
  if (raw.includes('careerbuilder.')) {
    return 'CareerBuilder';
  }
  if (raw.includes('bebee.')) {
    return 'beBee';
  }

  try {
    const host = new URL(applyLink).hostname.toLowerCase();
    if (host.includes('linkedin')) {
      return 'LinkedIn';
    }
    if (host.includes('indeed')) {
      return 'Indeed';
    }
    if (host.includes('glassdoor')) {
      return 'Glassdoor';
    }
    if (host.includes('ziprecruiter')) {
      return 'ZipRecruiter';
    }
    if (host.includes('monster')) {
      return 'Monster';
    }
    if (host.includes('careerbuilder')) {
      return 'CareerBuilder';
    }
    if (host.includes('bebee')) {
      return 'beBee';
    }
  } catch {
    /* ignore */
  }

  return null;
}
