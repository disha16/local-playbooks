const $=id=>document.getElementById(id);let ready=false,busy=false,currentState='stopped';
function controls(){
  $('start').disabled=!ready||busy||['starting','recording','reading','stopping'].includes(currentState);
  $('stop').disabled=!['starting','recording'].includes(currentState);
  $('generate').disabled=!ready||busy;
  $('setup').disabled=busy||!$('setup').dataset.preflight;
  $('clear').disabled=busy;$('recheck').disabled=busy;
}
function state(value){currentState=value;$('state').textContent=value[0].toUpperCase()+value.slice(1);$('dot').className=value==='recording'?'recording':'';controls();}
function progress(message,error=false){$('progress').textContent=message;$('progress').className=error?'error':'';}
async function work(fn){if(busy)return;busy=true;controls();try{await fn();}catch(error){progress(error.message.replace(/^Error invoking remote method '[^']+': (Error: )?/,''),true);}finally{busy=false;controls();}}
async function refresh(){
  const info=await window.playbooks.setupStatus();ready=info.state?.completed===true&&info.preflight.ok;
  $('checks').replaceChildren(...info.preflight.checks.map(check=>{const p=document.createElement('p');p.textContent=`${check.ok?'✓':'✗'} ${check.label}${check.detail?': '+check.detail:''}`;if(!check.ok)p.className='check-failed';return p;}));
  $('setup').dataset.preflight=info.preflight.ok?'true':'';
  $('setup').textContent=ready?'Recheck installed models…':'Download models and finish setup…';
  $('memory').textContent=`${info.preflight.memoryGB} GB RAM detected. Local AI speed depends on this computer.`;
  $('permissions').textContent=`Screen: ${info.permissions.screen} · Microphone: ${info.permissions.microphone} · Accessibility: ${info.permissions.accessibility}`;
  if(ready)$('setup-progress').textContent='Setup complete. Recording is still stopped until you select Start.';
  controls();
}
$('setup').onclick=()=>work(async()=>{const result=await window.playbooks.setup({audio:$('setup-audio').checked});if(!result.cancelled){await refresh();progress('Setup complete. You can now start a sample recording.');}});
$('recheck').onclick=()=>work(refresh);
for(const kind of ['screen','microphone','accessibility'])$(`${kind}-permission`).onclick=()=>work(async()=>{await window.playbooks.openPermission(kind);await refresh();});
$('start').onclick=()=>work(async()=>{progress('Starting capture. Approve OS permissions if asked.');await window.playbooks.start({audio:$('audio').checked});progress('Recording. Select Stop when you finish.');});
// Stop remains available during startup.
$('stop').onclick=async()=>{try{await window.playbooks.stop();progress('Recording stopped.');}catch(e){progress(e.message,true);}};
$('generate').onclick=()=>work(async()=>{progress('Creating report with local AI…');const result=await window.playbooks.generate({mode:$('mode').value,hours:$('hours').value});$('report').textContent=result.markdown;$('saved').textContent='Saved locally';progress('Report saved. Review it before sharing.');});
$('folder').onclick=()=>work(()=>window.playbooks.openOutput());
$('clear').onclick=()=>work(async()=>{const result=await window.playbooks.clear();if(result.deleted){$('report').textContent='Your report will appear here.';$('saved').textContent='';$('setup-progress').textContent='';await refresh();progress('This desktop app’s recordings, reports, and model files were removed.');}});
window.playbooks.onState(state);window.playbooks.onProgress(progress);window.playbooks.onSetupProgress(value=>{
 const label={privacy:'Privacy Filter',summary:'Summary model',audio:'Audio models'}[value.phase]||'Setup';
 $('setup-progress').textContent=`${label}: ${value.status}${Number.isFinite(value.percent)?` · ${value.percent}%`:''}${value.detail?` · ${value.detail}`:''}`;
});
window.playbooks.status().then(state);refresh().catch(error=>progress(error.message,true));
