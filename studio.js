const families = {
  Green: {'Sea Moss':'#839277','Dusty Sage':'#a2a88d',Juniper:'#536c54',Olive:'#667343','Willow Green':'#bac1a0','Garden Sage':'#8e9872',Matcha:'#959b66',Pistachio:'#b5ba8c','Moss Green':'#626c4e','Bright Olive':'#81884a'},
  Mauve: {'Vintage Mauve':'#a47787',Amethyst:'#80617d',Wisteria:'#aa99b2',Sangria:'#623647','Chocolate Plum':'#503741'},
  'Dusty pink': {'Dusty Rose':'#bd8c8d','English Rose':'#cdabae','Blushing Pink':'#ddbbba',Rosette:'#af777c','Desert Rose':'#a9726e','Vintage Rose':'#9e6669'},
  Brown: {Ganache:'#6d4a43',Espresso:'#49362f','Chocolate Plum':'#503741',Sangria:'#623647','Desert Rose':'#a9726e'}
};
const colors = Object.assign({},...Object.values(families));
const all = Object.keys(families);
const people = [
  {name:'Etreta',styles:['Style undecided'], picks:[]},
  {name:'Hanna',styles:['Gabriela','Mona'],picks:[['Gabriela','Dusty Rose'],['Mona','Vintage Mauve']],photo:['hanna',343,148,161,504,'Dusty Rose',[[375,266],[413,276],[451,268],[443,312],[446,336],[463,390],[465,428],[480,525],[497,617],[465,625],[420,630],[385,639],[345,639],[355,578],[360,502],[363,410],[371,337]]]},
  {name:'Jacqueline',styles:['Velma','Alexia'],picks:[['Velma','Sea Moss'],['Alexia','Sea Moss']],photo:['jackie',550,138,173,522,'Sea Moss',[[609,250],[619,224],[633,239],[649,219],[646,237],[662,264],[671,306],[677,342],[687,375],[681,431],[692,478],[686,498],[697,542],[692,568],[705,602],[698,623],[701,641],[671,650],[565,640],[573,598],[580,531],[581,477],[573,466],[585,441],[584,360],[589,315],[585,315],[596,278]]]},
  {name:'Michelle',styles:['Avenelle','Gabriela'],picks:[['Avenelle','Vintage Mauve'],['Gabriela','Desert Rose']],photo:['michelle',740,145,221,510,'Vintage Mauve',[[807,267],[832,274],[855,265],[887,254],[893,283],[883,322],[891,353],[908,611],[911,631],[859,646],[796,638],[740,626],[740,571],[765,535],[787,480],[797,394],[805,344],[810,316]]]},
  {name:'Nicole',styles:['Juniper','Borrowed dress'],picks:[['Juniper','Juniper'],['Juniper','Amethyst'],['Juniper','Olive']],photo:['nicole',988,139,161,536,'Olive',[[1032,273],[1060,248],[1101,235],[1097,265],[1109,302],[1099,369],[1086,423],[1072,469],[1064,546],[1076,623],[1087,659],[1072,672],[999,672],[1002,617],[1010,528],[1008,457],[1018,391],[1037,328]]]}
];
const alternatePhotos = {
  Mona: ['mona',55,0,200,415,'Mulberry',[[108,91],[130,97],[166,88],[170,71],[174,70],[171,90],[179,133],[173,146],[174,161],[189,167],[195,177],[190,190],[188,202],[198,263],[218,327],[236,402],[216,408],[182,407],[160,399],[151,391],[130,401],[70,407],[76,365],[82,306],[88,252],[87,224],[93,193],[100,169],[107,144],[106,123]]],
  Alexia: ['alexia',56,0,185,415,'Mulberry',[[127,101],[148,96],[188,100],[192,108],[193,137],[201,148],[194,158],[185,155],[181,164],[185,181],[176,201],[180,218],[184,218],[187,191],[201,202],[198,222],[208,235],[204,242],[211,252],[206,258],[218,269],[212,284],[221,299],[220,308],[227,319],[224,330],[237,346],[236,355],[243,362],[238,382],[228,392],[209,399],[186,402],[141,403],[88,391],[94,349],[91,332],[95,315],[88,302],[95,290],[86,278],[91,267],[81,247],[89,233],[86,229],[98,220],[105,194],[108,213],[115,211],[119,193],[116,164],[112,159],[120,145],[124,138]]],
  'Gabriela satin': ['gabriela-satin',70,0,150,415,'Desert Rose',[[127,89],[148,95],[185,94],[186,111],[182,137],[186,150],[198,185],[203,365],[201,396],[185,400],[114,401],[98,393],[100,381],[91,378],[97,313],[106,245],[112,219],[124,221],[130,217],[128,204],[124,195],[120,167],[124,138],[121,115]]],
  'Borrowed dress': ['borrow',0,0,260,429,'Vintage Rose',[[59,111],[85,115],[124,110],[130,127],[126,163],[125,173],[141,209],[147,267],[149,429],[0,429],[0,338],[22,279],[42,240],[51,205],[62,173],[64,161],[61,135]]]
};
const referenceColors = {...colors, Mulberry:'#722541'};
const presets = [
  {name:'Their picks',families:['Green','Mauve','Dusty pink'],shades:[null,'Dusty Rose','Sea Moss','Vintage Mauve','Juniper'],note:'Four confirmed preferences, with room for Etreta’s pick.'},
  {name:'Tonal mauve',families:['Mauve','Dusty pink'],shades:['Chocolate Plum','Dusty Rose','Wisteria','Vintage Mauve','Amethyst'],note:'A light-to-deep range of dusty rose, mauve and plum.'},
  {name:'All greens',families:['Green'],shades:['Dusty Sage','Willow Green','Sea Moss','Garden Sage','Olive'],note:'Sage and Sea Moss soften the deeper olive.'},
  {name:'Green + rose',families:['Green','Dusty pink'],shades:['Dusty Rose','Dusty Rose','Sea Moss','Desert Rose','Olive'],styles:{3:'Gabriela'},note:'Rose repeats through the lineup, framed by two muted greens.'},
  {name:'All browns',families:['Brown'],shades:['Espresso','Desert Rose','Ganache','Desert Rose','Chocolate Plum'],styles:{3:'Gabriela'},note:'Desert Rose bridges the softer midtones and deeper browns.'},
  {name:'Garden mix',families:all,shades:['Ganache','Dusty Rose','Sea Moss','Vintage Mauve','Olive'],note:'Two greens anchor the softer roses and a single brown accent.'}
];
const get = id => document.getElementById(id);
const escape = s => s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
let selected, active, lineup;
function apply(index) {
  selected=index;
  const preset=presets[index];
  active=[...preset.families];
  lineup=people.map((person,i)=>({style:preset.styles?.[i] ?? person.styles[0],shade:preset.shades[i]}));
  render();
}
function available() {
  return [...new Set(active.flatMap(family=>Object.keys(families[family])))];
}
function button(container,label,pressed,action) {
  const el=document.createElement('button');
  el.textContent=label;el.setAttribute('aria-pressed',pressed);el.onclick=action;container.append(el);
}
function luminance(hex) {
  const [red, green, blue] = hex.slice(1).match(/../g).map(value=>parseInt(value,16));
  return .2126*red + .7152*green + .0722*blue;
}
function photoPreview(person, style, shade) {
  const photo=style===person.styles[0] ? person.photo :
    alternatePhotos[style==='Gabriela'?'Gabriela satin':style];
  if(!photo || !shade) {
    if(!shade)return '<span>Pick pending</span>';
    return '<div class="color-only"><span class="color-sample"></span><span>'+escape(shade)+'</span></div>';
  }
  const [name,x,y,width,height,original,points]=photo;
  const mask=points.map(([a,b])=>((a-x)/width*100).toFixed(1)+'% '+((b-y)/height*100).toFixed(1)+'%').join(',');
  const brightness=Math.min(2.9,Math.max(.45,luminance(colors[shade])/luminance(referenceColors[original])));
  const tint=shade===original?'':'<img class="dress-lightness" src="'+name+'.jpg" alt="" aria-hidden="true"><div class="tint" aria-hidden="true"></div>';
  return '<div class="photo" style="--ratio:'+width+'/'+height+';--brightness:'+brightness.toFixed(2)+';--mask:polygon('+mask+')"><img src="'+name+'.jpg" alt="'+style+' in '+escape(shade)+(shade===original?'':' (approximate color preview)')+'">'+tint+'</div>';
}
function render(focus) {
  const shades=available();
  get('presets').replaceChildren();
  presets.forEach((preset,i)=>button(get('presets'),preset.name,selected===i,()=>{apply(i);get('presets').children[i].focus()}));
  get('families').replaceChildren();
  all.forEach((family,i)=>button(get('families'),family,active.includes(family),()=>{
    if(active.length===1 && active.includes(family))return;
    active=active.includes(family)?active.filter(item=>item!==family):all.filter(item=>item===family||active.includes(item));
    const allowed=available();
    lineup=lineup.map((look,index)=>{
      if(!look.shade||allowed.includes(look.shade))return look;
      const match=people[index].picks.find(([style,shade])=>style===look.style&&allowed.includes(shade));
      return {...look,shade:match?.[1]??allowed[index%allowed.length]};
    });
    selected=null;
    render();
    get('families').children[i].focus();
  }));
  const chosen=lineup.filter(look=>look.shade);
  get('strip').innerHTML=chosen.map(({shade})=>'<i style="--shade:'+colors[shade]+'"></i>').join('');
  const matches=lineup.filter((look,i)=>people[i].picks.some(([style,shade])=>style===look.style&&shade===look.shade)).length;
  get('summary').textContent=(selected===null?'Custom lineup.':presets[selected].note)+' '+matches+' of 4 bridesmaids with submissions are in a stated pick.';
  get('lineup').innerHTML=people.map((person,i)=>{
    const {style,shade}=lineup[i];
    const rank=person.picks.findIndex(([cut,color])=>cut===style&&color===shade);
    let status='Color exploration';
    if(!shade)status='No preference recorded';
    else if(!person.picks.length)status='Suggested color · style pending';
    else if(style==='Borrowed dress')status='Interested in trying on';
    else if(rank>=0)status=i===4?'Stated Juniper color':rank===0?'First choice':'Second choice';
    const options=(items,value)=>items.map(item=>'<option'+(item===value?' selected':'')+'>'+escape(item)+'</option>').join('');
    return '<article class="card" style="--shade:'+(colors[shade]??'#d7d4c8')+'"><div class="preview">'+photoPreview(person,style,shade)+'</div><div class="card-content"><h3 class="person">'+person.name+'</h3><p class="status">'+(shade?'<span class="dot"></span>':'')+status+'</p><label>Style<select id="style-'+i+'" data-field="style" data-index="'+i+'" aria-label="'+person.name+' style">'+options(person.styles,style)+'</select></label><label>Color<select id="shade-'+i+'" data-field="shade" data-index="'+i+'" aria-label="'+person.name+' color">'+(!person.picks.length?'<option value="">Undecided</option>':'')+options(shades,shade)+'</select></label></div></article>';
  }).join('');
  if(focus)get(focus).focus();
}
get('lineup').addEventListener('change',event=>{
  const {field,index}=event.target.dataset;
  if(!field)return;
  lineup[index][field]=event.target.value||null;
  selected=null;
  render(event.target.id);
});
get('reset').onclick=()=>apply(0);

get('share').onclick=async ()=>{
  const url=new URL(location.href);
  url.hash='';
  url.searchParams.set('look',JSON.stringify({active,lineup}));
  const status=get('share-status');
  status.hidden=false;
  try {
    await navigator.clipboard.writeText(url.href);
    status.textContent='Lineup link copied.';
  } catch {
    status.textContent='Copy this lineup link ';
    const field=document.createElement('input');
    field.value=url.href;
    field.readOnly=true;
    field.setAttribute('aria-label','Lineup link');
    status.append(field);
    field.select();
  }
};
function restore() {
  try {
    const saved=JSON.parse(new URL(location.href).searchParams.get('look'));
    if(!saved || !Array.isArray(saved.active) || !saved.active.length || !saved.active.every(family=>all.includes(family)))return false;
    active=all.filter(family=>saved.active.includes(family));
    const shades=available();
    if(!Array.isArray(saved.lineup) || saved.lineup.length!==people.length ||
      !saved.lineup.every((look,i)=>look && people[i].styles.includes(look.style) &&
        (shades.includes(look.shade) || (i===0 && look.shade===null))))return false;
    lineup=saved.lineup;
    selected=null;
    render();
    return true;
  } catch {
    return false;
  }
}
if(!restore())apply(0);
