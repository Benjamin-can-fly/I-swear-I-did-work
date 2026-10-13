"""Build on macOS. Uses only Apple's tools and Python's standard library."""
import argparse, hashlib, json, os, plistlib, shutil, subprocess, sys, tarfile, tempfile, urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
NODE_VERSION = '24.18.0'

def run(*args, **kwargs):
    subprocess.run([str(a) for a in args], check=True, **kwargs)

def build(arch):
    if sys.platform != 'darwin':
        raise SystemExit('macOS with Xcode Command Line Tools is required. Use the GitHub macOS workflow.')
    swift_arch = {'arm64':'arm64', 'x64':'x86_64'}[arch]
    version = json.loads((ROOT/'package.json').read_text(encoding='utf-8-sig'))['version']
    dist = ROOT/'dist'; dist.mkdir(exist_ok=True)
    archive_name = f'node-v{NODE_VERSION}-darwin-{arch}.tar.gz'
    base = f'https://nodejs.org/dist/v{NODE_VERSION}/'
    with tempfile.TemporaryDirectory(prefix='work-journal-mac-') as temporary:
        temp = Path(temporary)
        archive = temp/archive_name
        urllib.request.urlretrieve(base+archive_name, archive)
        hashes = urllib.request.urlopen(base+'SHASUMS256.txt').read().decode()
        expected = next(line.split()[0] for line in hashes.splitlines() if line.split()[-1] == archive_name)
        if hashlib.sha256(archive.read_bytes()).hexdigest() != expected:
            raise RuntimeError('Node.js archive checksum mismatch')
        with tarfile.open(archive) as tar:
            tar.extractall(temp/'node', filter='data')
        node = temp/'node'/f'node-v{NODE_VERSION}-darwin-{arch}'
        volume = temp/'volume'; volume.mkdir()
        app = volume/'Work Log.app'; contents = app/'Contents'
        resources = contents/'Resources'; macos = contents/'MacOS'
        resources.mkdir(parents=True); macos.mkdir()
        shutil.copy2(ROOT/'desktop/assets/app.icns',resources/'WorkJournal.icns')
        runtime = resources/'runtime'; runtime.mkdir()
        shutil.copy2(node/'bin/node', runtime/'node'); shutil.copy2(node/'LICENSE', runtime/'LICENSE')
        (runtime/'node').chmod(0o755)
        code = resources/'app'; code.mkdir()
        for name in ['index.html','report.html','package.json']:
            shutil.copy2(ROOT/name, code/name)
        for name in ['src','server']:
            shutil.copytree(ROOT/name, code/name)
        for name in ['LICENSE','THIRD-PARTY-NOTICES.md']:
            if (ROOT/name).exists(): shutil.copy2(ROOT/name, resources/name)
        shutil.copy2(ROOT/'output/pdf/工作日志使用说明.pdf',resources/'使用说明.pdf')
        with (contents/'Info.plist').open('wb') as file:
            plistlib.dump({'CFBundleExecutable':'WorkJournal','CFBundleIdentifier':'io.github.benjamin-can-fly.work-journal',
                'CFBundleName':'Work Log','CFBundleDisplayName':'Work Log','CFBundlePackageType':'APPL',
                'CFBundleShortVersionString':version,'CFBundleVersion':version,'LSMinimumSystemVersion':'13.5',
                'CFBundleIconFile':'WorkJournal.icns','NSHighResolutionCapable':True,'NSAppTransportSecurity':{'NSAllowsLocalNetworking':True},
                'NSHumanReadableCopyright':'Copyright © 2026 Benjamin-can-fly'}, file)
        run('xcrun','swiftc','-swift-version','5','-O','-target',f'{swift_arch}-apple-macos13.5',
            '-framework','AppKit','-framework','WebKit','-framework','UniformTypeIdentifiers',
            ROOT/'desktop/macos/main.swift','-o',macos/'WorkJournal')
        # Ad-hoc integrity signing is not Developer ID signing or Apple notarization.
        run('codesign','--force','--sign','-',app)
        run('codesign','--verify','--deep','--strict',app)
        # Exercise the actual bundled app on its matching architecture before packaging.
        test_data = temp/'test-data'; test_data.mkdir()
        env = {**os.environ,'WORKJOURNAL_TEST_MODE':'1','WORKJOURNAL_PORT':'43172',
            'WORKJOURNAL_DATA_DIR':str(test_data),'WORKJOURNAL_TEST_SCRIPT':str(ROOT/'tests/desktop-smoke.js')}
        run(macos/'WorkJournal',env=env,timeout=100)
        result = json.loads((test_data/'smoke-result.json').read_text())
        if not result.get('success'): raise RuntimeError(f'Desktop smoke test failed: {result}')
        if not (test_data/'report.pdf').read_bytes().startswith(b'%PDF-'): raise RuntimeError('PDF export missing')
        evidence = ROOT/'artifacts'/f'macos-{arch}'; evidence.mkdir(parents=True,exist_ok=True)
        for name in ['smoke-result.json','report.pdf']: shutil.copy2(test_data/name, evidence/name)
        os.symlink('/Applications',volume/'Applications')
        (volume/'安装说明.txt').write_text('将“Work Log.app”拖入 Applications（应用程序），然后从应用程序打开。\n'
            '需要 macOS 13.5 或更新版本。此预览版尚未获得 Apple Developer ID 签名和公证，系统可能阻止首次打开。\n'
            '请阅读 GitHub 发布页的说明；不要关闭系统安全保护。\n',encoding='utf-8')
        output = dist/f'WorkLog-{version}-macos-{arch}.dmg'
        run('hdiutil','create','-volname','Work Log','-srcfolder',volume,'-ov','-format','UDZO',output)
        digest = hashlib.sha256(output.read_bytes()).hexdigest()
        Path(str(output)+'.sha256').write_text(digest+'  '+output.name+'\n',encoding='ascii')
        print(json.dumps({'package':str(output),'bytes':output.stat().st_size,'smoke':result},ensure_ascii=False))

if __name__ == '__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--arch',choices=['arm64','x64'],required=True)
    build(parser.parse_args().arch)
