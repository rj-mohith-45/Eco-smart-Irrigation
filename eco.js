import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
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

// INIT GEMINI AI
const genAI = new GoogleGenerativeAI("AQ.Ab8RN6I4e03Sq6hXSEjn95-oG6Wxu4Y2cljxad40PpEzmpM6sg");
let activeSystemState = {};
let uploadedBase64Image = null;

// --- ROBUST SYSTEM LOGGING ENGINE ---
let systemLogs = [];
try {
    const saved = localStorage.getItem('ecosmart_system_logs');
    if (saved) systemLogs = JSON.parse(saved);
} catch (e) {
    systemLogs = [];
}

function renderLogEntryToFeed(feed, logObj) {
    if (!feed) return;
    const entry = document.createElement('p');
    entry.className = `log-entry ${logObj.type || 'info'}`;
    
    let tagClass = 'system-tag';
    const tag = (logObj.tag || 'INFO').toUpperCase();
    if (tag === 'MOTOR') tagClass = 'motor-tag';
    else if (tag === 'VALVE 1' || tag === 'VALVE 2' || tag.includes('VALVE')) tagClass = 'valve-tag';
    else if (tag === 'WEATHER' || tag === 'RAIN') tagClass = 'weather-tag';
    else if (tag === 'AUTO') tagClass = 'auto-tag';
    else if (tag === 'ALERT' || logObj.type === 'danger' || logObj.type === 'alert') tagClass = 'alert-tag';
    else if (tag === 'USER') tagClass = 'system-tag';
    else if (tag === 'AI') tagClass = 'ai-tag';
    else if (tag === 'CONFIG') tagClass = 'auto-tag';
    else if (logObj.type === 'success') tagClass = 'success-tag';
    else if (logObj.type === 'warning') tagClass = 'auto-tag';

    entry.innerHTML = `<span class="log-time">[${logObj.time}]</span> <span class="log-tag ${tagClass}">${tag}</span> <span>${logObj.msg}</span>`;
    feed.prepend(entry);

    while (feed.children.length > 80) {
        feed.removeChild(feed.lastChild);
    }
}

// 3. De-duplication Guard variables
let lastLoggedMsg = '';
let lastLoggedTimestamp = 0;

function log(msg, type = 'info', tag = '') {
    const now = Date.now();
    
    // De-duplication Guard: Ignore identical messages fired within 1.5 seconds
    if (lastLoggedMsg === msg && (now - lastLoggedTimestamp) < 1500) {
        return;
    }
    lastLoggedMsg = msg;
    lastLoggedTimestamp = now;

    const time = new Date().toLocaleTimeString([], { hour12: false });
    
    if (!tag) {
        if (msg.includes('Motor') || msg.includes('Pump')) tag = 'MOTOR';
        else if (msg.includes('Valve 1')) tag = 'VALVE 1';
        else if (msg.includes('Valve 2')) tag = 'VALVE 2';
        else if (msg.includes('Rain') || msg.includes('Weather') || msg.includes('🌧️') || msg.includes('☀️')) tag = 'WEATHER';
        else if (msg.includes('Auto')) tag = 'AUTO';
        else if (msg.includes('Alert') || msg.includes('threshold') || msg.includes('Error') || type === 'danger' || type === 'alert') tag = 'ALERT';
        else if (msg.includes('User') || msg.includes('clicked') || msg.includes('toggled') || msg.includes('toggle') || msg.includes('action')) tag = 'USER';
        else if (msg.includes('AI') || msg.includes('Vision') || msg.includes('Crop')) tag = 'AI';
        else if (type === 'system' || msg.includes('Connected') || msg.includes('Stream') || msg.includes('Auth') || msg.includes('Theme')) tag = 'SYSTEM';
        else tag = 'INFO';
    }

    const logObj = { id: Date.now() + Math.random(), time, msg, type, tag };
    systemLogs.unshift(logObj);
    if (systemLogs.length > 80) systemLogs = systemLogs.slice(0, 80);

    try {
        localStorage.setItem('ecosmart_system_logs', JSON.stringify(systemLogs));
    } catch (e) {}

    // Target the single dashboard log feed (or fallback)
    const feed = document.getElementById('status-feed-dash') || document.getElementById('status-feed');
    if (feed) renderLogEntryToFeed(feed, logObj);
}

function populateSavedLogs() {
    const feed = document.getElementById('status-feed-dash') || document.getElementById('status-feed');
    if (!feed) return;
    if (!systemLogs || systemLogs.length === 0) return;
    
    feed.innerHTML = '';

    for (let i = systemLogs.length - 1; i >= 0; i--) {
        const item = systemLogs[i];
        renderLogEntryToFeed(feed, item);
    }
}

function exportLogs() {
    if (!systemLogs || systemLogs.length === 0) {
        alert("No activity logs recorded yet.");
        return;
    }
    const lines = systemLogs.map(l => `[${l.time}] [${l.tag}] ${l.msg}`).join('\r\n');
    const blob = new Blob([`=== ECOSMART IRRIGATION SYSTEM LOGS ===\r\nExported: ${new Date().toLocaleString()}\r\nTotal Log Entries: ${systemLogs.length}\r\n\r\n${lines}`], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `EcoSmart_System_Logs_${new Date().toISOString().slice(0, 10)}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function clearLogs() {
    if (confirm("Clear all recorded system activity logs?")) {
        systemLogs = [];
        try { localStorage.removeItem('ecosmart_system_logs'); } catch (e) {}
        const feed = document.getElementById('status-feed-dash') || document.getElementById('status-feed');
        if (feed) feed.innerHTML = '';
        lastLoggedMsg = '';
        log("System activity feed cleared.", "system", "SYSTEM");
    }
}

// Wire log buttons on startup
const btnDownloadDash = document.getElementById('btn-download-dash');
if (btnDownloadDash) btnDownloadDash.onclick = exportLogs;

const btnClearDash = document.getElementById('btn-clear-dash');
if (btnClearDash) btnClearDash.onclick = clearLogs;

setTimeout(populateSavedLogs, 50);

// --- LIVE SOIL MOISTURE DYNAMICS CHART ENGINE ---
let moistureLiveChartInstance = null;
let moistureHistory = [];
try {
    const savedChart = localStorage.getItem('ecosmart_moisture_history');
    if (savedChart) moistureHistory = JSON.parse(savedChart);
} catch (e) {
    moistureHistory = [];
}

// Seed baseline trend points so chart renders instantly on app launch
if (!moistureHistory || moistureHistory.length === 0) {
    const now = Date.now();
    for (let i = 8; i >= 0; i--) {
        const t = new Date(now - i * 60000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        moistureHistory.push({ time: t, m1: 58 + Math.round(Math.sin(i) * 6), m2: 63 + Math.round(Math.cos(i) * 5) });
    }
}

function initMoistureLiveChart() {
    const canvas = document.getElementById('moistureLiveChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (moistureLiveChartInstance) {
        moistureLiveChartInstance.destroy();
    }

    const gradZ1 = ctx.createLinearGradient(0, 0, 0, 260);
    gradZ1.addColorStop(0, 'rgba(16, 185, 129, 0.35)');
    gradZ1.addColorStop(1, 'rgba(16, 185, 129, 0.0)');

    const gradZ2 = ctx.createLinearGradient(0, 0, 0, 260);
    gradZ2.addColorStop(0, 'rgba(6, 182, 212, 0.35)');
    gradZ2.addColorStop(1, 'rgba(6, 182, 212, 0.0)');

    const labels = moistureHistory.map(h => h.time);
    const dataZ1 = moistureHistory.map(h => h.m1);
    const dataZ2 = moistureHistory.map(h => h.m2);

    // Populate stat chips immediately
    if (moistureHistory.length > 0) {
        const latest = moistureHistory[moistureHistory.length - 1];
        const statZ1Cur = document.getElementById('stat-z1-current');
        const statZ2Cur = document.getElementById('stat-z2-current');
        const statZ1Min = document.getElementById('stat-z1-min');
        const statZ1Max = document.getElementById('stat-z1-max');
        const statZ1Avg = document.getElementById('stat-z1-avg');
        const statZ2Min = document.getElementById('stat-z2-min');
        const statZ2Max = document.getElementById('stat-z2-max');
        const statZ2Avg = document.getElementById('stat-z2-avg');

        if (statZ1Cur) statZ1Cur.innerText = latest.m1 + '%';
        if (statZ2Cur) statZ2Cur.innerText = latest.m2 + '%';

        const z1List = moistureHistory.map(h => h.m1);
        const z2List = moistureHistory.map(h => h.m2);
        if (statZ1Min) statZ1Min.innerText = Math.min(...z1List);
        if (statZ1Max) statZ1Max.innerText = Math.max(...z1List);
        if (statZ1Avg) statZ1Avg.innerText = Math.round(z1List.reduce((a, b) => a + b, 0) / z1List.length);
        if (statZ2Min) statZ2Min.innerText = Math.min(...z2List);
        if (statZ2Max) statZ2Max.innerText = Math.max(...z2List);
        if (statZ2Avg) statZ2Avg.innerText = Math.round(z2List.reduce((a, b) => a + b, 0) / z2List.length);
    }

    moistureLiveChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Zone 1 (Zone A) Moisture',
                    data: dataZ1,
                    borderColor: '#10b981',
                    backgroundColor: gradZ1,
                    borderWidth: 3,
                    pointBackgroundColor: '#10b981',
                    pointBorderColor: '#ffffff',
                    pointBorderWidth: 1.5,
                    pointRadius: 4,
                    pointHoverRadius: 7,
                    tension: 0.35,
                    fill: true
                },
                {
                    label: 'Zone 2 (Zone B) Moisture',
                    data: dataZ2,
                    borderColor: '#06b6d4',
                    backgroundColor: gradZ2,
                    borderWidth: 3,
                    pointBackgroundColor: '#06b6d4',
                    pointBorderColor: '#ffffff',
                    pointBorderWidth: 1.5,
                    pointRadius: 4,
                    pointHoverRadius: 7,
                    tension: 0.35,
                    fill: true
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                mode: 'index',
                intersect: false
            },
            plugins: {
                legend: {
                    display: true,
                    position: 'top',
                    labels: {
                        color: '#94a3b8',
                        font: { family: "'Inter', sans-serif", size: 12, weight: 600 },
                        usePointStyle: true,
                        pointStyle: 'circle',
                        padding: 15
                    }
                },
                tooltip: {
                    backgroundColor: 'rgba(15, 23, 42, 0.9)',
                    titleColor: '#f8fafc',
                    bodyColor: '#e2e8f0',
                    borderColor: 'rgba(255, 255, 255, 0.1)',
                    borderWidth: 1,
                    padding: 12,
                    boxPadding: 6,
                    usePointStyle: true,
                    callbacks: {
                        label: function(context) {
                            return ` ${context.dataset.label}: ${context.parsed.y}%`;
                        }
                    }
                }
            },
            scales: {
                y: {
                    min: 0,
                    max: 100,
                    grid: {
                        color: 'rgba(255, 255, 255, 0.05)'
                    },
                    ticks: {
                        color: '#94a3b8',
                        font: { family: "'Inter', sans-serif", size: 11 },
                        stepSize: 20,
                        callback: function(val) { return val + '%'; }
                    }
                },
                x: {
                    grid: {
                        color: 'rgba(255, 255, 255, 0.03)'
                    },
                    ticks: {
                        color: '#94a3b8',
                        font: { family: "'Inter', sans-serif", size: 10 },
                        maxTicksLimit: 8
                    }
                }
            }
        }
    });

    const filterAll = document.getElementById('chart-filter-all');
    const filterZ1 = document.getElementById('chart-filter-z1');
    const filterZ2 = document.getElementById('chart-filter-z2');

    const updateFilterActive = (activeBtn) => {
        [filterAll, filterZ1, filterZ2].forEach(b => { if (b) b.classList.remove('active'); });
        if (activeBtn) activeBtn.classList.add('active');
    };

    if (filterAll) {
        filterAll.onclick = () => {
            updateFilterActive(filterAll);
            if (moistureLiveChartInstance) {
                moistureLiveChartInstance.setDatasetVisibility(0, true);
                moistureLiveChartInstance.setDatasetVisibility(1, true);
                moistureLiveChartInstance.update();
            }
        };
    }
    if (filterZ1) {
        filterZ1.onclick = () => {
            updateFilterActive(filterZ1);
            if (moistureLiveChartInstance) {
                moistureLiveChartInstance.setDatasetVisibility(0, true);
                moistureLiveChartInstance.setDatasetVisibility(1, false);
                moistureLiveChartInstance.update();
            }
        };
    }
    if (filterZ2) {
        filterZ2.onclick = () => {
            updateFilterActive(filterZ2);
            if (moistureLiveChartInstance) {
                moistureLiveChartInstance.setDatasetVisibility(0, false);
                moistureLiveChartInstance.setDatasetVisibility(1, true);
                moistureLiveChartInstance.update();
            }
        };
    }
}

// Auto-initialize moisture chart
setTimeout(initMoistureLiveChart, 150);
window.addEventListener('load', () => {
    initMoistureLiveChart();
});

function updateLiveMoistureChart(m1, m2, thresholds = {}) {
    if (m1 === undefined && m2 === undefined) return;
    const val1 = Number(m1) || 0;
    const val2 = Number(m2) || 0;
    const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

    moistureHistory.push({ time: timeStr, m1: val1, m2: val2 });
    if (moistureHistory.length > 25) {
        moistureHistory.shift();
    }
    try {
        localStorage.setItem('ecosmart_moisture_history', JSON.stringify(moistureHistory));
    } catch (e) {}

    const statZ1Cur = document.getElementById('stat-z1-current');
    const statZ2Cur = document.getElementById('stat-z2-current');
    const statZ1Min = document.getElementById('stat-z1-min');
    const statZ1Max = document.getElementById('stat-z1-max');
    const statZ1Avg = document.getElementById('stat-z1-avg');
    const statZ2Min = document.getElementById('stat-z2-min');
    const statZ2Max = document.getElementById('stat-z2-max');
    const statZ2Avg = document.getElementById('stat-z2-avg');

    if (statZ1Cur) statZ1Cur.innerText = val1 + '%';
    if (statZ2Cur) statZ2Cur.innerText = val2 + '%';

    const z1List = moistureHistory.map(h => h.m1);
    const z2List = moistureHistory.map(h => h.m2);

    if (z1List.length > 0) {
        if (statZ1Min) statZ1Min.innerText = Math.min(...z1List);
        if (statZ1Max) statZ1Max.innerText = Math.max(...z1List);
        if (statZ1Avg) statZ1Avg.innerText = Math.round(z1List.reduce((a, b) => a + b, 0) / z1List.length);
    }
    if (z2List.length > 0) {
        if (statZ2Min) statZ2Min.innerText = Math.min(...z2List);
        if (statZ2Max) statZ2Max.innerText = Math.max(...z2List);
        if (statZ2Avg) statZ2Avg.innerText = Math.round(z2List.reduce((a, b) => a + b, 0) / z2List.length);
    }

    const badgeZ1 = document.getElementById('z1-status-badge');
    const badgeZ2 = document.getElementById('z2-status-badge');
    const v1On = thresholds.v1On ?? 45;
    const v1Off = thresholds.v1Off ?? 78;
    const v2On = thresholds.v2On ?? 44;
    const v2Off = thresholds.v2Off ?? 66;

    if (badgeZ1) {
        if (val1 <= v1On) {
            badgeZ1.className = 'chip-badge dry';
            badgeZ1.innerText = 'Dry (Trigger)';
        } else if (val1 >= v1Off) {
            badgeZ1.className = 'chip-badge saturated';
            badgeZ1.innerText = 'Saturated';
        } else {
            badgeZ1.className = 'chip-badge';
            badgeZ1.innerText = 'Optimal';
        }
    }

    if (badgeZ2) {
        if (val2 <= v2On) {
            badgeZ2.className = 'chip-badge dry';
            badgeZ2.innerText = 'Dry (Trigger)';
        } else if (val2 >= v2Off) {
            badgeZ2.className = 'chip-badge saturated';
            badgeZ2.innerText = 'Saturated';
        } else {
            badgeZ2.className = 'chip-badge';
            badgeZ2.innerText = 'Optimal';
        }
    }

    const thZ1On = document.getElementById('stat-z1-on-th');
    const thZ1Off = document.getElementById('stat-z1-off-th');
    const thZ2On = document.getElementById('stat-z2-on-th');
    const thZ2Off = document.getElementById('stat-z2-off-th');
    if (thZ1On) thZ1On.innerText = v1On;
    if (thZ1Off) thZ1Off.innerText = v1Off;
    if (thZ2On) thZ2On.innerText = v2On;
    if (thZ2Off) thZ2Off.innerText = v2Off;

    if (!moistureLiveChartInstance) {
        initMoistureLiveChart();
    } else {
        moistureLiveChartInstance.data.labels = moistureHistory.map(h => h.time);
        moistureLiveChartInstance.data.datasets[0].data = moistureHistory.map(h => h.m1);
        moistureLiveChartInstance.data.datasets[1].data = moistureHistory.map(h => h.m2);
        moistureLiveChartInstance.update('none');
    }
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
            if (item.id === 'nav-home' && moistureLiveChartInstance) {
                moistureLiveChartInstance.resize();
            }
        };
    }
});

// Hamburger Menu & Mobile Sidebar toggles
const hamburgerMenus = document.querySelectorAll('.hamburger-menu');
const sidebar = document.querySelector('.sidebar');

if (sidebar) {
    hamburgerMenus.forEach(btn => {
        btn.onclick = (e) => {
            e.stopPropagation();
            sidebar.classList.toggle('active');
        };
    });

    const navButtons = document.querySelectorAll('.nav-btn');
    navButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            sidebar.classList.remove('active');
        });
    });

    document.addEventListener('click', (e) => {
        if (!sidebar.contains(e.target) && !e.target.classList.contains('hamburger-menu')) {
            sidebar.classList.remove('active');
        }
    });
}

// Authentication & Realtime State
let userUid = null;
let dbUnsubscribe = null;
let prevSystemState = null;
let lastMoistureLogTime = 0;

// Handle Email & Password Sign In
const loginBtn = document.getElementById('btn-login-email');
if (loginBtn) {
    loginBtn.onclick = async () => {
        const email = document.getElementById('email-address').value.trim();
        const password = document.getElementById('user-password').value.trim();
        const errorDiv = document.getElementById('login-error');
        if (errorDiv) errorDiv.style.display = 'none';

        if (!email || !password) {
            if (errorDiv) {
                errorDiv.innerText = "Please enter both email and password.";
                errorDiv.style.display = 'block';
            }
            return;
        }

        try {
            await signInWithEmailAndPassword(auth, email, password);
        } catch (error) {
            console.error("Login Error:", error);
            if (errorDiv) {
                errorDiv.innerText = error.message;
                errorDiv.style.display = 'block';
            }
        }
    };
}

// Quick fill ESP32 hardware account
const quickFillBtn = document.getElementById('btn-quick-fill-esp32');
if (quickFillBtn) {
    quickFillBtn.onclick = () => {
        const emailField = document.getElementById('email-address');
        const passField = document.getElementById('user-password');
        if (emailField) emailField.value = "esp32@ecosmart.com";
        if (passField) passField.value = "rjSmartESP32Password123";
        if (loginBtn) loginBtn.click();
    };
}

// Banner switch button handler
const bannerSwitchBtn = document.getElementById('btn-banner-switch');
if (bannerSwitchBtn) {
    bannerSwitchBtn.onclick = async () => {
        await handleSignOut();
        const emailField = document.getElementById('email-address');
        const passField = document.getElementById('user-password');
        if (emailField) emailField.value = "esp32@ecosmart.com";
        if (passField) passField.value = "rjSmartESP32Password123";
        if (loginBtn) loginBtn.click();
    };
}

// Unified Sign-Out Handler
const handleSignOut = async () => {
    try {
        await signOut(auth);
        prevSystemState = null;
        log("User signed out from dashboard", "info", "AUTH");
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
        userUid = user.uid;
        if (login) login.style.display = 'none';
        if (dashboard) dashboard.style.display = 'flex';
        log("Authenticated as " + user.email + " (UID: " + userUid + ")", "system", "AUTH");

        // Account mapping banner
        const banner = document.getElementById('account-banner');
        const bannerText = document.getElementById('account-banner-text');
        if (user.email === 'esp32@ecosmart.com') {
            if (banner) banner.style.display = 'none';
        } else {
            if (banner && bannerText) {
                bannerText.innerText = `Connected as ${user.email}. Connected IoT device is mapped to esp32@ecosmart.com.`;
                banner.style.display = 'flex';
            }
        }

        setTimeout(() => {
            initMoistureLiveChart();
        }, 100);

        // Realtime Firebase State & Event Detection Engine
        if (dbUnsubscribe) dbUnsubscribe();
        prevSystemState = null;

        dbUnsubscribe = onValue(ref(db, `/users/${userUid}`), (snapshot) => {
            const data = snapshot.val();
            if (!data) {
                log(`Waiting for hardware telemetry on /users/${userUid}...`, "warning", "SYSTEM");
                return;
            }
            const isFirst = (prevSystemState === null);
            activeSystemState = data;

            const syncText = document.getElementById('sync-text');
            if (syncText) syncText.innerText = "System Sync Live";
            
            const dot = document.querySelector('.dot');
            if (dot) dot.style.background = "#10b981";

            const v1On = data.valve1_on_threshold !== undefined ? data.valve1_on_threshold : 45;
            const v1Off = data.valve1_off_threshold !== undefined ? data.valve1_off_threshold : 78;
            const v2On = data.valve2_on_threshold !== undefined ? data.valve2_on_threshold : 44;
            const v2Off = data.valve2_off_threshold !== undefined ? data.valve2_off_threshold : 66;

            // 1. Initial State Summary Log
            if (isFirst) {
                log(`Hardware Sync Established. Pump: ${data.motor_on ? "ON" : "OFF"} | V1: ${data.valve1_on ? "OPEN" : "CLOSED"} | V2: ${data.valve2_on ? "OPEN" : "CLOSED"}`, "system", "SYSTEM");
                log(`Live Telemetry -> Zone 1: ${data.moisture1 ?? 0}% | Zone 2: ${data.moisture2 ?? 0}% | Rain: ${data.rainstatus ? "YES" : "NO"}`, "info", "TELEMETRY");
            } else {
                // 2. Hardware state-change event detection
                if (data.motor_on !== prevSystemState.motor_on) {
                    if (data.motor_on) {
                        log("Master Motor (Primary Pump) turned ON - Irrigation in progress", "success", "MOTOR");
                    } else {
                        log("Master Motor (Primary Pump) turned OFF - Pump standby", "warning", "MOTOR");
                    }
                }

                if (data.valve1_on !== prevSystemState.valve1_on) {
                    if (data.valve1_on) {
                        log("Valve 1 (Zone A) OPENED - Water flow started in Zone A", "success", "VALVE 1");
                    } else {
                        log("Valve 1 (Zone A) CLOSED - Zone A isolated", "info", "VALVE 1");
                    }
                }

                if (data.valve2_on !== prevSystemState.valve2_on) {
                    if (data.valve2_on) {
                        log("Valve 2 (Zone B) OPENED - Water flow started in Zone B", "success", "VALVE 2");
                    } else {
                        log("Valve 2 (Zone B) CLOSED - Zone B isolated", "info", "VALVE 2");
                    }
                }

                const curRain = (data.rainstatus === true || data.rainstatus === "true");
                const prevRain = (prevSystemState.rainstatus === true || prevSystemState.rainstatus === "true");
                if (curRain !== prevRain) {
                    if (curRain) {
                        log("🌧️ Rain Detected by field sensor! Emergency irrigation shutdown activated", "danger", "WEATHER");
                    } else {
                        log("☀️ Rain Cleared - Field sensor normal, threshold logic resumed", "info", "WEATHER");
                    }
                }

                if (data.auto_mode !== prevSystemState.auto_mode) {
                    if (data.auto_mode) {
                        log("Auto Logic Master ENABLED - Valves automatically regulated by soil moisture thresholds", "system", "AUTO");
                    } else {
                        log("Auto Logic Master DISABLED - Switched to manual override mode", "warning", "AUTO");
                    }
                }

                // Threshold cross warnings
                if (data.moisture1 !== undefined && data.moisture1 <= v1On && prevSystemState.moisture1 > v1On) {
                    log(`⚠️ Alert: Zone 1 Moisture (${data.moisture1}%) reached turn-ON threshold (${v1On}%)!`, "warning", "ALERT");
                }
                if (data.moisture2 !== undefined && data.moisture2 <= v2On && prevSystemState.moisture2 > v2On) {
                    log(`⚠️ Alert: Zone 2 Moisture (${data.moisture2}%) reached turn-ON threshold (${v2On}%)!`, "warning", "ALERT");
                }

                // Moisture reading updates
                const now = Date.now();
                const m1Diff = Math.abs((data.moisture1 || 0) - (prevSystemState.moisture1 || 0));
                const m2Diff = Math.abs((data.moisture2 || 0) - (prevSystemState.moisture2 || 0));
                if (m1Diff >= 2 || m2Diff >= 2 || (now - lastMoistureLogTime > 45000)) {
                    log(`Telemetry Update -> Zone 1: ${data.moisture1 ?? 0}% | Zone 2: ${data.moisture2 ?? 0}%`, "info", "TELEMETRY");
                    lastMoistureLogTime = now;
                }
            }

            // Update gauges
            if (data.moisture1 !== undefined) updateGauge('fill1', 'val1', data.moisture1);
            if (data.moisture2 !== undefined) updateGauge('fill2', 'val2', data.moisture2);

            // Update Live Soil Moisture Dynamics Chart
            updateLiveMoistureChart(data.moisture1, data.moisture2, { v1On, v1Off, v2On, v2Off });

            // Weather Card
            const rain = data.rainstatus === true || data.rainstatus === "true";
            const weatherBox = document.getElementById('weather-box');
            const weatherText = document.getElementById('weather-text');
            if (weatherBox) weatherBox.className = rain ? "status-card rain" : "status-card clear";
            if (weatherText) weatherText.innerText = rain ? "Rain Detected" : "Clear Skies";

            // Controls
            const motorOnBox = document.getElementById('motor_on');
            const valve1OnBox = document.getElementById('valve1_on');
            const valve2OnBox = document.getElementById('valve2_on');
            const autoLogicMasterBox = document.getElementById('auto_logic_master');

            if (motorOnBox) motorOnBox.checked = data.motor_on || false;
            if (valve1OnBox) valve1OnBox.checked = data.valve1_on || false;
            if (valve2OnBox) valve2OnBox.checked = data.valve2_on || false;
            if (autoLogicMasterBox) autoLogicMasterBox.checked = data.auto_mode || false;

            // Sync thresholds to input elements if available
            const v1OnThresh = document.getElementById('v1_on_thresh');
            const v1OffThresh = document.getElementById('v1_off_thresh');
            const v2OnThresh = document.getElementById('v2_on_thresh');
            const v2OffThresh = document.getElementById('v2_off_thresh');

            if (data.valve1_on_threshold !== undefined && v1OnThresh) v1OnThresh.value = data.valve1_on_threshold;
            if (data.valve1_off_threshold !== undefined && v1OffThresh) v1OffThresh.value = data.valve1_off_threshold;
            if (data.valve2_on_threshold !== undefined && v2OnThresh) v2OnThresh.value = data.valve2_on_threshold;
            if (data.valve2_off_threshold !== undefined && v2OffThresh) v2OffThresh.value = data.valve2_off_threshold;

            prevSystemState = { ...data };
        }, (error) => {
            console.error("RTDB Stream Error:", error);
            log("Database Sync Error: " + error.message, "danger", "ALERT");
        });
    } else {
        userUid = null;
        prevSystemState = null;
        if (dbUnsubscribe) {
            dbUnsubscribe();
            dbUnsubscribe = null;
        }
        if (dashboard) dashboard.style.display = 'none';
        if (login) login.style.display = 'flex';
        
        const emailInput = document.getElementById('email-address');
        const passInput = document.getElementById('user-password');
        const errorDiv = document.getElementById('login-error');
        if (emailInput) emailInput.value = "";
        if (passInput) passInput.value = "";
        if (errorDiv) errorDiv.style.display = 'none';
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

// Chart Rendering Logic (Two Charts)
const renderChartBtn = document.getElementById('btn-render-chart');
if (renderChartBtn) {
    renderChartBtn.onclick = async () => {
        if (!userUid) return;
        const dist = parseFloat(document.getElementById('calc-dist').value);
        const speed = parseFloat(document.getElementById('calc-speed').value);
        const flow = parseFloat(document.getElementById('calc-flow').value);

        const travelTimeMins = (dist / speed) * 60;

        try {
            const snapshot = await get(ref(db, `users/${userUid}/daily_logs`));
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

                // Chart 1: Usage
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

                // Chart 2: Saved
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

// Manual Controls (Step 3: Refactored writes using update())
const motorOnCheckbox = document.getElementById('motor_on');
if (motorOnCheckbox) {
    motorOnCheckbox.onchange = (e) => {
        log(`User manual toggle -> Master Pump: ${e.target.checked ? "ON" : "OFF"}`, "info", "USER");
        if (userUid) {
            update(ref(db, `users/${userUid}`), { motor_on: e.target.checked });
        }
    };
}

const valve1Checkbox = document.getElementById('valve1_on');
if (valve1Checkbox) {
    valve1Checkbox.onchange = (e) => {
        log(`User manual toggle -> Valve 1 (Zone A): ${e.target.checked ? "OPEN" : "CLOSED"}`, "info", "USER");
        if (userUid) {
            update(ref(db, `users/${userUid}`), { valve1_on: e.target.checked });
        }
    };
}

const valve2Checkbox = document.getElementById('valve2_on');
if (valve2Checkbox) {
    valve2Checkbox.onchange = (e) => {
        log(`User manual toggle -> Valve 2 (Zone B): ${e.target.checked ? "OPEN" : "CLOSED"}`, "info", "USER");
        if (userUid) {
            update(ref(db, `users/${userUid}`), { valve2_on: e.target.checked });
        }
    };
}

const autoLogicMasterCheckbox = document.getElementById('auto_logic_master');
if (autoLogicMasterCheckbox) {
    autoLogicMasterCheckbox.onchange = (e) => {
        log(`User manual toggle -> Auto Logic Master: ${e.target.checked ? "ENABLED" : "DISABLED"}`, "info", "USER");
        if (userUid) {
            update(ref(db, `users/${userUid}`), { auto_mode: e.target.checked });
        }
    };
}

// Auto Logic Thresholds configuration save using update()
const saveAutoBtn = document.getElementById('btn-save-auto');
if (saveAutoBtn) {
    saveAutoBtn.onclick = () => {
        if (!userUid) return;
        const v1On = parseInt(document.getElementById('v1_on_thresh').value);
        const v1Off = parseInt(document.getElementById('v1_off_thresh').value);
        const v2On = parseInt(document.getElementById('v2_on_thresh').value);
        const v2Off = parseInt(document.getElementById('v2_off_thresh').value);

        update(ref(db, `users/${userUid}`), {
            valve1_on_threshold: v1On,
            valve1_off_threshold: v1Off,
            valve2_on_threshold: v2On,
            valve2_off_threshold: v2Off
        });
        log(`Threshold configuration applied -> Z1[${v1On}%-${v1Off}%], Z2[${v2On}%-${v2Off}%]`, "success", "CONFIG");
    };
}

// Theme Toggle
const themeCheckbox = document.getElementById('theme-checkbox');
if (themeCheckbox) {
    themeCheckbox.onchange = (e) => {
        document.documentElement.setAttribute('data-theme', e.target.checked ? 'light' : 'dark');
        const themeText = document.getElementById('theme-text');
        if (themeText) themeText.innerText = e.target.checked ? 'Light Mode' : 'Dark Mode';
        log(`Display theme changed to ${e.target.checked ? 'Light' : 'Dark'} Mode`, 'info', 'SYSTEM');
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
            log("Field crop photo selected for AI analysis", "info", "AI");
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

        log("AI Field Analysis in progress...", "info", "AI");

        try {
            const model = genAI.getGenerativeModel({ model: "gemini-3.5-flash" });

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
            log("AI Field Analysis completed successfully", "success", "AI");

        } catch (err) {
            console.error(err);
            if (responseContainer) {
                responseContainer.innerHTML = `<span style="color:#ef4444"><b>Error:</b> ${err.message || 'Failed to analyze Image. Check console.'}</span>`;
            }
            log("AI Analysis error: " + (err.message || "Request failed"), "danger", "AI");
        } finally {
            if (btnAnalyze) btnAnalyze.style.display = 'block';
            if (loadingIndicator) loadingIndicator.style.display = 'none';
        }
    };
}
