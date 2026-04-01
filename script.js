/* ═══════════════════════════════════════════════════════
   APEX REAL ESTATE — Scroll-Based Image Sequence Engine
   ═══════════════════════════════════════════════════════ */

(function () {
    'use strict';

    // ─── Device Detection ───
    const isMobile = /Android|iPhone|iPad|iPod|webOS|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
        || window.innerWidth <= 768;
    const isLowEnd = navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4;

    // ─── Configuration ───
    // Check if mobile vertical frames exist (pics-mobile/ folder)
    const mobileFramesAvailable = false; // Set to true when vertical frames are added
    const CONFIG = {
        totalFrames: 240,
        // On mobile: every 3rd frame (80 frames), low-end: every 2nd (120), desktop: every frame (240)
        frameStep: isMobile ? 3 : (isLowEnd ? 2 : 1),
        imagePath: (isMobile && mobileFramesAvailable) ? 'pics-mobile/ezgif-frame-' : 'pics/ezgif-frame-',
        imageExt: '.jpg',
        batchSize: isMobile ? 6 : 15,
        phases: [
            { id: 'phase1', start: 0.00, end: 0.15 },
            { id: 'phase2', start: 0.15, end: 0.33 },
            { id: 'phase3', start: 0.33, end: 0.50 },
            { id: 'phase4', start: 0.50, end: 0.75 },
            { id: 'phase5', start: 0.75, end: 1.00 },
        ],
        fadeMargin: 0.05
    };

    // Calculate actual frames to load
    const framesToLoad = [];
    for (let i = 0; i < CONFIG.totalFrames; i += CONFIG.frameStep) {
        framesToLoad.push(i);
    }
    const actualFrameCount = framesToLoad.length;

    // ─── State ───
    const state = {
        images: {},  // Map of frameIndex -> image
        loadedCount: 0,
        currentFrame: -1,
        canvas: null,
        ctx: null,
        scrollContainer: null,
        isReady: false,
        rafId: null,
        lastOverlayState: {},  // Track overlay states to minimize DOM writes
        canvasWidth: 0,
        canvasHeight: 0,
        dpr: 1
    };

    // ─── DOM Elements (cached) ───
    const $ = (sel) => document.querySelector(sel);
    const $$ = (sel) => document.querySelectorAll(sel);

    // ─── Initialize ───
    function init() {
        state.canvas = $('#scrollCanvas');
        state.ctx = state.canvas.getContext('2d', { alpha: false }); // opaque context for perf
        state.scrollContainer = $('.scroll-container');
        state.dpr = Math.min(window.devicePixelRatio || 1, isMobile ? 1.5 : 3);

        resizeCanvas();
        loadImages();
        setupEventListeners();
        setupNavigation();
        setupScrollAnimations();
        setupContactForm();
        setupAISearch();
        setupPropertyGrid();
    }

    // ─── Canvas Sizing ───
    function resizeCanvas() {
        const dpr = state.dpr;
        // Use visualViewport for accurate mobile dimensions (handles address bar)
        const vv = window.visualViewport;
        const w = (vv && isMobile) ? vv.width : window.innerWidth;
        const h = (vv && isMobile) ? vv.height : window.innerHeight;

        // Only resize if dimensions actually changed
        if (state.canvasWidth === w && state.canvasHeight === h) return;

        state.canvasWidth = w;
        state.canvasHeight = h;

        state.canvas.width = w * dpr;
        state.canvas.height = h * dpr;
        state.canvas.style.width = w + 'px';
        state.canvas.style.height = h + 'px';

        // Reset transform and scale
        state.ctx.setTransform(1, 0, 0, 1, 0, 0);
        state.ctx.scale(dpr, dpr);

        // Re-draw current frame
        if (state.currentFrame >= 0 && state.images[state.currentFrame]) {
            drawFrame(state.currentFrame);
        }
    }

    // ─── Image Loading ───
    function loadImages() {
        const preloader = $('#preloader');
        const progressBar = $('#preloaderProgress');
        const progressText = $('#preloaderText');

        // Priority loading: key frames first for instant visual feedback
        const priorityIndices = [0, 1, 2, 3, 4];
        // Add key positions
        const keyPositions = [
            Math.floor(actualFrameCount * 0.25),
            Math.floor(actualFrameCount * 0.5),
            Math.floor(actualFrameCount * 0.75),
            actualFrameCount - 1
        ];
        keyPositions.forEach(pos => {
            if (!priorityIndices.includes(pos)) priorityIndices.push(pos);
        });

        const priorityFrames = priorityIndices.map(i => framesToLoad[Math.min(i, framesToLoad.length - 1)]);
        const remainingFrames = framesToLoad.filter(f => !priorityFrames.includes(f));
        const allFrames = [...priorityFrames, ...remainingFrames];

        let loaded = 0;
        let nextToQueue = 0;

        function onImageDone(frameIndex, img) {
            if (img) {
                state.images[frameIndex] = img;
            }
            loaded++;
            state.loadedCount = loaded;

            const pct = Math.min(100, Math.round((loaded / allFrames.length) * 100));
            progressBar.style.width = pct + '%';
            progressText.textContent = `Učitavanje... ${pct}%`;

            // Draw first frame immediately
            if (frameIndex === 0 && state.currentFrame < 0) {
                state.currentFrame = 0;
                drawFrame(0);
            }

            // Hide preloader when enough frames loaded (60% for mobile, 70% for desktop)
            const threshold = isMobile ? 0.4 : 0.7;
            if (loaded >= allFrames.length * threshold && !state.isReady) {
                state.isReady = true;
                setTimeout(() => {
                    preloader.classList.add('hidden');
                    document.body.style.overflow = '';
                }, 300);
                startScrollListener();
            }

            loadNextFromQueue();
        }

        function loadNextFromQueue() {
            if (nextToQueue >= allFrames.length) return;

            const idx = nextToQueue;
            nextToQueue++;

            const frameIndex = allFrames[idx];
            const img = new Image();
            const num = String(frameIndex + 1).padStart(3, '0');

            // Use smaller images on mobile if available, otherwise use standard
            img.src = `${CONFIG.imagePath}${num}${CONFIG.imageExt}`;

            // Decode asynchronously for smoother rendering
            img.onload = () => {
                if (img.decode) {
                    img.decode().then(() => onImageDone(frameIndex, img)).catch(() => onImageDone(frameIndex, img));
                } else {
                    onImageDone(frameIndex, img);
                }
            };
            img.onerror = () => onImageDone(frameIndex, null);
        }

        // Prevent scroll during loading
        document.body.style.overflow = 'hidden';

        // Start concurrent loading pool
        const concurrency = Math.min(CONFIG.batchSize, allFrames.length);
        for (let i = 0; i < concurrency; i++) {
            loadNextFromQueue();
        }
    }

    // ─── Find Nearest Loaded Frame ───
    function findNearestFrame(targetFrame) {
        // If we have this exact frame, use it
        if (state.images[targetFrame]) return targetFrame;

        // Find the nearest loaded frame
        let bestFrame = 0;
        let bestDist = Infinity;

        for (const key of Object.keys(state.images)) {
            const idx = parseInt(key);
            const dist = Math.abs(idx - targetFrame);
            if (dist < bestDist) {
                bestDist = dist;
                bestFrame = idx;
            }
        }
        return bestFrame;
    }

    // ─── Draw Frame ───
    function drawFrame(frameIndex) {
        // Find nearest loaded frame
        const actualFrame = findNearestFrame(frameIndex);
        const img = state.images[actualFrame];
        
        const ctx = state.ctx;
        const cw = state.canvasWidth;
        const ch = state.canvasHeight;

        // If no image found, fill with dark background instead of showing black
        if (!img) {
            ctx.fillStyle = '#0A0A0A';
            ctx.fillRect(0, 0, cw, ch);
            return;
        }

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
        state.lastDrawnFrame = actualFrame;
    }

    // ─── Scroll Listener (Optimized) ───
    function startScrollListener() {
        let ticking = false;
        let lastScrollY = -1;

        function onScroll() {
            const scrollY = window.scrollY || window.pageYOffset;

            // Skip if scroll position hasn't changed enough (> 1px)
            if (Math.abs(scrollY - lastScrollY) < 1) {
                ticking = false;
                return;
            }
            lastScrollY = scrollY;

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

            // Update text overlays (batched)
            updateOverlays(progress);

            // Update scroll indicator
            const scrollIndicator = $('#scrollIndicator');
            if (scrollIndicator) {
                const shouldHide = progress > 0.05;
                if (shouldHide && !scrollIndicator.classList.contains('hidden')) {
                    scrollIndicator.classList.add('hidden');
                } else if (!shouldHide && scrollIndicator.classList.contains('hidden')) {
                    scrollIndicator.classList.remove('hidden');
                }
            }

            // Update nav style
            const nav = $('#mainNav');
            const shouldScroll = progress > 0.95 || scrollTop > scrollHeight;
            if (shouldScroll && !nav.classList.contains('scrolled')) {
                nav.classList.add('scrolled');
            } else if (!shouldScroll && nav.classList.contains('scrolled')) {
                nav.classList.remove('scrolled');
            }

            ticking = false;
        }

        // Use passive scroll listener with rAF for buttery-smooth updates
        window.addEventListener('scroll', () => {
            if (!ticking) {
                requestAnimationFrame(onScroll);
                ticking = true;
            }
        }, { passive: true });

        // Handle touch events better on mobile
        if (isMobile) {
            // Prevent overscroll bounce on iOS
            document.body.style.overscrollBehavior = 'none';
        }

        // Initial call
        onScroll();
    }

    // ─── Update Text Overlays (Minimized DOM writes) ───
    function updateOverlays(progress) {
        CONFIG.phases.forEach(phase => {
            const el = document.getElementById(phase.id);
            if (!el) return;

            const fadeIn = phase.start;
            const fadeOut = phase.end;
            const margin = CONFIG.fadeMargin;

            // Calculate opacity
            let opacity = 0;

            if (progress >= fadeIn && progress <= fadeOut) {
                if (progress < fadeIn + margin) {
                    opacity = (progress - fadeIn) / margin;
                } else if (progress > fadeOut - margin) {
                    opacity = (fadeOut - progress) / margin;
                } else {
                    opacity = 1;
                }
            }

            opacity = Math.max(0, Math.min(1, opacity));

            // Only update DOM if state actually changed
            const prevState = state.lastOverlayState[phase.id];
            const isVisible = opacity > 0.01;
            const roundedOpacity = Math.round(opacity * 100) / 100;

            if (prevState &&
                prevState.visible === isVisible &&
                prevState.opacity === roundedOpacity) {
                return; // Skip DOM update
            }

            state.lastOverlayState[phase.id] = { visible: isVisible, opacity: roundedOpacity };

            if (isVisible) {
                if (!el.classList.contains('visible')) el.classList.add('visible');
                // Use transform for GPU-accelerated animation
                const translateY = (1 - opacity) * 15; // Reduced movement for less jank
                el.style.cssText = `opacity:${roundedOpacity};transform:translate3d(0,${translateY}px,0)`;
            } else {
                if (el.classList.contains('visible')) el.classList.remove('visible');
                el.style.cssText = 'opacity:0;transform:translate3d(0,0,0)';
            }
        });
    }

    // ─── Event Listeners ───
    function setupEventListeners() {
        let resizeTimeout;
        window.addEventListener('resize', () => {
            clearTimeout(resizeTimeout);
            resizeTimeout = setTimeout(() => {
                resizeCanvas();
            }, 150);
        }, { passive: true });

        // Handle orientation change specifically
        window.addEventListener('orientationchange', () => {
            setTimeout(resizeCanvas, 200);
        }, { passive: true });

        // Handle mobile address bar show/hide via visualViewport
        if (window.visualViewport && isMobile) {
            window.visualViewport.addEventListener('resize', () => {
                clearTimeout(resizeTimeout);
                resizeTimeout = setTimeout(resizeCanvas, 100);
            }, { passive: true });
        }
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

        // Mobile CTA
        const mobileCta = $('.mobile-cta');
        if (mobileCta) {
            mobileCta.addEventListener('click', () => {
                const contact = $('#contact');
                if (contact) {
                    hamburger.classList.remove('active');
                    mobileMenu.classList.remove('active');
                    contact.scrollIntoView({ behavior: 'smooth' });
                }
            });
        }
    }

    // ─── Scroll Reveal Animations ───
    function setupScrollAnimations() {
        const animatableSelectors = [
            '.section-tag', '.section-title', '.about-lead',
            '.about-text p', '.value-card', '.service-card',
            '.stat-item', '.big-quote', '.contact-item',
            '.contact-form', '.footer-brand', '.footer-links-group'
        ];

        animatableSelectors.forEach(selector => {
            $$(selector).forEach((el, i) => {
                el.classList.add('reveal');
                el.style.transitionDelay = `${i * 0.06}s`; // Slightly faster stagger
            });
        });

        // IntersectionObserver for reveal
        const observer = new IntersectionObserver(
            (entries) => {
                entries.forEach(entry => {
                    if (entry.isIntersecting) {
                        entry.target.classList.add('visible');

                        if (entry.target.classList.contains('stat-item')) {
                            animateStatNumber(entry.target);
                        }
                    }
                });
            },
            { threshold: 0.1, rootMargin: '0px 0px -30px 0px' }
        );

        $$('.reveal').forEach(el => observer.observe(el));
    }

    // ─── Stat Number Animation ───
    function animateStatNumber(statItem) {
        const numEl = statItem.querySelector('.stat-number');
        if (!numEl || numEl.dataset.animated) return;
        numEl.dataset.animated = 'true';

        const target = parseInt(numEl.dataset.target, 10);
        const duration = 1800;
        const startTime = performance.now();

        function update(currentTime) {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);

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

    // ═══════════════════════════════════════════════════════
    // AI PROPERTY SEARCH ENGINE
    // ═══════════════════════════════════════════════════════

    const PROPERTIES = [
        { id: 1, name: 'Luksuzni trosoban na keju', type: 'stan', rooms: 3, size: 95, price: 145000, priceType: 'prodaja', location: 'Kej', neighborhood: 'Centar', floor: 5, totalFloors: 6, construction: 'novogradnja', features: ['terasa', 'parking', 'lift', 'klima', 'centralno grejanje', 'pogled na Dunav'], description: 'Elegantan trosoban stan sa panoramskim pogledom na Dunav i Petrovaradinsku tvrđavu.', emoji: '🏙️', image: 'property-images/prop-1.jpg' },
        { id: 2, name: 'Dvosoban stan Grbavica', type: 'stan', rooms: 2, size: 58, price: 78000, priceType: 'prodaja', location: 'Grbavica', neighborhood: 'Grbavica', floor: 3, totalFloors: 5, construction: 'novogradnja', features: ['parking', 'lift', 'klima', 'terasa'], description: 'Moderan dvosoban stan u novogradnji na Grbavici, blizina centra.', emoji: '🏗️', image: 'property-images/prop-2.jpg' },
        { id: 3, name: 'Renoviran stan u centru', type: 'stan', rooms: 2, size: 65, price: 95000, priceType: 'prodaja', location: 'Bulevar Oslobođenja', neighborhood: 'Centar', floor: 2, totalFloors: 4, construction: 'starogradnja', features: ['klima', 'centralno grejanje', 'renoviran'], description: 'Potpuno renoviran dvosoban stan na Bulevaru, visoki plafoni i autentičan šarm.', emoji: '🏛️', image: 'property-images/prop-3.jpg' },
        { id: 4, name: 'Garsonjera Liman IV', type: 'stan', rooms: 1, size: 32, price: 48000, priceType: 'prodaja', location: 'Liman IV', neighborhood: 'Liman', floor: 7, totalFloors: 10, construction: 'novogradnja', features: ['lift', 'klima', 'terasa'], description: 'Kompaktna garsonjera idealna za mlade profesionalce ili investiciju.', emoji: '🏠', image: 'property-images/prop-6.jpg' },
        { id: 5, name: 'Penthouse Novi Bulevar', type: 'stan', rooms: 4, size: 156, price: 285000, priceType: 'prodaja', location: 'Novi Bulevar', neighborhood: 'Centar', floor: 8, totalFloors: 8, construction: 'novogradnja', features: ['terasa', 'parking', 'lift', 'klima', 'jacuzzi', 'pogled na Dunav', 'smart home'], description: 'Ekskluzivan penthouse sa 360° pogledom, smart home sistemom i privatnom terasom.', emoji: '✨', image: 'property-images/prop-5.jpg' },
        { id: 6, name: 'Trosoban Novo Naselje', type: 'stan', rooms: 3, size: 72, price: 68000, priceType: 'prodaja', location: 'Novo Naselje', neighborhood: 'Novo Naselje', floor: 4, totalFloors: 10, construction: 'starogradnja', features: ['lift', 'centralno grejanje', 'balkon'], description: 'Prostran trosoban stan na Novom Naselju sa dobro raspoređenim prostorom.', emoji: '🏢', image: 'property-images/prop-2.jpg' },
        { id: 7, name: 'Kuća sa baštom Sremska Kamenica', type: 'kuća', rooms: 5, size: 220, price: 195000, priceType: 'prodaja', location: 'Sremska Kamenica', neighborhood: 'Sremska Kamenica', floor: 0, totalFloors: 2, construction: 'novogradnja', features: ['bašta', 'garaža', 'parking', 'klima', 'centralno grejanje'], description: 'Nova porodična kuća sa velikom baštom i garažom u mirnom delu Kamenice.', emoji: '🏡', image: 'property-images/prop-4.jpg' },
        { id: 8, name: 'Dvosoban Podbara', type: 'stan', rooms: 2, size: 54, price: 350, priceType: 'renta', location: 'Podbara', neighborhood: 'Podbara', floor: 1, totalFloors: 3, construction: 'starogradnja', features: ['klima', 'renoviran', 'namešteno'], description: 'Potpuno opremljen dvosoban stan za izdavanje u mirnom delu Podbare.', emoji: '🔑', image: 'property-images/prop-3.jpg' },
        { id: 9, name: 'Studio apartman Centar', type: 'stan', rooms: 1, size: 38, price: 300, priceType: 'renta', location: 'Zmaj Jovina', neighborhood: 'Centar', floor: 2, totalFloors: 3, construction: 'starogradnja', features: ['klima', 'renoviran', 'namešteno', 'wi-fi'], description: 'Šarmantan studio u srcu pešačke zone, idealan za zakup.', emoji: '🏨', image: 'property-images/prop-6.jpg' },
        { id: 10, name: 'Četvorosoban Liman III', type: 'stan', rooms: 4, size: 110, price: 125000, priceType: 'prodaja', location: 'Liman III', neighborhood: 'Liman', floor: 5, totalFloors: 10, construction: 'starogradnja', features: ['lift', 'centralno grejanje', 'terasa', 'parking'], description: 'Prostran četvorosoban stan na Limanu III, odlična lokacija blizu škola.', emoji: '🏠', image: 'property-images/prop-1.jpg' },
        { id: 11, name: 'Lux stan Telep', type: 'stan', rooms: 3, size: 88, price: 112000, priceType: 'prodaja', location: 'Telep', neighborhood: 'Telep', floor: 2, totalFloors: 4, construction: 'novogradnja', features: ['parking', 'lift', 'klima', 'terasa', 'centralno grejanje'], description: 'Premium trosoban stan u ekskluzivnom kompleksu na Telepu.', emoji: '🏗️', image: 'property-images/prop-2.jpg' },
        { id: 12, name: 'Kuća Petrovaradin', type: 'kuća', rooms: 4, size: 180, price: 165000, priceType: 'prodaja', location: 'Petrovaradin', neighborhood: 'Petrovaradin', floor: 0, totalFloors: 2, construction: 'starogradnja', features: ['bašta', 'garaža', 'podrumski prostor', 'renoviran'], description: 'Renovirana kuća u starom jezgru Petrovaradina sa pogledom na tvrđavu.', emoji: '🏰', image: 'property-images/prop-4.jpg' },
        { id: 13, name: 'Jednosoban Detelinara', type: 'stan', rooms: 1, size: 40, price: 52000, priceType: 'prodaja', location: 'Detelinara', neighborhood: 'Detelinara', floor: 3, totalFloors: 5, construction: 'novogradnja', features: ['lift', 'klima', 'parking', 'terasa'], description: 'Nov jednosoban stan na Detelinari, savršen za prvi stan ili investiciju.', emoji: '🏗️', image: 'property-images/prop-6.jpg' },
        { id: 14, name: 'Trosoban za rentu Liman II', type: 'stan', rooms: 3, size: 78, price: 500, priceType: 'renta', location: 'Liman II', neighborhood: 'Liman', floor: 6, totalFloors: 10, construction: 'starogradnja', features: ['lift', 'klima', 'namešteno', 'centralno grejanje', 'balkon'], description: 'Namešteno trosoban stan na Limanu za dugoročni zakup.', emoji: '🔑', image: 'property-images/prop-1.jpg' },
        { id: 15, name: 'Duplex Grbavica', type: 'stan', rooms: 3, size: 105, price: 135000, priceType: 'prodaja', location: 'Grbavica', neighborhood: 'Grbavica', floor: 4, totalFloors: 5, construction: 'novogradnja', features: ['duplex', 'terasa', 'parking', 'lift', 'klima', 'smart home'], description: 'Moderan duplex na Grbavici sa pametnim kućnim sistemom.', emoji: '🏙️', image: 'property-images/prop-5.jpg' },
        { id: 16, name: 'Garsonjera za rentu Centar', type: 'stan', rooms: 1, size: 28, price: 250, priceType: 'renta', location: 'Jevrejska ulica', neighborhood: 'Centar', floor: 1, totalFloors: 3, construction: 'starogradnja', features: ['namešteno', 'klima', 'wi-fi', 'renoviran'], description: 'Udobna garsonjera u užem centru, potpuno opremljena.', emoji: '🔑', image: 'property-images/prop-6.jpg' },
        { id: 17, name: 'Vila Sremski Karlovci', type: 'kuća', rooms: 6, size: 320, price: 420000, priceType: 'prodaja', location: 'Sremski Karlovci', neighborhood: 'Sremski Karlovci', floor: 0, totalFloors: 3, construction: 'novogradnja', features: ['bazen', 'bašta', 'garaža', 'parking', 'smart home', 'klima', 'pogled'], description: 'Luksuzna vila sa bazenom i vinogradom u Sremskim Karlovcima.', emoji: '🏡', image: 'property-images/prop-4.jpg' },
        { id: 18, name: 'Dvosoban Novo Naselje', type: 'stan', rooms: 2, size: 52, price: 55000, priceType: 'prodaja', location: 'Novo Naselje', neighborhood: 'Novo Naselje', floor: 8, totalFloors: 10, construction: 'starogradnja', features: ['lift', 'centralno grejanje', 'balkon'], description: 'Ekonomičan dvosoban stan na Novom Naselju, odličan za mlade parove.', emoji: '🏠', image: 'property-images/prop-3.jpg' },
        { id: 19, name: 'Trosoban za rentu Centar', type: 'stan', rooms: 3, size: 82, price: 550, priceType: 'renta', location: 'Bulevar Mihajla Pupina', neighborhood: 'Centar', floor: 3, totalFloors: 5, construction: 'starogradnja', features: ['klima', 'namešteno', 'centralno grejanje', 'renoviran', 'terasa'], description: 'Luksuzno opremljen trosoban stan na Bulevaru, idealan za porodicu ili poslovne ljude.', emoji: '🔑', image: 'property-images/prop-1.jpg' },
        { id: 20, name: 'Dvosoban za rentu Grbavica', type: 'stan', rooms: 2, size: 56, price: 400, priceType: 'renta', location: 'Grbavica', neighborhood: 'Grbavica', floor: 2, totalFloors: 5, construction: 'novogradnja', features: ['parking', 'klima', 'namešteno', 'lift', 'terasa'], description: 'Moderan namešteni dvosoban stan u novogradnji na Grbavici sa parking mestom.', emoji: '🔑', image: 'property-images/prop-2.jpg' },
        { id: 21, name: 'Studio Liman I', type: 'stan', rooms: 1, size: 34, price: 280, priceType: 'renta', location: 'Liman I', neighborhood: 'Liman', floor: 4, totalFloors: 10, construction: 'starogradnja', features: ['lift', 'namešteno', 'klima', 'wi-fi'], description: 'Kompaktan studio na Limanu, potpuno opremljen za odmah useljenje.', emoji: '🔑', image: 'property-images/prop-6.jpg' },
        { id: 22, name: 'Trosoban za rentu Telep', type: 'stan', rooms: 3, size: 76, price: 420, priceType: 'renta', location: 'Telep', neighborhood: 'Telep', floor: 1, totalFloors: 4, construction: 'novogradnja', features: ['parking', 'klima', 'namešteno', 'bašta'], description: 'Prizemni trosoban stan sa malim dvorištem, miran kraj Telepa.', emoji: '🔑', image: 'property-images/prop-3.jpg' },
        { id: 23, name: 'Četvorosoban za rentu Novo Naselje', type: 'stan', rooms: 4, size: 98, price: 600, priceType: 'renta', location: 'Novo Naselje', neighborhood: 'Novo Naselje', floor: 5, totalFloors: 10, construction: 'starogradnja', features: ['lift', 'klima', 'namešteno', 'centralno grejanje', 'balkon', 'parking'], description: 'Prostran četvorosoban stan za dugoročno izdavanje, blizu škola i parkova.', emoji: '🔑', image: 'property-images/prop-1.jpg' },
        { id: 24, name: 'Garsonjera za rentu Petrovaradin', type: 'stan', rooms: 1, size: 30, price: 200, priceType: 'renta', location: 'Petrovaradin', neighborhood: 'Petrovaradin', floor: 2, totalFloors: 3, construction: 'starogradnja', features: ['namešteno', 'renoviran', 'klima'], description: 'Šarmantna garsonjera u starom jezgru Petrovaradina, pogled na tvrđavu.', emoji: '🔑', image: 'property-images/prop-5.jpg' }
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

        function openPanel() {
            panel.classList.add('active');
            overlay.classList.add('active');
            fab.classList.add('hidden');
            setTimeout(() => input.focus(), 300);

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

        suggestions.addEventListener('click', (e) => {
            const btn = e.target.closest('.ai-suggestion');
            if (!btn) return;
            const query = btn.dataset.query;
            input.value = query;
            handleQuery(query);
        });

        form.addEventListener('submit', (e) => {
            e.preventDefault();
            const query = input.value.trim();
            if (!query) return;
            handleQuery(query);
        });

        function handleQuery(query) {
            suggestions.classList.add('hidden');
            addUserMessage(query);
            input.value = '';

            const typingEl = showTyping();

            const delay = 600 + Math.random() * 800;
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

        const matchWord = scored.length === 1 ? 'nekretninu' : (scored.length < 5 ? 'nekretnine' : 'nekretnina');
        let responseText = `Pronašao sam <strong>${scored.length}</strong> ${matchWord} koje odgovaraju vašim kriterijumima:`;

        if (parsed.priceType === 'renta') {
            responseText += ' <em>(izdavanje)</em>';
        }

        addAIMessage(responseText);

        const chatArea = $('#aiChatArea');
        scored.forEach((s, i) => {
            setTimeout(() => {
                const card = buildPropertyCard(s.property, s.score, scored[0].score);
                chatArea.appendChild(card);
                chatArea.scrollTop = chatArea.scrollHeight;
            }, i * 200);
        });

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

        if (/ku[cć]a|vila/i.test(q)) parsed.type = 'kuća';
        else if (/stan|apartman|garsonjer/i.test(q)) parsed.type = 'stan';
        if (/penthouse|penthaus/i.test(q)) { parsed.type = 'stan'; parsed.features.push('penthouse'); parsed.keywords.push('penthouse'); }

        const roomWords = { 'garsonjer': 1, 'jednosoban': 1, 'dvosoban': 2, 'trosoban': 3, 'trosob': 3, 'četvorosoban': 4, 'cetvorosoban': 4, 'petosoban': 5 };
        for (const [word, count] of Object.entries(roomWords)) {
            if (q.includes(word)) { parsed.rooms = count; break; }
        }
        const roomMatch = q.match(/(\d)\s*sob/);
        if (roomMatch) parsed.rooms = parseInt(roomMatch[1]);

        const priceMatch = q.match(/(\d[\d\s.,]*)\s*(evr|eur|€|hilj)/i);
        if (priceMatch) {
            let price = parseFloat(priceMatch[1].replace(/[\s.,]/g, ''));
            if (price < 1000 && !q.includes('rent') && !q.includes('izdav') && !q.includes('zakup') && !q.includes('mesečn')) {
                price *= 1000;
            }
            if (/do|maks|max|ispod|jeftin/i.test(q)) parsed.maxPrice = price;
            else if (/od|min|iznad|preko/i.test(q)) parsed.minPrice = price;
            else parsed.maxPrice = price * 1.15;
        }
        const kMatch = q.match(/(\d+)\s*k\s*(€|evr|eur)/i);
        if (kMatch) parsed.maxPrice = parseInt(kMatch[1]) * 1000;

        if (/rent|izdav|zakup|mesečn|najam/i.test(q)) parsed.priceType = 'renta';
        else if (/kupi|prodaj|kupov/i.test(q)) parsed.priceType = 'prodaja';

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

        if (/novogradnj/i.test(q)) parsed.construction = 'novogradnja';
        if (/starogradnj/i.test(q)) parsed.construction = 'starogradnja';

        const sizeMatch = q.match(/(\d+)\s*(m2|m²|kvadrat|kvm)/i);
        if (sizeMatch) parsed.keywords.push({ type: 'size', value: parseInt(sizeMatch[1]) });

        if (/jeftin|povolj|ekonom|budget/i.test(q)) parsed.keywords.push('budget');
        if (/luksuz|premium|ekskluziv|skup/i.test(q)) parsed.keywords.push('luxury');
        if (/investici/i.test(q)) parsed.keywords.push('investment');

        return parsed;
    }

    function scoreProperty(property, parsed) {
        let score = 0;
        let totalCriteria = 0;

        if (parsed.type) {
            totalCriteria++;
            if (property.type === parsed.type) score += 30;
            else return 0;
        }

        if (parsed.rooms) {
            totalCriteria++;
            if (property.rooms === parsed.rooms) score += 25;
            else if (Math.abs(property.rooms - parsed.rooms) === 1) score += 10;
            else score -= 10;
        }

        if (parsed.priceType) {
            totalCriteria++;
            if (property.priceType === parsed.priceType) score += 20;
            else return 0;
        }

        if (parsed.maxPrice) {
            totalCriteria++;
            if (property.price <= parsed.maxPrice) score += 20;
            else if (property.price <= parsed.maxPrice * 1.1) score += 8;
            else score -= 15;
        }
        if (parsed.minPrice) {
            totalCriteria++;
            if (property.price >= parsed.minPrice) score += 15;
            else score -= 10;
        }

        if (parsed.neighborhoods.length > 0) {
            totalCriteria++;
            if (parsed.neighborhoods.includes(property.neighborhood)) score += 25;
            else score -= 5;
        }

        if (parsed.construction) {
            totalCriteria++;
            if (property.construction === parsed.construction) score += 15;
            else score -= 5;
        }

        if (parsed.features.length > 0) {
            totalCriteria++;
            let featureScore = 0;
            const pFeatures = property.features.join(' ').toLowerCase();
            parsed.features.forEach(f => {
                if (pFeatures.includes(f.toLowerCase())) featureScore += 8;
            });
            score += featureScore;
        }

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

    // ═══════════════════════════════════════════════════════
    // PROPERTY GRID SYSTEM (inline cards)
    // ═══════════════════════════════════════════════════════

    let nekShowAll = false;
    let nekFavorites = new Set();

    function setupPropertyGrid() {
        const grid = $('#nekGrid');
        const loadMoreBtn = $('#nekLoadMore');
        const loadMoreWrap = $('#nekLoadMoreWrap');
        const filterType = $('#filterTypeSelect');
        const filterLocation = $('#filterLocationSelect');
        const filterPrice = $('#filterPriceSelect');
        const filterRooms = $('#filterRoomsSelect');
        const filterConstruction = $('#filterConstructionSelect');
        const filterReset = $('#filterReset');
        const sortSelect = $('#nekSortSelect');
        const resultsCount = $('#nekResultsCount');
        const nekAIInput = $('#nekAIInput');
        const nekAIBtn = $('#nekAIBtn');
        const nekAITags = $$('.nek-ai-tag');
        const categoryTabs = $$('.nek-cat-tab');
        let activeCategory = 'sve'; // 'sve' | 'prodaja' | 'renta'

        if (!grid) return;

        function getFilteredProperties() {
            let results = [...PROPERTIES];

            // Category tab filter
            if (activeCategory === 'prodaja') results = results.filter(p => p.priceType === 'prodaja');
            else if (activeCategory === 'renta') results = results.filter(p => p.priceType === 'renta');
            else if (activeCategory === 'novogradnja') results = results.filter(p => p.construction === 'novogradnja');

            const type = filterType ? filterType.value : '';
            const location = filterLocation ? filterLocation.value : '';
            const price = filterPrice ? filterPrice.value : '';
            const rooms = filterRooms ? filterRooms.value : '';
            const construction = filterConstruction ? filterConstruction.value : '';

            if (type) results = results.filter(p => p.type === type);
            if (location) results = results.filter(p => p.neighborhood === location);
            if (price === 'renta') {
                results = results.filter(p => p.priceType === 'renta');
            } else if (price) {
                const [min, max] = price.split('-').map(Number);
                results = results.filter(p => p.priceType === 'prodaja' && p.price >= min && p.price <= max);
            }
            if (rooms) {
                const r = parseInt(rooms);
                if (r >= 4) results = results.filter(p => p.rooms >= 4);
                else results = results.filter(p => p.rooms === r);
            }
            if (construction) results = results.filter(p => p.construction === construction);

            // Sort
            const sort = sortSelect ? sortSelect.value : 'default';
            switch (sort) {
                case 'price-asc': results.sort((a, b) => a.price - b.price); break;
                case 'price-desc': results.sort((a, b) => b.price - a.price); break;
                case 'size-desc': results.sort((a, b) => b.size - a.size); break;
                case 'newest': results.sort((a, b) => b.id - a.id); break;
            }

            return results;
        }

        function renderGrid() {
            const filtered = getFilteredProperties();
            const toShow = nekShowAll ? filtered : filtered.slice(0, 6);

            grid.innerHTML = '';
            toShow.forEach((prop, i) => {
                const card = buildNekCard(prop, i);
                grid.appendChild(card);
            });

            // Update count
            if (resultsCount) {
                resultsCount.innerHTML = `Prikazano: <strong>${toShow.length}</strong> od ${filtered.length} nekretnina`;
            }

            // Show/hide load more
            if (loadMoreWrap) {
                loadMoreWrap.style.display = (filtered.length > 6 && !nekShowAll) ? 'flex' : 'none';
            }
        }

        // Filter event listeners
        [filterType, filterLocation, filterPrice, filterRooms, filterConstruction, sortSelect].forEach(el => {
            if (el) el.addEventListener('change', () => {
                nekShowAll = false;
                renderGrid();
            });
        });

        if (filterReset) {
            filterReset.addEventListener('click', () => {
                [filterType, filterLocation, filterPrice, filterRooms, filterConstruction].forEach(el => {
                    if (el) el.value = '';
                });
                if (sortSelect) sortSelect.value = 'default';
                activeCategory = 'sve';
                categoryTabs.forEach(t => t.classList.remove('active'));
                const sveTab = document.querySelector('.nek-cat-tab[data-category="sve"]');
                if (sveTab) sveTab.classList.add('active');
                nekShowAll = false;
                renderGrid();
            });
        }

        // Category tabs
        categoryTabs.forEach(tab => {
            tab.addEventListener('click', () => {
                categoryTabs.forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                activeCategory = tab.dataset.category;
                // Reset price filter when switching categories
                if (filterPrice) filterPrice.value = '';
                nekShowAll = false;
                renderGrid();
            });
        });

        if (loadMoreBtn) {
            loadMoreBtn.addEventListener('click', () => {
                nekShowAll = true;
                renderGrid();
            });
        }

        // Inline AI Search
        function handleInlineSearch(query) {
            if (!query.trim()) {
                // Reset filters and show all
                [filterType, filterLocation, filterPrice, filterRooms, filterConstruction].forEach(el => {
                    if (el) el.value = '';
                });
                nekShowAll = false;
                renderGrid();
                return;
            }

            const q = query.toLowerCase();
            const parsed = parseQuery(q);
            const scored = PROPERTIES.map(p => ({
                property: p,
                score: scoreProperty(p, parsed)
            }))
            .filter(s => s.score > 0)
            .sort((a, b) => b.score - a.score);

            // Reset filters visually
            [filterType, filterLocation, filterPrice, filterRooms, filterConstruction].forEach(el => {
                if (el) el.value = '';
            });

            // Render filtered results
            grid.innerHTML = '';
            if (scored.length === 0) {
                grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:4rem 2rem;">
                    <div style="font-size:2.5rem;margin-bottom:1rem;">🔍</div>
                    <h3 style="font-family:var(--font-display);font-size:1.4rem;color:var(--white);margin-bottom:0.5rem;">Nema rezultata</h3>
                    <p style="font-size:0.9rem;color:var(--white-muted);">Pokušajte sa širim parametrima pretrage.</p>
                </div>`;
            } else {
                scored.forEach((s, i) => {
                    const card = buildNekCard(s.property, i);
                    grid.appendChild(card);
                });
            }

            if (resultsCount) {
                resultsCount.innerHTML = `AI pretraga: <strong>${scored.length}</strong> rezultata za "${query}"`;
            }
            if (loadMoreWrap) loadMoreWrap.style.display = 'none';
        }

        if (nekAIBtn) {
            nekAIBtn.addEventListener('click', () => {
                handleInlineSearch(nekAIInput.value);
            });
        }

        if (nekAIInput) {
            nekAIInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    handleInlineSearch(nekAIInput.value);
                }
            });
        }

        nekAITags.forEach(tag => {
            tag.addEventListener('click', () => {
                const query = tag.dataset.query;
                nekAIInput.value = query;
                handleInlineSearch(query);
            });
        });

        // Initial render
        renderGrid();
    }

    function buildNekCard(property, index) {
        const card = document.createElement('div');
        card.className = 'nek-card';
        card.style.animationDelay = `${index * 0.08}s`;

        const isFav = nekFavorites.has(property.id);
        const isRenta = property.priceType === 'renta';
        const badgeClass = isRenta ? 'renta' : (property.construction === 'novogradnja' ? 'novogradnja' : 'starogradnja');
        const badgeText = isRenta ? 'IZDAVANJE' : property.construction.toUpperCase();

        // Price formatting
        const priceFormatted = property.priceType === 'renta'
            ? `${property.price}€ <small>/mesec</small>`
            : `${property.price.toLocaleString('de-DE')}€`;

        // Badge for rental properties
        let rateHtml = '';
        if (property.priceType === 'renta') {
            const hasFurnished = property.features.includes('namešteno');
            rateHtml = `<span class="nek-card-rate renta-badge">${hasFurnished ? 'Namešteno' : 'Mesečno'}</span>`;
        }

        // Type label
        const typeLabel = property.priceType === 'renta' ? 'Izdavanje' : 'Prodaja';
        const typeSecondary = property.type === 'kuća' ? 'Kuća' : 'Stan';

        // Room word
        const roomWord = property.rooms === 1 ? 'soba' : (property.rooms < 5 ? 'sobe' : 'soba');

        // Specs
        const specs = [
            `${property.size} m²`,
            `${property.rooms} ${roomWord}`,
            ...(property.features.slice(0, 2).map(f => f.charAt(0).toUpperCase() + f.slice(1)))
        ];

        card.innerHTML = `
            <div class="nek-card-img">
                <img src="${property.image}" alt="${property.name}" loading="lazy">
                <span class="nek-card-id">ID ${String(property.id).padStart(5, '0')}</span>
                <span class="nek-card-badge ${badgeClass}">${badgeText}</span>
                <button class="nek-card-fav ${isFav ? 'active' : ''}" data-id="${property.id}" aria-label="Sačuvaj">
                    <svg viewBox="0 0 24 24"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
                </button>
            </div>
            <div class="nek-card-price-area">
                <span class="nek-card-price">${priceFormatted}</span>
                ${rateHtml}
            </div>
            <div class="nek-card-type">
                <span>${typeLabel}</span>
                <span class="dot"> · </span>
                <span>${typeSecondary}</span>
            </div>
            <div class="nek-card-body">
                <div class="nek-card-location">${property.location}, ${property.neighborhood}</div>
                <div class="nek-card-specs">
                    ${specs.map(s => `<span class="nek-card-spec">${s}</span>`).join('')}
                </div>
            </div>
        `;

        // Favorite toggle
        const favBtn = card.querySelector('.nek-card-fav');
        if (favBtn) {
            favBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (nekFavorites.has(property.id)) {
                    nekFavorites.delete(property.id);
                    favBtn.classList.remove('active');
                } else {
                    nekFavorites.add(property.id);
                    favBtn.classList.add('active');
                }
            });
        }

        // Card click → scroll to contact
        card.addEventListener('click', (e) => {
            if (e.target.closest('.nek-card-fav')) return;
            const contact = document.getElementById('contact');
            if (contact) contact.scrollIntoView({ behavior: 'smooth' });
        });

        return card;
    }

    // ─── Start ───
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
