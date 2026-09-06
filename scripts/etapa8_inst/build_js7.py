#!/usr/bin/env python3
"""E7.6 — gera os dois scripts dinâmicos do painel (fonte única: bin/osm_cats.py).

  public/js/clima.js        tempo "agora" + 24 h + 14 dias (Open-Meteo, sem chave, CORS liberado)
  public/js/painel-osm.js   27 categorias do OpenStreetMap consultadas pelo navegador (Overpass),
                            com endereço/telefone/site/horário/acessibilidade/distância/rota,
                            cache de 6 h, rodízio de espelhos e "usar minha localização"

Nada de CDN: os arquivos são autocontidos (funcionam no preview e offline de terceiros).
Uso: python3 bin/build_js7.py [--outdir DIR ...]
"""
import argparse
import json
import os
import sys

WORK = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, f'{WORK}/bin')
import osm_cats  # noqa: E402

CLIMA_JS = r"""/* Etapa 7 — clima ao vivo. Fonte: Open-Meteo (sem chave). Cache 15 min por cidade.
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
"""

PAINEL_JS = r"""/* Etapa 7 - painel de servicos ao vivo (OpenStreetMap via Overpass).
   A consulta sai do navegador do visitante (o Overpass aceita CORS), com cache local de 6 h,
   rodizio de espelhos e "usar minha localizacao" para ordenar pela sua distancia real.
   Nada de dado do mapa e gravado no HTML: sem os voluntarios do OSM, o bloco mostra so as abas. */
(function () {
  'use strict';
  var CATS = __CATS__;
  var HOSTS = ['https://overpass-api.de/api/interpreter',
               'https://overpass.kumi.systems/api/interpreter',
               'https://overpass.private.coffee/api/interpreter',
               'https://maps.mail.ru/osm/tools/overpass/api/interpreter'];
  var LIMITE = 500;
  var TTL = 6 * 3600000;
  function byKey(k) { for (var i = 0; i < CATS.length; i++) { if (CATS[i].k === k) return CATS[i]; } return null; }
  function el(t, a, x) { var e = document.createElement(t); for (var k in a) { if (a.hasOwnProperty(k)) e.setAttribute(k, a[k]); } if (x !== undefined) e.textContent = x; return e; }
  function txt(lang, pt, fr, it, en) { return lang === 'fr' ? fr : lang === 'it' ? it : lang === 'en' ? en : pt; }
  function addr(t) {
    var s = [];
    if (t['addr:street']) s.push(t['addr:street'] + (t['addr:housenumber'] ? ', ' + t['addr:housenumber'] : ''));
    else if (t['addr:full']) s.push(t['addr:full']);
    if (t['addr:suburb']) s.push(t['addr:suburb']);
    if (t['addr:postcode']) s.push(t['addr:postcode']);
    return s.join(' · ');
  }
  function hav(a, b, c, d) {
    var R = 6371.0088, p1 = a * Math.PI / 180, p2 = c * Math.PI / 180;
    var dp = p2 - p1, dl = (d - b) * Math.PI / 180;
    var h = Math.sin(dp / 2) * Math.sin(dp / 2) + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) * Math.sin(dl / 2);
    return 2 * R * Math.asin(Math.sqrt(h));
  }
  function q(lat, lon, r, conds) {
    var corpo = '';
    for (var i = 0; i < conds.length; i++) {
      var c = conds[i], abre = c.charAt(0) === '[' ? '' : '[', fecha = c.charAt(0) === '[' ? '' : ']';
      corpo += 'nwr' + abre + c + fecha + '(around:' + r + ',' + lat + ',' + lon + ');';
    }
    return '[out:json][timeout:40];(' + corpo + ');out count;out tags center ' + LIMITE + ';';
  }
  function buscar(conds, lat, lon, r, cb) {
    var body = q(lat, lon, r, conds);
    var i = 0;
    (function tentativa() {
      if (i >= HOSTS.length) { cb(new Error('sem resposta do OpenStreetMap'), 0, []); return; }
      var ctl = ('AbortController' in window) ? new AbortController() : null;
      if (ctl) setTimeout(function () { ctl.abort(); }, 50000);
      fetch(HOSTS[i++], {
        method: 'POST', body: 'data=' + encodeURIComponent(body),
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, signal: ctl ? ctl.signal : undefined
      }).then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      }).then(function (j) {
        var els = (j && j.elements) || [], total = 0, itens = [];
        for (var k = 0; k < els.length; k++) {
          if (els[k].type === 'count') { total = (els[k].tags && els[k].tags.total) || 0; }
          else { itens.push(els[k]); }
        }
        cb(null, total || itens.length, itens);
      }).catch(function () { tentativa(); });
    })();
  }
  function monta(div, cat, els, total, cl, lang, origin, r, deCache) {
    div.innerHTML = '';
    var C = byKey(cat);
    var rot = (C && C.l[lang]) || (C && C.l.en) || cat;
    var vistos = {}, lista = [];
    (els || []).forEach(function (e) {
      var t = e.tags || {};
      if (!t.name) return;
      if (vistos[e.type + '/' + e.id]) return;          /* a mesma peca pode sair de duas condicoes */
      vistos[e.type + '/' + e.id] = 1;
      var k = t.name + '|' + (t['addr:street'] || t['addr:housenumber'] || '');
      if (vistos[k]) return;
      vistos[k] = 1;
      var la = e.center ? e.center.lat : e.lat, lo = e.center ? e.center.lon : e.lon;
      e.__d = (origin && la != null) ? hav(origin[0], origin[1], la, lo) : null;
      lista.push(e);
    });
    if (origin) lista.sort(function (a, b) { return (a.__d == null ? 9e9 : a.__d) - (b.__d == null ? 9e9 : b.__d); });
    var max = (C && C.max) || 40;
    var cut = lista.slice(0, max);
    var km = Math.round(r / 100) / 10;
    var cab = el('p', { style: 'margin:0 0 6px;font-size:.85rem;color:#94a3b8' });
    cab.textContent = rot + ': ' + total + txt(lang, ' cadastrados no OpenStreetMap num raio de ' + km + ' km',
      ' references OSM dans un rayon de ' + km + ' km', ' presenti su OpenStreetMap entro ' + km + ' km',
      ' mapped in OpenStreetMap within ' + km + ' km')
      + (cut.length ? ' · ' + txt(lang, 'aqui, ' + cut.length + ' com nome', ', dont ' + cut.length + ' nommes', ', di cui ' + cut.length + ' con nome', ', ' + cut.length + ' named') : '')
      + (els && els.length >= LIMITE ? ' \u00b7 ' + txt(lang,
          'a lista para em ' + LIMITE + ' \u2014 h\u00e1 mais no mapa',
          'la liste s\u2019arr\u00eate \u00e0 ' + LIMITE + ' \u2014 il y en a plus sur la carte',
          'la lista si ferma a ' + LIMITE + ' \u2014 ce ne sono altri sulla mappa',
          'the list stops at ' + LIMITE + ' \u2014 there is more on the map') : '')
      + ' · ' + (origin ? txt(lang, 'ordenados a partir de voce', 'tries depuis vous', 'ordinati da te', 'sorted from you')
                        : txt(lang, 'a partir do centro', 'depuis le centre', 'dal centro', 'from the centre'))
      + (deCache ? ' · ' + txt(lang, 'dados dos ultimos 6 h no seu navegador', 'donnees de moins de 6 h dans votre navigateur',
                               'dati delle ultime 6 h nel tuo browser', 'data from the last 6 h in your browser') : '');
    div.appendChild(cab);
    if (!cut.length) {
      div.appendChild(el('p', { style: 'margin:0;font-size:.9rem' },
        txt(lang, 'Nenhum ponto com nome nessa categoria ainda - o mapa e feito por voluntarios, entao use as buscas abaixo.',
                  'Aucun lieu nomme dans cette categorie pour le moment - la carte est faite par des benevoles.',
                  'Nessun luogo con nome in questa categoria per ora - la mappa e fatta da volontari.',
                  'No named place in this category yet - the map is volunteer-made, so use the searches below.')));
      return;
    }
    var ul = el('ul', { style: 'list-style:none;margin:0;padding:0' });
    cut.forEach(function (e) {
      var t = e.tags || {};
      var la = e.center ? e.center.lat : e.lat, lo = e.center ? e.center.lon : e.lon;
      var li = el('li', { style: 'border-bottom:1px dotted #334155;padding:6px 0' });
      var siteweb = t.website || t['contact:website'] || '';
      if (siteweb.indexOf('http') === 0) {
        li.appendChild(el('a', { href: siteweb, target: '_blank', rel: 'noopener nofollow sponsored' }, t.name));
      } else {
        li.appendChild(el('strong', {}, t.name));
      }
      var met = [];
      var ad = addr(t);
      if (ad) met.push(ad);
      if (t.phone || t['contact:phone']) met.push('tel. ' + (t.phone || t['contact:phone']));
      if (t.opening_hours) met.push('horario: ' + t.opening_hours);
      if (t.wheelchair) met.push('acessibilidade: ' + t.wheelchair);
      if (t.internet_access) met.push('internet: ' + t.internet_access);
      if (t.cuisine) met.push('cozinha: ' + t.cuisine);
      if (e.__d != null) met.push((e.__d < 1 ? Math.round(e.__d * 1000) + ' m' : (Math.round(e.__d * 10) / 10) + ' km'));
      if (met.length) li.appendChild(el('span', { style: 'color:#94a3b8;font-size:.85rem' }, ' \u2014 ' + met.join(' \u00b7 ')));
      if (la != null && lo != null) {
        li.appendChild(document.createTextNode(' '));
        li.appendChild(el('a', { href: 'https://www.google.com/maps/dir/?api=1&destination=' + la + ',' + lo,
          target: '_blank', rel: 'noopener nofollow', style: 'font-size:.82rem' }, txt(lang, 'rota', 'itineraire', 'percorso', 'route')));
        li.appendChild(document.createTextNode(' · '));
        li.appendChild(el('a', { href: 'https://www.openstreetmap.org/' + e.type + '/' + e.id,
          target: '_blank', rel: 'noopener nofollow', style: 'font-size:.82rem' }, txt(lang, 'no mapa', 'sur la carte', 'sulla mappa', 'on the map')));
        if (t.phone || t['contact:phone']) {
          li.appendChild(document.createTextNode(' · '));
          li.appendChild(el('a', { href: 'tel:' + String(t.phone || t['contact:phone']).replace(/[^\d+]/g, ''),
            style: 'font-size:.82rem' }, txt(lang, 'ligar', 'appeler', 'chiama', 'call')));
        }
      }
      ul.appendChild(li);
    });
    div.appendChild(ul);
    var rod = el('p', { style: 'margin:6px 0 0;font-size:.74rem;color:#94a3b8' });
    rod.appendChild(document.createTextNode('(c) OpenStreetMap (ODbL) · '
      + txt(lang, 'dado comunitario: pode faltar comercio pequeno', 'donnee communautaire: des commerces peuvent manquer',
               'dato comunitario: puo mancare qualche attivita', 'community data: small businesses may be missing') + ' · '));
    rod.appendChild(el('a', { href: 'https://overpass-turbo.eu/?Q=' + encodeURIComponent(q(cl[0], cl[1], cl[2], (C && C.q) || ['"amenity"="place_of_worship"'])) + '&lat=' + cl[0] + '&lon=' + cl[1] + '&zoom=13',
      target: '_blank', rel: 'noopener nofollow' }, txt(lang, 'explorar a camada', 'explorer la couche', 'esplora il layer', 'explore the layer')));
    div.appendChild(rod);
  }
  function init() {
    var boxes = document.querySelectorAll('.p7-osm');
    Array.prototype.forEach.call(boxes, function (box) {
      var lat = parseFloat(box.getAttribute('data-lat')), lon = parseFloat(box.getAttribute('data-lon'));
      var r = parseInt(box.getAttribute('data-r'), 10) || 9000;
      var lang = (box.getAttribute('data-lang') || 'pt').split('-')[0];
      var city = box.getAttribute('data-city') || '';
      var out = box.querySelector('.p7out');
      if (!isFinite(lat) || !isFinite(lon) || !out) { return; }
      var origem = [lat, lon];
      var tabs = box.querySelectorAll('.p7tab');
      function carregar(cat, botao) {
        var C = byKey(cat);
        if (!C) return;
        Array.prototype.forEach.call(tabs, function (b) {
          b.setAttribute('aria-pressed', b === botao ? 'true' : 'false');
          if (b.style) b.style.borderColor = b === botao ? '#a78bfa' : '#334155';
        });
        var key = 'p7osm:' + lat.toFixed(3) + ',' + lon.toFixed(3) + ':' + cat + ':' + r;
        var hit = null;
        try { hit = JSON.parse(localStorage.getItem(key) || 'null'); } catch (e) { hit = null; }
        if (hit && hit.t > Date.now() - TTL) {
          monta(out, cat, hit.e, hit.n || (hit.e || []).length, [lat, lon, r], lang, origem, r, true);
          return;
        }
        out.innerHTML = '';
        out.appendChild(el('p', { style: 'margin:0;font-size:.88rem;color:#94a3b8' },
          txt(lang, 'Consultando o OpenStreetMap...', 'Interrogation d OpenStreetMap...', 'Consultazione di OpenStreetMap...', 'Querying OpenStreetMap...')));
        buscar(C.q || ['"amenity"=' + cat], lat, lon, r, function (err, total, els) {
          if (err) {
            out.innerHTML = '';
            var p = el('p', { style: 'margin:0;font-size:.88rem' });
            p.appendChild(document.createTextNode(txt(lang, 'O mapa colaborador nao respondeu agora. ',
              'La carte collaborative n a pas repondu.', 'La mappa collaborativa non ha risposto.', 'The collaborative map did not answer.') + ' '));
            p.appendChild(el('a', { href: 'https://www.openstreetmap.org/search?query=' + encodeURIComponent(cat + ' ' + city),
              target: '_blank', rel: 'noopener nofollow' }, txt(lang, 'buscar no OSM', 'chercher sur OSM', 'cerca su OSM', 'search on OSM')));
            out.appendChild(p);
            return;
          }
          var slim = els.map(function (e) {
            return { id: e.id, type: e.type, tags: e.tags, center: e.center ? { lat: e.center.lat, lon: e.center.lon } : null, lat: e.lat, lon: e.lon };
          });
          try { localStorage.setItem(key, JSON.stringify({ t: Date.now(), e: slim, n: total })); } catch (e) {}
          monta(out, cat, slim, total, [lat, lon, r], lang, origem, r, false);
        });
      }
      Array.prototype.forEach.call(tabs, function (b) {
        b.addEventListener('click', function () { carregar(b.getAttribute('data-cat'), b); });
      });
      var first = tabs[0];
      if (first) carregar(first.getAttribute('data-cat'), first);
      if (navigator.geolocation) {
        var gb = el('button', { type: 'button', style: 'border:1px solid #334155;background:#0f172a;color:#a78bfa;border-radius:999px;padding:4px 11px;margin:6px 0 0;cursor:pointer;font-size:.84rem' },
          txt(lang, 'usar minha localizacao', 'utiliser ma position', 'usa la mia posizione', 'use my location'));
        gb.addEventListener('click', function () {
          navigator.geolocation.getCurrentPosition(function (pos) {
            origem = [pos.coords.latitude, pos.coords.longitude];
            gb.textContent = txt(lang, 'a partir de voce', 'depuis vous', 'da te', 'from you');
            var act = box.querySelector('.p7tab[aria-pressed="true"]');
            if (act) carregar(act.getAttribute('data-cat'), act);
          }, function () { gb.textContent = txt(lang, 'sem permissao de localizacao', 'sans autorisation de localisation', 'senza permesso', 'no location permission'); });
        });
        box.appendChild(gb);
      }
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();



"""
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--outdir', action='append', default=[])
    a = ap.parse_args()
    cats = osm_cats.as_list()
    js_clima = CLIMA_JS
    js_painel = PAINEL_JS.replace('__CATS__', json.dumps(cats, ensure_ascii=False, separators=(',', ':')))
    alvos = a.outdir or [f'{WORK}/repos/{r}/public/js' for r in ('solvegrid', 'nexus-ai-v2', 'aquitemachadinhos')]
    import shutil
    import subprocess
    tmp = '/tmp/p7js'
    os.makedirs(tmp, exist_ok=True)
    for nome, txt_ in (('clima.js', js_clima), ('painel-osm.js', js_painel)):
        with open(f'{tmp}/{nome}', 'w', encoding='utf-8') as fh:
            fh.write(txt_)
        if shutil.which('node'):
            r = subprocess.run(['node', '--check', f'{tmp}/{nome}'], capture_output=True, text=True)
            if r.returncode:
                raise SystemExit(f'node --check falhou em {nome}:\n{r.stderr[:900]}')
            print(f'  node --check {nome}: ok ({len(txt_)} bytes)')
        else:
            print(f'  AVISO: node ausente, {nome} nao conferido')
    for d in alvos:
        os.makedirs(d, exist_ok=True)
        for nome, txt in (('clima.js', js_clima), ('painel-osm.js', js_painel)):
            with open(os.path.join(d, nome), 'w', encoding='utf-8') as fh:
                fh.write(txt)
        print(f'{d}: {len(js_clima)} + {len(js_painel)} bytes', flush=True)


if __name__ == '__main__':
    main()
