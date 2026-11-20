import {colors,palettes,people,readProduct,exactPreview,verifiedVariants} from './catalog.js';
import {downloadPDF} from './export.js';

const get=id=>document.getElementById(id);
const html=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const selectOptions=(items,selected)=>items.map(([value,label])=>'<option value="'+html(value)+'"'+(value===selected?' selected':'')+'>'+html(label)+'</option>').join('');
const fragment=new URLSearchParams(location.hash.slice(1));
const key=fragment.get('workspace')??sessionStorage.getItem('swatch-workspace')??'';
const firstLook=(options,person)=>options.find(option=>option.person===person);
const selectedOption=(options,look)=>options.find(option=>option.id===look?.option);
const images=new Map();
const edits=[];
let server, state, saving=false, failed=false, viewed=null, dressPerson, dressId;
let renderVersion=0;
let toastTimer;

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
  const picks=option&&!liveOptions.some(item=>item.id===option.id)?[option,...liveOptions]:liveOptions;
  const cards=picks.map(item=>{
    const chosen=item.id===look?.option;
    const display=chosen?option:item;
    const shade=chosen?look.color:item.color;
    const source=exactPreview(display,shade);
    const linkLabel='View on Azazie';
    const link=source.link?'<a class="retailer-link" href="'+html(source.link)+
      '" target="_blank" rel="noopener noreferrer" aria-label="'+linkLabel+'" title="'+linkLabel+'"><span aria-hidden="true">↗</span></a>':'';
    const savedOnly=!liveOptions.some(live=>live.id===item.id);
    const verified=new Set(verifiedVariants(display).map(variant=>variant.color));
    const shades=[...new Set([item.color,...palettes[draft.palette],shade])].filter(color=>verified.has(color));
    return '<div class="option" aria-current="'+chosen+'"><div class="option-head">'+
      '<div class="option-details"><button class="text-button pick" data-pick="'+item.id+'" id="pick-'+item.id+
      '" aria-pressed="'+chosen+'"'+(savedOnly||!verifiedVariants(item).length?' disabled':'')+'>'+html(display.style)+'</button>'+
      (source.photo?'<span class="option-shade"><i class="selected-color" style="--swatch:'+colors[shade]+'"></i>'+html(shade)+'</span>':
        '<span class="option-shade">'+(verified.size?'Choose a verified color':'Waiting for verification')+'</span>')+
      (display.size?'<span class="size">'+html(display.size)+'</span>':'')+'</div>'+
      '<div class="option-actions">'+link+
      (savedOnly?'':'<button class="edit-option" data-edit="'+item.id+'" aria-label="Edit '+html(item.style)+'">Edit</button>')+
      '</div></div>'+(shades.length?'<div class="swatches">'+shades.map(shade=>
        '<button class="swatch" style="--swatch:'+colors[shade]+'" title="'+html(shade)+'" aria-label="'+html(item.style+' in '+shade)+
        '" aria-pressed="'+(chosen&&look.color===shade)+'" data-pick="'+item.id+'" data-color="'+html(shade)+
        '" id="sw-'+item.id+'-'+Object.keys(colors).indexOf(shade)+'"'+(savedOnly?' disabled':'')+'></button>').join('')+
      '</div>':'<p class="pending-photo">No verified photos in this palette</p>')+'</div>';
  }).join('');
  return '<article class="card">'+heading+'<div class="preview">'+label+
    '</div><div class="options">'+cards+'</div><button class="add" data-add="'+index+'">Add a dress from a link</button></article>';

}
function render(focus) {
  const previousScroll=get(focus)?.closest('.swatches')?.scrollLeft;
  const content=visible();
  const current=++renderVersion;
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
  get('update-lineup').hidden=!viewed;
  get('final-lineup').hidden=!viewed;
  get('final-lineup').disabled=viewed===state.finalId;
  get('final-lineup').textContent=viewed===state.finalId?'Final lineup':'Mark final';
  get('delete-lineup').hidden=!viewed;
  get('plain').hidden=!draft.backdrop;
  get('lineup').innerHTML='<div class="scene" aria-hidden="true"></div>'+people.map((person,index)=>card(person,index,draft,options)).join('');
  for(const img of get('lineup').querySelectorAll('img[data-photo]')) {
    const missing=()=>{const label=document.createElement('span');label.className='missing';label.textContent='Photo unavailable';img.replaceWith(label);};
    img.onerror=missing;
    imageURL(img.dataset.photo).then(src=>{if(current===renderVersion)img.src=src;}).catch(missing);
  }
  if(draft.backdrop) imageURL(draft.backdrop).then(src=>{
    if(current===renderVersion)get('lineup').querySelector('.scene').style.backgroundImage='url("'+src+'")';
  }).catch(()=>notice('The backdrop could not be loaded.'));
  if(focus){
    const control=get(focus);
    const swatches=control?.closest('.swatches');
    if(swatches && previousScroll!==undefined)swatches.scrollLeft=previousScroll;
    control?.focus({preventScroll:true});
  }
  showStatus();
}
function beginDraft() {
  const snapshot=state.saved.find(item=>item.id===viewed);
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
const dressDialog=get('dress-dialog');
const form=get('dress-form');
function onDressBackdrop(event) {
  if(event.target!==dressDialog)return false;
  const bounds=dressDialog.getBoundingClientRect();
  return event.clientX<bounds.left || event.clientX>=bounds.right ||
    event.clientY<bounds.top || event.clientY>=bounds.bottom;
}
let pressedBackdrop=false;
dressDialog.addEventListener('pointerdown',event=>{pressedBackdrop=onDressBackdrop(event);});
dressDialog.addEventListener('click',event=>{
  if(pressedBackdrop && onDressBackdrop(event) && !form.querySelector('[type=submit]').disabled){
    dressDialog.close();
  }
  pressedBackdrop=false;
});
const fields=form.elements;
function showDressColors(info,preferred) {
  const variants=verifiedVariants(info);
  const known=variants.map(item=>item.color);
  const allowed=known.length?known:info?.color?[info.color]:[];
  const selected=allowed.includes(preferred)?preferred:allowed[0]??'';
  fields.color.innerHTML=selectOptions([['','Select a color'],...allowed.map(shade=>[shade,shade])],selected);
}
function openDress(person,option) {
  dressPerson=person;
  dressId=option?.id;
  form.reset();
  get('dress-heading').textContent=(option?'Edit dress for ':'Add a dress for ')+people[person];
  get('dress-message').textContent='';
  fields.url.value=option?.url??'';
  fields.style.value=option?.style??'';
  showDressColors(option&&readProduct(option.url),option?.color);
  fields.size.value=option?.size??'';
  fields.size.required=!option?.id;
  form.querySelector('[data-delete]')?.remove();
  if(option) {
    const remove=document.createElement('button');
    remove.type='button';
    remove.dataset.delete='true';
    remove.textContent='Delete dress';
    remove.onclick=()=>{
      if(!confirm('Delete this dress option?'))return;
      const prior=state.draft.looks[person];
      change(target=>{
        target.options=target.options.filter(item=>item.id!==option.id);
        if(target.draft.looks[person]?.option===option.id){
          const replacement=firstLook(target.options,person);
          target.draft.looks[person]=replacement?{option:replacement.id,color:replacement.color}:null;
        }
      });
      get('dress-dialog').close();
      showToast('Dress deleted.',()=>{
        change(target=>{
          if(!target.options.some(item=>item.id===option.id))target.options.push(option);
          if(prior?.option===option.id)target.draft.looks[person]=prior;
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
      url:variant?.url??info.url,urlColor:variant?.color||info.color||color,photo,sourceColor:variant?.color??''};
    change(target=>{
      target.options=target.options.some(item=>item.id===id)?target.options.map(item=>item.id===id?option:item):[...target.options,option];
      if(variant && (!old || target.draft.looks[person]?.option===id))target.draft.looks[person]={option:id,color};
    });
    viewed=null;
    render();
    get('dress-dialog').close();
    notice(variant?'':'Dress saved. It will be selectable once there’s a verified Azazie photo.');
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
    notice('');
  } catch(error) {notice(error.message);}
};
get('plain').onclick=()=>{
  const start=beginDraft();
  change(target=>{start(target);target.draft.backdrop='';});
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
  change(target=>{target.saved.push(item);});
  get('name-dialog').close();
  event.currentTarget.reset();
};
get('update-lineup').onclick=()=>{
  const item=state.saved.find(item=>item.id===viewed);
  if(!item || !confirm('Replace this saved lineup with the current draft?'))return;
  viewed=null;
  const replacement=snapshot(item.name,item.id);
  viewed=item.id;
  change(target=>{target.saved=target.saved.map(saved=>saved.id===item.id?replacement:saved);});
};
get('final-lineup').onclick=()=>{
  const id=viewed;
  change(target=>{if(target.saved.some(item=>item.id===id))target.finalId=id;});
};
get('delete-lineup').onclick=()=>{
  if(!confirm('Delete this saved lineup?'))return;
  const id=viewed;
  viewed=null;
  change(target=>{
    target.saved=target.saved.filter(item=>item.id!==id);
    if(target.finalId===id)target.finalId=null;
  });
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
