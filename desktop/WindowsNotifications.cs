using System;
using System.Collections;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text;
using System.Web.Script.Serialization;
using System.Xml;
using Windows.UI.Notifications;
using ToastXml = Windows.Data.Xml.Dom.XmlDocument;

// The installer gives the Start Menu shortcut this AUMID and a stub toast
// activator CLSID. The fixed protocol endpoint activates the regular single-
// instance executable even after the process that scheduled a reminder exits.
internal static class WindowsNotifications {
 internal const string AppId="WorkLog.Desktop";
 internal const string Group="WorkLogPlans";
 const string LaunchUri="worklog://today";
 static readonly JavaScriptSerializer Json=new JavaScriptSerializer();
 static readonly UTF8Encoding Utf8=new UTF8Encoding(false);
 static readonly string Ledger=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"WorkJournal","windows-reminders.json");

 [DllImport("shell32.dll",CharSet=CharSet.Unicode,ExactSpelling=true)]
 static extern int SetCurrentProcessExplicitAppUserModelID(string id);
 internal static void InitializeIdentity(){Marshal.ThrowExceptionForHR(SetCurrentProcessExplicitAppUserModelID(AppId));}

 internal static string OccurrenceTag(string id){
  // The OS rejects a 16-character ScheduledToastNotification.Id with
  // HRESULT 0x803E0120; leave room for its terminating NUL.
  using(var sha=SHA256.Create())return BitConverter.ToString(sha.ComputeHash(Utf8.GetBytes(id)),0,8).Replace("-","").Substring(0,15).ToLowerInvariant();
 }
 // XML 1.0 text excludes C0 controls and lone UTF-16 surrogates. Clip on a
 // scalar boundary, so a long task title cannot break the entire schedule.
 static string DisplayText(string text,int limit){
  var value=new StringBuilder();
  for(int i=0;i<text.Length&&value.Length<limit;i++){
   char c=text[i];
   if(char.IsHighSurrogate(c)&&i+1<text.Length&&char.IsLowSurrogate(text[i+1])){
    if(value.Length+2>limit)break;value.Append(c).Append(text[++i]);
   }else if(c=='\r'){
    if(i+1<text.Length&&text[i+1]=='\n')i++;
    value.Append('\n'); // Match XML 1.0 end-of-line normalization when comparing a queued toast.
   }else if(XmlConvert.IsXmlChar(c))value.Append(c);
  }
  return value.ToString();
 }
 internal static ToastXml Content(string title,string message){
  var xml=new System.Xml.XmlDocument();var root=xml.CreateElement("toast");xml.AppendChild(root);
  root.SetAttribute("activationType","protocol");root.SetAttribute("launch",LaunchUri);
  var visual=xml.CreateElement("visual");root.AppendChild(visual);
  var binding=xml.CreateElement("binding");binding.SetAttribute("template","ToastGeneric");visual.AppendChild(binding);
  foreach(string line in new[]{DisplayText(title,120),DisplayText(message,1000)}){
   var node=xml.CreateElement("text");node.InnerText=line;binding.AppendChild(node);
  }
  var result=new ToastXml();result.LoadXml(xml.OuterXml);return result;
 }
 static ToastNotifier CreateNotifier(){
  var notifier=ToastNotificationManager.CreateToastNotifier(AppId);
  try{var setting=notifier.Setting;}
  catch(Exception e){
   // Windows does not create the sender's settings until its first delivery.
   // Initialize silently before scheduling, as required for unpackaged apps.
   if(e.HResult!=unchecked((int)0x80070490))throw;
   var xml=Content("Work Log","");
   var audio=xml.CreateElement("audio");audio.SetAttribute("silent","true");xml.DocumentElement.AppendChild(audio);
   const string tag="wl-initialize",group="WorkLogSystem";
   notifier.Show(new ToastNotification(xml){SuppressPopup=true,Tag=tag,Group=group,ExpirationTime=DateTimeOffset.Now.AddSeconds(15)});
   ToastNotificationManager.History.Remove(tag,group,AppId);
  }
  return notifier;
 }
 static void EnsureEnabled(ToastNotifier notifier,bool english){
  if(notifier.Setting!=NotificationSetting.Enabled)throw new InvalidOperationException(english?
   "Windows notifications are disabled for Work Log. Check Settings > System > Notifications.":
   "Windows 未启用 Work Log 通知。请检查「设置 → 系统 → 通知」。");
 }
 internal static void Show(string title,string message,string occurrenceKey){
  var notifier=CreateNotifier();EnsureEnabled(notifier,false);
  var toast=new ToastNotification(Content(title,message));
  if(!String.IsNullOrEmpty(occurrenceKey)){toast.Tag=OccurrenceTag(occurrenceKey);toast.Group=Group;}
  notifier.Show(toast);
 }
 sealed class Plan {
  internal string Key,Title,Body;
  internal DateTimeOffset At;
  internal long Ticks{get{return At.UtcDateTime.Ticks;}}
 }
 static string Field(IDictionary<string,object> item,string name,int max){
  object value;string s;if(!item.TryGetValue(name,out value)||(s=value as string)==null||s.Length==0||s.Length>max)
   throw new FormatException("Invalid reminder: "+name);
  return s;
 }
 static DateTimeOffset Instant(string s){
  DateTimeOffset time;
  if(!s.EndsWith("Z",StringComparison.Ordinal)||!DateTimeOffset.TryParse(s,CultureInfo.InvariantCulture,DateTimeStyles.AssumeUniversal|DateTimeStyles.AdjustToUniversal,out time))
   throw new FormatException("Invalid reminder time.");
  return time;
 }
 static Dictionary<string,Plan> Parse(object items,bool english){
  var array=items as IEnumerable;if(array==null||items is string||items is IDictionary)throw new FormatException("Invalid reminder list.");
  var plans=new Dictionary<string,Plan>(StringComparer.Ordinal);
  foreach(object row in array){
   if(plans.Count>=128)throw new FormatException("Too many reminders.");
   var item=row as IDictionary<string,object>;if(item==null)throw new FormatException("Invalid reminder.");
   string id=Field(item,"id",256),title=Field(item,"title",10000),time=Field(item,"time",5);
   var at=Instant(Field(item,"at",40));Instant(Field(item,"scheduledAt",40));
   if(!System.Text.RegularExpressions.Regex.IsMatch(time,@"^(?:[01][0-9]|2[0-3]):[0-5][0-9]$"))throw new FormatException("Invalid task time.");
   string key=OccurrenceTag(id);
   plans.Add(key,new Plan{Key=key,At=at,Title=english?"Reminder":"提醒",Body=DisplayText(time+" · "+title,1000)});
  }
  return plans;
 }
 static Dictionary<string,long> ReadLedger(){
  if(!File.Exists(Ledger))return new Dictionary<string,long>();
  return Json.Deserialize<Dictionary<string,long>>(File.ReadAllText(Ledger,Utf8))??new Dictionary<string,long>();
 }
 static void SaveLedger(Dictionary<string,long> entries){
  Directory.CreateDirectory(Path.GetDirectoryName(Ledger));
  File.WriteAllText(Ledger+".tmp",Json.Serialize(entries),Utf8);
  if(File.Exists(Ledger))File.Replace(Ledger+".tmp",Ledger,null);else File.Move(Ledger+".tmp",Ledger);
 }
 static bool Same(ScheduledToastNotification existing,Plan plan){
  if(existing.DeliveryTime.UtcDateTime.Ticks!=plan.Ticks)return false;
  var text=existing.Content.GetElementsByTagName("text");
  return text.Length==2&&text.Item(0).InnerText==plan.Title&&text.Item(1).InnerText==plan.Body
   &&existing.Content.DocumentElement.GetAttribute("launch")==LaunchUri;
 }
 static bool Owned(ScheduledToastNotification item){
  return item.Group==Group&&!String.IsNullOrEmpty(item.Id)&&item.Id==item.Tag;
 }
 internal static void Validate(object items,bool english){Parse(items,english);}
 internal static void Sync(object items,bool english){
  // Parse the complete snapshot before removing anything. Nothing outside our
  // plan group is ever changed, including notifications from other app features.
  var plans=Parse(items,english);var notifier=CreateNotifier();
  var accepted=ReadLedger();bool dirty=false;
  var retained=new HashSet<string>();var now=DateTimeOffset.UtcNow;
  try{
   foreach(var old in notifier.GetScheduledToastNotifications()){
    if(!Owned(old))continue;
    Plan plan;
    if(plans.TryGetValue(old.Id,out plan)&&Same(old,plan)&&retained.Add(old.Id)){
     long known;if(!accepted.TryGetValue(old.Id,out known)||known!=plan.Ticks){accepted[old.Id]=plan.Ticks;dirty=true;}
     continue;
    }
    // A toast can cross its fire time between the snapshot and this call.
    // When absent from the new snapshot it is still OK to cancel it.
    notifier.RemoveFromSchedule(old);
    if(old.DeliveryTime>now&&accepted.Remove(old.Id))dirty=true;
   }
   foreach(var key in accepted.Keys.ToArray()){
    long at=accepted[key];
    if(at<now.AddDays(-7).UtcDateTime.Ticks||(at>now.UtcDateTime.Ticks&&!plans.ContainsKey(key))){
     accepted.Remove(key);dirty=true;
    }
   }
   if(plans.Count>0)EnsureEnabled(notifier,english);
   foreach(var plan in plans.Values.OrderBy(p=>p.At)){
    if(retained.Contains(plan.Key))continue;
    var content=Content(plan.Title,plan.Body);
    if(plan.At>DateTimeOffset.UtcNow){
     var item=new ScheduledToastNotification(content,plan.At){Id=plan.Key,Tag=plan.Key,Group=Group};
     try{notifier.AddToSchedule(item);}
     catch{if(plan.At>DateTimeOffset.UtcNow)throw;else DeliverDue(notifier,content,plan,accepted);}
    }else DeliverDue(notifier,content,plan,accepted);
    long known;if(!accepted.TryGetValue(plan.Key,out known)||known!=plan.Ticks){accepted[plan.Key]=plan.Ticks;dirty=true;}
   }
  }finally{if(dirty)SaveLedger(accepted);}
 }
 static void DeliverDue(ToastNotifier notifier,ToastXml content,Plan plan,Dictionary<string,long> accepted){
  long known;if(accepted.TryGetValue(plan.Key,out known)&&known==plan.Ticks)return;
  notifier.Show(new ToastNotification(content){Tag=plan.Key,Group=Group});
 }
}
