'use strict';
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
self.addEventListener('push',event=>{
  if(!event.data)return;
  let payload;try{payload=event.data.json()}catch{return}
  if(!payload||payload.type!=='chat-message'||typeof payload.title!=='string')return;
  event.waitUntil(self.registration.showNotification(payload.title.slice(0,100),{body:String(payload.body||'Nieuw chatbericht').slice(0,200),tag:'radiocarousel-chat',data:{url:'./'}}));
});
self.addEventListener('notificationclick',event=>{
  event.notification.close();
  event.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(async clients=>{for(const client of clients){if('focus' in client){await client.focus();return}}if(self.clients.openWindow)await self.clients.openWindow('./')}));
});
