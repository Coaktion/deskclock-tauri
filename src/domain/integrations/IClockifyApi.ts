import type {
  ClockifyUser,
  ClockifyWorkspace,
  ClockifyProject,
  ClockifyTag,
  ClockifyTimeEntry,
  ClockifyTimeEntryFull,
  ClockifyTimeEntryPayload,
} from "@shared/types/clockify";

export interface IClockifyApi {
  getUser(): Promise<ClockifyUser>;
  listWorkspaces(): Promise<ClockifyWorkspace[]>;
  listProjects(workspaceId: string): Promise<ClockifyProject[]>;
  listTags(workspaceId: string): Promise<ClockifyTag[]>;
  createTimeEntry(workspaceId: string, entry: ClockifyTimeEntryPayload): Promise<ClockifyTimeEntry>;
  listTimeEntries(
    workspaceId: string,
    userId: string,
    start: string,
    end: string
  ): Promise<ClockifyTimeEntryFull[]>;
  updateTimeEntry(
    workspaceId: string,
    entryId: string,
    payload: ClockifyTimeEntryPayload
  ): Promise<ClockifyTimeEntryFull>;
  deleteTimeEntry(workspaceId: string, entryId: string): Promise<void>;
}
