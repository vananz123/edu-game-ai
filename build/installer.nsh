; EduGame Studio uninstaller customisation.
;
; Teacher data (lesson sources, saved games, projects and result history) must
; stay on the machine. The downloaded AI model/runtime cache is large and can
; always be downloaded again, so it is removed on uninstall instead of leaving
; several GB behind. This keeps DECISIONS #30 (preserve teacher data) while
; fixing the "models are not deleted" space leak.

!macro customUnInstall
  ; Electron stores the profile under %APPDATA%\<package name>. The product-name
  ; fallback covers installations created by older Electron/electron-builder
  ; combinations that used "EduGame Studio" as the folder name.
  ${if} $installMode == "all"
    SetShellVarContext current
  ${endif}
  RMDir /r "$APPDATA\edugame-studio\edugame-data\ai-local"
  RMDir /r "$APPDATA\EduGame Studio\edugame-data\ai-local"
  ${if} $installMode == "all"
    SetShellVarContext all
  ${endif}
!macroend
