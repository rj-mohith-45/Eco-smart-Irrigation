import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, RecaptchaVerifier, signInWithPhoneNumber, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getDatabase, ref, onValue, update, get } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";
import { GoogleGenerativeAI } from "https://esm.run/@google/generative-ai";

// STEP 1: Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyDox28FyjMCeoSVPdV5cGZiN7tLcifSqtA",
  authDomain: "smart-45.firebaseapp.com",
  databaseURL: "https://smart-45-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "smart-45",
  storageBucket: "smart-45.firebasestorage.app",
  messagingSenderId: "211603965260",
  appId: "1:211603965260:web:9b59d19b6a0cc1524b3be9"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);

// INIT GEMINI AI (Placeholder to keep your account secure on GitHub)
const genAI = new GoogleGenerativeAI("YOUR_GEMINI_API_KEY");
let activeSystemState = {};
let uploadedBase64Image = null;

function log(msg, type = 'info') {
    const feed = document.getElementById('status-feed');
    if (!feed) return;
    const entry = document.createElement('p');
    entry.className = `log-entry ${type}`;
    entry.innerText = `[${new Date().toLocaleTimeString([], { hour12: false })}] ${msg}`;
    feed.prepend(entry);
}

// Navigation
const btnClasses = [
    { id: 'nav-home', viewId: 'view-home' },
    { id: 'nav-auto', viewId: 'view-auto' },
    { id: 'nav-ai', viewId: 'view-ai' }
];

btnClasses.forEach(item => {
    const btn = document.getElementById(item.id);
    if (btn) {
        btn.onclick = () => {
            btnClasses.forEach(b => {
                const v = document.getElementById(b.viewId);
                const btnItem = document.getElementById(b.id);
                if (v) v.style.display = 'none';
                if (btnItem) btnItem.classList.remove('active');
            });
            const targetView = document.getElementById(item.viewId);
            if (targetView) targetView.style.display = 'block';
            btn.classList.add('active');
        };
    }
});

// Authentication & Realtime State
let phoneNumber = null;
let dbUnsubscribe = null;

// Setup invisible reCAPTCHA
window.recaptchaVerifier = new RecaptchaVerifier(auth, 'recaptcha-container', {
    'size': 'invisible'
});

let confirmationResult = null;

const sendOtpBtn = document.getElementById('btn-send-otp');
if (sendOtpBtn) {
    sendOtpBtn.onclick = async () => {
        const phoneInput = document.getElementById('phone-number').value.trim();
        const errorDiv = document.getElementById('login-error');
        if (errorDiv) errorDiv.style.display = 'none';

        if (!phoneInput.startsWith('+') || phoneInput.length < 10) {
            if (errorDiv) {
                errorDiv.innerText = "Please enter a valid phone number including country code (e.g., +919876543210)";
                errorDiv.style.display = 'block';
            }
            return;
        }

        try {
            const appVerifier = window.recaptchaVerifier;
            confirmationResult = await signInWithPhoneNumber(auth, phoneInput, appVerifier);
            const phoneStep = document.getElementById('phone-step');
            const otpStep = document.getElementById('otp-step');
            if (phoneStep) phoneStep.style.display = 'none';
            if (otpStep) otpStep.style.display = 'block';
            log("Verification code sent to " + phoneInput);
        } catch (error) {
            console.error("SMS Send Error:", error);
            if (errorDiv) {
                errorDiv.innerText = error.message;
                errorDiv.style.display = 'block';
            }
        }
    };
}

const verifyOtpBtn = document.getElementById('btn-verify-otp');
if (verifyOtpBtn) {
    verifyOtpBtn.onclick = async () => {
        const otpCode = document.getElementById('otp-code').value.trim();
        const errorDiv = document.getElementById('login-error');
        if (errorDiv) errorDiv.style.display = 'none';

        if (otpCode.length !== 6) {
            if (errorDiv) {
                errorDiv.innerText = "Please enter a 6-digit verification code.";
                errorDiv.style.display = 'block';
            }
            return;
        }

        try {
            const result = await confirmationResult.confirm(otpCode);
            const user = result.user;
            log("User signed in: " + user.phoneNumber);
        } catch (error) {
            console.error("OTP Verification Error:", error);
            if (errorDiv) {
                errorDiv.innerText = "Invalid verification code. Please try again.";
                errorDiv.style.display = 'block';
            }
        }
    };
}

const backPhoneBtn = document.getElementById('btn-back-phone');
if (backPhoneBtn) {
    backPhoneBtn.onclick = () => {
        const phoneStep = document.getElementById('phone-step');
        const otpStep = document.getElementById('otp-step');
        const errorDiv = document.getElementById('login-error');
        if (otpStep) otpStep.style.display = 'none';
        if (phoneStep) phoneStep.style.display = 'block';
        if (errorDiv) errorDiv.style.display = 'none';
    };
}

// Unified Sign-Out Handler
const handleSignOut = async () => {
    try {
        await signOut(auth);
        log("User logged out");
    } catch (error) {
        console.error("Logout Error:", error);
    }
};

const navLogout = document.getElementById('nav-logout');
if (navLogout) {
    navLogout.onclick = handleSignOut;
}

const btnSignout = document.getElementById('btn-signout');
if (btnSignout) {
    btnSignout.onclick = handleSignOut;
}

// Monitor Auth State Changes
onAuthStateChanged(auth, (user) => {
    const dashboard = document.getElementById('dashboard-container');
    const login = document.getElementById('login-container');
    if (user) {
        phoneNumber = user.phoneNumber;
        if (login) login.style.display = 'none';
        if (dashboard) dashboard.style.display = 'flex';
        log("Authenticated as " + phoneNumber);

        // Realtime Firebase State
        if (dbUnsubscribe) dbUnsubscribe();
        dbUnsubscribe = onValue(ref(db, `/users/${phoneNumber}`), (snapshot) => {
            const data = snapshot.val(); if (!data) return;
            activeSystemState = data;

            const syncText = document.getElementById('sync-text');
            if (syncText) syncText.innerText = "System Sync Live";
            
            const dot = document.querySelector('.dot');
            if (dot) dot.style.background = "#10b981";

            if (data.moisture1 !== undefined) updateGauge('fill1', 'val1', data.moisture1);
            if (data.moisture2 !== undefined) updateGauge('fill2', 'val2', data.moisture2);

            const rain = data.rainstatus === true || data.rainstatus === "true";
            const weatherBox = document.getElementById('weather-box');
            const weatherText = document.getElementById('weather-text');
            if (weatherBox) weatherBox.className = rain ? "status-card rain" : "status-card clear";
            if (weatherText) weatherText.innerText = rain ? "Rain Detected" : "Clear Skies";

            const motorOnBox = document.getElementById('motor_on');
            const valve1OnBox = document.getElementById('valve1_on');
            const valve2OnBox = document.getElementById('valve2_on');
            const autoLogicMasterBox = document.getElementById('auto_logic_master');

            if (motorOnBox) motorOnBox.checked = data.motor_on || false;
            if (valve1OnBox) valve1OnBox.checked = data.valve1_on || false;
            if (valve2OnBox) valve2OnBox.checked = data.valve2_on || false;
            if (autoLogicMasterBox) autoLogicMasterBox.checked = data.auto_mode || false;

            const v1Row = document.getElementById('v1-row');
            const v2Row = document.getElementById('v2-row');
            
            // Force the valves to be fully unlocked and clickable at all times
            if (v1Row) v1Row.classList.remove('disabled');
            if (v2Row) v2Row.classList.remove('disabled');
            if (valve1OnBox) valve1OnBox.disabled = false;
            if (valve2OnBox) valve2OnBox.disabled = false;

            // Sync thresholds to input elements if available
            const v1OnThresh = document.getElementById('v1_on_thresh');
            const v1OffThresh = document.getElementById('v1_off_thresh');
            const v2OnThresh = document.getElementById('v2_on_thresh');
            const v2OffThresh = document.getElementById('v2_off_thresh');

            if (data.valve1_on_threshold !== undefined && v1OnThresh) v1OnThresh.value = data.valve1_on_threshold;
            if (data.valve1_off_threshold !== undefined && v1OffThresh) v1OffThresh.value = data.valve1_off_threshold;
            if (data.valve2_on_threshold !== undefined && v2OnThresh) v2OnThresh.value = data.valve2_on_threshold;
            if (data.valve2_off_threshold !== undefined && v2OffThresh) v2OffThresh.value = data.valve2_off_threshold;
        }, (error) => {
            console.error("RTDB Stream Error:", error);
            log("Database Sync Error: " + error.message, "error");
        });
    } else {
        phoneNumber = null;
        if (dbUnsubscribe) {
            dbUnsubscribe();
            dbUnsubscribe = null;
        }
        if (dashboard) dashboard.style.display = 'none';
        if (login) login.style.display = 'flex';
        // Reset step state
        const phoneStep = document.getElementById('phone-step');
        const otpStep = document.getElementById('otp-step');
        const errorDiv = document.getElementById('login-error');
        const phoneInput = document.getElementById('phone-number');
        const otpCodeInput = document.getElementById('otp-code');

        if (phoneStep) phoneStep.style.display = 'block';
        if (otpStep) otpStep.style.display = 'none';
        if (errorDiv) errorDiv.style.display = 'none';
        if (phoneInput) phoneInput.value = "+91";
        if (otpCodeInput) otpCodeInput.value = "";
    }
});

function updateGauge(fillId, valId, value) {
    const fill = document.getElementById(fillId);
    const text = document.getElementById(valId);
    if (!fill || !text) return;
    const percent = Math.min(Math.max(value, 0), 100);
    fill.style.strokeDashoffset = 125.6 - (percent / 100) * 125.6;
    text.innerText = Math.round(percent);
    fill.style.stroke = percent < 30 ? "#ef4444" : (percent < 75 ? "#10b981" : "#3b82f6");
}

// Chart Rendering Logic
const renderChartBtn = document.getElementById('btn-render-chart');
if (renderChartBtn) {
    renderChartBtn.onclick = async () => {
        if (!phoneNumber) return;
        const dist = parseFloat(document.getElementById('calc-dist').value);
        const speed = parseFloat(document.getElementById('calc-speed').value);
        const flow = parseFloat(document.getElementById('calc-flow').value);

        const travelTimeMins = (dist / speed) * 60;

        try {
            const snapshot = await get(ref(db, `users/${phoneNumber}/daily_logs`));
            if (snapshot.exists()) {
                const logs = snapshot.val();
                const dates = Object.keys(logs);

                const usedArray = [];
                const savedArray = [];

                dates.forEach(date => {
                    const dayData = logs[date];
                    const v1_ms = dayData.valve1_ms || 0;
                    const v2_ms = dayData.valve2_ms || 0;
                    const offTrips = dayData.trips_off || 0;

                    const used = (((v1_ms + v2_ms) / 60000) * flow).toFixed(1);
                    const saved = (offTrips * travelTimeMins * flow).toFixed(1);

                    usedArray.push(parseFloat(used));
                    savedArray.push(parseFloat(saved));
                });

                const ctxUsage = document.getElementById('usageChart').getContext('2d');
                if (window.usageChartInstance) window.usageChartInstance.destroy();
                window.usageChartInstance = new Chart(ctxUsage, {
                    type: 'bar',
                    data: {
                        labels: dates,
                        datasets: [{ label: 'Daily Water Used (Liters)', data: usedArray, backgroundColor: '#3b82f6', borderRadius: 4 }]
                    },
                    options: { responsive: true, maintainAspectRatio: false }
                });

                const ctxSaved = document.getElementById('savedChart').getContext('2d');
                if (window.savedChartInstance) window.savedChartInstance.destroy();
                window.savedChartInstance = new Chart(ctxSaved, {
                    type: 'line',
                    data: {
                        labels: dates,
                        datasets: [{
                            label: 'Daily Water Saved (Liters)',
                            data: savedArray,
                            backgroundColor: 'rgba(16, 185, 129, 0.2)',
                            borderColor: '#10b981',
                            borderWidth: 2,
                            fill: true,
                            tension: 0.3
                        }]
                    },
                    options: { responsive: true, maintainAspectRatio: false }
                });

                log("Analytics Charts Rendered Successfully.");
            } else {
                alert("No daily logs found in Firebase yet. Data will appear after the first midnight reset.");
            }
        } catch (err) {
            console.error(err);
            alert("Error pulling Firebase logs.");
        }
    };
}

// Independent Manual Controls 
const motorOnCheckbox = document.getElementById('motor_on');
if (motorOnCheckbox) {
    motorOnCheckbox.onchange = (e) => {
        if (phoneNumber) {
            update(ref(db, `users/${phoneNumber}`), { motor_on: e.target.checked });
        }
    };
}

const valve1Checkbox = document.getElementById('valve1_on');
if (valve1Checkbox) {
    valve1Checkbox.onchange = (e) => {
        if (phoneNumber) {
            update(ref(db, `users/${phoneNumber}`), { valve1_on: e.target.checked });
        }
    };
}

const valve2Checkbox = document.getElementById('valve2_on');
if (valve2Checkbox) {
    valve2Checkbox.onchange = (e) => {
        if (phoneNumber) {
            update(ref(db, `users/${phoneNumber}`), { valve2_on: e.target.checked });
        }
    };
}

const autoLogicMasterCheckbox = document.getElementById('auto_logic_master');
if (autoLogicMasterCheckbox) {
    autoLogicMasterCheckbox.onchange = (e) => {
        if (phoneNumber) {
            update(ref(db, `users/${phoneNumber}`), { auto_mode: e.target.checked });
        }
    };
}

// Auto Logic Thresholds configuration save using update()
const saveAutoBtn = document.getElementById('btn-save-auto');
if (saveAutoBtn) {
    saveAutoBtn.onclick = () => {
        if (!phoneNumber) return;
        const v1On = parseInt(document.getElementById('v1_on_thresh').value);
        const v1Off = parseInt(document.getElementById('v1_off_thresh').value);
        const v2On = parseInt(document.getElementById('v2_on_thresh').value);
        const v2Off = parseInt(document.getElementById('v2_off_thresh').value);

        update(ref(db, `users/${phoneNumber}`), {
            valve1_on_threshold: v1On,
            valve1_off_threshold: v1Off,
            valve2_on_threshold: v2On,
            valve2_off_threshold: v2Off
        });
        log("Threshold configuration applied.");
    };
}

// Theme Toggle
const themeCheckbox = document.getElementById('theme-checkbox');
if (themeCheckbox) {
    themeCheckbox.onchange = (e) => {
        document.documentElement.setAttribute('data-theme', e.target.checked ? 'light' : 'dark');
        const themeText = document.getElementById('theme-text');
        if (themeText) themeText.innerText = e.target.checked ? 'Light Mode' : 'Dark Mode';
    };
}

// --- FULL AI LOGIC ---
const selectPhotoBtn = document.getElementById('btn-select-photo');
if (selectPhotoBtn) {
    selectPhotoBtn.onclick = () => {
        const fileInput = document.getElementById('ai-file-input');
        if (fileInput) fileInput.click();
    };
}

const fileInput = document.getElementById('ai-file-input');
if (fileInput) {
    fileInput.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (event) => {
            const result = event.target.result;
            const imgPreview = document.getElementById('ai-img-preview');
            const analyzeBtn = document.getElementById('btn-analyze-photo');
            const responseContainer = document.getElementById('ai-response-container');

            if (imgPreview) {
                imgPreview.src = result;
                imgPreview.style.display = 'block';
            }
            if (analyzeBtn) analyzeBtn.style.display = 'block';
            if (responseContainer) responseContainer.style.display = 'none';

            uploadedBase64Image = { data: result.split(',')[1], mimeType: file.type };
        };
        reader.readAsDataURL(file);
    };
}

const analyzePhotoBtn = document.getElementById('btn-analyze-photo');
if (analyzePhotoBtn) {
    analyzePhotoBtn.onclick = async () => {
        if (!uploadedBase64Image) return;

        const btnAnalyze = document.getElementById('btn-analyze-photo');
        const loadingIndicator = document.getElementById('ai-loading');
        const responseContainer = document.getElementById('ai-response-container');

        if (btnAnalyze) btnAnalyze.style.display = 'none';
        if (loadingIndicator) loadingIndicator.style.display = 'block';
        if (responseContainer) {
            responseContainer.style.display = 'block';
            responseContainer.innerHTML = '<i>Analyzing field data...</i>';
        }

        try {
            const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

            const ctx = activeSystemState;
            const contextInfo = `
Current System State:
- Auto Mode: ${ctx.auto_mode ? "ON" : "OFF"}
- Rain Status: ${ctx.rainstatus || "clear"}
- Master Motor: ${ctx.motor_on ? "ON" : "OFF"}
- Zone 1: Moisture ${ctx.moisture1 ?? 0}%, Valve is ${ctx.valve1_on ? "OPEN" : "CLOSED"}, On Threshold ${ctx.valve1_on_threshold ?? 0}%, Off Threshold ${ctx.valve1_off_threshold ?? 0}%
- Zone 2: Moisture ${ctx.moisture2 ?? 0}%, Valve is ${ctx.valve2_on ? "OPEN" : "CLOSED"}, On Threshold ${ctx.valve2_on_threshold ?? 0}%, Off Threshold ${ctx.valve2_off_threshold ?? 0}%
`;

            const promptText = `
You are an expert agricultural AI. Analyze the uploaded field photo alongside the real-time system data provided below. 
First, determine if the photo shows barren land (only soil) or land with crops actively cultivating.

If it is barren land (soil only):
1. Identify the likely type of soil.
2. Suggest suitable crops that thrive in this specific soil type.
3. Recommend the optimal soil moisture levels that need to be maintained for the suggested crops.

If it has crops cultivating:
1. Identify the likely type of soil.
2. Identify the crops currently growing in the field.
3. Recommend the optimal soil moisture levels required to properly maintain these specific crops.

Reference the real-time system data below to give context-aware recommendations regarding current irrigation thresholds and statuses.
Format your response cleanly using markdown.

${contextInfo}`;

            const result = await model.generateContent([
                promptText,
                { inlineData: uploadedBase64Image }
            ]);

            const response = await result.response;
            const text = response.text();

            if (responseContainer) responseContainer.innerHTML = marked.parse(text);

        } catch (err) {
            console.error(err);
            if (responseContainer) {
                responseContainer.innerHTML = `<span style="color:#ef4444"><b>Error:</b> ${err.message || 'Failed to analyze Image. Check console.'}</span>`;
            }
        } finally {
            if (btnAnalyze) btnAnalyze.style.display = 'block';
            if (loadingIndicator) loadingIndicator.style.display = 'none';
        }
    };
}
