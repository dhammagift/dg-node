// Resolves a "read on another site" link that may also be mirrored locally (siteroot/ or
// OFFLINE_MIRRORS_ROOT, see CLAUDE.md "Публикация от корня сайта") — prefers the local mirror
// when THIS server is actually serving it, falls back to the real internet address otherwise.
//
// Can't tell "local mirror is here" from the hostname: the packaged mobile app's WebView origin
// is also https://localhost, but it never bundles these heavy third-party mirrors (too big to
// ship, see CLAUDE.md) — so a link that assumed "localhost = mirror is here" 404ed inside the
// app (net::ERR_HTTP_RESPONSE_CODE_FAILURE) even though the exact same code works on a real dev
// box or on the live site where the mirror actually is mounted. A live HEAD check is the only
// thing that's true in both places.
window.resolveMirrorUrl = function (localUrl, onlineUrl) {
    if (!localUrl) return Promise.resolve(onlineUrl);
    if (!onlineUrl) onlineUrl = localUrl;
    var signal;
    try { signal = AbortSignal.timeout(2000); } catch (e) { signal = undefined; }
    return fetch(localUrl, { method: 'HEAD', cache: 'no-store', signal: signal })
        .then(function (res) { return res.ok ? localUrl : onlineUrl; })
        .catch(function () { return onlineUrl; });
};

// Opens a blank tab SYNCHRONOUSLY (before the async HEAD check) so browsers still treat it as a
// direct response to the click, not a popup, then routes it once resolveMirrorUrl() settles.
window.openMirrorLink = function (localUrl, onlineUrl) {
    var win = window.open('', '_blank');
    window.resolveMirrorUrl(localUrl, onlineUrl).then(function (url) {
        if (win && !win.closed) win.location = url; else window.open(url, '_blank');
    });
};

// Delegated click handler for <a class="mirror-link" href="{online}" data-local="{local}">
// — href alone still works with JS disabled (always goes online), data-local is the opt-in.
document.addEventListener('click', function (event) {
    var link = event.target.closest('a.mirror-link');
    if (!link || !link.dataset.local) return;
    event.preventDefault();
    window.openMirrorLink(link.dataset.local, link.href);
});
