const { withAndroidManifest } = require("expo/config-plugins");
module.exports = (config) =>
  withAndroidManifest(config, (config) => {
    const app = config.modResults.manifest.application[0];
    const manifest = config.modResults.manifest;
    manifest.queries = manifest.queries ?? [];
    if (
      !manifest.queries.some((q) =>
        q.intent?.some((i) =>
          i.category?.some(
            (c) => c.$["android:name"] === "android.intent.category.LAUNCHER",
          ),
        ),
      )
    )
      manifest.queries.push({
        intent: [
          {
            action: [{ $: { "android:name": "android.intent.action.MAIN" } }],
            category: [
              { $: { "android:name": "android.intent.category.LAUNCHER" } },
            ],
          },
        ],
      });
    app.service = app.service ?? [];
    const name = "app.caxe.capture.CaxeNotificationListener";
    if (!app.service.some((s) => s.$["android:name"] === name))
      app.service.push({
        $: {
          "android:name": name,
          "android:label": "Captura de movimentações do Caxe",
          "android:permission":
            "android.permission.BIND_NOTIFICATION_LISTENER_SERVICE",
          "android:exported": "true",
        },
        "intent-filter": [
          {
            action: [
              {
                $: {
                  "android:name":
                    "android.service.notification.NotificationListenerService",
                },
              },
            ],
          },
        ],
      });
    return config;
  });
