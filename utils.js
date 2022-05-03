String.prototype.htmlEscape = function() {
    return this.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}
const storeName = 'userSiteFiles';
function put(key, data) {
    return new Promise(function(resolve, reject) {
        var openRequest = indexedDB.open(storeName, 1);
        openRequest.onerror = function() {};
        openRequest.onsuccess = function() {
            var db = openRequest.result;
            var transaction = db.transaction([storeName], "readwrite");
            var objectStore = transaction.objectStore(storeName);
            var request = objectStore.put(data, key);
            request.onerror = function() {
                resolve();
                db.close();
            };
            request.onsuccess = function() {
                resolve();
                db.close();
            };
        };
        openRequest.onupgradeneeded = function() {
            var db = openRequest.result;
            if (!db.objectStoreNames.contains(storeName)) {
                db.createObjectStore(storeName);
            };
        };
    })
};
function get(key) {
    return new Promise(function(resolve, reject) {
        var openRequest = indexedDB.open(storeName, 1);
        openRequest.onerror = function() { };
        openRequest.onsuccess = function() {
            var db = openRequest.result;
            var transaction = db.transaction([storeName], "readwrite");
            var objectStore = transaction.objectStore(storeName);
            var request = objectStore.get(key);
            request.onsuccess = function(e) {
                resolve(request.result);
                db.close();
            };
            request.onerror = function() {
                resolve();
                db.close();
            };
        };
        openRequest.onupgradeneeded = function() {
            var db = openRequest.result;
            if (!db.objectStoreNames.contains(storeName)) {
                db.createObjectStore(storeName);
            };
        };
    });
};

function deleteF(key) {
    return new Promise(function(resolve, reject) {
        var openRequest = indexedDB.open(storeName, 1);
        openRequest.onerror = function() {};
        openRequest.onsuccess = function() {
            var db = openRequest.result;
            var transaction = db.transaction([storeName], "readwrite");
            var objectStore = transaction.objectStore(storeName);
            var request = objectStore.delete(key);
            request.onsuccess = function() {resolve()};
            request.onsuccess = function() {resolve()};
        };
        openRequest.onupgradeneeded = function() {
            var db = openRequest.result;
            if (! db.objectStoreNames.contains(storeName)) {
                db.createObjectStore(storeName);
            };
        };
    });
};
function toArrayBuffer(data) {
    return new TextEncoder('utf-8').encode(data).buffer;
}
async function updateTree(path, remove) {
    var paths = await get('paths?');
    if (!paths) paths = [];
    if (remove !== true) {
        if (paths.includes(path)) return;
        paths.push(path);
    } else {
        var index = paths.indexOf(path);
        if (index === -1) return;
        paths.splice(index, 1);
    }
    await put('fileTree?', getFileTree(paths));
    await put('paths?', paths);
}
function transformArgs(url) {
    var args = {};
    var idx = url.indexOf('?');
    if (idx != -1) {
        var s = url.slice(idx+1);
        var parts = s.split('&');
        for (var i=0; i<parts.length; i++) {
            var p = parts[i];
            var idx2 = p.indexOf('=');
            try {
                args[decodeURIComponent(p.slice(0,idx2))] = decodeURIComponent(p.slice(idx2+1,s.length));
            } catch(e) {}
        }
    }
    return args;
}

function getFileTree(paths) {
    function process(a) {
        for (var i=0; i<a.length; i++) {
            if (a[i].children.length > 0) {
                a[i].isFile = false;
                a[i].isDirectory = true;
                a[i].children = process(a[i].children);
                var q = a[i].path.length-a[i].path.split('/'+a[i].name+'/');
                var v = a[i].path.split('/');
                var q = v.lastIndexOf(a[i].name);
                a[i].path = a[i].path.substring(0, a[i].path.length-v.slice(q+1).join('/').length);
                if (a[i].name === '') {
                    a[i].path = '/';
                    a[i].name = '/';
                }
                if (!a[i].path.endsWith('/')) {
                    a[i].path += '/';
                }
            } else {
                a[i].isFile = true;
                a[i].isDirectory = false;
                delete a[i].children;
            }
        }
        return a;
    }
    var result = [];
    var level = {result};
    paths.forEach(path => {
        path.split('/').reduce((r, name, i, a) => {
            if(!r[name]) {
                r[name] = {result: []};
                r.result.push({name, children: r[name].result, path});
            }
            return r[name];
        }, level)
    })
    return process(result);
}
