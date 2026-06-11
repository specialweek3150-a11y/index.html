// ===== 純粋ロジック（DOM・通信に依存しない） =====
// app.js から import して使用する。テストもこのファイルを直接対象にする。

// ===== 番号見出しによる自動分割 =====
// 全角・半角数字＋区切り文字（1. 1） 1、１．など）でセクションを検出する
export const SECTION_PATTERNS = [
    { key: 'outing',  nums: ['1','１'], keywords: ['外出'] },
    { key: 'health',  nums: ['2','２'], keywords: ['体調'] },
    { key: 'room',    nums: ['3','３'], keywords: ['居室'] },
    { key: 'bath',    nums: ['4','４'], keywords: ['入浴'] },
    { key: 'new',     nums: ['5','５'], keywords: ['新入所','新規入所'] },
    { key: 'ongoing', nums: ['6','６'], keywords: ['継続'] },
    { key: 'other',   nums: ['7','７'], keywords: ['その他'] },
];

export function detectSectionHeader(line) {
    const t = line.trim();
    for (const sec of SECTION_PATTERNS) {
        for (const num of sec.nums) {
            // 「1.」「1．」「1）」「1、」「1 」で始まる行
            if (new RegExp(`^${num}[.．）、\\s]`).test(t)) return sec.key;
        }
        // キーワードマッチ（見出し行らしい短い行のみ）
        if (t.length < 30 && sec.keywords.some(kw => t.includes(kw))) return sec.key;
    }
    return null;
}

export function splitByHeaders(text) {
    const lines = text.split('\n');
    const result = { outing:'', health:'', room:'', bath:'', new:'', ongoing:'', other:'' };
    let currentKey = null;
    const buffer = {};

    // 各行をセクションに振り分け
    for (const line of lines) {
        const detected = detectSectionHeader(line);
        if (detected) {
            currentKey = detected;
            if (!buffer[currentKey]) buffer[currentKey] = [];
        } else if (currentKey) {
            buffer[currentKey] = buffer[currentKey] || [];
            buffer[currentKey].push(line);
        }
    }

    // バッファをresultへ変換（空白行を除いた本文のみ）
    for (const [key, lines] of Object.entries(buffer)) {
        result[key] = lines.join('\n').replace(/^\n+|\n+$/g, '').trim();
    }
    return result;
}

// ===== MyMemory翻訳のチャンク分割（500文字/リクエスト制限に対応） =====
export function chunkText(text, limit) {
    const lines = text.split('\n');
    const chunks = [];
    let cur = '';
    for (const line of lines) {
        const next = cur ? cur + '\n' + line : line;
        if (next.length > limit && cur) { chunks.push(cur.trim()); cur = line; }
        else cur = next;
    }
    if (cur.trim()) chunks.push(cur.trim());
    return chunks;
}

// ===== パッケージQRパネル用ユーティリティ =====
export function blockedReason(url) {
    if (!url) return 'URLがありません。';
    if (/^file:/i.test(url)) return 'PC内ファイルとして開かれています。Pythonサーバー（python -m http.server 8000）で起動するとQRが生成されます。';
    if (/^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])/i.test(url)) return 'localhost はスマホから直接開けません。LAN内IPアドレス（例: 192.168.x.x:8000）を使ってください。';
    return '';
}

export function buildQrUrl(url) {
    return 'https://api.qrserver.com/v1/create-qr-code/?' +
        new URLSearchParams({ size:'600x600', margin:'48', ecc:'H', color:'000000', bgcolor:'FFFFFF', data: url }).toString();
}
