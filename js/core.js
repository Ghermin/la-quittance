(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory(require('./pdf.js'));
    else root.QuittanceCore = factory(root.QuittancePdf);
})(typeof window !== 'undefined' ? window : globalThis, function (Q) {
    'use strict';

    var DEFAULT_EMAIL = {
        subject: 'Quittance de loyer - {periode} - {adresse}',
        body: 'Bonjour {locataire},\n\nVeuillez trouver ci-joint votre quittance de loyer n° {numero} pour la période du {debut} au {fin}, concernant le logement situé {adresse}.\n\nMontant réglé : {montant}.\n\nCordialement,\n{bailleur}'
    };

    var DEFAULT_REMINDER = { enabled: true, day: 10, hour: 9 };

    function uid() {
        return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    }

    function round2(n) {
        return Math.round((Number(n) || 0) * 100) / 100;
    }

    function pad2(n) {
        return n < 10 ? '0' + n : String(n);
    }

    function pick(obj, keys) {
        var out = {};
        keys.forEach(function (k) {
            var v = obj[k];
            out[k] = typeof v === 'string' ? v.trim() : v;
        });
        return out;
    }

    function lines(text) {
        return String(text || '').split(/\r?\n/).map(function (l) { return l.trim(); }).filter(Boolean);
    }

    function firstLine(text) {
        return lines(text)[0] || '';
    }

    function oneLine(text) {
        return lines(text).join(', ');
    }

    function defaultState() {
        return {
            landlord: { civility: 'M.', firstName: '', lastName: '', address: '', city: '', email: '' },
            tenants: [],
            signatures: {},
            currentSignatureId: null,
            receipts: [],
            email: { subject: DEFAULT_EMAIL.subject, body: DEFAULT_EMAIL.body },
            reminder: { enabled: DEFAULT_REMINDER.enabled, day: DEFAULT_REMINDER.day, hour: DEFAULT_REMINDER.hour }
        };
    }

    function hydrate(parsed) {
        var base = defaultState();
        parsed = parsed && typeof parsed === 'object' ? parsed : {};
        base.landlord = Object.assign(base.landlord, parsed.landlord || {});
        base.email = Object.assign(base.email, parsed.email || {});
        base.reminder = Object.assign(base.reminder, parsed.reminder || {});
        base.tenants = Array.isArray(parsed.tenants) ? parsed.tenants.map(function (t) {
            return Object.assign({ paymentDay: null }, t);
        }) : [];
        base.receipts = Array.isArray(parsed.receipts) ? parsed.receipts : [];
        base.signatures = parsed.signatures && typeof parsed.signatures === 'object' ? parsed.signatures : {};
        base.currentSignatureId = parsed.currentSignatureId || null;
        return base;
    }

    function backupPayload(state) {
        return { app: 'quittance-loyer', version: 1, exportedAt: new Date().toISOString(), data: state };
    }

    function parseBackup(text) {
        var obj;
        try {
            obj = JSON.parse(text);
        } catch (e) {
            return null;
        }
        var data = obj && obj.app === 'quittance-loyer' ? obj.data : obj;
        if (!data || typeof data !== 'object' || !Array.isArray(data.tenants) || !Array.isArray(data.receipts)) return null;
        return hydrate(data);
    }

    function tenantById(state, id) {
        return state.tenants.find(function (t) { return t.id === id; }) || null;
    }

    function receiptById(state, id) {
        return state.receipts.find(function (r) { return r.id === id; }) || null;
    }

    function currentSignature(state) {
        return (state.currentSignatureId && state.signatures[state.currentSignatureId]) || null;
    }

    function landlordComplete(state) {
        var l = state.landlord;
        return !!(String(l.firstName || '').trim() && String(l.lastName || '').trim() && String(l.address || '').trim());
    }

    function nextNumber(state, periodStart) {
        var prefix = periodStart.slice(0, 7);
        var seq = state.receipts.filter(function (r) { return r.number.indexOf(prefix + '-') === 0; }).length + 1;
        var num;
        do {
            num = prefix + '-' + ('00' + seq).slice(-3);
            seq += 1;
        } while (state.receipts.some(function (r) { return r.number === num; }));
        return num;
    }

    function findDuplicate(state, tenantId, periodStart) {
        return state.receipts.find(function (r) { return r.tenantId === tenantId && r.periodStart === periodStart; }) || null;
    }

    function paymentDateFor(tenant, periodStart, fallback) {
        var day = tenant ? Number(tenant.paymentDay) : 0;
        var m = /^(\d{4})-(\d{2})/.exec(periodStart || '');
        if (!(day >= 1) || !m) return fallback;
        var y = Number(m[1]);
        var mo = Number(m[2]);
        var last = new Date(y, mo, 0).getDate();
        return y + '-' + pad2(mo) + '-' + pad2(Math.min(Math.floor(day), last));
    }

    function monthStatus(state, yearMonth) {
        var bounds = Q.monthBounds(yearMonth);
        if (!bounds) return null;
        var receipts = state.receipts.filter(function (r) { return String(r.periodStart || '').slice(0, 7) === yearMonth; });
        var todo = state.tenants.filter(function (t) {
            return !receipts.some(function (r) { return r.tenantId === t.id; });
        });
        var unsent = receipts.filter(function (r) { return !r.sentAt; });
        return {
            yearMonth: yearMonth,
            bounds: bounds,
            receipts: receipts,
            todo: todo,
            unsent: unsent,
            todoTotal: round2(todo.reduce(function (s, t) { return s + Q.total(t); }, 0)),
            done: state.tenants.length > 0 && todo.length === 0 && unsent.length === 0
        };
    }

    function monthDone(state, yearMonth) {
        if (!state.tenants.length) return true;
        var ms = monthStatus(state, yearMonth);
        return !!(ms && ms.done);
    }

    function buildReceipt(state, tenant, opts) {
        return {
            id: uid(),
            number: nextNumber(state, opts.periodStart),
            createdAt: new Date().toISOString(),
            sentAt: null,
            sentVia: null,
            tenantId: tenant.id,
            tenant: pick(tenant, ['civility', 'firstName', 'lastName', 'email', 'propertyAddress']),
            landlord: pick(state.landlord, ['civility', 'firstName', 'lastName', 'address', 'city']),
            periodStart: opts.periodStart,
            periodEnd: opts.periodEnd,
            paymentDate: opts.paymentDate,
            issueDate: opts.issueDate,
            signaturePlace: String(opts.signaturePlace || state.landlord.city || '').trim(),
            rent: round2(opts.rent),
            charges: round2(opts.charges),
            signatureId: currentSignature(state) ? state.currentSignatureId : null
        };
    }

    function receiptData(state, r) {
        return {
            number: r.number,
            issueDate: r.issueDate,
            periodStart: r.periodStart,
            periodEnd: r.periodEnd,
            paymentDate: r.paymentDate,
            signaturePlace: r.signaturePlace,
            landlord: r.landlord,
            tenant: r.tenant,
            rent: r.rent,
            charges: r.charges,
            signatureDataUrl: (r.signatureId && state.signatures[r.signatureId]) || null
        };
    }

    function renderEmail(state, r) {
        var vars = {
            locataire: Q.fullName(r.tenant),
            bailleur: Q.fullName(r.landlord),
            periode: Q.isFullMonth(r.periodStart, r.periodEnd)
                ? Q.monthLabel(r.periodStart)
                : 'du ' + Q.formatDateLong(r.periodStart) + ' au ' + Q.formatDateLong(r.periodEnd),
            debut: Q.formatDateLong(r.periodStart),
            fin: Q.formatDateLong(r.periodEnd),
            adresse: oneLine(r.tenant.propertyAddress),
            montant: Q.formatEuro(Q.total(r)),
            numero: r.number
        };
        function fill(t) {
            return String(t || '').replace(/\{(\w+)\}/g, function (m, k) {
                return Object.prototype.hasOwnProperty.call(vars, k) ? vars[k] : m;
            });
        }
        return { subject: fill(state.email.subject), body: fill(state.email.body) };
    }

    function b64utf8(str) {
        if (typeof TextEncoder !== 'undefined' && typeof btoa === 'function') {
            var bytes = new TextEncoder().encode(str);
            var bin = '';
            for (var i = 0; i < bytes.length; i += 1) bin += String.fromCharCode(bytes[i]);
            return btoa(bin);
        }
        return Buffer.from(str, 'utf8').toString('base64');
    }

    function wrap76(b64) {
        return b64.replace(/.{76}/g, '$&\r\n');
    }

    function mimeHeader(text) {
        return /^[\x20-\x7e]*$/.test(text) ? text : '=?UTF-8?B?' + b64utf8(text) + '?=';
    }

    function mailbox(person) {
        if (!person || !person.email) return '';
        var name = Q.fullName(person);
        return name ? mimeHeader(name) + ' <' + person.email + '>' : person.email;
    }

    function rawMessage(state, r, pdf, opts) {
        var mail = renderEmail(state, r);
        var boundary = '----=_quittance_' + uid();
        var out = opts && opts.unsent ? ['X-Unsent: 1'] : [];
        var from = mailbox(state.landlord);
        var to = mailbox(r.tenant);
        if (from) out.push('From: ' + from);
        if (to) out.push('To: ' + to);
        out.push(
            'Subject: ' + mimeHeader(mail.subject),
            'Date: ' + new Date().toUTCString(),
            'MIME-Version: 1.0',
            'Content-Type: multipart/mixed; boundary="' + boundary + '"',
            '',
            '--' + boundary,
            'Content-Type: text/plain; charset=utf-8',
            'Content-Transfer-Encoding: base64',
            '',
            wrap76(b64utf8(mail.body)),
            '--' + boundary,
            'Content-Type: application/pdf; name="' + pdf.name + '"',
            'Content-Disposition: attachment; filename="' + pdf.name + '"',
            'Content-Transfer-Encoding: base64',
            '',
            wrap76(pdf.base64),
            '--' + boundary + '--',
            ''
        );
        return out.join('\r\n');
    }

    function validateTenant(f) {
        var paymentDay = String(f.paymentDay || '').trim();
        var tenant = {
            id: f.id || uid(),
            civility: f.civility || '',
            firstName: String(f.firstName || '').trim(),
            lastName: String(f.lastName || '').trim(),
            email: String(f.email || '').trim(),
            propertyAddress: lines(f.propertyAddress).join('\n'),
            rent: round2(f.rent),
            charges: round2(f.charges),
            paymentDay: paymentDay ? Number(paymentDay) : null
        };
        if (!tenant.lastName) return { error: 'Le nom du locataire est obligatoire' };
        if (!tenant.propertyAddress) return { error: 'L\'adresse du bien loué est obligatoire' };
        if (tenant.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(tenant.email)) return { error: 'Email invalide' };
        if (!(Number(f.rent) >= 0) || !(Number(f.charges) >= 0)) return { error: 'Montants invalides' };
        if (paymentDay && !(tenant.paymentDay >= 1 && tenant.paymentDay <= 31 && Math.floor(tenant.paymentDay) === tenant.paymentDay)) {
            return { error: 'Le jour de paiement doit être entre 1 et 31' };
        }
        return { tenant: tenant };
    }

    function periodValid(start, end) {
        return /^\d{4}-\d{2}-\d{2}$/.test(start || '') && /^\d{4}-\d{2}-\d{2}$/.test(end || '') && end >= start;
    }

    return {
        DEFAULT_EMAIL: DEFAULT_EMAIL,
        DEFAULT_REMINDER: DEFAULT_REMINDER,
        uid: uid,
        round2: round2,
        lines: lines,
        firstLine: firstLine,
        oneLine: oneLine,
        defaultState: defaultState,
        hydrate: hydrate,
        backupPayload: backupPayload,
        parseBackup: parseBackup,
        tenantById: tenantById,
        receiptById: receiptById,
        currentSignature: currentSignature,
        landlordComplete: landlordComplete,
        nextNumber: nextNumber,
        findDuplicate: findDuplicate,
        paymentDateFor: paymentDateFor,
        monthStatus: monthStatus,
        monthDone: monthDone,
        buildReceipt: buildReceipt,
        receiptData: receiptData,
        renderEmail: renderEmail,
        rawMessage: rawMessage,
        mimeHeader: mimeHeader,
        mailbox: mailbox,
        validateTenant: validateTenant,
        periodValid: periodValid
    };
});
