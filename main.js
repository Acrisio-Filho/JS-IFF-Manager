// Arquivo main.js
// Criado em 07/12/2025 as 20:10 por Acrisio
// Versão suportadas:
//  [
//      {Temporada: Fresh Up!, Região: Japão, Versão: 983},
//      {Temporada: Fresh Up!, Região: USA, Versão: 852},
//      {Temporada: Fresh Up!, Região: Coreia, Versão: 839},
//      {Temporada: Fresh Up!, Região: Tailândia, Versão: 829c},
//  ]

const kCodePageSupported = [
    'utf8',
    'latin1',
    'windows1251',
    'windows1252',
    'cp949',
    'cp874',
    'shift_jis',
    'cp936',
    'cp950'
];

const kCodePageLocale = {
    'utf8': 'Universal',
    'latin1': 'Latin1',
    'windows1251': 'Russo',
    'windows1252': 'Europeu Ocidental(Brasil)',
    'cp949': 'Coreano',
    'cp874': 'Tailandês',
    'shift_jis': 'Japonês',
    'cp936': 'Chinês Simplificado',
    'cp950': 'Chinês Tradicional'
};

const kDefaultCodePage = 'shift_jis';

const kCodePage = {
    load: kDefaultCodePage,
    upload: kDefaultCodePage
};

function safeUtf8String(_data) {
    let end = _data.length;
    let pos = 0;

    while (pos < end) {
        const byte = _data[pos];

        let charLength = 1;
        if ((byte & 0b10000000) === 0)
            charLength = 1;
        else if ((byte & 0b11100000) === 0b11000000)
            charLength = 2;
        else if ((byte & 0b11110000) === 0b11100000)
            charLength = 3;
        else if ((byte & 0b11111000) === 0b11110000)
            charLength = 4;

        if ((pos + charLength) > end) break;

        pos += charLength;
    }

    return _data.subarray(0, pos);
}

// trunca bytes no limite do caractere para cada code page suportado, usando as
// REGRAS DE BYTES do encoding (lead/trail) — igual ao safeUtf8String faz para
// utf8. NÃO decodifica/recodifica (isso transformaria o multibyte cortado em '?'
// e aceitaria o caractere corrompido); apenas EXCLUI o caractere incompleto do
// final, deixando o buffer com caracteres válidos e fechando no limite do campo.
// Se _cp não for multibyte conhecido (latin1/cp874 são single-byte), não há corte
// problemático: devolve o buffer inteiro.
function safeShiftJisString(_bytes) {
    let pos = 0;
    const end = _bytes.length;
    while (pos < end) {
        const b = _bytes[pos];
        let len = 1;
        // lead bytes de 2 bytes: 0x81-0x9F e 0xE0-0xFC (trail 0x40-0x7E / 0x80-0xFC)
        if ((b >= 0x81 && b <= 0x9F) || (b >= 0xE0 && b <= 0xFC))
            len = 2;
        if (pos + len > end) break; // caractere incompleto no fim -> exclui
        pos += len;
    }
    return _bytes.subarray(0, pos);
}

function safeCp949String(_bytes) {
    let pos = 0;
    const end = _bytes.length;
    while (pos < end) {
        const b = _bytes[pos];
        let len = 1;
        // lead bytes UHC: 0x81-0xFE (trail 0x41-0xFE)
        if (b >= 0x81 && b <= 0xFE)
            len = 2;
        if (pos + len > end) break;
        pos += len;
    }
    return _bytes.subarray(0, pos);
}

function safeCp936String(_bytes) {
    let pos = 0;
    const end = _bytes.length;
    while (pos < end) {
        const b = _bytes[pos];
        let len = 1;
        // GBK (cp936): lead 0x81-0xFE, trail 0x40-0x7E / 0x80-0xFE
        if (b >= 0x81 && b <= 0xFE)
            len = 2;
        if (pos + len > end) break;
        pos += len;
    }
    return _bytes.subarray(0, pos);
}

function safeCp950String(_bytes) {
    let pos = 0;
    const end = _bytes.length;
    while (pos < end) {
        const b = _bytes[pos];
        let len = 1;
        // Big5 (cp950): lead 0x81-0xFE, trail 0x40-0x7E / 0xA1-0xFE
        if (b >= 0x81 && b <= 0xFE)
            len = 2;
        if (pos + len > end) break;
        pos += len;
    }
    return _bytes.subarray(0, pos);
}

function safeStringByCode(_bytes, _cp) {
    if (_cp === 'utf8' || _cp === 'utf-8')
        return safeUtf8String(_bytes);
    if (_cp === 'shift_jis' || _cp === 'cp932' || _cp === 'sjis')
        return safeShiftJisString(_bytes);
    if (_cp === 'cp949' || _cp === 'euc-kr' || _cp === 'uhc')
        return safeCp949String(_bytes);
    if (_cp === 'cp936' || _cp === 'gbk')
        return safeCp936String(_bytes);
    if (_cp === 'cp950' || _cp === 'big5')
        return safeCp950String(_bytes);
    // single-byte (latin1, cp874/TIS-620, etc.): corte livre, sem multibyte
    return _bytes;
}

// conta quantos U+FFFD REAIS (sequência EF BF BD) estão nos bytes — um '\uFFFD'
// que veio de decode-error (byte inválido substituído) NÃO tem essa sequência,
// então serve para distinguir caractere legítimo de artefato de decode
function utf8ReplacementCount(_bytes) {
    let n = 0;
    for (let i = 0; i + 2 < _bytes.length; i++)
        if (_bytes[i] === 0xEF && _bytes[i + 1] === 0xBF && _bytes[i + 2] === 0xBD) n++;
    return n;
}

function toUnicode(_data, _code_page = kCodePage.load) {
    return iconvLite.decode(Buffer.from(_data), _code_page).split('\u0000')[0];
}

function toAnsiCodePage(_data, _code_page = kCodePage.upload) {
    return iconvLite.encode(_data, _code_page);
}

// Marcador de encoding embutido no texto: =[{encoding}]=:texto
// O usuário vê e edita o marcador direto no campo — se ele trocar/remover,
// o encode usa o que ele escreveu. A verificação de erro de encoding é só
// o parse: se tem o padrão, está com erro de encoding.
function parseEncodingMarker(_text) {
    const m = /^=\[\{([a-z0-9_]+)\}\]=:(.*)$/s.exec(_text);

    if (!m)
        return null;

    if (!kCodePageSupported.includes(m[1]))
        return null;

    return { encoding: m[1], text: m[2] };
}

// Remove marcadores =[{enc}]=: de qualquer lugar do texto (para exibição na
// lista de itens — no campo editável o marcador fica visível para o usuário
// trocar o encoding)
function stripEncodingMarker(_text) {
    return String(_text).replace(/=\[\{[a-z0-9_]+\}\]=:/g, '');
}

// Versão global incrementada quando qualquer string muda — invalida o cache
// de erros de encoding por item (o aviso precisa refletir o texto editado)
let gStringEditVersion = 0;

// Cache do último encoding detectado: arquivos com texto em encoding
// diferente do code page atual têm várias strings flagadas seguidas —
// reusar a última detecção evita a varredura completa a cada campo.
let stringEncodingCache = { preferred: null, encoding: null };

// Reseta o cache de detecção (chamado ao abrir um arquivo novo)
function resetStringEncodingCache() {
    stringEncodingCache = { preferred: null, encoding: null };
}

// O candidato tem caracteres do SCRIPT dele de verdade? (ex.: cp949 exige
// hangul — sem isso, 2 bytes legados quaisquer viram um símbolo invisível e
// o campo ganha marca/aviso de coreano sem ter NENHUM caractere coreano;
// caso real: Desc.iff US 0x245f8001, bytes a1 a9 = soft hyphen em cp949)
function _cpTemScript(_cp, _text) {
    switch (_cp) {
        case 'cp949':
            // hangul + KANA/CJK: a tabela KS X 1001 (row do cp949) também tem
            // katakana/kanji — nomes do Club.iff US tipo "ケミカルボイスクラブセット"
            // estão gravados nela e NÃO são cp950 ("垮律垂恨")
            return /[\u1100-\u11FF\u3040-\u30FF\u3130-\u318F\u4E00-\u9FFF\uA960-\uA97F\uAC00-\uD7FF]/.test(_text);
        case 'shift_jis':
            return /[\u3041-\u309F\u30A0-\u30FF\u4E00-\u9FFF]/.test(_text);
        case 'cp936':
        case 'cp950':
            return /[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF]/.test(_text);
        case 'cp874':
            return /[\u0E01-\u0E5B]/.test(_text);
        default:
            return /[\u0080-\uFFFF]/.test(_text); // utf8 — qualquer não-ascii
    }
}

// code pages single-byte: não representam scripts multibyte — quando é um
// deles que está decodendo, a varredura por candidatos continua MESMO com o
// round-trip ok (senão texto coreano/japonês real num arquivo US/EU nunca era
// detectado: o latin1 "funciona" para qualquer byte)
const kCodePageSingleByte = ['ascii', 'latin1', 'windows1252', 'windows1251'];

// Detecta o encoding real de uma string quando o code page atual decodifica
// bytes inválidos (\uFFFD). Testa os code pages suportados e escolhe o que
// decodifica sem perda E re-encoda byte a byte (round-trip), preferindo
// encodings multibyte (consomem 2+ bytes por caractere) — o que descarta
// single-byte (ex: windows1252) que "aceitam" qualquer byte mas mostram lixo.
// Retorna null se o code page atual já funciona (sem flag).
function detectStringEncoding(_bytes, _preferred = kCodePage.load) {
    if (stringEncodingCache.preferred !== _preferred)
        stringEncodingCache = { preferred: _preferred, encoding: null };
    let end = _bytes.length;

    for (let i = 0; i < _bytes.length; i++) {
        if (_bytes[i] === 0) {
            end = i;
            break;
        }
    }

    const body = _bytes.slice(0, end);

    if (body.length === 0)
        return null;

    // fast-path: SÓ ascii — nenhum candidato multibyte é possível (a varredura
    // abaixo decoda/re-encoda o corpo em até 6 code pages por campo)
    let temAlto = false;

    for (let i = 0; i < body.length; i++) {
        if (body[i] >= 0x80) {
            temAlto = true;
            break;
        }
    }

    if (!temAlto)
        return null;

    const roundTrip = _cp => {
        let text = null;

        try {
            text = iconvLite.decode(Buffer.from(body), _cp);
        } catch (e) {
            return false;
        }

        if (text.includes('\uFFFD'))
            return false;

        const encoded = iconvLite.encode(text, _cp);

        if (encoded.length !== body.length)
            return false;

        for (let i = 0; i < body.length; i++)
            if (encoded[i] !== body[i])
                return false;

        return true;
    };

    if (roundTrip(_preferred) && !kCodePageSingleByte.includes(_preferred))
        return null;

    const cached =
        stringEncodingCache.encoding;

    // sem encodings single-byte catch-all (windows1251/1252/ascii): aceitam quase
    // qualquer byte e geram falso positivo (ex.: CadieMagicBox → windows1251).
    // ORDEM É PRIORIDADE (empate de score fica com o primeiro): shift_jis e
    // cp949 ANTES de cp936/cp950 — texto coreano decodificado como chinês
    // tradicional é lixo (ex.: Club.iff US "무지개에어나이트" virava "垮律垂恨").
    // O cached vai por ÚLTIMO e só ganha se bater score estritamente maior —
    // não pode mais encurtar caminho e roubar do cp949
    const candidates = [
        'shift_jis',
        'cp949',
        'cp936',
        'cp950',
        'cp874',
        'utf8',
        ...(cached && cached !== _preferred ? [cached] : [])
    ].filter(cp => cp !== _preferred);

    let best = null;
    let bestScore = -1;

    for (const cp of candidates) {
        let text = null;

        try {
            text = iconvLite.decode(Buffer.from(body), cp);
        } catch (e) {
            continue;
        }

        if (text.includes('\uFFFD'))
            continue;

        const encoded = iconvLite.encode(text, cp);

        if (encoded.length !== body.length)
            continue;

        let match = true;

        for (let i = 0; i < body.length; i++) {
            if (encoded[i] !== body[i]) {
                match = false;
                break;
            }
        }

        if (!match)
            continue;

        // só aceita encoding com caractere multibyte de verdade (score > 0):
        // cp874/cp936/cp950 têm faixas single-byte que aceitam quase qualquer
        // byte alto (ex.: 0xA0 → tailandês) e geram falso positivo igual ao
        // windows1251. Tradeoff deliberado: texto single-byte puro (ex.: Thai
        // real em cp874) nunca é auto-detectado — a detecção é só para
        // multibyte, onde há bytes inválidos no code page atual.
        const score = body.length - text.length;

        if (score > 0 && score > bestScore && _cpTemScript(cp, text)) {
            bestScore = score;
            best = cp;
        }
    }

    if (best)
        stringEncodingCache.encoding = best;

    return best;
}

function getElementEncodingErrors(_element) {
    const errors = [];
    const seen = new Set();

    const walk = (obj, path) => {
        if (!obj || typeof obj !== 'object' || seen.has(obj))
            return;
        seen.add(obj);

        if (obj instanceof StringType) {
            // __encoding é mantido sincronizado com o marcador =[{enc}]=: no
            // texto (set value/unserialize chamam _syncEncoding) — a
            // verificação continua sendo o parse do marcador
            if (obj.__encoding)
                errors.push({ field: path, encoding: obj.__encoding });
            return;
        }

        if (Array.isArray(obj)) {
            for (const [i, v] of obj.entries())
                walk(v, `${path}[${i}]`);
            return;
        }

        for (const key of Object.keys(obj)) {
            if (key.startsWith('__'))
                continue;
            walk(obj[key], path ? `${path}.${key}` : key);
        }
    };

    walk(_element, '');

    return errors;
}

function onElementRemovedFrom(_parent, _element, callback) {
    const observer = new MutationObserver(mutations => {
        for (const mutation of mutations) {
            for (const node of mutation.removedNodes) {
                if (node.contains(_element)) {
                    callback(_element);
                    observer.disconnect();
                    return;
                }
            }
        }
    });

    // observa a RAIZ do documento (subtree): o painel é limpo com
    // innerHTML='' nos filhos DELE — um observer no pai PROFUNDO do campo
    // (_parent) nunca vê mutação na própria childList dele quando a subárvore
    // inteira sai junto, e o cleanup (ex.: flatpickr.destroy) nunca rodava —
    // vazava instância/listeners por campo de data a cada item exibido
    observer.observe(document.body, {
        childList: true,
        subtree: true
    });

    return observer;
}

function fieldMaxChars(_v) {

    if (_v instanceof IntTypeBase)
        return Math.ceil(_v.getSize() * 8 * 0.30103) + (_v._unsigned ? 1 : 2);
    if (_v instanceof FloatTypeBase)
        return _v.getSize() >= 8 ? 24 : 13;
    if (_v instanceof StringType)
        return Math.min(_v.limit + 2, 60);
    if (_v instanceof SYSTEMTIME)
        return 24;
    if (_v instanceof CutinInfomationImg)
        return 52;
    return 12;
}

function classLayout(_parent, _name, _value) {

    let group =
        document.createElement("div");

    group.className =
        "array-field-group";

    if (_name) {
        let title =
            document.createElement("div");

        title.className =
            "array-field-title";

        title.textContent =
            _name;

        group.appendChild(title);
    }

    // corpo flex column: campos empilhados com o mesmo gap do painel principal
    let body =
        document.createElement("div");

    body.className =
        "object-field-body";

    _value.layout(body);

    group.appendChild(body);

    _parent.appendChild(group);
}

function arrayLayout(_arr, _name = "", _enum = null) {

    let group =
        document.createElement("div");

    group.className =
        "array-field-group";

    if (_name) {
        let title =
            document.createElement("div");

        title.className =
            "array-field-title";

        title.textContent =
            _name;

        group.appendChild(title);
    }

    let row =
        document.createElement("div");

    row.className =
        "array-field-row";

    _arr.forEach((v, i) => {
        const index = row.children.length;

        // o item sabe a própria posição no array (usado por pickers por slot)
        v._arrayIndex = i;

        v.layout(row, _enum && _enum.getName ? _enum.getName(i) : undefined);

        const el = row.children[index];

        if (el)
            el.style.flex = "1 1 " + fieldMaxChars(v) + "ch";
    });

    group.appendChild(row);

    return group;
}

class ReaderBuffer {

    data = null;
    index = 0;

    static from(_buffer) {
        if (_buffer instanceof ArrayBuffer)
            return new ReaderBuffer(new Uint8Array(_buffer));
        if (_buffer instanceof WriterBuffer)
            return new ReaderBuffer(new Uint8Array(_buffer.buffer));
        return new ReaderBuffer(_buffer);
    }

    static alloc(_length) {
        return new ReaderBuffer(new Uint8Array(_length));
    }

    constructor(_data) {
        this.data = _data;
    }

    get length() {
        return this.data.length;
    }

    get buffer() {
        return this.data.buffer;
    }

    get byteLength() {
        return this.data.byteLength;
    }

    get byteOffset() {
        return this.data.byteOffset;
    }

    getView() {
        return new DataView(this.buffer, this.byteOffset, this.byteLength);
    }

    reset() {
        this.index = 0;
    }
    ignore(_length) {
        this.index += _length;
    }
    increment(_length = 1) {
        const old = this.index;
        this.index += _length;
        return old;
    }

    slice(_start = 0, _end = undefined) {
        return new ReaderBuffer(this.data.slice(_start, _end));
    }

    getBuffer(_length) {
        return new ReaderBuffer(this.data.slice(this.increment(_length), this.index));
    }

    getInt8() {
        return this.getView().getInt8(this.increment(1));
    }
    getUint8() {
        return this.getView().getUint8(this.increment(1));
    }

    getInt16(_is_big_endian = false) {
        return this.getView().getInt16(this.increment(2), !_is_big_endian);
    }
    getUint16(_is_big_endian = false) {
        return this.getView().getUint16(this.increment(2), !_is_big_endian);
    }

    getInt32(_is_big_endian = false) {
        return this.getView().getInt32(this.increment(4), !_is_big_endian);
    }
    getUint32(_is_big_endian = false) {
        return this.getView().getUint32(this.increment(4), !_is_big_endian);
    }

    getInt64(_is_big_endian = false) {
        return this.getView().getBigInt64(this.increment(8), !_is_big_endian);
    }
    getUint64(_is_big_endian = false) {
        return this.getView().getBigUint64(this.increment(8), !_is_big_endian);
    }

    getFloat(_is_big_endian = false) {
        return this.getView().getFloat32(this.increment(4), !_is_big_endian);
    }
    getDouble(_is_big_endian = false) {
        return this.getView().getFloat64(this.increment(8), !_is_big_endian);
    }

    getFixedString(_length, _code_page = kCodePage.load) {
        const raw = this.data.slice(this.increment(_length), this.index);
        // encodings multibyte: descarta bytes finais que não formam caractere
        // completo (ex.: dado salvo por outro programa que cortou no meio de um
        // multibyte, deixando bytes de trailing faltando) — igual ao setFixedString,
        // evita U+FFFD/erro de decode no fim do campo. Single-byte devolve o buffer
        // inteiro (não há multibyte incompleto)
        const bytes = safeStringByCode(raw, _code_page);

        const text = toUnicode(bytes, _code_page);

        // code page single-byte NUNCA gera byte inválido (latin1/1252 aceitam
        // tudo) — a detecção por FFFD nunca dispararia e texto coreano/
        // japonês real num arquivo US/EU ficava como mojibake sem marca nenhuma
        if (text.includes('\uFFFD') || kCodePageSingleByte.includes(_code_page)) {
            // utf8: um '\uFFFD' pode ser um caractere REAL (sequência EF BF BD
            // presente nos bytes) e não erro de decode — nesse caso não rodamos
            // a detecção (evita falso positivo de encoding marcando o campo)
            if (_code_page === 'utf8' || _code_page === 'utf-8') {
                const fffdCount = (text.match(/\uFFFD/g) || []).length;
                const realFffd = utf8ReplacementCount(bytes);
                if (fffdCount > 0 && fffdCount === realFffd)
                    return text; // todos os FFFD são reais -> sem erro de decode
            }
            const detected = detectStringEncoding(bytes, _code_page);

            if (detected)
                return '=[{' + detected + '}]=:' + toUnicode(bytes, detected);
        }

        return text;
    }
}

class WriterBuffer {

    data = null;
    index = 0;

    constructor(_data) {
        this.data = new Uint8Array(_data);
        this.index = 0;
    }

    get length() {
        return this.data.length;
    }

    get buffer() {
        return this.data.buffer;
    }

    get byteLength() {
        return this.data.byteLength;
    }

    get byteOffset() {
        return this.data.byteOffset;
    }

    getView() {
        return new DataView(this.buffer, this.byteOffset, this.byteLength);
    }

    reset() {
        this.index = 0;
    }
    fill(_length, _fill = 0) {
        this.data.fill(_fill, this.increment(_length), this.index);
    }
    increment(_length = 1) {
        const old = this.index;
        this.index += _length;
        return old;
    }

    set(_array, _targetOffset = 0) {
        if (_array instanceof WriterBuffer || _array instanceof ReaderBuffer)
            this.data.set(_array.buffer, _targetOffset);
        else
            this.data.set(_array, _targetOffset);
    }

    setBuffer(_array) {
        if (_array instanceof WriterBuffer || _array instanceof ReaderBuffer)
            this.data.set(_array.buffer, this.increment(_array.length));
        else
            this.data.set(_array, this.increment(_array.length));
    }

    setInt8(_value) {
        this.getView().setInt8(this.increment(1), _value);
    }
    setUint8(_value) {
        this.getView().setUint8(this.increment(1), _value);
    }

    setInt16(_value, _is_big_endian = false) {
        this.getView().setInt16(this.increment(2), _value, !_is_big_endian);
    }
    setUint16(_value, _is_big_endian = false) {
        this.getView().setUint16(this.increment(2), _value, !_is_big_endian);
    }

    setInt32(_value, _is_big_endian = false) {
        this.getView().setInt32(this.increment(4), _value, !_is_big_endian);
    }
    setUint32(_value, _is_big_endian = false) {
        this.getView().setUint32(this.increment(4), _value, !_is_big_endian);
    }

    setInt64(_value, _is_big_endian = false) {
        this.getView().setBigInt64(this.increment(8), _value, !_is_big_endian);
    }
    setUint64(_value, _is_big_endian = false) {
        this.getView().setBigUint64(this.increment(8), _value, !_is_big_endian);
    }

    setFloat(_value, _is_big_endian = false) {
        this.getView().setFloat32(this.increment(4), _value, !_is_big_endian);
    }
    setDouble(_value, _is_big_endian = false) {
        this.getView().setFloat64(this.increment(8), _value, !_is_big_endian);
    }

    setFixedString(_value, _length, _code_page = kCodePage.upload) {
        const marker = parseEncodingMarker(_value);

        // se o texto tem o marcador =[{enc}]=:, usa o encoding do marcador
        // (quem manda é o usuário, não uma flag guardada); sem marcador,
        // usa o code page atual
        const cp = marker ? marker.encoding : _code_page;
        const text = marker ? marker.text : _value;

        let ansi = toAnsiCodePage(text, cp);
        if (ansi.length > _length) {
            // trunca no limite do caractere para cada code page suportado (não
            // corta multibyte no meio — evita byte inválido que o reload
            // normalizaria para '?');
            ansi = safeStringByCode(ansi.subarray(0, _length), cp);
            if (ansi.length == _length) {
                this.setBuffer(ansi);
                return;
            }
        }
        let b = new ansi.constructor(_length);
        b.set(ansi);
        this.setBuffer(b);
    }
}

const IFF_GROUP_ID = {
    CHARACTER: 1,
    PART: 2,
    CLUB: 3,
    CLUBSET: 4,
    BALL: 5,
    ITEM: 6,
    CADDIE: 7,
    CAD_ITEM: 8,
    SET_ITEM: 9,
    COURSE: 10,
    MATCH: 11,
    TITLE: 12,
    ENCHANT: 13,
    SKIN: 14,
    HAIR_STYLE: 15,
    MASCOT: 16,
    CHILDITEM: 17,
    FURNITURE: 18,
    ACHIEVEMENT: 19,
    COUNTER_ITEM: 27,
    AUX_PART: 28,
    QUEST_STUFF: 29,
    QUEST_ITEM: 30,
    CARD: 31
};

// mapa de referência da flag de ligação (flag_ligacao) do pack JP
// (tests/pangya_jp.iff) com valores corretos. O build KR (tests/pangya.iff)
// escreve 0xCCCC (lixo de debug do compilador vsc++) no lugar da flag real,
// o que quebra a lógica de relação (ex.: Desc.iff fica inativo porque a flag
// != 0). Ao carregar, se a flag lida for 0xCCCC, substituímos pelo valor
// deste mapa: 0 zera o campo, != 0 usa esse valor.
const kFlagLigacaoJP = {
    'Character.iff': 0,
    'Part.iff': 0,
    'Club.iff': 0,
    'ClubSet.iff': 0,
    'Ball.iff': 0,
    'Item.iff': 0,
    'Caddie.iff': 0,
    'CaddieItem.iff': 0,
    'SetItem.iff': 0,
    'Course.iff': 0,
    'Match.iff': 0,
    'Enchant.iff': 0,
    'Desc.iff': 0,
    'Skin.iff': 0,
    'HairStyle.iff': 0,
    'Mascot.iff': 0,
    'Achievement.iff': 0,
    'CounterItem.iff': 0,
    'AuxPart.iff': 0,
    'QuestStuff.iff': 0,
    'QuestItem.iff': 0,
    'Card.iff': 0,
    'Furniture.iff': 0,
    'CadieMagicBox.iff': 28749,
    'CadieMagicBoxRandom.iff': 57,
    'FurnitureAbility.iff': 57,
    'TikiRecipe.iff': 57,
    'TikiPointTable.iff': 57,
    'TikiSpecialTable.iff': 57,
    'CutinInfomation.iff': 57,
    'TimeLimitItem.iff': 57,
    'SpecialPrizeItem.iff': 57,
    'ShopLimitItem.iff': 57,
    'PointShop.iff': 57,
    'NonVisibleItemTable.iff': 57,
    'SubscriptionItemTable.iff': 57,
    'TwinsItemTable.iff': 57,
    'ScratchRewardSetting.iff': 57,
    'LevelUpPrizeItem.iff': 57,
    'ErrorCodeInfo.iff': 57,
    'ArtifactManaInfo.iff': 57,
    'Ability.iff': 57,
    'ClubSetWorkShopLevelUpProb.iff': 57,
    'ClubSetWorkShopLevelUpLimit.iff': 57,
    'ClubSetWorkShopRankUpExp.iff': 57,
    'AddonPart.iff': 57,
    'SetEffectTable.iff': 57,
    'GrandPrixData.iff': 57,
    'GrandPrixSpecialHole.iff': 57,
    'GrandPrixConditionEquip.iff': 57,
    'GrandPrixRankReward.iff': 57,
    'GrandPrixAIOptionalData.sff': 57,
    'HoleCupDropItem.iff': 57,
    'MemorialShopCoinItem.sff': 57,
    'MemorialShopRareItem.iff': 57,
    'CharacterMastery.iff': 57,
    'CaddieVoiceTable.iff': 57,
};

class IFF {
    name = '';
    length = 0;
    count_element = 0;
    flag_ligacao = 0;
    version = 13;
    elements = [];
    element_constructor = null;
    __original_flag_ligacao = null;

    static getHeadSize() {
        return 8;
    }

    cloneElement(_element) {
        const wb = new WriterBuffer(_element.getSize());

        _element.serialize(wb);

        const clone = new _element.constructor(ReaderBuffer.from(wb));

        clone.__new = true;
        clone.saveState();

        if (!clone.isTypeidUnique())
            return clone;

        const numInfo = getNewItemNumInfo(this.element_constructor, this.name);

        if (numInfo) {

            // duplicar preserva os bits de configuração do original
            // e usa o próximo número livre (sem colisão)
            const seen = new Set();

            for (const el of this.elements)
                if (el.typeid)
                    seen.add(el.typeid.value);

            let next = 0;

            do {
                next++;
                clone.typeid.value = buildNewTypeId(this, clone.typeid, { num: next }, numInfo).value;
            } while (seen.has(clone.typeid.value));
        } else if (clone.filter) {
            let filtered = this.elements.filter(clone.filter.bind(clone));

            if (filtered.length > 0)
            	clone.typeid.value = filtered.reduce((max, i) => Math.max(max, i.typeid.value), -Infinity) + 1;
        } else
            clone.typeid.value = this.elements.reduce((max, i) => Math.max(max, i.typeid.value), -Infinity) + 1;

        return clone;
    }

    newElement(_typeid) {
        const element = new (this.__regionCtor || this.element_constructor)();

        element.typeid.value = _typeid;
        element.__new = true;
        element.saveState();

        if (!element.isTypeidUnique())
            return element;

        // só recalcula se o typeid proposto já existe (colisão);
        // senão mantém o typeid montado (ex: modal com bits is_new/type/etc.)
        const typeidExists = this.elements.some(i => i.typeid.value === element.typeid.value);

        if (typeidExists) {

            if (element.filter) {
                let filtered = this.elements.filter(element.filter.bind(element));

                if (filtered.length > 0)
                    element.typeid.value = filtered.reduce((max, i) => Math.max(max, i.typeid.value), -Infinity) + 1;
            }else
                element.typeid.value = this.elements.reduce((max, i) => Math.max(max, i.typeid.value), -Infinity) + 1;
        }

       	if (this.element_constructor == Part)
       		element.position_mask.setSlot(Part.createTypeidbit(element.typeid.value).char_part_num, 1);

        return element;
    }

    deleteElement(_index) {
        this.elements[_index].__deleted = true;
    }

    undoDeletedElement(_index) {
        this.elements[_index].__deleted = false;
    }

    hasChange() {
        return this.hasModification() || this.hasNew() || this.hasDeletion() || this.hasFlagChange();
    }

    hasFlagChange() {
        return this.__original_flag_ligacao != null && this.flag_ligacao !== this.__original_flag_ligacao;
    }

    hasModification() {
        return this.elements.some(i => i.__modified);
    }

    hasNew() {
        return this.elements.some(i => i.__new);
    }

    hasDeletion() {
        return this.elements.some(i => i.__deleted);
    }

    rebuildCadieMagicBox() {
    	this.elements.sort((a, b) =>
    		a.setor.value - b.setor.value || a.seq.value - b.seq.value);

    	const valids = this.elements.filter(i => !i.__deleted && !i.__deleted2);

    	for (let i = 0; i < valids.length; i++)
    		valids[i].seq.value = i + 1;
    }

    constructor(_name, _data = undefined, _element_constructor = null) {
        this.name = _name;

        if (_data) {
            this.length = _data.length;
            this.element_constructor = _element_constructor;

            this.unserialize(_data);
        }
    }
    unserialize(_data) {
        this.elements = [];
        this.unserializeHead(_data.getBuffer(IFF.getHeadSize()));
        this.unserializeElements(_data.getBuffer(this.count_element * this.getElementSize()), this.version);
    }

    // igual ao unserialize, mas com yield por tempo para o overlay atualizar
    // e callback de progresso _on_progress(i + 1, total) a cada passo
    async unserializeAsync(_data, _on_progress = null) {
        this.unserializeHead(_data.getBuffer(IFF.getHeadSize()));

        const element_size = this.getElementSize();
        const variant = resolveRegionVariant(this.name, this.element_constructor, element_size, this.version);

        // variante de região (mesmo critério do unserializeElements)
        if (variant) {

            this.__region =
                variant.region;

            this.__regionCtor =
                variant.ctor;
        }

        const ElementCtor =
            variant ? variant.ctor : this.element_constructor;
        const total = this.count_element;
        const step = Math.max(1, Math.floor(total / 200));

        const data = _data.getBuffer(total * element_size);

        this.elements = [];

        let lastYield = Date.now();

        for (let i = 0; i < total; i++) {
            const element = ElementCtor
                ? new ElementCtor(data.getBuffer(element_size))
                : data.getBuffer(element_size);

            if (element.saveState)
                element.saveState();

            this.elements.push(element);

            if (_on_progress && (i % step === 0 || i === total - 1)) {
                _on_progress(i + 1, total);

                const now = Date.now();

                if (now - lastYield >= 50 && i < total - 1) {
                    await new Promise(resolve => requestAnimationFrame(() => resolve()));

                    lastYield = now;
                }
            }
        }
    }
    unserializeHead(_data) {
        this.count_element = _data.getUint16();
        this.flag_ligacao = _data.getUint16();
        this.version = _data.getUint32();
        this.__original_flag_ligacao = this.flag_ligacao;

        // sentinela de debug do build KR (0xCCCC = lixo de variável não
        // inicializada do compilador vsc++): substitui pela flag correta do
        // mapa de referência JP (0 zera, != 0 usa o valor não-zero)
        if (this.flag_ligacao === 0xCCCC && kFlagLigacaoJP[this.name] != null) {
            this.flag_ligacao = kFlagLigacaoJP[this.name];
            this.__original_flag_ligacao = this.flag_ligacao;
        }
    }
    unserializeElements(_data, _version) {
        const element_size = this.getElementSize();
        const variant = resolveRegionVariant(this.name, this.element_constructor, element_size, _version);

        // variante de região (ex.: US 852): guarda o construtor p/ o
        // newElement criar elementos novos no mesmo formato do arquivo
        if (variant) {

            this.__region =
                variant.region;

            this.__regionCtor =
                variant.ctor;
        }

        const ctor =
            variant ? variant.ctor : this.element_constructor;

        for (let i = 0; i < this.count_element; i++) {
            const element = ctor
                ? new ctor(_data.getBuffer(element_size))
                : _data.getBuffer(element_size);

            if (element.saveState)
                element.saveState();

            this.elements.push(element);
        }
    }
    serialize() {

        this.count_element = this.elements.reduce((acc, i) => acc += (!i.__deleted && !i.__deleted2 ? 1 : 0), 0);
        this.length = this.elements.reduce((acc, i) => acc + (i.__deleted || i.__deleted2 ? 0 : i.getSize()), 0) + IFF.getHeadSize();

        const wb = new WriterBuffer(this.length);

        this.serializeHead(wb);
        this.serializeElements(wb);

        return wb;
    }
    serializeHead(_data) {
        _data.setUint16(this.count_element);
        _data.setUint16(this.flag_ligacao);
        _data.setUint32(this.version);
    }
    serializeElements(_data) {
        this.elements.forEach(el => {
            if (el.__deleted || el.__deleted2)
                return;
            if (el instanceof ReaderBuffer)
                _data.setBuffer(el)
            else
                el.serialize(_data)
        });
    }
    getElementSize() {
        return (this.length - IFF.getHeadSize()) / this.count_element;
    }
}

// active do time_shop: ao ser alterado no toggle, sincroniza o period da
// mesma linha — habilitado quando o time_shop está ATIVO (1), desabilitado
// quando inativo (0). Vale para TODAS as classes com time_shop (Base e
// derivadas). _row é o row do time_shop setado no ShopDados.layout. O period
// agora é um input numérico (Int8Type — não mais select de enum).
class TimeShopActiveValue extends Int8Type {

    _row = null;

    constructor(_little_endian = true, _unsigned = true) {
        super(true, _little_endian, _unsigned);
    }

    onchange(_oldValue, _newValue) {

        const periodInput =
            this._row && this._row.querySelector('input[data-field="period"]');

        if (!periodInput)
            return;

        periodInput.disabled =
            this.value !== 1;
    }
}

class TimeShop {
    active = new TimeShopActiveValue(true, true);
    period = new Int8Type(false, true);

    constructor(_data = undefined) {
        if (_data)
            this.unserialize(_data.getBuffer(this.getSize()));
    }

    getSize() {
        return this.active.getSize() + this.period.getSize();
    }

    unserialize(_data) {
        this.active.unserialize(_data.getBuffer(this.active.getSize()));
        this.period.unserialize(_data.getBuffer(this.period.getSize()));
    }
    serialize(_data) {
        this.active.serialize(_data);
        this.period.serialize(_data);
    }
    layout(_parent) {
        this.active.layout(_parent, "active");
        this.period.layout(_parent, "period");
    }
}

function isTHRegionActive() {
    try {
        // gRegionApply é a fonte autoritativa quando definido (em load e em
        // converteIffsParaRegiao). O fallback só entra se nunca foi setado —
        // sem ele, durante a conversão TH->* o iff global ainda tem variantes
        // __region==='TH' e o elemento DESTINO era construído com layout TH.
        if (typeof gRegionApply !== 'undefined' && gRegionApply)
            return gRegionApply === 'TH';
        const list = (typeof iffs !== 'undefined' && iffs) ? iffs : [];
        return list.some(_i => _i && _i.__region === 'TH');
    } catch (_e) {
        return false;
    }
}

// TH (Fresh Up!, Tailândia, 829c): o flag_shop continua com 2 bytes no total,
// mas o type vira um bitfield de 2 bytes (Int16) onde cabem TODOS os bits.
// Ordem dos bits (type, 12 bits 0-11): is_cash, can_send_mail_and_personal_shop,
// can_dup, unknown(4), block_mail_and_personal_shop, is_saleable, is_giftable,
// only_display, unknown2. O icon é uma VISÃO dos mesmos 2 bytes (0 bytes extras)
// que só expõe is_new/is_hot nos bits 12/13 (deslocados por causa do unknown2).
// Como type e icon compartilham o MESMO _base Int16, ambos mascarram seu
// value/bits à sua faixa para não sobrescrever o do outro (nem no input do
// editor de bits, nem nos valores).
class FlagShopBitView extends BitfieldType {
    constructor(_base, _definition, _mask, _opts = {}) {
        super(_base, _definition);
        this._viewMask = _mask;
        this._ownsBytes = !!_opts.ownsBytes;
        // o icon reposiciona is_new/is_hot nos bits 12/13 do type compartilhado
        if (_opts.iconOffsets)
            this.groups.forEach((_g, _i) => { _g.offset = 12 + _i; });

        // os offsets foram remapeados: recalcula o total de bits usado
        this.totalBits =
            Math.max(...this.groups.map(_g => _g.offset + _g.bits));
    }
    getSize() {
        return this._ownsBytes ? this._base.getSize() : 0;
    }
    unserialize(_d) {
        // só o type (ownsBytes) lê/escreve os 2 bytes compartilhados
        if (this._ownsBytes)
            this._base.unserialize(_d);
    }
    serialize(_d) {
        if (this._ownsBytes)
            this._base.serialize(_d);
    }
    get value() {
        return Number(BigInt(this._base.value) & BigInt(this._viewMask));
    }
    set value(_value) {
        const cur = BigInt(this._base.value) & ~BigInt(this._viewMask);
        this._base.value = Number(
            cur | (BigInt(_value) & BigInt(this._viewMask))
        );
        this.updateLayout();
    }
    getBigValue() {
        return BigInt(this._base.value) & BigInt(this._viewMask);
    }
    setBigValue(_value) {
        this.value = Number(_value);
    }
}

class FlagShop {
    constructor(_data = undefined) {
        this._buildFields();
        if (_data)
            this.unserialize(_data.getBuffer(this.getSize()));
    }

    _buildFields() {
        if (isTHRegionActive()) {
            const base = new Int16Type(false, true);
            // type: bits 0-10 (is_cash..only_display); icon: bits 11/12
            this.type = new FlagShopBitView(
                base,
                {
                    is_cash: 1,
                    can_send_mail_and_personal_shop: 1,
                    can_dup: 1,
                    unknown: 4,
                    block_mail_and_personal_shop: 1,
                    is_saleable: 1,
                    is_giftable: 1,
                    only_display: 1,
                    unknown2: 1
                },
                0xFFF,
                { ownsBytes: true }
            );
            this.icon = new FlagShopBitView(
                base,
                {
                    is_new: 1,
                    is_hot: 1
                },
                0x3000,
                { iconOffsets: true }
            );
        } else {
            this.type = new BitfieldType(
                new Int8Type(false, true),
                {
                    is_cash: 1,
                    can_send_mail_and_personal_shop: 1,
                    can_dup: 1,
                    unknown: 1,
                    block_mail_and_personal_shop: 1,
                    is_saleable: 1,
                    is_giftable: 1,
                    only_display: 1
                }
            );
            this.icon = new BitfieldType(
                new Int8Type(false, true),
                {
                    is_new: 1,
                    is_hot: 1
                }
            );
        }
    }

    getSize() {
        return this.type.getSize() + this.icon.getSize();
    }

    unserialize(_data) {
        this.type.unserialize(_data.getBuffer(this.type.getSize()));
        this.icon.unserialize(_data.getBuffer(this.icon.getSize()));
    }
    serialize(_data) {
        this.type.serialize(_data);
        this.icon.serialize(_data);
    }
    layout(_parent) {
        this.type.layout(_parent, "type");
        this.icon.layout(_parent, "icon");
    }
}

class ShopDados {
    price = new Int32Type(false, true, true);
    sale_price = new Int32Type(false, true, true);
    sell_price = new Int32Type(false, true, true);
    flag_shop = new FlagShop();
    time_shop = new TimeShop();

    constructor(_data = undefined) {
        if (_data)
            this.unserialize(_data.getBuffer(this.getSize()));
    }

    getSize() {
        return this.price.getSize() + this.sale_price.getSize() + this.sell_price.getSize()
            + this.flag_shop.getSize() + this.time_shop.getSize();
    }

    unserialize(_data) {
        this.price.unserialize(_data.getBuffer(this.price.getSize()));
        this.sale_price.unserialize(_data.getBuffer(this.sale_price.getSize()));
        this.sell_price.unserialize(_data.getBuffer(this.sell_price.getSize()));
        this.flag_shop.unserialize(_data.getBuffer(this.flag_shop.getSize()));
        this.time_shop.unserialize(_data.getBuffer(this.time_shop.getSize()));
    }
    serialize(_data) {
        this.price.serialize(_data);
        this.sale_price.serialize(_data);
        this.sell_price.serialize(_data);
        this.flag_shop.serialize(_data);
        this.time_shop.serialize(_data);
    }
    layout(_parent) {
        this.flag_shop.type._pangListeners = [];

        const priceFields = [
            { name: "price", field: this.price },
            { name: "sale_price", field: this.sale_price },
            { name: "sell_price", field: this.sell_price }
        ];

        const curLabels = [];

        for (const _pf of priceFields) {

            _pf.field.layout(_parent, _pf.name);

            const wrap = _pf.field._layoutWrap;

            if (wrap) {

                wrap.classList.add("price-input-wrap");

                const toggleRoot =
                    wrap.querySelector('.iff-toggle');

                let prefix = wrap.querySelector('.price-prefix');

                if (!prefix) {
                    const toggleRoot =
                        wrap.querySelector('.iff-toggle');

                    prefix = document.createElement("span");
                    prefix.className = "price-prefix";

                    if (toggleRoot)
                        prefix.appendChild(toggleRoot);

                    const sep = document.createElement("span");
                    sep.className = "price-sep";
                    sep.textContent = "|";
                    prefix.appendChild(sep);

                    const label = document.createElement("button");
                    label.type = "button";
                    label.className = "price-cur";
                    label.addEventListener('click', () => {
                        this.flag_shop.type.is_cash =
                            this.flag_shop.type.is_cash === 1 ? 0 : 1;
                    });
                    prefix.appendChild(label);

                    const inputEl =
                        wrap.querySelector('input[type="text"]');

                    if (inputEl)
                        wrap.insertBefore(prefix, inputEl);
                    else
                        wrap.appendChild(prefix);
                }

                const labelEl =
                    wrap.querySelector('.price-cur');

                if (labelEl)
                    curLabels.push(labelEl);
            }
        }

        const updateCurLabels = () => {

            const isCash =
                this.flag_shop.type.is_cash === 1;

            for (const label of curLabels) {

                label.textContent = isCash ? "cash" : "pang";
                label.classList.toggle("cash", isCash);
                label.classList.toggle("pang", !isCash);
            }
        };

        updateCurLabels();

        // atualiza a cor do preço em tempo real quando o is_cash muda
        // (o bit é editado no modal do bitfield, que dispara onchange)
        this.flag_shop.type.addPangCashListener(updateCurLabels);

        // flag_shop na mesma linha do type/icon, como o time_shop
        const flagShopRow = document.createElement("div");
        flagShopRow.className = "array-field-row";

        const flagShopTitle = document.createElement("span");
        flagShopTitle.className = "type-label";
        flagShopTitle.textContent = "flag_shop: ";
        flagShopRow.appendChild(flagShopTitle);

        this.flag_shop.type.layout(flagShopRow, "type");
        this.flag_shop.icon.layout(flagShopRow, "icon");

        _parent.appendChild(flagShopRow);

        const timeShopRow = document.createElement("div");
        timeShopRow.className = "array-field-row";

        const timeShopTitle = document.createElement("span");
        timeShopTitle.className = "type-label";
        timeShopTitle.textContent = "time_shop: ";
        timeShopRow.appendChild(timeShopTitle);

        // o row fica setado no active p/ o onchange sincronizar o period
        this.time_shop.active._row = timeShopRow;

        this.time_shop.active.layout(timeShopRow, "active");
        this.time_shop.period.layout(timeShopRow, "period");

        _parent.appendChild(timeShopRow);

        // period: habilitado com time_shop ativo (1), desabilitado sem (0) —
        // válido para todas as classes com time_shop; no Item só muda via typeid.
        // O period é Int8Type (input numérico, não mais select de enum).
        const periodInput =
            timeShopRow.querySelector('input[data-field="period"]');

        if (periodInput) {

            const activeVal =
                this.time_shop.active.value;

            periodInput.disabled = activeVal !== 1;
        }
    }
}

class TikiShopDados {
    qnt_per_tiki_pts = new Int32Type(false, true, true);
    tiki_pts = new Int32Type(false, true, true);
    milage_pts = new Int16Type(false, true, true);
    bonus_prob = new Int16Type(false, true, true);
    bonus = Array(2).fill(0).map(_ => new Int16Type(false, true, true));
    tipo_tiki_shop = new Int32Type(false, true, true);
    tiki_pang = new Int32Type(false, true, true);

    constructor(_data = undefined) {
        if (_data)
            this.unserialize(_data.getBuffer(TikiShopDados.getSize()));
    }

    getSize() {
        return this.qnt_per_tiki_pts.getSize() + this.tiki_pts.getSize() + this.milage_pts.getSize()
            + this.bonus_prob.getSize() + this.bonus.reduce((acc, v) => acc + v.getSize(), 0)
            + this.tipo_tiki_shop.getSize() + this.tiki_pang.getSize();
    }

    unserialize(_data) {
        this.qnt_per_tiki_pts.unserialize(_data.getBuffer(this.qnt_per_tiki_pts.getSize()));
        this.tiki_pts.unserialize(_data.getBuffer(this.tiki_pts.getSize()));
        this.milage_pts.unserialize(_data.getBuffer(this.milage_pts.getSize()));
        this.bonus_prob.unserialize(_data.getBuffer(this.bonus_prob.getSize()));
        this.bonus.forEach(v => v.unserialize(_data.getBuffer(v.getSize())));
        this.tipo_tiki_shop.unserialize(_data.getBuffer(this.tipo_tiki_shop.getSize()));
        this.tiki_pang.unserialize(_data.getBuffer(this.tiki_pang.getSize()));
    }
    serialize(_data) {
        this.qnt_per_tiki_pts.serialize(_data);
        this.tiki_pts.serialize(_data);
        this.milage_pts.serialize(_data);
        this.bonus_prob.serialize(_data);
        this.bonus.forEach(v => v.serialize(_data));
        this.tipo_tiki_shop.serialize(_data);
        this.tiki_pang.serialize(_data);
    }
    isActived() {
        return (this.tipo_tiki_shop.value == 1 || this.tipo_tiki_shop.value == 2 || this.tipo_tiki_shop.value == 3) && this.tiki_pang.value > 0 && this.milage_pts.value > 0;
    }
    layout(_parent) {
        this.qnt_per_tiki_pts.layout(_parent, "qnt_per_tiki_pts");
        this.tiki_pts.layout(_parent, "tiki_pts");
        this.milage_pts.layout(_parent, "milage_pts");
        this.bonus_prob.layout(_parent, "bonus_prob");
        this.tipo_tiki_shop.layout(_parent, "tipo_tiki_shop");
        this.tiki_pang.layout(_parent, "tiki_pang");

        _parent.appendChild(arrayLayout(this.bonus, "bonus"));
    }
}

class SYSTEMTIME {
    wYear = new Int16Type(false, true, true);
    wMonth = new Int16Type(false, true, true);
    wDayOfWeek = new Int16Type(false, true, true);
    wDay = new Int16Type(false, true, true);
    wHour = new Int16Type(false, true, true);
    wMinute = new Int16Type(false, true, true);
    wSecond = new Int16Type(false, true, true);
    wMilliseconds = new Int16Type(false, true, true);

    is_only_date = false;
    is_only_time = false;
    // só-tempo preenche a hora zero (00:00:00 é valor válido e aparece
    // preenchido). Usado SÓ no layout do item (open/start/end do GrandPrixData)
    // — o picker do FILTRO começa limpo e o botão limpar deixa o campo vazio
    // para não parecer que já está filtrando
    fill_zero_time = false;

    static from(_data) {
        if (_data instanceof ArrayBuffer || _data instanceof Uint8Array)
            return new SYSTEMTIME(ReaderBuffer.from(_data));
        if (_data instanceof Date) {
            const st = new SYSTEMTIME();
            st.wYear.value = _data.getFullYear();
            st.wMonth.value = _data.getMonth() + 1;
            st.wDayOfWeek.value = _data.getDay();
            st.wDay.value = _data.getDate();
            st.wHour.value = _data.getHours();
            st.wMinute.value = _data.getMinutes();
            st.wSecond.value = _data.getSeconds();
            st.wMilliseconds.value = _data.getMilliseconds();
            return st;
        }
        return new SYSTEMTIME(_data);
    }

    constructor(_data = undefined, _opt = {}) {
        _opt = { is_only_date: false, is_only_time: false, ..._opt };

        if (_opt) {
            this.is_only_date = _opt.is_only_date;
            this.is_only_time = _opt.is_only_time;
            this.fill_zero_time = !!_opt.fill_zero_time;
        }

        if (_data)
            this.unserialize(_data.getBuffer(this.getSize()));
    }

    getSize() {
        return this.wYear.getSize() + this.wMonth.getSize() + this.wDayOfWeek.getSize() + this.wDay.getSize()
            + this.wHour.getSize() + this.wMinute.getSize() + this.wSecond.getSize() + this.wMilliseconds.getSize();
    }

    unserialize(_data) {
        this.wYear.unserialize(_data.getBuffer(this.wYear.getSize()));
        this.wMonth.unserialize(_data.getBuffer(this.wMonth.getSize()));
        this.wDayOfWeek.unserialize(_data.getBuffer(this.wDayOfWeek.getSize()));
        this.wDay.unserialize(_data.getBuffer(this.wDay.getSize()));
        this.wHour.unserialize(_data.getBuffer(this.wHour.getSize()));
        this.wMinute.unserialize(_data.getBuffer(this.wMinute.getSize()));
        this.wSecond.unserialize(_data.getBuffer(this.wSecond.getSize()));
        this.wMilliseconds.unserialize(_data.getBuffer(this.wMilliseconds.getSize()));
    }
    serialize(_data) {
        this.wYear.serialize(_data);
        this.wMonth.serialize(_data);
        this.wDayOfWeek.serialize(_data);
        this.wDay.serialize(_data);
        this.wHour.serialize(_data);
        this.wMinute.serialize(_data);
        this.wSecond.serialize(_data);
        this.wMilliseconds.serialize(_data);
    }
    isEmpty() {
        return this.wYear.value == 0 && this.wMonth.value == 0 && this.wDayOfWeek.value == 0
            && this.wDay.value == 0 && this.wHour.value == 0 && this.wMinute.value == 0
            && this.wSecond.value == 0 && this.wMilliseconds.value == 0;
    }
    getDate() {
        return new Date(
            this.wYear.value,
            this.wMonth.value - 1,
            this.wDay.value,
            this.wHour.value,
            this.wMinute.value,
            this.wSecond.value,
            this.wMilliseconds.value
        );
    }
    layout(_parent) {
        const wrap = document.createElement('div');
        wrap.className = 'date-input-wrap';

        const di = document.createElement('input');
        di.type = 'text';

        wrap.appendChild(di);
        _parent.appendChild(wrap);

        let defaultFormat = 'd/m/Y H:i:S';

        if (this.is_only_date || this.is_only_time)
            defaultFormat = this.is_only_date ? 'd/m/Y' : 'H:i:S';

        di.placeholder = this.is_only_time ? 'hh:mm:ss' : this.is_only_date ? 'dd/mm/aaaa' : 'dd/mm/aaaa hh:mm:ss';

        const writeFromDate = _date => {
            this.wYear.value = _date.getFullYear();
            this.wMonth.value = _date.getMonth() + 1;
            this.wDayOfWeek.value = _date.getDay();
            this.wDay.value = _date.getDate();
            this.wHour.value = _date.getHours();
            this.wMinute.value = _date.getMinutes();
            this.wSecond.value = _date.getSeconds();
            this.wMilliseconds.value = _date.getMilliseconds();
        };

        const clearFields = () => {
            for (const k of ['wYear', 'wMonth', 'wDayOfWeek', 'wDay', 'wHour', 'wMinute', 'wSecond', 'wMilliseconds'])
                this[k].value = 0;
        };

        const syncBtn = () => {
            const empty = di.value === '';
            wrap.classList.toggle('has-value', !empty);
            clearBtn.style.display = empty ? 'none' : '';
        };

        const notifyChange = () => {
            di.dispatchEvent(new Event('change', { bubbles: true }));
        };

        // data completa: campos zerados = campo vazio (input em branco).
        // só-tempo COM fill_zero_time (layout do item): 00:00:00 é hora VÁLIDA
        // e aparece preenchida — o picker nasce com a hora zero em vez de
        // vazio. O picker do filtro (só-tempo sem a flag) nasce LIMPO
        let defaultDate = null;

        if (!this.isEmpty())
            defaultDate = this.getDate();
        else if (this.is_only_time && this.fill_zero_time) {

            defaultDate =
                new Date();

            defaultDate.setHours(0, 0, 0, 0);
        }

        flatpickr(di, {
            enableTime: !this.is_only_date,
            noCalendar: this.is_only_time,
            enableSeconds: true,
            time_24hr: true,
            dateFormat: defaultFormat,
            defaultDate: defaultDate,
            onChange: (_d, _s, _fp) => {
                if (_d && _d.length > 0)
                    writeFromDate(_d[0]);

                di.value = _fp.input.value;
                syncBtn();
                notifyChange();
            }
        });

        di.setAttribute('autocomplete', 'off');

        // botão para limpar a data dentro do input (lado direito, só quando há data)
        const clearBtn = document.createElement('button');
        clearBtn.type = 'button';
        clearBtn.className = 'date-clear-btn';
        clearBtn.title = 'Limpar data';
        clearBtn.innerHTML = '&#10005;';
        clearBtn.addEventListener('click', evt => {
            if (!di._flatpickr)
                return;

            di._flatpickr.clear();

            clearFields();

            // só-tempo com fill_zero_time (layout do item): limpar volta para
            // a hora zero preenchida (não fica em branco); setDate com false
            // NÃO dispara o onChange — os campos continuam zerados (o ano/mês/
            // dia de hoje não vaza p/ eles). No filtro o campo limpa de verdade
            if (this.is_only_time && this.fill_zero_time) {

                const zero =
                    new Date();

                zero.setHours(0, 0, 0, 0);

                di._flatpickr.setDate(zero, false);
            } else
                di.value = '';

            syncBtn();
            notifyChange();
            evt.stopPropagation();
        });
        wrap.appendChild(clearBtn);

        syncBtn();

        onElementRemovedFrom(_parent, di, () => {
            di._flatpickr.destroy();
        });
    }
}

// active_date do DateDados: ao ser alterado no toggle, sincroniza o bloqueio
// dos inputs date — habilitados quando active_date está ATIVO (1),
// desabilitados quando inativo (0). Vale para todas as classes Base.
// _group é o grupo do array date setado no DateDados.layout.
class DateDadosActiveValue extends Int32Type {

    _group = null;

    constructor(_little_endian = true, _unsigned = true) {
        super(true, _little_endian, _unsigned);
    }

    _syncDates() {

        if (!this._group)
            return;

        const disabled =
            this.value !== 1;

        // passo duplo (só busca encadeada p/ ser compatível também com o
        // querySelectorAll simples do domstub): acha cada wrap, seu input e o
        // botão de limpar (o clear também é bloqueado quando o grupo está
        // inativo — não dá pra limpar uma data desabilitada)
        this._group.querySelectorAll('.date-input-wrap').forEach(wrap => {

            const inp =
                wrap.querySelector('input[type="text"]');

            if (inp)
                inp.disabled = disabled;

            const clearBtn =
                wrap.querySelector('.date-clear-btn');

            if (clearBtn)
                clearBtn.disabled = disabled;
        });
    }

    onchange(_oldValue, _newValue) {
        this._syncDates();
    }
}

class DateDados {
    active_date = new DateDadosActiveValue(true, true);
    date = Array(2).fill(0).map(_ => new SYSTEMTIME());

    constructor(_data = undefined) {
        if (_data)
            this.unserialize(_data.getBuffer(this.getSize()));
    }

    getSize() {
        return this.active_date.getSize() + this.date.reduce((acc, v) => acc + v.getSize(), 0);
    }

    unserialize(_data) {
        this.active_date.unserialize(_data.getBuffer(this.active_date.getSize()));
        this.date.forEach(v => v.unserialize(_data.getBuffer(v.getSize())));
    }
    serialize(_data) {
        this.active_date.serialize(_data);
        this.date.forEach(v => v.serialize(_data));
    }
    layout(_parent) {
        this.active_date.layout(_parent, "active_date");

        const dateGroup =
            arrayLayout(this.date, "date");

        _parent.appendChild(dateGroup);

        // o grupo do array date é referência p/ o onchange sincronizar os
        // inputs (habilitados quando active_date=1, desabilitados quando 0) —
        // e aplica o estado inicial sem depender de clique
        this.active_date._group = dateGroup;
        this.active_date._syncDates();
    }
}

class enLEVEL {
    static ROOKIE_F = 0;
    static ROOKIE_E = 1;
    static ROOKIE_D = 2;
    static ROOKIE_C = 3;
    static ROOKIE_B = 4;
    static ROOKIE_A = 5;
    static BEGINNER_E = 6;
    static BEGINNER_D = 7;
    static BEGINNER_C = 8;
    static BEGINNER_B = 9;
    static BEGINNER_A = 10;
    static JUNIOR_E = 11;
    static JUNIOR_D = 12;
    static JUNIOR_C = 13;
    static JUNIOR_B = 14;
    static JUNIOR_A = 15;
    static SENIOR_E = 16;
    static SENIOR_D = 17;
    static SENIOR_C = 18;
    static SENIOR_B = 19;
    static SENIOR_A = 20;
    static AMADOR_E = 21;
    static AMADOR_D = 22;
    static AMADOR_C = 23;
    static AMADOR_B = 24;
    static AMADOR_A = 25;
    static SEMI_PRO_E = 26;
    static SEMI_PRO_D = 27;
    static SEMI_PRO_C = 28;
    static SEMI_PRO_B = 29;
    static SEMI_PRO_A = 30;
    static PRO_E = 31;
    static PRO_D = 32;
    static PRO_C = 33;
    static PRO_B = 34;
    static PRO_A = 35;
    static NACIONAL_E = 36;
    static NACIONAL_D = 37;
    static NACIONAL_C = 38;
    static NACIONAL_B = 39;
    static NACIONAL_A = 40;
    static WORLD_PRO_E = 41;
    static WORLD_PRO_D = 42;
    static WORLD_PRO_C = 43;
    static WORLD_PRO_B = 44;
    static WORLD_PRO_A = 45;
    static MESTRE_E = 46;
    static MESTRE_D = 47;
    static MESTRE_C = 48;
    static MESTRE_B = 49;
    static MESTRE_A = 50;
    static TOP_MASTER_V = 51;
    static TOP_MASTER_IV = 52;
    static TOP_MASTER_III = 53;
    static TOP_MASTER_II = 54;
    static TOP_MASTER_I = 55;
    static WORLD_MASTER_V = 56;
    static WORLD_MASTER_IV = 57;
    static WORLD_MASTER_III = 58;
    static WORLD_MASTER_II = 59;
    static WORLD_MASTER_I = 60;
    static LEGEND_V = 61;
    static LEGEND_IV = 62;
    static LEGEND_III = 63;
    static LEGEND_II = 64;
    static LEGEND_I = 65;
    static INFINIT_LEGEND_V = 66;
    static INFINIT_LEGEND_IV = 67;
    static INFINIT_LEGEND_III = 68;
    static INFINIT_LEGEND_II = 69;
    static INFINIT_LEGEND_I = 70;

    static getName(_value) {
        return Object.entries(enLEVEL).find(([, v]) => v === _value)?.[0];
    }

    static getValue(_name) {
        return enLEVEL[_name];
    }
}

// Tipos numéricos que representam um valor de enum (enLEVEL, PartType...):
// layout com select das opções do enum em vez de input text
function createEnumValueType(_baseType, _enum) {
    return class extends _baseType {
        layout(_parent, _name = this.name) {
            let container = _parent;

            if (_name) {
                container =
                    document.createElement("div");

                container.className =
                    "field-col";

                let label =
                    document.createElement("span");

                label.className =
                    "type-label";

                label.textContent =
                    _name + ": ";

                container.appendChild(label);

                _parent.appendChild(container);
            }

            const select =
                document.createElement('select');

            select.className =
                'form-select level-select';

            if (_name)
                select.dataset.field = _name;

            // enum concreto usado nas opções: enums com resolução por tipo
            // (ex.: CardEfeitoType — o select do efeito.type usa o enum do
            // tipo do typeid da carta, `forType(this._groupCtx)` — o _groupCtx
            // é setado no layout do Card antes de montar o efeito, e o change
            // do typeid re-renderiza o layout (app.js) trocando o enum)
            const enumObj =
                typeof _enum.forType === 'function'
                    ? _enum.forType(this._groupCtx)
                    : _enum;

            for (const [name, value] of Object.entries(enumObj)) {
                if (typeof value !== 'number')
                    continue;

                let opt =
                    document.createElement('option');

                opt.value = value;
                opt.textContent =
                    enumObj.__indexLabel
                        ? value + ' — ' + name
                        : name;

                select.appendChild(opt);
            }

            // valor atual fora do enum concreto (ex.: card SPECIAL com efeito
            // que não existe no enum do tipo novo após editar o typeid):
            // vira opção crua p/ o select nunca ficar vazio/zerado (enums com
            // __allowExtra tratam a opção crua no próprio bloco, abaixo)
            if (_enum.__allowExtra !== true
                    && (enumObj.getName
                        ? enumObj.getName(this.value) === undefined
                        : !Object.values(enumObj).includes(Number(this.value)))) {
                const opt =
                    document.createElement('option');

                opt.value = this.value;
                opt.textContent = String(this.value);

                select.appendChild(opt);
            }

            select.value = this.value;

            // valor armazenado pode ser um valor do enum mascarado pela largura
            // do tipo (ex.: ONE_YEAR=365 do TimeShopPeriod no Int8 vira 109):
            // sem opção com o valor cru, seleciona a opção que bate no nome —
            // o getName do enum CONCRETO (por tipo, via forType — ex.: o
            // CardEfeitoType resolve o enum do typeid; se não tiver nome, o
            // valor cru já virou opção acima)
            if (!select.value && enumObj.getName && enumObj.getName(this.value) !== undefined) {

                const opt =
                    [...select.options].find(o => o.textContent === enumObj.getName(this.value));

                if (opt)
                    opt.selected = true;
            }

            // o "__extra" não é valor do campo — só o listener abaixo trata
            select.addEventListener('change', evt => {

                if (evt.target.value === '__extra')
                    return;

                this.value = Number(evt.target.value);
            });

            // enum com __allowExtra (ex.: CardVolume — valores entre 5 e 100):
            // o select SEMPRE tem as opções conhecidas + a ÚLTIMA opção
            // "__extra" ("Outro (valor fora da lista)…") que, ao ser escolhida,
            // troca o select por um input p/ digitar o valor fora da lista
            // (mesmo padrão do modal do Match e da cor do HairStyle); valor
            // atual fora do enum vira a opção crua pré-selecionada
            if (_enum.__allowExtra === true) {

                if (!Object.values(_enum).includes(Number(this.value))) {

                    const raw =
                        document.createElement('option');

                    raw.value = this.value;
                    raw.textContent = String(this.value) + ' — (fora da lista)';

                    select.appendChild(raw);
                }

                const extra =
                    document.createElement('option');

                extra.value = '__extra';
                extra.textContent = 'Outro (valor fora da lista)…';

                select.appendChild(extra);

                // sempre aplica o valor atual (mesmo dentro do enum, ex.:
                // UCC_EVENT=2) — o <select> já tem a 1ª opção selecionada por
                // padrão, então o teste `!select.value` nunca era verdadeiro
                // para valores fora da lista (ex.: 9) e o widget ficava NONE
                select.value = String(this.value);

                select.addEventListener('change', () => {

                    if (select.value !== '__extra')
                        return;

                    destroyChoices(select);

                    const wrap =
                        select.parentElement || select.parent;

                    if (!wrap)
                        return;

                    const input =
                        document.createElement('input');

                    input.type = 'text';
                    input.className = 'form-control';
                    input.placeholder = 'Valor fora da lista';
                    input.value =
                        String(Number(this.value) || 0);

                    input.addEventListener('change', () => {

                        const n = Number(input.value);

                        if (!Number.isFinite(n))
                            return;

                        const v =
                            Math.trunc(n) || 0;

                        if (v !== this.value)
                            this.value = v;
                    });

                    wrap.replaceChild(input, select);

                    input.focus();
                });
            }

            container.appendChild(select);

            // widget do Choices no browser real; sem Choices (tests unit com
            // domstub) o select nativo continua a UI. O makeChoices sincroniza
            // o widget com o valor nativo (inclui valor fora do enum → opção
            // crua pré-selecionada)
            makeChoices(select);
        }
    };
}

const LevelValue32 = createEnumValueType(Int32Type, enLEVEL);
const LevelValue16 = createEnumValueType(Int16Type, enLEVEL);
const LevelValue8 = createEnumValueType(Int8Type, enLEVEL);

class LevelBitfield extends BitfieldType {
    constructor() {
        super(
            new Int8Type(false, true),
            {
                level: 7,
                is_max: 1
            }
        );
    }

    get level() {
        return this.getGroupValue(this.groups[0]);
    }
    get is_max() {
        return this.getGroupValue(this.groups[1]);
    }
    set level(_level) {
        this.setGroupValue(this.groups[0], _level);
    }
    set is_max(_is_max) {
        this.setGroupValue(this.groups[1], _is_max);
    }

    layout(_parent, _name = this.name) {

        let container =
            document.createElement("div");

        container.className =
            "bitfield-layout level-layout";

        container.style.display =
            "flex";

        container.style.alignItems =
            "center";

        container.style.gap =
            "8px";

        // seletor com os níveis do enLEVEL
        let select =
            document.createElement("select");

        select.className =
            "form-select level-select";

        for (const [name, value] of Object.entries(enLEVEL)) {
            if (typeof value !== 'number')
                continue;

            let opt =
                document.createElement("option");

            opt.value = value;
            opt.textContent = name;

            select.appendChild(opt);
        }

        select.value = this.level;

        select.addEventListener('change', evt => {
            this.level = Number(evt.target.value);
        });

        container.appendChild(select);

        // widget do Choices no browser real (dropdown flipado, sem o popup
        // nativo do <select> que saía da janela); sem Choices (tests unit com
        // domstub) o select nativo continua a UI
        makeChoices(select);

        // is_max
        let checkDiv =
            document.createElement("div");

        checkDiv.className =
            "bitfield-group-check";

        checkDiv.style.display =
            "flex";

        checkDiv.style.alignItems =
            "center";

        const tgl =
            buildToggleSwitch({
                name: "is_max",
                checked: this.is_max === 1,
                inputClass: "form-check-input is-max-check",
                onChange: (_evt, input) => {
                    this.is_max = input.checked ? 1 : 0;
                }
            });

        checkDiv.appendChild(tgl.root);

        container.appendChild(checkDiv);

        _parent.appendChild(container);
    }
}

class Level {
    levelbit = new LevelBitfield()

    get level() {
        return this.levelbit.level;
    }
    get is_max() {
        return this.levelbit.is_max;
    }
    get value() {
        return this.levelbit.value;
    }

    set level(_level) {
        this.levelbit.level = _level;
    }
    set is_max(_is_max) {
        this.levelbit.is_max = _is_max;
    }
    set value(_value) {
        this.levelbit.value = _value;
    }
    
    constructor(_data = undefined) {
        if (_data)
            this.unserialize(_data.getBuffer(this.getSize()));
    }

    getSize() {
        return this.levelbit.getSize();
    }

    unserialize(_data) {
        this.levelbit.unserialize(_data.getBuffer(this.levelbit.getSize()));
    }
    serialize(_data) {
        this.levelbit.serialize(_data);
    }
    goodLevel(_level) {
        if (this.is_max && _level <= this.level)
            return true;
        else if (!this.is_max && _level >= this.level)
            return true;
        return false;
    }
    getName() {
        return enLEVEL.getName(this.level) ?? this.level;
    }
    layout(_parent) {
        this.levelbit.layout(_parent, "levelbit");
    }
}

class BaseTypeidUnique {
    __modified = false;
    __new = false;
    __deleted = false;
    __deleted2 = false;
    __hide = false;
    __original = null;

    isTypeidUnique() {
        return true;
    }

    saveState() {

        if (typeof this.serialize !== 'function' || typeof this.unserialize !== 'function')
            return;

        const wb = new WriterBuffer(this.getSize());

        this.serialize(wb);

        this.__original = wb.data.slice();
    }

    restoreState() {

        if (this.__original == null)
            return;

        this.unserialize(ReaderBuffer.from(new Uint8Array(this.__original)));

        this.__modified = false;
    }

    layout(_parent) {
        // pure virtual, faz nada aqui, só para ter um função base
    }
}

class Base extends BaseTypeidUnique {
    active = new Int32Type(true, true, true);
    typeid = new Int32Type(false, true, true);
    name = new StringType(64, StringTypeRelation.TEXT);
    level = new Level();
    icon = new StringType(43, StringTypeRelation.ASSET.ICON);
    shop = new ShopDados();
    tiki = new TikiShopDados();
    date = new DateDados();

    constructor() {
        super();
    }

    getSize() {
        return this.active.getSize() + this.typeid.getSize() + this.name.getSize()
            + this.level.getSize() + this.icon.getSize() + this.shop.getSize()
            + this.tiki.getSize() + this.date.getSize();
    }

    unserialize(_data) {
        this.active.unserialize(_data.getBuffer(this.active.getSize()));
        this.typeid.unserialize(_data.getBuffer(this.typeid.getSize()));
        this.name.unserialize(_data.getBuffer(this.name.getSize()));
        this.level.unserialize(_data.getBuffer(this.level.getSize()));
        this.icon.unserialize(_data.getBuffer(this.icon.getSize()));
        this.shop.unserialize(_data.getBuffer(this.shop.getSize()));
        this.tiki.unserialize(_data.getBuffer(this.tiki.getSize()));
        this.date.unserialize(_data.getBuffer(this.date.getSize()));
    }
    serialize(_data) {
        this.active.serialize(_data);
        this.typeid.serialize(_data);
        this.name.serialize(_data);
        this.level.serialize(_data);
        this.icon.serialize(_data);
        this.shop.serialize(_data);
        this.tiki.serialize(_data);
        this.date.serialize(_data);
    }
    getIdentifyName() {
        return `${this.typeid.value.toString(16)} ${this.name.value}`;
    }
    layout(_parent) {
        this.active.layout(_parent, "active");
        this.typeid.layout(_parent, "typeid");
        this.name.layout(_parent, "name");
        this.icon.layout(_parent, "icon");
        classLayout(_parent, "level", this.level);
        classLayout(_parent, "shop", this.shop);
        classLayout(_parent, "tiki", this.tiki);
        classLayout(_parent, "date", this.date);
    }
}

// Base "full name": igual ao Base, mas com name tendo o tamanho restante do
// Base (Base.getSize() - active - typeid) em vez de 64 — suporta nomes longos
// (ex.: QuestStuff/QuestItem/CounterItem do pack KR, cujo buffer de name é 160
// bytes). Mantém active/typeid/name e descarta level/icon/shop/tiki/date (que
// esses 3 iffs não usam de fato). O tamanho total do elemento fica IGUAL ao do
// Base (name absorve os bytes que seriam level/icon/shop/tiki/date), então o
// roundtrip é byte-exact.
const kBaseFullNameNameSize = new Base().getSize() - 8;

class BaseFullName extends BaseTypeidUnique {
    active = new Int32Type(true, true, true);
    typeid = new Int32Type(false, true, true);
    name = new StringType(kBaseFullNameNameSize, StringTypeRelation.TEXT);

    constructor() {
        super();
    }

    getSize() {
        return this.active.getSize() + this.typeid.getSize() + this.name.getSize();
    }

    unserialize(_data) {
        this.active.unserialize(_data.getBuffer(this.active.getSize()));
        this.typeid.unserialize(_data.getBuffer(this.typeid.getSize()));
        this.name.unserialize(_data.getBuffer(this.name.getSize()));
    }

    serialize(_data) {
        this.active.serialize(_data);
        this.typeid.serialize(_data);
        this.name.serialize(_data);
    }

    getIdentifyName() {
        return `${this.typeid.value.toString(16)} ${this.name.value}`;
    }

    layout(_parent) {
        this.active.layout(_parent, "active");
        this.typeid.layout(_parent, "typeid");
        this.name.layout(_parent, "name");
    }
}

class Character extends Base {
    mpet = new StringType(40, StringTypeRelation.ASSET.MODEL);
    hairTex = new StringType(40, StringTypeRelation.ASSET.TEXTURE);
    shirtsTex = new StringType(40, StringTypeRelation.ASSET.TEXTURE);
    faceTex = new StringType(40, StringTypeRelation.ASSET.TEXTURE);
    c = Array(5).fill(0).map(_ => new Int16Type(false, true, true));
    num_parts = new Int8Type(false, true);
    num_accessorios = new Int8Type(false, true);
    club_type = new Int32Type(false, true, true);
    scale_club_set = new FloatType();
    c_stat = Array(5).fill(0).map(_ => new Int8Type(false, true));
    mtn_tourney_winner = new StringType(43, StringTypeRelation.TEXT_NO_TRANSLATE);

    static generateTypeid() {
        return IFF_GROUP_ID.CHARACTER << 26;
    }

    filter(_element) {
        return (this.typeid.value >> 26) == (_element.typeid.value >> 26);
    }

    constructor(_data = undefined) {
        super();
        if (_data)
            this.unserialize(_data.getBuffer(this.getSize()));
    }

    getSize() {
        return super.getSize() + this.mpet.getSize() + this.hairTex.getSize() + this.shirtsTex.getSize() + this.faceTex.getSize()
            + this.c.reduce((acc, v) => acc + v.getSize(), 0) + this.num_parts.getSize() + this.num_accessorios.getSize()
            + this.club_type.getSize() + this.scale_club_set.getSize() + this.c_stat.reduce((acc, v) => acc + v.getSize(), 0)
            + this.mtn_tourney_winner.getSize();
    }

    unserialize(_data) {
        super.unserialize(_data.getBuffer(super.getSize()));
        this.mpet.unserialize(_data.getBuffer(this.mpet.getSize()));
        this.hairTex.unserialize(_data.getBuffer(this.hairTex.getSize()));
        this.shirtsTex.unserialize(_data.getBuffer(this.shirtsTex.getSize()));
        this.faceTex.unserialize(_data.getBuffer(this.faceTex.getSize()));
        this.c.forEach(v => v.unserialize(_data.getBuffer(v.getSize())));
        this.num_parts.unserialize(_data.getBuffer(this.num_parts.getSize()));
        this.num_accessorios.unserialize(_data.getBuffer(this.num_accessorios.getSize()));
        this.club_type.unserialize(_data.getBuffer(this.club_type.getSize()));
        this.scale_club_set.unserialize(_data.getBuffer(this.scale_club_set.getSize()));
        this.c_stat.forEach(v => v.unserialize(_data.getBuffer(v.getSize())));
        this.mtn_tourney_winner.unserialize(_data.getBuffer(this.mtn_tourney_winner.getSize()));
    }
    serialize(_data) {
        super.serialize(_data);
        this.mpet.serialize(_data);
        this.hairTex.serialize(_data);
        this.shirtsTex.serialize(_data);
        this.faceTex.serialize(_data);
        this.c.forEach(v => v.serialize(_data));
        this.num_parts.serialize(_data);
        this.num_accessorios.serialize(_data);
        this.club_type.serialize(_data);
        this.scale_club_set.serialize(_data);
        this.c_stat.forEach(v => v.serialize(_data));
        this.mtn_tourney_winner.serialize(_data);
    }
    layout(_parent) {
        super.layout(_parent);
        this.mpet.layout(_parent, "mpet");
        this.hairTex.layout(_parent, "hairTex");
        this.shirtsTex.layout(_parent, "shirtsTex");
        this.faceTex.layout(_parent, "faceTex");
        this.num_parts.layout(_parent, "num_parts");
        this.num_accessorios.layout(_parent, "num_accessorios");
        this.club_type.layout(_parent, "club_type");
        this.scale_club_set.layout(_parent, "scale_club_set");
        this.mtn_tourney_winner.layout(_parent, "mtn_tourney_winner");


        _parent.appendChild(arrayLayout(this.c, "c", statistics));
        _parent.appendChild(arrayLayout(this.c_stat, "c_stat", statistics));
    }
}

// stats dos tacos/conjuntos: label dos arrays c/c_stat/slot (índice = stat)
class statistics {
    static POWER = 0;
    static CONTROL = 1;
    static ACCURACY = 2;
    static SPIN = 3;
    static CURVE = 4;

    static getName(_value) {
        return Object.entries(statistics).find(([, v]) => v === _value)?.[0];
    }
}

// tipo do Club: enum de tipo de taco (WOOD/IRON/WEDGE/PUTTER) com select no layout
class ClubType {
    static WOOD = 0;
    static IRON = 1;
    static WEDGE = 2;
    static PUTTER = 3;

    static getName(_value) {
        return Object.entries(ClubType).find(([, v]) => v === _value)?.[0];
    }
}

const ClubTypeValue16 = createEnumValueType(Int16Type, ClubType);

// tipo do work_shop do ClubSet: -1 = sem upgrade (incapaz de upar)
class WorkShopTipo {
    static UNUPABLE = -1;
    static BALANCE = 0;
    static POWER = 1;
    static CONTROL = 2;
    static SPIN = 3;
    static SPECIAL = 4;

    static getName(_value) {
        return Object.entries(WorkShopTipo).find(([, v]) => v === _value)?.[0];
    }
}

// tipo_rank_s do work_shop: estatística que o rank S upa
class RankSTipo {
    static POWER = 0;
    static CONTROL = 1;
    static SPIN = 2;
    static SPECIAL = 3;

    static getName(_value) {
        return Object.entries(RankSTipo).find(([, v]) => v === _value)?.[0];
    }
}

const WorkShopTipoValue32 = createEnumValueType(Int32Type, WorkShopTipo);
const StatsValue32 = createEnumValueType(Int32Type, statistics);
const RankSTipoValue32 = createEnumValueType(Int32Type, RankSTipo);

// subset do WorkShopTipo usado no ClubSetWorkShopLevelUpProb.iff (só BALANCE..SPECIAL, sem UNUPABLE)
class WorkShopTipoSolo {
    static BALANCE = 0;
    static POWER = 1;
    static CONTROL = 2;
    static SPIN = 3;
    static SPECIAL = 4;

    static getName(_value) {
        return Object.entries(WorkShopTipoSolo).find(([, v]) => v === _value)?.[0];
    }
}

const WorkShopTipoSoloValue32 = createEnumValueType(Int32Type, WorkShopTipoSolo);

// rank do ClubSetWorkShopLevelUpLimit.iff (RANK_F..RANK_A)
class RankClubSet {
    static RANK_F = 0;
    static RANK_E = 1;
    static RANK_D = 2;
    static RANK_C = 3;
    static RANK_B = 4;
    static RANK_A = 5;

    static getName(_value) {
        return Object.entries(RankClubSet).find(([, v]) => v === _value)?.[0];
    }
}

const RankClubSetValue32 = createEnumValueType(Int32Type, RankClubSet);

class Club extends Base {
    mpet = new StringType(40, StringTypeRelation.ASSET.MODEL);
    tipo = new ClubTypeValue16(false, true, true);
    c = Array(5).fill(0).map(_ => new Int16Type(false, true, true));

    static generateTypeid() {
        return IFF_GROUP_ID.CLUB << 26;
    }

    filter(_element) {
        return (this.typeid.value >> 26) == (_element.typeid.value >> 26);
    }

    constructor(_data = undefined) {
        super();
        if (_data)
            this.unserialize(_data.getBuffer(this.getSize()));
    }

    getSize() {
        return super.getSize() + this.mpet.getSize() + this.tipo.getSize() + this.c.reduce((acc, v) => acc + v.getSize(), 0);
    }

    unserialize(_data) {
        super.unserialize(_data.getBuffer(super.getSize()));
        this.mpet.unserialize(_data.getBuffer(this.mpet.getSize()));
        this.tipo.unserialize(_data.getBuffer(this.tipo.getSize()));
        this.c.forEach(v => v.unserialize(_data.getBuffer(v.getSize())));
    }
    serialize(_data) {
        super.serialize(_data);
        this.mpet.serialize(_data);
        this.tipo.serialize(_data);
        this.c.forEach(v => v.serialize(_data));
    }
    layout(_parent) {
        super.layout(_parent);
        this.mpet.layout(_parent, "mpet");
        this.tipo.layout(_parent, "tipo");


        _parent.appendChild(arrayLayout(this.c, "c"));
    }
}

class ClubSetWorkShop {
    tipo = new WorkShopTipoValue32();
    rank_s_stat = new StatsValue32(false, true, true);
    total_recovery = new Int32Type(false, true, true);
    mastery_rate = new FloatType();
    tipo_rank_s = new RankSTipoValue32(false, true, true);
    can_transform = new Int32Type(true, true, true);

    constructor(_data = undefined) {
        if (_data)
            this.unserialize(_data.getBuffer(this.getSize()));
    }

    getSize() {
        return this.tipo.getSize() + this.rank_s_stat.getSize() + this.total_recovery.getSize()
            + this.mastery_rate.getSize() + this.tipo_rank_s.getSize() + this.can_transform.getSize();
    }

    unserialize(_data) {
        this.tipo.unserialize(_data.getBuffer(this.tipo.getSize()));
        this.rank_s_stat.unserialize(_data.getBuffer(this.rank_s_stat.getSize()));
        this.total_recovery.unserialize(_data.getBuffer(this.total_recovery.getSize()));
        this.mastery_rate.unserialize(_data.getBuffer(this.mastery_rate.getSize()));
        this.tipo_rank_s.unserialize(_data.getBuffer(this.tipo_rank_s.getSize()));
        this.can_transform.unserialize(_data.getBuffer(this.can_transform.getSize()));
    }
    serialize(_data) {
        this.tipo.serialize(_data);
        this.rank_s_stat.serialize(_data);
        this.total_recovery.serialize(_data);
        this.mastery_rate.serialize(_data);
        this.tipo_rank_s.serialize(_data);
        this.can_transform.serialize(_data);
    }
    layout(_parent) {
        this.tipo.layout(_parent, "tipo");
        this.rank_s_stat.layout(_parent, "rank_s_stat");
        this.total_recovery.layout(_parent, "total_recovery");
        this.mastery_rate.layout(_parent, "mastery_rate");
        this.tipo_rank_s.layout(_parent, "tipo_rank_s");
        this.can_transform.layout(_parent, "can_transform");
    }
}

class ClubSet extends Base {
    club = Array(4).fill(0).map(_ => new ClubTypeidLinkValue(false, true, true));
    c = Array(5).fill(0).map(_ => new Int16Type(false, true, true));
    slot = Array(5).fill(0).map(_ => new Int16Type(false, true, true));
    work_shop = new ClubSetWorkShop;
    unknown = new Int32Type(false, true, true);
    text_pangya = new Int32Type(false, true, true);

    static generateTypeid() {
        return IFF_GROUP_ID.CLUBSET << 26;
    }

    filter(_element) {
        return (this.typeid.value >> 26) == (_element.typeid.value >> 26);
    }

    constructor(_data = undefined) {
        super();
        if (_data)
            this.unserialize(_data.getBuffer(this.getSize()));
    }

    getSize() {
        return super.getSize() + this.club.reduce((acc, v) => acc + v.getSize(), 0) + this.c.reduce((acc, v) => acc + v.getSize(), 0)
            + this.slot.reduce((acc, v) => acc + v.getSize(), 0) + this.work_shop.getSize() + this.unknown.getSize() + this.text_pangya.getSize();
    }

    unserialize(_data) {
        super.unserialize(_data.getBuffer(super.getSize()));
        this.club.forEach(v => v.unserialize(_data.getBuffer(v.getSize())));
        this.c.forEach(v => v.unserialize(_data.getBuffer(v.getSize())));
        this.slot.forEach(v => v.unserialize(_data.getBuffer(v.getSize())));
        this.work_shop.unserialize(_data.getBuffer(this.work_shop.getSize()));
        this.unknown.unserialize(_data.getBuffer(this.unknown.getSize()));
        this.text_pangya.unserialize(_data.getBuffer(this.text_pangya.getSize()));
    }
    serialize(_data) {
        super.serialize(_data);
        this.club.forEach(v => v.serialize(_data));
        this.c.forEach(v => v.serialize(_data));
        this.slot.forEach(v => v.serialize(_data));
        this.work_shop.serialize(_data);
        this.unknown.serialize(_data);
        this.text_pangya.serialize(_data);
    }
    layout(_parent) {
        super.layout(_parent);
        this.text_pangya.layout(_parent, "text_pangya");
        this.unknown.layout(_parent, "unknown");
        _parent.appendChild(arrayLayout(this.club, "club", ClubType));


        _parent.appendChild(arrayLayout(this.c, "c", statistics));
        _parent.appendChild(arrayLayout(this.slot, "slot", statistics));

        classLayout(_parent, "work_shop", this.work_shop);
    }
}

class ItemRandom {
    typeid = new Int32Type(false, true, true);
    qntd = new Int32Type(false, true, true);
    rate = new Int32Type(false, true, true);

    constructor(_data = undefined) {
        if (_data)
            this.unserialize(_data.getBuffer(this.getSize()));
    }

    getSize() {
        return this.typeid.getSize() + this.qntd.getSize() + this.rate.getSize();
    }

    unserialize(_data) {
        this.typeid.unserialize(_data.getBuffer(this.typeid.getSize()));
        this.qntd.unserialize(_data.getBuffer(this.qntd.getSize()));
        this.rate.unserialize(_data.getBuffer(this.rate.getSize()));
    }
    serialize(_data) {
        this.typeid.serialize(_data);
        this.qntd.serialize(_data);
        this.rate.serialize(_data);
    }
    layout(_parent) {
        this.typeid.layout(_parent, "typeid");
        this.qntd.layout(_parent, "qntd");
        this.rate.layout(_parent, "rate");
    }
}

// o typeid do item_random do CadieMagicBoxRandom: picker dos MESMOS iffs do
// reward_item do QuestStuff (todos os iffs com item + o próprio SetItem.iff)
class CadieMagicBoxRandomItemRandom extends ItemRandom {
    typeid = new QuestStuffRewardTypeidLinkValue(false, true, true);
}

// o id do CadieMagicBoxRandom NUNCA pode ser 0 (o 0 no box_random_id do
// CadieMagicBox significa "sem box_random_id") — o input do layout rejeita 0
class CadieMagicBoxRandomId extends Int32Type {
    checkValue(_value) {
        if (Number(_value) === 0)
            return false;
        return super.checkValue(_value);
    }
}

class CadieMagicBoxRandom extends BaseTypeidUnique {
    id = new CadieMagicBoxRandomId(false, true, true);
    item_random = new CadieMagicBoxRandomItemRandom();

    get typeid() {
        return this.id;
    }
    set typeid(_id) {
        this.id = _id;
    }

    filter(_element) {
        return true;
    }

    isTypeidUnique() {
        return false;
    }

    constructor(_data = undefined) {
        super();
        if (_data)
            this.unserialize(_data.getBuffer(this.getSize()));
    }

    getSize() {
        return this.id.getSize() + this.item_random.getSize();
    }

    unserialize(_data) {
        this.id.unserialize(_data.getBuffer(this.id.getSize()));
        this.item_random.unserialize(_data.getBuffer(this.item_random.getSize()));
    }
    serialize(_data) {
        this.id.serialize(_data);
        this.item_random.serialize(_data);
    }
    getIdentifyName() {
        return this.id.value.toString();
    }
    layout(_parent) {
        this.id.layout(_parent, "id");
        classLayout(_parent, "item_random", this.item_random);
    }
}

// bits do typeid do Item: item_type — o item tem período de tempo no shop
// (NO_LIMIT_TIME = sem tempo; LIMIT_TIME = tempo de shop com período)
class ItemType {
    static NO_LIMIT_TIME = 0;
    static LIMIT_TIME = 1;
    static EVENT_SUPORT_ITEM = 30;
    static GM_OR_DEVELOPER = 31;

    static getName(_value) {
        return Object.entries(ItemType).find(([, v]) => v === _value)?.[0];
    }
}

// tipo_item do Item: classificação do item (comum, box, artefato, ...)
class ItemTipo {
    static COMMUN = 0;
    static BOX = 1;
    static ARTFACT = 2;
    static ARTFACT_MANA = 4;
    static GRAND_PRIX_RULE = 10;
    static MEMORIAL_COIN = 16;

    static getName(_value) {
        return Object.entries(ItemTipo).find(([, v]) => v === _value)?.[0];
    }
}

const ItemTipoValue32 = createEnumValueType(Int32Type, ItemTipo);

// períodos do time_shop: enum Int8 unsigned — ONE_YEAR (365) estoura o Int8 e
// vira 109 na gravação (o enum compara pelo valor mascarado & 0xFF). Usado
// pelos labels descritivos do array c (Item.iff) e por outras classes com o
// mesmo padrão. O campo period do TimeShop não usa mais select de enum — virou
// um Int8Type unsigned cru (o tempo é editado como número).
class TimeShopPeriod {
    static NO_PERIOD = 0;
    static ONE_DAY = 1;
    static ONE_WEEK = 7;
    static TWO_WEEK = 15;
    static ONE_MONTH = 30;
    static ONE_YEAR = 365;
    static ETERNAL = 255;

    static getName(_value) {
        return Object.entries(TimeShopPeriod)
            .find(([, v]) => v === _value || (v & 0xFF) === _value)?.[0];
    }
}

// label descritivo do índice i do array c (períodos do time_shop): quando o
// time_shop está ATIVO (1) cada campo c[i] mostra o nome do período da posição
// i+1 do enum (ONE_DAY=1 → c[0] ... ETERNAL=6 → c[5], sem o NO_PERIOD 0);
// inativo só o índice 0 tem label ("Quantity"), os demais sem label. Valores
// descritos pelo enum (getName casa pelos valores mascarados). Genérico — o
// mesmo padrão é usado por outras classes com time_shop + array de períodos.
function timePeriodCIndexLabel(_isActive, _i) {
    const period =
        Object.entries(TimeShopPeriod)
            .filter(([, v]) => typeof v === 'number')[_i + 1];

    return (_isActive && period) ? period[0]
        : (_i === 0 ? "Quantity" : "");
}

function applyPangCashPrefix(_groupEl, _isCashFn, _toggleCashFn) {
    const wraps = _groupEl.querySelectorAll('.num-input-wrap');

    for (const wrap of wraps) {
        wrap.classList.add('price-input-wrap');

        let prefix = wrap.querySelector('.price-prefix');

        if (!prefix) {
            const toggleRoot =
                wrap.querySelector('.iff-toggle');

            prefix = document.createElement('span');
            prefix.className = 'price-prefix';

            if (toggleRoot)
                prefix.appendChild(toggleRoot);

            const sep = document.createElement('span');
            sep.className = 'price-sep';
            sep.textContent = '|';
            prefix.appendChild(sep);

            const label = document.createElement('button');
            label.type = 'button';
            label.className = 'price-cur';
            prefix.appendChild(label);

            if (_toggleCashFn)
                label.addEventListener('click', () => _toggleCashFn());

            const inputEl =
                wrap.querySelector('input[type="text"]');

            if (inputEl)
                wrap.insertBefore(prefix, inputEl);
            else
                wrap.appendChild(prefix);
        }
    }

    // atualiza o label pang/cash em tempo real; reconsulta os wraps a cada
    // chamada (idempotente — nao duplica o prefixo)
    const update = () => {
        const isCash = _isCashFn() === 1;

        for (const wrap of _groupEl.querySelectorAll('.num-input-wrap')) {
            const label = wrap.querySelector('.price-cur');

            if (!label)
                continue;

            label.textContent = isCash ? 'cash' : 'pang';
            label.classList.toggle('cash', isCash);
            label.classList.toggle('pang', !isCash);
        }
    };

    update();

    return update;
}

class Item extends Base {
    tipo_item = new ItemTipoValue32(false, true, true);
    mpet = new StringType(40, StringTypeRelation.ASSET.MODEL);
    c = Array(6).fill(0).map(_ => new Int16Type(false, true, true));

    static createTypeidbit(_typeid = 0) {
        return new BitfieldType(
            new Int32Type(false, true, true),
            {
                item_num: 20,
                item_type: 5,
                item_passive: 1,
                iff_identity: 6
            },
            _typeid
        )
    }

    static generateTypeid(_type = 0, _is_passive = 0) {

        const typeidbit = Item.createTypeidbit();

        typeidbit.iff_identity = IFF_GROUP_ID.ITEM;
        typeidbit.item_passive = _is_passive;
        typeidbit.item_type = _type;

        return typeidbit;
    }

    filter(_element) {
        const typeidbit = Item.createTypeidbit(this.typeid.value);
        const typeidbit2 = Item.createTypeidbit(_element.typeid.value);

        return typeidbit.iff_identity == typeidbit2.iff_identity
            && typeidbit.item_passive == typeidbit2.item_passive
            && typeidbit.item_type == typeidbit2.item_type;
    }

    constructor(_data = undefined) {
        super();
        if (_data)
            this.unserialize(_data.getBuffer(this.getSize()));
    }

    getSize() {
        return super.getSize() + this.tipo_item.getSize()
            + this.mpet.getSize() + this.c.reduce((acc, v) => acc + v.getSize(), 0);
    }

    unserialize(_data) {
        super.unserialize(_data.getBuffer(super.getSize()));
        this.tipo_item.unserialize(_data.getBuffer(this.tipo_item.getSize()));
        this.mpet.unserialize(_data.getBuffer(this.mpet.getSize()));
        this.c.forEach(v => v.unserialize(_data.getBuffer(v.getSize())));
    }
    serialize(_data) {
        super.serialize(_data);
        this.tipo_item.serialize(_data);
        this.mpet.serialize(_data);
        this.c.forEach(v => v.serialize(_data));
    }
    layout(_parent) {
        super.layout(_parent);
        this.tipo_item.layout(_parent, "tipo_item");
        this.mpet.layout(_parent, "mpet");

        this._layoutItemC(_parent);

        // time_shop: o active NÃO é editável diretamente — o estado só muda
        // indiretamente quando o usuário edita o typeid (item_type); o toggle
        // fica SEMPRE desabilitado. (O period segue a classe time_shop — ver
        // ShopDados.layout — habilitado quando ativo, desabilitado quando inativo.)
        // tipo_item: não passivo (item_passive=0) → select desabilitado e
        // bloqueado em COMMUN; passivo → habilitado. Todos refletem o typeid.
        const tb_ = Item.createTypeidbit(this.typeid.value);
        const passive = !!(tb_ && tb_.item_passive === 1);

        // active: toggle SEMPRE desabilitado (só muda via edição do typeid)
        // localiza o row do time_shop pelo label "time_shop: " e depois o
        // .bool-field dele; dentro do bool-field o input é o checkbox do active
        const tsLabel =
            [..._parent.querySelectorAll('.type-label')]
                .find(l => l.textContent === 'time_shop: ');

        const tsRow = tsLabel && (tsLabel.parentElement || tsLabel.parent);

        const tsBoolField =
            tsRow && tsRow.querySelector('.bool-field');

        const activeInput =
            tsBoolField && tsBoolField.querySelector('input[type=checkbox]');

        if (activeInput)
            activeInput.disabled = true;

        // tipo_item: não passivo → desabilitado e força COMMUN; passivo →
        // habilitado. Sincroniza o widget (setSelectDisabled) e o valor
        // (setSelectValue), pois o select é um enum com Choices no browser.
        const tipoItemSelect =
            _parent.querySelector('select[data-field="tipo_item"]');

        if (tipoItemSelect) {

            if (!passive) {

                this.tipo_item.value = ItemTipo.COMMUN;
                setSelectValue(tipoItemSelect, ItemTipo.COMMUN);
                setSelectDisabled(tipoItemSelect, true);

            } else {

                setSelectDisabled(tipoItemSelect, false);
                setSelectValue(tipoItemSelect, this.tipo_item.value);
            }
        }
    }

    // array c do Item: [ONE_DAY, ONE_WEEK, TWO_WEEK, ONE_MONTH, ONE_YEAR, ETERNAL]
    // (índices 0..5 = períodos do enum, posições 1..6). Com time_shop ativo
    // mostra os 6 campos cada um com o label do período; inativo mostra todos
    // os campos, mas só o índice 0 tem label ("Quantity"), os demais sem
    // label descritivo. O shop.price NÃO tem mais sync com o c — o period
    // não é mais select de enum (Int8Type de novo) e cada linha do c é
    // independente. O label vem do helper timePeriodCIndexLabel (fora da
    // classe) para reuso por outras classes com o mesmo padrão.
    _layoutItemC(_parent) {

        const isActive =
            () => this.shop.time_shop.active.value === 1;

        const group =
            document.createElement("div");

        group.className =
            "array-field-group";

        const title =
            document.createElement("div");

        title.className =
            "array-field-title";

        title.textContent =
            "c";

        group.appendChild(title);

        const row =
            document.createElement("div");

        row.className =
            "array-field-row";

        group.appendChild(row);

        this.c.forEach((v, i) => {

            const name =
                timePeriodCIndexLabel(isActive(), i);

            v.layout(row, name);

            const el =
                row.children[row.children.length - 1];

            if (el)
                el.style.flex = "1 1 " + fieldMaxChars(v) + "ch";
        });

        _parent.appendChild(group);

        if (isActive()) {
            const applyFn = () => applyPangCashPrefix(group, () => this.shop.flag_shop.type.is_cash, () => this.shop.flag_shop.type.is_cash = this.shop.flag_shop.type.is_cash === 1 ? 0 : 1);
            applyFn();
            this.shop.flag_shop.type.addPangCashListener(applyFn);
        }
    }
}

class PartTypeSlot {
    slot = new BitfieldType(
        new Int32Type(false, true, true),
        {
            slot0: 1, slot1: 1, slot2: 1, slot3: 1, slot4: 1, slot5: 1, slot6: 1,
            slot7: 1, slot8: 1, slot9: 1, slot10: 1, slot11: 1, slot12: 1,
            slot13: 1, slot14: 1, slot15: 1, slot16: 1, slot17: 1, slot18: 1,
            slot19: 1, slot20: 1, slot21: 1, slot22: 1, slot23: 1
        },
        0
    )

    get value() {
        return this.slot.value;
    }
    set value(_value) {
        this.slot.value = _value;
    }

    getSlot(_index) {
        return this.slot[`slot${_index}`];
    }
    setSlot(_index, _value) {
        this.slot[`slot${_index}`] = _value;
    }

    // trava o slot do char_part_num do typeid: o usuário não pode desativar
    // direto no modal do bitfield, só mudando o typeid
    setLockedSlot(_index) {
        this.slot.setLockedBits([_index]);
    }

    constructor(_data = undefined) {
        if (_data)
            this.unserialize(_data.getBuffer(this.getSize()));
    }

    getSize() {
        return this.slot.getSize();
    }

    unserialize(_data) {
        this.slot.unserialize(_data.getBuffer(this.slot.getSize()));
    }
    serialize(_data) {
        this.slot.serialize(_data);
    }
    layout(_parent) {
        this.slot.layout(_parent, "slot");
    }
}

class PartType {
    static TOP = 0;
    static BOTTOM = 1;
    static HEAD = 2;
    static ARM = 3;
    static FOOT = 4;
    static ETC = 5;
    static SUB_LEG = 6;
    static UCC = 7;
    static UCC_BLANK = 8;
    static UCC_COPY = 9;

    static getName(_value) {
        return Object.entries(PartType).find(([, v]) => v === _value)?.[0];
    }
}

// slots do position_mask (0-23) — enum do char_part_num no modal de novo item
const PartSlotNum = Object.fromEntries(
    Array.from({ length: 24 }, (_, i) => ['slot' + i, i])
);

// typeid do Part: ao ser alterado, valida o position_mask — tira o bit do slot
// do typeid anterior e seta o do novo (é obrigatório o slot do char_part_num
// estar setado no position_mask)
class PartTypeidValue extends Int32Type {

    _owner = null;

    constructor(_is_bool_type = false, _little_endian = true, _unsigned = false) {
        super(_is_bool_type, _little_endian, _unsigned);
    }

    onchange(_oldValue, _newValue) {

        const item = this._owner;

        if (!item || !item.position_mask)
            return;

        const oldSlot = Part.createTypeidbit(_oldValue).char_part_num;
        const newSlot = Part.createTypeidbit(_newValue).char_part_num;

        if (oldSlot === newSlot)
            return;

        item.position_mask.setSlot(oldSlot, 0);
        item.position_mask.setSlot(newSlot, 1);

        // o slot do typeid atual fica travado (não editável direto no bitfield)
        item.position_mask.setLockedSlot(newSlot);
    }
}

// type_item do Part é o enum PartType: layout com select das opções
const PartTypeValue32 = createEnumValueType(Int32Type, PartType);

class PartSubType {
    static REPLACE = 0;
    static SUB = 1;
    static DEFAULT = 2;
    static APPEND = 4;
    static SUB_REPLACE = 8;

    // únicos pares (combos) válidos do sub_type: SUB+DEFAULT e APPEND+SUB_REPLACE
    static combos = [
        [1, 2],
        [4, 8],
    ];
}

// typeid do Part (sub_part): começa no hex mod + botão "…" no canto direito do
// input que abre o ItemListModal (lista de itens do Part.iff com filtro)
// base: campo typeid com link (hex mod ativo por padrão) + botão "…" no canto
// direito do input que abre o ItemListModal (lista de itens do iff). A lista
// pode ser restrita por slot sobrescrevendo _linkFilterPredicate (ex.: club do
// ClubSet, onde cada índice do array é um tipo de taco do Club).
class TypeidLinkValue extends Int32Type {

    _input_mode = 'hex';

    constructor(_is_bool_type = false, _little_endian = true, _unsigned = false) {
        super(_is_bool_type, _little_endian, _unsigned);
    }

    // vincular os campos nas subclasses
    _linkIff = null;
    _linkTitle = '';

    _linkFilterPredicate(_item) {
        return true;
    }

    layout(_parent, _name = this.name) {
        super.layout(_parent, _name);

        addTypeidLinkPick(this, _parent, {
            name: _name || 'typeid',
            iff: this._linkIff,
            title: this._linkTitle,
            mode: this._input_mode,
            filter: _item => this._linkFilterPredicate(_item),
        });
    }
}

// Anexa o botão "…" no wrap do campo numérico (último input do wrap é o de
// texto): abre o ItemListModal do iff e grava o valor resolvido no campo.
// - padrão: o typeid inteiro do item escolhido
// - resolve: fn(_item) — valor alternativo (ex.: só o type do CaddieVoiceTable)
function addTypeidLinkPick(_value, _parent, _opts) {

    // o wrap do campo: guardado no layout (também cobre arrays sem data-field,
    // ex.: sub_part/club que passam name undefined ao arrayLayout)
    let wrap =
        _value && _value._layoutWrap;

    if (!wrap && _parent && _parent.querySelector && _opts && _opts.name) {

        const input =
            _parent.querySelector('input[data-field="' + _opts.name + '"]');

        wrap =
            input && input.closest
                ? input.closest('.num-input-wrap')
                : null;
    }

    if (!wrap || wrap.querySelector('.typeid-pick-btn'))
        return;

    wrap.classList.add('typeid-pick');

    const btn =
        document.createElement("button");

    btn.type = "button";
    btn.className = "typeid-pick-btn";
    btn.textContent = "…";
    btn.title = _opts && _opts.title;

    btn.addEventListener("click", async _evt => {
        _evt.preventDefault();
        _evt.stopPropagation();

        const item =
            await new ItemListModal(_value, _opts.iff, {
                filter: _opts && _opts.filter,
                uniqueKey: _opts && _opts.uniqueKey,
            }).show();

        if (!item)
            return;

        const newValue =
            _opts && typeof _opts.resolve === 'function'
                ? _opts.resolve(item)
                : item.typeid.value;

        if (newValue === _value.value)
            return;

        _value.value = newValue;

        // o input de texto é o ÚLTIMO input do wrap (o primeiro é o toggle hex)
        const inputs =
            wrap.querySelectorAll
                ? wrap.querySelectorAll('input')
                : [];

        const input =
            inputs.length ? inputs[inputs.length - 1] : null;

        if (!input)
            return;

        input.value =
            _opts && _opts.mode === 'dec'
                ? String(newValue)
                : '0x' + newValue.toString(16);

        // propagar como edição de campo (atualiza __modified e o li da lista)
        input.dispatchEvent(
            typeof Event !== 'undefined'
                ? new Event('change', { bubbles: true })
                : { type: 'change' }
        );
    });

    wrap.appendChild(btn);
}

// typeid do Part (sub_part): lista do próprio Part.iff sem filtro
class PartTypeidLinkValue extends TypeidLinkValue {

    _linkIff = 'Part.iff';
    _linkTitle = "Escolher item do Part.iff";

    constructor(_is_bool_type = false, _little_endian = true, _unsigned = false) {
        super(_is_bool_type, _little_endian, _unsigned);
    }

    _linkFilterPredicate(_item) {
        return true;
    }
}

// typeid do Club no ClubSet (club): o índice do array É o tipo do taco — o item
// escolhido deve ter o mesmo tipo do índice (WOOD na posição 0, IRON na 1, ...)
class ClubTypeidLinkValue extends TypeidLinkValue {

    _linkIff = 'Club.iff';
    _linkTitle = "Escolher taco do Club.iff";

    constructor(_is_bool_type = false, _little_endian = true, _unsigned = false) {
        super(_is_bool_type, _little_endian, _unsigned);
    }

    _linkFilterPredicate(_item) {
        const slot = this._arrayIndex;

        if (slot === undefined)
            return true;

        return !!( _item.tipo && _item.tipo.value === slot);
    }
}

// typeid do QuestStuff no Achievement (typeid_quest_index e os 10 slots do
// quest_typeid): lista do próprio QuestStuff.iff sem filtro; o tipo do QuestStuff
// não é validado (o usuário não pediu)
class QuestStuffTypeidLinkValue extends TypeidLinkValue {

    _linkIff = 'QuestStuff.iff';
    _linkTitle = "Escolher item do QuestStuff.iff";

    constructor(_is_bool_type = false, _little_endian = true, _unsigned = false) {
        super(_is_bool_type, _little_endian, _unsigned);
    }

    _linkFilterPredicate(_item) {
        return true;
    }
}

// cad_voice_tbl_id do Caddie: guarda o ID da voz do CaddieVoiceTable.iff — o
// ID é o type do item (o num do CaddieVoiceTable é sempre 1); o picker abre a
// lista do CaddieVoiceTable.iff e grava só o type, não o typeid inteiro
class CaddieVoiceTypeidLinkValue extends Int16Type {

    _input_mode = 'dec';

    constructor(_is_bool_type = false, _little_endian = true, _unsigned = false) {
        super(_is_bool_type, _little_endian, _unsigned);
    }

    layout(_parent, _name = this.name) {
        super.layout(_parent, _name);

        addTypeidLinkPick(this, _parent, {
            name: _name,
            iff: 'CaddieVoiceTable.iff',
            title: 'Escolher voz do CaddieVoiceTable.iff',
            mode: 'dec',
            // o typeid do CaddieVoiceTable não é único — lista 1 item por id (type)
            uniqueKey: _item => String(CaddieVoiceTable.createTypeidbit(_item.typeid.value).type),
            resolve: _item => CaddieVoiceTable.createTypeidbit(_item.typeid.value).type,
        });
    }
}

class Part extends Base {
    typeid = new PartTypeidValue(false, true, true);
    mpet = new StringType(40, StringTypeRelation.ASSET.MODEL);
    type_item = new PartTypeValue32();
    position_mask = new PartTypeSlot();
    hide_mask = new PartTypeSlot();
    texture = Array(3).fill(0).map(_ => new StringType(40, StringTypeRelation.ASSET.TEXTURE));
    texture_org = Array(3).fill(0).map(_ => new StringType(40, StringTypeRelation.ASSET.TEXTURE));
    c = Array(5).fill(0).map(_ => new Int16Type(false, true, true));
    slot = Array(5).fill(0).map(_ => new Int16Type(false, true, true));
    equipable_with = new StringType(40, StringTypeRelation.TEXT);
    sub_part = Array(2).fill(0).map(_ => new PartTypeidLinkValue(false, true, true));
    character_slot = new Int16Type(false, true, true);
    caddie_slot = new Int16Type(false, true, true);
    npc_slot = new Int16Type(false, true, true);
    point = new Int16Type(false, true, true);
    valor_rental = new Int32Type(false, true, true);
    is_beginners = new Int32Type(true, true, true);

    static createTypeidbit(_typeid = 0) {
        return new BitfieldType(
            new Int32Type(false, true, true),
            {
	        char_type_num: 9,
	        char_sub_type_num: 4,
	        char_part_num: 5,
	        char_identity: 8,
	        iff_identity: 6
            },
            _typeid
        )
    }

    static generateTypeid(_char_id = 0, _part_num = 0, _sub_type = 0) {

        const typeidbit = Part.createTypeidbit();

        typeidbit.iff_identity = IFF_GROUP_ID.PART;
        typeidbit.char_identity = _char_id;
        typeidbit.char_part_num = _part_num;
        typeidbit.char_sub_type_num = _sub_type;

        return typeidbit;
    }

    filter(_element) {
        const typeidbit = Part.createTypeidbit(this.typeid.value);
        const typeidbit2 = Part.createTypeidbit(_element.typeid.value);

        return typeidbit.iff_identity == typeidbit2.iff_identity
            && typeidbit.char_identity == typeidbit2.char_identity
            && typeidbit.char_part_num == typeidbit2.char_part_num
            && typeidbit.char_sub_type_num == typeidbit2.char_sub_type_num;
    }

    constructor(_data = undefined) {
        super();
        if (_data)
            this.unserialize(_data.getBuffer(this.getSize()));
    }

    getSize() {
        return super.getSize() + this.mpet.getSize() + this.type_item.getSize()
            + this.position_mask.getSize() + this.hide_mask.getSize()
            + this.texture.reduce((acc, v) => acc + v.getSize(), 0) + this.texture_org.reduce((acc, v) => acc + v.getSize(), 0)
            + this.c.reduce((acc, v) => acc + v.getSize(), 0) + this.slot.reduce((acc, v) => acc + v.getSize(), 0)
            + this.equipable_with.getSize() + this.sub_part.reduce((acc, v) => acc + v.getSize(), 0)
            + this.character_slot.getSize() + this.caddie_slot.getSize() + this.npc_slot.getSize() + this.point.getSize()
            + this.valor_rental.getSize() + this.is_beginners.getSize();
    }

    unserialize(_data) {
        super.unserialize(_data.getBuffer(super.getSize()));
        this.mpet.unserialize(_data.getBuffer(this.mpet.getSize()));
        this.type_item.unserialize(_data.getBuffer(this.type_item.getSize()));
        this.position_mask.unserialize(_data.getBuffer(this.position_mask.getSize()));
        this.hide_mask.unserialize(_data.getBuffer(this.hide_mask.getSize()));
        this.texture.forEach(v => v.unserialize(_data.getBuffer(v.getSize())));
        this.texture_org.forEach(v => v.unserialize(_data.getBuffer(v.getSize())));
        this.c.forEach(v => v.unserialize(_data.getBuffer(v.getSize())));
        this.slot.forEach(v => v.unserialize(_data.getBuffer(v.getSize())));
        this.equipable_with.unserialize(_data.getBuffer(this.equipable_with.getSize()));
        this.sub_part.forEach(v => v.unserialize(_data.getBuffer(v.getSize())));
        this.character_slot.unserialize(_data.getBuffer(this.character_slot.getSize()));
        this.caddie_slot.unserialize(_data.getBuffer(this.caddie_slot.getSize()));
        this.npc_slot.unserialize(_data.getBuffer(this.npc_slot.getSize()));
        this.point.unserialize(_data.getBuffer(this.point.getSize()));
        this.valor_rental.unserialize(_data.getBuffer(this.valor_rental.getSize()));
        this.is_beginners.unserialize(_data.getBuffer(this.is_beginners.getSize()));
    }
    serialize(_data) {
        super.serialize(_data);
        this.mpet.serialize(_data);
        this.type_item.serialize(_data);
        this.position_mask.serialize(_data);
        this.hide_mask.serialize(_data);
        this.texture.forEach(v => v.serialize(_data));
        this.texture_org.forEach(v => v.serialize(_data));
        this.c.forEach(v => v.serialize(_data));
        this.slot.forEach(v => v.serialize(_data));
        this.equipable_with.serialize(_data);
        this.sub_part.forEach(v => v.serialize(_data));
        this.character_slot.serialize(_data);
        this.caddie_slot.serialize(_data);
        this.npc_slot.serialize(_data);
        this.point.serialize(_data);
        this.valor_rental.serialize(_data);
        this.is_beginners.serialize(_data);
    }
    layout(_parent) {
        this.typeid._owner = this;

        // o slot do char_part_num do typeid é travado no position_mask
        this.position_mask.setLockedSlot(Part.createTypeidbit(this.typeid.value).char_part_num);

        super.layout(_parent);
        this.mpet.layout(_parent, "mpet");
        this.type_item.layout(_parent, "type_item");
        this.equipable_with.layout(_parent, "equipable_with");
        this.character_slot.layout(_parent, "character_slot");
        this.caddie_slot.layout(_parent, "caddie_slot");
        this.npc_slot.layout(_parent, "npc_slot");
        this.point.layout(_parent, "point");
        this.valor_rental.layout(_parent, "valor_rental");
        this.is_beginners.layout(_parent, "is_beginners");
        classLayout(_parent, "position_mask", this.position_mask);
        classLayout(_parent, "hide_mask", this.hide_mask);
        _parent.appendChild(arrayLayout(this.texture, "texture"));
        _parent.appendChild(arrayLayout(this.texture_org, "texture_org"));
        _parent.appendChild(arrayLayout(this.sub_part, "sub_part"));
        _parent.appendChild(arrayLayout(this.c, "c", statistics));
        _parent.appendChild(arrayLayout(this.slot, "slot", statistics));
    }
}

class Caddie extends Base {
    valor_mensal = new Int32Type(false, true, true);
    mpet = new StringType(40, StringTypeRelation.ASSET.MODEL);
    c = Array(5).fill(0).map(_ => new Int16Type(false, true, true));
    cad_voice_tbl_id = new CaddieVoiceTypeidLinkValue(false, true, true);

    static generateTypeid() {
        return IFF_GROUP_ID.CADDIE << 26;
    }

    filter(_element) {
        return (this.typeid.value >> 26) == (_element.typeid.value >> 26);
    }

    constructor(_data = undefined) {
        super();
        if (_data)
            this.unserialize(_data.getBuffer(this.getSize()));
    }

    getSize() {
        return super.getSize() + this.valor_mensal.getSize() + this.mpet.getSize()
            + this.c.reduce((acc, v) => acc + v.getSize(), 0) + this.cad_voice_tbl_id.getSize();
    }

    unserialize(_data) {
        super.unserialize(_data.getBuffer(super.getSize()));
        this.valor_mensal.unserialize(_data.getBuffer(this.valor_mensal.getSize()));
        this.mpet.unserialize(_data.getBuffer(this.mpet.getSize()));
        this.c.forEach(v => v.unserialize(_data.getBuffer(v.getSize())));
        this.cad_voice_tbl_id.unserialize(_data.getBuffer(this.cad_voice_tbl_id.getSize()));
    }
    serialize(_data) {
        super.serialize(_data);
        this.valor_mensal.serialize(_data);
        this.mpet.serialize(_data);
        this.c.forEach(v => v.serialize(_data));
        this.cad_voice_tbl_id.serialize(_data);
    }
    layout(_parent) {
        super.layout(_parent);
        this.valor_mensal.layout(_parent, "valor_mensal");
        this.mpet.layout(_parent, "mpet");
        this.cad_voice_tbl_id.layout(_parent, "cad_voice_tbl_id");


        _parent.appendChild(arrayLayout(this.c, "c", statistics));
    }
}

class MascotEfeito {
    power_drive = new Int16Type(false, true, true);
    drop_rate = new Int16Type(false, true, true);
    power_gauge = new Int16Type(false, true, true);
    pang_rate = new Int16Type(false, true, true);
    exp_rate = new Int16Type(false, true, true);
    item_slot = new Int8Type(false, true);

    constructor(_data = undefined) {
        if (_data)
            this.unserialize(_data.getBuffer(this.getSize()));
    }

    getSize() {
        return this.power_drive.getSize() + this.drop_rate.getSize() + this.power_gauge.getSize()
            + this.pang_rate.getSize() + this.exp_rate.getSize() + this.item_slot.getSize();
    }

    unserialize(_data) {
        this.power_drive.unserialize(_data.getBuffer(this.power_drive.getSize()));
        this.drop_rate.unserialize(_data.getBuffer(this.drop_rate.getSize()));
        this.power_gauge.unserialize(_data.getBuffer(this.power_gauge.getSize()));
        this.pang_rate.unserialize(_data.getBuffer(this.pang_rate.getSize()));
        this.exp_rate.unserialize(_data.getBuffer(this.exp_rate.getSize()));
        this.item_slot.unserialize(_data.getBuffer(this.item_slot.getSize()));
    }
    serialize(_data) {
        this.power_drive.serialize(_data);
        this.drop_rate.serialize(_data);
        this.power_gauge.serialize(_data);
        this.pang_rate.serialize(_data);
        this.exp_rate.serialize(_data);
        this.item_slot.serialize(_data);
    }
    layout(_parent) {
        this.power_drive.layout(_parent, "power_drive");
        this.drop_rate.layout(_parent, "drop_rate");
        this.power_gauge.layout(_parent, "power_gauge");
        this.pang_rate.layout(_parent, "pang_rate");
        this.exp_rate.layout(_parent, "exp_rate");
        this.item_slot.layout(_parent, "item_slot");
    }
}

class MascotMessage {
    active = new Int8Type(true, true);
    flag = new Int16Type();
    change_price = new Int32Type(false, true, true);

    constructor(_data = undefined) {
        if (_data)
            this.unserialize(_data.getBuffer(this.getSize()));
    }

    getSize() {
        return this.active.getSize() + this.flag.getSize() + this.change_price.getSize();
    }

    unserialize(_data) {
        this.active.unserialize(_data.getBuffer(this.active.getSize()));
        this.flag.unserialize(_data.getBuffer(this.flag.getSize()));
        this.change_price.unserialize(_data.getBuffer(this.change_price.getSize()));
    }
    serialize(_data) {
        this.active.serialize(_data);
        this.flag.serialize(_data);
        this.change_price.serialize(_data);
    }
    layout(_parent) {
        this.active.layout(_parent, "active");
        this.flag.layout(_parent, "flag");
        this.change_price.layout(_parent, "change_price");
    }
}

class MascotBonusPang {
    hitting = new Int16Type();
    missing = new Int16Type();

    constructor(_data = undefined) {
        if (_data)
            this.unserialize(_data.getBuffer(this.getSize()));
    }

    getSize() {
        return this.hitting.getSize() + this.missing.getSize();
    }

    unserialize(_data) {
        this.hitting.unserialize(_data.getBuffer(this.hitting.getSize()));
        this.missing.unserialize(_data.getBuffer(this.missing.getSize()));
    }
    serialize(_data) {
        this.hitting.serialize(_data);
        this.missing.serialize(_data);
    }
    layout(_parent) {
        this.hitting.layout(_parent, "hitting");
        this.missing.layout(_parent, "missing");
    }
}

class Mascot extends Base {
    mpet = new StringType(40, StringTypeRelation.ASSET.MODEL);
    texture = new StringType(40, StringTypeRelation.ASSET.TEXTURE);
    price = Array(5).fill(0).map(_ => new Int8Type(false, true));
    c = Array(5).fill(0).map(_ => new Int8Type(false, true));
    efeito = new MascotEfeito();
    msg = new MascotMessage();
    bonus_pang = new MascotBonusPang();

    static generateTypeid() {
        return IFF_GROUP_ID.MASCOT << 26;
    }

    filter(_element) {
        return (this.typeid.value >> 26) == (_element.typeid.value >> 26);
    }

    constructor(_data = undefined) {
        super();
        if (_data)
            this.unserialize(_data.getBuffer(this.getSize()));
    }

    getSize() {
        return super.getSize() + this.mpet.getSize() + this.texture.getSize()
            + this.price.reduce((acc, v) => acc + v.getSize(), 0) + this.c.reduce((acc, v) => acc + v.getSize(), 0)
            + this.efeito.getSize() + this.msg.getSize() + this.bonus_pang.getSize();
    }

    unserialize(_data) {
        super.unserialize(_data.getBuffer(super.getSize()));
        this.mpet.unserialize(_data.getBuffer(this.mpet.getSize()));
        this.texture.unserialize(_data.getBuffer(this.texture.getSize()));
        this.price.forEach(v => v.unserialize(_data.getBuffer(v.getSize())));
        this.c.forEach(v => v.unserialize(_data.getBuffer(v.getSize())));
        this.efeito.unserialize(_data.getBuffer(this.efeito.getSize()));
        this.msg.unserialize(_data.getBuffer(this.msg.getSize()));
        this.bonus_pang.unserialize(_data.getBuffer(this.bonus_pang.getSize()));
    }
    serialize(_data) {
        super.serialize(_data);
        this.mpet.serialize(_data);
        this.texture.serialize(_data);
        this.price.forEach(v => v.serialize(_data));
        this.c.forEach(v => v.serialize(_data));
        this.efeito.serialize(_data);
        this.msg.serialize(_data);
        this.bonus_pang.serialize(_data);
    }
    layout(_parent) {
        super.layout(_parent);
        this.mpet.layout(_parent, "mpet");
        this.texture.layout(_parent, "texture");

        // labels ONE_DAY..ONE_YEAR no price SÓ com time_shop ativo (padrão do
        // Skin); o toggle do active re-renderiza o row do price ao vivo com
        // replaceChild (o price NÃO é o último campo — vem c/efeito/msg depois)
        const priceLabels =
            () => this.shop && this.shop.time_shop && this.shop.time_shop.active
                && this.shop.time_shop.active.value === 1
                ? { getName: _i => kSkinPriceLabels[_i] }
                : null;

        let priceGroup = _parent.appendChild(arrayLayout(this.price, "price", priceLabels()));

        const isCashFn = () => this.shop.flag_shop.type.is_cash;

        const toggleCashFn = () => {
            this.shop.flag_shop.type.is_cash =
                this.shop.flag_shop.type.is_cash === 1 ? 0 : 1;
        };

        const applyPangCash = () => {
            if (!priceLabels())
                return;
            if (priceGroup && (priceGroup.parentNode || priceGroup.parent) === _parent)
                applyPangCashPrefix(priceGroup, isCashFn, toggleCashFn);
        };

        applyPangCash();
        // registrado 1x (o toggle so chama applyPangCash p/ refresh, nao re-registra)
        this.shop.flag_shop.type.addPangCashListener(applyPangCash);

        // c com labels do enum statistics (POWER..CURVE)
        _parent.appendChild(arrayLayout(this.c, "c", statistics));

    	classLayout(_parent, "efeito", this.efeito);
    	classLayout(_parent, "msg", this.msg);
    	classLayout(_parent, "bonus_pang", this.bonus_pang);

        const tsRow = this.shop && this.shop.time_shop && this.shop.time_shop.active
            && this.shop.time_shop.active._row;

        // busca em 2 passos (domstub não entende descendência; padrão Item/Skin)
        const tsBoolField =
            tsRow && tsRow.querySelector('.bool-field');

        const activeInput =
            tsBoolField && tsBoolField.querySelector('input[type=checkbox]');

        if (activeInput) {
            activeInput.addEventListener('change', () => {
                if ((priceGroup.parentNode || priceGroup.parent) === _parent) {
                    const novo = arrayLayout(this.price, "price", priceLabels());
                    _parent.replaceChild(novo, priceGroup);
                    priceGroup = novo;
                    applyPangCash();
                }
            });
        }
    }
}

class Desc extends BaseTypeidUnique {
    typeid = new Int32Type(false, true, true);
    description = new StringType(512, StringTypeRelation.TEXT);

    constructor(_data = undefined) {
        super();
        if (_data)
            this.unserialize(_data.getBuffer(this.getSize()));
    }
    
    getSize() {
        return this.typeid.getSize() + this.description.getSize();
    }

    unserialize(_data) {
        this.typeid.unserialize(_data.getBuffer(this.typeid.getSize()));
        this.description.unserialize(_data.getBuffer(this.description.getSize()));
    }
    serialize(_data) {
        this.typeid.serialize(_data);
        this.description.serialize(_data);
    }
    getIdentifyName() {
        return this.typeid.value.toString(16);
    }
    layout(_parent) {
        this.typeid.layout(_parent, "typeid");
        this.description.layout(_parent, "description");
    }
}

// typeid do package do SetItem: hex mod padrão + botão "…" que abre o
// ItemListModal com os iffs que um conjunto pode conter (árvore multi-iff)
class SetItemPackageTypeidLinkValue extends TypeidLinkValue {

    _linkIff = [
        'Character.iff', 'Part.iff', 'ClubSet.iff', 'Ball.iff', 'Item.iff',
        'Caddie.iff', 'Skin.iff', 'HairStyle.iff', 'Mascot.iff', 'AuxPart.iff',
        'Card.iff', 'Furniture.iff',
    ];
    _linkTitle = "Escolher item (typeid)";

    constructor(_is_bool_type = false, _little_endian = true, _unsigned = false) {
        super(_is_bool_type, _little_endian, _unsigned);
    }
}

class SetItemPackage {
    qntd = new Int32Type(false, true, true);
    item_typeid = Array(10).fill(0).map(_ => new SetItemPackageTypeidLinkValue(false, true, true));
    item_qntd = Array(10).fill(0).map(_ => new Int16Type(false, true, true));

    constructor(_data = undefined) {
        if (_data)
            this.unserialize(_data.getBuffer(this.getSize()));
    }

    getSize() {
        return this.qntd.getSize() + this.item_typeid.reduce((acc, v) => acc + v.getSize(), 0)
            + this.item_qntd.reduce((acc, v) => acc + v.getSize(), 0);
    }

    unserialize(_data) {
        this.qntd.unserialize(_data.getBuffer(this.qntd.getSize()));
        this.item_typeid.forEach(v => v.unserialize(_data.getBuffer(v.getSize())));
        this.item_qntd.forEach(v => v.unserialize(_data.getBuffer(v.getSize())));
    }
    serialize(_data) {
        this.qntd.serialize(_data);
        this.item_typeid.forEach(v => v.serialize(_data));
        this.item_qntd.forEach(v => v.serialize(_data));
    }
    layout(_parent) {
        this.qntd.layout(_parent, "qntd");
        _parent.appendChild(arrayLayout(this.item_typeid, "item_typeid"));
        _parent.appendChild(arrayLayout(this.item_qntd, "item_qntd"));
    }
}

class SetItemSubType {
    static COMMON = 0;
    static CHARACTER = 1;
    static PARTS = 2;
    static CLUB = 3; // pode ser club
    static CLUBSET = 4;
    static BALL = 5;
    static ITEM = 6;
    static CADDIE = 7;
    static CARD = 8;
    static AUXPART = 9;
}

class SetItemSubTypeChar {
    static NURI = 0;
    static HANA = 1;
    static AZER = 2;
    static CECILIA = 3;
    static MAX = 4;
    static KOOH = 5;
    static ARIN = 6;
    static KAZ = 7;
    static LUCIA = 8;
    static NELL = 9;
    static SPIKA = 10;
    static NURI_R = 11;
    static HANA_R = 12;
    static AZER_R = 13;
    static CECILIA_R = 14;
    static STC_AUXPART = 0xFB; // dados reais: 5 anéis (SetItem.iff)
    static STC_CLUBSET = 0xFC; // dados reais: 1 item (SetItem.iff, typeid 0x249f8009 — os typeids do package.item_typeid são do ClubSet.iff: 0x10000081/0x10000082)
    static STC_CARD = 0xFD;
    static EQUIP_ITEM = 0xFE;
    static NOEQUIP_ITEM = 0xFF;
}

class SetItem extends Base {
    package = new SetItemPackage();
    c = Array(6).fill(0).map(_ => new Int16Type(false, true, true));

    static createTypeidbit(_typeid = 0) {
        return new BitfieldType(
            new Int32Type(false, true, true),
            {
                set_item_num: 13,
                set_item_sub_type_char: 8,
                set_item_sub_type: 5,
                iff_identity: 6
            },
            _typeid
        )
    }

    static generateTypeid(_sub_type = 0, _sub_type_char = 0) {

        const typeidbit = SetItem.createTypeidbit();

        typeidbit.iff_identity = IFF_GROUP_ID.SET_ITEM;
        typeidbit.set_item_sub_type  = _sub_type;
        typeidbit.set_item_sub_type_char = _sub_type_char;

        return typeidbit;
    }

    filter(_element) {
        const typeidbit = SetItem.createTypeidbit(this.typeid.value);
        const typeidbit2 = SetItem.createTypeidbit(_element.typeid.value);

        return typeidbit.iff_identity == typeidbit2.iff_identity
            && typeidbit.set_item_sub_type == typeidbit2.set_item_sub_type
            && typeidbit.set_item_sub_type_char == typeidbit2.set_item_sub_type_char;
    }

    constructor(_data = undefined) {
        super();
        if (_data)
            this.unserialize(_data.getBuffer(this.getSize()));
    }

    getSize() {
        return super.getSize() + this.package.getSize()
            + this.c.reduce((acc, v) => acc + v.getSize(), 0);
    }

    unserialize(_data) {
        super.unserialize(_data.getBuffer(super.getSize()));
        this.package.unserialize(_data.getBuffer(this.package.getSize()));
        this.c.forEach(v => v.unserialize(_data.getBuffer(v.getSize())));
    }
    serialize(_data) {
        super.serialize(_data);
        this.package.serialize(_data);
        this.c.forEach(v => v.serialize(_data));
    }
    layout(_parent) {
        super.layout(_parent);
        classLayout(_parent, "package", this.package);


        _parent.appendChild(arrayLayout(this.c, "c"));
    }
}

class TYPE_BALL_CONSUMABLE {
    static CONSUMABLE = 0;
    static NO_CONSUMABLE = 1;

    static getName(_value) {
        return Object.entries(TYPE_BALL_CONSUMABLE).find(([, v]) => v === _value)?.[0];
    }
}

const BallConsumableTypeValue32 = createEnumValueType(Int32Type, TYPE_BALL_CONSUMABLE);

class Ball extends Base {
    consumable_type = new BallConsumableTypeValue32(false, true, true);
    mpet = new StringType(40, StringTypeRelation.ASSET.MODEL);
    bound = new Int32Type(false, true, true);
    roll = new Int32Type(false, true, true);
    fx = Array(7).fill(0).map(_ => new StringType(40, StringTypeRelation.ASSET.FX));
    fxBone =Array(7).fill(0).map(_ => new StringType(40, StringTypeRelation.ASSET.FX));
    c = Array(5).fill(0).map(_ => new Int16Type(false, true, true));
    point = new Int16Type(false, true, true);

    static generateTypeid() {
        return IFF_GROUP_ID.BALL << 26;
    }

    filter(_element) {
        return (this.typeid.value >> 26) == (_element.typeid.value >> 26);
    }

    constructor(_data = undefined) {
        super();
        if (_data)
            this.unserialize(_data.getBuffer(this.getSize()));
    }

    getSize() {
        return super.getSize() + this.consumable_type.getSize() + this.mpet.getSize()
            + this.bound.getSize() + this.roll.getSize() + this.fx.reduce((acc, v) => acc + v.getSize(), 0)
            + this.fxBone.reduce((acc, v) => acc + v.getSize(), 0) + this.c.reduce((acc, v) => acc + v.getSize(), 0)
            + this.point.getSize();
    }

    unserialize(_data) {
        super.unserialize(_data.getBuffer(super.getSize()));
        this.consumable_type.unserialize(_data.getBuffer(this.consumable_type.getSize()));
        this.mpet.unserialize(_data.getBuffer(this.mpet.getSize()));
        this.bound.unserialize(_data.getBuffer(this.bound.getSize()));
        this.roll.unserialize(_data.getBuffer(this.roll.getSize()));
        this.fx.forEach(v => v.unserialize(_data.getBuffer(v.getSize())));
        this.fxBone.forEach(v => v.unserialize(_data.getBuffer(v.getSize())));
        this.c.forEach(v => v.unserialize(_data.getBuffer(v.getSize())));
        this.point.unserialize(_data.getBuffer(this.point.getSize()));
    }
    serialize(_data) {
        super.serialize(_data);
        this.consumable_type.serialize(_data);
        this.mpet.serialize(_data);
        this.bound.serialize(_data);
        this.roll.serialize(_data);
        this.fx.forEach(v => v.serialize(_data));
        this.fxBone.forEach(v => v.serialize(_data));
        this.c.forEach(v => v.serialize(_data));
        this.point.serialize(_data);
    }
    layout(_parent) {
        super.layout(_parent);
        this.consumable_type.layout(_parent, "consumable_type");
        this.mpet.layout(_parent, "mpet");
        this.bound.layout(_parent, "bound");
        this.roll.layout(_parent, "roll");
        this.point.layout(_parent, "point");
        _parent.appendChild(arrayLayout(this.fx, "fx"));
        _parent.appendChild(arrayLayout(this.fxBone, "fxBone"));


        _parent.appendChild(arrayLayout(this.c, "c"));
    }
}

class CaddieItemType {
    static COOKIE = 0;
    static PANG = 1;
    static ESPECIAL = 2;
    static UPGRADE = 3;
}

class CaddieItem extends Base {
    faceTex = new StringType(40, StringTypeRelation.ASSET.TEXTURE);
    bodyTex = new StringType(40, StringTypeRelation.ASSET.TEXTURE);
    price = Array(6).fill(0).map(_ => new Int16Type(false, true, true));

    static createTypeidbit(_typeid = 0) {
        return new BitfieldType(
            new Int32Type(false, true, true),
            {
                cad_item_num: 13,
                cad_item_type_num: 3,
                cad_item_cad_type_num: 5, // Caddie id high
                cad_item_cad_base_num: 5, // Caddie id low
                iff_identity: 6
            },
            _typeid
        )
    }

    static generateTypeid(_caddie_id = 0, _cad_item_type = 0) {

        const typeidbit = CaddieItem.createTypeidbit();

        typeidbit.iff_identity = IFF_GROUP_ID.CAD_ITEM;
        typeidbit.cad_item_type_num = _cad_item_type;
        typeidbit.cad_item_cad_base_num = Math.min(_caddie_id, 0x1F);
        typeidbit.cad_item_cad_type_num = _caddie_id > 0x1F ? _caddie_id - 0x1F : 0;

        return typeidbit;
    }

    filter(_element) {
        const typeidbit = CaddieItem.createTypeidbit(this.typeid.value);
        const typeidbit2 = CaddieItem.createTypeidbit(_element.typeid.value);

        return typeidbit.iff_identity == typeidbit2.iff_identity
            && typeidbit.cad_item_cad_base_num == typeidbit2.cad_item_cad_base_num
            && typeidbit.cad_item_cad_type_num == typeidbit2.cad_item_cad_type_num
            && typeidbit.cad_item_type_num == typeidbit2.cad_item_type_num;
    }

    constructor(_data = undefined) {
        super();
        if (_data)
            this.unserialize(_data.getBuffer(this.getSize()));
    }

    getSize() {
        return super.getSize() + this.faceTex.getSize() + this.bodyTex.getSize()
            + this.price.reduce((acc, v) => acc + v.getSize(), 0);
    }

    unserialize(_data) {
        super.unserialize(_data.getBuffer(super.getSize()));
        this.faceTex.unserialize(_data.getBuffer(this.faceTex.getSize()));
        this.bodyTex.unserialize(_data.getBuffer(this.bodyTex.getSize()));
        this.price.forEach(v => v.unserialize(_data.getBuffer(v.getSize())));
    }
    serialize(_data) {
        super.serialize(_data);
        this.faceTex.serialize(_data);
        this.bodyTex.serialize(_data);
        this.price.forEach(v => v.serialize(_data));
    }
    layout(_parent) {
        super.layout(_parent);
        this.faceTex.layout(_parent, "faceTex");
        this.bodyTex.layout(_parent, "bodyTex");

        // labels dos períodos do time_shop (ONE_DAY..ETERNAL) SÓ com time_shop
        // ativo (igual ao Skin/Mascot) — inativo sem labels descritivos
        const priceLabels =
            () => this.shop && this.shop.time_shop && this.shop.time_shop.active
                && this.shop.time_shop.active.value === 1
                ? { getName: i => timePeriodCIndexLabel(true, i) }
                : null;

        let priceGroup = _parent.appendChild(arrayLayout(this.price, "price", priceLabels()));

        const applyFn = () => {
            if (!priceLabels())
                return;
            applyPangCashPrefix(priceGroup, () => this.shop.flag_shop.type.is_cash, () => this.shop.flag_shop.type.is_cash = this.shop.flag_shop.type.is_cash === 1 ? 0 : 1);
        };

        applyFn();
        this.shop.flag_shop.type.addPangCashListener(applyFn);

        const tsRow = this.shop && this.shop.time_shop && this.shop.time_shop.active
            && this.shop.time_shop.active._row;

        // busca em 2 passos (domstub não entende descendência; padrão Item/Skin)
        const tsBoolField =
            tsRow && tsRow.querySelector('.bool-field');

        const activeInput =
            tsBoolField && tsBoolField.querySelector('input[type=checkbox]');

        if (activeInput) {
            activeInput.addEventListener('change', () => {
                if ((priceGroup.parentNode || priceGroup.parent) === _parent) {
                    const novo = arrayLayout(this.price, "price", priceLabels());
                    _parent.replaceChild(novo, priceGroup);
                    priceGroup = novo;
                    applyFn();
                }
            });
        }
    }
}

class CourseStarDifficultyType {
    static NONE_STAR = 0
    static ONE_STAR = 1;
    static TWO_STAR = 2;
    static THREE_STAR = 3;
    static FOUR_STAR = 4;
    static FIVE_STAR = 5;
}

class CourseStarDifficultyFlagType {
    static NORMAL = 0;
    static EASY = 1;
    static HARD = 2;
}

class CourseStar {
    star = new BitfieldType(
        new Int8Type(false, true),
        {
            num: 4,
            difficulty: 4
        },
        0
    )

    get num() {
        return this.star.num;
    }
    get difficulty() {
        return this.star.difficulty;
    }
    get value() {
        return this.star.value;
    }

    set num(_num) {
        this.star.num = _num;
    }
    set difficulty(_difficulty) {
        this.star.difficulty = _difficulty;
    }
    set value(_value) {
        this.star.value = _value;
    }

    constructor(_data = undefined) {
        if (_data)
            this.unserialize(_data.getBuffer(this.getSize()));
    }

    getSize() {
        return this.star.getSize();
    }

    unserialize(_data) {
        this.star.unserialize(_data.getBuffer(this.star.getSize()));
    }
    serialize(_data) {
        this.star.serialize(_data);
    }
    layout(_parent, _name = "star") {
        // um único label (o do campo) + 2 selects de enum — os grupos do
        // bitfield continuam (num 4 bits + difficulty 4 bits = 1 byte); o
        // layout padrão do BitfieldType renderizaria 2 grupos com 2 labels
        let container =
            document.createElement("div");

        container.className =
            "bitfield-layout star-layout";

        container.style.display =
            "flex";

        container.style.alignItems =
            "center";

        container.style.gap =
            "8px";

        if (_name !== undefined) {
            let title =
                document.createElement("span");

            title.className =
                "bitfield-title";

            title.textContent =
                _name;

            container.appendChild(title);
        }

        // num: CourseStarDifficultyType (0..5 estrelas)
        let numSel =
            document.createElement("select");

        numSel.className =
            "form-select level-select";

        for (const [name, value] of Object.entries(CourseStarDifficultyType)) {

            if (typeof value !== 'number')
                continue;

            let opt =
                document.createElement("option");

            opt.value = value;
            opt.textContent =
                name;

            numSel.appendChild(opt);
        }

        numSel.value =
            String(this.num);

        numSel.addEventListener('change', evt => {
            this.num =
                Number(evt.target.value);
        });

        container.appendChild(numSel);

        makeChoices(numSel);

        // difficulty: CourseStarDifficultyFlagType (NORMAL/EASY/HARD)
        let diffSel =
            document.createElement("select");

        diffSel.className =
            "form-select level-select";

        for (const [name, value] of Object.entries(CourseStarDifficultyFlagType)) {

            if (typeof value !== 'number')
                continue;

            let opt =
                document.createElement("option");

            opt.value = value;
            opt.textContent =
                name;

            diffSel.appendChild(opt);
        }

        diffSel.value =
            String(this.difficulty);

        diffSel.addEventListener('change', evt => {
            this.difficulty =
                Number(evt.target.value);
        });

        container.appendChild(diffSel);

        makeChoices(diffSel);

        _parent.appendChild(container);
    }
}

class CourseBonusPangScore {
    hio = new Int32Type(false, true, true);
    albatross = new Int32Type(false, true, true);
    eagle = new Int32Type(false, true, true);
    birdie = new Int32Type(false, true, true);
    par = new Int32Type(false, true, true);
    overpar = new Int32Type(false, true, true);

    constructor(_data = undefined) {
        if (_data)
            this.unserialize(_data.getBuffer(this.getSize()));
    }
    
    getSize() {
        return this.hio.getSize() + this.albatross.getSize() + this.eagle.getSize()
            + this.birdie.getSize() + this.par.getSize() + this.overpar.getSize();
    }

    unserialize(_data) {
        this.hio.unserialize(_data.getBuffer(this.hio.getSize()));
        this.albatross.unserialize(_data.getBuffer(this.albatross.getSize()));
        this.eagle.unserialize(_data.getBuffer(this.eagle.getSize()));
        this.birdie.unserialize(_data.getBuffer(this.birdie.getSize()));
        this.par.unserialize(_data.getBuffer(this.par.getSize()));
        this.overpar.unserialize(_data.getBuffer(this.overpar.getSize()));
    }
    serialize(_data) {
        this.hio.serialize(_data);
        this.albatross.serialize(_data);
        this.eagle.serialize(_data);
        this.birdie.serialize(_data);
        this.par.serialize(_data);
        this.overpar.serialize(_data);
    }
    layout(_parent) {
        this.hio.layout(_parent, "hio");
        this.albatross.layout(_parent, "albatross");
        this.eagle.layout(_parent, "eagle");
        this.birdie.layout(_parent, "birdie");
        this.par.layout(_parent, "par");
        this.overpar.layout(_parent, "overpar");
    }
}

class CourseParScore {
    par_hole = Array(18).fill(0).map(_ => new Int8Type(false, true));
    min_score_hole = Array(18).fill(0).map(_ => new Int8Type());
    max_score_hole = Array(18).fill(0).map(_ => new Int8Type());

    constructor(_data = undefined) {
        if (_data)
            this.unserialize(_data.getBuffer(CourseParScore.getSize()));
    }

    getSize() {
        return this.par_hole.reduce((acc, v) => acc + v.getSize(), 0)
            + this.min_score_hole.reduce((acc, v) => acc + v.getSize(), 0)
            + this.max_score_hole.reduce((acc, v) => acc + v.getSize(), 0);
    }

    unserialize(_data) {
        this.par_hole.forEach(v => v.unserialize(_data.getBuffer(v.getSize())));
        this.min_score_hole.forEach(v => v.unserialize(_data.getBuffer(v.getSize())));
        this.max_score_hole.forEach(v => v.unserialize(_data.getBuffer(v.getSize())));
    }
    serialize(_data) {
        this.par_hole.forEach(v => v.serialize(_data));
        this.min_score_hole.forEach(v => v.serialize(_data));
        this.max_score_hole.forEach(v => v.serialize(_data));
    }
    layout(_parent) {
        // labels descritivos por buraco: Hole 1, Hole 2, ... (índice + 1)
        const holeNames =
            { getName: _i => 'Hole ' + (_i + 1) };

        _parent.appendChild(arrayLayout(this.par_hole, "par_hole", holeNames));
        _parent.appendChild(arrayLayout(this.min_score_hole, "min_score_hole", holeNames));
        _parent.appendChild(arrayLayout(this.max_score_hole, "max_score_hole", holeNames));
    }
}

class Course extends Base {
    mpet = new StringType(40, StringTypeRelation.ASSET.MODEL);
    amb_sound = new StringType(40, StringTypeRelation.ASSET.AUDIO);
    star = new CourseStar();
    xml = new StringType(43, StringTypeRelation.ASSET.XML);
    rate_pang = new FloatType();
    seq = new StringType(40, StringTypeRelation.ASSET.SEQ);
    bonus_pang_score_normal = new CourseBonusPangScore();
    bonus_pang_score_natural = new CourseBonusPangScore();
    par_score_hole = new CourseParScore();
    unknown = new Int16Type(false, true, true);

    static generateTypeid() {
        return IFF_GROUP_ID.COURSE << 26;
    }

    filter(_element) {
        return (this.typeid.value >> 26) == (_element.typeid.value >> 26);
    }

    constructor(_data = undefined) {
        super();
        if (_data)
            this.unserialize(_data.getBuffer(this.getSize()));
    }

    getSize() {
        return super.getSize() + this.mpet.getSize() + this.amb_sound.getSize()
            + this.star.getSize() + this.xml.getSize() + this.rate_pang.getSize()
            + this.seq.getSize() + this.bonus_pang_score_normal.getSize()
            + this.bonus_pang_score_natural.getSize() + this.par_score_hole.getSize()
            + this.unknown.getSize();
    }

    unserialize(_data) {
        super.unserialize(_data.getBuffer(super.getSize()));
        this.mpet.unserialize(_data.getBuffer(this.mpet.getSize()));
        this.amb_sound.unserialize(_data.getBuffer(this.amb_sound.getSize()));
        this.star.unserialize(_data.getBuffer(this.star.getSize()));
        this.xml.unserialize(_data.getBuffer(this.xml.getSize()));
        this.rate_pang.unserialize(_data.getBuffer(this.rate_pang.getSize()));
        this.seq.unserialize(_data.getBuffer(this.seq.getSize()));
        this.bonus_pang_score_normal.unserialize(_data.getBuffer(this.bonus_pang_score_normal.getSize()));
        this.bonus_pang_score_natural.unserialize(_data.getBuffer(this.bonus_pang_score_natural.getSize()));
        this.par_score_hole.unserialize(_data.getBuffer(this.par_score_hole.getSize()));
        this.unknown.unserialize(_data.getBuffer(this.unknown.getSize()));
    }
    serialize(_data) {
        super.serialize(_data);
        this.mpet.serialize(_data);
        this.amb_sound.serialize(_data);
        this.star.serialize(_data);
        this.xml.serialize(_data);
        this.rate_pang.serialize(_data);
        this.seq.serialize(_data);
        this.bonus_pang_score_normal.serialize(_data);
        this.bonus_pang_score_natural.serialize(_data);
        this.par_score_hole.serialize(_data);
        this.unknown.serialize(_data);
    }
    layout(_parent) {
        super.layout(_parent);
        this.mpet.layout(_parent, "mpet");
        this.amb_sound.layout(_parent, "amb_sound");
        this.xml.layout(_parent, "xml");
        this.rate_pang.layout(_parent, "rate_pang");
        this.seq.layout(_parent, "seq");
        this.unknown.layout(_parent, "unknown");
        classLayout(_parent, "star", this.star);
        classLayout(_parent, "bonus_pang_score_normal", this.bonus_pang_score_normal);
        classLayout(_parent, "bonus_pang_score_natural", this.bonus_pang_score_natural);
        classLayout(_parent, "par_score_hole", this.par_score_hole);
    }
}

class MatchSpecialType {
    static NORMAL = 0;
    static SPECIAL_1 = 1;
    static SPECIAL_2 = 2;
    static GRAND_PRIX = 3;
}

// match_type (8 bits) do Match.iff: valores observados nos dados reais (379
// itens). A semântica depende do match_special — NORMAL usa 0; GRAND_PRIX usa
// a classe 1..9 (type == event) e 100/101 no especial (básico/pro); os
// torneios/ladder dos SPECIAL_1/2 usam o id próprio (ex.: 59 = GM Event;
// 128..160 = ladder master mensal 2005-04..2007-12). Valores fora da lista
// caem no input cru do modal de novo item (__allowExtra)
class MatchMatchType {
    static NONE = 0;
    static CLASS_1 = 1;
    static CLASS_2 = 2;
    static CLASS_3 = 3;
    static CLASS_4 = 4;
    static CLASS_5 = 5;
    static CLASS_6 = 6;
    static CLASS_7 = 7;
    static CLASS_8 = 8;
    static CLASS_9 = 9;
    static GM_EVENT = 59;
    static GP_SPECIAL_BASIC = 100;
    static GP_SPECIAL_PRO = 101;
    static LADDER_2005_04 = 128;
    static LADDER_2005_05 = 129;
    static LADDER_2005_06 = 130;
    static LADDER_2005_07 = 131;
    static LADDER_2005_08 = 132;
    static LADDER_2005_09 = 133;
    static LADDER_2005_10 = 134;
    static LADDER_2005_11 = 135;
    static LADDER_2005_12 = 136;
    static LADDER_2006_01 = 137;
    static LADDER_2006_02 = 138;
    static LADDER_2006_03 = 139;
    static LADDER_2006_04 = 140;
    static LADDER_2006_05 = 141;
    static LADDER_2006_06 = 142;
    static LADDER_2006_07 = 143;
    static LADDER_2006_08 = 144;
    static LADDER_2006_09 = 145;
    static LADDER_2006_10 = 146;
    static LADDER_2006_11 = 147;
    static LADDER_2006_12 = 148;
    static LADDER_2007_01 = 149;
    static LADDER_2007_02 = 150;
    static LADDER_2007_03 = 151;
    static LADDER_2007_04 = 152;
    static LADDER_2007_05 = 153;
    static LADDER_2007_06 = 154;
    static LADDER_2007_07 = 155;
    static LADDER_2007_08 = 156;
    static LADDER_2007_09 = 157;
    static LADDER_2007_10 = 158;
    static LADDER_2007_11 = 159;
    static LADDER_2007_12 = 160;
}
Object.defineProperty(MatchMatchType, "__allowExtra", { value: true });

// match_event (8 bits) do Match.iff: 0..12 = classificação normal (0..5 =
// amador 6..1, 6..12 = pro 1..7); 100 = event do grand prix especial (type
// 100/101). Nos torneios dos SPECIAL_1/2 o event é o id do evento (0..2, 10,
// ...) — valores fora da lista caem no input cru do modal (__allowExtra)
class MatchMatchEvent {
    static AMADOR_6 = 0;
    static AMADOR_5 = 1;
    static AMADOR_4 = 2;
    static AMADOR_3 = 3;
    static AMADOR_2 = 4;
    static AMADOR_1 = 5;
    static PRO_1 = 6;
    static PRO_2 = 7;
    static PRO_3 = 8;
    static PRO_4 = 9;
    static PRO_5 = 10;
    static PRO_6 = 11;
    static PRO_7 = 12;
    static GP_ESPECIAL = 100;
}
Object.defineProperty(MatchMatchEvent, "__allowExtra", { value: true });

class Match extends BaseTypeidUnique {
    active = new Int32Type(true, true, true);
    typeid = new Int32Type(false, true, true);
    name = new StringType(80, StringTypeRelation.TEXT);
    level = new Level();
    trophy = Array(6).fill(0).map(_ => new StringType(40, StringTypeRelation.ASSET.TROPHY));
    unknown = Array(3).fill(0).map(_ => new Int8Type(false, true));

    static createTypeidbit(_typeid = 0) {
        return new BitfieldType(
            new Int32Type(false, true, true),
            {
                match_num: 8,
                match_type: 8,
                match_event: 8,
                match_special: 2,
                iff_identity: 6
            },
            _typeid
        )
    }

    static generateTypeid(_special = 0, _event = 0, _type = 0) {
        
        const typeidbit = Match.createTypeidbit();

        typeidbit.iff_identity = IFF_GROUP_ID.MATCH;
        typeidbit.match_special = _special;
        typeidbit.match_event = _event;
        typeidbit.match_type = _type;

        return typeidbit;
    }

    filter(_element) {
        const typeidbit = Match.createTypeidbit(this.typeid.value);
        const typeidbit2 = Match.createTypeidbit(_element.typeid.value);

        return typeidbit.iff_identity == typeidbit2.iff_identity
            && typeidbit.match_special == typeidbit2.match_special
            && typeidbit.match_event == typeidbit2.match_event
            && typeidbit.match_type == typeidbit2.match_type;
    }

    constructor(_data = undefined) {
        super();
        if (_data)
            this.unserialize(_data.getBuffer(this.getSize()));
    }

    getSize() {
        return this.active.getSize() + this.typeid.getSize() + this.name.getSize()
            + this.level.getSize() + this.trophy.reduce((acc, v) => acc + v.getSize(), 0)
            + this.unknown.reduce((acc, v) => acc + v.getSize(), 0);
    }

    unserialize(_data) {
        this.active.unserialize(_data.getBuffer(this.active.getSize()));
        this.typeid.unserialize(_data.getBuffer(this.typeid.getSize()));
        this.name.unserialize(_data.getBuffer(this.name.getSize()));
        this.level.unserialize(_data.getBuffer(this.level.getSize()));
        this.trophy.forEach(v => v.unserialize(_data.getBuffer(v.getSize())));
        this.unknown.forEach(v => v.unserialize(_data.getBuffer(v.getSize())));
    }
    serialize(_data) {
        this.active.serialize(_data);
        this.typeid.serialize(_data);
        this.name.serialize(_data);
        this.level.serialize(_data);
        this.trophy.forEach(v => v.serialize(_data));
        this.unknown.forEach(v => v.serialize(_data));
    }
    getIdentifyName() {
        return `${this.typeid.value.toString(16)} ${this.name.value}`;
    }
    layout(_parent) {
        this.active.layout(_parent, "active");
        this.typeid.layout(_parent, "typeid");
        this.name.layout(_parent, "name");
        _parent.appendChild(arrayLayout(this.trophy, "trophy"));
        classLayout(_parent, "level", this.level);


        _parent.appendChild(arrayLayout(this.unknown, "unknown"));
    }
}

class Enchant extends BaseTypeidUnique {
    active = new Int32Type(true, true, true);
    typeid = new Int32Type(false, true, true);
    pang = new Int64Type(false, true, true); // BigInt

    static createTypeidbit(_typeid = 0) {
        return new BitfieldType(
            new Int32Type(false, true, true),
            {
                up_value: 20,
                stats_type: 6,
                iff_identity: 6
            },
            _typeid
        )
    }

    static generateTypeid(_stats_type = 0, _up_value = 0) {

        const typeidbit = Enchant.createTypeidbit();

        typeidbit.iff_identity = IFF_GROUP_ID.ENCHANT;
        typeidbit.stats_type = _stats_type;
        typeidbit.up_value = _up_value;

        return typeidbit;
    }

    filter(_element) {
        const typeidbit = Enchant.createTypeidbit(this.typeid.value);
        const typeidbit2 = Enchant.createTypeidbit(_element.typeid.value);

        return typeidbit.iff_identity == typeidbit2.iff_identity
            && typeidbit.stats_type == typeidbit2.stats_type;
    }

    constructor(_data = undefined) {
        super();
        if (_data)
            this.unserialize(_data.getBuffer(this.getSize()));
    }

    getSize() {
        return this.active.getSize() + this.typeid.getSize()
            + this.pang.getSize();
    }

    unserialize(_data) {
        this.active.unserialize(_data.getBuffer(this.active.getSize()));
        this.typeid.unserialize(_data.getBuffer(this.typeid.getSize()));
        this.pang.unserialize(_data.getBuffer(this.pang.getSize()));
    }
    serialize(_data) {
        this.active.serialize(_data);
        this.typeid.serialize(_data);
        this.pang.serialize(_data);
    }
    getIdentifyName() {
        return this.typeid.value.toString(16);
    }
    layout(_parent) {
        this.active.layout(_parent, "active");
        this.typeid.layout(_parent, "typeid");
        this.pang.layout(_parent, "pang");
    }
}

class SkinType {
    static BACKGROUND = 0;
    static FRAME = 1;
    static STICKER = 2;
    static SLOT = 3;
    static LEVEL = 4;
    static CUTIN = 5;
    static TITLE = 6;
}

// labels dos preços do Skin quando o time_shop está ATIVO
const kSkinPriceLabels = ['ONE_DAY', 'ONE_WEEK', 'TWO_WEEK', 'ONE_MONTH', 'ONE_YEAR'];

// labels do filter_type do MemorialShop (slots 5..9 sem label — uso
// desconhecido até hoje; verificado nos packs JP e US: slot0 só tipos de item
// (SETITEM/WING/EAR/...), slot1 só MAN/WOMAN, slot2 só estações, slot3 só
// eventos e slot4 só characters)
const kMemorialShopFilterLabels = ['Tipo', 'Gênero', 'Estação', 'Evento', 'Character'];

class Skin extends Base {
    mpet = new StringType(40, StringTypeRelation.ASSET.MODEL);
    horizontal_scroll = new Int8Type(false, true);
    vertical_scroll = new Int8Type(false, true);
    price = Array(5).fill(0).map(_ => new Int16Type(false, true, true));

    static createTypeidbit(_typeid = 0) {
        return new BitfieldType(new Int32Type(false, true, true), {
            num: 22,
            type: 4,
            iff_identity: 6
        }, _typeid);
    }

    static generateTypeid(_type = 0) {
        
        const typeidbit = Skin.createTypeidbit();

        typeidbit.iff_identity = IFF_GROUP_ID.SKIN;
        typeidbit.type = _type;

        return typeidbit;
    }

    filter(_element) {
        const typeidbit = Skin.createTypeidbit(this.typeid.value);
        const typeidbit2 = Skin.createTypeidbit(_element.typeid.value);

        return typeidbit.iff_identity == typeidbit2.iff_identity
            && typeidbit.type == typeidbit2.type;
    }

    constructor(_data = undefined) {
        super();
        if (_data)
            this.unserialize(_data.getBuffer(this.getSize()));
    }

    getSize() {
        return super.getSize() + this.mpet.getSize() + this.horizontal_scroll.getSize()
            + this.vertical_scroll.getSize() + this.price.reduce((acc, v) => acc + v.getSize(), 0);
    }

    unserialize(_data) {
        super.unserialize(_data.getBuffer(super.getSize()));
        this.mpet.unserialize(_data.getBuffer(this.mpet.getSize()));
        this.horizontal_scroll.unserialize(_data.getBuffer(this.horizontal_scroll.getSize()));
        this.vertical_scroll.unserialize(_data.getBuffer(this.vertical_scroll.getSize()));
        this.price.forEach(v => v.unserialize(_data.getBuffer(v.getSize())));
    }
    serialize(_data) {
        super.serialize(_data);
        this.mpet.serialize(_data);
        this.horizontal_scroll.serialize(_data);
        this.vertical_scroll.serialize(_data);
        this.price.forEach(v => v.serialize(_data));
    }
    layout(_parent) {
        super.layout(_parent);
        this.mpet.layout(_parent, "mpet");
        this.horizontal_scroll.layout(_parent, "horizontal_scroll");
        this.vertical_scroll.layout(_parent, "vertical_scroll");

        // labels ONE_DAY..ONE_YEAR no price SÓ com time_shop ativo; o toggle
        // do active re-renderiza o row do price ao vivo (labels aparecem
        // quando ativa e somem quando desativa — o price é o último campo,
        // então o rebuild no fim do _parent preserva a ordem)
        const priceLabels =
            () => this.shop && this.shop.time_shop && this.shop.time_shop.active
                && this.shop.time_shop.active.value === 1
                ? { getName: _i => kSkinPriceLabels[_i] }
                : null;

        let priceGroup = _parent.appendChild(arrayLayout(this.price, "price", priceLabels()));

        const isCashFn = () => this.shop.flag_shop.type.is_cash;

        const toggleCashFn = () => {
            this.shop.flag_shop.type.is_cash =
                this.shop.flag_shop.type.is_cash === 1 ? 0 : 1;
        };

        const applyPangCash = () => {
            if (!priceLabels())
                return;
            if (priceGroup && (priceGroup.parentNode || priceGroup.parent) === _parent)
                applyPangCashPrefix(priceGroup, isCashFn, toggleCashFn);
        };

        applyPangCash();
        // registrado 1x (o toggle so chama applyPangCash p/ refresh, nao re-registra)
        this.shop.flag_shop.type.addPangCashListener(applyPangCash);

        const tsRow = this.shop && this.shop.time_shop && this.shop.time_shop.active
            && this.shop.time_shop.active._row;

        // busca em 2 passos (o querySelectorAll do domstub não entende
        // descendência — mesmo padrão do Item.layout)
        const tsBoolField =
            tsRow && tsRow.querySelector('.bool-field');

        const activeInput =
            tsBoolField && tsBoolField.querySelector('input[type=checkbox]');

        if (activeInput) {
            activeInput.addEventListener('change', () => {
                if ((priceGroup.parentNode || priceGroup.parent) === _parent) {
                    const novo = arrayLayout(this.price, "price", priceLabels());
                    _parent.replaceChild(novo, priceGroup);
                    priceGroup = novo;
                    applyPangCash();
                }
            });
        }
    }
}

// monta field-col + select de enum/lista no painel de info geral (mesmo padrão
// do createEnumValueType — classe form-select level-select + makeChoices):
//   _opts.options(_select)   preenche as options (init e rebuild)
//   _opts.onChange(_value)   callback do change (depois de gravar no campo)
// retorna o select montado
function buildFieldSelection(_parent, _name, _opts) {

    const container =
        document.createElement('div');

    container.className =
        'field-col';

    const label =
        document.createElement('span');

    label.className =
        'type-label';

    label.textContent =
        _name + ': ';

    container.appendChild(label);

    const select =
        document.createElement('select');

    select.className =
        'form-select level-select';

    if (_name)
        select.dataset.field = _name;

    if (_opts.options)
        _opts.options(select);

    select.addEventListener('change', evt => {

        if (_opts.onChange)
            _opts.onChange(Number(evt.target.value));
    });

    container.appendChild(select);

    _parent.appendChild(container);

    // selects que listam itens de iffs (character/character_id) ganham o
    // campo de busca do Choices no dropdown
    makeChoices(select, { searchEnabled: !!_opts.searchEnabled });

    select._fieldContainer = container;

    return select;
}

// preenche um select com os typeids de um iff (label `id — nome`), opcional
// incluindo um valor atual fora da lista (ex.: item novo/inválido). Usado por
// selects que listam ids de outro iff no layout (course_info.course do
// GrandPrixData.iff lista os typeids do Course.iff, igual ao character do
// HairStyle.iff que lista os do Character.iff)
function fillIffTypeidOptions(_select, _iffName, _currentValue, _extra = null) {

    const all =
        (typeof window !== 'undefined' && window.iffs) || iffs;

    const iff =
        (all || []).find(i => i.name === _iffName);

    const ids =
        new Map();

    if (iff && iff.elements)
        for (const el of iff.elements) {
            if (el.__deleted || el.__deleted2 || el.typeid == null)
                continue;

            const id = getTypeidNum(el);
            const name = el.name ? stripEncodingMarker(el.name.value) : String(id);

            ids.set(id, name);
        }

    // opções extras FIXAS — sempre presentes para o usuário poder escolher
    // (ex.: o course 127 é sempre RANDOM no GrandPrixData.iff)
    if (Array.isArray(_extra))
        for (const [value, label] of _extra)
            ids.set(value, label);

    // valor atual fora da lista (ex.: item novo/inválido)
    if (_currentValue != null && !ids.has(_currentValue))
        ids.set(_currentValue, _currentValue === 127 ? 'RANDOM' : (_iffName + ' ' + _currentValue));

    for (const id of [...ids.keys()].sort((a, b) => a - b)) {

        const opt =
            document.createElement('option');

        opt.value = String(id);
        opt.textContent = id + ' — ' + ids.get(id);

        if (id === _currentValue)
            opt.selected = true;

        _select.appendChild(opt);
    }

    if (_currentValue != null)
        _select.value = String(_currentValue);
}

class HairStyle extends Base {
    cor = new Int8Type(false, true);
    character = new Int8Type(false, true);
    point = new Int16Type(false, true, true); // pode ser align memory

    static createTypeidbit(_typeid = 0) {
        return new BitfieldType(
            new Int32Type(false, true, true),
            {
                num: 25,
                is_new: 1,
                iff_identity: 6
            },
            _typeid
        )
    }

    static generateTypeid(_is_new = 0) {

        const typeidbit = HairStyle.createTypeidbit();

        typeidbit.iff_identity = IFF_GROUP_ID.HAIR_STYLE;
        typeidbit.is_new = _is_new;

        return typeidbit;
    }

    filter(_element) {
        const typeidbit = HairStyle.createTypeidbit(this.typeid.value);
        const typeidbit2 = HairStyle.createTypeidbit(_element.typeid.value);

        return typeidbit.iff_identity == typeidbit2.iff_identity
            && typeidbit.is_new == typeidbit2.is_new;
    }

    constructor(_data = undefined) {
        super();
        if (_data)
            this.unserialize(_data.getBuffer(this.getSize()));
    }

    getSize() {
        return super.getSize() + this.cor.getSize() + this.character.getSize() + this.point.getSize();
    }

    unserialize(_data) {
        super.unserialize(_data.getBuffer(super.getSize()));
        this.cor.unserialize(_data.getBuffer(this.cor.getSize()));
        this.character.unserialize(_data.getBuffer(this.character.getSize()));
        this.point.unserialize(_data.getBuffer(this.point.getSize()));
    }
    serialize(_data) {
        super.serialize(_data);
        this.cor.serialize(_data);
        this.character.serialize(_data);
        this.point.serialize(_data);
    }
    layout(_parent) {
        super.layout(_parent);

        // character: select com os characters (Character.iff — label `id — nome`);
        // o id grava direto no campo do item (SEM bit no typeid — o typeid só
        // usa num/is_new/iff_identity; o modal de novo item tem só o is_new)
        const chSel =
            buildFieldSelection(_parent, 'character', {
                searchEnabled: true,
                options: select => this._fillCharacterOptions(select),
                onChange: value => {
                    this.character.value = value;
                    this._repaintCor();
                },
            });

        this._characterSelect = chSel;

        // cor: select com a PALETA do character escolhido — o MESMO índice de
        // `cor` é uma cor diferente por character (dados reais: ícones/nomes
        // conferem); trocar o character acima repopula as opções ao vivo
        const corField =
            document.createElement('div');

        corField.className =
            'field-col';

        const corLabel =
            document.createElement('span');

        corLabel.className =
            'type-label';

        corLabel.textContent =
            'cor: ';

        corField.appendChild(corLabel);

        const corSel =
            this._buildCorSelect();

        corField.appendChild(corSel);

        _parent.appendChild(corField);

        makeChoices(corSel);

        this._corSelect = corSel;
        this._corContainer = corField;
        this._corExtraMode = false;

        this.point.layout(_parent, "point");
    }

    // preenche o select do character: ids do Character.iff (+ valor atual se
    // estiver fora, ex.: item novo pendente) com label `id — nome`
    _fillCharacterOptions(_select) {

        const all =
            (typeof window !== 'undefined' && window.iffs) || iffs;

        const chIff =
            (all || []).find(i => i.name === 'Character.iff');

        const ids =
            new Set();

        if (chIff && chIff.elements)
            for (const el of chIff.elements)
                if (!el.__deleted && !el.__deleted2 && el.typeid)
                    ids.add(getTypeidNum(el));

        if (!ids.has(this.character.value))
            ids.add(this.character.value);

        for (const id of [...ids].sort((a, b) => a - b)) {

            const opt =
                document.createElement('option');

            opt.value = id;

            let name = String(id);

            if (chIff) {

                const el =
                    chIff.elements.find(e => !e.__deleted && !e.__deleted2
                        && getTypeidNum(e) === id);

                if (el && el.name)
                    name = String(id) + ' — ' + stripEncodingMarker(el.name.value);
            }

            opt.textContent = name;

            _select.appendChild(opt);
        }

        _select.value = this.character.value;
    }

    // preenche o select da cor com a paleta do character atual (catálogo
    // HairStyleCor quando o character não está no pall); valor fora da paleta
    // vira a opção crua `N — (fora da lista)` pré-selecionada
    _fillCorOptions(_select) {

        const cur =
            Number(this.cor.value) || 0;

        const charId =
            Number(this.character.value);

        const pall =
            Object.prototype.hasOwnProperty.call(HairStyleCorPall, charId)
                ? HairStyleCorPall[charId]
                : HairStyleCor;

        const entries =
            Object.entries(pall).filter(([, v]) => typeof v === 'number');

        const inPall =
            entries.some(([, v]) => v === cur);

        for (const [name, value] of entries) {

            const opt =
                document.createElement('option');

            opt.value = value;
            opt.textContent = String(value) + ' — ' + name;

            _select.appendChild(opt);
        }

        if (!inPall) {

            const opt =
                document.createElement('option');

            opt.value = cur;
            opt.textContent = String(cur) + ' — (fora da lista)';

            _select.appendChild(opt);
        }

        _select.value = cur;

        // opção final __extra (mesmo padrão do modal do Match): "Outro (valor
        // fora da lista)…" — escolher troca o select por um input p/ digitar
        const extra =
            document.createElement('option');

        extra.value = '__extra';
        extra.textContent = 'Outro (valor fora da lista)…';

        _select.appendChild(extra);
    }

    // monta o select da cor (paleta do character + crua do atual fora + opção
    // final __extra que vira input no MESMO row); o change do select grava no
    // campo e o do input (modo __extra) também — SEM makeChoices (chamado pelo
    // layout e pelo repaint, cada um aplica o widget depois)
    _buildCorSelect() {

        const select =
            document.createElement('select');

        select.className =
            'form-select level-select';

        select.dataset.field =
            'cor';

        this._fillCorOptions(select);

        // change normal: grava no campo (o __extra não é valor do campo)
        select.addEventListener('change', evt => {

            if (evt.target.value === '__extra')
                return;

            const v =
                Number(evt.target.value);

            if (v !== this.cor.value)
                this.cor.value = v;
        });

        // opção final "__extra" → troca o select por um input no mesmo row
        // (padrão do modal do Match; o input vem pré-preenchido com o valor
        // atual do campo); o change do input grava via a mesma regra
        select.addEventListener('change', () => {

            if (select.value !== '__extra')
                return;

            destroyChoices(select);

            const wrap =
                select.parentElement || select.parent;

            if (!wrap)
                return;

            const input =
                document.createElement('input');

            input.type = 'text';
            input.className = 'form-control';
            input.placeholder = 'Valor fora da lista';
            input.value =
                String(Number(this.cor.value) || 0);

            input.addEventListener('change', () => {

                const n = Number(input.value);

                if (!Number.isFinite(n))
                    return;

                const v =
                    Math.trunc(n) || 0;

                if (v !== this.cor.value)
                    this.cor.value = v;
            });

            wrap.replaceChild(input, select);

            this._corExtraMode = true;

            input.focus();
        });

        return select;
    }

    // repopula as options da cor conforme o character atual (rebuild do widget
    // Choices no browser; no stub o select nativo é a UI — posição preservada);
    // se estava no modo input (__extra escolhido) volta a ser select recriado
    _repaintCor() {

        const container =
            this._corContainer;

        if (!container)
            return;

        const cur =
            container.querySelector('input') || container.querySelector('select');

        if (this._corExtraMode && cur && cur.tagName === 'INPUT') {

            destroyChoices(this._corSelect);

            const select =
                this._buildCorSelect();

            container.replaceChild(select, cur);

            makeChoices(select);

            this._corSelect = select;
            this._corExtraMode = false;

            return;
        }

        const select =
            this._corSelect;

        if (!select)
            return;

        destroyChoices(select);

        select.innerHTML = '';

        this._fillCorOptions(select);

        makeChoices(select);
    }
}

// tipo do Achievement — achievement_tipo no layout E o bit `class` do typeid
// no modal de novo item (mesmo enum para os dois)
class AchievementTipo {
    static GAME_MODE = 0;
    static CHARACTER = 1;
    static RECORDS = 2;
    static EXPLORE = 3;
    static ITEM = 4;
    static CHALLENGE = 5;
    static SYSTEM = 6;
    static EVENT = 7;

    static getName(_value) {
        return Object.entries(AchievementTipo).find(([, v]) => v === _value)?.[0];
    }

    static getValue(_name) {
        return AchievementTipo[_name];
    }
}

const AchievementTipoValue32 = createEnumValueType(Int32Type, AchievementTipo);

class Achievement extends Base {
    typeid_quest_index = new QuestStuffTypeidLinkValue();
    achievement_tipo = new AchievementTipoValue32();
    quest_name = Array(10).fill(0).map(_ => new StringType(129, StringTypeRelation.TEXT));
    unknown1 = new Int16Type(false, true, true);
    quest_typeid = Array(10).fill(0).map(_ => new QuestStuffTypeidLinkValue());
    unknown2 = new Int32Type(false, true, true);

    static createTypeidbit(_typeid = 0) {
        return new BitfieldType(
            new Int32Type(false, true, true),
            {
                num: 22,
                class: 4,
                iff_identity: 6
            },
            _typeid
        )
    }

    static generateTypeid(_class = 0) {

        const typeidbit = Achievement.createTypeidbit();

        typeidbit.iff_identity = IFF_GROUP_ID.ACHIEVEMENT;
        typeidbit.class = _class;

        return typeidbit;
    }

    filter(_element) {
        const typeidbit = Achievement.createTypeidbit(this.typeid.value);
        const typeidbit2 = Achievement.createTypeidbit(_element.typeid.value);

        return typeidbit.iff_identity == typeidbit2.iff_identity
            && typeidbit.class == typeidbit2.class;
    }

    constructor(_data = undefined) {
        super();
        if (_data)
            this.unserialize(_data.getBuffer(this.getSize()));
    }

    getSize() {
        return super.getSize() + this.typeid_quest_index.getSize() + this.achievement_tipo.getSize()
            + this.quest_name.reduce((acc, v) => acc + v.getSize(), 0) + this.unknown1.getSize()
            + this.quest_typeid.reduce((acc, v) => acc + v.getSize(), 0) + this.unknown2.getSize();
    }

    unserialize(_data) {
        super.unserialize(_data.getBuffer(super.getSize()));
        this.typeid_quest_index.unserialize(_data.getBuffer(this.typeid_quest_index.getSize()));
        this.achievement_tipo.unserialize(_data.getBuffer(this.achievement_tipo.getSize()));
        this.quest_name.forEach(v => v.unserialize(_data.getBuffer(v.getSize())));
        this.unknown1.unserialize(_data.getBuffer(this.unknown1.getSize()));
        this.quest_typeid.forEach(v => v.unserialize(_data.getBuffer(v.getSize())));
        this.unknown2.unserialize(_data.getBuffer(this.unknown2.getSize()));
    }
    serialize(_data) {
        super.serialize(_data);
        this.typeid_quest_index.serialize(_data);
        this.achievement_tipo.serialize(_data);
        this.quest_name.forEach(v => v.serialize(_data));
        this.unknown1.serialize(_data);
        this.quest_typeid.forEach(v => v.serialize(_data));
        this.unknown2.serialize(_data);
    }
    layout(_parent) {
        super.layout(_parent);
        this.typeid_quest_index.layout(_parent, "typeid_quest_index");
        this.achievement_tipo.layout(_parent, "achievement_tipo");
        this.unknown1.layout(_parent, "unknown1");
        this.unknown2.layout(_parent, "unknown2");
        _parent.appendChild(arrayLayout(this.quest_name, "quest_name"));
        _parent.appendChild(arrayLayout(this.quest_typeid, "quest_typeid"));

        // achievement_tipo: NÃO é editável diretamente — reflete o bit `class`
        // do typeid (a edição do typeid no modal seta o campo via onCreate);
        // o select fica SEMPRE desabilitado e sincronizado com o typeid.
        // (mesmo padrão do time_shop.active/tipo_item do Item.iff)
        const tb_ = Achievement.createTypeidbit(this.typeid.value);

        const tipoSel =
            _parent.querySelector('select[data-field="achievement_tipo"]');

        if (tipoSel && tb_) {

            this.achievement_tipo.value = tb_.class;
            setSelectValue(tipoSel, tb_.class);
            setSelectDisabled(tipoSel, true);
        }
    }
}

// tipo de contador do CounterItem — bit is_achievement_point do typeid
// (ACHIEVEMENT_POINT=0: item do "achievement point" — dados reais
// やりこみポイント; GERAL_POINT=1: contadores de jogo — dados reais
// ゲームカウンター etc., 194 de 195 itens)
class CounterItemPointType {
    static ACHIEVEMENT_POINT = 0;
    static GERAL_POINT = 1;

    static getName(_value) {
        return Object.entries(CounterItemPointType).find(([, v]) => v === _value)?.[0];
    }

    static getValue(_name) {
        return CounterItemPointType[_name];
    }
}

class CounterItem extends BaseFullName {
    info = new StringType(88, StringTypeRelation.TEXT);

    static createTypeidbit(_typeid = 0) {
        return new BitfieldType(
            new Int32Type(false, true, true),
            {
                num: 22,
                is_achievement_point: 4,
                iff_identity: 6
            },
            _typeid
        )
    }

    static generateTypeid(_is_achievement_point = 0) {

        const typeidbit = CounterItem.createTypeidbit();

        typeidbit.iff_identity = IFF_GROUP_ID.COUNTER_ITEM;
        typeidbit.is_achievement_point = _is_achievement_point;

        return typeidbit;
    }

    filter(_element) {
        const typeidbit = CounterItem.createTypeidbit(this.typeid.value);
        const typeidbit2 = CounterItem.createTypeidbit(_element.typeid.value);

        return typeidbit.iff_identity == typeidbit2.iff_identity
            && typeidbit.is_achievement_point == typeidbit2.is_achievement_point;
    }

    constructor(_data = undefined) {
        super();
        if (_data)
            this.unserialize(_data.getBuffer(this.getSize()));
    }

    getSize() {
        return super.getSize() + this.info.getSize();
    }

    unserialize(_data) {
        super.unserialize(_data.getBuffer(super.getSize()));
        this.info.unserialize(_data.getBuffer(this.info.getSize()));
    }
    serialize(_data) {
        super.serialize(_data);
        this.info.serialize(_data);
    }
    layout(_parent) {
        super.layout(_parent);
        this.info.layout(_parent, "info");
    }
}

class AuxPartEfeito {
    power_drive = new Int16Type(false, true, true);
    drop_rate = new Int16Type(false, true, true);
    power_gauge = new Int16Type(false, true, true);
    pang_rate = new Int16Type(false, true, true);
    exp_rate = new Int16Type(false, true, true);
    link_power_drive = new Int16Type(false, true, true); // era item_slot — link do power_drive (usuário)

    constructor(_data = undefined) {
        if (_data)
            this.unserialize(_data.getBuffer(this.getSize()));
    }

    getSize() {
        return this.power_drive.getSize() + this.drop_rate.getSize() + this.power_gauge.getSize()
            + this.pang_rate.getSize() + this.exp_rate.getSize() + this.link_power_drive.getSize();
    }

    unserialize(_data) {
        this.power_drive.unserialize(_data.getBuffer(this.power_drive.getSize()));
        this.drop_rate.unserialize(_data.getBuffer(this.drop_rate.getSize()));
        this.power_gauge.unserialize(_data.getBuffer(this.power_gauge.getSize()));
        this.pang_rate.unserialize(_data.getBuffer(this.pang_rate.getSize()));
        this.exp_rate.unserialize(_data.getBuffer(this.exp_rate.getSize()));
        this.link_power_drive.unserialize(_data.getBuffer(this.link_power_drive.getSize()));
    }
    serialize(_data) {
        this.power_drive.serialize(_data);
        this.drop_rate.serialize(_data);
        this.power_gauge.serialize(_data);
        this.pang_rate.serialize(_data);
        this.exp_rate.serialize(_data);
        this.link_power_drive.serialize(_data);
    }
    layout(_parent) {
        this.power_drive.layout(_parent, "power_drive");
        this.drop_rate.layout(_parent, "drop_rate");
        this.power_gauge.layout(_parent, "power_gauge");
        this.pang_rate.layout(_parent, "pang_rate");
        this.exp_rate.layout(_parent, "exp_rate");
        this.link_power_drive.layout(_parent, "link_power_drive");
    }
}

class AuxPart extends Base {
    cc = Array(5).fill(0).map(_ => new Int16Type(false, true, true));
    c = Array(5).fill(0).map(_ => new Int8Type(false, true));
    slot = Array(5).fill(0).map(_ => new Int8Type(false, true));
    efeito = new AuxPartEfeito();
    link_item_typeid = new QuestStuffRewardTypeidLinkValue();

    static createTypeidbit(_typeid = 0) {
        return new BitfieldType(new Int32Type(false, true, true), {
            num: 16,
            is_infinity: 5,
            is_left_hand: 5,
            iff_identity: 6
        }, _typeid);
    }

    static generateTypeid(_is_infinity = 0, _is_left_hand = 0) {
        
        const typeidbit = AuxPart.createTypeidbit();

        typeidbit.iff_identity = IFF_GROUP_ID.AUX_PART;
        typeidbit.is_infinity = _is_infinity;
        typeidbit.is_left_hand = _is_left_hand;

        return typeidbit;
    }

    filter(_element) {
        const typeidbit = AuxPart.createTypeidbit(this.typeid.value);
        const typeidbit2 = AuxPart.createTypeidbit(_element.typeid.value);

        return typeidbit.iff_identity == typeidbit2.iff_identity
            && typeidbit.is_left_hand == typeidbit2.is_left_hand
            && typeidbit.is_infinity == typeidbit2.is_infinity;
    }

    constructor(_data = undefined) {
        super();
        if (_data)
            this.unserialize(_data.getBuffer(this.getSize()));
    }

    getSize() {
        return super.getSize() + this.cc.reduce((acc, v) => acc + v.getSize(), 0)
            + this.c.reduce((acc, v) => acc + v.getSize(), 0) + this.slot.reduce((acc, v) => acc + v.getSize(), 0)
            + this.efeito.getSize() + this.link_item_typeid.getSize();
    }

    unserialize(_data) {
        super.unserialize(_data.getBuffer(super.getSize()));
        this.cc.forEach(v => v.unserialize(_data.getBuffer(v.getSize())));
        this.c.forEach(v => v.unserialize(_data.getBuffer(v.getSize())));
        this.slot.forEach(v => v.unserialize(_data.getBuffer(v.getSize())));
        this.efeito.unserialize(_data.getBuffer(this.efeito.getSize()));
        this.link_item_typeid.unserialize(_data.getBuffer(this.link_item_typeid.getSize()));
    }
    serialize(_data) {
        super.serialize(_data);
        this.cc.forEach(v => v.serialize(_data));
        this.c.forEach(v => v.serialize(_data));
        this.slot.forEach(v => v.serialize(_data));
        this.efeito.serialize(_data);
        this.link_item_typeid.serialize(_data);
    }
    layout(_parent) {
        super.layout(_parent);
        this.link_item_typeid.layout(_parent, "link_item_typeid");

        // cc: o primeiro índice (0) ganha o label "Quantity" quando o item NÃO
        // é infinity (is_infinity == 0); com is_infinity os 5 campos ficam sem
        // label descritivo (mesmo padrão do c do Item quando o time_shop está
        // inativo — só o índice 0 com label)
        const isInfinity =
            () => AuxPart.createTypeidbit(this.typeid.value).is_infinity === 1;

        _parent.appendChild(arrayLayout(this.cc, "cc", {
            getName: _i => (!isInfinity() && _i === 0 ? "Quantity" : "")
        }));
        _parent.appendChild(arrayLayout(this.c, "c", statistics));
        _parent.appendChild(arrayLayout(this.slot, "slot", statistics));

    	classLayout(_parent, "efeito", this.efeito);
    }
}

// typeid do counter_item do QuestStuff: picker do CounterItem.iff (hex mod
// padrão + botão "…" via TypeidLinkValue — o picker grava o typeid inteiro)
class QuestStuffCounterTypeidLinkValue extends TypeidLinkValue {

    _linkIff = 'CounterItem.iff';
    _linkTitle = "Escolher item do CounterItem.iff";

    constructor(_is_bool_type = false, _little_endian = true, _unsigned = false) {
        super(_is_bool_type, _little_endian, _unsigned);
    }
}

// typeid do reward_item do QuestStuff: mesmos iffs do package.item_typeid do
// SetItem (todos os iffs com item) + o próprio SetItem.iff
class QuestStuffRewardTypeidLinkValue extends SetItemPackageTypeidLinkValue {
    _linkIff = [
        'Character.iff', 'Part.iff', 'ClubSet.iff', 'Ball.iff', 'Item.iff',
        'Caddie.iff', 'Skin.iff', 'HairStyle.iff', 'Mascot.iff', 'AuxPart.iff',
        'Card.iff', 'Furniture.iff', 'SetItem.iff',
    ];
    _linkTitle = "Escolher item (typeid)";
}

class QuestStuffCounterItem {
    typeid = Array(5).fill(0).map(_ => new QuestStuffCounterTypeidLinkValue(false, true, true));
    qntd = Array(5).fill(0).map(_ => new Int32Type());

    constructor(_data = undefined) {
        if (_data)
            this.unserialize(_data.getBuffer(this.getSize()));
    }

    getSize() {
        return this.typeid.reduce((acc, v) => acc + v.getSize(), 0)
            + this.qntd.reduce((acc, v) => acc + v.getSize(), 0);
    }

    unserialize(_data) {
        this.typeid.forEach(v => v.unserialize(_data.getBuffer(v.getSize())));
        this.qntd.forEach(v => v.unserialize(_data.getBuffer(v.getSize())));
    }
    serialize(_data) {
        this.typeid.forEach(v => v.serialize(_data));
        this.qntd.forEach(v => v.serialize(_data));
    }
    layout(_parent) {
        _parent.appendChild(arrayLayout(this.typeid, "typeid"));
        _parent.appendChild(arrayLayout(this.qntd, "qntd"));
    }
}

class QuestStuffRewardItem {
    typeid = Array(3).fill(0).map(_ => new QuestStuffRewardTypeidLinkValue(false, true, true));
    qntd = Array(3).fill(0).map(_ => new Int32Type(false, true, true));
    time = Array(3).fill(0).map(_ => new Int32Type(false, true, true));

    constructor(_data = undefined) {
        if (_data)
            this.unserialize(_data.getBuffer(this.getSize()));
    }

    getSize() {
        return this.typeid.reduce((acc, v) => acc + v.getSize(), 0)
            + this.qntd.reduce((acc, v) => acc + v.getSize(), 0)
            + this.time.reduce((acc, v) => acc + v.getSize(), 0);
    }

    unserialize(_data) {
        this.typeid.forEach(v => v.unserialize(_data.getBuffer(v.getSize())));
        this.qntd.forEach(v => v.unserialize(_data.getBuffer(v.getSize())));
        this.time.forEach(v => v.unserialize(_data.getBuffer(v.getSize())));
    }
    serialize(_data) {
        this.typeid.forEach(v => v.serialize(_data));
        this.qntd.forEach(v => v.serialize(_data));
        this.time.forEach(v => v.serialize(_data));
    }
    layout(_parent) {
        _parent.appendChild(arrayLayout(this.typeid, "typeid"));
        _parent.appendChild(arrayLayout(this.qntd, "qntd"));
        _parent.appendChild(arrayLayout(this.time, "time"));
    }
}

class QuestStuffType {
    static QUEST_DROP_S2 = 0; // quest drop do season 2 (BR) — dados reais do QuestDrop.iff: type 0
    static QUEST_UNKNOWN = 1; // desconhecido — não aparece nos dados atuais (dica do season 2)
    static QUEST_STUFF = 2; // quest stuff (JP)

    static getName(_value) {
        return Object.entries(QuestStuffType).find(([, v]) => v === _value)?.[0];
    }

    static getValue(_name) {
        return QuestStuffType[_name];
    }
}

class QuestStuff extends BaseFullName {
    counter_item = new QuestStuffCounterItem();
    reward_item = new QuestStuffRewardItem();

    static createTypeidbit(_typeid = 0) {
        return new BitfieldType(new Int32Type(false, true, true), {
            num: 22,
            type: 4,
            iff_identity: 6
        }, _typeid);
    }

    static generateTypeid(_type = QuestStuffType.QUEST_STUFF) { // 0/1 = quest drop season 2 (BR), 2 = quest stuff (JP) — confirmado nos packs S2
        
        const typeidbit = QuestStuff.createTypeidbit();

        typeidbit.iff_identity = IFF_GROUP_ID.QUEST_STUFF;
        typeidbit.type = _type;

        return typeidbit;
    }

    filter(_element) {
        const typeidbit = QuestStuff.createTypeidbit(this.typeid.value);
        const typeidbit2 = QuestStuff.createTypeidbit(_element.typeid.value);

        return typeidbit.iff_identity == typeidbit2.iff_identity
            && typeidbit.type == typeidbit2.type;
    }

    constructor(_data = undefined) {
        super();
        if (_data)
            this.unserialize(_data.getBuffer(this.getSize()));
    }

    getSize() {
        return super.getSize() + this.counter_item.getSize() + this.reward_item.getSize();
    }

    unserialize(_data) {
        super.unserialize(_data.getBuffer(super.getSize()));
        this.counter_item.unserialize(_data.getBuffer(this.counter_item.getSize()));
        this.reward_item.unserialize(_data.getBuffer(this.reward_item.getSize()));
    }
    serialize(_data) {
        super.serialize(_data);
        this.counter_item.serialize(_data);
        this.reward_item.serialize(_data);
    }
    layout(_parent) {
        super.layout(_parent);

        classLayout(_parent, "counter_item", this.counter_item);
        classLayout(_parent, "reward_item", this.reward_item);
    }
}

class QuesItemQuest {
    qntd = new Int32Type(false, true, true);
    typeid = Array(10).fill(0).map(_ => new QuestStuffTypeidLinkValue(false, true, true));

    constructor(_data = undefined) {
        if (_data)
            this.unserialize(_data.getBuffer(this.getSize()));
    }

    getSize() {
        return this.qntd.getSize() + this.typeid.reduce((acc, v) => acc + v.getSize(), 0);
    }

    unserialize(_data) {
        this.qntd.unserialize(_data.getBuffer(this.qntd.getSize()));
        this.typeid.forEach(v => v.unserialize(_data.getBuffer(v.getSize())));
    }
    serialize(_data) {
        this.qntd.serialize(_data);
        this.typeid.forEach(v => v.serialize(_data));
    }
    layout(_parent) {
        this.qntd.layout(_parent, "qntd");
        _parent.appendChild(arrayLayout(this.typeid, "typeid"));
    }
}

class QuesItemReward {
    typeid = Array(2).fill(0).map(_ => new QuestStuffRewardTypeidLinkValue(false, true, true));
    qntd = Array(2).fill(0).map(_ => new Int32Type(false, true, true));
    time = Array(2).fill(0).map(_ => new Int32Type(false, true, true));

    constructor(_data = undefined) {
        if (_data)
            this.unserialize(_data.getBuffer(this.getSize()));
    }

    getSize() {
        return this.typeid.reduce((acc, v) => acc + v.getSize(), 0)
            + this.qntd.reduce((acc, v) => acc + v.getSize(), 0)
            + this.time.reduce((acc, v) => acc + v.getSize(), 0);
    }
    
    unserialize(_data) {
        this.typeid.forEach(v => v.unserialize(_data.getBuffer(v.getSize())));
        this.qntd.forEach(v => v.unserialize(_data.getBuffer(v.getSize())));
        this.time.forEach(v => v.unserialize(_data.getBuffer(v.getSize())));
    }
    serialize(_data) {
        this.typeid.forEach(v => v.serialize(_data));
        this.qntd.forEach(v => v.serialize(_data));
        this.time.forEach(v => v.serialize(_data));
    }
    layout(_parent) {
        _parent.appendChild(arrayLayout(this.typeid, "typeid"));
        _parent.appendChild(arrayLayout(this.qntd, "qntd"));
        _parent.appendChild(arrayLayout(this.time, "time"));
    }
}

class QuestItemType {
    static NORMAL = 0;
    static CLEAR_QUEST_ACHIEVEMENT = 1;
    static CLEAR_DAYLY_QUEST = 2;

    static getName(_value) {
        return Object.entries(QuestItemType).find(([, v]) => v === _value)?.[0];
    }

    static getValue(_name) {
        return QuestItemType[_name];
    }
}

// enum do CAMPO `type` do QuestItem (dados distintos do bit type do typeid —
// campo {1,2,3}, bit {0,1,2} — não sincronizados)
class QuestItemFieldType {
    static NORMAL = 0;
    static EASY = 1;
    static MEDIUM = 2;
    static HARD = 3;

    static getName(_value) {
        return Object.entries(QuestItemFieldType).find(([, v]) => v === _value)?.[0];
    }

    static getValue(_name) {
        return QuestItemFieldType[_name];
    }
}

const QuestItemTypeValue32 = createEnumValueType(Int32Type, QuestItemType);
const QuestItemFieldTypeValue32 = createEnumValueType(Int32Type, QuestItemFieldType);

class QuestItem extends BaseFullName {
    unknown1 = new Int32Type(false, true, true);
    type = new QuestItemFieldTypeValue32();
    quest = new QuesItemQuest();
    reward = new QuesItemReward();
    unknown2 = new Int32Type(false, true, true);

    static createTypeidbit(_typeid = 0) {
        return new BitfieldType(new Int32Type(false, true, true), {
            num: 22,
            type: 4,
            iff_identity: 6
        }, _typeid);
    }

    static generateTypeid(_quest_clear_type = 0) {

        const typeidbit = QuestItem.createTypeidbit();

        typeidbit.iff_identity = IFF_GROUP_ID.QUEST_ITEM;
        typeidbit.type = _quest_clear_type;

        return typeidbit;
    }

    filter(_element) {
        const typeidbit = QuestItem.createTypeidbit(this.typeid.value);
        const typeidbit2 = QuestItem.createTypeidbit(_element.typeid.value);

        return typeidbit.iff_identity == typeidbit2.iff_identity
            && typeidbit.type == typeidbit2.type;
    }

    constructor(_data = undefined) {
        super();
        if (_data)
            this.unserialize(_data.getBuffer(this.getSize()));
    }
    
    getSize() {
        return super.getSize() + this.unknown1.getSize() + this.type.getSize()
            + this.quest.getSize() + this.reward.getSize() + this.unknown2.getSize();
    }

    unserialize(_data) {
        super.unserialize(_data.getBuffer(super.getSize()));
        this.unknown1.unserialize(_data.getBuffer(this.unknown1.getSize()));
        this.type.unserialize(_data.getBuffer(this.type.getSize()));
        this.quest.unserialize(_data.getBuffer(this.quest.getSize()));
        this.reward.unserialize(_data.getBuffer(this.reward.getSize()));
        this.unknown2.unserialize(_data.getBuffer(this.unknown2.getSize()));
    }
    serialize(_data) {
        super.serialize(_data);
        this.unknown1.serialize(_data);
        this.type.serialize(_data);
        this.quest.serialize(_data);
        this.reward.serialize(_data);
        this.unknown2.serialize(_data);
    }
    layout(_parent) {
        super.layout(_parent);
        this.unknown1.layout(_parent, "unknown1");
        this.type.layout(_parent, "type");
        this.unknown2.layout(_parent, "unknown2");
        classLayout(_parent, "quest", this.quest);
        classLayout(_parent, "reward", this.reward);
    }
}

class CardEfeito {
    type = new CardEfeitoTypeValue16(false, true, true);
    qntd = new Int16Type(false, true, true);

    constructor(_data = undefined) {
        if (_data)
            this.unserialize(_data.getBuffer(this.getSize()));
    }

    getSize() {
        return this.type.getSize() + this.qntd.getSize();
    }

    unserialize(_data) {
        this.type.unserialize(_data.getBuffer(this.type.getSize()));
        this.qntd.unserialize(_data.getBuffer(this.qntd.getSize()));
    }
    serialize(_data) {
        this.type.serialize(_data);
        this.qntd.serialize(_data);
    }
    layout(_parent) {
        this.type.layout(_parent, "type");
        this.qntd.layout(_parent, "qntd");
    }
}

class CardType {
    static CHARACTER = 0;
    static CADDIE = 1;
    static SPECIAL = 2;
    static CARD_PACK = 3;
    static CARD_BOX_PACK = 4;
    static NPC = 5;
}

// raridade da carta (campo `tipo` da struct — dados reais: só 0..3, contagem
// 96/63/39/29 para N/R/SR/SC; o enum CARD_SUB_TYPE do data_iff.h é do S2)
class CardTipo {
    static NORMAL = 0;
    static RARE = 1;
    static SUPER_RARE = 2;
    static SECRET = 3;
}

// volume do pacote (campo `volume` — dados reais: 0..5 + 100 (SPECIAL),
// contagem 22/41/40/46/41/25/12); __allowExtra: valores entre 5 e 100
// (6..99) viram input cru no select do layout e no modal de novo item
class CardVolume {
    static VOLUME_NONE = 0;
    static VOLUME_1 = 1;
    static VOLUME_2 = 2;
    static VOLUME_3 = 3;
    static VOLUME_4 = 4;
    static VOLUME_5 = 5;
    static VOLUME_SPECIAL = 100;

    // labels com o índice (ex.: "0 — VOLUME_NONE") — getter estático não
    // aparece no Object.entries/values (não polui opções/filtros)
    static get __indexLabel() { return true; }
}
Object.defineProperty(CardVolume, "__allowExtra", { value: true });

// efeito da carta (campo `efeito.type`) — os VALORES corretos e nomes ficam
// nos enums por tipo do typeid (CharacterEfeito/CaddieEfeito/SpecialEfeito/
// NpcEfeito/CardPackEfeito, logo abaixo); esta classe é SÓ o dispatcher:
// `forType(_type)` resolve o enum concreto pro layout do campo e `groups()`
// monta os optgroups do filtro (f-card-efeito). Sem valores próprios — o
// `createEnumValueType` usa o enum de `forType(_groupCtx)` (via `_groupCtx`
// setado no Card.layout); valor fora do enum do tipo (ex.: CHARACTER 8/9 =
// lixo de memória qntd=0) vira opção crua do valor cru no select
class CardEfeitoType {
    static NONE = 0; // só o número — nomes nos enums por tipo (NONE em todos)

    // distribuição real dos efeitos por tipo do typeid (all_jp — 227 itens):
    // CHARACTER 0/1/8/9, CADDIE 0..17 (NONE só 1), SPECIAL 0..34 sem 33 (todos),
    // CARD_PACK/CARD_BOX_PACK só NONE, NPC 1..12 — o NONE (0) entra em todos
    // por uniformidade (o select nunca fica vazio ao trocar o typeid)
    static forType(_type = CardType.CHARACTER) {
        switch (_type) {
            case CardType.CHARACTER: return CharacterEfeito;
            case CardType.CADDIE: return CaddieEfeito;
            case CardType.SPECIAL: return SpecialEfeito;
            case CardType.NPC: return NpcEfeito;
            default: return CardPackEfeito; // CARD_PACK/CARD_BOX_PACK
        }
    }

    // grupos para o OPTGROUP do FILTRO (f-card-efeito): os enums separados
    // com os nomes por tipo (em ordem CHARACTER..NPC); o layout NÃO usa grupos
    // — usa direto o enum de forType (createEnumValueType). O `type` de cada
    // grupo vai no dataset.cardType do optgroup (fillEnumFilterOptions) p/ o
    // filtro ligar efeito ↔ type (selecionar um efeito seta o type do grupo;
    // mudar o type reseta o efeito p/ '—' quando não existe no tipo novo)
    static groups() {
        return [
            { label: 'Character Efeito', type: CardType.CHARACTER, enum: CharacterEfeito },
            { label: 'Caddie Efeito', type: CardType.CADDIE, enum: CaddieEfeito },
            { label: 'Special Efeito', type: CardType.SPECIAL, enum: SpecialEfeito },
            { label: 'Npc Efeito', type: CardType.NPC, enum: NpcEfeito },
        ];
    }
}

// efeitos válidos por tipo do typeid da carta — nomes das descrições reais
// (pack all_jp: desc do Desc.iff + nomes dos itens; a família do valor é a
// mesma, o NOME muda por tipo — ex.: 1 é POWER_DECREASE no CHARACTER,
// SUCCESS_RATE no CADDIE, EXP_GAIN no SPECIAL e PP_GAIN no NPC); o NONE (0)
// entra em todos p/ o select nunca ficar vazio. Valores de fora do enum do
// tipo (ex.: CHARACTER 8/9 = lixo de memória, qntd=0) viram opção crua
class CharacterEfeito {
    static NONE = 0; // sem efeito (os slots ficam no c)
    static POWER_DECREASE = 1; // 飛距離-1y (ケン/クー/ネル/スピカ/遠坂凛 SC/SR)
}
class CaddieEfeito {
    static NONE = 0; // sem efeito (slot vazio do conjunto — só o item 0/0)
    static SUCCESS_RATE = 1; // 各種補助剤の成功率増加 (ポンタ)
    static MAXIMUM_DISTANCE = 2; // パターを除くクラブの飛距離増加 (ピピン) — mesmo efeito do SpecialEfeito.MAXIMUM_DISTANCE (27)
    static WIND_DECREASE = 3; // 風速減少 (タンプーR)
    static BOUND_BONUS = 4; // バウンドボーナス (ドルフ)
    static POWER_SHOT_DISTANCE = 5; // パワーショット時の飛距離増加 (ロロ)
    static PANGYA_GAUGE = 6; // パンヤ時のコンボゲージ上昇量増加 (キューマ)
    static IMPACT_ZONE = 7; // インパクトゾーン増加 (カディエSR/SC, セイバーSR, カレンSR)
    static TREASURE_POINT = 8; // トレジャーポイント増加 (ティッキー)
    static TREASURE_POINT_AT_PAR = 9; // パー記録時TP増加量上昇 (ウィンクルピピンN)
    static TREASURE_POINT_AT_BIRDIE = 10; // バーディ記録時TP増加量上昇 (ウィンクルピピンR)
    static IMPACT_ZONE_1M_WIND = 11; // 風速1m時インパクトゾーン増加 (カディエR)
    static WIND_9M_DECREASE = 12; // 風速9m時風速減少 (タンプーN)
    static WIND_1_5_6_9_DECREASE = 13; // 風速1~5m/6~9m減少 (タンプーSC)
    static TREASURE_POINT_AT_EAGLE = 14; // イーグル時TP増加 (ウィンクルピピンSR)
    static IMPACT_ZONE_7_9_WIND = 15; // 風速7~9m時インパクトゾーン増加 (カディエN)
    static STARTING_GAUGE = 16; // パンヤコンボゲージ初期値増加 (ミンティ)
    static WIND_6_9_DECREASE = 17; // 風速6~9m時風速減少(大) (タンプーSR)
}
class SpecialEfeito {
    static NONE = 0; // sem efeito (壊れたエボートの欠片/ソレンR)
    static EXP_GAIN = 1; // IMEDIATO (recebe na hora): 経験値+10/+20/+25/+50 (基礎訓練/双子の訓練/中級訓練/訓練合宿)
    static PP_BONUS_PER_MINUTE = 2; // 2時間 獲得PP+10% (マカロンの心/真心/魂/想い)
    static EXP_BONUS_PER_MINUTE = 3; // 2時間 獲得経験値+10% (シフォンの心, Fate stay/night)
    static PP_POUCH = 4; // IMEDIATO: PP袋 2000/10000/50000 PP (PP袋(小/中/大))
    static POWER_BONUS_PER_MINUTE = 5; // 2時間 パワー+1/+2 (ピピンの応援/後押し)
    static CONTROL_BONUS_PER_MINUTE = 6; // 2時間 コントロール+1/+2 (カディエの魔法/魔術)
    static ACCURACY_BONUS_PER_MINUTE = 7; // 2時間 正確度+1/+2 (ティッキーの祝福/祈り)
    static SPIN_BONUS_PER_MINUTE = 8; // 2時間 スピン+1/+2 (ドルフの応援/芸, ロイの行進)
    static CURVE_BONUS_PER_MINUTE = 9; // 2時間 カーブ+1/+2 (キューマの励まし/激励)
    static STARTING_GAUGE_PER_MINUTE = 10; // 2時間 コンボゲージ初期値増加 (キャディ達の祝福/体力補充パック/ハロウの怒り)
    static MAXIMUM_ITEM_SLOT_PER_MINUTE = 11; // 2時間 装備アイテム最大スロット+1 (ビリーのかばん; 旅行かばん 3時間, スノウのかばん 1時間)
    static PANGYA_ZONE_PER_MINUTE = 12; // 1時間 パンヤインパクトゾーン増加 (レインボーフェザー; 妖精の耳/セイバーR = 30分 — tempo misto no campo `tempo`)
    static CLEAR_BONUS_SEPIA_WIND_PER_MINUTE = 13; // 2時間 セピアウィンドクリアボーナス+10%
    static CLEAR_BONUS_WIND_HILL_PER_MINUTE = 14; // 2時間 ウィンドヒルクリアボーナス+10%
    static CLEAR_BONUS_PINK_WIND_PER_MINUTE = 15; // 2時間 ピンクウィンドクリアボーナス+10%
    static CLEAR_BONUS_BLUE_MOON_PER_MINUTE = 16; // 2時間 ブルームーンクリアボーナス+10%
    static PP_POUCH_RANDOM = 17; // IMEDIATO: ランダムPP袋(小) 3000PP
    static TREASURE_POINT_PER_MINUTE = 18; // 2時間 トレジャーポイント増加 (トレジャーハンター)
    static CHANCE_OF_RAIN_PER_MINUTE = 19; // 1時間 降水確率増加 (ドルフの傘)
    static CLEAR_BONUS_BLUE_LAGOON_PER_MINUTE = 20; // 2時間 ブルーラグーンクリアボーナス+10%
    static CLEAR_BONUS_BLUE_WATER_PER_MINUTE = 21; // 2時間 ブルーウォータークリアボーナス+10%
    static CLEAR_BONUS_SHINING_SAND_PER_MINUTE = 22; // 2時間 シャイニングサンドクリアボーナス+10%
    static CLEAR_BONUS_DEEP_INFERNO_PER_MINUTE = 23; // 2時間 ディープインフェルノクリアボーナス+10%
    static CLEAR_BONUS_SILVIA_CANNON_PER_MINUTE = 24; // 2時間 シルビアキャノンクリアボーナス+10%
    static CLEAR_BONUS_EASTERN_VALLEY_PER_MINUTE = 25; // 2時間 イースタンバレークリアボーナス+10%
    static CLEAR_BONUS_LOST_SEAWAY_PER_MINUTE = 26; // 2時間 ロストシーウェイクリアボーナス+10%
    static MAXIMUM_DISTANCE_PER_MINUTE = 27; // 2時間 飛距離増加(中) (ミンティの愛, 遠坂凛N) — mesmo efeito do CaddieEfeito.MAXIMUM_DISTANCE (2, passivo sem tempo)
    static PANGYA_GAUGE_PER_MINUTE = 28; // 2時間/1時間 パンヤコンボゲージ増加 (ドロシーの魔法/アメリの助言/遠坂凛R)
    static CLEAR_BONUS_ICE_INFERNO_PER_MINUTE = 29; // 2時間 Ice Infernoクリアボーナス+10%
    static CLEAR_BONUS_WIZ_CITY_PER_MINUTE = 30; // 2時間 Wiz Cityクリアボーナス+10%
    static RAIN_EXTEND_PER_MINUTE = 31; // 1時間 ゲーム中雨の場合2ホール連続雨 (レッドパラソル)
    static MULLIGAN_PER_MINUTE = 32; // 30分 忘却化機能 (忘却の花, セイバーN)
    static CLUB_MASTERY_PER_MINUTE = 34; // 1時間 クラブ熟練度+20% (ウィングトロス社の研究)
}
class NpcEfeito {
    static NONE = 0; // sem efeito (uniformidade — dados reais do NPC não têm 0)
    static PP_GAIN = 1; // PP獲得増加 (ルカ)
    static EXP_GAIN = 2; // 経験値獲得増加 (ケイマン)
    static RECORD_BONUS = 3; // 記録ボーナス (クリストファーJ)
    static LONG_PUTT_BONUS = 4; // ロングパットボーナス (ルナーテューム海賊)
    static CONTROL_240Y = 5; // 1W 240y+ コントロール+1 (ミューレンN — デュアル社職人の能力(小))
    static CONTROL_260Y = 6; // 1W 260y+ コントロール+2 (ミューレンR)
    static CONTROL_280Y = 7; // 1W 280y+ コントロール+3 (ミューレンSR)
    static CONTROL_300Y = 8; // 1W 300y+ コントロール+4 (ミューレンSC)
    static IMPACT_ZONE_260Y = 9; // 1W 260y+ インパクトゾーン増加(小) (ティタンチャムN — ギガヤーズ社職人の能力(小))
    static IMPACT_ZONE_280Y = 10; // 1W 280y+ (中) (ティタンチャムR)
    static IMPACT_ZONE_300Y = 11; // 1W 300y+ (大) (ティタンチャムSR)
    static IMPACT_ZONE_320Y = 12; // 1W 320y+ (特) (ティタンチャムSC)
}
// card packs/caixas não têm efeito (todos os itens têm tipo 0 = NONE)
class CardPackEfeito {
    static NONE = 0;
}

const CardTipoValue8 = createEnumValueType(Int8Type, CardTipo);
const CardVolumeValue16 = createEnumValueType(Int16Type, CardVolume);
const CardEfeitoTypeValue16 = createEnumValueType(Int16Type, CardEfeitoType);

class Card extends Base {
    tipo = new CardTipoValue8(false, true);
    img = new StringType(41, StringTypeRelation.ASSET.IMG);
    c = Array(5).fill(0).map(_ => new Int16Type(false, true, true));
    efeito = new CardEfeito();
    // By TH S4 - SubIcon[40], SlotImg[40], BuffImg[40] (era o array texture[3])
    subIcon = new StringType(40, StringTypeRelation.ASSET.TEXTURE);
    slotImg = new StringType(40, StringTypeRelation.ASSET.TEXTURE);
    buffImg = new StringType(40, StringTypeRelation.ASSET.TEXTURE);
    tempo = new Int16Type(false, true, true);
    volume = new CardVolumeValue16(false, true, true);
    position = new Int32Type(false, true, true);
    flag1 = new Int32Type(false, true, true);
    flag2 = new Int32Type(false, true, true);

    static createTypeidbit(_typeid = 0) {
        return new BitfieldType(new Int32Type(false, true, true), {
            num: 22,
            type: 4,
            iff_identity: 6
        }, _typeid);
    }

    static generateTypeid(_card_type = 0) {

        const typeidbit = Card.createTypeidbit();

        typeidbit.iff_identity = IFF_GROUP_ID.CARD;
        typeidbit.type = _card_type;

        return typeidbit;
    }

    filter(_element) {
        const typeidbit = Card.createTypeidbit(this.typeid.value);
        const typeidbit2 = Card.createTypeidbit(_element.typeid.value);

        return typeidbit.iff_identity == typeidbit2.iff_identity
            && typeidbit.type == typeidbit2.type;
    }

    constructor(_data = undefined) {
        super();
        if (_data)
            this.unserialize(_data.getBuffer(this.getSize()));
    }

    getSize() {
        return super.getSize() + this.tipo.getSize() + this.img.getSize()
            + this.c.reduce((acc, v) => acc + v.getSize(), 0) + this.efeito.getSize()
            + this.subIcon.getSize() + this.slotImg.getSize()
            + this.buffImg.getSize() + this.tempo.getSize()
            + this.volume.getSize() + this.position.getSize() + this.flag1.getSize() + this.flag2.getSize();
    }

    unserialize(_data) {
        super.unserialize(_data.getBuffer(super.getSize()));
        this.tipo.unserialize(_data.getBuffer(this.tipo.getSize()));
        this.img.unserialize(_data.getBuffer(this.img.getSize()));
        this.c.forEach(v => v.unserialize(_data.getBuffer(v.getSize())));
        this.efeito.unserialize(_data.getBuffer(this.efeito.getSize()));
        this.subIcon.unserialize(_data.getBuffer(this.subIcon.getSize()));
        this.slotImg.unserialize(_data.getBuffer(this.slotImg.getSize()));
        this.buffImg.unserialize(_data.getBuffer(this.buffImg.getSize()));
        this.tempo.unserialize(_data.getBuffer(this.tempo.getSize()));
        this.volume.unserialize(_data.getBuffer(this.volume.getSize()));
        this.position.unserialize(_data.getBuffer(this.position.getSize()));
        this.flag1.unserialize(_data.getBuffer(this.flag1.getSize()));
        this.flag2.unserialize(_data.getBuffer(this.flag2.getSize()));
    }
    serialize(_data) {
        super.serialize(_data);
        this.tipo.serialize(_data);
        this.img.serialize(_data);
        this.c.forEach(v => v.serialize(_data));
        this.efeito.serialize(_data);
        this.subIcon.serialize(_data);
        this.slotImg.serialize(_data);
        this.buffImg.serialize(_data);
        this.tempo.serialize(_data);
        this.volume.serialize(_data);
        this.position.serialize(_data);
        this.flag1.serialize(_data);
        this.flag2.serialize(_data);
    }
    layout(_parent) {
        super.layout(_parent);
        this.tipo.layout(_parent, "tipo");
        this.img.layout(_parent, "img");
        this.tempo.layout(_parent, "tempo");
        this.volume.layout(_parent, "volume");
        this.position.layout(_parent, "position");
        this.flag1.layout(_parent, "flag1");
        this.flag2.layout(_parent, "flag2");
        // o select do efeito.type usa o enum do tipo do typeid da carta
        // (CardEfeitoType.forType — CharacterEfeito/CaddieEfeito/...); o
        // change do typeid re-renderiza o layout (app.js), trocando o enum
        this.efeito.type._groupCtx =
            Card.createTypeidbit(this.typeid.value).type;
        classLayout(_parent, "efeito", this.efeito);
        this.subIcon.layout(_parent, "subIcon");
        this.slotImg.layout(_parent, "slotImg");
        this.buffImg.layout(_parent, "buffImg");


        _parent.appendChild(arrayLayout(this.c, "c", statistics));
    }
}

class FurnitureLocation {
    x = new FloatType();
    y = new FloatType();
    z = new FloatType();
    r = new FloatType();

    constructor(_data = undefined) {
        if (_data)
            this.unserialize(_data.getBuffer(this.getSize()));
    }

    getSize() {
        return this.x.getSize() + this.y.getSize()
            + this.z.getSize() + this.r.getSize();
    }

    unserialize(_data) {
        this.x.unserialize(_data.getBuffer(this.x.getSize()));
        this.y.unserialize(_data.getBuffer(this.y.getSize()));
        this.z.unserialize(_data.getBuffer(this.z.getSize()));
        this.r.unserialize(_data.getBuffer(this.r.getSize()));
    }
    serialize(_data) {
        this.x.serialize(_data);
        this.y.serialize(_data);
        this.z.serialize(_data);
        this.r.serialize(_data);
    }
    layout(_parent) {
        this.x.layout(_parent, "x");
        this.y.layout(_parent, "y");
        this.z.layout(_parent, "z");
        this.r.layout(_parent, "r");
    }
}

class FurnitureType {
   static CLOSET = 0;
   static SHELF = 1;
   static SHELF2 = 2;
   static TV = 3;
   static SOFA = 4;
   static TABLE = 5;
   static UNKNOWN = 6; // pode ser o table2
   static CELLING = 7;
   static FLOOR = 8;
   static WALLPAPPER = 9;
   static MAILBOX_DEFAULT = 10;
   static MAILBOX1 = 11;
   static MAILBOX2 = 12;
   static ORNAMENT = 13;
   static POSTER = 14;
}

class Furniture extends Base {
    mpet = new StringType(40, StringTypeRelation.ASSET.MODEL);
    num = new Int16Type(false, true, true);
    is_own = new Int16Type(false, true, true);
    is_move = new Int16Type(false, true, true);
    is_function = new Int16Type(false, true, true);
    etc = new Int32Type(false, true, true);
    location = new FurnitureLocation();
    texture = Array(3).fill(0).map(_ => new StringType(40, StringTypeRelation.ASSET.TEXTURE));
    texture_org = Array(3).fill(0).map(_ => new StringType(40, StringTypeRelation.ASSET.TEXTURE));
    c = Array(5).fill(0).map(_ => new Int16Type(false, true, true));
    use_time = new Int16Type(false, true, true);

static createTypeidbit(_typeid = 0) {
        return new BitfieldType(
            new Int32Type(false, true, true),
            {
                num: 11,
                type: 15,
                iff_identity: 6
            },
            _typeid
        )
    }

    static generateTypeid(_furniture_type = 0) {
        
        const typeidbit = Furniture.createTypeidbit();

        typeidbit.iff_identity = IFF_GROUP_ID.FURNITURE;
        typeidbit.type = _furniture_type;

        return typeidbit;
    }

    filter(_element) {
        const typeidbit = Furniture.createTypeidbit(this.typeid.value);
        const typeidbit2 = Furniture.createTypeidbit(_element.typeid.value);

        return typeidbit.iff_identity == typeidbit2.iff_identity
            && typeidbit.type == typeidbit2.type;
    }

    constructor(_data = undefined) {
        super();
        if (_data)
            this.unserialize(_data.getBuffer(this.getSize()));
    }

    getSize() {
        return super.getSize() + this.mpet.getSize() + this.num.getSize() + this.is_own.getSize()
            + this.is_move.getSize() + this.is_function.getSize() + this.etc.getSize() + this.location.getSize()
            + this.texture.reduce((acc, v) => acc + v.getSize(), 0) + this.texture_org.reduce((acc, v) => acc + v.getSize(), 0)
            + this.c.reduce((acc, v) => acc + v.getSize(), 0) + this.use_time.getSize();
    }

    unserialize(_data) {
        super.unserialize(_data.getBuffer(super.getSize()));
        this.mpet.unserialize(_data.getBuffer(this.mpet.getSize()));
        this.num.unserialize(_data.getBuffer(this.num.getSize()));
        this.is_own.unserialize(_data.getBuffer(this.is_own.getSize()));
        this.is_move.unserialize(_data.getBuffer(this.is_move.getSize()));
        this.is_function.unserialize(_data.getBuffer(this.is_function.getSize()));
        this.etc.unserialize(_data.getBuffer(this.etc.getSize()));
        this.location.unserialize(_data.getBuffer(this.location.getSize()));
        this.texture.forEach(v => v.unserialize(_data.getBuffer(v.getSize())));
        this.texture_org.forEach(v => v.unserialize(_data.getBuffer(v.getSize())));
        this.c.forEach(v => v.unserialize(_data.getBuffer(v.getSize())));
        this.use_time.unserialize(_data.getBuffer(this.use_time.getSize()));
    }
    serialize(_data) {
        super.serialize(_data);
        this.mpet.serialize(_data);
        this.num.serialize(_data);
        this.is_own.serialize(_data);
        this.is_move.serialize(_data);
        this.is_function.serialize(_data);
        this.etc.serialize(_data);
        this.location.serialize(_data);
        this.texture.forEach(v => v.serialize(_data));
        this.texture_org.forEach(v => v.serialize(_data));
        this.c.forEach(v => v.serialize(_data));
        this.use_time.serialize(_data);
    }
    layout(_parent) {
        super.layout(_parent);
        this.mpet.layout(_parent, "mpet");
        this.num.layout(_parent, "num");
        this.is_own.layout(_parent, "is_own");
        this.is_move.layout(_parent, "is_move");
        this.is_function.layout(_parent, "is_function");
        this.etc.layout(_parent, "etc");
        this.use_time.layout(_parent, "use_time");
        classLayout(_parent, "location", this.location);
        _parent.appendChild(arrayLayout(this.texture, "texture"));
        _parent.appendChild(arrayLayout(this.texture_org, "texture_org"));


        _parent.appendChild(arrayLayout(this.c, "c"));
    }
}

class CadieMagicBoxItemReceive {
    typeid = new QuestStuffRewardTypeidLinkValue(false, true, true);
    qntd = new Int32Type(false, true, true);

    constructor(_data = undefined) {
        if (_data)
            this.unserialize(_data.getBuffer(this.getSize()));
    }

    getSize() {
        return this.typeid.getSize() + this.qntd.getSize();
    }

    unserialize(_data) {
        this.typeid.unserialize(_data.getBuffer(this.typeid.getSize()));
        this.qntd.unserialize(_data.getBuffer(this.qntd.getSize()));
    }
    serialize(_data) {
        this.typeid.serialize(_data);
        this.qntd.serialize(_data);
    }
    layout(_parent) {
        this.typeid.layout(_parent, "typeid");
        this.qntd.layout(_parent, "qntd");
    }
}

class CadieMagicBoxItemTrade {
    typeid = Array(4).fill(0).map(_ => new QuestStuffRewardTypeidLinkValue(false, true, true));
    qntd = Array(4).fill(0).map(_ => new Int32Type(false, true, true));

    constructor(_data = undefined) {
        if (_data)
            this.unserialize(_data.getBuffer(this.getSize()));
    }

    getSize() {
        return this.typeid.reduce((acc, v) => acc + v.getSize(), 0)
            + this.qntd.reduce((acc, v) => acc + v.getSize(), 0);
    }

    unserialize(_data) {
        this.typeid.forEach(v => v.unserialize(_data.getBuffer(v.getSize())));
        this.qntd.forEach(v => v.unserialize(_data.getBuffer(v.getSize())));
    }
    serialize(_data) {
        this.typeid.forEach(v => v.serialize(_data));
        this.qntd.forEach(v => v.serialize(_data));
    }
    layout(_parent) {

        _parent.appendChild(arrayLayout(this.typeid, "typeid"));
        _parent.appendChild(arrayLayout(this.qntd, "qntd"));
    }
}

class CadieMagicBoxSetorType {
    static BEGINNER = 0;
    static INTERMEDIATE = 1;
    static ADVANCED = 2;
    static SPECIAL = 3;
    static EVENT = 4;

    static getName(_value) {
        return Object.entries(CadieMagicBoxSetorType).find(([, v]) => v === _value)?.[0];
    }
}

const CadieMagicBoxSetorTypeValue32 = createEnumValueType(Int32Type, CadieMagicBoxSetorType);

// character do CadieMagicBox: mesmos nomes do SetItemSubTypeChar mas em Int32
// SIGNED (o arquivo grava sign-extended: 0xFF = -1, 0xFE = -2, ...) — os
// valores altos viram negativos; range efetivo = Int8 signed (-128..127)
class CadieMagicBoxCharacterType {
    static NURI = 0;
    static HANA = 1;
    static AZER = 2;
    static CECILIA = 3;
    static MAX = 4;
    static KOOH = 5;
    static ARIN = 6;
    static KAZ = 7;
    static LUCIA = 8;
    static NELL = 9;
    static SPIKA = 10;
    static NURI_R = 11;
    static HANA_R = 12;
    static AZER_R = 13;
    static CECILIA_R = 14;
    static STC_AUXPART = -5; // 0xFB
    static STC_CLUBSET = -4; // 0xFC
    static STC_CARD = -3; // 0xFD
    static EQUIP_ITEM = -2; // 0xFE
    static NOEQUIP_ITEM = -1; // 0xFF

    static getName(_value) {
        return Object.entries(CadieMagicBoxCharacterType).find(([, v]) => v === _value)?.[0];
    }
}

// valores entre 14 e 0x7F (15..127) e negativos fora do enum via input extra
Object.defineProperty(CadieMagicBoxCharacterType, '__allowExtra', { value: true });

const CadieMagicBoxCharacterTypeValue32 = createEnumValueType(Int32Type, CadieMagicBoxCharacterType);

// box_random_id do CadieMagicBox: picker "de grupo" do CadieMagicBoxRandom no
// esquema do cad_voice_tbl_id do Caddie — o id do CadieMagicBoxRandom não é
// único (o id É o typeid dele, sem unicidade no app), então o picker lista
// 1 item por id (dedup por id) e grava o id do escolhido
class CadieMagicBoxRandomIdLinkValue extends Int32Type {

    _input_mode = 'dec';

    constructor(_is_bool_type = false, _little_endian = true, _unsigned = false) {
        super(_is_bool_type, _little_endian, _unsigned);
    }

    layout(_parent, _name = this.name) {
        super.layout(_parent, _name);

        addTypeidLinkPick(this, _parent, {
            name: _name,
            iff: 'CadieMagicBoxRandom.iff',
            title: 'Escolher box random do CadieMagicBoxRandom.iff',
            mode: 'dec',
            uniqueKey: _item => String(_item.id.value),
            resolve: _item => _item.id.value,
        });
    }
}

class CadieMagicBox extends BaseTypeidUnique {
    seq = new Int32Type(false, true, true);
    active = new Int32Type(true, true, true);
    setor = new CadieMagicBoxSetorTypeValue32(false, true, true);
    character = new CadieMagicBoxCharacterTypeValue32();
    level = new LevelValue32();
    unknown = new Int32Type(false, true, true);
    item_receive = new CadieMagicBoxItemReceive();
    item_trade = new CadieMagicBoxItemTrade();
    box_random_id = new CadieMagicBoxRandomIdLinkValue(false, true, true);
    name = new StringType(40, StringTypeRelation.TEXT);
    date = Array(2).fill(0).map(_ => new SYSTEMTIME());

    get typeid() {
        return this.seq;
    }
    set typeid(_seq) {
        this.seq = _seq;
    }

    filter(_element) {
        return false;
    }

    constructor(_data = undefined) {
        super();
        if (_data)
            this.unserialize(_data.getBuffer(this.getSize()));
    }

    getSize() {
        return this.seq.getSize() + this.active.getSize() + this.setor.getSize()
            + this.character.getSize() + this.level.getSize() + this.unknown.getSize()
            + this.item_receive.getSize() + this.item_trade.getSize()
            + this.box_random_id.getSize() + this.name.getSize()
            + this.date.reduce((acc, v) => acc + v.getSize(), 0);
    }

    unserialize(_data) {
        this.seq.unserialize(_data.getBuffer(this.seq.getSize()));
        this.active.unserialize(_data.getBuffer(this.active.getSize()));
        this.setor.unserialize(_data.getBuffer(this.setor.getSize()));
        this.character.unserialize(_data.getBuffer(this.character.getSize()));
        this.level.unserialize(_data.getBuffer(this.level.getSize()));
        this.unknown.unserialize(_data.getBuffer(this.unknown.getSize()));
        this.item_receive.unserialize(_data.getBuffer(this.item_receive.getSize()));
        this.item_trade.unserialize(_data.getBuffer(this.item_trade.getSize()));
        this.box_random_id.unserialize(_data.getBuffer(this.box_random_id.getSize()));
        this.name.unserialize(_data.getBuffer(this.name.getSize()));
        this.date.forEach(v => v.unserialize(_data.getBuffer(v.getSize())));
    }
    serialize(_data) {
        this.seq.serialize(_data);
        this.active.serialize(_data);
        this.setor.serialize(_data);
        this.character.serialize(_data);
        this.level.serialize(_data);
        this.unknown.serialize(_data);
        this.item_receive.serialize(_data);
        this.item_trade.serialize(_data);
        this.box_random_id.serialize(_data);
        this.name.serialize(_data);
        this.date.forEach(v => v.serialize(_data));
    }
    getIdentifyName() {
        return `${this.seq.value}.${CadieMagicBoxSetorType.getName(this.setor.value) ?? this.setor.value} ${this.name.value}`;
    }
    layout(_parent) {
        this.seq.layout(_parent, "seq");
        this.active.layout(_parent, "active");
        this.name.layout(_parent, "name");
        this.setor.layout(_parent, "setor");
        this.level.layout(_parent, "level");
        this.character.layout(_parent, "character");
        this.unknown.layout(_parent, "unknown");
        this.box_random_id.layout(_parent, "box_random_id");
    	classLayout(_parent, "item_receive", this.item_receive);
    	classLayout(_parent, "item_trade", this.item_trade);
        _parent.appendChild(arrayLayout(this.date, "date"));
    }
}

class FurnitureAbilityType {
    type = new BitfieldType(new Int32Type(false, true, true), {
        buff: 1,
        unknown: 1
    }, 0);

    get buff() {
        return this.type.buff;
    }
    get unknown() {
        return this.type.unknown;
    }
    get value() {
        return this.type.value;
    }

    set buff(_buff) {
        this.type.buff = _buff;
    }
    set unknown(_unknown) {
        this.type.unknown = _unknown;
    }
    set value(_value) {
        this.type.value = _value;
    }

    constructor(_data = undefined) {
        if (_data)
            this.unserialize(_data.getBuffer(this.getSize()));
    }

    getSize() {
        return this.type.getSize();
    }

    unserialize(_data) {
        this.type.unserialize(_data.getBuffer(this.type.getSize()));
    }
    serialize(_data) {
        this.type.serialize(_data);
    }
    layout(_parent) {
        this.type.layout(_parent, "type");
    }
}

class FurnitureAbilitySuccessType {
    type = new BitfieldType(new Int16Type(false, true, true), {
        stay: 1,
        putin: 1,
        putout: 1
    }, 0);

    get stay() {
        return this.type.stay;
    }
    get putin() {
        return this.type.putin;
    }
    get putout() {
        return this.type.putout;
    }
    get value() {
        return this.type.value;
    }

    set stay(_stay) {
        this.type.stay = _stay;
    }
    set putin(_putin) {
        this.type.putin = _putin;
    }
    set putout(_putout) {
        this.type.putout = _putout;
    }
    set value(_value) {
        this.type.value = _value;
    }

    constructor(_data = undefined) {
        if (_data)
            this.unserialize(_data.getBuffer(this.getSize()));
    }

    getSize() {
        return this.type.getSize();
    }

    unserialize(_data) {
        this.type.unserialize(_data.getBuffer(this.type.getSize()));
    }
    serialize(_data) {
        this.type.serialize(_data);
    }
    layout(_parent) {
        this.type.layout(_parent, "type");
    }
}

class FurnitureAbilityEffectType {
    type = new BitfieldType(new Int16Type(false, true, true), {
        me: 1,
        friend: 1,
        guild: 1,
        all: 1
    }, 0);

    get me() {
        return this.type.me;
    }
    get friend() {
        return this.type.friend;
    }
    get guild() {
        return this.type.guild;
    }
    get all() {
        return this.type.all;
    }
    get value() {
        return this.type.value;
    }

    set me(_me) {
        this.type.me = _me;
    }
    set friend(_friend) {
        this.type.friend = _friend;
    }
    set guild(_guild) {
        this.type.guild = _guild;
    }
    set all(_all) {
        this.type.all = _all;
    }
    set value(_value) {
        this.type.value = _value;
    }

    constructor(_data = undefined) {
        if (_data)
            this.unserialize(_data.getBuffer(this.getSize()));
    }

    getSize() {
        return this.type.getSize();
    }

    unserialize(_data) {
        this.type.unserialize(_data.getBuffer(this.type.getSize()));
    }
    serialize(_data) {
        this.type.serialize(_data);
    }
    layout(_parent) {
        this.type.layout(_parent, "type");
    }
}

// o typeid do FurnitureAbility É o typeid de um item do Furniture.iff (o
// FurnitureAbility é um complemento do Furniture — sem num próprio): hex mod
// padrão + botão "…" que abre o ItemListModal do Furniture.iff
class FurnitureAbilityTypeidLinkValue extends TypeidLinkValue {

    _linkIff = 'Furniture.iff';
    _linkTitle = "Escolher furniture do Furniture.iff";

    constructor(_is_bool_type = false, _little_endian = true, _unsigned = false) {
        super(_is_bool_type, _little_endian, _unsigned);
    }

    // o furniture do FurnitureAbility é o que tem is_function 6 ou 8
    // (dados reais: exatamente os 2 itens 0x48006823/0x48006829)
    _linkFilterPredicate(_item) {
        const v = _item.is_function ? _item.is_function.value : -1;
        return v === 6 || v === 8;
    }
}

class FurnitureAbilityItem {
    typeid = new QuestStuffRewardTypeidLinkValue(false, true, true);
    probability = new Int32Type(false, true, true);

    constructor(_data = undefined) {
        if (_data)
            this.unserialize(_data.getBuffer(this.getSize()));
    }

    getSize() {
        return this.typeid.getSize() + this.probability.getSize();
    }

    unserialize(_data) {
        this.typeid.unserialize(_data.getBuffer(this.typeid.getSize()));
        this.probability.unserialize(_data.getBuffer(this.probability.getSize()));
    }
    serialize(_data) {
        this.typeid.serialize(_data);
        this.probability.serialize(_data);
    }
    layout(_parent) {
        this.typeid.layout(_parent, "typeid");
        this.probability.layout(_parent, "probability");
    }
}

class FurnitureAbility extends BaseTypeidUnique {
    active = new Int32Type(true, true, true);
    typeid = new FurnitureAbilityTypeidLinkValue(false, true, true);
    type = new FurnitureAbilityType();
    stay_time = new Int32Type(false, true, true);
    success_type = new FurnitureAbilitySuccessType();
    effect_type = new FurnitureAbilityEffectType();
    set_in_typeid = new Int32Type();
    max_qntd = new Int32Type(false, true, true);
    date = new SYSTEMTIME();
    during_time = new Int32Type(false, true, true);
    item = new FurnitureAbilityItem();
    max_count_by_user = new Int32Type(false, true, true);

    isTypeidUnique() {
        return false;
    }

    constructor(_data = undefined) {
        super();
        if (_data)
            this.unserialize(_data.getBuffer(this.getSize()));
    }

    getSize() {
        return this.active.getSize() + this.typeid.getSize() + this.type.getSize()
            + this.stay_time.getSize() + this.success_type.getSize()
            + this.effect_type.getSize() + this.set_in_typeid.getSize()
            + this.max_qntd.getSize() + this.date.getSize() + this.during_time.getSize()
            + this.item.getSize() + this.max_count_by_user.getSize();
    }

    unserialize(_data) {
        this.active.unserialize(_data.getBuffer(this.active.getSize()));
        this.typeid.unserialize(_data.getBuffer(this.typeid.getSize()));
        this.type.unserialize(_data.getBuffer(this.type.getSize()));
        this.stay_time.unserialize(_data.getBuffer(this.stay_time.getSize()));
        this.success_type.unserialize(_data.getBuffer(this.success_type.getSize()));
        this.effect_type.unserialize(_data.getBuffer(this.effect_type.getSize()));
        this.set_in_typeid.unserialize(_data.getBuffer(this.set_in_typeid.getSize()));
        this.max_qntd.unserialize(_data.getBuffer(this.max_qntd.getSize()));
        this.date.unserialize(_data.getBuffer(this.date.getSize()));
        this.during_time.unserialize(_data.getBuffer(this.during_time.getSize()));
        this.item.unserialize(_data.getBuffer(this.item.getSize()));
        this.max_count_by_user.unserialize(_data.getBuffer(this.max_count_by_user.getSize()));
    }
    serialize(_data) {
        this.active.serialize(_data);
        this.typeid.serialize(_data);
        this.type.serialize(_data);
        this.stay_time.serialize(_data);
        this.success_type.serialize(_data);
        this.effect_type.serialize(_data);
        this.set_in_typeid.serialize(_data);
        this.max_qntd.serialize(_data);
        this.date.serialize(_data);
        this.during_time.serialize(_data);
        this.item.serialize(_data);
        this.max_count_by_user.serialize(_data);
    }
    getIdentifyName() {
        return this.typeid.value.toString(16);
    }
    layout(_parent) {
        this.active.layout(_parent, "active");
        this.typeid.layout(_parent, "typeid");
        this.stay_time.layout(_parent, "stay_time");
        this.set_in_typeid.layout(_parent, "set_in_typeid");
        this.max_qntd.layout(_parent, "max_qntd");
        this.during_time.layout(_parent, "during_time");
        this.max_count_by_user.layout(_parent, "max_count_by_user");
        classLayout(_parent, "type", this.type);
        classLayout(_parent, "success_type", this.success_type);
        classLayout(_parent, "effect_type", this.effect_type);
        classLayout(_parent, "date", this.date);
        classLayout(_parent, "item", this.item);
    }
}

class BaseTikiShop extends BaseTypeidUnique {
    id = new Int32Type(false, true, true);
    type = new Int8Type(false, true);
    name = new StringType(35, StringTypeRelation.TEXT);

    get typeid() {
        return this.id;
    }
    set typeid(_id) {
        this.id = _id;
    }

    filter(_element) {
        return true;
    }

    constructor() {
        super();
    }

    getSize() {
        return this.id.getSize() + this.type.getSize() + this.name.getSize();
    }

    unserialize(_data) {
        this.id.unserialize(_data.getBuffer(this.id.getSize()));
        this.type.unserialize(_data.getBuffer(this.type.getSize()));
        this.name.unserialize(_data.getBuffer(this.name.getSize()));
    }
    serialize(_data) {
        this.id.serialize(_data);
        this.type.serialize(_data);
        this.name.serialize(_data);
    }
    getIdentifyName() {
        return `${this.id.value} ${this.name.value}`;
    }
    layout(_parent) {
        this.id.layout(_parent, "id");
        this.type.layout(_parent, "type");
        this.name.layout(_parent, "name");
    }
}

class TikiRecipe extends BaseTikiShop {
    recipe_qntd = Array(3).fill(0).map(_ => new Int32Type(false, true, true));

    constructor(_data = undefined) {
        super();
        if (_data)
            this.unserialize(_data.getBuffer(this.getSize()));
    }

    getSize() {
        return super.getSize() + this.recipe_qntd.reduce((acc, v) => acc + v.getSize(), 0);
    }

    unserialize(_data) {
        super.unserialize(_data.getBuffer(super.getSize()));
        this.recipe_qntd.forEach(v => v.unserialize(_data.getBuffer(v.getSize())));
    }
    serialize(_data) {
        super.serialize(_data);
        this.recipe_qntd.forEach(v => v.serialize(_data));
    }
    layout(_parent) {
        super.layout(_parent);
        _parent.appendChild(arrayLayout(this.recipe_qntd, "recipe_qntd"));
    }
}

class TikiPointTable extends BaseTikiShop {
    min = new Int32Type(false, true, true);
    max = new Int32Type(false, true, true);

    constructor(_data = undefined) {
        super();
        if (_data)
            this.unserialize(_data.getBuffer(this.getSize()));
    }

    getSize() {
        return super.getSize() + this.min.getSize() + this.max.getSize();
    }

    unserialize(_data) {
        super.unserialize(_data.getBuffer(super.getSize()));
        this.min.unserialize(_data.getBuffer(this.min.getSize()));
        this.max.unserialize(_data.getBuffer(this.max.getSize()));
    }
    serialize(_data) {
        super.serialize(_data);
        this.min.serialize(_data);
        this.max.serialize(_data);
    }
    layout(_parent) {
        super.layout(_parent);
        this.min.layout(_parent, "min");
        this.max.layout(_parent, "max");
    }
}

class TikiSpecialTable extends BaseTikiShop {
    qntd = new Int32Type(false, true, true);
    recipe_qntd = Array(4).fill(0).map(_ => new Int32Type(false, true, true));

    constructor(_data = undefined) {
        super();
        if (_data)
            this.unserialize(_data.getBuffer(this.getSize()));
    }

    getSize() {
        return super.getSize() + this.qntd.getSize() + this.recipe_qntd.reduce((acc, v) => acc + v.getSize(), 0);
    }

    unserialize(_data) {
        super.unserialize(_data.getBuffer(super.getSize()));
        this.qntd.unserialize(_data.getBuffer(this.qntd.getSize()));
        this.recipe_qntd.forEach(v => v.unserialize(_data.getBuffer(v.getSize())));
    }
    serialize(_data) {
        super.serialize(_data);
        this.qntd.serialize(_data);
        this.recipe_qntd.forEach(v => v.serialize(_data));
    }
    layout(_parent) {
        super.layout(_parent);
        this.qntd.layout(_parent, "qntd");
        _parent.appendChild(arrayLayout(this.recipe_qntd, "recipe_qntd"));
    }
}

class CutinInfomationCondition {
    condition = new BitfieldType(new Int32Type(false, true, true), {
        power_shot: 1,
        double_power_shot: 1,
        power_shot_failed: 1,
        chipin: 1
    }, 0);

    get power_shot() {
        return this.condition.power_shot;
    }
    get double_power_shot() {
        return this.condition.double_power_shot;
    }
    get power_shot_failed() {
        return this.condition.power_shot_failed;
    }
    get chipin() {
        return this.condition.chipin;
    }
    get value() {
        return this.condition.value;
    }

    set power_shot(_power_shot) {
        this.condition.power_shot = _power_shot;
    }
    set double_power_shot(_double_power_shot) {
        this.condition.double_power_shot = _double_power_shot;
    }
    set power_shot_failed(_power_shot_failed) {
        this.condition.power_shot_failed = _power_shot_failed;
    }
    set chipin(_chipin) {
        this.condition.chipin = _chipin;
    }
    set value(_value) {
        this.condition.value = _value;
    }

    constructor(_data = undefined) {
        if (_data)
            this.unserialize(_data.getBuffer(this.getSize()));
    }

    getSize() {
        return this.condition.getSize();
    }

    unserialize(_data) {
        this.condition.unserialize(_data.getBuffer(this.condition.getSize()));
    }
    serialize(_data) {
        this.condition.serialize(_data);
    }
    layout(_parent) {
        this.condition.layout(_parent, "condition");
    }
}

class CutinInfomationImg {
    sprite = new StringType(40, StringTypeRelation.ASSET.SPRITE);
    tipo = new Int32Type(false, true, true);

    constructor(_data = undefined) {
        if (_data)
            this.unserialize(_data.getBuffer(this.getSize()));
    }

    getSize() {
        return this.sprite.getSize() + this.tipo.getSize();
    }

    unserialize(_data) {
        this.sprite.unserialize(_data.getBuffer(this.sprite.getSize()));
        this.tipo.unserialize(_data.getBuffer(this.tipo.getSize()));
    }
    serialize(_data) {
        this.sprite.serialize(_data);
        this.tipo.serialize(_data);
    }
    layout(_parent) {
        let row =
            document.createElement("div");

        row.className =
            "pair-field-row";

        this.sprite.layout(row, "sprite");
        this.tipo.layout(row, "tipo");

        _parent.appendChild(row);
    }
}

// o typeid do CutinInfomation É o typeid de uma skin CUTIN — ÚNICO entre os
// cutins: o input do layout rejeita um typeid que já existe em outro item
// (o `_owner` é o próprio item, setado no CutinInfomation.layout)
class CutinInfomationTypeidValue extends Int32Type {
    checkValue(_value) {
        const all =
            (typeof window !== 'undefined' && window.iffs) || iffs;
        const iff =
            (all || []).find(i => i.name === 'CutinInfomation.iff');
        if (iff && iff.elements)
            for (const el of iff.elements)
                if (!el.__deleted && !el.__deleted2 && el !== this._owner
                    && el.typeid && el.typeid.value === Number(_value))
                    return false;
        return super.checkValue(_value);
    }
}

// o character_id do CutinInfomation É o id (num) de um character do
// Character.iff — select do layout no padrão do character do HairStyle
// (buildFieldSelection: ids com label `id — nome`, grava direto no campo,
// SEM bit no typeid)
class CutinInfomation extends BaseTypeidUnique {
    active = new Int32Type(true, true, true);
    typeid = new CutinInfomationTypeidValue(false, true, true);
    rare_typeid = new Int32Type(false, true, true);
    rarity = new Int32Type(false, true, true);
    tipo = new CutinInfomationCondition();
    sector = new Int32Type(false, true, true);
    character_id = new Int32Type(false, true, true);
    img = Array(4).fill(0).map(_ => new CutinInfomationImg());
    tempo = new Int32Type(false, true, true);

    constructor(_data = undefined) {
        super();
        if (_data)
            this.unserialize(_data.getBuffer(this.getSize()));
    }

    getSize() {
        return this.active.getSize() + this.typeid.getSize() + this.rare_typeid.getSize()
            + this.rarity.getSize() + this.tipo.getSize() + this.sector.getSize()
            + this.character_id.getSize() + this.img.reduce((acc, v) => acc + v.getSize(), 0)
            + this.tempo.getSize();
    }

    unserialize(_data) {
        this.active.unserialize(_data.getBuffer(this.active.getSize()));
        this.typeid.unserialize(_data.getBuffer(this.typeid.getSize()));
        this.rare_typeid.unserialize(_data.getBuffer(this.rare_typeid.getSize()));
        this.rarity.unserialize(_data.getBuffer(this.rarity.getSize()));
        this.tipo.unserialize(_data.getBuffer(this.tipo.getSize()));
        this.sector.unserialize(_data.getBuffer(this.sector.getSize()));
        this.character_id.unserialize(_data.getBuffer(this.character_id.getSize()));
        this.img.forEach(v => v.unserialize(_data.getBuffer(v.getSize())));
        this.tempo.unserialize(_data.getBuffer(this.tempo.getSize()));
    }
    serialize(_data) {
        this.active.serialize(_data);
        this.typeid.serialize(_data);
        this.rare_typeid.serialize(_data);
        this.rarity.serialize(_data);
        this.tipo.serialize(_data);
        this.sector.serialize(_data);
        this.character_id.serialize(_data);
        this.img.forEach(v => v.serialize(_data));
        this.tempo.serialize(_data);
    }
    getIdentifyName() {
        return this.typeid.value.toString(16);
    }
    layout(_parent) {
        this.active.layout(_parent, "active");
        this.typeid._owner = this;
        this.typeid.layout(_parent, "typeid");
        this.rare_typeid.layout(_parent, "rare_typeid");
        this.rarity.layout(_parent, "rarity");
        this.sector.layout(_parent, "sector");

        // character_id: select com os ids do Character.iff (label `id — nome`,
        // valor atual fora vira opção crua) — grava direto no campo do item
        buildFieldSelection(_parent, 'character_id', {
            searchEnabled: true,
            options: select => this._fillCharacterIdOptions(select),
            onChange: value => {
                this.character_id.value = value;
            },
        });

        this.tempo.layout(_parent, "tempo");

        _parent.appendChild(arrayLayout(this.img, "img"));

        classLayout(_parent, "tipo", this.tipo);
    }

    // preenche o select do character_id: ids do Character.iff (+ valor atual
    // se estiver fora, ex.: item novo pendente) com label `id — nome`
    _fillCharacterIdOptions(_select) {

        const all =
            (typeof window !== 'undefined' && window.iffs) || iffs;

        const chIff =
            (all || []).find(i => i.name === 'Character.iff');

        const ids =
            new Set();

        if (chIff && chIff.elements)
            for (const el of chIff.elements)
                if (!el.__deleted && !el.__deleted2 && el.typeid)
                    ids.add(getTypeidNum(el));

        if (!ids.has(this.character_id.value))
            ids.add(this.character_id.value);

        for (const id of [...ids].sort((a, b) => a - b)) {

            const opt =
                document.createElement('option');

            opt.value = id;

            let name = String(id);

            if (chIff) {

                const el =
                    chIff.elements.find(e => !e.__deleted && !e.__deleted2
                        && getTypeidNum(e) === id);

                if (el && el.name)
                    name = String(id) + ' — ' + stripEncodingMarker(el.name.value);
            }

            opt.textContent = name;

            if (id === this.character_id.value)
                opt.selected = true;

            _select.appendChild(opt);
        }

        _select.value = this.character_id.value;
    }
}

// eTYPE do TimeLimitItem (campo `type`) — enum com __allowExtra: valor fora
// da lista vira opção crua pré-selecionada + opção final __extra que troca o
// select por input no MESMO row (padrão do CardVolume/volume)
class TimeLimitItemType {
    static NONE = 0;
    static YAM_AND_GOLD = 1;
    static RAINBOW = 2;
    static RED = 3;
    static GREEN = 4;
    static YELLOW = 5;

    static getName(_value) {
        return Object.entries(TimeLimitItemType).find(([, v]) => v === _value)?.[0];
    }

    static getValue(_name) {
        return TimeLimitItemType[_name];
    }
}
Object.defineProperty(TimeLimitItemType, "__allowExtra", { value: true });

const TimeLimitItemTypeValue32 = createEnumValueType(Int32Type, TimeLimitItemType);

class TimeLimitItem extends BaseTypeidUnique {
    active = new Int32Type(true, true, true);
    typeid = new Int32Type(false, true, true);
    name = new StringType(40, StringTypeRelation.TEXT);
    icon = new StringType(40, StringTypeRelation.ASSET.ICON);
    type = new TimeLimitItemTypeValue32();
    percent = new Int32Type(false, true, true);
    time = new Int32Type(false, true, true);

    constructor(_data = undefined) {
        super();
        if (_data)
            this.unserialize(_data.getBuffer(this.getSize()));
    }

    getSize() {
        return this.active.getSize() + this.typeid.getSize() + this.name.getSize() + this.icon.getSize()
            + this.type.getSize() + this.percent.getSize() + this.time.getSize();
    }

    unserialize(_data) {
        this.active.unserialize(_data.getBuffer(this.active.getSize()));
        this.typeid.unserialize(_data.getBuffer(this.typeid.getSize()));
        this.name.unserialize(_data.getBuffer(this.name.getSize()));
        this.icon.unserialize(_data.getBuffer(this.icon.getSize()));
        this.type.unserialize(_data.getBuffer(this.type.getSize()));
        this.percent.unserialize(_data.getBuffer(this.percent.getSize()));
        this.time.unserialize(_data.getBuffer(this.time.getSize()));
    }
    serialize(_data) {
        this.active.serialize(_data);
        this.typeid.serialize(_data);
        this.name.serialize(_data);
        this.icon.serialize(_data);
        this.type.serialize(_data);
        this.percent.serialize(_data);
        this.time.serialize(_data);
    }
    getIdentifyName() {
        return this.typeid.value.toString(16);
    }
    layout(_parent) {
        this.active.layout(_parent, "active");
        this.typeid.layout(_parent, "typeid");
        this.name.layout(_parent, "name");
        this.icon.layout(_parent, "icon");
        this.type.layout(_parent, "type");
        this.percent.layout(_parent, "percent");
        this.time.layout(_parent, "time");
    }
}

// tipo do SpecialPrizeItem (campo `type`) — enum com __allowExtra: valor fora
// da lista vira opção crua pré-selecionada + opção final __extra que troca o
// select por input no MESMO row (padrão do CardVolume/volume e TimeLimitItem)
class SpecialPrizeItemType {
    static RING = 0;
    static WIG = 1;
    static SHOES = 2;
    static GLASSES = 3;
    static GLOVE = 4;

    static getName(_value) {
        return Object.entries(SpecialPrizeItemType).find(([, v]) => v === _value)?.[0];
    }

    static getValue(_name) {
        return SpecialPrizeItemType[_name];
    }
}
Object.defineProperty(SpecialPrizeItemType, "__allowExtra", { value: true });

const SpecialPrizeItemTypeValue32 = createEnumValueType(Int32Type, SpecialPrizeItemType);

class SpecialPrizeItem extends BaseTypeidUnique {
    typeid = new Int32Type(false, true, true);
    type = new SpecialPrizeItemTypeValue32();
    rate = new FloatType();

    constructor(_data = undefined) {
        super();
        if (_data)
            this.unserialize(_data.getBuffer(this.getSize()));
    }

    getSize() {
        return this.typeid.getSize() + this.type.getSize() + this.rate.getSize();
    }

    unserialize(_data) {
        this.typeid.unserialize(_data.getBuffer(this.typeid.getSize()));
        this.type.unserialize(_data.getBuffer(this.type.getSize()));
        this.rate.unserialize(_data.getBuffer(this.rate.getSize()));
    }
    serialize(_data) {
        this.typeid.serialize(_data);
        this.type.serialize(_data);
        this.rate.serialize(_data);
    }
    getIdentifyName() {
        return this.typeid.value.toString(16);
    }
    layout(_parent) {
        this.typeid.layout(_parent, "typeid");
        this.type.layout(_parent, "type");
        this.rate.layout(_parent, "rate");
    }
}

// tipo do ShopLimitItem (campo `type`) — enum com __allowExtra: valor fora
// da lista vira opção crua pré-selecionada + opção final __extra que troca o
// select por input no MESMO row (padrão do CardVolume/volume, TimeLimitItem e
// SpecialPrizeItem)
class ShopLimitItemType {
    static NONE = 0;
    static ITEM = 1;
    static UCC_EVENT = 2;

    static getName(_value) {
        return Object.entries(ShopLimitItemType).find(([, v]) => v === _value)?.[0];
    }

    static getValue(_name) {
        return ShopLimitItemType[_name];
    }
}
Object.defineProperty(ShopLimitItemType, "__allowExtra", { value: true });

const ShopLimitItemTypeValue32 = createEnumValueType(Int32Type, ShopLimitItemType);

class ShopLimitItem extends BaseTypeidUnique {
    active = new Int32Type(true, true, true);
    type = new ShopLimitItemTypeValue32();
    typeid = new Int32Type(false, true, true);
    purchases_without_wait = new Int32Type(false, true, true);
    purchases_with_wait = new Int32Type(false, true, true);
    wait_time_hours = new Int32Type(false, true, true);
    max_repeat_cycles = new Int32Type(false, true, true);
    date = Array(2).fill(0).map(_ => new SYSTEMTIME());

    constructor(_data = undefined) {
        super();
        if (_data)
            this.unserialize(_data.getBuffer(this.getSize()));
    }

    getSize() {
        return this.active.getSize() + this.type.getSize() + this.typeid.getSize()
            + this.purchases_without_wait.getSize() + this.purchases_with_wait.getSize() + this.wait_time_hours.getSize()
            + this.max_repeat_cycles.getSize() + this.date.reduce((acc, v) => acc + v.getSize(), 0);
    }

    unserialize(_data) {
        this.active.unserialize(_data.getBuffer(this.active.getSize()));
        this.type.unserialize(_data.getBuffer(this.type.getSize()));
        this.typeid.unserialize(_data.getBuffer(this.typeid.getSize()));
        this.purchases_without_wait.unserialize(_data.getBuffer(this.purchases_without_wait.getSize()));
        this.purchases_with_wait.unserialize(_data.getBuffer(this.purchases_with_wait.getSize()));
        this.wait_time_hours.unserialize(_data.getBuffer(this.wait_time_hours.getSize()));
        this.max_repeat_cycles.unserialize(_data.getBuffer(this.max_repeat_cycles.getSize()));
        this.date.forEach(v => v.unserialize(_data.getBuffer(v.getSize())));
    }
    serialize(_data) {
        this.active.serialize(_data);
        this.type.serialize(_data);
        this.typeid.serialize(_data);
        this.purchases_without_wait.serialize(_data);
        this.purchases_with_wait.serialize(_data);
        this.wait_time_hours.serialize(_data);
        this.max_repeat_cycles.serialize(_data);
        this.date.forEach(v => v.serialize(_data));
    }
    getIdentifyName() {
        return this.typeid.value.toString(16);
    }
    layout(_parent) {
        this.active.layout(_parent, "active");
        this.type.layout(_parent, "type");
        this.typeid.layout(_parent, "typeid");
        this.purchases_without_wait.layout(_parent, "purchases_without_wait");
        this.purchases_with_wait.layout(_parent, "purchases_with_wait");
        this.wait_time_hours.layout(_parent, "wait_time_hours");
        this.max_repeat_cycles.layout(_parent, "max_repeat_cycles");
        _parent.appendChild(arrayLayout(this.date, "date"));
    }
}

// rarity do PointShop (campo `rarity`, antigo `flag`) — enum com __allowExtra:
// valor fora da lista vira opção crua pré-selecionada + opção final __extra
// que troca o select por input no MESMO row (padrão do TimeLimitItemType)
class PointShopRarityType {
    static NORMAL = 0;
    static RARE = 1;

    static getName(_value) {
        return Object.entries(PointShopRarityType).find(([, v]) => v === _value)?.[0];
    }

    static getValue(_name) {
        return PointShopRarityType[_name];
    }
}
Object.defineProperty(PointShopRarityType, "__allowExtra", { value: true });

const PointShopRarityTypeValue32 = createEnumValueType(Int32Type, PointShopRarityType);

class PointShop extends BaseTypeidUnique {
    active = new Int32Type(true, true, true);
    typeid = new Int32Type(false, true, true);
    point = new Int32Type(false, true, true);
    qntd = new Int32Type(false, true, true);
    rarity = new PointShopRarityTypeValue32();

    constructor(_data = undefined) {
        super();
        if (_data)
            this.unserialize(_data.getBuffer(this.getSize()));
    }

    getSize() {
        return this.active.getSize() + this.typeid.getSize() + this.point.getSize()
            + this.qntd.getSize() + this.rarity.getSize();
    }

    unserialize(_data) {
        this.active.unserialize(_data.getBuffer(this.active.getSize()));
        this.typeid.unserialize(_data.getBuffer(this.typeid.getSize()));
        this.point.unserialize(_data.getBuffer(this.point.getSize()));
        this.qntd.unserialize(_data.getBuffer(this.qntd.getSize()));
        this.rarity.unserialize(_data.getBuffer(this.rarity.getSize()));
    }
    serialize(_data) {
        this.active.serialize(_data);
        this.typeid.serialize(_data);
        this.point.serialize(_data);
        this.qntd.serialize(_data);
        this.rarity.serialize(_data);
    }
    getIdentifyName() {
        return this.typeid.value.toString(16);
    }
    layout(_parent) {
        this.active.layout(_parent, "active");
        this.typeid.layout(_parent, "typeid");
        this.point.layout(_parent, "point");
        this.qntd.layout(_parent, "qntd");
        this.rarity.layout(_parent, "rarity");
    }
}

// type do NonVisibleItemTable (campo `type`) — enum com __allowExtra: valor
// fora da lista vira opção crua pré-selecionada + opção final __extra que troca
// type do NonVisibleItemTable/SubscriptionItemTable (campo `type`) — enum genérico com __allowExtra
class ItemTableType {
    static NONE = 0;
    static GAME = 2;
    static ROOM = 4;
    static LOUNGE = 8;
    static REST_ANIMATION = 14;
    static MYROOM = 15;

    static getName(_value) {
        return Object.entries(ItemTableType).find(([, v]) => v === _value)?.[0];
    }

    static getValue(_name) {
        return ItemTableType[_name];
    }
}
Object.defineProperty(ItemTableType, "__allowExtra", { value: true });

const ItemTableTypeValue32 = createEnumValueType(Int32Type, ItemTableType);

class NonVisibleItemTable extends BaseTypeidUnique {
    active = new Int32Type(true, true, true);
    type = new ItemTableTypeValue32();
    typeid = new Int32Type(false, true, true);
    date = Array(2).fill(0).map(_ => new SYSTEMTIME());

    constructor(_data = undefined) {
        super();
        if (_data)
            this.unserialize(_data.getBuffer(this.getSize()));
    }

    getSize() {
        return this.active.getSize() + this.type.getSize() + this.typeid.getSize()
            + this.date.reduce((acc, v) => acc + v.getSize(), 0);
    }

    unserialize(_data) {
        this.active.unserialize(_data.getBuffer(this.active.getSize()));
        this.type.unserialize(_data.getBuffer(this.type.getSize()));
        this.typeid.unserialize(_data.getBuffer(this.typeid.getSize()));
        this.date.forEach(v => v.unserialize(_data.getBuffer(v.getSize())));
    }
    serialize(_data) {
        this.active.serialize(_data);
        this.type.serialize(_data);
        this.typeid.serialize(_data);
        this.date.forEach(v => v.serialize(_data));
    }
    getIdentifyName() {
        return this.typeid.value.toString(16);
    }
    layout(_parent) {
        this.active.layout(_parent, "active");
        this.type.layout(_parent, "type");
        this.typeid.layout(_parent, "typeid");

        _parent.appendChild(arrayLayout(this.date, "date"));
    }
}

class SubscriptionItemTable extends BaseTypeidUnique {
    active = new Int32Type(true, true, true);
    type = new ItemTableTypeValue32();
    typeid = new Int32Type(false, true, true);
    date = Array(2).fill(0).map(_ => new SYSTEMTIME());

    constructor(_data = undefined) {
        super();
        if (_data)
            this.unserialize(_data.getBuffer(this.getSize()));
    }

    getSize() {
        return this.active.getSize() + this.type.getSize() + this.typeid.getSize()
            + this.date.reduce((acc, v) => acc + v.getSize(), 0);
    }

    unserialize(_data) {
        this.active.unserialize(_data.getBuffer(this.active.getSize()));
        this.type.unserialize(_data.getBuffer(this.type.getSize()));
        this.typeid.unserialize(_data.getBuffer(this.typeid.getSize()));
        this.date.forEach(v => v.unserialize(_data.getBuffer(v.getSize())));
    }
    serialize(_data) {
        this.active.serialize(_data);
        this.type.serialize(_data);
        this.typeid.serialize(_data);
        this.date.forEach(v => v.serialize(_data));
    }
    getIdentifyName() {
        return this.typeid.value.toString(16);
    }
    layout(_parent) {
        this.active.layout(_parent, "active");
        this.type.layout(_parent, "type");
        this.typeid.layout(_parent, "typeid");

        _parent.appendChild(arrayLayout(this.date, "date"));
    }
}

class TwinsItemTable extends BaseTypeidUnique {
    active = new Int32Type(true, true, true);
    type = new ItemTableTypeValue32();
    typeid = Array(5).fill(0).map(_ => new QuestStuffRewardTypeidLinkValue(false, true, true));

    isTypeidUnique() {
        return false;
    }

    constructor(_data = undefined) {
        super();
        if (_data)
            this.unserialize(_data.getBuffer(this.getSize()));
    }

    getSize() {
        return this.active.getSize() + this.type.getSize()
            + this.typeid.reduce((acc, v) => acc + v.getSize(), 0);
    }

    unserialize(_data) {
        this.active.unserialize(_data.getBuffer(this.active.getSize()));
        this.type.unserialize(_data.getBuffer(this.type.getSize()));
        this.typeid.forEach(v => v.unserialize(_data.getBuffer(v.getSize())));
    }
    serialize(_data) {
        this.active.serialize(_data);
        this.type.serialize(_data);
        this.typeid.forEach(v => v.serialize(_data));
    }
    getIdentifyName() {
        return `${this.type.value} - ${ItemTableType.getName(this.type.value) ?? this.type.value}`;
    }
    layout(_parent) {
        this.active.layout(_parent, "active");
        this.type.layout(_parent, "type");
        _parent.appendChild(arrayLayout(this.typeid, "typeid"));
    }
}

// typeid do item_counter / item_zero_counter: aponta para um item passivo
// (item_passive=1) do Item.iff — picker "…" abre o ItemListModal filtrado
class ScratchRewardSettingItemTypeidLinkValue extends TypeidLinkValue {

    _linkIff = 'Item.iff';
    _linkTitle = "Escolher item passivo do Item.iff";

    _linkFilterPredicate(_item) {
        return Item.createTypeidbit(_item.typeid.value).item_passive === 1;
    }
}

class ScratchRewardSettingItemCounter {
    typeid = new ScratchRewardSettingItemTypeidLinkValue(false, true, true);
    qntd = new Int32Type(false, true, true);

    constructor(_data = undefined) {
        if (_data)
            this.unserialize(_data.getBuffer(this.getSize()));
    }

    getSize() {
        return this.typeid.getSize() + this.qntd.getSize();
    }

    unserialize(_data) {
        this.typeid.unserialize(_data.getBuffer(this.typeid.getSize()));
        this.qntd.unserialize(_data.getBuffer(this.qntd.getSize()));
    }
    serialize(_data) {
        this.typeid.serialize(_data);
        this.qntd.serialize(_data);
    }
    layout(_parent) {
        this.typeid.layout(_parent, "typeid");
        this.qntd.layout(_parent, "qntd");
    }
}

class ScratchRewardSetting extends BaseTypeidUnique {
    active = new Int32Type(true, true, true);
    id = new Int32Type(false, true, true);
    item_counter = new ScratchRewardSettingItemCounter();
    item_zero_counter = new ScratchRewardSettingItemTypeidLinkValue(false, true, true);

    get typeid() {
        return this.id;
    }
    set typeid(_id) {
        this.id = _id;
    }

    // o item real referenciado (thumbnail / "ir para o item") é o
    // item_counter.typeid, não o typeid principal (id) do ScratchRewardSetting
    getRealItemTypeid() {
        return this.item_counter.typeid;
    }

    constructor(_data = undefined) {
        super();
        if (_data)
            this.unserialize(_data.getBuffer(this.getSize()));
    }

    getSize() {
        return this.active.getSize() + this.id.getSize()
            + this.item_counter.getSize() + this.item_zero_counter.getSize();
    }

    unserialize(_data) {
        this.active.unserialize(_data.getBuffer(this.active.getSize()));
        this.id.unserialize(_data.getBuffer(this.id.getSize()));
        this.item_counter.unserialize(_data.getBuffer(this.item_counter.getSize()));
        this.item_zero_counter.unserialize(_data.getBuffer(this.item_zero_counter.getSize()));
    }
    serialize(_data) {
        this.active.serialize(_data);
        this.id.serialize(_data);
        this.item_counter.serialize(_data);
        this.item_zero_counter.serialize(_data);
    }
    getIdentifyName() {
        return `${this.id.value.toString()} - ${this.item_counter.typeid.value.toString(16)}`;
    }
    layout(_parent) {
        this.active.layout(_parent, "active");
        this.id.layout(_parent, "id");
        // item_counter é um sub-objeto: renderiza em grupo com label de classe
        // interna (e seus campos typeid/qntd dentro)
        classLayout(_parent, "item_counter", this.item_counter);
        this.item_zero_counter.layout(_parent, "item_zero_counter");
    }
}

class LevelUpPrizeItemReward {
    typeid = Array(2).fill(0).map(_ => new QuestStuffRewardTypeidLinkValue(false, true, true));
    qntd = Array(2).fill(0).map(_ => new Int32Type(false, true, true));
    time = Array(2).fill(0).map(_ => new Int32Type(false, true, true));

    constructor(_data = undefined) {
        if (_data)
            this.unserialize(_data.getBuffer(this.getSize()));
    }

    getSize() {
        return this.typeid.reduce((acc, v) => acc + v.getSize(), 0)
            + this.qntd.reduce((acc, v) => acc + v.getSize(), 0)
            + this.time.reduce((acc, v) => acc + v.getSize(), 0);
    }

    unserialize(_data) {
        this.typeid.forEach(v => v.unserialize(_data.getBuffer(v.getSize())));
        this.qntd.forEach(v => v.unserialize(_data.getBuffer(v.getSize())));
        this.time.forEach(v => v.unserialize(_data.getBuffer(v.getSize())));
    }
    serialize(_data) {
        this.typeid.forEach(v => v.serialize(_data));
        this.qntd.forEach(v => v.serialize(_data));
        this.time.forEach(v => v.serialize(_data));
    }
    layout(_parent) {
        _parent.appendChild(arrayLayout(this.typeid, "typeid"));
        _parent.appendChild(arrayLayout(this.qntd, "qntd"));
        _parent.appendChild(arrayLayout(this.time, "time"));
    }
}

class LevelUpPrizeItem extends BaseTypeidUnique {
    active = new Int8Type(true, true);
    name = new StringType(33, StringTypeRelation.TEXT);
    level = new LevelValue16();
    reward = new LevelUpPrizeItemReward();
    description = new StringType(132, StringTypeRelation.TEXT);

    get typeid() {
        return this.level;
    }
    set typeid(_level) {
        this.level = _level;
    }

    constructor(_data = undefined) {
        super();
        if (_data)
            this.unserialize(_data.getBuffer(this.getSize()));
    }

    getSize() {
        return this.active.getSize() + this.name.getSize() + this.level.getSize()
            + this.reward.getSize() + this.description.getSize();
    }

    unserialize(_data) {
        this.active.unserialize(_data.getBuffer(this.active.getSize()));
        this.name.unserialize(_data.getBuffer(this.name.getSize()));
        this.level.unserialize(_data.getBuffer(this.level.getSize()));
        this.reward.unserialize(_data.getBuffer(this.reward.getSize()));
        this.description.unserialize(_data.getBuffer(this.description.getSize()));
    }
    serialize(_data) {
        this.active.serialize(_data);
        this.name.serialize(_data);
        this.level.serialize(_data);
        this.reward.serialize(_data);
        this.description.serialize(_data);
    }
    getIdentifyName() {
        return `${this.level.value} - ${enLEVEL.getName(this.level.value) ?? this.level.value} ${this.name.value}`;
    }
    layout(_parent) {
        this.active.layout(_parent, "active");
        this.name.layout(_parent, "name");
        this.level.layout(_parent, "level");
        this.description.layout(_parent, "description");

        classLayout(_parent, "reward", this.reward);
    }
}

// tipo do ErrorCodeInfo (campo `type`) — enum com __allowExtra (o select do
// painel de filtros ganha a opção extra p/ valores fora da lista)
class ErrorCodeInfoType {
    static TYPE_ZERO = 0;
    static TYPE_ONE = 1;
    static TYPE_2 = 2;
    static TYPE_3 = 3;
    static TYPE_4 = 4;
    static TYPE_5 = 5;

    static getName(_value) {
        return Object.entries(ErrorCodeInfoType).find(([, v]) => v === _value)?.[0];
    }

    static getValue(_name) {
        return ErrorCodeInfoType[_name];
    }
}
Object.defineProperty(ErrorCodeInfoType, "__allowExtra", { value: true });

const ErrorCodeInfoTypeValue32 = createEnumValueType(Int32Type, ErrorCodeInfoType);

class ErrorCodeInfo extends BaseTypeidUnique {
    active = new Int32Type(true, true, true);
    code = new Int32Type(false, true, true);
    type = new ErrorCodeInfoTypeValue32();
    info = new StringType(260, StringTypeRelation.TEXT);

    get typeid() {
        return this.code;
    }
    set typeid(_code) {
        this.code = _code;
    }

    constructor(_data = undefined) {
        super();
        if (_data)
            this.unserialize(_data.getBuffer(this.getSize()));
    }

    getSize() {
        return this.active.getSize() + this.code.getSize()
            + this.type.getSize() + this.info.getSize();
    }

    unserialize(_data) {
        this.active.unserialize(_data.getBuffer(this.active.getSize()));
        this.code.unserialize(_data.getBuffer(this.code.getSize()));
        this.type.unserialize(_data.getBuffer(this.type.getSize()));
        this.info.unserialize(_data.getBuffer(this.info.getSize()));
    }
    serialize(_data) {
        this.active.serialize(_data);
        this.code.serialize(_data);
        this.type.serialize(_data);
        this.info.serialize(_data);
    }
    getIdentifyName() {
        return `${this.code.value} - ${ErrorCodeInfoType.getName(this.type.value) ?? this.type.value}`;
    }
    layout(_parent) {
        this.active.layout(_parent, "active");
        this.code.layout(_parent, "code");
        this.type.layout(_parent, "type");
        this.info.layout(_parent, "info");
    }
}

// modo de jogo em que o mana do artefato vale (campo type do ArtifactManaInfo)
class ArtifactManaInfoType {
    static ALL_GAME_MODE_EXCEPT_GRAND_PRIX = 0;
    static ONLY_18_HOLES = 1;
    static ONLY_GRAND_PRIX = 3;

    static getName(_value) {
        return Object.entries(ArtifactManaInfoType).find(([, v]) => v === _value)?.[0];
    }

    static getValue(_name) {
        return Object.entries(ArtifactManaInfoType).find(([n]) => n === _name)?.[1];
    }
}

Object.defineProperty(ArtifactManaInfoType, "__allowExtra", { value: true });

const ArtifactManaInfoTypeValue32 = createEnumValueType(Int32Type, ArtifactManaInfoType);

// o mana_typeid do ArtifactManaInfo É o typeid de um item do Item.iff do tipo
// ARTFACT_MANA (tipo_item = 4 — dados reais: 18/26 itens com mana): hex mod
// padrão + botão "…" que abre o ItemListModal do Item.iff filtrado
class ArtifactManaTypeidLinkValue extends TypeidLinkValue {

    _linkIff = 'Item.iff';
    _linkTitle = "Escolher mana do Item.iff (tipo ARTFACT_MANA)";

    constructor(_is_bool_type = false, _little_endian = true, _unsigned = false) {
        super(_is_bool_type, _little_endian, _unsigned);
    }

    _linkFilterPredicate(_item) {
        return _item.tipo_item && _item.tipo_item.value === ItemTipo.ARTFACT_MANA;
    }
}

class ArtifactManaInfo extends BaseTypeidUnique {
    active = new Int32Type(true, true, true);
    typeid = new Int32Type(false, true, true);
    mana_typeid = new ArtifactManaTypeidLinkValue(false, true, true);
    info = new StringType(132, StringTypeRelation.TEXT);
    type = new ArtifactManaInfoTypeValue32();
    unknown = new Int32Type(false, true, true);

    constructor(_data = undefined) {
        super();
        if (_data)
            this.unserialize(_data.getBuffer(this.getSize()));
    }

    getSize() {
        return this.active.getSize() + this.typeid.getSize() + this.mana_typeid.getSize()
            + this.info.getSize() + this.type.getSize() + this.unknown.getSize();
    }

    unserialize(_data) {
        this.active.unserialize(_data.getBuffer(this.active.getSize()));
        this.typeid.unserialize(_data.getBuffer(this.typeid.getSize()));
        this.mana_typeid.unserialize(_data.getBuffer(this.mana_typeid.getSize()));
        this.info.unserialize(_data.getBuffer(this.info.getSize()));
        this.type.unserialize(_data.getBuffer(this.type.getSize()));
        this.unknown.unserialize(_data.getBuffer(this.unknown.getSize()));
    }
    serialize(_data) {
        this.active.serialize(_data);
        this.typeid.serialize(_data);
        this.mana_typeid.serialize(_data);
        this.info.serialize(_data);
        this.type.serialize(_data);
        this.unknown.serialize(_data);
    }
    getIdentifyName() {
        // mana_typeid = 0 → só o typeid; senão "typeid - mana_typeid" (hex)
        return this.mana_typeid.value !== 0
            ? `${this.typeid.value.toString(16)} - ${this.mana_typeid.value.toString(16)}`
            : this.typeid.value.toString(16);
    }
    layout(_parent) {
        this.active.layout(_parent, "active");
        this.typeid.layout(_parent, "typeid");
        this.mana_typeid.layout(_parent, "mana_typeid");
        this.info.layout(_parent, "info");
        this.type.layout(_parent, "type");
        this.unknown.layout(_parent, "unknown");
    }
}

class AbilityEffectType {
    static NONE = 0;
    static PIXEL = 1;
    static PIXEL_BY_WIND_NO_ITEM = 2;
    static PIXEL_OVER_WIND_NO_ITEM = 3;
    static PIXEL_BY_WIND = 4;
    static PIXEL_2 = 5;
    static PIXEL_WITH_WEAK_WIND = 6;
    static POWER_GAUGE_TO_START_HOLE = 7;
    static POWER_GAUGE_MORE_ONE = 8;
    static POWER_GUAGE_TO_START_GAME = 9;
    static PAWS_NOT_ACCUMULATE = 10;
    static SWITCH_TWO_EFFECT = 11;
    static EARCUFF_DIRECTION_WIND = 12;
    static COMBINE_ITEM_EFFECT = 13;
    static SAFETY_CLIENT_RANDOM = 14;
    static PIXEL_RANDOM = 15;
    static WIND_1M_RANDOM = 16;
    static PIXEL_BY_WIND_MIDDLE_DOUBLE = 17;
    static GROUND_100_PERCENT_RONDOM = 18;
    static ASSIST_MIRACLE_SIGN = 19;
    static VECTOR_SIGN = 20;
    static ASSIST_TRAJECTORY_SHOT = 21;
    static PAWS_ACCUMULATE = 22;
    static POWER_GAUGE_FREE = 23;
    static SAFETY_RANDOM = 24;
    static ONE_IN_ALL_STATS = 25;
    static POWER_GAUGE_BY_MISS_SHOT = 26;
    static PIXEL_BY_WIND_2 = 27;
    static PIXEL_WITH_RAIN = 28;
    static NO_RAIN_EFFECT = 29;
    static PUTT_MORE_10Y_RANDOM = 30;
    static UNKNOWN_31 = 31;
    static MIRACLE_SIGN_RANDOM = 32;
    static UNKNOWN_33 = 33;
    static DECREASE_1M_OF_WIND = 34;

    static getName(_value) {
        return Object.entries(AbilityEffectType).find(([, v]) => v === _value)?.[0];
    }

    static getValue(_name) {
        const e = Object.entries(AbilityEffectType).find(([n]) => n === _name);
        return e ? e[1] : undefined;
    }
}

const AbilityEffectTypeValue32 = createEnumValueType(Int32Type, AbilityEffectType);

class AbilityEfeito {
    efeito_or_no = Array(3).fill(0).map(_ => new Int32Type(true, true, true));
    type = Array(3).fill(0).map(_ => new AbilityEffectTypeValue32());
    rate = Array(3).fill(0).map(_ => new FloatType());

    constructor(_data = undefined) {
        if (_data)
            this.unserialize(_data.getBuffer(this.getSize()));
    }

    getSize() {
        return this.efeito_or_no.reduce((acc, v) => acc + v.getSize(), 0)
            + this.type.reduce((acc, v) => acc + v.getSize(), 0)
            + this.rate.reduce((acc, v) => acc + v.getSize(), 0);
    }

    unserialize(_data) {
        this.efeito_or_no.forEach(v => v.unserialize(_data.getBuffer(v.getSize())));
        this.type.forEach(v => v.unserialize(_data.getBuffer(v.getSize())));
        this.rate.forEach(v => v.unserialize(_data.getBuffer(v.getSize())));
    }
    serialize(_data) {
        this.efeito_or_no.forEach(v => v.serialize(_data));
        this.type.forEach(v => v.serialize(_data));
        this.rate.forEach(v => v.serialize(_data));
    }
    layout(_parent) {
        _parent.appendChild(arrayLayout(this.efeito_or_no, "efeito_or_no"));
        _parent.appendChild(arrayLayout(this.type, "type"));
        _parent.appendChild(arrayLayout(this.rate, "rate"));
    }
}

class Ability extends BaseTypeidUnique {
    typeid = new Int32Type(false, true, true);
    efeito = new AbilityEfeito();
    date = Array(2).fill(0).map(_ => new SYSTEMTIME());
    type = new ItemTableTypeValue32();
    type_on = new Int32Type(true, true, true);

    constructor(_data = undefined) {
        super();
        if (_data)
            this.unserialize(_data.getBuffer(this.getSize()));
    }

    getSize() {
        return this.typeid.getSize() + this.efeito.getSize()
            + this.date.reduce((acc, v) => acc + v.getSize(), 0)
            + this.type.getSize() + this.type_on.getSize();
    }

    unserialize(_data) {
        this.typeid.unserialize(_data.getBuffer(this.typeid.getSize()));
        this.efeito.unserialize(_data.getBuffer(this.efeito.getSize()));
        this.date.forEach(v => v.unserialize(_data.getBuffer(v.getSize())));
        this.type.unserialize(_data.getBuffer(this.type.getSize()));
        this.type_on.unserialize(_data.getBuffer(this.type_on.getSize()));
    }
    serialize(_data) {
        this.typeid.serialize(_data);
        this.efeito.serialize(_data);
        this.date.forEach(v => v.serialize(_data));
        this.type.serialize(_data);
        this.type_on.serialize(_data);
    }
    getIdentifyName() {
        return this.typeid.value.toString(16);
    }
    layout(_parent) {
        this.typeid.layout(_parent, "typeid");
        this.type.layout(_parent, "type");
        this.type_on.layout(_parent, "type_on");

        _parent.appendChild(arrayLayout(this.date, "date"));

    	classLayout(_parent, "efeito", this.efeito);
    }
}

class ClubSetWorkShopLevelUpProb extends BaseTypeidUnique {
    tipo = new WorkShopTipoSoloValue32(false, true, true);
    c = Array(5).fill(0).map(_ => new Int32Type(false, true, true));

    get typeid() {
        return this.tipo;
    }
    set typeid(_tipo) {
        this.tipo = _tipo;
    }

    constructor(_data = undefined) {
        super();
        if (_data)
            this.unserialize(_data.getBuffer(this.getSize()));
    }

    getSize() {
        return this.tipo.getSize() + this.c.reduce((acc, v) => acc + v.getSize(), 0);
    }

    unserialize(_data) {
        this.tipo.unserialize(_data.getBuffer(this.tipo.getSize()));
        this.c.forEach(v => v.unserialize(_data.getBuffer(v.getSize())));
    }
    serialize(_data) {
        this.tipo.serialize(_data);
        this.c.forEach(v => v.serialize(_data));
    }
    getIdentifyName() {
        const _v = this.tipo.value;
        return `${_v} - ${WorkShopTipoSolo.getName(_v) ?? _v}`;
    }
    layout(_parent) {
        this.tipo.layout(_parent, "tipo");

        _parent.appendChild(arrayLayout(this.c, "c", statistics));
    }
}

class ClubSetWorkShopLevelUpLimit extends BaseTypeidUnique {
    tipo = new WorkShopTipoSoloValue32(false, true, true);
    rank = new RankClubSetValue32(false, true, true);
    c = Array(5).fill(0).map(_ => new Int16Type(false, true, true));
    point = new Int16Type(false, true, true);       // pode ser align memory

    get typeid() {
        return this.tipo;
    }
    set typeid(_tipo) {
        this.tipo = _tipo;
    }

    isTypeidUnique() {
        return false;
    }

    constructor(_data = undefined) {
        super();
        if (_data)
            this.unserialize(_data.getBuffer(this.getSize()));
    }

    getSize() {
        return this.tipo.getSize() + this.rank.getSize()
            + this.c.reduce((acc, v) => acc + v.getSize(), 0)
            + this.point.getSize();
    }

    unserialize(_data) {
        this.tipo.unserialize(_data.getBuffer(this.tipo.getSize()));
        this.rank.unserialize(_data.getBuffer(this.rank.getSize()));
        this.c.forEach(v => v.unserialize(_data.getBuffer(v.getSize())));
        this.point.unserialize(_data.getBuffer(this.point.getSize()));
    }
    serialize(_data) {
        this.tipo.serialize(_data);
        this.rank.serialize(_data);
        this.c.forEach(v => v.serialize(_data));
        this.point.serialize(_data);
    }
    getIdentifyName() {
        const tv = this.tipo.value, rv = this.rank.value;
        return `${tv} - ${WorkShopTipoSolo.getName(tv) ?? tv} | ${rv} - ${RankClubSet.getName(rv) ?? rv}`;
    }
    layout(_parent) {
        this.tipo.layout(_parent, "tipo");
        this.rank.layout(_parent, "rank");
        this.point.layout(_parent, "point");

        _parent.appendChild(arrayLayout(this.c, "c", statistics));
    }
}

class ClubSetWorkShopRankUpExp extends BaseTypeidUnique {
    tipo = new RankSTipoValue32(false, true, true);
    rank = Array(6).fill(0).map(_ => new Int32Type(false, true, true));

    get typeid() {
        return this.tipo;
    }
    set typeid(_tipo) {
        this.tipo = _tipo;
    }

    constructor(_data = undefined) {
        super();
        if (_data)
            this.unserialize(_data.getBuffer(this.getSize()));
    }

    getSize() {
        return this.tipo.getSize() + this.rank.reduce((acc, v) => acc + v.getSize(), 0);
    }

    unserialize(_data) {
        this.tipo.unserialize(_data.getBuffer(this.tipo.getSize()));
        this.rank.forEach(v => v.unserialize(_data.getBuffer(v.getSize())));
    }
    serialize(_data) {
        this.tipo.serialize(_data);
        this.rank.forEach(v => v.serialize(_data));
    }
    getIdentifyName() {
        const tv = this.tipo.value;
        return `${tv} - ${RankSTipo.getName(tv) ?? tv}`;
    }
    layout(_parent) {
        this.tipo.layout(_parent, "tipo");


        _parent.appendChild(arrayLayout(this.rank, "rank", RankClubSet));
    }
}

class AddonPart extends BaseTypeidUnique {
    active = new Int32Type(true, true, true);
    typeid = new Int32Type(false, true, true);
    mpet = new StringType(40, StringTypeRelation.ASSET.MODEL);
    texture = Array(3).fill(0).map(_ => new StringType(40, StringTypeRelation.ASSET.TEXTURE));
    texture_org = Array(3).fill(0).map(_ => new StringType(40, StringTypeRelation.ASSET.TEXTURE));

    isTypeidUnique() {
        return false;
    }

    constructor(_data = undefined) {
        super();
        if (_data)
            this.unserialize(_data.getBuffer(this.getSize()));
    }

    getSize() {
        return this.active.getSize() + this.typeid.getSize() + this.mpet.getSize()
            + this.texture.reduce((acc, v) => acc + v.getSize(), 0)
            + this.texture_org.reduce((acc, v) => acc + v.getSize(), 0);
    }

    unserialize(_data) {
        this.active.unserialize(_data.getBuffer(this.active.getSize()));
        this.typeid.unserialize(_data.getBuffer(this.typeid.getSize()));
        this.mpet.unserialize(_data.getBuffer(this.mpet.getSize()));
        this.texture.forEach(v => v.unserialize(_data.getBuffer(v.getSize())));
        this.texture_org.forEach(v => v.unserialize(_data.getBuffer(v.getSize())));
    }
    serialize(_data) {
        this.active.serialize(_data);
        this.typeid.serialize(_data);
        this.mpet.serialize(_data);
        this.texture.forEach(v => v.serialize(_data));
        this.texture_org.forEach(v => v.serialize(_data));
    }
    getIdentifyName() {
        return this.typeid.value.toString(16);
    }
    layout(_parent) {
        this.active.layout(_parent, "active");
        this.typeid.layout(_parent, "typeid");
        this.mpet.layout(_parent, "mpet");
        _parent.appendChild(arrayLayout(this.texture, "texture"));
        _parent.appendChild(arrayLayout(this.texture_org, "texture_org"));
    }
}

class SetEffectTableEffectType {
    static NONE = 0;
    static ANIMATION = 1;
    static UNKNOWN_V2 = 2;
    static CUTIN = 3;
    static PIXEL = 4;
    static BASE = 5;
    static ONE_ALL_STATS = 6;
    static WIND_DECREASE = 7;
    static PATINHA = 8;
}

const SetEffectTableEffectTypeValue32 = createEnumValueType(Int32Type, SetEffectTableEffectType);

class SetEffectTableEffect {
     effect = Array(3).fill(0).map(_ => new SetEffectTableEffectTypeValue32());
     type = Array(3).fill(0).map(_ => new ItemTableTypeValue32());

    constructor(_data = undefined) {
        if (_data)
            this.unserialize(_data.getBuffer(this.getSize()));
    }

    getSize() {
        return this.effect.reduce((acc, v) => acc + v.getSize(), 0)
            + this.type.reduce((acc, v) => acc + v.getSize(), 0);
    }

    unserialize(_data) {
        this.effect.forEach(v => v.unserialize(_data.getBuffer(v.getSize())));
        this.type.forEach(v => v.unserialize(_data.getBuffer(v.getSize())));
    }
    serialize(_data) {
        this.effect.forEach(v => v.serialize(_data));
        this.type.forEach(v => v.serialize(_data));
    }
    layout(_parent) {
        _parent.appendChild(arrayLayout(this.effect, "effect"));
        _parent.appendChild(arrayLayout(this.type, "type"));
    }
}

class SetEffectTableItem {
     typeid = Array(5).fill(0).map(_ => new QuestStuffRewardTypeidLinkValue(false, true, true));
    active = Array(5).fill(0).map(_ => new Int8Type(true, true));

    constructor(_data = undefined) {
        if (_data)
            this.unserialize(_data.getBuffer(this.getSize()));
    }

    getSize() {
        return this.typeid.reduce((acc, v) => acc + v.getSize(), 0)
            + this.active.reduce((acc, v) => acc + v.getSize(), 0);
    }

    unserialize(_data) {
        this.typeid.forEach(v => v.unserialize(_data.getBuffer(v.getSize())));
        this.active.forEach(v => v.unserialize(_data.getBuffer(v.getSize())));
    }
    serialize(_data) {
        this.typeid.forEach(v => v.serialize(_data));
        this.active.forEach(v => v.serialize(_data));
    }
    layout(_parent) {
        _parent.appendChild(arrayLayout(this.typeid, "typeid"));
        _parent.appendChild(arrayLayout(this.active, "active"));
    }
}

class HexEditor {

    _count = 0;
    _bytes = [];
    _layoutWrap = undefined;

    // _opt.grow: sem a altura fixa — o editor cresce até o fim da página
    // (usado quando é o último campo do layout, ex.: unknown do AIOptionalData)
    constructor(_count = 0, _opt = {}) {
        this._count = _count;
        this._bytes = [];
        this._grow = !!(_opt && _opt.grow);

        for (let i = 0; i < this._count; i++)
            this._bytes.push(new Int8Type(false, true));
    }

    getSize() {
        return this._count;
    }

    unserialize(_data) {
        for (let i = 0; i < this._count; i++)
            this._bytes[i].unserialize(_data.getBuffer(1));
    }

    serialize(_data) {
        for (let i = 0; i < this._count; i++)
            this._bytes[i].serialize(_data);
    }

    get value() {
        return this._bytes.map(_b => _b.value);
    }

    set value(_arr) {
        if (!Array.isArray(_arr))
            return;

        for (let i = 0; i < this._count; i++)
            this._bytes[i].value = _arr[i] || 0;
    }

    layout(_parent, _name = "unknown") {

        let container =
            document.createElement("div");

        container.className =
            "field-col";

        let label =
            document.createElement("span");

        label.className =
            "type-label";

        label.textContent =
            _name + ": ";

        container.appendChild(label);

        _parent.appendChild(container);

        this._layoutWrap =
            container;

        const box =
            document.createElement("div");

        box.className =
            "hexeditor"
            + (this._grow ? ' hex-grow' : '');

        // grow: ocupa o espaço restante do painel via FLEX (main.css) — o
        // campo-col que contém o editor encolhe até o mínimo quando falta
        // espaço (scroll interno preservado) e cresce quando sobra, sem
        // gerar scroll no painel de info
        if (this._grow)
            box.classList.add('hex-grow');

        // monta as linhas num FRAGMENT e anexa uma única vez: inserir as
        // ~30 rows/452 inputs um a um com o container JÁ no DOM gerava
        // reflow/style recalc por inserção (lag visível nos itens com editor
        // grande — GrandPrixAIOptionalData/SetEffectTable)
        const frag =
            document.createDocumentFragment();

        const perRow = 16;

        for (let r = 0; r < this._count; r += perRow) {

            const row =
                document.createElement("div");

            row.className =
                "hex-row";

            const off =
                document.createElement("span");

            off.className =
                "hex-offset";

            off.textContent =
                r.toString(16).toUpperCase().padStart(4, "0") + ":";

            row.appendChild(off);

            const end =
                Math.min(r + perRow, this._count);

            for (let i = r; i < end; i++) {

                const input =
                    document.createElement("input");

                input.type = "text";
                input.className = "hex-byte";
                input.maxLength = 2;
                input.dataset.field = _name;

                const render = () =>
                    input.value =
                        (this._bytes[i].value & 0xFF)
                            .toString(16)
                            .toUpperCase()
                            .padStart(2, "0");

                render();

                input.addEventListener("input", () => {

                    const s =
                        input.value
                            .toUpperCase()
                            .replace(/[^0-9A-F]/g, "")
                            .slice(0, 2);

                    if (s !== input.value)
                        input.value = s;
                });

                input.addEventListener("change", () => {

                    const v =
                        parseInt(input.value || "0", 16);

                    if (!isNaN(v)) {
                        this._bytes[i].value = v & 0xFF;
                        render();
                    } else {
                        render();
                    }
                });

                row.appendChild(input);
            }

            const ascii =
                document.createElement("span");

            ascii.className =
                "hex-ascii";

            let asciiText = "";

            for (let i = r; i < end; i++) {

                const b =
                    this._bytes[i].value & 0xFF;

                asciiText +=
                    (b >= 0x20 && b <= 0x7E)
                        ? String.fromCharCode(b)
                        : ".";
            }

            ascii.textContent = asciiText;

            row.appendChild(ascii);

            frag.appendChild(row);
        }

        box.appendChild(frag);

        container.appendChild(box);
    }
}

class SetEffectTable extends BaseTypeidUnique {
    id = new Int32Type(false, true, true);
    effect = new SetEffectTableEffect();
    item = new SetEffectTableItem();
    unknown = new HexEditor(11);
    slot = Array(5).fill(0).map(_ => new Int16Type(false, true, true));
    effect_add_power = new Int16Type(false, true, true);

    get typeid() {
        return this.id;
    }
    set typeid(_id) {
        this.id = _id;
    }

    constructor(_data = undefined) {
        super();
        if (_data)
            this.unserialize(_data.getBuffer(this.getSize()));
    }

    getSize() {
        return this.id.getSize() + this.effect.getSize() + this.item.getSize()
            + this.unknown.getSize()
            + this.slot.reduce((acc, v) => acc + v.getSize(), 0)
            + this.effect_add_power.getSize();
    }

    unserialize(_data) {
        this.id.unserialize(_data.getBuffer(this.id.getSize()));
        this.effect.unserialize(_data.getBuffer(this.effect.getSize()));
        this.item.unserialize(_data.getBuffer(this.item.getSize()));
        this.unknown.unserialize(_data.getBuffer(this.unknown.getSize()));
        this.slot.forEach(v => v.unserialize(_data.getBuffer(v.getSize())));
        this.effect_add_power.unserialize(_data.getBuffer(this.effect_add_power.getSize()));
    }
    serialize(_data) {
        this.id.serialize(_data);
        this.effect.serialize(_data);
        this.item.serialize(_data);
        this.unknown.serialize(_data);
        this.slot.forEach(v => v.serialize(_data));
        this.effect_add_power.serialize(_data);
    }
    getIdentifyName() {
        return this.id.value.toString();
    }
    layout(_parent) {
        this.id.layout(_parent, "id");
        this.effect_add_power.layout(_parent, "effect_add_power");

        _parent.appendChild(arrayLayout(this.slot, "slot", statistics));

    	classLayout(_parent, "effect", this.effect);
    	classLayout(_parent, "item", this.item);

        // unknown por último no painel (a ordem do unserialize não muda)
        this.unknown.layout(_parent, "unknown");
    }
}

class GrandPrixDataTicket {
    typeid = new GrandPrixDataTicketTypeidLinkValue(false, true, true);
    qntd = new Int32Type(false, true, true);

    constructor(_data = undefined) {
        if (_data)
            this.unserialize(_data.getBuffer(this.getSize()));
    }

    getSize() {
        return this.typeid.getSize() + this.qntd.getSize();
    }

    unserialize(_data) {
        this.typeid.unserialize(_data.getBuffer(this.typeid.getSize()));
        this.qntd.unserialize(_data.getBuffer(this.qntd.getSize()));
    }
    serialize(_data) {
        this.typeid.serialize(_data);
        this.qntd.serialize(_data);
    }
    layout(_parent) {
        this.typeid.layout(_parent, "typeid");
        this.qntd.layout(_parent, "qntd");
    }
}

class GrandPrixDataFlag {
    natural = new Int8Type(true, true);
    short_game = new Int8Type(true, true);
    hole_cup_x2 = new Int8Type(true, true);

    constructor(_data = undefined) {
        if (_data)
            this.unserialize(_data.getBuffer(this.getSize()));
    }

    getSize() {
        return this.natural.getSize() + this.short_game.getSize() + this.hole_cup_x2.getSize();
    }

    unserialize(_data) {
        this.natural.unserialize(_data.getBuffer(this.natural.getSize()));
        this.short_game.unserialize(_data.getBuffer(this.short_game.getSize()));
        this.hole_cup_x2.unserialize(_data.getBuffer(this.hole_cup_x2.getSize()));
    }
    serialize(_data) {
        this.natural.serialize(_data);
        this.short_game.serialize(_data);
        this.hole_cup_x2.serialize(_data);
    }
    layout(_parent) {
        this.natural.layout(_parent, "natural");
        this.short_game.layout(_parent, "short_game");
        this.hole_cup_x2.layout(_parent, "hole_cup_x2");
    }
}

class GrandPrixDataCourseInfo {
    course = new Int32Type(false, true, true);
    modo = new GrandPrixDataModoValue32();
    qntd_hole = new Int8Type(false, true);

    constructor(_data = undefined) {
        if (_data)
            this.unserialize(_data.getBuffer(this.getSize()));
    }

    getSize() {
        return this.course.getSize() + this.modo.getSize() + this.qntd_hole.getSize();
    }

    unserialize(_data) {
        this.course.unserialize(_data.getBuffer(this.course.getSize()));
        this.modo.unserialize(_data.getBuffer(this.modo.getSize()));
        this.qntd_hole.unserialize(_data.getBuffer(this.qntd_hole.getSize()));
    }
    serialize(_data) {
        this.course.serialize(_data);
        this.modo.serialize(_data);
        this.qntd_hole.serialize(_data);
    }
    layout(_parent) {
        // course: select com os courses (Course.iff — label `id — nome`), igual
        // ao character do HairStyle.iff (mas lista os typeids do Course.iff)
        buildFieldSelection(_parent, 'course', {
            searchEnabled: true,
            options: select => fillIffTypeidOptions(select, 'Course.iff', this.course.value,
                // 127 (0x7F) é o sentinela RANDOM (nenhum course específico) —
                // opção FIXA para o usuário poder escolher
                [[127, 'RANDOM']]),
            onChange: value => { this.course.value = value; },
        });
        this.modo.layout(_parent, "modo");
        this.qntd_hole.layout(_parent, "qntd_hole");
    }
}

class GrandPrixDataBot {
    score_max = new Int32Type();
    score_med = new Int32Type();
    score_min = new Int32Type();

    constructor(_data = undefined) {
        if (_data)
            this.unserialize(_data.getBuffer(this.getSize()));
    }

    getSize() {
        return this.score_max.getSize() + this.score_med.getSize() + this.score_min.getSize();
    }

    unserialize(_data) {
        this.score_max.unserialize(_data.getBuffer(this.score_max.getSize()));
        this.score_med.unserialize(_data.getBuffer(this.score_med.getSize()));
        this.score_min.unserialize(_data.getBuffer(this.score_min.getSize()));
    }
    serialize(_data) {
        this.score_max.serialize(_data);
        this.score_med.serialize(_data);
        this.score_min.serialize(_data);
    }
    layout(_parent) {
        this.score_max.layout(_parent, "score_max");
        this.score_med.layout(_parent, "score_med");
        this.score_min.layout(_parent, "score_min");
    }
}

class GrandPrixDataReward {
    typeid = Array(5).fill(0).map(_ => new QuestStuffRewardTypeidLinkValue(false, true, true));
    qntd = Array(5).fill(0).map(_ => new Int32Type(false, true, true));
    time = Array(5).fill(0).map(_ => new Int32Type(false, true, true));

    constructor(_data = undefined) {
        if (_data)
            this.unserialize(_data.getBuffer(this.getSize()));
    }

    getSize() {
        return this.typeid.reduce((acc, v) => acc + v.getSize(), 0)
            + this.qntd.reduce((acc, v) => acc + v.getSize(), 0)
            + this.time.reduce((acc, v) => acc + v.getSize(), 0);
    }

    unserialize(_data) {
        this.typeid.forEach(v => v.unserialize(_data.getBuffer(v.getSize())));
        this.qntd.forEach(v => v.unserialize(_data.getBuffer(v.getSize())));
        this.time.forEach(v => v.unserialize(_data.getBuffer(v.getSize())));
    }
    serialize(_data) {
        this.typeid.forEach(v => v.serialize(_data));
        this.qntd.forEach(v => v.serialize(_data));
        this.time.forEach(v => v.serialize(_data));
    }
    layout(_parent) {
        _parent.appendChild(arrayLayout(this.typeid, "typeid"));
        _parent.appendChild(arrayLayout(this.qntd, "qntd"));
        _parent.appendChild(arrayLayout(this.time, "time"));
    }
}

class GrandPrixDataAbaClass {
    static ROOKIE = 0;
    static BEGINNER = 1;
    static JUNIOR = 2;
    static SENIOR = 3;

    static getName(_value) {
        switch (_value) {
            case 0: return 'ROOKIE';
            case 1: return 'BEGINNER';
            case 2: return 'JUNIOR';
            case 3: return 'SENIOR';
        }
        return 'ABA_' + _value;
    }
}

class GrandPrixDataClass {
    static GP_CLASS_NONE = 0;
    static GP_CLASS_1 = 1;
    static GP_CLASS_2 = 2;
    static GP_CLASS_3 = 3;
    static GP_CLASS_4 = 4;
    static GP_CLASS_5 = 5;
    static GP_CLASS_6 = 6;
    static GP_CLASS_7 = 7;
    static GP_CLASS_8 = 8;
    static GP_CLASS_9 = 9;
    static GP_CLASS_10 = 10;
    static GP_CLASS_11 = 11;
    static GP_CLASS_12 = 12;
    static GP_CLASS_13 = 13;
    static GP_CLASS_14 = 14;
    static GP_CLASS_15 = 15;

    static getName(_value) {
        switch (_value) {
            case 0: return 'GP_CLASS_NONE';
            case 1: return 'GP_CLASS_1';
            case 2: return 'GP_CLASS_2';
            case 3: return 'GP_CLASS_3';
            case 4: return 'GP_CLASS_4';
            case 5: return 'GP_CLASS_5';
            case 6: return 'GP_CLASS_6';
            case 7: return 'GP_CLASS_7';
            case 8: return 'GP_CLASS_8';
            case 9: return 'GP_CLASS_9';
            case 10: return 'GP_CLASS_10';
            case 11: return 'GP_CLASS_11';
            case 12: return 'GP_CLASS_12';
            case 13: return 'GP_CLASS_13';
            case 14: return 'GP_CLASS_14';
            case 15: return 'GP_CLASS_15';
        }
        return 'GP_CLASS_' + _value;
    }
}

class GrandPrixDataGpType {
    static getName(_value) {
        return 'TYPE_' + _value;
    }
}
// gp_type é um campo livre de 11 bits no typeid (no pack real pangya_jp_all_jp
// vai além de 0..12) — o enum cobre todo o intervalo possível (TYPE_0..TYPE_2047)
for (let i = 0; i <= 0x7FF; i++)
    GrandPrixDataGpType['TYPE_' + i] = i;

class GrandPrixDataModo {
    static FRONT = 0;
    static BACK = 1;
    static RANDOM = 2;
    static SHUFFLE = 3;
    static REPEAT = 4;
    static SHUFFLE_COURSE = 5;

    static getName(_value) {
        switch (_value) {
            case 0: return 'FRONT';
            case 1: return 'BACK';
            case 2: return 'RANDOM';
            case 3: return 'SHUFFLE';
            case 4: return 'REPEAT';
            case 5: return 'SHUFFLE_COURSE';
        }
        return 'MODO_' + _value;
    }
}

const GrandPrixDataClassValue32 = createEnumValueType(Int32Type, GrandPrixDataClass);
const GrandPrixDataGpTypeValue32 = createEnumValueType(Int32Type, GrandPrixDataGpType);
const GrandPrixDataModoValue32 = createEnumValueType(Int32Type, GrandPrixDataModo);

class GrandPrixDataRuleTypeidLinkValue extends TypeidLinkValue {
    _linkIff = 'Item.iff';
    _linkTitle = "Escolher rule do Item.iff (tipo GRAND_PRIX_RULE)";
    _linkFilterPredicate(_item) {
        return !!(_item.tipo_item && _item.tipo_item.value === ItemTipo.GRAND_PRIX_RULE);
    }
}

class GrandPrixDataTicketTypeidLinkValue extends TypeidLinkValue {
    _linkIff = 'Item.iff';
    _linkTitle = "Escolher item passivo do Item.iff (ticket)";

    _linkFilterPredicate(_item) {
        return Item.createTypeidbit(_item.typeid.value).item_passive === 1;
    }
}

// (re)deriva typeid_link (= typeid & ~0xFF) e o campo type a partir do
// bit gp_event do typeid (com evento = EVENT_NORMAL; sem = NORMAL),
// atualizando os inputs exibidos quando o campo está no layout. Usado no
// onchange do typeid — cobre edição manual do input E a troca pelo modal de
// edição (o addTypeidPick dispara change depois de aplicar)
function grandPrixDeriveLink(_item) {

    _item.typeid_link.value =
        (_item.typeid.value & ~0xFF) >>> 0;

    _item.type.value =
        GrandPrixData.createTypeidbit(_item.typeid.value).gp_event !== 0
            ? GrandPrixDataType.EVENT_NORMAL
            : GrandPrixDataType.NORMAL;

    const wrap =
        _item.typeid_link._layoutWrap;

    if (!wrap || !wrap.querySelectorAll)
        return;

    const inputs =
        wrap.querySelectorAll('input');

    const input =
        inputs.length ? inputs[inputs.length - 1] : null;

    if (!input)
        return;

    const modeTgl =
        wrap.querySelector('.num-mode');

    input.value = modeTgl && modeTgl.checked
        ? '0x' + _item.typeid_link.value.toString(16)
        : String(_item.typeid_link.value);
}

class GrandPrixDataClearTypeidLinkValue extends TypeidLinkValue {
    _linkIff = 'GrandPrixData.iff';
    _linkTitle = "Escolher GrandPrix que bloqueia (clear_gp_typeid)";
}

class GrandPrixDataType {
    static NORMAL = 0;
    static EVENT_NORMAL = 1;
    static EVENT_WEEKEND = 2;
    static EVENT_3 = 3;
    static EVENT_4 = 4;
    static EVENT_5 = 5;
    static EVENT_6 = 6;
    static EVENT_7 = 7;
    static EVENT_8 = 8;
    static EVENT_9 = 9;
    static EVENT_10 = 10;
    static EVENT_11 = 11;
    static EVENT_12 = 12;
    static EVENT_13 = 13;
    static EVENT_14 = 14;
    static EVENT_15 = 15;
    static EVENT_16 = 16;
}

const GrandPrixDataTypeValue32 =
    createEnumValueType(Int32Type, GrandPrixDataType);

class GrandPrixData extends BaseTypeidUnique {
    active = new Int32Type(true, true, true);
    typeid = new Int32Type(false, true, true);
    typeid_link = new Int32Type(false, true, true);
    type = new GrandPrixDataTypeValue32(false, true, true);
    time_hole = new Int16Type(false, true, true);
    name = new StringType(64, StringTypeRelation.TEXT);
    unknown1 = new Int16Type(false, true, true);
    ticket = new GrandPrixDataTicket();
    img = new StringType(41, StringTypeRelation.ASSET.IMG);
    flag = new GrandPrixDataFlag();
    rule = new GrandPrixDataRuleTypeidLinkValue(false, true, true);
    course_info = new GrandPrixDataCourseInfo();
    level_min = new LevelValue8();
    level_max = new LevelValue8();
    unknown2 = new Int8Type(false, true);
    condition = Array(2).fill(0).map(_ => new Int32Type(false, true, true));
    bot = new GrandPrixDataBot();
    class = new GrandPrixDataClassValue32();
    pang = new Int32Type(false, true, true);
    reward = new GrandPrixDataReward();
    open = new SYSTEMTIME(undefined, { is_only_time: true, fill_zero_time: true });
    start = new SYSTEMTIME(undefined, { is_only_time: true, fill_zero_time: true });
    end = new SYSTEMTIME(undefined, { is_only_time: true, fill_zero_time: true });
    unknown3 = new Int32Type(false, true, true);
    clear_gp_typeid = new GrandPrixDataClearTypeidLinkValue(false, true, true);
    lock_yn = new Int32Type(true, true, true);
    info = new StringType(512, StringTypeRelation.TEXT);
    unknown4 = new Int32Type(false, true, true);

    static createTypeidbit(_typeid = 0) {
        return new BitfieldType(new Int32Type(false, true, true), {
            gp_num: 8,
            gp_type: 11,
            gp_class: 5,
            gp_event: 8
        }, _typeid);
    }

    static generateTypeid(_class = 0, _type = 0, _is_event = false) {
        
        const typeidbit = GrandPrixData.createTypeidbit();

        typeidbit.gp_class = _class;
        typeidbit.gp_type = _type;
        typeidbit.gp_event = _is_event ? 3 : 0;

        return typeidbit;
    }

    filter(_element) {
        const typeidbit = GrandPrixData.createTypeidbit(this.typeid.value);
        const typeidbit2 = GrandPrixData.createTypeidbit(_element.typeid.value);

        return typeidbit.gp_event == typeidbit2.gp_event
            && typeidbit.gp_class == typeidbit2.gp_class
            && typeidbit.gp_type == typeidbit2.gp_type;
    }

    constructor(_data = undefined) {
        super();
        // typeid_link é um typeid (derivado do typeid sem o gp_num) — segue a
        // regra de hex/dec (default hex) como o campo typeid
        this.typeid_link._input_mode = 'hex';
        if (_data)
            this.unserialize(_data.getBuffer(this.getSize()));

        // qualquer troca do typeid (input do layout ou edição pelo modal do
        // addTypeidPick) rederiva o link e o type na hora
        this.typeid.onchange = () => grandPrixDeriveLink(this);
    }

    getSize() {
        return this.active.getSize() + this.typeid.getSize() + this.typeid_link.getSize()
            + this.type.getSize() + this.time_hole.getSize() + this.name.getSize()
            + this.unknown1.getSize() + this.ticket.getSize() + this.img.getSize()
            + this.flag.getSize() + this.rule.getSize() + this.course_info.getSize()
            + this.level_min.getSize() + this.level_max.getSize() + this.unknown2.getSize()
            + this.condition.reduce((acc, v) => acc + v.getSize(), 0) + this.bot.getSize()
            + this.class.getSize() + this.pang.getSize() + this.reward.getSize()
            + this.open.getSize() + this.start.getSize() + this.end.getSize()
            + this.unknown3.getSize() + this.clear_gp_typeid.getSize() + this.lock_yn.getSize()
            + this.info.getSize() + this.unknown4.getSize();
    }

    unserialize(_data) {
        this.active.unserialize(_data.getBuffer(this.active.getSize()));
        this.typeid.unserialize(_data.getBuffer(this.typeid.getSize()));
        this.typeid_link.unserialize(_data.getBuffer(this.typeid_link.getSize()));
        this.type.unserialize(_data.getBuffer(this.type.getSize()));
        this.time_hole.unserialize(_data.getBuffer(this.time_hole.getSize()));
        this.name.unserialize(_data.getBuffer(this.name.getSize()));
        this.unknown1.unserialize(_data.getBuffer(this.unknown1.getSize()));
        this.ticket.unserialize(_data.getBuffer(this.ticket.getSize()));
        this.img.unserialize(_data.getBuffer(this.img.getSize()));
        this.flag.unserialize(_data.getBuffer(this.flag.getSize()));
        this.rule.unserialize(_data.getBuffer(this.rule.getSize()));
        this.course_info.unserialize(_data.getBuffer(this.course_info.getSize()));
        this.level_min.unserialize(_data.getBuffer(this.level_min.getSize()));
        this.level_max.unserialize(_data.getBuffer(this.level_max.getSize()));
        this.unknown2.unserialize(_data.getBuffer(this.unknown2.getSize()));
        this.condition.forEach(v => v.unserialize(_data.getBuffer(v.getSize())));
        this.bot.unserialize(_data.getBuffer(this.bot.getSize()));
        this.class.unserialize(_data.getBuffer(this.class.getSize()));
        this.pang.unserialize(_data.getBuffer(this.pang.getSize()));
        this.reward.unserialize(_data.getBuffer(this.reward.getSize()));
        this.open.unserialize(_data.getBuffer(this.open.getSize()));
        this.start.unserialize(_data.getBuffer(this.start.getSize()));
        this.end.unserialize(_data.getBuffer(this.end.getSize()));
        this.unknown3.unserialize(_data.getBuffer(this.unknown3.getSize()));
        this.clear_gp_typeid.unserialize(_data.getBuffer(this.clear_gp_typeid.getSize()));
        this.lock_yn.unserialize(_data.getBuffer(this.lock_yn.getSize()));
        this.info.unserialize(_data.getBuffer(this.info.getSize()));
        this.unknown4.unserialize(_data.getBuffer(this.unknown4.getSize()));
    }
    serialize(_data) {
        this.active.serialize(_data);
        this.typeid.serialize(_data);
        this.typeid_link.serialize(_data);
        this.type.serialize(_data);
        this.time_hole.serialize(_data);
        this.name.serialize(_data);
        this.unknown1.serialize(_data);
        this.ticket.serialize(_data);
        this.img.serialize(_data);
        this.flag.serialize(_data);
        this.rule.serialize(_data);
        this.course_info.serialize(_data);
        this.level_min.serialize(_data);
        this.level_max.serialize(_data);
        this.unknown2.serialize(_data);
        this.condition.forEach(v => v.serialize(_data));
        this.bot.serialize(_data);
        this.class.serialize(_data);
        this.pang.serialize(_data);
        this.reward.serialize(_data);
        this.open.serialize(_data);
        this.start.serialize(_data);
        this.end.serialize(_data);
        this.unknown3.serialize(_data);
        this.clear_gp_typeid.serialize(_data);
        this.lock_yn.serialize(_data);
        this.info.serialize(_data);
        this.unknown4.serialize(_data);
    }
    getIdentifyName() {
        return `${this.typeid.value.toString(16)} ${this.name.value}`;
    }
    layout(_parent) {
        super.layout(_parent);
        this.active.layout(_parent, "active");
        this.typeid.layout(_parent, "typeid");
        this.typeid_link.layout(_parent, "typeid_link");
        this.type.layout(_parent, "type");
        this.time_hole.layout(_parent, "time_hole");
        this.name.layout(_parent, "name");
        this.unknown1.layout(_parent, "unknown1");
        this.img.layout(_parent, "img");
        this.rule.layout(_parent, "rule");
        this.level_min.layout(_parent, "level_min");
        this.level_max.layout(_parent, "level_max");
        this.unknown2.layout(_parent, "unknown2");
        this.class.layout(_parent, "class");
        this.pang.layout(_parent, "pang");
        this.unknown3.layout(_parent, "unknown3");
        this.clear_gp_typeid.layout(_parent, "clear_gp_typeid");
        this.lock_yn.layout(_parent, "lock_yn");
        this.info.layout(_parent, "info");
        this.unknown4.layout(_parent, "unknown4");

        // slots do condition com labels descritivos: média mínima / média máxima
        _parent.appendChild(arrayLayout(this.condition, "condition", {
            getName: _i => _i === 0 ? 'AVG(MIN)' : 'AVG(MAX)'
        }));

        classLayout(_parent, "ticket", this.ticket);
        classLayout(_parent, "flag", this.flag);
        classLayout(_parent, "course_info", this.course_info);
        classLayout(_parent, "bot", this.bot);
        classLayout(_parent, "reward", this.reward);

        // open/start/end na mesma linha (horários do GrandPrix), com o label
        // em cima de cada input (como uma tabela)
        const timesRow =
            document.createElement("div");

        timesRow.className =
            "gp-times-row";

        _parent.appendChild(timesRow);

        for (const fld of ["open", "start", "end"]) {

            const cell =
                document.createElement("div");

            cell.className =
                "gp-time-cell";

            const lab =
                document.createElement("div");

            lab.className =
                "gp-time-label";

            lab.textContent =
                fld;

            cell.appendChild(lab);

            this[fld].layout(cell, fld);

            timesRow.appendChild(cell);
        }

        // typeid_link (typeid sem gp_num) fica desabilitado e é rederivado
        // pelo hook typeid.onchange (grandPrixDeriveLink) no construtor.
        const linkInput =
            _parent.querySelector('input[data-field="typeid_link"]');

        if (linkInput)
            linkInput.disabled = true;
    }
}

// seq/hole do GrandPrixSpecialHole: enum 1..18 (dados reais: distribuição
// 1..18 nos dois campos) — nomes SEQ_N / HOLE_N
class GrandPrixSpecialHoleSeq {
    static getName(_value) {
        return (_value >= 1 && _value <= 18) ? ('SEQ_' + _value) : String(_value);
    }
}

for (let i = 1; i <= 18; i++)
    GrandPrixSpecialHoleSeq['SEQ_' + i] = i;

class GrandPrixSpecialHoleHole {
    static getName(_value) {
        return (_value >= 1 && _value <= 18) ? ('HOLE_' + _value) : String(_value);
    }
}

for (let i = 1; i <= 18; i++)
    GrandPrixSpecialHoleHole['HOLE_' + i] = i;

const GrandPrixSpecialHoleSeqValue32 =
    createEnumValueType(Int32Type, GrandPrixSpecialHoleSeq);

const GrandPrixSpecialHoleHoleValue32 =
    createEnumValueType(Int32Type, GrandPrixSpecialHoleHole);

class GrandPrixSpecialHole extends BaseTypeidUnique {
    active = new Int32Type(true, true, true);
    typeid = new Int32Type(false, true, true);
    seq = new GrandPrixSpecialHoleSeqValue32();
    course = new Int32Type(false, true, true);
    hole = new GrandPrixSpecialHoleHoleValue32();

    isTypeidUnique() {
        return false;
    }

    constructor(_data = undefined) {
        super();
        if (_data)
            this.unserialize(_data.getBuffer(this.getSize()));
    }

    getSize() {
        return this.active.getSize() + this.typeid.getSize() + this.seq.getSize()
            + this.course.getSize() + this.hole.getSize();
    }

    unserialize(_data) {
        this.active.unserialize(_data.getBuffer(this.active.getSize()));
        this.typeid.unserialize(_data.getBuffer(this.typeid.getSize()));
        this.seq.unserialize(_data.getBuffer(this.seq.getSize()));
        this.course.unserialize(_data.getBuffer(this.course.getSize()));
        this.hole.unserialize(_data.getBuffer(this.hole.getSize()));
    }
    serialize(_data) {
        this.active.serialize(_data);
        this.typeid.serialize(_data);
        this.seq.serialize(_data);
        this.course.serialize(_data);
        this.hole.serialize(_data);
    }
    getIdentifyName() {
        return this.typeid.value.toString(16);
    }
    layout(_parent) {
        this.active.layout(_parent, "active");
        this.typeid.layout(_parent, "typeid");
        this.seq.layout(_parent, "seq");

        // course igual ao course_info.course do GrandPrixData: select dos
        // courses do Course.iff (label `num — nome`) com o RANDOM fixo e a
        // pré-seleção do valor atual
        buildFieldSelection(_parent, 'course', {
            searchEnabled: true,
            options: select => fillIffTypeidOptions(select, 'Course.iff', this.course.value,
                [[127, 'RANDOM']]),
            onChange: value => { this.course.value = value; },
        });

        this.hole.layout(_parent, "hole");
    }
}

// item_typeid do GrandPrixConditionEquip: hex mod padrão + botão "…" que abre
// o ItemListModal com os MESMOS 13 iffs do reward_item do QuestStuff + o
// Match.iff (14 no total — a mesma lista do NonVisibleItemTable/
// SubscriptionItemTable)
class GrandPrixConditionEquipItemTypeidLinkValue extends TypeidLinkValue {

    _linkIff = [
        'Character.iff', 'Part.iff', 'ClubSet.iff', 'Ball.iff', 'Item.iff',
        'Caddie.iff', 'Skin.iff', 'HairStyle.iff', 'Mascot.iff', 'AuxPart.iff',
        'Card.iff', 'Furniture.iff', 'SetItem.iff', 'Match.iff',
    ];

    _linkTitle = "Escolher item (item_typeid)";
}

class GrandPrixConditionEquip extends BaseTypeidUnique {
    active = new Int32Type(true, true, true);
    typeid = new Int32Type(false, true, true);
    item_typeid = new GrandPrixConditionEquipItemTypeidLinkValue();
    info = new StringType(512, StringTypeRelation.TEXT);
    unknown = new Int32Type(false, true, true);

    // o typeid "real" referenciado (para thumbnail e "ir para o item") é o
    // item_typeid, não o typeid de sequência do próprio elemento
    getRealItemTypeid() {
        return this.item_typeid;
    }

    isTypeidUnique() {
        return false;
    }

    constructor(_data = undefined) {
        super();
        if (_data)
            this.unserialize(_data.getBuffer(this.getSize()));
    }

    getSize() {
        return this.active.getSize() + this.typeid.getSize()
            + this.item_typeid.getSize() + this.info.getSize()
            + this.unknown.getSize();
    }

    unserialize(_data) {
        this.active.unserialize(_data.getBuffer(this.active.getSize()));
        this.typeid.unserialize(_data.getBuffer(this.typeid.getSize()));
        this.item_typeid.unserialize(_data.getBuffer(this.item_typeid.getSize()));
        this.info.unserialize(_data.getBuffer(this.info.getSize()));
        this.unknown.unserialize(_data.getBuffer(this.unknown.getSize()));
    }
    serialize(_data) {
        this.active.serialize(_data);
        this.typeid.serialize(_data);
        this.item_typeid.serialize(_data);
        this.info.serialize(_data);
        this.unknown.serialize(_data);
    }
    // o info (SJIS) entra no label da lista de itens: `typeid - info`
    getIdentifyName() {
        return this.typeid.value.toString(16)
            + (this.info && this.info.value ? (' - ' + stripEncodingMarker(this.info.value)) : '');
    }
    layout(_parent) {
        this.active.layout(_parent, "active");
        this.typeid.layout(_parent, "typeid");
        this.item_typeid.layout(_parent, "item_typeid");
        this.info.layout(_parent, "info");
        this.unknown.layout(_parent, "unknown");
    }
}

// rank do GrandPrixRankReward: enum 1..100 (dados reais: distribuição nos
// ranks 1..10) — nomes RANK_N
class GrandPrixRankRewardRank {
    static getName(_value) {
        return (_value >= 1 && _value <= 100) ? ('RANK_' + _value) : String(_value);
    }
}

for (let i = 1; i <= 100; i++)
    GrandPrixRankRewardRank['RANK_' + i] = i;

const GrandPrixRankRewardRankValue32 =
    createEnumValueType(Int32Type, GrandPrixRankRewardRank);

// trophy_typeid do GrandPrixRankReward: picker do Match.iff filtrando os
// GRAND_PRIX (bit match_special == 3 — dados reais: todos os troféus apontam
// para itens de GP do Match.iff, tipos 1..7 e 100/101)
class GrandPrixRankRewardTrophyTypeidLinkValue extends TypeidLinkValue {

    _linkIff = 'Match.iff';

    _linkTitle = "Escolher trof\u00e9u do Match.iff (tipo GRAND_PRIX)";

    _linkFilterPredicate(_item) {
        return Match.createTypeidbit(_item.typeid.value).match_special === MatchSpecialType.GRAND_PRIX;
    }
}

class GrandPrixRankRewardReward {
    typeid = Array(5).fill(0).map(_ => new QuestStuffRewardTypeidLinkValue());
    qntd = Array(5).fill(0).map(_ => new Int32Type(false, true, true));
    time = Array(5).fill(0).map(_ => new Int32Type(false, true, true));

    constructor(_data = undefined) {
        if (_data)
            this.unserialize(_data.getBuffer(this.getSize()));
    }

    getSize() {
        return this.typeid.reduce((acc, v) => acc + v.getSize(), 0)
            + this.qntd.reduce((acc, v) => acc + v.getSize(), 0)
            + this.time.reduce((acc, v) => acc + v.getSize(), 0);
    }

    unserialize(_data) {
        this.typeid.forEach(v => v.unserialize(_data.getBuffer(v.getSize())));
        this.qntd.forEach(v => v.unserialize(_data.getBuffer(v.getSize())));
        this.time.forEach(v => v.unserialize(_data.getBuffer(v.getSize())));
    }
    serialize(_data) {
        this.typeid.forEach(v => v.serialize(_data));
        this.qntd.forEach(v => v.serialize(_data));
        this.time.forEach(v => v.serialize(_data));
    }
    layout(_parent) {
        _parent.appendChild(arrayLayout(this.typeid, "typeid"));
        _parent.appendChild(arrayLayout(this.qntd, "qntd"));
        _parent.appendChild(arrayLayout(this.time, "time"));
    }
}

class GrandPrixRankReward extends BaseTypeidUnique {
    active = new Int32Type(true, true, true);
    typeid = new Int32Type(false, true, true);
    rank = new GrandPrixRankRewardRankValue32();
    reward = new GrandPrixRankRewardReward();
    trophy_typeid = new GrandPrixRankRewardTrophyTypeidLinkValue();

    isTypeidUnique() {
        return false;
    }

    constructor(_data = undefined) {
        super();
        if (_data)
            this.unserialize(_data.getBuffer(this.getSize()));
    }

    getSize() {
        return this.active.getSize() + this.typeid.getSize() + this.rank.getSize()
            + this.reward.getSize() + this.trophy_typeid.getSize();
    }

    unserialize(_data) {
        this.active.unserialize(_data.getBuffer(this.active.getSize()));
        this.typeid.unserialize(_data.getBuffer(this.typeid.getSize()));
        this.rank.unserialize(_data.getBuffer(this.rank.getSize()));
        this.reward.unserialize(_data.getBuffer(this.reward.getSize()));
        this.trophy_typeid.unserialize(_data.getBuffer(this.trophy_typeid.getSize()));
    }
    serialize(_data) {
        this.active.serialize(_data);
        this.typeid.serialize(_data);
        this.rank.serialize(_data);
        this.reward.serialize(_data);
        this.trophy_typeid.serialize(_data);
    }
    getIdentifyName() {
        return this.typeid.value.toString(16);
    }
    layout(_parent) {
        this.active.layout(_parent, "active");
        this.typeid.layout(_parent, "typeid");
        this.rank.layout(_parent, "rank");
        this.trophy_typeid.layout(_parent, "trophy_typeid");
        classLayout(_parent, "reward", this.reward);
    }
}

class GrandPrixAIOptionalData extends BaseTypeidUnique {
    active = new Int32Type(true, true, true);
    id = new Int32Type(false, true, true);
    name = new StringType(36, StringTypeRelation.TEXT);
    better_or_no = new Int32Type(true, true, true);
    char_id = new Int32Type(false, true, true);
    class = new GrandPrixDataClassValue32();
    parts_typeid = Array(24).fill(0).map(_ => new PartTypeidLinkValue());
    unknown = new HexEditor(452, { grow: true });

    get typeid() {
        return this.id;
    }
    set typeid(_id) {
        this.id = _id;
    }

    filter(_element) {
        return true;
    }

    constructor(_data = undefined) {
        super();
        if (_data)
            this.unserialize(_data.getBuffer(this.getSize()));
    }

    getSize() {
        return this.active.getSize() + this.id.getSize() + this.name.getSize()
            + this.better_or_no.getSize() + this.char_id.getSize() + this.class.getSize()
            + this.parts_typeid.reduce((acc, v) => acc + v.getSize(), 0)
            + this.unknown.getSize();
    }

    unserialize(_data) {
        this.active.unserialize(_data.getBuffer(this.active.getSize()));
        this.id.unserialize(_data.getBuffer(this.id.getSize()));
        this.name.unserialize(_data.getBuffer(this.name.getSize()));
        this.better_or_no.unserialize(_data.getBuffer(this.better_or_no.getSize()));
        this.char_id.unserialize(_data.getBuffer(this.char_id.getSize()));
        this.class.unserialize(_data.getBuffer(this.class.getSize()));
        this.parts_typeid.forEach(v => v.unserialize(_data.getBuffer(v.getSize())));
        this.unknown.unserialize(_data.getBuffer(this.unknown.getSize()));
    }
    serialize(_data) {
        this.active.serialize(_data);
        this.id.serialize(_data);
        this.name.serialize(_data);
        this.better_or_no.serialize(_data);
        this.char_id.serialize(_data);
        this.class.serialize(_data);
        this.parts_typeid.forEach(v => v.serialize(_data));
        this.unknown.serialize(_data);
    }
    getIdentifyName() {
        return `${this.id.value} ${this.name.value}`;
    }
    layout(_parent) {
        this.active.layout(_parent, "active");
        this.id.layout(_parent, "id");
        this.name.layout(_parent, "name");
        this.better_or_no.layout(_parent, "better_or_no");

        // char_id igual ao character do HairStyle: select dos ids do
        // Character.iff (label `id — nome`) com a pré-seleção do valor atual
        buildFieldSelection(_parent, 'char_id', {
            searchEnabled: true,
            options: select => fillIffTypeidOptions(select, 'Character.iff', this.char_id.value),
            onChange: value => { this.char_id.value = value; },
        });

        this.class.layout(_parent, "class");
        _parent.appendChild(arrayLayout(this.parts_typeid, "parts_typeid"));

        this.unknown.layout(_parent, "unknown");
    }
}

class HoleCupDropItem extends BaseTypeidUnique {
    typeid = new Int32Type(false, true, true);
    animation = new StringType(40, StringTypeRelation.ASSET.ANIMATION);

    constructor(_data = undefined) {
        super();
        if (_data)
            this.unserialize(_data.getBuffer(this.getSize()));
    }

    getSize() {
        return this.typeid.getSize() + this.animation.getSize();
    }

    unserialize(_data) {
        this.typeid.unserialize(_data.getBuffer(this.typeid.getSize()));
        this.animation.unserialize(_data.getBuffer(this.animation.getSize()));
    }
    serialize(_data) {
        this.typeid.serialize(_data);
        this.animation.serialize(_data);
    }
    getIdentifyName() {
        return this.typeid.value.toString(16);
    }
    layout(_parent) {
        this.typeid.layout(_parent, "typeid");
        this.animation.layout(_parent, "animation");
    }
}

class MemorialShopCoinItemGachaRange {
    number_min = new Int32Type(false, true, true);
    number_max = new Int32Type(false, true, true);

    constructor(_data = undefined) {
        if (_data)
            this.unserialize(_data.getBuffer(this.getSize()));
    }

    getSize() {
        return this.number_min.getSize() + this.number_max.getSize();
    }

    unserialize(_data) {
        this.number_min.unserialize(_data.getBuffer(this.number_min.getSize()));
        this.number_max.unserialize(_data.getBuffer(this.number_max.getSize()));
    }
    serialize(_data) {
        this.number_min.serialize(_data);
        this.number_max.serialize(_data);
    }
    empty() {
        return this.number_min.value == 0 && this.number_max.value == 0;
    }
    isBetweenGache(_number) {
        return this.number_min.value <= _number && _number <= this.number_max.value;
    }
    layout(_parent) {
        this.number_min.layout(_parent, "number_min");
        this.number_max.layout(_parent, "number_max");
    }
}

class MemorialShopFilterType {
    static NONE = 0;
    static SPRING = 1;
    static SUMMER = 2;
    static FALL = 3;
    static WINTER = 4;
    static CLUBSET = 5;
    static SETITEM = 6;
    static EAR = 7;
    static WING = 8;
    static LUVA = 9;
    static RING_R = 10;
    static RING_L = 11;
    static CADDIE = 12;
    static MASCOT = 13;
    static SUMMER_HOLYDAY = 14;
    static XMAS = 15;
    static HALLOWEEN = 16;
    static MAN = 17;
    static WOMAN = 18;
    static NURI = 19;
    static HANA = 20;
    static AZER = 21;
    static CECI = 22;
    static MAX = 23;
    static KOOH = 24;
    static ARIN = 25;
    static KAZ = 26;
    static LUCIA = 27;
    static NELL = 28;
    static SPIKA = 29;
    static NURI_R = 30;
    static HANA_R = 31;
    static AZER_R = 32;
    static CECI_R = 33;
    static UNKNOWN_34 = 34;
    static FAIRY = 35;

    static getName(_value) {
        return Object.entries(MemorialShopFilterType).find(([, v]) => v === _value)?.[0];
    }

    static getValue(_name) {
        return MemorialShopFilterType[_name];
    }
}

// type do MemorialShopCoinItem (dados reais: {0:1, 1:1, 2:4})
class MemorialShopCoinItemType {
    static NORMAL = 0;
    static PREMIUM = 1;
    static SPECIAL = 2;
    static SCRATCH = 3;

    static getName(_value) {
        return Object.entries(MemorialShopCoinItemType).find(([, v]) => v === _value)?.[0];
    }

    static getValue(_name) {
        return MemorialShopCoinItemType[_name];
    }
}

const MemorialShopCoinItemTypeValue32 = createEnumValueType(Int32Type, MemorialShopCoinItemType);

// rare_type do MemorialShopRareItem — SIGNED (NORMAL_LOW=-1; dados reais
// usam 0..4, o -1 existe no enum p/ o low da faixa normal)
class MemorialShopRareItemType {
    static NORMAL_LOW = -1;
    static NORMAL_HIGH = 0;
    static RARE_LOW = 1;
    static RARE_HIGH = 2;
    static SUPER_RARE_LOW = 3;
    static SUPER_RARE_HIGH = 4;

    static getName(_value) {
        return Object.entries(MemorialShopRareItemType).find(([, v]) => v === _value)?.[0];
    }

    static getValue(_name) {
        return MemorialShopRareItemType[_name];
    }
}

// base Int32Type default = signed (o -1 precisa de sinal)
const MemorialShopRareItemTypeValue32 = createEnumValueType(Int32Type, MemorialShopRareItemType);

const MemorialShopFilterTypeValue32 = createEnumValueType(Int32Type, MemorialShopFilterType);

class MemorialShopCoinItem extends BaseTypeidUnique {
    active = new Int32Type(true, true, true);
    typeid = new Int32Type(false, true, true);
    type = new MemorialShopCoinItemTypeValue32();
    probability = new Int32Type(false, true, true);
    gacha_range = new MemorialShopCoinItemGachaRange();
    filter_type = Array(10).fill(0).map(_ => new MemorialShopFilterTypeValue32());

    constructor(_data = undefined) {
        super();
        if (_data)
            this.unserialize(_data.getBuffer(this.getSize()));
    }

    getSize() {
        return this.active.getSize() + this.typeid.getSize() + this.type.getSize()
            + this.probability.getSize() + this.gacha_range.getSize()
            + this.filter_type.reduce((acc, v) => acc + v.getSize(), 0);
    }

    unserialize(_data) {
        this.active.unserialize(_data.getBuffer(this.active.getSize()));
        this.typeid.unserialize(_data.getBuffer(this.typeid.getSize()));
        this.type.unserialize(_data.getBuffer(this.type.getSize()));
        this.probability.unserialize(_data.getBuffer(this.probability.getSize()));
        this.gacha_range.unserialize(_data.getBuffer(this.gacha_range.getSize()));
        this.filter_type.forEach(v => v.unserialize(_data.getBuffer(v.getSize())));
    }
    serialize(_data) {
        this.active.serialize(_data);
        this.typeid.serialize(_data);
        this.type.serialize(_data);
        this.probability.serialize(_data);
        this.gacha_range.serialize(_data);
        this.filter_type.forEach(v => v.serialize(_data));
    }
    getIdentifyName() {
        return this.typeid.value.toString(16);
    }
    hasFilterType(_filter_type) {
        if (_filter_type == 0)
            return false;

        return this.filter_type.some(i => i.value == _filter_type);
    }
    emptyFilterType() {
        return !this.filter_type.some(i => i.value != 0);
    }
    layout(_parent) {
        this.active.layout(_parent, "active");
        this.typeid.layout(_parent, "typeid");
        this.type.layout(_parent, "type");
        this.probability.layout(_parent, "probability");
        _parent.appendChild(arrayLayout(this.filter_type, "filter_type"));
        classLayout(_parent, "gacha_range", this.gacha_range);
    }
}

class MemorialShopRareItemGacha {
    number = new Int32Type(false, true, true);
    count = new Int32Type(false, true, true);

    constructor(_data = undefined) {
        if (_data)
            this.unserialize(_data.getBuffer(this.getSize()));
    }

    getSize() {
        return this.number.getSize() + this.count.getSize();
    }

    unserialize(_data) {
        this.number.unserialize(_data.getBuffer(this.number.getSize()));
        this.count.unserialize(_data.getBuffer(this.count.getSize()));
    }
    serialize(_data) {
        this.number.serialize(_data);
        this.count.serialize(_data);
    }
    layout(_parent) {
        this.number.layout(_parent, "number");
        this.count.layout(_parent, "count");
    }
}

class MemorialShopRareItem extends BaseTypeidUnique {
    active = new Int32Type(true, true, true);
    gacha = new MemorialShopRareItemGacha();
    typeid = new Int32Type(false, true, true);
    probability = new Int32Type(false, true, true);
    rare_type = new MemorialShopRareItemTypeValue32();
    filter_type = Array(10).fill(0).map(_ => new MemorialShopFilterTypeValue32());
    s_string = new StringType(28, StringTypeRelation.TEXT_NO_TRANSLATE);

    constructor(_data = undefined) {
        super();
        if (_data)
            this.unserialize(_data.getBuffer(this.getSize()));
    }

    getSize() {
        return this.active.getSize() + this.gacha.getSize() + this.typeid.getSize()
            + this.probability.getSize() + this.rare_type.getSize()
            + this.filter_type.reduce((acc, v) => acc + v.getSize(), 0)
            + this.s_string.getSize();
    }

    unserialize(_data) {
        this.active.unserialize(_data.getBuffer(this.active.getSize()));
        this.gacha.unserialize(_data.getBuffer(this.gacha.getSize()));
        this.typeid.unserialize(_data.getBuffer(this.typeid.getSize()));
        this.probability.unserialize(_data.getBuffer(this.probability.getSize()));
        this.rare_type.unserialize(_data.getBuffer(this.rare_type.getSize()));
        this.filter_type.forEach(v => v.unserialize(_data.getBuffer(v.getSize())));
        this.s_string.unserialize(_data.getBuffer(this.s_string.getSize()));
    }
    serialize(_data) {
        this.active.serialize(_data);
        this.gacha.serialize(_data);
        this.typeid.serialize(_data);
        this.probability.serialize(_data);
        this.rare_type.serialize(_data);
        this.filter_type.forEach(v => v.serialize(_data));
        this.s_string.serialize(_data);
    }
    getIdentifyName() {
        return this.typeid.value.toString(16);
    }
    layout(_parent) {
        this.active.layout(_parent, "active");
        this.typeid.layout(_parent, "typeid");
        this.probability.layout(_parent, "probability");
        this.rare_type.layout(_parent, "rare_type");
        this.s_string.layout(_parent, "s_string");

        // labels descritivos nos 5 primeiros slots (Tipo/Gênero/Estação/
        // Evento/Character); os slots 5..9 ficam sem label
        _parent.appendChild(arrayLayout(this.filter_type, "filter_type",
            { getName: _i => kMemorialShopFilterLabels[_i] }));
    	classLayout(_parent, "gacha", this.gacha);
    }
}

class CharacterMasteryCondition {
    condition = Array(5).fill(0).map(_ => new CharacterMasteryConditionTypeidLinkValue());
    qntd = Array(5).fill(0).map(_ => new Int32Type(false, true, true));

    constructor(_data = undefined) {
        if (_data)
            this.unserialize(_data.getBuffer(this.getSize()));
    }

    getSize() {
        return this.condition.reduce((acc, v) => acc + v.getSize(), 0)
            + this.qntd.reduce((acc, v) => acc + v.getSize(), 0);
    }

    unserialize(_data) {
        this.condition.forEach(v => v.unserialize(_data.getBuffer(v.getSize())));
        this.qntd.forEach(v => v.unserialize(_data.getBuffer(v.getSize())));
    }
    serialize(_data) {
        this.condition.forEach(v => v.serialize(_data));
        this.qntd.forEach(v => v.serialize(_data));
    }
    layout(_parent) {
        _parent.appendChild(arrayLayout(this.condition, "condition"));
        _parent.appendChild(arrayLayout(this.qntd, "qntd"));
    }
}

// seq do CharacterMastery — ordem da mastery (dados reais: {1..10: 14 cada})
class CharacterMasterySeq {
    static SEQ_1 = 1;
    static SEQ_2 = 2;
    static SEQ_3 = 3;
    static SEQ_4 = 4;
    static SEQ_5 = 5;
    static SEQ_6 = 6;
    static SEQ_7 = 7;
    static SEQ_8 = 8;
    static SEQ_9 = 9;
    static SEQ_10 = 10;

    static getName(_value) {
        return Object.entries(CharacterMasterySeq).find(([, v]) => v === _value)?.[0];
    }

    static getValue(_name) {
        return CharacterMasterySeq[_name];
    }
}

const CharacterMasterySeqValue32 = createEnumValueType(Int32Type, CharacterMasterySeq);

// condition.condition: typeid de item do Item.iff (passivo && commun) ou do
// QuestStuff.iff (sem filtro) — picker hex com botão "…" (árvore 2 iffs)
class CharacterMasteryConditionTypeidLinkValue extends TypeidLinkValue {

    _linkIff = ['Item.iff', 'QuestStuff.iff'];
    _linkTitle = "Escolher condição (typeid)";

    _linkFilterPredicate(_item) {

        if (_item instanceof QuestStuff)
            return true;

        return Item.createTypeidbit(_item.typeid.value).item_passive === 1
            && _item.tipo_item.value === ItemTipo.COMMUN;
    }
}

class CharacterMastery extends BaseTypeidUnique {
    active = new Int32Type(true, true, true);
    typeid = new Int32Type(false, true, true);
    seq = new CharacterMasterySeqValue32();
    stats = new StatsValue32(false, true, true);
    level = new LevelValue32();
    condition = new CharacterMasteryCondition();

    isTypeidUnique() {
        return false;
    }

    constructor(_data = undefined) {
        super();
        if (_data)
            this.unserialize(_data.getBuffer(this.getSize()));
    }

    getSize() {
        return this.active.getSize() + this.typeid.getSize() + this.seq.getSize()
            + this.stats.getSize() + this.level.getSize() + this.condition.getSize();
    }

    unserialize(_data) {
        this.active.unserialize(_data.getBuffer(this.active.getSize()));
        this.typeid.unserialize(_data.getBuffer(this.typeid.getSize()));
        this.seq.unserialize(_data.getBuffer(this.seq.getSize()));
        this.stats.unserialize(_data.getBuffer(this.stats.getSize()));
        this.level.unserialize(_data.getBuffer(this.level.getSize()));
        this.condition.unserialize(_data.getBuffer(this.condition.getSize()));
    }
    serialize(_data) {
        this.active.serialize(_data);
        this.typeid.serialize(_data);
        this.seq.serialize(_data);
        this.stats.serialize(_data);
        this.level.serialize(_data);
        this.condition.serialize(_data);
    }
    getIdentifyName() {
        return this.typeid.value.toString(16)
            + ' - ' + (CharacterMasterySeq.getName(this.seq.value) ?? this.seq.value);
    }
    layout(_parent) {
        this.active.layout(_parent, "active");
        this.typeid.layout(_parent, "typeid");
        this.seq.layout(_parent, "seq");
        this.stats.layout(_parent, "stats");
        this.level.layout(_parent, "level");
        classLayout(_parent, "condition", this.condition);
    }
}

// level do CaddieVoiceTable — o antigo campo `type` (dados reais: vozes 1..4)
class CaddieVoiceLevel {
    static CADDIE_LEVEL_0 = 0;
    static CADDIE_LEVEL_1 = 1;
    static CADDIE_LEVEL_2 = 2;
    static CADDIE_LEVEL_3 = 3;
    static CADDIE_LEVEL_4 = 4;

    static getName(_value) {
        return Object.entries(CaddieVoiceLevel).find(([, v]) => v === _value)?.[0];
    }

    static getValue(_name) {
        return CaddieVoiceLevel[_name];
    }
}

// mantém o unsigned do Int8Type com false, true no construtor
const CaddieVoiceLevelValue8 = createEnumValueType(Int8Type, CaddieVoiceLevel);

class CaddieVoiceTable extends BaseTypeidUnique {
    typeid = new Int32Type(false, true, true);
    name = new StringType(64, StringTypeRelation.TEXT);
    level = new CaddieVoiceLevelValue8(false, true);
    shot_name = new StringType(64, StringTypeRelation.ASSET.AUDIO);
    unknown = new Int8Type(false, true);

    static createTypeidbit(_typeid = 0) {
        return new BitfieldType(new Int32Type(false, true, true), {
            num: 16,
            type: 16
        }, _typeid);
    }

    static generateTypeid(_cad_type = 0) {

        const typeidbit = CaddieVoiceTable.createTypeidbit();

        typeidbit.type = _cad_type;
        typeidbit.num = 1;

        return typeidbit;
    }

    filter(_element) {
        const typeidbit = CaddieVoiceTable.createTypeidbit(this.typeid.value);
        const typeidbit2 = CaddieVoiceTable.createTypeidbit(_element.typeid.value);

        return typeidbit.type == typeidbit2.type;
    }

    // os dados reais têm typeid duplicado: num sempre 1 no low byte,
    // os elementos são distintos pelo name (shottime1..itemdrop5)
    isTypeidUnique() {
        return false;
    }

    constructor(_data = undefined) {
        super();
        if (_data)
            this.unserialize(_data.getBuffer(this.getSize()));
    }

    getSize() {
        return this.typeid.getSize() + this.name.getSize() + this.level.getSize()
            + this.shot_name.getSize() + this.unknown.getSize();
    }

    unserialize(_data) {
        this.typeid.unserialize(_data.getBuffer(this.typeid.getSize()));
        this.name.unserialize(_data.getBuffer(this.name.getSize()));
        this.level.unserialize(_data.getBuffer(this.level.getSize()));
        this.shot_name.unserialize(_data.getBuffer(this.shot_name.getSize()));
        this.unknown.unserialize(_data.getBuffer(this.unknown.getSize()));
    }
    serialize(_data) {
        this.typeid.serialize(_data);
        this.name.serialize(_data);
        this.level.serialize(_data);
        this.shot_name.serialize(_data);
        this.unknown.serialize(_data);
    }
    getIdentifyName() {
        return `${this.typeid.value.toString(16)} ${this.name.value}`;
    }
    layout(_parent) {
        this.typeid.layout(_parent, "typeid");
        this.name.layout(_parent, "name");
        this.level.layout(_parent, "level");
        this.shot_name.layout(_parent, "shot_name");
        this.unknown.layout(_parent, "unknown");
    }
}

// Modelo de criação de novo item: define o que o modal de "novo item" exibe
// typeid_bits: <nome do bit do typeid> = classe Enum (dropdown com os valores)
// fields: <caminho do campo> = classe Enum (um dropdown por índice se o caminho for array)
// relations: <caminho do campo> = referência para outro IFF
//   - string: nome do IFF relacionado fixo, usa o typeid completo
//   - null: resolve pelo typeid, agrupado pelos IFFs carregados
//   - { iff, by: 'num' }: lista os itens do IFF pelo id (typeid.num)
//   - { iff, by: 'num', bit: <nome> }: o id é gravado direto no bit do typeid
//   - { iff, by: 'num', encode: fn }: o id é gravado em vários bits via encode (retorna { bit: valor })
const CaddieItemTypeOverride = {
    '-': -1,
    SPECIAL: CaddieItemType.ESPECIAL,
    UPGRADE: CaddieItemType.UPGRADE,
};

// Cores de cabelo do HairStyle.iff — cada character tem a SUA paleta: o
// mesmo valor do campo `cor` é uma cor DIFERENTE por character (verificado
// com dados reais pelos nomes dos itens: `<cor>／<character>`, ex.
// ローズ／エリカ = ROSE/char 1, ブロンド／セシリアR = BLOND/char 14).
// O enum abaixo é só o catálogo de nomes (usado sem character escolhido);
// com character, as opções do select vêm de HairStyleCorPall (valores =
// índice da paleta daquele character).
const HairStyleCor = {
    BLACK: 0,
    WHITE: 1,
    BROWN: 2,
    RED: 3,
    YELLOW: 4,
    GREEN: 5,
    BLUE: 6,
    PINK: 7,
    VIOLET: 8,
    ORANGE: 9,
    EMERALD: 10,
    BLOND: 11,
    GRAY: 12,
    APRICOT: 13,
    IVORY: 14,
    LIGHT_BLUE: 15,
    LIGHT_BROWN: 16,
    LIGHT_GREEN: 17,
    LIGHT_VIOLET: 18,
    PURPLE: 19,
    BLUISH_GREEN: 20,
};

// paleta por character (índice do campo `cor` → cor), nomes reais dos itens
// do HairStyle.iff (pack tests/pangya_jp.iff); só times com itens reais
// (12 e 14 são os "R" — visuais novos)
const HairStyleCorPall = {
    0: { BROWN: 0, BLACK: 1, DARK_BLUE: 2, YELLOW: 3, RED: 4, GREEN: 5 },
    1: { ROSE: 0, YELLOW: 1, VIOLET: 2, BLACK: 3, SHELL_PINK: 4, ORANGE: 5 },
    2: { BROWN: 0, BLACK: 1, YELLOW: 2, RED: 3, GRAY: 4, BLOND: 5 },
    3: { YELLOW: 0, BLACK: 1, WHITE: 2, WINE_RED: 3, EMERALD: 4, BLOND: 5 },
    4: { WHITE: 0, BLACK: 1, SKY_BLUE: 2, ORANGE: 3, DARK_BLUE: 4, BLOND: 5 },
    5: { BLACK: 0, WINE_RED: 1, WHITE: 2, RED: 3, SKY_BLUE: 4, YELLOW: 5, EMERALD: 6 },
    6: { DARK_BLUE: 0, VIOLET: 1, BLOND: 2, RED: 3, EMERALD: 4, LIGHT_BROWN: 5, BLACK: 6, WHITE: 7 },
    7: { RED: 0, BLACK: 1, LAVENDER: 2, DARK_BLUE: 3, BROWN: 4, GRAY: 5, DEEP_GREEN: 6, ORANGE: 7, WHITE: 8, YELLOW: 9 },
    8: { PINK: 0, YELLOW: 1, BLOND: 2, WHITE: 3, BLACK: 4, EMERALD: 5, RED: 6, BROWN: 7 },
    9: { IVORY: 0, YELLOW: 1, BROWN: 2, EMERALD: 3, SKY_BLUE: 4, LIGHT_GREEN: 5, PINK: 6, VIOLET: 7 },
    10: { YELLOW: 0, BLACK: 1, WHITE: 2, BROWN: 3, RED: 4, PINK: 5, EMERALD: 6, VIOLET: 7, ORANGE: 8, GREEN: 9 },
    11: { BROWN: 0, BLACK: 1, SKY_BLUE: 2, BLOND: 3, ORANGE: 4, GREEN: 5, RED: 6, WHITE: 7, VIOLET: 8, IVORY: 9 },
    12: { RED: 0, BLACK: 1, WHITE: 2, BLOND: 3, VIOLET: 4, IVORY: 5, ORANGE: 6, GREEN: 7, PURPLE: 8, BROWN: 9 },
    14: { BLOND: 0, BLACK: 1, IVORY: 2, RED: 3, EMERALD: 4, VIOLET: 5, BROWN: 6, PINK: 7, BLUE: 8, ORANGE: 9 },
};

const kNewItemModel = {

    'Part.iff': {
        typeid_bits: {
            char_part_num: PartSlotNum,
            char_sub_type_num: { multi: PartSubType },
        },
        relations: {
            character: {
                label: 'Character',
                iff: 'Character.iff',
                by: 'num',
                bit: 'char_identity',
            },
        },
        // trocar o slot/tags regenera o num livre (o num char_type_num pode
        // existir em combinações diferentes de part/sub_type/character)
        regenNumOnBits: true,
        // depois de gerar o typeid, seta o slot do char_part_num no position_mask
        onCreate: (_item, _typeidbit) => {
            _item.position_mask.setSlot(_typeidbit.char_part_num, 1);
        },
    },
    'Item.iff': {
        typeid_bits: {
            item_type: ItemType,
        },
        typeid_checkboxes: ['item_passive'],
        // quando o item_passive está desmarcado (0) o select do item_type fica
        // DESABILITADO (não-passivo só aceita NO_LIMIT_TIME, valor forçado);
        // marcando (1) o select volta a ficar habilitado com todas as opções
        lockBits: [{
            bit: 'item_type',
            by: 'item_passive',
            value: 1,
        }],
        // regra dos bits (sincroniza item_type ↔ item_passive):
        //  - mexeu em item_passive → não passivo (0) força item_type = NO_LIMIT_TIME
        //  - mexeu em item_type    → item_type != NO_LIMIT_TIME marca passivo (1)
        // Assim cada alteração respeita a intenção do usuário sem a outra regra
        // reverter. No OK (sem source) ambas rodam em sequência para consistência
        onBits: (_bits, _setBit, _src) => {
            if (_src !== 'item_type'
                && _bits.item_passive === 0
                && _bits.item_type !== ItemType.NO_LIMIT_TIME)
                _setBit('item_type', ItemType.NO_LIMIT_TIME);
            if (_src !== 'item_passive'
                && _bits.item_type !== ItemType.NO_LIMIT_TIME
                && _bits.item_passive !== 1)
                _setBit('item_passive', 1);
        },
        // defaults dos campos conforme o typeid: LIMIT_TIME → time_shop ativo
        // com period = ONE_DAY; caso contrário → time_shop inativo e period
        // = NO_PERIOD. não passivo → tipo_item COMMUN
        onCreate: (_item, _typeidbit) => {
            if (_typeidbit.item_type === ItemType.LIMIT_TIME) {
                _item.shop.time_shop.active.value = 1;
                _item.shop.time_shop.period.value = TimeShopPeriod.ONE_DAY;
            } else {
                _item.shop.time_shop.active.value = 0;
                _item.shop.time_shop.period.value = TimeShopPeriod.NO_PERIOD;
            }
            if (_typeidbit.item_passive === 0)
                _item.tipo_item.value = ItemTipo.COMMUN;
        },
    },
    'Skin.iff': {
        typeid_bits: {
            type: SkinType,
        },
        // trocar o select type regenera o num livre (o mesmo num pode
        // existir em types diferentes)
        regenNumOnBits: true,
    },
    'Furniture.iff': {
        typeid_bits: {
            type: FurnitureType,
        },
        // trocar o select type regenera o num livre (o mesmo num pode
        // existir em types diferentes)
        regenNumOnBits: true,
    },
    'Match.iff': {
        // match_type/match_event: valores conhecidos (com __allowExtra — valor
        // fora da lista vira input cru); match_special: enum completo
        typeid_bits: {
            match_type: MatchMatchType,
            match_event: MatchMatchEvent,
            match_special: MatchSpecialType,
        },
        // trocar qualquer select regenera o num livre (o match_num pode
        // existir em combinações diferentes de type/event/special)
        regenNumOnBits: true,
    },
    'SetItem.iff': {
        typeid_bits: {
            set_item_sub_type: SetItemSubType,
            set_item_sub_type_char: SetItemSubTypeChar,
        },
        // trocar os selects de sub_type regenera o num livre (o set_item_num
        // pode existir em combinações diferentes de sub_type/sub_type_char)
        regenNumOnBits: true,
        relations: {
            'package.item_typeid': null,
        },
    },
    'CaddieItem.iff': {
        typeid_bits: {
            cad_item_type_num: CaddieItemTypeOverride,
        },
        // trocar o tipo (override) regenera o num livre (o cad_item_num pode
        // existir em tipos diferentes)
        regenNumOnBits: true,
        relations: {
            'cad_item_cad_type_num + cad_item_cad_base_num': {
                label: 'Caddie',
                iff: 'Caddie.iff',
                by: 'num',
                encode: (_id, _caddieEl, _bits) => {
                    // o id do caddie vai sempre nos bits base/type; o COOKIE/PANG
                    // (derivado do is_cash do caddie) só vale com '-' — selecionar
                    // SPECIAL/UPGRADE substitui o tipo derivado (o id fica)
                    const res = {
                        cad_item_cad_type_num: _id > 0x1F ? _id - 0x1F : 0,
                        cad_item_cad_base_num: Math.min(_id, 0x1F)
                    };

                    if (_bits) {
                        const val = Number(_bits.cad_item_type_num);

                        if (val === CaddieItemType.ESPECIAL || val === CaddieItemType.UPGRADE)
                            _bits.cad_item_type_num = val;
                        else {
                            const isCash = !!(_caddieEl && _caddieEl.shop && _caddieEl.shop.flag_shop && _caddieEl.shop.flag_shop.type && _caddieEl.shop.flag_shop.type.is_cash === 1);
                            _bits.cad_item_type_num = isCash ? CaddieItemType.COOKIE : CaddieItemType.PANG;
                        }
                    }

                    return res;
                },
                decode: _item => {
                    const bf = CaddieItem.createTypeidbit(_item.typeid.value);
                    return (bf.cad_item_cad_base_num || 0) + (bf.cad_item_cad_type_num || 0);
                },
            },
        },
    },
    'Card.iff': {
        // o bit `type` do typeid (4 bits) é o enum CardType (dados reais:
        // {0:61,1:46,2:72,3:22,4:3,5:23} — T_CHARACTER..T_NPC do data_iff.h)
        typeid_bits: {
            type: CardType,
        },
        // trocar o select do type regenera o num livre (o MESMO num existe em
        // types diferentes — character 0..59, caddie 0..27, special 0..61)
        regenNumOnBits: true,
    },
    'HairStyle.iff': {
        typeid_checkboxes: ['is_new'],
        // marcar/desmarcar o is_new muda o typeid candidato → regenera o num
        // livre (o mesmo num pode existir com is_new=0 e is_new=1); no edit
        // só refresh (não sobrescreve o num atual). O character/cor do item
        // NÃO participam do typeid — são editados no layout do item.
        regenNumOnBits: true,
    },
    'Ability.iff': {
        // SEM o modal de num: o typeid É o typeid de um item dos MESMOS 13
        // iffs do reward_item do QuestStuff (dados reais: 917 typeids únicos,
        // todos nos 13 iffs) escolhido pela relation typeid (optgroup por iff)
        noNum: true,
        relations: {
            typeid: {
                iff: [
                    'Character.iff', 'Part.iff', 'ClubSet.iff', 'Ball.iff', 'Item.iff',
                    'Caddie.iff', 'Skin.iff', 'HairStyle.iff', 'Mascot.iff', 'AuxPart.iff',
                    'Card.iff', 'Furniture.iff', 'SetItem.iff',
                ],
            },
        },
    },
    'AddonPart.iff': {
        // SEM o modal de num: o typeid É o typeid de um item do Character.iff
        // ou do Part.iff escolhido pela relation typeid (optgroup por iff) — o
        // AddonPart "pendura" num character/part específico; não tem num próprio
        noNum: true,
        relations: {
            typeid: {
                iff: [
                    'Character.iff', 'Part.iff',
                ],
            },
        },
    },
    'SetEffectTable.iff': {
        // só o input num (label "id") — o typeid É o campo id; o picker do
        // item.typeid (13 iffs) e os selects do effect ficam no layout
        numLabel: 'id',
    },
    'Achievement.iff': {
        // o `class` do typeid usa o MESMO enum do achievement_tipo (layout)
        typeid_bits: {
            class: AchievementTipo,
        },
        // trocar o select do class regenera o num livre (o mesmo num pode
        // existir em classes diferentes)
        regenNumOnBits: true,
        // o class do typeid é a fonte da verdade: o achievement_tipo do item
        // reflete o bit class (roda no criar e na edição do typeid via
        // addTypeidPick — o layout do Achievement deixa o select disabled)
        onCreate: (_item, _typeidbit) => {
            _item.achievement_tipo.value = _typeidbit.class;
        },
        relations: {
            typeid_quest_index: null,
            quest_typeid: null,
        },
    },
    'CounterItem.iff': {
        // o tipo do contador é o bit is_achievement_point do typeid (mesmo
        // enum dos contadores: ACHIEVEMENT_POINT=0/GERAL_POINT=1)
        typeid_bits: {
            is_achievement_point: CounterItemPointType,
        },
        // trocar o select regenera o num livre (o mesmo num pode existir nos
        // dois tipos de contador)
        regenNumOnBits: true,
    },
    'AuxPart.iff': {
        // is_infinity e is_left_hand são booleanos (bits de 5 do typeid) —
        // viram 2 checkboxes no modal
        typeid_checkboxes: ['is_infinity', 'is_left_hand'],
        // marcar/desmarcar muda o typeid candidato → regenera o num livre
        regenNumOnBits: true,
    },
    'QuestStuff.iff': {
        // o `type` do typeid (4 bits) é o enum QuestStuffType — o mesmo tipo
        // que o QuestStuff.filter usa (elementos do mesmo tipo/identidade)
        typeid_bits: {
            type: QuestStuffType,
        },
        // trocar o select do type regenera o num livre
        regenNumOnBits: true,
    },
    'QuestItem.iff': {
        // o bit `type` do typeid (4 bits) é o enum QuestItemType (NORMAL..
        // HARD) — o mesmo enum do campo `type` (layout); são dados distintos
        typeid_bits: {
            type: QuestItemType,
        },
        // trocar o select do type regenera o num livre
        regenNumOnBits: true,
    },
    'CadieMagicBox.iff': {
        fields: {
            setor: CadieMagicBoxSetorType,
        },
        // o seq do CadieMagicBox é renumerado pelo rebuildCadieMagicBox
        // (1..N na ordem setor, seq) — o num de um box novo é a posição no fim
        // do grupo do setor escolhido (count de válidos com setor <= escolhido
        // + 1); a unicidade é garantida pelo rebuild, então o modal não precisa
        // do check de "já existe"
        genNum: (_iff, _field, _isOther) => {
            let setor = Number(_field('setor'));
            if (!Number.isFinite(setor) || setor < 0)
                setor = 0;
            let count = 0;
            for (const el of _iff.elements)
                if (!el.__deleted && !el.__deleted2 && _isOther(el)
                    && el.setor && el.setor.value <= setor)
                    count++;
            return count + 1;
        },
        relations: {
            'item_receive.typeid': null,
            'item_trade.typeid': null,
            box_random_id: 'CadieMagicBoxRandom.iff',
        },
    },
    'CadieMagicBoxRandom.iff': {
        // o id É o typeid do CadieMagicBox (seq) — modal num-only (o id inteiro
        // é o num); o id não é renumerado, então o num livre é o próximo id
        // não usado a partir do 1 — o 0 NUNCA pode ser adicionado/editado
        // (0 no box_random_id do CadieMagicBox significa "sem box_random_id")
        minNum: 1,
        genNum: (_iff, _field, _isOther) => {
            const used = new Set();
            for (const el of _iff.elements)
                if (!el.__deleted && !el.__deleted2 && _isOther(el) && el.id)
                    used.add(el.id.value);
            let n = 1;
            while (used.has(n)) n++;
            return n;
        },
    },
    'FurnitureAbility.iff': {
        relations: {
            // o typeid É o typeid de um item do Furniture.iff (complemento sem
            // num próprio): o modal de novo item mostra um select de relation
            // com os typeids do Furniture.iff — o escolhido vira o typeid do
            // item; só os furniture com is_function 6 ou 8 (dados reais: os
            // 2 itens 0x48006823/0x48006829)
            typeid: {
                iff: 'Furniture.iff',
                filter: _el => {
                    const v = _el.is_function ? _el.is_function.value : -1;
                    return v === 6 || v === 8;
                },
            },
            set_in_typeid: null,
            'item.typeid': null,
        },
    },
    'TimeLimitItem.iff': {
        // SEM o modal de num: o typeid É o typeid de um item PASSIVO do
        // Item.iff (o "is_passivo" — dados reais: 6/6 typeids no Item.iff,
        // todos item_passive=1) escolhido pela relation typeid
        noNum: true,
        relations: {
            typeid: {
                iff: 'Item.iff',
                filter: _el => Item.createTypeidbit(_el.typeid.value).item_passive === 1,
            },
        },
    },
    'HoleCupDropItem.iff': {
        // SEM o modal de num: o typeid É o typeid de um item PASSIVO do
        // Item.iff (dados reais: 87/87 typeids no Item.iff — 85 COMMUN +
        // 2 BOX — sem duplicata) escolhido pela relation typeid; a lista é
        // passive && (commun || box || artfact || memorial_coin) = 577
        // opções nos dados reais (603 passivos - 18 ARTFACT_MANA - 8
        // GRAND_PRIX_RULE)
        noNum: true,
        relations: {
            typeid: {
                iff: 'Item.iff',
                filter: _el => Item.createTypeidbit(_el.typeid.value).item_passive === 1
                    && (_el.tipo_item.value === ItemTipo.COMMUN
                        || _el.tipo_item.value === ItemTipo.BOX
                        || _el.tipo_item.value === ItemTipo.ARTFACT
                        || _el.tipo_item.value === ItemTipo.MEMORIAL_COIN),
            },
        },
    },
    'SpecialPrizeItem.iff': {
        // SEM o modal de num: o typeid É o typeid de um item dos MESMOS 13
        // iffs do reward_item do QuestStuff (dados reais: 42 typeids únicos,
        // todos nos 13 iffs) escolhido pela relation typeid (optgroup por iff)
        noNum: true,
        relations: {
            typeid: {
                iff: [
                    'Character.iff', 'Part.iff', 'ClubSet.iff', 'Ball.iff', 'Item.iff',
                    'Caddie.iff', 'Skin.iff', 'HairStyle.iff', 'Mascot.iff', 'AuxPart.iff',
                    'Card.iff', 'Furniture.iff', 'SetItem.iff',
                ],
            },
        },
    },
    'ShopLimitItem.iff': {
        // SEM o modal de num: o typeid É o typeid de um item dos MESMOS 13
        // iffs do reward_item do QuestStuff (mesmo padrão do SpecialPrizeItem)
        // escolhido pela relation typeid (optgroup por iff)
        noNum: true,
        relations: {
            typeid: {
                iff: [
                    'Character.iff', 'Part.iff', 'ClubSet.iff', 'Ball.iff', 'Item.iff',
                    'Caddie.iff', 'Skin.iff', 'HairStyle.iff', 'Mascot.iff', 'AuxPart.iff',
                    'Card.iff', 'Furniture.iff', 'SetItem.iff',
                ],
            },
        },
    },
    'PointShop.iff': {
        // SEM o modal de num: o typeid É o typeid de um item do Item.iff
        // escolhido pela relation typeid (SÓ o Item.iff)
        noNum: true,
        relations: {
            typeid: 'Item.iff',
        },
    },
    'NonVisibleItemTable.iff': {
        // SEM o modal de num: o typeid É o typeid de um item dos MESMOS 13
        // iffs do reward_item do QuestStuff + o Match.iff (14 no total)
        // escolhido pela relation typeid (optgroup por iff)
        noNum: true,
        relations: {
            typeid: {
                iff: [
                    'Character.iff', 'Part.iff', 'ClubSet.iff', 'Ball.iff', 'Item.iff',
                    'Caddie.iff', 'Skin.iff', 'HairStyle.iff', 'Mascot.iff', 'AuxPart.iff',
                    'Card.iff', 'Furniture.iff', 'SetItem.iff', 'Match.iff',
                ],
            },
        },
    },
    'SubscriptionItemTable.iff': {
        // SEM o modal de num: o typeid É o typeid de um item dos MESMOS 13
        // iffs do reward_item do QuestStuff + o Match.iff (14 no total)
        // escolhido pela relation typeid (optgroup por iff)
        noNum: true,
        relations: {
            typeid: {
                iff: [
                    'Character.iff', 'Part.iff', 'ClubSet.iff', 'Ball.iff', 'Item.iff',
                    'Caddie.iff', 'Skin.iff', 'HairStyle.iff', 'Mascot.iff', 'AuxPart.iff',
                    'Card.iff', 'Furniture.iff', 'SetItem.iff', 'Match.iff',
                ],
            },
        },
    },
    'LevelUpPrizeItem.iff': {
        noNum: true,
        fieldsInEdit: true,
        typeidFromField: 'level',
        fields: {
            level: enLEVEL,
        },
        relations: {
            'reward.typeid': null,
        },
    },
    'ClubSetWorkShopLevelUpProb.iff': {
        // SEM o modal de num: o typeid É o campo tipo (getter typeid = tipo),
        // um enum WorkShopTipo; o modal mostra SÓ o select do tipo (BALANCE..
        // SPECIAL — sem o UNUPABLE=-1) e o valor escolhido vira o typeid. O
        // layout do item também renderiza o tipo como select do enum, e o `c`
        // ganha os labels do enum statistics (POWER..CURVE)
        noNum: true,
        fieldsInEdit: true,
        typeidFromField: 'tipo',
        fields: {
            tipo: { BALANCE: 0, POWER: 1, CONTROL: 2, SPIN: 3, SPECIAL: 4 },
        },
    },
    'ClubSetWorkShopLevelUpLimit.iff': {
        // SEM o modal de num: o typeid É o campo tipo (getter typeid = tipo),
        // o MESMO enum WorkShopTipoSolo do ClubSetWorkShopLevelUpProb.iff (BALANCE..
        // SPECIAL, sem UNUPABLE); o modal mostra SÓ o select do tipo e o valor
        // escolhido vira o typeid. O layout do item renderiza tipo (select),
        // rank (select do enum RankClubSet RANK_F..RANK_A), point e o `c` com
        // labels do enum statistics (POWER..CURVE). getIdentifyName = "tipo - nome |
        // rank - nome". A lista reordena por (tipo, rank).
        noNum: true,
        fieldsInEdit: true,
        typeidFromField: 'tipo',
        fields: {
            tipo: { BALANCE: 0, POWER: 1, CONTROL: 2, SPIN: 3, SPECIAL: 4 },
        },
    },
    'ClubSetWorkShopRankUpExp.iff': {
        // SEM o modal de num: o typeid É o campo tipo (getter typeid = tipo),
        // o enum RankSTipo (POWER..SPECIAL); o modal mostra SÓ o select do tipo
        // e o valor escolhido vira o typeid. O layout do item renderiza tipo
        // (select do enum RankSTipo) e o `rank` (Array(6) de exp) com os labels
        // do enum RankClubSet (RANK_F..RANK_A) por índice. getIdentifyName =
        // "tipo - nome". A lista reordena por tipo ao mudar o valor.
        noNum: true,
        fieldsInEdit: true,
        typeidFromField: 'tipo',
        fields: {
            tipo: RankSTipo,
        },
    },
    'ErrorCodeInfo.iff': {
        // modal de num (o typeid É o code — BaseTypeidUnique) — label do
        // num descritivo ("code"); editar/criar reordena pela sequência do code
        numLabel: 'code',
    },
    'GrandPrixRankReward.iff': {
        // IGUAL ao GrandPrixSpecialHole/ConditionEquip: SEM input de num e com
        // SÓ o select do typeid = typeid_link do GrandPrixData escolhido. O
        // rank (enum) e os pickers de trophy_typeid/reward.typeid são do
        // LAYOUT — não participam da modal
        noNum: true,
        relations: {
            typeid: {
                iff: 'GrandPrixData.iff',
                resolve: _el => _el.typeid_link
                    ? (_el.typeid_link.value >>> 0)
                    : ((_el.typeid.value & ~0xFF) >>> 0),
            },
            'reward.typeid': null,
            trophy_typeid: null,
        },
    },
    'GrandPrixAIOptionalData.sff': {
        relations: {
            parts_typeid: null,
        },
    },
    'ArtifactManaInfo.iff': {
        noNum: true,
        relations: {
            typeid: {
                iff: 'Item.iff',
                filter: _el => {
                    const t = _el.tipo_item ? _el.tipo_item.value : -1;
                    return t === ItemTipo.ARTFACT || t === ItemTipo.GRAND_PRIX_RULE;
                },
            },
            mana_typeid: null,
        },
    },
    'TwinsItemTable.iff': {
        fields: {
            type: ItemTableType,
        },
        relations: {
            typeid: null,
        },
    },
    'MemorialShopRareItem.iff': {
        // SEM o modal de num: o typeid É o typeid de um item dos MESMOS 13
        // iffs do reward_item do QuestStuff (dados reais: 745 itens, TODOS
        // os typeids nos 13 iffs) escolhido pela relation typeid (optgroup
        // por iff) — SÓ a relation, sem fields
        noNum: true,
        relations: {
            typeid: {
                iff: [
                    'Character.iff', 'Part.iff', 'ClubSet.iff', 'Ball.iff', 'Item.iff',
                    'Caddie.iff', 'Skin.iff', 'HairStyle.iff', 'Mascot.iff', 'AuxPart.iff',
                    'Card.iff', 'Furniture.iff', 'SetItem.iff',
                ],
            },
        },
    },
    'CharacterMastery.iff': {
        // SEM o modal de num: o typeid É o typeid de um character do
        // Character.iff (isTypeidUnique false — um character tem vários
        // masteries; dados reais: 140/140 typeids no Character.iff)
        noNum: true,
        relations: {
            typeid: 'Character.iff',
        },
    },
    'MemorialShopCoinItem.sff': {
        // SEM o modal de num: o typeid É o typeid de um item do Item.iff
        // passive && MEMORIAL_COIN (dados reais: 6/6 typeids no Item.iff
        // com item_passive=1 e tipo_item=MEMORIAL_COIN(16))
        noNum: true,
        relations: {
            typeid: {
                iff: 'Item.iff',
                filter: _el => Item.createTypeidbit(_el.typeid.value).item_passive === 1
                    && _el.tipo_item.value === ItemTipo.MEMORIAL_COIN,
            },
        },
    },
    'GrandPrixData.iff': {
        typeid_bits: {
            gp_class: GrandPrixDataAbaClass,
            gp_type: GrandPrixDataGpType,
        },
        // gp_event é o bit do typeid: vale 3 (não 1) quando o GP é evento — igual
        // aos dados reais (probe: 57 itens com gp_event=3, nunca 1). O checkbox
        // grava 3 ao marcar para não corromper o typeid ao reeditar um evento.
        typeid_checkboxes: [['gp_event', 3]],
        // trocar gp_class/gp_type/gp_event regenera o num livre no modo criar
        // (bits diferentes = typeids diferentes; sem isso o num sugerido
        // colide com item existente da nova combinação)
        regenNumOnBits: true,
        onCreate: (_item, _typeidbit) => {

            // typeid_link = typeid sem o gp_num (sempre derivado, campo
            // desabilitado). Usa o _typeidbit e não o item: no caminho de
            // EDIÇÃO (addTypeidPick) o onCreate roda ANTES do novo typeid ser
            // aplicado ao item — o typeid do item ainda é o antigo lá
            _item.typeid_link.value = (_typeidbit.value & ~0xFF) >>> 0;

            // o campo type (enum GrandPrixDataType) espelha o bit gp_event do
            // typeid: com evento = EVENT_NORMAL (1); sem = NORMAL (0)
            _item.type.value = (_typeidbit.gp_event !== 0)
                ? GrandPrixDataType.EVENT_NORMAL
                : GrandPrixDataType.NORMAL;
        },
    },
    'GrandPrixSpecialHole.iff': {
        // SEM input de num: o typeid É o typeid_link do GrandPrixData
        // escolhido no select (dados reais: TODOS os 84 typeids têm low byte
        // 0 — são links `& ~0xFF`, não typeids cheios). Usa o campo
        // typeid_link do GP; no EDIT o resolve também roda sobre o PRÓPRIO
        // item em edição (que não tem typeid_link) — fallback calculando do
        // typeid
        noNum: true,
        relations: {
            typeid: {
                iff: 'GrandPrixData.iff',
                resolve: _el => _el.typeid_link
                    ? (_el.typeid_link.value >>> 0)
                    : ((_el.typeid.value & ~0xFF) >>> 0),
            },
        },
    },
    'GrandPrixConditionEquip.iff': {
        // IGUAL ao GrandPrixSpecialHole: SEM input de num e com SÓ o select do
        // typeid = typeid_link do GrandPrixData escolhido. O item_typeid NÃO
        // participa da modal — é editado pelo PICKER do layout
        // (GrandPrixConditionEquipItemTypeidLinkValue)
        noNum: true,
        relations: {
            typeid: {
                iff: 'GrandPrixData.iff',
                resolve: _el => _el.typeid_link
                    ? (_el.typeid_link.value >>> 0)
                    : ((_el.typeid.value & ~0xFF) >>> 0),
            },
        },
    },
    'CutinInfomation.iff': {
        // SEM o modal de num: o typeid É a skin CUTIN escolhida pelo select
        // da relation — o modal tem SÓ o select das skins CUTIN
        noNum: true,
        relations: {
            // o typeid É uma skin do tipo CUTIN — o modal de novo item mostra
            // SÓ o select das skins CUTIN (dados reais: 641/641 typeids são
            // skins CUTIN do Skin.iff); SEM o character_id (o id do character
            // não participa do modal)
            typeid: {
                iff: 'Skin.iff',
                filter: _el => Skin.createTypeidbit(_el.typeid.value).type === SkinType.CUTIN,
            },
            rare_typeid: null,
            character_id: null,
        },
    },
    'Desc.iff': {
        // SEM input de num: o typeid É o typeid de um item de outro iff —
        // o modal tem SÓ o select com os iffs CARREGADOS cuja flag_ligacao
        // (header do .iff) é 0, EXCETO o próprio Desc.iff (mesmo critério do
        // vínculo de descrições do ensureItemDescription). A lista é dinâmica:
        // avaliada na abertura do modal (spec.iff pode ser função)
        noNum: true,
        relations: {
            typeid: {
                iff: () => iffs
                    .filter(i => i.flag_ligacao === 0 && i.name !== 'Desc.iff')
                    .map(i => i.name),
            },
        },
    },
    'Enchant.iff': {
        typeid_bits: {
            stats_type: statistics,
        },
        // o num (up_value) depende da stat escolhida (o mesmo up_value pode
        // existir em várias stats) — trocar o select regenera o num livre
        regenNumOnBits: true,
    },
    'CaddieVoiceTable.iff': {
        // o "num" do CaddieVoiceTable É o type (os dados de voz têm num sempre
        // = 1; o id guardado no cad_voice_tbl_id do Caddie.iff é esse type) —
        // sem relação com o Caddie na geração/edição do typeid. O type não é
        // único, então o modal de num (rotulado "type") sugere max+1 para
        // criar um novo rápido e o bit num do typeid fica fixo em 1
        numGroup: 'type',
        numLabel: 'type',
        fixedBits: { num: 1 },
        genNum: (_iff, _field, _isOther = () => true) => {
            let max = 0;
            for (const el of _iff.elements)
                if (el.typeid && el.typeid.value != null && _isOther(el)) {
                    const t = CaddieVoiceTable.createTypeidbit(el.typeid.value).type;
                    if (t > max) max = t;
                }
            return max + 1;
        },
    },
};

// Define a "num" (id) de um elemento do IFF para o modal de novo item
// - bitfield (= type+createTypeidbit): tem o primeiro grupo do typeid (name, num, item_num, ...)
// - basic (= tipo de base, ex: Character, Course): o id fica nos 26 bits baixos do typeid
const kNewItemNumMask = 0x3FFFFFF;

function getNewItemNumInfo(_Ctor, _iffName = null) {

    if (!_Ctor)
        return null;

    let el = null;
    try {
        el = new _Ctor();
    } catch (_) {}

    if (!el || !('typeid' in el))
        return null;

    const model =
        _iffName ? kNewItemModel[_iffName] : null;

    // o modelo pode FORÇAR a ausência do modal de num (ex.: CutinInfomation —
    // o typeid É uma skin CUTIN do Skin.iff escolhida pela relation typeid)
    if (model && model.noNum)
        return null;

    // o modelo pode forçar o modal de num mesmo com typeid duplicado
    // (ex.: CaddieVoiceTable — o "num" É o type, nunca único)
    const forceNum =
        !!model && (typeof model.genNum === 'function' || typeof model.numGroup === 'string');

    // classes que aceitam typeid duplicado (num não é "num único") não usam o modal de num
    if (!forceNum && typeof el.isTypeidUnique === 'function' && el.isTypeidUnique() === false)
        return null;

    if (typeof _Ctor.createTypeidbit === 'function') {

        const bitfield = _Ctor.createTypeidbit();

        if (bitfield.groups && bitfield.groups.length > 0)
            return { is_bitfield: true, group: (model && model.numGroup) || bitfield.groups[0].name };
    }

    return { is_bitfield: false };
}

// Monta o typeid final de um novo item a partir dos valores do modal
// (bits do typeid e/ou o campo 'num')
function buildNewTypeId(_iff, _typeid, _values, _numInfo) {

    const base = (typeof _typeid === 'object' && _typeid !== null && 'value' in _typeid) ? _typeid.value : (_typeid || 0);
    const values = _values || {};

    let value = base >>> 0;

    if (_iff.element_constructor.createTypeidbit) {

        const typeidbit = _iff.element_constructor.createTypeidbit(base);

        for (const [bit, v] of Object.entries(values.bits || {}))
            typeidbit[bit] = v;

        if (_numInfo && _numInfo.is_bitfield && values.num != null)
            typeidbit[_numInfo.group] = values.num >>> 0;

        value = typeidbit.value >>> 0;
    } else if (_numInfo && !_numInfo.is_bitfield && values.num != null) {

        // tipo básico: o id fica nos 26 bits baixos do typeid;
        // os bits altos do typeid base (ex: identidade gerada) são preservados
        value = (base & ~kNewItemNumMask) | ((values.num >>> 0) & kNewItemNumMask);
    }

    // bits fixos do modelo (ex.: o num do CaddieVoiceTable é sempre 1)
    const model =
        kNewItemModel[_iff.name];

    const fixed =
        model && model.fixedBits;

    if (fixed && _iff.element_constructor.createTypeidbit) {

        const typeidbit =
            _iff.element_constructor.createTypeidbit(value);

        for (const [bit, v] of Object.entries(fixed))
            typeidbit[bit] = v;

        value = typeidbit.value >>> 0;
    }

    return { value };
}

// Retorna o id (num) do typeid de um elemento do IFF
// Usa o primeiro grupo da definição do bitfield (createTypeidbit), ou o low byte se a classe não tiver createTypeidbit
function getTypeidNum(_element) {

    if (!_element || !_element.typeid)
        return 0;

    const Ctor = _element.constructor;

    if (Ctor.createTypeidbit) {

        const bitfield = Ctor.createTypeidbit(_element.typeid.value);

        if (bitfield.groups && bitfield.groups.length > 0)
            return bitfield[bitfield.groups[0].name] || 0;
    }

    return _element.typeid.value & 0xFF;
}

// Resolve um caminho de campo ('a.b') de um item, expandindo arrays
function getItemFieldByPath(_item, _path) {
    let stack = [_item];

    for (const prop of _path.split('.')) {
        const next = [];

        for (const s of stack) {
            if (!s)
                continue;

            const v = s[prop];

            if (Array.isArray(v))
                next.push(...v);
            else
                next.push(v);
        }

        stack = next;
    }

    return stack;
}

// Variantes de região por iff (populada pelos region-*.js, ex.: region-us.js):
// quando o tamanho do elemento lido do arquivo não bate com o construtor
// padrão (JP), testa as variantes registradas — a que bater é usada nos
// elementos daquele iff (parse/serialize/layout próprios da região)
const kIffRegionVariants = {};

function resolveRegionVariant(_iffName, _defaultCtor, _fileElementSize, _version) {

    if (!Number.isInteger(_fileElementSize) || !_defaultCtor)
        return null;

    const variants =
        kIffRegionVariants[_iffName];

    if (!variants)
        return null;

    try {
        if (new _defaultCtor().getSize() === _fileElementSize)
            return null;
    } catch (e) {
        return null;
    }

    // região pela versão do cabeçalho (US 852 / KR 839 compartilham layout)
    const regiao =
        Number.isInteger(_version) ? kVersaoRegiao[_version] : null;

    if (regiao) {

        const rv =
            variants.find(v => v.region === regiao);

        if (rv)
            return rv;
    }

    // fallback: primeiro por tamanho (detecção US legada)
    for (const v of variants) {

        try {
            if (new v.ctor().getSize() === _fileElementSize)
                return v;
        } catch (e) {}
    }

    return null;
}

// versões suportadas (modal do conversor de região)
const kVersoesSuportadas = [
    { regiao: 'JP', label: 'Fresh Up!,Japão,983' },
    { regiao: 'US', label: 'Fresh Up!,USA,852' },
    { regiao: 'KR', label: 'Fresh Up!,Coreia,839' },
    { regiao: 'TH', label: 'Fresh Up!,Tailândia,829c' }
];

// versão (campo do cabeçalho de cada .iff do pack) -> região; US 852 e KR 839
// compartilham o LAYOUT (tamanhos idênticos), então a detecção é pela versão
// e não pelo tamanho do elemento. JP 983 é o construtor padrão (sem variante).
const kVersaoRegiao = {};
for (const v of kVersoesSuportadas) {
    const num = parseInt(v.label.split(',').pop(), 10);
    if (Number.isInteger(num))
        kVersaoRegiao[num] = v.regiao;
}

// rótulo da versão suportada do pack aberto — a região é a DETECTADA no
// parse (as variantes de kIffRegionVariants marcam iff.__region)
function getVersaoPackLabel() {

    const f =
        (typeof iffs !== 'undefined' ? iffs : []).find(x => x.__region);

    if (!f)
        return 'Fresh Up!,JP,983';

    const v =
        kVersoesSuportadas.find(v => v.regiao === f.__region);

    return v ? v.label : 'Fresh Up!,JP,983';
}

// região atual do pack aberto (fonte autoritativa = __region do primeiro iff
// com variante aplicada; pacote JP não tem __region e cai em 'JP'). Usado pelo
// conversor de região para marcar a opção "— atual" corretamente em qualquer
// região (JP/US/KR/TH), não só US/JP.
function getVersaoPackRegiao() {

    const f =
        (typeof iffs !== 'undefined' ? iffs : []).find(x => x.__region);

    return f ? f.__region : 'JP';
}

// rótulo completo (Fresh Up!,Japão,983) de uma região dada — usado nas
// mensagens de conversão de região para mostrar a versão em extenso
function getVersaoLabelPorRegiao(_regiao) {
    const v =
        kVersoesSuportadas.find(v => v.regiao === _regiao);

    return v ? v.label : _regiao;
}

function getVersaoPackTag(_encoding) {
    return '(' + getVersaoPackLabel() + ',' + (_encoding || kCodePage.load) + ')';
}

// ---- conversão de região (JP <-> US): reconstrói cada elemento no formato
// da outra região copiando os campos compatíveis pelo NOME. Strings menores
// truncam na gravação; números clampam para o range do destino (price Int16
// -> Int8 etc.); campos sem par no alvo caem no default (s_string/unknown,
// unknown/slot/eap do SetEffectTable)
function _copiaCampoValor(_dst, _src) {

    if (typeof _dst.value === 'string' && typeof _src.value === 'string') {
        // copia o texto E já reflete na memória a mesma truncagem que o serialize
        // fará: o campo destino tem limite de BYTES (limit) que pode ser menor que
        // o da origem (ex.: name 64->40 em JP->KR/US/TH). Sem isso o valor em
        // memória ficaria com o texto inteiro e divergiria do que é salvo.
        if (_dst.limit && _dst.limit > 0) {
            const marker = parseEncodingMarker(_src.value);
            const cp = marker ? marker.encoding : kCodePage.upload;
            const text = marker ? marker.text : _src.value;
            let ansi = toAnsiCodePage(text, cp);
            if (ansi.length > _dst.limit) {
                ansi = safeStringByCode(ansi.subarray(0, _dst.limit), cp);
                // mantém o marcador de encoding se o texto original o trazia
                _dst.value = (marker ? '=[{' + cp + '}]=:' : '') + toUnicode(ansi, cp);
                return;
            }
        }
        _dst.value =
            _src.value;
        return;
    }

        if ((typeof _dst.value === 'number' || typeof _dst.value === 'bigint')
            && (typeof _src.value === 'number' || typeof _src.value === 'bigint')) {

        let v =
            _src.value;

        const bits =
            ((_dst.getSize && _dst.getSize()) || 1) * 8;

        // Float/Double NÃO recebem bitmask: BigInt rejeita não-inteiro e o wrap
        // de um valor negativo arredonda em Float32 (ex.: -16 vira 2³²). Só
        // Int* (incl. Int64/bigint) fazem wrap por bit na conversão de região.
        const isFloat =
            (_dst instanceof FloatTypeBase);

        if (!isFloat && (typeof v === 'bigint' || Number.isInteger(v))) {

            // na conversão de região, um campo mais estreito guarda os bits
            // baixos do valor (wrap), não satura no máximo — 600 num Int8
            // vira 88 (0x3C) e não 255 (comportamento real de estreitar o campo)
            const m = (BigInt(1) << BigInt(bits)) - BigInt(1);

            try { _dst.value = Number(BigInt(v) & m); } catch (e) {}

        } else {

            try { _dst.value = Number(v); } catch (e) {}
        }
    }
}

function _copiaParConversao(_d, _o, _prof) {

    if (!_d || !_o || _prof > 6)
        return;

    if (_d instanceof HexEditor) {

        if (_o instanceof HexEditor) {
            const n =
                Math.min(_d._bytes.length, _o._bytes.length);

            for (let i = 0; i < n; i++)
                _d._bytes[i].value = _o._bytes[i].value;
        }

        return;
    }

        if (_d.value !== undefined && _o.value !== undefined
            && (typeof _o.value === 'string' || typeof _o.value === 'number' || typeof _o.value === 'bigint')) {
            _copiaCampoValor(_d, _o);
            return;
        }

    if (Array.isArray(_d)) {

        if (!Array.isArray(_o))
            return;

        const n =
            Math.min(_d.length, _o.length);

        for (let i = 0; i < n; i++)
            _copiaParConversao(_d[i], _o[i], _prof + 1);

        return;
    }

    // sub-objeto: desce pelos nomes dos campos mesmo com classes diferentes
    // entre as regiões (MascotEfeito x MascotEfeitoUS)
    if (typeof _d === 'object' && typeof _o === 'object')
        _converteCopiaCampos(_d, _o, _prof);
}

function _converteCopiaCampos(_dst, _src, _prof = 0) {

    if (!_dst || !_src || _prof > 6)
        return;

    for (const k of Object.keys(_dst)) {

        if (k.startsWith('__'))
            continue;

        const d =
            _dst[k];

        const o =
            _src[k];

        if (o === undefined || o === null || d === undefined || d === null)
            continue;

        if (Array.isArray(d)) {

            if (!Array.isArray(o))
                continue;

            const n =
                Math.min(d.length, o.length);

            for (let i = 0; i < n; i++)
                _copiaParConversao(d[i], o[i], _prof + 1);

            continue;
        }

        if (k[0] === '_')
            continue;

        // flag_shop é copiado por bits semânticos à parte (vide
        // _converteFlagShopBits) — o genérico corromperia o BitfieldType
        if (k === 'flag_shop')
            continue;

        _copiaParConversao(d, o, _prof);
    }
}

// Realoca os bits do flag_shop entre o layout TH (type Int16 com unknown de 4
// bits, unknown2 e is_new/is_hot nos bits 12/13) e os demais (type/icon Int8
// com unknown de 1 bit, sem unknown2, is_new/is_hot no byte do icon). Copia os
// flags SEMÂNTICOS pelo nome — o BitfieldType mascara/desloca cada bit conforme
// o layout de origem e destino, então a posição crua dos bits não importa.
function _converteFlagShopBits(_dst, _src) {

    if (!_dst || !_src || !_dst.type || !_src.type)
        return;

    const tb = ['is_cash', 'can_send_mail_and_personal_shop', 'can_dup',
        'block_mail_and_personal_shop', 'is_saleable', 'is_giftable', 'only_display'];

    for (const b of tb)
        if (_src.type[b] !== undefined && _dst.type[b] !== undefined)
            _dst.type[b] = _src.type[b];

    // unknown: TH tem 4 bits; destino tem 1 bit — preserva o bit menos significativo
    if (_src.type.unknown !== undefined && _dst.type.unknown !== undefined)
        _dst.type.unknown = _src.type.unknown & 1;

    const ib = ['is_new', 'is_hot'];

    for (const b of ib)
        if (_src.icon[b] !== undefined && _dst.icon[b] !== undefined)
            _dst.icon[b] = _src.icon[b];

    // unknown2 só existe no TH (origem) — não há bit correspondente no destino
}

function converteIffsParaRegiao(_alvo) {

    // garante que os novos elementos (e seu flag_shop) sejam construídos com o
    // layout da região-alvo, não da origem (isTHRegionActive() depende disso)
    gRegionApply = _alvo;

    let afetados =
        0;

    let elementos =
        0;

    for (const iff of iffs) {

        // o construtor do alvo: regiões com variante registrada (US, KR,...)
        // usam a classe variante; JP é o construtor PADRÃO do iff
        const vars =
            kIffRegionVariants[iff.name];

        const alvoVar =
            vars && vars.find(v => v.region === _alvo);

        // alvo sem variante registrada (ex.: JP, que é o construtor base): usa o
        // construtor BASE do iff, NÃO iff.element_constructor — este último pode ser
        // a variante da ORIGEM (ex.: SkinTH Int32 num TH->JP) e reconstruiria um
        // elemento no formato errado (price travado em Int32 e o wrap da cópia
        // perdido). JP é sempre o base.
        const alvoCtor =
            alvoVar ? alvoVar.ctor : getConstructorByName(iff.name);

        if (!alvoCtor)
            continue;

        // não pula por iff.__region === _alvo: ao carregar TH, as iff da
        // família Base são rotuladas como 'US'/'KR' (tamanho idêntico às
        // variantes), e pular a conversão TH->US deixaria o flag_shop no
        // layout TH (reinterpretado errado no reload). O loop externo já
        // exclui srcR === tgtR, então reconstruir para o alvo é sempre certo.
        const novos =
            [];

        for (const el of iff.elements) {

            const nd =
                new alvoCtor();

            _converteCopiaCampos(nd, el);

            // flag_shop: copia os bits semânticos (layout-independente). Para
            // TH<->demais realoca os bits (unknown 4->1, unknown2 dropado,
            // is_new/is_hot reposicionados); para demais->demais é 1:1.
            if (nd.shop && el.shop && nd.shop.flag_shop && el.shop.flag_shop)
                _converteFlagShopBits(nd.shop.flag_shop, el.shop.flag_shop);

            if (el.__deleted) nd.__deleted = true;
            if (el.__new) nd.__new = true;
            if (el.__hide) nd.__hide = true;
            nd.__modified = true;

            novos.push(nd);

            elementos++;
        }

        iff.elements =
            novos;

        if (alvoVar) {

            iff.__region =
                _alvo;

            iff.__regionCtor =
                alvoCtor;

        } else {

            delete iff.__region;
            delete iff.__regionCtor;
        }

        afetados++;
    }

    return { afetados, elementos };
}

const kIFFConstructorByFileName = {
    'Character.iff': Character,
    'Club.iff': Club,
    'ClubSet.iff': ClubSet,
    'CadieMagicBoxRandom.iff': CadieMagicBoxRandom,
    'Item.iff': Item,
    'Part.iff': Part,
    'Caddie.iff': Caddie,
    'Mascot.iff': Mascot,
    'Desc.iff': Desc,
    'SetItem.iff': SetItem,
    'Ball.iff': Ball,
    'CaddieItem.iff': CaddieItem,
    'Course.iff': Course,
    'Match.iff': Match,
    'Enchant.iff': Enchant,
    'Skin.iff': Skin,
    'HairStyle.iff': HairStyle,
    'Achievement.iff': Achievement,
    'CounterItem.iff': CounterItem,
    'AuxPart.iff': AuxPart,
    'QuestStuff.iff': QuestStuff,
    'QuestItem.iff': QuestItem,
    'Card.iff': Card,
    'Furniture.iff': Furniture,
    'CadieMagicBox.iff': CadieMagicBox,
    'FurnitureAbility.iff': FurnitureAbility,
    'TikiRecipe.iff': TikiRecipe,
    'TikiPointTable.iff': TikiPointTable,
    'TikiSpecialTable.iff': TikiSpecialTable,
    'CutinInfomation.iff': CutinInfomation,
    'TimeLimitItem.iff': TimeLimitItem,
    'SpecialPrizeItem.iff': SpecialPrizeItem,
    'ShopLimitItem.iff': ShopLimitItem,
    'PointShop.iff': PointShop,
    'NonVisibleItemTable.iff': NonVisibleItemTable,
    'SubscriptionItemTable.iff': SubscriptionItemTable,
    'TwinsItemTable.iff': TwinsItemTable,
    'ScratchRewardSetting.iff': ScratchRewardSetting,
    'LevelUpPrizeItem.iff': LevelUpPrizeItem,
    'ErrorCodeInfo.iff': ErrorCodeInfo,
    'ArtifactManaInfo.iff': ArtifactManaInfo,
    'Ability.iff': Ability,
    'ClubSetWorkShopLevelUpProb.iff': ClubSetWorkShopLevelUpProb,
    'ClubSetWorkShopLevelUpLimit.iff': ClubSetWorkShopLevelUpLimit,
    'ClubSetWorkShopRankUpExp.iff': ClubSetWorkShopRankUpExp,
    'AddonPart.iff': AddonPart,
    'SetEffectTable.iff': SetEffectTable,
    'GrandPrixData.iff': GrandPrixData,
    'GrandPrixSpecialHole.iff': GrandPrixSpecialHole,
    'GrandPrixConditionEquip.iff': GrandPrixConditionEquip,
    'GrandPrixRankReward.iff': GrandPrixRankReward,
    'GrandPrixAIOptionalData.sff': GrandPrixAIOptionalData,
    'HoleCupDropItem.iff': HoleCupDropItem,
    'MemorialShopCoinItem.sff': MemorialShopCoinItem,
    'MemorialShopRareItem.iff': MemorialShopRareItem,
    'CharacterMastery.iff': CharacterMastery,
    'CaddieVoiceTable.iff': CaddieVoiceTable,
};

function getConstructorByName(_name) {
    if (!kIFFConstructorByFileName.hasOwnProperty(_name))
        return null;
    return kIFFConstructorByFileName[_name];
}
