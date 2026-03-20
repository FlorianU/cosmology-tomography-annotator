// --- 1. State Variables ---
let taskActive = false;
let startTime = 0;
let currentSlice = 0;
let totalSlices = 100;
let annotationCache = [];
let imageCache = [];
let imagesLoaded = 0;
let blankCanvasData = "";

// Zoom & Pan Variables
let zoomScale = 1;
let panX = 0;
let panY = 0;
let isPanning = false;

// Configuration for image loading
const imageFolder = "slices/";
const imagePrefix = "slice_";
const imageExtension = ".png";
const zeroPadLength = 3;

// DOM Elements
const container = document.getElementById("canvas-container");
const zoomWrapper = document.getElementById("zoom-wrapper");
const bgCanvas = document.getElementById("bgCanvas");
const fgCanvas = document.getElementById("fgCanvas");
const bgCtx = bgCanvas.getContext("2d", { willReadFrequently: true });
const fgCtx = fgCanvas.getContext("2d", { willReadFrequently: true });

const sliceSlider = document.getElementById("sliceSlider");
const sliceLabel = document.getElementById("sliceLabel");
const btnPrevSlice = document.getElementById("btnPrevSlice");
const btnNextSlice = document.getElementById("btnNextSlice");
const movingSlice = document.getElementById("moving-slice");

const btnStart = document.getElementById("btnStart");
const btnFinish = document.getElementById("btnFinish");
const btnRestart = document.getElementById("btnRestart");
const overlay = document.getElementById("overlay");
const overlayText = document.getElementById("overlay-text");
const overlaySubtext = document.getElementById("overlay-subtext");
const inputTotalSlices = document.getElementById("inputTotalSlices");
const inputShineDepth = document.getElementById("inputShineDepth");
const brushSizeInput = document.getElementById("brushSize");
const radioInputs = document.querySelectorAll('input[name="labelGroup"]');

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

// --- 3. Dynamic SVG Brush Cursor ---
function updateCursor() {
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

// --- 4. Image Preloader Engine ---
function preloadImages() {
    imagesLoaded = 0;
    imageCache = new Array(totalSlices);
    btnStart.innerText = "LOADING IMAGES...";
    btnStart.disabled = true;
    overlayText.innerText = "Loading Dataset...";

    for (let i = 0; i < totalSlices; i++) {
        let img = new Image();
        let paddedIndex = i.toString().padStart(zeroPadLength, "0");
        img.src = `${imageFolder}${imagePrefix}${paddedIndex}${imageExtension}`;

        img.onload = () => {
            imagesLoaded++;
            overlaySubtext.innerText = `Cached ${imagesLoaded} of ${totalSlices} slices...`;
            if (i === currentSlice) renderBackground(currentSlice);

            if (imagesLoaded === totalSlices) {
                btnStart.innerText = "START TASK";
                btnStart.disabled = false;
                overlayText.innerText = 'Click "START TASK" to begin';
                overlaySubtext.innerHTML = "Timer will start immediately.<br>Use Left/Right Arrow keys to navigate slices quickly.";
                centerCanvas();
            }
        };
        img.onerror = () => {
            console.error(`Failed to load image: ${img.src}`);
            imagesLoaded++;
        };
        imageCache[i] = img;
    }
}

// --- 5. Master Reset Function ---
function resetTask() {
    taskActive = false;
    totalSlices = parseInt(inputTotalSlices.value) || 100;
    if (totalSlices < 1) totalSlices = 1;

    annotationCache = [];
    for (let i = 0; i < totalSlices; i++) {
        let c = document.createElement('canvas');
        c.width = fgCanvas.width;
        c.height = fgCanvas.height;
        annotationCache.push(c);
    }

    currentSlice = 0;
    sliceSlider.max = totalSlices - 1;
    sliceSlider.value = 0;
    sliceSlider.disabled = true;
    sliceLabel.innerText = "Z: 000";

    inputTotalSlices.disabled = false;
    btnFinish.disabled = true;
    btnRestart.disabled = true;
    btnPrevSlice.disabled = true;
    btnNextSlice.disabled = true;

    fgCtx.clearRect(0, 0, fgCanvas.width, fgCanvas.height);
    blankCanvasData = fgCanvas.toDataURL();
    bgCtx.clearRect(0, 0, bgCanvas.width, bgCanvas.height);

    overlaySubtext.style.display = "block";
    overlay.style.display = "flex";

    updateCursor();
    preloadImages();
}

inputTotalSlices.addEventListener("change", resetTask);

// --- 6. Drawing Logic ---
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
    if (!taskActive || e.button !== 0 || e.altKey || isPanning) return;
    isDrawing = true;
    fgCtx.beginPath();
    fgCtx.moveTo(e.offsetX, e.offsetY);
    applyStrokeProperties();
    fgCtx.lineTo(e.offsetX, e.offsetY);
    fgCtx.stroke();
});

fgCanvas.addEventListener("mousemove", (e) => {
    if (!isDrawing || !taskActive) return;
    applyStrokeProperties();
    fgCtx.lineTo(e.offsetX, e.offsetY);
    fgCtx.stroke();
});

window.addEventListener("mouseup", () => { isDrawing = false; });
fgCanvas.addEventListener("mouseout", () => { isDrawing = false; });

// --- 7. Real Background Renderer ---
inputShineDepth.addEventListener('input', () => {
    if (taskActive) renderBackground(currentSlice);
});

function renderBackground(sliceIndex) {
    bgCtx.globalCompositeOperation = "source-over";
    bgCtx.globalAlpha = 1.0;
    bgCtx.fillStyle = "#0a0a0a";
    bgCtx.fillRect(0, 0, bgCanvas.width, bgCanvas.height);

    const depth = parseInt(inputShineDepth.value) || 0;
    bgCtx.globalCompositeOperation = "screen";

    for (let i = depth; i >= 1; i--) {
        let lowerSliceIdx = sliceIndex - i;

        if (lowerSliceIdx >= 0) {
            bgCtx.globalAlpha = 1 - (i / (depth + 1));

            const lowerImg = imageCache[lowerSliceIdx];
            if (lowerImg && lowerImg.complete && lowerImg.naturalHeight !== 0) {
                bgCtx.drawImage(lowerImg, 0, 0, bgCanvas.width, bgCanvas.height);
            }

            if (annotationCache[lowerSliceIdx]) {
                bgCtx.drawImage(annotationCache[lowerSliceIdx], 0, 0, bgCanvas.width, bgCanvas.height);
            }
        }
    }

    bgCtx.globalAlpha = 1.0;
    const currentImg = imageCache[sliceIndex];

    if (currentImg && currentImg.complete && currentImg.naturalHeight !== 0) {
        bgCtx.drawImage(currentImg, 0, 0, bgCanvas.width, bgCanvas.height);
    } else {
        bgCtx.globalCompositeOperation = "source-over";
        bgCtx.fillStyle = "#555";
        bgCtx.font = "20px monospace";
        bgCtx.fillText(`Image ${sliceIndex} not found or loading...`, 20, 40);
    }
    bgCtx.globalCompositeOperation = "source-over";
}

// --- 8. Slice Navigation & State Saving ---
function changeSlice(newSlice) {
    let cacheCtx = annotationCache[currentSlice].getContext('2d');
    cacheCtx.clearRect(0, 0, fgCanvas.width, fgCanvas.height);
    cacheCtx.drawImage(fgCanvas, 0, 0);

    currentSlice = parseInt(newSlice);
    sliceLabel.innerText = `Z: ${currentSlice.toString().padStart(zeroPadLength, "0")}`;

    if (totalSlices > 1 && movingSlice) {
        const percentage = currentSlice / (totalSlices - 1);
        const zPosition = -30 + (percentage * 60);
        movingSlice.style.transform = `translateZ(${zPosition}px)`;
    }

    renderBackground(currentSlice);

    fgCtx.clearRect(0, 0, fgCanvas.width, fgCanvas.height);
    fgCtx.drawImage(annotationCache[currentSlice], 0, 0);
}

function stepSlice(direction) {
    if (!taskActive) return;
    let targetSlice = currentSlice + direction;
    if (targetSlice >= 0 && targetSlice < totalSlices) {
        sliceSlider.value = targetSlice;
        changeSlice(targetSlice);
    }
}

sliceSlider.addEventListener("input", (e) => { changeSlice(e.target.value); });
btnPrevSlice.addEventListener("click", () => stepSlice(-1));
btnNextSlice.addEventListener("click", () => stepSlice(1));

document.addEventListener("keydown", (e) => {
    if (!taskActive) return;
    if (e.key === "ArrowLeft" || e.key === "a" || e.key === "A") stepSlice(-1);
    else if (e.key === "ArrowRight" || e.key === "d" || e.key === "D") stepSlice(1);
});

// --- 9. Task Control Button Listeners ---
btnStart.addEventListener("click", () => {
    taskActive = true;
    startTime = Date.now();
    overlay.style.display = "none";

    inputTotalSlices.disabled = true;
    btnStart.disabled = true;
    btnFinish.disabled = false;
    btnRestart.disabled = false;
    sliceSlider.disabled = false;
    btnPrevSlice.disabled = false;
    btnNextSlice.disabled = false;
});

btnFinish.addEventListener("click", () => {
    if (!taskActive) return;
    taskActive = false;
    let endTime = Date.now();
    let timeOnTaskSeconds = ((endTime - startTime) / 1000).toFixed(2);

    let cacheCtx = annotationCache[currentSlice].getContext('2d');
    cacheCtx.clearRect(0, 0, fgCanvas.width, fgCanvas.height);
    cacheCtx.drawImage(fgCanvas, 0, 0);

    exportData(timeOnTaskSeconds);
});

btnRestart.addEventListener("click", () => {
    if (confirm("Are you sure you want to restart? All drawings and timers will be permanently deleted.")) {
        resetTask();
    }
});

// --- 10. Data Export (BLOB VERSION) ---
function exportData(timeSeconds) {
    let populatedSlices = {};

    annotationCache.forEach((cacheCanvas, index) => {
        const dataURL = cacheCanvas.toDataURL();
        if (dataURL && dataURL !== blankCanvasData) {
            populatedSlices[`slice_${index}`] = dataURL;
        }
    });

    const drawnSliceCount = Object.keys(populatedSlices).length;
    const exportPayload = {
        experiment_metadata: {
            condition: "2D_Desktop",
            time_on_task_seconds: parseFloat(timeSeconds),
            total_slices_viewed: totalSlices,
            annotated_slice_count: drawnSliceCount,
            timestamp: new Date().toISOString(),
        },
        annotations: populatedSlices,
    };

    const jsonString = JSON.stringify(exportPayload, null, 2);
    const blob = new Blob([jsonString], { type: "application/json" });
    const blobUrl = URL.createObjectURL(blob);

    const downloadAnchorNode = document.createElement("a");
    downloadAnchorNode.setAttribute("href", blobUrl);
    downloadAnchorNode.setAttribute("download", `participant_2D_export_${Date.now()}.json`);
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();

    URL.revokeObjectURL(blobUrl);

    overlayText.innerText = `Task Complete! Time: ${timeSeconds}s\nSaved ${drawnSliceCount} annotated slices.`;
    overlaySubtext.style.display = "none";
    overlay.style.display = "flex";

    sliceSlider.disabled = true;
    btnPrevSlice.disabled = true;
    btnNextSlice.disabled = true;
    btnFinish.disabled = true;
}

resetTask();