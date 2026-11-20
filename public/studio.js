import {catalog,colors,palettes,people,readProduct,exactPreview,verifiedVariants,dressColorLink,initialWorkspace} from './catalog.js';
import {downloadPDF} from './export.js';

const get=id=>document.getElementById(id);
const html=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const selectOptions=(items,selected)=>items.map(([value,label])=>'<option value="'+html(value)+'"'+(value===selected?' selected':'')+'>'+html(label)+'</option>').join('');
const fragment=new URLSearchParams(location.hash.slice(1));
const key=fragment.get('workspace')??sessionStorage.getItem('swatch-workspace')??'';
const firstLook=(options,person)=>options.find(option=>option.person===person);
const selectedOption=(options,look)=>options.find(option=>option.id===look?.option);
function dressGroup(option){
  const styleKey=readProduct(option.url)?.styleKey;
  return styleKey?JSON.stringify([option.person,option.style,styleKey,option.size.trim().toUpperCase()]):option.id;
}
const snapshotDress=({lastColor,...dress})=>dress;
const images=new Map();
const edits=[];
let server, state, saving=false, failed=false, viewed=null, dressPerson, dressId;
let catalogTag=null, checkingCatalog=false;
let toastTimer, editingSnapshot=null, activePalette, switchingPalette=false;

function hideToast() {
  clearTimeout(toastTimer);
  const toast=get('workspace-toast');
  toast.classList.remove('visible');
  get('toast-undo').hidden=true;
}
function showToast(message,undo) {
  const toast=get('workspace-toast');
  const action=get('toast-undo');
  const schedule=()=>{
    clearTimeout(toastTimer);
    toastTimer=setTimeout(hideToast,undo?6500:2800);
  };
  get('toast-message').textContent=message;
  action.hidden=!undo;
  action.onclick=undo?()=>{hideToast();undo();}:null;
  toast.onpointerenter=undo?()=>clearTimeout(toastTimer):null;
  toast.onpointerleave=undo?()=>{if(!toast.contains(document.activeElement))schedule();}:null;
  action.onfocus=undo?()=>clearTimeout(toastTimer):null;
  action.onblur=undo?schedule:null;
  toast.classList.add('visible');
  schedule();
}
function notice(text) {
  get('notice').textContent=text;
  get('notice').hidden=!text;
}
async function request(query='',options={}) {
  const response=await fetch('/api/workspace'+query,{
    ...options,headers:{'x-workspace-key':key,...options.headers}
  });
  if(!response.ok) {
    const detail=await response.json().catch(()=>({}));
    throw Object.assign(new Error(detail.error??'The request failed.'),{current:detail.current});
  }
  return response;
}
function visible() {
  return state.saved.find(item=>item.id===viewed)??{draft:state.draft,options:state.options};
}
function compatibleDraft(draft,options) {
  return {...draft,looks:draft.looks.map((look,person)=>
    options.some(item=>item.id===look?.option && item.person===person)?look:null)};
}
function refreshState() {
  state=structuredClone(server.state);
  if(activePalette && state.draft.palette!==activePalette){
    const saved=state.paletteDrafts?.[activePalette] ??
      state.saved.findLast(item=>item.draft.palette===activePalette)?.draft ?? initialWorkspace().draft;
    state.draft=compatibleDraft({...saved,palette:activePalette},state.options);
  }
  for(const edit of edits)edit(state);
}
function savedLabel(date,now) {
  if(now-date<60_000)return 'Last saved moments ago';
  const localDay=value=>Date.UTC(value.getFullYear(),value.getMonth(),value.getDate());
  const days=(localDay(now)-localDay(date))/86_400_000;
  if(days<=0)return 'Last saved today at '+date.toLocaleTimeString([],{hour:'numeric',minute:'2-digit'});
  return 'Last saved '+days+(days===1?' day ago':' days ago');
}
function warnUnsaved(event) {
  event.preventDefault();
  event.returnValue=true;
}
function showStatus() {
  const dirty=edits.length>0;
  const status=saving?'Saving...':failed?'Couldn’t save · Unsaved changes':dirty?'Unsaved changes':'';
  const last=server.savedAt;
  const time=get('saved-at');
  const label=get('save-status');
  if(label.textContent!==status)label.textContent=status;
  get('retry').hidden=!failed;
  time.parentElement.hidden=!!status||!last;
  get('saved-check').hidden=!last||!!status;
  if(last){
    time.dateTime=last;
    const text=savedLabel(new Date(last),new Date());
    if(time.textContent!==text)time.textContent=text;
  }
  get('save-current').classList.toggle('has-unsaved',dirty&&!saving);
  get('palette').disabled=saving||switchingPalette||addingColor;
  get('save-current').disabled=saving||addingColor||switchingPalette;
  get('save-lineup').disabled=saving||addingColor||switchingPalette;
  get('discard-lineup').disabled=saving||!dirty;
  if(dirty)window.addEventListener('beforeunload',warnUnsaved);
  else window.removeEventListener('beforeunload',warnUnsaved);
}
async function save(message='Lineup saved.') {
  if(saving||addingColor||switchingPalette||!edits.length)return;
  failed=false;
  saving=true;
  notice('');
  refreshState();
  showStatus();
  const count=edits.length;
  try {
    const previous=server.state.draft;
    const paletteDrafts={...server.state.paletteDrafts,[previous.palette]:previous,[state.draft.palette]:state.draft};
    for(const [palette,draft] of Object.entries(paletteDrafts)){
      paletteDrafts[palette]=compatibleDraft(draft,state.options);
    }
    server=await (await request('',{method:'PUT',headers:{'content-type':'application/json'},
      body:JSON.stringify({version:server.version,state:{...state,paletteDrafts}})})).json();
    edits.splice(0,count);
    refreshState();
    showToast(message);
  } catch(error) {
    failed=true;
    if(error.current)server=error.current;
    notice(error.message+(error.current?' Retry applies your changes to the latest workspace.':''));
  } finally {
    saving=false;
    showStatus();
  }
}
function change(edit,focus) {
  edits.push(edit);
  refreshState();
  render(focus);
}
get('retry').onclick=()=>void save();
async function imageURL(photo) {
  if(!photo || !photo.startsWith('asset:'))return photo;
  if(!images.has(photo)){
    const task=request('?asset='+encodeURIComponent(photo.slice(6))).then(response=>response.blob())
      .then(blob=>URL.createObjectURL(blob)).catch(error=>{images.delete(photo);throw error;});
    images.set(photo,task);
  }
  return images.get(photo);
}
function linkedColors(option,options) {
  const group=dressGroup(option);
  return [option,...options.filter(item=>item!==option && item.person===option.person && dressGroup(item)===group)]
    .flatMap(item=>item.colorLinks??[]);
}
function card(person,index,draft,options) {
  const look=draft.looks[index];
  const option=selectedOption(options,look);
  const preview=exactPreview(option,look?.color);
  const heading='<h2>'+html(person)+'</h2>';
  const pendingPreview=option && !preview.photo && linkedColors(option,options).some(link=>link.color===look.color);
  const label=preview.photo
    ? '<img data-photo="'+html(preview.photo)+'" alt="'+html(option.style+' in '+look.color)+'">'
    : pendingPreview?'<span class="missing" data-pending-preview>Azazie photo pending</span>':
      '<span class="missing">'+(option?'Exact photo unavailable':'No dress selected')+'</span>';
  const liveOptions=state.options.filter(item=>item.person===index);
  const grouped=new Map();
  for(const item of liveOptions){
    const key=dressGroup(item);
    if(!grouped.has(key) || item.id===look?.option)grouped.set(key,item);
  }
  const picks=option&&!liveOptions.some(item=>item.id===option.id)?[option,...grouped.values()]:[...grouped.values()];
  const cards=picks.map(item=>{
    const chosen=item.id===look?.option;
    const display=chosen?option:item;
    const shade=chosen?look.color:item.lastColor??item.color;
    const savedOnly=!liveOptions.some(live=>live.id===item.id);
    const verified=new Set(verifiedVariants(display).map(variant=>variant.color));
    const available=new Set([...verified,...linkedColors(display,savedOnly?[]:liveOptions).map(link=>link.color)]);
    const shades=[...new Set([...palettes[draft.palette],...available])].filter(color=>available.has(color));
    const select=!savedOnly && available.size;
    const details='<span class="option-details"><span class="pick">'+html(display.style)+'</span>'+
      (available.has(shade)?'<span class="option-shade"><i class="selected-color" style="--swatch:'+colors[shade]+'"></i>'+
        '<span class="shade-name" title="'+html(shade)+'">'+html(shade)+'</span></span>':
        '<span class="option-shade"><span class="shade-name">'+(available.size?'Choose a color':'Exact photo not added')+'</span></span>')+
      '</span>';
    const edit=savedOnly?'':'<button type="button" class="dress-edit" data-edit="'+item.id+
      '" aria-label="Edit '+html(display.style)+'" title="Edit dress">'+
      '<svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">'+
      '<path d="m14 5 5 5M4 20l5-1L20 8a3.5 3.5 0 0 0-5-5L4 14z"/></svg></button>';
    const handle=savedOnly||grouped.size<2?'':'<button type="button" class="dress-reorder" id="reorder-'+item.id+
      '" aria-label="Reorder '+html(display.style)+' with the up and down arrow keys" title="Drag to reorder">⠿</button>';
    return '<div class="option"'+(handle?' data-reorder="'+item.id+'"':'')+' aria-current="'+chosen+'"><div class="option-head">'+
      (select?'<button type="button" class="option-select" id="pick-'+item.id+'" data-pick="'+item.id+
        '" aria-pressed="'+chosen+'">'+details+'</button>':details)+'<div class="option-actions">'+handle+edit+'</div></div>'+
      (shades.length?'<div class="swatches">'+shades.map(shade=>
        '<button class="swatch" style="--swatch:'+colors[shade]+'" title="'+html(shade)+'" aria-label="'+html(item.style+' in '+shade)+
        '" aria-pressed="'+(chosen&&look.color===shade)+'" data-pick="'+item.id+'" data-color="'+html(shade)+
        '" id="sw-'+item.id+'-'+Object.keys(colors).indexOf(shade)+'"'+(savedOnly?' disabled':'')+'></button>').join('')+
      '</div>':'<p class="pending-photo">No verified colors yet</p>')+
      '</div>';
  }).join('');
  return '<article class="card">'+heading+'<div class="preview">'+label+
    '</div><div class="options">'+cards+'</div><button class="add" data-add="'+index+'">Add a dress from a link</button></article>';

}
function render(focus) {
  drag=null;
  const previousScroll=get(focus)?.closest('.swatches')?.scrollLeft;
  const content=visible();
  const {draft,options}=content;
  const paletteDots={
    'All Mauve':['Dusty Rose','Vintage Mauve','Amethyst','Chocolate Plum'],
    'Mauve + Brown':['Dusty Rose','Vintage Mauve','Desert Rose','Ganache'],
    'Garden Mix':['Dusty Rose','Sea Moss','English Rose','Ganache']
  };
  get('palette-dots').innerHTML=paletteDots[draft.palette].map(shade=>'<i style="--swatch:'+colors[shade]+'"></i>').join('');
  const selected=viewed?'lineup:'+viewed:draft.palette;
  const mainOptions=selectOptions(Object.keys(palettes).map(name=>[name,name]),selected);
  const savedOptions=Object.keys(palettes).map(palette=>{
    const lineups=state.saved.filter(item=>item.draft.palette===palette);
    const options=lineups.map(item=>['lineup:'+item.id,item.name+(item.id===state.finalId?' · Final':'')]);
    return options.length?'<optgroup label="'+html(palette)+'">'+selectOptions(options,selected)+'</optgroup>':'';
  }).join('');
  get('palette').innerHTML=mainOptions+savedOptions;
  get('final-lineup').hidden=!viewed;
  get('final-lineup').disabled=viewed===state.finalId;
  get('final-lineup').textContent=viewed===state.finalId?'Final lineup':'Mark final';
  get('delete-lineup').hidden=!viewed;
  get('plain').hidden=!draft.backdrop;
  get('lineup').innerHTML=people.map((person,index)=>card(person,index,draft,options)).join('');
  for(const panel of get('lineup').children)loadPanel(panel,draft.backdrop);
  if(focus){
    const control=get(focus);
    const swatches=control?.closest('.swatches');
    if(swatches && previousScroll!==undefined)swatches.scrollLeft=previousScroll;
    control?.focus({preventScroll:true});
  }
  showStatus();
}
function loadPanel(cardElement,backdrop) {
  const panel=cardElement.querySelector('.preview');
  const img=panel.querySelector('img[data-photo]');
  if(img){
    const missing=()=>{
      const label=document.createElement('span');
      label.className='missing';
      label.textContent='Photo unavailable';
      img.replaceWith(label);
    };
    img.onerror=missing;
    imageURL(img.dataset.photo).then(src=>{if(img.isConnected)img.src=src;}).catch(missing);
  }
  if(backdrop)imageURL(backdrop).then(src=>{
    if(panel.isConnected)panel.style.backgroundImage='url("'+src+'")';
  }).catch(()=>{if(panel.isConnected)notice('The backdrop could not be loaded.');});
}
async function refreshCatalog() {
  if(!state || drag || checkingCatalog || document.hidden || document.querySelector('dialog[open]'))return;
  checkingCatalog=true;
  try {
    const url=new URL('./catalog.js',import.meta.url);
    const response=await fetch(url,{method:'HEAD',cache:'no-store'});
    if(!response.ok)return;
    const validator=response.headers.get('etag')??response.headers.get('last-modified');
    let tag=validator;
    if(!tag){
      const source=await fetch(url,{cache:'no-store'});
      if(!source.ok)return;
      tag=await source.text();
    }
    if(tag===catalogTag)return;
    url.searchParams.set('revision',validator??String(Date.now()));
    const {catalog:latest}=await import(url.href);
    if(drag||document.querySelector('dialog[open]'))return;
    catalogTag=tag;
    if(JSON.stringify(catalog)===JSON.stringify(latest))return;
    const {draft,options}=visible();
    const previous=people.map((person,index)=>card(person,index,draft,options));
    catalog.splice(0,catalog.length,...latest);
    people.forEach((person,index)=>{
      const markup=card(person,index,draft,options);
      if(markup===previous[index])return;
      const prior=get('lineup').children[index];
      const focused=prior.contains(document.activeElement)?document.activeElement.id:'';
      prior.outerHTML=markup;
      loadPanel(get('lineup').children[index],draft.backdrop);
      if(focused)get(focused)?.focus({preventScroll:true});
    });
  } catch {
    // A transient deployment or network error can be retried on the next check.
  } finally {
    checkingCatalog=false;
  }
}
document.addEventListener('visibilitychange',()=>{if(!document.hidden)void refreshCatalog();});
window.addEventListener('focus',()=>void refreshCatalog());
setInterval(refreshCatalog,15_000);
setInterval(()=>{
  if(get('lineup').querySelector('[data-pending-preview]'))void refreshCatalog();
},4_000);
function beginDraft() {
  const snapshot=state.saved.find(item=>item.id===viewed);
  if(snapshot)editingSnapshot=snapshot.id;
  viewed=null;
  const copiedIds=new Map(snapshot?.options.map(item=>[item.id,crypto.randomUUID()]));
  return target=>{
    if(!snapshot)return;
    target.draft=structuredClone(snapshot.draft);
    target.draft.looks=target.draft.looks.map(look=>{
      const selected=selectedOption(snapshot.options,look);
      if(!selected)return null;
      const live=selectedOption(target.options,look);
      if(live && JSON.stringify(snapshotDress(live))===JSON.stringify(snapshotDress(selected)))return look;
      const {id,...details}=snapshotDress(selected);
      let copy=target.options.find(item=>JSON.stringify({...snapshotDress(item),id})===JSON.stringify(snapshotDress(selected)));
      if(!copy){
        copy={id:copiedIds.get(id),...details};
        target.options.push(copy);
      }
      return {...look,option:copy.id};
    });
  };
}
function discardEdits() {
  viewed=editingSnapshot??viewed;
  editingSnapshot=null;
  edits.length=0;
  failed=false;
  notice('');
  refreshState();
  if(!state.saved.some(item=>item.id===viewed))viewed=null;
}
get('palette').onchange=async event=>{
  const value=event.target.value;
  if(saving||switchingPalette||addingColor){render();return;}
  switchingPalette=true;
  showStatus();
  try {
    const latest=await (await request('',{cache:'no-store'})).json();
    if(edits.length && !confirm('Switch palettes and discard unsaved changes? Choose Cancel to stay here and save first.'))return;
    if(latest.version>=server.version)server=latest;
    const id=value.startsWith('lineup:')?value.slice(7):null;
    const saved=id && server.state.saved.find(item=>item.id===id);
    viewed=saved?.id??null;
    activePalette=saved?.draft.palette??(id?server.state.draft.palette:value);
    editingSnapshot=null;
    discardEdits();
    if(id&&!saved)showToast('That saved lineup is no longer available.');
  } catch {
    showToast('Couldn’t load the saved palette. Try again.');
  } finally {
    switchingPalette=false;
    render();
  }
};
function moveDress(sourceId,targetId) {
  if(sourceId===targetId)return;
  change(workspace=>{
    const source=workspace.options.find(item=>item.id===sourceId);
    const target=workspace.options.find(item=>item.id===targetId);
    if(!source||!target||source.person!==target.person)return;
    const sourceGroup=dressGroup(source);
    const targetGroup=dressGroup(target);
    if(sourceGroup===targetGroup)return;
    const column=workspace.options.filter(item=>item.person===source.person);
    const groups=Map.groupBy(column,dressGroup);
    const order=[...groups.keys()];
    const targetIndex=order.indexOf(targetGroup);
    order.splice(order.indexOf(sourceGroup),1);
    order.splice(targetIndex,0,sourceGroup);
    const reordered=order.flatMap(group=>groups.get(group));
    let index=0;
    workspace.options=workspace.options.map(item=>item.person===source.person?reordered[index++]:item);
  },'reorder-'+sourceId);
}

const lineup=get('lineup');
let drag;
lineup.addEventListener('pointerdown',event=>{
  const handle=event.target.closest('.dress-reorder');
  if(!handle||drag||!event.isPrimary||event.button!==0)return;
  const source=handle.closest('[data-reorder]');
  handle.setPointerCapture(event.pointerId);
  drag={source,column:source.parentElement,pointer:event.pointerId,y:event.clientY};
});
lineup.addEventListener('pointermove',event=>{
  if(drag?.pointer!==event.pointerId)return;
  if(!drag.active&&Math.abs(event.clientY-drag.y)<5)return;
  drag.active=true;
  drag.source.classList.add('reordering');
  drag.target?.classList.remove('reorder-target');
  const hit=document.elementFromPoint(event.clientX,event.clientY);
  drag.target=hit?.closest('[data-reorder]');
  if(drag.target?.parentElement!==drag.column||drag.target===drag.source)drag.target=null;
  drag.target?.classList.add('reorder-target');
});
function endReorder(event) {
  if(drag?.pointer!==event.pointerId)return;
  const {source,target}=drag;
  drag=null;
  source.classList.remove('reordering');
  target?.classList.remove('reorder-target');
  if(event.type==='pointerup'&&target)moveDress(source.dataset.reorder,target.dataset.reorder);
}
for(const type of ['pointerup','pointercancel','lostpointercapture'])lineup.addEventListener(type,endReorder);
lineup.addEventListener('keydown',event=>{
  const handle=event.target.closest('.dress-reorder');
  if(!handle||!['ArrowUp','ArrowDown'].includes(event.key))return;
  event.preventDefault();
  const source=handle.closest('[data-reorder]');
  const target=event.key==='ArrowUp'?source.previousElementSibling:source.nextElementSibling;
  if(target?.dataset.reorder)moveDress(source.dataset.reorder,target.dataset.reorder);
});
get('lineup').onclick=event=>{
  const button=event.target.closest('button');
  if(!button)return;
  if(button.dataset.add!==undefined){openDress(Number(button.dataset.add));return;}

  if(button.dataset.edit){
    const item=state.options.find(option=>option.id===button.dataset.edit);
    if(item)openDress(item.person,item);
    return;
  }
  const option=state.options.find(item=>item.id===button.dataset.pick);
  if(!option)return;
  const look=visible().draft.looks[option.person];
  const previous=look?.option===option.id?look.color:option.lastColor;
  const links=linkedColors(option,state.options);
  const available=new Set([...verifiedVariants(option).map(item=>item.color),...links.map(link=>link.color)]);
  const color=[button.dataset.color,previous,option.color,...available].find(shade=>available.has(shade));
  if(!color)return;
  const start=beginDraft();
  change(target=>{
    start(target);
    const live=target.options.find(item=>item.id===option.id);
    if(!live)return;
    const link=linkedColors(live,target.options).find(item=>item.color===color);
    if(link && !live.colorLinks?.some(item=>item.color===color)){
      live.colorLinks=[...(live.colorLinks??[]),link];
    }
    const priorLook=target.draft.looks[option.person];
    const prior=selectedOption(target.options,priorLook);
    const nextGroup=dressGroup(live);
    const priorGroup=prior&&dressGroup(prior);
    for(const item of target.options){
      if(item.person!==option.person)continue;
      const group=dressGroup(item);
      if(group===nextGroup)item.lastColor=color;
      else if(group===priorGroup)item.lastColor=priorLook.color;
    }
    target.draft.looks[option.person]={option:option.id,color};
  },button.id);
};
const colorDialog=get('color-dialog');
const colorForm=get('color-form');
const colorField=colorForm.elements.url;
let colorOptionId, addingColor=false;
function openColor(option) {
  colorOptionId=option.id;
  colorForm.reset();
  get('color-heading').textContent='Add a color for '+option.style;
  get('color-message').textContent='';
  colorDialog.showModal();
}
get('cancel-color').onclick=()=>colorDialog.close();
colorForm.onsubmit=async event=>{
  event.preventDefault();
  if(addingColor||saving)return;
  const option=state.options.find(item=>item.id===colorOptionId);
  const variant=option&&dressColorLink(option,colorField.value.trim());
  const message=get('color-message');
  if(!variant){
    message.textContent='Paste a link for this style and fabric in the new color.';
    return;
  }
  const submit=colorForm.querySelector('[type=submit]');
  addingColor=true;
  submit.disabled=true;
  message.textContent='';
  showStatus();
  try {
    const latest=await (await request('?color',{
      method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify({optionId:option.id,url:variant.url})
    })).json();
    if(latest.version>=server.version)server=latest;
    refreshState();
    colorDialog.close();
    if(dressDialog.open && dressId===option.id)dressDialog.close();
    render();
    get('lineup').querySelector('[data-edit="'+CSS.escape(option.id)+'"]')?.focus({preventScroll:true});
    showToast(variant.verified?variant.color+' added.':variant.color+' added. Photo pending.');
  } catch(error) {
    if(colorDialog.open)message.textContent=error.message;
    else showToast(error.message);
  } finally {
    addingColor=false;
    submit.disabled=false;
    showStatus();
  }
};
const dressDialog=get('dress-dialog');
const form=get('dress-form');
for(const dialog of document.querySelectorAll('dialog')){
  const outside=event=>{
    if(event.target!==dialog)return false;
    const bounds=dialog.getBoundingClientRect();
    return event.clientX<bounds.left || event.clientX>=bounds.right ||
      event.clientY<bounds.top || event.clientY>=bounds.bottom;
  };
  let pressedOutside=false;
  dialog.addEventListener('pointerdown',event=>{pressedOutside=outside(event);});
  dialog.addEventListener('click',event=>{
    if(pressedOutside && outside(event))dialog.close();
    pressedOutside=false;
  });
}
const fields=form.elements;
const addColorValue='__add_color__';
function updateDressRetailer(){
  const link=get('dress-retailer');
  const {link:href}=exactPreview(readProduct(fields.url.value.trim()),fields.color.value);
  link.hidden=!href;
  if(href)link.href=href;
  else link.removeAttribute('href');
}
fields.color.addEventListener('change',()=>{
  if(fields.color.value!==addColorValue){
    fields.color.dataset.previous=fields.color.value;
    updateDressRetailer();
    return;
  }
  fields.color.value=fields.color.dataset.previous??'';
  const option=state.options.find(item=>item.id===dressId);
  if(option)openColor(option);
});
function showDressColors(info,preferred) {
  const variants=verifiedVariants(info);
  const known=variants.map(item=>item.color);
  const current=state.options.find(item=>item.id===dressId);
  const added=current && info?.styleKey===readProduct(current.url)?.styleKey?linkedColors(current,state.options):[];
  const allowed=[...new Set([...(known.length?known:info?.color?[info.color]:[]),...added.map(link=>link.color)])];
  const selected=allowed.includes(preferred)?preferred:allowed[0]??'';
  const actions=dressId?[[addColorValue,'Add another color…']]:[];
  fields.color.innerHTML=selectOptions([['','Select a color'],...allowed.map(shade=>[shade,shade]),...actions],selected);
  fields.color.dataset.previous=selected;
  updateDressRetailer();
}
function openDress(person,option) {
  dressPerson=person;
  dressId=option?.id;
  form.reset();
  get('dress-heading').textContent=(option?'Edit dress for ':'Add a dress for ')+people[person];
  get('dress-message').textContent='';
  fields.url.value=option?.url??'';
  fields.style.value=option?.style??'';
  const look=visible().draft.looks[person];
  showDressColors(option&&readProduct(option.url),option && look?.option===option.id?look.color:option?.color);
  form.querySelector('[data-delete]')?.remove();
  if(option) {
    const remove=document.createElement('button');
    remove.type='button';
    remove.dataset.delete='true';
    remove.innerHTML='<span aria-hidden="true">🗑️</span> Delete dress';
    remove.onclick=()=>{
      if(!confirm('Delete this dress option?'))return;
      const prior=state.draft.looks[person];
      const removed=state.options.filter(item=>dressGroup(item)===dressGroup(option));
      const ids=new Set(removed.map(item=>item.id));
      change(target=>{
        target.options=target.options.filter(item=>!ids.has(item.id));
        if(ids.has(target.draft.looks[person]?.option)){
          const replacement=firstLook(target.options,person);
          target.draft.looks[person]=replacement?{option:replacement.id,color:replacement.color}:null;
        }
      });
      get('dress-dialog').close();
      showToast('Dress deleted.',()=>{
        change(target=>{
          for(const item of removed)if(!target.options.some(live=>live.id===item.id))target.options.push(item);
          if(ids.has(prior?.option))target.draft.looks[person]=prior;
        });
      });
    };
    form.querySelector('.actions').prepend(remove);
  }
  get('dress-dialog').showModal();
}
fields.url.addEventListener('input',()=>{
  const info=readProduct(fields.url.value.trim());
  showDressColors(info,info?.color);
  if(!info)return;
  if(info.style)fields.style.value=info.style;
});
get('cancel-dress').onclick=()=>get('dress-dialog').close();
async function uploadBackdrop(file) {
  const imageTypes=['image/jpeg','image/png','image/webp'];
  if(file.type && !imageTypes.includes(file.type))throw new Error('Choose a JPEG, PNG, or WebP image.');
  const image=new Image();
  let url=URL.createObjectURL(file);
  try {
    image.src=url;
    await image.decode().catch(()=>{throw new Error('This image could not be opened. Try another photo.');});
    let body=file;
    if(file.size>3_000_000){
      const scale=Math.min(1,2000/Math.max(image.naturalWidth,image.naturalHeight));
      const canvas=document.createElement('canvas');
      canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));
      canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));
      const context=canvas.getContext('2d',{alpha:false});
      context.fillStyle='#eee8e1';
      context.fillRect(0,0,canvas.width,canvas.height);
      context.drawImage(image,0,0,canvas.width,canvas.height);
      body=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',.82));
      if(!body || body.size>3_000_000)throw new Error('This image is too large. Try a smaller photo.');
      URL.revokeObjectURL(url);
      url=URL.createObjectURL(body);
    }
    const {photo}=await (await request('?upload',{method:'POST',body})).json();
    images.set(photo,Promise.resolve(url));
    url=null;
    return photo;
  } finally {
    if(url)URL.revokeObjectURL(url);
  }
}
form.onsubmit=async event=>{
  event.preventDefault();
  const info=readProduct(fields.url.value.trim());
  if(!info){get('dress-message').textContent='Enter an Azazie dress product URL.';return;}
  if(!fields.style.value.trim()){get('dress-message').textContent='Enter a style name.';return;}
  const old=state.options.find(item=>item.id===dressId);
  const person=dressPerson,id=dressId??crypto.randomUUID();
  const color=fields.color.value;
  const variant=verifiedVariants({style:fields.style.value.trim(),url:info.url}).find(item=>item.color===color);
  const photo=variant?.photo??'';
  const submit=form.querySelector('[type=submit]');
  submit.disabled=true;
  get('dress-message').textContent='Preparing the dress…';
  try {
    const option={id,person,style:fields.style.value.trim(),size:old?.size??'',color,lastColor:color,
      url:variant?.url??info.url,urlColor:variant?.color||info.color||color,photo,sourceColor:variant?.color??'',
      colorLinks:[...new Map((old?linkedColors(old,state.options):[]).filter(item=>
        dressColorLink({url:variant?.url??info.url},item.url)).map(item=>[item.color,item])).values()]};
    change(target=>{
      const existing=target.options.find(item=>item.id===id);
      if(existing){
        const links=[...option.colorLinks,...(existing.colorLinks??[])].filter(item=>dressColorLink(option,item.url));
        const updated={...option,colorLinks:[...new Map(links.map(item=>[item.color,item])).values()]};
        target.options=target.options.map(item=>item.id===id?updated:item);
      } else target.options.push(option);
      if((variant||option.colorLinks.some(item=>item.color===color)) && (!old || target.draft.looks[person]?.option===id))target.draft.looks[person]={option:id,color};
    });
    viewed=null;
    render();
    get('dress-dialog').close();
    showToast(variant?'Dress updated.':'Dress updated. Exact Azazie photo still needed.');
  } catch(error) {
    get('dress-message').textContent=error.message+' You can clear the photo field and save the dress.';
  } finally {submit.disabled=false;}
};
get('backdrop').onclick=()=>{
  get('more-actions').open=false;
  get('backdrop-file').click();
};
get('backdrop-file').onchange=async event=>{
  const file=event.target.files[0];
  event.target.value='';
  if(!file)return;
  const button=get('backdrop');
  button.disabled=true;
  showToast('Uploading backdrop…');
  try {
    const photo=await uploadBackdrop(file);
    const start=beginDraft();
    change(target=>{start(target);target.draft.backdrop=photo;});
    showToast('Backdrop updated.');
  } catch(error) {showToast(error.message);}
  finally {button.disabled=false;}
};
get('plain').onclick=()=>{
  const start=beginDraft();
  change(target=>{start(target);target.draft.backdrop='';});
  showToast('Backdrop removed.');
};
function snapshot(name,id) {
  const {draft,options}=visible();
  return structuredClone({id,name,draft,options:options.filter(item=>draft.looks.some(look=>look?.option===item.id)).map(snapshotDress)});
}
get('save-lineup').onclick=()=>get('name-dialog').showModal();
get('cancel-name').onclick=()=>get('name-dialog').close();
get('name-form').onsubmit=event=>{
  event.preventDefault();
  const field=event.currentTarget.elements.name;
  if(saving||!field.value.trim())return;
  const item=snapshot(field.value.trim(),crypto.randomUUID());
  viewed=item.id;
  editingSnapshot=null;
  change(target=>{target.saved.push(item);});
  get('name-dialog').close();
  event.currentTarget.reset();
  void save('New palette saved.');
};
get('save-current').onclick=()=>{
  if(saving||!edits.length)return;
  const previous=state.saved.find(item=>item.id===editingSnapshot);
  if(previous){
    const replacement=snapshot(previous.name,previous.id);
    editingSnapshot=null;
    viewed=previous.id;
    change(target=>{target.saved=target.saved.map(item=>item.id===previous.id?replacement:item);});
  }
  void save();
};
get('discard-lineup').onclick=()=>{
  if(saving||!edits.length)return;
  if(!confirm('Discard changes since your last save?'))return;
  discardEdits();
  render();
};
const toolbarMenus=[get('save-actions'),get('more-actions')];
for(const menu of toolbarMenus){
  menu.addEventListener('click',event=>{
    if(event.target.closest('button'))menu.open=false;
  });
}
document.addEventListener('pointerdown',event=>{
  for(const menu of toolbarMenus){
    if(menu.open && !menu.contains(event.target))menu.open=false;
  }
});
document.addEventListener('keydown',event=>{
  if(event.key!=='Escape')return;
  const menu=toolbarMenus.find(menu=>menu.open);
  if(menu){
    menu.open=false;
    menu.querySelector('summary').focus();
  }
});
get('final-lineup').onclick=()=>{
  const id=viewed;
  change(target=>{if(target.saved.some(item=>item.id===id))target.finalId=id;});
  showToast('Lineup marked final.');
};
get('delete-lineup').onclick=()=>{
  if(!confirm('Delete this saved lineup?'))return;
  const id=viewed;
  viewed=null;
  change(target=>{
    target.saved=target.saved.filter(item=>item.id!==id);
    if(target.finalId===id)target.finalId=null;
  });
  showToast('Lineup deleted.');
};
get('share').onclick=async()=>{
  const url=new URL('/',location.origin);
  url.hash=new URLSearchParams({workspace:key,...(viewed?{lineup:viewed}:{})}).toString();
  try {await navigator.clipboard.writeText(url.href);showToast('Workspace link copied.');}
  catch {notice('Copy this workspace link: '+url.href);}
};
get('download').onclick=async()=>{
  const {draft,options}=structuredClone(visible());
  const button=get('download');
  button.disabled=true;
  try {
    await downloadPDF({
      palette:draft.palette,backdrop:await imageURL(draft.backdrop),
      entries:await Promise.all(people.map(async (person,index)=>{
        const look=draft.looks[index];
        const option=selectedOption(options,look);
        const preview=exactPreview(option,look?.color);
        return {person,style:option?.style,color:look?.color,photo:await imageURL(preview.photo).catch(()=>'')};
      }))
    });
  } catch(error) {notice(error.message);}
  finally {button.disabled=false;}
};
window.addEventListener('focus',async()=>{
  if(!server||edits.length)return;
  try {
    const latest=await(await request()).json();
    if(!drag && !edits.length && latest.version>server.version){server=latest;refreshState();render();}
  } catch {}
});
async function start() {
  if(!key){get('entry').textContent='Open your shared Swatch Party link to continue.';return;}
  try {
    server=await(await request()).json();
    sessionStorage.setItem('swatch-workspace',key);
    const candidate=fragment.get('lineup');
    const saved=server.state.saved.find(item=>item.id===candidate);
    viewed=saved?.id??null;
    activePalette=saved?.draft.palette??server.state.draft.palette;
    refreshState();
    get('entry').hidden=true;
    get('workspace').hidden=false;
    render();
  } catch(error) {get('entry').textContent=error.message;}
}
setInterval(()=>{if(server&&!document.hidden)showStatus();},15_000);
document.addEventListener('visibilitychange',()=>{if(server&&!document.hidden)showStatus();});
void start();
