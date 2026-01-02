document.addEventListener('DOMContentLoaded', () => {
    
    // --- Mobile Menu Toggle ---
    const mobileMenuBtn = document.querySelector('.mobile-menu-btn');
    const mobileMenuOverlay = document.querySelector('.mobile-menu-overlay');
    const mobileLinks = document.querySelectorAll('.mobile-nav-links a');

    if(mobileMenuBtn) {
        mobileMenuBtn.addEventListener('click', () => {
            const isVisible = mobileMenuOverlay.style.display === 'block';
            mobileMenuOverlay.style.display = isVisible ? 'none' : 'block';
            mobileMenuBtn.innerHTML = isVisible 
                ? '<span class="bar"></span><span class="bar"></span><span class="bar"></span>' 
                : '<span style="font-size:2rem; line-height:1;">&times;</span>';
        });

        // Close menu when clicking a link
        mobileLinks.forEach(link => {
            link.addEventListener('click', () => {
                mobileMenuOverlay.style.display = 'none';
                mobileMenuBtn.innerHTML = '<span class="bar"></span><span class="bar"></span><span class="bar"></span>';
            });
        });
    }

    // --- API & State Management ---
    const USER_ID = 'DObRu1vyStbUynoQmTcHBlhs55z2';
    const EFFECT_ID = 'photoToVectorArt'; // Configured effect ID
    let currentUploadedUrl = null;

    // --- DOM Elements ---
    const dropZone = document.getElementById('upload-zone');
    const fileInput = document.getElementById('file-input');
    const previewImg = document.getElementById('preview-image');
    const uploadContent = document.querySelector('.upload-content');
    const resetBtn = document.getElementById('reset-btn');
    const generateBtn = document.getElementById('generate-btn');
    const loadingIndicator = document.getElementById('loading-indicator');
    const resultContainer = document.getElementById('result-container');
    const resultImage = document.getElementById('result-image');
    const downloadBtn = document.getElementById('download-btn');

    // --- Required Functions ---

    // Generate nanoid for unique filename
    function generateNanoId(length = 21) {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        let result = '';
        for (let i = 0; i < length; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return result;
    }

    // Upload file to CDN storage (called immediately when file is selected)
    async function uploadFile(file) {
        const fileExtension = file.name.split('.').pop() || 'jpg';
        const uniqueId = generateNanoId();
        // Filename is just nanoid.extension (no media/ prefix)
        const fileName = uniqueId + '.' + fileExtension;
        
        // Step 1: Get signed URL from API
        const signedUrlResponse = await fetch(
            'https://api.chromastudio.ai/get-emd-upload-url?fileName=' + encodeURIComponent(fileName),
            { method: 'GET' }
        );
        
        if (!signedUrlResponse.ok) {
            throw new Error('Failed to get signed URL: ' + signedUrlResponse.statusText);
        }
        
        const signedUrl = await signedUrlResponse.text();
        console.log('Got signed URL');
        
        // Step 2: PUT file to signed URL
        const uploadResponse = await fetch(signedUrl, {
            method: 'PUT',
            body: file,
            headers: {
                'Content-Type': file.type
            }
        });
        
        if (!uploadResponse.ok) {
            throw new Error('Failed to upload file: ' + uploadResponse.statusText);
        }
        
        // Step 3: Return download URL
        const downloadUrl = 'https://contents.maxstudio.ai/' + fileName;
        console.log('Uploaded to:', downloadUrl);
        return downloadUrl;
    }

    // Submit generation job
    async function submitImageGenJob(imageUrl) {
        // Image API Payload
        const body = {
            model: 'image-effects',
            toolType: 'image-effects',
            effectId: EFFECT_ID,
            imageUrl: imageUrl,
            userId: USER_ID,
            removeWatermark: true,
            isPrivate: true
        };

        const response = await fetch('https://api.chromastudio.ai/image-gen', {
            method: 'POST',
            headers: {
                'Accept': 'application/json, text/plain, */*',
                'Content-Type': 'application/json',
                'sec-ch-ua-platform': '"Windows"',
                'sec-ch-ua-mobile': '?0'
            },
            body: JSON.stringify(body)
        });
        
        if (!response.ok) {
            throw new Error('Failed to submit job: ' + response.statusText);
        }
        
        const data = await response.json();
        console.log('Job submitted:', data.jobId);
        return data;
    }

    // Poll job status until completed or failed
    async function pollJobStatus(jobId) {
        const POLL_INTERVAL = 2000; // 2 seconds
        const MAX_POLLS = 60; // Max 2 minutes
        let polls = 0;
        
        while (polls < MAX_POLLS) {
            const response = await fetch(
                `https://api.chromastudio.ai/image-gen/${USER_ID}/${jobId}/status`,
                {
                    method: 'GET',
                    headers: { 'Accept': 'application/json, text/plain, */*' }
                }
            );
            
            if (!response.ok) throw new Error('Failed to check status: ' + response.statusText);
            
            const data = await response.json();
            console.log('Poll', polls + 1, '- Status:', data.status);
            
            if (data.status === 'completed') {
                return data;
            }
            
            if (data.status === 'failed' || data.status === 'error') {
                throw new Error(data.error || 'Job processing failed');
            }
            
            // Update UI with progress
            updateStatus('PROCESSING... (' + (polls + 1) + ')');
            
            // Wait before next poll
            await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL));
            polls++;
        }
        
        throw new Error('Job timed out');
    }

    // --- UI Helper Functions ---

    function showLoading() {
        if(loadingIndicator) loadingIndicator.classList.remove('hidden');
        if(resultContainer) resultContainer.classList.add('loading'); // Optional class for styling
    }

    function hideLoading() {
        if(loadingIndicator) loadingIndicator.classList.add('hidden');
        if(resultContainer) resultContainer.classList.remove('loading');
    }

    function updateStatus(text) {
        // Update button text to reflect status
        if(generateBtn) {
            if (text === 'READY') {
                generateBtn.textContent = 'Generate Vector Art';
                generateBtn.disabled = false;
            } else if (text === 'COMPLETE') {
                generateBtn.textContent = 'Generate Again';
                generateBtn.disabled = false;
            } else if (text.includes('PROCESSING') || text.includes('UPLOADING') || text.includes('SUBMITTING') || text.includes('QUEUED')) {
                generateBtn.textContent = text;
                generateBtn.disabled = true;
            }
        }
    }

    function showError(msg) {
        alert('Error: ' + msg);
        updateStatus('READY');
    }

    function showPreview(url) {
        if(previewImg) {
            previewImg.src = url;
            previewImg.classList.remove('hidden');
        }
        if(uploadContent) uploadContent.classList.add('hidden');
        if(resetBtn) resetBtn.classList.remove('hidden');
        // Hide result container when new file is uploaded
        if(resultContainer) resultContainer.classList.add('hidden');
    }

    function showResultMedia(url) {
        if(resultContainer) resultContainer.classList.remove('hidden');
        
        // Handle Video vs Image
        const isVideo = url.toLowerCase().match(/\.(mp4|webm)(\?.*)?$/i);
        
        if (isVideo) {
            // Hide image
            if (resultImage) resultImage.style.display = 'none';
            
            // Create/Show video
            let video = document.getElementById('result-video');
            if (!video) {
                video = document.createElement('video');
                video.id = 'result-video';
                video.controls = true;
                video.autoplay = true;
                video.loop = true;
                video.className = resultImage ? resultImage.className : 'w-full h-auto rounded-lg';
                // Insert video before the image in DOM
                if(resultImage && resultImage.parentNode) {
                    resultImage.parentNode.insertBefore(video, resultImage);
                }
            }
            video.src = url;
            video.style.display = 'block';
        } else {
            // Hide video
            const video = document.getElementById('result-video');
            if (video) video.style.display = 'none';
            
            // Show image
            if (resultImage) {
                resultImage.style.display = 'block';
                // Add timestamp to prevent caching issues if URL is same
                resultImage.src = url + '?t=' + new Date().getTime();
            }
        }

        // Scroll to result
        resultContainer.scrollIntoView({ behavior: 'smooth' });
    }

    // --- Main Logic Handlers ---

    async function handleFileSelect(file) {
        if(!file) return;

        // Basic validation
        if (!file.type.startsWith('image/')) {
            alert('Please upload an image file.');
            return;
        }

        try {
            showLoading();
            updateStatus('UPLOADING...');
            
            // 1. Upload immediately
            const uploadedUrl = await uploadFile(file);
            currentUploadedUrl = uploadedUrl;
            
            // 2. Show preview
            showPreview(uploadedUrl);
            
            updateStatus('READY');
            hideLoading();
            
        } catch (error) {
            hideLoading();
            updateStatus('ERROR');
            showError(error.message);
        }
    }

    async function handleGenerate() {
        if (!currentUploadedUrl) return;
        
        try {
            showLoading();
            updateStatus('SUBMITTING JOB...');
            
            // 1. Submit Job
            const jobData = await submitImageGenJob(currentUploadedUrl);
            updateStatus('JOB QUEUED...');
            
            // 2. Poll for Completion
            const result = await pollJobStatus(jobData.jobId);
            
            // 3. Extract Result URL
            const resultItem = Array.isArray(result.result) ? result.result[0] : result.result;
            const resultUrl = resultItem?.mediaUrl || resultItem?.video || resultItem?.image;
            
            if (!resultUrl) throw new Error('No result URL found in response');
            
            console.log('Result URL:', resultUrl);
            
            // 4. Show Result
            showResultMedia(resultUrl);
            
            // 5. Update Download Button
            if (downloadBtn) {
                downloadBtn.dataset.url = resultUrl;
            }
            
            updateStatus('COMPLETE');
            hideLoading();
            
        } catch (error) {
            hideLoading();
            updateStatus('ERROR');
            showError(error.message);
        }
    }

    // --- Wiring Event Listeners ---

    if(dropZone) {
        // Drag & Drop Handlers
        dropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            dropZone.classList.add('dragover');
        });

        dropZone.addEventListener('dragleave', () => {
            dropZone.classList.remove('dragover');
        });

        dropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropZone.classList.remove('dragover');
            if (e.dataTransfer.files.length) {
                handleFileSelect(e.dataTransfer.files[0]);
            }
        });

        // Click to Upload (only if content is visible, to avoid conflict with reset)
        dropZone.addEventListener('click', (e) => {
            // Ensure we don't trigger if reset button is clicked
            if(e.target !== resetBtn && !uploadContent.classList.contains('hidden')) {
                fileInput.click();
            }
        });

        // File Input Change
        fileInput.addEventListener('change', (e) => {
            if (fileInput.files.length) {
                handleFileSelect(fileInput.files[0]);
            }
        });

        // Reset Handler
        resetBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            // Clear state
            currentUploadedUrl = null;
            fileInput.value = '';
            
            // Reset UI
            if(previewImg) {
                previewImg.src = '';
                previewImg.classList.add('hidden');
            }
            if(resetBtn) resetBtn.classList.add('hidden');
            if(uploadContent) uploadContent.classList.remove('hidden');
            
            if(generateBtn) {
                generateBtn.disabled = true;
                generateBtn.textContent = 'Generate Vector Art';
            }
            
            if(resultContainer) resultContainer.classList.add('hidden');
            
            // Hide potential video element
            const vid = document.getElementById('result-video');
            if(vid) vid.style.display = 'none';
        });

        // Generate Handler
        generateBtn.addEventListener('click', handleGenerate);

        // Download Handler (Robust)
        downloadBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            e.stopPropagation();
            const url = downloadBtn.dataset.url;
            if (!url) return;
            
            const originalText = downloadBtn.textContent;
            downloadBtn.textContent = 'Downloading...';
            downloadBtn.disabled = true;
            
            function downloadBlob(blob, filename) {
                const blobUrl = URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = blobUrl;
                link.download = filename;
                link.style.display = 'none';
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
            }
            
            function getExtension(url, contentType) {
                if (contentType) {
                    if (contentType.includes('jpeg') || contentType.includes('jpg')) return 'jpg';
                    if (contentType.includes('png')) return 'png';
                    if (contentType.includes('svg')) return 'svg';
                    if (contentType.includes('webp')) return 'webp';
                }
                const match = url.match(/\.(jpe?g|png|webp|svg)/i);
                return match ? match[1].toLowerCase().replace('jpeg', 'jpg') : 'png';
            }
            
            try {
                // Strategy 1: Proxy Download
                const proxyUrl = 'https://api.chromastudio.ai/download-proxy?url=' + encodeURIComponent(url);
                const response = await fetch(proxyUrl);
                if (!response.ok) throw new Error('Proxy failed');
                
                const blob = await response.blob();
                const ext = getExtension(url, response.headers.get('content-type'));
                downloadBlob(blob, 'vector_art_' + generateNanoId(8) + '.' + ext);
                
            } catch (proxyErr) {
                console.warn('Proxy failed, trying direct:', proxyErr);
                try {
                    // Strategy 2: Direct Fetch
                    const fetchUrl = url + (url.includes('?') ? '&' : '?') + 't=' + Date.now();
                    const response = await fetch(fetchUrl, { mode: 'cors' });
                    if (!response.ok) throw new Error('Direct fetch failed');
                    
                    const blob = await response.blob();
                    const ext = getExtension(url, response.headers.get('content-type'));
                    downloadBlob(blob, 'vector_art_' + generateNanoId(8) + '.' + ext);
                    
                } catch (fetchErr) {
                    // Strategy 3: Fallback Alert
                    alert('Download failed due to browser security restrictions. Please right-click the result image and select "Save Image As".');
                }
            } finally {
                downloadBtn.textContent = originalText;
                downloadBtn.disabled = false;
            }
        });
    }

    // --- FAQ Accordion ---
    const faqButtons = document.querySelectorAll('.faq-question');
    
    faqButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const answer = btn.nextElementSibling;
            const icon = btn.querySelector('.toggle-icon');
            
            // Close others
            document.querySelectorAll('.faq-answer').forEach(item => {
                if(item !== answer) {
                    item.style.maxHeight = null;
                    item.classList.remove('active');
                    item.previousElementSibling.querySelector('.toggle-icon').textContent = '+';
                }
            });

            // Toggle current
            if (answer.classList.contains('active')) {
                answer.style.maxHeight = null;
                answer.classList.remove('active');
                icon.textContent = '+';
            } else {
                answer.classList.add('active');
                answer.style.maxHeight = answer.scrollHeight + "px";
                icon.textContent = '-';
            }
        });
    });

    // --- Modals ---
    const privacyModal = document.getElementById('privacy-modal');
    const termsModal = document.getElementById('terms-modal');
    const privacyLink = document.getElementById('link-privacy');
    const termsLink = document.getElementById('link-terms');
    const closeButtons = document.querySelectorAll('.modal-close');

    function openModal(modal) {
        modal.style.display = 'block';
        document.body.style.overflow = 'hidden'; // Prevent background scrolling
    }

    function closeModal(modal) {
        modal.style.display = 'none';
        document.body.style.overflow = 'auto';
    }

    if(privacyLink) privacyLink.onclick = (e) => { e.preventDefault(); openModal(privacyModal); }
    if(termsLink) termsLink.onclick = (e) => { e.preventDefault(); openModal(termsModal); }

    closeButtons.forEach(btn => {
        btn.onclick = function() {
            closeModal(this.closest('.modal'));
        }
    });

    window.onclick = function(event) {
        if (event.target == privacyModal) closeModal(privacyModal);
        if (event.target == termsModal) closeModal(termsModal);
    }
});