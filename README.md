# Agenda

## Lokaal starten

Vereist Node.js 24. Voer `npm ci` en `npm run dev` uit en open http://localhost:3000.
De agenda opent op de actuele datum. Bestaande browsergegevens blijven beschikbaar.
Met `npm test` controleer je de kalender- en synchronisatielogica. `npm run build` voert deze tests uit en maakt de productiebuild.

## Supabase en Vercel

1. Maak een Supabase-project aan en pas de SQL-migraties onder `supabase/migrations` in volgorde toe, gevolgd door `supabase/workspace-sync.sql`.
2. Kopieer `.env.example` naar `.env.local` en vul de URL, publishable key en server-side secret key in. Zet dezelfde variabelen in Vercel.
3. Stel de Site URL en toegestane omleidings-URL's voor de e-mailinloglink in Supabase in. Gebruik het domein van de app en voor lokale tests http://localhost:3000.
4. Open **Instellingen** om met een e-maillink in te loggen. Gebruik op elk apparaat hetzelfde e-mailadres en hetzelfde app-domein. Kies eenmalig **Lokale agenda toevoegen** om bestaande browserafspraken en taken naar je account over te nemen. Je kunt ook JSON-back-ups downloaden en importeren.
5. De app slaat wijzigingen lokaal direct op en synchroniseert ze automatisch na ongeveer een seconde. Open apparaten controleren elke 15 seconden en bij terugkeren naar de app op wijzigingen. De opslagstatus staat boven de agenda. Bij verbindingsverlies blijven wijzigingen lokaal bewaard en wordt synchronisatie opnieuw geprobeerd zodra de verbinding terugkomt. Conflicterende wijzigingen aan hetzelfde gegeven vragen een keuze. Verschillende afspraken en velden worden samengevoegd met versiecontrole in de database.
6. Open **Beschikbaarheid** om een openbare link te maken, te kopiëren of in te trekken. De link bevat een momentopname van de berekende vrije tijden.

## Afbakening eerste versie

- Afspraken, taken, agendakleuren en weergavevoorkeuren worden lokaal opgeslagen en na inloggen automatisch met Supabase gesynchroniseerd. Row Level Security beperkt elke gebruiker tot diens eigen werkruimte. Lokale gegevens worden per account gescheiden bewaard.
- Magister kan afzonderlijke lessen uit een ICS-bestand of via een publiek bereikbare HTTPS- of webcal-feed importeren. Herhalingen, meerdaagse afspraken en automatische synchronisatie zijn nog niet geïmplementeerd.
- Google, Outlook en iCloud worden als ongeconfigureerde providers weergegeven. De app heeft geen actieve koppeling met deze diensten.

Zonder Supabase kun je op localhost of 127.0.0.1 direct een lokale agendalink aanmaken. De app bewaart de momentopname in de genegeerde map .agenda-local. Open de link op dezelfde computer terwijl de agenda-app draait. Gebruik dezelfde host en poort als bij het aanmaken.

## Afspraakvoorstellen

Pas alle SQL-migraties toe en vul de Supabase-variabelen in. Maak daarna met het eerste account een nieuwe agendalink aan. Open die link als tweede account in een ander browserprofiel. Klik op een vrije tijd om een voorstel te sturen. Accepteer of wijs het voorstel af via Meldingen bij het eerste account. Geaccepteerde voorstellen verschijnen als gedeelde afspraken bij beide accounts op Home.

Zonder Supabase werken afspraakvoorstellen op dezelfde computer via twee aparte browserprofielen. Maak in het eerste profiel een nieuwe agendalink aan, open die in het tweede profiel en vul bij het voorstellen je naam in. Het eerste profiel ontvangt het voorstel bij Meldingen. Eerder aangemaakte lokale links blijven leesbaar. Maak voor voorstellen een nieuwe link aan. De app controleert bij het accepteren de geopende eigenaarsagenda, bestaande geaccepteerde voorstellen en de opgeslagen Supabase-back-ups. Lokale wijzigingen in andere browsers worden pas meegenomen wanneer ze als back-up zijn opgeslagen of bij het accepteren in de geopende agenda staan.

## Vrienden lokaal testen

Open de agenda in twee gescheiden browserprofielen op dezelfde computer. Maak in Vrienden een uitnodiging, kopieer de link en accepteer die in het tweede profiel. Kies in beide profielen welke agenda’s meetellen en druk op Delen starten. Samen vrij toont tijdsblokken van minstens 30 minuten tussen 08:00 en 22:00. Vanuit zo'n blok kun je een voorstel versturen en via het belletje accepteren.

Delen staat na het toevoegen voor beide profielen uit. Per vriend worden alleen bezette tijdsblokken voor de komende 35 dagen opgeslagen. Deze vriendenfunctie gebruikt de lokale server en is nog niet beschikbaar in Supabase-modus.
