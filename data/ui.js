import { el } from './utils.js';

export function showDialog(type, title, message, onConfirm = null) {
    const dialog = el('globalDialog');
    const iconEl = el('dialogIcon');
    const titleEl = el('dialogTitle');
    const msgEl = el('dialogMessage');
    const actionsEl = el('dialogActions');
    iconEl.className = 'w-12 h-12 rounded-full flex items-center justify-center mb-4 mx-auto';
    actionsEl.innerHTML = '';

    if (type === 'success') {
        iconEl.classList.add('bg-emerald-100', 'text-emerald-600');
        iconEl.innerHTML = '<i data-lucide="check" class="w-6 h-6"></i>';
        actionsEl.innerHTML = `<button onclick="document.getElementById('globalDialog').classList.add('hidden')" class="px-6 py-2 bg-emerald-600 text-white rounded-xl font-bold text-sm hover:bg-emerald-700 transition-colors">Đóng</button>`;
    } else if (type === 'error') {
        iconEl.classList.add('bg-red-100', 'text-red-600');
        iconEl.innerHTML = '<i data-lucide="alert-triangle" class="w-6 h-6"></i>';
        actionsEl.innerHTML = `<button onclick="document.getElementById('globalDialog').classList.add('hidden')" class="px-6 py-2 bg-red-600 text-white rounded-xl font-bold text-sm hover:bg-red-700 transition-colors">Đóng</button>`;
    } else if (type === 'info') {
        iconEl.classList.add('bg-indigo-100', 'text-indigo-600');
        iconEl.innerHTML = '<i data-lucide="info" class="w-6 h-6"></i>';
        actionsEl.innerHTML = `<button onclick="document.getElementById('globalDialog').classList.add('hidden')" class="px-6 py-2 bg-indigo-600 text-white rounded-xl font-bold text-sm hover:bg-indigo-700 transition-colors">Đóng</button>`;
    } else if (type === 'confirm') {
        iconEl.classList.add('bg-amber-100', 'text-amber-600');
        iconEl.innerHTML = '<i data-lucide="help-circle" class="w-6 h-6"></i>';
        const btnCancel = document.createElement('button');
        btnCancel.className = "px-6 py-2 bg-slate-100 text-slate-600 rounded-xl font-bold text-sm hover:bg-slate-200 transition-colors dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600";
        btnCancel.textContent = "Hủy";
        btnCancel.onclick = () => dialog.classList.add('hidden');
        const btnConfirm = document.createElement('button');
        btnConfirm.className = "px-6 py-2 bg-indigo-600 text-white rounded-xl font-bold text-sm hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-500/30";
        btnConfirm.textContent = "Đồng ý";
        btnConfirm.onclick = () => {
            dialog.classList.add('hidden');
            if (onConfirm) onConfirm();
        };
        actionsEl.appendChild(btnCancel);
        actionsEl.appendChild(btnConfirm);
    }
    titleEl.textContent = title;
    msgEl.textContent = message;
    if (window.lucide) lucide.createIcons();
    dialog.classList.remove('hidden');
}

// Map to window for inline HTML events
window.showAlert = (title, msg, type = 'info') => showDialog(type, title, msg);
window.showConfirm = (title, msg, callback) => showDialog('confirm', title, msg, callback);
window.showToast = (msg) => { 
    const tm = el('toastMessage');
    if(!tm) return;
    tm.textContent = msg; 
    const t = el('toast');
    if(t) {
        t.classList.remove('translate-y-20', 'opacity-0'); 
        setTimeout(() => t.classList.add('translate-y-20', 'opacity-0'), 3000); 
    }
};

window.toggleTheme = () => {
    if (document.documentElement.classList.contains('dark')) {
        document.documentElement.classList.remove('dark');
        localStorage.setItem('theme', 'light');
    } else {
        document.documentElement.classList.add('dark');
        localStorage.setItem('theme', 'dark');
    }
};
