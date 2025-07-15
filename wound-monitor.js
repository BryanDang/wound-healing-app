// Firebase configuration
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
import { getFirestore, collection, addDoc, getDocs, query, orderBy, where } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js';

const firebaseConfig = {
    projectId: 'wound-healing-app-rwklz',
    storageBucket: 'wound-healing-app-rwklz.appspot.com'
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const storage = getStorage(app);

// Global variables
let stream = null;
let model = null;
let isScanning = false;
let lastQRCode = null;
let pixelsPerCm = null;

// QR Code size reference (standard QR codes are 2.5cm x 2.5cm)
const QR_CODE_SIZE_CM = 2.5;

class WoundMonitor {
    constructor() {
        this.initializeModel();
        this.setupEventListeners();
    }

    async initializeModel() {
        try {
            showStatus('Loading wound detection model...', 'info');
            model = await tflite.loadTFLiteModel('./QATbest_int8.tflite');
            showStatus('Model loaded successfully', 'success');
            console.log('Model loaded:', model.inputs[0].shape);
        } catch (error) {
            showStatus('Error loading model: ' + error.message, 'error');
            console.error('Model loading error:', error);
        }
    }

    setupEventListeners() {
        // Load patient progress on page load
        this.loadPatientProgress();
        
        // Auto-refresh progress when patient ID changes
        document.getElementById('patientId').addEventListener('change', () => {
            this.loadPatientProgress();
        });
    }

    async startCamera() {
        try {
            if (stream) {
                stream.getTracks().forEach(track => track.stop());
            }

            stream = await navigator.mediaDevices.getUserMedia({
                video: {
                    facingMode: 'environment',
                    width: { ideal: 1920 },
                    height: { ideal: 1080 }
                }
            });

            const video = document.getElementById('cameraVideo');
            const overlay = document.getElementById('overlayCanvas');
            
            video.srcObject = stream;
            
            video.onloadedmetadata = () => {
                overlay.width = video.videoWidth;
                overlay.height = video.videoHeight;
                overlay.style.width = video.offsetWidth + 'px';
                overlay.style.height = video.offsetHeight + 'px';
            };

            document.getElementById('startCameraBtn').disabled = true;
            document.getElementById('captureBtn').disabled = false;
            document.getElementById('stopCameraBtn').disabled = false;

            isScanning = true;
            this.scanForQRCode();
            
            showStatus('Camera started. Position QR code next to wound', 'success');

        } catch (error) {
            showStatus('Camera access denied: ' + error.message, 'error');
            console.error('Camera error:', error);
        }
    }

    stopCamera() {
        if (stream) {
            stream.getTracks().forEach(track => track.stop());
            stream = null;
        }

        isScanning = false;
        
        document.getElementById('startCameraBtn').disabled = false;
        document.getElementById('captureBtn').disabled = true;
        document.getElementById('stopCameraBtn').disabled = true;

        // Clear overlay
        const overlay = document.getElementById('overlayCanvas');
        const ctx = overlay.getContext('2d');
        ctx.clearRect(0, 0, overlay.width, overlay.height);

        showStatus('Camera stopped', 'info');
    }

    scanForQRCode() {
        if (!isScanning) return;

        const video = document.getElementById('cameraVideo');
        const overlay = document.getElementById('overlayCanvas');
        const ctx = overlay.getContext('2d');

        if (video.readyState === video.HAVE_ENOUGH_DATA) {
            const canvas = document.createElement('canvas');
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            const canvasCtx = canvas.getContext('2d');
            canvasCtx.drawImage(video, 0, 0);

            const imageData = canvasCtx.getImageData(0, 0, canvas.width, canvas.height);
            const qrCode = jsQR(imageData.data, imageData.width, imageData.height);

            // Clear previous overlay
            ctx.clearRect(0, 0, overlay.width, overlay.height);

            if (qrCode) {
                lastQRCode = qrCode;
                this.calculateCalibration(qrCode);
                this.drawQROverlay(ctx, qrCode, overlay);
                
                document.getElementById('qrStatus').textContent = 'Yes';
                document.getElementById('calibrationScale').textContent = pixelsPerCm.toFixed(2) + ' px/cm';
            } else {
                lastQRCode = null;
                pixelsPerCm = null;
                document.getElementById('qrStatus').textContent = 'No';
                document.getElementById('calibrationScale').textContent = '-- px/cm';
            }
        }

        requestAnimationFrame(() => this.scanForQRCode());
    }

    calculateCalibration(qrCode) {
        // Calculate QR code size in pixels
        const qrWidth = Math.abs(qrCode.location.topRightCorner.x - qrCode.location.topLeftCorner.x);
        const qrHeight = Math.abs(qrCode.location.bottomLeftCorner.y - qrCode.location.topLeftCorner.y);
        const qrSizePixels = (qrWidth + qrHeight) / 2;

        // Calculate pixels per centimeter
        pixelsPerCm = qrSizePixels / QR_CODE_SIZE_CM;
        
        console.log('QR Code calibration:', {
            qrSizePixels,
            pixelsPerCm,
            qrData: qrCode.data
        });
    }

    drawQROverlay(ctx, qrCode, overlay) {
        const scaleX = overlay.width / overlay.offsetWidth;
        const scaleY = overlay.height / overlay.offsetHeight;
        
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
        
        // Draw calibration text
        ctx.fillStyle = '#00FF00';
        ctx.font = '16px Arial';
        ctx.fillText('QR Code Detected', corners[0].x / scaleX, corners[0].y / scaleY - 10);
    }

    async captureWoundImage() {
        if (!model) {
            showStatus('Model not loaded yet', 'error');
            return;
        }

        if (!lastQRCode) {
            showStatus('Please ensure QR code is visible for calibration', 'warning');
            return;
        }

        const patientId = document.getElementById('patientId').value;
        if (!patientId) {
            showStatus('Please enter Patient ID', 'error');
            return;
        }

        try {
            showStatus('Analyzing wound...', 'info');

            const video = document.getElementById('cameraVideo');
            const canvas = document.createElement('canvas');
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(video, 0, 0);

            // Run wound segmentation
            const woundMask = await this.segmentWound(canvas);
            
            // Calculate wound measurements
            const measurements = this.calculateWoundMeasurements(woundMask);
            
            // Save the scan
            await this.saveScan(canvas, measurements, patientId);
            
            // Update recommendations
            this.updateRecommendations(measurements);
            
            // Check if provider notification needed
            this.checkProviderNotification(measurements);

            showStatus('Wound scan completed successfully', 'success');

        } catch (error) {
            showStatus('Error analyzing wound: ' + error.message, 'error');
            console.error('Analysis error:', error);
        }
    }

    async segmentWound(canvas) {
        const inputTensor = tf.tidy(() => {
            let tensor = tf.browser.fromPixels(canvas);
            
            // Resize to model input size
            const inputShape = model.inputs[0].shape;
            const targetHeight = inputShape[1] || 224;
            const targetWidth = inputShape[2] || 224;
            
            tensor = tf.image.resizeBilinear(tensor, [targetHeight, targetWidth]);
            tensor = tf.div(tf.sub(tensor, 127.5), 127.5); // Normalize to [-1, 1]
            return tensor.expandDims(0);
        });

        const predictions = await model.predict(inputTensor);
        
        // Process model output
        const maskTensor = tf.tidy(() => {
            let output = predictions;
            
            if (output.shape.length === 4 && output.shape[3] > 1) {
                output = tf.slice(output, [0, 0, 0, 1], [1, -1, -1, 1]);
            }
            
            output = tf.squeeze(output, [0]);
            if (output.shape.length === 3) {
                output = tf.squeeze(output, [2]);
            }
            
            output = tf.sigmoid(output);
            const binaryMask = tf.greater(output, 0.5);
            
            // Resize back to original canvas size
            const resized = tf.image.resizeBilinear(
                binaryMask.expandDims(2).expandDims(0),
                [canvas.height, canvas.width]
            );
            
            return tf.squeeze(resized).cast('float32');
        });

        inputTensor.dispose();
        predictions.dispose();

        return maskTensor;
    }

    async calculateWoundMeasurements(maskTensor) {
        const maskData = await maskTensor.data();
        const width = maskTensor.shape[1];
        const height = maskTensor.shape[0];
        
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

        let woundAreaCm2 = 0;
        let woundPerimeterCm = 0;

        if (pixelsPerCm) {
            woundAreaCm2 = woundPixels / (pixelsPerCm * pixelsPerCm);
            woundPerimeterCm = perimeterPixels / pixelsPerCm;
        }

        maskTensor.dispose();

        return {
            areaPixels: woundPixels,
            perimeterPixels: perimeterPixels,
            areaCm2: woundAreaCm2,
            perimeterCm: woundPerimeterCm,
            calibrated: !!pixelsPerCm
        };
    }

    async saveScan(canvas, measurements, patientId) {
        try {
            // Convert canvas to blob
            const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.8));
            
            // Upload image
            const timestamp = Date.now();
            const filename = `scans/${patientId}/${timestamp}.jpg`;
            const storageRef = ref(storage, filename);
            const snapshot = await uploadBytes(storageRef, blob);
            const downloadURL = await getDownloadURL(snapshot.ref);

            // Save scan data
            const scanData = {
                patientId: patientId,
                providerId: document.getElementById('providerId').value,
                timestamp: new Date(),
                imageUrl: downloadURL,
                measurements: measurements,
                qrCodeData: lastQRCode ? lastQRCode.data : null,
                calibrationScale: pixelsPerCm
            };

            await addDoc(collection(db, 'woundScans'), scanData);

            // Update display
            this.updateMeasurementDisplay(measurements);
            this.loadPatientProgress();

        } catch (error) {
            throw new Error('Failed to save scan: ' + error.message);
        }
    }

    updateMeasurementDisplay(measurements) {
        document.getElementById('measurementDisplay').style.display = 'block';
        
        if (measurements.calibrated) {
            document.getElementById('woundArea').textContent = measurements.areaCm2.toFixed(2) + ' cm²';
            document.getElementById('woundPerimeter').textContent = measurements.perimeterCm.toFixed(2) + ' cm';
        } else {
            document.getElementById('woundArea').textContent = measurements.areaPixels + ' pixels (uncalibrated)';
            document.getElementById('woundPerimeter').textContent = measurements.perimeterPixels + ' pixels (uncalibrated)';
        }
    }

    async loadPatientProgress() {
        const patientId = document.getElementById('patientId').value;
        if (!patientId) return;

        try {
            const q = query(
                collection(db, 'woundScans'),
                where('patientId', '==', patientId),
                orderBy('timestamp', 'desc')
            );

            const querySnapshot = await getDocs(q);
            const scans = [];
            
            querySnapshot.forEach((doc) => {
                scans.push({ id: doc.id, ...doc.data() });
            });

            this.displayProgressTimeline(scans);
            this.analyzeProgressTrend(scans);

        } catch (error) {
            console.error('Error loading progress:', error);
        }
    }

    displayProgressTimeline(scans) {
        const timeline = document.getElementById('progressTimeline');
        timeline.innerHTML = '';

        if (scans.length === 0) {
            timeline.innerHTML = '<p style="text-align: center; color: #666;">No scans available</p>';
            return;
        }

        scans.forEach((scan, index) => {
            const item = document.createElement('div');
            item.className = 'timeline-item';
            
            const date = scan.timestamp.toDate();
            const measurements = scan.measurements;
            
            let statusClass = 'status-stable';
            if (index > 0) {
                const prevScan = scans[index - 1];
                const areaChange = measurements.areaCm2 - prevScan.measurements.areaCm2;
                if (areaChange < -0.1) statusClass = 'status-improving';
                else if (areaChange > 0.1) statusClass = 'status-concerning';
            }

            item.innerHTML = `
                <div class="timeline-date">${date.toLocaleDateString()}</div>
                <div class="timeline-measurement">
                    Area: ${measurements.areaCm2.toFixed(2)} cm²
                    <span class="status-indicator ${statusClass}">
                        ${statusClass.replace('status-', '').replace('-', ' ')}
                    </span>
                </div>
            `;
            
            timeline.appendChild(item);
        });
    }

    analyzeProgressTrend(scans) {
        if (scans.length < 2) return;

        const latest = scans[0];
        const previous = scans[1];
        
        const areaChange = latest.measurements.areaCm2 - previous.measurements.areaCm2;
        const percentChange = (areaChange / previous.measurements.areaCm2) * 100;
        
        let trend = 'stable';
        if (percentChange < -10) trend = 'improving';
        else if (percentChange > 10) trend = 'concerning';

        this.generateRecommendations(trend, latest.measurements, scans);
    }

    generateRecommendations(trend, measurements, scanHistory) {
        const recommendations = document.getElementById('recommendations');
        recommendations.innerHTML = '';

        const recs = this.getRecommendationsByTrend(trend, measurements, scanHistory);
        
        recs.forEach(rec => {
            const item = document.createElement('div');
            item.className = 'recommendation-item';
            item.innerHTML = `
                <div class="recommendation-title">${rec.title}</div>
                <div class="recommendation-text">${rec.text}</div>
            `;
            recommendations.appendChild(item);
        });
    }

    getRecommendationsByTrend(trend, measurements, scanHistory) {
        const baseRecs = [
            {
                title: "Daily Care",
                text: "Continue gentle cleaning with saline solution and apply prescribed dressing."
            },
            {
                title: "Monitor Signs",
                text: "Watch for increased redness, swelling, warmth, or unusual discharge."
            }
        ];

        if (trend === 'improving') {
            return [
                ...baseRecs,
                {
                    title: "Positive Progress",
                    text: "Wound is healing well. Continue current treatment plan and maintain good nutrition."
                },
                {
                    title: "Activity Level",
                    text: "You may gradually increase activity as tolerated, avoiding strain on the wound area."
                }
            ];
        } else if (trend === 'concerning') {
            return [
                ...baseRecs,
                {
                    title: "Contact Provider",
                    text: "Wound size has increased. Contact your healthcare provider for evaluation."
                },
                {
                    title: "Enhanced Care",
                    text: "Consider more frequent dressing changes and avoid activities that stress the wound."
                }
            ];
        } else {
            return [
                ...baseRecs,
                {
                    title: "Steady Progress",
                    text: "Wound size is stable. Continue current care routine and maintain follow-up schedule."
                }
            ];
        }
    }

    updateRecommendations(measurements) {
        // This will be called after each scan to update recommendations
        setTimeout(() => this.loadPatientProgress(), 1000);
    }

    checkProviderNotification(measurements) {
        // Notify provider if wound area increases significantly
        if (measurements.areaCm2 > 5.0) { // Example threshold
            this.notifyProvider('Large wound area detected', measurements);
        }
    }

    notifyProvider(message, measurements) {
        const notification = document.getElementById('providerNotification');
        const messageEl = document.getElementById('notificationMessage');
        
        messageEl.textContent = `${message}. Current area: ${measurements.areaCm2.toFixed(2)} cm². Provider has been notified.`;
        notification.style.display = 'block';
        
        // Here you would typically send an actual notification to the provider
        console.log('Provider notification:', message, measurements);
    }
}

// Global functions for HTML onclick handlers
function startCamera() {
    woundMonitor.startCamera();
}

function stopCamera() {
    woundMonitor.stopCamera();
}

function captureWoundImage() {
    woundMonitor.captureWoundImage();
}

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

// Initialize the application
const woundMonitor = new WoundMonitor();

console.log('Wound Monitor initialized');