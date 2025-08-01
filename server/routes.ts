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

      // Send to webhook - POST first, TEST environment first
      try {
        let webhookSuccess = false;
        console.log('🚀 Starting webhook delivery - POST method priority, TEST environment first...');
        
        const webhookUrls = [
          'https://ai.brasengconsultoria.com.br/webhook-test/c91109c3-fd7c-4fc7-9d58-8e4c7d6e0e2c', // TEST FIRST
          'https://ai.brasengconsultoria.com.br/webhook/c91109c3-fd7c-4fc7-9d58-8e4c7d6e0e2c'     // PRODUCTION SECOND
        ];

        // Try POST method for both endpoints first
        for (let i = 0; i < webhookUrls.length && !webhookSuccess; i++) {
          const url = webhookUrls[i];
          const urlType = i === 0 ? 'TEST' : 'PRODUCTION';
          
          console.log(`\n🔄 === TRYING ${urlType} WEBHOOK ===`);
          console.log(`URL: ${url}`);

          // POST Method 1: Try with form-data submit (most compatible with multipart)
          console.log(`📡 POST Method 1: form-data submit`);
          try {
            // Create fresh FormData for each attempt
            const postFormData = new FormData();
            postFormData.append('companyName', companyName);
            if (description) postFormData.append('description', description);
            if (impactLevel) postFormData.append('impactLevel', impactLevel);
            postFormData.append('feedbackType', feedbackType);
            postFormData.append('timestamp', new Date().toISOString());
            postFormData.append('source', `AutoForm-POST-${urlType}`);
            
            if (Array.isArray(req.files) && req.files.length > 0) {
              console.log(`📎 Adding ${req.files.length} files to FormData...`);
              req.files.forEach((file, index) => {
                if (fs.existsSync(file.path)) {
                  postFormData.append('files', fs.createReadStream(file.path), {
                    filename: file.originalname,
                    contentType: file.mimetype,
                  });
                  console.log(`  ✓ File ${index + 1}: ${file.originalname} (${file.size} bytes)`);
                } else {
                  console.error(`  ❌ File ${index + 1} not found: ${file.path}`);
                }
              });
            }

            // Use form-data submit method
            const formDataResult = await new Promise<any>((resolve, reject) => {
              const request = postFormData.submit(url, (err, res) => {
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

            console.log(`� ${urlType} form-data POST result:`, {
              status: formDataResult.status,
              ok: formDataResult.ok,
              bodyPreview: formDataResult.body?.substring(0, 300)
            });

            if (formDataResult.ok) {
              console.log(`🎉 SUCCESS! ${urlType} webhook received POST with form-data!`);
              webhookSuccess = true;
              break;
            } else {
              console.log(`❌ ${urlType} form-data POST failed with status: ${formDataResult.status}`);
            }
          } catch (formDataError) {
            console.error(`❌ ${urlType} form-data POST error:`, (formDataError as Error).message);
          }

          // POST Method 2: Try with fetch + FormData (if method 1 failed)
          if (!webhookSuccess) {
            console.log(`📡 POST Method 2: fetch with FormData`);
            try {
              // Create another fresh FormData
              const fetchFormData = new FormData();
              fetchFormData.append('companyName', companyName);
              if (description) fetchFormData.append('description', description);
              if (impactLevel) fetchFormData.append('impactLevel', impactLevel);
              fetchFormData.append('feedbackType', feedbackType);
              fetchFormData.append('timestamp', new Date().toISOString());
              fetchFormData.append('source', `AutoForm-FETCH-${urlType}`);
              
              if (Array.isArray(req.files) && req.files.length > 0) {
                req.files.forEach((file, index) => {
                  if (fs.existsSync(file.path)) {
                    fetchFormData.append('files', fs.createReadStream(file.path), {
                      filename: file.originalname,
                      contentType: file.mimetype,
                    });
                  }
                });
              }

              const fetchResponse = await fetch(url, {
                method: 'POST',
                body: fetchFormData as any,
                headers: {
                  ...fetchFormData.getHeaders(),
                  'User-Agent': 'AutoForm-Webhook/2.0',
                },
              });

              let fetchResponseText = '';
              try {
                fetchResponseText = await fetchResponse.text();
              } catch (e) {
                fetchResponseText = 'Could not read response';
              }

              console.log(`📥 ${urlType} fetch POST result:`, {
                status: fetchResponse.status,
                ok: fetchResponse.ok,
                bodyPreview: fetchResponseText.substring(0, 300)
              });

              if (fetchResponse.ok) {
                console.log(`🎉 SUCCESS! ${urlType} webhook received POST with fetch!`);
                webhookSuccess = true;
                break;
              } else {
                console.log(`❌ ${urlType} fetch POST failed with status: ${fetchResponse.status}`);
              }
            } catch (fetchError) {
              console.error(`❌ ${urlType} fetch POST error:`, (fetchError as Error).message);
            }
          }

          // POST Method 3: Try with JSON payload (no files, but file URLs)
          if (!webhookSuccess) {
            console.log(`📡 POST Method 3: JSON payload`);
            try {
              const jsonData = {
                companyName,
                description: description || '',
                impactLevel: impactLevel || '',
                feedbackType,
                timestamp: new Date().toISOString(),
                source: `AutoForm-JSON-${urlType}`,
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
                  'User-Agent': 'AutoForm-Webhook/2.0',
                },
                body: JSON.stringify(jsonData),
              });

              const jsonResponseText = await jsonResponse.text().catch(() => 'Could not read JSON response');
              console.log(`📥 ${urlType} JSON POST result:`, {
                status: jsonResponse.status,
                ok: jsonResponse.ok,
                bodyPreview: jsonResponseText.substring(0, 300)
              });

              if (jsonResponse.ok) {
                console.log(`🎉 SUCCESS! ${urlType} webhook received POST with JSON!`);
                webhookSuccess = true;
                break;
              } else {
                console.log(`❌ ${urlType} JSON POST failed with status: ${jsonResponse.status}`);
              }
            } catch (jsonError) {
              console.error(`❌ ${urlType} JSON POST error:`, (jsonError as Error).message);
            }
          }

          console.log(`❌ All POST methods failed for ${urlType} webhook`);
        }

        // Only try GET as absolute last resort if ALL POST methods failed
        if (!webhookSuccess) {
          console.log('\n🔄 === FINAL FALLBACK: GET METHOD ===');
          console.log('⚠️  Note: GET cannot send files, only metadata');
          
          const params = new URLSearchParams();
          params.append('companyName', companyName);
          if (description) params.append('description', description);
          if (impactLevel) params.append('impactLevel', impactLevel);
          params.append('feedbackType', feedbackType);
          params.append('timestamp', new Date().toISOString());
          params.append('source', 'AutoForm-GET-Fallback');
          
          // Add file information if files exist
          if (Array.isArray(req.files) && req.files.length > 0) {
            const fileNames = req.files.map(file => file.originalname).join(', ');
            const fileUrls = req.files.map(file => `${req.protocol}://${req.get('host')}/uploads/${file.filename}`).join('|');
            params.append('hasFiles', 'true');
            params.append('fileCount', req.files.length.toString());
            params.append('fileNames', fileNames);
            params.append('fileUrls', fileUrls);
            console.log(`📎 Files available at URLs: ${fileUrls}`);
          } else {
            params.append('hasFiles', 'false');
            params.append('fileCount', '0');
          }
          
          const getUrl = `https://ai.brasengconsultoria.com.br/webhook-test/c91109c3-fd7c-4fc7-9d58-8e4c7d6e0e2c?${params.toString()}`;
          
          try {
            console.log(`📡 Sending GET request to: ${getUrl.substring(0, 100)}...`);
            const getResponse = await fetch(getUrl, {
              method: 'GET',
              headers: {
                'User-Agent': 'AutoForm-Webhook/2.0',
              }
            });

            const getResponseText = await getResponse.text().catch(() => 'Could not read GET response');
            console.log('📥 GET fallback result:', {
              status: getResponse.status,
              ok: getResponse.ok,
              bodyPreview: getResponseText.substring(0, 300)
            });
            
            if (getResponse.ok) {
              console.log('✅ GET fallback successful (files accessible via URLs)');
              webhookSuccess = true;
            } else {
              console.log(`❌ GET fallback failed with status: ${getResponse.status}`);
            }
          } catch (getError) {
            console.error('❌ GET fallback error:', (getError as Error).message);
          }
        }

        // Final status
        if (webhookSuccess) {
          console.log('\n🎉 === WEBHOOK DELIVERY SUCCESSFUL ===');
        } else {
          console.log('\n❌ === ALL WEBHOOK METHODS FAILED ===');
          console.log('⚠️  Data saved locally but webhook notification failed');
        }
        
      } catch (webhookError) {
        console.error('❌ Critical webhook error:', webhookError);
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
