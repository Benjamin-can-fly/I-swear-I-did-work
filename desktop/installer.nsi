Unicode true
!include "MUI2.nsh"
!include "LogicLib.nsh"
!include "FileFunc.nsh"
!include "x64.nsh"
!define MUI_ICON "${__FILEDIR__}\assets\app.ico"
Name "Work Log"
OutFile "${OUTPUT}"
InstallDir "$LOCALAPPDATA\Programs\WorkJournalPreview"
; Also locate pre-notification versions, which saved only UninstallString.
InstallDirRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\WorkJournalPreview" "UninstallString"
RequestExecutionLevel user
SetCompressor /SOLID lzma
!define MUI_ABORTWARNING
!define MUI_FINISHPAGE_RUN "$INSTDIR\WorkJournal.exe"
!define MUI_FINISHPAGE_RUN_NOTCHECKED
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "SimpChinese"
Var RepairOnly
Function .onInit
 SetShellVarContext current
 StrCpy $RepairOnly 0
 ${GetParameters} $0
 ClearErrors
 ${GetOptions} $0 "/REGISTERONLY" $1
 ${IfNot} ${Errors}
  StrCpy $RepairOnly 1
  SetSilent silent
 ${EndIf}
FunctionEnd

; nsExec captures output without opening a console. Use native Windows
; PowerShell even though the NSIS bootstrap runs as a 32-bit process.
!macro RunRegistration MODE HELPERS
 StrCpy $0 "$SYSDIR\WindowsPowerShell\v1.0\powershell.exe"
 ${If} ${RunningX64}
  StrCpy $0 "$WINDIR\Sysnative\WindowsPowerShell\v1.0\powershell.exe"
 ${EndIf}
 nsExec::ExecToLog '"$0" -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "${HELPERS}\Register-WorkLog.ps1" -Mode ${MODE} -InstallDir "$INSTDIR"'
 Pop $0
 ${If} $0 != "0"
  DetailPrint "Work Log Windows registration failed: $0"
  SetErrorLevel 1
  IfSilent +2 0
   MessageBox MB_ICONSTOP|MB_OK "Work Log 的 Windows 注册未能完成。请查看安装详情。"
  Abort
 ${EndIf}
!macroend
Section "Work Log" Main
 SetOutPath "$INSTDIR"
 ${If} $RepairOnly == 1
  ; In-place repair never opens or replaces the running app or user data.
  IfFileExists "$INSTDIR\WorkJournal.exe" +3 0
   SetErrorLevel 1
   Abort "No existing Work Log installation found."
 ${Else}
 File /r "${STAGE}\*"
 ExecWait '"$INSTDIR\WorkJournal.exe" --check-runtime' $0
 ${If} $0 != 0
  MessageBox MB_OKCANCEL "需要安装 Microsoft WebView2 运行组件。点击确定后联网安装。" IDOK InstallRuntime IDCANCEL EndRuntime
  InstallRuntime:
  ExecWait '"$INSTDIR\MicrosoftEdgeWebview2Setup.exe" /silent /install' $0
  ExecWait '"$INSTDIR\WorkJournal.exe" --check-runtime' $0
  ${If} $0 != 0
   MessageBox MB_OK "运行组件尚未安装成功。请联网后运行安装目录中的 MicrosoftEdgeWebview2Setup.exe，再打开 Work Log。"
  ${EndIf}
  EndRuntime:
 ${EndIf}
 ${EndIf}
 File "${__FILEDIR__}\Register-WorkLog.ps1"
 File "${__FILEDIR__}\RegistrationShortcut.cs"
 WriteUninstaller "$INSTDIR\Uninstall.exe"
 !insertmacro RunRegistration "Install" "$INSTDIR"
 ${If} $RepairOnly == 0
  ; Keep a customized icon or another app's same-named shortcut.
  IfFileExists "$DESKTOP\Work Log.lnk" +2 0
   CreateShortcut "$DESKTOP\Work Log.lnk" "$INSTDIR\WorkJournal.exe" "" "$INSTDIR\WorkJournal.ico" 0
 ${EndIf}
SectionEnd
Section "Uninstall"
 SetShellVarContext current
 InitPluginsDir
 SetOutPath "$PLUGINSDIR"
 File "${__FILEDIR__}\Register-WorkLog.ps1"
 File "${__FILEDIR__}\RegistrationShortcut.cs"
 !insertmacro RunRegistration "Uninstall" "$PLUGINSDIR"
 ; Delete only the files shipped by this installer. Keep user data in LocalAppData.
 Delete "$INSTDIR\Register-WorkLog.ps1"
 Delete "$INSTDIR\RegistrationShortcut.cs"
 Delete "$INSTDIR\WorkJournal.exe"
 Delete "$INSTDIR\WorkJournal.ico"
 Delete "$INSTDIR\Microsoft.Web.WebView2.Core.dll"
 Delete "$INSTDIR\Microsoft.Web.WebView2.WinForms.dll"
 Delete "$INSTDIR\WebView2Loader.dll"
 Delete "$INSTDIR\MicrosoftEdgeWebview2Setup.exe"
 Delete "$INSTDIR\Uninstall.exe"
 Delete "$INSTDIR\使用说明.pdf"
 Delete "$INSTDIR\首次使用.txt"
 Delete "$INSTDIR\THIRD-PARTY-NOTICES.txt"
 Delete "$INSTDIR\LICENSE"
 Delete "$INSTDIR\runtime\node.exe"
 Delete "$INSTDIR\runtime\LICENSE"
 RMDir "$INSTDIR\runtime"
 !include "${UNINSTALL_FILES}"
 RMDir "$INSTDIR"
SectionEnd





