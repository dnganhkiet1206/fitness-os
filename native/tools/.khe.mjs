import jimp from 'jimp-compact';
const img = await jimp.read(process.argv[2]);
const runs=[]; let s=null;
for(let y=110;y<870;y++){
  const {r,g,b}=jimp.intToRGBA(img.getPixelColor(200,y));
  const card=(r+g+b)>=34;
  if(card&&s===null)s=y;
  if(!card&&s!==null){ if(y-s>10) runs.push([s,y-1]); s=null; }
}
if(s!==null) runs.push([s,869]);
let prev=null;
for(const [a,b] of runs){ if(prev!==null) console.log('   khe '+(a-prev-1)+'px'); console.log('  thẻ '+a+'→'+b); prev=b; }
