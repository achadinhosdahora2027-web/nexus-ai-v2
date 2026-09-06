/* Etapa 8.4 - painel de servicos ao vivo v2 (OpenStreetMap via Overpass).
   v2: POI rico (email, diet, stars, denomination, dispensing, takeaway/delivery,
   fee, rooms, wheelchair traduzido), chips de sub-filtro por aba (client-side, sem
   nova consulta), badge 24h, auditoria de cobertura, ordenacao distancia|ficha
   completa. Queries Overpass idênticas à v1 (provadas em produção).
   A consulta sai do navegador do visitante (CORS liberado), cache local 6 h,
   rodízio de espelhos e "usar minha localização". Nada do mapa vai ao HTML. */
(function () {
  'use strict';
  var CATS = [{"k":"hospital","sel":"\"amenity\"~\"^(hospital|clinic|centre|doctors|urgent_care|trauma_centre|health_centre)$\"|\"healthcare\"~\"^(hospital|clinic|doctor|emergency)$\"","q":["\"amenity\"~\"^(hospital|clinic|centre|doctors|urgent_care|trauma_centre|health_centre)$\"","\"healthcare\"~\"^(hospital|clinic|doctor|emergency)$\""],"max":45,"l":{"pt":"Hospital e prontos-socorros","en":"Hospitals","fr":"Hôpitaux","it":"Ospedali"}},{"k":"farmacia","sel":"\"amenity\"~\"^(pharmacy|drugstore)$\"|\"healthcare\"=\"pharmacy\"","q":["\"amenity\"~\"^(pharmacy|drugstore)$\"","\"healthcare\"=\"pharmacy\""],"max":60,"l":{"pt":"Farmácias","en":"Pharmacies","fr":"Pharmacies","it":"Farmacie"}},{"k":"clinica","sel":"\"amenity\"~\"^(dentist|clinic|doctors|nurse|midwife|therapist|laboratory)$\"|\"healthcare\"~\"^(dentist|laboratory|physiotherapist|psychotherapist|optometrist|audiologist|sample_collection|veterinary)$\"","q":["\"amenity\"~\"^(dentist|clinic|doctors|nurse|midwife|therapist|laboratory)$\"","\"healthcare\"~\"^(dentist|laboratory|physiotherapist|psychotherapist|optometrist|audiologist|sample_collection|veterinary)$\""],"max":45,"l":{"pt":"Clínicas, dentistas, exames","en":"Clinics and labs","fr":"Cliniques et labos","it":"Cliniche e laboratori"}},{"k":"vet","sel":"\"shop\"~\"^(pet|pet_grooming)$\"|\"amenity\"~\"^(veterinary|animal_boarding|animal_shelter)$\"|\"leisure\"=\"dog_park\"","q":["\"shop\"~\"^(pet|pet_grooming)$\"","\"amenity\"~\"^(veterinary|animal_boarding|animal_shelter)$\"","\"leisure\"=\"dog_park\""],"max":30,"l":{"pt":"Pets: veterinário e pet shop","en":"Pets and vets","fr":"Animaux","it":"Animali"}},{"k":"emergencia","sel":"\"amenity\"~\"^(police|fire_station|ambulance_station|rescue_station|courthouse|prison|social_facility)$\"|\"emergency\"~\"^(police|fire|ambulance|extinguisher|assembly_point|siren|defibrillator|emergency_ward_entrance)$\"","q":["\"amenity\"~\"^(police|fire_station|ambulance_station|rescue_station|courthouse|prison|social_facility)$\"","\"emergency\"~\"^(police|fire|ambulance|extinguisher|assembly_point|siren|defibrillator|emergency_ward_entrance)$\""],"max":40,"l":{"pt":"Emergência: polícia e bombeiros","en":"Police and fire","fr":"Police et pompiers","it":"Polizia e vigili del fuoco"}},{"k":"banco","sel":"\"amenity\"~\"^(bank|atm|bureau_de_change|money_transfer|payment_terminal|money_lender)$\"|\"office\"~\"^(bank|financial)$\"","q":["\"amenity\"~\"^(bank|atm|bureau_de_change|money_transfer|payment_terminal|money_lender)$\"","\"office\"~\"^(bank|financial)$\""],"max":50,"l":{"pt":"Bancos, caixas 24 h e câmbio","en":"Banks, ATMs and exchange","fr":"Banques, GAB et change","it":"Banche e ATM"}},{"k":"mercado","sel":"\"shop\"~\"^(supermarket|convenience|greengrocer|butcher|deli|organic|chemist)$\"|\"amenity\"=\"marketplace\"","q":["\"shop\"~\"^(supermarket|convenience|greengrocer|butcher|deli|organic|chemist)$\"","\"amenity\"=\"marketplace\""],"max":50,"l":{"pt":"Supermercados e feiras","en":"Groceries and markets","fr":"Supermarchés et marchés","it":"Supermercati e mercati"}},{"k":"shopping","sel":"\"shop\"~\"^(mall|department_store|clothes|shoes|electronics|mobile_phone|computer|furniture|interior_decoration|home_goods|hardware|doityourself|beauty|perfumery|cosmetics|toys|gift|sports|jewelry|books|music|variety_store|second_hand|outdoor|bag|wallet)$\"|\"leisure\"=\"shopping_centre\"","q":["\"shop\"~\"^(mall|department_store|clothes|shoes|electronics|mobile_phone|computer|furniture|interior_decoration|home_goods|hardware|doityourself|beauty|perfumery|cosmetics|toys|gift|sports|jewelry|books|music|variety_store|second_hand|outdoor|bag|wallet)$\"","\"leisure\"=\"shopping_centre\""],"max":55,"l":{"pt":"Shoppings e lojas","en":"Malls and shops","fr":"Centres commerciaux","it":"Centri commerciali"}},{"k":"comida","sel":"\"amenity\"~\"^(restaurant|cafe|fast_food|food_court|bakery|ice_cream|deli|juice_bar|pub|bar|biergarten|nightclub|marketplace|drinking_water|vending_machine|bistro)$\"|\"cuisine\"~\"..\"","q":["\"amenity\"~\"^(restaurant|cafe|fast_food|food_court|bakery|ice_cream|deli|juice_bar|pub|bar|biergarten|nightclub|marketplace|drinking_water|vending_machine|bistro)$\"","\"cuisine\"~\"..\""],"max":70,"l":{"pt":"Onde comer: tudo","en":"Where to eat","fr":"Où manger","it":"Dove mangiare"}},{"k":"noite","sel":"\"amenity\"~\"^(bar|pub|nightclub|casino|music_venue|events_venue|social_club|biergarten|swingerclub)$\"|\"leisure\"~\"^(dance|bowling_alley|club)$\"|\"shop\"~\"^(alcohol|beverages)$\"|\"craft\"~\"^(brewery|winery)$\"","q":["\"amenity\"~\"^(bar|pub|nightclub|casino|music_venue|events_venue|social_club|biergarten|swingerclub)$\"","\"leisure\"~\"^(dance|bowling_alley|club)$\"","\"shop\"~\"^(alcohol|beverages)$\"","\"craft\"~\"^(brewery|winery)$\""],"max":45,"l":{"pt":"Vida noturna","en":"Nightlife","fr":"Vie nocturne","it":"Vita notturna"}},{"k":"hoteis","sel":"\"tourism\"~\"^(hotel|guest_house|hostel|motel|apartment|chalet|cabin|camp_site|caravan_site|bed_and_breakfast|self_catering|resort|alpine_hut|wilderness_hut|picnic_site)$\"|\"lodging\"=\"yes\"","q":["\"tourism\"~\"^(hotel|guest_house|hostel|motel|apartment|chalet|cabin|camp_site|caravan_site|bed_and_breakfast|self_catering|resort|alpine_hut|wilderness_hut|picnic_site)$\"","\"lodging\"=\"yes\""],"max":50,"l":{"pt":"Onde dormir","en":"Where to stay","fr":"Où dormir","it":"Dove dormire"}},{"k":"transporte","sel":"\"railway\"~\"^(station|halt|tram_stop|light_rail|subway_entrance|funicular|monorail)$\"|\"station\"~\"..\"|\"amenity\"~\"^(bus_station|bus_stop|ferry_terminal|taxi|bike_rental|car_sharing|transport_access|shuttle)$\"|\"public_transport\"~\"^(station|platform)$\"|\"highway\"=\"bus_way\"","q":["\"railway\"~\"^(station|halt|tram_stop|light_rail|subway_entrance|funicular|monorail)$\"","\"station\"~\"..\"","\"amenity\"~\"^(bus_station|bus_stop|ferry_terminal|taxi|bike_rental|car_sharing|transport_access|shuttle)$\"","\"public_transport\"~\"^(station|platform)$\"","\"highway\"=\"bus_way\""],"max":70,"l":{"pt":"Metrô, trem, ônibus e pontos","en":"Transit and stops","fr":"Transports et arrêts","it":"Trasporti e fermate"}},{"k":"aeroporto","sel":"\"aeroway\"~\"^(aerodrome|helipad|helistop)$\"|\"public_transport\"=\"aerodrome\"","q":["\"aeroway\"~\"^(aerodrome|helipad|helistop)$\"","\"public_transport\"=\"aerodrome\""],"max":15,"l":{"pt":"Aeroportos e helipontos","en":"Airports","fr":"Aéroports","it":"Aeroporti"}},{"k":"carro","sel":"\"amenity\"~\"^(fuel|charging_station|parking|car_wash|car_repair|car_parts|vehicle_inspection|drive_through|car_rental|ev_rental)$\"|\"shop\"~\"^(car_repair|car_parts|tyres|motorcycle_repair|motorcycle_tyres|auto_repair)$\"|\"highway\"=\"services\"","q":["\"amenity\"~\"^(fuel|charging_station|parking|car_wash|car_repair|car_parts|vehicle_inspection|drive_through|car_rental|ev_rental)$\"","\"shop\"~\"^(car_repair|car_parts|tyres|motorcycle_repair|motorcycle_tyres|auto_repair)$\"","\"highway\"=\"services\""],"max":55,"l":{"pt":"Postos, recarga, oficinas, estacionamento","en":"Fuel, charging, repair, parking","fr":"Carburant, bornes, parking","it":"Carburante e parcheggi"}},{"k":"cultura","sel":"\"tourism\"~\"^(museum|gallery|artwork|attractions|viewpoint)$\"|\"amenity\"~\"^(theatre|cinema|arts_centre|planetarium|community_centre|library|nightclub)$\"|\"leisure\"~\"^(theatre|dance|studio|escape_game)$\"","q":["\"tourism\"~\"^(museum|gallery|artwork|attractions|viewpoint)$\"","\"amenity\"~\"^(theatre|cinema|arts_centre|planetarium|community_centre|library|nightclub)$\"","\"leisure\"~\"^(theatre|dance|studio|escape_game)$\""],"max":55,"l":{"pt":"Museus, teatros, cinemas e galerias","en":"Museums and theatres","fr":"Musées et théâtres","it":"Musei e teatri"}},{"k":"religiao","sel":"\"amenity\"~\"^(place_of_worship|monastery|convent|religious|place_of_worship_old)$\"|\"religion\"~\"..\"|\"tourism\"~\"^(shrine|pilgrimage)$\"","q":["\"amenity\"~\"^(place_of_worship|monastery|convent|religious|place_of_worship_old)$\"","\"religion\"~\"..\"","\"tourism\"~\"^(shrine|pilgrimage)$\""],"max":45,"l":{"pt":"Igrejas, templos, mesquitas","en":"Places of worship","fr":"Lieux de culte","it":"Luoghi di culto"}},{"k":"ar_livre","sel":"\"leisure\"~\"^(park|garden|nature_reserve|beach_resort|slipway|fishing|bird_hide|dog_park|pitch|playground|recreation_ground|sports_centre|swimming_pool|stadium|water_park|amusement_arcade|marina|trail|sports_hall)$\"|\"natural\"~\"^(beach|peak|spring|cave_entrance|water|beach)$\"|\"tourism\"~\"^(zoo|aquarium|theme_park|wildlife_park|picnic_site)$\"|\"highway\"~\"^(path|pedestrian)$\"","q":["\"leisure\"~\"^(park|garden|nature_reserve|beach_resort|slipway|fishing|bird_hide|dog_park|pitch|playground|recreation_ground|sports_centre|swimming_pool|stadium|water_park|amusement_arcade|marina|trail|sports_hall)$\"","\"natural\"~\"^(beach|peak|spring|cave_entrance|water|beach)$\"","\"tourism\"~\"^(zoo|aquarium|theme_park|wildlife_park|picnic_site)$\"","\"highway\"~\"^(path|pedestrian)$\""],"max":65,"l":{"pt":"Parques, praias, trilhas e mirantes","en":"Parks, beaches and views","fr":"Parcs, plages et points de vue","it":"Parchi e spiagge"}},{"k":"esporte","sel":"\"leisure\"~\"^(stadium|sports_centre|pitch|swimming_pool|tennis|gym|fitness_centre|sports_hall|horse_racing|track_cycling|ice_rink|bowling_alley|climbing|water_sports|multiUse)$\"|\"sport\"~\"..\"","q":["\"leisure\"~\"^(stadium|sports_centre|pitch|swimming_pool|tennis|gym|fitness_centre|sports_hall|horse_racing|track_cycling|ice_rink|bowling_alley|climbing|water_sports|multiUse)$\"","\"sport\"~\"..\""],"max":50,"l":{"pt":"Estádios, academias e quadras","en":"Stadiums and gyms","fr":"Stades et salles","it":"Stadi e palestre"}},{"k":"educacao","sel":"\"amenity\"~\"^(school|kindergarten|college|university|language_school|music_school|library|student_accommodation|research_institute)$\"|\"amenity\"=\"childcare\"","q":["\"amenity\"~\"^(school|kindergarten|college|university|language_school|music_school|library|student_accommodation|research_institute)$\"","\"amenity\"=\"childcare\""],"max":60,"l":{"pt":"Escolas, creches, universidades e bibliotecas","en":"Schools and universities","fr":"Écoles et universités","it":"Scuole e università"}},{"k":"crianca","sel":"\"leisure\"~\"^(playground|water_playground|amusement_arcade|trampoline_park|kids_club|swimming_pool|sports_centre)$\"|\"tourism\"~\"^(zoo|aquarium|theme_park|museum|artwork)$\"|\"amenity\"~\"^(childcare|kindergarten|ice_cream|fast_food|restaurant|cafe|theatre|cinema|library|marketplace)$\"","q":["\"leisure\"~\"^(playground|water_playground|amusement_arcade|trampoline_park|kids_club|swimming_pool|sports_centre)$\"","\"tourism\"~\"^(zoo|aquarium|theme_park|museum|artwork)$\"","\"amenity\"~\"^(childcare|kindergarten|ice_cream|fast_food|restaurant|cafe|theatre|cinema|library|marketplace)$\""],"max":45,"l":{"pt":"Para crianças","en":"For children","fr":"Pour les enfants","it":"Per bambini"}},{"k":"servicos","sel":"\"amenity\"~\"^(townhall|post_office|post_box|government|courthouse|register_office|embassy|social_facility|community_centre|waste_basket|recycling|drinking_water|toilets|bench|atm|drinking_water)$\"|\"office\"~\"^(government|agency|association|tax_advisor|notary|employment_agency|advertising|union|political_party|ngo)$\"","q":["\"amenity\"~\"^(townhall|post_office|post_box|government|courthouse|register_office|embassy|social_facility|community_centre|waste_basket|recycling|drinking_water|toilets|bench|atm|drinking_water)$\"","\"office\"~\"^(government|agency|association|tax_advisor|notary|employment_agency|advertising|union|political_party|ngo)$\""],"max":50,"l":{"pt":"Prefeitura, correios e órgãos públicos","en":"City hall and public offices","fr":"Mairie et postes","it":"Municipio e poste"}},{"k":"empresas","sel":"\"office\"~\"^(company|association|coworking|estate_agent|lawyer|accountant|it|architect|engineer|surveyor|insurance|travel_agent|consulting|seo)$\"|\"amenity\"=\"coworking_space\"|\"craft\"~\"^(electrician|plumber|carpenter|mason|roofer|glazier|tiler|painter|joiner|blacksmith|sawmill|photographer|gardener|handicraft|key_cutter|locksmith|shoemaker|upholsterer)$\"|\"shop\"~\"^(insurance|travel_agency|copyshop|printshop|laundry|dry_cleaning|tailor|tailor)$\"","q":["\"office\"~\"^(company|association|coworking|estate_agent|lawyer|accountant|it|architect|engineer|surveyor|insurance|travel_agent|consulting|seo)$\"","\"amenity\"=\"coworking_space\"","\"craft\"~\"^(electrician|plumber|carpenter|mason|roofer|glazier|tiler|painter|joiner|blacksmith|sawmill|photographer|gardener|handicraft|key_cutter|locksmith|shoemaker|upholsterer)$\"","\"shop\"~\"^(insurance|travel_agency|copyshop|printshop|laundry|dry_cleaning|tailor|tailor)$\""],"max":55,"l":{"pt":"Empresas, coworkings e profissionais","en":"Companies and coworking","fr":"Entreprises et coworking","it":"Aziende e coworking"}},{"k":"moradia","sel":"\"office\"~\"^(estate_agent|rental|letting|property_management)$\"|\"shop\"~\"^(estate_agent|real_estate)$\"|\"amenity\"~\"^(retirement_home|assisted_living|social_facility)$\"","q":["\"office\"~\"^(estate_agent|rental|letting|property_management)$\"","\"shop\"~\"^(estate_agent|real_estate)$\"","\"amenity\"~\"^(retirement_home|assisted_living|social_facility)$\""],"max":30,"l":{"pt":"Imobiliárias e moradia","en":"Real estate","fr":"Immobilier","it":"Immobiliare"}},{"k":"acessivel","sel":"[\"wheelchair\"~\"^(yes|limited)$\"][\"amenity\"!~\"^$\"]","q":["[\"wheelchair\"~\"^(yes|limited)$\"][\"amenity\"!~\"^$\"]"],"max":45,"l":{"pt":"Acessibilidade (cadeirantes e libras)","en":"Accessibility","fr":"Accessibilité","it":"Accessibilità"}},{"k":"digital","sel":"\"shop\"~\"^(mobile_phone|electronics|computer|variety_store|telecommunication|repair)$\"|\"amenity\"~\"^(internet_cafe|public_wifi)$\"|\"internet_access\"~\"^(wlan|yes|wired)$\"","q":["\"shop\"~\"^(mobile_phone|electronics|computer|variety_store|telecommunication|repair)$\"","\"amenity\"~\"^(internet_cafe|public_wifi)$\"","\"internet_access\"~\"^(wlan|yes|wired)$\""],"max":40,"l":{"pt":"Internet, telefonia e SIM","en":"Internet and mobile","fr":"Internet et mobile","it":"Internet e telefonia"}},{"k":"utilidades","sel":"\"amenity\"~\"^(recycling|waste_basket|water_point|drinking_water|toilets|bench|shower|toilets)$\"|\"man_made\"~\"^(water_tap|water_well|pipeline|storage_tank|supply)$\"|\"shop\"~\"^(gas|hardware|doityourself|electronics)$\"|\"office\"~\"^(utility|energy|water_utility)$\"","q":["\"amenity\"~\"^(recycling|waste_basket|water_point|drinking_water|toilets|bench|shower|toilets)$\"","\"man_made\"~\"^(water_tap|water_well|pipeline|storage_tank|supply)$\"","\"shop\"~\"^(gas|hardware|doityourself|electronics)$\"","\"office\"~\"^(utility|energy|water_utility)$\""],"max":40,"l":{"pt":"Água, luz, gás, coleta e reciclagem","en":"Utilities and recycling","fr":"Services publics","it":"Utenze e raccolta"}}];

  /* Sub-filtros por aba: teste client-side sobre as tags (sem nova consulta). */
  var FILTROS = {
    comida: [
      { id: 'pizza', l: { pt: '🍕 Pizza/massas', en: '🍕 Pizza/pasta', fr: '🍕 Pizza/pâtes', it: '🍕 Pizza/pasta' },
        test: function (t) { return /(pizza|italian|pasta)/.test(t.cuisine || ''); } },
      { id: 'lanche', l: { pt: '🍔 Lanches', en: '🍔 Snacks', fr: '🍔 Snacks', it: '🍔 Snack' },
        test: function (t) { return /^(fast_food|food_court|juice_bar)$/.test(t.amenity || ''); } },
      { id: 'cafe', l: { pt: '☕ Cafés/doces', en: '☕ Cafés/sweets', fr: '☕ Cafés/douceurs', it: '☕ Caffè/dolci' },
        test: function (t) { return /^(cafe|ice_cream|bakery|bistro)$/.test(t.amenity || ''); } },
      { id: 'veg', l: { pt: '🥗 Veg/verde', en: '🥗 Veg', fr: '🥗 Végé', it: '🥗 Veg' },
        test: function (t) { return /^(yes|only)$/.test(t['diet:vegetarian'] || '') || /^(yes|only)$/.test(t['diet:vegan'] || ''); } },
      { id: 'bar', l: { pt: '🍺 Bar', en: '🍺 Bar', fr: '🍺 Bar', it: '🍺 Bar' },
        test: function (t) { return /^(bar|pub|biergarten)$/.test(t.amenity || ''); } }
    ],
    noite: [
      { id: 'bares', l: { pt: '🍺 Bares', en: '🍺 Bars', fr: '🍺 Bars', it: '🍺 Bar' },
        test: function (t) { return /^(bar|pub|biergarten)$/.test(t.amenity || ''); } },
      { id: 'balada', l: { pt: '🪩 Baladas', en: '🪩 Clubs', fr: '🪩 Clubs', it: '🪩 Discoteche' },
        test: function (t) { return t.amenity === 'nightclub' || /^(dance|club)$/.test(t.leisure || ''); } },
      { id: 'aovivo', l: { pt: '🎸 Ao vivo', en: '🎸 Live', fr: '🎸 Concerts', it: '🎸 Dal vivo' },
        test: function (t) { return /^(music_venue|events_venue)$/.test(t.amenity || '') || t.live_music === 'yes'; } },
      { id: 'vinho', l: { pt: '🍷 Vinho & cerveja artesanal', en: '🍷 Wine & craft beer', fr: '🍷 Vin & bière artisanale', it: '🍷 Vino e birra artigianale' },
        test: function (t) { return /^(brewery|winery|microbrewery|distillery)$/.test(t.craft || ''); } }
    ],
    hoteis: [
      { id: 'hotel', l: { pt: '🏨 Hotéis', en: '🏨 Hotels', fr: '🏨 Hôtels', it: '🏨 Hotel' },
        test: function (t) { return t.tourism === 'hotel' || t.tourism === 'resort'; } },
      { id: 'hostel', l: { pt: '🎒 Hostels', en: '🎒 Hostels', fr: '🎒 Auberges', it: '🎒 Ostelli' },
        test: function (t) { return t.tourism === 'hostel'; } },
      { id: 'pousada', l: { pt: '🛏️ Pousadas/motéis', en: '🛏️ Inns/motels', fr: '🛏️ Chambres/motels', it: '🛏️ B&B/motel' },
        test: function (t) { return /^(guest_house|bed_and_breakfast|motel|apartment|chalet|cabin)$/.test(t.tourism || ''); } },
      { id: 'camping', l: { pt: '⛺ Camping', en: '⛺ Camping', fr: '⛺ Camping', it: '⛺ Campeggio' },
        test: function (t) { return /^(camp_site|caravan_site)$/.test(t.tourism || ''); } }
    ],
    religiao: [
      { id: 'crista', l: { pt: '✝️ Cristãs', en: '✝️ Christian', fr: '✝️ Chrétiennes', it: '✝️ Cristiane' },
        test: function (t) { return t.religion === 'christian'; } },
      { id: 'islam', l: { pt: '☪️ Islâmicas', en: '☪️ Muslim', fr: '☪️ Musulmanes', it: '☪️ Islamiche' },
        test: function (t) { return t.religion === 'muslim'; } },
      { id: 'jud', l: { pt: '✡️ Judaicas', en: '✡️ Jewish', fr: '✡️ Juifs', it: '✡️ Ebraici' },
        test: function (t) { return t.religion === 'jewish'; } },
      { id: 'oriental', l: { pt: '🕉️ Orientais', en: '🕉️ Eastern', fr: '🕉️ Orientales', it: '🕉️ Orientali' },
        test: function (t) { return /^(buddhist|hindu|shinto|taoist|sikh|jain)$/.test(t.religion || ''); } }
    ],
    transporte: [
      { id: 'trilho', l: { pt: '🚇 Metrô/trem', en: '🚇 Metro/rail', fr: '🚇 Métro/train', it: '🚇 Metro/treno' },
        test: function (t) { return /^(station|halt|subway_entrance|tram_stop|light_rail|funicular|monorail)$/.test(t.railway || '') || (t.station || '') !== ''; } },
      { id: 'onibus', l: { pt: '🚌 Ônibus', en: '🚌 Bus', fr: '🚌 Bus', it: '🚌 Autobus' },
        test: function (t) { return /^(bus_station|bus_stop)$/.test(t.amenity || '') || t.highway === 'bus_stop'; } },
      { id: 'taxi', l: { pt: '🚕 Táxi/bike', en: '🚕 Taxi/bike', fr: '🚕 Taxi/vélo', it: '🚕 Taxi/bici' },
        test: function (t) { return /^(taxi|bike_rental|car_sharing|shuttle)$/.test(t.amenity || ''); } },
      { id: 'barca', l: { pt: '⛴️ Barcas', en: '⛴️ Ferries', fr: '⛴️ Ferries', it: '⛴️ Traghetti' },
        test: function (t) { return t.amenity === 'ferry_terminal'; } }
    ],
    farmacia: [
      { id: 'h24', l: { pt: '🕐 24 h', en: '🕐 24 h', fr: '🕐 24 h', it: '🕐 24 h' },
        test: function (t) { return is24h(t); } },
      { id: 'manip', l: { pt: '💊 Manipulação', en: '💊 Compounding', fr: '💊 Préparations', it: '💊 Galenica' },
        test: function (t) { return t.dispensing === 'yes'; } }
    ],
    hospital: [
      { id: 'hosp', l: { pt: '🏥 Hospitais', en: '🏥 Hospitals', fr: '🏥 Hôpitaux', it: '🏥 Ospedali' },
        test: function (t) { return t.amenity === 'hospital' || t.healthcare === 'hospital'; } },
      { id: 'urg', l: { pt: '🚑 Urgência', en: '🚑 Emergency', fr: '🚑 Urgences', it: '🚑 Urgenze' },
        test: function (t) { return /^(urgent_care|trauma_centre)$/.test(t.amenity || '') || /^(emergency|emergency_ward_entrance)$/.test(t.emergency || '') || t.healthcare === 'emergency'; } },
      { id: 'posto', l: { pt: '🩺 Postos/clínicas', en: '🩺 Health centres', fr: '🩺 Dispensaires', it: '🩺 Ambulatori' },
        test: function (t) { return /^(clinic|centre|doctors|health_centre)$/.test(t.amenity || '') || /^(clinic|doctor)$/.test(t.healthcare || ''); } }
    ],
    clinica: [
      { id: 'dente', l: { pt: '🦷 Dentistas', en: '🦷 Dentists', fr: '🦷 Dentistes', it: '🦷 Dentisti' },
        test: function (t) { return t.amenity === 'dentist' || t.healthcare === 'dentist'; } },
      { id: 'exame', l: { pt: '🧪 Exames', en: '🧪 Labs', fr: '🧪 Labos', it: '🧪 Analisi' },
        test: function (t) { return /^(laboratory|sample_collection)$/.test(t.healthcare || '') || t.amenity === 'laboratory'; } },
      { id: 'terapia', l: { pt: '🧠 Terapias', en: '🧠 Therapy', fr: '🧠 Thérapies', it: '🧠 Terapie' },
        test: function (t) { return /^(therapist|physiotherapist|psychotherapist|optometrist|audiologist|nurse|midwife)$/.test(t.healthcare || '') || /^(therapist|nurse|midwife)$/.test(t.amenity || ''); } }
    ],
    shopping: [
      { id: 'mall', l: { pt: '🛍️ Shoppings', en: '🛍️ Malls', fr: '🛍️ Centres', it: '🛍️ Centri' },
        test: function (t) { return /^(mall|department_store)$/.test(t.shop || '') || t.leisure === 'shopping_centre'; } },
      { id: 'moda', l: { pt: '👗 Moda', en: '👗 Fashion', fr: '👗 Mode', it: '👗 Moda' },
        test: function (t) { return /^(clothes|shoes|bag|jewelry|beauty|perfumery|cosmetics|wallet)$/.test(t.shop || ''); } },
      { id: 'eletro', l: { pt: '📱 Eletrônicos', en: '📱 Electronics', fr: '📱 Électronique', it: '📱 Elettronica' },
        test: function (t) { return /^(electronics|mobile_phone|computer)$/.test(t.shop || ''); } },
      { id: 'lazer', l: { pt: '📚 Livros & lazer', en: '📚 Books & leisure', fr: '📚 Livres & loisirs', it: '📚 Libri e tempo libero' },
        test: function (t) { return /^(books|music|toys|gift|sports|outdoor|second_hand|variety_store)$/.test(t.shop || ''); } }
    ],
    mercado: [
      { id: 'super', l: { pt: '🛒 Supermercados', en: '🛒 Supermarkets', fr: '🛒 Supermarchés', it: '🛒 Supermercati' },
        test: function (t) { return t.shop === 'supermarket'; } },
      { id: 'conv', l: { pt: '🏪 Conveniência', en: '🏪 Convenience', fr: '🏪 Dépanneurs', it: '🏪 Alimentari' },
        test: function (t) { return /^(convenience|deli|organic|chemist)$/.test(t.shop || ''); } },
      { id: 'feira', l: { pt: '🥬 Feiras/açougue', en: '🥬 Markets/butcher', fr: '🥬 Marchés/boucher', it: '🥬 Mercati/macelleria' },
        test: function (t) { return t.amenity === 'marketplace' || /^(greengrocer|butcher)$/.test(t.shop || ''); } }
    ],
    esporte: [
      { id: 'estadio', l: { pt: '🏟️ Estádios', en: '🏟️ Stadiums', fr: '🏟️ Stades', it: '🏟️ Stadi' },
        test: function (t) { return t.leisure === 'stadium' || t.leisure === 'horse_racing'; } },
      { id: 'acad', l: { pt: '💪 Academias', en: '💪 Gyms', fr: '💪 Salles', it: '💪 Palestre' },
        test: function (t) { return /^(gym|fitness_centre)$/.test(t.leisure || ''); } },
      { id: 'piscina', l: { pt: '🏊 Piscinas', en: '🏊 Pools', fr: '🏊 Piscines', it: '🏊 Piscine' },
        test: function (t) { return t.leisure === 'swimming_pool'; } },
      { id: 'quadra', l: { pt: '⚽ Quadras/pistas', en: '⚽ Pitches/tracks', fr: '⚽ Terrains/pistes', it: '⚽ Campi/piste' },
        test: function (t) { return /^(pitch|sports_centre|sports_hall|tennis|track_cycling|ice_rink|bowling_alley|climbing)$/.test(t.leisure || '') || (t.sport || '') !== ''; } }
    ],
    educacao: [
      { id: 'escola', l: { pt: '🏫 Escolas', en: '🏫 Schools', fr: '🏫 Écoles', it: '🏫 Scuole' },
        test: function (t) { return t.amenity === 'school'; } },
      { id: 'uni', l: { pt: '🎓 Universidades', en: '🎓 Universities', fr: '🎓 Universités', it: '🎓 Università' },
        test: function (t) { return /^(university|college|language_school|music_school|research_institute)$/.test(t.amenity || ''); } },
      { id: 'biblio', l: { pt: '📚 Bibliotecas', en: '📚 Libraries', fr: '📚 Bibliothèques', it: '📚 Biblioteche' },
        test: function (t) { return t.amenity === 'library'; } },
      { id: 'creche', l: { pt: '🧒 Creches', en: '🧒 Childcare', fr: '🧒 Crèches', it: '🧒 Asili' },
        test: function (t) { return /^(kindergarten|childcare)$/.test(t.amenity || ''); } }
    ],
    cultura: [
      { id: 'museu', l: { pt: '🖼️ Museus', en: '🖼️ Museums', fr: '🖼️ Musées', it: '🖼️ Musei' },
        test: function (t) { return /^(museum|gallery)$/.test(t.tourism || ''); } },
      { id: 'cinema', l: { pt: '🎬 Cinemas', en: '🎬 Cinemas', fr: '🎬 Cinémas', it: '🎬 Cinema' },
        test: function (t) { return t.amenity === 'cinema'; } },
      { id: 'teatro', l: { pt: '🎭 Teatros', en: '🎭 Theatres', fr: '🎭 Théâtres', it: '🎭 Teatri' },
        test: function (t) { return t.amenity === 'theatre' || t.leisure === 'theatre'; } },
      { id: 'arte', l: { pt: '🎨 Arte/mirantes', en: '🎨 Art/viewpoints', fr: '🎨 Art/belvédères', it: '🎨 Arte/belvedere' },
        test: function (t) { return /^(artwork|attractions|viewpoint)$/.test(t.tourism || ''); } }
    ],
    carro: [
      { id: 'posto', l: { pt: '⛽ Postos', en: '⛽ Fuel', fr: '⛽ Carburant', it: '⛽ Benzina' },
        test: function (t) { return t.amenity === 'fuel' || t.highway === 'services'; } },
      { id: 'ev', l: { pt: '🔌 Recarga EV', en: '🔌 EV charging', fr: '🔌 Recharge VE', it: '🔌 Ricarica EV' },
        test: function (t) { return t.amenity === 'charging_station' || t.amenity === 'ev_rental'; } },
      { id: 'park', l: { pt: '🅿️ Estacionamento', en: '🅿️ Parking', fr: '🅿️ Parking', it: '🅿️ Parcheggi' },
        test: function (t) { return t.amenity === 'parking'; } },
      { id: 'oficina', l: { pt: '🔧 Oficinas', en: '🔧 Repair', fr: '🔧 Garages', it: '🔧 Officine' },
        test: function (t) { return /^(car_repair|car_parts|vehicle_inspection|car_wash)$/.test(t.amenity || '') || /repair|tyres|parts/.test(t.shop || ''); } },
      { id: 'aluguel', l: { pt: '🚗 Aluguel', en: '🚗 Rental', fr: '🚗 Location', it: '🚗 Noleggio' },
        test: function (t) { return t.amenity === 'car_rental'; } }
    ],
    banco: [
      { id: 'atm', l: { pt: '🏧 Caixas', en: '🏧 ATMs', fr: '🏧 DAB', it: '🏧 Bancomat' },
        test: function (t) { return /^(atm|payment_terminal)$/.test(t.amenity || ''); } },
      { id: 'cambio', l: { pt: '💱 Câmbio', en: '💱 Exchange', fr: '💱 Change', it: '💱 Cambio' },
        test: function (t) { return /^(bureau_de_change|money_transfer|money_lender)$/.test(t.amenity || ''); } },
      { id: 'agencia', l: { pt: '🏦 Agências', en: '🏦 Branches', fr: '🏦 Agences', it: '🏦 Filiali' },
        test: function (t) { return t.amenity === 'bank' || /^(bank|financial)$/.test(t.office || ''); } }
    ],
    servicos: [
      { id: 'gov', l: { pt: '🏛️ Governo', en: '🏛️ Government', fr: '🏛️ Mairie/État', it: '🏛️ Comune/Stato' },
        test: function (t) { return /^(townhall|government|courthouse|register_office|embassy|community_centre)$/.test(t.amenity || '') || /^(government|agency|association|ngo|union|political_party)$/.test(t.office || ''); } },
      { id: 'correio', l: { pt: '📮 Correios', en: '📮 Post', fr: '📮 Poste', it: '📮 Poste' },
        test: function (t) { return /^(post_office|post_box)$/.test(t.amenity || ''); } },
      { id: 'recicla', l: { pt: '♻️ Reciclagem', en: '♻️ Recycling', fr: '♻️ Recyclage', it: '♻️ Riciclo' },
        test: function (t) { return t.amenity === 'recycling'; } }
    ],
    empresas: [
      { id: 'escrit', l: { pt: '🏢 Escritórios', en: '🏢 Offices', fr: '🏢 Bureaux', it: '🏢 Uffici' },
        test: function (t) { return /^(company|lawyer|accountant|it|architect|engineer|surveyor|insurance|consulting|advertising|notary|tax_advisor|employment_agency|travel_agent|estate_agent)$/.test(t.office || ''); } },
      { id: 'cowork', l: { pt: '💻 Coworking', en: '💻 Coworking', fr: '💻 Coworking', it: '💻 Coworking' },
        test: function (t) { return t.office === 'coworking' || t.amenity === 'coworking_space'; } },
      { id: 'profis', l: { pt: '🔧 Profissionais', en: '🔧 Trades', fr: '🔧 Artisans', it: '🔧 Artigiani' },
        test: function (t) { return (t.craft || '') !== '' && t.craft !== 'brewery' && t.craft !== 'winery'; } }
    ],
    ar_livre: [
      { id: 'parque', l: { pt: '🌳 Parques', en: '🌳 Parks', fr: '🌳 Parcs', it: '🌳 Parchi' },
        test: function (t) { return /^(park|garden|nature_reserve|recreation_ground)$/.test(t.leisure || ''); } },
      { id: 'praia', l: { pt: '🏖️ Praias', en: '🏖️ Beaches', fr: '🏖️ Plages', it: '🏖️ Spiagge' },
        test: function (t) { return t.natural === 'beach' || t.leisure === 'beach_resort' || t.leisure === 'marina'; } },
      { id: 'trilha', l: { pt: '🥾 Trilhas', en: '🥾 Trails', fr: '🥾 Sentiers', it: '🥾 Sentieri' },
        test: function (t) { return t.leisure === 'trail' || /^(path|pedestrian)$/.test(t.highway || '') || t.natural === 'peak'; } },
      { id: 'mirante', l: { pt: '🔭 Mirantes/zoo', en: '🔭 Views/zoo', fr: '🔭 Belvédères/zoo', it: '🔭 Belvedere/zoo' },
        test: function (t) { return /^(viewpoint)$/.test(t.tourism || '') || /^(zoo|aquarium|theme_park|wildlife_park)$/.test(t.tourism || ''); } },
      { id: 'agua', l: { pt: '💦 Água/lazer', en: '💦 Water/fun', fr: '💦 Eau/loisirs', it: '💦 Acqua/divertimento' },
        test: function (t) { return /^(swimming_pool|water_park|fishing|slipway)$/.test(t.leisure || '') || /^(spring|cave_entrance|water)$/.test(t.natural || ''); } }
    ],
    crianca: [
      { id: 'parquinho', l: { pt: '🛝 Parquinhos', en: '🛝 Playgrounds', fr: '🛝 Aires de jeux', it: '🛝 Parchi giochi' },
        test: function (t) { return /^(playground|water_playground)$/.test(t.leisure || ''); } },
      { id: 'diversao', l: { pt: '🎠 Diversão', en: '🎠 Fun', fr: '🎠 Loisirs', it: '🎠 Divertimento' },
        test: function (t) { return /^(amusement_arcade|trampoline_park|kids_club)$/.test(t.leisure || '') || /^(theme_park|zoo|aquarium)$/.test(t.tourism || ''); } },
      { id: 'cultura', l: { pt: '📚 Cultura kids', en: '📚 Kids culture', fr: '📚 Culture enfants', it: '📚 Cultura bimbi' },
        test: function (t) { return /^(museum|artwork)$/.test(t.tourism || '') || /^(theatre|cinema|library)$/.test(t.amenity || ''); } }
    ],
    emergencia: [
      { id: 'policia', l: { pt: '🚓 Polícia', en: '🚓 Police', fr: '🚓 Police', it: '🚓 Polizia' },
        test: function (t) { return t.amenity === 'police' || t.emergency === 'police' || t.amenity === 'courthouse'; } },
      { id: 'bombeiro', l: { pt: '🚒 Bombeiros', en: '🚒 Fire', fr: '🚒 Pompiers', it: '🚒 Vigili del fuoco' },
        test: function (t) { return t.amenity === 'fire_station' || t.emergency === 'fire'; } },
      { id: 'resgate', l: { pt: '🚑 Resgate', en: '🚑 Rescue', fr: '🚑 Secours', it: '🚑 Soccorso' },
        test: function (t) { return /^(ambulance_station|rescue_station)$/.test(t.amenity || '') || /^(ambulance|emergency_ward_entrance|defibrillator)$/.test(t.emergency || ''); } }
    ],
    vet: [
      { id: 'vet', l: { pt: '🩺 Veterinários', en: '🩺 Vets', fr: '🩺 Vétérinaires', it: '🩺 Veterinari' },
        test: function (t) { return t.amenity === 'veterinary'; } },
      { id: 'petshop', l: { pt: '🐕 Pet shops', en: '🐕 Pet shops', fr: '🐕 Animaleries', it: '🐕 Negozi animali' },
        test: function (t) { return /^(pet|pet_grooming)$/.test(t.shop || ''); } },
      { id: 'dogpark', l: { pt: '🌳 Parques & hospedagem', en: '🌳 Parks & boarding', fr: '🌳 Parcs & pensions', it: '🌳 Parchi e pensioni' },
        test: function (t) { return t.leisure === 'dog_park' || /^(animal_boarding|animal_shelter)$/.test(t.amenity || ''); } }
    ],
    utilidades: [
      { id: 'recicla', l: { pt: '♻️ Reciclagem', en: '♻️ Recycling', fr: '♻️ Recyclage', it: '♻️ Riciclo' },
        test: function (t) { return t.amenity === 'recycling'; } },
      { id: 'wc', l: { pt: '🚻 Banheiros', en: '🚻 Toilets', fr: '🚻 Toilettes', it: '🚻 Bagni' },
        test: function (t) { return /^(toilets|shower)$/.test(t.amenity || ''); } },
      { id: 'agua', l: { pt: '💧 Água', en: '💧 Water', fr: '💧 Eau', it: '💧 Acqua' },
        test: function (t) { return /^(drinking_water|water_point)$/.test(t.amenity || '') || /^(water_tap|water_well)$/.test(t.man_made || ''); } }
    ],
    digital: [
      { id: 'wifi', l: { pt: '📶 Wi-Fi/ponto net', en: '📶 Wi-Fi/hotspots', fr: '📶 Wi-Fi/points net', it: '📶 Wi-Fi/punti net' },
        test: function (t) { return /^(internet_cafe|public_wifi)$/.test(t.amenity || '') || /^(wlan|yes|wired)$/.test(t.internet_access || ''); } },
      { id: 'chip', l: { pt: '📱 Lojas de chip', en: '📱 SIM shops', fr: '📱 Boutiques SIM', it: '📱 Negozi SIM' },
        test: function (t) { return /^(mobile_phone|telecommunication|electronics|computer)$/.test(t.shop || ''); } }
    ],
    moradia: [
      { id: 'imob', l: { pt: '🏠 Imobiliárias', en: '🏠 Agencies', fr: '🏠 Agences', it: '🏠 Agenzie' },
        test: function (t) { return /^(estate_agent|rental|letting|property_management)$/.test(t.office || '') || /^(estate_agent|real_estate)$/.test(t.shop || ''); } },
      { id: 'senior', l: { pt: '🧓 Residencial sênior', en: '🧓 Senior living', fr: '🧓 Résidences seniors', it: '🧓 Residenze anziani' },
        test: function (t) { return /^(retirement_home|assisted_living|social_facility)$/.test(t.amenity || ''); } }
    ]
  };

  var HOSTS = ['https://overpass-api.de/api/interpreter',
               'https://overpass.kumi.systems/api/interpreter',
               'https://overpass.private.coffee/api/interpreter',
               'https://maps.mail.ru/osm/tools/overpass/api/interpreter'];
  var LIMITE = 500;
  var TTL = 6 * 3600000;
  var CACHE_PFX = 'p7osm2:';

  /* i18n central */
  var STR = {
    todos: { pt: '✓ Todos', en: '✓ All', fr: '✓ Tous', it: '✓ Tutti' },
    ordDist: { pt: '📍 distância', en: '📍 distance', fr: '📍 distance', it: '📍 distanza' },
    ordFicha: { pt: '📋 ficha completa', en: '📋 fullest listing', fr: '📋 fiche la plus complète', it: '📋 scheda più completa' },
    ordenar: { pt: 'ordenar:', en: 'sort:', fr: 'trier :', it: 'ordina:' },
    comTel: { pt: 'com telefone', en: 'with phone', fr: 'avec téléphone', it: 'con telefono' },
    comSite: { pt: 'com site', en: 'with website', fr: 'avec site', it: 'con sito' },
    comHor: { pt: 'com horário', en: 'with hours', fr: 'avec horaires', it: 'con orari' },
    h24: { pt: '24 h', en: '24 h', fr: '24 h/24', it: '24 h' },
    email: { pt: 'e-mail', en: 'email', fr: 'e-mail', it: 'email' },
    tel: { pt: 'tel.', en: 'tel.', fr: 'tél.', it: 'tel.' },
    horario: { pt: 'horário', en: 'hours', fr: 'horaires', it: 'orari' },
    cozinha: { pt: 'cozinha', en: 'cuisine', fr: 'cuisine', it: 'cucina' },
    acess: { pt: 'acessibilidade', en: 'accessibility', fr: 'accessibilité', it: 'accessibilità' },
    acessSim: { pt: 'total', en: 'full', fr: 'totale', it: 'totale' },
    acessParc: { pt: 'parcial', en: 'partial', fr: 'partielle', it: 'parziale' },
    acessNao: { pt: 'não', en: 'no', fr: 'non', it: 'no' },
    net: { pt: 'internet', en: 'internet', fr: 'internet', it: 'internet' },
    wifi: { pt: 'wi-fi', en: 'wi-fi', fr: 'wi-fi', it: 'wi-fi' },
    cabo: { pt: 'a cabo', en: 'wired', fr: 'filaire', it: 'cablata' },
    sim: { pt: 'sim', en: 'yes', fr: 'oui', it: 'sì' },
    nao: { pt: 'não', en: 'no', fr: 'non', it: 'no' },
    vegetariano: { pt: 'vegetariano', en: 'vegetarian', fr: 'végétarien', it: 'vegetariano' },
    vegano: { pt: 'vegano', en: 'vegan', fr: 'vegan', it: 'vegano' },
    halal: { pt: 'halal', en: 'halal', fr: 'halal', it: 'halal' },
    kosher: { pt: 'kosher', en: 'kosher', fr: 'casher', it: 'kosher' },
    semGluten: { pt: 'sem glúten', en: 'gluten-free', fr: 'sans gluten', it: 'senza glutine' },
    estrelas: { pt: 'estrelas', en: 'stars', fr: 'étoiles', it: 'stelle' },
    denom: { pt: 'denominação', en: 'denomination', fr: 'dénomination', it: 'denominazione' },
    manip: { pt: 'manipulação', en: 'compounding', fr: 'préparations', it: 'galenica' },
    viagem: { pt: 'para viagem', en: 'takeaway', fr: 'à emporter', it: 'da asporto' },
    entrega: { pt: 'entrega', en: 'delivery', fr: 'livraison', it: 'consegna' },
    drive: { pt: 'drive-thru', en: 'drive-through', fr: 'au volant', it: 'drive-through' },
    arLivre: { pt: 'área externa', en: 'outdoor seating', fr: 'terrasse', it: 'all’aperto' },
    pago: { pt: 'pago', en: 'paid', fr: 'payant', it: 'a pagamento' },
    gratis: { pt: 'grátis', en: 'free', fr: 'gratuit', it: 'gratis' },
    quartos: { pt: 'quartos', en: 'rooms', fr: 'chambres', it: 'camere' },
    consultando: { pt: 'Consultando o OpenStreetMap…', en: 'Querying OpenStreetMap…', fr: 'Interrogation d’OpenStreetMap…', it: 'Consultazione di OpenStreetMap…' },
    semResposta: { pt: 'O mapa colaborador não respondeu agora. ', en: 'The collaborative map did not answer. ', fr: 'La carte collaborative n’a pas répondu. ', it: 'La mappa collaborativa non ha risposto. ' },
    buscarOsm: { pt: 'buscar no OSM', en: 'search on OSM', fr: 'chercher sur OSM', it: 'cerca su OSM' },
    vazio: { pt: 'Nenhum ponto com nome nessa categoria ainda — o mapa é feito por voluntários, então use as buscas abaixo.',
             en: 'No named place in this category yet — the map is volunteer-made, so use the searches below.',
             fr: 'Aucun lieu nommé dans cette catégorie pour le moment — la carte est faite par des bénévoles.',
             it: 'Nessun luogo con nome in questa categoria per ora — la mappa è fatta da volontari.' },
    vazioFiltro: { pt: 'Nenhum resultado nesse filtro — tente “Todos”.',
             en: 'No results with this filter — try “All”.',
             fr: 'Aucun résultat avec ce filtre — essayez « Tous ».',
             it: 'Nessun risultato con questo filtro — prova “Tutti”.' },
    rota: { pt: 'rota', en: 'route', fr: 'itinéraire', it: 'percorso' },
    noMapa: { pt: 'no mapa', en: 'on the map', fr: 'sur la carte', it: 'sulla mappa' },
    ligar: { pt: 'ligar', en: 'call', fr: 'appeler', it: 'chiama' },
    explorar: { pt: 'explorar a camada', en: 'explore the layer', fr: 'explorer la couche', it: 'esplora il livello' },
    aviso: { pt: 'dado comunitário: pode faltar comércio pequeno', en: 'community data: small businesses may be missing',
             fr: 'donnée communautaire : des commerces peuvent manquer', it: 'dato comunitario: può mancare qualche attività' }
  };

  function byKey(k) { for (var i = 0; i < CATS.length; i++) { if (CATS[i].k === k) return CATS[i]; } return null; }
  function el(t, a, x) { var e = document.createElement(t); for (var k in a) { if (a.hasOwnProperty(k)) e.setAttribute(k, a[k]); } if (x !== undefined) e.textContent = x; return e; }
  function L(key, lang) { var s = STR[key]; if (!s) return key; return s[lang] || s.en || s.pt; }
  function txt(lang, pt, fr, it, en) { return lang === 'fr' ? fr : lang === 'it' ? it : lang === 'en' ? en : pt; }

  function addr(t) {
    var s = [];
    if (t['addr:street']) s.push(t['addr:street'] + (t['addr:housenumber'] ? ', ' + t['addr:housenumber'] : ''));
    else if (t['addr:place']) s.push(t['addr:place'] + (t['addr:housenumber'] ? ', ' + t['addr:housenumber'] : ''));
    else if (t['addr:full']) s.push(t['addr:full']);
    if (t['addr:unit']) s.push(t['addr:unit']);
    if (t['addr:suburb']) s.push(t['addr:suburb']);
    else if (t['addr:neighbourhood']) s.push(t['addr:neighbourhood']);
    if (t['addr:postcode']) s.push(t['addr:postcode']);
    return s.join(' · ');
  }

  function hav(a, b, c, d) {
    var R = 6371.0088, p1 = a * Math.PI / 180, p2 = c * Math.PI / 180;
    var dp = p2 - p1, dl = (d - b) * Math.PI / 180;
    var h = Math.sin(dp / 2) * Math.sin(dp / 2) + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) * Math.sin(dl / 2);
    return 2 * R * Math.asin(Math.sqrt(h));
  }

  function is24h(t) { return /^\s*24\s*\/\s*7\s*(\s|$)/.test(t.opening_hours || ''); }

  function cuisineTxt(c) {
    var partes = String(c).split(';'), limpas = [], i, p;
    for (i = 0; i < partes.length && limpas.length < 3; i++) {
      p = partes[i].replace(/_/g, ' ').replace(/^\s+|\s+$/g, '');
      if (p) limpas.push(p);
    }
    if (partes.length > 3) limpas.push('…');
    return limpas.join(', ');
  }

  /* Placar de completude: só conta dado real da ficha (nunca inventa posição). */
  function score(e) {
    var t = e.tags || {}, s = 0;
    if (t.phone || t['contact:phone']) s += 2;
    if (t.website || t['contact:website']) s += 2;
    if (t.opening_hours) s += 1;
    if (addr(t)) s += 1;
    if (t.email || t['contact:email']) s += 1;
    if (t.cuisine || t.stars || t.denomination || t.fee || t.rooms) s += 1;
    return s;
  }

  /* Metadados extras do POI rico (só o que a tag tem — sem tag, sem linha). */
  function meta(t, lang) {
    var met = [], ad = addr(t), v;
    if (ad) met.push(ad);
    if (t.phone || t['contact:phone']) met.push(L('tel', lang) + ' ' + (t.phone || t['contact:phone']));
    if (t.opening_hours) met.push(L('horario', lang) + ': ' + t.opening_hours);
    if (t.wheelchair === 'yes') met.push(L('acess', lang) + ': ' + L('acessSim', lang));
    else if (t.wheelchair === 'limited') met.push(L('acess', lang) + ': ' + L('acessParc', lang));
    else if (t.wheelchair === 'no') met.push(L('acess', lang) + ': ' + L('acessNao', lang));
    v = t.internet_access || '';
    if (v === 'wlan') met.push(L('net', lang) + ': ' + L('wifi', lang));
    else if (v === 'wired') met.push(L('net', lang) + ': ' + L('cabo', lang));
    else if (v === 'yes') met.push(L('net', lang) + ': ' + L('sim', lang));
    else if (v === 'no') met.push(L('net', lang) + ': ' + L('nao', lang));
    if (t.cuisine) met.push(L('cozinha', lang) + ': ' + cuisineTxt(t.cuisine));
    var diet = [];
    if (/^(yes|only)$/.test(t['diet:vegetarian'] || '')) diet.push('🥗 ' + L('vegetariano', lang));
    if (/^(yes|only)$/.test(t['diet:vegan'] || '')) diet.push('🌱 ' + L('vegano', lang));
    if (/^(yes|only)$/.test(t['diet:halal'] || '')) diet.push(L('halal', lang));
    if (/^(yes|only)$/.test(t['diet:kosher'] || '')) diet.push(L('kosher', lang));
    if (/^(yes|only)$/.test(t['diet:gluten_free'] || '')) diet.push(L('semGluten', lang));
    if (diet.length) met.push(diet.join(' · '));
    if (t.stars && /^[1-7]$/.test(t.stars)) {
      var st = '', i;
      for (i = 0; i < parseInt(t.stars, 10); i++) st += '★';
      met.push(st + ' (' + t.stars + ' ' + L('estrelas', lang) + ')');
    }
    if (t.denomination) met.push(L('denom', lang) + ': ' + String(t.denomination).slice(0, 40));
    if (t.dispensing === 'yes') met.push('💊 ' + L('manip', lang));
    var serv = [];
    if (t.takeaway === 'yes' || t.takeaway === 'only') serv.push('🥡 ' + L('viagem', lang));
    if (t.delivery === 'yes' || t.delivery === 'only') serv.push('🛵 ' + L('entrega', lang));
    if (t.drive_through === 'yes') serv.push('🚗 ' + L('drive', lang));
    if (t.outdoor_seating === 'yes') serv.push('☀️ ' + L('arLivre', lang));
    if (serv.length) met.push(serv.join(' · '));
    if (t.fee === 'yes') met.push('🎟️ ' + L('pago', lang));
    else if (t.fee === 'no') met.push('🆓 ' + L('gratis', lang));
    if (t.rooms && /^\d{1,4}$/.test(t.rooms)) met.push('🛏️ ' + t.rooms + ' ' + L('quartos', lang));
    return met;
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

  function monta(div, cat, els, total, cl, lang, origin, r, deCache, estado) {
    div.innerHTML = '';
    var C = byKey(cat);
    var rot = (C && C.l[lang]) || (C && C.l.en) || cat;
    var vistos = {}, lista = [];
    (els || []).forEach(function (e) {
      var t = e.tags || {};
      if (!t.name) return;
      if (vistos[e.type + '/' + e.id]) return;
      vistos[e.type + '/' + e.id] = 1;
      var k = t.name + '|' + (t['addr:street'] || t['addr:housenumber'] || '');
      if (vistos[k]) return;
      vistos[k] = 1;
      var la = e.center ? e.center.lat : e.lat, lo = e.center ? e.center.lon : e.lon;
      e.__d = (origin && la != null) ? hav(origin[0], origin[1], la, lo) : null;
      e.__s = score(e);
      lista.push(e);
    });

    /* auditoria de cobertura (sobre os itens com nome, antes do filtro) */
    var nTel = 0, nSite = 0, nHor = 0, i;
    for (i = 0; i < lista.length; i++) {
      var tg = lista[i].tags || {};
      if (tg.phone || tg['contact:phone']) nTel++;
      if (tg.website || tg['contact:website']) nSite++;
      if (tg.opening_hours) nHor++;
    }

    /* chips de sub-filtro */
    var filtros = FILTROS[cat] || [];
    var fAtivo = (estado && estado.f) || 'todos';
    var chips = null;
    if (filtros.length) {
      chips = el('p', { style: 'margin:0 0 7px;display:flex;flex-wrap:wrap;gap:5px' });
      var todos = [{ id: 'todos', l: STR.todos, test: null }].concat(filtros);
      for (i = 0; i < todos.length; i++) (function (f) {
        var on = fAtivo === f.id, b = el('button', {
          type: 'button', 'data-chip': f.id,
          style: 'border:1px solid ' + (on ? '#a78bfa' : '#334155') + ';background:' + (on ? '#1e1b4b' : '#0f172a') +
            ';color:' + (on ? '#ddd6fe' : '#cbd5e1') + ';border-radius:999px;padding:3px 10px;cursor:pointer;font-size:.8rem'
        }, (f.l[lang] || f.l.en));
        b.addEventListener('click', function () {
          if (estado) { estado.f = f.id; estado.rerender(); }
        });
        chips.appendChild(b);
      })(todos[i]);
    }
    var visivel = lista;
    if (fAtivo !== 'todos') {
      for (i = 0; i < filtros.length; i++) {
        if (filtros[i].id === fAtivo && filtros[i].test) {
          visivel = lista.filter(function (e) {
            try { return !!filtros[i].test(e.tags || {}); } catch (err) { return false; }
          });
          break;
        }
      }
    }

    /* ordenação */
    var ordem = (estado && estado.o) || 'dist';
    if (ordem === 'ficha') {
      visivel.sort(function (a, b) {
        if (b.__s !== a.__s) return b.__s - a.__s;
        return (a.__d == null ? 9e9 : a.__d) - (b.__d == null ? 9e9 : b.__d);
      });
    } else if (origin) {
      visivel.sort(function (a, b) { return (a.__d == null ? 9e9 : a.__d) - (b.__d == null ? 9e9 : b.__d); });
    }
    var max = (C && C.max) || 40;
    var cut = visivel.slice(0, max);
    var km = Math.round(r / 100) / 10;
    var cab = el('p', { style: 'margin:0 0 6px;font-size:.85rem;color:#94a3b8' });
    cab.textContent = rot + ': ' + total + txt(lang, ' cadastrados no OpenStreetMap num raio de ' + km + ' km',
      ' référencés sur OpenStreetMap dans un rayon de ' + km + ' km', ' presenti su OpenStreetMap entro ' + km + ' km',
      ' mapped in OpenStreetMap within ' + km + ' km')
      + (cut.length ? ' · ' + txt(lang, 'aqui, ' + cut.length + ' com nome', ', dont ' + cut.length + ' nommés',
          ', di cui ' + cut.length + ' con nome', ', ' + cut.length + ' named') : '')
      + (els && els.length >= LIMITE ? ' · ' + txt(lang,
          'a lista para em ' + LIMITE + ' — há mais no mapa',
          'la liste s’arrête à ' + LIMITE + ' — il y en a plus sur la carte',
          'la lista si ferma a ' + LIMITE + ' — ce ne sono altri sulla mappa',
          'the list stops at ' + LIMITE + ' — there is more on the map') : '')
      + ' · ' + nTel + ' ' + L('comTel', lang) + ' · ' + nSite + ' ' + L('comSite', lang) + ' · ' + nHor + ' ' + L('comHor', lang)
      + ' · ' + (origin ? txt(lang, 'ordenados a partir de você', 'triés depuis vous', 'ordinati da te', 'sorted from you')
                        : txt(lang, 'a partir do centro', 'depuis le centre', 'dal centro', 'from the centre'))
      + (deCache ? ' · ' + txt(lang, 'dados dos últimos 6 h no seu navegador', 'données de moins de 6 h dans votre navigateur',
                               'dati delle ultime 6 h nel tuo browser', 'data from the last 6 h in your browser') : '');
    div.appendChild(cab);
    if (chips) div.appendChild(chips);

    /* toggle de ordenação */
    if (cut.length > 1) {
      var ord = el('p', { style: 'margin:0 0 7px;font-size:.8rem;color:#94a3b8' });
      ord.appendChild(document.createTextNode(L('ordenar', lang) + ' '));
      var b1 = el('button', { type: 'button', 'data-ord': 'dist',
        style: 'border:1px solid ' + (ordem === 'dist' ? '#a78bfa' : '#334155') + ';background:#0f172a;color:#cbd5e1;border-radius:999px;padding:2px 10px;cursor:pointer;font-size:.8rem' },
        L('ordDist', lang));
      var b2 = el('button', { type: 'button', 'data-ord': 'ficha',
        style: 'border:1px solid ' + (ordem === 'ficha' ? '#a78bfa' : '#334155') + ';background:#0f172a;color:#cbd5e1;border-radius:999px;padding:2px 10px;cursor:pointer;font-size:.8rem;margin-left:5px' },
        L('ordFicha', lang));
      b1.addEventListener('click', function () { if (estado) { estado.o = 'dist'; estado.rerender(); } });
      b2.addEventListener('click', function () { if (estado) { estado.o = 'ficha'; estado.rerender(); } });
      ord.appendChild(b1);
      ord.appendChild(b2);
      div.appendChild(ord);
    }

    if (!cut.length) {
      div.appendChild(el('p', { style: 'margin:0;font-size:.9rem' },
        L(fAtivo === 'todos' ? 'vazio' : 'vazioFiltro', lang)));
      return;
    }
    var ul = el('ul', { style: 'list-style:none;margin:0;padding:0' });
    cut.forEach(function (e) {
      var t = e.tags || {};
      var la = e.center ? e.center.lat : e.lat, lo = e.center ? e.center.lon : e.lon;
      var li = el('li', { style: 'border-bottom:1px dotted #334155;padding:6px 0' });
      var siteweb = t.website || t['contact:website'] || '';
      if (siteweb.indexOf('http') === 0) {
        li.appendChild(el('a', { href: siteweb, target: '_blank', rel: 'noopener nofollow' }, t.name));
      } else {
        li.appendChild(el('strong', {}, t.name));
      }
      if (is24h(t)) li.appendChild(el('span', { style: 'color:#4ade80;font-size:.8rem;font-weight:bold' }, ' 🕐 ' + L('h24', lang)));
      var met = meta(t, lang);
      if (e.__d != null) met.push((e.__d < 1 ? Math.round(e.__d * 1000) + ' m' : (Math.round(e.__d * 10) / 10) + ' km'));
      if (met.length) li.appendChild(el('span', { style: 'color:#94a3b8;font-size:.85rem' }, ' — ' + met.join(' · ')));
      if (la != null && lo != null) {
        li.appendChild(document.createTextNode(' '));
        li.appendChild(el('a', { href: 'https://www.google.com/maps/dir/?api=1&destination=' + la + ',' + lo,
          target: '_blank', rel: 'noopener nofollow', style: 'font-size:.82rem' }, L('rota', lang)));
        li.appendChild(document.createTextNode(' · '));
        li.appendChild(el('a', { href: 'https://www.openstreetmap.org/' + e.type + '/' + e.id,
          target: '_blank', rel: 'noopener nofollow', style: 'font-size:.82rem' }, L('noMapa', lang)));
        if (t.phone || t['contact:phone']) {
          li.appendChild(document.createTextNode(' · '));
          li.appendChild(el('a', { href: 'tel:' + String(t.phone || t['contact:phone']).replace(/[^\d+]/g, ''),
            style: 'font-size:.82rem' }, L('ligar', lang)));
        }
      }
      var mail = t.email || t['contact:email'] || '';
      if (mail.indexOf('@') > 0 && mail.indexOf(' ') < 0) {
        li.appendChild(document.createTextNode(' · '));
        li.appendChild(el('a', { href: 'mailto:' + mail, style: 'font-size:.82rem' }, '✉️ ' + L('email', lang)));
      }
      ul.appendChild(li);
    });
    div.appendChild(ul);
    var rod = el('p', { style: 'margin:6px 0 0;font-size:.74rem;color:#94a3b8' });
    rod.appendChild(document.createTextNode('(c) OpenStreetMap (ODbL) · ' + L('aviso', lang) + ' · '));
    rod.appendChild(el('a', { href: 'https://overpass-turbo.eu/?Q=' + encodeURIComponent(q(cl[0], cl[1], cl[2], (C && C.q) || ['"amenity"="place_of_worship"'])) + '&lat=' + cl[0] + '&lon=' + cl[1] + '&zoom=13',
      target: '_blank', rel: 'noopener nofollow' }, L('explorar', lang)));
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
      var ultimo = null; /* {cat, els, total, deCache} para re-render sem refetch */
      var estados = {};  /* por aba: {f:'todos', o:'dist'} */
      function est(cat) {
        if (!estados[cat]) estados[cat] = { f: 'todos', o: 'dist', rerender: function () {
          if (ultimo && ultimo.cat === cat) monta(out, cat, ultimo.els, ultimo.total, [lat, lon, r], lang, origem, r, ultimo.deCache, estados[cat]);
        } };
        return estados[cat];
      }
      function carregar(cat, botao) {
        var C = byKey(cat);
        if (!C) return;
        Array.prototype.forEach.call(tabs, function (b) {
          b.setAttribute('aria-pressed', b === botao ? 'true' : 'false');
          if (b.style) b.style.borderColor = b === botao ? '#a78bfa' : '#334155';
        });
        var key = CACHE_PFX + lat.toFixed(3) + ',' + lon.toFixed(3) + ':' + cat + ':' + r;
        var hit = null;
        try { hit = JSON.parse(localStorage.getItem(key) || 'null'); } catch (e) { hit = null; }
        if (hit && hit.t > Date.now() - TTL) {
          ultimo = { cat: cat, els: hit.e, total: hit.n || (hit.e || []).length, deCache: true };
          monta(out, cat, hit.e, ultimo.total, [lat, lon, r], lang, origem, r, true, est(cat));
          return;
        }
        out.innerHTML = '';
        out.appendChild(el('p', { style: 'margin:0;font-size:.88rem;color:#94a3b8' }, L('consultando', lang)));
        buscar(C.q || ['"amenity"=' + cat], lat, lon, r, function (err, total, els) {
          if (err) {
            out.innerHTML = '';
            var p = el('p', { style: 'margin:0;font-size:.88rem' });
            p.appendChild(document.createTextNode(L('semResposta', lang)));
            p.appendChild(el('a', { href: 'https://www.openstreetmap.org/search?query=' + encodeURIComponent(cat + ' ' + city),
              target: '_blank', rel: 'noopener nofollow' }, L('buscarOsm', lang)));
            out.appendChild(p);
            return;
          }
          var slim = els.map(function (e) {
            return { id: e.id, type: e.type, tags: e.tags, center: e.center ? { lat: e.center.lat, lon: e.center.lon } : null, lat: e.lat, lon: e.lon };
          });
          try { localStorage.setItem(key, JSON.stringify({ t: Date.now(), e: slim, n: total })); } catch (e) {}
          ultimo = { cat: cat, els: slim, total: total, deCache: false };
          monta(out, cat, slim, total, [lat, lon, r], lang, origem, r, false, est(cat));
        });
      }
      Array.prototype.forEach.call(tabs, function (b) {
        b.addEventListener('click', function () { carregar(b.getAttribute('data-cat'), b); });
      });
      var first = tabs[0];
      if (first) carregar(first.getAttribute('data-cat'), first);
      if (navigator.geolocation) {
        var gb = el('button', { type: 'button', style: 'border:1px solid #334155;background:#0f172a;color:#a78bfa;border-radius:999px;padding:4px 11px;margin:6px 0 0;cursor:pointer;font-size:.84rem' },
          txt(lang, 'usar minha localização', 'utiliser ma position', 'usa la mia posizione', 'use my location'));
        gb.addEventListener('click', function () {
          navigator.geolocation.getCurrentPosition(function (pos) {
            origem = [pos.coords.latitude, pos.coords.longitude];
            gb.textContent = txt(lang, 'a partir de você', 'depuis vous', 'da te', 'from you');
            var act = box.querySelector('.p7tab[aria-pressed="true"]');
            if (act) carregar(act.getAttribute('data-cat'), act);
          }, function () { gb.textContent = txt(lang, 'sem permissão de localização', 'sans autorisation de localisation', 'senza permesso', 'no location permission'); });
        });
        box.appendChild(gb);
      }
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();

