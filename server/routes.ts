import type { Express } from "express";
import express from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertFeedbackSchema } from "@shared/schema";
import multer from "multer";
import path from "path";
import fs from "fs";
import FormData from "form-data";
// Importação compatível com ESM e CommonJS
import nodeFetch from 'node-fetch';
const fetch: typeof nodeFetch = typeof nodeFetch === 'function' ? nodeFetch : (global.fetch as any);

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
  // Submit feedback endpoint

  // Use upload.fields to ensure correct parsing of files and fields
  app.post("/api/feedback", upload.fields([{ name: 'files' }]), async (req, res) => {
    try {
      // Multer coloca campos de texto em req.body e arquivos em req.files
      // Fallback: alguns ambientes podem colocar campos em req.body ou req.fields

      // Multer coloca arquivos em req.files (objeto ou array) e campos em req.body
      let files: any[] = [];
      if (Array.isArray(req.files)) {
        files = req.files;
      } else if (req.files && typeof req.files === 'object' && req.files.files) {
        files = req.files.files;
      }
      const fields = req.body || {};

      const companyName = fields.companyName || '';
      const description = fields.description || '';
      const impactLevel = fields.impactLevel || '';
      const feedbackType = fields.feedbackType || '';

      // Validate required fields
      const validationResult = insertFeedbackSchema.safeParse({
        companyName,
        description: description || undefined,
        impactLevel: impactLevel || undefined,
        feedbackType,
        fileName: Array.isArray(files) && files.length > 0 ? files[0].originalname : undefined,
        fileUrl: Array.isArray(files) && files.length > 0 ? files[0].filename : undefined,
      });

      if (!validationResult.success) {
        return res.status(400).json({
          message: "Dados inválidos",
          errors: validationResult.error.errors
        });
      }

      // Store feedback locally
      const feedback = await storage.createFeedback(validationResult.data);

      // Prepare data for webhook (Node.js compatible)
      const webhookData = new FormData();
      webhookData.append('companyName', companyName);
      if (description) webhookData.append('description', description);
      if (impactLevel) webhookData.append('impactLevel', impactLevel);
      webhookData.append('feedbackType', feedbackType);

      if (Array.isArray(files) && files.length > 0) {
        files.forEach((file) => {
          webhookData.append('files', fs.createReadStream(file.path), {
            filename: file.originalname,
            contentType: file.mimetype,
          });
        });
      }

      // Send to webhook - try production endpoint first, then test endpoint
      try {
        // Try production webhook first
        let webhookResponse = await fetch('https://ai.brasengconsultoria.com.br/webhook/c91109c3-fd7c-4fc7-9d58-8e4c7d6e0e2c', {
          method: 'POST',
          body: webhookData,
          headers: webhookData.getHeaders(),
        });

        // If production fails, try test endpoint
        if (!webhookResponse.ok) {
          console.log('Production webhook failed, trying test endpoint...');
          webhookResponse = await fetch('https://ai.brasengconsultoria.com.br/webhook-test/c91109c3-fd7c-4fc7-9d58-8e4c7d6e0e2c', {
            method: 'POST',
            body: webhookData,
            headers: webhookData.getHeaders(),
          });
        }

        // If POST fails with method not allowed, try GET with query parameters
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
        }

        if (!webhookResponse.ok) {
          console.log('Webhook response:', webhookResponse.status, await webhookResponse.text());
        } else {
          console.log('Webhook enviado com sucesso!');
        }
      } catch (webhookError) {
        console.error('Webhook error:', webhookError);
        // Don't fail the request if webhook fails
      }

      res.json({
        message: "Feedback enviado com sucesso!",
        data: feedback
      });

    } catch (error) {
      console.error('Feedback submission error:', error);
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
