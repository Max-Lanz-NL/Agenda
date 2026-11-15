# Agenda

## Lokaal starten

Vereist Node.js 24. Voer `npm ci` en `npm run dev` uit en open http://localhost:3000.
De lokale demo opent in de referentieweek van januari 2025. Gebruik **Vandaag** voor de actuele datum.
Met `npm test` controleer je de kalenderlogica en met `npm run build` de productiebuild.

## Supabase en Vercel

1. Maak een Supabase-project aan en pas de SQL-migratie onder `supabase/migrations` toe.
2. Kopieer `.env.example` naar `.env.local` en vul de URL, publishable key en server-side secret key in. Zet dezelfde variabelen in Vercel.
3. Stel de Site URL en toegestane omleidings-URL's voor de e-mailinloglink in Supabase in. Gebruik het domein van de app en voor lokale tests http://localhost:3000.
4. Open **Instellingen** voor inloggen, een back-up maken of een back-up terugzetten. Open **Beschikbaarheid** om een openbare link te maken, te kopiëren of in te trekken. De link bevat een momentopname van de berekende vrije tijden.

## Afbakening eerste versie

- Afspraken, taken, agendakleuren en weergavevoorkeuren worden lokaal opgeslagen. Supabase ondersteunt handmatige back-up en herstel met toegangsbeleid per eigenaar.
- Magister kan afzonderlijke lessen uit een ICS-bestand of via een publiek bereikbare HTTPS- of webcal-feed importeren. Herhalingen, meerdaagse afspraken en automatische synchronisatie zijn nog niet geïmplementeerd.
- Google, Outlook en iCloud worden als ongeconfigureerde providers weergegeven. De app heeft geen actieve koppeling met deze diensten.

Zonder Supabase kun je op localhost of 127.0.0.1 direct een lokale agendalink aanmaken. De app bewaart de momentopname in de genegeerde map .agenda-local. Open de link op dezelfde computer terwijl de agenda-app draait. Gebruik dezelfde host en poort als bij het aanmaken.

## Afspraakvoorstellen

Pas beide SQL-migraties toe en vul de Supabase-variabelen in. Maak daarna met het eerste account een nieuwe agendalink aan. Open die link als tweede account in een ander browserprofiel. Klik op een vrije tijd om een voorstel te sturen. Accepteer of wijs het voorstel af via Meldingen bij het eerste account. Geaccepteerde voorstellen verschijnen als gedeelde afspraken bij beide accounts op Home.

Zonder Supabase werken afspraakvoorstellen op dezelfde computer via twee aparte browserprofielen. Maak in het eerste profiel een nieuwe agendalink aan, open die in het tweede profiel en vul bij het voorstellen je naam in. Het eerste profiel ontvangt het voorstel bij Meldingen. Eerder aangemaakte lokale links blijven leesbaar. Maak voor voorstellen een nieuwe link aan. De app controleert bij het accepteren de geopende eigenaarsagenda, bestaande geaccepteerde voorstellen en de opgeslagen Supabase-back-ups. Lokale wijzigingen in andere browsers worden pas meegenomen wanneer ze als back-up zijn opgeslagen of bij het accepteren in de geopende agenda staan.
