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
  const send = obj => { try { ws.send(JSON.stringify(obj)); } catch {} };
  const command = async line => {
    if (!writer || closed) return;
    if (/[\r\n\0]/.test(line)) throw new Error('Invalid IRC command');
    await writer.write(encoder.encode(line + '\r\n'));
  };
  const cleanup = async () => {
    if (closed) return;
    closed = true;
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
      if (!registered && msg.type === 'join') {
        if (msg.channel !== CHANNEL || typeof msg.nick !== 'string' || !nickPattern.test(msg.nick)) {
          send({ type: 'error', message: 'Ongeldige nickname of kanaal' }); return;
        }
        registered = true; nick = msg.nick;
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
          if (code === '001') await command('JOIN ' + CHANNEL);
          if (code === '433' || code === '432') { send({ type: 'error', message: 'Nickname niet beschikbaar' }); await cleanup(); return; }
          if (code === 'JOIN' && sender.toLowerCase() === nick.toLowerCase()) {
            joined = true; send({ type: 'ready' }); await command('NAMES ' + CHANNEL);
          }
          if (code === '353') {
            const names = rest.split(' :')[1];
            if (names) send({ type: 'users', users: names.split(/\s+/).map(x => x.replace(/^[@+%&~]/, '')).filter(Boolean).slice(0, 300) });
          }
          if (code === 'PRIVMSG') {
            const parts = rest.split(' :');
            if (parts[0]?.toLowerCase() === CHANNEL && parts.length > 1) send({ type: 'message', nick: sender, text: parts.slice(1).join(' :') });
          }
          if (['471','473','474','475','477','404'].includes(code)) send({ type: 'error', message: 'IRC-server weigert toegang of berichten voor dit kanaal (' + code + ')' });
        }
      }
    } catch { send({ type: 'error', message: 'IRC-verbinding verbroken' }); }
    await cleanup();
  }
}
