/* Etapa 7 — clima ao vivo. Fonte: Open-Meteo (sem chave). Cache 15 min por cidade.
   Sem JavaScript, o bloco simplesmente não aparece: nada de texto mentiroso. */
(function () {
  'use strict';
  var WMO = {
    pt: {0: 'céu limpo', 1: 'quase limpo', 2: 'parcialmente nublado', 3: 'nublado', 45: 'nevoeiro', 48: 'nevoeiro com geada',
         51: 'garoa fraca', 53: 'garoa', 55: 'garoa forte', 61: 'chuva fraca', 63: 'chuva', 65: 'chuva forte',
         66: 'chuva congelante', 67: 'chuva congelante forte', 71: 'neve fraca', 73: 'neve', 75: 'neve forte',
         77: 'grãos de neve', 80: 'pancadas de chuva', 81: 'pancadas fortes', 82: 'pancadas violentas',
         85: 'pancadas de neve', 86: 'neve forte', 95: 'trovoada', 96: 'trovoada com granizo', 99: 'trovoada forte com granizo'},
    en: {0: 'clear sky', 1: 'mostly clear', 2: 'partly cloudy', 3: 'overcast', 45: 'fog', 48: 'freezing fog',
         51: 'light drizzle', 53: 'drizzle', 55: 'heavy drizzle', 61: 'light rain', 63: 'rain', 65: 'heavy rain',
         66: 'freezing rain', 67: 'heavy freezing rain', 71: 'light snow', 73: 'snow', 75: 'heavy snow',
         77: 'snow grains', 80: 'light showers', 81: 'showers', 82: 'violent showers', 85: 'snow showers',
         86: 'heavy snow showers', 95: 'thunderstorm', 96: 'thunderstorm with hail', 99: 'severe thunderstorm with hail'},
    fr: {0: 'ciel dégagé', 1: 'plutôt dégagé', 2: 'partiellement nuageux', 3: 'couvert', 45: 'brouillard', 48: 'brouillard givrant',
         51: 'bruine faible', 53: 'bruine', 55: 'bruine dense', 61: 'pluie faible', 63: 'pluie', 65: 'pluie forte',
         66: 'pluie verglaçante', 67: 'forte pluie verglaçante', 71: 'neige faible', 73: 'neige', 75: 'neige forte',
         77: 'granules de neige', 80: 'averses faibles', 81: 'averses', 82: 'averses violentes', 85: 'averses de neige',
         86: 'fortes averses de neige', 95: 'orage', 96: 'orage avec grêle', 99: 'orage violent avec grêle'},
    it: {0: 'sereno', 1: 'prevalentemente sereno', 2: 'parzialmente nuvoloso', 3: 'nuvoloso', 45: 'nebbia', 48: 'nebbia gelata',
         51: 'pioviggine debole', 53: 'pioviggine', 55: 'pioviggine intensa', 61: 'pioggia debole', 63: 'pioggia', 65: 'pioggia intensa',
         66: 'pioggia gelata', 67: 'pioggia gelata intensa', 71: 'neve debole', 73: 'neve', 75: 'neve intensa',
         77: 'grandini di neve', 80: 'rovesci deboli', 81: 'rovesci', 82: 'rovesci violenti', 85: 'rovesci di neve',
         86: 'forti rovesci di neve', 95: 'temporale', 96: 'temporale con grandine', 99: 'temporale violento con grandine'}
  };
  var LB = {
    pt: { agora: 'Tempo agora em', sens: 'sensação', umidade: 'Umidade', chuva: 'Chuva agora',
          vento: 'Vento', press: 'Pressão (solo)', nuvens: 'Nuvens', nascer: 'Nascer do sol',
          por: 'Pôr do sol', uv: 'UV máx. hoje', horas: 'Próximas horas', dias: 'Próximos 7 dias',
          de: 'de', leitura: 'Leitura de', cache: 'cache de 15 min no seu navegador', ha: 'há',
          min: 'min', indis: 'Leitura ao vivo indisponível agora — a tabela acima é a média real do ano.' },
    fr: { agora: 'Temps à', sens: 'ressenti', umidade: 'Humidité', chuva: 'Pluie actuelle',
          vento: 'Vent', press: 'Pression (sol)', nuvens: 'Nuages', nascer: 'Lever du soleil',
          por: 'Coucher du soleil', uv: 'UV max du jour', horas: 'Prochaines heures', dias: '7 prochains jours',
          de: 'sur', leitura: 'Lecture depuis', cache: 'conservé 15 min dans votre navigateur', ha: 'il y a',
          min: 'min', indis: 'Lecture en direct indisponible — le tableau ci-dessus est la moyenne réelle de l’année.' },
    it: { agora: 'Meteo a', sens: 'percepita', umidade: 'Umidità', chuva: 'Pioggia ora',
          vento: 'Vento', press: 'Pressione (suolo)', nuvens: 'Nuvole', nascer: 'Alba',
          por: 'Tramonto', uv: 'UV max oggi', horas: 'Prossime ore', dias: 'Prossimi 7 giorni',
          de: 'di', leitura: 'Lettura da', cache: 'cache di 15 min nel tuo browser', ha: 'di',
          min: 'min', indis: 'Lettura in diretta non disponibile ora — la tabella sopra è la media reale dell’anno.' },
    en: { agora: 'Weather in', sens: 'feels like', umidade: 'Humidity', chuva: 'Rain now',
          vento: 'Wind', press: 'Pressure (ground)', nuvens: 'Cloud', nascer: 'Sunrise',
          por: 'Sunset', uv: 'UV max today', horas: 'Next hours', dias: 'Next 7 days',
          de: 'of', leitura: 'Read from', cache: 'cached 15 min in your browser', ha: '',
          min: 'min ago', indis: 'Live reading unavailable now — the table above is the yearly mean.' }
  };
  var LOC = 'pt-BR';
  function fmt(n, d) { return (n === null || n === undefined || isNaN(n)) ? '—'
      : Number(n).toLocaleString(LOC, {minimumFractionDigits: d || 0, maximumFractionDigits: d || 0}); }
  function hhmm(s) { return (s || '').slice(11, 16); }
  function el(tag, attrs, txt) {
    var e = document.createElement(tag);
    for (var k in attrs) { if (attrs.hasOwnProperty(k)) e.setAttribute(k, attrs[k]); }
    if (txt !== undefined) e.textContent = txt;
    return e;
  }
  function render(box, d, lang, city) {
    var c = d.current || {}, dy = (d.daily || {}), hr = (d.hourly || {});
    var T = LB[lang] || LB.pt;
    LOC = {fr: 'fr-FR', it: 'it-IT', en: 'en-GB'}[lang] || 'pt-BR';
    var L = WMO[lang] || WMO.en, w = L[c.weather_code] || ('code ' + c.weather_code);
    var p = el('p', {style: 'margin:0 0 6px'});
    p.appendChild(el('strong', {}, fmt(c.temperature_2m, 1) + ' °C'));
    p.appendChild(document.createTextNode(' · ' + w + ' · ' + T.sens + ' ' + fmt(c.apparent_temperature, 1) + ' °C'));
    box.appendChild(p);
    var linhas = [
      [T.umidade, fmt(c.relative_humidity_2m) + ' %'],
      [T.chuva, fmt(c.precipitation, 1) + ' mm'],
      [T.vento, fmt(c.wind_speed_10m, 0) + ' km/h'],
      [T.press, fmt(c.surface_pressure, 0) + ' hPa'],
      [T.nuvens, fmt(c.cloud_cover) + ' %'],
      [T.nascer, hhmm((dy.sunrise || [])[0])],
      [T.por, hhmm((dy.sunset || [])[0])],
      [T.uv, fmt((dy.uv_index_max || [])[0], 1)]
    ];
    var dl = el('dl', {style: 'display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:0 16px;margin:0;font-size:.86rem'});
    linhas.forEach(function (kv) {
      var d1 = el('div', {style: 'display:flex;justify-content:space-between;gap:8px;border-bottom:1px dotted #334155;padding:2px 0'});
      d1.appendChild(el('dt', {style: 'color:#94a3b8;margin:0'}, kv[0]));
      d1.appendChild(el('dd', {style: 'margin:0'}, kv[1]));
      dl.appendChild(d1);
    });
    box.appendChild(dl);
    var prox = el('p', {style: 'margin:8px 0 0;font-size:.86rem;color:#cbd5e1'});
    var partes = [];
    for (var i = 0; i < Math.min(12, (hr.time || []).length); i++) {
      partes.push(hhmm(hr.time[i]).slice(0, 5) + ' ' + fmt(hr.temperature_2m[i], 0) + '°'
                  + ((hr.precipitation_probability || [])[i] != null ? ' · ' + hr.precipitation_probability[i] + '%' : ''));
    }
    if (partes.length) {
      prox.appendChild(el('strong', {}, T.horas + ': '));
      prox.appendChild(document.createTextNode(partes.join('  ')));
      box.appendChild(prox);
    }
    var dias = el('details', {style: 'margin:8px 0 0'});
    dias.appendChild(el('summary', {style: 'cursor:pointer;color:#a78bfa;font-size:.86rem'},
      T.dias + ' (' + T.de + ' ' + ((dy.time || []).length) + ')'));
    var tb = el('div', {style: 'font-size:.86rem;color:#cbd5e1;margin-top:6px;display:grid;grid-template-columns:repeat(auto-fit,minmax(112px,1fr));gap:4px 14px'});
    for (var j = 0; j < Math.min(7, (dy.time || []).length); j++) {
      var one = el('span', {});
      one.appendChild(el('b', {}, dy.time[j].slice(8, 10) + '/' + dy.time[j].slice(5, 7)));
      one.appendChild(document.createTextNode(' ' + fmt(dy.temperature_2m_max[j], 0) + '° / ' + fmt(dy.temperature_2m_min[j], 0)
        + '° · ' + fmt(dy.precipitation_sum[j], 1) + ' mm'
        + ((dy.precipitation_probability_max || [])[j] != null ? ' (' + dy.precipitation_probability_max[j] + '%)' : '')));
      tb.appendChild(one);
    }
    dias.appendChild(tb);
    box.appendChild(dias);
    var local = (d.current.time || '').replace('T', ' ');
    var fuso = d.timezone || '';
    var txt = T.leitura + ' Open-Meteo (' + fuso + ', ' + local + ' local'
      + (d.elevation != null ? ', ' + fmt(d.elevation, 0) + ' m' : '') + ') \u00b7 ' + T.cache;
    var rod = el('p', {style: 'margin:7px 0 0;font-size:.75rem;color:#94a3b8'}, txt);
    box.appendChild(rod);
  }
  function init() {
    var boxes = document.querySelectorAll('.p7-agora');
    Array.prototype.forEach.call(boxes, function (box) {
      var la = box.getAttribute('data-lat'), lo = box.getAttribute('data-lon');
      if (!la || !lo || la === 'null' || lo === 'null') { box.remove(); return; }
      var lang = (box.getAttribute('data-lang') || 'pt').split('-')[0];
      var city = box.getAttribute('data-city') || '';
      var url = 'https://api.open-meteo.com/v1/forecast?latitude=' + la + '&longitude=' + lo
        + '&current=temperature_2m,apparent_temperature,relative_humidity_2m,precipitation,weather_code,wind_speed_10m,surface_pressure,cloud_cover'
        + '&hourly=temperature_2m,precipitation_probability,weather_code&forecast_hours=12'
        + '&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,uv_index_max,sunrise,sunset'
        + '&forecast_days=14&timezone=auto';
      var key = 'p7clima:' + la + ',' + lo;
      var usar = function (txt, data) {
        box.innerHTML = '';
        var cab = el('p', {style: 'margin:0 0 6px;font-size:.86rem;color:#94a3b8'});
        cab.textContent = txt;
        box.appendChild(cab);
        try { render(box, data, lang, city); } catch (e) { box.textContent = txt + ' — ' + e; }
      };
      var cache = null;
      try { cache = JSON.parse(sessionStorage.getItem(key) || 'null'); } catch (e) { cache = null; }
      if (cache && cache.t > Date.now() - 15 * 60000) {
        var tt = LB[(box.getAttribute('data-lang') || 'pt').split('-')[0]] || LB.pt;
        var idade = tt === LB.en ? (Math.round((Date.now() - cache.t) / 60000) + ' ' + tt.min)
                                 : tt.ha + ' ' + Math.round((Date.now() - cache.t) / 60000) + ' ' + tt.min;
        usar(tt.agora + ' ' + city + ' (' + idade + '):', cache.d);
        return;
      }
      if (!('fetch' in window)) { return; }
      var ctl = ('AbortController' in window) ? new AbortController() : null;
      if (ctl) setTimeout(function () { ctl.abort(); }, 20000);
      fetch(url, ctl ? {signal: ctl.signal} : undefined).then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      }).then(function (d) {
        try { sessionStorage.setItem(key, JSON.stringify({t: Date.now(), d: d})); } catch (e) {}
        usar((LB[lang] || LB.pt).agora + ' ' + city + ':', d);
      }).catch(function () {
        box.innerHTML = '';
        var p = el('p', {style: 'margin:0;font-size:.86rem;color:#94a3b8'});
        p.appendChild(document.createTextNode(((LB[lang] || LB.pt).indis) + ' '));
        p.appendChild(el('a', {href: url, target: '_blank', rel: 'noopener nofollow'}, 'Open-Meteo'));
        box.appendChild(p);
      });
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
