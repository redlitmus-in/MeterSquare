import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  ArrowRight,
  Mail,
  CheckCircle,
  Activity,
  ShieldCheck,
  Users,
  Package,
  Clock,
  Shield,
  BarChart3,
  Layers,
  Phone,
  KeyRound,
  User,
  Building2,
  HardHat,
  Briefcase,
  ChevronDown,
  Sparkles,
  Lock,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Wrench,
  Calculator,
  DollarSign
} from 'lucide-react';
import { toast } from 'sonner';
import OTPInput from '@/components/OTPInput';
import ModernLoadingSpinners from '@/components/ui/ModernLoadingSpinners';
import authApi from '@/api/auth';
import { fetchRoles, Role } from '@/api/roles';

// Icon mapping for roles
const roleIcons: Record<string, any> = {
  'siteSupervisor': HardHat,
  'mepSupervisor': Activity,
  'procurement': Package,
  'projectManager': Users,
  'design': Layers,
  'estimation': Calculator,
  'accounts': DollarSign,
  'technicalDirector': Briefcase
};

// Color mapping for roles
const roleColors: Record<string, string> = {
  'siteSupervisor': 'from-orange-500 to-red-600',
  'mepSupervisor': 'from-cyan-500 to-blue-600',
  'procurement': 'from-red-500 to-pink-600',
  'projectManager': 'from-green-500 to-emerald-600',
  'design': 'from-purple-500 to-indigo-600',
  'estimation': 'from-amber-500 to-orange-600',
  'accounts': 'from-green-600 to-teal-600',
  'technicalDirector': 'from-blue-600 to-indigo-700'
};

const LoginPageOTP: React.FC = () => {
  const navigate = useNavigate();
  const [step, setStep] = useState<'email' | 'otp' | 'success'>('email');
  const [email, setEmail] = useState('');
  const [selectedRole, setSelectedRole] = useState<string>('');
  const [roles, setRoles] = useState<Role[]>([]);
  const [otp, setOtp] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [resendTimer, setResendTimer] = useState(0);
  const [userRole, setUserRole] = useState<string>('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);


  // Load roles on component mount
  useEffect(() => {
    const loadRoles = async () => {
      const availableRoles = await fetchRoles();
      setRoles(availableRoles);
    };
    loadRoles();
  }, []);

  // Timer for resend OTP
  useEffect(() => {
    if (resendTimer > 0) {
      const timer = setTimeout(() => setResendTimer(resendTimer - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [resendTimer]);

  const handleSendOTP = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!email) {
      toast.error('Please enter your email address');
      return;
    }

    if (!selectedRole) {
      toast.error('Please select your role');
      return;
    }

    setIsLoading(true);
    console.log('Sending OTP to:', email, 'with role:', selectedRole);
    
    try {
      const response = await authApi.sendOTP(email, selectedRole);
      console.log('OTP sent successfully:', response);
      
      setStep('otp');
      setResendTimer(30);
      
      toast.success('OTP Sent Successfully!', {
        description: response.message,
        icon: <Mail className="w-5 h-5 text-green-500" />
      });
    } catch (error: any) {
      console.error('Failed to send OTP:', error);
      toast.error('Failed to send OTP', {
        description: error.message || 'Please check your connection and try again'
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyOTP = async () => {
    // Prevent duplicate verification attempts
    if (isLoading || step === 'success') {
      return;
    }
    
    if (otp.length !== 6) {
      toast.error('Invalid OTP', {
        description: 'Please enter a 6-digit OTP'
      });
      return;
    }

    setIsLoading(true);
    
    try {
      const response = await authApi.verifyOTP(email, otp);
      
      setStep('success');
      setUserRole(response.user.role);
      
      toast.success('Login Successful!', {
        description: `Welcome ${response.user.full_name || response.user.role}`,
        icon: <CheckCircle className="w-5 h-5 text-green-500" />
      });
      
      // Redirect after animation
      setTimeout(() => {
        navigate('/dashboard');
      }, 2000);
    } catch (error: any) {
      // Only show error if we're still on the OTP step (not already successful)
      if (step === 'otp') {
        // Check if it's a real error or just a duplicate attempt after success
        const errorMessage = error.message?.toLowerCase() || '';
        if (errorMessage.includes('not found') || errorMessage.includes('expired')) {
          // This might be a duplicate attempt after successful login
          // Check if we're already authenticated
          if (authApi.isAuthenticated()) {
            // Already logged in, just redirect
            navigate('/dashboard');
            return;
          }
        }
        
        toast.error('Invalid OTP', {
          description: error.message
        });
      }
      setIsLoading(false);
    }
  };

  const handleResendOTP = async () => {
    if (resendTimer === 0) {
      setIsLoading(true);
      try {
        const response = await authApi.sendOTP(email, selectedRole);
        setResendTimer(30);
        
        toast.success('OTP Resent!', {
          description: response.message,
          icon: <RefreshCw className="w-5 h-5 text-green-500" />
        });
      } catch (error: any) {
        toast.error('Failed to resend OTP', {
          description: error.message
        });
      } finally {
        setIsLoading(false);
      }
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-50 flex items-center justify-center p-6">
      {/* Background decoration */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute top-0 left-0 w-96 h-96 bg-gradient-to-br from-red-100 to-rose-100 rounded-full blur-3xl opacity-30 -translate-x-1/2 -translate-y-1/2" />
        <div className="absolute bottom-0 right-0 w-96 h-96 bg-gradient-to-br from-blue-100 to-indigo-100 rounded-full blur-3xl opacity-30 translate-x-1/2 translate-y-1/2" />
      </div>

      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="relative z-10 w-full max-w-md"
      >
        {/* Logo Section */}
        <motion.div 
          className="text-center mb-8"
          initial={{ y: -20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.1 }}
        >
          <div className="flex justify-center mb-4">
            <div className="relative">
              <motion.div
                className="absolute inset-0 bg-gradient-to-r from-red-500 to-rose-500 rounded-full blur-2xl opacity-20"
                animate={{ scale: [1, 1.2, 1] }}
                transition={{ duration: 3, repeat: Infinity }}
              />
              <img
                src="/assets/logo.png"
                alt="MeterSquare"
                className="h-16 w-auto object-contain relative z-10"
              />
            </div>
          </div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-gray-900 to-gray-700 bg-clip-text text-transparent">
            MeterSquare ERP
          </h1>
          <p className="text-gray-500 mt-2">Secure Login with OTP</p>
        </motion.div>

        {/* Main Card */}
        <motion.div
          className="bg-white/90 backdrop-blur-xl rounded-3xl shadow-2xl p-8 border border-gray-100"
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.2 }}
        >
          <AnimatePresence mode="wait">
            {/* Step 1: Email & Role Selection */}
            {step === 'email' && (
              <motion.form
                key="email-form"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                onSubmit={handleSendOTP}
                className="space-y-6"
              >
                <div className="text-center mb-6">
                  <div className="w-16 h-16 bg-gradient-to-br from-red-100 to-rose-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                    <Mail className="w-8 h-8 text-red-500" />
                  </div>
                  <h2 className="text-xl font-semibold text-gray-900">Sign In</h2>
                  <p className="text-sm text-gray-500 mt-1">Enter your email to receive OTP</p>
                </div>

                {/* Email Input */}
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                    <Mail className="w-4 h-4 text-gray-400" />
                    Email Address
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:border-[#243d8a] focus:ring-2 focus:ring-[#243d8a]/20 transition-all duration-200 text-gray-700 placeholder-gray-400"
                    placeholder="user@metersquare.com"
                    required
                  />
                </div>

                {/* Role Selection Dropdown */}
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                    <Users className="w-4 h-4 text-gray-400" />
                    Select Role
                  </label>
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                      className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:border-[#243d8a] focus:ring-2 focus:ring-[#243d8a]/20 transition-all duration-200 text-gray-700 flex items-center justify-between"
                    >
                      {selectedRole ? (
                        <div className="flex items-center gap-2">
                          {(() => {
                            const role = roles.find(r => r.id === selectedRole);
                            const Icon = role ? roleIcons[role.id] : Users;
                            return (
                              <>
                                <div className={`w-6 h-6 rounded-md bg-gradient-to-br ${role ? roleColors[role.id] : 'from-gray-500 to-gray-600'} flex items-center justify-center`}>
                                  {Icon && <Icon className="w-3 h-3 text-white" />}
                                </div>
                                <span>{role?.title || 'Select a role'}</span>
                              </>
                            );
                          })()}
                        </div>
                      ) : (
                        <span className="text-gray-400">Choose your role</span>
                      )}
                      <ChevronDown className={`w-5 h-5 text-gray-400 transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`} />
                    </button>
                    
                    {/* Dropdown Menu */}
                    {isDropdownOpen && (
                      <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="absolute z-10 w-full mt-2 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden"
                      >
                        <div className="max-h-64 overflow-y-auto">
                          {roles.map((role) => {
                            const Icon = roleIcons[role.id] || Users;
                            return (
                              <button
                                key={role.id}
                                type="button"
                                onClick={() => {
                                  setSelectedRole(role.id);
                                  setIsDropdownOpen(false);
                                }}
                                className={`w-full px-4 py-3 flex items-center gap-3 hover:bg-gray-50 transition-colors ${selectedRole === role.id ? 'bg-gray-50' : ''}`}
                              >
                                <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${roleColors[role.id] || 'from-gray-500 to-gray-600'} flex items-center justify-center`}>
                                  <Icon className="w-4 h-4 text-white" />
                                </div>
                                <div className="text-left flex-1">
                                  <div className="font-medium text-gray-900">{role.title}</div>
                                  <div className="text-xs text-gray-500">{role.tier}</div>
                                </div>
                                {selectedRole === role.id && (
                                  <CheckCircle2 className="w-5 h-5 text-[#243d8a]" />
                                )}
                              </button>
                            );
                          })}
                        </div>
                      </motion.div>
                    )}
                  </div>
                </div>

                {/* Submit Button */}
                <motion.button
                  type="submit"
                  disabled={isLoading || !email || !selectedRole}
                  className="w-full bg-gradient-to-r from-[#243d8a] to-indigo-600 hover:from-[#1d3270] hover:to-indigo-700 text-white font-semibold py-3 px-6 rounded-xl transition-all duration-200 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  whileHover={{ scale: isLoading ? 1 : 1.01 }}
                  whileTap={{ scale: isLoading ? 1 : 0.99 }}
                >
                  {isLoading ? (
                    <div className="flex items-center justify-center gap-2">
                      <ModernLoadingSpinners variant="pulse-wave" size="sm" />
                      <span>Sending OTP...</span>
                    </div>
                  ) : (
                    <>
                      <span>Send OTP</span>
                      <ArrowRight className="w-5 h-5" />
                    </>
                  )}
                </motion.button>
              </motion.form>
            )}

            {/* Step 2: OTP Verification */}
            {step === 'otp' && (
              <motion.div
                key="otp-form"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                className="space-y-6"
              >
                <div className="text-center mb-6">
                  <div className="w-16 h-16 bg-gradient-to-br from-indigo-100 to-blue-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                    <KeyRound className="w-8 h-8 text-indigo-500" />
                  </div>
                  <h2 className="text-xl font-semibold text-gray-900">Enter OTP</h2>
                  <p className="text-sm text-gray-500 mt-1">
                    We've sent a 6-digit code to
                  </p>
                  <p className="text-sm font-medium text-gray-700 mt-1">{email}</p>
                </div>

                {/* OTP Input */}
                <div className="space-y-4">
                  <OTPInput
                    value={otp}
                    onChange={setOtp}
                    onComplete={handleVerifyOTP}
                    disabled={isLoading}
                  />
                  
                  {/* Timer and Resend */}
                  <div className="text-center">
                    {resendTimer > 0 ? (
                      <p className="text-sm text-gray-500">
                        Resend OTP in <span className="font-semibold text-[#243d8a]">{resendTimer}s</span>
                      </p>
                    ) : (
                      <button
                        type="button"
                        onClick={handleResendOTP}
                        className="text-sm font-medium text-[#243d8a] hover:text-[#243d8a]/80 transition-colors"
                      >
                        Resend OTP
                      </button>
                    )}
                  </div>
                </div>

                {/* Verify Button */}
                <motion.button
                  onClick={handleVerifyOTP}
                  disabled={isLoading || otp.length !== 6}
                  className="w-full bg-gradient-to-r from-[#243d8a] to-indigo-600 hover:from-[#1d3270] hover:to-indigo-700 text-white font-semibold py-3 px-6 rounded-xl transition-all duration-200 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  whileHover={{ scale: isLoading ? 1 : 1.01 }}
                  whileTap={{ scale: isLoading ? 1 : 0.99 }}
                >
                  {isLoading ? (
                    <div className="flex items-center justify-center gap-2">
                      <ModernLoadingSpinners variant="pulse-wave" size="sm" />
                      <span>Verifying...</span>
                    </div>
                  ) : (
                    <>
                      <span>Verify & Login</span>
                      <Lock className="w-5 h-5" />
                    </>
                  )}
                </motion.button>

                {/* Back Button */}
                <button
                  type="button"
                  onClick={() => {
                    setStep('email');
                    setOtp('');
                  }}
                  className="w-full text-sm text-gray-500 hover:text-gray-700 transition-colors"
                >
                  ← Back to email
                </button>
              </motion.div>
            )}

            {/* Step 3: Success */}
            {step === 'success' && (
              <motion.div
                key="success"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="text-center py-8"
              >
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", delay: 0.2 }}
                  className="w-20 h-20 bg-gradient-to-br from-green-100 to-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4"
                >
                  <CheckCircle className="w-10 h-10 text-green-500" />
                </motion.div>
                <h2 className="text-2xl font-bold text-gray-900 mb-2">Welcome!</h2>
                <p className="text-gray-600">Login successful. Redirecting...</p>
                {userRole && (
                  <div className="flex items-center justify-center gap-2 mt-4">
                    <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${roleColors[userRole] || 'from-gray-500 to-gray-600'} flex items-center justify-center`}>
                      {roleIcons[userRole] ? React.createElement(roleIcons[userRole], { className: "w-4 h-4 text-white" }) : <Users className="w-4 h-4 text-white" />}
                    </div>
                    <span className="text-sm font-medium text-gray-700">
                      {userRole.replace(/([A-Z])/g, ' $1').trim()}
                    </span>
                  </div>
                )}
                <motion.div
                  className="mt-6"
                  initial={{ width: "0%" }}
                  animate={{ width: "100%" }}
                  transition={{ duration: 2, ease: "linear" }}
                >
                  <div className="h-1 bg-gray-200 rounded-full overflow-hidden">
                    <motion.div
                      className="h-full bg-gradient-to-r from-green-500 to-emerald-500"
                      initial={{ width: "0%" }}
                      animate={{ width: "100%" }}
                      transition={{ duration: 2, ease: "linear" }}
                    />
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        {/* Security & Features */}
        <motion.div
          className="mt-8 flex items-center justify-center gap-6"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
        >
          <div className="flex items-center gap-2 text-gray-500">
            <ShieldCheck className="w-4 h-4 text-green-500" />
            <span className="text-xs">Secure OTP</span>
          </div>
          <div className="flex items-center gap-2 text-gray-500">
            <Activity className="w-4 h-4 text-[#243d8a]" />
            <span className="text-xs">Role-Based Access</span>
          </div>
          <div className="flex items-center gap-2 text-gray-500">
            <Sparkles className="w-4 h-4 text-amber-500" />
            <span className="text-xs">Modern UI</span>
          </div>
        </motion.div>
      </motion.div>
    </div>
  );
};

export default LoginPageOTP;