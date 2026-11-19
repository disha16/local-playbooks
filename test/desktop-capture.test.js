import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import {fileURLToPath} from 'node:url';
import {CaptureManager,CAPTURE_NAME,captureArguments} from '../src/desktop-capture.js';
const fixture=fileURLToPath(new URL('./fixtures/capture-child.cjs',import.meta.url));
async function freePort(){const s=net.createServer();await new Promise(r=>s.listen(0,'127.0.0.1',r));const port=s.address().port;await new Promise(r=>s.close(r));return port;}
test('capture uses local transcription, no telemetry, explicit audio opt-in',()=>{
  const args=captureArguments({dataDir:path.resolve('work/capture')});assert.ok(args.includes('--disable-audio'));assert.ok(args.includes('--disable-telemetry'));assert.ok(args.includes('whisper-tiny'));assert.ok(!captureArguments({dataDir:path.resolve('work/capture'),audio:true}).includes('--disable-audio'));assert.ok(captureArguments({dataDir:path.resolve('work/capture'),readOnly:true}).includes('--disable-vision'));
});
async function makeManager(){
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'playbooks-test-')),port=await freePort(),states=[];let captured,args;
 await fs.writeFile(path.join(dir,CAPTURE_NAME),'test');
 const manager=new CaptureManager({directory:dir,dataDir:path.join(dir,'data'),port,onState:s=>states.push(s),spawnProcess:(_bin,a,options)=>{args=a;captured=options;return spawn(process.execPath,[fixture],{...options,env:{...options.env,TEST_CAPTURE_PORT:String(port)}});}});
 return {manager,dir,states,get captured(){return captured;},get args(){return args;}};
}
test('managed child authenticates health, strips cloud credentials, and stops',async()=>{
  const setup=await makeManager(),{manager,dir,states}=setup;process.env.TINFOIL_API_KEY='do-not-inherit';
  try{await manager.start({timeoutMs:5000});assert.equal(manager.state,'recording');assert.equal(setup.captured.env.TINFOIL_API_KEY,undefined);assert.ok(manager.token.length>=32);assert.equal((await fetch(`${manager.baseUrl}/health`)).status,403);await manager.stop();assert.equal(manager.child,null);assert.equal(manager.state,'stopped');assert.deepEqual(states,['starting','recording','stopping','stopped']);}
  finally{delete process.env.TINFOIL_API_KEY;await manager.stop();await fs.rm(dir,{recursive:true,force:true});}
});
test('history-only mode stops temporary child after a failed report',async()=>{
  const setup=await makeManager(),{manager,dir}=setup;
  try{await assert.rejects(manager.withHistory(async()=>{throw new Error('Report failed');}),/Report failed/);assert.ok(setup.args.includes('--disable-vision'));assert.equal(manager.state,'stopped');assert.equal(manager.child,null);}finally{await manager.stop();await fs.rm(dir,{recursive:true,force:true});}
});
test('missing binary fails before recording starts',async()=>{const m=new CaptureManager({directory:path.resolve('not-an-installed-bundle'),dataDir:path.resolve('work/test-capture')});await assert.rejects(m.start(),/ENOENT/);assert.equal(m.child,null);});
