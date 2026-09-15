// Pure-JS Pali transliteration: IAST/ISO Pali -> Brahmic scripts. Table-driven, no
// dependencies, same file runs on the server (?script=) and inside the offline app (no Node,
// no Pyodide there). Output is checked segment-by-segment against Aksharamukha — see
// scripts/compare-pali-script.js; keep the tables in sync with what that comparison reports.
//
// Pali only: fixed alphabet, one virama rule, no Sanskrit conjunct exceptions. Anything that
// is not a Pali letter passes through unchanged (digits and the full stop become the script's
// own where it has them, as Aksharamukha does).
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.PaliScript = factory();
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    // Consonants in the order the tables below list them.
    const CONS = ['k', 'kh', 'g', 'gh', 'ṅ', 'c', 'ch', 'j', 'jh', 'ñ', 'ṭ', 'ṭh', 'ḍ', 'ḍh', 'ṇ',
        't', 'th', 'd', 'dh', 'n', 'p', 'ph', 'b', 'bh', 'm', 'y', 'r', 'l', 'v', 's', 'h', 'ḷ'];
    const VOWELS = ['a', 'ā', 'i', 'ī', 'u', 'ū', 'e', 'o'];

    // Each script: consonant letters (CONS order), independent vowels and dependent vowel signs
    // (VOWELS order; 'a' sign is always empty), virama, anusvara, optional digits/danda. Optional `post` hook for
    // script-specific orthography (Burmese stacking/kinzi/tall aa, Thai preposed vowels).
    const SCRIPTS = {
        Devanagari: {
            cons: 'क ख ग घ ङ च छ ज झ ञ ट ठ ड ढ ण त थ द ध न प फ ब भ म य र ल व स ह ळ',
            vowels: 'अ आ इ ई उ ऊ ए ओ',
            signs: ['', 'ा', 'ि', 'ी', 'ु', 'ू', 'े', 'ो'],
            virama: '्', anusvara: 'ं', digits: '०१२३४५६७८९', danda: '।'
        },
        Sinhala: {
            cons: 'ක ඛ ග ඝ ඞ ච ඡ ජ ඣ ඤ ට ඨ ඩ ඪ ණ ත ථ ද ධ න ප ඵ බ භ ම ය ර ල ව ස හ ළ',
            vowels: 'අ ආ ඉ ඊ උ ඌ ඒ ඕ', // Pali e/o are long: ඒ/ඕ, as Aksharamukha does
            signs: ['', 'ා', 'ි', 'ී', 'ු', 'ූ', 'ේ', 'ෝ'],
            virama: '්', anusvara: 'ං',
            // y/r after a dead consonant join it (yansaya/rakaransaya): virama + ZWJ.
            post: out => out.replace(/්(?=[යර])/g, '්\u200d')
        },
        Thai: {
            cons: 'ก ข ค ฆ ง จ ฉ ช ฌ ญ ฏ ฐ ฑ ฒ ณ ต ถ ท ธ น ป ผ พ ภ ม ย ร ล ว ส ห ฬ',
            // Thai has no independent vowel letters: อ carries the vowel sign.
            vowels: 'อ อา อิ อี อุ อู เอ โอ',
            signs: ['', 'า', 'ิ', 'ี', 'ุ', 'ู', 'เ', 'โ'],
            preposed: { 'เ': 1, 'โ': 1, wide: /[ยรลวสห]/ }, // written before the consonant they follow in speech
            virama: 'ฺ', anusvara: 'ํ', digits: '๐๑๒๓๔๕๖๗๘๙', danda: 'ฯ',
            post: out => out.replace(/ิํ/g, 'ึ') // iṁ has its own sign (sara ue)
        },
        KhmerCambodian: {
            cons: 'ក ខ គ ឃ ង ច ឆ ជ ឈ ញ ដ ឋ ឌ ឍ ណ ត ថ ទ ធ ន ប ផ ព ភ ម យ រ ល វ ស ហ ឡ',
            vowels: 'អ អា ឥ ឦ ឧ ឩ ឯ ឱ',
            signs: ['', 'ា', 'ិ', 'ី', 'ុ', 'ូ', 'េ', 'ោ'],
            virama: '្', anusvara: 'ំ', digits: '០១២៣៤៥៦៧៨៩', danda: '។',
            // iṁ has its own sign; a bare word-final consonant takes viriam, not coeng.
            post: out => out.replace(/ិំ/g, 'ឹ').replace(/្(?![ក-អ])/g, '៑')
        },
        Brahmi: {
            cons: '𑀓 𑀔 𑀕 𑀖 𑀗 𑀘 𑀙 𑀚 𑀛 𑀜 𑀝 𑀞 𑀟 𑀠 𑀡 𑀢 𑀣 𑀤 𑀥 𑀦 𑀧 𑀨 𑀩 𑀪 𑀫 𑀬 𑀭 𑀮 𑀯 𑀲 𑀳 𑀴',
            vowels: '𑀅 𑀆 𑀇 𑀈 𑀉 𑀊 𑀏 𑀑',
            signs: ['', '𑀸', '𑀺', '𑀻', '𑀼', '𑀽', '𑁂', '𑁄'],
            virama: '𑁆', anusvara: '𑀁', digits: '𑁦𑁧𑁨𑁩𑁪𑁫𑁬𑁭𑁮𑁯', danda: '𑁇'
        },
        LaoPali: {
            // Lao with the Pali-only letters (ຆ ຉ ຌ ຎ ຏ ຐ ຑ ຒ ຓ ຘ ຠ ຬ) that modern Lao dropped.
            cons: 'ກ ຂ ຄ ຆ ງ ຈ ຉ ຊ ຌ ຎ ຏ ຐ ຑ ຒ ຓ ຕ ຖ ທ ຘ ນ ປ ຜ ພ ຠ ມ ຍ ຣ ລ ວ ສ ຫ ຬ',
            vowels: 'ອ ອາ ອິ ອີ ອຸ ອູ ເອ ໂອ',
            signs: ['', 'າ', 'ິ', 'ີ', 'ຸ', 'ູ', 'ເ', 'ໂ'],
            preposed: { 'ເ': 1, 'ໂ': 1 }, // always right before the bearer (ສ຺ເສ), unlike Thai
            virama: '຺', anusvara: 'ໍ', digits: '໐໑໒໓໔໕໖໗໘໙', danda: 'ຯ'
        },
        Tibetan: {
            // Aspirates are the precomposed letters (གྷ ཛྷ ཌྷ དྷ བྷ) so that +0x50 gives their
            // precomposed subjoined forms too. v is ཝ here only so it subjoins as ྭ; bare v is བ.
            cons: ['ཀ', 'ཁ', 'ག', '\u0F43', 'ང', 'ཙ', 'ཚ', 'ཛ', '\u0F5C', 'ཉ', 'ཊ', 'ཋ', 'ཌ', '\u0F4D', 'ཎ', 'ཏ', 'ཐ', 'ད', '\u0F52', 'ན',
                'པ', 'ཕ', 'བ', '\u0F57', 'མ', 'ཡ', 'ར', 'ལ', 'ཝ', 'ས', 'ཧ', 'ལ'],
            vowels: 'ཨ ཨཱ ཨི ཨཱི ཨུ ཨཱུ ཨེ ཨོ',
            signs: ['', 'ཱ', 'ི', 'ཱི', 'ུ', 'ཱུ', 'ེ', 'ོ'],
            virama: '྄', anusvara: 'ཾ', digits: '༠༡༢༣༤༥༦༧༨༩', danda: '།',
            // A consonant after a dead one is written in its subjoined form (U+0F90 block) instead
            // of virama + letter; a word-final consonant simply has no vowel mark. Words are
            // separated by tsheg, not space; parentheses are the Tibetan brackets.
            post: out => out
                .replace(/྄([\u0F40-\u0F6C])/g, (m, c) => String.fromCharCode(c.charCodeAt(0) + 0x50))
                .replace(/྄/g, '').replace(/ཝ/g, 'བ').replace(/ཡྱ/g, 'ཡྻ') // yy: fixed-form subjoined ya
                .replace(/ /g, '་').replace(/\(/g, '༺').replace(/\)/g, '༻')
        },
        BengaliBangla: {
            // v is ব like b. y is য word-initially, after a dead consonant and after another y; য়
            // (U+09DF, escaped: composition exclusion) elsewhere. ṁ before a stop is the homorganic nasal + virama.
            cons: 'ক খ গ ঘ ঙ চ ছ জ ঝ ঞ ট ঠ ড ঢ ণ ত থ দ ধ ন প ফ ব ভ ম য র ল ৱ স হ ল', // ৱ = v until post
            vowels: 'অ আ ই ঈ উ ঊ এ ও',
            signs: ['', 'া', 'ি', 'ী', 'ু', 'ূ', 'ে', 'ো'],
            virama: '্', anusvara: 'ং', digits: '০১২৩৪৫৬৭৮৯', danda: '।',
            post: out => out
                .replace(/(?<=[\u0980-\u09FF])(?<![্য])য/g, '\u09DF')
                .replace(/ং(?=[ক-ঘ])/g, 'ঙ্').replace(/ং(?=[চ-ঝ])/g, 'ঞ্').replace(/ং(?=[ট-ঢ])/g, 'ণ্')
                .replace(/ং(?=[ত-ধ])/g, 'ন্').replace(/ং(?=[প-ভ])/g, 'ম্')
                .replace(/ৱ/g, 'ব') // after the nasal rule: ṁ + v stays ং
        },
        Chakma: {
            // The inherent vowel is ā: a takes a sign (𑄧), ā takes none. Independent vowels are
            // all 𑄃 + sign.
            cons: '𑄇 𑄈 𑄉 𑄊 𑄋 𑄌 𑄍 𑄎 𑄏 𑄐 𑄑 𑄒 𑄓 𑄔 𑄕 𑄖 𑄗 𑄘 𑄙 𑄚 𑄛 𑄜 𑄝 𑄞 𑄟 𑄠 𑄢 𑄣 𑄤 𑄥 𑄦 𑄣',
            vowels: '𑄃𑄧 𑄃 𑄃𑄨 𑄃𑄩 𑄃𑄪 𑄃𑄫 𑄃𑄬 𑄃𑄮',
            signs: ['𑄧', '', '𑄨', '𑄩', '𑄪', '𑄫', '𑄬', '𑄮'],
            virama: '𑄴', anusvara: '𑄁', digits: '𑄶𑄷𑄸𑄹𑄺𑄻𑄼𑄽𑄾𑄿', danda: '𑅁',
            // A doubled consonant with a vowel sign after it is written once: C + 𑄴 + sign (𑄇𑄴𑄧
            // for kka, but 𑄇𑄴𑄇 for kkā). Before y r v n the killer is 𑄳 (virama), elsewhere 𑄴
            // (maayyaa); l as well. Word-initial y is 𑄡 (yya).
            post: out => out
                .replace(/(\p{Script=Chakma})𑄴\1(?=[𑄧𑄨𑄩𑄪𑄫𑄬𑄮])/gu, '$1𑄴')
                .replace(/𑄴(?=[𑄠𑄢𑄤𑄚𑄣])/gu, '𑄳')
                .replace(/(?<!\p{Script=Chakma})𑄠/gu, '𑄡')
        },
        ThamLanna: {
            cons: 'ᨠ ᨡ ᨣ ᨥ ᨦ ᨧ ᨨ ᨩ ᨫ ᨬ ᨭ ᨮ ᨯ ᨰ ᨱ ᨲ ᨳ ᨴ ᨵ ᨶ ᨸ ᨹ ᨻ ᨽ ᨾ ᨿ ᩁ ᩃ ᩅ ᩈ ᩉ ᩊ',
            vowels: 'ᩋ ᩋᩣ ᩍ ᩎ ᩏ ᩐ ᩑ ᩒ',
            signs: ['', 'ᩣ', 'ᩥ', 'ᩦ', 'ᩩ', 'ᩪ', 'ᩮ', 'ᩮᩣ'],
            virama: '᩠', anusvara: 'ᩴ', digits: '᪐᪑᪒᪓᪔᪕᪖᪗᪘᪙', danda: '᪨',
            // sakot (᩠) stacks the next consonant; ss, ṅ+C, C+l, C+r have their own signs; a
            // word-final dead consonant takes ra haam (᩺). Tall ā (ᩤ) when the head is ᨣ ᨴ ᩅ ᨵ and
            // the stacked letter, if any, is not ᨥ ᨿ.
            post: out => out
                .replace(/ᩈ᩠ᩈ/g, 'ᩔ').replace(/ᨦ᩠/g, 'ᩘ').replace(/᩠ᩃ/g, 'ᩖ').replace(/᩠ᩁ/g, 'ᩕ')
                .replace(/᩠(?![ᨠ-ᩊ])/g, '᩺')
                .replace(/(?<!᩠)([ᨣᨴᩅᨵ])((?:᩠[^ᨥᨿ\s])?ᩕ?ᩮ?)ᩣ/g, '$1$2ᩤ')
        },
        Mon: {
            // Burmese letters with Mon's own ṅ (ၚ), jh (ၛ), ñ (ည, never merged for ññ), ī (ဳ) and
            // medial na/ma/la (ၞ ၟ ၠ) for a stacked n m l.
            cons: 'က ခ ဂ ဃ ၚ စ ဆ ဇ ၛ ည ဋ ဌ ဍ ဎ ဏ တ ထ ဒ ဓ န ပ ဖ ဗ ဘ မ ယ ရ လ ဝ သ ဟ ဠ',
            vowels: 'အ အာ ဣ ဣဳ ဥ ဥူ ဨ ဩ', // long ī/ū are i/u + sign, not ဤ/ဦ
            signs: ['', 'ာ', 'ိ', 'ဳ', 'ု', 'ူ', 'ေ', 'ော'],
            virama: '္', anusvara: 'ံ', digits: '၀၁၂၃၄၅၆၇၈၉', danda: '၊',
            post: out => burmese(out, 'ၚ').replace(/္န/g, 'ၞ').replace(/္မ/g, 'ၟ').replace(/္လ/g, 'ၠ')
        },
        BurmeseMyanmar: {
            cons: 'က ခ ဂ ဃ င စ ဆ ဇ ဈ ဉ ဋ ဌ ဍ ဎ ဏ တ ထ ဒ ဓ န ပ ဖ ဗ ဘ မ ယ ရ လ ဝ သ ဟ ဠ',
            vowels: 'အ အာ ဣ ဤ ဥ ဦ ဧ ဩ',
            signs: ['', 'ာ', 'ိ', 'ီ', 'ု', 'ူ', 'ေ', 'ော'],
            virama: '္', anusvara: 'ံ', digits: '၀၁၂၃၄၅၆၇၈၉', danda: '၊',
            post: burmese
        }
    };

    for (const s of Object.values(SCRIPTS)) {
        if (typeof s.cons === 'string') s.cons = s.cons.split(' ');
        if (typeof s.vowels === 'string') s.vowels = s.vowels.split(' ');
        if (s.digits) s.digits = Array.from(s.digits); // Brahmi digits are astral (surrogate pairs)
    }

    const CONS_INDEX = Object.fromEntries(CONS.map((c, i) => [c, i]));
    const VOWEL_INDEX = Object.fromEntries(VOWELS.map((v, i) => [v, i]));

    // Lowercase + fold the ISO/IAST anusvara variants (ṁ/ṃ) into one and NFC so the
    // precomposed table keys match.
    function normalize(text) {
        return text.normalize('NFC').toLowerCase().replace(/ṃ/g, 'ṁ');
    }

    // Tokenize into [type, value] where type is 'c' consonant, 'v' vowel, 'm' anusvara,
    // 'x' passthrough character. Digraphs (kh, ṭh, ...) are matched before single letters.
    function tokenize(text) {
        const out = [];
        for (let i = 0; i < text.length; i++) {
            const two = text.slice(i, i + 2);
            if (CONS_INDEX[two] !== undefined) { out.push(['c', two]); i++; continue; }
            const one = text[i];
            if (CONS_INDEX[one] !== undefined) out.push(['c', one]);
            else if (VOWEL_INDEX[one] !== undefined) out.push(['v', one]);
            else if (one === 'ṁ') out.push(['m', one]);
            else out.push(['x', one]);
        }
        return out;
    }

    // Generic abugida rendering: consonant + vowel sign, virama for a bare consonant,
    // independent vowel letter when a vowel does not follow a consonant.
    function render(tokens, s) {
        let out = '';
        let prevStart = 0;    // where the previous consonant letter began in `out`
        let dead = false;     // previous token was a consonant without a vowel
        for (let i = 0; i < tokens.length; i++) {
            const [type, val] = tokens[i];
            if (type === 'c') {
                const next = tokens[i + 1];
                const letter = s.cons[CONS_INDEX[val]];
                if (next && next[0] === 'v') {
                    const sign = s.signs[VOWEL_INDEX[next[1]]];
                    if (s.preposed && s.preposed[sign]) {
                        // Thai: เ/โ goes before the preceding dead letter too when either that letter
                        // is s/h or the vowel-bearing one is y r l v s h (เสฺส, เสฺน, เหฺม, เณฺห);
                        // before just the bearer otherwise (ทฺโธ, กฺเข).
                        const wide = dead && s.preposed.wide && (s.preposed.wide.test(letter) || /[สห]/.test(out[prevStart]));
                        out = out.slice(0, wide ? prevStart : out.length) + sign + out.slice(wide ? prevStart : out.length) + letter;
                    } else out += letter + sign;
                    i++;
                    dead = false;
                } else {
                    prevStart = out.length;
                    out += letter + s.virama;
                    dead = true;
                }
                continue;
            }
            dead = false;
            if (type === 'v') {
                out += s.vowels[VOWEL_INDEX[val]];
            } else if (type === 'm') {
                out += s.anusvara;
            } else {
                out += val;
            }
        }
        return out;
    }

    // Burmese Pali orthography on top of the generic rendering:
    //  - ññ -> ည, ss -> ဿ (single letters for the geminates)
    //  - ṅ + consonant -> kinzi (င်္) instead of a stacked ṅ
    //  - y r v h after a dead consonant are medial signs (ျ ြ ွ ှ), not stacked letters
    //  - word-final bare consonant takes asat (်) instead of the stacking virama
    //  - "tall" ā (ါ) when the visible head of the cluster (not a subscript) is ခ ဂ င ဒ ပ ဝ
    //    and no ya/ra medial sits between them (ဂါ, ဒ္ဓေါ, ဒွါ, but ဂျာ, ဒြာ, ဒြော; ဂြေါ)
    const MEDIAL = { 'ယ': 'ျ', 'ရ': 'ြ', 'ဝ': 'ွ', 'ဟ': 'ှ' };
    function burmese(out, nga = 'င') {
        return out
            .replace(/ဉ္ဉ/g, 'ည')
            .replace(/သ္သ/g, 'ဿ')
            .replace(new RegExp(nga + '္', 'g'), nga + '်္')
            .replace(/္([ယရဝဟ])/g, (m, c) => MEDIAL[c])
            .replace(/္(?![\u1000-\u1021\u105A-\u105D])/g, '်')
            .replace(/(?<![^်]္)([ခဂငဒပဝ])((?:္[\u1000-\u1021])*(?:[ွှ]*ေ?|(?<=ဂ)ြေ))ာ/g, '$1$2ါ');
    }

    function convert(text, script) {
        const s = SCRIPTS[script];
        if (!s || !text) return text;
        // 6.5k root segments carry inline markup (<b>…</b>): leave tags alone, convert the rest.
        if (text.includes('<')) return text.split(/(<[^>]*>)/).map(p => p[0] === '<' ? p : convert(p, script)).join('');
        let out = render(tokenize(normalize(text)), s);
        if (s.digits) out = out.replace(/[0-9]/g, d => s.digits[d]); // digits is an array (see below)
        if (s.danda) out = out.replace(/\./g, s.danda); // full stop -> the script's own danda
        if (s.post) out = s.post(out);
        return out;
    }

    return { convert, scripts: Object.keys(SCRIPTS) };
});
