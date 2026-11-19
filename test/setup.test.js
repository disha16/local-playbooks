import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {SetupManager,readSetupState,preflight,MIN_DISK_BYTES} from '../src/setup.js';
async function fixture(t){const dir=await fs.mkdtemp(path.join(os.tmpdir(),'lp-setup-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));return {dir,stateFile:path.join(dir,'state.json')};}
test('setup only runs model preparation, in order, and persists readiness',async t=>{
 const {stateFile}=await fixture(t),calls=[];const m=new SetupManager({stateFile,preparePrivacy:async()=>calls.push('privacy'),prepareSummary:async()=>calls.push('summary'),prepareAudio:async()=>calls.push('audio')});
 const state=await m.run();assert.deepEqual(calls,['privacy','summary','audio']);assert.equal(state.completed,true);assert.equal((await m.status()).audio,true);assert.equal(state.components.audio.ready,true);
});
test('failure is not marked complete; retry rechecks cached assets',async t=>{
 const {stateFile}=await fixture(t);let fail=true,privacyChecks=0;
 const m=new SetupManager({stateFile,preparePrivacy:async()=>privacyChecks++,prepareSummary:async()=>{if(fail)throw new Error('PRIVATE error path');},prepareAudio:async()=>{}});
 await assert.rejects(m.run(),/PRIVATE/);let state=await m.status();assert.equal(state.completed,false);assert.equal(state.failedPhase,'summary');assert.ok(!JSON.stringify(state).includes('PRIVATE'));
 fail=false;state=await m.run();assert.equal(privacyChecks,2);assert.equal(state.completed,true);
});
test('parallel setup requests share one download',async t=>{
 const {stateFile}=await fixture(t);let release,calls=0;const wait=new Promise(r=>release=r);
 const m=new SetupManager({stateFile,preparePrivacy:async()=>{calls++;await wait;},prepareSummary:async()=>{},prepareAudio:async()=>{}});
 const a=m.run(),b=m.run();assert.equal(a,b);release();await Promise.all([a,b]);assert.equal(calls,1);
});
test('audio can be skipped without misreporting it ready',async t=>{
 const {stateFile}=await fixture(t);const m=new SetupManager({stateFile,preparePrivacy:async()=>{},prepareSummary:async()=>{},prepareAudio:async()=>assert.fail('Audio must not run')});
 const state=await m.run({audio:false});assert.equal(state.completed,true);assert.equal(state.audio,false);assert.equal(state.components.audio,undefined);
});
test('missing and corrupt setup markers lead back to setup',async t=>{
 const {stateFile}=await fixture(t);assert.equal(await readSetupState(stateFile),null);await fs.writeFile(stateFile,'bad JSON');assert.equal(await readSetupState(stateFile),null);await fs.writeFile(stateFile,'{"schema":99}');assert.equal(await readSetupState(stateFile),null);
});
test('preflight checks installed tools, architecture, writable storage, and free space',async t=>{
 const {dir}=await fixture(t);const report=await preflight({dataDir:dir,binary:'b',helper:'h',ffmpeg:'f',platform:'win32',arch:'x64',access:async()=>{},diskStat:async()=>({bavail:MIN_DISK_BYTES,bsize:1})});assert.equal(report.ok,true);assert.equal(report.checks.length,6);
});
test('preflight reports missing tools, blocked platforms, and insufficient space',async t=>{
 const {dir}=await fixture(t);const report=await preflight({dataDir:dir,platform:'win32',arch:'arm64',access:async()=>{throw new Error();},diskStat:async()=>({bavail:1,bsize:1})});assert.equal(report.ok,false);assert.equal(report.checks.filter(c=>!c.ok).length,5);
});
