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

## 12a etapas: įmonės sąskaitų duomenys (2026-11-10)

Li sprendimas 2026-11-10: Fiken vėliau, pirmiausia sava sąskaitų sistema (CLAUDE.md taisyklė pakeista PR #24).
Migracija `20261110110000_invoice_settings`, pgTAP `23_invoice_settings` (23 testai).
- `invoice_settings` (viena eilutė įmonei): adresas, MVA registracija, Foretaksregisteret, banko sąskaita (11 sk., MOD11),
  mokėjimo terminas (0–90 d.), el. paštas ir telefonas (nebūtini), pirmos sąskaitos numeris (12b jį užrakins).
- Rašoma tik per `save_invoice_settings` (savininkas/administratorius su antru žingsniu); kartu išsaugo ir įmonės kodą,
  nes jis privalomas kiekvienoje sąskaitoje. Skaito biuras ir buhalteris; vairuotojas ir kitos įmonės nemato nieko.
- Puslapis `/app/invoices/settings`: forma, peržiūra „Sąskaitoje“ (pardavėjo dalis). Sąskaitų puslapyje nuoroda su būsena
  „Užpildyta“ / „Trūksta“ (ikona ir tekstas). Patikra `src/lib/invoice-settings.ts` (+ testai).
- E2E `e2e/invoice-settings.spec.ts`, nuotraukos `invoice-settings`, `invoices-with-settings`.

## 12b etapas: sąskaitos išrašymas su numeriu ir PDF (2026-11-10)

Migracija `20261110120000_invoices`, pgTAP `24_invoices` (33 testai).
- `issue_invoice(job)`: tik atliktas darbas su patvirtintu laiku, tik su įmonės sąskaitų duomenimis ir kliento adresu arba
  įmonės kodu. Numeris be spragų (`private.invoice_counters`, užrakinama iki transakcijos pabaigos; nepavykęs bandymas numerio nesunaudoja).
  Kopijuoja pardavėją, pirkėją, darbą, eilutes (norvegiškai) ir sumas. Ne MVA mokėtojui: visos eilutės 0 %.
  Įrašo ir `job_invoices` žymą (užrakina darbą); tos žymos atšaukti nebegalima.
- Išrašo: dispečeris arba savininkas/administratorius/buhalteris su antru žingsniu. Skaito biuras ir buhalteris.
- `invoices` ir `invoice_lines` niekada nekeičiami ir netrinami (trigeris, net DB savininkui). Pirmas numeris užrakinamas po pirmos sąskaitos.
- PDF: `src/lib/pdf/invoice-pdf.ts` (pdf-lib + Geist šriftas, OFL licencija `src/lib/pdf/fonts/OFL.txt`), A4, norvegiškai, keli puslapiai.
  Privatus aplankas `invoices`, kelias `<org>/<invoice>.pdf`: įkeliamas vieną kartą, nekeičiamas ir netrinamas.
  `/app/invoices/[id]/pdf` atiduoda PDF (jei jo dar nėra, sukuria iš kopijos).
- Darbo puslapyje: „Išrašyti sąskaitą“ su patvirtinimu; išrašytos sąskaitos ženklas, datos ir „Atidaryti sąskaitą (PDF)“.
  „Pažymėti kaip išsiųstą“ liko kaip alternatyva (suskleista) tiems, kas siunčia iš kitos programos.
- E2E `e2e/invoice-issue.spec.ts`, nuotraukos `invoice-issue`, `invoice-issued`.
- Vėliau padaryta: siuntimas el. paštu (12c), kreditnota (12d), eksportas (12e).

## 12c etapas: sąskaitos siuntimas el. paštu (2026-11-10)

Migracija `20261110130000_invoice_sendings`, pgTAP `25_invoice_sendings` (20 testų).
- `invoice_sendings`: kiekvienas siuntimas (kam, kas, kada, bandomasis ar ne, būsena `sending`/`sent`/`failed`, Resend id).
  Netrinamas; būseną vieną kartą užbaigia tas, kas pradėjo. `start_invoice_sending(invoice, to_email, test_mode)` tikrina teises
  (kaip išrašymui), adresą, bandomąjį režimą ir ribą: 5 siuntimai per parą vienai sąskaitai. `finish_invoice_sending(sending, sent, provider_id)`.
- Laiškas `src/lib/email/invoice-email.ts` (norvegiškai, PDF priedas, siuntėjas `"<įmonė> via MaskinGo" <faktura@maskingo.no>`,
  Reply-To įmonės el. paštas). Siuntimas `src/lib/email/resend.ts` (Resend HTTP API, `Idempotency-Key` = siuntimo id).
- Vercel aplinkos kintamieji: `RESEND_API_KEY` (Li įdeda pats, Production + Preview, Sensitive). Be jo: klaida „siuntimas neparuoštas“.
  `INVOICE_EMAIL_LIVE=1` (Vercel Production + Preview, įjungta 2026-11-10 Li sprendimu; CLAUDE.md taisyklė apie buhalterio
  patikrą pašalinta). Be jo bandomasis režimas (vietoje ir CI): tik `.test` adresai, laiškas keliauja į `delivered@resend.dev`,
  tema ir tekstas pažymėti „TEST“.
- Darbo puslapyje (išrašyta sąskaita): „Siųsti sąskaitą“ su gavėju (kliento sąskaitų el. paštas, galima keisti) ir patvirtinimu;
  „Išsiųsta el. paštu“ istorija su ikona ir tekstu.
- E2E: `e2e/resend-stub.mjs` (vietinis Resend pakaitalas, paleidžia `playwright.config.ts`), tikrinama `e2e/invoice-issue.spec.ts`.

## 12d etapas: kreditnota (2026-11-16)

Migracija `20261116090000_credit_notes`, pgTAP `26_credit_notes` (22 testai).
- `invoices` gavo `kind` (`invoice`/`credit_note`), `credits` (kurią sąskaitą kredituoja) ir `reason`. Kreditnotos sumos neigiamos.
  `unique(job_id)` pašalintas: darbas gali turėti sąskaitą, kreditnotą ir naują sąskaitą. Viena sąskaita kredituojama tik kartą.
- `credit_invoice(invoice, reason)`: teisės kaip išrašymui; visada visa sąskaita; numeris iš to paties sąrašo be spragų;
  eilutės nukopijuojamos su neigiamais kiekiais ir sumomis; ištrinama `job_invoices` žyma, todėl darbas vėl atrakinamas ir
  galima išrašyti naują sąskaitą. `private.check_unmark` leidžia žymą trinti tik kai sąskaita kredituota.
- PDF „Kreditnota“ (numeris, data, kredituojama sąskaita ir jos data, priežastis, „Kreditert“), failas `Kreditnota-N.pdf`.
  Laiškas „Kreditnota N fra …“. Dalinės kreditnotos nėra (Li sutarė: visa sąskaita + nauja).
- Darbo puslapyje: „Kredituoti sąskaitą“ (suskleista, priežastis + patvirtinimas); „Ankstesnės sąskaitos ir kreditinės sąskaitos“
  su PDF nuorodomis, siuntimu el. paštu ir siuntimų istorija.

## 12e etapas: eksportas buhalteriui (2026-11-16)

Be migracijos (duomenys jau yra). Puslapis `/app/invoices/export` (nuoroda „Eksportas buhalteriui“ sąskaitų puslapyje),
mato tie patys, kas mato sąskaitas (`canSeeInvoices`, RLS).
- Laikotarpis (nuo–iki, abi dienos įskaitomos, daugiausia 366 d.), greiti mygtukai „Šis mėnuo“ / „Praėjęs mėnuo“
  (įmonės laiko zona). Rodo sąskaitų ir kreditnotų skaičių, sumas ir dokumentų sąrašą (iki 50).
- `/app/invoices/export/csv`: viena eilutė kiekvienam dokumentui ir PVM tarifui; `;`, kablelis dešimtainėms, BOM,
  datos dd.mm.yyyy, stulpeliai norvegiškai; kreditnotos neigiamos, su kredituojamos sąskaitos numeriu.
  Tekstas, prasidedantis `= + - @`, gauna `'` (Excel formulių injekcijos apsauga). PVM apvalinamas kaip PostgreSQL `round()`.
- `/app/invoices/export/zip`: visi PDF (`Faktura-N.pdf`, `Kreditnota-N.pdf`) per `getInvoicePdf`, `fflate` (be suspaudimo),
  daugiausia 300 dokumentų vienam ZIP.
- Logika `src/lib/invoice-export.ts` (Vitest), užkrovimas `src/lib/invoice-export-server.ts` (puslapiais po 1000 eilučių).
  E2E `e2e/invoice-issue.spec.ts` parsisiunčia CSV ir ZIP ir tikrina turinį.

## 13a etapas: valandų lapas atlyginimui (2026-11-16)

Li pageidavimai: lapą pildo pats darbuotojas, labai paprastai; laikotarpis nuo–iki; viršvalandžiai nuo pasirinktos
valandos su pasirinktu %, galima antras (didesnis) lygis; patvirtinus PDF išsiunčiamas buhalteriui el. paštu.
Migracija `20261116120000_hour_sheets`, pgTAP `27_hour_sheets` (30 testų).
- `hour_settings`: `overtime_after` (min., numatyta 480 = 8 val.), `overtime_percent` (50), nebūtinas antras lygis
  (`overtime2_after` > pirmo, `overtime2_percent` > pirmo), `accountant_email`. Keičia savininkas/admin (`save_hour_settings`).
- `hour_sheets` (vieno žmogaus, iki 62 d., laikotarpiai nesikerta) ir `hour_sheet_days` (data, pradžia, pabaiga – jei
  ankstesnė už pradžią, tai kitas rytas, pertrauka, pastaba). Funkcijos: `create_hour_sheet`, `save_hour_sheet_day`,
  `remove_hour_sheet_day`, `delete_hour_sheet` (tik nepatvirtintas), `submit_hour_sheet` (padalija kiekvieną dieną:
  įprastos / 1 lygis / 2 lygis, išsaugo taisykles ir vardą, užrakina; grąžina buhalterio el. paštą),
  `record_hour_sheet_email`. Viršvalandžiai skaičiuojami tik pagal dienos valandas (savaitės ribos nėra).
- Skaito: pats darbuotojas; savininkas, admin (su antru žingsniu) ir buhalteris – visus. Kolegos ir kitos įmonės – nieko.
- Ekranai: meniu „Valandos“ (`/app/hours`), lapas `/app/hours/[id]`, nustatymai `/app/hours/settings`, PDF `/app/hours/[id]/pdf`.
  PDF „Timeliste“ norvegiškai (`src/lib/pdf/hours-pdf.ts`), laiškas iš `timeliste@maskingo.no`, atsakymas eina darbuotojui.
- **Viršvalandžiai pagal laikrodį** (Li prašymas 2026-11-17, migracija `20261117120000_hour_clock_overtime`, pgTAP `28_hour_clock_overtime`).
  Įmonė pasirenka `overtime_mode`: `daily` (po N val. per dieną, kaip anksčiau) arba `clock` (langai `overtime_from–overtime_to`
  ir nebūtinas `overtime2_from–overtime2_to`, pvz. 15:00–19:00 +50 %, 19:00–06:00 +100 %; per vidurnaktį galima).
  Kiekviena minutė priskiriama langui (kur persidengia – galioja 2 lygis); pertrauka atimama iš įprastų, tada 1 lygio, tada 2.
  Skaičiuoja `private.split_day` (DB) ir `splitDay` (`src/lib/hours.ts`) vienodai; patvirtintas lapas išsaugo langus.
- 13b (kitas): buhalterio vaizdas – visų darbuotojų lapai, ir kiek darbų darbuotojas atliko (paspaudus – kurie).

## Sąskaitų planas (Li sutarta 2026-11-06)
- ~~8: buhalterio rolė~~ – padaryta (žr. aukščiau).
- ~~9: papildomos teisės~~ – padaryta (Li prašymas, įterpta prieš Fiken).
- **10: Fiken**: įmonė prijungia savo Fiken; „Siųsti per Fiken“ sukuria sąskaitą Fiken ir išsiunčia (el. paštas / EHF). Fiken klientui reikia API modulio. Numeruoja ir saugo Fiken; kreditnota Fiken.
- **11: Tripletex**: tas pats; reikia Tripletex integracijos paraiškos (consumer token, ~2–3 sav.), pateikti anksčiau.
- **12: sava PDF sąskaita iš MaskinGo** (Li: daroma dabar, prieš Fiken). CLAUDE.md taisyklė pakeista (PR #24). Dalys:
  ~~12a įmonės sąskaitų duomenys~~ (padaryta); ~~12b išrašymas su numeriu be spragų ir PDF~~ (padaryta); ~~12c siuntimas el. paštu~~ (padaryta);
  ~~12d kreditnota~~ (padaryta); ~~12e eksportas (CSV + PDF ZIP buhalteriui)~~ (padaryta); vėliau Fiken API.
- Kitos programos (Visma, PowerOffice, 24SevenOffice ir kt.) – integracija pagal kliento užklausą.
- **Fiken ir Tripletex atidėti** (Li sprendimas 2026-11-16): daroma vėliau. Kainos: Fiken API-modul klientui 99 kr/mėn.,
  Tripletex „Integrasjoner“ 129 kr/mėn. (Smart; Pro/Komplett įskaičiuota), Tripletex consumer token paraiška ~2–3 sav.
- **Prieš viešą puslapį: atsiskaitymo sistema** (Li 2026-11-16): mėnesio prenumerata su keliais planais. Reikia Li sprendimų:
  mokėjimų paslauga (siūlyta Stripe), planai ir kainos, bandomasis laikotarpis.
- **Vėlesnis etapas: viešas įmonės puslapis klientams** (Li idėja 2026-11-16). Įmonė gauna puslapį, kurį siunčia klientams:
  įmonės informacija, ką daro, kontaktai; klientas mato laisvus laikus ir siunčia norimos paslaugos užsakymo užklausą,
  kurią įmonė dar patvirtina arba atmeta (jokio automatinio patvirtinimo). Įmonė paskyroje nustato, kada dirba ir kada ne.
  Registruojantis įmonė pasirenka, ar jos puslapis viešas. Viešų puslapių **katalogas** žmonėms, ieškantiems paslaugų
  (pagal paslaugą ir vietą), indeksuojamas Google, panašiai kaip skelbimai.
  Įmonės galės registruotis **tik į katalogą** (be užsakymų, vairuotojų valdymo ir kitų sistemos dalių), pvz. kaip
  atskiras (pigesnis arba nemokamas) planas.
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
     (bokføringsloven; patikrinti su buhalteriu). Iki 12 etapo sąskaitos nebuvo siunčiamos, todėl
     papildymas ir sąskaitos juodraštis padaryti 6 etape; ginčas, kreditnota ir siuntimas (EHF) vėliau.

## SEO pagrindai (2026-11-10)
Paieškoje rodomi tik `/`, `/signup`, `/login` ir tik gyvoje svetainėje (`VERCEL_ENV=production`).
Visi kiti puslapiai (`/app`, slaptažodžio, kvietimų nuorodos) turi `noindex`; `/app` ir `/auth` dar ir `X-Robots-Tag` antraštę.
Failai: `src/lib/site.ts` (adresas, `publicPaths`, `publicPageMetadata`), `src/app/robots.ts`, `sitemap.ts`, `manifest.ts`,
`opengraph-image.tsx` (dalinimosi paveikslėlis, norvegiškai), JSON-LD pradžios puslapyje (be kainų ir įvertinimų, kol jų nėra).
Kalba nustatoma slapuku tuo pačiu adresu, todėl `hreflang` nėra: Google mato norvegišką versiją.
Atskiri adresai kalboms (pvz. `/en`) būtų atskiras etapas.
Testai: `src/lib/site.test.ts`, `e2e/seo.spec.ts`.

## Šakų puslapiai SEO (2026-11-23)
`/kranbil`, `/maskinentreprenor`, `/transport`: vienas šablonas `src/app/(marketing)/industry-page.tsx`, sąrašas
`src/lib/industries.ts`, tekstai `messages/*.json` → `Industry.<slug>` (problema, 4 privalumai, 4 klausimai, registracija).
Pradžios puslapyje skyrius „Laget for din bransje“ su nuorodomis (`src/components/industry-link.tsx`). Puslapiai sitemap'e
(prioritetas 0.8), JSON-LD: `BreadcrumbList` + `FAQPage`. Tekstuose tik tai, ką programa jau daro (pvz. sąskaita tik iš
valandų, EHF dar nėra). Norvegiškus tekstus prieš pilotą turi peržiūrėti gimtakalbis.
2026-11-24: tuo pačiu šablonu pridėti temų puslapiai `/timeforing` ir `/faktura` (`topics` faile `src/lib/industries.ts`),
nuorodos poraštėje. Transporto DUK pataisytas: tona ar reisas galimi kaip savos sąskaitos eilutės.
Testai: `e2e/industry.spec.ts` (3 puslapiai × 5 pločiai × 3 kalbos), `e2e/seo.spec.ts`.

## Kainų puslapis /priser (2026-11-23)
Planai, žmonių skaičius, kainos ir bandomasis laikotarpis imami iš `src/lib/billing.ts` (tas pats šaltinis kaip mokėjimai),
todėl puslapis ir programa visada rodo tuos pačius skaičius. `VAT_REGISTERED = false` yra `src/lib/billing.ts`
(MaskinGo dar ne MVA registre; pasiekus 50 000 kr per 12 mėn. įjungti, tada puslapis rašys „eks. mva.“) ir Bedrift
papildomo žmogaus kaina 79 kr (dar neapmokestinama, 14b etapas). Puslapis `src/app/(marketing)/priser/page.tsx`,
tekstai `Pricing`, nuoroda poraštėje. Sąlygų skyrius „Pris“ ir privatumo politika papildyti (Stripe kaip tiekėjas).
Testai: `src/lib/pricing.test.ts`, `e2e/pricing.spec.ts`. Bedrift papildomo žmogaus kaina nuo 14b yra `BEDRIFT_EXTRA_PERSON_ORE` faile `src/lib/billing.ts`.

## Privatumo politika ir naudojimo sąlygos (2026-11-17)
Puslapiai `/personvern` ir `/vilkar` (nb/en/lt), tekstai `messages/*.json` → `Legal`, įmonės duomenys `src/lib/legal.ts`
(`COMPANY`, `LEGAL_UPDATED`). Nuorodos poraštėje (`src/components/site-footer.tsx`) ir po registracijos mygtuku.
Faktai patikrinti 2026-11-17: Supabase `eu-north-1` (Stokholmas), Vercel funkcijos `arn1`, Resend ES regionas,
slapukai tik būtini (Supabase sesija, `NEXT_LOCALE`, `theme`), jokios analitikos, GPS nerenkama.
2026-11-17 papildyta (Li prašymas „padaryk kaip teisininkas“): privatumo politika pagal BDAR 13 str. (gavėjai, ar privaloma
pateikti duomenis, jokių automatizuotų sprendimų, ištrynimas per 30 d., sąskaitas saugo pati įmonė), sąlygos (tik verslui,
darbuotojų informavimas pagal arbeidsmiljøloven, teisės į paslaugą, sustabdymas, force majeure, 90 d. duomenų išdavimas,
ginčai), nauja `/databehandleravtale` pagal BDAR 28 str. (subtvarkytojai su 30 d. įspėjimu, pažeidimai per 48 val.).
Tai ne teisininko patikra: prieš tikrus klientus vis tiek rekomenduojama advokato peržiūra.

## 14a etapas: MaskinGo abonementas (2026-11-23)
Planai (Li sprendimas 2026-11-23), kainos be MVA, metams 2 mėn. nemokamai, 30 d. bandymas be kortelės:
Solo 1–2 žm. 290 kr, Start iki 5 – 790 kr, Pro iki 15 – 1 790 kr, Bedrift 3 490 kr už 40 žmonių (+79 kr už kiekvieną žmogų virš 40, žr. 14b).
MaskinGo dar ne MVA registre: `VAT_REGISTERED = false` (`src/lib/billing.ts`), ekranai sako „mva neskaičiuojamas“. Pasiekus 50 000 kr: `true` ir Vercel'yje `STRIPE_TAX_RATE_ID` su 25 %.
- Migracija `20261123120000_subscriptions.sql`: lentelė `subscriptions` (viena įmonei; nariai tik skaito, rašo tik serveris
  per `save_subscription` ir `save_stripe_customer`, kurie priima tik serverio `BILLING_WRITE_TOKEN`; lentelėje `private.billing_writer` laikoma tik jo maiša), trigeris naujai įmonei duoda 30 d. bandymą, `private.plan_seats`, trigeris `memberships_check_seats`
  (klaida 53400 / `seat_limit`), `public.seat_usage(org)`. Registruojantis per kvietimą, kai planas pilnas, paskyra sukuriama,
  kvietimas lieka atviras. Bandymo metu ir Bedrift plane ribos nėra.
- Stripe (`stripe@23.1.0`): `src/lib/billing.ts` (planai, kainos øre, būsena), `src/lib/stripe-server.ts` (kainos randamos pagal
  `lookup_key` `maskingo_<planas>_<month|year>` arba sukuriamos), veiksmai `src/app/app/billing/actions.ts` (Checkout,
  plano keitimas su perskaičiavimu, savitarnos portalas; tik savininkas ir administratorius su antru žingsniu),
  webhook `src/app/api/stripe/webhook/route.ts` (tikrina parašą, pasiima dabartinę prenumeratą iš Stripe).
- Ekranai: `/app/billing` („Abonementas“, nuoroda Nustatymuose), juosta virš puslapių paskutinę bandymo savaitę ir esant
  mokėjimo bėdai (tik savininkui ir administratoriui), komandos puslapyje „X iš Y žmonių“, pilnam planui kvietimas neleidžiamas.
- Aplinkos kintamieji Vercel'yje: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `BILLING_WRITE_TOKEN` (jo sha256 įrašytas į `private.billing_writer`), vėliau `STRIPE_TAX_RATE_ID`.
  Kol jų nėra, puslapis sako „Mokėjimai dar neįjungti“ ir mygtukų nerodo.
- Testai: `29_subscriptions.test.sql`, `src/lib/billing.test.ts`, `e2e/billing.spec.ts` (CI dabar paleidžia ir `e2e/hours.spec.ts`).
- 14b: tik skaitymo režimas neapmokėjus, Bedrift papildomi žmonės per Stripe kiekį.

- Produkcijoje patikrinta 2026-11-24: Li bandomasis mokėjimas sandbox kortele, Start planas įrašytas, webhook 2/2 sėkmingi.

## 14b etapas: tik skaitymas ir Bedrift papildomi žmonės (2026-11-24)
- Tik skaitymas (migracija `20261124090000_read_only_company.sql`): `private.is_read_only(org)` tiesa, kai bandymas baigėsi
  be plano arba Stripe abonementas baigtas (`canceled`, `unpaid`, `incomplete_expired`, `paused`). `past_due` (Stripe dar
  bando nuskaičiuoti) dar leidžia rašyti. Trigeris `private.guard_read_only` ant visų įmonės lentelių stabdo kiekvieną
  rašymą (ir per RLS, ir per security definer funkcijas), klaida 42501 / `read_only`. Leidžiama: rinktis planą,
  šalinti žmones, atšaukti kvietimus; duomenų bazės pasekmės (FK cascade, `pg_trigger_depth() > 1`) praleidžiamos.
  Nuotraukų įkėlimas į `job-files` taip pat draudžiamas. Ekrane tą pačią taisyklę kartoja `isReadOnly` (`billing.ts`):
  juosta visiems nariams (savininkui ir administratoriui su nuoroda į Abonementą). Kitų formų klaida rodoma kaip
  „neturite teisės“, o priežastį paaiškina juosta; komandos ir kvietimo priėmimo formos sako tiksliai.
- Bedrift virš 40: antra Stripe eilutė su kaina `maskingo_bedrift_extra_<month|year>` (79 kr / 790 kr), kiekis = žmonės − 40.
  Atnaujinama `syncExtraPeople` (`stripe-server.ts`): priėmus kvietimą, pašalinus žmogų ir atidarius Abonemento puslapį
  (pagauna registraciją per kvietimą). Plano keitimas (`itemChanges`) prideda arba pašalina šią eilutę. Stripe klaida
  nestabdo prisijungimo; ji užrašoma į logą ir pataisoma kito pakeitimo metu.
- Stripe nustatymas, kurį tikrina Li: Billing → Revenue recovery → po visų nepavykusių bandymų „Cancel the subscription“.
- Testai: `30_read_only.test.sql`, `src/lib/billing.test.ts`, `e2e/billing.spec.ts`.

2026-11-24: Li sprendimu nuimta geltona „juodraščio“ pastaba nuo `/personvern`, `/vilkar` ir `/databehandleravtale`.
Tekstus rašė Claude, ne advokatas; atsakomybė už juos tenka įmonei.

## Programos ekranai pradžios puslapyje (2026-11-24)
Po mygtukais „Sukurti paskyrą / Prisijungti“ rodomas kompiuterio langas su dienos kalendoriumi ir priekyje vairuotojo telefonas
(`src/components/product-showcase.tsx`). Tai tikri programos ekranai su išgalvota įmone „Fjordkran AS“ (adresai `.test`),
po vieną rinkinį kiekvienai kalbai: `public/screens/calendar-<nb|en|lt>.webp`, `driver-<nb|en|lt>.webp`.
Tekstai `Home.showcase` (alt tekstai ir parašas). Testas `e2e/home.spec.ts` tikrina, kad paveikslėliai užsikrauna,
yra puslapio kalba, turi alt tekstą ir neištempti.

Kaip atnaujinti ekranus (pvz. pasikeitus dizainui), su vietiniu Supabase (`supabase start`) ir `npm run build`:
```
supabase db reset
export SERVICE_ROLE_KEY=<iš supabase status>
npx playwright test -c scripts/demo-screens seed
for l in nb en lt; do DEMO_LOCALE=$l npx playwright test -c scripts/demo-screens shoot; done
for l in nb en lt; do DEMO_THEME=dark DEMO_LOCALE=$l npx playwright test -c scripts/demo-screens shoot; done   # tamsūs (`*-dark.webp`, rodomi tamsiame režime)
node scripts/demo-screens/convert.mjs
```
Užsakymai sukuriami nuo šiandienos datos, todėl ekranuose visada matyti „šiandien“.
Šakų nuotraukos (Li sukūrė su ChatGPT 2026-11-24): `public/photos/` (kranbil-fjord, gravemaskin, tippbil), sąrašas
`src/lib/industry-photos.ts`. Rodomos šakų kortelėse (`src/components/industry-link.tsx`): pradžios puslapyje ir šakų puslapių
apačioje. Generatoriaus išgalvoti smulkūs užrašai užlieti. Antra kranų nuotrauka nenaudota: joje matyti Volvo logotipas.
Šakų puslapiuose (kranbil, maskinentreprenor, transport) po mygtukais rodoma ta pati šakos nuotrauka (`industryPhotos`), alt tekstas `Industry.<šaka>.photoAlt`. Temų puslapiuose (timeforing, faktura) nuotraukos nėra. Telefono rėmas pradžios puslapyje šviesus, kaip kompiuterio lango.

## 15a etapas: viešas įmonės puslapis (2026-11-24)
Li pasirinko 2026-11-24. Visas planas: 15a puslapis, 15b užklausų forma (įmonė priima arba atmeta, jokio automatinio
patvirtinimo), 15c darbo laikas ir laisvos dienos, 15d katalogas `/finn`, nemokamas (Li sprendimas 2026-11-24, vietoj plano „tik katalogas“). Pardavimo laiškai jau žada užsakymą per puslapį ir katalogą, todėl 15b ir 15d svarbūs paleidimui.
- Migracija `20261124120000_company_pages.sql`: lentelė `company_pages` (adresas `slug`, `published`, aprašymas,
  paslaugos iš fiksuoto sąrašo, miestas, sritis, telefonas, el. paštas, svetainė tik `https://`). Rašo tik
  `save_company_page` (savininkas ir administratorius su antru žingsniu); nariai skaito. Lankytojai lentelės nemato:
  `company_page(slug)` grąžina tik viešus laukus, kai puslapis paskelbtas ir įmonė ne tik skaitymo režime
  (savo nariai mato ir nepaskelbtą, kaip peržiūrą); `published_company_pages()` sitemap'ui. Tik skaitymo trigeris uždėtas.
- Ekranai: `/app/public-page` (nuoroda Nustatymuose savininkui ir administratoriui), viešas `/firma/[slug]`
  (`src/app/(company)`, savas paprastas maketas su „Siden er laget med MaskinGo“), JSON-LD `LocalBusiness`,
  canonical į maskingo.no, indeksuojama tik paskelbta ir tik produkcijoje. Sitemap'as atnaujinamas kas valandą.
- Paslaugų sąrašas `src/lib/company-page.ts` (`services`) ir tas pats DB patikroje; tekstai `Services`.
- Testai: `31_company_pages.test.sql`, `src/lib/company-page.test.ts`, `e2e/company-page.spec.ts`.

### 15a+: logotipas ir nuotraukos (2026-11-24, Li prašymu)
- Migracija `20261124150000_company_photos.sql`: lentelė `company_photos` (`logo` vienas, `photo` iki 8, aprašymas
  ekrano skaitytuvams iki 200 ženklų, eilės tvarka, plotis ir aukštis). Failai privačiame `company-photos` bucket'e,
  `<organization id>/<uuid>.jpg|png`, iki 2 MB. Keičia tik savininkas ir administratorius su antru žingsniu
  (`add/update/move/remove_company_photo`), ne tik skaitymo režime. Lankytojai failus gauna per pasirašytas nuorodas
  (1 val.) tik paskelbto puslapio ir tik įtrauktus į `company_photos` (`company_photo_visible`, `company_page_photos`).
- Naršyklė nuotrauką perpiešia ant canvas: sumažina (logotipas 512 px PNG, nuotrauka 1600 px JPEG) ir taip
  išmeta EXIF, įskaitant GPS. Serveris tikrina failo baitus ir dydį (`imageSize`, `src/lib/company-photos.ts`).
- Ekranai: skiltis „Logotipas ir nuotraukos“ `/app/public-page`, logotipas šalia pavadinimo ir galerija `/firma/[slug]`.
- Testai: `32_company_photos.test.sql`, `src/lib/company-photos.test.ts`, `e2e/company-photos.spec.ts`.

### Rekomendacijos apžvalgoje (2026-11-24, Li prašymu)
Po „Nuo ko pradėti“ savininkui ir administratoriui rodoma „Rekomendacijos“ (`Tip` `src/app/app/page.tsx`, tekstai
`Dashboard.tip*`): sukurti ir paskelbti įmonės puslapį, pridėti logotipą ir nuotraukas. Skiltis pasislepia, kai viskas
atlikta. Katalogo rekomendacija bus pridėta kartu su 15d (kol katalogo nėra, nuoroda niekur nevestų).

### 15b-1: užklausos per įmonės puslapį (2026-11-24)
Li sprendimas 2026-11-24: laisvi laikai rodomi 15c etape, iškart po 15b-1. 15c: įmonė programoje „atidaro laikus“
(darbo valandos, poilsio dienos), apžvalgoje rekomendacija tai padaryti, kai puslapis sukurtas, ir jungiklis
išjungti laikus (tada tik užklausos su pageidaujama data, kaip dabar). Klientui pasirinktas laikas vis tiek tik pasiūlymas.
- Migracija `20261124170000_job_requests.sql`: lentelė `job_requests` (vardas, telefonas ir/ar el. paštas, vieta,
  pageidaujama data, paslauga, aprašymas, kalba, būsena `new|accepted|declined`). Skaito tik biuras (owner, admin,
  dispatcher ir `plan_jobs`); niekas nerašo tiesiogiai. Lankytojas siunčia per `submit_job_request(slug, …)`: tik
  paskelbtam ne tik skaitymo įmonės puslapiui, laukai tikrinami dar kartą, ne daugiau kaip 20 per valandą įmonei
  ir 3 per valandą iš to paties telefono ar el. pašto (`too_many`).
- Forma `/firma/[slug]#request` (`request-form.tsx`, `request-actions.ts`), be paskyros; paslaugos tik iš įmonės sąrašo.
  Paslėptas laukas robotams (`company_website`): jį užpildžius nieko neišsaugoma.
- Laiškas įmonei norvegiškai (`src/lib/email/request-email.ts`, `foresporsel@maskingo.no`) į puslapio viešą el. paštą,
  atsakymas (reply-to) eina klientui. Be `INVOICE_EMAIL_LIVE=1` tik į testinę dėžutę ir tik `.test` adresams.
  Jei puslapyje el. pašto nėra, laiškas nesiunčiamas; užklausa vis tiek matoma programoje.
- Programa: `/app/jobs/requests` (sąrašas, skambinti / rašyti), nuoroda su naujų skaičiumi `/app/jobs`,
  kortelė „Naujos užklausos“ apžvalgoje, kai jų yra.
- 15b-2 (toliau): priimti (klientas ir užsakymo juodraštis) arba atmesti, laiškas klientui jo kalba (`locale`).
- Testai: `33_job_requests.test.sql`, `src/lib/job-requests.test.ts`, `src/lib/email/request-email.test.ts`, `e2e/job-requests.spec.ts`.

### Vėlesnis etapas 16: kliento paskyra (Li idėja 2026-11-24)
Po 15d. Klientas (užsakovas) užsiregistruoja kaip klientas, ne kaip įmonė:
- „Mano užsakymai“: savo užklausos ir užsakymai, jų būsena ir datos.
- Dažniausiai užsakomos įmonės viršuje; greitas užsakymas (kontaktai ir adresai užpildomi, ankstesnį galima pakartoti).
- Įmonės puslapyje rekomendacija klientui užsiregistruoti: užsakymai realiu laiku, greičiau ir greitesnis patvirtinimas.
  Patvirtina vis tiek įmonė (jokio automatinio patvirtinimo), tik greičiau, nes duomenys jau patikrinti.
