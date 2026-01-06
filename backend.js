// backend.js (FINAL WORKING VERSION)

const express = require('express');
const multer = require('multer');
const CryptoJS = require('crypto-js');
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process'); // Use child_process
const app = express();
const port = 3000;

// --- CORS Middleware ---
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    next();
});

const upload = multer({ dest: 'uploads/' });
const mockDatabase = {}; 

// --- ROBUST REGEX Definitions ---
const nameRegex = /([A-Za-z\s.,'-]+?)\sS\/O/i; 
const fatherNameRegex = /S\/O\s*:\s*([A-Za-z\s.,'-]+?),/i; 
const dobRegex = /(DOB|D O B|Date of Birth|YOB):?\s*(\d{2}\/\d{2}\/\d{4}|\d{4})/i; 
const idNumberRegex = /(\d{4}\s\d{4}\s\d{4})/; 
const addressRegex = /([\d\s\w\W,.'-]+?)(PIN Code|PIN)\s*:\s*(\d{6})/i; 
// ----------------------------------------------------------------------


// --- Route 1: PDF Upload and Data Extraction (POST) ---
app.post('/api/extract-aadhaar', upload.single('aadhaarFile'), async (req, res) => {
    const { email, password } = req.body;
    const filePath = req.file ? req.file.path : null;
    
    console.log(`--- NEW UPLOAD (child_process) ---`);
    console.log(`Received Email: ${email}`);
    
    if (!email || !password || !req.file) {
        if (filePath) fs.unlinkSync(filePath);
        return res.status(400).json({ success: false, message: 'Missing email, password, or file.' });
    }

    const textOutputPath = path.join('uploads', `${req.file.filename}.txt`);

    try {
        // 1. Process PDF using child_process (Using Absolute Path)
        await new Promise((resolve, reject) => {
            const args = [
                '-upw', password,    // User password (for decryption)
                '-enc', 'UTF-8',     // Output encoding
                filePath,            // Input PDF file
                textOutputPath       // Output text file
            ];

            // !!! CRITICAL FIX: YOU MUST ENSURE THIS PATH IS 100% CORRECT !!!
            // Double-check the path to your pdftotext.exe
            execFile('C:\\poppler-bin\\poppler-25.07.0\\Library\\bin\\pdftotext.exe', args, (error, stdout, stderr) => {
                if (error) {
                    if (stderr && stderr.includes('Incorrect password')) {
                        return reject(new Error('Incorrect password provided.'));
                    }
                    // This error is usually "File Not Found" (ENOENT)
                    return reject(error);
                }
                resolve();
            });
        });
        
        // 2. Read the extracted text
        const rawText = fs.readFileSync(textOutputPath, { encoding: 'utf8' });
        
        // --- AADHAAR DATA EXTRACTION LOGIC ---
        const normalizedText = rawText.replace(/\s+/g, ' '); 
        
        // Perform Regex Matches (Skipping detailed regex logic for brevity)
        const nameMatch = normalizedText.match(nameRegex);
        const fatherNameMatch = normalizedText.match(fatherNameRegex);
        const dobMatch = normalizedText.match(dobRegex);
        const idNumberMatch = normalizedText.match(idNumberRegex);
        const addressMatch = normalizedText.match(addressRegex);
        
        const extractedData = {
            name: nameMatch ? nameMatch[1].trim() : "Extraction Failed: Name", 
            fatherName: fatherNameMatch ? fatherNameMatch[1].trim() : "Extraction Failed: Father's Name", 
            address: addressMatch ? addressMatch[1].trim() + " " + addressMatch[3].trim() : "Extraction Failed: Address", 
            dob: dobMatch ? dobMatch[2].trim() : "Extraction Failed: DOB", 
            idNumber: idNumberMatch ? idNumberMatch[1].replace(/\s/g, "") : "Extraction Failed: Aadhaar ID", 
            email: email 
        };
        
        // 3. Encrypt Data
        const dataString = JSON.stringify(extractedData);
        const encryptedData = CryptoJS.AES.encrypt(dataString, password).toString();
        const decryptionHash = CryptoJS.SHA256(password).toString();

        // 4. Save to Mock Database
        mockDatabase[email] = {
            encryptedAadhaarData: encryptedData,
            decryptionHash: decryptionHash,
            idNumber: extractedData.idNumber,
            timestamp: new Date().toISOString()
        };
        
        // 5. Respond success to the frontend (THIS TRIGGERS REDIRECTION)
        res.status(200).json({ 
            success: true, 
            message: 'Data extracted, encrypted, and saved.',
            userEmail: email 
        });

    } catch (error) {
        console.error("PDF Processing Error (child_process):", error.message);
        
        let errorMessage = 'Decryption failed. Please double-check your password or use a valid Aadhaar PDF.';
        if (error.message.includes('Incorrect password')) {
             errorMessage = 'Incorrect password provided.';
        } else if (error.message.includes('ENOENT')) {
             errorMessage = 'pdftotext.exe not found. Check the absolute path in backend.js.';
        }
        
        res.status(500).json({ success: false, message: `Failed to process PDF: ${errorMessage}` });

    } finally {
        // 6. Clean up the temporary files
        if (filePath && fs.existsSync(filePath)) fs.unlinkSync(filePath); 
        if (fs.existsSync(textOutputPath)) fs.unlinkSync(textOutputPath);
    }
});


// --- Route 2: Fetch Encrypted Data (GET) ---
app.get('/api/fetch-encrypted-data', async (req, res) => {
    const email = req.query.email;
    // ... (rest of the code for fetching data remains the same)
    const record = mockDatabase[email];
    if (!record) {
        return res.status(404).json({ success: false, message: 'Record not found. Please upload the PDF first in this session.' });
    }
    res.status(200).json({ 
        success: true, 
        data: {
            encryptedAadhaarData: record.encryptedAadhaarData,
            decryptionHash: record.decryptionHash 
        }
    });
});


app.listen(port, () => {
    console.log(`Backend server listening at http://localhost:${port}`);
});