import {createServer} from 'node:http';
import {randomBytes} from 'node:crypto';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {Readable} from 'node:stream';
import {resolve,extname,sep} from 'node:path';
import '../server/build.js';
import {handle} from './handler.js';

await mkdir('.data',{recursive:true});
if(!process.env.SWATCH_WORKSPACE_KEY) {
  try {process.env.SWATCH_WORKSPACE_KEY=(await readFile('.data/workspace-key','utf8')).trim();}
  catch(error) {
    if(error.code!=='ENOENT')throw error;
    process.env.SWATCH_WORKSPACE_KEY=randomBytes(24).toString('hex');
    await writeFile('.data/workspace-key',process.env.SWATCH_WORKSPACE_KEY,{mode:0o600,flag:'wx'});
  }
}
const root=resolve('public');
const port=Number(process.env.PORT || 4173);
const host=process.env.SWATCH_HOST||'127.0.0.1';
const types={'.html':'text/html','.css':'text/css','.js':'text/javascript','.jpg':'image/jpeg','.png':'image/png','.webp':'image/webp','.woff2':'font/woff2'};
createServer(async (req,res)=>{
  try {
    const target=new URL(req.url,'http://localhost');
    if(target.pathname==='/api/workspace') {
      const body=['GET','HEAD'].includes(req.method)?undefined:Readable.toWeb(req);
      const result=await handle(new Request(target,{method:req.method,headers:req.headers,body,duplex:'half'}));
      res.writeHead(result.status,Object.fromEntries(result.headers));
      if(result.body)Readable.fromWeb(result.body).pipe(res);
      else res.end();
      return;
    }
    const path=resolve(root,'.'+decodeURIComponent(target.pathname==='/'?'/index.html':target.pathname));
    if(!path.startsWith(root+sep)){res.writeHead(404).end();return;}
    const bytes=await readFile(path);
    res.writeHead(200,{'content-type':types[extname(path)]??'application/octet-stream','cache-control':'no-store'}).end(bytes);
  } catch {
    if(!res.headersSent)res.writeHead(404);
    res.end();
  }
}).listen(port,host,()=>{
  console.log('Swatch Party is ready on port '+port+'.');
  console.log('Open http://'+(host==='0.0.0.0'?'localhost':host)+':'+port+'/#workspace='+process.env.SWATCH_WORKSPACE_KEY);
});
