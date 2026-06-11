import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// index.html の <body> をそのまま読み込み、app.js を実際に動かして
// onclick から呼ばれる関数の公開や初期化処理（QRパネル）を検証する。
beforeAll(async () => {
    const html = fs.readFileSync(path.resolve(__dirname, '../index.html'), 'utf-8');
    const body = html.match(/<body>([\s\S]*?)<script type="module"/)[1];
    document.body.innerHTML = body;
    await import('../app.js');
});

describe('app.js', () => {
    it('exposes the functions used by inline onclick handlers on window', () => {
        const names = [
            'switchMode', 'saveKey', 'handleDragOver', 'handleDragLeave',
            'handleDrop', 'runFreeMode', 'runApiMode', 'shareToLine',
        ];
        for (const name of names) {
            expect(typeof window[name]).toBe('function');
        }
    });

    it('initializes the package QR panel without throwing', () => {
        expect(document.getElementById('pkgQrMount').innerHTML.trim().length).toBeGreaterThan(0);
    });

    it('switchMode toggles tabs, the API key panel and the run buttons', () => {
        window.switchMode('api');
        expect(document.getElementById('tab_api').classList.contains('active')).toBe(true);
        expect(document.getElementById('tab_free').classList.contains('active')).toBe(false);
        expect(document.getElementById('apiSection').classList.contains('visible')).toBe(true);
        expect(document.getElementById('runBtn_api').style.display).toBe('block');
        expect(document.getElementById('runBtn_free').style.display).toBe('none');

        window.switchMode('free');
        expect(document.getElementById('tab_free').classList.contains('active')).toBe(true);
        expect(document.getElementById('apiSection').classList.contains('visible')).toBe(false);
        expect(document.getElementById('runBtn_free').style.display).toBe('block');
        expect(document.getElementById('runBtn_api').style.display).toBe('none');
    });
});
