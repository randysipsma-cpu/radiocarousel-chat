'use strict';
const GATEWAY_URL='wss://radiocarousel-irc-gateway-test.randysipsma.workers.dev/';
const CHANNEL='#radiocarousel';
const $=id=>document.getElementById(id);
const validNick=/^[A-Za-z\[\]\\`_^{|}][A-Za-z0-9\[\]\\`_^{|}-]{0,23}$/;
let heartbeatTimer=null,lastPong=0;let socket=null,connected=false,desiredNick='',attempt=0,retryTimer=null,session=0,manualStop=false,accountMode=false,accountPassword=null;
function status(value){$('status').textContent=value;$('status').dataset.state=connected?'online':'offline';$('connection-info').textContent=value}
const prefs={compact:false,timestamps:true,mentions:true};
try{Object.assign(prefs,JSON.parse(localStorage.getItem('rc-chat-prefs')||'{}'))}catch{}
function applyPrefs(){document.body.classList.toggle('compact-chat',!!prefs.compact);document.body.classList.toggle('hide-times',!prefs.timestamps);$('pref-compact').checked=!!prefs.compact;$('pref-time').checked=!!prefs.timestamps;$('pref-mentions').checked=!!prefs.mentions}
function savePrefs(){try{localStorage.setItem('rc-chat-prefs',JSON.stringify(prefs))}catch{}applyPrefs()}
function append(sender,body){
 const p=document.createElement('p'),heading=document.createElement('span'),name=document.createElement('button'),time=document.createElement('time'),content=document.createElement('span');
 p.className='chat-line';heading.className='chat-meta';name.type='button';name.className='chat-nick';name.textContent=sender;name.title='Vermeld '+sender;
 name.addEventListener('click',()=>{if(!connected)return;const input=$('message');input.value+=(input.value&&!input.value.endsWith(' ')?' ':'')+sender+': ';input.focus()});
 time.className='chat-time';const now=new Date();time.dateTime=now.toISOString();time.textContent=now.toLocaleTimeString('nl-NL',{hour:'2-digit',minute:'2-digit'});time.title='Ontvangsttijd op dit apparaat';
 heading.append(name,time);content.className='chat-text';content.textContent=body;p.append(heading,content);
 if(prefs.mentions&&desiredNick&&sender.toLowerCase()!==desiredNick.toLowerCase()&&body.toLowerCase().split(/[^a-z0-9_]+/i).includes(desiredNick.toLowerCase()))p.classList.add('mentioned');
 $('messages').append(p);while($('messages').children.length>250)$('messages').firstElementChild.remove();$('messages').scrollTop=$('messages').scrollHeight
}
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
   else if(msg.type==='topic'&&typeof msg.topic==='string'){currentChannelTopic=msg.topic;updateDjFromTopic()}
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

const settings=$('settings-dialog');
$('open-settings').addEventListener('click',()=>{applyPrefs();settings.showModal()});
$('close-settings').addEventListener('click',()=>settings.close());
settings.addEventListener('click',event=>{if(event.target===settings)settings.close()});
for(const [id,key] of [['pref-compact','compact'],['pref-time','timestamps'],['pref-mentions','mentions']])$(id).addEventListener('change',event=>{prefs[key]=event.target.checked;savePrefs()});
$('emoji-toggle').addEventListener('click',()=>{$('emoji-picker').hidden=!$('emoji-picker').hidden});
$('emoji-picker').addEventListener('click',event=>{const button=event.target.closest('button[data-emoji]');if(!button)return;const input=$('message');input.value+=button.dataset.emoji;input.focus();$('emoji-picker').hidden=true});
applyPrefs();

const radioAudio=$('radio-audio'),radioPlay=$('radio-play');
let currentChannelTopic='';
function updateDjFromTopic(){
 const sections=currentChannelTopic.split(/::|✥|❖|♦|♢/).map(part=>part.trim()).filter(Boolean);
 const section=sections.find(part=>/Huidige\s+DJ\s*:/i.test(part))||'';
 const match=section.match(/Huidige\s+DJ\s*:\s*(.+)/i);
 const dj=match?match[1].replace(/[\u2612\u2613\u2610\u2611\u2612\u2726\u2727\u25c7\u25c6\u2756\u2740\u2736\u2737\u2738\u2739\u273a\u273b\u273c\u273d\u273e\u273f\u2741\u2742\u2743\u2744\u2745\u2746\u2747\u2748\u2749\u274a\u274b\u274c\u274d\u274e\u274f\u2750\u2751\u2752\u2753\u2754\u2755\u2757\u2758\u2759\u275a\u275b\u275c\u275d\u275e\u275f\u2760\u2761\u2762\u2763\u2764\u2765\u2766\u2767\u2768\u2769\u276a\u276b\u276c\u276d\u276e\u276f\u2770\u2771\u2772\u2773\u2774\u2775\u2776\u2777\u2778\u2779\u277a\u277b\u277c\u277d\u277e\u277f\u2780\u2781\u2782\u2783\u2784\u2785\u2786\u2787\u2788\u2789\u278a\u278b\u278c\u278d\u278e\u278f\u2790\u2791\u2792\u2793\u2794\u2795\u2796\u2797\u2798\u2799\u279a\u279b\u279c\u279d\u279e\u279f\u27a0\u27a1\u27a2\u27a3\u27a4\u27a5\u27a6\u27a7\u27a8\u27a9\u27aa\u27ab\u27ac\u27ad\u27ae\u27af\u27b0\u27b1\u27b2\u27b3\u27b4\u27b5\u27b6\u27b7\u27b8\u27b9\u27ba\u27bb\u27bc\u27bd\u27be\u2612]/g,'').trim().slice(0,70):'';
 $('radio-dj').textContent=dj?'Huidige DJ: '+dj:radioConfig.dj?'DJ (handmatig): '+radioConfig.dj:'DJ niet beschikbaar';
}
let radioConfig={url:'https://cast.accessweb.be:3245/stream',metadataUrl:'https://cast.accessweb.be:3245/status-json.xsl',dj:''},radioRefresh=null;
try{const saved=JSON.parse(localStorage.getItem('rc-radio-config')||'{}');if(saved&&typeof saved==='object')radioConfig={url:String(saved.url||'https://cast.accessweb.be:3245/stream'),metadataUrl:String(saved.metadataUrl||'https://cast.accessweb.be:3245/status-json.xsl'),dj:String(saved.dj||'')}}catch{}
function validHttps(value){if(!value)return true;try{const u=new URL(value);return u.protocol==='https:'&&!!u.hostname&&!u.username&&!u.password}catch{return false}}
function setRadioState(value){$('radio-state').textContent=value}
function applyRadio(){
 $('radio-url').value=radioConfig.url;$('radio-metadata-url').value=radioConfig.metadataUrl;$('radio-dj-input').value=radioConfig.dj;
 updateDjFromTopic();
 radioPlay.disabled=!radioConfig.url;
 if(!radioConfig.url)setRadioState('Stel de stream in via ⚙️');
 else if(radioAudio.paused)setRadioState('Klaar om te luisteren');
}
$('radio-save').addEventListener('click',()=>{
 const url=$('radio-url').value.trim(),metadataUrl=$('radio-metadata-url').value.trim(),dj=$('radio-dj-input').value.trim();
 if(!validHttps(url)||!validHttps(metadataUrl)){setRadioState('Gebruik een geldige HTTPS-link');return}
 const changed=url!==radioConfig.url;
 radioConfig={url,metadataUrl,dj};try{localStorage.setItem('rc-radio-config',JSON.stringify(radioConfig))}catch{}
 if(changed){radioAudio.pause();radioAudio.removeAttribute('src');radioAudio.load();radioPlay.textContent='▶';$('radio-track').textContent='Nog geen nummerinformatie';lastCoverSong='';coverRequestId++;clearCover()}
 applyRadio();settings.close();void refreshRadioMetadata()
});
radioPlay.addEventListener('click',async()=>{
 if(!radioConfig.url)return;
 if(!radioAudio.paused){radioAudio.pause();return}
 if(radioAudio.getAttribute('src')!==radioConfig.url)radioAudio.src=radioConfig.url;
 setRadioState('Verbinden met radiostream…');
 try{await radioAudio.play()}catch{setRadioState('Afspelen mislukt — controleer de stream-URL')}
});
radioAudio.addEventListener('playing',()=>{radioPlay.textContent='❚❚';radioPlay.setAttribute('aria-label','Radio pauzeren');setRadioState('Radio speelt af')});
radioAudio.addEventListener('pause',()=>{radioPlay.textContent='▶';radioPlay.setAttribute('aria-label','Radio afspelen');if(radioConfig.url)setRadioState('Gepauzeerd')});
radioAudio.addEventListener('waiting',()=>setRadioState('Stream bufferen…'));
radioAudio.addEventListener('error',()=>setRadioState('Stream niet bereikbaar of niet ondersteund'));
let lastCoverSong='',coverRequestId=0;
function normalizeMusic(value){return String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim()}
function clearCover(){const art=$('radio-art');art.style.backgroundImage='';art.textContent='🎵';art.title='Geen bevestigde albumhoes beschikbaar'}
async function findAlbumCover(song){
 const id=++coverRequestId;clearCover();
 const parts=song.split(/\s+[-–—]\s+/);if(parts.length<2)return;
 const artist=parts.shift().trim(),title=parts.join(' - ').trim();
 if(!artist||!title)return;
 try{
  const endpoint=new URL('https://itunes.apple.com/search');endpoint.searchParams.set('term',artist+' '+title);endpoint.searchParams.set('entity','song');endpoint.searchParams.set('limit','15');endpoint.searchParams.set('country','nl');
  const response=await fetch(endpoint.toString(),{signal:AbortSignal.timeout(7000)});
  if(!response.ok)return;const data=await response.json();
  if(id!==coverRequestId)return;
  const match=(Array.isArray(data.results)?data.results:[]).find(item=>normalizeMusic(item.artistName)===normalizeMusic(artist)&&normalizeMusic(item.trackName)===normalizeMusic(title)&&typeof item.artworkUrl100==='string');
  if(!match)return;
  const url=match.artworkUrl100.replace(/\/100x100bb\./,'/300x300bb.');
  if(!validHttps(url))return;
  const img=new Image();img.onload=()=>{if(id!==coverRequestId)return;const art=$('radio-art');art.style.backgroundImage='url('+JSON.stringify(url)+')';art.textContent='';art.title='Albumhoes uit Apple Music-catalogus'};img.src=url;
 }catch{/* Geen betrouwbare match of netwerkfout: behoud standaardicoon */}
}
async function refreshRadioMetadata(){
 if(!radioConfig.metadataUrl||document.hidden)return;
 try{
  const response=await fetch(radioConfig.metadataUrl,{cache:'no-store',signal:AbortSignal.timeout(8000)});
  if(!response.ok)throw Error('HTTP');const data=await response.json();
  if(!data||typeof data!=='object')return;
  const source=Array.isArray(data.icestats?.source)?data.icestats.source.find(item=>String(item.listenurl||'').includes('/stream'))||data.icestats.source[0]:data.icestats?.source;const song=typeof source?.title==='string'?source.title:typeof source?.yp_currently_playing==='string'?source.yp_currently_playing:typeof data.song==='string'?data.song:typeof data.title==='string'?data.title:typeof data.now_playing?.song?.text==='string'?data.now_playing.song.text:'';
  const listenerValue=source?.listeners??data.icestats?.listeners??data.listeners;
  const listeners=listenerValue===undefined||listenerValue===null||listenerValue===''?NaN:Number(listenerValue);
  const rawBitrate=source?.bitrate??source?.ice_bitrate??data.icestats?.bitrate;
  const bitrate=typeof rawBitrate==='number'?rawBitrate:typeof rawBitrate==='string'&&/^\d+(?:\.\d+)?$/.test(rawBitrate.trim())?Number(rawBitrate):NaN;
  const listenerText=Number.isInteger(listeners)&&listeners>=0?'Luisteraars: '+listeners:'Luisteraars: —';
  const bitrateText=Number.isFinite(bitrate)&&bitrate>0?'Kwaliteit: '+bitrate+' kbps':'Kwaliteit: —';
  $('radio-stats').textContent=listenerText+' · '+bitrateText;
  if(song){$('radio-track').textContent=song.slice(0,180);if(song!==lastCoverSong){lastCoverSong=song;void findAlbumCover(song)}}
  const cover=typeof data.art==='string'?data.art:typeof data.cover==='string'?data.cover:typeof data.now_playing?.song?.art==='string'?data.now_playing.song.art:'';
  if(cover&&validHttps(cover))$('radio-art').style.backgroundImage='url('+JSON.stringify(cover)+')';
 }catch{$('radio-stats').textContent='Luisteraars: — · Kwaliteit: —';/* Metadata failure does not interrupt radio or chat */}
}
applyRadio();void refreshRadioMetadata();
radioRefresh=setInterval(()=>{if(!document.hidden)void refreshRadioMetadata()},30000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)void refreshRadioMetadata()});

// Service worker enables future Web Push support; a push sender and subscriptions
// must be configured before notifications can arrive while the app is closed.
if('serviceWorker' in navigator){window.addEventListener('load',()=>{navigator.serviceWorker.register('./sw.js').catch(()=>{})})}
