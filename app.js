'use strict';
const GATEWAY_URL='wss://radiocarousel-irc-gateway-test.randysipsma.workers.dev/';
const CHANNEL='#radiocarousel';
const $=id=>document.getElementById(id);
const validNick=/^[A-Za-z\[\]\\`_^{|}][A-Za-z0-9\[\]\\`_^{|}-]{0,23}$/;
let socket=null,connected=false,desiredNick='',attempt=0,retryTimer=null,session=0,manualStop=false;
function status(value){$('status').textContent=value}
function append(sender,body){const p=document.createElement('p'),b=document.createElement('strong');b.textContent=sender+': ';p.append(b,document.createTextNode(body));$('messages').append(p);$('messages').scrollTop=$('messages').scrollHeight}
function enable(v){connected=v;$('message').disabled=!v;$('sendbtn').disabled=!v}
function clearRetry(){if(retryTimer!==null){clearTimeout(retryTimer);retryTimer=null}}
function reconnect(){if(manualStop||!desiredNick||retryTimer!==null)return;const wait=Math.min(30000,1000*Math.pow(2,Math.min(attempt++,5)));status('Verbinding verbroken – opnieuw verbinden…');retryTimer=setTimeout(()=>{retryTimer=null;connect()},wait)}
function connect(){
 if(!desiredNick)return;
 clearRetry();
 const id=++session;
 if(socket){const old=socket;socket=null;old.onclose=null;old.onerror=null;old.onmessage=null;old.close()}
 enable(false);
 status(attempt?'Opnieuw verbinden…':'Verbinden…');
 try{
  const ws=new WebSocket(GATEWAY_URL);socket=ws;
  ws.onopen=()=>{if(id===session)ws.send(JSON.stringify({type:'join',nick:desiredNick,channel:CHANNEL}))};
  ws.onmessage=e=>{
   if(id!==session)return;
   let msg;try{msg=JSON.parse(e.data)}catch{return}
   if(msg.type==='ready'){attempt=0;enable(true);status('Verbonden');try{localStorage.setItem('radiocarousel-nick',desiredNick)}catch{}}
   else if(msg.type==='message'&&typeof msg.text==='string')append(String(msg.nick||'Gebruiker'),msg.text);
   else if(msg.type==='users'&&Array.isArray(msg.users))$('users').textContent=msg.users.join(', ')||'Geen gebruikers gevonden';
   else if(msg.type==='error'){
    const message=String(msg.message||'Onbekende fout');append('Fout',message);status(message);
    if(/Nickname niet beschikbaar|Ongeldige nickname/i.test(message)){manualStop=true;clearRetry()}
   }
  };
  ws.onerror=()=>{if(id===session)status('Verbindingsfout')};
  ws.onclose=()=>{if(id!==session)return;socket=null;enable(false);$('users').textContent='Niet verbonden';if(!manualStop)reconnect()};
 }catch{reconnect()}
}
$('connect').addEventListener('click',()=>{
 const nick=$('nick').value.trim();
 if(!validNick.test(nick)){status('Kies een geldige IRC-nickname');return}
 manualStop=false;desiredNick=nick;attempt=0;connect();
});
$('send').addEventListener('submit',e=>{
 e.preventDefault();const text=$('message').value.trim();
 if(!connected||!text||!socket||socket.readyState!==WebSocket.OPEN)return;
 socket.send(JSON.stringify({type:'message',channel:CHANNEL,text}));$('message').value='';
});
try{const saved=localStorage.getItem('radiocarousel-nick');if(saved&&validNick.test(saved))$('nick').value=saved}catch{}
window.addEventListener('online',()=>{if(!connected&&desiredNick){clearRetry();connect()}});
