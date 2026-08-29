export function scanForSecrets(content) {
  const patterns = [
    /ghp_[a-zA-Z0-9]{36}/,
    /eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/,
    /cfat_[a-zA-Z0-9_-]{40}/
  ];

  for (const p of patterns) {
    if (p.test(content)) {
      return { safe: false, match: 'Sensitive token pattern detected' };
    }
  }
  return { safe: true };
}
