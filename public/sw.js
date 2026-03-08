self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("message", (event) => {
  console.log("[Service Worker] メッセージ受信:", event.data);
  if (event.data.type === "SEND_NOTIFICATION") {
    const { title, body, icon, tag } = event.data.payload;
    console.log("[Service Worker] 通知を表示:", { title, body });
    self.registration.showNotification(title, {
      body: body,
      icon: icon || "/favicon.ico",
      badge: "/favicon.ico",
      tag: tag || `memo-notification-${Date.now()}`,
      renotify: true,
      requireInteraction: false,
    }).then(() => {
      console.log("[Service Worker] 通知表示成功");
    }).catch((error) => {
      console.error("[Service Worker] 通知表示エラー:", error);
    });
  }
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      if (clients.length > 0) {
        const client = clients[0];
        return client.focus();
      }
      return self.clients.openWindow("/home");
    })
  );
});
