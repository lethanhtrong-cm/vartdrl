import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, GoogleAuthProvider } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// Config
const firebaseConfig = { 
    apiKey: "AIzaSyAtQdmDbA1BgOrvwevrG6gwuFzlUmBTbfY", 
    authDomain: "wb-idr.firebaseapp.com", 
    projectId: "wb-idr", 
    appId: "1:716649486328:web:340d7ae8dd0bafa1e0680d" 
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const appId = 'wb-idr';
export const googleProvider = new GoogleAuthProvider();
