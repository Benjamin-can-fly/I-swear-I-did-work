"""Native Installer package; called only by the macOS builder/CI runner."""
import hashlib
import json
import os
import plistlib
import shutil
import subprocess
from pathlib import Path
from xml.sax.saxutils import escape


def run(*args, **kwargs):
    return subprocess.run([str(a) for a in args], check=True, **kwargs)


def build_pkg(root, app, version, arch, temp, smoke_env, evidence):
    package_dir = temp/'pkg'; package_dir.mkdir()
    payload = package_dir/'payload'; payload.mkdir()
    shutil.copytree(app, payload/app.name, symlinks=True)
    components = package_dir/'components.plist'
    run('pkgbuild', '--analyze', '--root', payload, components)
    entries = plistlib.loads(components.read_bytes())
    for entry in entries:
        entry['BundleIsRelocatable'] = False
        entry['BundleIsVersionChecked'] = True
        entry['BundleOverwriteAction'] = 'upgrade'
    components.write_bytes(plistlib.dumps(entries))
    identifier = 'io.github.benjamin-can-fly.work-log.installer'
    component = package_dir/'WorkLog-component.pkg'
    run('pkgbuild', '--root', payload, '--component-plist', components,
        '--identifier', identifier, '--version', version,
        '--install-location', '/Applications', '--ownership', 'recommended', component)
    resources = package_dir/'resources'; resources.mkdir()
    chip = 'Apple M 系列 / Apple silicon' if arch == 'arm64' else 'Intel'
    (resources/'welcome.html').write_text(f'''<!doctype html><html><head><meta charset="utf-8">
<style>body{{font:14px -apple-system,sans-serif;color:#263c32;line-height:1.7;padding:12px}}h1{{font-size:24px}}</style></head>
<body><h1>Work Log {escape(version)}</h1><p>{chip} · macOS 13.5+</p>
<p>安装后，打开“应用程序”中的 Work Log。无需拖拽，无需另装 Node.js。</p>
<p>更新前请退出 Work Log。个人记录保存在用户资料库中，安装不会清空它们。</p>
<p>Install to Applications, then open Work Log. Quit any older copy before updating. Your journal stays in your user Library.</p>
<p>此安装包尚未获得 Apple 开发者签名和公证，系统可能要求额外确认。<br>
This installer is not Developer ID signed or notarized.</p></body></html>''', encoding='utf-8')
    distribution = package_dir/'Distribution.xml'
    host_arch = 'arm64' if arch == 'arm64' else 'x86_64'
    distribution.write_text(f'''<?xml version="1.0" encoding="utf-8"?>
<installer-gui-script minSpecVersion="2">
 <title>Work Log {escape(version)}</title>
 <welcome file="welcome.html" mime-type="text/html"/>
 <options customize="never" require-scripts="false" hostArchitectures="{host_arch}"/>
 <domains enable_anywhere="false" enable_currentUserHome="false" enable_localSystem="true"/>
 <volume-check><allowed-os-versions><os-version min="13.5"/></allowed-os-versions></volume-check>
 <choices-outline><line choice="worklog"/></choices-outline>
 <choice id="worklog" visible="false" title="Work Log"><pkg-ref id="{identifier}"/></choice>
 <pkg-ref id="{identifier}"><must-close><app id="io.github.benjamin-can-fly.work-journal"/></must-close></pkg-ref>
 <pkg-ref id="{identifier}" version="{escape(version)}" onConclusion="none">WorkLog-component.pkg</pkg-ref>
</installer-gui-script>''', encoding='utf-8')
    output = root/'dist'/f'WorkLog-{version}-macos-{arch}.pkg'
    run('productbuild', '--distribution', distribution, '--resources', resources,
        '--package-path', package_dir, output)
    # Exercise the delivered installer, not only the pre-packaged application.
    installed = Path('/Applications/Work Log.app')
    test_data = temp/'pkg-test-data'; test_data.mkdir()
    sentinel = test_data/'keep-existing-data.txt'; sentinel.write_text('preserve me', encoding='utf-8')
    for _ in range(2):
        run('sudo', 'installer', '-pkg', output, '-target', '/')
        if sentinel.read_text(encoding='utf-8') != 'preserve me':
            raise RuntimeError('Reinstall changed data outside the app')
    info = plistlib.loads((installed/'Contents/Info.plist').read_bytes())
    if info['CFBundleShortVersionString'] != version:
        raise RuntimeError('Installed application version mismatch')
    run('codesign', '--verify', '--deep', '--strict', installed)
    env = {**smoke_env, 'WORKJOURNAL_DATA_DIR':str(test_data), 'WORKJOURNAL_PORT':'43173'}
    try:
        run(installed/'Contents/MacOS/WorkJournal', env=env, timeout=150)
    finally:
        for name in ['smoke-result.json', 'smoke-error.txt', 'report.pdf']:
            if (test_data/name).exists(): shutil.copy2(test_data/name, evidence/('pkg-'+name))
    result = json.loads((test_data/'smoke-result.json').read_text())
    if not result.get('success') or not (test_data/'report.pdf').read_bytes().startswith(b'%PDF-'):
        raise RuntimeError(f'Installed package smoke test failed: {result}')
    digest = hashlib.sha256(output.read_bytes()).hexdigest()
    Path(str(output)+'.sha256').write_text(digest+'  '+output.name+'\n', encoding='ascii')
    (evidence/'pkg-verification.json').write_text(json.dumps({
        'version':version,'arch':arch,'installation':'/Applications/Work Log.app',
        'installAndReinstall':True,'installedAppSmoke':result,'sha256':digest,
        'developerIdSigned':False,'notarized':False}, indent=2), encoding='utf-8')
    print(json.dumps({'pkg':str(output),'sha256':digest,'installedSmoke':result}))
    return output
