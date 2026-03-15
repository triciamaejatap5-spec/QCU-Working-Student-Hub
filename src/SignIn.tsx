import React, { useState } from 'react';
import { supabase } from './supabaseClient';
import { motion, AnimatePresence } from 'motion/react';
import { LogIn, Mail, Lock, AlertCircle, ArrowRight, Eye, EyeOff, ArrowLeft, ShieldCheck, Send } from 'lucide-react';

interface SignInProps {
  onSuccess: () => void;
  onSwitchToSignUp: () => void;
  onBack?: () => void;
  initialEmail?: string;
  signupSuccess?: boolean;
}

export default function SignIn({ onSuccess, onSwitchToSignUp, onBack, initialEmail = '', signupSuccess = false }: SignInProps) {
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState('');
  const [otpMode, setOtpMode] = useState(false);
  const [otp, setOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // Update email if initialEmail changes (e.g. after signup)
  React.useEffect(() => {
    if (initialEmail) {
      setEmail(initialEmail);
    }
  }, [initialEmail]);

  const handleSendOtp = async () => {
    if (!email) {
      setError('Please enter your email address first.');
      return;
    }
    
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/auth/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to send OTP');
      
      setOtpSent(true);
      setError(null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (!supabase) {
        setError('Supabase is not configured. You can still explore the app by clicking "Continue as Guest" on the landing page.');
        return;
      }
      // Use the requested Supabase method for Sign In
      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (signInError) throw signInError;
      
      // If successful, call the onSuccess callback which redirects to Home ("/")
      if (data.user) {
        onSuccess();
      }
    } catch (err: any) {
      console.error('Sign in error:', err);
      setError(err.message || 'Failed to sign in. Please check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!supabase) {
      setError('Supabase is not configured. You can still explore the app by clicking "Continue as Guest" on the landing page.');
      return;
    }
    if (!email) {
      setError('Please enter your email address first to reset your password.');
      return;
    }
    
    setLoading(true);
    setError(null);
    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/callback`,
      });
      if (resetError) throw resetError;
      setResetSent(true);
    } catch (err: any) {
      setError(err.message || 'Failed to send reset email');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    if (!supabase) {
      setError('Supabase is not configured. You can still explore the app by clicking "Continue as Guest" on the landing page.');
      return;
    }
    setError(null);
    try {
      // 1. Get the OAuth URL from Supabase without redirecting
      const { data, error: googleError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          // The redirect URL must point to our server-side callback
          redirectTo: `${window.location.origin}/auth/callback`,
          skipBrowserRedirect: true,
        },
      });

      if (googleError) throw googleError;

      if (data?.url) {
        // 2. Open the provider's URL in a popup
        const width = 600;
        const height = 700;
        const left = window.screenX + (window.outerWidth - width) / 2;
        const top = window.screenY + (window.outerHeight - height) / 2;
        
        const popup = window.open(
          data.url,
          'google_oauth_popup',
          `width=${width},height=${height},left=${left},top=${top},status=no,menubar=no,toolbar=no`
        );

        if (!popup) {
          setError('Popup blocked! Please allow popups for this site to continue with Google.');
        }
      }
    } catch (err: any) {
      console.error('Google login error:', err);
      setError(err.message || 'Failed to login with Google');
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="w-full max-w-md p-8 bg-white rounded-3xl border border-zinc-100 shadow-xl relative"
    >
      {onBack && (
        <button 
          onClick={onBack}
          className="absolute left-6 top-6 p-2 text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 rounded-full transition-all"
        >
          <ArrowLeft size={20} />
        </button>
      )}
      <div className="flex flex-col items-center mb-8">
        <div className="w-16 h-16 bg-emerald-100 rounded-2xl flex items-center justify-center text-emerald-600 mb-4">
          <LogIn size={32} />
        </div>
        <h2 className="text-2xl font-display font-bold text-zinc-900">Welcome Back</h2>
        <p className="text-sm text-zinc-500 mt-1">Sign in to continue your learning journey</p>
      </div>

      <form onSubmit={handleSignIn} className="space-y-4">
        <div>
          <label className="block text-xs font-bold text-zinc-500 mb-1 uppercase tracking-wider">Email Address</label>
          <div className="relative flex gap-2">
            <div className="relative flex-1">
              <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400" size={18} />
              <input 
                type="email" 
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your@email.com"
                className="w-full bg-zinc-50 border border-zinc-200 rounded-xl pl-12 pr-4 py-3 text-sm outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all"
              />
            </div>
            {otpMode && (
              <button
                type="button"
                onClick={handleSendOtp}
                disabled={loading || !email}
                className="px-4 bg-emerald-50 text-emerald-600 border border-emerald-100 rounded-xl text-xs font-bold hover:bg-emerald-100 transition-all disabled:opacity-50"
              >
                {otpSent ? 'Resend' : 'Send OTP'}
              </button>
            )}
          </div>
        </div>

        <AnimatePresence mode="wait">
          {!otpMode ? (
            <motion.div
              key="password-mode"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="space-y-4 overflow-hidden"
            >
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider">Password</label>
                  <button 
                    type="button"
                    onClick={handleForgotPassword}
                    className="text-[10px] font-bold text-emerald-600 hover:underline"
                  >
                    Forgot Password?
                  </button>
                </div>
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400" size={18} />
                  <input 
                    type={showPassword ? "text" : "password"} 
                    required={!otpMode}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full bg-zinc-50 border border-zinc-200 rounded-xl pl-12 pr-12 py-3 text-sm outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 transition-colors"
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="otp-mode"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="space-y-4 overflow-hidden"
            >
              <div>
                <label className="block text-xs font-bold text-zinc-500 mb-1 uppercase tracking-wider">Verification Code</label>
                <div className="relative">
                  <ShieldCheck className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400" size={18} />
                  <input 
                    type="text" 
                    required={otpMode}
                    value={otp}
                    onChange={(e) => setOtp(e.target.value)}
                    placeholder="6-digit code"
                    maxLength={6}
                    className="w-full bg-zinc-50 border border-zinc-200 rounded-xl pl-12 pr-4 py-3 text-sm outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all tracking-[0.5em] font-mono"
                  />
                </div>
                {otpSent && (
                  <p className="text-[10px] text-emerald-600 mt-2 font-medium flex items-center gap-1">
                    <Send size={10} /> OTP sent to your Gmail. Check your inbox.
                  </p>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="flex items-center gap-2 py-2">
          <button
            type="button"
            onClick={() => { setOtpMode(!otpMode); setError(null); }}
            className="text-xs font-bold text-zinc-400 hover:text-emerald-600 transition-colors flex items-center gap-1"
          >
            {otpMode ? 'Use Password instead' : 'Login with OTP instead'}
          </button>
        </div>

        {resetSent && (
          <motion.div 
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            className="flex items-start gap-3 p-4 bg-blue-50 border border-blue-100 rounded-2xl text-blue-700 text-sm mb-4"
          >
            <AlertCircle size={18} className="mt-0.5 shrink-0" />
            <p>Password reset link sent! Please check your email inbox.</p>
          </motion.div>
        )}

        {signupSuccess && (
          <motion.div 
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            className="flex items-start gap-3 p-4 bg-emerald-50 border border-emerald-100 rounded-2xl text-emerald-700 text-sm mb-4"
          >
            <AlertCircle size={18} className="mt-0.5 shrink-0" />
            <p>Your account has been created. Please check your email and verify your address before logging in.</p>
          </motion.div>
        )}

        {error && (
          <motion.div 
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            className="flex items-center gap-2 p-3 bg-red-50 border border-red-100 rounded-xl text-red-600 text-xs font-medium"
          >
            <AlertCircle size={14} />
            {error}
          </motion.div>
        )}

        <button 
          type="submit"
          disabled={loading}
          className="w-full h-14 bg-emerald-600 text-white rounded-2xl font-bold flex items-center justify-center gap-2 shadow-lg active:scale-95 transition-all disabled:opacity-50 mt-6"
        >
          {loading ? (
            <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
          ) : (
            <>
              Sign In
              <ArrowRight size={18} />
            </>
          )}
        </button>

        <div className="relative my-8">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-zinc-100"></div>
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-white px-4 text-zinc-400 font-medium">Or continue with</span>
          </div>
        </div>

        <button 
          type="button"
          onClick={handleGoogleLogin}
          className="w-full h-14 bg-white border border-zinc-200 text-zinc-700 rounded-2xl font-bold flex items-center justify-center gap-3 shadow-sm hover:bg-zinc-50 active:scale-95 transition-all"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 12-4.53z" fill="#EA4335"/>
          </svg>
          Continue with Google
        </button>
      </form>

      <div className="mt-8 text-center">
        <p className="text-sm text-zinc-500">
          Don't have an account?{' '}
          <button 
            onClick={onSwitchToSignUp}
            className="text-emerald-600 font-bold hover:underline"
          >
            Sign Up
          </button>
        </p>
      </div>
    </motion.div>
  );
}
