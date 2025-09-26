import { create } from 'zustand';
import { Task, TaskCreate, TaskUpdate, TaskStatus, Priority } from '@/types';
import { apiWrapper, API_ENDPOINTS } from '@/api/config';
import { toast } from 'sonner';

interface TaskState {
  tasks: Task[];
  myTasks: Task[];
  currentTask: Task | null;
  isLoading: boolean;
  error: string | null;
  
  // Actions
  fetchTasks: (filters?: any) => Promise<void>;
  fetchMyTasks: (status?: TaskStatus) => Promise<void>;
  fetchTask: (id: string) => Promise<void>;
  createTask: (taskData: TaskCreate) => Promise<void>;
  updateTask: (id: string, taskData: TaskUpdate) => Promise<void>;
  deleteTask: (id: string) => Promise<void>;
  markTaskComplete: (id: string, actualHours?: number) => Promise<void>;
  clearError: () => void;
  setCurrentTask: (task: Task | null) => void;
}

export const useTaskStore = create<TaskState>((set, get) => ({
  tasks: [],
  myTasks: [],
  currentTask: null,
  isLoading: false,
  error: null,

  fetchTasks: async (filters = {}) => {
    try {
      set({ isLoading: true, error: null });
      
      const tasks = await apiWrapper.get<Task[]>(
        API_ENDPOINTS.TASKS.LIST,
        filters
      );

      set({
        tasks,
        isLoading: false,
        error: null,
      });
    } catch (error: any) {
      const errorMessage = error.response?.data?.detail || 'Failed to fetch tasks';
      set({
        error: errorMessage,
        isLoading: false,
      });
      toast.error(errorMessage);
    }
  },

  fetchMyTasks: async (status?: TaskStatus) => {
    try {
      set({ isLoading: true, error: null });
      
      const params = status ? { status } : {};
      const myTasks = await apiWrapper.get<Task[]>(
        API_ENDPOINTS.TASKS.MY_TASKS,
        params
      );

      set({
        myTasks,
        isLoading: false,
        error: null,
      });
    } catch (error: any) {
      const errorMessage = error.response?.data?.detail || 'Failed to fetch your tasks';
      set({
        error: errorMessage,
        isLoading: false,
      });
      toast.error(errorMessage);
    }
  },

  fetchTask: async (id: string) => {
    try {
      set({ isLoading: true, error: null });
      
      const task = await apiWrapper.get<Task>(
        API_ENDPOINTS.TASKS.GET(id)
      );

      set({
        currentTask: task,
        isLoading: false,
        error: null,
      });
    } catch (error: any) {
      const errorMessage = error.response?.data?.detail || 'Failed to fetch task';
      set({
        error: errorMessage,
        isLoading: false,
      });
      toast.error(errorMessage);
    }
  },

  createTask: async (taskData: TaskCreate) => {
    try {
      set({ isLoading: true, error: null });
      
      const newTask = await apiWrapper.post<Task>(
        API_ENDPOINTS.TASKS.CREATE,
        taskData
      );

      set((state) => ({
        tasks: [newTask, ...state.tasks],
        isLoading: false,
        error: null,
      }));

      toast.success('Task created successfully!');
    } catch (error: any) {
      const errorMessage = error.response?.data?.detail || 'Failed to create task';
      set({
        error: errorMessage,
        isLoading: false,
      });
      toast.error(errorMessage);
      throw error;
    }
  },

  updateTask: async (id: string, taskData: TaskUpdate) => {
    try {
      set({ isLoading: true, error: null });
      
      const updatedTask = await apiWrapper.put<Task>(
        API_ENDPOINTS.TASKS.UPDATE(id),
        taskData
      );

      set((state) => ({
        tasks: state.tasks.map(t => t.id === id ? updatedTask : t),
        myTasks: state.myTasks.map(t => t.id === id ? updatedTask : t),
        currentTask: state.currentTask?.id === id ? updatedTask : state.currentTask,
        isLoading: false,
        error: null,
      }));

      toast.success('Task updated successfully!');
    } catch (error: any) {
      const errorMessage = error.response?.data?.detail || 'Failed to update task';
      set({
        error: errorMessage,
        isLoading: false,
      });
      toast.error(errorMessage);
      throw error;
    }
  },

  deleteTask: async (id: string) => {
    try {
      set({ isLoading: true, error: null });
      
      await apiWrapper.delete(API_ENDPOINTS.TASKS.DELETE(id));

      set((state) => ({
        tasks: state.tasks.filter(t => t.id !== id),
        myTasks: state.myTasks.filter(t => t.id !== id),
        currentTask: state.currentTask?.id === id ? null : state.currentTask,
        isLoading: false,
        error: null,
      }));

      toast.success('Task deleted successfully!');
    } catch (error: any) {
      const errorMessage = error.response?.data?.detail || 'Failed to delete task';
      set({
        error: errorMessage,
        isLoading: false,
      });
      toast.error(errorMessage);
      throw error;
    }
  },

  markTaskComplete: async (id: string, actualHours?: number) => {
    try {
      const updateData: TaskUpdate = {
        status: TaskStatus.COMPLETED,
        actual_hours: actualHours,
      };

      await get().updateTask(id, updateData);
    } catch (error) {
      throw error;
    }
  },

  clearError: () => set({ error: null }),
  
  setCurrentTask: (task: Task | null) => set({ currentTask: task }),
}));