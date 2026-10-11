import { db, appId } from './firebase.js';
import { collection, doc, getDocs, updateDoc, deleteDoc, addDoc, writeBatch } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { state, CONSTANTS, checkIsAdmin } from './state.js';
import { el } from './utils.js';

export function updatePendingUI() {
    const count = state.pendingQueue.length;
    if (count > 0) {
        el('btnSync').classList.remove('hidden'); el('pendingCountDisplay').textContent = count; el('offlineBanner').classList.remove('hidden');
    } else { el('btnSync').classList.add('hidden'); }
}

export function mergePendingChanges() {
    state.pendingQueue.forEach(item => {
        if (item.type === 'create') {
            state.entries.unshift({id: item.id, ...item.data, createdAt: item.timestamp});
        } else if (item.type === 'update') {
            const idx = state.entries.findIndex(e => e.id === item.id);
            if (idx > -1) state.entries[idx] = { ...state.entries[idx], ...item.data };
        } else if (item.type === 'delete') {
            state.entries = state.entries.filter(e => e.id !== item.id);
        } else if (item.type === 'soft-delete') {
            const idx = state.entries.findIndex(e => e.id === item.id);
            if (idx > -1) state.entries[idx].isDeleted = true;
        }
    });
    updatePendingUI();
}

export function addToQueue(type, id, data = null) {
    state.pendingQueue.push({ type, id, data, timestamp: Date.now() });
    localStorage.setItem(CONSTANTS.LS_KEY_PENDING, JSON.stringify(state.pendingQueue));
    mergePendingChanges();
    window.showToast("Đã hết hạn ngạch. Dữ liệu được lưu tạm cục bộ.");
    if(window.renderTable) window.renderTable();
}

export const initDataService = () => {
    window.fetchData = async (manual = false) => {
        if (!state.user && !checkIsAdmin(state.user)) return;
        try {
            const snap = await getDocs(collection(db, 'artifacts', appId, 'public', 'data', 'drl_entries'));
            state.entries = snap.docs.map(d => ({id: d.id, ...d.data()}));
            localStorage.setItem(CONSTANTS.LS_KEY_DATA, JSON.stringify(state.entries));
            el('offlineBanner').classList.add('hidden');
            if(manual) window.showToast("Đã cập nhật dữ liệu mới nhất!");
        } catch (err) {
            console.error("Fetch Error:", err);
            if (err.code === 'resource-exhausted' || err.code === 'unavailable') {
                const cached = localStorage.getItem(CONSTANTS.LS_KEY_DATA);
                if (cached) {
                    state.entries = JSON.parse(cached);
                    el('offlineBanner').classList.remove('hidden');
                    if(manual) window.showToast("Đang xem dữ liệu ngoại tuyến (Hết hạn ngạch)");
                }
            }
        } finally {
            mergePendingChanges();
            if(window.generateHospitalAliases) window.generateHospitalAliases(state.entries);
            if(window.populateFilters) window.populateFilters();
            if(window.renderTable) window.renderTable();
        }
    };

    window.syncData = async () => {
        const newQueue = [];
        for (const item of state.pendingQueue) {
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
                if(e.code === 'resource-exhausted') { window.showAlert("Lỗi", "Vẫn chưa có hạn ngạch. Vui lòng thử lại sau.", "error"); return; }
                newQueue.push(item);
            }
        }
        state.pendingQueue = newQueue; localStorage.setItem(CONSTANTS.LS_KEY_PENDING, JSON.stringify(state.pendingQueue));
        updatePendingUI();
        if (state.pendingQueue.length === 0) { window.showToast("Đồng bộ thành công!"); window.fetchData(true); }
    };

    window.deleteHospital = async (name) => {
        window.showConfirm('Xóa bệnh viện', `Bạn có chắc chắn muốn xóa toàn bộ dữ liệu của "${name}"? Hành động này không thể hoàn tác.`, async () => {
            const idsToDelete = state.entries.filter(e => e.hospitalName === name).map(e => e.id);
            if (idsToDelete.length === 0) { window.showToast("Không tìm thấy dữ liệu để xóa."); return; }
            const BATCH_SIZE = 500;
            for (let i = 0; i < idsToDelete.length; i += BATCH_SIZE) {
                const chunk = idsToDelete.slice(i, i + BATCH_SIZE);
                const currentBatch = writeBatch(db);
                chunk.forEach(id => { currentBatch.delete(doc(db, 'artifacts', appId, 'public', 'data', 'drl_entries', id)); });
                try { await currentBatch.commit(); } 
                catch(e) { if (e.code === 'resource-exhausted' || e.code === 'permission-denied') { window.showAlert("Lỗi", "Lỗi phân quyền hoặc hết quota: " + e.message, "error"); return; } }
            }
            window.showToast(`Đã xóa bệnh viện ${name}`); window.closeHospitalModal(); window.fetchData(true);
        });
    };

    window.saveEntry = async () => {
        const isSuperAdmin = checkIsAdmin(state.user);
        if((!state.user || state.user.isAnonymous) && !isSuperAdmin) return;
        const id = el('eId').value; const w = parseFloat(el('eWeight').value); const h = parseFloat(el('eHeight').value);
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
                window.showToast("Đã cập nhật dữ liệu!"); window.closeModal(); window.fetchData(true);
            } 
        } catch(err) { 
            if (err.code === 'resource-exhausted' || err.code === 'permission-denied') {
                if (id) { addToQueue('update', id, updateData); window.closeModal(); }
            } else { window.showAlert("Lỗi lưu trữ", err.message, 'error'); }
        }
    };

    window.swapSelectedHeightWeight = async () => {
        window.showConfirm('Đảo Cân nặng & Chiều cao', `Bạn có chắc chắn muốn HOÁN ĐỔI Cân nặng và Chiều cao cho ${state.selected.size} ca đã chọn?`, async () => {
            const BATCH_SIZE = 500; const ids = Array.from(state.selected);
            for (let i = 0; i < ids.length; i += BATCH_SIZE) {
                const chunk = ids.slice(i, i + BATCH_SIZE);
                const currentBatch = writeBatch(db);
                chunk.forEach(id => {
                    const entry = state.entries.find(e => e.id === id);
                    if (entry) {
                        const newW = entry.height ? parseFloat(entry.height) : null;
                        const newH = entry.weight ? parseFloat(entry.weight) : null;
                        const updates = { weight: newW, height: newH, updatedAt: new Date().toISOString() };
                        currentBatch.update(doc(db, 'artifacts', appId, 'public', 'data', 'drl_entries', id), updates);
                        entry.weight = newW; entry.height = newH;
                    }
                });
                try { await currentBatch.commit(); } 
                catch(e) { if (e.code === 'resource-exhausted' || e.code === 'permission-denied') { window.showAlert("Lỗi", "Lỗi phân quyền hoặc hết quota: " + e.message, "error"); return; } }
            }
            window.showToast(`Đã hoán đổi thành công ${ids.length} ca chụp!`);
            state.selected.clear(); if(el('checkAll')) el('checkAll').checked = false;
            window.updateBulkUI(); window.renderTable();
        });
    };

    window.saveBulkEdit = async () => {
        const updates = {};
        const p = el('beProt').value; const g = el('beGender').value; const m = el('beMod').value;
        const h = el('beHosp').value; const ma = el('beManu').value; const s = el('beSlice').value;
        if (p) updates.protocol = p; if (g) updates.gender = g; if (m) updates.doseModulation = m;
        if (h) updates.hospitalName = h; if (ma) updates.manufacturer = ma; if (s) updates.sliceCount = s;
        if (Object.keys(updates).length === 0) { window.closeBulkEditModal(); return; }
        const BATCH_SIZE = 500; const ids = Array.from(state.selected);
        for (let i = 0; i < ids.length; i += BATCH_SIZE) {
            const chunk = ids.slice(i, i + BATCH_SIZE);
            const currentBatch = writeBatch(db);
            chunk.forEach(id => {
                currentBatch.update(doc(db, 'artifacts', appId, 'public', 'data', 'drl_entries', id), updates);
                const localIdx = state.entries.findIndex(e => e.id === id);
                if(localIdx > -1) state.entries[localIdx] = {...state.entries[localIdx], ...updates};
            });
            try { await currentBatch.commit(); } 
            catch(e) { if (e.code === 'resource-exhausted' || e.code === 'permission-denied') { window.showAlert("Lỗi", "Lỗi phân quyền hoặc hết quota: " + e.message, "error"); return; } }
        }
        window.showToast(`Đã cập nhật ${ids.length} dòng dữ liệu!`);
        window.closeBulkEditModal(); state.selected.clear(); if(el('checkAll')) el('checkAll').checked = false;
        window.updateBulkUI(); window.renderTable();
    };

    window.deleteSelected = () => {
        const actionText = state.isTrashMode ? 'XÓA VĨNH VIỄN' : 'xóa';
        window.showConfirm('Xóa hàng loạt', `CẢNH BÁO: Bạn đang ${actionText} ${state.selected.size} dòng dữ liệu. Hành động này không thể hoàn tác!`, async () => {
            const batch = writeBatch(db);
            state.selected.forEach(id => {
                const ref = doc(db,'artifacts',appId,'public', 'data', 'drl_entries',id);
                if (state.isTrashMode) batch.delete(ref); else batch.update(ref, { isDeleted: true });
            });
            try {
                await batch.commit(); 
                state.selected.forEach(id => {
                    if (state.isTrashMode) state.entries = state.entries.filter(e => e.id !== id);
                    else { const idx = state.entries.findIndex(e => e.id === id); if (idx > -1) state.entries[idx].isDeleted = true; }
                });
                state.selected.clear(); if(el('checkAll')) el('checkAll').checked = false;
                window.updateBulkUI(); window.showToast("Đã xử lý dữ liệu thành công!"); window.renderTable();
            } catch(err) {
                if (err.code === 'resource-exhausted') {
                    state.selected.forEach(id => addToQueue(state.isTrashMode ? 'delete' : 'soft-delete', id));
                    state.selected.clear(); window.updateBulkUI();
                } else { window.showAlert("Lỗi xóa hàng loạt", "Hệ thống từ chối lệnh xóa: " + err.message, "error"); }
            }
        });
    };

    window.delItemAction = async (id) => { 
        try {
            await updateDoc(doc(db,'artifacts',appId,'public', 'data', 'drl_entries',id), { isDeleted: true }); 
            window.showToast("Đã chuyển vào thùng rác!"); 
            const idx = state.entries.findIndex(e => e.id === id); if (idx > -1) state.entries[idx].isDeleted = true; window.renderTable();
        } catch (err) { if (err.code === 'resource-exhausted') addToQueue('soft-delete', id); else window.showAlert("Lỗi xóa dữ liệu", "Hệ thống từ chối lệnh xóa: " + err.message, "error"); }
    };

    window.restoreItemAction = async (id) => {
        try {
            await updateDoc(doc(db,'artifacts',appId,'public', 'data', 'drl_entries',id), { isDeleted: false });
            window.showToast("Đã khôi phục bản ghi!");
            const idx = state.entries.findIndex(e => e.id === id); if (idx > -1) state.entries[idx].isDeleted = false; window.renderTable();
        } catch (err) { if (err.code === 'resource-exhausted') window.showAlert("Lỗi", "Không thể khôi phục khi offline/hết quota", "error"); else window.showAlert("Lỗi khôi phục", "Hệ thống từ chối lệnh khôi phục: " + err.message, "error"); }
    };

    window.permDeleteAction = async (id) => {
        try {
            await deleteDoc(doc(db,'artifacts',appId,'public', 'data', 'drl_entries',id));
            window.showToast("Đã xóa vĩnh viễn!"); state.entries = state.entries.filter(e => e.id !== id); window.renderTable();
        } catch (err) { if (err.code === 'resource-exhausted') addToQueue('delete', id); else window.showAlert("Lỗi xóa vĩnh viễn", "Hệ thống từ chối lệnh xóa: " + err.message, "error"); }
    };

    window.autoFixProtocol = async (id, newProtocol) => {
        try {
            await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'drl_entries', id), { protocol: newProtocol, updatedAt: new Date().toISOString() });
            const idx = state.entries.findIndex(e => e.id === id); if (idx > -1) state.entries[idx].protocol = newProtocol;
            window.showToast(`Đã tự động đổi sang ${newProtocol}!`); window.renderTable(); 
        } catch (err) {
            if (err.code === 'resource-exhausted') { addToQueue('update', id, { protocol: newProtocol, updatedAt: new Date().toISOString() }); const idx = state.entries.findIndex(e => e.id === id); if (idx > -1) state.entries[idx].protocol = newProtocol; window.renderTable(); } 
            else window.showAlert("Lỗi sửa Protocol", "Hệ thống từ chối cập nhật: " + err.message, "error");
        }
    };
};
