Unicode true
!include "MUI2.nsh"
!include "LogicLib.nsh"
!define MUI_ICON "${__FILEDIR__}\assets\app.ico"
Name "Work Log"
OutFile "${OUTPUT}"
InstallDir "$LOCALAPPDATA\Programs\WorkJournalPreview"
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
Section "Work Log" Main
 SetOutPath "$INSTDIR"
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
 WriteUninstaller "$INSTDIR\Uninstall.exe"
 CreateShortcut "$DESKTOP\Work Log.lnk" "$INSTDIR\WorkJournal.exe" "" "$INSTDIR\WorkJournal.ico" 0
 CreateDirectory "$SMPROGRAMS\Work Log"
 CreateShortcut "$SMPROGRAMS\Work Log\Work Log.lnk" "$INSTDIR\WorkJournal.exe" "" "$INSTDIR\WorkJournal.ico" 0
 WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\WorkJournalPreview" "DisplayName" "Work Log"
 WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\WorkJournalPreview" "UninstallString" '"$INSTDIR\Uninstall.exe"'
 WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\WorkJournalPreview" "DisplayVersion" "${VERSION}"
 WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\WorkJournalPreview" "NoModify" 1
 WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\WorkJournalPreview" "NoRepair" 1
SectionEnd
Section "Uninstall"
 Delete "$DESKTOP\Work Log.lnk"
 Delete "$DESKTOP\Work Log.lnk"
 Delete "$SMPROGRAMS\Work Log\Work Log.lnk"
 RMDir "$SMPROGRAMS\Work Log"
 ; Delete only the files shipped by this installer. Keep user data in LocalAppData.
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
 DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\WorkJournalPreview"
SectionEnd





