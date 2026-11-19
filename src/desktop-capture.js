import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import net from 'node:net';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const CAPTURE_NAME = process.platform === 'win32' ? 'playbooks-capture.exe' : 'playbooks-capture';
export function captureDirectory(resourcesPath = process.resourcesPath) {
  return resourcesPath ? path.join(resourcesPath,'engine-bin') : fileURLToPath(new URL(`../engine-bin/${process.platform}-${process.arch}/`,import.meta.url));
}
export function captureArguments({dataDir,port=3030,parentPid=process.pid,audio=false,readOnly=false}) {
  if (!path.isAbsolute(dataDir) || !Number.isInteger(port) || port<1 || port>65535) throw new Error('Invalid capture settings');
  return ['record','--data-dir',dataDir,'--port',String(port),'--disable-telemetry','--audio-transcription-engine','whisper-tiny',
    '--auto-destruct-pid',String(parentPid),...(audio && !readOnly ? [] : ['--disable-audio']),...(readOnly ? ['--disable-vision'] : [])];
}
function portFree(port) {
  return new Promise((resolve,reject)=>{
    const s=net.createServer(); s.once('error',()=>reject(new Error(`Port ${port} is in use. Stop the other recorder first.`)));
    s.listen(port,'127.0.0.1',()=>s.close(resolve));
  });
}
export class CaptureManager {
  constructor({dataDir,directory=captureDirectory(),port=3030,spawnProcess=spawn,onState=()=>{},modelEnvironment={}}) {
    Object.assign(this,{dataDir,directory,port,spawnProcess,onState,modelEnvironment}); this.child=null; this.pending=null; this.state='stopped'; this.token=null; this.cancelRequested=false;
  }
  get baseUrl() { return `http://127.0.0.1:${this.port}`; }
  get headers() { return this.token ? {authorization:`Bearer ${this.token}`} : {}; }
  setState(state) { this.state=state; this.onState(state); }
  async start({audio=false,readOnly=false,timeoutMs=120000}={}) {
    if (this.pending) return this.pending;
    if (this.child) return;
    this.cancelRequested=false;
    this.pending=this.launch({audio,readOnly,timeoutMs}).finally(()=>{this.pending=null;});
    return this.pending;
  }
  async launch({audio,readOnly,timeoutMs}) {
    const binary=path.join(this.directory,CAPTURE_NAME);
    await fs.access(binary); await portFree(this.port);
    await fs.mkdir(this.dataDir,{recursive:true,mode:0o700});
    if(this.cancelRequested)throw new Error("Capture start cancelled.");
    this.token=randomBytes(32).toString('hex');
    // Inherit OS essentials, not cloud credentials or upstream feature switches.
    const env={};
    for (const key of ['PATH','SystemRoot','SYSTEMROOT','WINDIR','TEMP','TMP','TMPDIR','HOME','USERPROFILE','LOCALAPPDATA','APPDATA','LANG','LC_ALL']) if (process.env[key]) env[key]=process.env[key];
    Object.assign(env,this.modelEnvironment,{LOCAL_PLAYBOOKS_DESKTOP:'1',PATH:`${this.directory}${path.delimiter}${env.PATH||''}`,SCREENPIPE_DATA_DIR:this.dataDir,
      LOCAL_PLAYBOOKS_CAPTURE_TOKEN:this.token,LOCAL_PLAYBOOKS_READ_ONLY:readOnly?'1':'0',DO_NOT_TRACK:'1',HF_HUB_DISABLE_TELEMETRY:'1',
      ORT_DYLIB_PATH:path.join(this.directory,process.platform==='win32'?'onnxruntime.dll':process.platform==='darwin'?'libonnxruntime.dylib':'libonnxruntime.so')});
    const child=this.spawnProcess(binary,captureArguments({dataDir:this.dataDir,port:this.port,audio,readOnly}),{env,cwd:this.directory,stdio:'ignore',windowsHide:true});
    this.child=child; this.setState('starting');
    let failure;
    child.once('error',e=>{failure=e; if(this.child===child){this.child=null; this.setState('failed');}});
    child.once('exit',(code)=>{if(this.child===child){this.child=null; this.setState(code===0?'stopped':'failed');} });
    const deadline=Date.now()+timeoutMs;
    try {
      while(Date.now()<deadline) {
        if(failure) throw failure;
        if(this.child!==child) throw new Error('Capture exited. Check permissions and bundled dependencies.');
        try {
          const r=await fetch(`${this.baseUrl}/health`,{headers:this.headers,signal:AbortSignal.timeout(1500)});
          if(r.ok && this.child===child) {this.setState(readOnly?'reading':'recording'); return;}
        } catch {}
        await new Promise(r=>setTimeout(r,300));
      }
      throw new Error('Capture did not become ready. Check screen/microphone permissions.');
    } catch(e) { const cancelled=this.cancelRequested; await this.stop(); this.setState(cancelled?'stopped':'failed'); throw e; }
  }
  async withHistory(fn) {
    const temporary=!this.child;
    if(temporary) await this.start({readOnly:true});
    try{return await fn({baseUrl:this.baseUrl,headers:this.headers});}
    finally{if(temporary)await this.stop();}
  }
  async stop() {
    if(this.pending)this.cancelRequested=true;
    const child=this.child; if(!child) return;
    this.child=null; this.setState('stopping');
    await new Promise(resolve=>{
      let timer; const done=()=>{clearTimeout(timer);resolve();};
      child.once('exit',done); child.kill('SIGTERM');
      timer=setTimeout(()=>{child.kill('SIGKILL');resolve();},3000); timer.unref?.();
    });
    this.token=null; this.setState('stopped');
  }
}
