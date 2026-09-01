// Arquivo viewer.js
// Criado em 18/07/2026 as 06:42 por Acrisio

class BaseType {

    _is_bool_type = false;
    _data = undefined;
    name = "";

    constructor(_is_bool_type = false) {
        this._is_bool_type = _is_bool_type;
    }

    getSize() {
        return 0;
    }

    get value() {
        return this._data;
    }

    set value(_value) {
        this._data = _value;
    }

    checkValue(_value) {
        return true;
    }

    layout(_parent, _name = this.name) {

        if (this._is_bool_type) {

            let row =
                document.createElement("div");

            row.className =
                "bool-field";

            const tgl = buildToggleSwitch({
                name: _name || this.name,
                checked: this.value ? true : false,
                onChange: evt => {

                    const oldValue =
                        this.value;

                    this.value =
                        evt.target.checked ? 1 : 0;

                    if (this.onchange)
                        this.onchange(oldValue, this.value);
                }
            });

            if (_name)
                tgl.input.dataset.field = _name;

            row.appendChild(tgl.root);

            _parent.appendChild(row);

            return;
        }

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

        const isIntType = this instanceof IntTypeBase;

        const defaultMode =
            _name === 'typeid' ? 'hex' : 'dec';

        const fmtValue = _v => {
            if (isIntType && (this._input_mode || defaultMode) === 'hex')
                return '0x' + _v.toString(16);
            return String(_v);
        };

        const di = document.createElement('input');
        di.type = 'text';
        di.value = fmtValue(this.value);

        if (_name)
            di.dataset.field = _name;

        let modeWrap = null;

        if (isIntType) {

            modeWrap =
                document.createElement('div');

            modeWrap.className =
                'num-input-wrap';

            const modeTgl =
                buildToggleSwitch({
                    name: 'hex',
                    posText: 'hex',
                    negText: 'dec',
                    stateText: true,
                    checked: (this._input_mode || defaultMode) === 'hex',
                    inputClass: 'num-mode',
                    onChange: (evt, input) => {

                        this._input_mode =
                            input.checked ? 'hex' : 'dec';

                        di.value = fmtValue(this.value);
                    }
                });

            modeWrap.appendChild(modeTgl.root);
        }

        di.addEventListener("change", evt => {

            let value = evt.target.value;

            if (isIntType && (this._input_mode || defaultMode) === 'hex') {

                // campo vazio no hex = 0 (mesmo comportamento do dec, onde
                // Number('') = 0 passa no checkValue)
                const hexStr =
                    String(value).replace(/^0x/i, '').trim();

                if (hexStr === '') {

                    value = 0;

                } else {

                    value = parseInt(hexStr, 16);

                    if (Number.isNaN(value)) {
                        di.value = fmtValue(this.value);
                        return;
                    }
                }
            }

            if (!this.checkValue(value)) {
                di.value = fmtValue(this.value);
                return;
            }

            const oldValue = this.value;

            this.value = value;

            di.value = fmtValue(this.value);

            if (this.onchange)
                this.onchange(oldValue, this.value);
        });

        if (modeWrap)
            modeWrap.appendChild(di);
        else
            container.appendChild(di);

        if (modeWrap) {
            container.appendChild(modeWrap);
            // o wrap do campo (usado por addTypeidLinkPick para anexar o botão "…")
            this._layoutWrap = modeWrap;
        }
    }

    toString() {
        return "";
    }
}

// Relação dos campos StringType: 'text' = texto traduzível,
// 'text:no_translate' = texto NÃO traduzível (sequência/código interno),
// 'asset' = recurso (NÃO traduzível) — passada no construtor do StringType,
// não por tabela de nome
const StringTypeRelation = {
    TEXT: 'text',
    TEXT_NO_TRANSLATE: 'text:no_translate', // text sem tradução (ex.: s_string do MemorialShopRareItem)
    ASSET: {
        MODEL: 'asset:model', // modelo 3d (mpet)
        TEXTURE: 'asset:texture', // textura — imagem (tex, texture, texture_org)
        ICON: 'asset:icon', // ícone (icon)
        FX: 'asset:fx', // script de efeito (fx, fxBone)
        AUDIO: 'asset:audio', // música/áudio (amb_sound, shot_name)
        XML: 'asset:xml', // arquivo de propriedades (xml)
        SEQ: 'asset:seq', // arquivo de sequência de animação (seq)
        ANIMATION: 'asset:animation', // arquivo de animação .spr (animation)
        TROPHY: 'asset:trophy', // nome base de modelo 3d/imagens (trophy)
        SPRITE: 'asset:sprite', // sprite — imagem (sprite)
        IMG: 'asset:img', // imagem (img)
        CONFIG: 'asset:config', // definição de valor de configuração (s_string)
    },
};

// cache de URLs de preview das imagens dos campos asset (key: nome::caminho)
const gResourceImageCache =
    new Map();

// fallback: diretório local ausente → procura www/pangya/img do GitHub (git
// trees API); lista carregada 1x por sessão (lazy), download raw só do
// arquivo exibido
const kResourceGitHubOwner =
    'Acrisio-Filho/SuperSS-Dev';

const kResourceGitHubBranch =
    'master';

const kResourceGitHubPath =
    'www/pangya/img';

let gResourceGitHubMap =
    null;

let gResourceGitHubLoad =
    null;

// desabilitável pelos testes E2E (não dependem de rede externa)
let gResourceGitHubEnabled =
    true;

// fila dos downloads do fallback do GitHub: com lista enorme (Part.iff,
// 9417 itens) o loadResourcePreview dispara CENTENAS de fetch e o Chromium
// falha com ERR_INSUFFICIENT_RESOURCES — limita concorrência, espaça as
// largadas e retenta 1x no erro
const _gResourceFetchQueue = {
    pending: [],
    active: 0,
    maxActive: 4,
    gapMs: 60
};

function _pumpResourceFetchQueue() {

    const q = _gResourceFetchQueue;

    if (q.active >= q.maxActive || q.pending.length === 0)
        return;

    const job =
        q.pending.shift();

    q.active++;

    const finish = () => {
        q.active--;
        setTimeout(_pumpResourceFetchQueue, q.gapMs);
    };

    const attempt = async () => {
        try {
            job.resolve(await fetch(job.url));
        } catch (_e) {
            // erro transiente (ex.: recursos do browser estourados): 1 retry
            // após um respiro maior antes de desistir
            try {
                await new Promise(r => setTimeout(r, 500));
                job.resolve(await fetch(job.url));
            } catch (_e2) {
                job.reject(_e2);
            }
        }
        finish();
    };

    // espaça as largadas para não sair tudo de uma vez
    setTimeout(attempt, q.gapMs);
}

// fetch enfileirado (mesma assinatura do fetch — resolve com o Response)
function queueResourceFetch(_url) {

    return new Promise((resolve, reject) => {
        _gResourceFetchQueue.pending.push({ url: _url, resolve, reject });
        _pumpResourceFetchQueue();
    });
}

// desce a árvore do repositório até o diretório de imagens e monta o mapa
// (nome minúsculo -> URL raw); null se falhar (não tenta de novo na sessão)
async function loadResourceGitHubList() {

    if (typeof fetch !== 'function' || !gResourceGitHubEnabled)
        return null;

    try {

        if (!gResourceGitHubLoad) {

            gResourceGitHubLoad =
                (async () => {

                    let sha =
                        kResourceGitHubBranch;

                    const segments =
                        kResourceGitHubPath.split('/');

                    for (const seg of segments) {

                        const res =
                            await fetch(`https://api.github.com/repos/${kResourceGitHubOwner}/git/trees/${sha}`);

                        if (!res.ok)
                            return null;

                        const tree =
                            await res.json();

                        const entry =
                            (tree.tree || []).find(e => e.path === seg);

                        if (!entry || entry.type !== 'tree')
                            return null;

                        sha =
                            entry.sha;
                    }

                    const res =
                        await fetch(`https://api.github.com/repos/${kResourceGitHubOwner}/git/trees/${sha}?recursive=true`);

                    if (!res.ok)
                        return null;

                    const tree =
                        await res.json();

                    const map =
                        new Map();

                    for (const e of tree.tree || []) {

                        if (e.type !== 'blob')
                            continue;

                        const name =
                            e.path.split('/').pop().toLowerCase();

                        if (map.has(name))
                            continue;

                        const enc =
                            e.path.split('/').map(encodeURIComponent).join('/');

                        map.set(
                            name,
                            `https://raw.githubusercontent.com/${kResourceGitHubOwner}/${kResourceGitHubBranch}/${kResourceGitHubPath}/${enc}`
                        );
                    }

                    return map;
                })();
        }

        gResourceGitHubMap =
            await gResourceGitHubLoad;

        return gResourceGitHubMap;
    } catch (_e) {

        gResourceGitHubMap =
            null;

        return null;
    }
}

// decodifica um .tga (true-color 24/32 bits, uncompressed/RLE, escala de cinza)
// e devolve os pixels RGBA; null se o formato não for suportado
function decodeTga(_arrayBuffer) {
    const view = new DataView(_arrayBuffer);

    if (_arrayBuffer.byteLength < 18)
        return null;

    const imageType = view.getUint8(2);

    // suporta: 2 (true-color), 10 (true-color com RLE) e 3 (escala de cinza)
    if (imageType !== 2 && imageType !== 3 && imageType !== 10)
        return null;

    const width = view.getUint16(12, true);
    const height = view.getUint16(14, true);
    const pixelDepth = view.getUint8(16);

    if (width === 0 || height === 0)
        return null;

    if (imageType === 3 && pixelDepth !== 8)
        return null;

    if (imageType !== 3 && pixelDepth !== 24 && pixelDepth !== 32)
        return null;

    const topToBottom = (view.getUint8(17) & 0x20) !== 0;
    const bytesPerPixel = pixelDepth >> 3;

    let offset = 18 + view.getUint8(0);

    if (view.getUint8(1) === 1)
        offset += view.getUint16(5, true) * Math.ceil(view.getUint8(7) / 8);

    if (offset >= _arrayBuffer.byteLength)
        return null;

    const data =
        new Uint8Array(_arrayBuffer, offset, _arrayBuffer.byteLength - offset);

    const out =
        new Uint8ClampedArray(width * height * 4);

    let x = 0;
    let y = 0;

    const writePixel = _p => {

        const yy = topToBottom ? y : (height - 1 - y);

        const d = (yy * width + x) * 4;

        if (pixelDepth === 24) {
            out[d] = _p[2];
            out[d + 1] = _p[1];
            out[d + 2] = _p[0];
            out[d + 3] = 255;
        } else if (pixelDepth === 32) {
            out[d] = _p[2];
            out[d + 1] = _p[1];
            out[d + 2] = _p[0];
            out[d + 3] = _p[3];
        } else {
            out[d] = _p[0];
            out[d + 1] = _p[0];
            out[d + 2] = _p[0];
            out[d + 3] = 255;
        }

        x++;

        if (x === width) {
            x = 0;
            y++;
        }
    };

    let pos = 0;

    if (imageType === 10) {

        // RLE: pacotes com header — bit 7 = run length, senão raw
        while (pos < data.length && y < height) {

            const header = data[pos++];
            const count = (header & 0x7F) + 1;

            if (header & 0x80) {

                const start = pos;
                pos += bytesPerPixel;

                if (pos > data.length)
                    break;

                const pixel = data.subarray(start, pos);

                for (let i = 0; i < count && y < height; i++)
                    writePixel(pixel);
            } else {

                for (let i = 0; i < count && y < height; i++) {

                    if (pos + bytesPerPixel > data.length)
                        break;

                    writePixel(data.subarray(pos, pos + bytesPerPixel));
                    pos += bytesPerPixel;
                }
            }
        }
    } else {

        while (pos + bytesPerPixel <= data.length && y < height) {

            writePixel(data.subarray(pos, pos + bytesPerPixel));
            pos += bytesPerPixel;
        }
    }

    return { width, height, data: out };
}

// converte um arquivo .tga em blob PNG (o navegador não desenha .tga)
function tgaFileToPngBlob(_file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();

        reader.onload = () => {
            const tga = decodeTga(reader.result);

            if (!tga) {
                reject(new Error('TGA não suportado'));
                return;
            }

            const canvas = document.createElement('canvas');
            canvas.width = tga.width;
            canvas.height = tga.height;

            const ctx = canvas.getContext('2d');

            if (!ctx) {
                reject(new Error('sem canvas 2d'));
                return;
            }

            const imageData = ctx.createImageData(tga.width, tga.height);
            imageData.data.set(tga.data);
            ctx.putImageData(imageData, 0, 0);

            canvas.toBlob(blob => {
                if (blob)
                    resolve(blob);
                else
                    reject(new Error('falha no toBlob'));
            }, 'image/png');
        };

        reader.onerror = () => reject(reader.error);

        reader.readAsArrayBuffer(_file);
    });
}

class StringType extends BaseType {

    limit = 1;
    _data = "";
    __encoding = null;
    relation = StringTypeRelation.TEXT;

    constructor(_limit = 1, _relation = StringTypeRelation.TEXT) {
        super(false);

        this.limit = _limit;
        this.relation = _relation;
    }

    isText() {
        // família texto: traduzível (TEXT) e não traduzível (TEXT_NO_TRANSLATE)
        return this.relation === StringTypeRelation.TEXT
            || this.relation === StringTypeRelation.TEXT_NO_TRANSLATE;
    }

    isTranslatable() {
        return this.relation === StringTypeRelation.TEXT;
    }

    isAsset() {
        return !this.isText();
    }

    isImage() {
        const r = this.relation;
        return r === StringTypeRelation.ASSET.TEXTURE
            || r === StringTypeRelation.ASSET.ICON
            || r === StringTypeRelation.ASSET.SPRITE
            || r === StringTypeRelation.ASSET.IMG;
    }

    // campos que guardam o nome do arquivo SEM a extensão
    // (icon/model/audio/trophy/img/config)
    dropsFileExtension() {
        const r = this.relation;
        return r === StringTypeRelation.ASSET.ICON
            || r === StringTypeRelation.ASSET.MODEL
            || r === StringTypeRelation.ASSET.AUDIO
            || r === StringTypeRelation.ASSET.TROPHY
            || r === StringTypeRelation.ASSET.IMG
            || r === StringTypeRelation.ASSET.CONFIG;
    }

    // carrega o preview da imagem no campo: procura no diretório de recursos
    // (case-insensitive) e, se não achar, no diretório de imagens do GitHub
    // (lazy); com cache por arquivo; .tga vira PNG na hora do cache;
    // sem resultado deixa o campo normal
    async loadResourcePreview(_imgEl, _wrap) {

        if (typeof gResourceFilesMap === 'undefined' || !this.isImage())
            return;

        if (typeof URL.createObjectURL !== 'function')
            return;

        const value = (this.value || '').trim();

        if (!value) {

            _imgEl.hidden = true;

            _wrap.classList.remove('has-image');

            return;
        }

        let file = null;

        // URL raw do arquivo no GitHub (fallback quando o local não tem)
        let fallbackUrl = null;

        if (this.dropsFileExtension()) {

            // campos sem extensão: testa .tga, .png, .jpg nessa ordem
            const base = value.toLowerCase();

            for (const ext of ['.tga', '.png', '.jpg']) {

                file = gResourceFilesMap.get(base + ext);

                if (file)
                    break;
            }
        } else {

            file = gResourceFilesMap.get(value.toLowerCase());
        }

        if (!file) {

            // fallback: diretório de imagens do repositório do GitHub
            // (lista lazy, carregada 1x por sessão)
            await loadResourceGitHubList();

            if (gResourceGitHubMap) {

                if (this.dropsFileExtension()) {

                    // mesma ordem de extensões do diretório local
                    const base = value.toLowerCase();

                    for (const ext of ['.tga', '.png', '.jpg']) {

                        fallbackUrl = gResourceGitHubMap.get(base + ext);

                        if (fallbackUrl)
                            break;
                    }
                } else {

                    fallbackUrl = gResourceGitHubMap.get(value.toLowerCase());
                }
            }
        }

        if (!file && !fallbackUrl) {

            _imgEl.hidden = true;

            _wrap.classList.remove('has-image');

            return;
        }

        const cacheKey =
            file
                ? file.name.toLowerCase() + '::' + (file.webkitRelativePath || '').toLowerCase()
                : 'github::' + fallbackUrl;

        let urlPromise =
            gResourceImageCache.get(cacheKey);

        if (!urlPromise) {

            urlPromise =
                (async () => {

                    let blob = null;

                    let isTga = false;

                    if (file) {

                        blob = file;

                        isTga = /\.tga$/i.test(file.name);
                    } else {

                        const res =
                            await queueResourceFetch(fallbackUrl);

                        if (!res.ok)
                            throw new Error('falha no download do GitHub');

                        blob =
                            await res.blob();

                        isTga = /\.tga$/i.test(fallbackUrl);
                    }

                    // navegador não desenha .tga: converte para PNG antes de exibir
                    if (isTga && typeof FileReader === 'function') {

                        try {

                            const pngBlob =
                                await tgaFileToPngBlob(blob);

                            return URL.createObjectURL(pngBlob);
                        } catch (_e) {

                            // formato não suportado: tenta o arquivo direto
                            // (o navegador pode não desenhar)
                            return URL.createObjectURL(blob);
                        }
                    }

                    return URL.createObjectURL(blob);
                })();

            gResourceImageCache.set(cacheKey, urlPromise);
        }

        let url = null;

        try {

            url = await urlPromise;
        } catch (_e) {
            // sem URL: campo fica sem preview
        }

        if (url == null) {

            _imgEl.hidden = true;

            _wrap.classList.remove('has-image');

            return;
        }

        _imgEl.src = url;

        _imgEl.hidden = false;

        _wrap.classList.add('has-image');
    }

    getSize() {
        return this.limit;
    }

    get value() {
        return this._data;
    }

    set value(_value) {
        // invalida o cache de erros de encoding por item (o aviso precisa
        // refletir o texto editado — se o usuário removeu/trocou o marcador)
        gStringEditVersion++;

        const marker = parseEncodingMarker(_value);

        if (marker) {
            // preserva o marcador =[{enc}]=: inteiro — o truncamento real por
            // bytes acontece no serialize (setFixedString)
            this._data = _value;
        } else {
            this._data = _value.slice(0, this.limit);
        }

        // mantém __encoding sincronizado com o marcador no texto
        this.__encoding = marker ? marker.encoding : null;
    }

    checkValue(_value) {
        return typeof(_value) === "string";
    }

    // deriva __encoding do marcador =[{enc}]=: no texto (null se não tem)
    _syncEncoding() {
        const marker = parseEncodingMarker(this._data);
        this.__encoding = marker ? marker.encoding : null;
    }

    unserialize(_data) {
        this._data = _data.getFixedString(this.limit);
        this._syncEncoding();
    }
    serialize(_data) {
        _data.setFixedString(this._data, this.limit, this.__encoding || undefined);
    }

    toString() {
        return this.value;
    }
    
    layout(_parent, _name = this.name) {

        if (this.isAsset()) {

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

            const wrap =
                document.createElement("div");

            wrap.className =
                "asset-file-wrap";

            const imgEl =
                document.createElement("img");

            imgEl.className =
                "asset-file-img";

            imgEl.hidden = true;

            imgEl.title =
                "Ampliar imagem";

            imgEl.addEventListener("click", () => {

                if (imgEl.hidden || !imgEl.src)
                    return;

                new ResourceImageModal(imgEl.src, _name).show();
            });

            wrap.appendChild(imgEl);

            const di = document.createElement('input');
            di.type = 'text';
            di.value = this.value;

            if (_name)
                di.dataset.field = _name;

            di.addEventListener("change", evt => {
                if (!this.checkValue(evt.target.value)) {
                    evt.target.value = this.value;
                    return;
                }

                this.value = evt.target.value;

                this.loadResourcePreview(imgEl, wrap);
            });

            const fileBtn =
                document.createElement("label");

            fileBtn.className =
                "asset-file-btn";

            fileBtn.title =
                "Selecionar arquivo";

            fileBtn.textContent =
                "…";

            const fileInput =
                document.createElement('input');

            fileInput.type = 'file';
            fileInput.hidden = true;

            fileInput.addEventListener("change", evt => {

                if (!fileInput.files || fileInput.files.length === 0)
                    return;

                let fileName =
                    fileInput.files[0].name;

                if (this.dropsFileExtension())
                    fileName = fileName.replace(/\.[^.]+$/, "");

                this.value = fileName;
                di.value = fileName;

                this.loadResourcePreview(imgEl, wrap);

                // reseta para permitir selecionar o mesmo arquivo de novo
                fileInput.value = "";
            });

            wrap.appendChild(di);
            wrap.appendChild(fileBtn);
            fileBtn.appendChild(fileInput);
            container.appendChild(wrap);

            // preview da imagem no canto esquerdo do input (se existir no diretório)
            this.loadResourcePreview(imgEl, wrap);

            return;
        }

        if (this.limit < 100)
            super.layout(_parent, _name);
        else {

            if (_name) {
                let label =
                    document.createElement("span");

                label.className =
                    "type-label";

                label.textContent =
                    _name + ": ";

                _parent.appendChild(label);
            }

            const textArea = document.createElement('textarea');

            textArea.style.flex = '1';
            textArea.style.resize = 'vertical';
            textArea.textContent = this.value;

            if (_name)
                textArea.dataset.field = _name;

            textArea.addEventListener("change", evt => {
                if (!this.checkValue(evt.target.value)) {
                    evt.target.value = this.value;
                    return;
                }

                this.value = evt.target.value;
            });

            _parent.appendChild(textArea);
        }
    }
}

class IntTypeBase extends BaseType {

    _unsigned = false;
    _data = 0;

    constructor(_is_bool_type = false, _unsigned = false) {
        super(_is_bool_type);

        this._unsigned = _unsigned;
    }

    checkValue(_value) {
        if (Number.isNaN(_value))
            return false;
        if (!Number.isFinite(Number(_value)))
            return false;
        if (!Number.isInteger(Number(_value)))
            return false;
        return true;
    }
}

class FloatTypeBase extends BaseType {

    _data = 0.0;

    constructor(_is_bool_type) {
        super(_is_bool_type);
    }

    checkValue(_value) {
        if (Number.isNaN(_value))
            return false;
        if (!Number.isFinite(Number(_value)))
            return false;
        return true;
    }
}

class Int8Type extends IntTypeBase {

    constructor(_is_bool_type = false, _unsigned = false) {
        super(_is_bool_type, _unsigned);
    }

    getSize() {
        return 1;
    }

    get value() {
        return this._data;
    }

    set value(_value) {
        if (!isFinite(_value))
            _value = 0;
        if (this._unsigned)
            this._data = Number(BigInt.asUintN(8, BigInt(_value)));
        else
            this._data = Number(BigInt.asIntN(8, BigInt(_value)));
    }

    unserialize(_data) {
        if (this._unsigned)
            this._data = _data.getUint8();
        else
            this._data = _data.getInt8();
    }
    serialize(_data) {
        if (this._unsigned)
            _data.setUint8(this._data);
        else
            _data.setInt8(this._data);
    }

    toString() {
        return this.value.toString();
    }
}

class Int16Type extends IntTypeBase {

    _little_endian = true;

    constructor(_is_bool_type = false, _little_endian = true, _unsigned = false) {
        super(_is_bool_type, _unsigned);
        
        this._little_endian = _little_endian;
    }

    getSize() {
        return 2;
    }

    get value() {
        return this._data;
    }

    set value(_value) {
        if (!isFinite(_value))
            _value = 0;
        if (this._unsigned)
            this._data = Number(BigInt.asUintN(16, BigInt(_value)));
        else
            this._data = Number(BigInt.asIntN(16, BigInt(_value)));
    }

    unserialize(_data) {
        if (this._unsigned)
            this._data = _data.getUint16(!this._little_endian);
        else
            this._data = _data.getInt16(!this._little_endian);
    }
    serialize(_data) {
        if (this._unsigned)
            _data.setUint16(this._data, !this._little_endian);
        else
            _data.setInt16(this._data, !this._little_endian);
    }

    toString() {
        return this.value.toString();
    }
}

class Int32Type extends IntTypeBase {

    _little_endian = true;

    constructor(_is_bool_type = false, _little_endian = true, _unsigned = false) {
        super(_is_bool_type, _unsigned);
        
        this._little_endian = _little_endian;
    }

    getSize() {
        return 4;
    }

    get value() {
        return this._data;
    }

    set value(_value) {
        if (!isFinite(_value))
            _value = 0;
        if (this._unsigned)
            this._data = Number(BigInt.asUintN(32, BigInt(_value)));
        else
            this._data = Number(BigInt.asIntN(32, BigInt(_value)));
    }

    unserialize(_data) {
        if (this._unsigned)
            this._data = _data.getUint32(!this._little_endian);
        else
            this._data = _data.getInt32(!this._little_endian);
    }
    serialize(_data) {
        if (this._unsigned)
            _data.setUint32(this._data, !this._little_endian);
        else
            _data.setInt32(this._data, !this._little_endian);
    }

    toString() {
        return this.value.toString();
    }
}

class Int64Type extends IntTypeBase {

    _little_endian = true;

    constructor(_is_bool_type = false, _little_endian = true, _unsigned = false) {
        super(_is_bool_type, _unsigned);
        
        this._little_endian = _little_endian;
        this._data = 0n;
    }

    getSize() {
        return 8;
    }

    get value() {
        return this._data;
    }

    set value(_value) {
        if (!isFinite(_value))
            _value = 0n;
        if (this._unsigned)
            this._data = Number(BigInt.asUintN(64, BigInt(_value)));
        else
            this._data = Number(BigInt.asIntN(64, BigInt(_value)));
    }

    unserialize(_data) {
        if (this._unsigned)
            this._data = _data.getUint64(!this._little_endian);
        else
            this._data = _data.getInt64(!this._little_endian);
    }
    serialize(_data) {
        if (this._unsigned)
            _data.setUint64(BigInt(this._data), !this._little_endian);
        else
            _data.setInt64(BigInt(this._data), !this._little_endian);
    }

    toString() {
        return this.value.toString();
    }
}

class FloatType extends FloatTypeBase {

    _little_endian = true;

    constructor(_little_endian = true) {
        super(false);

        this._little_endian = _little_endian;
    }

    getSize() {
        return 4;
    }

    get value() {
        return this._data;
    }

    set value(_value) {
        this._data = _value;
    }

    unserialize(_data) {
        this._data = _data.getFloat(!this._little_endian);
    }
    serialize(_data) {
        _data.setFloat(this._data, !this._little_endian);
    }

    toString() {
        return this.value.toString();
    }
}

class DoubleType extends FloatType {

    _little_endian = true;

    constructor(_little_endian = true) {
        super(false);

        this._little_endian = _little_endian;
    }

    getSize() {
        return 8;
    }

    get value() {
        return this._data;
    }

    set value(_value) {
        this._data = _value;
    }

    unserialize(_data) {
        this._data = _data.getDouble(!this._little_endian);
    }
    serialize(_data) {
        _data.setDouble(this._data, !this._little_endian);
    }

    toString() {
        return this.value.toString();
    }
}

// ícone do editor de bitfield (resources/bitfield-edit.svg): grade 2x2 de
// quadrados (bits), com o diagonal aceso — representa os grupos de bits do
// editor. Arquivo externo p/ não depender de fonte nem de inline SVG.
function bitfieldEditIcon() {
    const img =
        document.createElement("img");

    img.className =
        "bitfield-edit-icon";

    img.src =
        "resources/bitfield-edit.svg";

    img.alt =
        "Editar bitfield";

    img.width = 16;
    img.height = 16;

    return img;
}

class BitfieldType {

    constructor(_type, _definition = {}, _value = 0) {

        this._base = _type;

        this.groups = [];

        this.condition_warning = Array.isArray(_definition.condition_warning) ? _definition.condition_warning.slice() : [];

        let offset = 0;

        Object.entries(_definition).forEach(([name, bits]) => {

            if (name === 'condition_warning') return;

            const group = { name, bits, offset };

            this.groups.push(group);

            Object.defineProperty(this, name, {
                get() {
                    return this.getGroupValue(group);
                },
                set(_value) {
                    this.setGroupValue(group, _value);
                }
            });

            offset += bits;
        });

        this.totalBits = offset;

        this._lockedBits = [];

        this._pangListeners = [];

        this._base.value = _value;
    }


    getSize() {
        return this._base.getSize();
    }


    unserialize(_data) {
        this._base.unserialize(_data);
    }


    serialize(_data) {
        this._base.serialize(_data);
    }


    get value() {
        return this._base.value;
    }


    set value(_value) {
        this._base.value = _value;

        this.updateLayout();
    }


    getBigValue() {

        return BigInt(this.value);
    }


    setBigValue(_value) {

        this.value =
            Number(_value);
    }



    getGroupValue(_group) {

        const mask =
            ((1n << BigInt(_group.bits)) - 1n)
            << BigInt(_group.offset);


        return Number(
            (this.getBigValue() & mask)
            >> BigInt(_group.offset)
        );
    }



    setGroupValue(_group, _value) {

        let current =
            this.getBigValue();


        let mask =
            ((1n << BigInt(_group.bits)) - 1n)
            << BigInt(_group.offset);


        current &= ~mask;


        current |=
            (BigInt(_value) << BigInt(_group.offset))
            & mask;


        this.setBigValue(current);

        this.updateLayout();
    }



    isSingleBitMode() {

        return this.groups.length > 0
            && this.groups.every(
                g => g.bits === 1
            );
    }

    // bits "travados" (não podem ser alterados pelo usuário no modal) —
    // ex.: o slot do char_part_num do typeid no position_mask do Part
    setLockedBits(_bits) {
        this._lockedBits =
            Array.isArray(_bits) ? _bits.slice() : [];
    }

    isBitLocked(_bitIndex) {
        return this._lockedBits.indexOf(_bitIndex) !== -1;
    }

    getLockedMask() {
        return this._lockedBits.reduce((mask, b) => mask | (2 ** b), 0);
    }

    // listeners do label pang/cash: vários campos podem registrar no MESMO
    // flag_shop.type.is_cash (ex.: shop.price e os arrays de preço) — todos
    // disparados
    addPangCashListener(_fn) {
        if (_fn && _fn.constructor === Function)
            this._pangListeners.push(_fn);
    }



    getGroupBits(_group) {

        let value =
            this.getGroupValue(_group);


        let result = [];


        for(let i = 0; i < _group.bits; i++) {

            result.push({
                name:
                    _group.bits == 1
                    ? _group.name
                    : `${_group.name} bit ${i}`,

                index: i,

                enabled:
                    (value & (1 << i)) !== 0
            });
        }


        return result;
    }

    getConditionWarnings(_value) {

        if (!this.condition_warning || this.condition_warning.length === 0)
            return [];

        const origValue = this._base.value;

        if (_value !== undefined) {
            this._base.value = _value;
        }

        const result = this.condition_warning.filter(
            cw => typeof cw.condition === 'function' && cw.condition(this)
        );

        this._base.value = origValue;

        return result;
    }

    updateLayout() {

        if (this._bitfieldValueSpan) {

            this._bitfieldValueSpan.textContent =
                "0x" +
                this.value
                .toString(16);
        }

        if (this._bitfieldGroupRows) {

            this._bitfieldGroupRows.forEach((row, group) => {

                row.textContent =
                    `${group.name}: ${this.getGroupValue(group)}`;

            });

        }

        if (this._bitfieldGroupChecks) {

            this._bitfieldGroupChecks.forEach((check, group) => {

                check.checked =
                    this.getGroupValue(group) === 1;

            });

        }

        if (this._bitfieldValueSpan && this._bitfieldValueSpan.parentElement)
            this._bitfieldValueSpan.parentElement.dispatchEvent(new Event('change', { bubbles: true }));

        for (const fn of (this._pangListeners || []))
            fn(this.value, this.value);
    }

    openModal(_groups) {

        let groups = _groups;

        const globalMode =
            groups.length === 0
            || groups.length === this.groups.length;

        if (globalMode && groups.length === 0) {

            groups = [{
                name: this.name || "Value",
                bits: this.totalBits,
                offset: 0
            }];

        }

        new BitfieldModal(this, groups, globalMode).show();
    }

    layout(_parent, _name = this.name) {


        let container =
            document.createElement("div");


        container.className =
            "bitfield-layout";


        if (_name) {
            let title =
                document.createElement("span");

            title.className =
                "bitfield-title";

            title.textContent =
                _name;

            container.appendChild(title);
        }


        let value =
            document.createElement("span");


        value.className =
            "bitfield-value";


        value.textContent =
            "0x" +
            this.value
            .toString(16);



        container.appendChild(value);

        this._bitfieldValueSpan = value;

        this._bitfieldGroupRows = new Map();

        this._bitfieldGroupChecks = new Map();



        if (this.groups.length > 0) {

            container.className =
                "bitfield-layout";

            const editBtn =
                document.createElement("button");

            editBtn.type = "button";
            editBtn.className = "bitfield-edit-btn";
            editBtn.title = "Editar bitfield";
            editBtn.appendChild(bitfieldEditIcon());

            editBtn.addEventListener("click", evt => {
                this.openModal(
                    this.groups
                );
            });

            container.appendChild(editBtn);

        }



        _parent.appendChild(container);
    }
}

function buildToggleSwitch(_opts) {
    const name = (_opts.name || '').trim();
    const pos = (_opts.posText || name || 'ON').trim();
    const neg = (_opts.negText || '').trim();
    const state = !!_opts.stateText;

    const root = document.createElement('label');
    root.className = 'iff-toggle' + (state ? ' iff-toggle--state' : '');

    const input = document.createElement('input');
    input.type = 'checkbox';
    if (_opts.inputClass)
        input.className = _opts.inputClass;
    input.checked = !!_opts.checked;
    if (_opts.disabled)
        input.disabled = true;

    const track = document.createElement('span');
    track.className = 'iff-track';

    const face = document.createElement('span');
    face.className = 'iff-face';

    if (state) {
        const labelNeg = document.createElement('span');
        labelNeg.className = 'iff-label iff-label--neg';
        labelNeg.textContent = neg || 'OFF';
        face.appendChild(labelNeg);

        const labelPos = document.createElement('span');
        labelPos.className = 'iff-label iff-label--pos';
        labelPos.textContent = pos;
        face.appendChild(labelPos);
    } else {
        const label = document.createElement('span');
        label.className = 'iff-label iff-label--name';
        label.textContent = pos;
        face.appendChild(label);
    }

    track.appendChild(face);

    const gutter = document.createElement('span');
    gutter.className = 'iff-gutter';

    const knob = document.createElement('span');
    knob.className = 'iff-knob';
    gutter.appendChild(knob);

    track.appendChild(gutter);

    root.appendChild(input);
    root.appendChild(track);

    if (_opts.onChange && _opts.onChange.constructor === Function) {
        input.addEventListener('change', evt => _opts.onChange(evt, input));
    }

    return { root, input };
}

// ---- selects via Choices.js: o <select> nativo continua sendo a fonte da
// verdade (handlers/leituras seguem nele) e o widget é a UI. O widget é
// recriado a cada re-render (destroy + rebuild) ----

function fitDropdown(_select, _pre) {
    const inst = _select && _select._choicesInst;

    if (!inst || !inst.containerOuter || !inst.dropdown)
        return;

    const outerEl = inst.containerOuter.element;
    const dropdownEl = inst.dropdown.element;

    if (!outerEl || !dropdownEl)
        return;

    // _pre = pré-fit no mousedown (dropdown fechado): aplica o cap ANTES do
    // showDropdown, evitando o estado intermediário sem cap. Com dropdown
    // fechado não há layout; usa a medição do makeChoices e deixa o cap da
    // lista interna para o show reaplicar.

    // a lista interna (.choices__list) é o elemento com scroll; sem cap nela,
    // o max-height do box corta a lista e a barra de rolagem — respeita o
    // cap do vendor (300px) e o espaço disponível
    const innerList = dropdownEl.querySelector('.choices__list');

    let parent = outerEl.parentElement;

    while (parent && parent !== document.body) {
        const style = getComputedStyle(parent);

        if (style.overflowY === 'auto' || style.overflowY === 'scroll')
            break;

        parent = parent.parentElement;
    }

    const outerRect = outerEl.getBoundingClientRect();
    const parentRect = (parent && parent !== document.body)
        ? parent.getBoundingClientRect()
        : { top: 0, bottom: window.innerHeight };

    // o espaço é a PARTE VISÍVEL do pai (a vista), não a rolagem: o widget
    // pode estar fora da vista, e o scroll do pai reaplica o fit ao rolar.
    const spaceBelow = Math.max(0, parentRect.bottom - Math.max(outerRect.bottom, parentRect.top) - 8);
    const spaceAbove = Math.max(0, Math.min(outerRect.top, parentRect.bottom) - parentRect.top - 8);
    const border = parseFloat(getComputedStyle(dropdownEl).borderTopWidth || '0')
        + parseFloat(getComputedStyle(dropdownEl).borderBottomWidth || '0');

    // o input de busca (searchEnabled) consome altura do box — desconta da
    // lista interna para o fim não ficar cortado pelo max-height do box
    const searchInput = dropdownEl.querySelector('.choices__input');
    const searchH = (_pre || !searchInput) ? 0 : searchInput.offsetHeight;

    // aplica o cap no box e na lista interna (300 = cap do vendor)
    const setCap = (el, h) => {
        if (!el)
            return;

        el.style.maxHeight = h + 'px';
    };

    const capFor = h => Math.max(100, Math.min(300, h - border - searchH));

    // o flip é decidido AQUI (espaço no pai); o Choices v11 também flippa
    // sozinho no showDropdown pela classe `is-flipped` no CONTAINER (o CSS
    // do vendor reage a ela). Controlamos a classe do container + a do box
    // para não divergir do fit.
    if (spaceBelow < 120 && spaceAbove > spaceBelow) {
        dropdownEl.classList.add('is-flipped');
        inst.containerOuter.element.classList.add('is-flipped');
        setCap(dropdownEl, Math.max(100, spaceAbove));
        if (!_pre)
            setCap(innerList, capFor(spaceAbove));
    } else {
        dropdownEl.classList.remove('is-flipped');
        inst.containerOuter.element.classList.remove('is-flipped');
        setCap(dropdownEl, Math.max(100, spaceBelow));
        if (!_pre)
            setCap(innerList, capFor(spaceBelow));
    }

    // largura: o dropdown (max-content) não pode passar do pai com overflow
    // (o pai tem prioridade, senão gera scroll horizontal). Mede o maior
    // item e capa pelo espaço disponível no pai.
    // MEDE SEM O CAP ANTERIOR: o max-width inline da abertura passada
    // permanece (o Choices não o limpa); com scrollbar clássica a lista
    // consome largura e o scrollWidth reflete a largura já capada — feedback
    // negativo que encolhe o dropdown a cada abertura. Remove antes de medir.
    dropdownEl.style.maxWidth = '';

    const ddStyle = getComputedStyle(dropdownEl);
    const ddPadding = parseFloat(ddStyle.paddingLeft || '0') + parseFloat(ddStyle.paddingRight || '0');
    const ddBorder = parseFloat(ddStyle.borderLeftWidth || '0') + parseFloat(ddStyle.borderRightWidth || '0');
    const ddMaxW = (!_pre && innerList)
        ? Math.ceil(Math.max(...[...innerList.children].map(ch => ch.scrollWidth)) + ddPadding + ddBorder)
        : Math.max(300, _select._choicesMeasuredW || 300);

    const availW = (parent && parent !== document.body)
        ? parent.clientWidth - Math.max(0, outerRect.left - parentRect.left)
        : window.innerWidth - outerRect.left - 16;

    // cap pelo ANCESTRAL de bloco (fieldset/coluna do filtro, painel de info):
    // o dropdown não pode passar da borda direita do fieldset que contém o
    // campo (mesmo cap do campo fechado em capWidthFor), senão gera overflow
    // interno (ex.: f-card-efeito com opções longas ultrapassava o fg-card).
    let blkCap = Infinity;

    for (let el = outerEl.parentElement; el; el = el.parentElement) {

        const cs = getComputedStyle(el);

        if (!cs.display)
            continue;

        if (cs.display.indexOf('inline') === 0)
            continue;

        if (el.clientWidth > 0) {

            const elRect = outerEl.getBoundingClientRect();
            const pr = el.getBoundingClientRect();

            blkCap = Math.max(0, el.clientWidth - Math.max(0, elRect.left - pr.left));
            break;
        }

        break;
    }

    // o dropdown nunca fica mais estreito que o próprio campo (width:100%
    // do widget). Piso = largura do campo; o cap só vale acima dela.
    const outerW = Math.ceil(outerRect.width);
    const cappedW = Math.max(Math.min(ddMaxW, Math.max(0, availW), blkCap), outerW);

    dropdownEl.style.minWidth = outerW + 'px';
    dropdownEl.style.maxWidth = cappedW + 'px';
}

function highlightSelectedInDropdown(_select) {
    const inst = _select && _select._choicesInst;

    if (!inst || !inst.dropdown || !inst.dropdown.element)
        return;

    const items = inst.dropdown.element.querySelectorAll('.choices__item--selectable');
    let highlightedEl = null;

    // o data-value é ambíguo quando a mesma option existe em vários optgroups
    // (ex.: efeito 12 no f-card-efeito); usa o MESMO índice da option
    // selecionada no <select> (ordem mantida por shouldSort:false)
    const idx = _select.selectedIndex;

    items.forEach((el, i) => {
        const isSel = (i === idx);

        el.classList.toggle('is-highlighted', isSel);
        el.setAttribute('aria-selected', isSel ? 'true' : 'false');

        if (isSel)
            highlightedEl = el;
    });

    if (highlightedEl) {

        // rola a LISTA interna (scrollable) até a opção selecionada — o
        // scrollIntoView rola o painel, não a lista, e a opção saía de vista
        const list = highlightedEl.parentElement;

        if (list && list.clientHeight > 0 && list.scrollHeight > list.clientHeight) {
            const top = highlightedEl.offsetTop;
            const bottom = top + highlightedEl.offsetHeight;

            if (top < list.scrollTop)
                list.scrollTop = top;
            else if (bottom > list.scrollTop + list.clientHeight)
                list.scrollTop = bottom - list.clientHeight;
        }
    }
}

var _gChoicesKbTargets = null;

function _ensureGlobalKeyboardIntercept() {
    if (_gChoicesKbTargets)
        return;

    _gChoicesKbTargets = [];

    document.addEventListener('keydown', function(evt) {
        var targets = _gChoicesKbTargets;

        for (var i = 0; i < targets.length; i++) {
            var entry = targets[i];
            var inst = entry._choicesInst;

            if (!inst || !inst.dropdown || inst.dropdown.isActive)
                continue;

            if (!inst.containerOuter || !inst.containerOuter.element)
                continue;

            if (!inst.containerOuter.element.contains(evt.target))
                continue;

            if (evt.key === 'ArrowDown' || evt.key === 'ArrowUp' ||
                evt.key === 'ArrowRight' || evt.key === 'ArrowLeft') {
                evt.preventDefault();
                evt.stopPropagation();
                evt.stopImmediatePropagation();

                var sel = entry;
                var options = [...sel.options].filter(function(o) { return !o.disabled; });

                if (options.length <= 1)
                    return;

                var currentIdx = sel.selectedIndex;
                var newIdx = currentIdx;

                if (evt.key === 'ArrowDown' || evt.key === 'ArrowRight') {
                    if (currentIdx < sel.options.length - 1)
                        newIdx = currentIdx + 1;
                } else {
                    if (currentIdx > 0)
                        newIdx = currentIdx - 1;
                }

                if (newIdx !== currentIdx) {
                    sel.selectedIndex = newIdx;
                    inst.setChoiceByValue(sel.value);
                    sel.dispatchEvent(new Event('change', { bubbles: true }));

                    if (typeof syncIffWrapWarning === 'function' && sel.id === 'iff-sel')
                        syncIffWrapWarning();
                }

                break;
            }
        }
    }, true);
}

function _registerChoicesKeyboardTarget(_select, _inst) {
    _ensureGlobalKeyboardIntercept();

    // poda selects desanexados: saem do DOM a cada item/iff, mas ficavam no
    // array — o handler de keydown de O(n) e as instâncias mortas vazavam
    for (let i = _gChoicesKbTargets.length - 1; i >= 0; i--) {

        const sel = _gChoicesKbTargets[i];

        if (!sel.isConnected || !sel._choicesInst)
            _gChoicesKbTargets.splice(i, 1);
    }

    if (_gChoicesKbTargets.indexOf(_select) < 0)
        _gChoicesKbTargets.push(_select);
}

// reaplica o fitDropdown quando o pai com overflow rola com o dropdown
// aberto: ao rolar o painel o widget se move e o cap fixo deixaria o dropdown
// passar da borda da vista. Listener global de scroll (capture) re-fita os
// dropdowns abertos.
const _gChoicesScrollFit = [];
let _gChoicesScrollFitHandler = null;

function _ensureGlobalScrollFit() {
    if (_gChoicesScrollFitHandler)
        return;

    _gChoicesScrollFitHandler = () => {
        for (let i = 0; i < _gChoicesScrollFit.length; i++) {
            const sel = _gChoicesScrollFit[i];
            const inst = sel && sel._choicesInst;

            if (!inst || !inst.containerOuter)
                continue;

            if (!inst.containerOuter.element.classList.contains('is-open'))
                continue;

            fitDropdown(sel);
        }
    };

    document.addEventListener('scroll', _gChoicesScrollFitHandler, true);
}

function _registerChoicesScrollFit(_select) {
    if (_gChoicesScrollFit.indexOf(_select) < 0)
        _gChoicesScrollFit.push(_select);

    _ensureGlobalScrollFit();
}

function _unregisterChoicesScrollFit(_select) {
    const i = _gChoicesScrollFit.indexOf(_select);

    if (i >= 0)
        _gChoicesScrollFit.splice(i, 1);
}

// o v11 foca o input de busca DEPOIS de mostrar o dropdown (sem cap) — o
// focus rola o pai e o widget some. Guarda o scroll dos ancestrais no
// mousedown e restaura no showDropdown (o fit reaplica por cima).
function _rememberChoicesScroll(_select) {
    const ch = _select.closest('.choices');
    const scrolls = [];

    if (ch) {
        let p = ch.parentElement;
        while (p && p !== document.body) {
            const oy = getComputedStyle(p).overflowY;

            if (oy === 'auto' || oy === 'scroll')
                scrolls.push({ el: p, top: p.scrollTop, left: p.scrollLeft });

            p = p.parentElement;
        }
    }

    _select._gChoicesScrollRemember = scrolls;
}

function _restoreChoicesScroll(_select) {
    const remember = _select._gChoicesScrollRemember;

    if (!remember || !remember.length)
        return;

    for (const r of remember) {
        if (r.el.scrollTop !== r.top || r.el.scrollLeft !== r.left) {
            r.el.scrollTop = r.top;
            r.el.scrollLeft = r.left;
        }
    }
}

function makeChoices(_select, _opts) {

    if (!_select || typeof Choices === 'undefined' || Choices.isTestStub)
        return null;

    try {
        const inst =
            new Choices(_select, Object.assign({
                allowHTML: false,
                searchEnabled: false,
                itemSelectText: '',
                // não reordenar: o Choices v11 ordena por padrão (localeCompare)
                shouldSort: false,
            }, _opts || {}));

        _select._choicesInst = inst;

        // sincroniza o widget com o valor nativo (inclui opção crua fora do
        // enum). Sem isso o Choices exibia a 1ª opção em vez do valor real.
        if (_select.value !== undefined && _select.value !== '')
            setSelectValue(_select, _select.value);

        // navegação via setas sem abrir (registrado uma vez no document)
        _registerChoicesKeyboardTarget(_select, inst);

        // mede a maior opção e fixa a largura do campo fechado (exceto #iff-sel,
        // que ocupa o espaço disponível do wrap — sem sobrar vazio)
        requestAnimationFrame(() => {
            if (_select.id === 'iff-sel')
                return;

            // o Choices v11 move o <select> para dentro do .choices — usamos
            // closest para achá-lo
            const choicesEl = _select.closest('.choices') || _select.parentElement;
            if (!choicesEl)
                return;

            const innerEl = choicesEl.classList.contains('choices__inner')
                ? choicesEl
                : choicesEl.querySelector('.choices__inner');

            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            const style = getComputedStyle(innerEl || choicesEl);
            ctx.font = `${style.fontSize} ${style.fontFamily}`;

            let maxW = 0;
            [..._select.options].forEach(opt => {
                const w = ctx.measureText(opt.textContent || opt.innerText || '').width;
                if (w > maxW) maxW = w;
            });

            // padding + borda + folga da seta
            const padding = parseFloat(style.paddingLeft || '0') + parseFloat(style.paddingRight || '0');
            const border = parseFloat(style.borderLeftWidth || '0') + parseFloat(style.borderRightWidth || '0');
            const extra = 32; // seta do dropdown + folga

            // cap: o campo fechado não excede o container pai (bloco com largura
            // real); ancestrais inline não limitam, sobem até o fieldset/coluna
            // painel colapsado (display:none) não há largura visível — o cap
            // fica pendente e `fitChoicesToParent` reaplica ao expandir
            const measured = Math.ceil(maxW + padding + border + extra);

            _select._choicesMeasuredW = measured;
            choicesEl.style.width = `${Math.min(measured, capWidthFor(choicesEl))}px`;

            setChoicesTruncatedTitles(_select);
        });

        // trocou o item selecionado (campo fechado) — re-mede o truncamento
        // (o item do single pode ter ellipsis com a largura capada pelo pai;
        // o evento roda ANTES do Choices renderizar o item novo, então mede
        // no próximo frame)
        const syncSingleTitle = () => {
            requestAnimationFrame(() => setChoicesTruncatedTitles(_select));
        };

        _select.addEventListener('choice', syncSingleTitle);
        _select.addEventListener('addItem', syncSingleTitle);

        // ajustes ao abrir/fechar dropdown (fit no pai + highlight do item + warnings)
        inst.containerOuter.element.addEventListener('mousedown', () => {
            _rememberChoicesScroll(_select);

            // pré-fit (só com dropdown fechado — opção aberta não re-capa):
            // aplica o cap antes do showDropdown, evitando o estado sem cap
            if (!inst.dropdown.isActive)
                fitDropdown(_select, true);
        });

        _select.addEventListener('showDropdown', () => {
            _registerChoicesScrollFit(_select);
            _restoreChoicesScroll(_select);
            fitDropdown(_select);
            highlightSelectedInDropdown(_select);
            setChoicesTruncatedTitles(_select);

            if (_select.id === 'iff-sel' && typeof syncIffDropdownWarnings === 'function')
                syncIffDropdownWarnings();
        });

        _select.addEventListener('hideDropdown', () => {
            _unregisterChoicesScrollFit(_select);

            const ddEl = inst.dropdown && inst.dropdown.element;

            if (!ddEl)
                return;

            ddEl.style.maxHeight = '';
            ddEl.style.maxWidth = '';
            ddEl.style.minWidth = '';

            const innerList = ddEl.querySelector('.choices__list');

            if (innerList)
                innerList.style.maxHeight = '';
        });

        return inst;
    } catch (e) {
        return null;
    }
}

// tooltip nos itens truncados por ellipsis: mede scrollWidth > clientWidth e
// aplica/remove o title (aplicar sempre deixaria tooltip em itens que cabem)
function setChoicesTruncatedTitles(_select) {
    const inst = _select && _select._choicesInst;

    if (!inst || !inst.containerOuter || !inst.containerOuter.element)
        return;

    const apply = el => {
        if (!el)
            return;

        const txt = (el.textContent || '').trim();
        const truncated = el.scrollWidth > el.clientWidth + 2;

        if (truncated && txt)
            el.setAttribute('title', txt);
        else if (el.hasAttribute('title') && el.getAttribute('title') === txt)
            el.removeAttribute('title');
    };

    // item do campo fechado (single) — pode ter ellipsis com largura capada
    apply(inst.containerOuter.element.querySelector('.choices__list--single .choices__item'));

    // itens do dropdown aberto (renderizados no showDropdown)
    if (inst.dropdown && inst.dropdown.element)
        inst.dropdown.element.querySelectorAll('.choices__item--selectable').forEach(apply);
}

// largura máxima do campo fechado: espaço disponível no PAI de bloco mais
// próximo com largura real. O pai tem prioridade: subtrai a posição do widget
// dentro do pai (ancestrais inline já consomem espaço à esquerda) e as
// margens/paddings à direita. Ancestrais inline não limitam — sobem até o
// fieldset/coluna. Sem ancestral visível (display:none) devolve Infinity
// (reaplicado por `fitChoicesToParent` ao expandir)
function capWidthFor(_choicesEl) {

    // painel de info: o campo tem largura natural; o CSS quebra pra linha de
    // baixo quando não cabe ao lado do label — não capar aqui
    if (_choicesEl.closest && _choicesEl.closest('#div-geral-info'))
        return Infinity;

    for (let el = _choicesEl.parentElement; el; el = el.parentElement) {

        const cs = getComputedStyle(el);

        if (!cs.display)
            continue;

        if (cs.display.indexOf('inline') === 0)
            continue; // inline/inline-flex — cresce com o conteúdo

        if (el.clientWidth > 0) {

            const elRect = _choicesEl.getBoundingClientRect();
            const parentRect = el.getBoundingClientRect();
            const left = Math.max(0, elRect.left - parentRect.left);
            let right = parseFloat(cs.paddingRight) || 0;

            // margens direitas dos ancestrais até o pai (paddingRight do pai já contou)
            for (let a = _choicesEl.parentElement; a && a !== el; a = a.parentElement) {
                const acs = getComputedStyle(a);
                const mr = parseFloat(acs.marginRight) || 0;
                if (mr > 0) right = right + mr;
            }

            return Math.max(0, el.clientWidth - left - right);
        }

        break; // pai oculto (display:none) — sem largura
    }

    return Infinity;
}

// reaplica o cap de largura nos widgets de um container (ex.: painel de
// filtros colapsado no init — chamar ao expandir)
function fitChoicesToParent(_container) {

    if (!_container)
        return;

    _container.querySelectorAll('.choices').forEach(ch => {

        const sel = ch.querySelector('select');

        if (!sel || typeof sel._choicesMeasuredW !== 'number')
            return;

        ch.style.width = `${Math.min(sel._choicesMeasuredW, capWidthFor(ch))}px`;

        setChoicesTruncatedTitles(sel);
    });
}

function destroyChoices(_select) {

    const inst =
        _select && _select._choicesInst;

    if (inst && typeof inst.destroy === 'function') {
        try {
            inst.destroy();
        } catch (e) {}
    }

    if (_select)
        _select._choicesInst = null;
}

// ---- disabled/valor de selects com widget Choices: o <select> nativo segue a
// fonte da verdade, mas o widget esconde ele — setar .disabled no nativo não
// desabilita o widget visualmente. Estes helpers sincronizam os dois (nativo +
// widget via disable()/enable()/setChoiceByValue).

function setSelectDisabled(_select, _disabled) {

    if (!_select)
        return;

    _select.disabled = !!_disabled;

    const inst =
        _select && _select._choicesInst;

    if (!inst)
        return;

    try {
        if (_disabled)
            inst.disable();
        else
            inst.enable();
    } catch (e) {}
}

function setSelectValue(_select, _value) {

    if (!_select)
        return;

    _select.value = String(_value);

    const inst =
        _select && _select._choicesInst;

    if (inst && typeof inst.setChoiceByValue === 'function') {
        try {
            inst.setChoiceByValue(String(_value), true);
        } catch (e) {}
    }
}