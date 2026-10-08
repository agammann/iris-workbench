import {execFileSync} from 'node:child_process';
import {resolve,join} from 'node:path';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const directory=resolve(process.argv.slice(2).find(value=>value!=='--')||'consumer-output/fresh');
const source=execFileSync(process.env.WORKBENCH_PYTHON||'python',['scripts/unpack-release.py',directory],{encoding:'utf8',windowsHide:true}).trim();
const pnpmPath=process.env.WORKBENCH_PNPM||process.env.npm_execpath;
if(!pnpmPath)throw Error('Run this check using pnpm test:consumer.');
const pnpm=(args)=>execFileSync(process.execPath,[pnpmPath,...args],{cwd:source,stdio:'inherit',windowsHide:true});
pnpm(['install','--frozen-lockfile']);
if(process.env.WORKBENCH_SPEC_CACHE){
 const bytes=readFileSync(process.env.WORKBENCH_SPEC_CACHE);
 if(createHash('sha256').update(bytes).digest('hex')!=='1ab154c7c5d9b25e6b227944a44a120c670686f876c2e14abfb9ee5898596650')throw Error('Offline specification cache differs from the pinned bytes.');
 writeFileSync(join(source,'server/spec.json'),bytes);
 console.log('Pinned offline specification cache verified; this check does not assert remote download.');
}else execFileSync(process.execPath,['scripts/fetch-spec.mjs'],{cwd:source,stdio:'inherit',windowsHide:true});
pnpm(['build']);pnpm(['test']);pnpm(['test:sites']);
console.log('Fresh IRIS Workbench source consumer installed, built and passed boundary/setup/static packaging tests. No container started or live instance changed.');
