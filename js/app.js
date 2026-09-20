(function () {
    'use strict';

    var Q = window.QuittancePdf;
    var Core = window.QuittanceCore;
    var Native = window.QuittanceNative;
    var jsPDF = window.jspdf && window.jspdf.jsPDF;
    var native = Native.available;
    var APP_VERSION = '1.2.0';
    var STORAGE_KEY = 'quittance-loyer.v1';
    var REMINDER_INIT_KEY = 'quittance-loyer.reminder-init';

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

    function noop() {}

    function thisMonth() {
        return Q.todayISO().slice(0, 7);
    }

    function capitalize(s) {
        return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
    }

    function plural(n, one, many) {
        return n + ' ' + (n > 1 ? many : one);
    }

    function loadState() {
        try {
            var raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return Core.defaultState();
            return Core.hydrate(JSON.parse(raw) || {});
        } catch (e) {
            toast('Données locales illisibles : démarrage à vide');
            return Core.defaultState();
        }
    }

    var state = loadState();
    var backupTimer = null;
    var lastBackupAt = null;

    function save() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        } catch (e) {
            toast('Impossible d\'enregistrer : stockage du navigateur plein ?');
        }
        updateStorageInfo();
        renderHeader();
        scheduleBackup();
    }

    function scheduleBackup() {
        if (!native) return;
        clearTimeout(backupTimer);
        backupTimer = setTimeout(function () {
            var month = thisMonth();
            var res = Native.writeBackup(JSON.stringify(Core.backupPayload(state)), Core.monthDone(state, month) ? month : '');
            if (res === 'ok') {
                lastBackupAt = new Date();
                renderBackupStatus();
            }
        }, 1200);
    }

    var toastTimer;
    var toastAction = null;

    function toast(msg, action) {
        var t = $('[data-toast]');
        if (!t) return;
        $('[data-toast-text]').textContent = msg;
        var btn = $('[data-toast-action]');
        toastAction = action || null;
        btn.hidden = !action;
        if (action) btn.textContent = action.label;
        t.hidden = false;
        clearTimeout(toastTimer);
        toastTimer = setTimeout(function () { t.hidden = true; }, action ? 8000 : 3500);
    }

    $('[data-toast-action]').addEventListener('click', function () {
        if (toastAction) toastAction.onClick();
    });

    var queue = { ids: null, title: '' };
    var resultId = null;

    function openModal(html) {
        $('[data-modal-content]').innerHTML = html;
        $('[data-modal]').hidden = false;
        document.body.style.overflow = 'hidden';
    }

    function closeModal() {
        queue.ids = null;
        resultId = null;
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
        var name = [state.landlord.firstName, state.landlord.lastName].map(function (v) { return String(v || '').trim(); }).filter(Boolean).join(' ');
        $('[data-header-sub]').textContent = name || 'Bailleur à configurer';
    }

    var newForm = $('[data-form="new"]');
    var batchForm = $('[data-form="batch"]');
    var newMode = 'single';
    var batchSel = { month: null, checked: {}, pay: {} };

    function field(name) {
        return newForm.querySelector('[data-field="' + name + '"]');
    }

    function bfield(name) {
        return batchForm.querySelector('[data-bfield="' + name + '"]');
    }

    function applyPaymentDate() {
        var t = Core.tenantById(state, field('tenantId').value);
        field('paymentDate').value = Core.paymentDateFor(t, field('periodStart').value, Q.todayISO());
    }

    function applyMonth() {
        var b = Q.monthBounds(field('month').value);
        if (!b) return;
        field('periodStart').value = b.start;
        field('periodEnd').value = b.end;
        applyPaymentDate();
    }

    function applyTenantDefaults() {
        var t = Core.tenantById(state, field('tenantId').value);
        if (!t) return;
        field('rent').value = t.rent;
        field('charges').value = t.charges;
        applyPaymentDate();
    }

    function initNewForm() {
        var today = Q.todayISO();
        field('month').value = thisMonth();
        applyMonth();
        field('paymentDate').value = today;
        field('issueDate').value = today;
        bfield('month').value = thisMonth();
        bfield('issueDate').value = today;
    }

    function setNewMode(mode) {
        newMode = mode;
        renderNew();
    }

    function renderNew() {
        var hasTenants = state.tenants.length > 0;
        $('[data-empty-tenants]').hidden = hasTenants;
        $('[data-new-tools]').hidden = !hasTenants;
        renderHero();
        if (!hasTenants) return;
        if (state.tenants.length < 2) newMode = 'single';
        $('[data-new-mode]').hidden = state.tenants.length < 2;
        $$('[data-mode]').forEach(function (b) {
            b.setAttribute('aria-pressed', b.getAttribute('data-mode') === newMode ? 'true' : 'false');
        });
        newForm.hidden = newMode !== 'single';
        batchForm.hidden = newMode !== 'batch';
        if (newMode === 'batch') renderBatch();
        var select = field('tenantId');
        var prev = select.value;
        select.innerHTML = state.tenants.map(function (t) {
            return '<option value="' + esc(t.id) + '">' + esc(Q.fullName(t)) + ' - ' + esc(Core.firstLine(t.propertyAddress)) + '</option>';
        }).join('');
        if (prev && Core.tenantById(state, prev)) {
            select.value = prev;
        } else {
            select.value = state.tenants[0].id;
            applyTenantDefaults();
        }
        if (!field('signaturePlace').value) field('signaturePlace').value = state.landlord.city || '';
        updateNewSummary();
    }

    function renderHero() {
        var box = $('[data-month-hero]');
        if (!state.tenants.length) {
            box.innerHTML = '';
            return;
        }
        var ms = Core.monthStatus(state, thisMonth());
        var title = capitalize(Q.monthLabel(ms.bounds.start));
        var html;
        if (ms.todo.length) {
            var n = ms.todo.length;
            html = '<section class="hero hero--todo">'
                + '<span class="hero__eyebrow">Ce mois</span>'
                + '<h2 class="hero__title">' + esc(title) + '</h2>'
                + '<p class="hero__lead">' + plural(n, 'quittance à faire', 'quittances à faire') + ' · ' + esc(Q.formatEuro(ms.todoTotal)) + '</p>'
                + '<ul class="chips">' + ms.todo.map(function (t) { return '<li>' + esc(Q.fullName(t)) + '</li>'; }).join('') + '</ul>'
                + (ms.receipts.length ? '<p class="hero__note">' + plural(ms.receipts.length, 'déjà générée', 'déjà générées') + (ms.unsent.length ? ', ' + plural(ms.unsent.length, 'non envoyée', 'non envoyées') : '') + '</p>' : '')
                + '<div class="hero__actions">'
                + '<button type="button" class="btn btn-hero" data-action="month-go">' + (n > 1 ? 'Générer et envoyer les ' + n + ' quittances' : 'Générer et envoyer') + '</button>'
                + '<button type="button" class="btn btn-hero-ghost" data-action="month-review">Vérifier avant</button>'
                + '</div></section>';
        } else if (ms.unsent.length) {
            html = '<section class="hero hero--wait">'
                + '<span class="hero__eyebrow">Ce mois</span>'
                + '<h2 class="hero__title">' + esc(title) + '</h2>'
                + '<p class="hero__lead">' + plural(ms.receipts.length, 'quittance générée', 'quittances générées') + ' · ' + plural(ms.unsent.length, 'reste à envoyer', 'restent à envoyer') + '</p>'
                + '<ul class="chips">' + ms.unsent.map(function (r) { return '<li>' + esc(Q.fullName(r.tenant)) + '</li>'; }).join('') + '</ul>'
                + '<div class="hero__actions">'
                + '<button type="button" class="btn btn-hero" data-action="month-send-rest">' + (ms.unsent.length > 1 ? 'Envoyer les ' + ms.unsent.length + ' restantes' : 'Envoyer la dernière') + '</button>'
                + '<button type="button" class="btn btn-hero-ghost" data-nav-to="history">Voir l\'historique</button>'
                + '</div></section>';
        } else {
            html = '<section class="hero hero--done">'
                + '<span class="hero__eyebrow">Ce mois</span>'
                + '<h2 class="hero__title">' + esc(title) + '</h2>'
                + '<p class="hero__lead">Tout est envoyé ✓ · ' + plural(ms.receipts.length, 'quittance', 'quittances') + '</p>'
                + '<p class="hero__note">Rien à faire avant le mois prochain.</p>'
                + '<div class="hero__actions">'
                + '<button type="button" class="btn btn-hero-ghost" data-nav-to="history">Voir l\'historique</button>'
                + '</div></section>';
        }
        box.innerHTML = html;
    }

    function updateNewSummary() {
        var rent = Number(field('rent').value) || 0;
        var charges = Number(field('charges').value) || 0;
        var start = field('periodStart').value;
        $('[data-total]').textContent = Q.formatEuro(rent + charges);
        $('[data-next-number]').textContent = /^\d{4}-\d{2}-\d{2}$/.test(start) ? Core.nextNumber(state, start) : '-';
        $('[data-notice-landlord]').hidden = Core.landlordComplete(state);
        $('[data-notice-signature]').hidden = !!Core.currentSignature(state);
        $('[data-notice-duplicate]').hidden = !Core.findDuplicate(state, field('tenantId').value, start);
    }

    newForm.addEventListener('change', function (e) {
        var name = e.target.getAttribute('data-field');
        if (name === 'month') applyMonth();
        if (name === 'tenantId') applyTenantDefaults();
        if (name === 'periodStart') applyPaymentDate();
        updateNewSummary();
    });

    newForm.addEventListener('input', updateNewSummary);

    function requireReady() {
        if (!jsPDF) {
            toast('Librairie PDF non chargée : recharge la page');
            return false;
        }
        if (!Core.landlordComplete(state)) {
            toast('Complète d\'abord les coordonnées du bailleur');
            showView('settings');
            return false;
        }
        return true;
    }

    newForm.addEventListener('submit', function (e) {
        e.preventDefault();
        if (!requireReady()) return;
        var tenant = Core.tenantById(state, field('tenantId').value);
        if (!tenant) {
            toast('Choisis un locataire');
            return;
        }
        var periodStart = field('periodStart').value;
        var periodEnd = field('periodEnd').value;
        if (!Core.periodValid(periodStart, periodEnd)) {
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
        if (!Core.currentSignature(state) && !window.confirm('Aucune signature enregistrée. Générer la quittance sans signature ?')) return;
        if (Core.findDuplicate(state, tenant.id, periodStart) && !window.confirm('Une quittance existe déjà pour ce locataire sur cette période. En générer une nouvelle quand même ?')) return;

        var receipt = Core.buildReceipt(state, tenant, {
            periodStart: periodStart,
            periodEnd: periodEnd,
            paymentDate: field('paymentDate').value,
            issueDate: field('issueDate').value,
            signaturePlace: field('signaturePlace').value,
            rent: rent,
            charges: charges
        });
        state.receipts.push(receipt);
        save();
        renderNew();
        openResult(receipt);
    });

    function renderBatch() {
        var month = bfield('month').value;
        var bounds = Q.monthBounds(month);
        var today = Q.todayISO();
        if (batchSel.month !== month) batchSel = { month: month, checked: {}, pay: {} };
        state.tenants.forEach(function (t) {
            if (!(t.id in batchSel.checked)) batchSel.checked[t.id] = !(bounds && Core.findDuplicate(state, t.id, bounds.start));
            if (!(t.id in batchSel.pay)) batchSel.pay[t.id] = bounds ? Core.paymentDateFor(t, bounds.start, today) : today;
        });
        if (!bfield('signaturePlace').value) bfield('signaturePlace').value = state.landlord.city || '';
        $('[data-batch-list]').innerHTML = state.tenants.map(function (t) {
            var dup = bounds && Core.findDuplicate(state, t.id, bounds.start);
            var on = !!batchSel.checked[t.id];
            return '<div class="pick' + (on ? ' is-on' : '') + '">'
                + '<label class="pick__main"><input type="checkbox" data-batch-tenant="' + esc(t.id) + '"' + (on ? ' checked' : '') + '>'
                + '<span class="pick__text"><strong>' + esc(Q.fullName(t)) + '</strong>'
                + '<span class="muted small">' + esc(Core.firstLine(t.propertyAddress)) + ' · ' + esc(Q.formatEuro(t.rent)) + ' + ' + esc(Q.formatEuro(t.charges)) + '</span>'
                + (dup ? '<span class="chip chip--warn">Déjà générée · n° ' + esc(dup.number) + '</span>' : '')
                + '</span><span class="pick__amount">' + esc(Q.formatEuro(Q.total(t))) + '</span></label>'
                + '<label class="pick__date">Payé le<input type="date" data-batch-pay="' + esc(t.id) + '" value="' + esc(batchSel.pay[t.id]) + '"></label>'
                + '</div>';
        }).join('');
        updateBatchSummary();
    }

    function selectedBatchTenants() {
        return state.tenants.filter(function (t) { return batchSel.checked[t.id]; });
    }

    function updateBatchSummary() {
        var selected = selectedBatchTenants();
        var total = selected.reduce(function (s, t) { return s + Q.total(t); }, 0);
        $('[data-batch-count]').textContent = String(selected.length);
        $('[data-batch-total]').textContent = Q.formatEuro(total);
        $('[data-bnotice-landlord]').hidden = Core.landlordComplete(state);
        $('[data-bnotice-signature]').hidden = !!Core.currentSignature(state);
        $('[data-batch-submit]').textContent = selected.length > 1 ? 'Générer les ' + selected.length + ' quittances' : 'Générer la quittance';
    }

    batchForm.addEventListener('change', function (e) {
        var cb = e.target.closest('[data-batch-tenant]');
        if (cb) {
            batchSel.checked[cb.getAttribute('data-batch-tenant')] = cb.checked;
            cb.closest('.pick').classList.toggle('is-on', cb.checked);
            updateBatchSummary();
            return;
        }
        var pay = e.target.closest('[data-batch-pay]');
        if (pay) {
            batchSel.pay[pay.getAttribute('data-batch-pay')] = pay.value;
            return;
        }
        if (e.target.getAttribute('data-bfield') === 'month') renderBatch();
    });

    function createBatch(tenants, bounds, issueDate, place, payFor) {
        return tenants.map(function (t) {
            var r = Core.buildReceipt(state, t, {
                periodStart: bounds.start,
                periodEnd: bounds.end,
                paymentDate: payFor(t),
                issueDate: issueDate,
                signaturePlace: place,
                rent: t.rent,
                charges: t.charges
            });
            state.receipts.push(r);
            return r.id;
        });
    }

    function invalidAmounts(tenants) {
        return tenants.find(function (t) { return !(t.rent >= 0) || !(t.charges >= 0) || t.rent + t.charges <= 0; });
    }

    batchForm.addEventListener('submit', function (e) {
        e.preventDefault();
        if (!requireReady()) return;
        var bounds = Q.monthBounds(bfield('month').value);
        if (!bounds) {
            toast('Mois invalide');
            return;
        }
        var issueDate = bfield('issueDate').value;
        if (!issueDate) {
            toast('Renseigne la date d\'établissement');
            return;
        }
        var selected = selectedBatchTenants();
        if (!selected.length) {
            toast('Coche au moins un locataire');
            return;
        }
        var badDate = selected.find(function (t) { return !/^\d{4}-\d{2}-\d{2}$/.test(batchSel.pay[t.id] || ''); });
        if (badDate) {
            toast('Date de paiement manquante pour ' + Q.fullName(badDate));
            return;
        }
        var invalid = invalidAmounts(selected);
        if (invalid) {
            toast('Montants invalides pour ' + Q.fullName(invalid));
            return;
        }
        var dups = selected.filter(function (t) { return Core.findDuplicate(state, t.id, bounds.start); });
        if (dups.length && !window.confirm(dups.length + ' locataire(s) ont déjà une quittance sur cette période. En générer une nouvelle quand même ?')) return;
        if (!Core.currentSignature(state) && !window.confirm('Aucune signature enregistrée. Générer les quittances sans signature ?')) return;

        var ids = createBatch(selected, bounds, issueDate, bfield('signaturePlace').value.trim(), function (t) { return batchSel.pay[t.id]; });
        save();
        batchSel.month = null;
        renderNew();
        openQueue(ids, 'Quittances de ' + Q.monthLabel(bounds.start));
    });

    function monthGenerateAndSend() {
        if (!requireReady()) return;
        var ms = Core.monthStatus(state, thisMonth());
        if (!ms || !ms.todo.length) return;
        var invalid = invalidAmounts(ms.todo);
        if (invalid) {
            toast('Montants invalides pour ' + Q.fullName(invalid) + ' : corrige la fiche locataire');
            return;
        }
        if (!Core.currentSignature(state) && !window.confirm('Aucune signature enregistrée. Générer les quittances sans signature ?')) return;
        var today = Q.todayISO();
        var ids = createBatch(ms.todo, ms.bounds, today, state.landlord.city, function (t) {
            return Core.paymentDateFor(t, ms.bounds.start, today);
        });
        save();
        batchSel.month = null;
        renderNew();
        openQueue(ids, 'Quittances de ' + Q.monthLabel(ms.bounds.start));
        var first = Core.receiptById(state, ids[0]);
        if (first) shareReceipt(first);
    }

    function monthReview() {
        newMode = 'batch';
        bfield('month').value = thisMonth();
        batchSel.month = null;
        renderNew();
        var form = $('[data-form="batch"]');
        if (form) form.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    function monthSendRest() {
        var ms = Core.monthStatus(state, thisMonth());
        if (!ms || !ms.unsent.length) return;
        openQueue(ms.unsent.map(function (r) { return r.id; }), 'Quittances de ' + Q.monthLabel(ms.bounds.start));
        shareReceipt(ms.unsent[0]);
    }

    function sendHint(receipt) {
        var who = receipt.tenant.email ? ' (' + esc(receipt.tenant.email) + ')' : ' (aucun email renseigné)';
        if (native) {
            return '« Envoyer » ouvre Gmail avec le destinataire' + who + ', l\'objet, le message et le PDF déjà en place : il ne reste qu\'à appuyer sur Envoyer dans Gmail. La quittance est alors marquée envoyée.';
        }
        return '« Envoyer » ouvre le menu de partage Android : choisis Gmail, le PDF est déjà joint et l\'adresse du locataire est copiée dans le presse-papiers' + who + '. La quittance est ensuite marquée envoyée.'
            + ' Sur ordinateur, « Email prêt à envoyer » télécharge un brouillon .eml complet (destinataire, objet, message, PDF joint).';
    }

    function queueHint() {
        if (native) return 'Chaque « Envoyer » ouvre Gmail prêt à partir : destinataire, objet, message et PDF déjà en place. Appuie sur Envoyer dans Gmail, puis reviens ici pour la suivante.';
        return 'Le partage Android n\'envoie qu\'un mail à la fois : à chaque « Envoyer », Gmail s\'ouvre avec le PDF joint et l\'adresse du locataire est copiée, colle-la dans « À ». La quittance est ensuite marquée envoyée.';
    }

    function openResult(receipt) {
        resultId = receipt.id;
        openModal(
            '<span class="chip">Quittance n° ' + esc(receipt.number) + '</span>'
            + '<h3 style="margin-top:10px">' + esc(Q.fullName(receipt.tenant)) + '</h3>'
            + '<p class="muted">' + esc(Q.periodLabel(receipt.periodStart, receipt.periodEnd)) + ' · ' + esc(Core.firstLine(receipt.tenant.propertyAddress)) + '</p>'
            + '<div class="result-total">' + esc(Q.formatEuro(Q.total(receipt))) + '</div>'
            + '<div class="status-line">' + sentStatus(receipt) + '</div>'
            + '<p class="muted small" style="margin-top:10px">' + sendHint(receipt) + '</p>'
            + '<div class="result-actions">'
            + '<button type="button" class="btn btn-primary" data-action="share" data-id="' + esc(receipt.id) + '">Envoyer la quittance</button>'
            + '<button type="button" class="btn" data-action="open" data-id="' + esc(receipt.id) + '">Ouvrir le PDF</button>'
            + '<button type="button" class="btn" data-action="download" data-id="' + esc(receipt.id) + '">Télécharger le PDF</button>'
            + '<button type="button" class="btn" data-action="eml" data-id="' + esc(receipt.id) + '">Email prêt à envoyer (.eml)</button>'
            + '<button type="button" class="btn btn-ghost" data-action="close-modal">Fermer</button></div>'
        );
    }

    function openQueue(ids, title) {
        queue.ids = ids;
        queue.title = title;
        renderQueue();
    }

    function queueReceipts() {
        return (queue.ids || []).map(function (id) { return Core.receiptById(state, id); }).filter(Boolean);
    }

    function renderQueue() {
        var receipts = queueReceipts();
        if (!receipts.length) {
            closeModal();
            return;
        }
        var pending = receipts.filter(function (r) { return !r.sentAt; });
        var total = receipts.reduce(function (s, r) { return s + Q.total(r); }, 0);
        openModal(
            '<span class="chip">' + plural(receipts.length, 'quittance', 'quittances') + ' · ' + esc(Q.formatEuro(total)) + '</span>'
            + '<h3 style="margin-top:10px">' + esc(queue.title) + '</h3>'
            + '<p class="muted small">' + queueHint() + '</p>'
            + '<div class="queue">' + receipts.map(queueRow).join('') + '</div>'
            + '<div class="result-actions">'
            + (pending.length
                ? '<button type="button" class="btn btn-primary" data-action="queue-next">Envoyer la suivante · ' + pending.length + ' restante(s)</button>'
                : '<p class="muted small">Toutes les quittances sont envoyées.</p>')
            + '<button type="button" class="btn" data-action="queue-merged">Tout en un seul PDF (' + receipts.length + ' page(s))</button>'
            + '<button type="button" class="btn btn-ghost" data-action="close-modal">Fermer</button>'
            + '</div>'
        );
    }

    function queueRow(r) {
        return '<div class="queue-row' + (r.sentAt ? ' queue-row--done' : '') + '">'
            + '<div class="queue-row__main"><strong>' + esc(Q.fullName(r.tenant)) + '</strong>'
            + '<span class="muted small">N° ' + esc(r.number) + ' · ' + esc(r.tenant.email || 'aucun email') + '</span>'
            + (r.sentAt ? '' : '<button type="button" class="link small" data-action="mark-sent" data-id="' + esc(r.id) + '">marquer envoyée</button>')
            + '</div>'
            + (r.sentAt
                ? '<span class="chip chip--ok">Envoyée</span>'
                : '<button type="button" class="btn btn-small btn-primary" data-action="share" data-id="' + esc(r.id) + '">Envoyer</button>')
            + '<button type="button" class="btn btn-small" data-action="open" data-id="' + esc(r.id) + '">PDF</button>'
            + '</div>';
    }

    function renderTenants() {
        var list = $('[data-tenant-list]');
        if (!state.tenants.length) {
            list.innerHTML = '<div class="card empty"><p>Aucun locataire</p><p class="muted small">Ajoute un locataire avec son email, l\'adresse du bien loué, le loyer et les charges.</p></div>';
            return;
        }
        list.innerHTML = state.tenants.map(function (t) {
            return '<div class="card">'
                + '<div class="list-item"><div class="list-item__main"><h3>' + esc(Q.fullName(t)) + '</h3>'
                + '<div class="item-meta">' + esc(t.email || 'Pas d\'email') + '\n' + esc(t.propertyAddress) + '</div></div>'
                + '<div class="list-item__amount">' + esc(Q.formatEuro(Q.total(t))) + '</div></div>'
                + '<div class="status-line"><span class="chip chip--muted">Loyer ' + esc(Q.formatEuro(t.rent)) + ' + charges ' + esc(Q.formatEuro(t.charges)) + '</span>'
                + (t.paymentDay ? '<span class="chip chip--muted">Paie le ' + esc(t.paymentDay) + '</span>' : '') + '</div>'
                + '<div class="item-actions">'
                + '<button type="button" class="btn btn-small" data-action="edit-tenant" data-id="' + esc(t.id) + '">Modifier</button>'
                + '<button type="button" class="btn btn-small btn-danger" data-action="delete-tenant" data-id="' + esc(t.id) + '">Supprimer</button>'
                + '</div></div>';
        }).join('');
    }

    function openTenantForm(tenant) {
        var t = tenant || { id: '', civility: 'M.', firstName: '', lastName: '', email: '', propertyAddress: '', rent: '', charges: '', paymentDay: null };
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
            + '<label>Jour de paiement habituel (optionnel)<input type="number" name="paymentDay" inputmode="numeric" min="1" max="31" placeholder="ex. 5" value="' + esc(t.paymentDay || '') + '"></label>'
            + '<p class="muted small">Pré-remplit la date de paiement chaque mois ; sinon la date du jour est utilisée.</p>'
            + '<div class="result-actions"><button type="submit" class="btn btn-primary">Enregistrer</button>'
            + '<button type="button" class="btn btn-ghost" data-action="close-modal">Annuler</button></div>'
            + '</form>'
        );
        $('[data-form="tenant"] [name="civility"]').value = t.civility;
    }

    function saveTenantForm(form) {
        var f = form.elements;
        var res = Core.validateTenant({
            id: f.id.value,
            civility: f.civility.value,
            firstName: f.firstName.value,
            lastName: f.lastName.value,
            email: f.email.value,
            propertyAddress: f.propertyAddress.value,
            rent: f.rent.value,
            charges: f.charges.value,
            paymentDay: f.paymentDay.value
        });
        if (res.error) {
            toast(res.error);
            return;
        }
        var idx = state.tenants.findIndex(function (t) { return t.id === res.tenant.id; });
        if (idx >= 0) state.tenants[idx] = res.tenant;
        else state.tenants.push(res.tenant);
        save();
        closeModal();
        renderTenants();
        toast(idx >= 0 ? 'Locataire mis à jour' : 'Locataire ajouté');
    }

    function deleteTenant(id) {
        var t = Core.tenantById(state, id);
        if (!t) return;
        if (!window.confirm('Supprimer ' + Q.fullName(t) + ' ? Les quittances déjà générées restent dans l\'historique.')) return;
        state.tenants = state.tenants.filter(function (x) { return x.id !== id; });
        save();
        renderTenants();
        toast('Locataire supprimé');
    }

    function unsentReceipts() {
        return state.receipts.filter(function (r) { return r.sentAt === null; });
    }

    function sentStatus(r) {
        if (r.sentAt) {
            return '<span class="chip chip--ok">Envoyée le ' + esc(Q.formatDateShort(r.sentAt.slice(0, 10))) + '</span>'
                + '<button type="button" class="link small" data-action="mark-unsent" data-id="' + esc(r.id) + '">marquer non envoyée</button>';
        }
        return (r.sentAt === null ? '<span class="chip chip--warn">Non envoyée</span>' : '')
            + '<button type="button" class="link small" data-action="mark-sent" data-id="' + esc(r.id) + '">marquer envoyée</button>';
    }

    function renderHistory() {
        var pending = unsentReceipts();
        $('[data-history-queue]').innerHTML = pending.length
            ? '<button type="button" class="btn btn-primary btn-block history-queue" data-action="history-queue">Envoyer les ' + plural(pending.length, 'quittance non envoyée', 'quittances non envoyées') + '</button>'
            : '';

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
            list.innerHTML = '<div class="card empty"><p>Aucune quittance</p><p class="muted small">Les quittances générées apparaîtront ici.</p></div>';
            return;
        }
        list.innerHTML = receipts.map(function (r) {
            return '<div class="card">'
                + '<span class="chip">N° ' + esc(r.number) + '</span>'
                + '<div class="list-item" style="margin-top:8px"><div class="list-item__main"><h3>' + esc(Q.fullName(r.tenant)) + '</h3>'
                + '<div class="item-meta">' + esc(Q.periodLabel(r.periodStart, r.periodEnd)) + '\n' + esc(Core.firstLine(r.tenant.propertyAddress))
                + '\nPayée le ' + esc(Q.formatDateShort(r.paymentDate)) + ' · établie le ' + esc(Q.formatDateShort(r.issueDate)) + '</div></div>'
                + '<div class="list-item__amount">' + esc(Q.formatEuro(Q.total(r))) + '</div></div>'
                + '<div class="status-line">' + sentStatus(r) + '</div>'
                + '<div class="item-actions">'
                + '<button type="button" class="btn btn-small btn-primary" data-action="share" data-id="' + esc(r.id) + '">Envoyer</button>'
                + '<button type="button" class="btn btn-small" data-action="open" data-id="' + esc(r.id) + '">PDF</button>'
                + '<button type="button" class="btn btn-small" data-action="download" data-id="' + esc(r.id) + '">Télécharger</button>'
                + '<button type="button" class="btn btn-small" data-action="eml" data-id="' + esc(r.id) + '">Email (.eml)</button>'
                + '<button type="button" class="btn btn-small btn-danger" data-action="delete-receipt" data-id="' + esc(r.id) + '">Supprimer</button>'
                + '</div></div>';
        }).join('');
    }

    $('[data-history-filter]').addEventListener('change', renderHistory);

    function deleteReceipt(id) {
        var r = Core.receiptById(state, id);
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
        renderReminder();
        renderBackupStatus();
        $('[data-app-version]').textContent = APP_VERSION + (native ? ' · Android ' + Native.version() : '');
        updateStorageInfo();
        renderAndroidCard();
        if (window.matchMedia('(display-mode: standalone)').matches) $('[data-install-hint]').hidden = true;
    }

    function renderAndroidCard() {
        var isAndroid = /Android/i.test(navigator.userAgent);
        $('[data-android-card]').hidden = !(native || isAndroid);
        $('[data-android-link]').hidden = !!native;
        if (native) {
            $('[data-android-text]').textContent = 'Application Android : « Envoyer » ouvre Gmail avec le destinataire, l\'objet, le message et le PDF déjà en place.';
            $('[data-install-hint]').hidden = true;
            $('[data-action="install"]').hidden = true;
        } else if (isAndroid) {
            $('[data-android-text]').textContent = 'Avec l\'application Android, « Envoyer » ouvre Gmail avec le destinataire, l\'objet, le message et le PDF déjà en place : plus rien à coller. Elle sauvegarde aussi tes données automatiquement et te rappelle chaque mois. Après le téléchargement, ouvre le fichier et autorise l\'installation depuis Chrome (une seule fois). Les données ne passent pas toutes seules d\'une version à l\'autre : exporte une sauvegarde ici, puis importe-la dans l\'application.';
        }
    }

    function formatDateTime(ms) {
        var d = new Date(Number(ms));
        if (!ms || isNaN(d.getTime())) return '';
        var pad = function (n) { return n < 10 ? '0' + n : String(n); };
        return Q.formatDateLong(d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate())) + ' à ' + d.getHours() + ' h' + (d.getMinutes() ? pad(d.getMinutes()) : '');
    }

    function renderReminder() {
        $('[data-reminder-section]').hidden = !native;
        if (!native) return;
        var r = state.reminder;
        $('[data-reminder-enabled]').checked = !!r.enabled;
        $('[data-reminder-day]').value = r.day;
        $('[data-reminder-hour]').value = r.hour;
        $('[data-reminder-day]').disabled = !r.enabled;
        $('[data-reminder-hour]').disabled = !r.enabled;
        var st = Native.reminderStatus() || {};
        var status = $('[data-reminder-status]');
        var permBtn = $('[data-action="notif-settings"]');
        permBtn.hidden = true;
        if (!r.enabled) {
            status.textContent = 'Aucun rappel. Active-le pour recevoir une notification le jour choisi, sauf si les quittances du mois sont déjà toutes envoyées.';
        } else if (st.permission === false) {
            status.textContent = 'Les notifications sont désactivées pour l\'application : le rappel ne pourra pas s\'afficher.';
            permBtn.hidden = false;
        } else {
            status.textContent = (st.next ? 'Prochain rappel : ' + formatDateTime(st.next) + '. ' : 'Rappel programmé. ') + 'Pas de notification si les quittances du mois sont déjà toutes envoyées.';
        }
    }

    function applyReminder() {
        var r = state.reminder;
        r.enabled = $('[data-reminder-enabled]').checked;
        r.day = Math.min(31, Math.max(1, Math.floor(Number($('[data-reminder-day]').value) || 10)));
        r.hour = Math.min(23, Math.max(0, Math.floor(Number($('[data-reminder-hour]').value) || 0)));
        save();
        var res = Native.setReminder(r.enabled, r.day, r.hour);
        renderReminder();
        if (res === 'permission') toast('Autorise les notifications pour recevoir le rappel');
        else if (res === 'scheduled') toast('Rappel programmé');
        else if (res === 'disabled') toast('Rappel désactivé');
    }

    $('[data-reminder-enabled]').addEventListener('change', applyReminder);
    $('[data-reminder-day]').addEventListener('change', applyReminder);
    $('[data-reminder-hour]').addEventListener('change', applyReminder);

    function renderBackupStatus() {
        var el = $('[data-backup-status]');
        if (!el) return;
        el.hidden = !native;
        if (!native) return;
        $('[data-data-hint]').textContent = 'Toutes les données (locataires, bailleur, signature, historique, modèle d\'email) sont stockées uniquement sur ce téléphone.';
        el.textContent = 'Sauvegarde automatique dans Documents/Quittances/quittances-sauvegarde.json après chaque modification'
            + (lastBackupAt ? ' · dernière à ' + lastBackupAt.getHours() + ':' + (lastBackupAt.getMinutes() < 10 ? '0' : '') + lastBackupAt.getMinutes() : '') + '.';
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
        el.textContent = plural(state.receipts.length, 'quittance', 'quittances') + ', ' + plural(state.tenants.length, 'locataire', 'locataires') + ', ' + Math.max(1, Math.round(bytes / 1024)) + ' Ko';
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
        var id = Core.uid();
        state.signatures[id] = dataUrl;
        state.currentSignatureId = id;
        pruneSignatures();
        save();
        renderSignatureCurrent();
        toast('Signature enregistrée');
    }

    function renderSignatureCurrent() {
        var sig = Core.currentSignature(state);
        var box = $('[data-signature-current]');
        box.hidden = !sig;
        if (sig) $('[data-signature-img]').src = sig;
    }

    function deleteSignature() {
        if (!Core.currentSignature(state)) return;
        if (!window.confirm('Supprimer la signature en place ? Les prochaines quittances seront générées sans signature tant qu\'une nouvelle n\'est pas enregistrée.')) return;
        state.currentSignatureId = null;
        pruneSignatures();
        save();
        renderSignatureCurrent();
        toast('Signature supprimée');
    }

    function exportBackup() {
        var blob = new Blob([JSON.stringify(Core.backupPayload(state), null, 2)], { type: 'application/json' });
        downloadBlob(blob, 'quittances-sauvegarde-' + Q.todayISO() + '.json');
        if (!native) toast('Sauvegarde enregistrée dans les téléchargements');
    }

    function importBackup(file) {
        var reader = new FileReader();
        reader.onload = function () {
            var data = Core.parseBackup(reader.result);
            if (!data) {
                toast('Fichier de sauvegarde invalide');
                return;
            }
            var msg = 'Remplacer toutes les données actuelles par cette sauvegarde ?\n'
                + plural(data.tenants.length, 'locataire', 'locataires') + ', ' + plural(data.receipts.length, 'quittance', 'quittances')
                + (data.currentSignatureId && data.signatures[data.currentSignatureId] ? ', signature incluse' : ', sans signature') + '.';
            if (!window.confirm(msg)) return;
            state = data;
            save();
            clearPad();
            if (native) Native.setReminder(state.reminder.enabled, state.reminder.day, state.reminder.hour);
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
        state = Core.defaultState();
        try {
            localStorage.removeItem(STORAGE_KEY);
        } catch (e) {
            toast('Suppression impossible');
        }
        clearPad();
        render();
        renderHeader();
        updateStorageInfo();
        scheduleBackup();
        toast('Toutes les données ont été effacées');
    }

    $('[data-backup-file]').addEventListener('change', function (e) {
        var input = e.target;
        var file = input.files && input.files[0];
        if (!file) return;
        importBackup(file);
        input.value = '';
    });

    function makePdf(r) {
        var data = Core.receiptData(state, r);
        var doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
        Q.buildReceipt(doc, data);
        return { doc: doc, blob: doc.output('blob'), name: Q.fileName(data) };
    }

    function makeMergedPdf(receipts) {
        if (!receipts.length) return null;
        var doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
        receipts.forEach(function (r, i) {
            if (i) doc.addPage();
            Q.buildReceipt(doc, Core.receiptData(state, r));
        });
        var months = {};
        receipts.forEach(function (r) { months[r.periodStart.slice(0, 7)] = true; });
        var keys = Object.keys(months).sort();
        var label = keys.length === 1 ? keys[0] : keys[0] + '-a-' + keys[keys.length - 1];
        return { blob: doc.output('blob'), name: 'quittances-loyer-' + label + '.pdf' };
    }

    function makeEml(r) {
        var pdf = makePdf(r);
        var text = Core.rawMessage(state, r, { name: pdf.name, base64: pdf.doc.output('datauristring').split(',')[1] }, { unsent: true });
        return { blob: new Blob([text], { type: 'message/rfc822' }), name: pdf.name.replace(/\.pdf$/, '.eml') };
    }

    function downloadEml(r) {
        var eml = makeEml(r);
        downloadBlob(eml.blob, eml.name);
        if (!native) toast('Email .eml téléchargé : ouvre-le dans ton client mail, destinataire, objet, message et PDF sont déjà remplis');
    }

    function markSent(r, sent, via) {
        r.sentAt = sent ? new Date().toISOString() : null;
        r.sentVia = sent ? (via || 'manual') : null;
        save();
        refreshAfterSend();
    }

    function refreshAfterSend() {
        if (queue.ids) renderQueue();
        else if (resultId && Core.receiptById(state, resultId)) openResult(Core.receiptById(state, resultId));
        if (currentView === 'history') renderHistory();
        if (currentView === 'new') renderHero();
    }

    function downloadBlob(blob, name) {
        if (native) {
            Native.saveFile(name, blob.type || 'application/octet-stream', blob).then(function (res) {
                toast(res === 'ok' ? 'Enregistré dans Téléchargements : ' + name : 'Enregistrement impossible');
            });
            return;
        }
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
        if (native) {
            Native.openFile(pdf.name, 'application/pdf', pdf.blob).then(function (res) {
                if (res !== 'ok') {
                    downloadBlob(pdf.blob, pdf.name);
                    toast('Aucune application pour ouvrir les PDF : fichier enregistré dans Téléchargements');
                }
            });
            return;
        }
        var url = URL.createObjectURL(pdf.blob);
        var win = window.open(url, '_blank');
        if (!win) downloadBlob(pdf.blob, pdf.name);
        setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
    }

    function copyText(text) {
        if (!text || !navigator.clipboard) return;
        navigator.clipboard.writeText(text).catch(noop);
    }

    function shareReceipt(r) {
        var pdf = makePdf(r);
        var mail = Core.renderEmail(state, r);
        if (native) {
            Native.sendEmail(r.tenant.email || '', mail.subject, mail.body, pdf.name, pdf.blob).then(function (res) {
                if (res === 'gmail' || res === 'chooser') {
                    markSent(r, true, 'android');
                    toast(res === 'gmail' ? 'Gmail ouvert : vérifie et appuie sur Envoyer' : 'Choisis ton application mail : tout est déjà rempli');
                    return;
                }
                downloadBlob(pdf.blob, pdf.name);
                toast('Aucune application mail : PDF enregistré dans Téléchargements');
            });
            return;
        }
        var file = null;
        try {
            file = new File([pdf.blob], pdf.name, { type: 'application/pdf' });
        } catch (e) {
            file = null;
        }
        if (file && navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
            copyText(r.tenant.email);
            navigator.share({ files: [file], title: mail.subject, text: mail.body }).then(function () {
                markSent(r, true, 'share');
                if (r.tenant.email) {
                    toast('Marquée envoyée · adresse copiée : ' + r.tenant.email, {
                        label: 'Recopier',
                        onClick: function () { copyText(r.tenant.email); }
                    });
                } else {
                    toast('Quittance partagée et marquée envoyée (aucun email renseigné)');
                }
            }).catch(function (err) {
                if (err && err.name === 'AbortError') return;
                downloadBlob(pdf.blob, pdf.name);
                toast('Partage impossible : le PDF a été téléchargé');
            });
            return;
        }
        var eml = makeEml(r);
        downloadBlob(eml.blob, eml.name);
        toast('Partage indisponible ici : email .eml téléchargé, ouvre-le dans ton client mail (destinataire, objet, message et PDF déjà remplis)');
    }

    var installEvent = null;

    window.addEventListener('beforeinstallprompt', function (e) {
        e.preventDefault();
        installEvent = e;
        if (native) return;
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
            if (!$('[data-modal]').hidden) closeModal();
            showView(nav.getAttribute('data-nav') || nav.getAttribute('data-nav-to'));
            return;
        }
        var mode = e.target.closest('[data-mode]');
        if (mode) {
            setNewMode(mode.getAttribute('data-mode'));
            return;
        }
        var btn = e.target.closest('[data-action]');
        if (!btn) return;
        var action = btn.getAttribute('data-action');
        var id = btn.getAttribute('data-id');
        var receipt = id ? Core.receiptById(state, id) : null;
        switch (action) {
            case 'close-modal': closeModal(); break;
            case 'month-go': monthGenerateAndSend(); break;
            case 'month-review': monthReview(); break;
            case 'month-send-rest': monthSendRest(); break;
            case 'add-tenant': openTenantForm(null); break;
            case 'edit-tenant': openTenantForm(Core.tenantById(state, id)); break;
            case 'delete-tenant': deleteTenant(id); break;
            case 'delete-receipt': deleteReceipt(id); break;
            case 'share': if (receipt) shareReceipt(receipt); break;
            case 'open': if (receipt) openPdf(receipt); break;
            case 'download': if (receipt) { var pdf = makePdf(receipt); downloadBlob(pdf.blob, pdf.name); } break;
            case 'eml': if (receipt) downloadEml(receipt); break;
            case 'mark-sent': if (receipt) markSent(receipt, true); break;
            case 'mark-unsent': if (receipt) markSent(receipt, false); break;
            case 'queue-next': {
                var next = queueReceipts().find(function (r) { return !r.sentAt; });
                if (next) shareReceipt(next);
                break;
            }
            case 'queue-merged': {
                var merged = makeMergedPdf(queueReceipts());
                if (merged) {
                    downloadBlob(merged.blob, merged.name);
                    if (!native) toast('PDF groupé téléchargé');
                }
                break;
            }
            case 'history-queue': openQueue(unsentReceipts().map(function (r) { return r.id; }), 'Quittances à envoyer'); break;
            case 'signature-clear': clearPad(); break;
            case 'signature-save': saveDrawnSignature(); break;
            case 'signature-delete': deleteSignature(); break;
            case 'backup-export': exportBackup(); break;
            case 'wipe-all': wipeAll(); break;
            case 'notif-settings': Native.openNotificationSettings(); break;
            case 'email-reset':
                state.email = { subject: Core.DEFAULT_EMAIL.subject, body: Core.DEFAULT_EMAIL.body };
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

    if (!native && 'serviceWorker' in navigator && (window.location.protocol === 'https:' || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) {
        navigator.serviceWorker.register('./sw.js').catch(noop);
    }

    window.QuittanceApp = {
        back: function () {
            if (!$('[data-modal]').hidden) {
                closeModal();
                return true;
            }
            if (currentView !== 'new') {
                showView('new');
                return true;
            }
            return false;
        },
        onReminderResult: function (granted) {
            if (!granted) {
                state.reminder.enabled = false;
                save();
                toast('Notifications refusées : le rappel mensuel est désactivé');
            } else {
                toast('Rappel mensuel programmé');
            }
            if (currentView === 'settings') renderReminder();
        }
    };

    function initReminder() {
        if (!native) return;
        var inited = null;
        try {
            inited = localStorage.getItem(REMINDER_INIT_KEY);
        } catch (e) {
            inited = null;
        }
        if (!inited) {
            try {
                localStorage.setItem(REMINDER_INIT_KEY, '1');
            } catch (e) {
                noop();
            }
            Native.setReminder(state.reminder.enabled, state.reminder.day, state.reminder.hour);
        } else if (state.reminder.enabled) {
            Native.setReminder(true, state.reminder.day, state.reminder.hour);
        }
        scheduleBackup();
    }

    initNewForm();
    renderHeader();
    showView('new');
    initReminder();
})();
