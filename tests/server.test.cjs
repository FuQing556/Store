'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const http=require('node:http');
const {spawn}=require('node:child_process');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
function launch(port) {
  return spawn(process.execPath,['scripts/serve.cjs','--port',String(port)],{cwd:root,windowsHide:true,stdio:['ignore','pipe','pipe']});
}
function completed(child) {
  return new Promise((resolve,reject)=>{
    let output=''; child.stdout.on('data',b=>output+=b);child.stderr.on('data',b=>output+=b);
    child.on('error',reject);child.on('close',code=>resolve({code,output}));
  });
}
test('启动器重复启动本项目时复用服务，其他程序占用时明确报错', {timeout:10000}, async t=>{
  const fixture=http.createServer((req,res)=>res.end('another app'));
  await new Promise(resolve=>fixture.listen(0,'127.0.0.1',resolve));
  const port=fixture.address().port;
  t.after(()=>fixture.close());
  const foreign=await completed(launch(port));
  assert.equal(foreign.code,1);assert.match(foreign.output,/被其他程序占用/);
  await new Promise(resolve=>fixture.close(resolve));
  const first=launch(port);t.after(()=>first.kill());
  await new Promise((resolve,reject)=>{
    first.once('error',reject);
    first.stdout.once('data',resolve);
    first.once('exit',code=>reject(new Error(`Server exited: ${code}`)));
  });
  const repeated=await completed(launch(port));
  assert.equal(repeated.code,0);assert.match(repeated.output,/已经在运行/);
  assert.equal(first.exitCode,null);
});
