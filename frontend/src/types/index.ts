// Base Types
export interface BaseEntity {
  id: string;
  created_at: string;
  updated_at: string;
}

// User Types - matching database exactly (camelCase)
export enum UserRole {
  SITE_ENGINEER = 'siteEngineer',
  MEP_SUPERVISOR = 'mepSupervisor',
  PROCUREMENT = 'procurement',
  PROJECT_MANAGER = 'projectManager',
  DESIGN = 'design',
  ESTIMATION = 'estimation',
  ESTIMATOR = 'estimator',
  ACCOUNTS = 'accounts',
  TECHNICAL_DIRECTOR = 'technicalDirector',
}

export interface User extends BaseEntity {
  email: string;
  full_name: string;
  role_id: UserRole | number | string; // Can be numeric ID from backend or role string
  role_name?: string; // Optional role name from backend
  department?: string;
  phone?: string;
  avatar_url?: string;
  address?: string;
  bio?: string;
  is_active: boolean;
  user_status?: string; // 'online' | 'offline'
}

export interface UserCreate {
  email: string;
  password: string;
  full_name: string;
  role_id: UserRole;
  department?: string;
  phone?: string;
  avatar_url?: string;
}

export interface UserUpdate {
  full_name?: string;
  department?: string;
  phone?: string;
  avatar_url?: string;
  address?: string;
  bio?: string;
}

// Role Types
export interface Role {
  id: string;
  title: string;
  tier: string;
  color: string;
  icon: string;
  description?: string;
}

// Process Types
export interface Process {
  id: string;
  role_id: string;
  name: string;
  description?: string;
  frequency: string;
  icon?: string;
  approval_limit?: string;
  steps?: string[];
}

export interface ProcessConnection {
  id: string;
  from_role: string;
  from_process: string;
  to_role: string;
  to_process: string;
  connection_type: 'command' | 'approval' | 'feedback' | 'data';
}

// Project Types
export enum ProjectStatus {
  PLANNING = 'planning',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  ON_HOLD = 'on_hold',
}

export interface Project extends BaseEntity {
  name: string;
  description?: string;
  client_name?: string;
  project_manager_id?: string;
  status: ProjectStatus;
  start_date?: string;
  end_date?: string;
  budget?: number;
  actual_cost: number;
}

export interface ProjectCreate {
  name: string;
  description?: string;
  client_name?: string;
  project_manager_id?: string;
  start_date?: string;
  end_date?: string;
  budget?: number;
}

export interface ProjectUpdate {
  name?: string;
  description?: string;
  client_name?: string;
  status?: ProjectStatus;
  start_date?: string;
  end_date?: string;
  budget?: number;
  actual_cost?: number;
}

// Task Types
export enum TaskStatus {
  PENDING = 'pending',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  REJECTED = 'rejected',
}

export enum Priority {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  URGENT = 'urgent',
}

export interface Task extends BaseEntity {
  project_id: string;
  process_id: string;
  assigned_to: string;
  created_by: string;
  title: string;
  description?: string;
  status: TaskStatus;
  priority: Priority;
  due_date?: string;
  completed_at?: string;
  estimated_hours?: number;
  actual_hours?: number;
}

export interface TaskCreate {
  project_id: string;
  process_id: string;
  assigned_to: string;
  title: string;
  description?: string;
  priority?: Priority;
  due_date?: string;
  estimated_hours?: number;
}

export interface TaskUpdate {
  title?: string;
  description?: string;
  status?: TaskStatus;
  priority?: Priority;
  due_date?: string;
  estimated_hours?: number;
  actual_hours?: number;
}

// Purchase Request Types
export interface PurchaseRequest extends BaseEntity {
  project_id: string;
  requested_by: string;
  approved_by?: string;
  item_name: string;
  description?: string;
  quantity: number;
  unit_price: number;
  total_amount: number;
  vendor_name?: string;
  status: string;
  approval_level?: string;
}

export interface PurchaseRequestCreate {
  project_id: string;
  item_name: string;
  description?: string;
  quantity: number;
  unit_price: number;
  vendor_name?: string;
}

// Authentication Types
export interface LoginRequest {
  email: string;
  password: string;
  role?: string; // Optional for development role testing
}

export interface LoginResponse {
  access_token: string;
  token_type: string;
  user: User;
}

// Dashboard Types
export interface DashboardStats {
  total_projects: number;
  active_projects: number;
  pending_tasks: number;
  completed_tasks: number;
  pending_approvals: number;
  total_budget: number;
  actual_spend: number;
}

export interface ProjectProgress {
  project_id: string;
  project_name: string;
  progress_percentage: number;
  tasks_completed: number;
  total_tasks: number;
  budget_used: number;
  total_budget: number;
}

// Notification Types
export interface Notification extends BaseEntity {
  user_id: string;
  title: string;
  message: string;
  type: string;
  related_table?: string;
  related_id?: string;
  is_read: boolean;
}

// API Response Types
export interface ApiResponse<T> {
  data: T;
  message?: string;
  success: boolean;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  total_pages: number;
}

// Component Props Types
export interface ComponentProps {
  className?: string;
  children?: React.ReactNode;
}

// Form Types
export interface FormFieldProps {
  label: string;
  name: string;
  type?: string;
  placeholder?: string;
  required?: boolean;
  className?: string;
}

// Layout Types
export interface LayoutProps {
  children: React.ReactNode;
  title?: string;
  showSidebar?: boolean;
}

// Navigation Types
export interface NavItem {
  name: string;
  href: string;
  icon: React.ComponentType<any>;
  current?: boolean;
  badge?: number;
  children?: NavItem[];
}

// Chart Types
export interface ChartData {
  name: string;
  value: number;
  color?: string;
}

// Filter Types
export interface FilterOptions {
  status?: string[];
  priority?: string[];
  role?: string[];
  date_range?: {
    start: string;
    end: string;
  };
}