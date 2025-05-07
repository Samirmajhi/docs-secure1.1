import React, { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Download, FileText, Image, ZoomIn, ZoomOut, X, Eye } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import documentService from '@/services/document.service';
import { toast } from 'sonner';

export interface DocumentViewerProps {
  documentId: string;
  documentName: string;
  documentType: string;
  documentSize: string;
  dateAdded: string;
  isOpen: boolean;
  onClose: () => void;
  onDownload: () => Promise<void>;
  requestId?: string;
}

const DocumentViewer = ({
  documentId,
  documentName,
  documentType,
  documentSize,
  dateAdded,
  isOpen,
  onClose,
  onDownload
}: DocumentViewerProps) => {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [documentUrl, setDocumentUrl] = useState<string | null>(null);
  const [zoom, setZoom] = useState(100);
  const [permissionLevel, setPermissionLevel] = useState<string | null>(null);

  useEffect(() => {
    const fetchDocument = async () => {
      try {
        if (!documentId) {
          throw new Error('Document ID is required');
        }

        setIsLoading(true);
        setError(null);
        const { blob, contentType, permissionLevel } = await documentService.getDocumentForViewing(documentId);
        
        // Create object URL for the document
        const url = URL.createObjectURL(blob);
        setDocumentUrl(url);
        setPermissionLevel(permissionLevel);
      } catch (err: any) {
        console.error('Error loading document:', err);
        setError(err.message || 'Failed to load document');
        toast.error(err.message || 'Failed to load document');
      } finally {
        setIsLoading(false);
      }
    };

    if (isOpen && documentId) {
      fetchDocument();
    }

    // Cleanup object URL when component unmounts or dialog closes
    return () => {
      if (documentUrl) {
        URL.revokeObjectURL(documentUrl);
      }
    };
  }, [documentId, isOpen]);

  const handleZoomIn = () => {
    setZoom(prev => Math.min(prev + 25, 200));
  };

  const handleZoomOut = () => {
    setZoom(prev => Math.max(prev - 25, 50));
  };

  const isViewOnly = permissionLevel === 'view_only';

  const renderDocumentPreview = () => {
    if (isLoading) {
      return (
        <div className="flex items-center justify-center h-full">
          <Skeleton className="w-full h-full" />
        </div>
      );
    }

    if (error) {
      return (
        <div className="flex flex-col items-center justify-center h-full p-8">
          <div className="bg-red-50 p-8 rounded-lg border border-red-200 w-full max-w-md text-center">
            <FileText className="w-16 h-16 mx-auto text-red-500 mb-4" />
            <h3 className="text-xl font-medium mb-2">Error Loading Document</h3>
            <p className="text-red-600 mb-4">{error}</p>
            {!isViewOnly && (
              <Button onClick={onDownload} variant="destructive">
                <Download className="mr-2 h-4 w-4" />
                Download to View
              </Button>
            )}
          </div>
        </div>
      );
    }

    if (documentType.includes('pdf')) {
      return (
        <div className="relative w-full h-full">
          <div className="sticky top-0 right-0 z-10 flex gap-2 bg-white/80 p-2 rounded-md shadow-sm justify-end">
            <Button
              variant="outline"
              size="icon"
              onClick={handleZoomOut}
              disabled={zoom <= 50}
              className="h-8 w-8"
            >
              <ZoomOut className="h-4 w-4" />
            </Button>
            <span className="flex items-center px-2 text-sm">{zoom}%</span>
            <Button
              variant="outline"
              size="icon"
              onClick={handleZoomIn}
              disabled={zoom >= 200}
              className="h-8 w-8"
            >
              <ZoomIn className="h-4 w-4" />
            </Button>
          </div>
          <div className="w-full h-full overflow-auto">
            <iframe
              src={`${documentUrl}#toolbar=0&navpanes=0&scrollbar=1&view=FitH&zoom=${zoom}`}
              className="w-full h-full"
              title={documentName}
            />
          </div>
        </div>
      );
    } else if (documentType.includes('image/')) {
      return (
        <div className="flex items-center justify-center h-full">
          <img 
            src={documentUrl || ''} 
            alt={documentName} 
            className="max-h-full max-w-full object-contain" 
          />
        </div>
      );
    } else {
      return (
        <div className="flex flex-col items-center justify-center h-full p-8">
          <div className="bg-gray-50 p-8 rounded-lg border border-gray-200 w-full max-w-md text-center">
            <FileText className="w-16 h-16 mx-auto text-primary mb-4" />
            <h3 className="text-xl font-medium mb-2 truncate">{documentName}</h3>
            <p className="text-muted-foreground mb-4">
              This document type cannot be previewed directly in the browser.
            </p>
            {isViewOnly ? (
              <Button disabled variant="outline">
                <Eye className="mr-2 h-4 w-4" />
                View Only Access
              </Button>
            ) : (
              <Button onClick={onDownload}>
                <Download className="mr-2 h-4 w-4" />
                Download to View
              </Button>
            )}
          </div>
        </div>
      );
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl h-[90vh] p-0 [&>button]:hidden">
        <DialogHeader className="p-4 border-b">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              <DialogTitle className="text-lg truncate max-w-[300px]">{documentName}</DialogTitle>
              {isViewOnly && (
                <span className="ml-2 inline-flex items-center rounded-md bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700 ring-1 ring-inset ring-blue-600/20">
                  <Eye className="mr-1 h-3 w-3" /> View Only
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {!isViewOnly && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onDownload}
                  disabled={isLoading}
                >
                  <Download className="mr-2 h-4 w-4" />
                  Download
                </Button>
              )}
              <Button variant="ghost" size="icon" onClick={onClose}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </DialogHeader>
        <div className="p-4 h-[calc(90vh-4rem)] overflow-hidden">
          {renderDocumentPreview()}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default DocumentViewer;