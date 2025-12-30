import React, { useState, useRef } from 'react';
import { motion } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  UserIcon,
  EditIcon,
  MailIcon,
  PhoneIcon,
  MapPinIcon,
  BriefcaseIcon,
  CalendarIcon,
  SaveIcon,
  CameraIcon,
  KeyIcon,
  BellIcon,
  ShieldIcon,
  LogOutIcon,
  CheckIcon,
  XIcon,
  HardHat,
  FileText,
  TrendingUp,
  Award,
  Clock,
  AlertCircle,
  Activity
} from 'lucide-react';
import ModernLoadingSpinners from '@/components/ui/ModernLoadingSpinners';
import { useAuthStore } from '@/store/authStore';
import { showSuccess, showError, showWarning, showInfo } from '@/utils/toastHelper';

const ProfilePage: React.FC = () => {
  const { user, logout, updateProfile, isLoading } = useAuthStore();
  const [isEditing, setIsEditing] = useState(false);
  const [activeTab, setActiveTab] = useState('profile');
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Form state
  const [formData, setFormData] = useState({
    full_name: user?.full_name || '',
    email: user?.email || '',
    phone: user?.phone || '',
    department: user?.department || '',
    address: user?.address || '',
    bio: user?.bio || '',
    avatar_url: user?.avatar_url || ''
  });

  const handleSave = async () => {
    try {
      // Validate form
      if (!formData.full_name.trim()) {
        showError('Full name is required');
        return;
      }
      if (!formData.email.trim()) {
        showError('Email is required');
        return;
      }

      // Update profile
      await updateProfile({
        full_name: formData.full_name,
        email: formData.email,
        phone: formData.phone,
        department: formData.department,
        address: formData.address,
        bio: formData.bio,
        avatar_url: formData.avatar_url
      });

      setIsEditing(false);
    } catch (error) {
      console.error('Failed to update profile:', error);
      // Error toast is already shown by authStore
    }
  };

  const handleCancel = () => {
    // Reset form data to original values
    setFormData({
      full_name: user?.full_name || '',
      email: user?.email || '',
      phone: user?.phone || '',
      department: user?.department || '',
      address: user?.address || '',
      bio: user?.bio || '',
      avatar_url: user?.avatar_url || ''
    });
    setIsEditing(false);
  };

  const handleAvatarClick = () => {
    fileInputRef.current?.click();
  };

  const handleAvatarChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      showError('Please select an image file');
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      showError('Image size should be less than 5MB');
      return;
    }

    try {
      setUploading(true);

      // Create a preview URL for immediate feedback
      const reader = new FileReader();
      reader.onloadend = () => {
        setFormData(prev => ({ ...prev, avatar_url: reader.result as string }));
      };
      reader.readAsDataURL(file);

      // TODO: Implement actual upload to server
      // const formData = new FormData();
      // formData.append('avatar', file);
      // const response = await apiWrapper.post('/upload/avatar', formData);
      // setFormData(prev => ({ ...prev, avatar_url: response.url }));

      showSuccess('Avatar updated! Click Save to confirm changes.');
    } catch (error) {
      console.error('Failed to upload avatar:', error);
      showError('Failed to upload avatar');
    } finally {
      setUploading(false);
    }
  };

  const getRoleDisplayName = (roleId: string | number) => {
    const roleMap: Record<number, string> = {
      3: 'Site Engineer',
      4: 'Estimator',
      5: 'Admin',
      6: 'Project Manager',
      7: 'Technical Director',
      8: 'Buyer',
      11: 'MEP Supervisor'
    };

    if (typeof roleId === 'number') {
      return roleMap[roleId] || 'Unknown Role';
    }

    return String(roleId).replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
  };

  const getRoleIcon = (roleId: number | string) => {
    const roleIcons: Record<number, any> = {
      3: HardHat,        // Site Engineer
      4: FileText,       // Estimator
      5: ShieldIcon,     // Admin
      6: TrendingUp,     // Project Manager
      7: Award,          // Technical Director
      8: BriefcaseIcon,  // Buyer
      11: Activity       // MEP Supervisor
    };

    if (typeof roleId === 'number') {
      return roleIcons[roleId] || BriefcaseIcon;
    }
    return BriefcaseIcon;
  };

  const RoleIcon = getRoleIcon(user?.role_id || 0);

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden bg-gradient-to-br from-[#243d8a] via-[#1e3470] to-[#243d8a] rounded-2xl shadow-2xl p-8 text-white"
      >
        {/* Background Pattern */}
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-0 left-0 w-40 h-40 bg-white rounded-full blur-3xl"></div>
          <div className="absolute bottom-0 right-0 w-60 h-60 bg-white rounded-full blur-3xl"></div>
        </div>

        <div className="relative flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="flex items-center gap-6">
            {/* Avatar */}
            <div className="relative group">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleAvatarChange}
                className="hidden"
              />
              {formData.avatar_url ? (
                <img
                  className="h-24 w-24 rounded-2xl object-cover border-4 border-white/20 shadow-xl"
                  src={formData.avatar_url}
                  alt={user?.full_name}
                />
              ) : (
                <div className="h-24 w-24 rounded-2xl bg-gradient-to-br from-white/20 to-white/10 backdrop-blur-sm flex items-center justify-center border-4 border-white/20 shadow-xl">
                  <span className="text-3xl font-bold text-white">
                    {user?.full_name?.charAt(0).toUpperCase()}
                  </span>
                </div>
              )}
              <button
                onClick={handleAvatarClick}
                disabled={uploading || isLoading}
                className="absolute inset-0 flex items-center justify-center bg-black/60 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity disabled:cursor-not-allowed"
                aria-label="Change profile picture"
                title="Change profile picture"
              >
                {uploading ? (
                  <ModernLoadingSpinners size="sm" />
                ) : (
                  <CameraIcon className="w-6 h-6 text-white" />
                )}
              </button>
            </div>

            <div>
              <h1 className="text-3xl font-bold mb-1">{user?.full_name}</h1>
              <p className="text-white/80 mb-2 flex items-center gap-2">
                <MailIcon className="w-4 h-4" />
                {user?.email}
              </p>
              <div className="flex items-center gap-2">
                <Badge className="bg-white/20 text-white border-white/30 backdrop-blur-sm px-3 py-1">
                  <RoleIcon className="w-4 h-4 mr-1.5" />
                  {getRoleDisplayName(user?.role || user?.role_name || '')}
                </Badge>
                {user?.is_active && (
                  <Badge className="bg-green-500/30 text-white border-green-400/50 backdrop-blur-sm px-3 py-1">
                    <div className="w-2 h-2 bg-green-400 rounded-full mr-1.5 animate-pulse" />
                    Active
                  </Badge>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {!isEditing ? (
              <Button
                onClick={() => setIsEditing(true)}
                className="bg-white/10 hover:bg-white/20 text-white border border-white/30 backdrop-blur-sm flex items-center gap-2 shadow-lg"
              >
                <EditIcon className="w-4 h-4" />
                Edit Profile
              </Button>
            ) : (
              <div className="flex gap-2">
                <Button
                  onClick={handleSave}
                  disabled={isLoading}
                  className="bg-green-600 hover:bg-green-700 text-white flex items-center gap-2 shadow-lg"
                >
                  {isLoading ? (
                    <>
                      <ModernLoadingSpinners size="xs" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <SaveIcon className="w-4 h-4" />
                      Save Changes
                    </>
                  )}
                </Button>
                <Button
                  onClick={handleCancel}
                  disabled={isLoading}
                  variant="outline"
                  className="bg-white/10 hover:bg-white/20 text-white border border-white/30 flex items-center gap-2"
                >
                  <XIcon className="w-4 h-4" />
                  Cancel
                </Button>
              </div>
            )}
          </div>
        </div>

        {/* Quick Stats */}
        <div className="relative mt-6 grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 border border-white/20">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-white/20 rounded-lg">
                <Clock className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="text-xs text-white/70">Member Since</p>
                <p className="font-semibold text-white">
                  {user?.created_at ? new Date(user.created_at).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : 'N/A'}
                </p>
              </div>
            </div>
          </div>
          <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 border border-white/20">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-white/20 rounded-lg">
                <CalendarIcon className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="text-xs text-white/70">Last Updated</p>
                <p className="font-semibold text-white">
                  {user?.updated_at ? new Date(user.updated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'N/A'}
                </p>
              </div>
            </div>
          </div>
          <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 border border-white/20">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-white/20 rounded-lg">
                <BriefcaseIcon className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="text-xs text-white/70">Department</p>
                <p className="font-semibold text-white truncate">{user?.department || 'Not Set'}</p>
              </div>
            </div>
          </div>
          <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 border border-white/20">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-white/20 rounded-lg">
                <Award className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="text-xs text-white/70">Status</p>
                <p className="font-semibold text-white">{user?.user_status || 'Online'}</p>
              </div>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid grid-cols-4 w-full max-w-2xl bg-white shadow-sm border">
          <TabsTrigger value="profile" className="data-[state=active]:bg-gray-50">
            <UserIcon className="w-4 h-4 mr-2" />
            Profile
          </TabsTrigger>
          <TabsTrigger value="security" className="data-[state=active]:bg-gray-50">
            <ShieldIcon className="w-4 h-4 mr-2" />
            Security
          </TabsTrigger>
          <TabsTrigger value="preferences" className="data-[state=active]:bg-gray-50">
            <BellIcon className="w-4 h-4 mr-2" />
            Preferences
          </TabsTrigger>
          <TabsTrigger value="activity" className="data-[state=active]:bg-gray-50">
            <CalendarIcon className="w-4 h-4 mr-2" />
            Activity
          </TabsTrigger>
        </TabsList>

        {/* Profile Tab */}
        <TabsContent value="profile">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Main Profile Info */}
            <div className="lg:col-span-2">
              <Card className="shadow-lg border-0">
                <CardHeader className="bg-gradient-to-r from-[#243d8a]/5 to-[#243d8a]/10 border-b">
                  <CardTitle className="flex items-center gap-2 text-[#243d8a]">
                    <UserIcon className="w-5 h-5" />
                    Personal Information
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-6 space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <Label className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                        <UserIcon className="w-4 h-4 text-[#243d8a]" />
                        Full Name *
                      </Label>
                      {isEditing ? (
                        <Input
                          value={formData.full_name}
                          onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                          className="h-11 border-gray-300 focus:border-[#243d8a] focus:ring-[#243d8a]"
                          required
                        />
                      ) : (
                        <p className="text-gray-900 font-medium p-3 bg-gradient-to-r from-gray-50 to-gray-100 rounded-lg border border-gray-200">
                          {user?.full_name}
                        </p>
                      )}
                    </div>

                    <div className="space-y-2">
                      <Label className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                        <MailIcon className="w-4 h-4 text-[#243d8a]" />
                        Email Address *
                      </Label>
                      {isEditing ? (
                        <Input
                          type="email"
                          value={formData.email}
                          onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                          className="h-11 border-gray-300 focus:border-[#243d8a] focus:ring-[#243d8a]"
                          required
                        />
                      ) : (
                        <p className="text-gray-900 font-medium p-3 bg-gradient-to-r from-gray-50 to-gray-100 rounded-lg border border-gray-200">
                          {user?.email}
                        </p>
                      )}
                    </div>

                    <div className="space-y-2">
                      <Label className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                        <PhoneIcon className="w-4 h-4 text-[#243d8a]" />
                        Phone Number
                      </Label>
                      {isEditing ? (
                        <Input
                          type="tel"
                          value={formData.phone}
                          onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                          placeholder="+1 (555) 000-0000"
                          className="h-11 border-gray-300 focus:border-[#243d8a] focus:ring-[#243d8a]"
                        />
                      ) : (
                        <p className="text-gray-900 font-medium p-3 bg-gradient-to-r from-gray-50 to-gray-100 rounded-lg border border-gray-200">
                          {user?.phone || <span className="text-gray-400 italic">Not provided</span>}
                        </p>
                      )}
                    </div>

                    <div className="space-y-2">
                      <Label className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                        <BriefcaseIcon className="w-4 h-4 text-[#243d8a]" />
                        Department
                      </Label>
                      {isEditing ? (
                        <Input
                          value={formData.department}
                          onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                          placeholder="e.g., Construction, Engineering"
                          className="h-11 border-gray-300 focus:border-[#243d8a] focus:ring-[#243d8a]"
                        />
                      ) : (
                        <p className="text-gray-900 font-medium p-3 bg-gradient-to-r from-gray-50 to-gray-100 rounded-lg border border-gray-200">
                          {user?.department || <span className="text-gray-400 italic">Not specified</span>}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                      <MapPinIcon className="w-4 h-4 text-[#243d8a]" />
                      Address
                    </Label>
                    {isEditing ? (
                      <textarea
                        value={formData.address}
                        onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                        placeholder="Enter your full address"
                        className="w-full min-h-[80px] p-3 border border-gray-300 rounded-lg focus:border-[#243d8a] focus:ring-1 focus:ring-[#243d8a] resize-none"
                      />
                    ) : (
                      <p className="text-gray-900 font-medium p-3 bg-gradient-to-r from-gray-50 to-gray-100 rounded-lg border border-gray-200 min-h-[80px]">
                        {user?.address || <span className="text-gray-400 italic">Not provided</span>}
                      </p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                      <FileText className="w-4 h-4 text-[#243d8a]" />
                      Professional Bio
                    </Label>
                    {isEditing ? (
                      <textarea
                        value={formData.bio}
                        onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
                        placeholder="Tell us about your professional background and expertise..."
                        className="w-full min-h-[120px] p-3 border border-gray-300 rounded-lg focus:border-[#243d8a] focus:ring-1 focus:ring-[#243d8a] resize-none"
                      />
                    ) : (
                      <p className="text-gray-900 font-medium p-3 bg-gradient-to-r from-gray-50 to-gray-100 rounded-lg border border-gray-200 min-h-[120px] whitespace-pre-wrap">
                        {user?.bio || <span className="text-gray-400 italic">No bio provided</span>}
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Role-Specific Quick Info */}
            <div className="space-y-6">
              <Card className="shadow-lg border-0">
                <CardHeader className="bg-gradient-to-r from-[#243d8a]/5 to-[#243d8a]/10 border-b">
                  <CardTitle className="flex items-center gap-2 text-[#243d8a]">
                    <Award className="w-5 h-5" />
                    Account Details
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-6 space-y-4">
                  <div className="flex items-center justify-between p-3 bg-gradient-to-r from-gray-50 to-gray-100 rounded-lg border border-gray-200">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-[#243d8a]/10 rounded-lg">
                        <RoleIcon className="w-4 h-4 text-[#243d8a]" />
                      </div>
                      <div>
                        <p className="text-xs text-gray-600 font-medium">Role</p>
                        <p className="text-sm font-semibold text-gray-900">{getRoleDisplayName(user?.role || user?.role_name || '')}</p>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between p-3 bg-gradient-to-r from-gray-50 to-gray-100 rounded-lg border border-gray-200">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-green-500/10 rounded-lg">
                        <CheckIcon className="w-4 h-4 text-green-600" />
                      </div>
                      <div>
                        <p className="text-xs text-gray-600 font-medium">Account Status</p>
                        <p className="text-sm font-semibold text-gray-900">
                          {user?.is_active ? 'Active' : 'Inactive'}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between p-3 bg-gradient-to-r from-gray-50 to-gray-100 rounded-lg border border-gray-200">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-blue-500/10 rounded-lg">
                        <CalendarIcon className="w-4 h-4 text-blue-600" />
                      </div>
                      <div>
                        <p className="text-xs text-gray-600 font-medium">Joined Date</p>
                        <p className="text-sm font-semibold text-gray-900">
                          {user?.created_at ? new Date(user.created_at).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric'
                          }) : 'N/A'}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="pt-4 border-t border-gray-200">
                    <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                      <div className="flex items-start gap-2">
                        <AlertCircle className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
                        <div className="flex-1">
                          <p className="text-xs font-semibold text-blue-900 mb-1">Profile Tip</p>
                          <p className="text-xs text-blue-700">
                            Keep your profile updated to improve collaboration with your team members.
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        {/* Security Tab */}
        <TabsContent value="security">
          <Card className="shadow-lg border-0">
            <CardHeader className="bg-gradient-to-r from-[#243d8a]/5 to-[#243d8a]/10 border-b">
              <CardTitle className="flex items-center gap-2 text-[#243d8a]">
                <ShieldIcon className="w-5 h-5" />
                Security Settings
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6 space-y-6">
              <div className="space-y-4">
                <motion.div
                  whileHover={{ scale: 1.01 }}
                  className="flex items-center justify-between p-5 bg-gradient-to-r from-gray-50 to-gray-100 rounded-xl border border-gray-200 hover:shadow-md transition-all"
                >
                  <div className="flex items-center gap-4">
                    <div className="p-3 bg-[#243d8a]/10 rounded-xl">
                      <KeyIcon className="w-6 h-6 text-[#243d8a]" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900">Password</h3>
                      <p className="text-sm text-gray-600">Manage your account password</p>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    className="border-[#243d8a] text-[#243d8a] hover:bg-[#243d8a] hover:text-white"
                  >
                    Change Password
                  </Button>
                </motion.div>

                <motion.div
                  whileHover={{ scale: 1.01 }}
                  className="flex items-center justify-between p-5 bg-gradient-to-r from-gray-50 to-gray-100 rounded-xl border border-gray-200 hover:shadow-md transition-all"
                >
                  <div className="flex items-center gap-4">
                    <div className="p-3 bg-orange-500/10 rounded-xl">
                      <ShieldIcon className="w-6 h-6 text-orange-600" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900">Two-Factor Authentication</h3>
                      <p className="text-sm text-gray-600">Add an extra layer of security to your account</p>
                    </div>
                  </div>
                  <Badge className="bg-orange-100 text-orange-700 border-orange-300 px-3 py-1">Not Enabled</Badge>
                </motion.div>

                <motion.div
                  whileHover={{ scale: 1.01 }}
                  className="flex items-center justify-between p-5 bg-gradient-to-r from-gray-50 to-gray-100 rounded-xl border border-gray-200 hover:shadow-md transition-all"
                >
                  <div className="flex items-center gap-4">
                    <div className="p-3 bg-blue-500/10 rounded-xl">
                      <CalendarIcon className="w-6 h-6 text-blue-600" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900">Login Sessions</h3>
                      <p className="text-sm text-gray-600">Manage and monitor your active sessions</p>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    className="border-blue-600 text-blue-600 hover:bg-blue-600 hover:text-white"
                  >
                    View Sessions
                  </Button>
                </motion.div>
              </div>

              <div className="pt-6 border-t border-gray-200">
                <div className="flex items-center justify-between p-4 bg-red-50 rounded-xl border border-red-200">
                  <div className="flex items-center gap-3">
                    <AlertCircle className="w-5 h-5 text-red-600" />
                    <div>
                      <h3 className="font-semibold text-red-900">Sign Out</h3>
                      <p className="text-sm text-red-700">End your current session</p>
                    </div>
                  </div>
                  <Button
                    onClick={logout}
                    variant="outline"
                    className="text-red-600 border-red-300 hover:bg-red-600 hover:text-white flex items-center gap-2"
                  >
                    <LogOutIcon className="w-4 h-4" />
                    Sign Out
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Preferences Tab */}
        <TabsContent value="preferences">
          <Card className="shadow-lg border-0">
            <CardHeader className="bg-gradient-to-r from-[#243d8a]/5 to-[#243d8a]/10 border-b">
              <CardTitle className="flex items-center gap-2 text-[#243d8a]">
                <BellIcon className="w-5 h-5" />
                Notification Preferences
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6 space-y-6">
              <div className="space-y-3">
                {[
                  {
                    label: 'BOQ & Estimation Updates',
                    description: 'Get notified about BOQ changes and estimation updates',
                    enabled: true,
                    icon: FileText,
                    color: 'blue'
                  },
                  {
                    label: 'Purchase Request Notifications',
                    description: 'Alerts for new purchase requests and approvals',
                    enabled: true,
                    icon: BriefcaseIcon,
                    color: 'green'
                  },
                  {
                    label: 'Project Milestones',
                    description: 'Updates about project progress and milestones',
                    enabled: true,
                    icon: TrendingUp,
                    color: 'purple'
                  },
                  {
                    label: 'Team Assignments',
                    description: 'Notifications when you are assigned to new projects',
                    enabled: false,
                    icon: Award,
                    color: 'orange'
                  },
                  {
                    label: 'Approval Reminders',
                    description: 'Reminders for pending approvals and actions',
                    enabled: true,
                    icon: CheckIcon,
                    color: 'teal'
                  },
                  {
                    label: 'System Announcements',
                    description: 'Important updates and system maintenance notices',
                    enabled: true,
                    icon: AlertCircle,
                    color: 'red'
                  },
                  {
                    label: 'Weekly Reports',
                    description: 'Receive weekly summary of your projects and tasks',
                    enabled: false,
                    icon: CalendarIcon,
                    color: 'indigo'
                  }
                ].map((pref, index) => {
                  const Icon = pref.icon;
                  const colorClasses = {
                    blue: 'bg-blue-500/10 text-blue-600',
                    green: 'bg-green-500/10 text-green-600',
                    purple: 'bg-purple-500/10 text-purple-600',
                    orange: 'bg-orange-500/10 text-orange-600',
                    teal: 'bg-teal-500/10 text-teal-600',
                    red: 'bg-red-500/10 text-red-600',
                    indigo: 'bg-indigo-500/10 text-indigo-600'
                  }[pref.color];

                  return (
                    <motion.div
                      key={index}
                      whileHover={{ scale: 1.01 }}
                      className="flex items-center justify-between p-4 bg-gradient-to-r from-gray-50 to-gray-100 rounded-xl border border-gray-200 hover:shadow-md transition-all"
                    >
                      <div className="flex items-center gap-4 flex-1">
                        <div className={`p-2.5 ${colorClasses} rounded-lg`}>
                          <Icon className="w-5 h-5" />
                        </div>
                        <div className="flex-1">
                          <h3 className="font-semibold text-gray-900">{pref.label}</h3>
                          <p className="text-sm text-gray-600">{pref.description}</p>
                        </div>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          defaultChecked={pref.enabled}
                          className="sr-only peer"
                        />
                        <div className="w-11 h-6 bg-gray-300 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-[#243d8a]/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#243d8a]"></div>
                      </label>
                    </motion.div>
                  );
                })}
              </div>

              <div className="pt-4 border-t border-gray-200">
                <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl">
                  <div className="flex items-start gap-3">
                    <BellIcon className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
                    <div>
                      <h4 className="font-semibold text-blue-900 mb-1">Notification Settings</h4>
                      <p className="text-sm text-blue-700">
                        You can customize your notification preferences here. Changes will be saved automatically.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Activity Tab */}
        <TabsContent value="activity">
          <Card className="shadow-lg border-0">
            <CardHeader className="bg-gradient-to-r from-[#243d8a]/5 to-[#243d8a]/10 border-b">
              <CardTitle className="flex items-center gap-2 text-[#243d8a]">
                <CalendarIcon className="w-5 h-5" />
                Recent Activity
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <div className="space-y-3">
                {[
                  {
                    action: 'Reviewed and approved BOQ revision',
                    details: 'Project: Metropolitan Tower Construction',
                    time: '2 hours ago',
                    icon: CheckIcon,
                    color: 'green'
                  },
                  {
                    action: 'Updated profile information',
                    details: 'Modified contact details and bio',
                    time: '1 day ago',
                    icon: UserIcon,
                    color: 'blue'
                  },
                  {
                    action: 'Submitted material purchase request',
                    details: 'PR-2024-156 for cement and steel',
                    time: '2 days ago',
                    icon: FileText,
                    color: 'purple'
                  },
                  {
                    action: 'Completed site inspection task',
                    details: 'Foundation inspection - Phase 2',
                    time: '3 days ago',
                    icon: HardHat,
                    color: 'orange'
                  },
                  {
                    action: 'Approved vendor quotation',
                    details: 'VQ-2024-089 - ABC Suppliers Ltd.',
                    time: '4 days ago',
                    icon: TrendingUp,
                    color: 'teal'
                  },
                  {
                    action: 'Assigned to new project',
                    details: 'Riverside Commercial Complex',
                    time: '5 days ago',
                    icon: Award,
                    color: 'indigo'
                  },
                  {
                    action: 'Password changed successfully',
                    details: 'Security update from trusted device',
                    time: '1 week ago',
                    icon: ShieldIcon,
                    color: 'red'
                  }
                ].map((activity, index) => {
                  const Icon = activity.icon;
                  const colorMap = {
                    green: { bg: 'bg-green-500/10', text: 'text-green-600', border: 'border-green-200' },
                    blue: { bg: 'bg-blue-500/10', text: 'text-blue-600', border: 'border-blue-200' },
                    purple: { bg: 'bg-purple-500/10', text: 'text-purple-600', border: 'border-purple-200' },
                    orange: { bg: 'bg-orange-500/10', text: 'text-orange-600', border: 'border-orange-200' },
                    teal: { bg: 'bg-teal-500/10', text: 'text-teal-600', border: 'border-teal-200' },
                    indigo: { bg: 'bg-indigo-500/10', text: 'text-indigo-600', border: 'border-indigo-200' },
                    red: { bg: 'bg-red-500/10', text: 'text-red-600', border: 'border-red-200' }
                  };
                  const colorClasses = colorMap[activity.color as keyof typeof colorMap] || colorMap.blue;

                  return (
                    <motion.div
                      key={index}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.05 }}
                      whileHover={{ scale: 1.01, x: 4 }}
                      className={`flex items-start gap-4 p-4 bg-gradient-to-r from-gray-50 to-gray-100 rounded-xl border ${colorClasses.border} hover:shadow-md transition-all cursor-pointer`}
                    >
                      <div className={`p-3 ${colorClasses.bg} rounded-xl flex-shrink-0`}>
                        <Icon className={`w-5 h-5 ${colorClasses.text}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-gray-900 font-semibold mb-1">{activity.action}</p>
                        <p className="text-sm text-gray-600 mb-1">{activity.details}</p>
                        <div className="flex items-center gap-2 text-xs text-gray-500">
                          <Clock className="w-3 h-3" />
                          <span>{activity.time}</span>
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </div>

              <div className="mt-6 pt-6 border-t border-gray-200">
                <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
                  <div className="flex items-center gap-3">
                    <CalendarIcon className="w-5 h-5 text-gray-600" />
                    <div>
                      <p className="font-semibold text-gray-900">Activity Log</p>
                      <p className="text-sm text-gray-600">Showing recent 7 activities</p>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    className="border-[#243d8a] text-[#243d8a] hover:bg-[#243d8a] hover:text-white"
                  >
                    View All
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

// ✅ PERFORMANCE: Wrap with React.memo to prevent unnecessary re-renders (912 lines)
export default React.memo(ProfilePage);