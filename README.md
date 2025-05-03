
# SecureDoc - Secure Document Sharing Platform

SecureDoc is a secure document management and sharing platform that allows users to safely store, manage, and share their important documents with others through QR codes.

## Features

- **Secure Document Storage**: Upload and manage your sensitive documents securely
- **QR Code Sharing**: Generate QR codes to share specific documents with others
- **Optional Access Code**: Add an extra layer of security with access codes for your QR codes
- **Document Format Conversion**: Download documents in various formats (PDF, DOCX, TXT, JPG)
- **Access Management**: Control who can access your documents and for how long
- **Mobile Verification**: Verify document owners through mobile number and PIN

## Technology Stack

- **Frontend**: React, TypeScript, Tailwind CSS, Shadcn UI
- **Backend**: Node.js, Express.js
- **Database**: PostgreSQL
- **Authentication**: JWT (JSON Web Tokens)
- **File Storage**: Server-side file system storage

## Getting Started

### Prerequisites

- Node.js (v16+)
- PostgreSQL (v13+)

### Installation

1. Clone the repository:
   ```
   git clone https://github.com/yourusername/securedoc.git
   cd securedoc
   ```

2. Install dependencies:
   ```
   npm install
   ```

3. Set up environment variables:
   - Create a `.env` file in the root directory
   - Add the following variables:
     ```
     # API Settings
     VITE_API_URL=http://localhost:3000/api
     VITE_STORAGE_URL=http://localhost:3000/storage

     # Auth Settings
     VITE_JWT_SECRET=your-secret-key

     # Database settings
     VITE_DB_HOST=localhost
     VITE_DB_PORT=5432
     VITE_DB_NAME=securedoc
     VITE_DB_USER=securedocuser
     VITE_DB_PASSWORD=your-secure-password
     ```

4. Start the backend server:
   ```
   npm run server
   ```

5. Start the frontend development server:
   ```
   npm run dev
   ```

### Production Deployment

For production deployment:

1. Build the frontend:
   ```
   npm run build
   ```

2. Configure your production environment variables
   
3. Deploy the backend server
   
4. Set up a web server (Nginx/Apache) to serve the frontend build files

## Security Features

- JWT-based authentication
- Secure document storage
- Optional access codes for QR codes
- Mobile verification for document owners
- Limited-time access to shared documents
- Document access logging

## License

This project is licensed under the MIT License - see the LICENSE file for details.