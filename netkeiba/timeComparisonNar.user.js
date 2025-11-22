// ==UserScript==
// @name         timeComparisonNar
// @namespace    http://tampermonkey.net/
// @version      2025-11-08
// @description  地方競馬のタイム比較
// @author       kojima0615
// @match        https://nar.netkeiba.com/race/shutuba.html*
// @match        https://nar.netkeiba.com/odds/index.html*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=netkeiba.com
// @grant        GM_xmlhttpRequest
// @connect      db.netkeiba.com
// @require      https://ajax.googleapis.com/ajax/libs/jqueryui/1.12.0/jquery-ui.min.js
// @resource     jqUI_CSS  http://ajax.googleapis.com/ajax/libs/jqueryui/1.12.0/themes/base/jquery-ui.css
// @require      https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js
// ==/UserScript==

(function () {
    'use strict';

    const DEBUG_KEY = 'timeComparisonNar_debug';
    const MARK_LABELS = { '0': '--', '1': '◎', '2': '⚪︎', '3': '▲', '4': '△', '5': '☆', '98': '✔️', '99': '消' };
    const PLACE_OPTIONS = ['指定なし', '大井', '川崎', '船橋', '浦和', '帯広', '門別', '盛岡', '水沢', '金沢', '笠松', '名古屋', '園田', '姫路', '高知', '佐賀'];
    const STYLESHEET_URL = 'https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css';
    const SCRIPT_URL = 'https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js';

    let debugEnabled = false;
    let debugLogs = [];
    let debugOutputEl = null;
    let debugCopyButton = null;
    let debugControlRow = null;

    loadDebugPreference();
    window.addEventListener('load', initialize);

    async function initialize() {
        const raceId = getQueryParam('race_id');
        if (!raceId) {
            logDebug('race_idが見つからないため処理を中断します');
            return;
        }

        const state = createInitialState(raceId);
        await populateEntries(state);
        await populateOdds(state);
        await populateRaceHistories(state);
        buildInterface(state);
    }

    function createInitialState(raceId) {
        return {
            raceId,
            raceUrl: `https://nar.netkeiba.com/race/shutuba.html?race_id=${raceId}`,
            raceName: 'レース名未取得',
            horseLinks: {},
            horseWeights: {},
            horseNumbers: {},
            selectionMarks: {},
            raceResultsByType: {},
            oddsMap: {},
            currentRaceType: null,
        };
    }

    async function populateEntries(state) {
        const responseText = await gmRequest({
            url: state.raceUrl,
            responseType: 'text/html',
            overrideMimeType: 'text/html; charset=euc-jp',
        });

        const doc = new DOMParser().parseFromString(responseText, 'text/html');
        const raceNameNode = doc.querySelector('.RaceName');
        if (raceNameNode) {
            state.raceName = raceNameNode.textContent.replace(/\s+/g, '');
        }
        state.currentRaceType = detectCurrentRaceType(doc);
        logDebug('コース情報', { currentRaceType: state.currentRaceType });

        const entries = doc.querySelectorAll('.HorseList');
        entries.forEach((entry) => {
            try {
                const horseAnchor = entry.querySelector('.HorseInfo .HorseName a');
                if (!horseAnchor) return;
                const horseName = horseAnchor.getAttribute('title');
                state.horseLinks[horseName] = horseAnchor.getAttribute('href');
                const numberCell = entry.children[1];
                const weightCell = entry.querySelector('.Txt_C');
                state.horseNumbers[horseName] = numberCell?.textContent?.trim() || '';
                state.horseWeights[horseName] = weightCell?.textContent?.trim() || '';
                state.selectionMarks[horseName] = '0';
            } catch (error) {
                logDebug('出走馬情報の解析に失敗', { message: error?.message || error });
            }
        });

        cart_get_itemlist(`horse_${state.raceId}`, (result) => applySelectionMarks(state, result));
        logDebug('出馬表取得結果', { horseCount: Object.keys(state.horseLinks).length, raceName: state.raceName });
    }

    function applySelectionMarks(state, cartResult) {
        const decoded = {};
        Object.keys(cartResult || {}).forEach((key) => {
            const parts = cartResult[key]._cd.split('_');
            decoded[parts[0]] = parts[1];
        });
        Object.keys(state.horseNumbers).forEach((horseName) => {
            const number = state.horseNumbers[horseName];
            state.selectionMarks[horseName] = decoded[number] || '0';
        });
    }

    async function populateOdds(state) {
        const oddsUrl = `https://nar.netkeiba.com/api/api_get_nar_odds.html?race_id=${state.raceId}`;
        try {
            const response = await fetch(oddsUrl);
            if (!response.ok) throw new Error('オッズAPI応答エラー');
            const json = await response.json();
            mapNarOdds(json, state);
            logDebug('オッズ情報取得完了', { status: json.odds_status });
        } catch (error) {
            logDebug('オッズ情報取得に失敗', { message: error?.message || error });
        }
    }

    function mapNarOdds(apiResponse, state) {
        const status = apiResponse?.odds_status;
        const oddsData = apiResponse?.ary_odds;
        if (!oddsData) return;

        const pad2 = (value) => value.toString().padStart(2, '0');

        if (status === 'real') {
            Object.keys(state.horseNumbers).forEach((horseName) => {
                const key = pad2(state.horseNumbers[horseName] || '');
                const entry = oddsData[key];
                if (entry) {
                    state.oddsMap[horseName] = [entry.Odds || '**', entry.Ninki || '--'];
                }
            });
        } else if (status === 'yoso') {
            const reverseLink = Object.fromEntries(
                Object.entries(state.horseLinks).map(([name, href]) => [href, name])
            );
            const sorted = Object.keys(reverseLink).sort();
            sorted.forEach((href) => {
                const horseName = reverseLink[href];
                const horseId = href.split('/').filter(Boolean).pop();
                const entry = oddsData?.KettoNum?.[horseId];
                if (entry) {
                    state.oddsMap[horseName] = [entry.Odds || '**', entry.Ninki || '--'];
                }
            });
        }
    }

    async function populateRaceHistories(state) {
        const horseNames = Object.keys(state.horseLinks);
        const historyPromises = horseNames.map((horse) => fetchHorseHistory(state.horseLinks[horse], horse));
        const histories = await Promise.all(historyPromises);
        const aggregated = {};

        histories.forEach((history) => {
            Object.keys(history).forEach((type) => {
                if (!aggregated[type]) aggregated[type] = [];
                aggregated[type].push(...history[type]);
            });
        });

        Object.keys(aggregated).forEach((type) => aggregated[type].sort());
        state.raceResultsByType = aggregated;
        logDebug('集計済み距離一覧', { raceTypeCount: Object.keys(aggregated).length });
    }

    async function fetchHorseHistory(url, horseName) {
        const responseText = await gmRequest({
            url,
            responseType: 'text/html',
            overrideMimeType: 'text/html; charset=euc-jp',
        });

        const doc = new DOMParser().parseFromString(responseText, 'text/html');
        let rows = extractHistoryRows(doc);
        let source = 'page';

        if (!rows.length) {
            const horseId = parseHorseId(url);
            logDebug('過去レーステーブルが見つかりません', { horseName, url, horseId });
            if (horseId) {
                try {
                    const ajaxDoc = await fetchAjaxHistoryDoc(horseId);
                    rows = extractHistoryRows(ajaxDoc);
                    source = 'ajax';
                } catch (error) {
                    logDebug('ajaxホース結果取得に失敗', { horseName, message: error?.message || error });
                }
            }
        }

        if (!rows.length) {
            logDebug('過去レーステーブルが最後まで取得できません', { horseName });
            return {};
        }

        const history = {};
        const nbsp = /&nbsp;/gi;
        rows.forEach((row) => {
            if (!row.cells || row.cells.length < 24) return;
            const raceType = (row.cells[14]?.textContent || '').trim();
            if (!raceType) return;

            const result = {
                time: (row.cells[18]?.innerHTML || '').replace(nbsp, ' ').trim(),
                agari: (row.cells[23]?.innerHTML || '').replace(nbsp, ' ').trim(),
                passing: (row.cells[21]?.innerHTML || '').replace(nbsp, ' ').trim(),
                margin: (row.cells[19]?.innerHTML || '').replace(nbsp, ' ').trim(),
                horse: horseName,
                date: (row.cells[0]?.textContent || '').trim(),
                place: (row.cells[1]?.textContent || '').trim(),
                condition: (row.cells[16]?.textContent || '').trim(),
                weight: (row.cells[13]?.textContent || '').trim(),
                rank: (row.cells[11]?.textContent || '').trim(),
            };

            if (!result.time || !result.agari || !result.passing || !result.margin) return;
            if (!history[raceType]) history[raceType] = [];
            history[raceType].push([
                result.time,
                result.agari,
                result.passing,
                result.margin,
                result.horse,
                result.date,
                result.place,
                result.condition,
                result.weight,
                result.rank,
            ]);
        });

        logDebug('過去レース取得完了', { horseName, raceTypeCount: Object.keys(history).length, source });
        return history;
    }

    function extractHistoryRows(doc) {
        const selectors = [
            '#page .db_main_race.fc .db_main_deta table tbody tr',
            '#page .db_main_race .db_main_deta table tbody tr',
            'table.db_h_race_results tbody tr',
            '#horse_results_box table tbody tr',
        ];
        for (const selector of selectors) {
            const rows = doc.querySelectorAll(selector);
            if (rows && rows.length) return Array.from(rows);
        }
        return [];
    }

    function parseHorseId(url) {
        if (!url) return null;
        const direct = url.match(/horse\/(?:result\/)?(\d{10,})/);
        if (direct) return direct[1];
        const query = url.match(/[?&]id=(\d{10,})/);
        return query ? query[1] : null;
    }

    async function fetchAjaxHistoryDoc(horseId) {
        const responseText = await gmRequest({
            url: `https://db.netkeiba.com/horse/ajax_horse_results.html?id=${horseId}`,
            responseType: 'text/html',
            overrideMimeType: 'text/html; charset=euc-jp',
        });
        return new DOMParser().parseFromString(`<div>${responseText}</div>`, 'text/html');
    }

    function buildInterface(state) {
        ensureResource(STYLESHEET_URL, 'link');
        ensureResource(SCRIPT_URL, 'script');

        const parent = resolveParentContainer();
        if (!parent) return;

        const accordion = obtainAccordion(parent);
        const panel = createAccordionPanel(accordion, 'タイム比較', 'timeCompNar');
        const body = panel.querySelector('.accordion-body');
        const container = document.createElement('div');
        body.appendChild(container);

        injectDebugControls(container);
        const ui = createFilterControls(container, state);
        const table = createResultTable(container, state, ui);
        wireFilterEvents(state, ui, table);
        createScreenshotButton(container, state);
    }

    function resolveParentContainer() {
        const path = location.pathname;
        const page = document.getElementById('page') || document.body;
        if (!page) {
            logDebug('ページコンテナが見つかりません');
            return null;
        }

        const candidates =
            path === '/race/shutuba.html'
                ? [
                      () => document.querySelector('.RaceTableArea'),
                      () => document.querySelector('.RaceTable01'),
                      () => document.querySelector('.RaceTableBlock'),
                      () => page,
                  ]
                : path === '/odds/index.html'
                ? [
                      () => document.querySelector('.OddsDataCommon'),
                      () => document.querySelector('.OddsBox'),
                      () => page,
                  ]
                : [];

        for (const resolver of candidates) {
            const node = resolver();
            if (node) return node;
        }

        logDebug('親コンテナが見つからないためpage直下に挿入します');
        return page;
    }

    function obtainAccordion(parent) {
        let accordion = document.getElementById('accordionApp');
        if (!accordion) {
            accordion = document.createElement('div');
            accordion.id = 'accordionApp';
            accordion.classList.add('accordion', 'my-2');
            parent.appendChild(accordion);
        }
        return accordion;
    }

    function createAccordionPanel(accordion, title, panelId) {
        const item = document.createElement('div');
        item.classList.add('accordion-item');
        const header = document.createElement('h2');
        header.classList.add('accordion-header');
        const button = document.createElement('button');
        button.classList.add('accordion-button', 'collapsed', 'fw-bold');
        button.type = 'button';
        button.innerText = title;
        button.setAttribute('data-bs-toggle', 'collapse');
        button.setAttribute('data-bs-target', `#${panelId}`);
        button.setAttribute('aria-controls', panelId);
        button.setAttribute('aria-expanded', 'false');

        header.appendChild(button);
        item.appendChild(header);

        const collapse = document.createElement('div');
        collapse.id = panelId;
        collapse.classList.add('accordion-collapse', 'collapse');
        collapse.setAttribute('data-bs-parent', '#accordionApp');

        const body = document.createElement('div');
        body.classList.add('accordion-body');
        collapse.appendChild(body);

        item.appendChild(collapse);
        accordion.appendChild(item);
        return item;
    }

    function injectDebugControls(container) {
        const wrapper = document.createElement('div');
        wrapper.classList.add('form-check', 'form-switch', 'mb-2');
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.classList.add('form-check-input');
        input.id = 'timeComparisonNarDebugSwitch';
        input.checked = debugEnabled;
        const label = document.createElement('label');
        label.classList.add('form-check-label');
        label.setAttribute('for', 'timeComparisonNarDebugSwitch');
        label.textContent = 'デバッグモード';

        wrapper.appendChild(input);
        wrapper.appendChild(label);
        container.appendChild(wrapper);

        debugControlRow = document.createElement('div');
        debugControlRow.classList.add('d-flex', 'gap-2', 'mb-2');
        debugCopyButton = document.createElement('button');
        debugCopyButton.classList.add('btn', 'btn-sm', 'btn-outline-secondary');
        debugCopyButton.textContent = 'ログをコピー';
        debugCopyButton.addEventListener('click', copyDebugLogs);
        debugControlRow.appendChild(debugCopyButton);
        container.appendChild(debugControlRow);

        debugOutputEl = document.createElement('pre');
        debugOutputEl.classList.add('bg-light', 'border', 'p-2', 'small');
        debugOutputEl.style.maxHeight = '200px';
        debugOutputEl.style.overflowY = 'auto';
        container.appendChild(debugOutputEl);
        refreshDebugPanel();

        input.addEventListener('change', (event) => {
            debugEnabled = event.target.checked;
            saveDebugPreference(debugEnabled);
            refreshDebugPanel();
            if (debugEnabled) console.info('[timeComparisonNar] デバッグモードを有効化しました');
        });
    }

    function createFilterControls(container, state) {
        const selectorsRow = document.createElement('div');
        selectorsRow.classList.add('d-flex', 'flex-row');
        container.appendChild(selectorsRow);

        selectorsRow.appendChild(createLabel('距離:'));
        const distanceSelect = document.createElement('select');
        distanceSelect.classList.add('form-select', 'my-2', 'w-25');
        const raceTypes = Object.keys(state.raceResultsByType).sort();
        raceTypes.forEach((type) => {
            const option = document.createElement('option');
            option.value = type;
            option.textContent = type;
            distanceSelect.appendChild(option);
        });
        selectorsRow.appendChild(distanceSelect);

        selectorsRow.appendChild(createLabel('開催地:'));
        const placeSelect = document.createElement('select');
        placeSelect.classList.add('form-select', 'my-2', 'w-25');
        PLACE_OPTIONS.forEach((place) => {
            const option = document.createElement('option');
            option.value = place;
            option.textContent = place;
            placeSelect.appendChild(option);
        });
        selectorsRow.appendChild(placeSelect);

        const dateGroup = document.createElement('div');
        dateGroup.classList.add('input-group', 'my-2');
        container.appendChild(dateGroup);

        dateGroup.appendChild(createSpan('期間:'));
        dateGroup.appendChild(createSpan('From:'));

        const fromDateInput = document.createElement('input');
        fromDateInput.type = 'input';
        fromDateInput.id = 'fromDate';
        fromDateInput.className = 'pickDate form-control';
        const defaultFrom = new Date();
        defaultFrom.setFullYear(defaultFrom.getFullYear() - 1);
        $(fromDateInput).datepicker({ changeYear: true, changeMonth: true, maxDate: new Date() });
        $(fromDateInput).datepicker('setDate', defaultFrom);
        dateGroup.appendChild(fromDateInput);

        dateGroup.appendChild(createSpan('To:'));
        const toDateInput = document.createElement('input');
        toDateInput.type = 'input';
        toDateInput.id = 'toDate';
        toDateInput.className = 'pickDate2 form-control';
        $(toDateInput).datepicker({ changeYear: true, changeMonth: true, maxDate: new Date() });
        $(toDateInput).datepicker('setDate', new Date());
        dateGroup.appendChild(toDateInput);

        const searchButton = document.createElement('button');
        searchButton.textContent = '検索';
        searchButton.classList.add('my-2', 'btn', 'btn-outline-primary', 'w-100');
        container.appendChild(searchButton);

        if (raceTypes.length > 0) {
            const defaultType = chooseInitialRaceType(raceTypes, state);
            if (defaultType) {
                distanceSelect.value = defaultType;
            }
        }

        return {
            distanceSelect,
            placeSelect,
            fromDateInput,
            toDateInput,
            searchButton,
            hasRaceType: raceTypes.length > 0,
        };
    }

    function createResultTable(container, state, ui) {
        if (!ui.hasRaceType) {
            const alert = document.createElement('div');
            alert.classList.add('alert', 'alert-warning', 'my-2');
            alert.textContent = 'このレースの過去タイムを取得できませんでした。デバッグログをご確認ください。';
            container.appendChild(alert);
            logDebug('距離データが0件', { message: 'UI警告を表示しました' });
        }

        const table = document.createElement('table');
        table.classList.add('table');
        const headerRow = document.createElement('tr');
        ['馬名', 'タイム', '上り', '斤量差<br>(本レース-過去レース)', '開催', '馬場', '通過', '着順', '着差', '日付', '人気<br>(本レース)'].forEach((label) => {
            const th = document.createElement('th');
            th.innerHTML = label;
            headerRow.appendChild(th);
        });
        table.appendChild(headerRow);
        container.appendChild(table);

        if (ui.hasRaceType) {
            renderResults(table, state.raceResultsByType[ui.distanceSelect.value], state, ui);
        }
        return table;
    }

    function renderResults(table, list, state, ui) {
        if (!list) return;
        const formatDate = (date) => {
            const y = date.getFullYear();
            const m = (`0${date.getMonth() + 1}`).slice(-2);
            const d = (`0${date.getDate()}`).slice(-2);
            return `${y}/${m}/${d}`;
        };
        const fromDate = formatDate($(ui.fromDateInput).datepicker('getDate'));
        const toDate = formatDate($(ui.toDateInput).datepicker('getDate'));

        while (table.rows.length > 1) table.deleteRow(-1);
        list.forEach((record) => {
            const [time, agari, passing, margin, horse, date, place, condition, weight, rank] = record;
            if (date > toDate || date < fromDate) return;
            if (ui.placeSelect.value !== '指定なし' && place.indexOf(ui.placeSelect.value) === -1) return;

            const row = document.createElement('tr');
            appendTextCell(row, decorateHorseName(horse, state));
            appendTextCell(row, time);
            appendTextCell(row, agari);
            appendTextCell(row, `${Number(state.horseWeights[horse] || 0) - Number(weight || 0)}`);
            appendTextCell(row, normalizePlace(place));
            appendTextCell(row, condition);
            appendTextCell(row, passing);
            appendTextCell(row, rank);
            appendTextCell(row, margin);
            appendTextCell(row, date);
            appendTextCell(row, safeOdds(state.oddsMap[horse]));
            table.appendChild(row);
        });
    }

    function wireFilterEvents(state, ui, table) {
        if (!ui.hasRaceType) {
            ui.distanceSelect.disabled = true;
            ui.placeSelect.disabled = true;
            ui.searchButton.disabled = true;
            return;
        }
        const update = () => {
            renderResults(table, state.raceResultsByType[ui.distanceSelect.value], state, ui);
        };
        ui.distanceSelect.addEventListener('change', update);
        ui.placeSelect.addEventListener('change', update);
        ui.searchButton.addEventListener('click', update);
    }

    function createScreenshotButton(container, state) {
        const button = document.createElement('button');
        button.textContent = 'スクリーンショット';
        button.classList.add('my-2', 'btn', 'btn-outline-primary', 'w-100');
        button.addEventListener('click', () => captureScreenshot(state));
        container.appendChild(button);
    }

    function captureScreenshot(state) {
        const target = document.getElementById('timeCompNar');
        if (!target) {
            alert('Target div not found!');
            return;
        }
        html2canvas(target)
            .then((canvas) => {
                const link = document.createElement('a');
                link.href = canvas.toDataURL('image/png');
                link.download = `${state.raceName}.png`;
                link.click();
            })
            .catch((error) => console.error('Error capturing screenshot:', error));
    }

    function decorateHorseName(horseName, state) {
        const mark = MARK_LABELS[state.selectionMarks[horseName]] || '--';
        const number = state.horseNumbers[horseName] || '--';
        return `${mark}(${number})${horseName}`;
    }

    function normalizePlace(place) {
        if (!place) return '';
        return /^[0-9]/.test(place) ? place.slice(1, -1) : place;
    }

    function safeOdds(entry) {
        if (!entry) return '**';
        if (Array.isArray(entry)) return entry[1] || entry[0] || '**';
        if (typeof entry === 'string') return entry;
        return entry.Ninki || entry.Odds || '**';
    }

    function appendTextCell(row, text) {
        const cell = document.createElement('td');
        cell.textContent = text;
        row.appendChild(cell);
    }

    function createLabel(text) {
        const label = document.createElement('div');
        label.textContent = text;
        label.classList.add('input-group-text', 'p-2', 'my-2');
        return label;
    }

    function createSpan(text) {
        const span = document.createElement('span');
        span.textContent = text;
        span.classList.add('input-group-text');
        return span;
    }

    function detectCurrentRaceType(doc) {
        const candidates = [
            doc.querySelector('.RaceData01'),
            doc.querySelector('.RaceData') ,
            doc.querySelector('.RaceData02'),
        ];
        for (const node of candidates) {
            if (!node) continue;
            const text = node.textContent.replace(/\s+/g, '');
            const match = text.match(/(芝|ダート|ダ|障)[^0-9]*?(\d{3,4})m/i);
            if (match) {
                const surface = match[1] === 'ダート' ? 'ダ' : match[1];
                const distance = match[2];
                return `${surface}${distance}`;
            }
        }
        return null;
    }

    function extractSurface(label) {
        if (!label) return '';
        const match = label.replace(/ダート/g, 'ダ').match(/芝|ダ|障/);
        return match ? match[0] : '';
    }

    function chooseInitialRaceType(raceTypes, state) {
        if (!raceTypes.length) return null;
        const target = state.currentRaceType;
        if (target) {
            const targetSurface = extractSurface(target);
            const targetDistance = (target.match(/\d{3,4}/) || [])[0];
            const exact = raceTypes.find((type) => {
                const surface = extractSurface(type);
                const distance = (type.match(/\d{3,4}/) || [])[0];
                const surfaceMatch = targetSurface ? surface === targetSurface : true;
                const distanceMatch = targetDistance ? distance === targetDistance : true;
                return surfaceMatch && distanceMatch;
            });
            if (exact) return exact;
        }
        return raceTypes.reduce((best, current) => {
            if (!best) return current;
            const bestLen = state.raceResultsByType[best]?.length || 0;
            const currentLen = state.raceResultsByType[current]?.length || 0;
            return currentLen > bestLen ? current : best;
        }, raceTypes[0]);
    }

    function ensureResource(url, type) {
        if (type === 'link') {
            if (!document.querySelector(`link[href="${url}"]`)) {
                const link = document.createElement('link');
                link.rel = 'stylesheet';
                link.href = url;
                (document.head || document.documentElement).appendChild(link);
            }
        } else if (type === 'script') {
            if (!document.querySelector(`script[src="${url}"]`)) {
                const script = document.createElement('script');
                script.src = url;
                (document.body || document.documentElement).appendChild(script);
            }
        }
    }

    function gmRequest(options) {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                ...options,
                onload: (response) => resolve(response.responseText),
                onerror: reject,
            });
        });
    }

    function getQueryParam(name, url) {
        const targetUrl = url || window.location.href;
        const regex = new RegExp(`[?&]${name}(=([^&#]*)|&|#|$)`);
        const results = regex.exec(targetUrl);
        if (!results) return null;
        if (!results[2]) return '';
        return decodeURIComponent(results[2].replace(/\+/g, ' '));
    }

    function copyDebugLogs() {
        const textarea = document.createElement('textarea');
        textarea.value = debugLogs.join('\n');
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
        alert('デバッグログをコピーしました');
    }

    function loadDebugPreference() {
        try {
            debugEnabled = localStorage.getItem(DEBUG_KEY) === '1';
        } catch (_) {
            debugEnabled = false;
        }
    }

    function saveDebugPreference(value) {
        try {
            localStorage.setItem(DEBUG_KEY, value ? '1' : '0');
        } catch (_) {
            /* ignore */
        }
    }

    function logDebug(message, payload) {
        const timestamp = new Date().toLocaleString();
        const entry = payload ? `[${timestamp}] ${message} :: ${JSON.stringify(payload)}` : `[${timestamp}] ${message}`;
        debugLogs.push(entry);
        if (debugEnabled) {
            console.debug('[timeComparisonNar]', message, payload || '');
            refreshDebugPanel();
        }
    }

    function refreshDebugPanel() {
        if (debugOutputEl) {
            debugOutputEl.textContent = debugLogs.join('\n');
            debugOutputEl.style.display = debugEnabled ? '' : 'none';
        }
        if (debugCopyButton) {
            debugCopyButton.style.display = debugEnabled ? '' : 'none';
        }
        if (debugControlRow) {
            debugControlRow.style.display = debugEnabled ? 'flex' : 'none';
        }
    }
})();
