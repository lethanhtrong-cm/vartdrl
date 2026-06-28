import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, doc, getDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// =========================================================================
// 1. CẤU HÌNH & KHỞI TẠO FIREBASE (ĐƯỢC EXPORT ĐỂ CÁC MODULE KHÁC DÙNG CHUNG)
// =========================================================================
const firebaseConfig = {
    apiKey: "AIzaSyDqdo_DJIWa5iqxiCgBq-0iGX7f9sr6soo",
    authDomain: "rt-examination.firebaseapp.com",
    databaseURL: "https://rt-examination-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "rt-examination",
    storageBucket: "rt-examination.firebasestorage.app",
    messagingSenderId: "920482699854",
    appId: "1:920482699854:web:44f9b0d735bdc001c6c11f",
    measurementId: "G-8N7RTTREQM"
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

// =========================================================================
// 2. HÀM TIỆN ÍCH HỖ TRỢ TOÀN HỆ THỐNG (UTILITIES)
// =========================================================================
export function safeRedirect(path) {
    if (window.location.protocol === 'blob:') {
        console.warn("Đang ở môi trường Preview, giả lập chuyển hướng tới:", path);
        alert(`Chuyển hướng đến: ${path}`);
    } else {
        window.location.href = path;
    }
}

export function formatDate(dateData) {
    if (dateData && typeof dateData.toDate === 'function') {
        return dateData.toDate().toLocaleString('vi-VN');
    }
    return new Date(dateData).toLocaleString('vi-VN');
}

// =========================================================================
// 3. LOGIC UI: ĐIỀU HƯỚNG TAB, DROPDOWN & ĐỔI TIÊU ĐỀ TOPBAR
// =========================================================================
const menuItems = document.querySelectorAll('.sidebar-menu .menu-item[data-target]');
const tabPanes = document.querySelectorAll('.tab-pane');
const currentTabTitle = document.getElementById("currentTabTitle");

const tabTitleMap = {
    'tab-exams': 'Khám Phá Kho Đề Thi',
    'tab-profile': 'Hồ Sơ Cá Nhân',
    'tab-history': 'Lịch Sử Làm Bài',
    'tab-vip': 'Quản Lý Gói VIP'
};

// Logic chuyển tab chung từ Sidebar
menuItems.forEach(item => {
    item.addEventListener('click', () => {
        menuItems.forEach(m => m.classList.remove('active'));
        tabPanes.forEach(pane => pane.classList.remove('active'));
        
        item.classList.add('active');
        const targetId = item.getAttribute('data-target');
        document.getElementById(targetId).classList.add('active');

        // Thay đổi tiêu đề trên Topbar tương ứng với Menu đang chọn
        currentTabTitle.textContent = tabTitleMap[targetId] || 'Bảng Điều Khiển';
    });
});

// Xử lý Logic Dropdown Menu ở Topbar
const userMenuToggle = document.getElementById('userMenuToggle');
const userDropdown = document.getElementById('userDropdown');
const btnManageProfile = document.getElementById('btnManageProfile');

userMenuToggle.addEventListener('click', (e) => {
    e.stopPropagation();
    userDropdown.classList.toggle('show');
});

document.addEventListener('click', (e) => {
    if (!userMenuToggle.contains(e.target)) {
        userDropdown.classList.remove('show');
    }
});

// Khi bấm "Quản lý Hồ Sơ" trong Dropdown Menu
btnManageProfile.addEventListener('click', () => {
    menuItems.forEach(m => m.classList.remove('active'));
    tabPanes.forEach(pane => pane.classList.remove('active'));
    
    document.getElementById('tab-profile').classList.add('active');
    currentTabTitle.textContent = tabTitleMap['tab-profile'];
});

// =========================================================================
// 4. XỬ LÝ THÔNG TIN AUTHENTICATION & ĐỒNG BỘ UI TOPBAR (BAO GỒM NÚT VIP MỚI)
// =========================================================================

// Xử lý sự kiện click khi bấm "NÂNG CẤP VIP" trên Topbar
const topbarVipContainer = document.getElementById('topbar-vip-container');
if (topbarVipContainer) {
    topbarVipContainer.addEventListener('click', (e) => {
        const btn = e.target.closest('#btnUpgradeVipTopbar');
        if (btn) {
            // Xóa active hiện tại
            menuItems.forEach(m => m.classList.remove('active'));
            tabPanes.forEach(pane => pane.classList.remove('active'));
            
            // Bật Tab VIP
            document.getElementById('tab-vip').classList.add('active');
            currentTabTitle.textContent = tabTitleMap['tab-vip'];
        }
    });
}

function renderAuthInfo(user) {
    const email = user.email;
    const name = user.displayName || "Người dùng ẩn danh";
    const fallbackPhotoUrl = user.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=0056b3&color=fff`;

    document.getElementById("topbarName").textContent = name;
    document.getElementById("topbarAvatar").src = fallbackPhotoUrl;

    document.getElementById("displayEmail").textContent = email;
    document.getElementById("paymentEmail").textContent = email; 
    document.getElementById("displayName").textContent = name;
    document.getElementById("userAvatar").src = fallbackPhotoUrl;
    document.getElementById("inputName").value = user.displayName || "";
}

function setVipInactive() {
    // Trạng thái Hồ sơ
    document.getElementById("vipStatusBadge").textContent = "Chưa kích hoạt";
    document.getElementById("vipStatusBadge").className = "status-badge status-unactive";
    document.getElementById("vipStatusTab3").textContent = "Chưa kích hoạt VIP";
    document.getElementById("vipStatusTab3").className = "status-badge status-unactive";
    document.getElementById("vipStartDate").textContent = "Không xác định";
    document.getElementById("vipEndDate").textContent = "Không xác định";
    
    const statAccount = document.getElementById("statAccountStatus");
    if (statAccount) statAccount.textContent = "Thường";

    // Hiển thị nút Gọi hành động nâng cấp trên Topbar
    if (topbarVipContainer) {
        topbarVipContainer.innerHTML = `
            <button id="btnUpgradeVipTopbar" class="topbar-vip-btn">
                🚀 NÂNG CẤP VIP
            </button>
        `;
    }
}

async function fetchUserData(user) {
    let currentUserData = { isVip: false, isBanned: false };
    try {
        const userDocRef = doc(db, "users", user.uid);
        const userDocSnap = await getDoc(userDocRef);

        if (userDocSnap.exists()) {
            currentUserData = userDocSnap.data();

            if (currentUserData.isBanned) {
                alert("Tài khoản của bạn đã bị khóa hệ thống. Vui lòng liên hệ quản trị viên.");
                await signOut(auth);
                return null;
            }

            if (currentUserData.avatarBase64) {
                document.getElementById("userAvatar").src = currentUserData.avatarBase64;
                document.getElementById("topbarAvatar").src = currentUserData.avatarBase64; 
            }

            if (currentUserData.isVip) {
                // Trạng thái Hồ sơ
                document.getElementById("vipStatusBadge").textContent = "Đã kích hoạt VIP";
                document.getElementById("vipStatusBadge").className = "status-badge status-active";
                document.getElementById("vipStatusTab3").textContent = "VIP Hoạt động";
                document.getElementById("vipStatusTab3").className = "status-badge status-active";
                document.getElementById("vipStartDate").textContent = currentUserData.vipStart ? formatDate(currentUserData.vipStart) : "Không xác định";
                document.getElementById("vipEndDate").textContent = currentUserData.vipEnd ? formatDate(currentUserData.vipEnd) : "Không xác định";
                
                document.getElementById("statAccountStatus").textContent = "VIP";

                // Hiển thị Badge VIP vĩnh viễn (sang trọng)
                if (topbarVipContainer) {
                    topbarVipContainer.innerHTML = `
                        <div class="topbar-vip-badge">
                            <i class="fa-solid fa-crown"></i> TÀI KHOẢN VIP
                        </div>
                    `;
                }
            } else {
                setVipInactive();
            }
        } else {
            setVipInactive(); 
        }
    } catch (error) {
        console.error("Lỗi khi lấy dữ liệu user từ Firestore:", error);
        setVipInactive();
    }
    return currentUserData;
}

// Theo dõi trạng thái đăng nhập hệ thống
onAuthStateChanged(auth, async (user) => {
    if (user) {
        renderAuthInfo(user);
        const currentUserData = await fetchUserData(user);
        
        if (currentUserData) {
            const authReadyEvent = new CustomEvent("authReady", {
                detail: { user, currentUserData }
            });
            document.dispatchEvent(authReadyEvent);
        }
    } else {
        safeRedirect('index.html');
    }
});

// =========================================================================
// 5. CÁC SỰ KIỆN TƯƠNG TÁC CƠ BẢN (ĐĂNG XUẤT & XÁC NHẬN CHUYỂN KHOẢN)
// =========================================================================
document.getElementById("btnLogout").addEventListener("click", () => {
    signOut(auth).catch((error) => {
        console.error("Lỗi đăng xuất:", error);
        alert("Đã xảy ra lỗi khi đăng xuất!");
    });
});

document.getElementById("btnConfirmPayment").addEventListener("click", () => {
    alert("Hệ thống đã ghi nhận yêu cầu. Chúng tôi sẽ kiểm tra và kích hoạt VIP cho bạn trong thời gian sớm nhất!");
});
