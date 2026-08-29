export const NEXUS_LOCALES = [
  'pt-br', 'en-us', 'es-es', 'de-de', 'fr-fr', 'it-it',
  'ja-jp', 'zh-cn', 'ko-kr', 'nl-nl', 'pl-pl', 'ru-ru',
  'tr-tr', 'ar-sa', 'sv-se', 'da-dk'
] as const;

export type SupportedLocale = typeof NEXUS_LOCALES[number];

export function getHreflangAlternates(baseUrl: string, facet: string, format: string) {
  const cleanBase = baseUrl.replace(/\/+$/, '');
  const alternates: Record<string, string> = {};

  for (const loc of NEXUS_LOCALES) {
    alternates[loc] = `${cleanBase}/growth/${loc}/${facet}/${format}`;
  }
  alternates['x-default'] = `${cleanBase}/growth/en-us/${facet}/${format}`;

  return alternates;
}

export function isRtlLocale(locale: string): boolean {
  return locale.toLowerCase() === 'ar-sa' || locale.toLowerCase() === 'ar';
}
