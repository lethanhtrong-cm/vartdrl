import { auth, db } from "./dashboard-core.js";
import { updateProfile, updatePassword } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { doc, setDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// =========================================================================
// 1. DOM ELEMENTS CHỨC NĂNG HỒ SƠ & MẬT KHẨU
// =========================================================================
const updateProfileForm = document.getElementById("updateProfileForm");
const btnUpdateProfile = document.getElementById("btnUpdateProfile");
const inputName = document.getElementById("inputName");
const inputAvatarFile = document.getElementById("inputAvatarFile");
const displayName = document.getElementById("displayName");
const topbarName = document.getElementById("topbarName");
const userAvatar = document.getElementById("userAvatar");
const topbarAvatar = document.getElementById("topbarAvatar");

const changePasswordForm = document.getElementById("changePasswordForm");
const inputNewPassword = document.getElementById("inputNewPassword");
const btnChangePassword = document.getElementById("btnChangePassword");

// =========================================================================
// 2. HÀM XỬ LÝ NÉN ẢNH VÀ CHUYỂN ĐỔI SANG BASE64 (TỐI ƯU 200X200 PIXEL)
// =========================================================================
function resizeImageToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file); 
        
        reader.onload = (event) => {
            const img = new Image();
            img.src = event.target.result;
            
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const MAX_WIDTH = 200;
                const MAX_HEIGHT = 200;
                let width = img.width;
                let height = img.height;

                if (width > height) {
                    if (width > MAX_WIDTH) { height *= MAX_WIDTH / width; width = MAX_WIDTH; }
                } else {
                    if (height > MAX_HEIGHT) { width *= MAX_HEIGHT / height; height = MAX_HEIGHT; }
                }

                canvas.width = width; canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                // Nén chất lượng ảnh xuống 70% định dạng JPEG để tiết kiệm bộ nhớ lưu trữ
                resolve(canvas.toDataURL('image/jpeg', 0.7));
            };
            img.onerror = (error) => reject(error);
        };
        reader.onerror = (error) => reject(error);
    });
}

// =========================================================================
// 3. SỰ KIỆN LƯU THAY ĐỔI THÔNG TIN HỒ SƠ CÁ NHÂN
// =========================================================================
updateProfileForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    btnUpdateProfile.textContent = "Đang lưu...";
    btnUpdateProfile.disabled = true;

    const newName = inputName.value.trim();
    let newBase64Avatar = null;

    try {
        // 1. Cập nhật tên hiển thị lên Firebase Authentication
        await updateProfile(auth.currentUser, { displayName: newName });
        
        // 2. Nếu có chọn file ảnh đại diện mới, tiến hành xử lý nén đưa lên Firestore
        if (inputAvatarFile.files.length > 0) {
            const file = inputAvatarFile.files[0];
            newBase64Avatar = await resizeImageToBase64(file);
            
            const userDocRef = doc(db, "users", auth.currentUser.uid);
            await setDoc(userDocRef, { avatarBase64: newBase64Avatar }, { merge: true });
        }

        alert("Cập nhật hồ sơ thành công!");
        
        // 3. Đồng bộ hóa thay đổi UI ngay lập tức (Realtime UI Sync)
        displayName.textContent = newName;
        topbarName.textContent = newName; 
        if (newBase64Avatar) {
            userAvatar.src = newBase64Avatar;
            topbarAvatar.src = newBase64Avatar; 
        }
        
        inputAvatarFile.value = ""; 
    } catch (error) {
        console.error("Lỗi cập nhật hồ sơ cá nhân:", error);
        alert("Đã xảy ra lỗi: " + error.message);
    } finally {
        btnUpdateProfile.textContent = "Lưu thay đổi";
        btnUpdateProfile.disabled = false;
    }
});

// =========================================================================
// 4. SỰ KIỆN CẬP NHẬT ĐỔI MẬT KHẨU TÀI KHOẢN BẢO MẬT
// =========================================================================
changePasswordForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const newPassword = inputNewPassword.value;
    
    btnChangePassword.textContent = "Đang xử lý...";
    btnChangePassword.disabled = true;

    try {
        // Cập nhật mật khẩu mới thông qua Firebase Auth
        await updatePassword(auth.currentUser, newPassword);
        alert("Đổi mật khẩu thành công!");
        inputNewPassword.value = ""; 
    } catch (error) {
        console.error("Lỗi đổi mật khẩu:", error);
        if (error.code === 'auth/requires-recent-login') {
            alert("Vì lý do bảo mật, phiên đăng nhập đã hết hạn. Vui lòng Đăng xuất và Đăng nhập lại để thực hiện đổi mật khẩu.");
        } else {
            alert("Lỗi hệ thống: " + error.message);
        }
    } finally {
        btnChangePassword.textContent = "Cập nhật mật khẩu";
        btnChangePassword.disabled = false;
    }
});