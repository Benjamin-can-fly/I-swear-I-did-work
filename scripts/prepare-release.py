"""Create a clean upload folder and source ZIP without copying user data."""
import hashlib, json, os, shutil, subprocess, zipfile, sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
VERSION=json.loads((ROOT/'package.json').read_text(encoding='utf-8-sig'))['version']
delivery=ROOT/'release-prep'/f'Work-Log-{VERSION}-Release'
source=delivery/'01-Source'
packages=delivery/'02-Installers'
guides=delivery/'03-Guides'
prior={}
if source.exists():
 if '--refresh' not in sys.argv:raise SystemExit('Upload source already exists; use --refresh after reviewing changes.')
 if subprocess.check_output(['git','status','--porcelain'],cwd=source):raise SystemExit('Upload source has uncommitted changes; preserve them before refresh.')
 prior=json.loads((guides/'Source-Checksums.json').read_text(encoding='utf-8'))
 for rel,digest in prior.items():
  if hashlib.sha256((source/rel).read_bytes()).hexdigest()!=digest:raise SystemExit('Upload source changed: '+rel)
source.mkdir(parents=True,exist_ok=True)
packages.mkdir(parents=True,exist_ok=True);guides.mkdir(parents=True,exist_ok=True)
files=[]
for name in ['src','server','desktop','.github']:
 files.extend(p for p in (ROOT/name).rglob('*') if p.is_file() and '__pycache__' not in p.parts)
for name in ['package.json','package-lock.json','index.html','report.html','README.md','LICENSE','THIRD-PARTY-NOTICES.md','.gitattributes','.gitignore','.env.example','Start-Work-Log.cmd','Stop-Work-Log.cmd','Publish-to-GitHub.cmd']:
 files.append(ROOT/name)
for name in ['render-icon.mjs','build-icons.py','build-desktop.ps1','build-macos.py','setup-desktop.ps1','start.ps1','stop.ps1','publish-github.ps1','prepare-release.py','create-guide.py','create-github-guide.py']:
 files.append(ROOT/'scripts'/name)
for p in (ROOT/'tests').iterdir():
 if p.is_file() and p.name!='interaction.mjs':files.append(p)
files.append(ROOT/'docs/DEVELOPMENT.md')
files.extend((ROOT/'docs').glob('ACCEPTANCE-*.md'))
files.extend((ROOT/'docs/images').glob('*.png'))
files.extend((ROOT/'output/pdf').glob('*.pdf'))
manifest={}
for original in files:
 rel=original.relative_to(ROOT);dest=source/rel;dest.parent.mkdir(parents=True,exist_ok=True)
 shutil.copy2(original,dest)
 digest=hashlib.sha256(original.read_bytes()).hexdigest()
 assert hashlib.sha256(dest.read_bytes()).hexdigest()==digest
 manifest[rel.as_posix()]=digest
for rel in set(prior)-set(manifest):
 obsolete=(source/rel).resolve()
 if not obsolete.is_relative_to(source.resolve()):raise SystemExit('Unexpected obsolete path: '+rel)
 obsolete.unlink()
assert all(rel.isascii() for rel in manifest), 'Source filenames must be ASCII'
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
mac_packages = list((ROOT/'dist').glob(f'WorkLog-{VERSION}-macos-*.dmg'))
for package in mac_packages:
 shutil.copy2(package,packages/package.name)
 shutil.copy2(Path(str(package)+'.sha256'),packages/(package.name+'.sha256'))
mac_status = ('Mac 安装包已提供：'+', '.join(p.name for p in mac_packages)) if len(mac_packages)==2 else 'Mac 安装包尚未补齐，需对应的原生构建和运行测试通过。'
(packages/'Mac-Package-Status.txt').write_text(mac_status+'\n不要把 Windows EXE 或源码 ZIP 发给 Mac 用户作为安装包。\n',encoding='utf-8-sig')
for p in (ROOT/'output/pdf').glob('*.pdf'):shutil.copy2(p,guides/p.name)
shutil.copy2(ROOT/'docs'/f'ACCEPTANCE-{VERSION}.md',guides/'Acceptance-Checklist.md')
(guides/'Source-Checksums.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf-8')
(delivery/'Read-Me-First.txt').write_text(f'''Work Log {VERSION}

01-Source：干净源码及 Git 仓库，可继续修改并同步到公开仓库。
02-Installers：Windows 安装包。{mac_status}
03-Guides：17 页使用说明、5 页分享和 GitHub 教程、最终需求核对表。
WorkJournal-{VERSION}-source.zip：干净源码备份。请解压后上传文件，不要只上传这个 ZIP 当仓库。

用户名 Benjamin-can-fly；仓库 I-swear-I-did-work；公开；MIT。
后续更新可运行 Actions 中的 Build desktop previews，验证后再发布新版。
本包不包含私人日志、附件、缓存或 API 密钥。
公开源码：https://github.com/Benjamin-can-fly/I-swear-I-did-work
安装包发布页：https://github.com/Benjamin-can-fly/I-swear-I-did-work/releases/tag/v{VERSION}
桌面“Work Log”是日常使用入口；源项目位于 {ROOT}。
''',encoding='utf-8-sig')
# An initialized local repository makes GitHub Desktop's Add local repository unambiguous.
for args in [['init','-b','main'],['config','user.name','Benjamin-can-fly'],['config','user.email','Benjamin-can-fly@users.noreply.github.com'],['add','--all']]:
 subprocess.run(['git',*args],cwd=source,check=True,stdout=subprocess.DEVNULL)
if subprocess.check_output(['git','status','--porcelain'],cwd=source):
 subprocess.run(['git','commit','-m',f'Prepare {VERSION} release files'],cwd=source,check=True,stdout=subprocess.DEVNULL)
print(json.dumps({'delivery':str(delivery),'sourceFiles':len(manifest),'sourceZipBytes':archive.stat().st_size},ensure_ascii=False))

