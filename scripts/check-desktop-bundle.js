import fs from 'node:fs/promises';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
export async function checkBundle({platform=process.platform,arch=process.arch}={}){
  const directory=fileURLToPath(new URL(`../engine-bin/${platform}-${arch}/`,import.meta.url));
  const suffix=platform==='win32'?'.exe':'';
  for(const name of [`playbooks-capture${suffix}`,`playbooks-prepare-models${suffix}`,`ffmpeg${suffix}`,'FFMPEG-LICENSE.txt','ONNXRUNTIME-LICENSE.txt'])await fs.access(path.join(directory,name));
  if(platform==='win32')for(const file of ['onnxruntime.dll','vcruntime140.dll','msvcp140.dll'])await fs.access(path.join(directory,file));
  if(platform!==process.platform||arch!==process.arch)throw new Error('Build on the matching operating system and architecture.');
  for(const name of ['playbooks-capture','playbooks-prepare-models','ffmpeg']){
    const args=name==='ffmpeg'?['-version']:['--version'];
    const result=spawnSync(path.join(directory,`${name}${suffix}`),args,{encoding:'utf8',timeout:30000});
    if(result.status!==0)throw new Error(`Bundled ${name} cannot run; check its runtime libraries.`);
    if(name==='ffmpeg'&&/--enable-(gpl|nonfree)/i.test(result.stdout+result.stderr))throw new Error('Use LGPL FFmpeg without GPL/nonfree codecs.');
  }
  console.log('Bundled executables and runtime files are present and runnable.');
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))await checkBundle();
