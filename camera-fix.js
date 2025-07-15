// Simple camera implementation for wound monitoring
let videoStream = null;
let isModelLoaded = false;

// Initialize camera functionality
async function initCamera() {
    const video = document.getElementById('cameraVideo');
    const startBtn = document.getElementById('startCameraBtn');
    const stopBtn = document.getElementById('stopCameraBtn');
    const captureBtn = document.getElementById('captureBtn');

    // Check browser support
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        showStatus('Camera not supported in this browser', 'error');
        return;
    }

    startBtn.addEventListener('click', async () => {
        try {
            showStatus('Starting camera...', 'info');
            
            // Stop any existing stream
            if (videoStream) {
                videoStream.getTracks().forEach(track => track.stop());
            }

            // Request camera access
            const constraints = {
                video: {
                    facingMode: { ideal: 'environment' },
                    width: { ideal: 1280 },
                    height: { ideal: 720 }
                }
            };

            videoStream = await navigator.mediaDevices.getUserMedia(constraints);
            video.srcObject = videoStream;
            video.style.display = 'block';
            
            // Wait for video to be ready
            video.onloadedmetadata = () => {
                video.play();
                showStatus('Camera ready! Position QR code next to wound', 'success');
                
                // Update button states
                startBtn.disabled = true;
                stopBtn.disabled = false;
                captureBtn.disabled = false;
                
                // Start QR code scanning
                startQRScanning();
            };

        } catch (error) {
            showStatus('Camera access denied: ' + error.message, 'error');
            console.error('Camera error:', error);
        }
    });

    stopBtn.addEventListener('click', () => {
        if (videoStream) {
            videoStream.getTracks().forEach(track => track.stop());
            videoStream = null;
            video.style.display = 'none';
            
            // Reset button states
            startBtn.disabled = false;
            stopBtn.disabled = true;
            captureBtn.disabled = true;
            
            showStatus('Camera stopped', 'info');
        }
    });

    captureBtn.addEventListener('click', captureWound);
}

// QR Code scanning functionality
function startQRScanning() {
    const video = document.getElementById('cameraVideo');
    const overlay = document.getElementById('overlayCanvas');
    
    if (!overlay) return;
    
    // Set overlay size to match video
    overlay.width = video.videoWidth;
    overlay.height = video.videoHeight;
    overlay.style.width = video.offsetWidth + 'px';
    overlay.style.height = video.offsetHeight + 'px';
    overlay.style.display = 'block';
    
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
        
        // Get image data for QR detection
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
    const scaleX = overlay.width / overlay.offsetWidth;
    const scaleY = overlay.height / overlay.offsetHeight;
    
    // Draw QR code boundary
    ctx.strokeStyle = '#00FF00';
    ctx.lineWidth = 3;
    ctx.beginPath();
    
    const corners = [
        qrCode.location.topLeftCorner,
        qrCode.location.topRightCorner,
        qrCode.location.bottomRightCorner,
        qrCode.location.bottomLeftCorner
    ];
    
    corners.forEach((corner, index) => {
        const x = corner.x / scaleX;
        const y = corner.y / scaleY;
        
        if (index === 0) {
            ctx.moveTo(x, y);
        } else {
            ctx.lineTo(x, y);
        }
    });
    
    ctx.closePath();
    ctx.stroke();
    
    // Draw label
    ctx.fillStyle = '#00FF00';
    ctx.font = '16px Arial';
    ctx.fillText('QR Code Detected', corners[0].x / scaleX, corners[0].y / scaleY - 10);
}

function updateCalibration(qrCode) {
    // Calculate QR code size in pixels
    const qrWidth = Math.abs(qrCode.location.topRightCorner.x - qrCode.location.topLeftCorner.x);
    const qrHeight = Math.abs(qrCode.location.bottomLeftCorner.y - qrCode.location.topLeftCorner.y);
    const qrSizePixels = (qrWidth + qrHeight) / 2;
    
    // Standard QR code is 2.5cm x 2.5cm
    const pixelsPerCm = qrSizePixels / 2.5;
    
    // Update display
    document.getElementById('qrStatus').textContent = 'Yes';
    document.getElementById('calibrationScale').textContent = pixelsPerCm.toFixed(2) + ' px/cm';
    
    // Store for wound measurement
    window.currentCalibration = {
        pixelsPerCm: pixelsPerCm,
        qrCode: qrCode
    };
}

function clearCalibration() {
    document.getElementById('qrStatus').textContent = 'No';
    document.getElementById('calibrationScale').textContent = '-- px/cm';
    window.currentCalibration = null;
}

// Capture wound image
async function captureWound() {
    const video = document.getElementById('cameraVideo');
    const patientId = document.getElementById('patientId').value;
    
    if (!patientId) {
        showStatus('Please enter Patient ID', 'error');
        return;
    }
    
    if (!window.currentCalibration) {
        showStatus('Please ensure QR code is visible for calibration', 'warning');
        return;
    }
    
    try {
        showStatus('Capturing wound image...', 'info');
        
        // Create canvas from video
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(video, 0, 0);
        
        // For now, simulate wound detection
        // In a real app, this would use the TensorFlow model
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
        
        // Save to timeline (mock)
        addToTimeline(mockMeasurements);
        
        showStatus('Wound captured successfully!', 'success');
        
    } catch (error) {
        showStatus('Error capturing wound: ' + error.message, 'error');
        console.error('Capture error:', error);
    }
}

// Add measurement to timeline
function addToTimeline(measurements) {
    const timeline = document.getElementById('progressTimeline');
    const item = document.createElement('div');
    item.className = 'timeline-item';
    
    const now = new Date();
    item.innerHTML = `
        <div class="timeline-date">${now.toLocaleDateString()}</div>
        <div class="timeline-measurement">
            Area: ${measurements.areaCm2} cm²
            <span class="status-indicator status-stable">New</span>
        </div>
    `;
    
    timeline.insertBefore(item, timeline.firstChild);
}

// Status message helper
function showStatus(message, type) {
    const statusDiv = document.getElementById('statusMessages');
    
    const alert = document.createElement('div');
    alert.className = `alert alert-${type}`;
    alert.textContent = message;
    
    statusDiv.appendChild(alert);
    
    setTimeout(() => {
        alert.remove();
    }, 5000);
}

// Initialize when page loads
document.addEventListener('DOMContentLoaded', () => {
    initCamera();
    console.log('Camera system initialized');
});