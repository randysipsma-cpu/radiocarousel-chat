# IRC gateway test (not deployed)

Cloudflare Worker prototype using WebSocketPair and Cloudflare outbound TCP sockets with TLS to irc.chattersnet.nl:6697. Each WebSocket opens one IRC connection and joins #radiocarousel. The gateway is intentionally blocked until ALLOWED_ORIGINS is set to the exact preview origin. Do not deploy publicly until ChattersNet permits this access and end-to-end testing passes.

Deployment prerequisites:
1. Deploy worker from this directory using Wrangler (or Cloudflare dashboard).
2. Set ALLOWED_ORIGINS to the exact HTTPS origin of the test frontend.
3. Set GATEWAY_URL in app.js to the deployed wss://... Worker URL, on develop only.
4. Verify IRC welcome, JOIN, NAMES, PING/PONG, inbound/outbound messages, nick collision, disconnect, flood controls.
5. Configure stricter anti-abuse measures and service limits before public launch. In-memory rate limits are per connection only; distributed abuse protection is not yet implemented.

The Cloudflare deployment has not been executed. No production branch changes were made.
