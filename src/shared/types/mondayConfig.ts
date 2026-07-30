export interface MondayWorkspaceRef {
  id: string;
  name: string;
}

/**
 * Ids das colunas do grupo Activities de um board, resolvidos por título no
 * import. São gerados por template (`mmXXXX`) — nunca hardcodar.
 */
export interface MondayActivityColumnIds {
  reportedHours: string;
  billingType: string;
  activityType: string;
  projectStage?: string;
  status: string;
  person: string;
}

export interface MondayProjectMapping {
  deskclockProjectId: string;
  mondayBoardId: string;
  mondayBoardName: string;
  /** Grupo "Activities" do board, resolvido pela view homônima no import. */
  activitiesGroupId: string;
  columnIds: MondayActivityColumnIds;
  workspaceId: string;
}

export interface MondayCategoryMapping {
  deskclockCategoryId: string;
  activityTypeLabel: string;
  projectStageLabel?: string;
  workspaceId: string;
}
