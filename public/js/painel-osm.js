/* Etapa 7 - painel de servicos ao vivo (OpenStreetMap via Overpass).
   A consulta sai do navegador do visitante (o Overpass aceita CORS), com cache local de 6 h,
   rodizio de espelhos e "usar minha localizacao" para ordenar pela sua distancia real.
   Nada de dado do mapa e gravado no HTML: sem os voluntarios do OSM, o bloco mostra so as abas. */
(function () {
  'use strict';
  var CATS = [{"k":"hospital","sel":"\"amenity\"~\"^(hospital|clinic|centre|doctors|urgent_care|trauma_centre|health_centre)$\"|\"healthcare\"~\"^(hospital|clinic|doctor|emergency)$\"","q":["\"amenity\"~\"^(hospital|clinic|centre|doctors|urgent_care|trauma_centre|health_centre)$\"","\"healthcare\"~\"^(hospital|clinic|doctor|emergency)$\""],"max":45,"l":{"pt":"Hospital e prontos-socorros","en":"Hospitals","fr":"Hôpitaux","it":"Ospedali"}},{"k":"farmacia","sel":"\"amenity\"~\"^(pharmacy|drugstore)$\"|\"healthcare\"=\"pharmacy\"","q":["\"amenity\"~\"^(pharmacy|drugstore)$\"","\"healthcare\"=\"pharmacy\""],"max":60,"l":{"pt":"Farmácias","en":"Pharmacies","fr":"Pharmacies","it":"Farmacie"}},{"k":"clinica","sel":"\"amenity\"~\"^(dentist|clinic|doctors|nurse|midwife|therapist|laboratory)$\"|\"healthcare\"~\"^(dentist|laboratory|physiotherapist|psychotherapist|optometrist|audiologist|sample_collection|veterinary)$\"","q":["\"amenity\"~\"^(dentist|clinic|doctors|nurse|midwife|therapist|laboratory)$\"","\"healthcare\"~\"^(dentist|laboratory|physiotherapist|psychotherapist|optometrist|audiologist|sample_collection|veterinary)$\""],"max":45,"l":{"pt":"Clínicas, dentistas, exames","en":"Clinics and labs","fr":"Cliniques et labos","it":"Cliniche e laboratori"}},{"k":"vet","sel":"\"shop\"~\"^(pet|pet_grooming)$\"|\"amenity\"~\"^(veterinary|animal_boarding|animal_shelter)$\"|\"leisure\"=\"dog_park\"","q":["\"shop\"~\"^(pet|pet_grooming)$\"","\"amenity\"~\"^(veterinary|animal_boarding|animal_shelter)$\"","\"leisure\"=\"dog_park\""],"max":30,"l":{"pt":"Pets: veterinário e pet shop","en":"Pets and vets","fr":"Animaux","it":"Animali"}},{"k":"emergencia","sel":"\"amenity\"~\"^(police|fire_station|ambulance_station|rescue_station|courthouse|prison|social_facility)$\"|\"emergency\"~\"^(police|fire|ambulance|extinguisher|assembly_point|siren|defibrillator|emergency_ward_entrance)$\"","q":["\"amenity\"~\"^(police|fire_station|ambulance_station|rescue_station|courthouse|prison|social_facility)$\"","\"emergency\"~\"^(police|fire|ambulance|extinguisher|assembly_point|siren|defibrillator|emergency_ward_entrance)$\""],"max":40,"l":{"pt":"Emergência: polícia e bombeiros","en":"Police and fire","fr":"Police et pompiers","it":"Polizia e vigili del fuoco"}},{"k":"banco","sel":"\"amenity\"~\"^(bank|atm|bureau_de_change|money_transfer|payment_terminal|money_lender)$\"|\"office\"~\"^(bank|financial)$\"","q":["\"amenity\"~\"^(bank|atm|bureau_de_change|money_transfer|payment_terminal|money_lender)$\"","\"office\"~\"^(bank|financial)$\""],"max":50,"l":{"pt":"Bancos, caixas 24 h e câmbio","en":"Banks, ATMs and exchange","fr":"Banques, GAB et change","it":"Banche e ATM"}},{"k":"mercado","sel":"\"shop\"~\"^(supermarket|convenience|greengrocer|butcher|deli|organic|chemist)$\"|\"amenity\"=\"marketplace\"","q":["\"shop\"~\"^(supermarket|convenience|greengrocer|butcher|deli|organic|chemist)$\"","\"amenity\"=\"marketplace\""],"max":50,"l":{"pt":"Supermercados e feiras","en":"Groceries and markets","fr":"Supermarchés et marchés","it":"Supermercati e mercati"}},{"k":"shopping","sel":"\"shop\"~\"^(mall|department_store|clothes|shoes|electronics|mobile_phone|computer|furniture|interior_decoration|home_goods|hardware|doityourself|beauty|perfumery|cosmetics|toys|gift|sports|jewelry|books|music|variety_store|second_hand|outdoor|bag|wallet)$\"|\"leisure\"=\"shopping_centre\"","q":["\"shop\"~\"^(mall|department_store|clothes|shoes|electronics|mobile_phone|computer|furniture|interior_decoration|home_goods|hardware|doityourself|beauty|perfumery|cosmetics|toys|gift|sports|jewelry|books|music|variety_store|second_hand|outdoor|bag|wallet)$\"","\"leisure\"=\"shopping_centre\""],"max":55,"l":{"pt":"Shoppings e lojas","en":"Malls and shops","fr":"Centres commerciaux","it":"Centri commerciali"}},{"k":"comida","sel":"\"amenity\"~\"^(restaurant|cafe|fast_food|food_court|bakery|ice_cream|deli|juice_bar|pub|bar|biergarten|nightclub|marketplace|drinking_water|vending_machine|bistro)$\"|\"cuisine\"~\"..\"","q":["\"amenity\"~\"^(restaurant|cafe|fast_food|food_court|bakery|ice_cream|deli|juice_bar|pub|bar|biergarten|nightclub|marketplace|drinking_water|vending_machine|bistro)$\"","\"cuisine\"~\"..\""],"max":70,"l":{"pt":"Onde comer: tudo","en":"Where to eat","fr":"Où manger","it":"Dove mangiare"}},{"k":"noite","sel":"\"amenity\"~\"^(bar|pub|nightclub|casino|music_venue|events_venue|social_club|biergarten|swingerclub)$\"|\"leisure\"~\"^(dance|bowling_alley|club)$\"|\"shop\"~\"^(alcohol|beverages)$\"|\"craft\"~\"^(brewery|winery)$\"","q":["\"amenity\"~\"^(bar|pub|nightclub|casino|music_venue|events_venue|social_club|biergarten|swingerclub)$\"","\"leisure\"~\"^(dance|bowling_alley|club)$\"","\"shop\"~\"^(alcohol|beverages)$\"","\"craft\"~\"^(brewery|winery)$\""],"max":45,"l":{"pt":"Vida noturna","en":"Nightlife","fr":"Vie nocturne","it":"Vita notturna"}},{"k":"hoteis","sel":"\"tourism\"~\"^(hotel|guest_house|hostel|motel|apartment|chalet|cabin|camp_site|caravan_site|bed_and_breakfast|self_catering|resort|alpine_hut|wilderness_hut|picnic_site)$\"|\"lodging\"=\"yes\"","q":["\"tourism\"~\"^(hotel|guest_house|hostel|motel|apartment|chalet|cabin|camp_site|caravan_site|bed_and_breakfast|self_catering|resort|alpine_hut|wilderness_hut|picnic_site)$\"","\"lodging\"=\"yes\""],"max":50,"l":{"pt":"Onde dormir","en":"Where to stay","fr":"Où dormir","it":"Dove dormire"}},{"k":"transporte","sel":"\"railway\"~\"^(station|halt|tram_stop|light_rail|subway_entrance|funicular|monorail)$\"|\"station\"~\"..\"|\"amenity\"~\"^(bus_station|bus_stop|ferry_terminal|taxi|bike_rental|car_sharing|transport_access|shuttle)$\"|\"public_transport\"~\"^(station|platform)$\"|\"highway\"=\"bus_way\"","q":["\"railway\"~\"^(station|halt|tram_stop|light_rail|subway_entrance|funicular|monorail)$\"","\"station\"~\"..\"","\"amenity\"~\"^(bus_station|bus_stop|ferry_terminal|taxi|bike_rental|car_sharing|transport_access|shuttle)$\"","\"public_transport\"~\"^(station|platform)$\"","\"highway\"=\"bus_way\""],"max":70,"l":{"pt":"Metrô, trem, ônibus e pontos","en":"Transit and stops","fr":"Transports et arrêts","it":"Trasporti e fermate"}},{"k":"aeroporto","sel":"\"aeroway\"~\"^(aerodrome|helipad|helistop)$\"|\"public_transport\"=\"aerodrome\"","q":["\"aeroway\"~\"^(aerodrome|helipad|helistop)$\"","\"public_transport\"=\"aerodrome\""],"max":15,"l":{"pt":"Aeroportos e helipontos","en":"Airports","fr":"Aéroports","it":"Aeroporti"}},{"k":"carro","sel":"\"amenity\"~\"^(fuel|charging_station|parking|car_wash|car_repair|car_parts|vehicle_inspection|drive_through|car_rental|ev_rental)$\"|\"shop\"~\"^(car_repair|car_parts|tyres|motorcycle_repair|motorcycle_tyres|auto_repair)$\"|\"highway\"=\"services\"","q":["\"amenity\"~\"^(fuel|charging_station|parking|car_wash|car_repair|car_parts|vehicle_inspection|drive_through|car_rental|ev_rental)$\"","\"shop\"~\"^(car_repair|car_parts|tyres|motorcycle_repair|motorcycle_tyres|auto_repair)$\"","\"highway\"=\"services\""],"max":55,"l":{"pt":"Postos, recarga, oficinas, estacionamento","en":"Fuel, charging, repair, parking","fr":"Carburant, bornes, parking","it":"Carburante e parcheggi"}},{"k":"cultura","sel":"\"tourism\"~\"^(museum|gallery|artwork|attractions|viewpoint)$\"|\"amenity\"~\"^(theatre|cinema|arts_centre|planetarium|community_centre|library|nightclub)$\"|\"leisure\"~\"^(theatre|dance|studio|escape_game)$\"","q":["\"tourism\"~\"^(museum|gallery|artwork|attractions|viewpoint)$\"","\"amenity\"~\"^(theatre|cinema|arts_centre|planetarium|community_centre|library|nightclub)$\"","\"leisure\"~\"^(theatre|dance|studio|escape_game)$\""],"max":55,"l":{"pt":"Museus, teatros, cinemas e galerias","en":"Museums and theatres","fr":"Musées et théâtres","it":"Musei e teatri"}},{"k":"religiao","sel":"\"amenity\"~\"^(place_of_worship|monastery|convent|religious|place_of_worship_old)$\"|\"religion\"~\"..\"|\"tourism\"~\"^(shrine|pilgrimage)$\"","q":["\"amenity\"~\"^(place_of_worship|monastery|convent|religious|place_of_worship_old)$\"","\"religion\"~\"..\"","\"tourism\"~\"^(shrine|pilgrimage)$\""],"max":45,"l":{"pt":"Igrejas, templos, mesquitas","en":"Places of worship","fr":"Lieux de culte","it":"Luoghi di culto"}},{"k":"ar_livre","sel":"\"leisure\"~\"^(park|garden|nature_reserve|beach_resort|slipway|fishing|bird_hide|dog_park|pitch|playground|recreation_ground|sports_centre|swimming_pool|stadium|water_park|amusement_arcade|marina|trail|sports_hall)$\"|\"natural\"~\"^(beach|peak|spring|cave_entrance|water|beach)$\"|\"tourism\"~\"^(zoo|aquarium|theme_park|wildlife_park|picnic_site)$\"|\"highway\"~\"^(path|pedestrian)$\"","q":["\"leisure\"~\"^(park|garden|nature_reserve|beach_resort|slipway|fishing|bird_hide|dog_park|pitch|playground|recreation_ground|sports_centre|swimming_pool|stadium|water_park|amusement_arcade|marina|trail|sports_hall)$\"","\"natural\"~\"^(beach|peak|spring|cave_entrance|water|beach)$\"","\"tourism\"~\"^(zoo|aquarium|theme_park|wildlife_park|picnic_site)$\"","\"highway\"~\"^(path|pedestrian)$\""],"max":65,"l":{"pt":"Parques, praias, trilhas e mirantes","en":"Parks, beaches and views","fr":"Parcs, plages et points de vue","it":"Parchi e spiagge"}},{"k":"esporte","sel":"\"leisure\"~\"^(stadium|sports_centre|pitch|swimming_pool|tennis|gym|fitness_centre|sports_hall|horse_racing|track_cycling|ice_rink|bowling_alley|climbing|water_sports|multiUse)$\"|\"sport\"~\"..\"","q":["\"leisure\"~\"^(stadium|sports_centre|pitch|swimming_pool|tennis|gym|fitness_centre|sports_hall|horse_racing|track_cycling|ice_rink|bowling_alley|climbing|water_sports|multiUse)$\"","\"sport\"~\"..\""],"max":50,"l":{"pt":"Estádios, academias e quadras","en":"Stadiums and gyms","fr":"Stades et salles","it":"Stadi e palestre"}},{"k":"educacao","sel":"\"amenity\"~\"^(school|kindergarten|college|university|language_school|music_school|library|student_accommodation|research_institute)$\"|\"amenity\"=\"childcare\"","q":["\"amenity\"~\"^(school|kindergarten|college|university|language_school|music_school|library|student_accommodation|research_institute)$\"","\"amenity\"=\"childcare\""],"max":60,"l":{"pt":"Escolas, creches, universidades e bibliotecas","en":"Schools and universities","fr":"Écoles et universités","it":"Scuole e università"}},{"k":"crianca","sel":"\"leisure\"~\"^(playground|water_playground|amusement_arcade|trampoline_park|kids_club|swimming_pool|sports_centre)$\"|\"tourism\"~\"^(zoo|aquarium|theme_park|museum|artwork)$\"|\"amenity\"~\"^(childcare|kindergarten|ice_cream|fast_food|restaurant|cafe|theatre|cinema|library|marketplace)$\"","q":["\"leisure\"~\"^(playground|water_playground|amusement_arcade|trampoline_park|kids_club|swimming_pool|sports_centre)$\"","\"tourism\"~\"^(zoo|aquarium|theme_park|museum|artwork)$\"","\"amenity\"~\"^(childcare|kindergarten|ice_cream|fast_food|restaurant|cafe|theatre|cinema|library|marketplace)$\""],"max":45,"l":{"pt":"Para crianças","en":"For children","fr":"Pour les enfants","it":"Per bambini"}},{"k":"servicos","sel":"\"amenity\"~\"^(townhall|post_office|post_box|government|courthouse|register_office|embassy|social_facility|community_centre|waste_basket|recycling|drinking_water|toilets|bench|atm|drinking_water)$\"|\"office\"~\"^(government|agency|association|tax_advisor|notary|employment_agency|advertising|union|political_party|ngo)$\"","q":["\"amenity\"~\"^(townhall|post_office|post_box|government|courthouse|register_office|embassy|social_facility|community_centre|waste_basket|recycling|drinking_water|toilets|bench|atm|drinking_water)$\"","\"office\"~\"^(government|agency|association|tax_advisor|notary|employment_agency|advertising|union|political_party|ngo)$\""],"max":50,"l":{"pt":"Prefeitura, correios e órgãos públicos","en":"City hall and public offices","fr":"Mairie et postes","it":"Municipio e poste"}},{"k":"empresas","sel":"\"office\"~\"^(company|association|coworking|estate_agent|lawyer|accountant|it|architect|engineer|surveyor|insurance|travel_agent|consulting|seo)$\"|\"amenity\"=\"coworking_space\"|\"craft\"~\"^(electrician|plumber|carpenter|mason|roofer|glazier|tiler|painter|joiner|blacksmith|sawmill|photographer|gardener|handicraft|key_cutter|locksmith|shoemaker|upholsterer)$\"|\"shop\"~\"^(insurance|travel_agency|copyshop|printshop|laundry|dry_cleaning|tailor|tailor)$\"","q":["\"office\"~\"^(company|association|coworking|estate_agent|lawyer|accountant|it|architect|engineer|surveyor|insurance|travel_agent|consulting|seo)$\"","\"amenity\"=\"coworking_space\"","\"craft\"~\"^(electrician|plumber|carpenter|mason|roofer|glazier|tiler|painter|joiner|blacksmith|sawmill|photographer|gardener|handicraft|key_cutter|locksmith|shoemaker|upholsterer)$\"","\"shop\"~\"^(insurance|travel_agency|copyshop|printshop|laundry|dry_cleaning|tailor|tailor)$\""],"max":55,"l":{"pt":"Empresas, coworkings e profissionais","en":"Companies and coworking","fr":"Entreprises et coworking","it":"Aziende e coworking"}},{"k":"moradia","sel":"\"office\"~\"^(estate_agent|rental|letting|property_management)$\"|\"shop\"~\"^(estate_agent|real_estate)$\"|\"amenity\"~\"^(retirement_home|assisted_living|social_facility)$\"","q":["\"office\"~\"^(estate_agent|rental|letting|property_management)$\"","\"shop\"~\"^(estate_agent|real_estate)$\"","\"amenity\"~\"^(retirement_home|assisted_living|social_facility)$\""],"max":30,"l":{"pt":"Imobiliárias e moradia","en":"Real estate","fr":"Immobilier","it":"Immobiliare"}},{"k":"acessivel","sel":"[\"wheelchair\"~\"^(yes|limited)$\"][\"amenity\"!~\"^$\"]","q":["[\"wheelchair\"~\"^(yes|limited)$\"][\"amenity\"!~\"^$\"]"],"max":45,"l":{"pt":"Acessibilidade (cadeirantes e libras)","en":"Accessibility","fr":"Accessibilité","it":"Accessibilità"}},{"k":"digital","sel":"\"shop\"~\"^(mobile_phone|electronics|computer|variety_store|telecommunication|repair)$\"|\"amenity\"~\"^(internet_cafe|public_wifi)$\"|\"internet_access\"~\"^(wlan|yes|wired)$\"","q":["\"shop\"~\"^(mobile_phone|electronics|computer|variety_store|telecommunication|repair)$\"","\"amenity\"~\"^(internet_cafe|public_wifi)$\"","\"internet_access\"~\"^(wlan|yes|wired)$\""],"max":40,"l":{"pt":"Internet, telefonia e SIM","en":"Internet and mobile","fr":"Internet et mobile","it":"Internet e telefonia"}},{"k":"utilidades","sel":"\"amenity\"~\"^(recycling|waste_basket|water_point|drinking_water|toilets|bench|shower|toilets)$\"|\"man_made\"~\"^(water_tap|water_well|pipeline|storage_tank|supply)$\"|\"shop\"~\"^(gas|hardware|doityourself|electronics)$\"|\"office\"~\"^(utility|energy|water_utility)$\"","q":["\"amenity\"~\"^(recycling|waste_basket|water_point|drinking_water|toilets|bench|shower|toilets)$\"","\"man_made\"~\"^(water_tap|water_well|pipeline|storage_tank|supply)$\"","\"shop\"~\"^(gas|hardware|doityourself|electronics)$\"","\"office\"~\"^(utility|energy|water_utility)$\""],"max":40,"l":{"pt":"Água, luz, gás, coleta e reciclagem","en":"Utilities and recycling","fr":"Services publics","it":"Utenze e raccolta"}}];
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



