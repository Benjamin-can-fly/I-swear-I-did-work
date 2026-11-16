"""Generate the current, shareable quick-start guide without loading user data."""
from pathlib import Path
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import Paragraph
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.colors import HexColor
import json

ROOT = Path(__file__).resolve().parents[1]
VERSION = json.loads((ROOT/'package.json').read_text(encoding='utf-8-sig'))['version']
OUT = ROOT/'output/pdf/Work-Log-User-Guide.pdf'
OUT.parent.mkdir(parents=True, exist_ok=True)
pdfmetrics.registerFont(TTFont('Guide', 'C:/Windows/Fonts/msyh.ttc', subfontIndex=0))
pdfmetrics.registerFont(TTFont('GuideBold', 'C:/Windows/Fonts/msyhbd.ttc', subfontIndex=0))
pdfmetrics.registerFontFamily('Guide', normal='Guide', bold='GuideBold')
pages = [
 ('开始使用', 'Work Log · '+VERSION, [
  ('安装与首次打开', 'Windows 下载 windows-x64-setup.exe，双击安装。Mac 按芯片选择 macos-arm64（Apple M 系列）或 macos-x64（Intel），双击 .pkg 按向导安装。安装包及版本以 GitHub Releases 实际列出的内容为准。'),
  ('每个人从空白开始', '新电脑安装后没有任何记录、待办、计划或附件。你的数据只保存在你自己的用户目录。升级已有安装会保留原有数据；这不代表新安装包包含这些数据。'),
  ('五个工作页面', '今日：查看今天的安排、计划与逾期提醒。工作记录：保存已做的事。待办事项：处理、搁置与完成任务。时间线：合看过去和未来，选择事项导出汇报。数据后台：查看使用、完成及漏做情况。'),
  ('外观与备份', '设置中调整主题色、深浅模式和中英文。数据与备份可导出包含附件的备份；换电脑时在另一台设备手动导入。不要把个人备份当成安装包发给别人。'),
 ]),
 ('直接写，交给模型整理', '随手记只有一个输入入口', [
  ('联网时', '在今日、待办或工作记录的输入框里写完整安排。语言模型读取这次输入，生成事项及相应字段。展开结果可核对内容、日期、优先级与关联关系，然后保存。原始输入保留，不需要再找一个 AI 输入框。'),
  ('第一次连接模型', '使用在线 Gemini 2.5 Flash，无需下载本地模型。展开输入框中的配置入口，填写自己的 Gemini API 密钥。密钥只保存在本机用户目录；本次输入会发送给 Google，全部历史日志不会发送。免费额度和可用地区以服务商为准。'),
  ('可以这样说', '“明天晚上八点前交报告，优先级高。”——事项是交报告，时间和优先级分别保存。<br/><br/>“先写作文，再检查一遍。”——形成有先后顺序的两条待办。<br/><br/>“每周写三篇日记。”——每周完成三次，不替你指定哪天写。'),
  ('保存与修改', 'Enter 保存，Ctrl + Enter 换行；输入法选字不会提交。结果可以修改，不确定的表达先核对。模型故障、超时或结果不完整会明确显示，不会冒充已经识别成功。附件可点击添加或拖入输入区域。'),
 ]),
 ('离线、完成与后续任务', '网络变化不会清掉正在写的内容', [
  ('自动离线记录', '检测不到网络时自动转为离线记录，使用原有关键词识别，并允许手动调整去向与字段。恢复联网后，新输入重新使用模型；已经手动修改的草稿不会被覆盖。'),
  ('完成任务', '点击任务文字或前面的勾选框完成事项。三个点菜单用于修改、搁置、删除或返回待处理。前置任务未完成时，后续任务会显示等待。'),
  ('先做 A，再做 B', 'A 完成后，B 解锁并获得焦点。撤销 A 的完成，尚未完成的 B 恢复等待；已完成的历史不会自动改写。前一步被删除时，需要明确解除或修改关联。普通任务支持先后关系，周期计划之间暂不支持关联。'),
  ('同步与计划', '开启“自动同步至工作记录”的待办，在完成时生成记录；之后修改、回退或删除会同步处理关联记录。独立工作记录不反过来修改待办。每日、每周、每月计划的历史各自保留，删除本次与删除整个计划含义不同。'),
  ('日期与提醒', '只安排日期与设置截止日期不同。24 小时内到期显示黄色，逾期显示红色。Windows 系统提醒需要明确日期、时间并开启提醒；系统勿扰或关机可能影响送达。'),
 ]),
 ('汇报、分享与常见问题', '把软件发给同学，把自己的记录留在本机', [
  ('导出周报或阶段汇报', '打开时间线，点击选择事项／导出汇报。可按单条、日、周或月多选，填写标题后导出 PDF。只导出自己选中的内容；导出汇报不会删除原记录。'),
  ('发给同学', '发送 GitHub Release 链接，或用微信发送与对方系统匹配的安装包和本说明。无需发送源码、整个项目文件夹、个人数据目录或 JSON 备份。Mac 两种芯片的安装包不能混用。'),
  ('安装被系统拦截', '当前包尚未完成发布者签名或 Apple 公证。先确认下载来源；按照操作系统提示检查来源与允许打开的选项。不要关闭系统安全保护，也不要使用来源不明的修复命令。'),
  ('模型不可用', '检查网络、API 密钥和免费额度。模型超时或返回无效字段会保留输入并提示重试。没有密钥时不会假装已经接通。最终在线接口按要求未重新实测，复杂安排保存前请核对。'),
  ('数据与更新', '更新前建议导出备份。安装新版会继续使用本机数据。公开仓库与发行包不提供自动云同步，也不包含你的账号、私人日志和个人模型配置。需要恢复备份时，由使用者自己选择文件导入。'),
 ]),
]
c = canvas.Canvas(str(OUT), pagesize=(595.28,841.89), pageCompression=1)
c.setTitle('Work Log '+VERSION+' 使用说明'); c.setAuthor('Work Log')
style=ParagraphStyle('body',fontName='Guide',fontSize=10.5,leading=18,textColor=HexColor('#283330'),wordWrap='CJK')
for i,(title,sub,sections) in enumerate(pages,1):
 c.setFillColor(HexColor('#426957'));c.rect(0,835,595.28,7,fill=1,stroke=0)
 c.setFont('Guide',9);c.drawString(44,800,'WORK LOG / 使用说明');c.drawRightString(551,800,'2026.11.16')
 c.setFillColor(HexColor('#202b27'));c.setFont('GuideBold',25);c.drawString(44,750,title)
 c.setFont('Guide',10);c.setFillColor(HexColor('#6b7972'));c.drawString(44,722,sub)
 y=680
 for heading,text in sections:
  c.setFillColor(HexColor('#426957'));c.setFont('GuideBold',12);c.drawString(44,y,heading);y-=14
  p=Paragraph(text,style);_,h=p.wrap(507,1000)
  assert y-h>65, (i,heading,y,h)
  p.drawOn(c,44,y-h);y-=h+27
 c.setFillColor(HexColor('#6b7972'));c.setFont('Guide',9);c.drawString(44,34,'Work Log '+VERSION);c.drawRightString(551,34,f'{i} / {len(pages)}');c.showPage()
c.save();print(OUT)
