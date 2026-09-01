import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { ProjectSectionWithItems, ProjectItem, ProjectSection } from '@/types/project';
import { toast } from 'sonner';

// project_sections / project_items were added after types generation (see
// integrations/supabase/types.ts) — cast to any, same pattern as
// lib/savedRoutes.ts.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

const QUERY_KEY = ['project-sections'];

export function useProjects() {
  return useQuery<ProjectSectionWithItems[]>({
    queryKey: QUERY_KEY,
    queryFn: async () => {
      const [sectionsRes, itemsRes] = await Promise.all([
        db.from('project_sections').select('*').order('position', { ascending: true }),
        db.from('project_items').select('*').order('position', { ascending: true }),
      ]);
      if (sectionsRes.error) throw sectionsRes.error;
      if (itemsRes.error) throw itemsRes.error;

      const sections = (sectionsRes.data ?? []) as unknown as ProjectSection[];
      const items = (itemsRes.data ?? []) as unknown as ProjectItem[];

      return sections.map((section) => ({
        ...section,
        items: items.filter((item) => item.section_id === section.id),
      }));
    },
  });
}

export function useCreateProjectSection() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ name, position }: { name: string; position: number }) => {
      const { error } = await db.from('project_sections').insert({ name, position });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
    onError: (err) => toast.error(`Failed to add section: ${err instanceof Error ? err.message : 'unknown error'}`),
  });
}

export function useUpdateProjectSection() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<Pick<ProjectSection, 'name' | 'position'>> }) => {
      const { error } = await db.from('project_sections').update(patch).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
    onError: (err) => toast.error(`Failed to update section: ${err instanceof Error ? err.message : 'unknown error'}`),
  });
}

export function useDeleteProjectSection() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.from('project_sections').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
    onError: (err) => toast.error(`Failed to delete section: ${err instanceof Error ? err.message : 'unknown error'}`),
  });
}

export function useCreateProjectItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ sectionId, position }: { sectionId: string; position: number }) => {
      const { error } = await db.from('project_items').insert({ section_id: sectionId, position });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
    onError: (err) => toast.error(`Failed to add item: ${err instanceof Error ? err.message : 'unknown error'}`),
  });
}

export function useUpdateProjectItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<ProjectItem> }) => {
      const { error } = await db.from('project_items').update(patch).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
    onError: (err) => toast.error(`Failed to update item: ${err instanceof Error ? err.message : 'unknown error'}`),
  });
}

export function useDeleteProjectItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.from('project_items').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
    onError: (err) => toast.error(`Failed to delete item: ${err instanceof Error ? err.message : 'unknown error'}`),
  });
}
