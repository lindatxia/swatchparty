import test from 'node:test';
import assert from 'node:assert/strict';
import {catalog,dressColorLink,exactPreview,readProduct,initialWorkspace} from '../public/catalog.js';
import {handle,validState} from '../server/handler.js';

const key='local-integration-test-workspace-key';
process.env.SWATCH_WORKSPACE_KEY=key;
process.env.SWATCH_DB_FILE=':memory:';

const request=(method='GET',payload,query='',auth=key)=>handle(new Request('http://localhost/api/workspace'+query,{
  method,headers:{'x-workspace-key':auth},body:payload===undefined?undefined:JSON.stringify(payload)
}));

test('reads verified Azazie photos and honors query color',()=>{
  const parsed=readProduct('https://www.azazie.com/products/azazie-alexia-sea-moss-a-line-ruched-chiffon-floor-length-bridesmaid-dress/120694489?size=a4');
  assert.equal(parsed.photo,'/alexia-sea-moss.jpg');
  assert.equal(parsed.style,'Alexia');
  assert.equal(parsed.color,'Sea Moss');
  assert.equal(parsed.size,'A4');
  const other=readProduct(parsed.url+'&color=Ganache');
  assert.equal(other.color,'Ganache');
  assert.equal(other.photo,'');
  assert.equal(readProduct('https://azazie.com.example/products/azazie-velma'),null);
});

test('extracts the style and shade from a maxi dress listing',()=>{
  const item=readProduct('https://www.azazie.com/products/isonelle-vintage-rose-maxi-dress');
  assert.equal(item.style,'Isonelle');
  assert.equal(item.color,'Vintage Rose');
  assert.equal(item.photo,'');
});

test('shows only verified photos for the exact style, fabric, and shade',()=>{
  const chiffon=catalog.find(item=>item.variantGroup==='gabriela-chiffon' && item.color==='Dusty Rose');
  const satin=catalog.find(item=>item.style==='Gabriela' && item.color==='Desert Rose');
  assert.equal(exactPreview(chiffon,'Willow Green').photo,'/gabriela-chiffon-willow-green-cutout.webp');
  assert.equal(exactPreview(satin,'Willow Green').photo,'');
  assert.equal(exactPreview({...chiffon,photo:'/hanna.jpg',sourceColor:'Dusty Sage'},'Dusty Sage').photo,'');
  assert.equal(exactPreview({...chiffon,photo:'asset:sample',sourceColor:'Dusty Sage'},'Dusty Sage').photo,'');
});

test('adds links only for the same style and fabric',()=>{
  const velma=catalog.find(item=>item.style==='Velma' && item.color==='Ganache');
  const moss=catalog.find(item=>item.style==='Velma' && item.color==='Sea Moss');
  const otherFabric=catalog.find(item=>item.style==='Gabriela' && item.color==='Desert Rose');
  const chiffon=catalog.find(item=>item.style==='Gabriela' && item.color==='Dusty Rose');
  assert.deepEqual(dressColorLink(velma,moss.url),{color:'Sea Moss',url:moss.url,verified:true});
  assert.equal(dressColorLink(chiffon,otherFabric.url),null);
  const unverified=velma.url+'?color=olive';
  assert.deepEqual(dressColorLink(velma,unverified),{color:'Olive',url:unverified,verified:false});
  const workspace=initialWorkspace();
  const option=workspace.options.find(item=>item.style==='Velma');
  option.colorLinks=[{color:'Olive',url:unverified}];
  assert.equal(validState(workspace),true);
  option.colorLinks.push({color:'Olive',url:unverified});
  assert.equal(validState(workspace),false);
});
test('workspace gates reads and writes, persists submissions, and rejects stale edits',async()=>{
  assert.equal((await request('GET',undefined,'','wrong')).status,401);
  const original=await (await request()).json();
  assert.equal(original.version,0);
  assert.ok(validState(original.state));
  const data=structuredClone(original.state);
  const [first,second]=data.options;
  data.options.push({...first,id:'guest-one',person:0,size:'A4'},{...second,id:'guest-two',person:0,size:'A6'});
  data.draft.looks[0]={option:'guest-two',color:second.color};
  const saved=await request('PUT',{version:0,state:data});
  assert.equal(saved.status,200);
  assert.ok((await saved.json()).savedAt);
  const secondDevice=await (await request()).json();
  assert.equal(secondDevice.state.options.filter(item=>item.person===0).length,2);
  assert.equal(secondDevice.state.draft.looks[0].option,'guest-two');
  assert.equal((await request('PUT',{version:0,state:original.state})).status,409);
  const invalid=initialWorkspace();
  invalid.draft.looks[0]={option:'pick-0',color:'Sea Moss'};
  assert.equal((await request('PUT',{version:1,state:invalid})).status,400);
});

test('stores and serves images within the workspace',async()=>{
  const bytes=new Uint8Array([137,80,78,71,13,10,26,10]);
  const uploaded=await handle(new Request('http://localhost/api/workspace?upload',{
    method:'POST',headers:{'x-workspace-key':key},body:bytes
  }));
  assert.equal(uploaded.status,201);
  const {photo}=await uploaded.json();
  const path='?asset='+photo.slice(6);
  const result=await request('GET',undefined,path);
  assert.equal(result.headers.get('content-type'),'image/png');
  assert.deepEqual(new Uint8Array(await result.arrayBuffer()),bytes);
  assert.equal((await request('GET',undefined,path,'wrong')).status,401);
});

test('adding a color persists the link without saving the lineup',async()=>{
  const before=await (await request()).json();
  const option=before.state.options.find(item=>item.style==='Velma');
  const url=option.url+'?color=olive';
  const added=await request('POST',{optionId:option.id,url},'?color');
  assert.equal(added.status,200);
  const after=await (await request()).json();
  assert.equal(after.savedAt,before.savedAt);
  assert.equal(after.version,before.version+1);
  assert.deepEqual(after.state.draft,before.state.draft);
  assert.deepEqual(after.state.saved,before.state.saved);
  assert.deepEqual(after.state.options.find(item=>item.id===option.id).colorLinks,[{color:'Olive',url}]);
  const repeated=await (await request('POST',{optionId:option.id,url},'?color')).json();
  assert.equal(repeated.version,after.version);
});
