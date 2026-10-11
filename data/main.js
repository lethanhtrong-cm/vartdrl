import './ui.js';
import { el } from './utils.js';
import { state } from './state.js';
import { initAuth } from './auth.js';
import { initDataService } from './dataService.js';
import { initDashboard } from './dashboard.js';

// Init modules
initAuth();
initDataService();
initDashboard();

// Setup global DOM event listeners
document.addEventListener('DOMContentLoaded', () => {
    if(el('btnExport')) {
        el('btnExport').onclick = () => {
            if(state.filtered.length===0) { window.showAlert("Thông báo", "Không có dữ liệu để xuất", 'info'); return; }
            try {
                const dataToExport = state.filtered.map(e => {
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
                        "Số lát cắt": e.sliceCount || '', "kV": e.kV || e.kv || e.KV || '', "mAs": e.mAs || e.mas || e.MAS || '', "CTDIvol (mGy)": e.ctdi || '', "DLP (mGy.cm)": e.dlp || '', 
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
            else { state.currentPage = 1; window.renderTable(); }
        };
    });
    
    ['fWeightMin', 'fWeightMax'].forEach(i => {
        const element = el(i);
        if (element) { element.onkeyup = () => { state.currentPage = 1; window.renderTable(); }; element.onchange = () => { state.currentPage = 1; window.renderTable(); }; }
    });
    
    if(el('fSearch')) el('fSearch').onkeyup = () => { state.currentPage=1; window.renderTable(); };
    if(el('adminKeyInput')) el('adminKeyInput').addEventListener('keyup', (e) => { if(e.key === 'Enter') window.doAdminKeyLogin(); });
    if(el('authPassword')) el('authPassword').addEventListener('keyup', (e) => { if(e.key === 'Enter') window.doEmailLogin(); });
    
    if (window.lucide) lucide.createIcons();
});
