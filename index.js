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
        rewriteRegex: document.getElementById('rewriteRegex').value || '.*\\.[\d\\w]+$',
        renderMarkdown: isChecked('renderMarkdown') || false
    })
}

async function submitPressed(files, zip, deleteExisting, baseFolder) {
    if (!files && arguments[0]) files = arguments[0];
    if (window.processing || !files) return;
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
    if (typeof navigator.storage.estimate != 'function') {
        document.getElementById('size').innerText = 'Cannot detect storage used';
    } else if (document.getElementById('size')) {
        const usage = humanFileSize((await navigator.storage.estimate()).usageDetails);
        if (!usage || !usage.indexedDB) {
            document.getElementById('size').innerText = 'Cannot detect storage used';
            return;
        }
        const size = usage.indexedDB;
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

function fetchZip(zip, adhs, disp, check4UnAuth) {
    const msg = document.getElementById('message');
    return new Promise(function(resolve, reject) {
        var xhr = new XMLHttpRequest();
        if (!adhs) adhs = {};
        xhr.responseType = "arraybuffer";
        xhr.onload = async function(e) {
            var status = xhr.status;
            var location = xhr.getResponseHeader("location");
            if (status === 0 || (status >= 200 && status < 300)) {
                resolve(xhr.response)
            } else if ([301, 302, 307].includes(status) && location) {
                resolve(await fetchZip(location, adhs, disp, check4UnAuth));
            } else if (check4UnAuth && status === 403 && xhr.getResponseHeader("content-type").includes('json')) {
                var a = JSON.parse(new TextDecoder().decode(xhr.response));
                reject(a);
            } else {
                reject({status, body:xhr.response});
            }
        }
        xhr.open("GET", zip);
        for (var k in adhs) {
            xhr.setRequestHeader(k, adhs[k]);
        }
        xhr.onerror = function(e) {
            reject();
        }
        xhr.onprogress = function(e) {
            if (disp !== false) {
                msg.innerHTML = 'Downloading zip '+humanFileSize(e.loaded);
            }
        }
        xhr.send();
    })
}

window.addEventListener('DOMContentLoaded', async function() {
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
