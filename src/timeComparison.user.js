// ==UserScript==
// @name  timeComparison
// @namespace    http://tampermonkey.net/
// @version      2024-01-24
// @description  競馬のタイム比較
// @author       kojima0615
// @match        https://race.netkeiba.com/race/shutuba.html*
// @match        https://race.netkeiba.com/odds/index.html*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=netkeiba.com
// @grant GM_xmlhttpRequest
// @connect db.netkeiba.com
// ==/UserScript==


(function () {
    'use strict';
    window.addEventListener('load', async function () {
        // /// 普通の関数ならこう書き変え可能
        // function sleep(ms) {
        //     return new Promise(resolve => setTimeout(resolve, ms));
        // }

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
                            var popularityDict = {}
                            var weightDict = {}
                            var numberDict = {}
                            var selectedDict = {}
                            var reverseNumberDict = {}
                            const horse_raw = responseXML.getElementById('page').getElementsByClassName('RaceColumn02')[0].getElementsByClassName('RaceTableArea')[0].children[0].getElementsByClassName('HorseList');
                            const horse_selected_raw = responseXML.getElementById('page').getElementsByClassName('RaceColumn02')[0].getElementsByClassName('RaceTableArea')[0].children[0].getElementsByClassName('HorseList Selected');
                            for (const element of horse_raw) {
                                const horsename = element.getElementsByClassName('HorseInfo')[0].getElementsByClassName('HorseName')[0].getElementsByTagName('a')[0];
                                const popularity = element.getElementsByClassName('Popular Popular_Ninki Txt_C')[0].children[0].textContent;
                                //人気が空になる
                                const number = element.children[1].innerHTML;
                                const weight = element.children[5].innerHTML;
                                horseLink[horsename.getAttribute('title')] = horsename.getAttribute('href');
                                popularityDict[horsename.getAttribute('title')] = popularity;
                                weightDict[horsename.getAttribute('title')] = weight;
                                numberDict[horsename.getAttribute('title')] = number;
                                reverseNumberDict[number] = horsename.getAttribute('title');
                                selectedDict[horsename.getAttribute('title')] = 0;
                            }
                            for (const element of horse_selected_raw) {
                                const horsename = element.getElementsByClassName('HorseInfo')[0].getElementsByClassName('HorseName')[0].getElementsByTagName('a')[0];
                                const popularity = element.getElementsByClassName('Popular Popular_Ninki Txt_C')[0].children[0].textContent;
                                //人気が空になる
                                const number = element.children[1].innerHTML;
                                const weight = element.children[5].innerHTML;
                                horseLink[horsename.getAttribute('title')] = horsename.getAttribute('href');
                                popularityDict[horsename.getAttribute('title')] = popularity;
                                weightDict[horsename.getAttribute('title')] = weight;
                                numberDict[horsename.getAttribute('title')] = number;
                                reverseNumberDict[number] = horsename.getAttribute('title');
                                selectedDict[horsename.getAttribute('title')] = 0;
                            }
                            resolve({ horseLink: horseLink, popularityDict: popularityDict, weightDict: weightDict, numberDict: numberDict, selectedDict: selectedDict, reverseNumberDict: reverseNumberDict });
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
        var popularityDict = tmpDict.popularityDict;
        var weightDict = tmpDict.weightDict;
        var numberDict = tmpDict.numberDict;
        var reverseNumberDict = tmpDict.reverseNumberDict;
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
            for (const key in this.numberDict) {
                //[単勝オッズ,人気]
                this.odds[key] = _data.odds["1"][('00' + this.numberDict[key]).slice(-2)];
            }
        }
        var oddsD = { odds: {}, numberDict: numberDict };
        await $.oddsUpdate({
            apiUrl: 'https://race.netkeiba.com/api/api_get_jra_odds.html',
            raceId: getParam("race_id"),
            isPremium: 0,
            displayDiffTime: false,
            isBrackets: false,
            compress: true,
            callbackApiComplete: oddsCallback.bind(oddsD)
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
                                const date = element.cells[0].children[0].innerHTML;
                                const place = element.cells[1].children[0].innerHTML;
                                const condition = element.cells[15].innerHTML;
                                const weight = element.cells[13].innerHTML;
                                const rank = element.cells[11].innerHTML;
                                if (raceType in raceResultTmp) {
                                    raceResultTmp[raceType].push([time, horseName, date, place, condition, weight, rank]);
                                } else {
                                    raceResultTmp[raceType] = [[time, horseName, date, place, condition, weight, rank]];
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
            //raceResult =　 getHorseResult(horseLink[horseName], horseName, raceResult);
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

        //ドロップダウンメニューを作成
        var select = document.createElement("select");
        var linkElement = document.createElement("link");

        linkElement.type = "text/css";
        linkElement.rel = "stylesheet";
        linkElement.href = "https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css";
        select.appendChild(linkElement);
        select.classList.add("form-select");
        select.classList.add("my-2");

        select.setAttribute("name", "コース選択");
        for (const raceType of resultKeys) {
            var option = document.createElement("option");
            option.setAttribute("value", raceType);
            option.appendChild(document.createTextNode(raceType));
            select.appendChild(option);
        }

        parent.appendChild(select);

        //テーブル作成
        var resultTable = document.createElement("table");
        resultTable.appendChild(linkElement);
        resultTable.classList.add("table");
        //カラム生成
        var tr = document.createElement('tr');
        //var columns = ["馬名", "タイム", "日付", "開催", "馬場", "斤量差(本レース-過去レース)", "着順", "人気(本レース)"]
        //チェックは同期していない
        var columns = ["馬名", "タイム", "日付", "開催", "馬場", "斤量差(本レース-過去レース)", "着順", "人気(本レース)"]
        var columnIndex = [1, 0, 2, 3, 4, 5, 6];//各カラムに入る情報がraceResultの何個目のインデックスにいるか
        var weightIndex = 5;
        var nameIndex = 0;
        for (const column of columns) {
            var th = document.createElement('th');
            // th要素内にテキストを追加
            th.textContent = column;
            // th要素をtr要素の子要素に追加
            tr.appendChild(th);
        }
        resultTable.appendChild(tr);
        parent.appendChild(resultTable);
        updateTableFromList(raceResult[resultKeys[0]], resultTable, columnIndex, weightDict, weightIndex, numberDict, nameIndex, markDict);
        function updateTableFromList(list, table, columnIndex, weightDict, weightIndex, numberDict, nameIndex, markDict) {
            while (table.rows.length > 1) table.deleteRow(-1);
            for (const l of list) {
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
                    else {
                        td.textContent = l[columnIndex[i]];
                    }
                    tr.appendChild(td);
                }
                var tdc = document.createElement('td');
                tdc.textContent = oddsD.odds[l[columnIndex[nameIndex]]][2];
                tr.appendChild(tdc);
                table.appendChild(tr);
            }
        }

        select.addEventListener('change', (event) => updateTableFromList(raceResult[event.target.value], resultTable, columnIndex, weightDict, weightIndex, numberDict, nameIndex, markDict));
    });
    // Your code here...
})();