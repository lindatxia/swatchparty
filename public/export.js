function loadImage(url) {
  if(!url)return Promise.resolve(null);
  return new Promise(resolve=>{
    const image=new Image();
    image.onload=()=>resolve(image);
    image.onerror=()=>resolve(null);
    image.src=url;
  });
}
function paint(context,image,x,y,width,height,cover=false) {
  const scale=(cover?Math.max:Math.min)(width/image.naturalWidth,height/image.naturalHeight);
  const w=image.naturalWidth*scale,h=image.naturalHeight*scale;
  context.drawImage(image,x+(width-w)/2,cover?y+(height-h)/2:y+height-h,w,h);
}
export async function downloadPDF({palette,backdrop,entries}) {
  if(!window.PDFLib)throw new Error('The PDF exporter is unavailable. Reload and try again.');
  const canvas=document.createElement('canvas');
  canvas.width=1800;
  canvas.height=1012;
  const ctx=canvas.getContext('2d');
  if(document.fonts)await document.fonts.load('44px Averia');
  const [scene,...photos]=await Promise.all([loadImage(backdrop),...entries.map(entry=>loadImage(entry.photo))]);
  ctx.fillStyle='#faf8f4';
  ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.textAlign='center';
  ctx.fillStyle='#381b29';
  ctx.font='44px Averia, sans-serif';
  ctx.fillText(palette,900,65);
  ctx.save();
  ctx.beginPath();
  ctx.rect(56,145,1688,730);
  ctx.clip();
  ctx.fillStyle='#eee8e1';
  ctx.fillRect(56,145,1688,730);
  if(scene)paint(ctx,scene,56,145,1688,730,true);
  const column=1688/entries.length;
  photos.forEach((image,index)=>{
    if(image)paint(ctx,image,64+index*column,159,column-16,703);
  });
  ctx.restore();
  entries.forEach((entry,index)=>{
    const center=56+(index+.5)*column;
    ctx.fillStyle='#381b29';
    ctx.font='32px Averia, sans-serif';
    ctx.fillText(entry.person,center,128,column-14);
    if(!photos[index]){
      ctx.fillStyle='#faf8f4';
      ctx.fillRect(center-110,500,220,43);
      ctx.fillStyle='#381b29';
      ctx.font='24px Averia, sans-serif';
      ctx.fillText(entry.style?'Exact photo unavailable':'No dress selected',center,529,207);
    }
    if(!entry.style)return;
    ctx.font='24px Averia, sans-serif';
    ctx.fillStyle='#381b29';
    ctx.fillText(entry.style+' · '+entry.color,center,923,column-12);

  });
  const pdf=await window.PDFLib.PDFDocument.create();
  const image=await pdf.embedJpg(canvas.toDataURL('image/jpeg',.9));
  const page=pdf.addPage([900,506]);
  page.drawImage(image,{x:0,y:0,width:900,height:506});
  const url=URL.createObjectURL(new Blob([await pdf.save()],{type:'application/pdf'}));
  const anchor=document.createElement('a');
  anchor.href=url;
  anchor.download='swatch-party-'+palette.toLowerCase().replace(/[^a-z]+/g,'-')+'.pdf';
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(()=>URL.revokeObjectURL(url),20_000);
}
