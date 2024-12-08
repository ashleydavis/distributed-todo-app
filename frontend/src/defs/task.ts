import { IDocument } from "sync";

//
// Defines a task.
//
export interface ITask extends IDocument {
  //
  // The timestamp when the task was created.
  //
  timestamp: number;

  //
  // The description of the task.
  //
  description: string;

  //
  // Whether the task is completed.
  //
  completed: boolean;

  //
  // The id of the project the task belongs to.
  //
  projectId?: string;
}
