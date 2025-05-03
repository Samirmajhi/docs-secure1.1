import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowLeft, Check, Crown, Database, Shield, Clock, Users, ChevronRight } from 'lucide-react';

import Navbar from '@/components/layout/Navbar';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/context/AuthContext';
import subscriptionService from '@/services/subscription.service';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { motion } from 'framer-motion';
import eventBus from '@/utils/eventBus';

// Helper function to format storage size
const formatStorage = (bytes: number): string => {
  if (bytes === 0) return 'Unlimited';
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(1)} MB`;
};

const Subscription = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  
  // Business/Personal toggle
  const [isBusinessPlan, setIsBusinessPlan] = useState(false);
  
  // Fetch current subscription and storage usage
  const { data: currentSubscription } = useQuery({
    queryKey: ['subscription'],
    queryFn: subscriptionService.getCurrentSubscription,
  });

  const { data: storageUsage } = useQuery({
    queryKey: ['storage'],
    queryFn: subscriptionService.getStorageUsage,
  });

  // Mutation for updating the subscription
  const updateSubscription = useMutation({
    mutationFn: (planId: number) => subscriptionService.updateSubscription(planId),
    onSuccess: () => {
      toast.success('Subscription updated successfully');
      queryClient.invalidateQueries({ queryKey: ['subscription'] });
      queryClient.invalidateQueries({ queryKey: ['storage'] });
      
      // Emit subscription-updated event
      eventBus.emit('subscription-updated');
      
      // Navigate back to dashboard after successful update
      setTimeout(() => {
        navigate('/dashboard');
      }, 1000);
    },
    onError: (error) => {
      toast.error('Failed to update subscription');
      console.error('Subscription update error:', error);
    },
  });

  // Handle subscription update
  const handleUpdateSubscription = (planId: number) => {
    if (currentSubscription?.id === planId) {
      toast.info('You are already subscribed to this plan');
      return;
    }
    updateSubscription.mutate(planId);
  };

  // Define our plans with focus on storage
  const plans = [
    {
      id: 1,
      name: "Free",
      price: 0,
      storage: 5 * 1024 * 1024, // 5MB
      features: [
        "5MB Document Storage",
        "Basic document upload",
        "Unlimited QR codes",
        "Standard security",
        "Community support"
      ],
      icon: <Database className="h-5 w-5" />
    },
    {
      id: 2,
      name: "Pro",
      price: isBusinessPlan ? 19.99 : 9.99,
      storage: 15 * 1024 * 1024, // 15MB
      features: [
        "15MB Document Storage",
        "Advanced document management",
        "Priority support",
        "Document versioning",
        "Custom expiration dates"
      ],
      icon: <Shield className="h-5 w-5" />
    },
    {
      id: 3,
      name: "Enterprise",
      price: isBusinessPlan ? 49.99 : 29.99,
      storage: 0, // Unlimited
      features: [
        "Unlimited Document Storage",
        "Team management",
        "API access",
        "Custom integrations",
        "Dedicated support"
      ],
      icon: <Users className="h-5 w-5" />
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
          className="max-w-6xl mx-auto"
        >
          {/* Header Card */}
          <div className="bg-gradient-to-r from-primary/90 to-tertiary/90 rounded-2xl p-8 text-white mb-8 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full -mt-32 -mr-32" />
            <div className="absolute bottom-0 left-0 w-32 h-32 bg-white/5 rounded-full -mb-16 -ml-16" />
            <div className="relative z-10">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div>
                  <Button 
                    variant="ghost" 
                    onClick={() => navigate(-1)}
                    className="mb-2 text-white/80 hover:text-white hover:bg-white/10 -ml-3"
                  >
                    <ArrowLeft className="mr-2 h-4 w-4" /> Back
                  </Button>
                  
                  <h1 className="text-3xl font-bold">Choose Your Storage Plan</h1>
                  <p className="text-white/80 mt-2 max-w-xl">
                    Select the storage capacity that fits your document management needs
                  </p>
                </div>
                
                {/* Current Plan & Usage Summary */}
                {currentSubscription && storageUsage && (
                  <Card className="bg-white/10 backdrop-blur-sm border-white/20 w-full md:w-auto">
                    <CardContent className="p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <Crown className="h-5 w-5 text-yellow-400" />
                        <span className="font-semibold text-white">Current: {currentSubscription.name} Plan</span>
                      </div>
                      <div className="space-y-2">
                        <div className="flex justify-between text-sm text-white/80">
                          <span>Storage Used</span>
                          <span>{formatStorage(storageUsage.used)} / {formatStorage(storageUsage.limit)}</span>
                        </div>
                        <Progress 
                          value={(storageUsage.used / storageUsage.limit) * 100} 
                          className="h-2 bg-white/20"
                        />
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>
            </div>
          </div>
          
          {/* Personal/Business Toggle */}
          <div className="flex items-center justify-center mb-12">
            <span className={isBusinessPlan ? "text-muted-foreground" : "font-medium"}>Personal</span>
            <Switch 
              checked={isBusinessPlan} 
              onCheckedChange={setIsBusinessPlan}
              className="mx-4"
            />
            <span className={!isBusinessPlan ? "text-muted-foreground" : "font-medium"}>Business</span>
          </div>
          
          {/* Plan Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            {plans.map((plan, index) => (
              <motion.div
                key={plan.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
              >
                <Card 
                  className={`h-full overflow-hidden transition-all hover:shadow-md ${
                    currentSubscription?.id === plan.id 
                      ? 'border-primary border-2' 
                      : 'border-border hover:border-primary/50'
                  }`}
                >
                  {currentSubscription?.id === plan.id && (
                    <div className="bg-primary py-1 px-3 text-primary-foreground text-xs font-medium text-center">
                      Your Current Plan
                    </div>
                  )}
                  
                  <CardContent className="p-6">
                    <div className="flex justify-between items-center mb-4">
                      <div className="flex items-center gap-2">
                        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                          {plan.icon}
                        </div>
                        <h3 className="text-xl font-semibold">{plan.name}</h3>
                      </div>
                      
                      <div className="text-xl font-bold">
                        {plan.price === 0 ? 'Free' : `$${plan.price}`}
                        {plan.price > 0 && <span className="text-sm text-muted-foreground ml-1">/mo</span>}
                      </div>
                    </div>
                    
                    {/* Storage Highlight */}
                    <div className="bg-muted/50 rounded-lg p-4 mb-6">
                      <div className="font-medium mb-2">Storage Capacity</div>
                      <div className="text-2xl font-bold text-primary">{formatStorage(plan.storage)}</div>
                    </div>
                    
                    {/* Features */}
                    <div className="mb-8">
                      <div className="font-medium mb-3">Features</div>
                      <ul className="space-y-2">
                        {plan.features.map((feature, i) => (
                          <li key={i} className="flex items-start">
                            <Check className="h-4 w-4 text-primary mr-2 mt-1 flex-shrink-0" />
                            <span className="text-sm">{feature}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                    
                    <Button 
                      className="w-full" 
                      variant={currentSubscription?.id === plan.id ? "outline" : "default"}
                      disabled={updateSubscription.isPending || currentSubscription?.id === plan.id}
                      onClick={() => handleUpdateSubscription(plan.id)}
                    >
                      {currentSubscription?.id === plan.id 
                        ? 'Current Plan' 
                        : updateSubscription.isPending 
                          ? 'Updating...' 
                          : `${plan.price === 0 ? 'Select' : 'Upgrade to'} ${plan.name}`}
                    </Button>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
          
          {/* Additional Info */}
          <div className="bg-white rounded-xl p-6 shadow-sm border border-border">
            <h2 className="text-xl font-semibold mb-4">Why Choose a Higher Storage Plan?</h2>
            <p className="text-muted-foreground mb-6">
              With more storage space, you can upload larger and more documents, share them securely with your team or clients, 
              and keep everything organized in one place. Our plans are designed to grow with your document management needs.
            </p>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="flex flex-col items-center text-center p-4">
                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                  <Database className="h-6 w-6 text-primary" />
                </div>
                <h3 className="font-medium mb-2">More Storage</h3>
                <p className="text-sm text-muted-foreground">
                  Store more documents without worrying about space constraints
                </p>
              </div>
              
              <div className="flex flex-col items-center text-center p-4">
                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                  <Shield className="h-6 w-6 text-primary" />
                </div>
                <h3 className="font-medium mb-2">Enhanced Security</h3>
                <p className="text-sm text-muted-foreground">
                  Higher plans include advanced security features to protect your sensitive documents
                </p>
              </div>
              
              <div className="flex flex-col items-center text-center p-4">
                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                  <Clock className="h-6 w-6 text-primary" />
                </div>
                <h3 className="font-medium mb-2">Priority Support</h3>
                <p className="text-sm text-muted-foreground">
                  Get faster responses and dedicated support with our premium plans
                </p>
              </div>
            </div>
          </div>
        </motion.div>
      </main>
    </div>
  );
};

export default Subscription; 