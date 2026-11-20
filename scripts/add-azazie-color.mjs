import {execFileSync} from 'node:child_process';
import {copyFile, mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {catalog, readProduct} from '../public/catalog.js';

const publicDir=fileURLToPath(new URL('../public/',import.meta.url));
const catalogPath=join(publicDir,'catalog.js');
const slug=value=>value.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
const run=(tool,args)=>execFileSync(tool,args,{encoding:'utf8',stdio:['ignore','pipe','inherit']});

async function addColor(listing,imageURL) {
  if(!listing || !imageURL)throw new Error('Usage: npm run add-color -- <Azazie listing URL> <official Azazie photo URL>');
  const productURL=new URL(listing);
  const product=readProduct(listing);
  const pathProduct=readProduct(productURL.origin+productURL.pathname);
  if(!product?.styleKey || !product.color || product.color!==pathProduct?.color || !/\/\d+$/.test(productURL.pathname)){
    throw new Error('Use the exact Azazie product URL with the shade and product ID in the path.');
  }
  const image=new URL(imageURL);
  if(image.protocol!=='https:' || !/^cdn-\d+\.azazie\.com$/.test(image.hostname) ||
     image.username || image.password || image.port || !/^\/upimg\/[a-z0-9/._-]+$/i.test(image.pathname)){
    throw new Error('Use the official CDN photo URL from that exact Azazie listing.');
  }

  const matching=catalog.filter(item=>readProduct(item.url)?.styleKey===product.styleKey);
  if(matching.some(item=>item.color===product.color)){
    console.log(product.style+' in '+product.color+' is already in the catalog.');
    return;
  }
  const style=matching[0]?.style??product.style;
  const group=matching.find(item=>item.variantGroup)?.variantGroup??product.styleKey;
  const name=slug(style)+'-'+slug(product.color)+'-'+productURL.pathname.split('/').at(-1);
  const entry={style,color:product.color,variantGroup:group,url:product.url,photo:'/'+name+'.jpg'};
  const source=await readFile(catalogPath,'utf8');
  const end=source.indexOf('\n];\nexport function productURL');
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
    run('curl',['--fail','--silent','--show-error','--max-time','20','--max-filesize','10000000','--output',downloaded,image.href]);
    const height=Number(run('magick',['identify','-ping','-format','%h',downloaded]));
    if(!(height>=750))throw new Error('Use a full-size photo from the listing, such as its main og:image URL.');
    run('magick',[downloaded,'-auto-orient','-colorspace','sRGB','-quality','95',original]);
    run('clang',[fileURLToPath(new URL('./cutout.m',import.meta.url)),'-framework','Foundation','-framework','Vision','-framework','CoreImage','-framework','CoreVideo','-framework','CoreGraphics','-o',cutter]);
    run(cutter,[original,mask]);
    run('magick',[mask,'-channel','A','-morphology','Erode','Disk:2','+channel','-trim','+repage','-define','webp:lossless=true',cutout]);
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
