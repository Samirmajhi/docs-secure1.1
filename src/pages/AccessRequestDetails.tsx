import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { 
  Loader2, 
  CheckCircle, 
  XCircle, 
  FileText, 
  User, 
  Calendar, 
  Edit, 
  Info,
  FileIcon,
  Clock,
  Phone
} from 'lucide-react';
import { toast } from 'sonner';
import api from '@/services/api';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useAuth } from '@/context/AuthContext';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';

interface RequestedDocument {
  id: number;
  name: string;
  type: string;
  size: number;
  selected: boolean;
}

interface AccessRequest {
  id: string;
  requesterName: string;
  requesterMobile: string;
  status: string;
  createdAt: string;
  documents: RequestedDocument[];
  isOwner: boolean;
}

const AccessRequestDetails = () => {
  const { requestId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [request, setRequest] = useState<AccessRequest | null>(null);
  const [selectedDocs, setSelectedDocs] = useState<number[]>([]);
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    const fetchRequestDetails = async () => {
      try {
        setLoading(true);
        const response = await api.get(`/access/requests/${requestId}`);
        const requestData = response.data;
        
        // Initialize selected documents with all requested documents
        const initialSelectedDocs = requestData.documents.map((doc: any) => doc.id);
        
        setRequest(requestData);
        setSelectedDocs(initialSelectedDocs);
      } catch (err: any) {
        if (err.response?.status === 404) {
          setError('Access request not found');
        } else {
          setError(err.response?.data?.message || 'Failed to fetch request details');
        }
      } finally {
        setLoading(false);
      }
    };

    fetchRequestDetails();
  }, [requestId]);

  const handleDocumentSelect = (docId: number) => {
    setSelectedDocs(prev => 
      prev.includes(docId) 
        ? prev.filter(id => id !== docId) 
        : [...prev, docId]
    );
  };

  const handleAction = async (action: 'approve' | 'deny' | 'modify') => {
    try {
      if (!user) {
        setError('Please log in to process this request');
        return;
      }

      setProcessing(true);
      let response;

      if (action === 'modify') {
        // Show confirmation dialog for modifications
        const confirmed = window.confirm(
          'Are you sure you want to modify the requested documents? This will update the scanner\'s access to only the selected documents.'
        );
        
        if (!confirmed) {
          return;
        }

        // Check if any documents are selected
        if (selectedDocs.length === 0) {
          toast.error('Please select at least one document to grant access to');
          return;
        }

        response = await api.post(`/access/requests/${requestId}/modify`, {
          documentIds: selectedDocs
        });
      } else {
        response = await api.post(`/access/requests/${requestId}/${action}`);
      }

      if (response.data.success) {
        toast.success(
          action === 'approve' 
            ? 'Access request approved successfully' 
            : action === 'deny'
            ? 'Access request denied successfully'
            : 'Access request modified successfully'
        );
        
        // Redirect to dashboard after 2 seconds
        setTimeout(() => {
          navigate('/dashboard');
        }, 2000);
      } else {
        setError(response.data.message || 'Failed to process request');
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'An error occurred while processing your request');
    } finally {
      setProcessing(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const statusConfig = {
      pending: { class: 'bg-yellow-100 text-yellow-800', text: 'Pending' },
      approved: { class: 'bg-green-100 text-green-800', text: 'Approved' },
      denied: { class: 'bg-red-100 text-red-800', text: 'Denied' },
      modified: { class: 'bg-blue-100 text-blue-800', text: 'Modified' }
    };
    const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.pending;
    return <Badge variant="outline" className={config.class}>{config.text}</Badge>;
  };

  const getFileIcon = (type: string) => {
    if (type.includes('pdf')) {
      return <div className="w-10 h-10 bg-red-100 text-red-500 rounded-lg flex items-center justify-center font-medium">PDF</div>;
    } else if (type.includes('word') || type.includes('doc')) {
      return <div className="w-10 h-10 bg-blue-100 text-blue-500 rounded-lg flex items-center justify-center font-medium">DOC</div>;
    } else if (type.includes('image')) {
      return <div className="w-10 h-10 bg-purple-100 text-purple-500 rounded-lg flex items-center justify-center font-medium">IMG</div>;
    } else {
      return <div className="w-10 h-10 bg-gray-100 text-gray-500 rounded-lg flex items-center justify-center font-medium">FILE</div>;
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-background to-muted/30">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4 text-primary" />
          <p className="text-muted-foreground">Loading request details...</p>
        </div>
      </div>
    );
  }

  if (error || !request) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-background to-muted/30 p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-red-500">
              <XCircle className="w-6 h-6" />
              Error
            </CardTitle>
            <CardDescription>{error || 'Request not found'}</CardDescription>
          </CardHeader>
          <CardContent>
            {error === 'Please log in to process this request' ? (
              <Button onClick={() => navigate('/login')} className="w-full">Log In</Button>
            ) : (
              <Button onClick={() => navigate('/dashboard')} className="w-full">Return to Dashboard</Button>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/30 py-8 px-4">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header Card */}
        <Card className="border-none shadow-md">
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-primary/10 rounded-lg">
                  <FileText className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <CardTitle>Document Access Request</CardTitle>
                  <CardDescription>Review and manage document access request</CardDescription>
                </div>
              </div>
              {getStatusBadge(request.status)}
            </div>
          </CardHeader>
        </Card>

        {/* Main Content Card */}
        <Card className="border-none shadow-md">
          <CardContent className="p-6 space-y-6">
            {/* Requester Information */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-card rounded-xl p-4 border shadow-sm">
                <div className="flex items-center gap-3">
                  <User className="w-5 h-5 text-primary" />
                  <div>
                    <p className="text-sm font-medium">Requester</p>
                    <p className="text-sm text-muted-foreground">{request.requesterName}</p>
                  </div>
                </div>
              </div>
              
              <div className="bg-card rounded-xl p-4 border shadow-sm">
                <div className="flex items-center gap-3">
                  <Phone className="w-5 h-5 text-primary" />
                  <div>
                    <p className="text-sm font-medium">Contact</p>
                    <p className="text-sm text-muted-foreground">{request.requesterMobile}</p>
                  </div>
                </div>
              </div>
              
              <div className="bg-card rounded-xl p-4 border shadow-sm">
                <div className="flex items-center gap-3">
                  <Clock className="w-5 h-5 text-primary" />
                  <div>
                    <p className="text-sm font-medium">Requested On</p>
                    <p className="text-sm text-muted-foreground">
                      {new Date(request.createdAt).toLocaleDateString()} at {new Date(request.createdAt).toLocaleTimeString()}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <Separator />

            {/* Document List */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold">Requested Documents</h3>
                <p className="text-sm text-muted-foreground">
                  {request.documents.length} document{request.documents.length !== 1 ? 's' : ''} selected
                </p>
              </div>
              
              <div className="grid gap-3">
                {request.documents.map((doc) => (
                  <div 
                    key={doc.id} 
                    className="flex items-center p-4 bg-card rounded-xl border shadow-sm hover:shadow-md transition-shadow"
                  >
                    {request.isOwner && (
                      <Checkbox 
                        id={`doc-${doc.id}`}
                        checked={selectedDocs.includes(doc.id)}
                        onCheckedChange={() => handleDocumentSelect(doc.id)}
                        className="mr-4"
                      />
                    )}
                    <div className="flex items-center gap-4 flex-1">
                      {getFileIcon(doc.type)}
                      <div className="min-w-0 flex-1">
                        <p className="font-medium truncate">{doc.name}</p>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <span>{doc.type}</span>
                          <span>•</span>
                          <span>{(doc.size / 1024).toFixed(1)} KB</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Action Buttons */}
            {request.isOwner && (
              <div className="flex items-center justify-end gap-3 pt-6">
                <Button
                  variant="outline"
                  onClick={() => navigate('/dashboard')}
                  disabled={processing}
                >
                  Cancel
                </Button>
                
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="default"
                      disabled={processing || selectedDocs.length === 0}
                      className="min-w-[120px]"
                    >
                      {processing ? (
                        <div className="flex items-center gap-2">
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span>Processing...</span>
                        </div>
                      ) : (
                        <span>Take Action</span>
                      )}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48">
                    <DropdownMenuItem 
                      onClick={() => handleAction('approve')}
                      className="flex items-center gap-2 py-2"
                    >
                      <CheckCircle className="w-4 h-4 text-green-500" />
                      <span>Approve Request</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem 
                      onClick={() => handleAction('deny')}
                      className="flex items-center gap-2 py-2"
                    >
                      <XCircle className="w-4 h-4 text-red-500" />
                      <span>Deny Request</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem 
                      onClick={() => handleAction('modify')}
                      className="flex items-center gap-2 py-2"
                    >
                      <Edit className="w-4 h-4 text-blue-500" />
                      <span>Modify Selection</span>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default AccessRequestDetails; 