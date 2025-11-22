// ==UserScript==
// @name         ticketPreviewJra
// @namespace    http://tampermonkey.net/
// @version      2025-11-08
// @description  馬券選択とプレビュー補助（JRAページ用サブUI）
// @author       kojima0615
// @match        https://race.netkeiba.com/race/shutuba.html*
// @match        https://race.netkeiba.com/odds/index.html*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=netkeiba.com
// ==/UserScript==

(function () {
    'use strict';

    const MAX_RETRY = 20;
    const RETRY_DELAY = 300;

    window.addEventListener('load', () => {
        let attempts = 0;
        const timer = setInterval(() => {
            attempts += 1;
            const accordion = document.getElementById('accordionApp');
            const timePanel = document.getElementById('timeComp');
            if (accordion && timePanel) {
                clearInterval(timer);
                injectTicketPreview(accordion);
            } else if (attempts >= MAX_RETRY) {
                clearInterval(timer);
            }
        }, RETRY_DELAY);
    });

    function injectTicketPreview(accordion) {
        if (document.getElementById('ticketPreview')) return;

        const item = document.createElement('div');
        item.classList.add('accordion-item');

        const header = document.createElement('h2');
        header.classList.add('accordion-header');
        const toggle = document.createElement('button');
        toggle.classList.add('accordion-button', 'collapsed', 'fw-bold');
        toggle.type = 'button';
        toggle.textContent = '馬券プレビュー';
        toggle.setAttribute('data-bs-toggle', 'collapse');
        toggle.setAttribute('data-bs-target', '#ticketPreview');
        toggle.setAttribute('aria-controls', 'ticketPreview');
        toggle.setAttribute('aria-expanded', 'false');
        header.appendChild(toggle);
        item.appendChild(header);

        const collapse = document.createElement('div');
        collapse.id = 'ticketPreview';
        collapse.classList.add('accordion-collapse', 'collapse');
        collapse.setAttribute('data-bs-parent', '#accordionApp');
        const body = document.createElement('div');
        body.classList.add('accordion-body');
        collapse.appendChild(body);
        item.appendChild(collapse);

        accordion.appendChild(item);
        buildTicketPreview(body);
    }

    function buildTicketPreview(container) {
        const horseNodes = Array.from(document.querySelectorAll('.RaceTableArea .HorseList'));
        const horses = horseNodes
            .map((row) => {
                const anchor = row.querySelector('.HorseInfo .HorseName a');
                if (!anchor) return null;
                const number = row.children[1]?.textContent?.trim() || '';
                const label = anchor.getAttribute('title') || anchor.textContent.trim();
                return { number, label };
            })
            .filter(Boolean);

        if (!horses.length) {
            const alert = document.createElement('div');
            alert.classList.add('alert', 'alert-warning');
            alert.textContent = '出走情報が取得できなかったため馬券プレビューを表示できません。';
            container.appendChild(alert);
            return;
        }

        const block = document.createElement('div');
        container.appendChild(block);

        const kindList = ['単勝', '複勝', '枠連', '馬連', 'ワイド', '馬単', '三連複', '三連単'];
        const selectionsPerKind = [1, 1, 2, 2, 2, 2, 3, 3];
        const selectorMap = {};

        kindList.forEach((kind, idx) => {
            const section = document.createElement('div');
            section.classList.add('border-bottom', 'my-2');
            const title = document.createElement('h6');
            title.classList.add('fw-bold');
            title.textContent = kind;
            section.appendChild(title);

            const toggleRow = document.createElement('div');
            toggleRow.classList.add('form-check', 'form-switch', 'mb-2');
            const toggleInput = document.createElement('input');
            toggleInput.type = 'checkbox';
            toggleInput.classList.add('form-check-input');
            const toggleLabel = document.createElement('label');
            toggleLabel.classList.add('form-check-label');
            toggleLabel.textContent = `${kind}を入力`;
            toggleRow.appendChild(toggleInput);
            toggleRow.appendChild(toggleLabel);
            section.appendChild(toggleRow);

            const slotWrapper = document.createElement('div');
            slotWrapper.style.display = 'none';
            const slotGroups = [];
            for (let slot = 0; slot < selectionsPerKind[idx]; slot++) {
                const slotTitle = document.createElement('div');
                slotTitle.classList.add('fw-bold', 'mt-2');
                slotTitle.textContent = `${slot + 1}頭目`;
                slotWrapper.appendChild(slotTitle);

                const grid = document.createElement('div');
                grid.classList.add('d-flex', 'flex-wrap', 'gap-2', 'mb-2');
                const slotCheckboxes = [];
                horses.forEach((horse, index) => {
                    const label = document.createElement('label');
                    label.classList.add('form-check', 'form-check-inline', 'me-2');
                    const checkbox = document.createElement('input');
                    checkbox.type = 'checkbox';
                    checkbox.classList.add('form-check-input');
                    checkbox.dataset.horseIndex = index.toString();
                    label.appendChild(checkbox);
                    const span = document.createElement('span');
                    span.classList.add('form-check-label');
                    span.textContent = horse.number || `${index + 1}`;
                    label.appendChild(span);
                    grid.appendChild(label);
                    slotCheckboxes.push(checkbox);
                });
                slotWrapper.appendChild(grid);
                slotGroups.push(slotCheckboxes);
            }
            section.appendChild(slotWrapper);

            toggleInput.addEventListener('change', () => {
                slotWrapper.style.display = toggleInput.checked ? '' : 'none';
            });

            selectorMap[kind] = { toggle: toggleInput, slots: slotGroups };
            block.appendChild(section);
        });

        const outputButton = document.createElement('button');
        outputButton.classList.add('my-2', 'btn', 'btn-outline-primary', 'w-100');
        outputButton.textContent = '出力&コピー';
        block.appendChild(outputButton);

        const textarea = document.createElement('textarea');
        textarea.classList.add('form-control', 'w-100');
        textarea.rows = 8;
        block.appendChild(textarea);

        outputButton.addEventListener('click', () => {
            const umaban = ['①','②','③','④','⑤','⑥','⑦','⑧','⑨','⑩','⑪','⑫','⑬','⑭','⑮','⑯','⑰','⑱'];
            let output = `${document.querySelector('.RaceName')?.textContent.trim() || ''}\n`;
            kindList.forEach((kind) => {
                const { toggle, slots } = selectorMap[kind];
                if (!toggle.checked) return;
                output += `${kind}\n`;
                const slotStrings = slots
                    .map((slotCheckboxes) => {
                        const picks = slotCheckboxes
                            .filter((checkbox) => checkbox.checked)
                            .map((checkbox) => {
                                const idx = Number(checkbox.dataset.horseIndex);
                                return umaban[idx] || `(${idx + 1})`;
                            });
                        return picks.join('');
                    })
                    .filter((segment) => segment.length);
                output += `${slotStrings.join('－')}\n`;
            });
            textarea.value = output;
            textarea.select();
            document.execCommand('copy');
            alert('コピーしました');
        });
    }
})();
