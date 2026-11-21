import {createHash,randomUUID,timingSafeEqual} from 'node:crypto';
import {catalog,colors,palettes,people,readProduct,dressColorLink,verifiedVariants} from '../public/catalog.js';
import {azazie,retailerProduct,retailerPhotoURL,listingPhoto} from '../public/retailers.js';
import {openStore} from './store.js';

const imageTypes = ['image/jpeg','image/png','image/webp'];
const imageLimit = 3_000_000;
const seedPhotos = new Set([...catalog.map(item=>item.photo),'/jackie.jpg','/hanna.jpg','/mona.jpg','/michelle.jpg','/gabriela-satin.jpg','/nicole.jpg']);
const assetPattern = /^asset:[a-f0-9-]{36}$/;
const own = (object,key) => Object.hasOwn(object,key);
const string = (value,max) => typeof value==='string' && value.length<=max;
const idPattern = /^[a-zA-Z0-9-]{1,64}$/;
const validId = value => typeof value==='string' && idPattern.test(value);
const isPhoto = value => value==='' || seedPhotos.has(value) || typeof value==='string' && assetPattern.test(value);
const isBackdrop = value => value==='' || typeof value==='string' && assetPattern.test(value);
const colorLinkLimit=option=>retailerProduct(option.url)?.retailer.fixedSwatches?Object.keys(colors).length:100;
const isAsset = value => typeof value==='string' && assetPattern.test(value);
const isColor = (option,color) => string(color,80) && (retailerProduct(option.url)?.retailer.fixedSwatches
  ? own(colors,color)
  : readProduct(option.url)?.color===color || option.colorLinks?.some(item=>item.color===color) ||
    verifiedVariants(option).some(item=>item.color===color));
const validColorLinks=option=>option.colorLinks===undefined ||
  Array.isArray(option.colorLinks) && option.colorLinks.length<=colorLinkLimit(option) &&
  new Set(option.colorLinks.map(item=>item?.color)).size===option.colorLinks.length &&
  option.colorLinks.every(item=>item && string(item.url,1200) &&
    dressColorLink(option,item.url)?.color===item.color);
const validCutouts=option=>option.cutouts===undefined ||
  Array.isArray(option.cutouts) && option.cutouts.length<=100 &&
  new Set(option.cutouts.map(item=>item?.color)).size===option.cutouts.length &&
  option.cutouts.every(item=>item && isAsset(item.photo) && string(item.url,1200) &&
    dressColorLink(option,item.url)?.color===item.color && isColor(option,item.color));
const validOption = option => option && validId(option.id) && Number.isInteger(option.person) &&
  option.person>=0 && option.person<people.length && string(option.style,80) && option.style.trim() &&
  string(option.url,1200) && retailerProduct(option.url) && validColorLinks(option) &&
  isColor(option,option.color) && (option.lastColor===undefined || isColor(option,option.lastColor)) &&
  string(option.sourceColor,80) && isColor(option,option.urlColor) && string(option.size,24) &&
  isPhoto(option.photo) && validCutouts(option);
const validDraft = (draft,options) => draft && typeof draft.palette==='string' && own(palettes,draft.palette) && isBackdrop(draft.backdrop) &&
  Array.isArray(draft.looks) && draft.looks.length===people.length && draft.looks.every((look,index)=>
    look===null || look && options.some(option=>option.id===look.option && option.person===index && isColor(option,look.color)));
const validOptions = (options,limit) => Array.isArray(options) && options.length<=limit && options.every(validOption) &&
  new Set(options.map(item=>item.id)).size===options.length;
export function validState(state) {
  return !!(state && validOptions(state.options,100) && validDraft(state.draft,state.options) &&
    (state.paletteDrafts===undefined || state.paletteDrafts && typeof state.paletteDrafts==='object' &&
      !Array.isArray(state.paletteDrafts) && Object.entries(state.paletteDrafts).every(([palette,draft])=>
        draft?.palette===palette && validDraft(draft,state.options))) &&
    Array.isArray(state.saved) && state.saved.length<=50 && state.saved.every(item=>
      item && validId(item.id) && string(item.name,80) && item.name.trim() &&
      validOptions(item.options,people.length) && validDraft(item.draft,item.options)) &&
    new Set(state.saved.map(item=>item.id)).size===state.saved.length &&
    (state.finalId===null || state.saved.some(item=>item.id===state.finalId)));
}
const json = (data,status=200) => Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
const digest = value => createHash('sha256').update(value).digest();
let database;
async function boundedBytes(body,limit) {
  if(!body)throw new Error('Missing request body.');
  const chunks=[];
  let size=0;
  for await(const chunk of body) {
    size+=chunk.byteLength;
    if(size>limit)throw new Error('The upload is too large.');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}
function imageMime(bytes) {
  if(bytes.subarray(0,3).equals(Buffer.from([255,216,255])))return 'image/jpeg';
  if(bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))return 'image/png';
  if(bytes.toString('ascii',0,4)==='RIFF' && bytes.toString('ascii',8,12)==='WEBP')return 'image/webp';
  return '';
}
async function importImage(input) {
  let link=retailerPhotoURL(input.url,azazie);
  if(input.product===true) {
    const product=retailerProduct(input.url);
    if(!product || !string(input.color,40) || !string(input.style,80))return null;
    const page=await fetch(product.url,{redirect:'error',signal:AbortSignal.timeout(5000)});
    if(!page.ok)return null;
    const markup=(await boundedBytes(page.body,2_000_000)).toString('utf8');
    const {fabric}=product.retailer.parse(product.url,colors);
    link=listingPhoto(markup,product.retailer,{style:input.style,color:input.color,fabric});
  }
  if(!link)return null;
  const response=await fetch(link,{redirect:'error',signal:AbortSignal.timeout(8000)});
  if(!response.ok)return null;
  const bytes=await boundedBytes(response.body,imageLimit);
  const mime=imageMime(bytes);
  return mime?{bytes,mime}:null;
}
export async function handle(request) {
  const configured=process.env.SWATCH_WORKSPACE_KEY;
  if(!configured || configured.length<24)return json({error:'Set SWATCH_WORKSPACE_KEY on the server.'},503);
  const supplied=request.headers.get('x-workspace-key') ?? '';
  const url=new URL(request.url);
  if(!timingSafeEqual(digest(supplied),digest(configured)))return json({error:'Open your shared workspace link to continue.'},401);
  const id=digest(configured).toString('hex');
  try {
    database??=openStore().catch(error=>{database=undefined;throw error;});
    const store=await database;
    if(url.searchParams.has('asset') && request.method==='GET') {
      const key=url.searchParams.get('asset');
      const asset=validId(key) && await store.asset(id,key);
      return asset ? new Response(asset.bytes,{headers:{'Content-Type':asset.mime,'Cache-Control':'private, max-age=3600','X-Content-Type-Options':'nosniff'}}) : json({error:'Image missing.'},404);
    }
    if(url.searchParams.has('upload') && request.method==='POST') {
      try {
        const bytes=await boundedBytes(request.body,imageLimit);
        const mime=imageMime(bytes);
        if(!imageTypes.includes(mime))return json({error:'Use a JPEG, PNG, or WebP image.'},400);
        const key=randomUUID();
        await store.put(id,key,mime,bytes);
        return json({photo:'asset:'+key},201);
      } catch(error) {return json({error:error.message},400);}
    }
    if(url.searchParams.has('import') && request.method==='POST') {
      try {
        const input=JSON.parse(await boundedBytes(request.body,4096));
        const image=await importImage(input);
        if(!image)return json({error:'Couldn’t verify the catalog photo.'},422);
        const key=randomUUID();
        await store.put(id,key,image.mime,image.bytes);
        return json({photo:'asset:'+key},201);
      } catch {return json({error:'Couldn’t import that image. Try uploading the photo.'},422);}
    }
    if(url.searchParams.has('color') && request.method==='POST') {
      let payload;
      try {payload=JSON.parse(await boundedBytes(request.body,4096));}
      catch {return json({error:'Invalid color link.'},400);}
      const {optionId,url:link}=payload??{};
      if(!validId(optionId)||!string(link,1200))return json({error:'Invalid color link.'},400);
      for(let attempt=0;attempt<3;attempt++){
        const current=await store.read(id);
        const option=current.state.options.find(item=>item.id===optionId);
        if(!option)return json({error:'Save this dress to the lineup before adding another color.'},404);
        const variant=dressColorLink(option,link);
        if(!variant)return json({error:'Paste a link for this style and fabric in the new color.'},400);
        const links=option.colorLinks??[];
        if(links.some(item=>item.color===variant.color && item.url===variant.url))return json(current);
        if(links.length>=colorLinkLimit(option) && !links.some(item=>item.color===variant.color))return json({error:'This dress has reached its color limit.'},400);
        option.colorLinks=[...links.filter(item=>item.color!==variant.color),{color:variant.color,url:variant.url}];
        const result=await store.write(id,current.version,JSON.stringify(current.state),current.savedAt);
        if(result)return json(result);
      }
      return json({error:'The workspace is busy. Try adding the color again.'},409);
    }
    if(request.method==='GET')return json(await store.read(id));
    if(request.method==='PUT') {
      let payload;
      try {payload=JSON.parse(await boundedBytes(request.body,512_000));}
      catch {return json({error:'Invalid or oversized workspace update.'},400);}
      const {version,state}=payload??{};
      if(!Number.isInteger(version) || version<0 || !validState(state))return json({error:'Check the lineup and dress details.'},400);
      const result=await store.write(id,version,JSON.stringify(state),new Date().toISOString());
      return result ? json(result) : json({error:'The workspace changed on another device.',current:await store.read(id)},409);
    }
    return json({error:'Method unavailable.'},405);
  } catch(error) {
    console.error('Workspace storage error',error?.code ?? error?.name);
    return json({error:'The workspace is temporarily unavailable.'},503);
  }
}
