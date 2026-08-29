export const SUPPORTED_LOCALES = {
  nexus: ['pt-br', 'en-us', 'es-es', 'de-de', 'fr-fr', 'it-it', 'ja-jp', 'zh-cn', 'ko-kr', 'nl-nl', 'pl-pl', 'ru-ru', 'tr-tr', 'ar-sa', 'sv-se', 'da-dk'],
  solvegrid: ['en-us', 'pt-br', 'es-es', 'de-de', 'fr-fr', 'ja-jp', 'zh-cn'],
  aquitemachadinhos: ['pt-br', 'en-us', 'es-es']
};

export function buildHreflangCluster(urlBase, site, facet, format) {
  const locales = SUPPORTED_LOCALES[site] || SUPPORTED_LOCALES.aquitemachadinhos;
  const alternates = {};
  
  for (const loc of locales) {
    const cleanBase = urlBase.replace(/\/+$/, '');
    alternates[loc] = `${cleanBase}/growth/${loc}/${facet}/${format}`;
  }
  alternates['x-default'] = `${urlBase.replace(/\/+$/, '')}/growth/${locales[0]}/${facet}/${format}`;
  
  return alternates;
}
