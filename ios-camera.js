// iOS-style camera implementation for wound monitoring
let videoStream = null;
let isModelLoaded = false;
let currentSection = 'scan';
let woundSegmentationModel = null;

// Initialize app
document.addEventListener('DOMContentLoaded', () => {
    initCamera();
    loadWoundSegmentationModel();
    loadProgressData();
    
    // Add event listeners for patient info changes
    document.getElementById('patientName').addEventListener('change', loadProgressData);
    document.getElementById('woundLocation').addEventListener('change', loadProgressData);
    
    console.log('iOS Wound Monitor initialized');
});

// Load wound segmentation model
async function loadWoundSegmentationModel() {
    try {
        showAlert('Loading Model', 'Loading wound detection AI...', 'info');
        
        // Load the TensorFlow Lite model
        woundSegmentationModel = await tflite.loadTFLiteModel('./QATbest_int8.tflite');
        isModelLoaded = true;
        
        showAlert('Model Ready', 'AI wound detection loaded successfully', 'success');
        console.log('Wound segmentation model loaded:', woundSegmentationModel.inputs[0].shape);
        
    } catch (error) {
        showAlert('Model Error', 'Failed to load wound detection model', 'error');
        console.error('Model loading error:', error);
    }
}

// Tab navigation
function switchTab(section) {
    // Update active tab
    document.querySelectorAll('.tab-item').forEach(tab => {
        tab.classList.remove('active');
    });
    event.currentTarget.classList.add('active');
    
    // Update active section
    document.querySelectorAll('.section').forEach(sec => {
        sec.classList.remove('active');
    });
    document.getElementById(section + 'Section').classList.add('active');
    
    currentSection = section;
    
    // Haptic feedback (if supported)
    if (navigator.vibrate) {
        navigator.vibrate(10);
    }
    
    // Load data for the section if needed
    if (section === 'progress') {
        loadProgressData();
    }
}

// Settings (placeholder)
function showSettings() {
    showAlert('Settings', 'Settings functionality coming soon', 'info');
}

// Initialize camera functionality
async function initCamera() {
    const video = document.getElementById('cameraVideo');
    const startBtn = document.getElementById('startCameraBtn');
    const stopBtn = document.getElementById('stopCameraBtn');
    const captureBtn = document.getElementById('captureBtn');
    const uploadBtn = document.getElementById('uploadBtn');
    const imageUpload = document.getElementById('imageUpload');
    const uploadedImage = document.getElementById('uploadedImage');
    const placeholder = document.getElementById('cameraPlaceholder');

    // Check browser support
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        showAlert('Camera Not Supported', 'Your browser does not support camera access', 'error');
        // Hide camera button if not supported
        startBtn.style.display = 'none';
    }

    startBtn.addEventListener('click', async () => {
        try {
            // Haptic feedback
            if (navigator.vibrate) navigator.vibrate(10);
            
            showAlert('Starting Camera', 'Requesting camera access...', 'info');
            
            // Stop any existing stream
            if (videoStream) {
                videoStream.getTracks().forEach(track => track.stop());
            }

            // Request camera access with iOS-friendly constraints
            const constraints = {
                video: {
                    facingMode: { ideal: 'environment' },
                    width: { ideal: 1280, min: 640 },
                    height: { ideal: 720, min: 480 }
                }
            };

            try {
                videoStream = await navigator.mediaDevices.getUserMedia(constraints);
            } catch (envError) {
                // Fallback to any available camera
                console.log('Environment camera not available, trying any camera');
                videoStream = await navigator.mediaDevices.getUserMedia({
                    video: {
                        width: { ideal: 1280, min: 640 },
                        height: { ideal: 720, min: 480 }
                    }
                });
            }

            video.srcObject = videoStream;
            video.style.display = 'block';
            placeholder.style.display = 'none';
            
            // Wait for video to be ready
            video.onloadedmetadata = () => {
                video.play();
                showAlert('Camera Ready', 'Position QR code next to wound', 'success');
                
                // Show overlay canvas
                const overlay = document.getElementById('overlayCanvas');
                overlay.style.display = 'block';
                
                // Update button states
                startBtn.disabled = true;
                stopBtn.disabled = false;
                captureBtn.disabled = false;
                
                // Start QR code scanning
                startQRScanning();
            };

        } catch (error) {
            showAlert('Camera Error', error.message, 'error');
            console.error('Camera error:', error);
        }
    });

    stopBtn.addEventListener('click', () => {
        if (navigator.vibrate) navigator.vibrate(10);
        
        if (videoStream) {
            videoStream.getTracks().forEach(track => track.stop());
            videoStream = null;
            video.style.display = 'none';
            placeholder.style.display = 'flex';
            
            // Hide overlay
            const overlay = document.getElementById('overlayCanvas');
            overlay.style.display = 'none';
            
            // Reset button states
            startBtn.disabled = false;
            stopBtn.disabled = true;
            captureBtn.disabled = true;
            
            showAlert('Camera Stopped', 'Tap Start Camera to begin again', 'info');
        }
    });

    captureBtn.addEventListener('click', captureWound);

    // Image upload functionality
    uploadBtn.addEventListener('click', () => {
        if (navigator.vibrate) navigator.vibrate(10);
        imageUpload.click();
    });

    imageUpload.addEventListener('change', (event) => {
        const file = event.target.files[0];
        if (!file) return;

        if (!file.type.startsWith('image/')) {
            showAlert('Invalid File', 'Please select an image file', 'error');
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            // Stop camera if running
            if (videoStream) {
                videoStream.getTracks().forEach(track => track.stop());
                videoStream = null;
            }

            // Hide video and show uploaded image
            video.style.display = 'none';
            uploadedImage.src = e.target.result;
            uploadedImage.style.display = 'block';
            placeholder.style.display = 'none';

            // Update button states
            startBtn.disabled = false;
            stopBtn.disabled = true;
            captureBtn.disabled = false;
            captureBtn.textContent = 'Analyze Uploaded Image';

            // Store the uploaded image for analysis
            window.uploadedImageData = e.target.result;

            showAlert('Image Loaded', 'Image uploaded successfully. Ensure QR code is visible for calibration.', 'success');
        };
        reader.readAsDataURL(file);
    });
}

// QR Code scanning
function startQRScanning() {
    const video = document.getElementById('cameraVideo');
    const overlay = document.getElementById('overlayCanvas');
    
    if (!overlay || !videoStream) return;
    
    // Set overlay size
    const rect = video.getBoundingClientRect();
    overlay.width = video.videoWidth;
    overlay.height = video.videoHeight;
    overlay.style.width = rect.width + 'px';
    overlay.style.height = rect.height + 'px';
    
    scanQRCode();
}

function scanQRCode() {
    if (!videoStream) return;
    
    const video = document.getElementById('cameraVideo');
    const overlay = document.getElementById('overlayCanvas');
    const ctx = overlay.getContext('2d');
    
    if (video.readyState === video.HAVE_ENOUGH_DATA) {
        // Create canvas for QR detection
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const canvasCtx = canvas.getContext('2d');
        canvasCtx.drawImage(video, 0, 0);
        
        // Get image data
        const imageData = canvasCtx.getImageData(0, 0, canvas.width, canvas.height);
        
        // Only clear QR overlay area, preserve wound overlay
        const existingImageData = ctx.getImageData(0, 0, overlay.width, overlay.height);
        ctx.clearRect(0, 0, overlay.width, overlay.height);
        
        // Check if jsQR is available
        if (typeof jsQR !== 'undefined') {
            const qrCode = jsQR(imageData.data, imageData.width, imageData.height);
            
            if (qrCode) {
                // First restore any existing wound overlay
                ctx.putImageData(existingImageData, 0, 0);
                
                // Then draw QR overlay on top
                drawQROverlay(ctx, qrCode, overlay);
                updateCalibration(qrCode);
            } else {
                // Restore wound overlay without QR
                ctx.putImageData(existingImageData, 0, 0);
                clearCalibration();
            }
        } else {
            // Restore wound overlay
            ctx.putImageData(existingImageData, 0, 0);
        }
    }
    
    // Continue scanning
    requestAnimationFrame(scanQRCode);
}

function drawQROverlay(ctx, qrCode, overlay) {
    const video = document.getElementById('cameraVideo');
    const rect = video.getBoundingClientRect();
    const scaleX = rect.width / video.videoWidth;
    const scaleY = rect.height / video.videoHeight;
    
    // iOS-style green overlay
    ctx.strokeStyle = '#34C759';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    
    // Draw corners with gaps (iOS style)
    const corners = [
        qrCode.location.topLeftCorner,
        qrCode.location.topRightCorner,
        qrCode.location.bottomRightCorner,
        qrCode.location.bottomLeftCorner
    ];
    
    // Scale coordinates
    const scaledCorners = corners.map(c => ({
        x: c.x * scaleX,
        y: c.y * scaleY
    }));
    
    // Draw corner brackets
    const bracketSize = 30;
    
    // Top left
    ctx.beginPath();
    ctx.moveTo(scaledCorners[0].x, scaledCorners[0].y + bracketSize);
    ctx.lineTo(scaledCorners[0].x, scaledCorners[0].y);
    ctx.lineTo(scaledCorners[0].x + bracketSize, scaledCorners[0].y);
    ctx.stroke();
    
    // Top right
    ctx.beginPath();
    ctx.moveTo(scaledCorners[1].x - bracketSize, scaledCorners[1].y);
    ctx.lineTo(scaledCorners[1].x, scaledCorners[1].y);
    ctx.lineTo(scaledCorners[1].x, scaledCorners[1].y + bracketSize);
    ctx.stroke();
    
    // Bottom right
    ctx.beginPath();
    ctx.moveTo(scaledCorners[2].x, scaledCorners[2].y - bracketSize);
    ctx.lineTo(scaledCorners[2].x, scaledCorners[2].y);
    ctx.lineTo(scaledCorners[2].x - bracketSize, scaledCorners[2].y);
    ctx.stroke();
    
    // Bottom left
    ctx.beginPath();
    ctx.moveTo(scaledCorners[3].x + bracketSize, scaledCorners[3].y);
    ctx.lineTo(scaledCorners[3].x, scaledCorners[3].y);
    ctx.lineTo(scaledCorners[3].x, scaledCorners[3].y - bracketSize);
    ctx.stroke();
    
    // Draw label
    ctx.fillStyle = '#34C759';
    ctx.font = '600 14px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.fillText('QR Detected', scaledCorners[0].x, scaledCorners[0].y - 10);
}

function updateCalibration(qrCode) {
    // Calculate QR code size
    const qrWidth = Math.abs(qrCode.location.topRightCorner.x - qrCode.location.topLeftCorner.x);
    const qrHeight = Math.abs(qrCode.location.bottomLeftCorner.y - qrCode.location.topLeftCorner.y);
    const qrSizePixels = (qrWidth + qrHeight) / 2;
    
    // Standard QR code is 2.5cm x 2.5cm
    const pixelsPerCm = qrSizePixels / 2.5;
    
    // Update display
    document.getElementById('qrStatus').textContent = 'Yes';
    document.getElementById('qrStatus').style.color = 'var(--ios-green)';
    document.getElementById('calibrationScale').textContent = pixelsPerCm.toFixed(0) + ' px/cm';
    
    // Store calibration
    window.currentCalibration = {
        pixelsPerCm: pixelsPerCm,
        qrCode: qrCode
    };
}

function clearCalibration() {
    document.getElementById('qrStatus').textContent = 'No';
    document.getElementById('qrStatus').style.color = 'var(--ios-blue)';
    document.getElementById('calibrationScale').textContent = '-- px/cm';
    window.currentCalibration = null;
}

// Capture wound image
async function captureWound() {
    if (navigator.vibrate) navigator.vibrate([10, 50, 10]);
    
    const video = document.getElementById('cameraVideo');
    const uploadedImage = document.getElementById('uploadedImage');
    const patientName = document.getElementById('patientName').value;
    const woundLocation = document.getElementById('woundLocation').value;
    
    if (!patientName) {
        showAlert('Name Required', 'Please enter your name before analyzing', 'warning');
        return;
    }
    
    if (!woundLocation) {
        showAlert('Location Required', 'Please select wound location before analyzing', 'warning');
        return;
    }
    
    // Check if we have an image source (camera or uploaded)
    const hasVideo = video.style.display !== 'none' && videoStream;
    const hasUploadedImage = uploadedImage.style.display !== 'none';
    
    if (!hasVideo && !hasUploadedImage) {
        showAlert('No Image', 'Please take a photo or upload an image first', 'warning');
        return;
    }
    
    try {
        showAlert('Processing', 'Analyzing wound...', 'info');
        
        // Create canvas from appropriate source
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        
        if (hasVideo) {
            // From camera
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            ctx.drawImage(video, 0, 0);
        } else {
            // From uploaded image
            canvas.width = uploadedImage.naturalWidth;
            canvas.height = uploadedImage.naturalHeight;
            ctx.drawImage(uploadedImage, 0, 0);
        }
        
        // Analyze the image for QR code if not already detected
        if (!window.currentCalibration) {
            analyzeImageForQR(canvas);
        }
        
        // Perform wound segmentation
        const measurements = await performWoundSegmentation(canvas);
        
        // Update measurement display
        document.getElementById('measurementDisplay').style.display = 'block';
        
        if (measurements.calibrated && window.currentCalibration) {
            document.getElementById('woundArea').textContent = measurements.areaCm2 + ' cm²';
            document.getElementById('woundPerimeter').textContent = measurements.perimeterCm + ' cm';
        } else {
            document.getElementById('woundArea').textContent = measurements.areaPixels + ' pixels';
            document.getElementById('woundPerimeter').textContent = measurements.perimeterPixels + ' pixels';
        }
        
        // Save to local storage
        saveScanData(patientName, woundLocation, measurements);
        
        // Add to timeline
        addToTimeline(measurements);
        
        showAlert('Scan Complete', 'Wound measurements recorded successfully', 'success');
        
    } catch (error) {
        showAlert('Capture Error', error.message, 'error');
        console.error('Capture error:', error);
    }
}

// Perform wound segmentation using TensorFlow Lite model
async function performWoundSegmentation(canvas) {
    if (!woundSegmentationModel) {
        showAlert('Model Not Ready', 'Wound detection model not loaded', 'error');
        return {
            areaPixels: 0,
            perimeterPixels: 0,
            areaCm2: 0,
            perimeterCm: 0,
            calibrated: false
        };
    }
    
    try {
        // Prepare input tensor
        const inputTensor = tf.tidy(() => {
            let tensor = tf.browser.fromPixels(canvas);
            
            // Get model input shape
            const inputShape = woundSegmentationModel.inputs[0].shape;
            const targetHeight = inputShape[1] || 224;
            const targetWidth = inputShape[2] || 224;
            
            // Resize to model input size
            tensor = tf.image.resizeBilinear(tensor, [targetHeight, targetWidth]);
            
            // Normalize for int8 quantized model
            tensor = tf.div(tf.sub(tensor, 127.5), 127.5);
            
            // Add batch dimension
            return tensor.expandDims(0);
        });
        
        // Run inference
        const predictions = await woundSegmentationModel.predict(inputTensor);
        
        // Process model output
        const maskTensor = tf.tidy(() => {
            let output = predictions;
            
            // Handle multi-channel output
            if (output.shape.length === 4 && output.shape[3] > 1) {
                output = tf.slice(output, [0, 0, 0, 1], [1, -1, -1, 1]);
            }
            
            // Remove batch dimension
            output = tf.squeeze(output, [0]);
            
            // Remove channel dimension if present
            if (output.shape.length === 3) {
                output = tf.squeeze(output, [2]);
            }
            
            // Apply sigmoid and threshold
            output = tf.sigmoid(output);
            const binaryMask = tf.greater(output, 0.5);
            
            // Resize back to original canvas size
            const resized = tf.image.resizeBilinear(
                binaryMask.expandDims(2).expandDims(0),
                [canvas.height, canvas.width]
            );
            
            return tf.squeeze(resized).cast('float32');
        });
        
        // Calculate measurements
        const measurements = await calculateWoundMeasurements(maskTensor, canvas);
        
        // Show wound segmentation overlay
        await showWoundSegmentationOverlay(maskTensor, canvas);
        
        // Clean up tensors
        inputTensor.dispose();
        predictions.dispose();
        maskTensor.dispose();
        
        return measurements;
        
    } catch (error) {
        console.error('Wound segmentation error:', error);
        showAlert('Analysis Error', 'Failed to analyze wound: ' + error.message, 'error');
        return {
            areaPixels: 0,
            perimeterPixels: 0,
            areaCm2: 0,
            perimeterCm: 0,
            calibrated: false
        };
    }
}

// Calculate wound measurements from mask
async function calculateWoundMeasurements(maskTensor, canvas) {
    const maskData = await maskTensor.data();
    const width = canvas.width;
    const height = canvas.height;
    
    let woundPixels = 0;
    let perimeterPixels = 0;
    
    // Count wound pixels and estimate perimeter
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const idx = y * width + x;
            if (maskData[idx] > 0.5) {
                woundPixels++;
                
                // Check if this is a perimeter pixel
                const isPerimeter = (
                    x === 0 || x === width - 1 || y === 0 || y === height - 1 ||
                    maskData[idx - 1] <= 0.5 || maskData[idx + 1] <= 0.5 ||
                    maskData[idx - width] <= 0.5 || maskData[idx + width] <= 0.5
                );
                
                if (isPerimeter) {
                    perimeterPixels++;
                }
            }
        }
    }
    
    let areaCm2 = 0;
    let perimeterCm = 0;
    let calibrated = false;
    
    // Convert to cm if calibrated
    if (window.currentCalibration) {
        const pixelsPerCm = window.currentCalibration.pixelsPerCm;
        areaCm2 = woundPixels / (pixelsPerCm * pixelsPerCm);
        perimeterCm = perimeterPixels / pixelsPerCm;
        calibrated = true;
    }
    
    return {
        areaPixels: woundPixels,
        perimeterPixels: perimeterPixels,
        areaCm2: areaCm2.toFixed(2),
        perimeterCm: perimeterCm.toFixed(2),
        calibrated: calibrated
    };
}

// Show wound segmentation overlay
async function showWoundSegmentationOverlay(maskTensor, sourceCanvas) {
    const video = document.getElementById('cameraVideo');
    const uploadedImage = document.getElementById('uploadedImage');
    const overlay = document.getElementById('overlayCanvas');
    
    if (!overlay) return;
    
    // Set overlay size to match the displayed image
    let displayWidth, displayHeight;
    if (video.style.display !== 'none') {
        const rect = video.getBoundingClientRect();
        displayWidth = rect.width;
        displayHeight = rect.height;
    } else {
        const rect = uploadedImage.getBoundingClientRect();
        displayWidth = rect.width;
        displayHeight = rect.height;
    }
    
    overlay.width = displayWidth;
    overlay.height = displayHeight;
    overlay.style.display = 'block';
    
    const ctx = overlay.getContext('2d');
    ctx.clearRect(0, 0, overlay.width, overlay.height);
    
    // Get mask data
    const maskData = await maskTensor.data();
    const maskWidth = sourceCanvas.width;
    const maskHeight = sourceCanvas.height;
    
    // Create wound overlay
    const imageData = ctx.createImageData(overlay.width, overlay.height);
    const data = imageData.data;
    
    for (let y = 0; y < overlay.height; y++) {
        for (let x = 0; x < overlay.width; x++) {
            // Map overlay coordinates to mask coordinates
            const maskX = Math.floor((x / overlay.width) * maskWidth);
            const maskY = Math.floor((y / overlay.height) * maskHeight);
            const maskIdx = maskY * maskWidth + maskX;
            
            const overlayIdx = (y * overlay.width + x) * 4;
            
            if (maskData[maskIdx] > 0.5) {
                // Red overlay for wound area
                data[overlayIdx] = 255;     // R
                data[overlayIdx + 1] = 0;   // G
                data[overlayIdx + 2] = 0;   // B
                data[overlayIdx + 3] = 100; // A (transparency)
            } else {
                // Transparent
                data[overlayIdx + 3] = 0;
            }
        }
    }
    
    ctx.putImageData(imageData, 0, 0);
    
    // Draw wound boundary
    ctx.strokeStyle = '#FF3B30';
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    
    // Simple boundary detection and drawing
    for (let y = 1; y < overlay.height - 1; y += 2) {
        for (let x = 1; x < overlay.width - 1; x += 2) {
            const maskX = Math.floor((x / overlay.width) * maskWidth);
            const maskY = Math.floor((y / overlay.height) * maskHeight);
            const maskIdx = maskY * maskWidth + maskX;
            
            if (maskData[maskIdx] > 0.5) {
                // Check if this is a boundary pixel
                const neighbors = [
                    maskData[maskIdx - 1],
                    maskData[maskIdx + 1],
                    maskData[maskIdx - maskWidth],
                    maskData[maskIdx + maskWidth]
                ];
                
                if (neighbors.some(n => n <= 0.5)) {
                    ctx.moveTo(x, y);
                    ctx.lineTo(x + 1, y + 1);
                }
            }
        }
    }
    
    ctx.stroke();
}

// Analyze uploaded image for QR code
function analyzeImageForQR(canvas) {
    const ctx = canvas.getContext('2d');
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    
    if (typeof jsQR !== 'undefined') {
        const qrCode = jsQR(imageData.data, imageData.width, imageData.height);
        
        if (qrCode) {
            // Calculate QR code size
            const qrWidth = Math.abs(qrCode.location.topRightCorner.x - qrCode.location.topLeftCorner.x);
            const qrHeight = Math.abs(qrCode.location.bottomLeftCorner.y - qrCode.location.topLeftCorner.y);
            const qrSizePixels = (qrWidth + qrHeight) / 2;
            
            // Standard QR code is 2.5cm x 2.5cm
            const pixelsPerCm = qrSizePixels / 2.5;
            
            // Update calibration
            window.currentCalibration = {
                pixelsPerCm: pixelsPerCm,
                qrCode: qrCode
            };
            
            // Update display
            document.getElementById('qrStatus').textContent = 'Yes';
            document.getElementById('qrStatus').style.color = 'var(--ios-green)';
            document.getElementById('calibrationScale').textContent = pixelsPerCm.toFixed(0) + ' px/cm';
            
            showAlert('QR Code Found', 'Calibration successful!', 'success');
        } else {
            showAlert('No QR Code', 'QR code not found in image. Measurements will be in pixels only.', 'warning');
        }
    }
}

// Save scan data to local storage
function saveScanData(patientName, woundLocation, measurements) {
    const scans = JSON.parse(localStorage.getItem('woundScans') || '[]');
    
    const scanData = {
        id: Date.now().toString(),
        patientName: patientName,
        woundLocation: woundLocation,
        providerName: document.getElementById('providerName').value,
        timestamp: new Date().toISOString(),
        measurements: measurements
    };
    
    scans.unshift(scanData);
    
    // Keep only last 50 scans
    if (scans.length > 50) {
        scans.length = 50;
    }
    
    localStorage.setItem('woundScans', JSON.stringify(scans));
}

// Load progress data
function loadProgressData() {
    const patientName = document.getElementById('patientName').value;
    const woundLocation = document.getElementById('woundLocation').value;
    
    if (!patientName || !woundLocation) return;
    
    const scans = JSON.parse(localStorage.getItem('woundScans') || '[]');
    const patientScans = scans.filter(s => 
        s.patientName === patientName && s.woundLocation === woundLocation
    );
    
    displayProgressTimeline(patientScans);
    updateRecommendations(patientScans);
}

// Display progress timeline
function displayProgressTimeline(scans) {
    const timeline = document.getElementById('progressTimeline');
    timeline.innerHTML = '';
    
    if (scans.length === 0) {
        timeline.innerHTML = `
            <div style="text-align: center; color: var(--ios-secondary-text); padding: 32px;">
                No scans recorded yet
            </div>
        `;
        return;
    }
    
    scans.forEach((scan, index) => {
        const item = document.createElement('div');
        item.className = 'timeline-item';
        
        const date = new Date(scan.timestamp);
        let statusClass = 'stable';
        let statusText = 'Stable';
        
        if (index > 0) {
            const prevScan = scans[index - 1];
            const areaChange = scan.measurements.areaCm2 - prevScan.measurements.areaCm2;
            if (areaChange < -0.1) {
                statusClass = 'improving';
                statusText = 'Improving';
            } else if (areaChange > 0.1) {
                statusClass = 'concerning';
                statusText = 'Concerning';
            }
        }
        
        item.innerHTML = `
            <div class="timeline-date">${date.toLocaleDateString()}</div>
            <div class="timeline-content">
                <span>${scan.measurements.areaCm2} cm²</span>
                <span class="status-badge ${statusClass}">${statusText}</span>
            </div>
        `;
        
        timeline.appendChild(item);
    });
}

// Add to timeline immediately after capture
function addToTimeline(measurements) {
    if (currentSection === 'progress') {
        loadProgressData();
    }
}

// Update recommendations based on progress
function updateRecommendations(scans) {
    if (scans.length < 2) return;
    
    const latest = scans[0];
    const previous = scans[1];
    
    const areaChange = latest.measurements.areaCm2 - previous.measurements.areaCm2;
    const percentChange = (areaChange / previous.measurements.areaCm2) * 100;
    
    const recommendations = document.getElementById('recommendationsContent');
    recommendations.innerHTML = '';
    
    // Base recommendations
    const baseRecs = [
        {
            title: 'Daily Care',
            text: 'Continue gentle cleaning with saline solution and apply prescribed dressing.'
        },
        {
            title: 'Monitor Signs',
            text: 'Watch for increased redness, swelling, warmth, or unusual discharge.'
        }
    ];
    
    // Trend-specific recommendations
    if (percentChange < -10) {
        baseRecs.push({
            title: 'Positive Progress',
            text: 'Wound is healing well. Continue current treatment plan.'
        });
    } else if (percentChange > 10) {
        baseRecs.push({
            title: 'Contact Provider',
            text: 'Wound size has increased. Contact your healthcare provider.'
        });
    }
    
    // Render recommendations
    baseRecs.forEach(rec => {
        const card = document.createElement('div');
        card.className = 'recommendation-card';
        card.innerHTML = `
            <div class="recommendation-title">${rec.title}</div>
            <div class="recommendation-text">${rec.text}</div>
        `;
        recommendations.appendChild(card);
    });
}

// iOS-style alert system
function showAlert(title, message, type = 'info') {
    const alertContainer = document.getElementById('alertContainer');
    
    const alert = document.createElement('div');
    alert.className = `ios-alert ${type}`;
    alert.innerHTML = `
        <div class="ios-alert-title">${title}</div>
        <div class="ios-alert-message">${message}</div>
    `;
    
    alertContainer.appendChild(alert);
    
    // Trigger animation
    setTimeout(() => {
        alert.classList.add('show');
    }, 10);
    
    // Auto dismiss
    setTimeout(() => {
        alert.classList.remove('show');
        setTimeout(() => {
            alert.remove();
        }, 300);
    }, 3000);
}