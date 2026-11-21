import test from 'node:test';
import assert from 'node:assert/strict';
import {catalog,dressColorLink,exactPreview,readProduct,initialWorkspace,swatchColor} from '../public/catalog.js';
import {listingPhoto,retailerProduct} from '../public/retailers.js';
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

test('the database keeps independent saved selections for each preset palette',async()=>{
  const before=await (await request()).json();
  const state=before.state;
  const garden={...state.draft,palette:'Garden Mix'};
  const mauve={...garden,palette:'All Mauve',looks:garden.looks.map(look=>look&&({...look,color:'Amethyst'}))};
  state.draft=mauve;
  state.paletteDrafts={'Garden Mix':garden,'All Mauve':mauve};
  assert.equal((await request('PUT',{version:before.version,state})).status,200);
  const stored=await (await request()).json();
  assert.deepEqual(stored.state.paletteDrafts['Garden Mix'],garden);
  assert.deepEqual(stored.state.paletteDrafts['All Mauve'],mauve);
  state.paletteDrafts['Garden Mix']=mauve;
  assert.equal((await request('PUT',{version:stored.version,state})).status,400);
});

const birdy=(shade,fabric='chiffon')=>'https://www.birdygrey.com/products/violet-'+fabric+'-dress-'+shade;

test('isolates Birdy Grey styles by retailer and fabric and parses shade-specific listings',()=>{
  const mauve=birdy('dark-mauve');
  const info=readProduct(mauve);
  assert.equal(info.retailer,'birdy-grey');
  assert.equal(info.style,'Violet');
  assert.equal(info.fabric,'Chiffon');
  assert.equal(info.color,'Dark Mauve');
  assert.equal(readProduct(birdy('dark-mauve','stretch-satin')).fabric,'Stretch Satin');
  assert.equal(dressColorLink(info,birdy('olive')).color,'Olive');
  assert.equal(dressColorLink(info,birdy('olive','satin')),null);
  assert.equal(dressColorLink(info,catalog[0].url),null);
  assert.equal(readProduct(mauve.replace('birdygrey.com','birdygrey.com.example')),null);
  assert.equal(readProduct('https://www.birdygrey.com/products/swatch-chiffon-in-dusty-rose'),null);
  assert.notEqual(swatchColor(info,'Dusty Rose'),swatchColor(catalog[0],'Dusty Rose'));
});

test('verifies the photo metadata and retailer image origin',()=>{
  const reference=birdy('dark-mauve');
  const {retailer}=retailerProduct(reference);
  const photo='https://cdn.shopify.com/s/files/1/2053/3799/files/violet.webp';
  const markup=image=>'<meta property="og:title" content="Dark Mauve Violet Chiffon Bridesmaid Dress">'+
    '<meta property="og:image" content="'+image+'">';
  assert.equal(listingPhoto(markup(photo),retailer,readProduct(reference)).href,photo);
  assert.equal(listingPhoto(markup(photo.replace('/2053/', '/2054/')),retailer,readProduct(reference)),null);
  assert.equal(listingPhoto(markup(photo),retailer,readProduct(birdy('olive'))),null);
});

test('stores a Birdy Grey cutout by exact shade in a mixed lineup and saved snapshot',async()=>{
  const before=await (await request()).json();
  const state=structuredClone(before.state);
  const url=birdy('dark-mauve');
  const olive=birdy('olive');
  const bytes=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNgYAAAAAMAASsJTYQAAAAASUVORK5CYII=','base64');
  const uploaded=await handle(new Request('http://localhost/api/workspace?upload',{
    method:'POST',headers:{'x-workspace-key':key},body:bytes
  }));
  assert.equal(uploaded.status,201);
  const {photo}=await uploaded.json();
  const option={id:'birdy-violet',person:0,style:'Violet',color:'Dark Mauve',size:'',url,urlColor:'Dark Mauve',
    sourceColor:'',photo:'',colorLinks:[{color:'Olive',url:olive}],cutouts:[{color:'Dark Mauve',url,photo}]};
  state.options.push(option);
  state.draft.looks[0]={option:option.id,color:option.color};
  state.saved.push({id:'mixed-lineup',name:'Mixed lineup',options:[option,catalogOption(state)],draft:{
    ...state.draft,looks:state.draft.looks.map((look,index)=>index<=1?look:null)
  }});
  assert.equal((await request('PUT',{version:before.version,state})).status,200);
  const stored=(await (await request()).json()).state;
  const live=stored.options.find(item=>item.id===option.id);
  assert.deepEqual(exactPreview(live,'Dark Mauve'),{photo,link:url});
  assert.deepEqual(exactPreview(live,'Olive'),{photo:'',link:olive});
  assert.equal(exactPreview(stored.saved.at(-1).options[0],'Dark Mauve').photo,photo);
  const asset=await request('GET',undefined,'?asset='+photo.slice(6));
  assert.deepEqual(Buffer.from(await asset.arrayBuffer()),bytes);
  live.cutouts[0].url=birdy('dark-mauve','satin');
  assert.equal(validState(stored),false);
});

function catalogOption(state) {
  return state.options.find(item=>item.id===state.draft.looks[1].option);
}
