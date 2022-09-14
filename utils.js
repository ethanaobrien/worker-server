if (!String.prototype.replaceAll) {
    String.prototype.replaceAll = function(a, b) {
        return this.split(a).join(b);
    }
}
function BlobFileAB() {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = function(e) {
            resolve(e.target.result);
        }
        reader.readAsArrayBuffer(this);
    })
}
if (!Blob.prototype.arrayBuffer) {
    Blob.prototype.arrayBuffer = BlobFileAB;
}
if (!File.prototype.arrayBuffer) {
    File.prototype.arrayBuffer = BlobFileAB;
}
String.prototype.htmlEscape = function() {
    return this.replaceAll(/&/g, "&amp;").replaceAll(/</g, "&lt;").replaceAll(/>/g, "&gt;").replaceAll(/"/g, "&quot;").replaceAll(/'/g, "&#039;");
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
function resetDB(storeName) {
    return new Promise(function(resolve, reject) {
        var request = indexedDB.deleteDatabase(storeName);
        request.onerror = resolve;
        request.onsuccess = resolve;
    })
}
function toArrayBuffer(data) {
    return new TextEncoder('utf-8').encode(data).buffer;
}
function fromArrayBuffer(data) {
    return new TextDecoder('utf-8').decode(data);
}
async function updateTree(path, remove, folder) {
    var paths = await get('paths?');
    if (!paths) paths = [];
    if (remove !== true) {
        if (paths.includes(path)) return;
        paths.push(path);
    } else {
        var index = paths.indexOf(path);
        if (index !== -1) {
        	paths.splice(index, 1);
        }
        for (var i=0; i<paths.length; i++) {
            if (paths[i].startsWith(path) && !paths[i].substring(path.length).includes(path) && paths[i] !== '/') {
                await deleteF(paths[i]);
                paths.splice(i, 1);
                i--;
            }
        }
    }
    if (paths.length > 0) {
        await put('fileTree?', getFileTree(paths));
        await put('paths?', paths);
    } else {
        await deleteF('fileTree?');
        await deleteF('paths?');
    }
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
            if (a[i].children.length > 0 || a[i].path.endsWith('/')) {
                a[i].isFile = false;
                a[i].isDirectory = true;
                var q = a[i].path.length-a[i].path.split('/'+a[i].name+'/');
                var v = a[i].path.split('/');
                var q = v.lastIndexOf(a[i].name);
                a[i].path = a[i].path.substring(0, a[i].path.length-v.slice(q+1).join('/').length);
                if (a[i].name === '' && a[i].path === '/') {
                    a[i].path = '/';
                    a[i].name = '/';
                } else if (a[i].name === '') {
                    a.splice(a[i], 1);
                    i--;
                    continue;
                }
                if (!a[i].path.endsWith('/')) {
                    a[i].path += '/';
                }
                a[i].children = process(a[i].children);
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
    for (let i=0; i<paths.length; i++) {
        if (!paths[i].startsWith('/')) {
            paths[i] = '/'+paths[i];
        }
    }
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
