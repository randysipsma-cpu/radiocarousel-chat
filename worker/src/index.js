import { connect } from 'cloudflare:sockets';

const HOST = 'irc.chattersnet.nl';
const PORT = 6697;
const CHANNEL = '#radiocarousel';
const encoder = new TextEncoder();
const nickPattern = /^[A-Za-z\[\]\\`_^{|}][A-Za-z0-9\[\]\\`_^{|}-]{0,23}$/;

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const allowed = (env.ALLOWED_ORIGINS || '').split(',').map(x => x.trim()).filter(Boolean);
    if (!allowed.length || !allowed.includes(origin)) return new Response('Origin not allowed', { status: 403 });
    if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') return new Response('WebSocket required', { status: 426 });
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    server.accept();
    handle(server).catch(() => { try { server.close(1011, 'Gateway error'); } catch {} });
    return new Response(null, { status: 101, webSocket: client });
  }
};

async function handle(ws) {
  let tcp, writer, reader, closed = false, registered = false, joined = false, nick = '', lastSent = 0;
  let buffer = '';
  let accountPending = false;
  let pendingPassword = null;
  let accountVerified = false;
  let accountTimeout;
  const clearAccountTimeout = () => { if (accountTimeout) { clearTimeout(accountTimeout); accountTimeout = null; } };
  const joinChannel = async () => { if (!joined) await command('JOIN ' + CHANNEL); };
  const users = new Map();
  const key = name => name.toLowerCase();
  const publishUsers = () => send({ type: 'users', users: [...users.values()].sort((a,b)=>a.localeCompare(b)).slice(0,300) });
  let collectingNames = false;
  const send = obj => { try { ws.send(JSON.stringify(obj)); } catch {} };
  const command = async line => {
    if (!writer || closed) return;
    if (/[\r\n\0]/.test(line)) throw new Error('Invalid IRC command');
    await writer.write(encoder.encode(line + '\r\n'));
  };
  const cleanup = async () => {
    if (closed) return;
    closed = true;
    pendingPassword = null;
    clearAccountTimeout();
    try { await writer?.close(); } catch {}
    try { await reader?.cancel(); } catch {}
    try { tcp?.close(); } catch {}
    try { ws.close(1000, 'Disconnected'); } catch {}
  };
  ws.addEventListener('close', () => { void cleanup(); });
  ws.addEventListener('error', () => { void cleanup(); });
  ws.addEventListener('message', event => {
    void (async () => {
      if (typeof event.data !== 'string' || event.data.length > 2048) return;
      let msg;
      try { msg = JSON.parse(event.data); } catch { return; }
      if (msg.type === 'ping') { send({type:'pong'}); return; }
      if (!registered && (msg.type === 'join' || msg.type === 'account-login')) {
        if (msg.channel !== CHANNEL || typeof msg.nick !== 'string' || !nickPattern.test(msg.nick)) {
          send({ type: 'error', message: 'Ongeldige nickname of kanaal' }); return;
        }
        const accountMode = msg.type === 'account-login';
        const password = accountMode ? msg.password : null;
        if (accountMode && (typeof password !== 'string' || password.length < 1 || password.length > 256 || /[\r\n\0]/.test(password))) { send({ type: 'error', message: 'Ongeldige accountgegevens' }); return; }
        registered = true; nick = msg.nick; accountPending = accountMode;
        pendingPassword = password;
        try {
          tcp = connect({ hostname: HOST, port: PORT }, { secureTransport: 'on', allowHalfOpen: false });
          writer = tcp.writable.getWriter();
          reader = tcp.readable.getReader();
          await command('NICK ' + nick);
          await command('USER ' + nick + ' 0 * :RadioCarousel listener');

          void readIrc();
        } catch {
          send({ type: 'error', message: 'IRC-server niet bereikbaar' });
          await cleanup();
        }
      } else if (msg.type === 'message' && joined) {
        const text = typeof msg.text === 'string' ? msg.text.trim() : '';
        if (!text || text.length > 450 || /[\r\n\0]/.test(text)) return;
        const now = Date.now();
        if (now - lastSent < 1200) { send({ type: 'error', message: 'Wacht even voor je volgende bericht' }); return; }
        lastSent = now;
        await command('PRIVMSG ' + CHANNEL + ' :' + text);
        send({ type: 'message', nick, text });
      }
    })().catch(() => send({ type: 'error', message: 'Bericht kon niet worden verwerkt' }));
  });

  async function readIrc() {
    try {
      while (!closed) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += new TextDecoder().decode(value, { stream: true });
        if (buffer.length > 32768) throw new Error('IRC buffer overflow');
        let idx;
        while ((idx = buffer.indexOf('\n')) !== -1) {
          const line = buffer.slice(0, idx).replace(/\r$/, '');
          buffer = buffer.slice(idx + 1);
          if (line.startsWith('PING ')) { await command('PONG ' + line.slice(5)); continue; }
          const match = line.match(/^(?::(\S+) )?(\S+)(?: (.*))?$/);
          if (!match) continue;
          const [, prefix = '', code, rest = ''] = match;
          const sender = prefix.split('!')[0];
          if (code === '001') {
            if (accountPending) {
              await command('PRIVMSG NickServ :IDENTIFY ' + nick + ' ' + pendingPassword);
              pendingPassword = null;
              accountTimeout = setTimeout(() => { if (accountPending && !accountVerified) { send({ type: 'error', message: 'Accountcontrole verlopen; probeer opnieuw' }); void cleanup(); } }, 15000);
            } else await joinChannel();
          }
          if (accountPending && (code === '900' || (code === 'NOTICE' && sender.toLowerCase() === 'nickserv' && /identified|recognized|geïdentificeerd|herkend|successfully|logged in/i.test(rest)))) {
            accountPending = false; accountVerified = true; clearAccountTimeout(); send({ type: 'account-verified' }); await joinChannel();
          }
          if (accountPending && code === 'NOTICE' && sender.toLowerCase() === 'nickserv' && /invalid password|incorrect password|password incorrect|authentication failed|ongeldig wachtwoord|verkeerd wachtwoord/i.test(rest)) {
            accountPending = false; clearAccountTimeout(); send({ type: 'error', message: 'Accountlogin geweigerd door NickServ' }); await cleanup(); return;
          }
          if (code === '433' || code === '432') { send({ type: 'error', message: 'Nickname niet beschikbaar' }); await cleanup(); return; }
          if (code === 'JOIN' && sender.toLowerCase() === nick.toLowerCase()) {
            joined = true; send({ type: 'ready' }); await command('NAMES ' + CHANNEL);
          }
          if (code === '332') {
            const topic = rest.includes(' :') ? rest.split(' :').slice(1).join(' :') : '';
            if (topic) send({ type: 'topic', topic: topic.slice(0, 1000) });
          }
          if (code === 'TOPIC' && rest.toLowerCase().startsWith(CHANNEL.toLowerCase() + ' :')) {
            send({ type: 'topic', topic: rest.slice(CHANNEL.length + 2, CHANNEL.length + 1002) });
          }
          if (code === '331') send({ type: 'topic', topic: '' });
          if (code === '353') {
            if (!collectingNames) { users.clear(); collectingNames = true; }
            const names = rest.split(' :')[1];
            if (names) for (const raw of names.split(/\s+/)) {
              const name = raw.replace(/^[@+%&~]+/, '');
              if (name) users.set(key(name), name);
            }
          }
          if (code === '366') { collectingNames = false; publishUsers(); }
          if (code === 'JOIN' && sender && joined && key(sender) !== key(nick)) { users.set(key(sender), sender); publishUsers(); }
          if ((code === 'PART' || code === 'QUIT') && sender) { users.delete(key(sender)); publishUsers(); }
          if (code === 'KICK') {
            const kicked = rest.split(' ')[1];
            if (kicked) { users.delete(key(kicked)); publishUsers(); }
          }
          if (code === 'NICK' && sender) {
            const newNick = rest.replace(/^:/, '').split(' ')[0];
            if (newNick) {
              users.delete(key(sender)); users.set(key(newNick), newNick);
              if (key(sender) === key(nick)) nick = newNick;
              publishUsers();
            }
          }
          if (code === 'PRIVMSG') {
            const parts = rest.split(' :');
            if (parts[0]?.toLowerCase() === CHANNEL && parts.length > 1 && key(sender) !== key(nick)) send({ type: 'message', nick: sender, text: parts.slice(1).join(' :') });
          }
          if (['471','473','474','475','477','404'].includes(code)) send({ type: 'error', message: 'IRC-server weigert toegang of berichten voor dit kanaal (' + code + ')' });
        }
      }
    } catch { send({ type: 'error', message: 'IRC-verbinding verbroken' }); }
    await cleanup();
  }
}
