import { detectSectionHeader, splitByHeaders, chunkText, blockedReason, buildQrUrl } from './lib.js';

const STORAGE_KEY = 'myanmar_tool_api_key';

window.addEventListener('load', () => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) document.getElementById('apiKey').value = saved;
});

// ===== モード切替 =====
function switchMode(mode) {
    document.getElementById('tab_free').classList.toggle('active', mode === 'free');
    document.getElementById('tab_api').classList.toggle('active', mode === 'api');
    document.getElementById('apiSection').classList.toggle('visible', mode === 'api');
    document.getElementById('runBtn_free').style.display = mode === 'free' ? 'block' : 'none';
    document.getElementById('runBtn_api').style.display  = mode === 'api'  ? 'block' : 'none';
    hideError();
}

function saveKey() {
    const key = document.getElementById('apiKey').value.trim();
    if (!key.startsWith('sk-ant-')) { showError('APIキーは sk-ant- で始まる必要があります。'); return; }
    localStorage.setItem(STORAGE_KEY, key);
    alert('APIキーを保存しました。');
}

// ===== ドラッグ&ドロップ =====
function handleDragOver(e) { e.preventDefault(); e.currentTarget.classList.add('drag-over'); }
function handleDragLeave(e) { e.currentTarget.classList.remove('drag-over'); }
function handleDrop(e) {
    e.preventDefault();
    e.currentTarget.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (!file) return;
    const name = file.name.toLowerCase();
    if (name.endsWith('.xlsx') || name.endsWith('.xls')) readExcel(file);
    else if (name.endsWith('.csv')) readCsv(file);
    else showError('対応ファイル: .xlsx / .xls / .csv のみです。');
}
function readExcel(file) {
    const reader = new FileReader();
    reader.onload = e => {
        try {
            const wb = XLSX.read(e.target.result, { type: 'binary' });
            let text = '';
            wb.SheetNames.forEach(n => { text += XLSX.utils.sheet_to_csv(wb.Sheets[n]) + '\n'; });
            document.getElementById('inputText').value = text.trim();
        } catch (err) { showError('Excel読み込み失敗: ' + err.message); }
    };
    reader.readAsBinaryString(file);
}
function readCsv(file) {
    const reader = new FileReader();
    reader.onload = e => { document.getElementById('inputText').value = e.target.result.trim(); };
    reader.readAsText(file, 'UTF-8');
}

// ===== MyMemory翻訳（無料・500文字/リクエスト制限に対応） =====
async function myMemoryTranslate(text) {
    if (!text.trim()) return '';
    const LIMIT = 480;
    const chunks = chunkText(text, LIMIT);

    const parts = [];
    for (const chunk of chunks) {
        try {
            const res = await fetch(
                `https://api.mymemory.translated.net/get?q=${encodeURIComponent(chunk)}&langpair=ja|my`
            );
            const data = await res.json();
            parts.push(data.responseData?.translatedText || chunk);
        } catch { parts.push(chunk); }
    }
    return parts.join('\n');
}

// ===== APIなしモード 実行 =====
async function runFreeMode() {
    hideError();
    const text = document.getElementById('inputText').value.trim();
    if (!text) { showError('日報テキストを貼り付けてください。'); return; }

    setLoading(true, '自動分割・翻訳中... (ဘာသာပြန်နေပါသည်...)');

    const sections = splitByHeaders(text);

    // 何も分割できなかった場合はその他へ
    const hasAny = Object.values(sections).some(v => v);
    if (!hasAny) sections.other = text;

    // 各セクションを翻訳
    const translated = {};
    const keys = ['outing','health','room','bath','new','ongoing','other'];
    for (const k of keys) {
        translated[k] = sections[k] ? await myMemoryTranslate(sections[k]) : '';
    }

    setLoading(false);
    renderOutput(translated);
}

// ===== Claude APIモード 実行 =====
async function runApiMode() {
    hideError();
    const text = document.getElementById('inputText').value.trim();
    const key  = document.getElementById('apiKey').value.trim();
    if (!text) { showError('日報テキストを貼り付けてください。'); return; }
    if (!key)  { showError('Claude APIキーを入力してください。'); return; }
    localStorage.setItem(STORAGE_KEY, key);

    setLoading(true, 'AIが分類・翻訳中... (AI ဘာသာပြန်နေပါသည်...)');

    const systemPrompt = `あなたは介護施設の日本語日報をミャンマー語スタッフ向けに翻訳・整理するアシスタントです。

入力テキストを読み取り7カテゴリに分類してください。
各カテゴリは利用者ごとに箇条書きで要約し、全文をミャンマー語（ビルマ語）に翻訳して出力してください。
該当内容がないカテゴリは空文字 "" にしてください。

注意点：
- outing：時間・場所・詳細を利用者ごとに
- health：症状・対応を利用者ごとに
- room：変化内容を利用者ごとに
- bath：優先順位・注意事項を含める
- newResident：入所日時・注意点を記載
- ongoing：開始日・リスクを含める
- other：上記以外の連絡事項

JSON形式のみで出力（他の文章不要）：
{"outing":"...","health":"...","room":"...","bath":"...","newResident":"...","ongoing":"...","other":"..."}`;

    try {
        const res = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'x-api-key': key,
                'anthropic-version': '2023-06-01',
                'content-type': 'application/json',
                'anthropic-dangerous-direct-browser-access': 'true'
            },
            body: JSON.stringify({
                model: 'claude-haiku-4-5-20251001',
                max_tokens: 2048,
                system: systemPrompt,
                messages: [{ role: 'user', content: text }]
            })
        });
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error?.message || `APIエラー (${res.status})`);
        }
        const data = await res.json();
        const raw  = data.content?.[0]?.text || '';
        const match = raw.match(/\{[\s\S]*\}/);
        if (!match) throw new Error('AIの返答からJSONを取得できませんでした。\n返答:\n' + raw.slice(0, 300));
        const p = JSON.parse(match[0]);
        renderOutput({
            outing: p.outing||'', health: p.health||'', room: p.room||'',
            bath: p.bath||'', new: p.newResident||'', ongoing: p.ongoing||'', other: p.other||''
        });
    } catch (e) {
        showError(e.message || '予期しないエラーが発生しました。');
    } finally {
        setLoading(false);
    }
}

// ===== 出力描画（共通） =====
function renderOutput(data) {
    const map = { outing:'out_outing', health:'out_health', room:'out_room',
                  bath:'out_bath', new:'out_new', ongoing:'out_ongoing', other:'out_other' };
    let qrContent = '';
    Object.entries(map).forEach(([k, id]) => {
        const el = document.getElementById(id);
        const val = (data[k] || '').trim();
        if (val) {
            el.textContent = val;
            el.classList.remove('empty-notice');
            qrContent += val + '\n\n';
        } else {
            el.textContent = '（該当なし / မရှိပါ）';
            el.classList.add('empty-notice');
        }
    });

    const now = new Date();
    document.getElementById('outputDate').textContent =
        now.toLocaleDateString('ja-JP', { year:'numeric', month:'long', day:'numeric', weekday:'long' });

    generateQR(qrContent.trim());
    document.getElementById('outputArea').style.display  = 'block';
    document.getElementById('actionBtns').style.display  = 'flex';
    document.getElementById('outputArea').scrollIntoView({ behavior: 'smooth' });
}

function generateQR(text) {
    const el = document.getElementById('qrCode');
    el.innerHTML = '';
    const content = text.length > 2000 ? text.slice(0, 2000) + '…' : text;
    try {
        new QRCode(el, { text: content || 'No content', width: 120, height: 120,
                         correctLevel: QRCode.CorrectLevel.L });
    } catch { el.textContent = 'QR生成失敗'; }
}

function setLoading(on, msg) {
    document.getElementById('loading').style.display = on ? 'block' : 'none';
    if (msg) document.getElementById('loadingMsg').textContent = msg;
    document.getElementById('runBtn_free').disabled = on;
    document.getElementById('runBtn_api').disabled  = on;
}
function showError(msg) {
    const el = document.getElementById('errorMsg');
    el.textContent = msg; el.style.display = 'block';
}
function hideError() { document.getElementById('errorMsg').style.display = 'none'; }

// ===== LINEで送る =====
function shareToLine() {
    const sections = [
        { id: 'out_outing',  label: '【外出スケジュール / ယနေ့ အပြင်ထွက်မည့် အစီအစဉ်】' },
        { id: 'out_health',  label: '【体調管理 / ကျန်းမာရေး စောင့်ကြည့်ရန်】' },
        { id: 'out_room',    label: '【居室環境 / အခန်း ပတ်ဝန်းကျင်】' },
        { id: 'out_bath',    label: '【入浴予定 / ရေချိုးမည့် အစီအစဉ်】' },
        { id: 'out_new',     label: '【新入所者 / အသစ်ဝင်ရောက်လာသူ】' },
        { id: 'out_ongoing', label: '【継続連絡 / ဆက်လက် ဆောင်ရွက်ရန်】' },
        { id: 'out_other',   label: '【その他 / အခြား】' },
    ];

    const date = document.getElementById('outputDate').textContent;
    let text = `နေ့စဉ် အစီရင်ခံစာ (日報)\n${date}\n\n`;

    sections.forEach(({ id, label }) => {
        const el = document.getElementById(id);
        const val = el.textContent.trim();
        if (val && !el.classList.contains('empty-notice')) {
            text += label + '\n' + val + '\n\n';
        }
    });

    const url = 'https://line.me/R/share?text=' + encodeURIComponent(text.trim());
    window.open(url, '_blank');
}

// onclick属性から呼び出すためグローバルに公開
window.switchMode = switchMode;
window.saveKey = saveKey;
window.handleDragOver = handleDragOver;
window.handleDragLeave = handleDragLeave;
window.handleDrop = handleDrop;
window.runFreeMode = runFreeMode;
window.runApiMode = runApiMode;
window.shareToLine = shareToLine;

// ===== パッケージQRパネル（qr-content.html 移植） =====
(function () {
    if (/Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent)) {
        var panel = document.querySelector('.pkg-qr-panel');
        if (panel) panel.style.display = 'none';
        return;
    }

    var mount = document.getElementById('pkgQrMount');
    var pageUrl = window.location.href;
    var QR_URL_KEY = 'myanmar_tool_qr_lan_url';

    function showQrFromUrl(targetUrl) {
        mount.innerHTML =
            '<img class="pkg-qr-image" alt="QRコード">' +
            '<p class="pkg-qr-url"></p>' +
            '<button type="button" class="pkg-qr-link" id="pkgChangeBtn" style="background:#666;margin-top:8px;">URLを変更</button>';
        mount.querySelector('.pkg-qr-image').src = buildQrUrl(targetUrl);
        mount.querySelector('.pkg-qr-url').textContent = targetUrl;
        document.getElementById('pkgChangeBtn').addEventListener('click', showInputForm);
    }

    function showInputForm() {
        var saved = localStorage.getItem(QR_URL_KEY) || '';
        mount.innerHTML =
            '<div class="pkg-qr-input-row">' +
                '<input id="pkgUrlInput" type="url" placeholder="http://192.168.x.x:8000/ミャンマースタッフ用_v2.html" value="">' +
                '<button type="button" class="pkg-qr-link" id="pkgGenBtn">QR生成</button>' +
            '</div>' +
            '<p class="pkg-qr-url">例: http://192.168.1.10:8000/ミャンマースタッフ用_v2.html</p>';
        document.getElementById('pkgUrlInput').value = saved;
        document.getElementById('pkgGenBtn').addEventListener('click', function () {
            var url = document.getElementById('pkgUrlInput').value.trim();
            if (!url) { alert('URLを入力してください'); return; }
            localStorage.setItem(QR_URL_KEY, url);
            showQrFromUrl(url);
        });
    }

    var reason = blockedReason(pageUrl);
    if (reason) {
        var saved = localStorage.getItem(QR_URL_KEY);
        if (saved) {
            showQrFromUrl(saved);
        } else {
            mount.innerHTML = '<div class="pkg-qr-placeholder">' + reason + '</div>';
            mount.innerHTML += '<div style="margin-top:12px;"><button type="button" class="pkg-qr-link" id="pkgInputBtn">LAN IPを入力してQRを生成</button></div>';
            document.getElementById('pkgInputBtn').addEventListener('click', showInputForm);
        }
        return;
    }

    // 本番URL（HTTPサーバー経由）の場合はそのままQR生成
    mount.innerHTML =
        '<img class="pkg-qr-image" alt="このページを開くQRコード">' +
        '<div><a class="pkg-qr-link" target="_blank" rel="noopener">開く</a></div>' +
        '<p class="pkg-qr-url"></p>';
    mount.querySelector('.pkg-qr-image').src = buildQrUrl(pageUrl);
    mount.querySelector('.pkg-qr-link').href = pageUrl;
    mount.querySelector('.pkg-qr-url').textContent = pageUrl;
}());
