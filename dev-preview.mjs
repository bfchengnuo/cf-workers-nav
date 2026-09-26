// 本地样式预览：从 workers.js 取出内嵌 HTML，用假数据跑真实前端逻辑。
// 用法：node dev-preview.mjs [--port 8787] [--data 导出的.json]
// 仅用于本地验证，不参与 Worker 部署，可随时删除。

import fs from 'node:fs';
import http from 'node:http';

const args = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = args.indexOf('--' + name);
  return i === -1 ? fallback : args[i + 1];
};
const port = Number(arg('port', 8787));

function extractHtml(workerFile) {
  const src = fs.readFileSync(workerFile, 'utf8');
  const open = 'const HTML_CONTENT = `';
  const start = src.indexOf(open);
  if (start === -1) throw new Error('未找到 HTML_CONTENT');
  const bodyStart = start + open.length;
  const bodyEnd = src.indexOf('\n`;', bodyStart);
  const simple = { '\\': '\\', '`': '`', '$': '$', n: '\n', t: '\t', r: '\r', b: '\b', f: '\f', v: '\v', "'": "'", '"': '"' };

  let out = '';
  for (let i = bodyStart; i < bodyEnd; i++) {
    if (src[i] !== '\\') { out += src[i]; continue; }
    const n = src[i + 1];
    if (n === 'u') {
      const braced = /^\{([0-9a-f]+)\}/i.exec(src.slice(i + 2));
      if (braced) { out += String.fromCodePoint(parseInt(braced[1], 16)); i += 2 + braced[0].length; continue; }
      const hex = /^[0-9a-f]{4}/i.exec(src.slice(i + 2));
      if (hex) { out += String.fromCharCode(parseInt(hex[0], 16)); i += 6; continue; }
    }
    if (n === 'x') {
      const hex = /^[0-9a-f]{2}/i.exec(src.slice(i + 2));
      if (hex) { out += String.fromCharCode(parseInt(hex[0], 16)); i += 4; continue; }
    }
    out += n in simple ? simple[n] : n;
    i += 1;
  }
  return out;
}

const html = extractHtml(new URL('./workers.js', import.meta.url).pathname)
  .replace('"__NAV_PUBLISHED_THEME__"', 'null');

function mockCategories() {
  const names = ['PVE', 'Portainer-US', 'Jellyfin', 'NAS 管理', '青龙', 'Alist', 'Grafana', 'Uptime Kuma', 'Home Assistant', 'qBittorrent',
    '一个特别特别长的网站名称用来验证单行省略'];
  const tips = ['局域网', '服务器', '容器面板', '监控看板', '', '也很长的描述文本用来验证这一行会不会把卡片撑高或者换行'];
  const links = Array.from({ length: 60 }, (_, i) => ({
    name: names[i % names.length] + (i >= names.length ? ' ' + (Math.floor(i / names.length) + 1) : ''),
    url: 'https://example' + i + '.com',
    tips: tips[i % tips.length],
    category: '',
  }));
  const categories = {};
  ['应用', '服务', '工具', '文档'].forEach((c, ci) => {
    categories[c] = { isHidden: false, links: links.slice(ci * 15, ci * 15 + 15).map(l => ({ ...l, category: c })) };
  });
  return { categories };
}

const dataFile = arg('data', '');
const payload = dataFile
  ? JSON.parse(fs.readFileSync(dataFile, 'utf8'))
  : mockCategories();
if (!payload.categories) throw new Error('--data 文件缺少 categories 字段');

const iconSvg = (seed) => {
  const hue = [...seed].reduce((a, c) => a + c.charCodeAt(0), 0) % 360;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 36 36"><rect width="36" height="36" rx="8" fill="hsl(${hue},45%,55%)"/></svg>`;
};

http.createServer((req, res) => {
  const path = new URL(req.url, 'http://x').pathname;
  const json = (body) => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); };

  if (path === '/api/getLinks') return json(payload);
  if (path === '/api/getTheme') return json({ ok: true, theme: null });
  if (path === '/api/icon') {
    const url = new URL(req.url, 'http://x').searchParams.get('url') || '';
    res.writeHead(200, { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'public, max-age=3600' });
    return res.end(iconSvg(url));
  }
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(html);
}).listen(port, () => {
  console.log(`预览: http://127.0.0.1:${port}  （${Object.keys(payload.categories).length} 个分类，改完 workers.js 重启即可）`);
});
