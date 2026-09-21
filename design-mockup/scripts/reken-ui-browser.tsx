import React from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';
import FemCanvas from '../src/components/fem/FemCanvas';
import CheckPanel, { CheckPanelToggle } from '../src/components/panels/CheckPanel';
import Ribbon from '../src/components/ribbon/Ribbon';
import { solveAllCases, zetSolverLogOpvanger } from '../src/components/fem/solver/engine';
import { bouwMultiInput } from '../src/lib/modelNaarSolverInput';
import { combineResults, computeEnvelope } from '../src/components/fem/solver/combinations';
import { useCheckStore } from '../src/stores/checkStore';
import '../src/themes.css';
import '../src/App.css';
import nl from '../src/i18n/locales/nl/common.json';
import nlCheck from '../src/i18n/locales/nl/check.json';
import nlRibbon from '../src/i18n/locales/nl/ribbon.json';
import en from '../src/i18n/locales/en/common.json';
import de from '../src/i18n/locales/de/common.json';
import fr from '../src/i18n/locales/fr/common.json';
import enCheck from '../src/i18n/locales/en/check.json';
import deCheck from '../src/i18n/locales/de/check.json';
import frCheck from '../src/i18n/locales/fr/check.json';

const box=document.getElementById('root')!;
box.style.cssText='width:800px;height:560px';
let root=createRoot(box);
const tests:string[]=[], errors:string[]=[];
function ok(value:unknown,message:string):asserts value { if(!value) throw Error(message); }
function test(name:string,fn:()=>void) { try{fn();tests.push(name);}catch(e){errors.push(`${name}: ${e}`);} }
function mount(element:React.ReactNode){flushSync(()=>root.render(element));}
const noop=()=>{};
const model:any={nodes:[{id:1,x:0,z:0},{id:2,x:6000,z:0}],beams:[{id:1,from:1,to:2,material:'C30/37',profile:'400x600'}],
 supports:[{nodeId:1,type:'pinned'},{nodeId:2,type:'zRoller'}],plates:[],
 loads:[{id:1,type:'lineLoad',beamId:1,q:-10,caseId:1}],
 loadCases:[{id:1,name:'Permanent (G)',type:'dead'},{id:4,name:'Wind (W)',type:'wind'}],
 selfWeightEnabled:false,scheefstandEnabled:false,scheefstandNoemer:200,scheefstandRichting:1};
let calls=0;
const calculate=(m=model)=>{calls++; return solveAllCases(bouwMultiInput(m)).perCase;};
const combo:any={id:11,name:'UGT G',type:'uls',factors:new Map([[1,1.35]])};
const canvas=(extra:any={})=><FemCanvas {...({tool:'select',...model,selection:null,activeLoadCaseId:1,activeLoadCaseName:'Permanent (G)',
 setSelection:noop,addNode:noop,addBeam:noop,addSupport:noop,addLoad:noop,deleteSelected:noop,updateNode:noop,
 grid:{spacingMm:1000,show:false,showLines:false},combinations:[combo],displayFlags:{M:true,V:false,N:false,deflection:false,reactions:false,uc:true},...extra} as any)}/>;
const banner=()=>box.querySelector('.fem-hud-tc')?.textContent??'';
const paths=()=>[...box.querySelectorAll('.fem-diagram-line')].map(el=>el.getAttribute('points')).join('');
let logs=0;
zetSolverLogOpvanger(()=>{logs++;});

async function run(){
 await i18next.use(initReactI18next).init({lng:'nl',fallbackLng:'nl',defaultNS:'common',resources:{nl:{common:nl,check:nlCheck,ribbon:nlRibbon},en:{common:en,check:enCheck},de:{common:de,check:deCheck},fr:{common:fr,check:frCheck}},interpolation:{escapeValue:false}});
 document.documentElement.dataset.theme='openaec';
 const perCase=calculate();
 test('actueel centraal G-resultaat zonder canvasberekening',()=>{
   mount(canvas({perCase}));ok(banner().includes(perCase.get(1)!.maxDisplacement.toFixed(2)),banner());
 });
 test('leeg Wind is geen solverfout en UC heeft combinatieherkomst',()=>{
   mount(canvas({perCase,activeLoadCaseId:4,activeLoadCaseName:'Wind (W)'}));
   ok(banner().includes('Wind (W)') && /geen werkzame belasting/i.test(banner()),banner());
   ok(/combinaties/i.test(box.textContent??''),'combinatieherkomst ontbreekt');
   ok(!box.textContent?.includes('No loads applied'),'geen valse solverfout');
 });
 test('geval terugkiezen herstelt bestaande uitslag zonder solve',()=>{
   const before=logs;mount(canvas({perCase}));ok(banner().includes(perCase.get(1)!.maxDisplacement.toFixed(2)),banner());ok(logs===before,'extra solveractiviteit');
 });
 test('opleggingen wijzigen wist en vervangt echt krachtbeeld',()=>{
   mount(canvas({perCase}));const first=paths();ok(first,'geen krachtendiagram');
   const changed={...model,supports:model.supports.map((s:any)=>({...s,type:'fixed'}))};
   mount(canvas({...changed,perCase:null}));ok(!banner().includes('max'),'oud resultaat zichtbaar');
   const fresh=calculate(changed);mount(canvas({...changed,perCase:fresh}));
   ok(banner().includes(fresh.get(1)!.maxDisplacement.toFixed(2)),banner());
   ok(paths()!==first,'krachtbeeld ongewijzigd');
   const m=fresh.get(1)!.elements.get(1)!.bendingMoment[10];ok(Math.abs(Math.abs(m)-15e6)<1,'vaste opleggingen geven 15 kNm in het midden');
 });
 test('eigen gewicht zonder handlast gebruikt centraal resultaat',()=>{
   const own=calculate({...model,loads:[],selfWeightEnabled:true});mount(canvas({loads:[],perCase:own}));
   ok(own.has(1) && banner().includes(own.get(1)!.maxDisplacement.toFixed(2)),banner());
 });
 test('combinatie en omhullende blijven selecteerbaar',()=>{
   const combinations=new Map([[11,combineResults(combo,perCase)]]);
   mount(canvas({perCase,combinationResults:combinations,activeCombinationId:11}));ok(banner().includes('UGT G'),banner());
   mount(canvas({perCase,envelopeView:true,envelope:computeEnvelope([combo],perCase)}));ok(/omhullende|enveloppe|maatgevend/i.test(banner()),banner());
 });
 test('busy en echte fout worden niet als leeg geval gemeld',()=>{
   mount(canvas({perCase:null,solverBusy:true}));ok(/bereken/i.test(banner()),banner());
   mount(canvas({perCase:null,solveError:'Singuliere matrix'}));ok(banner().includes('Singuliere matrix'),banner());
 });
 test('toetsingpaneel sluit via toegankelijke X en rekent via callback',()=>{
   let closed=0,ran=0;mount(<CheckPanel {...({onClose:()=>closed++,onRun:()=>ran++} as any)}/>);
   const close=box.querySelector<HTMLButtonElement>('.cp-close-btn');ok(close?.getAttribute('aria-label'),'sluitknop ontbreekt');
   flushSync(()=>close.click());ok(closed===1,'sluitcallback');
   flushSync(()=>box.querySelector<HTMLButtonElement>('.cp-run-btn')!.click());ok(ran===1,'run callback');
 });
 test('fysische ronde blokkeert toetsknop al vóór checkStore.run',()=>{
   mount(<CheckPanel {...({onRun:noop,running:true} as any)}/>);ok(box.querySelector<HTMLButtonElement>('.cp-run-btn')!.disabled,'run nog actief');
 });
 test('ribbon heeft geen Toetsingtab; check-view blijft open',()=>{
   let view='check';mount(<Ribbon activeView={view} onViewChange={v=>view=v}/>);
   ok(![...box.querySelectorAll('.ribbon-tab')].some(el=>el.textContent==='Toetsing'),'Toetsingtab bestaat nog');ok(view==='check','ribbon sluit paneel');
 });
 for(const lang of ['nl','en','de','fr']) {
   await i18next.changeLanguage(lang);
   test(`${lang}: eigenschappenknop en toetsbar bij 240px zonder clipping`,()=>{
     box.style.width='240px';
     let toggled=0;
     mount(<CheckPanelToggle open={false} onToggle={()=>toggled++}/>);
     const toggle=box.querySelector<HTMLButtonElement>('.properties-check-toggle')!;
     ok(toggle.textContent?.includes(i18next.t('checkPanelControls.open')),'knop vertaald');
     flushSync(()=>toggle.click());ok(toggled===1,'toggle callback');
     useCheckStore.setState({results:[{beam_id:1,profile_name:'HEA 160',steel_grade:'S235',classification:'Class1',uc_max:.7,status:'Ok',checks:[],governing_check_id:'bending'} as any],lastRunAt:Date.now()});
     mount(<CheckPanel onRun={noop} onExport={noop} onClose={noop}/>);
     const toolbar=box.querySelector<HTMLElement>('.cp-toolbar')!;
     ok(toolbar.scrollWidth<=toolbar.clientWidth+1,`toolbar ${toolbar.scrollWidth}>${toolbar.clientWidth}`);
     const edge=box.getBoundingClientRect();
     for(const button of toolbar.querySelectorAll('button')) {
       const r=button.getBoundingClientRect();ok(r.left>=edge.left && r.right<=edge.right+1,'knop buiten paneel');
     }
     ok(box.querySelector('.check-panel')!.getBoundingClientRect().height===560,'werkruimtehoogte gewijzigd');
     useCheckStore.getState().clear();
   });
   test(`${lang}: lege-gevalmelding past in smal canvas`,()=>{
     mount(canvas({perCase,activeLoadCaseId:4,activeLoadCaseName:'Wind (W)'}));
     const edge=box.getBoundingClientRect(), r=box.querySelector('.fem-hud-tc')!.getBoundingClientRect();
     ok(r.left>=edge.left-1 && r.right<=edge.right+1,`melding buiten canvas: ${r.left}..${r.right}, ${edge.left}..${edge.right}`);
   });
 }
 test('geen oude UC bij invalidatie of lopende nieuwe rekengang',()=>{
   useCheckStore.setState({results:[{beam_id:1,uc_max:.97,governing_check_id:'bending'} as any]});
   mount(canvas({perCase}));ok(box.querySelector('.fem-uc-badge'),'actuele badge ontbreekt');
   mount(canvas({perCase:null,solverBusy:true}));ok(!box.querySelector('.fem-uc-badge'),'oude badge nog zichtbaar');
   useCheckStore.getState().clear();
 });
 flushSync(()=>root.unmount());
 document.getElementById('uitslag')!.textContent=JSON.stringify({tests,errors});
}
void run().catch(e=>document.getElementById('uitslag')!.textContent=JSON.stringify({tests,errors:[...errors,String(e)]}));
