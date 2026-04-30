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
