// Arquivo region-th.js
// Criado em 27/08/2026 as 02:05 por agente do opencode LLMs

// region-th.js — região TH (Fresh Up!, Tailândia, 829c, cp874, pack XTEA).
class SkinTH extends Skin {
    _ensureFields() {
        if (this._thReady)
            return;
        this._thReady = true;
        // Os campos abaixo trocam de tipo/tamanho (JP/US -> TH). O _ensureFields
        // roda no unserialize() (load direto do TH) e no serialize() (após a
        // _converteCopiaCampos). Na conversão a cópia gravou os valores nos
        // campos da classe pai (name StringType(64), price Int16×5, point Int16);
        // ao recriar os campos com o tipo TH aqui eles seriam perdidos se não
        // os capturássemos antes — a captura _cur* é necessária.
        const _curName = this.name;
        this.name = new StringType(40, StringTypeRelation.TEXT);
        if (_curName && _curName.value !== undefined)
            this.name.value = _curName.value;
        // point: 2 bytes de align memory (possivelmente padding entre os campos).
        const _curPoint = this.point;
        this.point = new Int16Type(false, true, true);
        if (_curPoint && _curPoint.value !== undefined)
            this.point.value = _curPoint.value;
        // price: 5×Int32 no TH (20 bytes) vs 5×Int16 (10 bytes) do JP — idem.
        const _curPrice = this.price;
        this.price = Array(5).fill(0).map((_, i) => {
            const v = new Int32Type(false, true, true);
            if (_curPrice && _curPrice[i] && _curPrice[i].value !== undefined)
                v.value = _curPrice[i].value;
            return v;
        });
    }

    getSize() {
        this._ensureFields();
        return Base.prototype.getSize.call(this)
            + this.mpet.getSize() + this.horizontal_scroll.getSize()
            + this.vertical_scroll.getSize() + this.point.getSize()
            + this.price.reduce((a, v) => a + v.getSize(), 0);
    }

    unserialize(_data) {
        this._ensureFields();
        const all = _data.getBuffer(this.getSize());
        const bytes = all.data;
        const sub = ReaderBuffer.from(bytes);
        Base.prototype.unserialize.call(this, sub.getBuffer(Base.prototype.getSize.call(this)));
        this.mpet.unserialize(sub.getBuffer(this.mpet.getSize()));
        this.horizontal_scroll.unserialize(sub.getBuffer(this.horizontal_scroll.getSize()));
        this.vertical_scroll.unserialize(sub.getBuffer(this.vertical_scroll.getSize()));
        this.point.unserialize(sub.getBuffer(this.point.getSize()));
        this.price.forEach(v => v.unserialize(sub.getBuffer(v.getSize())));
    }

    serialize(_data) {
        this._ensureFields();
        Base.prototype.serialize.call(this, _data);
        this.mpet.serialize(_data);
        this.horizontal_scroll.serialize(_data);
        this.vertical_scroll.serialize(_data);
        this.point.serialize(_data);
        this.price.forEach(v => v.serialize(_data));
    }

    layout(_parent) {
        this._ensureFields();
        Base.prototype.layout.call(this, _parent);
        this.mpet.layout(_parent, "mpet");
        this.horizontal_scroll.layout(_parent, "horizontal_scroll");
        this.vertical_scroll.layout(_parent, "vertical_scroll");
        this.point.layout(_parent, "point");
        _parent.appendChild(arrayLayout(this.price, "price", { getName: _i => kSkinPriceLabels[_i] }));
    }
}

for (const k in kIffRegionVariants) {
    if (k === 'Skin.iff')
        continue;
    const us = kIffRegionVariants[k].find(v => v.region === 'US');
    if (us) kIffRegionVariants[k].push({ region: 'TH', ctor: us.ctor });
}

kIffRegionVariants['Skin.iff'].push({ region: 'TH', ctor: SkinTH });
