# Perdavimas: kur sustojome

## 0 etapas: pagrindas iš OrderFlow (2026-10-22)
Saugykla sukurta iš `bergenkip/Orderflow` `main` (commit a825e09). Paimta:
registracija ir prisijungimas, antras prisijungimo žingsnis el. paštu (savininkams ir administratoriams),
įmonės sukūrimas su org. nr., komanda, kvietimų nuorodos, rolės, nustatymai (kalba), 3 kalbos (nb / en / lt),
dizainas (mobile-first, safe-area), RLS ir jų testai (pgTAP), Playwright testai su nuotraukomis, CI ir
migracijų diegimas (`db-deploy.yml`).

Pašalinta (OrderFlow specifika): prekių katalogas, pirkėjai, pirkėjų kainos, jų migracijos, testai ir pavyzdžiai.

**Reikia Li (prieš pirmą Vercel peržiūrą ir migracijų diegimą):**
1. Naujas Supabase projektas ES regione.
2. Naujas Vercel projektas, sujungtas su `bergenkip/Maskinflyt`.
3. Raktai tik į Vercel / GitHub „Secrets“ (tie patys pavadinimai kaip OrderFlow), ne į pokalbį.

## 1 etapas: rolės (2026-10-27)
Migracija `20261027090000_maskinflyt_roles.sql` pervadina OrderFlow roles:
`operator` → `dispatcher` (dispečeris), `viewer` → `driver` (vairuotojas). `owner` ir `admin` lieka.
Esamos narystės ir kvietimai išlieka. Nauja narystė be rolės = `driver` (mažiausia prieiga).
Teisės kol kas tos pačios: žmones valdo savininkas ir administratorius (su antru žingsniu el. paštu),
dispečeris ir vairuotojas komandą tik mato. Dispečerio ir vairuotojo skirtumas atsiras su darbais
(dispečeris planuoja, vairuotojas mato tik savo darbus). Testas: `09_maskinflyt_roles.test.sql`.

## 2 etapas: technikos sąrašas (2026-10-27)
Migracija `20261027110000_vehicles.sql`: lentelė `vehicles` (tipas, pavadinimas, valst. nr., krano galia tm,
keliamoji galia kg, valandinis įkainis øre, minimalus apmokestinamas laikas minutėmis, `active`).
Tipai: `crane_truck`, `crane_truck_grab`, `tipper`, `excavator`, `wheel_loader` ir `other` (Kita): tada įmonė įrašo savo tipą (`type_name`, iki 60 simbolių).
Valst. nr. saugomas didžiosiomis be tarpų (`AB12345`), unikalus vienoje įmonėje, nebūtinas (mašinos be numerių).
Teisės (RLS): pridėti ir keisti gali savininkas ir administratorius (su antru žingsniu), dispečeris tik mato,
vairuotojas nemato. Trinti negalima, tik išjungti (`active = false`), kad liktų darbų ir sąskaitų istorija.
Puslapiai: `/app/vehicles` (sąrašas ir pridėjimas), `/app/vehicles/[id]` (keitimas, išjungimas).
Apžvalgoje: technikos kortelė ir žingsnis „Pridėkite savo techniką“.
Testai: `11_vehicles.test.sql` (pgTAP), `src/lib/vehicles.test.ts`, `e2e/vehicles.spec.ts`.

## 3 etapas: klientų registras (2026-10-29)
Migracija `20261029090000_customers.sql`:
- lentelė `customers`: tipas (`company` / `private`), pavadinimas, org. nr. (9 skaitmenys, tik įmonėms, unikalus įmonėje,
  MOD11 tikrina programa), kontaktinis asmuo, telefonas (`+4791234567` arba `91234567`), el. paštas, el. paštas sąskaitoms,
  adresas, pašto kodas (4 skaitmenys), miestas, pastaba, `active`, paieškos stulpelis `search` (mažosiomis raidėmis);
- lentelė `customer_rates`: kliento valandinis įkainis konkrečiai mašinai (øre). Nėra eilutės – galioja mašinos įprastas įkainis.
  Sudėtiniai išoriniai raktai neleidžia įkainio susieti su kitos įmonės klientu ar mašina.
Teisės (RLS): klientus pridėti ir keisti gali savininkas, administratorius (su antru žingsniu) ir dispečeris
(jis priima užsakymus telefonu). Įkainius keičia ir trina tik savininkas ir administratorius (su antru žingsniu),
dispečeris juos mato. Vairuotojas nemato nei klientų, nei įkainių. Klientų trinti negalima, tik išjungti.
Puslapiai: `/app/customers` (sąrašas, paieška), `/app/customers/new`, `/app/customers/[id]` (duomenys, įkainiai, būsena).
Apžvalgoje: klientų kortelė ir žingsnis „Pridėkite savo klientus“.
Testai: `12_customers.test.sql` (pgTAP), `src/lib/customers.test.ts`, `e2e/customers.spec.ts`.
Vėliau: importas iš Excel / Fiken / Tripletex, duomenys iš Brønnøysund pagal org. nr., užsakymų istorija.

## Slaptažodžio atkūrimas (2026-10-29)
`/forgot-password` siunčia nuorodą (`resetPasswordForEmail`; atsakymas vienodas, ar paskyra yra, ar ne).
Nuoroda per `/auth/callback?next=/reset-password` prijungia ir atidaro `/reset-password` (naujas slaptažodis, min. 10 simbolių).
Nuoroda veikia bet kurioje naršyklėje ar įrenginyje (implicit flow: žetonai URL fragmente, kaip antrojo žingsnio nuorodoje). Kiekviena nuoroda veikia vieną kartą. Prisijungimo formoje yra nuoroda „Pamiršote slaptažodį?“.
Registracijos patvirtinimo nuoroda taip pat veikia bet kurioje naršyklėje: `signUp` siunčiamas implicit flow, nuoroda veda į `/confirm`, kuris paima žetonus iš fragmento ir atidaro `/app`. Senos nuorodos (`/auth/callback?next=/app`) vis dar priimamos.
Testai: `e2e/password.spec.ts`.

## Kas pridėjo (2026-10-29)

Technika ir klientai turi `created_by` (migracija `20261029120000_added_by`). Jį užpildo pati duomenų bazė
(`default auth.uid()`), naršyklė jo negali nei nurodyti, nei pakeisti (testas `13_added_by`). Sąraše ir kortelėje
rodoma „Pridėjo Vardas Pavardė · data“. Vardai imami iš komandos sąrašo (`list_members`), todėl išėjęs žmogus
rodomas kaip „buvęs narys“. Anksčiau pridėti įrašai neturi autoriaus ir rodo tik datą.

## 4 etapas: užsakymai, 1 dalis (2026-10-29)

- Migracija `20261029130000_jobs`: lentelė `jobs` (klientas, adresas, kontaktas vietoje, pradžia ir pabaiga,
  technika, vairuotojas, aprašymas, būsena, kaina øre). Užsakymai neištrinami, tik atšaukiami.
- Duomenų bazė pati nustato: numerį įmonėje (1, 2, 3 …), valandinę kainą (kliento kaina šiai technikai, kitaip
  technikos įkainis; imama, kai išsaugoma technika ar klientas) ir būseną „new“ / „planned“ (suplanuotas, kai yra
  ir technika, ir vairuotojas). „done“ reikalauja technikos ir vairuotojo. Naršyklė negali nustatyti kainos ar numerio.
- RLS kaip klientams: owner, admin, dispatcher; owner ir admin su antruoju žingsniu. Vairuotojai užsakymų dar nemato.
- Vairuotojas turi būti įmonės narys (FK į `memberships`); išėjusio nario užsakymai lieka be vairuotojo.
- Laikas: įmonės laiko zona (`organizations.timezone`, Europe/Oslo), `src/lib/jobs.ts` (`fromLocalParts`,
  `toLocalParts`, testai su laiko keitimu). Užsakymas trunka ne ilgiau kaip vieną dieną.
- Persidengimas: jei ta pati technika ar vairuotojas tuo metu jau turi atvirą užsakymą, forma įspėja ir leidžia
  „Vis tiek išsaugoti“.
- Ekranai: `/app/jobs` (būsimi / ankstesni, sugrupuoti pagal dieną), `/app/jobs/new` (galima `?customer=`),
  `/app/jobs/[id]` (duomenys, kaina, būsena). Apžvalgoje kortelė „Būsimi užsakymai“.
- Meniu: telefone ir planšetėje (iki 1024 px) apatinė juosta su 5 punktais, nustatymai – krumpliaračio ikona viršuje.
  Kompiuteryje visas meniu viršuje, „Atsijungti“ – tik ikona.
- Testai: `14_jobs` (31 pgTAP), `src/lib/jobs.test.ts`, `e2e/jobs.spec.ts` (+ nuotraukos).

## Užsakymo forma: naujas klientas, trukmė, pagrindinė technika (2026-10-29)

Migracija `20261029150000_job_estimate_and_main_machine`, pgTAP `15_job_estimate_and_main_machine` (12 testų).
- **Naujas klientas** pasirenkamas sąraše („+ Naujas klientas“) ir išsaugomas kartu su užsakymu (tipas, pavadinimas, telefonas, el. paštas). Klientas įrašomas tik kai užsakymas teisingas ir be persidengimo įspėjimo; jei užsakymas vis tiek nepavyksta, forma lieka su jau sukurtu klientu (be dublikatų).
- **Laikas**: pradžia + apytikslė trukmė (valandos ir 0/15/30/45 min., nuo 15 min. iki 24 val.). `ends_at` = pradžia + trukmė (tikrom valandom, ir laikrodžio keitimo naktį). Prierašas „tai tik įvertis“ ir `jobs.time_note` (iki 200 simbolių). Sąraše pabaiga rodoma „~11:30“.
- **Pagrindinė technika**: `memberships.main_vehicle_id`, keičiama tik per `set_main_machine` (owner/admin su antru žingsniu, dispatcher). Komandos puslapyje kiekvienam žmogui. Formoje pasirinkus vairuotoją įrašoma jo pagrindinė technika, o jei jos nėra, dažniausiai vairuota (iš paskutinių 500 darbų). Galima pakeisti.
- Išskleidžiamiems sąrašams `key={defaultValue}`, nes React po veiksmo atstato formą (taip pat Komandos rolės sąraše).

## 4 etapas: užsakymai, 2 dalis – kalendorius (2026-10-29, perdarytas pagal Li pavyzdį)

`/app/jobs/calendar`, perjungiama iš Užsakymų („Sąrašas | Kalendorius“), nes apatinėje juostoje vietos 6-am punktui nėra.
- Adreso parametrai: `date` (YYYY-MM-DD), `view` (`month` – numatytas, `week`, `day`). Atšaukti užsakymai kalendoriuje nerodomi.
- **Mėnuo**: pilnos savaitės (pirmadienis–sekmadienis). Telefone prie dienos skaičiaus taškas ir užsakymų skaičius (įspėjimo ženklas, jei kuriam trūksta technikos ar vairuotojo); kompiuteryje pirmi 3 užsakymai ir „+N“. Diena atidaro dienos vaizdą.
- **Savaitė**: 7 dienų dėžutės (telefone viena po kitos, xl – 7 stulpeliai) su užsakymais, pieštuku ir „+“.
- **Diena**: eilutė kiekvienai technikai su vairuotojais (tos dienos ir tų, kurių pagrindinė technika ji yra), paskutinė eilutė „Be technikos“. Telefone – kortelės.
- **Tempimas** (`day-timeline.tsx`, kliento komponentas, pointer events): juosta – perkelia, dešinis kraštas – keičia trukmę, žingsnis 15 min. (`draggedSpan`). Išsaugo `moveJob` (tikrina, ar užsakymas atviras, ir tą patį persidengimą kaip forma; „Vis tiek išsaugoti“ / „Neperkelti“). Po perkėlimo – „Atšaukti“. Atlikti ir atšaukti nejuda. Bakstelėjimas be judesio atidaro užsakymą; pieštukas – taip pat (klaviatūros kelias).
- Kalendorius platesnis už kitus puslapius nuo `xl` (iki 88rem).
- Laisva vieta / „+“ atidaro `/app/jobs/new?date=&start=&vehicle=`. Parametrai tikrinami pagal sąrašus.
- Datų skaičiavimai `src/lib/calendar.ts` (Vitest). E2E `e2e/calendar.spec.ts` (tempimas pele), nuotraukos `calendar-month`, `calendar-week`, `calendar-day` faile `jobs.spec.ts`.

## 5 etapas: vairuotojo telefono vaizdas, 1 dalis (2026-10-29)

Migracija `20261029180000_driver_job_progress`, pgTAP `16_driver_job_progress` (25 testai).
- `/app/my-jobs` („Mano darbai“, meniu punktas vairuotojams; kiti mato kortelę Apžvalgoje, jei turi darbų šiandien): šiandienos ir rytojaus darbai bei pradėti ir nebaigti. Adresas su „Atidaryti žemėlapyje“ (Google Maps), „Skambinti“ (tel: iš kontakto vietoje), technika, aprašymas.
- Žingsniai dideliais mygtukais: Priimti → Važiuoju → Atvykau → (pertrauka) → Baigiau (klausia dar kartą). `record_job_step` (security definer): tik užsakymo vairuotojas, tik atviras užsakymas, tik iš eilės. „Baigiau“ pažymi užsakymą atliktu, jei yra technika.
- Kiekvienas paspaudimas ir pastaba įrašomi į `job_events` (niekada nekeičiami) – iš jų 2 dalyje bus skaičiuojamas darbo laikas. `jobs.progress`, `progress_at` – paskutinis žingsnis biurui.
- Vairuotojas `jobs` lentelės neskaito (joje kainos): jo darbai ateina per `my_jobs` be kainų. `job_events` skaito biuras ir užsakymo vairuotojas (`private.drives_job`).
- Biuras mato eigą užsakymų sąraše ir užsakymo puslapyje („Iš vairuotojo“).
- E2E `e2e/driver.spec.ts`, nuotraukos `my-jobs`, `my-jobs-arrived`.

## GPS sekimas (tyrimas 2026-10-29, ne teisinė išvada)
Norvegijoje sutikimas darbo santykiuose paprastai nėra tinkamas pagrindas; pagrindas – teisėtas interesas (parko valdymas), Arbeidsmiljøloven 9 sk. (dalykinė priežastis, proporcingumas, aptarimas su darbuotojais prieš įvedant), tikslo ribojimas. Mūsų planas: įmonė įjungia pati, tik tarp „Pakeliui“ ir „Baigiau“, ženklas „Vieta perduodama“, ištrinama po 30 d., mato tik dispečeris, DPA su klientu. Prieš paleidimą – teisininko patikra.

## 5 etapas: darbo laikas ir patvirtinimas, 2 dalis (2026-11-03)

Migracija `20261103090000_job_time`, pgTAP `17_job_time` (27 testai).
- Technikai: minimalus apmokestinamas laikas (buvo) ir **didesnis tarifas nuo valandos** (Li prašymas): `evening_from` + `evening_percent` (priedas %) arba `evening_rate` (kitas valandinis tarifas, øre). Taikomas nuo to laiko darbo pradžios dieną iki darbo pabaigos, ir po vidurnakčio.
- Darbo laikas iš paspaudimų (`private.driver_time`): nuo „Važiuoju“ (be jo – „Atvykau“) iki „Baigiau“, sveikomis minutėmis, atėmus pertraukas.
- Kaina skaičiuojama tik DB (`private.price_job_time`): pertraukos atimamos iš įprasto tarifo laiko pirmiausia; iki minimalaus laiko pridėtas laikas – įprastu tarifu; tarifai įrašomi patvirtinimo metu.
- `job_times`: kiekvienas patvirtinimas – nauja eilutė (istorija), naujausia galioja. Skaito tik biuras (vairuotojas kainų nemato). `job_time_draft` – juodraštis iš paspaudimų; `approve_job_time` – tik biuras (savininkai/administratoriai su antru žingsniu), tik atliktam užsakymui; priežastis privaloma, jei laikas skiriasi nuo paspaudimų arba jau buvo patvirtintas.
- Užsakymo puslapyje skiltis „Darbo laikas“ (patvirtinti, pataisyti, ankstesnės versijos); sąraše „Laikas laukia patvirtinimo“ / „Laikas patvirtintas“. Tik peržiūrai, jokių sąskaitų.
- E2E `e2e/job-time.spec.ts`, nuotraukos `job-time`, `vehicles-evening`.

## 5 etapas: nuotraukos ir kliento parašas, 3 dalis (2026-11-03)

Migracija `20261103110000_job_files`, pgTAP `18_job_files` (23 testai).
- Privatus Storage bucket `job-files` (JPEG/PNG, iki 2 MB): kelias `<organization_id>/<job_id>/<uuid>.jpg|png`. Storage politikos: įkelti ir matyti gali užsakymo vairuotojas ir biuras (`private.job_of_path`, `may_see_job_files`, `may_add_job_files`); atšauktam užsakymui – ne. Neįtrauktą į sąrašą failą įkėlėjas gali ištrinti (nepavykusio įrašymo atvejis).
- `job_files` sąrašas (nuotrauka arba parašas su kliento vardu, vienas parašas užsakymui, iki 30 nuotraukų); rašoma tik per `add_job_file`.
- Telefone nuotrauka sumažinama iki 1600 px JPEG prieš siunčiant; serveris tikrina failo baitus (JPEG/PNG), ne pavadinimą. Parašas pirštu ant drobės (canvas) + kliento vardas.
- Rodoma per 1 val. galiojančias pasirašytas nuorodas (`createSignedUrls`); viešos nuorodos neveikia (E2E tikrina).
- CI: `e2e-auth` dabar paleidžia ir Storage (`storage-api`); `database` darbui `scripts/db-test.sh` sukuria Storage lentelių kopiją (`supabase/tests/storage-stub.sql`), nes tuščias Postgres jų neturi.
- E2E `e2e/job-files.spec.ts`, nuotraukos `my-jobs-sign`, `my-jobs-files`, `job-files`.

## 6 etapas: papildomos eilutės ir sąskaitos juodraštis (2026-11-06)

Migracija `20261106090000_job_lines`, pgTAP `19_job_lines` (21 testas).
- `job_lines`: papildomos užsakymo eilutės (medžiagos, kelionė, keltas, paslaugos): aprašymas, kiekis (tikslus dešimtainis, iki 2 skaitmenų), vienetas, vieneto kaina øre, MVA tarifas (0, 12, 15, 25 %). Suma (`amount`) skaičiuojama DB ir apvalinama iki sveiko øre; iš naršyklės jos įrašyti negalima.
- Mato, prideda, keičia ir šalina tik biuras (savininkai/administratoriai su antru žingsniu, dispečeris). Vairuotojas ir kitos įmonės nemato nieko. Atšaukto užsakymo eilučių keisti negalima.
- `invoice_draft(job)`: patvirtintas darbo laikas (įprastu ir didesniu tarifu; abi eilutės sudėjus lygiai patvirtinta suma) ir papildomos eilutės. Veikia su naudotojo teisėmis, todėl RLS sprendžia, kas matoma.
- Sumos `src/lib/invoice.ts`: suma be MVA, MVA pagal tarifą (nuo tarifo eilučių sumos), iš viso.
- Užsakymo puslapyje skiltis „Sąskaitos juodraštis“: kam (klientas, įm. kodas, adresas, el. paštas arba įspėjimas), eilutės, pridėti/keisti/šalinti, sumos. Ženklas „Juodraštis, niekas neišsiųsta“: nieko nenumeruojama ir nesiunčiama.
- E2E `e2e/invoice.spec.ts`, nuotraukos `invoice`.

## 7 etapas: sąskaitų vieta ir varpelis (2026-11-06)

Migracija `20261106130000_job_invoices`, pgTAP `20_job_invoices` (24 testai).
- Li sprendimas: MaskinGo pats sąskaitų dar nesiunčia (CLAUDE.md taisyklė lieka). Biuras išsiunčia iš savo apskaitos programos ir pažymi „Išsiųsta“ (su sąskaitos numeriu, jei nori).
- `job_invoices`: žyma, numeris, sumos tuo metu (øre). Rašoma tik per `mark_invoice_sent` (tik atliktas darbas su patvirtintu, įkainotu laiku; biuras, savininkai/administratoriai su antru žingsniu). Žymą per klaidą biuras gali atšaukti.
- Pažymėtas juodraštis užrakintas (klaida `55006`): nauji laiko patvirtinimai, eilučių keitimas, užsakymo būsena, klientas, technika ir laikas.
- `invoice_queue()`: atlikti darbai su būsena `time` / `ready` / `sent` ir suma. `invoices_waiting()`: skaičius varpeliui.
- Puslapis `/app/invoices` (trys grupės) ir varpelis antraštėje (tik biurui) su skaičiumi; skaičius ir nuorodos pavadinime, ne tik spalva.
- Puslapio apačioje: kitų apskaitos programų integracija pagal užklausą (Li prašymas). Kontaktinio adreso dar nėra: pridėti, kai bus domenas ir el. paštas.
- E2E `e2e/invoices.spec.ts`, nuotraukos `invoices`.

## 8 etapas: buhalterio rolė (2026-11-06)

Migracijos `20261106150000_accountant_role` (tik nauja `member_role` reikšmė) ir `20261106150100_accountant_access`, pgTAP `21_accountant` (18 testų).
- Rolė `accountant` (nb „Regnskapsfører“, lt „Buhalteris“). Kviečia savininkas arba administratorius, kaip ir kitas roles.
- Mato tik **atliktus** darbus (ne planavimą), jų klientus, techniką, patvirtintą laiką, juodraščius ir žymas. Kliento, technikos, darbų ir žmonių nekeičia; vairuotojų nuotraukų nemato.
- Su antru žingsniu (kaip savininkas/administratorius): tvirtina ir taiso laiką, keičia eilutes, žymi „Išsiųsta“ ir atšaukia žymą.
- Ekrane: meniu skirtukas „Sąskaitos“ ir varpelis; darbo puslapyje tik laikas ir sąskaita, nuoroda „Visos sąskaitos“.
- E2E `e2e/accountant.spec.ts`, nuotraukos `accountant-job`, `accountant-invoices`.

## 9 etapas: papildomos teisės komandos nariams (2026-11-06)

Migracija `20261106170000_extra_permissions`, pgTAP `22_extra_permissions` (24 testai).
- `memberships.permissions` (text[]): `plan_jobs`, `invoicing`, `machines`, `invite`. Tik prideda prie rolės.
- Suteikia savininkas arba administratorius (su antru žingsniu) per `set_member_permissions`; tik dispečeriams,
  vairuotojams ir buhalteriams. Tiesiogiai į lentelę rašyti negalima.
- `plan_jobs` = dispečerio teisės (kartu ir sąskaitos), be antro žingsnio. `invoicing` = buhalterio teisės (su antru žingsniu).
  Abi veikia per `private.has_role`, kuris dabar laiko narį dispečeriu / buhalteriu, jei jis turi tą teisę.
- `machines`: technika ir kainos (atskiros RLS taisyklės, su antru žingsniu). `invite`: kviečia vairuotojus ir
  dispečerius, mato ir atšaukia savo kvietimus (su antru žingsniu).
- Ekrane: „Komanda“ → prie žmogaus „Papildomos teisės“ su jungikliais; po role rodoma „Taip pat: …“.
  Programoje `src/lib/roles.ts` funkcijos priima `Access` (rolė + teisės).
- E2E `e2e/permissions.spec.ts`, nuotraukos `team-rights`.

## Sąskaitų planas (Li sutarta 2026-11-06)
- ~~8: buhalterio rolė~~ – padaryta (žr. aukščiau).
- ~~9: papildomos teisės~~ – padaryta (Li prašymas, įterpta prieš Fiken).
- **10: Fiken**: įmonė prijungia savo Fiken; „Siųsti per Fiken“ sukuria sąskaitą Fiken ir išsiunčia (el. paštas / EHF). Fiken klientui reikia API modulio. Numeruoja ir saugo Fiken; kreditnota Fiken.
- **11: Tripletex**: tas pats; reikia Tripletex integracijos paraiškos (consumer token, ~2–3 sav.), pateikti anksčiau.
- **12: sava PDF sąskaita iš MaskinGo**: numeracija, privalomi duomenys (bokføringsforskriften), siuntimas el. paštu, kreditnota, saugojimas 5 m. Reikia pakeisti CLAUDE.md taisyklę atskiru PR ir buhalterio patikros prieš paleidžiant.
- Kitos programos (Visma, PowerOffice, 24SevenOffice ir kt.) – integracija pagal kliento užklausą.
- **Po sąskaitų: vairuotojų darbo valandų lapas atlyginimui** (Li prašymas 2026-11-06). Vairuotojas surašo mėnesio
  išdirbtas valandas ir viršvalandžius (pvz. +50 %, +100 %), buhalteris patikrina ir patvirtina. Tai atlyginimo valandos,
  ne kliento sąskaitos valandos; pradžiai užpildyti iš patvirtintų darbų laikų. Patikrinti: arbeidsmiljøloven §10-6
  (viršvalandžių priedas bent 40 %) ir įmonės tarifinė sutartis; eksportas į algų programą (pvz. Tripletex/Fiken lønn).

## Domenas, el. paštas ir laiškų šablonai (2026-11-10)

- Domenas `maskingo.no` (one.com) prijungtas prie Vercel; `www` nukreipia į `maskingo.no`. Production `*.vercel.app` adresai nukreipiami į `maskingo.no` (`src/proxy.ts`, PR #23).
- Resend: `maskingo.no` patvirtintas (ES regionas), ta pati nemokama paskyra kaip Synlio. Supabase siunčia per Resend SMTP
  (`smtp.resend.com:465`, siuntėjas `"Maskingo" <hei@maskingo.no>`). Supabase Site URL `https://maskingo.no`, Redirect URLs `https://maskingo.no/**`.
- Gaunami laiškai: Resend Receiving įjungtas, šakninis MX → `receive-euw1.forge.rmta.net`; dėžutė `hei@maskingo.no` Resend → Inboxes.
- Laiškų šablonai (registracija, prisijungimo patvirtinimas, slaptažodžio atkūrimas) nb/en/lt: tekstai `scripts/email-templates.mjs`,
  sugeneruoti failai `supabase/templates/`. Kalba imama iš `auth.users` metadata `email_locale`, kurią palaiko DB trigeriai
  (asmeninis pasirinkimas → įmonės kalba → registracijos puslapio kalba → `nb`). Į hosted projektą šablonus po merge įkelia
  `.github/workflows/email-templates-deploy.yml` (Supabase Management API, tas pats `SUPABASE_ACCESS_TOKEN`).

## Kitas etapas (siūlymas)
1. Sąskaitų planas aukščiau (10–12), arba GPS (po teisininko patikros).
2. Li norai, laukiantys savo eilės:
   - **Nuotraukos ir parašas klientui** (Li prašymas 2026-11-03). Dabar juos mato tik biuras ir to darbo
     vairuotojas. Variantai: prisegti prie darbo ataskaitos ar sąskaitos juodraščio, arba saugi nuoroda klientui
     tik į jo darbą (atšaukiama, su galiojimo laiku). Prieš darant: nuspręsti su Li, kokį būdą renkamės,
     ir patikrinti GDPR (nuotraukose gali būti žmonių ar automobilių numerių).
   - **Atlikto darbo taisymas prieš sąskaitą ir ginčas po jos** (Li prašymas 2026-11-03).
     Baigtą darbą biuras gali papildyti (papildomos eilutės, medžiagos, laikas) iki sąskaitos juodraščio.
     Klientas gali užginčyti išsiųstą sąskaitą, o biuras pataiso ir parengia naują. Norvegijoje išsiųstos
     sąskaitos keisti negalima: daroma **kreditnota** (atšaukia seną) ir nauja sąskaita, abi su istorija
     (bokføringsloven; patikrinti su buhalteriu). MVP etape sąskaitos **nesiunčiamos** (CLAUDE.md), todėl
     papildymas ir sąskaitos juodraštis padaryti 6 etape; ginčas, kreditnota ir siuntimas (EHF) vėliau.
