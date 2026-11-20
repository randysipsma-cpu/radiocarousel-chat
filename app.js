'use strict';
// Set only after a verified secure IRC gateway is deployed. Never include passwords.
const GATEWAY_URL = 'wss://radiocarousel-irc-gateway-test.randysipsma.workers.dev/';
const CHANNEL = '#radiocarousel';
const $ = id => document.getElementById(id);
let socket = null;
let connected = false;
let session = 0;
let lastError = '';
function status(s){$('status').textContent=s}
function append(sender,body){const p=document.createElement('p');const b=document.createElement('strong');b.textContent=sender+': ';p.append(b,document.createTextNode(body));$('messages').append(p);$('messages').scrollTop=$('messages').scrollHeight}
function enable(v){connected=v;$('message').disabled=!v;$('sendbtn').disabled=!v}
$('connect').addEventListener('click',()=>{
 const nick=$('nick').value.trim();
 if(!/^[A-Za-z\[\]\\`_^{|}][A-Za-z0-9\[\]\\`_^{|}-]{0,23}$/.test(nick)){status('Kies een geldige IRC-nickname');return}
 if(!GATEWAY_URL){status('Gateway nog niet ingesteld');append('Systeem','De IRC-gateway moet eerst worden geconfigureerd en getest.');return}
 if(socket){socket.close();socket=null}
 enable(false);
 const thisSession = ++session;
 lastError = '';
 $('users').textContent = 'Gebruikers worden opgehaald…';
 status('Verbinden…');
 try {socket=new WebSocket(GATEWAY_URL);socket.onopen=()=>socket.send(JSON.stringify({type:'join',nick,channel:CHANNEL}));socket.onmessage=e=>{if(thisSession!==session)return;let msg;try{msg=JSON.parse(e.data)}catch{return}if(msg.type==='ready'){enable(true);status('Verbonden')}else if(msg.type==='message'&&typeof msg.text==='string'){append(String(msg.nick||'Gebruiker'),msg.text)}else if(msg.type==='users'&&Array.isArray(msg.users)){$('users').textContent=msg.users.join(', ')}else if(msg.type==='error'){lastError=String(msg.message||'Onbekende fout');status(lastError);append('Fout',lastError)}};socket.onclose=()=>{if(thisSession!==session)return;enable(false);status(lastError||'Verbinding verbroken');$('users').textContent='Niet verbonden'};socket.onerror=()=>{if(thisSession===session)status('Verbindingsfout')}}
 catch{status('Ongeldige gatewayconfiguratie')}
});
$('send').addEventListener('submit',e=>{e.preventDefault();const text=$('message').value.trim();if(!connected||!text||!socket||socket.readyState!==WebSocket.OPEN)return;socket.send(JSON.stringify({type:'message',channel:CHANNEL,text}));$('message').value=''});
