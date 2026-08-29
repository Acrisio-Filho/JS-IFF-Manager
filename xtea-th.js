// Arquivo xtea-th.js
// Criado em 27/08/2026 as 02:05 por agente do opencode LLMs

// xtea-th.js
// Criptografia XTEA do pack da região TH (Fresh Up!, Tailândia, 829).
// Chave e algoritmo espelhados de tests/unpack_xtea.cpp (validados contra o binário).
const kXteaThKeys = [0x0486D82B, 0x0148C72B, 0x027EEAFB, 0x05A23814];
const kXteaThSoma = 0x61C88647 >>> 0;            // incremento do decrypt (≡ −DELTA)
const kXteaThBase = 0xE3779B90 >>> 0;            // DELTA * 16 (valor inicial do delta no decrypt)
const kXteaThDelta = 0x9E3779B9 >>> 0;          // DELTA (incremento do encrypt, ≡ −kXteaThSoma)

function xteaThBlockDecrypt(v0, v1) {
    let delta = kXteaThBase;
    for (let i = 0; i < 16; i++) {
        v1 = (v1 - ((((v0 << 4) ^ (v0 >>> 5)) + v0) ^ (delta + kXteaThKeys[(delta >>> 11) & 3]))) >>> 0;
        delta = (delta + kXteaThSoma) >>> 0;
        v0 = (v0 - ((((v1 << 4) ^ (v1 >>> 5)) + v1) ^ (delta + kXteaThKeys[delta & 3]))) >>> 0;
    }
    return [v0, v1];
}

function xteaThBlockEncrypt(v0, v1) {
    // Inverso do decrypt: `soma` começa em 0 e o `delta` (chave de rodada)
    // vale o mesmo que `soma`; o incremento +kXteaThDelta (≡ −kXteaThSoma)
    // percorre 0..16*DELTA, espelhando o decrypt (delta inicia em kXteaThBase
    // e cresce de kXteaThSoma por rodada).
    let soma = 0;
    let delta = soma;
    for (let i = 0; i < 16; i++) {
        v0 = (v0 + ((((v1 << 4) ^ (v1 >>> 5)) + v1) ^ (delta + kXteaThKeys[delta & 3]))) >>> 0;
        soma = (soma + kXteaThDelta) >>> 0;
        delta = soma;
        v1 = (v1 + ((((v0 << 4) ^ (v0 >>> 5)) + v0) ^ (delta + kXteaThKeys[(delta >>> 11) & 3]))) >>> 0;
    }
    return [v0, v1];
}

function xteaThProcess(_data, _fn) {
    const out = new Uint8Array(_data.length);
    const full = _data.length - (_data.length % 8);
    for (let off = 0; off < full; off += 8) {
        let v0 = (_data[off] | (_data[off + 1] << 8) | (_data[off + 2] << 16) | (_data[off + 3] << 24)) >>> 0;
        let v1 = (_data[off + 4] | (_data[off + 5] << 8) | (_data[off + 6] << 16) | (_data[off + 7] << 24)) >>> 0;
        [v0, v1] = _fn(v0, v1);
        out[off] = v0 & 0xFF; out[off + 1] = (v0 >>> 8) & 0xFF; out[off + 2] = (v0 >>> 16) & 0xFF; out[off + 3] = (v0 >>> 24) & 0xFF;
        out[off + 4] = v1 & 0xFF; out[off + 5] = (v1 >>> 8) & 0xFF; out[off + 6] = (v1 >>> 16) & 0xFF; out[off + 7] = (v1 >>> 24) & 0xFF;
    }
    const rest = _data.length - full;
    if (rest > 0) {
        const blk = new Uint8Array(8);
        blk.set(_data.subarray(full, full + rest));
        let v0 = (blk[0] | (blk[1] << 8) | (blk[2] << 16) | (blk[3] << 24)) >>> 0;
        let v1 = (blk[4] | (blk[5] << 8) | (blk[6] << 16) | (blk[7] << 24)) >>> 0;
        [v0, v1] = _fn(v0, v1);
        blk[0] = v0 & 0xFF; blk[1] = (v0 >>> 8) & 0xFF; blk[2] = (v0 >>> 16) & 0xFF; blk[3] = (v0 >>> 24) & 0xFF;
        blk[4] = v1 & 0xFF; blk[5] = (v1 >>> 8) & 0xFF; blk[6] = (v1 >>> 16) & 0xFF; blk[7] = (v1 >>> 24) & 0xFF;
        out.set(blk.subarray(0, rest), full);
    }
    return out;
}

// Localiza o fim real do ZIP (EOCD, assinatura PK\x05\x06). O zip original do
// TH pode não ser múltiplo de 8, então a encriptação XTEA adiciona zero-padding
// de cauda; o EOCD permite recuperar o tamanho exato (22 + commentLen).
function findZipEocd(_u8) {
    for (let i = _u8.length - 22; i >= 0; i--) {
        if (_u8[i] === 0x50 && _u8[i + 1] === 0x4B && _u8[i + 2] === 0x05 && _u8[i + 3] === 0x06)
            return i;
    }
    return -1;
}

function xteaDecryptTH(_data) {
    const out = xteaThProcess(_data instanceof ArrayBuffer ? new Uint8Array(_data) : _data, xteaThBlockDecrypt);
    // Remove o zero-padding de cauda da encriptação truncando no fim do ZIP.
    const eocd = findZipEocd(out);
    if (eocd >= 0) {
        const commentLen = out[eocd + 20] | (out[eocd + 21] << 8);
        return out.slice(0, eocd + 22 + commentLen);
    }
    return out;
}

function xteaEncryptTH(_data) {
    const u8 = _data instanceof ArrayBuffer ? new Uint8Array(_data) : _data;
    // A encriptação XTEA exige múltiplo de 8; zero-pad no fim (igual ao pack
    // original do TH) para que o descriptografamento + trim pelo EOCD feche o
    // tamanho exato e o arquivo salvo seja idêntico ao original.
    const pad = (8 - (u8.length % 8)) % 8;
    if (pad === 0)
        return xteaThProcess(u8, xteaThBlockEncrypt);
    const work = new Uint8Array(u8.length + pad);
    work.set(u8);
    return xteaThProcess(work, xteaThBlockEncrypt);
}

function isZipMagic(_data) {
    let a;
    if (_data instanceof ArrayBuffer) a = new Uint8Array(_data, 0, 4);
    else a = _data.subarray(0, 4);
    return a[0] === 0x50 && a[1] === 0x4b && a[2] === 0x03 && a[3] === 0x04;
}
