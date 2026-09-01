import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2 } from 'lucide-react';

const ALLOWED_DOMAINS = ['getrudiment.com'];

const isAllowedEmail = (email: string): boolean => {
  const domain = email.split('@')[1]?.toLowerCase();
  return ALLOWED_DOMAINS.includes(domain);
};

export default function Auth() {
  const navigate = useNavigate();
  const { signIn, signUp } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  
  // Login form state
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  
  // Signup form state
  const [signupEmail, setSignupEmail] = useState('');
  const [signupPassword, setSignupPassword] = useState('');
  const [signupDisplayName, setSignupDisplayName] = useState('');

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMessage(null);
    setIsLoading(true);

    const { error } = await supabase.auth.resetPasswordForEmail(resetEmail, {
      redirectTo: `${window.location.origin}/reset-password`,
    });

    if (error) {
      setError(error.message);
    } else {
      setSuccessMessage('If an account exists for that email, a reset link is on its way.');
      setResetEmail('');
    }
    setIsLoading(false);
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);
    
    const { error } = await signIn(loginEmail, loginPassword);
    
    if (error) {
      setError(error.message);
      setIsLoading(false);
    } else {
      navigate('/');
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMessage(null);
    
    // Client-side check first for fast UX feedback
    if (!isAllowedEmail(signupEmail)) {
      setError(`Only company email addresses (${ALLOWED_DOMAINS.join(', ')}) can create an account.`);
      return;
    }
    
    setIsLoading(true);
    
    // Server-side domain validation for defense-in-depth
    try {
      const { data, error: fnError } = await supabase.functions.invoke('validate-email-domain', {
        body: { email: signupEmail }
      });
      if (fnError || !data?.allowed) {
        setError(data?.error || 'Email domain not authorized.');
        setIsLoading(false);
        return;
      }
    } catch {
      // If server validation fails, fall through to client-side check (already passed above)
      console.warn('Server-side email validation unavailable, relying on client-side check');
    }
    
    setIsLoading(true);
    
    const { error } = await signUp(signupEmail, signupPassword, signupDisplayName);
    
    if (error) {
      setError(error.message);
    } else {
      setSuccessMessage('Check your email to confirm your account before signing in.');
      setSignupEmail('');
      setSignupPassword('');
      setSignupDisplayName('');
    }
    setIsLoading(false);
  };

  return (
    <div className="relative min-h-screen flex items-center justify-center p-4 overflow-hidden">
      <div className="ambient-bg" aria-hidden="true">
        <svg viewBox="0 0 800 800" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient id="authAmbientGradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="hsl(165 100% 47%)" stopOpacity="0" />
              <stop offset="50%" stopColor="hsl(165 100% 47%)" stopOpacity="0.5" />
              <stop offset="100%" stopColor="hsl(165 100% 47%)" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path className="ambient-wavy-path" d="M -50,180 C 150,120 250,260 450,180 S 750,120 900,220" fill="none" stroke="url(#authAmbientGradient)" strokeWidth="1.5" />
          <path className="ambient-wavy-path" d="M -50,340 C 180,280 280,420 480,340 S 780,280 900,380" fill="none" stroke="url(#authAmbientGradient)" strokeWidth="1.5" style={{ animationDelay: '-3s' }} />
          <path className="ambient-wavy-path" d="M -50,500 C 150,440 260,580 460,500 S 760,440 900,540" fill="none" stroke="url(#authAmbientGradient)" strokeWidth="1.5" style={{ animationDelay: '-6s' }} />
          <path className="ambient-wavy-path" d="M -50,650 C 170,600 270,720 470,650 S 770,600 900,690" fill="none" stroke="url(#authAmbientGradient)" strokeWidth="1.5" style={{ animationDelay: '-1.5s' }} />
        </svg>
      </div>
      <Card className="relative z-10 w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <span className="text-2xl font-bold tracking-tight">Rudiment</span>
          </div>
          <CardDescription>Internal ops tracker for the Rudiment team.</CardDescription>
        </CardHeader>
        
        <CardContent>
          {error && (
            <Alert variant="destructive" className="mb-4">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          
          {successMessage && (
            <Alert className="mb-4">
              <AlertDescription>{successMessage}</AlertDescription>
            </Alert>
          )}
          
          <Tabs defaultValue="login" className="w-full" onValueChange={() => { setShowForgotPassword(false); setError(null); setSuccessMessage(null); }}>
            <TabsList className="grid w-full grid-cols-2 mb-4">
              <TabsTrigger value="login">Sign In</TabsTrigger>
              <TabsTrigger value="signup">Create Account</TabsTrigger>
            </TabsList>
            
            <TabsContent value="login">
              {showForgotPassword ? (
                <form onSubmit={handleForgotPassword} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="reset-email">Email</Label>
                    <Input
                      id="reset-email"
                      type="email"
                      placeholder="you@company.com"
                      value={resetEmail}
                      onChange={(e) => setResetEmail(e.target.value)}
                      required
                    />
                    <p className="text-xs text-muted-foreground">
                      We'll email you a link to reset your password.
                    </p>
                  </div>
                  <Button type="submit" className="w-full" disabled={isLoading}>
                    {isLoading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Sending...
                      </>
                    ) : (
                      'Send reset link'
                    )}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    className="w-full"
                    onClick={() => { setShowForgotPassword(false); setError(null); setSuccessMessage(null); }}
                  >
                    Back to sign in
                  </Button>
                </form>
              ) : (
                <form onSubmit={handleLogin} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="login-email">Email</Label>
                    <Input
                      id="login-email"
                      type="email"
                      placeholder="you@example.com"
                      value={loginEmail}
                      onChange={(e) => setLoginEmail(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="login-password">Password</Label>
                      <button
                        type="button"
                        onClick={() => { setShowForgotPassword(true); setError(null); setSuccessMessage(null); }}
                        className="text-xs text-primary hover:underline"
                      >
                        Forgot password?
                      </button>
                    </div>
                    <Input
                      id="login-password"
                      type="password"
                      placeholder="••••••••"
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                      required
                    />
                  </div>
                  <Button type="submit" className="w-full" disabled={isLoading}>
                    {isLoading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Signing in...
                      </>
                    ) : (
                      'Sign In'
                    )}
                  </Button>
                </form>
              )}
            </TabsContent>
            
            <TabsContent value="signup">
              <form onSubmit={handleSignup} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="signup-name">Display Name</Label>
                  <Input
                    id="signup-name"
                    type="text"
                    placeholder="John Doe"
                    value={signupDisplayName}
                    onChange={(e) => setSignupDisplayName(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signup-email">Work Email</Label>
                  <Input
                    id="signup-email"
                    type="email"
                    placeholder="you@company.com"
                    value={signupEmail}
                    onChange={(e) => setSignupEmail(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signup-password">Password</Label>
                  <Input
                    id="signup-password"
                    type="password"
                    placeholder="••••••••"
                    value={signupPassword}
                    onChange={(e) => setSignupPassword(e.target.value)}
                    required
                    minLength={6}
                  />
                </div>
                <Button type="submit" className="w-full" disabled={isLoading}>
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Creating account...
                    </>
                  ) : (
                    'Create Account'
                  )}
                </Button>
              </form>
            </TabsContent>
          </Tabs>
        </CardContent>
        
        <CardFooter className="text-center text-sm text-muted-foreground">
          <p className="w-full">Secure authentication powered by Supabase</p>
        </CardFooter>
      </Card>
    </div>
  );
}
