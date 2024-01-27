// ==UserScript==
// @name  timeComparison
// @namespace    http://tampermonkey.net/
// @version      2024-01-24
// @description  競馬のタイム比較
// @author       kojima0615
// @match        https://race.netkeiba.com/race/shutuba.html*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=netkeiba.com
// @grant GM_xmlhttpRequest
// @connect db.netkeiba.com

// ==/UserScript==


(function () {
    'use strict';
    window.addEventListener('load', async function () {

        //各馬の過去レースへのリンクを取得
        var horseLink = {};
        var popularityDict = {}
        var weightDict = {}
        var numberDict = {}
        const horse_raw = document.getElementById('page').getElementsByClassName('RaceColumn02')[0].getElementsByClassName('RaceTableArea')[0].children[0].getElementsByClassName('HorseList');
        for (const element of horse_raw) {
            const horsename = element.getElementsByClassName('HorseInfo')[0].getElementsByClassName('HorseName')[0].getElementsByTagName('a')[0];
            const popularity = element.getElementsByClassName('Popular Popular_Ninki Txt_C')[0].children[0].textContent;
            const number = element.children[1].innerHTML;
            const weight = element.children[5].innerHTML;
            horseLink[horsename.getAttribute('title')] = horsename.getAttribute('href');
            popularityDict[horsename.getAttribute('title')] = popularity;
            weightDict[horsename.getAttribute('title')] = weight;
            numberDict[horsename.getAttribute('title')] = number;
        }


        //過去レース情報を取得
        function getHorseResult(url, horseName, raceResultTmp) {
            return new Promise((resolve, reject) => {
                GM_xmlhttpRequest({
                    url: url,
                    responseType: 'text/html',
                    overrideMimeType: "text/html; charset=euc-jp",
                    onload: function (d) {
                        var responseXML = null;
                        responseXML = new DOMParser().parseFromString(d.responseText, "text/html");
                        try {
                            const eachHorseResults = responseXML.getElementById('page').getElementsByClassName('db_main_race fc')[0].getElementsByClassName('db_main_deta')[0].children[1].children[1].children;
                            for (const element of eachHorseResults) {
                                const raceType = element.cells[14].innerHTML;
                                const regex = /&nbsp;/ig;
                                const time = element.cells[17].innerHTML.replace(regex,' ');
                                if(time==' '){
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
        for (const horseName of linkKeys) {
            raceResult = await getHorseResult(horseLink[horseName], horseName, raceResult);
        }
        var resultKeys = Object.keys(raceResult);
        for (const raceType of resultKeys) {
            raceResult[raceType].sort();
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

        document.getElementById('page').getElementsByClassName('RaceColumn02')[0].getElementsByClassName('RaceTableArea')[0].appendChild(select);

        //テーブル作成
        var resultTable = document.createElement("table");
        resultTable.appendChild(linkElement);
        resultTable.classList.add("table");
        //カラム生成
        var tr = document.createElement('tr');
        var columns = ["馬名", "タイム", "日付", "開催", "馬場", "斤量差(本レース-過去レース)", "着順", "人気(本レース)"]
        var columnIndex = [1, 0, 2, 3, 4, 5, 6];//各カラムに入る情報がraceResultの何個目のインデックスにいるか
        var weightIndex = 5;
        for (const column of columns) {
            var th = document.createElement('th');
            // th要素内にテキストを追加
            th.textContent = column;
            // th要素をtr要素の子要素に追加
            tr.appendChild(th);
        }
        resultTable.appendChild(tr);
        document.getElementById('page').getElementsByClassName('RaceColumn02')[0].getElementsByClassName('RaceTableArea')[0].appendChild(resultTable);
        updateTableFromList(raceResult[resultKeys[0]], resultTable, columnIndex, weightDict, weightIndex);
        function updateTableFromList(list, table, columnIndex, weightDict, weightIndex) {
            while (table.rows.length > 1) table.deleteRow(-1);
            for (const l of list) {
                var tr = document.createElement('tr');
                for (let i = 0; i < columnIndex.length; i++) {
                    var td = document.createElement('td');
                    if (i == weightIndex) {
                        td.textContent = String((weightDict[l[1]] - 0) - (l[columnIndex[i]] - 0));
                    }
                    else {
                        td.textContent = l[columnIndex[i]];
                    }
                    tr.appendChild(td);
                }
                var tdc = document.createElement('td');
                tdc.textContent = popularityDict[l[1]];
                tr.appendChild(tdc);
                table.appendChild(tr);
            }
        }

        select.addEventListener('change', (event) => updateTableFromList(raceResult[event.target.value], resultTable, columnIndex, weightDict, weightIndex));
    });
    // Your code here...
})();