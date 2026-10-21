from pathlib import Path
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import Paragraph
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.colors import HexColor
from pypdf import PdfReader

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'output/pdf'; OUT.mkdir(parents=True,exist_ok=True)
pdfmetrics.registerFont(TTFont('YaHei','C:/Windows/Fonts/msyh.ttc',subfontIndex=0))
pdfmetrics.registerFont(TTFont('YaHeiBold','C:/Windows/Fonts/msyhbd.ttc',subfontIndex=0))
pdfmetrics.registerFontFamily('YaHei',normal='YaHei',bold='YaHeiBold')
INK=HexColor('#293c33'); GREEN=HexColor('#466453'); MUTED=HexColor('#65786c'); LINE=HexColor('#dce5df'); PALE=HexColor('#f1f5f2')
W,H=595.276,841.89
body=ParagraphStyle('body',fontName='YaHei',fontSize=10.5,leading=18,wordWrap='CJK',textColor=INK)
small=ParagraphStyle('small',parent=body,fontSize=9,leading=15,textColor=MUTED)
bold=ParagraphStyle('bold',parent=body,fontName='YaHeiBold',fontSize=12,leading=19,textColor=GREEN)

class Guide:
 def __init__(self,name,label):
  self.path=OUT/name;self.label=label;self.page=0
  self.c=canvas.Canvas(str(self.path),pagesize=(W,H));self.c.setTitle('Work Log '+label);self.c.setAuthor('Work Log')
 def new(self,title,subtitle):
  if self.page:self.c.showPage()
  self.page+=1;c=self.c;c.setFillColor(GREEN);c.setFont('YaHeiBold',10);c.drawString(42,H-32,'Work Log')
  c.setFillColor(MUTED);c.setFont('YaHei',8);c.drawRightString(W-42,H-32,'0.2.9 / macOS / 2026.10.21')
  c.setStrokeColor(LINE);c.line(42,H-44,W-42,H-44)
  c.setFillColor(INK);c.setFont('YaHeiBold',23);c.drawString(42,H-83,title)
  self.y=H-102;self.p(subtitle,small,16)
  c.setStrokeColor(LINE);c.line(42,42,W-42,42);c.setFont('YaHei',8);c.setFillColor(MUTED);c.drawString(42,26,self.label);c.drawRightString(W-42,26,f'{self.page} / 2')
 def p(self,text,style=body,gap=8):
  p=Paragraph(text,style);_,height=p.wrap(W-84,1000)
  if self.y-height<58:raise RuntimeError(f'Overflow {self.label} p{self.page}: {text[:30]}')
  p.drawOn(self.c,42,self.y-height);self.y-=height+gap
 def section(self,title,text):
  self.y-=5;self.p(title,bold,5);self.p(text)
 def note(self,text):
  p=Paragraph(text,body);_,height=p.wrap(W-112,1000)
  if self.y-height-24<58:raise RuntimeError('Note overflow')
  self.c.setFillColor(PALE);self.c.roundRect(42,self.y-height-22,W-84,height+22,9,stroke=0,fill=1)
  p.drawOn(self.c,56,self.y-height-11);self.y-=height+36
 def save(self):
  self.c.save();reader=PdfReader(self.path)
  assert len(reader.pages)==2
  for page in reader.pages:assert 'Work Log' in page.extract_text()
  print(self.path)

g=Guide('Work-Log-0.2.9-Mac-Install-Guide.pdf','安装与使用说明')
g.new('双击安装，不用拖拽','这份说明适用于 .pkg 安装包。旧的 .dmg 拖拽安装方式仍可使用，两种方式选择一种即可。')
g.section('01  先选对版本','Mac 左上角苹果菜单 → 关于本机。看到“芯片 Apple M…”选苹果芯片版；看到“处理器 Intel…”选 Intel 版。需要 macOS 13.5 或更新版本。')
g.note('<b>苹果芯片：</b>WorkLog-0.2.9-macos-arm64.pkg<br/><b>Intel：</b>WorkLog-0.2.9-macos-x64.pkg')
g.section('02  打开安装向导','将收到的 .pkg 保存到 Mac，双击打开。按向导点“继续”与“安装”。软件会安装到 /Applications/Work Log.app，即“应用程序”文件夹。')
g.p('系统可能要求管理员确认。输入的是这台 Mac 的管理员账户密码；不是 Apple 账户密码，也不是微信密码。学校或公司管理的电脑可能需要管理员协助。')
g.section('03  安装完成后打开','看到安装成功后关闭安装向导，打开 Finder → 应用程序 → Work Log。安装完成不会自动替你启动软件。无需安装 Node.js，也无需登录 GitHub。')
g.note('首次打开可能被系统拦住：当前包没有 Apple Developer ID 签名和公证。请按另一份《安装报错指南》处理；安装向导本身并不取消系统的验证提示。')
g.section('微信怎么发给朋友','只发适合对方芯片的一个 .pkg，再附上这两份 PDF。无需发送源码、项目文件夹、Windows 安装包或你的个人数据。')
g.new('更新与日常使用','已有旧版时，先备份和退出，再运行新的安装包。')
g.section('更新前的三步','1. 在旧版“数据与备份”里导出包含附件的 JSON 备份。<br/>2. 退出 Work Log；不要让旧窗口继续运行。<br/>3. 双击新版 .pkg，完成安装，再从“应用程序”打开。')
g.p('安装器更新“应用程序”里的 Work Log，不主动清空个人记录。如果以前把 App 放在桌面等其他位置，安装后请改用“应用程序”里的版本，避免继续打开旧副本。')
g.section('记录放在哪里','默认保存在当前 Mac 账户的用户资料库：<br/><b>~/Library/Application Support/WorkJournal/data</b><br/>Finder → 前往 → 前往文件夹，可粘贴上面的路径。升级时不需要手动移动这里的文件。')
g.section('几个最常用的入口','<b>今日：</b>查看当天待办，以及每日／每周／每月计划。<br/><b>工作记录：</b>填写已做的事情和附件，可按实际发生日期补记。<br/><b>待办事项：</b>直接写内容并保存；需要期限时勾选“截止日期”，补齐日、时、分。<br/><b>选项：</b>设置计划周期、次数或具体时刻，以及完成后是否同步到工作记录。<br/><b>时间线：</b>选取事项，导出 PDF 汇报。<br/><b>设置：</b>调整主题色、深浅色和界面语言。')
g.note('<b>保存：</b>Enter　　<b>换行：</b>Command + Enter<br/>数据保存在本机，不会自动同步到朋友的电脑。换电脑时，通过“数据与备份”导出、导入。')
g.p('项目与后续版本：<link href="https://github.com/Benjamin-can-fly/I-swear-I-did-work" color="#466453">GitHub / Benjamin-can-fly / I-swear-I-did-work</link>',small)
g.save()

g=Guide('Work-Log-0.2.9-Mac-Troubleshooting.pdf','安装报错指南')
g.new('按提示找解决办法','适用于苹果芯片版和 Intel 版的 .pkg 安装包。先看完整提示，不要把所有拦截都当成同一种问题。')
g.section('“无法验证开发者”或“Apple 无法检查…”','当前包没有 Apple Developer ID 签名和公证，可能出现这类提示。确认文件确实来自本项目且完整后，先尝试打开一次，再到“系统设置 → 隐私与安全性”，向下查找“仍要打开”，按系统提示确认。安装包和安装后的 App 可能分别需要确认。')
g.p('若没有“仍要打开”，先确认刚刚确实尝试打开了该文件；受学校或公司管理的 Mac 可能不允许自行放行，应联系管理员。不要关闭全局安全保护。',small)
g.section('“已损坏”“包含恶意软件”或“将损坏电脑”','这不等同于“开发者无法验证”。先停止安装，重新获取完整文件，核对包名和来源；仍出现时，把完整提示反馈给作者或管理员。不要用终端命令强行绕过，也不要随意清除安全属性。')
g.section('“不能安装在此电脑”或系统版本不支持','检查“关于本机”：Apple M 系列使用 arm64.pkg，Intel 使用 x64.pkg；系统需 macOS 13.5 或以上。不要用 Windows 的 .exe。若系统太旧，需先确认电脑支持升级；本包不支持更旧系统。')
g.section('要求密码，或提示没有权限','安装到“应用程序”可能需要 Mac 管理员授权。普通账户的密码不一定有安装权限；使用获授权的管理员账户，或联系电脑管理员。不要在聊天中发送密码。')
g.section('双击包没有打开，或提示无法识别文件','确认文件已经从微信完整下载，扩展名是 .pkg，且有正常的文件大小。先保存到 Finder 中再双击，不要只点微信里的预览。文件名变成 .pkg.zip 时，先解压后再打开 .pkg。')
g.p('安全提示处理依据：<link href="https://support.apple.com/zh-cn/102445" color="#466453">Apple 官方说明：在 Mac 上安全地打开 App</link>。仅对来源可信、未被篡改的文件考虑单独放行。',small)
g.new('装完后仍有问题','先保留现有数据，再排查。删除数据文件夹不属于常规修复步骤。')
g.section('“安装失败”，但没有明确原因','退出所有 Work Log 窗口，检查 Mac 的可用磁盘空间，再试一次。仍失败时，在安装器的“窗口 → 安装器日志”中查看错误信息，保存日志或截取相关报错。不要手动修改“应用程序”的整体权限。')
g.section('显示成功，却找不到软件','用 Finder 打开“应用程序”，找到 Work Log.app。安装包不会自动启动软件，也不会强制创建桌面快捷方式。需要常用入口时，打开后将图标保留在程序坞中。')
g.section('安装成功，但点击 App 打不开','先查看是否又出现系统安全提示；按前页对应情况处理。若没有提示，退出仍在运行的旧副本后，从“应用程序”重开。若始终空白或反复退出，请记录现象和报错，避免反复点击启动多个窗口。')
g.section('打开的界面还是旧版','确认打开的是 /Applications/Work Log.app。若仍在 DMG 窗口、桌面或下载文件夹内打开旧 App，会继续运行旧副本。退出旧窗口，再从“应用程序”启动新版。')
g.section('更新后记录看起来不见了','先确认登录的是同一个 macOS 用户账户。旧浏览器版与桌面版、不同电脑或不同账户的数据可能不在同一处。优先从旧版导出备份，再在新版导入；不要删除或覆盖用户资料库中的 WorkJournal 文件夹。')
g.note('<b>反馈时带上这四项：</b><br/>完整报错截图；macOS 版本；Apple M 或 Intel 芯片；收到的安装包完整文件名。<br/>软件能打开的话，先导出一份数据备份。')
g.p('项目反馈入口：<link href="https://github.com/Benjamin-can-fly/I-swear-I-did-work/issues" color="#466453">GitHub Issues</link>；也可以把以上信息直接发给给你安装包的人。',small)
g.save()
