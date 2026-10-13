"""After node scripts/render-icon.mjs, convert the PNG into native icon containers (Pillow required)."""
from pathlib import Path
from PIL import Image
root=Path(__file__).resolve().parents[1]
out=root/'desktop/assets';out.mkdir(exist_ok=True)
with Image.open(root/'src/assets/app-icon.png') as im:
 im.save(out/'app.ico',sizes=[(n,n) for n in (16,20,24,32,40,48,64,128,256)])
 im.save(out/'app.icns')
