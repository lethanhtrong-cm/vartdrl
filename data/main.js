import { auth, db, googleProvider, appId } from './firebase.js';
import { el, getDisplayProtocol, getProtocolGroup, getProtocolSuggestion, getProtocolClass, getModState, getManufacturerClass, filterOutliersIQR, calcStats } from './utils.js';
import './ui.js';
import { onAuthStateChanged, signInWithEmailAndPassword, signInAnonymously, signOut, signInWithPopup } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { collection, doc, getDocs, updateDoc, deleteDoc, addDoc, writeBatch } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// Constants & States
const LS_KEY_DATA = 'drl_data_cache';
const LS_KEY_PENDING = 'drl_pending_queue';
const VIEWER_EMAILS = ['syt@gmail.com', 'quanly@gmail.com'];
const ADMIN_EMAILS = ['thanhtrong.yds@gmail.com'];

let hospitalAliasMap = {};
let entries = [];
let filtered = [];
let selected = new Set();
let selectedHospitals = new Set(); 
let currentPage = 1;
let rowsPerPage = 20;
let isTrashMode = false;
let isMyDataMode = false; 
let user = null;
let isAdminKey = sessionStorage.getItem('vnrad_admin_key') === 'true';
let isViewerRole = false; 
let pendingQueue = JSON.parse(localStorage.getItem(LS_KEY_PENDING) || '[]');

const checkIsAdmin = (u) => isAdminKey || (u && u.email && ADMIN_EMAILS.includes(u.email.toLowerCase()));

// --- GLOBAL BINDINGS ---
window.fetchData = async (manual = false) => {
    if (!user && !checkIsAdmin(user)) return;
    try {
        const snap = await getDocs(collection(db, 'artifacts', appId, 'public', 'data', 'drl_entries'));
        entries = snap.docs.map(d => ({id: d.id, ...d.data()}));
        localStorage.setItem(LS_KEY_DATA, JSON.stringify(entries));
        el('offlineBanner').classList.add('hidden');
        if(manual) window.showToast("Đã cập nhật dữ liệu mới nhất!");
    } catch (err) {
        console.error("Fetch Error:", err);
        if (err.code === 'resource-exhausted' || err.code === 'unavailable') {
            const cached = localStorage.getItem(LS_KEY_DATA);
            if (cached) {
                entries = JSON.parse(cached);
                el('offlineBanner').classList.remove('hidden');
                if(manual) window.showToast("Đang xem dữ liệu ngoại tuyến (Hết hạn ngạch)");
            }
        }
    } finally {
        mergePendingChanges();
        generateHospitalAliases(entries);
        populateFilters();
        window.renderTable();
    }
};

function mergePendingChanges() {
    pendingQueue.forEach(item => {
        if (item.type === 'create') {
            entries.unshift({id: item.id, ...item.data, createdAt: item.timestamp});
        } else if (item.type === 'update') {
            const idx = entries.findIndex(e => e.id === item.id);
            if (idx > -1) entries[idx] = { ...entries[idx], ...item.data };
        } else if (item.type === 'delete') {
            entries = entries.filter(e => e.id !== item.id);
        } else if (item.type === 'soft-delete') {
            const idx = entries.findIndex(e => e.id === item.id);
            if (idx > -1) entries[idx].isDeleted = true;
        }
    });
    updatePendingUI();
}

function addToQueue(type, id, data = null) {
    pendingQueue.push({ type, id, data, timestamp: Date.now() });
    localStorage.setItem(LS_KEY_PENDING, JSON.stringify(pendingQueue));
    mergePendingChanges();
    window.showToast("Đã hết hạn ngạch. Dữ liệu được lưu tạm cục bộ.");
    window.renderTable();
}

window.syncData = async () => {
    const newQueue = [];
    for (const item of pendingQueue) {
        try {
            if (item.type === 'create') {
            await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'drl_entries'), item.data);
            } else {
            const ref = doc(db, 'artifacts', appId, 'public', 'data', 'drl_entries', item.id);
            if (item.type === 'update') await updateDoc(ref, item.data);
            else if (item.type === 'delete') await deleteDoc(ref);
            else if (item.type === 'soft-delete') await updateDoc(ref, {isDeleted: true});
            }
        } catch (e) {
            if(e.code === 'resource-exhausted') {
            window.showAlert("Lỗi", "Vẫn chưa có hạn ngạch. Vui lòng thử lại sau.", "error");
            return;
            }
            newQueue.push(item);
        }
    }
    pendingQueue = newQueue;
    localStorage.setItem(LS_KEY_PENDING, JSON.stringify(pendingQueue));
    updatePendingUI();
    if (pendingQueue.length === 0) {
        window.showToast("Đồng bộ thành công!");
        window.fetchData(true);
    }
};

function updatePendingUI() {
    const count = pendingQueue.length;
    if (count > 0) {
        el('btnSync').classList.remove('hidden');
        el('pendingCountDisplay').textContent = count;
        el('offlineBanner').classList.remove('hidden');
    } else {
        el('btnSync').classList.add('hidden');
    }
}

window.toggleAdminForm = () => {
    el('normalLoginForm').classList.toggle('hidden');
    if(el('adminKeyForm')) el('adminKeyForm').classList.toggle('hidden');
};

window.doEmailLogin = async () => {
    const email = el('authEmail').value;
    const pwd = el('authPassword').value;
    try {
        await signInWithEmailAndPassword(auth, email, pwd);
        el('authModal').classList.add('hidden');
        window.showToast("Đăng nhập thành công!");
    } catch (error) {
        window.showAlert("Lỗi đăng nhập", error.message, 'error');
    }
};

window.doGoogleLogin = async () => {
    try {
        await signInWithPopup(auth, googleProvider);
        el('authModal').classList.add('hidden');
        window.showToast("Đăng nhập Google thành công!");
    } catch (error) {
        window.showAlert("Lỗi Google Login", error.message, 'error');
    }
};

window.doAdminKeyLogin = async () => {
    const key = el('adminKeyInput').value;
    if (key === 'gm@191223') {
        if (!auth.currentUser) await signInAnonymously(auth);
        isAdminKey = true;
        sessionStorage.setItem('vnrad_admin_key', 'true');
        updateAuthUI();
        el('authModal').classList.add('hidden');
        el('adminKeyInput').value = '';
        window.showToast("Đã kích hoạt quyền Admin!");
    } else {
        window.showAlert("Lỗi xác thực", "Mã khóa không đúng!", 'error');
    }
};

el('authBtn').onclick = () => {
    if ((user && !user.isAnonymous) || checkIsAdmin(user)) {
        window.showConfirm("Đăng xuất", "Bạn có chắc chắn muốn đăng xuất?", () => {
            signOut(auth).then(() => {
            isAdminKey = false;
            sessionStorage.removeItem('vnrad_admin_key');
            updateAuthUI();
            });
        });
    } else {
        el('authModal').classList.remove('hidden');
    }
};

function updateAuthUI() {
    const btn = el('authBtn');
    const isLoggedIn = (user && !user.isAnonymous);
    const isSuperAdmin = checkIsAdmin(user);
    
    isViewerRole = isLoggedIn && user.email && VIEWER_EMAILS.includes(user.email.toLowerCase());
    
    if (isSuperAdmin) {
        btn.innerHTML = `<i data-lucide="shield-check" class="w-3 h-3 md:w-4 md:h-4"></i> <span class="uppercase tracking-wide hidden xs:inline">Admin (Active)</span><span class="uppercase tracking-wide inline xs:hidden">Admin</span>`;
        btn.className = "px-3 py-2 md:px-5 md:py-2.5 rounded-xl font-bold text-[10px] md:text-xs flex items-center gap-1.5 md:gap-2 border transition-all duration-300 shadow-md shadow-red-500/30 transform active:scale-95 bg-red-600 text-white border-red-500 hover:bg-red-700 hover:shadow-red-500/50";
        el('btnExport').classList.remove('hidden'); el('btnExport').classList.add('flex');
        if(el('btnTrash')) el('btnTrash').style.display = '';
        if(el('btnMyData')) el('btnMyData').style.display = 'flex';
    } else if (isViewerRole) {
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

    viewDashboard.classList.add('hidden');
    viewLock.classList.add('hidden');
    navTabs.classList.add('hidden');

    if (!isLoggedIn && !isSuperAdmin) {
        viewLock.classList.remove('hidden');
    } else {
        viewDashboard.classList.remove('hidden');
        navTabs.classList.remove('hidden');
        navTabs.classList.add('flex');
        window.fetchData();
    }
    if (window.lucide) lucide.createIcons();
}

onAuthStateChanged(auth, async (u) => {
    if (u) {
        user = u;
        updateAuthUI(); 
    } else {
        signInAnonymously(auth).catch(console.error);
    }
});

function generateHospitalAliases(data) {
    const allHosps = [...new Set(data.map(e => e.hospitalName).filter(n => n && !n.toLowerCase().includes('chọn') && !n.toLowerCase().includes('gmail') && !n.toLowerCase().includes('imported')))].sort();
    hospitalAliasMap = {};
    const myHosps = new Set();
    if (user && !user.isAnonymous && !checkIsAdmin(user)) {
        data.forEach(e => {
            if (e.userId === user.uid || (e.userEmail && e.userEmail === user.email)) {
                myHosps.add(e.hospitalName);
            }
        });
    }
    const isSuperAdmin = checkIsAdmin(user);
    const canSeeAll = isSuperAdmin || isViewerRole;

    allHosps.forEach((h, idx) => {
        if (canSeeAll) hospitalAliasMap[h] = h;
        else if (myHosps.has(h)) hospitalAliasMap[h] = h;
        else hospitalAliasMap[h] = `Cơ sở ẩn danh #${idx + 1}`;
    });
}

window.deleteHospital = async (name) => {
    window.showConfirm('Xóa bệnh viện', `Bạn có chắc chắn muốn xóa toàn bộ dữ liệu của "${name}"? Hành động này không thể hoàn tác.`, async () => {
        const idsToDelete = entries.filter(e => e.hospitalName === name).map(e => e.id);
        if (idsToDelete.length === 0) {
            window.showToast("Không tìm thấy dữ liệu để xóa.");
            return;
        }
        const BATCH_SIZE = 500;
        for (let i = 0; i < idsToDelete.length; i += BATCH_SIZE) {
        const chunk = idsToDelete.slice(i, i + BATCH_SIZE);
        const currentBatch = writeBatch(db);
        chunk.forEach(id => {
            const ref = doc(db, 'artifacts', appId, 'public', 'data', 'drl_entries', id);
            currentBatch.delete(ref);
        });
        try { await currentBatch.commit(); } 
        catch(e) { if (e.code === 'resource-exhausted' || e.code === 'permission-denied') { window.showAlert("Lỗi", "Lỗi phân quyền hoặc hết quota: " + e.message, "error"); return; } }
    }
    window.showToast(`Đã xóa bệnh viện ${name}`);
    window.closeHospitalModal();
    window.fetchData(true);
    });
}

const myDataActiveClasses = ['bg-purple-800', 'text-white', 'border-purple-800', 'ring-2', 'ring-purple-400', 'shadow-inner'];
const myDataInactiveClasses = ['bg-purple-600', 'text-white', 'border-purple-600', 'shadow-md', 'shadow-purple-500/30', 'hover:bg-purple-700', 'dark:bg-purple-600', 'dark:hover:bg-purple-700'];

window.toggleMyData = () => {
    isMyDataMode = !isMyDataMode;
    const btn = el('btnMyData');
    if (isMyDataMode) {
        btn.classList.remove(...myDataInactiveClasses);
        btn.classList.add(...myDataActiveClasses);
        btn.innerHTML = `<i data-lucide="user-check" class="w-3 h-3"></i> <span class="hidden xs:inline">Đang lọc của tôi</span>`;
    } else {
        btn.classList.remove(...myDataActiveClasses);
        btn.classList.add(...myDataInactiveClasses);
        btn.innerHTML = `<i data-lucide="user" class="w-3 h-3"></i> <span class="hidden xs:inline">Lọc ca của tôi</span>`;
    }
    if (window.lucide) lucide.createIcons();
    if (isMyDataMode) window.showToast("Đã bật chế độ lọc dữ liệu của bạn");
    currentPage = 1;
    window.renderTable();
};

window.toggleTrashMode = () => {
    isTrashMode = !isTrashMode;
    const btn = el('btnTrash');
    if (isTrashMode) {
        btn.classList.remove('bg-white', 'dark:bg-slate-800', 'text-slate-500', 'dark:text-slate-400');
        btn.classList.add('bg-red-100', 'text-red-600', 'border-red-200', 'dark:bg-red-900/30', 'dark:text-red-400', 'dark:border-red-800');
        btn.innerHTML = `<i data-lucide="trash-2" class="w-3 h-3"></i> <span class="hidden xs:inline">Đang xem thùng rác</span><span class="inline xs:hidden">Thùng rác (ON)</span>`;
    } else {
        btn.classList.add('bg-white', 'dark:bg-slate-800', 'text-slate-500', 'dark:text-slate-400');
        btn.classList.remove('bg-red-100', 'text-red-600', 'border-red-200', 'dark:bg-red-900/30', 'dark:text-red-400', 'dark:border-red-800');
        btn.innerHTML = `<i data-lucide="trash-2" class="w-3 h-3"></i> <span class="hidden xs:inline">Thùng rác</span>`;
    }
    currentPage = 1;
    selected.clear();
    if(el('checkAll')) el('checkAll').checked = false;
    updateBulkUI();
    window.renderTable();
};

window.showHospitalModal = () => {
    const hospitals = [...new Set(entries.map(e => e.hospitalName).filter(n => n && !n.toLowerCase().includes('chọn') && !n.toLowerCase().includes('gmail') && !n.toLowerCase().includes('imported')))].sort();
    const listEl = el('hospitalList');
    listEl.innerHTML = '';
    if (hospitals.length === 0) {
        listEl.innerHTML = '<li class="p-4 text-center text-slate-400">Chưa có dữ liệu</li>';
    } else {
        const hospMap = {};
        entries.forEach(e => { if(e.hospitalName) hospMap[e.hospitalName] = (hospMap[e.hospitalName] || 0) + 1; });
        const sortedHospitals = hospitals.sort((a,b) => (hospMap[b]||0) - (hospMap[a]||0));
        sortedHospitals.forEach((h, index) => {
            const count = hospMap[h] || 0;
            const displayName = hospitalAliasMap[h] || h; 
            const li = document.createElement('li');
            li.className = 'p-3 md:p-4 flex items-center justify-between cursor-pointer transition-colors hover:bg-emerald-50/50 dark:hover:bg-slate-700 group border-b border-slate-50 dark:border-slate-700 last:border-b-0';
            const deleteBtn = `<button onclick="event.stopPropagation(); deleteHospital('${h}')" class="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-colors ml-2" title="Xóa toàn bộ dữ liệu bệnh viện này"><i data-lucide="trash-2" class="w-3 h-3"></i></button>`;
            li.innerHTML = `
                <div class="flex items-center gap-3 min-w-0 flex-1">
                    <span class="w-6 h-6 rounded-full bg-emerald-100 text-emerald-600 font-bold text-[10px] flex-shrink-0 flex items-center justify-center group-hover:bg-emerald-600 group-hover:text-white transition-colors">${index + 1}</span>
                    <span class="font-bold text-slate-700 dark:text-slate-200 group-hover:text-emerald-700 dark:group-hover:text-emerald-400 transition-colors truncate block w-full pr-2 text-xs md:text-sm">${displayName}</span>
                </div>
                <div class="flex items-center">
                    <span class="text-[10px] md:text-xs font-bold text-slate-400 bg-slate-100 dark:bg-slate-600 px-2 py-1 rounded-full flex-shrink-0">${count} ca</span>
                    ${checkIsAdmin(user) ? deleteBtn : ''}
                </div>
            `;
            li.onclick = () => window.selectHospitalFromModal(h);
            listEl.appendChild(li);
        });
    }
    const modal = el('hospitalModal');
    const content = el('hospitalModalContent');
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    setTimeout(() => { content.classList.remove('scale-95', 'opacity-0'); content.classList.add('scale-100', 'opacity-100'); }, 10);
};

window.selectHospitalFromModal = (name) => {
    const select = el('fHosp');
    select.value = name;
    window.closeHospitalModal();
    currentPage = 1;
    window.renderTable();
    const filterBar = el('fHosp');
    filterBar.scrollIntoView({behavior: "smooth", block: "center"});
    filterBar.classList.add('ring-2', 'ring-emerald-500');
    setTimeout(() => filterBar.classList.remove('ring-2', 'ring-emerald-500'), 2000);
};

window.closeHospitalModal = () => {
    const modal = el('hospitalModal');
    const content = el('hospitalModalContent');
    content.classList.remove('scale-100', 'opacity-100');
    content.classList.add('scale-95', 'opacity-0');
    setTimeout(() => { modal.classList.add('hidden'); modal.classList.remove('flex'); }, 200);
};

window.openMultiHospModal = () => {
    const modal = el('multiHospModal');
    const content = el('multiHospContent');
    const listContainer = el('multiHospList');
    const hospitals = [...new Set(entries.map(e => e.hospitalName).filter(n => n && !n.toLowerCase().includes('chọn') && !n.toLowerCase().includes('gmail') && !n.toLowerCase().includes('imported')))].sort();
    listContainer.innerHTML = '';
    if (hospitals.length === 0) {
        listContainer.innerHTML = '<div class="text-sm text-slate-500 italic p-2">Không có dữ liệu bệnh viện</div>';
    } else {
        hospitals.forEach(h => {
            const displayName = hospitalAliasMap[h] || h;
            const isChecked = selectedHospitals.has(h);
            const div = document.createElement('div');
            div.className = 'flex items-center gap-2 p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg cursor-pointer';
            div.onclick = (e) => {
                if (e.target.type !== 'checkbox') {
                    const cb = div.querySelector('input[type="checkbox"]');
                    cb.checked = !cb.checked;
                }
            };
            div.innerHTML = `
                <input type="checkbox" value="${h}" class="custom-checkbox flex-shrink-0" ${isChecked ? 'checked' : ''}>
                <span class="text-xs font-bold text-slate-700 dark:text-slate-200 select-none">${displayName}</span>
            `;
            listContainer.appendChild(div);
        });
    }
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    setTimeout(() => { content.classList.remove('scale-95', 'opacity-0'); content.classList.add('scale-100', 'opacity-100'); }, 10);
};

window.closeMultiHospModal = () => {
    const modal = el('multiHospModal');
    const content = el('multiHospContent');
    content.classList.remove('scale-100', 'opacity-100');
    content.classList.add('scale-95', 'opacity-0');
    setTimeout(() => { 
        modal.classList.add('hidden'); 
        modal.classList.remove('flex'); 
        const s = el('fHosp');
        if (s.value === 'custom' && selectedHospitals.size === 0) {
            s.value = 'all';
            window.renderTable();
        }
    }, 200);
};

window.toggleAllMultiHosp = (check) => {
    const cbs = document.querySelectorAll('#multiHospList input[type="checkbox"]');
    cbs.forEach(cb => cb.checked = check);
};

window.applyMultiHospSelection = () => {
    const cbs = document.querySelectorAll('#multiHospList input[type="checkbox"]');
    selectedHospitals.clear();
    cbs.forEach(cb => { if (cb.checked) selectedHospitals.add(cb.value); });
    const s = el('fHosp');
    if (selectedHospitals.size === 0) {
        s.value = 'all';
        window.showToast('Đã chuyển về chế độ "Tất cả" vì chưa chọn bệnh viện nào');
    } else {
        const customOpt = s.querySelector('option[value="custom"]');
        if (customOpt) customOpt.textContent = `(Đã chọn ${selectedHospitals.size} viện)`;
        s.value = 'custom';
    }
    window.closeMultiHospModal();
    currentPage = 1;
    window.renderTable();
};

window.editItem = (id) => {
    const entry = entries.find(e => e.id === id);
    if (!entry) return;
    el('eId').value = entry.id;
    el('eHosp').textContent = entry.hospitalName || '---';
    const d = new Date(entry.createdAt);
    el('eDate').textContent = !isNaN(d) ? d.toLocaleDateString('vi-VN') + ' ' + d.toLocaleTimeString('vi-VN') : '---';
    el('eProt').value = entry.protocol || ''; 
    el('eCTDI').value = entry.ctdi || 0;
    el('eDLP').value = entry.dlp || 0;
    el('eSlice').value = entry.sliceCount || '';
    el('eAge').value = entry.age || '';
    el('eGender').value = entry.gender || '';
    el('eWeight').value = entry.weight || '';
    el('eHeight').value = entry.height || '';
    const modVal = entry.doseModulation || entry.modulation || '';
    const modLower = String(modVal).toLowerCase();
    if (['on', 'true', 'có', 'yes', '1'].some(x => modLower.includes(x))) el('eMod').value = 'Có';
    else if (['off', 'false', 'không', 'no', '0'].some(x => modLower.includes(x))) el('eMod').value = 'Không';
    else el('eMod').value = '';
    const modal = el('editModal');
    const content = el('modalContent');
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    setTimeout(() => { content.classList.remove('scale-95', 'opacity-0'); content.classList.add('scale-100', 'opacity-100'); }, 10);
};

window.closeModal = () => {
    const modal = el('editModal');
    const content = el('modalContent');
    content.classList.remove('scale-100', 'opacity-100');
    content.classList.add('scale-95', 'opacity-0');
    setTimeout(() => { modal.classList.add('hidden'); modal.classList.remove('flex'); }, 200);
};

window.swapHeightWeight = () => {
    const wEl = el('eWeight');
    const hEl = el('eHeight');
    const temp = wEl.value;
    wEl.value = hEl.value;
    hEl.value = temp;
};

window.saveEntry = async () => {
    const isSuperAdmin = checkIsAdmin(user);
    if((!user || user.isAnonymous) && !isSuperAdmin) return;
    const id = el('eId').value;
    const w = parseFloat(el('eWeight').value);
    const h = parseFloat(el('eHeight').value);
    if ((!isNaN(w) && w > 130) || (!isNaN(w) && !isNaN(h) && w > h && h > 0)) {
        if (!confirm(`CẢNH BÁO:\nCân nặng (${w} kg) đang lớn bất thường hoặc lớn hơn chiều cao (${h} cm).\n\nBạn có chắc chắn không NHẬP NHẦM Chiều cao vào ô Cân nặng chứ?`)) return; 
    }
    const updateData = { 
        protocol: el('eProt').value, ctdi: parseFloat(el('eCTDI').value), dlp: parseFloat(el('eDLP').value), sliceCount: el('eSlice').value,
        age: parseInt(el('eAge').value), gender: el('eGender').value, weight: w, height: h, doseModulation: el('eMod').value, updatedAt: new Date().toISOString()
    };
    try { 
        if (id) {
            await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'drl_entries', id), updateData);
            window.showToast("Đã cập nhật dữ liệu!");
            window.closeModal(); 
            window.fetchData(true);
        } 
    } catch(err) { 
        if (err.code === 'resource-exhausted' || err.code === 'permission-denied') {
            if (id) { addToQueue('update', id, updateData); window.closeModal(); }
        } else { window.showAlert("Lỗi lưu trữ", err.message, 'error'); }
    }
};

window.openBulkEditModal = () => {
    if (selected.size === 0) return;
    el('bulkEditCount').innerText = selected.size;
    el('beProt').value = ""; el('beGender').value = ""; el('beMod').value = ""; el('beHosp').value = ""; el('beManu').value = ""; el('beSlice').value = "";
    const modal = el('bulkEditModal');
    const content = el('bulkEditContent');
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    setTimeout(() => { content.classList.remove('scale-95', 'opacity-0'); content.classList.add('scale-100', 'opacity-100'); }, 10);
};

window.closeBulkEditModal = () => {
    const modal = el('bulkEditModal');
    const content = el('bulkEditContent');
    content.classList.remove('scale-100', 'opacity-100');
    content.classList.add('scale-95', 'opacity-0');
    setTimeout(() => { modal.classList.add('hidden'); modal.classList.remove('flex'); }, 200);
};

window.swapSelectedHeightWeight = async () => {
    window.showConfirm('Đảo Cân nặng & Chiều cao', `Bạn có chắc chắn muốn HOÁN ĐỔI Cân nặng và Chiều cao cho ${selected.size} ca đã chọn?`, async () => {
        const BATCH_SIZE = 500; 
        const ids = Array.from(selected);
        for (let i = 0; i < ids.length; i += BATCH_SIZE) {
            const chunk = ids.slice(i, i + BATCH_SIZE);
            const currentBatch = writeBatch(db);
            chunk.forEach(id => {
                const entry = entries.find(e => e.id === id);
                if (entry) {
                    const newW = entry.height ? parseFloat(entry.height) : null;
                    const newH = entry.weight ? parseFloat(entry.weight) : null;
                    const updates = { weight: newW, height: newH, updatedAt: new Date().toISOString() };
                    const ref = doc(db, 'artifacts', appId, 'public', 'data', 'drl_entries', id);
                    currentBatch.update(ref, updates);
                    entry.weight = newW; entry.height = newH;
                }
            });
            try { await currentBatch.commit(); } 
            catch(e) { if (e.code === 'resource-exhausted' || e.code === 'permission-denied') { window.showAlert("Lỗi", "Lỗi phân quyền hoặc hết quota: " + e.message, "error"); return; } }
        }
        window.showToast(`Đã hoán đổi thành công ${ids.length} ca chụp!`);
        selected.clear();
        if(el('checkAll')) el('checkAll').checked = false;
        updateBulkUI();
        window.renderTable();
    });
};

window.saveBulkEdit = async () => {
    const updates = {};
    const p = el('beProt').value; const g = el('beGender').value; const m = el('beMod').value;
    const h = el('beHosp').value; const ma = el('beManu').value; const s = el('beSlice').value;
    if (p) updates.protocol = p; if (g) updates.gender = g; if (m) updates.doseModulation = m;
    if (h) updates.hospitalName = h; if (ma) updates.manufacturer = ma; if (s) updates.sliceCount = s;
    if (Object.keys(updates).length === 0) { window.closeBulkEditModal(); return; }
    const BATCH_SIZE = 500; 
    const ids = Array.from(selected);
    for (let i = 0; i < ids.length; i += BATCH_SIZE) {
        const chunk = ids.slice(i, i + BATCH_SIZE);
        const currentBatch = writeBatch(db);
        chunk.forEach(id => {
            const ref = doc(db, 'artifacts', appId, 'public', 'data', 'drl_entries', id);
            currentBatch.update(ref, updates);
            const localIdx = entries.findIndex(e => e.id === id);
            if(localIdx > -1) entries[localIdx] = {...entries[localIdx], ...updates};
        });
        try { await currentBatch.commit(); } 
        catch(e) { if (e.code === 'resource-exhausted' || e.code === 'permission-denied') { window.showAlert("Lỗi", "Lỗi phân quyền hoặc hết quota: " + e.message, "error"); return; } }
    }
    window.showToast(`Đã cập nhật ${ids.length} dòng dữ liệu!`);
    window.closeBulkEditModal();
    selected.clear();
    if(el('checkAll')) el('checkAll').checked = false;
    updateBulkUI();
    window.renderTable();
};

function populateFilters() {
    generateHospitalAliases(entries);
    const h = [...new Set(entries.map(e => e.hospitalName).filter(n => n && !n.toLowerCase().includes('chọn') && !n.toLowerCase().includes('gmail') && !n.toLowerCase().includes('imported')))].sort();
    const m = [...new Set(entries.map(e => e.manufacturer).filter(n => n && !n.toLowerCase().includes('chọn')))].sort();
    const protocolGroups = new Set();
    entries.forEach(e => {
        const group = getProtocolGroup(e.protocol);
        if (group !== 'Spine' && !group.toLowerCase().includes('spine') && group !== 'Khác') protocolGroups.add(group);
    });
    const p = [...protocolGroups].sort();

    const fillHosps = (id, arr) => { 
        const s = el(id); const v = s.value; 
        s.innerHTML = '<option value="all">Tất cả</option><option value="custom" class="font-bold text-indigo-600">-- Chọn theo danh sách... --</option>'; 
        arr.forEach(i => { s.innerHTML += `<option value="${i}">${hospitalAliasMap[i] || i}</option>`; }); 
        if (v === 'custom') s.value = 'custom'; else if (arr.includes(v)) s.value = v; else s.value = 'all';
    };

    const fill = (id, arr) => { 
        const s = el(id); const v = s.value; 
        s.innerHTML = '<option value="all">Tất cả</option>'; 
        arr.forEach(i => s.innerHTML += `<option value="${i}">${i}</option>`); 
        if (arr.includes(v)) s.value = v; else s.value = 'all';
    };

    const fillBulk = (id, arr, isHosp = false) => {
        const s = el(id); if (!s) return; const v = s.value;
        s.innerHTML = '<option value="">(Giữ nguyên)</option>';
        arr.forEach(i => { s.innerHTML += `<option value="${i}">${isHosp ? (hospitalAliasMap[i] || i) : i}</option>`; });
        if (arr.includes(v)) s.value = v; else s.value = '';
    };
    
    fillHosps('fHosp', h); fill('fManu', m); fill('fProt', p);
    fillBulk('beHosp', h, true); fillBulk('beManu', m, false);
}

function updateDynamicStats(data) {
    if(el('dCount')) el('dCount').innerText = data.length.toLocaleString();
    const getKFactor = (protocol) => {
        const p = (protocol || '').toLowerCase();
        if (p.includes('head') || p.includes('sọ') || p.includes('brain') || p.includes('não')) return 0.0021;
        if (p.includes('neck') || p.includes('cổ')) return 0.0059;
        if (p.includes('chest') || p.includes('ngực') || p.includes('thorax') || p.includes('phổi')) return 0.014;
        if (p.includes('abdomen') || p.includes('bụng') || p.includes('abd')) return 0.015;
        if (p.includes('pelvis') || p.includes('chậu')) return 0.015;
        if (p.includes('spine') || p.includes('cột sống')) return 0.015;
        return 0;
    };
    if (data.length === 0) {
        ['dCTDIMean','dCTDISD','dCTDIMedian', 'dDLPMean','dDLPSD','dDLPMedian', 'dLenMean','dLenMedian', 'dCTDIP75', 'dDLPP75', 'dLenP75', 'dLenSD', 'dEffMean', 'dEffSD', 'dEffMedian', 'dEffP75'].forEach(id => { const elem = el(id); if(elem) elem.innerText = 0; });
        return;
    }
    const currentHospFilter = el('fHosp').value;
    let sCTDI, sDLP, sLen, sEff;

    if (currentHospFilter === 'all' || currentHospFilter === 'custom') {
        if(el('lblCTDIMedian')) el('lblCTDIMedian').innerText = "Median (Cơ sở)";
        if(el('lblDLPMedian')) el('lblDLPMedian').innerText = "Median (Cơ sở)";
        if(el('lblLenMedian')) el('lblLenMedian').innerText = "Median (Cơ sở)";
        if(el('lblEffMedian')) el('lblEffMedian').innerText = "Median (Cơ sở)";
        const hospMap = {};
        data.forEach(e => {
            const name = (e.hospitalName || 'Unknown').trim();
            if (!hospMap[name]) hospMap[name] = { ctdi: [], dlp: [], len: [], eff: [] };
            const c = parseFloat(e.ctdi); const d = parseFloat(e.dlp); const k = getKFactor(e.protocol);
            if (!isNaN(c)) hospMap[name].ctdi.push(c);
            if (!isNaN(d)) { hospMap[name].dlp.push(d); if (k > 0) hospMap[name].eff.push(d * k); }
            if (!isNaN(c) && !isNaN(d) && c !== 0) hospMap[name].len.push(d / c);
        });
        const medCTDI = [], medDLP = [], medLen = [], medEff = [];
        Object.values(hospMap).forEach(h => {
            const cleanCTDI = filterOutliersIQR(h.ctdi); const cleanDLP = filterOutliersIQR(h.dlp);
            const cleanLen = filterOutliersIQR(h.len); const cleanEff = filterOutliersIQR(h.eff);
            if(cleanCTDI.length) medCTDI.push(calcStats(cleanCTDI).median);
            if(cleanDLP.length) medDLP.push(calcStats(cleanDLP).median);
            if(cleanLen.length) medLen.push(calcStats(cleanLen).median);
            if(cleanEff.length) medEff.push(calcStats(cleanEff).median);
        });
        sCTDI = calcStats(medCTDI); sDLP = calcStats(medDLP); sLen = calcStats(medLen); sEff = calcStats(medEff);
    } else {
        if(el('lblCTDIMedian')) el('lblCTDIMedian').innerText = "Median (50th)";
        if(el('lblDLPMedian')) el('lblDLPMedian').innerText = "Median (50th)";
        if(el('lblLenMedian')) el('lblLenMedian').innerText = "Median (50th)";
        if(el('lblEffMedian')) el('lblEffMedian').innerText = "Median (50th)";
        const ctdis = data.map(e => parseFloat(e.ctdi)).filter(n => !isNaN(n));
        const dlps = data.map(e => parseFloat(e.dlp)).filter(n => !isNaN(n));
        const lengths = []; const effDoses = [];
        data.forEach(e => {
            const c = parseFloat(e.ctdi); const d = parseFloat(e.dlp);
            if (!isNaN(c) && !isNaN(d) && c !== 0) lengths.push(d / c);
            if (!isNaN(d)) { const k = getKFactor(e.protocol); if (k > 0) effDoses.push(d * k); }
        });
        sCTDI = calcStats(filterOutliersIQR(ctdis)); sDLP = calcStats(filterOutliersIQR(dlps));
        sLen = calcStats(filterOutliersIQR(lengths)); sEff = calcStats(filterOutliersIQR(effDoses));
    }

    if(el('dCTDIMean')) el('dCTDIMean').innerText = sCTDI.mean.toFixed(2); 
    if(el('dCTDISD')) el('dCTDISD').innerText = sCTDI.sd.toFixed(2); 
    if(el('dCTDIMedian')) el('dCTDIMedian').innerText = sCTDI.median.toFixed(2); 
    if(el('dCTDIP75')) el('dCTDIP75').innerText = sCTDI.p75.toFixed(2);
    if(el('dDLPMean')) el('dDLPMean').innerText = sDLP.mean.toFixed(1); 
    if(el('dDLPSD')) el('dDLPSD').innerText = sDLP.sd.toFixed(1); 
    if(el('dDLPMedian')) el('dDLPMedian').innerText = sDLP.median.toFixed(1); 
    if(el('dDLPP75')) el('dDLPP75').innerText = sDLP.p75.toFixed(1);
    if(el('dLenMean')) el('dLenMean').innerText = sLen.mean.toFixed(1); 
    if(el('dLenSD')) el('dLenSD').innerText = sLen.sd.toFixed(1); 
    if(el('dLenMedian')) el('dLenMedian').innerText = sLen.median.toFixed(1); 
    if(el('dLenP75')) el('dLenP75').innerText = sLen.p75.toFixed(1);
    if(el('dEffMean')) el('dEffMean').innerText = sEff.mean.toFixed(2); 
    if(el('dEffSD')) el('dEffSD').innerText = sEff.sd.toFixed(2); 
    if(el('dEffMedian')) el('dEffMedian').innerText = sEff.median.toFixed(2); 
    if(el('dEffP75')) el('dEffP75').innerText = sEff.p75.toFixed(2);
}

function updateGlobalStats(data) {
    const activeData = data.filter(e => !e.isDeleted);
    if(el('statTotal')) el('statTotal').innerText = activeData.length.toLocaleString();
    const hosps = new Set(activeData.map(e => e.hospitalName).filter(Boolean));
    if(el('statHosp')) el('statHosp').innerText = hosps.size;
    let head = 0, chest = 0, abd = 0, ldct = 0;
    activeData.forEach(e => {
        const p = (e.protocol || '').toLowerCase();
        if(p.includes('low dose') || p.includes('ldct') || p.includes('liều thấp')) ldct++;
        else if (p.includes('head') || p.includes('brain') || p.includes('sọ') || p.includes('não')) head++;
        else if (p.includes('chest') || p.includes('thorax') || p.includes('ngực') || p.includes('phổi')) chest++;
        else if (p.includes('abdomen') || p.includes('abd') || p.includes('bụng')) abd++;
    });
    if(el('countHead')) el('countHead').innerText = head; 
    if(el('countChest')) el('countChest').innerText = chest; 
    if(el('countAbd')) el('countAbd').innerText = abd; 
    if(el('countLow')) el('countLow').innerText = ldct;
    
    const hospMap = {}; 
    activeData.forEach(e => { if(e.hospitalName && e.hospitalName !== 'Khác' && !e.hospitalName.toLowerCase().includes('chọn')) hospMap[e.hospitalName] = (hospMap[e.hospitalName] || 0) + 1; });
    const sortedHosps = Object.entries(hospMap).sort((a,b) => b[1] - a[1]).slice(0, 3);
    const topListEl = el('topHospitalsList');
    if(topListEl) {
        topListEl.innerHTML = sortedHosps.map(([name, count], idx) => `
        <div class="flex justify-between items-center text-[9px] md:text-[10px] font-bold text-slate-500 dark:text-slate-400 gap-2 md:gap-3" title="${hospitalAliasMap[name] || name}">
            <div class="flex items-center gap-1.5 min-w-0 flex-1">
                <div class="w-1.5 h-1.5 rounded-full flex-shrink-0 ${idx===0?'bg-emerald-500':idx===1?'bg-emerald-400':'bg-emerald-300'}"></div>
                <span class="truncate block w-full">${hospitalAliasMap[name] || name}</span>
            </div>
            <span class="text-slate-800 dark:text-white bg-slate-100 dark:bg-slate-700 px-1.5 rounded flex-shrink-0">${count}</span>
        </div>`).join('');
    }
}

window.renderTable = () => {
    const isSuperAdmin = checkIsAdmin(user);
    const isApproved = true; 
    if(user && !user.isAnonymous && !isApproved && !isSuperAdmin) return;
    const fH = el('fHosp') ? el('fHosp').value : 'all';
    const fP = el('fProt') ? el('fProt').value : 'all';
    const fM = el('fManu') ? el('fManu').value : 'all';
    const fG = el('fGender') ? el('fGender').value : 'all';
    const fMod = el('fMod') ? el('fMod').value : 'all';
    const search = el('fSearch') ? el('fSearch').value.toLowerCase() : '';
    const sort = el('fSort') ? el('fSort').value : 'date_desc';
    const fQ = el('fQuality') ? el('fQuality').value : 'all';
    const fBMI = el('fBMI') ? el('fBMI').value : 'all';
    const fSlice = el('fSlice') ? el('fSlice').value : 'all';
    const fWeightMin = el('fWeightMin') ? el('fWeightMin').value : '';
    const fWeightMax = el('fWeightMax') ? el('fWeightMax').value : '';

    filtered = entries.filter(e => isTrashMode ? e.isDeleted : !e.isDeleted);
    if (isMyDataMode && user && !user.isAnonymous) filtered = filtered.filter(e => e.userId === user.uid || (e.userEmail && e.userEmail === user.email));

    filtered = filtered.filter(e => {
        if (fH === 'custom') { if (!selectedHospitals.has(e.hospitalName)) return false; } 
        else if (fH !== 'all' && e.hospitalName !== fH) return false;
        
        if (fP !== 'all' && getProtocolGroup(e.protocol) !== fP) return false;
        if (fM !== 'all' && e.manufacturer !== fM) return false;
        if (fG !== 'all') {
            if (fG === 'M' && e.gender !== 'M' && e.gender !== 'Nam') return false;
            if (fG === 'F' && e.gender !== 'F' && e.gender !== 'Nữ') return false;
        }
        if (fMod !== 'all') {
            const state = getModState(e.doseModulation || e.modulation);
            if (fMod === 'on' && state !== 'on') return false;
            if (fMod === 'off' && state !== 'off') return false;
            if (fMod === 'unknown' && state !== 'unknown') return false;
        }
        if (fBMI !== 'all') {
            const hasBMI = e.weight && e.height && parseFloat(e.height) > 0 && parseFloat(e.weight) > 0;
            if (fBMI === 'yes' && !hasBMI) return false;
            if (fBMI === 'no' && hasBMI) return false;
        }
        if (fWeightMin !== '' || fWeightMax !== '') {
            const w = parseFloat(e.weight);
            if (!isNaN(w)) {
                const min = parseFloat(fWeightMin); const max = parseFloat(fWeightMax);
                if (!isNaN(min) && w < min) return false;
                if (!isNaN(max) && w > max) return false;
            } else return false;
        }
        if (fSlice !== 'all') {
            const sVal = e.sliceCount || '';
            if (fSlice === 'other') {
                const known = ['16 - 32 lát', '64 - 128 lát', '256 - 512 lát', 'Máy 2 bóng (Dual Source)'];
                if (known.includes(sVal)) return false;
            } else if (sVal !== fSlice) return false;
        }
        if (fQ !== 'all') {
            const isMissingId = !e.patientId || String(e.patientId).trim() === '';
            const isMissingAcc = !e.userEmail || e.userEmail === 'Unknown';
            const isMissingProt = !e.protocol;
            const isMissingDose = (!e.ctdi || parseFloat(e.ctdi) === 0) || (!e.dlp || parseFloat(e.dlp) === 0);
            const w = parseFloat(e.weight); const h = parseFloat(e.height);
            const isSwapped = (!isNaN(w) && !isNaN(h) && w > h && h > 0) || (!isNaN(w) && w > 130);
            const isAbnormalDose = getProtocolSuggestion(e.protocol, e.ctdi).isAbnormal;

            if (fQ === 'any_issue' && !(isMissingId || isMissingAcc || isMissingProt || isMissingDose || isSwapped || isAbnormalDose)) return false;
            else if (fQ === 'abnormal_dose' && !isAbnormalDose) return false;
            else if (fQ === 'swapped_hw' && !isSwapped) return false;
            else if (fQ === 'missing_id' && !isMissingId) return false;
            else if (fQ === 'missing_account' && !isMissingAcc) return false;
            else if (fQ === 'missing_protocol' && !isMissingProt) return false;
            else if (fQ === 'missing_dose' && !isMissingDose) return false;
        }
        if (search && !JSON.stringify(e).toLowerCase().includes(search)) return false;
        return true;
    });
    
    updateGlobalStats(entries); 
    const statsDiv = el('dynamicStats'); const placeholderDiv = el('statsPlaceholder');
    if (statsDiv && placeholderDiv) {
        if (!isMyDataMode && fP === 'all' && !isTrashMode) { 
            statsDiv.classList.add('hidden'); placeholderDiv.classList.remove('hidden'); 
        } else { 
            placeholderDiv.classList.add('hidden'); statsDiv.classList.remove('hidden'); updateDynamicStats(filtered); 
        }
    }

    if (sort === 'date_desc') filtered.sort((a,b) => (b.createdAt||'').localeCompare(a.createdAt||''));
    else if (sort === 'date_asc') filtered.sort((a,b) => (a.createdAt||'').localeCompare(b.createdAt||''));
    else if (sort === 'dose_desc') filtered.sort((a,b) => (parseFloat(b.dlp)||0) - (parseFloat(a.dlp)||0));
    else if (sort === 'dose_asc') filtered.sort((a,b) => (parseFloat(a.dlp)||0) - (parseFloat(b.dlp)||0));
    else if (sort === 'ctdi_desc') filtered.sort((a,b) => (parseFloat(b.ctdi)||0) - (parseFloat(a.ctdi)||0));
    else if (sort === 'ctdi_asc') filtered.sort((a,b) => (parseFloat(a.ctdi)||0) - (parseFloat(b.ctdi)||0));
    else if (sort === 'weight_desc') filtered.sort((a,b) => (parseFloat(b.weight)||0) - (parseFloat(a.weight)||0));
    else if (sort === 'weight_asc') filtered.sort((a,b) => (parseFloat(a.weight)||0) - (parseFloat(b.weight)||0));
    else if (sort === 'age_desc') filtered.sort((a,b) => (parseFloat(b.age)||0) - (parseFloat(a.age)||0));
    else if (sort === 'age_asc') filtered.sort((a,b) => (parseFloat(a.age)||0) - (parseFloat(b.age)||0));

    const totalPages = Math.ceil(filtered.length / rowsPerPage) || 1;
    if (currentPage > totalPages) currentPage = 1;
    const start = (currentPage - 1) * rowsPerPage;
    const pageData = filtered.slice(start, start + rowsPerPage);
    
    const headerRow = el('tableHeaderRow');
    if(headerRow) {
        headerRow.innerHTML = `
            <th class="p-3 md:p-4 w-12 text-center ${isViewerRole ? 'hidden' : ''}"><input type="checkbox" id="checkAll" class="custom-checkbox"></th>
            <th class="p-3 md:p-4 cursor-pointer hover:text-indigo-200 transition-colors">Ngày / ID</th>
            <th class="p-3 md:p-4">Cơ sở / Máy</th>
            <th class="p-3 md:p-4">Thông tin BN</th>
            <th class="p-3 md:p-4">Protocol</th>
            <th class="p-3 md:p-4">Người nhập</th>
            <th class="p-3 md:p-4 text-center">CTDIvol</th>
            <th class="p-3 md:p-4 text-center">DLP</th>
            <th class="p-3 md:p-4 text-right ${isViewerRole ? 'hidden' : ''}">Thao tác</th>
        `;
        if(el('checkAll')) {
            el('checkAll').onchange = (e) => { 
                const ids = filtered.slice((currentPage-1)*rowsPerPage, currentPage*rowsPerPage).map(x=>x.id);
                e.target.checked ? ids.forEach(i=>selected.add(i)) : ids.forEach(i=>selected.delete(i));
                window.renderTable();
            };
            const currentIds = filtered.slice((currentPage-1)*rowsPerPage, currentPage*rowsPerPage).map(x=>x.id);
            el('checkAll').checked = currentIds.length > 0 && currentIds.every(id => selected.has(id));
        }
    }

    const tbody = el('tableBody'); 
    if(tbody) tbody.innerHTML = '';
    
    if(pageData.length === 0 && tbody) {
        tbody.innerHTML = `<tr><td colspan="${isViewerRole ? 7 : 9}" class="p-8 md:p-16 text-center text-slate-400 dark:text-slate-500"><div class="flex flex-col items-center gap-2"><div class="bg-slate-50 dark:bg-slate-700 p-3 md:p-4 rounded-full"><i data-lucide="inbox" class="w-6 h-6 md:w-8 md:h-8 text-slate-300 dark:text-slate-500"></i></div><span>Không tìm thấy dữ liệu</span></div></td></tr>`;
        if (window.lucide) lucide.createIcons(); 
        if(el('pageInfo')) el('pageInfo').innerText = '0 kết quả'; 
        if(el('pagination')) el('pagination').innerHTML = ''; 
        return;
    }

    if(tbody) {
        pageData.forEach(e => {
            const isSel = selected.has(e.id);
            const isOwner = user && !user.isAnonymous && (user.uid === e.userId);
            const canEdit = (isOwner && !isViewerRole) || isSuperAdmin;
            const protocolClass = getProtocolClass(e.protocol);
            const createdDate = new Date(e.createdAt);
            const dateStr = createdDate.toLocaleDateString('vi-VN');
            const timeStr = createdDate.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
            const row = document.createElement('tr');
            row.className = `hover:bg-indigo-50/50 dark:hover:bg-slate-700 border-b border-slate-50 dark:border-slate-700 group transition-colors even:bg-slate-50/50 dark:even:bg-slate-800/50 ${isSel ? 'row-selected' : ''}`;
            
            if(pendingQueue.some(p => p.id === e.id)) row.classList.add('row-pending');
            
            const displayHospital = hospitalAliasMap[e.hospitalName] || e.hospitalName;
            const canSeeEmail = isOwner || isSuperAdmin || isViewerRole;
            const displayEmail = canSeeEmail ? (e.userEmail || 'Unknown') : 'Thành viên khác';
            const displayInitial = canSeeEmail ? (e.userEmail || '?').charAt(0).toUpperCase() : '?';

            const suggestion = getProtocolSuggestion(e.protocol, e.ctdi);
            let abnormalBadge = '';
            
            if (suggestion.isAbnormal) {
                let fixBtnHtml = '';
                if (suggestion.suggestedValue && canEdit) {
                    fixBtnHtml = `<button onclick="window.autoFixProtocol('${e.id}', '${suggestion.suggestedValue}')" class="mt-1 bg-indigo-600 hover:bg-indigo-700 text-white px-2 py-1 rounded text-[9px] font-bold transition-all shadow-sm flex items-center gap-1 active:scale-95"><i data-lucide="wand-2" class="w-3 h-3"></i> Đổi thành ${suggestion.suggestedLabel}</button>`;
                }
                abnormalBadge = `
                    <div class="mt-2 flex flex-col items-start">
                        <span class="inline-flex items-center gap-1 px-2 py-1 rounded text-[9px] font-black bg-purple-100 text-purple-700 border border-purple-200 shadow-sm" title="${suggestion.reason}">
                            <i data-lucide="alert-triangle" class="w-3 h-3"></i> Nhầm Protocol?
                        </span>
                        ${fixBtnHtml}
                    </div>
                `;
            }

            let actionButtons = '';
            if (canEdit) {
                if (isTrashMode) {
                    actionButtons = `
                        <button onclick="window.restoreItemAction('${e.id}')" class="p-1.5 md:p-2 text-emerald-500 hover:bg-emerald-100 dark:hover:bg-emerald-900/30 rounded-lg transition-all" title="Khôi phục"><i data-lucide="rotate-ccw" class="w-3 h-3 md:w-4 md:h-4"></i></button>
                        <button onclick="window.showConfirm('Xóa vĩnh viễn', 'Dữ liệu sẽ bị xóa hoàn toàn khỏi cơ sở dữ liệu và KHÔNG THỂ khôi phục. Bạn có chắc chắn?', () => window.permDeleteAction('${e.id}'))" class="p-1.5 md:p-2 text-red-500 hover:bg-red-100 dark:hover:bg-red-900/30 rounded-lg transition-all" title="Xóa vĩnh viễn"><i data-lucide="x-circle" class="w-3 h-3 md:w-4 md:h-4"></i></button>
                    `;
                } else {
                    actionButtons = `
                        <button onclick="window.editItem('${e.id}')" class="p-1.5 md:p-2 text-indigo-500 hover:bg-indigo-100 dark:hover:bg-indigo-900/30 rounded-lg transition-all" title="Sửa"><i data-lucide="edit-3" class="w-3 h-3 md:w-4 md:h-4"></i></button>
                        <button onclick="window.showConfirm('Xóa dữ liệu', 'Bạn có chắc chắn muốn chuyển bản ghi này vào thùng rác?', () => window.delItemAction('${e.id}'))" class="p-1.5 md:p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-all" title="Xóa"><i data-lucide="trash-2" class="w-3 h-3 md:w-4 md:h-4"></i></button>
                    `;
                }
            }

            const modState = getModState(e.doseModulation || e.modulation);
            let modBadge = '';
            if (modState === 'on') modBadge = `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-50 text-indigo-600 border border-indigo-100 dark:bg-indigo-900/30 dark:text-indigo-400 dark:border-indigo-800"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg> Mod: ON</span>`;
            else if (modState === 'off') modBadge = `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-500 border border-slate-200 dark:bg-slate-700 dark:text-slate-400 dark:border-slate-600">Mod: OFF</span>`;

            const displayAge = e.age ? `${e.age}t` : '--';
            const displayGender = e.gender ? e.gender : '--';
            const displayWeight = e.weight ? `${e.weight}kg` : '--';
            const heightM = e.height ? parseFloat(e.height) / 100 : null;
            const bmi = (e.weight && heightM) ? (parseFloat(e.weight) / (heightM * heightM)).toFixed(1) : null;
            
            let bmiLabel = ''; let bmiColorClass = 'bg-slate-100 text-slate-600 border-slate-200';
            if (bmi) {
                const bmiVal = parseFloat(bmi);
                if (bmiVal < 18.5) { bmiLabel = 'Gầy'; bmiColorClass = 'bg-blue-50 text-blue-600 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800'; }
                else if (bmiVal <= 22.9) { bmiLabel = 'Vừa'; bmiColorClass = 'bg-emerald-50 text-emerald-600 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800'; }
                else if (bmiVal < 25) { bmiLabel = 'Thừa cân'; bmiColorClass = 'bg-orange-50 text-orange-600 border-orange-200 dark:bg-orange-900/30 dark:text-orange-400 dark:border-orange-800'; }
                else { bmiLabel = 'Béo phì'; bmiColorClass = 'bg-red-50 text-red-600 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800'; }
            }

            const sliceCountVal = e.sliceCount || 'N/A';
            let sliceBadgeClass = 'bg-slate-50 text-slate-500 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700';
            if (sliceCountVal.includes('16 - 32')) sliceBadgeClass = 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/40 dark:text-blue-300 dark:border-blue-800';
            else if (sliceCountVal.includes('64 - 128')) sliceBadgeClass = 'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-900/40 dark:text-indigo-300 dark:border-indigo-800';
            else if (sliceCountVal.includes('256 - 512')) sliceBadgeClass = 'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-900/40 dark:text-purple-300 dark:border-purple-800';
            else if (sliceCountVal.includes('Dual Source')) sliceBadgeClass = 'bg-pink-50 text-pink-700 border-pink-200 dark:bg-pink-900/40 dark:text-pink-300 dark:border-pink-800';

            const manuClass = getManufacturerClass(e.manufacturer);
            const manuText = e.manufacturer && e.manufacturer !== '--' && e.manufacturer !== 'Chưa chọn' ? e.manufacturer : 'Unknown';
            const manuHtml = `<span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider border shadow-sm ${manuClass}" title="Hãng máy"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect><line x1="8" y1="21" x2="16" y2="21"></line><line x1="12" y1="17" x2="12" y2="21"></line></svg>${manuText}</span>`;
            const sliceHtml = sliceCountVal !== 'N/A' && sliceCountVal ? `<span class="inline-flex items-center gap-1.5 px-2.5 py-1 mt-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider border shadow-sm ${sliceBadgeClass}" title="Số lát cắt / Detector"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line></svg>${sliceCountVal}</span>` : '';

            row.innerHTML = `
                <td class="p-3 md:p-4 text-center ${isViewerRole ? 'hidden' : ''}"><input type="checkbox" class="custom-checkbox" onchange="window.toggleSel('${e.id}')" ${isSel ? 'checked' : ''}></td>
                <td class="p-3 md:p-4 font-bold text-slate-700 dark:text-slate-200">
                    ${dateStr}<br>
                    <span class="text-[9px] md:text-[10px] text-slate-500 dark:text-slate-400 font-medium block">${timeStr}</span>
                    <span class="text-[9px] md:text-[10px] text-slate-400 font-normal font-mono select-all block mt-1">ID: ${e.patientId || '--'}</span>
                </td>
                <td class="p-3 md:p-4 font-medium text-slate-600 dark:text-slate-300 text-[10px] md:text-[11px]">
                    <span class="block font-bold text-slate-700 dark:text-slate-200 truncate max-w-[100px] md:max-w-none">${displayHospital || '--'}</span>
                    <div class="flex flex-col gap-1.5 items-start mt-2">${manuHtml}${sliceHtml}</div>
                </td>
                <td class="p-3 md:p-4 text-[10px] md:text-[11px] text-slate-500 dark:text-slate-400 font-medium">
                    <div class="flex flex-col gap-1.5">
                        <div class="flex items-center gap-1">
                            <span class="bg-slate-100 dark:bg-slate-700 px-1.5 rounded text-slate-600 dark:text-slate-300 font-bold">${displayAge}</span>
                            <span class="bg-slate-100 dark:bg-slate-700 px-1.5 rounded text-slate-600 dark:text-slate-300 font-bold ${e.gender==='F'?'text-pink-500 dark:text-pink-400':(e.gender==='M'?'text-blue-500 dark:text-blue-400':'')}">${displayGender}</span>
                        </div>
                        <div class="flex items-center gap-1 flex-wrap">
                            <span class="bg-slate-100 dark:bg-slate-700 px-1.5 rounded text-slate-600 dark:text-slate-300">${displayWeight}</span>
                            ${e.height ? `<span class="bg-slate-100 dark:bg-slate-700 px-1.5 rounded text-slate-600 dark:text-slate-300">${e.height}cm</span>` : ''}
                            ${bmi ? `<span class="${bmiColorClass} px-1.5 rounded font-bold border text-[9px] md:text-[10px]" title="BMI: ${bmi}">${bmi} (${bmiLabel})</span>` : ''}
                        </div>
                    </div>
                </td>
                <td class="p-3 md:p-4">
                    <span class="badge-base ${protocolClass} block md:inline max-w-[120px] truncate">${getDisplayProtocol(e.protocol) || '--'}</span>
                    ${modBadge ? `<div class="mt-1">${modBadge}</div>` : ''}
                    ${abnormalBadge}
                </td>
                <td class="p-3 md:p-4 text-[10px]">
                    <div class="flex items-center gap-1.5" title="${canSeeEmail ? e.userEmail : 'Ẩn danh'}">
                        <div class="w-5 h-5 rounded-full bg-blue-100 dark:bg-blue-900/50 flex items-center justify-center text-xs font-bold text-blue-600 dark:text-blue-400">${displayInitial}</div>
                        <span class="truncate max-w-[80px] md:max-w-[120px] text-blue-600 dark:text-blue-400 font-medium">${displayEmail}</span>
                    </div>
                </td>
                <td class="p-3 md:p-4 text-center font-bold text-slate-700 dark:text-slate-200">${e.ctdi !== undefined ? e.ctdi : '--'}</td>
                <td class="p-3 md:p-4 text-center"><span class="${parseFloat(e.dlp) > 1000 ? 'badge-dose-high' : 'badge-dose'}">${e.dlp !== undefined ? e.dlp : '--'}</span></td>
                <td class="p-3 md:p-4 text-right ${isViewerRole ? 'hidden' : ''}"><div class="flex items-center justify-end gap-1.5">${actionButtons}</div></td>
            `;
            tbody.appendChild(row);
        });
    }
    const end = Math.min(start + rowsPerPage, filtered.length);
    const displayStart = filtered.length > 0 ? start + 1 : 0;
    if(el('pageInfo')) el('pageInfo').textContent = `Hiển thị ${displayStart}-${end} của ${filtered.length}`;
    renderPagination(totalPages); updateBulkUI(); 
    if (window.lucide) lucide.createIcons();
};

window.clearFilters = () => {
    if(el('fHosp')) el('fHosp').value = 'all'; if(el('fProt')) el('fProt').value = 'all'; if(el('fManu')) el('fManu').value = 'all';
    if(el('fGender')) el('fGender').value = 'all'; if(el('fMod')) el('fMod').value = 'all'; if(el('fSort')) el('fSort').value = 'date_desc'; 
    if(el('fSearch')) el('fSearch').value = ''; if(el('fQuality')) el('fQuality').value = 'all'; if(el('fBMI')) el('fBMI').value = 'all'; 
    if(el('fSlice')) el('fSlice').value = 'all'; if(el('fWeightMin')) el('fWeightMin').value = ''; if(el('fWeightMax')) el('fWeightMax').value = '';
    isMyDataMode = false;
    const btn = el('btnMyData');
    if (btn) {
        btn.classList.remove(...myDataActiveClasses);
        btn.classList.add(...myDataInactiveClasses);
        btn.innerHTML = `<i data-lucide="user" class="w-3 h-3"></i> <span class="hidden xs:inline">Lọc ca của tôi</span>`;
        if (window.lucide) lucide.createIcons();
    }
    currentPage = 1; window.renderTable(); window.showToast("Đã xóa bộ lọc!");
};

window.changeRowsPerPage = () => { if(el('rowsPerPage')) rowsPerPage = parseInt(el('rowsPerPage').value); currentPage = 1; window.renderTable(); }

window.toggleSel = (id) => { 
    selected.has(id) ? selected.delete(id) : selected.add(id); 
    updateBulkUI();
    const row = document.querySelector(`input[onchange="window.toggleSel('${id}')"]`)?.closest('tr');
    if(row) { if(selected.has(id)) row.classList.add('row-selected'); else row.classList.remove('row-selected'); }
};

function updateBulkUI() {
    const b = el('bulkToolbar');
    if(!b) return;
    if(selected.size > 0 && !isViewerRole) { 
        b.classList.remove('hidden'); b.classList.add('flex'); 
        if(el('selCount')) el('selCount').innerText = selected.size; 
    } else { b.classList.add('hidden'); b.classList.remove('flex'); }
}

window.clearSelection = () => { selected.clear(); if(el('checkAll')) el('checkAll').checked=false; window.renderTable(); };

window.deleteSelected = () => {
    const actionText = isTrashMode ? 'XÓA VĨNH VIỄN' : 'xóa';
    window.showConfirm('Xóa hàng loạt', `CẢNH BÁO: Bạn đang ${actionText} ${selected.size} dòng dữ liệu. Hành động này không thể hoàn tác!`, async () => {
        const batch = writeBatch(db);
        selected.forEach(id => {
            const ref = doc(db,'artifacts',appId,'public', 'data', 'drl_entries',id);
            if (isTrashMode) batch.delete(ref); else batch.update(ref, { isDeleted: true });
        });
        try {
            await batch.commit(); 
            selected.forEach(id => {
                if (isTrashMode) entries = entries.filter(e => e.id !== id);
                else { const idx = entries.findIndex(e => e.id === id); if (idx > -1) entries[idx].isDeleted = true; }
            });
            selected.clear(); if(el('checkAll')) el('checkAll').checked = false;
            updateBulkUI(); window.showToast("Đã xử lý dữ liệu thành công!"); window.renderTable();
        } catch(err) {
            if (err.code === 'resource-exhausted') {
                selected.forEach(id => addToQueue(isTrashMode ? 'delete' : 'soft-delete', id));
                selected.clear(); updateBulkUI();
            } else { window.showAlert("Lỗi xóa hàng loạt", "Hệ thống từ chối lệnh xóa: " + err.message, "error"); }
        }
    });
};

window.delItemAction = async (id) => { 
    try {
        await updateDoc(doc(db,'artifacts',appId,'public', 'data', 'drl_entries',id), { isDeleted: true }); 
        window.showToast("Đã chuyển vào thùng rác!"); 
        const idx = entries.findIndex(e => e.id === id);
        if (idx > -1) entries[idx].isDeleted = true;
        window.renderTable();
    } catch (err) {
        if (err.code === 'resource-exhausted') addToQueue('soft-delete', id);
        else window.showAlert("Lỗi xóa dữ liệu", "Hệ thống từ chối lệnh xóa: " + err.message, "error");
    }
};

window.restoreItemAction = async (id) => {
    try {
        await updateDoc(doc(db,'artifacts',appId,'public', 'data', 'drl_entries',id), { isDeleted: false });
        window.showToast("Đã khôi phục bản ghi!");
        const idx = entries.findIndex(e => e.id === id);
        if (idx > -1) entries[idx].isDeleted = false;
        window.renderTable();
    } catch (err) {
        if (err.code === 'resource-exhausted') window.showAlert("Lỗi", "Không thể khôi phục khi offline/hết quota", "error");
        else window.showAlert("Lỗi khôi phục", "Hệ thống từ chối lệnh khôi phục: " + err.message, "error");
    }
};

window.permDeleteAction = async (id) => {
    try {
        await deleteDoc(doc(db,'artifacts',appId,'public', 'data', 'drl_entries',id));
        window.showToast("Đã xóa vĩnh viễn!");
        entries = entries.filter(e => e.id !== id);
        window.renderTable();
    } catch (err) {
        if (err.code === 'resource-exhausted') addToQueue('delete', id);
        else window.showAlert("Lỗi xóa vĩnh viễn", "Hệ thống từ chối lệnh xóa: " + err.message, "error");
    }
};

window.autoFixProtocol = async (id, newProtocol) => {
    try {
        await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'drl_entries', id), { protocol: newProtocol, updatedAt: new Date().toISOString() });
        const idx = entries.findIndex(e => e.id === id);
        if (idx > -1) entries[idx].protocol = newProtocol;
        window.showToast(`Đã tự động đổi sang ${newProtocol}!`);
        window.renderTable(); 
    } catch (err) {
        if (err.code === 'resource-exhausted') {
            addToQueue('update', id, { protocol: newProtocol, updatedAt: new Date().toISOString() });
            const idx = entries.findIndex(e => e.id === id);
            if (idx > -1) entries[idx].protocol = newProtocol;
            window.renderTable();
        } else window.showAlert("Lỗi sửa Protocol", "Hệ thống từ chối cập nhật: " + err.message, "error");
    }
};

function renderPagination(total) {
    const c = el('pagination'); if (!c) return; c.innerHTML = '';
    const btn = (i, t, d) => `<button onclick="window.goToPage(${i})" class="page-btn ${d?'cursor-not-allowed opacity-50':''} ${i===currentPage?'active':''}" ${d?'disabled':''}>${t}</button>`;
    c.innerHTML += btn(currentPage-1, '<i data-lucide="chevron-left" class="w-3 h-3"></i>', currentPage===1);
    let range = []; 
    for(let i=1; i<=total; i++) { if(i===1 || i===total || (i >= currentPage-1 && i <= currentPage+1)) range.push(i); }
    let prev = 0; 
    range.forEach(i => { 
        if(i - prev > 1) c.innerHTML += `<span class="text-xs text-slate-400 dark:text-slate-500 px-1">...</span>`; 
        c.innerHTML += btn(i, i, false); prev = i; 
    });
    c.innerHTML += btn(currentPage+1, '<i data-lucide="chevron-right" class="w-3 h-3"></i>', currentPage===total);
    if (window.lucide) lucide.createIcons();
}

window.goToPage = (p) => { currentPage = p; window.renderTable(); };

// Set up event listeners
document.addEventListener('DOMContentLoaded', () => {
    if(el('btnExport')) {
        el('btnExport').onclick = () => {
            if(filtered.length===0) { window.showAlert("Thông báo", "Không có dữ liệu để xuất", 'info'); return; }
            try {
                const dataToExport = filtered.map(e => {
                    let dateStr = '', timeStr = '';
                    if (e.createdAt) { try { const d = new Date(e.createdAt); if (!isNaN(d.getTime())) { dateStr = d.toLocaleDateString('vi-VN'); timeStr = d.toLocaleTimeString('vi-VN'); } } catch (err) {} }
                    let bmi = '';
                    if (e.weight && e.height) {
                        const h_m = parseFloat(e.height) / 100; const w_kg = parseFloat(e.weight);
                        if (h_m > 0 && w_kg > 0) bmi = (w_kg / (h_m * h_m)).toFixed(1);
                    }
                    return {
                        "Ngày": dateStr, "Giờ": timeStr, "Bệnh viện": e.hospitalName || '', "Hãng máy": e.manufacturer || '', 
                        "Protocol": e.protocol || '', "Mã BN": e.patientId || '', "Tuổi": e.age || '', "Giới tính": e.gender || '', 
                        "Cân nặng (kg)": e.weight || '', "Chiều cao (cm)": e.height || '', "BMI": bmi,
                        "Số lát cắt": e.sliceCount || '', "CTDIvol (mGy)": e.ctdi || '', "DLP (mGy.cm)": e.dlp || '', 
                        "Modulation": e.doseModulation || e.modulation || '', "Người nhập": e.userEmail || ''
                    };
                });
                const ws = XLSX.utils.json_to_sheet(dataToExport);
                const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "VN_DRL_Data");
                XLSX.writeFile(wb, `VN_DRL_Export_${new Date().toISOString().split('T')[0]}.xlsx`);
                window.showToast("Đã xuất file Excel thành công!");
            } catch (error) { window.showAlert("Lỗi xuất file", "Có lỗi xảy ra khi tạo file Excel: " + error.message, "error"); }
        };
    }
    
    ['fHosp','fProt','fManu','fSort','fGender','fMod', 'fQuality', 'fBMI', 'fSlice'].forEach(i => {
        const element = el(i);
        if (element) element.onchange = () => { 
            if (i === 'fHosp' && element.value === 'custom') window.openMultiHospModal();
            else { currentPage = 1; window.renderTable(); }
        };
    });
    
    ['fWeightMin', 'fWeightMax'].forEach(i => {
        const element = el(i);
        if (element) { element.onkeyup = () => { currentPage = 1; window.renderTable(); }; element.onchange = () => { currentPage = 1; window.renderTable(); }; }
    });
    
    if(el('fSearch')) el('fSearch').onkeyup = () => { currentPage=1; window.renderTable(); };
    if(el('adminKeyInput')) el('adminKeyInput').addEventListener('keyup', (e) => { if(e.key === 'Enter') window.doAdminKeyLogin(); });
    if(el('authPassword')) el('authPassword').addEventListener('keyup', (e) => { if(e.key === 'Enter') window.doEmailLogin(); });
    
    if (window.lucide) lucide.createIcons();
});
