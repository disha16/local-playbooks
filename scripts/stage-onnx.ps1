$ErrorActionPreference = 'Stop'
$dest = Join-Path $PSScriptRoot '../engine-bin/win32-x64'
$work = Join-Path $PSScriptRoot '../work/onnx'
New-Item -ItemType Directory -Force $dest,$work | Out-Null
Invoke-WebRequest 'https://api.nuget.org/v3-flatcontainer/microsoft.ml.onnxruntime/1.22.0/microsoft.ml.onnxruntime.1.22.0.nupkg' -OutFile "$work/runtime.zip"
Expand-Archive "$work/runtime.zip" "$work/runtime" -Force
Copy-Item "$work/runtime/runtimes/win-x64/native/*.dll" $dest
Copy-Item "$work/runtime/LICENSE" "$dest/ONNXRUNTIME-LICENSE.txt"
if(Test-Path "$work/runtime/ThirdPartyNotices.txt"){Copy-Item "$work/runtime/ThirdPartyNotices.txt" "$dest/ONNXRUNTIME-THIRD-PARTY.txt"}
$vswhere="${env:ProgramFiles(x86)}/Microsoft Visual Studio/Installer/vswhere.exe"
$vs=& $vswhere -latest -products '*' -property installationPath
$crt=Get-ChildItem "$vs/VC/Redist/MSVC/*/x64/Microsoft.VC*.CRT" -Directory | Sort-Object FullName | Select-Object -Last 1
if(-not $crt){throw 'Visual C++ runtime files missing.'}
Copy-Item "$($crt.FullName)/*.dll" $dest
