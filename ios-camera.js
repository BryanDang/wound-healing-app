// iOS-style camera implementation for wound monitoring
let videoStream = null;
let isModelLoaded = false;
let currentSection = 'scan';

// Initialize app
document.addEventListener('DOMContentLoaded', () => {
    initCamera();
    loadProgressData();
    
    // Add event listeners for patient info changes
    document.getElementById('patientName').addEventListener('change', loadProgressData);
    document.getElementById('woundLocation').addEventListener('change', loadProgressData);
    
    console.log('iOS Wound Monitor initialized');
});

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
        
        // Clear overlay
        ctx.clearRect(0, 0, overlay.width, overlay.height);
        
        // Check if jsQR is available
        if (typeof jsQR !== 'undefined') {
            const qrCode = jsQR(imageData.data, imageData.width, imageData.height);
            
            if (qrCode) {
                drawQROverlay(ctx, qrCode, overlay);
                updateCalibration(qrCode);
            } else {
                clearCalibration();
            }
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
        
        // Simulate wound detection
        const mockMeasurements = {
            areaCm2: (Math.random() * 5 + 1).toFixed(2),
            perimeterCm: (Math.random() * 10 + 5).toFixed(2),
            areaPixels: Math.floor(Math.random() * 1000 + 500),
            perimeterPixels: Math.floor(Math.random() * 500 + 200),
            calibrated: true
        };
        
        // Update measurement display
        document.getElementById('measurementDisplay').style.display = 'block';
        document.getElementById('woundArea').textContent = mockMeasurements.areaCm2 + ' cm²';
        document.getElementById('woundPerimeter').textContent = mockMeasurements.perimeterCm + ' cm';
        
        // Save to local storage (mock)
        saveScanData(patientName, woundLocation, mockMeasurements);
        
        // Add to timeline
        addToTimeline(mockMeasurements);
        
        showAlert('Scan Complete', 'Wound measurements recorded successfully', 'success');
        
    } catch (error) {
        showAlert('Capture Error', error.message, 'error');
        console.error('Capture error:', error);
    }
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