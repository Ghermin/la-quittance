const assert = require('node:assert/strict');
const path = require('node:path');
const Q = require(path.join(__dirname, '..', 'js', 'pdf.js'));
const Core = require(path.join(__dirname, '..', 'js', 'core.js'));

let count = 0;
function test(name, fn) {
    try {
        fn();
        count += 1;
    } catch (e) {
        console.error('ÉCHEC : ' + name);
        throw e;
    }
}

function tenant(over) {
    return Object.assign({
        id: 't' + Math.random().toString(36).slice(2, 6),
        civility: 'Mme', firstName: 'Marie', lastName: 'Martin', email: 'marie@example.com',
        propertyAddress: 'Appartement 2\n5 place Bellecour\n69002 Lyon', rent: 650, charges: 50, paymentDay: null
    }, over || {});
}

function stateWith(tenants, receipts) {
    const s = Core.defaultState();
    s.landlord = { civility: 'M.', firstName: 'Jean', lastName: 'Dupont', address: '12 rue des Lilas\n69003 Lyon', city: 'Lyon', email: 'jean@example.com' };
    s.tenants = tenants || [];
    s.receipts = receipts || [];
    return s;
}

test('nombres en lettres', () => {
    assert.equal(Q.nombreEnLettres(0), 'zéro');
    assert.equal(Q.nombreEnLettres(71), 'soixante et onze');
    assert.equal(Q.nombreEnLettres(80), 'quatre-vingts');
    assert.equal(Q.nombreEnLettres(200), 'deux cents');
    assert.equal(Q.nombreEnLettres(1000), 'mille');
    assert.equal(Q.nombreEnLettres(2000), 'deux mille');
    assert.equal(Q.nombreEnLettres(1234), 'mille deux cent trente-quatre');
    assert.equal(Q.montantEnLettres(700.5), 'sept cents euros et cinquante centimes');
});

test('formats de dates et de montants', () => {
    assert.equal(Q.formatEuro(1445), '1 445,00 €');
    assert.equal(Q.formatDateShort('2026-09-01'), '01/09/2026');
    assert.equal(Q.formatDateLong('2026-09-01'), '1er septembre 2026');
    assert.deepEqual(Q.monthBounds('2026-02'), { start: '2026-02-01', end: '2026-02-28' });
    assert.deepEqual(Q.monthBounds('2028-02'), { start: '2028-02-01', end: '2028-02-29' });
    assert.equal(Q.monthBounds('nimporte'), null);
    assert.equal(Q.isFullMonth('2026-09-01', '2026-09-30'), true);
    assert.equal(Q.isFullMonth('2026-09-02', '2026-09-30'), false);
});

test('numérotation séquentielle par mois, sans collision', () => {
    const s = stateWith([], [
        { number: '2026-09-001', tenantId: 'a', periodStart: '2026-09-01' },
        { number: '2026-09-003', tenantId: 'b', periodStart: '2026-09-01' }
    ]);
    assert.equal(Core.nextNumber(s, '2026-09-01'), '2026-09-004');
    assert.equal(Core.nextNumber(s, '2026-10-01'), '2026-10-001');
});

test('détection de doublon locataire + période', () => {
    const s = stateWith([], [{ id: 'r1', number: '2026-09-001', tenantId: 'a', periodStart: '2026-09-01' }]);
    assert.equal(Core.findDuplicate(s, 'a', '2026-09-01').id, 'r1');
    assert.equal(Core.findDuplicate(s, 'a', '2026-10-01'), null);
    assert.equal(Core.findDuplicate(s, 'b', '2026-09-01'), null);
});

test('date de paiement habituelle, bornée à la fin du mois', () => {
    assert.equal(Core.paymentDateFor(tenant({ paymentDay: 5 }), '2026-09-01', '2026-09-20'), '2026-09-05');
    assert.equal(Core.paymentDateFor(tenant({ paymentDay: 31 }), '2026-02-01', '2026-02-20'), '2026-02-28');
    assert.equal(Core.paymentDateFor(tenant({ paymentDay: 31 }), '2028-02-01', '2028-02-20'), '2028-02-29');
    assert.equal(Core.paymentDateFor(tenant({ paymentDay: null }), '2026-09-01', '2026-09-20'), '2026-09-20');
    assert.equal(Core.paymentDateFor(null, '2026-09-01', '2026-09-20'), '2026-09-20');
});

test('état du mois : à faire, non envoyées, terminé', () => {
    const a = tenant({ id: 'a' });
    const b = tenant({ id: 'b', rent: 800, charges: 100 });
    let s = stateWith([a, b], []);
    let ms = Core.monthStatus(s, '2026-09');
    assert.equal(ms.todo.length, 2);
    assert.equal(ms.todoTotal, 1600);
    assert.equal(ms.done, false);
    assert.equal(Core.monthDone(s, '2026-09'), false);

    const ra = Core.buildReceipt(s, a, { periodStart: '2026-09-01', periodEnd: '2026-09-30', paymentDate: '2026-09-05', issueDate: '2026-09-20', rent: 650, charges: 50 });
    s.receipts.push(ra);
    ms = Core.monthStatus(s, '2026-09');
    assert.deepEqual(ms.todo.map(t => t.id), ['b']);
    assert.equal(ms.unsent.length, 1);

    const rb = Core.buildReceipt(s, b, { periodStart: '2026-09-01', periodEnd: '2026-09-30', paymentDate: '2026-09-05', issueDate: '2026-09-20', rent: 800, charges: 100 });
    s.receipts.push(rb);
    assert.equal(rb.number, '2026-09-002');
    assert.equal(Core.monthDone(s, '2026-09'), false);
    ra.sentAt = rb.sentAt = '2026-09-20T10:00:00.000Z';
    assert.equal(Core.monthDone(s, '2026-09'), true);
    assert.equal(Core.monthDone(stateWith([], []), '2026-09'), true);
});

test('construction de quittance : instantané des parties, signature courante', () => {
    const s = stateWith([tenant({ id: 'a' })], []);
    s.signatures = { sig1: 'data:image/png;base64,AAAA' };
    s.currentSignatureId = 'sig1';
    const r = Core.buildReceipt(s, s.tenants[0], { periodStart: '2026-09-01', periodEnd: '2026-09-30', paymentDate: '2026-09-05', issueDate: '2026-09-20', rent: '650.004', charges: 50 });
    assert.equal(r.number, '2026-09-001');
    assert.equal(r.rent, 650);
    assert.equal(r.signatureId, 'sig1');
    assert.equal(r.signaturePlace, 'Lyon');
    assert.equal(r.tenant.lastName, 'Martin');
    assert.equal(r.landlord.lastName, 'Dupont');
    assert.equal(r.sentAt, null);
    assert.equal(Core.receiptData(s, r).signatureDataUrl, 'data:image/png;base64,AAAA');
});

test('modèle d\'email : variables remplacées, inconnues conservées', () => {
    const s = stateWith([tenant({ id: 'a' })], []);
    s.email.subject = 'Quittance {periode} {inconnue}';
    const r = Core.buildReceipt(s, s.tenants[0], { periodStart: '2026-09-01', periodEnd: '2026-09-30', paymentDate: '2026-09-05', issueDate: '2026-09-20', rent: 650, charges: 50 });
    const mail = Core.renderEmail(s, r);
    assert.equal(mail.subject, 'Quittance septembre 2026 {inconnue}');
    assert.match(mail.body, /Bonjour Mme Marie MARTIN,/);
    assert.match(mail.body, /700,00 €/);
    assert.match(mail.body, /M\. Jean DUPONT$/);
});

test('message RFC 822 : en-têtes, MIME, pièce jointe', () => {
    const s = stateWith([tenant({ id: 'a' })], []);
    const r = Core.buildReceipt(s, s.tenants[0], { periodStart: '2026-08-01', periodEnd: '2026-08-31', paymentDate: '2026-08-05', issueDate: '2026-08-20', rent: 650, charges: 50 });
    const raw = Core.rawMessage(s, r, { name: 'quittance.pdf', base64: Buffer.from('%PDF-1.4 test').toString('base64') }, { unsent: true });
    const lines = raw.split('\r\n');
    assert.equal(lines[0], 'X-Unsent: 1');
    assert.match(raw, /^From: M\. Jean DUPONT <jean@example\.com>$/m);
    assert.match(raw, /^To: Mme Marie MARTIN <marie@example\.com>$/m);
    assert.equal(Core.mailbox({ civility: 'M.', firstName: 'Jérôme', lastName: 'Dupont', email: 'j@example.com' }), '=?UTF-8?B?' + Buffer.from('M. Jérôme DUPONT', 'utf8').toString('base64') + '?= <j@example.com>');
    assert.equal(Core.mailbox({ firstName: '', lastName: '', email: 'x@example.com' }), 'x@example.com');
    assert.equal(Core.mailbox({ lastName: 'Sans email' }), '');
    assert.match(raw, /^Subject: =\?UTF-8\?B\?/m);
    assert.match(raw, /^Content-Type: multipart\/mixed; boundary="(----=_quittance_[a-z0-9]+)"$/m);
    assert.match(raw, /Content-Type: application\/pdf; name="quittance\.pdf"/);
    assert.match(raw, /Content-Disposition: attachment; filename="quittance\.pdf"/);
    assert.ok(raw.endsWith('--\r\n'));
    assert.ok(lines.every(l => l.length <= 998));
    assert.doesNotMatch(Core.rawMessage(s, r, { name: 'q.pdf', base64: 'QUJD' }), /X-Unsent/);
});

test('sauvegarde : format accepté, contenu invalide refusé', () => {
    const s = stateWith([tenant({ id: 'a' })], []);
    const payload = Core.backupPayload(s);
    assert.equal(payload.app, 'quittance-loyer');
    const back = Core.parseBackup(JSON.stringify(payload));
    assert.equal(back.tenants.length, 1);
    assert.equal(back.tenants[0].paymentDay, null);
    assert.equal(back.reminder.day, 10);
    assert.equal(Core.parseBackup('{"foo":1}'), null);
    assert.equal(Core.parseBackup('pas du json'), null);
    const legacy = Core.hydrate({ tenants: [{ id: 'x', lastName: 'Old' }], receipts: [] });
    assert.equal(legacy.tenants[0].paymentDay, null);
    assert.equal(legacy.reminder.enabled, true);
});

test('validation du formulaire locataire', () => {
    assert.equal(Core.validateTenant({ lastName: '', propertyAddress: 'x' }).error, 'Le nom du locataire est obligatoire');
    assert.equal(Core.validateTenant({ lastName: 'A', propertyAddress: '' }).error, 'L\'adresse du bien loué est obligatoire');
    assert.equal(Core.validateTenant({ lastName: 'A', propertyAddress: 'x', email: 'pas-un-email', rent: 1, charges: 0 }).error, 'Email invalide');
    assert.equal(Core.validateTenant({ lastName: 'A', propertyAddress: 'x', rent: -1, charges: 0 }).error, 'Montants invalides');
    assert.equal(Core.validateTenant({ lastName: 'A', propertyAddress: 'x', rent: 1, charges: 0, paymentDay: '32' }).error, 'Le jour de paiement doit être entre 1 et 31');
    const ok = Core.validateTenant({ lastName: ' Martin ', firstName: 'Marie', propertyAddress: ' a \n\n b ', rent: '650.5', charges: '0', paymentDay: '5', civility: 'Mme' });
    assert.equal(ok.tenant.lastName, 'Martin');
    assert.equal(ok.tenant.propertyAddress, 'a\nb');
    assert.equal(ok.tenant.rent, 650.5);
    assert.equal(ok.tenant.paymentDay, 5);
    assert.ok(ok.tenant.id);
    assert.equal(Core.validateTenant({ lastName: 'A', propertyAddress: 'x', rent: 1, charges: 0, paymentDay: '' }).tenant.paymentDay, null);
});

test('période valide', () => {
    assert.equal(Core.periodValid('2026-09-01', '2026-09-30'), true);
    assert.equal(Core.periodValid('2026-09-30', '2026-09-01'), false);
    assert.equal(Core.periodValid('', '2026-09-01'), false);
});

console.log(count + ' tests OK');
