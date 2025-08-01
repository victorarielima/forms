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

            // Send to webhook - using Promise-based approach for better compatibility
      try {
        let webhookResponse;
        console.log('Attempting to send to production webhook...');
        
        // Function to make webhook request with proper promise handling
        const sendWebhookRequest = (url: string, formData: FormData): Promise<any> => {
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

        // Try production webhook first
        try {
          webhookResponse = await sendWebhookRequest(
            'https://ai.brasengconsultoria.com.br/webhook/c91109c3-fd7c-4fc7-9d58-8e4c7d6e0e2c',
            formData
          );
          
          console.log('Webhook production response:', {
            status: webhookResponse.status,
            statusText: webhookResponse.statusText,
            headers: webhookResponse.headers,
            body: webhookResponse.body
          });
          
        } catch (prodError) {
          console.log('Production webhook failed:', (prodError as Error).message || prodError);
          webhookResponse = { ok: false, status: 0 };
        }

        // If production fails, try test endpoint
        if (!webhookResponse.ok) {
          console.log('Trying test endpoint...');
          
          // Create new FormData for test endpoint
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

          try {
            webhookResponse = await sendWebhookRequest(
              'https://ai.brasengconsultoria.com.br/webhook-test/c91109c3-fd7c-4fc7-9d58-8e4c7d6e0e2c',
              testFormData
            );
            
            console.log('Webhook test response:', {
              status: webhookResponse.status,
              statusText: webhookResponse.statusText,
              headers: webhookResponse.headers,
              body: webhookResponse.body
            });
            
          } catch (testError) {
            console.log('Test webhook failed:', (testError as Error).message || testError);
            webhookResponse = { ok: false, status: 0 };
          }
        }

        // If POST still fails, try GET with query parameters (without files)
        if (!webhookResponse.ok && webhookResponse.status === 404) {
          console.log('POST failed, trying GET method...');
          const params = new URLSearchParams();
          params.append('companyName', companyName);
          if (description) params.append('description', description);
          if (impactLevel) params.append('impactLevel', impactLevel);
          params.append('feedbackType', feedbackType);
          
          // Add file information if files exist
          if (Array.isArray(req.files) && req.files.length > 0) {
            const fileNames = req.files.map(file => file.originalname).join(', ');
            params.append('attachedFiles', fileNames);
            params.append('fileCount', req.files.length.toString());
            console.log(`Note: ${req.files.length} files attached but cannot be sent via GET: ${fileNames}`);
          }
          
          const getUrl = `https://ai.brasengconsultoria.com.br/webhook-test/c91109c3-fd7c-4fc7-9d58-8e4c7d6e0e2c?${params.toString()}`;
          
          try {
            const getResponse = await fetch(getUrl, {
              method: 'GET',
            });

            const getResponseText = await getResponse.text();
            console.log('Webhook GET response:', {
              status: getResponse.status,
              body: getResponseText
            });
            
            webhookResponse = {
              ok: getResponse.ok,
              status: getResponse.status
            };
          } catch (getError) {
            console.log('GET webhook failed:', (getError as Error).message || getError);
          }
        }

        if (webhookResponse.ok) {
          console.log('✅ Webhook enviado com sucesso!');
        } else {
          console.log('❌ Webhook final response status:', webhookResponse.status);
        }
        
      } catch (webhookError) {
        console.error('❌ Webhook error:', (webhookError as Error).message || webhookError);
        // Don't fail the request if webhook fails
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
