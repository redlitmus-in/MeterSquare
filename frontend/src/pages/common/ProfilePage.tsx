import React, { useState } from 'react';
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
  XIcon
} from 'lucide-react';
import { useAuthStore } from '@/store/authStore';

const ProfilePage: React.FC = () => {
  const { user, logout } = useAuthStore();
  const [isEditing, setIsEditing] = useState(false);
  const [activeTab, setActiveTab] = useState('profile');
  
  // Form state
  const [formData, setFormData] = useState({
    full_name: user?.full_name || '',
    email: user?.email || '',
    phone: user?.phone || '',
    department: user?.department || '',
    address: user?.address || '',
    bio: user?.bio || ''
  });

  const handleSave = () => {
    // Implementation for saving profile changes
    console.log('Saving profile:', formData);
    setIsEditing(false);
  };

  const handleCancel = () => {
    // Reset form data to original values
    setFormData({
      full_name: user?.full_name || '',
      email: user?.email || '',
      phone: user?.phone || '',
      department: user?.department || '',
      address: user?.address || '',
      bio: user?.bio || ''
    });
    setIsEditing(false);
  };

  const getRoleDisplayName = (roleId: string) => {
    return roleId.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <motion.div 
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-gradient-to-r from-gray-50 to-gray-100 rounded-xl shadow-xl p-6 text-gray-800 border border-gray-200"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            {/* Avatar */}
            <div className="relative">
              {user?.avatar_url ? (
                <img
                  className="h-16 w-16 rounded-full object-cover border-4 border-white shadow-lg"
                  src={user.avatar_url}
                  alt={user.full_name}
                />
              ) : (
                <div className="h-16 w-16 rounded-full bg-gradient-to-br from-[#243d8a] via-purple-500 to-pink-500 flex items-center justify-center border-4 border-white shadow-lg">
                  <span className="text-xl font-bold text-white">
                    {user?.full_name.charAt(0).toUpperCase()}
                  </span>
                </div>
              )}
              <button 
                className="absolute -bottom-1 -right-1 p-2 bg-white rounded-full shadow-lg border border-gray-200 hover:bg-gray-50 transition-colors"
                aria-label="Change profile picture"
                title="Change profile picture"
              >
                <CameraIcon className="w-3 h-3 text-gray-600" />
              </button>
            </div>
            
            <div>
              <h1 className="text-2xl font-bold">{user?.full_name}</h1>
              <p className="text-gray-600">{user?.email}</p>
              <Badge className="mt-1 bg-[#243d8a]/10 text-[#243d8a]/90 border-[#243d8a]/30">
                <BriefcaseIcon className="w-3 h-3 mr-1" />
                {getRoleDisplayName(user?.role_id || '')}
              </Badge>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            {!isEditing ? (
              <Button 
                onClick={() => setIsEditing(true)}
                className="bg-[#243d8a] hover:bg-[#243d8a]/90 text-white flex items-center gap-2"
              >
                <EditIcon className="w-4 h-4" />
                Edit Profile
              </Button>
            ) : (
              <div className="flex gap-2">
                <Button 
                  onClick={handleSave}
                  className="bg-green-600 hover:bg-green-700 text-white flex items-center gap-2"
                >
                  <SaveIcon className="w-4 h-4" />
                  Save
                </Button>
                <Button 
                  onClick={handleCancel}
                  variant="outline"
                  className="flex items-center gap-2"
                >
                  <XIcon className="w-4 h-4" />
                  Cancel
                </Button>
              </div>
            )}
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
          <Card className="shadow-lg border-0">
            <CardHeader className="bg-gradient-to-r from-gray-50 to-gray-100 border-b">
              <CardTitle className="flex items-center gap-2">
                <UserIcon className="w-5 h-5 text-gray-600" />
                Personal Information
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label className="flex items-center gap-2 text-sm font-semibold">
                    <UserIcon className="w-4 h-4 text-gray-500" />
                    Full Name
                  </Label>
                  {isEditing ? (
                    <Input
                      value={formData.full_name}
                      onChange={(e) => setFormData({...formData, full_name: e.target.value})}
                      className="h-11 border-gray-200 focus:border-gray-500"
                    />
                  ) : (
                    <p className="text-gray-900 font-medium p-3 bg-gray-50 rounded-lg">{user?.full_name}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label className="flex items-center gap-2 text-sm font-semibold">
                    <MailIcon className="w-4 h-4 text-gray-500" />
                    Email Address
                  </Label>
                  {isEditing ? (
                    <Input
                      value={formData.email}
                      onChange={(e) => setFormData({...formData, email: e.target.value})}
                      className="h-11 border-gray-200 focus:border-gray-500"
                    />
                  ) : (
                    <p className="text-gray-900 font-medium p-3 bg-gray-50 rounded-lg">{user?.email}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label className="flex items-center gap-2 text-sm font-semibold">
                    <PhoneIcon className="w-4 h-4 text-gray-500" />
                    Phone Number
                  </Label>
                  {isEditing ? (
                    <Input
                      value={formData.phone}
                      onChange={(e) => setFormData({...formData, phone: e.target.value})}
                      placeholder="Enter phone number"
                      className="h-11 border-gray-200 focus:border-gray-500"
                    />
                  ) : (
                    <p className="text-gray-900 font-medium p-3 bg-gray-50 rounded-lg">
                      {user?.phone || 'Not provided'}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label className="flex items-center gap-2 text-sm font-semibold">
                    <BriefcaseIcon className="w-4 h-4 text-gray-500" />
                    Department
                  </Label>
                  {isEditing ? (
                    <Input
                      value={formData.department}
                      onChange={(e) => setFormData({...formData, department: e.target.value})}
                      placeholder="Enter department"
                      className="h-11 border-gray-200 focus:border-gray-500"
                    />
                  ) : (
                    <p className="text-gray-900 font-medium p-3 bg-gray-50 rounded-lg">
                      {user?.department || 'Not specified'}
                    </p>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <Label className="flex items-center gap-2 text-sm font-semibold">
                  <MapPinIcon className="w-4 h-4 text-gray-500" />
                  Address
                </Label>
                {isEditing ? (
                  <textarea
                    value={formData.address}
                    onChange={(e) => setFormData({...formData, address: e.target.value})}
                    placeholder="Enter your address"
                    className="w-full min-h-[80px] p-3 border border-gray-200 rounded-lg focus:border-gray-500 focus:ring-1 focus:ring-gray-500"
                  />
                ) : (
                  <p className="text-gray-900 font-medium p-3 bg-gray-50 rounded-lg min-h-[80px]">
                    {user?.address || 'Not provided'}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label className="flex items-center gap-2 text-sm font-semibold">
                  <UserIcon className="w-4 h-4 text-gray-500" />
                  Bio
                </Label>
                {isEditing ? (
                  <textarea
                    value={formData.bio}
                    onChange={(e) => setFormData({...formData, bio: e.target.value})}
                    placeholder="Tell us about yourself"
                    className="w-full min-h-[100px] p-3 border border-gray-200 rounded-lg focus:border-gray-500 focus:ring-1 focus:ring-gray-500"
                  />
                ) : (
                  <p className="text-gray-900 font-medium p-3 bg-gray-50 rounded-lg min-h-[100px]">
                    {user?.bio || 'No bio provided'}
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Security Tab */}
        <TabsContent value="security">
          <Card className="shadow-lg border-0">
            <CardHeader className="bg-gradient-to-r from-gray-50 to-gray-100 border-b">
              <CardTitle className="flex items-center gap-2">
                <ShieldIcon className="w-5 h-5 text-gray-600" />
                Security Settings
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6 space-y-6">
              <div className="space-y-4">
                <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                  <div className="flex items-center gap-3">
                    <KeyIcon className="w-5 h-5 text-gray-600" />
                    <div>
                      <h3 className="font-medium text-gray-900">Password</h3>
                      <p className="text-sm text-gray-600">Last changed 30 days ago</p>
                    </div>
                  </div>
                  <Button variant="outline">Change Password</Button>
                </div>

                <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                  <div className="flex items-center gap-3">
                    <ShieldIcon className="w-5 h-5 text-gray-600" />
                    <div>
                      <h3 className="font-medium text-gray-900">Two-Factor Authentication</h3>
                      <p className="text-sm text-gray-600">Add an extra layer of security</p>
                    </div>
                  </div>
                  <Badge className="bg-gray-100 text-gray-700 border-gray-300">Not Enabled</Badge>
                </div>

                <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                  <div className="flex items-center gap-3">
                    <CalendarIcon className="w-5 h-5 text-gray-600" />
                    <div>
                      <h3 className="font-medium text-gray-900">Login Sessions</h3>
                      <p className="text-sm text-gray-600">Manage your active sessions</p>
                    </div>
                  </div>
                  <Button variant="outline">View Sessions</Button>
                </div>
              </div>

              <div className="pt-6 border-t border-gray-200">
                <Button 
                  onClick={logout}
                  variant="outline" 
                  className="text-red-600 border-red-300 hover:bg-red-50 hover:border-red-400 flex items-center gap-2"
                >
                  <LogOutIcon className="w-4 h-4" />
                  Sign Out
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Preferences Tab */}
        <TabsContent value="preferences">
          <Card className="shadow-lg border-0">
            <CardHeader className="bg-gradient-to-r from-gray-50 to-gray-100 border-b">
              <CardTitle className="flex items-center gap-2">
                <BellIcon className="w-5 h-5 text-gray-600" />
                Notification Preferences
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6 space-y-6">
              <div className="space-y-4">
                {[
                  { label: 'Purchase Request Notifications', description: 'Get notified about new purchase requests', enabled: true },
                  { label: 'Approval Reminders', description: 'Reminders for pending approvals', enabled: true },
                  { label: 'Project Updates', description: 'Updates about project progress', enabled: false },
                  { label: 'System Maintenance', description: 'Notifications about system maintenance', enabled: true },
                  { label: 'Weekly Reports', description: 'Weekly summary reports', enabled: false }
                ].map((pref, index) => (
                  <div key={index} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                    <div>
                      <h3 className="font-medium text-gray-900">{pref.label}</h3>
                      <p className="text-sm text-gray-600">{pref.description}</p>
                    </div>
                    <div className="flex items-center">
                      <input
                        type="checkbox"
                        defaultChecked={pref.enabled}
                        className="h-4 w-4 text-[#243d8a] border-gray-300 rounded focus:ring-[#243d8a]"
                        aria-label={pref.label}
                        title={pref.label}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Activity Tab */}
        <TabsContent value="activity">
          <Card className="shadow-lg border-0">
            <CardHeader className="bg-gradient-to-r from-gray-50 to-gray-100 border-b">
              <CardTitle className="flex items-center gap-2">
                <CalendarIcon className="w-5 h-5 text-gray-600" />
                Recent Activity
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <div className="space-y-4">
                {[
                  { action: 'Approved purchase request PR-2024-001', time: '2 hours ago', type: 'approval' },
                  { action: 'Updated profile information', time: '1 day ago', type: 'profile' },
                  { action: 'Reviewed vendor quotation VQ-2024-003', time: '2 days ago', type: 'review' },
                  { action: 'Completed task: Site Safety Inspection', time: '3 days ago', type: 'task' },
                  { action: 'Signed in from new device', time: '1 week ago', type: 'security' }
                ].map((activity, index) => (
                  <div key={index} className="flex items-start gap-3 p-3 hover:bg-gray-50 rounded-lg transition-colors">
                    <div className="p-2 bg-[#243d8a]/10 rounded-lg">
                      <CheckIcon className="w-4 h-4 text-[#243d8a]" />
                    </div>
                    <div className="flex-1">
                      <p className="text-gray-900 font-medium">{activity.action}</p>
                      <p className="text-sm text-gray-500">{activity.time}</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default ProfilePage;