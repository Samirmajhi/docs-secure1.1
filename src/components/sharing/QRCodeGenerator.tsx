import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Loader, QrCode, RefreshCw, Download, Copy } from 'lucide-react';
import { toast } from 'sonner';
import { motion } from 'framer-motion';
import qrcodeService from '@/services/qrcode.service';
import { useAuth } from '@/context/AuthContext';

const QRCodeGenerator = () => {
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [expiryDate, setExpiryDate] = useState<string | null>(null);
  const [qrCodeUrl, setQrCodeUrl] = useState<string | null>(null);
  const { user } = useAuth();
  
  // Check localStorage for existing QR code on mount instead of auto-generating
  useEffect(() => {
    const storedQRCode = localStorage.getItem('latestQRCode');
    if (storedQRCode) {
      try {
        const parsedQRCode = JSON.parse(storedQRCode);
        if (new Date(parsedQRCode.expiresAt) > new Date()) {
          setQrCode(parsedQRCode.qrImage);
          setExpiryDate(new Date(parsedQRCode.expiresAt).toLocaleDateString());
          
          // Use the server's QR code URL
          const qrCodeUrlValue = `${process.env.FRONTEND_URL || 'http://192.168.5.22:5173'}/access?code=${encodeURIComponent(parsedQRCode.code)}`;
          setQrCodeUrl(qrCodeUrlValue);
          
          console.log('Loaded existing QR code from storage with URL:', qrCodeUrlValue);
        } else {
          console.log('Stored QR code has expired, will need to generate a new one');
          localStorage.removeItem('latestQRCode');
        }
      } catch (error) {
        console.error('Error parsing stored QR code:', error);
        localStorage.removeItem('latestQRCode');
      }
    }
  }, []);

  const generateQRCode = async () => {
    try {
      setLoading(true);
      console.log('Generating QR code without access code');
      
      const response = await qrcodeService.generateQRCode();
      
      setQrCode(response.qrCode);
      setExpiryDate(new Date(response.expiresAt).toLocaleDateString());
      
      // Use the URL from the server's response
      const uniqueCode = response.uniqueCode || '';
      
      if (!uniqueCode) {
        console.error('No unique code received from server');
        toast.error('Error generating QR code: missing unique identifier');
        return;
      }
      
      // Set the QR code URL from the server's response
      if (response.qrCodeUrl) {
        setQrCodeUrl(response.qrCodeUrl);
        console.log('Using QR code URL from server:', response.qrCodeUrl);
      } else {
        // Fallback to constructing the URL if server didn't provide one
        const frontendUrl = process.env.FRONTEND_URL || 'http://192.168.5.22:5173';
        const qrCodeUrlValue = `${frontendUrl}/access?code=${encodeURIComponent(uniqueCode)}`;
        setQrCodeUrl(qrCodeUrlValue);
        console.log('Constructed QR code URL:', qrCodeUrlValue);
      }
      
      // Store in localStorage with the server's QR code
      const qrCodeData = {
        code: uniqueCode,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days
        qrImage: response.qrCode 
      };
      localStorage.setItem('latestQRCode', JSON.stringify(qrCodeData));
      console.log('Stored QR code in localStorage with new expiration:', qrCodeData);
      
      toast.success('QR code generated successfully');
    } catch (error) {
      console.error('QR generation error:', error);
      toast.error('Failed to generate QR code. Using default placeholder.');
      
      // Provide a fallback QR code with a working URL
      const frontendUrl = process.env.FRONTEND_URL || 'http://192.168.5.22:5173';
      
      // Create a fallback code and store it
      const fallbackCode = `fallback-${Date.now()}`;
      const fallbackQrCode = `data:image/svg+xml;base64,${btoa(`
        <svg width="200" height="200" xmlns="http://www.w3.org/2000/svg">
          <rect width="200" height="200" style="fill:white"/>
          <rect x="50" y="50" width="100" height="100" style="fill:black"/>
          <text x="50" y="170" font-family="Arial" font-size="12" fill="black">Mock QR Code</text>
        </svg>
      `)}`;
      
      const qrCodeData = {
        code: fallbackCode,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days
        qrImage: fallbackQrCode
      };
      localStorage.setItem('latestQRCode', JSON.stringify(qrCodeData));
      
      const fallbackUrl = `${frontendUrl}/access?code=${encodeURIComponent(fallbackCode)}`;
      setQrCodeUrl(fallbackUrl);
      setQrCode(fallbackQrCode);
      setExpiryDate(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toLocaleDateString());
      
      console.log('Created fallback QR code with URL:', fallbackUrl);
      console.log('Using frontend URL:', frontendUrl);
    } finally {
      setLoading(false);
    }
  };

  const downloadQRCode = () => {
    if (!qrCode) return;
    
    const link = document.createElement('a');
    link.href = qrCode;
    link.download = 'securedoc-qrcode.png';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    toast.success('QR code downloaded');
  };

  const copyQRCodeLink = () => {
    if (!qrCodeUrl) return;
    
    navigator.clipboard.writeText(qrCodeUrl);
    toast.success('Access link copied to clipboard');
    
    // Display the URL for testing
    console.log('Copied URL:', qrCodeUrl);
  };

  return (
    <div className="bg-white rounded-xl border border-border shadow-md p-6 w-full max-w-md">
      <div className="text-center mb-6">
        <h3 className="text-xl font-semibold mb-2">QR Code Generator</h3>
        <p className="text-sm text-muted-foreground">
          Generate a secure QR code that others can scan to request access to your documents
        </p>
      </div>
      
      {qrCode ? (
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex flex-col items-center"
        >
          <div className="bg-white p-2 border border-border rounded-lg mb-4">
            <img src={qrCode} alt="QR Code" className="w-56 h-56" />
          </div>
          
          {expiryDate && (
            <p className="text-sm text-muted-foreground mb-4">
              Valid until: {expiryDate}
            </p>
          )}
          
          {user && (
            <div className="bg-muted p-3 rounded-lg mb-4 text-center w-full">
              <p className="text-xs text-muted-foreground">
                <span className="font-semibold">Owner Verification:</span> Use your mobile number ({user.mobileNumber}) and PIN to access documents
              </p>
            </div>
          )}
          
          <div className="grid grid-cols-2 gap-3 w-full">
            <Button variant="outline" onClick={downloadQRCode} className="flex items-center gap-2">
              <Download className="w-4 h-4" />
              Download
            </Button>
            
            <Button variant="outline" onClick={copyQRCodeLink} className="flex items-center gap-2">
              <Copy className="w-4 h-4" />
              Copy Link
            </Button>
          </div>
          
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={generateQRCode} 
            className="mt-4 text-muted-foreground"
            disabled={loading}
          >
            <RefreshCw className={`w-4 h-4 mr-1 ${loading ? 'animate-spin' : ''}`} />
            Regenerate QR Code
          </Button>
        </motion.div>
      ) : (
        <div className="space-y-4">
          <div className="relative">
            <Button 
              onClick={generateQRCode} 
              disabled={loading}
              className="w-full py-6"
            >
              {loading ? (
                <Loader className="w-5 h-5 animate-spin" />
              ) : (
                <div className="flex items-center gap-2">
                  <QrCode className="w-5 h-5" />
                  Generate QR Code
                </div>
              )}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default QRCodeGenerator;