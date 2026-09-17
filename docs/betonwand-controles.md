# Betonwand: controles in het vlak

De aanvulling wordt alleen geactiveerd door `PlateCheckInput.wapening_aanwezig`
(`Plate.wapening` in het project). Zonder die optionele invoer blijft de bestaande
betonplaatuitvoer exact behouden. Het projectformaat blijft versie 2.

## Ondersteund rekengebied

- UGT: vergelijking van de trekwapening uit bijlage F met de aanwezige wapening
  **per zijde**, met kracht- én momentevenwicht over de wanddikte. `sigma_x_mpa`
  is horizontaal, `sigma_y_mpa` verticaal
  (model-z); beide zijn trek-positief. Eenheden: MPa, mm en mm²/m.
  Benodigd oppervlak is `f_td · t · 1000 / f_yd`; `f_yd = f_yk / gamma_S`.
  De aandelen zijn β1=a2/(a1+a2) en β2=a1/(a1+a2), waarin ai de afstand van
  het staafzwaartepunt tot het midden is. Het equivalente totale oppervlak is
  `min(A_s,1/β1; A_s,2/β2)`; alleen bij geschikte symmetrie is dit de som.
  Twee bekende lagen aan weerszijden van het midden zijn vereist bij trek;
  alleen A_s-invoer bewijst geen capaciteit. Een volledig ontbrekende wapening
  bij een positieve trekkracht is wel een aangetoond tekort.
  Alle elementen en UGT-combinaties tellen mee.
- Wanddetail: basiseis voor de dikte 100 mm, bij twee lagen 120 mm; minimale
  diameter 5 mm; verticale staafafstand maximaal `min(3t,400)` mm en horizontale
  staafafstand maximaal 400 mm, telkens **per zijde**. De Nederlandse parameters
  voor de nominale minimumoppervlakken zijn nul in beide richtingen. Voor het
  verticale maximum geldt `0,04 A_c`. Dit vervangt geen berekende trekwapening of
  minimumscheurwapening.
- §7.3.2: bovengrens voor een volledig op trek belaste meterstrook, met
  `k_c = k = 1`, `A_ct = 1000t` en `sigma_s = f_yk`. De opgegeven `f_ct_eff_mpa`
  bepaalt de treksterkte op het verwachte scheurtijdstip, maximaal f_ctm van de
  betonklasse. Er wordt geen ouderdom
  aangenomen. Geen reductie voor niet-gelijkmatige eigenspanning; deze controle
  kan daardoor meer wapening vragen dan een afzonderlijk onderbouwd model.
  Alleen richtingen met aangetoonde eenassige trek onder frequente BGT worden
  beschouwd. Voldoende wapening voor deze bovengrens (met evenwicht per zijde)
  geeft een positief deelresultaat. Onvoldoende wapening voor een conservatieve
  bovengrens bewijst geen normfalen: het deelresultaat is dan NotApplicable
  zonder UC en vraagt een onderbouwde scheuroorzaak en trekzone.
  Een druktoestand leidt dus niet tot een fictief scheurminimumtekort.
- §7.3.4: uitsluitend eenassige membraantrek zonder schuif en met twee identieke
  lagen in de beschouwde richting. Dan volgt de staalspanning uit gescheurd
  evenwicht: `sigma_s = sigma · 1000t / (A_s,1 + A_s,2)`. Per zijde geldt
  `h_eff = min(2,5(c+Ø/2), t/2)` voor volledige axiale trek. Hergebruik van de EC2-
  functies voor rekverschil, scheurafstand inclusief NB-bovengrens en `w_max`.
  Alle **frequente BGT-combinaties** tellen mee; UGT-sterkten of UGT-spanningen
  worden niet gebruikt voor de scheurwijdte. BGT boven `f_yk` geeft een
  overschrijding en geen elastisch berekende scheurwijdte.

## Dekking en invoergrenzen

De dekking wordt gemeten tot het oppervlak van de staaf in **die laag**.
Kruisende horizontale en verticale staven moeten in afzonderlijke diepte-intervallen
liggen. Lagen aan weerszijden moeten binnen de wanddikte passen. Ø, afstand, A_s
en dekking moeten eindig en positief zijn; Ø en h.o.h. samen óf A_s, nooit beide.
H.o.h. moet groter zijn dan Ø. Een ontbrekende laag draagt nul staal bij.

De controle op de ondergrens van de dekking gebruikt `c >= max(Ø,10 mm)` voor
afzonderlijke staven. Dit is **geen volledige nominale dekkingscontrole**: de
duurzaamheidsdekking, korreltoeslag en uitvoeringstolerantie kunnen een hogere
waarde vereisen. Die blijven expliciet niet getoetst.

Het scheurmodel vereist bovendien Ø ≥ 5 mm en `s <= 5(c+Ø/2)` aan beide zijden.
Er wordt geen fictieve drukzone voor (7.14) gekozen. Asymmetrische lagen,
tweeassige spanning, schuif of alleen A_s-invoer leveren voor scheurwijdte
`niet_getoetst` met reden. De optionele velden `f_ct_eff_mpa`, `langdurend` en
`hoge_aanhechting` hebben geen impliciete standaard. Ook de milieuklasse en
frequente spanningen moeten beschikbaar zijn. XF/XA alleen bepalen geen `w_max`.

## Blijvende grenzen en resultaatcontract

Vrije-randverankering, knik en effecten uit het vlak blijven expliciet niet
getoetst. Ook dwarswapening/opsluiting, nettype, overlappingsdetails, volledige
duurzaamheidsdekking, verhinderde vervormingen en de aanvullende wandgeometrie
(onder meer lengte/dikte, schillen, blijvende bekisting en sleuven) ontbreken.
De laagoppervlakken gelden uniform over de plaat. Het model controleert geen
lokale staafbeëindiging, openingenranddetail of spanningspiek binnen een element.

Bij een aangetoonde overschrijding wordt de plaat `NotOk`; anders verhinderen
de ontbrekende controles de status `Ok` en blijft de plaat `NotApplicable`.
De UGT- en BGT-controles hebben verschillende toets-id's, maar dragen beide bij
aan de bestaande omhullenden. Een globale detailcontrole heeft geen maatgevend
element of combinatie. Een weerstand nul bij positieve vraag geeft `NotOk`;
de UC is dan onbegrensd en wordt in JSON gemarkeerd met de grootste eindige f64,
met een expliciete toelichting. Combinatie-id's moeten uniek zijn over UGT en BGT.

Het Rust-invoertype kreeg drie optionele velden; Rust-structliterals moeten die
ook noemen. Het JSON-contract en oude projectbestanden blijven compatibel.
Een nieuwere wapeningopgave is niet bedoeld voor oudere binaries die de nieuwe
velden nog niet kennen. Na integratie moeten solverbundel en binaries uit
dezelfde bronstand worden gebouwd.

## Verificatie

De fixtures in `plaat-check/tests/wandwapening.rs` rekenen een wand van 200 mm,
C30/37, B500B met twee lagen Ø12-100 handmatig na: A_s = 720π mm²/m,
UGT bij 2 MPa geeft 920 mm²/m, scheurminimum bij f_ct,eff = 2,9 MPa geeft
1160 mm²/m en frequente trek van 1,5 MPa geeft w_k = 0,1241408556 mm
(horizontale dekking 30 mm). Daarnaast worden tekens/assen, ontoereikende en
ontbrekende wapening, ongeldige geometrie, afzonderlijke zijden, alle combinaties,
BGT-vloeien, ontbrekende scheurbasis en het ongewijzigde oude resultaat getest.

`test-plaat-wapening.mjs` bewaakt projectserialisatie, UI-rendering in vier talen,
MCP-modelvalidatie, sidecar-doorgifte en UGT/BGT-selectie. De Rust-MCP-unittest
vergelijkt JSON-dispatch rechtstreeks met de plaatkern, zonder een server te starten.

Gerichte verificatiecommando's (Rust steeds met `CARGO_BUILD_JOBS=2`):

- Vanuit `src-tauri`: `cargo test -p plaat-check -p nationale-bijlage`.
- Vanuit `src-tauri`: `cargo test -p openaec-mcp-server --bin openaec-mcp-server plate_tools::tests`.
- Vanuit `design-mockup`: `npx tsc --noEmit`.
- Vanuit `design-mockup`: `node scripts/run-tests.mjs --filter=plaat-wapening --breed`.
- Bundelcontrole: eerst `node scripts/bouw-sidecar.mjs`, daarna dezelfde frontendtest
  met `TEST_PLAAT_BUNDEL=1`. De gewone bronrun slaat uitsluitend deze bundeltest over.

De bundel moet na integratie opnieuw worden gegenereerd: de bestaande ingecheckte
bundel omvat de nieuwe wapeningsvelden niet. De bundelwijziging is geen onderdeel
van deze aanvulling omdat hergeneratie tevens andere reeds aanwezige
bronwijzigingen opneemt. Bouw vervolgens de binaries die de bundel insluiten.

## Bestanden van deze aanvulling

- `src-tauri/crates/plaat-check/src/wand.rs`, `input.rs`, `lib.rs`.
- `src-tauri/crates/plaat-check/tests/wandwapening.rs`.
- `src-tauri/crates/nationale-bijlage/src/ndp_1992.rs`.
- `src-tauri/crates/openaec-mcp-server/src/plate_tools.rs`.
- `design-mockup/src/lib/plaatCheckBuilder.ts`, `plaatWapening.ts`.
- `design-mockup/src/lib/types/plaat/PlaatWapeningInvoer.ts` en
  `PlaatWapeningLaag.ts` (gegenereerd, uitsluitend eigen veld/documentatiewijziging).
- `design-mockup/src/mcp/valideerModel.ts`.
- `design-mockup/src/components/fem/PlaatWapeningVenster.tsx`.
- `design-mockup/src/i18n/locales/{nl,en,de,fr}/check.json`.
- `design-mockup/test-plaat-wapening.mjs`, `design-mockup/scripts/run-tests.mjs`.
- `docs/betonwand-controles.md`.
