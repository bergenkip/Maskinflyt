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
Nuoroda veikia toje pačioje naršyklėje, kurioje jos paprašyta (PKCE). Prisijungimo formoje yra nuoroda „Pamiršote slaptažodį?“.
Testai: `e2e/password.spec.ts`.

## Kitas etapas (siūlymas)
1. Užsakymai ir kalendorius (klientas, adresas, laikas, mašina; kainai naudojamas kliento įkainis, jei jis yra).
