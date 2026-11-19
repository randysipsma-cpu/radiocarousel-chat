# RadioCarousel Chat architecture

Public mobile-first static PWA on Cloudflare Pages or GitHub Pages. Each user requires an independent IRC identity. Browser WebSocket JSON transport connects to a separately hosted secure gateway, which opens IRC over TLS to irc.chattersnet.nl:6697 and joins #radiocarousel. No live connection is implemented or claimed yet.

Gateway protocol: browser sends {type:'join',nick,channel} and {type:'message',channel,text}; gateway returns {type:'ready'}, {type:'message',nick,text}, {type:'users',users:[...]}, and {type:'error',message}. Implement IRC registration, PING/PONG, channel membership, nick collisions, rate limits, origin checks, session isolation, flood protection, TLS validation, and user-visible errors. Confirm third-party client policies with ChattersNet before public release. Never place credentials in the frontend.

Deployment: publish develop as a separate preview only. Production main must not be modified. GATEWAY_URL stays empty until a verified gateway exists.
