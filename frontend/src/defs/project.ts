import { IDocument } from "sync";

//
// Defines a project.
//
export interface IProject extends IDocument {
  //
  // The name of the project.
  //
  name: string;
}
