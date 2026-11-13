const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbx3nnZ45NKjve47jyhHHYYUTYxYExbxcoBGbn5SzfBHKBQtvtQ8HQSoyLopq7S4fJb9/exec";
const $ = (id) => document.getElementById(id);

let stream, facing = "user", mdOk = !1, dtOk = !1, camOk = !1, isRun = !1, matcher, db = {}, ids = [];
let cvs, dSize, scanT = 0, descs = [], tmpDesc, tmpImg, lastLbl = "";
const MODE = $('btn-save') ? 'enroll' : $('section-profile') ? 'lookup' : 'checkin', vid = $('video');

window.onload = () => {
    let ua = navigator.userAgent, u = location.href.replace(/^https?:\/\//, '');
    if (/(FBAN|FBAV|Zalo|Instagram|TikTok)/i.test(ua)) {
        if (/android/i.test(ua)) location.href = `intent://${u}#Intent;scheme=https;package=com.android.chrome;end`;
        else if (/iphone|ipad|ipod/i.test(ua)) location.href = `googlechrome://${u}`;
        return MODE === 'checkin' ? updUI('error', 'Mở bằng Safari/Chrome', 'BỊ CHẶN') : ($('status-box') && ($('status-box').innerText = "⚠ Mở bằng Safari/Chrome"), $('header-subtitle') && ($('header-subtitle').innerText = "Bị giới hạn"));
    }
    startCam(facing); loadModels(); fetchDB();
};

async function loadModels() {
    try {
        let uri = 'https://justadudewhohacks.github.io/face-api.js/models';
        await Promise.all([faceapi.nets.tinyFaceDetector.loadFromUri(uri), faceapi.nets.faceLandmark68Net.loadFromUri(uri), faceapi.nets.faceRecognitionNet.loadFromUri(uri)]);
        mdOk = !0; run()
    } catch (e) { MODE === 'checkin' ? updUI('error', 'Lỗi tải AI', 'LỖI') : $('status-box').innerText = "Lỗi tải AI!" }
}

async function fetchDB() {
    try {
        let r = await (await fetch(SCRIPT_URL)).json();
        if (r.status === "success" && r.data.length) {
            let lbs = [];
            r.data.forEach(([id, t, raw, img]) => {
                if (!id || !raw) return;
                ids.push(String(id)); db[id] = { name: "ID: " + id, id: String(id), time: t, image: img };
                try { lbs.push(new faceapi.LabeledFaceDescriptors(String(id), [new Float32Array(typeof raw === 'string' ? JSON.parse(raw) : raw)])) } catch (e) {}
            });
            if (lbs.length) matcher = new faceapi.FaceMatcher(lbs, MODE === 'checkin' ? 0.38 : 0.40);
        }
    } catch (e) {}
    dtOk = !0; run();
}

async function startCam(f) {
    stopCam();
    try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 720 }, height: { ideal: 720 }, facingMode: f } });
        vid.srcObject = stream; vid.className = f === "user" ? "front-camera" : "back-camera";
        vid.onloadedmetadata = () => {
            vid.play();
            if (MODE === 'checkin') {
                if (!cvs) { cvs = faceapi.createCanvasFromMedia(vid); $('container').append(cvs) }
                cvs.className = vid.className; faceapi.matchDimensions(cvs, dSize = { width: vid.videoWidth, height: vid.videoHeight });
            }
            camOk = !0; run();
        };
    } catch (e) { MODE === 'checkin' ? updUI('error', 'Lỗi Camera!', 'LỖI') : ($('status-box').innerText = "⚠ Lỗi Camera!") }
}

function stopCam() { isRun = !1; stream?.getTracks().forEach(t => t.stop()); stream = vid.srcObject = null }
window.switchCamera = () => { $('btn-switch') && ($('btn-switch').style.display = 'none'); startCam(facing = facing === "user" ? "environment" : "user") };
document.addEventListener("visibilitychange", () => document.hidden ? stopCam() : (dtOk && !isRun && (MODE === 'checkin' || $('section-scan').style.display !== 'none') && startCam(facing)));
window.addEventListener("pagehide", stopCam); window.addEventListener("beforeunload", stopCam);

function run() {
    if (mdOk && dtOk && camOk && !isRun) {
        isRun = !0; $('btn-switch') && ($('btn-switch').style.display = 'flex');
        if (MODE === 'checkin') { updUI('hide'); matcher && loopCheck() }
        else if (MODE === 'enroll') { rstUI("Sẵn sàng! Đưa mặt vào", "#94a3b8", !0); loopScan(25, 200, enrollLogic) }
        else { rstUI("Đưa khuôn mặt vào tra cứu", "#38bdf8", !0); loopScan(30, 100, lookupLogic) }
    }
}

// CHẠY LOOP CHO CHECK-IN
const loopCheck = async () => {
    if (!isRun || vid.paused || !matcher) return;
    try {
        let det = await faceapi.detectSingleFace(vid, new faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.6 })).withFaceLandmarks().withFaceDescriptor();
        cvs.getContext('2d').clearRect(0, 0, cvs.width, cvs.height);
        if (!det) lastLbl !== "scanning" && (updUI('hide'), lastLbl = "scanning");
        else {
            let res = faceapi.resizeResults(det, dSize), best = matcher.findBestMatch(res.descriptor);
            if (best.label === "unknown") lastLbl !== "scanning" && (updUI('hide'), lastLbl = "scanning");
            else {
                new faceapi.draw.DrawBox(res.detection.box, { boxColor: "#10B981", lineWidth: 3 }).draw(cvs);
                if (lastLbl !== best.label) { lastLbl = best.label; updUI('success', db[lastLbl].name, 'THÀNH CÔNG', db[lastLbl].image) }
            }
        }
    } catch (e) {}
    if (isRun) requestAnimationFrame(loopCheck);
};

// CHẠY LOOP CHO ĐĂNG KÝ VÀ TRA CỨU
const loopScan = async (iv, maxT, cb) => {
    let last = Date.now(), opt = new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.5 });
    const step = async () => {
        if (!isRun || vid.paused) return;
        if (Date.now() - last >= iv) {
            last = Date.now();
            try {
                let det = await faceapi.detectSingleFace(vid, opt).withFaceLandmarks().withFaceDescriptor();
                if (det) {
                    let b = det.detection.box, cx = vid.videoWidth / 2, cy = vid.videoHeight / 2;
                    Math.abs((b.x + b.width / 2) - cx) < 220 && Math.abs((b.y + b.height / 2) - cy) < 220 ? cb(det, iv, maxT) : rstUI("⚠ Đưa mặt vào giữa khung", "#f87171", !0);
                } else rstUI("🔍 Đang quét...", "#94a3b8", !0);
            } catch (e) {}
        }
        if (isRun) requestAnimationFrame(step);
    }; step();
};

const enrollLogic = (d, iv, maxT) => {
    let l = d.landmarks, lE = l.getLeftEye().reduce((a, c) => ({ x: a.x + c.x / 6, y: a.y + c.y / 6 }), { x: 0, y: 0 }), rE = l.getRightEye().reduce((a, c) => ({ x: a.x + c.x / 6, y: a.y + c.y / 6 }), { x: 0, y: 0 }), n = l.getNose()[3], j = l.getJawOutline()[8];
    let rA = Math.abs(Math.atan2(rE.y - lE.y, rE.x - lE.x) * 180 / Math.PI), pR = (n.y - (lE.y + rE.y) / 2) / (j.y - n.y), trn = Math.abs(n.x - (lE.x + rE.x) / 2) / Math.hypot(rE.x - lE.x, rE.y - lE.y);
    if (rA > 10 && rA < 170) rstUI("⚠️ Không nghiêng đầu", "#f87171", !0);
    else if (trn > 0.22) rstUI("⚠️ Hãy nhìn thẳng", "#f87171", !0);
    else if (pR < 0.6) rstUI("⚠️ Không ngửa đầu", "#f87171", !0);
    else if (pR > 1.2) rstUI("⚠️ Không cúi đầu", "#f87171", !0);
    else {
        scanT += iv; descs.push(d.descriptor); $('progress-bar').style.width = `${Math.min(100, scanT * 100 / maxT)}%`; $('guide-circle').classList.add('active'); rstUI("Đang chụp...", "#34d399");
        if (scanT >= maxT) {
            isRun = !1; vid.pause(); let c = document.createElement('canvas'), x = c.getContext('2d'); c.width = vid.videoWidth; c.height = vid.videoHeight;
            if (facing === "user") { x.translate(c.width, 0); x.scale(-1, 1) } x.drawImage(vid, 0, 0, c.width, c.height);
            tmpDesc = descs[0].map((_, i) => descs.reduce((a, b) => a + b[i], 0) / descs.length); tmpImg = c.toDataURL('image/jpeg', 0.85);
            let m = matcher?.findBestMatch(new Float32Array(tmpDesc)).label;
            if (m && m !== "unknown") { stopCam(); showPanel('section-duplicate', "Trùng lặp"); $('dup-id').innerText = m; $('dup-time').innerText = db[m].time || "Đã có"; $('dup-img').src = db[m].image ? getImg(db[m].image) : tmpImg; return }
            showPanel('section-confirm', "Kiểm tra ảnh"); $('preview-img').src = tmpImg;
        }
    }
};

const lookupLogic = (d, iv, maxT) => {
    let m = matcher?.findBestMatch(d.descriptor);
    if (m && m.label !== "unknown") {
        scanT += iv; $('progress-bar').style.width = `${Math.min(100, scanT * 100 / maxT)}%`; $('guide-circle').classList.add('active'); rstUI("Đang tải...", "#34d399");
        if (scanT >= maxT) { isRun = !1; stopCam(); showPanel('section-profile', ""); $('profile-id').innerText = db[m.label].id; $('profile-time').innerText = db[m.label].time || "Không rõ"; $('profile-img').src = getImg(db[m.label].image); }
    } else rstUI("👤 Người lạ", "#94a3b8", !0);
};

// UI & UTILS
window.retakePhoto = () => { showPanel('section-scan', "Tự động chụp"); vid.play(); rstUI("Sẵn sàng!", "#94a3b8", !0); isRun = !0; run() };
window.resumeScanning = () => { showPanel('section-scan', ""); rstUI("Tra cứu...", "#38bdf8", !0); startCam(facing) };
window.confirmAndSave = () => {
    $('btn-save').disabled = !0; $('btn-save').innerHTML = "⏳ Chờ...";
    let d = new Date(), p = String(d.getFullYear()).slice(-2) + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0'), id, t = `${d.getHours()}:${d.getMinutes()} ${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;
    do { id = p + Math.floor(10000 + Math.random() * 90000) } while (ids.includes(id));
    stopCam(); showPanel('section-success', "Hoàn tất"); $('success-id').innerText = id; $('success-time').innerText = t; $('success-img').src = tmpImg;
    fetch(SCRIPT_URL, { method: 'POST', body: JSON.stringify({ id: id, faceData: JSON.stringify(Array.from(tmpDesc)), time: t, imageBase64: tmpImg }) })
        .then(r => r.json()).then(r => { $('sync-status').innerText = r.status === "success" ? "✅ Đồng bộ OK!" : "⚠ Lỗi!"; $('sync-status').style.color = r.status === "success" ? "#34D399" : "#f87171" }).catch(() => { $('sync-status').innerText = "⚠ Lỗi mạng!"; $('sync-status').style.color = "#f87171" });
};

const showPanel = (id, sub) => { ['section-scan', 'section-confirm', 'section-duplicate', 'section-success', 'section-profile'].forEach(e => $(e) && ($(e).style.display = e === id ? (e === 'section-scan' ? 'flex' : 'block') : 'none')); $('header-subtitle') && ($('header-subtitle').innerText = sub) };
const getImg = u => u?.match(/[-\w]{25,}/) ? `https://drive.google.com/thumbnail?id=${u.match(/[-\w]{25,}/)[0]}&sz=w400-h400-c` : u || '';
const updUI = (s, t, st, i) => { let b = $('info-box'), v = $('info-visual'); if (!b) return; if (s === 'hide') return b.className = 'info-box hide'; $('info-title').innerText = t; $('info-subtitle').innerText = st; b.className = `info-box ${s}`; v.innerHTML = i ? `<img class="info-avatar" src="${getImg(i)}">` : s === 'loading' ? '<div class="mini-spinner"></div>' : s === 'error' ? '⚠️' : '' };
const rstUI = (m, c, r) => { let b = $('status-box'); if (!b) return; b.innerText = m; b.style.color = c; if (r) { scanT = 0; $('progress-bar') && ($('progress-bar').style.width = '0%'); $('guide-circle') && $('guide-circle').classList.remove('active'); descs = [] } };
window.copyID = (el, btn) => { let t = $(el).innerText, o = btn.innerHTML, k = () => { btn.innerHTML = "✅ Đã chép"; btn.classList.add("copied"); setTimeout(() => { btn.innerHTML = o; btn.classList.remove("copied") }, 2000) }; if (navigator.clipboard) navigator.clipboard.writeText(t).then(k); else { let x = document.createElement("textarea"); x.value = t; document.body.appendChild(x); x.select(); document.execCommand("copy"); x.remove(); k() } };
