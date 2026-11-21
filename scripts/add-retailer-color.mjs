import {execFileSync} from 'node:child_process';
import {copyFile, mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {catalog, colors, readProduct} from '../public/catalog.js';

import {retailerProduct,retailerPhotoURL,retailerNames,listingPhoto} from '../public/retailers.js';

const publicDir=fileURLToPath(new URL('../public/',import.meta.url));
const catalogPath=join(publicDir,'catalog.js');
const slug=value=>value.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
const run=(tool,args)=>execFileSync(tool,args,{encoding:'utf8',maxBuffer:4_000_000,stdio:['ignore','pipe','inherit']});

async function addColor(listing,imageURL,cutoutSource) {
  if(!listing){
    throw new Error('Usage: npm run add-color -- <dress URL> [official photo URL or -] [transparent PNG or WebP]');
  }
  const listingProduct=retailerProduct(listing);
  if(!listingProduct)throw new Error('Use a supported '+retailerNames+' product URL.');
  const {retailer,url}=listingProduct;
  const product=readProduct(listing);
  const details=retailer.parse(url,colors);
  if(!product.styleKey || !product.color || !retailer.canCatalog(url,details)){
    throw new Error('Use the exact product URL for this dress and shade.');
  }
  const matching=catalog.filter(item=>readProduct(item.url)?.styleKey===product.styleKey);
  if(matching.some(item=>item.color===product.color)){
    console.log(product.style+' in '+product.color+' is already in the catalog.');
    return;
  }
  const image=imageURL && imageURL!=='-'
    ? retailerPhotoURL(imageURL,retailer)
    : listingPhoto(run('curl',['--fail','--silent','--show-error','--max-time','15','--max-filesize','4000000',url.href]),retailer,details);
  if(!image)throw new Error('Use the official photo URL from that '+retailer.name+' listing.');
  const style=matching[0]?.style??product.style;
  const group=matching.find(item=>item.variantGroup)?.variantGroup??product.styleKey;
  const name=retailer.id+'-'+slug(retailer.catalogKey(url,details));
  const entry={style,color:product.color,variantGroup:group,url:product.url,photo:'/'+name+'.jpg'};
  const source=await readFile(catalogPath,'utf8');
  const end=source.indexOf('\n];\nexport function retailerName');
  if(end<0)throw new Error('Could not find the end of the catalog.');
  const singles=new Set(matching.filter(item=>!item.variantGroup).map(item=>item.photo));
  const entries=source.slice(0,end).split('\n').map(line=>{
    const photo=line.match(/photo:'([^']+)'/)?.[1]??line.match(/"photo":"([^"]+)"/)?.[1];
    if(!singles.has(photo))return line;
    singles.delete(photo);
    return line.replace(/}\s*,?$/,match=>',variantGroup:'+JSON.stringify(group)+match);
  });
  if(singles.size)throw new Error('Could not safely update the existing catalog variant group.');

  const temp=await mkdtemp(join(tmpdir(),'swatch-color-'));
  try {
    const downloaded=join(temp,'source');
    const original=join(temp,name+'.jpg');
    const mask=join(temp,'mask.png');
    const cutout=join(temp,name+'-cutout.webp');
    const cutter=join(temp,'cutout');

    let sourceURL;
    for(const candidate of new Set(retailer.photoCandidates(image))){
      try {
        run('curl',['--fail','--silent','--show-error','--max-time','20','--max-filesize','10000000','--output',downloaded,candidate]);
        const height=Number(run('magick',['identify','-ping','-format','%h',downloaded]));
        if(height>=750){
          sourceURL=candidate;
          break;
        }
      } catch {
        // Try the exact supplied CDN URL if the original is unavailable.
      }
    }
    if(!sourceURL)throw new Error('Could not download a full-size photo from the supplied retailer photo URL.');
    console.log('Downloaded '+sourceURL);
    run('magick',[downloaded,'-auto-orient','-colorspace','sRGB','-quality','95',original]);
    if(cutoutSource){
      await copyFile(cutoutSource,mask);
    } else {
      if(process.platform!=='darwin')throw new Error('Provide a transparent PNG or WebP on this platform.');
      run('clang',[fileURLToPath(new URL('./cutout.m',import.meta.url)),'-framework','Foundation','-framework','Vision','-framework','CoreImage','-framework','CoreGraphics','-o',cutter]);
      run(cutter,[original,mask]);
    }
    const alpha=run('magick',[mask,'-alpha','extract','-format','%[fx:minima] %[fx:maxima]','info:']).trim().split(/\s+/).map(Number);
    if(alpha.length!==2 || alpha[0]>0 || alpha[1]<0.5)throw new Error('The cutout needs both transparent and visible pixels.');
    const trim=cutoutSource?[]:['-channel','A','-morphology','Erode','Disk:2','+channel'];
    run('magick',[mask,...trim,'-trim','+repage','-define','webp:lossless=true',cutout]);
    await copyFile(original,join(publicDir,name+'.jpg'));
    await copyFile(cutout,join(publicDir,name+'-cutout.webp'));
    await writeFile(catalogPath,entries.join('\n')+',\n  '+JSON.stringify(entry)+source.slice(end));
    console.log('Added '+style+' in '+product.color+'. Review the cutout in public/'+name+'-cutout.webp before publishing.');
  } finally {
    await rm(temp,{recursive:true,force:true});
  }
}

try {
  await addColor(...process.argv.slice(2));
} catch(error) {
  console.error(error.message);
  process.exitCode=1;
}
