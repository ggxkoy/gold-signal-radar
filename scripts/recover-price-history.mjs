import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { pointsOf } from '../mirror-site/quant-engine.mjs';
// Restore collected observations only; never interpolate missing candles.
const historyPath=new URL('../mirror-site/history.json',import.meta.url);
let history=[];try{history=JSON.parse(await readFile(historyPath,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
const commits=execFileSync('git',['log','--format=%H','--','mirror-site/data.json'],{encoding:'utf8'}).trim().split('\n');
for(const commit of commits){
  const d=JSON.parse(execFileSync('git',['show',`${commit}:mirror-site/data.json`],{encoding:'utf8',maxBuffer:10000000}));
  const capturedAt=Date.parse(d.updatedAt),quoteAt=Date.parse(d.market?.updatedAt);
  if(Number.isFinite(capturedAt)&&Number.isFinite(quoteAt)&&d.market?.cnyGram>0)history.push({capturedAt,quoteAt,cnyGram:d.market.cnyGram,usdOz:d.market.usdOz,usdCny:d.market.usdCny});
}
history=pointsOf(history);
await writeFile(historyPath,`${JSON.stringify(history)}\n`);
console.log(JSON.stringify({observations:history.length,start:history[0]?.capturedAt,end:history.at(-1)?.capturedAt}));
