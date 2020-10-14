const fs = require('fs');
const Parse = require('../src/parse#2');

async function mapData(filePath) {

    var dssp_json = JSON.parse(fs.readFileSync('./dssp.json'));
    // console.log(dssp_json);
    let sequence = dssp_json.sequence;

    let ma_json = await Parse.parse(filePath);
    
    let mappedData = [];
    for (let peptide of ma_json) {
        let start = sequence.indexOf(peptide.peptideSeq);
        if (start >= 0) {
            // console.log(peptide);
            // console.log(peptide.peptideSeq);
            let asa = dssp_json.asa.slice(start, start + peptide.peptideSeq.length);
            let ss = dssp_json.ss.slice(start, start + peptide.peptideSeq.length);
            peptide.asa = asa.reduce((a, b) => a + b, 0);
            peptide.ss = mode(ss);
            // console.log(o.asa);
            // console.log(ss);
            // console.log(o.ss);
            // break;
            mappedData.push(peptide);
        }
    }
    console.log(mappedData);
    return mappedData;
}

function mode(array) {
    let map = {};
    for (let elem of array) {
        if(!map[elem]) {
            map[elem] = 0;
        }
        map[elem]++;
    }
    let max = Object.keys(map).reduce((a, b) => (map[a] > map[b] ? a : b));
    return max;
}

(async function() {
    mapData('./ige.xlsx');
})();