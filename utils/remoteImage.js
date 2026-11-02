import { lookup } from 'node:dns/promises';
import { BlockList, isIP } from 'node:net';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';

export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const blocked = new BlockList();
for (const [network, prefix] of [
    ['0.0.0.0',8], ['10.0.0.0',8], ['100.64.0.0',10], ['127.0.0.0',8],
    ['169.254.0.0',16], ['172.16.0.0',12], ['192.0.0.0',24], ['192.0.2.0',24],
    ['192.88.99.0',24], ['192.168.0.0',16], ['198.18.0.0',15],
    ['198.51.100.0',24], ['203.0.113.0',24], ['224.0.0.0',4], ['240.0.0.0',4],
]) blocked.addSubnet(network, prefix, 'ipv4');
const globalV6 = new BlockList();
globalV6.addSubnet('2000::', 3, 'ipv6');
for (const [network, prefix] of [['2001::',23], ['2001:db8::',32], ['2002::',16], ['3fff::',20]]) {
    blocked.addSubnet(network, prefix, 'ipv6');
}

export function isPublicImageAddress(address) {
    const family = isIP(address);
    return family === 4 ? !blocked.check(address, 'ipv4')
        : family === 6 && globalV6.check(address, 'ipv6') && !blocked.check(address, 'ipv6');
}

export function isSafeImageUrl(value) {
    try {
        const url = new URL(value);
        if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return false;
        const hostname = url.hostname.toLowerCase().replace(/\.$/, '');
        if (!hostname || hostname === 'localhost' || /\.(?:localhost|local|internal)$/.test(hostname)
            || hostname === 'metadata.google.internal') return false;
        const ip = hostname.replace(/^\[|\]$/g, '');
        return isIP(ip) ? isPublicImageAddress(ip) : true;
    } catch { return false; }
}

export async function resolveImageTarget(value, resolve = lookup) {
    if (!isSafeImageUrl(value)) throw new Error('Недопустимый или небезопасный URL изображения');
    const url = new URL(value);
    const hostname = url.hostname.replace(/^\[|\]$/g, '').replace(/\.$/, '');
    const records = isIP(hostname) ? [{ address: hostname, family: isIP(hostname) }]
        : await resolve(hostname, { all: true, verbatim: true });
    if (!records.length || records.some(record => !isPublicImageAddress(record.address))) {
        throw new Error('Адрес изображения ведёт в непубличную сеть');
    }
    return { url, records };
}

// Resolve once and pin the socket to the checked address. Re-resolving in the
// HTTP client after validation would allow a DNS rebinding attack.
export async function requestPublicImage(value, { resolve = lookup, request } = {}) {
    let current = value;
    const deadline = Date.now() + 10_000;
    for (let redirects = 0; redirects <= 5; redirects += 1) {
        let timeout;
        let target;
        try {
            target = await Promise.race([
                resolveImageTarget(current, resolve),
                new Promise((_, reject) => {
                    timeout = setTimeout(() => reject(new Error('Истекло время проверки адреса изображения')), Math.max(1, deadline - Date.now()));
                    timeout.unref();
                }),
            ]);
        } finally { clearTimeout(timeout); }
        const { url, records } = target;
        const remaining = deadline - Date.now();
        if (remaining <= 0) throw new Error('Истекло время загрузки изображения');
        const result = await new Promise((resolveResponse, reject) => {
            const req = (request || (url.protocol === 'https:' ? httpsRequest : httpRequest))(url, {
                agent: false,
                signal: AbortSignal.timeout(remaining),
                headers: { 'User-Agent': 'Verge-Discord-Bot/2.0' },
                lookup(_hostname, options, callback) {
                    const candidates = records.filter(record => !options.family || record.family === options.family);
                    if (!candidates.length) return callback(new Error('Нет проверенного адреса нужного типа'));
                    if (options.all) callback(null, candidates);
                    else callback(null, candidates[0].address, candidates[0].family);
                },
            }, response => {
                const status = response.statusCode || 0;
                const location = response.headers.location;
                if ([301,302,303,307,308].includes(status) && location) {
                    response.destroy();
                    try { resolveResponse({ redirect: new URL(location, url).href }); }
                    catch (error) { reject(error); }
                    return;
                }
                if (Number(response.headers['content-length']) > MAX_IMAGE_BYTES) {
                    response.destroy();
                    reject(new Error('Размер изображения превышает лимит 8 МБ'));
                    return;
                }
                const chunks = [];
                let length = 0;
                response.on('data', chunk => {
                    length += chunk.length;
                    if (length > MAX_IMAGE_BYTES) {
                        response.destroy();
                        req.destroy();
                        reject(new Error('Размер изображения превышает лимит 8 МБ'));
                    } else chunks.push(chunk);
                });
                response.once('error', reject);
                response.once('aborted', () => reject(new Error('Загрузка изображения прервана')));
                response.once('end', () => resolveResponse({
                    ok: status >= 200 && status < 300,
                    status, statusText: response.statusMessage || '',
                    headers: new Headers(Object.entries(response.headers).filter(([, v]) => typeof v === 'string')),
                    buffer: Buffer.concat(chunks),
                }));
            });
            req.once('error', reject);
            req.end();
        });
        if (!result.redirect) return result;
        current = result.redirect;
    }
    throw new Error('Слишком много перенаправлений изображения');
}
