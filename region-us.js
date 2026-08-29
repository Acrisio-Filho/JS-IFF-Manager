// Arquivo region-us.js
// Criado em 26/08/2026 as 00:19 por agente do opencode LLMs

// region-us.js — região US (Fresh Up!, USA, 852): mesma temporada do JP 983,
// textos em ASCII (campos menores que o SJIS do JP). Fonte: mapa st_*.ini
// (tests/data) + verificação byte a byte com o pack tests/data/pangya_gb.iff.
// Registrado em kIffRegionVariants (main.js): o IFF testa as variantes
// quando o tamanho do elemento não bate com o JP.
//
// Diferenças por iff:
//  - 19 iffs da família Base: só o name 64 -> 40 (icon continua 43);
//  - MemorialShopRareItem: sem o s_string do JP (4 bytes finais = unknown uint32, 0 nos dados);
//  - Mascot: estrutura mantida; price vira Int16×5 (moeda US) e o efeito só
//    troca power_drive para Int8 (ver MascotEfeitoUS) — fecha em 284;
//  - SetEffectTable: sem unknown(11)/slot(10)/effect_add_power(2), sobram
//    3 bytes no fim (HexEditor(3)).
//
// PEGADINHA: os campos da subclasse PRECISAM ser trocados no construtor
// (depois do super(), ANTES do unserialize) — o inicializador de campo da
// classe derivada roda após o corpo do construtor da base, que já teria
// feito o unserialize com os tamanhos do JP.

// cria a subclasse US de uma classe do JP: troca os campos informados no
// construtor (fábrica por instância — cada elemento ganha campos próprios)
function kUSVariantClass(_Base, _fields) {

    return class extends _Base {

        constructor(_data = undefined) {

            super();

            for (const k in _fields)
                this[k] =
                    _fields[k]();

            if (_data)
                this.unserialize(_data.getBuffer(this.getSize()));
        }
    };
}

const CharacterUS =
    kUSVariantClass(Character, { name: () => new StringType(40, StringTypeRelation.TEXT) });

const ItemUS =
    kUSVariantClass(Item, { name: () => new StringType(40, StringTypeRelation.TEXT) });

const PartUS =
    kUSVariantClass(Part, { name: () => new StringType(40, StringTypeRelation.TEXT) });

const ClubUS =
    kUSVariantClass(Club, { name: () => new StringType(40, StringTypeRelation.TEXT) });

const ClubSetUS =
    kUSVariantClass(ClubSet, { name: () => new StringType(40, StringTypeRelation.TEXT) });

const BallUS =
    kUSVariantClass(Ball, { name: () => new StringType(40, StringTypeRelation.TEXT) });

const CaddieUS =
    kUSVariantClass(Caddie, { name: () => new StringType(40, StringTypeRelation.TEXT) });

const CaddieItemUS =
    kUSVariantClass(CaddieItem, { name: () => new StringType(40, StringTypeRelation.TEXT) });

const SetItemUS =
    kUSVariantClass(SetItem, { name: () => new StringType(40, StringTypeRelation.TEXT) });

const CourseUS =
    kUSVariantClass(Course, { name: () => new StringType(40, StringTypeRelation.TEXT) });

const SkinUS =
    kUSVariantClass(Skin, { name: () => new StringType(40, StringTypeRelation.TEXT) });

const HairStyleUS =
    kUSVariantClass(HairStyle, { name: () => new StringType(40, StringTypeRelation.TEXT) });

const AchievementUS =
    kUSVariantClass(Achievement, { name: () => new StringType(40, StringTypeRelation.TEXT) });

// name = tamanho restante do Base KR (168 - 8 = 160): o programa original
// usava um buffer de name de 160 bytes (CounterItem/QuestStuff/QuestItem do KR
// estouram 40/64 — nomes de até 68 bytes). Mantém o elemento com o mesmo
// tamanho do Base (name absorve level/icon/shop/tiki/date).
const CounterItemUS =
    kUSVariantClass(CounterItem, { name: () => new StringType(160, StringTypeRelation.TEXT) });

const AuxPartUS =
    kUSVariantClass(AuxPart, { name: () => new StringType(40, StringTypeRelation.TEXT) });

const QuestStuffUS =
    kUSVariantClass(QuestStuff, { name: () => new StringType(160, StringTypeRelation.TEXT) });

const QuestItemUS =
    kUSVariantClass(QuestItem, { name: () => new StringType(160, StringTypeRelation.TEXT) });

const CardUS =
    kUSVariantClass(Card, { name: () => new StringType(40, StringTypeRelation.TEXT) });

const FurnitureUS =
    kUSVariantClass(Furniture, { name: () => new StringType(40, StringTypeRelation.TEXT) });

// o US NÃO tem a string S01.. do JP: os 4 bytes finais são um uint32
// desconhecido (sempre 0 nos dados reais do pack)
class MemorialShopRareItemUS extends MemorialShopRareItem {

    constructor(_data = undefined) {

        super();

        delete this.s_string;

        this.unknown =
            new Int32Type(false, true, true);

        if (_data)
            this.unserialize(_data.getBuffer(this.getSize()));
    }

    getSize() {
        return this.active.getSize() + this.gacha.getSize() + this.typeid.getSize()
            + this.probability.getSize() + this.rare_type.getSize()
            + this.filter_type.reduce((acc, v) => acc + v.getSize(), 0)
            + this.unknown.getSize();
    }

    unserialize(_data) {
        this.active.unserialize(_data.getBuffer(this.active.getSize()));
        this.gacha.unserialize(_data.getBuffer(this.gacha.getSize()));
        this.typeid.unserialize(_data.getBuffer(this.typeid.getSize()));
        this.probability.unserialize(_data.getBuffer(this.probability.getSize()));
        this.rare_type.unserialize(_data.getBuffer(this.rare_type.getSize()));
        this.filter_type.forEach(v => v.unserialize(_data.getBuffer(v.getSize())));
        this.unknown.unserialize(_data.getBuffer(this.unknown.getSize()));
    }

    serialize(_data) {
        this.active.serialize(_data);
        this.gacha.serialize(_data);
        this.typeid.serialize(_data);
        this.probability.serialize(_data);
        this.rare_type.serialize(_data);
        this.filter_type.forEach(v => v.serialize(_data));
        this.unknown.serialize(_data);
    }

    layout(_parent) {
        this.active.layout(_parent, "active");
        this.typeid.layout(_parent, "typeid");
        this.probability.layout(_parent, "probability");
        this.rare_type.layout(_parent, "rare_type");

        // mesmos labels descritivos do JP
        _parent.appendChild(arrayLayout(this.filter_type, "filter_type",
            { getName: _i => kMemorialShopFilterLabels[_i] }));

        this.unknown.layout(_parent, "unknown");
    }
}

// efeito do Mascot US: MESMA estrutura do JP, só o power_drive é Int8 no
// lugar de Int16 (1+2+2+2+2+1 = 10 bytes; o do JP é 5xInt16+Int8 = 11).
// Posições verificadas por correlação JP×US pelo typeid (34 elementos).
class MascotEfeitoUS {

     power_drive = new Int8Type(false, true);
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

class MascotUS extends Mascot {

    constructor(_data = undefined) {

        super();

        // textos ASCII: name menor que o SJIS do JP
        this.name =
            new StringType(40, StringTypeRelation.TEXT);

        // moeda US inflacionada: price em 2 bytes (st_mascot.ini)
        this.price =
            Array(5).fill(0).map(_ => new Int16Type(false, true, true));

        this.c =
            Array(5).fill(0).map(_ => new Int8Type(false, true));

        // efeito do US: mantém o item_slot (igual ao JP); só o power_drive vira Int8
        this.efeito =
            new MascotEfeitoUS();

        this.msg =
            new MascotMessage();

        this.bonus_pang =
            new MascotBonusPang();

        if (_data)
            this.unserialize(_data.getBuffer(this.getSize()));
    }

    getSize() {
        return this.active.getSize() + this.typeid.getSize() + this.name.getSize()
            + this.level.getSize() + this.icon.getSize() + this.shop.getSize()
            + this.tiki.getSize() + this.date.getSize()
            + this.mpet.getSize() + this.texture.getSize()
            + this.price.reduce((acc, v) => acc + v.getSize(), 0)
            + this.c.reduce((acc, v) => acc + v.getSize(), 0)
            + this.efeito.getSize() + this.msg.getSize() + this.bonus_pang.getSize();
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
        this.mpet.unserialize(_data.getBuffer(this.mpet.getSize()));
        this.texture.unserialize(_data.getBuffer(this.texture.getSize()));
        this.price.forEach(v => v.unserialize(_data.getBuffer(v.getSize())));
        this.c.forEach(v => v.unserialize(_data.getBuffer(v.getSize())));
        this.efeito.unserialize(_data.getBuffer(this.efeito.getSize()));
        this.msg.unserialize(_data.getBuffer(this.msg.getSize()));
        this.bonus_pang.unserialize(_data.getBuffer(this.bonus_pang.getSize()));
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
        this.mpet.serialize(_data);
        this.texture.serialize(_data);
        this.price.forEach(v => v.serialize(_data));
        this.c.forEach(v => v.serialize(_data));
        this.efeito.serialize(_data);
        this.msg.serialize(_data);
        this.bonus_pang.serialize(_data);
    }
}

// KR 839: Mascot tem name 40 (igual ao US) mas o efeito mantém o formato JP
// (MascotEfeito, 11 bytes) — diferente do US que encurta o efeito p/ 10 bytes.
// Logo KR=280, US=284. Reusa a variante name-40 do JP (efeito intacto).
const MascotKR =
    kUSVariantClass(Mascot, { name: () => new StringType(40, StringTypeRelation.TEXT) });

class SetEffectTableUS extends SetEffectTable {

    constructor(_data = undefined) {

        super();

        // o US não tem unknown(11)/slot(5xInt16)/effect_add_power(Int16):
        // sobram 3 bytes no fim do elemento
        this.unknown =
            new HexEditor(3);

        this.slot =
            [];

        this.effect_add_power =
            null;

        if (_data)
            this.unserialize(_data.getBuffer(this.getSize()));
    }

    getSize() {
        return this.id.getSize() + this.effect.getSize() + this.item.getSize()
            + this.unknown.getSize();
    }

    unserialize(_data) {
        this.id.unserialize(_data.getBuffer(this.id.getSize()));
        this.effect.unserialize(_data.getBuffer(this.effect.getSize()));
        this.item.unserialize(_data.getBuffer(this.item.getSize()));
        this.unknown.unserialize(_data.getBuffer(this.unknown.getSize()));
    }

    serialize(_data) {
        this.id.serialize(_data);
        this.effect.serialize(_data);
        this.item.serialize(_data);
        this.unknown.serialize(_data);
    }

    layout(_parent) {
        this.id.layout(_parent, "id");

        classLayout(_parent, "effect", this.effect);
        classLayout(_parent, "item", this.item);

        this.unknown.layout(_parent, "unknown");
    }
}

// registro das variantes US por iff (testadas na ordem)
kIffRegionVariants['Character.iff'] = [{ region: 'US', ctor: CharacterUS }];
kIffRegionVariants['Item.iff'] = [{ region: 'US', ctor: ItemUS }];
kIffRegionVariants['Part.iff'] = [{ region: 'US', ctor: PartUS }];
kIffRegionVariants['Club.iff'] = [{ region: 'US', ctor: ClubUS }];
kIffRegionVariants['ClubSet.iff'] = [{ region: 'US', ctor: ClubSetUS }];
kIffRegionVariants['Ball.iff'] = [{ region: 'US', ctor: BallUS }];
kIffRegionVariants['Caddie.iff'] = [{ region: 'US', ctor: CaddieUS }];
kIffRegionVariants['CaddieItem.iff'] = [{ region: 'US', ctor: CaddieItemUS }];
kIffRegionVariants['SetItem.iff'] = [{ region: 'US', ctor: SetItemUS }];
kIffRegionVariants['Course.iff'] = [{ region: 'US', ctor: CourseUS }];
kIffRegionVariants['Skin.iff'] = [{ region: 'US', ctor: SkinUS }];
kIffRegionVariants['HairStyle.iff'] = [{ region: 'US', ctor: HairStyleUS }];
kIffRegionVariants['Achievement.iff'] = [{ region: 'US', ctor: AchievementUS }];
kIffRegionVariants['CounterItem.iff'] = [{ region: 'US', ctor: CounterItemUS }];
kIffRegionVariants['AuxPart.iff'] = [{ region: 'US', ctor: AuxPartUS }];
kIffRegionVariants['QuestStuff.iff'] = [{ region: 'US', ctor: QuestStuffUS }];
kIffRegionVariants['QuestItem.iff'] = [{ region: 'US', ctor: QuestItemUS }];
kIffRegionVariants['Card.iff'] = [{ region: 'US', ctor: CardUS }];
kIffRegionVariants['Furniture.iff'] = [{ region: 'US', ctor: FurnitureUS }];
kIffRegionVariants['MemorialShopRareItem.iff'] = [{ region: 'US', ctor: MemorialShopRareItemUS }];
kIffRegionVariants['Mascot.iff'] = [{ region: 'US', ctor: MascotUS }];
kIffRegionVariants['SetEffectTable.iff'] = [{ region: 'US', ctor: SetEffectTableUS }];

// Fresh Up! KR (versão 839) compartilha o LAYOUT do US 852 (name 40, Mascot
// Int16×5, SetEffectTable HexEditor(3), MemorialShopRareItem sem s_string) — as
// variantes de região apontam para as MESMAS classes do US (idêntico na medição
// de tamanho por elemento do tests/pangya.iff).
for (const _k of Object.keys(kIffRegionVariants)) {

    const _us =
        kIffRegionVariants[_k].find(v => v.region === 'US');

    if (!_us)
        continue;

    // KR e US são idênticos em 21/22 iffs; só o Mascot difere (efeito KR mantém
    // 11 bytes do JP, US encurta p/ 10) — KR=280, US=284.
    const krCtor =
        _k === 'Mascot.iff' ? MascotKR : _us.ctor;

    kIffRegionVariants[_k].push({ region: 'KR', ctor: krCtor });
}
