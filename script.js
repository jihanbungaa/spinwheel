    const canvas = document.getElementById('wheelCanvas');
    const ctx = canvas.getContext('2d');
    const nameInput = document.getElementById('name-input');
    const spinBtn = document.getElementById('spin-btn');
    const resetBtn = document.getElementById('reset-btn');
    const centerSpinBtn = document.getElementById('center-spin-button');
    const modalOverlay = document.getElementById('modal-overlay');
    const modal = document.getElementById('modal');
    const winnerDisplay = document.getElementById('winner-name');
    const closeModal = document.getElementById('close-modal');
    const popupToggle = document.getElementById('popup-toggle');
    const statusMsg = document.getElementById('status-msg');

    // Audio / sound controls
    const soundEnable = document.getElementById('sound-enable');
    const soundFile = document.getElementById('sound-file');
    const testSoundBtn = document.getElementById('test-sound');
    const soundVolume = document.getElementById('sound-volume');
    const soundLoop = document.getElementById('sound-loop');
    const spinAudio = document.getElementById('spin-audio');

    // Tab & Results / history UI elements
    const tabEntriesBtn = document.getElementById('tab-entries');
    const tabResultsBtn = document.getElementById('tab-results');
    const entriesPanel = document.getElementById('entries-panel');
    const resultsPanel = document.getElementById('results-panel');
    const entriesCountEl = document.getElementById('entries-count');
    const resultsListEl = document.getElementById('results-list');
    const resultsCountEl = document.getElementById('results-count');
    const clearResultsBtn = document.getElementById('clear-results');
    const sortResultsBtn = document.getElementById('sort-results');
    let results = []; // array of {name, time}


    let audioDataUrl = null;
    let audioEnabled = false;
    let audioContext = null;
    let spinOsc = null;
    let spinGain = null;

    let names = [];
    let currentRotation = 0;
    let isSpinning = false;
    let initialList = "";
    let lastWinnerIndex = null;

    const colors = [
        '#FF5733', '#33FF57', '#3357FF', '#F333FF', 
        '#FF33A1', '#33FFF6', '#FFC300', '#581845',
        '#28B463', '#AF7AC5', '#F4D03F', '#E67E22'
    ];

    function init() {
        initialList = nameInput.value;
        updateNames();
        
        nameInput.addEventListener('input', updateNames);
        spinBtn.addEventListener('click', spin);
        resetBtn.addEventListener('click', resetWheel);
        closeModal.addEventListener('click', hideWinner);
        modalOverlay.addEventListener('click', (e) => {
            if(e.target === modalOverlay) hideWinner();
        });

        // Center button and tap-to-spin handlers
        if (centerSpinBtn) {
            centerSpinBtn.addEventListener('click', (e) => { e.stopPropagation(); if (!isSpinning) spin(); });
            centerSpinBtn.addEventListener('touchstart', (e) => { e.preventDefault(); if (!isSpinning) spin(); }, {passive:false});
        }
        // Allow touching/clicking the wheel canvas to spin
        if (canvas) {
            canvas.addEventListener('pointerdown', (e) => {
                // Only respond to primary button/primary touch
                if (e.button && e.button !== 0) return;
                if (!isSpinning) spin();
            });
            canvas.addEventListener('touchstart', (e) => { e.preventDefault(); if (!isSpinning) spin(); }, {passive:false});
        }

        // Modal controls (close X and remove)
        const modalCloseX = document.getElementById('modal-close-x');
        const removeBtn = document.getElementById('remove-btn');
        if (modalCloseX) modalCloseX.addEventListener('click', hideWinner);
        if (removeBtn) removeBtn.addEventListener('click', () => {
            if (lastWinnerIndex !== null && typeof lastWinnerIndex !== 'undefined') {
                removeName(lastWinnerIndex);
                lastWinnerIndex = null;
                hideWinner();
            }
        });

        // Theme setup
        const themeToggle = document.getElementById('theme-toggle');
        const themeLabel = document.getElementById('theme-label');
        function applyTheme(theme) {
            if (theme === 'dark') document.body.classList.add('dark-theme');
            else document.body.classList.remove('dark-theme');
            if (themeToggle) themeToggle.checked = theme === 'dark';
            if (themeLabel) themeLabel.innerText = theme === 'dark' ? 'Dark' : 'Light';
            localStorage.setItem('theme', theme);
        }
        const savedTheme = localStorage.getItem('theme');
        const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
        applyTheme(savedTheme || (prefersDark ? 'dark' : 'light'));
        if (themeToggle) themeToggle.addEventListener('change', (e) => {
            applyTheme(e.target.checked ? 'dark' : 'light');
        });

        // Hide / show entries side-panel
        const hideToggle = document.getElementById('hide-toggle');
        const hideLabel = document.getElementById('hide-label');
        const sidePanelEl = document.querySelector('.side-panel');
        function applyHideMode(h) {
            if (!sidePanelEl) return;
            if (h) {
                sidePanelEl.classList.add('hidden');
                if (hideLabel) hideLabel.innerText = 'Show';
            } else {
                sidePanelEl.classList.remove('hidden');
                if (hideLabel) hideLabel.innerText = 'Hide';
            }
            localStorage.setItem('hideSide', h ? 'true' : 'false');
        }
        const savedHide = localStorage.getItem('hideSide') === 'true';
        if (hideToggle) {
            hideToggle.checked = savedHide;
            applyHideMode(hideToggle.checked);
            hideToggle.addEventListener('change', (e) => applyHideMode(e.target.checked));
        } else if (savedHide && sidePanelEl) {
            sidePanelEl.classList.add('hidden');
        }

        // --- Sound controls setup ---
        try {
            audioDataUrl = localStorage.getItem('spinAudioData');
            audioEnabled = localStorage.getItem('spinAudioEnabled') === 'true';
            const savedVol = parseFloat(localStorage.getItem('spinAudioVolume')) || 0.8;

            if (audioDataUrl) spinAudio.src = audioDataUrl;
            soundEnable.checked = audioEnabled;
            soundVolume.value = savedVol;
            spinAudio.volume = savedVol;
            soundEnable.addEventListener('change', (e) => {
                audioEnabled = !!e.target.checked;
                localStorage.setItem('spinAudioEnabled', audioEnabled);
            });

            soundVolume.addEventListener('input', (e) => {
                const v = parseFloat(e.target.value);
                spinAudio.volume = v;
                localStorage.setItem('spinAudioVolume', v);
            });

            soundFile.addEventListener('change', (e) => {
                const f = e.target.files && e.target.files[0];
                if (!f) return;
                const reader = new FileReader();
                reader.onload = () => {
                    audioDataUrl = reader.result;
                    spinAudio.src = audioDataUrl;
                    localStorage.setItem('spinAudioData', audioDataUrl);
                };
                reader.readAsDataURL(f);
            });

            testSoundBtn.addEventListener('click', () => {
                if (!spinAudio.src) {
                    // simple WebAudio beep as fallback
                    const ac = new (window.AudioContext || window.webkitAudioContext)();
                    const o = ac.createOscillator();
                    const g = ac.createGain();
                    o.type = 'sawtooth'; o.frequency.value = 400;
                    g.gain.value = parseFloat(soundVolume.value) || 0.8;
                    o.connect(g); g.connect(ac.destination);
                    o.start();
                    setTimeout(() => { o.stop(); ac.close(); }, 400);
                } else {
                    spinAudio.currentTime = 0;
                    spinAudio.volume = parseFloat(soundVolume.value) || 0.8;
                    spinAudio.play().catch(() => {});
                    setTimeout(() => { spinAudio.pause(); spinAudio.currentTime = 0; }, 800);
                }
            });
        } catch (err) {
            console.warn('Sound setup failed', err);
        }

        // Wire results/history controls
        if (clearResultsBtn) clearResultsBtn.addEventListener('click', () => {
            if (!confirm('Clear the results history?')) return;
            results = [];
            saveResults(); renderResults();
        });
        if (sortResultsBtn) sortResultsBtn.addEventListener('click', () => {
            results.sort((a,b) => a.name.localeCompare(b.name));
            saveResults(); renderResults();
        });

        // Tab switching
        if (tabEntriesBtn) tabEntriesBtn.addEventListener('click', () => switchTab('entries'));
        if (tabResultsBtn) tabResultsBtn.addEventListener('click', () => switchTab('results'));

        function switchTab(tab) {
            if (tab === 'entries') {
                if (tabEntriesBtn) tabEntriesBtn.classList.add('active');
                if (tabResultsBtn) tabResultsBtn.classList.remove('active');
                if (entriesPanel) entriesPanel.classList.add('show');
                if (resultsPanel) resultsPanel.classList.remove('show');
            } else {
                if (tabEntriesBtn) tabEntriesBtn.classList.remove('active');
                if (tabResultsBtn) tabResultsBtn.classList.add('active');
                if (entriesPanel) entriesPanel.classList.remove('show');
                if (resultsPanel) resultsPanel.classList.add('show');
            }
        }

        // Top-actions (Shuffle / Sort / Add image)
        const shuffleBtn = document.getElementById('shuffle-btn');
        const sortBtn = document.getElementById('sort-btn');
        const addImageBtn = document.getElementById('add-image-btn');
        if (shuffleBtn) shuffleBtn.addEventListener('click', () => {
            const arr = names.slice();
            for (let i = arr.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [arr[i], arr[j]] = [arr[j], arr[i]];
            }
            nameInput.value = arr.join('\n');
            updateNames();
        });
        if (sortBtn) sortBtn.addEventListener('click', () => {
            nameInput.value = names.slice().sort((a,b) => a.localeCompare(b)).join('\n'); updateNames();
        });
        if (addImageBtn) addImageBtn.addEventListener('click', () => { alert('Add image feature coming soon'); });

        // Ensure counts are up-to-date
        if (entriesCountEl) entriesCountEl.innerText = nameInput.value.split('\n').filter(n=>n.trim()).length;
        if (resultsCountEl) resultsCountEl.innerText = results.length;

        // Load saved results
        loadResults();
    }

    function updateNames() {
        names = nameInput.value.split('\n').filter(name => name.trim() !== "");
        drawWheel();
        if (entriesCountEl) entriesCountEl.innerText = names.length;
        
        if (names.length === 0) {
            spinBtn.disabled = true;
            statusMsg.innerText = "Add some names to spin!";
        } else if (names.length === 1 && isSpinning === false) {
             statusMsg.innerText = "One person left!";
             spinBtn.disabled = false;
        } else {
            spinBtn.disabled = false;
            statusMsg.innerText = "";
        }
    }

    function drawWheel() {
        const size = canvas.width;
        const center = size / 2;
        const radius = size / 2 - 10;
        
        ctx.clearRect(0, 0, size, size);

        if (names.length === 0) {
            ctx.beginPath();
            ctx.arc(center, center, radius, 0, Math.PI * 2);
            ctx.fillStyle = '#ddd';
            ctx.fill();
            return;
        }

        const arcSize = (Math.PI * 2) / names.length;

        names.forEach((name, i) => {
            const angle = currentRotation + (i * arcSize);
            
            // Draw Segment
            ctx.beginPath();
            ctx.moveTo(center, center);
            ctx.arc(center, center, radius, angle, angle + arcSize);
            ctx.fillStyle = colors[i % colors.length];
            ctx.fill();
            ctx.stroke();

            // Draw Text
            ctx.save();
            ctx.translate(center, center);
            ctx.rotate(angle + arcSize / 2);
            ctx.textAlign = "right";
            ctx.fillStyle = "white";
            ctx.font = "bold 24px Sans-Serif";
            // Ensure text fits
            const displayText = name.length > 15 ? name.substring(0, 12) + "..." : name;
            ctx.fillText(displayText, radius - 30, 10);
            ctx.restore();
        });

        // Center circle decoration (theme-aware)
        // White center disk and subtle ring to match the reference design
        ctx.beginPath();
        ctx.arc(center, center, 44, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.18)';
        ctx.lineWidth = 6;
        ctx.stroke();
    }

    function spin() {
        if (isSpinning || names.length === 0) return;

        isSpinning = true;
        spinBtn.disabled = true;
        nameInput.disabled = true;
        try { if (centerSpinBtn) { centerSpinBtn.classList.add('spinning'); centerSpinBtn.disabled = true; } } catch (e) {}


        // Start spin sound if enabled
        if (audioEnabled) startSpinSound();

        const extraSpins = 5 + Math.random() * 5; // 5 to 10 full rotations
        const spinDuration = 4000 + Math.random() * 2000; // 4-6 seconds
        const startRotation = currentRotation;
        const totalRotationGoal = startRotation + (extraSpins * Math.PI * 2);
        
        const startTime = performance.now();

        function animate(currentTime) {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / spinDuration, 1);
            
            // Ease out cubic function for realistic deceleration
            const easeOut = 1 - Math.pow(1 - progress, 3);
            
            currentRotation = startRotation + (totalRotationGoal - startRotation) * easeOut;

            // Update spin sound to match speed
            if (audioEnabled) updateSpinSound(easeOut);
            
            drawWheel();

            if (progress < 1) {
                requestAnimationFrame(animate);
            } else {
                finishSpin();
            }
        }

        requestAnimationFrame(animate);
    }

    function finishSpin() {
        isSpinning = false;
        nameInput.disabled = false;
        try { if (centerSpinBtn) { centerSpinBtn.classList.remove('spinning'); centerSpinBtn.disabled = false; } } catch (e) {}

        // Stop the spin sound
        if (audioEnabled) stopSpinSound();
        
        // Calculate Winner
        // Normalize rotation to 0 to 2PI
        const normalizedRotation = (currentRotation % (Math.PI * 2));
        const arcSize = (Math.PI * 2) / names.length;
        
        // The pointer is at 1.5 * PI (Top center)
        // We need to find which segment is at that position
        // Index calculation: (PointerPosition - currentRotation) / arcSize
        let winnerIndex = Math.floor(((Math.PI * 1.5) - normalizedRotation) / arcSize) % names.length;
        
        if (winnerIndex < 0) winnerIndex += names.length;
        
        const winner = names[winnerIndex];

        // Record the result history immediately
        try { addResult(winner); } catch (e) {}

        if (popupToggle.checked) {
            // If popup is enabled, show it and let the user Close or Remove
            lastWinnerIndex = winnerIndex;
            showWinner(winner);
        } else {
            // No popup: remove automatically
            setTimeout(() => {
                removeName(winnerIndex);
            }, 200);
        }
    }

    function removeName(index) {
        names.splice(index, 1);
        nameInput.value = names.join('\n');
        updateNames();
        
        if (names.length === 0) {
            statusMsg.innerText = "All names have been selected!";
            spinBtn.disabled = true;
        }
    }

   function showWinner(name) {
    // Mainkan suara jika ada
    if (typeof winSound !== 'undefined') {
        winSound.currentTime = 0;
        winSound.play().catch(() => {});
    }

    winnerDisplay.innerText = name;
    modalOverlay.style.display = 'flex';
    
    // Mulai animasi confetti
    startCelebration();

    setTimeout(() => {
        modalOverlay.style.opacity = '1';
        modal.classList.add('show');
    }, 10);
}

    function hideWinner() {
    modalOverlay.style.opacity = '0';
    modal.classList.remove('show');
    
    // Matikan animasi confetti
    stopCelebration();

    setTimeout(() => {
        modalOverlay.style.display = 'none';
    }, 300);
}

    // --- Spin sound helpers ---
    function startSpinSound() {
        if (spinAudio && spinAudio.src && spinAudio.src.length) {
            spinAudio.loop = !!soundLoop.checked;
            spinAudio.currentTime = 0;
            spinAudio.volume = parseFloat(soundVolume.value) || 0.8;
            spinAudio.play().catch(() => {});
            return;
        }

        // WebAudio fallback (simple whoosh)
        try {
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
            spinOsc = audioContext.createOscillator();
            spinGain = audioContext.createGain();
            spinOsc.type = 'sawtooth';
            spinOsc.frequency.value = 80;
            spinGain.gain.value = parseFloat(soundVolume.value) ? (parseFloat(soundVolume.value) * 0.08) : 0.06;
            spinOsc.connect(spinGain); spinGain.connect(audioContext.destination);
            spinOsc.start();
        } catch (err) {
            console.warn('WebAudio start failed', err);
        }
    }

    function updateSpinSound(easeFactor) {
        // easeFactor ranges 0..1, we use it to modulate playbackRate/frequency
        if (spinAudio && spinAudio.src && spinAudio.src.length) {
            const rate = 0.5 + (1.5 * easeFactor);
            try { spinAudio.playbackRate = Math.max(0.3, rate); } catch (e) {}
        } else if (spinOsc) {
            try {
                spinOsc.frequency.setValueAtTime(80 + (easeFactor * 600), audioContext.currentTime);
                spinGain.gain.setValueAtTime((parseFloat(soundVolume.value) || 0.8) * 0.06 * (0.5 + easeFactor), audioContext.currentTime);
            } catch (e) {}
        }
    }

    function stopSpinSound() {
        if (spinAudio && spinAudio.src && spinAudio.src.length) {
            try { spinAudio.pause(); spinAudio.currentTime = 0; } catch (e) {}
        }
        if (spinOsc) {
            try { spinOsc.stop(); } catch (e) {}
            try { spinOsc.disconnect(); spinGain.disconnect(); audioContext.close(); } catch (e) {}
            spinOsc = null; spinGain = null; audioContext = null;
        }
    }

    // --- Confetti helpers ---
    let _confettiContainer = null;
    let _confettiTimeout = null;

    function startConfetti(amount = 80) {
        stopConfetti(); // ensure none are already running
        _confettiContainer = document.createElement('div');
        _confettiContainer.className = 'confetti-container';
        // Append to modal overlay so confetti shows over the dark overlay background but behind the modal
        try {
            (modalOverlay || document.body).appendChild(_confettiContainer);
            // Ensure container is positioned relative to overlay
            _confettiContainer.style.position = 'absolute';
            _confettiContainer.style.top = '0';
            _confettiContainer.style.left = '0';
            _confettiContainer.style.width = '100%';
            _confettiContainer.style.height = '100%';
        } catch (e) {
            document.body.appendChild(_confettiContainer);
        }

        const colors = ['#e74c3c','#f39c12','#f6e05e','#2ecc71','#3498db','#9b59b6','#ff6b6b','#ffd166','#60a5fa'];
        const vw = Math.max(document.documentElement.clientWidth || 0, window.innerWidth || 0);

        // Create a dense curtain across the top (gate-like)
        const rows = 2; // two layers to give depth
        for (let r = 0; r < rows; r++) {
            for (let i = 0; i < amount / rows; i++) {
                const conf = document.createElement('div');
                conf.className = 'confetti';

                // Shape: mostly rectangles/squares
                const shapeRoll = Math.random();
                if (shapeRoll < 0.1) { conf.classList.add('circle'); }
                else if (shapeRoll < 0.16) { conf.classList.add('emoji'); conf.innerText = ['🎊','🎉','✨'][Math.floor(Math.random()*3)]; conf.style.fontSize = (12 + Math.random()*10) + 'px'; conf.style.lineHeight = '1'; }
                else { conf.classList.add('square'); }

                // Position spread across width
                const left = Math.random() * vw;
                conf.style.left = (left | 0) + 'px';

                // Slight vertical stagger so it forms a dense top curtain
                const topOffset = -8 - (Math.random() * 6) - (r * 6);
                conf.style.top = topOffset + 'vh';

                // Sizes
                const sizeType = Math.random();
                if (sizeType < 0.45) { conf.classList.add('small'); }
                else if (sizeType < 0.85) { conf.classList.add('medium'); }
                else { conf.classList.add('large'); }

                // Color
                const col = colors[Math.floor(Math.random() * colors.length)];
                if (!conf.innerText) conf.style.background = col;

                // Animation timing - vertical fall with slight x sway and varied durations
                const delay = Math.random() * 0.2;
                const duration = 2.5 + Math.random() * 2.5; // 2.5..5s
                const swayDur = 0.9 + Math.random() * 1.4;
                conf.style.animation = `confetti-fall-vertical ${duration}s cubic-bezier(.2,.7,.2,1) ${delay}s forwards, confetti-sway ${swayDur}s ease-in-out ${delay}s infinite`;

                // Random rotation and transform
                conf.style.transform = `rotate(${Math.floor(Math.random()*360)}deg)`;

                _confettiContainer.appendChild(conf);
            }
        }

        // Auto-stop after 4.2s by default (within 3-5s as requested)
        _confettiTimeout = setTimeout(() => stopConfetti(), 4200);
    }

    function stopConfetti() {
        try {
            if (_confettiTimeout) { clearTimeout(_confettiTimeout); _confettiTimeout = null; }
            if (_confettiContainer) { _confettiContainer.remove(); _confettiContainer = null; }
        } catch (e) {}
    }

    // --- Results / history helpers ---
    function loadResults() {
        try {
            const raw = localStorage.getItem('winnerResults');
            results = raw ? JSON.parse(raw) : [];
        } catch (e) { results = []; }
        renderResults();
    }

    function saveResults() {
        try { localStorage.setItem('winnerResults', JSON.stringify(results)); } catch (e) {}
    }

    function renderResults() {
        if (!resultsListEl) return;
        resultsListEl.innerHTML = '';
        results.forEach((r, idx) => {
            const item = document.createElement('div');
            item.className = 'result-item';

            const left = document.createElement('div');
            left.innerHTML = `<div class="name">${escapeHtml(r.name)}</div><div class="time">${escapeHtml(r.time)}</div>`;

            const right = document.createElement('div');
            const btn = document.createElement('button');
            btn.className = 'result-remove';
            btn.innerText = '×';
            btn.title = 'Remove from history';
            btn.addEventListener('click', () => {
                results.splice(idx, 1); saveResults(); renderResults();
            });
            right.appendChild(btn);

            item.appendChild(left); item.appendChild(right);
            resultsListEl.appendChild(item);
        });
        if (resultsCountEl) resultsCountEl.innerText = results.length;
    }

    function addResult(name) {
        const now = new Date();
        const time = now.toLocaleString();
        results.unshift({ name, time }); // newest first
        saveResults(); renderResults();
    }

    function escapeHtml(s) { return (''+s).replace(/[&<>\"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c])); }

    function resetWheel() {
        // Restore the original list and UI state
        nameInput.value = initialList || "";
        currentRotation = 0;
        isSpinning = false;
        nameInput.disabled = false;
        hideWinner(); // ensure modal is closed
        stopSpinSound(); // stop spin audio if playing
        try { if (popupAudio) { popupAudio.pause(); popupAudio.currentTime = 0; } } catch (e) {}
        try { stopConfetti(); } catch (e) {}
        updateNames();
        drawWheel();
        spinBtn.disabled = names.length === 0;
        statusMsg.innerText = names.length === 0 ? "Add some names to spin!" : "";
    }

    // --- CONFETTI SYSTEM ---
const confCanvas = document.getElementById('confetti-canvas');
const confCtx = confCanvas.getContext('2d');
let confettiActive = false;
let particles = [];

function resizeConfetti() {
    confCanvas.width = window.innerWidth;
    confCanvas.height = window.innerHeight;
}
window.addEventListener('resize', resizeConfetti);
resizeConfetti();

class ConfettiParticle {
    constructor() {
        this.colors = ['#FF5733', '#33FF57', '#3357FF', '#F333FF', '#FFC300', '#33FFF6'];
        this.reset();
    }

    reset() {
        this.x = Math.random() * confCanvas.width;
        this.y = Math.random() * confCanvas.height - confCanvas.height; // Start above screen
        this.size = Math.random() * 8 + 4;
        this.speedY = Math.random() * 3 + 2;
        this.speedX = (Math.random() - 0.5) * 2;
        this.rotation = Math.random() * 360;
        this.rotSpeed = Math.random() * 10 - 5;
        this.color = this.colors[Math.floor(Math.random() * this.colors.length)];
    }

    update() {
        this.y += this.speedY;
        this.x += this.speedX;
        this.rotation += this.rotSpeed;
        if (this.y > confCanvas.height) this.reset();
    }

    draw() {
        confCtx.save();
        confCtx.translate(this.x, this.y);
        confCtx.rotate(this.rotation * Math.PI / 180);
        confCtx.fillStyle = this.color;
        confCtx.fillRect(-this.size/2, -this.size/2, this.size, this.size);
        confCtx.restore();
    }
}

function initConfetti() {
    particles = [];
    for (let i = 0; i < 150; i++) {
        particles.push(new ConfettiParticle());
    }
}

function animateConfetti() {
    if (!confettiActive) return;
    confCtx.clearRect(0, 0, confCanvas.width, confCanvas.height);
    particles.forEach(p => {
        p.update();
        p.draw();
    });
    requestAnimationFrame(animateConfetti);
}

function startCelebration() {
    confettiActive = true;
    initConfetti();
    animateConfetti();
}

function stopCelebration() {
    confettiActive = false;
    confCtx.clearRect(0, 0, confCanvas.width, confCanvas.height);
}
    // Initialize the app
    init();
