"""Create a clean upload folder and source ZIP without copying user data."""
import hashlib, json, os, shutil, subprocess, zipfile
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
VERSION=json.loads((ROOT/'package.json').read_text(encoding='utf-8-sig'))['version']
desktop=Path(os.environ['USERPROFILE'])/'Desktop'
delivery=desktop/f'Work Log_{VERSION}_上传准备'
source=delivery/'01_上传到GitHub的源码'
packages=delivery/'02_安装包'
guides=delivery/'03_说明与核对'
if source.exists():raise SystemExit('Upload source already exists; preserve it and review before replacing.')
source.mkdir(parents=True)
packages.mkdir(parents=True,exist_ok=True);guides.mkdir(parents=True,exist_ok=True)
files=[]
for name in ['src','server','desktop','.github']:
 files.extend(p for p in (ROOT/name).rglob('*') if p.is_file() and '__pycache__' not in p.parts)
for name in ['package.json','package-lock.json','index.html','report.html','README.md','LICENSE','THIRD-PARTY-NOTICES.md','.gitignore','.env.example','启动工作日志.cmd','停止工作日志.cmd','上传到GitHub.cmd']:
 files.append(ROOT/name)
for name in ['render-icon.mjs','build-icons.py','build-desktop.ps1','build-macos.py','setup-desktop.ps1','start.ps1','stop.ps1','publish-github.ps1','prepare-release.py','create-guide.py','create-github-guide.py']:
 files.append(ROOT/'scripts'/name)
for p in (ROOT/'tests').iterdir():
 if p.is_file() and p.name!='interaction.mjs':files.append(p)
for name in ['DEVELOPMENT.md',f'ACCEPTANCE-{VERSION}.md']:files.append(ROOT/'docs'/name)
files.extend((ROOT/'docs/images').glob('*.png'))
files.extend((ROOT/'output/pdf').glob('*.pdf'))
manifest={}
for original in files:
 rel=original.relative_to(ROOT);dest=source/rel;dest.parent.mkdir(parents=True,exist_ok=True)
 shutil.copy2(original,dest)
 digest=hashlib.sha256(original.read_bytes()).hexdigest()
 assert hashlib.sha256(dest.read_bytes()).hexdigest()==digest
 manifest[rel.as_posix()]=digest
assert not any(p.startswith(('data/','artifacts/','node_modules/','.build-tools/','dist/')) or p=='.env' for p in manifest)
assert json.loads((source/'package.json').read_text())['version']==VERSION
assert f"'{VERSION}'" in (source/'src/lib/version.js').read_text()
archive=delivery/f'WorkJournal-{VERSION}-source.zip'
with zipfile.ZipFile(archive,'w',zipfile.ZIP_DEFLATED) as z:
 for rel in sorted(manifest):z.write(source/rel,rel)
with zipfile.ZipFile(archive) as z:
 assert sorted(z.namelist())==sorted(manifest)
 assert all(hashlib.sha256(z.read(rel)).hexdigest()==digest for rel,digest in manifest.items())
for name in [f'WorkLog-{VERSION}-windows-x64-setup.exe',f'WorkLog-{VERSION}-windows-x64-setup.exe.sha256']:
 shutil.copy2(ROOT/'dist'/name,packages/name)
(packages/'Mac安装包状态.txt').write_text('Mac 苹果芯片与 Intel 的源码和构建目标均为 '+VERSION+'。\n当前目录没有 DMG：需上传源码后运行 GitHub Actions 的两个 Mac 构建任务，通过实际运行测试后下载。\n不要把 Windows EXE 或源码 ZIP 发给 Mac 用户作为安装包。\n',encoding='utf-8-sig')
for p in (ROOT/'output/pdf').glob('*.pdf'):shutil.copy2(p,guides/p.name)
shutil.copy2(ROOT/'docs'/f'ACCEPTANCE-{VERSION}.md',guides/'最终需求核对.md')
(guides/'源码校验清单.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf-8')
(delivery/'先读我.txt').write_text(f'''工作日志 {VERSION} · 上传准备

01_上传到GitHub的源码：在 GitHub Desktop 中添加此目录，然后 Publish repository。
02_安装包：已验证的 Windows 安装包。Mac 安装包需 GitHub Mac 构建通过后补齐。
03_说明与核对：17 页使用说明、5 页分享和 GitHub 教程、最终需求核对表。
WorkJournal-{VERSION}-source.zip：干净源码备份。请解压后上传文件，不要只上传这个 ZIP 当仓库。

用户名 Benjamin-can-fly；建议仓库 work-journal；公开；MIT。
上传后 Actions → Build desktop previews → Run workflow。三个任务通过后才发布完整安装包合集。
本包不包含私人日志、附件、缓存或 API 密钥。尚未替你上传 GitHub。
桌面“Work Log”是日常使用入口；源项目仍在 E:\\工作日志。
''',encoding='utf-8-sig')
# An initialized local repository makes GitHub Desktop's Add local repository unambiguous.
for args in [['init','-b','main'],['config','user.name','Benjamin-can-fly'],['config','user.email','Benjamin-can-fly@users.noreply.github.com'],['add','--all'],['commit','-m',f'Prepare {VERSION} desktop preview']]:
 subprocess.run(['git',*args],cwd=source,check=True,stdout=subprocess.DEVNULL)
print(json.dumps({'delivery':str(delivery),'sourceFiles':len(manifest),'sourceZipBytes':archive.stat().st_size},ensure_ascii=False))

