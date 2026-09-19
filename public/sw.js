/* Club PWA Web Push worker. Opens the deep link on notification click. */

self.addEventListener("push", (event) => {
  let title = "Club";
  let body = "";
  let url = "/";
  try {
    const payload = event.data ? event.data.json() : {};
    if (payload && typeof payload === "object") {
      if (typeof payload.title === "string" && payload.title.trim()) {
        title = payload.title;
      }
      if (typeof payload.body === "string") {
        body = payload.body;
      }
      if (typeof payload.url === "string" && payload.url.trim()) {
        url = payload.url;
      }
    }
  } catch {
    const text = event.data ? event.data.text() : "";
    if (text) {
      body = text;
    }
  }

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      data: { url },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const raw = event.notification.data && event.notification.data.url;
  const target = typeof raw === "string" && raw.trim() ? raw : "/";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ("focus" in client) {
          if ("navigate" in client && target.startsWith("http")) {
            return client.navigate(target).then((next) => (next ? next.focus() : client.focus()));
          }
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(target);
      }
      return undefined;
    }),
  );
});
