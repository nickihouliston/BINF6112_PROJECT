from Bio.SeqUtils.ProtParam import ProteinAnalysis
import json
import sys

seq = sys.argv[1]
pep_length = (int) (sys.argv[2])

pI = []
gravy = []

for i in range(len(seq) - pep_length + 1):
    pep = seq[i: i+pep_length]
    X = ProteinAnalysis(pep)
    pI.append(X.isoelectric_point())
    gravy.append(X.gravy())


load = {
    "pI": pI,
    "gravy": gravy
}

json_o = json.dumps(load)

# send back to node
print(json_o)
sys.stdout.flush()