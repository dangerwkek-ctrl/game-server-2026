const http=require('http'),fs=require('fs'),path=require('path'),crypto=require('crypto');
const{WebSocketServer}=require('ws');
const PORT=process.env.PORT||3000,DB=process.env.DB_FILE||path.join(__dirname,'users.json');
let U=Object.create(null);try{Object.assign(U,JSON.parse(fs.readFileSync(DB,'utf8')))}catch(_){}
let st=0;const save=()=>{clearTimeout(st);st=setTimeout(()=>fs.writeFile(DB,JSON.stringify(U),()=>{}),300)};
const key=n=>n.toLowerCase(),hash=(p,s)=>crypto.scryptSync(p,s,32).toString('hex'),rm=(a,x)=>{const i=a.indexOf(x);if(i>=0)a.splice(i,1)};
const server=http.createServer((q,r)=>{if(q.url==='/health'){r.end('ok');return}
fs.readFile(path.join(__dirname,'index.html'),(e,d)=>{if(e){r.writeHead(404);r.end('index.html not found');return}r.writeHead(200,{'content-type':'text/html; charset=utf-8'});r.end(d)})});
const wss=new WebSocketServer({server,maxPayload:4096}),on=new Map();
const send=(w,o)=>{if(w.readyState===1)w.send(JSON.stringify(o))},isOn=k=>on.has(k)&&on.get(k).size>0,toUser=(k,o)=>{for(const w of on.get(k)||[])send(w,o)};
const snap=k=>{const u=U[k],nm=x=>U[x]?U[x].name:x;return{t:'friends',friends:u.fr.map(x=>({name:nm(x),online:isOn(x)})),incoming:u.inc.map(nm),outgoing:u.out.map(nm)}};
const push=k=>{if(U[k])toUser(k,snap(k))};
function prof(ws,name){const k=typeof name==='string'?key(name.trim()):'',o=U[k],me=U[ws.k];
if(!o)return send(ws,{t:'profile',found:0,q:String(name||'').slice(0,16)});
const rel=k===ws.k?'self':me.fr.includes(k)?'friend':me.out.includes(k)?'sent':me.inc.includes(k)?'received':'none';
send(ws,{t:'profile',found:1,name:o.name,online:isOn(k),rel,friends:o.fr.length})}
function befriend(a,b){for(const[x,y]of[[a,b],[b,a]]){rm(U[x].inc,y);rm(U[x].out,y);if(!U[x].fr.includes(y))U[x].fr.push(y)}}
function enter(ws,k,t){ws.k=k;if(!on.has(k))on.set(k,new Set());const first=!on.get(k).size;on.get(k).add(ws);
send(ws,{t:'auth',ok:1,name:U[k].name,token:t});send(ws,snap(k));if(first)U[k].fr.forEach(push)}
function auth(ws,m){const fail=(err,resume)=>{send(ws,{t:'auth',ok:0,err,resume});if(++ws.bad>8)ws.close()};
if(m.t==='resume'){if(typeof m.token!=='string')return fail('',1);const k=Object.keys(U).find(x=>U[x].tok.includes(m.token));return k?enter(ws,k,m.token):fail('',1)}
if(m.t!=='reg'&&m.t!=='login')return;
const n=String(m.name||'').trim(),p=String(m.pass||''),k=key(n);
if(!/^[\p{L}\d_]{3,16}$/u.test(n))return fail('Ник: 3–16 символов, буквы/цифры/_');
if(p.length<4||p.length>64)return fail('Пароль: от 4 символов');
if(m.t==='reg'){if(U[k])return fail('Ник уже занят');const salt=crypto.randomBytes(16).toString('hex');U[k]={name:n,salt,hash:hash(p,salt),tok:[],fr:[],inc:[],out:[]}}
else{const u=U[k];if(!u||!crypto.timingSafeEqual(Buffer.from(hash(p,u.salt)),Buffer.from(u.hash)))return fail('Неверный ник или пароль')}
const t=crypto.randomBytes(24).toString('hex');U[k].tok=[...U[k].tok.slice(-4),t];save();enter(ws,k,t)}
wss.on('connection',ws=>{ws.k=null;ws.bad=0;ws.alive=true;ws.on('pong',()=>ws.alive=true);
ws.on('message',raw=>{let m;try{m=JSON.parse(raw)}catch(_){return}if(!m||typeof m.t!=='string')return;
if(!ws.k)return auth(ws,m);const me=U[ws.k];if(!me)return;
if(m.t==='find')return prof(ws,m.name);
if(typeof m.name!=='string')return;const k=key(m.name.trim()),o=U[k];if(!o||k===ws.k)return;
if(m.t==='req'){if(me.fr.includes(k))return;if(me.inc.includes(k)){befriend(ws.k,k);toUser(k,{t:'accepted',by:me.name})}
else if(!me.out.includes(k)){if(o.inc.length>=50)return send(ws,{t:'err',err:'У игрока слишком много заявок'});me.out.push(k);o.inc.push(ws.k);toUser(k,{t:'reqin',from:me.name})}}
else if(m.t==='acc'){if(!me.inc.includes(k))return;befriend(ws.k,k);toUser(k,{t:'accepted',by:me.name})}
else if(m.t==='dec'){rm(me.inc,k);rm(o.out,ws.k)}
else if(m.t==='rem'){rm(me.fr,k);rm(o.fr,ws.k)}
else return;
save();push(ws.k);push(k);prof(ws,o.name)});
ws.on('close',()=>{if(!ws.k)return;const s=on.get(ws.k);if(s){s.delete(ws);if(!s.size){on.delete(ws.k);U[ws.k]&&U[ws.k].fr.forEach(push)}}})});
setInterval(()=>{for(const w of wss.clients){if(!w.alive){w.terminate();continue}w.alive=false;w.ping()}},25000);
server.listen(PORT,()=>console.log('Server on '+PORT));
