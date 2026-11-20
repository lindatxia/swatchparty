import {mkdir,copyFile} from 'node:fs/promises';

await mkdir('public/vendor',{recursive:true});
await copyFile('node_modules/pdf-lib/dist/pdf-lib.min.js','public/vendor/pdf-lib.js');
