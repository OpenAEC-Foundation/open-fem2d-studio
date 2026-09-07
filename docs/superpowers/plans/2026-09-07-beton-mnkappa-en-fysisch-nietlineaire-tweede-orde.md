# Beton: M-N-κ, en een fysisch niet-lineaire tweede-orde-krachtsverdeling

Besluitdocument. Alles wat hieronder als NORM staat is uit NEN-EN
1992-1-1:2005+A1:2015+NB:2016+A1:2020 zelf gelezen; alles wat als BESLUIT
staat is een keuze van de gebruiker en geen normvoorschrift. Wie hieraan
werkt houdt dat onderscheid vast — een besluit mag veranderen, een
normvoorschrift niet.

## 1. Wat de norm voorschrijft

### 5.8.6 Algemene methode

Letterlijk uit de norm, met de nummering van de norm:

- **(1)** De algemene methode is gebaseerd op een niet-lineaire berekening,
  inclusief geometrische niet-lineariteit (tweede-orde-effecten). De algemene
  regels voor niet-lineaire berekening, gegeven in 5.7, zijn van toepassing.
- **(2)** Er moeten spanning-rekdiagrammen voor beton en staal zijn gebruikt
  die bruikbaar zijn voor de berekening van de constructie als geheel. Er moet
  rekening zijn gehouden met het effect van kruip.
- **(3)** Voor de spanning-rekrelaties voor beton en betonstaal, gegeven in
  3.1.5, mogen vergelijking (3.14) en 3.2.7 (figuur 3.8) zijn gebruikt. Met
  spanning-rekdiagrammen gebaseerd op rekenwaarden is uit de berekening direct
  een rekenwaarde van de bezwijkbelasting verkregen. **In vergelijking (3.14)
  en in de k-waarde is f_cm dan vervangen door de rekenwaarde van de
  druksterkte f_cd, en E_cm door:**

      E_cd = E_cm / γ_cE                                        (5.20)

  OPMERKING: de aanbevolen waarde is 1,2. **De nationale bijlage: "De waarde
  van γ_CE moet gelijk aan 1,2 zijn genomen."** Dus γ_cE = 1,2, geen keuze.
- **(4)** Bij gebrek aan meer verfijnde modellen mag met kruip rekening zijn
  gehouden door alle waarden van de rek in het spanning-rekdiagram van het
  beton, volgens 5.8.6(3), te vermenigvuldigen met een factor (1 + φ_ef),
  waarin φ_ef de effectieve kruipcoëfficiënt volgens 5.8.4 is.
- **(5)** Met het gunstige effect van 'tension stiffening' mag rekening zijn
  gehouden. OPMERKING: dit effect is gunstig en mag om redenen van eenvoud
  altijd zijn verwaarloosd.
- **(6)** In het algemeen is in een aantal dwarsdoorsneden aan de voorwaarden
  voor evenwicht en compatibiliteit voldaan. Een vereenvoudigd alternatief is
  om alleen de kritieke dwarsdoorsnede(n) te beschouwen en een van toepassing
  zijnde variatie van de tussenliggende kromming aan te nemen.

**(6) is de normatieve rechtvaardiging van de segmentaanpak.** Wij doen niet
het vereenvoudigde alternatief maar het algemene geval: evenwicht en
compatibiliteit in een groot aantal doorsneden, namelijk één per segment.

### 3.1.5 Spanning-rekrelatie voor de niet-lineaire constructieve berekening

- **(1)** De in figuur 3.2 gegeven relatie tussen σ_c en ε_c voor kortdurende
  éénassige belasting wordt beschreven door vergelijking (3.14), waarin:
  - η = ε_c / ε_c1
  - ε_c1 is de vervorming bij de piekspanning volgens tabel 3.1
  - **k = 1,05 · E_cm · |ε_c1| / f_cm** (f_cm volgens tabel 3.1)

  Vergelijking (3.14) is geldig voor 0 < |ε_c| < |ε_cu1|, waarin ε_cu1 de
  nominale grenswaarde van de stuik is.
- **(2)** Andere geïdealiseerde spanning-rekrelaties mogen zijn toegepast,
  indien deze het gedrag van het beschouwde beton voldoende weergeven.

> **LET OP voor wie dit implementeert.** De formule (3.14) zelf staat in de
> PDF als afbeelding en is met `pdftotext` niet uit te lezen; alleen de
> variabelendefinities hierboven komen er wel uit. Lees de formule van de
> bladzijde-afbeelding (render de bladzijde met 3.1.5 en lees hem af).
> **Schrijf hem NIET uit het hoofd op.** In dit project is al twee keer een
> verzonnen normwaarde binnengeslopen; dit is precies zo'n plek.

### Waarom de huidige kern hier niet aan voldoet

`nen-en-1992-1-1/src/stress_strain.rs` gebruikt het parabool-rechthoekdiagram
van 3.1.7 met f_cd. Dat is het juiste diagram voor de **doorsnedetoetsing**,
maar niet voor de **niet-lineaire constructieve berekening**: 5.8.6(3) wijst
naar 3.1.5 / (3.14). Het verschil is niet cosmetisch. De begintangens van het
parabool-rechthoekdiagram is f_cd·n/ε_c2 ≈ 20 000 N/mm², terwijl (3.14) met
E_cd = E_cm/1,2 op circa 27 500 N/mm² begint voor C30/37. Gemeten in de
huidige kern: EI = 45,0 MNm² bij het eerste diagrampunt tegen E_cm·I_c =
103,1 MNm².

Een te slappe staaf lijkt veilig zolang je naar die staaf alleen kijkt (groter
tweede-ordemoment), maar stoot in een statisch onbepaald raamwerk moment af
naar zijn buren. Dan is de staaf zelf onderbemeten. Dit is het grootste
risico van de hele operatie en het staat bovenaan met opzet.

## 2. Besluiten van de gebruiker

Drie keuzes, expliciet gemaakt en niet af te leiden uit de norm.

### B1 — Kruip: voorlopig φ_ef = 0

De eerste levering rekent zonder kruip. **Voorwaarde: het rapport meldt dit
expliciet en zegt erbij dat de uitkomst voor blijvend belaste kolommen aan de
onveilige kant is.** Geen stilzwijgende nul.

φ_ef volgens 5.8.4, en de verwerking volgens 5.8.6(4) (alle rekwaarden maal
(1 + φ_ef)), komen later als eigen taak. Bouw de kern zó dat φ_ef er als
parameter in kan zonder het diagram te herschrijven.

### B2 — Tension stiffening: onderscheid UGT en BGT

**In de uiterste grenstoestand géén tension stiffening, in de
bruikbaarheidsgrenstoestand wel.**

Dat betekent twee varianten van de M-N-κ-relatie, en dat sluit op de norm aan:
5.8.6(5) staat verwaarlozen in de UGT uitdrukkelijk toe, en 7.4.3 is het
artikel waar de interpolatie tussen ongescheurd en gescheurd thuishoort.

| | UGT | BGT |
|---|---|---|
| diagram | (3.14) met f_cd en E_cd = E_cm/1,2 | (3.14) met f_cm en E_cm |
| betontrek | verwaarloosd | meegenomen tot f_ctm |
| tension stiffening | nee (5.8.6(5)) | ja (7.4.3) |
| grondslag | 5.8.6(3) | 7.4.3 |

De variant moet in het antwoordtype zichtbaar zijn en in het rapport per
segment vermeld worden. Nooit impliciet.

### B3 — Segmentlengte: instelbaar, 400 mm als beginwaarde

Geen automatische vergroving. Er komt een instelling met 400 mm als
beginwaarde en **een waarschuwing zodra het model te groot wordt**, maar de
applicatie grijpt niet zelf in. De gebruiker houdt de knop.

Voorwaarde: die waarschuwing moet op een **gemeten** drempel staan, niet op
een geraden getal. Meet eerst de werkelijke oplostijd tegen het aantal
vrijheidsgraden voordat je de drempel vastzet, en zet de meting in dit
document.

#### De meting

Uitgevoerd met `design-mockup/scripts/meet-oplossers.mjs` (draaien met
`node node_modules/tsx/dist/cli.mjs scripts/meet-oplossers.mjs`). Machine:
Windows 11, Node 24.11.1, standaard heaplimiet (4,26 GB). Model: een raamwerk
van 3 velden × 3 verdiepingen, kolommen 3,5 m en liggers 6,0 m, waarvan elke
staaf in steeds meer segmenten geknipt is — precies de vertienvoudiging die
deze taak meebrengt. Elke tijd is de laagste van twee metingen.

De knoopnummering staat er als aparte rij in, want zij bepaalt de
bandbreedte. **aaneengesloten** = de segmentknopen staan tussen de
stramienknopen in; **toegevoegd** = eerst de stramienknopen, daarna per staaf
de segmentknopen erachteraan — dat is wat `Mesh.addNode` doet als een bestaand
model achteraf wordt opgeknipt, en dus het te verwachten geval.

`b_max` is de grootste profielhoogte (de bandbreedte waarop een vaste-band-
oplosser gedimensioneerd moet worden), `h_gem` de gemiddelde profielhoogte
(waarop een skyline-oplosser werkelijk rekent). Kolom "band" is dezelfde
LDLᵀ-code als "skyline", maar met een vaste envelop ter breedte `b_max`.

**Kale oplostijd van K·u = F, één stelsel:**

| nummering | segm./staaf | elementen | DOF | dichte K (MB) | b_max | h_gem | Gauss (ms) | band (ms) | skyline (ms) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| aaneengesloten | 1 | 3 | 12 | 0,0 | 7 | 4,1 | 0,1 | 0,0 | 0,0 |
| aaneengesloten | 1 | 10 | 27 | 0,0 | 10 | 6,4 | 0,5 | 0,1 | 0,1 |
| aaneengesloten | 2 | 20 | 57 | 0,0 | 40 | 10,7 | 0,1 | 0,1 | 0,2 |
| aaneengesloten | 2 | 42 | 111 | 0,1 | 85 | 19,1 | 0,7 | 0,3 | 0,1 |
| aaneengesloten | 4 | 84 | 237 | 0,4 | 175 | 29,6 | 14,9 | 1,9 | 0,3 |
| aaneengesloten | 7 | 147 | 426 | 1,4 | 310 | 30,0 | 42,9 | 10,0 | 0,6 |
| aaneengesloten | 12 | 252 | 741 | 4,2 | 535 | 30,2 | 213,0 | 48,4 | 1,2 |
| aaneengesloten | 20 | 420 | 1245 | 11,8 | 895 | 30,3 | 986,9 | 215,4 | 3,6 |
| aaneengesloten | 32 | 672 | 2001 | 30,5 | 1435 | 30,3 | 4355,2 | 887,5 | 21,3 |
| aaneengesloten | 50 | 1050 | 3135 | 75,0 | 2245 | 30,4 | 16963,9 | 3674,1 | 55,1 |
| aaneengesloten | 80 | 1680 | 5025 | 192,6 | 3595 | 30,4 | niet gemeten | niet gemeten | 158,1 |
| aaneengesloten | 125 | 2625 | 7860 | 471,3 | 5620 | 30,4 | niet gemeten | niet gemeten | 414,1 |
| aaneengesloten | 200 | 4200 | 12585 | 1208,4 | 8995 | 30,4 | niet gemeten | niet gemeten | 1235,7 |
| toegevoegd | 2 | 20 | 57 | 0,0 | 46 | 17,9 | 0,1 | 0,0 | 0,0 |
| toegevoegd | 2 | 42 | 111 | 0,1 | 94 | 34,8 | 0,8 | 0,3 | 0,1 |
| toegevoegd | 4 | 84 | 237 | 0,4 | 202 | 65,2 | 7,4 | 2,2 | 0,8 |
| toegevoegd | 7 | 147 | 426 | 1,4 | 379 | 66,3 | 39,5 | 12,0 | 1,7 |
| toegevoegd | 12 | 252 | 741 | 4,2 | 694 | 66,9 | 214,1 | 60,0 | 3,0 |
| toegevoegd | 20 | 420 | 1245 | 11,8 | 1198 | 67,2 | 1011,0 | 265,8 | 8,0 |
| toegevoegd | 32 | 672 | 2001 | 30,5 | 1954 | 67,4 | 4141,8 | 1099,7 | 22,6 |
| toegevoegd | 50 | 1050 | 3135 | 75,0 | 3088 | 67,5 | 16616,2 | 4383,9 | 51,1 |
| toegevoegd | 80 | 1680 | 5025 | 192,6 | 4978 | 67,6 | niet gemeten | niet gemeten | 131,6 |
| toegevoegd | 125 | 2625 | 7860 | 471,3 | 7813 | 67,6 | niet gemeten | niet gemeten | 421,8 |
| toegevoegd | 200 | 4200 | 12585 | 1208,4 | 12538 | 67,7 | niet gemeten | niet gemeten | 1391,8 |

"niet gemeten" betekent: overgeslagen omdat één meting minuten tot uren zou
kosten en de trend al vaststaat.

**Volledige analyseketen (`solveAllCases`), dus wat de gebruiker afwacht:**

| nummering | DOF | keten Gauss (ms) | waarvan stelsel | keten skyline (ms) | waarvan stelsel |
|---|---:|---:|---:|---:|---:|
| aaneengesloten | 237 | 9,3 | 7,1 | 6,5 | 2,1 |
| aaneengesloten | 426 | 47,5 | 40,1 | 9,3 | 3,5 |
| aaneengesloten | 741 | 224,3 | 211,2 | 10,1 | 1,7 |
| aaneengesloten | 1245 | 1073,8 | 1045,4 | 28,0 | 7,3 |
| aaneengesloten | 2001 | 4296,8 | 4241,6 | 87,1 | 21,1 |
| aaneengesloten | 5025 | 84 485 | — | 595 | — |
| aaneengesloten | 7860 | 249 319 | — | 1400 | — |
| aaneengesloten | 10065 | niet gemeten | — | 2347 | — |
| aaneengesloten | 12585 | niet gemeten | — | 4051 | — |
| aaneengesloten | 15735 | niet gemeten | — | 6953 | — |

Boven 400 vrijheidsgraden zit meer dan 95 % van de analysetijd in de
stelseloplossing. Beide oplossers geven dezelfde `max|u|` tot op drie decimalen
(180,522 mm bij 5025 DOF, 282,423 mm bij 7860 DOF).

**Drie dingen die uit de meting volgen en niet uit een verwachting:**

1. **De vaste band is niet de goede vorm.** `b_max` groeit mee met het model
   (895 → 8995 bij aaneengesloten nummering) omdat de aansluitknopen van elke
   staaf ver terugwijzen, terwijl `h_gem` constant blijft op 30 respectievelijk
   68. Een vaste band wint daardoor maar een factor 4,6 op de dichte oplosser
   (3674 tegen 16 964 ms bij 3135 DOF); de skyline wint er nog een factor 67
   bovenop (55 ms). Vandaar de keuze voor de variabele envelop.
2. **De stijfheidsmatrix is exact symmetrisch.** Gemeten
   max |K(i,j) − K(j,i)| = 0 op elk model in de reeks. Dat is de voorwaarde
   waaronder LDLᵀ zonder pivotering mag; de oplosser meet het per aanroep en
   valt bij asymmetrie terug op Gauss.
3. **Boven circa 5000 DOF is de oplosser niet meer de rem.** De skyline-tijd
   groeit dan als O(n²) omdat de matrix als dichte `number[][]` moet worden
   afgelopen om het profiel te bepalen, niet als O(n·h²) van de ontbinding
   zelf. De volgende winst zit dus in ijle assemblage, niet in de oplosser.

**Het plafond van de huidige opzet is geheugen, niet tijd.** De dichte
`Matrix` kost 8·n² bytes en `applyBoundaryConditions` kloont hem nog eens.
Gemeten: de volledige keten haalt 15 735 DOF (3,88 GB heap) en breekt bij
20 160 DOF af met "JavaScript heap out of memory" op 3,73 GB van de 4,26 GB.

#### De drempel

**Criterium** (een keuze, geen norm): de waarschuwing verschijnt zodra één
stelseloplossing meer dan één seconde kost. Reden: een fysisch niet-lineaire
tweede-orde-berekening doet er tientallen per belastingcombinatie, dus één
seconde per stelsel is al een minuut per combinatie.

| standaard-oplosser | gemeten ijkpunten | **drempel** | dat is bij segmenten van 400 mm |
|---|---|---:|---|
| dichte Gauss (huidig) | 987 ms bij 1245 DOF, 4355 ms bij 2001 DOF | **1250 DOF** | circa 165 m staaflengte in totaal |
| skyline | 414 ms bij 7860 DOF, 1236 ms bij 12 585 DOF | **10 000 DOF** | circa 1330 m staaflengte in totaal |

De omrekening: bij een segmentlengte van 0,4 m en 3 vrijheidsgraden per knoop
geldt DOF ≈ 7,5 × totale staaflengte in meters.

De skyline-drempel is bewust op 10 000 gezet en niet op de 11 500 waar de
tijdsgrens ligt: bij 10 000 DOF vraagt de keten circa 2,4 GB heap (gemeten),
en dat is de plek waar de geheugengrens van 15 700 DOF nog een halve
verdubbeling weg is.

**Welke drempel geldt, hangt af van welke oplosser standaard is.** Vandaag is
dat nog de dichte Gauss-eliminatie, dus **1250**.

### B4 — Keuze van solver

Op verzoek van de gebruiker: "Geef ook de mogelijkheid tot verschillende
solvers." Dat wordt hier op twee assen ingevuld, omdat beide toch nodig zijn:

1. **Analysetype.** Vandaag is dat de booleaan `nonlinearEnabled` (eerste orde
   of geometrisch tweede orde). Die moet toch een keuze worden zodra de
   fysisch niet-lineaire variant erbij komt:
   - eerste orde, lineair
   - tweede orde, geometrisch niet-lineair (huidig gedrag bij `true`)
   - tweede orde, geometrisch **en** fysisch niet-lineair (nieuw, beton)
   Het projectbestand moet de oude booleaan blijven kunnen lezen.
2. **Stelseloplosser.** Vandaag is er één: `solveLinearSystem` uit
   `core/math/GaussElimination`, aangeroepen vanaf zeven plaatsen in
   `NonlinearSolver.ts`. Dat is dichte Gauss-eliminatie, O(n³), zonder
   plafond voor raamwerken. Met segmenten van 400 mm vertienvoudigt het aantal
   elementen. Er komt een tweede oplosser die de bandstructuur benut, achter
   dezelfde functiehandtekening, en een keuze welke gebruikt wordt.

   **Voorwaarde: bit-identieke uitkomsten op de bestaande testbatterij bij de
   bestaande oplosser.** De nieuwe oplosser wordt tegen de bestaande
   gevalideerd op dezelfde modellen, niet alleen op snelheid.

   **UITGEVOERD.** `core/math/LinearSolver` is het keuzepunt; `NonlinearSolver`
   importeert `solveLinearSystem` daarvandaan en de zeven aanroepplaatsen
   bleven ongewijzigd. De tweede oplosser is een skyline-LDLᵀ
   (`core/math/SkylineSolver`); de motivering voor die vorm boven een vaste
   band staat bij de meting onder B3. Kiezen kan met `setLinearSolver()` of met
   de omgevingsvariabele `FEM_SOLVER=skyline`.

   Twee dingen zijn hier bijgesteld ten opzichte van de tekst hierboven:

   - **De standaard is NIET veranderd.** Hij blijft `gauss`. De meting
     rechtvaardigt omzetten (factor 140 tot 180 op de volledige keten), maar
     omzetten dwingt ook een nieuw gouden bestand af — zie het punt hieronder —
     en dat is een aparte beslissing.
   - **"Bit-identiek" is bij een andere eliminatievolgorde niet haalbaar en ook
     geen goed criterium.** Wat gemeten is: over alle vergelijkingsmodellen
     samen (`test-oplossers.mjs`) is de grootste relatieve afwijking tussen de
     twee oplossers 9,3e-13 op verplaatsingen, 1,1e-12 op reacties en 2,0e-12
     op staafkrachten. De afwijking groeit met de modelgrootte: 5e-14 bij 63
     DOF, 2,7e-12 bij 741 DOF, 1,5e-10 bij 3135 DOF. De test hanteert 1e-9 en
     drukt de gemeten waarde altijd af.

     Wél bit-exact: het gouden bestand `tests/golden/portaal.verwacht.json`
     blijft byte-identiek zolang `gauss` de standaard is. Met `skyline` als
     standaard verschuiven 613 van de 1838 gouden waarden, telkens in de
     laatste een tot twee cijfers (bijvoorbeeld −23,58802372840362 →
     −23,588023728403613, relatief 3e-16). Dat is de prijs van omzetten, en het
     is een zichtbare prijs — precies waarvoor het gouden bestand bedoeld is.

## 3. Architectuur

Gekozen na drie onafhankelijk uitgewerkte voorstellen en een weging daarvan.

**De betonkern is een stijfheidsorakel.** De volledige beslislogica —
segmentindeling, inversie (N, M) → κ, de M₀-correctie, het scheurmoment,
klemmen, relaxatie en het convergentie-oordeel — zit in Rust, als één
stateloos verzoek. De frontend stuurt krachten heen en krijgt stijfheden
terug, en drijft de globale lus.

Redenen:

- **De drie-wegen-regel.** Een rekenkern moet bereikbaar zijn via het
  Tauri-command, via de toetsbrug én via de MCP-server. Zit de beslislogica in
  TypeScript, dan komt de MCP-weg niet mee. Zit ze in de crate-lib, dan zijn
  de drie wegen drie dunne doorgeefluiken op hetzelfde type.
- **De segmentindelingsregel moet identiek zijn** aan de elementgrenzen in de
  mesh én onafhankelijk van het belastinggeval. Naprogrammeren in TypeScript
  is dezelfde fout als de bestaande dubbele aanroeplaag in `betonKern.ts`.
- **Navertelbaarheid.** Het antwoordtype draagt per segment x_start, x_end,
  N_Ed, M_Ed, M₀, κ, EI, of het segment gescheurd is, en de status. Dat is
  letterlijk de rapporttabel, getypeerd uit de kern.

**Op adapterniveau** wordt een staaf in extra mesh-elementen geknipt, elk met
zijn eigen `section.I`. Dat kan al: `Mesh.addBeamElement` geeft elk element
een eigen `section`, en `Assembler` en `BeamForces` lezen `element.section.I`
per element. De enige blokkade zit in `engine.ts`, dat één `section`-object
per UI-staaf maakt en datzelfde object aan alle deelelementen meegeeft.

**Waarom niet de elegantere weg.** Een getrapt element via de
flexibiliteitsmethode houdt het aantal vrijheidsgraden gelijk en is
wiskundig sterker. Twee dingen breken het: de geometrische stijfheidsmatrix is
Hermite-consistent en bij variërende EI is de vervormingsvorm niet meer
kubisch, en `engine.ts` documenteert zelf dat het tweede-ordemoment binnen een
element het interne P·w(x)-aandeel mist waarvoor onderverdelen juist de
voorgeschreven reparatie is. Onderverdelen lost dat gratis mee op.

## 4. Volgorde

De gebruiker heeft de volgorde zelf gegeven: eerst de betontoetsing met het
M-N-κ-diagram, **daarna** de fysisch niet-lineaire tweede orde.

### Fase A — betontoetsing af

1. De doorsnedetoetsing op buiging **met** normaalkracht (interactiediagram),
   geen knik. Wapening als aantal staven per rij plus diameter — dat staat er
   al.
2. `check_concrete_beam` via alle drie de wegen. De MCP-weg ontbreekt.
3. Het M-N-κ-diagram in het rapport.

### Fase B — de kern klaarmaken

4. Vergelijking (3.14) in `stress_strain.rs`, in twee varianten: rekenwaarden
   (f_cd, E_cd = E_cm/1,2) voor de UGT en gemiddelde waarden (f_cm, E_cm) voor
   de BGT. `DesignMaterial::new` ongewijzigd laten zodat de bestaande toetsing
   en haar handberekening groen blijven.
5. Betontrek en tension stiffening (7.4.3) als BGT-tak.
6. `stiffness.rs`: M₀ bij κ = 0, κ uit (N, M), de secans EI = (M − M₀)/κ, en
   het scheurmoment uit f_ctm.

   **M₀ is geen detail.** Het moment wordt om de geometrische middenvezel h/2
   genomen en niet om het plastisch zwaartepunt, dus bij een asymmetrische korf
   onder druk is M(κ = 0) ≠ 0. Gemeten in de huidige kern: −0,98 kNm bij
   N = −200 kN, −4,13 kNm bij N = −800 kN, −30,6 kNm vlak onder N_Rd. Zonder
   die correctie is EI = M/κ fout. Bij een symmetrische korf is M₀ exact nul,
   dus een test met alleen een symmetrische korf vindt deze fout niet.

### Fase C — solverkeuze

7. `nonlinearEnabled` wordt een analysetype-keuze, met terugleesbaarheid van
   het oude veld.
8. De tweede stelseloplosser, achter dezelfde handtekening, bit-identiek
   gevalideerd tegen de bestaande.
9. De rekentijdmeting van B3, en de waarschuwingsdrempel eruit.

### Fase D — de tweede orde zelf

10. Segmentcontract op de adaptergrens; `section` de splitslus in.
11. De globale lus in de frontend: ronde 0 is de indeling, daarna krachten heen
    en stijfheden terug tot convergentie.
12. Rapporthoofdstuk met de segmenttabel, het M-N-κ-diagram en de
    uitgangspunten, inclusief de verplichte vermelding uit B1.

## 5. Wat een test moet vastleggen

Zonder deze is de functie niet af:

- een ongescheurde balk levert exact de eerste-orde-oplossing met E_cd·I_c;
- een balk boven het scheurmoment heeft monotoon dalende segment-EI;
- een slanke kolom heeft aantoonbaar een groter tweede-ordemoment dan
  ongescheurd;
- M₀ klopt bij een **asymmetrische** korf, en krijgt bij een negatief moment
  het juiste teken na spiegeling;
- lasten en scharnieren komen na het opknippen op het juiste segment terecht;
- een niet-convergent geval levert een nette fout en géén getal;
- dezelfde invoer door alle drie de wegen geeft hetzelfde antwoord;
- de bestaande batterijen blijven groen: `node scripts/run-tests.mjs` vanuit
  `design-mockup` en `cargo test --workspace` vanuit `src-tauri`.
