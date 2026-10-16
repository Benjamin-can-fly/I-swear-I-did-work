param([Parameter(Mandatory=$true)][string]$Executable,[Parameter(Mandatory=$true)][string]$Output,[switch]$CloseAfter,[switch]$CheckReopen)
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Drawing,System.Windows.Forms
Add-Type @'
using System;using System.Runtime.InteropServices;
public class WindowProbe {
 [StructLayout(LayoutKind.Sequential)] public struct Rect {public int Left,Top,Right,Bottom;}
 [DllImport("user32.dll")] public static extern IntPtr SetThreadDpiAwarenessContext(IntPtr c);
 [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h,out Rect r);
 [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
 [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr h,IntPtr after,int x,int y,int w,int height,uint flags);
}
'@
[WindowProbe]::SetThreadDpiAwarenessContext([IntPtr](-4)) | Out-Null
New-Item -ItemType Directory -Path $Output -Force | Out-Null
$area=[Windows.Forms.Screen]::FromPoint([Windows.Forms.Cursor]::Position).WorkingArea
$clock=[Diagnostics.Stopwatch]::StartNew()
$app=Start-Process -FilePath $Executable -PassThru
try {
 do {$app.Refresh();Start-Sleep -Milliseconds 15} while($app.MainWindowHandle -eq 0 -and !$app.HasExited -and $clock.ElapsedMilliseconds -lt 10000)
 if($app.MainWindowHandle -eq 0){throw 'App did not show a window'}
 $first=$clock.ElapsedMilliseconds
 [WindowProbe]::SetForegroundWindow($app.MainWindowHandle) | Out-Null
 $samples=@()
 for($i=0;$i -lt 65;$i++){
  $rect=New-Object WindowProbe+Rect
  [WindowProbe]::GetWindowRect($app.MainWindowHandle,[ref]$rect) | Out-Null
  $samples+=@{ms=$clock.ElapsedMilliseconds;left=$rect.Left;top=$rect.Top;width=$rect.Right-$rect.Left;height=$rect.Bottom-$rect.Top}
  $bitmap=New-Object Drawing.Bitmap 520,430
  $g=[Drawing.Graphics]::FromImage($bitmap)
  try{$g.CopyFromScreen(($rect.Left+($rect.Right-$rect.Left)/2-260),($rect.Top+($rect.Bottom-$rect.Top)/2-215),0,0,$bitmap.Size);$bitmap.Save((Join-Path $Output ('frame-{0:D3}.png' -f $i)))}finally{$g.Dispose();$bitmap.Dispose()}
  Start-Sleep -Milliseconds 35
 }
 $last=$samples[-1];$dx=[Math]::Abs(($last.left+$last.width/2)-($area.Left+$area.Width/2));$dy=[Math]::Abs(($last.top+$last.height/2)-($area.Top+$area.Height/2))
 if($dx -gt 1 -or $dy -gt 1){throw "Window is not centered: $dx,$dy"}
 if($CheckReopen){
  [WindowProbe]::SetWindowPos($app.MainWindowHandle,[IntPtr]::Zero,($area.Right-500),($area.Bottom-500),0,0,5) | Out-Null
  $second=Start-Process -FilePath $Executable -PassThru
  if(!$second.WaitForExit(5000)){throw 'Second launch did not reuse existing window'}
  Start-Sleep -Milliseconds 200
  [WindowProbe]::GetWindowRect($app.MainWindowHandle,[ref]$rect) | Out-Null
  $dx=[Math]::Abs(($rect.Left+$rect.Right)/2-($area.Left+$area.Right)/2);$dy=[Math]::Abs(($rect.Top+$rect.Bottom)/2-($area.Top+$area.Bottom)/2)
  if($dx -gt 1 -or $dy -gt 1){throw "Reopened window is not centered: $dx,$dy"}
 }
 @{firstWindowMs=$first;screen=@{left=$area.Left;top=$area.Top;width=$area.Width;height=$area.Height};samples=$samples;reopenChecked=[bool]$CheckReopen;centerError=@($dx,$dy)} | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $Output 'result.json') -Encoding UTF8
 Write-Output "PASS centered window; first visible window $first ms; center error $dx,$dy; reopen=$CheckReopen"
}finally{if($CloseAfter -and !$app.HasExited){$app.CloseMainWindow() | Out-Null;$app.WaitForExit(5000) | Out-Null}}
