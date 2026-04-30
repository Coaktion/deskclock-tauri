export interface ClockifyWorkspaceRef {
  id: string;
  name: string;
}

export interface ClockifyProjectMapping {
  deskclockProjectId: string;
  clockifyProjectId: string;
  clockifyProjectName: string;
  workspaceId: string;
}

export interface ClockifyCategoryMapping {
  deskclockCategoryId: string;
  clockifyTagIds: string[];
  workspaceId: string;
}
