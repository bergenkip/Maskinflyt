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

## 4 etapas: užsakymai, 2 dalis – kalendorius (2026-10-29)

`/app/jobs/calendar`, perjungiama iš Užsakymų („Sąrašas | Kalendorius“), nes apatinėje juostoje vietos 6-am punktui nėra.
- Adreso parametrai: `date` (YYYY-MM-DD), `view` (`day`|`week`), `by` (`vehicle`|`driver`). Atšaukti užsakymai kalendoriuje nerodomi.
- **Diena**: kompiuteryje ir planšetėje laiko juosta 06–20 (išplečiama, jei darbų anksčiau ar vėliau), eilutė kiekvienai technikai ar žmogui, persidengę darbai – atskirose eilutėse. Telefone kortelė kiekvienai technikai su tos dienos darbais.
- **Savaitė** (pirmadienis–sekmadienis, ISO savaitės numeris): kompiuteryje lentelė (slenka tik viduje), telefone kortelė kiekvienai dienai.
- **Nepaskirti** (be technikos arba be vairuotojo, pagal pasirinktą grupavimą) rodomi viršuje.
- **Laisva vieta / „+“** atidaro `/app/jobs/new?date=&start=&vehicle=|driver=`. Parametrai tikrinami pagal sąrašus; pagal vairuotoją dar įrašoma jo pagrindinė arba dažniausia technika.
- Datų skaičiavimai `src/lib/calendar.ts` (Vitest). E2E `e2e/calendar.spec.ts`, nuotraukos `calendar-day`, `calendar-week` faile `jobs.spec.ts`.

## Kitas etapas (siūlymas)
1. Vairuotojo telefono vaizdas: mano šiandienos darbai, būsenos, darbo laikas.
