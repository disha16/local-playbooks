; Install only for the signed-in user. The app's first-run screen prepares models.
; Do not ask for administrator elevation, start capture, or change security policy.
!macro customInstallMode
  StrCpy $isForceCurrentInstall "1"
!macroend
