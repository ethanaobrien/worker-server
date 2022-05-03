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

function isChecked(id) {
    var a = document.getElementById(id);
    if (!a) return false;
    return a.checked;
}

async function putOpts() {
    await put('opts?', {
        index: isChecked('index') || false,
        noDotHtml: isChecked('noDotHtml') || false,
        put: isChecked('put') || false,
        overWrite: isChecked('overWrite') || false,
        delete: isChecked('delete') || false,
        spa: isChecked('spa') || false,
        noDirectoryListing: isChecked('noDirectoryListing') || false,
        rewriteTo: document.getElementById('rewriteTo').value || '/index.html',
        rewriteRegex: document.getElementById('rewriteRegex').value || '.*\\.[\d\\w]+$'
    })
}

async function submitPressed(files, zip, deleteExisting, baseFolder) {
    if (window.processing) return;
    window.processing = true;
    await putOpts();
    if (!files.length && !zip) {
        document.getElementById('message').innerHTML = 'files set!';
        window.processing = false;
        window.location.href = '/';
        return;
    };
    if (deleteExisting !== true) await resetDB('userSiteFiles');
    document.getElementById('message').innerHTML = 'Getting directory listing template';
    var htmlTemplate = await (await fetch('directory-listing-template.html?bypass=1', {redirect: "follow"})).text();
    await put('htmlTemplate?', htmlTemplate);
    if (files.length) {
        await processFiles(files, files[0].webkitRelativePath.split('/')[0], baseFolder);
    }
    if (zip) {
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
        var start = '';
        for (var k in files) {
            if (j === 0 && files[k].name.includes('/')) {
                start = files[k].name.split('/')[0];
            }
            if (start && files[k].name.split('/')[0] !== start) {
                start = '';
            }
            j++;
            if (files[k].dir) continue;
            document.getElementById('message').innerHTML = 'unpacking zip '+j+'/'+i;
            filez.push({
                webkitRelativePath: '/'+files[k].name,
                data: await files[k].async('ArrayBuffer')
            });
        }
        if (start) start='/'+start;
        var a = !start;
        if (baseFolder && !start) start = zip.name||'Zip';
        await processFiles(filez, start, baseFolder, a);
    }
    await putOpts();
    document.getElementById('message').innerHTML = 'files set!';
    window.processing = false;
    window.location.href = '/';
}

async function processFiles(files, basePath, baseFolder, isZip) {
    var paths = await get('paths?');
    if (!paths) paths = [];
    for (var i=0; i<files.length; i++) {
        document.getElementById('message').innerHTML = 'Processing files '+i+'/'+files.length;
        var path
        if (!baseFolder && basePath) {
            path = files[i].webkitRelativePath.substring(basePath.length, files[i].webkitRelativePath.length);
        } else {
            path = '/'+files[i].webkitRelativePath;
            if (isZip) path = basePath+'/'+files[i].webkitRelativePath;
            path = ('/'+path).replaceAll('//', '/').replaceAll('//', '/');
        }
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
            type: type || ''
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
}

//javascript:(async function() {window.open(URL.createObjectURL(new Blob([JSON.stringify(await get('fileTree?'), null, 2)])))})();

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
    id2 = document.getElementById(id2).parentElement;
    id2.style.display = id1.checked?"block":"none";
    id1.addEventListener('change', function() {
        id2.style.display = id1.checked?"block":"none";
    })
}

function fetchZip(zip) {
    const msg = document.getElementById('message');
    return new Promise(function(resolve, reject) {
        var xhr = new XMLHttpRequest();
        xhr.responseType = "arraybuffer";
        xhr.onload = async function(e) {
            var status = xhr.status;
            var location = xhr.getResponseHeader("location");
            if (status === 0 || (status >= 200 && status < 300)) {
                resolve(xhr.response)
            } else if ([301, 302, 307].includes(status) && location) {
                resolve(await fetchZip(location));
            } else {
                reject({status, body:xhr.response});
            }
        }
        xhr.open("GET", zip);
        xhr.onerror = function(e) {
            reject();
        }
        xhr.onprogress = function(e) {
            msg.innerHTML = 'Downloading zip '+humanFileSize(e.loaded);
        }
        xhr.send();
    })
}

async function githubImport() {
    //find way around cors
    const msg = document.getElementById('message');
    var url = prompt('enter github repo url');
    if (!url) return;
    var parts = url.split('://').pop().split('/');
    var downloadLink = 'https://api.github.com/repos/'+parts[1]+'/'+parts[2]+'/zipball/main';
    try {
        var res = await fetchZip(downloadLink);
        await submitPressed([], res, isChecked('deleteExisting'), isChecked('baseFolder'));
    } catch(e) {
        return;
    }
}

window.addEventListener('DOMContentLoaded', async function() {
    if (document.getElementById('github')) {
        document.getElementById('github').addEventListener('click', githubImport);
    }
    var opts = await get('opts?');
    if (!opts) opts = {};
    for (var k in opts) {
        if (opts[k] && document.getElementById(k) && typeof opts[k] != 'string') {
            document.getElementById(k).checked = true;
        } else if (opts[k] && document.getElementById(k) && typeof opts[k] == 'string') {
            document.getElementById(k).value = opts[k];
        }
    }
    visibilityDependency('put', 'overWrite');
    visibilityDependency('spa', 'rewriteTo');
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
    if (document.getElementById('dlAllFiles')) {
        const message = document.getElementById('message');
        document.getElementById('dlAllFiles').addEventListener('click', async function() {
            if (window.processing) return;
            window.processing = true;
            message.innerHTML = 'starting...';
            var paths = await get('paths?');
            var zip = new JSZip();
            for (var i=0; i<paths.length; i++) {
                message.innerHTML = 'Zipping Files '+i+'/'+paths.length;
                zip.file(paths[i], (await get(paths[i])).data);
            }
            var blob = await zip.generateAsync({type: "blob"}, function(e) {
                message.innerHTML = "Zipping Files: "+e.percent.toFixed(2)+"%";
            });
            var a = document.createElement('a');
            a.download = 'site.zip';
            a.href = URL.createObjectURL(blob);
            a.click();
            message.innerHTML = "Zip downloaded";
            setTimeout(function() {
                URL.revokeObjectURL(a.href);
                message.innerHTML = "Service worker ready";
            }, 5000)
            window.processing = false;
        })
    }
    if (!(await get('htmlTemplate?'))) {
        var htmlTemplate = await (await fetch('directory-listing-template.html?bypass=1', {redirect: "follow"})).text();
        await put('htmlTemplate?', htmlTemplate);
    }
})

window.addEventListener('beforeunload', function(e) {
    if (window.processing) {
        e.preventDefault();
        return e.returnValue = "You may loose data if you exit now";
    }
})
