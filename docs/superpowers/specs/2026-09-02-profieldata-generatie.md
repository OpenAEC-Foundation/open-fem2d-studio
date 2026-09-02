# Profieldata-generatie — verantwoording

**Datum:** 2026-09-02
**Script:** `scripts/genereer-profieldata.mjs`
**Uitvoer:** `src-tauri/crates/steel-profiles/data/profielen-uitbreiding.json` (316 nieuwe profielen)

## 1. Waarom genereren in plaats van overtypen

De bestaande profieldatabase is opgebouwd door tabelwaarden over te typen. De
audit van 2026-09-02 moest 96 van de 98 profielen corrigeren omdat Av;z en Iw
met foute formules of foute brondata waren ingevoerd; een tweede correctieronde
haalde de torsieconstante van de HEM-reeks 33–65% naar beneden. Dat is geen
toeval: per profiel worden dertien afgeleide grootheden ingevoerd, en elke
daarvan is een kans op een fout die niemand ziet.

De aanpak hier draait dat om. Alleen **basisgeometrie** wordt overgetypt — h, b,
tw, tf, r bij I/H en U, h, b, t bij kokers, d en t bij buizen. Dat zijn
genormeerde maten uit EN 10365, DIN 1026-2 en EN 10210-2: kort, rond en
eenvoudig na te lopen. Alle dertien afgeleide grootheden volgen uit gesloten
formules die hieronder staan. Eén fout in een formule is zichtbaar in de
validatie tegen 90 bestaande profielen; één fout in een overgetypt getal is dat
niet.

## 2. Meetkundige basis: de walsuitronding

De hele berekening van I/H- en U-profielen hangt op één deelgebied: de
walsuitronding, het gebied tussen een scherpe hoek `r × r` en de kwartcirkel met
straal r. Alle bijdragen aan A, I, Wpl en het zwaartepunt volgen uit drie exacte
momenten van dat gebied, met u gemeten vanaf de scherpe hoek:

| moment | waarde | numeriek |
|---|---|---|
| `∫ dA` | `r² · (1 − π/4)` | `0,2146018 r²` |
| `∫ u dA` | `r³ · (5/6 − π/4)` | `0,0479351 r³` |
| `∫ u² dA` | `r⁴ · (1 − 5π/16)` | `0,0182525 r⁴` |

Het zwaartepunt van de uitronding ligt op `0,2233730 · r` van de scherpe hoek.
Dezelfde drie constanten beschrijven ook de hoekafronding van een koker, en
daarmee de afgeronde rechthoek:

```
A(B,H,R)   = B·H − 4·(1−π/4)R²
I(B,H,R)   = B·H³/12 − 4·[ (1−5π/16)R⁴ − H·(5/6−π/4)R³ + (H²/4)(1−π/4)R² ]
Wpl(B,H,R) = 2·[ B·H²/8 − 2·( (H/2)(1−π/4)R² − (5/6−π/4)R³ ) ]
```

**Controle:** met `R = B/2 = H/2` degenereert de afgeronde rechthoek tot een
cirkel, en de formules leveren dan exact `A = πR²`, `I = πR⁴/4` en
`Wpl = (2R)³/6`. Die limiet zit als harde zelftest in het script; met `R = 0`
leveren ze exact de gewone rechthoekformules. Twee onafhankelijke limieten die
allebei exact kloppen, sluiten een algebrafout praktisch uit.

## 3. Formules per profielsoort

### I/H-profielen (IPE, HEA, HEB, HEM)

Met `hw = h − 2·tf` en vier uitrondingen:

| grootheid | formule |
|---|---|
| A | `2·b·tf + hw·tw + 4·(1−π/4)·r²` |
| Iy | `[b·h³ − (b−tw)·hw³]/12 + 4·∫(hw/2 − u)² dA` |
| Iz | `2·tf·b³/12 + hw·tw³/12 + 4·∫(tw/2 + u)² dA` |
| Wel;y | `Iy / (h/2)` |
| Wel;z | `Iz / (b/2)` |
| Wpl;y | `2·[ b·tf·(h−tf)/2 + tw·hw²/8 + 2·∫(hw/2 − u) dA ]` |
| Wpl;z | `2·[ tf·b²/4 + hw·tw²/8 + 2·∫(tw/2 + u) dA ]` |
| iy, iz | `√(Iy/A)`, `√(Iz/A)` |
| Iw | `Iz·(h − tf)² / 4` |

De Steiner-bijdrage van de uitrondingen zit in de integralen uit §2; er is dus
geen aparte verplaatsingsterm nodig.

**Controle:** A en Iy zijn voor IPE 300 ook numeriek bepaald door de
breedtefunctie w(z) — inclusief de exacte boog van de uitronding — over 400 000
schijfjes te integreren. Analytisch en numeriek komen op 1·10⁻⁴ relatief
overeen.

### U-profielen (UNP, UPE)

Zelfde opbouw, maar met **twee** uitrondingen en een zwaartepunt dat niet in het
midden ligt. Het zwaartepunt z₀ vanaf de lijfrug volgt uit lijf, flenzen en
uitrondingen; Iz wordt met Steiner om die as opgebouwd.

`Wel;z` is bewust de **maatgevende** (kleinste) waarde, dus `Iz` gedeeld door de
*grootste* randafstand `max(z₀, b − z₀)` — voor een U is dat de flenstip, niet
de lijfrug.

`Wpl;z` kan niet met een gesloten uitdrukking, want de plastische neutrale lijn
ligt waar het oppervlak zich haalveert en die positie hangt van de verhoudingen
af. Het script integreert daarom de breedtefunctie numeriek over 200 000
schijfjes, zoekt de lijn waar het cumulatieve oppervlak `A/2` bereikt, en
sommeert `∫|z − z_pl| w(z) dz`. Dat is nauwkeuriger dan de stuksgewijze
primitieve met arcsin-termen en niet gevoelig voor een tekenfout.

De welvingsconstante gebruikt de standaardformule voor een kanaal, met
`b' = b − tw/2` (flensuitkraging vanaf het lijfhart) en `hs = h − tf`:

```
Iw = (tf·b'³·hs²/12) · (3·b'·tf + 2·hs·tw) / (6·b'·tf + hs·tw)
```

**Controle:** deze formule is vergeleken met een directe
sectoriale-oppervlakintegratie over de wandmiddellijn — pool verschoven naar het
dwarskrachtcentrum via `x_S = ∫ω₀·y·t ds / Iy`, daarna genormaliseerd op
`∫ω t ds = 0` en `Iw = ∫ω² t ds`. Voor UNP 80/200/300 en UPE 400 komen gesloten
formule en numerieke integratie op **0,00%** overeen, en het berekende
dwarskrachtcentrum (26,63 mm vanaf het lijfhart bij UNP 200) klopt met de
tabelwaarde. Die controle zit als zelftest in het script.

### Kokers (SHS, RHS)

Buitenrand en binnenrand zijn allebei een afgeronde rechthoek; alle grootheden
zijn het verschil van de twee. Conform EN 10210-2 is de **buitenhoekstraal
1,5·t en de binnenhoekstraal 1,0·t**. Die combinatie is geometrisch niet
consistent (de wand is in de hoek dikker dan t), maar het is de normconventie
waarmee de gepubliceerde tabellen zijn opgesteld — met `r_i = r_o − t = 0,5·t`
wijkt het resultaat er ~0,7% van af, met `r_i = 1,0·t` minder dan 0,2%.

`It` volgt de formule van Bredt voor **gesloten** doorsneden:

```
It = 4·Am²·t / Um       Am = A(b−t, h−t, r_m),  Um = omtrek(b−t, h−t, r_m),  r_m = 1,25·t
```

`Iw` is 0: bij een gesloten koker is de welvingsweerstand verwaarloosbaar naast
de St.-Venanttorsie, en EN 1993-1-1 gebruikt hem voor kokers niet.

### Buizen (CHS)

Exacte ringformules, geen benadering:
`A = π/4·(d² − dᵢ²)`, `I = π/64·(d⁴ − dᵢ⁴)`, `Wel = 2I/d`,
`Wpl = (d³ − dᵢ³)/6`, `It = 2I` (polair traagheidsmoment), `Iw = 0` (exact).

### Afschuifoppervlak — EN 1993-1-1 §6.2.6(3)

| soort | Av;z | Av;y |
|---|---|---|
| I/H | `A − 2·b·tf + (tw + 2r)·tf`, ondergrens `η·hw·tw` | `2·b·tf` |
| U | `A − 2·b·tf + (tw + r)·tf`, ondergrens `η·hw·tw` | `2·b·tf` |
| koker | `A·h/(b+h)` | `A·b/(b+h)` |
| buis | `2A/π` | `2A/π` |

`η = 1,0` (conservatief; de NB bij NEN-EN 1993-1-1 laat dat toe).

### Torsieconstante van open gewalste profielen

De dunwandige som `(1/3)Σb·t³` onderschat It van een gewalst profiel met 10–30%
omdat de walsuitrondingen fors bijdragen. Het script gebruikt de
standaardbenadering van El Darwish & Johnston:

```
It = (1/3)·(2·b·tf³ + hw·tw³) + 2·α·D⁴ − 0,420·tf⁴
D  = ((tf + r)² + tw·(r + tw/4)) / (2r + tf)
α  = −0,042 + 0,2204·(tw/tf) + 0,1355·(r/tf) − 0,0865·(r·tw/tf²) − 0,0725·(tw/tf)²
```

Voor een **U-profiel** halveren de uitrondings- en flenstiptermen
(`α·D⁴` in plaats van `2α·D⁴`, `0,210·tf⁴` in plaats van `0,420·tf⁴`): een U
heeft twee uitrondingen in plaats van vier en twee vrije flensuiteinden in
plaats van vier.

**Controle:** de doorsnede is ook direct opgelost via de Prandtl-spanningsfunctie
(`∇²φ = −2` binnen, `φ = 0` op de rand, `It = 2∫φ dA`) met SOR op een fijn
rooster. Op IPE 300 en HEB 300 — waar de databasewaarde onafhankelijk vaststaat —
ligt de formule 5,7% resp. 6,4% boven de roosteroplossing, dezelfde systematische
trapjesrand-afwijking als de databasewaarde zelf (6,6%). Voor UNP 200/300 en
UPE 200 ligt de formule op 0,99–1,04 van dezelfde roosteroplossing, dus binnen
dezelfde band; de oude databasewaarden lagen daar 43–60% boven.

## 4. Knikkrommen — EN 1993-1-1 tabel 6.2

Afgeleid in code, niet overgetypt:

| doorsnede | voorwaarde | y-y | z-z |
|---|---|---|---|
| gewalst I/H | `h/b > 1,2` en `tf ≤ 40 mm` | a | b |
| gewalst I/H | `h/b > 1,2` en `40 < tf ≤ 100 mm` | b | c |
| gewalst I/H | `h/b ≤ 1,2` en `tf ≤ 100 mm` | b | c |
| gewalst I/H | `h/b ≤ 1,2` en `tf > 100 mm` | d | d |
| U-profiel | (regel "U-, T- en massieve doorsneden") | c | c |
| warmgewalste koker en buis | (regel "warmgewalst") | a | a |

Verdeling over de 316 nieuwe profielen: 271× a/a (kokers en buizen), 30× a/b
(HEA/HEB/HEM 340 en hoger, waar `h/b > 1,2`), 14× c/c (UPE), 1× b/c (HEM 320,
`h/b = 359/309 = 1,16 ≤ 1,2`).

Koudgevormde holle doorsneden zouden c/c krijgen; die staan niet in deze
database — alle koker- en buisreeksen hier zijn warmgewalst (EN 10210).

## 5. Validatie tegen de bestaande database

Alle 90 profielen die zowel in de brontabellen als in `profiles.json` staan zijn
opnieuw berekend en vergeleken op dertien grootheden. Gemiddelde absolute
afwijking per reeks:

| reeks | A | Iy | Iz | Wel;y | Wpl;y | Wpl;z | It | Iw |
|---|---|---|---|---|---|---|---|---|
| IPE | 0,11% | 0,05% | 0,11% | 0,09% | 0,11% | 0,08% | 1,11% | 0,43% |
| HEA | 0,09% | 0,05% | 0,08% | 0,10% | 0,11% | 0,12% | 1,70% | 0,10% |
| HEB | 0,08% | 0,03% | 0,08% | 0,10% | 0,13% | 0,14% | 1,19% | 0,10% |
| HEM | 0,13% | 0,05% | 0,07% | 0,09% | 0,26% | 1,02% | 0,73% | 0,07% |
| UNP | 2,08% | 2,93% | 14,37% | 2,90% | 3,00% | 23,43% | 26,45% | 67,31% |
| SHS | 2,48% | 1,91% | 1,91% | 1,82% | 1,98% | 1,98% | 2,80% | — |
| RHS | 2,77% | 17,41% | 16,07% | 17,43% | 15,18% | 14,08% | 15,43% | — |
| CHS | 0,09% | 5,31% | 5,31% | 5,27% | 5,23% | 5,23% | 5,34% | — |

**IPE/HEA/HEB/HEM (61 profielen) is het eigenlijke bewijs.** Die reeksen zijn
door de audit gecontroleerd en betrouwbaar. De generator reproduceert ze op
0,03–0,26% voor A, I, Wel en Wpl — dat is ruim binnen de afrondingsmarge van de
tabelwaarden zelf. It ligt op 0,7–1,7%, wat de te verwachten spreiding is van een
benaderingsformule voor de uitrondingsbijdrage.

Dat de HEM-torsieconstante nu op 0,73% uitkomt is een onafhankelijke bevestiging
van de parallelle correctieronde: die kalibreerde een regressie op alleen
IPE/HEA/HEB, dit spoor gebruikt een gesloten formule uit de literatuur. Per
profiel:

| HEM | 100 | 120 | 140 | 160 | 180 | 200 | 220 | 240 | 260 | 280 | 300 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| afw. It | −1,43% | −1,25% | −1,11% | −1,11% | −1,04% | −0,73% | −0,70% | −0,30% | +0,17% | −0,00% | +0,20% |

### De grote afwijkingen zitten in de database, niet in de generator

Waar generator en database uiteenlopen, wijzen twee **formulevrije** bovengrenzen
aan wie ongelijk heeft:

1. **Een doorsnede met afgeronde hoeken kan nooit stijver zijn dan dezelfde
   doorsnede met scherpe hoeken.** Bij een CHS is er niet eens een hoek: de
   ringformule is exact. **21 van de 26 holle doorsneden in `profiles.json`
   overschrijden die grens** — alle 12 CHS met +3,9% tot +7,9%, alle 6 RHS met
   +12,3% tot +23,7%, en 3 SHS. Voorbeeld: `RHS 250x150x8` heeft
   `Iy = 6,46·10⁷` terwijl de scherpe-hoek bovengrens `5,22·10⁷` is.
2. **Iw van een U-profiel is altijd kleiner dan `Iz·hs²/4`** (de waarde die een
   I-profiel met dezelfde Iz en flenshartafstand zou hebben). **12 van de 13
   U-profielen overschrijden die grens**; `UNP 200` staat op 36 700 cm⁶ terwijl
   de bovengrens 13 150 cm⁶ is en de exacte sectoriale integratie 10 499 cm⁶
   geeft.

De RHS-, CHS- en U-afwijkingen in de tabel hierboven zijn dus **geen fouten van
de generator**. De nieuwe profielen zijn hier bewust wél op de generator
gebaseerd.

De UNP-afwijking op A, Iy en Wpl;y (2–3%) heeft een andere oorzaak: de
**flensschuinte van 8%** wordt niet gemodelleerd (zie §7). Die verklaart ook de
14% op Iz — de schuinte haalt materiaal weg bij de flenstip, precies waar het
voor Iz het zwaarst telt.

### Eén knikkromme-afwijking

`HEA 400` staat in de database op b/c, maar heeft `h/b = 390/300 = 1,30 > 1,2` en
`tf = 19 ≤ 40 mm`, dus tabel 6.2 schrijft **a/b** voor. Dat is geen
formulekeuze-verschil: `HEB 400` (`h/b = 1,33`) staat in dezelfde database wél
correct op a/b. **`HEA 400` in `profiles.json` is een fout die apart gecorrigeerd
moet worden** — a/b is gunstiger dan b/c, dus de huidige waarde is conservatief
en niet onveilig.

## 6. De uitbreiding

316 nieuwe profielen. Geen enkele botst met een bestaande naam of lookup-sleutel,
en er zijn geen interne duplicaten. Naast de sleutelvergelijking (`lookup_key`
uit de Rust-crate: spaties, koppeltekens en punten eruit, hoofdletters) wordt ook
op **meetkundige vingerafdruk** ontdubbeld — soort plus hoofdmaten — zodat
naamvarianten als `CHS 273x10` en `CHS 273.0x10.0` elkaar niet dubbel opleveren.
96 kandidaten zijn daardoor overgeslagen.

| reeks | aantal | bereik |
|---|---|---|
| HEA | 9 | 450 t/m 1000 |
| HEB | 9 | 450 t/m 1000 |
| HEM | 13 | 320 t/m 1000 |
| UPE | 14 | 80 t/m 400 (nieuwe reeks, evenwijdige flenzen) |
| SHS | 87 | 40×40 t/m 400×400 |
| RHS | 106 | 50×30 t/m 500×300 |
| CHS | 78 | 33,7 t/m 508 mm |

### Zelfcontrole

Alle 316 profielen zijn gecontroleerd op:

- `iy = √(Iy/A)` en `iz = √(Iz/A)` (relatief < 10⁻⁶)
- `Wel;y = Iy/(h/2)`; `Wel;z = Iz/(b/2)` bij dubbelsymmetrie, en bij U-profielen
  expliciet **kleiner** dan `Iz/(b/2)` omdat daar de grootste randafstand geldt
- `Wpl ≥ Wel` op beide assen, met een vormfactor `Wpl;y/Wel;y ≤ 1,8`
- `0 < Av;z < A` en `0 < Av;y < A`
- A, Iy, Iz, It strikt positief; `Iw ≥ 0`
- `Iy ≥ Iz` zodra `h ≥ b`; `A ≤ h·b`
- gesloten doorsneden: `It > Iz`; open doorsneden: `It < Iy/5`
- **monotonie** binnen elke reeks (253 vergelijkingen): een grotere HEA/HEB/HEM/UPE
  is zwaarder en stijver dan de kleinere, en bij gelijke kokerbuitenmaat groeien
  A en Iy met de wanddikte

**Resultaat: 0 fouten, 0 waarschuwingen.**

Kruiscontrole van een steekproef nieuwe profielen tegen genormeerde
profieltabellen (EN 10365, DIN 1026-2, EN 10210-2): grootste absolute afwijking
op A, Iy, Iz en Wpl;y is **0,27%** over HEA 450/600/800/1000, HEB 450/500/700/1000,
HEM 400/600/1000, UPE 200/300, SHS 200×200×10, SHS 150×150×8, CHS 355,6×10 en
CHS 508×16.

## 7. Wat bewust NIET wordt berekend

| onderwerp | reden |
|---|---|
| **UNP wordt niet opnieuw gegenereerd** | De UNP-flens loopt met 8% schuinte toe. Het model hier is prismatisch en overschat daardoor Iz met ~14% en Wpl;z met ~23%. De bestaande UNP-regels blijven staan; ze worden alleen als validatie gebruikt. Wie UNP wil regenereren, moet eerst de schuinte modelleren. |
| **IPE wordt niet opnieuw gegenereerd** | De reeks is compleet (80–600) en de bestaande waarden zijn gecontroleerd. Opnieuw genereren zou alleen ruis in de derde decimaal toevoegen. |
| **Massa / oppervlaktegewicht** | Staat niet in het `SectionProperties`-contract van de Rust-crate. Volgt uit `A × 7850 kg/m³` als het ooit nodig is. |
| **Dwarskrachtcentrum van U-profielen** | Wordt intern wél berekend (voor Iw), maar er is geen veld voor in `SectionProperties`. Uitbreiden van dat contract is een aparte wijziging. |
| **Iw van kokers en buizen** | Op 0 gezet. Bij een gesloten doorsnede is de welvingsweerstand verwaarloosbaar naast de St.-Venanttorsie; EN 1993-1-1 gebruikt hem voor kokers niet. Bij een ronde buis is hij exact 0. |
| **Doorsnedeklasse (1 t/m 4)** | Hangt van de staalsoort af (via ε) en hoort dus niet in een staalsoort-onafhankelijke geometriedatabase. De classificatie-crate doet dat. |
| **Koudgevormde kokers (EN 10219)** | Andere hoekstralen (2t/1t) én andere knikkrommen (c/c in plaats van a/a). Aparte reeks, aparte naamgeving; niet meegenomen om verwarring met de warmgewalste reeks te voorkomen. |
| **Afronding** | Uitvoer op 6 significante cijfers. Fijner suggereert een precisie die de genormeerde basisgeometrie (op 0,1 mm) niet heeft. |

## 8. Openstaande punten voor de merge

1. **`HEA 400`** staat op b/c en moet a/b worden (tabel 6.2, `h/b = 1,30 > 1,2`,
   `tf = 19 ≤ 40 mm`). Huidige waarde is conservatief, niet onveilig.
2. **De 26 bestaande holle doorsneden** (SHS/RHS/CHS) hebben Iy-waarden die de
   scherpe-hoek bovengrens overschrijden — 21 van de 26, tot +23,7%. Die zijn
   **onveilig** (te stijf, te sterk) en zouden met dezelfde generator
   herberekend moeten worden. Dat is bewust buiten deze opdracht gelaten omdat
   `profiles.json` niet aangeraakt mocht worden.
3. **De 13 bestaande U-profielen** hebben Iw-waarden tot 3,5× te hoog en
   It-waarden ~45–60% te hoog. Te hoge Iw en It zijn **onveilig voor kip**.
   Zelfde advies: herberekenen, met eerst een model voor de UNP-flensschuinte.
4. Na de merge moet `design-mockup/scripts/genereer-staalprofielen.mjs` opnieuw
   draaien om de TS-tabellen bij te werken.

## 9. Script draaien

```
node scripts/genereer-profieldata.mjs --zelftests     # formulecontroles
node scripts/genereer-profieldata.mjs --valideer      # tegen profiles.json
node scripts/genereer-profieldata.mjs --schrijf       # uitbreiding schrijven
node scripts/genereer-profieldata.mjs                 # alles
```

Het script schrijft **nooit** in `profiles.json`.
