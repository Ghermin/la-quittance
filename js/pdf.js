(function (root) {
    'use strict';

    var MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

    var UNITS = ['zéro', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf', 'dix', 'onze', 'douze', 'treize', 'quatorze', 'quinze', 'seize'];
    var TENS = ['', '', 'vingt', 'trente', 'quarante', 'cinquante', 'soixante', 'soixante', 'quatre-vingt', 'quatre-vingt'];

    function below100(n, noPlural) {
        if (n < 17) return UNITS[n];
        if (n < 20) return 'dix-' + UNITS[n - 10];
        var t = Math.floor(n / 10);
        var u = n % 10;
        if (t === 7 || t === 9) {
            var rest = n - (t === 7 ? 60 : 80);
            if (t === 7 && rest === 11) return 'soixante et onze';
            return TENS[t] + '-' + below100(rest, noPlural);
        }
        if (u === 0) return TENS[t] + (t === 8 && !noPlural ? 's' : '');
        if (u === 1 && t !== 8) return TENS[t] + ' et un';
        return TENS[t] + '-' + UNITS[u];
    }

    function below1000(n, noPlural) {
        var h = Math.floor(n / 100);
        var r = n % 100;
        if (h === 0) return below100(r, noPlural);
        var s = h === 1 ? 'cent' : UNITS[h] + ' cent';
        if (r === 0) return (h > 1 && !noPlural) ? s + 's' : s;
        return s + ' ' + below100(r, noPlural);
    }

    function nombreEnLettres(n) {
        n = Math.floor(Math.abs(n));
        if (n === 0) return 'zéro';
        var parts = [];
        var millions = Math.floor(n / 1e6);
        var thousands = Math.floor((n % 1e6) / 1000);
        var rest = n % 1000;
        if (millions) parts.push(millions === 1 ? 'un million' : below1000(millions) + ' millions');
        if (thousands) parts.push(thousands === 1 ? 'mille' : below1000(thousands, true) + ' mille');
        if (rest) parts.push(below1000(rest));
        return parts.join(' ');
    }

    function montantEnLettres(amount) {
        var cents = Math.round(Math.abs(amount) * 100);
        var euros = Math.floor(cents / 100);
        var c = cents % 100;
        var s = nombreEnLettres(euros) + (euros === 1 ? ' euro' : ' euros');
        if (c > 0) s += ' et ' + nombreEnLettres(c) + (c === 1 ? ' centime' : ' centimes');
        return s;
    }

    function formatEuro(amount) {
        var n = Math.round(Math.abs(Number(amount) || 0) * 100);
        var euros = String(Math.floor(n / 100));
        var cents = String(n % 100);
        if (cents.length < 2) cents = '0' + cents;
        var grouped = euros.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
        return (amount < 0 ? '-' : '') + grouped + ',' + cents + ' €';
    }

    function parseISO(iso) {
        var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
        if (!m) return null;
        return { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) };
    }

    function pad2(n) {
        return n < 10 ? '0' + n : String(n);
    }

    function toISO(y, m, d) {
        return y + '-' + pad2(m) + '-' + pad2(d);
    }

    function formatDateShort(iso) {
        var p = parseISO(iso);
        if (!p) return '';
        return pad2(p.d) + '/' + pad2(p.m) + '/' + p.y;
    }

    function formatDateLong(iso) {
        var p = parseISO(iso);
        if (!p) return '';
        return (p.d === 1 ? '1er' : String(p.d)) + ' ' + MONTHS[p.m - 1] + ' ' + p.y;
    }

    function monthLabel(iso) {
        var p = parseISO(iso);
        if (!p) return '';
        return MONTHS[p.m - 1] + ' ' + p.y;
    }

    function monthBounds(yearMonth) {
        var m = /^(\d{4})-(\d{2})$/.exec(yearMonth || '');
        if (!m) return null;
        var y = Number(m[1]);
        var mo = Number(m[2]);
        var last = new Date(y, mo, 0).getDate();
        return { start: toISO(y, mo, 1), end: toISO(y, mo, last) };
    }

    function todayISO() {
        var d = new Date();
        return toISO(d.getFullYear(), d.getMonth() + 1, d.getDate());
    }

    function isFullMonth(start, end) {
        var a = parseISO(start);
        var b = parseISO(end);
        if (!a || !b) return false;
        return a.d === 1 && a.y === b.y && a.m === b.m && b.d === new Date(b.y, b.m, 0).getDate();
    }

    function periodLabel(start, end) {
        if (isFullMonth(start, end)) return 'Mois de ' + monthLabel(start);
        return 'Période du ' + formatDateLong(start) + ' au ' + formatDateLong(end);
    }

    function fullName(person) {
        if (!person) return '';
        var parts = [];
        if (person.civility) parts.push(person.civility);
        if (person.firstName) parts.push(person.firstName);
        if (person.lastName) parts.push(String(person.lastName).toUpperCase());
        return parts.join(' ');
    }

    function splitLines(text) {
        return String(text || '').split(/\r?\n/).map(function (l) { return l.trim(); }).filter(Boolean);
    }

    function slugify(text) {
        return String(text || '')
            .normalize('NFD').replace(/[̀-ͯ]/g, '')
            .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    }

    function fileName(data) {
        var who = slugify(data.tenant && data.tenant.lastName);
        return 'quittance-loyer-' + data.number + (who ? '-' + who : '') + '.pdf';
    }

    function total(data) {
        return Math.round(((Number(data.rent) || 0) + (Number(data.charges) || 0)) * 100) / 100;
    }

    function fitImage(props, maxW, maxH) {
        var ratio = props.width / props.height;
        var w = maxW;
        var h = w / ratio;
        if (h > maxH) {
            h = maxH;
            w = h * ratio;
        }
        return { w: w, h: h };
    }

    function buildReceipt(doc, data) {
        var M = 20;
        var W = doc.internal.pageSize.getWidth();
        var H = doc.internal.pageSize.getHeight();
        var CW = W - 2 * M;
        var landlord = data.landlord || {};
        var tenant = data.tenant || {};
        var sum = total(data);
        var soussigne = landlord.civility === 'Mme' ? 'Je soussignée' : 'Je soussigné';
        var y;

        doc.setProperties({
            title: 'Quittance de loyer ' + data.number,
            subject: periodLabel(data.periodStart, data.periodEnd),
            author: fullName(landlord),
            creator: 'Quittance de loyer (app perso)'
        });

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(20);
        doc.setTextColor(30, 30, 30);
        doc.text('QUITTANCE DE LOYER', W / 2, 24, { align: 'center' });

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(12);
        doc.setTextColor(60, 60, 60);
        doc.text(periodLabel(data.periodStart, data.periodEnd), W / 2, 31.5, { align: 'center' });

        doc.setFontSize(9);
        doc.setTextColor(110, 110, 110);
        doc.text('Quittance n° ' + data.number + '   |   Établie le ' + formatDateShort(data.issueDate), W - M, 38, { align: 'right' });

        var boxW = (CW - 10) / 2;
        var leftLines = [fullName(landlord)].concat(splitLines(landlord.address));
        var rightLines = [fullName(tenant), 'Logement loué :'].concat(splitLines(tenant.propertyAddress));
        var boxH = 12 + 5 * Math.max(leftLines.length, rightLines.length) + 3;
        y = 44;

        doc.setDrawColor(200, 205, 212);
        doc.setFillColor(245, 247, 250);
        doc.setLineWidth(0.3);
        doc.roundedRect(M, y, boxW, boxH, 2, 2, 'FD');
        doc.roundedRect(M + boxW + 10, y, boxW, boxH, 2, 2, 'FD');

        function fillBox(x, title, lines) {
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(8.5);
            doc.setTextColor(31, 95, 139);
            doc.text(title, x + 4, y + 6);
            doc.setFontSize(10.5);
            doc.setTextColor(30, 30, 30);
            var ly = y + 13;
            lines.forEach(function (line, i) {
                var isLabel = line === 'Logement loué :';
                doc.setFont('helvetica', i === 0 ? 'bold' : (isLabel ? 'italic' : 'normal'));
                if (isLabel) doc.setTextColor(110, 110, 110); else doc.setTextColor(30, 30, 30);
                doc.text(line, x + 4, ly, { maxWidth: boxW - 8 });
                ly += 5;
            });
        }
        fillBox(M, 'BAILLEUR', leftLines);
        fillBox(M + boxW + 10, 'LOCATAIRE', rightLines);

        y += boxH + 12;

        var body = soussigne + ' ' + fullName(landlord) + ', propriétaire du logement désigné ci-dessus, '
            + 'déclare avoir reçu de ' + fullName(tenant) + ' la somme de ' + formatEuro(sum)
            + ' (' + montantEnLettres(sum) + ') au titre du paiement du loyer et des charges pour la période de location du '
            + formatDateLong(data.periodStart) + ' au ' + formatDateLong(data.periodEnd)
            + ', et lui en donne quittance, sous réserve de tous mes droits.';

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(11);
        doc.setTextColor(30, 30, 30);
        var bodyLines = doc.splitTextToSize(body, CW);
        doc.text(body, M, y, { maxWidth: CW, align: 'justify' });
        y += bodyLines.length * 5.3 + 8;

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(11.5);
        doc.text('Détail du règlement', M, y);
        y += 4;

        var rows = [
            ['Loyer hors charges', formatEuro(data.rent), false],
            ['Provision pour charges', formatEuro(data.charges), false],
            ['Total réglé', formatEuro(sum), true],
            ['Date du paiement', formatDateShort(data.paymentDate), false]
        ];
        var rowH = 8.5;
        doc.setLineWidth(0.3);
        doc.setDrawColor(200, 205, 212);
        rows.forEach(function (row, i) {
            var ry = y + i * rowH;
            if (row[2]) {
                doc.setFillColor(235, 241, 247);
                doc.rect(M, ry, CW, rowH, 'F');
            }
            doc.line(M, ry, M + CW, ry);
            doc.setFont('helvetica', row[2] ? 'bold' : 'normal');
            doc.setFontSize(10.5);
            doc.setTextColor(30, 30, 30);
            doc.text(row[0], M + 4, ry + 5.7);
            doc.text(row[1], M + CW - 4, ry + 5.7, { align: 'right' });
        });
        doc.line(M, y + rows.length * rowH, M + CW, y + rows.length * rowH);
        y += rows.length * rowH + 16;

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(11);
        doc.text('Fait à ' + (data.signaturePlace || landlord.city || '') + ', le ' + formatDateLong(data.issueDate), M, y);

        var sigBoxW = 70;
        var sigBoxH = 30;
        var sigX = M + CW - sigBoxW;
        var sigY = y - 6;
        doc.setDrawColor(215, 220, 226);
        doc.setLineWidth(0.2);
        doc.roundedRect(sigX, sigY, sigBoxW, sigBoxH, 1.5, 1.5, 'S');
        if (data.signatureDataUrl) {
            var props = doc.getImageProperties(data.signatureDataUrl);
            var fit = fitImage(props, sigBoxW - 6, sigBoxH - 6);
            doc.addImage(data.signatureDataUrl, 'PNG', sigX + (sigBoxW - fit.w) / 2, sigY + (sigBoxH - fit.h) / 2, fit.w, fit.h);
        }
        doc.setFontSize(8.5);
        doc.setTextColor(110, 110, 110);
        doc.text('Signature du bailleur', sigX + sigBoxW / 2, sigY + sigBoxH + 4.5, { align: 'center' });

        var footY = H - 32;
        doc.setDrawColor(200, 205, 212);
        doc.setLineWidth(0.3);
        doc.line(M, footY, M + CW, footY);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(110, 110, 110);
        var notes = [
            'Cette quittance annule tous les reçus qui auraient pu être établis précédemment en cas de paiement partiel du montant du présent terme. '
            + 'Elle est à conserver pendant trois ans par le locataire (loi n° 89-462 du 6 juillet 1989, art. 7-1).',
            'Quittance délivrée gratuitement au locataire, conformément à l\'article 21 de la loi n° 89-462 du 6 juillet 1989.'
        ];
        var ny = footY + 5;
        notes.forEach(function (note) {
            var lines = doc.splitTextToSize(note, CW);
            doc.text(note, M, ny, { maxWidth: CW, align: 'justify' });
            ny += lines.length * 3.8 + 2;
        });

        return doc;
    }

    var api = {
        MONTHS: MONTHS,
        nombreEnLettres: nombreEnLettres,
        montantEnLettres: montantEnLettres,
        formatEuro: formatEuro,
        formatDateShort: formatDateShort,
        formatDateLong: formatDateLong,
        monthLabel: monthLabel,
        monthBounds: monthBounds,
        periodLabel: periodLabel,
        isFullMonth: isFullMonth,
        todayISO: todayISO,
        fullName: fullName,
        slugify: slugify,
        fileName: fileName,
        total: total,
        buildReceipt: buildReceipt
    };

    root.QuittancePdf = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
