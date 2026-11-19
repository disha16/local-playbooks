const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('playbooks',{
  setupStatus:()=>ipcRenderer.invoke('setup-status'),setup:options=>ipcRenderer.invoke('setup-run',options),
  permissions:()=>ipcRenderer.invoke('permissions'),openPermission:kind=>ipcRenderer.invoke('open-permissions',kind),
  start:options=>ipcRenderer.invoke('capture-start',options),stop:()=>ipcRenderer.invoke('capture-stop'),status:()=>ipcRenderer.invoke('capture-status'),
  generate:options=>ipcRenderer.invoke('generate',options),openOutput:()=>ipcRenderer.invoke('open-output'),clear:()=>ipcRenderer.invoke('clear-local-data'),
  onState:fn=>ipcRenderer.on('capture-state',(_e,value)=>fn(value)),onProgress:fn=>ipcRenderer.on('progress',(_e,value)=>fn(value)),
  onSetupProgress:fn=>ipcRenderer.on('setup-progress',(_e,value)=>fn(value))
});
