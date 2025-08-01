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

      // Send to webhook - try multiple approaches
      try {
        let webhookResponse;
        let webhookSuccess = false;
        console.log('Attempting to send to webhook with multiple methods...');
        
        // Method 1: Try POST with multipart/form-data (best for files)
        console.log('🔄 Method 1: POST with multipart/form-data to production...');
        try {
          webhookResponse = await fetch('https://ai.brasengconsultoria.com.br/webhook/c91109c3-fd7c-4fc7-9d58-8e4c7d6e0e2c', {
            method: 'POST',
            body: formData as any,
            headers: {
              ...formData.getHeaders(),
            },
          });

          let responseText = '';
          try {
            responseText = await webhookResponse.text();
          } catch (readError) {
            console.error('Error reading webhook response:', readError);
          }
          
          console.log('Webhook production multipart response:', {
            status: webhookResponse.status,
            statusText: webhookResponse.statusText,
            body: responseText
          });

          if (webhookResponse.ok) {
            console.log('✅ Success with multipart/form-data POST!');
            webhookSuccess = true;
          }
        } catch (multipartError) {
          console.error('❌ Multipart POST failed:', multipartError);
        }

        // Method 2: If multipart failed, try POST with JSON (no files, but include file URLs)
        if (!webhookSuccess) {
          console.log('🔄 Method 2: POST with JSON...');
          try {
            const jsonData = {
              companyName,
              description,
              impactLevel,
              feedbackType,
              timestamp: new Date().toISOString(),
              hasFiles: Array.isArray(req.files) && req.files.length > 0,
              fileCount: Array.isArray(req.files) ? req.files.length : 0,
              files: Array.isArray(req.files) ? req.files.map(file => ({
                originalName: file.originalname,
                size: file.size,
                type: file.mimetype,
                // Provide public URL to access the file
                url: `${req.protocol}://${req.get('host')}/uploads/${file.filename}`
              })) : []
            };

            webhookResponse = await fetch('https://ai.brasengconsultoria.com.br/webhook/c91109c3-fd7c-4fc7-9d58-8e4c7d6e0e2c', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify(jsonData),
            });

            let jsonResponseText = '';
            try {
              jsonResponseText = await webhookResponse.text();
            } catch (readError) {
              console.error('Error reading JSON webhook response:', readError);
            }
            
            console.log('Webhook production JSON response:', {
              status: webhookResponse.status,
              statusText: webhookResponse.statusText,
              body: jsonResponseText
            });

            if (webhookResponse.ok) {
              console.log('✅ Success with JSON POST!');
              webhookSuccess = true;
            }
          } catch (jsonError) {
            console.error('❌ JSON POST failed:', jsonError);
          }
        }

        // Method 3: Try test endpoint with multipart if production failed
        if (!webhookSuccess) {
          console.log('🔄 Method 3: POST multipart to test endpoint...');
          try {
            const testFormData = new FormData();
            testFormData.append('companyName', companyName);
            if (description) testFormData.append('description', description);
            if (impactLevel) testFormData.append('impactLevel', impactLevel);
            testFormData.append('feedbackType', feedbackType);
            
            if (Array.isArray(req.files) && req.files.length > 0) {
              req.files.forEach((file, index) => {
                if (fs.existsSync(file.path)) {
                  testFormData.append('files', fs.createReadStream(file.path), {
                    filename: file.originalname,
                    contentType: file.mimetype,
                  });
                }
              });
            }

            webhookResponse = await fetch('https://ai.brasengconsultoria.com.br/webhook-test/c91109c3-fd7c-4fc7-9d58-8e4c7d6e0e2c', {
              method: 'POST',
              body: testFormData as any,
              headers: {
                ...testFormData.getHeaders(),
              },
            });

            let testResponseText = '';
            try {
              testResponseText = await webhookResponse.text();
            } catch (readError) {
              console.error('Error reading test webhook response:', readError);
            }
            
            console.log('Webhook test multipart response:', {
              status: webhookResponse.status,
              statusText: webhookResponse.statusText,
              body: testResponseText
            });

            if (webhookResponse.ok) {
              console.log('✅ Success with test endpoint multipart!');
              webhookSuccess = true;
            }
          } catch (testError) {
            console.error('❌ Test multipart POST failed:', testError);
          }
        }

        // Method 4: Try test endpoint with JSON
        if (!webhookSuccess) {
          console.log('🔄 Method 4: POST JSON to test endpoint...');
          try {
            const jsonData = {
              companyName,
              description,
              impactLevel,
              feedbackType,
              timestamp: new Date().toISOString(),
              hasFiles: Array.isArray(req.files) && req.files.length > 0,
              fileCount: Array.isArray(req.files) ? req.files.length : 0,
              files: Array.isArray(req.files) ? req.files.map(file => ({
                originalName: file.originalname,
                size: file.size,
                type: file.mimetype,
                url: `${req.protocol}://${req.get('host')}/uploads/${file.filename}`
              })) : []
            };

            webhookResponse = await fetch('https://ai.brasengconsultoria.com.br/webhook-test/c91109c3-fd7c-4fc7-9d58-8e4c7d6e0e2c', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify(jsonData),
            });

            let testJsonResponseText = '';
            try {
              testJsonResponseText = await webhookResponse.text();
            } catch (readError) {
              console.error('Error reading test JSON webhook response:', readError);
            }
            
            console.log('Webhook test JSON response:', {
              status: webhookResponse.status,
              statusText: webhookResponse.statusText,
              body: testJsonResponseText
            });

            if (webhookResponse.ok) {
              console.log('✅ Success with test endpoint JSON!');
              webhookSuccess = true;
            }
          } catch (testJsonError) {
            console.error('❌ Test JSON POST failed:', testJsonError);
          }
        }

        // Method 5: Last resort - GET with query parameters (no files, just notification)
        if (!webhookSuccess) {
          console.log('🔄 Method 5: GET with query parameters (last resort)...');
          try {
            const params = new URLSearchParams();
            params.append('companyName', companyName);
            if (description) params.append('description', description);
            if (impactLevel) params.append('impactLevel', impactLevel);
            params.append('feedbackType', feedbackType);
            params.append('timestamp', new Date().toISOString());
            
            // Add file information if files exist
            if (Array.isArray(req.files) && req.files.length > 0) {
              const fileNames = req.files.map(file => file.originalname).join(', ');
              const fileUrls = req.files.map(file => `${req.protocol}://${req.get('host')}/uploads/${file.filename}`).join(', ');
              params.append('hasFiles', 'true');
              params.append('fileCount', req.files.length.toString());
              params.append('fileNames', fileNames);
              params.append('fileUrls', fileUrls);
              console.log(`📎 ${req.files.length} files attached - URLs provided in GET request`);
            } else {
              params.append('hasFiles', 'false');
              params.append('fileCount', '0');
            }
            
            const getUrl = `https://ai.brasengconsultoria.com.br/webhook-test/c91109c3-fd7c-4fc7-9d58-8e4c7d6e0e2c?${params.toString()}`;
            
            webhookResponse = await fetch(getUrl, {
              method: 'GET',
            });

            let getResponseText = '';
            try {
              getResponseText = await webhookResponse.text();
            } catch (readError) {
              console.error('Error reading GET webhook response:', readError);
            }
            
            console.log('Webhook GET response:', {
              status: webhookResponse.status,
              statusText: webhookResponse.statusText,
              body: getResponseText
            });

            if (webhookResponse.ok) {
              console.log('✅ Success with GET method (files accessible via URLs)!');
              webhookSuccess = true;
            }
          } catch (getError) {
            console.error('❌ GET method failed:', getError);
          }
        }

        if (webhookSuccess) {
          console.log('🎉 Webhook delivered successfully!');
        } else {
          console.log('❌ All webhook delivery methods failed');
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
