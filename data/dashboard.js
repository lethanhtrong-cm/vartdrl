import { el, getDisplayProtocol, getProtocolGroup, getProtocolSuggestion, getProtocolClass, getModState, getManufacturerClass, filterOutliersIQR, calcStats } from './utils.js';
import { state, checkIsAdmin } from './state.js';

export const initDashboard = () => {
    window.generateHospitalAliases = (data) => {
        const allHosps = [...new Set(data.map(e => e.hospitalName).filter(n => n && !n.toLowerCase().includes('chọn') && !n.toLowerCase().includes('gmail') && !n.toLowerCase().includes('imported')))].sort();
        state.hospitalAliasMap = {};
        const myHosps = new Set();
        if (state.user && !state.user.isAnonymous && !checkIsAdmin(state.user)) {
            data.forEach(e => { if (e.userId === state.user.uid || (e.userEmail && e.userEmail === state.user.email)) myHosps.add(e.hospitalName); });
        }
        const isSuperAdmin = checkIsAdmin(state.user);
        const canSeeAll = isSuperAdmin || state.isViewerRole;
        allHosps.forEach((h, idx) => {
            if (canSeeAll) state.hospitalAliasMap[h] = h;
            else if (myHosps.has(h)) state.hospitalAliasMap[h] = h;
            else state.hospitalAliasMap[h] = `Cơ sở ẩn danh #${idx + 1}`;
        });
    };

    window.populateFilters = () => {
        window.generateHospitalAliases(state.entries);
        const h = [...new Set(state.entries.map(e => e.hospitalName).filter(n => n && !n.toLowerCase().includes('chọn') && !n.toLowerCase().includes('gmail') && !n.toLowerCase().includes('imported')))].sort();
        const m = [...new Set(state.entries.map(e => e.manufacturer).filter(n => n && !n.toLowerCase().includes('chọn')))].sort();
        const protocolGroups = new Set();
        state.entries.forEach(e => { const group = getProtocolGroup(e.protocol); if (group !== 'Spine' && !group.toLowerCase().includes('spine') && group !== 'Khác') protocolGroups.add(group); });
        const p = [...protocolGroups].sort();

        const fillHosps = (id, arr) => { 
            const s = el(id); const v = s.value; 
            s.innerHTML = '<option value="all">Tất cả</option><option value="custom" class="font-bold text-indigo-600">-- Chọn theo danh sách... --</option>'; 
            arr.forEach(i => { s.innerHTML += `<option value="${i}">${state.hospitalAliasMap[i] || i}</option>`; }); 
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
            arr.forEach(i => { s.innerHTML += `<option value="${i}">${isHosp ? (state.hospitalAliasMap[i] || i) : i}</option>`; });
            if (arr.includes(v)) s.value = v; else s.value = '';
        };
        fillHosps('fHosp', h); fill('fManu', m); fill('fProt', p);
        fillBulk('beHosp', h, true); fillBulk('beManu', m, false);
    };

    window.updateGlobalStats = (data) => {
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
        if(el('countHead')) el('countHead').innerText = head; if(el('countChest')) el('countChest').innerText = chest; 
        if(el('countAbd')) el('countAbd').innerText = abd; if(el('countLow')) el('countLow').innerText = ldct;
        
        const hospMap = {}; 
        activeData.forEach(e => { if(e.hospitalName && e.hospitalName !== 'Khác' && !e.hospitalName.toLowerCase().includes('chọn')) hospMap[e.hospitalName] = (hospMap[e.hospitalName] || 0) + 1; });
        const sortedHosps = Object.entries(hospMap).sort((a,b) => b[1] - a[1]).slice(0, 3);
        const topListEl = el('topHospitalsList');
        if(topListEl) {
            topListEl.innerHTML = sortedHosps.map(([name, count], idx) => `
            <div class="flex justify-between items-center text-[9px] md:text-[10px] font-bold text-slate-500 dark:text-slate-400 gap-2 md:gap-3" title="${state.hospitalAliasMap[name] || name}">
                <div class="flex items-center gap-1.5 min-w-0 flex-1">
                    <div class="w-1.5 h-1.5 rounded-full flex-shrink-0 ${idx===0?'bg-emerald-500':idx===1?'bg-emerald-400':'bg-emerald-300'}"></div>
                    <span class="truncate block w-full">${state.hospitalAliasMap[name] || name}</span>
                </div>
                <span class="text-slate-800 dark:text-white bg-slate-100 dark:bg-slate-700 px-1.5 rounded flex-shrink-0">${count}</span>
            </div>`).join('');
        }
    };

    window.updateDynamicStats = (data) => {
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
            if(el('lblCTDIMedian')) el('lblCTDIMedian').innerText = "Median (Cơ sở)"; if(el('lblDLPMedian')) el('lblDLPMedian').innerText = "Median (Cơ sở)";
            if(el('lblLenMedian')) el('lblLenMedian').innerText = "Median (Cơ sở)"; if(el('lblEffMedian')) el('lblEffMedian').innerText = "Median (Cơ sở)";
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
                if(cleanCTDI.length) medCTDI.push(calcStats(cleanCTDI).median); if(cleanDLP.length) medDLP.push(calcStats(cleanDLP).median);
                if(cleanLen.length) medLen.push(calcStats(cleanLen).median); if(cleanEff.length) medEff.push(calcStats(cleanEff).median);
            });
            sCTDI = calcStats(medCTDI); sDLP = calcStats(medDLP); sLen = calcStats(medLen); sEff = calcStats(medEff);
        } else {
            if(el('lblCTDIMedian')) el('lblCTDIMedian').innerText = "Median (50th)"; if(el('lblDLPMedian')) el('lblDLPMedian').innerText = "Median (50th)";
            if(el('lblLenMedian')) el('lblLenMedian').innerText = "Median (50th)"; if(el('lblEffMedian')) el('lblEffMedian').innerText = "Median (50th)";
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

        if(el('dCTDIMean')) el('dCTDIMean').innerText = sCTDI.mean.toFixed(2); if(el('dCTDISD')) el('dCTDISD').innerText = sCTDI.sd.toFixed(2); 
        if(el('dCTDIMedian')) el('dCTDIMedian').innerText = sCTDI.median.toFixed(2); if(el('dCTDIP75')) el('dCTDIP75').innerText = sCTDI.p75.toFixed(2);
        if(el('dDLPMean')) el('dDLPMean').innerText = sDLP.mean.toFixed(1); if(el('dDLPSD')) el('dDLPSD').innerText = sDLP.sd.toFixed(1); 
        if(el('dDLPMedian')) el('dDLPMedian').innerText = sDLP.median.toFixed(1); if(el('dDLPP75')) el('dDLPP75').innerText = sDLP.p75.toFixed(1);
        if(el('dLenMean')) el('dLenMean').innerText = sLen.mean.toFixed(1); if(el('dLenSD')) el('dLenSD').innerText = sLen.sd.toFixed(1); 
        if(el('dLenMedian')) el('dLenMedian').innerText = sLen.median.toFixed(1); if(el('dLenP75')) el('dLenP75').innerText = sLen.p75.toFixed(1);
        if(el('dEffMean')) el('dEffMean').innerText = sEff.mean.toFixed(2); if(el('dEffSD')) el('dEffSD').innerText = sEff.sd.toFixed(2); 
        if(el('dEffMedian')) el('dEffMedian').innerText = sEff.median.toFixed(2); if(el('dEffP75')) el('dEffP75').innerText = sEff.p75.toFixed(2);
    };

    window.renderTable = () => {
        const isSuperAdmin = checkIsAdmin(state.user);
        if(state.user && !state.user.isAnonymous && !isSuperAdmin) return;
        const fH = el('fHosp') ? el('fHosp').value : 'all'; const fP = el('fProt') ? el('fProt').value : 'all';
        const fM = el('fManu') ? el('fManu').value : 'all'; const fG = el('fGender') ? el('fGender').value : 'all';
        const fMod = el('fMod') ? el('fMod').value : 'all'; const search = el('fSearch') ? el('fSearch').value.toLowerCase() : '';
        const sort = el('fSort') ? el('fSort').value : 'date_desc'; const fQ = el('fQuality') ? el('fQuality').value : 'all';
        const fBMI = el('fBMI') ? el('fBMI').value : 'all'; const fSlice = el('fSlice') ? el('fSlice').value : 'all';
        const fWeightMin = el('fWeightMin') ? el('fWeightMin').value : ''; const fWeightMax = el('fWeightMax') ? el('fWeightMax').value : '';

        state.filtered = state.entries.filter(e => state.isTrashMode ? e.isDeleted : !e.isDeleted);
        if (state.isMyDataMode && state.user && !state.user.isAnonymous) state.filtered = state.filtered.filter(e => e.userId === state.user.uid || (e.userEmail && e.userEmail === state.user.email));

        state.filtered = state.filtered.filter(e => {
            if (fH === 'custom') { if (!state.selectedHospitals.has(e.hospitalName)) return false; } 
            else if (fH !== 'all' && e.hospitalName !== fH) return false;
            
            if (fP !== 'all' && getProtocolGroup(e.protocol) !== fP) return false;
            if (fM !== 'all' && e.manufacturer !== fM) return false;
            if (fG !== 'all') { if (fG === 'M' && e.gender !== 'M' && e.gender !== 'Nam') return false; if (fG === 'F' && e.gender !== 'F' && e.gender !== 'Nữ') return false; }
            if (fMod !== 'all') {
                const mst = getModState(e.doseModulation || e.modulation);
                if (fMod === 'on' && mst !== 'on') return false; if (fMod === 'off' && mst !== 'off') return false; if (fMod === 'unknown' && mst !== 'unknown') return false;
            }
            if (fBMI !== 'all') {
                const hasBMI = e.weight && e.height && parseFloat(e.height) > 0 && parseFloat(e.weight) > 0;
                if (fBMI === 'yes' && !hasBMI) return false; if (fBMI === 'no' && hasBMI) return false;
            }
            if (fWeightMin !== '' || fWeightMax !== '') {
                const w = parseFloat(e.weight);
                if (!isNaN(w)) {
                    const min = parseFloat(fWeightMin); const max = parseFloat(fWeightMax);
                    if (!isNaN(min) && w < min) return false; if (!isNaN(max) && w > max) return false;
                } else return false;
            }
            if (fSlice !== 'all') {
                const sVal = e.sliceCount || '';
                if (fSlice === 'other') {
                    if (['16 - 32 lát', '64 - 128 lát', '256 - 512 lát', 'Máy 2 bóng (Dual Source)'].includes(sVal)) return false;
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
        
        window.updateGlobalStats(state.entries); 
        const statsDiv = el('dynamicStats'); const placeholderDiv = el('statsPlaceholder');
        if (statsDiv && placeholderDiv) {
            if (!state.isMyDataMode && fP === 'all' && !state.isTrashMode) { 
                statsDiv.classList.add('hidden'); placeholderDiv.classList.remove('hidden'); 
            } else { 
                placeholderDiv.classList.add('hidden'); statsDiv.classList.remove('hidden'); window.updateDynamicStats(state.filtered); 
            }
        }

        if (sort === 'date_desc') state.filtered.sort((a,b) => (b.createdAt||'').localeCompare(a.createdAt||''));
        else if (sort === 'date_asc') state.filtered.sort((a,b) => (a.createdAt||'').localeCompare(b.createdAt||''));
        else if (sort === 'dose_desc') state.filtered.sort((a,b) => (parseFloat(b.dlp)||0) - (parseFloat(a.dlp)||0));
        else if (sort === 'dose_asc') state.filtered.sort((a,b) => (parseFloat(a.dlp)||0) - (parseFloat(b.dlp)||0));
        else if (sort === 'ctdi_desc') state.filtered.sort((a,b) => (parseFloat(b.ctdi)||0) - (parseFloat(a.ctdi)||0));
        else if (sort === 'ctdi_asc') state.filtered.sort((a,b) => (parseFloat(a.ctdi)||0) - (parseFloat(b.ctdi)||0));
        else if (sort === 'weight_desc') state.filtered.sort((a,b) => (parseFloat(b.weight)||0) - (parseFloat(a.weight)||0));
        else if (sort === 'weight_asc') state.filtered.sort((a,b) => (parseFloat(a.weight)||0) - (parseFloat(b.weight)||0));
        else if (sort === 'age_desc') state.filtered.sort((a,b) => (parseFloat(b.age)||0) - (parseFloat(a.age)||0));
        else if (sort === 'age_asc') state.filtered.sort((a,b) => (parseFloat(a.age)||0) - (parseFloat(b.age)||0));

        const totalPages = Math.ceil(state.filtered.length / state.rowsPerPage) || 1;
        if (state.currentPage > totalPages) state.currentPage = 1;
        const start = (state.currentPage - 1) * state.rowsPerPage;
        const pageData = state.filtered.slice(start, start + state.rowsPerPage);
        
        const headerRow = el('tableHeaderRow');
        if(headerRow) {
            headerRow.innerHTML = `
                <th class="p-3 md:p-4 w-12 text-center ${state.isViewerRole ? 'hidden' : ''}"><input type="checkbox" id="checkAll" class="custom-checkbox"></th>
                <th class="p-3 md:p-4 cursor-pointer hover:text-indigo-200 transition-colors">Ngày / ID</th>
                <th class="p-3 md:p-4">Cơ sở / Máy</th>
                <th class="p-3 md:p-4">Thông tin BN</th>
                <th class="p-3 md:p-4">Protocol</th>
                <th class="p-3 md:p-4">Người nhập</th>
                <th class="p-3 md:p-4 text-center">CTDIvol</th>
                <th class="p-3 md:p-4 text-center">DLP</th>
                <th class="p-3 md:p-4 text-right ${state.isViewerRole ? 'hidden' : ''}">Thao tác</th>
            `;
            if(el('checkAll')) {
                el('checkAll').onchange = (e) => { 
                    const ids = state.filtered.slice((state.currentPage-1)*state.rowsPerPage, state.currentPage*state.rowsPerPage).map(x=>x.id);
                    e.target.checked ? ids.forEach(i=>state.selected.add(i)) : ids.forEach(i=>state.selected.delete(i));
                    window.renderTable();
                };
                const currentIds = state.filtered.slice((state.currentPage-1)*state.rowsPerPage, state.currentPage*state.rowsPerPage).map(x=>x.id);
                el('checkAll').checked = currentIds.length > 0 && currentIds.every(id => state.selected.has(id));
            }
        }

        const tbody = el('tableBody'); if(tbody) tbody.innerHTML = '';
        if(pageData.length === 0 && tbody) {
            tbody.innerHTML = `<tr><td colspan="${state.isViewerRole ? 7 : 9}" class="p-8 md:p-16 text-center text-slate-400 dark:text-slate-500"><div class="flex flex-col items-center gap-2"><div class="bg-slate-50 dark:bg-slate-700 p-3 md:p-4 rounded-full"><i data-lucide="inbox" class="w-6 h-6 md:w-8 md:h-8 text-slate-300 dark:text-slate-500"></i></div><span>Không tìm thấy dữ liệu</span></div></td></tr>`;
            if (window.lucide) lucide.createIcons(); 
            if(el('pageInfo')) el('pageInfo').innerText = '0 kết quả'; if(el('pagination')) el('pagination').innerHTML = ''; 
            return;
        }

        if(tbody) {
            pageData.forEach(e => {
                const isSel = state.selected.has(e.id);
                const isOwner = state.user && !state.user.isAnonymous && (state.user.uid === e.userId);
                const canEdit = (isOwner && !state.isViewerRole) || isSuperAdmin;
                const protocolClass = getProtocolClass(e.protocol);
                const createdDate = new Date(e.createdAt);
                const dateStr = createdDate.toLocaleDateString('vi-VN'); const timeStr = createdDate.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
                const row = document.createElement('tr');
                row.className = `hover:bg-indigo-50/50 dark:hover:bg-slate-700 border-b border-slate-50 dark:border-slate-700 group transition-colors even:bg-slate-50/50 dark:even:bg-slate-800/50 ${isSel ? 'row-selected' : ''}`;
                if(state.pendingQueue.some(p => p.id === e.id)) row.classList.add('row-pending');
                
                const displayHospital = state.hospitalAliasMap[e.hospitalName] || e.hospitalName;
                const canSeeEmail = isOwner || isSuperAdmin || state.isViewerRole;
                const displayEmail = canSeeEmail ? (e.userEmail || 'Unknown') : 'Thành viên khác';
                const displayInitial = canSeeEmail ? (e.userEmail || '?').charAt(0).toUpperCase() : '?';

                const suggestion = getProtocolSuggestion(e.protocol, e.ctdi);
                let abnormalBadge = '';
                if (suggestion.isAbnormal) {
                    let fixBtnHtml = '';
                    if (suggestion.suggestedValue && canEdit) { fixBtnHtml = `<button onclick="window.autoFixProtocol('${e.id}', '${suggestion.suggestedValue}')" class="mt-1 bg-indigo-600 hover:bg-indigo-700 text-white px-2 py-1 rounded text-[9px] font-bold transition-all shadow-sm flex items-center gap-1 active:scale-95"><i data-lucide="wand-2" class="w-3 h-3"></i> Đổi thành ${suggestion.suggestedLabel}</button>`; }
                    abnormalBadge = `<div class="mt-2 flex flex-col items-start"><span class="inline-flex items-center gap-1 px-2 py-1 rounded text-[9px] font-black bg-purple-100 text-purple-700 border border-purple-200 shadow-sm" title="${suggestion.reason}"><i data-lucide="alert-triangle" class="w-3 h-3"></i> Nhầm Protocol?</span>${fixBtnHtml}</div>`;
                }

                let actionButtons = '';
                if (canEdit) {
                    if (state.isTrashMode) {
                        actionButtons = `<button onclick="window.restoreItemAction('${e.id}')" class="p-1.5 md:p-2 text-emerald-500 hover:bg-emerald-100 dark:hover:bg-emerald-900/30 rounded-lg transition-all" title="Khôi phục"><i data-lucide="rotate-ccw" class="w-3 h-3 md:w-4 md:h-4"></i></button>
                                         <button onclick="window.showConfirm('Xóa vĩnh viễn', 'Dữ liệu sẽ bị xóa hoàn toàn khỏi cơ sở dữ liệu và KHÔNG THỂ khôi phục. Bạn có chắc chắn?', () => window.permDeleteAction('${e.id}'))" class="p-1.5 md:p-2 text-red-500 hover:bg-red-100 dark:hover:bg-red-900/30 rounded-lg transition-all" title="Xóa vĩnh viễn"><i data-lucide="x-circle" class="w-3 h-3 md:w-4 md:h-4"></i></button>`;
                    } else {
                        actionButtons = `<button onclick="window.editItem('${e.id}')" class="p-1.5 md:p-2 text-indigo-500 hover:bg-indigo-100 dark:hover:bg-indigo-900/30 rounded-lg transition-all" title="Sửa"><i data-lucide="edit-3" class="w-3 h-3 md:w-4 md:h-4"></i></button>
                                         <button onclick="window.showConfirm('Xóa dữ liệu', 'Bạn có chắc chắn muốn chuyển bản ghi này vào thùng rác?', () => window.delItemAction('${e.id}'))" class="p-1.5 md:p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-all" title="Xóa"><i data-lucide="trash-2" class="w-3 h-3 md:w-4 md:h-4"></i></button>`;
                    }
                }

                const modState = getModState(e.doseModulation || e.modulation);
                let modBadge = '';
                if (modState === 'on') modBadge = `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-50 text-indigo-600 border border-indigo-100 dark:bg-indigo-900/30 dark:text-indigo-400 dark:border-indigo-800"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg> Mod: ON</span>`;
                else if (modState === 'off') modBadge = `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-500 border border-slate-200 dark:bg-slate-700 dark:text-slate-400 dark:border-slate-600">Mod: OFF</span>`;

                const displayAge = e.age ? `${e.age}t` : '--'; const displayGender = e.gender ? e.gender : '--'; const displayWeight = e.weight ? `${e.weight}kg` : '--';
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
                    <td class="p-3 md:p-4 text-center ${state.isViewerRole ? 'hidden' : ''}"><input type="checkbox" class="custom-checkbox" onchange="window.toggleSel('${e.id}')" ${isSel ? 'checked' : ''}></td>
                    <td class="p-3 md:p-4 font-bold text-slate-700 dark:text-slate-200">
                        ${dateStr}<br><span class="text-[9px] md:text-[10px] text-slate-500 dark:text-slate-400 font-medium block">${timeStr}</span><span class="text-[9px] md:text-[10px] text-slate-400 font-normal font-mono select-all block mt-1">ID: ${e.patientId || '--'}</span>
                    </td>
                    <td class="p-3 md:p-4 font-medium text-slate-600 dark:text-slate-300 text-[10px] md:text-[11px]">
                        <span class="block font-bold text-slate-700 dark:text-slate-200 truncate max-w-[100px] md:max-w-none">${displayHospital || '--'}</span><div class="flex flex-col gap-1.5 items-start mt-2">${manuHtml}${sliceHtml}</div>
                    </td>
                    <td class="p-3 md:p-4 text-[10px] md:text-[11px] text-slate-500 dark:text-slate-400 font-medium">
                        <div class="flex flex-col gap-1.5">
                            <div class="flex items-center gap-1"><span class="bg-slate-100 dark:bg-slate-700 px-1.5 rounded text-slate-600 dark:text-slate-300 font-bold">${displayAge}</span><span class="bg-slate-100 dark:bg-slate-700 px-1.5 rounded text-slate-600 dark:text-slate-300 font-bold ${e.gender==='F'?'text-pink-500 dark:text-pink-400':(e.gender==='M'?'text-blue-500 dark:text-blue-400':'')}">${displayGender}</span></div>
                            <div class="flex items-center gap-1 flex-wrap"><span class="bg-slate-100 dark:bg-slate-700 px-1.5 rounded text-slate-600 dark:text-slate-300">${displayWeight}</span>${e.height ? `<span class="bg-slate-100 dark:bg-slate-700 px-1.5 rounded text-slate-600 dark:text-slate-300">${e.height}cm</span>` : ''}${bmi ? `<span class="${bmiColorClass} px-1.5 rounded font-bold border text-[9px] md:text-[10px]" title="BMI: ${bmi}">${bmi} (${bmiLabel})</span>` : ''}</div>
                        </div>
                    </td>
                    <td class="p-3 md:p-4"><span class="badge-base ${protocolClass} block md:inline max-w-[120px] truncate">${getDisplayProtocol(e.protocol) || '--'}</span>${modBadge ? `<div class="mt-1">${modBadge}</div>` : ''}${abnormalBadge}</td>
                    <td class="p-3 md:p-4 text-[10px]">
                        <div class="flex items-center gap-1.5" title="${canSeeEmail ? e.userEmail : 'Ẩn danh'}"><div class="w-5 h-5 rounded-full bg-blue-100 dark:bg-blue-900/50 flex items-center justify-center text-xs font-bold text-blue-600 dark:text-blue-400">${displayInitial}</div><span class="truncate max-w-[80px] md:max-w-[120px] text-blue-600 dark:text-blue-400 font-medium">${displayEmail}</span></div>
                    </td>
                    <td class="p-3 md:p-4 text-center font-bold text-slate-700 dark:text-slate-200">${e.ctdi !== undefined ? e.ctdi : '--'}</td>
                    <td class="p-3 md:p-4 text-center"><span class="${parseFloat(e.dlp) > 1000 ? 'badge-dose-high' : 'badge-dose'}">${e.dlp !== undefined ? e.dlp : '--'}</span></td>
                    <td class="p-3 md:p-4 text-right ${state.isViewerRole ? 'hidden' : ''}"><div class="flex items-center justify-end gap-1.5">${actionButtons}</div></td>
                `;
                tbody.appendChild(row);
            });
        }
        const end = Math.min(start + state.rowsPerPage, state.filtered.length); const displayStart = state.filtered.length > 0 ? start + 1 : 0;
        if(el('pageInfo')) el('pageInfo').textContent = `Hiển thị ${displayStart}-${end} của ${state.filtered.length}`;
        window.renderPagination(totalPages); window.updateBulkUI(); if (window.lucide) lucide.createIcons();
    };

    window.renderPagination = (total) => {
        const c = el('pagination'); if (!c) return; c.innerHTML = '';
        const btn = (i, t, d) => `<button onclick="window.goToPage(${i})" class="page-btn ${d?'cursor-not-allowed opacity-50':''} ${i===state.currentPage?'active':''}" ${d?'disabled':''}>${t}</button>`;
        c.innerHTML += btn(state.currentPage-1, '<i data-lucide="chevron-left" class="w-3 h-3"></i>', state.currentPage===1);
        let range = []; for(let i=1; i<=total; i++) { if(i===1 || i===total || (i >= state.currentPage-1 && i <= state.currentPage+1)) range.push(i); }
        let prev = 0; 
        range.forEach(i => { if(i - prev > 1) c.innerHTML += `<span class="text-xs text-slate-400 dark:text-slate-500 px-1">...</span>`; c.innerHTML += btn(i, i, false); prev = i; });
        c.innerHTML += btn(state.currentPage+1, '<i data-lucide="chevron-right" class="w-3 h-3"></i>', state.currentPage===total);
        if (window.lucide) lucide.createIcons();
    };
    window.goToPage = (p) => { state.currentPage = p; window.renderTable(); };
    window.changeRowsPerPage = () => { if(el('rowsPerPage')) state.rowsPerPage = parseInt(el('rowsPerPage').value); state.currentPage = 1; window.renderTable(); }

    window.toggleSel = (id) => { 
        state.selected.has(id) ? state.selected.delete(id) : state.selected.add(id); window.updateBulkUI();
        const row = document.querySelector(`input[onchange="window.toggleSel('${id}')"]`)?.closest('tr');
        if(row) { if(state.selected.has(id)) row.classList.add('row-selected'); else row.classList.remove('row-selected'); }
    };
    window.updateBulkUI = () => {
        const b = el('bulkToolbar'); if(!b) return;
        if(state.selected.size > 0 && !state.isViewerRole) { b.classList.remove('hidden'); b.classList.add('flex'); if(el('selCount')) el('selCount').innerText = state.selected.size; } 
        else { b.classList.add('hidden'); b.classList.remove('flex'); }
    }
    window.clearSelection = () => { state.selected.clear(); if(el('checkAll')) el('checkAll').checked=false; window.renderTable(); };

    window.clearFilters = () => {
        if(el('fHosp')) el('fHosp').value = 'all'; if(el('fProt')) el('fProt').value = 'all'; if(el('fManu')) el('fManu').value = 'all';
        if(el('fGender')) el('fGender').value = 'all'; if(el('fMod')) el('fMod').value = 'all'; if(el('fSort')) el('fSort').value = 'date_desc'; 
        if(el('fSearch')) el('fSearch').value = ''; if(el('fQuality')) el('fQuality').value = 'all'; if(el('fBMI')) el('fBMI').value = 'all'; 
        if(el('fSlice')) el('fSlice').value = 'all'; if(el('fWeightMin')) el('fWeightMin').value = ''; if(el('fWeightMax')) el('fWeightMax').value = '';
        state.isMyDataMode = false;
        const btn = el('btnMyData');
        if (btn) {
            btn.classList.remove('bg-purple-800', 'text-white', 'border-purple-800', 'ring-2', 'ring-purple-400', 'shadow-inner');
            btn.classList.add('bg-purple-600', 'text-white', 'border-purple-600', 'shadow-md', 'shadow-purple-500/30', 'hover:bg-purple-700', 'dark:bg-purple-600', 'dark:hover:bg-purple-700');
            btn.innerHTML = `<i data-lucide="user" class="w-3 h-3"></i> <span class="hidden xs:inline">Lọc ca của tôi</span>`;
            if (window.lucide) lucide.createIcons();
        }
        state.currentPage = 1; window.renderTable(); window.showToast("Đã xóa bộ lọc!");
    };
    
    window.toggleMyData = () => {
        state.isMyDataMode = !state.isMyDataMode;
        const btn = el('btnMyData');
        if (state.isMyDataMode) {
            btn.classList.remove('bg-purple-600', 'text-white', 'border-purple-600', 'shadow-md', 'shadow-purple-500/30', 'hover:bg-purple-700', 'dark:bg-purple-600', 'dark:hover:bg-purple-700');
            btn.classList.add('bg-purple-800', 'text-white', 'border-purple-800', 'ring-2', 'ring-purple-400', 'shadow-inner');
            btn.innerHTML = `<i data-lucide="user-check" class="w-3 h-3"></i> <span class="hidden xs:inline">Đang lọc của tôi</span>`;
        } else {
            btn.classList.remove('bg-purple-800', 'text-white', 'border-purple-800', 'ring-2', 'ring-purple-400', 'shadow-inner');
            btn.classList.add('bg-purple-600', 'text-white', 'border-purple-600', 'shadow-md', 'shadow-purple-500/30', 'hover:bg-purple-700', 'dark:bg-purple-600', 'dark:hover:bg-purple-700');
            btn.innerHTML = `<i data-lucide="user" class="w-3 h-3"></i> <span class="hidden xs:inline">Lọc ca của tôi</span>`;
        }
        if (window.lucide) lucide.createIcons();
        if (state.isMyDataMode) window.showToast("Đã bật chế độ lọc dữ liệu của bạn");
        state.currentPage = 1; window.renderTable();
    };

    window.toggleTrashMode = () => {
        state.isTrashMode = !state.isTrashMode;
        const btn = el('btnTrash');
        if (state.isTrashMode) {
            btn.classList.remove('bg-white', 'dark:bg-slate-800', 'text-slate-500', 'dark:text-slate-400');
            btn.classList.add('bg-red-100', 'text-red-600', 'border-red-200', 'dark:bg-red-900/30', 'dark:text-red-400', 'dark:border-red-800');
            btn.innerHTML = `<i data-lucide="trash-2" class="w-3 h-3"></i> <span class="hidden xs:inline">Đang xem thùng rác</span><span class="inline xs:hidden">Thùng rác (ON)</span>`;
        } else {
            btn.classList.add('bg-white', 'dark:bg-slate-800', 'text-slate-500', 'dark:text-slate-400');
            btn.classList.remove('bg-red-100', 'text-red-600', 'border-red-200', 'dark:bg-red-900/30', 'dark:text-red-400', 'dark:border-red-800');
            btn.innerHTML = `<i data-lucide="trash-2" class="w-3 h-3"></i> <span class="hidden xs:inline">Thùng rác</span>`;
        }
        state.currentPage = 1; state.selected.clear(); if(el('checkAll')) el('checkAll').checked = false;
        window.updateBulkUI(); window.renderTable();
    };
};
