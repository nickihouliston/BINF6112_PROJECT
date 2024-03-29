let config = require('../client/src/Config.json')
const xlsxFile = require('read-excel-file/node');
//console.log(config)
var start = exports.parse = async function parseData(file_path){
    MicroArrData = new Array();
    let file_type = ""
    if(file_path.match(/\.gpr$/)){
        file_type = "gpr"
        var XLSX = require('xlsx')
        var workbook = XLSX.readFile(file_path);
        var sheet_name_list = workbook.SheetNames;
        var ws = workbook.Sheets[sheet_name_list[0]]
        var range = XLSX.utils.decode_range(ws['!ref']);
        range.s.r = config.gpr.rowsToSkip; // skip header rows
        ws['!ref'] = XLSX.utils.encode_range(range);
        XLSX.utils.sheet_to_json(ws)
        var xlData = XLSX.utils.sheet_to_json(ws);
        xlData.forEach(data => {
            p = {
                peptideSeq: data[JSON.parse(JSON.stringify(config.gpr.sequence))],
                proteinId:data[JSON.parse(JSON.stringify(config.gpr.name))] || "",
                // rawMean:keyMatch(data,new RegExp(config.gpr.rawMean)),
                // backgroundMean:keyMatch(data,new RegExp(config.gpr.backgroundMean)),
                // foregroundMedian:keyMatch(data,new RegExp(config.gpr.foregroundMedian)),
                // snr:keyMatch(data,new RegExp(config.gpr.snr))
                columnDisplayNames: config.gpr["column-display-names"]
            };

            columns = [];
            config.gpr["column-regex"].forEach(reg => {
                columns.push(keyMatch(data,new RegExp(reg)))
            })
            p.columns = columns;

            if (config.calculateSNR) {
                p.rawMean = keyMatch(data,new RegExp(config.gpr.calculateSNR.rawMean)),
                p.backgroundMean = keyMatch(data,new RegExp(config.gpr.calculateSNR.backgroundMean))
            }

            MicroArrData.push(p);
        })
    }else{
        file_type = "xl"
        const rows = await xlsxFile(file_path);
        for(let i = 0; i < rows.length; i++){
            MicroArrData.push({  
                peptideSeq: undefined,
                proteinId:undefined,
                rawMean:undefined,
                backgroundMean:undefined,
                // foregroundMedian:undefined,
                // snr: NaN
                columns: new Array(config.excel["column-display-names"].length),
                columnDisplayNames: config.excel["column-display-names"]
            })
        }
        let data_found = false;
        for(i in rows){
            for(j in rows[i]){
                if(rows[i][j]!=null){
                    if(String(rows[i][j]).match(new RegExp(config.excel.sequence,'ig'))){
                        data_found = true;
                        let iter = 0;
                        for(let row=Number(i)+1;row<rows.length; row++){
                            MicroArrData[iter].peptideSeq = rows[row][j]
                            iter++;
                        }
                    }else if(String(rows[i][j]).match(new RegExp(config.excel.name,'ig'))){
                        let iter=0;
                        for(let row=Number(i)+1;row<rows.length; row++){
                            MicroArrData[iter].proteinId = rows[row][j]
                            iter++;
                        }
                    }else if(config.calculateSNR && String(rows[i][j]).match(new RegExp(config.excel.calculateSNR.rawMean,'ig'))){
                        let iter=0;
                        for(let row=Number(i)+1;row<rows.length; row++){
                            MicroArrData[iter].rawMean = rows[row][j]
                            iter++;
                        }
                    } else if(config.calculateSNR && String(rows[i][j]).match(new RegExp(config.excel.calculateSNR.backgroundMean,'ig'))){
                        let iter=0;
                        for(let row=Number(i)+1;row<rows.length; row++){
                            MicroArrData[iter].backgroundMean = rows[row][j]
                            iter++;
                        }
                    } else {
                        for (let c in config.excel["column-regex"]) {
                            if (String(rows[i][j]).match(new RegExp(config.excel["column-regex"][c],'ig'))) {
                                let iter=0;
                                for(let row=Number(i)+1;row<rows.length; row++){
                                    MicroArrData[iter].columns[c] = rows[row][j];
                                    iter++;
                                }
                                break;
                            }
                        }

                    }
                    
                    // if(String(rows[i][j]).match(new RegExp(config.excel.foregroundMedian,'ig'))){
                    //     let iter=0;
                    //     for(let row=Number(i)+1;row<rows.length; row++){
                    //         MicroArrData[iter].foregroundMedian = rows[row][j]
                    //         iter++;
                    //     }
                    // }else if(String(rows[i][j]).match(new RegExp(config.excel.snr,'ig'))){
                    //     let iter=0;
                    //     for(let row=Number(i)+1;row<rows.length; row++){
                    //         MicroArrData[iter].snr = rows[row][j]
                    //         iter++;
                    //     }
                    // }
                }
            }
            if (data_found) break;
        }
    }
    

    //UnAveraged data in cleanedMad
    const cleanedMad = MicroArrData.filter(data => data.peptideSeq != undefined)
    //console.log(cleanedMad)
    //Averaging starts here
    const duplicatesort = cleanedMad.reduce((r, a) => {
        r[a.peptideSeq] = r[a.peptideSeq] || [];
        r[a.peptideSeq].push(a);
        return r;
    }, Object.create({}));
    //console.log(duplicatesort)
    //Variable holding final Averaged data
    const tripleAveragedData = [];

    Object.keys(duplicatesort).forEach(key =>{
        let ps = ""; let pi = "";let rm =0;let bm=0; let fm=0; let sr=0; let srfl=0; 
        let cols = new Array(duplicatesort[key][0].columns.length).fill(0);
        duplicatesort[key].forEach(data =>{
            if (config.calculateSNR) {
                rm += data.rawMean;
                bm += data.backgroundMean;
            }

            for (let c in data.columns) {
                cols[c] += data.columns[c];
            }
            // fm += data.foregroundMedian;
            ps = data.peptideSeq;
            pi = data.proteinId;

            // if(data.snr !== undefined && (!isNaN(data.snr) && (data.snr != null))){
            //     if(srfl == 0){sr += data.snr}
            // }else{sr=NaN;srfl=1;}

        })
        rm = rm/duplicatesort[key].length;
        bm = bm/duplicatesort[key].length;
        // fm = fm/duplicatesort[key].length;
        // if(srfl!=1){sr = sr/duplicatesort[key].length;}
        let averaged_cols = [];
        for (let c in cols) {
            averaged_cols.push(cols[c]/duplicatesort[key].length);
        }
        tripleAveragedData.push({
            peptideSeq: ps,
            proteinId: pi,
            data: [ {
                file: file_path,
                rawMean: rm,
                backgroundMean: bm,
                // foregroundMedian: fm,
                // snr:sr 
                columns: averaged_cols
            } ],
            columnDisplayNames: duplicatesort[key][0].columnDisplayNames
        })

    })
    //console.log(tripleAveragedData)
    // tripleAveragedData.forEach(pep => console.log(pep.data[0].columns))
    return tripleAveragedData;
}


function keyMatch(o,r){
    let returner = "";
    let regex = new RegExp(r);
    Object.keys(o).forEach(function(k){
        let parsedString = JSON.parse(JSON.stringify(k))
        if(parsedString.match(r)){
            returner =  o[k]
        }       
    });
    return returner;   
};



//start("./toyige.xlsx") //-> for debugging purposes

var starm = exports.parseMultiple = async function parse_multiple(file_paths) { 
    
    // let json1 = await this.parse(file_paths[0]);
    // let json2 = await this.parse(file_paths[1]);
    
    let m = new Map();

    for (let file of file_paths) {
        let json = await this.parse(file);

//the gpr files dont have Id (as in name) so I changed proteinId to peptideSequece
        json.forEach(function(pepA) {
            if (m.has(pepA.peptideSeq)) {
                m.get(pepA.peptideSeq).data.push(pepA.data[0])
            } else {
                m.set(pepA.peptideSeq, pepA);
            }
        });
    }
    //console.log(Array.from(m.values()))
    return Array.from(m.values());
}
//starm(["./toyige.xlsx","./toyige.gpr"]); //->Debugging






