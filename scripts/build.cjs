'use strict';
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'dist');
fs.mkdirSync(output, { recursive: true });
for (const name of ['index.html', 'styles.css', 'src', 'assets']) fs.cpSync(path.join(root, name), path.join(output, name), { recursive: true });
console.log('构建完成：dist/index.html（完整离线包，可直接双击打开）');
