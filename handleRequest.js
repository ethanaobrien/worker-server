function notFound(method) {
    var data = '<p>Not Found</p><br><a href="/?bypass=1">Configure settings</a>';
    data = toArrayBuffer(data);
    if (method === 'head') data = '';
    return new Response(data, {
        headers: {
            'content-type': 'text/html; charset=utf-8',
            'content-length': data.byteLength
        },
        status: 404
    });
}

async function normalRequest(request) {
    try {
        var res = await fetch(request);
        if (!res.ok) throw new Error('not ok');
        return res;
    } catch(e) {
        var cache = await caches.open('files');
        var url = new URL(request.url);
        var path = decodeURIComponent(url.pathname);
        if (path === '/') path = '/index.html';
        var cache = await cache.match(path+'?bypass=1');
        if (cache) return cache;
        return notFound(request.method);
    }
}

function end(data, code) {
    if (typeof data == 'string') {
        data = toArrayBuffer(data);
    }
    return new Response(data, {
        headers: {
            'content-length': data.byteLength
        },
        status: code
    });
}

async function updateTree(path, remove) {
    var paths = await get('paths?');
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

async function handleRequest(e) {
    var url = new URL(e.request.url);
    var path = decodeURIComponent(url.pathname);
    var args = transformArgs(decodeURIComponent(e.request.url));
    if (['1', 'true'].includes(args.bypass)) {
        return await normalRequest(e.request);
    }
    var opts = await get('opts?');
    if (!opts) opts = {};
    if (opts.spa && !path.match(/.*\.[\d\w]+$/)) {
        path = opts.rewriteTo || '/index.html';
    }
    var method = e.request.method.toLowerCase();
    if (method === 'put' && opts.put) {
        if (!opts.overWrite) {
            var k = await get(path);
            if (k) {
                return end('', 400);
            }
        }
        var default_types = ['text/html',
                     'text/xml',
                     'text/plain',
                     "text/vnd.wap.wml",
                     "application/javascript",
                     "application/rss+xml"]
        var type = MIMETYPES[path.split('.').pop()];
        if (type && default_types.includes(type)) {
            type += '; charset=utf-8';
        }
        var data = {
            data: await e.request.arrayBuffer(),
            type: type || 'text/plain'
        }
        await updateTree(path);
        await put(path, data);
        return end('', 201);
    } else if (method === 'delete' && opts.delete) {
        var a = await get(path);
        if (!a) {
            return end('', 400);
        }
        await deleteF(path);
        await updateTree(path, true);
        return new Response('', {
            headers: {
                'content-length': 0
            },
            status: 200
        });
    } else if (method !== 'get' && method !== 'head') {
        var data = '<p>Method not supported (or disabled)</p><br><a href="/?bypass=1">Configure settings</a>';
        data = toArrayBuffer(data);
        return new Response(data, {
            headers: {
                'content-type': 'text/html; charset=utf-8',
                'content-length': data.byteLength
            },
            status: 405
        });
    }
    var res;
    if (opts.noDotHtml && !path.endsWith('/')) {
        var t = await get(path+'.html');
        if (t) res = t;
    }
    if (!res) {
        res = await get(path);
    }
    if (path.endsWith('/') && opts.index && !res) {
        var y = await get(path+'index.html');
        if (y) res = y;
    }
    if (!res) {
        var tree = await get('fileTree?');
        if (!tree) {
            return await normalRequest(e.request);
        }
        function process(a) {
            for (var i = 0; i < a.length; i++) {
                if (a[i].isDirectory) {
                    if (a[i].path === path) {
                        return a[i];
                    } else if (a[i].path === path + '/') {
                        return {resp: true, res: new Response('', {headers: {'location':path+'/','content-length':0}, status: 307})};
                    }
                    var b = process(a[i].children);
                    if (b) return b;
                }
            }
        }
        var cd = process(tree);
        if (!cd) {
            return notFound(method);
        } else if (cd.resp) {
            return cd.res;
        } else if (opts.noDirectoryListing) {
            return notFound(method);
        }
        var files = cd.children;
        files.sort(function(a, b) {
            var anl = a.name.toLowerCase();
            var bnl = b.name.toLowerCase();
            if (a.isDirectory && b.isDirectory) {
                return anl.localeCompare(bnl);
            } else if (a.isDirectory) {
                return -1;
            } else if (b.isDirectory) {
                return 1;
            } else {
                return anl.localeCompare(bnl);
            }
        })
        var htmlTemplate = await get('htmlTemplate?');
        var html;
        if (!htmlTemplate || ['1', 'true'].includes(args.static)) {
            html = ['<html>'];
            html.push('<style>li.directory {background:#aab}</style>');
            html.push('<a href="/?bypass=1">Change Settings</a><br>');
            if (path !== '/') {
                html.push('<a href="../?static=1">parent</a>');
            }
            html.push('<ul>');
            for (var i = 0; i<files.length; i++) {
                var name = files[i].name.htmlEscape();
                if (files[i].isDirectory) {
                    html.push('<li class="directory"><a href="'+name+'/?static=1">'+name+'</a></li>');
                } else {
                    html.push('<li><a href="'+name+'">'+name+'</a></li>');
                }
            }
            html.push('</ul></html>');
        } else {
            html = [htmlTemplate];
            html.push('<script>start("'+path+'")</script>');
            if (path !== '/') {
                html.push('<script>onHasParentDirectory();</script>')
            }
            for (var i=0; i<files.length; i++) {
                var rawname = files[i].name.replaceAll('\\', '\\\\').replaceAll('"', '\\"');
                var name = encodeURIComponent(rawname);
                var isDirectory = files[i].isDirectory;
                html.push('<script>addRow("'+rawname+'","'+name+'",'+isDirectory+',"","","","");</script>');
            }
        }
        var data = toArrayBuffer(html.join('\n'));
        if (method === 'head') data = '';
        return new Response(data, {
            headers: {
                'content-type': 'text/html; charset=utf-8',
                'content-length': data.byteLength
            },
            status: 200
        });
    }
    if (opts.noDotHtml && path.endsWith('.html')) {
        var newpath = path.substring(0, path.length-5)+url.search;
        return new Response('', {headers: {'location':newpath,'content-length':0}, status: 307});
    }
    var headers = {
        'content-type': res.type,
        'accept-ranges': 'bytes',
        'content-length': res.data.byteLength
    };
    var code = 200;
    var data = res.data;
    if (e.request.headers['range']) {
        var range = e.request.headers['range'].split('=')[1].trim();
        var rparts = range.split('-');
        var fileOffset = parseInt(rparts[0]);
        var l = data.byteLength;
        if (!rparts[1]) {
            var fileEndOffset = l - 1;
            headers['content-length'] = l - fileOffset;
            headers['content-range'] = 'bytes '+fileOffset+'-'+(l-1)+'/'+l;
            code = (fileOffset === 0) ? 200 : 206;
            data = data.slice(fileOffset, fileEndOffset);
        } else {
            var fileEndOffset = parseInt(rparts[1]);
            headers['content-length'] = fileEndOffset-fileOffset+1;
            headers['content-range'] = 'bytes '+fileOffset+'-'+fileEndOffset+'/'+l;
            code = 206;
            data = data.slice(fileOffset, fileEndOffset);
        }
    }
    if (method === 'head') data = '';
    return new Response(data, {
        headers: headers,
        status: code
    });
};
