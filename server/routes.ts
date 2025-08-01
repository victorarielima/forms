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

      // Send to webhook - try production first
      try {
        let webhookResponse;
        console.log('Attempting to send to production webhook...');
        
        // Try production webhook
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
        
        console.log('Webhook production response:', {
          status: webhookResponse.status,
          statusText: webhookResponse.statusText,
          headers: Object.fromEntries(webhookResponse.headers.entries()),
          body: responseText
        });

        // If production fails, try test endpoint
        if (!webhookResponse.ok) {
          console.log('Production webhook failed, trying test endpoint...');
          
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
          
          console.log('Webhook test response:', {
            status: webhookResponse.status,
            statusText: webhookResponse.statusText,
            headers: Object.fromEntries(webhookResponse.headers.entries()),
            body: testResponseText
          });
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
          
          webhookResponse = await fetch(getUrl, {
            method: 'GET',
          });

          const getResponseText = await webhookResponse.text();
          console.log('Webhook GET response:', webhookResponse.status, getResponseText);
        }

        if (webhookResponse.ok) {
          console.log('✅ Webhook enviado com sucesso!');
        } else {
          console.log('❌ Webhook final response status:', webhookResponse.status);
        }
        
      } catch (webhookError) {
        console.error('❌ Webhook error:', webhookError);
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

  const httpServer = createServer(app);
  return httpServer;
}
