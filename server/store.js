import {readFile} from 'node:fs/promises';
import {initialWorkspace} from '../public/catalog.js';

const initial = JSON.stringify(initialWorkspace());
const record = row => ({state:JSON.parse(row.body),version:row.version,savedAt:row.saved_at});

export async function openStore() {
  if(process.env.DATABASE_URL) {
    const {Pool}=await import('pg');
    const pool=new Pool({connectionString:process.env.DATABASE_URL,max:3});
    await pool.query(await readFile(new URL('../db/schema.sql',import.meta.url),'utf8'));
    return {
      async read(id) {
        await pool.query('INSERT INTO swatch_workspace(id,body,version) VALUES($1,$2,0) ON CONFLICT DO NOTHING',[id,initial]);
        return record((await pool.query('SELECT * FROM swatch_workspace WHERE id=$1',[id])).rows[0]);
      },
      async write(id,version,body,time) {
        const result=await pool.query('UPDATE swatch_workspace SET body=$3, version=version+1, saved_at=$4 WHERE id=$1 AND version=$2 RETURNING *',[id,version,body,time]);
        return result.rows[0] ? record(result.rows[0]) : null;
      },
      async put(id,key,mime,bytes) {
        await pool.query('INSERT INTO swatch_assets(workspace,id,mime,bytes) VALUES($1,$2,$3,$4)',[id,key,mime,bytes]);
      },
      async asset(id,key) {
        return (await pool.query('SELECT mime,bytes FROM swatch_assets WHERE workspace=$1 AND id=$2',[id,key])).rows[0];
      }
    };
  }
  if(process.env.VERCEL)throw new Error('DATABASE_URL required');
  const {DatabaseSync}=await import('node:sqlite');
  const db=new DatabaseSync(process.env.SWATCH_DB_FILE || '.data/swatch-party.sqlite');
  db.exec(await readFile(new URL('../db/schema.sql',import.meta.url),'utf8'));
  return {
    read(id) {
      db.prepare('INSERT INTO swatch_workspace(id,body,version) VALUES(?,?,0) ON CONFLICT DO NOTHING').run(id,initial);
      return record(db.prepare('SELECT * FROM swatch_workspace WHERE id=?').get(id));
    },
    write(id,version,body,time) {
      const row=db.prepare('UPDATE swatch_workspace SET body=?, version=version+1, saved_at=? WHERE id=? AND version=? RETURNING *').get(body,time,id,version);
      return row ? record(row) : null;
    },
    put(id,key,mime,bytes) {
      db.prepare('INSERT INTO swatch_assets(workspace,id,mime,bytes) VALUES(?,?,?,?)').run(id,key,mime,bytes);
    },
    asset(id,key) {
      return db.prepare('SELECT mime,bytes FROM swatch_assets WHERE workspace=? AND id=?').get(id,key);
    }
  };
}
