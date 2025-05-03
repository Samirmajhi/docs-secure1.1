import React, { useState } from 'react';
import { File, MoreVertical, Download, Trash2, Edit, Eye, Check, X } from 'lucide-react';
import { motion } from 'framer-motion';
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem
} from '@/components/ui/dropdown-menu';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import documentService from '@/services/document.service';
import DocumentViewer from './DocumentViewer';
import { Card, CardContent } from '@/components/ui/card';
import { FileText } from 'lucide-react';

export interface DocumentCardProps {
  id: string;
  name: string;
  type: string;
  size: string;
  dateAdded: string;
  onView?: () => void;
  onDownload?: () => void;
  onDelete?: () => void;
  onRename?: (newName: string) => void;
  isDeleting?: boolean;
  isRenaming?: boolean;
  isDownloading?: boolean;
  isViewing?: boolean;
  isDeletable?: boolean;
  isRenamable?: boolean;
  isDownloadable?: boolean;
  isViewable?: boolean;
  className?: string;
  style?: React.CSSProperties;
  children?: React.ReactNode;
}

const DocumentCard: React.FC<DocumentCardProps> = ({
  id,
  name,
  type,
  size,
  dateAdded,
  onView,
  onDownload,
  onDelete,
  onRename,
  isDeleting = false,
  isRenaming = false,
  isDownloading = false,
  isViewing = false,
  isDeletable = true,
  isRenamable = true,
  isDownloadable = true,
  isViewable = true,
  className = '',
  style,
  children
}) => {
  const [isHovering, setIsHovering] = useState(false);
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [downloadFormat, setDownloadFormat] = useState('original');
  const [newName, setNewName] = useState(name);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isDownloadingState, setIsDownloadingState] = useState(false);
  
  const handleDownload = async () => {
    try {
      setIsDownloadingState(true);
      await documentService.downloadDocument(id);
    } catch (error) {
      console.error('Error downloading document:', error);
      toast.error('Failed to download document');
    } finally {
      setIsDownloadingState(false);
    }
  };

  const handleDelete = async () => {
    if (onDelete) {
      try {
        await onDelete();
      } catch (error) {
        console.error('Error deleting document:', error);
      }
    }
  };

  const handleView = () => {
    setViewDialogOpen(true);
    onView();
  };

  const handleRename = () => {
    setRenameDialogOpen(true);
    setNewName(name);
  };

  const confirmRename = async () => {
    if (newName.trim() && onRename) {
      try {
        await onRename(newName.trim());
        setRenameDialogOpen(false);
      } catch (error) {
        console.error('Error renaming document:', error);
      }
    } else {
      setNewName(name);
    }
  };

  const getFileIcon = (type: string) => {
    if (type.includes('pdf')) return 'PDF';
    if (type.includes('word') || type.includes('doc')) return type.includes('docx') ? 'DOCX' : 'DOC';
    if (type.includes('excel') || type.includes('sheet')) return type.includes('xlsx') ? 'XLSX' : 'XLS';
    if (type.includes('image')) {
      const ext = type.split('/').pop()?.toUpperCase();
      return ext || 'IMG';
    }
    if (type.includes('text/plain')) return 'TXT';
    if (type.includes('json')) return 'JSON';
    return 'FILE';
  };

  return (
    <Card className={`relative overflow-hidden transition-all hover:shadow-md ${className}`} style={style}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div className="flex items-start space-x-4">
            <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center">
              <FileText className="w-6 h-6 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-medium truncate">{name}</h3>
              <p className="text-xs text-muted-foreground mt-1">
                {getFileIcon(type)} • {size} • {dateAdded}
              </p>
            </div>
          </div>
          
          <div className="flex items-center space-x-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={handleDownload}
              disabled={isDownloadingState}
              className="hover:bg-primary/10"
            >
              <Download className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default DocumentCard;