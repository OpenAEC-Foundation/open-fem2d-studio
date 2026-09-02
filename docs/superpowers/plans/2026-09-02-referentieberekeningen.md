# Werkdossier referentieberekeningen — validatiecampagne Open FEM2D Studio

Opgesteld: 2026-09-02
Status: verzameling afgerond, narekenen nog niet gestart

---

## 1. Doel en werkwijze

### 1.1 Wat dit dossier is

Dit is het werkdossier voor de validatiecampagne. Het bevat gepubliceerde 2D-constructies
met bekende uitkomsten, die stuk voor stuk in Open FEM2D Studio worden nagebouwd en
doorgerekend. De uitkomsten van de app worden naast de referentiewaarde gelegd.

Elk geval heeft een kenmerk (R01, R02, ...). De zwakkere gevallen staan apart onder
Z1 t/m Z4 (hoofdstuk 9) en tellen niet mee als volwaardige referentie.

### 1.2 Het proces per geval

1. **Nabouwen** — geometrie, opleggingen, profielen/materiaal en belastingen invoeren
   precies zoals in de invoerparagraaf van het geval staat. Aannames die daarbij nodig
   zijn, staan bij het geval genoemd; alleen die aannames mogen gebruikt worden.
2. **Opslaan** — model opslaan onder het kenmerk, voorstel:
   `docs/validatie/modellen/R01_<korte-naam>.json`. Het model is daarmee herhaalbaar
   en kan bij een solverwijziging opnieuw gedraaid worden.
3. **Doorrekenen** — eerste orde tenzij het geval anders vermeldt. Bij toetsgevallen ook
   de EN 1993-1-1 / EN 1995-1-1 module draaien met de nationale bijlage die de bron
   gebruikt (zie het NB-veld per geval).
4. **Vergelijken** — de tabel "Te vergelijken grootheden" invullen: onze waarde, het
   verschil (absoluut en relatief) en een status.
5. **Uitzoeken** — elk verschil boven de tolerantie wordt onderzocht, met een genoteerde
   conclusie. Een verschil is **niet** automatisch onze fout.

### 1.3 Hoe een verschil wordt beoordeeld

Een afwijking kan vier oorzaken hebben. De campagne is pas nuttig als per geval expliciet
wordt vastgelegd wélke van de vier het is:

| Code | Oorzaak | Wat het betekent |
|---|---|---|
| `ONS` | Fout in onze solver, adapter, toetsmodule of eenhedenconversie | Bug, moet gefixt worden; leg vast met een minimale reproductie |
| `BRON` | Fout, zetfout of interne inconsistentie in de bron | Vastleggen met de tegenstrijdigheid; referentie waar nodig degraderen |
| `NB` | Andere nationale bijlage of andere aanbevolen waarde | Geen fout; wel documenteren welke NB-keuze het verschil verklaart |
| `AANNAME` | Verschil in modelaanname (lijnlast op projectie vs. staaflengte, wel/geen normaalkrachtvervorming, eigen gewicht, taps toelopende voute) | Aanname aanpassen en opnieuw draaien, of de aanname vastleggen als verklaring |

Onderzoek gebeurt door de aanname te variëren en te kijken of het verschil verdwijnt, en
door — waar mogelijk — een handafleiding of gesloten formule als derde partij te gebruiken.

### 1.4 Statusvelden

Per grootheid: `open` → `gelijk` → of `afwijking: ONS | BRON | NB | AANNAME`.
Per geval een eindconclusie in het blok "Conclusie" onderaan het geval.

### 1.5 Voorgestelde toleranties

| Soort referentie | Tolerantie | Motivatie |
|---|---|---|
| Analytisch exact (gesloten formule, handafleiding) | 0,5 % | Alleen afronding en discretisatie |
| Numerieke referentie uit een validatiebundel | 1 % | Bron rondt zelf af |
| Waarde afgelezen uit een diagram of figuur in de bron | 2 % | Leesnauwkeurigheid |
| Geval met modelleeraanname (voute, eigen gewicht, lastverdeling) | 5 % | Aanname domineert |
| Unity checks | 0,02 absoluut | Bron rondt op 2 decimalen af |

### 1.6 Harde regels bij het invullen

- **Nooit een getal invullen dat niet gemeten of berekend is.** Leeg laten is beter.
- Referentiewaarden in dit dossier zijn overgenomen uit de bron en mogen **niet** worden
  bijgesteld naar aanleiding van onze uitkomst.
- Bij een tegenstrijdigheid in de bron staat die tegenstrijdigheid bij het geval genoemd;
  gebruik de aangegeven interpretatie en noteer dat.

---

## 2. Overzichtstabel

### 2.1 Volwaardige gevallen (26)

| Kenmerk | Constructie | Groep | Toetst | NB | Status |
|---|---|---|---|---|---|
| R01 | Ingeklemde ligger 1,0 m, punt- + moment- + axiaal- + lijnlast | A | M, V, w, N-reactie | n.v.t. | open |
| R02 | Vierstaafs momentvaste knoop (stervorm) | A | Momentverdeling naar stijfheid, knooprotatie | n.v.t. | open |
| R03 | Tweescharnier zadeldakportaal 20 × 8/12 m, 4 losse belastinggevallen | A | M, reacties, verplaatsingen | n.v.t. | open |
| R04 | Zelfde portaal, alle lasten gelijktijdig, lijnlast op projectie | A | Reacties, nokzakking | n.v.t. | open |
| R05 | Driescharnierspant 8 × 3 m met deellast en puntlast | A | Oplegreacties | n.v.t. | open |
| R06 | Driehoekig raamwerk met roloplegging op de bovenregel | A | Staafeindmomenten | n.v.t. | open |
| R07 | Ongeschoord geknikt raamwerk, twee rolopleggingen | A | M, reacties, horizontale verplaatsing | n.v.t. | open |
| R08 | Scheef raamwerk met verplaatsbare knopen | A | M, reacties B, verplaatsing D | n.v.t. | open |
| R09 | Gesloten rechthoekig raamwerk (kokervorm) + kniklast | A | Hoekmomenten, kniklast/kniklengte | n.v.t. | open |
| R10 | Ligger met schuine staaf, twee oplegvarianten | A | Staafeindmomenten beide varianten | n.v.t. | open |
| R11 | Vlak vakwerk, vier staven, puntlast | B | Knoopverplaatsingen | n.v.t. | open |
| R12 | Korte ligger 1,44 m onder lijnlast | B | Zakking met/zonder dwarskrachtvervorming | n.v.t. | open |
| R13 | Vrij opgelegde ligger 6,5 m, lijnlast + puntlast, S275 | C | M, V, UC doorsnede + oplegging, w | UK | open |
| R14 | Doorgaande ligger 6 + 9 + 4,5 m, 4 belastingschikkingen | C | M, V, reacties per schikking, UC's | UK | open |
| R15 | Portaalspant 30 m met gevoute knieën, IPE 500/450 | C | Reacties, M/V/N-verloop, UC's | EN aanbevolen | open |
| R16 | IPE 330, 5,70 m, zijdelings ongesteund — kip | D | Mcr, chi_LT, Mb,Rd, UC, w | EN aanbevolen | open |
| R17 | IPE 400, 15,00 m, tussensteunen + windzuiging | D | M, V, UC, vereenvoudigde kiptoets, w | EN aanbevolen | open |
| R18 | Vakwerkligger 45,60 m, IPE 330-randen | D | Staafkrachten, UC's, doorbuiging | EN aanbevolen | open |
| R19 | Vloerligger 45 × 220 mm C24, 4,5 m | E | M, V, VRd, winst, wfin | EN aanbevolen | open |
| R20 | BSH GL28c 160 × 680, 3 + 14 + 3 m met kragarmen | E | M, V, reactie, UC's, kip, w | DE | open |
| R21 | Doorgaande bekistingdrager 3 × 1,10 m | E | M, V, reacties, w, toetsen | NL | open |
| R22 | Houten garagebouw: gordingen, hoofdligger, kolommen | E | Snedekrachten, doorbuiging, kniktoets | DE | open |
| R23 | Statisch bepaald raamwerk met scharnier, pendelstaaf, ΔT = 40 K | F | M, reactie pendelstaaf, w, rotatie door ΔT | n.v.t. | open |
| R24 | Onderspannen ligger 8 m, trekstang voorgespannen via ΔT = −163 K | F | Trekstangkracht, veldmoment, zakking | n.v.t. | open |
| R25 | Doorgaande ligger 12 m, middensteunpunt op verticale veer | F | Veerreactie, zakking | n.v.t. | open |
| R26 | Ligger op elastische ondergrond, vrije uiteinden | F | M, zakking, rotatie + convergentie | n.v.t. | open |

### 2.2 Zwakkere gevallen, apart gezet (4)

| Kenmerk | Constructie | Wat ontbreekt | Nog bruikbaar voor |
|---|---|---|---|
| Z1 | Kolom IPE 360 S355 onder druk + buiging (JRC) | Opleggingen en uitwendige belasting ontbreken volledig; snedekrachten zijn invoer | Alleen de EN 1993-1-1-toetsmodule |
| Z2 | Houten kolom C18 71 × 171 mm, druk + buiging | Oplegschema ontbreekt; NEd en My,Ed zijn invoer, geen belastinggeval | Alleen EN 1995-1-1 art. 6.3.2 |
| Z3 | Samengestelde staafwerkkolom 10 m, N-verband | Referentie komt uit de gesloten §6.4-methode, niet uit een raamwerkberekening | Alleen naspelen van de methode |
| Z4 | Tweelaags geschoord portaal, aardbevingsbelasting | Vrijwel geen numerieke snedekrachten of verplaatsingen uit de lineaire analyse | Hooguit de trekkracht in de schoor |

### 2.3 Eerlijke telling

- Aangeleverd: **31 kandidaten**.
- Daarvan is één **duplicaat**: de kandidaten "Tweescharnierportaal 30 m (SBE Part 4)" en
  "Portaalspant 30 m met gevoute knieën (SSB04)" zijn hetzelfde uitgewerkte voorbeeld uit
  dezelfde Europese ontwerpgids, gevonden op twee verschillende spiegels. Ze zijn
  samengevoegd tot **R15**.
- Overblijvend: **30 unieke gevallen**.
- Daarvan zijn **26 volwaardig** (voldoen aan de eis: volledige geometrie, opleggingen,
  materiaal/EI, belastingen én cijfermatige uitkomsten).
- **4 zijn zwakker** en staan apart (Z1–Z4). Ze mogen wel gebruikt worden, maar alleen
  voor het beperkte doel dat er bij staat.

**De doelstelling van 25 volwaardige gevallen is dus gehaald (26), maar met kanttekening:**
zes van de 26 vragen een expliciete modelleeraanname voordat ze vergelijkbaar zijn
(R05, R12, R15, R18, R22, R26). Die aannames staan per geval genoemd. Zonder die
aannames zijn het er 20.

---

## 3. Groep A — Zuivere krachtsverdeling

Doel van deze groep: de kern van de solver — stijfheidsmatrix, knoopevenwicht,
momentverdeling naar stijfheid, statisch onbepaalde systemen, schuine staven, interne
scharnieren, verplaatsbare (ongeschoorde) systemen. Geen normtoetsing.

---

### R01 — Ingeklemde ligger 1,0 m met gecombineerde punt-, moment-, axiaal- en lijnbelasting

**Constructie.** Rechte, slanke ligger AB, beide einden volledig ingeklemd. Drievoudig
statisch onbepaald in het vlak. Test op vlakke buiging gecombineerd met trek/druk.

**Bron.** Franse validatiebundel voor rekenprogramma's (AFNOR / Société Française des
Mécaniciens, "Guide de validation des progiciels de calcul de structures", 1990,
ISBN 2-12-486611-7), testreeks SSLL, geval SSLL01.
https://www.icab.eu/guide/valid/ssll.html#ssll01 — handboek-PDF:
https://www.icab.eu/guide/valid/icab_guide_ssll.pdf (blz. 3-4)

**Invoer.**

| Onderdeel | Waarde |
|---|---|
| Knopen (m) | A (0,0) · D (0,3) · G (0,5) · E (0,7) · B (1,0), alle op één rechte lijn |
| Staven | 4 delen: A–D, D–G, G–E, E–B |
| Lengte | L = 1,000 m |
| E | 2,1 · 10^11 Pa |
| Izz | 1,7 · 10^-8 m^4 (EI = 3 570 N·m²) |
| A | 1,0 · 10^-3 m² |
| Volumieke massa | 7,85 · 10^3 kg/m³ — eigen gewicht wordt **niet** als belasting aangebracht |
| Opleggingen | A ingeklemd (ux = uy = 0, phi = 0); B ingeklemd (ux = uy = 0, phi = 0) |
| Belasting LG1 | In D: Fx = +30 000 N en Mz = −3 000 N·m. In E: Fx = +10 000 N en Fy = −20 000 N |
| Belasting LG2 | Gelijkmatig verdeelde lijnlast −24 000 N/m (lokale y) over de volle lengte A–B |
| Combinatie | Referentie geldt voor de **som** van LG1 en LG2; geen partiële factoren |

**Te vergelijken grootheden.**

| Grootheid | Referentiewaarde | Onze waarde | Δ | Status |
|---|---|---|---|---|
| Dwarskracht in G (midden) | −540 N | | | open |
| Buigend moment in G | 2 800 N·m | | | open |
| Zakking in G | −4,9 · 10^-2 m | | | open |
| Horizontale (axiale) oplegreactie in A | −24 000 N | | | open |

**Nationale bijlage.** N.v.t. — analytische benchmark, geen Eurocode-toetsing.

**Aannames en aandachtspunten.**
- Eigen gewicht uitzetten, ondanks de opgegeven volumieke massa.
- De ligger is zeer slap (EI = 3 570 N·m²); de zakking van 49 mm op 1 000 mm overspanning
  is ~5 % van de overspanning. De referentie is een **lineaire** oplossing: reken eerste
  orde, niet geometrisch niet-lineair.
- De axiale reactie −24 000 N volgt exact uit 30 000 · 0,7 + 10 000 · 0,3; invoer en
  uitkomst zijn onderling consistent.

**Ontbreekt in de bron.** Verticale oplegreacties en inklemmingsmomenten in A en B.

**Conclusie.** _(nog in te vullen)_

---

### R02 — Vierstaafs momentvaste knoop (stervormig raamwerk)

**Constructie.** Vier staven met sterk verschillende buigstijfheid komen momentvast samen
in de vrije knoop A. Alle verre staafeinden zijn vastgehouden (drie inklemmingen, één
scharnier). Zuivere test op de momentverdeling over staven naar stijfheidsverhouding; met
één onbekende (de rotatie van A) exact op te lossen met de hoekveranderingsmethode.

**Bron.** Zelfde Franse validatiebundel (AFNOR/SFM 1990), geval SSLL10.
https://www.icab.eu/guide/valid/ssll.html#ssll10 — handboek-PDF:
https://www.icab.eu/guide/valid/icab_guide_ssll.pdf (blz. 18-19)

**Invoer.**

| Onderdeel | Waarde |
|---|---|
| Knopen (m) | A (0; 0) · B (4; 0) · C (0; 1) · D (−1; 0) · G (−0,5; 0) · E (0; −2) |
| Staven | A–B (4 m horizontaal) · A–C (1 m omhoog) · D–G en G–A (samen 1 m, G op het midden) · A–E (2 m omlaag) |
| E | 2,0 · 10^11 Pa voor alle staven |
| A–B | Izz = 2,13333333333 · 10^-7 m^4 · A = 16,0 · 10^-4 m² |
| A–C | Izz = 8,33333333333 · 10^-10 m^4 · A = 1,0 · 10^-4 m² |
| D–G–A | Izz = 8,33333333333 · 10^-10 m^4 · A = 1,0 · 10^-4 m² |
| A–E | Izz = 1,33333333333 · 10^-8 m^4 · A = 4,0 · 10^-4 m² |
| Opleggingen | B ingeklemd · C scharnier (rotatie vrij) · D ingeklemd · E ingeklemd |
| Knopen A en G | vrij; alle staafverbindingen in A momentvast |
| Belasting | Puntlast in G: Fy = −1,0 · 10^5 N; plus lijnlast op A–B van −1,0 · 10^3 N/m (lokale y) |

**Te vergelijken grootheden.**

| Grootheid | Referentiewaarde | Onze waarde | Δ | Status |
|---|---|---|---|---|
| Rotatie knoop A | 0,227118 rad | | | open |
| Staafeindmoment M(A–B) | 11 023,72 N·m | | | open |
| Staafeindmoment M(A–C) | 113,559 N·m | | | open |
| Staafeindmoment M(A–D) | −12 348,588 N·m | | | open |
| Staafeindmoment M(A–E) | 1 211,2994 N·m | | | open |
| Controle: som van de vier staafeindmomenten | 0 (momentevenwicht in A) | | | open |

**Nationale bijlage.** N.v.t.

**Aannames en aandachtspunten.**
- Eigen gewicht (volumieke massa 7,8 · 10^3 kg/m³) niet aanbrengen.
- De bron definieert ook een knoop A2 op (2; 0) die in geen enkele staaf gebruikt wordt —
  negeren.
- De rotatie van 0,227 rad (13°) is groot; opnieuw geldt: lineaire analyse.
- Verificatie met de hoekveranderingsmethode bevestigt de referentie:
  theta_A = (12 500 − 1 333,3) / 49 166,7 = 0,227118 rad.

**Ontbreekt in de bron.** Oplegreacties en knoopverplaatsingen (behalve de rotatie in A).

**Conclusie.** _(nog in te vullen)_

---

### R03 — Tweescharnier zadeldakportaal, vier afzonderlijke belastinggevallen

**Constructie.** Tweescharnierportaal met zadeldak: twee kolommen, twee dakliggers die in
de nok samenkomen. Eenvoudig statisch onbepaald; de hyperstatische onbekende in de
analytische afleiding is het moment in de nok C.

**Bron.** Validatiehandboek (fascicule v3.01, "Statique linéaire des structures linéiques")
van een open-source eindige-elementenpakket, uitgegeven door EDF R&D onder GNU FDL,
geval SSLL14. Testinvoer uit de publieke broncode-repository van hetzelfde pakket.
https://ericca.uqtr.ca/fr13.6/man_v/v3/v3.01.014.pdf
(index: https://ericca.uqtr.ca/fr13.6/V3.html ·
invoerbestand: https://gitlab.com/codeaster/src/-/raw/main/astest/ssll14a.comm)

**Invoer.**

| Onderdeel | Waarde |
|---|---|
| Knopen (m) | A (0; 0) · D (0; 8) · C (10; 12) · E (20; 8) · B (20; 0) |
| Staven | A–D en E–B (kolommen, 8 m) · D–C en C–E (dakliggers, elk 10,7703 m) |
| Overspanning | l = 20 m; goothoogte h = 8 m; nokverhoging a = 4 m (nok op 12 m) |
| Dakhelling | tan(beta) = 2a/l = 0,4 → beta = 21,8° |
| E | 2,1 · 10^11 Pa; nu = 0,3 |
| A (alle staven) | 1,0 m² |
| I kolommen A–D, E–B | 5,0 · 10^-4 m^4 |
| I dakliggers D–C, C–E | 2,5 · 10^-4 m^4 |
| Opleggingen | A en B scharnierend (ux = uy = 0, rotatie vrij) |
| Balkmodel | Euler-Bernoulli, geen afschuifvervorming |

**Belastinggevallen** (vier keer los doorrekenen, geen combinatie, geen partiële factoren):

| Geval | Belasting |
|---|---|
| p | Lijnlast p = −3 000 N/m in globale Y-richting op D–C (linker dakligger), **per meter staaflengte**; totaal 3 000 × 10,7703 = 32 311 N |
| F1 | Puntlast F1 = −20 000 N verticaal (Y) in knoop C |
| F2 | Puntlast F2 = −10 000 N horizontaal (X) in knoop D |
| M | Moment M = −100 000 N·m om Z in knoop D |

**Te vergelijken grootheden** (analytische referentie, "solution analytique"):

| Geval | Grootheid | Referentiewaarde | Onze waarde | Δ | Status |
|---|---|---|---|---|---|
| p | Dx(C) | 0,0110476 m | | | open |
| p | Dy(C) | −0,012422374 m | | | open |
| p | Mz(C) | 18 672,994 N·m | | | open |
| p | Fx(A) | 5 175,37 N | | | open |
| p | Fy(A) | 24 233,24 N | | | open |
| F1 | Dx(C) | 0,00000 m | | | open |
| F1 | Dy(C) | −0,01497330 m | | | open |
| F1 | Mz(C) | 41 422,161 N·m | | | open |
| F1 | Fx(A) | 4 881,487 N | | | open |
| F1 | Fy(A) | 10 000,00 N | | | open |
| F2 | Dx(C) | −0,03000956 m | | | open |
| F2 | Dy(C) | −0,00299466 m | | | open |
| F2 | Mz(C) | 8 284,432 N·m | | | open |
| F2 | Fx(A) | 5 976,297 N | | | open |
| F2 | Fy(A) | 4 000,00 N | | | open |
| M | Dx(C) | 0,0273532 m | | | open |
| M | Dy(C) | −0,001215646 m | | | open |
| M | Mz(C) | 4 916,724 N·m | | | open |
| M | Fx(A) | 4 576,394 N | | | open |
| M | Fy(A) | 5 000,00 N | | | open |

**Nationale bijlage.** N.v.t.

**Aannames en aandachtspunten.**
- **Zetfout in de bron:** de PDF vermeldt bij F1 "−2 000 N", maar het invoerbestand en de
  referentie-oplegreactie Fy(A) = 10 000 N horen bij **−20 000 N**. Gebruik −20 000 N.
- De knoopnamen in de bijlage met de handafleiding (C1, C2) komen overeen met D en E in de
  testbeschrijving.
- A = 1,0 m² maakt de staven praktisch reklamloos. Deze waarde moet letterlijk worden
  overgenomen, anders wijken de verplaatsingen af.
- De lijnlast in geval p werkt **per meter staaflengte**, niet op de horizontale projectie.
  (Vergelijk R04, waar het omgekeerde geldt.)

**Conclusie.** _(nog in te vullen)_

---

### R04 — Zelfde zadeldakportaal, alle lasten gelijktijdig, lijnlast op de projectie

**Constructie.** Identiek systeem als R03 (vlak zadeldakspant, scharnierend aan beide
voeten, star in de hoekknopen en in de nok), maar met andere doorsnede-oppervlakken, alle
belastingen gelijktijdig, en de lijnlast op de **horizontale projectie**. Waardevol als
tweede, onafhankelijke controle op hetzelfde systeem.

**Bron.** Franse validatiebundel (AFNOR/SFM 1990), geval SSLL14.
https://www.icab.eu/guide/valid/icab_guide_ssll.pdf

**Invoer.**

| Onderdeel | Waarde |
|---|---|
| Knopen (m) | A (0; 0) · A1 (0; 8) · C (10; 12) · B1 (20; 8) · B (20; 0) |
| Kolommen A–A1, B–B1 | 8 m; Izz = 5,0 · 10^-4 m^4; A = 7,746 · 10^-2 m² |
| Spantbenen A1–C, C–B1 | elk 10,7703 m; Izz = 2,5 · 10^-4 m^4; A = 5,477 · 10^-2 m² |
| E | 2,1 · 10^11 Pa |
| Opleggingen | A en B scharnierend (X en Y vast, rotatie vrij); knopen A1, B1, C star |
| Belasting (alle gelijktijdig) | Verticale puntlast in C: −20 000 N · horizontale puntlast in A1: −10 000 N · moment in A1: −100 000 N·m · verticale lijnlast −3 000 N/m op **uitsluitend** het linker spantbeen A1–C, werkend **per meter horizontale projectie** (totaal 30 000 N over 10 m projectie) |

**Te vergelijken grootheden.**

| Grootheid | Referentiewaarde | Onze waarde | Δ | Status |
|---|---|---|---|---|
| Oplegreactie A, X-richting | 20 239,4 N | | | open |
| Oplegreactie A, Y-richting | 31 500,0 N | | | open |
| Verticale zakking nok C | −0,03072 m | | | open |

**Nationale bijlage.** N.v.t.

**Aannames en aandachtspunten.**
- **Tegenstrijdigheid in de bron:** de begeleidende tekst noemt voor de puntlast in C
  "−100 000,0 N", terwijl het bijgeleverde invoerbestand −20 000,0 N toepast. Alleen
  −20 000 N is in evenwicht met de opgegeven reactie A(Y) = 31 500 N. **Gebruik −20 000 N.**
- **Essentieel:** de lijnlast werkt op de horizontale projectie. Per meter staaflengte
  levert hij 33 233 N in plaats van 31 500 N en klopt de referentie niet meer.
- De bron noemt "vierkante doorsnede" als aanname (a = 0,2783 m resp. 0,2340 m); alleen
  A en I zijn relevant.
- Eigen kruiscontrole (arithmetiek, geen bronuitspraak): R04 is de superpositie van de vier
  gevallen van R03 met de lijnlast geschaald naar de projectie
  (24 233,24 × 30 000/32 311 = 22 500) en de juiste tekens:
  22 500 + 10 000 + 4 000 − 5 000 = 31 500 N. De twee bronnen bevestigen elkaar dus.

**Ontbreekt in de bron.** Momentenlijn, staafkrachten en de reactie in B.

**Conclusie.** _(nog in te vullen)_

---

### R05 — Driescharnierspant 8 × 3 m met deellast en puntlast

**Constructie.** Driescharnierspant met opleggingen op gelijke hoogte en een intern
scharnier S in de ligger. Statisch bepaald.

**Bron.** TU Delft, faculteit Civiele Techniek, vak CTB1110, hand-out "Bepaling van
oplegreacties van spanten", september 2023 (ir. J.W. Welleman), figuur 3.
https://icozct.tudelft.nl/TUD_CT/CT1031/collegestof/files/Oplegreacties-3S-spant.pdf

**Invoer.**

| Onderdeel | Waarde |
|---|---|
| Knopen (m) | A (0; 0) · hoekpunt (0; 3,0) · scharnier S (5,0; 3,0) · hoekpunt (8,0; 3,0) · B (8,0; 0) |
| Maten | Portaalhoogte 3,0 m; liggerdeel links van S 5,0 m; rechts van S 3,0 m; overspanning 8,0 m |
| Materiaal | Niet gegeven — statisch bepaald, dus krachtsverdeling onafhankelijk van EI |
| Opleggingen | A en B scharnierend op gelijke hoogte; **intern scharnier in S** |
| Belasting | Deellast 2,24 kN/m verticaal over het liggerdeel van 5,0 m tussen de linker hoek en S · puntlast 112 kN verticaal op 1,5 m links van B (x = 6,5 m) |

**Te vergelijken grootheden.**

| Grootheid | Referentiewaarde | Onze waarde | Δ | Status |
|---|---|---|---|---|
| Av (verticaal in A) | 28,7 kN omhoog | | | open |
| Ah (horizontaal in A) | 38,5 kN naar rechts | | | open |
| Bv (verticaal in B) | 94,5 kN omhoog | | | open |
| Bh (horizontaal in B) | 38,5 kN naar links | | | open |

**Nationale bijlage.** N.v.t.

**Aannames en aandachtspunten.**
- Voor EI moet een willekeurige waarde gekozen worden (statisch bepaald → geen invloed op
  reacties). Noteer welke waarde gekozen is.
- Beperkte referentie: **alleen oplegreacties**. Gebruik dit geval als test op deellasten
  in combinatie met een intern scharnier op een geknikt systeem.

**Ontbreekt in de bron.** Momenten-, dwarskracht- en normaalkrachtlijn; profiel/EI;
verplaatsingen.

**Conclusie.** _(nog in te vullen)_

---

### R06 — Driehoekig raamwerk met roloplegging op de bovenregel

**Constructie.** Viervoudig statisch onbepaald raamwerk met niet-verplaatsbare knopen:
horizontale bovenregel DC en twee schuine staven AC en CB die in knoop C momentvast
samenkomen.

**Bron.** TU Delft, open onderwijssite Constructiemechanica 3 (CT2031), tentamen
14 april 2010, vraagstuk 2, met uitgewerkte antwoorden.
Opgave: https://icozct.tudelft.nl/TUD_CT/CT2031/tentamens/files/2031-1404-2010.pdf (blz. 3)
Uitwerking: https://icozct.tudelft.nl/TUD_CT/CT2031/tentamens/files/2031-1404-2010A.pdf (blz. 10-11)

**Invoer.**

| Onderdeel | Waarde |
|---|---|
| Basismaat | a = 2,0 m |
| Knopen (m) | A (0; 0) · B (12; 0) · C (6; 8) · D (0; 8) |
| Staven | DC horizontaal 6 m · AC 10 m (proj. 6 horizontaal, 8 verticaal) · CB 10 m |
| Buigstijfheden | DC: 3EI = 30 000 kN·m² · AC: 5EI = 50 000 kN·m² · CB: 10EI = 100 000 kN·m² (met EI = 10 000 kN·m²) |
| Opleggingen | A en B volledig ingeklemd · D roloplegging (alleen verticale steun) · knoop C momentvast |
| Belasting | q = 10 kN/m verticaal omlaag op DC (volle 6 m) · F = 40 kN verticaal omlaag in knoop C |

**Te vergelijken grootheden.**

| Grootheid | Referentiewaarde | Onze waarde | Δ | Status |
|---|---|---|---|---|
| M1 — staafeindmoment AC bij C | −12 kN·m (= −3qa²/10) | | | open |
| M2 — staafeindmoment CB bij C | −24 kN·m (= −3qa²/5) | | | open |
| M3 — staafeindmoment DC bij C | 36 kN·m (= −M1 − M2) | | | open |
| Inklemmingsmoment in A | 6,0 kN·m (uit de M-lijn) | | | open |
| Inklemmingsmoment in B | 12,0 kN·m (uit de M-lijn) | | | open |
| Parabooldeel in DC | 45,0 kN·m (= q·l²/8) | | | open |
| Netto veldmoment in DC | 27,0 kN·m (45,0 − 18,0) | | | open |

**Nationale bijlage.** N.v.t.

**Aannames en aandachtspunten.**
- **Interne inconsistentie in de bron:** de tekst drukt M4 = ½·M1 = −12 kN·m en
  M5 = ½·M2 = −6 kN·m af, terwijl uit M1 = −12 en M2 = −24 volgt M4 = −6 en M5 = −12.
  De **getekende M-lijn** (6,0 bij A en 12,0 bij B) ondersteunt de laatste; die is hier
  overgenomen. Als onze uitkomst 6 bij A en 12 bij B geeft, is dat status `BRON` (zetfout),
  geen `ONS`.

**Ontbreekt in de bron.** Oplegreacties, dwarskrachten, normaalkrachten, verplaatsingen.

**Conclusie.** _(nog in te vullen)_

---

### R07 — Ongeschoord geknikt raamwerk met twee rolopleggingen

**Constructie.** Ongeschoord (verplaatsbare knopen) raamwerk: verticale kolom AB met
daarop een doorgaande horizontale ligger B–C–D; knopen B en C momentvast. Test op
zijdelingse verplaatsbaarheid.

**Bron.** TU Delft CT2031, tentamen 14 april 2010, vraagstuk 3.
Opgave: https://icozct.tudelft.nl/TUD_CT/CT2031/tentamens/files/2031-1404-2010.pdf (blz. 4)
Uitwerking: https://icozct.tudelft.nl/TUD_CT/CT2031/tentamens/files/2031-1404-2010A.pdf (blz. 12-13)

**Invoer.**

| Onderdeel | Waarde |
|---|---|
| Basismaat | a = 1,5 m |
| Knopen (m) | A (0; 0) · B (0; 4,5) · C (6; 4,5) · D (12; 4,5) |
| Staven | AB verticaal 4,5 m · BC 6,0 m · CD 6,0 m |
| Buigstijfheden | AB: EI = 100 000 kN·m² · BC: EI · CD: 2EI = 200 000 kN·m² |
| Opleggingen | A scharnieroplegging · C en D rolopleggingen (alleen verticale steun) · knopen B en C momentvast |
| Belasting | q1 = 64,0 kN/m horizontaal gelijkmatig verdeeld op kolom AB (4,5 m, naar de constructie toe) · F = 50 kN horizontale puntlast in knoop B, zelfde richting · q2 = 45,0 kN/m verticaal omlaag op regel BC (6 m; **niet** op CD) |

**Te vergelijken grootheden.**

| Grootheid | Referentiewaarde | Onze waarde | Δ | Status |
|---|---|---|---|---|
| MB | 873 kN·m | | | open |
| MC | 426 kN·m | | | open |
| Mechanismerotatie theta | 0,0327750 rad | | | open |
| Horizontale verplaatsing van B | 0,147 m | | | open |
| AV | 81,5 kN | | | open |
| AH | 338,0 kN | | | open |
| CV | 422,5 kN | | | open |
| DV | 71,0 kN | | | open |
| Waarden bij de V-lijn | 81,5 / 50 / 351,5 / 71 / 338 kN | | | open |

**Nationale bijlage.** N.v.t.

**Aannames en aandachtspunten.**
- Normaalkrachtvervorming is in de handberekening **verwaarloosd**. Geef de staven in ons
  model een zeer grote EA (of zet normaalkrachtvervorming uit) om de referentie te kunnen
  reproduceren.
- In de uitwerking wordt MB eerst als −873 kN·m gevonden, waarna wordt vastgesteld dat de
  aangenomen richting onjuist was. Vergelijk daarom op absolute waarde en leg de
  tekenconventie apart vast.
- De richtingen van de oplegreacties staan alleen als pijlen in de figuur.

**Ontbreekt in de bron.** Normaalkrachtenlijn; veldmomenten in BC.

**Conclusie.** _(nog in te vullen)_

---

### R08 — Scheef raamwerk met verplaatsbare knopen

**Constructie.** Raamwerk met verplaatsbare knopen: horizontale staaf AC, dalende schuine
staaf CD en stijgende schuine staaf DB. In C en D momentvast verbonden.

**Bron.** TU Delft CT2031, tentamen 21 januari 2013, vraagstuk 2.
Opgave: https://icozct.tudelft.nl/TUD_CT/CT2031/tentamens/files/2031-2101-2013.pdf (blz. 3)
Uitwerking: https://icozct.tudelft.nl/TUD_CT/CT2031/tentamens/files/2031-2101-2013A.pdf (blz. 9)

**Invoer.**

| Onderdeel | Waarde |
|---|---|
| Basismaat | a = 1,0 m |
| Knopen (m) | A (0; 0) · C (4; 0) · D (8; −3) · B (10; −1,5) |
| Staven | AC 4 m horizontaal · CD 5 m (4 horizontaal, 3 omlaag) · DB 2,5 m (2 horizontaal, 1,5 omhoog) |
| Buigstijfheid | Alle staven EI = 10 000 kN·m² |
| Opleggingen | A en B scharnieropleggingen · momentvaste knopen in C en D |
| Belasting | q = 41 kN/m verticaal omlaag, gelijkmatig verdeeld over deel AC (4 m) |

**Te vergelijken grootheden.**

| Grootheid | Referentiewaarde | Onze waarde | Δ | Status |
|---|---|---|---|---|
| MC | −208 kN·m | | | open |
| MD | 32 kN·m | | | open |
| Grootste moment in staaf CD (absoluut) | 208 kN·m | | | open |
| Grootste moment in staaf BD (absoluut) | 32 kN·m | | | open |
| Mechanismerotatie theta | 19/375 = 0,05067 rad | | | open |
| BV | 30 kN | | | open |
| BH | 18,67 kN (18 2/3) | | | open |
| Horizontale verplaatsing van D | 0,076 m | | | open |

**Nationale bijlage.** N.v.t.

**Aannames en aandachtspunten.**
- Normaalkrachtvervorming verwaarloosd → grote EA aanhouden.
- Let op de tekenconventie voor MC/MD; de bron geeft de absolute controlewaarden apart.

**Ontbreekt in de bron.** Oplegreacties in A; M- en V-lijn niet volledig ingevuld.

**Conclusie.** _(nog in te vullen)_

---

### R09 — Gesloten rechthoekig raamwerk (kokervorm), inclusief kniklast

**Constructie.** Symmetrisch gesloten rechthoekig raamwerk: onderregel AB, twee kolommen
AC en BD, bovenregel CD; alle staven momentvast verbonden. Ongeschoord, maar symmetrisch
belast zodat de bovenregel niet horizontaal verplaatst.

**Bron.** TU Delft CT2031, hertentamen 15 april 2013, vraagstuk 1.
Opgave: https://icozct.tudelft.nl/TUD_CT/CT2031/tentamens/files/2031-1504-2013.pdf (blz. 2)
Uitwerking: https://icozct.tudelft.nl/TUD_CT/CT2031/tentamens/files/2031-1504-2013A.pdf (blz. 8)

**Invoer.**

| Onderdeel | Waarde |
|---|---|
| Maten | a = 6,0 m (overspanning onder- en bovenregel), b = 6,0 m (kolomhoogte) |
| Knopen (m) | A (0; 0) · B (6; 0) · C (0; 6) · D (6; 6) |
| Buigstijfheid | Alle staven EI = 1 000 kN·m² |
| Opleggingen | A en B scharnieropleggingen aan de voet; alle verbindingen (A, B, C, D) momentvast |
| Belasting | q = 8 kN/m verticaal omlaag op bovenregel CD · twee puntlasten F = 15,0 kN verticaal omlaag in knopen C en D |

**Te vergelijken grootheden.**

| Grootheid | Referentiewaarde | Onze waarde | Δ | Status |
|---|---|---|---|---|
| MA = MB | 3,0 kN·m | | | open |
| MC = MD | 15,0 kN·m | | | open |
| Vergelijking: MC bij starre kolommen | 24,0 kN·m (q·a²/12); gevonden waarde = 62,5 % daarvan | | | open |
| Rotatieveerstijfheid van de regels r = 6EI/a | 1 000 kN·m/rad | | | open |
| Kniklast van de kolom Fk | 149,5 kN | | | open |
| Kniklengte lk | 8,12 m | | | open |
| Normaalkracht in de kolom N | 24 + F (kN) | | | open |
| Maximale puntlast bij maatgevende kniklast | 125,5 kN | | | open |
| n = 149,5/(15+24) | 3,83 | | | open |
| Vergrotingsfactor n/(n−1) | 1,35 | | | open |

**Nationale bijlage.** N.v.t.

**Aannames en aandachtspunten.**
- De bron stelt expliciet vast dat de puntlasten **geen** invloed op de momentenverdeling
  hebben (knopen verplaatsen niet, normaalkrachtvervorming verwaarloosd). Als onze
  uitkomst wél invloed toont, is dat waarschijnlijk normaalkrachtvervorming → grote EA
  instellen en opnieuw draaien voordat er `ONS` gescoord wordt.
- De stabiliteitsgrootheden (Fk, lk, n) zijn alleen vergelijkbaar als de app een
  kniklast/eigenwaarde-analyse of een tweede-ordeberekening met vergrotingsfactor kan
  produceren. Anders vergelijken op de vergrotingsfactor 1,35 uit een tweede-orderun.

**Ontbreekt in de bron.** Oplegreacties, verplaatsingen; M- en V-lijn niet volledig.

**Conclusie.** _(nog in te vullen)_

---

### R10 — Ligger met schuine staaf, twee oplegvarianten

**Constructie.** Doorgaande horizontale ligger A–D–C met een naar linksonder lopende
schuine staaf DB; momentvast in D. Situatie 1: drievoudig statisch onbepaald met
niet-verplaatsbare knopen. Situatie 2: dezelfde constructie met B als horizontale
roloplegging, waardoor de knopen verplaatsbaar worden.

**Bron.** TU Delft CT2031, tentamen 23 januari 2012, vraagstuk 3.
Opgave: https://icozct.tudelft.nl/TUD_CT/CT2031/tentamens/files/2031-2301-2012.pdf (blz. 4)
Uitwerking: https://icozct.tudelft.nl/TUD_CT/CT2031/tentamens/files/2031-2301-2012A.pdf (blz. 11-13)

**Invoer.**

| Onderdeel | Waarde |
|---|---|
| Basismaat | a = 4,0 m |
| Knopen (m) | A (0; 0) · D (4; 0) · C (8; 0) · B (0; −4) |
| Staven | AD 4 m horizontaal · DC 4 m horizontaal · DB 5,657 m onder 45° |
| Buigstijfheden | AD: 2EI = 300 000 · DC: 3EI = 450 000 · DB: EI·√2 = 212 132 kN·m² (met EI = 150 000 kN·m²) |
| Opleggingen situatie 1 | A volledig ingeklemd · C verticale roloplegging · B scharnieroplegging · knoop D momentvast |
| Opleggingen situatie 2 | Idem, maar B = horizontale roloplegging (horizontaal vrij) |
| Belasting (beide situaties) | q = 1 140 kN/m verticaal omlaag over DC (4 m) |

**Te vergelijken grootheden.**

| Situatie | Grootheid | Referentiewaarde | Onze waarde | Δ | Status |
|---|---|---|---|---|---|
| 1 | M1 — staafeind AD bij D | 912 kN·m (= q·a²/20) | | | open |
| 1 | M2 — staafeind DB bij D | 342 kN·m (= 3q·a²/160) | | | open |
| 1 | M3 — staafeind DC bij D | −1 254 kN·m (= −11q·a²/160) | | | open |
| 1 | M4 — inklemmingsmoment in A | 456 kN·m (= q·a²/40) | | | open |
| 1 | Controle knoopevenwicht M1+M2+M3 | 0 | | | open |
| 2 | M1 | −2 480 kN·m | | | open |
| 2 | M2 | −400 kN·m | | | open |
| 2 | M3 | 2 880 kN·m | | | open |
| 2 | M4 | −3 360 kN·m | | | open |
| 2 | Mechanismerotatie theta | 0,009422 rad | | | open |
| 2 | Horizontale verplaatsing van B | 0,0377 m | | | open |

**Nationale bijlage.** N.v.t.

**Aannames en aandachtspunten.**
- Normaalkrachtvervorming verwaarloosd → grote EA aanhouden.
- Twee modellen opslaan (R10a en R10b) omdat alleen de oplegging in B verschilt; goede
  test op de oplegging-editor.

**Ontbreekt in de bron.** Oplegreacties en dwarskrachten; verplaatsingen alleen voor
situatie 2.

**Conclusie.** _(nog in te vullen)_

---

## 4. Groep B — Verplaatsingen en stijfheid

Doel: de verplaatsingskant apart toetsen — vakwerkgedrag (alleen normaalkracht) en de
invloed van dwarskrachtvervorming. Aanvullende verplaatsingsreferenties zitten ook in
R03, R04, R07, R08, R10, R25 en R26.

---

### R11 — Vlak vakwerk met vier staven onder puntlast

**Constructie.** Vlak, statisch bepaald vakwerk van vier staven; twee knopen scharnierend
aan de fundering, één vrije tussenknoop en één uitkragende belaste knoop. De bron rekent
zowel met scharnierende als met momentvaste staafverbindingen; door de slankheid
verschillen de uitkomsten nauwelijks.

**Bron.** Validatiehandboek (fascicule v3.01) van een open-source eindige-elementenpakket
(EDF R&D, GNU FDL), geval SSLL11; referentie uit fiche SSLL11/89 van het Guide VPCS,
bepaald met de verplaatsingsmethode.
https://ericca.uqtr.ca/fr13.6/man_v/v3/v3.01.011.pdf

**Invoer.**

| Onderdeel | Waarde |
|---|---|
| Knopen (m) | A (0; 0) · B (1; 0) · C (0,5; 0,5) · D (2; 1) |
| Staven | A–C · B–C · C–D · B–D |
| E | 1,962 · 10^11 Pa; nu = 0,3 |
| A–C en B–C | A = 2,0 · 10^-4 m² (volle ronde doorsnede, R = 7,978845 · 10^-3 m) |
| C–D en B–D | A = 1,0 · 10^-4 m² (R = 5,641895 · 10^-3 m) |
| Opleggingen | A en B scharnierend (u = v = 0) |
| Verbindingen | Scharnierend (geen momentoverdracht) |
| Belasting | Verticale puntlast in knoop D: F = −9,81 · 10^3 N |

**Te vergelijken grootheden.**

| Grootheid | Referentiewaarde | Onze waarde | Δ | Status |
|---|---|---|---|---|
| u_C | 2,6517 · 10^-4 m | | | open |
| v_C | 0,8839 · 10^-4 m | | | open |
| u_D | 3,47902 · 10^-3 m | | | open |
| v_D | −5,60084 · 10^-3 m | | | open |

Toegepaste tolerantie in de bron: 3,0 · 10^-4 (relatief).

**Nationale bijlage.** N.v.t.

**Aannames en aandachtspunten.**
- Modelleer alle staafeinden als scharnieren (vakwerkgedrag); noteer of onze
  scharnierimplementatie op beide staafeinden tegelijk werkt.
- Traagheidsmomenten zijn voor de scharnierende variant niet nodig; als de app een I
  eist, kies een waarde die past bij de opgegeven ronde doorsnede en noteer die.

**Ontbreekt in de bron.** Staafkrachten en oplegreacties (wel handmatig af te leiden — het
vakwerk is statisch bepaald).

**Conclusie.** _(nog in te vullen)_

---

### R12 — Korte ligger 1,44 m onder lijnlast, met en zonder dwarskrachtvervorming

**Constructie.** Rechte, korte (gedrongen) ligger op twee scharnieropleggingen, statisch
bepaald. Doel van de test is expliciet de dwarskrachtvervorming (Timoshenko) los te
toetsen van de zuivere buigingsvervorming (Bernoulli).

**Bron.** Franse validatiebundel (AFNOR/SFM 1990), geval SSLL02.
https://www.icab.eu/guide/valid/ssll.html#ssll02 —
https://www.icab.eu/guide/valid/icab_guide_ssll.pdf (blz. 4-5)

**Invoer.**

| Onderdeel | Waarde |
|---|---|
| Knopen | A (x = 0) · C (x = 0,72, midden) · B (x = 1,44) |
| Lengte | L(AB) = 1,44 m |
| E | 2,0 · 10^11 Pa; nu = 0,3 (G = 7,6923 · 10^10 Pa) |
| A | 31,0 · 10^-4 m² |
| Izz | 2 810,0 · 10^-8 m^4 |
| Dwarskrachtfactor SRY | 2,42 (= totale oppervlakte / afschuifoppervlakte) |
| Opleggingen | A en B scharnierend (verticaal en horizontaal vast, rotatie vrij) |
| Belasting | Gelijkmatig verdeelde lijnlast −1,0 · 10^5 N/m over de volle lengte |

**Te vergelijken grootheden.**

| Grootheid | Referentiewaarde | Onze waarde | Δ | Status |
|---|---|---|---|---|
| Zakking in C **met** dwarskrachtvervorming | −1,25926 · 10^-3 m | | | open |
| Zakking in C **zonder** dwarskrachtvervorming | −0,9962 · 10^-3 m | | | open |
| Deelbijdrage buiging v1 = 5qL⁴/(384·E·Izz) | 9,962 · 10^-4 m | | | open |
| Deelbijdrage afschuiving v2 = qL²·SRY/(8·A·G) | 2,630 · 10^-4 m | | | open |

**Nationale bijlage.** N.v.t.

**Aannames en aandachtspunten.**
- **Belangrijkste aanname:** als Open FEM2D Studio geen dwarskrachtvervorming kent
  (Euler-Bernoulli), is alleen de tweede waarde (−0,9962 · 10^-3 m) vergelijkbaar. Noteer
  dat expliciet; een afwijking van 26 % ten opzichte van de eerste waarde is dan
  `AANNAME`, geen `ONS`.
- Eigen gewicht (volumieke massa 7,85 · 10^3 kg/m³) niet aanbrengen.

**Ontbreekt in de bron.** Momenten, dwarskrachten en oplegreacties (statisch bepaald,
triviaal af te leiden).

**Conclusie.** _(nog in te vullen)_

---

## 5. Groep C — Staal: krachtsverdeling met doorsnedetoetsing (EN 1993-1-1)

Doel: de keten van belastingcombinatie → krachtsverdeling → doorsnedeweerstand → unity
check in één keer toetsen, inclusief de nationale-bijlagekeuzes.

---

### R13 — Vrij opgelegde, kipvaste ligger 6,5 m met lijnlast en puntlast

**Constructie.** Enkelvoudige, vrij opgelegde ligger, over de volle lengte zijdelings
gesteund (geen kip). Oplegvlakken 50 mm bij de niet-verstijfde opleggingen en 75 mm onder
de puntlast.

**Bron.** Staalbouwinstituut (Verenigd Koninkrijk), publicatie P364 "Steel Building
Design: Worked Examples — Open Sections" (2009), voorbeeld 2.
https://www.steelconstruction.info/images/5/50/Sci_p364.pdf

**Invoer.**

| Onderdeel | Waarde |
|---|---|
| Overspanning | L = 6 500 mm; puntlast in het midden (3 250 mm van elke oplegging) |
| Profiel | 533 × 210 × 92 UKB, S275 (fy = 275 N/mm² voor t ≤ 16 mm) |
| Doorsnede | h = 533,1 · b = 209,3 · tw = 10,1 · tf = 15,6 · r = 12,7 · d = 476,5 mm; Iy = 55 200 cm⁴; Wpl,y = 2 360 cm³; A = 117 cm²; E = 210 000 N/mm² |
| Opleggingen | Vrij opgelegd (scharnier + rol) |
| Permanent | Lijnlast incl. eigen gewicht g1 = 15 kN/m; puntlast G2 = 40 kN in het midden |
| Veranderlijk | Lijnlast q1 = 30 kN/m; puntlast Q2 = 50 kN in het midden |
| Combinatie | Britse NB bij EN 1990, tabel NA.A1.2(B): gamma_G = 1,35, gamma_Q = 1,50, xi = 0,925; **alleen uitdrukking (6.10b)** |
| Ontwerpwaarden | F1,d = 0,925·1,35·15 + 1,5·30 = 63,7 kN/m · F2,d = 0,925·1,35·40 + 1,5·50 = 125,0 kN |
| BGT | Alleen de veranderlijke belastingen (30 kN/m en 50 kN); grens L/360 |

**Te vergelijken grootheden.**

| Grootheid | Referentiewaarde | Onze waarde | Δ | Status |
|---|---|---|---|---|
| MEd in het midden | 539,5 kN·m | | | open |
| VEd bij de oplegging | 269,5 kN | | | open |
| Vc,Ed bij het maximale moment | 62,5 kN | | | open |
| Av | 5 723,6 mm² | | | open |
| Vpl,Rd | 909 kN | | | open |
| UC dwarskracht | 0,30 | | | open |
| Mc,Rd = Mpl,Rd | 649,0 kN·m | | | open |
| UC buiging | 0,83 | | | open |
| Momentreductie door dwarskracht | Niet nodig (0,5·Vpl,Rd = 454,5 kN > 62,5 kN) | | | open |
| Lijfweerstand tegen dwarsbelasting FRd | 324 kN bij FEd = 269,5 kN → UC 0,83 | | | open |
| BGT-doorbuiging w | 8,5 mm | | | open |
| Grenswaarde wlim | 6 500/360 = 18,1 mm | | | open |

**Nationale bijlage.** Britse NB bij BS EN 1990 en BS EN 1993-1-1: gamma_M0 = 1,0;
fy volgens NA.2.4; combinatie 6.10b met xi = 0,925.

**Aannames en aandachtspunten.**
- **De BGT-doorbuiging is berekend met uitsluitend de veranderlijke belastingen**, conform
  de Britse NB. Dat moet bij het nabouwen bewust zo worden ingesteld; anders is het
  verschil `NB`, niet `ONS`.
- Als onze app het profiel 533 × 210 × 92 UKB niet in de bibliotheek heeft, invoeren als
  aangepaste doorsnede met de opgegeven waarden en dat noteren.
- De lijfweerstand tegen dwarsbelasting (EN 1993-1-5) valt mogelijk buiten onze
  toetsmodule; dan alleen registreren, niet als afwijking scoren.

**Conclusie.** _(nog in te vullen)_

---

### R14 — Driebeuks doorgaande ligger 6 + 9 + 4,5 m met vier belastingschikkingen

**Constructie.** Doorgaande, niet-samenwerkende ligger op vier steunpunten, elastisch
berekend met vier belastingschikkingen volgens EN 1993-1-1 bijlage AB.2(1)B. Bovenflens
over de volle lengte zijdelings gesteund door de vloerplaat; onderflens gesteund op de
steunpunten; bovenflens gesteund op de lastaangrijpingspunten.

**Bron.** Staalbouwinstituut (Verenigd Koninkrijk), publicatie P364 (2009), voorbeeld 7.
https://www.steelconstruction.info/images/5/50/Sci_p364.pdf

**Invoer.**

| Onderdeel | Waarde |
|---|---|
| Knooppunten | 8 punten, onderlinge afstanden 3000-3000-3000-3000-3000-3000-1500 mm (totaal 19 500 mm) |
| Steunpunten | Punt 1 (x = 0) · punt 3 (x = 6 000) · punt 6 (x = 15 000) · punt 8 (x = 19 500) → overspanningen 6 000, 9 000, 4 500 mm |
| Lastpunten | Punt 2 (x = 3 000) · punt 4 (x = 9 000) · punt 5 (x = 12 000) · punt 7 (x = 18 000) |
| Profiel | 686 × 254 × 125 UKB, S275, uniform (h = 677,9 · b = 253,0 · tw = 11,7 · tf = 16,2 · r = 15,2 · d = 615,1 mm; Iy = 118 000 cm⁴) |
| Opleggingen | Vier verticale steunpunten, vrij opgelegd, geen inklemming, geen uitkragingen |
| Belasting karakteristiek | Punt 2: G = 150,0 / Q = 225,0 kN · punt 4: 150,0 / 225,0 · punt 5: 150,0 / 225,0 · punt 7: 112,5 / 225,0 kN |
| Combinatie | Britse NB, 6.10b met xi·gamma_G,sup = 0,925·1,35 = 1,25; gamma_G,inf = 1,0; gamma_Q = 1,5 |
| Ontwerpwaarden | Ongunstig 187,5 / 187,5 / 187,5 / 140,6 kN plus Q = 337,5 kN; gunstig 150,0 / 150,0 / 150,0 / 112,5 kN |
| Kiplengte | Lcr = 3,0 m tussen zijdelingse steunen |

**Belastingschikkingen.** (1) Q op de middelste overspanning (punten 4 en 5), G elders;
(2) Q op de buitenste overspanningen (punten 2 en 7); (3) Q op de middelste en rechter
overspanning (punten 4, 5, 7); (4) Q op de linker en middelste overspanning (punten 2, 4, 5).

**Te vergelijken grootheden.**

| Schikking | Grootheid | Referentiewaarde | Onze waarde | Δ | Status |
|---|---|---|---|---|---|
| 1 | Puntlasten (pt 2/4/5/7) | 187,5 / 525 / 525 / 140,6 kN | | | open |
| 1 | Reacties (pt 1/3/6/8) | −37 / 745 / 758 / −88 kN | | | open |
| 1 | Dwarskrachten | −37 / −224,5 / 520,5 / −4,5 / −529,5 / 228,5 / 88 kN | | | open |
| 1 | Momenten (pt 2/3/4/5/6/7) | −110 / −783 / 779 / 767 / −820 / −133 kN·m | | | open |
| 2 | Puntlasten | 525 / 187,5 / 187,5 / 478 kN | | | open |
| 2 | Reacties | 182 / 547 / 401 / 247 kN | | | open |
| 2 | Dwarskrachten | 182 / −343 / 205 / 17 / −170 / 231 / −247 kN | | | open |
| 2 | Momenten | 548 / −477 / 137 / 189 / −322 / 371 kN·m | | | open |
| 3 | Puntlasten | 187,5 / 525 / 525 / 478 kN | | | open |
| 3 | Reacties | −33 / 729 / 901 / 118 kN | | | open |
| 3 | Dwarskrachten | −33 / −220 / 509 / −16 / −541 / 360 / 118 kN | | | open |
| 3 | Momenten | −98 / −758 / 768 / 720 / −903 / 177 kN·m | | | open |
| 4 | Puntlasten | 525 / 525 / 525 / 140,6 kN | | | open |
| 4 | Reacties | 104 / 967 / 721 / −76 kN | | | open |
| 4 | Dwarskrachten | 104 / −421 / 546 / 21 / −504 / 217 / 76 kN | | | open |
| 4 | Momenten | 312 / −952 / 686 / 748 / −764 / −114 kN·m | | | open |
| — | Maatgevend MEd (pt 3, schikking 4) | −952 kN·m | | | open |
| — | Maatgevend VEd (pt 3, schikking 4) | 546 kN | | | open |
| — | Vc,Rd | 1 280 kN → UC 0,43 | | | open |
| — | Mc,y,Rd | 1 060 kN·m → UC 0,90 | | | open |
| — | Kip segment 6-7 (M6 = −820, M7 = −133, Lcr = 3,0 m; 1/√C1 = 0,79 → C1 = 1,60) | Mb,Rd = 1 060 kN·m → UC 0,77 | | | open |
| — | Kip segment 2-3 (M2 = 312, M3 = −952, Lcr = 3,0 m) | 1/√C1 = 0,69 → C1 = 2,10 | | | open |

**Nationale bijlage.** Britse NB bij BS EN 1990 en BS EN 1993-1-1: gamma_M0 = 1,0;
combinatie 6.10b met xi = 0,925; permanente belastingen uit één bron gezamenlijk met
gamma_G,sup = 1,25 of gamma_G,inf = 1,0.

**Aannames en aandachtspunten.**
- De momenten en dwarskrachten zijn in de bron uit diagrammen afgelezen en op hele
  kN/kN·m afgerond → tolerantie 2 %.
- De vier schikkingen zijn een goede test op de combinatiegenerator (ongunstig/gunstig per
  veld). Als de app dit niet automatisch doet, vier losse belastinggevallen opbouwen.
- De veranderlijke belasting is in de bron omgezet van 75 kN/m (punt 1–6) en 100 kN/m
  (punt 6–8) naar puntlasten; gebruik de **puntlasten**, niet de lijnlasten.

**Ontbreekt in de bron.** BGT-doorbuiging en lijfweerstand tegen dwarsbelasting worden
expliciet niet berekend.

**Conclusie.** _(nog in te vullen)_

---

### R15 — Portaalspant 30 m met gevoute knieën, IPE 500 kolom en IPE 450 ligger

> **Let op:** dit geval is opgebouwd uit twee vondsten die hetzelfde uitgewerkte voorbeeld
> uit dezelfde Europese ontwerpgids beschrijven, gevonden op twee spiegels. Ze zijn hier
> samengevoegd. Waar de twee uitlezingen van dezelfde figuur verschillen, staat dat
> expliciet vermeld.

**Constructie.** Enkelbeuks tweescharnierportaal met zadeldak en gevoute knieën;
scharnierende kolomvoeten. Elastische eerste-orde berekening; de gevoeligheid voor
tweede-orde effecten wordt getoetst met alpha_cr,est = 12,5 > 10.

**Bron.** Europese ontwerpgidsreeks "Single-Storey Steel Buildings — Part 4: Detailed
Design of Portal Frames" (technische inhoud opgesteld door twee staalbouwonderzoeks-
instituten binnen het Europese project SECHALO, RFS2-CT-2008-0030, 2009), Appendix D.
Spiegel 1: https://www.steelconstruction.info/images/b/b8/SBE_SS4.pdf
Spiegel 2: https://constructalia.arcelormittal.com/files/SSB04%20Detailed%20design%20of%20portal%20frames--28cf1520993f965fc8ea0a60e05ba2c2.pdf
(Appendix D, blz. 4-81 t/m 4-124; geometrie 4-82/4-83, krachtsverdeling 4-89)

**Invoer.**

| Onderdeel | Waarde |
|---|---|
| Overspanning | 30 000 mm (hart kolommen) |
| Goothoogte (knie) | 6 000 mm; hoogte tot onderzijde voute 5 275 mm (voutehoogte op de kolom 725 mm) |
| Dakhelling | 5°; nokhoogte 7 313 mm boven de voet |
| Voute | 3 020 mm horizontaal vanaf de knie (in de krachtsverdelingsfiguur 3 011 mm); de getapte zone van 2 740 mm is voor de toetsing in vier stukken van 685 mm verdeeld (doorsneden 1 t/m 5) |
| Spantbeenlengte | 15 057 mm tussen de knopen langs de as |
| Portaalafstand | 7,2 m |
| Kolom | IPE 500, S355: h = 500 · b = 200 · tw = 10,2 · tf = 16 · r = 21 · hw = 468 · d = 426 mm; A = 11 600 mm²; Iy = 48 200 cm⁴; Iz = 2 142 cm⁴; Wpl,y = 2 194·10³ mm³; iy = 204 mm; iz = 43,1 mm; It = 89,3 cm⁴; Iw = 1 249·10⁹ mm⁶ |
| Ligger | IPE 450, S355: A = 9 880 mm²; Wpl,y = 1 702·10³ mm³ |
| Voute | Uitsnede uit IPE 550; per doorsnede 1..5: uitsnedehoogte 503 / 378 / 252 / 126 mm; totale hoogte 953 / 828 / 702 / 576 mm; A = 15 045 / 13 870 / 12 686 / 11 501 mm²; Iy = 200 500 / 144 031 / 98 115 / 62 258 (×10⁴) mm⁴; Wel,min = 4 055 / 3 348 / 2 685 / 2 074 (×10³) mm³ |
| E | 210 000 N/mm²; gamma_M0 = gamma_M1 = 1,00 |
| Opleggingen | Beide kolomvoeten scharnierend (UGT). Voor alpha_cr,est: voetstijfheid 10 % van de kolomstijfheid |
| Gordingen/wandregels | Langs het spantbeen 302 / 1 345 / 1 345 / 1 700 mm en verder 1 700 mm; wandregels om 1 900 mm |

**Belastingen** (per binnenportaal, h.o.h. 7,2 m, karakteristiek):

| Belasting | Waarde |
|---|---|
| Permanent dakpakket | 0,30 kN/m² × 7,20 = 2,16 kN/m, plus eigen gewicht |
| Sneeuw | sk = 0,618 kN/m² × 7,20 = 4,45 kN/m |
| Veranderlijke daklast (type H) | qk = 0,4 kN/m² × 7,20 = 2,88 kN/m |
| Wind | **Bewust buiten beschouwing gelaten** |
| Maatgevende combinatie | 1,35·G + 1,5·Q met Q = sneeuw: 1,35·2,16 + 1,5·4,45 = 9,6 kN/m plus eigen gewicht (in de voorontwerpstap afgerond op 10 kN/m) |
| Scheefstand | phi = (1/200)·0,82·0,87 = 3,56·10^-3, verwerkt als EHF = 0,60 kN per kolomtop |

**Te vergelijken grootheden.**

| Grootheid | Referentiewaarde | Onze waarde | Δ | Status |
|---|---|---|---|---|
| Verticale oplegreactie per voet VEd | 168 kN | | | open |
| Horizontale oplegreactie per voet HEd | 116 kN (links +116, rechts −116) | | | open |
| Totaal VEd / HEd | 336 kN / 0 kN | | | open |
| Maximale normaalkracht in de ligger NR,Ed | 130 kN | | | open |
| Ncr liggerpaar (Lcr = 30/cos5° = 30,1 m) | 772 kN | | | open |
| Toets 0,09·Ncr = 69 kN < 130 kN | Normaaldruk significant → alpha_cr niet toepasbaar | | | open |
| Horizontale verplaatsing kolomtop onder H_NHF = 0,84 kN | 1,6 mm | | | open |
| alpha_cr,s,est | 12,5 (> 10 → eerste orde volstaat) | | | open |
| Kolomkop MEd | 616 kN·m (spiegel 2 leest links 610 en rechts 616) | | | open |
| Kolomkop VEd / NEd | 117 kN / 162 kN | | | open |
| Kolom op 1 475 mm onder de kop | 444 kN·m (alleen in spiegel 1) | | | open |
| Kolom, tweede tussenwaarde | 221 kN·m (alleen in spiegel 1) | | | open |
| Kolomvoet VEd / NEd / MEd | 117 kN / 168 kN / 0 kN·m | | | open |
| Knie (links / rechts) MEd | 693 / 701 kN·m bij VEd = 150 kN, NEd = 130 kN | | | open |
| Einde voute (links / rechts) MEd | 292 / 298 kN·m bij VEd = 117/118 kN, NEd = 127 kN | | | open |
| Nabij de nok (links) | MEd = 356 kN·m, VEd = 0 kN, NEd = 117 kN | | | open |
| Nabij de nok (rechts) | MEd = 351 kN·m, VEd = 10 kN, NEd = 116 kN | | | open |
| Momentnulpunten langs het spantbeen | 3 011 / 5 869 mm en 3 011 / 5 941 mm | | | open |
| Ligger bij M = 0: VEd / NEd | 87 en 86 kN / 124 kN | | | open |
| Kolom IPE 500: klasse | 1 | | | open |
| Kolom: Av / Vpl,Rd | 6 035 mm² / 1 237 kN | | | open |
| Kolom: Nc,Rd / Mc,Rd | 4 118 kN / 779 kN·m | | | open |
| Kolom: Nb,Rd (drie toetsingen) | 3 731 / 2 092 / 3 937 kN | | | open |
| Kolom: Mb,Rd | 779 resp. 640 kN·m | | | open |
| Ligger IPE 450: Vpl,Rd / Nc,Rd / Mc,Rd | 1 042 kN / 3 507 kN / 604 kN·m | | | open |
| Ligger: Nb,Rd | 3 034 / 2 238 / 2 175 kN; Mb,Rd = 581 kN·m | | | open |
| UC kolom uit het vlak (6.62), M = 616 kN·m | 0,832 | | | open |
| UC kolom uit het vlak (6.62), M = 444 kN·m | 0,758 | | | open |
| UC kolom in het vlak (6.61) | 0,625 | | | open |
| UC ligger (M = 356 kN·m) | 0,653 | | | open |
| UC ligger (M = 298 kN·m) | 0,601 | | | open |
| UC ligger in het vlak (M = 356 kN·m) | 0,779 | | | open |
| Voute: NEd = 129 kN bij MEd = 661 kN·m tegen Mc,Rd | 1 440 kN·m | | | open |
| Voute: MEd langs de voute | 661 / 562 / 471 / 383 kN·m bij NEd = 129 / 129 / 128 / 127 kN | | | open |
| Voute: sigma_x,Ed | 174 N/mm² < 355 N/mm² | | | open |
| Voute: VEd | 147 kN < 1 775 kN | | | open |
| Voute: drukkracht in de voutflens | 670 kN < 1 214 kN | | | open |
| Interactiecontroles kolom | VEd < 0,5·Vpl,Rd = 619 kN; NEd < 0,25·Npl,Rd = 1 030 kN en < 847 kN | | | open |

**Nationale bijlage.** Géén landspecifieke NB: het voorbeeld gebruikt de aanbevolen
EN-waarden, gamma_M0 = gamma_M1 = 1,0 (na te rekenen uit Nc,Rd = 11 600 × 355 = 4 118 kN)
en kiest expliciet **Bijlage B** van EN 1993-1-1 voor de interactiefactoren kyy en kzy. De
bron wijst er zelf op dat nationale bijlagen andere waarden kunnen geven.

**Aannames en aandachtspunten.**
- **Eigen gewicht:** wordt meegerekend maar niet becijferd. De opgegeven 336 kN totale
  verticale reactie is alleen te reproduceren als het eigen gewicht van IPE 450, IPE 500 en
  de vouten automatisch meegaat. Zet eigen gewicht **aan** en noteer de resulterende
  bijdrage.
- **Lastverdeling langs de helling:** de bron zegt niet of sneeuw en daklast op de
  horizontale projectie of op de staaflengte staan. Beide varianten doorrekenen en de best
  passende noteren als aanname (verschil ≈ 1/cos 5° = 0,4 %, dus klein).
- **Voute:** de hoogteverlopen staan alleen in tekeningen. Voor exacte narekening moet de
  voute als taps toelopende staaf gemodelleerd worden; dat beïnvloedt de krachtsverdeling
  merkbaar. Als de app geen tapse staven kent: modelleer als 4 prismatische stukken van
  685 mm met de opgegeven A en Iy per doorsnede, en noteer dat als aanname.
- **Zetfout in de bron:** in de afsluiting van paragraaf 7 wordt de ligger "IPE500"
  genoemd terwijl alle doorsnedegegevens en weerstanden bij **IPE 450** horen.
- De krachtenfiguur is een tekening; de kolomwaarden zijn via de toetsingsparagrafen
  bevestigd, maar de precieze plaats van 693 vs. 701 kN·m is alleen grafisch aangegeven.
- Er worden **geen BGT-doorbuigingen** gegeven; wind is niet beschouwd.
- Tolerantie voor dit geval: 5 % (modelleeraannames domineren).

**Conclusie.** _(nog in te vullen)_

---

## 6. Groep D — Stabiliteit en kip (EN 1993-1-1 §6.3)

Doel: chi_LT, Mcr, de kipkrommen, de vereenvoudigde methode voor liggers met
tussensteunen, en de interactie van normaalkracht met buiging in vakwerkstaven.

---

### R16 — Vrij opgelegde, zijdelings ongesteunde ligger IPE 330 van 5,70 m

**Constructie.** Enkelvoudige, vrij opgelegde ligger die uitsluitend bij de opleggingen
zijdelings is gesteund, dus kipgevoelig over de volle overspanning. Buiging om de sterke
as onder een gelijkmatig verdeelde belasting.

**Bron.** Europese ontwerpgidsreeks voor meerlaagse stalen gebouwen, deel 4 "Detailed
design", bijlage A, uitgewerkt voorbeeld 1 (2009).
https://constructalia.arcelormittal.com/files/MSB04%20Detailed%20design--98310bdd7748cacdaffd651d04d53a0c.pdf

**Invoer.**

| Onderdeel | Waarde |
|---|---|
| Overspanning | 5,70 m; belastingbreedte (stramien) 2,50 m; vloerdikte 120 mm |
| Profiel | IPE 330, S235 (fy = 235 N/mm²), doorsnedeklasse 1 |
| Doorsnede | h = 330 · b = 160 · tw = 7,5 · tf = 11,5 · r = 18 mm; 49,1 kg/m; A = 62,6 cm²; Iy = 11 770 cm⁴; Iz = 788,1 cm⁴; It = 28,15 cm⁴; Iw = 199 100 cm⁶; Wel,y = 713,1 cm³; Wpl,y = 804,3 cm³ |
| Opleggingen | Vrij opgelegd (scharnier + rol), zijdelings gesteund bij beide opleggingen; voor Mcr: k = 1 en kw = 1 |
| Belasting | Eigen gewicht ligger 0,482 kN/m · vloerplaat 0,12 × 24 = 2,88 kN/m² · scheidingswanden 0,75 kN/m² · opgelegde belasting 2,50 kN/m² |
| Karakteristiek | Gk = 0,482 + (2,88 + 0,75)·2,50 = 9,56 kN/m · Qk = 2,5 × 2,5 = 6,25 kN/m |
| UGT | 1,35 × 9,56 + 1,50 × 6,25 = 22,28 kN/m |
| BGT | Karakteristieke combinatie Gk + Qk = 15,81 kN/m |

**Te vergelijken grootheden.**

| Grootheid | Referentiewaarde | Onze waarde | Δ | Status |
|---|---|---|---|---|
| My,Ed | 90,48 kN·m | | | open |
| VEd | 63,50 kN | | | open |
| Mcr | 113,9 kN·m | | | open |
| lambda_LT | 1,288 | | | open |
| Kipkromme / alpha_LT | c (h/b = 2,06 > 2) / 0,49 | | | open |
| lambda_LT,0 / beta | 0,4 / 0,75 | | | open |
| phi_LT | 1,340 | | | open |
| chi_LT | 0,480 | | | open |
| kc / f | 0,94 / 0,984 | | | open |
| chi_LT,mod | 0,488 | | | open |
| Mb,Rd | 92,24 kN·m | | | open |
| UC kip | 0,981 | | | open |
| Av | 3 080 mm² | | | open |
| Vpl,Rd | 417,9 kN | | | open |
| UC dwarskracht | 0,152 | | | open |
| Lijfplooi | Niet toetsen: hw/tw = 40,9 < 72 | | | open |
| BGT-doorbuiging onder Gk + Qk | 8,8 mm (= L/648) | | | open |

**Nationale bijlage.** Geen; aanbevolen EN-waarden (gamma_M0 = gamma_M1 = 1,0,
lambda_LT,0 = 0,4, beta = 0,75). De bron wijst erop dat een nationale bijlage andere
waarden kan voorschrijven.

**Aannames en aandachtspunten.**
- **Belangrijk voor onze app:** onze kiptoets is geïmplementeerd volgens de **Nederlandse**
  nationale bijlage. Voor dit geval moet de toets met de **aanbevolen EN-waarden** worden
  gedraaid. Kan de app dat niet, dan is het verschil `NB` en moet dat expliciet worden
  genoteerd — inclusief het verschil dat de NL NB zou geven, zodat de campagne alsnog
  informatie oplevert.
- Dit geval toetst zowel de kipmodule (Mcr, chi_LT) als de eenvoudige krachtsverdeling.

**Conclusie.** _(nog in te vullen)_

---

### R17 — Vrij opgelegde dakligger IPE 400 van 15,00 m met tussensteunen en windzuiging

**Constructie.** Enkelvoudige, vrij opgelegde dakligger onder gelijkmatig verdeelde
belasting. Bovenflens zijdelings gesteund door de gordingen, onderflens door schoren van
het stabiliteitsverband. Ligger met zeeg. Twee UGT-combinaties: neerwaarts (sneeuw
dominant) en netto opwaarts (windzuiging), zodat afwisselend boven- en onderflens wordt
gedrukt.

**Bron.** Zelfde ontwerpgidsreeks, deel 4 "Detailed design", bijlage A, uitgewerkt
voorbeeld 2 (2009).
https://constructalia.arcelormittal.com/files/MSB04%20Detailed%20design--98310bdd7748cacdaffd651d04d53a0c.pdf

**Invoer.**

| Onderdeel | Waarde |
|---|---|
| Overspanning | 15,00 m; belastingbreedte (stramien) 6,00 m |
| Zijdelingse steunen | Bovenflens om 2,50 m (6 × 2,50 m); onderflens om 5,00 m (3 × 5,00 m) |
| Zeeg | wc = L/500 = 30 mm |
| Profiel | IPE 400, S235 (fy = 235 N/mm²), doorsnedeklasse 1 |
| Doorsnede | h = 400 · hw = 373 · b = 180 · tw = 8,6 · tf = 13,5 · r = 21 mm; 66,3 kg/m; A = 84,46 cm²; Iy = 23 130 cm⁴; Iz = 1 318 cm⁴; It = 51,08 cm⁴; Iw = 490 000 cm⁶; Wel,y = 1 156 cm³; Wpl,y = 1 307 cm³ |
| Opleggingen | Vrij opgelegd; zijdelings gesteund bij de opleggingen |
| Belasting | Eigen gewicht 0,65 kN/m · dakbedekking met gordingen 0,30 kN/m² · sneeuw 0,60 kN/m² · wind 0,50 kN/m² zuiging |
| Karakteristiek | Gk = 0,65 + 0,30·6,00 = 2,45 kN/m · Qs = 3,60 kN/m · Qw = 3,00 kN/m |
| UGT-combinatie 1 | 1,35 × 2,45 + 1,50 × 3,60 = 8,71 kN/m (neerwaarts) |
| UGT-combinatie 2 | 1,00 × 2,45 − 1,50 × 3,00 = −2,05 kN/m (netto opwaarts) |
| BGT | Gk + Qs = 6,05 kN/m |
| Partiële factoren | gamma_G,sup = 1,35 · gamma_G,inf = 1,0 · gamma_Q = 1,50 |

**Te vergelijken grootheden.**

| Grootheid | Referentiewaarde | Onze waarde | Δ | Status |
|---|---|---|---|---|
| Comb. 1: My,Ed | 244,97 kN·m | | | open |
| Comb. 1: VEd | 65,33 kN | | | open |
| Comb. 2: My,Ed | 57,66 kN·m | | | open |
| Comb. 2: VEd | 15,38 kN | | | open |
| Mc,Rd | 307,15 kN·m | | | open |
| UC comb. 1 / comb. 2 | 0,798 / 0,188 | | | open |
| If,z / Af,z / if,z | 658,34 cm⁴ / 31,54 cm² / 4,57 cm | | | open |
| lambda_1 / c0 | 93,9 / 0,50 | | | open |
| Comb. 1: kc / Lc / lambda_f | 1 / 2,50 m / 0,583 ≤ 0,627 (voldoet) | | | open |
| Comb. 2: kc / Lc / lambda_f | 1 / 5,00 m / 1,165 ≤ 2,663 (voldoet) | | | open |
| Av / Vpl,Rd / UC | 4 269 mm² / 579,21 kN / 0,113 | | | open |
| Lijfplooi | Niet nodig: hw/tw = 43,37 < 72 | | | open |
| BGT: wtot | 82,10 mm | | | open |
| BGT: wmax na aftrek zeeg | 52,10 mm (= L/288) | | | open |
| BGT: doorbuiging door sneeuw alleen | 48,90 mm (= L/307) | | | open |

**Nationale bijlage.** Geen; aanbevolen EN-waarden (gamma_M0 = gamma_M1 = 1,0,
lambda_LT,0 = 0,40 waaruit c0 = 0,50). De bron vermeldt dat c0 en de doorbuigingsgrenzen
in een nationale bijlage kunnen worden vastgelegd.

**Aannames en aandachtspunten.**
- De kiptoets gebruikt de **vereenvoudigde methode voor liggers met tussensteunen**
  (EN 1993-1-1 §6.3.2.4), niet de Mcr-methode. Als onze module alleen §6.3.2.2/6.3.2.3
  kent, is dit een `AANNAME`-verschil; noteer dan wat onze chi_LT-route oplevert.
- De zeeg (30 mm) moet apart verwerkt worden; als de app geen zeeg kent, vergelijk op
  wtot = 82,10 mm en trek handmatig af.
- Combinatie 2 is netto opwaarts: goede test op tekenafhandeling en op gunstige permanente
  belasting (gamma_G,inf = 1,0).

**Conclusie.** _(nog in te vullen)_

---

### R18 — Vakwerkligger 45,60 m met parallelle randen

**Constructie.** Vlak vakwerk met (nagenoeg) parallelle randen, 3 % dakhelling naar beide
zijden. Randen doorgaand gemodelleerd (momentvast in de knopen); diagonalen en posten
scharnierend aangesloten. In de middenvelden secundaire diagonalen en posten die de
kniklengte van de bovenrand verkorten. Vrij opgelegd op de kolommen, geen momentoverdracht
naar de kolom.

**Bron.** Europese ontwerpgidsreeks voor eenlaagse stalen gebouwen, deel 5 "Detailed
Design of Trusses" (2010).
https://constructalia.arcelormittal.com/files/SSB05%20Detailed%20Design%20of%20Trusses--05d42c658e9d3bde2419bc9944188d4b.pdf

**Invoer.**

| Onderdeel | Waarde |
|---|---|
| Overspanning | 45,60 m; systeemhoogte 4 000 mm; dakhelling 3 % |
| Veldindeling (figuur 3.4) | 7 100 / 7 200 / 8 500 / 8 600 / 7 100 / 7 100 mm (som 45 600 mm) |
| Belaste knopen | Zeven op de bovenrand |
| Randen | IPE 330 met **liggend lijf**, S355; A = 6 260 mm²; Wpl (in het vakwerkvlak) = 147,2 cm³ |
| Drukdiagonalen | 2 × L150×150×15, S355; A = 2 × 43 = 86 cm²; Iy (uit het vlak) = 3 737 cm⁴; Iz (in het vlak) = 1 796 cm⁴; spleet 10 mm |
| Trekdiagonalen | 2 × L120×120×12, S355; A = 5 510 mm²; Wel = 85,46 cm³ |
| Posten | Enkel L100×100×10 |
| Kolommen | IPE 450 (lijf loodrecht op het vakwerkvlak) |
| Opleggingen | Beide zijden scharnierend op de kolomkoppen, geen momentoverdracht; bovenrand zijdelings gesteund door de gordingen |
| UGT-combinatie 1 (zwaartekracht, zonder eigen gewicht) | Knooplasten 91 / 136 / 182 / 182 / 182 / 136 / 91 kN |
| UGT-combinatie 2 (windzuiging, opwaarts) | 43,50 / 65,25 / 87 / 87 / 87 / 65,25 / 43,50 kN |
| Handberekening incl. eigen gewicht | 101 / 158 / 202 / 202 / 202 / 158 / 101 kN |

**Te vergelijken grootheden.**

| Grootheid | Referentiewaarde | Onze waarde | Δ | Status |
|---|---|---|---|---|
| Bovenrand naast midden (B107): NEd | −1 477 kN | | | open |
| B107: MEd | 2,86 en −1,05 kN·m; VEd = −1,82 kN | | | open |
| B107: UC | 0,683 | | | open |
| Drukdiagonaal 2e vanaf rechts (B40): NEd | −624,4 kN | | | open |
| B40: UC's | 0,541 en 0,591 | | | open |
| Onderrand midden: NEd / MEd | +1 582 kN / 1,69 kN·m | | | open |
| Onderrand: Npl,Rd / Nu,Rd / Nt,Rd / Mpl,Rd | 2 222 / 1 711 / 1 711 kN / 52,3 kN·m | | | open |
| Onderrand: N/Nt, M/MR, interactie | 0,93 · 0,03 · 0,96 | | | open |
| Trekdiagonaal links: NEd / MEd | 616,3 kN / 1,36 kN·m | | | open |
| Trekdiagonaal: Npl,Rd / Nu,Rd / Nt,Rd / Mel,Rd | 1 956 / 997 / 997 kN / 30,3 kN·m | | | open |
| Trekdiagonaal: N/Nt, M/MR, interactie | 0,62 · 0,05 · 0,67 | | | open |
| Vervangende ligger: globale dwarskracht V | 562 / 461 / 303 / 101 kN (en spiegelbeeld) | | | open |
| Vervangende ligger: Nd = V/cos(theta) | 616 / 405 / 135 kN | | | open |
| Vervangende ligger: globaal moment M | 3 273 / 5 455 / 6 320 kN·m | | | open |
| Vervangende ligger: Nch = M/h | 818 / 1 364 / 1 580 kN | | | open |
| Doorbuiging onder UGT-combinatie | 127 mm | | | open |
| Extra doorbuiging door boutspeling (gat 2 mm) | 58,4 mm | | | open |
| Secundaire momenten randen, liggend IPE 330 | bovenrand 2,7 kN·m · onderrand 1,7 kN·m | | | open |
| Secundaire momenten randen, staand profiel | 28,5 resp. 23,4 kN·m | | | open |
| Eindmomenten diagonalen bij starre knopen | trek 1,03 (liggend) / 1,17 (staand) kN·m; druk 1,30 / 2,35 kN·m; eigen gewicht 1,36 kN·m | | | open |

**Nationale bijlage.** Geen; aanbevolen EN-waarden (gamma_M0 = 1,00, gamma_M2 = 1,25,
gamma_M3 = 1,25).

**Aannames en aandachtspunten.**
- **De veldindeling uit de figuur (7 100 / 7 200 / 8 500 / 8 600 / 7 100 / 7 100) is niet
  symmetrisch terwijl systeem en belasting dat wel zijn.** Dit moet bij het nabouwen
  gecontroleerd worden; als de asymmetrie een leesfout is, ook de symmetrische variant
  doorrekenen en beide noteren.
- Het aantal en de positie van de secundaire diagonalen in de middenvelden staan niet in
  maten. Noteer wat er gemodelleerd is.
- Randen momentvast, diagonalen/posten scharnierend — goede test op gemengde
  verbindingsstijfheid.
- Eigen gewicht: combinatie 1 is **zonder** eigen gewicht; de handberekening is **met**.
  Twee runs.
- Tolerantie 5 %.

**Ontbreekt in de bron.** De volledige staafkrachtenverdeling (alleen 4 maatgevende staven
cijfermatig); karakteristieke belastingen en combinatiefactoren; oplegreacties.

**Conclusie.** _(nog in te vullen)_

---

## 7. Groep E — Hout (EN 1995-1-1)

Doel: kmod/gamma_M-keten, kcr-afschuiving, kip van houten liggers, oplegdruk loodrecht op
de vezel, kruip (kdef) en de BGT-grenzen winst/wfin/wnet,fin.

---

### R19 — Vloerligger 45 × 220 mm C24, overspanning 4,5 m

**Constructie.** Enkelvoudige, vrij opgelegde vloerbalk op twee steunpunten. Zijdelings
gesteund door de vloerplaat, dus geen kip.

**Bron.** Zweeds houtvoorlichtingsinstituut (Svenskt Trä / Swedish Wood), "Design of timber
structures, Volume 3: Examples", editie 3:2022, voorbeeld 3.1 (blz. 5-6) en voorbeeld 7.1
(blz. 44-45).
https://www.swedishwood.com/siteassets/5-publikationer/pdfer/sw-design-of-timber-structures-vol3-2022.pdf

**Invoer.**

| Onderdeel | Waarde |
|---|---|
| Vrije overspanning | l = 4,5 m; balken h.o.h. 0,6 m |
| Doorsnede | b × h = 45 × 220 mm; I = 39,93 · 10^-6 m⁴ |
| Materiaal | Gezaagd naaldhout C24 (EN 338): fm,k = 24 MPa · fv,k = 4,0 MPa · E0,mean = 11 000 MPa |
| Toetsparameters | gamma_M = 1,3 · kmod = 0,8 (gebruiksklasse 1, KLED middellang) · kh = 1,0 · kcr = 0,67 · kdef = 0,6 → fm,d = 14,8 MPa · fv,d = 2,46 MPa · Emean,fin = 6 875 MPa |
| Opleggingen | Vrij opgelegd (scharnier + rol), statisch bepaald |
| UGT | Rekenwaarde qdim = 3,3 kN/m² → lijnlast qd = 0,6 × 3,3 = 2,0 kN/m |
| BGT | Karakteristiek gk = 0,5 kN/m² en qk = 2,0 kN/m² (middellang), woongebouw met psi2 = 0,3; karakteristieke combinatie voor winst, quasi-blijvende combinatie voor wfin |

**Te vergelijken grootheden.**

| Grootheid | Referentiewaarde | Onze waarde | Δ | Status |
|---|---|---|---|---|
| MEd = qd·l²/8 | 5,1 kN·m | | | open |
| VEd = qd·l/2 | 4,5 kN | | | open |
| Benodigd Werf | 345 · 10^-6 m³ | | | open |
| fm,d | 14,8 MPa | | | open |
| fv,d | 2,46 MPa | | | open |
| VRd = (2/3)·kcr·b·h·fv,d | 10,9 kN | | | open |
| winst,G | 3,6 mm | | | open |
| winst,Q | 14,6 mm | | | open |
| winst totaal | 18,2 mm (≈ l/250) | | | open |
| wfin,G | 5,8 mm | | | open |
| wfin,Q | 17 mm | | | open |
| wfin totaal | 22,8 mm (≈ l/200) | | | open |

**Nationale bijlage.** Bewust géén nationale keuzes: de editie 2022 verwijst expliciet naar
de oorspronkelijke EN 1995-1-1 met de aanbevolen waarden (gamma_M = 1,3, kmod = 0,8,
kdef = 0,6, kcr = 0,67). Het Zweedse begrip "safety class 2" wordt genoemd maar heeft hier
geen invloed, omdat de rekenbelasting rechtstreeks gegeven is.

**Aannames en aandachtspunten.**
- Onze houttoetsing draait standaard met de NL NB; voor dit geval de aanbevolen EN-waarden
  aanhouden. Lukt dat niet, dan `NB` noteren.
- Oplegreacties worden niet apart genoemd (gelijk aan VEd = 4,5 kN).
- De buigspanning sigma_m,d en de unity checks worden niet uitgeschreven; alleen het
  benodigde weerstandsmoment.

**Conclusie.** _(nog in te vullen)_

---

### R20 — Parallelligger BSH GL28c 160 × 680 mm met tweezijdige kragarmen (3 + 14 + 3 m)

**Constructie.** Doorgaande, statisch bepaalde ligger op twee steunpunten (A en B) met
kragarmen aan beide zijden; vorkopleggingen bij A en B; bovenrand zijdelings gesteund om
de 4,67 m.

**Bron.** Duitse studiegemeenschap voor gelijmd hout / houtvoorlichtingsdienst,
"holzbau handbuch, Reihe 2, Teil 1, Folge 2: Bemessung von BS-Holz-Bauteilen nach
EN 1995-1-1 (EC 5)", Beispiel 1 (blz. 12-23).
https://www.brettschichtholz.de/publish/binarydata/pdfs/aktuelles/idh_bemessung-von-bs-holz-bauteilen_print_160309.pdf

**Invoer.**

| Onderdeel | Waarde |
|---|---|
| Totale lengte | L = 20,00 m; overspanning tussen steunpunten l = 14,00 m; kragarmen 3,00 m links en rechts |
| Doorsnede | b = 160 mm, h = 680 mm (rekenmodel constant); Wy = 12,3 · 10^-3 m³; I = 4,19 · 10^-3 m⁴ |
| Liggerafstand | a = 6,0 m |
| Oplegging | Opleglengte lA = 240 mm (effectief 270 mm); vorkopleggingen bij A en B |
| Overhoogte | wc = 40 mm (er wordt zowel zonder als met overhoogte getoetst) |
| Materiaal | Gelamineerd hout GL28c (lamellendikte 40 mm), gebruiksklasse 2, KLED kort: fm,k = 28 MPa · E0,g,mean = 12 500 MPa · E0,g,05 = 10 400 MPa · Gg,05 = 540 MPa · fm,g,d = 19,4 MPa · fv,g,d = 2,42 MPa · fc,90,g,d = 1,73 MPa · kdef = 0,8 |
| Opleggingen | A = scharnier, B = rol (statisch bepaald) |
| Belasting | Gelijkmatig verdeeld over de volle 20 m: gk = 3,30 kN/m (permanent) · sneeuw mu·sk = 4,50 kN/m (KLED kort) |
| UGT | gamma_G = 1,35, gamma_Q = 1,5 → qd = 1,35·3,30 + 1,5·4,50 = 11,2 kN/m |
| BGT | Karakteristieke combinatie gk + sk, psi2 = 0 voor sneeuw |

**Te vergelijken grootheden.**

| Grootheid | Referentiewaarde | Onze waarde | Δ | Status |
|---|---|---|---|---|
| max Az,d = ½·qd·L | 112 kN | | | open |
| max Vd = ½·qd·l | 78,4 kN | | | open |
| max veldmoment Map,d | +224 kN·m | | | open |
| Kragarmmoment MA,d | −50,4 kN·m | | | open |
| sigma_c,90,d | 2,59 N/mm² → UC 2,59/(1,75·1,73) = 0,86 | | | open |
| tau_d | 1,52 N/mm² → UC 1,52/2,42 = 0,63 | | | open |
| Kip: sigma_m,crit | 65,6 N/mm² | | | open |
| Kip: lambda_rel,m / kcrit / kh | 0,65 / 1,0 / 1,0 | | | open |
| sigma_m,y,d | 18,2 N/mm² → UC 18,2/19,4 = 0,94 | | | open |
| winst,G (zonder overhoogte) | 24,6 mm | | | open |
| winst,Q | 33,5 mm | | | open |
| winst totaal | 58,1 mm > l/300 = 46,7 mm | | | open |
| wfin = 24,6·(1+0,8) + 33,5·(1+0) | 77,8 mm > l/200 = 70 mm | | | open |

**Nationale bijlage.** Duitse NB (DIN EN 1995-1-1/NA). Afwijkend van de aanbevolen
EC5-waarden: gamma_M = 1,3 voor gelamineerd hout (i.p.v. 1,25); kmod = 0,9 (gebruiksklasse
2, KLED kort); kcr·fv,k = 2,5 N/mm² zodat bef = 0,71·b; factor 1,4 op E0,05·G05 in
sigma_m,crit (EC5 6.31); kdef = 0,8; doorbuigingsgrenzen l/300 (winst) en l/200 (wfin).
**Bij toetsing met de Nederlandse NB zullen fm,g,d, fv,g,d, sigma_m,crit en de
grenswaarden hiervan afwijken** — dat is dan `NB`, geen `ONS`.

**Aannames en aandachtspunten.**
- De tekening toont afgeschuinde kragarmuiteinden (h van 500 naar 680 mm), terwijl de
  doorbuigingsberekening met constante h = 680 mm rekent. **Model met constante h = 680 mm.**
  Voor de snedekrachten maakt het niets uit (statisch bepaald).
- De inkeping bij oplegging B en de sparing worden apart getoetst en beïnvloeden het
  staafmodel niet.

**Conclusie.** _(nog in te vullen)_

---

### R21 — Doorgaande houten bekistingdrager over 3 velden van 1,10 m

**Constructie.** Doorgaande ligger op 4 steunpunten (3 velden), opgebouwd uit 3 staafdelen.

**Bron.** Nederlandse studievereniging voor de uitvoering van betonconstructies, studiecel
D10-2, rapport "Eurocode en Houten Bekistingconstructies", deel 2 (mei 2018), hoofdstuk 4
en bijlage 1.
https://www.stubeco.nl/assets/images/files/D10_2_Eurocode_en_houten_bekistingconstructies.pdf

**Invoer.**

| Onderdeel | Waarde |
|---|---|
| Velden | 3 × 1 100 mm, totaal 3 300 mm; steunpunten op x = 0, 1 100, 2 200, 3 300 mm |
| Context | Onderslagen h.o.h. 1 100 mm; kinderbinten h.o.h. 350 mm; dekdikte 800 mm |
| Profiel | Samengesteld H-profiel 200 × 80 mm; Iy = 4,4693 · 10^7 mm⁴; Iz = 3,4933 · 10^6 mm⁴; Wel,y = 4,4693 · 10^5 mm³; Wel,z = 8,7333 · 10^4 mm³; EI = 450 kN·m² (opgave leverancier) → E = 10 100 N/mm² |
| Drukvlakken | Hout C24 (EN 338): fc,90,k = 2,5 N/mm²; kmod = 0,90; gamma_M = 1,3; kc,90 = 1,5 |
| Opleggingen | Vier verticale steunpunten, scharnierend/rol; oplegging op tooglat b = 59 mm, effectieve opleglengte 80 + 30 + 30 = 140 mm |
| BG1 | Eigen gewicht plaat + drager 0,035 + 0,057 = 0,092 kN/m over de hele lengte |
| BG2 | Massa vloeibaar beton 7,28 kN/m over de hele lengte |
| BG3 "VB links" | 0,53 kN/m over het grootste deel + 0,26 kN/m aan de rechterzijde |
| BG4 "VB midden" | 0,26 / 0,53 / 0,26 kN/m |
| Herkomst veranderlijke last | EN 1991-1-6 §4.11.2 (1,50 kN/m² binnen werkvlak, 0,75 kN/m² daarbuiten, × 0,35 m) |
| Combinaties | 6.10a en 6.10b volgens NEN-EN 1990/NB tabel A1.2(B), groep B; CC2 met KFI = 1,0; psi = 1,0 |
| Maatgevend 6.10b | 1,2·(0,035 + 0,057) + 1,5·7,28 + 1,5·1,0·0,53 = 11,83 kN/m |
| BGT (6.14b) | 0,092 + 7,28 + 0,53 = 7,90 kN/m |

**Te vergelijken grootheden.**

| Grootheid | Referentiewaarde | Onze waarde | Δ | Status |
|---|---|---|---|---|
| Vz bij steunpunt 1 (x = 0) | 5,22 kN | | | open |
| Vz links van steunpunt 2 (x = 1 100) | −7,79 kN | | | open |
| Vz rechts van steunpunt 2 | +7,75 kN | | | open |
| My bij steunpunt 2 | −1,42 kN·m | | | open |
| My bij steunpunt 3 | −1,41 kN·m | | | open |
| My in het veld bij x = 440 mm | +1,15 kN·m | | | open |
| Samenvatting: MEd / VEd / REd / w | 1,42 kN·m / 7,79 kN / 14,30 kN / 0,2 mm | | | open |
| BGT-oplegreacties "links" | 3,48 / 9,56 / 9,52 / 3,40 kN (Rx = 0, My = 0) | | | open |
| BGT-oplegreacties "midden" | 3,45 / 9,55 / 9,55 / 3,45 kN | | | open |
| BGT: uz bij x = 550 mm | −0,2 mm | | | open |
| BGT: hoekverdraaiing fiy bij x = 0 / x = 3 300 | +0,6 / −0,6 mrad | | | open |
| Toets oplegdruk | sigma_c,90,d = 14,30·10³/(59·140) = 1,73 ≤ 1,5 × 1,73 = 2,60 N/mm² | | | open |
| Toets dwarskracht | VEd 7,79 < VRd 16,5 kN | | | open |
| Toets moment | MEd 1,42 < MRd 7,5 kN·m | | | open |
| Toets doorbuiging | w 0,2 < wmax = 1 100/400 = 2,75 mm | | | open |

**Nationale bijlage.** **Nederlandse NB** — het enige geval in de campagne dat de volledige
NL-keten gebruikt: NEN-EN 1990/NB tabel A1.2(B) met 6.10a/6.10b, CC2 en KFI = 1,0;
NEN-EN 1995-1-1+A1/C1 (nov. 2011) met gamma_M = 1,3 en kmod = 0,90; NEN-EN 1991-1-6 §4.11.2.

**Aannames en aandachtspunten.**
- De exacte begrenzing van de deellasten in BG3 en BG4 staat alleen getekend, niet in maten
  (kennelijk een werkvlak van 3,0 m op een ligger van 3,3 m). De bron meldt dat de
  maatgevende waarden hierdoor niet meetbaar veranderen; de gerapporteerde waarden komen
  tot op 2 decimalen overeen met de analytische oplossing voor een gelijkmatig belaste
  3-veldsligger. **Aanname: reken met een gelijkmatig verdeelde last over de volle lengte
  en noteer dat.**
- **Interne inconsistentie in de bron:** de reactietabellen in bijlage 1 §7 heten "Reacties
  UGT" terwijl de kolom Combinaties "BGT links/midden" vermeldt. De waarden passen bij BGT.
- De zakking is slechts op 1 decimaal gegeven (0,2 mm) — daarop is nauwelijks te toetsen.

**Conclusie.** _(nog in te vullen)_

---

### R22 — Houten garagebouw: gordingen, hoofdligger met kraagarm, houten kolommen op knik

**Constructie.** Drie gelijke hoofddraagsystemen (hoofdligger plus kolommen). De gordingen
zijn tweeveldsliggers die op de hoofdliggers rusten. De hoofdligger is een ligger op twee
steunpunten A en B met een kraagarm voorbij B, belast door de gordingen (in de uitwerking
als gelijkmatig verdeelde belasting behandeld). Onder de hoofdligger twee houten kolommen:
kolom 1 eendelig, kolom 2 tweedelig.

**Bron.** Hogeschool Augsburg, opleiding Bouwkunde, tentamen Houtbouw zomersemester 2011
met volledige uitwerking (lesmateriaal Prof. Colling).
https://www.hs-augsburg.de/~colling/holzbau-colling/pdf/holzbau/HB_SS_11_EC5.pdf

**Invoer.**

| Onderdeel | Waarde |
|---|---|
| Gording | Tweeveldsligger, twee velden van 3,50 m; gordingafstand op de hoofdligger 0,75 m |
| Hoofdligger | Overspanning l = 4,50 m (gebruikt in M0 = q·4,5²/8 en in de doorbuigingsformule met l = 4 500 mm) plus een kraagarm voorbij B |
| Kolomhoogte | H = 2,80 m (kniktoets: lambda_ef = 280 cm / i) |
| Overige figuurmaten | 3,50 m (2×), 0,75 m (4×); bij de kolommen lf = 4,5 m (kolom 1) en lk = 1,5 m (kolom 2) |
| Gordingen | Naaldhout C24, b/h = 8/12 cm (A = 96 cm², W = 192 cm³, I = 1 152 cm⁴), gebruiksklasse 2 |
| Hoofdligger | Gelamineerd hout GL28c, b/h = 12/24 cm, gebruiksklasse 2, zijdelings gehouden bij de opleggingen (lef = 4,50 m) |
| Kolom 1 | C24, b/h = 12/12 cm, gebruiksklasse 3 |
| Kolom 2 | C24, tweedelig 2 × 8/16 cm, gebruiksklasse 3 |
| Lastduurklasse | Kort (sneeuw, terreinhoogte < 1 000 m) |
| Uitgangsbelasting | gk = 0,72 kN/m² en sk = 0,90 kN/m² (terreinhoogte 450 m boven NN) |
| Gording (h.o.h. 0,75 m) | gk = 0,54 kN/m; sk = 0,675 kN/m |
| Hoofdligger | gk = 3,15 kN/m; sk = 3,93 kN/m (afgeleid uit de oplegreactie B van de gordingen gedeeld door de gordingafstand; eigen gewicht hoofdligger verwaarloosbaar) |
| Partiële factoren | 1,35 resp. 1,50 |

**Te vergelijken grootheden.**

| Onderdeel | Grootheid | Referentiewaarde | Onze waarde | Δ | Status |
|---|---|---|---|---|---|
| Gording | max A | 2,29 kN | | | open |
| Gording | max VB,links | −3,81 kN | | | open |
| Gording | min MB | −2,67 kN·m | | | open |
| Gording | Benodigde oppervlakte oplegging A / B | 24,8 / 31,8 cm² (B maatgevend) | | | open |
| Gording | Benodigd W / I | 160,7 cm³ / 740, 669, 592 cm⁴ (drie doorbuigingseisen) | | | open |
| Hoofdligger (gk) | Ak / Bk / VB,links / MB / Mveld | 6,30 / 12,60 kN / −7,88 kN / −3,54 / +6,30 kN·m | | | open |
| Hoofdligger (sk) | Ak / Bk / VB,links / MB / Mveld | 7,86 / 15,72 kN / −9,83 kN / −4,42 / +7,86 kN·m | | | open |
| Hoofdligger | max Vd / max Md | 25,38 kN / 20,30 kN·m | | | open |
| Hoofdligger | tau_d | 1,85 < 2,42 N/mm² (eta = 0,76) | | | open |
| Hoofdligger | sigma_m,d | 17,62 < 1,10 × 19,38 N/mm² (eta = 0,83) | | | open |
| Hoofdligger | kw / kDLT | 3,065 / 0,734 | | | open |
| Hoofdligger | w*inst | 15,9 mm tegen grens 4 500/300 = 15 mm (**niet voldaan**) | | | open |
| Hoofdligger | wfin | 21,6 < 22,5 mm | | | open |
| Hoofdligger | wnet,fin | 12,7 < 15 mm | | | open |
| Oplegging A | Aef / Ad / sigma | 180 cm² / 20,30 kN / 1,13 < 3,27 N/mm² (eta = 0,35) | | | open |
| Kolom 1 | Nd / lambda_ef / kc / sigma_c | 20,30 kN / 80,7 / 0,440 / 1,41 < 4,94 N/mm² (eta = 0,28) | | | open |
| Kolom 2 | Nd / per deel / lambda_ef / kc / sigma_c | 40,59 kN / 20,30 kN / 121,1 / 0,212 / 1,59 < 2,40 N/mm² (eta = 0,66) | | | open |
| Aansluiting B | Fd / weerstand | 40,59 / 42,4 kN (eta = 0,96) | | | open |

**Nationale bijlage.** Duitse NB bij EN 1995-1-1 (DIN EN 1995-1-1/NA): gamma_M = 1,3;
gebruikte factoren kmod/gamma_M = 0,692 (gebruiksklasse 2, KLED kort) en 0,538
(gebruiksklasse 3); kcr = 0,500 voor massief hout en 0,714 voor gelamineerd hout.

**Aannames en aandachtspunten.**
- **De kraagarmlengte van de hoofdligger en de exacte positie van de kolommen staan alleen
  in de figuur.** De tekst geeft wel overspanning 4,50 m en de karakteristieke
  snedekrachten; daaruit is de kraagarm terug te rekenen. Leg de gekozen kraagarmlengte
  vast als aanname en controleer of Ak = 6,30 kN en Bk = 12,60 kN gereproduceerd worden —
  dat is de sluitende controle op de geometrie.
- De gordingreacties zijn als **lijnlast** op de hoofdligger omgerekend, niet als
  puntlasten. Volg de bron.
- Kolom 1 en kolom 2 zijn losse kniktoetsen; de app hoeft ze niet in hetzelfde model te
  hebben.
- Tolerantie 5 %.

**Ontbreekt in de bron.** Verplaatsingen van de kolommen.

**Conclusie.** _(nog in te vullen)_

---

## 8. Groep F — Bijzondere belastingen en opleggingen

Doel: temperatuurbelasting, opgelegde vervorming als voorspanning, veeropleggingen en
continu verende ondersteuning. Dit zijn de functies die in de andere groepen niet aan bod
komen.

---

### R23 — Statisch bepaald raamwerk met scharnier, pendelstaaf en temperatuurbelasting

**Constructie.** Statisch bepaald raamwerk. Ingeklemde horizontale ligger a–b met een
scharnier in b, daarop een doorgaande verticale kolom b–c–d–f met een uitkraging f–g, en
een horizontale pendelstaaf e–d die het geheel zijdelings vasthoudt. De
normaalkrachtvervorming wordt uitsluitend in staaf e–d meegenomen.

**Bron.** Hochschule Wismar, Fakultät für Ingenieurwissenschaften, Modulprüfung Baustatik I
van 30 januari 2013, met volledige uitwerkingen (Prof. Dr.-Ing. R. Dallmann), opgave 5.
https://dallmann.bau.hs-wismar.de/images/Bachelor/13a_l.pdf

**Invoer.**

| Onderdeel | Waarde |
|---|---|
| Knopen (m) | a (0; 0) · b (4; 0) · c (4; 3) · d (4; 6) · f (4; 8) · g (5,5; 8) · e (0; 6) |
| Staaflengtes | a–b = 4 m · b–c = 3 m · c–d = 3 m · d–f = 2 m · f–g = 1,5 m · e–d = 4 m |
| Buigstijfheid | EI = 12 000 kN·m² voor alle op buiging belaste staven |
| Rekstijfheid | EA = 24 000 kN **uitsluitend** voor staaf e–d |
| Uitzettingscoëfficiënt | alpha_T = 1,2 · 10^-5 per K |
| Opleggingen | a volledig ingeklemd · e oplegging waarop de pendelstaaf e–d aansluit (scharnieren aan beide einden → alleen horizontale reactie) · scharnier in b tussen ligger a–b en kolom b–f |
| Belastinggeval 1 | Horizontale puntlast 20 kN naar rechts in f · verticale puntlast 10 kN omlaag in g · horizontale puntlast 30 kN naar rechts in c · horizontale lijnlast 15 kN/m naar rechts over de volle hoogte b–d (6 m) |
| Belastinggeval 2 | Gelijkmatige verwarming van **uitsluitend** staaf a–b met ΔT = 40 K |

**Te vergelijken grootheden.**

| Geval | Grootheid | Referentiewaarde | Onze waarde | Δ | Status |
|---|---|---|---|---|---|
| 1 | Horizontale reactie in e | 89,166667 kN | | | open |
| 1 | Buigend moment in a | 40 kN·m | | | open |
| 1 | Buigend moment in d | 55 kN·m | | | open |
| 1 | Buigend moment in f | 15 kN·m | | | open |
| 1 | Buigend moment op halve hoogte b–d (punt c) | 85 kN·m (= 67,5 + 45 − 55/2) | | | open |
| 1 | Verticale zakking van punt g | 0,019618056 m | | | open |
| 2 | Verdraaiing van punt c door de verwarming | −0,00032 rad | | | open |

**Nationale bijlage.** N.v.t. — zuivere krachtsverdeling en vervormingsberekening.

**Aannames en aandachtspunten.**
- **Modelleeraandachtspunt:** de handberekening verwaarloost de normaalkrachtvervorming in
  álle staven behalve e–d. Geef de overige staven een zeer grote EA (of zet
  normaalkrachtvervorming uit voor die staven) om de referentie te reproduceren.
- De geometrie staat alleen in de figuur; elk getal in de uitwerking is tegen die figuur
  gecontroleerd en klopt eenduidig: 89,166667 = (10·1,5 + 20·8 + 15·6²/2 + 30·3)/6,
  M_a = 10·4 = 40, M_d = 15 + 20·2 = 55, 15·6²/8 = 67,5, 30·6/4 = 45.
- Belastinggeval 2 is het temperatuurgeval: alleen staaf a–b krijgt ΔT = +40 K; de overige
  staven alpha_T = 0. Als de app alpha_T niet per staaf kan zetten, is dat een tekortkoming
  om te noteren.

**Ontbreekt in de bron.** Dwarskrachten- en normaalkrachtenlijn; reacties in a behalve het
inklemmoment.

**Conclusie.** _(nog in te vullen)_

---

### R24 — Onderspannen ligger met een door temperatuurdaling voorgespannen trekstang

**Constructie.** Onderspannen ligger: een doorgaande rechte ligger A–D–H–F–B met daaronder
een onderspanning van scharnierende staven A–C, C–E, E–B en twee verticale scharnierende
drukstaven C–D en E–F. Statisch onbepaald. De trekstang C–E is voorgespannen door hem een
temperatuurdaling op te leggen; alleen die staaf heeft een uitzettingscoëfficiënt ongelijk
aan nul.

**Bron.** Franse validatiebundel (AFNOR/SFM 1990), geval SSLL13.
https://www.icab.eu/guide/valid/ssll.html#ssll13 —
https://www.icab.eu/guide/valid/icab_guide_ssll.pdf (blz. 23-24)

**Invoer.**

| Onderdeel | Waarde |
|---|---|
| Ligger (m) | A (0; 0) · D (2; 0) · H (4; 0, midden) · F (6; 0) · B (8; 0) |
| Onderspanning (m) | C (2; −0,6) · E (6; −0,6) |
| Maten | Overspanning 8,00 m; onderspanning 0,60 m diep; trekstang C–E is 4,00 m |
| E / nu | 2,1 · 10^11 Pa / 0,25 voor alles |
| Uitzettingscoëfficiënt | alpha = 0 voor alles **behalve** staaf C–E: alpha = 1,0 · 10^-5 /K |
| Ligger (A–D, D–H, H–F, F–B) | A = 0,01516 m²; Izz = 2,174 · 10^-4 m⁴; dwarskrachtfactor SRY = 2,5 |
| Scharnierende staven A–C, C–E, E–B | A = 4,5 · 10^-3 m² |
| Verticale scharnierende staven C–D, E–F | A = 3,48 · 10^-3 m² |
| Opleggingen | A scharnier (ux = uy = 0) · B rol (uy = 0, horizontaal vrij); knopen C en E scharnierend (rotatie vrij → pendelstaven) |
| Belasting 1 | Gelijkmatig verdeelde lijnlast −50,0 · 10³ N/m op alle vier de liggerdelen (volle 8,00 m) |
| Belasting 2 | ΔT = −163,0 K, werkend uitsluitend in trekstang C–E → opgelegde verkorting L·alpha·ΔT = −6,52 · 10^-3 m |

**Te vergelijken grootheden.**

| Grootheid | Referentiewaarde | Aard | Onze waarde | Δ | Status |
|---|---|---|---|---|---|
| Trekkracht in staaf C–E | 584 584,0 N | analytisch | | | open |
| Buigend moment in H (midden) | 49 249,5 N·m | analytisch | | | open |
| Verticale verplaatsing van knoop D | −0,000 542 8 m | **gemiddelde van rekenprogramma-uitkomsten** | | | open |

**Nationale bijlage.** N.v.t.

**Aannames en aandachtspunten.**
- De verplaatsing van D is **geen analytische waarde** maar een gemiddelde van
  programma-uitkomsten volgens de bron; als referentie zwakker dan de twee analytische
  waarden. Tolerantie ruimer aanhouden (bijv. 5 %) en dat noteren.
- Eigen kruiscontrole (arithmetiek): 50 000·8²/8 − 584 584·0,6 = 400 000 − 350 750 =
  49 250 N·m, exact de opgegeven 49 249,5 N·m. Invoer en uitkomsten zijn consistent.
- Als de app geen per-staaf uitzettingscoëfficiënt kent, kan de voorspanning ook als
  opgelegde verkorting van −6,52 · 10^-3 m ingevoerd worden (de bron noemt dit expliciet
  als alternatief). Noteer welke route gekozen is.
- De ligger heeft een dwarskrachtfactor SRY = 2,5; zie R12 voor de aanname over
  dwarskrachtvervorming.

**Ontbreekt in de bron.** Oplegreacties.

**Conclusie.** _(nog in te vullen)_

---

### R25 — Doorgaande ligger op drie steunpunten, middensteunpunt op een verticale veer

**Constructie.** Rechte doorgaande ligger op drie steunpunten; het middensteunpunt is een
verticale veer. Eenvoudig statisch onbepaald, analytisch exact in gesloten vorm oplosbaar.

**Bron.** Franse validatiebundel (AFNOR/SFM 1990), geval SSLL03.
https://www.icab.eu/guide/valid/icab_guide_ssll.pdf
(overzichtspagina: https://www.icab.eu/guide/valid/ssll.html)

**Invoer.**

| Onderdeel | Waarde |
|---|---|
| Ligger | A–C, totale lengte 4L = 12 m. A op x = 0 · B (middensteunpunt) op x = 6 · C op x = 12 m |
| Lastpunten | x = 3 m en x = 9 m |
| E / Izz / A | 2,1 · 10^11 Pa / 6,3 · 10^-4 m⁴ / 1,0 · 10^-2 m² (EI = 1,323 · 10^8 N·m²) |
| Opleggingen | A en C verticaal ondersteund, rotatie vrij (rol/scharnier). B: **verticale veer** met Ky = 2,1 · 10^6 N/m naar een vast punt. Alleen buiging in het vlak; horizontale verplaatsing uitgeschakeld |
| Belasting | Twee verticale puntlasten F = −42 · 10³ N (42 kN omlaag) op x = 3 m en x = 9 m |

**Te vergelijken grootheden.**

| Grootheid | Referentiewaarde | Onze waarde | Δ | Status |
|---|---|---|---|---|
| Doorbuiging in B (veerknoop) | −0,010 m | | | open |
| Reactiekracht in de veer | 21 000 N | | | open |

**Nationale bijlage.** N.v.t.

**Aannames en aandachtspunten.**
- Verificatie met de gesloten formule (twee symmetrische puntlasten plus veerverenigbaarheid)
  reproduceert 21 000 N en 0,010 00 m exact; de referentie is dus betrouwbaar.
- Goede test op de veeroplegging in de app: veerstijfheid exact 2,1 · 10^6 N/m.
- Geen profiel of staalsoort in de bron — alleen E, I en A, wat voor krachtsverdeling
  volstaat.

**Ontbreekt in de bron.** Momenten- en dwarskrachtenlijn; oplegreacties in A en C.

**Conclusie.** _(nog in te vullen)_

---

### R26 — Ligger op elastische ondergrond met vrije uiteinden

**Constructie.** Rechte, slanke ligger die volledig op een elastische ondergrond rust; er
zijn géén gewone opleggingen, de ligger wordt alleen door de verende ondergrond gedragen.
De ondergrond wordt gemodelleerd als een reeks discrete verticale veren. Tevens een
convergentietest op de elementindeling.

**Bron.** Franse validatiebundel (AFNOR/SFM 1990), geval SSLL15.
https://www.icab.eu/guide/valid/ssll.html#ssll15 —
https://www.icab.eu/guide/valid/icab_guide_ssll.pdf (blz. 27-29)

**Invoer.**

| Onderdeel | Waarde |
|---|---|
| Ligger | A (x = −2,483647 m) · C (x = 0, midden) · B (x = +2,483647 m); totale lengte AB = 4,9673 m = pi·√10/2 |
| Indelingen | Variant a: 2 staafelementen (A–C, C–B). Variant b: 8 staafelementen met tussenknopen |
| E / I | 2,1 · 10^11 Pa / 1,0 · 10^-4 m⁴ (EI = 2,1 · 10^7 N·m²) |
| Doorsnede-oppervlak | Niet opgegeven; voor dit geval niet nodig |
| Ondergrond | Lineïeke veerstijfheid 840 · 10³ N/m per strekkende meter, gediscretiseerd als verticale veren onder de knopen |
| Veren bij 2 elementen | K = 1 043 131,8 N/m onder A en onder B; K = 2 086 263,5 N/m onder C |
| Veren bij 8 elementen | K = 260 782,9 N/m onder de uiteinden; K = 521 565,9 N/m onder elk van de 7 tussenknopen |
| Belasting | Drie puntlasten van −10 · 10³ N in A, in C en in B |

**Te vergelijken grootheden.**

| Grootheid | Analytische referentie | 2 staven (bron) | 8 staven (bron) | Onze waarde | Status |
|---|---|---|---|---|---|
| Buigend moment My in C | 5 759 N·m | 5 510 (−4 %) | 5 901 (+2 %) | | open |
| Zakking in C | −0,006 844 m | −6,92·10^-3 (+1 %) | −6,901·10^-3 (+0,8 %) | | open |
| Zakking in A | −0,007 854 m | −7,46·10^-3 (−5 %) | −7,848·10^-3 (−0,07 %) | | open |
| Rotatie in A | −0,000 706 rad | −0,326·10^-3 (−54 %) | −0,693·10^-3 (−2 %) | | open |

**Nationale bijlage.** N.v.t.

**Aannames en aandachtspunten.**
- **Tegenstrijdigheid in de bron:** de kopregel vermeldt L(AC) = L(CB) = pi·√10/2 = 4,967 m,
  terwijl de knoopcoördinaten A op −2,483647 en B op +2,483647 zetten (dus 2,4836 m per
  helft, 4,9673 m totaal). De veerstijfheden (som = 840·10³ × 4,9673) en de betrekking
  lambda·L = pi/2 bevestigen dat de **totale** liggerlengte 4,9673 m is; de kopregel is fout.
- In de 8-staafsindeling bevatten twee knoopcoördinaten (−1,8267 en −0,6091) kennelijk
  tikfouten ten opzichte van de gelijkmatige verdeling die bij de opgegeven veerstijfheden
  hoort (verwacht −1,8627 en −0,6209). **Bouw de indeling gelijkmatig op.**
- Nagerekend: de som van de veerstijfheden is in beide varianten 4 172 527 N/m =
  840·10³ × 4,9673 m — consistent.
- Twee modellen opslaan (R26a met 2 elementen, R26b met 8) zodat ook de convergentie
  vergelijkbaar is. Dit is tevens een test op onze meshverfijning van staven.
- Vereist veeropleggingen op tussenknopen; controleer of de app dat toestaat.

**Ontbreekt in de bron.** Doorsnede-oppervlak; veerkrachten/oplegreacties.

**Conclusie.** _(nog in te vullen)_

---

## 9. Zwakkere gevallen — apart gezet

Deze vier voldoen **niet** aan de volledigheidseis en tellen niet mee in de 26. Ze mogen
gebruikt worden voor het beperkte doel dat er bij staat; gebruik ze **niet** als bewijs
dat onze krachtsverdeling klopt.

---

### Z1 — Kolom IPE 360 S355 van een industriehal onder druk en buiging

**Wat er ontbreekt.** Opleggingen, uitwendige belastingen en het bijbehorende raamwerk
ontbreken volledig: de snedekrachten zijn **invoer**, geen uitkomst. Alleen de
EN 1993-1-1-toetsmodule is hiermee te valideren, niet de krachtsverdeling.

**Bron.** Joint Research Centre van de Europese Commissie, "Eurocodes: Background and
Applications — Design of Steel Buildings. Worked examples" (JRC96658, 2015), hoofdstuk 1,
voorbeeld 6, blz. 68-71.
https://publications.jrc.ec.europa.eu/repository/handle/JRC96658 —
https://publications.jrc.ec.europa.eu/repository/bitstream/JRC96658/jrc_steel_report_2015_07_22.pdf

**Invoer.** Kolomlengte 6,0 m met zijdelingse steunen aan voet, halve hoogte en kop
(velden 2 × 3,0 m). Kniklengte in het vlak LE,y = 6,0 m; uit het vlak LE,z = 3,0 m;
kiplengte L = 3,00 m. IPE 360, S355; fy = 355 N/mm², E = 210 GPa, G = 81 GPa;
A = 72,73 cm², h = 360 mm, b = 170 mm, Wel,y = 903,6 cm³, Wpl,y = 1 019 cm³,
Iy = 16 270 cm⁴, iy = 14,95 cm, Wel,z = 122,8 cm³, Wpl,z = 191,1 cm³, Iz = 1 043 cm⁴,
iz = 3,79 cm, IT = 37,32 cm⁴, IW = 313,6·10³ cm⁶.
Snedekrachten (invoer): NEd = 280,0 kN constant; My,Ed lineair van 0 kN·m aan de voet via
−110 kN·m op halve hoogte naar −220,0 kN·m aan de kop. Dwarskracht verwaarloosbaar.

**Te vergelijken grootheden (alleen toetsmodule).**

| Grootheid | Referentiewaarde | Onze waarde | Δ | Status |
|---|---|---|---|---|
| Eerste-orde benuttingsgraad maatgevende doorsnede | UF = 0,61 | | | open |
| alpha | 0,759 | | | open |
| Lijf / flens / doorsnede | klasse 2 (c/tw = 37,3; grens 36,2 kl.1, 41,7 kl.2) / klasse 1 / klasse 2 | | | open |
| Npl,Rd | 2 581,9 kN | | | open |
| Mpl,y,Rd | 361,7 kN·m | | | open |
| lambda_y / phi_y / chi_y (alpha = 0,21) | 0,53 / 0,68 / 0,90 | | | open |
| lambda_z / phi_z / chi_z (alpha = 0,34) | 1,04 / 1,18 / 0,58 | | | open |
| psi / C1 / Mcr | 0,50 / 1,31 / 649,9 kN·m | | | open |
| lambda_LT / alpha_LT / phi_LT / chi_LT | 0,75 / 0,49 / 0,80 / 0,79 | | | open |
| kc / f / chi_LT,mod | 0,86 / 0,93 / 0,85 | | | open |
| Cmy / CmLT / kyy / kzy | 0,60 / 0,80 / 0,624 / 0,966 | | | open |
| UC (6.61) | 0,56 | | | open |
| UC (6.62) | 0,88 | | | open |

**Nationale bijlage.** Geen; aanbevolen EN-waarden (gamma_M0 = gamma_M1 = 1,00), Methode 2
(Bijlage B) voor de interactiefactoren.

**Let op.** De conclusieregel van het voorbeeld noemt abusievelijk "HEB 320" terwijl het om
een IPE 360 gaat (kopieerfout in de bron; HEB 320 hoort bij het volgende voorbeeld).

---

### Z2 — Houten kolom C18 71 × 171 mm onder druk en buiging (EN 1995-1-1 art. 6.3.2)

**Wat er ontbreekt.** Het oplegschema staat niet in de bron (alleen de kniklengten). Er is
geen belastinggeval of EN 1990-combinatie: NEd en My,Ed zijn rechtstreeks als invoer
opgegeven. De krachtsverdeling valt hiermee **niet** te valideren, alleen de
toetsingsformules. Ook ontbreken BGT-uitkomsten.

**Bron.** Nederlands kenniscentrum/uitgever van Eurocode-rekenbladen, gepubliceerd
voorbeeldrekenblad "H 6_3_2 kolom druk en buiging EC_NL", versie 2.4.4, NDP: NL,
printdatum 12-12-2011.
https://www.quickeurocode.nl/pdf/Rekenbladen/5_Hout_H%206_3_2%20kolom%20druk%20en%20buiging%20EC_A_NL_NL.pdf

**Invoer.** ly = lz = 2 800 mm. Gezaagd naaldhout C18, b × h = 71 × 171 mm (h in de
buigrichting). A = 121,4 cm²; Wy = 346,0 cm³; Wz = 143,7 cm³; Iy = 2 958·10⁴ mm⁴;
Iz = 510·10⁴ mm⁴; iy = 49,4 mm; iz = 20,5 mm. fm,k = 18 · fc,0,k = 18 · ft,0,k = 11 ·
fv,k = 3,4 N/mm²; E0,mean = 9 000 · E0,05 = 6 000 · G = 560 N/mm²; rho_k = 320 kg/m³.
gamma_M = 1,30; klimaatklasse 1; kmod = 0,90 (belastingduurklasse kort); kdef = 0,60;
psi2 = 0,3; beta_c = 0,2; km = 0,7; kh = 1,00.
Snedekrachten (invoer): NEd = 6 kN druk; My,Ed = 4 kN·m; Mz,Ed = 0.

**Te vergelijken grootheden (alleen toetsmodule).**

| Grootheid | Referentiewaarde | Onze waarde | Δ | Status |
|---|---|---|---|---|
| sigma_c,0,d | 0,5 N/mm² | | | open |
| sigma_m,y,d / sigma_m,z,d | 11,6 / 0,0 N/mm² | | | open |
| fc,0,d | 12,46 N/mm² (in de toetsing afgerond 12,5) | | | open |
| fm,y,d = fm,z,d | 12,46 N/mm² | | | open |
| lambda_y / lambda_z | 56,7 / 136,6 | | | open |
| lambda_rel,y / lambda_rel,z | 0,989 / 2,382 | | | open |
| ky / kz | 1,06 / 3,54 | | | open |
| kc,y / kc,z | 0,70 / 0,16 | | | open |
| UC formule 6.23 | 0,98 | | | open |
| UC formule 6.24 | 0,89 | | | open |
| 6.19 en 6.20 | niet van toepassing (lambda_rel > 0,3) | | | open |

**Nationale bijlage.** Nederlandse NB (het rekenblad vermeldt expliciet "NDP: NL");
gamma_M = 1,30 en kmod volgens NEN-EN 1995-1-1 met NB. **Waardevol**: dit is samen met R21
het enige geval dat onze standaard-NB gebruikt.

**Let op.** Eigen narekening: 0,5/(0,70·12,46) + 11,6/12,46 = 0,99 en
0,5/(0,16·12,46) + 0,7·11,6/12,46 = 0,90 — consistent met de opgegeven 0,98 en 0,89
(afrondverschil). E0,05,fin = 5 085 N/mm² wordt wel berekend maar **niet** in de kniktoets
gebruikt, omdat de correctie volgens art. 2.3.2.2(2) op "nee" staat.

---

### Z3 — Gekoppelde staafwerkkolom 10 m met N-vormig verband

**Wat er ontbreekt.** De bron is volledig, maar de referentiewaarden komen uit de gesloten
methode van EN 1993-1-1 §6.4 (effectief traagheidsmoment Ieff, afschuifstijfheid Sv,
imperfectie e0), niet uit een raamwerkberekening. Om dit met onze app te vergelijken zou
het verband als echt vakwerk gemodelleerd moeten worden; dan zijn de uitkomsten per
definitie anders dan de methode-uitkomsten. Bruikbaar als **methodecontrole**, niet als
solvervalidatie.

**Bron.** Europese ontwerpgidsreeks voor eenlaagse stalen gebouwen, deel 6 "Detailed Design
of Built-up Columns" (2009).
https://constructalia.arcelormittal.com/files/SSB06%20Detailed%20design%20of%20built-up%20columns--245eb18d61918d1801dfd2a313ea6331.pdf

**Invoer.** L = 10,00 m; h0 = 0,80 m; paneelhoogte a = 1,25 m (8 panelen);
diagonaallengte d = √(0,80² + 1,25²) = 1,48 m; n = 2 verbandvlakken. Kolommen HEA 220,
S355 (Ach = 64,3 cm², iy = 9,17 cm, iz = 5,51 cm, flens c/tf = 8,05, lijf c/tw = 21,7,
klasse 2 bij zuivere druk). Diagonalen L90×90×9, S355 (Ad = 15,52 cm², iy = iz = 2,73 cm,
iu = 3,44 cm, iv = 1,75 cm). Posten L80×80×8, S355 (Av = 12,27 cm², iy = iz = 2,43 cm,
iu = 3,06 cm, iv = 1,56 cm). Scharnierend aan beide uiteinden in het vlak; zijdelings
gesteund aan de uiteinden en op halve hoogte. NEd = 900 kN druk en M_Ed,I = 450 kN·m aan de
kop; e0 = L/500 = 20 mm.

**Te vergelijken grootheden.**

| Grootheid | Referentiewaarde | Onze waarde | Δ | Status |
|---|---|---|---|---|
| Ieff = 0,5 × 80² × 64,3 | 205 800 cm⁴ | | | open |
| Sv | 134 100 kN | | | open |
| Ncr | 42 650 kN | | | open |
| MEd incl. imperfectie en 2e orde | 481,4 kN·m | | | open |
| Nch,Ed (meest gedrukte kolom) | 1 052 kN | | | open |
| Lcr,z = 0,9·a | 1,125 m | | | open |
| lambda_z / lambda_1 / relatieve slankheid | 20,42 / 76,06 / 0,268 | | | open |
| Kromme c, alpha / phi / chi_z | 0,49 / 0,553 / 0,965 | | | open |
| Nb,z,Rd / UC | 2 203 kN / 0,477 | | | open |
| Maximale dwarskracht VEd | 191,2 kN | | | open |
| Drukkracht in de diagonaal Nd,Ed / UC | 176,86 kN (in de toetsing 176,8) / 0,62 | | | open |
| Kracht in de horizontale regel Nh,Ed | 191,2 kN | | | open |

**Nationale bijlage.** Geen; de bron stelt expliciet dat geen nationale bijlage is
beschouwd en dat de aanbevolen EN-waarden zijn gebruikt.

**Let op.** Het figuurbijschrift in de bron noemt afwijkend "chords HEA 200, posts
hoekstaal 90×9, diagonals hoekstaal 80×8"; alle doorgerekende getallen horen bij
**HEA 220**-kolommen, **L90×9**-diagonalen en **L80×8**-posten. Verplaatsingen worden niet
gegeven; de verdeling van het moment over kop en voet is niet nader gespecificeerd dan
"aangebracht aan de kop".

---

### Z4 — Tweelaags geschoord stalen portaal met trekdiagonalen

**Wat er ontbreekt.** Uit de lineair-elastische analyse worden **geen** momenten,
dwarskrachten, oplegreacties of verplaatsingen als getal gegeven; alleen de maximale
trekkracht in de schoor. De rest van de bron gaat over aardbevingsbelasting (dynamische
analyse en push-over), wat buiten het bereik van de app valt. Bruikbaar als één enkel
controlepunt.

**Bron.** Onafhankelijk Nederlands onderzoeksinstituut, rapport 2017 R11563
(voorbeeldberekening bij NPR 9998:2018), gepubliceerd via het Nederlandse normalisatie-
instituut.
https://www.nen.nl/media/PDFjes/Voorbeeldberekening_bij_NPR_9998-2018_Geschoord_portaal_kantoorgebouw_2018-11.pdf

**Invoer.** Overspanning b = 8,00 m; verdiepingshoogte h = 3,50 m; totale hoogte
H = 7,00 m; kolomlengte 7,00 m; trekdiagonalen d = 8,73 m (= √(8,00² + 3,50²)); portalen
h.o.h. 4,00 m; gebouwlengte 12,00 m. Kolommen HEA 240; dakligger IPE 220; vloerligger
IPE 360; trekverbanden strip 40 × 10 mm; S235 (fy = 235 N/mm², E = 210 000 N/mm²).
Ligger-kolomverbindingen scharnierend; windverband-kolomverbindingen scharnierend; in de
push-over zijn de kolomvoeten rotatieveren met momentcapaciteit 30,5 kN·m en
beginstijfheid 6 000 kN·m/rad.
Verticale belasting: dak permanent 5 kN/m en veranderlijk 4 kN/m (psi2 = 0,0);
verdiepingsvloer permanent 23,44 kN/m plus 2 × 16 kN, veranderlijk 12 kN/m (psi2 = 0,18).
Horizontaal: Fb = 0,505 × 29 662 kg × 1,0 = 147,1 kN, × torsiefactor delta = 1,6 → 235,4 kN,
verdeeld als F1 = 0,82·Fb = 193,1 kN op +3,50 m en F2 = 0,18·Fb = 42,4 kN op +7,00 m.
Combinatie: Gk + AEd + 0,18·Qk.

**Te vergelijken grootheden.**

| Grootheid | Referentiewaarde | Onze waarde | Δ | Status |
|---|---|---|---|---|
| Maximale trekkracht in de schoren, 1e verdieping NEd | 200,2 kN | | | open |
| Trekweerstand trekdiagonaal Nt,Rd | 94 kN (voldoet dus niet) | | | open |
| Massa m1 / m2 / totaal | 25 072,7 / 4 589,3 / 29 662 kg | | | open |
| Eigenfrequenties f1 / f2 | 4,51 Hz (T1 = 0,22 s) / 12,66 Hz (T2 = 0,08 s) | | | open |
| Eigenvormverhoudingen | 0,83 : 1,00 en −0,23 : 1,00 | | | open |
| Mj,Rd dakligger-kolom / vloerligger-kolom | 61,5 / 147,5 kN·m | | | open |
| Trekweerstand schoor-kolomverbinding | 64,7 kN; stijfheid 24 823 kN/m; vervormingscapaciteit 3,2 mm | | | open |
| Push-over: afschuifkracht bij bereiken vervormingscapaciteit | 116 kN (doorgezet tot 147 kN) | | | open |

**Nationale bijlage.** Nederlandse NB's: NEN-EN 1990/NB (gamma_G = 1,35/1,20,
gamma_Q = 1,50, KFI = 1,0, CC2), NEN-EN 1991-1-3/NB (sk = 0,70 kN/m²),
NEN-EN 1991-1-4/NB (windgebied II, vb,0 = 27,0 m/s, qp = 0,75 kN/m²), NEN-EN 1993-1-1 en
NEN-EN 1993-1-8; aardbevingsbelasting volgens NPR 9998:2018.

**Let op.** De splitsing van de permanente belasting in eigen gewicht Gk,1 en rustende
belasting Gk,2 per niveau staat alleen samengevat in de massatabel. De windbelastingen uit
het oorspronkelijke ontwerp staan niet als getalswaarden per niveau. Eigenfrequenties en
push-over vallen buiten het bereik van de app.

---

## 10. Wat er nog gezocht moet worden

De 26 gevallen dekken de kern goed, maar er zitten aanwijsbare gaten. Onderstaande soorten
constructies ontbreken volledig en verdienen een volgende zoekronde.

### 10.1 Grote gaten (hoogste prioriteit)

| Ontbrekend | Waarom het nodig is | Waar te zoeken |
|---|---|---|
| **Platen / wandschijven (2D-vlakspanning)** | Geen enkel van de 30 gevallen toetst de plaatmodule. Dat is een hele tak van de app die nu ongevalideerd blijft | Benchmarkbundels voor schijf- en plaatelementen (Cook's membrane, patch tests, wandschijf met sparing); validatiehandboeken van open pakketten |
| **Staaltoetsing met de Nederlandse nationale bijlage** | Onze EN 1993-1-1-module is juist voor de NL NB gebouwd (inclusief kip). Van de zeven staalgevallen gebruiken er vier de aanbevolen EN-waarden en twee de Britse NB — géén de NL NB | Publicaties van het Nederlandse staalbouwkenniscentrum, Eurocode-toelichtingen bij NEN-EN 1993-1-1+NB, HBO/TU-dictaten Staalconstructies |
| **Tweede orde met numerieke uitkomst** | R09 en R15 geven alleen vergrotingsfactoren en alpha_cr; geen enkel geval geeft een tweede-orde momentenlijn of verplaatsing om onze niet-lineaire solver tegen te leggen | Validatiebundels (secundaire tak SSNL), benchmark "Merchant-Rankine"-voorbeelden, lesmateriaal stabiliteit van raamwerken |

### 10.2 Kleinere gaten

| Ontbrekend | Toelichting |
|---|---|
| **Scheefstand als zelfstandig geval** | Alleen R15 gebruikt scheefstand, en dan als EHF van 0,60 kN; geen geval waar de scheefstandmodule zelf de referentie is |
| **Eigen gewicht als verifieerbare uitkomst** | Alleen R15 rekent met eigen gewicht en becijfert het niet. Een geval waarin de eigen-gewichtreactie expliciet gegeven is, zou de dichtheden- en profieldata valideren |
| **EN 1990-combinatiegenerator, CC1 en CC3** | Alle gevallen zijn CC2 of geven de combinatie al kant-en-klaar. Een geval met KFI = 0,9 of 1,1 ontbreekt |
| **Rotatieveren als oplegging** | Alleen Z4 noemt een rotatieveer (6 000 kN·m/rad) maar zonder bruikbare uitkomst. Een benchmark met een expliciete rotatieveerstijfheid ontbreekt |
| **Opgelegde zakking van een steunpunt** | Klassiek geval voor doorgaande liggers; nergens aanwezig |
| **Temperatuurgradiënt over de doorsnedehoogte** | R23 en R24 gebruiken uniforme ΔT. Een gradiënt (boven/onder verschillend) ontbreekt |
| **Hout: kip van een ligger volgens de Nederlandse NB** | R20 doet de kiptoets volgens de Duitse NB; een NL-variant ontbreekt |
| **Vakwerk met numerieke staafkrachten over alle staven** | R18 geeft er maar vier; R11 geeft er geen |

---

## 11. Registratie van de campagne

Voorstel voor het bijhouden, in dit bestand of in een apart voortgangsbestand:

| Kenmerk | Model opgeslagen | Doorgerekend | Aantal grootheden vergeleken | Waarvan gelijk | ONS | BRON | NB | AANNAME | Conclusie |
|---|---|---|---|---|---|---|---|---|---|
| R01 | nee | nee | 0 | | | | | | — |
| ... | | | | | | | | | |

Elke `ONS`-bevinding krijgt een eigen regel met een minimale reproductie, zodat er een
regressietest van gemaakt kan worden (`test-*.mjs`, conform het solver-testprotocol in
CLAUDE.md).

---

## 12. Bronoverzicht

| Bron | Gevallen | Type |
|---|---|---|
| Franse validatiebundel voor rekenprogramma's (AFNOR/SFM 1990, testreeks SSLL) — https://www.icab.eu/guide/valid/ssll.html | R01, R02, R04, R12, R24, R25, R26 | Analytische benchmark |
| Validatiehandboek van een open-source eindige-elementenpakket (EDF R&D, fascicule v3.01, GNU FDL) — https://ericca.uqtr.ca/fr13.6/V3.html | R03, R11 | Analytische benchmark |
| TU Delft, open onderwijssite (CTB1110 en CT2031) — https://icozct.tudelft.nl/ | R05, R06, R07, R08, R09, R10 | Uitgewerkte tentamenopgaven |
| Staalbouwinstituut Verenigd Koninkrijk, P364 — https://www.steelconstruction.info/images/5/50/Sci_p364.pdf | R13, R14 | Uitgewerkt rekenvoorbeeld |
| Europese ontwerpgidsreeks stalen gebouwen, delen 4, 5 en 6 (SECHALO) — constructalia.arcelormittal.com en steelconstruction.info | R15, R16, R17, R18, Z3 | Uitgewerkt rekenvoorbeeld bij de norm |
| Zweeds houtvoorlichtingsinstituut, Design of timber structures vol. 3 (2022) | R19 | Uitgewerkt rekenvoorbeeld |
| Duitse studiegemeenschap gelijmd hout, holzbau handbuch R2/T1/F2 | R20 | Uitgewerkt rekenvoorbeeld |
| Nederlandse studievereniging uitvoering betonconstructies, D10-2 (2018) | R21 | Uitgewerkt rekenvoorbeeld |
| Hogeschool Augsburg, tentamen Houtbouw SS 2011 | R22 | Uitgewerkte tentamenopgave |
| Hochschule Wismar, Modulprüfung Baustatik I (2013) | R23 | Uitgewerkte tentamenopgave |
| Joint Research Centre, JRC96658 (2015) | Z1 | Uitgewerkt rekenvoorbeeld bij de norm |
| Nederlands rekenblad-uitgever, voorbeeldrekenblad EC5 6.3.2 | Z2 | Uitgewerkt rekenvoorbeeld |
| Onafhankelijk Nederlands onderzoeksinstituut, rapport 2017 R11563 bij NPR 9998:2018 | Z4 | Voorbeeldberekening bij een norm |

---

*Einde werkdossier. Geen enkele referentiewaarde in dit dossier is afgeleid, geschat of
ingevuld door de opsteller: alle waarden komen uit de genoemde bron op de genoemde URL.
Waar in dit dossier een narekening staat, is dat expliciet als eigen controle benoemd en
verandert die niets aan de referentiewaarde.*
