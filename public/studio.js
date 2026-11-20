import {catalog,colors,palettes,people,readProduct,exactPreview,verifiedVariants,dressColorLink} from './catalog.js';
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
const images=new Map();
const edits=[];
let server, state, saving=false, failed=false, viewed=null, dressPerson, dressId;
let catalogTag=null, checkingCatalog=false;
let toastTimer, editingSnapshot=null, manualSave=false, draftCheckpoint;

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
function refreshState() {
  state=structuredClone(server.state);
  for(const edit of edits)edit(state);
}
function showStatus() {
  get('save-status').textContent=failed?'Couldn’t save':saving?'Saving…':'';
  get('retry').hidden=!failed;
  const last=server.savedAt && new Date(server.savedAt);
  get('saved-check').hidden=!last||failed||saving;
  if(last)get('saved-at').dateTime=server.savedAt;
  const sameDay=last && new Date().toDateString()===last.toDateString();
  get('saved-at').textContent=last?'Last saved at '+last.toLocaleString([],sameDay?
    {hour:'numeric',minute:'2-digit'}:{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}):'';
}
async function save() {
  if(saving||failed||!edits.length)return;
  saving=true;
  showStatus();
  const count=edits.length;
  try {
    server=await (await request('',{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify({version:server.version,state})})).json();
    edits.splice(0,count);
    refreshState();
  } catch(error) {
    failed=true;
    if(error.current)server=error.current;
    notice(error.message+(error.current?' Retry applies your changes to the latest workspace.':''));
  } finally {
    saving=false;
    showStatus();
  }
  if(!failed && edits.length)void save();
  else if(!failed && manualSave){
    manualSave=false;
    draftCheckpoint=structuredClone(server.state.draft);
    showToast('Lineup saved.');
  }
}
function change(edit,focus) {
  edits.push(edit);
  refreshState();
  render(focus);
  void save();
}
get('retry').onclick=()=>{
  failed=false;
  notice('');
  refreshState();
  render();
  void save();
};
async function imageURL(photo) {
  if(!photo || !photo.startsWith('asset:'))return photo;
  if(!images.has(photo)){
    const task=request('?asset='+encodeURIComponent(photo.slice(6))).then(response=>response.blob())
      .then(blob=>URL.createObjectURL(blob)).catch(error=>{images.delete(photo);throw error;});
    images.set(photo,task);
  }
  return images.get(photo);
}
function card(person,index,draft,options) {
  const look=draft.looks[index];
  const option=selectedOption(options,look);
  const preview=exactPreview(option,look?.color);
  const heading='<h2>'+html(person)+'</h2>';
  const label=preview.photo
    ? '<img data-photo="'+html(preview.photo)+'" alt="'+html(option.style+' in '+look.color)+'">'
    : '<span class="missing">'+(option?'Exact photo unavailable':'No dress selected')+'</span>';
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
    const shade=chosen?look.color:item.color;
    const source=exactPreview(display,shade);
    const savedOnly=!liveOptions.some(live=>live.id===item.id);
    const verified=new Set(verifiedVariants(display).map(variant=>variant.color));
    const shades=[...new Set([...palettes[draft.palette],...verified])].filter(color=>verified.has(color));
    const pending=[...new Set([display,...liveOptions.filter(live=>dressGroup(live)===dressGroup(item))]
      .flatMap(entry=>(entry.colorLinks??[]).map(link=>link.color)).filter(color=>!verified.has(color)))];
    const open=savedOnly?'<div class="option-head">':'<button type="button" class="option-head option-opener" data-edit="'+
      item.id+'" aria-label="Edit '+html(display.style)+'">';
    return '<div class="option" aria-current="'+chosen+'">'+open+
      '<span class="option-details"><span class="pick">'+html(display.style)+'</span>'+
      (source.photo?'<span class="option-shade"><i class="selected-color" style="--swatch:'+colors[shade]+'"></i>'+
        '<span class="shade-name" title="'+html(shade)+'">'+html(shade)+'</span></span>':
        '<span class="option-shade"><span class="shade-name">'+(verified.size?'Choose a verified color':'Exact photo not added')+'</span></span>')+
      (display.size?'<span class="size">'+html(display.size)+'</span>':'')+'</span>'+
      (savedOnly?'</div>':'<span class="option-chevron" aria-hidden="true"></span></button>')+(shades.length?'<div class="swatches">'+shades.map(shade=>
        '<button class="swatch" style="--swatch:'+colors[shade]+'" title="'+html(shade)+'" aria-label="'+html(item.style+' in '+shade)+
        '" aria-pressed="'+(chosen&&look.color===shade)+'" data-pick="'+item.id+'" data-color="'+html(shade)+
        '" id="sw-'+item.id+'-'+Object.keys(colors).indexOf(shade)+'"'+(savedOnly?' disabled':'')+'></button>').join('')+
      '</div>':'<p class="pending-photo">No verified colors yet</p>')+
      (pending.length?'<p class="pending-photo">Awaiting photo: '+html(pending.join(', '))+'</p>':'')+
      '</div>';
  }).join('');
  return '<article class="card">'+heading+'<div class="preview">'+label+
    '</div><div class="options">'+cards+'</div><button class="add" data-add="'+index+'">Add a dress from a link</button></article>';

}
function render(focus) {
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
  if(!state || checkingCatalog || document.hidden || document.querySelector('dialog[open]'))return;
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
    if(document.querySelector('dialog[open]'))return;
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
setInterval(refreshCatalog,15000);
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
      if(JSON.stringify(live)===JSON.stringify(selected))return look;
      const {id,...details}=selected;
      let copy=target.options.find(item=>JSON.stringify({...item,id})===JSON.stringify(selected));
      if(!copy){
        copy={id:copiedIds.get(id),...details};
        target.options.push(copy);
      }
      return {...look,option:copy.id};
    });
  };
}
get('palette').onchange=event=>{
  const value=event.target.value;
  editingSnapshot=null;
  if(value.startsWith('lineup:')){
    viewed=value.slice(7);
    render();
    return;
  }
  viewed=null;
  if(state.draft.palette===value){render();return;}
  change(target=>{target.draft.palette=value;});
};
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
  const previous=visible().draft.looks[option.person]?.color;
  const variants=verifiedVariants(option);
  const color=[button.dataset.color,previous,option.color,variants[0]?.color]
    .find(shade=>variants.some(item=>item.color===shade));
  if(!color)return;
  const start=beginDraft();
  change(target=>{
    start(target);
    if(target.options.some(item=>item.id===option.id))target.draft.looks[option.person]={option:option.id,color};
  },button.id);
};
const colorDialog=get('color-dialog');
const colorForm=get('color-form');
const colorField=colorForm.elements.url;
let colorOptionId;
function openColor(option) {
  colorOptionId=option.id;
  colorForm.reset();
  get('color-heading').textContent='Add a color for '+option.style;
  get('color-message').textContent='';
  colorDialog.showModal();
}
get('cancel-color').onclick=()=>colorDialog.close();
colorForm.onsubmit=event=>{
  event.preventDefault();
  const option=state.options.find(item=>item.id===colorOptionId);
  const variant=option&&dressColorLink(option,colorField.value.trim());
  if(!variant){
    get('color-message').textContent='Paste a link for this style and fabric in the new color.';
    return;
  }
  const fromEdit=dressDialog.open && dressId===option.id;
  if(variant.verified && fromEdit){
    if(!Array.from(fields.color.options).some(item=>item.value===variant.color)){
      get('color-message').textContent='Save your dress link changes before selecting this color.';
      return;
    }
    fields.color.value=variant.color;
    fields.color.dataset.previous=variant.color;
    updateDressRetailer();
  } else if(variant.verified){
    const start=beginDraft();
    change(target=>{
      start(target);
      if(target.options.some(item=>item.id===option.id))target.draft.looks[option.person]={option:option.id,color:variant.color};
    });
    showToast(variant.color+' selected.');
  } else {
    change(target=>{
      const live=target.options.find(item=>item.id===option.id);
      if(!live || !dressColorLink(live,variant.url))return;
      live.colorLinks=[...(live.colorLinks??[]).filter(item=>item.color!==variant.color),{color:variant.color,url:variant.url}];
    });
    const message=variant.color+' added for photo verification.';
    showToast(message);
  }
  colorDialog.close();
  get('dress-color').focus({preventScroll:true});
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
  const allowed=known.length?known:info?.color?[info.color]:[];
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
  fields.size.value=option?.size??'';
  form.querySelector('[data-delete]')?.remove();
  if(option) {
    const remove=document.createElement('button');
    remove.type='button';
    remove.dataset.delete='true';
    remove.textContent='Delete dress';
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
  if(info.size)fields.size.value=info.size;
});
get('cancel-dress').onclick=()=>get('dress-dialog').close();
async function upload(file) {
  if(file.size>3_000_000)throw new Error('Choose an image smaller than 3 MB.');
  return (await (await request('?upload',{method:'POST',body:file})).json()).photo;
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
    const option={id,person,style:fields.style.value.trim(),size:fields.size.value.trim(),color,
      url:variant?.url??info.url,urlColor:variant?.color||info.color||color,photo,sourceColor:variant?.color??'',
      colorLinks:(old?.colorLinks??[]).filter(item=>dressColorLink({url:variant?.url??info.url},item.url))};
    change(target=>{
      target.options=target.options.some(item=>item.id===id)?target.options.map(item=>item.id===id?option:item):[...target.options,option];
      if(variant && (!old || target.draft.looks[person]?.option===id))target.draft.looks[person]={option:id,color};
    });
    viewed=null;
    render();
    get('dress-dialog').close();
    showToast(variant?'Dress saved.':'Dress saved. Exact Azazie photo still needed.');
  } catch(error) {
    get('dress-message').textContent=error.message+' You can clear the photo field and save the dress.';
  } finally {submit.disabled=false;}
};
get('backdrop').onclick=()=>get('backdrop-file').click();
get('backdrop-file').onchange=async event=>{
  const file=event.target.files[0];
  event.target.value='';
  if(!file)return;
  try {
    const photo=await upload(file);
    const start=beginDraft();
    change(target=>{start(target);target.draft.backdrop=photo;});
    showToast('Backdrop updated.');
  } catch(error) {notice(error.message);}
};
get('plain').onclick=()=>{
  const start=beginDraft();
  change(target=>{start(target);target.draft.backdrop='';});
  showToast('Backdrop removed.');
};
function snapshot(name,id) {
  const {draft,options}=visible();
  return structuredClone({id,name,draft,options:options.filter(item=>draft.looks.some(look=>look?.option===item.id))});
}
get('save-lineup').onclick=()=>get('name-dialog').showModal();
get('cancel-name').onclick=()=>get('name-dialog').close();
get('name-form').onsubmit=event=>{
  event.preventDefault();
  const field=event.currentTarget.elements.name;
  if(!field.value.trim())return;
  const item=snapshot(field.value.trim(),crypto.randomUUID());
  viewed=item.id;
  editingSnapshot=null;
  change(target=>{target.saved.push(item);});
  get('name-dialog').close();
  event.currentTarget.reset();
  showToast('New palette saved.');
};
get('save-current').onclick=()=>{
  manualSave=true;
  const previous=state.saved.find(item=>item.id===editingSnapshot);
  if(failed){
    failed=false;
    notice('');
    refreshState();
  }
  if(previous){
    const replacement=snapshot(previous.name,previous.id);
    editingSnapshot=null;
    viewed=previous.id;
    change(target=>{target.saved=target.saved.map(item=>item.id===previous.id?replacement:item);});
  } else if(!edits.length){
    change(()=>{});
  } else {
    render();
    void save();
  }
};
get('discard-lineup').onclick=()=>{
  if(viewed){showToast('No lineup changes to discard.');return;}
  if(!confirm('Discard lineup changes since your last explicit save?'))return;
  const saved=state.saved.find(item=>item.id===editingSnapshot);
  const restore=structuredClone(draftCheckpoint);
  editingSnapshot=null;
  viewed=saved?.id??viewed;
  change(target=>{
    target.draft={...restore,looks:restore.looks.map((look,index)=>
      target.options.some(item=>item.id===look?.option && item.person===index)?look:null)};
  });
};
const toolbarMenus=[get('save-actions'),get('more-actions')];
for(const menu of toolbarMenus){
  menu.addEventListener('click',event=>{
    if(event.target.closest('button'))menu.open=false;
  });
}
document.addEventListener('pointerdown',event=>{
  for(const menu of toolbarMenus)if(menu.open && !menu.contains(event.target))menu.open=false;
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
    if(!edits.length && latest.version>server.version){server=latest;refreshState();render();}
  } catch {}
});
async function start() {
  if(!key){get('entry').textContent='Open your shared Swatch Party link to continue.';return;}
  try {
    server=await(await request()).json();
    draftCheckpoint=structuredClone(server.state.draft);
    sessionStorage.setItem('swatch-workspace',key);
    const candidate=fragment.get('lineup');
    viewed=server.state.saved.some(item=>item.id===candidate)?candidate:null;
    refreshState();
    get('entry').hidden=true;
    get('workspace').hidden=false;
    render();
  } catch(error) {get('entry').textContent=error.message;}
}
void start();
