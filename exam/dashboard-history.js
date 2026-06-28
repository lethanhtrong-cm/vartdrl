import { db, formatDate, safeRedirect } from "./dashboard-core.js";
import { collection, query, where, getDocs, doc, deleteDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// Biến cục bộ lưu trữ trạng thái trong Module
let userEmail = null;
let examVipMap = {};

// DOM Elements
const historyTableBody = document.getElementById("historyTableBody");
const statCompletedExams = document.getElementById("statCompletedExams");
const statAvgScore = document.getElementById("statAvgScore");

// Expose safeRedirect ra window scope để phục vụ cho sự kiện onclick="safeRedirect(...)" từ HTML
window.safeRedirect = safeRedirect;

// =========================================================================
// 1. LẮNG NGHE CÁC SỰ KIỆN ĐỒNG BỘ TỪ HỆ THỐNG MODULES
// =========================================================================

// Lắng nghe sự kiện Auth sẵn sàng để lấy Email người dùng
document.addEventListener("authReady", (e) => {
    userEmail = e.detail.user.email;
});

// Lắng nghe sự kiện cấu hình Kho đề thi sẵn sàng để lấy bản đồ VIP/Free của các Đề thi
document.addEventListener("examsReady", async (e) => {
    const allExamsData = e.detail.allExamsData;
    
    // Tạo map tra cứu nhanh trạng thái VIP của đề thi theo Id
    examVipMap = {};
    allExamsData.forEach(exam => {
        examVipMap[exam.id] = exam.isVip;
    });

    // Tiến hành tải lịch sử thi ngay khi có đầy đủ dữ liệu Email và Bản đồ phân quyền Đề thi
    if (userEmail) {
        await fetchHistory(userEmail);
    }
});

// =========================================================================
// 2. TẢI DỮ LIỆU LỊCH SỬ LÀM BÀI & CẬP NHẬT QUICK STATS
// =========================================================================
async function fetchHistory(email) {
    try {
        const resultsRef = collection(db, "results");
        const q = query(resultsRef, where("email", "==", email));
        const querySnapshot = await getDocs(q);

        // Nếu người dùng chưa từng nộp bài thi nào
        if (querySnapshot.empty) {
            historyTableBody.innerHTML = `<tr><td colspan="6" class="loading-text">Bạn chưa hoàn thành bài thi nào.</td></tr>`;
            if (statCompletedExams) statCompletedExams.textContent = "0";
            if (statAvgScore) statAvgScore.textContent = "0.0";
            return;
        }

        const resultsArray = [];
        let totalScoreSum = 0;

        querySnapshot.forEach((doc) => {
            const data = doc.data();
            resultsArray.push({ id: doc.id, ...data });
            
            // Tính lũy kế tổng điểm để làm Quick Stats
            const currentScore = data.score !== undefined ? parseFloat(data.score) : 0;
            totalScoreSum += currentScore;
        });

        // --- CẬP NHẬT SỐ LIỆU CHO 2 THẺ THỐNG KÊ NHANH (QUICK STATS) ---
        const totalSubmitted = resultsArray.length;
        const averageScoreResult = totalSubmitted > 0 ? (totalScoreSum / totalSubmitted).toFixed(1) : "0.0";

        // Ghi đè dữ liệu thật vào vị trí đang chạy hiệu ứng Skeleton Loading
        if (statCompletedExams) statCompletedExams.textContent = totalSubmitted;
        if (statAvgScore) statAvgScore.textContent = averageScoreResult;

        // Sắp xếp danh sách lịch sử thi theo thời gian nộp bài mới nhất lên trên đầu
        resultsArray.sort((a, b) => {
            const dateA = a.timestamp && typeof a.timestamp.toDate === 'function' ? a.timestamp.toDate() : new Date(a.timestamp || a.submittedAt || 0);
            const dateB = b.timestamp && typeof b.timestamp.toDate === 'function' ? b.timestamp.toDate() : new Date(b.timestamp || b.submittedAt || 0);
            return dateB - dateA;
        });

        // Render dữ liệu ra bảng lịch sử
        historyTableBody.innerHTML = ""; 
        
        resultsArray.forEach((data) => {
            const tr = document.createElement("tr");
            const quizId = data.examId || data.examCode || "Không rõ";
            const score = data.score !== undefined ? data.score : 0;
            const correctAnswers = data.correctAnswers !== undefined ? data.correctAnswers : 0;
            
            // Đối chiếu bản đồ phân quyền để hiển thị Badge tương ứng cho bài làm
            const isVipExam = examVipMap[quizId] === true;
            const badgeHtml = isVipExam ? `<span style="background:#ffc107;color:#856404;padding:2px 5px;border-radius:4px;font-size:0.75rem;">VIP</span>` 
                                        : `<span style="background:#e2e3e5;color:#383d41;padding:2px 5px;border-radius:4px;font-size:0.75rem;">Free</span>`;

            // Định dạng chuỗi thời gian làm bài
            let timeSpentStr = "Không rõ";
            if (data.timeSpent !== undefined) {
                const totalSeconds = parseInt(data.timeSpent, 10);
                const m = Math.floor(totalSeconds / 60);
                const s = totalSeconds % 60;
                timeSpentStr = `${m}p ${s}s`;
            }
            
            // Định dạng chuỗi thời gian nộp bài bài thi
            let submitTime = "Không xác định";
            if (data.timestamp || data.submittedAt) {
                submitTime = formatDate(data.timestamp || data.submittedAt);
            }

            tr.innerHTML = `
                <td><strong>${quizId}</strong> ${badgeHtml}</td>
                <td>${timeSpentStr}</td>
                <td>${submitTime}</td>
                <td>${correctAnswers} câu</td>
                <td style="color: var(--primary-blue); font-weight: bold;">${score}</td>
                <td>
                    <button class="btn-review" onclick="safeRedirect('quiz.html?resultId=${data.id}')">
                        <i class="fa-solid fa-eye"></i> Xem lại
                    </button>
                    <button class="btn-delete-history" data-id="${data.id}">
                        <i class="fa-solid fa-trash"></i> Xóa
                    </button>
                </td>
            `;
            historyTableBody.appendChild(tr);
        });

    } catch (error) {
        console.error("Lỗi khi tải hoặc xử lý bảng lịch sử làm bài:", error);
        historyTableBody.innerHTML = `<tr><td colspan="6" class="loading-text" style="color: red;">Lỗi khi tải dữ liệu lịch sử!</td></tr>`;
    }
}

// =========================================================================
// 3. ỦY QUYỀN SỰ KIỆN (EVENT DELEGATION): XÓA BẢN GHI LỊCH SỬ THI
// =========================================================================
historyTableBody.addEventListener('click', async (e) => {
    const deleteBtn = e.target.closest('.btn-delete-history');
    if (deleteBtn) {
        const docId = deleteBtn.getAttribute('data-id');
        if (confirm("Bạn có chắc chắn muốn xóa kết quả bài thi này khỏi lịch sử hệ thống?")) {
            try {
                // Thực hiện thao tác xóa tài liệu trên Firestore kết nối qua core
                await deleteDoc(doc(db, "results", docId));
                alert("Đã xóa kết quả bài thi thành công!");
                
                // Tải lại bảng lịch sử làm bài sau khi xóa thành công để đồng bộ giao diện và Quick Stats
                if (userEmail) {
                    await fetchHistory(userEmail);
                }
            } catch (error) {
                console.error("Lỗi khi xóa kết quả bài làm:", error);
                alert("Đã xảy ra lỗi hệ thống khi thực hiện xóa: " + error.message);
            }
        }
    }
});