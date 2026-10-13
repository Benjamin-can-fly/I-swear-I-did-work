using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Net;
using System.Threading;
using System.Threading.Tasks;
using System.Runtime.InteropServices;
using System.Windows.Forms;
using System.Web.Script.Serialization;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

static class Program {
 public static readonly Stopwatch LaunchClock=Stopwatch.StartNew();
 [STAThread] static void Main(string[] args) {
  LaunchClock.Start();bool testing=Environment.GetEnvironmentVariable("WORKJOURNAL_TEST_MODE")=="1";
  if(!testing){
   string settings=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"WorkJournal","desktop-settings.json");
   if(File.Exists(settings))try{
    var config=new JavaScriptSerializer().Deserialize<System.Collections.Generic.Dictionary<string,object>>(File.ReadAllText(settings));
    if(config.ContainsKey("dataDirectory")&&Environment.GetEnvironmentVariable("WORKJOURNAL_DATA_DIR")==null)Environment.SetEnvironmentVariable("WORKJOURNAL_DATA_DIR",Path.GetFullPath((string)config["dataDirectory"]));
    if(config.ContainsKey("port")&&Environment.GetEnvironmentVariable("WORKJOURNAL_PORT")==null)Environment.SetEnvironmentVariable("WORKJOURNAL_PORT",config["port"].ToString());
   }catch(Exception ex){MessageBox.Show("无法读取本机数据位置设置："+ex.Message,"Work Log");return;}
  }
  for(int i=0;i+1<args.Length;i++)if(args[i]=="--data-dir")Environment.SetEnvironmentVariable("WORKJOURNAL_DATA_DIR",Path.GetFullPath(args[i+1]));
  for(int i=0;i+1<args.Length;i++)if(args[i]=="--port")Environment.SetEnvironmentVariable("WORKJOURNAL_PORT",args[i+1]);
  if(args.Length>0&&args[0]=="--check-runtime"){try{CoreWebView2Environment.GetAvailableBrowserVersionString();Environment.ExitCode=0;}catch{Environment.ExitCode=2;}return;}
  Application.EnableVisualStyles();Application.SetCompatibleTextRenderingDefault(false);
  Application.ThreadException+=(s,e)=>{string dir=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"WorkJournal");Directory.CreateDirectory(dir);File.WriteAllText(Path.Combine(dir,"startup-error.txt"),e.Exception.ToString());Application.Exit();};
  bool fresh;
  using(var mutex=new Mutex(true,testing?"Local\\WorkJournal-Test":"Local\\WorkJournal-Desktop",out fresh)){
   if(!fresh){foreach(var p in Process.GetProcessesByName("WorkJournal")){if(p.Id!=Process.GetCurrentProcess().Id&&p.MainWindowHandle!=IntPtr.Zero){ShowWindow(p.MainWindowHandle,9);SetForegroundWindow(p.MainWindowHandle);break;}}return;}
   Application.Run(new JournalWindow(testing));
  }
 }
 [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr window);
 [DllImport("user32.dll")] static extern bool ShowWindow(IntPtr window,int command);
}
class JournalWindow:Form {
 [DllImport("user32.dll")] static extern uint GetDpiForSystem();
 [DllImport("dwmapi.dll")] static extern int DwmSetWindowAttribute(IntPtr window,int attribute,ref int value,int size);
 [StructLayout(LayoutKind.Sequential)] struct WindowRect{public int Left,Top,Right,Bottom;}
 WebView2 web;Process server;CoreWebView2Environment environment;
 readonly Panel loading=new Panel{Dock=DockStyle.Fill,BackColor=Color.FromArgb(248,250,248)};
 Image launchImage;
 readonly System.Windows.Forms.Timer launchTimer=new System.Windows.Forms.Timer{Interval=100};
 string launchPhase="正在打开";
 readonly string dataDir,origin;readonly bool testing;bool closing,exporting;
 readonly JavaScriptSerializer json=new JavaScriptSerializer{MaxJsonLength=16000000};
 readonly System.Collections.Generic.Dictionary<string,long> startup=new System.Collections.Generic.Dictionary<string,long>();
 [DllImport("user32.dll")] static extern bool ReleaseCapture();
 [DllImport("user32.dll")] static extern IntPtr SendMessage(IntPtr h,int m,IntPtr w,IntPtr l);
 [DllImport("shell32.dll")] static extern void SHChangeNotify(uint e,uint f,string p,IntPtr z);
 string AppearancePath{get{return Path.Combine(testing?dataDir:Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"WorkJournal"),"appearance");}}
 void SetTheme(string color,string encoded){
  if(!System.Text.RegularExpressions.Regex.IsMatch(color,"^#[0-9a-fA-F]{6}$")||encoded.Length>150000)return;
  var bytes=Convert.FromBase64String(encoded);using(var ms=new MemoryStream(bytes))using(var picture=Image.FromStream(ms)){if(picture.Width!=256||picture.Height!=256)return;
   Directory.CreateDirectory(AppearancePath);string file=Path.Combine(AppearancePath,"icon-"+color.Substring(1)+".ico");
   using(var writer=new BinaryWriter(File.Create(file))){writer.Write((short)0);writer.Write((short)1);writer.Write((short)1);writer.Write((byte)0);writer.Write((byte)0);writer.Write((short)0);writer.Write((short)1);writer.Write((short)32);writer.Write(bytes.Length);writer.Write(22);writer.Write(bytes);}
   using(var icon=new Icon(file)){var old=Icon;Icon=(Icon)icon.Clone();if(old!=null)old.Dispose();}
   File.WriteAllText(Path.Combine(AppearancePath,"color.txt"),color);
   if(!testing){
    string desktop=Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory),shortcut=Path.Combine(desktop,"Work Log.lnk");
    if(File.Exists(shortcut))try{var type=Type.GetTypeFromProgID("WScript.Shell");var shell=Activator.CreateInstance(type);var link=type.InvokeMember("CreateShortcut",System.Reflection.BindingFlags.InvokeMethod,null,shell,new object[]{shortcut});var lt=link.GetType();string target=(string)lt.InvokeMember("TargetPath",System.Reflection.BindingFlags.GetProperty,null,link,null);
     if(String.Equals(Path.GetFullPath(target),Application.ExecutablePath,StringComparison.OrdinalIgnoreCase)){lt.InvokeMember("IconLocation",System.Reflection.BindingFlags.SetProperty,null,link,new object[]{file+",0"});lt.InvokeMember("Save",System.Reflection.BindingFlags.InvokeMethod,null,link,null);SHChangeNotify(0x2000,0x0005,shortcut,IntPtr.Zero);}Marshal.ReleaseComObject(link);Marshal.ReleaseComObject(shell);
    }catch{}
   }
  }
 }
 void Mark(string phase){startup[phase]=Program.LaunchClock.ElapsedMilliseconds;}
 public JournalWindow(bool test){
  testing=test;dataDir=Environment.GetEnvironmentVariable("WORKJOURNAL_DATA_DIR")??Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"WorkJournal","data");
  int port; if(!Int32.TryParse(Environment.GetEnvironmentVariable("WORKJOURNAL_PORT"),out port))port=43171;
  origin="http://127.0.0.1:"+port;
  Text="Work Log";using(var stream=System.Reflection.Assembly.GetExecutingAssembly().GetManifestResourceStream("app.ico"))using(var asset=new Icon(stream)){Icon=(Icon)asset.Clone();}StartPosition=FormStartPosition.CenterScreen;
  FormBorderStyle=FormBorderStyle.None;Padding=new Padding(5);MaximizedBounds=Screen.FromControl(this).WorkingArea;AutoScaleMode=AutoScaleMode.None;float scale=GetDpiForSystem()/96f;var area=Screen.PrimaryScreen.WorkingArea;
  Size=new Size(Math.Min((int)(1280*scale),(int)(area.Width*.94)),Math.Min((int)(850*scale),(int)(area.Height*.94)));
  MinimumSize=new Size((int)(380*scale),(int)(440*scale));BackColor=Color.FromArgb(248,250,248);
  if(testing){Opacity=0;ShowInTaskbar=false;}
  Shown+=async(s,e)=>{loading.Refresh();await Task.Yield();web=new WebView2{Dock=DockStyle.Fill};Controls.Add(web);loading.BringToFront();await Start(port);};
  launchImage=Image.FromFile(Path.Combine(AppDomain.CurrentDomain.BaseDirectory,"app","src","assets","app-icon.png"));
  loading.Paint+=(s,e)=>{float dpi=e.Graphics.DpiX/96f;int size=(int)(64*dpi),x=(loading.Width-size)/2,y=(loading.Height-size)/2-(int)(28*dpi);e.Graphics.InterpolationMode=System.Drawing.Drawing2D.InterpolationMode.HighQualityBicubic;e.Graphics.DrawImage(launchImage,x,y,size,size);using(var font=new Font("Segoe UI",14,FontStyle.Regular))using(var brush=new SolidBrush(Color.FromArgb(70,100,83)))using(var format=new StringFormat{Alignment=StringAlignment.Center}){e.Graphics.DrawString("Work Log",font,brush,new RectangleF(0,y+size+12*dpi,loading.Width,40*dpi),format);}};
  try{string colorFile=Path.Combine(AppearancePath,"color.txt");if(File.Exists(colorFile)){string color=File.ReadAllText(colorFile).Trim();if(System.Text.RegularExpressions.Regex.IsMatch(color,"^#[0-9a-fA-F]{6}$")){string iconFile=Path.Combine(AppearancePath,"icon-"+color.Substring(1)+".ico");if(File.Exists(iconFile))using(var stored=new Icon(iconFile)){Icon=(Icon)stored.Clone();var payload=File.ReadAllBytes(iconFile);using(var input=new MemoryStream(payload,22,payload.Length-22))using(var source=Image.FromStream(input)){var replacement=new Bitmap(source);var previous=launchImage;launchImage=replacement;previous.Dispose();}}}}}catch{}
  loading.Paint+=(s,e)=>{if(!startup.ContainsKey("first-frame"))startup["first-frame"]=(long)(DateTime.UtcNow-Process.GetCurrentProcess().StartTime.ToUniversalTime()).TotalMilliseconds;float dpi=e.Graphics.DpiX/96f;float y=loading.Height/2f+66*dpi;using(var font=new Font("Segoe UI",10))using(var brush=new SolidBrush(Color.FromArgb(110,130,116)))using(var format=new StringFormat{Alignment=StringAlignment.Center})e.Graphics.DrawString(launchPhase+" · "+(Program.LaunchClock.ElapsedMilliseconds/1000.0).ToString("0.0")+" 秒",font,brush,new RectangleF(0,y,loading.Width,30*dpi),format);float width=150*dpi,x=(loading.Width-width)/2;using(var track=new SolidBrush(Color.FromArgb(224,232,224)))using(var ink=new SolidBrush(Color.FromArgb(70,100,83))){e.Graphics.FillRectangle(track,x,y+34*dpi,width,3*dpi);float step=(float)((Program.LaunchClock.ElapsedMilliseconds%1800)/1800.0);e.Graphics.FillRectangle(ink,x+step*(width-35*dpi),y+34*dpi,35*dpi,3*dpi);}};
  launchTimer.Tick+=(s,e)=>loading.Invalidate();launchTimer.Start();loading.Resize+=(s,e)=>loading.Invalidate();Controls.Add(loading);loading.BringToFront();
  FormClosed+=(s,e)=>{closing=true;launchTimer.Dispose();if(web!=null)web.Dispose();launchImage.Dispose();if(server!=null){try{if(!server.HasExited)server.Kill();}catch{}server.Dispose();}};
 }
 protected override void OnHandleCreated(EventArgs e){base.OnHandleCreated(e);try{int caption=0xF8FAF8,text=0x353A30,corner=2;DwmSetWindowAttribute(Handle,35,ref caption,4);DwmSetWindowAttribute(Handle,36,ref text,4);DwmSetWindowAttribute(Handle,33,ref corner,4);}catch{}}
 protected override void WndProc(ref Message m){if(m.Msg==0x02E0){var r=(WindowRect)Marshal.PtrToStructure(m.LParam,typeof(WindowRect));float scale=(m.WParam.ToInt64()&0xffff)/96f;MinimumSize=new Size((int)(380*scale),(int)(440*scale));Bounds=Rectangle.FromLTRB(r.Left,r.Top,r.Right,r.Bottom);m.Result=IntPtr.Zero;return;}
  if(m.Msg==0x84&&WindowState==FormWindowState.Normal){long pos=m.LParam.ToInt64();var p=PointToClient(new Point((short)(pos&0xffff),(short)((pos>>16)&0xffff)));int edge=6;bool left=p.X<edge,right=p.X>ClientSize.Width-edge,top=p.Y<edge,bottom=p.Y>ClientSize.Height-edge;int hit=top?(left?13:right?14:12):bottom?(left?16:right?17:15):left?10:right?11:0;if(hit!=0){m.Result=(IntPtr)hit;return;}}
  base.WndProc(ref m);}
 async Task<string> ReadStatus(int timeout){
  var request=(HttpWebRequest)WebRequest.Create(origin+"/api/status");request.Proxy=null;request.KeepAlive=false;
  using(var cancel=new CancellationTokenSource(timeout))using(cancel.Token.Register(()=>request.Abort())){
   using(var response=await request.GetResponseAsync())using(var reader=new StreamReader(response.GetResponseStream()))return await reader.ReadToEndAsync();
  }
 }
 async Task InitializeWeb(){
  var options=new CoreWebView2EnvironmentOptions();options.AdditionalBrowserArguments="--disable-gpu";
  environment=await CoreWebView2Environment.CreateAsync(null,Path.Combine(dataDir,"WebView2"),options);
  if(closing)return;await web.EnsureCoreWebView2Async(environment);Mark("engine");
 }
 bool HasListener(){foreach(var address in System.Net.NetworkInformation.IPGlobalProperties.GetIPGlobalProperties().GetActiveTcpListeners())if(address.Port==new Uri(origin).Port)return true;return false;}
 async Task Start(int port){
  try{
   Mark("window");
   Directory.CreateDirectory(dataDir);
   CoreWebView2Environment.GetAvailableBrowserVersionString();
   var webReady=InitializeWeb();
   bool reuse=false;
   if(await Task.Run(()=>HasListener()))try{
    var status=json.Deserialize<System.Collections.Generic.Dictionary<string,object>>(await ReadStatus(350));
    reuse=status.ContainsKey("app")&&(string)status["app"]=="work-journal"&&status.ContainsKey("dataDirectory")&&String.Equals(Path.GetFullPath((string)status["dataDirectory"]),Path.GetFullPath(dataDir),StringComparison.OrdinalIgnoreCase);
   }catch{}
   if(!reuse){
   var info=new ProcessStartInfo(Path.Combine(AppDomain.CurrentDomain.BaseDirectory,"runtime","node.exe"),"\""+Path.Combine(AppDomain.CurrentDomain.BaseDirectory,"app","server","index.js")+"\"");
   info.UseShellExecute=false;info.CreateNoWindow=true;info.WorkingDirectory=Path.Combine(AppDomain.CurrentDomain.BaseDirectory,"app");
   string instance=Guid.NewGuid().ToString();info.EnvironmentVariables["INSTANCE_TOKEN"]=instance;info.EnvironmentVariables["PORT"]=port.ToString();info.EnvironmentVariables["DATA_DIR"]=dataDir;info.EnvironmentVariables["PARENT_PID"]=Process.GetCurrentProcess().Id.ToString();
   info.RedirectStandardError=true;info.RedirectStandardOutput=true;
   var serviceReady=new TaskCompletionSource<bool>();string error="";
   server=new Process{StartInfo=info,EnableRaisingEvents=true};
   server.ErrorDataReceived+=(s,e)=>{if(e.Data!=null)error=e.Data;};
   server.OutputDataReceived+=(s,e)=>{if(e.Data=="WORKJOURNAL_READY "+instance)serviceReady.TrySetResult(true);};
   server.Exited+=(s,e)=>serviceReady.TrySetException(new Exception("本机服务无法启动。请确认没有其他程序占用 "+port+" 端口。\n"+error));
   await Task.Run(()=>{server.Start();server.BeginErrorReadLine();server.BeginOutputReadLine();});
   if(await Task.WhenAny(serviceReady.Task,Task.Delay(8000))!=serviceReady.Task)throw new Exception("软件启动超时，请关闭后重新打开。");
   await serviceReady.Task;
   }
   Mark("server");launchPhase="正在加载界面";
   await webReady;if(closing)return;
   web.CoreWebView2.DOMContentLoaded+=(s,e)=>{Mark("dom");launchPhase="正在读取记录";};
   web.CoreWebView2.Settings.AreDevToolsEnabled=testing;web.CoreWebView2.Settings.IsStatusBarEnabled=false;
   web.CoreWebView2.Settings.AreDefaultContextMenusEnabled=false;
   web.CoreWebView2.NavigationStarting+=(s,e)=>{if(!Local(e.Uri))e.Cancel=true;};
   web.CoreWebView2.NewWindowRequested+=async(s,e)=>{e.Handled=true;if(Local(e.Uri))await OpenAttachment(e.Uri);};
   web.CoreWebView2.DownloadStarting+=(s,e)=>ChooseDownload(e);
   web.CoreWebView2.WebMessageReceived+=async(s,e)=>{
    if(!Local(e.Source))return;
    try{var message=json.Deserialize<System.Collections.Generic.Dictionary<string,object>>(e.WebMessageAsJson);
     if(message.ContainsKey("type")&&(string)message["type"]=="export-report")await ExportPdf((string)message["html"],(string)message["title"]);
     if(message.ContainsKey("type")&&(string)message["type"]=="app-ready"){loading.Hide();launchTimer.Stop();web.Visible=true;web.BringToFront();web.Focus();Mark("interactive");}
     if(message.ContainsKey("type")&&(string)message["type"]=="set-theme")SetTheme((string)message["color"],(string)message["png"]);
     if(message.ContainsKey("type")&&(string)message["type"]=="window"){
      string action=(string)message["action"];if(action=="close")Close();if(action=="minimize")WindowState=FormWindowState.Minimized;
      if(action=="maximize"){MaximizedBounds=Screen.FromControl(this).WorkingArea;WindowState=WindowState==FormWindowState.Maximized?FormWindowState.Normal:FormWindowState.Maximized;}
      if(action=="drag"){ReleaseCapture();SendMessage(Handle,0xA1,(IntPtr)2,IntPtr.Zero);}
     }
    }catch(Exception ex){ReportResult(false,ex.Message);}
   };
   await web.CoreWebView2.AddScriptToExecuteOnDocumentCreatedAsync("window.workJournalDesktop=true;window.workJournalPlatform='windows';");
   web.CoreWebView2.Navigate(origin);
   if(testing)await Smoke();
  }catch(WebView2RuntimeNotFoundException){
   if(closing)return;
   MessageBox.Show("这台电脑尚未安装 Microsoft WebView2。请先运行安装包中提供的 Microsoft 组件安装程序，再打开Work Log。","缺少运行组件");Close();
  }catch(Exception ex){
   if(closing)return;
   if(testing){File.WriteAllText(Path.Combine(dataDir,"smoke-error.txt"),ex.ToString());Close();}
   else{MessageBox.Show(ex.Message,"无法打开Work Log");Close();}
  }
 }
 bool Local(string url){Uri parsed;return Uri.TryCreate(url,UriKind.Absolute,out parsed)&&parsed.GetLeftPart(UriPartial.Authority)==origin;}
 void ChooseDownload(CoreWebView2DownloadStartingEventArgs e){
  if(testing){e.ResultFilePath=Path.Combine(dataDir,Path.GetFileName(e.ResultFilePath));e.Handled=true;return;}
  using(var dialog=new SaveFileDialog{FileName=Path.GetFileName(e.ResultFilePath),OverwritePrompt=true}){
   if(dialog.ShowDialog(this)==DialogResult.OK){e.ResultFilePath=dialog.FileName;e.Handled=true;}else e.Cancel=true;
  }
 }
 async Task OpenAttachment(string url){
  var child=new Form{Text="附件 · Work Log",Size=new Size(Math.Min(Width,1500),Math.Min(Height,1200)),StartPosition=FormStartPosition.CenterParent,Icon=Icon};
  var viewer=new WebView2{Dock=DockStyle.Fill};child.Controls.Add(viewer);
  child.FormClosed+=(s,e)=>viewer.Dispose();child.Show(this);await viewer.EnsureCoreWebView2Async(environment);
  viewer.CoreWebView2.NavigationStarting+=(s,e)=>{if(!Local(e.Uri))e.Cancel=true;};
  viewer.CoreWebView2.DownloadStarting+=(s,e)=>ChooseDownload(e);
  viewer.CoreWebView2.NewWindowRequested+=(s,e)=>e.Handled=true;
  viewer.CoreWebView2.Navigate(url);
 }
 void ReportResult(bool success,string message){if(!closing&&web.CoreWebView2!=null)web.CoreWebView2.PostWebMessageAsJson(json.Serialize(new{type="report-result",success=success,message=message}));}
 async Task ExportPdf(string html,string title){
  if(exporting)return;exporting=true;
  Form printWindow=null;WebView2 printer=null;
  try{
   if(html.Length>12000000)throw new Exception("所选内容过多，请分批导出。");
   string file;
   if(testing)file=Path.Combine(dataDir,"report.pdf");
   else using(var dialog=new SaveFileDialog{Filter="PDF 文档 (*.pdf)|*.pdf",FileName=SafeName(title)+".pdf",OverwritePrompt=true}){if(dialog.ShowDialog(this)!=DialogResult.OK){ReportResult(false,"已取消导出");return;}file=dialog.FileName;}
   printWindow=new Form{ShowInTaskbar=false,Opacity=0,Size=new Size(900,1000)};printer=new WebView2{Dock=DockStyle.Fill};printWindow.Controls.Add(printer);printWindow.Show(this);
   await printer.EnsureCoreWebView2Async(environment);printer.CoreWebView2.Settings.IsScriptEnabled=false;
   var loaded=new TaskCompletionSource<bool>();printer.CoreWebView2.NavigationCompleted+=(s,e)=>loaded.TrySetResult(e.IsSuccess);
   printer.CoreWebView2.NavigateToString(html);
   if(await Task.WhenAny(loaded.Task,Task.Delay(20000))!=loaded.Task||!await loaded.Task)throw new Exception("汇报排版未完成，请重试。");
   var settings=environment.CreatePrintSettings();settings.ShouldPrintBackgrounds=true;settings.ShouldPrintHeaderAndFooter=false;
   settings.PageWidth=210.0/25.4;settings.PageHeight=297.0/25.4;settings.MarginTop=0;settings.MarginBottom=0;settings.MarginLeft=0;settings.MarginRight=0;
   if(!await printer.CoreWebView2.PrintToPdfAsync(file,settings))throw new Exception("PDF 导出未完成，请重试。");
   ReportResult(true,"PDF 已保存");
  }finally{if(printer!=null)printer.Dispose();if(printWindow!=null)printWindow.Close();exporting=false;}
 }
 static string SafeName(string value){foreach(char x in Path.GetInvalidFileNameChars())value=value.Replace(x,'_');return value.Length>80?value.Substring(0,80):value;}
 async Task WaitScript(string expression){for(int i=0;i<240;i++){if(await web.CoreWebView2.ExecuteScriptAsync(expression)=="true")return;await Task.Delay(100);}throw new Exception("Desktop test timed out: "+expression);}
 async Task Smoke(){
  await WaitScript("!!document.querySelector('#record-form')");await Task.Delay(500);
  Mark("ready");File.WriteAllText(Path.Combine(dataDir,"startup.json"),json.Serialize(startup));
  string script=File.ReadAllText(Environment.GetEnvironmentVariable("WORKJOURNAL_TEST_SCRIPT"));await web.CoreWebView2.ExecuteScriptAsync(script);
  await WaitScript("!!window.__desktopTestDone");
  File.WriteAllText(Path.Combine(dataDir,"smoke-result.json"),await web.CoreWebView2.ExecuteScriptAsync("window.__desktopTestResult"));
  using(var file=File.Create(Path.Combine(dataDir,"desktop.png")))await web.CoreWebView2.CapturePreviewAsync(CoreWebView2CapturePreviewImageFormat.Png,file);
  Close();
 }
}
