import {app,BrowserWindow,ipcMain,dialog,shell,session,systemPreferences} from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {SetupManager,preflight} from '../src/setup.js';
import {CaptureManager,captureDirectory} from '../src/desktop-capture.js';
import {createNameDetector,redactNames} from '../src/names.js';
import {run} from '../src/pipeline.js';
import {runMap} from '../src/processmap/index.js';

const here=path.dirname(fileURLToPath(import.meta.url));
const userData=path.join(app.getPath('appData'),'LocalPlaybooks');
app.setPath('userData',userData);
const payload=path.join(userData,'local-data');
const modelEnvironment={
  LOCAL_PLAYBOOKS_MODELS_DIR:path.join(payload,'models'),
  LOCAL_PLAYBOOKS_PRIVACY_CACHE:path.join(payload,'privacy'),
  LOCAL_PLAYBOOKS_AUDIO_CACHE:path.join(payload,'audio-models'),
  HF_HOME:path.join(payload,'huggingface'),HF_HUB_DISABLE_TELEMETRY:'1',DO_NOT_TRACK:'1'
};
Object.assign(process.env,modelEnvironment);
const outputDir=path.join(payload,'reports');
let window,capture,setup,busy=false,quitting=false;
const send=(channel,data)=>{if(window&&!window.isDestroyed())window.webContents.send(channel,data);};
const guarded=fn=>async(event,...args)=>{
  if(event.sender!==window?.webContents || event.senderFrame!==window.webContents.mainFrame)throw new Error('Untrusted window');
  return fn(...args);
};
const exclusive=fn=>async(...args)=>{
  if(busy)throw new Error('Wait for the current task to finish.');busy=true;
  try{return await fn(...args);}finally{busy=false;}
};
function permissions(){
  return {screen:process.platform==='darwin'?systemPreferences.getMediaAccessStatus('screen'):'managed by Windows',
    microphone:systemPreferences.getMediaAccessStatus('microphone'),
    accessibility:process.platform==='darwin'?(systemPreferences.isTrustedAccessibilityClient(false)?'granted':'not granted'):'managed by Windows'};
}
function runAudioSetup(binary,directory){
  return new Promise((resolve,reject)=>{
    // Model preparation opens no capture devices and has no recorder dependency.
    const env={...modelEnvironment};
    for(const key of ['PATH','SystemRoot','SYSTEMROOT','WINDIR','TEMP','TMP','TMPDIR','HOME','USERPROFILE','APPDATA','LOCALAPPDATA','LANG'])if(process.env[key])env[key]=process.env[key];
    env.PATH=`${directory}${path.delimiter}${env.PATH||''}`;
    if(process.platform==='win32')env.ORT_DYLIB_PATH=path.join(directory,'onnxruntime.dll');
    const child=spawn(binary,['--download'],{cwd:directory,env,stdio:['ignore','pipe','ignore'],windowsHide:true});
    let pending='';
    child.stdout.on('data',chunk=>{
      pending+=chunk.toString();const lines=pending.split(/\r?\n/);pending=lines.pop().slice(-200);
      for(const line of lines)if(/^SETUP [a-z-]+$/.test(line))send('setup-progress',{phase:'audio',status:'running',detail:line.slice(6)});
    });
    const timeout=setTimeout(()=>{child.kill();reject(new Error('Audio setup timed out. Check your network connection, then retry.'));},30*60e3);
    child.once('close',()=>clearTimeout(timeout));
    child.once('error',()=>reject(new Error('Audio setup could not start. Reinstall the complete app.')));
    child.once('exit',code=>code===0?resolve():reject(new Error('Audio model setup failed. Check your connection and free disk space, then retry.')));
  });
}
app.whenReady().then(async()=>{
  const directory=captureDirectory(app.isPackaged?process.resourcesPath:null);
  const suffix=process.platform==='win32'?'.exe':'';
  const files={binary:path.join(directory,`playbooks-capture${suffix}`),helper:path.join(directory,`playbooks-prepare-models${suffix}`),ffmpeg:path.join(directory,`ffmpeg${suffix}`)};
  const check=()=>preflight({...files,dataDir:payload});
  capture=new CaptureManager({directory,dataDir:path.join(payload,'capture'),modelEnvironment,onState:s=>send('capture-state',s)});
  setup=new SetupManager({stateFile:path.join(payload,'setup.json'),onProgress:p=>send('setup-progress',p),
    preparePrivacy:async()=>{
      const detector=await createNameDetector({allowDownload:true,cacheDir:modelEnvironment.LOCAL_PLAYBOOKS_PRIVACY_CACHE,onProgress:p=>{
        if(Number.isFinite(p.progress))send('setup-progress',{phase:'privacy',status:'running',percent:Math.round(p.progress)});
      }});
      if(!detector)throw new Error('Privacy Filter is missing from this app. Reinstall it.');
      try{await detector('Alice Smith lives at 12 Example Road.');}finally{await detector.close();}
    },
    prepareSummary:async()=>{
      const {createLocalEngine}=await import('../src/llm/local.js');
      const engine=await createLocalEngine({allowDownload:true,onProgress:p=>{
        if(p.totalSize>0)send('setup-progress',{phase:'summary',status:'running',percent:Math.round(p.downloadedSize/p.totalSize*100)});
      }});
      try{await engine.complete('Reply with one word.','Say OK.');}finally{await engine.close();}
    },
    prepareAudio:()=>runAudioSetup(files.helper,directory)
  });
  session.defaultSession.webRequest.onBeforeRequest((details,callback)=>callback({cancel:!details.url.startsWith('file:')&&!details.url.startsWith('devtools:')}));
  ipcMain.handle('setup-status',guarded(async()=>({state:await setup.status(),preflight:await check(),permissions:permissions(),outputDir})));
  ipcMain.handle('setup-run',guarded(exclusive(async options=>{
    if(!(await check()).ok)throw new Error('Resolve the computer checks before downloading models.');
    const answer=await dialog.showMessageBox(window,{type:'question',buttons:['Cancel','Download and set up'],cancelId:0,defaultId:0,
      message:'Prepare Local Playbooks on this computer?',detail:'Downloads several GB of local AI models and checks them. No screen or microphone recording takes place. The default Llama model has Meta’s separate model terms. Only continue if you may install software on this computer.'});
    if(answer.response!==1)return {cancelled:true};
    return {state:await setup.run({audio:options?.audio!==false})};
  })));
  ipcMain.handle('permissions',guarded(async()=>permissions()));
  ipcMain.handle('open-permissions',guarded(async kind=>{
    if(!['screen','microphone','accessibility'].includes(kind))throw new Error('Unknown permission');
    const mac={screen:'Privacy_ScreenCapture',microphone:'Privacy_Microphone',accessibility:'Privacy_Accessibility'};
    if(process.platform==='darwin')return shell.openExternal(`x-apple.systempreferences:com.apple.preference.security?${mac[kind]}`);
    if(kind==='microphone')return shell.openExternal('ms-settings:privacy-microphone');
    return dialog.showMessageBox(window,{message:'Windows manages this permission',detail:'Start a sample recording to check access. If this computer blocks recording, ask its owner or library staff. The app cannot override their settings.'});
  }));
  ipcMain.handle('capture-start',guarded(exclusive(async options=>{
    const state=await setup.status();
    if(!state?.completed)throw new Error('Finish setup first.');
    if(options?.audio&&!state.audio)throw new Error('Run setup with audio models enabled first.');
    if(process.platform==='darwin' && options?.audio && !(await systemPreferences.askForMediaAccess('microphone')))throw new Error('Microphone access is denied. Open microphone settings or record without audio.');
    return capture.start({audio:options?.audio===true});
  })));
  ipcMain.handle('capture-stop',guarded(()=>capture.stop()));
  ipcMain.handle('capture-status',guarded(()=>capture.state));
  ipcMain.handle('generate',guarded(exclusive(async options=>{
    if(!['summary','playbook','map'].includes(options?.mode))throw new Error('Choose a report type.');
    const hours=Number(options.hours);if(!Number.isFinite(hours)||hours<=0||hours>168)throw new Error('Choose a valid time window.');
    if(!(await setup.status())?.completed)throw new Error('Finish setup first.');
    const end=new Date(),start=new Date(+end-hours*3600e3);
    const detector=await createNameDetector({allowDownload:false,cacheDir:modelEnvironment.LOCAL_PLAYBOOKS_PRIVACY_CACHE});
    if(!detector)throw new Error('Privacy Filter is missing. Run setup again.');
    let engine;
    try{
      if(options.mode!=='map')engine=await(await import('../src/llm/local.js')).createLocalEngine({allowDownload:false});
      const result=await capture.withHistory(async({baseUrl,headers})=>{
        const common={start,end,screenpipeUrl:baseUrl,headers,onStep:message=>send('progress',message)};
        return options.mode==='map'?runMap({...common,by:'app'}):run({...common,mode:options.mode,engine,nameDetector:detector});
      });
      if(!result.markdown)throw new Error('No activity in this window. Record a short sample workflow first.');
      const markdown=(await redactNames(result.markdown,detector)).text;
      await fs.mkdir(outputDir,{recursive:true,mode:0o700});
      const file=path.join(outputDir,`${new Date().toISOString().replace(/[:.]/g,'-')}-${options.mode}.md`);
      await fs.writeFile(file,markdown,{mode:0o600});return {markdown,file};
    }finally{await engine?.close();await detector.close();}
  })));
  ipcMain.handle('open-output',guarded(async()=>{await fs.mkdir(outputDir,{recursive:true,mode:0o700});return shell.openPath(outputDir);}));
  ipcMain.handle('clear-local-data',guarded(exclusive(async()=>{
    const answer=await dialog.showMessageBox(window,{type:'warning',buttons:['Cancel','Delete this app’s local data'],defaultId:0,cancelId:0,
      message:'Delete Local Playbooks data on this computer?',detail:'Stops recording and deletes this desktop app’s recordings, reports, models, and setup state. This cannot be undone. Copies you saved elsewhere and older command-line files are not deleted.'});
    if(answer.response!==1)return {cancelled:true};
    await capture.stop();await fs.rm(payload,{recursive:true,force:true});return {deleted:true};
  })));
  window=new BrowserWindow({width:1080,height:860,minWidth:850,minHeight:680,title:'Local Playbooks',backgroundColor:'#f5f5f0',
    webPreferences:{preload:path.join(here,'preload.cjs'),sandbox:true,contextIsolation:true,nodeIntegration:false}});
  window.webContents.setWindowOpenHandler(()=>({action:'deny'}));window.webContents.on('will-navigate',event=>event.preventDefault());
  await window.loadFile(path.join(here,'index.html'));
});
app.on('window-all-closed',()=>app.quit());
app.on('before-quit',event=>{
  if(quitting)return;
  if(busy){event.preventDefault();dialog.showMessageBox(window,{message:'Finish the current task before closing',detail:'Wait for setup or report generation to finish before quitting.'});return;}
  if(!capture?.child)return;event.preventDefault();quitting=true;capture.stop().finally(()=>app.quit());
});
