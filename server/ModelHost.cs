// Own the inference process in a kill-on-close Windows job. The guard watches
// the exact parent process handle so a desktop/server crash cannot orphan it.
using System;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;

class ModelHost {
 [StructLayout(LayoutKind.Sequential)] struct IO {public ulong a,b,c,d,e,f;}
 [StructLayout(LayoutKind.Sequential)] struct Basic {public long a,b;public uint flags;public UIntPtr min,max;public uint active;public IntPtr affinity;public uint priority,scheduling;}
 [StructLayout(LayoutKind.Sequential)] struct Limits {public Basic basic;public IO io;public UIntPtr process,job,peakProcess,peakJob;}
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode)] static extern IntPtr CreateJobObject(IntPtr attrs,string name);
 [DllImport("kernel32.dll")] static extern bool SetInformationJobObject(IntPtr job,int kind,ref Limits limits,uint size);
 [DllImport("kernel32.dll")] static extern bool AssignProcessToJobObject(IntPtr job,IntPtr process);
 [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr value);
 static string Quote(string value){
  var s=new StringBuilder("\"");int n=0;
  foreach(char c in value){if(c=='\\'){n++;continue;}if(c=='\"'){s.Append('\\',n*2+1);s.Append(c);n=0;continue;}s.Append('\\',n);n=0;s.Append(c);}
  s.Append('\\',n*2);return s.Append('"').ToString();
 }
 static int Main(string[] args){
  IntPtr job=IntPtr.Zero;Process child=null,parent=null;
  try{
   if(args.Length<2)return 2;parent=Process.GetProcessById(Int32.Parse(args[0]));var parentHandle=parent.Handle;if(parent.HasExited)return 3;
   job=CreateJobObject(IntPtr.Zero,null);var limits=new Limits();limits.basic.flags=0x2000;
   if(job==IntPtr.Zero||!SetInformationJobObject(job,9,ref limits,(uint)Marshal.SizeOf(typeof(Limits))))return 4;
   var command=new StringBuilder();for(int i=2;i<args.Length;i++){if(command.Length>0)command.Append(' ');command.Append(Quote(args[i]));}
   var info=new ProcessStartInfo(args[1],command.ToString()){UseShellExecute=false,CreateNoWindow=true,RedirectStandardOutput=true,RedirectStandardError=true};
   child=new Process{StartInfo=info};child.Start();
   if(!AssignProcessToJobObject(job,child.Handle)){child.Kill();return 5;}
   child.OutputDataReceived+=(s,e)=>{};child.ErrorDataReceived+=(s,e)=>{};child.BeginOutputReadLine();child.BeginErrorReadLine();
   while(!child.WaitForExit(250)){if(parent.HasExited)return 0;}
   return child.ExitCode;
  }catch{return 1;}finally{if(job!=IntPtr.Zero)CloseHandle(job);if(child!=null)child.Dispose();if(parent!=null)parent.Dispose();}
 }
}
