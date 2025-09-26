import { create } from 'zustand';
import { Project, ProjectCreate, ProjectUpdate, ProjectStatus, ProjectProgress } from '@/types';
import { apiWrapper, API_ENDPOINTS } from '@/api/config';
import { toast } from 'sonner';

interface ProjectState {
  projects: Project[];
  currentProject: Project | null;
  projectProgress: ProjectProgress[];
  isLoading: boolean;
  error: string | null;
  
  // Actions
  fetchProjects: (filters?: any) => Promise<void>;
  fetchProject: (id: string) => Promise<void>;
  createProject: (projectData: ProjectCreate) => Promise<void>;
  updateProject: (id: string, projectData: ProjectUpdate) => Promise<void>;
  deleteProject: (id: string) => Promise<void>;
  fetchProjectProgress: (id: string) => Promise<any>;
  fetchAllProjectsProgress: () => Promise<void>;
  clearError: () => void;
  setCurrentProject: (project: Project | null) => void;
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  projects: [],
  currentProject: null,
  projectProgress: [],
  isLoading: false,
  error: null,

  fetchProjects: async (filters = {}) => {
    try {
      set({ isLoading: true, error: null });
      
      const projects = await apiWrapper.get<Project[]>(
        API_ENDPOINTS.PROJECTS.LIST,
        filters
      );

      set({
        projects,
        isLoading: false,
        error: null,
      });
    } catch (error: any) {
      const errorMessage = error.response?.data?.detail || 'Failed to fetch projects';
      set({
        error: errorMessage,
        isLoading: false,
      });
      toast.error(errorMessage);
    }
  },

  fetchProject: async (id: string) => {
    try {
      set({ isLoading: true, error: null });
      
      const project = await apiWrapper.get<Project>(
        API_ENDPOINTS.PROJECTS.GET(id)
      );

      set({
        currentProject: project,
        isLoading: false,
        error: null,
      });
    } catch (error: any) {
      const errorMessage = error.response?.data?.detail || 'Failed to fetch project';
      set({
        error: errorMessage,
        isLoading: false,
      });
      toast.error(errorMessage);
    }
  },

  createProject: async (projectData: ProjectCreate) => {
    try {
      set({ isLoading: true, error: null });
      
      const newProject = await apiWrapper.post<Project>(
        API_ENDPOINTS.PROJECTS.CREATE,
        projectData
      );

      set((state) => ({
        projects: [newProject, ...state.projects],
        isLoading: false,
        error: null,
      }));

      toast.success('Project created successfully!');
    } catch (error: any) {
      const errorMessage = error.response?.data?.detail || 'Failed to create project';
      set({
        error: errorMessage,
        isLoading: false,
      });
      toast.error(errorMessage);
      throw error;
    }
  },

  updateProject: async (id: string, projectData: ProjectUpdate) => {
    try {
      set({ isLoading: true, error: null });
      
      const updatedProject = await apiWrapper.put<Project>(
        API_ENDPOINTS.PROJECTS.UPDATE(id),
        projectData
      );

      set((state) => ({
        projects: state.projects.map(p => p.id === id ? updatedProject : p),
        currentProject: state.currentProject?.id === id ? updatedProject : state.currentProject,
        isLoading: false,
        error: null,
      }));

      toast.success('Project updated successfully!');
    } catch (error: any) {
      const errorMessage = error.response?.data?.detail || 'Failed to update project';
      set({
        error: errorMessage,
        isLoading: false,
      });
      toast.error(errorMessage);
      throw error;
    }
  },

  deleteProject: async (id: string) => {
    try {
      set({ isLoading: true, error: null });
      
      await apiWrapper.delete(API_ENDPOINTS.PROJECTS.DELETE(id));

      set((state) => ({
        projects: state.projects.filter(p => p.id !== id),
        currentProject: state.currentProject?.id === id ? null : state.currentProject,
        isLoading: false,
        error: null,
      }));

      toast.success('Project deleted successfully!');
    } catch (error: any) {
      const errorMessage = error.response?.data?.detail || 'Failed to delete project';
      set({
        error: errorMessage,
        isLoading: false,
      });
      toast.error(errorMessage);
      throw error;
    }
  },

  fetchProjectProgress: async (id: string) => {
    try {
      const progress = await apiWrapper.get(API_ENDPOINTS.PROJECTS.PROGRESS(id));
      return progress;
    } catch (error: any) {
      const errorMessage = error.response?.data?.detail || 'Failed to fetch project progress';
      toast.error(errorMessage);
      throw error;
    }
  },

  fetchAllProjectsProgress: async () => {
    try {
      set({ isLoading: true, error: null });
      
      const projectProgress = await apiWrapper.get<ProjectProgress[]>(
        API_ENDPOINTS.ANALYTICS.PROJECTS_PROGRESS
      );

      set({
        projectProgress,
        isLoading: false,
        error: null,
      });
    } catch (error: any) {
      const errorMessage = error.response?.data?.detail || 'Failed to fetch projects progress';
      set({
        error: errorMessage,
        isLoading: false,
      });
      toast.error(errorMessage);
    }
  },

  clearError: () => set({ error: null }),
  
  setCurrentProject: (project: Project | null) => set({ currentProject: project }),
}));