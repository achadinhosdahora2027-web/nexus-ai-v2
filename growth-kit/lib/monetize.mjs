export function injectDynamicSid(url, site, slot) {
  const sid = `${site}_${slot}`;
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}sid=${encodeURIComponent(sid)}`;
}

export function getDisclosures(locale = 'pt-br') {
  const map = {
    'pt-br': 'Divulgação: Como afiliado, podemos receber uma comissão pelas compras qualificadas realizadas através dos links desta página, sem nenhum custo adicional para você.',
    'en-us': 'Disclosure: As an affiliate, we may earn a commission from qualifying purchases made through links on this page at no extra cost to you.',
    'es-es': 'Divulgación: Como afiliados, podemos recibir una comisión por compras que califiquen através de enlaces en esta página, sin costo adicional para usted.',
    'de-de': 'Hinweis: Als Partner können wir eine Provision für qualifizierte Käufe über Links auf dieser Seite erhalten, ohne zusätzliche Kosten für Sie.',
    'fr-fr': 'Divulgation : En tant qu\'affilié, nous pouvons recevoir une commission sur les achats qualifiés effectués via les liens de cette page, sans frais supplémentaires pour vous.',
    'ja-jp': '開示：アフィリエイトとして、本ページのリンクを経由した適格な購入から手数料を受け取る場合があります（追加費用は発生しません）。',
    'zh-cn': '披露：作为联盟会员，我们可能会从本页面链接产生的符合条件的购买中赚取佣金，您无需承担任何额外费用。'
  };
  return map[locale.toLowerCase()] || map['en-us'];
}
