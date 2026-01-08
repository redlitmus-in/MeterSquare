import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { motion } from 'framer-motion';
import {
  ArrowRight,
  Lock,
  Mail,
  CheckCircle,
  Activity,
  ShieldCheck,
  Users,
  FileText,
  ChevronDown,
  CheckCircle2,
  KeyRound,
  RefreshCw,
  Shield,
  Briefcase,
  HardHat,
  Package,
  User,
  TrendingUp as LineChart,
  CheckSquare,
  ClipboardList,
  Clock,
  Layers,
  PieChart,
  Settings,
  Target,
  Truck,
  TrendingUp,
  BarChart3,
  Building2,
  Phone,
  Smartphone
} from 'lucide-react';
import { showSuccess, showError, showWarning, showInfo } from '@/utils/toastHelper';

import { useAuthStore } from '@/store/authStore';
import { LoginRequest } from '@/types';
import ModernLoadingSpinners from '@/components/ui/ModernLoadingSpinners';
import OTPInput from '@/components/OTPInput';
import { AnimatePresence } from 'framer-motion';
import { authApi } from '@/api/auth';
import { getRoleDashboardPath } from '@/utils/roleRouting';
import { clearAllCachedData } from '@/utils/clearCache';
import './LoginPage.css';

const loginSchema = z.object({
  email: z.string().optional(),
  role: z.string().min(1, 'Please select a role'),
});

// Country codes with phone number length validation
const countryCodes = [
  { code: '+971', country: 'UAE', flag: '🇦🇪', minLength: 9, maxLength: 9 },
  { code: '+91', country: 'India', flag: '🇮🇳', minLength: 10, maxLength: 10 },
  { code: '+1', country: 'USA', flag: '🇺🇸', minLength: 10, maxLength: 10 },
  { code: '+44', country: 'UK', flag: '🇬🇧', minLength: 10, maxLength: 10 },
  { code: '+966', country: 'Saudi', flag: '🇸🇦', minLength: 9, maxLength: 9 },
  { code: '+968', country: 'Oman', flag: '🇴🇲', minLength: 8, maxLength: 8 },
  { code: '+973', country: 'Bahrain', flag: '🇧🇭', minLength: 8, maxLength: 8 },
  { code: '+974', country: 'Qatar', flag: '🇶🇦', minLength: 8, maxLength: 8 },
  { code: '+965', country: 'Kuwait', flag: '🇰🇼', minLength: 8, maxLength: 8 },
  { code: '+92', country: 'Pakistan', flag: '🇵🇰', minLength: 10, maxLength: 10 },
  { code: '+880', country: 'Bangladesh', flag: '🇧🇩', minLength: 10, maxLength: 10 },
  { code: '+63', country: 'Philippines', flag: '🇵🇭', minLength: 10, maxLength: 10 },
];

// Mask phone number - hide center 6 digits
const maskPhoneNumber = (phone: string, countryCode: string): string => {
  // Clean the phone number - only digits
  const numberOnly = phone.replace(/\D/g, '');
  if (numberOnly.length <= 4) return `${countryCode} ${numberOnly}`;

  // For proper masking: show first 2, mask center 6, show last 2
  // Example: 501234567 -> 50******67
  const firstPart = numberOnly.slice(0, 2);
  const lastPart = numberOnly.slice(-2);

  return `${countryCode} ${firstPart}******${lastPart}`;
};

// Mask email - hide center 6 characters of local part
const maskEmail = (email: string): string => {
  if (!email || !email.includes('@')) return email;

  const [localPart, domain] = email.split('@');
  if (localPart.length <= 4) {
    return `${localPart[0]}******@${domain}`;
  }

  // Show first 2 and last 2 characters, mask center with 6 asterisks
  // Example: rameshsurya107 -> ra******07
  const firstPart = localPart.slice(0, 2);
  const lastPart = localPart.slice(-2);

  return `${firstPart}******${lastPart}@${domain}`;
};

// Available roles - matching README requirements
const availableRoles = [
  { value: 'admin', label: 'Admin', icon: Shield },
  { value: 'technicalDirector', label: 'Technical Director', icon: Briefcase },
  { value: 'estimator', label: 'Estimator', icon: FileText },
  { value: 'projectManager', label: 'Project Manager', icon: Users },
  { value: 'productionManager', label: 'Production Manager', icon: Building2 },
  { value: 'mep', label: 'MEP Supervisor', icon: Activity },  // MEP management level role
  { value: 'siteEngineer', label: 'Site Engineer', icon: HardHat },
  { value: 'buyer', label: 'Procurement', icon: Package },
];

type LoginFormData = z.infer<typeof loginSchema>;


const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const { login, isLoading } = useAuthStore();
  const [showPassword, setShowPassword] = useState(false);
  const [step, setStep] = useState<'email' | 'otp'>('email');
  const [otp, setOtp] = useState('');
  const [showRoleDropdown, setShowRoleDropdown] = useState(false);
  const [resendTimer, setResendTimer] = useState(0);
  const [userEmail, setUserEmail] = useState('');
  const [userRole, setUserRole] = useState('');
  const [isSendingOTP, setIsSendingOTP] = useState(false);
  const [isVerifyingOTP, setIsVerifyingOTP] = useState(false);
  // Site Engineer SMS login states
  const [loginMethod, setLoginMethod] = useState<'email' | 'phone'>('email');
  const [userPhone, setUserPhone] = useState('');
  const [selectedCountryCode, setSelectedCountryCode] = useState(countryCodes[0]); // Default UAE
  const [showCountryDropdown, setShowCountryDropdown] = useState(false);
  const [phoneError, setPhoneError] = useState('');
  const isSiteEngineer = userRole === 'siteEngineer';
  
  // Timer for resend OTP
  useEffect(() => {
    if (resendTimer > 0) {
      const timer = setTimeout(() => setResendTimer(resendTimer - 1), 1000);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [resendTimer]);
  

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
  });
  

  const onSubmit = async (data: LoginFormData) => {
    try {
      // For site engineer with phone login
      if (data.role === 'siteEngineer' && loginMethod === 'phone') {
        if (!userPhone) {
          showError('Please fill all fields', {
            description: 'Phone number is required'
          });
          return;
        }
        // Validate phone length based on country code
        if (userPhone.length !== selectedCountryCode.minLength) {
          showError('Invalid phone number', {
            description: `${selectedCountryCode.country} phone numbers must be ${selectedCountryCode.minLength} digits`
          });
          return;
        }
      } else {
        if (!data.email || !data.role) {
          showError('Please fill all fields', {
            description: 'Email and role are required'
          });
          return;
        }
        // Validate email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(data.email)) {
          showError('Invalid email', {
            description: 'Please enter a valid email address'
          });
          return;
        }
      }

      setIsSendingOTP(true);

      // Clear any stale cached data before login
      clearAllCachedData();

      setUserEmail(data.email || '');
      setUserRole(data.role);

      // Use SMS API for site engineer with phone login
      if (data.role === 'siteEngineer' && loginMethod === 'phone') {
        // Combine country code with phone number (remove + for API)
        const fullPhone = selectedCountryCode.code.replace('+', '') + userPhone;
        const response = await authApi.sendSiteSupervisorOTP('phone', fullPhone);

        setStep('otp');
        setResendTimer(30);

        showSuccess('OTP Sent Successfully!', {
          description: 'Please check your phone for the SMS OTP',
          duration: 5000,
          icon: <Smartphone className="w-5 h-5 text-green-500" />
        });

        if (response.otp && process.env.NODE_ENV === 'development') {
          console.log('Development OTP:', response.otp);
        }
      } else if (data.role === 'siteEngineer' && loginMethod === 'email') {
        // Site engineer with email login
        const response = await authApi.sendSiteSupervisorOTP('email', data.email!);

        setStep('otp');
        setResendTimer(30);

        showSuccess('OTP Sent Successfully!', {
          description: 'Please check your email for the OTP',
          duration: 5000,
          icon: <Mail className="w-5 h-5 text-green-500" />
        });

        if (response.otp && process.env.NODE_ENV === 'development') {
          console.log('Development OTP:', response.otp);
        }
      } else {
        // Regular login for other roles
        const response = await authApi.sendOTP(data.email!, data.role);

        setStep('otp');
        setResendTimer(30);

        showSuccess('OTP Sent Successfully!', {
          description: 'Please check your email for the OTP',
          duration: 5000,
          icon: <Mail className="w-5 h-5 text-green-500" />
        });

        if (response.otp && process.env.NODE_ENV === 'development') {
          console.log('Development OTP:', response.otp);
        }
      }
    } catch (error: any) {
      // Check if it's a 404 error (user not found)
      if (error.message?.toLowerCase().includes('not found') || error.message?.toLowerCase().includes('no user')) {
        showError(loginMethod === 'phone' ? 'Phone not found' : 'Email not found', {
          description: `Please check your ${loginMethod === 'phone' ? 'phone number' : 'email address'} and try again.`,
          icon: loginMethod === 'phone' ? <Phone className="w-5 h-5 text-red-500" /> : <Mail className="w-5 h-5 text-red-500" />
        });
      } else if (error.message?.toLowerCase().includes('invalid role')) {
        showError('Invalid role selection', {
          description: 'The selected role is not assigned to this account.',
          icon: <User className="w-5 h-5 text-red-500" />
        });
      } else {
        showError('Failed to send OTP', {
          description: error.message || 'Please check your credentials and try again.'
        });
      }
    } finally {
      setIsSendingOTP(false);
    }
  };

  const handleVerifyOTP = async (otpValue?: string) => {
    const otpToVerify = otpValue || otp;

    // Prevent duplicate verification attempts
    if (authApi.isAuthenticated()) {
      // Already authenticated, just redirect
      const currentUserRole = authApi.getUserRole();
      const dashboardPath = getRoleDashboardPath(currentUserRole || 'user');
      navigate(dashboardPath);
      return;
    }

    if (otpToVerify.length !== 6) {
      showError('Invalid OTP', {
        description: 'Please enter a 6-digit OTP'
      });
      return;
    }

    setIsVerifyingOTP(true);

    try {
      let response;

      // Use Site Supervisor verify API for site engineers
      if (userRole === 'siteEngineer') {
        if (loginMethod === 'phone') {
          const fullPhone = selectedCountryCode.code.replace('+', '') + userPhone;
          response = await authApi.verifySiteSupervisorOTP('phone', fullPhone, otpToVerify);
        } else {
          response = await authApi.verifySiteSupervisorOTP('email', userEmail, otpToVerify);
        }
      } else {
        // Regular verify for other roles
        response = await authApi.verifyOTP(userEmail, otpToVerify);
      }

      const roleData = availableRoles.find(r => r.value === userRole);

      // Update auth store immediately with the user data we already have
      useAuthStore.setState({
        user: response.user,
        isAuthenticated: true,
        isLoading: false,
        error: null,
      });

      showSuccess('Welcome to MeterSquare ERP', {
        description: `Logged in as ${response.user.role}`,
        icon: <CheckCircle className="w-5 h-5 text-green-500" />
      });

      // Navigate to role-specific dashboard immediately
      const dashboardPath = getRoleDashboardPath(response.user.role || userRole);
      navigate(dashboardPath);
    } catch (error: any) {
      // Check if it's a duplicate attempt after successful login
      const errorMessage = error.message?.toLowerCase() || '';
      if ((errorMessage.includes('not found') || errorMessage.includes('expired')) && authApi.isAuthenticated()) {
        // Already logged in, just redirect
        const currentUserRole = authApi.getUserRole();
        const dashboardPath = getRoleDashboardPath(currentUserRole || 'user');
        navigate(dashboardPath);
        return;
      }

      showError('Invalid OTP', {
        description: error.message || 'Please enter the correct OTP'
      });
    } finally {
      setIsVerifyingOTP(false);
    }
  };

  const handleResendOTP = async () => {
    if (resendTimer === 0) {
      try {
        let response;

        // Use Site Supervisor API for site engineers
        if (userRole === 'siteEngineer') {
          if (loginMethod === 'phone') {
            const fullPhone = selectedCountryCode.code.replace('+', '') + userPhone;
            response = await authApi.sendSiteSupervisorOTP('phone', fullPhone);
          } else {
            response = await authApi.sendSiteSupervisorOTP('email', userEmail);
          }
        } else {
          response = await authApi.sendOTP(userEmail, userRole);
        }

        setResendTimer(30);
        showSuccess('OTP Resent!', {
          description: loginMethod === 'phone'
            ? 'Please check your phone for the new SMS OTP'
            : 'Please check your email for the new OTP',
          duration: 5000,
          icon: <RefreshCw className="w-5 h-5 text-green-500" />
        });

        // Only show OTP in development mode
        if (response.otp && process.env.NODE_ENV === 'development') {
          console.log('Development OTP:', response.otp);
        }
      } catch (error: any) {
        showError('Failed to resend OTP', {
          description: error.message || 'Please try again.'
        });
      }
    }
  };

  return (
    <>
      <style>{`
        @keyframes sparkle {
          0% { 
            opacity: 0;
            transform: scale(0) rotate(0deg);
          }
          50% { 
            opacity: 1;
            transform: scale(1) rotate(180deg);
          }
          100% { 
            opacity: 0;
            transform: scale(0) rotate(360deg);
          }
        }
        
        @keyframes shimmer {
          0% {
            transform: translateX(-100%) translateY(-100%) rotate(45deg);
          }
          100% {
            transform: translateX(100%) translateY(100%) rotate(45deg);
          }
        }
        
        .shine-effect {
          position: relative;
          overflow: hidden;
        }
        
        .shine-effect::before {
          content: '';
          position: absolute;
          top: 0;
          left: -100%;
          width: 100%;
          height: 100%;
          background: linear-gradient(
            90deg,
            transparent 0%,
            rgba(255, 255, 255, 0.3) 20%,
            rgba(255, 255, 255, 0.7) 50%,
            rgba(255, 255, 255, 0.3) 80%,
            transparent 100%
          );
          border-radius: 12px;
          transition: all 0.3s ease;
        }
        
        .shine-active::before {
          animation: shineSwipe 0.8s ease-out;
        }
        
        @keyframes shineSwipe {
          0% {
            left: -100%;
            opacity: 0;
          }
          50% {
            opacity: 1;
          }
          100% {
            left: 100%;
            opacity: 0;
          }
        }
        
        @keyframes sineWave1 {
          0%, 100% { 
            transform: translateY(0) rotate(var(--rotation)) scale(1);
            box-shadow: 0 8px 25px rgba(192, 192, 192, 0.4), 0 0 15px rgba(255, 255, 255, 0.6);
            background: linear-gradient(135deg, #f8fafc, #fff, #f1f5f9);
          }
          25% { 
            transform: translateY(-4px) rotate(calc(var(--rotation) + 1deg)) scale(1.02);
            box-shadow: 0 12px 35px rgba(192, 192, 192, 0.6), 0 0 20px rgba(255, 255, 255, 0.8);
            background: linear-gradient(135deg, #e2e8f0, #f8fafc, #cbd5e1);
          }
          75% { 
            transform: translateY(2px) rotate(calc(var(--rotation) - 1deg)) scale(0.98);
            box-shadow: 0 6px 20px rgba(192, 192, 192, 0.3), 0 0 12px rgba(255, 255, 255, 0.5);
            background: linear-gradient(135deg, #f1f5f9, #fff, #e2e8f0);
          }
        }
        
        @keyframes sineWave2 {
          0%, 100% { 
            transform: translateY(0) rotate(var(--rotation)) scale(1);
            box-shadow: 0 4px 20px rgba(59, 130, 246, 0.15);
            background: linear-gradient(135deg, #f0f9ff, #fff);
          }
          35% { 
            transform: translateY(-6px) rotate(calc(var(--rotation) + 1deg)) scale(1.03);
            box-shadow: 0 10px 35px rgba(59, 130, 246, 0.3);
            background: linear-gradient(135deg, #dbeafe, #f0f9ff);
          }
          85% { 
            transform: translateY(3px) rotate(calc(var(--rotation) - 2deg)) scale(0.97);
            box-shadow: 0 2px 15px rgba(59, 130, 246, 0.2);
            background: linear-gradient(135deg, #eff6ff, #fff);
          }
        }
        
        @keyframes sineWave3 {
          0%, 100% { 
            transform: translateY(0) rotate(var(--rotation)) scale(1);
            box-shadow: 0 4px 20px rgba(16, 185, 129, 0.15);
            background: linear-gradient(135deg, #f0fdf4, #fff);
          }
          45% { 
            transform: translateY(-10px) rotate(calc(var(--rotation) + 3deg)) scale(1.04);
            box-shadow: 0 12px 40px rgba(16, 185, 129, 0.35);
            background: linear-gradient(135deg, #dcfce7, #f0fdf4);
          }
          80% { 
            transform: translateY(2px) rotate(calc(var(--rotation) - 1deg)) scale(0.99);
            box-shadow: 0 3px 18px rgba(16, 185, 129, 0.25);
            background: linear-gradient(135deg, #f7fee7, #fff);
          }
        }
        
        @keyframes sineWave4 {
          0%, 100% { 
            transform: translateY(0) rotate(var(--rotation)) scale(1);
            box-shadow: 0 4px 20px rgba(168, 85, 247, 0.15);
            background: linear-gradient(135deg, #faf5ff, #fff);
          }
          55% { 
            transform: translateY(-7px) rotate(calc(var(--rotation) + 2deg)) scale(1.02);
            box-shadow: 0 9px 32px rgba(168, 85, 247, 0.3);
            background: linear-gradient(135deg, #e9d5ff, #faf5ff);
          }
          90% { 
            transform: translateY(5px) rotate(calc(var(--rotation) - 3deg)) scale(0.98);
            box-shadow: 0 2px 16px rgba(168, 85, 247, 0.2);
            background: linear-gradient(135deg, #f3e8ff, #fff);
          }
        }
        
        @keyframes sineWave5 {
          0%, 100% { 
            transform: translateY(0) rotate(var(--rotation)) scale(1);
            box-shadow: 0 4px 20px rgba(245, 101, 101, 0.15);
            background: linear-gradient(135deg, #fef2f2, #fff);
          }
          30% { 
            transform: translateY(-9px) rotate(calc(var(--rotation) + 1deg)) scale(1.03);
            box-shadow: 0 11px 36px rgba(245, 101, 101, 0.32);
            background: linear-gradient(135deg, #fee2e2, #fef2f2);
          }
          70% { 
            transform: translateY(4px) rotate(calc(var(--rotation) - 2deg)) scale(0.97);
            box-shadow: 0 3px 17px rgba(245, 101, 101, 0.22);
            background: linear-gradient(135deg, #fef7f7, #fff);
          }
        }
        
        @keyframes sineWave6 {
          0%, 100% { 
            transform: translateY(0) rotate(var(--rotation)) scale(1);
            box-shadow: 0 4px 20px rgba(34, 197, 94, 0.15);
            background: linear-gradient(135deg, #f0fdf4, #fff);
          }
          40% { 
            transform: translateY(-5px) rotate(calc(var(--rotation) + 4deg)) scale(1.01);
            box-shadow: 0 8px 28px rgba(34, 197, 94, 0.28);
            background: linear-gradient(135deg, #dcfce7, #f0fdf4);
          }
          85% { 
            transform: translateY(6px) rotate(calc(var(--rotation) - 1deg)) scale(0.99);
            box-shadow: 0 2px 14px rgba(34, 197, 94, 0.18);
            background: linear-gradient(135deg, #f7fee7, #fff);
          }
        }
        
        @keyframes sineWave7 {
          0%, 100% { 
            transform: translateY(0) rotate(var(--rotation)) scale(1);
            box-shadow: 0 6px 22px rgba(192, 192, 192, 0.25), 0 0 12px rgba(255, 255, 255, 0.6);
            background: linear-gradient(135deg, #f8fafc, #fff, #f1f5f9);
          }
          35% { 
            transform: translateY(-4px) rotate(calc(var(--rotation) + 1deg)) scale(1.02);
            box-shadow: 0 10px 30px rgba(192, 192, 192, 0.45), 0 0 18px rgba(255, 255, 255, 0.8);
            background: linear-gradient(135deg, #e2e8f0, #f8fafc, #cbd5e1);
          }
          70% { 
            transform: translateY(2px) rotate(calc(var(--rotation) - 1deg)) scale(0.98);
            box-shadow: 0 4px 18px rgba(192, 192, 192, 0.2), 0 0 8px rgba(255, 255, 255, 0.4);
            background: linear-gradient(135deg, #f1f5f9, #fff, #e2e8f0);
          }
        }
        
        @keyframes sineWaveHub {
          0%, 100% { 
            transform: translateY(0) scale(1);
            box-shadow: 
              0 8px 32px rgba(239, 68, 68, 0.3),
              0 4px 16px rgba(244, 63, 94, 0.2);
            background: linear-gradient(135deg, #ef4444, #ec4899, #f43f5e);
          }
          50% { 
            transform: translateY(-8px) scale(1.05);
            box-shadow: 
              0 16px 48px rgba(239, 68, 68, 0.4),
              0 8px 24px rgba(244, 63, 94, 0.3),
              0 0 20px rgba(255, 255, 255, 0.6);
            background: linear-gradient(135deg, #f87171, #f472b6, #fb7185);
          }
        }
        
        @keyframes floatUp {
          0% { opacity: 0; transform: translateY(10px) scale(0.8); }
          30% { opacity: 1; transform: translateY(-15px) scale(1); }
          100% { opacity: 0; transform: translateY(-35px) scale(0.9); }
        }
        
        .popup-text {
          position: absolute;
          top: -35px;
          left: 50%;
          transform: translateX(-50%);
          font-size: 11px;
          font-weight: 600;
          color: white;
          background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 50%, #ec4899 100%);
          padding: 4px 10px;
          border-radius: 14px;
          white-space: nowrap;
          pointer-events: none;
          opacity: 0;
          box-shadow: 0 4px 12px rgba(99, 102, 241, 0.3);
          backdrop-filter: blur(8px);
        }
        
        @keyframes showFloat1 { 25% { animation: floatUp 1.2s ease-out; } }
        @keyframes showFloat2 { 37% { animation: floatUp 1.2s ease-out; } }
        @keyframes showFloat3 { 50% { animation: floatUp 1.2s ease-out; } }
        @keyframes showFloat4 { 62% { animation: floatUp 1.2s ease-out; } }
        @keyframes showFloat5 { 12% { animation: floatUp 1.2s ease-out; } }
        @keyframes showFloat6 { 75% { animation: floatUp 1.2s ease-out; } }
        @keyframes showFloat7 { 87% { animation: floatUp 1.2s ease-out; } }
        @keyframes showFloat8 { 0% { animation: floatUp 1.2s ease-out; } }
        
        /* Simple highlight when blue dot crosses */
        .workflow-node:nth-child(1) > div.shine-effect { animation: iconHighlight 0.6s ease-out 2s; }
        .workflow-node:nth-child(2) > div.shine-effect { animation: iconHighlight 0.6s ease-out 3s; }
        .workflow-node:nth-child(3) > div.shine-effect { animation: iconHighlight 0.6s ease-out 4s; }
        .workflow-node:nth-child(4) > div.shine-effect { animation: iconHighlight 0.6s ease-out 5s; }
        .workflow-node:nth-child(5) > div.shine-effect { animation: iconHighlight 0.6s ease-out 6s; }
        .workflow-node:nth-child(6) > div.shine-effect { animation: iconHighlight 0.6s ease-out 7s; }
        .workflow-node:nth-child(7) > div.shine-effect { animation: iconHighlight 0.6s ease-out 8s; }
        .workflow-node:nth-child(8) > div { animation: iconHighlight 0.6s ease-out 10s; }
        
        @keyframes iconHighlight {
          0% { 
            background: #fff;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
          }
          50% { 
            background: linear-gradient(135deg, #f8fafc, #e2e8f0);
            box-shadow: 0 8px 25px rgba(59, 130, 246, 0.3);
          }
          100% { 
            background: #fff;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
          }
        }
        
        .workflow-node:nth-child(1) .popup-text { animation: showFloat1 8s infinite ease-in-out; }
        .workflow-node:nth-child(2) .popup-text { animation: showFloat2 8s infinite ease-in-out; }
        .workflow-node:nth-child(3) .popup-text { animation: showFloat3 8s infinite ease-in-out; }
        .workflow-node:nth-child(4) .popup-text { animation: showFloat4 8s infinite ease-in-out; }
        .workflow-node:nth-child(5) .popup-text { animation: showFloat5 8s infinite ease-in-out; }
        .workflow-node:nth-child(6) .popup-text { animation: showFloat6 8s infinite ease-in-out; }
        .workflow-node:nth-child(7) .popup-text { animation: showFloat7 8s infinite ease-in-out; }
        .workflow-node:nth-child(8) .popup-text { animation: showFloat8 6s infinite ease-in-out; }
      `}</style>
      <div className="min-h-screen flex">
      {/* Left Panel - Modern Login Form - Resized for laptop */}
      <div className="w-full lg:w-2/5 xl:w-5/12 bg-gradient-to-br from-white via-gray-50 to-white flex items-center justify-center p-6 relative overflow-hidden">
        {/* Subtle Background Pattern */}
        <div className="absolute inset-0">
          <div className="absolute inset-0 opacity-[0.02] background-pattern" />
          <div className="absolute inset-0 opacity-[0.02] background-pattern" />
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="w-full max-w-md relative z-10"
        >
          {/* Logo Section - Slightly smaller for laptop */}
          <motion.div 
            className="text-center mb-6"
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.5 }}
          >
            <div className="flex justify-center mb-3">
              <div className="relative">
                <img
                  src="/assets/logo.png"
                  alt="MeterSquare Interiors LLC"
                  className="h-10 w-auto object-contain"
                />
              </div>
            </div>
            <h1 className="text-xl font-bold text-gray-900">
              Welcome to MeterSquare
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              Enterprise Resource Planning System
            </p>
          </motion.div>

          {/* Modern Login Form Card - Compact padding */}
          <motion.div
            className="bg-white/80 backdrop-blur-xl rounded-2xl shadow-2xl p-6 border border-gray-100"
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.1 }}
          >
            <AnimatePresence mode="wait">
              {step === 'email' ? (
                <motion.form
                  key="email-form"
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  onSubmit={handleSubmit(onSubmit)}
                  className="space-y-4"
                >
                  {/* Role Selection Dropdown - FIRST */}
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                      <User className="w-4 h-4 text-gray-400" />
                      Select Your Role
                    </label>
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => setShowRoleDropdown(!showRoleDropdown)}
                        className="w-full px-4 py-2.5 bg-gray-50/50 border border-gray-200 rounded-xl focus:bg-white focus:border-[#243d8a] focus:ring-2 focus:ring-[#243d8a]/20 transition-all duration-200 text-gray-700 text-left flex items-center justify-between"
                      >
                        {userRole ? (
                          <div className="flex items-center gap-2">
                            {(() => {
                              const role = availableRoles.find(r => r.value === userRole);
                              const Icon = role?.icon || User;
                              return (
                                <>
                                  <Icon className="w-4 h-4 text-[#243d8a]" />
                                  <span>{role?.label}</span>
                                </>
                              );
                            })()}
                          </div>
                        ) : (
                          <span className="text-gray-400">Choose your role...</span>
                        )}
                        <ChevronDown className={`w-5 h-5 text-gray-400 transition-transform ${showRoleDropdown ? 'rotate-180' : ''}`} />
                      </button>

                      <AnimatePresence>
                        {showRoleDropdown && (
                          <motion.div
                            initial={{ opacity: 0, y: -10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            className="absolute z-50 w-full mt-2 bg-white rounded-xl shadow-xl border border-gray-100 overflow-hidden"
                          >
                            <div className="max-h-64 overflow-y-auto">
                              {availableRoles.map((role) => {
                                const Icon = role.icon;
                                return (
                                  <button
                                    key={role.value}
                                    type="button"
                                    {...register('role')}
                                    onClick={() => {
                                      setValue('role', role.value);
                                      setUserRole(role.value);
                                      setShowRoleDropdown(false);
                                    }}
                                    className="w-full px-4 py-3 flex items-center gap-3 hover:bg-gray-50 transition-colors"
                                  >
                                    <Icon className="w-4 h-4 text-[#243d8a]" />
                                    <span className="text-gray-700">{role.label}</span>
                                    {userRole === role.value && (
                                      <CheckCircle2 className="w-4 h-4 text-green-500 ml-auto" />
                                    )}
                                  </button>
                                );
                              })}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                    {errors.role && (
                      <motion.p
                        initial={{ opacity: 0, y: -5 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="text-xs text-red-500 ml-1"
                      >
                        {errors.role.message}
                      </motion.p>
                    )}
                  </div>

                  {/* Phone/Email Toggle for Site Engineer */}
                  {isSiteEngineer && (
                    <div className="space-y-2">
                      <label className="text-sm font-semibold text-gray-700">Login Method</label>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => setLoginMethod('phone')}
                          className={`flex-1 py-2 px-3 rounded-lg border transition-all flex items-center justify-center gap-2 text-sm font-medium ${
                            loginMethod === 'phone'
                              ? 'bg-[#243d8a] text-white border-[#243d8a]'
                              : 'bg-gray-50 text-gray-600 border-gray-200 hover:border-[#243d8a]/50'
                          }`}
                        >
                          <Phone className="w-4 h-4" />
                          Phone (SMS)
                        </button>
                        <button
                          type="button"
                          onClick={() => setLoginMethod('email')}
                          className={`flex-1 py-2 px-3 rounded-lg border transition-all flex items-center justify-center gap-2 text-sm font-medium ${
                            loginMethod === 'email'
                              ? 'bg-[#243d8a] text-white border-[#243d8a]'
                              : 'bg-gray-50 text-gray-600 border-gray-200 hover:border-[#243d8a]/50'
                          }`}
                        >
                          <Mail className="w-4 h-4" />
                          Email
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Email or Phone Field based on login method */}
                  {isSiteEngineer && loginMethod === 'phone' ? (
                    <div className="space-y-2">
                      <label className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                        <Phone className="w-4 h-4 text-gray-400" />
                        Phone Number
                      </label>
                      <div className="flex gap-2">
                        {/* Country Code Dropdown */}
                        <div className="relative">
                          <button
                            type="button"
                            onClick={() => setShowCountryDropdown(!showCountryDropdown)}
                            className="flex items-center gap-1.5 px-3 py-2.5 bg-gray-50/50 border border-gray-200 rounded-xl focus:bg-white focus:border-[#243d8a] focus:ring-2 focus:ring-[#243d8a]/20 transition-all duration-200 text-gray-700 min-w-[100px]"
                          >
                            <span className="text-lg">{selectedCountryCode.flag}</span>
                            <span className="text-sm font-medium">{selectedCountryCode.code}</span>
                            <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${showCountryDropdown ? 'rotate-180' : ''}`} />
                          </button>

                          <AnimatePresence>
                            {showCountryDropdown && (
                              <motion.div
                                initial={{ opacity: 0, y: -10 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -10 }}
                                className="absolute z-50 w-48 mt-2 bg-white rounded-xl shadow-xl border border-gray-100 overflow-hidden"
                              >
                                <div className="max-h-48 overflow-y-auto">
                                  {countryCodes.map((country) => (
                                    <button
                                      key={country.code}
                                      type="button"
                                      onClick={() => {
                                        setSelectedCountryCode(country);
                                        setShowCountryDropdown(false);
                                        setPhoneError('');
                                      }}
                                      className="w-full px-3 py-2.5 flex items-center gap-2 hover:bg-gray-50 transition-colors"
                                    >
                                      <span className="text-lg">{country.flag}</span>
                                      <span className="text-sm text-gray-700">{country.country}</span>
                                      <span className="text-sm text-gray-500 ml-auto">{country.code}</span>
                                      {selectedCountryCode.code === country.code && (
                                        <CheckCircle2 className="w-4 h-4 text-green-500" />
                                      )}
                                    </button>
                                  ))}
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>

                        {/* Phone Number Input */}
                        <motion.div
                          className="relative flex-1"
                          whileFocus={{ scale: 1.01 }}
                        >
                          <input
                            type="tel"
                            value={userPhone}
                            onChange={(e) => {
                              const value = e.target.value.replace(/\D/g, '');
                              setUserPhone(value);
                              // Validate phone length
                              if (value.length > 0 && (value.length < selectedCountryCode.minLength || value.length > selectedCountryCode.maxLength)) {
                                setPhoneError(`${selectedCountryCode.country} numbers must be ${selectedCountryCode.minLength} digits`);
                              } else {
                                setPhoneError('');
                              }
                            }}
                            maxLength={selectedCountryCode.maxLength}
                            className={`w-full px-4 py-2.5 bg-gray-50/50 border rounded-xl focus:bg-white focus:border-transparent focus:ring-2 focus:ring-[#243d8a] focus:ring-offset-2 transition-all duration-200 text-gray-700 placeholder-gray-400 ${phoneError ? 'border-red-300' : 'border-gray-200'}`}
                            placeholder={`Enter ${selectedCountryCode.minLength} digit number`}
                          />
                        </motion.div>
                      </div>
                      {phoneError ? (
                        <p className="text-xs text-red-500 ml-1">{phoneError}</p>
                      ) : (
                        <p className="text-xs text-gray-500 ml-1">
                          Enter {selectedCountryCode.minLength} digit phone number for {selectedCountryCode.country}
                        </p>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <label className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                        <Mail className="w-4 h-4 text-gray-400" />
                        Email Address
                      </label>
                      <motion.div
                        className="relative"
                        whileFocus={{ scale: 1.01 }}
                      >
                        <input
                          {...register('email')}
                          type="email"
                          className="w-full px-4 py-2.5 bg-gray-50/50 border border-gray-200 rounded-xl focus:bg-white focus:border-transparent focus:ring-2 focus:ring-[#243d8a] focus:ring-offset-2 transition-all duration-200 text-gray-700 placeholder-gray-400"
                          placeholder="user@metersquare.com"
                        />
                      </motion.div>
                      {errors.email && (
                        <motion.p
                          initial={{ opacity: 0, y: -5 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="text-xs text-red-500 ml-1"
                        >
                          {errors.email.message}
                        </motion.p>
                      )}
                    </div>
                  )}

                  {/* Submit Button */}
                  <motion.button
                    type="submit"
                    disabled={isSendingOTP}
                    className="w-full bg-[#243d8a] hover:bg-[#243d8a]/90 text-white font-semibold py-2.5 px-6 rounded-lg transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    whileHover={{ scale: isSendingOTP ? 1 : 1.01 }}
                    whileTap={{ scale: isSendingOTP ? 1 : 0.99 }}
                  >
                    {isSendingOTP ? (
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
              ) : (
                <motion.div
                  key="otp-form"
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  className="space-y-4"
                >
                  <div className="text-center mb-4">
                    <div className="w-12 h-12 bg-[#243d8a]/10 rounded-full flex items-center justify-center mx-auto mb-3">
                      {loginMethod === 'phone' ? (
                        <Smartphone className="w-6 h-6 text-[#243d8a]" />
                      ) : (
                        <KeyRound className="w-6 h-6 text-[#243d8a]" />
                      )}
                    </div>
                    <h3 className="font-semibold text-gray-900">Enter OTP</h3>
                    <p className="text-xs text-gray-500 mt-1">
                      We've sent a code to
                    </p>
                    <p className="text-xs font-medium text-[#243d8a] mt-0.5">
                      {loginMethod === 'phone'
                        ? maskPhoneNumber(userPhone, selectedCountryCode.code)
                        : maskEmail(userEmail)
                      }
                    </p>
                  </div>

                  <OTPInput
                    value={otp}
                    onChange={setOtp}
                    onComplete={(otpValue) => {
                      // Auto-verify when 6 digits are entered
                      if (otpValue.length === 6 && !isLoading) {
                        handleVerifyOTP(otpValue);
                      }
                    }}
                    disabled={isLoading}
                  />

                  {otp.length < 6 && (
                    <p className="text-xs text-gray-400 text-center">
                      Enter {6 - otp.length} more digit{6 - otp.length !== 1 ? 's' : ''} • Auto-verifies when complete
                    </p>
                  )}

                  <div className="text-center">
                    {resendTimer > 0 ? (
                      <p className="text-sm text-gray-500">
                        Resend OTP in <span className="font-semibold text-[#243d8a]">{resendTimer}s</span>
                      </p>
                    ) : (
                      <button
                        type="button"
                        onClick={handleResendOTP}
                        className="text-sm font-medium text-[#243d8a] hover:text-[#243d8a]/80"
                      >
                        Resend OTP
                      </button>
                    )}
                  </div>

                  <motion.button
                    onClick={handleVerifyOTP}
                    disabled={isVerifyingOTP || otp.length !== 6}
                    className="w-full bg-[#243d8a] hover:bg-[#243d8a]/90 text-white font-semibold py-2.5 px-6 rounded-lg transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    whileHover={{ scale: isVerifyingOTP ? 1 : 1.01 }}
                    whileTap={{ scale: isVerifyingOTP ? 1 : 0.99 }}
                  >
                    {isVerifyingOTP ? (
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

                  <button
                    type="button"
                    onClick={() => {
                      setStep('email');
                      setOtp('');
                    }}
                    className="w-full text-sm text-gray-500 hover:text-gray-700"
                  >
                    ← Back to email
                  </button>
                </motion.div>
              )}
            </AnimatePresence>

          </motion.div>

          {/* Security Badges */}
          <motion.div
            className="mt-4 flex items-center justify-center gap-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.6 }}
          >
            <div className="flex items-center gap-1.5 text-gray-500">
              <ShieldCheck className="w-4 h-4 text-green-500" />
              <span className="text-xs">SSL Secured</span>
            </div>
            <div className="flex items-center gap-1.5 text-gray-500">
              <Activity className="w-4 h-4 text-[#243d8a]" />
              <span className="text-xs">99.9% Uptime Guaranteed</span>
            </div>
          </motion.div>
        </motion.div>
      </div>

      {/* Right Panel - Modern Workflow Visualization - Slightly smaller for laptop */}
      <div className="hidden lg:flex lg:flex-1 bg-gradient-to-br from-red-50 via-rose-50 to-red-50 relative overflow-hidden items-center justify-center">
        
        {/* Floating Background Elements */}
        <div className="absolute inset-0">
          <motion.div
            className="absolute top-20 left-20 w-60 h-60 bg-red-200/30 rounded-full blur-3xl"
            animate={{ 
              x: [0, 30, 0],
              y: [0, -30, 0]
            }}
            transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
          />
          <motion.div
            className="absolute bottom-20 right-20 w-80 h-80 bg-[#243d8a]/20/30 rounded-full blur-3xl"
            animate={{ 
              x: [0, -30, 0],
              y: [0, 30, 0]
            }}
            transition={{ duration: 12, repeat: Infinity, ease: "easeInOut" }}
          />
        </div>

        {/* Enhanced Analytics Icons with Glass Morphism */}
        <div className="absolute top-6 left-6 right-6 flex justify-between">
          <motion.div
            initial={{ opacity: 0, y: -30, scale: 0.8 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ delay: 0.3, duration: 0.6 }}
            className="bg-gradient-to-br from-white/25 via-white/15 to-white/10 backdrop-blur-xl rounded-2xl p-3 shadow-2xl border border-white/30 -rotate-[5deg]"
          >
            <motion.div
              animate={{ 
                y: [0, -4, 0],
                rotate: [0, 2, -2, 0]
              }}
              transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
              className="relative"
            >
              <LineChart className="w-6 h-6 text-emerald-600 filter drop-shadow-sm" />
              <div className="absolute inset-0 bg-emerald-400/20 blur-xl rounded-full scale-150 animate-pulse"></div>
            </motion.div>
          </motion.div>
          
          <motion.div
            initial={{ opacity: 0, y: -30, scale: 0.8 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ delay: 0.5, duration: 0.6 }}
            className="bg-gradient-to-br from-white/25 via-white/15 to-white/10 backdrop-blur-xl rounded-2xl p-3 shadow-2xl border border-white/30 rotate-3"
          >
            <motion.div
              animate={{ 
                rotate: [0, 360],
                scale: [1, 1.05, 1]
              }}
              transition={{ 
                rotate: { duration: 15, repeat: Infinity, ease: "linear" },
                scale: { duration: 3, repeat: Infinity, ease: "easeInOut" }
              }}
              className="relative"
            >
              <PieChart className="w-6 h-6 text-purple-600 filter drop-shadow-sm" />
              <div className="absolute inset-0 bg-purple-400/20 blur-xl rounded-full scale-150 animate-pulse [animation-delay:1s]"></div>
            </motion.div>
          </motion.div>
          
          <motion.div
            initial={{ opacity: 0, y: -30, scale: 0.8 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ delay: 0.7, duration: 0.6 }}
            className="bg-gradient-to-br from-white/25 via-white/15 to-white/10 backdrop-blur-xl rounded-2xl p-3 shadow-2xl border border-white/30 -rotate-2"
          >
            <motion.div
              animate={{ 
                scale: [1, 1.08, 1],
                rotate: [0, 3, -3, 0]
              }}
              transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
              className="relative"
            >
              <Target className="w-6 h-6 text-indigo-600 filter drop-shadow-sm" />
              <div className="absolute inset-0 bg-indigo-400/20 blur-xl rounded-full scale-150 animate-pulse [animation-delay:2s]"></div>
            </motion.div>
          </motion.div>
        </div>

        {/* Main Workflow Container - Scaled for laptop */}
        <div className="relative w-[750px] h-[500px]">
          
          {/* SVG Connections */}
          <svg className="absolute inset-0 w-full h-full" viewBox="0 0 750 500">
            <defs>
              <linearGradient id="redGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#3b82f6" stopOpacity="0" />
                <stop offset="25%" stopColor="#6366f1" stopOpacity="0.4" />
                <stop offset="50%" stopColor="#8b5cf6" stopOpacity="0.8" />
                <stop offset="75%" stopColor="#a855f7" stopOpacity="0.6" />
                <stop offset="100%" stopColor="#c084fc" stopOpacity="0" />
              </linearGradient>
              
              <linearGradient id="blueGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#10b981" stopOpacity="0.2" />
                <stop offset="50%" stopColor="#3b82f6" stopOpacity="0.7" />
                <stop offset="100%" stopColor="#6366f1" stopOpacity="0.3" />
              </linearGradient>
              
              <radialGradient id="glowGradient" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#8b5cf6" stopOpacity="0.8" />
                <stop offset="40%" stopColor="#6366f1" stopOpacity="0.6" />
                <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.2" />
              </radialGradient>
              
              <filter id="iconGlow" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="4" result="coloredBlur"/>
                <feMerge> 
                  <feMergeNode in="coloredBlur"/>
                  <feMergeNode in="SourceGraphic"/>
                </feMerge>
              </filter>
              
              <filter id="shadowGlow" x="-100%" y="-100%" width="300%" height="300%">
                <feDropShadow dx="0" dy="2" stdDeviation="6" floodColor="#8b5cf6" floodOpacity="0.3"/>
              </filter>
            </defs>
            
            {/* Static Dotted Connection Lines - Scaled */}
            <path
              d="M 120 120 Q 230 120 350 120 T 540 120"
              stroke="#ef4444"
              strokeWidth="2"
              fill="none"
              strokeDasharray="6 6"
              opacity="0.6"
            />
            <path
              d="M 540 120 Q 600 180 540 240"
              stroke="#ef4444"
              strokeWidth="2"
              fill="none"
              strokeDasharray="6 6"
              opacity="0.6"
            />
            <path
              d="M 540 240 Q 430 240 350 240 T 120 240"
              stroke="#ef4444"
              strokeWidth="2"
              fill="none"
              strokeDasharray="6 6"
              opacity="0.6"
            />
            <path
              d="M 120 240 Q 60 300 120 360"
              stroke="#ef4444"
              strokeWidth="2"
              fill="none"
              strokeDasharray="6 6"
              opacity="0.6"
            />
            <path
              d="M 120 360 Q 230 360 350 360 T 540 360"
              stroke="#ef4444"
              strokeWidth="2"
              fill="none"
              strokeDasharray="6 6"
              opacity="0.6"
            />
            
            
            {/* Red Dot - Changes to green when touching ERP Hub */}
            <circle
              r="4"
              filter="url(#iconGlow)"
            >
              <animateMotion
                dur="15s"
                repeatCount="indefinite"
                path="M 120 120 Q 230 120 350 120 T 540 120 Q 600 180 540 240 Q 430 240 350 240 T 120 240 Q 60 300 120 360 Q 230 360 350 360 T 580 360 Q 540 360 350 360 Q 310 350 350 330"
              />
              {/* Changes to green when reaching hub at 310,320 (at 70% of path) */}
              <animate
                attributeName="fill"
                values="#ef4444;#ef4444;#ef4444;#ef4444;#ef4444;#ef4444;#ef4444;#ef4444;#ef4444;#ef4444;#10b981;#10b981;#10b981;#10b981;#10b981"
                dur="15s"
                repeatCount="indefinite"
                keyTimes="0;0.1;0.2;0.3;0.4;0.5;0.6;0.65;0.69;0.7;0.75;0.8;0.85;0.95;1"
              />
              <animate
                attributeName="opacity"
                values="0.8;0.8;0.8;0.8;0.8;0.8;0.8;0.8;0.8;0.8;0.8;0.8;0.8;0.4;0"
                dur="15s"
                repeatCount="indefinite"
                keyTimes="0;0.1;0.2;0.3;0.4;0.5;0.6;0.65;0.7;0.72;0.73;0.8;0.85;0.95;1"
              />
            </circle>
            
            {/* Blue Dot - Changes to green when touching ERP Hub */}
            <circle
              r="4"
              filter="url(#iconGlow)"
            >
              <animateMotion
                dur="15s"
                repeatCount="indefinite"
                begin="2s"
                path="M 120 120 Q 230 120 350 120 T 540 120 Q 600 180 540 240 Q 430 240 350 240 T 120 240 Q 60 300 120 360 Q 230 360 350 360 T 580 360 Q 540 360 350 360 Q 310 350 350 330"
              />
              {/* Changes to green when reaching hub at 310,320 (at 70% of path) */}
              <animate
                attributeName="fill"
                values="#3b82f6;#3b82f6;#3b82f6;#3b82f6;#3b82f6;#3b82f6;#3b82f6;#3b82f6;#3b82f6;#3b82f6;#10b981;#10b981;#10b981;#10b981;#10b981"
                dur="15s"
                begin="2s"
                repeatCount="indefinite"
                keyTimes="0;0.1;0.2;0.3;0.4;0.5;0.6;0.65;0.69;0.7;0.75;0.8;0.85;0.95;1"
              />
              <animate
                attributeName="opacity"
                values="0.8;0.8;0.8;0.8;0.8;0.8;0.8;0.8;0.8;0.8;0.8;0.8;0.8;0.4;0"
                dur="15s"
                begin="2s"
                repeatCount="indefinite"
                keyTimes="0;0.1;0.2;0.3;0.4;0.5;0.6;0.65;0.7;0.72;0.73;0.8;0.85;0.95;1"
              />
            </circle>
          </svg>

          {/* Refined Workflow Nodes - Scaled down */}
          <motion.div
            className="absolute workflow-node left-[80px] top-[80px] -rotate-[3deg]"
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.2, type: "spring" }}
          >
            <motion.div 
              className="bg-white backdrop-blur-sm rounded-xl p-3 shadow-lg border border-gray-200 transition-all duration-300 shine-effect"
              id="node-request"
            >
              <FileText className="w-6 h-6 text-red-500" />
            </motion.div>
            <span className="popup-text">Processing</span>
            <span className="absolute -bottom-6 left-1/2 -translate-x-1/2 text-xs font-medium text-gray-600">Request</span>
          </motion.div>

          <motion.div
            className="absolute workflow-node left-[310px] top-[80px] rotate-[2deg]"
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.4, type: "spring" }}
          >
            <motion.div 
              className="bg-white backdrop-blur-sm rounded-xl p-3 shadow-lg border border-gray-200 transition-all duration-300 shine-effect"
              id="node-review"
            >
              <ClipboardList className="w-6 h-6 text-red-500" />
            </motion.div>
            <span className="popup-text">Reviewing</span>
            <span className="absolute -bottom-6 left-1/2 -translate-x-1/2 text-xs font-medium text-gray-600">Review</span>
          </motion.div>

          <motion.div
            className="absolute workflow-node left-[500px] top-[80px] -rotate-[1deg]"
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.6, type: "spring" }}
          >
            <motion.div 
              className="bg-white backdrop-blur-sm rounded-xl p-3 shadow-lg border border-gray-200 transition-all duration-300 shine-effect"
              id="node-approval"
            >
              <CheckSquare className="w-6 h-6 text-[#243d8a]" />
            </motion.div>
            <span className="popup-text">Approving</span>
            <span className="absolute -bottom-6 left-1/2 -translate-x-1/2 text-xs font-medium text-gray-600">Approval</span>
          </motion.div>

          <motion.div
            className="absolute workflow-node left-[500px] top-[200px] rotate-[3deg]"
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.8, type: "spring" }}
          >
            <motion.div 
              className="bg-white backdrop-blur-sm rounded-xl p-3 shadow-lg border border-gray-200 transition-all duration-300 shine-effect"
              id="node-process"
            >
              <Settings className="w-6 h-6 text-[#243d8a]" />
            </motion.div>
            <span className="popup-text">Executing</span>
            <span className="absolute -bottom-6 left-1/2 -translate-x-1/2 text-xs font-medium text-gray-600">Process</span>
          </motion.div>

          <motion.div
            className="absolute workflow-node left-[310px] top-[200px] -rotate-[2deg]"
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 1, type: "spring" }}
          >
            <motion.div 
              className="bg-white backdrop-blur-sm rounded-xl p-3 shadow-lg border border-gray-200 transition-all duration-300 shine-effect"
              id="node-production"
            >
              <Package className="w-6 h-6 text-red-500" />
            </motion.div>
            <span className="popup-text">Building</span>
            <span className="absolute -bottom-6 left-1/2 -translate-x-1/2 text-xs font-medium text-gray-600">Production</span>
          </motion.div>

          <motion.div
            className="absolute workflow-node left-[80px] top-[200px] rotate-[4deg]"
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 1.2, type: "spring" }}
          >
            <motion.div 
              className="bg-white backdrop-blur-sm rounded-xl p-3 shadow-lg border border-gray-200 transition-all duration-300 shine-effect"
              id="node-dispatch"
            >
              <Truck className="w-6 h-6 text-[#243d8a]" />
            </motion.div>
            <span className="popup-text">Shipping</span>
            <span className="absolute -bottom-6 left-1/2 -translate-x-1/2 text-xs font-medium text-gray-600">Dispatch</span>
          </motion.div>

          <motion.div
            className="absolute workflow-node left-[80px] top-[320px] -rotate-[2deg]"
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 1.4, type: "spring" }}
          >
            <motion.div 
              className="bg-white backdrop-blur-sm rounded-xl p-3 shadow-lg border border-gray-200 transition-all duration-300 shine-effect"
              id="node-complete"
            >
              <CheckCircle className="w-6 h-6 text-green-500" />
            </motion.div>
            <span className="popup-text">Done!</span>
            <span className="absolute -bottom-6 left-1/2 -translate-x-1/2 text-xs font-medium text-gray-600">Complete</span>
          </motion.div>

          {/* ERP Hub - Center Final Position */}
          <motion.div
            className="absolute workflow-node left-[310px] top-[320px]"
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 1.8, type: "spring" }}
          >
            <div
              className="bg-gradient-to-br from-red-500 to-rose-500 rounded-xl p-3 shadow-lg"
              id="node-hub"
            >
              <Layers className="w-6 h-6 text-white" />
            </div>
            <span className="popup-text">Syncing</span>
            <span className="absolute -bottom-6 left-1/2 -translate-x-1/2 text-xs font-semibold text-gray-700">ERP Hub</span>
          </motion.div>
        </div>

        {/* Bottom Info - Compact */}
        <motion.div
          className="absolute bottom-8 left-0 right-0 text-center"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 2 }}
        >
          <h3 className="text-2xl font-bold bg-gradient-to-r from-red-500 to-rose-600 bg-clip-text text-transparent">
            Intelligent Workflow Automation
          </h3>
          <p className="text-gray-600 mt-2 text-sm">Streamline your interior project management</p>
          <div className="flex justify-center gap-6 mt-3">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-red-500" />
              <span className="text-xs text-gray-500">5min Setup</span>
            </div>
            <div className="flex items-center gap-2">
              <Shield className="w-4 h-4 text-[#243d8a]" />
              <span className="text-xs text-gray-500">Secure & Reliable</span>
            </div>
            <div className="flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-green-500" />
              <span className="text-xs text-gray-500">Advanced Analytics</span>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
    </>
  );
};

export { LoginPage };
export default LoginPage;