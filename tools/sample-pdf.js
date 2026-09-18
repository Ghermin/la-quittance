/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { jsPDF } = require('../js/vendor/jspdf.umd.min.js');
const Q = require('../js/pdf.js');

const cases = {
    0: 'zéro', 1: 'un', 17: 'dix-sept', 21: 'vingt et un', 70: 'soixante-dix', 71: 'soixante et onze',
    72: 'soixante-douze', 77: 'soixante-dix-sept', 80: 'quatre-vingts', 81: 'quatre-vingt-un',
    90: 'quatre-vingt-dix', 91: 'quatre-vingt-onze', 99: 'quatre-vingt-dix-neuf', 100: 'cent', 101: 'cent un',
    200: 'deux cents', 201: 'deux cent un', 1000: 'mille', 1200: 'mille deux cents', 2000: 'deux mille',
    80000: 'quatre-vingt mille', 200000: 'deux cent mille', 1000000: 'un million', 2500000: 'deux millions cinq cent mille'
};
Object.keys(cases).forEach((n) => {
    assert.strictEqual(Q.nombreEnLettres(Number(n)), cases[n], `nombreEnLettres(${n})`);
});
assert.strictEqual(Q.montantEnLettres(700), 'sept cents euros');
assert.strictEqual(Q.montantEnLettres(1250.5), 'mille deux cent cinquante euros et cinquante centimes');
assert.strictEqual(Q.montantEnLettres(1.01), 'un euro et un centime');
assert.strictEqual(Q.formatEuro(1250.5), '1 250,50 €');
assert.strictEqual(Q.formatEuro(650), '650,00 €');
assert.strictEqual(Q.formatDateLong('2026-09-01'), '1er septembre 2026');
assert.strictEqual(Q.formatDateShort('2026-09-05'), '05/09/2026');
assert.deepStrictEqual(Q.monthBounds('2026-02'), { start: '2026-02-01', end: '2026-02-28' });
assert.strictEqual(Q.periodLabel('2026-09-01', '2026-09-30'), 'Mois de septembre 2026');
assert.strictEqual(Q.periodLabel('2026-09-15', '2026-09-30'), 'Période du 15 septembre 2026 au 30 septembre 2026');
console.log('unit checks OK');

const sigFile = path.join(__dirname, 'sample-signature.png');
const signature = fs.existsSync(sigFile)
    ? 'data:image/png;base64,' + fs.readFileSync(sigFile).toString('base64')
    : null;

const data = {
    number: '2026-09-001',
    issueDate: '2026-09-18',
    periodStart: '2026-09-01',
    periodEnd: '2026-09-30',
    paymentDate: '2026-09-05',
    signaturePlace: 'Villexemple',
    landlord: {
        civility: 'M.', firstName: 'Paul', lastName: 'Bailleur',
        address: '1 rue de l\'Exemple\n00000 Villexemple', city: 'Villexemple'
    },
    tenant: {
        civility: 'Mme', firstName: 'Anne', lastName: 'Locataire', email: 'locataire@example.com',
        propertyAddress: 'Appartement 1, 2e étage\n2 place de l\'Exemple\n00000 Villexemple'
    },
    rent: 650,
    charges: 50,
    signatureDataUrl: signature
};

const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
Q.buildReceipt(doc, data);
const outDir = path.join(__dirname, 'out');
fs.mkdirSync(outDir, { recursive: true });
const out = path.join(outDir, Q.fileName(data));
fs.writeFileSync(out, Buffer.from(doc.output('arraybuffer')));
console.log('wrote', out, fs.statSync(out).size, 'bytes');
