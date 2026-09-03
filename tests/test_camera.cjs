const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const context=vm.createContext({window:{addEventListener(){}},console});
vm.runInContext(fs.readFileSync(path.join(__dirname,'../src/js/camera.js'),'utf8')+'\nthis.camera=CameraStudio;',context);
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
const stream=()=>{const result={stopped:false};result.getTracks=()=>[{stop:()=>result.stopped=true}];return result;};
(async()=>{
  const request=deferred(),media=context.camera.createSession(()=>request.promise),incoming=stream();
  const pending=media.start({});media.stop();request.resolve(incoming);
  assert.equal(await pending,null);assert.equal(incoming.stopped,true);
  const first=deferred(),second=deferred();let call=0;
  const switching=context.camera.createSession(()=>++call===1?first.promise:second.promise);
  const p1=switching.start({}),p2=switching.start({}),s1=stream(),s2=stream();
  second.resolve(s2);assert.equal(await p2,s2);first.resolve(s1);assert.equal(await p1,null);
  assert.equal(s1.stopped,true);assert.equal(s2.stopped,false);switching.stop();assert.equal(s2.stopped,true);
  // Exercise the bundled decoder offline with a generated Code 128 pixel canvas.
  global.window={};const zxing=require('../assets/vendor/zxing-browser.min.js');
  const utils=fs.readFileSync(path.join(__dirname,'../src/js/utils.js'),'utf8');
  const patterns=JSON.parse(utils.match(/const PATTERNS = (\[[\s\S]*?\]);/)[1]);
  const text='6001000000002',codes=[104];let checksum=104;
  [...text].forEach((ch,i)=>{codes.push(ch.charCodeAt(0)-32);checksum+=(ch.charCodeAt(0)-32)*(i+1);});codes.push(checksum%103,106);
  const stripes=[];for(const code of codes){[...patterns[code]].forEach((n,i)=>{for(let j=0;j<Number(n)*3;j++)stripes.push(i%2?255:0);});}
  const width=stripes.length+120,height=180,pixels=new Uint8ClampedArray(width*height*4);pixels.fill(255);
  for(let y=20;y<160;y++)stripes.forEach((v,x)=>{const i=(y*width+x+60)*4;pixels[i]=pixels[i+1]=pixels[i+2]=v;});
  const canvas={width,height,getContext:()=>({getImageData:()=>({data:pixels})})};
  const reader=new zxing.BrowserMultiFormatReader();
  assert.equal(reader.decodeFromCanvas(canvas).getText(),text);
  if(process.argv.includes('--fixture')){
    const zlib=require('node:zlib');
    const crc=buffer=>{let c=0xffffffff;for(const byte of buffer){c^=byte;for(let i=0;i<8;i++)c=c&1?(c>>>1)^0xedb88320:c>>>1;}return (c^0xffffffff)>>>0;};
    const chunk=(type,data)=>{const bytes=Buffer.concat([Buffer.from(type),data]),len=Buffer.alloc(4),sum=Buffer.alloc(4);len.writeUInt32BE(data.length);sum.writeUInt32BE(crc(bytes));return Buffer.concat([len,bytes,sum]);};
    const header=Buffer.alloc(13);header.writeUInt32BE(width);header.writeUInt32BE(height,4);header[8]=8;header[9]=6;
    const rows=[];for(let y=0;y<height;y++)rows.push(Buffer.from([0]),Buffer.from(pixels.slice(y*width*4,(y+1)*width*4)));
    const png=Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',zlib.deflateSync(Buffer.concat(rows))),chunk('IEND',Buffer.alloc(0))]);
    fs.mkdirSync(path.join(__dirname,'fixtures'),{recursive:true});fs.writeFileSync(path.join(__dirname,'fixtures/scan-code128.png'),png);
  }
  console.log('PASS: late permissions, overlapping starts, track cleanup, offline Code 128 decoding');
})().catch(e=>{console.error(e.message);process.exitCode=1;});
