document.addEventListener('DOMContentLoaded', () => {
    const fileInput = document.getElementById('file-input');
    const uploadArea = document.querySelector('.upload-area');
    const conversionOptions = document.getElementById('conversion-options');
    const optionsGrid = document.querySelector('.options-grid');
    const previewArea = document.getElementById('preview-area');
    const downloadArea = document.querySelector('.download-area');
    const downloadBtn = document.getElementById('download-btn');
    const loadingIndicator = document.getElementById('loading-indicator');
    const loadingMessage = document.getElementById('loading-message');
    let currentFile = null;

    const { createFFmpeg, fetchFile } = FFmpeg;
    const ffmpeg = createFFmpeg({ log: true });

    resetUI(); // Ensure initial state is correct

    const conversionMap = {
        // Image formats
        'image/jpeg': ['PNG', 'WEBP', 'GIF'],
        'image/png': ['JPEG', 'WEBP', 'GIF'],
        'image/webp': ['JPEG', 'PNG', 'GIF'],
        'image/gif': ['JPEG', 'PNG', 'WEBP'],
        // Document formats
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['PDF'],
        // Audio formats
        'audio/mpeg': ['WAV', 'OGG'],
        'audio/wav': ['MP3', 'OGG'],
        'audio/ogg': ['MP3', 'WAV'],
    };

    uploadArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadArea.classList.add('dragover');
    });

    uploadArea.addEventListener('dragleave', () => {
        uploadArea.classList.remove('dragover');
    });

    uploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadArea.classList.remove('dragover');
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            fileInput.files = files;
            handleFileSelect(files[0]);
        }
    });

    fileInput.addEventListener('change', () => {
        if (fileInput.files.length > 0) {
            handleFileSelect(fileInput.files[0]);
        }
    });

    function handleFileSelect(file) {
        currentFile = file;
        resetUI();
        const fileType = file.type;
        const fileName = file.name;
        const fileExtension = fileName.split('.').pop().toLowerCase();

        let possibleConversions = [];

        if (conversionMap[fileType]) {
            possibleConversions = conversionMap[fileType];
        } else {
            if (['docx'].includes(fileExtension)) {
                possibleConversions = ['PDF'];
            }
        }

        if (possibleConversions.length > 0) {
            showPreview(file);
            displayConversionOptions(possibleConversions);
        } else {
            alert('File type not supported for conversion.');
            resetUI();
        }
    }

    function displayConversionOptions(options) {
        optionsGrid.innerHTML = '';
        options.forEach(option => {
            const button = document.createElement('button');
            button.className = 'option-btn';
            button.textContent = option;
            button.dataset.format = option.toLowerCase();
            optionsGrid.appendChild(button);
        });
        conversionOptions.classList.remove('hidden');
        conversionOptions.classList.add('visible');
    }

    function showPreview(file) {
        previewArea.innerHTML = '';
        previewArea.classList.remove('hidden');
        const fileType = file.type;

        if (fileType.startsWith('image/')) {
            const reader = new FileReader();
            reader.onload = (e) => {
                const img = document.createElement('img');
                img.src = e.target.result;
                previewArea.appendChild(img);
            };
            reader.readAsDataURL(file);
        } else if (fileType.startsWith('audio/')) {
            const audio = document.createElement('audio');
            audio.controls = true;
            audio.src = URL.createObjectURL(file);
            previewArea.appendChild(audio);
            uploadArea.classList.add('hidden');
        } else {
            const p = document.createElement('p');
            p.textContent = `File: ${file.name}`;
            previewArea.appendChild(p);
        }
    }

    optionsGrid.addEventListener('click', (e) => {
        if (e.target.classList.contains('option-btn')) {
            const format = e.target.dataset.format;
            if (currentFile) {
                convertFile(currentFile, format);
            }
        }
    });

    async function convertFile(file, format) {
        showLoading();
        const fileType = file.type;
        const fileExtension = file.name.split('.').pop().toLowerCase();

        try {
            if (fileType.startsWith('image/')) {
                await convertImage(file, format);
            } else if (['docx'].includes(fileExtension)) {
                if (format === 'pdf') {
                    await convertDocToPdf(file);
                }
            } else if (fileType.startsWith('audio/')) {
                await convertAudio(file, format);
            }
        } catch (error) {
            console.error('Conversion error:', error);
            alert('An error occurred during conversion.');
        } finally {
            hideLoading();
        }
    }

    function convertImage(file, format) {
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                const img = new Image();
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    canvas.width = img.width;
                    canvas.height = img.height;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0);
                    const dataUrl = canvas.toDataURL(`image/${format}`);
                    showDownloadLink(dataUrl, `converted.${format}`);
                    resolve();
                };
                img.src = e.target.result;
            };
            reader.readAsDataURL(file);
        });
    }

    async function convertDocToPdf(file) {
        const { PDFDocument, rgb } = PDFLib;
        const arrayBuffer = await file.arrayBuffer();

        const result = await mammoth.extractRawText({ arrayBuffer });
        const text = result.value;

        const pdfDoc = await PDFDocument.create();
        const page = pdfDoc.addPage();
        
        const { width, height } = page.getSize();
        const fontSize = 12;
        const margin = 50;

        page.drawText(text, {
            x: margin,
            y: height - 4 * fontSize,
            size: fontSize,
            color: rgb(0, 0, 0),
            maxWidth: width - 2 * margin,
            lineHeight: fontSize * 1.2,
        });

        const pdfBytes = await pdfDoc.save();
        const blob = new Blob([pdfBytes], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);
        showDownloadLink(url, 'converted.pdf');
    }

    async function convertAudio(file, format) {
        try {
            if (!ffmpeg.isLoaded()) {
                showLoading("Loading audio converter...");
                await ffmpeg.load();
            }
            showLoading("Converting audio...");
            const { name } = file;
            ffmpeg.FS('writeFile', name, await fetchFile(file));
            const outputFilename = `converted.${format}`;
            await ffmpeg.run('-i', name, outputFilename);
            const data = ffmpeg.FS('readFile', outputFilename);
            const url = URL.createObjectURL(new Blob([data.buffer], { type: `audio/${format}` }));
            showDownloadLink(url, outputFilename);
        } catch (error) {
            console.error("Audio conversion error:", error);
            alert(`An error occurred during audio conversion: ${error.message}`);
        }
    }

    function showDownloadLink(url, fileName) {
        downloadBtn.onclick = () => {
            const a = document.createElement('a');
            a.href = url;
            a.download = fileName;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            if (url.startsWith('blob:')) {
                URL.revokeObjectURL(url);
            }
        };
        downloadArea.classList.remove('hidden');
    }

    function showLoading(message = "Converting, please wait...") {
        loadingMessage.textContent = message;
        loadingIndicator.style.display = 'flex';
    }

    function hideLoading() {
        loadingIndicator.style.display = 'none';
    }

    function resetUI() {
        conversionOptions.classList.add('hidden');
        conversionOptions.classList.remove('visible');
        downloadArea.classList.add('hidden');
        previewArea.classList.add('hidden');
        previewArea.innerHTML = '';
        uploadArea.classList.remove('hidden');
        fileInput.value = '';
    }
});
