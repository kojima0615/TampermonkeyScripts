// ==UserScript==
// @name  timeComparison
// @namespace    http://tampermonkey.net/
// @version      2024-02-12
// @description  競馬のタイム比較
// @author       kojima0615
// @match        https://race.netkeiba.com/race/shutuba.html*
// @match        https://race.netkeiba.com/odds/index.html*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=netkeiba.com
// @grant GM_xmlhttpRequest
// @connect db.netkeiba.com
// @require     https://ajax.googleapis.com/ajax/libs/jqueryui/1.12.0/jquery-ui.min.js
// @resource    jqUI_CSS  http://ajax.googleapis.com/ajax/libs/jqueryui/1.12.0/themes/base/jquery-ui.css
// ==/UserScript==


(function () {
    'use strict';
    window.addEventListener('load', async function () {

        /**
         * Get the URL parameter value
         *
         * @param  name {string} パラメータのキー文字列
         * @return  url {url} 対象のURL文字列（任意）
         */
        function getParam(name, url) {
            if (!url) url = window.location.href;
            name = name.replace(/[\[\]]/g, "\\$&");
            var regex = new RegExp("[?&]" + name + "(=([^&#]*)|&|#|$)"),
                results = regex.exec(url);
            if (!results) return null;
            if (!results[2]) return '';
            return decodeURIComponent(results[2].replace(/\+/g, " "));
        }

        //出馬テーブル取得
        const url = "https://race.netkeiba.com/race/shutuba.html?race_id=" + getParam("race_id");
        //各馬の過去レースへのリンクを取得
        function getHorseData(url) {
            return new Promise((resolve, reject) => {

                GM_xmlhttpRequest({
                    url: url,
                    responseType: 'text/html',
                    overrideMimeType: "text/html; charset=euc-jp",
                    onload: function (d) {
                        var responseXML = null;
                        responseXML = new DOMParser().parseFromString(d.responseText, "text/html");
                        try {
                            var horseLink = {};
                            var weightDict = {}
                            var numberDict = {}
                            var selectedDict = {}
                            const horse_raw = responseXML.getElementById('page').getElementsByClassName('RaceColumn02')[0].getElementsByClassName('RaceTableArea')[0].children[0].getElementsByClassName('HorseList');
                            const horse_selected_raw = responseXML.getElementById('page').getElementsByClassName('RaceColumn02')[0].getElementsByClassName('RaceTableArea')[0].children[0].getElementsByClassName('HorseList Selected');
                            for (const element of horse_raw) {
                                const horsename = element.getElementsByClassName('HorseInfo')[0].getElementsByClassName('HorseName')[0].getElementsByTagName('a')[0];
                                const popularity = element.getElementsByClassName('Popular Popular_Ninki Txt_C')[0].children[0].textContent;
                                //人気が空になる
                                const number = element.children[1].innerHTML;
                                const weight = element.children[5].innerHTML;
                                horseLink[horsename.getAttribute('title')] = horsename.getAttribute('href');
                                weightDict[horsename.getAttribute('title')] = weight;
                                numberDict[horsename.getAttribute('title')] = number;
                                selectedDict[horsename.getAttribute('title')] = 0;
                            }
                            for (const element of horse_selected_raw) {
                                const horsename = element.getElementsByClassName('HorseInfo')[0].getElementsByClassName('HorseName')[0].getElementsByTagName('a')[0];
                                const popularity = element.getElementsByClassName('Popular Popular_Ninki Txt_C')[0].children[0].textContent;
                                //人気が空になる
                                const number = element.children[1].innerHTML;
                                const weight = element.children[5].innerHTML;
                                horseLink[horsename.getAttribute('title')] = horsename.getAttribute('href');
                                weightDict[horsename.getAttribute('title')] = weight;
                                numberDict[horsename.getAttribute('title')] = number;
                                selectedDict[horsename.getAttribute('title')] = 0;
                            }
                            resolve({ horseLink: horseLink, weightDict: weightDict, numberDict: numberDict, selectedDict: selectedDict });
                        }
                        catch (e) {
                            //競走馬データがないときにTypeErrorが返る
                            resolve({});
                        }
                    },
                    onerror: function (error) {
                        reject(error);
                    }
                }
                )
            })
        }

        var tmpDict = await getHorseData(url);
        var horseLink = tmpDict.horseLink;
        var weightDict = tmpDict.weightDict;
        var numberDict = tmpDict.numberDict;
        var selectedDict = {};

        //--:記録されない0を置く,◎:1,丸:2,黒三角:3,三角:4,星:5,チェック:98,消:99
        function updateSelectDict(result) {
            var tmpD = {};
            for (const key in result) {
                var tmp = result[key]["_cd"].split("_")
                tmpD[tmp[0]] = tmp[1];
            }
            for (const key in this.numberDict) {
                if (this.numberDict[key] in tmpD) {
                    this.selectedDict[key] = tmpD[this.numberDict[key]];
                } else {
                    this.selectedDict[key] = "0"
                }
            }
        }
        var markDict = { selectedDict: selectedDict, numberDict: numberDict };
        cart_get_itemlist("horse_" + getParam("race_id"), updateSelectDict.bind(markDict));

        //オッズ確認
        /* Area created in the intern End */
        //これで単複オッズ及び人気を返す
        function oddsCallback(_this, _odds_status, _data) {
            ///statusがyosoの場合と、resultの場合で分岐
            if (_odds_status.status == "yoso") {
                //単勝オッズは返ってくるが、何を基準にインデックスが振られているのかわからん。
                //ぱっと見horseIdっぽい
                //horseLinkをソートすれば良さそう
                const horseLinkReverse = Object.fromEntries(Object.entries(this.horseLink).map(([key, value]) => [value, key]))
                const keys = Object.keys(horseLinkReverse);
                keys.sort();
                for (let i = 0; i < keys.length; i++) {
                    //[単勝オッズ,人気]
                    this.odds[horseLinkReverse[keys[i]]] = _odds_status.data.odds["1"][i + 1];
                }
            }
            else if (_odds_status.status == "result") {
                for (const key in this.numberDict) {
                    //[単勝オッズ,人気]
                    this.odds[key] = _odds_status.data.odds["1"][('00' + this.numberDict[key]).slice(-2)];
                }
            }

        }
        var oddsD = { odds: {}, numberDict: numberDict, horseLink: horseLink };
        await $.oddsUpdate({
            apiUrl: 'https://race.netkeiba.com/api/api_get_jra_odds.html',
            raceId: getParam("race_id"),
            isPremium: 0,
            // debugMode:true,
            // callbackApiComplete: oddsCallback.bind(oddsD)
            callbackApiOverrideView: oddsCallback.bind(oddsD)
        });


        //過去レース情報を取得
        function getHorseResult(url, horseName) {
            return new Promise((resolve, reject) => {
                GM_xmlhttpRequest({
                    url: url,
                    responseType: 'text/html',
                    overrideMimeType: "text/html; charset=euc-jp",
                    onload: function (d) {
                        var responseXML = null;
                        responseXML = new DOMParser().parseFromString(d.responseText, "text/html");
                        var raceResultTmp = {};
                        try {
                            const eachHorseResults = responseXML.getElementById('page').getElementsByClassName('db_main_race fc')[0].getElementsByClassName('db_main_deta')[0].children[1].children[1].children;
                            for (const element of eachHorseResults) {
                                const raceType = element.cells[14].innerHTML;
                                const regex = /&nbsp;/ig;
                                const time = element.cells[17].innerHTML.replace(regex, ' ');
                                if (time == ' ') {
                                    continue;
                                }
                                const agari = element.cells[22].innerHTML.replace(regex, ' ');
                                if (agari == ' ') {
                                    continue;
                                }
                                const tuuka = element.cells[20].innerHTML.replace(regex, ' ');
                                if (tuuka == ' ') {
                                    continue;
                                }
                                const tyakusa = element.cells[18].innerHTML.replace(regex, ' ');
                                if (tyakusa == ' ') {
                                    continue;
                                }
                                const date = element.cells[0].children[0].innerHTML;
                                const place = element.cells[1].children[0].innerHTML;
                                const condition = element.cells[15].innerHTML;
                                const weight = element.cells[13].innerHTML;
                                const rank = element.cells[11].innerHTML;
                                if (raceType in raceResultTmp) {
                                    raceResultTmp[raceType].push([time, agari, tuuka, tyakusa, horseName, date, place, condition, weight, rank]);
                                } else {
                                    raceResultTmp[raceType] = [[time, agari, tuuka, tyakusa, horseName, date, place, condition, weight, rank]];
                                }
                            }
                            resolve(raceResultTmp);
                        }
                        catch (e) {
                            //競走馬データがないときにTypeErrorが返る
                            resolve(raceResultTmp);
                        }
                    },
                    onerror: function (error) {
                        reject(error);
                    }
                }

                )
            })
        }

        var raceResult = {}
        var linkKeys = Object.keys(horseLink);
        const results = [];
        for (const horseName of linkKeys) {
            results.push(getHorseResult(horseLink[horseName], horseName));
        }
        const items = (await Promise.all(results));

        for (const item of items) {
            for (const raceType of Object.keys(item)) {
                for (const i of item[raceType]) {
                    if (raceType in raceResult) {
                        raceResult[raceType].push(i);
                    } else {
                        raceResult[raceType] = [i];
                    }
                }
            }
        }
        var resultKeys = Object.keys(raceResult);
        for (const raceType of resultKeys) {
            raceResult[raceType].sort();
        }




        //UIを作る

        // 親要素を選択
        // パスの取得
        let path = location.pathname
        var parent = null;
        if (path == "/race/shutuba.html") {
            parent = document.getElementById('page').getElementsByClassName('RaceColumn02')[0].getElementsByClassName('RaceTableArea')[0];
        }
        else if (path == "/odds/index.html") {
            parent = document.getElementById('page').getElementsByClassName('RaceColumn02')[0].getElementsByClassName('UmarenWrapper clearfix')[0];
        }


        //


        //ドロップダウンメニューを作成
        var selectors = document.createElement("div");
        selectors.classList.add("d-flex");
        selectors.classList.add("flex-row");
        parent.appendChild(selectors);

        var description = document.createElement('div');
        description.innerHTML = "距離:";
        description.classList.add("input-group-text");
        description.classList.add("p-2");
        description.classList.add("my-2");
        selectors.appendChild(description);

        var select = document.createElement("select");
        var linkElement = document.createElement("link");

        linkElement.type = "text/css";
        linkElement.rel = "stylesheet";
        linkElement.href = "https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css";
        select.appendChild(linkElement);
        select.classList.add("form-select");
        select.classList.add("my-2");
        select.classList.add("w-25");

        select.setAttribute("name", "コース選択");
        resultKeys.sort();
        for (const raceType of resultKeys) {
            var option = document.createElement("option");
            option.setAttribute("value", raceType);
            option.appendChild(document.createTextNode(raceType));
            select.appendChild(option);
        }
        //一番レース数が多い距離を処理値にする。
        var maxLen = -1;
        var maxLenIndex = resultKeys[0];
        for (let i = 0; i < resultKeys.length; i++) {
            if (raceResult[resultKeys[i]].length > maxLen) {
                maxLen = raceResult[resultKeys[i]].length;
                maxLenIndex = i;
            }
        }
        select.options[maxLenIndex].selected = true;
        // parent.appendChild(select);
        selectors.appendChild(select);

        var placeList = ["指定なし", "札幌", "函館", "福島", "新潟", "中山", "東京", "中京", "京都", "阪神", "小倉"];//中央の競馬場一覧
        var description = document.createElement('div');
        description.innerHTML = "開催地:";
        description.classList.add("input-group-text");
        description.classList.add("p-2");
        description.classList.add("my-2");
        selectors.appendChild(description);

        var selectP = document.createElement("select");
        selectP.classList.add("form-select");
        selectP.classList.add("my-2");
        selectP.classList.add("w-25");
        selectP.setAttribute("name", "開催地");
        for (const p of placeList) {
            var option = document.createElement("option");
            option.setAttribute("value", p);
            option.appendChild(document.createTextNode(p));
            selectP.appendChild(option);
        }
        selectors.appendChild(selectP);

        //カレンダーを追加
        var dateGroup = document.createElement('div');
        dateGroup.classList.add("input-group");
        dateGroup.classList.add("my-2");
        parent.appendChild(dateGroup);
        var description = document.createElement('span');
        description.innerHTML = "期間:";
        description.classList.add("input-group-text");
        dateGroup.appendChild(description);
        var description = document.createElement('span');
        description.innerHTML = "From:";
        description.classList.add("input-group-text");
        dateGroup.appendChild(description);
        var fromDate = document.createElement('input');
        fromDate.type = "input";
        fromDate.id = "fromDate";
        fromDate.className = "pickDate";
        const defaultFrom = new Date();
        defaultFrom.setFullYear(defaultFrom.getFullYear() - 1);
        $(fromDate).datepicker({
            changeYear: true,
            changeMonth: true,
            maxDate: new Date()
        });

        $(fromDate).datepicker("setDate", defaultFrom);
        fromDate.classList.add("form-control");
        dateGroup.appendChild(fromDate);
        var description = document.createElement('span');
        description.innerHTML = "To:";
        description.classList.add("input-group-text");
        dateGroup.appendChild(description);
        var toDate = document.createElement('input');
        toDate.classList.add("form-control");
        toDate.type = "input";
        toDate.id = "toDate";
        toDate.className = "pickDate2";
        $(toDate).datepicker({
            changeYear: true,
            changeMonth: true,
            maxDate: new Date(),
        });
        $(toDate).datepicker("setDate", new Date());
        toDate.classList.add("form-control");
        dateGroup.appendChild(toDate);

        //検索ぼたん
        //日付変更をイベントの発火点にできなかったので
        var search = document.createElement('button');
        search.innerHTML = "検索";
        search.classList.add("my-2");
        search.classList.add("btn");
        search.classList.add("btn-outline-primary");
        search.classList.add("w-100");
        parent.appendChild(search);

        //テーブル作成
        var resultTable = document.createElement("table");
        resultTable.appendChild(linkElement);
        resultTable.classList.add("table");
        //カラム生成
        var tr = document.createElement('tr');
        var columns = ["馬名", "タイム", "上り", "斤量差<br>(本レース-過去レース)", "開催", "馬場", "通過", "着順", "着差", "日付", "人気<br>(本レース)"]
        var columnIndex = [4, 0, 1, 8, 6, 7, 2, 9, 3, 5];//各カラムに入る情報がraceResultの何個目のインデックスにいるか
        for (const column of columns) {
            var th = document.createElement('th');
            // th要素内にテキストを追加
            th.innerHTML = column;
            // th要素をtr要素の子要素に追加
            tr.appendChild(th);
        }
        resultTable.appendChild(tr);
        parent.appendChild(resultTable);

        updateTableFromList(raceResult[select.value], resultTable, columnIndex, weightDict, numberDict, markDict, selectP, columns);
        function dateTransform(dt) {
            var y = dt.getFullYear();
            var m = ("00" + (dt.getMonth() + 1)).slice(-2);
            var d = ("00" + (dt.getDate())).slice(-2);
            return y + "/" + m + "/" + d;
        }
        function updateTableFromList(list, table, columnIndex, weightDict, numberDict, markDict, selectP, columns) {
            var nameIndex = -1;
            var dateIndex = -1;
            var weightIndex = -1;
            var placeIndex = -1;
            for (let i = 0; i < columns.length; i++) {
                if (~columns[i].indexOf("馬名")) {
                    nameIndex = i;
                }
                else if (~columns[i].indexOf("日付")) {
                    dateIndex = i;
                }
                else if (~columns[i].indexOf("斤量")) {
                    weightIndex = i;
                }
                else if (~columns[i].indexOf("開催")) {
                    placeIndex = i;
                }
            }
            var fromTime = dateTransform($(fromDate).datepicker("getDate"));
            var toTime = dateTransform($(toDate).datepicker("getDate"));
            while (table.rows.length > 1) table.deleteRow(-1);
            for (const l of list) {
                if ((l[columnIndex[dateIndex]] > toTime) || (l[columnIndex[dateIndex]] < fromTime)) {
                    continue;
                }
                if (selectP.value != "指定なし") {
                    if (l[columnIndex[placeIndex]].indexOf(selectP.value) == -1) {
                        continue;
                    }
                }
                var tr = document.createElement('tr');
                for (let i = 0; i < columnIndex.length; i++) {
                    var td = document.createElement('td');
                    if (i == weightIndex) {
                        td.textContent = String((weightDict[l[columnIndex[nameIndex]]] - 0) - (l[columnIndex[i]] - 0));
                    }
                    else if (i == nameIndex) {
                        var markDecode = { "0": "--", "1": "◎", "2": "⚪︎", "3": "▲", "4": "△", "5": "☆", "98": "✔️", "99": "消" }
                        var mark = markDecode[markDict.selectedDict[l[columnIndex[i]]]];
                        td.textContent = mark + "(" + numberDict[l[columnIndex[i]]] + ")" + l[columnIndex[i]];
                    }
                    else if (i == placeIndex) {
                        if (l[columnIndex[i]][0] >= "0" && l[columnIndex[i]][0] <= "9") {
                            td.textContent = l[columnIndex[i]].slice(1, -1);
                        }
                        else {
                            td.textContent = l[columnIndex[i]];
                        }
                    }
                    else {
                        td.textContent = l[columnIndex[i]];
                    }
                    tr.appendChild(td);
                }
                var tdc = document.createElement('td');
                //未来のレースだとオッズの返し方が違うらしい
                try {
                    tdc.textContent = oddsD.odds[l[columnIndex[nameIndex]]][2];
                }
                catch (e) {
                    tdc.textContent = "**"
                    //獲得できなかったことにする
                }
                tr.appendChild(tdc);
                table.appendChild(tr);
            }
        }

        select.addEventListener('change', (event) => updateTableFromList(raceResult[event.target.value], resultTable, columnIndex, weightDict, numberDict, markDict, selectP, columns));
        selectP.addEventListener('change', (event) => updateTableFromList(raceResult[select.value], resultTable, columnIndex, weightDict, numberDict, markDict, selectP, columns));
        search.addEventListener('click', () => updateTableFromList(raceResult[select.value], resultTable, columnIndex, weightDict, numberDict, markDict, selectP, columns));
    });
})();