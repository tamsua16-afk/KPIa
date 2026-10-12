import fs from 'node:fs';
const assets={};for(let name of ['index.html','style.css','seed.js','core.js','main.js','accounts.js'])assets['/'+name]=fs.readFileSync('dist/'+name,'utf8');assets['/']=assets['/index.html'];
let core=fs.readFileSync('dist/core.js','utf8');
let modules=['common','policy','auth','api'].map(name=>fs.readFileSync('worker/'+name+'.js','utf8').replace(/^import .*;\r?\n/gm,'').replaceAll('export ','')).join('\n');
let bcryptSource=fs.readFileSync('node_modules/bcryptjs/umd/index.js','utf8');
const output=`${bcryptSource}\nconst bcrypt=globalThis.bcrypt;\n${core}\n${modules}\nconst assets=${JSON.stringify(assets)};\nexport default {async fetch(request,env){const p=new URL(request.url).pathname;if(p.startsWith('/api/')||p.startsWith('/auth/'))return api(request,env);if(!assets[p])return new Response('Not found',{status:404});return new Response(assets[p],{headers:{'Content-Type':p.endsWith('.js')?'text/javascript; charset=utf-8':p.endsWith('.css')?'text/css; charset=utf-8':'text/html; charset=utf-8','Cache-Control':'no-cache','X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin'}})}};`;
fs.mkdirSync('dist/server',{recursive:true});fs.writeFileSync('dist/server/index.js',output);fs.mkdirSync('dist/.openai',{recursive:true});fs.copyFileSync('.openai/hosting.json','dist/.openai/hosting.json');console.log('Built KPI worker with embedded assets');

