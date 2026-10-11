import { auth, googleProvider } from './firebase.js';
import { signInWithEmailAndPassword, signInAnonymously, signOut, signInWithPopup, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { el } from './utils.js';
import { state, CONSTANTS, checkIsAdmin } from './state.js';

export function updateAuthUI() {
    const btn = el('authBtn');
    const isLoggedIn = (state.user && !state.user.isAnonymous);
    const isSuperAdmin = checkIsAdmin(state.user);
    
    state.isViewerRole = isLoggedIn && state.user.email && CONSTANTS.VIEWER_EMAILS.includes(state.user.email.toLowerCase());
    
    if (isSuperAdmin) {
        btn.innerHTML = `<i data-lucide="shield-check" class="w-3 h-3 md:w-4 md:h-4"></i> <span class="uppercase tracking-wide hidden xs:inline">Admin (Active)</span><span class="uppercase tracking-wide inline xs:hidden">Admin</span>`;
        btn.className = "px-3 py-2 md:px-5 md:py-2.5 rounded-xl font-bold text-[10px] md:text-xs flex items-center gap-1.5 md:gap-2 border transition-all duration-300 shadow-md shadow-red-500/30 transform active:scale-95 bg-red-600 text-white border-red-500 hover:bg-red-700 hover:shadow-red-500/50";
        el('btnExport').classList.remove('hidden'); el('btnExport').classList.add('flex');
        if(el('btnTrash')) el('btnTrash').style.display = '';
        if(el('btnMyData')) el('btnMyData').style.display = 'flex';
    } else if (state.isViewerRole) {
        btn.innerHTML = `<i data-lucide="eye" class="w-3 h-3 md:w-4 md:h-4"></i> <span class="uppercase tracking-wide hidden xs:inline">Người xem</span><span class="uppercase tracking-wide inline xs:hidden">View</span>`;
        btn.className = "px-3 py-2 md:px-5 md:py-2.5 rounded-xl font-bold text-[10px] md:text-xs flex items-center gap-1.5 md:gap-2 border transition-all duration-300 shadow-md shadow-teal-500/30 transform active:scale-95 bg-teal-600 text-white border-teal-500 hover:bg-teal-700 hover:shadow-teal-500/50";
        el('btnExport').classList.add('hidden'); el('btnExport').classList.remove('flex');
        if(el('btnTrash')) el('btnTrash').style.display = 'none';
        if(el('btnMyData')) el('btnMyData').style.display = 'none';
    } else if (isLoggedIn) {
        btn.innerHTML = `<i data-lucide="user" class="w-3 h-3 md:w-4 md:h-4"></i> <span class="uppercase tracking-wide hidden xs:inline">Thành viên</span><span class="uppercase tracking-wide inline xs:hidden">User</span>`;
        btn.className = "px-3 py-2 md:px-5 md:py-2.5 rounded-xl font-bold text-[10px] md:text-xs flex items-center gap-1.5 md:gap-2 border transition-all duration-300 shadow-md shadow-indigo-500/30 transform active:scale-95 bg-indigo-600 text-white border-indigo-500 hover:bg-indigo-700 hover:shadow-indigo-500/50";
        el('btnExport').classList.remove('hidden'); el('btnExport').classList.add('flex');
        if(el('btnTrash')) el('btnTrash').style.display = '';
        if(el('btnMyData')) el('btnMyData').style.display = 'flex';
    } else {
        btn.innerHTML = `<i data-lucide="log-in" class="w-3 h-3 md:w-4 md:h-4"></i> <span class="uppercase tracking-wide hidden xs:inline">Đăng nhập</span><span class="uppercase tracking-wide inline xs:hidden">Login</span>`;
        btn.className = "px-3 py-2 md:px-5 md:py-2.5 rounded-xl font-bold text-[10px] md:text-xs flex items-center gap-1.5 md:gap-2 border transition-all duration-300 shadow-md transform active:scale-95 bg-slate-800 text-slate-200 border-slate-700 hover:bg-slate-700 hover:text-white dark:bg-slate-700 dark:border-slate-600 dark:hover:bg-slate-600";
        el('btnExport').classList.add('hidden'); el('btnExport').classList.remove('flex');
        if(el('btnTrash')) el('btnTrash').style.display = '';
    }

    const viewDashboard = el('viewDashboard');
    const viewLock = el('viewLock');
    const navTabs = el('mainNav');

    viewDashboard.classList.add('hidden'); viewLock.classList.add('hidden'); navTabs.classList.add('hidden');
    if (!isLoggedIn && !isSuperAdmin) {
        viewLock.classList.remove('hidden');
    } else {
        viewDashboard.classList.remove('hidden'); navTabs.classList.remove('hidden'); navTabs.classList.add('flex');
        if(window.fetchData) window.fetchData();
    }
    if (window.lucide) lucide.createIcons();
}

export const initAuth = () => {
    window.toggleAdminForm = () => {
        el('normalLoginForm').classList.toggle('hidden');
        if(el('adminKeyForm')) el('adminKeyForm').classList.toggle('hidden');
    };

    window.doEmailLogin = async () => {
        const email = el('authEmail').value; const pwd = el('authPassword').value;
        try {
            await signInWithEmailAndPassword(auth, email, pwd);
            el('authModal').classList.add('hidden'); window.showToast("Đăng nhập thành công!");
        } catch (error) { window.showAlert("Lỗi đăng nhập", error.message, 'error'); }
    };

    window.doGoogleLogin = async () => {
        try {
            await signInWithPopup(auth, googleProvider);
            el('authModal').classList.add('hidden'); window.showToast("Đăng nhập Google thành công!");
        } catch (error) { window.showAlert("Lỗi Google Login", error.message, 'error'); }
    };

    window.doAdminKeyLogin = async () => {
        const key = el('adminKeyInput').value;
        if (key === 'gm@191223') {
            if (!auth.currentUser) await signInAnonymously(auth);
            state.isAdminKey = true; sessionStorage.setItem('vnrad_admin_key', 'true');
            updateAuthUI(); el('authModal').classList.add('hidden'); el('adminKeyInput').value = '';
            window.showToast("Đã kích hoạt quyền Admin!");
        } else { window.showAlert("Lỗi xác thực", "Mã khóa không đúng!", 'error'); }
    };

    el('authBtn').onclick = () => {
        if ((state.user && !state.user.isAnonymous) || checkIsAdmin(state.user)) {
            window.showConfirm("Đăng xuất", "Bạn có chắc chắn muốn đăng xuất?", () => {
                signOut(auth).then(() => { state.isAdminKey = false; sessionStorage.removeItem('vnrad_admin_key'); updateAuthUI(); });
            });
        } else { el('authModal').classList.remove('hidden'); }
    };

    onAuthStateChanged(auth, async (u) => {
        if (u) { state.user = u; updateAuthUI(); } 
        else { signInAnonymously(auth).catch(console.error); }
    });
};
