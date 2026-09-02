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
| ~~**UNP wordt niet opnieuw gegenereerd**~~ | *Achterhaald door §10.* De UNP-flens loopt met 8% schuinte toe; het oorspronkelijke model was prismatisch en overschatte daardoor Iz met ~14% en Wpl;z met ~23%. De schuinte is inmiddels gemodelleerd en UNP 80 t/m 300 zijn opnieuw gegenereerd. |
| **IPE wordt niet opnieuw gegenereerd** | De reeks is compleet (80–600) en de bestaande waarden zijn gecontroleerd. Opnieuw genereren zou alleen ruis in de derde decimaal toevoegen. |
| **Massa / oppervlaktegewicht** | Staat niet in het `SectionProperties`-contract van de Rust-crate. Volgt uit `A × 7850 kg/m³` als het ooit nodig is. |
| ~~**Dwarskrachtcentrum van U-profielen**~~ | *Achterhaald.* `SectionProperties` heeft sinds D4.1 `y_s_mm`/`z_s_mm`, en de motor uit §11 vult ze uit de sectoriale coördinaat. Het generatiescript schrijft ze nog niet in `profiles.json`; dat is een aparte wijziging. |
| **Iw van kokers en buizen** | Op 0 gezet. Bij een gesloten doorsnede is de welvingsweerstand verwaarloosbaar naast de St.-Venanttorsie; EN 1993-1-1 gebruikt hem voor kokers niet. Bij een ronde buis is hij exact 0. |
| **Doorsnedeklasse (1 t/m 4)** | Hangt van de staalsoort af (via ε) en hoort dus niet in een staalsoort-onafhankelijke geometriedatabase. De classificatie-crate doet dat. |
| **Koudgevormde kokers (EN 10219)** | Andere hoekstralen (2t/1t) én andere knikkrommen (c/c in plaats van a/a). Aparte reeks, aparte naamgeving; niet meegenomen om verwarring met de warmgewalste reeks te voorkomen. |
| **Afronding** | Uitvoer op 6 significante cijfers. Fijner suggereert een precisie die de genormeerde basisgeometrie (op 0,1 mm) niet heeft. |

## 8. Openstaande punten voor de merge

1. **`HEA 400`** staat op b/c en moet a/b worden (tabel 6.2, `h/b = 1,30 > 1,2`,
   `tf = 19 ≤ 40 mm`). Huidige waarde is conservatief, niet onveilig.
   *(Opgelost bij de merge van 5264a91.)*
2. **De 26 bestaande holle doorsneden** (SHS/RHS/CHS) hebben Iy-waarden die de
   scherpe-hoek bovengrens overschrijden — 21 van de 26, tot +23,7%. Die zijn
   **onveilig** (te stijf, te sterk) en zouden met dezelfde generator
   herberekend moeten worden. Dat is bewust buiten deze opdracht gelaten omdat
   `profiles.json` niet aangeraakt mocht worden. *(Opgelost in §10.)*
3. **De 13 bestaande U-profielen** hebben Iw-waarden tot 3,5× te hoog en
   It-waarden ~45–60% te hoog. Te hoge Iw en It zijn **onveilig voor kip**.
   Zelfde advies: herberekenen, met eerst een model voor de UNP-flensschuinte.
   *(Opgelost in §10.)*
4. Na de merge moet `design-mockup/scripts/genereer-staalprofielen.mjs` opnieuw
   draaien om de TS-tabellen bij te werken.

## 9. Script draaien

```
node scripts/genereer-profieldata.mjs --zelftests     # formulecontroles
node scripts/genereer-profieldata.mjs --valideer      # tegen profiles.json
node scripts/genereer-profieldata.mjs --schrijf       # uitbreiding schrijven
node scripts/genereer-profieldata.mjs --eindcontrole  # bovengrenzen op alle 416
node scripts/genereer-profieldata.mjs                 # alle bovenstaande

node scripts/genereer-profieldata.mjs --herstel       # ZIE §10 — schrijft data

node scripts/genereer-profieldata.mjs --motor-valideer # ZIE §11 — met de motor
node scripts/genereer-profieldata.mjs --motor-herstel  # ZIE §11 — schrijft data
```

Alleen `--herstel` en `--motor-herstel` schrijven in `profiles.json`, en dan
uitsluitend de profielen en grootheden uit §10 respectievelijk §11.4. De
vlagloze uitvoering doet dat **niet**, en draait ook de motorvlaggen niet: die
hebben een Rust-toolchain nodig en een halve minuut rekentijd.

---

## 10. Herstelronde 2026-09-02b — de 39 handmatig ingevoerde profielen

Punten 2 en 3 uit §8 zijn hiermee afgehandeld. De ronde raakt **precies 39 van
de 416 regels**; de andere 377 zijn byte-identiek gebleven (geverifieerd door
de records één voor één met `HEAD` te vergelijken). Knikkrommen zijn nergens
gewijzigd.

### 10.1 De bevindingen, onafhankelijk nagerekend

Beide bovengrenzen zijn met een apart script opnieuw gemeten voordat er iets
veranderde. De uitkomst is exact wat §5 meldde.

**Holle doorsneden — 21 van de 26 boven de scherpe-hoek bovengrens.** Een
doorsnede met afgeronde hoeken kan nooit meer traagheid hebben dan dezelfde met
scherpe hoeken; bij een CHS is er geen hoek en is `π(D⁴−(D−2t)⁴)/64` exact, dus
daar is elke overschrijding direct bewijs.

| profiel | Iy vóór | bovengrens | overschrijding |
|---|---|---|---|
| RHS 250x150x8 | 6,460·10⁷ | 5,224·10⁷ | **+23,7%** |
| RHS 300x200x10 | 1,440·10⁸ | 1,207·10⁸ | +19,3% |
| RHS 150x100x6 | 1,040·10⁷ | 8,853·10⁶ | +17,5% |
| RHS 100x50x4 | 1,690·10⁶ | 1,441·10⁶ | +17,3% |
| RHS 120x60x5 | 3,610·10⁶ | 3,094·10⁶ | +16,7% |
| RHS 200x100x8 | 2,590·10⁷ | 2,306·10⁷ | +12,3% |
| CHS 168.3x8.0 | 1,400·10⁷ | 1,297·10⁷ | +7,9% |
| CHS 219.1x10 | 3,870·10⁷ | 3,598·10⁷ | +7,6% |
| CHS 273x10 | 7,680·10⁷ | 7,154·10⁷ | +7,4% |
| CHS 139.7x8.0 | 7,660·10⁶ | 7,203·10⁶ | +6,4% |
| CHS 406.4x16 | 3,950·10⁸ | 3,745·10⁸ | +5,5% |
| CHS 48.3x3.2 | 1,220·10⁵ | 1,159·10⁵ | +5,3% |
| CHS 42.4x3.2 | 8,000·10⁴ | 7,620·10⁴ | +5,0% |
| CHS 60.3x4.0 | 2,950·10⁵ | 2,817·10⁵ | +4,7% |
| CHS 323.9x12.5 | 1,550·10⁸ | 1,485·10⁸ | +4,4% |
| CHS 114.3x6.3 | 3,260·10⁶ | 3,127·10⁶ | +4,3% |
| CHS 88.9x5.0 | 1,210·10⁶ | 1,164·10⁶ | +4,0% |
| CHS 76.1x5.0 | 7,370·10⁵ | 7,092·10⁵ | +3,9% |
| SHS 100x100x5 | 2,930·10⁶ | 2,866·10⁶ | +2,2% |
| SHS 120x120x5 | 5,180·10⁶ | 5,079·10⁶ | +2,0% |
| SHS 150x150x6 | 1,200·10⁷ | 1,197·10⁷ | +0,3% |

Dezelfde grens op Iz vangt bij de RHS — waar Iz een eigen waarde is — precies
dezelfde zes profielen, met +12,9% t/m +20,1%. En vijf CHS overschrijden de
grens zelfs op het **oppervlak** (tot +0,28%); bij een exacte ringformule kan
dat alleen als het getal fout is.

**U-profielen — 12 van de 13 boven de bovengrens `Iw ≤ Iz·hs²/4`** (`hs = h − tf`):

| profiel | Iw vóór | bovengrens | factor |
|---|---|---|---|
| UNP 80 | 1,120·10⁹ | 2,514·10⁸ | **4,45×** |
| UNP 100 | 2,520·10⁹ | 6,133·10⁸ | 4,11× |
| UNP 120 | 4,950·10⁹ | 1,331·10⁹ | 3,72× |
| UNP 140 | 9,120·10⁹ | 2,649·10⁹ | 3,44× |
| UNP 160 | 1,540·10¹⁰ | 4,766·10⁹ | 3,23× |
| UNP 180 | 2,430·10¹⁰ | 8,140·10⁹ | 2,99× |
| UNP 200 | 3,670·10¹⁰ | 1,315·10¹⁰ | 2,79× |
| UNP 220 | 5,550·10¹⁰ | 2,121·10¹⁰ | 2,62× |
| UNP 240 | 7,900·10¹⁰ | 3,195·10¹⁰ | 2,47× |
| UNP 260 | 1,090·10¹¹ | 4,796·10¹⁰ | 2,27× |
| UNP 280 | 1,480·10¹¹ | 7,005·10¹⁰ | 2,11× |
| UNP 300 | 2,000·10¹¹ | 9,981·10¹⁰ | 2,00× |

`UNP350` bleef als enige onder de grens.

### 10.2 De flensschuinte van UNP, eindelijk gemodelleerd

De UNP-flens loopt met **8% schuinte** toe (DIN 1026-1). Het model beschrijft de
bovenhelft als vier stukken, met z gemeten vanaf de lijfrug:

```
z ∈ [0, tw]         lijf, materiaal vanaf y = 0
z ∈ [tw, ztan1]     walsuitronding r1  (middelpunt in de HOLTE)
z ∈ [ztan1, ztan2]  schuin flensbinnenvlak  y = a + s·z,  s = 0,08
z ∈ [ztan2, b]      flenstipafronding r2 = r1/2  (middelpunt in het MATERIAAL)
```

Het flens**buiten**vlak blijft vlak op `y = h/2`. De vijf benodigde momenten
(A, Sz, Izz, Iyy en het statisch moment voor Wpl;y) worden over die vier stukken
geïntegreerd, met de bogen in **hoekparameter** zodat de wortelsingulariteit aan
de boograndan verdwijnt.

**Waar wordt tf gemeten?** Dat is de enige vrije parameter, en hij is niet
geraden maar opgelost: per profiel is bepaald welke meetpositie het tabel-A
exact reproduceert. Voor de hele reeks UNP 80–300 komt daar `0,492 b` tot
`0,511 b` uit, gemiddeld `0,501 b`. De conventie is dus **`tf` op halve
flensbreedte, `z = b/2` vanaf de lijfrug** — dezelfde regel als bij de andere
DIN-walsprofielen met schuine flens, waar `t` op het midden van de flensuitkraging
wordt gemeten. Met de voor de hand liggende alternatieve keuze `z = (b+tw)/2`
blijft er 1,2–2,6% staan.

Resultaat tegen de genormeerde tabelwaarden (DIN 1026-1), met `e` het
zwaartepunt vanaf de lijfrug:

| | A | Iy | Iz | e |
|---|---|---|---|---|
| prismatisch model (oud) | 2,08% | 2,93% | 14,37% | — |
| **met 8% schuinte** | **≤ 0,29%** | **≤ 0,29%** | **≤ 0,44%** | **≤ 0,44%** |

gemeten over de volle reeks UNP 80 t/m 300; UNP 80, 140, 200 en 300 zitten als
harde zelftest in het script. `Wpl;z` verschuift daardoor +8% tot +14% naar de
tabelwaarde toe (UNP 200: 46 400 → 51 958 mm³, tabel 51,8 cm³).

### 10.3 Iw van een UNP: de gesloten kanaalformule is hier níét exact

De gesloten formule uit §3 komt op **0,00%** overeen met een directe
sectoriale-oppervlakintegratie — dat is opnieuw bevestigd, inclusief het
dwarskrachtcentrum van UNP 200 op **26,63 mm** vanaf het lijfhart en
`Iw = 10 499 cm⁶`. Maar die overeenstemming geldt voor een **prismatische**
middellijn. Zodra dezelfde sectoriale integratie over de **schuine** middellijn
loopt — dikte `t(z) = tf + s·(b/2 − z)`, flensmiddellijn `y = ±(h/2 − t(z)/2)` —
valt Iw over de hele reeks **12,5% tot 14,4% lager** uit. Dat is geen ruis: het
sectoriale oppervlak is juist bij de flenstip het grootst, en daar is de flens
het dunst.

Voor UNP wordt daarom de **schuine** sectoriale waarde gebruikt. Drie
onafhankelijke aanwijzingen dat dat de juiste is:

- De uitkomst valt samen met de welvingsconstanten in de gepubliceerde
  UPN-profieltabellen: UNP 200 op **9 066 cm⁶** tegen 9,07·10³ cm⁶ (0,07%),
  UNP 300 op **68 984 cm⁶** tegen 69,1·10³ cm⁶ (0,2%). De prismatische formule
  geeft daar 10 499 resp. 78 943 cm⁶ — 15,8% resp. 14,3% te hoog. Twee treffers
  op 0,2% zijn geen toeval; de prismatische waarde mist ze allebei ruim.
- Lagere Iw is **conservatief** voor kip; de andere kant op zou de fout die deze
  ronde herstelt gedeeltelijk terugzetten.
- Beide waarden blijven ruim onder de formulevrije bovengrens `Iz·hs²/4`.

**UPE blijft ongewijzigd op de gesloten formule.** Die reeks heeft evenwijdige
flenzen; daar ís de formule exact, en de 14 UPE-regels uit de vorige ronde zijn
niet aangeraakt (validatie: 0,00% op alle grootheden).

### 10.4 It van UNP

Gecorrigeerd met dezelfde El Darwish & Johnston-formule als in §3, met de
gehalveerde uitrondings- en flenstiptermen voor een U-doorsnede. De waarden
dalen 20% (UNP 80) tot 35% (UNP 300); dat is de tegenhanger van de 43–60%
overschatting die §3 tegen de numerieke Prandtl-oplossing vaststelde.

**Restonzekerheid, eerlijk benoemd:** tegen de DIN 1026-1 tabelwaarden ligt de
formule nu nog **8–10% te hoog** (UNP 80: 23 538 vs 21 600 mm⁴; UNP 300:
408 553 vs 374 000 mm⁴). Dat is dezelfde systematische kant op als bij de
I-profielen (§3: 5,7–6,4% boven de roosteroplossing) en dus formule-eigen, geen
invoerfout. Het is een **onveilige** restafwijking van ~9% op It, tegenover de
43–60% die zij vervangt.

### 10.5 Kokers en buizen

Alle 26 zijn herberekend met `berekenKoker` / `berekenBuis` uit §3 —
buitenhoekstraal 1,5·t, binnenhoekstraal 1,0·t (EN 10210-2). De geometrie-
sleutel `r` stond bij de 13 SHS/RHS op `t` (de *binnen*straal); die staat nu op
de buitenstraal 1,5·t, zodat het record intern klopt met de gebruikte meetkunde.
De sleutelsets van alle geometrie-objecten zijn ongewijzigd gelaten, ook waar de
oude regels alleen `t` en geen `tw`/`tf` hadden.

Spotcheck tegen EN 10210-2 na herstel: `SHS 250x250x10` A = 94,9 cm²,
`RHS 250x150x8` A = 60,8 cm² en Iy = 5100 cm⁴, `CHS 406.4x16` op de exacte
ringformule — alle binnen 0,25%.

Onafhankelijke bevestiging van buiten de generator: `HFRHS200X200X16`
(= SHS 200×200×16) komt na herberekening op A = 11 501,3 mm², Wpl;y = 785 472 mm³
en Av;z = 5750,65 mm². De externe referentie-berekening waar de acceptatietest
op geijkt is noemt **11 501,3 / 785 442 / 5751** — drie treffers binnen 0,004%,
op waarden die vóór deze ronde 1,9%, 2,2% en 1,9% te laag stonden. De twee
`TODO Phase 13`-punten in die test zijn daarmee opgelost.

### 10.6 Wat NIET is aangeraakt

| onderwerp | reden |
|---|---|
| **A, Iy, Iz, Wel, Wpl en Av van `UNP350`** | Het schuinte-model komt daar niet binnen 0,5%: tegen de DIN-tabel wijkt het −1,4% (A), −2,0% (Iy) en −6,3% (Iz) af, tegen de databasewaarden −0,5% / −0,9% / −4,7%. UNP 350 en 400 zijn de twee zwaarste maten waar b níét meegroeit; hun tabelwaarden volgen `z = (b+tw)/2` in plaats van `b/2`. Bovendien zijn A, Wpl;y en Av;z van `UNP350` op een externe referentie-berekening geijkt — en de generator reproduceert die Av;z onafhankelijk op 4945,7 tegen 4946 mm². Alleen It en Iw zijn vervangen. |
| **Knikkrommen** | Nergens gewijzigd. `HFRHS200X200X16` staat op c/c terwijl het een warmgewalste holle doorsnede is en tabel 6.2 dan a/a voorschrijft; c/c is conservatief, dus dat is een aparte, niet-urgente correctie. |
| **Afronding van de overige 61 handmatig ingevoerde I-profielen** | Acht daarvan (IPE 160/180/400, HEA 120/280, HEB 260/280, HEM 220) hebben `Wel;y ≠ Iy/(h/2)` met 0,2–0,5% verschil. Dat is puur het gevolg van opslag op drie significante cijfers, geen rekenfout, en valt buiten deze ronde. |

### 10.7 UC-impact

Drie gevallen, S235, γ_M0 = γ_M1 = 1,0, belasting vastgehouden:

| geval | grootheid | vóór | ná | UC vóór | UC ná |
|---|---|---|---|---|---|
| RHS 250x150x8, ligger 6,0 m, M_Ed = 130 kNm | Wpl;y | 618 000 mm³ | 500 634 mm³ | **0,895** | **1,105** |
| CHS 219.1x10, kolom Lcr = 8,0 m, kromme a | Iy → N_b,Rd | 909,6 kN | 866,9 kN | 0,880 | 0,923 |
| UNP 200, ligger 4,0 m, kip (C1 = 1,0, kromme c), M_Ed = 40 kNm | It, Iw → M_b,Rd | 31,0 kNm | 26,8 kNm | **1,289** | **1,490** |

De RHS-ligger is het scherpste geval: die ging van "voldoet ruim" naar
"voldoet niet" — de fout maskeerde een overschrijding van 10%. Bij de CHS-kolom
daalt N_cr met 7,0% ongeacht de lengte; het effect op de UC loopt van +0,8%
(Lcr = 4 m) via +2,5% (6 m) tot +4,9% (8 m). Bij de UNP-ligger stijgt de kip-UC
15,6%.

Voor `UNP350` gaat het de andere kant op: It stijgt 4,6% (605 000 → 632 878 mm⁴,
omdat de El Darwish & Johnston-formule nu op de hele reeks wordt toegepast) en
Iw daalt 4,4%. Netto stijgt M_cr bij 5,0 m met 1,6% en χ_LT met 1,0% — een kleine
**onveilige** verschuiving, die binnen de eigen bandbreedte van de It-formule
valt en die de acceptatietest van de portaalligger niet op zijn
referentie-geijkte waarden raakt (A, Wpl;y en Av;z blijven gelijk).

### 10.8 Wat er in de Rust-tests is bijgesteld

Twee acceptatietests raken profielen uit de herstelset. Beide zijn met
norm-onderbouwing bijgewerkt; op het referentie-rapport geijkte verwachtingen
zijn **niet** aangeraakt.

**`calc2_beam3.rs` (HFRHS200X200X16).** De drie verwachtingen stonden expliciet
op de *databasewaarden* met een `TODO Phase 13` erbij, omdat die 1,9–2,2% naast
de referentie lagen. Ze staan nu op de referentiewaarden zelf:
`N_c,Rd` 2650,8 → **2702,81 kN** (referentie 2702,808), `M_y,c,Rd` 180,48 →
**184,586 kNm** (referentie 184,579) en `V_c,z,Rd` 765,2 → **780,23 kN**
(referentie 780,2). De UC van de drukstaaftoets stond op de afgeronde
referentiewaarde 0,02 met 10% marge; die is vervangen door de exacte
`48,329 / 2702,808 = 0,01788`, want die marge werd te krap zodra we de
referentie precies raakten. De doorsnede blijft NotOk en de maatgevende toets
blijft 6.2.5. De snapshot verschuift mee: `uc_max` 1,0379 → 1,0148.

**`portal_beam1.rs` (UNP350).** Alleen de snapshot verschuift, via It en Iw:
`M_cr` 200,00 → 203,54 kNm, `χ_LT` 0,6255 → 0,6309, `M_b,Rd` 130,80 → 131,92 kNm,
`uc_max` 1,4893 → 1,4766. `N_c,Rd`, `M_y,c,Rd` en `V_c,z,Rd` zijn ongewijzigd en
worden nog steeds afgedwongen. De vijf overige snapshots (HEB160/HEB300) zijn
inhoudelijk niet veranderd en zijn dus ook niet aangeraakt.

### 10.9 Eindcontrole

`node scripts/genereer-profieldata.mjs --eindcontrole` over alle **416**
profielen — scherpe-hoek bovengrens op A, Iy en Iz voor 297 holle doorsneden,
`Iw ≤ Iz·hs²/4` voor 27 U-profielen, en op alle 416 `iy = √(Iy/A)`,
`iz = √(Iz/A)`, `Wel;y = Iy/(h/2)`, `Wpl ≥ Wel`, `0 < Av < A` en A/Iy/Iz/It > 0:

> **NUL overschrijdingen.**

De validatie tegen de generator (`--valideer`) staat na het herstel voor
SHS, RHS, CHS en UPE op **0,00%** over alle grootheden, en voor UNP op 0,04% (A),
0,07% (Iy) en 0,36% (Iz; dat laatste vrijwel volledig `UNP350`, dat bewust is
blijven staan).

---

## 11. De exacte motor — 2026-09-02c

Alles in §1 t/m §10 rekent met **gesloten formules in JavaScript**. Dat werkte,
maar het had twee gebreken die niet met betere formules op te lossen waren:

1. Het was een **tweede implementatie** naast de Rust-crate die de app zelf
   gebruikt. Twee bronnen voor hetzelfde getal is één te veel.
2. Voor `It` van een gewalst profiel *bestaat* geen gesloten formule. §10.4
   moest daarom eindigen met de eerlijke mededeling dat er ~9% onveilige
   restafwijking bleef staan op de U-reeks. Een tabel raadplegen kan ook niet:
   voor een samengestelde of afwijkende doorsnede is er geen tabel.

Vanaf nu levert de motor in `crates/section-properties` de waarden. Eén ingang,
`motor::bereken`, die uit geometrie een volledig gevulde `SectionProperties`
maakt — voor een catalogusprofiel én voor een zelf opgebouwde contour.

### 11.1 Drie soorten waarheid, uit elkaar gehouden

De hele winst van deze ronde zit in het **onderscheiden** van wat exact is, wat
convergent is en wat een normkeuze is. Dat was eerder één ononderscheiden brij
van "formules".

| kern | grootheden | status |
|---|---|---|
| `contour.rs` | `A`, `y_c`/`z_c`, `Iy`, `Iz`, `Iyz`, `Iu`/`Iv`, `α`, `Wel` per vezel, `Wpl;y`, `Wpl;z`, `i_y`, `i_z` | **exact** |
| `torsie.rs` | `It`, `Iw`, schuifmiddelpunt | **numeriek convergent** |
| `motor.rs` | `Av;y`, `Av;z` | **normbepaald** |

**Exact** betekent hier niet "heel nauwkeurig" maar letterlijk exact tot
machineprecisie. Een doorsnede is een verzameling gesloten randen van rechte
lijnen en cirkelbogen; met de stelling van Green wordt elke oppervlakte-integraal
een randintegraal, en die heeft per segmenttype een gesloten primitieve. Er
wordt nergens gediscretiseerd. `Wpl` hoort daar ook bij: de neutrale as wordt
met bisectie tot machineprecisie gezocht, maar het statisch moment eromheen
volgt weer uit een gesloten randintegraal — de contour hoeft nooit *geknipt*.

Het bewijs staat in de crate zelf: rechthoek, cirkel uit vier bogen, ring,
driehoek, L-vorm tegen de handberekening, `Wpl` om de diagonaal van een
vierkant — alle op `< 1e-12` relatieve fout. En op de 90 CHS, waar A, Iy, Wel en
Wpl allemaal in gesloten vorm bekend zijn, reproduceert de motor élke grootheid
tot 5·10⁻⁶ relatief.

**Numeriek convergent** betekent: er wordt een randwaardeprobleem over het
*inwendige* opgelost (Prandtl voor `It`, de sectoriale coördinaat voor `Iw`),
met lineaire driehoekselementen. Er hoort dus een foutmaat bij, en die is er:

- `It` komt uit **twee** onafhankelijke formuleringen. De Prandtl-vorm is een
  gegarandeerde *onder*grens, de welvingsvorm een gegarandeerde *boven*grens.
  De motor geeft beide terug plus het midden; de halve bandbreedte is over de
  hele catalogus mediaan 0,03% en hoogstens 1,15%.
- Verfijnen bevestigt dat. Bij drie keer zo fijn meshen verschuift `It` ten
  hoogste 0,18% en `Iw` ten hoogste 0,12%:

  | profiel | `It` bij h → h/3 | `Iw` bij h → h/3 |
  |---|---|---|
  | UPE 80 | +0,174% | +0,006% |
  | UNP 80 | +0,155% | +0,106% |
  | HEM 100 | −0,026% | +0,120% |
  | IPE 600 | +0,117% | +0,006% |
  | HEA 1000 | +0,126% | +0,006% |

  Dat is een orde kleiner dan de 4,6–12,0% die deze ronde corrigeert. De drift
  is bovendien vrijwel overal positief: de standaardmesh ligt iets te laag, dus
  aan de veilige kant.
- De ronde buis is de sluitsteen: daar is `It = 2·I` exact bekend, en de motor
  komt op alle 90 CHS binnen 0,02% uit.

**Normbepaald** is alleen `Av;y` / `Av;z`. Dat is géén meetkundige grootheid:
EN 1993-1-1 §6.2.6(3) geeft per doorsnedesoort een aparte uitdrukking met een
ondergrens `η·h_w·t_w`, en `η = 1,0` is de waarde die de Nederlandse nationale
bijlage toelaat. De motor rekent die regel door met het *gemeten* oppervlak,
maar de regel zelf komt uit de norm en staat daarom apart benoemd in
`motor.rs` — niet vermomd als geometrie.

**Wat óók normbepaald blijft en dus buiten de motor valt:** de knikkrommen
(tabel 6.2 — een keuze op grond van h/b, `tf` en het walsproces, geen
berekening) en de doorsnedeklasse 1 t/m 4 (hangt van de staalsoort af via ε en
hoort dus niet in een staalsoort-onafhankelijke geometriedatabase).

### 11.2 Twee meetkundemodellen die ontbraken

Voordat de motor de database kón leveren, moesten er twee vormen bij. Beide
waren geen rekenfout maar een **ontbrekend model**, en dat is een belangrijk
onderscheid: de motorkern zelf bleek op elk toetsbaar geval exact.

**De binnenhoekstraal van een koker.** `contour::koker()` leidde de
binnenstraal af als `r_o − t`, dus een concentrische wand van overal dikte `t`.
De catalogusconventie (EN 10210-2) is `r_o = 1,5·t` **met** `r_i = 1,0·t` —
niet-concentrisch, de wand is in de hoek dus dikker. Dat scheelt tot 2,6% op A.
Onderbouwing die op geen van beide bronnen leunt: de seed `HFRHS200X200X16`,
geijkt op een externe referentie-berekening, heeft `A = 11 501,30 mm²`; het
normmodel geeft 11 501,31 mm² (0,01 mm² ernaast), het concentrische model
11 336,50 mm² (1,43% lager). Nieuw: `contour::koker_en10210()`, met
`koker_met_stralen()` eronder voor wie beide stralen vrij wil kiezen. De oude
`koker()` blijft bestaan voor de meetkundig zuivere koker, nu expliciet als
zodanig gedocumenteerd.

**De flensschuinte van UNP.** `contour::u_profiel()` kende alleen evenwijdige
flenzen, waardoor de 13 UNP's als een zwaarder profiel werden gerekend (A +2,0
tot +2,6%, Iz +13,5 tot +15,8%). Nieuw: `contour::u_profiel_schuin()` en de
catalogusingang `contour::unp()`, met precies de meetkunde uit §10.2 maar dan
als **exacte contour** in plaats van een numerieke integratie over 60 000
stroken: twee vlakke flensbuitenvlakken, het schuine binnenvlak, de
walsuitronding `r1` met middelpunt in de holte en de flenstipafronding
`r2 = r1/2` met middelpunt in het materiaal. Alle raakpunten volgen in gesloten
vorm uit `k = √(1+s²)`; de afleiding staat in de doc-comment.

### 11.3 Resultaat: de motor reproduceert de database

`node scripts/genereer-profieldata.mjs --motor-valideer` rekent alle 416
profielen opnieuw door (27,5 s rekentijd, 39 s wandklok) en vergelijkt met
`profiles.json`. Afwijking = (motor − database)/database.

| grootheid | mediaan | gemiddeld | maximum |
|---|---|---|---|
| `A` | 0,000% | 0,016% | 0,545% (UNP350) |
| `Iy` | 0,000% | 0,009% | 0,902% (UNP350) |
| `Iz` | 0,000% | 0,024% | 4,729% (UNP350) |
| `Wel;y` | 0,000% | 0,017% | 0,902% (UNP350) |
| `Wel;z` | 0,000% | 0,028% | 5,410% (UNP350) |
| `Wpl;y` | 0,000% | 0,022% | 0,778% (UNP350) |
| `Wpl;z` | 0,000% | 0,048% | 3,380% (UNP350) |
| `Av;y` | 0,000% | 0,000% | 0,000% |
| `Av;z` | 0,000% | 0,042% | 1,436% (HEA 300) |
| `i_y` | 0,000% | 0,009% | 0,225% (HEA 300) |
| `i_z` | 0,000% | 0,015% | 1,991% (UNP350) |

Elke geometrische grootheid staat op **mediaan 0,000%**, en het enige profiel
dat er noemenswaardig uit springt is `UNP350` — dat is bekend en gewild: zijn
A, Wpl;y en Av;z komen uit een externe referentie-berekening en niet uit het
DIN-model (§10.4, §11.4 laat die waarden dan ook staan). Meshkwaliteit over de
hele reeks: `|A_mesh − A_exact|` hoogstens 0,043%, kleinste driehoekshoek 21,2°.

Daarmee is de motor niet langer een controlemiddel maar een **bron**: hij kan
de database genereren.

### 11.4 Wat is overgenomen, en wat níét

De regel is streng: de motor overschrijft alleen waar aantoonbaar is dat hij
het beter weet. Waar de database een genormeerde tabelwaarde bevat die een
geometriemodel niet kan verbeteren, wint de database. De lijst staat als
`MOTOR_OVERNAME` in het script en wordt door `--motor-herstel` uitgevoerd:
119 profielen, 119 waarden, geen enkel ander veld aangeraakt.

**Wél overgenomen — `It` van alle 27 U-profielen** (−4,57% tot −11,96%).
De database gebruikte de empirische benadering met gehalveerde termen; die ligt
op elk van de 27 boven de **bewezen bovengrens** van de motor, en te hoge `It`
overschat `M_cr` en dus de kipcapaciteit. De doorslag geeft een derde bron die
noch de motor noch de generator is: de DIN 1026-1 tabelwaarden uit §10.4.

| | DIN-tabel | oude formule | motor |
|---|---|---|---|
| UNP 80 | 21 600 mm⁴ | 23 538 (+9,0%) | 21 519 (**−0,37%**) |
| UNP 300 | 374 000 mm⁴ | 408 553 (+9,2%) | 379 641 (**+1,51%**) |

De motor landt binnen 1,5% van de gepubliceerde tabel waar de formule er 9%
boven zat. Daarmee is de restafwijking die §10.4 eerlijk open moest laten
staan, gesloten.

**Wél overgenomen — `Iw` van alle 92 I-profielen** (−1,10% tot −5,59%; 46 ervan
meer dan 2%). De database had `Iw` exact gelijkgesteld aan `Iz·h_s²/4`, met
`Iz` inclusief lijf en uitrondingen. Dat is aantoonbaar een **bovengrens**: hij
wordt alleen gehaald door een doorsnede die haar hele `Iz` in de
flensmiddenvlakken heeft. Lijf- en uitrondingsmateriaal telt wél mee in `Iz`
maar nauwelijks in het sectoriale moment, dus elk echt I-profiel ligt eronder —
en de afwijking is het grootst bij de gedrongen profielen met een zwaar lijf
(HEM 100: −5,59%; HEA 100: −4,61%), precies zoals dat argument voorspelt.

**Niet overgenomen — `It` van de 207 kokers** (motor 0,85% tot 8,25% *hoger*).
De database gebruikt Bredt (`4A_m²t/U_m`), een dunwandige benadering. Bij een
dikwandige koker als RHS 80×40×8 (`t/b = 0,2`) is die benadering slecht, en de
motor is daar vermoedelijk het betere getal. Maar Bredt ligt **lager**, en een
te lage `It` is conservatief voor kip. Overnemen zou capaciteit toevoegen op
grond van een getal dat in deze ronde niet zelfstandig tegen een derde bron is
geijkt. Dat is een aparte beslissing; hij staat hier genoteerd, niet genomen.

**Niet overgenomen — `It` van de 92 I-profielen** (−3,98% tot +1,86%, mediaan
+0,10%). Er is hier geen winnaar aan te wijzen: het verschil is van dezelfde
orde als de eigen insluiting van de motor (tot 1,15% halve bandbreedte) en als
de spreiding van de El Darwish & Johnston-benadering zelf. Beslissend is dat de
database hier **op het referentierapport is geijkt**: `HEA 320` staat op
`It = 1 084 313 mm⁴` en de motor komt op 1 086 726 — 0,22% ernaast, ruim binnen
zijn eigen band. De geijkte waarde blijft dus staan.

**Niet overgenomen — `It` van de 90 CHS** (−0,02%). De opgeslagen waarde is
`2·I`, wat voor een ronde buis exact is. De motor bevestigt dat en heeft niets
toe te voegen.

**Niet overgenomen — `Iw` van de 27 U-profielen** (UNP −1,45% tot +0,90%,
UPE +1,01% tot +4,92%). Bij UNP zijn beide bronnen het binnen 1,5% eens, en de
databasewaarde is in §10.3 onafhankelijk geijkt op de gepubliceerde
UPN-profieltabellen (UNP 200 op 0,07%, UNP 300 op 0,2%) — die corroboratie is
sterker dan wat de motor eraan toevoegt. Bij UPE ligt de motor *hoger*, dus
overnemen zou capaciteit toevoegen; ook daar wint de gesloten kanaalformule,
die voor evenwijdige flenzen exact is.

### 11.5 Eén rekenkern, ook voor samengestelde doorsneden

`composite.rs` (de lamellenkern uit D4.1) had zijn eigen polygoonintegralen en
zijn eigen halfvlak-clipping voor `Wpl`. Die zijn verwijderd: elke lamel gaat nu
als vierhoekige contour naar `contour.rs`, en `A`, het zwaartepunt, `Iy`, `Iz`,
`Iyz` en `Wpl` komen daar exact uit terug. Twee implementaties van dezelfde
integraal is één te veel, ook als ze allebei kloppen.

Wat de contourkern **niet** kan overnemen, en waarom:

- **Catalogusdelen.** Een `CatalogusDeel` is een verzameling grootheden, geen
  contour — er is geen rand om langs te integreren. Die tellen met Steiner op,
  en juist daarom is `Wpl` niet bepaald zodra er een deel in zit: je kunt een
  deel niet op de plastische neutrale as doorsnijden als je zijn vorm niet kent.
- **`It` en `Iw` van een lamellenmodel.** Daar zijn `⅓Σbt³`, Bredt en de
  sectoriële methode de gangbare en snelle weg. Wie de numerieke waarde wil,
  voert de contour rechtstreeks in `motor::bereken_doorsnede`.

De tien acceptatietests van `tests/samengesteld.rs` en alle tests van
`composite.rs` slagen ongewijzigd, met dezelfde getallen — wat bevestigt dat de
twee implementaties inderdaad hetzelfde deden.

### 11.6 De motor draaien

De motor is als los binair bestand beschikbaar dat JSON in en JSON uit doet,
zodat het generatiescript zijn geometrietabellen kan blijven beheren zonder de
formules te dupliceren. Eén waarheid, twee rollen: geometrie in het script,
rekenwerk in de crate.

```
cargo run -q -p section-properties --bin doorsnedemotor -- invoer.json uitvoer.json

node scripts/genereer-profieldata.mjs --motor-valideer  # meet, schrijft niets
node scripts/genereer-profieldata.mjs --motor-herstel   # ZIE 11.4 - schrijft data
```

`--motor-herstel` bouwt de motor eerst opnieuw als de Rust-bron nieuwer is dan
het binaire bestand; met een verouderde motor de database vullen kan dus niet.
Naast de grootheden geeft de uitvoer per profiel de diagnostiek mee waarmee je
het getal kunt *wantrouwen*: de onder- en bovengrens van `It`, het meshoppervlak
tegenover het exacte oppervlak, het aantal driehoeken en de rekentijd.

### 11.7 Gevolg voor de toetsing

`Iw` gaat **niet** de toetsketen in: de kipcontrole gebruikt de NB-annex, die
`I_w` uit `h`, `b` en `t_f` afleidt (`nb_annex::i_w_nb`) en verder alleen `Iz`
en `It` uit de database haalt. De 92 gewijzigde `Iw`-waarden veranderen dus
alleen wat er in het rapport staat.

`It` van UNP350 gaat er wél in. In `portal_beam1` (de enige acceptatietest met
een U-profiel) verschuift daardoor het volgende:

| | vóór | ná | verschil |
|---|---|---|---|
| `I_t` | 632 878 mm⁴ | 603 930 mm⁴ | −4,57% |
| `S` | 839,66 mm | 859,55 mm | +2,37% |
| `C` | 5,9277 | 5,9586 | +0,52% |
| `M_cr` | 203,539 kNm | 199,865 kNm | −1,81% |
| `λ̄_LT` | 1,01355 | 1,02283 | +0,92% |
| `χ_LT` | 0,630909 | 0,625325 | −0,89% |
| UC 6.3.2 kip | 1,47663 | 1,48981 | +0,89% |
| UC 6.3.3 (6.61) | 0,899683 | 0,907615 | +0,88% |
| UC 6.3.3 (6.62) | 0,583928 | 0,588687 | +0,81% |
| `uc_max` | 1,47663 | 1,48981 | +0,89% |

Alle unity checks bewegen **omhoog** — dat is de veilige kant, en het is precies
wat een lagere `It` hoort te doen. De ligger blijft NotOk op kip.

**De op het referentie-rapport geijkte waarden veranderen niet.**
`N_c,Rd = 1801,44 kN`, `M_y,c,Rd = 209,094 kNm` en `V_c,z,Rd = 671,06 kN` hangen
niet van `It` af; die assertions staan onveranderd en slagen nog steeds. Ook
`referentie_hea.rs` (HEA 320 / HEA 400, inclusief hun `It`) is ongewijzigd en
slaagt.

De snapshot `portal_beam1__portal_beam1.snap` is **bewust niet bijgewerkt**:
een op het referentierapport geijkte verwachting hoort niet stilzwijgend mee te
schuiven met een databasewijziging. De getallen hierboven zijn gemeten; wie de
verschuiving accepteert, doet dat expliciet met `cargo insta review`.
