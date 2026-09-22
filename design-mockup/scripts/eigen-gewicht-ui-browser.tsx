// Het belastinggeval "Eigen gewicht" in de echte tabbalk en het echte
// tekenvlak (issue #42), in Chromium met de echte CSS en thema's.
//
// Twee standen, gekozen met de hash van de pagina:
//   (geen hash)        de controles — uitslag als JSON in <pre id="uitslag">;
//   #toon-light/-openaec  alleen de weergave, blijvend gemonteerd, voor een
//                      schermafbeelding in het lichte of donkere thema.
//
// Het overzicht komt uit `eigenGewichtOverzicht`, dezelfde functie die App.tsx
// aan tekenvlak, tabbalk en tabel doorgeeft; het model is het startmodel van
// de app (`makeInitialSnapshot`, `DEFAULT_LOAD_CASES`).
import React from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';
import FemCanvas from '../src/components/fem/FemCanvas';
import LoadCaseTabBar from '../src/components/fem/LoadCaseTabBar';
import { makeInitialSnapshot, DEFAULT_LOAD_CASES, DEFAULT_SELF_WEIGHT_ENABLED } from '../src/hooks/useFemStore';
import { eigenGewichtOverzicht } from '../src/lib/eigenGewichtOverzicht';
import { EIGEN_GEWICHT_STANDAARD_ID } from '../src/lib/eigenGewicht';
import '../src/themes.css';
import '../src/App.css';
import nl from '../src/i18n/locales/nl/common.json';
import en from '../src/i18n/locales/en/common.json';
import de from '../src/i18n/locales/de/common.json';
import fr from '../src/i18n/locales/fr/common.json';

const box = document.getElementById('root')!;
box.style.cssText = 'width:1100px;height:640px;display:flex;flex-direction:column;background:var(--theme-bg)';
const root = createRoot(box);
const tests: string[] = [], errors: string[] = [];
function ok(value: unknown, message: string): asserts value { if (!value) throw Error(message); }
function test(name: string, fn: () => void) { try { fn(); tests.push(name); } catch (e) { errors.push(`${name}: ${e}`); } }
function mount(element: React.ReactNode) { flushSync(() => root.render(element)); }
const noop = () => {};

const snap = makeInitialSnapshot();
const model = {
  nodes: snap.nodes, beams: snap.beams, supports: snap.supports, plates: snap.plates, loads: snap.loads,
  loadCases: DEFAULT_LOAD_CASES,
};
const overzicht = (selfWeightEnabled: boolean, loadCases = model.loadCases) =>
  eigenGewichtOverzicht({ nodes: model.nodes, beams: model.beams, plates: model.plates, loadCases, selfWeightEnabled });

function Weergave({ actief, selfWeightEnabled = DEFAULT_SELF_WEIGHT_ENABLED }: { actief: number; selfWeightEnabled?: boolean }) {
  const eg = overzicht(selfWeightEnabled);
  const naam = model.loadCases.find((c) => c.id === actief)?.name;
  return (
    <>
      <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
        <FemCanvas {...({
          tool: 'select', ...model, selection: null, activeLoadCaseId: actief, activeLoadCaseName: naam,
          setSelection: noop, addNode: noop, addBeam: noop, addSupport: noop, addLoad: noop, deleteSelected: noop,
          updateNode: noop, grid: { spacingMm: 1000, show: false, showLines: false }, combinations: [],
          showLoads: true, eigenGewicht: eg,
        } as any)} />
      </div>
      <LoadCaseTabBar
        loadCases={model.loadCases} activeLoadCaseId={actief} setActiveLoadCaseId={noop}
        addLoadCase={noop} loads={model.loads} selfWeightEnabled={selfWeightEnabled}
        setSelfWeightEnabled={noop} eigenGewicht={eg} showLoads={true} setShowLoads={noop}
      />
    </>
  );
}

async function run() {
  await i18next.use(initReactI18next).init({
    lng: 'nl', fallbackLng: 'nl', defaultNS: 'common',
    resources: { nl: { common: nl }, en: { common: en }, de: { common: de }, fr: { common: fr } },
    interpolation: { escapeValue: false },
  });
  const toon = /^#toon-(light|openaec)$/.exec(location.hash);
  if (toon) {
    document.documentElement.dataset.theme = toon[1];
    document.body.style.cssText = 'margin:0;background:var(--theme-bg)';
    mount(<Weergave actief={EIGEN_GEWICHT_STANDAARD_ID} />);
    document.getElementById('uitslag')!.textContent = JSON.stringify({ tests: ['weergave'], errors: [] });
    return;
  }
  document.documentElement.dataset.theme = 'light';
  const eg = overzicht(true);
  const staven = model.beams.length;

  test('de tab "Eigen gewicht" staat vooraan, met label auto en het aantal gegenereerde lasten', () => {
    mount(<Weergave actief={EIGEN_GEWICHT_STANDAARD_ID} />);
    const tabs = [...box.querySelectorAll('.lc-tab')].filter((el) => el.getAttribute('role') === 'tab');
    const egTab = tabs.find((el) => el.classList.contains('lc-tab-auto'));
    ok(egTab, 'tab met lc-tab-auto ontbreekt');
    ok(egTab.querySelector('.lc-tab-name')?.textContent === 'Eigen gewicht', egTab.textContent ?? '');
    ok(egTab.querySelector('.lc-tab-auto-tag')?.textContent === 'auto', 'label auto ontbreekt');
    ok(egTab.querySelector('.lc-tab-count')?.textContent === String(staven), `teller ${egTab.querySelector('.lc-tab-count')?.textContent} ≠ ${staven} staven`);
    ok(tabs.indexOf(egTab) === 1, `positie ${tabs.indexOf(egTab)} (na de modeltab hoort 1)`);
    ok(egTab.getAttribute('aria-selected') === 'true', 'tab niet actief');
  });
  test('het tekenvlak toont per staaf de gegenereerde last, alleen-lezen, met de waarde uit de rekengang', () => {
    mount(<Weergave actief={EIGEN_GEWICHT_STANDAARD_ID} />);
    const laag = box.querySelector('[data-testid="eigen-gewicht-laag"]');
    ok(laag, 'laag ontbreekt');
    ok(laag.getAttribute('pointer-events') === 'none', 'laag is niet alleen-lezen');
    const groepen = [...laag.querySelectorAll('[data-eg-staaf]')];
    ok(groepen.length === staven, `${groepen.length} staafgroepen, verwacht ${staven}`);
    for (const s of eg.staven) {
      const tekst = laag.querySelector(`[data-eg-staaf="${s.beamId}"] .fem-eg-tekst`)?.textContent ?? '';
      const q = Math.abs(s.delen[0].q).toFixed(3).replace('.', ',');
      ok(tekst.includes(q) && tekst.includes('kN/m') && tekst.includes('auto'), `staaf ${s.beamId}: "${tekst}" mist ${q} kN/m (auto)`);
    }
    // Automatisch = gestreept en gedempt, niet de stijl van een ingevoerde last.
    const pijl = laag.querySelector('.fem-eg-pijl')!;
    ok(getComputedStyle(pijl).strokeDasharray !== 'none', 'pijl niet gestreept');
  });
  test('in "Permanent (G)" staan alleen de ingevoerde lasten, geen gegenereerde', () => {
    mount(<Weergave actief={1} />);
    ok(!box.querySelector('[data-testid="eigen-gewicht-laag"]'), 'eigen-gewichtlaag zichtbaar in Permanent (G)');
    const g = [...box.querySelectorAll('.lc-tab')].find((el) => el.querySelector('.lc-tab-name')?.textContent === 'Permanent (G)')!;
    ok(g.querySelector('.lc-tab-count')?.textContent === String(model.loads.filter((l) => l.caseId === 1).length), 'teller Permanent (G) telt het eigen gewicht mee');
  });
  test('schakelaar uit → geen laag en geen teller op de tab', () => {
    mount(<Weergave actief={EIGEN_GEWICHT_STANDAARD_ID} selfWeightEnabled={false} />);
    ok(!box.querySelector('[data-testid="eigen-gewicht-laag"]'), 'laag zichtbaar met schakelaar uit');
    ok(!box.querySelector('.lc-tab-auto .lc-tab-count'), 'teller zichtbaar met schakelaar uit');
  });
  for (const theme of ['light', 'openaec']) {
    test(`${theme}: pijl en tekst gebruiken de themakleur, niet zwart op zwart`, () => {
      document.documentElement.dataset.theme = theme;
      mount(<Weergave actief={EIGEN_GEWICHT_STANDAARD_ID} />);
      const tekst = box.querySelector('.fem-eg-tekst')!;
      const kleur = getComputedStyle(tekst).fill;
      const verwacht = getComputedStyle(document.documentElement).getPropertyValue('--theme-text-secondary').trim();
      ok(verwacht !== '' && kleur !== '' && kleur !== 'rgb(0, 0, 0)', `${theme}: fill ${kleur}, token ${verwacht}`);
    });
  }
  document.documentElement.dataset.theme = 'light';
  for (const [lang, auto] of [['en', 'auto'], ['de', 'auto'], ['fr', 'auto']] as const) {
    test(`${lang}: tabtitel vertaald, met het aantal`, () => {
      flushSync(() => { void i18next.changeLanguage(lang); });
      mount(<Weergave actief={EIGEN_GEWICHT_STANDAARD_ID} />);
      const titel = box.querySelector('.lc-tab-auto')?.getAttribute('title') ?? '';
      ok(titel.includes(String(staven)) && !titel.includes('loadCases.'), `${lang}: "${titel}"`);
      ok(box.querySelector('.lc-tab-auto-tag')?.textContent === auto, `${lang}: label`);
    });
  }
  flushSync(() => root.unmount());
  document.getElementById('uitslag')!.textContent = JSON.stringify({ tests, errors });
}
void run().catch((e) => document.getElementById('uitslag')!.textContent = JSON.stringify({ tests, errors: [...errors, String(e)] }));
