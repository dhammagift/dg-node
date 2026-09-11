// === Файл: /assets/js/dict-mode-shared.js ===
// issue #4: dict-modes.json groups no longer duplicate every DPD mode per dictionary language
// (dictGroupEn/dictGroupRu merged into dictGroupDpd, hasLangToggle:true) — these three pure
// functions turn a flat mode value + a separate En/Ru toggle into the same localStorage.selectedDict
// strings as before ("standalone"/"standaloneru", ...). Shared by settings/index.html (full
// settings) and search/js/home.js (quick settings) — used to be two hand-copied implementations.
window.DictModeShared = (function () {
    function groupFor(groups, value) {
        return (groups || []).find(function (g) {
            return g.options.some(function (o) { return o.value === value; });
        });
    }

    function composeValue(groups, mode, lang) {
        var g = groupFor(groups, mode);
        return (g && g.hasLangToggle && lang === 'ru') ? mode + 'ru' : mode;
    }

    function splitValue(groups, value) {
        for (var i = 0; i < (groups || []).length; i++) {
            var g = groups[i];
            if (!g.hasLangToggle) continue;
            for (var j = 0; j < g.options.length; j++) {
                var o = g.options[j];
                if (value === o.value) return { mode: o.value, lang: 'en' };
                if (value === o.value + 'ru') return { mode: o.value, lang: 'ru' };
            }
        }
        return { mode: value, lang: null }; // language-agnostic modes: DharmaMitra, Search only, ...
    }

    return { groupFor: groupFor, composeValue: composeValue, splitValue: splitValue };
})();
