function notFound(method) {
    let data = '<p>Not Found</p><br><a href="/?bypass=1">Configure settings</a>';
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
        var res = await fetch(request, {redirect: 'follow'});
        if (!res.ok) throw new Error('not ok');
        if ((new URL(res.url)).hostname !== (new URL(request.url)).hostname) {
            res = null;
            throw new Error('not secure');
        }
        return res;
    } catch(e) {
        var cache = await caches.open('files');
        var url = new URL(request.url);
        var path = decodeURIComponent(url.pathname);
        if (path === '/') path = '/index.html';
        var cache = await cache.match(path+'?bypass=1');
        if (cache) return cache;
        if (res) return res;
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

async function handleRequest(e) {
    var url = new URL(e.request.url);
    var path = decodeURIComponent(url.pathname);
    var args = transformArgs(decodeURIComponent(e.request.url));
    if (['1', 'true'].includes(args.bypass)) {
        return await normalRequest(e.request);
    }
    var opts = await get('opts?');
    if (!opts) opts = {};
    var spa = false;
    if (opts.spa &&
        ((opts.rewriteRegex && !path.match(new RegExp(opts.rewriteRegex))) ||
        (!opts.rewriteRegex && !path.match(/.*\.[\d\w]+$/)))) {
        path = opts.rewriteTo || '/index.html';
        spa = true;
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
            type: type || ''
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
    if (opts.noDotHtml && !path.endsWith('/') && !spa) {
        var t = await get(path+'.html');
        if (t) res = t;
    }
    if (!res) {
        res = await get(path);
    }
    if (path.endsWith('/') && opts.index && !res && !spa) {
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
            const anl = a.name.toLowerCase();
            const bnl = b.name.toLowerCase();
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
        const htmlTemplate = await get('htmlTemplate?');
        let html;
        if (!htmlTemplate || ['1', 'true'].includes(args.static)) {
            html = ['<html>'];
            html.push('<style>li.directory {background:#aab}</style>');
            html.push('<a href="/?bypass=1">Change Settings</a><br>');
            if (path !== '/') {
                html.push('<a href="../?static=1">parent</a>');
            }
            html.push('<ul>');
            for (var i = 0; i<files.length; i++) {
                var name = files[i].name.htmlEscape().replaceAll('\\', '\\\\').replaceAll('"', '\\"');
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
    if (opts.noDotHtml && path.endsWith('.html') && !spa) {
        var newpath = path.substring(0, path.length-5)+url.search;
        return new Response('', {headers: {'location':newpath,'content-length':0}, status: 307});
    }
    if (opts.renderMarkdown && path.split('.').pop().toLowerCase() === 'md' && !['1', 'true'].includes((args.raw||'').toString())) {
        var data = '<script src="/showdown.min.js?bypass=1"></scr'+'ipt><div id="main"></div><script>!async function(){showdown.setFlavor("github");let t=new showdown.Converter({tables:true,simplifiedAutoLink:true,tasklists:true,openLinksInNewWindow:true}),a=await (await fetch(window.location.pathname+"?raw=1")).text(),e=t.makeHtml(a);document.getElementById("main").innerHTML=e}();</sc'+'ript>';
        data = toArrayBuffer(data);
        return new Response(data, {
            headers: {
                'content-type': 'text/html; charset=utf-8',
                'content-length': data.byteLength
            },
            status: 200
        });
    }
    let headers = {
        'accept-ranges': 'bytes',
        'content-length': res.data.byteLength
    };
    if (res.type) headers['content-type'] = res.type;
    let code = 200;
    var data = res.data;
    if (e.request.headers['range']) {
        let range = e.request.headers['range'].split('=')[1].trim();
        let rparts = range.split('-');
        let fileOffset = parseInt(rparts[0]);
        let l = data.byteLength;
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
