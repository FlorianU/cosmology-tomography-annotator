// --- 1. State Variables ---
let taskActive = false;
let startTime = 0;
let totalSlices = 100;
let blankCanvasData = "";
let showAnnotations = true;

// Axis States
let currentAxis = 'Z';
let currentSlice = { Z: 0, Y: 0 };
let imageCache = { Z: [], Y: [] };
let annotationCache = [];

// Zoom & Pan Variables
let zoomScale = 1;
let panX = 0;
let panY = 0;
let isPanning = false;

// Spatial Jump Tracker
let lastMouseY = 952 / 2;

// DOM Elements
const container = document.getElementById("canvas-container");
const zoomWrapper = document.getElementById("zoom-wrapper");
const bgCanvas = document.getElementById("bgCanvas");
const fgCanvas = document.getElementById("fgCanvas");
const bgCtx = bgCanvas.getContext("2d", { willReadFrequently: true });
const fgCtx = fgCanvas.getContext("2d", { willReadFrequently: true });

// NEW: Dedicated offscreen canvas for instantaneous outline generation
const outlineCanvas = document.createElement("canvas");
outlineCanvas.width = 1046;
outlineCanvas.height = 952;
const outlineCtx = outlineCanvas.getContext("2d", { willReadFrequently: true });

const sliceSlider = document.getElementById("sliceSlider");
const sliceLabel = document.getElementById("sliceLabel");
const btnPrevSlice = document.getElementById("btnPrevSlice");
const btnNextSlice = document.getElementById("btnNextSlice");
const movingSlice = document.getElementById("moving-slice");
const viewOnlyBanner = document.getElementById("view-only-banner");
const chkPlayground = document.getElementById("chkPlayground");

const inputParticipantID = document.getElementById("inputParticipantID");
const btnStart = document.getElementById("btnStart");
const btnToggleAnnotations = document.getElementById("btnToggleAnnotations");
const btnFinish = document.getElementById("btnFinish");
const btnRestart = document.getElementById("btnRestart");
const overlay = document.getElementById("overlay");
const overlayText = document.getElementById("overlay-text");
const overlaySubtext = document.getElementById("overlay-subtext");
const inputTotalSlices = document.getElementById("inputTotalSlices");
const inputShineDepth = document.getElementById("inputShineDepth");
const brushSizeInput = document.getElementById("brushSize");
const radioInputs = document.querySelectorAll('input[name="labelGroup"]');
const axisInputs = document.querySelectorAll('input[name="axisGroup"]');

// --- 2. Zoom & Pan Logic ---
function applyTransform() {
    zoomWrapper.style.transform = `translate(${panX}px, ${panY}px) scale(${zoomScale})`;
    updateCursor();
}

function centerCanvas() {
    const rect = container.getBoundingClientRect();
    const scaleX = rect.width / bgCanvas.width;
    const scaleY = rect.height / bgCanvas.height;
    zoomScale = Math.min(scaleX, scaleY) * 0.95;
    panX = (rect.width - (bgCanvas.width * zoomScale)) / 2;
    panY = (rect.height - (bgCanvas.height * zoomScale)) / 2;
    applyTransform();
}

container.addEventListener('wheel', (e) => {
    if (!taskActive && !overlay.style.display === "none") return;
    e.preventDefault();
    const zoomSensitivity = 0.0015;
    const delta = e.deltaY * -zoomSensitivity;
    const newScale = Math.min(Math.max(0.1, zoomScale + delta), 20);

    const rect = container.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    panX = mouseX - (mouseX - panX) * (newScale / zoomScale);
    panY = mouseY - (mouseY - panY) * (newScale / zoomScale);
    zoomScale = newScale;
    applyTransform();
});

container.addEventListener('mousedown', (e) => {
    if (e.button === 1 || (e.button === 0 && e.altKey)) {
        e.preventDefault();
        isPanning = true;
        container.style.cursor = 'grabbing';
        container.dataset.startX = e.clientX - panX;
        container.dataset.startY = e.clientY - panY;
    }
});

window.addEventListener('mousemove', (e) => {
    if (isPanning) {
        panX = e.clientX - parseFloat(container.dataset.startX);
        panY = e.clientY - parseFloat(container.dataset.startY);
        applyTransform();
    }
});

window.addEventListener('mouseup', () => {
    if (isPanning) {
        isPanning = false;
        container.style.cursor = 'grab';
    }
});

window.addEventListener('resize', () => {
    if (!isPanning && zoomScale < 1) centerCanvas();
});

function trackMouse(e) {
    lastMouseY = e.offsetY;
}
bgCanvas.addEventListener('mousemove', trackMouse);
fgCanvas.addEventListener('mousemove', trackMouse);

// --- 3. Dynamic Cursor ---
function updateCursor() {
    if (currentAxis === 'Y') {
        fgCanvas.style.cursor = "not-allowed";
        return;
    }

    const size = parseFloat(brushSizeInput.value);
    const selectedTool = document.querySelector('input[name="labelGroup"]:checked').value;
    const visualSize = Math.max(2, size * zoomScale);
    const radius = visualSize / 2;

    let svg = "";
    if (selectedTool === "eraser") {
        svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${visualSize}" height="${visualSize}" viewBox="0 0 ${visualSize} ${visualSize}">
      <circle cx="${radius}" cy="${radius}" r="${radius - 1}" fill="none" stroke="white" stroke-width="2" stroke-dasharray="4,4"/>
    </svg>`;
    } else {
        svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${visualSize}" height="${visualSize}" viewBox="0 0 ${visualSize} ${visualSize}">
      <circle cx="${radius}" cy="${radius}" r="${radius - 0.5}" fill="${selectedTool}" fill-opacity="0.4" stroke="white" stroke-width="1.5" stroke-opacity="0.8"/>
    </svg>`;
    }

    const encoded = encodeURIComponent(svg).replace(/'/g, "%27").replace(/"/g, "%22");
    fgCanvas.style.cursor = `url("data:image/svg+xml;charset=utf-8,${encoded}") ${radius} ${radius}, crosshair`;
}

brushSizeInput.addEventListener("input", updateCursor);
radioInputs.forEach(el => el.addEventListener("change", updateCursor));

// --- 4. Dual-Axis Image Preloader ---
function preloadImages() {
    let imagesLoaded = 0;
    const expectedTotal = totalSlices * 2;
    imageCache = { Z: new Array(totalSlices), Y: new Array(totalSlices) };

    btnStart.innerText = "LOADING IMAGES...";
    btnStart.disabled = true;
    overlayText.innerText = "Loading Dual-Axis Dataset...";

    const axes = ['Z', 'Y'];

    const folderPrefix = chkPlayground.checked ? 'playground_' : 'slices_';

    axes.forEach(axis => {
        for (let i = 0; i < totalSlices; i++) {
            let img = new Image();
            let paddedIndex = i.toString().padStart(3, "0");

            // NEW: Uses dynamic folder prefix
            img.src = `${folderPrefix}${axis}/slice_${paddedIndex}.png`;

            img.onload = () => {
                imagesLoaded++;
                overlaySubtext.innerText = `Cached ${imagesLoaded} of ${expectedTotal} slices...`;
                if (imagesLoaded === expectedTotal) finishLoading();
            };
            img.onerror = () => {
                console.warn(`Failed to load ${axis} image: ${img.src}`);
                imagesLoaded++;
                if (imagesLoaded === expectedTotal) finishLoading();
            };
            imageCache[axis][i] = img;
        }
    });

    function finishLoading() {
        btnStart.innerText = "START TASK";
        btnStart.disabled = false;
        overlayText.innerText = 'Click "START TASK" to begin';
        overlaySubtext.innerHTML = "Timer starts immediately.<br>Use <b>Spacebar</b> to cross-section jump at mouse cursor.";
        centerCanvas();
        changeSlice(0);
    }
}

// --- 5. Navigation & BUG-FIXED State Saving ---
function safelySaveCurrentZ() {
    if (currentAxis === 'Z') {
        let cacheCtx = annotationCache[currentSlice['Z']].getContext('2d');
        cacheCtx.clearRect(0, 0, fgCanvas.width, fgCanvas.height);
        cacheCtx.drawImage(fgCanvas, 0, 0);
    }
}

function changeSlice(newSlice, skipSave = false) {
    if (!skipSave) safelySaveCurrentZ();

    currentSlice[currentAxis] = parseInt(newSlice);
    sliceLabel.innerText = `${currentAxis}: ${currentSlice[currentAxis].toString().padStart(3, "0")}`;

    if (totalSlices > 1 && movingSlice) {
        const percentage = currentSlice[currentAxis] / (totalSlices - 1);
        const pos = -30 + (percentage * 60);

        if (currentAxis === 'Z') {
            movingSlice.style.transform = `translateZ(${pos}px)`;
        } else if (currentAxis === 'Y') {
            movingSlice.style.transform = `rotateX(90deg) translateZ(${pos}px)`;
        }
    }

    renderBackground(currentSlice[currentAxis]);

    if (currentAxis === 'Z') {
        fgCtx.clearRect(0, 0, fgCanvas.width, fgCanvas.height);
        fgCtx.drawImage(annotationCache[currentSlice['Z']], 0, 0);
    }
}

function stepSlice(direction) {
    if (!taskActive) return;
    let targetSlice = currentSlice[currentAxis] + direction;
    if (targetSlice >= 0 && targetSlice < totalSlices) {
        sliceSlider.value = targetSlice;
        changeSlice(targetSlice);
    }
}

sliceSlider.addEventListener("input", (e) => { changeSlice(e.target.value); });
btnPrevSlice.addEventListener("click", () => stepSlice(-1));
btnNextSlice.addEventListener("click", () => stepSlice(1));

// --- 6. Axis Switching Logic ---
function switchAxis(newAxis, targetSliceIndex = null) {
    if (currentAxis === newAxis) return;

    safelySaveCurrentZ();
    currentAxis = newAxis;
    if (targetSliceIndex !== null) currentSlice[currentAxis] = targetSliceIndex;

    if (currentAxis === 'Y') {
        fgCanvas.style.opacity = 0;
        fgCanvas.style.pointerEvents = "none";
        viewOnlyBanner.style.display = "block";
        movingSlice.style.backgroundColor = "rgba(255, 153, 51, 0.6)";
        movingSlice.style.borderColor = "#ff9933";
    } else {
        fgCanvas.style.opacity = showAnnotations ? 1 : 0;
        fgCanvas.style.pointerEvents = showAnnotations ? "auto" : "none";
        viewOnlyBanner.style.display = "none";
        movingSlice.style.backgroundColor = "rgba(51, 153, 255, 0.6)";
        movingSlice.style.borderColor = "#3399ff";
    }

    document.querySelector(`input[name="axisGroup"][value="${currentAxis}"]`).checked = true;
    sliceSlider.value = currentSlice[currentAxis];
    updateCursor();

    changeSlice(currentSlice[currentAxis], true);
}

axisInputs.forEach(input => {
    input.addEventListener("change", (e) => switchAxis(e.target.value));
});

btnToggleAnnotations.addEventListener("click", () => {
    if (!taskActive) return;
    showAnnotations = !showAnnotations;

    btnToggleAnnotations.innerText = showAnnotations ? "HIDE ANNOTATIONS" : "SHOW ANNOTATIONS";
    btnToggleAnnotations.style.backgroundColor = showAnnotations ? "#555" : "#1976d2";

    if (currentAxis === 'Z') {
        fgCanvas.style.opacity = showAnnotations ? 1 : 0;
        fgCanvas.style.pointerEvents = showAnnotations ? "auto" : "none";
    }
    renderBackground(currentSlice[currentAxis]);
});


// --- 7. Task Setup & Draw Loop ---
function resetTask() {
    taskActive = false; chkPlayground.disabled = false;
    btnFinish.innerText = chkPlayground.checked ? "FINISH PRACTICE" : "FINISH & EXPORT";
    totalSlices = parseInt(inputTotalSlices.value) || 100;

    showAnnotations = true;
    btnToggleAnnotations.innerText = "HIDE ANNOTATIONS";
    btnToggleAnnotations.style.backgroundColor = "#555";

    annotationCache = [];
    for (let i = 0; i < totalSlices; i++) {
        let c = document.createElement('canvas');
        c.width = fgCanvas.width;
        c.height = fgCanvas.height;
        annotationCache.push(c);
    }

    currentSlice = { Z: 0, Y: 0 };
    currentAxis = 'Z';
    document.querySelector('input[name="axisGroup"][value="Z"]').checked = true;
    fgCanvas.style.opacity = 1;
    fgCanvas.style.pointerEvents = "auto";
    viewOnlyBanner.style.display = "none";

    sliceSlider.max = totalSlices - 1;
    sliceSlider.value = 0;
    sliceSlider.disabled = true;

    btnToggleAnnotations.disabled = true;
    btnFinish.disabled = true;
    btnRestart.disabled = true;
    btnPrevSlice.disabled = true;
    btnNextSlice.disabled = true;
    inputParticipantID.disabled = false;

    fgCtx.clearRect(0, 0, fgCanvas.width, fgCanvas.height);
    blankCanvasData = fgCanvas.toDataURL();
    bgCtx.clearRect(0, 0, bgCanvas.width, bgCanvas.height);

    overlaySubtext.style.display = "block";
    overlay.style.display = "flex";

    updateCursor();
    preloadImages();
}

inputTotalSlices.addEventListener("change", resetTask);

let isDrawing = false;
fgCtx.lineCap = "round";
fgCtx.lineJoin = "round";

function applyStrokeProperties() {
    const selectedTool = document.querySelector('input[name="labelGroup"]:checked').value;
    if (selectedTool === "eraser") {
        fgCtx.globalCompositeOperation = "destination-out";
        fgCtx.strokeStyle = "rgba(0,0,0,1)";
    } else {
        fgCtx.globalCompositeOperation = "source-over";
        fgCtx.strokeStyle = selectedTool;
    }
    fgCtx.lineWidth = document.getElementById("brushSize").value;
}

fgCanvas.addEventListener("mousedown", (e) => {
    if (!taskActive || currentAxis !== 'Z' || e.button !== 0 || e.altKey || isPanning || !showAnnotations) return;
    isDrawing = true;
    fgCtx.beginPath();
    fgCtx.moveTo(e.offsetX, e.offsetY);
    applyStrokeProperties();
    fgCtx.lineTo(e.offsetX, e.offsetY);
    fgCtx.stroke();
});

fgCanvas.addEventListener("mousemove", (e) => {
    if (!isDrawing || !taskActive || currentAxis !== 'Z' || !showAnnotations) return;
    applyStrokeProperties();
    fgCtx.lineTo(e.offsetX, e.offsetY);
    fgCtx.stroke();
});

window.addEventListener("mouseup", () => { isDrawing = false; });
fgCanvas.addEventListener("mouseout", () => { isDrawing = false; });


// --- 8. REVERSE TOMOGRAPHY ENGINE ---
function drawProjectedAnnotations(ctx, targetYSlice, alpha) {
    ctx.globalAlpha = alpha;
    const H = bgCanvas.height;
    const W = bgCanvas.width;
    const chunkHeight = H / totalSlices;

    const exactY = H - (targetYSlice + 0.5) * chunkHeight;
    const sourcePixelY = Math.floor(exactY);

    for (let z = 0; z < totalSlices; z++) {
        const destPixelY = Math.round(H - (z + 1) * chunkHeight);
        const nextDestPixelY = Math.round(H - z * chunkHeight);
        const blockHeight = nextDestPixelY - destPixelY;

        ctx.drawImage(annotationCache[z], 0, sourcePixelY, W, 1, 0, destPixelY, W, blockHeight);
    }
}


// --- 9. Real Background Renderer ---
inputShineDepth.addEventListener('input', () => {
    if (taskActive) renderBackground(currentSlice[currentAxis]);
});

function renderBackground(sliceIndex) {
    bgCtx.globalCompositeOperation = "source-over";
    bgCtx.globalAlpha = 1.0;
    bgCtx.fillStyle = "#0a0a0a";
    bgCtx.fillRect(0, 0, bgCanvas.width, bgCanvas.height);

    const depth = parseInt(inputShineDepth.value) || 0;
    bgCtx.globalCompositeOperation = "screen";

    // SHINE THROUGH LAYERS
    for (let i = depth; i >= 1; i--) {
        let lowerSliceIdx = sliceIndex - i;
        if (lowerSliceIdx >= 0) {
            bgCtx.globalAlpha = 1 - (i / (depth + 1));

            const lowerImg = imageCache[currentAxis][lowerSliceIdx];
            if (lowerImg && lowerImg.complete && lowerImg.naturalHeight !== 0) {
                bgCtx.drawImage(lowerImg, 0, 0, bgCanvas.width, bgCanvas.height);
            }

            if (showAnnotations) {
                if (currentAxis === 'Z' && annotationCache[lowerSliceIdx]) {
                    // --- OUTLINE GENERATOR ---
                    const img = annotationCache[lowerSliceIdx];
                    const t = 1; // 1-pixel outline thickness

                    outlineCtx.clearRect(0, 0, bgCanvas.width, bgCanvas.height);
                    outlineCtx.globalCompositeOperation = 'source-over';

                    // Stamp it shifted in 8 directions to "fatten" the image
                    outlineCtx.drawImage(img, -t, -t);
                    outlineCtx.drawImage(img, 0, -t);
                    outlineCtx.drawImage(img, t, -t);
                    outlineCtx.drawImage(img, -t, 0);
                    outlineCtx.drawImage(img, t, 0);
                    outlineCtx.drawImage(img, -t, t);
                    outlineCtx.drawImage(img, 0, t);
                    outlineCtx.drawImage(img, t, t);

                    // Punch out the original core, leaving only the expanded outer edge
                    outlineCtx.globalCompositeOperation = 'destination-out';
                    outlineCtx.drawImage(img, 0, 0);

                    // Draw the generated outline to the background
                    bgCtx.drawImage(outlineCanvas, 0, 0, bgCanvas.width, bgCanvas.height);

                } else if (currentAxis === 'Y') {
                    drawProjectedAnnotations(bgCtx, lowerSliceIdx, bgCtx.globalAlpha);
                }
            }
        }
    }

    // ACTIVE LAYER IMAGE
    bgCtx.globalAlpha = 1.0;
    const currentImg = imageCache[currentAxis][sliceIndex];
    if (currentImg && currentImg.complete && currentImg.naturalHeight !== 0) {
        bgCtx.drawImage(currentImg, 0, 0, bgCanvas.width, bgCanvas.height);
    } else {
        bgCtx.globalCompositeOperation = "source-over";
        bgCtx.fillStyle = "#555";
        bgCtx.font = "20px monospace";
        bgCtx.fillText(`Image ${sliceIndex} missing in slices_${currentAxis}/`, 20, 40);
    }

    // ACTIVE LAYER PROJECTED ANNOTATIONS (Y-Axis Only)
    if (currentAxis === 'Y' && showAnnotations) {
        bgCtx.globalCompositeOperation = "source-over";
        drawProjectedAnnotations(bgCtx, sliceIndex, 1.0);
    }

    // INTERSECTION GUIDELINE
    bgCtx.globalCompositeOperation = "source-over";
    let otherAxis = currentAxis === 'Z' ? 'Y' : 'Z';
    let lineProportion = 1.0 - (currentSlice[otherAxis] / (totalSlices - 1));
    let linePixelY = lineProportion * bgCanvas.height;

    bgCtx.globalAlpha = 0.6;
    bgCtx.strokeStyle = currentAxis === 'Z' ? "#ff9933" : "#3399ff";
    bgCtx.lineWidth = 2;
    bgCtx.setLineDash([8, 8]);

    bgCtx.beginPath();
    bgCtx.moveTo(0, linePixelY);
    bgCtx.lineTo(bgCanvas.width, linePixelY);
    bgCtx.stroke();

    bgCtx.fillStyle = currentAxis === 'Z' ? "#ff9933" : "#3399ff";
    bgCtx.font = "bold 14px monospace";
    bgCtx.fillText(`${otherAxis}-Plane Intersection`, 15, linePixelY - 8);

    bgCtx.setLineDash([]);
    bgCtx.globalAlpha = 1.0;
}

// --- GLOBAL KEYBOARD LISTENER ---
document.addEventListener("keydown", (e) => {
    if (!taskActive) return;

    if (e.code === "Space") {
        e.preventDefault();
        let targetProportion = 1.0 - (lastMouseY / bgCanvas.height);
        let targetSliceIndex = Math.floor(targetProportion * totalSlices);
        targetSliceIndex = Math.max(0, Math.min(totalSlices - 1, targetSliceIndex));
        const newAxis = currentAxis === 'Z' ? 'Y' : 'Z';
        switchAxis(newAxis, targetSliceIndex);
    }

    if (e.key === "ArrowLeft" || e.key === "a" || e.key === "A") stepSlice(-1);
    else if (e.key === "ArrowRight" || e.key === "d" || e.key === "D") stepSlice(1);
});

chkPlayground.addEventListener("change", () => {
    if (!taskActive) resetTask();
});

// --- 10. Task Execution ---
btnStart.addEventListener("click", () => {
    chkPlayground.disabled = true;
    taskActive = true;
    startTime = Date.now();
    overlay.style.display = "none";

    inputTotalSlices.disabled = true;
    btnStart.disabled = true;
    btnToggleAnnotations.disabled = false;
    inputParticipantID.disabled = true;
    btnFinish.disabled = false;
    btnRestart.disabled = false;
    sliceSlider.disabled = false;
    btnPrevSlice.disabled = false;
    btnNextSlice.disabled = false;
});

btnFinish.addEventListener("click", () => {
    if (!taskActive) return;
    taskActive = false;

    safelySaveCurrentZ();

    if (chkPlayground.checked) {
        // PLAYGROUND MODE: End task, do NOT export data
        overlayText.innerText = `Practice Complete!`;
        overlaySubtext.innerHTML = `Uncheck <b>Playground Mode</b> to load the real dataset.`;
        overlaySubtext.style.display = "block";
        overlay.style.display = "flex";

        btnToggleAnnotations.disabled = true;
        sliceSlider.disabled = true;
        btnPrevSlice.disabled = true;
        btnNextSlice.disabled = true;
        btnFinish.disabled = true;
        chkPlayground.disabled = false; // Let them uncheck it
    } else {
        // REAL TASK: Export the JSON
        exportData(((Date.now() - startTime) / 1000).toFixed(2));
    }
});

btnRestart.addEventListener("click", () => {
    if (confirm("Are you sure you want to restart? All drawings will be deleted.")) resetTask();
});

// --- 11. Data Export ---
function exportData(timeSeconds) {
    let populatedSlices = {};

    annotationCache.forEach((cacheCanvas, index) => {
        const dataURL = cacheCanvas.toDataURL();
        if (dataURL && dataURL !== blankCanvasData) populatedSlices[`slice_${index}`] = dataURL;
    });

    // Grab the participant ID, or default to "Unknown" if they forgot to type it
    const participantName = inputParticipantID.value.trim() || "Unknown_Participant";

    const exportPayload = {
        experiment_metadata: {
            participant_id: participantName, // <--- Added to JSON here!
            condition: "2D_Desktop",
            time_on_task_seconds: parseFloat(timeSeconds),
            total_slices_viewed: totalSlices,
            annotated_slice_count: Object.keys(populatedSlices).length,
            timestamp: new Date().toISOString(),
        },
        annotations: populatedSlices,
    };

    const blobUrl = URL.createObjectURL(new Blob([JSON.stringify(exportPayload, null, 2)], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = blobUrl;

    // Custom filename using their ID
    a.download = `${participantName}_2D_export_${Date.now()}.json`;

    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(blobUrl);

    overlayText.innerText = `Task Complete! Saved ${Object.keys(populatedSlices).length} annotated slices.`;
    overlaySubtext.style.display = "none";
    overlay.style.display = "flex";

    btnToggleAnnotations.disabled = true;
    sliceSlider.disabled = true;
    btnPrevSlice.disabled = true;
    btnNextSlice.disabled = true;
    btnFinish.disabled = true;
}

resetTask();