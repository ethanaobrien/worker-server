importScripts('mime.js?bypass=1');
importScripts('utils.js?bypass=1');
importScripts('handleRequest.js?bypass=1');

/*
Todo
Load zip from url support
Import from github?
Export zip
*/

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
                '/favicon.ico?bypass=1'
            ]);
        })()
    );
    self.skipWaiting();
});
