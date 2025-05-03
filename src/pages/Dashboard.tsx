
import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { FileText, Upload, QrCode, User, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Navbar from '@/components/layout/Navbar';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import documentService from '@/services/document.service';

const Dashboard = () => {
  const { user } = useAuth();
  const [stats, setStats] = useState({
    documents: 0,
    storage: '0 MB',
    shared: 0
  });

  // Fetch documents
  const { data: documents = [] } = useQuery({
    queryKey: ['documents'],
    queryFn: documentService.getDocuments,
    staleTime: 60000 // 1 minute
  });

  useEffect(() => {
    if (documents.length) {
      // Calculate total storage
      const totalBytes = documents.reduce((sum: number, doc: any) => sum + (doc.size || 0), 0);
      const totalMB = (totalBytes / (1024 * 1024)).toFixed(1);
      
      setStats({
        documents: documents.length,
        storage: `${totalMB} MB`,
        shared: 0 // In a real app, we would track shared documents
      });
    }
  }, [documents]);

  const features = [
    {
      title: 'Upload Documents',
      description: 'Securely upload and manage your important documents',
      icon: <Upload className="h-6 w-6 text-primary" />,
      link: '/documents',
      action: 'Upload Now'
    },
    {
      title: 'Share with QR Code',
      description: 'Generate a QR code to securely share your documents',
      icon: <QrCode className="h-6 w-6 text-primary" />,
      link: '/share',
      action: 'Create QR Code'
    },
    {
      title: 'Manage Profile',
      description: 'Update your personal details and security settings',
      icon: <User className="h-6 w-6 text-primary" />,
      link: '/profile',
      action: 'Edit Profile'
    }
  ];

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="container mx-auto px-4 pt-24 pb-16">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="max-w-5xl mx-auto"
        >
          {/* Welcome Card */}
          <div className="bg-gradient-to-r from-primary/90 to-tertiary/90 rounded-2xl p-8 text-white mb-8 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full -mt-32 -mr-32" />
            <div className="absolute bottom-0 left-0 w-32 h-32 bg-white/5 rounded-full -mb-16 -ml-16" />
            
            <div className="relative z-10">
              <h1 className="text-3xl font-bold mb-2">Welcome back, {user?.fullName || 'User'}</h1>
              <p className="text-white/80 mb-6 max-w-xl">
                Your documents are secure and ready for management. What would you like to do today?
              </p>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
                <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 border border-white/20">
                  <div className="text-white/70 text-sm mb-1">Documents</div>
                  <div className="text-2xl font-bold">{stats.documents}</div>
                </div>
                
                <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 border border-white/20">
                  <div className="text-white/70 text-sm mb-1">Storage Used</div>
                  <div className="text-2xl font-bold">{stats.storage}</div>
                </div>
                
                <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 border border-white/20">
                  <div className="text-white/70 text-sm mb-1">Shared</div>
                  <div className="text-2xl font-bold">{stats.shared}</div>
                </div>
              </div>
            </div>
          </div>
          
          {/* Quick Actions */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
            {features.map((feature, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
                className="bg-white rounded-xl p-6 shadow-sm border border-border hover:shadow-md transition-all"
              >
                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                  {feature.icon}
                </div>
                <h3 className="text-lg font-medium mb-2">{feature.title}</h3>
                <p className="text-muted-foreground mb-4">
                  {feature.description}
                </p>
                <Link to={feature.link}>
                  <Button variant="ghost" className="flex items-center gap-1 px-0 text-primary hover:text-primary hover:bg-transparent">
                    <span>{feature.action}</span>
                    <ArrowRight className="w-4 h-4" />
                  </Button>
                </Link>
              </motion.div>
            ))}
          </div>
          
          {/* Recent Activity */}
          <div className="bg-white rounded-xl p-6 shadow-sm border border-border">
            <h2 className="text-xl font-semibold mb-6">Recent Activity</h2>
            
            {documents.length > 0 ? (
              <div className="space-y-3">
                {documents.slice(0, 3).map((doc: any) => (
                  <div key={doc.id} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-md bg-primary/10 flex items-center justify-center">
                        <FileText className="w-5 h-5 text-primary" />
                      </div>
                      <div>
                        <p className="font-medium">{doc.name}</p>
                        <p className="text-xs text-muted-foreground">
                          Uploaded {new Date(doc.created_at).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {Math.round(doc.size / 1024)} KB
                    </span>
                  </div>
                ))}
                
                {documents.length > 3 && (
                  <div className="text-center mt-4">
                    <Link to="/documents">
                      <Button variant="outline" size="sm">
                        View All Documents
                      </Button>
                    </Link>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-8">
                <p className="text-muted-foreground">No recent activity</p>
                <Button className="mt-4" asChild>
                  <Link to="/documents">Upload Your First Document</Link>
                </Button>
              </div>
            )}
          </div>
        </motion.div>
      </main>
    </div>
  );
};

export default Dashboard;
