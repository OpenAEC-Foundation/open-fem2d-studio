// Voer de echte App-callbacks uit; alleen I/O en React-setters zijn testnaden.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { test } from 'node:test';

const source = readFileSync(new URL('src/App.tsx', import.meta.url), 'utf8');
const ast = ts.createSourceFile('App.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function callback(name) {
  let found;
  function visit(n) {
    if (ts.isVariableDeclaration(n) && n.name.getText(ast) === name) found = n.initializer;
    ts.forEachChild(n, visit);
  }
  visit(ast);
  assert.ok(found, name);
  const expression = ts.isCallExpression(found) ? found.arguments[0] : found;
  return ts.transpile(`(${expression.getText(ast)})`, { target: ts.ScriptTarget.ES2022 })
    .replaceAll('import("./io/notify")', 'notifyImport()');
}
const deferred = () => { let resolve, reject; const promise = new Promise((a,b) => { resolve=a; reject=b; }); return {promise,resolve,reject}; };
test('Berekenen vanuit Model maakt de resultaten zichtbaar', () => {
  const state = { view: 'report', tree: 'project', results: false, showLoads: false,
    flags: { M: false, V: false, N: false, deflection: false, reactions: false, uc: false, schaalM: 2 },
    selection: { type: 'beam', id: 6 }, runs: 0 };
  const context = vm.createContext({
    setActiveView: value => { state.view = value; },
    setTreeTab: value => { state.tree = value; },
    setResultsTabActive: value => { state.results = value; },
    setDisplayFlags: update => { state.flags = update(state.flags); },
    fem: { setShowLoads: value => { state.showLoads = value; }, setSelection: value => { state.selection = value; } },
    rekenDoor: async () => { state.runs++; },
  });
  vm.runInContext(callback('handleSolve'), context)();
  assert.equal(state.showLoads, true, 'de algemene zichtbaarheid moet na de Model-tab weer aan');
  assert.equal(state.view, 'default');
  assert.equal(state.tree, 'results');
  assert.equal(state.results, true);
  for (const key of ['M', 'V', 'N', 'deflection', 'reactions', 'uc']) assert.equal(state.flags[key], true, key);
  assert.equal(state.flags.schaalM, 2, 'bestaande weergave-instellingen behouden');
  assert.equal(state.selection, null);
  assert.equal(state.runs, 1);
});
test('betonvenster krijgt alleen de actuele afgeronde combinatieresultaten', () => {
  let expression;
  function visit(n) {
    if (ts.isJsxSelfClosingElement(n) && n.tagName.getText(ast) === 'BetonStaafVenster') {
      expression = n.attributes.properties.find(p => p.name?.getText(ast) === 'actueleCombinatieResultaten')?.initializer?.expression;
    }
    ts.forEachChild(n, visit);
  }
  visit(ast);
  assert.ok(expression, 'verbind het betonvenster met de centrale resultaatgeneratie');
  const outputs = new Map();
  for (const kind of ['idle', 'rekenen', 'error', 'solved']) {
    const value = vm.runInNewContext(expression.getText(ast), { solverStatus: { kind }, fem: { combinationResults: outputs } });
    assert.equal(value, kind === 'solved' ? outputs : null);
  }
});
const tick = async () => { for (let i=0;i<30;i++) await Promise.resolve(); };
function fixture(seam, fails) {
  const barrier = deferred();
  let calls=0;
  const events=[];
  const ref = current => ({current});
  const write = name => value => events.push([name, value]);
  const pause = async (name, value) => {
    if(name===seam && calls++ === 0) { await barrier.promise; if(fails) throw new Error('oude fout'); }
    return value;
  };
  const outputs = () => ({ perCase:new Map(), combinationResults:new Map(), envelope:{} });
  const c = {
    console:{warn(){}}, Map, Set, Date, Error, Promise,
    rekenGeneratieRef:ref(0), lopendeRekengangenRef:ref(0), volledigeRekengangRef:ref(null),
    liveRekenenRef:ref(false), rekenFoutRef:ref(null), laatsteMultiInputRef:ref({snapshot:true}),
    herberekeningGeplandRef:ref(false), herberekenTimerRef:ref(null), rapportRekenPogingRef:ref(false),
    window:{clearTimeout(){}},
    setSolveTrigger(){}, setSolverStatus:write('status'), setSolverErrorText:write('error'),
    setStabiliteitsMelding:write('stabilityMessage'), checkClear:write('clearChecks'),
    stijfheidClear:write('clearTrace'), stijfheidZet:write('trace'),
    computeAndStoreSolverOutputs:outputs, leesbareRekenfout:e=>e.message,
    fem:{ analysetype:'tweedeOrdeFysisch', nodes:[], beams:[], supports:[], plates:[],
      actieveCombinaties:[{id:1,type:'uls',name:'UGT'}], setSolverOutputs:write('outputs') },
    notifyImport:()=>pause('notify', {notifyInfo:write('info'),notifyWarning:write('warning')}),
    i18next:{t:x=>x}, roepKern:()=>pause('kernel', {}),
    bepaalKruipPerStaaf:()=>pause('creep',{mislukt:[]}), kruipWaardenPerStaaf:()=>new Map(),
    bepaalBeffPerStaaf:()=>pause('beff',new Map()), bEffWaardenPerStaaf:x=>x,
    betonStavenUitModel:()=>({staven:[{}],overgeslagen:[]}),
    bijlageVanProject:()=> 'NL', schatVrijheidsgraden:()=>1, segmentWaarschuwing:()=>null,
    getSecondOrderInput:()=>({snapshot:true}), belastingduurVanCombinatie:()=>({duur:'ShortTerm',reden:''}),
    losCombinatieFysischOp: async (_input,_combo,_staven, opts) => {
      if(seam==='kernel') await (opts.roep ?? c.roepKern)('segment');
      return pause('physical',{zonderKruipcoefficient:[],resultaat:{},ronden:1,geschiedenis:[],laatsteRonde:new Map()});
    },
    zetCombinatieResultaat:write('cache'), combineResults:()=>({}), computeEnvelope:()=>({}),
    bepaalStabiliteit:()=>{events.push(['stability']); return [];},
    handleRunMemberChecks:()=>pause('checks',undefined).then(()=>{}),
  };
  const context=vm.createContext(c);
  c.rekenFysischNietlineair=vm.runInContext(callback('rekenFysischNietlineair'),context);
  const run=vm.runInContext(callback('rekenDoor'),context);
  return { c,events,barrier,run };
}
for (const seam of ['notify','creep','beff','physical','kernel','checks']) {
  for (const fails of [false,true]) test(`oude ${seam} ${fails?'fout':'succes'} schrijft niet na nieuwe rekengang`, async()=>{
    const f=fixture(seam,fails);
    const a=f.run(); await tick();
    const b=await f.run(); assert.equal(b.gelukt,true);
    const completed=f.c.volledigeRekengangRef.current;
    const count=f.events.length;
    f.barrier.resolve();
    const old=await a;
    assert.equal(old.gelukt,false,'verouderde rekengang mag geen succes melden');
    assert.equal(f.events.length,count,'geen oude status, outputs, cache, spoor, checks of toast');
    assert.equal(f.c.volledigeRekengangRef.current,completed);
    assert.equal(f.c.lopendeRekengangenRef.current,0);
  });
}
test('modelwijziging zonder nieuwe solve verwerpt fysische uitkomst',async()=>{
  const f=fixture('physical',false); const a=f.run(); await tick();
  f.c.rekenGeneratieRef.current++; const count=f.events.length;
  f.barrier.resolve(); assert.equal((await a).gelukt,false);
  assert.equal(f.events.length,count);
});
test('actuele kernfout wist solverresultaten en voltooiingsbewijs',async()=>{
  const f=fixture('beff',true); f.c.volledigeRekengangRef.current=new Map();
  const a=f.run(); await tick(); f.barrier.resolve();
  assert.equal((await a).gelukt,false);
  assert.ok(f.events.some(([name,value])=>name==='outputs' && value===null));
  assert.equal(f.c.volledigeRekengangRef.current,null);
});

test('verse voltooide rekengang is in rust terwijl oude kernpromise nog hangt',async()=>{
  const f=fixture('physical',false);
  const a=f.run(); await tick();
  assert.equal((await f.run()).gelukt,true);
  assert.ok(f.c.volledigeRekengangRef.current);
  assert.equal(f.c.lopendeRekengangenRef.current,0,'oude run mag export niet blokkeren');
  f.barrier.resolve(); await a;
  assert.equal(f.c.lopendeRekengangenRef.current,0,'oude finally mag teller niet negatief maken');
});

function reportEffect(context) {
  let effect, dependencies;
  function visit(n) {
    if(ts.isCallExpression(n) && n.expression.getText(ast)==='useEffect'
      && n.arguments[0]?.getText(ast).includes('activeView !== "report"')) { effect=n.arguments[0]; dependencies=n.arguments[1]; }
    ts.forEachChild(n,visit);
  }
  visit(ast);assert.ok(effect,'rapport-effect');
  const c=vm.createContext(context);
  const run=vm.runInContext(ts.transpile(`(${effect.getText(ast)})`,{target:ts.ScriptTarget.ES2022}),c);
  run.dependencies=()=>vm.runInContext(ts.transpile(`(${dependencies.getText(ast)})`,{target:ts.ScriptTarget.ES2022}),c);
  return run;
}
test('open rapport probeert fysieke fout niet opnieuw; nieuw model mag wel',async()=>{
  const f=fixture('physical',true);
  f.c.activeView='report';f.c.fem.combinationResults=null;
  let starts=0, pending;
  f.c.rekenDoorRef={current:()=>{starts++;pending=f.run();return pending;}};
  const effect=reportEffect(f.c);
  effect();await tick();
  f.c.fem.combinationResults=new Map();effect();
  f.barrier.resolve();await pending;
  f.c.fem.combinationResults=null;effect();
  assert.equal(starts,1,'geen automatische lus na wissen van de voorronde');
  f.c.rekenGeneratieRef.current++;f.c.rapportRekenPogingRef.current=false;f.c.rekenFoutRef.current=null;
  effect();await pending;assert.equal(starts,2,'gewijzigd model krijgt nieuwe poging');
});

test('oude import vóór checkRun start geen nieuwe toetsgeneratie',async()=>{
  const f=fixture('notify',false);let checks=0;
  Object.assign(f.c,{anyCheckableBeams:()=>true,anyCheckablePlates:()=>false,
    eersteOrdeResultatenVoorKolomtoets:()=>undefined,checkRun:async()=>{checks++;}});
  const run=vm.runInContext(callback('handleRunMemberChecks'),vm.createContext(f.c));
  const a=run({openPanel:false,outputs:{combinationResults:new Map(),perCase:new Map()}});
  await tick();f.c.rekenGeneratieRef.current++;
  f.barrier.resolve();await a;assert.equal(checks,0);
});

test('rapport herstart na modelwijziging ook als de synchrone eerste poging faalde',async()=>{
  const f=fixture('none',false);let starts=0,pending;
  f.c.activeView='report';f.c.fem.combinationResults=null;
  f.c.computeAndStoreSolverOutputs=()=>null;
  f.c.rekenDoorRef={current:()=>{starts++;pending=f.run();return pending;}};
  const effect=reportEffect(f.c);effect();await pending;
  assert.equal(f.c.liveRekenenRef.current,false);
  const before=effect.dependencies();
  f.c.fem.supports=[{nodeId:1,type:'fixed'}];
  f.c.rapportRekenPogingRef.current=false;f.c.rekenGeneratieRef.current++;
  if(effect.dependencies().some((value,i)=>!Object.is(value,before[i])))effect();
  await pending;assert.equal(starts,2,'effect moet ook op modelverandering luisteren');
});

test('pending live-timer wordt door handmatig rekenen geannuleerd',async()=>{
  const f=fixture('none',false);let cleared;
  f.c.window.clearTimeout=id=>{cleared=id;};f.c.herberekenTimerRef.current=17;
  f.c.herberekeningGeplandRef.current=true;
  await f.run();assert.equal(cleared,17);assert.equal(f.c.herberekeningGeplandRef.current,false);
});

test('late stabiliteitsmelding hoort niet bij een nieuw model',async()=>{
  const f=fixture('notify',false);
  Object.assign(f.c,{gemeldeStabiliteitRef:{current:null},bepaalAlphaCr:()=>[],
    stabiliteitsMeldingen:()=>[{niveau:'fout',tekst:'Stabiliteit'}]});
  const run=vm.runInContext(callback('bepaalStabiliteit'),vm.createContext(f.c));
  run({},new Map());await tick();f.c.rekenGeneratieRef.current++;
  const before=f.events.length;f.barrier.resolve();await tick();
  assert.equal(f.events.length,before,'geen oude toast');
});

test('late foutmelding van synchrone voorronde hoort niet bij nieuw model',async()=>{
  const f=fixture('notify',false);
  Object.assign(f.c,{gemeldeRekenfoutRef:{current:null},controleerVoorRekenen(){throw Error('Model ongeldig');}});
  const run=vm.runInContext(callback('computeAndStoreSolverOutputs'),vm.createContext(f.c));
  assert.equal(run(),null);await tick();f.c.rekenGeneratieRef.current++;
  const before=f.events.length;f.barrier.resolve();await tick();
  assert.equal(f.events.length,before,'geen oude fouttoast');
});

for (const initiallyOpen of [true,false]) test(`sluiten toetsing herstelt eigenschappen alleen indien eerder open=${initiallyOpen}`,()=>{
  const state={activeView:'default',open:initiallyOpen};
  const c={paneelDoorAppIngeklapt:{current:false},setCheckFocus(){},setActiveView:v=>{state.activeView=v;},
    setRightPanelOpen:v=>{state.open=typeof v==='function'?v(state.open):v;}};
  Object.defineProperty(c,'activeView',{get:()=>state.activeView});
  const context=vm.createContext(c);
  vm.runInContext(callback('handleOpenCheckForBeam'),context)();
  assert.equal(state.open,false);assert.equal(state.activeView,'check');
  let restore,close;
  function visit(n){
    if(ts.isCallExpression(n) && n.expression.getText(ast)==='useEffect' &&
      n.arguments[0]?.getText(ast).includes('if (!paneelDoorAppIngeklapt.current)')) restore=n.arguments[0];
    if(ts.isJsxSelfClosingElement(n) && n.tagName.getText(ast)==='CheckPanel')
      close=n.attributes.properties.find(p=>p.name?.getText(ast)==='onClose')?.initializer?.expression;
    ts.forEachChild(n,visit);
  }
  visit(ast);assert.ok(close);assert.ok(restore);
  for(const fn of [close,restore])vm.runInContext(ts.transpile(`(${fn.getText(ast)})`,{target:ts.ScriptTarget.ES2022}),context)();
  assert.equal(state.activeView,'default');assert.equal(state.open,initiallyOpen);
});
