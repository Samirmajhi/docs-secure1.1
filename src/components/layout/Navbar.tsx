
import React, { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { 
  FileText, 
  Share2, 
  User, 
  LogOut, 
  Menu, 
  X,
  LayoutDashboard
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

const Navbar = () => {
  const [scrolled, setScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  
  // Mock authentication - in a real app this would come from auth context
  const isAuthenticated = location.pathname !== '/';

  useEffect(() => {
    const handleScroll = () => {
      if (window.scrollY > 10) {
        setScrolled(true);
      } else {
        setScrolled(false);
      }
    };

    window.addEventListener('scroll', handleScroll);
    return () => {
      window.removeEventListener('scroll', handleScroll);
    };
  }, []);

  const handleLogout = () => {
    toast.success('Logged out successfully');
    setTimeout(() => {
      navigate('/');
    }, 500);
  };

  const navLinks = [
    { name: 'Dashboard', path: '/dashboard', icon: <LayoutDashboard className="h-5 w-5" /> },
    { name: 'Documents', path: '/documents', icon: <FileText className="h-5 w-5" /> },
    { name: 'Share', path: '/share', icon: <Share2 className="h-5 w-5" /> },
    { name: 'Profile', path: '/profile', icon: <User className="h-5 w-5" /> },
  ];

  const isActive = (path: string) => {
    return location.pathname === path;
  };

  return (
    <header
      className={cn(
        'fixed top-0 left-0 right-0 z-50 transition-all duration-300',
        scrolled || mobileMenuOpen 
          ? 'py-3 glass-morphism shadow-md bg-white/90 backdrop-blur-md' 
          : 'py-5 bg-transparent'
      )}
    >
      <div className="container mx-auto px-4 flex items-center justify-between">
        <Link to={isAuthenticated ? '/dashboard' : '/'} className="flex items-center gap-2">
          <div className="relative h-10 w-10 rounded-lg bg-gradient-to-br from-primary to-tertiary p-0.5">
            <div className="absolute inset-0.5 rounded-[calc(0.5rem-1px)] bg-white flex items-center justify-center">
              <FileText className="h-5 w-5 text-primary" />
            </div>
          </div>
          <span className="text-xl font-semibold">SecureDoc</span>
        </Link>

        {/* Desktop Navigation */}
        {isAuthenticated && (
          <nav className="hidden md:flex items-center gap-6">
            {navLinks.map((link) => (
              <Link
                key={link.path}
                to={link.path}
                className={cn(
                  'flex items-center gap-2 px-3 py-2 rounded-md transition-colors',
                  isActive(link.path)
                    ? 'text-primary font-medium'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                )}
              >
                {link.icon}
                <span>{link.name}</span>
              </Link>
            ))}
            <Button 
              variant="ghost" 
              size="icon" 
              className="text-muted-foreground"
              onClick={handleLogout}
            >
              <LogOut className="h-5 w-5" />
            </Button>
          </nav>
        )}

        {/* Mobile menu toggle */}
        <button 
          className="md:hidden"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
        >
          {mobileMenuOpen ? 
            <X className="h-6 w-6" /> : 
            <Menu className="h-6 w-6" />
          }
        </button>
      </div>

      {/* Mobile Navigation */}
      {mobileMenuOpen && isAuthenticated && (
        <div className="md:hidden absolute top-full left-0 w-full glass-morphism shadow-md animate-fade-in py-4 bg-white/95 backdrop-blur-md">
          <nav className="container mx-auto px-4 flex flex-col gap-2">
            {navLinks.map((link) => (
              <Link
                key={link.path}
                to={link.path}
                className={cn(
                  'flex items-center gap-3 px-4 py-3 rounded-md transition-colors',
                  isActive(link.path)
                    ? 'text-primary font-medium bg-secondary'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                )}
                onClick={() => setMobileMenuOpen(false)}
              >
                {link.icon}
                <span>{link.name}</span>
              </Link>
            ))}
            <div className="h-px w-full bg-border my-2" />
            <Button 
              variant="ghost" 
              className="flex items-center gap-3 justify-start px-4 py-3 h-auto text-muted-foreground"
              onClick={() => {
                setMobileMenuOpen(false);
                handleLogout();
              }}
            >
              <LogOut className="h-5 w-5" />
              <span>Logout</span>
            </Button>
          </nav>
        </div>
      )}
    </header>
  );
};

export default Navbar;
