// Expand file names here: Windows command shells do not expand test/*.test.js.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
const root=fileURLToPath(new URL('../',import.meta.url));
const files=(await fs.readdir(path.join(root,'test'))).filter(name=>name.endsWith('.test.js')).sort().map(name=>path.join(root,'test',name));
const child=spawn(process.execPath,['--test',...files],{cwd:root,stdio:'inherit'});
child.once('error',error=>{console.error(error.message);process.exitCode=1;});
child.once('exit',code=>{process.exitCode=code??1;});
