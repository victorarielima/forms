import type { Express } from "express";
import express from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertFeedbackSchema } from "@shared/schema";
import multer from "multer";
import path from "path";
import fs from "fs";
import FormData from "form-data";

// Configure multer for file uploads
const uploadDir = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const upload = multer({
  dest: uploadDir,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|mp4|avi|mov|wmv/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Tipo de arquivo não permitido. Use apenas imagens ou vídeos.'));
    }
  }
});

export async function registerRoutes(app: Express): Promise<Server> {
  // Webhook debug endpoint
  app.all("/api/webhook-debug/:method", (req, res) => {
    console.log('=== WEBHOOK DEBUG ENDPOINT ===');
    console.log('Method:', req.method);
    console.log('Params:', req.params);
    console.log('Query:', req.query);
    console.log('Headers:', req.headers);
    console.log('Body:', req.body);
    console.log('Files:', req.files);
    
    res.json({
      success: true,
      message: 'Debug endpoint received data',
      data: {
        method: req.method,
        params: req.params,
        query: req.query,
        headers: req.headers,
        body: req.body,
        files: req.files,
        timestamp: new Date().toISOString()
      }
    });
  });

  // Test webhook endpoint for local testing
  app.post("/api/test-webhook", upload.any(), (req, res) => {
    console.log('=== TEST WEBHOOK RECEIVED ===');
    console.log('Body:', req.body);
    console.log('Files:', req.files);
    if (Array.isArray(req.files)) {
      req.files.forEach((file, index) => {
        console.log(`File ${index}:`, {
          fieldname: file.fieldname,
          originalname: file.originalname,
          mimetype: file.mimetype,
          size: file.size
        });
      });
    }
    res.json({ 
      success: true, 
      message: 'Dados recebidos com sucesso!',
      data: req.body,
      files: req.files?.length || 0
    });
  });

  // Submit feedback endpoint
  app.post("/api/feedback", upload.any(), async (req, res) => {
    try {
      console.log('=== FEEDBACK SUBMISSION DEBUG ===');
      console.log('Request body:', req.body);
      console.log('Request files:', req.files);
      console.log('Request headers:', req.headers);
      
      const { companyName, description, impactLevel, feedbackType } = req.body;
      
      console.log('Extracted fields:', {
        companyName,
        description,
        impactLevel,
        feedbackType
      });
      
      // Validate required fields
      const validationResult = insertFeedbackSchema.safeParse({
        companyName,
        description: description || undefined,
        impactLevel: impactLevel || undefined,
        feedbackType,
        fileName: Array.isArray(req.files) && req.files.length > 0 ? req.files[0].originalname : undefined,
        fileUrl: Array.isArray(req.files) && req.files.length > 0 ? req.files[0].filename : undefined,
      });

      if (!validationResult.success) {
        console.log('Validation failed:', validationResult.error.errors);
        return res.status(400).json({
          message: "Dados inválidos",
          errors: validationResult.error.errors
        });
      }

      console.log('Validation passed, storing feedback...');
      // Store feedback locally
      const feedback = await storage.createFeedback(validationResult.data);
      console.log('Feedback stored locally:', feedback);

      // Prepare data for webhook using form-data
      const formData = new FormData();
      formData.append('companyName', companyName);
      if (description) formData.append('description', description);
      if (impactLevel) formData.append('impactLevel', impactLevel);
      formData.append('feedbackType', feedbackType);
      
      if (Array.isArray(req.files) && req.files.length > 0) {
        console.log('Processing files for webhook...');
        req.files.forEach((file, index) => {
          console.log(`File ${index}:`, {
            path: file.path,
            originalname: file.originalname,
            mimetype: file.mimetype,
            size: file.size,
            exists: fs.existsSync(file.path)
          });
          
          if (fs.existsSync(file.path)) {
            formData.append('files', fs.createReadStream(file.path), {
              filename: file.originalname,
              contentType: file.mimetype,
            });
          } else {
            console.error(`File does not exist: ${file.path}`);
          }
        });
      }

      console.log('Enviando dados para webhook:', {
        companyName,
        description,
        impactLevel,
        feedbackType,
        filesCount: Array.isArray(req.files) ? req.files.length : 0
      });

      // Send to webhook - try both endpoints with multiple methods
      try {
        let webhookSuccess = false;
        console.log('Attempting to send to webhook with multiple approaches...');
        
        // Function to make fetch-based POST request
        const sendFetchRequest = async (url: string, formData: FormData): Promise<any> => {
          try {
            const response = await fetch(url, {
              method: 'POST',
              body: formData as any,
              headers: {
                ...formData.getHeaders(),
                'User-Agent': 'AutoForm-Webhook/1.0',
              },
            });

            let responseText = '';
            try {
              responseText = await response.text();
            } catch (e) {
              responseText = 'Could not read response';
            }

            return {
              ok: response.ok,
              status: response.status,
              statusText: response.statusText,
              body: responseText,
              headers: Object.fromEntries(response.headers.entries())
            };
          } catch (error) {
            console.error(`Fetch request failed for ${url}:`, error);
            return {
              ok: false,
              status: 0,
              error: error instanceof Error ? error.message : 'Unknown error'
            };
          }
        };

        // Function to make form-data submit request
        const sendFormDataRequest = (url: string, formData: FormData): Promise<any> => {
          return new Promise((resolve, reject) => {
            const request = formData.submit(url, (err, res) => {
              if (err) {
                reject(err);
                return;
              }
              
              let responseData = '';
              res.on('data', (chunk) => {
                responseData += chunk;
              });
              
              res.on('end', () => {
                resolve({
                  status: res.statusCode || 0,
                  statusText: res.statusMessage || '',
                  headers: res.headers,
                  body: responseData,
                  ok: (res.statusCode || 0) >= 200 && (res.statusCode || 0) < 300
                });
              });
              
              res.on('error', (error) => {
                reject(error);
              });
            });
            
            request.on('error', (error) => {
              reject(error);
            });
          });
        };

        const webhookUrls = [
          'https://ai.brasengconsultoria.com.br/webhook/c91109c3-fd7c-4fc7-9d58-8e4c7d6e0e2c',
          'https://ai.brasengconsultoria.com.br/webhook-test/c91109c3-fd7c-4fc7-9d58-8e4c7d6e0e2c'
        ];

        // Try each webhook URL with different methods
        for (let i = 0; i < webhookUrls.length && !webhookSuccess; i++) {
          const url = webhookUrls[i];
          const urlType = i === 0 ? 'PRODUCTION' : 'TEST';
          
          console.log(`🔄 Trying ${urlType} webhook: ${url}`);

          // Method 1: Try with fetch + FormData
          console.log(`  Method 1: fetch with FormData`);
          try {
            const fetchResult = await sendFetchRequest(url, formData);
            console.log(`  ${urlType} fetch result:`, {
              status: fetchResult.status,
              ok: fetchResult.ok,
              body: fetchResult.body?.substring(0, 200) // First 200 chars
            });

            if (fetchResult.ok) {
              console.log(`✅ SUCCESS with ${urlType} webhook using fetch!`);
              webhookSuccess = true;
              break;
            }
          } catch (fetchError) {
            console.error(`  ${urlType} fetch failed:`, fetchError);
          }

          // Method 2: Try with form-data submit
          if (!webhookSuccess) {
            console.log(`  Method 2: form-data submit`);
            
            // Create fresh FormData for form-data submit
            const freshFormData = new FormData();
            freshFormData.append('companyName', companyName);
            if (description) freshFormData.append('description', description);
            if (impactLevel) freshFormData.append('impactLevel', impactLevel);
            freshFormData.append('feedbackType', feedbackType);
            
            if (Array.isArray(req.files) && req.files.length > 0) {
              req.files.forEach((file, index) => {
                if (fs.existsSync(file.path)) {
                  freshFormData.append('files', fs.createReadStream(file.path), {
                    filename: file.originalname,
                    contentType: file.mimetype,
                  });
                }
              });
            }

            try {
              const formDataResult = await sendFormDataRequest(url, freshFormData);
              console.log(`  ${urlType} form-data result:`, {
                status: formDataResult.status,
                ok: formDataResult.ok,
                body: formDataResult.body?.substring(0, 200)
              });

              if (formDataResult.ok) {
                console.log(`✅ SUCCESS with ${urlType} webhook using form-data!`);
                webhookSuccess = true;
                break;
              }
            } catch (formDataError) {
              console.error(`  ${urlType} form-data failed:`, formDataError);
            }
          }

          // Method 3: Try with JSON payload (no files, but URLs to files)
          if (!webhookSuccess) {
            console.log(`  Method 3: JSON payload`);
            try {
              const jsonData = {
                companyName,
                description: description || '',
                impactLevel: impactLevel || '',
                feedbackType,
                timestamp: new Date().toISOString(),
                source: 'AutoForm-Webhook',
                hasFiles: Array.isArray(req.files) && req.files.length > 0,
                fileCount: Array.isArray(req.files) ? req.files.length : 0,
                files: Array.isArray(req.files) ? req.files.map(file => ({
                  originalName: file.originalname,
                  size: file.size,
                  type: file.mimetype,
                  url: `${req.protocol}://${req.get('host')}/uploads/${file.filename}`
                })) : []
              };

              const jsonResponse = await fetch(url, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'User-Agent': 'AutoForm-Webhook/1.0',
                },
                body: JSON.stringify(jsonData),
              });

              const jsonResponseText = await jsonResponse.text().catch(() => 'Could not read JSON response');
              console.log(`  ${urlType} JSON result:`, {
                status: jsonResponse.status,
                ok: jsonResponse.ok,
                body: jsonResponseText.substring(0, 200)
              });

              if (jsonResponse.ok) {
                console.log(`✅ SUCCESS with ${urlType} webhook using JSON!`);
                webhookSuccess = true;
                break;
              }
            } catch (jsonError) {
              console.error(`  ${urlType} JSON failed:`, jsonError);
            }
          }
        }

        // Final fallback: GET method to test endpoint only
        if (!webhookSuccess) {
          console.log('🔄 Final fallback: GET method to test endpoint');
          const params = new URLSearchParams();
          params.append('companyName', companyName);
          if (description) params.append('description', description);
          if (impactLevel) params.append('impactLevel', impactLevel);
          params.append('feedbackType', feedbackType);
          params.append('timestamp', new Date().toISOString());
          params.append('source', 'AutoForm-Webhook-GET-Fallback');
          
          // Add file information if files exist
          if (Array.isArray(req.files) && req.files.length > 0) {
            const fileNames = req.files.map(file => file.originalname).join(', ');
            const fileUrls = req.files.map(file => `${req.protocol}://${req.get('host')}/uploads/${file.filename}`).join('|');
            params.append('hasFiles', 'true');
            params.append('fileCount', req.files.length.toString());
            params.append('fileNames', fileNames);
            params.append('fileUrls', fileUrls);
            console.log(`📎 ${req.files.length} files - URLs: ${fileUrls}`);
          } else {
            params.append('hasFiles', 'false');
            params.append('fileCount', '0');
          }
          
          const getUrl = `https://ai.brasengconsultoria.com.br/webhook-test/c91109c3-fd7c-4fc7-9d58-8e4c7d6e0e2c?${params.toString()}`;
          
          try {
            const getResponse = await fetch(getUrl, {
              method: 'GET',
              headers: {
                'User-Agent': 'AutoForm-Webhook/1.0',
              }
            });

            const getResponseText = await getResponse.text().catch(() => 'Could not read GET response');
            console.log('GET fallback result:', {
              status: getResponse.status,
              ok: getResponse.ok,
              body: getResponseText.substring(0, 200)
            });
            
            if (getResponse.ok) {
              console.log('✅ SUCCESS with GET fallback (files accessible via URLs)!');
              webhookSuccess = true;
            }
          } catch (getError) {
            console.error('GET fallback failed:', getError);
          }
        }

        if (webhookSuccess) {
          console.log('🎉 Webhook delivered successfully using one of the methods!');
        } else {
          console.log('❌ All webhook delivery methods failed for both endpoints');
        }
        
      } catch (webhookError) {
        console.error('❌ General webhook error:', webhookError);
      }

      console.log('✅ Returning success response to client');
      res.json({
        message: "Feedback enviado com sucesso!",
        data: feedback
      });

    } catch (error) {
      console.error('❌ Feedback submission error:', error);
      res.status(500).json({
        message: error instanceof Error ? error.message : "Erro interno do servidor"
      });
    }
  });

  // Serve uploaded files
  app.use('/uploads', express.static(uploadDir));

  // Endpoint to get file metadata (useful for webhook integration)
  app.get('/api/file-info/:filename', (req, res) => {
    const filename = req.params.filename;
    const filePath = path.join(uploadDir, filename);
    
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found' });
    }
    
    try {
      const stats = fs.statSync(filePath);
      const fileInfo = {
        filename,
        size: stats.size,
        created: stats.birthtime,
        modified: stats.mtime,
        url: `${req.protocol}://${req.get('host')}/uploads/${filename}`
      };
      
      res.json(fileInfo);
    } catch (error) {
      res.status(500).json({ error: 'Error reading file information' });
    }
  });

  // Health check endpoint
  app.get('/api/health', (req, res) => {
    res.json({ 
      status: 'ok', 
      timestamp: new Date().toISOString(),
      uptime: process.uptime()
    });
  });

  const httpServer = createServer(app);
  return httpServer;
}
