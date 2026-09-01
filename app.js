// Arquivo app.js
// Criado em 23/12/2025 as 21:04 por Acrisio

function saveAs(_data, _name) {
    const url = URL.createObjectURL(_data);
    const a = document.createElement('a');
    a.href = url;
    a.download = _name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

async function buildIFFZip(_iffs, _onUpdate, _updateStates = true) {
    const zip = new JSZip();

    // deixa o navegador pintar o overlay antes de começar o trabalho pesado
    await new Promise(resolve => requestAnimationFrame(() => resolve()));

    const total = _iffs.length;

    for (let i = 0; i < total; i++) {
        const _iff = _iffs[i];

        // data do zip: mantém a original se o arquivo não mudou; arquivo
        // modificado ganha a data atual. Se o conteúdo voltou byte-exact ao
        // load original (revertido manualmente), a data original também volta.
        const date = iffHasLoadContentChange(_iff)
            ? (iffHasOriginalContentChange(_iff)
                ? new Date()
                : (_iff.__originalZipDate || new Date(0)))
            : (_iff.__originalZipDate || new Date(0));

        zip.file(_iff.name, _iff.serialize().buffer, { binary: true, date });

        // _updateStates=false: snapshot — não altera os estados dos itens
        if (_updateStates) {
            _iff.elements.forEach(el => {
                if (el.__deleted2) {
                    return;
                }

                if (el.__deleted) {
                    el.__deleted = false;
                    el.__deleted2 = true;
                    return;
                }

                if (el.saveState)
                    el.saveState();
                el.__modified = false;
                el.__new = false;
            });

            _iff.__original_flag_ligacao = _iff.flag_ligacao;

            // baseline atualizada: o que foi salvo vira o novo ponto de comparação
            _iff.__origSerialize = _iff.serialize().data;
        }

        if (_onUpdate)
            _onUpdate({ percent: Math.round(((i + 1) / total) * 100), currentFile: { name: _iff.name } });

        // cede à thread entre os arquivos para o overlay atualizar
        await new Promise(resolve => requestAnimationFrame(() => resolve()));
    }

    return await zip.generateAsync({
        type: 'blob',
        compression: 'DEFLATE',
        compressionOptions: { level: 8 }
    }, _onUpdate);
}

function refreshItemStates() {
    const itemSel = document.getElementById('item-sel');

    [...itemSel.children].forEach(li => {
        const item = li.itemObj;

        if (!item)
            return;

        li.classList.toggle('item-new', !!item.__new);
        li.classList.toggle('item-modified', !!item.__modified);
        li.classList.toggle('item-deleted', !!item.__deleted || !!item.__deleted2);
        li.classList.toggle('item-encoding', getItemEncodingErrors(item).length > 0);
    });

    updateSelectedIFFOption();
}

async function saveIFF(_iffs, _name, _updateStates = true) {
    const onUpdate = showZipProgress(_iffs, 'Baixando arquivos...');

    try {
        const blob = await buildIFFZip(_iffs, onUpdate, _updateStates);

        // fecha o overlay de progresso antes de perguntar (senão ele intercepta
        // os cliques do modal de confirmação)
        hideLoading();

        if (_updateStates)
            refreshItemStates();

        let outBlob = blob;

        if (isTHRegion()) {
            const enc = await new ConfirmModal('O arquivo é da região TH (Tailândia). Deseja encriptar com XTEA ao baixar?').show();
            if (enc)
                outBlob = new Blob([xteaEncryptTH(new Uint8Array(await blob.arrayBuffer()))], { type: blob.type });
        }

        saveAs(outBlob, _name);
    } finally {
        hideLoading();
    }
}

function isTHRegion() {
    return (typeof iffs !== 'undefined' ? iffs : []).some(i => i.__region === 'TH');
}

function showOpenControls() {
    const iffWrap = document.getElementById('iff-sel-wrap');
    if (iffWrap)
        iffWrap.hidden = false;
    document.getElementById('iff-sel').hidden = true;
    document.getElementById('div-flag-ligacao').hidden = false;
    document.getElementById('div-textos-iff').hidden = false;
    document.getElementById('div-save-iff').hidden = false;
    document.getElementById('div-download-iff').hidden = false;
    document.getElementById('div-close-iff').hidden = false;
    document.getElementById('div-open-controls').hidden = false;
    document.getElementById('div-converter-regiao').hidden = false;
    const files = document.getElementById('div-files');
    if (files)
        files.classList.add('has-pack');
}

function hideOpenControls() {
    const iffWrap = document.getElementById('iff-sel-wrap');
    if (iffWrap)
        iffWrap.hidden = true;
    document.getElementById('iff-sel').hidden = true;
    document.getElementById('div-flag-ligacao').hidden = true;
    document.getElementById('div-textos-iff').hidden = true;
    document.getElementById('div-save-iff').hidden = true;
    document.getElementById('div-download-iff').hidden = true;
    document.getElementById('div-close-iff').hidden = true;
    document.getElementById('div-open-controls').hidden = true;
    document.getElementById('div-converter-regiao').hidden = true;
    const files = document.getElementById('div-files');
    if (files)
        files.classList.remove('has-pack');
}

// ---------- arquivos recentes (IndexedDB) ----------

let currentFile = null;
let gGrandPrixTimeFilter = null;

let recentsCollapsed = false;

function idbOpen() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open('jsiffmanager', 4);

        req.onupgradeneeded = () => {
            const db = req.result;

            const createStore = () => {
                const store = db.createObjectStore('recent_files', { keyPath: ['name', 'encoding', 'hash'] });
                store.createIndex('by_saved_at', 'saved_at');
                store.createIndex('by_name_encoding', ['name', 'encoding']);
            };

            if (db.objectStoreNames.contains('recent_files')) {
                const oldData = [];
                const store = req.transaction.objectStore('recent_files');

                store.openCursor().onsuccess = (e) => {
                    const cur = e.target.result;

                    if (cur) {
                        oldData.push(cur.value);
                        cur.continue();
                    } else {
                        db.deleteObjectStore('recent_files');
                        createStore();
                        const newStore = req.transaction.objectStore('recent_files');
                        oldData.forEach(v => newStore.put({
                            name: v.name,
                            encoding: v.encoding || kDefaultCodePage,
                            blob: v.blob,
                            hash: v.hash || '',
                            saved_at: v.saved_at
                        }));
                    }
                };
            } else {
                createStore();
            }
        };

        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

async function idbRequest(_store, _mode, _op) {
    const db = await idbOpen();

    try {
        return await new Promise((resolve, reject) => {
            const tx = db.transaction(_store, _mode);
            const store = tx.objectStore(_store);
            const res = _op(store);

            if (res && typeof res.then === 'function') {
                res.then(resolve).catch(reject);
            } else {
                res.onsuccess = () => resolve(res.result);
                res.onerror = () => reject(res.error);
            }
        });
    } finally {
        db.close();
    }
}

async function computeBlobHash(_blob) {
    const buffer = await _blob.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

function idbPutRecent(_name, _encoding, _blob, _hash, _versao) {
    return idbRequest('recent_files', 'readwrite', store => store.put({
        name: _name,
        encoding: _encoding,
        blob: _blob,
        hash: _hash,
        versao: _versao || null,
        saved_at: Date.now()
    }));
}

// botão do arquivo aberto mostra nome + (região, versão e encoding)
// ex.: pangya_jp.iff (Fresh Up!,JP,983,shift_jis)
function atualizaBotaoArquivoInfo() {

    if (!currentFile)
        return;

    const btn =
        document.getElementById('zipInput').nextElementSibling;

    if (!btn)
        return;

    btn.textContent =
        currentFile.name + ' ' + getVersaoPackTag(currentFile.encoding);

}

function idbGetRecent(_name, _encoding, _hash) {
    return idbRequest('recent_files', 'readonly', store => {
        if (_hash)
            return store.get([_name, _encoding, _hash]);

        const index = store.index('by_name_encoding');
        return new Promise((resolve, reject) => {
            const req = index.getAll([_name, _encoding]);
            req.onsuccess = () => {
                const entries = req.result;
                if (!entries.length) {
                    resolve(null);
                } else {
                    entries.sort((a, b) => b.saved_at - a.saved_at);
                    resolve(entries[0]);
                }
            };
            req.onerror = () => reject(req.error);
        });
    });
}

function idbDeleteRecent(_name, _encoding, _hash) {
    return idbRequest('recent_files', 'readwrite', store => {
        if (_hash)
            return store.delete([_name, _encoding, _hash]);

        const index = store.index('by_name_encoding');
        return new Promise((resolve, reject) => {
            const req = index.getAllKeys([_name, _encoding]);
            req.onsuccess = () => {
                const keys = req.result;
                Promise.all(keys.map(key => {
                    return new Promise((res, rej) => {
                        const delReq = store.delete(key);
                        delReq.onsuccess = () => res();
                        delReq.onerror = () => rej(delReq.error);
                    });
                })).then(resolve).catch(reject);
            };
            req.onerror = () => reject(req.error);
        });
    });
}

// renomear muda a key ['name','encoding','hash']: deleta a antiga e
// recria com o nome novo (mesmo blob/hash/encoding/saved_at)
function idbRenameRecent(_oldName, _encoding, _hash, _newName) {
    return idbRequest('recent_files', 'readwrite', store => {
        const getReq = store.get([_oldName, _encoding, _hash]);
        return new Promise((resolve, reject) => {
            getReq.onsuccess = () => {
                const rec = getReq.result;

                if (!rec) {
                    resolve();
                    return;
                }

                store.delete([_oldName, _encoding, _hash]);

                store.put({
                    name: _newName,
                    encoding: rec.encoding,
                    blob: rec.blob,
                    hash: rec.hash,
                    versao: rec.versao,
                    saved_at: rec.saved_at
                });

                resolve();
            };
            getReq.onerror = () => reject(getReq.error);
        });
    });
}

function idbGetAllRecents() {
    return idbRequest('recent_files', 'readonly', store => store.getAll());
}

// datas dos arquivos dentro do zip (unzipit não expõe a data de cada entrada):
// lê os local file headers do zip, onde ficam a data/hora DOS de cada arquivo
function readZipEntryDates(_arrayBuffer) {
    const dates = {};
    const view = new DataView(_arrayBuffer);
    let offset = 0;

    while (offset + 30 <= view.byteLength) {
        if (view.getUint32(offset, true) !== 0x04034b50)
            break;

        const dosTime = view.getUint16(offset + 10, true);
        const dosDate = view.getUint16(offset + 12, true);
        const nameLen = view.getUint16(offset + 26, true);
        const extraLen = view.getUint16(offset + 28, true);
        const compSize = view.getUint32(offset + 18, true);

        const name = new TextDecoder().decode(new Uint8Array(_arrayBuffer, offset + 30, nameLen));

        dates[name] = dosDateTimeToDate(dosDate, dosTime);

        offset += 30 + nameLen + extraLen + compSize;
    }

    return dates;
}

function dosDateTimeToDate(_date, _time) {
    const year = ((_date >> 9) & 0x7f) + 1980;
    const month = (_date >> 5) & 0x0f;
    const day = _date & 0x1f;
    const hour = (_time >> 11) & 0x1f;
    const minute = (_time >> 5) & 0x3f;
    const second = (_time & 0x1f) * 2;

    // o JSZip converte a data do zip em UTC; usar UTC aqui mantém o
    // round-trip exato independente do fuso horário do navegador
    return new Date(Date.UTC(year, month - 1, day, hour, minute, second));
}

function iffHasOriginalContentChange(_iff) {
    if (_iff.__origSerialize == null)
        return _iff.hasChange();

    const wb = _iff.serialize();

    if (wb.length !== _iff.__origSerialize.length)
        return true;

    const now = wb.data;
    const orig = _iff.__origSerialize;

    for (let i = 0; i < now.length; i++)
        if (now[i] !== orig[i])
            return true;

    return false;
}

// compara o serialize atual com o conteúdo do load ORIGINAL (não com o do
// último save): se voltou byte-exact ao original, o arquivo não "mudou"
function iffHasLoadContentChange(_iff) {
    if (_iff.__loadSerialize == null)
        return iffHasOriginalContentChange(_iff);

    const wb = _iff.serialize();

    if (wb.length !== _iff.__loadSerialize.length)
        return true;

    const now = wb.data;
    const orig = _iff.__loadSerialize;

    for (let i = 0; i < now.length; i++)
        if (now[i] !== orig[i])
            return true;

    return false;
}

// serializa um item isolado e compara com os bytes originais guardados no load
// (__original, mantido pelo saveState no load e no save); se baterem byte a byte,
// o item foi restaurado manualmente e não está modificado
function itemMatchesOriginalBytes(_item) {
    if (!_item.__original || typeof _item.serialize !== 'function' || typeof _item.getSize !== 'function')
        return false;

    const wb = new WriterBuffer(_item.getSize());

    _item.serialize(wb);

    const now = wb.data;
    const orig = _item.__original;

    if (now.length !== orig.length)
        return false;

    for (let i = 0; i < now.length; i++)
        if (now[i] !== orig[i])
            return false;

    return true;
}

function hasOriginalContentChange() {
    return iffs.some(iff => iffHasOriginalContentChange(iff));
}

async function saveToBrowser() {
    if (!currentFile)
        return;

    if (!hasOriginalContentChange() && currentFile.originalBlob && currentFile.encoding === currentFile.originalEncoding) {
        const hash = await computeBlobHash(currentFile.originalBlob);

        await idbPutRecent(currentFile.name, currentFile.encoding, currentFile.originalBlob, hash, getVersaoPackLabel());

        currentFile.hash = hash;

        refreshItemStates();

        await renderRecentFiles();

        return;
    }

    // tudo voltou byte-exact ao load original: salva o blob original direto
    // (conteúdo + data + zip), mantendo o mesmo hash da abertura.
    if (currentFile.loadBlob && iffs.every(iff => !iffHasLoadContentChange(iff))) {
        const hash = await computeBlobHash(currentFile.loadBlob);

        await idbPutRecent(currentFile.name, currentFile.encoding, currentFile.loadBlob, hash, getVersaoPackLabel());

        currentFile.hash = hash;
        currentFile.originalBlob = currentFile.loadBlob;

        // snapshot de todos os itens: estado atual == load original
        iffs.forEach(iff => {
            iff.elements.forEach(el => {
                if (el.saveState)
                    el.saveState();
                el.__modified = false;
                el.__new = false;
            });

            iff.__origSerialize = iff.serialize().data;
        });

        refreshItemStates();

        await renderRecentFiles();

        return;
    }

    const onUpdate = showZipProgress(iffs, 'Salvando arquivos...');

    try {
        const blob = await buildIFFZip(iffs, onUpdate);

        const hash = await computeBlobHash(blob);

        await idbPutRecent(currentFile.name, currentFile.encoding, blob, hash, getVersaoPackLabel());

        currentFile.hash = hash;

        // o blob salvo vira o novo original (comparação/hash de referência)
        currentFile.originalBlob = blob;
        currentFile.originalEncoding = currentFile.encoding;

        refreshItemStates();

        await renderRecentFiles();
    } finally {
        hideLoading();
    }
}

async function autoSaveToBrowser() {
    if (!currentFile || !currentFile.originalBlob)
        return;

    const hash = await computeBlobHash(currentFile.originalBlob);

    await idbPutRecent(currentFile.name, currentFile.encoding, currentFile.originalBlob, hash, getVersaoPackLabel());

    currentFile.hash = hash;

    await renderRecentFiles();
}

async function openRecentFile(_name, _encoding, _hash) {
    const rec = await idbGetRecent(_name, _encoding, _hash);

    if (!rec)
        return;

    if (iffs.some(iff => iff.hasChange())) {
        const shouldSave = await new ConfirmModal('O arquivo atual tem modificações. Deseja salvar antes de abrir?').show();

        if (shouldSave) {
            await saveToBrowser();
        }
    }

    const recOpen = _hash ? await idbGetRecent(_name, _encoding, _hash) : rec;

    if (!recOpen)
        return;

    currentFile = { name: recOpen.name, encoding: recOpen.encoding, hash: recOpen.hash || null, originalBlob: recOpen.blob, originalEncoding: recOpen.encoding, loadBlob: recOpen.blob };

    kCodePage.load = kCodePage.upload = recOpen.encoding;

    document.getElementById('zipInput').nextElementSibling.textContent = recOpen.name;

    await loadIFFZip(await recOpen.blob.arrayBuffer(), true);

    atualizaBotaoArquivoInfo();
}

async function downloadRecentFile(_name, _encoding, _hash) {
    const rec = await idbGetRecent(_name, _encoding, _hash);

    if (!rec)
        return;

    let blob = rec.blob;

    const ab = new Uint8Array(await blob.arrayBuffer());

    const isZip = isZipMagic(ab);

    // região TH (Tailândia): o recente pode estar guardado encriptado (XTEA) ou
    // como zip; pergunta sempre e entrega o formato escolhido pelo usuário
    if ((rec.versao && rec.versao.includes('Tailândia')) || !isZip) {
        const enc = await new ConfirmModal('O arquivo é da região TH (Tailândia). Deseja encriptar com XTEA ao baixar?').show();

        if (enc) {
            if (isZip)
                blob = new Blob([xteaEncryptTH(ab)], { type: blob.type });
        } else {
            if (!isZip)
                blob = new Blob([xteaDecryptTH(ab)], { type: blob.type });
        }
    }

    saveAs(blob, rec.name);
}

async function renderRecentFiles() {
    const list = document.getElementById('recent-files');

    let recents;

    try {
        recents = await idbGetAllRecents();
    } catch (_e) {
        return;
    }

    recents.sort((a, b) => b.saved_at - a.saved_at);

    const hasRecents = recents.length > 0;

    document.getElementById('div-recents-toggle').hidden = !hasRecents;

    list.hidden = !hasRecents || recentsCollapsed;

    if (hasRecents)
        document.getElementById('btn-toggle-recents').textContent = (recentsCollapsed ? '▾' : '▴') + ' Recentes';

    list.innerHTML = '';

    recents.forEach(rec => {
        const li = document.createElement('li');
        li.className = 'recent-file';

        const openBtn = document.createElement('button');
        openBtn.type = 'button';
        openBtn.className = 'recent-open';
        openBtn.title = 'Abrir no navegador';
        openBtn.textContent = rec.name + ' (' + (rec.versao ? rec.versao + ',' : '') + rec.encoding + ')' + (rec.hash ? ' ' + rec.hash.slice(0, 8) : '');

        openBtn.addEventListener('click', async () => {
            try {
                await openRecentFile(rec.name, rec.encoding, rec.hash);
            } catch (e) {
                console.error('erro ao abrir recente:', e);
            }
        });

        const editBtn = document.createElement('button');
        editBtn.type = 'button';
        editBtn.className = 'recent-edit';
        editBtn.title = 'Renomear';
        editBtn.textContent = '✎';

        editBtn.addEventListener('click', async () => {
            const newName = await new PromptModal('Novo nome do arquivo:', rec.name).show();

            if (newName === null || newName === '')
                return;

            if (newName === rec.name)
                return;

            try {
                await idbRenameRecent(rec.name, rec.encoding, rec.hash, newName);
                await renderRecentFiles();
            } catch (e) {
                console.error('erro ao renomear recente:', e);
            }
        });

        const dlBtn = document.createElement('button');
        dlBtn.type = 'button';
        dlBtn.className = 'recent-dl';
        dlBtn.title = 'Baixar para o computador';
        dlBtn.textContent = '⇩';

        dlBtn.addEventListener('click', async () => {
            try {
                await downloadRecentFile(rec.name, rec.encoding, rec.hash);
            } catch (e) {
                console.error('erro ao baixar recente:', e);
            }
        });

        const delBtn = document.createElement('button');
        delBtn.type = 'button';
        delBtn.className = 'recent-del';
        delBtn.title = 'Remover da lista';
        delBtn.textContent = '×';

        delBtn.addEventListener('click', async () => {
            try {
                await idbDeleteRecent(rec.name, rec.encoding, rec.hash);
                await renderRecentFiles();
            } catch (e) {
                console.error('erro ao remover recente:', e);
            }
        });

        li.appendChild(openBtn);
        li.appendChild(editBtn);
        li.appendChild(dlBtn);
        li.appendChild(delBtn);
        list.appendChild(li);
    });
}

async function loadIFFZip(_arrayBuffer, _skipRegionModal = false) {
    // Região TH vem encriptada com XTEA; descriptografa antes de abrir o zip.
    gLoadedTH = false;
    let buf = _arrayBuffer;
    const headU8 = new Uint8Array(_arrayBuffer, 0, Math.min(4, _arrayBuffer.byteLength));
    if (!isZipMagic(headU8)) {
        buf = xteaDecryptTH(new Uint8Array(_arrayBuffer)).buffer;
        gLoadedTH = true;
    }

    const { entries } = await unzipit.unzip(buf);

    console.log('Arquivos no ZIP:', Object.keys(entries));

    iffs = [];

    resetStringEncodingCache();

    showLoading();

    await new Promise(resolve => requestAnimationFrame(() => resolve()));

    const entryDates = readZipEntryDates(buf);

    try {
        for (const [filename, zipEntry] of Object.entries(entries)) {
            const fileDiv = addLoadingFile(filename);

            await new Promise(resolve => requestAnimationFrame(() => resolve()));

            const ab = await zipEntry.arrayBuffer();
            const content = ReaderBuffer.from(ab);
            console.log(`Conteúdo de ${filename}:`, content);
            const iff = new IFF(filename);
            iff.element_constructor = getConstructorByName(filename);
            iff.length = content.length;
            iff.__rawArrayBuffer = ab;
            await iff.unserializeAsync(content, (count, total) => {
                updateLoadingCount(fileDiv, count, total);
            });
            iff.__origSerialize = iff.serialize().data;

            // conteúdo do load original (não muda no save): usado para
            // reconhecer quando o usuário reverte tudo manualmente — o save
            // volta byte-exact ao original (hash igual)
            iff.__loadSerialize = iff.__origSerialize;

            // data do arquivo dentro do zip original (usada no save se não mudar)
            iff.__originalZipDate = entryDates[filename] || null;

            iff.__encodingErrors = [];

            iff.elements.forEach(item => {
                const errs = getItemEncodingErrors(item);

                if (errs.length)
                    iff.__encodingErrors.push({ item, errors: errs });
            });

            iff.__hasEncodingError = iff.__encodingErrors.length > 0;

            if (iff.__hasEncodingError)
                fileDiv.classList.add('loading-file-warning');

            if (iff.count_element === 0)
                updateLoadingNoItems(fileDiv);
            iffs.push(iff);
            if (!iff.element_constructor)
                console.log(iff);
        }
    } finally {
        hideLoading();
    }

    // US 852 e KR 839 são quase idênticos e a detecção automática não os
    // distingue — pergunta ao usuário quando um deles é aplicado. Abrir de
    // recentes (_skipRegionModal) resolve a região deduzida sem abrir o modal.
    await resolveRegionAfterLoad(_skipRegionModal);

    makeIffSelection();
    showOpenControls();

    const encWarnIffs =
        iffs.filter(iff => iff.__hasEncodingError);

    if (encWarnIffs.length > 0)
        new EncodingErrorsModal(encWarnIffs).show();

    console.log('carregar terminou');
}

// dedução de região pelo tamanho do Mascot (KR=280 / US=284) quando presente
// no pacote; falha (null) se não houver Mascot para comparar ou for ambíguo
function deduceRegionFromSizes() {

    const m =
        iffs.find(iff => iff.name === 'Mascot.iff');

    if (!m || !m.count_element)
        return null;

    const es =
        (m.length - 8) / m.count_element;

    if (es === 280)
        return 'KR';

    if (es === 284)
        return 'US';

    return null;
}

// seletor manual de região ao abrir: US 852 e KR 839 só diferem no Mascot
// (tamanho), então a detecção não os distingue — pergunta quando um é
// aplicado (variante US detectada por tamanho). A dedução pelo Mascot vira
// o default, mas o usuário pode sobrepor (outras regiões podem ser
// indetectáveis, ou o pacote não traz o Mascot para comparar).
async function resolveRegionAfterLoad(_skipModal = false) {

    // TH encriptado (XTEA): o tamanho dos iffs é idêntico à US, a única pista é
    // a criptografia (gLoadedTH) — força a região TH em todos os iffs sem modal.
    if (gLoadedTH) {
        for (const iff of iffs)
            applyRegionToIff(iff, 'TH');
        return;
    }

    // KR é definitivo: Mascot.iff com 280 bytes (deduceRegionFromSizes devolve
    // 'KR' nesse caso). Aplica a região a todos os iffs — sem modal quando abre
    // de recentes (_skipModal), com modal de confirmação no upload normal.
    if (deduceRegionFromSizes() === 'KR') {
        if (_skipModal) {
            for (const iff of iffs)
                if (iff.__region !== 'KR')
                    applyRegionToIff(iff, 'KR');
        } else {
            const escolhida = await new RegionSelectorModal('KR', ['JP', 'US', 'KR', 'TH']).show();
            if (escolhida == null)
                return;
            for (const iff of iffs)
                applyRegionToIff(iff, escolhida);
        }
        return;
    }

    // TH desencriptado (zip): todos os iffs batem com US, EXCETO o Skin.iff
    // (TH=232, US/KR=220, JP=244). Usa o tamanho do Skin para distinguir a
    // região TH mesmo sem a criptografia.
    const skin =
        iffs.find(iff => iff.name === 'Skin.iff');

    const skinES =
        skin && skin.count_element
            ? (skin.length - 8) / skin.count_element
            : null;

    if (skinES === 232) {
        if (_skipModal) {
            for (const iff of iffs)
                if (iff.__region !== 'TH')
                    applyRegionToIff(iff, 'TH');
        } else {
            const escolhida = await new RegionSelectorModal('TH', ['JP', 'US', 'KR', 'TH']).show();
            if (escolhida == null)
                return;
            for (const iff of iffs)
                applyRegionToIff(iff, escolhida);
        }
        return;
    }

    // 284 bytes (ou sem Mascot): pode ser JP ou US — não confundir JP(284)
    // com US(284). US é detectado pela variante aplicada em algum iff que não
    // o Mascot (arquivo em tamanho US); JP não aplica variante nenhuma.
    const temUS =
        iffs.some(iff => iff.name !== 'Mascot.iff' && iff.__region === 'US');

    if (!temUS)
        return;

    if (_skipModal) {
        for (const iff of iffs)
            if (iff.__region !== 'US')
                applyRegionToIff(iff, 'US');
    } else {
        const escolhida = await new RegionSelectorModal('US', ['JP', 'US', 'KR', 'TH']).show();
        if (escolhida == null)
            return;
        for (const iff of iffs)
            applyRegionToIff(iff, escolhida);
    }
}

// re-aplica uma região a um iff: troca o construtor (variante ou padrão JP) e
// re-serializa a partir dos bytes crus do zip; US e KR compartilham o mesmo
// construtor, então a troca é segura e só muda o rótulo/região
function applyRegionToIff(_iff, _regiao) {

    const variants =
        kIffRegionVariants[_iff.name];

    let ctor;

    if (_regiao === 'JP' || !variants)
        ctor = getConstructorByName(_iff.name);
    else {
        const v =
            variants.find(x => x.region === _regiao);

        ctor = v ? v.ctor : getConstructorByName(_iff.name);
    }

    _iff.element_constructor =
        ctor;

    gRegionApply =
        _regiao;

    _iff.unserialize(ReaderBuffer.from(_iff.__rawArrayBuffer));

    gRegionApply =
        null;

    _iff.__region =
        _regiao;

    _iff.__regionCtor =
        ctor;

    _iff.__encodingErrors =
        [];

    _iff.elements.forEach(item => {

        const errs =
            getItemEncodingErrors(item);

        if (errs.length)
            _iff.__encodingErrors.push({ item, errors: errs });
    });

    _iff.__hasEncodingError =
        _iff.__encodingErrors.length > 0;
}

function iffOptionLabel(_iff) {
    return (_iff.__hasEncodingError ? '⚠ ' : '') + _iff.name + (_iff.hasChange() ? ' *' : '');
}

function getItemEncodingErrors(_item) {
    // cache versionado: se o usuário editou algum texto (marcador removido ou
    // trocado), o aviso precisa ser recalculado na hora
    if (_item.__encodingErrors === undefined || _item.__encodingVersion !== gStringEditVersion) {
        _item.__encodingErrors = getElementEncodingErrors(_item);
        _item.__encodingVersion = gStringEditVersion;
    }

    return _item.__encodingErrors;
}

// modal com a lista de erros de encoding dos iffs carregados (definido em modal.js)

function makeIffSelection() {
    const sel = document.getElementById('iff-sel');

    // widget anterior do Choices aponta para options velhas
    destroyChoices(sel);

    sel.innerHTML = '';

    iffs.forEach(iff => {
        const opt = document.createElement('option');
        opt.value = iff.name;
        opt.innerHTML = iffOptionLabel(iff);
        if (iff.__hasEncodingError)
            opt.classList.add('iff-option-warning');
        sel.appendChild(opt);
    });

    // widget do Choices: a UI real do seletor (o <select> nativo segue oculto
    // como fonte da verdade)
    initIffChoices();

    // primeiro
    makeItemSelection(true);

    sel.addEventListener('change', makeItemSelection);
}

function getSelectedIFF() {
    const iffSel = document.getElementById('iff-sel');
    return iffs.find(iff => iff.name == iffSel.options[iffSel.selectedIndex].value);
}

function updateSelectedIFFOption() {
    const iffSel = document.getElementById('iff-sel');
    const opt = iffSel.options && iffSel.options[iffSel.selectedIndex];

    if (!opt)
        return;

    const iff = iffs.find(iff => iff.name == opt.value);

    if (!iff)
        return;

    opt.innerHTML = iffOptionLabel(iff);
    opt.classList?.toggle('iff-option-warning', !!iff.__hasEncodingError);

    syncIffChoices();
    syncIffWrapWarning();
}

function updateIFFOption(_iff) {
    const iffSel = document.getElementById('iff-sel');

    if (!_iff)
        return;

    const opt = [...iffSel.options].find(o => o.value == _iff.name);

    if (opt) {
        opt.innerHTML = iffOptionLabel(_iff);
        opt.classList?.toggle('iff-option-warning', !!_iff.__hasEncodingError);
    }

    syncIffChoices();
    syncIffWrapWarning();
}

// ---- seletor de iff via Choices.js ----
// o <select> nativo (#iff-sel) segue oculto como fonte da verdade (tests e
// handlers usam ele); o widget do Choices é a UI, recriado no makeIffSelection
// e re-sincronizado quando um label/aviso de encoding muda.

const gIffChoiceLabels = {};

function iffChoiceLabel(_opt) {
    return _opt.innerHTML || _opt.textContent || '';
}

function initIffChoices() {
    const sel = document.getElementById('iff-sel');

    if (typeof Choices === 'undefined')
        return; // ambiente de teste (domstub) não tem o Choices

    [...sel.options].forEach(opt => {
        gIffChoiceLabels[opt.value] = iffChoiceLabel(opt);
    });

    // sem `choices:` no init: o Choices lê as options nativas do <select>
    // (fonte da verdade) — passar choices + options duplicava a lista (bug)
    // searchEnabled: o seletor lista os iffs — busca embutida no dropdown
    makeChoices(sel, { searchEnabled: true });
}

// re-sincroniza o widget quando um label/aviso de encoding do iff muda (ex.:
// Desc.iff ficou __deleted, encoding com erro, etc.)
// O Choices v11 cacheia os labels e o setChoices/clearChoices duplica entradas
// no nosso uso — então destruímos e recriamos o widget (initIffChoices), com
// estado fresh, sem duplicação.
function syncIffChoices() {
    const sel = document.getElementById('iff-sel');
    const inst = sel && sel._choicesInst;

    if (!inst)
        return;

    let changed = false;

    [...sel.options].forEach(opt => {
        const label = iffChoiceLabel(opt);

        if (gIffChoiceLabels[opt.value] !== label) {
            gIffChoiceLabels[opt.value] = label;
            changed = true;
        }
    });

    if (!changed)
        return;

    // se o dropdown estiver aberto, não mexemos agora (destruir quebraria o
    // DOM visível). O sync roda na próxima abertura via showDropdown listener.
    if (inst.dropdown && inst.dropdown.isActive)
        return;

    const selected = sel.value;

    // destrói e recria o widget com as options nativas atualizadas
    destroyChoices(sel);
    initIffChoices();

    // restaura o valor selecionado (initIffChoices respeita a option selected,
    // mas garantimos)
    if (sel.value !== selected)
        sel.value = selected;

    if (sel._choicesInst && typeof sel._choicesInst.setChoiceByValue === 'function')
        sel._choicesInst.setChoiceByValue(selected);

    syncIffDropdownWarnings();
}

// aplica a classe iff-option-warning nos itens do dropdown do iff-sel que possuem aviso
function syncIffDropdownWarnings() {
    const sel = document.getElementById('iff-sel');
    const inst = sel && sel._choicesInst;

    if (!inst || !inst.dropdown || !inst.dropdown.element)
        return;

    const warnValues = new Set();

    if (sel && sel.options) {
        [...sel.options].forEach(opt => {
            if (opt.classList && opt.classList.contains('iff-option-warning'))
                warnValues.add(opt.value);
        });
    }

    const items = inst.dropdown.element.querySelectorAll('.choices__item--selectable');

    items.forEach(el => {
        const val = el.getAttribute('data-value');

        el.classList.toggle('iff-option-warning', warnValues.has(val));
    });
}

// aviso laranja no wrap do seletor quando o iff selecionado tem erro de encoding
function syncIffWrapWarning() {
    const wrap = document.getElementById('iff-sel-wrap');
    const sel = document.getElementById('iff-sel');
    const opt = sel.options && sel.options[sel.selectedIndex];
    const iff = opt ? iffs.find(i => i.name == opt.value) : null;

    if (wrap)
        wrap.classList.toggle('iff-choices-warning', !!(iff && iff.__hasEncodingError));
}

// ---- selects do painel de filtros e limpeza de campos com widget Choices ----

// reseta um select (valor '') e recria o widget do Choices (o estado do widget
// fica preso ao value antigo se só trocarmos o nativo)
function resetFilterSelect(_el) {
    if (!_el)
        return;

    _el.value = '';

    destroyChoices(_el);
    makeChoices(_el);
}

// limpa a área de campos do item selecionado destruindo os widgets do Choices
// antes do innerHTML (senão os widgets órfãos continuam escutando)
function clearGeralInfo() {
    const info = document.getElementById('div-geral-info');

    info.querySelectorAll('select').forEach(destroyChoices);
    info.innerHTML = '';
}

function isCutinSkin(_item) {
    return !!(_item instanceof Skin) && _item.hasOwnProperty('typeid')
        && Skin.createTypeidbit(_item.typeid.value).type === SkinType.CUTIN;
}

function linkCutinInfomation(_item) {
    if (!_item)
        return;

    if (!isCutinSkin(_item)) {
        _item.__cutin = null;
        return;
    }

    const cutinIff = iffs.find(i => i.name === 'CutinInfomation.iff');

    _item.__cutin = cutinIff
        ? cutinIff.elements.find(c => c.typeid.value === _item.typeid.value) || null
        : null;
}

function ensureCutinInfomation(_item) {
    if (!isCutinSkin(_item))
        return;

    linkCutinInfomation(_item);

    if (_item.__cutin)
        return;

    const cutinIff = iffs.find(i => i.name === 'CutinInfomation.iff');

    if (!cutinIff || !cutinIff.element_constructor)
        return;

    const cutin = new cutinIff.element_constructor();

    cutin.typeid.value = _item.typeid.value;
    cutin.active.value = 1;
    cutin.__new = true;
    cutin.saveState();

    let idx = cutinIff.elements.findIndex(c => _item.typeid.value < c.typeid.value);

    cutinIff.elements.splice(idx == -1 ? cutinIff.elements.length : idx, 0, cutin);

    updateIFFOption(cutinIff);

    _item.__cutin = cutin;
}

function linkItemDescription(_item) {
    const iff = getSelectedIFF();

    // sempre reseta o __desc: quando não há vínculo (flag != 0, sem typeid, Desc.iff,
    // etc.), o item fica SEM descrição — nunca mantém o vínculo de uma seleção anterior
    if (!iff || !_item) {
        if (_item)
            _item.__desc = null;
        return;
    }

    if (iff.flag_ligacao !== 0 || iff.name === 'Desc.iff' || !_item.hasOwnProperty('typeid')) {
        _item.__desc = null;
        return;
    }

    const descIff = iffs.find(i => i.name === 'Desc.iff');

    if (!descIff) {
        _item.__desc = null;
        return;
    }

    _item.__desc = descIff.elements.find(d => !d.__deleted && !d.__deleted2 && d.typeid.value === _item.typeid.value) || null;
}

function ensureItemDescription(_item) {
    const iff = getSelectedIFF();

    if (!iff || !_item || !_item.hasOwnProperty('typeid') || iff.flag_ligacao !== 0 || iff.name === 'Desc.iff')
        return;

    linkItemDescription(_item);

    if (_item.__desc)
        return;

    const descIff = iffs.find(i => i.name === 'Desc.iff');

    if (!descIff || !descIff.element_constructor)
        return;

    // se já existe uma descrição deletada com o mesmo typeid, restaura em vez de criar nova
    const deletedDesc = descIff.elements.find(d => (d.__deleted || d.__deleted2) && d.typeid.value === _item.typeid.value);

    if (deletedDesc) {
        deletedDesc.__deleted = false;
        deletedDesc.__deleted2 = false;
        _item.__desc = deletedDesc;
        updateIFFOption(descIff);
        return;
    }

    const desc = new descIff.element_constructor();

    desc.typeid.value = _item.typeid.value;
    desc.description.value = '';
    desc.__new = true;
    desc.saveState();

    let idx = descIff.elements.findIndex(d => _item.typeid.value < d.typeid.value);

    descIff.elements.splice(idx == -1 ? descIff.elements.length : idx, 0, desc);

    updateIFFOption(descIff);

    _item.__desc = desc;
}

// rótulo do item na lista: identify name + preview (32 chars) da descrição
// o preview só aparece quando o item tem o campo description nele mesmo
// (itens do próprio Desc.iff) — itens vinculados via __desc não ganham preview
function getItemListLabel(_item, _index) {
    let label = _item.getIdentifyName ? stripEncodingMarker(_item.getIdentifyName()) : String(_index);

    const desc = _item.hasOwnProperty('description')
        ? _item.description
        : null;

    if (desc) {
        const text = stripEncodingMarker(String(desc.value || '')).replace(/\0/g, '').replace(/\s+/g, ' ').trim();

        if (text)
            label += ' — ' + text.slice(0, 32);
    }

    return label;
}

// reavalia o aviso de encoding do iff após edição de campos
function refreshIFFEncodingState(_iff) {
    if (!_iff)
        return;

    _iff.__hasEncodingError = _iff.elements.some(i => getItemEncodingErrors(i).length > 0);

    // updateSelectedIFFOption já sincroniza o widget do Choices (via syncIffChoices)
    updateSelectedIFFOption();

    document.getElementById('iff-sel').classList.toggle('iff-sel-warning', !!_iff.__hasEncodingError);
}

// ===== Lista virtualizada ================================================
// Listas gigantes (Part.iff 9417 / Desc.iff 14878): cada clique REAL no
// documento custa O(linhas) nos motores (Chromium ~3s, Firefox ~1.3s medidos)
// porque o pipeline nativo de input percorre o DOM. Acima do limite abaixo a
// lista vira JANELA DESLIZANTE: só as linhas visíveis ±buffer existem no DOM;
// a altura total é preservada por padding-top/bottom na UL (linha fixa de 55px).
// Listas pequenas continuam iguais.
const kListWindowThreshold =
    2500;

// altura REAL da linha: #item-sel li usa box-sizing:border-box com
// height:25px + padding 15/15 — o box NÃO pode ser menor que o padding,
// então cada linha ocupa exatamente 30px
const kListRowH =
    30;

const kListBufferRows =
    24;

function listStateClassSet(_item) {

    const s = new Set();

    if (_item.hasOwnProperty('active') && _item.active.value == 0) s.add('item-disable');
    if (_item.__new) s.add('item-new');
    if (_item.__modified) s.add('item-modified');
    if (_item.__deleted || _item.__deleted2) s.add('item-deleted');
    if (_item.__hide) s.add('item-hide');
    if (getItemEncodingErrors(_item).length > 0) s.add('item-encoding');

    return s;
}

function buildItemListLi(_item, _index, _hasIcons, _vpos) {

    const div = document.createElement('div');
    div.classList.toggle('div-item');
    div.textContent = getItemListLabel(_item, _index);

    const li = document.createElement('li');

    for (const c of listStateClassSet(_item))
        li.classList.add(c);

    li.index = _index;
    li.vpos = (_vpos === undefined ? null : _vpos);
    li.itemObj = _item;

    if (_hasIcons) {

        const slot = document.createElement('span');
        slot.className = 'item-list-icon';

        const img = document.createElement('img');
        img.className = 'item-list-icon-img';
        img.hidden = true;

        const label = getItemListLabel(_item, _index);
        img.title = 'Ampliar imagem';
        img.addEventListener('click', evt => {
            evt.stopPropagation();
            if (img.hidden || !img.src) return;
            new ResourceImageModal(img.src, label).show();
        });

        slot.appendChild(img);
        li.appendChild(slot);
    }

    li.appendChild(div);

    li.addEventListener('click', makeItemInfo);
    li.addEventListener('contextmenu', makeItemContextMenu);

    return li;
}

// preenche o thumb de UMA linha já renderizada (icon próprio ou da relação)
function fillListItemIcon(_li) {

    const img = _li.querySelector('.item-list-icon img');

    if (!img || (img.src && !img.hidden))
        return 0;

    const el = _li.itemObj;

    if (!el || el.__deleted || el.__deleted2)
        return 0;

    // 1) icon próprio
    if (el instanceof Base && el.icon instanceof StringType
        && (el.icon.value || '').trim() !== '') {

        el.icon.loadResourcePreview(img, { classList: { add() {}, remove() {} } });

        return 1;
    }

    // 2) relação de iff pelo TYPEID principal
    const relFn = kListIconRelations[getSelectedIFF()?.name] || null;

    if (!relFn)
        return 0;

    let cands = [];

    try {
        cands = relFn(el) || [];
    } catch (_e) {
        cands = [];
    }

    for (const cand of cands) {

        if (!cand || !cand.t)
            continue;

        const target = resolveRelationElement(cand.t, cand.iff);

        if (target && target.icon instanceof StringType
            && (target.icon.value || '').trim() !== '') {

            target.icon.loadResourcePreview(img, { classList: { add() {}, remove() {} } });

            return 1;
        }
    }

    return 0;
}

// força o re-preenchimento do thumb de uma linha já renderizada — usado
// quando o campo linkado (item_typeid / link_item_typeid etc.) muda, para
// que a imagem passe a refletir o novo item referenciado
function refreshListItemIcon(_li) {

    if (!_li)
        return 0;

    const img = _li.querySelector('.item-list-icon')?.childNodes[0];

    if (!img)
        return 0;

    // limpa o cache para contornar o early-return do fillListItemIcon (ele
    // não re-preenche se já houver src visível)
    img.src = '';
    img.hidden = true;

    return fillListItemIcon(_li);
}

function makeItemSelection(_force = false) {
    const itemSel = document.getElementById('item-sel');

    const iff = getSelectedIFF();

    const elFlagLigacao = document.getElementById('i-flag-ligacao');

    elFlagLigacao.value = fmtFlagLigacao(iff.flag_ligacao);

    itemSel.addEventListener('contextmenu', makeItemContextMenuUl);
    itemSel.addEventListener('keydown', makeItemKeyboardSelect);

    itemSel.innerHTML = '';

    if (_force || !itemSel.hasOwnProperty('selected'))
        itemSel['selected'] = null;

    // coluna de thumbnails (22x22): existe se algum item tem Base.icon OU se o
    // iff tem relação de iff resolvível (o worker carrega o icon referenciado);
    // aí todos os li ganham o slot (tabela alinhada); senão, nenhum espaço vazio
    const relFn = kListIconRelations[iff.name] || null;

    const relHasAny = relFn
        ? iff.elements.some(i => {

            if (i.__deleted || i.__deleted2)
                return false;

            try {
                return (relFn(i) || []).some(c => c && c.t);
            } catch (_e) {
                return false;
            }
        })
        : false;

    const hasIcons = iff.elements.some(i =>
        i instanceof Base && i.icon instanceof StringType
        && (i.icon.value || '').trim() !== '')
        || relHasAny;

    itemSel.__vlist = {
        iff,
        windowed: iff.elements.length > kListWindowThreshold,
        userSelected: false,
        hasIcons,
        visible: null,
        idxOf: null,
        start: 0,
        end: 0,
    };

    if (!itemSel.__vlist.windowed)
        iff.elements.forEach((item, index) =>
            itemSel.appendChild(buildItemListLi(item, index, hasIcons)));

    // limpa item geral info
    clearGeralInfo();

    // primeiro
    if (itemSel.selected != null)
        selectItem(itemSel.selected.itemObj);
    else if (iff.elements.reduce((acc, i) => acc += (!i.__hide ? 1 : 0), 0) > 0)
        selectItem(iff.elements.find(i => !i.__hide));

    // filtros que dependem de campos do iff: grupos de checks aparecem/somem
    // conforme o iff e valores que não valem mais são resetados
    refreshFilterPanel(iff);

    // painel de filtros só aparece com um iff selecionado
    updateFilterPanelVisibility();

    // make filter
    filterItem(document.getElementById('searchItem').value);

    // seletor de iff com erro de encoding fica laranja
    document.getElementById('iff-sel').classList.toggle('iff-sel-warning', !!(iff && iff.__hasEncodingError));

    syncIffWrapWarning();

    // WORKER dos thumbnails: resolve relações e carrega os icons em lotes —
    // a geração nova CANCELA o work do iff anterior na primeira batida
    gListIconElemCache.clear();
    (typeof iffs !== 'undefined' ? iffs : []).forEach(f => { delete f.__iconTypeids; });

    if (itemSel.__vlist.windowed) {

        // JANELA: constrói o range inicial em torno da seleção/topo; as linhas
        // novas recebem os thumbs INLINE (poucas linhas por janela)
        ensureListWindow(itemSel);
        renderListWindow(itemSel);

        if (!itemSel.__scrollBound) {

            itemSel.__scrollBound = true;

            let raf = 0;

            itemSel.addEventListener('scroll', () => {

                if (raf) return;

                raf = requestAnimationFrame(() => {
                    raf = 0;
                    renderListWindow(itemSel);
                });
            });
        }

    } else {

        const gen = ++gListIconGen;

        startListIconWorker(itemSel, iff, [...itemSel.children], gen);
    }
}

// constrói visible[]/idxOf (windowed) se ainda não existirem
function ensureListWindow(_itemSel, _filter) {

    const vl = _itemSel.__vlist;

    if (!vl || !vl.windowed)
        return;

    if (vl.visible)
        return;

    vl.search = (_filter === undefined ? (document.getElementById('searchItem') || {}).value || '' : _filter);

    rebuildVisibleList(_itemSel);
}

function rebuildVisibleList(_itemSel) {

    const vl = _itemSel.__vlist;
    const iff = vl.iff;
    const state = getFilterState();
    const showHidden = !!state.hidden;

    vl.visible = [];
    vl.idxOf = new Map();

    iff.elements.forEach((item, idx) => {

        if (item.__hide && !showHidden)
            return;

        const cls = listStateClassSet(item);
        const shadow = {
            itemObj: item,
            index: idx,
            textContent: getItemListLabel(item, idx),
            children: [],
            classList: { contains: c => cls.has(c) },
        };

        if (!itemMatchesFilter(shadow, vl.search || '') || !itemMatchesState(shadow, state))
            return;

        vl.idxOf.set(item, vl.visible.length);
        vl.visible.push(item);
    });
}

// (re)constrói as linhas do range atual; altura total via paddings na UL
function renderListWindow(_itemSel, _centerVpos) {

    const vl = _itemSel.__vlist;

    if (!vl || !vl.windowed)
        return;

    ensureListWindow(_itemSel);

    const total = vl.visible.length;
    const perView = Math.max(1, Math.ceil(_itemSel.clientHeight / kListRowH));
    const span = perView + kListBufferRows * 2;

    // a janela SEGUE O SCROLL (fonte única da verdade): o scrollTop mapeia
    // direto para a primeira linha; _centerVpos só sobrepõe ao posicionar uma
    // linha específica (selectItem/filtro)
    let start = Math.round(_itemSel.scrollTop / kListRowH) - kListBufferRows;

    let forceTarget = null;

    if (_centerVpos != null) {

        // quem impõe a posição também move o scroll, mas só DEPOIS de montar o
        // conteúdo novo (com o conteúdo antigo curto o browser clampeia o
        // scrollTop e a lista ficava em branco/no lugar errado)
        start = _centerVpos - kListBufferRows;
        forceTarget = Math.max(0, Math.min(start, Math.max(0, total - span))) * kListRowH;
    }

    vl.start = Math.max(0, Math.min(start, Math.max(0, total - span)));
    vl.end = Math.min(total, vl.start + span);

    _itemSel.innerHTML = '';

    // pseudo-run p/ probes: janela é processada inline
    const run = { id: ++gListIconGen, name: vl.iff.name, cancelled: false, done: true, processed: 0, resolved: 0 };
    gListIconRuns.push(run);
    while (gListIconRuns.length > 8) gListIconRuns.shift();
    window.__relIconStats = run;

    // ESPAÇADORES como filhos (NUNCA padding na UL): com box-sizing:border-box
    // o padding entra no tamanho mínimo do flex item e a UL cresceria além do
    // pai em vez de rolar
    const mkSpacer = h => {
        const sp = document.createElement('div');
        sp.className = 'list-spacer';
        sp.style.height = h + 'px';
        return sp;
    };

    _itemSel.appendChild(mkSpacer(vl.start * kListRowH));

    let rendered = 0;

    for (let v = vl.start; v < vl.end; v++) {

        const item = vl.visible[v];
        const li = buildItemListLi(item, vl.iff.elements.indexOf(item), vl.hasIcons, v);

        if (item === itemSel_selectedItem(_itemSel))
            li.classList.add('item-selected');

        run.resolved += fillListItemIcon(li);

        _itemSel.appendChild(li);
        rendered++;
    }

    _itemSel.appendChild(mkSpacer(Math.max(0, total - vl.end) * kListRowH));
    vl.renderedLis = rendered;

    void 0;

    run.processed = rendered;

    // AGORA sim move o scroll: o conteúdo novo (espaçadores) já está montado
    if (forceTarget != null && _itemSel.scrollTop !== forceTarget)
        _itemSel.scrollTop = forceTarget;
}

// guarda SEMPRE a referência do item selecionado (o li muda a cada janela)
const __selectedByIff = new Map();

function itemSel_selectedItem(_itemSel) {

    const vl = _itemSel.__vlist;

    if (!vl)
        return null;

    return __selectedByIff.get(vl.iff) || null;
}

function itemSel_setSelectedItem(_itemSel, _item) {

    const vl = _itemSel.__vlist;

    if (!vl)
        return;

    if (_item)
        __selectedByIff.set(vl.iff, _item);
    else
        __selectedByIff.delete(vl.iff);
}

// garante que o vpos está dentro da janela (recentra se preciso)
function ensureInListWindow(_itemSel, _vpos) {

    const vl = _itemSel.__vlist;

    if (!vl || !vl.windowed)
        return;

    if (_vpos == null)
        return;

    if (_vpos < vl.start || _vpos >= vl.end)
        renderListWindow(_itemSel, _vpos);
}

// ===== Thumbnails da lista por RELAÇÃO de iff ============================
// iffs cujo item referencia um item de OUTRO iff pelo TYPEID PRINCIPAL (o que
// aparece em getIdentifyName): a lista mostra o Base.icon do item referenciado.
// Sem varredura de campos aninhados (package/reward/counter/quest/parts...) —
// só a relação primária de cada modelo. A resolução usa nomes explícitos quando
// conhecidos ou a tabela estática kListIconIdentityBase (identidade do jogo =
// byte alto do typeid). O carregamento roda num WORKER em lotes (setTimeout):
// trocar de iff/re-render incrementa a GERAÇÃO e o work antigo se cancela.

const K_LIST_ICON_REWARD =
    ['Character.iff', 'Part.iff', 'ClubSet.iff', 'Ball.iff', 'Item.iff',
     'Caddie.iff', 'Skin.iff', 'HairStyle.iff', 'Mascot.iff', 'AuxPart.iff',
     'Card.iff', 'Furniture.iff', 'SetItem.iff'];

const K_LIST_ICON_REWARD_14 =
    ['Character.iff', 'Part.iff', 'ClubSet.iff', 'Ball.iff', 'Item.iff',
     'Caddie.iff', 'Skin.iff', 'HairStyle.iff', 'Mascot.iff', 'AuxPart.iff',
     'Card.iff', 'Furniture.iff', 'SetItem.iff', 'Match.iff'];

const kListIconRelations = {
    'CutinInfomation.iff': _el =>
        [{ t: _el.typeid.value, iff: ['Skin.iff'] }],
    'FurnitureAbility.iff': _el =>
        [{ t: _el.typeid.value, iff: ['Furniture.iff'] }],
    'TimeLimitItem.iff': _el =>
        [{ t: _el.typeid.value, iff: ['Item.iff'] }],
    'HoleCupDropItem.iff': _el =>
        [{ t: _el.typeid.value, iff: ['Item.iff'] }],
    'PointShop.iff': _el =>
        [{ t: _el.typeid.value, iff: ['Item.iff'] }],
    'MemorialShopCoinItem.sff': _el =>
        [{ t: _el.typeid.value, iff: ['Item.iff'] }],
    'ArtifactManaInfo.iff': _el =>
        [{ t: _el.typeid.value, iff: ['Item.iff'] }],
    'SpecialPrizeItem.iff': _el =>
        [{ t: _el.typeid.value, iff: K_LIST_ICON_REWARD }],
    'ShopLimitItem.iff': _el =>
        [{ t: _el.typeid.value, iff: K_LIST_ICON_REWARD }],
    'MemorialShopRareItem.iff': _el =>
        [{ t: _el.typeid.value, iff: K_LIST_ICON_REWARD }],
    'NonVisibleItemTable.iff': _el =>
        [{ t: _el.typeid.value, iff: K_LIST_ICON_REWARD_14 }],
    'SubscriptionItemTable.iff': _el =>
        [{ t: _el.typeid.value, iff: K_LIST_ICON_REWARD_14 }],
    // só o PRIMEIRO slot preenchido é a referência principal
    'TwinsItemTable.iff': _el => {
        const v = _el.typeid.find(x => x.value);
        return v ? [{ t: v.value, iff: K_LIST_ICON_REWARD }] : [];
    },
    'Ability.iff': _el =>
        [{ t: _el.typeid.value, iff: K_LIST_ICON_REWARD }],
    // o typeid do AddonPart É o typeid do item que ele complementa
    'AddonPart.iff': _el =>
        [{ t: _el.typeid.value }],
    // o typeid É o typeid do character do Character.iff (mastery por personagem)
    'CharacterMastery.iff': _el =>
        [{ t: _el.typeid.value }],
    // a referência é o CHARACTER do campo char_id (não o typeid do elemento)
    'GrandPrixAIOptionalData.sff': _el =>
        _el.char_id && typeof _el.char_id.value === 'number'
            ? [{ t: (Character.generateTypeid() | _el.char_id.value) >>> 0, iff: ['Character.iff'] }]
            : [],
    'Desc.iff': _el =>
        [{ t: _el.typeid.value }],
    // o item referenciado é o item_typeid (não o typeid de sequência)
    'GrandPrixConditionEquip.iff': _el =>
        [{ t: _el.item_typeid.value, iff: K_LIST_ICON_REWARD_14 }],
    // o item referenciado é o item_counter.typeid (não o typeid principal)
    'ScratchRewardSetting.iff': _el =>
        _el.item_counter && _el.item_counter.typeid && _el.item_counter.typeid.value
            ? [{ t: _el.item_counter.typeid.value, iff: ['Item.iff'] }]
            : [],
};

// geração do worker: qualquer re-render/troca de iff invalida o work anterior
let gListIconGen = 0;

// runs recentes (debug/probe: cancelled/done/processed por run)
const gListIconRuns = [];

// typeid -> elemento referenciado (por render; evita re-resolver 9417x)
const gListIconElemCache = new Map();

// identidade do JOGO (byte alto do typeid) -> iffs com Base.icon — tabela
// estática dos packs reais (a identidade do jogo NÃO é o IFF_GROUP_ID interno
// do app: Part=8/Item=24..27/Skin=56,57/AuxPart=112...); consulta O(1) e a
// existência exata do typeid fica no Set do iff alvo
const kListIconIdentityBase = new Map([
    [4, ['Character.iff']],
    [8, ['Part.iff']],
    [12, ['Club.iff']],
    [16, ['ClubSet.iff']],
    [20, ['Ball.iff']],
    [24, ['Item.iff']], [26, ['Item.iff']], [27, ['Item.iff']],
    [28, ['Caddie.iff']],
    [36, ['SetItem.iff']], [37, ['SetItem.iff']],
    [56, ['Skin.iff']], [57, ['Skin.iff']],
    [60, ['HairStyle.iff']], [62, ['HairStyle.iff']],
    [64, ['Mascot.iff']],
    [72, ['Furniture.iff']],
    [76, ['Achievement.iff']], [77, ['Achievement.iff']],
    [108, ['CounterItem.iff']],
    [112, ['AuxPart.iff']],
    [116, ['QuestStuff.iff']],
    [120, ['QuestItem.iff']],
    [124, ['Card.iff']], [125, ['Card.iff']],
]);

function getIffTypeidSet(_iff) {

    if (!_iff.__iconTypeids) {

        const s = new Set();

        _iff.elements.forEach(e => {
            if (e.__deleted || e.__deleted2 || !(e.typeid && e.typeid.value))
                return;
            s.add(e.typeid.value);
        });

        _iff.__iconTypeids = s;
    }

    return _iff.__iconTypeids;
}

function resolveRelationElement(_t, _preferred) {

    if (!_t)
        return null;

    if (gListIconElemCache.has(_t))
        return gListIconElemCache.get(_t);

    let el = null;

    let names = Array.isArray(_preferred) && _preferred.length > 0 ? _preferred : null;

    if (!names) {

        const byId = kListIconIdentityBase.get((_t >>> 24) & 0xFF);

        names = byId || [];
    }

    for (let i = 0; i < names.length; i++) {

        const iff = (typeof iffs !== 'undefined' ? iffs : []).find(f => f.name === names[i]);

        if (!iff)
            continue;

        if (!getIffTypeidSet(iff).has(_t))
            continue;

        el = iff.elements.find(e =>
            !(e.__deleted || e.__deleted2) && e.typeid && e.typeid.value === _t) || null;

        if (el)
            break;
    }

    gListIconElemCache.set(_t, el);

    return el;
}

// WORKER dos thumbnails: processa a lista em lotes (250 li por batida,
// 16ms entre elas). Para cada slot vazio: usa o icon PRÓPRIO do item quando
// existe; senão resolve as RELAÇÕES e carrega o Base.icon do item
// referenciado. A run morre na primeira batida se a geração mudou
function startListIconWorker(_itemSel, _iff, _lis, _gen) {

    const relFn =
        kListIconRelations[_iff.name] || null;

    const run = {
        id: _gen,
        name: _iff.name,
        cancelled: false,
        done: false,
        processed: 0,
        resolved: 0
    };

    gListIconRuns.push(run);

    while (gListIconRuns.length > 8)
        gListIconRuns.shift();

    window.__relIconStats =
        run;

    const CHUNK = 250;
    let idx = 0;

    const step = () => {

        // CANCELADO: trocou de iff/re-renderizou → esta run morre aqui
        if (_gen !== gListIconGen) {
            run.cancelled = true;
            return;
        }

        const end = Math.min(idx + CHUNK, _lis.length);

        for (; idx < end; idx++) {

            const li = _lis[idx];
            const el = li['itemObj'];

            if (!el || el.__deleted || el.__deleted2)
                continue;

            run.processed++;

            const img =
                li.querySelector('.item-list-icon img');

            // sem slot/img ou o icon JÁ carregado: nada a fazer
            if (!img || (img.src && !img.hidden))
                continue;

            // 1) icon PRÓPRIO (Base): mesmo caminho dos campos asset
            if (el instanceof Base && el.icon instanceof StringType
                && (el.icon.value || '').trim() !== '') {

                el.icon.loadResourcePreview(img, {
                    classList: { add() {}, remove() {} }
                });

                run.resolved++;

                continue;
            }

            // 2) relações: primeiro candidato com Base.icon no destino
            let cands = null;

            try {
                cands = relFn ? relFn(el) : [];
            } catch (_e) {
                cands = [];
            }

            for (let c = 0; c < cands.length; c++) {

                const cand = cands[c];

                if (!cand || !cand.t)
                    continue;

                const target =
                    resolveRelationElement(cand.t, cand.iff);

                if (target && target.icon instanceof StringType
                    && (target.icon.value || '').trim() !== '') {

                    target.icon.loadResourcePreview(img, {
                        classList: { add() {}, remove() {} }
                    });

                    run.resolved++;

                    break;
                }
            }
        }

        if (idx < _lis.length) {
            setTimeout(step, 16);
        } else {
            run.done = true;
        }
    };

    setTimeout(step, 16);
}

// coloca o botão "…" no typeid de itens de iffs que têm modal de novo item:
// abre o MESMO modal em modo edição (bits do typeid + num) e, ao aplicar,
// monta o typeid novo, preenche o input e dispara o change — o handler de
// change seta o valor (ex.: position_mask no Part) e o app marca/reordena.
// true se o "novo item" do iff abre o modal (modelo com conteúdo OU num único,
// ex.: Character.iff que só tem o num)
function hasNewItemModal(_iff) {

    if (!_iff || !_iff.element_constructor)
        return false;

    const model =
        kNewItemModel[_iff.name];

    const hasModelContent =
        model
        && ((model.typeid_bits && Object.keys(model.typeid_bits).length > 0)
            || (model.typeid_checkboxes && model.typeid_checkboxes.length > 0)
            || (model.fields && Object.keys(model.fields).length > 0)
            || Object.entries(model.relations || {}).some(([path, spec]) =>
                path === 'typeid'
                || (typeof spec === 'object' && spec !== null && (spec.bit || spec.encode))));

    return !!(hasModelContent || getNewItemNumInfo(_iff.element_constructor, _iff.name));
}

function addTypeidPick(_iff, _item, _parent) {
    if (!_iff || !_item || !_item.typeid)
        return;

    // só vale para iffs cujo "novo item" abre o modal
    if (!hasNewItemModal(_iff))
        return;

    // o wrap do typeid do ITEM (campo próprio OU getter que retorna o id, ex.:
    // CadieMagicBoxRandom, cujo typeid É o id); o input de texto é o ÚLTIMO do
    // wrap (o primeiro é o checkbox do toggle hex). Não usar querySelector por
    // data-field="typeid": pegaria o de um sub-objeto (item_random.typeid).
    const typeidWrap =
        _item.typeid && _item.typeid._layoutWrap;

    let input = null;

    if (typeidWrap && typeidWrap.querySelectorAll) {

        const inputs =
            typeidWrap.querySelectorAll('input');

        if (inputs.length)
            input = inputs[inputs.length - 1];

    } else {

        input =
            _parent.querySelector('input[data-field="typeid"]');

        // typeid que É um select de enum do layout (ex.: LevelUpPrizeItem —
        // o typeid É o level, declarado via typeidFromField no modelo)
        if (!input && _iff && kNewItemModel[_iff.name]
                && kNewItemModel[_iff.name].typeidFromField) {

            input =
                _parent.querySelector('select[data-field="'
                    + kNewItemModel[_iff.name].typeidFromField + '"]');
        }
    }

    const wrap =
        input && input.closest
            ? (input.closest('.num-input-wrap') || input.closest('.field-col'))
            : null;

    if (!wrap || wrap.querySelector('.typeid-pick-btn'))
        return;

    wrap.classList.add('typeid-pick');

    const btn = document.createElement('button');

    btn.type = "button";
    btn.className = "typeid-pick-btn";
    btn.textContent = "\u2026";
    btn.title = "Editar typeid do " + _iff.name;

    btn.addEventListener("click", async _evt => {
        _evt.preventDefault();
        _evt.stopPropagation();

        const numInfo =
            getNewItemNumInfo(_iff.element_constructor, _iff.name);

        // o modal lê os bits via createTypeidbit (o campo typeid é só o Int32)
        const typeidObj =
            _iff.element_constructor.createTypeidbit
                ? _iff.element_constructor.createTypeidbit(_item.typeid.value)
                : { value: _item.typeid.value };

        const result =
            await new NewItemModal(_iff, typeidObj, numInfo, { isEdit: true, item: _item }).show();

        if (result == null)
            return;

        // defaults dos campos conforme o typeid editado (ex.: Item.iff —
        // LIMIT_TIME ativa o time_shop; não passivo volta o tipo_item p/ COMMUN)
        const modelEdit = kNewItemModel[_iff.name];

        const newTypeid =
            (result.num != null || Object.keys(result.bits || {}).length > 0)
                ? buildNewTypeId(_iff, typeidObj, result, numInfo)
                : (result.fields && (result.fields.typeid != null
                        || (modelEdit && modelEdit.typeidFromField
                            && result.fields[modelEdit.typeidFromField] != null))
                    ? { value: Number(result.fields.typeid
                        ?? (modelEdit && modelEdit.typeidFromField
                            ? result.fields[modelEdit.typeidFromField] : undefined)) }
                    : null);

        if (newTypeid == null || newTypeid.value === _item.typeid.value)
            return;

        if (modelEdit && modelEdit.onCreate) {

            const typeidbit =
                _iff.element_constructor.createTypeidbit
                    ? _iff.element_constructor.createTypeidbit(newTypeid.value)
                    : null;

            if (typeidbit)
                modelEdit.onCreate(_item, typeidbit);
        }

        const modeTgl =
            wrap.querySelector('.num-mode');

        const hex =
            !!(modeTgl && modeTgl.checked);

        input.value =
            hex ? '0x' + newTypeid.value.toString(16) : String(newTypeid.value);

        input.dispatchEvent(
            typeof Event !== 'undefined'
                ? new Event('change', { bubbles: true })
                : { type: 'change' }
        );
    });

    wrap.appendChild(btn);
}

function selectItem(_item) {
    const itemSel = document.getElementById('item-sel');
    const geralInfo = document.getElementById('div-geral-info');

    const iff = getSelectedIFF();

    let idx = iff.elements.indexOf(_item);

    itemSel_setSelectedItem(itemSel, _item);

    // janela deslizante: garante a linha renderizada antes de selecionar
    const vl = itemSel.__vlist;
    let li = null;

    if (vl && vl.windowed) {

        ensureListWindow(itemSel);

        const vpos = vl.idxOf.get(_item);

        if (vpos != null) {

            ensureListWindow(itemSel);

            // fora da janela atual: rola até a linha (o scroll dispara o
            // re-render pela própria janela)
            const span = Math.ceil(itemSel.clientHeight / kListRowH) + kListBufferRows * 2;

            if (vpos < vl.start || vpos >= vl.end)
                itemSel.scrollTop = Math.max(0, vpos - kListBufferRows) * kListRowH;

            renderListWindow(itemSel);

            li = [...itemSel.children].filter(n => n.tagName === 'LI')[vpos - vl.start] || null;
        }
    } else {
        li = itemSel.childNodes.values().find(el => el.index == idx) || null;
    }

    // SEMPRE limpa o layout anterior, mesmo se o item não estiver na lista renderizada
    // (evita o campo de descrição do item anterior continuar visível)
    const scrollTop = geralInfo.scrollTop;

    geralInfo.innerHTML = '';

    if (!li)
        return;

    li.scrollIntoView({
        behaivor: 'smooth',
        block: 'nearest'
    });

    itemSel.childNodes.forEach(c => c.classList.toggle('item-selected', false));
    li.classList.toggle('item-selected');
    itemSel.selected = li;
    
    if (_item.layout)
        _item.layout(geralInfo);

    addTypeidPick(iff, _item, geralInfo);

    if (iff.element_constructor == CadieMagicBox) {

        for (const field of ['seq', 'setor']) {

            for (const input of geralInfo.querySelectorAll(`[data-field="${field}"]`))
                input.addEventListener('change', () => {

                    iff.rebuildCadieMagicBox();

                    makeItemSelection(false);
                    updateSelectedIFFOption();
                });
        }
    }

    linkItemDescription(_item);
    linkCutinInfomation(_item);

    if (_item.__desc)
        _item.__desc.description.layout(geralInfo, "description");

    // preserva a posição da rolagem do layout ao trocar de item
    geralInfo.scrollTop = scrollTop;
}

function makeItemInfo(evt) {

    if (evt.currentTarget.vpos != null)
        evt.currentTarget.closest('ul').__vlist.userSelected = true;

    selectItem(evt.currentTarget.itemObj);
}

function makeItemKeyboardSelect(evt) {
    if (evt.key !== 'ArrowDown' && evt.key !== 'ArrowUp')
        return;

     evt.preventDefault();

     const itemSel = evt.currentTarget;
     const vl = itemSel.__vlist;

     if (vl && vl.windowed) {

        ensureListWindow(itemSel);

        const cur = itemSel_selectedItem(itemSel);
        const curV = cur ? (vl.idxOf.get(cur) ?? -1) : -1;

        const dir = evt.key === 'ArrowDown' ? 1 : -1;
        const target = curV < 0 ? (dir > 0 ? 0 : vl.visible.length - 1) : curV + dir;

        if (target < 0 || target >= vl.visible.length)
            return;

        vl.userSelected = true;

        selectItem(vl.visible[target]);

        return;
     }

     if (evt.key === 'ArrowDown') {

       if (itemSel.selected == null || itemSel.selected.nextElementSibling == null)
            return;

        let next = itemSel.selected.nextElementSibling;
        while (next && next.offsetParent === null)
            next = next.nextElementSibling;

        if (next)
            selectItem(next.itemObj);
        
     }else { // ArrowUp

        if (itemSel.selected == null || itemSel.selected.previousElementSibling == null)
            return;

        let prev = itemSel.selected.previousElementSibling;
        while (prev && prev.offsetParent === null)
            prev = prev.previousElementSibling;

        if (prev)
            selectItem(prev.itemObj);
     }
}

// localiza o iff + elemento REAL apontado pelo typeid do item: SOMENTE iffs de
// itens reais da identidade do jogo (byte alto do typeid — mesma tabela das
// miniaturas). NÃO varre os demais iffs: registros de ligação (Desc.iff etc.)
// nunca viram alvo. Null se a identidade não tem iff carregado com esse typeid
// ou se o dono é o próprio iff atual
function resolveItemReal(_el, _currentIff) {

    // o typeid "real" pode estar num campo aninhado (ex.: ScratchRewardSetting
    // usa item_counter.typeid, não o typeid principal do elemento)
    const realTid =
        (typeof _el.getRealItemTypeid === 'function')
            ? _el.getRealItemTypeid()
            : _el.typeid;

    if (!realTid || typeof realTid.value !== 'number')
        return null;

    const tid =
        (realTid.value >>> 0);

    if (tid === 0)
        return null;

    const hex =
        tid.toString(16);

    // identidade do jogo = byte alto do typeid (0x04xxxxxx → 4)
    const identity =
        (tid >>> 24) & 0xFF;

    const baseNames =
        kListIconIdentityBase.get(identity);

    if (!baseNames)
        return null;

    for (const n of baseNames) {

        const f =
            iffs.find(i => i.name === n);

        if (!f || f === _currentIff)
            continue;

        const alvo =
            f.elements.find(x => !x.__deleted && !x.__deleted2
                && x.typeid && typeof x.typeid.value === 'number'
                && (x.typeid.value >>> 0) === tid);

        if (alvo)
            return { iff: f, el: alvo, hex };
    }

    return null;
}

async function gotoItemReal(evt) {

    const el =
        evt.currentTarget.itemObj;

    const current =
        getSelectedIFF();

    const alvo =
        resolveItemReal(el, current);

    if (!alvo) {

        const hex =
            el && el.typeid ? (el.typeid.value >>> 0).toString(16) : '?';

        await new AlertModal('Nenhum item encontrado com o typeid 0x' + hex
            + ' em nenhum IFF carregado.').show();
        return;
    }

    // troca o iff no seletor (o nativo é a fonte da verdade; setSelectValue
    // sincroniza o widget do Choices) — o change reconstrói a lista
    if (getSelectedIFF() !== alvo.iff) {

        const sel =
            document.getElementById('iff-sel');

        setSelectValue(sel, alvo.iff.name);
        sel.dispatchEvent(new Event('change'));
    }

    // seleciona o item na lista (o selectItem híbrido rola até ele fora da janela)
    selectItem(alvo.el);
}

function makeItemContextMenuUl(evt) {
    evt.preventDefault();

    const menu = document.getElementById('ul-item-context-menu');
    const itemNew = document.getElementById('li-item-new');
    const itemShow = document.getElementById('li-item-show');
    const itemPaste = document.getElementById('li-item-paste');

    document.getElementById('li-item-goto').style.display = 'none';

    document.getElementById('li-item-dup').style.display = 'none';
    document.getElementById('li-item-del').style.display = 'none';
    document.getElementById('li-item-undo-del').style.display = 'none';
    document.getElementById('li-item-revert').style.display = 'none';
    document.getElementById('li-item-hide').style.display = 'none';
    document.getElementById('li-item-unhide').style.display = 'none';
    document.getElementById('li-item-copy').style.display = 'none';

    itemNew.style.display = 'inherit';
    itemShow.style.display = 'inherit';
    itemPaste.style.display = 'inherit';

    itemNew.addEventListener('click', newItem);
    itemShow.addEventListener('click', showItem);
    itemPaste.addEventListener('click', pasteItem);

    menu.style.display = 'flex';

    let x = evt.pageX;
    let y = evt.pageY;

    if (x + menu.offsetWidth > window.innerWidth)
        x = window.innerWidth - menu.offsetWidth - 5;
    if (y + menu.offsetHeight > window.innerHeight)
        y = window.innerHeight - menu.offsetHeight - 5;

    menu.style.left = `${x}px`;
    menu.style.top = `${y}px`;
}

function makeItemContextMenu(evt) {
    evt.preventDefault();
    evt.stopPropagation();

    const li = evt.currentTarget;

    const menu = document.getElementById('ul-item-context-menu');
    const itemNew = document.getElementById('li-item-new');
    const itemDup = document.getElementById('li-item-dup');
    const itemDel = document.getElementById('li-item-del');
    const itemUndoDel = document.getElementById('li-item-undo-del');
    const itemRevert = document.getElementById('li-item-revert');
    const itemHide = document.getElementById('li-item-hide');
    const itemUnhide = document.getElementById('li-item-unhide');
    const itemShow = document.getElementById('li-item-show');
    const itemCopy = document.getElementById('li-item-copy');
    const itemPaste = document.getElementById('li-item-paste');

    itemNew.style.display = 'inherit';
    itemDup.style.display = 'inherit';
    itemCopy.style.display = 'inherit';
    itemPaste.style.display = 'inherit';

    itemDup['index'] = li.index;
    itemDup['itemObj'] = li.itemObj;

    itemNew.addEventListener('click', newItem);
    itemDup.addEventListener('click', duplicateItem);
    itemShow.addEventListener('click', showItem);

    itemCopy['itemObj'] = li.itemObj;
    itemCopy.addEventListener('click', copyItem);
    itemPaste.addEventListener('click', pasteItem);

    // "Ir para o item": iff cujo elemento tem o MESMO typeid (ex.: Desc —
    // cada entrada descreve um item de outro IFF). Só aparece quando existe
    const itemGoto = document.getElementById('li-item-goto');
    const alvoGoto = resolveItemReal(li.itemObj, getSelectedIFF());

    if (alvoGoto) {

        itemGoto.style.display = 'inherit';

        itemGoto['index'] = li.index;
        itemGoto['itemObj'] = li.itemObj;

        itemGoto.addEventListener('click', gotoItemReal);
    } else {
        itemGoto.style.display = 'none';
    }

    if (li.itemObj.__modified) {
        itemRevert.style.display = 'inherit';

        itemRevert['index'] = li.index;
        itemRevert['itemObj'] = li.itemObj;

        itemRevert.addEventListener('click', revertItem);
    } else {
        itemRevert.style.display = 'none';
    }

    if (li.itemObj.__hide) {
        itemHide.style.display = 'none';

        itemUnhide.style.display = 'inherit';

        itemUnhide.addEventListener('click', unhideItem);

        itemUnhide['index'] = li.index;
        itemUnhide['itemObj'] = li.itemObj;
    } else {
        itemHide.style.display = 'inherit';

        itemHide.addEventListener('click', hideItem);

        itemHide['index'] = li.index;
        itemHide['itemObj'] = li.itemObj;

        itemUnhide.style.display = 'none';
    }

    if (li.itemObj.__deleted || li.itemObj.__deleted2) {
        itemDel.style.display = 'none';
        itemUndoDel.style.display = 'inherit';

        itemUndoDel['index'] = li.index;
        itemUndoDel['itemObj'] = li.itemObj;

        itemUndoDel.addEventListener('click', undoDeleteItem);
    }else {
        itemDel.style.display = 'inherit';
        itemUndoDel.style.display = 'none';

        itemDel['index'] = li.index;
        itemDel['itemObj'] = li.itemObj;

        itemDel.addEventListener('click', deleteItem);
    }

    menu.style.display = 'flex';

    let x = evt.pageX;
    let y = evt.pageY;

    if (x + menu.offsetWidth > window.innerWidth)
        x = window.innerWidth - menu.offsetWidth - 5;
    if (y + menu.offsetHeight > window.innerHeight)
        y = window.innerHeight - menu.offsetHeight - 5;

    menu.style.left = `${x}px`;
    menu.style.top = `${y}px`;
}

async function newItem(evt) {
    const iff = getSelectedIFF();
    
    let typeid = { value: 0 };
    if (iff.element_constructor.generateTypeid)
        typeid = iff.element_constructor.generateTypeid();

    const model = kNewItemModel[iff.name];

    const numInfo = getNewItemNumInfo(iff.element_constructor, iff.name);

    const values = hasNewItemModal(iff) ? await new NewItemModal(iff, typeid, numInfo).show() : { bits: {}, fields: {} };

    if (values == null)
        return;

    if (typeof typeid !== 'object')
        typeid = { value: typeid };

    if (values && (values.num != null || Object.keys(values.bits || {}).length > 0))
        typeid = buildNewTypeId(iff, typeid, values, numInfo);

    // o typeid final pode vir dos fields (relation typeid — ex.:
    // CutinInfomation/FurnitureAbility escolhem o typeid por select/picker;
    // GrandPrixSpecialHole — o typeid É o link do GP escolhido; LevelUpPrizeItem
    // — o typeid É o level, via typeidFromField). Vale também para modelos com
    // typeid NÃO único (antes o field só era aplicado dentro do guarda de
    // unicidade e o newElement nascia com typeid 0)
    const tidField =
        model && model.typeidFromField;

    if (values && values.fields && (values.fields.typeid != null
            || (tidField && values.fields[tidField] != null)))
        typeid = { value: Number(values.fields.typeid ?? (tidField ? values.fields[tidField] : undefined)) };

    // se o typeid montado já existe e o tipo exige um typeid único,
    // não cria o item (o modal já bloqueia; aqui é a proteção final)
    const probe = new iff.element_constructor();
    const renumera = model && typeof model.genNum === 'function';

    if (!renumera && probe.isTypeidUnique && probe.isTypeidUnique() !== false) {

        if (iff.elements.some(el => el.typeid && el.typeid.value === typeid.value)) {

            await new AlertModal('Não foi possível criar o item: já existe um item com esse typeid.').show();
            return;
        }
    }

    const new_item = iff.newElement(typeid.value);

    for (const [path, value] of Object.entries(values.fields)) {

        const targets = getItemFieldByPath(new_item, path);

        if (Array.isArray(value)) {

            targets.forEach((target, i) => {

                if (target && value[i] !== undefined)
                    target.value = value[i];
            });
        } else if (targets.length > 0 && value !== undefined)
            targets[0].value = value;
    }

    // hook pós-criação do modal (ex.: Part.iff seta o slot do char_part_num no position_mask)
    if (model && model.onCreate) {

        const typeidbit =
            iff.element_constructor.createTypeidbit
                ? iff.element_constructor.createTypeidbit(typeid.value)
                : null;

        if (typeidbit)
            model.onCreate(new_item, typeidbit);
    }
    
    let itemIdx = iff.elements.findIndex(i => new_item.typeid.value < i.typeid.value);
    
    iff.elements.splice(itemIdx == -1 ? iff.elements.length : itemIdx, 0, new_item);

    ensureItemDescription(new_item);
    ensureCutinInfomation(new_item);

	if (iff.element_constructor === CadieMagicBox)
		iff.rebuildCadieMagicBox();

    makeItemSelection(true);
    selectItem(new_item);
    updateSelectedIFFOption();
    
    const itemSel = document.getElementById('item-sel');
    const idx = iff.elements.indexOf(new_item);
    const li = itemSel.childNodes.values().find(el => el.index == idx);
    if (li)
        li.classList.toggle('new', true);
}

function duplicateItem(evt) {
    const iff = getSelectedIFF();
    
    const new_item = iff.cloneElement(evt.target.itemObj);

    let idx = iff.elements.findIndex(i => new_item.typeid.value < i.typeid.value);
    
    iff.elements.splice(idx == -1 ? iff.elements.length : idx, 0, new_item);

    ensureItemDescription(new_item);
    ensureCutinInfomation(new_item);

	if (iff.element_constructor === CadieMagicBox)
		iff.rebuildCadieMagicBox();

    evt.target.classList.toggle('new', true);

    makeItemSelection(true);
    selectItem(new_item);
    updateSelectedIFFOption();
}

function getItemCtorForRegion(_iffName, _region) {
    const vars =
        kIffRegionVariants[_iffName];

    const v =
        vars && vars.find(x => x.region === _region);

    return v ? v.ctor : getConstructorByName(_iffName);
}

async function copyItem(evt) {
    const iff =
        getSelectedIFF();

    const item =
        evt.target.itemObj;

    if (!iff || !item || !item.typeid) {
        await new AlertModal('Não há item selecionado para copiar.').show();
        return;
    }

    const srcRegion =
        getVersaoPackRegiao();

    const savedUpload =
        kCodePage.upload;

    kCodePage.upload =
        'utf8';

    const wb =
        new WriterBuffer(item.getSize());

    item.serialize(wb);

    kCodePage.upload =
        savedUpload;

    const payload =
        {
            app: 'jsiffmanager',
            kind: 'item',
            versao: srcRegion,
            iff: iff.name,
            data: Array.from(wb.data)
        };

    const json =
        JSON.stringify(payload);

    if (!navigator.clipboard || typeof navigator.clipboard.writeText !== 'function') {
        await new AlertModal('Não há suporte para copiar para a área de transferência neste navegador.').show();
        return;
    }

    try {
        await navigator.clipboard.writeText(json);

        await new AlertModal('O item [' + getVersaoLabelPorRegiao(srcRegion) + '/' + iff.name
            + ']: "' + item.getIdentifyName() + '" foi copiado para a área de transferência.').show();
    } catch (e) {
        await new AlertModal('Erro ao copiar para a área de transferência: '
            + (e && e.message ? e.message : e)).show();
    }
}

async function pasteItem(evt) {
    const iff =
        getSelectedIFF();

    if (!iff) {
        await new AlertModal('Nenhum IFF carregado para colar o item.').show();
        return;
    }

    if (!navigator.clipboard || typeof navigator.clipboard.readText !== 'function') {
        await new AlertModal('Não há suporte para colar da área de transferência neste navegador.').show();
        return;
    }

    let json;

    try {
        json =
            await navigator.clipboard.readText();
    } catch (e) {
        await new AlertModal('Erro ao ler a área de transferência: '
            + (e && e.message ? e.message : e)).show();
        return;
    }

    let payload;

    try {
        payload =
            JSON.parse(json);
    } catch (e) {
        await new AlertModal('Formato inválido: o conteúdo da área de transferência não é um JSON válido.').show();
        return;
    }

    if (!payload || payload.app !== 'jsiffmanager' || payload.kind !== 'item'
            || typeof payload.versao !== 'string' || typeof payload.iff !== 'string'
            || !Array.isArray(payload.data)) {
        await new AlertModal('Formato inválido: não é um item do jsiffmanager copiado da área de transferência.').show();
        return;
    }

    // o item copiado pertence ao IFF nomeado no payload; se o IFF aberto for
    // outro, usa o IFF de destino (caso esteja carregado). A troca da seleção
    // de IFF na UI só acontece DEPOIS que a cola foi aplicada com sucesso — se
    // der erro antes, o usuário fica no IFF em que estava mexendo.
    let targetIff =
        iff;

    if (iff.name !== payload.iff) {
        const dest =
            iffs.find(i => i.name === payload.iff);

        if (!dest) {
            await new AlertModal('O IFF ' + payload.iff
                + ' (de onde o item foi copiado) não está carregado.').show();
            return;
        }

        targetIff =
            dest;
    }

    const srcRegion =
        payload.versao;

    const tgtRegion =
        getVersaoPackRegiao();

    const srcCtor =
        getItemCtorForRegion(payload.iff, srcRegion);

    const tgtCtor =
        targetIff.__regionCtor || targetIff.element_constructor;

    if (!srcCtor || !tgtCtor) {
        await new AlertModal('Não foi possível encontrar o construtor do item para a versão '
            + srcRegion + '.').show();
        return;
    }

    let el;

    const savedLoad =
        kCodePage.load;

    const prevRegion =
        gRegionApply;

    // o layout de campos dependentes de região (ex.: flag_shop do TH) é decidido
    // em tempo de construção via isTHRegionActive()/gRegionApply — precisa bater
    // com a região de origem para reconstruir o item copiado corretamente
    gRegionApply =
        srcRegion;

    kCodePage.load =
        'utf8';

    try {
        el =
            new srcCtor(ReaderBuffer.from(new Uint8Array(payload.data)));
    } catch (e) {
        kCodePage.load =
            savedLoad;

        gRegionApply =
            prevRegion;

        await new AlertModal('Erro ao reconstruir o item da área de transferência: '
            + (e && e.message ? e.message : e)).show();
        return;
    }

    kCodePage.load =
        savedLoad;

    // conversão de região (item único)
    let nd =
        el;

    let converted =
        false;

    if (srcRegion !== tgtRegion) {
        // o elemento de destino também precisa ser construído com a região-alvo
        // ativa, senão seus campos dependentes de região nascem no layout errado
        gRegionApply =
            tgtRegion;

        try {
            nd =
                new tgtCtor();
        } finally {
            gRegionApply =
                prevRegion;
        }

        _converteCopiaCampos(nd, el);

        if (nd.shop && el.shop && nd.shop.flag_shop && el.shop.flag_shop)
            _converteFlagShopBits(nd.shop.flag_shop, el.shop.flag_shop);

        // o item convertido é NOVO para o pack de destino (não é uma modificação
        // de um item existente), então nasce como __new — o __modified só existe
        // quando se altera um item que já pertence ao pack
        nd.__new =
            true;

        converted =
            true;
    } else {
        gRegionApply =
            prevRegion;
    }

    const isUnique =
        !(targetIff.element_constructor.isTypeidUnique
            && targetIff.element_constructor.isTypeidUnique() === false);

    const existing =
        targetIff.elements.find(e => !e.__deleted && !e.__deleted2
            && e.typeid && e.typeid.value === nd.typeid.value);

    if ((isUnique && !existing) || !isUnique) {
        // adiciona novo item (desc/cutin auto por flag_ligacao)
        let idx =
            targetIff.elements.findIndex(i => nd.typeid.value < i.typeid.value);

        targetIff.elements.splice(idx == -1 ? targetIff.elements.length : idx, 0, nd);

        nd.__new = true;

        nd.saveState();

        ensureItemDescription(nd);
        ensureCutinInfomation(nd);

        if (targetIff.element_constructor === CadieMagicBox)
            targetIff.rebuildCadieMagicBox();

        // só agora (tudo certo) troca a seleção de IFF na UI, se necessário
        if (getSelectedIFF().name !== targetIff.name) {
            const sel =
                document.getElementById('iff-sel');

            setSelectValue(sel, targetIff.name);
            sel.dispatchEvent(new Event('change'));
        }

        makeItemSelection(true);
        selectItem(nd);
        updateSelectedIFFOption();

        const itemSel =
            document.getElementById('item-sel');

        const liIdx =
            targetIff.elements.indexOf(nd);

        const li =
            itemSel.childNodes.values().find(el => el.index == liIdx);

        if (li)
            li.classList.toggle('new', true);

        await new AlertModal('O item [' + (converted
                ? getVersaoLabelPorRegiao(srcRegion) + '->' + getVersaoLabelPorRegiao(tgtRegion)
                : getVersaoLabelPorRegiao(srcRegion))
            + '/' + targetIff.name + ']: "' + nd.getIdentifyName()
            + '" foi adicionado da área de transferência.').show();
    } else {
        // item já existe: troca os dados e verifica se realmente mudou
        var ori = new WriterBuffer(existing.getSize());
        existing.serialize(ori);

        _converteCopiaCampos(existing, nd);

        var curr = new WriterBuffer(existing.getSize());

        existing.serialize(curr);
        
        existing.__modified =
            ori.data.length !== curr.data.length
            || ori.data.some((b, i) => b !== curr.data[i]);

        ensureItemDescription(existing);
        ensureCutinInfomation(existing);

        if (targetIff.element_constructor === CadieMagicBox)
            targetIff.rebuildCadieMagicBox();

        // só agora (tudo certo) troca a seleção de IFF na UI, se necessário
        if (getSelectedIFF().name !== targetIff.name) {
            const sel =
                document.getElementById('iff-sel');

            setSelectValue(sel, targetIff.name);
            sel.dispatchEvent(new Event('change'));
        }

        makeItemSelection(true);
        selectItem(existing);
        updateSelectedIFFOption();

        await new AlertModal('O item [' + (converted
                ? getVersaoLabelPorRegiao(srcRegion) + '->' + getVersaoLabelPorRegiao(tgtRegion)
                : getVersaoLabelPorRegiao(srcRegion))
            + '/' + targetIff.name + ']: "' + existing.getIdentifyName()
            + '" ' + (existing.__modified ? 'foi modificado' : 'não foi modificado dados iguais') + ' da área de transferência.').show();
    }
}

function deleteItem(evt) {
    const iff = getSelectedIFF();

    const item = evt.target.itemObj;

    iff.deleteElement(evt.target.index);

    evt.target.classList.toggle('deleted', true);

    linkItemDescription(item);
    linkCutinInfomation(item);

    if (item.__desc) {
        item.__desc.__deleted = true;
        updateIFFOption(iffs.find(i => i.name === 'Desc.iff'));
    }

    if (item.__cutin) {
        item.__cutin.__deleted = true;
        updateIFFOption(iffs.find(i => i.name === 'CutinInfomation.iff'));
    }

	if (iff.element_constructor == CadieMagicBox)
		iff.rebuildCadieMagicBox();

    makeItemSelection(false);
    updateSelectedIFFOption();
}

function undoDeleteItem(evt) {
    const iff = getSelectedIFF();

    const item = evt.target.itemObj;

    iff.undoDeletedElement(evt.target.index);

    evt.target.classList.toggle('deleted', false);

     if (item.__deleted2) {
         item.__deleted2 = false;
         item.__new = true;

         if (item.hasOwnProperty('typeid')) {
             const typeidExists = iff.elements.some(i => i !== item && !i.__deleted && !i.__deleted2 && i.typeid.value === item.typeid.value);

             if (typeidExists) {
                 if (item.filter) {
                     const filtered = iff.elements.filter(item.filter.bind(item));

                     if (filtered.length > 0)
                         item.typeid.value = filtered.reduce((max, i) => Math.max(max, i.typeid.value), -Infinity) + 1;
                 }else
                     item.typeid.value = iff.elements.reduce((max, i) => Math.max(max, i.typeid.value), -Infinity) + 1;

                 iff.elements.splice(evt.target.index, 1);

                 let newIdx = iff.elements.findIndex(i => item.typeid.value < i.typeid.value);

                 iff.elements.splice(newIdx == -1 ? iff.elements.length : newIdx, 0, item);
             }
         }

         if (iff.element_constructor == Part)
             item.position_mask.setSlot(Part.createTypeidbit(item.typeid.value).char_part_num, 1);
     }

    const descIffUndo = iffs.find(i => i.name === 'Desc.iff');

    if (descIffUndo) {
        const deletedDesc = descIffUndo.elements.find(d => (d.__deleted || d.__deleted2) && item.hasOwnProperty('typeid') && d.typeid.value === item.typeid.value);

        if (deletedDesc) {
            deletedDesc.__deleted = false;
            deletedDesc.__deleted2 = false;
            updateIFFOption(descIffUndo);
        }
    }

    const cutinIffUndo = iffs.find(i => i.name === 'CutinInfomation.iff');

    if (cutinIffUndo) {
        const deletedCutin = cutinIffUndo.elements.find(c => (c.__deleted || c.__deleted2) && item.hasOwnProperty('typeid') && c.typeid.value === item.typeid.value);

        if (deletedCutin) {
            deletedCutin.__deleted = false;
            deletedCutin.__deleted2 = false;
            updateIFFOption(cutinIffUndo);
        }
    }

    linkItemDescription(item);
    linkCutinInfomation(item);

	if (iff.element_constructor == CadieMagicBox)
		iff.rebuildCadieMagicBox();

    makeItemSelection(false);
    updateSelectedIFFOption();
}

function revertItem(evt) {
    const iff = getSelectedIFF();

    const item = evt.target.itemObj;

    item.restoreState();

    const idx = iff.elements.indexOf(item);

    iff.elements.splice(idx, 1);

    let newIdx = iff.elements.findIndex(i => item.typeid.value < i.typeid.value);

    iff.elements.splice(newIdx == -1 ? iff.elements.length : newIdx, 0, item);

	if (iff.element_constructor == CadieMagicBox)
		iff.rebuildCadieMagicBox();

    makeItemSelection(false);
    selectItem(item);
    updateSelectedIFFOption();
}

function hideItem(evt) {
    const itemSel = document.getElementById('item-sel');

    evt.target.itemObj.__hide = true;

	if (itemSel.selected.index == evt.target.index) {
    	const iff = getSelectedIFF();

		let idx = iff.elements.indexOf(evt.target.itemObj);

		let map = iff.elements.map((i, _idx) => !i.__hide ? [i, _idx] : null)
			.filter(i => i);

		let item = map.reduce((acc, i) => {
			if (!acc)
				return i;
			if (i[1] > acc[1] && i[1] < idx)
				return i;
			return acc;
		}, null)[0];

		selectItem(item);
	}

    makeItemSelection(false);
    updateSelectedIFFOption();
}

function unhideItem(evt) {
    evt.target.itemObj.__hide = false;

    makeItemSelection(false);
    updateSelectedIFFOption();
}

function showItem(evt) {
    const iff = getSelectedIFF();

    iff.elements.forEach(i => i.__hide = false);

    makeItemSelection(false);
    updateSelectedIFFOption();
}

// o filtro de estado atual vale para o iff? (active/disabled exigem o campo
// active; flag_shop_* exigem o shop.flag_shop)
// ---- container de filtros (checks/selects) ----

// mostra/esconde os grupos de filtro conforme os campos do iff e reseta os
// valores que não valem mais (checks desmarcados + selects zerados)
// toggle de 3 estados dos filtros booleanos (slide igual ao do campo active):
// desativado (0) / neutro (any, sem filtro) / ativado (1); o value vive num
// input hidden e o clique dispara change com bubbles
function buildTriToggle(_opts) {

    const input =
        document.createElement('input');

    input.type = 'hidden';
    input.value = _opts.value ?? 'any';

    if (_opts.id)
        input.id = _opts.id;

    const track =
        document.createElement('span');

    track.className =
        'tri-track';

    const states = [
        { v: '0', text: _opts.negText || '0' },
        { v: 'any', text: _opts.anyText || '\u2014' },
        { v: '1', text: _opts.posText || '1' },
    ];

    for (const st of states) {

        const cell =
            document.createElement('span');

        cell.className =
            'tri-cell';

        cell.textContent =
            st.text;

        cell.dataset.v =
            st.v;

        if (_opts.titles && _opts.titles[st.v])
            cell.title = _opts.titles[st.v];

        cell.addEventListener('click', evt => {

            evt.preventDefault();
            evt.stopPropagation();

            input.value =
                st.v;

            syncTri(root);

            input.dispatchEvent(new Event('change', { bubbles: true }));
        });

        track.appendChild(cell);
    }

    const root =
        document.createElement('label');

    root.className =
        'tri-toggle';

    root.appendChild(input);
    root.appendChild(track);

    syncTri(root);

    return { root, input };
}

// marca a célula ativa do tri-toggle conforme o value do input
function syncTri(_root) {

    const input =
        _root.querySelector('input');

    for (const cell of _root.querySelectorAll('.tri-cell'))
        cell.classList.toggle('tri-on', cell.dataset.v === input.value);
}

// volta os tri-toggles (dentro de _root) ao estado neutro (any)
function resetTriToggles(_root) {

    for (const t of (_root || document).querySelectorAll('.tri-toggle')) {

        const input =
            t.querySelector('input');

        // tri ainda não inicializado pelo buildTriToggle (span vazio no
        // app.htm) — nada a resetar
        if (!input)
            continue;

        input.value =
            'any';

        syncTri(t);
    }
}

// popula um select de filtro com os characters (ids do Character.iff — label
// `id — nome`), com ids extras vistos nos itens do próprio iff (fallback
// `Character N`). Mesmo esquema do f-part-character/f-cutin-character
function fillCharacterFilterOptions(_sel, _iff, _getCharId = null) {

    if (!_sel)
        return;

    const curVal =
        _sel.value;

    _sel.innerHTML = '<option value="">&#8212;</option>';

    const charIff =
        (window.iffs || iffs || []).find(i => i.name === 'Character.iff');

    const names =
        new Map();

    if (charIff && charIff.elements)
        for (const c of charIff.elements) {
            if (c.__deleted || c.__deleted2 || !c.typeid)
                continue;

            const id = getTypeidNum(c);
            const name = c.name ? stripEncodingMarker(c.name.value) : String(id);

            names.set(id, name);
        }

    if (_getCharId && _iff && _iff.elements)
        for (const el of _iff.elements) {
            const id = _getCharId(el);

            if (id != null && !names.has(id))
                names.set(id, 'Character ' + id);
        }

    for (const id of [...names.keys()].sort((a, b) => a - b)) {
        const opt = document.createElement('option');

        opt.value = String(id);
        opt.textContent = id + ' \u2014 ' + names.get(id);

        _sel.appendChild(opt);
    }

    destroyChoices(_sel);
    makeChoices(_sel, { searchEnabled: true });

    setSelectValue(_sel, curVal);
}

// popula um select de filtro com os courses (num do Course.iff — label
// `id — nome`), com o sentinela RANDOM (127) FIXO e ids extras vistos nos
// itens do próprio iff (fallback `Course N`). Usado pelo GrandPrixData e pelo
// GrandPrixSpecialHole — mesmo esquema do select course do layout
function fillCourseFilterOptions(_sel, _extraIds = null) {

    if (!_sel)
        return;

    const curVal =
        _sel.value;

    _sel.innerHTML = '<option value="">&#8212;</option>';

    const courseIff =
        (window.iffs || iffs || []).find(i => i.name === 'Course.iff');

    const courseNames =
        new Map();

    if (courseIff && courseIff.elements)
        for (const c of courseIff.elements) {
            if (c.__deleted || c.__deleted2 || !c.typeid)
                continue;

            const id = getTypeidNum(c);
            const name = c.name ? stripEncodingMarker(c.name.value) : String(id);

            courseNames.set(id, name);
        }

    // 127 (0x7F) é o sentinela RANDOM — opção fixa igual ao layout
    courseNames.set(127, 'RANDOM');

    if (_extraIds)
        for (const id of _extraIds)
            if (!courseNames.has(id))
                courseNames.set(id, id === 127 ? 'RANDOM' : ('Course ' + id));

    for (const id of [...courseNames.keys()].sort((a, b) => a - b)) {
        const opt = document.createElement('option');

        opt.value = String(id);
        opt.textContent = id + ' \u2014 ' + courseNames.get(id);

        _sel.appendChild(opt);
    }

    destroyChoices(_sel);
    makeChoices(_sel, { searchEnabled: true });

    setSelectValue(_sel, curVal);
}

function updateFilterPanelVisibility() {
    const wrap = document.getElementById('div-item-filter-wrap');
    if (!wrap)
        return;
    const hasIff = typeof iffs !== 'undefined' && iffs.length > 0;
    wrap.style.display = hasIff ? '' : 'none';
}

function refreshFilterPanel(_iff) {

    const has = _field => (_iff.elements || []).some(i => i.hasOwnProperty(_field));

    // grupos "base"/"level"/"fs-*" só para iffs cuja classe deriva de Base (date com
    // active_date / level com is_max / shop com flag_shop); CadieMagicBox etc.
    // têm campos com o mesmo nome mas sem a semântica da classe Base
    const isBaseModel =
        !!(_iff.element_constructor
            && _iff.element_constructor.prototype instanceof Base);

    const groups = [
        ['fg-active', has('active')],
        ['fg-fs-type', isBaseModel],
        ['fg-fs-icon', isBaseModel],
        // Base/Level vêm ANTES dos grupos por iff (tudo que deriva de Base
        // tem level/shop/date — os grupos gerais primeiro)
        ['fg-base', isBaseModel],
        ['fg-level', isBaseModel],
        ['fg-part', has('is_beginners') || has('type_item')],
        ['fg-club', _iff.name === 'Club.iff'],
        ['fg-ws', _iff.name === 'ClubSet.iff'],
        ['fg-cadie', _iff.name === 'CadieMagicBox.iff'],
        ['fg-ball', _iff.name === 'Ball.iff'],
        ['fg-caddie', _iff.name === 'Caddie.iff'],
        ['fg-caddieitem', _iff.name === 'CaddieItem.iff'],
        ['fg-item', _iff.name === 'Item.iff'],
        ['fg-setitem', _iff.name === 'SetItem.iff'],
        ['fg-match', _iff.name === 'Match.iff'],
        ['fg-skin', _iff.name === 'Skin.iff'],
        ['fg-furniture', _iff.name === 'Furniture.iff'],
        ['fg-enchant', _iff.name === 'Enchant.iff'],
        ['fg-achievement', _iff.name === 'Achievement.iff'],
        ['fg-counteritem', _iff.name === 'CounterItem.iff'],
        ['fg-auxpart', _iff.name === 'AuxPart.iff'],
        ['fg-queststuff', _iff.name === 'QuestStuff.iff'],
        ['fg-questitem', _iff.name === 'QuestItem.iff'],
        ['fg-timeitem', _iff.name === 'TimeLimitItem.iff'],
        ['fg-memorialcoin', _iff.name === 'MemorialShopCoinItem.sff'],
        ['fg-memorialrare', _iff.name === 'MemorialShopRareItem.iff'],
        ['fg-charmastery', _iff.name === 'CharacterMastery.iff'],
        ['fg-caddievoice', _iff.name === 'CaddieVoiceTable.iff'],
        ['fg-specialprize', _iff.name === 'SpecialPrizeItem.iff'],
        ['fg-shoplimit', _iff.name === 'ShopLimitItem.iff'],
        ['fg-pointshop', _iff.name === 'PointShop.iff'],
        ['fg-nonvisibleitem', _iff.name === 'NonVisibleItemTable.iff'],
        ['fg-artifactmana', _iff.name === 'ArtifactManaInfo.iff'],
        ['fg-subscriptionitem', _iff.name === 'SubscriptionItemTable.iff'],
        ['fg-twinsitem', _iff.name === 'TwinsItemTable.iff'],
        ['fg-levelup', _iff.name === 'LevelUpPrizeItem.iff'],
        ['fg-errorcodeinfo', _iff.name === 'ErrorCodeInfo.iff'],
        ['fg-ability', _iff.name === 'Ability.iff'],
        ['fg-seteffect', _iff.name === 'SetEffectTable.iff'],
        ['fg-clubsetwsprob', _iff.name === 'ClubSetWorkShopLevelUpProb.iff'],
        ['fg-clubsetlimit', _iff.name === 'ClubSetWorkShopLevelUpLimit.iff'],
        ['fg-clubsetrankupexp', _iff.name === 'ClubSetWorkShopRankUpExp.iff'],
        ['fg-card', _iff.name === 'Card.iff'],
        ['fg-hair', _iff.name === 'HairStyle.iff'],
        ['fg-cutin', _iff.name === 'CutinInfomation.iff'],
        ['fg-mascot', _iff.name === 'Mascot.iff'],
        ['fg-grandprix', _iff.name === 'GrandPrixData.iff'],
        ['fg-gpspecialhole', _iff.name === 'GrandPrixSpecialHole.iff'],
        ['fg-gprrank', _iff.name === 'GrandPrixRankReward.iff'],
        ['fg-gpaio', _iff.name === 'GrandPrixAIOptionalData.sff'],
    ];

    for (const [id, on] of groups) {

        const g = document.getElementById(id);

        if (!g)
            continue;

        g.hidden = !on;

        if (!on) {
            g.querySelectorAll('input[type=hidden]').forEach(inp => inp.value = 'any');
            resetTriToggles(g);
            g.querySelectorAll('select').forEach(resetFilterSelect);
            g.querySelectorAll('input[type=number]').forEach(inp => inp.value = '');
        }
    }

    if (_iff.name === 'Part.iff') {

        const sel = document.getElementById('f-part-character');

        if (sel) {

            const curVal = sel.value;

            sel.innerHTML = '<option value="">&#8212;</option>';

            const chIff = (window.iffs || iffs || []).find(i => i.name === 'Character.iff');
            const chNames = new Map();

            if (chIff && chIff.elements) {
                for (const c of chIff.elements) {
                    if (c.__deleted || c.__deleted2 || !c.typeid)
                        continue;

                    const id = getTypeidNum(c);
                    const name = c.name ? stripEncodingMarker(c.name.value) : String(id);

                    chNames.set(id, name);
                }
            }

            // garante os ids presentes no próprio Part.iff (mesmo sem o
            // Character.iff carregado / ids novos criados no editor)
            for (const el of (_iff.elements || []))
                if (el.typeid && el.typeid.value != null) {
                    const id = Part.createTypeidbit(el.typeid.value).char_identity;
                    if (id != null && !chNames.has(id))
                        chNames.set(id, 'Character ' + id);
                }

            const sortedIds = [...chNames.keys()].sort((a, b) => a - b);

            for (const id of sortedIds) {
                const opt = document.createElement('option');

                opt.value = String(id);
                opt.textContent = id + ' \u2014 ' + chNames.get(id);

                sel.appendChild(opt);
            }

            destroyChoices(sel);
            makeChoices(sel, { searchEnabled: true });

            setSelectValue(sel, curVal);
        }
    }

    if (_iff.name === 'CharacterMastery.iff') {

        const sel = document.getElementById('f-charmastery-character');

        if (sel) {

            const curVal = sel.value;

            while (sel.children.length)
                sel.removeChild(sel.children[0]);

            const opt0 = document.createElement('option');

            opt0.value = '';
            opt0.textContent = '\u2014';

            sel.appendChild(opt0);

            const chIff = (window.iffs || iffs || []).find(i => i.name === 'Character.iff');
            const chMap = new Map();

            if (chIff && chIff.elements) {
                for (const c of chIff.elements) {
                    if (c.__deleted || c.__deleted2 || !c.typeid)
                        continue;

                    const tid = c.typeid.value;
                    const name = c.name ? stripEncodingMarker(c.name.value) : '';

                    chMap.set(tid, '0x' + (tid >>> 0).toString(16) + ' - ' + name);
                }
            }

            // garante os typeids presentes no próprio CharacterMastery.iff
            // (mesmo sem o Character.iff carregado)
            for (const el of (_iff.elements || []))
                if (el.typeid && el.typeid.value != null && !chMap.has(el.typeid.value))
                    chMap.set(el.typeid.value, '0x' + (el.typeid.value >>> 0).toString(16));

            const sortedTids = [...chMap.keys()].sort((a, b) => a - b);

            for (const tid of sortedTids) {
                const opt = document.createElement('option');

                opt.value = String(tid);
                opt.textContent = chMap.get(tid);

                sel.appendChild(opt);
            }

            destroyChoices(sel);
            makeChoices(sel, { searchEnabled: true });

            setSelectValue(sel, curVal);
        }
    }

    if (_iff.name === 'CaddieItem.iff') {
        const sel = document.getElementById('f-caddieitem-caddie');

        if (sel) {
            const curVal = sel.value;

            sel.innerHTML = '<option value="">&#8212;</option>';

            const caddieIff = (window.iffs || iffs || []).find(i => i.name === 'Caddie.iff');
            const caddieMap = new Map();

            if (caddieIff && caddieIff.elements) {
                for (const c of caddieIff.elements) {
                    if (c.__deleted || c.__deleted2)
                        continue;

                    const id = getTypeidNum(c);
                    const name = c.name ? stripEncodingMarker(c.name.value) : String(id);

                    caddieMap.set(id, name);
                }
            }

            for (const el of (_iff.elements || [])) {
                if (el.typeid && el.typeid.value != null) {
                    const bf = CaddieItem.createTypeidbit(el.typeid.value);
                    const id = (bf.cad_item_cad_base_num || 0) + (bf.cad_item_cad_type_num || 0);

                    if (!caddieMap.has(id))
                        caddieMap.set(id, 'Caddie ' + id);
                }
            }

            const sortedIds = [...caddieMap.keys()].sort((a, b) => a - b);

            for (const id of sortedIds) {
                const opt = document.createElement('option');

                opt.value = String(id);
                opt.textContent = id + ' \u2014 ' + caddieMap.get(id);

                sel.appendChild(opt);
            }

            // o widget do Choices guarda as options de QUANDO foi criado; ao
            // repor as options nativas (innerHTML) a cada refresco os itens
            // antigos ficam desanexados e clicar no dropdown seta o selected
            // num elemento morto (o select nativo não muda e o filtro não
            // aplica). Força a reconstrução SEMPRE aqui.
            destroyChoices(sel);
            makeChoices(sel, { searchEnabled: true });

            setSelectValue(sel, curVal);
        }
    }

    if (_iff.name === 'GrandPrixData.iff') {

        // courses usados pelos itens mas ausentes no Course.iff carregado
        const extras =
            (_iff.elements || [])
                .filter(el => el.course_info && el.course_info.course && el.course_info.course.value != null)
                .map(el => el.course_info.course.value);

        fillCourseFilterOptions(document.getElementById('f-grandprix-course'), extras);

        // picker de hora (open/start/end) — SystemTime igual ao layout
        const timeWrap = document.getElementById('f-grandprix-time-wrap');

        if (timeWrap) {

            timeWrap.innerHTML = '';

            gGrandPrixTimeFilter = new SYSTEMTIME(undefined, { is_only_time: true });
            gGrandPrixTimeFilter.layout(timeWrap);
        }
    }

    if (_iff.name === 'GrandPrixAIOptionalData.sff') {

        // select de characters (ids do Character.iff — mesmo esquema do
        // f-part-character/f-cutin-character), casando o campo char_id
        fillCharacterFilterOptions(document.getElementById('f-gpaio-char'), _iff,
            _el => _el.char_id ? _el.char_id.value : null);
    }

    if (_iff.name === 'GrandPrixRankReward.iff') {

        const selT =
            document.getElementById('f-gprrank-trophy-sel');

        if (selT) {

            const curVal =
                selT.value;

            selT.innerHTML = '<option value="">&#8212;</option>';

            const mtIff =
                (window.iffs || iffs || []).find(i => i.name === 'Match.iff');

            if (mtIff && mtIff.elements)
                for (const m of mtIff.elements) {
                    if (m.__deleted || m.__deleted2)
                        continue;

                    const tb =
                        Match.createTypeidbit(m.typeid.value);

                    if (tb.match_special !== MatchSpecialType.GRAND_PRIX)
                        continue;

                    const opt =
                        document.createElement('option');

                    opt.value = String(m.typeid.value >>> 0);
                    opt.textContent = getItemListLabel(m);

                    selT.appendChild(opt);
                }

            destroyChoices(selT);
            makeChoices(selT, { searchEnabled: true });

            setSelectValue(selT, curVal);
        }
    }

    if (_iff.name === 'GrandPrixSpecialHole.iff') {

        const shExtras =
            (_iff.elements || [])
                .filter(el => el.course && el.course.value != null && el.course.value !== 0)
                .map(el => el.course.value);

        fillCourseFilterOptions(document.getElementById('f-gpspecialhole-course'), shExtras);
    }
    else if (_iff.name !== 'GrandPrixData.iff') {

        // limpa o picker de hora quando não é nenhum dos dois GP — o bloco do
        // GrandPrixData lá em cima JÁ preencheu o picker e não pode passar aqui

        const timeWrap = document.getElementById('f-grandprix-time-wrap');

        if (timeWrap)
            timeWrap.innerHTML = '';

        gGrandPrixTimeFilter = null;
    }

    if (_iff.name === 'HairStyle.iff') {

        const sel = document.getElementById('f-hair-character');

        if (sel) {

            const curVal = sel.value;

            sel.innerHTML = '<option value="">&#8212;</option>';

            const chIff = (window.iffs || iffs || []).find(i => i.name === 'Character.iff');
            const chNames = new Map();

            if (chIff && chIff.elements) {
                for (const c of chIff.elements) {
                    if (c.__deleted || c.__deleted2 || !c.typeid)
                        continue;

                    const id = getTypeidNum(c);
                    const name = c.name ? stripEncodingMarker(c.name.value) : String(id);

                    chNames.set(id, name);
                }
            }

            // garante os ids presentes no próprio HairStyle.iff (mesmo sem o
            // Character.iff carregado / ids novos criados no editor)
            for (const el of (_iff.elements || []))
                if (el.character && el.character.value != null)
                    if (!chNames.has(el.character.value))
                        chNames.set(el.character.value, 'Character ' + el.character.value);

            const sortedIds = [...chNames.keys()].sort((a, b) => a - b);

            for (const id of sortedIds) {
                const opt = document.createElement('option');

                opt.value = String(id);
                opt.textContent = id + ' \u2014 ' + chNames.get(id);

                sel.appendChild(opt);
            }

            // mesmas pegadinhas do select de caddie: ao repor as options a cada
            // refresco o widget guarda as antigas (desanexadas) — reconstrói SEMPRE
            destroyChoices(sel);
            makeChoices(sel, { searchEnabled: true });

            setSelectValue(sel, curVal);
        }
    }

    if (_iff.name === 'CutinInfomation.iff') {

        const sel = document.getElementById('f-cutin-character');

        if (sel) {

            const curVal = sel.value;

            sel.innerHTML = '<option value="">&#8212;</option>';

            const chIff = (window.iffs || iffs || []).find(i => i.name === 'Character.iff');
            const chNames = new Map();

            if (chIff && chIff.elements) {
                for (const c of chIff.elements) {
                    if (c.__deleted || c.__deleted2 || !c.typeid)
                        continue;

                    const id = getTypeidNum(c);
                    const name = c.name ? stripEncodingMarker(c.name.value) : String(id);

                    chNames.set(id, name);
                }
            }

            // garante os ids presentes no próprio CutinInfomation.iff (mesmo
            // sem o Character.iff carregado / ids novos criados no editor)
            for (const el of (_iff.elements || []))
                if (el.character_id && el.character_id.value != null)
                    if (!chNames.has(el.character_id.value))
                        chNames.set(el.character_id.value, 'Character ' + el.character_id.value);

            const sortedIds = [...chNames.keys()].sort((a, b) => a - b);

            for (const id of sortedIds) {
                const opt = document.createElement('option');

                opt.value = String(id);
                opt.textContent = id + ' \u2014 ' + chNames.get(id);

                sel.appendChild(opt);
            }

            destroyChoices(sel);
            makeChoices(sel, { searchEnabled: true });

            setSelectValue(sel, curVal);
        }
    }

    renderFlagShopChecks(_iff);
}

// popula os checks de flag_shop com os bits do primeiro elemento que tem
// shop.flag_shop (type: is_cash/can_dup/...; icon: is_new/is_hot)
function renderFlagShopChecks(_iff) {

    const el =
        (_iff.elements || []).find(i => !!(i.shop && i.shop.flag_shop));

    for (const key of ['type', 'icon']) {

        const og =
            document.getElementById('fg-fs-' + key);

        if (!og)
            continue;

        // preserva o <legend> do fieldset ao reconstruir os checks
        const legend =
            og.querySelector('legend');

        og.innerHTML = '';

        if (legend)
            og.appendChild(legend);

        if (!el)
            continue;

        const bf = el.shop.flag_shop[key];

        for (const g of (bf.groups || [])) {

            const label =
                document.createElement('label');

            label.className =
                'filter-check';

            label.title =
                'Checado = bit ligado; deschecado = bit desligado; meio = sem filtro';

            const name =
                document.createElement('span');

            name.className =
                'filter-tri-name';

            name.textContent =
                g.name;

            label.appendChild(name);

            const tri =
                buildTriToggle({
                    id: 'f-fs-' + key + '-' + g.name,
                    negText: 'NÃO',
                    anyText: '\u2014',
                    posText: 'SIM',
                    titles: {
                        '0': 'Somente bit desligado',
                        'any': 'Sem filtro',
                        '1': 'Somente bit ligado',
                    },
                });

            tri.input.dataset.fs =
                key + '|' + g.name;

            label.appendChild(tri.root);

            og.appendChild(label);
        }
    }
}

// lê o estado atual dos filtros no container (checks/selects)
function getFilterState() {

    const checked =
        _id => {
            const el = document.getElementById(_id);
            return !!(el && el.checked);
        };

    const value =
        _id => {
            const el = document.getElementById(_id);
            return el ? el.value : '';
        };

    // tri-toggle dos booleanos: '1' (valor ligado), '0' (desligado) ou 'any'
    // (neutro — valor ausente/vazio cai em 'any' também)
    const tri =
        _id => {
            const el = document.getElementById(_id);
            const v = el ? el.value : 'any';
            return (v === '1' || v === '0') ? v : 'any';
        };

    const flagShopBits = {};

    for (const key of ['type', 'icon']) {

        const g =
            document.getElementById('fg-fs-' + key);

        if (!g)
            continue;

        for (const el of g.querySelectorAll('input')) {

            if (el.dataset && el.dataset.fs)
                flagShopBits[el.dataset.fs] =
                    (el.value === '1' || el.value === '0') ? el.value : 'any';
        }
    }

    return {
        all: checked('f-all'),
        active: tri('f-active'),
        beginners: tri('f-beginners'),
        timeShop: tri('f-time-shop'),
        activeDate: tri('f-active-date'),
        levelMax: tri('f-level-max'),
        new: checked('f-new'),
        modified: checked('f-modified'),
        deleted: checked('f-deleted'),
        hidden: checked('f-hidden'),
        encoding: checked('f-encoding'),
        flagShopBits,
        levelOp: value('f-level-op'),
        levelValue: value('f-level-value'),
        typeItem: value('f-type-item'),
        tipo: value('f-tipo'),
        partSlot: value('f-part-slot'),
        partSubType: value('f-part-subtype'),
        partCharacter: value('f-part-character'),
        partEquipable: tri('f-part-equipable'),
        partSubPart: tri('f-part-subpart'),
        wsTipo: value('f-ws-tipo'),
        wsRankSStat: value('f-ws-rank-s-stat'),
        wsTipoRankS: value('f-ws-tipo-rank-s'),
        wsCanTransform: tri('f-ws-can-transform'),
        cadieSetor: value('f-cadie-setor'),
        cadieBoxCharacter: value('f-cadiebox-character'),
        consumableType: value('f-consumable-type'),
        valorMensal: tri('f-valor-mensal'),
        mascotMsgActive: tri('f-mascot-msg-active'),
        mascotPowerDrive: tri('f-mascot-power-drive'),
        mascotDropRate: tri('f-mascot-drop-rate'),
        mascotPowerGauge: tri('f-mascot-power-gauge'),
        mascotExpRate: tri('f-mascot-exp-rate'),
        mascotItemSlot: tri('f-mascot-item-slot'),
        auxPowerDrive: tri('f-aux-power-drive'),
        auxDropRate: tri('f-aux-drop-rate'),
        auxPowerGauge: tri('f-aux-power-gauge'),
        auxPangRate: tri('f-aux-pang-rate'),
        auxExpRate: tri('f-aux-exp-rate'),
        auxLinkPowerDrive: tri('f-aux-link-power-drive'),
        itemPeriodOp: value('f-base-period-op'),
        itemPeriod: value('f-base-period'),
        priceOp: value('f-base-price-op'),
        priceValue: value('f-base-price'),
        salePriceOp: value('f-base-sale-price-op'),
        salePriceValue: value('f-base-sale-price'),
        discount: tri('f-base-discount'),
        itemTipo: value('f-item-tipo'),
        itemPassive: tri('f-item-passive'),
        itemType: value('f-item-type'),
        caddieItemCaddie: value('f-caddieitem-caddie'),
        setItemSub: value('f-setitem-sub'),
        setItemSubChar: value('f-setitem-sub-char'),
        matchSpecial: value('f-match-special'),
        skinType: value('f-skin-type'),
        furnitureType: value('f-furniture-type'),
        enchantStats: value('f-enchant-stats'),
        achievementClass: value('f-achievement-class'),
        counterItemPoint: value('f-counteritem-point'),
        auxInfinity: tri('f-aux-infinity'),
        auxLeftHand: tri('f-aux-left-hand'),
        questStuffType: value('f-queststuff-type'),
        questItemType: value('f-questitem-type'),
        questItemFieldType: value('f-questitem-field-type'),
        timeItemType: value('f-timeitem-type'),
        specialPrizeType: value('f-specialprize-type'),
        memorialCoinType: value('f-memorialcoin-type'),
        memorialCoinFilter: value('f-memorialcoin-filter'),
        memorialCoinGachaOp: value('f-memorialcoin-gacha-op'),
        memorialCoinGachaNum: value('f-memorialcoin-gacha-num'),
        memorialRareType: value('f-memorialrare-rare-type'),
        memorialRareFilter: value('f-memorialrare-filter'),
        memorialRareGachaOp: value('f-memorialrare-gacha-op'),
        memorialRareGachaNum: value('f-memorialrare-gacha-num'),
        charMasterySeq: value('f-charmastery-seq'),
        charMasteryStats: value('f-charmastery-stats'),
        charMasteryLevelOp: value('f-charmastery-level-op'),
        charMasteryLevel: value('f-charmastery-level'),
        charMasteryCharacter: value('f-charmastery-character'),
        caddieVoiceLevel: value('f-caddievoice-level'),
        shopLimitType: value('f-shoplimit-type'),
        pointShopRarity: value('f-pointshop-rarity'),
        nonVisibleItemType: value('f-nonvisibleitem-type'),
        subscriptionItemType: value('f-subscriptionitem-type'),
        twinsItemType: value('f-twinsitem-type'),
        levelUpLevel: value('f-levelup-level'),
        artifactManaType: value('f-artifactmana-type'),
        errorCodeInfoType: value('f-errorcodeinfo-type'),
        abilityType: value('f-ability-type'),
        abilityEffect: value('f-ability-effect'),
        setEffectEffect: value('f-seteffect-effect'),
        setEffectType: value('f-seteffect-type'),
        clubsetWsProbTipo: value('f-clubsetwsprob-tipo'),
        clubsetLimitTipo: value('f-clubsetlimit-tipo'),
        clubsetLimitRank: value('f-clubsetlimit-rank'),
        clubsetRankUpExpTipo: value('f-clubsetrankupexp-tipo'),
        cardType: value('f-card-type'),
        cardTipo: value('f-card-tipo'),
        cardVolume: value('f-card-volume'),
        cardEfeito: value('f-card-efeito'),
        cardEfeitoType: cardEfeitoGroupType(),
        hairCharacter: value('f-hair-character'),
        cutinCharacter: value('f-cutin-character'),
        grandPrixGpEvent: value('f-grandprix-gp-event'),
        grandPrixType: value('f-grandprix-type'),
        grandPrixGpClass: value('f-grandprix-gp-class'),
        grandPrixClass: value('f-grandprix-class'),
        grandPrixRule: value('f-grandprix-rule'),
        grandPrixNatural: value('f-grandprix-natural'),
        grandPrixShort: value('f-grandprix-short'),
        grandPrixHoleCup: value('f-grandprix-holecup'),
        grandPrixCondition: value('f-grandprix-condition'),
        grandPrixTicket: value('f-grandprix-ticket'),
        grandPrixGpClear: value('f-grandprix-gp-clear'),
        grandPrixCourse: value('f-grandprix-course'),
        grandPrixModo: value('f-grandprix-modo'),
        grandPrixLevelOp: value('f-grandprix-level-op'),
        grandPrixLevel: value('f-grandprix-level'),
        grandPrixTime: gGrandPrixTimeFilter && !gGrandPrixTimeFilter.isEmpty()
            ? gGrandPrixTimeFilter.wHour.value * 3600 + gGrandPrixTimeFilter.wMinute.value * 60 + gGrandPrixTimeFilter.wSecond.value
            : '',
        grandPrixSHCourse: value('f-gpspecialhole-course'),
        grandPrixSHHole: value('f-gpspecialhole-hole'),
        grandPrixSHSeq: value('f-gpspecialhole-seq'),
        grandPrixRRRank: value('f-gprrank-rank'),
        grandPrixRRTrophy: value('f-gprrank-trophy'),
        grandPrixRRTrophySel: value('f-gprrank-trophy-sel'),
        grandPrixAIChar: value('f-gpaio-char'),
        grandPrixAIClass: value('f-gpaio-class'),
    };
}

// type do optgroup selecionado do f-card-efeito (Card.iff): o optgroup guarda
// o type do typeid da carta (dataset.cardType do fillEnumFilterOptions); o
// filtro de efeito.type é LIGADO ao type (o valor cru existe em vários types,
// ex.: 1 = POWER_DECREASE/POWER/EXP/PP); '' se a opção não está em grupo ou
// nada está selecionado
function cardEfeitoGroupType() {

    const sel = document.getElementById('f-card-efeito');

    if (!sel)
        return '';

    // browser: selectedOptions; stub: a option marcada (o setter `selected`
    // do domstub marca e sincroniza o .value do select)
    let opt = null;

    if (sel.selectedOptions && sel.selectedOptions.length)
        opt = sel.selectedOptions[0];

    if (!opt) {
        const walk = el => {
            for (const c of (el.children || [])) {
                if (c.tagName === 'OPTION' && c.selected) { opt = c; return true; }
                if (walk(c)) return true;
            }
            return false;
        };
        walk(sel);
    }

    const og = opt && (opt.parentElement || opt.parent);

    const t = og && og.dataset && og.dataset.cardType;

    return t == null ? '' : String(t);
}

// valor numérico do campo level do item: Level (bitfield, getter .level) ou
// LevelValue32/16/8 (.value); null quando o item não tem o campo
function itemLevelValue(_obj) {

    const lv = _obj && _obj.level;

    if (!lv)
        return null;

    if (typeof lv.level === 'number')
        return lv.level;

    if (typeof lv.value === 'number')
        return lv.value;

    return null;
}

// item casa com o estado dos filtros (objeto de getFilterState): booleanos são
// tri ('1' exige ligado, '0' exige desligado, 'any'/ausente não filtra); AND
// entre grupos, OR dentro do grupo de Estado; "Todos" ignora os demais filtros
function itemMatchesState(_item, _state) {

    if (!_state)
        return true;

    if (_state.all)
        return true;

    // helper tri: '1' casa valor ligado, '0' casa desligado, any/ausente ignora
    const triMatch =
        (_tri, _value) => {

            if (_tri == null || _tri === 'any')
                return true;

            const v = _value ? 1 : 0;

            return (_tri === '1' && v === 1)
                || (_tri === '0' && v === 0);
        };

    const obj = _item.itemObj;
    const has = _cls => _item.classList.contains(_cls);

    // Atividade: tri do active (1 = ativos, 0 = desativados)
    if (!triMatch(_state.active, !has('item-disable')))
        return false;

    // Estado: união dos checks marcados (um item pode ser novo e modificado)
    if (_state.new || _state.modified || _state.deleted || _state.hidden || _state.encoding) {

        const ok =
            (_state.new && has('item-new'))
            || (_state.modified && has('item-modified'))
            || (_state.deleted && has('item-deleted'))
            || (_state.hidden && has('item-hide'))
            || (_state.encoding && has('item-encoding'));

        if (!ok)
            return false;
    }

    // flag_shop: tri por bit (1 = ligado, 0 = desligado)
    const fsKeys =
        Object.keys(_state.flagShopBits || {});

    for (const k of fsKeys) {

        const tri = _state.flagShopBits[k];

        if (tri === 'any')
            continue;

        const [grp, bit] = k.split('|');
        const bf = obj && obj.shop && obj.shop.flag_shop && obj.shop.flag_shop[grp];

        if (!triMatch(tri, !!(bf && bf[bit] === 1)))
            return false;
    }

    // Part.iff: Iniciantes (is_beginners) e type_item (igualdade)
    if (!triMatch(_state.beginners, !!(obj && obj.is_beginners && obj.is_beginners.value == 1)))
        return false;

    if (_state.typeItem !== '') {

        const tv = obj && obj.type_item ? obj.type_item.value : null;

        if (tv == null || tv !== Number(_state.typeItem))
            return false;
    }

    // Part.iff: slot do char_part_num no typeid (0-23, mesmo valor que trava
    // o bit do position_mask)
    if (_state.partSlot !== '') {

        const ps = obj instanceof Part ? Part.createTypeidbit(obj.typeid.value).char_part_num : null;

        if (ps == null || ps !== Number(_state.partSlot))
            return false;
    }

    // Part.iff: character do typeid (bit char_identity — o mesmo select do
    // modal de novo item)
    if (_state.partCharacter !== '') {

        const ci = obj instanceof Part ? Part.createTypeidbit(obj.typeid.value).char_identity : null;

        if (ci == null || ci !== Number(_state.partCharacter))
            return false;
    }

    // Part.iff: char_sub_type_num (OR de tags) — casa por bit: o valor
    // selecionado precisa estar setado no valor do item (ex.: SUB → & 1 == 1);
    // REPLACE (0) não tem bit — casa por igualdade (valor == 0)
    if (_state.partSubType !== '') {

        const stv = obj instanceof Part
            ? Part.createTypeidbit(obj.typeid.value).char_sub_type_num
            : null;

        if (stv == null)
            return false;

        const want = Number(_state.partSubType);

        if (want === 0 ? stv !== 0 : (stv & want) !== want)
            return false;
    }

    // Part.iff: equipable_with — TEM = texto não vazio ('' = NÃO TEM)
    if (!triMatch(_state.partEquipable, !!(obj && obj.equipable_with
        && typeof obj.equipable_with.value === 'string'
        && obj.equipable_with.value !== '')))
        return false;

    // Part.iff: sub_part — TEM = algum slot do array != 0
    if (!triMatch(_state.partSubPart, !!(obj && obj.sub_part
        && obj.sub_part.some(v => v && v.value !== 0))))
        return false;

    // Club.iff: tipo do taco (igualdade)
    if (_state.tipo !== '') {

        const cv = obj && obj.tipo ? obj.tipo.value : null;

        if (cv == null || cv !== Number(_state.tipo))
            return false;
    }

    // ClubSet.iff: work_shop (tipo/tipo_rank_s/rank_s_stat iguais + can_transform tri)
    const ws = obj && obj.work_shop;

    if (_state.wsTipo !== '') {

        const tv = ws && ws.tipo ? ws.tipo.value : null;

        if (tv == null || tv !== Number(_state.wsTipo))
            return false;
    }

    if (_state.wsTipoRankS !== '') {

        const tv = ws && ws.tipo_rank_s ? ws.tipo_rank_s.value : null;

        if (tv == null || tv !== Number(_state.wsTipoRankS))
            return false;
    }

    if (_state.wsRankSStat !== '') {

        const tv = ws && ws.rank_s_stat ? ws.rank_s_stat.value : null;

        if (tv == null || tv !== Number(_state.wsRankSStat))
            return false;
    }

    if (!triMatch(_state.wsCanTransform, !!(ws && ws.can_transform && ws.can_transform.value == 1)))
        return false;

    // CadieMagicBox.iff: setor (igualdade)
    if (_state.cadieSetor !== '') {

        const sv = obj && obj.setor ? obj.setor.value : null;

        if (sv == null || sv !== Number(_state.cadieSetor))
            return false;
    }

    // CadieMagicBox.iff: character (igualdade — campo, não bit do typeid)
    if (_state.cadieBoxCharacter !== '') {

        const cv = obj && obj.character ? obj.character.value : null;

        if (cv == null || cv !== Number(_state.cadieBoxCharacter))
            return false;
    }

    // Caddie.iff: valor_mensal — tri (0 = eterno, != 0 = mensal)
    if (!triMatch(_state.valorMensal, !!(obj && obj.valor_mensal && obj.valor_mensal.value != 0)))
        return false;

    // Mascot.iff: msg.active — tri (1 = mensagem ativa, 0 = desativada)
    if (!triMatch(_state.mascotMsgActive, !!(obj && obj.msg && obj.msg.active && obj.msg.active.value == 1)))
        return false;

    // efeito do Mascot: tris "tem X" (campo != 0)
    if (!triMatch(_state.mascotPowerDrive, !!(obj && obj.efeito && obj.efeito.power_drive && obj.efeito.power_drive.value != 0)))
        return false;

    if (!triMatch(_state.mascotDropRate, !!(obj && obj.efeito && obj.efeito.drop_rate && obj.efeito.drop_rate.value != 0)))
        return false;

    if (!triMatch(_state.mascotPowerGauge, !!(obj && obj.efeito && obj.efeito.power_gauge && obj.efeito.power_gauge.value != 0)))
        return false;

    if (!triMatch(_state.mascotExpRate, !!(obj && obj.efeito && obj.efeito.exp_rate && obj.efeito.exp_rate.value != 0)))
        return false;

    if (!triMatch(_state.mascotItemSlot, !!(obj && obj.efeito && obj.efeito.item_slot && obj.efeito.item_slot.value != 0)))
        return false;

    // CaddieItem.iff: caddie ID (igualdade)
    if (_state.caddieItemCaddie !== '') {
        const ci = obj instanceof CaddieItem ? obj : null;

        if (!ci)
            return false;

        const bf = CaddieItem.createTypeidbit(ci.typeid.value);
        const cadId = (bf.cad_item_cad_base_num || 0) + (bf.cad_item_cad_type_num || 0);

        if (cadId !== Number(_state.caddieItemCaddie))
            return false;
    }

    // Ball.iff: consumable_type (igualdade, enum TYPE_BALL_CONSUMABLE)
    if (_state.consumableType !== '') {

        const cv = obj && obj.consumable_type ? obj.consumable_type.value : null;

        if (cv == null || cv !== Number(_state.consumableType))
            return false;
    }

    // período do time_shop (grupo Base — time_shop é campo do Base, vale para
    // qualquer iff com modelo Base): igualdade/derivadas sobre o valor numérico
    // do period (Int8Type — não é mais enum/select; o filtro usa o comparador
    // f-base-period-op igual ao do filtro de level + valor numérico)
    if (_state.itemPeriodOp !== '' && _state.itemPeriod !== '') {

        const pv = obj && obj.shop && obj.shop.time_shop && obj.shop.time_shop.period
            ? obj.shop.time_shop.period.value : null;

        if (pv == null)
            return false;

        const v = Number(_state.itemPeriod);

        switch (_state.itemPeriodOp) {
            case 'eq': if (pv !== v) return false; break;
            case 'ne': if (pv === v) return false; break;
            case 'lt': if (pv >= v) return false; break;
            case 'le': if (pv > v) return false; break;
            case 'gt': if (pv <= v) return false; break;
            case 'ge': if (pv < v) return false; break;
        }
    }

    // Base: tem desconto (shop.sale_price > 0) + comparador de preço/sale_price
    if (!triMatch(_state.discount, !!(obj && obj.shop && obj.shop.sale_price && obj.shop.sale_price.value > 0)))
        return false;

    if (_state.priceOp !== '' && _state.priceValue !== '') {

        const pv = obj && obj.shop ? obj.shop.price.value : null;

        if (pv == null)
            return false;

        const v = Number(_state.priceValue);

        switch (_state.priceOp) {
            case 'eq': if (pv !== v) return false; break;
            case 'ne': if (pv === v) return false; break;
            case 'lt': if (pv >= v) return false; break;
            case 'le': if (pv > v) return false; break;
            case 'gt': if (pv <= v) return false; break;
            case 'ge': if (pv < v) return false; break;
        }
    }

    if (_state.salePriceOp !== '' && _state.salePriceValue !== '') {

        const sv = obj && obj.shop ? obj.shop.sale_price.value : null;

        if (sv == null)
            return false;

        const v = Number(_state.salePriceValue);

        switch (_state.salePriceOp) {
            case 'eq': if (sv !== v) return false; break;
            case 'ne': if (sv === v) return false; break;
            case 'lt': if (sv >= v) return false; break;
            case 'le': if (sv > v) return false; break;
            case 'gt': if (sv <= v) return false; break;
            case 'ge': if (sv < v) return false; break;
        }
    }

    // Item.iff: tipo_item (igualdade, enum ItemTipo)
    if (_state.itemTipo !== '') {

        const tv = obj && obj.tipo_item ? obj.tipo_item.value : null;

        if (tv == null || tv !== Number(_state.itemTipo))
            return false;
    }

    // Item.iff: item_passive (booleano do typeid) e item_type (integer do
    // typeid) — ambos lidos via Item.createTypeidbit
    if (obj instanceof Item) {

        const tb = Item.createTypeidbit(obj.typeid.value);

        if (!triMatch(_state.itemPassive, !!(tb && tb.item_passive === 1)))
            return false;

        if (_state.itemType !== '') {

            const tv = tb ? tb.item_type : null;

            if (tv == null || tv !== Number(_state.itemType))
                return false;
        }
    }

    // SetItem.iff: set_item_sub_type e set_item_sub_type_char (bits do typeid —
    // igualdade, enums SetItemSubType/SetItemSubTypeChar)
    const setTb =
        obj && obj.typeid && typeof obj.typeid.value === 'number'
            ? SetItem.createTypeidbit(obj.typeid.value) : null;

    if (_state.setItemSub !== '') {

        const tv = setTb ? setTb.set_item_sub_type : null;

        if (tv == null || tv !== Number(_state.setItemSub))
            return false;
    }

    if (_state.setItemSubChar !== '') {

        const tv = setTb ? setTb.set_item_sub_type_char : null;

        if (tv == null || tv !== Number(_state.setItemSubChar))
            return false;
    }

    // Match.iff: match_special (bits do typeid — igualdade, enum
    // MatchSpecialType)
    const matchTb =
        obj && obj.typeid && typeof obj.typeid.value === 'number'
            ? Match.createTypeidbit(obj.typeid.value) : null;

    if (_state.matchSpecial !== '') {

        const tv = matchTb ? matchTb.match_special : null;

        if (tv == null || tv !== Number(_state.matchSpecial))
            return false;
    }

    // Enchant.iff: stats_type (bits do typeid — igualdade, enum statistics)
    const enchantTb =
        obj && obj.typeid && typeof obj.typeid.value === 'number'
            ? Enchant.createTypeidbit(obj.typeid.value) : null;

    if (_state.enchantStats !== '') {

        const tv = enchantTb ? enchantTb.stats_type : null;

        if (tv == null || tv !== Number(_state.enchantStats))
            return false;
    }

    // Skin.iff: type (bits do typeid — igualdade, enum SkinType)
    const skinTb =
        obj && obj.typeid && typeof obj.typeid.value === 'number'
            ? Skin.createTypeidbit(obj.typeid.value) : null;

    if (_state.skinType !== '') {

        const tv = skinTb ? skinTb.type : null;

        if (tv == null || tv !== Number(_state.skinType))
            return false;
    }

    // Furniture.iff: type (bits do typeid — igualdade, enum FurnitureType)
    const furnitureTb =
        obj && obj.typeid && typeof obj.typeid.value === 'number'
            ? Furniture.createTypeidbit(obj.typeid.value) : null;

    if (_state.furnitureType !== '') {

        const tv = furnitureTb ? furnitureTb.type : null;

        if (tv == null || tv !== Number(_state.furnitureType))
            return false;
    }

    // Achievement.iff: class (bits do typeid — igualdade, enum AchievementTipo)
    const achievementTb =
        obj && obj.typeid && typeof obj.typeid.value === 'number'
            ? Achievement.createTypeidbit(obj.typeid.value) : null;

    if (_state.achievementClass !== '') {

        const tv = achievementTb ? achievementTb.class : null;

        if (tv == null || tv !== Number(_state.achievementClass))
            return false;
    }

    // CounterItem.iff: is_achievement_point (bits do typeid — igualdade,
    // enum CounterItemPointType)
    const counterTb =
        obj && obj.typeid && typeof obj.typeid.value === 'number'
            ? CounterItem.createTypeidbit(obj.typeid.value) : null;

    if (_state.counterItemPoint !== '') {

        const tv = counterTb ? counterTb.is_achievement_point : null;

        if (tv == null || tv !== Number(_state.counterItemPoint))
            return false;
    }

    // AuxPart.iff: is_infinity/is_left_hand — tris (bits de 5 do typeid)
    if (!triMatch(_state.auxInfinity, !!(obj instanceof AuxPart && AuxPart.createTypeidbit(obj.typeid.value).is_infinity === 1)))
        return false;

    if (!triMatch(_state.auxLeftHand, !!(obj instanceof AuxPart && AuxPart.createTypeidbit(obj.typeid.value).is_left_hand === 1)))
        return false;
    if (!triMatch(_state.auxPowerDrive, !!(obj && obj.efeito && obj.efeito.power_drive && obj.efeito.power_drive.value != 0)))
        return false;

    if (!triMatch(_state.auxDropRate, !!(obj && obj.efeito && obj.efeito.drop_rate && obj.efeito.drop_rate.value != 0)))
        return false;

    if (!triMatch(_state.auxPowerGauge, !!(obj && obj.efeito && obj.efeito.power_gauge && obj.efeito.power_gauge.value != 0)))
        return false;

    if (!triMatch(_state.auxPangRate, !!(obj && obj.efeito && obj.efeito.pang_rate && obj.efeito.pang_rate.value != 0)))
        return false;

    if (!triMatch(_state.auxExpRate, !!(obj && obj.efeito && obj.efeito.exp_rate && obj.efeito.exp_rate.value != 0)))
        return false;

    if (!triMatch(_state.auxLinkPowerDrive, !!(obj && obj.efeito && obj.efeito.link_power_drive && obj.efeito.link_power_drive.value != 0)))
        return false;


    // QuestStuff.iff: type (bits do typeid — igualdade, enum QuestStuffType)
    const questStuffTb =
        obj && obj.typeid && typeof obj.typeid.value === 'number'
            ? QuestStuff.createTypeidbit(obj.typeid.value) : null;

    if (_state.questStuffType !== '') {

        const tv = questStuffTb ? questStuffTb.type : null;

        if (tv == null || tv !== Number(_state.questStuffType))
            return false;
    }

    // QuestItem.iff: type (bits do typeid — igualdade, enum QuestItemType)
    const questItemTb =
        obj && obj.typeid && typeof obj.typeid.value === 'number'
            ? QuestItem.createTypeidbit(obj.typeid.value) : null;

    if (_state.questItemType !== '') {

        const tv = questItemTb ? questItemTb.type : null;

        if (tv == null || tv !== Number(_state.questItemType))
            return false;
    }

    // QuestItem.iff: type do CAMPO (igualdade, enum QuestItemFieldType — dados
    // distintos do bit do typeid, não sincronizados)
    if (_state.questItemFieldType !== '') {

        const fv = obj && obj.type && obj.type.value != null ? obj.type.value : null;

        if (fv == null || fv !== Number(_state.questItemFieldType))
            return false;
    }

    // TimeLimitItem.iff: type do CAMPO (igualdade, enum TimeLimitItemType)
    if (_state.timeItemType !== '') {

        const fv = obj && obj.type && obj.type.value != null ? obj.type.value : null;

        if (fv == null || fv !== Number(_state.timeItemType))
            return false;
    }

    // SpecialPrizeItem.iff: type do CAMPO (igualdade, enum SpecialPrizeItemType)
    if (_state.specialPrizeType !== '') {

        const fv = obj && obj.type && obj.type.value != null ? obj.type.value : null;

        if (fv == null || fv !== Number(_state.specialPrizeType))
            return false;
    }

    // ShopLimitItem.iff: type do CAMPO (igualdade, enum ShopLimitItemType)
    if (_state.shopLimitType !== '') {

        const fv = obj && obj.type && obj.type.value != null ? obj.type.value : null;

        if (fv == null || fv !== Number(_state.shopLimitType))
            return false;
    }

    // PointShop.iff: rarity do CAMPO (igualdade, enum PointShopRarityType)
    if (_state.pointShopRarity !== '') {

        const fv = obj && obj.rarity && obj.rarity.value != null ? obj.rarity.value : null;

        if (fv == null || fv !== Number(_state.pointShopRarity))
            return false;
    }

    // NonVisibleItemTable.iff: type do CAMPO (igualdade, enum NonVisibleItemTableType)
    if (_state.nonVisibleItemType !== '') {

        const fv = obj && obj.type && obj.type.value != null ? obj.type.value : null;

        if (fv == null || fv !== Number(_state.nonVisibleItemType))
            return false;
    }

    // SubscriptionItemTable.iff: type do CAMPO (igualdade, enum ItemTableType)
    if (_state.subscriptionItemType !== '') {

        const fv = obj && obj.type && obj.type.value != null ? obj.type.value : null;

        if (fv == null || fv !== Number(_state.subscriptionItemType))
            return false;
    }

    // TwinsItemTable.iff: type do CAMPO (igualdade, enum ItemTableType)
    if (_state.twinsItemType !== '') {

        const fv = obj && obj.type && obj.type.value != null ? obj.type.value : null;

        if (fv == null || fv !== Number(_state.twinsItemType))
            return false;
    }

    // LevelUpPrizeItem.iff: level do CAMPO (igualdade, enum enLEVEL)
    if (_state.levelUpLevel !== '') {

        const fv = obj && obj.level && obj.level.value != null ? obj.level.value : null;

        if (fv == null || fv !== Number(_state.levelUpLevel))
            return false;
    }

    // ArtifactManaInfo.iff: type do CAMPO (igualdade, enum ArtifactManaInfoType)
    if (_state.artifactManaType !== '') {

        const fv = obj && obj.type && obj.type.value != null ? obj.type.value : null;

        if (fv == null || fv !== Number(_state.artifactManaType))
            return false;
    }

    // ErrorCodeInfo.iff: type do CAMPO (igualdade, enum ErrorCodeInfoType)
    if (_state.errorCodeInfoType !== '') {

        const fv = obj && obj.type && obj.type.value != null ? obj.type.value : null;

        if (fv == null || fv !== Number(_state.errorCodeInfoType))
            return false;
    }

    // Ability.iff: type do CAMPO (igualdade, enum ItemTableType)
    if (_state.abilityType !== '') {

        const fv = obj && obj.type && obj.type.value != null ? obj.type.value : null;

        if (fv == null || fv !== Number(_state.abilityType))
            return false;
    }

    // Ability.iff: efeito.type é um ARRAY — casa se QUALQUER slot for igual
    // ao efeito selecionado (some; NONE=0 também casa com slots zerados)
    if (_state.abilityEffect !== '') {

        const arr = obj && obj.efeito && obj.efeito.type;

        if (!arr || !arr.some(t => t && t.value === Number(_state.abilityEffect)))
            return false;
    }

    // SetEffectTable.iff: effect.effect é um ARRAY — casa se QUALQUER slot igual
    if (_state.setEffectEffect !== '') {

        const arr = obj && obj.effect && obj.effect.effect;

        if (!arr || !arr.some(t => t && t.value === Number(_state.setEffectEffect)))
            return false;
    }

    // SetEffectTable.iff: effect.type é um ARRAY — casa se QUALQUER slot igual
    if (_state.setEffectType !== '') {

        const arr = obj && obj.effect && obj.effect.type;

        if (!arr || !arr.some(t => t && t.value === Number(_state.setEffectType)))
            return false;
    }

    // GrandPrixData.iff: gp_event / gp_class são bits do typeid
    const gpTb =
        obj && obj.typeid && typeof obj.typeid.value === 'number'
            ? GrandPrixData.createTypeidbit(obj.typeid.value) : null;

    if (_state.grandPrixGpEvent !== '') {
        // SÓ o bit gp_event do typeid (nos dados reais vale 3 quando evento)
        if (!triMatch(_state.grandPrixGpEvent, !!gpTb && gpTb.gp_event !== 0))
            return false;
    }

    if (_state.grandPrixType !== '') {
        // SÓ o campo type (enum GrandPrixDataType) — casamento IGUAL ao valor
        if (!obj || !obj.type || obj.type.value !== Number(_state.grandPrixType))
            return false;
    }

    if (_state.grandPrixGpClass !== '') {
        if (!gpTb || gpTb.gp_class !== Number(_state.grandPrixGpClass))
            return false;
    }

    if (_state.grandPrixClass !== '') {
        if (!obj || obj.class.value !== Number(_state.grandPrixClass))
            return false;
    }

    // GrandPrixData.iff: tem rule (rule != 0)
    if (_state.grandPrixRule !== '') {
        const hasRule = obj && obj.rule && obj.rule.value != null && obj.rule.value !== 0;
        if (!triMatch(_state.grandPrixRule, hasRule))
            return false;
    }

    // GrandPrixData.iff: flag natural / short_game / hole_cup_x2 (!= 0)
    if (_state.grandPrixNatural !== '') {
        const v = obj && obj.flag && obj.flag.natural.value != null && obj.flag.natural.value !== 0;
        if (!triMatch(_state.grandPrixNatural, v))
            return false;
    }

    if (_state.grandPrixShort !== '') {
        const v = obj && obj.flag && obj.flag.short_game.value != null && obj.flag.short_game.value !== 0;
        if (!triMatch(_state.grandPrixShort, v))
            return false;
    }

    if (_state.grandPrixHoleCup !== '') {
        const v = obj && obj.flag && obj.flag.hole_cup_x2.value != null && obj.flag.hole_cup_x2.value !== 0;
        if (!triMatch(_state.grandPrixHoleCup, v))
            return false;
    }

    // GrandPrixData.iff: tem condition (algum slot do array != 0)
    if (_state.grandPrixCondition !== '') {
        const hasCond = obj && Array.isArray(obj.condition)
            && obj.condition.some(v => v && v.value != null && v.value !== 0);

        if (!triMatch(_state.grandPrixCondition, hasCond))
            return false;
    }

    // GrandPrixData.iff: tem ticket (ticket.typeid != 0)
    if (_state.grandPrixTicket !== '') {
        const hasTicket = obj && obj.ticket && obj.ticket.typeid
            && obj.ticket.typeid.value != null && obj.ticket.typeid.value !== 0;

        if (!triMatch(_state.grandPrixTicket, hasTicket))
            return false;
    }

    // GrandPrixData.iff: need_gp_clear — clear_gp_typeid != 0 ou lock_yn == true
    if (_state.grandPrixGpClear !== '') {
        const needClear = obj && ((obj.clear_gp_typeid && obj.clear_gp_typeid.value != null
                && obj.clear_gp_typeid.value !== 0)
            || (obj.lock_yn && obj.lock_yn.value === 1));

        if (!triMatch(_state.grandPrixGpClear, needClear))
            return false;
    }

    // GrandPrixSpecialHole.iff: course (num do Course.iff), hole e seq (enums)
    if (_state.grandPrixSHCourse !== '') {
        const cv = obj && obj.course && obj.course.value != null ? obj.course.value : null;

        if (cv == null || cv !== Number(_state.grandPrixSHCourse))
            return false;
    }

    if (_state.grandPrixSHHole !== '') {
        const hv = obj && obj.hole && obj.hole.value != null ? obj.hole.value : null;

        if (hv == null || hv !== Number(_state.grandPrixSHHole))
            return false;
    }

    if (_state.grandPrixSHSeq !== '') {
        const sv = obj && obj.seq && obj.seq.value != null ? obj.seq.value : null;

        if (sv == null || sv !== Number(_state.grandPrixSHSeq))
            return false;
    }

    // GrandPrixRankReward.iff: rank (enum RANK_1..100) e tem troféu
    // (trophy_typeid != 0 — aponta para itens GRAND_PRIX do Match.iff)
    if (_state.grandPrixRRRank !== '') {
        const rv = obj && obj.rank && obj.rank.value != null ? obj.rank.value : null;

        if (rv == null || rv !== Number(_state.grandPrixRRRank))
            return false;
    }

    if (_state.grandPrixRRTrophy !== '') {
        const hasTrophy = obj && obj.trophy_typeid && obj.trophy_typeid.value != null
            && obj.trophy_typeid.value !== 0;

        if (!triMatch(_state.grandPrixRRTrophy, hasTrophy))
            return false;
    }

    // GrandPrixRankReward.iff: troféu EXATO (trophy_typeid igual ao Match escolhido)
    if (_state.grandPrixRRTrophySel !== '') {
        const tv = obj && obj.trophy_typeid && obj.trophy_typeid.value != null
            ? (obj.trophy_typeid.value >>> 0) : null;

        if (tv == null || tv !== Number(_state.grandPrixRRTrophySel))
            return false;
    }

    // GrandPrixAIOptionalData.sff: character (char_id igual ao Character.iff)
    // e class (enum GP_CLASS_NONE..9)
    if (_state.grandPrixAIChar !== '') {
        const cv = obj && obj.char_id && obj.char_id.value != null ? obj.char_id.value : null;

        if (cv == null || cv !== Number(_state.grandPrixAIChar))
            return false;
    }

    if (_state.grandPrixAIClass !== '') {
        const kv = obj && obj.class && obj.class.value != null ? obj.class.value : null;

        if (kv == null || kv !== Number(_state.grandPrixAIClass))
            return false;
    }

    // GrandPrixData.iff: course (typeid do Course.iff)
    if (_state.grandPrixCourse !== '') {
        const cv = obj && obj.course_info && obj.course_info.course && obj.course_info.course.value != null
            ? obj.course_info.course.value : null;
        if (cv == null || cv !== Number(_state.grandPrixCourse))
            return false;
    }

    // GrandPrixData.iff: modo (enum GrandPrixDataModo)
    if (_state.grandPrixModo !== '') {
        const mv = obj && obj.course_info && obj.course_info.modo && obj.course_info.modo.value != null
            ? obj.course_info.modo.value : null;
        if (mv == null || mv !== Number(_state.grandPrixModo))
            return false;
    }

    // GrandPrixData.iff: nível único (level_min/level_max com operador), igual ao
    // filtro de level do Base — a busca é feita em ambos os campos (range)
    if (_state.grandPrixLevelOp !== '' && _state.grandPrixLevel !== '') {
        const getv = _f => obj && obj[_f] && obj[_f].value != null ? obj[_f].value : null;
        const v = Number(_state.grandPrixLevel);
        const cmp = _lv => {
            switch (_state.grandPrixLevelOp) {
                case 'eq': return _lv === v;
                case 'ne': return _lv !== v;
                case 'lt': return _lv < v;
                case 'le': return _lv <= v;
                case 'gt': return _lv > v;
                case 'ge': return _lv >= v;
            }
            return true;
        };
        const lmin = getv('level_min');
        const lmax = getv('level_max');
        if (lmin == null || lmax == null)
            return false;
        if (!cmp(lmin) || !cmp(lmax))
            return false;
    }

    // GrandPrixData.iff: hora (h:m:s) de open / start / end — casa se QUALQUER
    // um dos 3 horários bater (picker SystemTime no painel)
    if (_state.grandPrixTime !== '') {
        const secs = Number(_state.grandPrixTime);
        const itemSecs = [obj.open, obj.start, obj.end]
            .map(s => s && s.wHour ? s.wHour.value * 3600 + s.wMinute.value * 60 + s.wSecond.value : null);
        if (!itemSecs.some(v => v != null && v === secs))
            return false;
    }

    // ClubSetWorkShopLevelUpProb.iff: tipo do CAMPO (igualdade, enum WorkShopTipo)
    if (_state.clubsetWsProbTipo !== '') {

        const fv = obj && obj.tipo && obj.tipo.value != null ? obj.tipo.value : null;

        if (fv == null || fv !== Number(_state.clubsetWsProbTipo))
            return false;
    }

    // MemorialShopCoinItem.sff: type do CAMPO (igualdade, enum MemorialShopCoinItemType)
    if (_state.memorialCoinType !== '') {

        const fv = obj && obj.type && obj.type.value != null ? obj.type.value : null;

        if (fv == null || fv !== Number(_state.memorialCoinType))
            return false;
    }

    // MemorialShopCoinItem.sff: filter_type é Array(10) — casa se QUALQUER
    // slot tem o valor; NONE (0) = item sem NENHUM filter_type setado
    if (_state.memorialCoinFilter !== '') {

        const arr = obj && obj.filter_type;
        const want = Number(_state.memorialCoinFilter);

        if (!arr || !arr.some)
            return false;

        if (want === 0) {
            if (!arr.every(v => v.value === 0))
                return false;
        } else if (!arr.some(v => v.value === want))
            return false;
    }

    // MemorialShopCoinItem.sff: gacha num (operador sobre number_min E
    // number_max do gacha_range — range), igual ao filtro de level do Base
    if (_state.memorialCoinGachaOp !== '' && _state.memorialCoinGachaNum !== '') {
        const getv = _f => obj && obj.gacha_range && obj.gacha_range[_f]
            && obj.gacha_range[_f].value != null ? obj.gacha_range[_f].value : null;
        const v = Number(_state.memorialCoinGachaNum);
        const cmp = _lv => {
            switch (_state.memorialCoinGachaOp) {
                case 'eq': return _lv === v;
                case 'ne': return _lv !== v;
                case 'lt': return _lv < v;
                case 'le': return _lv <= v;
                case 'gt': return _lv > v;
                case 'ge': return _lv >= v;
            }
            return true;
        };
        const nmin = getv('number_min');
        const nmax = getv('number_max');
        if (nmin == null || nmax == null)
            return false;
        if (!cmp(nmin) || !cmp(nmax))
            return false;
    }

    // MemorialShopRareItem.iff: rare_type do CAMPO (igualdade, enum
    // MemorialShopRareItemType)
    if (_state.memorialRareType !== '') {

        const fv = obj && obj.rare_type && obj.rare_type.value != null
            ? obj.rare_type.value : null;

        if (fv == null || fv !== Number(_state.memorialRareType))
            return false;
    }

    // MemorialShopRareItem.iff: filter_type é Array(10) — casa se QUALQUER
    // slot tem o valor; NONE (0) = item sem NENHUM filter_type setado
    if (_state.memorialRareFilter !== '') {

        const arr = obj && obj.filter_type;
        const want = Number(_state.memorialRareFilter);

        if (!arr || !arr.some)
            return false;

        if (want === 0) {
            if (!arr.every(v => v.value === 0))
                return false;
        } else if (!arr.some(v => v.value === want))
            return false;
    }

    // MemorialShopRareItem.iff: gacha num (operador sobre o CAMPO gacha.number)
    if (_state.memorialRareGachaOp !== '' && _state.memorialRareGachaNum !== '') {

        const gv = obj && obj.gacha && obj.gacha.number
            && obj.gacha.number.value != null ? obj.gacha.number.value : null;
        const v = Number(_state.memorialRareGachaNum);

        if (gv == null)
            return false;

        switch (_state.memorialRareGachaOp) {
            case 'eq': if (gv !== v) return false; break;
            case 'ne': if (gv === v) return false; break;
            case 'lt': if (gv >= v) return false; break;
            case 'le': if (gv > v) return false; break;
            case 'gt': if (gv <= v) return false; break;
            case 'ge': if (gv < v) return false; break;
        }
    }

    // CharacterMastery.iff: seq do CAMPO (igualdade, enum CharacterMasterySeq)
    if (_state.charMasterySeq !== '') {

        const fv = obj && obj.seq && obj.seq.value != null ? obj.seq.value : null;

        if (fv == null || fv !== Number(_state.charMasterySeq))
            return false;
    }

    // CharacterMastery.iff: stats do CAMPO (igualdade, enum statistics)
    if (_state.charMasteryStats !== '') {

        const fv = obj && obj.stats && obj.stats.value != null ? obj.stats.value : null;

        if (fv == null || fv !== Number(_state.charMasteryStats))
            return false;
    }

    // CharacterMastery.iff: level do CAMPO (operador + valor do enum enLEVEL,
    // igual ao filtro de level do Base)
    if (_state.charMasteryLevelOp !== '' && _state.charMasteryLevel !== '') {

        const lv = obj && obj.level && obj.level.value != null ? obj.level.value : null;
        const v = Number(_state.charMasteryLevel);

        if (lv == null)
            return false;

        switch (_state.charMasteryLevelOp) {
            case 'eq': if (lv !== v) return false; break;
            case 'ne': if (lv === v) return false; break;
            case 'lt': if (lv >= v) return false; break;
            case 'le': if (lv > v) return false; break;
            case 'gt': if (lv <= v) return false; break;
            case 'ge': if (lv < v) return false; break;
        }
    }

    // CharacterMastery.iff: character por IGUALDADE do typeid do item
    // (opções = itens do Character.iff com label "typeid - Nome")
    if (_state.charMasteryCharacter !== '') {

        const tv = obj && obj.typeid && obj.typeid.value != null
            ? obj.typeid.value : null;

        if (tv == null || tv !== Number(_state.charMasteryCharacter))
            return false;
    }

    // CaddieVoiceTable.iff: level do CAMPO (igualdade, enum CaddieVoiceLevel)
    if (_state.caddieVoiceLevel !== '') {

        const fv = obj && obj.level && obj.level.value != null ? obj.level.value : null;

        if (fv == null || fv !== Number(_state.caddieVoiceLevel))
            return false;
    }

    // ClubSetWorkShopLevelUpLimit.iff: tipo do CAMPO (igualdade, enum WorkShopTipoSolo)
    if (_state.clubsetLimitTipo !== '') {

        const fv = obj && obj.tipo && obj.tipo.value != null ? obj.tipo.value : null;

        if (fv == null || fv !== Number(_state.clubsetLimitTipo))
            return false;
    }

    // ClubSetWorkShopLevelUpLimit.iff: rank do CAMPO (igualdade, enum RankClubSet)
    if (_state.clubsetLimitRank !== '') {

        const fv = obj && obj.rank && obj.rank.value != null ? obj.rank.value : null;

        if (fv == null || fv !== Number(_state.clubsetLimitRank))
            return false;
    }

    // ClubSetWorkShopRankUpExp.iff: tipo do CAMPO (igualdade, enum RankSTipo)
    if (_state.clubsetRankUpExpTipo !== '') {

        const fv = obj && obj.tipo && obj.tipo.value != null ? obj.tipo.value : null;

        if (fv == null || fv !== Number(_state.clubsetRankUpExpTipo))
            return false;
    }

    // Card.iff: type (bits do typeid — igualdade, enum CardType)
    const cardTb =
        obj && obj.typeid && typeof obj.typeid.value === 'number'
            ? Card.createTypeidbit(obj.typeid.value) : null;

    if (_state.cardType !== '') {

        const tv = cardTb ? cardTb.type : null;

        if (tv == null || tv !== Number(_state.cardType))
            return false;
    }

    // Card.iff: campos do item (igualdade — raridade/volume/efeito)
    if (_state.cardTipo !== '') {

        const tv = obj && obj.tipo ? obj.tipo.value : null;

        if (tv == null || tv !== Number(_state.cardTipo))
            return false;
    }

    if (_state.cardVolume !== '') {

        const tv = obj && obj.volume ? obj.volume.value : null;

        if (tv == null || tv !== Number(_state.cardVolume))
            return false;
    }

    if (_state.cardEfeito !== '') {

        const tv = obj && obj.efeito && obj.efeito.type ? obj.efeito.type.value : null;

        if (tv == null || tv !== Number(_state.cardEfeito))
            return false;

        // efeito.type é LIGADO ao type do typeid (Card.iff): o valor cru existe
        // em vários types (ex.: 4 = BOUND_BONUS do caddie / PP_POUCH do special
        // / LONG_PUTT_BONUS do NPC) — o optgroup do filtro determina o type
        // exigido ('' = sem type, ex.: opção '—')
        if (_state.cardEfeitoType !== '') {

            const ty = cardTb ? cardTb.type : null;

            if (ty == null || ty !== Number(_state.cardEfeitoType))
                return false;
        }
    }

    // HairStyle.iff: character (campo do item — igualdade)
    if (_state.hairCharacter !== '') {

        const cv = obj && obj.character ? obj.character.value : null;

        if (cv == null || cv !== Number(_state.hairCharacter))
            return false;
    }

    // CutinInfomation.iff: character_id (campo do item — igualdade)
    if (_state.cutinCharacter !== '') {

        const cv = obj && obj.character_id ? obj.character_id.value : null;

        if (cv == null || cv !== Number(_state.cutinCharacter))
            return false;
    }

    // Base: time_shop ativo e active_date
    if (!triMatch(_state.timeShop, !!(obj && obj.shop && obj.shop.time_shop && obj.shop.time_shop.active && obj.shop.time_shop.active.value == 1)))
        return false;

    if (!triMatch(_state.activeDate, !!(
            obj && obj.date && obj.date.active_date && obj.date.active_date.value == 1
            || (obj && obj.date && obj.date.date && obj.date.date.some && obj.date.date.some(d => !d.isEmpty()))
        )))
        return false;

    // Level: is_max + comparador com valor (Level/LevelBitfield/LevelValue32/16/8)
    if (!triMatch(_state.levelMax, !!(obj && obj.level && obj.level.is_max == 1)))
        return false;

    if (_state.levelOp !== '' && _state.levelValue !== '') {

        const lv = itemLevelValue(obj);

        if (lv == null)
            return false;

        const v = Number(_state.levelValue);

        switch (_state.levelOp) {
            case 'eq': if (lv !== v) return false; break;
            case 'ne': if (lv === v) return false; break;
            case 'lt': if (lv >= v) return false; break;
            case 'le': if (lv > v) return false; break;
            case 'gt': if (lv <= v) return false; break;
            case 'ge': if (lv < v) return false; break;
        }
    }

    return true;
}

function itemMatchesFilter(_item, _filter) {
    const f = _filter.trim().toLowerCase();

    if (!f)
        return true;

    const div = Array.from(_item.children || []).find(ch => ch.tagName === 'DIV');
    const text = String(div ? div.textContent : _item.textContent);

    if (text.toLowerCase().includes(f))
        return true;

    const typeid = _item.itemObj && _item.itemObj.typeid ? _item.itemObj.typeid.value : undefined;

    if (typeid !== undefined && typeid !== null) {
        if (String(typeid).includes(f))
            return true;
        if (typeid.toString(16).includes(f))
            return true;
        if (('0x' + typeid.toString(16)).includes(f))
            return true;
    }

    const name = _item.itemObj && _item.itemObj.name ? _item.itemObj.name.value : undefined;

    if (name !== undefined && name !== null && stripEncodingMarker(String(name)).toLowerCase().includes(f))
        return true;

    // busca também pela descrição, se o item tiver (campo próprio ou vínculo no Desc.iff)
    const obj = _item.itemObj;

    if (obj) {
        const differs = getItemDescriptionSource(obj);

        if (differs) {
            const text = stripEncodingMarker(String(differs.value || '')).replace(/\0/g, '').replace(/\s+/g, ' ').trim();

            if (text.toLowerCase().includes(f))
                return true;
        }
    }

    return false;
}

// fonte da descrição de um item: campo próprio (Desc.iff) ou vínculo por typeid no Desc.iff
function getItemDescriptionSource(_item) {
    if (_item.hasOwnProperty('description'))
        return _item.description;

    if (_item.__desc)
        return _item.__desc.description;

    const iff = getSelectedIFF();

    if (!iff || iff.flag_ligacao !== 0 || iff.name === 'Desc.iff' || !_item.hasOwnProperty('typeid'))
        return null;

    const descIff = iffs.find(i => i.name === 'Desc.iff');

    if (!descIff)
        return null;

    const linked = descIff.elements.find(d => !d.__deleted && !d.__deleted2 && d.typeid.value === _item.typeid.value);

    return linked ? linked.description : null;
}

function filterItem(_filter) {
    const itemSel = document.getElementById('item-sel');
    const state = getFilterState();
    const vl = itemSel.__vlist;

    if (vl && vl.windowed) {

        // âncora de scroll: itens visíveis no TOPO da vista ANTES do filtro
        const oldFirst = Math.round(itemSel.scrollTop / kListRowH);
        let anchors = [];

        if (Array.isArray(vl.visible)) {

            const vp0 = Math.max(vl.start, Math.min(oldFirst, vl.end - 1));

            for (let v = vp0; v < Math.min(vp0 + 5, vl.end); v++)
                anchors.push(vl.visible[v]);
        }

        vl.search = _filter || '';
        rebuildVisibleList(itemSel);

        // 1) seleção sobreviveu → centra nela; 2) senão, primeiro item que
        // estava no topo da vista que sobreviveu (mostra "os mesmos itens");
        // 3) nada sobreviveu → mantém o offset relativo (scrollTop atual,
        // clampeado pelo novo conteúdo dentro do render)
        const selItem = itemSel_selectedItem(itemSel);
        const useSel = !!(vl.userSelected && selItem);
        let target = useSel ? (vl.idxOf.get(selItem) ?? null) : null;

        if (target == null)

            for (const a of anchors) {

                const v = vl.idxOf.get(a);

                if (v != null) {
                    target = v;
                    break;
                }
            }

        renderListWindow(itemSel, target);

        const counter = document.getElementById('itemCount');

        if (counter)
            counter.textContent = vl.visible.length + ' / ' + vl.iff.elements.length;

        return;
    }

    itemSel.childNodes.forEach(c => c.classList.toggle('item-hidden', false));
    itemSel.childNodes.values().filter(c => !itemMatchesFilter(c, _filter) || !itemMatchesState(c, state)).forEach(c => c.classList.toggle('item-hidden'));

    // filtro "Ocultos": itens escondidos (item-hide, display:none) precisam
    // ficar visíveis — item-show-hidden sobrepõe o item-hide no CSS
    itemSel.childNodes.values().forEach(c => c.classList.toggle('item-show-hidden', state.hidden && c.classList.contains('item-hide')));

    if (itemSel.selected != null && !itemSel.selected.className.includes('item-hidden'))
        itemSel.selected.scrollIntoView({
            behaivor: 'smooth',
            block: 'nearest'
        });

    // feedback visual: "visíveis / total" (atualiza com o filtro/estado)
    const counter = document.getElementById('itemCount');

    if (counter) {
        const total = itemSel.childNodes.length;
        const shown = Array.from(itemSel.childNodes.values()).filter(c => !c.classList.contains('item-hidden')).length;
        counter.textContent = shown + ' / ' + total;
    }
}

document.addEventListener('click', () => {
    document.getElementById('ul-item-context-menu').style.display = 'none';
});

// botão de limpar no input de filtro (mesmo padrão do campo de data)
function syncSearchClear() {
    const input = document.getElementById('searchItem');
    const btn = document.getElementById('searchItemClear');

    if (!input || !btn || typeof input.closest !== 'function')
        return;

    const wrap = input.closest('.date-input-wrap');

    if (!wrap)
        return;

    const empty = input.value === '';

    wrap.classList.toggle('has-value', !empty);
    btn.style.display = empty ? 'none' : '';
}

document.getElementById('searchItem').addEventListener('input', function(evt) {
    filterItem(evt.target.value);
    syncSearchClear();
});

document.getElementById('searchItemClear').addEventListener('click', function(evt) {
    const input = document.getElementById('searchItem');

    input.value = '';

    filterItem('');

    syncSearchClear();

    input.focus();

    evt.stopPropagation();
});

// init (recursão em selects com itens já filtrados)
syncSearchClear();

// ---- painel de filtros: exclusividade do "Todos", colapso e selects ----

// cada select de enum do painel é éche pelo id ('f-level-value', 'f-type-item',
// 'f-tipo') com os valores [nome, valor] do enum correspondente
function fillFilterSelects() {

    fillEnumFilterOptions('f-level-value', enLEVEL);
    fillEnumFilterOptions('f-type-item', PartType);
    fillEnumFilterOptions('f-part-subtype', PartSubType);
    fillEnumFilterOptions('f-tipo', ClubType);
    fillEnumFilterOptions('f-ws-tipo', WorkShopTipo);
    fillEnumFilterOptions('f-ws-rank-s-stat', statistics);
    fillEnumFilterOptions('f-ws-tipo-rank-s', RankSTipo);
    fillEnumFilterOptions('f-cadie-setor', CadieMagicBoxSetorType);
    fillEnumFilterOptions('f-cadiebox-character', CadieMagicBoxCharacterType);
    fillEnumFilterOptions('f-consumable-type', TYPE_BALL_CONSUMABLE);
    fillEnumFilterOptions('f-item-tipo', ItemTipo);
    fillEnumFilterOptions('f-item-type', ItemType);
    fillEnumFilterOptions('f-setitem-sub', SetItemSubType);
    fillEnumFilterOptions('f-setitem-sub-char', SetItemSubTypeChar);
    fillEnumFilterOptions('f-match-special', MatchSpecialType);
    fillEnumFilterOptions('f-skin-type', SkinType);
    fillEnumFilterOptions('f-furniture-type', FurnitureType);
    fillEnumFilterOptions('f-enchant-stats', statistics);
    fillEnumFilterOptions('f-achievement-class', AchievementTipo);
    fillEnumFilterOptions('f-counteritem-point', CounterItemPointType);
    fillEnumFilterOptions('f-queststuff-type', QuestStuffType);
    fillEnumFilterOptions('f-subscriptionitem-type', ItemTableType);
    fillEnumFilterOptions('f-twinsitem-type', ItemTableType);
    fillEnumFilterOptions('f-levelup-level', enLEVEL);
    fillEnumFilterOptions('f-errorcodeinfo-type', ErrorCodeInfoType);
    fillEnumFilterOptions('f-ability-type', ItemTableType);
    fillEnumFilterOptions('f-ability-effect', AbilityEffectType);
    fillEnumFilterOptions('f-grandprix-gp-class', GrandPrixDataAbaClass);
    fillEnumFilterOptions('f-grandprix-class', GrandPrixDataClass);
    fillEnumFilterOptions('f-grandprix-type', GrandPrixDataType);
    fillEnumFilterOptions('f-grandprix-modo', GrandPrixDataModo);
    fillEnumFilterOptions('f-gpspecialhole-hole', GrandPrixSpecialHoleHole);
    fillEnumFilterOptions('f-gpspecialhole-seq', GrandPrixSpecialHoleSeq);
    fillEnumFilterOptions('f-gprrank-rank', GrandPrixRankRewardRank);
    fillEnumFilterOptions('f-gpaio-class', GrandPrixDataClass);
    fillEnumFilterOptions('f-grandprix-level', enLEVEL);
    fillEnumFilterOptions('f-seteffect-effect', SetEffectTableEffectType);
    fillEnumFilterOptions('f-seteffect-type', ItemTableType);
    fillEnumFilterOptions('f-clubsetwsprob-tipo', WorkShopTipoSolo);
    fillEnumFilterOptions('f-clubsetlimit-tipo', WorkShopTipoSolo);
    fillEnumFilterOptions('f-clubsetlimit-rank', RankClubSet);
    fillEnumFilterOptions('f-clubsetrankupexp-tipo', RankSTipo);
    fillEnumFilterOptions('f-questitem-type', QuestItemType);
    fillEnumFilterOptions('f-questitem-field-type', QuestItemFieldType);
    fillEnumFilterOptions('f-timeitem-type', TimeLimitItemType);
    fillEnumFilterOptions('f-memorialcoin-type', MemorialShopCoinItemType);
    fillEnumFilterOptions('f-memorialcoin-filter', MemorialShopFilterType);
    fillEnumFilterOptions('f-memorialrare-rare-type', MemorialShopRareItemType);
    fillEnumFilterOptions('f-memorialrare-filter', MemorialShopFilterType);
    fillEnumFilterOptions('f-charmastery-seq', CharacterMasterySeq);
    fillEnumFilterOptions('f-charmastery-stats', statistics);
    fillEnumFilterOptions('f-charmastery-level', enLEVEL);
    fillEnumFilterOptions('f-caddievoice-level', CaddieVoiceLevel);
    fillEnumFilterOptions('f-specialprize-type', SpecialPrizeItemType);
    fillEnumFilterOptions('f-shoplimit-type', ShopLimitItemType);
    fillEnumFilterOptions('f-pointshop-rarity', PointShopRarityType);
    fillEnumFilterOptions('f-nonvisibleitem-type', ItemTableType);
    fillEnumFilterOptions('f-artifactmana-type', ArtifactManaInfoType);
    fillEnumFilterOptions('f-card-type', CardType);
    fillEnumFilterOptions('f-card-tipo', CardTipo);
    fillEnumFilterOptions('f-card-volume', CardVolume);
    fillEnumFilterOptions('f-card-efeito', CardEfeitoType);

    // slots do char_part_num do typeid do Part (0-23)
    const slotSel = document.getElementById('f-part-slot');

    if (slotSel) {

        for (let i = 0; i < 24; i++) {

            const opt = document.createElement('option');

            opt.value = i;
            opt.textContent = i;

            slotSel.appendChild(opt);
        }
    }
}

// preenche um select do painel com os valores [nome, valor] de um enum;
// enums com `groups()` (ex.: CardEfeitoType — as opções por tipo do typeid
// da carta) renderizam <optgroup> com o label do grupo (CharacterEfeito/
// CaddieEfeito/...) e as opções do enum do grupo dentro
function fillEnumFilterOptions(_selectId, _enum) {

    const sel = document.getElementById(_selectId);

    if (!sel)
        return;

    const groups =
        typeof _enum.groups === 'function'
            ? _enum.groups()
            : null;

    if (groups) {

        for (const g of groups) {

            const og = document.createElement('optgroup');

            og.label = g.label;

            if (g.type != null)
                og.dataset.cardType = g.type;

            for (const [name, value] of Object.entries(g.enum)) {

                if (typeof value !== 'number')
                    continue;

                const opt = document.createElement('option');

                opt.value = value;
                opt.textContent = name;

                og.appendChild(opt);
            }

            sel.appendChild(og);
        }

        return;
    }

    for (const [name, value] of Object.entries(_enum)) {

        if (typeof value !== 'number')
            continue;

        const opt = document.createElement('option');

        opt.value = value;
        opt.textContent =
            _enum.__indexLabel
                ? value + ' — ' + name
                : name;

        sel.appendChild(opt);
    }
}

// desmarca o "Todos" quando qualquer outro filtro é mexido
function onFilterChanged() {

    const all = document.getElementById('f-all');

    if (all)
        all.checked = false;

    filterItem(document.getElementById('searchItem').value);
}

function initFilterPanel() {

    fillFilterSelects();

    // selects do painel vira widget do Choices (o nativo segue a fonte da
    // verdade; reset via resetFilterSelect recria o widget)
    for (const id of ['f-level-op', 'f-level-value', 'f-type-item', 'f-tipo',
                      'f-part-slot', 'f-part-subtype', 'f-ws-tipo', 'f-ws-rank-s-stat', 'f-ws-tipo-rank-s',
                      'f-cadie-setor', 'f-cadiebox-character', 'f-consumable-type', 'f-base-period-op', 'f-base-price-op', 'f-base-sale-price-op', 'f-item-tipo',
                      'f-item-type', 'f-setitem-sub', 'f-setitem-sub-char', 'f-match-special',
                      'f-skin-type', 'f-furniture-type', 'f-enchant-stats', 'f-achievement-class',
                      'f-counteritem-point', 'f-queststuff-type', 'f-questitem-type', 'f-questitem-field-type',
 'f-errorcodeinfo-type', 'f-ability-type', 'f-ability-effect', 'f-seteffect-effect', 'f-seteffect-type',
                      'f-card-type', 'f-card-tipo', 'f-card-volume', 'f-card-efeito',
                      'f-clubsetwsprob-tipo',
                      'f-clubsetlimit-tipo',
                      'f-clubsetlimit-rank',
                      'f-clubsetrankupexp-tipo',
                      'f-grandprix-gp-class', 'f-grandprix-class', 'f-grandprix-type', 'f-grandprix-modo',
                      'f-grandprix-level-op', 'f-grandprix-level',
                      'f-gpspecialhole-hole', 'f-gpspecialhole-seq', 'f-gprrank-rank', 'f-gprrank-trophy-sel', 'f-gpaio-class'])
        makeChoices(document.getElementById(id));

    // Card.iff: efeito.type LIGADO ao type (o valor cru existe em vários enums
    // com significado DIFERENTE — ex.: 1 = POWER_DECREASE do Character /
    // SUCCESS_RATE do Caddie; 4 = BOUND_BONUS do caddie / PP_POUCH do special
    // / LONG_PUTT_BONUS do NPC —, o optgroup determina o type): escolher um
    // efeito também seleciona o type do grupo; mudar o type reseta o efeito p/
    // '—' SEMPRE (mesmo que o valor exista no enum do tipo novo, o sentido é outro)
    const cardTypeSel = document.getElementById('f-card-type');

    const cardEfeitoSel = document.getElementById('f-card-efeito');

    if (cardTypeSel && cardEfeitoSel) {

        cardEfeitoSel.addEventListener('change', () => {

            if (cardEfeitoSel.value === '')
                return;

            const t = cardEfeitoGroupType();

            if (t !== '' && cardTypeSel.value !== t)
                setSelectValue(cardTypeSel, t);
        });

        cardTypeSel.addEventListener('change', () => {

            setSelectValue(cardEfeitoSel, '');
        });
    }


    // monta os tri-toggles estáticos (spans vazios no app.htm)
    const triConfs = [
        ['tri-active', 'f-active', {
            negText: 'Desativados', anyText: '\u2014', posText: 'Ativos',
            titles: { '0': 'Somente desativados', 'any': 'Sem filtro', '1': 'Somente ativos' },
        }],
        ['tri-beginners', 'f-beginners', {
            negText: 'NÃO', anyText: '\u2014', posText: 'SIM',
            titles: { '0': 'Somente demais', 'any': 'Sem filtro', '1': 'Somente iniciantes' },
        }],
        ['tri-part-equipable', 'f-part-equipable', {
            negText: 'NÃO TEM', anyText: '\u2014', posText: 'TEM',
            titles: { '0': 'Somente sem equipable_with (texto vazio)', 'any': 'Sem filtro', '1': 'Somente com equipable_with' },
        }],
        ['tri-part-subpart', 'f-part-subpart', {
            negText: 'NÃO TEM', anyText: '\u2014', posText: 'TEM',
            titles: { '0': 'Somente sem sub_part (todos os slots 0)', 'any': 'Sem filtro', '1': 'Somente com sub_part (algum slot != 0)' },
        }],
        ['tri-time-shop', 'f-time-shop', {
            negText: 'NÃO', anyText: '\u2014', posText: 'SIM',
            titles: { '0': 'Somente sem time_shop', 'any': 'Sem filtro', '1': 'Somente time_shop ativo' },
        }],
        ['tri-active-date', 'f-active-date', {
            negText: 'SEM DATA', anyText: '\u2014', posText: 'COM DATA',
            titles: { '0': 'Somente sem data', 'any': 'Sem filtro', '1': 'Somente data válida' },
        }],
        ['tri-base-discount', 'f-base-discount', {
            negText: 'Sem desconto', anyText: '\u2014', posText: 'Tem desconto',
            titles: { '0': 'Somente sem desconto (sale_price = 0)', 'any': 'Sem filtro', '1': 'Somente com desconto (sale_price > 0)' },
        }],
        ['tri-level-max', 'f-level-max', {
            negText: 'NÃO', anyText: '\u2014', posText: 'SIM',
            titles: { '0': 'Somente sem is_max', 'any': 'Sem filtro', '1': 'Somente is_max' },
        }],
        ['tri-ws-can-transform', 'f-ws-can-transform', {
            negText: 'NÃO', anyText: '\u2014', posText: 'SIM',
            titles: { '0': 'Somente sem can_transform', 'any': 'Sem filtro', '1': 'Somente can_transform' },
        }],
        ['tri-item-passive', 'f-item-passive', {
            negText: 'NÃO', anyText: '\u2014', posText: 'SIM',
            titles: { '0': 'Somente não passivo', 'any': 'Sem filtro', '1': 'Somente passivo' },
        }],
        ['tri-valor-mensal', 'f-valor-mensal', {
            negText: 'Eterno', anyText: '\u2014', posText: 'Mensal',
            titles: { '0': 'Somente eterno (valor_mensal = 0)', 'any': 'Sem filtro', '1': 'Somente mensal (valor_mensal != 0)' },
        }],
        ['tri-mascot-msg-active', 'f-mascot-msg-active', {
            negText: 'Desativados', anyText: '\u2014', posText: 'Ativos',
            titles: { '0': 'Somente msg desativada', 'any': 'Sem filtro', '1': 'Somente msg ativa' },
        }],
        ['tri-mascot-power-drive', 'f-mascot-power-drive', {
            negText: 'Não', anyText: '\u2014', posText: 'Tem',
            titles: { '0': 'Somente power_drive = 0', 'any': 'Sem filtro', '1': 'Somente power_drive != 0' },
        }],
        ['tri-mascot-drop-rate', 'f-mascot-drop-rate', {
            negText: 'Não', anyText: '\u2014', posText: 'Tem',
            titles: { '0': 'Somente drop_rate = 0', 'any': 'Sem filtro', '1': 'Somente drop_rate != 0' },
        }],
        ['tri-mascot-power-gauge', 'f-mascot-power-gauge', {
            negText: 'Não', anyText: '\u2014', posText: 'Tem',
            titles: { '0': 'Somente power_gauge = 0', 'any': 'Sem filtro', '1': 'Somente power_gauge != 0' },
        }],
        ['tri-mascot-exp-rate', 'f-mascot-exp-rate', {
            negText: 'Não', anyText: '\u2014', posText: 'Tem',
            titles: { '0': 'Somente exp_rate = 0', 'any': 'Sem filtro', '1': 'Somente exp_rate != 0' },
        }],
        ['tri-mascot-item-slot', 'f-mascot-item-slot', {
            negText: 'Não', anyText: '\u2014', posText: 'Tem',
            titles: { '0': 'Somente item_slot = 0', 'any': 'Sem filtro', '1': 'Somente item_slot != 0' },
        }],
        ['tri-aux-power-drive', 'f-aux-power-drive', {
            negText: 'Não', anyText: '\u2014', posText: 'Tem',
            titles: { '0': 'Somente power_drive = 0', 'any': 'Sem filtro', '1': 'Somente power_drive != 0' },
        }],
        ['tri-aux-drop-rate', 'f-aux-drop-rate', {
            negText: 'Não', anyText: '\u2014', posText: 'Tem',
            titles: { '0': 'Somente drop_rate = 0', 'any': 'Sem filtro', '1': 'Somente drop_rate != 0' },
        }],
        ['tri-aux-power-gauge', 'f-aux-power-gauge', {
            negText: 'Não', anyText: '\u2014', posText: 'Tem',
            titles: { '0': 'Somente power_gauge = 0', 'any': 'Sem filtro', '1': 'Somente power_gauge != 0' },
        }],
        ['tri-aux-pang-rate', 'f-aux-pang-rate', {
            negText: 'Não', anyText: '\u2014', posText: 'Tem',
            titles: { '0': 'Somente pang_rate = 0', 'any': 'Sem filtro', '1': 'Somente pang_rate != 0' },
        }],
        ['tri-aux-exp-rate', 'f-aux-exp-rate', {
            negText: 'Não', anyText: '\u2014', posText: 'Tem',
            titles: { '0': 'Somente exp_rate = 0', 'any': 'Sem filtro', '1': 'Somente exp_rate != 0' },
        }],
        ['tri-aux-link-power-drive', 'f-aux-link-power-drive', {
            negText: 'Não', anyText: '\u2014', posText: 'Tem',
            titles: { '0': 'Somente link_power_drive = 0', 'any': 'Sem filtro', '1': 'Somente link_power_drive != 0' },
        }],
        ['tri-grandprix-gp-event', 'f-grandprix-gp-event', {
            negText: 'Não', anyText: '\u2014', posText: 'Sim',
            titles: { '0': 'Somente bit gp_event = 0', 'any': 'Sem filtro', '1': 'Somente bit gp_event != 0' },
        }],
        ['tri-grandprix-rule', 'f-grandprix-rule', {
            negText: 'Sem', anyText: '\u2014', posText: 'Tem',
            titles: { '0': 'Somente rule = 0', 'any': 'Sem filtro', '1': 'Somente rule != 0' },
        }],
        ['tri-grandprix-natural', 'f-grandprix-natural', {
            negText: 'Não', anyText: '\u2014', posText: 'Sim',
            titles: { '0': 'Somente natural = 0', 'any': 'Sem filtro', '1': 'Somente natural != 0' },
        }],
        ['tri-grandprix-short', 'f-grandprix-short', {
            negText: 'Não', anyText: '\u2014', posText: 'Sim',
            titles: { '0': 'Somente short_game = 0', 'any': 'Sem filtro', '1': 'Somente short_game != 0' },
        }],
        ['tri-grandprix-holecup', 'f-grandprix-holecup', {
            negText: 'Não', anyText: '\u2014', posText: 'Sim',
            titles: { '0': 'Somente hole_cup_x2 = 0', 'any': 'Sem filtro', '1': 'Somente hole_cup_x2 != 0' },
        }],
        ['tri-grandprix-condition', 'f-grandprix-condition', {
            negText: 'Sem', anyText: '\u2014', posText: 'Tem',
            titles: { '0': 'Todos os condition = 0', 'any': 'Sem filtro', '1': 'Algum condition != 0' },
        }],
        ['tri-grandprix-ticket', 'f-grandprix-ticket', {
            negText: 'Sem', anyText: '\u2014', posText: 'Tem',
            titles: { '0': 'Somente sem ticket', 'any': 'Sem filtro', '1': 'ticket.typeid != 0' },
        }],
        ['tri-gprrank-trophy', 'f-gprrank-trophy', {
            negText: 'Sem', anyText: '\u2014', posText: 'Tem',
            titles: { '0': 'Somente sem trof\u00e9u', 'any': 'Sem filtro', '1': 'Somente com trof\u00e9u (trophy_typeid != 0)' },
        }],
        ['tri-grandprix-gp-clear', 'f-grandprix-gp-clear', {
            negText: 'Não', anyText: '\u2014', posText: 'Sim',
            titles: { '0': 'Sem need_gp_clear', 'any': 'Sem filtro', '1': 'clear_gp_typeid != 0 ou lock_yn' },
        }],
        ['tri-aux-infinity', 'f-aux-infinity', {
            negText: 'Finita', anyText: '\u2014', posText: 'Infinity',
            titles: { '0': 'Somente finita (is_infinity = 0)', 'any': 'Sem filtro', '1': 'Somente infinity (is_infinity = 1)' },
        }],
        ['tri-aux-left-hand', 'f-aux-left-hand', {
            negText: 'Direita', anyText: '\u2014', posText: 'Esquerda',
            titles: { '0': 'Somente mão direita (is_left_hand = 0)', 'any': 'Sem filtro', '1': 'Somente mão esquerda (is_left_hand = 1)' },
        }],
    ];

    for (const [spanId, inputId, opts] of triConfs) {

        const host = document.getElementById(spanId);

        if (!host)
            continue;

        const tri = buildTriToggle({ ...opts, id: inputId });

        host.parentNode.replaceChild(tri.root, host);
    }

    const groups = document.getElementById('filters-groups');

    if (groups)
        groups.addEventListener('change', onFilterChanged);

    const all = document.getElementById('f-all');

    if (all)
        all.addEventListener('change', () => {

            // "Todos" é exclusivo: marcado desmarca todos os demais filtros
            if (all.checked) {

                const groups = document.getElementById('filters-groups');

                if (groups) {
                    groups.querySelectorAll('input[type=checkbox]').forEach(cb => cb.checked = false);
                    groups.querySelectorAll('input[type=hidden]').forEach(inp => inp.value = 'any');
                    groups.querySelectorAll('input[type=number]').forEach(inp => inp.value = '');
                    groups.querySelectorAll('select').forEach(resetFilterSelect);
                    resetTriToggles(groups);
                }
            }

            filterItem(document.getElementById('searchItem').value);
        });

    const btn = document.getElementById('btn-toggle-filters');

    if (btn)
        btn.addEventListener('click', () => {
            const panel = document.getElementById('div-item-filter');
            const wrap = document.getElementById('div-item-filter-wrap');
            const collapsed = panel.classList.toggle('collapsed');
            btn.textContent = collapsed ? 'Filtros ▴' : 'Filtros ▾';

            // expandido: o wrap divide o espaço com o ul (50/50 via flex)
            if (wrap)
                wrap.classList.toggle('filters-part', !collapsed);

            // os widgets foram medidos com o painel colapsado (display:none =
            // sem largura p/ capar) — reaplica o cap agora que há largura
            if (!collapsed && typeof fitChoicesToParent === 'function')
                fitChoicesToParent(panel);
        });
}

initFilterPanel();

// ---- flag de ligação: num com toggle dec/hex e semântica de Int16Type
// unsigned (0..65535) ----

const gFlagLigacaoType = new Int16Type(false, true, true);

function fmtFlagLigacao(_v) {
    return gFlagLigacaoType._input_mode === 'hex'
        ? '0x' + _v.toString(16)
        : String(_v);
}

function initFlagLigacaoCtl() {
    const wrap = document.getElementById('flag-ligacao-wrap');

    if (!wrap)
        return;

    const el = document.getElementById('i-flag-ligacao');

    const tgl = buildToggleSwitch({
        name: 'hex',
        posText: 'hex',
        negText: 'dec',
        stateText: true,
        checked: false,
        inputClass: 'num-mode',
        onChange: (evt, input) => {
            gFlagLigacaoType._input_mode = input.checked ? 'hex' : 'dec';
            el.value = fmtFlagLigacao(Number.isNaN(Number(el.value)) ? 0 : Number(el.value));
        },
    });

    wrap.insertBefore(tgl.root, wrap.firstChild);
}

initFlagLigacaoCtl();

window.iffs = [];

// Flag de região TH: o pack veio encriptado com XTEA (não é zip).
let gLoadedTH = false;

// região sendo aplicada no momento (usada pelo FlagShop para escolher o layout
// de bits durante a re-desserialização, pois iff.__region só é setado DEPOIS do
// unserialize no loop do resolveRegionAfterLoad).
var gRegionApply = null;


function updateItemInList(_item) {
    const itemSel = document.getElementById('item-sel');
    const vl = itemSel.__vlist;

    let li = itemSel.childNodes.values().find(el => el.itemObj == _item);

    if (!li && vl && vl.windowed) {
        renderListWindow(itemSel);
        li = itemSel.childNodes.values().find(el => el.itemObj == _item);
    }

    if (!li)
        return { encFlipped: false, disableFlipped: false };

    const div = li.querySelector('.div-item');

    if (div)
        div.textContent = getItemListLabel(_item, li.index);

    const hadDisable = li.classList.contains('item-disable');
    const hasDisable = _item.hasOwnProperty('active') && _item.active.value == 0;

    li.classList.toggle('item-disable', hasDisable);

    li.classList.toggle('item-modified', !!_item.__modified);

    // o aviso de encoding reflete o texto editado (marcador removido/trocado)
    const hadEnc = li.classList.contains('item-encoding');
    const hasEnc = getItemEncodingErrors(_item).length > 0;

    li.classList.toggle('item-encoding', hasEnc);

    // thumbnail: atualiza a img quando o campo próprio `icon` (item com
    // Base.icon) muda OU quando há relação de iff linkada ao typeid
    const iff = getSelectedIFF();
    if (kListIconRelations[iff?.name]
        || (_item instanceof Base && _item.icon instanceof StringType))
        refreshListItemIcon(li);

    // informa se o estado do item mudou (encoding OU ativo/desativado) — o filtro
    // precisa ser reaplicado quando qualquer um dos dois flipar
    return { encFlipped: hadEnc !== hasEnc, disableFlipped: hadDisable !== hasDisable };
}

// chave de ordenação da lista (usada no reorder ao mudar tipo/rank):
// ClubSetWorkShopLevelUpLimit ordena por (tipo, rank); demais iffs por typeid
function itemOrderKey(_item) {
    if (_item instanceof ClubSetWorkShopLevelUpLimit)
        return [_item.tipo.value, _item.rank.value];
    return [_item.typeid.value];
}

function orderKeyLess(_a, _b) {
    for (let i = 0; i < Math.max(_a.length, _b.length); i++) {
        const x = _a[i] ?? 0, y = _b[i] ?? 0;

        if (x < y)
            return true;
        if (x > y)
            return false;
    }
    return false;
}

document.getElementById('div-geral-info').addEventListener('change', evt => {
    const itemSel = document.getElementById('item-sel');

    if (!itemSel.selected)
        return;

    const item = itemSel.selected.itemObj;

    if (!item)
        return;

    if (evt.target.className === 'num-mode')
        return;

    if (evt.target.dataset.field === 'description' && item.__desc) {
        const descIff = iffs.find(i => i.name === 'Desc.iff');

        item.__desc.__modified = true;

        // usuário restaurou o texto original manualmente → limpa a flag
        if (itemMatchesOriginalBytes(item.__desc))
            item.__desc.__modified = false;

        if (descIff) {
            // o * de modificado do Desc.iff reflete o texto editado
            updateIFFOption(descIff);

            // só reavalia o aviso de encoding se o estado do item editado flipou
            const descEl = item.__desc;
            const hadEnc = !!descEl.__encodingErrors && descEl.__encodingErrors.length > 0;
            const hasEnc = getItemEncodingErrors(descEl).length > 0;

            if (hadEnc !== hasEnc) {
                descIff.__hasEncodingError = descIff.elements.some(i => getItemEncodingErrors(i).length > 0);
                updateIFFOption(descIff);
            }
        }

        return;
    }

    item.__modified = true;

    // usuário restaurou o valor original manualmente → limpa a flag
    if (itemMatchesOriginalBytes(item))
        item.__modified = false;

    // reordena a lista quando o typeid muda — também quando o campo level É o
    // typeid (LevelUpPrizeItem: typeid é getter do level, itens na sequência do
    // enLEVEL) ou o campo code É o typeid (ErrorCodeInfo: typeid é getter do code)
    if ((evt.target.dataset.field === 'typeid' && item.hasOwnProperty('typeid'))
        || (evt.target.dataset.field === 'level' && item.typeid === item.level)
        || (evt.target.dataset.field === 'code' && item.typeid === item.code)
        || (evt.target.dataset.field === 'tipo' && item.typeid === item.tipo)
        || (evt.target.dataset.field === 'id' && item.typeid === item.id)
        || (evt.target.dataset.field === 'rank' && item instanceof ClubSetWorkShopLevelUpLimit)) {
        const iff = getSelectedIFF();

        const idx = iff.elements.indexOf(item);

        iff.elements.splice(idx, 1);

        const reorderKey = itemOrderKey(item);

        let newIdx = iff.elements.findIndex(i => orderKeyLess(reorderKey, itemOrderKey(i)));

        iff.elements.splice(newIdx == -1 ? iff.elements.length : newIdx, 0, item);

        ensureItemDescription(item);
        ensureCutinInfomation(item);

        if (iff.element_constructor === CadieMagicBox)
            iff.rebuildCadieMagicBox();

        makeItemSelection(false);
        selectItem(item);
        updateSelectedIFFOption();

        return;
    }

    // só recomputa o aviso do iff se o estado de encoding do item editado mudou;
    // reaplica o filtro sempre que o estado mudar (encoding OU ativo/desativado —
    // ex.: item desativado sai do filtro "Ativos")
    const flips = updateItemInList(item);

    // sincroniza o * de modificado no seletor de iff
    updateSelectedIFFOption();

    if (flips.encFlipped)
        refreshIFFEncodingState(getSelectedIFF());

    if (flips.encFlipped || flips.disableFlipped)
        filterItem(document.getElementById('searchItem').value);
});

// conversão de região (JP <-> US) do arquivo aberto
document.getElementById('div-converter-regiao').addEventListener('click', async function() {

    if (!currentFile)
        return;

    const atual =
        getVersaoPackRegiao();

    const alvo = await new ConverterRegiaoModal(atual).show();

    if (!alvo || alvo === atual)
        return;

    const versaoAlvo =
        kVersoesSuportadas.find(v => v.regiao === alvo);

    const labelAlvo =
        versaoAlvo ? versaoAlvo.label : alvo;

    {
        const ok = await new ConfirmModal('Converter o arquivo aberto para ' + labelAlvo + '?\n\n'
            + 'Os campos são copiados por nome entre os formatos: textos maiores que o limite da região de destino truncam na gravação e números clampam para o range do campo (ex.: price Int16 -> Int8 do Mascot). Campos sem equivalente ficam com o valor padrão.').show();

        if (!ok)
            return;
    }

    const res =
        converteIffsParaRegiao(alvo);

    atualizaBotaoArquivoInfo();

    makeItemSelection(true);

    await new AlertModal('Convertido para ' + labelAlvo + '\n'
        + res.afetados + ' IFFs convertidos (' + res.elementos + ' elementos).\n'
        + 'Use Salvar para gravar o arquivo convertido.').show();
});

document.getElementById('i-flag-ligacao').addEventListener("change", function(evt) {
    const iff = getSelectedIFF();

    let value = evt.target.value;

    if (gFlagLigacaoType._input_mode === 'hex') {
        value = parseInt(
            String(value).replace(/^0x/i, ''),
            16
        );

        if (Number.isNaN(value)) {
            evt.target.value = fmtFlagLigacao(iff.flag_ligacao);
            return;
        }
    } else {
        if (!Number.isFinite(Number(value)) || !Number.isInteger(Number(value))) {
            evt.target.value = fmtFlagLigacao(iff.flag_ligacao);
            return;
        }

        value = Number(value);
    }

    // limita ao intervalo de um Int16Type unsigned (0..65535)
    gFlagLigacaoType.value = value;

    const novoValor = gFlagLigacaoType.value;

    evt.target.value = fmtFlagLigacao(novoValor);

    if (novoValor === iff.flag_ligacao) {
        updateSelectedIFFOption();
        return;
    }

    if (iff.__original_flag_ligacao == null)
        iff.__original_flag_ligacao = iff.flag_ligacao;

    iff.flag_ligacao = novoValor;

    const descIff = iffs.find(i => i.name === 'Desc.iff');

    if (novoValor === 0) {
        // flag voltou para 0: garante a descrição dos itens (como na criação)
        iff.elements.forEach(item => {
            if (item.hasOwnProperty('typeid'))
                ensureItemDescription(item);
        });
    } else {
        // flag != 0: remove as descrições vinculadas
        iff.elements.forEach(item => {
            if (!item.hasOwnProperty('typeid'))
                return;

            let desc = item.__desc;

            if (descIff && !desc)
                desc = descIff.elements.find(d => d.typeid.value === item.typeid.value);

            if (desc) {
                const idx = descIff.elements.indexOf(desc);

                if (idx != -1)
                    descIff.elements[idx].__deleted = true;
            }

            item.__desc = null;
        });

        if (descIff)
            updateIFFOption(descIff);
    }

    updateSelectedIFFOption();

    // re-renderiza o layout do item selecionado (descrição adicionada/removida)
    const itemSel = document.getElementById('item-sel');

    if (itemSel.selected && itemSel.selected.itemObj)
        selectItem(itemSel.selected.itemObj);
});

// ---------- exportar/importar textos traduzíveis (JSONC, UTF-8) ----------

// percorre o objeto (inclusive sub-objetos e arrays) coletando os campos
// StringType TRADUZÍVEIS (relation TEXT — assets e text:no_translate ficam fora)
function collectTextosDe(_obj, _path, _out, _visited) {

    if (!_obj || typeof _obj !== 'object' || _visited.has(_obj))
        return;

    _visited.add(_obj);

    for (const key of Object.keys(_obj)) {

        // links internos (__desc, __modified etc.) não são campos do item
        if (key.startsWith('__'))
            continue;

        let v;

        try { v = _obj[key]; } catch (_) { continue; }

        if (!v || typeof v !== 'object')
            continue;

        const path = _path ? _path + '.' + key : key;

        if (v instanceof StringType) {

            // exatamente o critério do StringType: só TEXT é traduzível
            // (assets e text:no_translate ficam fora)
            if (v.isTranslatable())
                _out.push({ path, st: v });

            continue;
        }

        if (Array.isArray(v)) {

            for (let i = 0; i < v.length; i++)
                collectTextosDe(v[i], path + '[' + i + ']', _out, _visited);

            continue;
        }

        // sub-objeto composto (tem unserialize próprio); escalares com
        // unserialize (Int/Float/Bitfield) não descem
        if (typeof v.unserialize === 'function'
            && !(v instanceof IntTypeBase)
            && !(v instanceof FloatTypeBase)
            && !(v instanceof BitfieldType))
            collectTextosDe(v, path, _out, _visited);
    }
}

// entradas de texto de UM elemento (formato do JSONC)
function textosDoElemento(_iff, _idx, _el, _tidCount, _tidSeen) {

    const found = [];

    collectTextosDe(_el, '', found, new Set());

    let typeidHex = null;

    try {
        if (_el.typeid && typeof _el.typeid.value === 'number')
            typeidHex = (_el.typeid.value >>> 0).toString(16);
    } catch (_) {}

    let dup;

    if (typeidHex != null && _tidCount[typeidHex] > 1)
        dup = _tidSeen[typeidHex] = _tidSeen[typeidHex] || 0, _tidSeen[typeidHex]++;

    return found.map(f => ({
        iff: _iff.name,
        indice: _idx,
        typeid: typeidHex,
        ...(dup !== undefined ? { dup } : {}),
        campo: f.path,
        texto: f.st.value,
    }));
}

function contagemTypeids(_iff) {

    const tidCount = {};

    for (const el of _iff.elements) {

        if (el.__deleted || el.__deleted2 || !el.typeid || typeof el.typeid.value !== 'number')
            continue;

        const hex = (el.typeid.value >>> 0).toString(16);
        tidCount[hex] = (tidCount[hex] || 0) + 1;
    }

    return tidCount;
}

function collectTextos() {

    const out = [];

    for (const iff of iffs) {

        // typeids podem se REPETIR dentro do iff (ex.: CharacterMastery — um
        // character tem vários masteries): pré-conta p/ saber quando a
        // entrada precisa do "dup" (ordinal entre os gêmeos)
        const tidCount = {};
        const tidSeen = {};

        for (const el of iff.elements) {

            if (el.__deleted || el.__deleted2 || !el.typeid || typeof el.typeid.value !== 'number')
                continue;

            const hex = (el.typeid.value >>> 0).toString(16);
            tidCount[hex] = (tidCount[hex] || 0) + 1;
        }

        for (let idx = 0; idx < iff.elements.length; idx++) {

            const el = iff.elements[idx];

            if (el.__deleted || el.__deleted2)
                continue;

            out.push(...textosDoElemento(iff, idx, el, tidCount, tidSeen));
        }
    }

    return out;
}

// serializa como JSONC: cabeçalho comentado + um comentário por grupo de iff
// + uma entrada por linha (compacta, fácil de editar o "texto")
function buildTextosJsonc(_entries) {

    const nl = [];

    nl.push('// jsiffmanager \u2014 exporta\u00e7\u00e3o de textos traduz\u00edveis');
    nl.push('// Formato: JSONC (JSON com coment\u00e1rios) \u00b7 Codifica\u00e7\u00e3o: UTF-8');
    nl.push('// Edite APENAS o campo "texto" de cada entrada e reimporte o arquivo.');
    nl.push('// "iff" + "typeid" (hex) LOCALIZAM o elemento \u2014 o "indice" \u00e9 s\u00f3');
    nl.push('// fallback/confer\u00eancia; "dup" (s\u00f3 em typeids repetidos no iff) \u00e9 o');
    nl.push('// ordinal entre os g\u00eameos. "campo" \u00e9 o caminho do campo.');
    nl.push('// O marcador "=[{enc}]=:" em um texto indica a codifica\u00e7\u00e3o dele:');
    nl.push('// MANTEHA-O para preservar a codifica\u00e7\u00e3o original, ou REMOVA-O quando');
    nl.push('// traduzir o texto para outro idioma \u2014 importado, ele fica em UTF-8.');
    nl.push('');
    nl.push('{');
    nl.push('    "_formato": "jsiffmanager-textos",');
    nl.push('    "_versao": 1,');
    nl.push('    "_encoding": "utf-8",');
    nl.push('    "_gerado_em": "' + new Date().toISOString() + '",');
    nl.push('    "textos": [');

    let lastIff = null;

    _entries.forEach((e, i) => {

        if (e.iff !== lastIff) {

            if (lastIff !== null)
                nl[nl.length - 1] = nl[nl.length - 1] + ',';

            nl.push('');
            nl.push('        // ---- ' + e.iff + ' ----');

            lastIff = e.iff;
        }
        else if (i > 0) {
            nl[nl.length - 1] = nl[nl.length - 1] + ',';
        }

        nl.push('        ' + JSON.stringify(e));
    });

    nl.push('');
    nl.push('    ]');
    nl.push('}');

    return nl.join('\n');
}

// parser JSONC: remove // e /* */ FORA de strings e faz JSON.parse
function parseJsonc(_text) {

    let out = '';
    let inStr = false;
    let esc = false;

    for (let i = 0; i < _text.length; i++) {

        const c = _text[i];

        if (inStr) {

            out += c;

            if (esc)
                esc = false;
            else if (c === '\\')
                esc = true;
            else if (c === '"')
                inStr = false;

            continue;
        }

        if (c === '"') {
            inStr = true;
            out += c;
            continue;
        }

        if (c === '/' && _text[i + 1] === '/') {
            while (i < _text.length && _text[i] !== '\n') i++;
            out += '\n';
            continue;
        }

        if (c === '/' && _text[i + 1] === '*') {
            i += 2;
            while (i < _text.length && !(_text[i] === '*' && _text[i + 1] === '/')) i++;
            i++;
            continue;
        }

        out += c;
    }

    return JSON.parse(out);
}

// resolve caminho "a.b[2].c" sobre o elemento (arrays por índice explícito)
function resolveCampoPath(_el, _campo) {

    const parts =
        String(_campo).replace(/\[(\d+)\]/g, '.$1').split('.').filter(p => p !== '');

    let cur = [_el];

    for (const p of parts) {

        const next = [];

        for (const s of cur) {

            if (!s)
                continue;

            const v = s[p];

            if (Array.isArray(v))
                next.push(...v);
            else
                next.push(v);
        }

        cur = next;
    }

    return cur[0];
}

// aplica as traduções; devolve { aplicados, inalterados, naoEncontrados };
// marca __modified nos elementos alterados
function applyTextos(_data) {

    const res = { aplicados: 0, inalterados: 0, naoEncontrados: 0 };

    if (!_data || _data._formato !== 'jsiffmanager-textos' || !Array.isArray(_data.textos))
        return null;

    const byName = {};

    for (const iff of iffs)
        byName[iff.name] = iff;

    // mapa typeid hex -> elementos vivos por iff: a resolução deixa de ser
    // O(elementos) POR entrada (47k x 14k varreduras travavam o import)
    const tidMaps = {};

    function tidMapOf(_iff) {

        if (!tidMaps[_iff.name]) {

            const m = {};

            _iff.elements.forEach(el => {

                if (el.__deleted || el.__deleted2 || !el.typeid || typeof el.typeid.value !== 'number')
                    return;

                const hex = (el.typeid.value >>> 0).toString(16);
                (m[hex] = m[hex] || []).push(el);
            });

            tidMaps[_iff.name] = m;
        }

        return tidMaps[_iff.name];
    }

    for (const e of _data.textos) {

        const iff =
            byName[e.iff];

        // o TYPEID é o índice real da entrada: localiza o elemento por ele (à prova
        // de deslocamentos de posição entre export/import). Typeids DUPLICADOS no
        // mesmo iff: desambigua pelo "indice" quando aponta a um gêmeo; senão pelo
        // "dup" (ordinal entre os gêmeos na exportação). Sem typeid, cai no "indice"
        let el = null;

        if (iff && e.typeid != null) {

            const matches =
                tidMapOf(iff)[String(e.typeid)] || [];

            if (matches.length === 1)
                el = matches[0];
            else if (matches.length > 1) {

                const byIndice =
                    Number.isInteger(e.indice) ? iff.elements[e.indice] : null;

                if (byIndice && matches.includes(byIndice))
                    el = byIndice;
                else {

                    const occ =
                        typeof e.dup === 'number' ? Math.max(0, Math.min(e.dup, matches.length - 1)) : 0;

                    el = matches[occ];
                }
            }
        }

        if (!el && iff && Number.isInteger(e.indice))
            el = iff.elements[e.indice] || null;

        if (!el || el.__deleted || el.__deleted2) {

            res.naoEncontrados++;
            continue;
        }

        const st =
            resolveCampoPath(el, e.campo);

        if (!(st instanceof StringType)) {

            res.naoEncontrados++;
            continue;
        }

        const novo =
            String(e.texto);

        if (st.value === novo) {

            res.inalterados++;
            continue;
        }

        st.value = novo;
        el.__modified = true;
        res.aplicados++;
    }

    return res;
}

// export com overlay e progresso (coleta em chunks, cedendo à thread)
async function exportTextos() {

    if (!iffs.length)
        return;

    showLoading('Exportando textos traduz\u00edveis (UTF-8)...');
    setLoadingProgress(0);

    await kRafYield();

    try {

        const entries = [];
        const totalEls =
            iffs.reduce((a, i) => a + i.elements.length, 0);

        let done = 0;
        let lastIff = null;

        for (const iff of iffs) {

            const tidCount =
                contagemTypeids(iff);

            const tidSeen = {};

            for (let idx = 0; idx < iff.elements.length; idx += 400) {

                const fim =
                    Math.min(idx + 400, iff.elements.length);

                for (let i = idx; i < fim; i++) {

                    const el =
                        iff.elements[i];

                    if (el.__deleted || el.__deleted2)
                        continue;

                    const novos =
                        textosDoElemento(iff, i, el, tidCount, tidSeen);

                    for (const n of novos)
                        entries.push(n);
                }

                done += fim - idx;
                setLoadingProgress(done / totalEls,
                    (lastIff === iff.name ? '' : (lastIff = iff.name), iff.name)
                    + ' \u2014 ' + done + '/' + totalEls);

                await kRafYield();
            }
        }

        setLoadingProgress(0.98, 'Gerando JSONC...');

        await kRafYield();

        const blob =
            new Blob([buildTextosJsonc(entries)], { type: 'application/json;charset=utf-8' });

        saveAs(blob, 'textos-traduziveis.jsonc');

        console.log('textos exportados:', entries.length);
    } finally {
        hideLoading();
        setLoadingProgress(null);
    }
}

async function importTextosFile(_file) {

    showLoading('Importando textos traduz\u00edveis (UTF-8)...');
    setLoadingProgress(null);

    await kRafYield();

    let data = null;

    try {

        const text =
            await _file.text();

        setLoadingProgress(0.05, 'Interpretando JSONC...');

        await kRafYield();

        data =
            parseJsonc(text);

    } catch (err) {

        hideLoading();
        setLoadingProgress(null);

        await new AlertModal('Arquivo inv\u00e1lido: n\u00e3o foi poss\u00edvel interpretar o JSONC (UTF-8).').show();
        return;
    }

    if (!data || data._formato !== 'jsiffmanager-textos' || !Array.isArray(data.textos)) {

        hideLoading();
        setLoadingProgress(null);

        await new AlertModal('Arquivo inv\u00e1lido: esperado o formato de textos traduz\u00edveis do jsiffmanager (JSONC, UTF-8).').show();
        return;
    }

    // aplica em chunks cedendo à thread para o overlay atualizar
    const total =
        data.textos.length;

    const res = { aplicados: 0, inalterados: 0, naoEncontrados: 0 };

    try {

        const byName = {};

        for (const iff of iffs)
            byName[iff.name] = iff;

        const tidMaps = {};

        const tidMapOf = _iff => {

            if (!tidMaps[_iff.name]) {

                const m = {};

                _iff.elements.forEach(el => {

                    if (el.__deleted || el.__deleted2 || !el.typeid || typeof el.typeid.value !== 'number')
                        return;

                    const hex = (el.typeid.value >>> 0).toString(16);
                    (m[hex] = m[hex] || []).push(el);
                });

                tidMaps[_iff.name] = m;
            }

            return tidMaps[_iff.name];
        };

        const aplicaEntrada = e => {

            const iff =
                byName[e.iff];

            let el = null;

            if (iff && e.typeid != null) {

                const matches =
                    tidMapOf(iff)[String(e.typeid)] || [];

                if (matches.length === 1)
                    el = matches[0];
                else if (matches.length > 1) {

                    const byIndice =
                        Number.isInteger(e.indice) ? iff.elements[e.indice] : null;

                    if (byIndice && matches.includes(byIndice))
                        el = byIndice;
                    else {

                        const occ =
                            typeof e.dup === 'number' ? Math.max(0, Math.min(e.dup, matches.length - 1)) : 0;

                        el = matches[occ];
                    }
                }
            }

            if (!el && iff && Number.isInteger(e.indice))
                el = iff.elements[e.indice] || null;

            if (!el || el.__deleted || el.__deleted2) {

                res.naoEncontrados++;
                return;
            }

            const st =
                resolveCampoPath(el, e.campo);

            if (!(st instanceof StringType)) {

                res.naoEncontrados++;
                return;
            }

            const novo =
                String(e.texto);

            if (st.value === novo) {

                res.inalterados++;
                return;
            }

            st.value = novo;
            el.__modified = true;
            res.aplicados++;
        };

        for (let i = 0; i < total; i += 2000) {

            const fim =
                Math.min(i + 2000, total);

            for (let k = i; k < fim; k++)
                aplicaEntrada(data.textos[k]);

            setLoadingProgress((i + (fim - i)) / total * 0.95 + 0.03,
                'Importando textos... ' + fim + '/' + total);

            await kRafYield();
        }

    } finally {
        hideLoading();
        setLoadingProgress(null);
    }

    makeItemSelection(true);
    updateSelectedIFFOption();


    await new AlertModal('Textos importados (UTF-8): ' + res.aplicados + ' aplicado(s), '
        + res.inalterados + ' j\u00e1 igual(is), ' + res.naoEncontrados + ' n\u00e3o encontrado(s).').show();
}

document.getElementById('div-textos-iff').addEventListener('click', async function(evt) {

    if (!iffs.length)
        return;

    const modal =
        new Modal({ title: 'Textos traduz\u00edveis (UTF-8)', dialogClass: 'modal-dialog-wide' });

    const info =
        document.createElement('p');

    info.style.cssText =
        'margin:0 0 10px 0;font-size:15px;line-height:1.45;';

    info.textContent =
        'Exporta ou importa TODOS os textos traduz\u00edveis de todos os IFFs carregados. '
        + 'O arquivo \u00e9 JSONC (JSON com coment\u00e1rios) em UTF-8 \u2014 edite o campo "texto" '
        + 'de cada entrada e reimporte para traduzir tudo de uma vez. '
        + 'Cada entrada \u00e9 localizada pelo seu TYPEID.';

    modal.body.appendChild(info);

    modal.addButton('Exportar textos traduz\u00edveis (UTF-8)', 'btn btn-primary', () => {

        modal.hide(null);
        exportTextos();
    });

    modal.addButton('Importar textos traduz\u00edveis (UTF-8)', 'btn btn-primary', () => {

        modal.hide(null);
        document.getElementById('textosInput').click();
    });

    modal.addButton('Cancelar', 'btn btn-secondary', () => modal.hide(null));

    await modal.show();
});

document.getElementById('textosInput').addEventListener('change', async function(evt) {

    const file =
        this.files && this.files[0];

    this.value = '';

    if (!file)
        return;

    await importTextosFile(file);
});

document.getElementById('div-save-iff').addEventListener('click', async function(evt) {
    if (!currentFile)
        return;

    const codePage = await new CodePageModal('Selecione o encoding do arquivo IFF', currentFile.encoding).show();

    if (codePage == null)
        return;

    if (codePage && typeof codePage === 'string' && kCodePageSupported.includes(codePage)) {
        currentFile.encoding = codePage;
        kCodePage.upload = kCodePage.load = codePage;
    }

    await saveToBrowser();

    console.log('salvar no navegador terminou');
});

document.getElementById('div-download-iff').addEventListener('click', async function(evt) {
    if (!currentFile)
        return;

    // o baixar é um snapshot do estado atual: se houver modificações não salvas,
    // pergunta se o usuário quer salvá-las antes (salvar = atualizar os estados)
    if (iffs.some(iff => iff.hasChange())) {
        const shouldSave = await new ConfirmModal('O arquivo atual tem modificações. Deseja salvar antes de baixar?').show();

        if (shouldSave)
            await saveToBrowser();
    }

    const codePage = await new CodePageModal('Selecione o encoding do arquivo IFF', currentFile.encoding).show();

    if (codePage == null)
        return;

    if (codePage && typeof codePage === 'string' && kCodePageSupported.includes(codePage)) {
        currentFile.encoding = codePage;
        kCodePage.upload = kCodePage.load = codePage;
    }

    // snapshot: baixa o estado atual SEM atualizar os estados dos itens
    await saveIFF(iffs, currentFile.name, false);

    console.log('baixar terminou');
});

document.getElementById('btn-toggle-recents').addEventListener('click', function() {
    recentsCollapsed = !recentsCollapsed;

    const list = document.getElementById('recent-files');

    if (list.children.length > 0)
        list.hidden = recentsCollapsed;

     document.getElementById('btn-toggle-recents').textContent = (recentsCollapsed ? '▾' : '▴') + ' Recentes';
});

document.getElementById('div-close-iff').addEventListener('click', async function() {
    if (iffs.some(iff => iff.hasChange())) {
        const shouldSave = await new ConfirmModal('Deseja salvar as alterações antes de fechar?').show();

        if (shouldSave) {
            await saveToBrowser();
        }
    }

    currentFile = null;

    iffs = [];

    hideOpenControls();

    document.getElementById('zipInput').nextElementSibling.textContent = 'Selecione o arquivo IFF';

    destroyChoices(document.getElementById('iff-sel'));
    document.getElementById('iff-sel').innerHTML = '';

    document.getElementById('item-sel').innerHTML = '';
    clearGeralInfo();
    document.getElementById('searchItem').value = '';

    updateFilterPanelVisibility();

    syncSearchClear();

    recentsCollapsed = false;

    document.getElementById('btn-toggle-recents').textContent = '▾ Recentes';

    renderRecentFiles();
});

function showLoading(_title = 'Carregando arquivos...') {
    const loading = document.getElementById('div-loading');
    const files = document.getElementById('loading-files');
    const title = loading.querySelector('.loading-title');

    files.innerHTML = '';

    if (title)
        title.textContent = _title;

    loading.hidden = false;
}

function showZipProgress(_iffs, _title) {
    showLoading(_title);

    const fileDivs = {};

    _iffs.forEach(_iff => {
        fileDivs[_iff.name] = addLoadingFile(_iff.name);
    });

    return metadata => {
        const name = metadata && metadata.currentFile && metadata.currentFile.name;
        const div = name && fileDivs[name];

        if (div)
            div.textContent = `${name} (${Math.round(metadata.percent)}%)`;
    };
}

function addLoadingFile(_name) {
    const files = document.getElementById('loading-files');

    const div = document.createElement('div');

    div.className = 'loading-file';

    div.textContent = _name;

    files.appendChild(div);

    div.scrollIntoView({
        behaivor: 'smooth',
        block: 'nearest'
    });

    return div;
}

function updateLoadingCount(_div, _count, _total) {
    _div.textContent = `${_div.textContent.split(' (')[0]} (${_count}/${_total} carregados)`;
}

function updateLoadingNoItems(_div) {
    _div.textContent = `${_div.textContent.split(' (')[0]} (sem itens)`;
}

function hideLoading() {
    document.getElementById('div-loading').hidden = true;
}

// barra de progresso do overlay: null/esconde, 0..1 mostra com % e texto
function setLoadingProgress(_pct, _texto) {

    const box =
        document.getElementById('loading-progress');

    if (!box)
        return;

    if (_pct == null) {

        box.hidden = true;
        return;
    }

    const p =
        Math.max(0, Math.min(1, _pct));

    box.hidden = false;
    document.getElementById('loading-progress-fill').style.width =
        Math.round(p * 100) + '%';
    document.getElementById('loading-progress-text').textContent =
        _texto != null ? _texto : Math.round(p * 100) + '%';
}

const kRafYield = () => new Promise(resolve => requestAnimationFrame(() => resolve()));

document.getElementById('zipInput').addEventListener('change', async function(evt) {
    const file = evt.target.files[0];
    if (!file) {
        evt.target.nextElementSibling.textContent = 'Selecione o arquivo IFF';
        hideOpenControls();
        return;
    }

    if (iffs.some(iff => iff.hasChange())) {
        const shouldSave = await new ConfirmModal('O arquivo atual tem modificações. Deseja salvar antes de abrir?').show();

        if (shouldSave) {
            await saveToBrowser();
        }
    }

    evt.target.nextElementSibling.textContent = file.name;

    const arrayBuffer = await file.arrayBuffer();

    // TH vem encriptado com XTEA (não é zip) e usa cp874 — pula o modal de encoding.
    const isTH = !isZipMagic(new Uint8Array(arrayBuffer, 0, Math.min(4, arrayBuffer.byteLength)));
    const codePage = isTH
        ? 'cp874'
        : await new CodePageModal('Selecione o encoding do arquivo IFF', kCodePage.load).show();

    if (codePage == null) {
        evt.target.nextElementSibling.textContent = 'Selecione o arquivo IFF';
        return;
    }

    if (codePage && typeof codePage === 'string' && kCodePageSupported.includes(codePage))
        kCodePage.load = kCodePage.upload = codePage;

    currentFile = { name: file.name, encoding: codePage, originalBlob: file, originalEncoding: codePage, loadBlob: file };

    await loadIFFZip(arrayBuffer);

    atualizaBotaoArquivoInfo();

    await autoSaveToBrowser();

    console.log('carregar terminou');
});

let gResourceFilesMap =
    new Map();

let gResourceFilesCount =
    0;

const resDirInputEl =
    document.getElementById('resDirInput');

if (resDirInputEl) {

    resDirInputEl.addEventListener('change', function(evt) {

        const files =
            evt.target.files;

        if (files && files.length) {

            for (let i = 0; i < files.length; i++) {

                const file =
                    files[i];

                const nameKey =
                    file.name.toLowerCase();

                const pathKey =
                    file.webkitRelativePath
                        ? file.webkitRelativePath.toLowerCase()
                        : null;

                const uniqueKey =
                    pathKey || nameKey;

                if (!gResourceFilesMap.has(uniqueKey))
                    gResourceFilesCount++;

                gResourceFilesMap.set(
                    nameKey,
                    file
                );

                if (pathKey) {

                    gResourceFilesMap.set(
                        pathKey,
                        file
                    );
                }
            }
        }

        const labelEl =
            document.getElementById('label-res-dir');

        if (labelEl) {

            labelEl.textContent =
                `Diretório de Recursos (${gResourceFilesCount})`;

            labelEl.title =
                `${gResourceFilesCount} arquivos acumulados (clique para adicionar mais diretórios)`;
        }

        // reseta para o usuário poder acumular selecionando o mesmo diretório de novo
        evt.target.value = '';
    });
}

if (typeof indexedDB !== 'undefined')
    renderRecentFiles();

// painel de filtros começa oculto (sem iff selecionado)
updateFilterPanelVisibility();
