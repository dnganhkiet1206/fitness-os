import json,struct,io
from PIL import Image
F='/root/.claude/uploads/3b4aaa8d-7d01-5b9a-b0e3-7553a5562d2c/4d299a0c-Meshy_AI_Character_output.glb'
OUTGLB='/home/user/fitness-os/native/assets/mascots/koa.glb'
d=open(F,'rb').read(); off=12; J=None; BIN=None
while off<len(d):
    cl,ct=struct.unpack('<I4s',d[off:off+8]); off+=8; c=d[off:off+cl]; off+=cl
    if ct==b'JSON': J=json.loads(c)
    elif ct==b'BIN\x00': BIN=c

# which bufferView each image uses + target size (base color bigger, maps smaller)
mat=J['materials'][0]; pm=mat['pbrMetallicRoughness']
base_ti=pm['baseColorTexture']['index']; base_img=J['textures'][base_ti]['source']
imgSizes={}
for ti,tx in enumerate(J['textures']):
    imgSizes[tx['source']]=1024 if tx['source']==base_img else 512

def bv_bytes(bvi):
    bv=J['bufferViews'][bvi]; o=bv.get('byteOffset',0); L=bv['byteLength']; return BIN[o:o+L]

# build replacement bytes for image bufferViews
new_img_bytes={}
for imi,im in enumerate(J['images']):
    bvi=im['bufferView']; raw=bv_bytes(bvi)
    pi=Image.open(io.BytesIO(raw)).convert('RGB')
    sz=imgSizes.get(imi,512)
    if pi.width>sz: pi=pi.resize((sz,sz),Image.LANCZOS)
    buf=io.BytesIO(); pi.save(buf,'JPEG',quality=85); new_img_bytes[bvi]=buf.getvalue()
    im['mimeType']='image/jpeg'

# rebuild BIN: iterate bufferViews in index order, replace image ones, realign
def pad4(n): return (4-(n%4))%4
new=bytearray();
for bvi,bv in enumerate(J['bufferViews']):
    data=new_img_bytes.get(bvi, bv_bytes(bvi))
    while len(new)%4: new.append(0)
    bv['byteOffset']=len(new); bv['byteLength']=len(data)
    if 'byteStride' in bv and bvi in new_img_bytes: del bv['byteStride']
    new+=data
while len(new)%4: new.append(0)
J['buffers'][0]['byteLength']=len(new)
J['buffers'][0].pop('uri',None)

jsonb=json.dumps(J,separators=(',',':')).encode()
jsonb+=b' '*pad4(len(jsonb))
binb=bytes(new)+b'\x00'*pad4(len(new))
total=12+8+len(jsonb)+8+len(binb)
out=bytearray()
out+=struct.pack('<4sII',b'glTF',2,total)
out+=struct.pack('<I4s',len(jsonb),b'JSON')+jsonb
out+=struct.pack('<I4s',len(binb),b'BIN\x00')+binb
open(OUTGLB,'wb').write(out)
print('wrote',OUTGLB, round(len(out)/1024/1024,2),'MB (was',round(len(d)/1024/1024,2),'MB)')
