using System;using System.IO;using System.Reflection;using System.Drawing;using System.Windows.Forms;using System.Runtime.InteropServices;
class NativeThemeCheck {
 static Type type;static string root;static BindingFlags flags=BindingFlags.Instance|BindingFlags.NonPublic;
 [DllImport("user32.dll")]static extern IntPtr SendMessage(IntPtr hwnd,int message,IntPtr w,IntPtr l);
 static void Check(bool condition,string message){if(!condition)throw new Exception(message);}
 static Color ColorOf(object form,string name){return (Color)type.GetProperty(name,flags).GetValue(form,null);}
 static void Release(Form form){typeof(Form).GetMethod("OnFormClosed",flags).Invoke(form,new object[]{new FormClosedEventArgs(CloseReason.ApplicationExitCall)});form.Dispose();}
 [STAThread] static int Main(string[] args){try{
  root=Path.GetFullPath(args[0]);var stage=Path.GetFullPath(args[1]);var assembly=Assembly.LoadFrom(Path.Combine(stage,"WorkJournal.exe"));type=assembly.GetType("JournalWindow",true);
  foreach(string mode in new[]{"dark","light"})foreach(string hex in new[]{"466453","3566a0","76619a","a15d45","786633","46545e","ffffff","000000"}){
   string dir=Path.Combine(root,"native-"+mode+"-"+hex),appearance=Path.Combine(dir,"appearance");Directory.CreateDirectory(appearance);
   Environment.SetEnvironmentVariable("WORKJOURNAL_DATA_DIR",dir);File.WriteAllText(Path.Combine(appearance,"mode.txt"),mode);File.WriteAllText(Path.Combine(appearance,"color.txt"),"#"+hex);
   var form=(Form)Activator.CreateInstance(type,new object[]{true,false});
   Check(form.BackColor.ToArgb()==(mode=="dark"?Color.FromArgb(18,18,18):Color.White).ToArgb(),"Startup background mismatch");
   Check(((Color)type.GetField("accentColor",flags).GetValue(form)).ToArgb()==ColorTranslator.FromHtml("#"+hex).ToArgb(),"Saved accent not read before startup");
   var ink=ColorOf(form,"LaunchInk");var track=ColorOf(form,"LaunchTrack");Check(ink.R==ink.G&&ink.G==ink.B&&track.R==track.G&&track.G==track.B,"Green text/track remains");
   var handle=form.Handle; // Exercise actual shell/window stores without showing the test window.
   string png=Convert.ToBase64String(File.ReadAllBytes(Path.Combine(root,"icon-"+hex+".png")));type.GetMethod("SetTheme",flags).Invoke(form,new object[]{"#"+hex,png});
   var shell=assembly.GetType("WorkLogRegistrationShortcut",true);var read=shell.GetMethod("ReadWindowProperty");
   Check((string)read.Invoke(null,new object[]{handle,(uint)5})=="WorkLog.Desktop","Window identity changed");
   Check((string)read.Invoke(null,new object[]{handle,(uint)3})==Path.Combine(appearance,"desktop-v2-"+hex+".ico")+",0","Taskbar relaunch icon not updated");
   foreach(int size in new[]{0,1}){var hicon=SendMessage(handle,0x7f,(IntPtr)size,IntPtr.Zero);Check(hicon!=IntPtr.Zero,"Missing native taskbar/Alt+Tab icon");using(var image=Icon.FromHandle(hicon).ToBitmap()){var pixel=image.GetPixel(image.Width/8,image.Height/2);var expected=ColorTranslator.FromHtml("#"+hex);Check(Math.Abs(pixel.R-expected.R)+Math.Abs(pixel.G-expected.G)+Math.Abs(pixel.B-expected.B)<36,"Native icon still uses old color");}}
   Release(form);
   // A new native window must restore its icon and color before starting a web view.
   form=(Form)Activator.CreateInstance(type,new object[]{true,false});
   using(var expected=new Bitmap(Path.Combine(root,"icon-"+hex+".png"))){var actual=(Bitmap)type.GetField("launchImage",flags).GetValue(form);Check(actual.GetPixel(25,128).ToArgb()==expected.GetPixel(25,128).ToArgb(),"Startup icon was not restored");}
   Check(!form.Visible,"Native palette test must not open a user window");
   var panel=(Panel)type.GetField("loading",flags).GetValue(form);form.Size=new Size(800,600);panel.Size=form.ClientSize;
   using(var picture=new Bitmap(panel.Width,panel.Height)){panel.DrawToBitmap(picture,new Rectangle(Point.Empty,picture.Size));picture.Save(Path.Combine(root,"startup-"+mode+"-"+hex+".png"));}
   Release(form);
  }
  Console.WriteLine("PASS 16 native palettes: actual small/large window icon pixels and taskbar AppID/icon properties, persisted startup accent/icon, neutral canvas, no visible windows.");return 0;
 }catch(Exception e){Console.Error.WriteLine(e);return 1;}}
}
