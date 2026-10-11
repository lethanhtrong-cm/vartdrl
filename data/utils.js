export const el = (id) => document.getElementById(id);

export const getDisplayProtocol = (p) => {
    if (!p) return '';
    const lowerP = p.toLowerCase();
    if (lowerP.includes('sọ não') || lowerP.includes('head') || lowerP.includes('brain')) return 'Sọ não không thuốc';
    if (lowerP.includes('ngực') || lowerP.includes('chest') || lowerP.includes('thorax')) return 'Ngực không thuốc';
    if (lowerP.includes('bụng') || lowerP.includes('abdomen') || lowerP.includes('abd')) return 'Bụng không thuốc';
    if (lowerP.includes('low') || lowerP.includes('thấp') || lowerP.includes('ldct')) return 'Phổi liều thấp';
    return p;
};

export const getProtocolGroup = (p) => {
    if (!p) return 'Khác';
    const lower = p.toLowerCase();
    if (lower.includes('sọ') || lower.includes('head') || lower.includes('brain') || lower.includes('não')) return 'Sọ não (Head Routine)';
    if ((lower.includes('ngực') || lower.includes('chest') || lower.includes('thorax') || lower.includes('phổi')) && !lower.includes('low') && !lower.includes('thấp') && !lower.includes('ldct')) return 'Ngực (Chest Routine)';
    if (lower.includes('bụng') || lower.includes('abdomen') || lower.includes('abd')) return 'Bụng (Abdomen Routine)';
    if (lower.includes('low') || lower.includes('thấp') || lower.includes('ldct')) return 'Phổi liều thấp (LDCT)';
    if (lower.includes('spine') || lower.includes('cột sống')) return 'Spine';
    return p;
};

export const getProtocolSuggestion = (protocol, ctdi) => {
    const protGroup = getProtocolGroup(protocol);
    const c = parseFloat(ctdi);
    if (isNaN(c) || c === 0) return { isAbnormal: false };

    if (protGroup === 'Phổi liều thấp (LDCT)' && c > 6) {
        return { isAbnormal: true, suggestedLabel: 'Ngực (Chest)', suggestedValue: 'Chest Routine', reason: 'CTDI > 6 mGy: Quá cao cho phổi liều thấp' };
    }
    if (protGroup === 'Ngực (Chest Routine)' && c < 3) {
        return { isAbnormal: true, suggestedLabel: 'Phổi liều thấp', suggestedValue: 'Low Dose Lung', reason: 'CTDI < 3 mGy: Quá thấp cho ngực thường quy' };
    }
    if (protGroup === 'Sọ não (Head Routine)' && c < 25) {
        if (c < 6) return { isAbnormal: true, suggestedLabel: 'Phổi liều thấp', suggestedValue: 'Low Dose Lung', reason: 'CTDI quá thấp cho Sọ não. Trùng dải liều LDCT' };
        return { isAbnormal: true, suggestedLabel: 'Ngực (Chest)', suggestedValue: 'Chest Routine', reason: 'CTDI quá thấp cho Sọ não. Trùng dải liều Ngực/Bụng' };
    }
    if (protGroup === 'Sọ não (Head Routine)' && c > 100) {
        return { isAbnormal: true, suggestedLabel: '', suggestedValue: '', reason: 'CTDI > 100 mGy: Vượt ngưỡng thông thường' };
    }
    return { isAbnormal: false };
};

export const getProtocolClass = (p) => {
    const prot = (p || '').toLowerCase();
    if (prot.includes('head') || prot.includes('sọ') || prot.includes('não')) return 'bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/40 dark:text-blue-300 dark:border-blue-800';
    if (prot.includes('chest') || prot.includes('ngực') || prot.includes('phổi')) return 'bg-cyan-100 text-cyan-800 border-cyan-200 dark:bg-cyan-900/40 dark:text-cyan-300 dark:border-cyan-800';
    if (prot.includes('abdomen') || prot.includes('bụng')) return 'bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/40 dark:text-amber-300 dark:border-amber-800';
    if (prot.includes('spine') || prot.includes('cột sống')) return 'bg-purple-100 text-purple-800 border-purple-200 dark:bg-purple-900/40 dark:text-purple-300 dark:border-purple-800';
    if (prot.includes('low') || prot.includes('thấp')) return 'bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-300 dark:border-emerald-800';
    return 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700';
};

export const getModState = (val) => {
    if (val === null || val === undefined || val === '') return 'unknown';
    const s = String(val).toLowerCase().trim();
    if (['on', 'true', 'có', 'yes', '1', 'bật'].some(k => s === k) || s.includes('có') || s.includes('on')) return 'on';
    if (['off', 'false', 'không', 'no', '0', 'tắt'].some(k => s === k) || s.includes('không') || s.includes('off')) return 'off';
    return 'unknown';
};

export const getManufacturerClass = (manu) => {
    const m = (manu || '').toLowerCase();
    if (m.includes('siemens')) return 'bg-teal-50 text-teal-700 border-teal-200 dark:bg-teal-900/40 dark:text-teal-300 dark:border-teal-800';
    if (m.includes('ge') || m.includes('general electric')) return 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/40 dark:text-blue-300 dark:border-blue-800';
    if (m.includes('philips')) return 'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-900/40 dark:text-indigo-300 dark:border-indigo-800';
    if (m.includes('canon') || m.includes('toshiba')) return 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-900/40 dark:text-rose-300 dark:border-rose-800';
    if (m.includes('neusoft')) return 'bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-900/40 dark:text-orange-300 dark:border-orange-800';
    if (m.includes('hitachi')) return 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-300 dark:border-emerald-800';
    if (m.includes('united')) return 'bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200 dark:bg-fuchsia-900/40 dark:text-fuchsia-300 dark:border-fuchsia-800';
    return 'bg-slate-50 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700';
};

export const getPercentileValue = (arr, p) => {
    if (arr.length === 0) return 0;
    if (arr.length === 1) return arr[0];
    const sorted = [...arr].sort((a, b) => a - b);
    const index = (sorted.length - 1) * p / 100;
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    const weight = index - lower;
    return sorted[lower] * (1 - weight) + sorted[upper] * weight;
};

export const filterOutliersIQR = (arr) => {
    if (!arr || arr.length < 4) return arr; 
    const sorted = [...arr].sort((a, b) => a - b);
    const q1 = getPercentileValue(sorted, 25);
    const q3 = getPercentileValue(sorted, 75);
    const iqr = q3 - q1;
    const lowerBound = q1 - 1.5 * iqr;
    const upperBound = q3 + 1.5 * iqr;
    return sorted.filter(x => x >= lowerBound && x <= upperBound);
};

export const calcStats = (arr) => {
    if (!arr || !arr.length) return { mean: 0, sd: 0, median: 0, p75: 0 };
    const n = arr.length;
    const sum = arr.reduce((a, b) => a + b, 0);
    const mean = sum / n;
    
    const sorted = [...arr].sort((a, b) => a - b);
    const getP = (p) => {
        if (n === 0) return 0;
        if (n === 1) return sorted[0];
        const index = (n - 1) * p / 100;
        const lower = Math.floor(index);
        const upper = Math.ceil(index);
        const weight = index - lower;
        return sorted[lower] * (1 - weight) + sorted[upper] * weight;
    };

    const median = getP(50);
    const p75 = getP(75);
    
    const variance = arr.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / (n > 1 ? n - 1 : 1);
    const sd = Math.sqrt(variance);
    return { mean, sd, median, p75 };
};
