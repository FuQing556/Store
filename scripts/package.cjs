'use strict';
// Small standard ZIP writer using Node built-ins; no download/install is required.
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
execFileSync(process.execPath, [path.join(__dirname, 'build.cjs')], { stdio: 'inherit' });
const testOutput=execFileSync(process.execPath, ['--test', ...fs.readdirSync(path.join(root,'tests')).filter(name=>name.endsWith('.test.cjs')).map(name=>path.join(root,'tests',name))], { encoding:'utf8' });
console.log(testOutput);
const verifyOutput=execFileSync(process.execPath, [path.join(__dirname, 'verify-build.cjs')], { encoding:'utf8' });
console.log(verifyOutput);
const crcTable = Array.from({length:256},(_,n)=> { for(let i=0;i<8;i++)n=(n&1)?0xedb88320^(n>>>1):n>>>1;return n>>>0; });
function crc32(data) { let crc=0xffffffff;for(const b of data)crc=crcTable[(crc^b)&255]^(crc>>>8);return (crc^0xffffffff)>>>0; }
function walk(directory, prefix='') {
  const result=[];
  for(const item of fs.readdirSync(directory,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))) {
    const file=path.join(directory,item.name), name=prefix+item.name;
    if(item.isDirectory())result.push(...walk(file,name+'/'));
    else if(item.isFile())result.push({name,data:fs.readFileSync(file)});
  }
  return result;
}
function archive(entries,file) {
  const local=[],central=[];let offset=0;
  const now=new Date(), date=((now.getFullYear()-1980)<<9)|((now.getMonth()+1)<<5)|now.getDate();
  for(const entry of entries) {
    const name=Buffer.from(entry.name,'utf8'), original=entry.data, data=zlib.deflateRawSync(original), crc=crc32(original);
    const header=Buffer.alloc(30);header.writeUInt32LE(0x04034b50,0);header.writeUInt16LE(20,4);header.writeUInt16LE(0x800,6);header.writeUInt16LE(8,8);header.writeUInt16LE(date,12);header.writeUInt32LE(crc,14);header.writeUInt32LE(data.length,18);header.writeUInt32LE(original.length,22);header.writeUInt16LE(name.length,26);
    local.push(header,name,data);
    const ch=Buffer.alloc(46);ch.writeUInt32LE(0x02014b50,0);ch.writeUInt16LE(20,4);ch.writeUInt16LE(20,6);ch.writeUInt16LE(0x800,8);ch.writeUInt16LE(8,10);ch.writeUInt16LE(date,14);ch.writeUInt32LE(crc,16);ch.writeUInt32LE(data.length,20);ch.writeUInt32LE(original.length,24);ch.writeUInt16LE(name.length,28);ch.writeUInt32LE(offset,42);
    central.push(ch,name);offset+=header.length+name.length+data.length;
  }
  const c=Buffer.concat(central),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50,0);end.writeUInt16LE(entries.length,8);end.writeUInt16LE(entries.length,10);end.writeUInt32LE(c.length,12);end.writeUInt32LE(offset,16);
  fs.writeFileSync(file,Buffer.concat([...local,c,end]));console.log(`交付包：${file}（${entries.length}个文件）`);
}
const output=path.join(root,'delivery');
const handoff=path.join(output,'百味饭馆');
fs.mkdirSync(handoff,{recursive:true});
const source=[];
for(const item of ['index.html','styles.css','package.json','README.md','start.bat','.gitignore'])source.push({name:item,data:fs.readFileSync(path.join(root,item))});
for(const item of ['src','assets','tests','scripts','dist'])source.push(...walk(path.join(root,item),item+'/').filter(entry=>!entry.name.endsWith('/restaurant-board.png')));
for(const item of ['DESIGN.md','ACCEPTANCE.md','ART.md','AUDIO.md'])source.push({name:'docs/'+item,data:fs.readFileSync(path.join(root,'docs',item))});
archive(source.map(entry=>({...entry,name:'百味饭馆/'+entry.name})),path.join(handoff,'项目.zip'));
fs.copyFileSync(path.join(root,'README.md'),path.join(handoff,'README.md'));
archive(['项目.zip','README.md'].map(name=>({name,data:fs.readFileSync(path.join(handoff,name))})),path.join(output,'百味饭馆.zip'));
console.log('最终结构：百味饭馆.zip → 项目.zip + README.md');
