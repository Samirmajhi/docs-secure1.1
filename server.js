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

// Get network interfaces
const networkInterfaces = os.networkInterfaces();
let localIP = '0.0.0.0';

// Find the first non-internal IPv4 address
for (const interfaceName of Object.keys(networkInterfaces)) {
  const networkInterface = networkInterfaces[interfaceName];
  for (const iface of networkInterface) {
    if (iface.family === 'IPv4' && !iface.internal) {
      localIP = iface.address;
      break;
    }
  }
  if (localIP !== '0.0.0.0') break;
}

const PORT = process.env.PORT || 8000;
const HOST = localIP;

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

// Configure CORS
app.use(cors({
  origin: process.env.NODE_ENV === 'production' 
    ? process.env.FRONTEND_URL 
    : ['http://localhost:5173', 'http://192.168.100.28:5173'],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
  preflightContinue: false,
  optionsSuccessStatus: 204
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
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    
    console.log(`Authentication attempt for ${req.method} ${req.path}`);
    
    if (!token) {
      console.error('Authentication failed: No token provided');
      return res.status(401).json({ 
        message: 'Authentication token required',
        error: 'token_missing'
      });
    }
    
    jwt.verify(token, JWT_SECRET, async (err, user) => {
      if (err) {
        console.error('Authentication failed: Token verification error', err.message);
        if (err.name === 'TokenExpiredError') {
          return res.status(401).json({ 
            message: 'Your session has expired. Please log in again.',
            error: 'token_expired' 
          });
        }
        return res.status(403).json({ 
          message: 'Invalid token. Please log in again.',
          error: 'token_invalid' 
        });
      }
      
      // Validate that the user exists in the database before proceeding
      if (user && user.id) {
        try {
          const userCheck = await pool.query('SELECT id FROM users WHERE id = $1', [user.id]);
          if (userCheck.rows.length === 0) {
            console.error(`Authentication failed: User ${user.id} from token not found in database`);
            return res.status(404).json({ 
              message: 'User account not found. You may need to register again.',
              error: 'user_not_found'
            });
          }
        } catch (dbError) {
          console.error('Database error in token validation:', dbError);
          // Continue processing even if validation fails
        }
      }
      
      console.log(`Authenticated user: ${user.id} (${user.email || 'email not in token'})`);
      req.user = user;
      next();
    });
  } catch (error) {
    console.error('Unexpected error in authentication middleware:', error);
    return res.status(500).json({ 
      message: 'Server error during authentication',
      error: 'auth_server_error'
    });
  }
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
    
    // Check if user already exists
    const userExists = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (userExists.rows.length > 0) {
      return res.status(400).json({ message: 'User already exists' });
    }
    
    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);
    
    // Format mobile number with +977 prefix
    let formattedMobileNumber = mobileNumber;
    if (mobileNumber) {
      // Remove any existing country code
      formattedMobileNumber = mobileNumber.replace(/^\+?\d{1,3}/, '');
      // Add +977 prefix
      formattedMobileNumber = '+977' + formattedMobileNumber;
    }
    
    // Start a transaction
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Get free plan id if no subscription is provided
      let userSubscriptionId = subscriptionId;
      if (!userSubscriptionId) {
        const freePlanResult = await client.query('SELECT id FROM subscription_plans WHERE name = $1', ['Free']);
        if (freePlanResult.rows.length > 0) {
          userSubscriptionId = freePlanResult.rows[0].id;
        } else {
          throw new Error('Free plan not found');
        }
      }

      // Create user with correct column names
      const userResult = await client.query(
        'INSERT INTO users (id, email, password_hash, full_name, mobile_number, security_pin, subscription_id) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id',
        [uuidv4(), email, hashedPassword, fullName, formattedMobileNumber, pin, userSubscriptionId]
      );
    
      const userId = userResult.rows[0].id;

      // Create initial subscription
      await client.query(
        'INSERT INTO user_subscriptions (user_id, plan_id, status) VALUES ($1, $2, $3)',
        [userId, userSubscriptionId, 'active']
      );

      await client.query('COMMIT');

      // Generate token for immediate login
      const token = jwt.sign(
        { id: userId, email },
        JWT_SECRET,
        { expiresIn: '24h' }
      );
    
      res.status(201).json({
        message: 'User registered successfully',
        token,
        user: {
          id: userId,
          email,
          fullName,
          mobileNumber: formattedMobileNumber,
          pin
        }
      });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
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
    
    // Check if user has a subscription_id, if not, assign Free plan
    if (!user.subscription_id) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        
        // Get free plan id
        const freePlanResult = await client.query('SELECT id FROM subscription_plans WHERE name = $1', ['Free']);
        if (freePlanResult.rows.length > 0) {
          const freePlanId = freePlanResult.rows[0].id;
          
          // Update user with free plan
          await client.query('UPDATE users SET subscription_id = $1 WHERE id = $2', [freePlanId, user.id]);
          
          // Check if user has an active subscription
          const subResult = await client.query(
            'SELECT * FROM user_subscriptions WHERE user_id = $1 AND status = $2',
            [user.id, 'active']
          );
          
          // Create subscription if not exists
          if (subResult.rows.length === 0) {
            await client.query(
              'INSERT INTO user_subscriptions (user_id, plan_id, status) VALUES ($1, $2, $3)',
              [user.id, freePlanId, 'active']
            );
          }
          
          await client.query('COMMIT');
        }
      } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error updating user subscription:', error);
      } finally {
        client.release();
      }
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
    
    // Ensure mobile number has +977 prefix
    let formattedMobileNumber = mobileNumber;
    if (mobileNumber) {
      // Remove any existing country code
      formattedMobileNumber = mobileNumber.replace(/^\+?\d{1,3}/, '');
      // Add +977 prefix
      formattedMobileNumber = '+977' + formattedMobileNumber;
    }
    
    const result = await pool.query(
      'UPDATE users SET full_name = $1, mobile_number = $2, security_pin = $3 WHERE id = $4 RETURNING id, email, full_name, mobile_number',
      [fullName, formattedMobileNumber, pin, userId]
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
    console.log('Document upload request from user:', req.user?.id || 'Unknown user');
    console.log('Request headers:', req.headers);
    
    if (!req.user || !req.user.id) {
      console.error('Authentication error: user information missing in request.');
      return res.status(401).json({ message: 'Authentication required. Please log in again.' });
    }
    
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

    console.log('Uploading document:', {
      filename: file.originalname,
      size: file.size,
      type: file.mimetype,
      customName: metadata.customName,
      userId: userId
    });

    // Check if user exists in database with more detailed error reporting
    try {
      const userExists = await pool.query('SELECT * FROM users WHERE id = $1', [userId]);
      if (userExists.rows.length === 0) {
        console.error(`User not found in database: ${userId}`);
        // Log token details for debugging (excluding sensitive parts)
        console.error('Token user info:', {
          id: req.user.id,
          email: req.user.email ? '(email exists)' : '(no email in token)'
        });
        return res.status(404).json({ 
          message: 'User not found in database. Please log in again.',
          error: 'user_not_found'
        });
      }
    } catch (dbError) {
      console.error('Database error checking user existence:', dbError);
      return res.status(500).json({ 
        message: 'Database error during user verification',
        error: 'database_error' 
      });
    }

    // Check if user has enough storage space based on their subscription plan
    const storageResult = await pool.query(`
      SELECT 
        u.storage_used as used,
        sp.storage_limit as limit,
        (u.storage_used + $1) as would_be_used,
        CASE 
          WHEN sp.storage_limit = 0 THEN true
          ELSE (u.storage_used + $1) <= sp.storage_limit
        END as has_available_storage,
        sp.name as plan_name
      FROM users u
      JOIN subscription_plans sp ON u.subscription_id = sp.id
      WHERE u.id = $2
    `, [file.size, userId]);

    if (storageResult.rows.length === 0) {
      return res.status(404).json({ message: 'User subscription information not found' });
    }

    const storageInfo = storageResult.rows[0];
    console.log('Storage check:', storageInfo);

    // If user doesn't have enough storage space, return an error
    if (!storageInfo.has_available_storage) {
      return res.status(413).json({
        message: 'Storage limit exceeded',
        error: 'subscription_limit_exceeded',
        details: {
          used: storageInfo.used,
          limit: storageInfo.limit,
          would_be_used: storageInfo.would_be_used,
          plan_name: storageInfo.plan_name
        }
      });
    }

    try {
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

      // Update the user's storage used
      await pool.query(
        'UPDATE users SET storage_used = storage_used + $1 WHERE id = $2',
        [file.size, userId]
      );

      console.log(`Document uploaded successfully for user ${userId}: ${result.documentId}`);
      
      res.status(201).json({
        message: 'Document uploaded successfully',
        document: dbResult.rows[0]
      });
    } catch (uploadError) {
      console.error('Document upload error details:', uploadError);
      if (uploadError.response?.data) {
        // Send the specific B2 error message
        return res.status(500).json({ 
          message: 'Storage service error during upload',
          details: uploadError.response.data.message || uploadError.message 
        });
      }
      throw uploadError; // re-throw to be caught by the outer catch
    }
  } catch (error) {
    console.error('Document upload error:', error);
    res.status(500).json({ 
      message: 'Server error during document upload',
      details: error.message
    });
  }
});

app.get('/api/documents', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    console.log('Fetching documents for user:', userId);
    
    const result = await pool.query(
      'SELECT * FROM documents WHERE user_id = $1 ORDER BY created_at DESC',
      [userId]
    );
    
    console.log('Found documents:', result.rows.length);
    console.log('Documents:', result.rows);
    
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
app.get('/api/documents/:id', async (req, res) => {
  try {
    const documentId = req.params.id;
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    let userId = null;
    let isOwner = false;

    // If token exists, verify it and get user ID
    if (token) {
      try {
        const decoded = jwt.verify(token, JWT_SECRET);
        userId = decoded.id;
        isOwner = decoded.isOwner;
      } catch (err) {
        console.error('Token verification error:', err);
      }
    }

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
    if (document.user_id !== userId && !isOwner) {
      // If not the owner, check if there's an approved access request
      const accessCheck = await pool.query(
        `SELECT ar.* FROM access_requests ar
         JOIN requested_documents rd ON ar.id = rd.access_request_id
         WHERE rd.document_id = $1 
         AND ar.status = 'approved'`,
        [documentId]
      );

      if (accessCheck.rows.length === 0) {
        return res.status(403).json({ message: 'Access denied' });
      }
    }

    // Get signed URL for document
    try {
      const url = await documentStorage.getDocumentUrl(document.user_id, documentId);
      
      if (!url) {
        throw new Error('Failed to generate document URL');
      }

      res.json({
        document,
        url
      });
    } catch (error) {
      console.error('Error generating document URL:', error);
      return res.status(500).json({ 
        message: 'Error generating document URL',
        error: 'url_generation_failed'
      });
    }
  } catch (error) {
    console.error('Error retrieving document:', error);
    res.status(500).json({ message: 'Server error while retrieving document' });
  }
});

// Add a new endpoint for document preview
app.get('/api/documents/:id/preview', async (req, res) => {
  try {
    const documentId = req.params.id;
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    let userId = null;
    let isOwner = false;

    // If token exists, verify it and get user ID
    if (token) {
      try {
        const decoded = jwt.verify(token, JWT_SECRET);
        userId = decoded.id;
        isOwner = decoded.isOwner;
      } catch (err) {
        console.error('Token verification error:', err);
      }
    }

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
    if (document.user_id !== userId && !isOwner) {
      // If not the owner, check if there's an approved access request
      const accessCheck = await pool.query(
        `SELECT ar.* FROM access_requests ar
         JOIN requested_documents rd ON ar.id = rd.access_request_id
         WHERE rd.document_id = $1 
         AND ar.status = 'approved'`,
        [documentId]
      );

      if (accessCheck.rows.length === 0) {
        return res.status(403).json({ message: 'Access denied' });
      }
    }

    // Get signed URL for document
    try {
      const url = await documentStorage.getDocumentUrl(document.user_id, documentId);
      
      if (!url) {
        throw new Error('Failed to generate document URL');
      }

      // Set appropriate headers for preview
      res.setHeader('Content-Type', document.type);
      res.setHeader('Content-Disposition', `inline; filename="${document.name}"`);

      // Stream the file from B2 to the client
      const response = await axios({
        method: 'get',
        url: url,
        responseType: 'stream'
      });

      response.data.pipe(res);
    } catch (error) {
      console.error('Error generating document URL:', error);
      return res.status(500).json({ 
        message: 'Error generating document URL',
        error: 'url_generation_failed'
      });
    }
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
    console.log('User ID:', userId);
    // Generate unique code for QR
    const qrUniqueCode = uuidv4();
    const qrCodeId = uuidv4(); // Generate a unique ID for the QR code record
    console.log('Generated unique code:', qrUniqueCode);
    
    // Save QR code in database
    const result = await pool.query(
      'INSERT INTO qr_codes (id,user_id, code, access_code, is_active, expires_at) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
      [qrCodeId,userId, qrUniqueCode, accessCode || null, true, new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)] // Expires in 30 days
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
    const { qrCodeId, requesterName, requesterMobile, requestedDocuments } = req.body;
    
    // Validate required fields
    if (!qrCodeId || !requesterName || !requesterMobile || !requestedDocuments || !Array.isArray(requestedDocuments)) {
      console.error('Missing required fields:', { qrCodeId, requesterName, requesterMobile, requestedDocuments });
      return res.status(400).json({ message: 'Missing required fields or invalid format' });
    }

    // Validate mobile number format
    const mobileRegex = /^\d{10}$/;
    if (!mobileRegex.test(requesterMobile)) {
      return res.status(400).json({ 
        message: 'Mobile number must be exactly 10 digits',
        error: 'invalid_mobile_format'
      });
    }
    
    // Validate QR code
    const qrResult = await pool.query(
      'SELECT qr_codes.*, users.mobile_number, users.email, users.full_name FROM qr_codes JOIN users ON qr_codes.user_id = users.id WHERE qr_codes.id = $1 AND qr_codes.is_active = true AND qr_codes.expires_at > NOW()',
      [qrCodeId]
    );
    
    if (qrResult.rows.length === 0) {
      console.error('QR code not found or expired:', qrCodeId);
      return res.status(404).json({ message: 'QR code not found, inactive, or expired' });
    }
    
    const qrCode = qrResult.rows[0];
    
    // Check if the requester is trying to access their own documents
    if (requesterName === qrCode.full_name) {
      console.error('Self-access attempt:', { requesterName, ownerName: qrCode.full_name });
      return res.status(400).json({ message: 'You cannot request access to your own documents' });
    }
    
    // Verify that all requested documents belong to the QR code owner
    const documentsResult = await pool.query(
      'SELECT id, name FROM documents WHERE id = ANY($1::varchar[]) AND user_id = $2',
      [requestedDocuments, qrCode.user_id]
    );
    
    if (documentsResult.rows.length !== requestedDocuments.length) {
      console.error('Document ownership mismatch:', { requested: requestedDocuments.length, found: documentsResult.rows.length });
      return res.status(400).json({ message: 'One or more requested documents do not belong to the QR code owner' });
    }
    
    // Create access request
    const accessRequestId = uuidv4();
    
    // Start a transaction
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Insert document access request
      await client.query(
        'INSERT INTO access_requests (id, qr_code_id, requester_name, requester_mobile, status) VALUES ($1, $2, $3, $4, $5)',
        [accessRequestId, qrCodeId, requesterName, requesterMobile, 'pending']
      );
      
      // Add requested documents
      for (const docId of requestedDocuments) {
        const requestedDocId = uuidv4();
        await client.query(
          'INSERT INTO requested_documents (id, access_request_id, document_id) VALUES ($1, $2, $3)',
          [requestedDocId, accessRequestId, docId]
        );
      }

      await client.query('COMMIT');

      // Get the names of requested documents
      const documentNames = documentsResult.rows.map(doc => doc.name).join(', ');

      // Send email notification to the document owner
      if (qrCode.email) {
        console.log('Sending email notification to:', qrCode.email);
        const message = `Hello ${qrCode.full_name}, ${requesterName} has requested access to your documents: ${documentNames}.`;
        const emailSent = await sendEmail(qrCode.email, 'Document Access Request', message, accessRequestId);
        if (!emailSent) {
          console.warn('Failed to send email notification');
        }
      } else {
        console.warn('No email address found for document owner');
      }
      
      res.status(201).json({
        message: 'Access request submitted successfully',
        accessRequestId,
        ownerName: qrCode.full_name
      });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Access request error:', error);
    res.status(500).json({ message: 'Server error during access request' });
  }
});

app.post('/api/access/verify', async (req, res) => {
  try {
    const { mobileNumber, pin } = req.body;
    
    if (!mobileNumber || !pin) {
      return res.status(400).json({ 
        message: 'Mobile number and PIN are required',
        error: 'missing_credentials',
        shouldReturnToScanner: true
      });
    }
    
    // Format mobile number for comparison
    let formattedMobileNumber = mobileNumber;
    if (mobileNumber) {
      // Remove any existing country code
      formattedMobileNumber = mobileNumber.replace(/^\+?\d{1,3}/, '');
      // Add +977 prefix
      formattedMobileNumber = '+977' + formattedMobileNumber;
    }
    
    // Try both formats: with +977 and without
    const result = await pool.query(
      'SELECT * FROM users WHERE (mobile_number = $1 OR mobile_number = $2 OR mobile_number = $3) AND security_pin = $4',
      [formattedMobileNumber, mobileNumber, mobileNumber.replace(/^\+?/, ''), pin]
    );
    
    if (result.rows.length === 0) {
      return res.status(401).json({ 
        message: 'Invalid mobile number or PIN',
        error: 'invalid_credentials',
        shouldReturnToScanner: true
      });
    }
    
    const user = result.rows[0];
    
    // Check if user has any documents
    const documents = await pool.query(
      'SELECT * FROM documents WHERE user_id = $1',
      [user.id]
    );
    
    if (documents.rows.length === 0) {
      return res.status(404).json({ 
        message: 'No documents found for this user',
        error: 'no_documents',
        shouldReturnToScanner: true
      });
    }
    
    // Generate token for authenticated owner with shorter expiration
    const token = jwt.sign(
      { 
        id: user.id, 
        email: user.email, 
        isOwner: true,
        mobileNumber: user.mobile_number
      },
      JWT_SECRET,
      { expiresIn: '1h' }
    );
    
    res.json({
      message: 'Owner verification successful',
      token,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.full_name,
        mobileNumber: user.mobile_number
      },
      documents: documents.rows
    });
  } catch (error) {
    console.error('Owner verification error:', error);
    res.status(500).json({ 
      message: 'Server error during owner verification',
      error: 'server_error',
      shouldReturnToScanner: true
    });
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

    // If user is authenticated and is the owner, allow access to all documents
    // If user is not authenticated or not the owner, only show approved documents
    const isOwner = userId === result.rows[0].owner_id;
    const isApproved = result.rows[0].status === 'approved';

    const request = {
      id: result.rows[0].id,
      requesterName: result.rows[0].requester_name,
      requesterMobile: result.rows[0].requester_mobile,
      status: result.rows[0].status,
      createdAt: result.rows[0].created_at,
      isOwner: isOwner,
      documents: isOwner || isApproved 
        ? result.rows.map(row => ({
            id: row.document_id,
            name: row.name,
            type: row.type,
            size: row.size
          }))
        : []
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
    const { selectedDocuments } = req.body;
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

    // Start a transaction
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Get all requested documents
      const requestedDocsResult = await client.query(
        `SELECT d.id, d.name 
         FROM documents d
         JOIN requested_documents rd ON d.id = rd.document_id
         WHERE rd.access_request_id = $1`,
        [requestId]
      );

      // Delete documents that were not selected
      await client.query(
        `DELETE FROM requested_documents 
         WHERE access_request_id = $1 
         AND document_id NOT IN (SELECT unnest($2::varchar[]))`,
        [requestId, selectedDocuments]
      );

      // Update request status
      await client.query(
        'UPDATE access_requests SET status = $1 WHERE id = $2',
        ['approved', requestId]
      );

      await client.query('COMMIT');

      // Get the approved documents
      const approvedDocsResult = await client.query(
        `SELECT d.* 
         FROM documents d
         JOIN requested_documents rd ON d.id = rd.document_id
         WHERE rd.access_request_id = $1`,
        [requestId]
      );

      // Find removed documents
      const removedDocuments = requestedDocsResult.rows
        .filter(doc => !selectedDocuments.includes(doc.id))
        .map(doc => doc.name);

      // Send success response with documents and removed documents info
      res.json({
        success: true,
        message: 'Access request approved successfully',
        documents: approvedDocsResult.rows,
        removedDocuments
      });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
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
      const requestedDocId = uuidv4();
      await pool.query(
        'INSERT INTO requested_documents (id, access_request_id, document_id) VALUES ($1, $2, $3)',
        [requestedDocId, requestId, docId]
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
    let isOwner = false;

    // If token exists, verify it and get user ID
    if (token) {
      try {
        const decoded = jwt.verify(token, JWT_SECRET);
        userId = decoded.id;
        isOwner = decoded.isOwner;
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
    if (!userId || (userId !== document.user_id && !isOwner)) {
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
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '897228285539-k8dt0tjic9bvi2ijbjgn2o5kf77rcdbh.apps.googleusercontent.com';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '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';
const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || 'https://localhost:8000/auth/google/callback';

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
      // Create new user with empty mobile number and PIN
      const result = await pool.query(
        'INSERT INTO users (id, email, full_name, is_google_auth, mobile_number, security_pin) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
        [uuidv4(), email, name, true, null, null]
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
      console.log('Download file name (from B2):', fileName);
      
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
      
      // The fileName is already URL-encoded from B2, so we can use it directly
      // Construct the download URL with authorization token
      const downloadUrl = `${this.downloadUrl}/file/${b2Config.bucketName}/${fileName}?Authorization=${authToken}`;
      console.log('Generated download URL:', downloadUrl);
      
      return downloadUrl;
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

      // URL encode the file name to handle spaces and special characters
      const encodedFileName = encodeURIComponent(fileName);
      console.log('Original file name:', fileName);
      console.log('Encoded file name:', encodedFileName);

      const response = await axios.post(this.uploadUrl, fileBuffer, {
        headers: {
          'Authorization': this.uploadAuthToken,
          'Content-Type': contentType,
          'Content-Length': fileBuffer.length,
          'X-Bz-File-Name': encodedFileName,
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
    // Sanitize the filename by removing any invalid characters
    let sanitizedFilename = filename;
    if (sanitizedFilename) {
      // Replace any characters that might cause issues but keep spaces (they'll be URL-encoded later)
      sanitizedFilename = sanitizedFilename.replace(/[/\\?%*:|"<>]/g, '_');
    }
    
    const basePath = `users/${userId}/documents/${documentId}`;
    if (version !== 'latest') {
      return `${basePath}/versions/${version}/${sanitizedFilename}`;
    }
    return `${basePath}/${sanitizedFilename}`;
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

// Drop and recreate all tables on server start
const initializeDatabase = async () => {
  try {
    // Create tables if they don't exist (instead of dropping and recreating)
    await pool.query(`
      -- First create subscription_plans table if it doesn't exist
      CREATE TABLE IF NOT EXISTS subscription_plans (
        id SERIAL PRIMARY KEY,
        name VARCHAR(50) UNIQUE NOT NULL,
        storage_limit BIGINT NOT NULL,
        price DECIMAL(10,2),
        features JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Insert default subscription plans if they don't exist
      INSERT INTO subscription_plans (name, storage_limit, price, features) 
      VALUES 
        ('Free', 5242880, 0, '{"features": ["Basic document upload", "Unlimited QR codes", "Standard security", "Community support"]}'),
        ('Pro', 15728640, 9.99, '{"features": ["Advanced document management", "Unlimited QR codes", "Priority support", "Document versioning", "Custom expiration"]}'),
        ('Enterprise', 0, null, '{"features": ["Custom storage limit", "Team management", "API access", "Custom integrations", "Dedicated support"]}')
      ON CONFLICT (name) DO NOTHING;

      -- Create users table if it doesn't exist
      CREATE TABLE IF NOT EXISTS users (
        id VARCHAR(100) PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255),
        full_name VARCHAR(255),
        mobile_number VARCHAR(50),
        security_pin VARCHAR(6),
        is_google_auth BOOLEAN DEFAULT false,
        subscription_id INTEGER REFERENCES subscription_plans(id),
        storage_used BIGINT DEFAULT 0,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT auth_check CHECK (
          (password_hash IS NOT NULL) OR 
          (is_google_auth = true)
        )
      );

      -- Create user subscriptions table if it doesn't exist
      CREATE TABLE IF NOT EXISTS user_subscriptions (
        id SERIAL PRIMARY KEY,
        user_id VARCHAR(100) REFERENCES users(id),
        plan_id INTEGER REFERENCES subscription_plans(id),
        storage_used BIGINT DEFAULT 0,
        status VARCHAR(20) DEFAULT 'active',
        start_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        end_date TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Create documents table if it doesn't exist
      CREATE TABLE IF NOT EXISTS documents (
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

      -- Create QR codes table if it doesn't exist
      CREATE TABLE IF NOT EXISTS qr_codes (
        id VARCHAR(100) PRIMARY KEY,
        user_id VARCHAR(100) REFERENCES users(id) ON DELETE CASCADE,
        code VARCHAR(100) UNIQUE NOT NULL,
        access_code VARCHAR(50),
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        expires_at TIMESTAMP WITH TIME ZONE
      );

      -- Create access requests table if it doesn't exist
      CREATE TABLE IF NOT EXISTS access_requests (
        id VARCHAR(100) PRIMARY KEY,
        qr_code_id VARCHAR(100) REFERENCES qr_codes(id) ON DELETE CASCADE,
        requester_name VARCHAR(255) NOT NULL,
        requester_mobile VARCHAR(255) NOT NULL,
        status VARCHAR(50) NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      -- Add requester_mobile column if it doesn't exist
      DO $$ 
      BEGIN
        BEGIN
          -- First add the column as nullable
          ALTER TABLE access_requests ADD COLUMN requester_mobile VARCHAR(255);
          -- Update existing rows with a default value
          UPDATE access_requests SET requester_mobile = 'N/A' WHERE requester_mobile IS NULL;
          -- Now make the column NOT NULL
          ALTER TABLE access_requests ALTER COLUMN requester_mobile SET NOT NULL;
        EXCEPTION
          WHEN duplicate_column THEN 
            NULL;
        END;
      END $$;

      -- Create requested documents table if it doesn't exist
      CREATE TABLE IF NOT EXISTS requested_documents (
        id VARCHAR(100) PRIMARY KEY,
        access_request_id VARCHAR(100) REFERENCES access_requests(id) ON DELETE CASCADE,
        document_id VARCHAR(100) REFERENCES documents(id) ON DELETE CASCADE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    console.log('Database tables created or verified successfully');
  } catch (error) {
    console.error('Error initializing database:', error);
    throw error;
  }
};

// Initialize database before starting server
initializeDatabase().then(() => {
  // Start server
  app.listen(PORT, HOST, () => {
    console.log(`Server running on http://${HOST}:${PORT}`);
  });
}).catch(error => {
  console.error('Failed to initialize database:', error);
  process.exit(1);
});

// Subscription endpoints
app.get('/api/subscription/plans', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM subscription_plans ORDER BY price ASC');
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching subscription plans:', error);
    res.status(500).json({ error: 'Failed to fetch subscription plans' });
  }
});

app.get('/api/subscription/user', authenticateToken, async (req, res) => {
  const client = await pool.connect();
  try {
    const userId = req.user.id;
    await client.query('BEGIN');
    
    // Check if user has a subscription plan
    const userResult = await client.query(
      'SELECT subscription_id FROM users WHERE id = $1',
      [userId]
    );
    
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // If user doesn't have a subscription, assign Free plan
    if (!userResult.rows[0].subscription_id) {
      const freePlanResult = await client.query('SELECT id FROM subscription_plans WHERE name = $1', ['Free']);
      if (freePlanResult.rows.length > 0) {
        const freePlanId = freePlanResult.rows[0].id;
        
        // Update user with free plan
        await client.query('UPDATE users SET subscription_id = $1 WHERE id = $2', [freePlanId, userId]);
        
        // Create subscription if not exists
        await client.query(
          'INSERT INTO user_subscriptions (user_id, plan_id, status) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
          [userId, freePlanId, 'active']
        );
        
        await client.query('COMMIT');
      }
    } else {
      await client.query('ROLLBACK');
    }
    
    // Get user subscription with plan details
    const result = await client.query(`
      SELECT sp.*, us.status as subscription_status, us.start_date, us.end_date
      FROM subscription_plans sp
      JOIN users u ON u.subscription_id = sp.id
      LEFT JOIN user_subscriptions us ON us.user_id = u.id AND us.status = 'active'
      WHERE u.id = $1
    `, [userId]);

    if (result.rows.length === 0) {
      // If no subscription found, return free plan
      const freePlan = await client.query('SELECT * FROM subscription_plans WHERE name = $1', ['Free']);
      return res.json({
        ...freePlan.rows[0],
        subscription_status: 'active',
        start_date: new Date(),
        end_date: null
      });
    }

    res.json(result.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error fetching user subscription:', error);
    res.status(500).json({ error: 'Failed to fetch subscription' });
  } finally {
    client.release();
  }
});

app.get('/api/subscription/storage', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const result = await pool.query(`
      SELECT 
        u.storage_used as used,
        sp.storage_limit as limit,
        CASE 
          WHEN sp.storage_limit = 0 THEN true
          ELSE u.storage_used < sp.storage_limit
        END as has_available_storage
      FROM users u
      JOIN subscription_plans sp ON u.subscription_id = sp.id
      WHERE u.id = $1
    `, [userId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'No storage data found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching storage usage:', error);
    res.status(500).json({ error: 'Failed to fetch storage usage' });
  }
});

app.post('/api/subscription/update', authenticateToken, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    const userId = req.user.id;
    const { planId } = req.body;

    // Verify plan exists
    const planCheck = await client.query('SELECT * FROM subscription_plans WHERE id = $1', [planId]);
    if (planCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Subscription plan not found' });
    }

    // Get current subscription
    const currentSub = await client.query(`
      SELECT us.*, sp.storage_limit 
      FROM user_subscriptions us
      JOIN subscription_plans sp ON us.plan_id = sp.id
      WHERE us.user_id = $1 AND us.status = 'active'
    `, [userId]);

    // If upgrading to a plan with less storage than used, prevent the change
    if (currentSub.rows.length > 0) {
      const currentStorage = await client.query(
        'SELECT storage_used FROM users WHERE id = $1',
        [userId]
      );
      
      if (currentStorage.rows[0].storage_used > planCheck.rows[0].storage_limit && planCheck.rows[0].storage_limit !== 0) {
        return res.status(400).json({ 
          error: 'Cannot downgrade: Current storage usage exceeds new plan limit' 
        });
      }
    }

    // Deactivate current subscription
    if (currentSub.rows.length > 0) {
      await client.query(
        'UPDATE user_subscriptions SET status = $1, end_date = CURRENT_TIMESTAMP WHERE id = $2',
        ['inactive', currentSub.rows[0].id]
      );
    }

    // Update user's subscription
    await client.query('UPDATE users SET subscription_id = $1 WHERE id = $2', [planId, userId]);

    // Create new subscription
    await client.query(`
      INSERT INTO user_subscriptions (user_id, plan_id, status, start_date)
      VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
    `, [userId, planId, 'active']);

    await client.query('COMMIT');

    res.json({ 
      message: 'Subscription updated successfully',
      plan: planCheck.rows[0]
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error updating subscription:', error);
    res.status(500).json({ error: 'Failed to update subscription' });
  } finally {
    client.release();
  }
});

// Check if file would exceed storage limit
app.post('/api/documents/check-storage', authenticateToken, async (req, res) => {
  try {
    console.log('Check storage request from user:', req.user?.id || 'Unknown user');
    console.log('Check storage request body:', req.body);
    
    if (!req.user || !req.user.id) {
      console.error('Authentication error: user information missing in request.');
      return res.status(401).json({ message: 'Authentication required. Please log in again.' });
    }
    
    // Validate fileSize input
    const fileSize = parseInt(req.body.fileSize);
    
    if (isNaN(fileSize) || fileSize <= 0) {
      console.error('Invalid file size received:', req.body.fileSize);
      return res.status(400).json({ message: 'Invalid file size. Please provide a positive number.' });
    }
    
    const userId = req.user.id;
    console.log('Checking storage for user:', userId, 'with file size:', fileSize);

    try {
      // Check if user exists in database with detailed error reporting
      const userExists = await pool.query('SELECT * FROM users WHERE id = $1', [userId]);
      
      if (userExists.rows.length === 0) {
        console.error(`User not found in database: ${userId}`);
        // Log token details for debugging (excluding sensitive parts)
        console.error('Token user info:', {
          id: req.user.id,
          email: req.user.email ? '(email exists)' : '(no email in token)'
        });
        return res.status(404).json({ 
          message: 'User not found in database. Please log in again.',
          error: 'user_not_found',
          details: 'Your account information could not be found. You may need to register again.'
        });
      }

      // Check if user has enough storage space based on their subscription plan
      const storageResult = await pool.query(`
        SELECT 
          u.storage_used as used,
          sp.storage_limit as limit,
          (u.storage_used + $1) as would_be_used,
          CASE 
            WHEN sp.storage_limit = 0 THEN true
            ELSE (u.storage_used + $1) <= sp.storage_limit
          END as has_available_storage,
          sp.name as plan_name
        FROM users u
        JOIN subscription_plans sp ON u.subscription_id = sp.id
        WHERE u.id = $2
      `, [fileSize, userId]);

      if (storageResult.rows.length === 0) {
        console.error(`User subscription information not found for user: ${userId}`);
        
        // Check if user is missing subscription_id
        const userSubscription = await pool.query('SELECT subscription_id FROM users WHERE id = $1', [userId]);
        
        if (userSubscription.rows[0] && !userSubscription.rows[0].subscription_id) {
          // User exists but has no subscription, auto-assign free plan
          const freePlanResult = await pool.query('SELECT id FROM subscription_plans WHERE name = $1', ['Free']);
          
          if (freePlanResult.rows.length > 0) {
            const freePlanId = freePlanResult.rows[0].id;
            
            // Update user with free plan
            await pool.query('UPDATE users SET subscription_id = $1 WHERE id = $2', [freePlanId, userId]);
            
            // Return free plan limits
            const freePlan = await pool.query(`
              SELECT 
                0 as used,
                sp.storage_limit as limit,
                $1 as would_be_used,
                CASE 
                  WHEN sp.storage_limit = 0 THEN true
                  ELSE $1 <= sp.storage_limit
                END as has_available_storage,
                sp.name as plan_name
              FROM subscription_plans sp
              WHERE sp.id = $2
            `, [fileSize, freePlanId]);
            
            if (freePlan.rows.length > 0) {
              const storageInfo = freePlan.rows[0];
              return res.json({
                has_available_storage: storageInfo.has_available_storage,
                storage_info: {
                  used: storageInfo.used,
                  limit: storageInfo.limit,
                  would_be_used: storageInfo.would_be_used,
                  plan_name: storageInfo.plan_name
                }
              });
            }
          }
        }
        
        return res.status(404).json({ 
          message: 'User subscription information not found',
          error: 'subscription_not_found' 
        });
      }

      const storageInfo = storageResult.rows[0];
      console.log('Storage check result:', storageInfo);

      res.json({
        has_available_storage: storageInfo.has_available_storage,
        storage_info: {
          used: storageInfo.used,
          limit: storageInfo.limit,
          would_be_used: storageInfo.would_be_used,
          plan_name: storageInfo.plan_name
        }
      });
    } catch (dbError) {
      console.error('Database error during storage check:', dbError);
      return res.status(500).json({ 
        message: 'Database error during storage check',
        error: 'database_error'
      });
    }
  } catch (error) {
    console.error('Storage check error:', error);
    res.status(500).json({ 
      message: 'Server error during storage check',
      error: 'server_error',
      details: error.message
    });
  }
});