// Backend connection
async function extractData() {
    const text = document.getElementById("userText").value;

    const response = await fetch("http://127.0.0.1:5000/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text })
    });

    const data = await response.json();

    document.getElementById("name").value = data.name || "";
    document.getElementById("email").value = data.email || "";
    document.getElementById("phone").value = data.phone || "";
    document.getElementById("location").value = data.location || "";
}


// Firebase
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getFirestore, collection, addDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "YOUR_API_KEY",
    authDomain: "YOUR_DOMAIN",
    projectId: "YOUR_PROJECT_ID",
    storageBucket: "YOUR_BUCKET",
    messagingSenderId: "YOUR_ID",
    appId: "YOUR_APP_ID"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function saveData() {
    const name = document.getElementById("name").value;
    const email = document.getElementById("email").value;
    const phone = document.getElementById("phone").value;
    const location = document.getElementById("location").value;

    try {
        await addDoc(collection(db, "users"), {
            name,
            email,
            phone,
            location,
            timestamp: new Date()
        });

        alert("Data Saved Successfully!");
    } catch (error) {
        console.error("Error saving data:", error);
    }
}

window.extractData = extractData;
window.saveData = saveData;