export interface ClockifyUser {
  id: string;
  name: string;
  email: string;
  defaultWorkspace: string;
}

export interface ClockifyWorkspace {
  id: string;
  name: string;
}

export interface ClockifyProject {
  id: string;
  name: string;
  clientName?: string | null;
  archived: boolean;
}

export interface ClockifyTag {
  id: string;
  name: string;
  archived: boolean;
}

export interface ClockifyTimeEntryPayload {
  start: string;
  end: string;
  description: string;
  projectId?: string;
  tagIds?: string[];
  billable: boolean;
}

export interface ClockifyTimeEntry {
  id: string;
}

export interface ClockifyHydratedProject {
  id: string;
  name: string;
  clientName?: string | null;
  color?: string;
}

export interface ClockifyHydratedTag {
  id: string;
  name: string;
}

export interface ClockifyTimeEntryFull {
  id: string;
  description: string;
  projectId: string | null;
  tagIds: string[];
  billable: boolean;
  timeInterval: {
    start: string;
    end: string | null;
    duration: string | null;
  };
  project?: ClockifyHydratedProject | null;
  tags?: ClockifyHydratedTag[];
}
