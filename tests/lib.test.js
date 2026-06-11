import { describe, it, expect } from 'vitest';
import { detectSectionHeader, splitByHeaders, chunkText, blockedReason, buildQrUrl } from '../lib.js';

describe('detectSectionHeader', () => {
    it('detects half-width numeral headers with recognized separators', () => {
        expect(detectSectionHeader('1. 外出スケジュール')).toBe('outing');
        expect(detectSectionHeader('3）居室環境')).toBe('room');
        expect(detectSectionHeader('4、入浴予定')).toBe('bath');
        expect(detectSectionHeader('5 新入所')).toBe('new');
    });

    it('does not numeral-match an unrecognized separator unless a keyword also matches', () => {
        // ',' (half-width comma) is not a recognized separator, and this line
        // contains no section keyword either.
        expect(detectSectionHeader('2,本日の予定')).toBe(null);
    });

    it('detects full-width numeral headers', () => {
        expect(detectSectionHeader('２．体調管理が必要な方')).toBe('health');
        expect(detectSectionHeader('６.継続中の連絡事項')).toBe('ongoing');
        expect(detectSectionHeader('７．その他')).toBe('other');
    });

    it('falls back to keyword matching on short lines without a numeral prefix', () => {
        expect(detectSectionHeader('外出予定')).toBe('outing');
        expect(detectSectionHeader('新規入所のお知らせ')).toBe('new');
        expect(detectSectionHeader('継続事項')).toBe('ongoing');
    });

    it('does not keyword-match lines that are 30 characters or longer', () => {
        const longLine = '本日のその他連絡事項については特に問題ありませんでしたので報告します';
        expect(longLine.length).toBeGreaterThanOrEqual(30);
        expect(detectSectionHeader(longLine)).toBe(null);
    });

    it('returns null for lines with no numeral prefix or keyword', () => {
        expect(detectSectionHeader('本日も一日お疲れ様でした。')).toBe(null);
        expect(detectSectionHeader('')).toBe(null);
    });

    it('falls back to keyword match when a multi-digit number is not a recognized prefix', () => {
        // "10." does not match the "1" + separator pattern, but the line is short
        // enough and contains the "外出" keyword, so it matches via keyword.
        expect(detectSectionHeader('10. 外出のお知らせ')).toBe('outing');
    });
});

describe('splitByHeaders', () => {
    it('splits a full report into the correct sections (half-width numerals)', () => {
        const text = [
            '1. 外出スケジュール',
            'Aさん 10:00 病院へ',
            '2. 体調管理',
            'Bさん 発熱のため経過観察',
            '3. 居室環境',
            '4. 入浴予定',
            'Cさんを入れる予定',
            '5. 新入所',
            '6. 継続事項',
            'Dさんの件は経過観察中',
            '7. その他',
            '特になし',
        ].join('\n');

        expect(splitByHeaders(text)).toEqual({
            outing: 'Aさん 10:00 病院へ',
            health: 'Bさん 発熱のため経過観察',
            room: '',
            bath: 'Cさんを入れる予定',
            new: '',
            ongoing: 'Dさんの件は経過観察中',
            other: '特になし',
        });
    });

    it('splits a full report into the correct sections (full-width numerals)', () => {
        const text = [
            '１．外出スケジュール',
            'Aさん 10:00',
            '２．体調管理',
            'Bさん 発熱',
        ].join('\n');

        const result = splitByHeaders(text);
        expect(result.outing).toBe('Aさん 10:00');
        expect(result.health).toBe('Bさん 発熱');
    });

    it('drops content that appears before the first recognized header', () => {
        const text = [
            'これはヘッダー前のテキストです',
            '1. 外出スケジュール',
            'Aさん 10:00',
        ].join('\n');

        const result = splitByHeaders(text);
        expect(result.outing).toBe('Aさん 10:00');
        expect(Object.values(result).join('')).not.toContain('ヘッダー前');
    });

    it('concatenates content across repeated headers of the same section', () => {
        const text = [
            '1. 外出スケジュール',
            'Aさん 10:00',
            '2. 体調管理',
            'Bさん 発熱',
            '1. 外出スケジュール（追加）',
            'Cさん 14:00',
        ].join('\n');

        const result = splitByHeaders(text);
        expect(result.outing).toBe('Aさん 10:00\nCさん 14:00');
    });

    it('returns all-empty sections for empty input', () => {
        expect(splitByHeaders('')).toEqual({
            outing: '', health: '', room: '', bath: '', new: '', ongoing: '', other: '',
        });
    });

    it('returns all-empty sections when no header is recognized', () => {
        const text = [
            '本日は特に変わったことはありませんでした。',
            '明日もよろしくお願いします。',
        ].join('\n');

        expect(splitByHeaders(text)).toEqual({
            outing: '', health: '', room: '', bath: '', new: '', ongoing: '', other: '',
        });
    });
});

describe('chunkText', () => {
    it('returns a single chunk when the text is under the limit', () => {
        expect(chunkText('hello\nworld', 480)).toEqual(['hello\nworld']);
    });

    it('returns an empty array for empty input', () => {
        expect(chunkText('', 480)).toEqual([]);
    });

    it('does not split a single line that exceeds the limit on its own', () => {
        const longLine = 'a'.repeat(500);
        const chunks = chunkText(longLine, 480);
        expect(chunks).toHaveLength(1);
        expect(chunks[0]).toBe(longLine);
    });

    it('splits into multiple chunks once the combined length exceeds the limit', () => {
        const lineA = 'a'.repeat(300);
        const lineB = 'b'.repeat(300);
        expect(chunkText(`${lineA}\n${lineB}`, 480)).toEqual([lineA, lineB]);
    });

    it('keeps a line exactly at the limit in the current chunk', () => {
        const exact = 'a'.repeat(480);
        const chunks = chunkText(`${exact}\nb`, 480);
        expect(chunks).toEqual([exact, 'b']);
    });
});

describe('blockedReason', () => {
    it('flags missing URLs', () => {
        expect(blockedReason('')).toBe('URLがありません。');
        expect(blockedReason(null)).toBe('URLがありません。');
    });

    it('flags file:// URLs', () => {
        expect(blockedReason('file:///C:/Users/test/index.html')).toMatch(/^PC内ファイル/);
    });

    it('flags localhost-style URLs', () => {
        expect(blockedReason('http://localhost:8000/index.html')).toMatch(/^localhost/);
        expect(blockedReason('http://127.0.0.1:8000/')).toMatch(/^localhost/);
        expect(blockedReason('http://[::1]:8000/')).toMatch(/^localhost/);
    });

    it('does not flag LAN or production URLs', () => {
        expect(blockedReason('http://192.168.1.10:8000/index.html')).toBe('');
        expect(blockedReason('https://example.com/tool/')).toBe('');
    });
});

describe('buildQrUrl', () => {
    it('builds a qrserver URL with the expected fixed parameters and target URL', () => {
        const target = 'http://192.168.1.10:8000/index.html';
        const result = buildQrUrl(target);
        expect(result.startsWith('https://api.qrserver.com/v1/create-qr-code/?')).toBe(true);

        const params = new URL(result).searchParams;
        expect(params.get('size')).toBe('600x600');
        expect(params.get('margin')).toBe('48');
        expect(params.get('ecc')).toBe('H');
        expect(params.get('color')).toBe('000000');
        expect(params.get('bgcolor')).toBe('FFFFFF');
        expect(params.get('data')).toBe(target);
    });
});
