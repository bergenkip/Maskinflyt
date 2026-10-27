# Maskinflyt – projekto aprašas

Pilna specifikacija (gyvas dokumentas, Li): **„Technikos užsakymų ir parko valdymo sistema – MVP specifikacija“**
https://claude.ai/artifact/Xb78yyMxQYDN19SreJ7CWc

Jei šis failas ir dokumentas skiriasi, galioja dokumentas. Žemiau trumpa santrauka darbui.

## Tikslas
Paprastas užsakymų ir parko valdymo įrankis Norvegijos transporto ir maskinentreprenør įmonėms
(nuo vieno vairuotojo iki didelio parko). Pakeičia telefoną, SMS ir Excel:
**užsakymas → paskyrimas vairuotojui → darbo laikas → sąskaita.**
Pagrindinis matas: laikas nuo darbo pabaigos iki išsiųstos sąskaitos (tikslas: tą pačią dieną).

## Rolės (iš specifikacijos)
Tiekėjo savininkas / administratorius, dispečeris, vairuotojas / operatorius; užsakovo administratorius,
užsakovo darbuotojas; klientas be paskyros. Vienas žmogus gali turėti kelias roles.
Kol kas kode yra OrderFlow rolės (owner / admin / operator / viewer); jas pritaikysime atskirame etape.

## P0 funkcijos
- Įmonė: registracija su org.nr. (+ duomenys iš Brønnøysundregistrene), darbuotojų kvietimai, rolės.
- Technika: sunkvežimių ir mašinų sąrašas (tipas, reg. nr., krano galia, keliamoji galia, įkainis).
- Užsakymai: klientas, adresas žemėlapyje, laikas, technika, aprašymas, nuotraukos; kartojimas.
- Planavimas: dienos / savaitės kalendorius pagal sunkvežimį ir vairuotoją, persidengimų įspėjimas.
- Vairuotojo PWA: mano darbai šiandien, būsenos Priimta → Pakeliui → Atvykau → Baigiau, pertraukos,
  nuotraukos, pastabos, kliento parašas (neprivalomas).
- Darbo laikas iš būsenų, dispečerio tvirtinimas, minimalus apmokestinamas laikas.
- Sąskaitos juodraštis iš patvirtinto darbo; eksportas į Fiken arba Tripletex, PDF klientui.
- Gyvas žemėlapis tik tarp „Pakeliui“ ir „Baigiau“.
- Klientų registras, importas, individualūs įkainiai.

P1 ir P2 (užsakovų paskyros, vieša platforma, subranga) – žr. specifikaciją.

## Privalomos taisyklės iš specifikacijos
- Kiekviena lentelė turi įmonės id ir RLS. Laikai UTC, rodomi Europe/Oslo.
- GPS renkamas tik darbo metu, rodomas ženklas „Vieta perduodama“, taškai saugomi 30 dienų.
- Platforma vairuotojų nenuomoja: parduodama paslauga su savo technika (subranga, ne innleie).
- Apskaitos nekuriame: numeracija ir buhalterija Fiken / Tripletex.
- Prieš paleidimą: GDPR / darbuotojų kontrolės, DPA ir bokføringsforskriften patikra su teisininku.
