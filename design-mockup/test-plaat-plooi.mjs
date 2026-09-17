import assert from "node:assert/strict";
import { buildPlaatCheckInputs } from "./src/lib/plaatCheckBuilder.ts";
import { controleerVelden } from "./src/mcp/valideerModel.ts";
import { serializeProject, deserializeProject } from "./src/io/projectFile.ts";
import { withPlateDefaults } from "./src/components/fem/femTypes.ts";
import { parsePlooiLengthMm } from "./src/lib/plaatPlooi.ts";
import { readFileSync } from "node:fs";
import { solveAllCases } from "./src/components/fem/solver/engine.ts";
import { combineResults } from "./src/components/fem/solver/combinations.ts";

assert.equal(parsePlooiLengthMm("2000,5"),2000.5);
assert.equal(parsePlooiLengthMm("2000.5"),2000.5);
for (const bad of ["", "0", "-1", "NaN", "Infinity", "1.000,5", "2m"]) assert.equal(parsePlooiLengthMm(bad),null);
for (const language of ["nl","en","de","fr"]) {
  const locale=JSON.parse(readFileSync(new URL(`./src/i18n/locales/${language}/check.json`,import.meta.url),"utf8"));
  for (const key of ["buckling","bucklingA","bucklingB","bucklingSupports","bucklingSource","bucklingUnstiffened","bucklingUniform","bucklingScope"]) assert.ok(locale.props.plate[key]);
  const report=JSON.parse(readFileSync(new URL(`./src/i18n/locales/${language}/ribbon.json`,import.meta.url),"utf8"));
  assert.ok(report.report.plaatPlooiNoot);
}

const nodes=[{id:1,x:0,z:0},{id:2,x:2000,z:0},{id:3,x:2000,z:1000},{id:4,x:0,z:1000}];
const plooi={a_mm:2000,b_mm:1000,randvoorwaarden:"vierzijdig_scharnierend",steun_bron:"randdetail",onverstijfd:true,uniforme_spanning:true};
const plate={id:1,nodeIds:[1,2,3,4],materiaal:"S235",thickness:10,plooi};
const combinations=[{id:1,name:"UGT",type:"uls",factors:{1:1}},{id:2,name:"BGT",type:"sls",factors:{1:1}}];
const combinationResults=new Map([[1,{plateElements:[{plateId:1,expectedElementIds:[5],elements:[{elementId:5,sigmaX:-100,sigmaY:0,tauXY:50}]}]}]]);
const data={nodes,plates:[plate],combinations,combinationResults};
const build=(overrides={})=>buildPlaatCheckInputs({...data,...overrides}).inputs[0];
const model={nodes,beams:[],supports:[],plates:[plate],loads:[],loadCases:[{id:1,name:"Q",type:"live"}]};

assert.deepEqual(build().plooi,{...plooi,expected_element_ids:[5],rechthoek_zonder_openingen:true});
assert.deepEqual(build().combinations,[{combination_id:1,elements:[{element_id:5,sigma_x_mpa:-100,sigma_y_mpa:0,tau_xy_mpa:50}]}]);
assert.equal(build({plates:[{...plate,plooi:undefined}]}).plooi,undefined);
assert.equal(withPlateDefaults({...plate,plooi:undefined}).plooi,undefined);
assert.match(build({nodes:undefined}).plooi.geometrie_fout,/hoekknopen/);
assert.match(build({plates:[{...plate,plooi:{...plooi,a_mm:1000}}]}).plooi.geometrie_fout,/volledige plaat/);
assert.match(build({plates:[{...plate,openingen:[{id:1,punten:[]}]}]}).plooi.geometrie_fout,/openingen/);
assert.match(build({nodes:nodes.map(n=>n.id===3?{...n,x:1500}:n)}).plooi.geometrie_fout,/rechthoek/);
assert.match(build({plates:[{...plate,nodeIds:[1,3,2,4]}]}).plooi.geometrie_fout,/kruisende/);
assert.match(build({plates:[{...plate,E:200000}]}).plooi.geometrie_fout,/overschreven/);
assert.equal(build({combinationResults:new Map()}).combinations[0].elements.length,0);
assert.match(build({combinationResults:new Map([[1,{plateElements:[{plateId:1,elements:combinationResults.get(1).plateElements[0].elements}]}]])}).plooi.geometrie_fout,/mesh-elementset ontbreekt/);
const incomplete=new Map([[1,{plateElements:[{plateId:1,expectedElementIds:[5,6],elements:combinationResults.get(1).plateElements[0].elements}]}]]);
assert.deepEqual(build({combinationResults:incomplete}).plooi.expected_element_ids,[5,6]);
assert.equal(build({combinationResults:incomplete}).combinations[0].elements.length,1);
assert.deepEqual(build({combinations:[]}).combinations,[]);
assert.deepEqual(build({combinations:[combinations[1]]}).combinations,[]);
assert.deepEqual(controleerVelden(model),[]);
for(const [key,value,reason] of [
  ["a_mm",0,/a_mm/],["b_mm",NaN,/b_mm/],["a_m",2,/a_m/],
  ["randvoorwaarden","ingeklemd",/randvoorwaarden/],["steun_bron","",/steun_bron/],
  ["uniforme_spanning",false,/uniforme_spanning/],["onverstijfd",false,/onverstijfd/],
  ["uniforme_spanning","true",/uniforme_spanning/],
]) {
  assert.match(controleerVelden({...model,plates:[{...plate,plooi:{...plooi,[key]:value}}]}).join("\n"),reason);
}
assert.match(controleerVelden({...model,plates:[{...plate,plooi:null}]}).join("\n"),/object/);
assert.match(controleerVelden({...model,plates:[{...plate,materiaal:"C24"}]}).join("\n"),/alleen ondersteund voor staal/);
assert.match(controleerVelden({...model,plates:[{...plate,plooi:{...plooi,a_mm:1}}]}).join("\n"),/volledige plaat/);
const serialized=serializeProject({...model,activeLoadCaseId:1,selfWeightEnabled:false,nonlinearEnabled:false});
const roundtrip=deserializeProject(serialized);
assert.equal(roundtrip.version,2);
assert.deepEqual(roundtrip.plates[0].plooi,plooi);
const legacy=deserializeProject(serializeProject({...model,plates:[{...plate,plooi:undefined}],activeLoadCaseId:1,selfWeightEnabled:false,nonlinearEnabled:false}));
assert.equal(legacy.plates[0].plooi,undefined);

// Werkelijk raster: 2000/500 * 1000/500 = 8 quads. De onafhankelijke
// elementset moet ook blijven bestaan wanneer spanningsresultaten ontbreken.
const solved=solveAllCases({nodes,beams:[],plates:[{...plate,E:210000,nu:0.3,rho:7850,meshSize:500}],
  supports:[{nodeId:1,type:"pinned"},{nodeId:2,type:"pinned"}],
  cases:[{id:1,name:"G"},{id:2,name:"Q"}],loads:[],pointLoads:[],
  edgeLoads:[{plateId:1,edge:"top",p:-10,dir:"z",caseId:1},{plateId:1,edge:"top",p:-4,dir:"z",caseId:2}]});
const realPlate=solved.perCase.get(1).plateElements[0];
assert.equal(realPlate.expectedElementIds.length,8);
assert.deepEqual(realPlate.expectedElementIds,realPlate.elements.map(e=>e.elementId));
const combo={id:1,name:"UGT",type:"uls",factors:new Map([[1,1],[2,1]])};
const complete=combineResults(combo,solved.perCase);
assert.deepEqual(complete.plateElements[0].expectedElementIds,realPlate.expectedElementIds);
assert.deepEqual(build({combinationResults:new Map([[1,complete]])}).plooi.expected_element_ids,realPlate.expectedElementIds);
const damaged=structuredClone(solved.perCase);
for (const r of damaged.values()) r.plateElements[0].elements.pop();
assert.equal(damaged.get(1).plateElements[0].expectedElementIds.length,8);
const partial=combineResults(combo,damaged);
assert.deepEqual(partial.plateElements[0].expectedElementIds,[]);
assert.match(build({combinationResults:new Map([[1,partial]])}).plooi.geometrie_fout,/mesh-elementset ontbreekt/);
const single=build({combinationResults:new Map([[1,damaged.get(1)]])});
assert.equal(single.plooi.expected_element_ids.length,8);
assert.equal(single.combinations[0].elements.length,7);
const zero=combineResults({...combo,factors:new Map([[1,0]])},solved.perCase);
assert.deepEqual(zero.plateElements[0].expectedElementIds,realPlate.expectedElementIds);
assert.ok(zero.plateElements[0].elements.every(e=>e.sigmaX===0&&e.sigmaY===0&&e.tauXY===0));
console.log("Plaatplooi: builder, geometry, UGT coverage, strict validation and project roundtrip passed.");
