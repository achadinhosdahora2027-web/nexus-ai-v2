#!/usr/bin/env python3
"""Categorias do painel de serviços (fonte única: usado pelo gerador e pelo js gerado).

Seletor = sintaxe Overpass (OSM). `raio` é o raio em metros usado quando a cidade não tem área
no Wikidata. `max` limita a lista exibida (o resto fica no mapa).
"""

CATS = [
    # chave, rótulos, filtro Overpass, máx. exibido
    ('hospital', 'Hospital e prontos-socorros|Hospitals|Hôpitaux|Ospedali',
     '"amenity"~"^(hospital|clinic|centre|doctors|urgent_care|trauma_centre|health_centre)$"|"healthcare"~"^(hospital|clinic|doctor|emergency)$"', 45),
    ('farmacia', 'Farmácias|Pharmacies|Pharmacies|Farmacie',
     '"amenity"~"^(pharmacy|drugstore)$"|"healthcare"="pharmacy"', 60),
    ('clinica', 'Clínicas, dentistas, exames|Clinics and labs|Cliniques et labos|Cliniche e laboratori',
     '"amenity"~"^(dentist|clinic|doctors|nurse|midwife|therapist|laboratory)$"|"healthcare"~"^(dentist|laboratory|physiotherapist|psychotherapist|optometrist|audiologist|sample_collection|veterinary)$"', 45),
    ('vet', 'Pets: veterinário e pet shop|Pets and vets|Animaux|Animali',
     '"shop"~"^(pet|pet_grooming)$"|"amenity"~"^(veterinary|animal_boarding|animal_shelter)$"|"leisure"="dog_park"', 30),
    ('emergencia', 'Emergência: polícia e bombeiros|Police and fire|Police et pompiers|Polizia e vigili del fuoco',
     '"amenity"~"^(police|fire_station|ambulance_station|rescue_station|courthouse|prison|social_facility)$"|"emergency"~"^(police|fire|ambulance|extinguisher|assembly_point|siren|defibrillator|emergency_ward_entrance)$"', 40),
    ('banco', 'Bancos, caixas 24 h e câmbio|Banks, ATMs and exchange|Banques, GAB et change|Banche e ATM',
     '"amenity"~"^(bank|atm|bureau_de_change|money_transfer|payment_terminal|money_lender)$"|"office"~"^(bank|financial)$"', 50),
    ('mercado', 'Supermercados e feiras|Groceries and markets|Supermarchés et marchés|Supermercati e mercati',
     '"shop"~"^(supermarket|convenience|greengrocer|butcher|deli|organic|chemist)$"|"amenity"="marketplace"', 50),
    ('shopping', 'Shoppings e lojas|Malls and shops|Centres commerciaux|Centri commerciali',
     '"shop"~"^(mall|department_store|clothes|shoes|electronics|mobile_phone|computer|furniture|interior_decoration|home_goods|hardware|doityourself|beauty|perfumery|cosmetics|toys|gift|sports|jewelry|books|music|variety_store|second_hand|outdoor|bag|wallet)$"|"leisure"="shopping_centre"', 55),
    ('comida', 'Onde comer: tudo|Where to eat|Où manger|Dove mangiare',
     '"amenity"~"^(restaurant|cafe|fast_food|food_court|bakery|ice_cream|deli|juice_bar|pub|bar|biergarten|nightclub|marketplace|drinking_water|vending_machine|bistro)$"|"cuisine"~".."', 70),
    ('noite', 'Vida noturna|Nightlife|Vie nocturne|Vita notturna',
     '"amenity"~"^(bar|pub|nightclub|casino|music_venue|events_venue|social_club|biergarten|swingerclub)$"|"leisure"~"^(dance|bowling_alley|club)$"|"shop"~"^(alcohol|beverages)$"|"craft"~"^(brewery|winery)$"', 45),
    ('hoteis', 'Onde dormir|Where to stay|Où dormir|Dove dormire',
     '"tourism"~"^(hotel|guest_house|hostel|motel|apartment|chalet|cabin|camp_site|caravan_site|bed_and_breakfast|self_catering|resort|alpine_hut|wilderness_hut|picnic_site)$"|"lodging"="yes"', 50),
    ('transporte', 'Metrô, trem, ônibus e pontos|Transit and stops|Transports et arrêts|Trasporti e fermate',
     '"railway"~"^(station|halt|tram_stop|light_rail|subway_entrance|funicular|monorail)$"|"station"~".."|"amenity"~"^(bus_station|bus_stop|ferry_terminal|taxi|bike_rental|car_sharing|transport_access|shuttle)$"|"public_transport"~"^(station|platform)$"|"highway"="bus_way"', 70),
    ('aeroporto', 'Aeroportos e helipontos|Airports|Aéroports|Aeroporti',
     '"aeroway"~"^(aerodrome|helipad|helistop)$"|"public_transport"="aerodrome"', 15),
    ('carro', 'Postos, recarga, oficinas, estacionamento|Fuel, charging, repair, parking|Carburant, bornes, parking|Carburante e parcheggi',
     '"amenity"~"^(fuel|charging_station|parking|car_wash|car_repair|car_parts|vehicle_inspection|drive_through|car_rental|ev_rental)$"|"shop"~"^(car_repair|car_parts|tyres|motorcycle_repair|motorcycle_tyres|auto_repair)$"|"highway"="services"', 55),
    ('cultura', 'Museus, teatros, cinemas e galerias|Museums and theatres|Musées et théâtres|Musei e teatri',
     '"tourism"~"^(museum|gallery|artwork|attractions|viewpoint)$"|"amenity"~"^(theatre|cinema|arts_centre|planetarium|community_centre|library|nightclub)$"|"leisure"~"^(theatre|dance|studio|escape_game)$"', 55),
    ('religiao', 'Igrejas, templos, mesquitas|Places of worship|Lieux de culte|Luoghi di culto',
     '"amenity"~"^(place_of_worship|monastery|convent|religious|place_of_worship_old)$"|"religion"~".."|"tourism"~"^(shrine|pilgrimage)$"', 45),
    ('ar_livre', 'Parques, praias, trilhas e mirantes|Parks, beaches and views|Parcs, plages et points de vue|Parchi e spiagge',
     '"leisure"~"^(park|garden|nature_reserve|beach_resort|slipway|fishing|bird_hide|dog_park|pitch|playground|recreation_ground|sports_centre|swimming_pool|stadium|water_park|amusement_arcade|marina|trail|sports_hall)$"|"natural"~"^(beach|peak|spring|cave_entrance|water|beach)$"|"tourism"~"^(zoo|aquarium|theme_park|wildlife_park|picnic_site)$"|"highway"~"^(path|pedestrian)$"', 65),
    ('esporte', 'Estádios, academias e quadras|Stadiums and gyms|Stades et salles|Stadi e palestre',
     '"leisure"~"^(stadium|sports_centre|pitch|swimming_pool|tennis|gym|fitness_centre|sports_hall|horse_racing|track_cycling|ice_rink|bowling_alley|climbing|water_sports|multiUse)$"|"sport"~".."', 50),
    ('educacao', 'Escolas, creches, universidades e bibliotecas|Schools and universities|Écoles et universités|Scuole e università',
     '"amenity"~"^(school|kindergarten|college|university|language_school|music_school|library|student_accommodation|research_institute)$"|"amenity"="childcare"', 60),
    ('crianca', 'Para crianças|For children|Pour les enfants|Per bambini',
     '"leisure"~"^(playground|water_playground|amusement_arcade|trampoline_park|kids_club|swimming_pool|sports_centre)$"|"tourism"~"^(zoo|aquarium|theme_park|museum|artwork)$"|"amenity"~"^(childcare|kindergarten|ice_cream|fast_food|restaurant|cafe|theatre|cinema|library|marketplace)$"', 45),
    ('servicos', 'Prefeitura, correios e órgãos públicos|City hall and public offices|Mairie et postes|Municipio e poste',
     '"amenity"~"^(townhall|post_office|post_box|government|courthouse|register_office|embassy|social_facility|community_centre|waste_basket|recycling|drinking_water|toilets|bench|atm|drinking_water)$"|"office"~"^(government|agency|association|tax_advisor|notary|employment_agency|advertising|union|political_party|ngo)$"', 50),
    ('empresas', 'Empresas, coworkings e profissionais|Companies and coworking|Entreprises et coworking|Aziende e coworking',
     '"office"~"^(company|association|coworking|estate_agent|lawyer|accountant|it|architect|engineer|surveyor|insurance|travel_agent|consulting|seo)$"|"amenity"="coworking_space"|"craft"~"^(electrician|plumber|carpenter|mason|roofer|glazier|tiler|painter|joiner|blacksmith|sawmill|photographer|gardener|handicraft|key_cutter|locksmith|shoemaker|upholsterer)$"|"shop"~"^(insurance|travel_agency|copyshop|printshop|laundry|dry_cleaning|tailor|tailor)$"', 55),
    ('moradia', 'Imobiliárias e moradia|Real estate|Immobilier|Immobiliare',
     '"office"~"^(estate_agent|rental|letting|property_management)$"|"shop"~"^(estate_agent|real_estate)$"|"amenity"~"^(retirement_home|assisted_living|social_facility)$"', 30),
    ('acessivel', 'Acessibilidade (cadeirantes e libras)|Accessibility|Accessibilité|Accessibilità',
     '["wheelchair"~"^(yes|limited)$"]["amenity"!~"^$"]', 45),
    ('digital', 'Internet, telefonia e SIM|Internet and mobile|Internet et mobile|Internet e telefonia',
     '"shop"~"^(mobile_phone|electronics|computer|variety_store|telecommunication|repair)$"|"amenity"~"^(internet_cafe|public_wifi)$"|"internet_access"~"^(wlan|yes|wired)$"', 40),
    ('utilidades', 'Água, luz, gás, coleta e reciclagem|Utilities and recycling|Services publics|Utenze e raccolta',
     '"amenity"~"^(recycling|waste_basket|water_point|drinking_water|toilets|bench|shower|toilets)$"|"man_made"~"^(water_tap|water_well|pipeline|storage_tank|supply)$"|"shop"~"^(gas|hardware|doityourself|electronics)$"|"office"~"^(utility|energy|water_utility)$"', 40),
]


def conds(sel):
    """Separa a string de filtro em condições independentes, respeitando as aspas: o '|' que
    aparece dentro de uma regex (``^(pharmacy|drugstore)$``) faz parte do padrão, o de fora é
    separador de condições. Overpass não aceita OR dentro de um mesmo colchete — cada condição
    vira uma afirmação própria dentro da união ``( …; …; )``."""
    out, atual, dentro, prof = [], '', False, 0
    for ch in sel:
        if ch == '"':
            dentro = not dentro
            atual += ch
        elif ch == '[' and not dentro:
            prof += 1
            atual += ch
        elif ch == ']' and not dentro:
            prof -= 1
            atual += ch
        elif ch == '|' and not dentro and prof <= 0:
            if atual.strip():
                out.append(atual.strip())
            atual = ''
        else:
            atual += ch
    if atual.strip():
        out.append(atual.strip())
    return [x for x in out if x.startswith('"') or x.startswith('[')]


def as_list():
    out = []
    for key, labels, sel, mx in CATS:
        a, b, c, d = [x.strip() for x in labels.split('|')]
        out.append({'k': key, 'sel': sel, 'q': conds(sel), 'max': mx,
                    'l': {'pt': a, 'en': b, 'fr': c, 'it': d}})
    return out


if __name__ == '__main__':
    for c in as_list():
        print(f"{c['k']:14s} max={c['max']:3d} {c['l']['pt']:38s} {c['sel'][:52]}")
