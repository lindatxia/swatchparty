export const people = ['Etreta','Hanna','Jackie','Michelle','Nicole'];
export const colors = {
  'Sea Moss':'#839277','Dusty Sage':'#a2a88d',Juniper:'#536c54',Olive:'#667343',
  'Willow Green':'#bac1a0','Garden Sage':'#8e9872',Matcha:'#959b66',Pistachio:'#b5ba8c',
  'Moss Green':'#626c4e','Bright Olive':'#81884a','Vintage Mauve':'#a47787',
  Amethyst:'#80617d',Wisteria:'#aa99b2',Sangria:'#623647','Chocolate Plum':'#503741',
  'Dusty Rose':'#bd8c8d','English Rose':'#cdabae','Blushing Pink':'#ddbbba',Rosette:'#af777c',
  'Desert Rose':'#a9726e','Vintage Rose':'#9e6669',Ganache:'#6d4a43',Espresso:'#49362f'
};
export const palettes = {
  'All Mauve':['Dusty Rose','English Rose','Blushing Pink','Vintage Mauve','Amethyst','Wisteria','Sangria','Chocolate Plum'],
  'Mauve + Brown':['Dusty Rose','Vintage Mauve','Amethyst','Desert Rose','Chocolate Plum','Ganache','Espresso'],
  'Garden Mix':Object.keys(colors)
};
const product = '/products/';
const url = path => 'https://www.azazie.com'+product+'azazie-'+path;
export const catalog = [
  {style:'Velma',color:'Ganache',variantGroup:'velma',url:url('velma-ganache-a-line-side-slit-chiffon-floor-length-bridesmaid-dress/89722501'),photo:'/velma-ganache.jpg'},
  {style:'Alexia',color:'Sea Moss',variantGroup:'alexia-chiffon',url:url('alexia-sea-moss-a-line-ruched-chiffon-floor-length-bridesmaid-dress/120694489'),photo:'/alexia-sea-moss.jpg'},
  {style:'Gabriela',color:'Dusty Rose',variantGroup:'gabriela-chiffon',url:url('gabriela-dusty-rose-a-line-corset-chiffon-floor-length-bridesmaid-dress/113355548'),photo:'/gabriela-chiffon-dusty-rose.jpg'},
  {style:'Mona',color:'Vintage Mauve',url:url('mona-vintage-mauve-a-line-corset-stretch-satin-floor-length-bridesmaid-dress/126021134'),photo:'/mona-vintage-mauve.jpg'},
  {style:'Avenelle',color:'Vintage Mauve',usListing:false,url:url('avenelle-vintage-mauve-a-line-corset-stretch-satin-floor-length-bridesmaid-dress/114949292'),photo:'/avenelle-vintage-mauve.jpg'},
  {style:'Gabriela',color:'Desert Rose',url:url('gabriela-desert-rose-a-line-corset-stretch-satin-floor-length-bridesmaid-dress/132199419'),photo:'/gabriela-satin-desert-rose.jpg'},
  {style:'Juniper',color:'Juniper',variantGroup:'juniper',url:url('juniper-juniper-mermaid-one-shoulder-stretch-satin-floor-length-bridesmaid-dress/98005547'),photo:'/juniper-juniper.jpg'},
  {style:'Gabriela',color:'Willow Green',variantGroup:'gabriela-chiffon',url:url('gabriela-willow-green-a-line-corset-chiffon-floor-length-bridesmaid-dress/113355458'),photo:'/gabriela-chiffon-willow-green.jpg'},
  {style:'Velma',color:'Sea Moss',variantGroup:'velma',url:url('velma-sea-moss-a-line-side-slit-chiffon-floor-length-bridesmaid-dress/64697070'),photo:'/velma-sea-moss.jpg'},
  {style:'Juniper',color:'Olive',variantGroup:'juniper',url:url('juniper-olive-mermaid-one-shoulder-stretch-satin-floor-length-bridesmaid-dress/98005557'),photo:'/juniper-olive.jpg'},
  {style:'Juniper',color:'Amethyst',variantGroup:'juniper',url:url('juniper-amethyst-mermaid-one-shoulder-stretch-satin-floor-length-bridesmaid-dress/98005516'),photo:'/juniper-amethyst.jpg'},
  {style:'Alexia',color:'Olive',variantGroup:'alexia-chiffon',url:url('alexia-olive-a-line-ruched-chiffon-floor-length-bridesmaid-dress/120694473'),photo:'/alexia-olive.jpg'},
  {style:'Isonelle',color:'Vintage Rose',url:'https://www.azazie.com/products/isonelle-vintage-rose-maxi-dress-atelier-dress/115179469?subsite=atelier',photo:'/isonelle-vintage-rose.jpg'},
  {style:'Velma',color:'Amethyst',variantGroup:'velma',url:url('velma-amethyst-a-line-side-slit-chiffon-floor-length-bridesmaid-dress/240142'),photo:'/velma-amethyst.jpg'}
];
export function productURL(input) {
  try {
    const parsed = new URL(input);
    if (parsed.protocol==='https:' && ['azazie.com','www.azazie.com'].includes(parsed.hostname) &&
        !parsed.username && !parsed.password && !parsed.port &&
        /^\/products\/[\w-]+(?:\/\d+)?\/?$/.test(parsed.pathname)) return parsed;
  } catch {}
  return null;
}
const slug = name => name.toLowerCase().trim().replace(/[\s_]+/g,'-');
export function readProduct(input) {
  const parsed=productURL(input);
  if(!parsed)return null;
  const [, , path, id]=parsed.pathname.split('/');
  const query=parsed.searchParams.get('color');
  const size=parsed.searchParams.get('size')?.toUpperCase() ?? '';
  const prefix=path.replace(/^azazie-/,'').split(/-(?:a-line|mermaid|sheath|ball-gown|trumpet|bridesmaid-dress|maxi-dress|midi-dress|mini-dress)(?:-|$)/)[0];
  const pathColor=Object.keys(colors).sort((a,b)=>b.length-a.length).find(name=>prefix.endsWith('-'+slug(name)));
  const color=query ? Object.keys(colors).find(name=>slug(name)===slug(query)) : pathColor;
  const match=catalog.find(item=>id && new URL(item.url).pathname.split('/').at(-1)===id && item.color===color);
  const stylePrefix=pathColor?prefix.slice(0,-slug(pathColor).length-1):prefix;
  const styleKey=pathColor?stylePrefix+path.replace(/^azazie-/,'').slice(prefix.length):'';
  const style=match?.style ?? stylePrefix.split('-').filter(Boolean).map(word=>word[0].toUpperCase()+word.slice(1)).join(' ');
  return {style,styleKey,color:color??'',size,photo:match?.photo??'',sourceColor:match?.sourceColor??color??'',url:parsed.href};
}
export function verifiedVariants(option) {
  if(!option)return [];
  const product=productURL(option.url);
  const base=catalog.find(item=>new URL(item.url).pathname===product?.pathname && item.style===option.style);
  if(!base)return [];
  return catalog.filter(item=>item.photo && item.style===base.style &&
    (item===base || base.variantGroup && item.variantGroup===base.variantGroup));
}
export function dressColorLink(option,input) {
  const base=readProduct(option.url);
  const other=readProduct(input);
  if(!base?.styleKey || base.styleKey!==other?.styleKey || !other.color)return null;
  const verified=verifiedVariants(option).find(item=>item.color===other.color);
  return {color:other.color,url:verified?.url??other.url,verified:!!verified};
}
export function exactPreview(option,color) {
  const exact=verifiedVariants(option).find(item=>item.color===color);
  const listing=exact && exact.usListing!==false ? new URL(exact.url) : null;
  if(listing){
    listing.searchParams.set('country','US');
    listing.searchParams.set('currency','USD');
    listing.searchParams.set('campaigncountry','US_EN');
  }
  return {
    photo:exact ? exact.photo.replace('.jpg','-cutout.webp') : '',
    link:listing?.href??''
  };
}
export function initialWorkspace() {
  const options = [
    [1,2],[1,3],[2,8],[2,1],[3,4],[3,5],[4,6]
  ].map(([person,index,color,photo],i)=>{
    const item=catalog[index];
    return {id:'pick-'+i,person,...item,color:color??item.color,photo:photo??(!color||color===item.color?item.photo:''),
      sourceColor:photo ? color : item.sourceColor??item.color,
      urlColor:item.color,size:''};
  });
  return {options, draft:{palette:'Garden Mix',backdrop:'',looks:people.map((_,person)=>{
    const option=options.find(item=>item.person===person);
    return option?{option:option.id,color:option.color}:null;
  })}, saved:[],finalId:null};
}
