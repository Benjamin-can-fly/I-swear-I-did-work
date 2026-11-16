using System;
using System.IO;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Windows.Forms;

class WindowPolicyCheck {
 [DllImport("user32.dll",EntryPoint="GetWindowLongPtrW")] static extern IntPtr Style(IntPtr h,int n);
 [DllImport("user32.dll")] static extern bool IsWindow(IntPtr h);
 [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
 static void Check(bool ok,string message){if(!ok)throw new Exception(message);}
 static void BackgroundStyle(Form form){long style=Style(form.Handle,-20).ToInt64();Check((style&0x80)!=0,"Missing TOOLWINDOW");Check((style&0x08000000)!=0,"Missing NOACTIVATE");Check((style&0x40000)==0,"Unexpected APPWINDOW");Check(!form.ShowInTaskbar,"Taskbar visibility enabled");}
 [STAThread] static int Main(){
  try{
   var assembly=Assembly.LoadFrom(Path.Combine(AppDomain.CurrentDomain.BaseDirectory,"WorkJournal.exe"));
   var background=assembly.GetType("BackgroundWindow",true);
   for(int i=0;i<2;i++){
    IntPtr handle;
    using(var form=(Form)Activator.CreateInstance(background,true)){
     var foreground=GetForegroundWindow();form.Show();Application.DoEvents();handle=form.Handle;
     BackgroundStyle(form);Check(form.Opacity==0,"Background form is not transparent");Check(GetForegroundWindow()==foreground,"Background form stole focus");
     typeof(Control).GetMethod("RecreateHandle",BindingFlags.Instance|BindingFlags.NonPublic).Invoke(form,null);
     Check(!IsWindow(handle),"Old window handle survived recreation");handle=form.Handle;BackgroundStyle(form);
    }
    Check(!IsWindow(handle),"Background handle survived Dispose");
   }
   foreach(bool testing in new[]{true,false}){
    var form=(Form)Activator.CreateInstance(assembly.GetType("JournalWindow",true),new object[]{testing});
    var handle=form.Handle;long style=Style(handle,-20).ToInt64();
    if(testing)BackgroundStyle(form);else{Check(form.ShowInTaskbar,"Normal window must keep its taskbar entry");Check((style&0x80)==0,"Normal window was made a tool window");Check((style&0x08000000)==0,"Normal window cannot activate");}
    Check(!form.Visible,"Audit must not show the user app");
    typeof(Form).GetMethod("OnFormClosed",BindingFlags.Instance|BindingFlags.NonPublic).Invoke(form,new object[]{new FormClosedEventArgs(CloseReason.ApplicationExitCall)});
    form.Dispose();Check(!IsWindow(handle),"Journal handle survived disposal");
   }
   Console.WriteLine("PASS: tool/no-activate flags, no taskbar, no focus steal, handle recreation, disposal, and normal window policy.");return 0;
  }catch(Exception error){Console.Error.WriteLine(error);return 1;}
 }
}
