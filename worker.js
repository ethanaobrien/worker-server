importScripts('mime.js?bypass=1');
importScripts('utils.js?bypass=1');
importScripts('handleRequest.js?bypass=1');

addEventListener('message', function(e) {
    e.source.postMessage(e.data);
});

addEventListener("fetch", (e) => {
    e.respondWith(handleRequest(e));
});

addEventListener('install', function(e) {
    e.waitUntil(
        (async () => {
            var cache = await caches.open('files');
            return cache.addAll([
                '/index.html?bypass=1',
                '/directory-listing-template.html?bypass=1',
                '/handleRequest.js?bypass=1',
                '/index.js?bypass=1',
                '/mime.js?bypass=1',
                '/worker.js?bypass=1',
                '/jszip.js?bypass=1',
                '/codemirror.css?bypass=1',
                '/codemirror.min.js?bypass=1',
                '/editor.html?bypass=1'
            ]);
        })()
    );
    self.skipWaiting();
});
