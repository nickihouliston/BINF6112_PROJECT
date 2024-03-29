const fs = require('fs');
const Parse = require('./parse');
let config = require('../client/src/Config.json');
const dps = parseInt(config.decimal_places);

const exec = require('child_process').execSync;

exports.mapData = async function mapData(ma_json, pdbFile) {
    // const spawn = require("child_process").spawn;
    // var pythonProcess = spawn('python',['./dssp.py', pdbFile]);

    // pythonProcess.stdout.on('data', function(data) {
    //     console.log('here');
    // })
    let data = exec('python3 ./components/dssp.py "'+pdbFile+'"')

    var dssp_json = JSON.parse(data.toString());
    let sequence = dssp_json.sequence;
    // replace ambiguous aa codes so GRAVY won't throw key error
    // SS bridge Cys location markers --> Cys
    sequence = sequence.replace(/[a-z]/g, "C");
    // Asp or Asn -> Asn
    sequence = sequence.replace(/B/g, "N");
    // Gln or Glu -> Gln
    sequence = sequence.replace(/Z/g, "Q");
    // Leu or Ile -> Leu
    sequence = sequence.replace(/J/g, "L");

    let pep_length = 0;
    for (let peptide of ma_json) {
        pep_length = peptide.peptideSeq.length;
        if (pep_length > 3) break;
    }
    let chemprops_json = JSON.parse(exec('python3 ./components/chemprops.py '+ sequence.toUpperCase() + " "+pep_length).toString());
    
    let ma_json_arr = []
    ma_json.map(peptide => ma_json_arr.push(peptide));
    ma_json = ma_json_arr.filter(peptide => typeof peptide.peptideSeq === "string");
    let ma_json_raw = ma_json.slice();
    // let peptide = ma_json[145];
    // console.log(peptide);
    // console.log(peptide.peptideSeq.slice(3));
    

    let mappedData = [];
    for (let peptide of ma_json) {
        if (peptide.peptideSeq.length < 3) continue;
        let start = sequence.indexOf(peptide.peptideSeq);
        if (start >= 0) {
            // get accessible surface area (ASA) and secondary structure assignments for residues in peptide
            let asa = dssp_json.asa.slice(start, start + peptide.peptideSeq.length);
            let ss = dssp_json.ss.slice(start, start + peptide.peptideSeq.length);
            // Residue ID from dssp output
            peptide.res_id = dssp_json.res_id[start];

            // secondary structure - get mode of residue assignments
            peptide.asa = (asa.reduce((a, b) => a + b, 0)/getMaxASA(peptide.peptideSeq)).toFixed(dps);
            let mode_ss = mode(ss);
            peptide.ss = ssNames.hasOwnProperty(mode_ss) ? ssNames[mode_ss] : "-";

            // gravy and isoelectric point
            peptide.pI = chemprops_json.pI[start].toFixed(dps);
            peptide.gravy = chemprops_json.gravy[start].toFixed(dps);

            let peptideSmoothed = smoothData(peptide, ma_json_raw);
            if (config.calculateSNR) {
                peptideSmoothed.columnDisplayNames.push("Calculated SNR");
            }


            mappedData.push(peptideSmoothed);
            // console.log(peptide);
        }
    }

    mappedData = calculateRatios(mappedData);

    jsonObj = {};
    jsonObj.peptides = mappedData;
    
    jsonObj.epitopesByFile = getEpitopes(mappedData, dssp_json, sequence);
    // console.log(jsonObj);
    return jsonObj;
}

function getEpitopes(peptides, dssp_json, full_sequence) {
    peptides.sort((a, b) => a.res_id - b.res_id);

    let dataInd = config.epitopes.dataTypeColumnIndex;
    let dataThreshold = parseFloat(config.epitopes.threshold);
    let incThreshold = parseFloat(config.epitopes.relativeIncludeThreshold);

    let epitope_json = {};
    if (!peptides[0] || !peptides[0].data) return epitope_json;
    // loop through each file
    for (let d in peptides[0].data) {
        //console.log(peptides[0].data[d].file);
        
        let epitopes = peptides.map((p, ind) => {
            if (!(ind !== 0 && ind !== peptides.length - 1 &&
                // has overlapping peptides on either side
                p.res_id - peptides[ind - 1].res_id === config.overlap.amount && 
                peptides[ind + 1].res_id - p.res_id === config.overlap.amount &&
    
                // local maxima with foreground median
                parseFloat(p.data[d].columns[dataInd]) > parseFloat(peptides[ind - 1].data[d].columns[dataInd]) &&
                parseFloat(p.data[d].columns[dataInd]) > parseFloat(peptides[ind + 1].data[d].columns[dataInd]) &&
    
                // foreground median above configured threshold
                parseFloat(p.data[d].columns[dataInd]) >  dataThreshold)) return null;

                
            let seq = p.peptideSeq;
            let pos = p.res_id;

            if (parseFloat(peptides[ind - 1].data[d].columns[dataInd]) > dataThreshold
                && parseFloat(peptides[ind - 1].data[d].columns[dataInd]) > incThreshold * p.data[d].columns[dataInd]) {
                seq = peptides[ind-1].peptideSeq.slice(0, config.overlap.amount) + seq;
                // pos = peptides[ind-1].res_id;
            }

            if (parseFloat(peptides[ind + 1].data[d].columns[dataInd]) > dataThreshold
                && parseFloat(peptides[ind + 1].data[d].columns[dataInd]) > incThreshold * p.data[d].columns[dataInd]) {
                seq = seq + peptides[ind+1].peptideSeq.slice(-config.overlap.amount);
            }

            let e = {};
            e.peptideSeq = seq;
            e.res_id = pos;

            let start = full_sequence.indexOf(seq);
            // get accessible surface area (ASA) and secondary structure assignments for residues in peptide
            let asa = dssp_json.asa.slice(start, start + seq.length);
            let ss = dssp_json.ss.slice(start, start + seq.length);

            // secondary structure - get mode of residue assignments
            e.asa = (asa.reduce((a, b) => a + b, 0)/getMaxASA(seq)).toFixed(dps);
            let mode_ss = mode(ss);
            e.ss = ssNames.hasOwnProperty(mode_ss) ? ssNames[mode_ss] : "-";
            e.data = [];
            e.data.push(p.data[d]);
            e.columnDisplayNames = p.columnDisplayNames;
            
            return e;
        });

        epitopes = epitopes.filter(p => p !== null);

        let sequences = epitopes.map(p => p.peptideSeq);
        sequences = sequences.join(",");

        if (sequences) {
            let chemprops_json = JSON.parse(exec('python3 ./components/chemprops_epitopes.py '+ sequences));
            epitopes = epitopes.map((e, ind) => {
                e.gravy = chemprops_json.gravy[ind].toFixed(dps);
                e.pI = chemprops_json.pI[ind].toFixed(dps);
                return e;
            })

        }
    
        //console.log("----Epitopes----");
        //console.log(epitopes);
        //console.log("---end---");
        epitope_json[peptides[0].data[d].file] = epitopes;
    }

    // console.log(epitope_json);
    return epitope_json;
}

function smoothData(peptideRaw, ma_json) {
    let snrIncluded = !isNaN(peptideRaw.data[0].snr);
    let peptide = JSON.parse(JSON.stringify(peptideRaw));
    if (!snrIncluded) peptide.data.forEach(d => d.snr = NaN);

    let overlap = parseInt(peptide.peptideSeq.length - config.overlap.amount);
    let pBefore = ma_json.filter(p => p.peptideSeq.slice(-overlap) === peptide.peptideSeq.slice(0, overlap));
    let pAfter = ma_json.filter(p => peptide.peptideSeq.slice(-overlap) === p.peptideSeq.slice(0, overlap));

    // iterate over files
    for (let d in peptide.data) {

        for (let c in peptide.data[d].columns) {
            total_weight = config.overlap.weightCurr;

            av = peptide.data[d].columns[c] * config.overlap.weightCurr;

            if (pBefore.length === 1) {
                let p = pBefore[0];
                av += p.data[d].columns[c] * config.overlap.weightPrev;
                total_weight += config.overlap.weightPrev;
            }

            if (pAfter.length === 1) {
                let p = pAfter[0];
                av += p.data[d].columns[c] * config.overlap.weightNext;
                total_weight += config.overlap.weightNext;
            }

            peptide.data[d].columns[c] = av/total_weight;

        }

        if (config.calculateSNR) {
            total_weight = config.overlap.weightCurr;

            av = calculateSNR(peptide.data[d]) * config.overlap.weightCurr;

            if (pBefore.length === 1) {
                let p = pBefore[0];
                av += calculateSNR(p.data[d]) * config.overlap.weightPrev;
                total_weight += config.overlap.weightPrev;
            }

            if (pAfter.length === 1) {
                let p = pAfter[0];
                av += calculateSNR(p.data[d]) * config.overlap.weightNext;
                total_weight += config.overlap.weightNext;
            }

            peptide.data[d].columns.push(av/total_weight);
        }

    }
    return peptide;
}

function calculateSNR(peptideData) {
    return Math.log2(peptideData.rawMean) - Math.log2(peptideData.backgroundMean);
}

function calculateRatios(mappedData) {

    mappedData = mappedData.map(peptide => {
        // calculate SNR
        for (let d of peptide.data) {
            for (let c in d.columns) {
                d.columns[c] = d.columns[c].toFixed(dps);
            }
        }

        // Calculate ratios if two files provided
        if (peptide.data.length == 2) {
            peptide.ratios = [];

            for (let c in peptide.data[0].columns) {
                let ratio1 = peptide.data[0].columns[c]/peptide.data[1].columns[c];
                ratio1 = (!isNaN(ratio1)) ? (ratio1).toFixed(dps) : "-";
                let ratio2 = peptide.data[1].columns[c]/peptide.data[0].columns[c];
                ratio2 = (!isNaN(ratio2)) ? (ratio2).toFixed(dps) : "-";
                peptide.ratios.push( [ratio1, ratio2 ]);
            }
            // }
        }

        return peptide;
    });

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

function getMaxASA(peptideSeq) {
    let sum = 0;
    for(let aa of peptideSeq) {
        sum += maxASA[aa];
    }
    return sum
}

// function rsa(asa, peptideSeq) {
//     let sum = 0;
//     for (let i = 0; i < peptideSeq.length; i++) {
//         sum += asa[i]/maxASA[peptideSeq[i]];
//     }
//     // average rsa over residues 
//     return sum/peptideSeq.length;
// }


// Sander and Rost 1994 (same as biopython default)
maxASA = {
    "A": 106,
    "B": 160,
    "C": 135,
    "D": 163,
    "E": 194,
    "F": 197,
    "G": 84,
    "H": 184,
    "I": 169,
    "K": 205,
    "L": 164,
    "M": 188,
    "N": 157,
    "P": 136,
    "Q": 198,
    "R": 248,
    "S": 130,
    "T": 142,
    "V": 142,
    "W": 227,
    "X": 180,
    "Y": 222,
    "Z": 196
}

ssNames = {
    "-": "-",
    "H": "α-helix",
    "B": "Residues in isolated β-bridge",
    "E": "β-ladder",
    "G": "3-helix",
    "I": "5-helix",
    "T": "H-bonded turn",
    "S": "Bend"
}