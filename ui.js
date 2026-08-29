// Arquivo ui.js
// Criado em 02/08/2026 as 23:22 por agente do opencode LLMs

// ui.js — melhorias de UX com jQuery (só browser, fora do escopo dos testes)
// Carregado apenas no app.htm, depois de app.js.

$(function () {
    'use strict';

    // barra de busca: realce de foco
    $('#searchItem')
        .on('focus', function () {
            $(this).addClass('ui-focus');
        })
        .on('blur', function () {
            $(this).removeClass('ui-focus');
        });

    // fechar o menu de contexto com clique fora (jQuery)
    $(document).on('click', function (e) {
        if ($(e.target).closest('#ul-item-context-menu').length === 0)
            $('#ul-item-context-menu').hide();

        if ($(e.target).closest('.num-mode').length === 0)
            $('.num-mode').removeClass('ui-focus');
    });

    // item novo: pisca rápido pro usuário achar onde foi criado
    $(document).on('click', '#li-item-new', function () {
        flashSelectedItem();
    });
    $(document).on('click', '#li-item-dup', function () {
        flashSelectedItem();
    });

    function flashSelectedItem() {
        const sel = $('#item-sel li.item-selected');
        if (sel.length === 0)
            return;
        sel.addClass('ui-flash');
        setTimeout(() => sel.removeClass('ui-flash'), 700);
    }
});