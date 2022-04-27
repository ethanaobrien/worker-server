const storeName = 'userSiteFiles';
function put(key, data) {
    return new Promise(function(resolve, reject) {
        var openRequest = indexedDB.open(storeName, 1);
        openRequest.onerror = function() { };
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
function resetDB(storeName) {
    return new Promise(function(resolve, reject) {
        var request = indexedDB.deleteDatabase(storeName);
        request.onerror = resolve;
        request.onsuccess = resolve;
    })
}

function getFileTree(paths) {
    function process(a) {
        for (var i=0; i<a.length; i++) {
            if (a[i].children.length > 0) {
                a[i].isFile = false;
                a[i].isDirectory = true;
                a[i].children = process(a[i].children);
                a[i].path = a[i].path.substring(0, a[i].path.length-a[i].path.split('/'+a[i].name+'/').pop().length);
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

async function putOpts() {
    await put('opts?', {
        index: document.getElementById('index').checked || false,
        noDotHtml: document.getElementById('noDotHtml').checked || false,
        put: document.getElementById('put').checked || false,
        overWrite: document.getElementById('overWrite').checked || false,
        delete: document.getElementById('delete').checked || false,
        spa: document.getElementById('spa').checked || false,
        noDirectoryListing: document.getElementById('noDirectoryListing').checked || false,
        rewriteTo: document.getElementById('rewriteTo').value || '/index.html'
    })
}

async function submitPressed(files, zip) {
    if (window.processing) return;
    window.processing = true;
    await putOpts();
    if (!files.length && !zip) {
        document.getElementById('message').innerHTML = 'files set!';
        window.processing = false;
        window.location.href = '/';
    };
    await resetDB('userSiteFiles');
    document.getElementById('message').innerHTML = 'Getting directory listing template';
    var htmlTemplate = await (await fetch('directory-listing-template.html?bypass=1', {redirect: "follow"})).text();
    await put('htmlTemplate?', htmlTemplate);
    if (files.length) {
        await processFiles(files, files[0].webkitRelativePath.split('/')[0]);
    } else if (zip) {
        document.getElementById('message').innerHTML = 'unpacking zip';
        var z = new JSZip();
        try {
            await z.loadAsync(zip);
        } catch(e) {
            document.getElementById('message').innerHTML = 'Could not parse zip';
        }
        var files = z.files;
        var filez = [];
        var i = 0;
        for (var k in files) i++;
        var j = 0;
        for (var k in files) {
            j++;
            if (files[k].dir) continue;
            document.getElementById('message').innerHTML = 'unpacking zip '+j+'/'+i;
            filez.push({
                webkitRelativePath: '/'+files[k].name,
                data: await files[k].async('ArrayBuffer')
            });
        }
        processFiles(filez, '');
    }
    document.getElementById('message').innerHTML = 'files set!';
    window.processing = false;
    window.location.href = '/';
}

async function processFiles(files, basePath) {
    var paths = await get('paths?', paths);
    if (!paths) paths = [];
    for (var i=0; i<files.length; i++) {
        document.getElementById('message').innerHTML = 'Processing files '+i+'/'+files.length;
        var path = files[i].webkitRelativePath.substring(basePath.length, files[i].webkitRelativePath.length);
        paths.push(path);
        var default_types = ['text/html',
                     'text/xml',
                     'text/plain',
                     "text/vnd.wap.wml",
                     "application/javascript",
                     "application/rss+xml"]
        var type = window.MIMETYPES[path.split('.').pop()];
        if (type && default_types.includes(type)) {
            type += '; charset=utf-8';
        }
        var data = {
            type: type || 'text/plain'
        }
        if (files[i].data) {
            data.data = files[i].data;
        } else {
            data.data = await (new Blob([files[i]])).arrayBuffer();
        }
        await put(path, data);
    }
    document.getElementById('message').innerHTML = 'Processing file tree';
    await put('fileTree?', getFileTree(paths));
    await put('paths?', paths);
    await putOpts();
}

function humanFileSize(bytes) {
    if (! bytes) {
        return '';
    }
    //from https://stackoverflow.com/questions/10420352/converting-file-size-in-bytes-to-human-readable-string/10420404
    const thresh = 1024;
    if (Math.abs(bytes) < thresh) {
      return bytes + ' B';
    }
    const units = ['KiB', 'MiB', 'GiB', 'TiB', 'PiB', 'EiB', 'ZiB', 'YiB'];
    let u = -1;
    const r = 10;
    do {
      bytes /= thresh;
      ++u;
    } while (Math.round(Math.abs(bytes) * r) / r >= thresh && u < units.length - 1);
    return bytes.toFixed(1) + ' ' + units[u];
}

async function setSize() {
    if (document.getElementById('size')) {
        var size = humanFileSize((await navigator.storage.estimate()).usageDetails.indexedDB);
        document.getElementById('size').innerText = 'Storage used: '+(size||0);
    }
}

function visibilityDependency(id1, id2) {
    id1 = document.getElementById(id1);
    id2 = document.getElementById(id2);
    id2.parentElement.style.display = id1.checked?"block":"none";
    id1.addEventListener('change', function() {
        id2.parentElement.style.display = id1.checked?"block":"none";
    })
}

window.addEventListener('DOMContentLoaded', async function() {
    var opts = await get('opts?');
    if (!opts) opts = {};
    for (var k in opts) {
        if (opts[k] && document.getElementById(k)) {
            document.getElementById(k).checked = true;
        }
    }
    await setSize();
    if (document.getElementById('clear')) {
        document.getElementById('clear').addEventListener('click', async function(e) {
            if (confirm('All site data will be cleared. Do you want to continue?')) {
                var db = await window.indexedDB.databases();
                for (var i=0; i<db.length; i++) {
                    await resetDB(db[i].name);
                }
                alert('cleared!');
                await setSize();
            }
        })
    }
})
