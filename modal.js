// Arquivo modal.js
// Criado em 04/08/2026 as 15:04 por agente do opencode LLMs

// modal.js — classe base de modal (Bootstrap) + derivações do app
// substitui os alert/confirm/prompt nativos e as redefinições de modal

class Modal {

    constructor(_opts = {}) {

        this._done = false;

        this._promise =
            new Promise(resolve => {

                this._resolve = resolve;
            });

        this.modal =
            document.createElement("div");

        this.modal.className =
            "modal fade" + (_opts.modalClass ? " " + _opts.modalClass : "");

        this.modal.setAttribute("tabindex", "-1");

        this.dialog =
            document.createElement("div");

        this.dialog.className =
            "modal-dialog" + (_opts.dialogClass ? " " + _opts.dialogClass : "");

        this.content =
            document.createElement("div");

        this.content.className =
            "modal-content";

        this.header =
            document.createElement("div");

        this.header.className =
            "modal-header";

        this.titleEl =
            document.createElement("h5");

        this.titleEl.className =
            "modal-title";

        this.titleEl.textContent =
            _opts.title || "";

        this.closeBtn =
            document.createElement("button");

        this.closeBtn.type = "button";
        this.closeBtn.className = "btn-close";
        this.closeBtn.setAttribute("aria-label", "Close");

        this.header.appendChild(this.titleEl);
        this.header.appendChild(this.closeBtn);
        this.content.appendChild(this.header);

        this.body =
            document.createElement("div");

        this.body.className =
            "modal-body";

        this.content.appendChild(this.body);

        this.footer =
            document.createElement("div");

        this.footer.className =
            "modal-footer";

        this.content.appendChild(this.footer);

        this.dialog.appendChild(this.content);
        this.modal.appendChild(this.dialog);
        document.body.appendChild(this.modal);

        this._bs =
            new bootstrap.Modal(this.modal);

        this.closeBtn.addEventListener("click", () => this.hide(null));
        this.modal.addEventListener("hidden.bs.modal", () => {

            if (!this._done)
                this.hide(null);
        });
    }

    show() {

        this._bs.show();

        // o modal nasce oculto e o Bootstrap adia o display:block ~1 frame;
        // widgets Choices medem a largura sem cap e estouram a borda. Recapa
        // no shown.bs.modal (layout final do modal).
        this.modal.addEventListener('shown.bs.modal', () => {
            if (typeof fitChoicesToParent === 'function')
                fitChoicesToParent(this.body);
        }, { once: true });

        return this._promise;
    }

    addButton(_text, _className, _onClick) {

        const btn =
            document.createElement("button");

        btn.type = "button";
        btn.className = _className;
        btn.textContent = _text;

        btn.addEventListener("click", () => {

            if (_onClick)
                _onClick(btn);
        });

        this.footer.appendChild(btn);

        return btn;
    }

    hide(_value) {

        if (this._done)
            return;

        this._done = true;

        // garante que o modal não re-apareça (transição presa por CSS/headless)
        this._bs._showElement = () => {};

        document.body.classList.remove('modal-open');
        document.body.style.overflow = '';
        document.querySelectorAll('.modal-backdrop').forEach(b => b.remove());
        this.modal.remove();

        this._resolve(_value);
    }
}

// substitui o alert() nativo — resolve true
class AlertModal extends Modal {

    constructor(_message, _title = "Aviso") {

        super({
            title: _title,
            modalClass: "alert-modal"
        });

        const msg =
            document.createElement("p");

        msg.className = "mb-0";
        msg.textContent = _message;

        this.body.appendChild(msg);

        this.addButton("OK", "btn btn-primary", () => this.hide(true));
    }
}

// substitui o confirm() nativo — resolve true (OK) ou false (Cancelar)
class ConfirmModal extends Modal {

    constructor(_message, _title = "Confirmação") {

        super({
            title: _title,
            modalClass: "confirm-modal"
        });

        const msg =
            document.createElement("p");

        msg.className = "mb-0";
        msg.textContent = _message;

        this.body.appendChild(msg);

        this.addButton("Cancelar", "btn btn-secondary", () => this.hide(false));
        this.addButton("OK", "btn btn-primary", () => this.hide(true));
    }
}

// substitui o prompt() nativo — resolve a string digitada ou null
class PromptModal extends Modal {

    constructor(_label, _default = "", _title = "Entrada") {

        super({
            title: _title,
            modalClass: "prompt-modal"
        });

        const label =
            document.createElement("label");

        label.className = "form-label mb-1";
        label.textContent = _label;

        this.input =
            document.createElement("input");

        this.input.type = "text";
        this.input.className = "form-control";
        this.input.value = _default;

        this.body.appendChild(label);
        this.body.appendChild(this.input);

        this.addButton("Cancelar", "btn btn-secondary", () => this.hide(null));
        this.addButton("OK", "btn btn-primary", () => this.hide(this.input.value));

        this.input.addEventListener("keydown", _evt => {

            if (_evt.key === "Enter")
                this.hide(this.input.value);
        });
    }
}

// modal de seleção de encoding (salvar/baixar/abrir) — resolve o encoding ou null
class CodePageModal extends Modal {

    constructor(_title, _default) {

        super({
            title: _title,
            modalClass: "code-page-modal"
        });

        this.select =
            document.createElement("select");

        this.select.className =
            "form-select";

        kCodePageSupported.forEach(cp => {

            const option =
                document.createElement("option");

            option.value = cp;
            option.textContent = cp + (kCodePageLocale[cp] ? ' — ' + kCodePageLocale[cp] : '');

            if (cp === _default)
                option.selected = true;

            this.select.appendChild(option);
        });

        this.body.appendChild(this.select);

        makeChoices(this.select);

        this.addButton("Cancelar", "btn btn-secondary", () => this.hide(null));
        this.addButton("OK", "btn btn-primary", () => this.hide(this.select.value));
    }
}

// conversor de região: select das versões suportadas; resolve a região
// escolhida ou null ao cancelar/fechar
class ConverterRegiaoModal extends Modal {

    constructor(_atual) {

        super({
            title: "Converter região",
            modalClass: "code-page-modal"
        });

        this.select =
            document.createElement("select");

        this.select.className =
            "form-select";

        kVersoesSuportadas.forEach(v => {

            const option =
                document.createElement("option");

            option.value =
                v.regiao;

            option.textContent =
                v.label + (v.regiao === _atual ? ' — atual' : '');

            if (v.regiao === _atual)
                option.selected = true;

            this.select.appendChild(option);
        });

        // pré-seleciona a outra região (conversão típica)
        const outra =
            kVersoesSuportadas.find(v => v.regiao !== _atual);

        if (outra) {

            this.select.value =
                outra.regiao;
        }

        this.body.appendChild(this.select);

        makeChoices(this.select);

        this.addButton("Cancelar", "btn btn-secondary", () => this.hide(null));
        this.addButton("Converter", "btn btn-primary", () => this.hide(this.select.value));
    }
}

// seletor manual de região ao abrir um pacote: US 852 e KR 839 são
// quase idênticos, então a detecção automática não os distingue e o
// usuário confirma qual região o pacote representa
class RegionSelectorModal extends Modal {

    constructor(_default, _regions) {

        super({
            title: "Região do pacote",
            modalClass: "code-page-modal"
        });

        const hint =
            document.createElement("p");

        hint.className =
            "modal-hint";

        // com dedução, a mensagem admite a incerteza mas traz a opção
        // detectada pré-selecionada para o usuário confirmar
        hint.textContent =
            _default
                ? "Não conseguimos detectar a região com certeza pelo conteúdo do arquivo (US e KR são quase idênticos). Selecionamos abaixo a opção deduzida pelo tamanho do Mascot.iff — confirme se está correta:"
                : "Não foi possível detectar a região pelo conteúdo do arquivo. Selecione a região correta:";

        this.body.appendChild(hint);

        this.select =
            document.createElement("select");

        this.select.className =
            "form-select";

        const regs =
            _regions || kVersoesSuportadas.map(v => v.regiao);

        kVersoesSuportadas.forEach(v => {

            if (!regs.includes(v.regiao))
                return;

            const option =
                document.createElement("option");

            option.value =
                v.regiao;

            option.textContent =
                v.label + (v.regiao === _default ? ' — detectada' : '');

            if (v.regiao === _default)
                option.selected = true;

            this.select.appendChild(option);
        });

        this.body.appendChild(this.select);

        makeChoices(this.select);

        this.addButton("Cancelar", "btn btn-secondary", () => this.hide(null));
        this.addButton("Confirmar", "btn btn-primary", () => this.hide(this.select.value));
    }
}

// modal com a imagem do campo asset em tamanho maior (preview pequeno é clicável)
class ResourceImageModal extends Modal {

    constructor(_src, _title) {

        super({
            title: _title || "Imagem",
            modalClass: "resource-img-modal",
            dialogClass: "modal-lg"
        });

        this.body.className =
            "modal-body resource-img-body";

        const img =
            document.createElement("img");

        img.src = _src;
        img.className = "resource-img-full";
        img.alt = "";

        this.body.appendChild(img);
    }
}

// modal com a lista de erros de encoding dos iffs carregados
class EncodingErrorsModal extends Modal {

    constructor(_iffs) {

        super({
            title: "Erros de encoding detectados",
            modalClass: "encoding-warning-modal"
        });

        _iffs.forEach(iff => {

            const iffDiv = document.createElement('div');
            iffDiv.className = 'encoding-warning-iff';

            const chevron = document.createElement('span');
            chevron.className = 'encoding-warning-chevron';
            chevron.textContent = '▾';

            // lista grande (>10 erros) começa recolhida; chevron fechado
            if (_iffs.length > 1 && iff.__encodingErrors.length > 10)
                chevron.textContent = '▸';

            const nameSpan = document.createElement('span');
            nameSpan.innerHTML = `<img src="resources/warning.svg" class="encoding-warning-icon" alt=""> ${iff.name}`;

            iffDiv.appendChild(nameSpan);
            iffDiv.appendChild(chevron);
            this.body.appendChild(iffDiv);

            const list = document.createElement('ul');
            list.className = 'encoding-warning-list';

            // lista grande (>10 erros) começa recolhida para não poluir
            if (_iffs.length > 1 && iff.__encodingErrors.length > 10)
                list.classList.add('encoding-warning-collapsed');

            iff.__encodingErrors.forEach(entry => {

                const li = document.createElement('li');

                const name = entry.item.getIdentifyName
                    ? stripEncodingMarker(entry.item.getIdentifyName())
                    : iff.elements.indexOf(entry.item);

                const fields = entry.errors
                    .map(e => `${e.field} (${e.encoding})`)
                    .join(', ');

                li.textContent = `${name}: ${fields}`;
                list.appendChild(li);
            });

            this.body.appendChild(list);

            iffDiv.addEventListener('click', () => {
                list.classList.toggle('encoding-warning-collapsed');
                chevron.textContent = list.classList.contains('encoding-warning-collapsed') ? '▸' : '▾';
            });
        });

        this.addButton("OK", "btn btn-primary", () => this.hide(true));
    }
}

// modal de criação de item novo (bits/fields/relations do typeid + num);
// em modo edição (_opts.isEdit) edita o typeid de um item existente
// (_opts.item): mesmos controles, exclui o próprio item dos checks de
// unicidade, não mexe em fields e aplica em vez de criar
class NewItemModal extends Modal {

    constructor(_iff, _typeid, _numInfo, _opts = null) {

        const opts = _opts || {};

        super({
            title: (opts.isEdit ? "Editar typeid — " : "Novo item — ") + _iff.name,
            modalClass: "new-item-modal"
        });

        const model = kNewItemModel[_iff.name];

        const isOther =
            opts.item
                ? _el => _el !== opts.item
                : () => true;

        const _typeValue = (typeof _typeid === 'object' && _typeid !== null && 'value' in _typeid) ? _typeid : { value: _typeid || 0 };

        const values = { bits: {}, fields: {}, relations: {} };

        const currentBits = () => {

            const bits = {};

            for (const [bit, sel] of Object.entries(values.bits))
                bits[bit] = sel.__is_checkbox ? (sel.checked ? (sel.__checkboxOn || 1) : 0) : Number(sel.value);

            for (const [path, { selects, spec }] of Object.entries(values.relations)) {

                if (selects.length > 1)
                    continue;

                const value = Number(selects[0].value);

                if (typeof spec === 'object' && spec !== null) {

                    if (spec.encode) {

                        let opt = null;

                        for (const g of selects[0].children)
                            for (const o of g.children)
                                if (String(o.value) === String(selects[0].value)) {
                                    opt = o;
                                    break;
                                }

                        Object.assign(bits, spec.encode(value, opt && opt.__element, bits));
                    } else if (spec.bit)
                        bits[spec.bit] = value;
                }
            }

            return bits;
        };

        const Ctor = _iff.element_constructor;

        const numOf = _el => {
            const value = _el && 'typeid' in _el ? _el.typeid.value : (_el && _el.value != null ? _el.value : 0);

            if (_numInfo && _numInfo.is_bitfield) {

                const bf = Ctor.createTypeidbit(value);
                return bf[_numInfo.group] || 0;
            }

            return value & 0x3FFFFFF;
        };

        const numInput = _numInfo
            ? (() => {

                let formRow = document.createElement("div");
                formRow.className = "mb-3";

                let label = document.createElement("label");
                label.className = "form-label";
                label.textContent = (model && model.numLabel) || "num";

                let inputRow = document.createElement("div");
                inputRow.className = "d-flex align-items-stretch gap-2";

                let mode = 'dec';

                const fmtInput = _v => {
                    if (mode === 'hex')
                        return '0x' + Number(_v).toString(16);
                    return String(_v);
                };

                const parseInput = _raw => {
                    _raw = String(_raw == null ? input.value : _raw).trim();
                    if (_raw === '')
                        return 0;
                    if (mode === 'hex')
                        return parseInt(_raw.replace(/^0x/i, ''), 16) || 0;
                    return Number(_raw) || 0;
                };

                let input = document.createElement("input");
                input.type = "text";
                input.className = "form-control num-new-item flex-grow-1";
                input.value = fmtInput(numOf(_typeValue));
                input.min = (model && typeof model.minNum === 'number') ? model.minNum : 0;

                let modeWrap = document.createElement("div");
                modeWrap.className = "num-input-wrap";
                modeWrap.style.marginBottom = "0";

                const modeTgl = buildToggleSwitch({
                    name: 'hex',
                    posText: 'hex',
                    negText: 'dec',
                    stateText: true,
                    checked: mode === 'hex',
                    inputClass: 'num-mode',
                    onChange: (_evt, _inp) => {
                        const oldMode = mode;
                        const val = (oldMode === 'hex')
                            ? parseInt(input.value.replace(/^0x/i, ''), 16) || 0
                            : Number(input.value) || 0;
                        mode = _inp.checked ? 'hex' : 'dec';
                        input.value = fmtInput(val);
                    }
                });

                modeWrap.appendChild(modeTgl.root);
                modeWrap.appendChild(input);

                let btn = document.createElement("button");
                btn.type = "button";
                btn.className = "btn btn-outline-primary btn-sm";
                btn.textContent = "Gerar num";

                let msg = document.createElement("small");
                msg.className = "text-muted";
                msg.style.display = "block";
                msg.textContent = "";

                formRow.appendChild(label);
                inputRow.appendChild(modeWrap);
                inputRow.appendChild(btn);
                formRow.appendChild(inputRow);
                formRow.appendChild(msg);
                this.body.appendChild(formRow);

                const candidate = _numVal => {
                    return buildNewTypeId(_iff, _typeValue, {
                        bits: currentBits(),
                        num: _numVal == null ? parseInput() : _numVal
                    }, _numInfo);
                };

                const genFree = () => {
                    if (!_iff.elements)
                        return null;

                    // hook do modelo (ex.: CadieMagicBox — num = posição no
                    // fim do grupo do setor; lê o valor atual dos fields)
                    if (model && typeof model.genNum === 'function') {

                        const fieldValue = _path => {
                            const sels = values.fields[_path];
                            if (sels && sels.length > 0)
                                return Number(sels[0].value);
                            if (opts.item) {
                                const targets = getItemFieldByPath(opts.item, _path);
                                return targets.length > 0 ? Number(targets[0].value) : undefined;
                            }
                            return undefined;
                        };

                        const v = model.genNum(_iff, fieldValue, isOther);

                        if (v != null)
                            return v;
                    }

                    const seen = new Set();

                    for (const el of _iff.elements)
                        if (el.typeid && el.typeid.value != null && isOther(el))
                            seen.add(el.typeid.value);

                    // primeiro num livre (>= 0) cujo typeid não colide
                    let next = 0;

                    while (seen.has(candidate(next).value))
                        next++;

                    return next;
                };

                // num renumerado no rebuild (ex.: CadieMagicBox): a unicidade
                // é garantida pelo rebuild, dispensa o check
                const renumera = !!model && typeof model.genNum === 'function' && !opts.isEdit;

                const refresh = () => {
                    if (!_iff.elements)
                        return;

                    const dar = candidate().value;
                    const exists = !renumera && _iff.elements.some(el => el.typeid && el.typeid.value == dar && isOther(el));

                    msg.textContent = exists ? "já existe" : "único";
                    msg.classList.toggle("text-danger", exists);
                    msg.classList.toggle("text-success", !exists);
                };

                const generate = () => {
                    const free = genFree();

                    if (free != null) {
                        input.value = fmtInput(free);
                        refresh();
                    }
                };

                btn.addEventListener("click", generate);

                input.addEventListener("input", refresh);

                // já nasce com um num livre (sem clicar em "Gerar num")
                const initial = numOf(_typeValue);

                // em EDIÇÃO o num atual é sempre preservado (nem 0 é
                // sobrescrito); só no criar o init regenera para o livre
                if (!opts.isEdit && (!initial || _iff.elements.some(el => el.typeid && el.typeid.value == candidate(initial).value && isOther(el)))) {
                    const free = genFree();

                    if (free != null)
                        input.value = fmtInput(free);
                }

                refresh();

                return { input, refresh, generate, parse: parseInput };
            })()
            : null;

        const addSelect = (_label, _enum, _selected = 0, _extraOpts = null, _opts = {}) => {

            let formRow =
                document.createElement("div");

            formRow.className =
                "mb-3";

            let label =
                document.createElement("label");

            label.className =
                "form-label";

            label.textContent =
                _label;

            let select =
                document.createElement("select");

            select.className =
                "form-select";

            const hasZero = Object.values(_enum).includes(0);
            const hasDash = Object.keys(_enum).includes('-');

            if (!hasZero && !hasDash) {

                let option =
                    document.createElement("option");

                option.value = 0;
                option.textContent = "0 — Nenhum";

                if (_selected == 0)
                    option.selected = true;

                select.appendChild(option);
            }

            for (const [name, value] of Object.entries(_enum)) {

                let option =
                    document.createElement("option");

                option.value = value;
                option.textContent = name === '-' ? '-' : (value >= 0 ? value + ' — ' : '') + name;

                if (value === _selected)
                    option.selected = true;

                select.appendChild(option);
            }

            // opções extras do chamador: [value, text, selected] (ex.:
            // __allowExtra). Anexadas antes do makeChoices (rebuild pós-init
            // no Choices v11 não funciona)
            if (_extraOpts) {

                for (const [value, text, sel] of _extraOpts) {

                    let option =
                        document.createElement("option");

                    option.value = value;
                    option.textContent = text;

                    if (sel) {
                        option.selected = true;
                        select.appendChild(option);
                        select.value = String(value);
                    } else
                        select.appendChild(option);
                }
            }

            formRow.appendChild(label);
            formRow.appendChild(select);
            this.body.appendChild(formRow);

            // sincroniza o value (o browser resolve via option.selected, mas
            // o stub marca selected antes do appendChild e não propaga — sem
            // isso o OK leria Number('') = 0 no edit)
            if (Object.values(_enum).includes(Number(_selected)))
                select.value = String(_selected);

            makeChoices(select, { searchEnabled: !!_opts.searchEnabled });

            return select;
        };

        const addCheckbox = (_label, _checked = false) => {

            let formRow =
                document.createElement("div");

            formRow.className =
                "mb-3 form-check";

            const tgl =
                buildToggleSwitch({
                    name: _label,
                    checked: _checked,
                    inputClass: "form-check-input",
                    onChange: () => { }
                });

            tgl.input.__is_checkbox = true;

            formRow.appendChild(tgl.root);
            this.body.appendChild(formRow);

            return tgl.input;
        };

        // multi select de tags com Choices.js: as tags são os valores individuais do
        // enum (ex.: char_sub_type_num — 0 REPLACE, 1 SUB, 2 DEFAULT, 4 APPEND,
        // 8 SUB_REPLACE); o valor final é o OR das tags. Ao selecionar uma opção:
        //   - "única" (REPLACE = 0, exclusiva) → não sobra tag para selecionar
        //   - parte de um combo (_enum.combos, ex.: SUB↔DEFAULT, APPEND↔
        //     SUB_REPLACE) → o dropdown mostra só as tags que "combam" até fechar
        //     o combo (combo completo → não mostra mais tag)
        const addChoicesMulti = (_label, _enum, _selected = 0) => {

            let formRow =
                document.createElement("div");

            formRow.className =
                "mb-3 choices-select-wrap";

            let label =
                document.createElement("label");

            label.className =
                "form-label";

            label.textContent =
                _label;

            let select =
                document.createElement("select");

            select.multiple = true;
            select.className =
                "form-select sub-type-multi";

            const entries =
                Object.entries(_enum)
                    .filter(([, v]) => typeof v === 'number')
                    .sort((a, b) => a[1] - b[1]);

            const nameOf =
                Object.fromEntries(entries.map(([n, v]) => [v, n]));

            // cada valor single → parceiros de combo (ex.: 1 → [2], 2 → [1])
            const partners = {};

            for (const combo of (_enum.combos || []))
                for (const v of combo)
                    partners[v] =
                        combo.filter(x => x !== v);

            const labelOf =
                _v => _v + ' — ' + nameOf[_v];

            // estado atual (valores selecionados)
            let current =
                new Set();

            if (_selected & 1) current.add(1);
            if (_selected & 2) current.add(2);
            if (_selected & 4) current.add(4);
            if (_selected & 8) current.add(8);
            if (_selected === 0) current.add(0);

            // opções que ficam disponíveis no dropdown segundo a regra de combos
            const buildAvailable = () => {

                // REPLACE é única/exclusiva: nada mais para selecionar
                if (current.has(0))
                    return [];

                // sem tag selecionada: todas as opções
                if (current.size === 0)
                    return entries.map(([, v]) => v);

                // parte de um combo: mostra só as tags que combam
                const need =
                    new Set();

                for (const v of current)
                    for (const p of (partners[v] || []))
                        if (!current.has(p))
                            need.add(p);

                return [...need];
            };

            // o select precisa estar no DOM quando o Choices inicia (usa parentNode)
            formRow.appendChild(label);
            formRow.appendChild(select);
            this.body.appendChild(formRow);

            const choices =
                typeof Choices !== 'undefined'
                    ? new Choices(select, {
                        allowHTML: false,
                        removeItemButton: true,
                        searchEnabled: false,
                        shouldSort: false,
                        choices: entries.map(([n, v]) => ({
                            value: String(v),
                            label: v + ' — ' + n,
                            selected: current.has(v),
                        })),
                    })
                    : null;

            const refresh = () => {

                if (!choices)
                    return;

                const available =
                    buildAvailable();

                choices.clearChoices();
                choices.setChoices(available.map(v => ({
                    value: String(v),
                    label: labelOf(v),
                    selected: false,
                })));
            };

            const emitChange = () => {

                select.dispatchEvent(
                    typeof Event !== 'undefined'
                        ? new Event('change', { bubbles: true })
                        : { type: 'change' });
            };

            if (choices) {

                select.addEventListener('addItem', _evt => {

                    const v =
                        Number(_evt.detail && _evt.detail.value);

                    if (v === 0) {

                        // REPLACE é única: remove as demais tags
                        for (const x of [...current])
                            if (x !== 0)
                                choices.removeActiveItemsByValue(String(x));

                        current =
                            new Set([0]);
                    } else {

                        current.add(v);

                        if (current.has(0)) {

                            choices.removeActiveItemsByValue('0');
                            current.delete(0);
                        }
                    }

                    refresh();
                    emitChange();
                });

                select.addEventListener('removeItem', _evt => {

                    current.delete(Number(_evt.detail && _evt.detail.value));

                    refresh();
                    emitChange();
                });
            }

            // alinha o dropdown inicial à regra de combos (ex.: REPLACE única,
            // combo já fechado → nada selecionável)
            refresh();

            return {
                get value() {

                    let v = 0;

                    for (const x of current)
                        v |= x;

                    return v;
                },
                addEventListener: (_type, _fn) => select.addEventListener(_type, _fn),
            };
        };

        const addRelationSelect = (_label, _spec, _selected = null) => {

            let formRow =
                document.createElement("div");

            formRow.className =
                "mb-3";

            let label =
                document.createElement("label");

            label.className =
                "form-label";

            label.textContent =
                _label;

            let select =
                document.createElement("select");

            select.className =
                "form-select";

            const byNum =
                typeof _spec === 'object' && _spec !== null && _spec.by === 'num';

            // resolve custom do valor gravado por item (ex.:
            // GrandPrixSpecialHole — grava o typeid_link do GP, `& ~0xFF`,
            // e não o typeid cheio)
            const resolveVal =
                typeof _spec === 'object' && _spec !== null && typeof _spec.resolve === 'function'
                    ? _spec.resolve : null;

            const relatedIffs =
                _spec === null
                    ? iffs
                    : iffs.filter(i => {
                        // a lista de iffs pode ser DINÂMICA — função avaliada na
                        // abertura do modal (ex.: Desc.iff lista os iffs com
                        // flag_ligacao == 0 no momento)
                        const names = typeof _spec === 'object' ? _spec.iff : _spec;
                        const resolved = typeof names === 'function' ? names() : names;
                        return Array.isArray(resolved) ? resolved.includes(i.name) : i.name == resolved;
                    });

            for (const related of relatedIffs) {

                if (!related.element_constructor || related.elements.length == 0)
                    continue;

                let group =
                    document.createElement("optgroup");

                group.label =
                    related.name;

                for (const el of related.elements) {

                    if (!el.typeid)
                        continue;

                    if (typeof _spec === 'object' && _spec !== null && _spec.filter && !_spec.filter(el))
                        continue;

                    const value =
                        byNum ? getTypeidNum(el)
                            : (resolveVal ? resolveVal(el) : el.typeid.value);

                    let option =
                        document.createElement("option");

                    option.value = value;
                    option.__element = el;
                    option.textContent =
                        byNum
                            ? value + ' — ' + (el.name ? stripEncodingMarker(el.name.value) : el.getIdentifyName ? stripEncodingMarker(el.getIdentifyName()) : value.toString(16))
                            : (el.getIdentifyName ? stripEncodingMarker(el.getIdentifyName()) : value.toString(16));

                    group.appendChild(option);
                }

                if (group.childNodes.length > 0)
                    select.appendChild(group);
            }

            if (select.childNodes.length == 0) {

                let option =
                    document.createElement("option");

                option.value = 0;
                option.textContent =
                    relatedIffs.length > 0
                        ? "IFF relacionado vazio"
                        : "nenhum IFF carregado";

                select.appendChild(option);
            }

            // em modo edição (_selected) marca a opção atual do item
            if (_selected != null)

                for (const o of select.children)
                    for (const opt of o.children)
                        if (String(opt.value) === String(_selected))
                            opt.selected = true;

            formRow.appendChild(label);
            formRow.appendChild(select);
            this.body.appendChild(formRow);

            // selects de relation listam itens de iffs (milhares de opções —
            // ex.: os 13 iffs do SpecialPrizeItem) — com campo de busca do
            // Choices embutido no dropdown
            makeChoices(select, { searchEnabled: true });

            return select;
        };

        if (model) {

            // regras do modelo ao mudar qualquer bit (checkbox ou select):
            // lê os bits atuais, aplica o onBits do modelo (força valores em
            // outros bits — ex.: Item.iff — desmarcar item_passive força o
            // item_type ao NO_LIMIT_TIME; escolher um item_type com período
            // marca o item_passive) e regenera o num do input (a mudança de
            // bits pode mudar o typeid, então o num livre pode mudar)
            const applyRulesAndGenerate = _src => {

                if (!model.onBits)
                    return;

                const bits = {};

                for (const [b, el] of Object.entries(values.bits))
                    bits[b] = el.__is_checkbox ? (el.checked ? (el.__checkboxOn || 1) : 0) : Number(el.value);

                model.onBits(bits, (_bit, _value) => {

                    const el = values.bits[_bit];

                    if (!el)
                        return;

                    if (el.__is_checkbox) {
                        el.checked = _value === 1;
                        bits[_bit] = _value;
                    } else {
                        // sincroniza nativo + widget Choices (o widget esconde o
                        // select, então el.value sozinho não mostra a troca)
                        setSelectValue(el, _value);
                        bits[_bit] = _value;
                    }
                }, _src);

                if (numInput)
                    numInput.generate();

                applyLocks();
            };

            // lockBits do modelo (ex.: Item.iff — item_type DESABILITADO quando
            // o item_passive está desmarcado, pois não-passivo só aceita
            // NO_LIMIT_TIME; habilita quando marcado com todas as opções)
            const applyLocks = () => {

                if (!model || !model.lockBits)
                    return;

                for (const lock of model.lockBits) {

                    const sel = values.bits[lock.bit];
                    const src = values.bits[lock.by];

                    if (!sel || !src)
                        continue;

                    const srcVal =
                        src.__is_checkbox ? (src.checked ? (src.__checkboxOn || 1) : 0) : Number(src.value);

                    setSelectDisabled(sel, srcVal !== lock.value);
                }
            };

            // checkboxes (item_passive) ANTES dos selects de bits (item_type)
            // no layout — o item_type depende do item_passive no sync, então o
            // checkbox aparece acima dele
            if (model.typeid_checkboxes) {

                // cada entrada é `[bit, onValue]` (onValue = valor gravado no bit
                // ao marcar; default 1) — ex.: gp_event do GrandPrixData grava 3
                const checkboxEntries =
                    model.typeid_checkboxes.map(e => Array.isArray(e) ? e : [e, 1]);

                for (const [bit, onValue] of checkboxEntries) {

                    const checkbox =
                        addCheckbox(bit, _typeid[bit] !== 0);

                    checkbox.__checkboxOn = onValue;

                    values.bits[bit] = checkbox;

                    // modelo cujo num depende dos bits (ex.: HairStyle — marcar/
                    // desmarcar o is_new muda o typeid candidato e o num livre
                    // pode mudar); no edit só refresh para não sobrescrever
                    if (numInput)
                        checkbox.addEventListener('change',
                            model.regenNumOnBits && !opts.isEdit ? numInput.generate : numInput.refresh);

                    checkbox.addEventListener('change', () => applyRulesAndGenerate(bit));
                }
            }

            if (model.typeid_bits) {

                for (const [bit, spec] of Object.entries(model.typeid_bits)) {

                    const isMulti =
                        typeof spec === 'object' && spec !== null && !!spec.multi;

                    const enumClass =
                        isMulti ? spec.multi : spec;

                    let selectedVal = _typeid[bit] || 0;

                    if (bit === 'cad_item_type_num') {
                        if (selectedVal !== CaddieItemType.ESPECIAL && selectedVal !== CaddieItemType.UPGRADE)
                            selectedVal = -1;
                    }

                    // enum __allowExtra (ex.: MatchMatchType): o select sempre
                    // tem as opções conhecidas + "__extra" (vira input p/ valor
                    // fora da lista); no edit com valor fora, também traz a
                    // opção crua do valor atual pré-selecionada
                    const allowExtra =
                        !!enumClass && enumClass.__allowExtra === true;

                    const extraOpts =
                        allowExtra && !isMulti
                            ? (() => {
                                const arr = [];
                                if (opts.isEdit && !Object.values(enumClass).includes(Number(selectedVal)))
                                    arr.push([selectedVal, selectedVal + ' — (fora da lista)', true]);
                                arr.push(['__extra', 'Outro (valor fora da lista)…', false]);
                                return arr;
                            })()
                            : null;

                    let select;

                    select =
                        isMulti
                            ? addChoicesMulti(bit, enumClass, selectedVal)
                            : addSelect(bit, enumClass, selectedVal, extraOpts, { searchEnabled: true });

                    // escolher "__extra" troca o select por um input no mesmo row
                    if (allowExtra && !isMulti) {

                        select.addEventListener('change', () => {

                            if (select.value !== '__extra')
                                return;

                            destroyChoices(select);

                            const wrap = select.parentElement || select.parent;

                            if (!wrap)
                                return;

                            const input =
                                document.createElement("input");

                            input.type = 'text';
                            input.className = 'form-control';
                            input.placeholder = 'Valor fora da lista';
                            input.value = '';

                            wrap.replaceChild(input, select);

                            values.bits[bit] = input;

                            if (numInput)
                                input.addEventListener('change', numInput.refresh);

                            input.addEventListener('change', () => applyRulesAndGenerate(bit));

                            input.focus();
                        });
                    }

                    values.bits[bit] = select;

                    // num dependente dos bits (ex.: Enchant — trocar stats
                    // regenera o up_value; no edit só refresh)
                    if (numInput)
                        select.addEventListener('change',
                            model.regenNumOnBits && !opts.isEdit ? numInput.generate : numInput.refresh);

                    select.addEventListener('change', () => applyRulesAndGenerate(bit));
                }
            }

            // valor atual de relation no modo edição (pré-seleção do select):
            // typeid → typeid inteiro; bit → bit lido; encode → hook
            // decode(_item) do modelo (ex.: CaddieItem devolve id = base+type)
            const initialRelationValue = (_path, _spec) => {

                if (!opts.isEdit || !opts.item)
                    return null;

                if (_path === 'typeid')
                    return typeof _spec === 'object' && _spec !== null && typeof _spec.resolve === 'function'
                        ? _spec.resolve(opts.item)
                        : opts.item.typeid.value;

                if (typeof _spec !== 'object' || _spec === null)
                    return null;

                if (_spec.bit)
                    return _typeid[_spec.bit];

                if (_spec.decode)
                    return _spec.decode(opts.item);

                // relation que grava num campo do item (sem bit/encode — ex.:
                // character do HairStyle): pré-seleciona o valor atual do item
                if (opts.item) {

                    const targets =
                        getItemFieldByPath(opts.item, _path);

                    return targets.length > 0 ? Number(targets[0].value) : null;
                }

                return null;
            };

            // aplica os locks após montar os controles de bits (ex.: Item.iff —
            // item_passive desmarcado começa com o item_type desabilitado)
            applyLocks();

            // em modo edição os fields não participam (só o typeid), exceto
            // quando o modelo pede (fieldsInEdit — ex.: LevelUpPrizeItem, cujo
            // typeid É o level: o modal mostra o select do level)
            if (model.fields && (!opts.isEdit || model.fieldsInEdit)) {

                for (const [path, enumClass] of Object.entries(model.fields)) {

                    const targets =
                        getItemFieldByPath(new _iff.element_constructor(), path);

                    values.fields[path] = [];

                    // enum __allowExtra (ex.: CardVolume 5..100): "__extra"
                    // vira input no mesmo row (anexado antes do makeChoices —
                    // não reconstruir o widget depois)
                    const allowExtra =
                        enumClass.__allowExtra === true;

                    const extraOpts =
                        allowExtra
                            ? [['__extra', 'Outro (valor fora da lista)…', false]]
                            : null;

                    targets.forEach((target, i) => {

                        // em modo edição o select pré-seleciona o valor atual do item
                        const curVal =
                            opts.isEdit && opts.item
                                ? Number((getItemFieldByPath(opts.item, path)[i] || {}).value ?? 0)
                                : 0;

                        const select =
                            addSelect(path + (targets.length > 1 ? ' [' + i + ']' : ''), enumClass, curVal, extraOpts);

                        values.fields[path].push(select);

                        // escolher o __extra troca o select por um input p/
                        // digitar o valor fora do enum (lido no OK)
                        if (allowExtra) {

                            select.addEventListener('change', () => {

                                if (select.value !== '__extra')
                                    return;

                                destroyChoices(select);

                                const wrap =
                                    select.parentElement || select.parent;

                                if (!wrap)
                                    return;

                                const input =
                                    document.createElement("input");

                                input.type = 'text';
                                input.className = 'form-control';
                                input.placeholder = 'Valor fora da lista';
                                input.value = '';

                                wrap.replaceChild(input, select);

                                values.fields[path][i] = input;

                                input.focus();
                            });
                        }

                        // num dependente dos fields (ex.: CadieMagicBox — o setor
                        // define a posição do seq); trocar o campo regenera o num
                        if (numInput && model && typeof model.genNum === 'function' && !opts.isEdit)
                            select.addEventListener('change', numInput.generate);
                    });
                }
            }

            if (model.relations) {

                for (const [path, spec] of Object.entries(model.relations)) {

                    // só monta relation usada na criação do typeid: grava em
                    // bits (bit/encode), no próprio typeid, ou lista de iffs.
                    // `null` = sem relation no modal (typeid com null não monta
                    // o select de TODOS os typeids)
                    if (path === 'typeid') {

                        if (typeof spec !== 'string'
                            && !(typeof spec === 'object' && spec !== null))
                            continue;
                    }
                    else if (typeof spec !== 'object' || spec === null
                        || (!(spec.bit || spec.encode) && spec.by !== 'num' && !spec.iff))
                        continue;

                    const byNum =
                        typeof spec === 'object' && spec !== null && spec.by === 'num';

                    const label =
                        (typeof spec === 'object' && spec !== null && spec.label ? spec.label : path)
                            + (byNum ? ' (id)' : '');

                    let targets =
                        getItemFieldByPath(new _iff.element_constructor(), path);

                    if (targets.length === 0)
                        targets = [null];

                    const selects = [];

                    targets.forEach((target, i) => {

selects.push(
                        addRelationSelect(
                            label + (targets.length > 1 ? ' [' + i + ']' : ''),
                            spec,
                            initialRelationValue(path, spec)));
                    });

                    values.relations[path] = { selects, spec };

                    for (const sel of selects) {
                        // a escolha de uma relation muda o typeid candidato →
                        // regenera o num livre (create); no edit só reavalia
                        // o "único/já existe" (não sobrescreve o num atual)
                        if (numInput)
                            sel.addEventListener('change', opts.isEdit ? numInput.refresh : numInput.generate);

                        sel.addEventListener('change', () => applyRulesAndGenerate(path));
                    }
                }
            }
        }

        this.addButton("Cancelar", "btn btn-secondary", () => this.hide(null));

        this.addButton(opts.isEdit ? "Aplicar" : "Criar", "btn btn-primary", () => {

            const result = { bits: {}, fields: {} };

            for (const [bit, select] of Object.entries(values.bits))
                result.bits[bit] = select.__is_checkbox ? (select.checked ? (select.__checkboxOn || 1) : 0) : Number(select.value);

            // reaplica onBits sobre os bits escolhidos (ex.: Item.iff —
            // não-passivo só aceita NO_LIMIT_TIME); regras iterativas
            // convergem pois _setBit atualiza o próprio result.bits
            if (model && model.onBits)
                model.onBits(result.bits, (bit, value) => { result.bits[bit] = value; });

            for (const [path, selects] of Object.entries(values.fields)) {

                if (Array.isArray(selects))
                    result.fields[path] = selects.map(s => Number(s.value));
                else
                    result.fields[path] = Number(selects.value);
            }

            if (numInput) {
                result.num = numInput.parse();

                // modelo com num mínimo (ex.: CadieMagicBoxRandom — o id 0
                // NUNCA pode ser adicionado/editado: 0 no box_random_id do
                // CadieMagicBox significa "sem box_random_id")
                if (model && typeof model.minNum === 'number' && result.num < model.minNum) {

                    numInput.refresh();

                    new AlertModal('O num não pode ser ' + result.num
                        + ' — mínimo ' + model.minNum
                        + ' (o 0 significa "sem box_random_id").').show();

                    return;
                }
            }

            for (const [path, { selects, spec }] of Object.entries(values.relations)) {

                if (selects.length > 1) {

                    result.fields[path] =
                        selects.map(s => Number(s.value));

                    continue;
                }

                const value = Number(selects[0].value);

                if (typeof spec === 'object' && spec !== null) {

                    if (spec.encode) {

                        let opt = null;

                        for (const g of selects[0].children)
                            for (const o of g.children)
                                if (String(o.value) === String(selects[0].value)) {
                                    opt = o;
                                    break;
                                }

                        Object.assign(result.bits, spec.encode(value, opt && opt.__element, result.bits));
                    }
                    else if (spec.bit)
                        result.bits[spec.bit] = value;
                    else
                        result.fields[path] = value;
                } else
                    result.fields[path] = value;
            }

            // bloqueia typeid duplicado quando o tipo exige unicidade; o
            // candidato é o typeid da relation quando não há num/bits (ex.:
            // CutinInfomation/FurnitureAbility — o typeid É o item escolhido)
            const candidato = (() => {

                // typeid pode vir de um field (ex.: LevelUpPrizeItem — o
                // typeid É o level, via typeidFromField no modelo)
                const tidField =
                    model && model.typeidFromField;

                if (result.fields && (result.fields.typeid != null
                        || (tidField && result.fields[tidField] != null)))
                    return { value: Number(result.fields.typeid ?? (tidField ? result.fields[tidField] : undefined)) };

                if (numInput)
                    return buildNewTypeId(_iff, _typeValue, { bits: result.bits, num: result.num }, _numInfo);

                return null;
            })();

            if (candidato) {

                const tipoUnico =
                    (() => {
                        try {
                            const probe = new Ctor();
                            return !probe.isTypeidUnique || probe.isTypeidUnique() !== false;
                        } catch (_) {
                            return true;
                        }
                    })();

                const existe = tipoUnico
                    && !(model && typeof model.genNum === 'function' && !opts.isEdit)
                    && _iff.elements.some(el => el.typeid && el.typeid.value == candidato.value && isOther(el));

                if (existe) {

                    if (numInput)
                        numInput.refresh();

                    new AlertModal(numInput
                        ? 'Já existe um item com esse typeid (' + candidato.value + '). Escolha um num único ou use "Gerar num".'
                        : 'Já existe um item com esse typeid (' + candidato.value + '). Escolha outro.').show();
                    return;
                }
            }

            this.hide(result);
        });
    }
}

// modal de edição de bitfield (montado pelo BitFieldEditor)
class BitfieldModal extends Modal {

    constructor(_editor, _groups, _globalMode) {

        const title =
            _globalMode
            ? (_editor.name || "Bitfield Editor")
            : (_groups.length === 1 ? _groups[0].name : "Bitfield Editor");

        super({ title });

        let inputs = [];

        let valueInputs = [];

        let groupNoInputs = [];

        const warnContainer =
            document.createElement("div");

        warnContainer.id = "bitfield-condition-warnings";

        const renderWarnings =
            (value) => {

                warnContainer.innerHTML = '';

                const warnings =
                    _editor.getConditionWarnings(value);

                warnings.forEach(cw => {

                    const alert =
                        document.createElement("div");

                    alert.className =
                        "bitfield-condition-warning";

                    alert.textContent =
                        cw.message;

                    warnContainer.appendChild(alert);

                });
            };

        // máscara dos bits travados (posições relativas); no modo global é
        // do editor inteiro
        const lockedMaskFor = _group => {

            if (_group == null || !_editor.isBitLocked || !_editor.getGroupBits)
                return _editor.getLockedMask ? _editor.getLockedMask() : 0;

            let mask = 0;

            _editor.getGroupBits(_group).forEach(bit => {
                if (_editor.isBitLocked(_group.offset + bit.index))
                    mask |= (1 << bit.index);
            });

            return mask;
        };

        // input do valor com toggle dec/hex sobreposto (mesmo padrão dos
        // campos numéricos do layout); expõe value (lê/formata por modo)
        const makeModeInput = (_value) => {

            const wrap =
                document.createElement("div");

            wrap.className =
                "num-input-wrap";

            let mode = 'hex';

            const fmt =
                v => mode === 'hex'
                    ? '0x' + Number(v).toString(16)
                    : String(Number(v));

            const di =
                document.createElement("input");

            di.type = 'text';
            di.className = 'form-control';
            di.value = fmt(_value);

            const tgl =
                buildToggleSwitch({
                    name: 'hex',
                    posText: 'hex',
                    negText: 'dec',
                    stateText: true,
                    checked: true,
                    inputClass: 'num-mode',
                    onChange: (_evt, _inp) => {

                        // lê no modo anterior e re-formata no novo
                        const cur = mode === 'hex'
                            ? (parseInt((di.value || '').replace(/^0x/i, '').trim() || '0', 16) || 0)
                            : (Number(di.value) || 0);

                        mode = _inp.checked ? 'hex' : 'dec';

                        di.value = fmt(cur);
                    }
                });

            wrap.appendChild(tgl.root);
            wrap.appendChild(di);

            return {
                wrap,
                input: di,
                toggle: tgl.input,
                mode,
                set value(_v) { di.value = fmt(_v); },
                get value() {
                    if (mode === 'hex') {
                        const n = parseInt(
                            String(di.value).replace(/^0x/i, '').trim() || '0',
                            16
                        );
                        return Number.isNaN(n) ? Number(di.value) || 0 : n;
                    }
                    return Number(di.value);
                },
                fmt: _v => fmt(_v)
            };
        };

        if (_globalMode) {

            let groupTitle =
                document.createElement("h6");

            groupTitle.className =
                "mb-2";

            groupTitle.textContent =
                _editor.name || "Value";

            this.body.appendChild(groupTitle);

            let valueInputWrap =
                null;

            let valueInput =
                null;

            let modeCore =
                null;

            {
                modeCore =
                    makeModeInput(_editor.value);

                valueInputWrap =
                    modeCore.wrap;

                valueInput =
                    modeCore.input;

                this.body.appendChild(modeCore.wrap);
            }

            // render condition warnings
            this.body.appendChild(warnContainer);

            renderWarnings(_editor.value);

            valueInputs.push({
                group: {
                    bits: _editor.totalBits,
                    offset: 0
                },
                core: modeCore,
                input: valueInput
            });

            const lockedMaskGlobal =
                    lockedMaskFor(null);

                let checks = [];

                _groups.forEach(group => {

                    let groupWrap =
                        this.body;

                    if (group.bits > 1) {

                        let groupWrapEl =
                            document.createElement("div");

                        groupWrapEl.className =
                            "bitfield-modal-group";

                        let groupTitle =
                            document.createElement("h6");

                        groupTitle.className =
                            "mb-2";

                        groupTitle.textContent =
                            group.name;

                        groupWrapEl.appendChild(groupTitle);

                        this.body.appendChild(groupWrapEl);

                        groupWrap =
                            groupWrapEl;

                    }

                    let bits =
                        _editor.getGroupBits(group);

                    bits.forEach(bit => {

                        const locked =
                            !!(_editor.isBitLocked
                                && _editor.isBitLocked(group.offset + bit.index));

                        let div =
                            document.createElement("div");

                        div.className =
                            "form-check";

                        if (locked)
                            div.classList.add("bitfield-locked");

                        const tgl =
                            buildToggleSwitch({
                                name: bit.name,
                                checked: locked || bit.enabled,
                                disabled: locked,
                                inputClass: "form-check-input",
                                onChange: (_evt, input) => {

                                    if (locked)
                                        return;

                                    let value = 0;

                                    checks.forEach(c => {

                                        if (c.check.checked)
                                            value |=
                                                (2 ** (c.group.offset + c.bit.index));

                                    });

                                    // bits travados sempre voltam ao valor
                                    value |=
                                        lockedMaskGlobal;

                                    modeCore.value =
                                        value;

                                    renderWarnings(value);
                                }
                            });

                        let info = {
                            group,
                            bit,
                            check: tgl.input,
                            valueInput
                        };

                        div.appendChild(tgl.root);

                        groupWrap.appendChild(div);

                        inputs.push(info);

                        if (!locked)
                            checks.push(info);

                    });

                });

                valueInput.oninput = () => {

                    let value =
                        modeCore.value;

                    // o bit travado volta ao input mesmo se o valor digitado o zerar
                    value |=
                        lockedMaskGlobal;

                    modeCore.value =
                        value;

                    checks.forEach(c => {

                        c.check.checked =
                            ((value >>> (c.group.offset + c.bit.index)) & 1) !== 0;

                    });

                    renderWarnings(value);
                };

        } else {

            _groups.forEach(group => {

                let groupTitle =
                    document.createElement("h6");

                groupTitle.className =
                    "mb-2";

                groupTitle.textContent =
                    group.name;

                this.body.appendChild(groupTitle);

                let valueInput = null;

                let modeCore = null;

                if (group.bits > 1) {

                    let currentValue =
                        _editor.getGroupValue(group);

                    modeCore =
                        makeModeInput(currentValue);

                    valueInput =
                        modeCore.input;

                    this.body.appendChild(modeCore.wrap);

                    valueInputs.push({
                        group,
                        core: modeCore,
                        input: valueInput
                    });

                }

                let bits =
                    _editor.getGroupBits(group);

                const lockedMaskGroup =
                    lockedMaskFor(group);

                let checks = [];

                bits.forEach(bit => {

                    const locked =
                        !!(_editor.isBitLocked
                            && _editor.isBitLocked(group.offset + bit.index));

                    let div =
                        document.createElement("div");

                    div.className =
                        "form-check";

                    if (locked)
                        div.classList.add("bitfield-locked");

                    const tgl =
                        buildToggleSwitch({
                            name: bit.name,
                            checked: locked || bit.enabled,
                            disabled: locked,
                            inputClass: "form-check-input",
                            onChange: (_evt, input) => {

                                if (locked)
                                    return;

                                let value = 0;

                                checks.forEach(c => {

                                    if (c.check.checked)
                                        value |=
                                            (2 ** c.bit.index);

                                });

                                if (valueInput) {

                                    // bits travados sempre voltam ao valor
                                    value |=
                                        lockedMaskGroup;

                                    modeCore.value =
                                        value;
                                }

                                renderWarnings(value);
                            }
                        });

                    let info = {
                        group,
                        bit,
                        check: tgl.input,
                        valueInput
                    };

                    div.appendChild(tgl.root);

                    this.body.appendChild(div);

                    inputs.push(info);

                    if (!locked) {

                        checks.push(info);

                        if (group.bits === 1) {

                            groupNoInputs.push({
                                group,
                                check: tgl.input
                            });

                        }

                    }

                });

                if (valueInput) {

                    valueInput.oninput = () => {

                        let value =
                            modeCore.value;

                        // o bit travado volta ao input mesmo se o valor digitado o zerar
                        value |=
                            lockedMaskGroup;

                        modeCore.value =
                            value;

                        checks.forEach(c => {

                            c.check.checked =
                                ((value >>> c.bit.index) & 1) !== 0;

                        });

                        renderWarnings(value);
                    };

                }

            });

        }

        this.addButton("Cancelar", "btn btn-secondary", () => this.hide(false));

        this.addButton("OK", "btn btn-primary", () => {

            valueInputs.forEach(v => {

                let value =
                    v.core.value;

                // bits travados (ex.: slot do typeid no position_mask) são
                // sempre forçados a 1, mesmo que o valor digitado os zere
                if (_editor.getLockedMask)
                    value |=
                        _editor.getLockedMask();

                _editor.setGroupValue(
                    v.group,
                    value
                );

            });

            groupNoInputs.forEach(g => {

                _editor.setGroupValue(
                    g.group,
                    g.check.checked ? 1 : 0
                );

            });

            this.hide(true);

            if (_editor.onchange)
                _editor.onchange();

        });
    }
}

// modal de escolher item de um/uns iff(s) (que tenham modal de novo item):
// - nome único (string): lista achatada de itens com nome + typeid em hex e
//   filtro por texto (mesmo tipo do filtro da lista de itens)
// - vários iffs (array): árvore com iff nome + chevron "▸" (load lazy da lista
//   no primeiro clique de expandir) e filtro GLOBAL quando digita (mostra os
//   itens que casam em todos os iffs, com o nome do iff no prefixo)
// o clique resolve o show() com o item escolhido (null = cancelou)
class ItemListModal extends Modal {

    // _opts.filter: função _item => bool para restringir a lista (ex.: tácos do
    // Club por tipo no slot do ClubSet)
    constructor(_field, _iffNames, _opts = {}) {

        const names =
            Array.isArray(_iffNames) ? _iffNames : [_iffNames];

        const multi =
            names.length > 1;

        super({
            title: "Escolher item — " + names.slice(0, multi ? 3 : 1).join(' / ') + (multi && names.length > 3 ? '…' : ''),
            modalClass: "part-item-list-modal"
        });

        const sourceIffs =
            (typeof iffs !== 'undefined' ? iffs : [])
                .filter(i => names.includes(i.name));

        const itemsOf =
            _iff => _iff ? _iff.elements.filter(e => !e.__deleted && !e.__deleted2) : [];

        const listFilter =
            _opts.filter || null;

        const searchWrap =
            document.createElement("div");

        searchWrap.className =
            "date-input-wrap part-pick-search-wrap";

        const input =
            document.createElement("input");

        input.type = "text";
        input.className = "form-control part-pick-search";
        input.placeholder = "Filtrar";

        const clearBtn =
            document.createElement("button");

        clearBtn.type = "button";
        clearBtn.className = "date-clear-btn";
        clearBtn.textContent = "\u2715";
        clearBtn.title = "Limpar filtro";

        searchWrap.appendChild(input);
        searchWrap.appendChild(clearBtn);

        this.body.appendChild(searchWrap);

        const list =
            document.createElement("ul");

        list.className =
            "part-pick-list";

        this.body.appendChild(list);

        // um li de item do iff; _prefix = nome do iff no texto (filtro global)
        const buildItemLi = (_iff, _item, _index, _prefix) => {

            const li =
                document.createElement("li");

            li.className =
                "part-pick-item";

            li.itemObj = _item;

            const div =
                document.createElement("div");

            div.className =
                "div-item";

            div.textContent =
                (_prefix ? _prefix + ' — ' : '') + getItemListLabel(_item, _index);

            li.appendChild(div);

            const tid =
                document.createElement("span");

            tid.className =
                "part-pick-typeid";

            tid.textContent =
                '0x' + (_item.typeid ? _item.typeid.value.toString(16) : '0');

            li.appendChild(tid);

            li.addEventListener("click", () => this.hide(_item));

            return li;
        };

        // _opts.uniqueKey: deduplica a lista pela chave (ex.: o picker de voz do
        // Caddie mostra 1 item por id/type, pois o typeid do CaddieVoiceTable
        // não é único)
        const uniqueKey =
            _opts.uniqueKey || null;

        const seenKeys =
            uniqueKey ? new Set() : null;

        const uniqOf = _item => {

            if (!uniqueKey)
                return true;

            const key = uniqueKey(_item);

            if (key === undefined || key === null || key === '')
                return true;

            if (seenKeys.has(key))
                return false;

            seenKeys.add(key);
            return true;
        };

        const render = () => {

            list.innerHTML = '';

            if (seenKeys)
                seenKeys.clear();

            // filtro global: lista achatada com os itens que casam em todos os iffs
            if (input.value.trim()) {

                for (const iff of sourceIffs) {

                    const items = itemsOf(iff);

                    items.forEach((item, index) => {

                        if (listFilter && !listFilter(item))
                            return;

                        if (!uniqOf(item))
                            return;

                        const li =
                            buildItemLi(iff, item, index, multi ? iff.name : null);

                        if (itemMatchesFilter(li, input.value))
                            list.appendChild(li);
                    });
                }

                return;
            }

            if (!multi) {

                const iff = sourceIffs[0];
                const items = itemsOf(iff);

                items.forEach((item, index) => {

                    if (listFilter && !listFilter(item))
                        return;

                    if (!uniqOf(item))
                        return;

                    list.appendChild(buildItemLi(iff, item, index, null));
                });

                return;
            }

            // árvore: um li por iff (nome + chevron); expandir carrega a lista (lazy)
            for (const iff of sourceIffs) {

                const items = itemsOf(iff);

                if (items.length === 0)
                    continue;

                // dedup por iff na árvore (o set global pertence ao render/filtro)
                const treeSeen =
                    uniqueKey ? new Set() : null;

                const treeUniq = _it => {

                    if (!treeSeen || !uniqueKey)
                        return true;

                    const k = uniqueKey(_it);

                    if (k === undefined || k === null || k === '')
                        return true;

                    if (treeSeen.has(k))
                        return false;

                    treeSeen.add(k);
                    return true;
                };

                const filteredItems =
                    (listFilter ? items.filter(listFilter) : items).filter(treeUniq);

                const row =
                    document.createElement("li");

                row.className =
                    "part-pick-iff";

                const head =
                    document.createElement("div");

                head.className =
                    "div-item part-pick-iff-head";

                head.textContent =
                    '▸ ' + iff.name + ' (' + filteredItems.length + ')';

                row.appendChild(head);

                const sub =
                    document.createElement("ul");

                sub.className =
                    "part-pick-sublist";

                let loaded = false;

                head.addEventListener("click", () => {

                    if (!loaded) {

                        filteredItems.forEach((item, index) =>
                            sub.appendChild(buildItemLi(iff, item, index, null)));

                        loaded = true;
                    }

                    const open =
                        sub.classList.toggle('part-pick-open');

                    head.textContent =
                        (open ? '▾' : '▸') + ' ' + iff.name + ' (' + filteredItems.length + ')';
                });

                row.appendChild(sub);
                list.appendChild(row);
            }
        };

        render();

        input.addEventListener('input', render);

        clearBtn.addEventListener('click', () => {

            input.value = '';

            render();

            input.focus();
        });

        this.addButton("Cancelar", "btn btn-secondary", () => this.hide(null));
    }
}
