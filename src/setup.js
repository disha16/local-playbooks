// First-run setup only. No capture process or recorder is imported here.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

export const SETUP_SCHEMA = 1;
export const MIN_DISK_BYTES = 8 * 1024 ** 3;
export const SETUP_PHASES = ['privacy', 'summary', 'audio'];
export function validateSetupState(value) {
  return value?.schema === SETUP_SCHEMA && typeof value.components === 'object' && value.components !== null;
}
export async function readSetupState(file) {
  try { const state = JSON.parse(await fs.readFile(file, 'utf8')); return validateSetupState(state) ? state : null; }
  catch (error) { if (error.code === 'ENOENT' || error instanceof SyntaxError) return null; throw error; }
}
async function saveState(file, state) {
  await fs.mkdir(path.dirname(file), {recursive:true, mode:0o700});
  const temporary = `${file}.tmp`;
  await fs.writeFile(temporary, `${JSON.stringify(state, null, 2)}\n`, {mode:0o600});
  await fs.rename(temporary, file);
}
export async function preflight({dataDir, binary, helper, ffmpeg, platform=process.platform, arch=process.arch,
  diskStat=fs.statfs, access=fs.access}={}) {
  const checks = [];
  checks.push({label:'Supported computer',ok:(platform==='win32' && arch==='x64') || (platform==='darwin' && arch==='arm64'),detail:`${platform} ${arch}`});
  for (const [label, file] of [['Screen recorder',binary],['Audio model setup',helper],['Media tools',ffmpeg]]) {
    try { if(!file) throw new Error(); await access(file); checks.push({label,ok:true}); }
    catch { checks.push({label,ok:false,detail:'Missing from this installation. Reinstall the complete app.'}); }
  }
  try {
    await fs.mkdir(dataDir,{recursive:true,mode:0o700});
    const probe=path.join(dataDir,`.setup-write-${process.pid}`);
    await fs.writeFile(probe,'',{flag:'wx',mode:0o600});await fs.unlink(probe);
    checks.push({label:'Local storage is writable',ok:true});
  } catch { checks.push({label:'Local storage is writable',ok:false,detail:'This account cannot save app data. Ask the computer owner.'}); }
  try {
    const stats=await diskStat(dataDir); const bytes=Number(stats.bavail)*Number(stats.bsize);
    checks.push({label:'Space for local models',ok:bytes>=MIN_DISK_BYTES,detail:`${(bytes/1024**3).toFixed(1)} GB free; allow at least 8 GB, plus recording space.`});
  } catch { checks.push({label:'Space for local models',ok:false,detail:'Free space could not be checked.'}); }
  return {ok:checks.every(c=>c.ok),checks,memoryGB:Math.round(os.totalmem()/1024**3)};
}
export class SetupManager {
  constructor({stateFile,preparePrivacy,prepareSummary,prepareAudio,onProgress=()=>{}}) {
    Object.assign(this,{stateFile,preparePrivacy,prepareSummary,prepareAudio,onProgress});this.pending=null;
  }
  async status() { return readSetupState(this.stateFile); }
  async reset() { if(this.pending) throw new Error('Wait for setup to finish.'); await fs.rm(this.stateFile,{force:true}); }
  run({audio=true}={}) {
    if(this.pending) return this.pending;
    this.pending=this.perform({audio}).finally(()=>{this.pending=null;});return this.pending;
  }
  async perform({audio}) {
    // Cached model files are reused by each loader. Re-run checks on retry rather
    // than trusting a marker after files may have been removed from a shared PC.
    const state={schema:SETUP_SCHEMA,components:{},completed:false};
    await saveState(this.stateFile,state);
    for(const phase of SETUP_PHASES) {
      if(phase==='audio' && !audio)continue;
      this.onProgress({phase,status:'running'});
      try {
        await this[{privacy:'preparePrivacy',summary:'prepareSummary',audio:'prepareAudio'}[phase]]();
        state.components[phase]={ready:true};await saveState(this.stateFile,state);
        this.onProgress({phase,status:'ready'});
      } catch(error) {
        // Never persist raw model errors, local paths, or captured text.
        state.failedPhase=phase;await saveState(this.stateFile,state);
        this.onProgress({phase,status:'failed'});throw error;
      }
    }
    state.completed=true;state.audio=audio;state.completedAt=new Date().toISOString();
    await saveState(this.stateFile,state);return state;
  }
}
