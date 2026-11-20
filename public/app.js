'use strict';
const GATEWAY_URL='wss://radiocarousel-irc-gateway-test.randysipsma.workers.dev/';
const CHANNEL='#radiocarousel';
const $=id=>document.getElementById(id);
const validNick=/^[A-Za-z\[\]\\`_^{|}][A-Za-z0-9\[\]\\`_^{|}-]{0,23}$/;
let heartbeatTimer=null,lastPong=0;let socket=null,connected=false,desiredNick='',attempt=0,retryTimer=null,session=0,manualStop=false,accountMode=false,accountPassword=null;
function status(value){$('status').textContent=value;$('status').dataset.state=connected?'online':'offline';$('connection-info').textContent=value}
function append(sender,body){const p=document.createElement('p'),b=document.createElement('strong');b.textContent=sender+': ';p.append(b,document.createTextNode(body));$('messages').append(p);$('messages').scrollTop=$('messages').scrollHeight}
function enable(v){connected=v;$('login-panel').hidden=v;$('message').disabled=!v;$('sendbtn').disabled=!v;$('status').dataset.state=v?'online':'offline'}
function stopHeartbeat(){if(heartbeatTimer!==null){clearInterval(heartbeatTimer);heartbeatTimer=null}}
function startHeartbeat(){stopHeartbeat();lastPong=Date.now();heartbeatTimer=setInterval(()=>{if(document.hidden||!socket||socket.readyState!==WebSocket.OPEN)return;if(Date.now()-lastPong>65000){status('Verbinding controleren…');socket.close();return}socket.send(JSON.stringify({type:'ping'}))},25000)}
function clearRetry(){if(retryTimer!==null){clearTimeout(retryTimer);retryTimer=null}}
function reconnect(){if(manualStop||accountMode||!desiredNick||retryTimer!==null||!navigator.onLine)return;const wait=Math.min(30000,1000*Math.pow(2,Math.min(attempt++,5)));status('Verbinding verbroken – opnieuw verbinden…');retryTimer=setTimeout(()=>{retryTimer=null;connect()},wait)}
function connect(){
 if(!desiredNick)return;
 clearRetry();stopHeartbeat();
 const id=++session;
 if(socket){const old=socket;socket=null;old.onclose=null;old.onerror=null;old.onmessage=null;old.close()}
 enable(false);
 status(attempt?'Opnieuw verbinden…':'Verbinden…');
 try{
  const ws=new WebSocket(GATEWAY_URL);socket=ws;
  ws.onopen=()=>{if(id!==session)return;if(accountMode&&!accountPassword){status('Account opnieuw aanmelden vereist');manualStop=true;ws.close();return}ws.send(JSON.stringify(accountMode?{type:'account-login',nick:desiredNick,password:accountPassword,channel:CHANNEL}:{type:'join',nick:desiredNick,channel:CHANNEL}));if(accountMode){accountPassword=null;$('account-password').value=''}};
  ws.onmessage=e=>{
   if(id!==session)return;
   let msg;try{msg=JSON.parse(e.data)}catch{return}
   if(msg.type==='pong'){lastPong=Date.now();return}
   if(msg.type==='ready'){attempt=0;enable(true);startHeartbeat();status(accountMode?'Verbonden als geregistreerde gebruiker':'Verbonden');if(!accountMode)try{localStorage.setItem('radiocarousel-nick',desiredNick)}catch{}}
   else if(msg.type==='account-verified')status('Account geverifieerd – kanaal openen…');
   else if(msg.type==='message'&&typeof msg.text==='string')append(String(msg.nick||'Gebruiker'),msg.text);
   else if(msg.type==='users'&&Array.isArray(msg.users)){$('users').textContent=msg.users.join(', ')||'Geen gebruikers gevonden';$('user-count').textContent=String(msg.users.length)}
   else if(msg.type==='error'){
    const message=String(msg.message||'Onbekende fout');append('Fout',message);status(message);
    if(accountMode||/Nickname niet beschikbaar|Ongeldige nickname/i.test(message)){manualStop=true;clearRetry()}
   }
  };
  ws.onerror=()=>{if(id===session)status('Verbindingsfout')};
  ws.onclose=()=>{if(id!==session)return;socket=null;stopHeartbeat();enable(false);$('users').textContent='Niet verbonden';$('user-count').textContent='';if(accountMode){manualStop=true;status('Accountverbinding verbroken – meld je opnieuw aan')}else if(!manualStop)reconnect()};
 }catch{reconnect()}
}
$('connect').addEventListener('click',()=>{
 const nick=$('nick').value.trim();
 if(!validNick.test(nick)){status('Kies een geldige IRC-nickname');return}
 manualStop=false;accountMode=false;accountPassword=null;desiredNick=nick;attempt=0;connect();
});
$('send').addEventListener('submit',e=>{
 e.preventDefault();const text=$('message').value.trim();
 if(!connected||!text||!socket||socket.readyState!==WebSocket.OPEN)return;
 socket.send(JSON.stringify({type:'message',channel:CHANNEL,text}));$('message').value='';
});
try{const saved=localStorage.getItem('radiocarousel-nick');if(saved&&validNick.test(saved))$('nick').value=saved}catch{}
window.addEventListener('online',()=>{if(!connected&&desiredNick&&!accountMode&&!manualStop){clearRetry();connect()}});
window.addEventListener('offline',()=>{stopHeartbeat();enable(false);status('Geen internetverbinding')});
document.addEventListener('visibilitychange',()=>{if(document.hidden)return;if(socket&&socket.readyState===WebSocket.OPEN&&connected){socket.send(JSON.stringify({type:'ping'}));lastPong=Date.now();startHeartbeat();return}if(desiredNick&&!accountMode&&!manualStop&&navigator.onLine){clearRetry();connect()}});
window.addEventListener('pageshow',()=>{if(!connected&&desiredNick&&!accountMode&&!manualStop&&navigator.onLine){clearRetry();connect()}});
$('reconnect-now').addEventListener('click',()=>{if(accountMode){status('Vul je wachtwoord opnieuw in en kies Inloggen met account');setLoginMode('account');return}if(!desiredNick){status('Kies eerst een nickname');return}manualStop=false;attempt=0;connect()});

$('account-connect').addEventListener('click',()=>{
 const nick=$('account-nick').value.trim(),password=$('account-password').value;
 if(!validNick.test(nick)){status('Kies een geldige geregistreerde nickname');return}
 if(!password||password.length>256||/[\r\n\0]/.test(password)){status('Voer een geldig wachtwoord in');return}
 manualStop=false;accountMode=true;accountPassword=password;desiredNick=nick;attempt=0;connect();
});

function setLoginMode(mode){
 const account=mode==='account';
 $('guest-fields').hidden=account;
 $('account-notice').hidden=!account;
 $('guest-mode').setAttribute('aria-pressed',String(!account));
 $('account-mode').setAttribute('aria-pressed',String(account));
 status(account?'Accountlogin geselecteerd':'Gastlogin geselecteerd');
}
$('guest-mode').addEventListener('click',()=>setLoginMode('guest'));
$('account-mode').addEventListener('click',()=>setLoginMode('account'));
setLoginMode('guest');
if(window.matchMedia('(max-width: 760px)').matches)$('users-details').open=false;

// Service worker enables future Web Push support; a push sender and subscriptions
// must be configured before notifications can arrive while the app is closed.
if('serviceWorker' in navigator){window.addEventListener('load',()=>{navigator.serviceWorker.register('./sw.js').catch(()=>{})})}
