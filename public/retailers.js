const slug = value => value.toLowerCase().trim().replace(/[\s_]+/g,'-');
const title = value => value.split('-').filter(Boolean).map(word=>word[0].toUpperCase()+word.slice(1)).join(' ');
const productPath = /^\/products\/[\w-]+(?:\/\d+)?\/?$/;
const birdyFabrics = /^(.+?)-(chiffon|stretch-satin|matte-satin|satin|crepe|mesh|velvet|lace|tulle|jacquard)-dress-([a-z0-9]+(?:-[a-z0-9]+)*)$/;
const birdySwatches = {
  'Dark Mauve':'#9a666d', 'Dusty Rose':'#bf888b', Olive:'#73764d',
  'Dove Gray':'#a4a4a8', 'Sage':'#a7ac89', 'Champagne':'#d4bba8'
};

export const azazie = {
  id:'azazie', name:'Azazie', legacyCatalogGroups:true, fixedSwatches:true, hosts:['azazie.com','www.azazie.com'],
  accepts:path=>productPath.test(path),
  parse(url,colors) {
    const [, , path, id]=url.pathname.split('/');
    const size=url.searchParams.get('size')?.toUpperCase()??'';
    const query=url.searchParams.get('color');
    const prefix=path.replace(/^azazie-/,'').split(/-(?:a-line|mermaid|sheath|ball-gown|trumpet|bridesmaid-dress|maxi-dress|midi-dress|mini-dress)(?:-|$)/)[0];
    const pathColor=Object.keys(colors).sort((a,b)=>b.length-a.length).find(name=>prefix.endsWith('-'+slug(name)));
    const color=query ? Object.keys(colors).find(name=>slug(name)===slug(query)) : pathColor;
    const stylePrefix=pathColor?prefix.slice(0,-slug(pathColor).length-1):prefix;
    const styleKey=pathColor?stylePrefix+path.replace(/^azazie-/,'').slice(prefix.length):'';
    return {style:title(stylePrefix),styleKey,color:color??'',size,productId:id,pathColor};
  },
  catalogKey(url,details) {
    return details.productId??'';
  },
  canCatalog(url,details) {
    return !!details.productId && details.pathColor===details.color;
  },
  listing(url) {
    url.searchParams.set('country','US');
    url.searchParams.set('currency','USD');
    url.searchParams.set('campaigncountry','US_EN');
    return url;
  },
  photoURL(url) {
    return /^cdn-\d+\.azazie\.com$/.test(url.hostname) && /^\/upimg\/[a-zA-Z0-9/._-]+$/.test(url.pathname);
  },
  photoCandidates(url) {
    const origin=new URL(url);
    origin.pathname=url.pathname.replace(/^\/upimg\/[^/]+\//,'/upimg/origin/');
    return [origin.href,url.href];
  }
};
const birdyGrey = {
  id:'birdy-grey', name:'Birdy Grey', hosts:['birdygrey.com','www.birdygrey.com'],
  accepts:path=>/^\/products\/[a-z0-9-]+\/?$/.test(path) && birdyFabrics.test(path.split('/')[2]),
  parse(url) {
    const [,style,fabric,shade]=birdyFabrics.exec(url.pathname.split('/')[2]);
    const color=title(shade);
    return {style:title(style),styleKey:style+'-'+fabric,fabric:title(fabric),color:color.length<=80?color:'',size:''};
  },
  catalogKey:url=>url.pathname.split('/')[2],
  canCatalog:()=>true,
  listing:url=>url,
  swatch:color=>Object.hasOwn(birdySwatches,color)?birdySwatches[color]:'#b8acb0',
  photoURL(url) {
    return url.hostname==='cdn.shopify.com' && /^\/s\/files\/1\/2053\/3799\/(?:files|products)\/[a-zA-Z0-9/._%-]+$/.test(url.pathname);
  },
  photoCandidates:url=>[url.href]
};

const retailers=[azazie,birdyGrey];
export const retailerNames=retailers.map(retailer=>retailer.name).join(' or ');
function httpsURL(input) {
  try {
    const url=new URL(input);
    if(url.protocol==='https:' && !url.username && !url.password && !url.port)return url;
  } catch {}
  return null;
}
export function retailerProduct(input) {
  const url=httpsURL(input);
  const retailer=url&&retailers.find(item=>item.hosts.includes(url.hostname) && item.accepts(url.pathname));
  return retailer?{retailer,url}:null;
}
export function retailerPhotoURL(input,retailer) {
  const url=httpsURL(input);
  return url&&retailer.photoURL(url)?url:null;
}
export function listingPhoto(markup,retailer,details) {
  const tags=markup.match(/<meta\b[^>]*>/gi)??[];
  const meta=name=>{
    const tag=tags.find(tag=>new RegExp('(?:property|name)=["\']'+name+'["\']','i').test(tag));
    return tag?.match(/content=["']([^"']+)["']/i)?.[1]??'';
  };
  const normalize=value=>value.toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
  const title=' '+normalize(meta('og:title')+' '+meta('og:description'))+' ';
  const expected=[details.style,details.color,...(details.fabric?[details.fabric]:[])];
  if(!expected.every(value=>value && title.includes(' '+normalize(value)+' ')))return null;
  return retailerPhotoURL(meta('og:image').replaceAll('&amp;','&'),retailer);
}
