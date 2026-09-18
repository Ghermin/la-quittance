(function () {
    'use strict';

    var Q = window.QuittancePdf;
    var jsPDF = window.jspdf && window.jspdf.jsPDF;
    var APP_VERSION = '1.0.0';
    var STORAGE_KEY = 'quittance-loyer.v1';
    var DEFAULT_EMAIL = {
        subject: 'Quittance de loyer - {periode} - {adresse}',
        body: 'Bonjour {locataire},\n\nVeuillez trouver ci-joint votre quittance de loyer n° {numero} pour la période du {debut} au {fin}, concernant le logement situé {adresse}.\n\nMontant réglé : {montant}.\n\nCordialement,\n{bailleur}'
    };

    function $(sel, root) {
        return (root || document).querySelector(sel);
    }

    function $$(sel, root) {
        return Array.prototype.slice.call((root || document).querySelectorAll(sel));
    }

    function esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;' }[c];
        });
    }

    function uid() {
        return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    }

    function round2(n) {
        return Math.round((Number(n) || 0) * 100) / 100;
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

    function noop() {}

    function defaultState() {
        return {
            landlord: { civility: 'M.', firstName: '', lastName: '', address: '', city: '', email: '' },
            tenants: [],
            signatures: {},
            currentSignatureId: null,
            receipts: [],
            email: { subject: DEFAULT_EMAIL.subject, body: DEFAULT_EMAIL.body }
        };
    }

    function hydrate(parsed) {
        var base = defaultState();
        base.landlord = Object.assign(base.landlord, parsed.landlord || {});
        base.email = Object.assign(base.email, parsed.email || {});
        base.tenants = Array.isArray(parsed.tenants) ? parsed.tenants : [];
        base.receipts = Array.isArray(parsed.receipts) ? parsed.receipts : [];
        base.signatures = parsed.signatures && typeof parsed.signatures === 'object' ? parsed.signatures : {};
        base.currentSignatureId = parsed.currentSignatureId || null;
        return base;
    }

    function loadState() {
        try {
            var raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return defaultState();
            return hydrate(JSON.parse(raw) || {});
        } catch (e) {
            toast('Données locales illisibles : démarrage à vide');
            return defaultState();
        }
    }

    var state = loadState();

    function save() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        } catch (e) {
            toast('Impossible d\'enregistrer : stockage du navigateur plein ?');
        }
        updateStorageInfo();
        renderHeader();
    }

    var toastTimer;
    function toast(msg) {
        var t = $('[data-toast]');
        if (!t) return;
        t.textContent = msg;
        t.hidden = false;
        clearTimeout(toastTimer);
        toastTimer = setTimeout(function () { t.hidden = true; }, 3500);
    }

    function openModal(html) {
        $('[data-modal-content]').innerHTML = html;
        $('[data-modal]').hidden = false;
        document.body.style.overflow = 'hidden';
    }

    function closeModal() {
        $('[data-modal]').hidden = true;
        $('[data-modal-content]').innerHTML = '';
        document.body.style.overflow = '';
    }

    var currentView = 'new';

    function showView(name) {
        currentView = name;
        $$('[data-view]').forEach(function (v) {
            v.hidden = v.getAttribute('data-view') !== name;
        });
        $$('[data-nav]').forEach(function (b) {
            if (b.getAttribute('data-nav') === name) b.setAttribute('aria-current', 'page');
            else b.removeAttribute('aria-current');
        });
        render();
        window.scrollTo(0, 0);
    }

    function render() {
        if (currentView === 'new') renderNew();
        else if (currentView === 'tenants') renderTenants();
        else if (currentView === 'history') renderHistory();
        else renderSettings();
    }

    function renderHeader() {
        var sub = $('[data-header-sub]');
        var name = [state.landlord.firstName, state.landlord.lastName].map(function (v) { return String(v || '').trim(); }).filter(Boolean).join(' ');
        sub.textContent = name ? 'Bailleur : ' + name : 'Bailleur à configurer';
    }

    function tenantById(id) {
        return state.tenants.find(function (t) { return t.id === id; }) || null;
    }

    function receiptById(id) {
        return state.receipts.find(function (r) { return r.id === id; }) || null;
    }

    function currentSignature() {
        return (state.currentSignatureId && state.signatures[state.currentSignatureId]) || null;
    }

    function landlordComplete() {
        var l = state.landlord;
        return !!(l.firstName.trim() && l.lastName.trim() && l.address.trim());
    }

    function nextNumber(periodStart) {
        var prefix = periodStart.slice(0, 7);
        var seq = state.receipts.filter(function (r) { return r.number.indexOf(prefix + '-') === 0; }).length + 1;
        var num;
        do {
            num = prefix + '-' + ('00' + seq).slice(-3);
            seq += 1;
        } while (state.receipts.some(function (r) { return r.number === num; }));
        return num;
    }

    function findDuplicate(tenantId, periodStart) {
        return state.receipts.find(function (r) { return r.tenantId === tenantId && r.periodStart === periodStart; }) || null;
    }

    var newForm = $('[data-form="new"]');

    function field(name) {
        return newForm.querySelector('[data-field="' + name + '"]');
    }

    function applyMonth() {
        var b = Q.monthBounds(field('month').value);
        if (!b) return;
        field('periodStart').value = b.start;
        field('periodEnd').value = b.end;
    }

    function applyTenantDefaults() {
        var t = tenantById(field('tenantId').value);
        if (!t) return;
        field('rent').value = t.rent;
        field('charges').value = t.charges;
    }

    function initNewForm() {
        var today = Q.todayISO();
        field('month').value = today.slice(0, 7);
        applyMonth();
        field('paymentDate').value = today;
        field('issueDate').value = today;
    }

    function renderNew() {
        var hasTenants = state.tenants.length > 0;
        $('[data-empty-tenants]').hidden = hasTenants;
        newForm.hidden = !hasTenants;
        var select = field('tenantId');
        var prev = select.value;
        select.innerHTML = state.tenants.map(function (t) {
            return '<option value="' + esc(t.id) + '">' + esc(Q.fullName(t)) + ' - ' + esc(firstLine(t.propertyAddress)) + '</option>';
        }).join('');
        if (prev && tenantById(prev)) {
            select.value = prev;
        } else if (hasTenants) {
            select.value = state.tenants[0].id;
            applyTenantDefaults();
        }
        if (!field('signaturePlace').value) field('signaturePlace').value = state.landlord.city || '';
        updateNewSummary();
    }

    function updateNewSummary() {
        var rent = Number(field('rent').value) || 0;
        var charges = Number(field('charges').value) || 0;
        var start = field('periodStart').value;
        $('[data-total]').textContent = Q.formatEuro(rent + charges);
        $('[data-next-number]').textContent = /^\d{4}-\d{2}-\d{2}$/.test(start) ? nextNumber(start) : '-';
        $('[data-notice-landlord]').hidden = landlordComplete();
        $('[data-notice-signature]').hidden = !!currentSignature();
        $('[data-notice-duplicate]').hidden = !findDuplicate(field('tenantId').value, start);
    }

    newForm.addEventListener('change', function (e) {
        var name = e.target.getAttribute('data-field');
        if (name === 'month') applyMonth();
        if (name === 'tenantId') applyTenantDefaults();
        updateNewSummary();
    });

    newForm.addEventListener('input', updateNewSummary);

    newForm.addEventListener('submit', function (e) {
        e.preventDefault();
        if (!jsPDF) {
            toast('Librairie PDF non chargée : recharge la page');
            return;
        }
        var tenant = tenantById(field('tenantId').value);
        if (!tenant) {
            toast('Choisis un locataire');
            return;
        }
        if (!landlordComplete()) {
            toast('Complète d\'abord les coordonnées du bailleur');
            showView('settings');
            return;
        }
        var periodStart = field('periodStart').value;
        var periodEnd = field('periodEnd').value;
        if (!periodStart || !periodEnd || periodEnd < periodStart) {
            toast('Période invalide');
            return;
        }
        if (!field('paymentDate').value || !field('issueDate').value) {
            toast('Renseigne la date de paiement et la date d\'établissement');
            return;
        }
        var rent = Number(field('rent').value);
        var charges = Number(field('charges').value);
        if (!(rent >= 0) || !(charges >= 0) || rent + charges <= 0) {
            toast('Montants invalides');
            return;
        }
        if (!currentSignature() && !window.confirm('Aucune signature enregistrée. Générer la quittance sans signature ?')) return;
        if (findDuplicate(tenant.id, periodStart) && !window.confirm('Une quittance existe déjà pour ce locataire sur cette période. En générer une nouvelle quand même ?')) return;

        var receipt = {
            id: uid(),
            number: nextNumber(periodStart),
            createdAt: new Date().toISOString(),
            tenantId: tenant.id,
            tenant: pick(tenant, ['civility', 'firstName', 'lastName', 'email', 'propertyAddress']),
            landlord: pick(state.landlord, ['civility', 'firstName', 'lastName', 'address', 'city']),
            periodStart: periodStart,
            periodEnd: periodEnd,
            paymentDate: field('paymentDate').value,
            issueDate: field('issueDate').value,
            signaturePlace: field('signaturePlace').value.trim() || state.landlord.city.trim(),
            rent: round2(rent),
            charges: round2(charges),
            signatureId: currentSignature() ? state.currentSignatureId : null
        };
        state.receipts.push(receipt);
        save();
        updateNewSummary();
        openResult(receipt);
    });

    function receiptActions(receipt, primaryLabel) {
        return '<button type="button" class="btn btn-primary" data-action="share" data-id="' + esc(receipt.id) + '">' + primaryLabel + '</button>'
            + '<button type="button" class="btn" data-action="open" data-id="' + esc(receipt.id) + '">Ouvrir le PDF</button>'
            + '<button type="button" class="btn" data-action="download" data-id="' + esc(receipt.id) + '">Télécharger le PDF</button>';
    }

    function openResult(receipt) {
        openModal(
            '<span class="badge">Quittance n° ' + esc(receipt.number) + '</span>'
            + '<h3>' + esc(Q.fullName(receipt.tenant)) + '</h3>'
            + '<p class="muted">' + esc(Q.periodLabel(receipt.periodStart, receipt.periodEnd)) + ' · ' + esc(firstLine(receipt.tenant.propertyAddress)) + '</p>'
            + '<div class="result-total">' + esc(Q.formatEuro(Q.total(receipt))) + '</div>'
            + '<p class="muted small">« Envoyer » ouvre le menu de partage Android : choisis Gmail, le PDF est déjà joint et l\'adresse du locataire est copiée dans le presse-papiers'
            + (receipt.tenant.email ? ' (' + esc(receipt.tenant.email) + ')' : ' (aucun email renseigné)') + '.</p>'
            + '<div class="result-actions">' + receiptActions(receipt, 'Envoyer la quittance')
            + '<button type="button" class="btn" data-action="close-modal">Fermer</button></div>'
        );
    }

    function renderTenants() {
        var list = $('[data-tenant-list]');
        if (!state.tenants.length) {
            list.innerHTML = '<div class="card empty"><p>Aucun locataire.</p><p class="muted small">Ajoute un locataire avec son email, l\'adresse du bien loué, le loyer et les charges.</p></div>';
            return;
        }
        list.innerHTML = state.tenants.map(function (t) {
            return '<div class="card">'
                + '<div class="list-item"><div class="list-item__main"><h3>' + esc(Q.fullName(t)) + '</h3>'
                + '<div class="item-meta">' + esc(t.email || 'Pas d\'email') + '\n' + esc(t.propertyAddress) + '</div></div>'
                + '<div class="list-item__amount">' + esc(Q.formatEuro(t.rent + t.charges)) + '</div></div>'
                + '<p class="muted small">Loyer ' + esc(Q.formatEuro(t.rent)) + ' + charges ' + esc(Q.formatEuro(t.charges)) + '</p>'
                + '<div class="item-actions">'
                + '<button type="button" class="btn btn-small" data-action="edit-tenant" data-id="' + esc(t.id) + '">Modifier</button>'
                + '<button type="button" class="btn btn-small btn-danger" data-action="delete-tenant" data-id="' + esc(t.id) + '">Supprimer</button>'
                + '</div></div>';
        }).join('');
    }

    function openTenantForm(tenant) {
        var t = tenant || { id: '', civility: 'M.', firstName: '', lastName: '', email: '', propertyAddress: '', rent: '', charges: '' };
        openModal(
            '<h3>' + (tenant ? 'Modifier le locataire' : 'Nouveau locataire') + '</h3>'
            + '<form data-form="tenant" novalidate>'
            + '<input type="hidden" name="id" value="' + esc(t.id) + '">'
            + '<div class="row2 row2--civility"><label>Civilité<select name="civility">'
            + '<option value="M.">M.</option><option value="Mme">Mme</option><option value="">Aucune</option></select></label>'
            + '<label>Prénom<input type="text" name="firstName" value="' + esc(t.firstName) + '" autocomplete="off"></label></div>'
            + '<label>Nom<input type="text" name="lastName" value="' + esc(t.lastName) + '" autocomplete="off"></label>'
            + '<label>Email<input type="email" name="email" value="' + esc(t.email) + '" inputmode="email" autocomplete="off"></label>'
            + '<label>Adresse du bien loué (une ligne par élément)<textarea name="propertyAddress" rows="3" placeholder="Appartement 1, 2e étage&#10;2 place de l&#39;Exemple&#10;00000 Villexemple">' + esc(t.propertyAddress) + '</textarea></label>'
            + '<div class="row2"><label>Loyer hors charges (€)<input type="number" name="rent" inputmode="decimal" step="0.01" min="0" value="' + esc(t.rent) + '"></label>'
            + '<label>Charges (€)<input type="number" name="charges" inputmode="decimal" step="0.01" min="0" value="' + esc(t.charges) + '"></label></div>'
            + '<div class="result-actions"><button type="submit" class="btn btn-primary">Enregistrer</button>'
            + '<button type="button" class="btn" data-action="close-modal">Annuler</button></div>'
            + '</form>'
        );
        $('[data-form="tenant"] [name="civility"]').value = t.civility;
    }

    function saveTenantForm(form) {
        var f = form.elements;
        var tenant = {
            id: f.id.value || uid(),
            civility: f.civility.value,
            firstName: f.firstName.value.trim(),
            lastName: f.lastName.value.trim(),
            email: f.email.value.trim(),
            propertyAddress: lines(f.propertyAddress.value).join('\n'),
            rent: round2(f.rent.value),
            charges: round2(f.charges.value)
        };
        if (!tenant.lastName) {
            toast('Le nom du locataire est obligatoire');
            return;
        }
        if (!tenant.propertyAddress) {
            toast('L\'adresse du bien loué est obligatoire');
            return;
        }
        if (tenant.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(tenant.email)) {
            toast('Email invalide');
            return;
        }
        if (!(Number(f.rent.value) >= 0) || !(Number(f.charges.value) >= 0)) {
            toast('Montants invalides');
            return;
        }
        var idx = state.tenants.findIndex(function (t) { return t.id === tenant.id; });
        if (idx >= 0) state.tenants[idx] = tenant;
        else state.tenants.push(tenant);
        save();
        closeModal();
        renderTenants();
        toast(idx >= 0 ? 'Locataire mis à jour' : 'Locataire ajouté');
    }

    function deleteTenant(id) {
        var t = tenantById(id);
        if (!t) return;
        if (!window.confirm('Supprimer ' + Q.fullName(t) + ' ? Les quittances déjà générées restent dans l\'historique.')) return;
        state.tenants = state.tenants.filter(function (x) { return x.id !== id; });
        save();
        renderTenants();
        toast('Locataire supprimé');
    }

    function renderHistory() {
        var filter = $('[data-history-filter]');
        var prev = filter.value;
        var seen = {};
        var options = [];
        state.receipts.forEach(function (r) {
            if (seen[r.tenantId]) return;
            seen[r.tenantId] = true;
            options.push('<option value="' + esc(r.tenantId) + '">' + esc(Q.fullName(r.tenant)) + '</option>');
        });
        filter.innerHTML = '<option value="">Tous les locataires</option>' + options.join('');
        if (prev && seen[prev]) filter.value = prev;

        var list = $('[data-receipt-list]');
        var receipts = state.receipts.slice().sort(function (a, b) { return a.createdAt < b.createdAt ? 1 : -1; })
            .filter(function (r) { return !filter.value || r.tenantId === filter.value; });
        if (!receipts.length) {
            list.innerHTML = '<div class="card empty"><p>Aucune quittance générée pour le moment.</p></div>';
            return;
        }
        list.innerHTML = receipts.map(function (r) {
            return '<div class="card">'
                + '<span class="badge">N° ' + esc(r.number) + '</span>'
                + '<div class="list-item"><div class="list-item__main"><h3>' + esc(Q.fullName(r.tenant)) + '</h3>'
                + '<div class="item-meta">' + esc(Q.periodLabel(r.periodStart, r.periodEnd)) + '\n' + esc(firstLine(r.tenant.propertyAddress))
                + '\nPayée le ' + esc(Q.formatDateShort(r.paymentDate)) + ' · établie le ' + esc(Q.formatDateShort(r.issueDate)) + '</div></div>'
                + '<div class="list-item__amount">' + esc(Q.formatEuro(Q.total(r))) + '</div></div>'
                + '<div class="item-actions">'
                + '<button type="button" class="btn btn-small btn-primary" data-action="share" data-id="' + esc(r.id) + '">Envoyer</button>'
                + '<button type="button" class="btn btn-small" data-action="open" data-id="' + esc(r.id) + '">PDF</button>'
                + '<button type="button" class="btn btn-small" data-action="download" data-id="' + esc(r.id) + '">Télécharger</button>'
                + '<button type="button" class="btn btn-small btn-danger" data-action="delete-receipt" data-id="' + esc(r.id) + '">Supprimer</button>'
                + '</div></div>';
        }).join('');
    }

    $('[data-history-filter]').addEventListener('change', renderHistory);

    function deleteReceipt(id) {
        var r = receiptById(id);
        if (!r) return;
        if (!window.confirm('Supprimer la quittance n° ' + r.number + ' de l\'historique ?')) return;
        state.receipts = state.receipts.filter(function (x) { return x.id !== id; });
        pruneSignatures();
        save();
        renderHistory();
        toast('Quittance supprimée');
    }

    function renderSettings() {
        var lf = $('[data-form="landlord"]');
        Object.keys(state.landlord).forEach(function (k) {
            if (lf.elements[k]) lf.elements[k].value = state.landlord[k] || '';
        });
        var ef = $('[data-form="email"]');
        ef.elements.subject.value = state.email.subject;
        ef.elements.body.value = state.email.body;
        renderSignatureCurrent();
        setupPad();
        $('[data-app-version]').textContent = APP_VERSION;
        updateStorageInfo();
        if (window.matchMedia('(display-mode: standalone)').matches) $('[data-install-hint]').hidden = true;
    }

    $('[data-form="landlord"]').addEventListener('input', function (e) {
        var el = e.target;
        if (!el.name || !(el.name in state.landlord)) return;
        state.landlord[el.name] = el.value;
        save();
    });

    $('[data-form="email"]').addEventListener('input', function (e) {
        var el = e.target;
        if (el.name !== 'subject' && el.name !== 'body') return;
        state.email[el.name] = el.value;
        save();
    });

    function updateStorageInfo() {
        var el = $('[data-storage-info]');
        if (!el) return;
        var bytes = (localStorage.getItem(STORAGE_KEY) || '').length * 2;
        el.textContent = state.receipts.length + ' quittance(s), ' + state.tenants.length + ' locataire(s), ' + Math.max(1, Math.round(bytes / 1024)) + ' Ko';
    }

    var pad = { canvas: $('[data-signature-pad]'), ctx: null, strokes: [], current: null, dpr: 1 };

    function stylePadContext(ctx, width) {
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.strokeStyle = '#14205a';
        ctx.fillStyle = '#14205a';
        ctx.lineWidth = width;
    }

    function drawStrokes(ctx, strokes, width) {
        stylePadContext(ctx, width);
        strokes.forEach(function (s) {
            if (s.length === 1) {
                ctx.beginPath();
                ctx.arc(s[0].x, s[0].y, width / 2, 0, Math.PI * 2);
                ctx.fill();
                return;
            }
            ctx.beginPath();
            ctx.moveTo(s[0].x, s[0].y);
            for (var i = 1; i < s.length; i += 1) ctx.lineTo(s[i].x, s[i].y);
            ctx.stroke();
        });
    }

    function redrawPad() {
        if (!pad.ctx) return;
        pad.ctx.setTransform(1, 0, 0, 1, 0, 0);
        pad.ctx.clearRect(0, 0, pad.canvas.width, pad.canvas.height);
        pad.ctx.setTransform(pad.dpr, 0, 0, pad.dpr, 0, 0);
        drawStrokes(pad.ctx, pad.strokes, 2.5);
    }

    function setupPad() {
        var c = pad.canvas;
        var rect = c.getBoundingClientRect();
        if (!rect.width) return;
        var dpr = window.devicePixelRatio || 1;
        var w = Math.round(rect.width * dpr);
        var h = Math.round(rect.height * dpr);
        if (c.width !== w || c.height !== h) {
            c.width = w;
            c.height = h;
            pad.dpr = dpr;
            pad.ctx = c.getContext('2d');
            redrawPad();
        }
    }

    function padPoint(e) {
        var r = pad.canvas.getBoundingClientRect();
        return { x: e.clientX - r.left, y: e.clientY - r.top };
    }

    pad.canvas.addEventListener('pointerdown', function (e) {
        e.preventDefault();
        setupPad();
        pad.canvas.setPointerCapture(e.pointerId);
        pad.current = [padPoint(e)];
        pad.strokes.push(pad.current);
        redrawPad();
    });

    pad.canvas.addEventListener('pointermove', function (e) {
        if (!pad.current) return;
        e.preventDefault();
        var p = padPoint(e);
        var prev = pad.current[pad.current.length - 1];
        pad.current.push(p);
        stylePadContext(pad.ctx, 2.5);
        pad.ctx.beginPath();
        pad.ctx.moveTo(prev.x, prev.y);
        pad.ctx.lineTo(p.x, p.y);
        pad.ctx.stroke();
    });

    function endStroke() {
        pad.current = null;
    }

    pad.canvas.addEventListener('pointerup', endStroke);
    pad.canvas.addEventListener('pointercancel', endStroke);

    window.addEventListener('resize', function () {
        if (currentView === 'settings') setupPad();
    });

    function clearPad() {
        pad.strokes = [];
        pad.current = null;
        redrawPad();
    }

    function saveDrawnSignature() {
        if (!pad.strokes.length) {
            toast('Signe d\'abord dans la zone');
            return;
        }
        var scale = 3;
        var margin = 10;
        var minX = Infinity;
        var minY = Infinity;
        var maxX = -Infinity;
        var maxY = -Infinity;
        pad.strokes.forEach(function (s) {
            s.forEach(function (p) {
                minX = Math.min(minX, p.x);
                minY = Math.min(minY, p.y);
                maxX = Math.max(maxX, p.x);
                maxY = Math.max(maxY, p.y);
            });
        });
        minX -= margin;
        minY -= margin;
        maxX += margin;
        maxY += margin;
        var off = document.createElement('canvas');
        off.width = Math.ceil((maxX - minX) * scale);
        off.height = Math.ceil((maxY - minY) * scale);
        var ctx = off.getContext('2d');
        ctx.setTransform(scale, 0, 0, scale, -minX * scale, -minY * scale);
        drawStrokes(ctx, pad.strokes, 2.5);
        storeSignature(off.toDataURL('image/png'));
        clearPad();
    }

    function makeWhiteTransparent(ctx, w, h) {
        var img = ctx.getImageData(0, 0, w, h);
        var d = img.data;
        for (var i = 0; i < d.length; i += 4) {
            if (d[i] > 225 && d[i + 1] > 225 && d[i + 2] > 225) d[i + 3] = 0;
        }
        ctx.putImageData(img, 0, 0);
    }

    $('[data-signature-file]').addEventListener('change', function (e) {
        var input = e.target;
        var file = input.files && input.files[0];
        if (!file) return;
        var url = URL.createObjectURL(file);
        var img = new Image();
        img.onload = function () {
            var scale = Math.min(1, 900 / img.naturalWidth);
            var off = document.createElement('canvas');
            off.width = Math.max(1, Math.round(img.naturalWidth * scale));
            off.height = Math.max(1, Math.round(img.naturalHeight * scale));
            var ctx = off.getContext('2d');
            ctx.drawImage(img, 0, 0, off.width, off.height);
            makeWhiteTransparent(ctx, off.width, off.height);
            URL.revokeObjectURL(url);
            storeSignature(off.toDataURL('image/png'));
            input.value = '';
        };
        img.onerror = function () {
            URL.revokeObjectURL(url);
            toast('Image illisible');
            input.value = '';
        };
        img.src = url;
    });

    function pruneSignatures() {
        var used = {};
        if (state.currentSignatureId) used[state.currentSignatureId] = true;
        state.receipts.forEach(function (r) {
            if (r.signatureId) used[r.signatureId] = true;
        });
        Object.keys(state.signatures).forEach(function (id) {
            if (!used[id]) delete state.signatures[id];
        });
    }

    function storeSignature(dataUrl) {
        var id = uid();
        state.signatures[id] = dataUrl;
        state.currentSignatureId = id;
        pruneSignatures();
        save();
        renderSignatureCurrent();
        toast('Signature enregistrée');
    }

    function renderSignatureCurrent() {
        var sig = currentSignature();
        var box = $('[data-signature-current]');
        box.hidden = !sig;
        if (sig) $('[data-signature-img]').src = sig;
    }

    function deleteSignature() {
        if (!currentSignature()) return;
        if (!window.confirm('Supprimer la signature en place ? Les prochaines quittances seront générées sans signature tant qu\'une nouvelle n\'est pas enregistrée.')) return;
        state.currentSignatureId = null;
        pruneSignatures();
        save();
        renderSignatureCurrent();
        toast('Signature supprimée');
    }

    function exportBackup() {
        var payload = { app: 'quittance-loyer', version: 1, exportedAt: new Date().toISOString(), data: state };
        var blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
        downloadBlob(blob, 'quittances-sauvegarde-' + Q.todayISO() + '.json');
        toast('Sauvegarde enregistrée dans les téléchargements');
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

    function importBackup(file) {
        var reader = new FileReader();
        reader.onload = function () {
            var data = parseBackup(reader.result);
            if (!data) {
                toast('Fichier de sauvegarde invalide');
                return;
            }
            var msg = 'Remplacer toutes les données actuelles par cette sauvegarde ?\n'
                + data.tenants.length + ' locataire(s), ' + data.receipts.length + ' quittance(s)'
                + (data.currentSignatureId && data.signatures[data.currentSignatureId] ? ', signature incluse' : ', sans signature') + '.';
            if (!window.confirm(msg)) return;
            state = data;
            save();
            clearPad();
            render();
            toast('Sauvegarde importée');
        };
        reader.onerror = function () {
            toast('Lecture du fichier impossible');
        };
        reader.readAsText(file);
    }

    function wipeAll() {
        if (!window.confirm('Supprimer TOUTES les données de l\'application (locataires, bailleur, signature, historique) ? Exporte une sauvegarde avant si besoin.')) return;
        state = defaultState();
        try {
            localStorage.removeItem(STORAGE_KEY);
        } catch (e) {
            toast('Suppression impossible');
        }
        clearPad();
        render();
        renderHeader();
        updateStorageInfo();
        toast('Toutes les données ont été effacées');
    }

    $('[data-backup-file]').addEventListener('change', function (e) {
        var input = e.target;
        var file = input.files && input.files[0];
        if (!file) return;
        importBackup(file);
        input.value = '';
    });

    function receiptData(r) {
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

    function makePdf(r) {
        var data = receiptData(r);
        var doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
        Q.buildReceipt(doc, data);
        return { blob: doc.output('blob'), name: Q.fileName(data) };
    }

    function renderEmail(r) {
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

    function downloadBlob(blob, name) {
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = name;
        document.body.appendChild(a);
        a.click();
        setTimeout(function () {
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }, 4000);
    }

    function openPdf(r) {
        var pdf = makePdf(r);
        var url = URL.createObjectURL(pdf.blob);
        var win = window.open(url, '_blank');
        if (!win) downloadBlob(pdf.blob, pdf.name);
        setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
    }

    function copyText(text) {
        if (!text || !navigator.clipboard) return;
        navigator.clipboard.writeText(text).catch(noop);
    }

    function mailtoUrl(r, mail) {
        return 'mailto:' + encodeURIComponent(r.tenant.email || '')
            + '?subject=' + encodeURIComponent(mail.subject)
            + '&body=' + encodeURIComponent(mail.body);
    }

    function shareReceipt(r) {
        var pdf = makePdf(r);
        var mail = renderEmail(r);
        var file = null;
        try {
            file = new File([pdf.blob], pdf.name, { type: 'application/pdf' });
        } catch (e) {
            file = null;
        }
        if (file && navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
            copyText(r.tenant.email);
            navigator.share({ files: [file], title: mail.subject, text: mail.body }).then(function () {
                toast(r.tenant.email ? 'Envoyé. Email du locataire copié : ' + r.tenant.email : 'Quittance partagée');
            }).catch(function (err) {
                if (err && err.name === 'AbortError') return;
                downloadBlob(pdf.blob, pdf.name);
                toast('Partage impossible : le PDF a été téléchargé');
            });
            return;
        }
        downloadBlob(pdf.blob, pdf.name);
        toast('Partage non disponible ici : PDF téléchargé, joins-le au mail qui s\'ouvre');
        setTimeout(function () { window.location.href = mailtoUrl(r, mail); }, 700);
    }

    var installEvent = null;

    window.addEventListener('beforeinstallprompt', function (e) {
        e.preventDefault();
        installEvent = e;
        $('[data-action="install"]').hidden = false;
        $('[data-install-hint]').hidden = true;
    });

    window.addEventListener('appinstalled', function () {
        installEvent = null;
        $('[data-action="install"]').hidden = true;
        toast('Application installée');
    });

    function promptInstall() {
        if (!installEvent) return;
        installEvent.prompt();
        installEvent.userChoice.then(function () {
            installEvent = null;
            $('[data-action="install"]').hidden = true;
        }).catch(noop);
    }

    document.addEventListener('click', function (e) {
        var nav = e.target.closest('[data-nav], [data-nav-to]');
        if (nav) {
            showView(nav.getAttribute('data-nav') || nav.getAttribute('data-nav-to'));
            return;
        }
        var btn = e.target.closest('[data-action]');
        if (!btn) return;
        var action = btn.getAttribute('data-action');
        var id = btn.getAttribute('data-id');
        var receipt = id ? receiptById(id) : null;
        switch (action) {
            case 'close-modal': closeModal(); break;
            case 'add-tenant': openTenantForm(null); break;
            case 'edit-tenant': openTenantForm(tenantById(id)); break;
            case 'delete-tenant': deleteTenant(id); break;
            case 'delete-receipt': deleteReceipt(id); break;
            case 'share': if (receipt) shareReceipt(receipt); break;
            case 'open': if (receipt) openPdf(receipt); break;
            case 'download': if (receipt) { var pdf = makePdf(receipt); downloadBlob(pdf.blob, pdf.name); } break;
            case 'signature-clear': clearPad(); break;
            case 'signature-save': saveDrawnSignature(); break;
            case 'signature-delete': deleteSignature(); break;
            case 'backup-export': exportBackup(); break;
            case 'wipe-all': wipeAll(); break;
            case 'email-reset':
                state.email = { subject: DEFAULT_EMAIL.subject, body: DEFAULT_EMAIL.body };
                save();
                renderSettings();
                toast('Modèle d\'email rétabli');
                break;
            case 'install': promptInstall(); break;
            default: break;
        }
    });

    document.addEventListener('submit', function (e) {
        if (e.target.getAttribute('data-form') === 'tenant') {
            e.preventDefault();
            saveTenantForm(e.target);
        }
    });

    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && !$('[data-modal]').hidden) closeModal();
    });

    if ('serviceWorker' in navigator && (window.location.protocol === 'https:' || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) {
        navigator.serviceWorker.register('./sw.js').catch(noop);
    }

    initNewForm();
    renderHeader();
    showView('new');
})();
