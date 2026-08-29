# JS IFF Manager

Editor de arquivos IFF do jogo Pangya em JavaScript puro (sem build/typecheck). Abra `app.htm` direto no navegador via `file://` — não precisa de servidor web.

## Versões suportadas

Pangya "Fresh Up!":

- **Japão** (v983) — padrão
- **USA** (v852)
- **Coreia** (v839)
- **Tailândia** (v829c, pack encriptado com XTEA)

A região é detectada automaticamente (por tamanho de elemento / magic do pack); quando há variante, um seletor de região é exibido.

## Funcionalidades

- Edição de ~58 arquivos IFF do Pangya (Character, Item, Part, ClubSet, Ball, Caddie, CaddieItem, SetItem, Skin, HairStyle, Mascot, AuxPart, QuestStuff, QuestItem, Card, Furniture, Match, Course, CadieMagicBox, Achievement, CounterItem, Desc, GrandPrix*, etc.).
- Criação, duplicação, remoção e reversão de itens; detecção automática de encoding (shift_jis/cp949/cp936/etc.) com avisos por campo.
- Pickers de typeid (`ItemListModal` em árvore multi-iff), relações entre iffs e thumbnails por relação de iff.
- Layout por campo com labels descritivos: períodos do `time_shop` em **pang/cash**, stats por índice (POWER..CURVE), enums e bitfields; toggle dec/hex nos campos numéricos.
- `time_shop`: labels condicionais (pang/cash e nomes de período) que aparecem só com `time_shop` ativo; o botão **pang/cash** alterna `flag_shop.type.is_cash` e troca o label.
- Painel de filtros com booleanos tri-state, selects de enum e comparadores de nível/período; lista de itens virtualizada para iffs gigantes.
- Conversão de região (JP/US/KR/TH) preservando campos por nome; packs TH encriptados (XTEA) descriptografados na carga.
- Exportar/importar textos traduzíveis em JSONC e salvar/baixar o arquivo.
- Flag de ligação por iff (relações entre arquivos).
- **Recentes** (IndexedDB): reabrir, renomear e baixar pacotes já usados, com rótulo de região/versão/encoding.

## Como utilizar

1. Abra `app.htm` no navegador.
2. Clique em **Selecione o arquivo IFF** e escolha o **pack** do jogo (arquivo único que contém todos os `.iff` — o app não abre um `.iff` isolado).
3. Opcional: defina o **Diretório de Recursos** para visualizar ícones/modelos dos itens.
4. Se houver variante de região, o **seletor de região** aparece — confirme a opção pré-selecionada (geralmente detectada) ou force outra.
5. Escolha o iff no seletor e clique num item da lista para editar seus campos no painel à direita.
6. Use o **menu de contexto** (botão direito no item): **Novo**, **Duplicar**, **Remover**, **Restaurar**, **Reverter alterações**, **Esconder/Desocultar**, **Mostra todos**.
7. **Salvar** grava em memória; **Baixar** exporta o `.iff` (no TH pergunta se encripta ao baixar).
8. **Recentes**: clique no item da lista para reabrir um pacote já usado; o botão **✎** renomeia a entrada; o botão de download baixa o pacote novamente; cada entrada mostra região/versão/encoding.
9. **Textos (UTF-8)**: exporta/importa os textos traduzíveis (JSONC com marcador de encoding).
10. **Converter Região**: troca o formato do pacote entre JP/US/KR/TH copiando campos pelo nome.

### 🌐 Demonstração

Para testar a aplicação sem fazer o clone é só [clicar aqui](https://acrisio-filho.github.io/JS-IFF-Manager/app.htm).

## Sobre este projeto

A base do projeto foi feita sem auxílio de nenhum tipo de IA. A reformulação da interface e da lógica de edição foi feita com LLMs gratuitas ([OpenCode](https://opencode.ai)).
