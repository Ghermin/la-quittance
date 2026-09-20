(function (root) {
    'use strict';

    var bridge = root.AndroidBridge || null;

    function blobToBase64(blob) {
        return new Promise(function (resolve, reject) {
            var reader = new FileReader();
            reader.onload = function () { resolve(String(reader.result).split(',')[1] || ''); };
            reader.onerror = function () { reject(reader.error); };
            reader.readAsDataURL(blob);
        });
    }

    function call(name) {
        var args = Array.prototype.slice.call(arguments, 1);
        if (!bridge || typeof bridge[name] !== 'function') return 'unavailable';
        try {
            return bridge[name].apply(bridge, args);
        } catch (e) {
            return 'error';
        }
    }

    function withBlob(blob, fn) {
        return blobToBase64(blob).then(fn);
    }

    root.QuittanceNative = {
        available: !!bridge,
        blobToBase64: blobToBase64,
        version: function () {
            return bridge ? String(call('version')) : '';
        },
        sendEmail: function (to, subject, body, name, blob) {
            return withBlob(blob, function (b64) { return call('sendEmail', to || '', subject, body, name, b64); });
        },
        openFile: function (name, mime, blob) {
            return withBlob(blob, function (b64) { return call('openFile', name, mime, b64); });
        },
        saveFile: function (name, mime, blob) {
            return withBlob(blob, function (b64) { return call('saveFile', name, mime, b64); });
        },
        writeBackup: function (json, monthDone) {
            return call('writeBackup', json, monthDone || '');
        },
        setReminder: function (enabled, day, hour) {
            return call('setReminder', !!enabled, Math.floor(Number(day)) || 10, Math.floor(Number(hour)) || 0);
        },
        reminderStatus: function () {
            if (!bridge) return null;
            try {
                return JSON.parse(call('reminderStatus') || 'null');
            } catch (e) {
                return null;
            }
        },
        openNotificationSettings: function () {
            call('openNotificationSettings');
        }
    };
})(window);
