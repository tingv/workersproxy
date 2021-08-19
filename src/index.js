// 上游网站的域名
const upstream = 'tv.emby.media'

// 上游网站的路径
const upstream_path = '/'

// 上游网站的移动端域名
const upstream_mobile = 'tv.emby.media'

// 禁止访问的国家地区
const blocked_region = ['US']

// 禁止使用服务的IP地址
const blocked_ip_address = ['0.0.0.0', '127.0.0.1']

// 是否开启上游网站的https
const https = true

// 是否关闭缓存
const disable_cache = false

// 替换验证代码
const find = 'var status=(response||{}).status;return console.log("getRegistrationInfo response: "+status),403===status?Promise.reject("overlimit"):status&&status<500?Promise.reject():function(err){if(console.log("getRegistrationInfo failed: "+err),regCacheValid)return console.log("getRegistrationInfo returning cached info"),Promise.resolve();throw err}(response)'
const replace = 'return appStorage.setItem(cacheKey,JSON.stringify({lastValidDate:Date.now(),deviceId:params.deviceId,cacheExpirationDays:999})),Promise.resolve()'

addEventListener('fetch', event => {
    event.respondWith(fetchAndApply(event.request));
})

async function fetchAndApply(request) {
    const region = request.headers.get('cf-ipcountry').toUpperCase();
    const ip_address = request.headers.get('cf-connecting-ip');
    const user_agent = request.headers.get('user-agent');

    let response = null;
    let url = new URL(request.url);
    let url_hostname = url.hostname;

    if (https == true) {
        url.protocol = 'https:';
    } else {
        url.protocol = 'http:';
    }

    if (await device_status(user_agent)) {
        var upstream_domain = upstream;
    } else {
        var upstream_domain = upstream_mobile;
    }

    url.host = upstream_domain;
    if (url.pathname == '/') {
        url.pathname = upstream_path;
    } else {
        url.pathname = upstream_path + url.pathname;
    }

    if (blocked_region.includes(region)) {
        response = new Response('拒绝访问: 你所在的地区尚不可用', {
            status: 403
        });
    } else if (blocked_ip_address.includes(ip_address)) {
        response = new Response('拒绝访问: 你的 IP 被禁止访问', {
            status: 403
        });
    } else {
        let method = request.method;
        let request_headers = request.headers;
        let new_request_headers = new Headers(request_headers);

        new_request_headers.set('Host', upstream_domain);
        new_request_headers.set('Referer', url.protocol + '//' + url_hostname);

        let original_response = await fetch(url.href, {
            method: method,
            headers: new_request_headers
        })

        connection_upgrade = new_request_headers.get("Upgrade");
        if (connection_upgrade && connection_upgrade.toLowerCase() == "websocket") {
            return original_response;
        }

        let original_response_clone = original_response.clone();
        let original_text = null;
        let response_headers = original_response.headers;
        let new_response_headers = new Headers(response_headers);
        let status = original_response.status;
		
		if (disable_cache) {
			new_response_headers.set('Cache-Control', 'no-store');
	    }

        new_response_headers.set('access-control-allow-origin', '*');
        new_response_headers.set('access-control-allow-credentials', true);
        new_response_headers.delete('content-security-policy');
        new_response_headers.delete('content-security-policy-report-only');
        new_response_headers.delete('clear-site-data');
		
		if (new_response_headers.get("x-pjax-url")) {
            new_response_headers.set("x-pjax-url", response_headers.get("x-pjax-url").replace("//" + upstream_domain, "//" + url_hostname));
        }
		
        const content_type = new_response_headers.get('content-type');
        if (url.href.indexOf("/modules/emby-apiclient/connectionmanager.js") != -1 && content_type != null && content_type.includes('application/javascript')) {
            original_text = await replace_response_text(original_response_clone);
        } else {
            original_text = original_response_clone.body
        }
		
        response = new Response(original_text, {
            status,
            headers: new_response_headers
        })
    }
    return response;
}

async function replace_response_text(response) {
    let text = await response.text()
    text = text.replace(find, replace)
    return text;
}

async function device_status(user_agent_info) {
    var agents = ["Android", "iPhone", "SymbianOS", "Windows Phone", "iPad", "iPod"];
    var flag = true;
    for (var v = 0; v < agents.length; v++) {
        if (user_agent_info.indexOf(agents[v]) > 0) {
            flag = false;
            break;
        }
    }
    return flag;
}
