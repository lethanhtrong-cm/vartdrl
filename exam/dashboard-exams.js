import { db, safeRedirect } from "./dashboard-core.js";
import { collection, getDocs } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// Biến toàn cục trong phạm vi Module
export let allExamsData = []; 
let currentUserData = null;
let currentView = 'grid'; 

// DOM Elements
const examListContainer = document.getElementById('examListContainer');
const sortFilter = document.getElementById('sortFilter');
const viewBtns = document.querySelectorAll('.view-btn');

// =========================================================================
// 1. LẮNG NGHE SỰ KIỆN AUTH READY ĐỂ KHỞI CHẠY DỮ LIỆU
// =========================================================================
document.addEventListener("authReady", async (e) => {
    currentUserData = e.detail.currentUserData;
    setupToolbarEvents(); 
    await loadAggregatedExamData(); 
});

// =========================================================================
// 2. CẤU HÌNH SỰ KIỆN TOOLBAR (SẮP XẾP & CHUYỂN ĐỔI VIEW)
// =========================================================================
function setupToolbarEvents() {
    // Sự kiện Thay đổi Bộ lọc / Sắp xếp
    sortFilter.removeEventListener('change', handleSortFilterChange);
    sortFilter.addEventListener('change', handleSortFilterChange);

    // Sự kiện Chuyển đổi Grid / List View
    viewBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            const view = e.currentTarget.getAttribute('data-view');
            if (view !== currentView) {
                currentView = view;
                viewBtns.forEach(b => b.classList.remove('active'));
                e.currentTarget.classList.add('active');
                examListContainer.className = currentView === 'grid' ? 'grid-view' : 'list-view';
                renderExams();
            }
        });
    });
}

function handleSortFilterChange() {
    renderExams();
}

// =========================================================================
// 3. TẢI VÀ TỔNG HỢP DỮ LIỆU TỪ 3 COLLECTIONS TRÊN FIRESTORE
// =========================================================================
async function loadAggregatedExamData() {
    try {
        // Lấy danh sách questions để đếm số lượng câu hỏi của từng đề
        const questionsRef = collection(db, "questions");
        const qSnap = await getDocs(questionsRef);
        const examMap = {}; 
        
        qSnap.forEach((doc) => {
            const data = doc.data();
            const eId = data.examId;
            if (eId) {
                if (!examMap[eId]) examMap[eId] = { id: eId, questionCount: 0 };
                examMap[eId].questionCount++;
            }
        });

        // Lấy cấu hình bổ sung của đề thi (isVip, timeLimit, attemptCount,...)
        const examsConfigRef = collection(db, "exams");
        const eSnap = await getDocs(examsConfigRef);
        eSnap.forEach((doc) => {
            const eId = doc.id;
            if (examMap[eId]) {
                const conf = doc.data();
                examMap[eId].isVip = conf.isVip || false;
                examMap[eId].timeLimit = conf.timeLimit ? parseInt(conf.timeLimit) : 15;
                examMap[eId].attemptCount = conf.attemptCount || 0;
                examMap[eId].createdAt = conf.createdAt ? (typeof conf.createdAt.toMillis === 'function' ? conf.createdAt.toMillis() : new Date(conf.createdAt).getTime()) : 0;
            }
        });

        // Lấy danh sách feedback để tính số sao trung bình
        const feedbacksRef = collection(db, "feedbacks");
        const fSnap = await getDocs(feedbacksRef);
        const ratingMap = {}; 
        
        fSnap.forEach((doc) => {
            const data = doc.data();
            const eId = data.examId;
            const stars = data.rating || 5; 
            if (eId) {
                if (!ratingMap[eId]) ratingMap[eId] = { total: 0, count: 0 };
                ratingMap[eId].total += stars;
                ratingMap[eId].count++;
            }
        });

        // Chuẩn hóa và gộp dữ liệu hoàn chỉnh
        Object.keys(examMap).forEach(eId => {
            if (examMap[eId].timeLimit === undefined) examMap[eId].timeLimit = 15;
            if (examMap[eId].isVip === undefined) examMap[eId].isVip = false;
            if (examMap[eId].attemptCount === undefined) examMap[eId].attemptCount = 0;
            if (examMap[eId].createdAt === undefined) examMap[eId].createdAt = 0;

            if (ratingMap[eId]) {
                const avg = ratingMap[eId].total / ratingMap[eId].count;
                examMap[eId].rating = Math.round(avg * 10) / 10; 
                examMap[eId].ratingCount = ratingMap[eId].count;
            } else {
                examMap[eId].rating = 5.0; 
                examMap[eId].ratingCount = 0;
            }
        });

        allExamsData = Object.values(examMap);

        // Phát thêm sự kiện thông báo dữ liệu exam đã sẵn sàng cho tab lịch sử sử dụng
        const examsReadyEvent = new CustomEvent("examsReady", { detail: { allExamsData } });
        document.dispatchEvent(examsReadyEvent);

        renderExams();

    } catch (error) {
        console.error("Lỗi khi tổng hợp dữ liệu đề thi:", error);
        examListContainer.innerHTML = '<div class="loading-text" style="color:red;">Lỗi tải dữ liệu khóa học!</div>';
    }
}

// =========================================================================
// 4. XỬ LÝ RENDER GIAO DIỆN (GRID / LIST VIEW) & PHÂN QUYỀN
// =========================================================================
function renderExams() {
    if (allExamsData.length === 0) {
        examListContainer.innerHTML = '<div class="loading-text">Hiện tại chưa có khóa học / đề thi nào.</div>';
        return;
    }

    const filterType = sortFilter.value;
    let displayData = [...allExamsData];

    // Lọc theo loại đề (VIP / Free)
    if (filterType === 'only_vip') displayData = displayData.filter(exam => exam.isVip);
    else if (filterType === 'only_free') displayData = displayData.filter(exam => !exam.isVip);

    // Sắp xếp dữ liệu theo lựa chọn
    if (filterType === 'highest_rating') displayData.sort((a, b) => b.rating - a.rating);
    else if (filterType === 'most_attempts') displayData.sort((a, b) => b.attemptCount - a.attemptCount);
    else displayData.sort((a, b) => b.createdAt - a.createdAt); 

    examListContainer.innerHTML = "";
    const isUserVip = currentUserData && currentUserData.isVip === true;

    displayData.forEach(exam => {
        const isExamVip = exam.isVip;
        const badgeHtml = isExamVip 
            ? `<span class="course-badge badge-vip"><i class="fa-solid fa-crown"></i> VIP</span>`
            : `<span class="course-badge badge-free">Free</span>`;
        
        let buttonHtml = '';
        if (isExamVip && !isUserVip) {
            buttonHtml = `<button class="btn-locked" onclick="goToUpgrade()"><i class="fa-solid fa-lock"></i> Đề VIP - Nạp để mở</button>`;
        } else {
            buttonHtml = `<button class="btn-primary" onclick="goToQuiz('${exam.id}')">Vào thi ngay</button>`;
        }

        const card = document.createElement('div');
        card.className = 'course-card';
        card.innerHTML = `
            ${badgeHtml}
            <div class="card-body">
                <div style="flex: 1;">
                    <h3 class="card-title">${exam.id}</h3>
                    <div class="card-stats">
                        <div class="stat-item"><i class="fa-solid fa-file-circle-question"></i> ${exam.questionCount} câu hỏi</div>
                        <div class="stat-item"><i class="fa-solid fa-stopwatch"></i> ${exam.timeLimit} phút</div>
                    </div>
                </div>
                <div class="card-meta">
                    <div class="rating">${exam.rating} <i class="fa-solid fa-star"></i> <span class="attempts">(${exam.ratingCount})</span></div>
                    <div class="attempts"><i class="fa-solid fa-users"></i> ${exam.attemptCount} lượt thi</div>
                </div>
            </div>
            <div class="card-footer">${buttonHtml}</div>
        `;
        examListContainer.appendChild(card);
    });

    if (displayData.length === 0) {
        examListContainer.innerHTML = '<div class="loading-text">Không tìm thấy khóa học nào phù hợp với bộ lọc.</div>';
    }
}

// =========================================================================
// 5. EXPOSE FUNCTIONS RA WINDOW SCOPE ĐỂ PHỤC VỤ THEO ONCLICK TỪ HTML THÔ
// =========================================================================
window.goToQuiz = function(examId) {
    safeRedirect(`quiz.html?examId=${examId}`);
};

window.goToUpgrade = function() {
    const vipTabButton = document.querySelector('.menu-item[data-target="tab-vip"]');
    if (vipTabButton) vipTabButton.click();
};