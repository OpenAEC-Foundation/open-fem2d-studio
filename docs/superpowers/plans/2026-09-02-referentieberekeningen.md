# Werkdossier referentieberekeningen — validatiecampagne Open FEM2D Studio

Opgesteld: 2026-09-02
Narekenen afgerond: 2026-09-03
Status: alle 26 volwaardige gevallen nagebouwd, opgeslagen, doorgerekend en vergeleken

---

## A. Balans van de campagne

### A.1 De cijfers

Alle **26** volwaardige gevallen zijn nagebouwd, als projectbestand opgeslagen in
`design-mockup/referentie/` en doorgerekend met een eigen toetsscript
(`design-mockup/referentie/toets-Rxx.mjs`, draaien met `npx tsx` vanuit `design-mockup`).
Bij elkaar zijn er **bijna 700 afzonderlijke vergelijkingen en controles** gedaan: de
referentiewaarden uit dit dossier plus de eigen kruiscontroles (evenwicht, continuïteit,
handafleidingen, netverfijning, grenswaarden) die per geval zijn gedraaid. De telling per geval
staat in hoofdstuk 11.

| Uitkomst | Aantal | Gevallen |
|---|---|---|
| **Komt overeen** — alles binnen de tolerantie van het geval | **15** | R01, R02, R03, R04, R05, R06, R07, R08, R10, R11, R13, R17, R20, R22, R25 |
| **Verschil door de bron** — zetfout, etiketfout of afleesonnauwkeurigheid in de referentie | **4** | R09, R14, R21, R26 |
| **Verschil door een modelleeraanname** — de app kent het verschijnsel niet of de bron rekent met een andere aanname | **5** | R12, R15, R18, R23, R24 |
| **Wijst op iets in onze app** | **2** | R16, R19 |
| Totaal | **26** | |

**Die "2" is misleidend en mag niet als geruststelling gelezen worden.** Het zijn de twee
gevallen waarvan de *vergeleken referentiewaarde* zelf op de app wijst. Van de dertien problemen
in hoofdstuk B komt er maar **één** (B2, de kiptoets) uitsluitend uit zo'n geval; de overige
twaalf zijn aan het licht gekomen in gevallen die keurig "komt overeen" scoren, of gewoon
tijdens het nabouwen. R11, R17, R20, R23 en R26 leverden alle vijf een bevinding op die náást
de vergelijking staat. **Het aantal gevonden problemen in de app is dus 13, niet 2 — waarvan
~~drie~~ twee onveilig aan de verkeerde kant** (B2 kip staal en B4 kipsteunen onderflens).

> **Correctie van 3 september 2026: B3 (k_cr hout) is ingetrokken.** De Nederlandse nationale
> bijlage schrijft voor prismatische liggers k_cr = 1,0 voor; de gemelde 0,67 is de
> *aanbevolen* Eurocode-waarde, die de bijlage juist overschrijft. De onveilige bevindingen
> zijn er dus twee, niet drie, en het twaalfde en dertiende probleem tellen als één minder.
> De volledige onderbouwing staat bij de bespreking van R19 verderop. Deze fout is
> veelzeggend: hij ontstond doordat beide houtgevallen een buitenlandse bijlage gebruiken
> (de aanbevolen waarde respectievelijk de Duitse), precies de blinde vlek die dit dossier
> zelf al benoemde.

Dat is meteen de belangrijkste methodologische les van deze campagne: **een geval dat "komt
overeen" scoort bewijst dat de rekenkern klopt, niet dat de app klopt.** De onveilige
bevindingen zitten in de laag tússen model en kern — de invoer die de app automatisch
samenstelt en die de gebruiker niet kan zien of corrigeren.

Daar komt na de correctie hierboven een tweede les bij: **een referentie uit een ander land
toetst een andere norm.** Een verschil tegen een buitenlandse bijlage is op zichzelf geen
fout in onze app, en behandelen alsof het dat wel is levert een verzonnen fout op — met het
risico dat de app onnodig conservatief wordt afgesteld. Elke bevinding die op een
nationale keuze rust, hoort tegen de Nederlandse bijlage geverifieerd te worden voordat er
één regel code verandert.

Van de 26 gevallen zijn er **19** die de app niet exact als projectbestand kan vastleggen,
omdat er geen vrije doorsnede-invoer is (probleem B1). Bij **drie** daarvan (R03, R04, R13)
levert het opgeslagen bestand bij openen in de app een materieel verkeerd antwoord. Dat is
een zwaarwegende kanttekening bij de 15 "komt overeen": wat daar gevalideerd is, is
grotendeels de solver-API, niet de volledige keten bestand → app → solver → rapport.

### A.2 Verdeling van de verschillen over de vier codes

| Code | Betekenis | Waar aangetroffen |
|---|---|---|
| `ONS` | Fout in solver, adapter, toetsmodule of eenhedenconversie | R16 (kip staal), R19 + R20 (k_cr hout), R17 (kipsteunen onderflens). Zie hoofdstuk B |
| `BRON` | Fout of interne inconsistentie in de referentie | R06 (M4/M5 verwisseld, was al voorzien), R09 (kniklengte van een nomogram), R14 (tekenfout in één dwarskracht), R21 (etiketfout dwarskracht), R26 (8-staafskolom hoort bij een ander net; verschoven regel; laatste-cijferfout) |
| `NB` | Andere nationale bijlage of andere aanbevolen waarde | R16 (NL NB-kip tegen aanbevolen EN: +1,32 % op Mcr), R17 (§6.3.2.4 tegen onze Mcr-route), R20 (gamma_M 1,25 tegen 1,30, (6.32) tegen (6.31)+1,4) |
| `AANNAME` | Verschil in modelaanname | R12 + R24 (geen dwarskrachtvervorming), R15 (voute), R18 (eigen gewicht 124 vs 90,7 kN), R23 (alpha_T niet vrij instelbaar), en in vrijwel elk A-geval de eindige EA waar de bron oneindige EA aanneemt |

### A.3 Wat er nu ligt

- **26 toetsscripts** `design-mockup/referentie/toets-Rxx.mjs`, elk met exitcode 0 als alles
  binnen tolerantie valt — bruikbaar als regressiebatterij bij een solverwijziging.
- **31 modelbestanden** (`.femp`, elk met een identieke `.ifcfem2d`, zie B13), plus vier
  hulpscripts (`bouw-R15.mjs`, `bouw-R16.mjs`, `model-R13.mjs`, `model-R18.mjs`) en twee probes.
- Twee Rust-integratietests: `src-tauri/crates/timber-check/tests/referentie_r19.rs` en
  `referentie_r20.rs`, die de EN 1995-kern langs de productieroute draaien.
- Voor de zwaarste bevinding (B2, kip staal) zijn vier ijkpunten gemeten die als
  regressietest vastgelegd kunnen worden: Mcr = 113,90 (bron, algemene EN) / 115,40 (NB met
  juiste invoer) / 125,38 (NB met de huidige invoer) / 78,91 kN·m (beta = 0 zonder het
  l_kip-onderscheid).

**Er is in deze campagne geen enkele regel productiecode gewijzigd, geen bestaande test
aangepast en geen referentiewaarde bijgesteld.**

---

## B. Gevonden problemen in Open FEM2D Studio

Dit is de belangrijkste uitkomst van de campagne. De volgorde is naar zwaarte:
eerst wat een constructie ten onrechte goedkeurt, dan wat invoer onmogelijk maakt, dan wat
te conservatief is, dan wat ontbreekt.

### B.1 — BLOKKEREND · geen vrije doorsnede-invoer, met stille terugval op HEA 160

**Wat.** Een staaf in het projectbestand draagt alleen een materiaal- en profielnaam;
`design-mockup/src/lib/sectionResolver.ts` leidt daaruit E, A en I af — uit de
staalprofieltabel (E ligt dan vast op 210 000 N/mm²) of uit een houten rechthoek b × h met
een aan de sterkteklasse gebonden E. Er is geen veld voor een vrije E, A of I per staaf.
Herkent `resolveSection` de combinatie niet, dan valt hij **stil terug op HEA 160 / S235**,
met alleen een `console.warn` en geen zichtbare melding in de UI.

**Wat het raakt en hoe groot.**

| Geval | Gevolg van de terugval |
|---|---|
| R03 | Dy(C) wordt −0,2431 m in plaats van −0,01242 m — factor 20; ook de verhouding I_kolom : I_ligger = 2 : 1 verdwijnt |
| R13 | BGT-doorbuiging 279,9 mm in plaats van 8,48 mm — factor 33; de doorbuigingstoets zou het profiel onterecht afkeuren |
| R20 | "GL28c" wordt niet als hout herkend, "160x680" niet in de staaltabel gevonden → HEA 160 |
| R04 | Wel opslaanbaar, maar met E = 11 000 in plaats van 210 000 N/mm²: verplaatsingen een factor 19,09 te groot |

**Omvang.** 19 van de 26 gevallen (R01–R04, R06–R14, R18, R21, R23–R26) hebben een
surrogaatdoorsnede nodig. Agents moesten stijfheidsequivalente houtrechthoeken verzinnen tot
b = 3,9 · 10⁹ mm om een voorgeschreven EI in een bestand te krijgen. Voor de vergelijking
gaven ze E/A/I daarom rechtstreeks aan `solve()` mee — buiten het projectbestand om.

**Waarom het bovenaan staat.** Het maakt (a) elk benchmarkgeval met een fictieve doorsnede
onopslaanbaar, (b) elk profiel buiten de bibliotheek onbruikbaar, en (c) de fout zichtbaar
noch corrigeerbaar voor de gebruiker.

### B.2 — ONVEILIG · kiptoets staal: beta en B* uit het veldmoment, en alpha_LT vast op 0,34

**Wat.** Drie samenhangende defecten in de EN 1993-1-1-kiptoets:

1. `src-tauri/crates/steel-check/src/orchestrator.rs` (r. ~586-618) geeft
   `gov_bending.forces.my_ed` (het grootste moment in de omhullende, dus het **veldmoment**)
   door als `m_y_ed_max_knm`, en `interpolate_my_at(..., l_st_mm/4.0)` als kwartwaarde.
   `src-tauri/crates/nen-en-1993-1-1-ltb/src/lib.rs` (r. 127/133) maakt daar beta en B* van,
   terwijl het eigen doc-commentaar zegt dat het om de **eindmomenten** van het kipveld gaat.
2. Zelfde bestand r. 137: `m_b_rd` roept `l_kip` onvoorwaardelijk aan, terwijl het
   doc-commentaar bij `nb_annex::l_kip` zelf zegt dat het geval "veld tussen twee gaffels"
   (L_kip = L_st) bij de aanroeper hoort.
3. Zelfde bestand r. 149: `let alpha_lt = 0.34;` — onvoorwaardelijk, terwijl de functie
   lambda_LT,0 = 0,4 en beta = 0,75 gebruikt (art. 6.3.2.3, waar tabel 6.5 bij hoort:
   h/b > 2 → kromme c, alpha = 0,49). IPE 330 heeft h/b = 2,0625.

> **Normverificatie van punt 3 (3 september 2026) — bevestigd tegen de Nederlandse bijlage.**
>
> Na de intrekking van B3 is dit punt niet op de aanbevolen Eurocode-waarden afgegaan maar
> nagekeken in NEN-EN 1993-1-1:2006+A1:2014+NB:2016 zelf:
>
> - Tabel 6.3 koppelt de kipkrommen a/b/c/d aan de imperfectiefactoren 0,21 / 0,34 / 0,49 / 0,76.
> - Tabel 6.5, die hoort bij 6.3.2.3 (gewalste profielen of equivalente gelaste profielen),
>   geeft voor een **gewalst I-profiel met h/b > 2 kromme c**. Tabel 6.4, die bij de algemene
>   methode 6.3.2.2 hoort, zou daar kromme b geven — dat is het onderscheid waar de code
>   overheen stapt.
> - Dat de code onder 6.3.2.3 valt en niet onder 6.3.2.2 blijkt uit de eigen parameters:
>   `chi_lt` rekent met beta = 0,75 en lambda_LT,0 = 0,4, en dat zijn precies de waarden van
>   6.3.2.3 (de algemene methode heeft beta = 1,0 en lambda_LT,0 = 0,2).
>
> Voor IPE 330 (h/b = 330/160 = 2,0625 > 2) hoort er dus **alpha_LT = 0,49** te staan waar nu
> 0,34 staat. Punt 3 is daarmee hard, niet op een buitenlandse keuze gebaseerd.
>
> **Aanvulling: ook de punten 1 en 2 zijn nu geverifieerd** tegen bijlage NB.NB van diezelfde
> norm (NB.NB.4.3, coëfficiënt C).
>
> - De norm definieert **β als de verhouding van het kleinste tot het grootste EINDmoment**
>   (M_y,2,Ed en M_y,1,Ed). Het doc-commentaar boven de code zegt dat ook, letterlijk — maar de
>   regel eronder rekent `m_y_ed_at_lst_quarter / m_y_ed_max`, oftewel het moment op een kwart
>   van de lengte gedeeld door het maximum. Commentaar en code spreken elkaar tegen.
> - De norm geeft voor **L_kip twee gevallen**: tussen twee gaffels geldt L_kip = L_st, en de
>   formule (1,4 − 0,8·β)·L_st met ondergrens 1,0 geldt bij één kipsteun of tussen twee
>   kipsteunen. `l_kip()` implementeert die formule correct, maar wordt onvoorwaardelijk
>   aangeroepen — ook in het gaffelgeval.
>
> **Nagerekend voor een vrij opgelegde ligger onder gelijkmatig verdeelde last** (M(L/4) =
> 3qL²/32, M_max = qL²/8, eindmomenten nul):
>
> | Grootheid | Wat de code krijgt | Wat de norm vraagt |
> |---|---|---|
> | β | (3qL²/32)/(qL²/8) = **0,75** | eindmomenten nul → **0** |
> | L_kip-factor | 1,4 − 0,8·0,75 = 0,8 → geklemd op **1,0** | 1,4 − 0 = **1,4** |
> | B* | 8·(qL²/8) / (8·qL²/8 + qL²) = **0,500** | eindmoment nul → **0** |
>
> Daar zit de onveiligheid: de kiplengte valt een factor 1,4 te laag uit en dus M_cr te hoog.
> De structurele waarneming uit de campagne — dat B* voor élke vrij opgelegde ligger exact 0,500
> wordt — is hiermee verklaard als rekenkundig gevolg van het invullen van het veldmoment, geen
> toeval. Volgens tabel NB.NB.1 hoort B* = 0 bij zuivere veldbelasting, precies wat zo'n ligger is.
>
> Alle drie de punten staan daarmee hard. De reparatie blijft alles-of-niets: de campagne heeft
> gemeten dat één van de drie losstaand corrigeren de uitkomst 31 % de andere kant op schiet.
> Zij vraagt bovendien een signatuurwijziging, want de eindmomenten worden op dit moment niet
> eens aan de kipfunctie doorgegeven — `orchestrator.rs` levert het maatgevende moment plus
> interpolaties op L/4 en L/2, en daar zit geen eindmoment bij.

**Hoe groot (R16, IPE 330 5,70 m, last op de bovenflens).**

| Grootheid | Bron | App | Afwijking |
|---|---|---|---|
| Mcr | 113,9 kN·m | 125,378 | **+10,08 %** |
| lambda_LT | 1,288 | 1,2276 | −4,69 % |
| chi_LT | 0,480 | 0,5635 | **+17,39 %** |
| Mb,Rd | 92,24 kN·m | 106,459 | **+15,41 %** |
| **UC kip** | **0,981** | **0,850** | **13 procentpunt te laag** |

Ontleding van de +10,08 % op Mcr: **+1,32 %** is legitiem methodeverschil (NL NB tegen de
algemene EN-formule), **+8,64 %** is de foute beta/B*, en de kipkromme kost daarbovenop nog
eens ruim 10 % op chi_LT.

**Waarom het structureel is, niet toevallig.** In `b_ster = 8M/(8|M| + q·L²)` geldt bij
M = M_veld = q·L²/8 identiek q·L² = 8M, dus **B\* = 0,500 exact — voor elke vrij opgelegde
ligger onder alleen veldbelasting**, ongeacht profiel, overspanning of last. Een grootheid
die het aandeel eindmoment moet meten kan met deze voeding nooit iets anders worden. En bij
een lineaire momentlijn geldt beta_app = 0,75·beta_echt + 0,25 (gemeten: beta_echt 0 → 0,250;
−1 → −0,500), dus ook het geval dat het doc-commentaar beschrijft wordt fout gerekend.

**De richting is onveilig precies in de standaardstand.** Bij z_a = +165 mm (de app-default,
last op de bovenflens) is de UC-verhouding 0,860 → onveilig; bij z_a = 0 is het 0,953 en bij
z_a = −165 mm 0,835 → dan veilig-zijdig.

**Repareer de drie punten in één keer.** Alleen beta/B* corrigeren laat `l_kip(0; L_st)` op
1,4·L_st uitkomen: Mcr zakt naar 78,91 kN·m en de UC schiet naar 1,288 — 31 % de andere kant
op. Met alle drie correct komt de app op Mcr 115,40 en UC 0,988 tegen 0,981 in de bron: een
verschil van 0,007, ruim binnen de UC-tolerantie van 0,02.

### B.3 — ONVEILIG · k_cr staat hard op 1,0 in de houttoetsinvoer

**Wat.** `design-mockup/src/lib/timberCheckBuilder.ts` r. 257: `k_cr: 1.0`.
EN 1995-1-1/A1 verg. (6.13a) heeft twee takken: 0,67 voor massief en gelamineerd hout, 1,0
voor houtachtige plaatmaterialen. De sterkteklassen die de kern kent
(`src-tauri/crates/nen-en-1995-1-1/src/data.rs`, C14–C35 en GL24h–GL36h) horen **allemaal**
bij de 0,67-tak. De vaste default is dus de verkeerde tak voor 100 % van het eigen
toepassingsgebied. `BeamCheckConfig` heeft geen k_cr-veld, dus de gebruiker kan het niet
corrigeren.

**Hoe groot.** Overschatting exact 1/0,67 = 1,4925.

| Geval | Grootheid | Met k_cr = 0,67 | Wat de app geeft |
|---|---|---|---|
| R19 | V_Rd | 10,885 kN | **16,246 kN (+49,1 %)** |
| R20 | tau_d | 1,523 N/mm² | 1,081 N/mm² |
| R20 | UC dwarskracht | 0,63 | **0,429 (29 % te laag)** |

Bij R19 en R20 is dwarskracht niet maatgevend, dus daar kantelt het oordeel nog niet — maar
er staat wel een 49 % te hoge V_Rd in het rapport. Het oordeel kantelt bij korte, zwaar
belaste overspanningen en bij inkepingen.

### B.4 — ONVEILIG · kipsteunen van de onderflens worden genegeerd

**Wat.** `lateralRestraintsBottom` heeft een eigen sectie in de UI
(`src/components/fem/FemProperties.tsx`), wordt in het projectbestand bewaard en door
`steelCheckBuilder.ts` netjes als `bottom_flange_positions` doorgegeven — en wordt in de
Rust-kern **nooit gelezen**. `src-tauri/crates/nen-en-1993-1-1-ltb/src/lambda_chi.rs`
(`unbraced_length_mm`) bepaalt L_st uitsluitend uit `top_flange_positions`.

**Hoe groot (R17, IPE 400 15,00 m).** Combinatie 2 is windzuiging, netto opwaarts, dus de
**onder**flens is gedrukt. Ingevoerd: bovenflens om 2,50 m, onderflens om 5,00 m. De app
rekent met L_st = 2 500 mm waar 5 000 mm hoort → UC kip 0,199 in plaats van 0,250, ruim
**20 % te gunstig**. Precies het geval waarvoor het veld bedoeld is (de veldbeschrijving in
`femTypes.ts` noemt letterlijk "waar het moment de onderflens op druk zet").

**Tweede symptoom van dezelfde tekenblindheid.** `equivalentUdlFromMoments`
(`steelCheckBuilder.ts` r. ~223) klemt de pijl van de momentenlijn af op ≥ 0, dus bij een
hogging momentenlijn wordt q_equiv = 0 doorgegeven (gemeten: comb. 1 8,708 N/mm, comb. 2
0,000 N/mm). De B*-term valt dan weg en de kiptoets valt opnieuw te gunstig uit. Beide
gevallen: opwaartse belasting maakt de toets te mild.

### B.5 — BLOKKEREND · het raamwerkpad klemt nul-stijfheid-vrijheidsgraden niet in

**Wat.** Zet je op alle staafeinden een buigscharnier — de letterlijke modellering van een
vlak vakwerk — dan hebben de rotatie-DOF's van de vrije knopen van geen enkele staaf
stijfheid en meldt de kern `Matrix is singular or nearly singular at column N`. Het
**plaatpad** van diezelfde kern klemt zulke DOF's wél automatisch in (`NonlinearSolver`,
blok "Zero stiffness at DOF … auto-constraining"); het raamwerkpad doet dat niet. Dat is een
inconsistentie tussen de twee paden.

**Wat het raakt.** R11 (vlak vakwerk), R24 (onderspannen ligger), R26 (ligger op veren: daar
zijn de horizontale DOF's nergens vastgehouden). Drie van de 26 gevallen; een vlak vakwerk
en een onderspannen ligger zijn doodgewone constructiesoorten. De omweg (per knoop precies
één staafeind momentvast laten) is wiskundig exact — gecontroleerd: grootste |M| = 4,4·10⁻¹³
N·mm — maar niemand vindt hem zonder de wiskunde erachter te kennen.

**Bijkomend.** De melding komt onvertaald in het Engels naar boven, zonder te zeggen wélke
knoop het is of wat eraan te doen.

### B.6 — BLOKKEREND · één oplegging per knoop; opleggingen overschrijven elkaar

**Wat.** `applySupportToMesh` (`design-mockup/src/components/fem/solver/engine.ts`) zet per
oplegging een compleet nieuw `constraints`-object, en `Mesh.updateNode`
(`design-mockup/src/core/fem/Mesh.ts`, r. ~154) doet een ondiepe merge. Een tweede oplegging
op dezelfde knoop overschrijft de eerste volledig. De **rekenkern kan het wel**:
`INode.constraints` draagt `springX`, `springY` en `springRot` naast elkaar — het is de
`SupportType`-enum van de adapter/UI die te smal is.

**Wat het raakt.**
- R26: "verticale veer + horizontale steun op dezelfde knoop" is niet invoerbaar. Zonder die
  combinatie is een ligger op enkel verticale veren singulier. Omweg: een horizontale
  pendelstaaf naar een ingeklemd anker (aantoonbaar inert: normaalkracht exact 0).
- R15: `rotSpring` zet `{x:false, y:false, rotation:true}`, dus de translaties blijven vrij.
  Een **scharnierende voet met rotatieveer** is niet uit te drukken, terwijl dat bij
  portaalspanten standaard is (nominale voetstijfheid 10 % voor UGT-zwaai, 20 % voor BGT).
  Het alpha_cr-model van de bron was daardoor niet na te bouwen.

### B.7 — TE CONSERVATIEF · kiptoets hout altijd aan, met de volle staaflengte

**Wat.** `timberCheckBuilder.ts` (r. ~252/258) zet `perform_ltb_check = true` en
`ltb_segment_length_m = 0` (= volle staaflengte). `BeamCheckConfig.lateralRestraints`
bestaat wel, maar wordt alleen door de staalbouwer gelezen; de sectie "Kipsteunen" in
`FemProperties.tsx` zit in een `{!isHout && …}`-blok. Gemeten: een houten staaf mét
`lateralRestraints [0,25 0,5 0,75]` ingevuld levert exact dezelfde toetsinvoer op.

**Hoe groot.**

| Geval | Wat er hoort | Wat de app doet |
|---|---|---|
| R19 (vloerbalk, zijdelings gesteund door de vloerplaat) | geen kiptoets | UC kip **1,73**, UC_max 2,16 → onterecht afgekeurd |
| R20 (l_ef = 4 667 mm) | sigma_m,crit 66,07 N/mm², UC ≈ 0,90 | l_ef 12 600 mm → sigma_m,crit 24,47, **UC 1,190** → onterecht afgekeurd |

De kipformule zelf is correct (met de hand nagerekend: sigma_m,crit 13,12 N/mm², k_crit
0,5455, UC 1,731 — exact wat de app afdrukt). Het probleem is dat de zijdelingse steun niet
te melden is. Het rapport (`report/sections/BeamsSection.tsx`) drukt de kipsteunen
vervolgens wél af — dat is misleidend, ook al is de uitkomst conservatief.

### B.8 — TE CONSERVATIEF · quasi-blijvende zakking gelijkgesteld aan de karakteristieke

**Wat.** `timberCheckBuilder.ts` r. ~260 voert de karakteristieke zakking aan zowel
`deflection_inst_mm` als `deflection_quasi_perm_mm`; `deflection_permanent_mm` blijft 0. Dat
is **geen onvermijdelijke conservatisme**: de standaard-combinatieset bevat al een
"SLS Quasi-permanent" G + 0,3Q (`design-mockup/src/components/fem/solver/combinations.ts`,
r. ~136) die gewoon wordt doorgerekend. Het juiste getal ligt klaar en wordt niet gelezen.

**Hoe groot.** R19: w_fin 29,175 mm in plaats van 23,048 mm (**+28 %**). R20: w_fin 103,6 mm
in plaats van 77,1 mm.

### B.9 — ONTBREEKT · oplegdruktoets f_c,90 in de houttoetsing

De orchestrator kent geen toets loodrecht op de vezel. R20 toetst hem wel (sigma_c,90,d =
2,59 N/mm², UC 0,86) en R21 ook (1,73 ≤ 2,60 N/mm²). Beide moesten met de hand op onze
snedekrachten worden nagerekend. In `referentie_r20.rs` staat een assert die aanslaat zodra
de toets er komt.

### B.10 — ONTBREEKT · geen dwarskrachtvervorming (Euler-Bernoulli), geen invoerveld

`design-mockup/src/core/fem/Beam.ts` (`calculateBeamLocalStiffness`) bevat uitsluitend EA/L
en de klassieke 12/6/4/2 · EI/Lⁿ-termen; er is geen afschuifparameter en geen veld voor een
afschuifoppervlak of dwarskrachtfactor SRY.

| Geval | Grootheid | Bron | App | Afwijking |
|---|---|---|---|---|
| R12 | w_C mét dwarskrachtvervorming | −1,25926 mm | −0,996214 mm | **−20,89 %** |
| R24 | trekstangkracht C–E | 584 584 N | 585 696 N | +0,190 % |
| R24 | M in H | 49 249,5 N·m | 48 582,4 N·m | −1,354 % |
| R24 | u_z(D) | −0,5428 mm | −0,5645 mm | **−4,003 %** |

Bij R24 is bewezen dat het hier volledig om ligt: een onafhankelijk geprogrammeerde
raamwerkmatrix reproduceert *mét* afschuiving de bron tot 0,005 % en *zonder* afschuiving
onze app tot 10⁻⁹ relatief. Dit is een gedocumenteerde beperking, geen bug — maar wel een
die de app zonder waarschuwing stilzwijgend toepast.

### B.11 — ONTBREEKT · geen eigenwaarde-/knikanalyse, geen alpha_cr-uitvoer

R09 vraagt een kniklast en een kniklengte. Die zijn alleen te krijgen door de
belastingfactor te **bisecteren** tegen de stabiliteitscheck in het tweede-ordepad
(`NonlinearSolver` telt niet-positieve pivots van K_e + K_g). Dat werkt en is exact
(157,9954 kN tegen de gesloten oplossing 157,9953 kN, en 0,0002 % op een ijking met een
scharnier-scharnier Euler-kolom), maar het is een afgeleid gebruik van bestaande
functionaliteit: een gebruiker kan alpha_cr of een kniklast in de UI niet aflezen.

### B.12 — ONTBREEKT · toetsmodules en -methodes die de campagne niet kon draaien

| Wat ontbreekt | Waar het opviel | Gevolg |
|---|---|---|
| `check_timber_beams` staat niet in de `invoke_handler`-lijst van `design-mockup/src-tauri/src/lib.rs` (alleen greet/list_tenants/…/engine_save_pdf); `checkStore.ts` roept hem wel aan | R20 | De v2-app kan de houttoetsing niet aanroepen; alleen via de crate-testroute |
| De meegeleverde stdio-sidecar `openaec-mcp-server` biedt alleen `check_steel_beam` | R19, R22 | Houttoetsen moesten met de hand op onze snedekrachten worden nagerekend |
| `McrMethode::AlgemeenEN` wordt door geen enkele code gelezen; `m_b_rd` kent geen methodekeuze, en `m_cr_algemeen` mist de C2·zg-term | R16 | De **aanbevolen EN**-kiproute is niet te draaien. Zou hij aanroepbaar zijn, dan gaf hij voor een last op de bovenflens 151,1 in plaats van 113,9 kN·m |
| EN 1993-1-1 §6.3.2.4 (vereenvoudigde kipmethode op de slankheid van de drukflens) | R17 | Bronnen die die route gebruiken zijn niet 1-op-1 vergelijkbaar |
| chi_LT,mod volgens 6.3.2.3(2) (kc, f) | R16 | Veilig-zijdig, maar kost hier ruim 1 % marge |
| EN 1993-1-5 §6, lijfweerstand tegen dwarsbelasting | R13 | F_Rd = 324 kN bij F_Ed = 269,5 kN alleen geregistreerd, niet getoetst |
| `BeamCheckConfig.deflectionClass` kent per klasse maar één noemer L/n | R20, R22 | De Duitse NB toetst w_inst op l/300 **én** w_fin op l/200; dat paar is niet vast te leggen |

### B.13 — KLEINER · profieldata en bestandsextensie

**Profielbibliotheek.**

| Wat | Waar | Grootte |
|---|---|---|
| UK Universal Beams ontbreken volledig (414 profielen, uitsluitend Europese series) | R13 (533×210×92 UKB), R14 (686×254×125 UKB) | De doorsnedetoetsing van beide gevallen kon niet met het echte profiel draaien |
| Hoekprofielen (L-secties) ontbreken | R18 (2×L150×150×15, 2×L120×120×12, L100×100×10) | Vervangen door SHS met gelijk oppervlak; 0,4–1,7 % op de staafkrachten |
| GL28c ontbreekt (alleen de homogene klassen GL24h/28h/32h/36h) | R20, R22 | GL28c is een van de meest gebruikte BSH-klassen; leidt tot de stille terugval van B1 |
| Per profiel maar één traagheidsmoment (Iy); geen gedraaid/liggend profiel | R18 (IPE 330 met liggend lijf) | Buiging om de zwakke as in het vakwerkvlak niet invoerbaar |
| Iw wijkt af van de gangbare tabellen | IPE 330: 196 075 tegen 199 100 cm⁶ (−1,52 %); IPE 400: 482 854 tegen 490 000 cm⁶ (−1,5 %) | Raakt alleen `en_general::m_cr_algemeen`, dat nu niet aanroepbaar is. Doorgeven aan de profieldata-audit |

**Bestandsextensie.** De campagne-afspraak vroeg `.femp`, maar `PROJECT_FILE_EXT` in
`design-mockup/src/io/projectFile.ts` is `ifcfem2d`; de openen-dialoog filtert daarop, dus
een `.femp` verschijnt niet in de bestandskiezer. Elk model is daarom onder beide namen
weggeschreven. Campagne-breed gelijk te trekken.

### B.14 — Wat expliciet NIET fout is gebleken

Om de lijst hierboven in verhouding te houden: de volgende onderdelen zijn intensief
beproefd en kwamen er zonder één bevinding uit.

- **De stijfheidsmatrix en de oplossing van het stelsel.** Vijftien gevallen komen overeen,
  waarvan er vier tot op machineprecisie kloppen (R05: 1,3·10⁻¹² %; R25: 1,9·10⁻⁷ %).
- **Statisch onbepaalde systemen, schuine staven, interne scharnieren, verplaatsbare
  (ongeschoorde) raamwerken** — R06 t/m R10, alle binnen 0,35 %.
- **Veeropleggingen.** R25 knijpt de veer uit over zes decaden: van de losse ligger (k → 0)
  naar de starre tweeveldsligger (k → ∞), beide grenzen tot op 0,0002 % goed. R26 idem op
  tussenknopen, met een nette O(h²)-convergentie van 2 naar 512 elementen.
- **De thermische kern.** R23: u_x(b) = 1,920000 mm = alpha·ΔT·L exact; de pendelstaaf blijft
  krachtloos (10⁻¹² kN).
- **De eenhedenketen mm/N/kN aan de adapterkant tegen m/Pa/N in de kern.** R25 volgt hem
  expliciet: 2,1 kN/mm in het bestand → 2 100 N/mm → 2,1·10⁶ N/m in de kern, exact.
- **Deellasten, staafgebonden puntlasten en het splitspad.** R05 draait zes onafhankelijke
  modelleervarianten (deellast met fracties, extra knoop, omgekeerde staafrichting) die
  alle zes exact hetzelfde geven.
- **De combinatiegenerator.** R14 reproduceert de ontwerp-puntlasten van de bron exact
  (187,5 / 525 / 140,63 / 478,13 kN) over vier belastingschikkingen.
- **Het tweede-ordepad en de geometrische stijfheidsmatrix.** R09: de gemeten
  vergrotingsfactor (1,3279) en n/(n−1) uit onze eigen lambda_cr (1,3288) liggen 0,06 % uit
  elkaar; de kniklast convergeert netjes en klopt op 0,0001 % met de gesloten oplossing.
- **De EN 1995-1-1-rekenkern zelf.** Gevoed met de invoer die de bron gebruikt levert hij
  f_m,d, f_v,d, V_Rd, W_erf en w_fin allemaal binnen 1,1 % (R19). De bevindingen B3, B7 en
  B8 zitten in de **aanroeper**, niet in de kern.
- **De doorsnede-eigenschappen van de EN 1993-kern.** R13: Av, Vpl,Rd, Mc,Rd, klasse en de
  M-V-interactie alle binnen 0,03 %. R16: idem binnen 0,02 %.

---

## C. Wat deze campagne NIET dekt

Een validatiecampagne die haar eigen blinde vlekken verzwijgt geeft een vals gevoel van
zekerheid. Dit hoofdstuk is er om dat te voorkomen. De gaten die hieronder staan zijn
**niet** getoetst; over die delen van de app zegt deze campagne niets — niet positief en
niet negatief.

### C.1 De twee grote gaten

**1. De plaatmodule is volledig ongevalideerd.** Geen enkel van de 30 verzamelde gevallen
(26 volwaardige plus Z1–Z4) toetst een plaat- of wandschijfelement. Er is niets gemeten over
`PlateRegion`, de meshgeneratie, de plaatstijfheidsmatrix, de constraint-transfer tussen
plaat- en staafknopen, of de plaat-staaf-interactie. Dat is een hele tak van de app die na
deze campagne precies even ongevalideerd is als ervoor. Wrang detail: het plaatpad van de
kern blijkt in B5 het raamwerkpad de baas op het punt van nul-stijfheid-DOF's — dat is het
enige wat we er nu over weten, en het kwam per ongeluk aan het licht.

**2. De Nederlandse nationale bijlage is bij staal nergens getoetst — terwijl onze
kiptoetsing daar juist op gebouwd is.** Van de zeven staalgevallen gebruiken er vier de
aanbevolen EN-waarden (R15, R16, R17, R18) en twee de Britse NB (R13, R14). R21 is het enige
NL-geval in de hele campagne, en dat is hout (NEN-EN 1990/NB plus EN 1995-1-1).

Dat is precies de verkeerde kant op: `nb_annex` — de NL-implementatie van Mcr, B*, beta en
l_kip — is de module met de meeste eigen rekenregels en de minste externe controle. Bij R16
moest de NL-route tegen een EN-bron gelegd worden, waarna het verschil met de hand ontleed
moest worden in +1,32 % methode en +8,64 % foute invoer. Dat is gelukt, maar het was
speurwerk, geen validatie. **Zolang er geen NL-referentie is, staat de correctheid van de
NB-formules zelf niet vast — alleen dat ze consistent gerekend worden.** Bevinding B2 is
dus vastgesteld op de *invoer* van de NB-route, niet op de NB-route zelf.

### C.2 Onvolledig gedekt

| Onderwerp | Wat er wel is | Wat er niet is |
|---|---|---|
| **Tweede orde** | R09 (vergrotingsfactor 1,35, kniklast) en R15 (alpha_cr,est = 12,5) | Geen enkel geval geeft een tweede-orde **momentenlijn of verplaatsing** om de niet-lineaire solver cijfermatig tegen te leggen |
| **Dwarskrachtvervorming** | Twee referenties (R12, R24) | De app kent het verschijnsel niet; het is dus een **gemeten gat**, geen validatie |
| **De volledige keten bestand → app → rapport** | 26 modelbestanden | 19 daarvan bevatten een surrogaatdoorsnede en 3 geven bij openen een materieel verkeerd antwoord (B1). Wat gevalideerd is, is grotendeels de **solver-API** |
| **De toetsketen bij R13, R14, R18** | Snedekrachten volledig | De weerstanden en unity checks konden niet met het echte profiel draaien (B13) |
| **Doorsnedeklasse en lijfplooi** | Alle gevallen zijn klasse 1 met hw/tw < 72 | **Klasse 2, 3 en 4** en een echte lijfplooitoets (EN 1993-1-5) zijn nergens beproefd |
| **Verbindingen en details** | Genoemd in R18 (boutspeling 58,4 mm), R22 (aansluiting B, 42,4 kN), R15 (voutflens 670 kN) | Alle drie buiten het bereik van de app; niet nagerekend |
| **Eigen gewicht als verifieerbare uitkomst** | R15, R16, R17, R20 rekenen ermee | Geen geval waarin de eigen-gewichtreactie los becijferd is; R18 laat juist zien dat de bron met 124 kN rekent waar rho·A·g 90,7 kN geeft (+37 %) |

### C.3 Helemaal afwezig

- **Beton.** Geen enkel geval, terwijl de app een betonprofielbibliotheek heeft. De
  EN 1992-keten is niet aangeraakt.
- **Platen en wandschijven.** Zie C.1.
- **Scheefstand als zelfstandig geval.** Alleen R15 gebruikt scheefstand, en dan als een
  EHF-puntlast van 0,60 kN die de scheefstandmodule van de app juist **omzeilt** (die
  verdeelt phi·V over alle verticale lasten in plaats van hem op de knie te zetten). De
  module zelf is dus ongetoetst.
- **Rotatieveren als oplegging.** Alleen Z4 noemt er een (6 000 kN·m/rad) zonder bruikbare
  uitkomst — en B6 laat zien dat de app hem sowieso niet kan uitdrukken.
- **Opgelegde zakking van een steunpunt.** Klassiek geval voor doorgaande liggers; nergens
  aanwezig.
- **Temperatuurgradiënt over de doorsnedehoogte.** R23 en R24 gebruiken uniforme ΔT.
- **CC1 en CC3, KFI ≠ 1,0.** Alle gevallen zijn CC2 of geven de combinatie kant-en-klaar.
- **Kip van een houten ligger volgens de NL NB.** R20 doet het volgens de Duitse NB.
- **Vakwerk met numerieke staafkrachten over álle staven.** R18 geeft er vier, R11 geen.
- **UI en interactie.** De campagne draait scripts. Over de canvas-editor, de
  eigenschappenpanelen, de invoervolgorde of de foutmeldingen in de UI zegt zij niets —
  behalve waar een invoerveld aantoonbaar ontbreekt (B1, B3, B6, B7).
- **Rapportgeneratie.** Geen enkel geval loopt door naar de PDF. Dat de kipsteunen in
  `BeamsSection.tsx` worden afgedrukt terwijl ze niet meetellen (B7) kwam uit het lezen van
  de code, niet uit een gevalideerd rapport.
- **Dynamica, trillingen, brand, vermoeiing.** Buiten het bereik van de app én van deze
  campagne.

### C.4 Wat de campagne-opzet zelf beperkt

- **Zes van de 26 gevallen vragen een expliciete modelleeraanname voordat ze vergelijkbaar
  zijn** (R05, R12, R15, R18, R22, R26). Zonder die aannames zijn het er 20.
- **Vrijwel elk A-geval verwaarloost normaalkrachtvervorming** waar onze solver die wél
  meeneemt. Dat is telkens de verklaring van de laatste 0,01–0,08 %, en is per geval
  aangetoond door de proef met A × 1000 te herhalen. Het betekent ook dat de **absolute
  EA-kant van de stijfheidsmatrix** in groep A nauwelijks getoetst is: hij is er telkens
  juist uitgedrukt.
- **De toleranties zijn per geval verschillend** (0,5 % analytisch tot 5 % bij dominante
  aannames). Een geval dat "komt overeen" scoort met 4,8 % is niet even sterk bewijs als een
  geval dat op 10⁻¹² % uitkomt. De kolom "grootste afwijking" in §2.1 staat er om dat
  zichtbaar te houden.

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

Statuscode: **G** = komt overeen · **B** = verschil door de bron · **A** = verschil door een
modelleeraanname · **O** = wijst op iets in onze app. De kolom "grootste afwijking" is de
grootste afwijking over de vergeleken grootheden van dat geval; een uitschieter die door een
bronfout of een niet-nabouwbaar verschijnsel komt, staat er los bij.

| Kenmerk | Constructie | Groep | Toetst | NB | Status | Grootste afwijking |
|---|---|---|---|---|---|---|
| R01 | Ingeklemde ligger 1,0 m, punt- + moment- + axiaal- + lijnlast | A | M, V, w, N-reactie | n.v.t. | **G** gelijk | 0,04 % (afronding bron) |
| R02 | Vierstaafs momentvaste knoop (stervorm) | A | Momentverdeling naar stijfheid, knooprotatie | n.v.t. | **G** gelijk | 0,13 % |
| R03 | Tweescharnier zadeldakportaal 20 × 8/12 m, 4 losse belastinggevallen | A | M, reacties, verplaatsingen | n.v.t. | **G** gelijk | 0,015 % (20/20 waarden) |
| R04 | Zelfde portaal, alle lasten gelijktijdig, lijnlast op projectie | A | Reacties, nokzakking | n.v.t. | **G** gelijk | 0,072 % |
| R05 | Driescharnierspant 8 × 3 m met deellast en puntlast | A | Oplegreacties | n.v.t. | **G** gelijk | 1,3 · 10⁻¹² % |
| R06 | Driehoekig raamwerk met roloplegging op de bovenregel | A | Staafeindmomenten | n.v.t. | **G** gelijk (zetfout in de bron bevestigd) | 0,055 % |
| R07 | Ongeschoord geknikt raamwerk, twee rolopleggingen | A | M, reacties, horizontale verplaatsing | n.v.t. | **G** gelijk | 0,34 % (afronding bron) |
| R08 | Scheef raamwerk met verplaatsbare knopen | A | M, reacties B, verplaatsing D | n.v.t. | **G** gelijk | 0,076 % |
| R09 | Gesloten rechthoekig raamwerk (kokervorm) + kniklast | A | Hoekmomenten, kniklast/kniklengte | n.v.t. | **B** eerste orde gelijk; stabiliteit afwijkend | 0,05 % (1e orde) · 6,65 % (kniklast, BRON) |
| R10 | Ligger met schuine staaf, twee oplegvarianten | A | Staafeindmomenten beide varianten | n.v.t. | **G** gelijk | 0,030 % (11/11 waarden) |
| R11 | Vlak vakwerk, vier staven, puntlast | B | Knoopverplaatsingen | n.v.t. | **G** gelijk · **+ bevinding B5** | 0,0088 % |
| R12 | Korte ligger 1,44 m onder lijnlast | B | Zakking met/zonder dwarskrachtvervorming | n.v.t. | **A** helft niet nabouwbaar | 0,0014 % (zonder afschuiving) · 20,89 % (mét, niet nabouwbaar) |
| R13 | Vrij opgelegde ligger 6,5 m, lijnlast + puntlast, S275 | C | M, V, UC doorsnede + oplegging, w | UK | **G** gelijk (13/13) | 1,11 % (UC dwarskracht, 0,003 absoluut) |
| R14 | Doorgaande ligger 6 + 9 + 4,5 m, 4 belastingschikkingen | C | M, V, reacties per schikking, UC's | UK | **B** 87/88 gelijk, 1 tekenfout in de bron | 1,09 % (op waarden ≥ 25 kN) · 199,98 % (één tekenfout, BRON) |
| R15 | Portaalspant 30 m met gevoute knieën, IPE 500/450 | C | Reacties, M/V/N-verloop, UC's | EN aanbevolen | **A** voute niet modelleerbaar | 4,8 % (na correctie voor enkel H: 1,5 %) |
| R16 | IPE 330, 5,70 m, zijdelings ongesteund — kip | D | Mcr, chi_LT, Mb,Rd, UC, w | EN aanbevolen | **O** fout in de kiptoets, onveilig | 17,39 % op chi_LT · UC kip 13 procentpunt te laag |
| R17 | IPE 400, 15,00 m, tussensteunen + windzuiging | D | M, V, UC, vereenvoudigde kiptoets, w | EN aanbevolen | **G** gelijk (14/14) · **+ bevinding B4, onveilig** | 0,41 % |
| R18 | Vakwerkligger 45,60 m, IPE 330-randen | D | Staafkrachten, UC's, doorbuiging | EN aanbevolen | **A** eigen gewicht + geometrie uit de figuur | 3,60 % (hoofdgrootheden 0,9 %) · 99 % op een zijgrootheid |
| R19 | Vloerligger 45 × 220 mm C24, 4,5 m | E | M, V, VRd, winst, wfin | EN aanbevolen | **O** rekenkant gelijk (12/12), toetsinvoer fout | 1,30 % (afronding bron) · V_Rd +49 % via de app-default |
| R20 | BSH GL28c 160 × 680, 3 + 14 + 3 m met kragarmen | E | M, V, reactie, UC's, kip, w | DE | **G** gelijk · **+ bevindingen B3, B7, B8, B9** | 0,97 % (materiaaldata, niet mechanica) |
| R21 | Doorgaande bekistingdrager 3 × 1,10 m | E | M, V, reacties, w, toetsen | NL | **B** 27/30 gelijk, etiketfout in de bron | 1,48 % · 16,08 % (één etiketfout, BRON) |
| R22 | Houten garagebouw: gordingen, hoofdligger, kolommen | E | Snedekrachten, doorbuiging, kniktoets | DE | **G** gelijk (55/55) | 1,48 % (solvergrootheden 0,36 %) |
| R23 | Statisch bepaald raamwerk met scharnier, pendelstaaf, ΔT = 40 K | F | M, reactie pendelstaaf, w, rotatie door ΔT | n.v.t. | **A** alpha_T niet per staaf instelbaar | 0,097 % (hybride model) · −58,3 % met de app-alpha |
| R24 | Onderspannen ligger 8 m, trekstang voorgespannen via ΔT = −163 K | F | Trekstangkracht, veldmoment, zakking | n.v.t. | **A** geen dwarskrachtvervorming | 4,00 % (u_z(D)) · 0,19 % (trekstang) |
| R25 | Doorgaande ligger 12 m, middensteunpunt op verticale veer | F | Veerreactie, zakking | n.v.t. | **G** gelijk | 1,9 · 10⁻⁷ % |
| R26 | Ligger op elastische ondergrond, vrije uiteinden | F | M, zakking, rotatie + convergentie | n.v.t. | **B** 2-staafskolom exact; 8-staafskolom fout in de bron | 0,05 % (2 staven) · 3,01 % (8 staven, BRON) |

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
| Dwarskracht in G (midden) | −540 N | +540,000 N | 0,000 % op grootte; teken gespiegeld | gelijk (tekenconventie, zie conclusie) |
| Buigend moment in G | 2 800 N·m | 2 800,000 N·m | 0,000 % | gelijk |
| Zakking in G | −4,9 · 10^-2 m | −4,901961 · 10^-2 m | −0,040 % | gelijk (afronding bron) |
| Horizontale (axiale) oplegreactie in A | −24 000 N | −24 000,000 N | 0,000 % | gelijk |

Eigen kruiscontroles, niet in de bron (handafleiding via superpositie op een tweezijdig
ingeklemde ligger, inclusief eigen dubbele integratie voor het geconcentreerde koppel):
Rz(A) 12 540 N · Rz(B) 31 460 N · Rx(B) −16 000 N · M(A) −3 470 N·m · M(B) −5 930 N·m ·
N(A–D) +24 000 · N(D–E) −6 000 · N(E–B) −16 000 N — alle 0,000 %. Evenwicht sluit tot
3 · 10^-11. Route "bestand terugleggen en opnieuw doorrekenen" geeft dezelfde getallen.

**Nationale bijlage.** N.v.t. — analytische benchmark, geen Eurocode-toetsing.

**Aannames en aandachtspunten.**
- Eigen gewicht uitzetten, ondanks de opgegeven volumieke massa.
- De ligger is zeer slap (EI = 3 570 N·m²); de zakking van 49 mm op 1 000 mm overspanning
  is ~5 % van de overspanning. De referentie is een **lineaire** oplossing: reken eerste
  orde, niet geometrisch niet-lineair.
- De axiale reactie −24 000 N volgt exact uit 30 000 · 0,7 + 10 000 · 0,3; invoer en
  uitkomst zijn onderling consistent.

**Ontbreekt in de bron.** Verticale oplegreacties en inklemmingsmomenten in A en B.

**Conclusie.** `KOMT OVEREN` — grootste afwijking **0,040 %**, en die is volledig verklaard:
de bron noteert de zakking op twee significante cijfers (−4,9 · 10^-2 m) terwijl de gesloten
oplossing −0,0490196 m is, precies wat de solver geeft. M(G), de axiale reactie en de grootte
van V(G) vallen tot in het zevende cijfer samen.

De dwarskracht in G heeft een gespiegeld **teken**, geen gespiegelde grootte. Dat is een
conventieverschil, geen fout: onze V = dM/dx (som van de opwaartse krachten links van de
snede), de bron gebruikt T = −dM/dx. Uit onze eigen momentlijn volgt
0 + 4 320 − 3 780 = +540 N. Dat er niets gespiegeld is aan last of geometrie blijkt uit
M(G) = +2 800 N·m, w(G) negatief en Rx(A) = −24 000 N, die alle drie **mét** teken kloppen.

Bron intern consistent; geen zetfout gevonden. Geen aanwijzing voor een fout in de app.
Wel gestuit op **B1** (geen vrije doorsnede-invoer): E = 210 000 N/mm² met A = 1 000 mm² en
I = 17 000 mm⁴ is niet invoerbaar. Opgeslagen met een stijfheidsequivalente houtrechthoek
C24 1336,63 × 14,2829 mm waarvan E·A en E·I exact die van de bron zijn; het script bewijst
met een tweede route (exacte E/A/I rechtstreeks aan `solve()`) dat dit 0,000 % kost.

Bestanden: `design-mockup/referentie/R01.femp` · `toets-R01.mjs` (27 controles, 27 geslaagd).

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
| Rotatie knoop A | 0,227118 rad | 0,227401 rad | +0,1246 % | gelijk |
| Staafeindmoment M(A–B) | 11 023,72 N·m | 11 020,9985 N·m | −0,0247 % | gelijk |
| Staafeindmoment M(A–C) | 113,559 N·m | 113,7044 N·m | +0,1281 % | gelijk |
| Staafeindmoment M(A–D) | −12 348,588 N·m | −12 347,4760 N·m | +0,0090 % | gelijk |
| Staafeindmoment M(A–E) | 1 211,2994 N·m | 1 212,7730 N·m | +0,1217 % | gelijk |
| Controle: som van de vier staafeindmomenten | 0 (momentevenwicht in A) | −6,8 · 10^-13 N·m | 5,5 · 10^-15 % van het grootste | gelijk (exact) |

Eigen kruiscontroles: ΣFx-reacties = −1,1 · 10^-13 N; ΣFz-reacties = 104 000 N = 100 kN
puntlast + 1 kN/m × 4 m (exact).

**Nationale bijlage.** N.v.t.

**Aannames en aandachtspunten.**
- Eigen gewicht (volumieke massa 7,8 · 10^3 kg/m³) niet aanbrengen.
- De bron definieert ook een knoop A2 op (2; 0) die in geen enkele staaf gebruikt wordt —
  negeren.
- De rotatie van 0,227 rad (13°) is groot; opnieuw geldt: lineaire analyse.
- Verificatie met de hoekveranderingsmethode bevestigt de referentie:
  theta_A = (12 500 − 1 333,3) / 49 166,7 = 0,227118 rad.

**Ontbreekt in de bron.** Oplegreacties en knoopverplaatsingen (behalve de rotatie in A).

**Conclusie.** `KOMT OVEREN` — alle vijf de cijfermatige waarden plus de evenwichtscontrole
binnen **0,13 %**, ruim binnen de 0,5 % voor een analytische benchmark.

Het restverschil van ~0,13 % is volledig verklaard en zit niet in onze code. De bron lost het
op met de hoekveranderingsmethode en geeft knoop A daarbij **één** vrijheidsgraad: de
rotatie. Onze solver geeft A ook zijn twee translaties (ux = −0,008 mm, uz = −0,92 mm). Het
toetsscript bewijst dat in drie stappen: (a) een onafhankelijke directe-stijfheids-FEM,
apart geschreven in het script, geeft tot op 10⁻¹⁰ % dezelfde getallen als de app;
(b) diezelfde controle-FEM met knoop A **translatievast** komt op zes cijfers uit op de
bronwaarden (0,227119 / 11 023,7288 / 113,5593 / −12 348,5876 / 1 211,2994); (c) de
handafleiding uit dit dossier reproduceert de bronwaarde op 3 · 10⁻⁴ %. Code `AANNAME`, niet
`ONS`.

Tekenafspraken zijn empirisch vastgesteld met een probe (vrij opgelegde ligger + tweezijdig
ingeklemde ligger), niet aangenomen. De bron geeft **knoop**momenten (daarom sommeren ze op
nul); onze M_start/M_end zijn sagging-positief in lokale staafassen. Twee extra varianten
(lijnlast expliciet lokaal; staaf D–A ongesplitst met een staafgebonden puntlast op
posFrac 0,5) geven bit-identiek hetzelfde.

Gestuit op **B1**: er is geen materiaal met E = 200 000 N/mm² en geen vrije doorsnede-invoer.
Opgelost met C22-rechthoeken (E precies factor 20 kleiner) waarvan E·A en E·I exact kloppen;
blok [C] van het script bewijst dat dit 0,0 % kost (tolerantie 10⁻⁶ %).

Bestanden: `design-mockup/referentie/R02.femp` · `toets-R02.mjs` (24 controles, 24 geslaagd).
`npx tsc --noEmit`: PASS.

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
| p | Dx(C) | 0,0110476 m | 0,0110472498 m | −0,0032 % | gelijk |
| p | Dy(C) | −0,012422374 m | −0,0124233199 m | −0,0076 % | gelijk |
| p | Mz(C) | 18 672,994 N·m | 18 673,193 N·m | +0,0011 % | gelijk |
| p | Fx(A) | 5 175,37 N | 5 175,357 N | −0,0003 % | gelijk |
| p | Fy(A) | 24 233,24 N | 24 233,242 N | 0,0000 % | gelijk |
| F1 | Dx(C) | 0,00000 m | 2,4 · 10^-14 m | nul (procent zonder betekenis) | gelijk |
| F1 | Dy(C) | −0,01497330 m | −0,0149740278 m | −0,0049 % | gelijk |
| F1 | Mz(C) | 41 422,161 N·m | 41 422,371 N·m | +0,0005 % | gelijk |
| F1 | Fx(A) | 4 881,487 N | 4 881,469 N | −0,0004 % | gelijk |
| F1 | Fy(A) | 10 000,00 N | 10 000,000 N | 0,0000 % | gelijk |
| F2 | Dx(C) | −0,03000956 m | −0,0300098461 m | −0,0010 % | gelijk |
| F2 | Dy(C) | −0,00299466 m | −0,00299450162 m | +0,0053 % | gelijk |
| F2 | Mz(C) | 8 284,432 N·m | 8 284,337 N·m | −0,0011 % | gelijk |
| F2 | Fx(A) | 5 976,297 N | 5 976,305 N | +0,0001 % | gelijk |
| F2 | Fy(A) | 4 000,00 N | 4 000,000 N | 0,0000 % | gelijk |
| M | Dx(C) | 0,0273532 m | 0,0273535775 m | +0,0014 % | gelijk |
| M | Dy(C) | −0,001215646 m | −0,00121582570 m | −0,0148 % | gelijk |
| M | Mz(C) | 4 916,724 N·m | −4 916,616 N·m | −0,0022 % op grootte | gelijk (bron geeft grootte, zie conclusie) |
| M | Fx(A) | 4 576,394 N | 4 576,385 N | −0,0002 % | gelijk |
| M | Fy(A) | 5 000,00 N | −5 000,000 N | 0,0000 % op grootte | gelijk (bron geeft grootte, zie conclusie) |

Eigen kruiscontroles: evenwicht per geval (ΣFx, ΣFz, ΣM om A) sluit tot ~10⁻⁷, relatief
< 10⁻⁹ · het staafeindmoment van D–C bij C is exact gelijk aan dat van C–E bij C, in alle
vier de gevallen · superpositie van onze vier gevallen met de lijnlast geschaald naar de
horizontale projectie geeft A(Y) = 31 500,000 N tegen de R04-referentie 31 500 N (−0,0000 %),
met deeltermen 22 500,00 + 10 000,00 + 4 000,00 − 5 000,00.

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

**Conclusie.** `KOMT OVEREN` — alle **20** referentiewaarden binnen **0,015 %**, ruim onder
de 0,5 % voor een analytische referentie. De resterende verschillen zijn afronding aan
bronzijde (de bron rekent met dakliggerlengte 10,7703 m, wij met exact √116 =
10,770329614 m) en zijn niet stelselmatig van teken.

**Tekens in de brontabel.** De bron geeft Mz(C), Fx(A) en Fy(A) voor alle vier de gevallen
als positieve getallen. Bij geval M leveren wij Mz(C) = −4 916,6 N·m en Fy(A) = −5 000 N. Dat
onze tekens kloppen volgt uit twee onafhankelijke bronnen: (a) zuivere statica — een koppel
M = −100 kN·m in D geeft ΣM om A: −10⁵ + 20·R_B,y = 0, dus R_B,y = +5 000 en
R_A,y = −5 000 N; (b) de kruiscontrole die dit dossier bij R04 zelf noteert
(22 500 + 10 000 + 4 000 − 5 000 = 31 500 N) gebruikt eveneens −5 000. De brontabel geeft
daar dus de **grootte**, niet het teken. Die drie kolommen zijn daarom op grootte vergeleken;
de verplaatsingen zijn wél mét teken vergeleken en kloppen ook qua teken.

Geen fout in de bron en geen fout in de app. Wel het scherpste voorbeeld van **B1**: het
opgeslagen `R03.femp` valt bij openen stil terug op HEA 160 voor alle vier de staven, waardoor
ook de verhouding I_kolom : I_ligger = 2 : 1 verdwijnt en geval p Dy(C) = −0,2431 m geeft in
plaats van −0,01242 m. Het bestand is getrouw in geometrie, opleggingen, belastinggevallen en
lasten, maar niet in doorsnede; het toetsscript geeft E, A en I expliciet aan `solve()` mee.

Bestanden: `design-mockup/referentie/R03.femp` · `toets-R03.mjs` (29 controles, 29 geslaagd).

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
| Oplegreactie A, X-richting | 20 239,4 N | 20 238,77 N | −0,0031 % | gelijk |
| Oplegreactie A, Y-richting | 31 500,0 N | 31 500,00 N | 0,0000 % | gelijk |
| Verticale zakking nok C | −0,03072 m | −0,0307421 m | −0,0721 % | gelijk (aanname bron, zie conclusie) |

Aanvullend berekend, niet in de bron: reactie B fx = −10 238,77 N, fz = 18 500,00 N ·
M(A1) = −161,910 kN·m (kolomzijde) / −61,910 (spantbeenzijde) · M(nok) = 62,135 · M(B1) =
81,910 kN·m · N kolom links −31,50, spantbeen links −21,21, spantbeen rechts −16,38, kolom
rechts −18,50 kN · ux(A1) = −4,677, ux(C) = 7,598, ux(B1) = 19,875 mm.

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

**Conclusie.** `KOMT OVEREN` — alle drie de grootheden binnen **0,072 %**, ruim binnen de 1 %
voor een numerieke validatiebundel.

**De restafwijking is verklaard en het is een `AANNAME`, geen fout.** De bron geeft zes
significante cijfers (20 239,4 N), dus 0,07 % is geen afronding. Gevoeligheidsproef: onderdruk
ik de normaalkrachtvervorming (A × 10 000), dan geeft onze solver A_x = 20 239,391 N en
w_C = −0,0307175 m — dat valt op elk gepubliceerd cijfer samen met de referentie. De
"solution analytique" van de bron verwaarloost dus rekvervorming; onze solver neemt die mee.
Ter bevestiging: in R03 (zelfde constructie) is A bewust op 1,0 m² gezet juist om de staven
reklamloos te maken; in R04 zijn de doorsneden realistisch en wordt het verschil zichtbaar.

Zeventien onafhankelijke controles, alle groen. A_y is statisch bepaald en met de hand
afgeleid: 20·A_y = 200 000 + 80 000 − 100 000 + 450 000 → A_y = 31 500 N exact. Die
afleiding bevestigt tegelijk twee tekenkeuzes (het moment in A1 is rechtsom; de horizontale
puntlast wijst in −X). De door dit dossier genoemde fout-variant is gereproduceerd: leg de
lijnlast per meter staaflengte, dan komt A_y op 33 233,2 N — precies de 33 233 N die hierboven
staat. Verfijning naar 4 elementen per staaf verandert niets (ΔA_x = 6 · 10⁻⁹ N).

Beide door dit dossier gemelde tegenstrijdigheden in de bron zijn bevestigd: alleen −20 000 N
en alleen de projectie geven A_y = 31 500 N.

**B1-kanttekening bij het bestand.** `R04.femp` gebruikt houten rechthoeken C24 met de
vierkante afmetingen die de bron zelf noemt (278,3² en 234² mm), zodat A en I uit echte
brongetallen komen — maar E wordt daarmee 11 000 in plaats van 210 000 N/mm². Omdat alle
staven dezelfde E krijgen valt die weg uit de krachtsverdeling: wie het bestand opent krijgt
dezelfde reacties en snedekrachten, maar verplaatsingen die een factor 19,09 te groot zijn.
Er is bewust géén fantasiedoorsnede verzonnen om ook de verplaatsing kloppend te maken.

Bestanden: `design-mockup/referentie/R04.femp` · `toets-R04.mjs` (17 controles, 17 geslaagd).

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
| Av (verticaal in A) | 28,7 kN omhoog | +28,699999999999694 kN | −1,07 · 10^-12 % | gelijk |
| Ah (horizontaal in A) | 38,5 kN naar rechts | +38,499999999999496 kN | −1,31 · 10^-12 % | gelijk |
| Bv (verticaal in B) | 94,5 kN omhoog | +94,50000000000026 kN | +2,75 · 10^-13 % | gelijk |
| Bh (horizontaal in B) | 38,5 kN naar links | −38,50000000000017 kN | −4,4 · 10^-13 % | gelijk |

Eigen kruiscontroles: ΣFz-reacties = 123,200000 kN = 2,24·5 + 112 (exact) · ΣFx = 0 exact ·
ΣM om A = 0 exact · staafeindmoment links en rechts van scharnier S = 0,000000 kN·m exact ·
|M| in beide knieën 115,500000 kN·m tegen de handafleiding Ah·h = 38,5 · 3,0 = 115,5 kN·m.

**Nationale bijlage.** N.v.t.

**Aannames en aandachtspunten.**
- Voor EI moet een willekeurige waarde gekozen worden (statisch bepaald → geen invloed op
  reacties). Noteer welke waarde gekozen is.
- Beperkte referentie: **alleen oplegreacties**. Gebruik dit geval als test op deellasten
  in combinatie met een intern scharnier op een geknikt systeem.

**Ontbreekt in de bron.** Momenten-, dwarskracht- en normaalkrachtlijn; profiel/EI;
verplaatsingen.

**Conclusie.** `KOMT OVEREN` — alle vier de referentiewaarden tot op machineprecisie
(grootste afwijking **1,3 · 10⁻¹² %**, oftewel afrondingsruis in dubbele precisie).

De bron is intern consistent, los nagerekend vóór het modelleren: ΣM om A geeft
Bv·8 = 2,24·5·2,5 + 112·6,5 = 756, dus Bv = 94,5 kN precies; Av = 28,7 kN precies; de
scharniervoorwaarde in S geeft Ah = (28,7·5 − 11,2·2,5)/3 = 115,5/3 = 38,5 kN precies. De
referentiewaarden zijn dus niet afgerond — 2,24 kN/m en 112 kN zijn zo gekozen dat er ronde
reacties uitkomen. Geen zetfout, geen tegenstrijdigheid.

**Wat dit geval wél en niet toetst.** Het systeem is statisch bepaald (4 reacties − 3
evenwichtsvergelijkingen − 1 scharniervoorwaarde = 0), dus de reacties hangen niet van EI af.
Het toetst: geometrie van een geknikt systeem, twee scharnieropleggingen, het **interne
scharnier**, een verdeelde last over een deel van de ligger, en een puntlast op een vrije
positie op een staaf. Het toetst niets wat met stijfheid of statische onbepaaldheid te maken
heeft.

Zes onafhankelijke modelleervarianten geven alle zes exact hetzelfde: [A] scharnier als
startRy rechts; [B] als endRy links; [C] doorsnede vervangen door C24 200×400 (EI ruim 30×
kleiner) — bewijst de EI-onafhankelijkheid; [D] de verdeelde last als twee **echte**
deellasten met fracties [0; 0,4] en [0,4; 1]; [E] extra knoop op x = 6,5 m met een knooplast
in plaats van een staafgebonden puntlast met posFrac; [F] het opgeslagen bestand teruggelezen
en opnieuw doorgerekend. Daarmee zijn het deellastpad én het splitspad van de staafgebonden
puntlast apart geraakt.

Gekozen EI (de bron geeft er geen): IPE 500 / S235, puur zodat het opgeslagen model
realistische verplaatsingen toont (8,77 mm; met de app-default HEA 160 zou het 249 mm zijn).
Variant [C] toont aan dat die keuze niets aan de vergeleken grootheden verandert.

Bestanden: `design-mockup/referentie/R05.femp` · `toets-R05.mjs` (31 controles, 31 geslaagd).

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
| M1 — staafeindmoment AC bij C | −12 kN·m (= −3qa²/10) | −12,0017 kN·m | −0,014 % | gelijk |
| M2 — staafeindmoment CB bij C | −24 kN·m (= −3qa²/5) | −23,9945 kN·m | +0,023 % | gelijk |
| M3 — staafeindmoment DC bij C | 36 kN·m (= −M1 − M2) | +35,9961 kN·m | −0,011 % | gelijk |
| Inklemmingsmoment in A | 6,0 kN·m (uit de M-lijn) | 6,0012 kN·m (ons teken: −) | +0,019 % | gelijk (grootte; zie conclusie) |
| Inklemmingsmoment in B | 12,0 kN·m (uit de M-lijn) | 11,9934 kN·m (ons teken: +) | −0,055 % | gelijk (grootte; zie conclusie) |
| Parabooldeel in DC | 45,0 kN·m (= q·l²/8) | 45,0000 kN·m | 0,000 % | gelijk |
| Netto veldmoment in DC | 27,0 kN·m (45,0 − 18,0) | 27,0019 kN·m | +0,007 % | gelijk |

Eigen kruiscontroles: M1+M2+M3 = 0 in knoop C (residu 10⁻⁶) · M bij D = 0 (roloplegging) ·
ΣFz-reacties = 100,000 kN (= q·6 + F) · ΣFx = 0,000 · ΣM om A = 0,000 · verticale reactie in
D = 24,0006 kN tegen de handcontrole V_D = q·l/2 − M_C/l = 30 − 6 = 24 · reactie-my in A en B
exact tegengesteld aan het staafeindmoment op die knoop (bewijs voor de tekenomrekening).
Limietcontrole met A × 1000: alle afwijkingen < 0,00005 %.

**Nationale bijlage.** N.v.t.

**Aannames en aandachtspunten.**
- **Interne inconsistentie in de bron:** de tekst drukt M4 = ½·M1 = −12 kN·m en
  M5 = ½·M2 = −6 kN·m af, terwijl uit M1 = −12 en M2 = −24 volgt M4 = −6 en M5 = −12.
  De **getekende M-lijn** (6,0 bij A en 12,0 bij B) ondersteunt de laatste; die is hier
  overgenomen. Als onze uitkomst 6 bij A en 12 bij B geeft, is dat status `BRON` (zetfout),
  geen `ONS`.

**Ontbreekt in de bron.** Oplegreacties, dwarskrachten, normaalkrachten, verplaatsingen.

**Conclusie.** `KOMT OVEREN` — alle zeven waarden gereproduceerd, grootste afwijking
**0,055 %**, ruim binnen de tolerantie van 1 % (numeriek) resp. 2 % (uit de figuur gelezen).

Die 0,0x % is aantoonbaar geen solverfout maar de eindige EA van ons model: test [L] draait
hetzelfde model met A × 1000 en dan zakken alle afwijkingen naar **< 0,00005 %**. De solver
reproduceert de klassieke oplossing dus exact zodra de normaalkrachtvervorming wegvalt.
Code `AANNAME`.

Als derde partij is een handafleiding gemaakt (uitgeschreven in het script): één draaiende
knoop C, momentenverdeling in één stap met verdeelfactoren CD 0,2000 / CA 0,26667 /
CB 0,53333 op het inklemmingsmoment q·l²/8 = 45 kN·m, en doorslag ½ naar de inklemmingen.
Die geeft exact −12 / −24 / +36 en 6 / 12. Bron, handafleiding en app vallen samen.

**Zetfout in de bron bevestigd** (code `BRON`, precies zoals dit dossier al aankondigde): de
tekst drukt M4 = ½·M1 = −12 en M5 = ½·M2 = −6 af; onze berekening geeft |M_A| = 6,0012 en
|M_B| = 11,9934, dus M4 = −6 en M5 = −12. De twee waarden zijn in de brontekst verwisseld; de
getekende M-lijn is de juiste, en dat is wat in dit dossier al stond. **Er is dus geen enkele
referentiewaarde uit dit dossier die wij tegenspreken.**

**Gevoeligheidswaarschuwing (test [S] in het script).** Met dezelfde EI maar realistisch
slanke doorsneden (h = 600 mm) lopen de momenten wél op: M1 −3,1 %, M2 +5,2 %, M3 −2,4 %,
M_A −4,4 %, M_B −12,2 %. Dat is geen fout, maar het effect van de puntlast F = 40 kN op de
indrukking van de schuine staven — precies wat de klassieke aanname wegneemt. Voor dit
raamwerk is "niet-verplaatsbare knopen" bij werkelijke slankheden dus geen onschuldige
vereenvoudiging.

Bestanden: `design-mockup/referentie/R06.femp` · `toets-R06.mjs` (18 controles, 18 geslaagd).

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
| MB | 873 kN·m | 873,000 kN·m | 0,000 % | gelijk |
| MC | 426 kN·m | 425,932 kN·m | −0,016 % | gelijk |
| Mechanismerotatie theta | 0,0327750 rad | 0,0327777 rad | +0,008 % | gelijk |
| Horizontale verplaatsing van B | 0,147 m | 0,1474997 m | +0,340 % | gelijk (afronding bron) |
| AV | 81,5 kN | 81,489 kN | −0,014 % | gelijk |
| AH | 338,0 kN | 338,000 kN | 0,000 % | gelijk |
| CV | 422,5 kN | 422,477 kN | −0,005 % | gelijk |
| DV | 71,0 kN | 70,989 kN | −0,016 % | gelijk |
| Waarden bij de V-lijn | 81,5 / 50 / 351,5 / 71 / 338 kN | 81,489 / 50,000 / 351,489 / 70,989 / 338,000 kN | −0,014 / 0,000 / −0,003 / −0,016 / 0,000 % | gelijk |

MB en MC zijn elk twee keer uitgelezen (via kolom AB en via regel BC, resp. via BC en CD);
beide routes geven dezelfde waarde, dus de knoopmomenten sluiten. Onze tekens (de bron geeft
alleen groottes): M kolomtop B = +873, M knoop C = −425,93, M knoop D = 0 kN·m; reactie A
fx = −338,0 / fz = −81,49 kN; C fz = +422,48; D fz = −70,99 kN; B ux = +147,50 mm.
Evenwichtscontrole van onze eigen uitkomst: ΣFx = −2,2 · 10⁻¹⁰, ΣFz = 0,0, ΣM(A) =
9,9 · 10⁻¹⁰.

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

**Conclusie.** `KOMT OVEREN` — grootste afwijking **0,340 %**, en die zit volledig in de
afronding van de bron: die publiceert de horizontale verplaatsing van B als 0,147 m op drie
decimalen, terwijl de exacte waarde 0,1474875 m is. Rond onze 0,1474997 m af op drie
decimalen en er staat 0,147 m. Alle overige twaalf vergelijkingen liggen binnen 0,016 %.

De bron is **onafhankelijk nagerekend vóór de solver werd aangeroepen**, met de
krachtenmethode (het systeem is 1× statisch onbepaald). De afleiding staat volledig
uitgeschreven in de kop van `toets-R07.mjs`. Kern: AH = −(64·4,5 + 50) = −338 kN volgt puur
uit horizontaal evenwicht; MB = 338·4,5 − 64·4,5²/2 = 873 kN·m is exact en
stijfheidsonafhankelijk; met DV als overtollige is δ₁₀ = 7 668/EI, f₁₁ = 108/EI, X = −71,0 kN,
waaruit MC = −426, CV = 422,5 en AV = −81,5 kN. De arbeidsvergelijking geeft
δ_B = 14 748,75/EI = 0,1474875 m en theta = 0,0327750 rad — exact de gepubliceerde theta.
**R07 is intern volledig consistent: er zit geen fout in deze bron.**

De resterende ~0,016 % is de gedocumenteerde aanname over normaalkrachtvervorming: met
A × 1000 lopen de waarden naar 873,0000 kN·m, DV = −71,0000 kN en ux(B) = 147,4875 mm — tot
op zeven cijfers gelijk aan de handafleiding. De 0,016 % is de axiale verkorting van de kolom
(uz(B) = 0,012 mm) die in de handberekening is weggelaten. Code `AANNAME`.

Gestuit op **B1**: er is geen directe EI-invoer. De voorgeschreven EI = 100 000 kN·m² is in
het bestand geperst als C22-rechthoeken 15000 × 200 en 30000 × 200 mm — exact de juiste EI,
maar constructief onzinnige maten. Elk geval uit groep A/B met een voorgeschreven EI loopt
hier tegenaan.

Bestanden: `design-mockup/referentie/R07.femp` · `toets-R07.mjs`. `npx tsc --noEmit`: PASS.

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

Twee kolommen: route A = het opgeslagen bestand langs de volledige app-route; route B =
hetzelfde model met axiaal starre staven, precies de aanname van de bron.

| Grootheid | Referentiewaarde | Onze waarde (route A) | Δ A | Route B (starre EA) | Δ B | Status |
|---|---|---|---|---|---|---|
| MC | −208 kN·m | 207,99191 (grootte) | −0,0039 % | 208,00000 | 0,0000 % | gelijk |
| MD | 32 kN·m | 32,024259 | +0,0758 % | 32,000002 | 0,0000 % | gelijk |
| Grootste moment in staaf CD (absoluut) | 208 kN·m | 207,99191 | −0,0039 % | 208,00000 | 0,0000 % | gelijk |
| Grootste moment in staaf BD (absoluut) | 32 kN·m | 32,024259 | +0,0758 % | 32,000002 | 0,0000 % | gelijk |
| Mechanismerotatie theta (uit u_z,C / 4 m) | 19/375 = 0,0506667 rad | 0,050667991 | +0,0026 % | 0,050666667 | 0,0000 % | gelijk |
| Mechanismerotatie theta (uit u_x,D / 1,5 m) | 19/375 = 0,0506667 rad | 0,050666671 | +0,0000 % | 0,050666667 | 0,0000 % | gelijk |
| BV | 30 kN | 30,002022 | +0,0067 % | 30,000001 | 0,0000 % | gelijk |
| BH | 18,67 kN (18 2/3) | 18,653190 | −0,0722 % | 18,666666 | 0,0000 % | gelijk |
| Horizontale verplaatsing van D | 0,076 m | 0,076000006 | +0,0000 % | 0,076000000 | 0,0000 % | gelijk |

Niet in de bron, wel geleverd (evenwicht sluit tot 10⁻¹⁰ kN): AV = 134,000 kN,
AH = −18,667 kN, u_z,C = −0,202667 m, u_z,D = −0,101333 m. Het grootste moment in het hele
raamwerk zit niet in CD maar in het veld van AC: analytisch AV²/(2q) = 218,98 kN·m op
x = 3,268 m; ons 21-stationsraster meldt daar 218,88 kN·m (het exacte maximum valt net tussen
twee stations). De bron noemt AC niet, dus dit is geen vergelijking maar een aanvulling.

**Nationale bijlage.** N.v.t.

**Aannames en aandachtspunten.**
- Normaalkrachtvervorming verwaarloosd → grote EA aanhouden.
- Let op de tekenconventie voor MC/MD; de bron geeft de absolute controlewaarden apart.

**Ontbreekt in de bron.** Oplegreacties in A; M- en V-lijn niet volledig ingevuld.

**Conclusie.** `KOMT OVEREN` — alle negen referentiewaarden. Grootste afwijking **0,076 %**
langs de bestandsroute en **0,000002 %** met de aanname van de bron (route B). Ruim binnen de
1 % voor een numerieke referentie.

**Drie partijen, één antwoord.** Naast bron en app is een eigen mini-stijfheidssolver
geschreven (6-DOF raamwerkelement, eigen Gauss-eliminatie, geen enkele regel app-code). Die
geeft BH = 18,66666, BV = 30,00000, u_D = 0,076000 m, theta = 0,0506667 rad en
staafeindmomenten CD = [−208,000; +32,000] — cijfer voor cijfer de bron én cijfer voor cijfer
onze solver. De bron is bovendien intern consistent: 10·BV + 1,5·BH = 328, 6·BV + 1,5·BH = 208
en 2·BV − 1,5·BH = 32 sluiten alle drie exact. Geen tegenstrijdigheid gevonden.

Het verschil tussen route A en B is de eindige EA van het gekozen profiel (`AANNAME`). Voor
een gegeven EI hangt EA alleen van de hoogte af (EA = 12·EI/h²), dus een lagere h zou het
restant nog verder wegdrukken.

**Mechanismerotatie.** De bron geeft theta = 19/375 zonder te zeggen waarvan het de rotatie
is. Theta is daarom op twee onafhankelijke manieren uit onze verplaatsingen gehaald — uit
−u_z,C/4 en uit u_x,D/1,5 — en beide geven 0,0506667. Dat die twee routes onderling kloppen
is meteen de controle dat het mechanisme correct is.

**Tekenconventie.** De bron geeft MC = −208 en MD = +32 kN·m in de eindmomentconventie van de
verplaatsingsmethode; onze staafresultaten staan in de zakking-positieve balkconventie en
geven M_start(CD) = +208 en M_end(CD) = +32. Onze onafhankelijke solver levert in zijn eigen
eindmomentconventie CD = [−208; +32] — identiek aan de bron. Vergelijken op absolute waarde
is hier de juiste keuze, zoals dit dossier voorschrijft.

Gestuit op **B1**: EI = 10 000 kN·m² in het bestand geperst als C22 "12000x100" — bewust een
onmogelijke maat, zodat niemand hem voor een echte balk aanziet.

Bestanden: `design-mockup/referentie/R08.femp` · `toets-R08.mjs`. `npx tsc --noEmit`: PASS.

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
| MA = MB | 3,0 kN·m | 2,9988 kN·m | −0,042 % (met EA × 1000: −0,00003 %) | gelijk |
| MC = MD | 15,0 kN·m | 14,9988 kN·m | −0,008 % (met EA × 1000: 15,000000) | gelijk |
| Vergelijking: MC bij starre kolommen | 24,0 kN·m (q·a²/12); gevonden waarde = 62,5 % daarvan | 24,0000 kN·m; 62,4948 % | 0,000 % / −0,008 % | gelijk |
| Rotatieveerstijfheid van de regels r = 6EI/a | 1 000 kN·m/rad | 1 000,000 kN·m/rad | −0,000 % | gelijk (nagemeten met een hulpmodel) |
| Kniklast van de kolom Fk | 149,5 kN | 157,92 kN | **+5,630 %** | afwijking: BRON |
| Kniklengte lk | 8,12 m | 7,9056 m | **−2,640 %** | afwijking: BRON |
| Normaalkracht in de kolom N | 24 + F (kN) | 39,0000 kN | 0,000 % | gelijk |
| Maximale puntlast bij maatgevende kniklast | 125,5 kN | 133,85 kN | **+6,651 %** | afwijking: BRON |
| n = 149,5/(15+24) | 3,83 | 4,0416 | **+5,525 %** | afwijking: BRON |
| Vergrotingsfactor n/(n−1) | 1,35 | 1,3288 (gemeten in het 2e-ordepad: 1,3279) | −1,572 % (−1,636 %) | gelijk |

IJking van de meetmethode (geen dossierwaarde): Euler-kniklast van een scharnier-scharnier
kolom 12 953,86 kN → 12 953,88 kN, +0,0002 %. Nevencontroles, alle exact: knoopevenwicht in
A en C = ±2 · 10⁻¹⁵ kN·m · ΣFz-reacties 78,0000 kN tegen q·a + 2F = 78,0 · horizontale
reacties +2,9996 / −2,9996 kN · inklemmingsmoment in de scharnieropleggingen 2 · 10⁻¹⁵ kN·m ·
zonder de puntlasten F verandert M_C met 9 · 10⁻¹⁵ kN·m, dus de claim van de bron dat F de
momentenverdeling niet beïnvloedt klopt in ons model **exact**.

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

**Conclusie.** Gemengd: **eerste orde `KOMT OVEREN`, stabiliteit `afwijking: BRON`.**
Grootste afwijking 0,05 % op de eerste-ordegrootheden, **6,65 %** op de stabiliteitsgrootheden.

**Eerste orde.** Alle zeven momenten en krachten binnen 0,05 %. Het restje is verklaard: met
EA × 1000 (de bron verwaarloost normaalkrachtvervorming) gaan M_A en M_C naar 3,000000 en
15,000000 kN·m. De handafleiding met de vervormingsmethode geeft onafhankelijk theta_A = −3/k,
M_A = 3 en M_C = 15 kN·m; onze knooprotaties (0,0090 en 0,0270 rad) komen daar exact mee
overeen. De regelveer r = 6EI/a = 1 000 kN·m/rad is met een hulpmodel in dezelfde solver
nagemeten en klopt exact.

**Stabiliteit — uitgezocht in de volgorde model → bron → app.**
(a) *Model:* geometrie, opleggingen, lasten en eenheden geverifieerd via de nevencontroles
hierboven (evenwicht sluit tot 10⁻¹⁵).
(b) *Bron:* het door de bron zelf beschreven vervangingsmodel — kolom 6 m, EI = 1 000 kN·m²,
rotatieveren r = 6EI/a = 1 000 kN·m/rad aan **beide** einden, zijdelings verplaatsbaar — heeft
een gesloten oplossing. Twee onafhankelijke afleidingen geven hetzelfde: (1) de antimetrische
sway-mode met randvoorwaarde tan(kL/2) = r/(EI·k), en (2) slope-deflection met
stabiliteitsfuncties. Beide leveren **N_cr = 157,9953 kN en l_k = 7,90365 m**. De bron geeft
149,5 kN / 8,12 m, dus l_k/L = 1,353 tegen exact 1,317: een waarde van een grafiek of
nomogram, niet van de gesloten oplossing (de klassieke nomogramformule geeft 1,342 → 8,05 m,
in dezelfde richting). De bron is **intern consistent** (π²·1000/8,12² = 149,7 ≈ 149,5;
149,5/39 = 3,83; 3,83/2,83 = 1,35), dus het is geen zetfout maar een **afleesonnauwkeurigheid
in het startgetal**, die doorwerkt in F_max, n en n/(n−1).
(c) *App:* geen aanwijzing voor een fout. Onze waarde convergeert netjes met de elementindeling
(158,275 → 157,917 kN bij 1 → 16 elementen per staaf) en met EA × 10 000 — precies de aanname
van de bron — komt de app op 157,9954 kN / 7,90365 m: **0,0001 % van de exacte gesloten
oplossing**. De resterende 0,05 % bij eindige EA is zuiver normaalkrachtvervorming. Ter ijking
is dezelfde meetmethode losgelaten op een scharnier-scharnier kolom met bekende Euler-kniklast:
0,0002 % afwijking.

**Nuance bij de vergrotingsfactor.** n/(n−1) uit onze eigen lambda_cr is 1,3288; de in het
2e-ordepad **gemeten** vergroting van de zijdelingse uitwijking (met scheefstand 1/200) is
1,3279 — 0,06 % verschil, dus app en formule zijn onderling consistent. Belangrijk: bij de
zuiver symmetrische belasting van dit geval ontstaat **géén** zijdelingse uitwijking en werkt
de factor 1,35 dus nergens op; 2e orde geeft dan M_C = 14,666 tegen 14,999 kN·m in 1e orde
(factor 0,978, puur P-delta binnen de staven). De factor is een imperfectiegrootheid, geen
eigenschap van dit belastinggeval.

**Detail dat de bron niet heeft.** Met q en F samen geschaald vindt de app lambda_cr = 4,0416,
terwijl N_cr/39 = 4,0492 zou zijn. Het verschil van 0,19 % is de drukkracht in de bovenregel
(3 kN per eenheid belasting), die de handmethode met losse kolomveren verwaarloost. Kleine,
maar echte fysica.

Gestuit op **B11**: er is geen eigenwaarde-/knikanalyse en geen alpha_cr-uitvoer. De kniklast
is hier verkregen door de belastingfactor te bisecteren tegen de stabiliteitscheck in het
2e-ordepad. Dat werkt en is exact, maar een gebruiker kan dit in de UI niet aflezen.

Bestanden: `design-mockup/referentie/R09.femp` · `toets-R09.mjs`.

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
| 1 | M1 — staafeind AD bij D | 912 kN·m (= q·a²/20) | 911,9608 kN·m | −0,004 % | gelijk |
| 1 | M2 — staafeind DB bij D | 342 kN·m (= 3q·a²/160) | 341,9958 kN·m | −0,001 % | gelijk |
| 1 | M3 — staafeind DC bij D | −1 254 kN·m (= −11q·a²/160) | −1 253,9566 kN·m | +0,003 % | gelijk |
| 1 | M4 — inklemmingsmoment in A | 456 kN·m (= q·a²/40) | 455,9571 kN·m | −0,009 % | gelijk |
| 1 | Controle knoopevenwicht M1+M2+M3 | 0 | 0,0 kN·m (residu < 10^-9) | exact | gelijk |
| 2 | M1 | −2 480 kN·m | −2 480,000047 kN·m | −0,000 % | gelijk |
| 2 | M2 | −400 kN·m | −399,999937 kN·m | +0,000 % | gelijk |
| 2 | M3 | 2 880 kN·m | 2 879,999984 kN·m | −0,000 % | gelijk |
| 2 | M4 | −3 360 kN·m | −3 360,000033 kN·m | −0,000 % | gelijk |
| 2 | Mechanismerotatie theta | 0,009422 rad | 0,0094222 rad | +0,002 % | gelijk |
| 2 | Horizontale verplaatsing van B | 0,0377 m | 0,037689 m (naar links) | −0,029 % | gelijk (afronding bron) |

Eigen kruiscontroles, alle geslaagd: ΣFz = 4 560 kN · ΣFx = 0 · ΣM om A = 0 · M = 0 in C en B ·
uz(D) en ux(D) ≈ 0 in situatie 1 (< 0,0005 mm) · |ux(B)| = |uz(D)| in situatie 2
(onrekbaarheid van DB) · chordrotatie AD = theta · het opgeslagen bestand teruggelezen geeft
bit-voor-bit dezelfde momenten.

**Nationale bijlage.** N.v.t.

**Aannames en aandachtspunten.**
- Normaalkrachtvervorming verwaarloosd → grote EA aanhouden.
- Twee modellen opslaan (R10a en R10b) omdat alleen de oplegging in B verschilt; goede
  test op de oplegging-editor.

**Ontbreekt in de bron.** Oplegreacties en dwarskrachten; verplaatsingen alleen voor
situatie 2.

**Conclusie.** `KOMT OVEREN` — alle **elf** waarden, beide situaties. Grootste afwijking
**0,0295 %**, volledig verklaard door de afronding van de bron (0,0377 m is op drie cijfers
gegeven; onze 0,037689 m rondt daar exact op af).

**Derde partij.** Het geval is met de hand nagerekend met de verplaatsingsmethode
(slope-deflection, condensatie van de rotaties in B en C, plus de mechanismevergelijking uit
virtuele arbeid). Die reproduceert alle elf referentiewaarden exact, inclusief
theta = δ/a = 0,0376889/4 = 0,0094222 rad. Situatie 2 is bovendien **overbepaald**
controleerbaar: vier staafeindmomenten volgen uit twee onbekenden (theta_D = −0,0058667 rad,
δ = +0,0376889 m) en ze passen alle vier exact. De bron is intern volledig consistent.

**Twee dubbelzinnigheden in dit dossier, met bewijs opgelost** (variant [F] in het script):
1. "C verticale roloplegging" en "B horizontale roloplegging (horizontaal vrij)" klinken als
   verschillende opleggingen, maar het zijn in de app allebei dezelfde soort (zRoller:
   verticaal gesteund, horizontaal vrij). Lees ik C als horizontaal-vast/verticaal-vrij, dan
   wordt DC een uitkraging en komt M4 in situatie 1 op 3 316 in plaats van 456 kN·m. Lees ik B
   in situatie 2 als verticaal-vrij, dan komt M4 op −3 656 in plaats van −3 360 kN·m. Alleen
   de gekozen lezing haalt de bron. Het parenthetische "(horizontaal vrij)" is dus leidend,
   niet de term "horizontale/verticale roloplegging". **Suggestie: die twee termen in dit
   dossier eenduidig maken.**
2. De bron rapporteert staafeindmomenten als "moment dat de staaf op de knoop uitoefent, tegen
   de klok in positief" (daarom M1+M2+M3 = 0); onze solver geeft sagging-positieve momenten.
   De omrekening is met twee probes bewezen (`_probe-r10.mjs`) en met een variant waarin staaf
   DB omgekeerd is ingevoerd — dezelfde getallen, dus geen oriëntatie-afhankelijk teken.

**Belangrijke bevinding over de modellering.** De aanname "normaalkrachtvervorming
verwaarloosd" is voor situatie 1 niet cosmetisch maar **bepalend**: de "niet-verplaatsbare
knopen" bestaan alleen bij onrekbare staven. Met dezelfde EI maar een realistische
doorsnedehoogte loopt situatie 1 spectaculair uit de pas (h = 300 mm: M4 −33 %; h = 900 mm:
M4 zelfs van teken gewisseld), terwijl situatie 2 er nauwelijks gevoelig voor is (< 0,03 %)
omdat het antwoord daar door het buigmechanisme wordt bepaald. De convergentiereeks (variant
[E]) loopt monotoon en zonder numerieke ontsporing naar de bronwaarden tot A·L²/I ≈ 7,7 · 10⁸
— een sterk convergentiebewijs voor de solver zelf.

Gestuit op **B1**: de aanname EA → ∞ is gelegd met fictieve rechthoeken b × 5 mm in C24, met
b tot 3,9 · 10⁹ mm. Een echt profiel kan de aanname principieel niet halen (daar geldt
A·L²/I ≈ 12(L/h)² ≈ 200).

Bestanden: `design-mockup/referentie/R10a.femp` (situatie 1) · `R10b.femp` (situatie 2) ·
`toets-R10.mjs` (38 controles, 0 fouten) · `_probe-r10.mjs`. `npx tsc --noEmit`: PASS.

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
| u_C | 2,6517 · 10^-4 m | 2,651650 · 10^-4 m | −0,0019 % | gelijk |
| v_C | 0,8839 · 10^-4 m | 0,8838835 · 10^-4 m | −0,0019 % | gelijk |
| u_D | 3,47902 · 10^-3 m | 3,479025 · 10^-3 m | +0,0002 % | gelijk |
| v_D | −5,60084 · 10^-3 m | −5,600346 · 10^-3 m | +0,0088 % | gelijk (afrondingsrest bron) |

Zelfde vier waarden via het opgeslagen `R11.femp` (route bestand → `bouwMultiInput` → solver):
bit-identiek. De momentvaste variant die de bron ook noemt: max 0,0261 % — dat bevestigt de
opmerking in de bron dat de twee varianten door de slankheid nauwelijks verschillen.

Niet in de bron, wel afgeleid en op drie manieren gelijk (app, eigen vakwerkmatrix, zuiver
evenwicht; onderling < 4 · 10⁻¹³ %): N_AC = +13 873,435 · N_BC = −6 936,718 ·
N_CD = +15 510,972 · N_BD = −20 810,153 N (trek +); reacties A fx = −9 810, fz = −9 810 N;
B fx = +9 810, fz = +19 620 N. Beide oplegmomenten exact 0.

Toegepaste tolerantie in de bron: 3,0 · 10^-4 (relatief).

**Nationale bijlage.** N.v.t.

**Aannames en aandachtspunten.**
- Modelleer alle staafeinden als scharnieren (vakwerkgedrag); noteer of onze
  scharnierimplementatie op beide staafeinden tegelijk werkt.
- Traagheidsmomenten zijn voor de scharnierende variant niet nodig; als de app een I
  eist, kies een waarde die past bij de opgegeven ronde doorsnede en noteer die.

**Ontbreekt in de bron.** Staafkrachten en oplegreacties (wel handmatig af te leiden — het
vakwerk is statisch bepaald).

**Conclusie.** `KOMT OVEREN` — grootste afwijking **0,0088 %**, ruim binnen de 0,03 % die de
bron zelf hanteert. Bevestigd met drie onafhankelijke routes (app-solver, eigen vakwerkmatrix
met 2 DOF/knoop, eenheidslastmethode met staafkrachten uit zuiver evenwicht) die tot op
10⁻¹³ overeenkomen.

**Dit geval leverde bevinding B5 op — de zwaarste van de groep-B-gevallen.** Het letterlijke
dossiermodel (buigscharnier op **alle** staafeinden) rekent de app niet door: de rotatie-DOF's
van de vrije knopen krijgen dan van geen enkele staaf stijfheid en de kern meldt
`Matrix is singular or nearly singular at column 8` (knoop C, rotatie). Twee punten: (a) het
raamwerkpad klemt nul-stijfheid-DOF's niet automatisch in terwijl het plaatpad van diezelfde
kern dat wél doet; (b) de melding komt onvertaald in het Engels naar boven, zonder te zeggen
welke knoop het is. Een vlak vakwerk is een doodgewone constructiesoort.

De werkende modellering is geen benadering maar wiskundig exact: laat per **knoop** precies
één staafeind momentvast, dan volgt uit momentevenwicht in die knoop dat dat eindmoment nul
is, dus zijn alle eindmomenten nul, dus ook alle dwarskrachten, en draagt elke staaf zuiver
normaalkracht. Gecontroleerd: grootste |M| = 4,4 · 10⁻¹³ N·mm, oftewel 1,4 · 10⁻²⁰ maal
|N|max · L.

**Kleine onnauwkeurigheid in de bron.** u_C, v_C en u_D zijn precies de afronding (u_D:
afkapping) van de exacte oplossing op het aantal gedrukte cijfers. v_D niet: het fichegetal
−5,60084 · 10⁻³ wijkt 49 maal het laatste gedrukte cijfer af van de exacte waarde
−5,6003458 · 10⁻³. Dat is een afrondingsrest uit de handmatige verplaatsingsmethode van het
fiche, ruim binnen de tolerantie van 3 · 10⁻⁴ die de bron zelf voorschrijft — dus **geen**
reden om de referentie te degraderen, wel iets om te weten als iemand later 0,001 % wil halen
op v_D. De referentiewaarde is niet aangepast.

Gestuit op **B1**: E = 196 200 N/mm² met A = 200 resp. 100 mm² is niet invoerbaar. Omdat de
verplaatsingen van een statisch bepaald vakwerk uitsluitend van E·A afhangen, is `R11.femp`
opgeslagen met een doorsnede die E·A **exact** reproduceert (afwijking 0,00 %); het bestand
levert in de app dus dezelfde getallen als de bron. Traagheidsmoment genomen uit de opgegeven
volle ronde doorsnede (3 183,10 en 795,77 mm⁴); zonder invloed, want alle eindmomenten zijn nul.

Bestanden: `design-mockup/referentie/R11.femp` · `toets-R11.mjs`. `npx tsc --noEmit`: schoon.

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
| Zakking in C **met** dwarskrachtvervorming | −1,25926 · 10^-3 m | −0,996214 · 10^-3 m | **+20,89 %** (onze zakking 20,9 % kleiner) | afwijking: AANNAME — niet nabouwbaar, de app rekent Euler-Bernoulli |
| Zakking in C **zonder** dwarskrachtvervorming | −0,9962 · 10^-3 m | −0,996214 · 10^-3 m | −0,0014 % | gelijk |
| Deelbijdrage buiging v1 = 5qL⁴/(384·E·Izz) | 9,962 · 10^-4 m | 9,96214 · 10^-4 m | +0,0014 % | gelijk |
| Deelbijdrage afschuiving v2 = qL²·SRY/(8·A·G) | 2,630 · 10^-4 m | 0 (verschijnsel bestaat niet in het model) | −100 % | afwijking: AANNAME |

De afschuifbijdrage is onafhankelijk **uit de invoer** nagerekend met de gesloten formule:
2,63046 · 10⁻⁴ m, dus +0,018 % ten opzichte van de bron — louter afronding. De bron is dus
intern consistent: 9,96214 · 10⁻⁴ + 2,63046 · 10⁻⁴ = 1,25926 · 10⁻³ m, exact de opgegeven
totaalzakking.

Eigen controles (statisch bepaald, bron geeft ze niet): R_A = R_B = 72,000 kN exact ·
M_C = qL²/8 = 25,920 kN·m exact · N = 0 exact · ΣFx-reacties = 0 exact. Netverfijning
2/4/12/48 elementen: w_C wijzigt pas in het negende significante cijfer (< 4 · 10⁻⁹ %), dus de
elementbelasting wordt exact verwerkt.

**Nationale bijlage.** N.v.t.

**Aannames en aandachtspunten.**
- **Belangrijkste aanname:** als Open FEM2D Studio geen dwarskrachtvervorming kent
  (Euler-Bernoulli), is alleen de tweede waarde (−0,9962 · 10^-3 m) vergelijkbaar. Noteer
  dat expliciet; een afwijking van 26 % ten opzichte van de eerste waarde is dan
  `AANNAME`, geen `ONS`.
- Eigen gewicht (volumieke massa 7,85 · 10^3 kg/m³) niet aanbrengen.

**Ontbreekt in de bron.** Momenten, dwarskrachten en oplegreacties (statisch bepaald,
triviaal af te leiden).

**Conclusie.** `VERSCHIL DOOR EEN AANNAME` — twee van de vier grootheden komen praktisch
exact overeen (**0,0014 %**), de andere twee zijn **principieel niet nabouwbaar** omdat de app
geen dwarskrachtvervorming kent. Precies de aanname die dit dossier vooraf aankondigde. Het
oordeel is daarom niet "komt overeen": de helft van de referentiewaarden komt niet uit, alleen
om een bekende en gedocumenteerde reden.

**Bewijs dat het om Euler-Bernoulli gaat.** `design-mockup/src/core/fem/Beam.ts`, functie
`calculateBeamLocalStiffness`, bevat uitsluitend EA/L en de klassieke 12/6/4/2 · EI/Lⁿ-termen;
er is geen afschuifparameter Φ = 12EI/(G·A_s·L²). Een grep over `design-mockup/src` op
afschuifoppervlak / dwarskrachtfactor / Timoshenko levert niets. Er is dus **geen invoerveld**
waarmee de gebruiker SRY = 2,42 zou kunnen opgeven. Zie bevinding **B10**.

**De bron is intern consistent.** v1 en v2 zijn opnieuw afgeleid uit de invoer (niet uit de
referentiegetallen) en geven samen exact de opgegeven totaalzakking. Geen zetfout, geen
tegenstrijdigheid, alleen afronding op vier cijfers. **Geen aanwijzing voor een fout in de
bron en geen aanwijzing voor een fout in de app.**

Gestuit op **B1**: de fictieve doorsnede (A = 3 100 mm², I = 2,81 · 10⁷ mm⁴ bij
E = 200 000 N/mm²) komt in geen catalogusprofiel voor. `R12.femp` gebruikt daarom S235 /
UPE 220, het profiel dat E·I het dichtst benadert (+0,232 %, w_C = −0,9939 mm). Het toetsscript
gebruikt de exacte E, A en I rechtstreeks via de solver-API.

Bestanden: `design-mockup/referentie/R12.femp` · `toets-R12.mjs`. `npx tsc --noEmit`: exit 0.

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
| MEd in het midden | 539,5 kN·m | 539,62 kN·m | +0,02 % | gelijk |
| VEd bij de oplegging | 269,5 kN | 269,60 kN | +0,04 % | gelijk |
| Vc,Ed bij het maximale moment | 62,5 kN | 62,48 kN | −0,04 % | gelijk |
| Av | 5 723,6 mm² | 5 723,64 mm² (bronformule) / 5 723,6 (kern) | 0,00 % / +0,01 % | gelijk |
| Vpl,Rd | 909 kN | 908,75 kN | −0,03 % | gelijk |
| UC dwarskracht | 0,30 | 0,2967 | −1,11 % (0,003 absoluut) | gelijk |
| Mc,Rd = Mpl,Rd | 649,0 kN·m | 649,00 kN·m | 0,00 % | gelijk |
| UC buiging | 0,83 | 0,8315 | +0,18 % | gelijk |
| Momentreductie door dwarskracht | Niet nodig (0,5·Vpl,Rd = 454,5 kN > 62,5 kN) | Niet nodig; onze module meldt V_z,Ed = 62,475 < V_z,pl,Rd/2 = 454,375 kN | zelfde conclusie | gelijk |
| Lijfweerstand tegen dwarsbelasting FRd | 324 kN bij FEd = 269,5 kN → UC 0,83 | — | — | niet vergeleken (EN 1993-1-5 zit niet in onze module; zie B12) |
| BGT-doorbuiging w | 8,5 mm | 8,483 mm | −0,20 % | gelijk |
| Grenswaarde wlim | 6 500/360 = 18,1 mm | 18,06 mm | −0,25 % | gelijk |

Bronconsistentie (norm-formules op de brongegevens, geen app-uitkomst): Av = A − 2·b·tf +
(tw+2r)·tf = 5 723,64 mm² (0,00 %) · Vpl,Rd 908,75 kN (−0,03 %) · Mc,Rd 649,00 kN·m (0,00 %) ·
0,5·Vpl,Rd 454,37 kN (−0,03 %). Onze module geeft verder: doorsnedeklasse 1, maatgevende toets
6.2.5_bending_y, UC_max 0,8315, status Ok; de kiptoets 6.3.2 geeft Mb,Rd = 649 kN·m (geen
kipreductie), consistent met de kipvaste ligger uit de bron.

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

**Conclusie.** `KOMT OVEREN` — alle **13** vergelijkbare grootheden binnen de tolerantie.
Grootste afwijking **1,11 %**, uitsluitend op de unity check dwarskracht (wij 0,2967, de bron
drukt 0,30 af): absoluut 0,003, ruim binnen de 0,02 voor unity checks. Alle overige
afwijkingen liggen onder 0,25 % en zijn zichtbaar afronding van de bron, die verder rekent met
F1,d = 63,7 kN/m en F2,d = 125,0 kN terwijl 0,925·1,35·15 + 1,5·30 = 63,73125 kN/m en
0,925·1,35·40 + 1,5·50 = 124,95 kN. Met de onafgeronde waarden is M_Ed = 539,63 kN·m; de bron
noteert 539,5. **Dit is het enige geval waarin de hele keten — krachtsverdeling,
doorsnedeklasse, weerstanden, M-V-interactie, doorbuiging — sluitend gevalideerd is.**

De toetsmodule kon echt gedraaid worden, niet nagerekend: de EN 1993-1-1-kern in
`src-tauri/crates/` is bereikbaar via de stdio-sidecar
`src-tauri/target/release/openaec-mcp-server` (JSON-RPC-tool `check_steel_beam`).

**Gestuit op B13 (profielbibliotheek) en B1.** 533 × 210 × 92 UKB staat niet in onze
profieldatabase (414 profielen, uitsluitend Europese series — geen enkele UK Universal Beam)
en de app kent geen handmatig in te voeren doorsnede. Wordt `R13.femp` geopend zoals hij is,
dan valt `resolveSection` **stil terug op HEA 160 / S235**. Gevolg: M en V blijven goed omdat
het systeem statisch bepaald is, maar de BGT-doorbuiging wordt **279,9 mm in plaats van
8,48 mm** — een factor 33 — en de doorbuigingstoets zou het profiel onterecht afkeuren. De
terugval is bewust niet weggepoetst; het toetsscript rekent beide varianten door.

**Bijkomende observatie, geen afwijking.** `src-tauri/crates/section-properties/src/i_section.rs`
(r. 35) berekent av_z zonder de ondergrens eta·hw·tw uit EN 1993-1-1 §6.2.6(3). Voor dit
profiel zou die ondergrens met de aanbevolen eta = 1,2 juist maatgevend zijn
(1,2·501,9·10,1 = 6 083 > 5 723,6 mm²). Het weglaten werkt veilig-zijdig en levert hier exact
de waarde die de bron met de Britse NB (eta = 1,0) gebruikt. Geen actie nodig, wel goed om te
weten bij een volgend geval waar dwarskracht wél maatgevend is.

Bestanden: `design-mockup/referentie/R13.femp` · `model-R13.mjs` · `toets-R13.mjs` (13/13
binnen tolerantie) · `R13-resultaat.json`. `npx tsc --noEmit`: PASS.

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
| 1 | Puntlasten (pt 2/4/5/7) | 187,5 / 525 / 525 / 140,6 kN | 187,5 / 525 / 525 / 140,63 | 0,00 / 0,00 / 0,00 / +0,02 % | gelijk |
| 1 | Reacties (pt 1/3/6/8) | −37 / 745 / 758 / −88 kN | −36,81 / 745,22 / 758,22 / −88,50 | 0,53 / 0,03 / 0,03 / −0,57 % | gelijk |
| 1 | Dwarskrachten | −37 / −224,5 / 520,5 / −4,5 / −529,5 / 228,5 / 88 kN | −36,81 / −224,31 / 520,91 / −4,09 / −529,09 / 229,13 / 88,50 | 0,53 / 0,09 / 0,08 / 9,12 / 0,08 / 0,27 / 0,57 % | gelijk (9,12 % = Δ 0,41 kN op een afgelezen −4,5 kN) |
| 1 | Momenten (pt 2/3/4/5/6/7) | −110 / −783 / 779 / 767 / −820 / −133 kN·m | −110,42 / −783,33 / 779,40 / 767,13 / −820,14 / −132,75 | −0,38 / −0,04 / 0,05 / 0,02 / −0,02 / 0,18 % | gelijk |
| 2 | Puntlasten | 525 / 187,5 / 187,5 / 478 kN | 525 / 187,5 / 187,5 / 478,13 | 0,00 / 0,00 / 0,00 / 0,03 % | gelijk |
| 2 | Reacties | 182 / 547 / 401 / 247 kN | 182,99 / 546,72 / 401,27 / 247,15 | 0,54 / −0,05 / 0,07 / 0,06 % | gelijk |
| 2 | Dwarskrachten | 182 / −343 / 205 / 17 / −170 / 231 / −247 kN | 182,99 / −342,01 / 204,71 / 17,21 / −170,29 / 230,98 / −247,15 | 0,54 / 0,29 / −0,14 / 1,22 / −0,17 / −0,01 / −0,06 % | gelijk |
| 2 | Momenten | 548 / −477 / 137 / 189 / −322 / 371 kN·m | 548,96 / −477,08 / 137,04 / 188,66 / −322,22 / 370,72 | 0,17 / −0,02 / 0,03 / −0,18 / −0,07 / −0,08 % | gelijk |
| 3 | Puntlasten | 187,5 / 525 / 525 / 478 kN | 187,5 / 525 / 525 / 478,13 | 0,00 / 0,00 / 0,00 / 0,03 % | gelijk |
| 3 | Reacties | −33 / 729 / 901 / 118 kN | −32,64 / 729,01 / 901,27 / 117,98 | 1,09 / 0,00 / 0,03 / −0,02 % | gelijk |
| 3 | Dwarskrachten | −33 / −220 / 509 / −16 / −541 / 360 / **118** kN | −32,64 / −220,14 / 508,87 / −16,13 / −541,13 / 360,15 / **−117,98** | 1,09 / −0,06 / −0,02 / −0,79 / −0,02 / 0,04 / **−199,98 %** | **afwijking: BRON** (tekenfout in het laatste segment; zie conclusie) |
| 3 | Momenten | −98 / −758 / 768 / 720 / −903 / 177 kN·m | −97,92 / −758,33 / 768,29 / 719,91 / −903,47 / 176,97 | 0,09 / −0,04 / 0,04 / −0,01 / −0,05 / −0,02 % | gelijk |
| 4 | Puntlasten | 525 / 525 / 525 / 140,6 kN | 525 / 525 / 525 / 140,63 | 0,00 / 0,00 / 0,00 / 0,02 % | gelijk |
| 4 | Reacties | 104 / 967 / 721 / −76 kN | 103,82 / 967,09 / 720,72 / −76,00 | −0,17 / 0,01 / −0,04 / 0,00 % | gelijk |
| 4 | Dwarskrachten | 104 / −421 / 546 / 21 / −504 / 217 / 76 kN | 103,82 / −421,18 / 545,91 / 20,91 / −504,09 / 216,63 / 76,00 | −0,17 / −0,04 / −0,02 / −0,43 / −0,02 / −0,17 / 0,00 % | gelijk |
| 4 | Momenten | 312 / −952 / 686 / 748 / −764 / −114 kN·m | 311,46 / −952,08 / 685,65 / 748,38 / −763,89 / −114,00 | −0,17 / −0,01 / −0,05 / 0,05 / 0,01 / 0,00 % | gelijk |
| — | Maatgevend MEd (pt 3, schikking 4) | −952 kN·m | −952,08 kN·m | −0,01 % | gelijk |
| — | Maatgevend VEd (pt 3, schikking 4) | 546 kN | 545,91 kN | −0,02 % | gelijk |
| — | Vc,Rd | 1 280 kN → UC 0,43 | UC 0,426 met onze VEd en de weerstand van de bron | Δ 0,004 absoluut | UC gelijk; Vc,Rd zelf niet vergeleken |
| — | Mc,y,Rd | 1 060 kN·m → UC 0,90 | UC 0,898 met onze MEd en de weerstand van de bron | Δ 0,002 absoluut | UC gelijk; Mc,y,Rd zelf niet vergeleken |
| — | Kip segment 6-7 (M6 = −820, M7 = −133, Lcr = 3,0 m; 1/√C1 = 0,79 → C1 = 1,60) | Mb,Rd = 1 060 kN·m → UC 0,77 | — | — | niet vergeleken (profiel niet in de bibliotheek; toetsing niet vanuit tsx aanroepbaar) |
| — | Kip segment 2-3 (M2 = 312, M3 = −952, Lcr = 3,0 m) | 1/√C1 = 0,69 → C1 = 2,10 | — | — | niet vergeleken (idem) |

Handafleiding op de matenset van dit dossier, als controle op de **bron** (geen app-uitkomst):
Vpl,Rd ≈ 1 290 kN (+0,8 % t.o.v. 1 280) en Mc,Rd ≈ 1 058 kN·m (−0,1 % t.o.v. 1 060) bij
fy = 265 N/mm² — dat bevestigt dat de bron de dikteknik uit tabel 3.1 toepast (tf = 16,2 mm).

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

**Conclusie.** `VERSCHIL DOOR DE BRON` — **87 van de 88** vergelijkingen liggen binnen de
tolerantie; één rij is een tekenfout in de bron. Over de 87 overige rijen is de grootste
afwijking 9,12 % (dat is V = −4,5 kN met Δ 0,41 kN, pure afleesafronding); over alle rijen met
|ref| ≥ 25 kN/kN·m is de grootste afwijking **1,09 %**, met een absolute Δ van 0,36 kN. De bron
rondt op hele kN/kN·m af, dus dat is precies de verwachte ruis.

**De bronfout.** Schikking 3, dwarskracht in segment 7 (x = 18 tot 19,5 m): de bron geeft
+118 kN, wij −118,0 kN. De bron is hier aantoonbaar fout, om drie onafhankelijke redenen:
1. De bron geeft zelf R(pt8) = +118 kN. Met de conventie die zij in alle vier de schikkingen
   gebruikt moet de dwarskracht in het laatste segment gelijk zijn aan −R(pt8), anders sluit
   het evenwicht in de laatste knoop niet.
2. De bron geeft zelf M(pt7) = +177 kN·m, en M moet over de laatste 1,5 m naar nul lopen.
   dM/dx = V geeft V = −177/1,5 = −118 kN, dus negatief.
3. In de drie **andere** schikkingen staat het teken er wél goed in: schikking 1 V(seg7) = +88
   bij R(pt8) = −88; schikking 2 −247 bij +247; schikking 4 +76 bij −76. Alleen schikking 3
   breekt dat patroon.

**Onafhankelijke controle.** Om te kunnen beslissen wie eraf zit, bevat het toetsscript een
tweede, van de app losstaande berekening: de gesloten driemomentenvergelijking van Clapeyron
voor een doorgaande ligger op vier starre steunpunten. Die gebruikt geen enkele regel app-code
en geen stijfheidsmatrix. Uitkomst: voor **alle vier** de schikkingen komen app en handformule
overeen tot 9,2 · 10⁻¹¹ kN/kN·m — machineprecisie — voor alle reacties, alle zeven
dwarskrachten en alle zes momenten. De app is dus exact; de bron zit er in die ene rij naast.

Waar de bron er iets naast zit, zit zij ook met zichzelf in de knoop: in schikking 2 geeft zij
R(pt1) = 182 kN maar M(pt2) = 548 kN·m, terwijl 548/3 = 182,67 — twee afleeswaarden van
hetzelfde diagram die 0,67 kN uit elkaar liggen. Onze exacte waarden zijn 182,99 en 548,96.

De combinatiegenerator reproduceert de ontwerp-puntlasten exact (187,5 / 525 / 140,63 /
478,13 kN), dus de vier belastingschikkingen zijn correct als combinaties van vier
belastinggevallen op te bouwen.

**Wat niet vergeleken kon worden.** De weerstanden en de kiptoets zelf (Vc,Rd, Mc,y,Rd, Mb,Rd,
C1) — twee zelfstandige blokkades: (1) de EN 1993-toetsing zit achter een Tauri-commando en is
vanuit een tsx-script niet aanroepbaar (**B12**); (2) het profiel 686 × 254 × 125 UKB zit niet
in de bibliotheek (**B13**), dus ook in de app zelf zou de toetsing met een andere doorsnede
rekenen dan de bron. Dit geval valideert dus **alleen de krachtsverdeling**, niet de
toetsketen. Het profiel is vervangen door HEA 550 / S275 (Iy 5 % lager); dat raakt geen enkele
vergeleken grootheid, want M, V en de reacties van deze prismatische doorgaande ligger hangen
alleen af van de verhouding van de buigstijfheden tussen de velden, en die is 1:1:1.

Bestanden: `design-mockup/referentie/R14.femp` · `toets-R14.mjs`.

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

Variant ① = wat de app uit `R15.femp` rekent (voutegebied = kale IPE 450), UGT
1,35G + 1,5S + 1,0 EHF.

| Grootheid | Referentiewaarde | Onze waarde | Δ | Status |
|---|---|---|---|---|
| Verticale oplegreactie per voet VEd | 168 kN | 167,1 kN | −0,5 % | gelijk |
| Horizontale oplegreactie per voet HEd | 116 kN (links +116, rechts −116) | 114,0 kN | −1,7 % | gelijk (zie conclusie: enige oorzaak) |
| Totaal VEd / HEd | 336 kN / 0 kN | 334,2 kN / −1,20 kN (= −ΣEHF; bron rondt op 0 af) | −0,5 % / n.v.t. | gelijk |
| Maximale normaalkracht in de ligger NR,Ed | 130 kN | 127,5 kN | −1,9 % | gelijk |
| Ncr liggerpaar (Lcr = 30/cos5° = 30,1 m) | 772 kN | 771,1 kN | −0,1 % | gelijk (gesloten formule met onze profieldata) |
| Toets 0,09·Ncr = 69 kN < 130 kN | Normaaldruk significant → alpha_cr niet toepasbaar | 69,4 kN < NEd = 128 kN | +0,6 % | gelijk (zelfde conclusie) |
| Horizontale verplaatsing kolomtop onder H_NHF = 0,84 kN | 1,6 mm | bandbreedte 0,39 mm (ingeklemde voeten) tot 2,74 mm (scharnierende voeten) | — | niet vergelijkbaar — het bronmodel met 10 % voetstijfheid is niet invoerbaar (**B6**); 1,6 mm valt wél binnen de bandbreedte |
| alpha_cr,s,est | 12,5 (> 10 → eerste orde volstaat) | — | — | niet nagerekend (formule niet in dit dossier; model met 10 % voetstijfheid niet invoerbaar) |
| Kolomkop MEd | 616 kN·m (spiegel 2 leest links 610 en rechts 616) | 604,4 (rechts) / 598,1 (links) kN·m | −1,9 % / −1,9 % | gelijk |
| Kolomkop VEd / NEd | 117 kN / 162 kN | 114,0 / 161,0 kN | −2,6 % / −0,6 % | gelijk |
| Kolom op 1 475 mm onder de kop | 444 kN·m (alleen in spiegel 1) | 435,4 kN·m | −1,9 % | gelijk |
| Kolom, tweede tussenwaarde | 221 kN·m (alleen in spiegel 1) | — | — | niet vergeleken (positie alleen grafisch aangegeven) |
| Kolomvoet VEd / NEd / MEd | 117 kN / 168 kN / 0 kN·m | 114,0 / 167,4 kN / 0,00 kN·m | −2,6 % / −0,4 % / exact 0 | gelijk |
| Knie (links / rechts) MEd | 693 / 701 kN·m bij VEd = 150 kN, NEd = 130 kN | 680,3 / 687,5 kN·m bij VEd = 149,3, NEd = 127,5 kN | −1,8 / −1,9 % (V −0,4 %, N −1,9 %) | gelijk |
| Einde voute (links / rechts) MEd | 292 / 298 kN·m bij VEd = 117/118 kN, NEd = 127 kN | 281,8 / 287,6 kN·m bij VEd = 117,5 / 117,9, NEd = 124,7 kN | −3,5 / −3,5 % (V +0,4 / −0,0 %, N −1,8 %) | gelijk |
| Nabij de nok (links) | MEd = 356 kN·m, VEd = 0 kN, NEd = 117 kN | 370,5 kN·m (op s = 14 140 mm), NEd = 114,4 kN | +4,1 % (N −2,2 %) | gelijk |
| Nabij de nok (rechts) | MEd = 351 kN·m, VEd = 10 kN, NEd = 116 kN | 365,6 kN·m, NEd = 115,3 kN | +4,2 % (N −0,6 %) | gelijk |
| Momentnulpunten langs het spantbeen | 3 011 / 5 869 mm en 3 011 / 5 941 mm | 5 726 / 5 776 mm | −2,4 / −2,8 % | gelijk; de "3 011 mm" is géén momentnulpunt maar het **einde van de voute** (zie conclusie) |
| Ligger bij M = 0: VEd / NEd | 87 en 86 kN / 124 kN | 88,5 / 88,5 kN / 122,2 kN | +1,8 / +2,9 % / −1,5 % | gelijk |
| Kolom IPE 500: klasse | 1 | — | — | niet nagerekend (toetskern niet in de v2-build; zie **B12**) |
| Kolom: Av / Vpl,Rd | 6 035 mm² / 1 237 kN | 6 035,2 mm² / 1 237,0 kN | +0,0 % / −0,0 % | gelijk (gesloten formule met onze profieldata) |
| Kolom: Nc,Rd / Mc,Rd | 4 118 kN / 779 kN·m | 4 118,0 kN / 777,5 kN·m | +0,0 % / −0,2 % | gelijk |
| Kolom: Nb,Rd (drie toetsingen) | 3 731 / 2 092 / 3 937 kN | — | — | niet nagerekend (**B12**) |
| Kolom: Mb,Rd | 779 resp. 640 kN·m | — | — | niet nagerekend (**B12**) |
| Ligger IPE 450: Vpl,Rd / Nc,Rd / Mc,Rd | 1 042 kN / 3 507 kN / 604 kN·m | 1 041,7 / 3 507,4 kN / 603,5 kN·m | −0,0 / +0,0 / −0,1 % | gelijk |
| Ligger: Nb,Rd | 3 034 / 2 238 / 2 175 kN; Mb,Rd = 581 kN·m | — | — | niet nagerekend (**B12**) |
| UC kolom uit het vlak (6.62), M = 616 kN·m | 0,832 | — | — | niet nagerekend (**B12**) |
| UC kolom uit het vlak (6.62), M = 444 kN·m | 0,758 | — | — | niet nagerekend (**B12**) |
| UC kolom in het vlak (6.61) | 0,625 | — | — | niet nagerekend (**B12**) |
| UC ligger (M = 356 kN·m) | 0,653 | — | — | niet nagerekend (**B12**) |
| UC ligger (M = 298 kN·m) | 0,601 | — | — | niet nagerekend (**B12**) |
| UC ligger in het vlak (M = 356 kN·m) | 0,779 | — | — | niet nagerekend (**B12**) |
| Voute: NEd = 129 kN bij MEd = 661 kN·m tegen Mc,Rd | 1 440 kN·m | 1 439,5 kN·m (Wel,min·fy) | −0,0 % | gelijk |
| Voute: MEd langs de voute | 661 / 562 / 471 / 383 kN·m bij NEd = 129 / 129 / 128 / 127 kN | 643,4 / 545,5 / 452,7 / 364,7 kN·m bij NEd = 127,2 / 126,6 / 126,0 / 125,3 kN | −2,7 / −2,9 / −3,9 / **−4,8 %** (N −1,4 / −1,9 / −1,6 / −1,3 %) | gelijk (binnen de 5 % voor dit geval) |
| Voute: sigma_x,Ed | 174 N/mm² < 355 N/mm² | 171,6 N/mm² | −1,4 % | gelijk |
| Voute: VEd | 147 kN < 1 775 kN | 149,1 kN | +1,4 % | gelijk |
| Voute: drukkracht in de voutflens | 670 kN < 1 214 kN | — | — | niet nagerekend (detailtoets, buiten bereik) |
| Interactiecontroles kolom | VEd < 0,5·Vpl,Rd = 619 kN; NEd < 0,25·Npl,Rd = 1 030 kN en < 847 kN | 618,5 kN / 1 029,5 kN | −0,1 % / −0,0 % | gelijk (de grens 847 kN niet nagerekend) |

Meegevalideerd: onze **profieldatabase** tegen de doorsnedegegevens in de bron. IPE 500 A
11 600 (0,0 %) · Iy 48 200 cm⁴ (0,0 %) · Iz 2 140 tegen 2 142 (−0,1 %) · Wpl,y 2 190·10³ tegen
2 194·10³ (−0,2 %) · iy 203,8 (−0,1 %) · iz 42,95 (−0,3 %) · It 89,3 cm⁴ (0,0 %) · **Iw
1 235,3·10⁹ tegen 1 249·10⁹ mm⁶ (−1,1 %)** · IPE 450 A 9 880 (0,0 %) · Wpl,y 1 700·10³ tegen
1 702·10³ (−0,1 %). Zie **B13**.

Onafhankelijke controle van de solver (krachtenmethode, geen FEM): H bij kale doorsneden
handafleiding 114,07 tegen solver 113,99 kN (−0,08 %); met voute 123,00 tegen 122,97 kN
(−0,03 %).

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

**Conclusie.** `VERSCHIL DOOR EEN AANNAME` — alles wat nagerekend kon worden ligt binnen
**4,8 %** en daarmee binnen de 5 %-tolerantie die dit dossier zelf voor R15 stelt. De statisch
bepaalde grootheden (ΣV, V, N) kloppen op 0,4–2 %; alleen de stijfheidsafhankelijke grootheden
liggen systematisch ~1,7 % laag.

**Het verschil heeft precies één oorzaak.** Een tweescharnierportaal is 1× statisch onbepaald:
H is de enige onbekende, en elk moment is M = M_statisch_bepaald ∓ H·z. Corrigeer ik
**uitsluitend** H met ΔH = 2,01 kN, dan vallen alle dertien vergeleken momenten binnen 1,5 %
(knie 692,4 tegen 693; kolomkop 615,1 tegen 616; nokveldmoment 355,9 tegen 356). Er is dus geen
tweede oorzaak: de statica, de dwarskracht- en de normaalkrachtverdeling kloppen.

**De solver is niet de oorzaak.** H is ook buiten de FEM om berekend met de krachtenmethode
(H = ∫M₀·z/EI ds / ∫z²/EI ds, numeriek geïntegreerd langs de staafassen; sectie 8 van het
script): handafleiding 114,07 tegen solver 113,99 kN (−0,08 %), en met voutestijfheid 123,00
tegen 122,97 kN (−0,03 %). De app rekent het model dat je haar geeft exact goed.

**De oorzaak is de voute.** Met de A en Iy van de voute uit de bron erin (variant ②) wordt de
aansluiting juist **slechter**: H +6,0 %, knie +5,9 %, einde voute +15,4 %, nokveldmoment
−13,9 %. De referentie (H = 116 kN) ligt tussen ons kale model (114,0) en ons voutemodel
(123,0), veel dichter bij het kale. De globale analyse van de bron gebruikte die
stijfheidsverdeling dus niet — óf zij liet de voute in de raamwerkanalyse weg, óf zij nam hem
veel milder mee. Dat is niet uit dit dossier af te leiden. Ook de varianten "waarde aan het
begin van het stuk" en "aan het eind" zijn beproefd: H komt dan op 123,1 resp. 120,5 kN, dus
**geen enkele redelijke vouteweergave levert de 116 kN van de bron**.

**Vondst in de bron / dit dossier.** De rij "Momentnulpunten langs het spantbeen 3 011 /
5 869 mm" kan niet kloppen: 3 011 mm is het **einde van de voute**, waar dit dossier zelf een
regel eerder M = 292/298 kN·m noteert. Door de eigen getallen van de bron terug te rekenen
(M_knie = 697, V_knie = 150, voutemomenten 661/562/471/383) volgt M(s) = −697 + 150·s − 5,42·s²
en liggen de vijf voutedoorsneden op s = 250/935/1620/2305/2990 mm vanaf de kolom-as. De voute
begint dus op de kolomflens (halve kolomhoogte IPE 500 = 250 mm). De modelknopen zijn daar
gelegd; de bron is op dat punt intern volledig consistent.

**Twee dingen die de app niet kan** (geen bugs, wel gaten — gemeld, niet gerepareerd):
1. Geen vrije A/Iy per staaf en geen taps toelopende staven (**B1**). De voute is daarmee
   principieel niet in de app te modelleren; hij kon alleen via de E/A/I-velden van de
   solver-adapter worden ingebracht, buiten het projectbestand om.
2. Een scharnierende voet met rotatieveer is niet uitdrukbaar (**B6**). Daardoor is het
   alpha_cr-model van de bron (voetstijfheid 10 % van de kolomstijfheid) niet na te bouwen.

Eigen gewicht is aangezet, zoals dit dossier voorschrijft: zonder eigen gewicht komt ΣV op
~287 kN in plaats van 336. Met eigen gewicht van IPE 500 + IPE 450 komt het kale model op
334,2 kN en het voutemodel op 336,1 kN — de 336 kN van de bron is dus alleen te reproduceren
mét eigen gewicht inclusief de voutes, precies zoals hier voorspeld.

Bestanden: `design-mockup/referentie/bouw-R15.mjs` · `R15.femp` (25 knopen, 24 staven, 4
belastinggevallen, 3 combinaties) · `toets-R15.mjs` (9 secties, 88 vergelijkingen).
`npx tsc --noEmit`: PASS.

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
| My,Ed | 90,48 kN·m | 90,473 kN·m | −0,01 % | gelijk |
| VEd | 63,50 kN | 63,490 kN | −0,02 % | gelijk |
| Mcr | 113,9 kN·m | 125,378 kN·m | **+10,08 %** | **afwijking: ONS** (+1,32 % NB-methode, +8,64 % foute beta/B*) |
| lambda_LT | 1,288 | 1,2276 | **−4,69 %** | **afwijking: ONS** |
| Kipkromme / alpha_LT | c (h/b = 2,06 > 2) / 0,49 | vast op kromme b / 0,34 | afwijkend | **afwijking: ONS** (`alpha_lt = 0.34` onvoorwaardelijk) |
| lambda_LT,0 / beta | 0,4 / 0,75 | 0,4 / 0,75 | gelijk | gelijk |
| phi_LT | 1,340 | — | — | niet apart uitgelezen (volgt uit lambda_LT en alpha_LT) |
| chi_LT | 0,480 | 0,5635 | **+17,39 %** | **afwijking: ONS** |
| kc / f | 0,94 / 0,984 | niet geïmplementeerd | — | niet vergeleken — ontbreekt in de kern (**B12**), veilig-zijdig |
| chi_LT,mod | 0,488 | niet geïmplementeerd | — | niet vergeleken (idem) |
| Mb,Rd | 92,24 kN·m | 106,459 kN·m | **+15,41 %** | **afwijking: ONS** |
| UC kip | 0,981 | 0,8498 | **−0,131 absoluut (−13,4 %)** | **afwijking: ONS — onveilig** |
| Av | 3 080 mm² | 3 080,3 mm² | +0,01 % | gelijk |
| Vpl,Rd | 417,9 kN | 417,927 kN | +0,01 % | gelijk |
| UC dwarskracht | 0,152 | 0,1519 | −0,0001 absoluut | gelijk |
| Lijfplooi | Niet toetsen: hw/tw = 40,9 < 72 | hw/tw = 40,93, niet getoetst | gelijk | gelijk |
| BGT-doorbuiging onder Gk + Qk | 8,8 mm (= L/648) | 8,7901 mm (= L/648,5) | −0,11 % | gelijk |
| Doorsnedeklasse | 1 | Class1 | gelijk | gelijk |

**Diagnoseloop met de kipketen van de app zelf** (`nb_annex` + `lambda_chi`, ongewijzigd,
andere invoer):

| Variant | Mcr | lambda_LT | chi_LT | Mb,Rd | UC |
|---|---|---|---|---|---|
| A — app nu (beta = 0,75; B* = 0,50; alpha = 0,34) | 125,38 | 1,2276 | 0,5635 | 106,46 | 0,850 |
| B — als A maar kromme c (alpha = 0,49) | 125,38 | 1,2276 | 0,5105 | 96,46 | 0,938 |
| C — NB-correct: beta = 0, B* = 0, L_kip = L_st, kromme c | 115,40 | 1,2795 | 0,4845 | 91,54 | **0,988** |
| D — NB-correcte beta/B*, kromme b | 115,40 | 1,2795 | 0,5346 | 101,01 | 0,896 |
| F — beta = 0, B* = 0, maar L_kip = l_kip(0; L_st) = 1,4·L_st | 78,91 | 1,5474 | 0,3717 | 70,22 | 1,288 |
| **referentie** | **113,90** | **1,288** | **0,488** | **92,24** | **0,981** |

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

**Conclusie.** `FOUT IN DE APP — ONVEILIG.` Dit is de zwaarste bevinding van de hele
campagne. **De kiptoets geeft bij een vrij opgelegde ligger met de last op de bovenflens een
UC die 13 procentpunt te LAAG is (0,850 tegen 0,981).** Alles buiten de kip komt overeen: M, V,
w, Av, Vpl,Rd, UC dwarskracht, klasse en lijfplooi alle binnen 0,15 %.

Het geval is **tweemaal onafhankelijk uitgewerkt**; de tweede uitwerking heeft de hele keten met
een eigen implementatie nagerekend zonder één regel app-code aan te roepen. De vondst houdt
stand en werd op één punt sterker.

**(a) Is het model goed? Ja.** `R16.femp`: twee knopen op x = 0 en 5 700 mm, beide z = 0 (dus
staaflengte = horizontale projectie — geen projectieverwisseling mogelijk), pinned + zRoller,
lijnlasten −9,075 en −6,25 kN/m, selfWeight aan, combinaties 1,35/1,50 en 1,0/1,0.
Handcontrole: rho·A·g = 0,4821 kN/m (bron 0,482) · Gk = 9,5571 (9,56) · q_UGT = 22,2770 (22,28)
· q_BGT = 15,8071 (15,81) · My = qL²/8 = 90,473 · V = qL/2 = 63,490 · w = 5qL⁴/(384EI) = 8,790
mm · L/w = 648,5. Evenwicht: 2V = 126,979 kN = q·L exact.

**(b) Is de bron goed? Ja, volledig.** Met de algemene EN-formule, C1 = 1,132, C2 = 0,459 en
zg = +165 mm (last op de bovenflens, destabiliserend) komt Mcr op 114,02 kN·m tegen 113,9
(+0,1 %). Daarna reproduceert de hele keten: lambda_LT 1,2882 (1,288) · phi_LT 1,3399 (1,340) ·
chi_LT 0,4803 (0,480) · f 0,9843 (0,984) · chi_LT,mod 0,4880 (0,488) · Mb,Rd 92,23 (92,24) ·
UC 0,9810 (0,981). Geen zetfout, geen tegenstrijdigheid. **De handberekening bevestigt de
bron, niet onze uitkomst.**

**(c) Dan zit het in de app — vier bewijsstukken.**

1. **De NB-rekenkunde zelf is goed.** De met de hand overgetypte NB-keten reproduceert de app
   tot in de cijfers: S = 1 406,403 mm (app 1 406,403), C1 = 1,0765, C2 = −0,2466, C = 3,6811,
   Mcr = 125,38 (app 125,378). De fout zit niet in de formules maar in wat erin gaat.
2. **Ontleding van de +10,08 % op Mcr:** +1,32 % is legitiem methodeverschil (de
   NB-parameter S = (h/2)·√(EIz/GIt) impliceert Iw = Iz·(h/2)² = 214 530 cm⁶ in plaats van
   199 100); de resterende **+8,64 %** komt uitsluitend doordat beta en B* uit het
   **veldmoment** worden afgeleid. Dat dit geen R16-toevalligheid is: in
   `b_ster = 8M/(8|M| + q·L²)` geldt bij M = M_veld = qL²/8 identiek q·L² = 8M, dus
   **B\* = 0,500 exact voor élke vrij opgelegde ligger onder alleen veldbelasting**. NB-correct
   is B* = 0 (basisgeval 2), waar de app-eigen tabel C1 = 1,130 bij geeft — precies de
   klassieke waarde voor deze momentvorm. Pikant: `steelCheckBuilder.ts::equivalentUdlFromMoments`
   berekent mStart en mEnd al correct — de juiste grootheid ligt klaar en wordt niet doorgegeven.
3. **De beta-formule is ook generiek fout.** Voor een lineaire momentlijn geldt
   M(L/4) = 0,75·M1 + 0,25·M2, dus beta_app = 0,75·beta_echt + 0,25. Gemeten: beta_echt −1 →
   −0,500; −0,5 → −0,125; 0 → 0,250; 0,5 → 0,625; 1 → 1,000. Alleen bij constant moment valt het
   samen. Ook het geval dat het doc-commentaar beschrijft wordt dus verkeerd gerekend.
4. **alpha_LT = 0,34 is een implementatiedefect, geen NB-keuze.** De huidige combinatie is
   intern inconsistent én de **minst conservatieve** van alle consistente lezingen (bij
   lambda = 1,2795): 6.3.2.3 + kromme c geeft UC 0,988; 6.3.2.2 + kromme b (tabel 6.4, h/b > 2)
   geeft UC 1,096; de app geeft 0,896. **Onder elke consistente lezing van de norm is de app
   onveilig.** Papierspoor: `docs/superpowers/plans/2026-05-13-en1993-steel-check-rust-engine.md`
   (r. 1124) schreef de voorwaarde zelf op — "Buckling curve b for rolled sections (h/b ≤ 2)" —
   en de voorwaarde is als kale constante geïmplementeerd.

**Sluitend bewijs dat dit de hele oorzaak is.** Repareer alleen deze punten (beta = 0, B* = 0,
L_kip = L_st, kromme c) en laat de NB-methode verder ongemoeid: dan komt de app op Mcr 115,40
(+1,3 % t.o.v. de bron) en UC **0,988 tegen 0,981** — een verschil van 0,007, ruim binnen de
UC-tolerantie van 0,02. Er blijft niets onverklaard over.

**Twee nuances.** (i) De **richting** van de beta/B*-fout hangt af van het aangrijpingspunt:
bij z_a = +165 mm (de app-default) is de UC-verhouding 0,860 → onveilig; bij z_a = 0 is het
0,953 en bij z_a = −165 mm 0,835 → veilig-zijdig. De fout is dus onveilig precies in de stand
die de app standaard aanneemt. (ii) De defecten **heffen elkaar nu gedeeltelijk op**: met de
foute beta = 0,75 geeft `l_kip` een factor 0,8 die naar 1,0 wordt afgekapt, zodat L_kip = L_st
toevallig goed uitkomt. Los repareren schiet 31 % de andere kant op. Zie **B2**.

**Bijvangst** (speelt hier niet mee, want de NB-route gebruikt Iw niet):
`src-tauri/crates/steel-profiles/data/profiles.json` geeft voor IPE 330 iw_mm6 = 196 075·10⁶,
terwijl (h−tf)²·b³·tf/24 = 199 100 cm⁶. Afwijking −1,52 %. Zie **B13**.

Bestanden: `design-mockup/referentie/bouw-R16.mjs` · `R16.femp` · `toets-R16.mjs`.
Regressie-ijkpunten voor de reparatie: Mcr = 113,90 / 115,40 / 125,38 / 78,91 kN·m.

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
| Comb. 1: My,Ed | 244,97 kN·m | 244,93 kN·m | −0,02 % | gelijk |
| Comb. 1: VEd | 65,33 kN | 65,31 kN | −0,03 % | gelijk |
| Comb. 2: My,Ed | 57,66 kN·m | 57,64 kN·m (negatief = hogging, teken correct) | −0,04 % | gelijk |
| Comb. 2: VEd | 15,38 kN | 15,37 kN | −0,07 % | gelijk |
| Mc,Rd | 307,15 kN·m | 307,85 kN·m | +0,23 % | gelijk (Wpl,y 1 310 tegen 1 307 cm³ in de brontabel) |
| UC comb. 1 / comb. 2 | 0,798 / 0,188 | 0,796 / 0,187 | −0,30 % / −0,41 % | gelijk |
| If,z / Af,z / if,z | 658,34 cm⁴ / 31,54 cm² / 4,57 cm | — | — | niet vergeleken — grootheden van §6.3.2.4, die route zit niet in de kern (**B12**) |
| lambda_1 / c0 | 93,9 / 0,50 | — | — | niet vergeleken (idem) |
| Comb. 1: kc / Lc / lambda_f | 1 / 2,50 m / 0,583 ≤ 0,627 (voldoet) | — | — | niet vergeleken (idem) |
| Comb. 2: kc / Lc / lambda_f | 1 / 5,00 m / 1,165 ≤ 2,663 (voldoet) | — | — | niet vergeleken (idem); **hier ligt bevinding B4** |
| Av / Vpl,Rd / UC | 4 269 mm² / 579,21 kN / 0,113 | 4 273,1 mm² / 579,76 kN / 0,113 | +0,10 % / +0,10 % / −0,30 % | gelijk (bron rekent met A = 8 446, onze tabel 8 450 mm²) |
| Lijfplooi | Niet nodig: hw/tw = 43,37 < 72 | niet getoetst | gelijk | gelijk |
| BGT: wtot | 82,10 mm | 82,11 mm | +0,02 % | gelijk |
| BGT: wmax na aftrek zeeg | 52,10 mm (= L/288) | 52,11 mm | +0,03 % | gelijk |
| BGT: doorbuiging door sneeuw alleen | 48,90 mm (= L/307) | 48,86 mm | −0,09 % | gelijk (bron zelf 0,08 % inconsistent, zie conclusie) |
| w_fin uit de toetskern (met zeeg −30 mm) | 52,10 mm | 52,11 mm | +0,03 % | gelijk |

Wat **onze** kiproute (Mcr, NL nationale bijlage) oplevert, apart geregistreerd omdat de bron
een andere methode gebruikt: comb. 1 L_st 2 500 mm, Mcr 980,14 kN·m, lambda_LT 0,560, chi_LT
0,935, Mb,Rd 287,72 kN·m, UC 0,851; comb. 2 L_st 2 500 mm, Mcr 1 020,45 kN·m, chi_LT 0,939,
Mb,Rd 289,21 kN·m, UC 0,199. **Die 2 500 mm bij comb. 2 hoort 5 000 mm te zijn — zie de
conclusie.**

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

**Conclusie.** `KOMT OVEREN` op alle **14** vergelijkbare grootheden (grootste afwijking
**0,41 %**) — **maar dit geval leverde wel bevinding B4 op, en die valt aan de onveilige kant.**

**De bevinding (los van de vergelijking).** De kipsteunen van de **onderflens** worden
genegeerd. `lateralRestraintsBottom` heeft een eigen sectie in de UI, wordt in het
projectbestand bewaard en door `steelCheckBuilder.ts` als `bottom_flange_positions`
doorgegeven — en wordt in de Rust-kern nooit gelezen:
`src-tauri/crates/nen-en-1993-1-1-ltb/src/lambda_chi.rs` (`unbraced_length_mm`) bepaalt L_st
uitsluitend uit `top_flange_positions`. Experimenteel bevestigd: het model zoals ingevoerd
(bovenflens 2,50 m, onderflens 5,00 m) geeft L_st = 2 500 mm; dezelfde staaf met 5,00 m als
**boven**flenssteun geeft 5 000 mm. Voor combinatie 2 (windzuiging, netto opwaarts, dus de
onderflens gedrukt) rekent de app dus met 2,50 m waar 5,00 m hoort: **UC kip 0,199 in plaats
van 0,250, ruim 20 % te gunstig.** Precies het geval waarvoor het veld bedoeld is. De bron
rekent comb. 2 dan ook expliciet met Lc = 5,00 m.

**Zelfde tekenblindheid, tweede symptoom.** `equivalentUdlFromMoments` klemt de pijl van de
momentenlijn af op ≥ 0, dus bij een hogging momentenlijn wordt q_equiv = 0 doorgegeven
(gemeten: comb. 1 8,708 N/mm, comb. 2 0,000 N/mm). De B*-term valt dan weg en de kiptoets valt
opnieuw gunstiger uit. Beide gevallen: **opwaartse belasting maakt de toets te mild.**

**De vergelijking zelf.** De drie afwijkingen boven 0,2 % (Mc,Rd, Vpl,Rd, Av) zijn volledig
verklaard door catalogusverschillen: de bron gebruikt A = 8 446 mm², Wpl,y = 1 307 cm³,
Av = 4 269 mm²; onze tabel 8 450 / 1 310 / 4 273,1. Geen van beide is fout — het zijn twee
afrondingen van dezelfde IPE 400.

**De kiptoets zelf is niet vergeleken, en dat is een echte leemte.** De bron toetst kip met de
vereenvoudigde methode van §6.3.2.4 (slankheid van de drukflens); de kern kent die methode niet
en rekent altijd de Mcr-route van de NL NB (**B12**). Een echte vergelijking van chi_LT/Mb,Rd
kán niet: de bron publiceert die getallen niet, want haar methode levert ze niet op.

**Bron is schoon.** Nagerekend op eigen consistentie met gesloten formules: 8,71 =
1,35·2,45 + 1,50·3,60 · 244,97 = qL²/8 · 57,66 en 15,38 uit −2,05 kN/m · 307,145 = 1 307·235 ·
579,21 = 4 269·235/√3 · 82,10 = 5qL⁴/384EI met q = 6,05 · 52,10 = 82,10 − 30 = L/288 · if,z =
√(658,34/31,54) = 4,569 cm · lambda_f 0,583 en 1,165 met grenzen 0,627 en 2,663 — alles
reproduceerbaar tot in de laatste decimaal. Ook Af,z = 3 154 mm² is exact te reconstrueren
(drukflens 2 430 + twee walsstralen 189 + een derde van het gedrukte lijf 535). Eén
onnauwkeurigheid, te klein om iets te betekenen: de zakking door sneeuw alleen staat als
48,90 mm terwijl 3,60/6,05 · 82,10 = 48,86 mm; beide geven L/307.

**Bruikbaarheidsopmerking (geen fout).** De kern rekent w_fin = w − w_zeeg met w negatief
(omlaag) en documenteert de zeeg in dezelfde conventie. Een zeeg van 30 mm moet dus als **−30**
worden ingevoerd. Consistent gedocumenteerd, maar verwarrend: wie het natuurlijke "30" invult
krijgt w_fin = −112 mm in plaats van −52 mm. Wel veilig-zijdig.

Bestanden: `design-mockup/referentie/R17.femp` · `toets-R17.mjs` (exitcode 0).
`npx tsc --noEmit`: schoon.

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
| Bovenrand naast midden (B107): NEd | −1 477 kN | −1 485,0 kN | −0,54 % | gelijk |
| B107: MEd | 2,86 en −1,05 kN·m; VEd = −1,82 kN | 2,96 en −1,14 kN·m; VEd = −1,93 kN (gemiddeld; loopt van −1,23 naar −2,63) | +3,60 % / −8,78 % / −6,10 % | gelijk (binnen de 5 %; V is een gemiddelde over de staaf) |
| B107: UC | 0,683 | — | — | niet vergeleken (toetsing buiten bereik; zie conclusie) |
| Drukdiagonaal 2e vanaf rechts (B40): NEd | −624,4 kN | −619,1 kN | +0,84 % | gelijk |
| B40: UC's | 0,541 en 0,591 | — | — | niet vergeleken |
| Onderrand midden: NEd / MEd | +1 582 kN / 1,69 kN·m | +1 589,0 kN / 1,69 kN·m | +0,44 % / +0,28 % | gelijk |
| Onderrand: Npl,Rd / Nu,Rd / Nt,Rd / Mpl,Rd | 2 222 / 1 711 / 1 711 kN / 52,3 kN·m | — | — | niet vergeleken |
| Onderrand: N/Nt, M/MR, interactie | 0,93 · 0,03 · 0,96 | — | — | niet vergeleken |
| Trekdiagonaal links: NEd / MEd | 616,3 kN / 1,36 kN·m | 614,7 kN / 1,36 kN·m | −0,26 % / −0,27 % | gelijk |
| Trekdiagonaal: Npl,Rd / Nu,Rd / Nt,Rd / Mel,Rd | 1 956 / 997 / 997 kN / 30,3 kN·m | — | — | niet vergeleken |
| Trekdiagonaal: N/Nt, M/MR, interactie | 0,62 · 0,05 · 0,67 | — | — | niet vergeleken |
| Vervangende ligger: globale dwarskracht V | 562 / 461 / 303 / 101 kN (en spiegelbeeld) | 561,6 / 460,6 / 302,6 / 100,6 kN | −0,08 / −0,10 / −0,15 / −0,44 % | gelijk |
| Vervangende ligger: Nd = V/cos(theta) | 616 / 405 / 135 kN | 615,8 / 404,5 / 134,5 kN (handformule) resp. onze FE-diagonalen 605,9 / 400,5 / 141,6 (trek) en −625,6 / −413,5 / −152,7 (druk) | −0,04 / −0,12 / −0,41 % (FE: −1,6 / −1,1 / +4,9 %, druk tot −13,1 %) | gelijk; de FE-afwijking in het middenveld komt door een vereenvoudiging in de bron (zie conclusie) |
| Vervangende ligger: globaal moment M | 3 273 / 5 455 / 6 320 kN·m | 3 270,0 / 5 448,4 / 6 303,1 kN·m | −0,09 / −0,12 / −0,27 % | gelijk |
| Vervangende ligger: Nch = M/h | 818 / 1 364 / 1 580 kN | 817,5 / 1 362,1 / 1 575,8 kN (handformule); onze FE-onderrandkrachten 817,7 / 1 362,5 / 1 576,2 | −0,06 / −0,14 / −0,27 % (FE −0,03 / −0,11 / −0,24 %) | gelijk |
| Doorbuiging onder UGT-combinatie | 127 mm | 148,1 mm (mét eigen gewicht) / 131,0 mm (zonder) | **+16,6 %** / +3,15 % | **afwijking: BRON** — de 127 mm hoort bij een ander rekenmodel (zie conclusie) |
| Extra doorbuiging door boutspeling (gat 2 mm) | 58,4 mm | — | — | niet vergeleken (buiten bereik van de app) |
| Secundaire momenten randen, liggend IPE 330 | bovenrand 2,7 kN·m · onderrand 1,7 kN·m | 2,96 / 1,69 kN·m | +9,7 % / −0,31 % | de bron geeft op twee plaatsen 2,7 én 2,86 (zie conclusie) |
| Secundaire momenten randen, staand profiel | 28,5 resp. 23,4 kN·m | 35,8 / 24,1 kN·m | **+25,6 %** / +3,09 % | onverklaard restverschil op de bovenrand (zie conclusie) |
| Eindmomenten diagonalen bij starre knopen | trek 1,03 (liggend) / 1,17 (staand) kN·m; druk 1,30 / 2,35 kN·m; eigen gewicht 1,36 kN·m | trek 1,54 / 2,33; druk 1,51 / 3,12 kN·m; eigen gewicht 1,36 | +49,8 / **+99,2** / +16,1 / +32,7 % / −0,27 % | niet bewijskrachtig — de bron zegt niet wélke diagonaal en welk staafeind; volledig gestuurd door het aangenomen I van de dubbele hoekprofielen |

Eigen kruiscontroles, alle geslaagd: ΣFz = 1 124,0 kN · ΣFx = 0 · onderrandstaaf bij de
oplegging 0,01 kN · eindpost = −reactie · combinatie 2 (opwaarts) ΣFz = −478,5 kN ·
m + r = 68 = 2n, dus statisch bepaald.

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

**Conclusie.** `VERSCHIL DOOR EEN AANNAME`. Het vakwerk is volledig nagebouwd (34 knopen, 65
staven, statisch bepaald) en de hoofduitkomsten komen zeer goed overeen: de **vier
staafkrachten** die de bron cijfermatig geeft binnen **0,9 %**, en de twee bijbehorende
staafmomenten binnen 0,3 %. De grootste afwijking op die hoofdgrootheden is 3,60 %.

**Lees de uitschieters goed.** De 99 % in de tabel hoort bij een zijgrootheid van 1 à 3 kN·m
(eindmoment van een momentvast aangesloten diagonaal) en is **niet bewijskrachtig**: de bron
noemt daar niet welke diagonaal en welk staafeind zij bedoelt, en de waarde wordt volledig
gestuurd door het aangenomen traagheidsmoment van de dubbele hoekprofielen in het vakwerkvlak.

**Vier bevindingen.**

1. **De aanname over eigen gewicht is bepalend.** De bron geeft twee lastsets: combinatie 1 =
   91/136/182… "zonder eigen gewicht" en een handberekening met 101/158/202…, waarvan het
   verschil 124 kN is. Uit de doorsneden die de bron opgeeft volgt met rho·A·g echter maar
   **90,7 kN**. Met dat lagere gewicht liggen alle staafkrachten stelselmatig 2,6 à 3,6 % te
   laag. Het rekenmodel van de bron rekent dus met ~37 % méér eigen gewicht dan de opgegeven
   profielen wegen (toeslag voor knoopplaten, bouten, koppelplaatjes; niet benoemd). Twee
   onafhankelijke momentwaarden bevestigen die 124 kN exact: het veldmoment van de
   trekdiagonaal uit eigen gewicht (1,36 kN·m) en het moment in de onderrand naast het midden
   (1,69 kN·m) worden allebei binnen 0,3 % geraakt. Daarom is 124 kN de hoofdvariant.
2. **Fout/onvolkomenheid in de bron — de zakking van 127 mm.** Onze FE geeft 148,1 mm onder
   precies de lastset waar de staafkrachten van de bron bij horen. De elementaire liggerformule
   met I = Σ(A_rand·d²) = 5,008 · 10¹⁰ mm⁴ en de **volle** E = 210 000 geeft voor diezelfde
   lastset 126,6 mm — vrijwel exact de 127 mm van de bron. De 127 mm is dus een zuivere
   randbuigingswaarde **zonder** de globale afschuivingsvervorming, terwijl de bron zelf in
   §3.4 uitdrukkelijk zegt dat die niet verwaarloosbaar is en daarvoor E = 160 000 aanbeveelt
   (dat geeft 166 mm). Onze 148 mm ligt netjes tussen die onder- en bovengrens: dat is de
   juiste plaats voor een echte vakwerk-FE. **De 127 mm hoort niet bij hetzelfde rekenmodel als
   de gepubliceerde staafkrachten.**
3. **Vereenvoudiging in de bron — Nd = V/cos(theta).** De bron rekent met één diagonaalhoek
   voor het hele vakwerk (halve veldbreedte 3 550 mm). In het middenveld is de halve
   veldbreedte 4 250 mm, dus 1/cos = 1,4591 in plaats van 1,3370. De 135 kN uit figuur 3.4 zou
   meetkundig 146,7 kN moeten zijn; tegen die gecorrigeerde waarde wijken onze diagonalen nog
   maar −3,5 % en +4,1 % af, in plaats van +4,9 % en −13,1 %.
4. **Tegenstrijdigheid in de bron:** voor het moment in de liggende bovenrand bij het midden
   geeft zij op twee plaatsen twee getallen: 2,7 kN·m (§3.5.1) en 2,86 kN·m (§4.1.1 /
   figuur 4.2). Ons resultaat 2,96 kN·m wijkt +9,7 % af van de eerste en +3,6 % van de tweede.

**Resterend onverklaard.** De staande bovenrand geeft bij ons 35,8 tegen 28,5 kN·m (+25,6 %),
terwijl de onderrand in beide profielstanden wél klopt (+3,1 % resp. −0,3 %) en de
vermenigvuldigers staand/liggend (12,1× en 14,2×) goed overeenkomen met de 11× en 14× van de
bron. Dat is een secundair moment in het gebied met de secundaire vakwerkstaven — precies het
deel van de geometrie dat uit de figuur is **opgemeten**. Niet aan de app toe te schrijven.

**Geen aanwijzing voor een fout in de app.** Evenwicht, statische bepaaldheid,
scharnierwerking, het teken van de normaalkracht, combinatie 2 (opwaarts) en de bestandsroute
zijn alle in orde.

**Geometrie uit de figuur (aanname A1).** Het dossier geeft alleen de zeven belaste punten en
de hoogte. Het aantal en de plaats van de tussenknopen en de secundaire staven zijn uit de
modeltekening opgemeten en geijkt op de bekende belastingpunten (± 30 mm). Controle:
m + r = 65 + 3 = 68 = 2 × 34 knopen, dus statisch bepaald. Het effect van de asymmetrische
veldindeling is gemeten aan spiegelparen: < 0,5 %.

Gestuit op **B13**: de randen zijn IPE 330 met **liggend** lijf (buiging om de zwakke as in het
vakwerkvlak, I = Iz = 788 cm⁴), maar de profielentabel kent per profiel maar één
traagheidsmoment en heeft geen gedraaid profiel; de hoekprofielen ontbreken helemaal. In het
bestand staan de dichtstbijzijnde bibliotheekprofielen op oppervlak (IPE330, SHS150×150×16,
SHS150×150×10, SHS70×70×8); omdat het vakwerk statisch bepaald is verschuift dat de
staafkrachten maar 6 tot 20 kN (0,4 à 1,7 %).

Bestanden: `design-mockup/referentie/model-R18.mjs` · `R18.femp` · `toets-R18.mjs`.
`npx tsc --noEmit`: PASS.

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
| MEd = qd·l²/8 | 5,1 kN·m | 5,0625 kN·m | −0,74 % | gelijk (afronding bron) |
| VEd = qd·l/2 | 4,5 kN | 4,500 kN | 0,00 % | gelijk |
| Benodigd Werf | 345 · 10^-6 m³ | 342 773 mm³ | −0,65 % | gelijk (volgt uit MEd) |
| fm,d | 14,8 MPa | 14,769 MPa | −0,21 % | gelijk |
| fv,d | 2,46 MPa | 2,4615 MPa | +0,06 % | gelijk |
| VRd = (2/3)·kcr·b·h·fv,d | 10,9 kN | 10,885 kN (met kcr = 0,67) | −0,14 % | gelijk |
| winst,G | 3,6 mm | 3,647 mm | **+1,30 %** | gelijk (bron is hier zelf 1,4 % inconsistent) |
| winst,Q | 14,6 mm | 14,587 mm | −0,09 % | gelijk |
| winst totaal | 18,2 mm (≈ l/250) | 18,234 mm | +0,19 % | gelijk |
| wfin,G | 5,8 mm | 5,835 mm | +0,60 % | gelijk |
| wfin,Q | 17 mm | 17,213 mm | +1,25 % | gelijk |
| wfin totaal | 22,8 mm (≈ l/200) | 23,048 mm (ook uit de EN 1995-kern: 23,048) | +1,09 % | gelijk |

**Apart geregistreerd — wat de app met haar HUIDIGE automatische toetsinvoer zou melden.** Dit
is geen andere grootheidsdefinitie maar dezelfde grootheid met verkeerde invoer; het telt
daarom niet mee als vergelijking, maar het is wél wat een gebruiker te zien krijgt:

| Grootheid | Referentie | Met de app-default | Δ |
|---|---|---|---|
| VRd met de vast ingebouwde kcr = 1,0 | 10,9 kN | **16,246 kN** | **+49,05 %, onveilig** (**B3**) |
| wfin met w_qp gelijkgesteld aan w_karakteristiek | 22,8 mm | 29,175 mm | +27,96 % (**B8**) |
| Kiptoets 6.3.3 met de volle staaflengte | bron voert geen kiptoets uit (vloerplaat steunt zijdelings) | UC kip 1,73, UC_max 2,16 | onterecht afgekeurd (**B7**) |

Eigen controles (bron geeft ze niet): ΣFz = 9,000 kN = qd·l · ΣFx-reacties = 0 · M op beide
opleggingen = 0 · N = 0 · wfin via lastdelen identiek aan wfin via de quasi-blijvende
combinatie · Iy van de app = 39 930 000 mm⁴ = b·h³/12 = exact de 39,93 · 10⁻⁶ m⁴ uit dit
dossier.

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

**Conclusie.** `FOUT IN DE APP` — maar met een belangrijke nuance: **de rekenkant komt
volledig overeen**. Alle **12** referentiewaarden vallen binnen de tolerantie, grootste
afwijking **1,30 %**. Het geval is **tweemaal onafhankelijk uitgewerkt**; de tweede uitwerking
heeft alles met de vergeet-me-nietjes buiten de app om nagerekend en komt op **12/12** uit op
de app-waarde, niet op de bronwaarde.

**De bron rondt af, wij niet.** Die 1,30 % op winst,G is aantoonbaar afronding in de bron: zij
geeft 14,6/3,6 = 4,0556 terwijl de lastverhouding qk/gk exact 4,0000 is — de bron is daar zelf
1,4 % inconsistent (3,65 afgerond naar 3,6). Idem MEd = 5,1 waar qd·l²/8 = 5,0625 geeft; dat
maakt meteen het opgegeven Werf van 345·10³ mm³ verklaarbaar (5,1/14,8 = 344,6·10³; met de
onafgeronde waarden 342,8·10³). Vier waarden krijgen dus code `BRON` op afrondingsniveau.

**Waarom toch geen "komt overeen".** Open je `R19.femp` in de app en druk je op toetsen, dan
krijg je **niet** deze uitkomst. De automatische toetsinvoer
(`design-mockup/src/lib/timberCheckBuilder.ts`) legt drie keuzes vast waar geen invoerveld voor
bestaat. Dat is met de **echte** builder op het teruggelezen bestand gemeten (niet met een
reconstructie): `k_cr = 1` · `perform_ltb_check = true` · `ltb_segment_length_m = 0` ·
`deflection_quasi_perm_mm = deflection_inst_mm = −18,2343` · `deflection_permanent_mm = 0`.
Dezelfde staaf mét `lateralRestraints [0,25 0,5 0,75]`, `lateralRestraintsBottom` en
kniklengtes ingevuld levert **exact dezelfde toetsinvoer** op: er verandert niets. De invoer is
voor de gebruiker onbereikbaar.

1. ~~**k_cr = 1,0** (r. 257) — zie **B3**.~~ **INGETROKKEN — zie de correctie hieronder.**

   > **Correctie (3 september 2026): B3 is onjuist. k_cr = 1,0 is de Nederlandse normwaarde.**
   >
   > De oorspronkelijke conclusie luidde dat dit "geen andere nationale keuze" was, omdat
   > (6.13a) twee takken heeft en alle ondersteunde klassen bij de 0,67-tak horen. Dat is
   > precies verkeerd om. De Eurocode geeft 0,67 als **aanbevolen** waarde en vermeldt er
   > uitdrukkelijk bij dat de nationale keuze in de nationale bijlage staat.
   >
   > NEN-EN 1995-1-1:2005+A2:2014/NB:2013 maakt die keuze bij 6.1.7, letterlijk: *"De
   > volgende waarden moeten voor k_cr zijn toegepast: Voor liggers met een prismatische
   > doorsnede: k_cr = 1,0."* De waarde 0,8 staat daar alleen voor I- en T-profielen met een
   > lijf dunner dan de halve flensbreedte — vormen die deze toetsing niet kent, want zij
   > rekent uitsluitend met rechthoekige doorsneden.
   >
   > Waarom de campagne het mis had: beide houtgevallen gebruiken een ándere bijlage. R19
   > rekent met de aanbevolen 0,67 en R20 expliciet met de Duitse (0,71). De Nederlandse
   > implementatie is dus tegen buitenlandse keuzes gelegd en op grond daarvan afgekeurd.
   > Dat is dezelfde blinde vlek die dit dossier zelf benoemt — met dit verschil dat hij hier
   > niet tot een gemiste fout leidde, maar tot een verzonnen fout.
   >
   > Naar 0,67 gaan zou de dwarskrachtcapaciteit een derde lager maken dan de norm toestaat.
   > De code is daarom **niet** gewijzigd; wel is de vindplaats vastgelegd in
   > `nen-en-1995-1-1/src/shear.rs` en in `timberCheckBuilder.ts`, waar tot nu toe stond dat
   > de bijlagewaarde niet te raadplegen was.
2. **w_qp = w_karakteristiek** (r. 260) — zie **B8**. Richting veilig (+28 %), maar de reden is
   niet "het blijvende deel is onbekend": de standaardset bevat al een "SLS Quasi-permanent"
   G + 0,3Q die gewoon wordt doorgerekend. Het juiste getal ligt klaar en wordt niet gelezen.
3. **Kiptoets altijd aan met de volle staaflengte** (r. 252/258) — zie **B7**. Richting veilig
   (vals alarm). De formule zelf is correct: met de hand nagerekend geeft
   sigma_m,crit = 13,12 N/mm², lambda_rel,m = 1,353, k_crit = 0,5455, UC = 1,731 — exact wat de
   app afdrukt. De fout zit niet in de formule maar in het feit dat de zijdelingse steun niet te
   melden is.

**Expliciet NIET fout:** de solver (M, V, reacties 4,5/4,5 kN, ΣFz = 9,000 kN, N = 0), de
doorsnedeherkenning ("45x220" + C24 → E = 11 000 N/mm², I = 3,993 · 10⁷ mm⁴, géén terugval op
een default) en de EN 1995-1-1-kern zelf (met de invoer van de bron alle grootheden binnen
1,1 %). **De drie bevindingen zitten in de aanroeper, niet in de kern.**

Nationale bijlage: geen conflict. De app-kern gebruikt voor massief hout gamma_M = 1,30,
k_mod = 0,80 en k_def = 0,60 — precies de aanbevolen EN-waarden die de bron aanhoudt.

Bestanden: `design-mockup/referentie/R19.femp` · `toets-R19.mjs` (exitcode 0) ·
`src-tauri/crates/timber-check/tests/referentie_r19.rs` (nieuw: draait `check_timber_beam`
langs de productieroute; zonder cargo degradeert het mjs-script netjes naar "niet gemeten").
`cargo test -p timber-check -p nen-en-1995-1-1`: 52 tests groen.

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

Twee kolommen bij de doorbuigingen: uit het opgeslagen bestand (GL28h) en met de E en I die
de bron zelf noemt.

| Grootheid | Referentiewaarde | Onze waarde | Δ | Status |
|---|---|---|---|---|
| max Az,d = ½·qd·L | 112 kN | 112,050 kN | +0,045 % | gelijk (bron rondt qd 11,205 → 11,2 af) |
| max Vd = ½·qd·l | 78,4 kN | 78,435 kN | +0,045 % | gelijk |
| max veldmoment Map,d | +224 kN·m | +224,100 kN·m | +0,045 % | gelijk |
| Kragarmmoment MA,d | −50,4 kN·m | −50,4225 kN·m | −0,045 % | gelijk |
| sigma_c,90,d | 2,59 N/mm² → UC 2,59/(1,75·1,73) = 0,86 | 2,5937 N/mm² → UC 0,8567 | +0,145 % / −0,0033 absoluut | gelijk (handafleiding op onze snedekrachten; de toets zelf ontbreekt — **B9**) |
| tau_d | 1,52 N/mm² → UC 1,52/2,42 = 0,63 | 1,5230 N/mm² → UC 0,6294 | +0,201 % / −0,0006 absoluut | gelijk (met bef = 0,71·b) |
| Kip: sigma_m,crit | 65,6 N/mm² | 65,5875 N/mm² (handafleiding, (6.31) + factor 1,4) | −0,019 % | gelijk |
| Kip: lambda_rel,m / kcrit / kh | 0,65 / 1,0 / 1,0 | 0,6534 / 1,0 / 1,0 | +0,521 % / 0,000 / 0,000 | gelijk |
| sigma_m,y,d | 18,2 N/mm² → UC 18,2/19,4 = 0,94 | 18,1742 N/mm² → UC 0,9368 | −0,142 % / −0,0032 absoluut | gelijk (met de afgeronde Wy van de bron: 18,220, +0,11 %) |
| winst,G (zonder overhoogte) | 24,6 mm | 24,361 (bestand) / 24,570 (bronwaarden) | −0,97 % / −0,12 % | gelijk |
| winst,Q | 33,5 mm | 33,220 / 33,505 | −0,84 % / +0,01 % | gelijk |
| winst totaal | 58,1 mm > l/300 = 46,7 mm | 57,581 / 58,075; grens overschreden | −0,89 % / −0,04 % | gelijk (zelfde conclusie) |
| wfin = 24,6·(1+0,8) + 33,5·(1+0) | 77,8 mm > l/200 = 70 mm | 77,070 / 77,731; grens overschreden | −0,94 % / −0,09 % | gelijk (zelfde conclusie) |

Met overhoogte 40 mm vallen beide grenzen binnen de eis, net als in de bron.

**De EN 1995-kern langs de productieroute** (`check_timber_beam`), informatief met label `NB`
— de kern rekent NL/EC5-aanbevolen, de bron de Duitse NB: sigma_m,y,d 18,1742 en tau_d 1,5230
**identiek** aan onze handafleiding (de kern gebruikt onze snedekrachten dus correct);
f_m,y,d 20,16 tegen 19,4 (+3,92 %) en f_v,d 2,52 tegen 2,42 (+4,13 %) — uitsluitend gamma_M
1,25 tegen 1,30; UC buiging 0,9015 tegen 0,94 en UC dwarskracht 0,6044 tegen 0,63 volgen daar
rechtstreeks uit; sigma_m,crit 66,07 tegen 65,6 (+0,72 %, kern gebruikt de vereenvoudigde
(6.32)); lambda_rel,m 0,6510; k_crit 1,0; w_fin 77,07 (−0,94 %), UC w_fin (l/200) = 1,101 →
voldoet niet, **zelfde conclusie als de bron**.

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

**Conclusie.** `KOMT OVEREN` — grootste afwijking **0,971 %**. Het geval is statisch bepaald,
dus de snedekrachten zijn een zuivere toets op geometrie, lasten en eenheden, en die komen
exact uit: alle vier de snedekracht-/reactieregels wijken +0,045 % af, en dat is aantoonbaar de
afronding van qd in de bron zelf (1,35·3,30 + 1,5·4,50 = 11,205 kN/m, de bron schrijft 11,2).
Dertien onafhankelijke evenwichts- en consistentiecontroles kloppen tot op machineprecisie,
inclusief de controle dat de stationsgewijze zakking binnen een element exact gelijk is aan de
knoopzakking van een model met een echte knoop op die plaats.

**De 0,971 % komt niet uit de solver maar uit de materiaalbibliotheek.** GL28c bestaat niet in
de app, dus uitgeweken naar GL28h (E_0,mean 12 600 in plaats van 12 500 N/mm², +0,86 % op E·I).
Draai ik hetzelfde model met de E en I die de bron letterlijk noemt, dan zakt de grootste
afwijking op de zakkingen naar 0,12 %. Alles blijft binnen de 1 %, dus het oordeel is "komt
overeen" — maar de 0,97 % is **materiaaldata, geen mechanica**.

**De bron is nergens op een tegenstrijdigheid te betrappen.** Reacties, dwarskracht, momenten,
sigma_c,90, tau, sigma_m, sigma_m,crit, lambda_rel,m, winst en wfin zijn onderling consistent
en reproduceerbaar uit de opgegeven invoer. Ook het interne kip-recept klopt: (6.31) met de
Duitse factor 1,4 op E0,05·G05 en lef = l/3 = 4,667 m geeft 65,59 tegen de opgegeven 65,6.

**Drie bevindingen over de app** (gemeten, niet geschat; niets gerepareerd):

1. **GL28c ontbreekt** (**B13**), en erger dan alleen "ontbreekt": voer je "GL28c" in als
   materiaal, dan herkent `sectionResolver.ts` het niet als hout, zoekt "160x680" tevergeefs in
   de staaltabel en valt **stil terug op HEA 160 / S235** (alleen een `console.warn`). Voor een
   houten ligger levert dat een compleet verkeerde stijfheid zonder dat de gebruiker het ziet
   (**B1**).
2. **De v2-app kan de houttoetsing niet aanroepen** (**B12**): `checkStore.ts` invoket
   `check_timber_beams`, maar de `invoke_handler`-lijst in `design-mockup/src-tauri/src/lib.rs`
   bevat alleen greet, list_tenants, list_templates, get_brand, generate_pdf, save_pdf,
   engine_generate_pdf en engine_save_pdf. De onderliggende crate werkt wél — daarom is de
   toets langs de crate-testroute gedraaid.
3. **De automatische toetsinvoer klopt niet voor dit geval.** Gemeten met de echte kern:
   k_cr hard op 1,0 → tau_d 1,081 in plaats van 1,523 N/mm², UC 0,429 in plaats van 0,63, dus
   **29 % te laag en daarmee onveilig** (**B3**) · geen veld voor de kipsteunafstand van een
   houten staaf → lef = 0,9 · 14 m = 12 600 in plaats van 4 667 mm → sigma_m,crit 24,47 in
   plaats van 66,07 N/mm² en UC kip 1,190 in plaats van ca. 0,90, dus onterecht "voldoet niet"
   (**B7**) · w_quasi_perm = w_inst → wfin 103,6 in plaats van 77,1 mm (**B8**) · UC_max zou
   2,221 zijn met "deflection_w_add" als maatgevende toets, terwijl de bron op UC 0,94 (buiging)
   uitkomt · de orchestrator kent **helemaal geen oplegdruktoets f_c,90** terwijl de bron die wel
   toetst (**B9**) · de doorbuigingstoets kan de twee Duitse grenzen niet naast elkaar zetten
   (**B12**, laatste rij).

Bestanden: `design-mockup/referentie/R20.femp` · `toets-R20.mjs` (exit 0, "KOMT OVEREN") ·
`src-tauri/crates/timber-check/tests/referentie_r20.rs` (nieuw; bevat een assert die aanslaat
zodra de f_c,90-toets er komt). `npx tsc --noEmit`: exit 0.

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
| Vz bij steunpunt 1 (x = 0) | 5,22 kN | 5,203 kN | −0,32 % | gelijk |
| Vz links van steunpunt 2 (x = 1 100) | −7,79 kN | −7,805 kN | −0,19 % | gelijk |
| Vz rechts van steunpunt 2 | +7,75 kN | +6,504 kN | **−16,08 %** | **afwijking: BRON** — etiketfout, de rij hoort bij steunpunt 3 (zie conclusie) |
| My bij steunpunt 2 | −1,42 kN·m | −1,431 kN·m | −0,77 % | gelijk |
| My bij steunpunt 3 | −1,41 kN·m | −1,431 kN·m | −1,48 % | afwijking: BRON (presentatie-/afrondingsniveau, Δ = 0,02 kN·m) |
| My in het veld bij x = 440 mm | +1,15 kN·m | +1,145 kN·m | −0,46 % | gelijk |
| Samenvatting: MEd / VEd / REd / w | 1,42 kN·m / 7,79 kN / 14,30 kN / 0,2 mm | 1,431 / 7,805 / 14,309 / 0,176 mm | 0,77 / 0,19 / 0,06 % / Δ 0,024 mm | gelijk (w rondt af op 0,2) |
| BGT-oplegreacties "links" | 3,48 / 9,56 / 9,52 / 3,40 kN (Rx = 0, My = 0) | 3,477 / 9,561 / 9,561 / 3,477; Rx en My exact 0 | −0,09 / +0,01 / +0,44 / **+2,26 %** | R4 `afwijking: AANNAME` (volle-lengte-last maakt het model exact symmetrisch; met de getekende deellast 3,41 kN, Δ 0,29 %) |
| BGT-oplegreacties "midden" | 3,45 / 9,55 / 9,55 / 3,45 kN | 3,477 / 9,561 / 9,561 / 3,477 | +0,78 / +0,12 / +0,12 / +0,78 % | gelijk |
| BGT: uz bij x = 550 mm | −0,2 mm | −0,1735 mm | Δ 0,027 mm | gelijk (bron geeft 1 decimaal) |
| BGT: hoekverdraaiing fiy bij x = 0 / x = 3 300 | +0,6 / −0,6 mrad | +0,582 / −0,582 mrad | Δ 0,018 mrad | gelijk (tekenconventie omgeklapt, zie aannames) |
| Toets oplegdruk | sigma_c,90,d = 14,30·10³/(59·140) = 1,73 ≤ 1,5 × 1,73 = 2,60 N/mm² | 1,732 ≤ 2,596 N/mm²; UC 0,667 tegen 0,665 | +0,13 % / −0,15 % | gelijk (handafleiding op onze snedekrachten) |
| Toets dwarskracht | VEd 7,79 < VRd 16,5 kN | VEd 7,805 < 16,5 | +0,19 % | VEd gelijk; VRd zelf niet vergeleken (leverancierswaarde, zie conclusie) |
| Toets moment | MEd 1,42 < MRd 7,5 kN·m | MEd 1,431 < 7,5 | +0,77 % | MEd gelijk; MRd-bronconsistentie: Wel,y·fm,d = 7,43 kN·m (−1,0 %) |
| Toets doorbuiging | w 0,2 < wmax = 1 100/400 = 2,75 mm | 0,176 < 2,75 mm | — | gelijk |
| BGT-last | 7,90 kN/m | 7,902 kN/m | +0,03 % | gelijk |

Variant met de getekende deellasten (werkvlak 3,0 m), apart opgeslagen als
`R21-werkvlak.femp`: reacties "links" 3,48 / 9,57 / 9,54 / 3,41 (max Δ 0,29 %), "midden"
3,44 / 9,56 / 9,56 / 3,44 (max Δ 0,30 %); Vz rechts van steunpunt **3** = 7,784 kN tegen de
"+7,75" van de bron (0,44 %).

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

**Conclusie.** `VERSCHIL DOOR DE BRON` — **27 van de 30** vergelijkingen liggen binnen de
signaalgrens van 1 %. Drie rijen erbuiten, geen daarvan wijst naar de app.

1. **"Vz rechts van steunpunt 2 = +7,75 kN" is een etiketfout in de bron** (16,08 %). Voor een
   gelijkmatig belaste drieveldsligger met gelijke velden is de dwarskracht rechts van het
   eerste tussensteunpunt exact 0,50·qL = 6,50 kN; +7,75 kN is 0,60·qL en komt in de hele
   dwarskrachtenlijn maar op twee plaatsen voor: links van steunpunt 2 (dat is de rij ernaast,
   −7,79 kN) en **rechts van steunpunt 3** (variantmodel: +7,784 kN, 0,44 % van 7,75). Geen
   enkele belastingschikking van deze constructie kan +7,75 kN rechts van steunpunt 2 opleveren:
   eigen gewicht en betonmassa liggen altijd over de volle lengte en het werkvlak varieert maar
   tussen 0,26 en 0,53 kN/m op bijna 12 kN/m totaal. **De rij hoort bij steunpunt 3.**
2. **"My bij steunpunt 3 = −1,41 kN·m"** (1,48 %, absoluut 0,02 kN·m). Uit de
   consistentiecontrole op de bron zelf (§4f van het script, uitsluitend brongetallen): de
   UGT-set van de bron is onderling consistent rond V(0) = 5,22 kN, maar die 5,22 ligt 0,28 %
   **boven** de exacte 0,4·q·L = 5,205 kN bij haar eigen q = 11,83 kN/m, en beide
   steunpuntsmomenten liggen daardoor ~0,8–1,5 % **onder** 0,1·q·L². De BGT-reacties van de
   bron liggen wél exact op 0,4·qL en 1,1·qL. Presentatie-/afrondingsniveau.
3. **"BGT-reactie R4 links = 3,40 kN"** (2,26 %) is `AANNAME`. Dit dossier schrijft voor met een
   gelijkmatig verdeelde last over de volle lengte te rekenen; daarmee is het model exact
   symmetrisch en zijn "links" en "midden" niet te onderscheiden. Met de getekende deellast
   geeft dezelfde app R4 = 3,41 tegen 3,40 kN (0,29 %), en reproduceert ze ook de asymmetrie in
   M en V qua richting en orde van grootte. De aanname verklaart het verschil volledig.

**Onafhankelijke derde partij.** De driemomentenvergelijking (Clapeyron, gesloten formule, geen
app-code, met exacte 3-punts Gauss-kwadratuur per deelinterval) geeft in **elk** gecontroleerd
punt dezelfde waarde als de solver, tot 1,4 · 10⁻¹⁴. De analytische kromme van het eindveld
(w(x) en theta(0)) valt eveneens exact samen met de 21 stations van de app. Evenwicht sluit voor
alle 10 doorgerekende combinaties tot machineprecisie. **Geen aanwijzing voor een fout in de
app.**

**Niet vergeleken:** VRd = 16,5 kN (leverancierswaarde voor een samengesteld H-profiel met dun
lijf — met een volle rechthoek als substituut niet na te rekenen) en de EN 1995-toetsing zelf
(**B12**). Wat wel is gedaan: de UC's zijn nagerekend met **onze** snedekrachten en de
weerstanden van de bron, en `buildTimberCheckInputs` laat zien dat de app de juiste
MEd/VEd/w aan de kern aanbiedt.

**Dit is het enige geval in de campagne dat de volledige NL-keten gebruikt** (NEN-EN 1990/NB
6.10a/6.10b, CC2, KFI = 1,0; NEN-EN 1995-1-1 met gamma_M = 1,3 en kmod = 0,90). Zie
hoofdstuk C.1 over het ontbreken van een NL-referentie bij **staal**.

Gestuit op **B1**: de doorsnede van de bron is een samengesteld H-profiel van een leverancier.
Opgelost met een volle rechthoek in C24 die tegelijk EI **en** Wel,y reproduceert (b = 79,53,
h = 183,64 mm; EI 0,019 %, Wel,y 0,017 %). De dwarskrachtweerstand is met dit substituut
principieel niet vergelijkbaar (volle rechthoek Av = ⅔·b·h tegen een dun H-lijf).

Bestanden: `design-mockup/referentie/R21.femp` · `R21-werkvlak.femp` · `toets-R21.mjs` (rekent
vanaf het **teruggelezen** bestand, dus het opgeslagen model is meegecontroleerd; exit 0).

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
| Gording | max A | 2,29 kN | 2,2857 kN | −0,19 % | gelijk |
| Gording | max VB,links | −3,81 kN | −3,8095 kN | +0,01 % | gelijk |
| Gording | min MB | −2,67 kN·m | −2,6667 kN·m | +0,13 % | gelijk |
| Gording | Benodigde oppervlakte oplegging A / B | 24,8 / 31,8 cm² (B maatgevend) | 24,77 / 31,76 cm² | −0,11 / −0,13 % | gelijk (afschuiftoets met factor 1,3 op fv,d bij B; zie conclusie) |
| Gording | Benodigd W / I | 160,7 cm³ / 740, 669, 592 cm⁴ (drie doorbuigingseisen) | 160,57 cm³ / 739,96, 668,70, 591,97 cm⁴ | −0,08 / −0,01 / −0,04 / −0,01 % | gelijk |
| Hoofdligger (gk) | Ak / Bk / VB,links / MB / Mveld | 6,30 / 12,60 kN / −7,88 kN / −3,54 / +6,30 kN·m | 6,3000 / 12,6000 / −7,8750 / −3,5437 / 6,3000 | 0,00 / 0,00 / +0,06 / −0,11 / 0,00 % | gelijk (sluitende geometriecontrole) |
| Hoofdligger (sk) | Ak / Bk / VB,links / MB / Mveld | 7,86 / 15,72 kN / −9,83 kN / −4,42 / +7,86 kN·m | 7,8600 / 15,7200 / −9,8250 / −4,4213 / 7,8600 | 0,00 / 0,00 / +0,05 / −0,03 / 0,00 % | gelijk |
| Hoofdligger | max Vd / max Md | 25,38 kN / 20,30 kN·m | 25,3688 / 20,2950 | −0,04 / −0,03 % | gelijk |
| Hoofdligger | tau_d | 1,85 < 2,42 N/mm² (eta = 0,76) | 1,8505 < 2,4220 (eta 0,7641) | +0,03 / +0,08 / +0,53 % | gelijk |
| Hoofdligger | sigma_m,d | 17,62 < 1,10 × 19,38 N/mm² (eta = 0,83) | 17,6172 < 19,3760 (eta 0,8296) | −0,02 / −0,02 / −0,05 % | gelijk |
| Hoofdligger | kw / kDLT | 3,065 / 0,734 | 3,0654 / 0,7333 (en gemeten uit onze zakking: 0,7333) | +0,01 / −0,09 % | gelijk |
| Hoofdligger | w*inst | 15,9 mm tegen grens 4 500/300 = 15 mm (**niet voldaan**) | 15,9155 mm; grens overschreden | +0,10 % | gelijk (zelfde conclusie) |
| Hoofdligger | wfin | 21,6 < 22,5 mm | 21,5803 mm | −0,09 % | gelijk |
| Hoofdligger | wnet,fin | 12,7 < 15 mm | 12,7459 mm | +0,36 % | gelijk |
| Oplegging A | Aef / Ad / sigma | 180 cm² / 20,30 kN / 1,13 < 3,27 N/mm² (eta = 0,35) | 180,00 cm² / 20,2950 kN / 1,1275 < 3,2697 (eta 0,3448) | 0,00 / −0,03 / −0,22 / −0,01 / **−1,48 %** | gelijk (Δ eta = 0,005 absoluut) |
| Kolom 1 | Nd / lambda_ef / kc / sigma_c | 20,30 kN / 80,7 / 0,440 / 1,41 < 4,94 N/mm² (eta = 0,28) | 20,2950 / 80,829 / 0,4420 / 1,4094 < 4,9940 (eta 0,2822) | −0,03 / +0,16 / +0,46 / −0,04 / +1,09 / +0,79 % | gelijk (handafleiding EN 1995 §6.3.2) |
| Kolom 2 | Nd / per deel / lambda_ef / kc / sigma_c | 40,59 kN / 20,30 kN / 121,1 / 0,212 / 1,59 < 2,40 N/mm² (eta = 0,66) | 40,5900 / 20,2950 / 121,244 / 0,2140 / 1,5855 < 2,4175 (eta 0,6559) | 0,00 / −0,03 / +0,12 / +0,93 / −0,28 / +0,73 / −0,63 % | gelijk |
| Aansluiting B | Fd / weerstand | 40,59 / 42,4 kN (eta = 0,96) | Fd 40,5900 kN | 0,00 % | Fd gelijk; de weerstand 42,4 kN is een verbindingstoets, buiten bereik |

Eigen controles (bron geeft ze niet, alle exact): ΣV gording = qd·L · ΣV hoofdligger = qd·L ·
ΣH = 0 · M aan het kraagarmeinde = 0 · M in oplegging A = 0 · Bd·l = qd·L²/2 · een grof model
zonder hulpknopen geeft tot 9 decimalen dezelfde Ak (14,160000000 kN) en dezelfde w(l/2)
(−15,915461949 mm).

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

**Conclusie.** `KOMT OVEREN` — alle **55** vergeleken grootheden ruim binnen de 5 %-tolerantie
van dit geval. Gesplitst: op de zuivere **solver**grootheden (reacties, dwarskrachten,
momenten, zakkingen) is de grootste afwijking **0,36 %**; op de handtoetsen die op onze
snedekrachten zijn uitgevoerd **1,48 %**, en dat is een unity check (0,3448 tegen 0,35, dus
0,005 absoluut tegen de norm van 0,02). **Twintig grootheden komen tot op de laatste opgegeven
decimaal exact uit.**

**De sluitende geometriecontrole die dit dossier vraagt slaagt:** met de teruggerekende
kraagarm van 1,50 m komen Ak = 6,300 en Bk = 12,600 kN er exact uit (0,000 %). De kraagarm is
niet gegokt maar afgeleid: g·(l+c) = Ak + Bk = 18,90 kN bij gk = 3,15 kN/m geeft l + c = 6,00 m,
dus c = 1,50 m — bevestigd door de figuurmaat lk = 1,5 m.

**Drie dingen die dit dossier openliet, zijn in het brondocument zelf nagekeken.** Geen enkele
referentiewaarde is daarbij gewijzigd; alleen is uitgezocht welke rekenregel de bron toepast.
1. De figuur benoemt lf = 4,5 m en lk = 1,5 m — onafhankelijke bevestiging van de kraagarm.
2. De regel "benodigde oppervlakte oplegging A / B" is **geen** oplegdruktoets maar een
   **afschuiftoets** erf A = 1,5·V/(kcr·fv,d), en bij steunpunt B verhoogt de bron fv,d met een
   factor 1,3 omdat die plaats meer dan 1,50 m van het kopse hout ligt (Duitse NB, alleen voor
   massief hout; bij het gelijmde hout van de hoofdligger past de bron hem expliciet niet toe).
   Met dezelfde fv,d als bij A kwam de eerste poging op 41,3 cm² (+30 %); met de juiste regel op
   31,76 cm² (−0,13 %). Dit was dus een **ontbrekende toetsregel in dit dossier**, geen bronfout
   en geen appfout — de onderliggende dwarskracht VB klopte al op 0,01 %.
3. De twee factoren van de bron zijn kw = 5l⁴/(384EI) en kDLT = 1 + 0,6(M_li+M_re)/M₀. Beide
   worden gereproduceerd (+0,01 % en −0,09 %), en de rechtstreeks uit onze zakking **gemeten**
   verhouding winst/(kw·q) geeft dezelfde 0,7333 — bewijs dat onze zakking op dezelfde plaats en
   met dezelfde definitie zit als die van de bron.

**Geen fout in de app gevonden.** Wel drie beperkingen die geen rekenafwijking veroorzaken:
(a) **GL28c ontbreekt** (**B13**); voor dit geval onschadelijk omdat GL28h dezelfde E_0,mean =
12 600 N/mm² heeft en alleen E de FEM stuurt, maar voor de sterktetoets zijn de klassen niet
uitwisselbaar. Dat de bron met 12 600 rekent is verifieerbaar: met 12 500 zou winst 16,04 in
plaats van 15,9 mm zijn. (b) **De EN 1995-toetsmodule is niet vanuit een script bereikbaar**
(**B12**): de meegeleverde sidecar biedt uitsluitend `check_steel_beam`. De houttoetsen in het
script zijn daarom handafleidingen op **onze** snedekrachten met de rekensterkten van de bron,
expliciet als soort "hand" gemarkeerd en niet als app-uitvoer gepresenteerd. (c)
**`BeamCheckConfig.deflectionClass` kent per klasse maar één noemer L/n** terwijl de Duitse NB
winst op l/300 en wfin op l/200 toetst (**B12**).

Kolom 1 en 2 zitten niet in het rekenmodel (dit dossier staat dat toe); hun enige koppeling met
de krachtsverdeling is Nd = de oplegreactie van de hoofdligger, en die komt wél uit ons model.

Bestanden: `design-mockup/referentie/R22.femp` · `toets-R22.mjs` (exitcode 0).
`npx tsc --noEmit`: schoon.

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
| 1 | Horizontale reactie in e | 89,166667 kN | 89,166667 kN | 0,000 % | gelijk |
| 1 | Buigend moment in a | 40 kN·m | 40,000000 kN·m | 0,000 % | gelijk |
| 1 | Buigend moment in d | 55 kN·m | 55,000000 kN·m | 0,000 % | gelijk |
| 1 | Buigend moment in f | 15 kN·m | 15,000000 kN·m | 0,000 % | gelijk |
| 1 | Buigend moment op halve hoogte b–d (punt c) | 85 kN·m (= 67,5 + 45 − 55/2) | 85,000000 kN·m | 0,000 % | gelijk |
| 1 | Verticale zakking van punt g | 0,019618056 m | 0,019620081 m | +0,010 % (met A × 1000: 0,0000 %) | gelijk |
| 2 | Verdraaiing van punt c door de verwarming | −0,00032 rad | via `R23.femp` (hout, alpha = 5,0 · 10⁻⁶/K): 0,000133333 rad | **−58,333 %** | **afwijking: AANNAME** — alpha_T niet vrij instelbaar (zie conclusie) |
| 2 | idem, via `R23-hybride.femp` (a–b in S235, alpha = 1,2 · 10⁻⁵/K) | −0,00032 rad | 0,000320000 rad | 0,000 % op grootte | gelijk |
| 2 | idem, alpha = 1,2 · 10⁻⁵ rechtstreeks aan `solve()` | −0,00032 rad | 0,000320000 rad | 0,000 % op grootte | gelijk |

Alle zeven waarden in **één** bestand (`R23-hybride.femp`): grootste afwijking 0,097 %.

Aanvullende controles die de bron niet publiceert: M in de ligger én in de kolom bij het
scharnier b = 7 · 10⁻¹⁵ resp. 1 · 10⁻¹⁴ kN·m (= 0) · M in g (vrij uiteinde) = 5 · 10⁻¹⁴ ·
M-continuïteit in c/d/f exact aan beide zijden gelijk · verticale reactie én momentreactie in e
exact 0 (bevestigt aanname 3) · N in pendelstaaf e–d = +89,166667 kN trek, in BG2 10⁻¹² kN
(statisch bepaald ⇒ krachtloos) · reactie a fx = −50,833333, fz = +10,000000 kN,
my = +40,000000 kN·m · evenwicht ΣFx = 1,3 · 10⁻¹¹, ΣFz = −6,7 · 10⁻¹², ΣM(a) = −1,3 · 10⁻¹⁰ ·
BG2 ux(b) = 1,920000 mm = alpha·ΔT·L **exact**.

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

**Conclusie.** `VERSCHIL DOOR EEN AANNAME` — zes van de zeven waarden komen uit `R23.femp`
binnen **0,010 %**; alle zeven komen uit `R23-hybride.femp` binnen **0,097 %**. **Geen fout in
de solver:** de thermische kern honoreert een opgegeven alpha exact (ux(b) = 1,920000 mm,
ry(c) = 3,200000 · 10⁻⁴ rad, N in de pendel 10⁻¹² kN).

**De bron is eerst onafhankelijk nagerekend voordat de solver werd aangeroepen.** Het systeem is
statisch bepaald (3 reacties in a + 1 pendelkracht tegen 3 evenwichtsvergelijkingen + de
scharniervoorwaarde in b), dus M, V, N en de reacties volgen zonder enige stijfheid:
6S = 10·1,5 + 20·8 + 15·6²/2 + 30·3 = 535 → S = 89,166667 kN; M_a = 40; M_f = 15; M_d = 55;
M_c = 85 kN·m. De zakking van g is met de arbeidsvergelijking uitgerekend (M- en M̄-verlopen
in gesloten vorm, exact geïntegreerd én numeriek nagerekend): buigdeel 0,015902778 m plus
pendeldeel 0,003715278 m = **0,019618056 m — tot op de laatste cijfer de gepubliceerde waarde**.
De verdraaiing van c volgt uit zuivere kinematica: a–b rekt alpha·ΔT·L = 1,92 mm uit, d wordt
door de krachtloze pendel vastgehouden, dus de kolom draait 1,92/6 000 = 3,2 · 10⁻⁴ rad.
**R23 bevat geen zetfout of interne tegenstrijdigheid.**

**Tekortkoming in de modelinvoer (geen rekenfout, wel melden).** De uitzettingscoëfficiënt is
niet vrij instelbaar: `design-mockup/src/lib/thermalAlpha.ts` leidt hem af uit het
staafmateriaal (hout 5,0 · 10⁻⁶/K, al het overige 1,2 · 10⁻⁵/K). Tegelijk kan EI alleen vrij
worden gekozen via een rechthoekprofiel, en `sectionResolver.ts` kent rechthoeken uitsluitend
bij **hout**materialen; staal krijgt A en I uit de profieldatabase (**B1**). De combinatie die
R23 vraagt — EI = 12 000 kN·m² **exact** én alpha = 1,2 · 10⁻⁵ — is daardoor niet uitdrukbaar.
Het bestand dat dit dossier letterlijk volgt (`R23.femp`) rekent BG2 dus met alpha =
5,0 · 10⁻⁶ en komt **58,333 % te laag** uit — precies de factor 5/12. De workaround die wél
binnen de app past staat in `R23-hybride.femp`: alleen de verwarmde staaf a–b krijgt S235 /
HEB 200 (EI 11 970 tegen 12 000 kN·m², 0,25 % laag); omdat het systeem statisch bepaald is
blijven alle momenten en reacties exact en kost het alleen 0,097 % op w_g.
**Backlog: alpha per staaf vrij instelbaar maken, of een doorsnedetype "vrije EI/EA" toevoegen
— dat lost dit geval én R24 in één keer op.**

**Tweede constatering, geen fout.** Een **scharnier**oplegging in e maakt het stelsel singulier
(`Matrix is singular or nearly singular at column 20`). Dat is mechanisch correct — knoop e
draagt alleen de aan beide zijden gescharnierde pendel, dus de rotatie-DOF heeft nul stijfheid
— en de solver meldt het netjes in plaats van stil door te rekenen. Een inklemming in e parkeert
die lege DOF; dat het mechanisch identiek is, is geverifieerd: de verticale reactie en de
momentreactie in e zijn **exact nul**. Vergelijk **B5**.

Tekenafspraak: de bron publiceert −0,00032 rad, onze solver +0,00032 rad (ry linksom-positief
bij z omhoog; de bron rekent met z omlaag). Vergeleken op absolute waarde; onze tekens staan
apart in de uitvoer.

Bestanden: `design-mockup/referentie/R23.femp` (voorgeschreven stijfheden, BG1) ·
`R23-hybride.femp` (alle zeven waarden in één bestand) · `toets-R23.mjs` (exitcode 0) ·
`probe-R23.mjs` (bewijs voor de singulariteit bij een scharnier in e).

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
| Trekkracht in staaf C–E | 584 584,0 N | analytisch | 585 695,967 N | +0,190 % | afwijking: AANNAME (geen dwarskrachtvervorming) |
| Buigend moment in H (midden) | 49 249,5 N·m | analytisch | 48 582,420 N·m | −1,354 % | afwijking: AANNAME (idem; afgeleid gevolg, zie conclusie) |
| Verticale verplaatsing van knoop D | −0,000 542 8 m | **gemiddelde van rekenprogramma-uitkomsten** | −0,000 564 527 m | **−4,003 %** | afwijking: AANNAME (binnen de 5 % voor deze rij) |

**Contra-berekening met een eigen, los geprogrammeerde raamwerkmatrix** (in het toetsscript,
§3), twee keer gedraaid:

| Variant | Trekstang C–E | M in H | u_z(D) |
|---|---|---|---|
| **Zonder** afschuiving (Bernoulli — wat de app doet) | 585 695,967 N | 48 582,420 N·m | −5,645268 · 10⁻⁴ m |
| **Met** afschuiving (Timoshenko, SRY = 2,5 zoals de bron) | 584 584,116 N (+0,00002 %) | 49 249,530 N·m (+0,00006 %) | −5,428265 · 10⁻⁴ m (−0,005 %) |

De eerste rij is tot op 10⁻⁹ relatief **gelijk aan de app**; de tweede reproduceert **alle drie
de referentiewaarden**. Identiek via het opgeslagen `R24.femp` (grootste relatieve verschil met
het exacte model 6,7 · 10⁻⁷).

Overige, door de bron niet gegeven grootheden (app): R_A,z = R_B,z = 200,000 kN ·
N(A–C) = N(E–B) = 611 484,5 N trek · N(C–D) = N(E–F) = −175 708,8 N druk · ligger
N = −585 696,0 N druk · u_z(H) = −1,962685 · 10⁻³ m.

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

**Conclusie.** `VERSCHIL DOOR EEN AANNAME` — het verschil met de bron is **volledig en
kwantitatief de ontbrekende dwarskrachtvervorming** (**B10**). Bewijs in twee richtingen:
(a) de onafhankelijk geprogrammeerde raamwerkmatrix reproduceert **mét** afschuiving alle drie
de referentiewaarden tot op 0,005 %, dus de bron is intern exact en er zit geen fout in;
(b) diezelfde matrix **zonder** afschuiving reproduceert onze app tot op 10⁻⁹ relatief, dus de
solver rekent het model dat zij kent foutloos. **Er blijft geen ruimte over voor een fout in de
app.**

**Waarom de percentages ondanks een kleine oorzaak fors ogen.** M_H is een klein verschil van
twee grote getallen: M_H = q·L²/8 − N·h = 400 000 − 0,6·N. Een afwijking van 1 112 N (0,19 %) in
de trekstang verschuift M_H met 667 N·m = 1,35 %. De zakking van D wordt door de voorspanning
bijna volledig weggedrukt; 4,0 % is in absolute zin 2,2 · 10⁻⁵ m. **De app is dus nergens 4 %
"fout" — de gevoeligheid zit in de grootheden zelf.**

Toleranties: de trekstangkracht (0,19 %) blijft binnen de 1 % voor een bundelreferentie; u_z(D)
(4,0 %) binnen de 5 % die dit dossier zelf voor die grootheid voorschrijft; alleen M_H (1,35 %)
valt buiten de 1 % — en dat is het afgeleide gevolg van diezelfde 0,19 %.

**Correctie op een aanname in dit dossier.** Hierboven wordt u_z(D) gedegradeerd tot "gemiddelde
van rekenprogramma-uitkomsten, zwakker dan de twee analytische waarden". De exacte
Timoshenko-berekening geeft −5,428265 · 10⁻⁴ m tegen de opgegeven −5,4280 · 10⁻⁴ m, een verschil
van **0,005 %**. Die waarde is dus wél analytisch reproduceerbaar en verdient dezelfde status
als de andere twee; de ruimere 5 %-tolerantie is niet nodig.

**Bevestiging van de R11-blokkade (B5), geen nieuwe fout.** Zet je op alle onderspanningsstaven
aan beide einden een buigscharnier — de letterlijke modellering van een vakwerk — dan meldt het
raamwerkpad `Matrix is singular or nearly singular at column 17` (de rotatie-DOF van knoop C).
Het plaatpad van dezelfde kern klemt zulke DOF's automatisch in en gaat wel door. Dat is een
gebruiksblokkade voor onderspannen liggers en vakwerken.

De omweg (per knoop precies één momentvast staafeind) is gecontroleerd: grootste |M| op alle
onderspanningsstaafeinden is 8,5 · 10⁻²⁰ relatief, en N(C–E) verandert niet als de I van de
onderspanning over vier decaden (10⁴ tot 10⁸ mm⁴) wordt gevarieerd (Δ < 4 · 10⁻¹⁴ %).

De voorspanning is via **alpha per staaf** ingevoerd, niet via het alternatief "opgelegde
verkorting −6,52 · 10⁻³ m" dat de bron ook noemt. Gestuit op **B1**: het projectbestand kan de
fictieve doorsneden niet dragen; opgelost met één houtklasse (GL36h) en per staaf b en h zo dat
E'·A' = E·A en E'·I' = E·I. De ΔT is meegeschaald naar −326 K omdat de app voor hout met
alpha = 5,0 · 10⁻⁶/K rekent, zodat de opgelegde rek alpha·ΔT = −1,63 · 10⁻³ gelijk blijft — een
tweede symptoom van het gat dat R23 aanwijst.

Bestanden: `design-mockup/referentie/R24.femp` · `toets-R24.mjs` (exit 0).
`npx tsc --noEmit`: PASS.

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
| Doorbuiging in B (veerknoop) | −0,010 m | −0,010 000 000 000 m | −1,6 · 10^-12 % | gelijk |
| Reactiekracht in de veer | 21 000 N | 21 000,000 000 N | +1,6 · 10^-12 % | gelijk |

Zelfde twee grootheden via het **opgeslagen** `R25.femp` (route `deserializeProject` →
`bouwMultiInput` → `liftSpringK` → `solveAllCases`, dus inclusief de eenheidsketen
2,1 kN/mm → 2 100 N/mm → 2,1 · 10⁶ N/m): w_B = −9,999 999 982 · 10⁻³ m (Δ +1,85 · 10⁻⁷ %),
R_veer = 20 999,999 961 N (Δ −1,85 · 10⁻⁷ %). Dat restje komt uitsluitend van het afronden van
de surrogaat-profielmaten op zes decimalen.

Eigen handafleiding uit de invoer (krachtenmethode, veerkracht als onbekende): R = 21 000,000 N
en w_B = −0,010 000 m — 0,000 % verschil met de referentie; **de bron is dus intern
consistent**. Grootheden die de bron niet geeft, tegen eigen statica gelegd (alle exact):
R_A = R_C = 31 500 N · ΣF_z = 0 (rest 2,3 · 10⁻¹⁰ N) · ΣF_x = 0 · N = 0 · V bij A = 31 500 N ·
M onder de last = 94 500 N·m · M in B = **+63 000 N·m** (een *veld*moment — de veer is zo slap
dat er in het midden geen steunpuntmoment ontstaat) · w links = w rechts exact.

**Grenswaardecontroles op de veer:** k → ∞ geeft R = 57 749,899 N tegen de analytische
tweeveldswaarde 57 750 N (−0,0002 %); k → 0 geeft w_B = −1,571 428 · 10⁻² m tegen de
analytische −1,571 429 · 10⁻² m (+0,0001 %). Netverfijning 4/8/20/80 elementen: ongewijzigd tot
in het laatste cijfer.

**Nationale bijlage.** N.v.t.

**Aannames en aandachtspunten.**
- Verificatie met de gesloten formule (twee symmetrische puntlasten plus veerverenigbaarheid)
  reproduceert 21 000 N en 0,010 00 m exact; de referentie is dus betrouwbaar.
- Goede test op de veeroplegging in de app: veerstijfheid exact 2,1 · 10^6 N/m.
- Geen profiel of staalsoort in de bron — alleen E, I en A, wat voor krachtsverdeling
  volstaat.

**Ontbreekt in de bron.** Momenten- en dwarskrachtenlijn; oplegreacties in A en C.

**Conclusie.** `KOMT OVEREN` — beide referentiewaarden tot op machineprecisie
(**1,6 · 10⁻¹² %**). Er is niets uit te zoeken: geen afwijking boven 2 %, geen aanwijzing voor
een fout in de bron en geen aanwijzing voor een fout in de app.

**Wat dit geval waardevol maakt** is dat het de veeroplegging echt uitknijpt. De referentie
(21 000 N) ligt precies tussen de twee analytische grenzen in: zonder middensteunpunt 0 N, met
een star middensteunpunt 57 750 N. Een genegeerde veer, een verkeerde vrijheidsgraad of een
factor 1 000 in de eenheidsconversie zou hier tientallen procenten schelen. De veerstijfheid is
over **zes decaden** gevarieerd (k/1000 t/m k·10⁶): de uitkomst loopt netjes van de losse
ligger naar de starre tweeveldsligger, met **beide grenzen tot op 0,0002 % goed**.

Ook de volledige app-route is getoetst, niet alleen de solver-API: het weggeschreven bestand is
teruggelezen en via dezelfde mapping als de app doorgerekend. De veer gaat als 2,1 kN/mm het
bestand in en komt als 2 100 N/mm de solver in — **de conversieketen klopt**. De veerreactie
zelf wordt in de adapter niet door de kern geleverd (een veer-vrijheidsgraad blijft vrij en
meldt daar 0) maar aangevuld als R = −k·u; dat pad geeft exact de juiste waarde en is met de
handafleiding onafhankelijk bevestigd.

De bron geeft geen momenten-/dwarskrachtenlijn en geen reacties in A en C. Die zijn tegen de
eigen statica gelegd (R_A = R_C = 31 500 N, M onder de last 94,5 kN·m, M in B +63 kN·m sagging)
— alles exact, dus ook de krachtsverdeling achter de twee gepubliceerde getallen is in orde.

Gestuit op **B1**: de fictieve doorsnede (A = 1,0 · 10⁻² m², I = 6,3 · 10⁻⁴ m⁴,
E = 2,1 · 10¹¹ Pa) komt in geen catalogus voor; het dichtstbijzijnde stalen profiel (HEA 450)
wijkt 1,1 % in I af — juist op de grootheid waar dit geval om draait. Opgelost met de
rechthoekroute voor hout, waarbij b en h zó zijn opgelost dat E·A **én** E·I allebei exact die
van de bron zijn (GL36h 164,301324 × 869,482605 mm; 3 · 10⁻⁷ % door decimalenafronding). Het
"materiaal" in het bestand is dus een rekentechnisch surrogaat en geen uitspraak over de
materiaalsoort — de bron noemt er ook geen.

Bestanden: `design-mockup/referentie/R25.femp` · `toets-R25.mjs` (exitcode 0).
`npx tsc --noEmit`: PASS.

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

| Grootheid | Analytische referentie | 2 staven (bron) | 8 staven (bron) | Onze waarde — 2 staven | Onze waarde — 8 staven gelijkmatig | Onze waarde — gesloten oplossing | Status |
|---|---|---|---|---|---|---|---|
| Buigend moment My in C | 5 759 N·m | 5 510 (−4 %) | 5 901 (+2 %) | 5 510,23 (**+0,004 %**) | 5 723,20 (**−3,013 %**) | 5 758,75 (−0,004 %) | 2 staven + analytisch **gelijk**; 8 staven **afwijking: BRON** |
| Zakking in C | −0,006 844 m | −6,92·10^-3 (+1 %) | −6,901·10^-3 (+0,8 %) | −6,920127·10^-3 (**−0,002 %**) | −6,845304·10^-3 (+0,807 %) | −6,843375·10^-3 (+0,009 %) | idem; de 8-staafswaarde van de bron is bovendien de zakking van de **verkeerde knoop** |
| Zakking in A | −0,007 854 m | −7,46·10^-3 (−5 %) | −7,848·10^-3 (−0,07 %) | −7,459648·10^-3 (**+0,005 %**) | −7,828436·10^-3 (+0,249 %) | −7,858837·10^-3 (−0,062 %) | idem; laatste-cijferfout in de analytische bronwaarde |
| Rotatie in A | −0,000 706 rad | −0,326·10^-3 (−54 %) | −0,693·10^-3 (−2 %) | 3,258444·10^-4 (**−0,048 %**) | 6,801093·10^-4 (−1,860 %) | 7,060005·10^-4 (0,000 %) | idem (vergeleken op absolute waarde) |

**Met de knoopcoördinaten zoals de bron ze afdrukt** (blok 3, `R26b-bronindeling.femp`) —
tegen de 8-staafskolom van de bron: |M| in C 5 900,79 (**−0,004 %**) · zakking in A
−7,847993·10⁻³ (**0,000 %**) · rotatie in A 6,932340·10⁻⁴ (**+0,034 %**) · zakking in C
−6,843560·10⁻³ (+0,832 %), maar de zakking van de knoop **ernaast** (x = −0,6091 m) is
−6,901450·10⁻³ (**−0,007 %**).

**Convergentiereeks** (tributaire veren, 2 → 512 elementen), |M| in C: 5 510,23 / 5 633,67 /
5 723,20 / 5 749,59 / 5 756,44 / 5 758,17 / 5 758,60 / 5 758,71 / 5 758,74 N·m tegen de gesloten
oplossing 5 758,75. Grootste afwijking bij n = 512 op alle vier de grootheden:
**8,2 · 10⁻⁴ %**. Netjes monotoon O(h²).

Eigen controles, alle 12 in orde: som veerreacties = 30 000,000 N exact bij beide indelingen ·
N in de hulpstaaf = 0 exact · anker-reacties Fx = Fz = 0 exact · symmetrie w_A = w_B exact ·
een handmatig geassembleerd 6×6 buiging-alleen-stelsel identiek aan de app tot 9 cijfers.

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

**Conclusie.** `VERSCHIL DOOR DE BRON` — **drie** fouten gevonden, en één daarvan weerlegt een
aanname die hierboven in dit dossier staat.

**Wat klopt.** De 2-elementenindeling komt tot in het laatste door de bron afgedrukte cijfer
overeen (max **0,048 %**). Onze eigen gesloten Winkler-oplossing (vierde-orde ODE, vier
randvoorwaarden) valt samen met de analytische kolom van de bron (max 0,062 %), en de
convergentiereeks 2 → 512 elementen loopt netjes O(h²) naar die gesloten oplossing toe
(8 · 10⁻⁴ % bij n = 512). **De solver, de veeropleggingen op tussenknopen en de eenhedenketen
doen precies wat ze moeten doen.**

**Drie fouten in de bron.**
1. **De 8-staafskolom hoort niet bij een gelijkmatige indeling.** Hierboven staat dat de
   knoopcoördinaten −1,8267 en −0,6091 tikfouten zijn ten opzichte van −1,8627 / −0,6209. **Dat
   is niet zo.** Bouw je het net met die "tikfout"-coördinaten (symmetrisch, dus ook +0,6091 en
   +1,8267), dan reproduceren wij de gepubliceerde 8-staafswaarden voor M (5 900,79 tegen
   5 901), w_A (−7,847993·10⁻³ tegen −7,848·10⁻³) en theta_A (6,9323·10⁻⁴ tegen 6,93·10⁻⁴) tot
   in het laatste cijfer. Met de gelijkmatige indeling die hierboven wordt voorgeschreven lukt
   dat niet (−3,0 %, −1,9 %). **De bron heeft dus met een ongelijkmatig net gerekend terwijl de
   veerstijfheden bij een gelijkmatig net horen — een intern inconsistent model.** Dat verklaart
   meteen waarom de 8-staafswaarde van de bron de analytische oplossing **overschiet** (+2 %) in
   plaats van er van onderaf naartoe te convergeren, zoals een consistent verfijnd model doet.
2. **De gepubliceerde 8-staafs "zakking in C" (−6,901·10⁻³ m) is niet de zakking in C.** In het
   model van de bron is w(C) = −6,8436·10⁻³ m; −6,901450·10⁻³ m is de zakking van de knoop
   **ernaast** (x = −0,6091 m), 0,007 % van de gepubliceerde waarde. Er is een regel verschoven
   bij het overnemen uit de uitvoertabel. Dit verklaart ook waarom die waarde bij 8 elementen
   nauwelijks nauwkeuriger is dan bij 2 elementen, wat rekenkundig niet kan.
3. **De analytische zakking in A** staat in de bron als −0,007854 m; de exacte waarde is
   −0,0078588 m (0,062 %). Laatste-cijferfout, verwaarloosbaar maar aanwezig — onze gesloten
   oplossing en onze convergentiereeks komen daar onafhankelijk van elkaar op uit.

**Beperking in de app (geen rekenfout, wel een invoergat — B6).** Dit geval heeft uitsluitend
verticale veren; de horizontale vrijheidsgraden zijn dan nergens vastgehouden en `solve()` faalt
met `Matrix is singular or nearly singular at column 6`. In de app kan een knoop maar **één**
oplegging dragen: `applySupportToMesh` zet per oplegging een compleet constraints-object en
`Mesh.updateNode` doet een ondiepe merge, dus een tweede oplegging overschrijft de eerste.
"Verticale veer + horizontale steun op dezelfde knoop" is daardoor niet in te voeren, terwijl de
**rekenkern het wel kan** (`INode.constraints` draagt springX, springY en springRot naast
elkaar) — het is puur de `SupportType`-enum van de adapter/UI die te smal is. Opgelost binnen
het bestaande model met een horizontale pendelstaaf naar een ingeklemd anker buiten de ligger.
**Bewezen inert:** de normaalkracht in die staaf is exact 0, beide ankerreacties zijn exact 0, en
een handmatig geassembleerd 6×6 buiging-alleen-stelsel zonder enige horizontale vrijheidsgraad
geeft tot 9 cijfers dezelfde uitkomsten als de app.

De tegenstrijdigheid over de liggerlengte die hierboven staat is bevestigd: totale lengte
4,967294 m (2 × 2,483647 m); de kopregel van de bron is fout. Het model staat op x = 0 …
4 967,294 mm — translatie-invariant, dus zonder gevolg.

Gestuit op **B1**: I = 1,0 · 10⁸ mm⁴ bij E = 210 000 N/mm² staat in geen catalogus. De bestanden
gebruiken S235 / CHS 323.9×8, het profiel met de dichtstbijzijnde E·I (−0,899 %); de
cijfermatige vergelijking gebruikt uitsluitend de exacte bronwaarden via de solver-API. Ter
transparantie rekent het script alle drie de opgeslagen bestanden ook langs de echte app-route:
het verschil blijft daar onder 0,11 % op M en onder 0,04 % op de zakkingen.

Bestanden: `design-mockup/referentie/R26a.femp` (2 elementen) · `R26b.femp` (8 elementen
gelijkmatig, zoals hierboven voorgeschreven) · `R26b-bronindeling.femp` (8 elementen met de
coördinaten van de bron — apart bewaard, **niet in plaats van** R26b) · `toets-R26.mjs`
(exitcode 0).

---

## 9. Zwakkere gevallen — apart gezet

Deze vier voldoen **niet** aan de volledigheidseis en tellen niet mee in de 26. Ze mogen
gebruikt worden voor het beperkte doel dat er bij staat; gebruik ze **niet** als bewijs
dat onze krachtsverdeling klopt.

> **Status na de campagne van 2026-09-03: Z1 t/m Z4 zijn NIET nagerekend.** De campagne heeft
> zich beperkt tot de 26 volwaardige gevallen. De statusvelden hieronder staan daarom bewust nog
> op `open`; dat is geen omissie maar de afbakening. Z1 en Z2 zijn wél de logische kandidaten
> voor een vervolgronde, juist omdat zij de **toetsmodule** los van de krachtsverdeling raken —
> precies de kant waar bevindingen B2, B3 en B4 zitten. Z1 kan bovendien iets zeggen over de
> kipkromme-keuze (B2, punt 3), want IPE 360 heeft h/b = 2,0 en valt daarmee net aan de andere
> kant van de h/b-grens dan de IPE 330 van R16.

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

> **Bijgewerkt na de campagne.** De drie grote gaten hieronder zijn na het narekenen alle drie
> **bevestigd** en staan uitgewerkt in hoofdstuk C. Twee ervan zijn urgenter geworden dan bij
> het verzamelen gedacht: het ontbreken van een **NL-staalreferentie** blijkt rechtstreeks te
> raken aan de zwaarste bevinding van de campagne (B2 zit in de invoer van de NB-kiproute, en
> de NB-route zelf blijft ongevalideerd), en het ontbreken van een **plaatgeval** betekent dat
> een hele tak van de app na deze campagne precies even ongevalideerd is als ervoor. Hoofdstuk
> C.3 voegt bovendien een gat toe dat hieronder nog niet stond: **beton is nergens aanwezig.**

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

Afgerond op 2026-09-03. Alle modellen staan in `design-mockup/referentie/`; elk toetsscript
draait met `npx tsx referentie/toets-Rxx.mjs` vanuit `design-mockup` en geeft exitcode 0 als
alles binnen tolerantie valt.

De kolom "vergeleken" telt de referentiewaarden uit dit dossier plus de eigen kruiscontroles
die het script draait. De kolom "bestand betrouwbaar" zegt of het opgeslagen `.femp` bij openen
in de app hetzelfde antwoord geeft als het doorgerekende model — zie **B1**.

| Kenmerk | Model opgeslagen | Doorgerekend | Vergeleken | Grootste Δ | Codes | Bestand betrouwbaar | Conclusie |
|---|---|---|---|---|---|---|---|
| R01 | R01.femp | ja | 4 + 23 eigen | 0,040 % | — | ja (E·A en E·I exact) | gelijk |
| R02 | R02.femp | ja | 6 + 18 eigen | 0,128 % | AANNAME | ja (E·A en E·I exact) | gelijk |
| R03 | R03.femp | ja | 20 + 9 eigen | 0,015 % | — | **nee** — terugval op HEA 160 (w factor 20 mis) | gelijk |
| R04 | R04.femp | ja | 3 + 14 eigen | 0,072 % | AANNAME | deels — reacties/M goed, w factor 19,09 te groot | gelijk |
| R05 | R05.femp | ja | 4 + 27 eigen | 1,3·10⁻¹² % | — | ja | gelijk |
| R06 | R06.femp | ja | 7 + 11 eigen | 0,055 % | AANNAME, **BRON** (M4/M5, al voorzien) | ja (EI exact) | gelijk |
| R07 | R07.femp | ja | 13 | 0,340 % | AANNAME | ja (EI exact) | gelijk |
| R08 | R08.femp | ja | 9 | 0,076 % | AANNAME | ja (EI exact) | gelijk |
| R09 | R09.femp | ja | 13 | 0,05 % / 6,65 % | AANNAME, **BRON** | ja (EI exact) | 1e orde gelijk; stabiliteit BRON |
| R10 | R10a.femp, R10b.femp | ja | 11 + 27 eigen | 0,030 % | AANNAME | ja (EI exact) | gelijk |
| R11 | R11.femp | ja | 4 | 0,0088 % | — | ja (E·A exact) | gelijk · **bevinding B5** |
| R12 | R12.femp | ja | 4 | 0,0014 % / 20,89 % | **AANNAME** | deels — UPE 220, +0,232 % op E·I | verschil door aanname |
| R13 | R13.femp | ja | 13 | 1,11 % | — | **nee** — terugval op HEA 160 (w factor 33 mis) | gelijk |
| R14 | R14.femp | ja | 88 | 1,09 % / 199,98 % | **BRON** | deels — HEA 550, −5 % Iy (raakt niets) | verschil door de bron |
| R15 | R15.femp | ja | 88 | 4,8 % | **AANNAME**, NB | deels — voute niet in het bestand | verschil door aanname |
| R16 | R16.femp | ja | 22 | 17,39 % | **ONS**, NB | ja | **fout in de app — onveilig** |
| R17 | R17.femp | ja | 14 | 0,41 % | NB | ja | gelijk · **bevinding B4, onveilig** |
| R18 | R18.femp | ja | 40 | 3,60 % / 99 % | **AANNAME**, BRON | deels — SHS-substituten, 0,4–1,7 % | verschil door aanname |
| R19 | R19.femp | ja | 12 (+ 3 app-defaults apart) | 1,30 % | **ONS**, BRON | ja | **fout in de toetsinvoer** |
| R20 | R20.femp | ja | 55 | 0,971 % | **ONS**, NB | **nee** bij invoer "GL28c"; ja als GL28h | gelijk · **bevindingen B3, B7, B8, B9** |
| R21 | R21.femp, R21-werkvlak.femp | ja | 30 | 1,48 % / 16,08 % | **BRON**, AANNAME | ja (EI én Wel,y exact) | verschil door de bron |
| R22 | R22.femp | ja | 55 | 1,48 % | — | ja (GL28h = GL28c qua E) | gelijk |
| R23 | R23.femp, R23-hybride.femp | ja | 7 | 0,097 % / −58,3 % | **AANNAME** | ja voor BG1; alpha niet instelbaar voor BG2 | verschil door aanname |
| R24 | R24.femp | ja | 3 | 4,00 % | **AANNAME** | ja (6,7·10⁻⁷) | verschil door aanname |
| R25 | R25.femp | ja | 2 + 15 eigen | 1,9·10⁻⁷ % | — | ja (E·A en E·I exact) | gelijk |
| R26 | R26a, R26b, R26b-bronindeling | ja | 17 | 0,05 % / 3,01 % | **BRON** | deels — CHS 323.9×8, −0,899 % op E·I | verschil door de bron |
| Z1–Z4 | — | nee | 0 | — | — | — | buiten de campagne (zie hoofdstuk 9) |

**Regressiemateriaal per `ONS`-bevinding**, zodat er een test van gemaakt kan worden conform het
solver-testprotocol in CLAUDE.md:

| Bevinding | Minimale reproductie | Vangnet-assertie |
|---|---|---|
| **B2** kip staal | R16: IPE 330, 5,70 m, vrij opgelegd, q = 22,28 kN/m UGT, last op de bovenflens. IJkpunten Mcr = 113,90 (bron, algemene EN) / 115,40 (NB, juiste invoer) / 125,38 (NB, huidige invoer) / 78,91 kN·m (beta = 0 zonder l_kip-onderscheid) | (i) B* moet 0 uitkomen voor een vrij opgelegde ligger onder alleen veldbelasting — hij is nu structureel exact 0,500; (ii) beta moet 0 opleveren bij een lineaire momentlijn met beta_echt = 0 — nu 0,250 |
| **B3** k_cr hout | R19: C24 45 × 220, 4,5 m, qd = 2,0 kN/m. V_Rd hoort 10,885 kN te zijn, de app geeft 16,246 | V_Rd van de app tegen (2/3)·0,67·b·h·fv,d |
| **B4** kipsteunen onderflens | R17 comb. 2: IPE 400 15 m, netto opwaarts −2,05 kN/m, bovenflens om 2,50 m, onderflens om 5,00 m. L_st hoort 5 000 mm te zijn, de app geeft 2 500 | L_st bij een hogging momentenlijn moet uit `bottom_flange_positions` komen |
| **B5** singulier raamwerk | R11 met scharnieren op alle staafeinden → `Matrix is singular at column 8` | Raamwerkpad moet nul-stijfheid-DOF's inklemmen zoals het plaatpad dat doet |
| **B7/B8** hout-toetsinvoer | R19 en R20 | `perform_ltb_check` moet uit kunnen; `deflection_quasi_perm_mm` moet uit de SLS-quasi-permanente combinatie komen |

De twee bestaande Rust-integratietests (`referentie_r19.rs`, `referentie_r20.rs`) draaien de
EN 1995-kern al langs de productieroute en zijn geschikt als vangnet: na de reparatie van B3
hoort de "app-default"-regel voor V_Rd van +49 % naar circa 0 % te gaan **zonder** dat de
bron-variant verschuift. Pas bij het repareren **geen** bestaande test en **geen**
referentiewaarde aan.

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

*Dat geldt ook voor de campagne van 2026-09-03. Elke ingevulde kolom "Onze waarde" is een
gemeten uitkomst van een toetsscript, niet een overgenomen of bijgestelde referentie. Waar een
bronwaarde weersproken wordt (R09, R14, R21, R26, en de correctie op de R26-aanname en de
R24-tolerantie), staat de oorspronkelijke referentiewaarde onaangeroerd in de tabel en staat de
weerlegging met bewijs in de conclusie. Er is bij het narekenen geen regel productiecode
gewijzigd en geen bestaande test aangepast — de dertien bevindingen in hoofdstuk B zijn
vastgelegd, niet gerepareerd.*
