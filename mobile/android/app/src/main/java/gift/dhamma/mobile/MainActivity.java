package gift.dhamma.mobile;

import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        handleIntent(getIntent());
    }

    @Override
    public void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleIntent(intent);
    }

    // Turns the two ways this activity can be launched with extra data — a shared-text Intent
    // (Web Share Target equivalent, see AndroidManifest.xml's ACTION_SEND filter) or a static App
    // Shortcut's "route" extra (res/xml/shortcuts.xml) — into a URL the WebView loads. Neither is
    // wired up automatically here the way it would be for a Trusted Web Activity reading the
    // site's web manifest; this is the Capacitor equivalent.
    //
    // https://localhost is Capacitor's default local-server origin (capacitor.config.json sets no
    // custom server.hostname/androidScheme) — hardcoded rather than derived because the bridge/
    // webview isn't guaranteed to have already loaded a URL to read the origin back from,
    // especially on the very first onCreate call.
    //
    // Shortcut routes CANNOT be loaded directly (loadUrl("https://localhost/toc/...")) — the
    // static asset server behind that origin has no file at that path (only index.html at root;
    // same reason a raw browser reload of a pushState'd URL 404s, see build-assets.js/app.js
    // comments) — only the SPA's OWN client-side router can turn that path into the TOC view,
    // and it only runs once index.html has actually loaded at "/". So a shortcut route is passed
    // as a query param on the root URL instead; app.js's very first lines (before anything else
    // executes) rewrite the visible location via history.replaceState() to the real target path
    // BEFORE the page's own bootstrap script reads window.location — same trick the SPA already
    // uses everywhere for pushState navigation, just kicked off natively instead of by a click.
    // The shared-text case needs no such rewrite: "/?q=..." on the root IS the real, correct
    // request — initSearchApp() already reads a "q" query param on the home path directly.
    private void handleIntent(Intent intent) {
        if (intent == null) return;
        String url = null;
        if (Intent.ACTION_SEND.equals(intent.getAction()) && "text/plain".equals(intent.getType())) {
            String sharedText = intent.getStringExtra(Intent.EXTRA_TEXT);
            if (sharedText != null && !sharedText.isEmpty()) {
                url = "https://localhost/?q=" + Uri.encode(sharedText);
            }
        } else {
            String route = intent.getStringExtra("route");
            if (route != null) {
                url = "https://localhost/?_nativeRoute=" + Uri.encode(route);
            } else if (intent.getStringExtra("openQuickModal") != null) {
                // <extra> in shortcuts.xml always yields a String extra (no boolean type there),
                // so this is checked for presence, not parsed as a boolean.
                url = "https://localhost/?_openQuickModal=1";
            }
        }
        if (url == null) return;

        final String finalUrl = url;
        if (bridge != null && bridge.getWebView() != null) {
            bridge.getWebView().post(() -> bridge.getWebView().loadUrl(finalUrl));
        }
    }
}
