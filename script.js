/* ═══════════════════════════════════════════════════════
   APEX REAL ESTATE — Scroll-Based Image Sequence Engine
   ═══════════════════════════════════════════════════════ */

(function () {
    'use strict';

    // ─── Configuration ───
    const CONFIG = {
        totalFrames: 240,
        imagePath: 'pics/ezgif-frame-',
        imageExt: '.jpg',
        batchSize: 15,     // Images loaded per batch
        phases: [
            { id: 'phase1', start: 0.00, end: 0.15 },   // Logo: frames 1–36
            { id: 'phase2', start: 0.15, end: 0.33 },   // Headline: frames 36–80
            { id: 'phase3', start: 0.33, end: 0.50 },   // Services: frames 80–120
            { id: 'phase4', start: 0.50, end: 0.75 },   // Premium: frames 120–180
            { id: 'phase5', start: 0.75, end: 1.00 },   // Final: frames 180–240
        ],
        fadeMargin: 0.05  // Transition overlap
    };

    // ─── State ───
    const state = {
        images: new Array(CONFIG.totalFrames),
        loadedCount: 0,
        currentFrame: 0,
        canvas: null,
        ctx: null,
        scrollContainer: null,
        isReady: false,
        rafId: null
    };

    // ─── DOM Elements ───
    const $ = (sel) => document.querySelector(sel);
    const $$ = (sel) => document.querySelectorAll(sel);

    // ─── Initialize ───
    function init() {
        state.canvas = $('#scrollCanvas');
        state.ctx = state.canvas.getContext('2d');
        state.scrollContainer = $('.scroll-container');

        resizeCanvas();
        loadImages();
        setupEventListeners();
        setupNavigation();
        setupScrollAnimations();
        setupContactForm();
        setupAISearch();
    }

    // ─── Canvas Sizing ───
    function resizeCanvas() {
        const dpr = window.devicePixelRatio || 1;
        const w = window.innerWidth;
        const h = window.innerHeight;

        state.canvas.width = w * dpr;
        state.canvas.height = h * dpr;
        state.canvas.style.width = w + 'px';
        state.canvas.style.height = h + 'px';
        state.ctx.scale(dpr, dpr);

        // Re-draw current frame
        if (state.images[state.currentFrame]) {
            drawFrame(state.currentFrame);
        }
    }

    // ─── Image Loading ───
    function loadImages() {
        const preloader = $('#preloader');
        const progressBar = $('#preloaderProgress');
        const progressText = $('#preloaderText');

        // Priority loading: first, middle, and last frames first for instant feedback
        const priorityFrames = [0, 1, 2, 3, 4, 60, 120, 180, 239];
        const remainingFrames = [];

        for (let i = 0; i < CONFIG.totalFrames; i++) {
            if (!priorityFrames.includes(i)) {
                remainingFrames.push(i);
            }
        }

        const allFrames = [...priorityFrames, ...remainingFrames];
        let loaded = 0;
        let nextToQueue = 0;  // Tracks which frame index in allFrames to queue next

        function onImageDone(frameIndex, img) {
            if (img) {
                state.images[frameIndex] = img;
            }
            loaded++;
            state.loadedCount = loaded;

            const pct = Math.min(100, Math.round((loaded / CONFIG.totalFrames) * 100));
            progressBar.style.width = pct + '%';
            progressText.textContent = `Učitavanje... ${pct}%`;

            // Draw first frame as soon as it's ready
            if (frameIndex === 0 && !state.isReady) {
                drawFrame(0);
            }

            // Hide preloader when enough frames loaded (70%)
            if (loaded >= CONFIG.totalFrames * 0.7 && !state.isReady) {
                state.isReady = true;
                setTimeout(() => {
                    preloader.classList.add('hidden');
                    document.body.style.overflow = '';
                }, 400);
                startScrollListener();
            }

            // Queue the next image from the pool
            loadNextFromQueue();
        }

        function loadNextFromQueue() {
            if (nextToQueue >= allFrames.length) return;

            const idx = nextToQueue;
            nextToQueue++;

            const frameIndex = allFrames[idx];
            const img = new Image();
            const num = String(frameIndex + 1).padStart(3, '0');
            img.src = `${CONFIG.imagePath}${num}${CONFIG.imageExt}`;

            img.onload = () => onImageDone(frameIndex, img);
            img.onerror = () => onImageDone(frameIndex, null);
        }

        // Prevent scroll during loading
        document.body.style.overflow = 'hidden';

        // Start concurrent loading pool (batchSize simultaneous downloads)
        const concurrency = Math.min(CONFIG.batchSize, allFrames.length);
        for (let i = 0; i < concurrency; i++) {
            loadNextFromQueue();
        }
    }

    // ─── Draw Frame ───
    function drawFrame(frameIndex) {
        const img = state.images[frameIndex];
        if (!img) return;

        const canvas = state.canvas;
        const ctx = state.ctx;
        const dpr = window.devicePixelRatio || 1;
        const cw = canvas.width / dpr;
        const ch = canvas.height / dpr;

        ctx.clearRect(0, 0, cw, ch);

        // Cover fit (like background-size: cover)
        const imgRatio = img.naturalWidth / img.naturalHeight;
        const canvasRatio = cw / ch;

        let drawW, drawH, dx, dy;

        if (canvasRatio > imgRatio) {
            drawW = cw;
            drawH = cw / imgRatio;
            dx = 0;
            dy = (ch - drawH) / 2;
        } else {
            drawH = ch;
            drawW = ch * imgRatio;
            dx = (cw - drawW) / 2;
            dy = 0;
        }

        ctx.drawImage(img, dx, dy, drawW, drawH);
    }

    // ─── Scroll Listener ───
    function startScrollListener() {
        const heroSection = $('#hero');

        function onScroll() {
            const rect = state.scrollContainer.getBoundingClientRect();
            const scrollHeight = state.scrollContainer.offsetHeight - window.innerHeight;
            const scrollTop = -rect.top;

            // Calculate scroll progress (0 to 1)
            let progress = Math.max(0, Math.min(1, scrollTop / scrollHeight));

            // Map progress to frame
            const frameIndex = Math.min(
                CONFIG.totalFrames - 1,
                Math.floor(progress * CONFIG.totalFrames)
            );

            if (frameIndex !== state.currentFrame) {
                state.currentFrame = frameIndex;
                drawFrame(frameIndex);
            }

            // Update text overlays
            updateOverlays(progress);

            // Update scroll indicator
            const scrollIndicator = $('#scrollIndicator');
            if (progress > 0.05) {
                scrollIndicator.classList.add('hidden');
            } else {
                scrollIndicator.classList.remove('hidden');
            }

            // Update nav style
            const nav = $('#mainNav');
            if (progress > 0.95 || scrollTop > scrollHeight) {
                nav.classList.add('scrolled');
            } else {
                nav.classList.remove('scrolled');
            }
        }

        // Use requestAnimationFrame for smooth updates
        let ticking = false;
        window.addEventListener('scroll', () => {
            if (!ticking) {
                requestAnimationFrame(() => {
                    onScroll();
                    ticking = false;
                });
                ticking = true;
            }
        }, { passive: true });

        // Initial call
        onScroll();
    }

    // ─── Update Text Overlays ───
    function updateOverlays(progress) {
        CONFIG.phases.forEach(phase => {
            const el = document.getElementById(phase.id);
            if (!el) return;

            const fadeIn = phase.start;
            const fadeOut = phase.end;
            const margin = CONFIG.fadeMargin;

            // Calculate opacity with smooth transitions
            let opacity = 0;

            if (progress >= fadeIn && progress <= fadeOut) {
                // Fade in
                if (progress < fadeIn + margin) {
                    opacity = (progress - fadeIn) / margin;
                }
                // Full visibility
                else if (progress > fadeOut - margin) {
                    opacity = (fadeOut - progress) / margin;
                }
                // In range
                else {
                    opacity = 1;
                }
            }

            opacity = Math.max(0, Math.min(1, opacity));

            if (opacity > 0.01) {
                el.classList.add('visible');
                el.style.opacity = opacity;

                // Parallax-like movement
                const phaseProgress = (progress - fadeIn) / (fadeOut - fadeIn);
                const translateY = (1 - opacity) * 20;
                el.style.transform = `translateY(${translateY}px)`;
            } else {
                el.classList.remove('visible');
                el.style.opacity = 0;
            }
        });
    }

    // ─── Event Listeners ───
    function setupEventListeners() {
        window.addEventListener('resize', debounce(resizeCanvas, 200));
    }

    // ─── Navigation ───
    function setupNavigation() {
        const hamburger = $('#navHamburger');
        const mobileMenu = $('#mobileMenu');
        const mobileLinks = $$('.mobile-link');

        if (hamburger) {
            hamburger.addEventListener('click', () => {
                hamburger.classList.toggle('active');
                mobileMenu.classList.toggle('active');
            });

            mobileLinks.forEach(link => {
                link.addEventListener('click', () => {
                    hamburger.classList.remove('active');
                    mobileMenu.classList.remove('active');
                });
            });
        }

        // Smooth scroll for anchor links
        $$('a[href^="#"]').forEach(anchor => {
            anchor.addEventListener('click', function (e) {
                const target = document.querySelector(this.getAttribute('href'));
                if (target) {
                    e.preventDefault();
                    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
            });
        });

        // CTA button scrolls to contact
        const navCta = $('#navCta');
        if (navCta) {
            navCta.addEventListener('click', () => {
                const contact = $('#contact');
                if (contact) contact.scrollIntoView({ behavior: 'smooth' });
            });
        }
    }

    // ─── Scroll Reveal Animations ───
    function setupScrollAnimations() {
        // Add reveal class to animatable elements
        const animatableSelectors = [
            '.section-tag', '.section-title', '.about-lead',
            '.about-text p', '.value-card', '.service-card',
            '.stat-item', '.big-quote', '.contact-item',
            '.contact-form', '.footer-brand', '.footer-links-group'
        ];

        animatableSelectors.forEach(selector => {
            $$(selector).forEach((el, i) => {
                el.classList.add('reveal');
                el.style.transitionDelay = `${i * 0.08}s`;
            });
        });

        // IntersectionObserver for reveal
        const observer = new IntersectionObserver(
            (entries) => {
                entries.forEach(entry => {
                    if (entry.isIntersecting) {
                        entry.target.classList.add('visible');

                        // Animate stat numbers
                        if (entry.target.classList.contains('stat-item')) {
                            animateStatNumber(entry.target);
                        }
                    }
                });
            },
            { threshold: 0.1, rootMargin: '0px 0px -50px 0px' }
        );

        $$('.reveal').forEach(el => observer.observe(el));
    }

    // ─── Stat Number Animation ───
    function animateStatNumber(statItem) {
        const numEl = statItem.querySelector('.stat-number');
        if (!numEl || numEl.dataset.animated) return;
        numEl.dataset.animated = 'true';

        const target = parseInt(numEl.dataset.target, 10);
        const duration = 2000;
        const startTime = performance.now();

        function update(currentTime) {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);

            // Ease out quad
            const eased = 1 - (1 - progress) * (1 - progress);
            const current = Math.round(eased * target);

            numEl.textContent = current;

            if (progress < 1) {
                requestAnimationFrame(update);
            }
        }

        requestAnimationFrame(update);
    }

    // ─── Contact Form ───
    function setupContactForm() {
        const form = $('#contactForm');
        if (!form) return;

        form.addEventListener('submit', (e) => {
            e.preventDefault();

            const btn = form.querySelector('.form-submit');
            const originalText = btn.querySelector('span').textContent;

            btn.querySelector('span').textContent = 'Hvala vam!';
            btn.style.background = '#4CAF50';
            btn.disabled = true;

            setTimeout(() => {
                btn.querySelector('span').textContent = originalText;
                btn.style.background = '';
                btn.disabled = false;
                form.reset();
            }, 3000);
        });
    }

    // ─── Utilities ───
    function debounce(fn, delay) {
        let timer;
        return function (...args) {
            clearTimeout(timer);
            timer = setTimeout(() => fn.apply(this, args), delay);
        };
    }

    // ═══════════════════════════════════════════════════════
    // AI PROPERTY SEARCH ENGINE
    // ═══════════════════════════════════════════════════════

    const PROPERTIES = [
        { id: 1, name: 'Luksuzni trosoban na keju', type: 'stan', rooms: 3, size: 95, price: 145000, priceType: 'prodaja', location: 'Kej', neighborhood: 'Centar', floor: 5, totalFloors: 6, construction: 'novogradnja', features: ['terasa', 'parking', 'lift', 'klima', 'centralno grejanje', 'pogled na Dunav'], description: 'Elegantan trosoban stan sa panoramskim pogledom na Dunav i Petrovaradinsku tvrđavu.', emoji: '🏙️' },
        { id: 2, name: 'Dvosoban stan Grbavica', type: 'stan', rooms: 2, size: 58, price: 78000, priceType: 'prodaja', location: 'Grbavica', neighborhood: 'Grbavica', floor: 3, totalFloors: 5, construction: 'novogradnja', features: ['parking', 'lift', 'klima', 'terasa'], description: 'Moderan dvosoban stan u novogradnji na Grbavici, blizina centra.', emoji: '🏗️' },
        { id: 3, name: 'Renoviran stan u centru', type: 'stan', rooms: 2, size: 65, price: 95000, priceType: 'prodaja', location: 'Bulevar Oslobođenja', neighborhood: 'Centar', floor: 2, totalFloors: 4, construction: 'starogradnja', features: ['klima', 'centralno grejanje', 'renoviran'], description: 'Potpuno renoviran dvosoban stan na Bulevaru, visoki plafoni i autentičan šarm.', emoji: '🏛️' },
        { id: 4, name: 'Garsonjera Liman IV', type: 'stan', rooms: 1, size: 32, price: 48000, priceType: 'prodaja', location: 'Liman IV', neighborhood: 'Liman', floor: 7, totalFloors: 10, construction: 'novogradnja', features: ['lift', 'klima', 'terasa'], description: 'Kompaktna garsonjera idealna za mlade profesionalce ili investiciju.', emoji: '🏠' },
        { id: 5, name: 'Penthouse Novi Bulevar', type: 'stan', rooms: 4, size: 156, price: 285000, priceType: 'prodaja', location: 'Novi Bulevar', neighborhood: 'Centar', floor: 8, totalFloors: 8, construction: 'novogradnja', features: ['terasa', 'parking', 'lift', 'klima', 'jacuzzi', 'pogled na Dunav', 'smart home'], description: 'Ekskluzivan penthouse sa 360° pogledom, smart home sistemom i privatnom terasom.', emoji: '✨' },
        { id: 6, name: 'Trosoban Novo Naselje', type: 'stan', rooms: 3, size: 72, price: 68000, priceType: 'prodaja', location: 'Novo Naselje', neighborhood: 'Novo Naselje', floor: 4, totalFloors: 10, construction: 'starogradnja', features: ['lift', 'centralno grejanje', 'balkon'], description: 'Prostran trosoban stan na Novom Naselju sa dobro raspoređenim prostorom.', emoji: '🏢' },
        { id: 7, name: 'Kuća sa baštom Sremska Kamenica', type: 'kuća', rooms: 5, size: 220, price: 195000, priceType: 'prodaja', location: 'Sremska Kamenica', neighborhood: 'Sremska Kamenica', floor: 0, totalFloors: 2, construction: 'novogradnja', features: ['bašta', 'garaža', 'parking', 'klima', 'centralno grejanje'], description: 'Nova porodična kuća sa velikom baštom i garažom u mirnom delu Kamenice.', emoji: '🏡' },
        { id: 8, name: 'Dvosoban Podbara', type: 'stan', rooms: 2, size: 54, price: 350, priceType: 'renta', location: 'Podbara', neighborhood: 'Podbara', floor: 1, totalFloors: 3, construction: 'starogradnja', features: ['klima', 'renoviran', 'namešteno'], description: 'Potpuno opremljen dvosoban stan za izdavanje u mirnom delu Podbare.', emoji: '🔑' },
        { id: 9, name: 'Studio apartman Centar', type: 'stan', rooms: 1, size: 38, price: 300, priceType: 'renta', location: 'Zmaj Jovina', neighborhood: 'Centar', floor: 2, totalFloors: 3, construction: 'starogradnja', features: ['klima', 'renoviran', 'namešteno', 'wi-fi'], description: 'Šarmantan studio u srcu pešačke zone, idealan za zakup.', emoji: '🏨' },
        { id: 10, name: 'Četvorosoban Liman III', type: 'stan', rooms: 4, size: 110, price: 125000, priceType: 'prodaja', location: 'Liman III', neighborhood: 'Liman', floor: 5, totalFloors: 10, construction: 'starogradnja', features: ['lift', 'centralno grejanje', 'terasa', 'parking'], description: 'Prostran četvorosoban stan na Limanu III, odlična lokacija blizu škola.', emoji: '🏠' },
        { id: 11, name: 'Lux stan Telep', type: 'stan', rooms: 3, size: 88, price: 112000, priceType: 'prodaja', location: 'Telep', neighborhood: 'Telep', floor: 2, totalFloors: 4, construction: 'novogradnja', features: ['parking', 'lift', 'klima', 'terasa', 'centralno grejanje'], description: 'Premium trosoban stan u ekskluzivnom kompleksu na Telepu.', emoji: '🏗️' },
        { id: 12, name: 'Kuća Petrovaradin', type: 'kuća', rooms: 4, size: 180, price: 165000, priceType: 'prodaja', location: 'Petrovaradin', neighborhood: 'Petrovaradin', floor: 0, totalFloors: 2, construction: 'starogradnja', features: ['bašta', 'garaža', 'podrumski prostor', 'renoviran'], description: 'Renovirana kuća u starom jezgru Petrovaradina sa pogledom na tvrđavu.', emoji: '🏰' },
        { id: 13, name: 'Jednosoban Detelinara', type: 'stan', rooms: 1, size: 40, price: 52000, priceType: 'prodaja', location: 'Detelinara', neighborhood: 'Detelinara', floor: 3, totalFloors: 5, construction: 'novogradnja', features: ['lift', 'klima', 'parking', 'terasa'], description: 'Nov jednosoban stan na Detelinari, savršen za prvi stan ili investiciju.', emoji: '🏗️' },
        { id: 14, name: 'Trosoban za rentu Liman II', type: 'stan', rooms: 3, size: 78, price: 500, priceType: 'renta', location: 'Liman II', neighborhood: 'Liman', floor: 6, totalFloors: 10, construction: 'starogradnja', features: ['lift', 'klima', 'namešteno', 'centralno grejanje', 'balkon'], description: 'Namešteno trosoban stan na Limanu za dugoročni zakup.', emoji: '🔑' },
        { id: 15, name: 'Duplex Grbavica', type: 'stan', rooms: 3, size: 105, price: 135000, priceType: 'prodaja', location: 'Grbavica', neighborhood: 'Grbavica', floor: 4, totalFloors: 5, construction: 'novogradnja', features: ['duplex', 'terasa', 'parking', 'lift', 'klima', 'smart home'], description: 'Moderan duplex na Grbavici sa pametnim kućnim sistemom.', emoji: '🏙️' },
        { id: 16, name: 'Garsonjera za rentu Centar', type: 'stan', rooms: 1, size: 28, price: 250, priceType: 'renta', location: 'Jevrejska ulica', neighborhood: 'Centar', floor: 1, totalFloors: 3, construction: 'starogradnja', features: ['namešteno', 'klima', 'wi-fi', 'renoviran'], description: 'Udobna garsonjera u užem centru, potpuno opremljena.', emoji: '🔑' },
        { id: 17, name: 'Vila Sremski Karlovci', type: 'kuća', rooms: 6, size: 320, price: 420000, priceType: 'prodaja', location: 'Sremski Karlovci', neighborhood: 'Sremski Karlovci', floor: 0, totalFloors: 3, construction: 'novogradnja', features: ['bazen', 'bašta', 'garaža', 'parking', 'smart home', 'klima', 'pogled'], description: 'Luksuzna vila sa bazenom i vinogradom u Sremskim Karlovcima.', emoji: '🏡' },
        { id: 18, name: 'Dvosoban Novo Naselje', type: 'stan', rooms: 2, size: 52, price: 55000, priceType: 'prodaja', location: 'Novo Naselje', neighborhood: 'Novo Naselje', floor: 8, totalFloors: 10, construction: 'starogradnja', features: ['lift', 'centralno grejanje', 'balkon'], description: 'Ekonomičan dvosoban stan na Novom Naselju, odličan za mlade parove.', emoji: '🏠' }
    ];

    // ─── AI Panel Setup ───
    function setupAISearch() {
        const fab = $('#aiFab');
        const panel = $('#aiPanel');
        const overlay = $('#aiOverlay');
        const closeBtn = $('#aiClose');
        const form = $('#aiForm');
        const input = $('#aiInput');
        const chatArea = $('#aiChatArea');
        const suggestions = $('#aiSuggestions');

        if (!fab || !panel) return;

        // Toggle panel
        function openPanel() {
            panel.classList.add('active');
            overlay.classList.add('active');
            fab.classList.add('hidden');
            input.focus();

            // Welcome message on first open
            if (chatArea.children.length === 0) {
                addAIMessage('Zdravo! 👋 Ja sam APEX AI asistent. Opišite mi kakav stan ili nekretninu tražite — lokacija, broj soba, budžet, želje — i ja ću vam pronaći najbolje opcije iz naše ponude.');
            }
        }

        function closePanel() {
            panel.classList.remove('active');
            overlay.classList.remove('active');
            fab.classList.remove('hidden');
        }

        fab.addEventListener('click', openPanel);
        closeBtn.addEventListener('click', closePanel);
        overlay.addEventListener('click', closePanel);

        // Suggestion buttons
        suggestions.addEventListener('click', (e) => {
            const btn = e.target.closest('.ai-suggestion');
            if (!btn) return;
            const query = btn.dataset.query;
            input.value = query;
            handleQuery(query);
        });

        // Form submit
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            const query = input.value.trim();
            if (!query) return;
            handleQuery(query);
        });

        function handleQuery(query) {
            // Hide suggestions after first query
            suggestions.classList.add('hidden');

            // Add user message
            addUserMessage(query);
            input.value = '';

            // Show typing indicator
            const typingEl = showTyping();

            // Simulate AI "thinking"
            const delay = 800 + Math.random() * 1000;
            setTimeout(() => {
                typingEl.remove();
                processQuery(query);
            }, delay);
        }
    }

    // ─── Message Helpers ───
    function addAIMessage(text) {
        const chatArea = $('#aiChatArea');
        const msg = document.createElement('div');
        msg.className = 'ai-msg';
        msg.innerHTML = `
            <div class="ai-msg-avatar">AI</div>
            <div class="ai-msg-bubble">${text}</div>
        `;
        chatArea.appendChild(msg);
        chatArea.scrollTop = chatArea.scrollHeight;
    }

    function addUserMessage(text) {
        const chatArea = $('#aiChatArea');
        const msg = document.createElement('div');
        msg.className = 'ai-msg user';
        msg.innerHTML = `
            <div class="ai-msg-avatar">Vi</div>
            <div class="ai-msg-bubble">${text}</div>
        `;
        chatArea.appendChild(msg);
        chatArea.scrollTop = chatArea.scrollHeight;
    }

    function showTyping() {
        const chatArea = $('#aiChatArea');
        const msg = document.createElement('div');
        msg.className = 'ai-msg';
        msg.innerHTML = `
            <div class="ai-msg-avatar">AI</div>
            <div class="ai-msg-bubble"><div class="ai-typing"><span></span><span></span><span></span></div></div>
        `;
        chatArea.appendChild(msg);
        chatArea.scrollTop = chatArea.scrollHeight;
        return msg;
    }

    // ─── Query Parser & Matcher ───
    function processQuery(query) {
        const q = query.toLowerCase();
        const parsed = parseQuery(q);
        const scored = PROPERTIES.map(p => ({
            property: p,
            score: scoreProperty(p, parsed)
        }))
        .filter(s => s.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 4);

        if (scored.length === 0) {
            addAIMessage('Nažalost, nisam pronašao nekretnine koje odgovaraju vašim kriterijumima. Pokušajte sa širim parametrima — npr. drugom lokacijom, većim budžetom, ili manje specifičnim zahtevima. 🔍');
            return;
        }

        // Build response text
        const matchWord = scored.length === 1 ? 'nekretninu' : (scored.length < 5 ? 'nekretnine' : 'nekretnina');
        let responseText = `Pronašao sam <strong>${scored.length}</strong> ${matchWord} koje odgovaraju vašim kriterijumima:`;

        if (parsed.priceType === 'renta') {
            responseText += ' <em>(izdavanje)</em>';
        }

        addAIMessage(responseText);

        // Add property cards with staggered animation
        const chatArea = $('#aiChatArea');
        scored.forEach((s, i) => {
            setTimeout(() => {
                const card = buildPropertyCard(s.property, s.score, scored[0].score);
                chatArea.appendChild(card);
                chatArea.scrollTop = chatArea.scrollHeight;
            }, i * 200);
        });

        // Follow-up message
        setTimeout(() => {
            addAIMessage('Želite li detaljnije informacije o nekoj od ovih nekretnina? Ili da pretražim po drugačijim kriterijumima? 😊');
        }, scored.length * 200 + 500);
    }

    function parseQuery(q) {
        const parsed = {
            type: null,
            rooms: null,
            minPrice: null,
            maxPrice: null,
            priceType: null,
            neighborhoods: [],
            features: [],
            construction: null,
            keywords: []
        };

        // Type detection
        if (/ku[cć]a|vila/i.test(q)) parsed.type = 'kuća';
        else if (/stan|apartman|garsonjer/i.test(q)) parsed.type = 'stan';
        if (/penthouse|penthaus/i.test(q)) { parsed.type = 'stan'; parsed.features.push('penthouse'); parsed.keywords.push('penthouse'); }

        // Rooms detection
        const roomWords = { 'garsonjer': 1, 'jednosoban': 1, 'dvosoban': 2, 'trosoban': 3, 'trosob': 3, 'četvorosoban': 4, 'cetvorosoban': 4, 'petosoban': 5 };
        for (const [word, count] of Object.entries(roomWords)) {
            if (q.includes(word)) { parsed.rooms = count; break; }
        }
        const roomMatch = q.match(/(\d)\s*sob/);
        if (roomMatch) parsed.rooms = parseInt(roomMatch[1]);

        // Price detection
        const priceMatch = q.match(/(\d[\d\s.,]*)\s*(evr|eur|€|hilj)/i);
        if (priceMatch) {
            let price = parseFloat(priceMatch[1].replace(/[\s.,]/g, ''));
            if (price < 1000 && !q.includes('rent') && !q.includes('izdav') && !q.includes('zakup') && !q.includes('mesečn')) {
                price *= 1000; // Assume thousands for sale
            }
            if (/do|maks|max|ispod|jeftin/i.test(q)) parsed.maxPrice = price;
            else if (/od|min|iznad|preko/i.test(q)) parsed.minPrice = price;
            else parsed.maxPrice = price * 1.15; // Give some room
        }
        // Handle "do 80k" pattern
        const kMatch = q.match(/(\d+)\s*k\s*(€|evr|eur)/i);
        if (kMatch) parsed.maxPrice = parseInt(kMatch[1]) * 1000;

        // Transaction type
        if (/rent|izdav|zakup|mesečn|najam/i.test(q)) parsed.priceType = 'renta';
        else if (/kupi|prodaj|kupov/i.test(q)) parsed.priceType = 'prodaja';

        // Neighborhoods
        const neighborhoods = {
            'centar': 'Centar', 'centr': 'Centar',
            'grbavic': 'Grbavica', 'grbav': 'Grbavica',
            'liman': 'Liman',
            'novo naselje': 'Novo Naselje', 'novonaselje': 'Novo Naselje',
            'detelinara': 'Detelinara', 'detelin': 'Detelinara',
            'telep': 'Telep',
            'podbara': 'Podbara', 'podbar': 'Podbara',
            'petrovaradin': 'Petrovaradin', 'petrovarad': 'Petrovaradin',
            'kamenica': 'Sremska Kamenica', 'sremska': 'Sremska Kamenica',
            'karlovc': 'Sremski Karlovci',
            'kej': 'Centar'
        };
        for (const [key, val] of Object.entries(neighborhoods)) {
            if (q.includes(key)) parsed.neighborhoods.push(val);
        }

        // Features
        const featureMap = {
            'parking': 'parking', 'garaž': 'garaža', 'terasa': 'terasa', 'terras': 'terasa',
            'balkon': 'balkon', 'bašt': 'bašta', 'bast': 'bašta', 'klima': 'klima',
            'lift': 'lift', 'bazen': 'bazen', 'pogled': 'pogled', 'dunav': 'pogled na Dunav',
            'nameš': 'namešteno', 'oprem': 'namešteno', 'smart': 'smart home',
            'renovir': 'renoviran', 'jacuzzi': 'jacuzzi', 'jakuzi': 'jacuzzi'
        };
        for (const [key, val] of Object.entries(featureMap)) {
            if (q.includes(key)) parsed.features.push(val);
        }

        // Construction type
        if (/novogradnj/i.test(q)) parsed.construction = 'novogradnja';
        if (/starogradnj/i.test(q)) parsed.construction = 'starogradnja';

        // Size detection
        const sizeMatch = q.match(/(\d+)\s*(m2|m²|kvadrat|kvm)/i);
        if (sizeMatch) parsed.keywords.push({ type: 'size', value: parseInt(sizeMatch[1]) });

        // Budget keywords
        if (/jeftin|povolj|ekonom|budget/i.test(q)) parsed.keywords.push('budget');
        if (/luksuz|premium|ekskluziv|skup/i.test(q)) parsed.keywords.push('luxury');
        if (/investici/i.test(q)) parsed.keywords.push('investment');

        return parsed;
    }

    function scoreProperty(property, parsed) {
        let score = 0;
        let totalCriteria = 0;

        // Type match (important)
        if (parsed.type) {
            totalCriteria++;
            if (property.type === parsed.type) score += 30;
            else return 0; // Hard filter
        }

        // Rooms match
        if (parsed.rooms) {
            totalCriteria++;
            if (property.rooms === parsed.rooms) score += 25;
            else if (Math.abs(property.rooms - parsed.rooms) === 1) score += 10;
            else score -= 10;
        }

        // Price type match
        if (parsed.priceType) {
            totalCriteria++;
            if (property.priceType === parsed.priceType) score += 20;
            else return 0; // Hard filter
        }

        // Price range
        if (parsed.maxPrice) {
            totalCriteria++;
            if (property.price <= parsed.maxPrice) score += 20;
            else if (property.price <= parsed.maxPrice * 1.1) score += 8; // Slightly over budget
            else score -= 15;
        }
        if (parsed.minPrice) {
            totalCriteria++;
            if (property.price >= parsed.minPrice) score += 15;
            else score -= 10;
        }

        // Neighborhood match
        if (parsed.neighborhoods.length > 0) {
            totalCriteria++;
            if (parsed.neighborhoods.includes(property.neighborhood)) score += 25;
            else score -= 5;
        }

        // Construction
        if (parsed.construction) {
            totalCriteria++;
            if (property.construction === parsed.construction) score += 15;
            else score -= 5;
        }

        // Features match
        if (parsed.features.length > 0) {
            totalCriteria++;
            let featureScore = 0;
            const pFeatures = property.features.join(' ').toLowerCase();
            parsed.features.forEach(f => {
                if (pFeatures.includes(f.toLowerCase())) featureScore += 8;
            });
            score += featureScore;
        }

        // Keyword bonuses
        parsed.keywords.forEach(kw => {
            if (kw === 'budget' && property.price < 70000) score += 10;
            if (kw === 'luxury' && property.price > 150000) score += 15;
            if (kw === 'investment' && property.rooms <= 2) score += 10;
            if (kw === 'penthouse' && property.name.toLowerCase().includes('penthouse')) score += 25;
            if (typeof kw === 'object' && kw.type === 'size') {
                const diff = Math.abs(property.size - kw.value);
                if (diff <= 10) score += 15;
                else if (diff <= 25) score += 5;
            }
        });

        // If nothing matched at all, give a small base score
        if (totalCriteria === 0) score = 5;

        return score;
    }

    // ─── Build Property Card ───
    function buildPropertyCard(property, score, maxScore) {
        const matchPct = Math.min(99, Math.round((score / Math.max(maxScore, 1)) * 100));
        const badgeClass = property.construction === 'novogradnja' ? 'novogradnja' :
                          (property.price > 150000 ? 'premium' : 'starogradnja');

        const priceFormatted = property.priceType === 'renta'
            ? `${property.price}€ <small>/mesec</small>`
            : `${property.price.toLocaleString('de-DE')}€`;

        const specsHtml = [
            `${property.rooms} ${property.rooms === 1 ? 'soba' : (property.rooms < 5 ? 'sobe' : 'soba')}`,
            `${property.size} m²`,
            property.floor > 0 ? `${property.floor}/${property.totalFloors} sprat` : 'Prizemlje',
            ...property.features.slice(0, 2)
        ].map(s => `<span class="ai-property-spec">${s}</span>`).join('');

        const card = document.createElement('div');
        card.className = 'ai-property-card';
        card.innerHTML = `
            <div class="ai-property-img">
                <span class="ai-property-img-placeholder">${property.emoji}</span>
                <span class="ai-property-badge ${badgeClass}">${property.construction}</span>
                <span class="ai-property-match">${matchPct}% match</span>
            </div>
            <div class="ai-property-body">
                <div class="ai-property-name">${property.name}</div>
                <div class="ai-property-location">📍 ${property.location}, Novi Sad</div>
                <div class="ai-property-specs">${specsHtml}</div>
                <p style="font-size:0.8rem;color:var(--white-muted);line-height:1.5;margin-bottom:0.5rem">${property.description}</p>
                <div class="ai-property-footer">
                    <div class="ai-property-price">${priceFormatted}</div>
                    <button class="ai-property-cta" onclick="window.location.href='#contact'">Zakaži obilazak</button>
                </div>
            </div>
        `;
        return card;
    }

    // ─── Start ───
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
