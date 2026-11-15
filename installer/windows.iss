; Windows installer for local-playbooks. Installs for the current user (no admin needed).
#define Version GetEnv("APP_VERSION")

[Setup]
AppId={{6C0B6A5E-2B0C-4C0E-9A53-6E3D7B1F4A21}
AppName=Local Playbooks
AppVersion={#Version}
AppPublisher=local-playbooks
DefaultDirName={localappdata}\LocalPlaybooks
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
OutputDir=..\dist
OutputBaseFilename=local-playbooks-{#Version}-windows-x64-setup
Compression=lzma2
SolidCompression=yes
ChangesEnvironment=yes
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
LicenseFile=..\LICENSE

[Files]
Source: "..\stage\*"; DestDir: "{app}"; Flags: recursesubdirs ignoreversion

[Registry]
; Put the local-playbooks command on the user's PATH
Root: HKCU; Subkey: "Environment"; ValueType: expandsz; ValueName: "Path"; ValueData: "{olddata};{app}"; Check: NeedsAddPath(ExpandConstant('{app}'))

[Code]
function NeedsAddPath(Param: string): Boolean;
var
  OrigPath: string;
begin
  if not RegQueryStringValue(HKEY_CURRENT_USER, 'Environment', 'Path', OrigPath) then
  begin
    Result := True;
    exit;
  end;
  Result := Pos(';' + Lowercase(Param) + ';', ';' + Lowercase(OrigPath) + ';') = 0;
end;
