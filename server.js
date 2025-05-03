import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import pkg from 'pg';
const{ Pool } =pkg;
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import qrcode from 'qrcode';
import { v4 as uuidv4 } from 'uuid';
import { fileURLToPath } from 'url';
import mime from 'mime-types';
import os from 'os';
import sharp from 'sharp';
import { Document, Packer, Paragraph, TextRun } from 'docx';
import { convert } from 'html-to-text';
import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import compression from 'compression';
import morgan from 'morgan';
import winston from 'winston';
import { OAuth2Client } from 'google-auth-library';
import axios from 'axios';
import crypto from 'crypto';

// Load environment variables from .env file
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

// Configure Winston logger
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' })
  ]
});

if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.simple()
  }));
}

// Initialize express app
const app = express();
const PORT = 8000;
const HOST = 'localhost';

// Override any environment variables
process.env.PORT = PORT;
process.env.HOST = HOST;
process.env.FRONTEND_URL = `http://${HOST}:5173`;

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "blob:"],
      connectSrc: ["'self'", `http://${HOST}:${PORT}`, `http://${HOST}:5173`],
    },
  },
  crossOriginEmbedderPolicy: false,
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});

// Apply rate limiting to all routes
app.use(limiter);

// Compression middleware
app.use(compression());

// Request logging
app.use(morgan('combined', {
  stream: {
    write: (message) => logger.info(message.trim())
  }
}));

// Error handling middleware
app.use((err, req, res, next) => {
  logger.error('Error:', err);
  res.status(500).json({ 
    message: 'Internal server error',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// Initialize email transporter only if credentials are available
let transporter = null;
if (process.env.EMAIL_USER && process.env.EMAIL_APP_PASSWORD) {
  transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_APP_PASSWORD
    },
    debug: false,
    logger: false
  });

  // Verify the connection configuration
  transporter.verify(function(error, success) {
    if (error) {
      console.warn('Email configuration warning:', error.message);
    } else {
      console.log('Email server is ready to send messages');
    }
  });
} else {
  console.log('Email configuration not found - email notifications will be disabled');
}

// Update sendEmail function to handle missing transporter
const sendEmail = async (to, subject, message, requestId) => {
  if (!transporter) {
    console.log('Email not sent - email service not configured');
    return false;
  }

  try {
    if (!to) {
      console.error('Recipient email address is required');
      return false;
    }

    const htmlMessage = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #333;">Document Access Request</h2>
        <p style="color: #666;">${message}</p>
        <div style="margin: 30px 0;">
          <a href="${process.env.FRONTEND_URL}/access-requests/${requestId}" 
            style="display: inline-block; padding: 12px 24px; background-color: #007bff; color: white; text-decoration: none; border-radius: 4px;">
            Review Request
          </a>
        </div>
        <p style="color: #999; font-size: 12px;">
          If the button above doesn't work, copy and paste this link into your browser:<br>
          ${process.env.FRONTEND_URL}/access-requests/${requestId}
        </p>
      </div>
    `;

    const mailOptions = {
      from: process.env.EMAIL_USER,
      to,
      subject,
      html: htmlMessage
    };

    console.log('Attempting to send email to:', to);
    const info = await transporter.sendMail(mailOptions);
    console.log('Email sent successfully:', info.messageId);
    return true;
  } catch (error) {
    console.error('Error sending email:', error);
    return false;
  }
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Middleware
app.use(cors({
  origin: [
    `http://${HOST}:5173`,
    'http://localhost:5173'
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  exposedHeaders: ['Content-Range', 'X-Content-Range'],
  maxAge: 600
}));

// Add request logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
  console.log('Request Headers:', req.headers);
  console.log('Request Body:', req.body);
  next();
});

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Configure PostgreSQL connection
const pool = new Pool({
  connectionString: 'postgresql://neondb_owner:npg_8fWqJMv4Ksel@ep-square-snowflake-a4gn24ow-pooler.us-east-1.aws.neon.tech/neondb?sslmode=require',
  ssl: {
    rejectUnauthorized: false
  }
});

// Test database connection
pool.connect((err, client, release) => {
  if (err) {
    console.error('Error connecting to the database:', err);
  } else {
    console.log('Successfully connected to database');
    release();
  }
});

// JWT Secret
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

// Authentication middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  if (!token) return res.status(401).json({ message: 'Authentication token required' });
  
  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ message: 'Invalid or expired token' });
    req.user = user;
    next();
  });
};

// Configure multer for memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  }
});

// User Routes
app.post('/api/auth/register', async (req, res) => {
  try {
    const { email, password, fullName, mobileNumber, pin } = req.body;
    console.log('Registration attempt for email:', email);
    
    if (!email || !password || !fullName) {
      console.log('Registration failed: Missing required fields');
      return res.status(400).json({ message: 'Email, password, and full name are required' });
    }
    
    // Check if user already exists
    const userCheck = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (userCheck.rows.length > 0) {
      console.log('Registration failed: User already exists');
      return res.status(400).json({ message: 'User already exists with this email' });
    }
    
    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);
    
    // Insert new user
    const result = await pool.query(
      'INSERT INTO users (id, email, password_hash, full_name, mobile_number, security_pin) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, email, full_name',
      [uuidv4(), email, hashedPassword, fullName, mobileNumber, pin]
    );
    
    // Generate token
    const user = result.rows[0];
    const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '24h' });
    
    console.log('Registration successful for user:', { id: user.id, email: user.email });
    
    res.status(201).json({
      message: 'User registered successfully',
      token,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.full_name
      }
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ message: 'Server error during registration' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    console.log('Login attempt for email:', email);
    
    if (!email || !password) {
      console.log('Login failed: Missing credentials');
      return res.status(400).json({ message: 'Email and password are required' });
    }
    
    // Find user
    const result = await pool.query(
      'SELECT * FROM users WHERE email = $1',
      [email]
    );
    
    if (result.rows.length === 0) {
      console.log('Login failed: User not found');
      return res.status(401).json({ message: 'Invalid email or password' });
    }
    
    const user = result.rows[0];
    console.log('User found:', { id: user.id, email: user.email });
    
    // Compare password
    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      console.log('Login failed: Invalid password');
      return res.status(401).json({ message: 'Invalid email or password' });
    }
    
    // Generate token
    const token = jwt.sign(
      { id: user.id, email: user.email },
      JWT_SECRET,
      { expiresIn: '24h' }
    );
    
    console.log('Login successful for user:', { id: user.id, email: user.email });
    
    res.json({
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.full_name,
        mobileNumber: user.mobile_number
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Server error during login' });
  }
});

app.get('/api/user/profile', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    
    const result = await pool.query(
      'SELECT id, email, full_name, mobile_number, security_pin FROM users WHERE id = $1',
      [userId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    const user = result.rows[0];
    
    res.json({
      id: user.id,
      email: user.email,
      fullName: user.full_name,
      mobileNumber: user.mobile_number,
      pin: user.security_pin
    });
  } catch (error) {
    console.error('Profile fetch error:', error);
    res.status(500).json({ message: 'Server error while fetching profile' });
  }
});

app.put('/api/user/profile', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { fullName, mobileNumber, pin } = req.body;
    
    const result = await pool.query(
      'UPDATE users SET full_name = $1, mobile_number = $2, security_pin = $3 WHERE id = $4 RETURNING id, email, full_name, mobile_number',
      [fullName, mobileNumber, pin, userId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    const user = result.rows[0];
    
    res.json({
      message: 'Profile updated successfully',
      user: {
        id: user.id,
        email: user.email,
        fullName: user.full_name,
        mobileNumber: user.mobile_number
      }
    });
  } catch (error) {
    console.error('Profile update error:', error);
    res.status(500).json({ message: 'Server error while updating profile' });
  }
});

// Document Routes
app.post('/api/documents/upload', authenticateToken, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    const file = req.file;
    const userId = req.user.id;
    const metadata = {
      customName: req.body.customName || file.originalname,
      description: req.body.description,
      tags: req.body.tags ? JSON.parse(req.body.tags) : []
    };

    const result = await documentStorage.uploadDocument(userId, file, metadata);

    // Store document metadata in database
    const dbResult = await pool.query(
      'INSERT INTO documents (id, user_id, name, type, size, file_path, file_id, metadata) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *',
      [
        result.documentId,
        userId,
        metadata.customName,
        file.mimetype,
        file.size,
        result.filePath,
        result.fileId,
        result.metadata
      ]
    );

    res.status(201).json({
      message: 'Document uploaded successfully',
      document: dbResult.rows[0]
    });
  } catch (error) {
    console.error('Document upload error:', error);
    res.status(500).json({ message: 'Server error during document upload' });
  }
});

app.get('/api/documents', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    
    const result = await pool.query(
      'SELECT * FROM documents WHERE user_id = $1 ORDER BY created_at DESC',
      [userId]
    );
    
    res.json(result.rows);
  } catch (error) {
    console.error('Document fetch error:', error);
    res.status(500).json({ message: 'Server error while fetching documents' });
  }
});

app.delete('/api/documents/:id', authenticateToken, async (req, res) => {
  try {
    const documentId = req.params.id;
    const userId = req.user.id;

    // Check document ownership
    const documentCheck = await pool.query(
      'SELECT * FROM documents WHERE id = $1 AND user_id = $2',
      [documentId, userId]
    );

    if (documentCheck.rows.length === 0) {
      return res.status(404).json({ message: 'Document not found or unauthorized' });
    }

    const document = documentCheck.rows[0];

    // Delete file from B2
    await documentStorage.deleteDocument(userId, documentId);

    // Delete from database
    await pool.query('DELETE FROM documents WHERE id = $1', [documentId]);

    res.json({ message: 'Document deleted successfully' });
  } catch (error) {
    console.error('Document delete error:', error);
    res.status(500).json({ message: 'Server error while deleting document' });
  }
});

app.put('/api/documents/:id/rename', authenticateToken, async (req, res) => {
  try {
    const documentId = req.params.id;
    const { newName } = req.body;
    const userId = req.user.id;
    
    // Check document ownership
    const documentCheck = await pool.query(
      'SELECT * FROM documents WHERE id = $1 AND user_id = $2',
      [documentId, userId]
    );
    
    if (documentCheck.rows.length === 0) {
      return res.status(404).json({ message: 'Document not found or unauthorized' });
    }
    
    // Update document name
    const result = await pool.query(
      'UPDATE documents SET name = $1 WHERE id = $2 RETURNING *',
      [newName, documentId]
    );
    
    res.json({
      message: 'Document renamed successfully',
      document: result.rows[0]
    });
  } catch (error) {
    console.error('Document rename error:', error);
    res.status(500).json({ message: 'Server error while renaming document' });
  }
});

// Get document details
app.get('/api/documents/:id', authenticateToken, async (req, res) => {
  try {
    const documentId = req.params.id;
    const userId = req.user.id;

    // Get document metadata from database
    const { rows } = await pool.query(
      'SELECT * FROM documents WHERE id = $1',
      [documentId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: 'Document not found' });
    }

    const document = rows[0];

    // Check access permissions
    if (document.user_id !== userId) {
      const accessCheck = await pool.query(
        `SELECT * FROM access_requests 
         WHERE document_id = $1 
         AND requester_id = $2 
         AND status = 'approved'`,
        [documentId, userId]
      );

      if (accessCheck.rows.length === 0) {
        return res.status(403).json({ message: 'Access denied' });
      }
    }

    // Get signed URL for document
    const url = await documentStorage.getDocumentUrl(document.user_id, documentId);

    res.json({
      document,
      url
    });
  } catch (error) {
    console.error('Error retrieving document:', error);
    res.status(500).json({ message: 'Server error while retrieving document' });
  }
});

// QR Code Routes
app.post('/api/qrcode/generate', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { accessCode } = req.body;
    
    // Generate unique code for QR
    const qrUniqueCode = uuidv4();
    
    // Save QR code in database
    const result = await pool.query(
      'INSERT INTO qr_codes (user_id, code, access_code, is_active, expires_at) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [userId, qrUniqueCode, accessCode || null, true, new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)] // Expires in 30 days
    );
    
    // Make any previous QR codes inactive
    await pool.query(
      'UPDATE qr_codes SET is_active = false WHERE user_id = $1 AND id != $2',
      [userId, result.rows[0].id]
    );
    
    // Get the frontend URL from environment or use the request host
    const frontendUrl = process.env.FRONTEND_URL || `http://${HOST}:5173`;
    
    // Generate QR code data URL with access endpoint
    const qrCodeData = `${frontendUrl}/access?code=${qrUniqueCode}`;    
    const qrCodeDataUrl = await qrcode.toDataURL(qrCodeData);
    
    console.log('Generated QR code with URL:', qrCodeData);
    console.log('Using frontend URL:', frontendUrl);
    
    res.json({
      message: 'QR code generated successfully',
      qrCode: qrCodeDataUrl,
      expiresAt: result.rows[0].expires_at,
      uniqueCode: qrUniqueCode,
      qrCodeUrl: qrCodeData
    });
  } catch (error) {
    console.error('QR code generation error:', error);
    res.status(500).json({ message: 'Server error during QR code generation' });
  }
});

app.get('/api/qrcode/validate/:code', async (req, res) => {
  try {
    const { code } = req.params;
    
    // Check if QR code exists and is active
    const result = await pool.query(
      'SELECT qr_codes.*, users.full_name FROM qr_codes JOIN users ON qr_codes.user_id = users.id WHERE qr_codes.code = $1 AND qr_codes.is_active = true AND qr_codes.expires_at > NOW()',
      [code]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'QR code not found, inactive, or expired' });
    }
    
    const qrCode = result.rows[0];
    
    // Get documents of the QR code owner
    const documents = await pool.query(
      'SELECT id, name, type, size, created_at FROM documents WHERE user_id = $1',
      [qrCode.user_id]
    );
    
    res.json({
      message: 'QR code is valid',
      qrCode: {
        id: qrCode.id,
        ownerId: qrCode.user_id,
        ownerName: qrCode.full_name,
        hasAccessCode: !!qrCode.access_code,
        documents: documents.rows
      }
    });
  } catch (error) {
    console.error('QR code validation error:', error);
    res.status(500).json({ message: 'Server error during QR code validation' });
  }
});

app.post('/api/access/request', async (req, res) => {
  try {
    const { qrCodeId, accessCode, requesterName, requestedDocuments } = req.body;
    
    // Validate QR code and access code if required
    const qrResult = await pool.query(
      'SELECT qr_codes.*, users.mobile_number, users.email, users.full_name FROM qr_codes JOIN users ON qr_codes.user_id = users.id WHERE qr_codes.id = $1 AND qr_codes.is_active = true AND qr_codes.expires_at > NOW()',
      [qrCodeId]
    );
    
    if (qrResult.rows.length === 0) {
      return res.status(404).json({ message: 'QR code not found, inactive, or expired' });
    }
    
    const qrCode = qrResult.rows[0];
    
    // Check if the requester is trying to access their own documents
    // We only check if the requester's name matches the QR code owner's name
    // This allows a registered user to scan other users' QR codes
    if (requesterName === qrCode.full_name) {
      return res.status(400).json({ message: 'You cannot request access to your own documents' });
    }
    
    // Check access code if required
    if (qrCode.access_code && qrCode.access_code !== accessCode) {
      return res.status(401).json({ message: 'Invalid access code' });
    }
    
    // Create access request
    const accessRequestId = uuidv4();
    
    // Insert document access request
    await pool.query(
      'INSERT INTO access_requests (id, qr_code_id, requester_name, status) VALUES ($1, $2, $3, $4)',
      [accessRequestId, qrCodeId, requesterName, 'pending']
    );
    
    // Add requested documents
    for (const docId of requestedDocuments) {
      await pool.query(
        'INSERT INTO requested_documents (access_request_id, document_id) VALUES ($1, $2)',
        [accessRequestId, docId]
      );
    }

    // Get the names of requested documents
    const documentsResult = await pool.query(
      'SELECT name FROM documents WHERE id = ANY($1)',
      [requestedDocuments]
    );
    const documentNames = documentsResult.rows.map(doc => doc.name).join(', ');

    // Send email notification to the document owner with HTML interface
    if (qrCode.email) {
      const message = `Hello ${qrCode.full_name}, ${requesterName} has requested access to your documents: ${documentNames}.`;
      await sendEmail(qrCode.email, 'Document Access Request', message, accessRequestId);
    }
    
    res.status(201).json({
      message: 'Access request submitted successfully',
      accessRequestId
    });
  } catch (error) {
    console.error('Access request error:', error);
    res.status(500).json({ message: 'Server error during access request' });
  }
});

app.post('/api/access/verify', async (req, res) => {
  try {
    const { mobileNumber, pin } = req.body;
    
    // Find user with matching mobile and PIN
    const result = await pool.query(
      'SELECT * FROM users WHERE mobile_number = $1 AND security_pin = $2',
      [mobileNumber, pin]
    );
    
    if (result.rows.length === 0) {
      return res.status(401).json({ message: 'Invalid mobile number or PIN' });
    }
    
    const user = result.rows[0];
    
    // Get documents owned by the user
    const documents = await pool.query(
      'SELECT * FROM documents WHERE user_id = $1',
      [user.id]
    );
    
    // Generate token for authenticated owner
    const token = jwt.sign(
      { id: user.id, email: user.email, isOwner: true },
      JWT_SECRET,
      { expiresIn: '1h' }
    );
    
    res.json({
      message: 'Owner verification successful',
      token,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.full_name
      },
      documents: documents.rows
    });
  } catch (error) {
    console.error('Owner verification error:', error);
    res.status(500).json({ message: 'Server error during owner verification' });
  }
});

// Get access request details
app.get('/api/access/requests/:requestId', async (req, res) => {
  try {
    const { requestId } = req.params;
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    let userId = null;

    // If token exists, verify it and get user ID
    if (token) {
      try {
        const decoded = jwt.verify(token, JWT_SECRET);
        userId = decoded.id;
      } catch (err) {
        console.error('Token verification error:', err);
      }
    }

    // Get access request details with documents
    const result = await pool.query(
      `SELECT ar.*, qr.user_id as owner_id, rd.document_id, d.name, d.type, d.size
       FROM access_requests ar
       JOIN qr_codes qr ON ar.qr_code_id = qr.id
       JOIN requested_documents rd ON ar.id = rd.access_request_id
       JOIN documents d ON rd.document_id = d.id
       WHERE ar.id = $1`,
      [requestId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Access request not found' });
    }

    // If user is authenticated and is the owner, allow access
    // If user is not authenticated, still allow access to view the request
    const request = {
      id: result.rows[0].id,
      requesterName: result.rows[0].requester_name,
      status: result.rows[0].status,
      createdAt: result.rows[0].created_at,
      isOwner: userId === result.rows[0].owner_id,
      documents: result.rows.map(row => ({
        id: row.document_id,
        name: row.name,
        type: row.type,
        size: row.size
      }))
    };

    res.json(request);
  } catch (error) {
    console.error('Access request fetch error:', error);
    res.status(500).json({ message: 'Server error while fetching access request' });
  }
});

// Approve access request
app.post('/api/access/requests/:requestId/approve', authenticateToken, async (req, res) => {
  try {
    const { requestId } = req.params;
    const userId = req.user.id;

    // Verify ownership
    const checkResult = await pool.query(
      `SELECT ar.* FROM access_requests ar
       JOIN qr_codes qr ON ar.qr_code_id = qr.id
       WHERE ar.id = $1 AND qr.user_id = $2`,
      [requestId, userId]
    );

    if (checkResult.rows.length === 0) {
      return res.status(404).json({ message: 'Access request not found or unauthorized' });
    }

    // Update request status
    await pool.query(
      'UPDATE access_requests SET status = $1 WHERE id = $2',
      ['approved', requestId]
    );

    // Get the approved documents
    const documentsResult = await pool.query(
      `SELECT d.* 
       FROM documents d
       JOIN requested_documents rd ON d.id = rd.document_id
       WHERE rd.access_request_id = $1`,
      [requestId]
    );

    // Send success response with documents
    res.json({
      success: true,
      message: 'Access request approved successfully',
      documents: documentsResult.rows
    });
  } catch (error) {
    console.error('Access request approval error:', error);
    res.status(500).json({ message: 'Server error while approving access request' });
  }
});

// Deny access request
app.post('/api/access/requests/:requestId/deny', authenticateToken, async (req, res) => {
  try {
    const { requestId } = req.params;
    const userId = req.user.id;

    // Verify ownership
    const checkResult = await pool.query(
      `SELECT ar.* FROM access_requests ar
       JOIN qr_codes qr ON ar.qr_code_id = qr.id
       WHERE ar.id = $1 AND qr.user_id = $2`,
      [requestId, userId]
    );

    if (checkResult.rows.length === 0) {
      return res.status(404).json({ message: 'Access request not found or unauthorized' });
    }

    // Update request status
    await pool.query(
      'UPDATE access_requests SET status = $1 WHERE id = $2',
      ['denied', requestId]
    );

    res.json({ success: true, message: 'Access request denied successfully' });
  } catch (error) {
    console.error('Access request denial error:', error);
    res.status(500).json({ message: 'Server error while denying access request' });
  }
});

// Modify access request
app.post('/api/access/requests/:requestId/modify', authenticateToken, async (req, res) => {
  try {
    const { requestId } = req.params;
    const { documentIds } = req.body;
    const userId = req.user.id;

    // Verify ownership
    const checkResult = await pool.query(
      `SELECT ar.* FROM access_requests ar
       JOIN qr_codes qr ON ar.qr_code_id = qr.id
       WHERE ar.id = $1 AND qr.user_id = $2`,
      [requestId, userId]
    );

    if (checkResult.rows.length === 0) {
      return res.status(404).json({ message: 'Access request not found or unauthorized' });
    }

    // Delete existing requested documents
    await pool.query(
      'DELETE FROM requested_documents WHERE access_request_id = $1',
      [requestId]
    );

    // Add new requested documents
    for (const docId of documentIds) {
      await pool.query(
        'INSERT INTO requested_documents (access_request_id, document_id) VALUES ($1, $2)',
        [requestId, docId]
      );
    }

    res.json({ success: true, message: 'Access request modified successfully' });
  } catch (error) {
    console.error('Access request modification error:', error);
    res.status(500).json({ message: 'Server error while modifying access request' });
  }
});

// Get approved documents for an access request
app.get('/api/access/requests/:requestId/documents', async (req, res) => {
  try {
    const { requestId } = req.params;

    // Get access request details and verify it's approved
    const requestResult = await pool.query(
      'SELECT * FROM access_requests WHERE id = $1 AND status = $2',
      [requestId, 'approved']
    );

    if (requestResult.rows.length === 0) {
      return res.status(404).json({ message: 'Access request not found or not approved' });
    }

    // Get the approved documents
    const documentsResult = await pool.query(
      `SELECT d.* 
       FROM documents d
       JOIN requested_documents rd ON d.id = rd.document_id
       WHERE rd.access_request_id = $1`,
      [requestId]
    );

    res.json({
      documents: documentsResult.rows
    });
  } catch (error) {
    console.error('Error fetching approved documents:', error);
    res.status(500).json({ message: 'Server error while fetching approved documents' });
  }
});

// Download document endpoint
app.get('/api/documents/:id/download', async (req, res) => {
  try {
    const documentId = req.params.id;
    const format = req.query.format || 'original';
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    let userId = null;

    // If token exists, verify it and get user ID
    if (token) {
      try {
        const decoded = jwt.verify(token, JWT_SECRET);
        userId = decoded.id;
      } catch (err) {
        console.error('Token verification error:', err);
      }
    }

    // First check if the document exists
    const documentCheck = await pool.query(
      'SELECT * FROM documents WHERE id = $1',
      [documentId]
    );

    if (documentCheck.rows.length === 0) {
      return res.status(404).json({ message: 'Document not found' });
    }

    const document = documentCheck.rows[0];

    // If user is authenticated and is the owner, allow access
    // If user is not authenticated, check if they have access through an approved request
    if (!userId || userId !== document.user_id) {
      // Check if there's an approved access request for this document
      const accessCheck = await pool.query(
        `SELECT ar.* 
         FROM access_requests ar
         JOIN requested_documents rd ON ar.id = rd.access_request_id
         WHERE rd.document_id = $1 AND ar.status = $2`,
        [documentId, 'approved']
      );

      if (accessCheck.rows.length === 0) {
        return res.status(403).json({ message: 'You do not have permission to download this document' });
      }
    }

    // Get file from B2
    const fileId = document.file_id;
    if (!fileId) {
      return res.status(404).json({ message: 'File ID not found' });
    }

    // Get download URL from B2
    const b2 = new B2ApiManager();
    await b2.authorize();
    const downloadUrl = await b2.getDownloadUrl(fileId);

    // Stream the file from B2 to the client
    const response = await axios({
      method: 'get',
      url: downloadUrl,
      responseType: 'stream'
    });

    // Set appropriate content type and headers
    res.setHeader('Content-Type', document.type);
    res.setHeader('Content-Disposition', `attachment; filename="${document.name}"`);
    
    // Pipe the file stream to the response
    response.data.pipe(res);
  } catch (error) {
    console.error('Error downloading document:', error);
    res.status(500).json({ message: 'Server error while downloading document' });
  }
});

// Add health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memoryUsage: process.memoryUsage()
  });
});

// Add metrics endpoint (protected)
app.get('/metrics', authenticateToken, (req, res) => {
  res.json({
    uptime: process.uptime(),
    memoryUsage: process.memoryUsage(),
    cpuUsage: process.cpuUsage(),
    activeConnections: pool.totalCount
  });
});

// Google OAuth configuration
const GOOGLE_CLIENT_ID = '897228285539-k8dt0tjic9bvi2ijbjgn2o5kf77rcdbh.apps.googleusercontent.com';
const GOOGLE_CLIENT_SECRET = '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';
const GOOGLE_REDIRECT_URI = 'http://localhost:8000/auth/google/callback';

const oauth2Client = new OAuth2Client(
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  GOOGLE_REDIRECT_URI
);

// Google OAuth routes
app.get('/auth/google', (req, res) => {
  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: ['email', 'profile'],
    prompt: 'consent',
    include_granted_scopes: true
  });
  console.log('Generated Google OAuth URL:', url);
  res.redirect(url);
});

app.get('/auth/google/callback', async (req, res) => {
  try {
    console.log('Google OAuth callback received with query params:', req.query);
    const { code, error } = req.query;
    
    if (error) {
      console.error('Google OAuth error:', error);
      return res.redirect(`${process.env.FRONTEND_URL}/auth/error?message=${encodeURIComponent(error)}`);
    }
    
    if (!code) {
      console.error('No authorization code received from Google');
      return res.redirect(`${process.env.FRONTEND_URL}/auth/error?message=no_code`);
    }

    console.log('Exchanging authorization code for tokens...');
    const { tokens } = await oauth2Client.getToken(code);
    console.log('Tokens received from Google');
    oauth2Client.setCredentials(tokens);

    console.log('Verifying ID token...');
    const ticket = await oauth2Client.verifyIdToken({
      idToken: tokens.id_token,
      audience: GOOGLE_CLIENT_ID
    });

    const payload = ticket.getPayload();
    console.log('Token payload:', { email: payload.email, name: payload.name });
    const { email, name } = payload;

    // Check if user exists
    console.log('Checking if user exists in database...');
    let user = await pool.query('SELECT * FROM users WHERE email = $1', [email]);

    if (user.rows.length === 0) {
      console.log('Creating new user...');
      // Create new user
      const result = await pool.query(
        'INSERT INTO users (id, email, full_name, is_google_auth) VALUES ($1, $2, $3, $4) RETURNING *',
        [uuidv4(), email, name, true]
      );
      user = result;
      console.log('New user created:', user.rows[0]);
    } else {
      // Update existing user to mark as Google auth
      await pool.query(
        'UPDATE users SET is_google_auth = true WHERE email = $1',
        [email]
      );
    }

    // Generate JWT token
    console.log('Generating JWT token...');
    const token = jwt.sign(
      { id: user.rows[0].id, email: user.rows[0].email },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    console.log('Redirecting to frontend with token...');
    res.redirect(`${process.env.FRONTEND_URL}/auth/callback?token=${token}`);
  } catch (error) {
    console.error('Google OAuth error details:', {
      message: error.message,
      stack: error.stack,
      code: error.code,
      response: error.response?.data
    });
    res.redirect(`${process.env.FRONTEND_URL}/auth/error?message=${encodeURIComponent(error.message)}`);
  }
});

// Backblaze B2 Configuration
const b2Config = {
  accountId: '0050526829e47e40000000003',
  applicationKey: 'K005llCKBSoscSaL/odeahd/NEC6puI',
  bucketId: '60253276a812996e94670e14',
  bucketName: 'secure-docs3963',
  apiUrl: 'https://api.backblazeb2.com'
};

// B2 API Manager
class B2ApiManager {
  constructor() {
    this.authToken = null;
    this.apiUrl = null;
    this.downloadUrl = null;
    this.uploadUrl = null;
    this.uploadAuthToken = null;
  }

  async authorize() {
    try {
      const response = await axios.get(`${b2Config.apiUrl}/b2api/v2/b2_authorize_account`, {
        auth: {
          username: b2Config.accountId,
          password: b2Config.applicationKey
        }
      });

      this.authToken = response.data.authorizationToken;
      this.apiUrl = response.data.apiUrl;
      this.downloadUrl = response.data.downloadUrl;
      
      // Get upload URL
      const uploadUrlResponse = await axios.get(
        `${this.apiUrl}/b2api/v2/b2_get_upload_url`,
        {
          params: { bucketId: b2Config.bucketId },
          headers: { Authorization: this.authToken }
        }
      );

      this.uploadUrl = uploadUrlResponse.data.uploadUrl;
      this.uploadAuthToken = uploadUrlResponse.data.authorizationToken;

      return response.data;
    } catch (error) {
      console.error('B2 authorization error:', error.response?.data || error.message);
      throw error;
    }
  }

  async getDownloadUrl(fileId) {
    try {
      if (!this.authToken || !this.downloadUrl) {
        await this.authorize();
      }

      // Get file info to get the file name
      const fileInfoResponse = await axios.get(
        `${this.apiUrl}/b2api/v2/b2_get_file_info`,
        {
          params: { fileId },
          headers: { Authorization: this.authToken }
        }
      );

      const fileName = fileInfoResponse.data.fileName;
      
      // Get a pre-signed URL for the file
      const downloadAuthResponse = await axios.get(
        `${this.apiUrl}/b2api/v2/b2_get_download_authorization`,
        {
          params: {
            bucketId: b2Config.bucketId,
            fileNamePrefix: fileName,
            validDurationInSeconds: 3600 // URL valid for 1 hour
          },
          headers: { Authorization: this.authToken }
        }
      );

      const authToken = downloadAuthResponse.data.authorizationToken;
      
      // Construct the download URL with authorization token
      return `${this.downloadUrl}/file/${b2Config.bucketName}/${fileName}?Authorization=${authToken}`;
    } catch (error) {
      console.error('B2 get download URL error:', error.response?.data || error.message);
      throw error;
    }
  }

  async uploadFile(fileBuffer, fileName, contentType) {
    try {
      if (!this.uploadUrl || !this.uploadAuthToken) {
        await this.authorize();
      }

      const sha1 = crypto.createHash('sha1').update(fileBuffer).digest('hex');

      const response = await axios.post(this.uploadUrl, fileBuffer, {
        headers: {
          'Authorization': this.uploadAuthToken,
          'Content-Type': contentType,
          'Content-Length': fileBuffer.length,
          'X-Bz-File-Name': fileName,
          'X-Bz-Content-Sha1': sha1
        }
      });

      return response.data;
    } catch (error) {
      console.error('B2 upload error:', error.response?.data || error.message);
      throw error;
    }
  }
}

// Document Storage Manager using B2
class DocumentStorageManager {
  constructor() {
    this.b2 = new B2ApiManager();
  }

  // Generate document path
  getDocumentPath(userId, documentId, version = 'latest', filename = null) {
    const basePath = `users/${userId}/documents/${documentId}`;
    if (version !== 'latest') {
      return `${basePath}/versions/${version}/${filename}`;
    }
    return `${basePath}/${filename}`;
  }

  // Upload document with metadata
  async uploadDocument(userId, file, metadata = {}) {
    try {
      const documentId = uuidv4();
      const filePath = this.getDocumentPath(userId, documentId, 'latest', file.originalname);
      
      // Create document metadata
      const documentMetadata = {
        ...metadata,
        userId,
        documentId,
        originalName: file.originalname,
        mimeType: file.mimetype,
        size: file.size,
        createdAt: new Date().toISOString(),
        version: 1
      };

      // Upload file to B2
      const uploadResult = await this.b2.uploadFile(
        file.buffer,
        filePath,
        file.mimetype
      );

      return {
        documentId,
        filePath,
        metadata: documentMetadata,
        fileId: uploadResult.fileId,
        downloadUrl: await this.b2.getDownloadUrl(uploadResult.fileId)
      };
    } catch (error) {
      console.error('Error uploading document:', error);
      throw error;
    }
  }

  // Get document URL
  async getDocumentUrl(userId, documentId, version = 'latest') {
    try {
      const filePath = this.getDocumentPath(userId, documentId, version);
      // Note: This will need to be updated to get the fileId from your database
      const fileId = await this.getFileIdFromDatabase(documentId);
      return await this.b2.getDownloadUrl(fileId);
    } catch (error) {
      console.error('Error getting document URL:', error);
      throw error;
    }
  }

  // Delete document
  async deleteDocument(userId, documentId) {
    try {
      const filePath = this.getDocumentPath(userId, documentId);
      // Note: This will need to be updated to get the fileId from your database
      const fileId = await this.getFileIdFromDatabase(documentId);
      await this.b2.deleteFile(fileId, filePath);
    } catch (error) {
      console.error('Error deleting document:', error);
      throw error;
    }
  }

  // Helper method to get fileId from database
  async getFileIdFromDatabase(documentId) {
    const result = await pool.query(
      'SELECT file_id FROM documents WHERE id = $1',
      [documentId]
    );
    if (result.rows.length === 0) {
      throw new Error('Document not found');
    }
    return result.rows[0].file_id;
  }
}

// Initialize document storage manager
const documentStorage = new DocumentStorageManager();

// Start server
app.listen(PORT, HOST, () => {
  console.log(`Server running on http://${HOST}:${PORT}`);
});

// For testing purposes - create tables if they don't exist
pool.query(`
  CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(100) PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255),
    full_name VARCHAR(255),
    mobile_number VARCHAR(50),
    security_pin VARCHAR(6),
    is_google_auth BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT auth_check CHECK (
      (password_hash IS NOT NULL) OR 
      (is_google_auth = true)
    )
  );

  -- Add is_google_auth column if it doesn't exist
  DO $$
  BEGIN
    IF NOT EXISTS (
      SELECT 1 
      FROM information_schema.columns 
      WHERE table_name = 'users' 
      AND column_name = 'is_google_auth'
    ) THEN
      ALTER TABLE users ADD COLUMN is_google_auth BOOLEAN DEFAULT false;
    END IF;
  END $$;

  -- Make password_hash nullable if it's not already
  DO $$
  BEGIN
    IF EXISTS (
      SELECT 1 
      FROM information_schema.columns 
      WHERE table_name = 'users' 
      AND column_name = 'password_hash'
      AND is_nullable = 'NO'
    ) THEN
      ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;
    END IF;
  END $$;

  -- Drop and recreate documents table to add new columns
  DROP TABLE IF EXISTS documents CASCADE;
  CREATE TABLE documents (
    id VARCHAR(100) PRIMARY KEY,
    user_id VARCHAR(100) REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    type VARCHAR(100) NOT NULL,
    size INTEGER NOT NULL,
    file_path VARCHAR(500) NOT NULL,
    file_id VARCHAR(100),
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS qr_codes (
    id VARCHAR(100) PRIMARY KEY,
    user_id VARCHAR(100) REFERENCES users(id) ON DELETE CASCADE,
    code VARCHAR(100) UNIQUE NOT NULL,
    access_code VARCHAR(50),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP WITH TIME ZONE
  );

  CREATE TABLE IF NOT EXISTS access_requests (
    id VARCHAR(100) PRIMARY KEY,
    qr_code_id VARCHAR(100) REFERENCES qr_codes(id) ON DELETE CASCADE,
    requester_name VARCHAR(255) NOT NULL,
    status VARCHAR(50) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS requested_documents (
    id VARCHAR(100) PRIMARY KEY,
    access_request_id VARCHAR(100) REFERENCES access_requests(id) ON DELETE CASCADE,
    document_id VARCHAR(100) REFERENCES documents(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
  );
`).then(() => {
  console.log('Tables created successfully');
}).catch(err => {
  console.error('Error creating tables:', err);
});